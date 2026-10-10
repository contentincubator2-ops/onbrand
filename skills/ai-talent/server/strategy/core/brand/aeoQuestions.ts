/**
 * aeoQuestions — 策略層「AI 搜尋」tray 的顧客問題地圖。
 *
 * 2026-10-10（CJ「我需要有 AEO 專區嗎？我整個動線，不知道該如何調整」）。定案：不做另一個寫
 * 內容的地方，做一塊看進度的板。板上只有一種東西——「顧客會拿去問 AI 的問題」，每題三種狀態：
 *
 *   還沒回答   地圖上有這一題，還沒有任何一篇內容回答它
 *   已產出     作品頁「轉成 AI 搜尋版」存了一則官網問答，對應到這一題（answerOutputId）
 *   已上架     用戶回來標記「貼上官網了」（publishedAt，可附網址）
 *
 * 為什麼要分「已產出」與「已上架」：我們只產文字，貼上官網是客戶自己的事。AI 讀得到的是
 * 上架之後的那一頁——只算產出數等於把還沒發生的效果算進去。
 *
 * 問題從三個地方來（source）：
 *   ai    請 AI 依品牌定位建議的
 *   user  用戶自己加的
 *   post  轉換貼文時，那篇回答的問題不在地圖上，自動補進來的
 *
 * 一題只連一篇回答（最新的那篇）。這裡不呼叫模型以外的外部服務，也不去查 AI 搜尋引擎——
 * 板上的數字全部是我們自己掌握的事實，沒有「被引用次數」這種我們量不到的東西。
 */
import localPool from "../../../localDb";

export const BRAND_AEO_QUESTIONS_DDL = `
  CREATE TABLE IF NOT EXISTS brand_aeo_questions (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    brandId         INT          NOT NULL,
    userId          INT          NOT NULL,
    question        VARCHAR(200) NOT NULL,
    source          VARCHAR(12)  NOT NULL DEFAULT 'user',
    answerOutputId  INT          NULL,
    answeredAt      DATETIME(3)  NULL,
    publishedUrl    VARCHAR(500) NULL,
    publishedAt     DATETIME(3)  NULL,
    archivedAt      DATETIME(3)  NULL,
    createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_brand_aeo_questions_brand (brandId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const AEO_QUESTION_MAX = 60;
/** AI 建議的題目比這個長就不收：人問 AI 是一句話，不是一段自述。 */
export const AEO_SUGGEST_MAX_CHARS = 40;
/** 一個品牌地圖上最多幾題（封存的不算）。 */
export const AEO_MAX_QUESTIONS = 150;
/** 請 AI 建議一次給幾題。 */
export const AEO_SUGGEST_COUNT = 12;
/** 轉換貼文時，最多拿幾題還沒回答的給模型對照。 */
export const AEO_MATCH_CANDIDATES = 30;

export type AeoQuestionSource = "ai" | "user" | "post";
export type AeoQuestionStatus = "open" | "answered" | "published";

export interface AeoQuestion {
  id: number;
  brandId: number;
  question: string;
  source: AeoQuestionSource;
  answerOutputId: number | null;
  answeredAt: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  createdAt: string | null;
}

// ── 純函式 ───────────────────────────────────────────────────────────────

export function statusOf(q: Pick<AeoQuestion, "answerOutputId" | "publishedAt">): AeoQuestionStatus {
  if (!q.answerOutputId) return "open";
  return q.publishedAt ? "published" : "answered";
}

export interface AeoCoverage { total: number; answered: number; published: number }

/** answered 含已上架的（上架一定先有產出）。 */
export function coverageOf(rows: Array<Pick<AeoQuestion, "answerOutputId" | "publishedAt">>): AeoCoverage {
  let answered = 0, published = 0;
  for (const r of rows) {
    const s = statusOf(r);
    if (s !== "open") answered += 1;
    if (s === "published") published += 1;
  }
  return { total: rows.length, answered, published };
}

/** 比對是不是同一題：去掉空白、標點與大小寫差異。 */
export function questionKey(q: string): string {
  return String(q ?? "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/** 整理成一題：去頭尾、去編號、補問號、截長度。空的回空字串。 */
export function cleanQuestion(raw: string): string {
  let q = String(raw ?? "").replace(/\s+/g, " ").trim();
  q = q.replace(/^(?:[-*•・]|\d{1,2}[.)、．]|Q\d*[:：.]?)\s*/i, "").replace(/^["「『]|["」』]$/g, "").trim();
  if (!q) return "";
  if (!/[？?]$/.test(q)) q = `${q.replace(/[。.！!]+$/, "")}？`;
  return [...q].length > AEO_QUESTION_MAX ? `${[...q].slice(0, AEO_QUESTION_MAX - 1).join("")}？` : q;
}

/** 模型回的建議清單 → 乾淨、不重複、不跟現有重複的題目。 */
export function parseSuggestedQuestions(
  raw: string, existing: string[],
  opts: { limit?: number; /** 帶了就確保帶品牌名的題目不超過一半。 */ brandName?: string | null } = {},
): string[] {
  const limit = opts.limit ?? AEO_SUGGEST_COUNT;
  const brand = (opts.brandName ?? "").trim().toLowerCase();
  const seen = new Set(existing.map(questionKey));
  const picked: string[] = [];
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    // 以冒號結尾的是開場白（「…列出 12 個問題：」），不是題目（10/10 DEV 實測被當成第一題）。
    if (/[:：]\s*$/.test(line)) continue;
    const q = cleanQuestion(line);
    const n = [...q].length;
    // 太短的多半是標題或雜訊（「常見問題？」）；太長的不是人會拿去問 AI 的一句話。
    if (n < 8 || n > AEO_SUGGEST_MAX_CHARS) continue;
    const k = questionKey(q);
    if (seen.has(k)) continue;
    seen.add(k);
    picked.push(q);
  }
  if (!brand) return picked.slice(0, limit);
  // 帶品牌名的題目最多一半：顧客還不認識品牌時問的品類問題，才是 AI 搜尋裡搶得到新客的地方。
  const cap = Math.floor(limit / 2);
  let branded = 0;
  const out: string[] = [];
  for (const q of picked) {
    if (q.toLowerCase().includes(brand)) {
      if (branded >= cap) continue;
      branded += 1;
    }
    out.push(q);
    if (out.length >= limit) break;
  }
  return out;
}

export function suggestPrompt(args: { brandName: string; existing: string[]; count?: number }): string {
  const n = args.count ?? AEO_SUGGEST_COUNT;
  return [
    "",
    `【這次的任務：列出顧客會拿去問 AI 的 ${n} 個問題】`,
    `人在決定要不要買、要不要用「${args.brandName}」這一類東西之前，會直接問 ChatGPT、Perplexity 或 Google。`,
    "根據上面的品牌資料，列出他們最可能問的問題。",
    "",
    "規則：",
    "- 用顧客的話，不是品牌的話。顧客不會用品牌自己的術語、標語、功能名稱或內部數字發問。",
    "- 寫成一句直接的問句，像打在搜尋框裡的那種（例：「小公司沒預算請顧問，行銷研究可以怎麼做？」）。不要先自我介紹處境再問。",
    `- 一半以上是不帶品牌名的品類問題（顧客還不認識品牌時問的）；帶「${args.brandName}」的最多 ${Math.floor(n / 2)} 題。`,
    "- 涵蓋不同階段：這是什麼、適合誰、怎麼選、跟別的做法差在哪、怎麼用、價格與購買、常見疑慮。",
    "- 每題要是這個品牌答得出來的——品牌資料裡完全沒有線索的題目不要列。",
    "- 不可以出現其他品牌、其他產品或其他公司的名字（要比較就說「其他工具」「一般做法」）。",
    "- 不問需要即時資訊（今天的價格、現在的庫存）的問題。",
    `- 每題 ${AEO_SUGGEST_MAX_CHARS - 10} 字以內，最長不超過 ${AEO_SUGGEST_MAX_CHARS} 字，以問號結尾。`,
    ...(args.existing.length
      ? ["", "下面這些已經在清單上，不要重複、也不要只換個說法：", ...args.existing.slice(0, 80).map((q) => `- ${q}`)]
      : []),
    "",
    `多列幾題備用（${n + 6} 題），只輸出問題，一行一題，不要開場白、不要編號、不要分類標題、不要其他說明。`,
  ].join("\n");
}

/** 網址只收 http(s)；其他一律當沒填（不把 javascript: 之類的存進去再印成連結）。 */
export function cleanPublishedUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().slice(0, 500) : null;
  } catch { return null; }
}

// ── 資料庫 ───────────────────────────────────────────────────────────────

const iso = (v: unknown): string | null => (v ? new Date(v as any).toISOString() : null);
const toRow = (r: any): AeoQuestion => ({
  id: Number(r.id), brandId: Number(r.brandId), question: String(r.question ?? ""),
  source: (["ai", "user", "post"].includes(r.source) ? r.source : "user") as AeoQuestionSource,
  answerOutputId: r.answerOutputId == null ? null : Number(r.answerOutputId),
  answeredAt: iso(r.answeredAt), publishedUrl: r.publishedUrl ?? null, publishedAt: iso(r.publishedAt),
  createdAt: iso(r.createdAt),
});

const COLS = "id, brandId, question, source, answerOutputId, answeredAt, publishedUrl, publishedAt, createdAt";

/** 地圖上的題目（不含封存）。還沒回答的排前面，同狀態新的在前。 */
export async function listAeoQuestions(brandId: number): Promise<AeoQuestion[]> {
  const [rows]: any = await localPool.execute(
    `SELECT ${COLS} FROM brand_aeo_questions
      WHERE brandId = ? AND archivedAt IS NULL
      ORDER BY (answerOutputId IS NOT NULL), (publishedAt IS NOT NULL), id DESC`,
    [brandId],
  );
  return (rows as any[]).map(toRow);
}

export async function getAeoQuestion(id: number): Promise<AeoQuestion | null> {
  const [rows]: any = await localPool.execute(
    `SELECT ${COLS} FROM brand_aeo_questions WHERE id = ? AND archivedAt IS NULL LIMIT 1`, [id],
  );
  const r = (rows as any[])[0];
  return r ? toRow(r) : null;
}

/** 加題目：跟現有的（含這次批次內）重複就跳過，超過上限就停。回傳真的加進去的。 */
export async function addAeoQuestions(
  brandId: number, userId: number, questions: string[], source: AeoQuestionSource,
): Promise<AeoQuestion[]> {
  const existing = await listAeoQuestions(brandId);
  const seen = new Set(existing.map((q) => questionKey(q.question)));
  let room = AEO_MAX_QUESTIONS - existing.length;
  const added: AeoQuestion[] = [];
  for (const raw of questions) {
    if (room <= 0) break;
    const q = cleanQuestion(raw);
    const k = questionKey(q);
    if (!q || seen.has(k)) continue;
    seen.add(k);
    const [res]: any = await localPool.execute(
      `INSERT INTO brand_aeo_questions (brandId, userId, question, source) VALUES (?, ?, ?, ?)`,
      [brandId, userId, q, source],
    );
    added.push({
      id: Number(res.insertId), brandId, question: q, source,
      answerOutputId: null, answeredAt: null, publishedUrl: null, publishedAt: null, createdAt: new Date().toISOString(),
    });
    room -= 1;
  }
  return added;
}

export async function archiveAeoQuestion(id: number): Promise<void> {
  await localPool.execute(`UPDATE brand_aeo_questions SET archivedAt = NOW(3) WHERE id = ?`, [id]);
}

/**
 * 把一篇回答連到一題。換了回答＝內容變了，上架標記要清掉（官網上那一版是舊的）。
 * 題目文字一起更新成回答裡實際用的那一句（用戶可能在視窗裡改過）。
 */
export async function linkAeoAnswer(id: number, outputId: number, question?: string | null): Promise<void> {
  const q = question ? cleanQuestion(question) : "";
  await localPool.execute(
    `UPDATE brand_aeo_questions
        SET answerOutputId = ?, answeredAt = NOW(3), publishedUrl = NULL, publishedAt = NULL${q ? ", question = ?" : ""}
      WHERE id = ?`,
    q ? [outputId, q, id] : [outputId, id],
  );
}

/**
 * 存了一則官網問答之後記到地圖上：指定了題目（而且是這個品牌的）就連過去；
 * 沒指定就找同一句的題目；都沒有就補一題（source=post）。回傳題目 id。
 */
export async function recordAeoAnswer(args: {
  brandId: number; userId: number; question: string; outputId: number; questionId?: number | null;
}): Promise<number | null> {
  const question = cleanQuestion(args.question);
  if (!question) return null;
  const rows = await listAeoQuestions(args.brandId);
  const target = (args.questionId ? rows.find((r) => r.id === args.questionId) : null)
    ?? rows.find((r) => questionKey(r.question) === questionKey(question))
    ?? null;
  if (target) {
    await linkAeoAnswer(target.id, args.outputId, question);
    return target.id;
  }
  const [res]: any = await localPool.execute(
    `INSERT INTO brand_aeo_questions (brandId, userId, question, source, answerOutputId, answeredAt)
     VALUES (?, ?, ?, 'post', ?, NOW(3))`,
    [args.brandId, args.userId, question, args.outputId],
  );
  return Number(res.insertId);
}

/** 標記上架（url 可不填）或取消上架。沒有回答的題目不能標上架。 */
export async function setAeoPublished(id: number, published: boolean, url?: string | null): Promise<boolean> {
  if (!published) {
    await localPool.execute(`UPDATE brand_aeo_questions SET publishedAt = NULL, publishedUrl = NULL WHERE id = ?`, [id]);
    return true;
  }
  const [res]: any = await localPool.execute(
    `UPDATE brand_aeo_questions SET publishedAt = NOW(3), publishedUrl = ?
      WHERE id = ? AND answerOutputId IS NOT NULL`,
    [cleanPublishedUrl(url), id],
  );
  return Number(res.affectedRows ?? 0) > 0;
}

/** 轉換貼文時給模型對照的題目：還沒回答的，最新的在前。 */
export async function openAeoQuestions(brandId: number, limit = AEO_MATCH_CANDIDATES): Promise<Array<{ id: number; question: string }>> {
  try {
    const rows = await listAeoQuestions(brandId);
    return rows.filter((r) => !r.answerOutputId).slice(0, limit).map((r) => ({ id: r.id, question: r.question }));
  } catch { return []; }
}
