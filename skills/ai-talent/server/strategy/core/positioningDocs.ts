/**
 * positioningDocs — 「用戶自己格式的定位文件」的共用型別、欄位登錄表與讀寫。
 *
 * 2026-09-01 (CJ「原文存檔後，按照用戶有的內容呈現品牌定位，不一定要填完我們
 * 設定的題目。這樣會影響到最終結果嗎?」)。
 *
 * ── 會影響，而且影響的是產出不是畫面 ──────────────────────────────────
 * buildBrandPrefix 組給 LLM 的品牌前綴不是「把 positioning 整包丟過去」，
 * 而是逐格硬讀固定路徑，每一條都是「有才 push」。缺格不報錯、任務照跑、
 * 照樣產出一篇貼文 —— 只是少了那幾段，變得通用。這是最難查的降級：job
 * done、畫面正常、東西平庸。
 *
 * 所以這裡把「哪幾格真的會進 prompt」寫成一張表（PROMPT_FIELDS），用途有二：
 *   1. 對映提案時，LLM 只需要瞄準這些格，不必硬填滿 10 個 segment 的每個欄位。
 *   2. 上傳完給用戶一份「落差報告」—— 你的文件填到了哪幾格、哪幾格沒有、
 *      沒有的代價是什麼。用戶可以選擇不補，但不該在不知情的狀況下被降級。
 *
 * 這張表必須跟 brandContext.ts 同步，靠 positioningDocs.test.ts 鎖住 ——
 * 表上宣稱會進 prompt 的路徑，brandContext.ts 裡必須真的讀得到。
 */
import localPool from "../../localDb";

export type PositioningScope = "brand" | "product" | "event";

/** 一份上傳文件的輕量摘要 —— 存進 positioning JSON 的就只有這些。
 *  全文與每段內文留在磁碟：buildBrandPrefix 每跑一張卡都會 SELECT 這個欄位。 */
export interface SourceDocSummary {
  id: string;
  name: string;
  kind: string;
  chars: number;
  uploadedAt: string;
  outline: { level: number; heading: string; chars: number }[];
  /** 尚未套用時為 null。套用後記錄時間，UI 才能標出「這份已經生效」。 */
  appliedAt: string | null;
}

/** 套用後留下的證據：哪一份文件、對映到哪幾格、哪幾格沒對到。 */
export interface AppliedDocRecord {
  docId: string;
  name: string;
  appliedAt: string;
  filled: string[];
  missing: string[];
  /** 對不到任何 canonical 欄位、但用戶要求照樣餵進 prompt 的原文段落。 */
  injectedContext: string;
}

/**
 * 2026-09-23 (CJ「品牌定位、產品定位…也想 content 一樣的卡片式，也可以自訂新增欄位」)。
 *
 * 固定的 10（品牌）/6（產品）/11（活動）個 segment 是 schema 寫死的，使用者不能自己開新的。
 * `_customSegments[]` 是那個缺口的填補：對映提案（positioningDocsRouter.propose）遇到「明顯是
 * 定位內容，但套不進任何一個固定欄位」的段落時，會建議開一張新卡；使用者確認後才真的建立
 * （見 createCustomSegment）——跟固定欄位的「提案，不是自動套用」是同一條規矩。
 *
 * 存放位置、讀寫模式都比照 `_sourceDocs[]`/`_taskCards[]`：per-scope 的 JSON 陣列，
 * 淺層 read-modify-write，不整包覆蓋（別的背景流程可能同時在寫別的 segment）。
 */
export interface CustomSegmentField {
  key: string;
  label: string;
  value: string;
}

export interface CustomSegment {
  id: string;
  title: string;
  fields: CustomSegmentField[];
  createdAt: string;
  /** 這張卡是從哪份上傳/貼上的文件建立的；使用者自己手動建的則是 null。 */
  sourceDocId: string | null;
}

export const MAX_CUSTOM_SEGMENTS = 12;
export const MAX_CUSTOM_SEGMENT_FIELDS = 8;
export const MAX_CUSTOM_SEGMENT_TITLE_CHARS = 24;
export const MAX_CUSTOM_SEGMENT_FIELD_VALUE_CHARS = 600;

export function customSegmentsOf(pos: Record<string, any>): CustomSegment[] {
  return Array.isArray(pos?._customSegments) ? pos._customSegments : [];
}

/** 新增一張自訂卡。超過上限就丟掉最舊的一張——跟 `_sourceDocs[]` 同一個做法。 */
export async function addCustomSegment(args: {
  scope: PositioningScope; id: number; userId: number; segment: CustomSegment;
}): Promise<CustomSegment[]> {
  let saved: CustomSegment[] = [];
  await patchPositioning(args.scope, args.id, args.userId, (cur) => {
    const list = [...customSegmentsOf(cur), args.segment];
    if (list.length > MAX_CUSTOM_SEGMENTS) list.splice(0, list.length - MAX_CUSTOM_SEGMENTS);
    saved = list;
    return { ...cur, _customSegments: list };
  });
  return saved;
}

export async function removeCustomSegment(args: {
  scope: PositioningScope; id: number; userId: number; segmentId: string;
}): Promise<CustomSegment[]> {
  let saved: CustomSegment[] = [];
  await patchPositioning(args.scope, args.id, args.userId, (cur) => {
    const list = customSegmentsOf(cur).filter((s) => s.id !== args.segmentId);
    saved = list;
    return { ...cur, _customSegments: list };
  });
  return saved;
}

export const MAX_DOCS_PER_SCOPE = 8;
/** 進 prompt 的補充段落上限。prompt 本來就只吃得下幾千字，塞 120K 只會
 *  把品牌前綴稀釋掉，還每跑一張卡付一次錢。 */
export const MAX_INJECTED_CHARS = 4_000;

// ─────────────────────────────────────────────────────────────────────
// 真正會進 LLM prompt 的欄位
// ─────────────────────────────────────────────────────────────────────
export interface PromptField {
  /** positioning JSON 裡的路徑，segment.field。 */
  path: string;
  label: string;
  /** 缺這格，產出會少什麼。落差報告直接顯示這句。 */
  cost: string;
  /** 值的形狀 —— 對映提案要照這個產。 */
  shape: "text" | "list" | "pairs";
}

/** 品牌：與 brandContext.ts buildBrandPrefix 的 BLOCK 1–4 一一對應。 */
export const BRAND_PROMPT_FIELDS: PromptField[] = [
  { path: "tagline.zhTagline",      label: "中文標語",     shape: "text", cost: "文案不會帶到你的標語，每篇都要現想一句主張" },
  { path: "tagline.enTagline",      label: "英文標語",     shape: "text", cost: "英文／雙語任務會自己編一句英文主張" },
  { path: "voice.archetypes",       label: "人格原型",     shape: "list", cost: "語氣沒有錨點，每張卡的口吻會各走各的" },
  { path: "voice.tone",             label: "語調關鍵詞",   shape: "list", cost: "同上，而且最容易退回制式的行銷腔" },
  { path: "voice.forbidden",        label: "溝通禁區",     shape: "list", cost: "禁用詞沒人擋，你不想看到的字會一直出現" },
  { path: "voice.samples",          label: "溝通範例對比", shape: "pairs", cost: "這是全部欄位裡對語氣影響最大的一格 —— 沒有範例，模型只能猜你的寫法" },
  { path: "goldenCircle.why",       label: "WHY 品牌信念", shape: "text", cost: "貼文說得出你在賣什麼，說不出你為什麼做這件事" },
  { path: "goldenCircle.how",       label: "HOW 品牌作法", shape: "text", cost: "差異化的論述會流於形容詞，講不出做法" },
  { path: "goldenCircle.what",      label: "WHAT 產品服務", shape: "text", cost: "模型對你到底提供什麼只能從品牌名猜" },
  { path: "origin.story",           label: "起源故事",     shape: "text", cost: "所有需要「講故事」的卡片會空轉成通用敘事" },
  { path: "audience.primary",       label: "主受眾",       shape: "text", cost: "文案沒有對象，會寫成對所有人說話（等於對沒有人說話）" },
  { path: "audience.painPoints",    label: "受眾痛點",     shape: "list", cost: "hook 抓不到痛點，開場句會變成自我介紹" },
  { path: "differentiation.summary", label: "差異化總結",  shape: "text", cost: "說不出你跟競品差在哪，只能講自己好" },
  { path: "differentiation.discriminator",  label: "唯一致勝理由", shape: "text", cost: "沒有一個最尖銳的理由，文案的 hook 會含糊、什麼優點都提一點" },
  { path: "differentiation.reasonToBelieve", label: "支撐證據",   shape: "text", cost: "主張沒有證據撐腰，AI 只能跟著複述空話，讀者也不會信" },
];

/** 產品：對應 PRODUCT_SEGMENTS 的 canonical 欄位。 */
export const PRODUCT_PROMPT_FIELDS: PromptField[] = [
  { path: "core.coreStatement",     label: "核心定位",     shape: "text", cost: "產品任務只拿得到產品名稱，內容會圍著名字打轉" },
  { path: "core.zhTagline",         label: "產品標語",     shape: "text", cost: "每篇都要現編一句產品主張" },
  { path: "core.oneLineValueProp",  label: "一句話價值主張", shape: "text", cost: "速查卡與短文案沒有可直接引用的主張" },
  { path: "audience.primary",       label: "主目標族群",   shape: "text", cost: "產品文案會沿用品牌層的泛受眾，抓不到這支產品的人" },
  { path: "audience.pains",         label: "族群痛點",     shape: "list", cost: "賣點講得出功能，講不出解決了什麼" },
  { path: "value.coreFunctions",    label: "核心功能",     shape: "list", cost: "模型會自行想像功能，是產品文案出錯最常見的來源" },
  { path: "value.userFeeling",      label: "使用者感受",   shape: "text", cost: "情緒層的文案沒有依據" },
  { path: "competition.uniqueUsp",  label: "獨家賣點",     shape: "text", cost: "差異化退回「品質好、服務佳」這種所有人都能說的話" },
  { path: "marketing.tone",         label: "產品語氣",     shape: "text", cost: "產品線的語氣差異消失，全部聽起來一樣" },
];

/** 活動：對應 EVENT_SEGMENTS 的 canonical 欄位。 */
export const EVENT_PROMPT_FIELDS: PromptField[] = [
  { path: "brief.briefSummary",     label: "活動定位摘要", shape: "text", cost: "活動任務只拿得到名稱與日期，寫不出這檔活動在幹嘛" },
  { path: "brief.eventType",        label: "活動類型",     shape: "text", cost: "品牌型與轉換型活動的寫法會混在一起" },
  { path: "context.coreProblem",    label: "核心問題",     shape: "text", cost: "溝通沒有靶心，會變成活動資訊播報" },
  { path: "audience.primaryAudience", label: "核心受眾",   shape: "text", cost: "活動文案沿用品牌泛受眾，抓不到這檔要打的人" },
  { path: "audience.keyInsight",    label: "關鍵洞察",     shape: "text", cost: "hook 沒有洞察可用，只能寫優惠" },
  { path: "objectives.marketingGoal", label: "行銷目標",   shape: "text", cost: "內容不知道要往哪個結果收" },
  { path: "smp.singleMindedProposition", label: "SMP 單一主張", shape: "text", cost: "每篇各講各的，整檔活動沒有一致主張" },
  { path: "messaging.coreMessage",  label: "核心訊息",     shape: "text", cost: "同上，而且素材之間會互相矛盾" },
  { path: "messaging.supportingPoints", label: "支撐訊息", shape: "list", cost: "沒有可輪替的支撐點，多篇貼文會重複同一句" },
  { path: "creative.creativeTheme", label: "創意主題",     shape: "text", cost: "視覺與文案沒有共同的 big idea" },
];

export function promptFieldsFor(scope: PositioningScope): PromptField[] {
  return scope === "brand" ? BRAND_PROMPT_FIELDS
       : scope === "product" ? PRODUCT_PROMPT_FIELDS
       : EVENT_PROMPT_FIELDS;
}

// ─────────────────────────────────────────────────────────────────────
// positioning JSON 讀寫
// ─────────────────────────────────────────────────────────────────────
function tableOf(scope: PositioningScope): string {
  return scope === "brand" ? "brands" : scope === "product" ? "products" : "events";
}

export async function loadPositioning(
  scope: PositioningScope, id: number, userId: number,
): Promise<Record<string, any>> {
  const [rows]: any = await localPool.execute(
    `SELECT positioning AS payload FROM \`${tableOf(scope)}\` WHERE id = ? AND userId = ? LIMIT 1`,
    [id, userId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error(`${scope} ${id} not found`);
  let cur: any = row.payload;
  if (typeof cur === "string") { try { cur = JSON.parse(cur); } catch { cur = {}; } }
  return cur ?? {};
}

/**
 * 讀-改-寫。每次都重新 SELECT，絕不把 client 快取的 positioning 整包蓋回去
 * —— 定位 pipeline 可能正在背景寫別的 segment（personaAgentRouter 踩過這個
 * 坑，那邊的訓練跑幾十秒，競態是真的會發生而不是理論上的）。
 */
async function patchPositioning(
  scope: PositioningScope, id: number, userId: number,
  patch: (cur: Record<string, any>) => Record<string, any>,
): Promise<void> {
  const cur = await loadPositioning(scope, id, userId);
  const next = patch(cur);
  const [r]: any = await localPool.execute(
    `UPDATE \`${tableOf(scope)}\` SET positioning = ? WHERE id = ? AND userId = ?`,
    [JSON.stringify(next), id, userId],
  );
  if (((r as any)?.affectedRows ?? 0) === 0) throw new Error(`${scope} ${id} not found`);
}

export function sourceDocsOf(pos: Record<string, any>): SourceDocSummary[] {
  return Array.isArray(pos?._sourceDocs) ? pos._sourceDocs : [];
}

export function appliedDocOf(pos: Record<string, any>): AppliedDocRecord | null {
  const a = pos?._sourceDoc;
  return a && typeof a === "object" && a.docId ? (a as AppliedDocRecord) : null;
}

export async function savePositioningDocs(
  scope: PositioningScope, id: number, userId: number, docs: SourceDocSummary[],
): Promise<void> {
  await patchPositioning(scope, id, userId, (cur) => ({ ...cur, _sourceDocs: docs }));
}

/**
 * 把確認過的對映寫進 positioning。
 *
 * segments 是 { [segmentId]: { [field]: value } }，跟 positioningJobRunner
 * 的 patch 形狀一致。**逐 segment 淺層合併**而不是整個 segment 覆蓋 ——
 * 用戶的文件只填得到 audience.primary 時，不該把已經跑出來的 audience.matrix
 * 一起清掉。
 */
export async function applyMapping(args: {
  scope: PositioningScope; id: number; userId: number;
  segments: Record<string, Record<string, any>>;
  applied: AppliedDocRecord;
}): Promise<void> {
  await patchPositioning(args.scope, args.id, args.userId, (cur) => {
    const next: Record<string, any> = { ...cur };
    for (const [segId, fields] of Object.entries(args.segments)) {
      const prior = (next[segId] && typeof next[segId] === "object" && !Array.isArray(next[segId]))
        ? next[segId] : {};
      next[segId] = { ...prior, ...fields };
    }
    next._sourceDoc = args.applied;
    next._sourceDocs = sourceDocsOf(cur).map((d) =>
      d.id === args.applied.docId ? { ...d, appliedAt: args.applied.appliedAt } : d);
    return next;
  });
}

/** 讀一個 dot-path。回傳 undefined 代表這格是空的（空字串／空陣列也算空）。 */
export function readPath(pos: Record<string, any>, path: string): any {
  const v = path.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), pos);
  if (v == null) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  if (Array.isArray(v) && v.length === 0) return undefined;
  return v;
}

/** 落差報告：這份 positioning 目前填到了哪幾格會進 prompt 的欄位。 */
export function coverageOf(pos: Record<string, any>, scope: PositioningScope): {
  filled: PromptField[]; missing: PromptField[];
} {
  const filled: PromptField[] = [], missing: PromptField[] = [];
  for (const f of promptFieldsFor(scope)) {
    (readPath(pos, f.path) === undefined ? missing : filled).push(f);
  }
  return { filled, missing };
}
