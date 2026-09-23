/**
 * strategyRegistry — 策略層五種資料的共同描述。
 *
 * 2026-09-23 (CJ)：
 *   「策略層的每一個 mission tray，內容的任務卡片都是可以被用戶編輯，並且會有
 *     權限和紀錄的。」
 *   「我想確認策略層的每一個 data，都是架構清晰，可讓 AI agent 快速地搜尋到
 *     符合條件的資料，也就是 get data ready for AI。」
 *
 * ── 這兩件事是同一個底層問題 ─────────────────────────────────────────
 * 通用的編輯／權限／紀錄層，跟 AI 能下條件檢索的資料層，需要的是同一件東西：
 * **每種資料先用同一份描述說清楚自己是什麼。** 沒有這份描述，兩邊都只能對每
 * 一種資料各寫一份——而那正是現在的狀況：產品、用詞各有一套紀錄表，品牌、法規、
 * 市場數據三個 tray 連紀錄都沒有。第三套就是該收斂的時候。
 *
 * ── 為什麼是「投影」而不是「重建資料表」 ─────────────────────────────
 * 五種資料的欄位差很多（產品有價格、用詞只有兩個字、法規有生效日），硬塞進一張
 * 共同的表會把每一種都弄殘。所以這裡不動任何既有資料表，只定義**怎麼把它們投影
 * 成同一個形狀**（StrategyRecord）。原始資料照舊，檢索與紀錄走投影。
 *
 * ── AI 要的不是「全文」，是「可以下條件的欄位」 ──────────────────────
 * 一個 agent 問的是「台灣、製造業、今天還有效、有出處的補助」，不是「跟補助有關
 * 的段落」。所以投影出來的形狀是**明確的欄位**（market / industries / kind /
 * status / 生效區間 / 出處），文字只是最後才用來比對的那一層。這樣它能在一次
 * 查詢裡收斂到幾筆，而不是把整個策略層讀進上下文再自己篩。
 */

/** 五種資料投影之後的共同形狀。AI 與通用編輯層都只看這個。 */
export interface StrategyRecord {
  /** 哪一種資料。跟 tray 一對一。 */
  entity: StrategyEntityId;
  id: number;
  /** 卡片標題。 */
  title: { en: string; zh: string };
  /** 內容本體。 */
  body: { en: string; zh: string };
  /** TW / US；null = 不分市場。 */
  market: string | null;
  /** 客戶產業標籤（industries.ts 的字彙表）。空 = 不分產業。 */
  industries: string[];
  /** 這一種資料自己的次分類（subsidy / preferred / quiet_period…）。 */
  kind: string | null;
  /** 這一筆現在的狀態（approved / pending / applied / monitoring…）。 */
  status: string | null;
  /** 生效區間。兩端都可能是 null（＝沒有限制）。 */
  effectiveFrom: string | null;
  effectiveTo: string | null;
  /** 出處。沒有出處的資料 AI 不該拿去寫東西。 */
  source: { name: string; url: string } | null;
  /** 這一筆能不能被貼文引用。不是每一種資料都可以。 */
  quotable: boolean;
}

export type StrategyEntityId = "brand_asset" | "solution" | "wording" | "regulation" | "fact";

export interface StrategyEntity {
  id: StrategyEntityId;
  table: string;
  labelEn: string;
  labelZh: string;
  /** 這一種資料要不要核准才生效。 */
  requiresApproval: boolean;
  /** 使用者可以改的欄位。通用編輯層只認這份清單。 */
  editableFields: string[];
  /**
   * 改動要寫到哪裡去。
   *
   * 大部分資料的欄位就是資料表的欄位，但**品牌資料不是**——它的 label / value /
   * 日期全都在一個 JSON 的 payload 欄位裡。通用的 UPDATE 必須知道這個差別，
   * 否則它會去寫一個不存在的欄位然後失敗（或更糟，靜默地什麼都沒改）。
   *
   * 這個欄位存在本身就是在說：別假裝五種資料長得一樣。
   */
  storage: { kind: "columns" } | { kind: "json"; column: string };
}

/**
 * 五種資料的登記表。
 *
 * requiresApproval 的分野不是隨便訂的，是照**改動多久會生效**：
 *   產品描述與價格 → 要核准。改了會進到每一篇貼文，而且價格會綁住公司。
 *   用詞 → 不要核准。那一頁寫著「即時生效」，而且最常見的情境是
 *          「法務剛打電話來，現在就要擋住」。加核准等於把那句話變成謊話。
 *   品牌資料、法規、市場數據 → 要核准。它們會被業務轉給客戶，或被 AI 當成
 *          事實引用，錯了收不回來。
 */
export const STRATEGY_ENTITIES: StrategyEntity[] = [
  {
    id: "brand_asset", table: "hub_brand_assets",
    labelEn: "Brand", labelZh: "品牌",
    requiresApproval: true,
    editableFields: ["label", "value", "note", "starts_on", "ends_on"],
    storage: { kind: "json", column: "payload" },
  },
  {
    id: "solution", table: "hub_solutions",
    labelEn: "Products", labelZh: "產品",
    requiresApproval: true,
    editableFields: [
      "name_en", "name_zh", "vendor", "category",
      "summary_en", "summary_zh", "audience_en", "audience_zh",
      "source_url", "featured", "features", "prices", "profile",
    ],
    storage: { kind: "columns" },
  },
  {
    id: "wording", table: "hub_wording",
    labelEn: "Wording", labelZh: "用詞",
    requiresApproval: false,
    editableFields: ["term", "replacement"],
    storage: { kind: "columns" },
  },
  {
    id: "regulation", table: "hub_regulations",
    labelEn: "Regulations", labelZh: "法規",
    requiresApproval: true,
    editableFields: ["name_en", "name_zh", "change_en", "change_zh", "status", "effective_on", "rules"],
    storage: { kind: "columns" },
  },
  {
    id: "fact", table: "hub_facts",
    labelEn: "Market intel", labelZh: "市場數據",
    requiresApproval: true,
    editableFields: [
      "statement_en", "statement_zh", "source_name", "source_url",
      "industries", "expires_on", "confidence", "push_audience", "push_cadence",
    ],
    storage: { kind: "columns" },
  },
];

const BY_ID = new Map(STRATEGY_ENTITIES.map((e) => [e.id, e]));

export function strategyEntity(id: string): StrategyEntity | undefined {
  return BY_ID.get(id as StrategyEntityId);
}

/** 這個欄位允不允許被通用編輯層改。白名單制——沒列出來的一律拒絕。 */
export function isEditableField(entity: string, field: string): boolean {
  return Boolean(BY_ID.get(entity as StrategyEntityId)?.editableFields.includes(field));
}

// ── 檢索 ────────────────────────────────────────────────────────────────────

export interface StrategyQuery {
  /** 限定資料種類。不給 = 全部五種。 */
  entity?: StrategyEntityId[];
  market?: string;
  /** 任一命中即可。all_industries 的資料一律命中。 */
  industries?: string[];
  kind?: string[];
  status?: string[];
  /** 只要在這個日期有效的。YYYY-MM-DD。 */
  liveOn?: string;
  /** 只要有出處的。AI 拿去寫東西之前應該一律帶 true。 */
  withSource?: boolean;
  /** 只要可以被貼文引用的。 */
  quotableOnly?: boolean;
  /** 中英文都比對，全部小寫比對。 */
  text?: string;
  limit?: number;
}

const ALL = "all_industries";

/**
 * 在已經投影好的記錄上下條件。
 *
 * 純函式：投影（要讀資料庫）跟篩選（不用）分開，篩選這一段才測得動，而這一段
 * 正是 AI 會依賴的部分。
 */
export function filterStrategy(records: StrategyRecord[], query: StrategyQuery): StrategyRecord[] {
  const q = query ?? {};
  const text = q.text?.trim().toLowerCase();
  const out = records.filter((r) => {
    if (q.entity?.length && !q.entity.includes(r.entity)) return false;
    // market: null 代表不分市場，任何市場的查詢都該看到它。
    if (q.market && r.market && r.market !== q.market) return false;
    if (q.kind?.length && (!r.kind || !q.kind.includes(r.kind))) return false;
    if (q.status?.length && (!r.status || !q.status.includes(r.status))) return false;
    if (q.withSource && !r.source) return false;
    if (q.quotableOnly && !r.quotable) return false;

    if (q.industries?.length) {
      const mine = r.industries ?? [];
      const wildcard = !mine.length || mine.includes(ALL) || q.industries.includes(ALL);
      if (!wildcard && !mine.some((i) => q.industries!.includes(i))) return false;
    }

    if (q.liveOn) {
      if (r.effectiveFrom && r.effectiveFrom > q.liveOn) return false;
      if (r.effectiveTo && r.effectiveTo < q.liveOn) return false;
    }

    if (text) {
      const hay = `${r.title.en} ${r.title.zh} ${r.body.en} ${r.body.zh}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
  const cap = Math.max(1, Math.min(200, Math.floor(q.limit ?? 50)));
  return out.slice(0, cap);
}

/**
 * 一次查詢回傳的摘要。
 *
 * 給 agent 的回應要先講「你這個條件撈到什麼樣的東西」，再給內容——否則它得把
 * 每一筆讀完才知道要不要再問一次。
 */
export function summarise(records: StrategyRecord[]): {
  total: number;
  byEntity: Record<string, number>;
  withSource: number;
  quotable: number;
} {
  const byEntity: Record<string, number> = {};
  for (const r of records) byEntity[r.entity] = (byEntity[r.entity] ?? 0) + 1;
  return {
    total: records.length,
    byEntity,
    withSource: records.filter((r) => r.source).length,
    quotable: records.filter((r) => r.quotable).length,
  };
}
