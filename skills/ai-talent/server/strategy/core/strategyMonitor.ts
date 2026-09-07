/**
 * strategyMonitor — 策略監測：為品牌與產品設監測清單，受眾或競爭者有變化時
 * 亮出情報，提醒回策略工作台調整哪個錨點。
 *
 * 2026-09-08 (CJ「有一群人，策略層上，如果發現用戶有變化的時候，或是競爭者有
 * 變化的時候，會亮出情報，提醒用戶要調整策略。為他的品牌和產品，都設定好監測
 * 的機制」；「策略監測，定義在 9000 的方案」)
 *
 * ── 這一層長什麼樣 ────────────────────────────────────────────────────
 *
 *   strategy_watch   每個品牌一份、每個產品一份：關鍵字、競爭者、開關、上次掃描
 *   strategy_alerts  掃描產出的「策略提醒」：發生了什麼、為什麼重要、動哪個錨點
 *
 *   掃描 = scout（Web 市調）拿近 14 天的情報 → LLM 對照品牌的三個錨點
 *   （受眾、差異化、標語）判斷「有沒有重要到該調整」→ 最多 3 則提醒。
 *
 * ── 三條刻意的界線 ────────────────────────────────────────────────────
 *
 * 1. **沒證據不出提醒。** 每則提醒都要指回至少一則情報（evidence），LLM 只能
 *    從 scout 拿到的東西裡挑，不能自己「覺得」市場變了。市場層 9/8 已拆，
 *    這裡不是把它加回來 —— 用戶看到的是提醒，不是數據儀表板。
 *
 * 2. **提醒指向錨點，不代替決定。** anchor 說的是「回工作台看哪一格」，
 *    suggestion 是一句建議；套不套用是用戶在工作台做的事。
 *
 * 3. **掃不到就誠實記下來。** scout 沒 key、沒抓到東西、LLM 壞掉，都寫進
 *    lastScanNote 讓前台顯示，不會假裝掃過而且一切平靜。
 *
 * 週期：每份 watch 至少隔 7 天掃一次（worker 每 15 分鐘挑一份到期的）；
 * 手動掃描每品牌 24 小時一次。這兩個數字是成本線，不是產品承諾。
 */
import localPool from "../../localDb";
import { invokeLLM } from "../../platform/core/llm";
import { planQuotaFor } from "../../platform/core/planGate";
import { perplexityScout } from "../../content/core/scouts/perplexityScout";
import type { IntelItem, ScoutContext } from "../../content/core/scouts/types";

export const STRATEGY_WATCH_DDL = `
  CREATE TABLE IF NOT EXISTS strategy_watch (
    id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId        INT          NOT NULL,
    brandId       INT          NOT NULL,
    scope         VARCHAR(16)  NOT NULL DEFAULT 'brand',
    scopeId       INT          NOT NULL,
    keywords      JSON         NULL,
    competitors   JSON         NULL,
    enabled       TINYINT(1)   NOT NULL DEFAULT 1,
    lastScanAt    DATETIME(3)  NULL,
    lastScanNote  VARCHAR(255) NULL,
    lastScanItems INT          NOT NULL DEFAULT 0,
    createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_strategy_watch_scope (scope, scopeId),
    KEY idx_strategy_watch_brand (brandId),
    KEY idx_strategy_watch_due (enabled, lastScanAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const STRATEGY_ALERTS_DDL = `
  CREATE TABLE IF NOT EXISTS strategy_alerts (
    id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId        INT          NOT NULL,
    brandId       INT          NOT NULL,
    scope         VARCHAR(16)  NOT NULL DEFAULT 'brand',
    scopeId       INT          NOT NULL,
    kind          VARCHAR(32)  NOT NULL,
    anchor        VARCHAR(32)  NOT NULL DEFAULT 'none',
    alertKey      VARCHAR(191) NOT NULL,
    title         VARCHAR(255) NOT NULL,
    summary       TEXT         NULL,
    suggestion    TEXT         NULL,
    evidence      JSON         NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'new',
    createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_strategy_alerts_brand (brandId, status, createdAt),
    KEY idx_strategy_alerts_key (scope, scopeId, alertKey)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export type WatchScope = "brand" | "product";
export type AlertKind = "competitor_move" | "audience_shift" | "market_trend";
export type AlertAnchor = "audience" | "competition" | "differentiation" | "tagline" | "none";
export type AlertStatus = "new" | "seen" | "applied" | "dismissed";

export const ALERT_KINDS: readonly AlertKind[] = ["competitor_move", "audience_shift", "market_trend"] as const;
export const ALERT_ANCHORS: readonly AlertAnchor[] = ["audience", "competition", "differentiation", "tagline", "none"] as const;

/** 兩次自動掃描的最短間隔（天）。 */
export const SCAN_INTERVAL_DAYS = 7;
/** 手動掃描的冷卻（小時）。 */
export const MANUAL_SCAN_COOLDOWN_HOURS = 24;
/** 同一個 alertKey 在這個天數內不重複出現。 */
export const DEDUPE_DAYS = 30;

export interface StrategyWatch {
  id: number;
  userId: number;
  brandId: number;
  scope: WatchScope;
  scopeId: number;
  keywords: string[];
  competitors: string[];
  enabled: boolean;
  lastScanAt: string | null;
  lastScanNote: string | null;
  lastScanItems: number;
}

export interface StrategyAlert {
  id: number;
  brandId: number;
  scope: WatchScope;
  scopeId: number;
  kind: AlertKind;
  anchor: AlertAnchor;
  title: string;
  summary: string;
  suggestion: string;
  evidence: Array<{ title: string; url?: string; source?: string; publishedAt?: string }>;
  status: AlertStatus;
  createdAt: string;
}

// ─── 純函式（可測）────────────────────────────────────────────────────────

const uniq = (arr: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const s = String(raw ?? "").trim();
    if (!s || s.length > 60) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
};

function namesOf(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r: any) => (typeof r === "string" ? r : r?.name)).filter((x) => typeof x === "string");
}

/**
 * 從定位推出預設監測清單。品牌：名稱＋產業＋直接／間接競品；產品：產品名＋
 * 產品定位裡的競品。用戶之後可以改，但第一次打開就要有東西，而不是一張空表。
 */
export function deriveDefaultWatch(args: {
  scope: WatchScope;
  name: string;
  industry?: string | null;
  positioning: any;
}): { keywords: string[]; competitors: string[] } {
  const pos = args.positioning && typeof args.positioning === "object" ? args.positioning : {};
  const keywords = uniq([args.name, args.industry ?? ""]);
  const competitors = args.scope === "brand"
    ? uniq([...namesOf(pos?.competition?.direct), ...namesOf(pos?.competition?.indirect)])
    : uniq(namesOf(pos?.competition?.competitors));
  return { keywords, competitors: competitors.slice(0, 10) };
}

/** 去重鍵：kind ＋ 標題去掉標點與空白後的前 60 字。 */
export function alertKeyOf(kind: string, title: string): string {
  const norm = String(title ?? "")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .slice(0, 60);
  return `${kind}:${norm}`;
}

export interface ParsedAlert {
  kind: AlertKind;
  anchor: AlertAnchor;
  title: string;
  summary: string;
  suggestion: string;
  evidence: number[];
}

/**
 * 把 LLM 回的 JSON 收斂成合法提醒：kind／anchor 不認得就丟、沒有 evidence 就丟、
 * 最多 3 則。這裡寧可少一則也不要放一則「我覺得市場變了」進資料庫。
 */
export function parseAlertsJson(raw: string, itemCount: number): ParsedAlert[] {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let obj: any = null;
  try { obj = JSON.parse(cleaned); } catch {
    const s = cleaned.indexOf("{");
    if (s >= 0) { try { obj = JSON.parse(cleaned.slice(s)); } catch { obj = null; } }
  }
  const arr = Array.isArray(obj?.alerts) ? obj.alerts : [];
  const out: ParsedAlert[] = [];
  for (const a of arr) {
    const kind = String(a?.kind ?? "");
    const anchor = String(a?.anchor ?? "none");
    if (!ALERT_KINDS.includes(kind as AlertKind)) continue;
    if (!ALERT_ANCHORS.includes(anchor as AlertAnchor)) continue;
    const title = String(a?.title ?? "").trim().slice(0, 200);
    if (title.length < 4) continue;
    const evidence: number[] = (Array.isArray(a?.evidence) ? (a.evidence as unknown[]) : [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < itemCount);
    if (!evidence.length) continue;
    out.push({
      kind: kind as AlertKind,
      anchor: anchor as AlertAnchor,
      title,
      summary: String(a?.summary ?? "").trim().slice(0, 1200),
      suggestion: String(a?.suggestion ?? "").trim().slice(0, 600),
      evidence: [...new Set(evidence)].slice(0, 5),
    });
    if (out.length >= 3) break;
  }
  return out;
}

export function isDue(lastScanAt: string | Date | null | undefined, now: Date = new Date(), days: number = SCAN_INTERVAL_DAYS): boolean {
  if (!lastScanAt) return true;
  const t = new Date(lastScanAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t >= days * 86_400_000;
}

// ─── 資料存取 ─────────────────────────────────────────────────────────────

function rowToWatch(r: any): StrategyWatch {
  const j = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter((x) => typeof x === "string") : []; } catch { return []; } }
    return [];
  };
  return {
    id: Number(r.id), userId: Number(r.userId), brandId: Number(r.brandId),
    scope: r.scope === "product" ? "product" : "brand", scopeId: Number(r.scopeId),
    keywords: j(r.keywords), competitors: j(r.competitors),
    enabled: !!Number(r.enabled),
    lastScanAt: r.lastScanAt ? new Date(r.lastScanAt).toISOString() : null,
    lastScanNote: r.lastScanNote ?? null,
    lastScanItems: Number(r.lastScanItems ?? 0),
  };
}

function rowToAlert(r: any): StrategyAlert {
  let evidence: StrategyAlert["evidence"] = [];
  try { const p = typeof r.evidence === "string" ? JSON.parse(r.evidence) : r.evidence; if (Array.isArray(p)) evidence = p; } catch { /* 顯示用 */ }
  return {
    id: Number(r.id), brandId: Number(r.brandId),
    scope: r.scope === "product" ? "product" : "brand", scopeId: Number(r.scopeId),
    kind: r.kind, anchor: r.anchor ?? "none",
    title: String(r.title ?? ""), summary: String(r.summary ?? ""), suggestion: String(r.suggestion ?? ""),
    evidence, status: r.status ?? "new",
    createdAt: new Date(r.createdAt).toISOString(),
  };
}

export async function listWatches(brandId: number): Promise<StrategyWatch[]> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM strategy_watch WHERE brandId = ? ORDER BY scope, scopeId`, [brandId],
  );
  return (rows as any[]).map(rowToWatch);
}

/**
 * 確保品牌與它的每個產品都有一份 watch（沒有就用定位推預設值建）。
 * 回傳目前的全部 watch。這是 overview 的第一步，所以第一次打開就有東西。
 */
export async function ensureWatches(args: { userId: number; brandId: number }): Promise<StrategyWatch[]> {
  const [bRows]: any = await localPool.execute(
    `SELECT id, name, industry, positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [args.brandId, args.userId],
  );
  const brand = (bRows as any[])[0];
  if (!brand) return [];
  const [pRows]: any = await localPool.execute(
    `SELECT id, name, positioning FROM products WHERE brandId = ? AND userId = ? ORDER BY id LIMIT 50`,
    [args.brandId, args.userId],
  );
  const existing = await listWatches(args.brandId);
  const has = new Set(existing.map((w) => `${w.scope}:${w.scopeId}`));
  const parse = (v: unknown) => { if (typeof v === "string") { try { return JSON.parse(v); } catch { return {}; } } return v ?? {}; };

  const targets: Array<{ scope: WatchScope; scopeId: number; name: string; industry?: string | null; positioning: any }> = [
    { scope: "brand", scopeId: Number(brand.id), name: String(brand.name ?? ""), industry: brand.industry, positioning: parse(brand.positioning) },
    ...(pRows as any[]).map((p) => ({ scope: "product" as WatchScope, scopeId: Number(p.id), name: String(p.name ?? ""), industry: brand.industry, positioning: parse(p.positioning) })),
  ];
  let created = 0;
  for (const t of targets) {
    if (has.has(`${t.scope}:${t.scopeId}`)) continue;
    const d = deriveDefaultWatch(t);
    await localPool.execute(
      `INSERT IGNORE INTO strategy_watch (userId, brandId, scope, scopeId, keywords, competitors, enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [args.userId, args.brandId, t.scope, t.scopeId, JSON.stringify(d.keywords), JSON.stringify(d.competitors)],
    );
    created++;
  }
  return created ? listWatches(args.brandId) : existing;
}

export async function updateWatch(args: {
  userId: number; brandId: number; scope: WatchScope; scopeId: number;
  keywords: string[]; competitors: string[]; enabled: boolean;
}): Promise<void> {
  await localPool.execute(
    `UPDATE strategy_watch SET keywords = ?, competitors = ?, enabled = ?
      WHERE brandId = ? AND userId = ? AND scope = ? AND scopeId = ?`,
    [JSON.stringify(uniq(args.keywords).slice(0, 12)), JSON.stringify(uniq(args.competitors).slice(0, 12)),
     args.enabled ? 1 : 0, args.brandId, args.userId, args.scope, args.scopeId],
  );
}

export async function listAlerts(brandId: number, days = 60): Promise<StrategyAlert[]> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM strategy_alerts
      WHERE brandId = ? AND status <> 'dismissed' AND createdAt > NOW() - INTERVAL ? DAY
      ORDER BY createdAt DESC LIMIT 50`,
    [brandId, days],
  );
  return (rows as any[]).map(rowToAlert);
}

export async function setAlertStatus(args: { userId: number; id: number; status: AlertStatus }): Promise<void> {
  await localPool.execute(
    `UPDATE strategy_alerts SET status = ? WHERE id = ? AND userId = ?`,
    [args.status, args.id, args.userId],
  );
}

// ─── 掃描 ─────────────────────────────────────────────────────────────────

async function loadAnchors(watch: StrategyWatch): Promise<{ name: string; industry: string; audience: string; differentiation: string; tagline: string; scopeName: string }> {
  const [bRows]: any = await localPool.execute(
    `SELECT name, industry, positioning FROM brands WHERE id = ? LIMIT 1`, [watch.brandId],
  );
  const b = (bRows as any[])[0] ?? {};
  const pos = typeof b.positioning === "string" ? (() => { try { return JSON.parse(b.positioning); } catch { return {}; } })() : (b.positioning ?? {});
  let scopeName = String(b.name ?? "");
  if (watch.scope === "product") {
    const [pRows]: any = await localPool.execute(`SELECT name FROM products WHERE id = ? LIMIT 1`, [watch.scopeId]);
    scopeName = String((pRows as any[])[0]?.name ?? scopeName);
  }
  const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  return {
    name: String(b.name ?? ""),
    industry: String(b.industry ?? ""),
    audience: s(pos?.audience?.primary, 300),
    differentiation: s(typeof pos?.differentiation === "string" ? pos.differentiation : pos?.differentiation?.summary, 300),
    tagline: s(pos?.tagline?.zhTagline ?? pos?.tagline, 80),
    scopeName,
  };
}

function digestPrompt(a: Awaited<ReturnType<typeof loadAnchors>>, watch: StrategyWatch, items: IntelItem[]): string {
  const list = items.map((it, i) =>
    `[${i}] ${it.title}\n    來源：${it.source}${it.publishedAt ? `　日期：${it.publishedAt}` : ""}${it.url ? `　${it.url}` : ""}\n    ${String(it.content ?? "").slice(0, 400)}`,
  ).join("\n");
  return [
    `你是品牌的策略顧問。下面是品牌的三個錨點，以及近兩週掃到的市場情報。`,
    `你的工作：判斷有沒有「重要到該回策略工作台調整錨點」的變化。沒有就回空陣列，這很常見，不要硬找。`,
    ``,
    `【品牌】${a.name}${a.industry ? `（${a.industry}）` : ""}${watch.scope === "product" ? `　【監測對象：產品】${a.scopeName}` : ""}`,
    `【受眾錨點】${a.audience || "（未填）"}`,
    `【差異化錨點】${a.differentiation || "（未填）"}`,
    `【標語錨點】${a.tagline || "（未填）"}`,
    `【監測的競爭者】${watch.competitors.join("、") || "（無）"}`,
    `【監測關鍵字】${watch.keywords.join("、") || "（無）"}`,
    ``,
    `【情報】`,
    list,
    ``,
    `規則：`,
    `1. 每則提醒必須指回至少一則情報的編號（evidence），不能只憑推測。`,
    `2. kind 只能是 competitor_move（競爭者動作）、audience_shift（受眾變化）、market_trend（市場趨勢）。`,
    `3. anchor 只能是 audience、competition、differentiation、tagline、none —— 指出該回工作台看哪一格。`,
    `4. 最多 3 則，只留真的重要的。summary 講「發生了什麼、為什麼跟這個品牌有關」，suggestion 是一句具體建議。`,
    `5. 全部繁體中文（台灣用語）。只輸出 JSON，不要前言。`,
    ``,
    `輸出格式：{"alerts":[{"kind":"competitor_move","anchor":"differentiation","title":"…","summary":"…","suggestion":"…","evidence":[0,2]}]}`,
  ].join("\n");
}

export interface ScanResult {
  ok: boolean;
  note: string;
  items: number;
  created: number;
}

/**
 * 掃一份 watch。任何失敗都回 ok:false 並把原因寫進 note，而且會更新 lastScanAt
 * —— 否則一份壞掉的 watch 會被 worker 每 15 分鐘重挑一次。
 */
export async function runStrategyScan(watch: StrategyWatch, opts?: { now?: Date }): Promise<ScanResult> {
  const finish = async (r: ScanResult): Promise<ScanResult> => {
    try {
      await localPool.execute(
        `UPDATE strategy_watch SET lastScanAt = ?, lastScanNote = ?, lastScanItems = ? WHERE id = ?`,
        [opts?.now ?? new Date(), r.note.slice(0, 255), r.items, watch.id],
      );
    } catch (e) { console.warn("[strategyMonitor] finish update failed", (e as Error).message); }
    return r;
  };

  if (!(await perplexityScout.isAvailable?.({} as ScoutContext))) {
    return finish({ ok: false, note: "no_scout：尚未設定 Web 市調的 API key", items: 0, created: 0 });
  }
  const anchors = await loadAnchors(watch);
  const ctx: ScoutContext = {
    brandId: watch.brandId,
    brandName: anchors.name,
    industry: anchors.industry || undefined,
    keywords: uniq([anchors.scopeName, ...watch.keywords]),
    competitors: watch.competitors,
    industryTags: anchors.industry ? [anchors.industry] : [],
    days: 14,
    limit: 8,
    loadCred: async () => null,
  };
  let items: IntelItem[] = [];
  try { items = await perplexityScout.fetch(ctx); }
  catch (e) { return finish({ ok: false, note: `scout_error：${String((e as Error)?.message ?? e).slice(0, 200)}`, items: 0, created: 0 }); }
  if (!items.length) return finish({ ok: true, note: "no_items：這兩週沒掃到相關情報", items: 0, created: 0 });

  let raw = "";
  try {
    const r = await invokeLLM({
      messages: [{ role: "user", content: digestPrompt(anchors, watch, items) }],
      maxTokens: 1400,
    });
    raw = String((r as any)?.choices?.[0]?.message?.content ?? "");
  } catch (e) {
    return finish({ ok: false, note: `llm_error：${String((e as Error)?.message ?? e).slice(0, 200)}`, items: items.length, created: 0 });
  }
  const parsed = parseAlertsJson(raw, items.length);

  let created = 0;
  for (const a of parsed) {
    const key = alertKeyOf(a.kind, a.title);
    const [dup]: any = await localPool.execute(
      `SELECT id FROM strategy_alerts WHERE scope = ? AND scopeId = ? AND alertKey = ? AND createdAt > NOW() - INTERVAL ? DAY LIMIT 1`,
      [watch.scope, watch.scopeId, key, DEDUPE_DAYS],
    );
    if ((dup as any[]).length) continue;
    const evidence = a.evidence.map((i) => {
      const it = items[i]!;
      return { title: it.title, url: it.url, source: it.source, publishedAt: it.publishedAt };
    });
    await localPool.execute(
      `INSERT INTO strategy_alerts (userId, brandId, scope, scopeId, kind, anchor, alertKey, title, summary, suggestion, evidence, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
      [watch.userId, watch.brandId, watch.scope, watch.scopeId, a.kind, a.anchor, key, a.title, a.summary, a.suggestion, JSON.stringify(evidence)],
    );
    created++;
  }
  return finish({ ok: true, note: created ? `ok：${items.length} 則情報，${created} 則提醒` : `ok：${items.length} 則情報，沒有需要調整的變化`, items: items.length, created });
}

/**
 * worker 的一拍：挑一份到期、開著、而且擁有者方案有策略監測的 watch 來掃。
 * 一次只掃一份 —— scout 與 LLM 都是真金白銀，寧可慢。
 */
export async function tickStrategyMonitor(): Promise<{ scanned: number }> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM strategy_watch
      WHERE enabled = 1 AND (lastScanAt IS NULL OR lastScanAt < NOW() - INTERVAL ? DAY)
      ORDER BY lastScanAt IS NULL DESC, lastScanAt ASC LIMIT 5`,
    [SCAN_INTERVAL_DAYS],
  );
  for (const r of rows as any[]) {
    const w = rowToWatch(r);
    let allowed = false;
    try { allowed = (await planQuotaFor(w.userId)).strategyMonitoring; } catch { allowed = false; }
    if (!allowed) {
      // 方案沒有：不掃，但把 lastScanAt 推到現在，免得每拍都重挑到它。
      await localPool.execute(`UPDATE strategy_watch SET lastScanAt = NOW(3), lastScanNote = ? WHERE id = ?`, ["plan：方案沒有策略監測", w.id]);
      continue;
    }
    const r2 = await runStrategyScan(w);
    console.log(`[strategyMonitor] ${w.scope}#${w.scopeId} brand#${w.brandId}: ${r2.note}`);
    return { scanned: 1 };
  }
  return { scanned: 0 };
}
