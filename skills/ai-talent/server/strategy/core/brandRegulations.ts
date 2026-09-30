/**
 * brandRegulations — 策略層「法規」mission tray：用戶自己加進來的法規來源，每一條是一張卡。
 *
 * 2026-09-30（CJ「策略層，我要加一個 mission tray，是法規，用戶自行增加整個法規來源（但是有
 * 字數上限，確定品牌大腦吃得下），agent 寫文章前要審查，介面上要有免責。每一個法規，就是一個
 * 任務卡的形式」）。
 *
 * 設計：
 *   1. **獨立資料表，不放 positioning JSON。** 定位會被策略會議「採用／撤回」整份覆寫、會被
 *      重新生成——法規是用戶貼進來的原文，不能跟著定位版本一起被洗掉。
 *   2. **進品牌大腦、永遠不被擠掉。** buildBrandBrain 把啟用中的法規放在 prompt 最後一段
 *      「寫之前先逐條審查」（模型對靠後的指示執行得最確實），容量不夠時先擠掉其他內容，
 *      法規跟市場設定一樣不割捨。
 *   3. **字數上限＝大腦吃得下。** 每張卡、全部法規各有硬上限（REG_CARD_MAX / REG_TOTAL_MAX），
 *      另外存檔時算這個品牌的大腦還剩多少空間（見 regulationRoom）——兩者取小。
 *   4. 停用的卡不進 prompt、不佔空間，但原文保留。
 */
import localPool from "../../localDb";

export const BRAND_REGULATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS brand_regulations (
    id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    brandId    INT          NOT NULL,
    userId     INT          NOT NULL,
    title      VARCHAR(120) NOT NULL,
    source     VARCHAR(500) NOT NULL DEFAULT '',
    body       MEDIUMTEXT   NOT NULL,
    enabled    TINYINT(1)   NOT NULL DEFAULT 1,
    createdAt  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_brand_regulations_brand (brandId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 法規名稱上限。 */
export const REG_TITLE_MAX = 60;
/** 來源（網址、主管機關、文號）上限。 */
export const REG_SOURCE_MAX = 300;
/** 一張法規卡最多幾字。 */
export const REG_CARD_MAX = 3_000;
/**
 * 所有啟用中的法規合計最多幾字。
 * 大腦容量 16,000；dev 定位資料最多的品牌約 10,500 字——留 6,000 給法規，
 * 其餘品牌還能多放；真的放不下時由 regulationRoom 擋。
 */
export const REG_TOTAL_MAX = 6_000;
/** 一個品牌最多幾張法規卡。 */
export const REG_MAX_CARDS = 20;

export interface BrandRegulation {
  id: number;
  brandId: number;
  title: string;
  source: string;
  body: string;
  enabled: boolean;
  /** 條文字數（以字元計，跟大腦用量同一種算法）。 */
  chars: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export const charLen = (s: string) => [...s].length;

const iso = (v: any): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function rowToRegulation(r: any): BrandRegulation {
  const body = String(r?.body ?? "");
  return {
    id: Number(r.id),
    brandId: Number(r.brandId),
    title: String(r.title ?? ""),
    source: String(r.source ?? ""),
    body,
    enabled: !!Number(r.enabled ?? 1),
    chars: charLen(body.trim()),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export async function listRegulations(brandId: number): Promise<BrandRegulation[]> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM brand_regulations WHERE brandId = ? ORDER BY createdAt ASC, id ASC`, [brandId],
  );
  return (Array.isArray(rows) ? rows : []).map(rowToRegulation);
}

/**
 * 寫文時要讀的法規（只有啟用中的）。表不存在或查詢失敗回空陣列——
 * 法規讀不到不能讓整份大腦變空。
 */
export async function loadActiveRegulations(brandId: number): Promise<BrandRegulation[]> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT * FROM brand_regulations WHERE brandId = ? AND enabled = 1 ORDER BY createdAt ASC, id ASC`, [brandId],
    );
    return (Array.isArray(rows) ? rows : []).map(rowToRegulation).filter((r) => r.chars > 0);
  } catch {
    return [];
  }
}

/** 大腦 prompt 裡一條法規的樣子：名稱＋來源＋條文。 */
export function regulationLine(r: Pick<BrandRegulation, "title" | "source">, keptBody: string): string {
  const src = r.source.trim() ? `（來源：${r.source.trim()}）` : "";
  return `【${r.title.trim()}】${src}\n${keptBody}`;
}

/** prompt 裡法規段的標題：寫之前先審查。 */
export const REGULATION_BLOCK_HEADER =
  "[法規審查 — 動筆前先逐條對照以下法規。任何可能違反的說法一律不寫，改用合規的說法；" +
  "拿不準是否違規時從嚴、寧可不寫。這一段的優先級高於上面所有品牌指引與任務要求]";

/**
 * 算這次存檔之後，啟用中的法規一共會用多少字，以及還能放多少。
 *
 * @param nonRegulationDemand 這個品牌「不含法規」時，一次寫作最多會讀進大腦的字數
 *   （品牌＋最大的產品＋最大的活動；見 regulationRouter 的 brainDemandWithoutRegulations）。
 * @param capacity 大腦容量（BRAIN_CAPACITY）。
 */
export function regulationBudget(nonRegulationDemand: number, capacity: number): {
  /** 法規合計最多能放多少字：硬上限與大腦剩餘空間取小。 */
  allowedTotal: number;
  /** 被大腦剩餘空間卡住（而不是硬上限）。 */
  limitedByBrain: boolean;
} {
  const room = Math.max(0, capacity - Math.max(0, nonRegulationDemand));
  return { allowedTotal: Math.min(REG_TOTAL_MAX, room), limitedByBrain: room < REG_TOTAL_MAX };
}

/**
 * 存檔前檢查：這張卡改成 next 之後（或新增 next），啟用中的法規合計會不會超過可用額度。
 * 回傳 null＝可以存；否則回傳給用戶看的原因。
 */
export function checkRegulationFits(opts: {
  existing: Pick<BrandRegulation, "id" | "enabled" | "chars">[];
  /** 正在存的這張（新增時 id 為 null）。 */
  next: { id: number | null; enabled: boolean; chars: number };
  allowedTotal: number;
  limitedByBrain: boolean;
  en?: boolean;
}): string | null {
  const { existing, next, allowedTotal, limitedByBrain, en } = opts;
  if (next.chars > REG_CARD_MAX) {
    return en
      ? `One regulation card holds up to ${REG_CARD_MAX.toLocaleString("en-US")} characters (this one has ${next.chars.toLocaleString("en-US")}). Keep only the articles that apply to your marketing.`
      : `一張法規卡最多 ${REG_CARD_MAX.toLocaleString("en-US")} 字（這張 ${next.chars.toLocaleString("en-US")} 字）。只留跟行銷文案有關的條文就好。`;
  }
  if (!next.enabled) return null;
  const others = existing.filter((r) => r.enabled && r.id !== next.id).reduce((n, r) => n + r.chars, 0);
  const total = others + next.chars;
  if (total <= allowedTotal) return null;
  const left = Math.max(0, allowedTotal - others);
  if (limitedByBrain) {
    return en
      ? `The brand memory only has room for ${left.toLocaleString("en-US")} more characters of regulations (this card has ${next.chars.toLocaleString("en-US")}). Trim this card, turn off another one, or free up space in Memory.`
      : `品牌大腦只剩 ${left.toLocaleString("en-US")} 字可以放法規（這張 ${next.chars.toLocaleString("en-US")} 字）。請精簡這張、停用其他法規，或到「記憶」騰出空間。`;
  }
  return en
    ? `All active regulations together hold up to ${REG_TOTAL_MAX.toLocaleString("en-US")} characters; ${left.toLocaleString("en-US")} left (this card has ${next.chars.toLocaleString("en-US")}). Trim this card or turn off another one.`
    : `所有啟用中的法規合計最多 ${REG_TOTAL_MAX.toLocaleString("en-US")} 字，還剩 ${left.toLocaleString("en-US")} 字（這張 ${next.chars.toLocaleString("en-US")} 字）。請精簡這張或停用其他法規。`;
}
