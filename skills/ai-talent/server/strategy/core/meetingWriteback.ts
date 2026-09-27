/**
 * meetingWriteback — 會議裡「採用」的調整寫回品牌大腦（定位），存版本、可復原。
 *
 * 2026-09-26（CJ「決定以後，會對整個品牌大腦有什麼影響嗎」→ 採用直接寫回，但只寫
 * 「策略表達」類的格子；「採用會影響到品牌大腦的時候，要出現一些提示，讓用戶知道」）。
 *
 * ── 流程 ──────────────────────────────────────────────────────────────
 *
 *   preview  把建議（或用戶修改後的文字）套進那一格 → 回「改哪幾個欄位、前後各是什麼」
 *            ＋「寫入後會影響哪裡」的提示。什麼都不寫。
 *   commit   用戶看過對照、按確認才寫；寫之前把原值存進 strategy_positioning_versions。
 *   revert   把那一版的原值寫回去。
 *
 * ── 界線 ──────────────────────────────────────────────────────────────
 *
 * 1. **只寫策略表達。** 競爭格局是研究證據（策略工作台同一條規則：證據不覆寫），
 *    採用只記決定。
 * 2. **品牌受眾寫兩處：受眾那一格的 primary／secondary ＋ brands.targetAudience。**
 *    產文時的品牌簡報（brandContext.buildBrandPrefix）讀的是 positioning.audience.primary，
 *    targetAudience 只有重跑定位時當錨點用——只寫欄位的話，提示說「之後產文會對這群人
 *    說話」卻沒有生效（2026-09-26 查 buildBrandPrefix 時發現）。標語同理：格子＋brands.tagline。
 *    兩個欄位的原值以 __targetAudience／__tagline 存進版本，復原時一起還原。
 * 3. **欄位白名單＋型別檢查。** 模型只負責把一段建議拆進既有欄位；不在白名單、
 *    型別不對（字串 vs 字串陣列）的一律丟掉。commit 時再驗一次，不信任前端送回來的東西。
 * 4. **定案鎖定要多一次確認。** 鎖是為了擋背景程式偷偷覆寫；用戶自己看過對照、
 *    勾了「我確認要修改已定案的定位」才寫。
 */
import localPool from "../../localDb";
import { callModel } from "../../platform/core/multiModelRouter";
import { isPositioningLocked } from "./positioningLock";
import { buildBrandPrefix, invalidateBrandPrefix } from "./brandContext";
import type { MeetingScope } from "./strategyMeetings";

export const POSITIONING_VERSIONS_DDL = `
  CREATE TABLE IF NOT EXISTS strategy_positioning_versions (
    id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId        INT          NOT NULL,
    brandId       INT          NOT NULL,
    scope         VARCHAR(16)  NOT NULL,
    scopeId       INT          NOT NULL,
    anchorId      VARCHAR(40)  NOT NULL,
    source        VARCHAR(24)  NOT NULL DEFAULT 'meeting',
    runId         INT          NULL,
    beforeJson    JSON         NULL,
    afterJson     JSON         NULL,
    revertedAt    DATETIME(3)  NULL,
    createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_pos_versions_scope (scope, scopeId, createdAt),
    KEY idx_pos_versions_run (runId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

type FieldType = "text" | "list";
/**
 * inBrief：這個欄位會不會進到產文的品牌簡報（brandContext.buildBrandPrefix）。只是給模型的
 * 提示——「把調整的重點寫進會被讀到的欄位」；真正的判斷是 preview 實際算一次簡報比對。
 */
interface FieldSpec { key: string; label: string; type: FieldType; inBrief?: boolean }
interface WritableAnchor {
  /** 寫到哪裡：定位 JSON 的某一格。 */
  target: "segment";
  fields: FieldSpec[];
  /** 寫入後會影響哪裡（給用戶看的提示）。 */
  impact: string[];
}

const COMMON_IMPACT = [
  "之後所有任務卡產出的文案——每次產文帶進去的品牌簡報會換成新內容",
  "策略總監的對話，以及下一場會議的「目前策略」",
];
const NOT_UPDATED = "已經產出的內容不會自動改寫；定位頁上其他格（例如黃金圈、標語評分）也不會自動重跑，需要的話到定位頁重新產生。";

const BRAND_WRITABLE: Record<string, WritableAnchor> = {
  audience: {
    target: "segment",
    fields: [{ key: "primary", label: "主受眾", type: "text", inBrief: true }, { key: "secondary", label: "次受眾", type: "text" }],
    impact: [
      "所有任務卡的目標客群——之後的產出會對新的受眾說話（也會同步成重跑定位時的受眾錨點）",
      ...COMMON_IMPACT,
      "策略監測比對用的受眾錨點",
    ],
  },
  differentiation: {
    target: "segment",
    fields: [
      { key: "summary", label: "差異化總結", type: "text", inBrief: true },
      { key: "discriminator", label: "唯一致勝理由", type: "text", inBrief: true },
      { key: "emotional", label: "情感差異化", type: "text" },
      { key: "functional", label: "功能差異化", type: "text" },
    ],
    impact: [...COMMON_IMPACT, "策略監測比對用的差異化錨點"],
  },
  tagline: {
    target: "segment",
    fields: [{ key: "zhTagline", label: "中文標語", type: "text", inBrief: true }, { key: "enTagline", label: "英文標語", type: "text", inBrief: true }],
    impact: ["品牌標語（會同步到品牌基本資料的標語欄）", ...COMMON_IMPACT, "策略監測比對用的標語錨點"],
  },
  voice: {
    target: "segment",
    fields: [
      { key: "tone", label: "核心語調關鍵詞", type: "list", inBrief: true },
      { key: "forbidden", label: "溝通禁區", type: "list", inBrief: true },
      { key: "archetypes", label: "人格原型", type: "list", inBrief: true },
    ],
    impact: ["所有文案的語氣規範——任務卡寫文案時遵守的語調與禁區", ...COMMON_IMPACT],
  },
};

const PRODUCT_WRITABLE: Record<string, WritableAnchor> = {
  core: {
    target: "segment",
    fields: [
      { key: "coreStatement", label: "核心定位", type: "text" },
      { key: "oneLineValueProp", label: "一句話價值主張", type: "text" },
      { key: "zhTagline", label: "產品中文標語", type: "text" },
    ],
    impact: ["這個產品的任務卡產文（產品定位簡報）", "產品策略總監的對話，以及這個產品下一場會議的「目前策略」"],
  },
  audience: {
    target: "segment",
    // 產文只讀 primary；secondary 只給會議與定位頁看。
    fields: [{ key: "primary", label: "主目標族群", type: "text" }, { key: "secondary", label: "次目標族群", type: "text" }],
    impact: ["這個產品的任務卡產文會對新的主目標族群說話（次目標族群只在定位頁與會議中使用）", "產品策略總監的對話，以及這個產品下一場會議的「目前策略」"],
  },
  value: {
    target: "segment",
    // 只放產文真的會讀的欄位（brandContext 產品區塊：coreFunctions／primaryEmotion／
    // personality／userFeeling）；advantages 不讀，寫了等於沒生效。
    fields: [
      { key: "coreFunctions", label: "核心功能", type: "list" },
      { key: "primaryEmotion", label: "主要情緒價值", type: "text" },
      { key: "personality", label: "品牌個性", type: "text" },
      { key: "userFeeling", label: "使用者感受", type: "text" },
    ],
    impact: ["這個產品的任務卡產文（賣點與情緒價值）", "產品策略總監的對話，以及這個產品下一場會議的「目前策略」"],
  },
  strategy: {
    target: "segment",
    fields: [
      { key: "positioning", label: "產品定位策略", type: "text" },
      { key: "pricing", label: "定價策略", type: "text" },
      { key: "channel", label: "通路策略", type: "text" },
      { key: "promotion", label: "推廣策略", type: "list" },
    ],
    // 產文的產品簡報不讀 strategy 這一格（2026-09-26 查 brandContext 確認）——照實說。
    impact: [
      "這個產品下一場會議的「目前策略」",
      "注意：任務卡產文與策略總監對話目前「不會」讀這一格——寫入後產出的文案不會因此改變",
    ],
  },
};

export function writableAnchor(scope: MeetingScope, anchorId: string): WritableAnchor | null {
  return (scope === "product" ? PRODUCT_WRITABLE : BRAND_WRITABLE)[anchorId] ?? null;
}

/** 不能寫入時給用戶的一句話（研究證據類）。 */
export const NOT_WRITABLE_NOTE = "這一格是研究證據（例如競爭格局），不會寫入品牌大腦——採用只會留下決定，實際調整請到定位頁看過證據後再改。";

export type Patch = Record<string, string | string[]>;
export interface FieldDiff { key: string; label: string; before: string | string[]; after: string | string[] }

/** 只留白名單欄位、型別正確、而且真的有變的值。 */
export function sanitizePatch(raw: unknown, spec: WritableAnchor, current: Record<string, unknown>): Patch {
  const out: Patch = {};
  if (!raw || typeof raw !== "object") return out;
  for (const f of spec.fields) {
    const v = (raw as Record<string, unknown>)[f.key];
    if (v == null) continue;
    if (f.type === "text") {
      if (typeof v !== "string") continue;
      const s = v.trim().slice(0, 1200);
      if (!s || s === String(current[f.key] ?? "").trim()) continue;
      out[f.key] = s;
    } else {
      if (!Array.isArray(v)) continue;
      const arr = v.map((x) => String(x ?? "").trim()).filter(Boolean).map((x) => x.slice(0, 200)).slice(0, 12);
      const cur = Array.isArray(current[f.key]) ? (current[f.key] as unknown[]).map(String) : [];
      if (!arr.length || JSON.stringify(arr) === JSON.stringify(cur)) continue;
      out[f.key] = arr;
    }
  }
  return out;
}

export function diffOf(patch: Patch, spec: WritableAnchor, current: Record<string, unknown>): FieldDiff[] {
  return spec.fields.filter((f) => f.key in patch).map((f) => ({
    key: f.key, label: f.label,
    before: f.type === "list" ? (Array.isArray(current[f.key]) ? (current[f.key] as unknown[]).map(String) : []) : String(current[f.key] ?? ""),
    after: patch[f.key]!,
  }));
}

const parse = (v: unknown): any => {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return {}; } }
  return v ?? {};
};

async function loadCurrent(args: { userId: number; brandId: number; scope: MeetingScope; scopeId: number; anchorId: string; spec: WritableAnchor }): Promise<{ current: Record<string, unknown>; positioning: any; columns?: { targetAudience: string | null; tagline: string | null } }> {
  if (args.scope === "product") {
    const [rows]: any = await localPool.execute(
      `SELECT positioning FROM products WHERE id = ? AND brandId = ? AND userId = ? LIMIT 1`, [args.scopeId, args.brandId, args.userId],
    );
    const pos = parse((rows as any[])[0]?.positioning);
    return { current: (pos?.[args.anchorId] && typeof pos[args.anchorId] === "object") ? pos[args.anchorId] : {}, positioning: pos };
  }
  const [rows]: any = await localPool.execute(
    `SELECT positioning, targetAudience, tagline FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [args.brandId, args.userId],
  );
  const r = (rows as any[])[0] ?? {};
  const pos = parse(r.positioning);
  return {
    current: (pos?.[args.anchorId] && typeof pos[args.anchorId] === "object") ? pos[args.anchorId] : {},
    positioning: pos,
    columns: { targetAudience: r.targetAudience ?? null, tagline: r.tagline ?? null },
  };
}

/**
 * 產文簡報的實際變化——用寫入後的定位真的算一次 buildBrandPrefix，跟現在的比對。
 * 2026-09-26 dev 實測：寫入「功能差異化」成功，但產文簡報一個字都沒變（完整簡報只讀
 * 總結與致勝理由）。提示不能靠手寫的欄位清單猜，要算出來。
 */
export interface BriefChange { changed: boolean; added: string[]; removed: string[] }

export interface PreviewResult {
  writable: boolean;
  note?: string;
  locked: boolean;
  diffs: FieldDiff[];
  patch: Patch;
  impact: string[];
  notUpdated: string;
  brief: BriefChange | null;
}

/** 兩份簡報的逐行差異（只看內容行，去掉空行與重複）。 */
export function briefLineDiff(before: string, after: string): BriefChange {
  const lines = (s: string) => new Set(s.split("\n").map((l) => l.trim()).filter((l) => l.length > 1));
  const a = lines(before);
  const b = lines(after);
  const added = [...b].filter((l) => !a.has(l)).slice(0, 12).map((l) => l.slice(0, 300));
  const removed = [...a].filter((l) => !b.has(l)).slice(0, 12).map((l) => l.slice(0, 300));
  return { changed: added.length > 0 || removed.length > 0, added, removed };
}

async function computeBriefChange(args: {
  brandId: number; scope: MeetingScope; scopeId: number; anchorId: string; positioning: any; patch: Patch;
}): Promise<BriefChange | null> {
  try {
    const productId = args.scope === "product" ? args.scopeId : null;
    const next = JSON.parse(JSON.stringify(args.positioning ?? {}));
    next[args.anchorId] = { ...(next[args.anchorId] && typeof next[args.anchorId] === "object" ? next[args.anchorId] : {}), ...args.patch };
    const override = args.scope === "product" ? { productPositioningOverride: next } : { positioningOverride: next };
    const same = args.scope === "product" ? { productPositioningOverride: args.positioning } : { positioningOverride: args.positioning };
    // 完整與精簡兩種簡報都算——短任務吃精簡版，長任務吃完整版。
    const [bf, bc, af, ac] = await Promise.all([
      buildBrandPrefix(args.brandId, productId, null, "full", same),
      buildBrandPrefix(args.brandId, productId, null, "core", same),
      buildBrandPrefix(args.brandId, productId, null, "full", override),
      buildBrandPrefix(args.brandId, productId, null, "core", override),
    ]);
    return briefLineDiff(`${bf}\n${bc}`, `${af}\n${ac}`);
  } catch {
    return null;
  }
}

/** 把一段建議拆進那一格的欄位。受眾錨點只有一個欄位，直接用原文，不叫模型。 */
export async function previewWriteback(args: {
  userId: number; brandId: number; scope: MeetingScope; scopeId: number; anchorId: string; anchorLabel: string; text: string;
}): Promise<PreviewResult> {
  const spec = writableAnchor(args.scope, args.anchorId);
  const locked = args.scope === "brand" ? await isPositioningLocked("brand", args.brandId, args.userId) : false;
  if (!spec) return { writable: false, note: NOT_WRITABLE_NOTE, locked, diffs: [], patch: {}, impact: [], notUpdated: "", brief: null };
  const { current, positioning } = await loadCurrent({ ...args, spec });

  let raw: unknown = null;
  if (spec.fields.length === 1 && spec.fields[0]!.type === "text") {
    raw = { [spec.fields[0]!.key]: args.text };
  } else {
    const fieldList = spec.fields.map((f) => `- ${f.key}（${f.label}，${f.type === "list" ? "字串陣列，每項一個短詞或一句" : "一段文字"}${f.inBrief ? "，★產文會讀這一欄" : ""}）：${JSON.stringify(current[f.key] ?? (f.type === "list" ? [] : ""))}`).join("\n");
    const prompt = [
      `你要把一項策略會議通過的調整，寫進品牌定位「${args.anchorLabel}」這一格的欄位。`,
      `【目前各欄位】\n${fieldList}`,
      `【通過的調整】\n${args.text}`,
      `規則：`,
      `1. 只輸出需要改的欄位；沒被這項調整影響的欄位不要出現。`,
      `2. 寫成可以直接放進定位的內容（不是會議語氣、不要寫「建議」「應該」「待確認」）。保留原本仍然成立的部分，只改調整涉及的地方。`,
      `3. 標★的欄位會進到每次產文的品牌簡報——調整的重點一定要落在★欄位，否則寫入後產出的文案不會改變。`,
      `4. 字串陣列欄位輸出完整的新陣列。繁體中文（台灣用語）。只輸出 JSON 物件，例如 {"summary":"…"}。`,
    ].join("\n\n");
    for (let attempt = 0; attempt < 2 && !raw; attempt++) {
      try {
        const r = await callModel([{ role: "user", content: prompt }], "general");
        const cleaned = String(r.content ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
        raw = s >= 0 && e > s ? JSON.parse(cleaned.slice(s, e + 1)) : null;
      } catch { raw = null; }
    }
  }
  const patch = sanitizePatch(raw, spec, current);
  const brief = Object.keys(patch).length
    ? await computeBriefChange({ brandId: args.brandId, scope: args.scope, scopeId: args.scopeId, anchorId: args.anchorId, positioning, patch })
    : null;
  // 影響清單照實算：簡報沒變，就不能說「產文會用新內容」。
  const impact = brief && !brief.changed
    ? [
      "注意：這次改動的欄位不會進到任務卡產文的品牌簡報——寫入後，產出的文案不會因此改變",
      "會影響：定位頁上這一格的內容，以及下一場會議的「目前策略」",
    ]
    : spec.impact;
  return { writable: true, locked, diffs: diffOf(patch, spec, current), patch, impact, notUpdated: NOT_UPDATED, brief };
}

/** 寫入。回版本 id。呼叫端負責「用戶已確認」與鎖定確認。 */
export async function commitWriteback(args: {
  userId: number; brandId: number; scope: MeetingScope; scopeId: number; anchorId: string; runId: number; patch: unknown;
}): Promise<{ versionId: number; diffs: FieldDiff[] }> {
  const spec = writableAnchor(args.scope, args.anchorId);
  if (!spec) throw new Error("not_writable");
  const { current, positioning, columns } = await loadCurrent({ ...args, spec });
  const patch = sanitizePatch(args.patch, spec, current);
  const diffs = diffOf(patch, spec, current);
  if (!diffs.length) throw new Error("empty_patch");
  const before: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) before[k] = current[k] ?? null;
  if (args.scope === "brand" && args.anchorId === "audience" && "primary" in patch) before.__targetAudience = columns?.targetAudience ?? null;
  if (args.scope === "brand" && args.anchorId === "tagline" && "zhTagline" in patch) before.__tagline = columns?.tagline ?? null;

  await applyFields({ ...args, spec, positioning, values: patch });
  invalidateBrandPrefix(args.brandId);
  const [ins]: any = await localPool.execute(
    `INSERT INTO strategy_positioning_versions (userId, brandId, scope, scopeId, anchorId, source, runId, beforeJson, afterJson)
     VALUES (?, ?, ?, ?, ?, 'meeting', ?, ?, ?)`,
    [args.userId, args.brandId, args.scope, args.scopeId, args.anchorId, args.runId, JSON.stringify(before), JSON.stringify(patch)],
  );
  return { versionId: Number(ins.insertId), diffs };
}

/**
 * 把 values 寫進那一格。以 __ 開頭的 key 是 brands 的欄位（只有復原時會出現）：
 * __targetAudience、__tagline。寫入時品牌受眾的 primary 同步到 targetAudience、
 * 標語的 zhTagline 同步到 brands.tagline。
 */
async function applyFields(args: {
  userId: number; brandId: number; scope: MeetingScope; scopeId: number; anchorId: string;
  spec: WritableAnchor; positioning: any; values: Record<string, unknown>;
}): Promise<void> {
  const pos = args.positioning && typeof args.positioning === "object" ? args.positioning : {};
  const seg = { ...(pos[args.anchorId] && typeof pos[args.anchorId] === "object" ? pos[args.anchorId] : {}) };
  const cols: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(args.values)) {
    if (k.startsWith("__")) { cols[k.slice(2)] = v == null ? null : String(v); continue; }
    if (v == null) delete seg[k]; else seg[k] = v;
  }
  pos[args.anchorId] = seg;
  if (args.scope === "product") {
    await localPool.execute(`UPDATE products SET positioning = ? WHERE id = ? AND brandId = ? AND userId = ?`,
      [JSON.stringify(pos), args.scopeId, args.brandId, args.userId]);
    return;
  }
  // 寫入（不是復原）時的同步：受眾主受眾 → targetAudience、中文標語 → brands.tagline。
  if (args.anchorId === "audience" && !("targetAudience" in cols) && typeof args.values.primary === "string") cols.targetAudience = args.values.primary;
  if (args.anchorId === "tagline" && !("tagline" in cols) && typeof args.values.zhTagline === "string") cols.tagline = args.values.zhTagline;
  const setCols = Object.keys(cols).filter((c) => c === "targetAudience" || c === "tagline");
  await localPool.execute(
    `UPDATE brands SET positioning = ?${setCols.map((c) => `, ${c} = ?`).join("")} WHERE id = ? AND userId = ?`,
    [JSON.stringify(pos), ...setCols.map((c) => cols[c] ?? null), args.brandId, args.userId],
  );
}

/** 復原某一版：把寫入前的原值放回去。 */
export async function revertWriteback(args: { userId: number; versionId: number }): Promise<{ runId: number | null; anchorId: string }> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM strategy_positioning_versions WHERE id = ? AND userId = ? LIMIT 1`, [args.versionId, args.userId],
  );
  const v = (rows as any[])[0];
  if (!v) throw new Error("not_found");
  if (v.revertedAt) throw new Error("already_reverted");
  const scope: MeetingScope = v.scope === "product" ? "product" : "brand";
  const spec = writableAnchor(scope, String(v.anchorId));
  if (!spec) throw new Error("not_writable");
  const { positioning } = await loadCurrent({ userId: args.userId, brandId: Number(v.brandId), scope, scopeId: Number(v.scopeId), anchorId: String(v.anchorId), spec });
  await applyFields({
    userId: args.userId, brandId: Number(v.brandId), scope, scopeId: Number(v.scopeId), anchorId: String(v.anchorId),
    spec, positioning, values: parse(v.beforeJson),
  });
  invalidateBrandPrefix(Number(v.brandId));
  await localPool.execute(`UPDATE strategy_positioning_versions SET revertedAt = NOW(3) WHERE id = ?`, [args.versionId]);
  return { runId: v.runId == null ? null : Number(v.runId), anchorId: String(v.anchorId) };
}
