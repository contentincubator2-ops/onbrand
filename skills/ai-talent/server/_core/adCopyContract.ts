// 2026-08-21 (CJ「FB 廣告完整包：要求每篇加 CTA 網址，有的版本有、有的沒有」):
// The ad-pack task asks the model for a labelled [Headline]/[Primary]/[CTA]
// caption, but nothing ever *enforced* it. The user's landing URL travelled
// as plain user-message text, so each of the 5 independent variant calls
// decided on its own whether (and where) to include it — and the shared
// social scaffolding («不要排成結構化卡片») actively pushed against the
// marker format. This module turns those soft asks into a checkable
// contract: deterministic URL extraction → hard prompt rule → post-LLM
// validation (retry) → deterministic repair as the last line of defence.

import type { FBTaskTemplate } from "./quickTaskFB";
import { findFirstUrl } from "./urlContext";
import { extractYouTubeId } from "./youtubeContext";

const MARKER_RE = /(?:\[|【)\s*(headline|primary|cta)\s*(?:\]|】)/giu;

/** Tasks whose systemPrompt asks for the labelled ad-copy format. */
export function isAdCopyTemplate(template: Pick<FBTaskTemplate, "systemPrompt">): boolean {
  return /\[CTA\]/i.test(template.systemPrompt ?? "");
}

/**
 * The landing URL the user typed into any input. Deterministic — no LLM
 * judgement — so the same value is used for the prompt rule, validation
 * and repair. Returns null when the user gave no URL (e.g. just「母親節」).
 */
export function extractRequestedUrl(inputs: Record<string, unknown>): string | null {
  for (const v of Object.values(inputs)) {
    if (typeof v !== "string") continue;
    const url = findFirstUrl(v);
    if (!url) continue;
    // A YouTube link in an ad brief is reference *material* (the existing
    // fetch-as-context path keeps handling it), not the landing page.
    if (extractYouTubeId(url)) continue;
    // findFirstUrl normalises bare domains to https://… — keep the user's
    // literal spelling so validation/repair compare against what they
    // typed (and what the model will most naturally echo back).
    if (v.includes(url)) return url;
    const bare = url.replace(/^https?:\/\//i, "");
    if (bare && v.includes(bare)) return bare;
    return url;
  }
  return null;
}

/** Hard rule appended to the system prompt (overrides the social scaffold). */
export function buildAdCopyRule(requestedUrl: string | null): string {
  const urlRule = requestedUrl
    ? `- 使用者指定了落地頁網址「${requestedUrl}」：[Primary] 的**最後一行必須逐字**出現這個網址（不得改寫、縮短或換成別的網址）。` +
      `[CTA] 只放按鈕文字（2–8 字，例如「看穿搭指南」），**不要**把網址放進 [CTA]。\n`
    : `- 使用者沒有提供網址：**絕對不要**自行捏造任何網址或連結。\n`;
  return (
    `\n\n【廣告格式合約 — 最高優先，蓋過上方所有格式規則】\n` +
    `- 本任務是廣告文案，**例外**於「不要排成結構化卡片」規則：caption 必須且只能由三段組成，` +
    `依序為「[Headline]」「[Primary]」「[CTA]」三個方括號標記，每個標記各自獨立一行開頭，缺一不可。\n` +
    `- hashtag 放在 [CTA] 之後的最後一行（可省略）。\n` +
    urlRule +
    `- 網址只是連結，不是主題：不要描述、臆測或引用該網站的內容。\n`
  );
}

export interface AdCopyIssue {
  reason: "missing_markers" | "missing_url" | "url_in_cta" | "fabricated_url";
  detail: string;
}

interface Segments {
  headline: string;
  primary: string;
  cta: string;
  /** Anything after the [CTA] block (typically hashtags). */
  tail: string;
}

function splitSegments(caption: string): Segments | null {
  const matches = Array.from(caption.matchAll(MARKER_RE));
  const seen = new Set(matches.map((m) => (m[1] ?? "").toLowerCase()));
  if (!seen.has("headline") || !seen.has("primary") || !seen.has("cta")) return null;
  const seg: Segments = { headline: "", primary: "", cta: "", tail: "" };
  matches.forEach((m, i) => {
    const key = (m[1] ?? "").toLowerCase() as "headline" | "primary" | "cta";
    const start = (m.index ?? 0) + m[0].length;
    const end = matches[i + 1]?.index ?? caption.length;
    seg[key] = caption.slice(start, end).trim();
  });
  // Split trailing hashtag lines out of the CTA block so repairs never
  // land after the hashtags.
  const ctaLines = seg.cta.split(/\n/);
  while (ctaLines.length > 1 && /^\s*#/.test(ctaLines[ctaLines.length - 1] ?? "")) {
    seg.tail = [ctaLines.pop()!.trim(), seg.tail].filter(Boolean).join("\n");
  }
  seg.cta = ctaLines.join("\n").trim();
  return seg;
}

/** Returns the first contract violation, or null when the caption complies. */
export function validateAdCopy(caption: string, requestedUrl: string | null): AdCopyIssue | null {
  const seg = splitSegments(caption);
  if (!seg) return { reason: "missing_markers", detail: "caption 缺少 [Headline]/[Primary]/[CTA] 標記" };
  if (requestedUrl) {
    if (!lastLine(seg.primary).includes(requestedUrl)) {
      return { reason: "missing_url", detail: `[Primary] 的最後一行必須是指定網址 ${requestedUrl}` };
    }
    if (seg.cta.includes(requestedUrl)) {
      return { reason: "url_in_cta", detail: `[CTA] 只能放按鈕文字，不能放網址 ${requestedUrl}` };
    }
  } else {
    const invented = findFirstUrl(seg.headline) ?? findFirstUrl(seg.primary) ?? findFirstUrl(seg.cta);
    if (invented) {
      return { reason: "fabricated_url", detail: `使用者沒有提供網址，不得自行加入 ${invented}` };
    }
  }
  return null;
}

function lastLine(block: string): string {
  const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

/** Button text used when stripping the URL leaves [CTA] empty. */
const DEFAULT_CTA_BUTTON = "立即查看";

/**
 * Deterministic last-resort repair: when the markers are present but the
 * requested URL is not the final line of [Primary], append it there, and
 * strip every occurrence from [CTA] (the button is at most 8 chars on the
 * mockup, so a URL there is useless). Captions without markers are returned
 * untouched — we cannot invent structure the model never produced — and a
 * fabricated URL (none requested) is left for the retry to fix, never
 * silently edited.
 */
export function repairAdCopy(caption: string, requestedUrl: string | null): string {
  if (!requestedUrl) return caption;
  const seg = splitSegments(caption);
  if (!seg) return caption;
  let changed = false;
  if (!lastLine(seg.primary).includes(requestedUrl)) {
    seg.primary = `${seg.primary}\n${requestedUrl}`.trim();
    changed = true;
  }
  if (seg.cta.includes(requestedUrl)) {
    const stripped = seg.cta
      .split(requestedUrl).join("")
      .replace(/\s*(?:→|->|👉|:|：|\(|（)\s*$/u, "")
      .trim();
    seg.cta = stripped || DEFAULT_CTA_BUTTON;
    changed = true;
  }
  if (!changed) return caption;
  return [
    `[Headline] ${seg.headline}`,
    `[Primary] ${seg.primary}`,
    `[CTA] ${seg.cta}`,
    seg.tail,
  ].filter(Boolean).join("\n");
}
