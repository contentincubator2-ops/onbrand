/**
 * perfUtm — 產出時打的成效標籤 → UTM。
 *
 * utm_content 用 `維度.代碼~維度.代碼`（例：ta.family~usp.nomess）。perfImport.parseUtmTags
 * 解的就是這個格式：GA4／電商訂單匯出檔裡只要帶著 utm_content，訂單就能歸回
 * 「族群 × USP」那一格 —— 這是銷售漏斗後段跟內容連起來的唯一一條線。
 */
export function utmContent(tags: Record<string, string>): string {
  return Object.entries(tags)
    .filter(([k, v]) => /^[a-z][a-z0-9_]{0,39}$/.test(k) && /^[a-z0-9][a-z0-9-]{0,39}$/.test(v))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}.${v}`)
    .join("~");
}

export function withUtm(url: string, opts: { source: string; medium?: string; campaign?: string; tags: Record<string, string> }): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  u.searchParams.set("utm_source", opts.source);
  u.searchParams.set("utm_medium", opts.medium ?? "social");
  if (opts.campaign) u.searchParams.set("utm_campaign", opts.campaign);
  const c = utmContent(opts.tags);
  if (c) u.searchParams.set("utm_content", c);
  return u.toString();
}

// ─── 2026-09-30 活動追蹤連結（成效第 2 步） ───────────────────────────────
// utm_campaign＝活動代碼 ob-ev<活動 id>；utm_content＝cp.ev<id>~it.<那一篇>~ph.<階段>。
// GA4／電商匯出檔只要帶著其中一個，那一列就自動歸回這檔活動、這一段（campaignPerf）。

/** 活動代碼：寫進 utm_campaign。 */
export const campaignCode = (eventId: number) => `ob-ev${eventId}`;

const codeSafe = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 39);

/** 活動企劃裡某一篇的追蹤連結。付費的那幾篇 utm_medium 用 paid_social。網址不合法 → 原樣回傳。 */
export function campaignLink(url: string, o: { eventId: number; itemId: string; phase: string; platform: string; paid?: boolean }): string {
  const tags: Record<string, string> = { cp: `ev${o.eventId}` };
  const it = codeSafe(o.itemId);
  const ph = codeSafe(o.phase);
  if (it) tags.it = it;
  if (ph) tags.ph = ph;
  return withUtm(url, { source: codeSafe(o.platform) || "social", medium: o.paid ? "paid_social" : "social", campaign: campaignCode(o.eventId), tags });
}

/** 只收 http(s) 網址。 */
export function cleanLandingUrl(s: string | null | undefined): string | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch { return null; }
}
