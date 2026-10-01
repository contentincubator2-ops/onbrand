/**
 * campaignBasis — 活動頁右邊的「策略依據」（舊的 11 段活動定位）：讀、改、讓策略總監在
 * 對話裡改。
 *
 * 2026-09-30（CJ「在總監對話底下的策略依據，可以改成一個跳出頁面嗎，或是可以替代右邊的
 * 行事曆，讓用戶還是可以透過跟總監的互動，進行修改和討論」）：右邊可以在「企劃」與
 * 「策略依據」之間切換，左邊的對話照常——跟總監說要改哪裡，他直接改進策略依據。
 *
 * 資料住在 events.positioning.<段 id>.<欄位>（段的定義在 client 的
 * v2/strategy/lib/positioningSchema.ts EVENT_SEGMENTS，那裡是唯一來源）。這裡只列
 * 總監可以改的欄位：文字與清單。表格（得獎案例、管道配置、旅程）與系統自動填的
 * 欄位不給模型改——那些有自己的產生流程，模型順手改掉會跟來源對不上。
 */

export type BasisValue = string | string[];
/** null＝清掉那一格（只有使用者自己編輯或復原時會送；模型的改法不收 null）。 */
export type BasisPatch = Record<string, BasisValue | null>;

/** 路徑（段.欄位）→ 標籤與型態。順序就是畫面與 prompt 的順序。 */
export const BASIS_FIELDS: Record<string, { label: string; kind: "text" | "list" }> = {
  "brief.roleThisRound": { label: "本次角色", kind: "text" },
  "brief.briefSummary": { label: "活動定位摘要", kind: "text" },
  "context.businessBackground": { label: "商業背景", kind: "text" },
  "context.marketingStatus": { label: "當前行銷現況", kind: "text" },
  "context.coreProblem": { label: "核心問題", kind: "text" },
  "context.rootCause": { label: "根本原因", kind: "text" },
  "audience.primaryAudience": { label: "核心受眾", kind: "text" },
  "audience.secondaryAudience": { label: "次要受眾", kind: "text" },
  "audience.keyInsight": { label: "關鍵洞察", kind: "text" },
  "objectives.businessGoal": { label: "商業目標", kind: "text" },
  "objectives.marketingGoal": { label: "行銷目標", kind: "text" },
  "objectives.userActionGoal": { label: "用戶行為目標", kind: "text" },
  "objectives.kpis": { label: "可量化 KPI", kind: "list" },
  "smp.singleMindedProposition": { label: "SMP（單一核心命題）", kind: "text" },
  "smp.rationale": { label: "為什麼是這句", kind: "text" },
  "messaging.coreMessage": { label: "核心訊息", kind: "text" },
  "messaging.supportingPoints": { label: "支撐訊息", kind: "list" },
  "messaging.proofs": { label: "證據", kind: "list" },
  "creative.creativeTheme": { label: "創意主題", kind: "text" },
  "creative.coreMetaphor": { label: "核心比喻", kind: "text" },
  "creative.coreTranslation": { label: "核心轉譯（一句話 hook）", kind: "text" },
  "guidelines.toneOfVoice": { label: "語氣", kind: "text" },
  "guidelines.visualLanguage": { label: "視覺語言", kind: "text" },
  "guidelines.mustHaveElements": { label: "必須出現", kind: "list" },
  "guidelines.forbiddenElements": { label: "禁用元素", kind: "list" },
};

const TEXT_MAX = 600;
const ITEM_MAX = 160;
const LIST_MAX = 8;

function clean(kind: "text" | "list", v: unknown): BasisValue | null {
  if (kind === "text") {
    if (typeof v !== "string") return null;
    const t = v.trim().slice(0, TEXT_MAX);
    return t ? t : null;
  }
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n+/) : null;
  if (!arr) return null;
  const items = arr.map((x) => String(x ?? "").trim().slice(0, ITEM_MAX)).filter(Boolean).slice(0, LIST_MAX);
  return items.length ? items : null;
}

/** 讀出某個路徑目前的值。 */
export function basisValue(pos: Record<string, any>, path: string): BasisValue | null {
  const [seg, key] = path.split(".");
  const v = pos?.[seg!]?.[key!];
  if (v == null || v === "") return null;
  return Array.isArray(v) ? v.map(String) : typeof v === "string" ? v : String(v);
}

const same = (a: BasisValue | null, b: BasisValue | null) => JSON.stringify(a) === JSON.stringify(b);

/** 模型或畫面送來的改法 → 只留允許的路徑、整理過、跟現在不一樣的。純函式。 */
export function validateBasis(raw: unknown, pos: Record<string, any>, opts: { allowClear?: boolean } = {}): BasisPatch {
  const out: BasisPatch = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [path, v] of Object.entries(raw as Record<string, unknown>)) {
    const spec = BASIS_FIELDS[path];
    if (!spec) continue;
    const c = clean(spec.kind, v);
    if (c == null && !opts.allowClear) continue;
    if (same(c, basisValue(pos, path))) continue;
    out[path] = c;
    if (Object.keys(out).length >= 10) break;
  }
  return out;
}

/** 把改法寫進 positioning（回傳新的物件，不動原本的）。 */
export function applyBasis(pos: Record<string, any>, patch: BasisPatch): Record<string, any> {
  const next = { ...pos };
  for (const [path, v] of Object.entries(patch)) {
    if (!BASIS_FIELDS[path]) continue;
    const [seg, key] = path.split(".") as [string, string];
    const cur = { ...(next[seg] && typeof next[seg] === "object" ? next[seg] : {}) };
    if (v == null) delete cur[key]; else cur[key] = v;
    next[seg] = cur;
  }
  return next;
}

/** 給總監看的策略依據（每格截短）。空的格子也列，總監才知道哪裡還沒寫。 */
export function basisLines(pos: Record<string, any>): string {
  return Object.entries(BASIS_FIELDS).map(([path, spec]) => {
    const v = basisValue(pos, path);
    const text = v == null ? "（空）" : Array.isArray(v) ? v.join("／") : v;
    return `- ${path}｜${spec.label}｜${text.replace(/\s+/g, " ").slice(0, 220)}`;
  }).join("\n");
}

/** 畫面用：11 段裡總監能改的那些欄位目前的值。 */
export function basisSnapshot(pos: Record<string, any>): Record<string, BasisValue | null> {
  const out: Record<string, BasisValue | null> = {};
  for (const path of Object.keys(BASIS_FIELDS)) out[path] = basisValue(pos, path);
  return out;
}
