/**
 * positioningPrompts — AI 指令庫 templates per scope (brand / product /
 * event). Each template has variable placeholders ({變數}) auto-filled
 * from the active positioning JSON, plus copy buttons for ChatGPT /
 * Claude / Gemini / Midjourney.
 *
 * Six categories per scope: 官網文案 / 社群貼文 / 廣告文案 / SEO內容 /
 * 電子郵件 / 視覺生成 (Midjourney). Variables auto-filled from segments
 * via `interpolatePrompt(template, scopeData)`.
 */

export type LLM = "chatgpt" | "claude" | "gemini" | "midjourney";

export interface PromptTemplate {
  id: string;
  category: "官網文案" | "社群貼文" | "廣告文案" | "SEO內容" | "電子郵件" | "視覺生成";
  title: string;
  description: string;
  /** Body with {變數} placeholders. */
  body: string;
  /** Variable keys (Chinese labels). */
  variables: string[];
  /** Which LLMs are recommended for this template. */
  llms: LLM[];
}

// ── BRAND ────────────────────────────────────────────────────────────────
export const BRAND_PROMPTS: PromptTemplate[] = [
  {
    id: "brand-hero",
    category: "官網文案",
    title: "產品頁 Hero Section 文案",
    description: "生成官網首頁 H1 / H2 + CTA",
    body: `你是一位專業的文案專家。請根據以下品牌定位資訊，為 {品牌名稱} 撰寫官網首頁 Hero Section 文案：

品牌名稱：{品牌名稱}
核心價值：{核心價值}
目標受眾：{目標受眾}
品牌標語：{品牌標語}

要求：
1. 主標題（H1）：簡潔有力，10-15 字，突出核心價值
2. 副標題（H2）：補充說明，20-30 字，強化情緒連結
3. CTA 按鈕文案：行動導向，3-5 字
4. 提供 3 組不同風格的方案（理性、感性、創意）

請以 JSON 格式輸出，包含 title, subtitle, cta 三個欄位。
請以繁體中文回答。`,
    variables: ["品牌名稱", "核心價值", "目標受眾", "品牌標語"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "brand-social",
    category: "社群貼文",
    title: "Instagram 品牌貼文",
    description: "3 則符合品牌定位的 IG 貼文",
    body: `你是社群媒體專家。請為 {品牌名稱} 撰寫 3 則 Instagram 品牌貼文：

品牌名稱：{品牌名稱}
核心價值：{核心價值}
目標受眾：{目標受眾}
品牌調性：{品牌調性}

要求：
1. 每則貼文 150-200 字
2. 包含 3-5 個相關 hashtag
3. 調性符合品牌定位
4. 包含 CTA
5. 適度使用 emoji

請提供 3 種風格：故事型、教育型、互動型。請以繁體中文回答。`,
    variables: ["品牌名稱", "核心價值", "目標受眾", "品牌調性"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "brand-google-ads",
    category: "廣告文案",
    title: "Google Ads 搜尋廣告",
    description: "3 標題 + 2 描述",
    body: `你是 Google Ads 廣告專家。請為 {品牌名稱} 撰寫搜尋廣告文案。

品牌名稱：{品牌名稱}
核心價值：{核心價值}
目標受眾：{目標受眾}
競爭優勢：{競爭優勢}

要求：
1. 提供 3 個標題（每個 30 字以內）
2. 提供 2 個描述（每個 90 字以內）
3. 提供 2 組版本（理性訴求 vs 感性訴求）
請以繁體中文回答。`,
    variables: ["品牌名稱", "核心價值", "目標受眾", "競爭優勢"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "brand-seo",
    category: "SEO內容",
    title: "SEO 部落格大綱",
    description: "符合品牌定位的長文大綱",
    body: `請為 {品牌名稱} 撰寫 SEO 部落格文章大綱：

品牌名稱：{品牌名稱}
核心價值：{核心價值}
目標受眾：{目標受眾}
主要關鍵字：[請補上 3-5 個關鍵字]

要求：
1. 文章主題符合品牌定位和目標受眾興趣
2. 包含 H1 / H2 / H3 結構
3. 自然融入關鍵字
4. 包含 CTA + 內部連結建議

請提供 3 個不同類型的大綱：教育型 / 比較型 / 故事型。
請以繁體中文回答。`,
    variables: ["品牌名稱", "核心價值", "目標受眾"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "brand-edm",
    category: "電子郵件",
    title: "歡迎信 EDM",
    description: "首次訂閱者的歡迎郵件",
    body: `請為 {品牌名稱} 撰寫電子郵件歡迎信：

品牌名稱：{品牌名稱}
核心價值：{核心價值}
目標受眾：{目標受眾}
品牌調性：{品牌調性}

要求：
1. 主旨：30 字以內，吸引人開信
2. 開場：建立情感連結
3. 主體：介紹品牌價值
4. CTA：明確行動呼籲（如首次優惠）
5. 結尾：強化品牌承諾

請提供完整郵件（主旨 + 內文 + CTA），繁體中文。`,
    variables: ["品牌名稱", "核心價值", "目標受眾", "品牌調性"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "brand-mj",
    category: "視覺生成",
    title: "Midjourney 品牌主視覺",
    description: "3 組視覺指令（主視覺 / 社群橫幅 / 場景圖）",
    body: `請為 {品牌名稱} 生成 3 組 Midjourney 品牌主視覺指令：

品牌名稱：{品牌名稱}
核心價值：{核心價值}
品牌調性：{品牌調性}
色彩風格：{色彩風格}

要求：
1. 視覺要傳達核心理念
2. 風格現代、簡約、國際化
3. 適合社群媒體 / 廣告 / 官網

提供 3 個指令：
- 指令 1：品牌主視覺 (Key Visual)
- 指令 2：社群媒體背景
- 指令 3：產品 / 場景圖

請以繁體中文輸出指令說明，Midjourney prompt 部分用英文。`,
    variables: ["品牌名稱", "核心價值", "品牌調性", "色彩風格"],
    llms: ["midjourney"],
  },
];

// ── PRODUCT ──────────────────────────────────────────────────────────────
export const PRODUCT_PROMPTS: PromptTemplate[] = [
  {
    id: "product-hero",
    category: "官網文案",
    title: "產品頁 Hero",
    description: "產品頁主標 / 副標 / CTA",
    body: `請根據以下資訊為 {產品名稱} 撰寫產品頁 Hero Section 文案：

產品名稱：{產品名稱}
產品標語：{產品標語}
核心價值：{核心價值}
目標受眾：{目標受眾}

要求：
1. 主標題：10-15 字
2. 副標題：20-30 字
3. CTA 按鈕：3-5 字
4. 3 組風格：理性、感性、創意

JSON 格式輸出：title / subtitle / cta。繁體中文。`,
    variables: ["產品名稱", "產品標語", "核心價值", "目標受眾"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "product-features",
    category: "官網文案",
    title: "產品特色說明",
    description: "從 4P 提煉特色",
    body: `請為 {產品名稱} 撰寫產品特色說明文案：

產品名稱：{產品名稱}
產品 4P 分析：{產品 4P 分析}

要求：
1. 提煉 3-5 個核心特色
2. 每個特色：名稱 + 50-80 字說明 + 使用場景
3. 專業但易懂

結構化輸出，繁體中文。`,
    variables: ["產品名稱", "產品 4P 分析"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "product-google-ads",
    category: "廣告文案",
    title: "Google Ads 搜尋廣告",
    description: "3 組廣告（品牌詞 / 類別詞 / 問題解決）",
    body: `為 {產品名稱} 撰寫 Google Ads 搜尋廣告文案。

產品名稱：{產品名稱}
產品標語：{產品標語}
核心價值：{核心價值}
目標受眾：{目標受眾}

要求 3 組廣告：
- 組 1：品牌詞搜尋
- 組 2：類別搜尋
- 組 3：問題解決搜尋

每組需 title1 / title2 / title3 / description JSON。繁體中文。`,
    variables: ["產品名稱", "產品標語", "核心價值", "目標受眾"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "product-social",
    category: "社群貼文",
    title: "Instagram 產品貼文",
    description: "3 風格 IG 貼文（展示 / 場景 / 見證）",
    body: `為 {產品名稱} 撰寫 3 則 IG 貼文：

產品名稱：{產品名稱}
產品標語：{產品標語}
核心價值：{核心價值}
目標受眾：{目標受眾}

要求：
1. 100-150 字
2. 3-5 hashtag
3. 包含 CTA + emoji

3 種風格：產品展示 / 使用場景 / 用戶見證。繁體中文。`,
    variables: ["產品名稱", "產品標語", "核心價值", "目標受眾"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "product-compare",
    category: "SEO內容",
    title: "競品比較文",
    description: "客觀比較與選擇建議",
    body: `為 {產品名稱} 撰寫與競品的比較說明：

產品名稱：{產品名稱}
產品標語：{產品標語}
核心價值：{核心價值}
競爭優勢：{競爭優勢}
差異化特色：{差異化特色}

要求：
1. 200-300 字
2. 客觀比較，不貶低競品
3. 突出獨特價值
4. 提供選擇建議
5. 比較維度：產品特色 / 價格 / 適用場景 / 受眾 / 獨特優勢
表格或條列。繁體中文。`,
    variables: ["產品名稱", "產品標語", "核心價值", "競爭優勢", "差異化特色"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "product-edm",
    category: "電子郵件",
    title: "EDM 行銷信",
    description: "3 類型 EDM（新品 / 限時 / 教學）",
    body: `為 {產品名稱} 撰寫電子郵件行銷內容：

產品名稱：{產品名稱}
產品標語：{產品標語}
核心價值：{核心價值}
目標受眾：{目標受眾}

要求：
1. 主旨 10-15 字
2. 開頭問候 + 興趣鉤
3. 產品介紹（100-150 字）
4. 明確 CTA
5. 結尾簽名

3 種類型：新品推薦 / 限時優惠 / 使用教學。繁體中文。`,
    variables: ["產品名稱", "產品標語", "核心價值", "目標受眾"],
    llms: ["chatgpt", "claude", "gemini"],
  },
];

// ── EVENT ────────────────────────────────────────────────────────────────
export const EVENT_PROMPTS: PromptTemplate[] = [
  {
    id: "event-social",
    category: "社群貼文",
    title: "活動社群貼文",
    description: "IG / FB / Threads 活動貼文",
    body: `你是資深行銷文案專家。請為以下活動撰寫社群媒體貼文：

活動名稱：{活動名稱}
推廣對象：{推廣對象}
核心概念：{核心概念}
活動標語：{活動標語}
目標管道：{目標管道}

提供 3 種風格：
1. 故事型
2. 教育型
3. 互動型

每則含正文（200 字內）+ 3-5 hashtag + 配圖方向。繁體中文。`,
    variables: ["活動名稱", "推廣對象", "核心概念", "活動標語", "目標管道"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "event-ads",
    category: "廣告文案",
    title: "Meta + Google Display 廣告",
    description: "理性 + 感性 兩個版本",
    body: `為以下活動撰寫廣告文案：

活動名稱：{活動名稱}
推廣對象：{推廣對象}
活動定位陳述：{活動定位陳述}
核心訊息：{核心概念}

【Meta 廣告】
- 主標題（40 字）
- 副標題（20 字）
- 廣告正文（125 字）
- CTA 按鈕

【Google Display】
- 短標題 1（30 字）
- 短標題 2（30 字）
- 長標題（90 字）
- 描述（90 字）

提供 2 組（理性 / 感性）。繁體中文。`,
    variables: ["活動名稱", "推廣對象", "活動定位陳述", "核心概念"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "event-kol",
    category: "社群貼文",
    title: "KOL 合作提案",
    description: "發給 KOL 的合作邀請",
    body: `為以下活動撰寫 KOL 合作提案：

活動名稱：{活動名稱}
推廣對象：{推廣對象}
活動概念：{核心概念}
標語：{活動標語}

提案需包含：
1. 活動概述（150 字內）
2. 理想 KOL 輪廓
3. 合作形式建議
4. 內容指引
5. 成效指標 (KPI)

繁體中文。`,
    variables: ["活動名稱", "推廣對象", "核心概念", "活動標語"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  // 2026-09-29 CJ：新聞稿通路下架，「活動發布新聞稿」指令範本一併拿掉（id: event-pr）。
  {
    id: "event-edm",
    category: "電子郵件",
    title: "活動電子報",
    description: "活動推廣 EDM",
    body: `為以下活動撰寫電子報：

活動名稱：{活動名稱}
推廣對象：{推廣對象}
活動概念：{核心概念}

需要：
1. 主旨（30 字內）
2. Preview text（50 字內）
3. 郵件正文
4. CTA 按鈕（5-10 字）

提供 3 組主旨變體。繁體中文。`,
    variables: ["活動名稱", "推廣對象", "核心概念"],
    llms: ["chatgpt", "claude", "gemini"],
  },
  {
    id: "event-mj",
    category: "視覺生成",
    title: "Midjourney 活動主視覺",
    description: "3 組視覺（主視覺 / 橫幅 / 場景）",
    body: `為以下活動生成 Midjourney 主視覺指令：

活動名稱：{活動名稱}
核心概念：{核心概念}
活動標語：{活動標語}

提供 3 組：
- 指令 1：活動主視覺
- 指令 2：社群媒體橫幅
- 指令 3：產品場景圖

說明繁體中文，Midjourney prompt 用英文。`,
    variables: ["活動名稱", "核心概念", "活動標語"],
    llms: ["midjourney"],
  },
];

export const SCOPE_PROMPTS = {
  brand:   BRAND_PROMPTS,
  product: PRODUCT_PROMPTS,
  event:   EVENT_PROMPTS,
} as const;

/**
 * Pluck variables from positioning JSON. Best-effort lookup across
 * common segment paths. Unfilled vars stay as {變數} for the user to
 * replace after copy.
 */
export function buildVariableMap(scopeMode: "brand" | "product" | "event", positioning: any, fallbackName: string): Record<string, string> {
  const p = positioning ?? {};
  if (scopeMode === "brand") {
    const tagline = [p.tagline?.zhTagline, p.tagline?.enTagline].filter(Boolean).join(" / ");
    return {
      "品牌名稱": fallbackName,
      "核心價值": p.differentiation?.summary
        ?? p.values?.items?.map((v: any) => v.label).filter(Boolean).join(" / ")
        ?? "",
      "目標受眾": p.audience?.primary ?? "",
      "品牌標語": tagline,
      "品牌調性": p.voice?.tone?.join(" / ") ?? "",
      "色彩風格": "",
      "競爭優勢": p.differentiation?.functional ?? "",
    };
  }
  if (scopeMode === "product") {
    const tagline = [p.core?.zhTagline, p.core?.enTagline].filter(Boolean).join(" / ");
    return {
      "產品名稱": fallbackName,
      "產品標語": tagline,
      "核心價值": p.core?.oneLineValueProp ?? p.core?.coreStatement ?? "",
      "目標受眾": p.audience?.primary ?? "",
      "產品 4P 分析": [
        p.strategy?.positioning && `Product: ${p.strategy.positioning}`,
        p.strategy?.pricing && `Price: ${p.strategy.pricing}`,
        p.strategy?.channel && `Place: ${p.strategy.channel}`,
        Array.isArray(p.strategy?.promotion) ? `Promotion: ${p.strategy.promotion.join(" / ")}` : "",
      ].filter(Boolean).join("\n"),
      "競爭優勢": p.competition?.uniqueUsp ?? "",
      "差異化特色": p.competition?.uniqueUsp ?? "",
    };
  }
  if (scopeMode === "event") {
    const tagline = [p.overview?.zhTagline, p.overview?.enTagline].filter(Boolean).join(" / ");
    const channels = Array.isArray(p.solution?.channels) ? p.solution.channels.join(" / ") : "";
    return {
      "活動名稱": p.overview?.name ?? fallbackName,
      "推廣對象": fallbackName,
      "核心概念": p.solution?.coreConcept ?? "",
      "活動標語": tagline,
      "活動定位陳述": p.overview?.positioningStatement ?? "",
      "目標管道": channels,
    };
  }
  return {};
}

export function interpolatePrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (m, key) => {
    const v = vars[key];
    return v && v.trim() ? v : m;
  });
}

export function llmCopyUrl(llm: LLM, body: string): string | null {
  // Most providers don't accept a "?prompt=" query param, so we just
  // copy to clipboard. Returning null tells the UI to fall back to
  // navigator.clipboard.writeText. We keep the function in case a
  // provider adds direct-copy support later.
  void llm; void body;
  return null;
}
