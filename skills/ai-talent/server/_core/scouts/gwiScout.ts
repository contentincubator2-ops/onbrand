/**
 * gwiScout — GlobalWebIndex audience insights (browser-driven login).
 *
 * Tier: browser_login (ToS risk)
 * Strategy:
 *   1. https://app.gwi.com/ (redirects to login)
 *   2. Fill email + password
 *   3. Navigate to a "chart explorer" view filtered by industryTags
 *   4. Export top audience attributes as trending_topic items
 *
 * GWI's in-app reports don't really have "news" — we repurpose them into
 * audience-insight summary items so the strategy deck can cite them.
 * Selectors are placeholders — real implementation will want accountteam
 * to export specific charts via saved-report URLs.
 */

import { getBrowserProvider } from "../browser";
import type { Scout, ScoutContext, IntelItem } from "./types";
import { formLogin } from "./_browserLogin";

export const gwiScout: Scout = {
  id: "gwi",
  label: "GWI",
  tier: "browser_login",
  requiredTool: "gwi",

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    const cred = await ctx.loadCred("gwi");
    const username = cred?.username;
    const password = cred?.password;
    if (!username || !password) return [];

    const provider = await getBrowserProvider();
    const items: IntelItem[] = [];

    await provider.run(
      async ({ page }) => {
        try {
          await page.goto("https://app.gwi.com/login", {
            waitUntil: "domcontentloaded",
            timeout: 25_000,
          });
          const login = await formLogin(page, username, password, {
            usernameSelectors: [
              "input[name='email']",
              "input[type='email']",
              "input#email",
            ],
            passwordSelectors: [
              "input[name='password']",
              "input[type='password']",
            ],
            submitSelectors: [
              "button[type='submit']",
              "button.login-btn",
            ],
            successSelectors: [
              "[data-testid='app-root']",
              "[class*='Dashboard']",
              "a[href*='logout']",
              "nav",
            ],
            failureSelectors: ["[class*='Error']", "[role='alert']"],
            timeoutMs: 30_000,
          });
          if (!login.ok) throw new Error(`gwi login: ${login.reason}`);

          // Navigate to explore — real use should target a saved-report URL
          await page.goto("https://app.gwi.com/platform/insights", {
            waitUntil: "domcontentloaded",
            timeout: 20_000,
          }).catch(() => null);
          await page.waitForTimeout(3000);

          const rows = await page.evaluate(() => {
            const out: Array<{ title: string; value: string }> = [];
            const cards = Array.from(document.querySelectorAll<HTMLElement>(
              "[class*='InsightCard'], [class*='StatCard'], [class*='Stat']"
            )).slice(0, 10);
            for (const c of cards) {
              const titleEl = c.querySelector<HTMLElement>("[class*='Title'], h3, h4");
              const valueEl = c.querySelector<HTMLElement>("[class*='Value'], [class*='Stat']");
              const title = (titleEl?.textContent || "").trim();
              const value = (valueEl?.textContent || "").trim();
              if (!title) continue;
              out.push({ title, value });
            }
            return out;
          });

          for (const r of rows.slice(0, ctx.limit)) {
            items.push({
              key: `gwi:${hashish(r.title)}`,
              type: "trending_topic",
              title: `受眾洞察：${r.title}`,
              content: r.value || "GWI 受眾面板指標",
              source: "GWI · 受眾洞察",
              url: "https://app.gwi.com/",
              publishedAt: new Date().toISOString().slice(0, 10),
              relevanceScore: 0.7,
              scoutId: "gwi",
            });
          }
        } catch {
          // Swallow
        }
        return null;
      },
      { timeoutMs: 120_000, label: "gwiScout" }
    );

    return items;
  },
};

function hashish(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
