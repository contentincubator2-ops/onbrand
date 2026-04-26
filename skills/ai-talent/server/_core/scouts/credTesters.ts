/**
 * Per-tool credential testers — Phase 2A Ext Batch 2-2d.
 *
 * Each tester actually calls the underlying API / drives a real login so the
 * UI's "測試" button stops lying. Prior to this file, toolCredRouter.test was
 * a stub that only decrypted the payload — wrong passwords returned "ok".
 *
 * Each tester returns:
 *   { ok: true }  — credential works
 *   { ok: false, message } — explain why (bad key, wrong password, captcha…)
 *
 * Testers must complete in reasonable time (< 60s) and never throw; wrap all
 * errors into `{ ok: false }`.
 */

import { getBrowserProvider } from "../browser";
import { formLogin } from "./_browserLogin";

export interface TesterResult {
  ok: boolean;
  message: string;
  detail?: string;
}

type Payload = Record<string, string>;
type Tester = (payload: Payload) => Promise<TesterResult>;

// ─── Tier B: API-key testers ──────────────────────────────────────────────

const ahrefsTest: Tester = async ({ apiKey }) => {
  if (!apiKey) return { ok: false, message: "缺少 API Token" };
  try {
    const res = await fetch(
      "https://api.ahrefs.com/v3/subscription-info/limits-and-usage",
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }
    );
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "API Token 無效或權限不足" };
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 160);
      return { ok: false, message: `Ahrefs API 回 ${res.status}`, detail: body };
    }
    return { ok: true, message: "Ahrefs API Token 驗證通過" };
  } catch (err: any) {
    return { ok: false, message: `網路錯誤：${err?.message ?? err}` };
  }
};

const similarwebTest: Tester = async ({ apiKey }) => {
  if (!apiKey) return { ok: false, message: "缺少 API Key" };
  try {
    // Cheapest endpoint: website similar-sites for a known domain
    const url = new URL("https://api.similarweb.com/v1/website/google.com/similar-sites/similarsites");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString());
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "API Key 無效" };
    }
    if (res.status === 429) {
      return { ok: false, message: "Similarweb 額度已用完" };
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 160);
      return { ok: false, message: `Similarweb 回 ${res.status}`, detail: body };
    }
    return { ok: true, message: "Similarweb API Key 驗證通過" };
  } catch (err: any) {
    return { ok: false, message: `網路錯誤：${err?.message ?? err}` };
  }
};

const semrushTest: Tester = async ({ apiKey }) => {
  if (!apiKey) return { ok: false, message: "缺少 API Key" };
  try {
    // "API Units Balance" — tiny response, authenticates key
    const url = new URL("https://www.semrush.com/users/countapiunits.html");
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) {
      return { ok: false, message: `SEMrush 回 ${res.status}` };
    }
    const text = (await res.text()).trim();
    if (text.startsWith("ERROR")) {
      return { ok: false, message: `SEMrush: ${text.slice(0, 120)}` };
    }
    const units = Number(text);
    if (Number.isFinite(units)) {
      return { ok: true, message: `SEMrush API 通過 · 剩 ${units.toLocaleString()} units` };
    }
    return { ok: true, message: "SEMrush API Key 驗證通過" };
  } catch (err: any) {
    return { ok: false, message: `網路錯誤：${err?.message ?? err}` };
  }
};

const youtubeDataTest: Tester = async ({ apiKey }) => {
  if (!apiKey) return { ok: false, message: "缺少 API Key" };
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "id");
    url.searchParams.set("q", "test");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    if (res.status === 400 || res.status === 403) {
      const body = await res.json().catch(() => ({}));
      const reason = (body as any)?.error?.errors?.[0]?.reason ?? "";
      return {
        ok: false,
        message: `YouTube API 拒絕（${reason || res.status}）· 檢查 key 是否啟用 YouTube Data API v3`,
      };
    }
    if (!res.ok) return { ok: false, message: `YouTube API 回 ${res.status}` };
    return { ok: true, message: "YouTube Data API Key 驗證通過" };
  } catch (err: any) {
    return { ok: false, message: `網路錯誤：${err?.message ?? err}` };
  }
};

const redditTest: Tester = async ({ clientId, clientSecret }) => {
  if (!clientId || !clientSecret) return { ok: false, message: "缺少 Client ID / Secret" };
  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "marketing-os/1.0 (by /u/marketing-os-bot)",
      },
      body: "grant_type=client_credentials",
    });
    if (res.status === 401) return { ok: false, message: "Reddit 拒絕：Client ID 或 Secret 錯誤" };
    if (!res.ok) return { ok: false, message: `Reddit 回 ${res.status}` };
    const json = (await res.json()) as any;
    if (!json?.access_token) {
      return { ok: false, message: "Reddit 沒回 access_token（app 類型可能不對）" };
    }
    return { ok: true, message: "Reddit OAuth 驗證通過" };
  } catch (err: any) {
    return { ok: false, message: `網路錯誤：${err?.message ?? err}` };
  }
};

// ─── Tier C: browser-login testers ────────────────────────────────────────
//
// These ACTUALLY open Browserbase and run the login form. That's the only way
// to know the credentials work. Slower (~20-40s per tool) and each call costs
// one Browserbase session credit — test sparingly.

async function browserLoginProbe(
  loginUrl: string,
  username: string,
  password: string,
  selectors: Parameters<typeof formLogin>[3]
): Promise<TesterResult> {
  try {
    const provider = await getBrowserProvider();
    let loginResult: { ok: boolean; reason?: string } = { ok: false, reason: "did not run" };
    await provider.run(
      async ({ page }) => {
        await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
        loginResult = await formLogin(page, username, password, selectors);
        return null;
      },
      { timeoutMs: 70_000, label: "credTest" }
    );
    if (loginResult.ok) return { ok: true, message: "登入成功（瀏覽器實測通過）" };
    return { ok: false, message: `登入失敗：${loginResult.reason ?? "未知"}` };
  } catch (err: any) {
    return { ok: false, message: `瀏覽器測試錯誤：${err?.message ?? err}` };
  }
}

const opviewTest: Tester = async ({ username, password }) => {
  if (!username || !password) return { ok: false, message: "缺少帳號或密碼" };
  return browserLoginProbe("https://login.opview.com.tw/", username, password, {
    usernameSelectors: [
      "input[name='account']",
      "input[name='username']",
      "input#account",
      "input[type='text']",
    ],
    passwordSelectors: [
      "input[name='password']",
      "input#password",
      "input[type='password']",
    ],
    submitSelectors: [
      "button[type='submit']",
      "button.login-btn",
      "input[type='submit']",
    ],
    successSelectors: [
      ".dashboard",
      "[class*='Dashboard']",
      "a[href*='logout']",
      ".user-profile",
    ],
    failureSelectors: [
      ".error-msg",
      ".alert-danger",
      "[class*='error']",
      "[role='alert']",
    ],
    timeoutMs: 25_000,
  });
};

const meltwaterTest: Tester = async ({ username, password }) => {
  if (!username || !password) return { ok: false, message: "缺少帳號或密碼" };
  return browserLoginProbe("https://login.meltwater.com/", username, password, {
    usernameSelectors: ["input[name='email']", "input[type='email']", "input#email"],
    passwordSelectors: ["input[name='password']", "input#password"],
    submitSelectors: ["button[type='submit']", "button.LoginForm__submit"],
    successSelectors: [
      "[data-testid='app-shell']",
      ".AppShell",
      "a[href*='logout']",
      "[class*='Dashboard']",
    ],
    failureSelectors: [
      ".LoginForm__error",
      "[class*='error']",
      "[role='alert']",
    ],
    timeoutMs: 30_000,
  });
};

const gwiTest: Tester = async ({ username, password }) => {
  if (!username || !password) return { ok: false, message: "缺少帳號或密碼" };
  return browserLoginProbe("https://app.gwi.com/login", username, password, {
    usernameSelectors: ["input[name='email']", "input[type='email']"],
    passwordSelectors: ["input[name='password']", "input[type='password']"],
    submitSelectors: ["button[type='submit']"],
    successSelectors: [
      "[data-testid='app-root']",
      "[class*='Dashboard']",
      "a[href*='logout']",
      "nav",
    ],
    failureSelectors: ["[class*='Error']", "[role='alert']"],
    timeoutMs: 30_000,
  });
};

// ─── Registry ─────────────────────────────────────────────────────────────

export const CRED_TESTERS: Record<string, Tester> = {
  ahrefs: ahrefsTest,
  similarweb: similarwebTest,
  semrush: semrushTest,
  youtube_data: youtubeDataTest,
  reddit: redditTest,
  opview: opviewTest,
  meltwater: meltwaterTest,
  gwi: gwiTest,
};

export async function runCredTest(
  tool: string,
  payload: Payload
): Promise<TesterResult> {
  const tester = CRED_TESTERS[tool];
  if (!tester) {
    // No per-tool tester registered — fall back to "decryption succeeded"
    return {
      ok: true,
      message: `(${tool}) 無實測方式 · 僅驗證加密存取成功`,
    };
  }
  return tester(payload);
}
