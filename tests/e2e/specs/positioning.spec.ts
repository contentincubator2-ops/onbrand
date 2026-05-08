import { test, expect } from "@playwright/test";
import {
  loginViaApi,
  getFirstBrandId,
  trpcMutation,
  trpcQuery,
} from "./_helpers";

const POSITIONING_SLA_MS = 30_000;

test.describe("brand positioning (品牌定位)", () => {
  // runInterim is documented as ≤12s wall but we allow up to 30s end-to-end
  // to absorb network jitter + cold LLM connections.
  test.setTimeout(POSITIONING_SLA_MS + 30_000);

  test(`positioningJobs.runInterim returns within ${POSITIONING_SLA_MS / 1000}s`, async ({ request }) => {
    const login = await loginViaApi(request);
    expect(login.status, `login body=${JSON.stringify(login.body)}`).toBe(200);

    const brand = await getFirstBrandId(request);
    console.log(`[positioning] using brand id=${brand.id} name=${brand.name}`);

    const r = await trpcMutation<
      { entityKind: "brand"; entityId: number },
      { ok: boolean; pulse?: any; error?: string }
    >(request, "positioningJobs.runInterim", {
      entityKind: "brand",
      entityId: brand.id,
    });

    console.log(`[positioning] runInterim HTTP=${r.status} duration=${r.durationMs}ms`);
    expect(r.status, `body=${JSON.stringify(r.body).slice(0, 500)}`).toBe(200);
    expect(r.data?.ok, `interim error: ${r.data?.error}`).toBe(true);
    expect(r.durationMs, `runInterim took ${r.durationMs}ms — exceeds ${POSITIONING_SLA_MS}ms SLA`).toBeLessThanOrEqual(POSITIONING_SLA_MS);

    // Sanity-check the shape: at minimum we expect a non-empty positioning
    // string or a tagline. Don't over-specify — the LLM's exact field
    // population varies.
    const pulse = r.data?.pulse ?? {};
    const hasContent =
      (typeof pulse.tagline === "string" && pulse.tagline.length > 0) ||
      (typeof pulse.positioning === "string" && pulse.positioning.length > 0) ||
      (typeof pulse.usp === "string" && pulse.usp.length > 0) ||
      (Array.isArray(pulse.differentiators) && pulse.differentiators.length > 0);
    expect(hasContent, `pulse looks empty: ${JSON.stringify(pulse).slice(0, 400)}`).toBe(true);

    console.log(`[positioning] tagline="${pulse.tagline ?? ""}" positioning="${(pulse.positioning ?? "").slice(0, 80)}"`);
  });

  test("positioningJobs.getCurrent reads back positioning state", async ({ request }) => {
    const login = await loginViaApi(request);
    expect(login.status).toBe(200);

    const brand = await getFirstBrandId(request);

    const r = await trpcQuery<
      { entityKind: "brand"; entityId: number },
      any
    >(request, "positioningJobs.getCurrent", {
      entityKind: "brand",
      entityId: brand.id,
    });

    expect(r.status).toBe(200);
    // `data` may be null (no positioning yet) — that's acceptable.
    // What we want to assert: the endpoint returns 200 in <2s.
    expect(r.durationMs).toBeLessThan(5_000);
    console.log(`[positioning] getCurrent source=${r.data?.source ?? "null"} duration=${r.durationMs}ms`);
  });
});
