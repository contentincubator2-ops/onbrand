/** Detect model responses that are not publishable caption content. */

const TASK_VOCABULARY_ZH_RE =
  /貼文|caption|文案|標題|撰寫|產出|素材|連結|URL|品牌(?:資訊|定位|大腦)|指令|任務|這篇|這則|受眾|活動日期|活動背景|活動資訊|產品特色|賣點|目標受眾|規格|需求/i;

const BLOCKING_REQUEST_ZH_RE =
  /無法(?:直接)?(?:產出|撰寫|完成)|資訊不足|我需要知道|請(?:提供|補充).{0,15}(?:資訊|素材|細節|資料|內容|背景|方向|受眾|主題|需求|更多|說明)|請先提供/;

const STRONG_META_EN_RE =
  /\bI need clarification\b|\bbefore proceeding\b|\bcritical blocker\b|\bper my instructions\b|\bthe brand context provided\b|\bCould you (?:confirm|clarify)\b|\bI (?:cannot|can't) produce\b|\bI need to analyze\b|\bthe extracted content\b/i;

const WEAK_META_EN_RE =
  /\bI notice\b|\bLet me know\b|\bI cannot\b|\bI can't\b|\bclarification\b/gi;

const TASK_VOCABULARY_EN_RE =
  /\bthe URL\b|\bthe brand\b|\bthe content you\b|\bextracted\b|\bcaption\b|\bthe post\b|\byour instructions\b|\bcontext provided\b|\byour input\b/i;

const SYSTEM_REFERENCE_RE =
  /\bsystem (?:prompt|context)\b|我的指令|依照我的指示/i;

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

/**
 * Returns a short reason when text is a clarification/meta response or is in
 * the wrong language. English meta patterns are intentionally gated behind
 * English-dominant text so an English quote inside Chinese copy is harmless.
 */
export function detectNonDeliverable(
  text: string,
  opts: { isZhTW: boolean; structured?: boolean },
): { bad: boolean; reason: string } | null {
  if (opts.structured) return null;

  const value = (text ?? "").trim();
  if (!value) return null;

  const charCount = Array.from(value).length;

  // Chinese meta responses discuss the task itself and also contain a blocker
  // or request. Very short blocker/request responses remain guarded because
  // micro-copy tasks may not include explicit task vocabulary.
  const opening = Array.from(value).slice(0, 80).join("");
  const zhBlockingRequestMatch = opening.match(BLOCKING_REQUEST_ZH_RE);
  const hasZhBlockingRequest = zhBlockingRequestMatch !== null;
  const openingWithoutBlockingRequest = zhBlockingRequestMatch
    ? `${opening.slice(0, zhBlockingRequestMatch.index)}${opening.slice(
        (zhBlockingRequestMatch.index ?? 0) + zhBlockingRequestMatch[0].length,
      )}`
    : opening;
  const hasZhTaskVocabulary = TASK_VOCABULARY_ZH_RE.test(openingWithoutBlockingRequest);
  if (
    (hasZhTaskVocabulary && hasZhBlockingRequest) ||
    (charCount < 40 && zhBlockingRequestMatch?.index === 0)
  ) {
    return { bad: true, reason: "clarification-zh" };
  }

  if (SYSTEM_REFERENCE_RE.test(value)) {
    return { bad: true, reason: "system-reference" };
  }

  // Links and hashtags are distribution metadata, not the prose language.
  // Excluding them prevents a long URL or English campaign tag from making
  // otherwise Chinese copy look English-dominant.
  const prose = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ");
  const latinCount = countMatches(prose, /[A-Za-z]/g);
  const hanCount = countMatches(prose, /[一-鿿]/g);
  const letterCount = latinCount + hanCount;
  const englishRatio = letterCount > 0 ? latinCount / letterCount : 0;

  if (englishRatio > 0.5) {
    const weakSignalCount = value.match(WEAK_META_EN_RE)?.length ?? 0;
    if (
      STRONG_META_EN_RE.test(value) ||
      (weakSignalCount >= 1 && TASK_VOCABULARY_EN_RE.test(value))
    ) {
      return { bad: true, reason: "meta-clarification-en" };
    }
  }

  const chineseRatio = letterCount > 0 ? hanCount / letterCount : 0;
  if (opts.isZhTW && charCount > 40 && chineseRatio < 0.3) {
    return { bad: true, reason: "language-not-zh-tw" };
  }

  return null;
}
