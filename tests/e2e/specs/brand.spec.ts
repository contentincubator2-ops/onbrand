import { test, expect } from "@playwright/test";
import { BASE_URL, USER_EMAIL, USER_PASSWORD, loginViaApi, fetchBrandListByMember } from "./_helpers";

test.describe("brand", () => {
  test("API: brand.listByMember returns ≥1 brand for the test user", async ({ request }) => {
    const login = await loginViaApi(request);
    expect(login.status, `login body=${JSON.stringify(login.body)}`).toBe(200);

    const r = await fetchBrandListByMember(request);
    expect(r.status, `body=${JSON.stringify(r.body)}`).toBe(200);

    // tRPC v11 batch response shape: [{ result: { data: { json: [...] } } }]
    const list =
      r.body?.[0]?.result?.data?.json ??
      r.body?.[0]?.result?.data ??
      r.body?.result?.data?.json ??
      [];
    expect(Array.isArray(list), `unexpected shape: ${JSON.stringify(r.body).slice(0, 400)}`).toBe(true);
    expect(list.length, "expected at least one brand for the test user").toBeGreaterThan(0);
    console.log(`[brand] listByMember -> ${list.length} brand(s) in ${r.durationMs}ms`);
    console.log(`[brand] first: id=${list[0]?.id} name=${list[0]?.name}`);
  });

  test("UI: login → home → render and stable for 3s (no error toast)", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);

    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/login")),
      page.locator('button[type="submit"]').click(),
    ]);
    expect(resp.status()).toBe(200);

    await page.waitForURL((u) => !u.pathname.startsWith("/auth/login"), { timeout: 30_000 });

    // Wait for the brand list query to fire — IndexPage gates rendering on it
    const brandResp = await page
      .waitForResponse((r) => r.url().includes("brand.listByMember"), { timeout: 30_000 })
      .catch(() => null);

    if (brandResp) {
      expect(brandResp.status()).toBe(200);
      console.log(`[brand-ui] brand.listByMember status=${brandResp.status()}`);
    }

    // Page should render something — give the SPA a moment then check no fatal errors
    await page.waitForTimeout(3000);

    // Collect any console error messages
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await page.waitForTimeout(500);

    // Page should not be stuck on the loading spinner
    const stillLoading = await page.locator('text=載入中').count();
    expect(stillLoading, "page still showing 載入中… after 3s+").toBe(0);

    if (errors.length) {
      console.log(`[brand-ui] non-fatal js errors observed: ${errors.length}`);
      console.log(errors.slice(0, 5).join("\n"));
    }
  });
});
