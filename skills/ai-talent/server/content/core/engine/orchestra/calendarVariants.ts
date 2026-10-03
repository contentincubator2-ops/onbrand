/**
 * 月曆類任務：把一次產出的多篇貼文展開成各自的版本。
 */
import { OrchestraVariant } from "./orchestraTypes";

// 2026-05-18 (CJ「行事曆」): merge N pillar-group JSON arrays into ONE
// day-sorted calendar JSON string. Tolerant of fences / surrounding text.
export function mergeCalendarPosts(captionStrings: string[]): string {
  const all: any[] = [];
  for (const c of captionStrings) {
    let s = String(c ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const a = s.indexOf("["), b = s.lastIndexOf("]");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) all.push(...arr.filter((p) => p && typeof p === "object"));
    } catch { /* skip a malformed pillar slice */ }
  }
  all.sort((x, y) => (Number(x?.day) || 0) - (Number(y?.day) || 0));
  const n = all.length || 1;
  all.forEach((p, i) => { p.day = Math.min(30, Math.max(1, Math.round(((i + 1) * 30) / n))); });
  return JSON.stringify(all);
}

// 2026-05-18 (CJ「每篇一個可編輯 mockup + 日期 + 批量 .ics」): expand the
// merged calendar posts into ONE VARIANT PER POST so the existing
// per-variant UI (pills nav / 跟 agent 改文案 / 改圖 / 排程發布) works
// per post. Label carries the real date + pillar (RunPage parses it for
// the batch .ics); caption is the clean publishable post text.
export function expandCalendarVariants(captionStrings: string[]): OrchestraVariant[] {
  const merged = mergeCalendarPosts(captionStrings);
  let posts: any[] = [];
  try { posts = JSON.parse(merged); } catch { posts = []; }
  if (!Array.isArray(posts) || posts.length === 0) return [];
  const today = new Date();
  return posts.map((p, i) => {
    const dayN = Math.max(1, Math.min(60, Number(p?.day) || i + 1));
    const d = new Date(today.getTime() + (dayN - 1) * 86400000);
    const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    const pillar = String(p?.pillar ?? "").trim() || "貼文";
    const hook = String(p?.hook ?? "").trim();
    const message = String(p?.message ?? "").trim();
    const cta = String(p?.cta ?? "").trim();
    const caption = [hook, message, cta ? `→ ${cta}` : ""].filter(Boolean).join("\n\n");
    return {
      // label is parseable: "<YYYY/MM/DD> · 第N天 · <pillar>"
      label: `${dateStr} · 第 ${dayN} 天 · ${pillar}`,
      caption,
      hashtags: [],
      image: { style: null, url: null, status: "skipped" as const },
    };
  });
}
