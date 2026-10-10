/**
 * AEO 格式合約 —— 2026-10-10。
 *
 * CJ「目前的寫法，似乎沒有套用 AEO 的重點，包括一開始的摘要等等」。查證屬實：前台標成
 * 「AI 搜尋」的 10 張卡（client sourceVocabulary.AEO_CARD_IDS）都是原本的通用卡，只貼了
 * 標籤、寫法沒動。最嚴重的是官網長文——規則明文寫「不要在引言就講品牌」，AI 最容易摘走的
 * 開頭那一段既沒有答案也沒有品牌，跟 AEO 要的正好相反。
 *
 * AI 搜尋引擎回答問題時，是從頁面上摘一小段能單獨成立的文字。所以這份合約只管四件事：
 *   1. 開頭先給答案：最前面一小段直接回答這一頁要回答的問題，含品牌名。
 *   2. 問句式小標：小標是顧客會問的問句，下面第一句就是答案。
 *   3. 主詞寫全：關鍵句寫出品牌名／產品名，不用「我們」「它」「本產品」。
 *   4. 文末問答：長文與產品頁附 2–3 則一問一答。
 *
 * 做法照 adCopyContract／shotListContract：合約接在 system prompt 最後（最新鮮的指令贏）、
 * 產出後驗證、不合格帶著原因重試一次、還是不過就照實出貨。
 *
 * 不動卡片原本的規則：官網長文的敘事結構（情境引言＋三段）保留，摘要加在它前面。
 * 事實規則不放寬：摘要與問答只能用正文已經寫到的內容，不能藉機多寫一個新事實。
 */

export type AeoFormatProfile =
  | "article" | "product" | "faq"
  | "yt-description" | "yt-title" | "yt-chapters"
  | "press" | "factsheet" | "boilerplate";

/** 哪張卡套哪一種格式。鍵必須等於 client 的 AEO_CARD_IDS（aeoCards.test.ts 鎖著）。 */
export const AEO_FORMAT_BY_TASK: Readonly<Record<string, AeoFormatProfile>> = {
  "web-30-longform": "article",
  "web-30-product-desc": "product",
  "web-30-product-faq": "faq",
  "yt-30-description-seo": "yt-description",
  "yt-60-video-package": "yt-description",
  "yt-30-title-strategies": "yt-title",
  "yt-30-chapter-timeline": "yt-chapters",
  "pr-60-news-release-full": "press",
  "pr-30-fact-sheet": "factsheet",
  "pr-30-boilerplate": "boilerplate",
};

export function aeoFormatOf(taskId: string | null | undefined): AeoFormatProfile | null {
  return (taskId && AEO_FORMAT_BY_TASK[taskId]) || null;
}

export const AEO_SUMMARY_MARK = "【重點摘要】";
export const AEO_FAQ_MARK = "【常見問答】";
export const AEO_FACTS_MARK = "【重點事實】";
export const AEO_QUESTIONS_MARK = "【這支影片回答的問題】";

const HEAD = "\n\n【AI 搜尋格式合約 — 最高優先，與上方規則衝突時以這裡為準】\n" +
  "AI 搜尋引擎（ChatGPT、Perplexity、Google 的 AI 答案）回答問題時，會從頁面上摘一小段能單獨成立的文字。" +
  "下面的要求是為了讓這一頁有東西可以被摘。上方規則沒提到的部分照舊。\n";

const TAIL = (brand: string) =>
  "\n【這份合約的共同規則】\n" +
  `- 主詞寫全：${brand ? `摘要、問答的答案、每一段的第一句，要寫出「${brand}」或產品名` : "摘要、問答的答案、每一段的第一句，要寫出品牌名或產品名"}，` +
  "不要用「我們」「它」「本產品」「這款」當主詞——那一句被單獨摘走時，沒有人知道在講誰。\n" +
  "- 摘要與問答只能用正文已經寫到的內容。不能為了湊一則問答，多寫一個正文沒有的事實、數字或承諾。\n" +
  "- 不寫會過期的時間（今天、本週、這個月）；有確切日期才寫日期。\n" +
  "- 標記（【…】）照抄，獨立成一行。\n" +
  "- 這份合約加的段落（摘要、問答、重點事實、問句清單）不算在上方的字數限制裡；不要為了塞進字數而縮短正文。\n";

/** 接在 system prompt 最後的合約。brandName 沒有就只講原則。 */
export function buildAeoFormatRule(profile: AeoFormatProfile, brandName?: string | null): string {
  const brand = (brandName ?? "").trim();
  const named = brand ? `「${brand}」` : "品牌名";
  const lines: string[] = [];
  switch (profile) {
    case "article":
      lines.push(
        `- 文章最前面（引言之前）加一段 ${AEO_SUMMARY_MARK}：2–3 句、60–140 字，直接回答這篇文章要回答的問題，第一句就出現${named}。不看後文也讀得懂。`,
        "  上方說「不要在引言就講品牌」仍然成立——那是指引言；摘要是另外一段，必須講品牌。",
        "- 三個段落的小標，至少兩個寫成讀者會問的問句（以問號結尾）。小標下面的第一句直接回答那個問句，再展開。",
        `- 文章最後加 ${AEO_FAQ_MARK}：2–3 則，格式是一行「Q：問句」、下一行「A：答案」。答案 1–2 句，先講結論。`,
        "- 引言＋三段的敘事結構與字數照上方規則，不要因為加了摘要與問答就縮短正文。",
      );
      break;
    case "product":
      lines.push(
        "- 【主標】要同時說出產品名與它是哪一類東西（品類詞），讓只看到這一行的人知道這是什麼。",
        `- 【副標】之後加一段 ${AEO_SUMMARY_MARK}：2 句、50–120 字，說清楚這是什麼、給誰用、最主要的差別，出現${named}與產品名。`,
        "- 【價值段落】的三個小標，至少兩個直接寫成買的人會問的問句、以問號結尾（例：「需要自己整理報表嗎？」「多久可以拿到結果？」），不要寫成「功能＋好處」的陳述句。小標下面第一句直接回答。",
        `- 【行動呼籲】之前加 ${AEO_FAQ_MARK}：3 則，一行「Q：問句」、下一行「A：答案」，答案先講結論。只問正文答得出來的。`,
      );
      break;
    case "faq":
      lines.push(
        "- 每一則的 Q 寫成完整的問句，帶到產品名或品類詞——單看這一句就知道在問哪個產品的什麼事。",
        `- 每一則的 A 第一句要重述主詞（${named}或產品名），直接給答案。不要用「可以的」「會喔」「它」「我們」開頭。`,
        "- 每一則 A 單獨拿出來都要讀得懂：不要寫「如上所述」「同前一題」。",
      );
      break;
    case "yt-description":
      lines.push(
        `- 說明欄最前面兩行不是鉤子，是摘要：這支影片回答什麼問題、答案是什麼，出現${named}。收合時只看得到這兩行，AI 讀的也是這兩行。`,
        `- 摘要之後空一行，加一段 ${AEO_QUESTIONS_MARK}：下面列 3 個觀眾會拿去搜尋的問句，一行一個、每行以問號結尾。這一段不能省。`,
        "- 上方規則要的其他內容（重點、章節、hashtag）接在後面，照舊。",
        "- 不要編網址。輸入沒有提供的連結，寫【待補：連結】，不要自己湊一個看起來像的網址。",
      );
      break;
    case "yt-title":
      lines.push(
        `- 三個標題裡，至少一個寫成觀眾會拿去搜尋的完整問句（以問號結尾），而且帶到${named}或產品名。`,
        "- 每個標題都要讓人看得出這支影片在講哪個品牌或哪個產品的什麼事，不要只有情緒與懸念。",
      );
      break;
    case "yt-chapters":
      lines.push(
        "- 章節標題用觀眾會搜尋的說法：至少一半寫成問句，或用「怎麼」「為什麼」「如何」開頭。不要只寫「開場」「介紹」「總結」。",
        "- 章節標題裡該出現產品名或主題詞的地方要寫出來，不要用「它」。",
      );
      break;
    case "press":
      lines.push(
        `- 導言（正文第一段）2–3 句，開頭就是${named}：誰、做了什麼、為什麼重要。單看這一段就是一則完整的消息。`,
        "- 內文用第三人稱寫品牌，不用「我們」（引述發言人的話除外）。",
        `- 新聞稿最後加 ${AEO_FACTS_MARK}：3–5 條，每條一句、主詞寫全，單獨引用也成立。只列正文已經寫到的事實。`,
      );
      break;
    case "factsheet":
      lines.push(
        `- 最前面加一句定義句：${brand ? `「${brand} 是……」` : "「（品牌名）是……」"}——說清楚是哪一類公司／產品、做什麼。`,
        "- 每一條事實都寫主詞，單獨摘走也看得懂是誰的什麼數字。",
      );
      break;
    case "boilerplate":
      lines.push(
        `- 第一句是定義句，以${named}開頭：${brand ? `「${brand} 是……」` : "「（品牌名）是……」"}，說清楚是哪一類公司、做什麼、服務誰。`,
        "- 全段第三人稱，不出現「我們」。這一段會被原封不動貼到別人的頁面上。",
      );
      break;
  }
  return HEAD + lines.join("\n") + "\n" + TAIL(brand);
}

export interface AeoFormatIssue { reason: string; detail: string }

const issue = (reason: string, detail: string): AeoFormatIssue => ({ reason, detail });
const linesOf = (s: string) => String(s ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const isQuestion = (l: string) => /[？?]\s*$/.test(l);
const has = (text: string, brand: string) => !brand || text.toLowerCase().includes(brand.toLowerCase());

/** 標記之後、下一個標記（或結尾）之前的文字。 */
function after(text: string, mark: string): string {
  const i = text.indexOf(mark);
  if (i === -1) return "";
  const rest = text.slice(i + mark.length);
  const next = rest.search(/\n\s*【[^】\n]{1,12}】/);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

/** 有幾則「Q：…」＋「A：…」。 */
function qaPairs(block: string): number {
  const ls = linesOf(block);
  let n = 0;
  for (let i = 0; i < ls.length - 1; i += 1) {
    if (/^Q\s*\d*\s*[:：]/i.test(ls[i]!) && /^A\s*\d*\s*[:：]/i.test(ls[i + 1]!)) n += 1;
  }
  return n;
}

const PRONOUN_OPENERS = /^(我們|它|本產品|本品牌|這款|這個產品|可以的|會喔|是的)/;

/**
 * 產出有沒有照合約。回 null＝通過；回 issue＝帶著 detail 重試一次。
 * 只驗程式看得出來的結構（有沒有摘要、摘要裡有沒有品牌、問句夠不夠、有沒有問答）；
 * 寫得好不好不在這裡判斷。
 */
export function validateAeoFormat(profile: AeoFormatProfile, caption: string, brandName?: string | null): AeoFormatIssue | null {
  const text = String(caption ?? "");
  const brand = (brandName ?? "").trim();
  const ls = linesOf(text);
  if (!ls.length) return null; // 空的交給別的閘門
  switch (profile) {
    case "article":
    case "product": {
      const summary = after(text, AEO_SUMMARY_MARK);
      if (!summary) return issue("no-summary", `缺少 ${AEO_SUMMARY_MARK} 這一段`);
      if (profile === "article" && text.indexOf(AEO_SUMMARY_MARK) > 80) {
        return issue("summary-not-first", `${AEO_SUMMARY_MARK} 要放在文章最前面（引言之前）`);
      }
      if (!has(summary, brand)) return issue("summary-no-brand", `${AEO_SUMMARY_MARK} 裡沒有出現品牌名「${brand}」`);
      const faq = after(text, AEO_FAQ_MARK);
      const need = profile === "article" ? 2 : 3;
      if (qaPairs(faq) < need) return issue("no-faq", `${AEO_FAQ_MARK} 要有至少 ${need} 則，格式是一行「Q：問句」、下一行「A：答案」`);
      // 問句小標：問答區以外、不是 Q：開頭的短行裡，要有兩個問句。
      const body = text.slice(0, text.indexOf(AEO_FAQ_MARK) === -1 ? text.length : text.indexOf(AEO_FAQ_MARK));
      const headings = linesOf(body).filter((l) => [...l].length <= 40 && isQuestion(l) && !/^Q\s*\d*\s*[:：]/i.test(l));
      if (headings.length < 2) return issue("no-question-headings", "小標至少兩個要寫成問句（以問號結尾）");
      return null;
    }
    case "faq": {
      const answers = ls.filter((l) => /^A\s*\d*\s*[:：]/i.test(l)).map((l) => l.replace(/^A\s*\d*\s*[:：]\s*/i, ""));
      if (answers.length < 3) return null; // 格式不是 Q/A 行，不在這裡判
      const bad = answers.filter((a) => PRONOUN_OPENERS.test(a)).length;
      if (bad > Math.floor(answers.length / 4)) {
        return issue("pronoun-answers", `有 ${bad} 則答案用「我們／它／可以的」之類開頭；每則 A 的第一句要重述品牌名或產品名`);
      }
      if (brand && !answers.some((a) => has(a, brand))) return issue("faq-no-brand", `所有答案裡都沒有出現品牌名「${brand}」`);
      return null;
    }
    case "yt-description": {
      const head = ls.slice(0, 2).join(" ");
      if (!has(head, brand)) return issue("head-no-brand", `說明欄最前面兩行沒有出現品牌名「${brand}」`);
      if (ls.filter(isQuestion).length < 2) {
        return issue("no-questions", `缺少 ${AEO_QUESTIONS_MARK} 這一段（下面列 3 個問句，一行一個、以問號結尾）`);
      }
      return null;
    }
    case "yt-title":
      return ls.some(isQuestion) ? null : issue("no-question-title", "至少一個標題要寫成完整問句（以問號結尾）");
    case "yt-chapters": {
      const searchable = ls.filter((l) => isQuestion(l) || /怎麼|為什麼|如何|怎樣|哪/.test(l)).length;
      return searchable >= 2 ? null : issue("generic-chapters", "章節標題至少兩個要寫成問句，或用「怎麼／為什麼／如何」的說法");
    }
    case "press": {
      // 第一段可能是標題；導言在前幾行裡。
      if (!has(ls.slice(0, 4).join(" "), brand)) return issue("lead-no-brand", `標題與導言裡沒有出現品牌名「${brand}」`);
      const facts = linesOf(after(text, AEO_FACTS_MARK));
      if (facts.length < 3) return issue("no-facts", `缺少 ${AEO_FACTS_MARK}（3–5 條，每條一句、主詞寫全）`);
      return null;
    }
    case "factsheet":
      return has([...ls.slice(0, 3).join(" ")].slice(0, 200).join(""), brand) ? null
        : issue("no-definition", `最前面要有一句定義句，以品牌名「${brand}」開頭`);
    case "boilerplate": {
      // 「以品牌名開頭」：前面最多容許幾個字（引號、「關於」之類）。
      const at = brand ? text.trimStart().toLowerCase().indexOf(brand.toLowerCase()) : 0;
      if (at < 0 || at > 8) {
        return issue("no-definition", `第一句要以品牌名「${brand}」開頭，寫成定義句`);
      }
      if (text.includes("我們")) return issue("first-person", "全段要用第三人稱，不能出現「我們」");
      return null;
    }
  }
}

export function aeoFormatRetryReminder(detail: string): string {
  return `上次回應不符合【AI 搜尋格式合約】：${detail}。請照合約重寫完整內容，其他部分照舊。`;
}
