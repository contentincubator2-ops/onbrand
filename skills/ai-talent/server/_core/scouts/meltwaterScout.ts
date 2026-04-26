/**
 * meltwaterScout — Meltwater media monitoring (browser-driven login).
 *
 * Tier: browser_login (ToS risk)
 * Strategy:
 *   1. https://login.meltwater.com/ → fill form
 *   2. After dashboard loads, navigate to Insights / Explore
 *   3. Scrape top stories or trending keywords
 *
 * Selectors are placeholders — need account-level tightening.
 */

import { getBrowserProvider } from "../browser";
import type { Scout, ScoutContext, IntelItem } from "./types";
import { formLogin } from "./_browserLogin";

export const meltwaterScout: Scout = {
  id: "meltwater",
  label: "Meltwater",
  tier: "browser_login",
  requiredTool: "meltwater",

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    const cred = await ctx.loadCred("meltwater");
    const username = cred?.username;
    const password = cred?.password;
    if (!username || !password) return [];

    const provider = await getBrowserProvider();
    const items: IntelItem[] = [];

    await provider.run(
      async ({ page }) => {
        try {
          await page.goto("https://login.meltwater.com/", {
            waitUntil: "domcontentloaded",
            timeout: 25_000,
          });
          const login = await formLogin(page, username, password, {
            usernameSelectors: [
              "input[name='email']",
              "input[type='email']",
              "input#email",
              "input[name='username']",
            ],
            passwordSelectors: [
              "input[name='password']",
              "input[type='password']",
              "input#password",
            ],
            submitSelectors: [
              "button[type='submit']",
              "button[data-testid='submit-button']",
              "button.LoginForm__submit",
            ],
            successSelectors: [
              "[data-testid='app-shell']",
              ".AppShell",
              "a[href*='logout']",
              "[class*='Dashboard']",
            ],
            failureSelectors: [".LoginForm__error", "[class*='error']"],
            timeoutMs: 30_000,
          });
          if (!login.ok) throw new Error(`meltwater login: ${login.reason}`);

          // Navigate to news/explore — URL may vary by account
          await page.goto("https://app.meltwater.com/app/mi/explore", {
            waitUntil: "domcontentloaded",
            timeout: 20_000,
          }).catch(() => null);
          await page.waitForTimeout(3000);

          const rows = await page.evaluate(() => {
            const out: Array<{ title: string; source: string; url: string; time: string | null }> = [];
            const cards = Array.from(document.querySelectorAll<HTMLElement>(
              "[class*='DocumentCard'], [class*='NewsCard'], [class*='StoryCard'], article"
            )).slice(0, 12);
            for (const c of cards) {
              const titleEl = c.querySelector<HTMLElement>("h2, h3, [class*='Title']");
              const linkEl = c.querySelector<HTMLAnchorElement>("a[href^='http']");
              const sourceEl = c.querySelector<HTMLElement>("[class*='Source'], [class*='source']");
              const timeEl = c.querySelector<HTMLElement>("time, [class*='Date']");
              const title = (titleEl?.textContent || "").trim();
              if (!title) continue;
              out.push({
                title,
                source: (sourceEl?.textContent || "Meltwater").trim(),
                url: linkEl?.href || "",
                time: timeEl?.getAttribute("datetime") || timeEl?.textContent || null,
              });
            }
            return out;
          });

          for (const r of rows.slice(0, ctx.limit)) {
            items.push({
              key: `meltwater:${hashish(r.url || r.title)}`,
              type: "competitor_news",
              title: r.title.slice(0, 240),
              content: "Meltwater 媒體監測 · 來自授權新聞 feed",
              source: `Meltwater · ${r.source}`.slice(0, 120),
              url: r.url || undefined,
              publishedAt: r.time ?? undefined,
              relevanceScore: 0.8,
              scoutId: "meltwater",
            });
          }
        } catch {
          // Swallow
        }
        return null;
      },
      { timeoutMs: 120_000, label: "meltwaterScout" }
    );

    return items;
  },
};

function hashish(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
