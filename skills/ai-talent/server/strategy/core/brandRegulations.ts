/**
 * brandRegulations — 策略層「法規」mission tray：用戶自己加進來的法規來源，每一條是一張卡。
 *
 * 2026-09-30（CJ「策略層，我要加一個 mission tray，是法規，用戶自行增加整個法規來源（但是有
 * 字數上限，確定品牌大腦吃得下），agent 寫文章前要審查，介面上要有免責。每一個法規，就是一個
 * 任務卡的形式」）。
 *
 * 設計：
 *   1. **獨立資料表，不放 positioning JSON。** 定位會被重新生成——法規是用戶貼進來的原文，不能跟著定位版本一起被洗掉。
 *   2. **原文與審查重點分兩層（2026-09-30 第二版）。** CJ「法規可以容納的字數好少，一定會遇到
 *      抱怨」：整部法規常常上萬字，全文塞進每篇 prompt 放不下也太貴。
 *        · 原文（body）：一張最多 REG_BODY_MAX，只存著、給人查、給 AI 萃取。
 *        · 審查重點（digest）：AI 從原文萃取的行銷審查清單，用戶確認後才生效；寫文前（品牌大腦）
 *          與寫完後的合規檢查都只讀這一份。一張 ≤ REG_DIGEST_MAX、合計 ≤ REG_TOTAL_MAX。
 *        · 萃取結果先放 draftDigest（待確認），確認才搬進 digest——萃取中、待確認期間，舊的
 *          審查重點照常生效，不會因為改原文就突然少了一道保護。
 *   3. **進品牌大腦、永遠不被擠掉。** 審查重點放在 prompt 最後一段「寫之前先逐條審查」，容量
 *      不夠時先擠掉其他內容。字數上限＝硬上限與大腦剩餘空間取小（見 regulationBudget）。
 *   4. 停用的卡不進 prompt、不佔空間，原文與審查重點都保留。
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

/** 第二版加的欄位（表已存在的環境用 ALTER 補）。 */
const DIGEST_COLUMNS: Array<[name: string, ddl: string]> = [
  ["digest", "ADD COLUMN digest MEDIUMTEXT NULL"],
  ["draftDigest", "ADD COLUMN draftDigest MEDIUMTEXT NULL"],
  ["jobStatus", "ADD COLUMN jobStatus VARCHAR(16) NOT NULL DEFAULT 'idle'"],
  ["jobProgress", "ADD COLUMN jobProgress JSON NULL"],
  ["jobError", "ADD COLUMN jobError VARCHAR(255) NULL"],
  ["digestConfirmedAt", "ADD COLUMN digestConfirmedAt DATETIME(3) NULL"],
];

/** 法規名稱上限。 */
export const REG_TITLE_MAX = 60;
/** 來源（網址、主管機關、文號）上限。 */
export const REG_SOURCE_MAX = 300;
/** 一張法規卡的原文最多幾字（整部法規放得下）。 */
export const REG_BODY_MAX = 50_000;
/** 一張法規卡的審查重點最多幾字。 */
export const REG_DIGEST_MAX = 800;
/**
 * 所有啟用中的審查重點合計最多幾字。大腦容量 16,000；dev 定位資料最多的品牌約 10,500 字，
 * 留 4,000 給法規；真的放不下時由 regulationBudget 擋。
 */
export const REG_TOTAL_MAX = 4_000;
/** 一個品牌最多幾張法規卡。 */
export const REG_MAX_CARDS = 20;

/** 萃取工作狀態：idle 沒在跑／extracting 萃取中／review 萃取好了等用戶確認／failed 失敗。 */
export type RegulationJobStatus = "idle" | "extracting" | "review" | "failed";

export interface RegulationJobProgress {
  stage: "reading" | "extracting" | "merging" | "done";
  /** 萃取階段：做完幾段／共幾段。 */
  done: number;
  total: number;
}

export interface BrandRegulation {
  id: number;
  brandId: number;
  title: string;
  source: string;
  /** 原文。 */
  body: string;
  enabled: boolean;
  /** 原文字數。 */
  chars: number;
  /** 已確認、生效中的審查重點（沒有＝還沒用在審查）。 */
  digest: string;
  digestChars: number;
  /** 萃取好、等用戶確認的審查重點。 */
  draftDigest: string;
  jobStatus: RegulationJobStatus;
  jobProgress: RegulationJobProgress | null;
  jobError: string | null;
  /** 會用在審查（啟用且有審查重點）。 */
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 寫文與合規檢查讀的那一份。 */
export interface ActiveRegulation { id: number; title: string; source: string; digest: string }

export const charLen = (s: string) => [...s].length;

const iso = (v: any): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const parseJson = (v: any) => {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
};

const JOB_STATUSES: RegulationJobStatus[] = ["idle", "extracting", "review", "failed"];

export function rowToRegulation(r: any): BrandRegulation {
  const body = String(r?.body ?? "");
  const digest = String(r?.digest ?? "").trim();
  const enabled = !!Number(r?.enabled ?? 1);
  const status = JOB_STATUSES.includes(r?.jobStatus) ? r.jobStatus as RegulationJobStatus : "idle";
  return {
    id: Number(r.id),
    brandId: Number(r.brandId),
    title: String(r.title ?? ""),
    source: String(r.source ?? ""),
    body,
    enabled,
    chars: charLen(body.trim()),
    digest,
    digestChars: charLen(digest),
    draftDigest: String(r?.draftDigest ?? "").trim(),
    jobStatus: status,
    jobProgress: parseJson(r?.jobProgress),
    jobError: r?.jobError ? String(r.jobError) : null,
    active: enabled && digest.length > 0,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

/** 啟動時補欄位，並把第一版留下的卡轉成第二版（短的原文直接當審查重點，長的排進萃取）。 */
export async function migrateRegulationColumns(): Promise<void> {
  const [cols]: any = await localPool.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brand_regulations'`,
  );
  const have = new Set((cols as any[]).map((c) => String(c.COLUMN_NAME)));
  const added: string[] = [];
  for (const [name, ddl] of DIGEST_COLUMNS) {
    if (have.has(name)) continue;
    await localPool.execute(`ALTER TABLE brand_regulations ${ddl}`);
    added.push(name);
  }
  if (added.includes("digest")) {
    // 第一版的卡是「全文進大腦」：原文夠短就原樣當審查重點（行為不變）；太長的由用戶選擇的
    // 「自動補萃取」處理——排進萃取，萃取好一樣要用戶確認。
    await localPool.execute(
      `UPDATE brand_regulations SET digest = body, digestConfirmedAt = NOW(3)
        WHERE digest IS NULL AND CHAR_LENGTH(body) <= ?`, [REG_DIGEST_MAX],
    );
    await localPool.execute(
      `UPDATE brand_regulations SET jobStatus = 'extracting', jobProgress = ?
        WHERE digest IS NULL AND CHAR_LENGTH(body) > ?`,
      [JSON.stringify({ stage: "reading", done: 0, total: 0 }), REG_DIGEST_MAX],
    );
  }
}

export async function listRegulations(brandId: number): Promise<BrandRegulation[]> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM brand_regulations WHERE brandId = ? ORDER BY createdAt ASC, id ASC`, [brandId],
  );
  return (Array.isArray(rows) ? rows : []).map(rowToRegulation);
}

export async function getRegulation(id: number): Promise<BrandRegulation | null> {
  const [rows]: any = await localPool.execute(`SELECT * FROM brand_regulations WHERE id = ? LIMIT 1`, [id]);
  const r = (rows as any[])[0];
  return r ? rowToRegulation(r) : null;
}

/**
 * 寫文與合規檢查要讀的法規：啟用中、且有已確認的審查重點。表不存在或查詢失敗回空陣列——
 * 法規讀不到不能讓整份大腦變空。
 */
export async function loadActiveRegulations(brandId: number): Promise<ActiveRegulation[]> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT * FROM brand_regulations WHERE brandId = ? AND enabled = 1 ORDER BY createdAt ASC, id ASC`, [brandId],
    );
    return (Array.isArray(rows) ? rows : []).map(rowToRegulation).filter((r) => r.active)
      .map((r) => ({ id: r.id, title: r.title, source: r.source, digest: r.digest }));
  } catch {
    return [];
  }
}

/** 大腦 prompt 裡一條法規的樣子：名稱＋來源＋審查重點。 */
export function regulationLine(r: Pick<ActiveRegulation, "title" | "source">, keptDigest: string): string {
  const src = r.source.trim() ? `（來源：${r.source.trim()}）` : "";
  return `【${r.title.trim()}】${src}\n${keptDigest}`;
}

/** prompt 裡法規段的標題：寫之前先審查。 */
export const REGULATION_BLOCK_HEADER =
  "[法規審查 — 動筆前先逐條對照以下法規。任何可能違反的說法一律不寫，改用合規的說法；" +
  "拿不準是否違規時從嚴、寧可不寫。這一段的優先級高於上面所有品牌指引與任務要求]";

/**
 * 審查重點可放多少字：硬上限與大腦剩餘空間取小。
 *
 * @param nonRegulationDemand 這個品牌「不含法規」時，一次寫作最多會讀進大腦的字數。
 * @param capacity 大腦容量（BRAIN_CAPACITY）。
 */
export function regulationBudget(nonRegulationDemand: number, capacity: number): {
  allowedTotal: number;
  limitedByBrain: boolean;
} {
  const room = Math.max(0, capacity - Math.max(0, nonRegulationDemand));
  return { allowedTotal: Math.min(REG_TOTAL_MAX, room), limitedByBrain: room < REG_TOTAL_MAX };
}

/**
 * 存審查重點前檢查：這張卡的審查重點改成 next 之後，啟用中的合計會不會超過可用額度。
 * 回傳 null＝可以存；否則回傳給用戶看的原因。
 */
export function checkRegulationFits(opts: {
  existing: Pick<BrandRegulation, "id" | "enabled" | "digestChars">[];
  /** 正在存的這張的審查重點字數。 */
  next: { id: number | null; enabled: boolean; chars: number };
  allowedTotal: number;
  limitedByBrain: boolean;
  en?: boolean;
}): string | null {
  const { existing, next, allowedTotal, limitedByBrain, en } = opts;
  const f = (n: number) => n.toLocaleString("en-US");
  if (next.chars > REG_DIGEST_MAX) {
    return en
      ? `Review points hold up to ${f(REG_DIGEST_MAX)} characters per regulation (this one has ${f(next.chars)}). Keep the rules most likely to be broken.`
      : `一條法規的審查重點最多 ${f(REG_DIGEST_MAX)} 字（這份 ${f(next.chars)} 字）。留下最容易被違反的規定就好。`;
  }
  if (!next.enabled) return null;
  const others = existing.filter((r) => r.enabled && r.id !== next.id).reduce((n, r) => n + r.digestChars, 0);
  if (others + next.chars <= allowedTotal) return null;
  const left = Math.max(0, allowedTotal - others);
  if (limitedByBrain) {
    return en
      ? `The brand memory only has room for ${f(left)} more characters of review points (this one has ${f(next.chars)}). Shorten it, turn off another regulation, or free up space in Memory.`
      : `品牌大腦只剩 ${f(left)} 字可以放審查重點（這份 ${f(next.chars)} 字）。請精簡、停用其他法規，或到「記憶」騰出空間。`;
  }
  return en
    ? `All active review points together hold up to ${f(REG_TOTAL_MAX)} characters; ${f(left)} left (this one has ${f(next.chars)}). Shorten it or turn off another regulation.`
    : `所有啟用中的審查重點合計最多 ${f(REG_TOTAL_MAX)} 字，還剩 ${f(left)} 字（這份 ${f(next.chars)} 字）。請精簡或停用其他法規。`;
}

export async function setJob(id: number, status: RegulationJobStatus, progress: RegulationJobProgress | null, error: string | null = null) {
  await localPool.execute(
    `UPDATE brand_regulations SET jobStatus = ?, jobProgress = ?, jobError = ? WHERE id = ?`,
    [status, progress ? JSON.stringify(progress) : null, error ? error.slice(0, 250) : null, id],
  );
}
