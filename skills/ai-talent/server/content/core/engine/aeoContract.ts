/**
 * 轉成 AI 搜尋版 —— 2026-10-10。
 *
 * CJ「將所有 onbrand 產出的內容，都增加 AI SEO 的作法……而且我們真實能做到」。
 * AI 搜尋（ChatGPT／Perplexity／Google AI 摘要）引用的是公開網頁、YouTube 與新聞，
 * 社群貼文幾乎不會被引用。所以做法不是在 FB／IG 貼文上加什麼，而是每寫完一篇，
 * 同一件事多產一份 AI 讀得到的版本：
 *
 *   web-qa          官網問答：一個顧客會問的問題＋一句可以單獨被引用的答案＋展開
 *   yt-description  YouTube 標題＋說明欄（同一個主題拍成影片時貼上去的文字）
 *
 * 這裡只有純函式：prompt 段落、解析、驗證、確定性修補、結構化資料。
 * 跟 restyleContract 同一條鐵律——**原稿是唯一的事實來源**；原稿沒有可以回答的事實
 * 就老實說轉不了（【無法轉換】），不替它編。
 *
 * 能承諾的只有「格式是 AI 讀得到、可以單獨引用的」；會不會被引用不在我們手上，
 * 文案與畫面都不能寫成保證。
 */

export const AEO_TARGETS = ["web-qa", "yt-description"] as const;
export type AeoTarget = (typeof AEO_TARGETS)[number];

/** 存成產出時掛在哪張任務卡底下（成品頁照這張卡套版型，專案頁照它分通路）。 */
export const AEO_TARGET_TASK: Record<AeoTarget, { taskId: string; workspace: string; labelZh: string; labelEn: string }> = {
  "web-qa": { taskId: "web-30-product-faq", workspace: "website", labelZh: "官網問答", labelEn: "Website Q&A" },
  "yt-description": { taskId: "yt-30-description-seo", workspace: "youtube", labelZh: "YouTube 標題＋說明欄", labelEn: "YouTube title + description" },
};

/** 本身就是 AI 讀得到的通路——這些產出不需要再轉。 */
const AEO_NATIVE_PLATFORMS = new Set(["website", "web", "youtube", "yt", "pr", "press"]);
export function isAeoNativePlatform(platform: string | null | undefined): boolean {
  return !!platform && AEO_NATIVE_PLATFORMS.has(platform.toLowerCase());
}

export const AEO_LIMITS = {
  questionMax: 45,
  answerMin: 30,
  answerMax: 140,
  bodyMax: 300,
  ytTitleMax: 70,
  ytDescriptionMin: 100,
} as const;

export interface AeoFields {
  /** web-qa */
  question?: string;
  answer?: string;
  body?: string;
  /** yt-description */
  title?: string;
  description?: string;
}

export interface AeoParsed {
  fields: AeoFields;
  /** 模型判斷原稿沒有可以回答的事實。 */
  noConvert: boolean;
  reason: string;
}

const NO_CONVERT = "【無法轉換】";

/** 接在 system prompt 最後的格式合約。 */
export function aeoContractBlock(target: AeoTarget, opts: { brandName?: string | null } = {}): string {
  const brand = (opts.brandName ?? "").trim();
  const brandRule = brand
    ? `一定要出現品牌名「${brand}」，不要用「我們」「本品牌」「本產品」代稱——這一句會被單獨摘走，代稱就沒有人知道在講誰。`
    : "一定要寫出品牌或產品的名字，不要用「我們」「本產品」代稱。";
  const facts = [
    "【事實規則 —— 勝過其他任何一句】",
    "- 原稿是唯一的事實來源：產品、功能、流程、玩法、價格、數字、日期、成分、功效，只能用原稿裡寫到的。",
    "- 上面的品牌資料只用來確認品牌與產品的正式名稱、一句話的定位。原稿沒提到的功能、做法、數字，就算品牌資料裡有、就算你本來就知道，也不要寫進來。",
    "- 不補案例、不補數據、不補見證、不寫「第一」「最」這類原稿沒有的比較。",
    "- 原稿事實不多就寫短。寧可只有兩三句真的，不要為了湊長度多寫一句原稿沒有的。",
    "- 不寫會過期的時間（今天、今日、明天、本週、這個月）。原稿有確切日期才寫日期，沒有就不提時間。",
    target === "web-qa" ? "- 純文字，不要 Markdown 符號（**、#、-），不要 emoji。" : "- 不要 Markdown 粗體與小標題，不要 emoji。",
    `- 原稿只是情緒、迷因或互動貼文，抽不出任何可以回答顧客問題的事實時，只回一行：${NO_CONVERT}＋一句原因。不要硬寫。`,
  ];
  if (target === "web-qa") {
    return [
      "",
      "【這次的任務：把這篇貼文轉成一則官網問答】",
      "AI 搜尋引擎回答問題時，會從網頁上摘一句能單獨成立的答案。把原稿在講的那件事，改寫成一問一答。",
      "",
      "只輸出下面三段，標記照抄，不要加其他說明：",
      "【問題】",
      `一個顧客真的會拿去問 AI 的問題。用顧客的話，不是品牌的話；${AEO_LIMITS.questionMax} 字以內；以問號結尾。`,
      "這個問題必須只靠原稿就答得完整。原稿沒寫的事（怎麼參加、多少錢、哪裡買）不要問。",
      "【直接答案】",
      `${AEO_LIMITS.answerMin}–${AEO_LIMITS.answerMax} 字，一到兩句，不看問題也讀得懂。${brandRule}`,
      "先講結論，不要鋪陳、不要反問、不要 emoji、不要 hashtag。",
      "【展開】",
      `原稿裡支持這個答案的其他細節，最多 ${AEO_LIMITS.bodyMax} 字、最多 3 小段。平鋪直敘，不要社群口吻、不要小標題。`,
      "原稿沒有更多可以補的，這一段就只寫一兩句，或整段留空。",
      "",
      ...facts,
    ].join("\n");
  }
  return [
    "",
    "【這次的任務：把這篇貼文轉成 YouTube 影片的標題與說明欄】",
    "同一個主題拍成影片上傳時要貼的文字。AI 搜尋讀得到的是標題、說明欄與字幕，不是畫面。",
    "",
    "只輸出下面兩段，標記照抄，不要加其他說明：",
    "【標題】",
    `${AEO_LIMITS.ytTitleMax} 字以內，講清楚這支影片回答什麼問題；${brand ? `帶到「${brand}」或產品名` : "帶到品牌或產品名"}。不要全形驚嘆號堆疊、不要誇大。`,
    "【說明欄】",
    `前兩行（合計 120 字內）直接講這支影片的重點——收合時只看得到這兩行。${brandRule}`,
    "接著列 3–5 個重點（每行一個，用「・」開頭），最後最多 3 個 hashtag。",
    "不要寫時間軸（00:00 這種）——我們不知道影片怎麼剪；不要編連結、折扣碼、聯絡方式。",
    "",
    ...facts,
  ].join("\n");
}

function section(raw: string, name: string, others: string[]): string {
  const start = raw.indexOf(`【${name}】`);
  if (start === -1) return "";
  const from = start + name.length + 2;
  let end = raw.length;
  for (const o of others) {
    const i = raw.indexOf(`【${o}】`, from);
    if (i !== -1 && i < end) end = i;
  }
  return raw.slice(from, end).trim();
}

export function parseAeoReply(target: AeoTarget, raw: string): AeoParsed {
  const text = String(raw ?? "").trim();
  const no = text.indexOf(NO_CONVERT);
  const names = target === "web-qa" ? ["問題", "直接答案", "展開"] : ["標題", "說明欄"];
  const got = names.map((n) => section(text, n, names.filter((x) => x !== n)));
  if (no !== -1 && got.every((g) => !g)) {
    return { fields: {}, noConvert: true, reason: text.slice(no + NO_CONVERT.length).replace(/^[\s:：，,]+/, "").trim() };
  }
  const fields: AeoFields = target === "web-qa"
    ? { question: got[0], answer: got[1], body: got[2] }
    : { title: got[0], description: got[1] };
  return { fields, noConvert: false, reason: "" };
}

/** Markdown 殘留：貼進官網後台會變成一堆星號與井字號。 */
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 全形數字與百分號轉半形、拿掉千分位，比對用。 */
const normalizeDigits = (s: string) => s
  .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  .replace(/％/g, "%")
  .replace(/(\d)[，,](?=\d{3}(?!\d))/g, "$1");

/**
 * 產出裡出現、但來源（原稿＋品牌資料）裡找不到的數字。
 * 編出來的內容裡最傷的就是數字（「省下 60–70% 時間」）——而數字剛好是程式驗得出來的。
 * 只比對數字本身，不管單位；單一個 1–9 不算（「一到兩句」「3 個重點」太容易誤判）。
 */
export function foreignNumbers(text: string, sources: string[]): string[] {
  const known = new Set(normalizeDigits(sources.join("\n")).match(/\d+(?:\.\d+)?/g) ?? []);
  const out: string[] = [];
  for (const n of normalizeDigits(text).match(/\d+(?:\.\d+)?/g) ?? []) {
    if (n.length === 1 && n !== "0") continue;
    if (!known.has(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

const RELATIVE_TIME = /今天|今日|明天|明日|昨天|本週|這週|本周|這周|這個月|本月|下週|下周/;

const TIMESTAMP_LINE =/^\s*(?:[・\-*•]\s*)?\d{1,2}:\d{2}(?::\d{2})?\b.*$/;

/** 確定性修補：不需要再問模型就能修好的格式問題。 */
export function repairAeo(target: AeoTarget, fields: AeoFields): AeoFields {
  if (target === "web-qa") {
    let q = (fields.question ?? "").replace(/\s+/g, " ").trim();
    if (q && !/[？?]$/.test(q)) q = `${q.replace(/[。.！!]+$/, "")}？`;
    return {
      ...fields, question: q,
      answer: stripMarkdown(fields.answer ?? "").replace(/\s*\n+\s*/g, ""),
      body: stripMarkdown(fields.body ?? ""),
    };
  }
  const description = (fields.description ?? "")
    .split(/\r?\n/).filter((l) => !TIMESTAMP_LINE.test(l)).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  return { ...fields, title: (fields.title ?? "").replace(/\s+/g, " ").trim(), description };
}

const len = (s: string | undefined) => [...(s ?? "")].length;

/** 回傳還沒達標的地方（空陣列＝通過）。訊息直接拿去當重試指示，也會顯示給用戶。 */
export function validateAeo(
  target: AeoTarget, fields: AeoFields,
  opts: { brandName?: string | null; /** 原稿＋品牌資料；帶了才查數字。 */ sources?: string[] } = {},
): string[] {
  const out: string[] = [];
  const brand = (opts.brandName ?? "").trim();
  const all = Object.values(fields).filter(Boolean).join("\n");
  if (opts.sources?.length) {
    const nums = foreignNumbers(all, opts.sources);
    if (nums.length) out.push(`出現原稿沒有的數字：${nums.join("、")}。原稿沒有就拿掉`);
  }
  const rel = RELATIVE_TIME.exec(all);
  if (rel) out.push(`寫了會過期的時間「${rel[0]}」。原稿有確切日期才寫日期，沒有就不提時間`);
  if (target === "web-qa") {
    if (!fields.question) out.push("缺【問題】");
    else if (len(fields.question) > AEO_LIMITS.questionMax + 10) out.push(`【問題】太長（${len(fields.question)} 字），要在 ${AEO_LIMITS.questionMax} 字以內`);
    if (!fields.answer) out.push("缺【直接答案】");
    else {
      const n = len(fields.answer);
      if (n < AEO_LIMITS.answerMin) out.push(`【直接答案】太短（${n} 字），至少 ${AEO_LIMITS.answerMin} 字才能單獨成立`);
      if (n > AEO_LIMITS.answerMax + 30) out.push(`【直接答案】太長（${n} 字），要在 ${AEO_LIMITS.answerMax} 字以內`);
      if (brand && !fields.answer.includes(brand)) out.push(`【直接答案】沒有出現品牌名「${brand}」`);
    }
    // 展開沒有下限：原稿事實少就該短，逼它湊字數只會逼出編的內容（10/10 DEV 實測）。
    if (len(fields.body) > AEO_LIMITS.bodyMax + 120) out.push(`【展開】太長（${len(fields.body)} 字），最多 ${AEO_LIMITS.bodyMax} 字；只留原稿有的`);
    return out;
  }
  if (!fields.title) out.push("缺【標題】");
  else if (len(fields.title) > 100) out.push(`【標題】超過 YouTube 的 100 字上限（${len(fields.title)} 字）`);
  if (len(fields.description) < AEO_LIMITS.ytDescriptionMin) out.push(`【說明欄】太短（${len(fields.description)} 字），至少 ${AEO_LIMITS.ytDescriptionMin} 字`);
  else if (brand && !(fields.description ?? "").split(/\r?\n/).slice(0, 3).join("").includes(brand)) {
    out.push(`【說明欄】前兩行沒有出現品牌名「${brand}」`);
  }
  return out;
}

export function aeoRetryRequest(problems: string[]): string {
  return `這一版還有問題，請修正後照同樣的標記重新輸出完整內容：\n${problems.map((p) => `- ${p}`).join("\n")}`;
}

/** 把欄位組回帶標記的文字（合規檢查與重試都用這個形狀，才解析得回來）。 */
export function serializeAeo(target: AeoTarget, f: AeoFields): string {
  return target === "web-qa"
    ? `【問題】\n${f.question ?? ""}\n【直接答案】\n${f.answer ?? ""}\n【展開】\n${f.body ?? ""}`
    : `【標題】\n${f.title ?? ""}\n【說明欄】\n${f.description ?? ""}`;
}

/** 給人看、給人複製的純文字（也是存成產出時的 caption）。 */
export function aeoPlainText(target: AeoTarget, f: AeoFields): string {
  return target === "web-qa"
    ? [f.question, f.answer, f.body].filter(Boolean).join("\n\n")
    : [f.title, f.description].filter(Boolean).join("\n\n");
}

/**
 * FAQPage 結構化資料。程式組，不讓模型寫——JSON-LD 少一個括號整段就失效。
 * 答案＝直接答案＋展開，跟頁面上看得到的文字一致（結構化資料不能寫頁面上沒有的內容）。
 * `<` 轉成 <：這段會被貼進 <script> 標籤，內容裡的 </script> 不能把標籤關掉。
 */
export function faqJsonLd(f: Pick<AeoFields, "question" | "answer" | "body">): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [{
      "@type": "Question",
      name: (f.question ?? "").trim(),
      acceptedAnswer: { "@type": "Answer", text: [f.answer, f.body].map((s) => (s ?? "").trim()).filter(Boolean).join("\n\n") },
    }],
  };
  return JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 可以直接貼進官網後台的一段 HTML：看得到的問答＋結構化資料。 */
export function faqHtmlSnippet(f: Pick<AeoFields, "question" | "answer" | "body">): string {
  const paras = (f.body ?? "").split(/\n{2,}|\r?\n/).map((p) => p.trim()).filter(Boolean);
  return [
    `<section class="faq-item">`,
    `  <h2>${escapeHtml((f.question ?? "").trim())}</h2>`,
    `  <p><strong>${escapeHtml((f.answer ?? "").trim())}</strong></p>`,
    ...paras.map((p) => `  <p>${escapeHtml(p)}</p>`),
    `</section>`,
    `<script type="application/ld+json">`,
    faqJsonLd(f),
    `</script>`,
  ].join("\n");
}
