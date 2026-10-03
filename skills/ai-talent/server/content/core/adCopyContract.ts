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
import { findFirstUrl } from "../../platform/core/web/urlContext";
import { extractYouTubeId } from "../../platform/core/web/youtubeContext";

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
    for (const url of findAllUrls(v)) {
      // A YouTube link in an ad brief is reference *material* (the existing
      // fetch-as-context path keeps handling it), not the landing page.
      if (extractYouTubeId(url)) continue;
      return url.replace(TRAILING_PUNCT_RE, "");
    }
  }
  return null;
}

/** Punctuation users glue onto a pasted URL that is never part of it. */
const TRAILING_PUNCT_RE = /[)\]}>,.;:!?。，；：！？」』）】]+$/u;

/**
 * Every URL in `text`, in order, as the user/model literally spelled it.
 * findFirstUrl normalises bare domains to https://… — we keep the literal
 * spelling so validation/repair compare against what was actually typed
 * (and what the model will most naturally echo back).
 */
function findAllUrls(text: string, depth = 0): string[] {
  if (depth > 20 || !text) return [];
  const url = findFirstUrl(text);
  if (!url) return [];
  const bare = url.replace(/^https?:\/\//i, "");
  const literal = text.includes(url) ? url : bare && text.includes(bare) ? bare : null;
  if (!literal) return [];
  const idx = text.indexOf(literal);
  // findFirstUrl prefers a scheme URL anywhere in the text over an earlier
  // bare domain, so scan the prefix too to keep true left-to-right order.
  return [
    ...findAllUrls(text.slice(0, idx), depth + 1),
    literal,
    ...findAllUrls(text.slice(idx + literal.length), depth + 1),
  ];
}

/** Hard rule appended to the system prompt (overrides the social scaffold). */
export function buildAdCopyRule(requestedUrl: string | null): string {
  const urlRule = requestedUrl
    ? `- 使用者指定了落地頁網址「${requestedUrl}」：[Primary] 的**最後一行**必須是「一句行動引導 + 👉 + 網址」，` +
      `例如「想找到妳的那件外套 👉 ${requestedUrl}」；網址必須**逐字**出現（不得改寫、縮短或換成別的網址），不要讓網址孤零零自成一行。` +
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
/**
 * Returns the first contract violation (with `detail` listing every
 * violation found, so the retry reminder names all of them), or null.
 */
export function validateAdCopy(caption: string, requestedUrl: string | null): AdCopyIssue | null {
  const seg = splitSegments(caption);
  if (!seg) return { reason: "missing_markers", detail: "caption 缺少 [Headline]/[Primary]/[CTA] 標記" };
  const issues: AdCopyIssue[] = [];
  if (requestedUrl) {
    if (!lastLine(seg.primary).includes(requestedUrl)) {
      issues.push({ reason: "missing_url", detail: `[Primary] 的最後一行必須是指定網址 ${requestedUrl}` });
    }
    const ctaUrl = seg.cta.includes(requestedUrl) ? requestedUrl : findFirstUrl(seg.cta);
    if (ctaUrl) {
      issues.push({ reason: "url_in_cta", detail: `[CTA] 只能放按鈕文字，不能放網址 ${ctaUrl}` });
    }
  } else {
    // Whole caption (incl. any preamble before the markers / hashtag tail).
    const invented = findFirstUrl(caption);
    if (invented) {
      issues.push({ reason: "fabricated_url", detail: `使用者沒有提供網址，不得自行加入 ${invented}` });
    }
  }
  if (issues.length === 0) return null;
  return { reason: issues[0]!.reason, detail: issues.map((i) => i.detail).join("；") };
}

function lastLine(block: string): string {
  const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

/** Button text used when stripping the URL leaves [CTA] empty. */
const DEFAULT_CTA_BUTTON = "立即查看";
/** Lead-in used when the repair has to append the landing URL itself. */
const DEFAULT_URL_LEAD = "點這裡看更多";

/**
 * Deterministic last-resort repair: when the markers are present but the
 * requested URL is not the final line of [Primary], append it there, and
 * strip every occurrence from [CTA] (the button is at most 8 chars on the
 * mockup, so a URL there is useless). Captions without markers are
 * re-segmented from plain text (see segmentsFromPlainText). A fabricated
 * URL (none requested) is left for the retry to fix, never silently edited.
 */
export function repairAdCopy(caption: string, requestedUrl: string | null): string {
  let seg = splitSegments(caption);
  let changed = false;
  if (!seg) {
    seg = segmentsFromPlainText(caption);
    if (!seg) return caption;
    changed = true;
  }
  if (!requestedUrl) {
    // No landing page requested → no link may survive. Strip every URL the
    // model invented (all segments + tail) and tidy the dangling arrows.
    for (const key of ["headline", "primary", "cta", "tail"] as const) {
      const urls = findAllUrls(seg[key]);
      if (urls.length === 0) continue;
      let text = seg[key];
      for (const u of urls) text = text.split(u).join("");
      seg[key] = tidyAfterUrlRemoval(text);
      changed = true;
    }
    if (!seg.cta) seg.cta = DEFAULT_CTA_BUTTON;
    if (!seg.primary) seg.primary = seg.headline;
    return changed ? joinSegments(seg) : caption;
  }
  if (!lastLine(seg.primary).includes(requestedUrl)) {
    seg.primary = `${seg.primary}\n${DEFAULT_URL_LEAD} 👉 ${requestedUrl}`.trim();
    changed = true;
  }
  const ctaUrls = [requestedUrl, ...findAllUrls(seg.cta)].filter((u) => seg.cta.includes(u));
  if (ctaUrls.length > 0) {
    let stripped = seg.cta;
    for (const u of ctaUrls) stripped = stripped.split(u).join("");
    seg.cta = tidyAfterUrlRemoval(stripped) || DEFAULT_CTA_BUTTON;
    changed = true;
  }
  if (!changed) return caption;
  return joinSegments(seg);
}

/** Remove arrows / colons / empty brackets left dangling where a URL was. */
function tidyAfterUrlRemoval(text: string): string {
  return text
    .split(/\n/)
    .map((l) =>
      l
        .replace(/\s*(?:→|->|👉|:|：)\s*$/u, "")
        .replace(/[（(]\s*[)）]/gu, "")
        .replace(/[ \t]{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

function joinSegments(seg: Segments): string {
  return [
    `[Headline] ${seg.headline}`,
    `[Primary] ${seg.primary}`,
    `[CTA] ${seg.cta}`,
    seg.tail,
  ].filter(Boolean).join("\n");
}

/**
 * Build the three segments from an unlabelled caption (the model ignored
 * the markers entirely): first non-empty line → [Headline] (clipped to 25
 * chars), the rest → [Primary], trailing hashtag lines → tail, default
 * button text → [CTA]. Returns null for empty input.
 */
function segmentsFromPlainText(caption: string): Segments | null {
  const lines = caption.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const tailLines: string[] = [];
  while (lines.length > 1 && /^#/.test(lines[lines.length - 1] ?? "")) tailLines.unshift(lines.pop()!);
  if (lines.length === 0) return null;
  const first = lines.shift()!;
  const firstChars = Array.from(first);
  let headline = first;
  let primaryLead = "";
  if (firstChars.length > 25) {
    // Long opening line: clip the headline at the first sentence break
    // within 25 chars, keep the full line as the start of [Primary].
    const cut = first.search(/[。！？!?，,]/u);
    headline = cut > 0 && cut <= 25 ? first.slice(0, cut) : firstChars.slice(0, 25).join("");
    primaryLead = first;
  }
  const primary = [primaryLead, ...lines].filter(Boolean).join("\n") || headline;
  return { headline, primary, cta: DEFAULT_CTA_BUTTON, tail: tailLines.join("\n") };
}
