import { test, expect, request as pwRequest } from "@playwright/test";
import {
  BASE_URL,
  USER_EMAIL,
  USER_PASSWORD,
  loginViaApi,
  fetchBrandListByMember,
  summarize,
} from "./_helpers";

const STRESS_USERS = Number(process.env.STRESS_USERS ?? 10);
const STRESS_DURATION_SEC = Number(process.env.STRESS_DURATION_SEC ?? 30);
// per-VU think-time. With 10 VUs and ~1 req/s/VU we hit ~10 rps, comfortably
// under prod's 100-req/min /api rate limit. Override to push harder.
const STRESS_THINK_MS = Number(process.env.STRESS_THINK_MS ?? 1000);

test.describe("stress", () => {
  test.setTimeout((STRESS_DURATION_SEC + 60) * 1000);

  test(`light load: ${STRESS_USERS} VUs × ${STRESS_DURATION_SEC}s (think-time ${STRESS_THINK_MS}ms)`, async () => {
    const startedAt = Date.now();
    const deadline = startedAt + STRESS_DURATION_SEC * 1000;

    const loginLatencies: number[] = [];
    const brandLatencies: number[] = [];
    let loginErrors = 0;
    let loginThrottled = 0;
    let brandErrors = 0;
    let brandThrottled = 0;
    const errorSamples: string[] = [];

    function classify(status: number): "ok" | "throttled" | "error" {
      if (status === 200) return "ok";
      if (status === 429) return "throttled";
      return "error";
    }

    async function virtualUser(uid: number) {
      const ctx = await pwRequest.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
      try {
        const login = await loginViaApi(ctx, USER_EMAIL, USER_PASSWORD);
        const loginCls = classify(login.status);
        if (loginCls === "ok") loginLatencies.push(login.durationMs);
        else if (loginCls === "throttled") loginThrottled++;
        else {
          loginErrors++;
          if (errorSamples.length < 10) {
            errorSamples.push(
              `vu${uid} login HTTP ${login.status}: ${JSON.stringify(login.body).slice(0, 200)}`,
            );
          }
          return;
        }

        while (Date.now() < deadline) {
          const r = await fetchBrandListByMember(ctx);
          const cls = classify(r.status);
          if (cls === "ok") brandLatencies.push(r.durationMs);
          else if (cls === "throttled") brandThrottled++;
          else {
            brandErrors++;
            if (errorSamples.length < 10) {
              errorSamples.push(
                `vu${uid} brand HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`,
              );
            }
          }
          await new Promise((res) => setTimeout(res, STRESS_THINK_MS));
        }
      } finally {
        await ctx.dispose();
      }
    }

    const vus = Array.from({ length: STRESS_USERS }, (_, i) => virtualUser(i));
    await Promise.all(vus);
    const totalMs = Date.now() - startedAt;

    const loginStats = summarize("login", loginLatencies, loginErrors, totalMs, loginThrottled);
    const brandStats = summarize("brand.listByMember", brandLatencies, brandErrors, totalMs, brandThrottled);

    console.log("\n=== Stress test report ===");
    console.log(`base url:       ${BASE_URL}`);
    console.log(`virtual users:  ${STRESS_USERS}`);
    console.log(`duration:       ${STRESS_DURATION_SEC}s (actual ${(totalMs / 1000).toFixed(1)}s)`);
    console.log(`think-time/VU:  ${STRESS_THINK_MS}ms`);
    console.log("");
    console.table([loginStats, brandStats]);
    if (errorSamples.length) {
      console.log("\nFirst error / unexpected-status samples:");
      for (const e of errorSamples) console.log(`  • ${e}`);
    }
    console.log("=========================\n");

    // Hard assertions: real errors only (5xx, network, 4xx other than 429).
    // 429 is healthy rate-limit behavior — tracked but not failed on.
    expect(loginStats.errorRate, `login errorRate ${loginStats.errorRate}`).toBeLessThanOrEqual(0.01);
    expect(brandStats.errorRate, `brand errorRate ${brandStats.errorRate}`).toBeLessThanOrEqual(0.01);
    expect(brandStats.successes, "no successful brand calls").toBeGreaterThan(0);

    // Soft latency budgets — log warnings only.
    if (brandStats.p95_ms > 2000) {
      console.warn(`[soft] brand p95 ${brandStats.p95_ms}ms > 2000ms budget`);
    }
    if (loginStats.p95_ms > 3000) {
      console.warn(`[soft] login p95 ${loginStats.p95_ms}ms > 3000ms budget`);
    }
  });
});
