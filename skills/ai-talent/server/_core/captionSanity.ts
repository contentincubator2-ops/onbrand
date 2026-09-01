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

const FIRST_PERSON_BLOCKING_ZH_RE =
  /我無法(?:直接)?(?:產出|撰寫|完成)(?:這(?:篇|則)?(?:貼文|文案|任務))?/;

const OPERATOR_CONTEXT_ZH_RE =
  /你(?:給|提供)的(?:資訊|素材|資料|內容|連結)|用戶提供|本次任務|工作原則|不能反問|素材不足|抓取(?:結果|資料|內容)|來源連結|輸出(?:格式|要求)|產出成品/i;

const DELIBERATION_ZH_PATTERNS = [
  /我(?:有|面臨).{0,12}(?:兩個|2\s*個|數個|幾個)選項/,
  /我(?:會)?選擇.{0,12}(?:選項\s*)?[一二三四五六七八九\d]+/,
  /(?:^|\n)\s*(?:[-—]{2,}\s*)?抓取結果\s*[：:]/m,
  /根據(?:我的)?工作原則.{0,24}(?:不能|不得|必須)/,
  /我的處理方式\s*[：:]/,
  /(?:我將|我會|我只能).{0,20}(?:採用|啟用|改用)?\s*(?:降級|替代)策略/,
  /讓我(?:先|直接)?(?:查|查詢|搜尋|分析|確認|看)/,
  /我需要先(?:看清楚|確認|分析).{0,24}(?:你(?:給|提供)的|來源|連結|內容)/,
  /(?:連結|來源|內容).{0,20}無法.{0,20}(?:解析|抓取|取得)/,
] as const;

const INTERNAL_INPUT_KEY_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsInternalInputKey(text: string, inputKeys: readonly string[]): boolean {
  return inputKeys.some((key) => {
    if (!INTERNAL_INPUT_KEY_RE.test(key)) return false;
    return new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegExp(key)}(?:$|[^A-Za-z0-9_])`, "i").test(text);
  });
}

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
  opts: { isZhTW: boolean; structured?: boolean; inputKeys?: readonly string[] },
): { bad: boolean; reason: string } | null {
  const value = (text ?? "").trim();
  if (!value) return null;

  // Internal snake_case keys are never publishable. Keep this before the
  // structured-output bypass: every caption must obey the same leak guard.
  if (containsInternalInputKey(value, opts.inputKeys ?? [])) {
    return { bad: true, reason: "internal-input-key" };
  }

  if (opts.structured) return null;

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

  // A delayed first-person refusal is still operator-facing even when it
  // appears after a long preamble. Require task/operator context so normal
  // narrative uses of 「無法完成」 remain publishable.
  const earlyBody = Array.from(value).slice(0, 240).join("");
  if (
    FIRST_PERSON_BLOCKING_ZH_RE.test(earlyBody) &&
    TASK_VOCABULARY_ZH_RE.test(earlyBody) &&
    OPERATOR_CONTEXT_ZH_RE.test(earlyBody)
  ) {
    return { bad: true, reason: "clarification-zh" };
  }

  // Reject the model narrating its own deliberation/fetch workflow. Generic
  // words such as 「選項」「結果」「原則」 are intentionally insufficient:
  // precise first-person/process phrases and operator context must co-occur.
  const deliberationSignalCount = DELIBERATION_ZH_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(value) ? 1 : 0),
    0,
  );
  if (deliberationSignalCount >= 2 && OPERATOR_CONTEXT_ZH_RE.test(value)) {
    return { bad: true, reason: "deliberation-zh" };
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
