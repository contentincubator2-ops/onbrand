/**
 * 文案後處理：去佔位符、繁中用語與標點、去前言、去內部代碼、合併鉤子與內文。
 */


// 2026-05-19 (CJ 驗收 kl-60-pitch-pack v#2「守門未生效」): hoisted to
// module scope so it can run BOTH in the post-caption gate AND again as
// a final pass right before variants are persisted — a guaranteed
// backstop independent of which upstream path populated the caption.
// Deterministic, zero-cost, idempotent (safe to run twice).
/**
 * 2026-06-10 (CJ「資訊不夠時不要用 [請補充] 佔位符」改造):
 * Strip [請補充：…] / [待補：…] / [ASSUMPTION] / [TODO] / [TBD] / [placeholder]
 * markers from body captions. Used by ALL 30s/60s body tasks (NOT 99s docs
 * which legitimately use these placeholders for strategy briefs).
 *
 * Cleans up orphan whitespace / trailing punctuation left behind so the
 * scrub doesn't leave weird artifacts like "我們的活動。。從昨天開始" etc.
 */
export function stripPlaceholderBrackets(s: string): string {
  if (!s) return s;
  return s
    // With content: "[請補充：日期]" + optional trailing punctuation
    .replace(/[\[【]\s*(?:請補充|待補|請填入|TODO|ASSUMPTION|TBD|placeholder)[：:][^\[\]【】\n]*[\]】][。，,\.\s]*/g, "")
    // Without content: "[請補充]" + optional trailing punctuation
    .replace(/[\[【]\s*(?:請補充|待補|請填入|TODO|ASSUMPTION|TBD|placeholder)\s*[\]】][。，,\.\s]*/g, "")
    // Cleanup
    .replace(/\s{2,}/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export function voiceSanitizeZhTW(s: string): string {
  return s
    // emoji 一律移除（含 😉 俏皮符號）
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2122}\u{2139}\u{203C}\u{2049}]/gu, "")
    // 大陸用詞 → 台灣用語
    .replace(/渠道/g, "管道")
    // KOL 業配套語 / 空洞感性句 → 收斂
    .replace(/(?:特別是)?在這個數位時代[，,]?/g, "")
    .replace(/讓我們的品牌故事更加精彩/g, "把品牌故事說得更清楚")
    .replace(/更加精彩/g, "更完整")
    .replace(/期待你的回音/g, "想聽聽你的想法")
    .replace(/期待你的回應/g, "想聽聽你的想法")
    .replace(/(?:讓我們一起)?打造出引人注目的內容(?:吧)?/g, "一起把內容做好")
    .replace(/引人注目/g, "")
    .replace(/感受到突破品牌行銷的興奮/g, "")
    .replace(/非常契合/g, "很契合")
    .replace(/管理品牌形象時更有信心和便利/g, "更穩地守住品牌的一致")
    .replace(/管理品牌形象/g, "守住品牌的一致")
    .replace(/突破性的功能/g, "這個功能")
    .replace(/強大功能/g, "這個功能")
    .replace(/不得不點贊/g, "")
    // v#3 業配收尾套語 → 收斂
    .replace(/感謝你花時間閱讀我們的提案/g, "謝謝你花時間看完")
    .replace(/非常期待與你合作/g, "希望有機會一起做這件事")
    .replace(/非常樂意隨時跟你聊聊/g, "隨時可以聊聊")
    .replace(/希望能一起創造美好的合作/g, "希望這次合作能對彼此都有意義")
    .replace(/(?:讓我們一起|一起)創造美好的合作/g, "")
    .replace(/讓我們一起創造/g, "一起做出")
    .replace(/期待聽到你的想法/g, "想聽聽你的想法")
    // 帶貨/浮誇/效率詞 → 沉穩守護者語感（軟改寫，不硬刪以免斷句）
    .replace(/全台(?:品牌)?行銷人注意/g, "給品牌行銷人的觀察")
    .replace(/注意[！!]/g, "")
    .replace(/快來試試(?:看)?/g, "可以試試")
    .replace(/趕快試試看/g, "可以試試")
    .replace(/快來檢查一下/g, "值得檢查一下")
    .replace(/快來一起看看/g, "一起看看")
    .replace(/快來/g, "")
    .replace(/讓你的品牌亮起來/g, "讓品牌好好說話")
    .replace(/(?:讓品牌)?大放異彩/g, "")
    .replace(/宇宙無敵/g, "")
    .replace(/超神奇/g, "")
    .replace(/(?:讓你的品牌語音)?(?:在數位世界裡)?響亮無比/g, "讓品牌的聲音被聽見")
    .replace(/響亮無比/g, "")
    .replace(/在快速(?:進化|變化)的數位世界裡/g, "")
    .replace(/業界(?:的)?佼佼者/g, "")
    .replace(/不再擔心/g, "不必再擔心")
    .replace(/行銷新篇章/g, "行銷的下一步")
    .replace(/讓我們一起期待/g, "值得期待")
    .replace(/一起來討論吧/g, "歡迎一起想想")
    // 常見簡體漏字 → 繁體
    .replace(/精准/g, "精準")
    .replace(/内容/g, "內容")
    .replace(/数据/g, "數據")
    // 「通過」誤用 → 「透過」（表 via/經由 的語境；保守鎖定後接詞）
    .replace(/通過(?=直播|首映|預告|頻道|這場|本次|這次|社群|留言|評論)/g, "透過")
    // 英文直引號包中文 → 全形「」
    .replace(/"([^"\n]{1,40})"/g, "「$1」")
    // 2026-06-10 (CJ「資訊不夠時不要用 [請補充] 佔位符」改造):
    // OLD: kept [請補充/待補/請填入] as placeholders (preserved by exclusion).
    // NEW: STRIP all placeholder brackets — including these and any
    // [ASSUMPTION] / [TODO] / [TBD] markers. With content (e.g.
    // "[請補充：日期]"), drop the whole token; with optional trailing
    // punctuation (。，,.) consumed in one pass.
    .replace(/[\[【]\s*(?:請補充|待補|請填入|TODO|ASSUMPTION|TBD|placeholder)[：:][^\[\]【】\n]*[\]】][。，,\.\s]*/g, "")
    .replace(/[\[【]\s*(?:請補充|待補|請填入|TODO|ASSUMPTION|TBD|placeholder)\s*[\]】][。，,\.\s]*/g, "")
    // OTHER bracket-wrapped sentences (not placeholders) → unwrap
    .replace(/(^|\n)\s*[\[【]\s*([^\[\]【】\n]{6,})\s*[\]】]\s*(?=\n|$)/g, "$1$2")
    // 句尾與句中驚嘆號（! 與 ！）一律 → 句號
    .replace(/[!！]+/g, "。")
    // 清理改寫後的殘留
    .replace(/。{2,}/g, "。")
    .replace(/(^|\n)\s*。\s*/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * C3 residual (bug checklist 2026-08「fb-60-link-full 遇到不相關網址時，AI
 * 正確識別內容不符，卻用英文回覆，而非全站慣用的繁體中文」): none of the
 * gates above catch this — voiceSanitizeZhTW / the IG S2T map only clean up
 * STYLE within already-Chinese text; neither fires when the writer LLM
 * replies in an entirely different language (which happens when it gets
 * confused by off-brand, English-language source content, e.g. a mismatched
 * URL). This is a site-wide invariant, not scoped to one task family — a
 * zh-TW brand's caption must actually BE zh-TW.
 *
 * Deterministic, cheap heuristic: strip URLs/hashtags/@handles (legitimately
 * often Latin regardless of caption language), then compare CJK ideographs
 * to Latin letters in what's left. A normal zh-TW caption is CJK-DOMINANT
 * even with an English brand name or loanword mixed in — flag only when CJK
 * is a small minority, i.e. the caption is essentially written in English.
 * `meaningful < 15` guards short/emoji-only captions where the sample is too
 * small to judge (avoids false positives).
 */
export function looksNonChineseForZhTWBrand(text: string): boolean {
  if (!text || !text.trim()) return false;
  const stripped = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#\S+/g, " ")
    .replace(/@\S+/g, " ");
  const cjk = (stripped.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  const latin = (stripped.match(/[A-Za-z]/g) ?? []).length;
  const meaningful = cjk + latin;
  if (meaningful < 15) return false;
  return cjk / meaningful < 0.15;
}

/** One re-ask, in Chinese, asking the model to rewrite (not literally
 *  re-translate) the caption into 繁體中文 while preserving tone/structure/
 *  length. Fail-safe: any error, or an empty completion after one retry,
 *  returns the original caption unchanged rather than throwing — a
 *  wrong-language caption is still better than a crashed task run.
 *  2026-08-11: on-dev verification observed occasional empty completions
 *  from invokeLLM on the very first call (cold-start flakiness) — retry
 *  once before giving up, since a guard that silently no-ops on a flaky
 *  response defeats its own purpose. */
export async function reaskInZhTW(caption: string): Promise<string> {
  const { invokeLLM } = await import("../../../../platform/core/llm/llm");
  const extractText = (r: any): string => {
    // InvokeResult carries the text at choices[0].message.content — NOT a
    // top-level .content/.text (that shape doesn't exist on InvokeResult;
    // see llm.ts). message.content can also be a content-part array.
    const raw = r?.choices?.[0]?.message?.content;
    return (
      typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
          : ""
    ).trim();
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await invokeLLM({
        provider: "anthropic",
        messages: [{
          role: "user",
          content:
            `以下貼文文案目前是英文，但這個品牌帳號全站慣用「繁體中文（台灣用語）」。請將整段文案改寫成道地的繁體中文版本，保留原本的語氣、資訊重點、CTA、hashtag 結構與大致長度，不要逐字直譯生硬中文，也不要加任何前言或說明，只輸出改寫後的文案本身：\n\n${caption}`,
        }],
        maxTokens: 800,
      });
      const out = extractText(r);
      if (out) return out;
    } catch { /* fall through to retry / final fail-safe */ }
  }
  return caption;
}

/**
 * 2026-07-18 (CJ 多市場實測): the writer LLM occasionally slips CJK
 * punctuation into non-CJK output because the prompt scaffolding is
 * Chinese (observed: "part of the Lumen Coffee crew。" in an EN email).
 * Deterministic cleanup for languages that use Latin punctuation.
 *
 * Do NOT run for zh* (obviously) or ja* (Japanese legitimately uses
 * 。、「」) — use latinPunctLang() as the gate.
 */
export function latinPunctLang(outputLanguage?: string | null): boolean {
  const l = (outputLanguage ?? "zh-TW").toLowerCase();
  return !l.startsWith("zh") && !l.startsWith("ja");
}

export function normalizeLatinPunct(s: string): string {
  return s
    .replace(/。/g, ". ")
    .replace(/，/g, ", ")
    .replace(/、/g, ", ")
    .replace(/：/g, ": ")
    .replace(/；/g, "; ")
    .replace(/！/g, "! ")
    .replace(/？/g, "? ")
    .replace(/[「『]/g, " “")
    .replace(/[」』]/g, "” ")
    .replace(/（/g, " (")
    .replace(/）/g, ") ")
    .replace(/％/g, "%")
    .replace(/　/g, " ")
    // cleanup: no space before closing punct / collapse doubles
    .replace(/ +([,.;:!?)])/g, "$1")
    .replace(/\( +/g, "(")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +$/gm, "");
}

// 2026-08-02 (CJ「標題居然變成『我收到你的任務了』」): the L3 raw-text
// fallback in extractCaption() below ships whatever the model wrote
// verbatim once JSON parsing fails — including a chat-assistant
// acknowledgment the model tacked on before the real content ("我收到你的
// 任務了，以下是分鏡規劃：..."). titleFromCaption() then faithfully lifts
// that first sentence as the mission title. The "不要前言" instructions in
// the system prompt are a request, not a guarantee — strip the common
// acknowledgment openers as a deterministic backstop, applied once at the
// single choke point every caption passes through (regardless of which
// parse layer produced it).
export const LEADING_ACK_RE =
  /^(?:好的[，,！!。]?\s*)?(?:我(?:已)?收到(?:你|您)的(?:任務|需求|指令)了?|以下(?:是|為)(?:你|您)?(?:準備|規劃|產出)?的?|這(?:是|篇是)(?:你|您)?(?:的)?|我(?:會|將)(?:為(?:你|您))?)[^\n，,：:]{0,60}[，,：:\n]\s*/;

export function stripCaptionPreamble(caption: string): string {
  const stripped = caption.replace(LEADING_ACK_RE, "").trim();
  return stripped.length > 0 ? stripped : caption;
}

// C1 (bug checklist 2026-08): internal artifacts must NEVER reach public copy.
// The caption writer sometimes surfaces (a) image visual-direction briefs
// (「視覺方向：…」/「圖片指令：…」) when a task pairs copy+image, (b) internal
// snake_case plan keys (live_strategy_plan / authentic_story_bank / viral_source),
// or (c) code tokens ([Headline / Primary / CTA]). Strip them at the single
// caption choke point. If a variant is PURE leak (nothing real left), return
// empty so the writer retries for real copy — shipping the leak is worse.
export const DRAFT_LINE_RE = /^[ \t]*(視覺方向|圖片指令|配圖建議|配圖|繪圖指令|image\s*prompt|imageprompt|visual\s*direction)[ \t]*[:：][^\n]*$/gim;

// Any multi-word snake_case token is an internal output/plan key (the strategy
// squads use dozens: content_documentation_plan, authentic_story_bank,
// vulnerability_content_scripts, repurposed_content_set, viral_source, …) and is
// never legit in public copy. The surrounding lookarounds protect URLs / emails /
// filenames (slash / dot / @ / word-char neighbours are left alone).
export const INTERNAL_KEY_RE = /(?<![\/\w.@])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\/\w.@])/g;

export const CODE_TOKEN_RE = /\[\s*(?:Headline|Primary(?:\s*Text)?|CTA|Description|Hook|Body)\s*(?:\/\s*(?:Headline|Primary(?:\s*Text)?|CTA|Description|Hook|Body)\s*)*\]/gi;

export function sanitizeCaption(caption: string): string {
  const cleaned = caption
    .replace(DRAFT_LINE_RE, "")
    .replace(INTERNAL_KEY_RE, "")
    .replace(CODE_TOKEN_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned; // may be "" for a pure-leak variant → caller retries
}

/**
 * 2026-05-11 (CJ「文案前面幾句重複的問題」) — merge LLM-written hook with
 * user-provided article body, defensively de-duplicating any opening lines.
 *
 * The LLM is instructed to write ONLY a hook (30-60 chars). It sometimes
 * ignores this and either:
 *  (a) writes the full caption including the body's opening,
 *  (b) truncates mid-sentence at the token limit while ALSO including
 *      the body opener, so the user sees "[truncated lead]…[full body]"
 *      with the same first line twice.
 *
 * Strategy:
 *  1. Split both strings into paragraphs.
 *  2. If the hook's last paragraph is a substring/superstring of the
 *     body's first paragraph (>= 60% overlap), drop the duplicate.
 *  3. If the hook is suspiciously long (> 200 chars), trim it back to
 *     the first 1-2 sentences (the actual hook).
 *  4. Join with double newline.
 *
 * Idempotent + safe for the normal case (short hook, no overlap).
 */
export function mergeHookAndBody(hook: string, body: string): string {
  const cleanHook = hook.trim();
  const cleanBody = body.trim();
  if (!cleanBody) return cleanHook;
  if (!cleanHook) return cleanBody;

  // Step 1: trim back a runaway "hook" that's actually a full caption.
  let h = cleanHook;
  if (h.length > 200) {
    // Take first 1-2 sentences (ending on Chinese or ASCII terminator).
    const m = h.match(/^[\s\S]*?[。！？!?]/);
    if (m && m[0].length >= 20 && m[0].length <= 200) {
      h = m[0].trim();
    } else {
      // Fallback: first 120 chars
      h = h.slice(0, 120).trim();
    }
  }

  // Step 2: dedupe overlap between end of hook and start of body.
  const bodyFirstPara = cleanBody.split(/\n\s*\n/)[0] ?? cleanBody;
  const bodyFirstSentence = (bodyFirstPara.match(/^[^。！？!?\n]+[。！？!?]?/) ?? [bodyFirstPara])[0]!.trim();
  if (bodyFirstSentence.length >= 10 && h.includes(bodyFirstSentence)) {
    // Hook already contains body's opening — drop body's opening from body.
    const rest = cleanBody.slice(bodyFirstPara.indexOf(bodyFirstSentence) + bodyFirstSentence.length).trimStart();
    // If there's a paragraph break right after, keep it; otherwise add one.
    const sep = rest.startsWith("\n") ? "" : "\n\n";
    return `${h}${sep}${rest}`;
  }

  // Step 3: check if hook is a substring of body opener (rare, but defensive).
  if (h.length >= 15 && cleanBody.startsWith(h)) {
    return cleanBody;
  }

  return `${h}\n\n${cleanBody}`;
}

/**
 * 2026-05-12 (CJ「文案中第一段話跟最後一段重複」): after mergeHookAndBody
 * we still see captions where the writer LLM internally duplicated content
 * (hook appears twice, hashtags 3x, etc). Run a strong pass that detects:
 *   - Duplicate paragraphs (same after whitespace/punctuation normalize)
 *   - Duplicate hashtag-only lines (collapse to last occurrence)
 *   - Adjacent sentences with high overlap (≥80%)
 */
export function deduplicateInternalCaption(text: string): string {
  if (!text) return text;
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/[\s　]+/g, " ")
      .replace(/[，。、！？!?，、：:；;]/g, "")
      .trim();

  // Split into paragraphs by blank lines
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) return text;

  const HASHTAG_LINE_RE = /^(\s*#\S+\s*)+$/;
  const seen = new Set<string>();
  const out: string[] = [];
  // Walk in REVERSE so the LAST occurrence of hashtags wins (industry
  // convention: hashtags at end of post).
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i]!;
    const key = norm(p);
    if (!key) continue;
    // Skip if this exact paragraph already accepted later in the post
    if (seen.has(key)) continue;
    // For hashtag-only paragraphs: also dedupe by the set of hashtags
    // (handles "#a #b #c" vs "#a #b #c " with trailing space variants).
    if (HASHTAG_LINE_RE.test(p)) {
      const hashtagKey = "HASHTAGS:" + p.match(/#\S+/g)!.sort().join(" ").toLowerCase();
      if (seen.has(hashtagKey)) continue;
      seen.add(hashtagKey);
    }
    // For sentence-form paragraphs: also block paragraphs that are
    // substrings of an already-accepted paragraph (handles "X with hashtags"
    // vs "X" appearing as separate paragraphs).
    let isSubsetOfAccepted = false;
    for (const accepted of seen) {
      if (accepted.length > 10 && accepted.includes(key) && key.length >= 10) {
        isSubsetOfAccepted = true;
        break;
      }
    }
    if (isSubsetOfAccepted) continue;
    seen.add(key);
    out.unshift(p);
  }
  return out.join("\n\n");
}
