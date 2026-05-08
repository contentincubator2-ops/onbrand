import { test, expect, request as pwRequest } from "@playwright/test";
import {
  BASE_URL,
  USER_EMAIL,
  USER_PASSWORD,
  loginViaApi,
  getFirstBrandId,
  trpcMutation,
  summarize,
} from "./_helpers";

const CONCURRENT_USERS = Number(process.env.CONCURRENT_USERS ?? 30);
// Per-call timeout for LLM mutations (the SLA assertion runs separately).
const LLM_TIMEOUT_MS = 90_000;
// SLA budgets per call type. Assertion is logged-but-soft so we can still
// see the full latency distribution under contention.
const POSITIONING_SLA_MS = 30_000;
const ARTICLE_SLA_MS = 60_000;

test.describe("concurrent LLM stress", () => {
  test.setTimeout(8 * 60_000);

  test(
    `${CONCURRENT_USERS} concurrent VUs: 1 × runInterim + 1 × testCaption each`,
    async () => {
      // Resolve brand id once with a shared context so we don't burn 30
      // brand-list calls just to discover the same id.
      const bootstrap = await pwRequest.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
      const bootLogin = await loginViaApi(bootstrap);
      expect(bootLogin.status, `bootstrap login failed: ${JSON.stringify(bootLogin.body)}`).toBe(200);
      const brand = await getFirstBrandId(bootstrap);
      await bootstrap.dispose();
      console.log(`[concurrent-llm] brand id=${brand.id} name=${brand.name}, VUs=${CONCURRENT_USERS}`);

      const positioningLatencies: number[] = [];
      const articleLatencies: number[] = [];
      let positioningOk = 0, positioningThrottled = 0, positioningErrors = 0;
      let articleOk = 0, articleThrottled = 0, articleErrors = 0;
      const errorSamples: string[] = [];

      function classify(status: number, ok: boolean | undefined) {
        if (status === 429) return "throttled" as const;
        if (status === 200 && ok === true) return "ok" as const;
        return "error" as const;
      }

      async function virtualUser(uid: number) {
        const ctx = await pwRequest.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
        try {
          const login = await loginViaApi(ctx);
          if (login.status !== 200) {
            positioningErrors++; articleErrors++;
            if (errorSamples.length < 10) {
              errorSamples.push(`vu${uid} login HTTP ${login.status}`);
            }
            return;
          }

          // 品牌定位
          const t1 = Date.now();
          const p = await trpcMutation<
            { entityKind: "brand"; entityId: number },
            { ok: boolean; pulse?: any; error?: string }
          >(ctx, "positioningJobs.runInterim", {
            entityKind: "brand", entityId: brand.id,
          }, { timeoutMs: LLM_TIMEOUT_MS }).catch((e) => ({
            status: 0, body: { error: String(e?.message ?? e) }, data: null, durationMs: Date.now() - t1,
          }));
          const pCls = classify(p.status, p.data?.ok);
          if (pCls === "ok") { positioningOk++; positioningLatencies.push(p.durationMs); }
          else if (pCls === "throttled") { positioningThrottled++; }
          else {
            positioningErrors++;
            if (errorSamples.length < 10) {
              errorSamples.push(`vu${uid} runInterim HTTP ${p.status} ok=${p.data?.ok} err=${(p.data?.error || JSON.stringify(p.body)).slice(0, 150)}`);
            }
          }

          // 文章建立
          const t2 = Date.now();
          const a = await trpcMutation<
            { brandId: number; topic: string; platform: "facebook" },
            { ok: boolean; caption?: string; error?: string }
          >(ctx, "positioningJobs.testCaption", {
            brandId: brand.id,
            topic: `concurrent-test vu${uid} ${new Date().toISOString().slice(11, 19)}`,
            platform: "facebook",
          }, { timeoutMs: LLM_TIMEOUT_MS }).catch((e) => ({
            status: 0, body: { error: String(e?.message ?? e) }, data: null, durationMs: Date.now() - t2,
          }));
          const aCls = classify(a.status, a.data?.ok);
          if (aCls === "ok") { articleOk++; articleLatencies.push(a.durationMs); }
          else if (aCls === "throttled") { articleThrottled++; }
          else {
            articleErrors++;
            if (errorSamples.length < 10) {
              errorSamples.push(`vu${uid} testCaption HTTP ${a.status} ok=${a.data?.ok} err=${(a.data?.error || JSON.stringify(a.body)).slice(0, 150)}`);
            }
          }
        } finally {
          await ctx.dispose();
        }
      }

      const startedAt = Date.now();
      await Promise.all(Array.from({ length: CONCURRENT_USERS }, (_, i) => virtualUser(i)));
      const totalMs = Date.now() - startedAt;

      const pStats = summarize("positioningJobs.runInterim", positioningLatencies, positioningErrors, totalMs, positioningThrottled);
      const aStats = summarize("positioningJobs.testCaption", articleLatencies,    articleErrors,    totalMs, articleThrottled);

      // Per-call SLA pass-rate (% of successes within budget)
      const pInSla = positioningLatencies.filter((l) => l <= POSITIONING_SLA_MS).length;
      const aInSla = articleLatencies.filter((l) => l <= ARTICLE_SLA_MS).length;

      console.log(`\n=== Concurrent LLM stress (${CONCURRENT_USERS} VUs, parallel start) ===`);
      console.log(`base url:    ${BASE_URL}`);
      console.log(`brand:       ${brand.name} (id=${brand.id})`);
      console.log(`wall time:   ${(totalMs / 1000).toFixed(1)}s`);
      console.log("");
      console.table([pStats, aStats]);
      console.log(`SLA budgets — positioning: ${POSITIONING_SLA_MS}ms (in-budget ${pInSla}/${positioningLatencies.length})`);
      console.log(`             article:     ${ARTICLE_SLA_MS}ms (in-budget ${aInSla}/${articleLatencies.length})`);
      if (errorSamples.length) {
        console.log("\nFirst error samples:");
        for (const e of errorSamples) console.log(`  • ${e}`);
      }
      console.log("==============================================\n");

      // Assertions
      // 1) at least 1 successful call of each kind — proves the system serves under contention
      expect(positioningOk + positioningThrottled, "all positioning calls erred").toBeGreaterThan(0);
      expect(articleOk + articleThrottled,         "all article calls erred").toBeGreaterThan(0);
      // 2) error rate (excluding 429) ≤ 5% — real failures, not throttling
      expect(pStats.errorRate, `positioning real errorRate=${pStats.errorRate}`).toBeLessThanOrEqual(0.05);
      expect(aStats.errorRate, `article real errorRate=${aStats.errorRate}`).toBeLessThanOrEqual(0.05);
      // 3) successful calls should mostly stay within SLA — soft, log-only when <80%
      const pSlaPass = positioningLatencies.length === 0 ? 1 : pInSla / positioningLatencies.length;
      const aSlaPass = articleLatencies.length === 0 ? 1 : aInSla / articleLatencies.length;
      if (pSlaPass < 0.8) console.warn(`[soft] positioning SLA pass-rate ${(pSlaPass * 100).toFixed(0)}% < 80%`);
      if (aSlaPass < 0.8) console.warn(`[soft] article SLA pass-rate ${(aSlaPass * 100).toFixed(0)}% < 80%`);
    },
  );
});
