import { test, expect } from "@playwright/test";
import { loginViaApi, getFirstBrandId, trpcMutation } from "./_helpers";

const ARTICLE_SLA_MS = 60_000;

test.describe("article creation (文章建立)", () => {
  // testCaption is documented as ≤8s wall; SLA is 60s to absorb provider
  // slowness, cold connections, etc.
  test.setTimeout(ARTICLE_SLA_MS + 30_000);

  test(`positioningJobs.testCaption produces a Facebook post within ${ARTICLE_SLA_MS / 1000}s`, async ({ request }) => {
    const login = await loginViaApi(request);
    expect(login.status, `login body=${JSON.stringify(login.body)}`).toBe(200);

    const brand = await getFirstBrandId(request);
    console.log(`[article] using brand id=${brand.id} name=${brand.name}`);

    const topic = `e2e 自動測試 — 介紹 ${brand.name} 主力產品（${new Date().toISOString().slice(11, 19)}）`;

    const r = await trpcMutation<
      { brandId: number; topic: string; platform: "facebook" | "instagram" | "youtube" | "tiktok" | "linkedin" | "email" },
      { ok: boolean; caption?: string; error?: string; hasKnowledge?: boolean; hasPositioning?: boolean }
    >(request, "positioningJobs.testCaption", {
      brandId: brand.id,
      topic,
      platform: "facebook",
    });

    console.log(`[article] testCaption HTTP=${r.status} duration=${r.durationMs}ms`);
    expect(r.status, `body=${JSON.stringify(r.body).slice(0, 500)}`).toBe(200);
    expect(r.data?.ok, `testCaption returned ok=false error="${r.data?.error}"`).toBe(true);
    expect(r.durationMs, `testCaption took ${r.durationMs}ms — exceeds ${ARTICLE_SLA_MS}ms SLA`).toBeLessThanOrEqual(ARTICLE_SLA_MS);

    const caption = r.data?.caption ?? "";
    expect(caption.length, `caption is empty`).toBeGreaterThan(20);

    console.log(`[article] hasPositioning=${r.data?.hasPositioning} hasKnowledge=${r.data?.hasKnowledge}`);
    console.log(`[article] caption preview: ${caption.slice(0, 120).replace(/\n/g, " ")}…`);
  });

  test(`positioningJobs.testCaption rejects empty topic with validation error`, async ({ request }) => {
    const login = await loginViaApi(request);
    expect(login.status).toBe(200);

    const brand = await getFirstBrandId(request);

    const r = await trpcMutation<
      { brandId: number; topic: string; platform: "facebook" },
      any
    >(request, "positioningJobs.testCaption", {
      brandId: brand.id,
      topic: "",
      platform: "facebook",
    });

    // Zod min(1) → tRPC returns 400 (BAD_REQUEST) for input validation
    expect([400, 200]).toContain(r.status);
    if (r.status === 400) {
      // Standard tRPC validation error path
      expect(JSON.stringify(r.body)).toMatch(/error|BAD_REQUEST|too_small/i);
    } else {
      // Some setups surface app-level error; should still indicate failure
      expect(r.data?.ok).toBe(false);
    }
  });
});
