/**
 * campaignPerf — 成效層「活動」tray：活動企劃的目標 vs 真正發出去的貼文。
 *
 * 2026-09-30（CJ「如果用戶不是從這邊發文，或是他實際發文時間跟我們這邊有變動，那我們會
 * 怎麼呈現？或是，應該讓真實的成效，引導到成效層，建立一個活動 mission tray」）。
 *
 * ── 實際成效綁「真的發出去的那一篇」，不綁企劃上的日期 ───────────────────
 *   1. 確定：從 OnBrand 發的——企劃格 → outputId → scheduled_posts.externalPostId →
 *      perf_facts 的那則粉專貼文。晚兩天才發也照樣對得上。
 *   2. 待確認：活動期間（第一篇前 14 天到最後一篇後 7 天）內、還沒對上的粉專貼文，列出來
 *      並猜最像哪一格（內文跟切角的字重疊＋日期接近）；用戶一鍵配對、標成企劃外、或不是
 *      這檔。確認過的存在 events.positioning.campaignPerf。
 *   3. 粉專沒有的數字（名單、訂單、營收…）：匯入後台檔自動歸檔，沒有檔就手動填。
 *
 * ── 第 2 步：廣告／GA4／電商匯入怎麼知道是這檔活動 ───────────────────
 *   · UTM：企劃每一篇的連結帶 utm_campaign=ob-ev<id>、utm_content=cp.ev<id>~it.…~ph.…
 *     （perfUtm.campaignLink）。匯出檔的名稱欄或標籤欄帶著它 → 自動歸這檔；有 ph 就歸那一段。
 *   · 名稱對應：Meta 廣告匯出檔通常沒有網址參數，只有「行銷活動名稱」。用戶把名稱加進
 *     這檔的對應（aliases），名稱含那幾個字的列就算這檔。
 *   · 都沒有的列列在「還沒歸檔」，一鍵把名稱加進對應。別檔活動代碼的列不列。
 *   · 手動填的數字蓋過匯入的（用戶最後說了算）。
 *
 * ── 呈現 ────────────────────────────────────────────────────────────
 *   · 依「實際發文日」把貼文歸到各段（段的時間窗＝企劃各段的起點接到下一段起點前一天）。
 *   · 每一篇一個狀態：對上／時間變動 N 天／還沒發（日期已過）／還沒到；另外列企劃外。
 *
 * 計算全是純函式（buildCampaignPerf），DB 進出在最下面。
 */
import localPool from "../../localDb";
import { campaignCode } from "./perfUtm";

export type ItemStatus = "matched" | "moved" | "missing" | "upcoming";
export type MatchAction = "match" | "extra" | "dismiss" | "clear";

export interface PerfItem {
  id: string; phase: string; date: string; platform: string; angle: string; paid?: boolean;
  outputId?: number | null; enabled?: boolean;
}
export interface PerfFact {
  key: string;              // `${source}:${entityId}`
  source: string; entityId: string; date: string; text: string;
  permalink: string | null; metrics: Record<string, number>;
}
/** 廣告／GA4／電商匯入的一列（perf_facts，source ≠ fb_page）。 */
export interface ExtFact {
  source: string; date: string; label: string;
  tags: Record<string, string>; metrics: Record<string, number>;
}
export interface CampaignPerfStore {
  /** factKey → 企劃格 id，或 "extra"（企劃外但屬於這檔活動）。 */
  matches?: Record<string, string>;
  /** 不是這檔活動的貼文。 */
  dismissed?: string[];
  /** 手動填的數字：phase → metric → value。 */
  manual?: Record<string, Record<string, number>>;
  /** 匯入檔名稱對應：名稱含這些字的列算這檔（Meta 廣告行銷活動名稱等）。 */
  aliases?: string[];
  /** 活動導流網址；每一篇的追蹤連結由它加上 UTM。 */
  landingUrl?: string | null;
}

/** 匯入的一列是不是這檔活動：UTM 帶活動代碼 → "utm"；名稱含對應字 → "alias"；別檔的 → "other"。 */
export function campaignOf(f: { label: string; tags: Record<string, string> }, eventId: number, aliases: string[]): "utm" | "alias" | "other" | null {
  const code = campaignCode(eventId);
  const label = String(f.label ?? "").toLowerCase();
  const cp = f.tags?.cp;
  if (cp === `ev${eventId}` || new RegExp(`(^|[^a-z0-9])${code}($|[^0-9])`).test(label)) return "utm";
  if (cp && /^ev\d+$/.test(cp)) return "other";
  if (/(^|[^a-z0-9])ob-ev\d+/.test(label)) return "other";
  for (const a of aliases) {
    const t = a.trim().toLowerCase();
    if (t.length >= 2 && label.includes(t)) return "alias";
  }
  return null;
}

const DAY = 86_400_000;
const toDay = (s: string) => new Date(`${s}T00:00:00Z`).getTime();
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(toDay(s) + n * DAY);
const PHASE_ORDER = ["teaser", "launch", "sustain", "lastcall", "encore"];
/** 粉專同步有的指標；其他的只能手動填或靠匯入（第 2 步）。 */
export const PAGE_METRICS = ["reach", "impressions", "clicks", "engagement"];

/** 兩段文字的相似度：字元 bigram 的 Jaccard。中文不用斷詞也有意義。 */
export function textSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.replace(/\s+/g, "").slice(0, 300);
    const out = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  };
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/** 貼文 id 兩種寫法都認：pageid_postid 與只有 postid。 */
function samePost(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.split("_").pop() === b.split("_").pop();
}

export interface CampaignPerfReport {
  window: { from: string; to: string };
  phases: Array<{
    id: string; from: string; to: string;
    budget: number | null;
    targets: Array<{ metric: string; target: number | null }>;
    actual: Record<string, number>;
    /** 每個來源各自的數字（粉專／Meta 廣告／GA4…）。 */
    bySource: Record<string, Record<string, number>>;
    manual: Record<string, number>;
  }>;
  /** 歸進這檔的匯入資料，按來源加總。 */
  sources: Array<{ source: string; rows: number; utm: number; alias: number; metrics: Record<string, number> }>;
  /** 觀察期間內、還沒歸到任何活動的匯入列（按來源＋名稱合併）。 */
  unlinked: Array<{ source: string; label: string; rows: number; metrics: Record<string, number> }>;
  items: Array<PerfItem & { status: ItemStatus; via: "published" | "confirmed" | null; fact: PerfFact | null; diffDays: number | null }>;
  extras: PerfFact[];
  candidates: Array<PerfFact & { suggestItemId: string | null; score: number }>;
  counts: { planned: number; matched: number; moved: number; missing: number; upcoming: number; extras: number; pending: number };
}

export function buildCampaignPerf(args: {
  items: PerfItem[];
  kpiPhases?: Record<string, { budget: number | null; metrics: Array<{ metric: string; target: number | null }> }> | null;
  /** outputId → 發出去的貼文 id（scheduled_posts.externalPostId）。 */
  published: Record<number, string[]>;
  facts: PerfFact[];
  store: CampaignPerfStore;
  today: string;
  /** 第 2 步：匯入的廣告／GA4／電商資料。 */
  eventId?: number;
  external?: ExtFact[];
}): CampaignPerfReport {
  const items = args.items.filter((i) => i.enabled !== false).sort((a, b) => a.date.localeCompare(b.date));
  const matches = args.store.matches ?? {};
  const dismissed = new Set(args.store.dismissed ?? []);
  const firstDate = items[0]?.date ?? args.today;
  const lastDate = items[items.length - 1]?.date ?? args.today;
  const window = { from: addDays(firstDate, -14), to: addDays(lastDate, 7) };
  const inWindow = args.facts.filter((f) => f.date >= window.from && f.date <= window.to);

  // 各段的時間窗：這段第一篇 → 下一段第一篇前一天；頭尾接到整個觀察窗。
  const present = PHASE_ORDER.filter((p) => items.some((i) => i.phase === p));
  const starts = present.map((p) => items.find((i) => i.phase === p)!.date);
  const phaseWin = present.map((p, k) => ({
    id: p,
    from: k === 0 ? window.from : starts[k]!,
    to: k === present.length - 1 ? window.to : addDays(starts[k + 1]!, -1),
  }));
  const phaseOfDate = (d: string) => phaseWin.find((w) => d >= w.from && d <= w.to)?.id ?? null;

  // 1) 確定：OnBrand 發的。2) 用戶確認過的配對。
  const used = new Set<string>();
  const itemFact = new Map<string, { fact: PerfFact; via: "published" | "confirmed" }>();
  for (const it of items) {
    const ext = it.outputId ? args.published[it.outputId] ?? [] : [];
    const f = inWindow.find((x) => !used.has(x.key) && ext.some((e) => samePost(x.entityId, e)))
      ?? args.facts.find((x) => !used.has(x.key) && ext.some((e) => samePost(x.entityId, e)));
    if (f) { itemFact.set(it.id, { fact: f, via: "published" }); used.add(f.key); }
  }
  for (const [key, target] of Object.entries(matches)) {
    if (used.has(key) || target === "extra") continue;
    const f = args.facts.find((x) => x.key === key);
    if (f && items.some((i) => i.id === target) && !itemFact.has(target)) { itemFact.set(target, { fact: f, via: "confirmed" }); used.add(key); }
  }
  const extras = Object.entries(matches)
    .filter(([key, t]) => t === "extra" && !used.has(key))
    .map(([key]) => args.facts.find((x) => x.key === key))
    .filter((f): f is PerfFact => !!f);
  for (const f of extras) used.add(f.key);

  const outItems = items.map((it) => {
    const m = itemFact.get(it.id);
    if (m) {
      const diff = Math.round((toDay(m.fact.date) - toDay(it.date)) / DAY);
      return { ...it, status: (diff === 0 ? "matched" : "moved") as ItemStatus, via: m.via, fact: m.fact, diffDays: diff };
    }
    return { ...it, status: (it.date < args.today ? "missing" : "upcoming") as ItemStatus, via: null, fact: null, diffDays: null };
  });

  // 3) 待確認：窗內、還沒對上、沒被排除的貼文；猜最像的那一格（只猜還沒對上的）。
  const open = outItems.filter((i) => !i.fact);
  const candidates = inWindow
    .filter((f) => !used.has(f.key) && !dismissed.has(f.key))
    .map((f) => {
      let best: { id: string; score: number } | null = null;
      for (const it of open) {
        const near = Math.abs(toDay(f.date) - toDay(it.date)) / DAY;
        const score = textSimilarity(f.text, it.angle) + (near <= 3 ? 0.08 : near <= 7 ? 0.04 : 0);
        if (!best || score > best.score) best = { id: it.id, score };
      }
      return { ...f, suggestItemId: best && best.score >= 0.1 ? best.id : null, score: best ? Math.round(best.score * 100) / 100 : 0 };
    })
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));

  // 匯入資料：歸這檔的（UTM／名稱對應）→ 有 ph 標籤照標籤歸段，沒有照日期；其餘列成「還沒歸檔」。
  const aliases = args.store.aliases ?? [];
  const phaseIds = new Set(phaseWin.map((w) => w.id));
  const linked: Array<ExtFact & { phase: string | null }> = [];
  const srcAgg = new Map<string, { source: string; rows: number; utm: number; alias: number; metrics: Record<string, number> }>();
  const unl = new Map<string, { source: string; label: string; rows: number; metrics: Record<string, number> }>();
  const addTo = (into: Record<string, number>, m: Record<string, number>) => {
    for (const [k, v] of Object.entries(m)) if (typeof v === "number" && Number.isFinite(v)) into[k] = (into[k] ?? 0) + v;
  };
  for (const f of args.external ?? []) {
    if (f.date < window.from || f.date > window.to) continue;
    const how = args.eventId ? campaignOf(f, args.eventId, aliases) : null;
    if (how === "other") continue;
    if (!how) {
      const k = `${f.source}|${f.label}`;
      const u = unl.get(k) ?? { source: f.source, label: f.label, rows: 0, metrics: {} };
      u.rows++; addTo(u.metrics, f.metrics); unl.set(k, u);
      continue;
    }
    const ph = f.tags?.ph && phaseIds.has(f.tags.ph) ? f.tags.ph : phaseOfDate(f.date);
    linked.push({ ...f, phase: ph });
    const s = srcAgg.get(f.source) ?? { source: f.source, rows: 0, utm: 0, alias: 0, metrics: {} };
    s.rows++; s[how]++; addTo(s.metrics, f.metrics); srcAgg.set(f.source, s);
  }
  const weight = (m: Record<string, number>) => (m.revenue ?? 0) + (m.spend ?? 0) * 2 + (m.orders ?? 0) * 500 + (m.clicks ?? 0) + (m.sessions ?? 0);

  // 各段的實際數字：對上的＋企劃外的貼文照「實際發文日」歸段，加上歸這檔的匯入資料。
  const counted = [...outItems.filter((i) => i.fact).map((i) => i.fact!), ...extras];
  const phases = phaseWin.map((w) => {
    const bySource: Record<string, Record<string, number>> = {};
    for (const f of counted) {
      if (phaseOfDate(f.date) !== w.id) continue;
      const row = (bySource[f.source] ??= {});
      for (const m of PAGE_METRICS) if (typeof f.metrics[m] === "number") row[m] = (row[m] ?? 0) + f.metrics[m]!;
    }
    for (const f of linked) if (f.phase === w.id) addTo((bySource[f.source] ??= {}), f.metrics);
    const actual: Record<string, number> = {};
    for (const row of Object.values(bySource)) addTo(actual, row);
    const manual = args.store.manual?.[w.id] ?? {};
    const k = args.kpiPhases?.[w.id];
    return { id: w.id, from: w.from, to: w.to, budget: k?.budget ?? null, targets: k?.metrics ?? [], actual, bySource, manual };
  });

  const count = (s: ItemStatus) => outItems.filter((i) => i.status === s).length;
  return {
    window, phases, items: outItems, extras, candidates,
    sources: [...srcAgg.values()].sort((a, b) => b.rows - a.rows),
    unlinked: [...unl.values()].sort((a, b) => weight(b.metrics) - weight(a.metrics) || b.rows - a.rows).slice(0, 30),
    counts: {
      planned: outItems.length, matched: count("matched"), moved: count("moved"),
      missing: count("missing"), upcoming: count("upcoming"), extras: extras.length, pending: candidates.length,
    },
  };
}

/** 加／拿掉一個名稱對應 → 新的 store。純函式。最多 20 個、每個 2–80 字。 */
export function applyAlias(store: CampaignPerfStore, alias: string, op: "add" | "remove"): CampaignPerfStore {
  const t = alias.trim().slice(0, 80);
  const list = (store.aliases ?? []).filter((a) => a.toLowerCase() !== t.toLowerCase());
  if (op === "add" && t.length >= 2) list.push(t);
  return { ...store, aliases: list.slice(-20) };
}

/** 套用一個配對動作 → 新的 store。純函式。 */
export function applyMatch(store: CampaignPerfStore, key: string, action: MatchAction, itemId?: string | null): CampaignPerfStore {
  const matches = { ...(store.matches ?? {}) };
  const dismissed = new Set(store.dismissed ?? []);
  delete matches[key];
  dismissed.delete(key);
  if (action === "match" && itemId) {
    for (const [k, v] of Object.entries(matches)) if (v === itemId) delete matches[k];   // 一格只配一則
    matches[key] = itemId;
  } else if (action === "extra") matches[key] = "extra";
  else if (action === "dismiss") dismissed.add(key);
  return { ...store, matches, dismissed: [...dismissed] };
}

// ─── DB ────────────────────────────────────────────────────────────────

function parse(raw: any): any {
  if (!raw) return {};
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

export async function loadCampaignEvent(eventId: number, userId: number): Promise<{ id: number; name: string; brandId: number; startAt: string | null; endAt: string | null; pos: any } | null> {
  const [rows]: any = await localPool.execute(
    `SELECT id, name, brandId, startAt, endAt, positioning FROM events WHERE id = ? AND userId = ? LIMIT 1`, [eventId, userId],
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  const d = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : null);
  return { id: Number(r.id), name: String(r.name), brandId: Number(r.brandId), startAt: d(r.startAt), endAt: d(r.endAt), pos: parse(r.positioning) };
}

export async function saveCampaignPerf(eventId: number, userId: number, store: CampaignPerfStore): Promise<void> {
  const ev = await loadCampaignEvent(eventId, userId);
  if (!ev) throw new Error("找不到這個活動");
  const pos = ev.pos ?? {};
  pos.campaignPerf = store;
  await localPool.execute(`UPDATE events SET positioning = ? WHERE id = ? AND userId = ?`, [JSON.stringify(pos), eventId, userId]);
}

/** outputId → 發出去的貼文 id。 */
export async function publishedPosts(brandId: number, outputIds: number[]): Promise<Record<number, string[]>> {
  const ids = [...new Set(outputIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return {};
  try {
    const [rows]: any = await localPool.execute(
      `SELECT outputId, externalPostId FROM scheduled_posts
        WHERE brandId = ? AND externalPostId IS NOT NULL AND outputId IN (${ids.map(() => "?").join(",")})`,
      [brandId, ...ids],
    );
    const out: Record<number, string[]> = {};
    for (const r of rows as any[]) (out[Number(r.outputId)] ??= []).push(String(r.externalPostId));
    return out;
  } catch {
    return {};
  }
}

/** 品牌有活動企劃的活動（定稿的排前面）。 */
export async function listCampaigns(brandId: number, userId: number): Promise<Array<{ id: number; name: string; startAt: string | null; endAt: string | null; locked: boolean; posts: number }>> {
  const [rows]: any = await localPool.execute(
    `SELECT id, name, startAt, endAt, positioning FROM events WHERE brandId = ? AND userId = ? ORDER BY COALESCE(startAt, createdAt) DESC LIMIT 50`,
    [brandId, userId],
  );
  const d = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : null);
  return (rows as any[]).flatMap((r) => {
    const plan = parse(r.positioning)?.campaignPlan;
    if (!plan?.items?.length) return [];
    return [{ id: Number(r.id), name: String(r.name), startAt: d(r.startAt), endAt: d(r.endAt), locked: !!plan.lockedAt, posts: plan.items.filter((i: any) => i?.enabled !== false).length }];
  }).sort((a, b) => Number(b.locked) - Number(a.locked));
}
