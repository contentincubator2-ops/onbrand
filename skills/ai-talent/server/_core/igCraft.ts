/**
 * Instagram craft layer — 2026-05-17 (CJ「為所有 IG 任務加值，比照
 * EDM 得獎工藝層」). Faithful mirror of edmCraft.ts: brand-AGNOSTIC
 * craft discipline (the HOW) for the IG family only; brand voice/
 * essence still comes from the brand digest, hard rules from the
 * post-gen enforcement layer. Static constant — no DB, no per-brand
 * state, no bloat. Injected only for IG-family body tasks so other
 * platforms (fb/li/yt/email/…) are completely unaffected.
 *
 * Instagram is visual-first: image/video is the content, copy is the
 * assist. The rubric encodes both tracks (visual craft + copy craft)
 * plus zh-TW localisation as the highest priority.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * Is this an Instagram-family task?
 * Strictly the ig-* templates (quickTaskIG / quickTaskIG60 /
 * ig-99-* in quickTask100) + any task whose output channel is
 * instagram. Must NOT bleed into fb/li/yt/email/threads/etc.
 */
export function isInstagramTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("ig-")) return true;
  return template.outputDefaults?.platform === "instagram";
}

/** A "full body" IG deliverable (craft matters) vs an atomic fragment
 *  (hashtag set / bio rewrite / DM script / comment reply — already
 *  tiny & purpose-built, skip the heavy post-gen pass, same idea as
 *  email subject-line / preview-text). */
export function isInstagramBodyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (/hashtag-set|bio-rewrite|dm-script|comment-reply/.test(id)) return false;
  return isInstagramTask(template);
}

/** The award-grade IG rubric — dual-track (visual + copy) + zh-TW.
 *  Concrete + operational so it actually changes output. */
export const IG_CRAFT_RUBRIC = `
# IG 得獎級工藝準則（嚴格遵守）
Instagram 是視覺優先媒介——圖/影是內容本體，文案是輔助。雙軌都要達標：
【視覺 craft】
- 首屏鉤子：feed 首圖／Reel 前 1 秒／carousel 封面必須 0.5 秒內讓人停下；高對比、單一焦點、留白給文字。
- 比例正確：feed 直式 4:5 或 1:1；Reels/Story 9:16 滿版；carousel 1:1。錯比例＝被裁切＝失敗。
- 輪播弧線：封面拋問題/承諾 → 中間逐張遞進（一張一個重點）→ 末張 payoff＋CTA；張張可獨立看懂。
- Reels：3 秒內進主題、有 on-screen 字卡、結尾能無縫 loop；節奏快、不冷場。
- Story：用互動元件（投票/問答/滑桿/問題貼紙）創造參與，不只貼圖。
- 品牌視覺一致：色彩/字體/濾鏡/構圖語言與品牌大腦一致，可被一眼認出。
【文案 craft】
- 第一行就是 hook（手機只露 1-2 行）：好奇/利益/反差，不要「大家好今天要分享」。
- 可掃讀：短句、換行分段、必要時 emoji 當視覺錨點（不濫用）。
- 一個主要 CTA（留言/分享/儲存/點 bio 連結擇一），明確動詞。
- 觸發 save/share：給「值得收藏」的具體價值或「想 tag 朋友」的共鳴。
- Hashtag：3-8 個、混合大中小標籤、放文末或首則留言，不堆砌、與內容相關。
【zh-TW 在地化｜最高優先】不要套美式節慶/用語；用台灣節點與口語（過年/中秋/母親節/雙11/在地梗）。繁體中文、台灣用語。
`.trim();

/** Per-use-case playbook — keyed by taskId pattern. The 2-4
 *  highest-leverage moves for that IG content type. */
export function igPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const P = (s: string) => `# 本任務 playbook（IG 得獎模式）\n${s}`;
  if (/feed|caption-short/.test(id))
    return P("單圖/feed：首圖一個視覺主張＋首行 hook；文案先給價值再 CTA；3-8 hashtag 文末。");
  if (/carousel/.test(id))
    return P("封面承諾一個 payoff；每張一重點、視覺連貫；末張 CTA＋儲存誘因。");
  if (/reel/.test(id))
    return P("前 1 秒視覺鉤子＋字卡；3 秒內進主題；結尾可 loop；文案補充不重複畫面。");
  if (/story/.test(id))
    return P("用互動貼紙（投票/問答/滑桿）；單一訊息；明確下一步（上滑/點貼紙）。");
  if (/bio/.test(id))
    return P("一句定位＋具體價值＋一個明確 CTA（連結）；可掃讀、有個性、含關鍵字。");
  if (/hashtag/.test(id))
    return P("3-8 個分層（大流量/中精準/小社群/品牌專屬）、與內容相關、不重複堆砌。");
  if (/dm|comment/.test(id))
    return P("像真人、先共鳴再回應；不模板、不冷淡；一個自然的下一步。");
  if (/live/.test(id))
    return P("開場 30 秒講清楚「為什麼留下來」；預告 hook；CTA 互動。");
  return P("IG 通用：視覺首屏鉤子＋文案首行 hook＋單一 CTA＋分層 hashtag。");
}
