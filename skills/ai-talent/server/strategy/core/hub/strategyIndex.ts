/**
 * strategyIndex — 把五種策略資料投影成同一個形狀，給 AI 下條件檢索。
 *
 * 2026-09-23 (CJ「get data ready for AI」)。形狀的定義與篩選邏輯在
 * strategyRegistry.ts；這一支只負責「從各自的資料表讀出來、投影過去」。
 *
 * ── 投影的時候最容易說謊的兩個欄位 ───────────────────────────────────
 * `source` 與 `quotable`。它們決定 AI 敢不敢拿這筆資料去寫東西，所以寧可保守：
 *
 *   source：只有真的有網址才給。產品的 source_url 可能是空的，那就是 null，
 *           不要拿供應商名稱去頂替——「有出處」跟「知道是誰講的」是兩件事。
 *   quotable：只有市場數據（有查證、有數字）與產品價格算。用詞、品牌設定、
 *           法規條文都不是可以被貼文當成事實引用的東西。
 *
 * ── 生效區間統一成 effectiveFrom / effectiveTo ────────────────────────
 * 五種資料各自用不同的欄位表達時效（價格是 effective_from/to、緘默期是
 * starts_on/ends_on、補助是 expires_on、法規是 effective_on），投影之後
 * AI 只需要問一次「今天有效的」。
 */
import type { StrategyRecord } from "./strategyRegistry";

const s = (v: unknown) => (v == null ? "" : String(v));
const ymd = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10) || null;
};
const arr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
};
const src = (name: unknown, url: unknown) =>
  s(url).startsWith("http") ? { name: s(name) || s(url), url: s(url) } : null;

/** 讀出全部五種資料並投影。一次查詢就夠 —— 策略層的資料量是幾百筆，不是幾百萬。 */
export async function buildStrategyIndex(orgId: number): Promise<StrategyRecord[]> {
  const { q } = await import("../../../platform/core/hub/hubStore");
  const out: StrategyRecord[] = [];

  // ── 市場數據 ──
  for (const f of await q(`SELECT * FROM hub_facts WHERE org_id = ?`, [orgId])) {
    const figures = typeof f.figures === "string" ? JSON.parse(f.figures || "{}") : (f.figures ?? {});
    const hasFigure = Boolean(figures?.percents?.length || figures?.amounts?.length);
    out.push({
      entity: "fact", id: f.id,
      title: { en: s(f.statement_en).slice(0, 140), zh: s(f.statement_zh).slice(0, 140) },
      body: { en: s(f.statement_en), zh: s(f.statement_zh) },
      market: s(f.market) || null,
      industries: arr(f.industries),
      kind: s(f.kind) || null,
      status: s(f.confidence) || null,
      effectiveFrom: ymd(f.published_on),
      effectiveTo: ymd(f.expires_on),
      source: src(f.source_name, f.source_url),
      // 待查證的數據永遠不算可引用 —— 合規引擎也是這樣判的，兩邊要一致。
      quotable: s(f.confidence) !== "needs_verification" && hasFigure,
    });
  }

  // ── 產品 ──
  const sols = await q(`SELECT * FROM hub_solutions WHERE org_id = ?`, [orgId]);
  for (const sol of sols) {
    out.push({
      entity: "solution", id: sol.id,
      title: { en: s(sol.name_en), zh: s(sol.name_zh) },
      body: { en: s(sol.summary_en), zh: s(sol.summary_zh) },
      market: null, // 方案目錄不分市場
      industries: arr(sol.industries),
      kind: s(sol.category) || null,
      status: sol.pending && Object.keys(typeof sol.pending === "string" ? JSON.parse(sol.pending || "{}") : sol.pending ?? {}).length
        ? "pending" : "approved",
      effectiveFrom: null, effectiveTo: null,
      source: src(sol.vendor, sol.source_url),
      quotable: true,
    });
  }

  // ── 用詞 ──
  for (const w of await q(`SELECT * FROM hub_wording WHERE org_id = ?`, [orgId])) {
    const term = s(w.term);
    const repl = s(w.replacement);
    out.push({
      entity: "wording", id: w.id,
      title: { en: term, zh: term },
      body: { en: repl ? `${term} → ${repl}` : term, zh: repl ? `${term} → ${repl}` : term },
      market: s(w.market) || null,
      industries: [],
      kind: s(w.kind) || null,
      status: "active",
      effectiveFrom: null, effectiveTo: null,
      source: null,
      quotable: false, // 用詞是規則，不是可以引用的事實
    });
  }

  // ── 法規 ──
  for (const r of await q(`SELECT * FROM hub_regulations WHERE org_id = ?`, [orgId])) {
    out.push({
      entity: "regulation", id: r.id,
      title: { en: s(r.name_en) || s(r.title), zh: s(r.name_zh) || s(r.title) },
      body: { en: s(r.summary), zh: s(r.summary_zh) || s(r.summary) },
      market: s(r.market) || null,
      industries: [],
      kind: "rule_change",
      status: s(r.status) || null,
      effectiveFrom: ymd(r.effective_on),
      effectiveTo: null,
      source: src(r.authority, r.source_url),
      quotable: false, // 法規是約束，不是拿來宣傳的素材
    });
  }

  // ── 品牌資料 ──
  for (const b of await q(`SELECT * FROM hub_brand_assets WHERE org_id = ?`, [orgId])) {
    const p = typeof b.payload === "string" ? JSON.parse(b.payload || "{}") : (b.payload ?? {});
    const label = s(p.label) || s(p.name) || s(b.kind);
    const value = s(p.value) || s(p.url) || s(p.note) || "";
    out.push({
      entity: "brand_asset", id: b.id,
      title: { en: label, zh: label },
      body: { en: value, zh: value },
      market: s(p.market) || null,
      industries: [],
      kind: s(b.kind) || null,
      status: "active",
      // 緘默期就是靠這兩個欄位表達的，投影之後 AI 問「今天有效的」就問得到。
      effectiveFrom: ymd(p.startsOn ?? p.starts_on),
      effectiveTo: ymd(p.endsOn ?? p.ends_on),
      source: src(label, p.url),
      quotable: false,
    });
  }

  return out;
}
