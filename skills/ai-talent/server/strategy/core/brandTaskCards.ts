/**
 * brandTaskCards — 用戶自己新增的任務卡。
 *
 * 2026-09-04 (CJ「我預計是用戶自己命名任務卡，貼上自己理想中的內容(例如十篇
 * 促購文)、以及希望用戶輸入的資料(選填)，然後AI會總結成SKILL，形成任務卡，
 * 可以試寫後，確認沒問題，就新增完成」)。
 *
 * ── 為什麼是「貼成品」而不是「描述需求」 ─────────────────────────────
 * CJ 的流程刻意不是「描述你想要什麼卡」，是「貼上你理想中的成品」。差別很大：
 * 描述會得到抽象形容詞（溫暖、專業、有溫度），成品會得到句長、節奏、開場方式、
 * CTA 位置、標點習慣 —— 那些才是寫得像不像的關鍵。人設 Agent
 * （personaAgentRouter，2026-08-21）已經證明過這條路走得通，這支沿用它的模子：
 * 同一種 `brands.positioning.<key>[]` 存法、同一種背景任務 + 進度、同一種試寫。
 *
 * ── 哪些數字不問用戶 ─────────────────────────────────────────────────
 * 字數上下限、篇數，全部從貼上的範例**實際量出來**，不讓 LLM 猜也不讓用戶填。
 * 這是粉絲團月報那支學到的（跨月比對推導欄位上限）：使用者說得出「我要像這樣」，
 * 說不出「我要 350 到 620 字」。量出來的數字還會回頭當驗收標準。
 *
 * ── id 為什麼要塞 brandId ────────────────────────────────────────────
 * `taskRegistry` 的來源介面**不吃 brandId** —— `regenerateVariant` 只有
 * outputId → taskId，拿不到品牌。所以卡 id 一律長成 `u<brandId>-<slug>`，
 * 解析時把 brandId 剖出來再查那個品牌的 JSON。brandPacks 當初用「卡 id 帶
 * 品牌前綴」解掉同一件事，這裡沿用。
 */
import type { FBTaskTemplate, OrchestraConfig, TaskInput } from "../../content/core/quickTaskFB";
import type { CatalogPlatform } from "../../content/core/taskCatalogIndex";
import localPool from "../../localDb";
import { registerTaskSource } from "../../content/core/taskRegistry";

export type BrandTaskCardStatus = "drafting" | "ready" | "failed";

/** 用戶宣告「希望用戶輸入的資料」。除了主問題以外都是選填（CJ 原話）。 */
export interface BrandTaskCardField {
  key: string;
  label: string;
  type: "text" | "textarea";
  required: boolean;
  placeholder: string;
}

export interface BrandTaskCard {
  id: string;                       // u<brandId>-<slug>
  brandId: number;
  name: string;
  channel: CatalogPlatform;
  status: BrandTaskCardStatus;
  /** 訓練進度。人設 Agent 的 UI 慣例，前端照這兩個數字畫進度條。 */
  currentStep: number;
  totalSteps: number;
  lastError: string | null;

  /** 用戶貼上的理想成品。這是整張卡的依據。 */
  samples: string[];
  /** 主問題（每次跑這張卡都會問的那一格）。 */
  primaryQuestion: string;
  primaryPlaceholder: string;
  /** 額外要問的欄位，走 taskIntake 那條共用判斷渲染。 */
  askFields: BrandTaskCardField[];

  /** AI 從範例反推出來的 SKILL —— 就是這張卡的 systemPrompt。 */
  skill: string;
  /** 從範例量出來的數字，不是問來的也不是猜來的。 */
  measured: { count: number; minChars: number; maxChars: number; medianChars: number };
  /** 一次產幾個版本。預設抓範例數，上限 5。 */
  variants: number;
  /** 綁哪個 agent 的人設（可空）。 */
  agentId: number | null;

  createdAt: string;
  updatedAt: string;
  createdBy: number;
  /** 最後一次試寫，讓用戶關掉 modal 再回來還看得到。 */
  lastDryRun: { at: string; caption: string } | null;
}

export const MAX_CARDS_PER_BRAND = 40;
export const MAX_SAMPLES = 20;
export const MAX_SAMPLE_CHARS = 8_000;
export const CARD_ID_RE = /^u(\d+)-[a-z0-9][a-z0-9-]{0,48}$/;

/** 卡 id 裡的 brandId。不是自建卡就回 null。 */
export function brandIdOfCardId(taskId: string): number | null {
  const m = CARD_ID_RE.exec(taskId);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 用戶取的名字 → id 用的 slug。中文取不出 ascii 時退回時間戳。 */
export function slugifyCardName(name: string): string {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (ascii.length >= 2) return ascii.slice(0, 40);
  return `card-${Date.now().toString(36)}`;
}

// ─────────────────────────────────────────────────────────────────────
// 讀寫（brands.positioning._taskCards[]）
// ─────────────────────────────────────────────────────────────────────
/**
 * 這裡刻意**不帶 userId 條件**：`resolveTask` 的來源在 regenerateVariant 那條
 * 路徑上沒有使用者身分（只有 outputId → taskId），而卡片內容不是機密 —— 它是
 * 這張卡自己的 prompt。權限在 router 那層擋（每個 mutation 都 assertBrandAccess），
 * 這支只負責讀得到。
 */
async function loadCards(brandId: number): Promise<BrandTaskCard[]> {
  const [rows]: any = await localPool.execute(
    `SELECT positioning AS p FROM brands WHERE id = ? LIMIT 1`, [brandId],
  );
  const raw = (rows as any[])[0]?.p;
  if (!raw) return [];
  let pos: any = raw;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { return []; } }
  const list = pos?._taskCards;
  return Array.isArray(list) ? (list as BrandTaskCard[]) : [];
}

export { loadCards as listBrandTaskCards };

export async function getBrandTaskCard(brandId: number, cardId: string): Promise<BrandTaskCard | null> {
  return (await loadCards(brandId)).find((c) => c.id === cardId) ?? null;
}

/**
 * 讀-改-寫。每次都重新 SELECT，絕不把呼叫端手上那份 positioning 整包蓋回去 ——
 * SKILL 生成跑在背景要幾十秒，期間使用者可能在別的頁面改定位。personaAgentRouter
 * 踩過這個坑，那邊的註解寫得很清楚：競態是真的會發生而不是理論上的。
 */
export async function mutateBrandTaskCards(
  brandId: number,
  userId: number,
  patch: (cards: BrandTaskCard[]) => BrandTaskCard[],
): Promise<BrandTaskCard[]> {
  const [rows]: any = await localPool.execute(
    `SELECT positioning AS p FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [brandId, userId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error(`brand ${brandId} not found`);
  let pos: any = row.p;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  pos = pos ?? {};
  const next = patch(Array.isArray(pos._taskCards) ? pos._taskCards : []);
  await localPool.execute(
    `UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`,
    [JSON.stringify({ ...pos, _taskCards: next }), brandId, userId],
  );
  return next;
}

// ─────────────────────────────────────────────────────────────────────
// 範例量測
// ─────────────────────────────────────────────────────────────────────
/**
 * 從貼上的成品量出字數區間。
 *
 * 用中位數當基準而不是平均：十篇裡夾一篇特別長的（例如附了完整活動說明）會把
 * 平均拉走，中位數不會。上下限各留 20% 餘裕 —— 量出來的是「這批範例長這樣」，
 * 不是「只准這麼長」，收太死會讓 caption 驗證一直重試。
 */
export function measureSamples(samples: string[]): BrandTaskCard["measured"] {
  const lens = samples.map((s) => s.trim().length).filter((n) => n > 0).sort((a, b) => a - b);
  if (lens.length === 0) return { count: 0, minChars: 0, maxChars: 0, medianChars: 0 };
  const median = lens[Math.floor(lens.length / 2)]!;
  return {
    count: lens.length,
    minChars: Math.max(40, Math.round(lens[0]! * 0.8)),
    maxChars: Math.round(lens[lens.length - 1]! * 1.2),
    medianChars: median,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 從 AI 對話串抽出成品
// ─────────────────────────────────────────────────────────────────────
/**
 * 正規化：只留下用來比對「這段是不是真的出自原文」的字元。
 *
 * 對話串複製出來的東西，空白、換行、全形空格、Markdown 的粗體記號都可能跟
 * 原文對不齊（尤其從網頁複製會夾帶不可見字元）。比對太嚴會把好樣本全丟掉，
 * 比對太鬆又擋不住模型自己改寫。折衷：拿掉空白與常見的 Markdown 裝飾，
 * 其餘照舊 —— 換字、改句就一定對不上。
 */
function normalizeForMatch(t: string): string {
  return t
    .replace(/[\s　]+/g, "")
    .replace(/[*_`~]/g, "")
    .trim();
}

/**
 * 只留下**真的出現在原對話串裡**的候選樣本。
 *
 * 這是「只准引用，不准創作」在這條路上的版本。模型很愛順手把成品「整理得更好」
 * 再交出來 —— 那樣抽出來的就不是使用者真的發過的文，而卡片的整個價值就建立在
 * 「學你真的寫過的東西」。改寫過的一律丟掉，寧可少幾篇。
 */
export function verbatimSamples(candidates: string[], source: string): string[] {
  const hay = normalizeForMatch(source);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const text = String(c ?? "").trim();
    if (text.length < 20) continue;                 // 太短學不到東西
    const needle = normalizeForMatch(text);
    if (needle.length < 20 || !hay.includes(needle)) continue;
    if (seen.has(needle)) continue;                 // 對話串裡改了三版、內容一樣
    seen.add(needle);
    out.push(text);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 事實洩漏檢查
// ─────────────────────────────────────────────────────────────────────
/**
 * SKILL 裡不可以出現範例的具體數字（價格、數量、日期）。
 *
 * 2026-09-04 dev 實測：prompt 已經明文禁止「不可以把範例裡的具體事實寫進規則」，
 * 模型還是把三個價格（499 / 279 / 1499）抄進規則。後果是這張卡永遠帶著上一批
 * 商品的價格，使用者下次拿它寫薑茶，文案裡會冒出熱可可的定價。
 *
 * 所以照這個 repo 既有的做法補三件套（adCopyContract / wuganVoiceContract 同一
 * 模式）：驗證 → 具名重試 → 確定性修補。純 prompt 擋不住的東西就別只靠 prompt。
 *
 * `ownNumbers` 是**我們自己**放進 prompt 的數字（量出來的字數區間），那些出現在
 * SKILL 裡是正確的，不算洩漏。
 */
/**
 * 數字邊界比對。**用 String.raw** —— 一般 template literal 會把 `\d` 求值成
 * 字面的 "d"（那不是合法轉義，JS 就把反斜線吃掉），regex 變成 `(?<!d)`，
 * 於是「499」會命中「1499」。這個坑實測踩過一次。
 */
function numberBoundary(n: string, flags = ""): RegExp {
  return new RegExp(String.raw`(?<!\d)${n}(?!\d)`, flags);
}

export function factLeaks(skill: string, samples: string[], ownNumbers: number[]): string[] {
  const mine = new Set(ownNumbers.map(String));
  // 兩位數以上才算 —— 一位數（「分三段」「最多 3 句」）幾乎都是規則本身在講數量。
  const inSamples = new Set<string>();
  for (const s of samples) for (const m of s.matchAll(/\d{2,}/g)) inSamples.add(m[0]);
  const leaks: string[] = [];
  for (const n of inSamples) {
    if (mine.has(n)) continue;
    if (numberBoundary(n).test(skill)) leaks.push(n);
  }
  return leaks.sort((a, b) => b.length - a.length);
}

/**
 * 確定性修補：把洩漏的數字換成占位說明，而不是整段刪掉。
 *
 * 刪整句會把規則的語意弄破（「兩盒 499」變成「兩盒」），換成占位反而把它變成
 * 一條正確的規則：價格要來自當次輸入，不是寫死在卡裡。
 */
export function redactFactLeaks(skill: string, leaks: string[]): string {
  let out = skill;
  // 長的先換，否則換掉 "499" 會把 "1499" 打成 "1（依當次輸入）"。
  for (const n of [...leaks].sort((a, b) => b.length - a.length)) {
    out = out.replace(numberBoundary(n, "g"), "（依當次輸入）");
  }
  // 「價格 499 279」修補後會變成兩個相鄰占位（中間可能夾空白或頓號），收成一個。
  return out.replace(/（依當次輸入）(\s*[、,，/]?\s*（依當次輸入）)+/g, "（依當次輸入）");
}

// ─────────────────────────────────────────────────────────────────────
// 卡 → template + config
// ─────────────────────────────────────────────────────────────────────
const CHANNEL_OUTPUT: Record<string, { platform: FBTaskTemplate["outputDefaults"]["platform"]; post_type: string }> = {
  facebook:  { platform: "facebook",  post_type: "feed" },
  instagram: { platform: "instagram", post_type: "feed" },
  threads:   { platform: "threads", post_type: "feed" },
  linkedin:  { platform: "linkedin",  post_type: "feed" },
  tiktok:    { platform: "tiktok", post_type: "foryou" },
  youtube:   { platform: "youtube", post_type: "video" },
  email:     { platform: "email", post_type: "edm" },
  pr:        { platform: "press", post_type: "release" },
  // 官網長文用 "doc"：mission_outputs.platform 的 enum 沒有 "web"，
  // recordTaskRun 的 SAFE_PLATFORMS 會把未知值默默降級成 "other"。
  website:   { platform: "doc", post_type: "article" },
};

function outputDefaultsFor(channel: string): FBTaskTemplate["outputDefaults"] {
  return CHANNEL_OUTPUT[channel] ?? { platform: "generic", post_type: "post" };
}

/** 一張自建卡的 label 一律標記來源，使用者要看得出這是自己做的卡。 */
export function cardTemplate(card: BrandTaskCard): FBTaskTemplate {
  const inputs: TaskInput[] = [
    { key: "topic", label: card.primaryQuestion.slice(0, 60) || "這次要講什麼", type: "textarea", required: true },
    ...card.askFields.map((f) => ({
      key: f.key, label: f.label, type: f.type, required: f.required,
      placeholder: f.placeholder || undefined,
    })),
  ];
  return {
    id: card.id,
    tier: "30s",
    postType: outputDefaultsFor(card.channel).post_type,
    label: { zh: card.name, en: card.name },
    description: {
      zh: `你自己建立的任務卡（依 ${card.measured.count} 篇範例反推）`,
      en: `Your own card (distilled from ${card.measured.count} samples)`,
    },
    agent_id: card.agentId ?? undefined,
    skill_slug: card.id,
    primary_question: card.primaryQuestion,
    primary_input: {
      key: "topic",
      placeholder: card.primaryPlaceholder,
      type: "textarea",
    },
    inputs,
    systemPrompt: card.skill,
    preferredModel: "anthropic",
    // 中位數 × 2.6 給模型足夠的產出空間；中文一字約 1.5–2 token，再留餘裕。
    maxTokens: Math.min(8000, Math.max(700, Math.round(card.measured.medianChars * 2.6))),
    outputDefaults: outputDefaultsFor(card.channel),
  };
}

export function cardConfig(card: BrandTaskCard): OrchestraConfig {
  const n = Math.max(1, Math.min(5, card.variants || 1));
  return {
    variants: n,
    images: 0,
    runImageGen: false,
    imageDirectorId: null,
    aspectRatio: null,
    variantLabels: Array.from({ length: n }, (_, i) => `版本 ${i + 1}`),
    captionMinChars: card.measured.minChars || undefined,
    captionMaxChars: card.measured.maxChars || undefined,
  } as OrchestraConfig;
}

// ─────────────────────────────────────────────────────────────────────
// 接進 taskRegistry
// ─────────────────────────────────────────────────────────────────────
/**
 * 註冊一次，六個執行入口全部吃得到 —— 這正是 taskRegistry 存在的理由
 * （原本那條鏈手抄六次，加新目錄要改六處還可能漏一處）。
 *
 * 只回 status === "ready" 的卡：還在生成 SKILL 或失敗的卡不該跑得起來，
 * 否則使用者按下去會拿到一篇用空 prompt 寫出來的東西。
 */
export function registerBrandTaskCardSource(): void {
  registerTaskSource({
    name: "brand-task-cards",
    async template(taskId) {
      const card = await readyCard(taskId);
      return card ? cardTemplate(card) : null;
    },
    async config(taskId) {
      const card = await readyCard(taskId);
      return card ? cardConfig(card) : null;
    },
  });
}

async function readyCard(taskId: string): Promise<BrandTaskCard | null> {
  const brandId = brandIdOfCardId(taskId);
  if (brandId == null) return null;          // 不是自建卡的 id，連 DB 都不用查
  const card = await getBrandTaskCard(brandId, taskId);
  return card && card.status === "ready" ? card : null;
}
