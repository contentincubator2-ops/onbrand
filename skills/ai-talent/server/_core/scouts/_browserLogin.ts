/**
 * Shared login helpers for Tier C (browser-login) scouts.
 *
 * These scouts drive a Browserbase session through a real login flow. The
 * helpers here try best-effort selectors and bail gracefully when the page
 * structure changes — scout-level code always treats login failure as
 * "return empty items", never throws.
 */

import type { Page } from "playwright-core";

export interface LoginResult {
  ok: boolean;
  reason?: string;
}

export interface LoginOpts {
  usernameSelectors: string[];
  passwordSelectors: string[];
  submitSelectors: string[];
  /** CSS that must be visible after success (a dashboard marker). */
  successSelectors: string[];
  /** Optional: selectors that indicate a failure (bad creds, captcha). */
  failureSelectors?: string[];
  /** ms to wait for success/failure signal */
  timeoutMs?: number;
}

/**
 * Generic form login. Tries each selector in order; first match wins.
 */
export async function formLogin(
  page: Page,
  username: string,
  password: string,
  opts: LoginOpts
): Promise<LoginResult> {
  const timeoutMs = opts.timeoutMs ?? 25_000;

  try {
    // Fill username
    let userFilled = false;
    for (const sel of opts.usernameSelectors) {
      try {
        const el = await page.waitForSelector(sel, { timeout: 5_000, state: "visible" });
        if (el) {
          await el.fill(username);
          userFilled = true;
          break;
        }
      } catch { /* try next */ }
    }
    if (!userFilled) return { ok: false, reason: "username input not found" };

    // Fill password
    let passFilled = false;
    for (const sel of opts.passwordSelectors) {
      try {
        const el = await page.waitForSelector(sel, { timeout: 5_000, state: "visible" });
        if (el) {
          await el.fill(password);
          passFilled = true;
          break;
        }
      } catch { /* try next */ }
    }
    if (!passFilled) return { ok: false, reason: "password input not found" };

    // Submit
    let submitted = false;
    for (const sel of opts.submitSelectors) {
      try {
        const el = await page.waitForSelector(sel, { timeout: 3_000, state: "visible" });
        if (el) {
          await el.click();
          submitted = true;
          break;
        }
      } catch { /* try next */ }
    }
    if (!submitted) {
      try {
        await page.keyboard.press("Enter");
        submitted = true;
      } catch { /* ignore */ }
    }
    if (!submitted) return { ok: false, reason: "submit button not found" };

    // Race success vs failure selectors
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const sel of opts.successSelectors) {
        const found = await page.$(sel).catch(() => null);
        if (found) return { ok: true };
      }
      for (const sel of opts.failureSelectors ?? []) {
        const found = await page.$(sel).catch(() => null);
        if (found) return { ok: false, reason: "login rejected (selector: " + sel + ")" };
      }
      await page.waitForTimeout(500);
    }
    return { ok: false, reason: "login timed out waiting for dashboard" };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "unknown login error" };
  }
}
