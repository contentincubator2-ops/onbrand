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
