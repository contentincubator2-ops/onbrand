import { test, expect } from "@playwright/test";
import { BASE_URL, USER_EMAIL, USER_PASSWORD, loginViaApi } from "./_helpers";

test.describe("auth", () => {
  test("POST /api/auth/login returns 200 + session cookie for known user", async ({ request }) => {
    const r = await loginViaApi(request);
    expect(r.status, `body=${JSON.stringify(r.body)}`).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(r.body?.user?.email).toBe(USER_EMAIL);
    expect(r.setCookieHeader ?? "").toMatch(/session=/);
    console.log(`[auth] login OK in ${r.durationMs}ms`);
  });

  test("POST /api/auth/login rejects bad password with 401", async ({ request }) => {
    const r = await loginViaApi(request, USER_EMAIL, "definitely-wrong-password");
    expect(r.status).toBe(401);
    expect(typeof r.body?.error).toBe("string");
  });

  test("POST /api/auth/login rejects malformed email with 400", async ({ request }) => {
    const r = await loginViaApi(request, "not-an-email", "anything");
    expect(r.status).toBe(400);
  });

  test("UI: login page loads and login form submits, lands on /", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);

    // Wait for the login response so we know auth succeeded before the SPA redirect
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST"),
      page.locator('button[type="submit"]').click(),
    ]);
    expect(resp.status()).toBe(200);

    // Login page hard-redirects via window.location.href = "/"
    await page.waitForURL((url) => url.pathname === "/" || url.pathname.startsWith("/onboarding") || url.pathname.startsWith("/m/") || url.pathname.startsWith("/b/"), { timeout: 30_000 });

    // Sanity: we're no longer on /auth/login
    expect(page.url()).not.toContain("/auth/login");
  });
});
