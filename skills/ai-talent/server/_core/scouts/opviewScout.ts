/**
 * opviewScout — OpView 意藍 social listening (browser-driven login).
 *
 * Tier: browser_login (ToS risk — user signed disclaimer)
 * Strategy:
 *   1. Browserbase session → https://login.opview.com.tw/
 *   2. Fill username/password (TOTP not yet handled — warn if required)
 *   3. After login, navigate to competitor/keyword dashboards
 *   4. Scrape recent "hot posts" or "trending topics" cards
 *
 * Selectors are best-effort and will need tightening after first live test.
 * The scout always returns `[]` (not throws) if login or scrape fails, so
 * orchestrator logs it as `ok: false` + error message.
 */

import { getBrowserProvider } from "../browser";
import type { Scout, ScoutContext, IntelItem } from "./types";
import { formLogin } from "./_browserLogin";

export const opviewScout: Scout = {
  id: "opview",
  label: "Opview 意藍",
  tier: "browser_login",
  requiredTool: "opview",

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    const cred = await ctx.loadCred("opview");
    const username = cred?.username;
    const password = cred?.password;
    if (!username || !password) return [];

    const provider = await getBrowserProvider();
    const items: IntelItem[] = [];

    await provider.run(
      async ({ page }) => {
        try {
          await page.goto("https://login.opview.com.tw/", {
            waitUntil: "domcontentloaded",
            timeout: 25_000,
          });
          const login = await formLogin(page, username, password, {
            usernameSelectors: [
              "input[name='account']",
              "input[name='username']",
              "input[type='text']",
              "input#account",
            ],
            passwordSelectors: [
              "input[name='password']",
              "input[type='password']",
              "input#password",
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
            failureSelectors: [".error-msg", ".alert-danger"],
            timeoutMs: 25_000,
          });
          if (!login.ok) throw new Error(`opview login: ${login.reason}`);

          // TODO: Real dashboard scraping needs account-level testing. This
          // stub harvests any element that looks like a trending-post card.
          await page.waitForTimeout(2000);
          const rows = await page.evaluate(() => {
            const out: Array<{ title: string; source: string; url: string }> = [];
            const cards = Array.from(document.querySelectorAll<HTMLElement>(
              ".hot-post, .trend-card, [class*='TrendItem'], [class*='HotPost']"
            )).slice(0, 12);
            for (const c of cards) {
              const titleEl = c.querySelector<HTMLElement>(".title, h3, h4, .post-title");
              const linkEl = c.querySelector<HTMLAnchorElement>("a[href]");
              const sourceEl = c.querySelector<HTMLElement>(".source, .platform, .site");
              const title = (titleEl?.textContent || linkEl?.textContent || "").trim();
              if (!title) continue;
              out.push({
                title,
                source: (sourceEl?.textContent || "Opview").trim(),
                url: linkEl?.href || "",
              });
            }
            return out;
          });

          for (const r of rows.slice(0, ctx.limit)) {
            items.push({
              key: `opview:${hashish(r.url || r.title)}`,
              type: "social_trend",
              title: r.title.slice(0, 240),
              content: "Opview 社群聲量熱門貼文",
              source: `Opview · ${r.source}`.slice(0, 120),
              url: r.url || undefined,
              publishedAt: new Date().toISOString().slice(0, 10),
              relevanceScore: 0.75,
              scoutId: "opview",
            });
          }
        } catch {
          // Swallow — orchestrator reports scout as failed via empty result
        }
        return null;
      },
      { timeoutMs: 120_000, label: "opviewScout" }
    );

    return items;
  },
};

function hashish(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
