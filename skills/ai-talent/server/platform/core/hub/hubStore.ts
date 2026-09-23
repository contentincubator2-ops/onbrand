/**
 * Sales Hub — data access. Raw SQL through localPool, like the rest of the app.
 */

import { createHash, randomBytes } from "node:crypto";

async function pool() {
  const { default: localPool } = await import("../../../localDb");
  return localPool;
}

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const p = await pool();
  const [rows]: any = await p.execute(sql, params);
  return rows as T[];
}

export async function exec(sql: string, params: any[] = []): Promise<{ insertId: number; affectedRows: number }> {
  const p = await pool();
  const [res]: any = await p.execute(sql, params);
  return { insertId: Number(res.insertId ?? 0), affectedRows: Number(res.affectedRows ?? 0) };
}

/**
 * mysql2 hands DATE columns back as local-midnight Date objects, so
 * String(d).slice(0, 10) gives "Tue Sep 15" and toISOString() can shift the
 * day in UTC+8. Format from local parts instead.
 */
export function ymd(v: unknown): string {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}

const json = <T>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return v as T;
};

// ── org ─────────────────────────────────────────────────────────────────────

export interface HubOrg {
  id: number;
  slug: string;
  name: string;
  disclaimer: string;
  positioning: any;
  landingUrl: string | null;
}

export async function getOrg(slug = "experthub"): Promise<HubOrg> {
  const [row] = await q(`SELECT * FROM hub_org WHERE slug = ? LIMIT 1`, [slug]);
  if (!row) throw new Error(`hub org '${slug}' not seeded — run scripts/hub-seed.ts`);
  return {
    id: row.id, slug: row.slug, name: row.name, disclaimer: row.disclaimer,
    positioning: json(row.positioning, {}), landingUrl: row.landing_url,
  };
}

// ── reps ────────────────────────────────────────────────────────────────────

export interface HubRep {
  id: number;
  orgId: number;
  market: "TW" | "US";
  name: string;
  title: string;
  team: string;
  avatarSeed: string;
  lineUserId: string | null;
  bindCode: string | null;
  consentAt: string | null;
  linkedinStatus: string;
  instagramStatus: string;
  facebookStatus: string;
  networkSize: number;
  isDemo: boolean;
}

const toRep = (r: any): HubRep => ({
  id: r.id, orgId: r.org_id, market: r.market, name: r.name, title: r.title, team: r.team,
  avatarSeed: r.avatar_seed, lineUserId: r.line_user_id, bindCode: r.bind_code,
  consentAt: r.consent_at, linkedinStatus: r.linkedin_status, instagramStatus: r.instagram_status,
  facebookStatus: r.facebook_status, networkSize: r.network_size, isDemo: Boolean(r.is_demo),
});

export async function listReps(orgId: number): Promise<HubRep[]> {
  return (await q(`SELECT * FROM hub_reps WHERE org_id = ? ORDER BY market DESC, id`, [orgId])).map(toRep);
}

export async function getRep(repId: number): Promise<HubRep | null> {
  const [row] = await q(`SELECT * FROM hub_reps WHERE id = ? LIMIT 1`, [repId]);
  return row ? toRep(row) : null;
}

export async function getRepByLineUser(lineUserId: string): Promise<HubRep | null> {
  const [row] = await q(`SELECT * FROM hub_reps WHERE line_user_id = ? LIMIT 1`, [lineUserId]);
  return row ? toRep(row) : null;
}

/** Binds a LINE account to the rep holding this one-time code. */
export async function bindLineUser(code: string, lineUserId: string): Promise<HubRep | null> {
  const [row] = await q(`SELECT * FROM hub_reps WHERE bind_code = ? LIMIT 1`, [code.trim().toUpperCase()]);
  if (!row) return null;
  await exec(`UPDATE hub_reps SET line_user_id = NULL WHERE line_user_id = ?`, [lineUserId]);
  await exec(`UPDATE hub_reps SET line_user_id = ?, bind_code = NULL, consent_at = COALESCE(consent_at, NOW(3)) WHERE id = ?`, [lineUserId, row.id]);
  return getRep(row.id);
}

export async function issueBindCode(repId: number): Promise<string> {
  const code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
  await exec(`UPDATE hub_reps SET bind_code = ? WHERE id = ?`, [code, repId]);
  return code;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Per-rep bearer token for the MCP endpoint (Hermes profile credential). */
export async function issueMcpToken(repId: number): Promise<string> {
  const token = `hub_${randomBytes(24).toString("base64url")}`;
  await exec(`UPDATE hub_reps SET mcp_token_hash = ? WHERE id = ?`, [hashToken(token), repId]);
  return token;
}

export async function getRepByMcpToken(token: string): Promise<HubRep | null> {
  const [row] = await q(`SELECT * FROM hub_reps WHERE mcp_token_hash = ? LIMIT 1`, [hashToken(token)]);
  return row ? toRep(row) : null;
}

// ── catalog ─────────────────────────────────────────────────────────────────

export interface HubPrice {
  id: number;
  planEn: string;
  planZh: string;
  amount: number | null;
  currency: string;
  billing: "month" | "year" | "one_time" | "quote";
  startsFrom: boolean;
  effectiveFrom: string;
  sourceUrl: string | null;
}

export interface HubSolution {
  id: number;
  slug: string;
  nameEn: string;
  nameZh: string;
  vendor: string;
  category: string;
  industries: string[];
  summaryEn: string;
  summaryZh: string;
  features: Array<{ en: string; zh: string }>;
  audienceEn: string | null;
  audienceZh: string | null;
  sourceUrl: string | null;
  featured: boolean;
  isAsus: boolean;
  profile: Record<string, { en: string; zh: string; source?: string }>;
  pending: Record<string, string> | null;
  pendingBy: string | null;
  pendingAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  prices: HubPrice[];
}

export async function listSolutions(orgId: number): Promise<HubSolution[]> {
  const sols = await q(`SELECT * FROM hub_solutions WHERE org_id = ? ORDER BY featured DESC, is_asus DESC, id`, [orgId]);
  if (!sols.length) return [];
  const prices = await q(
    `SELECT * FROM hub_prices
      WHERE solution_id IN (${sols.map(() => "?").join(",")})
        AND effective_from <= CURDATE() AND (effective_to IS NULL OR effective_to >= CURDATE())
      ORDER BY id`,
    sols.map((s) => s.id),
  );
  return sols.map((s) => ({
    id: s.id, slug: s.slug, nameEn: s.name_en, nameZh: s.name_zh, vendor: s.vendor,
    category: s.category, industries: json(s.industries, []), summaryEn: s.summary_en,
    summaryZh: s.summary_zh, features: json(s.features, []), audienceEn: s.audience_en,
    audienceZh: s.audience_zh, sourceUrl: s.source_url, featured: Boolean(s.featured),
    isAsus: Boolean(s.is_asus),
    // 2026-09-23 (CJ 編輯／核准): 待審提案不套用到正式欄位，只帶給後台看。
    // 業務與 AI 讀到的永遠是已核准的版本 —— 那正是核准這件事的意義。
    profile: json(s.profile, {}) as Record<string, { en: string; zh: string; source?: string }>,
    pending: json(s.pending, null) as Record<string, string> | null,
    pendingBy: s.pending_by ?? null,
    pendingAt: s.pending_at ? new Date(s.pending_at).toISOString() : null,
    updatedBy: s.updated_by ?? null,
    updatedAt: s.updated_at ? new Date(s.updated_at).toISOString() : null,
    prices: prices.filter((p) => p.solution_id === s.id).map((p) => ({
      id: p.id, planEn: p.plan_en, planZh: p.plan_zh, amount: p.amount, currency: p.currency,
      billing: p.billing, startsFrom: Boolean(p.starts_from),
      effectiveFrom: ymd(p.effective_from), sourceUrl: p.source_url,
    })),
  }));
}

export function formatPrice(p: HubPrice, lang: "zh-TW" | "en-US"): string {
  if (p.amount == null || p.billing === "quote") return lang === "zh-TW" ? `${p.planZh}：客製化報價` : `${p.planEn}: custom quote`;
  const amt = `NT$${p.amount.toLocaleString("en-US")}`;
  const per = {
    month: lang === "zh-TW" ? "/月" : "/month",
    year: lang === "zh-TW" ? "/年" : "/year",
    one_time: lang === "zh-TW" ? "（一次性）" : " one-time",
    quote: "",
  }[p.billing];
  const from = p.startsFrom ? (lang === "zh-TW" ? " 起" : " (starting at)") : "";
  return lang === "zh-TW" ? `${p.planZh}：${amt}${per}${from}` : `${p.planEn}: ${amt}${per}${from}`;
}

// ── facts & skills ──────────────────────────────────────────────────────────

export interface HubFact {
  id: number;
  kind: string;
  market: string;
  statementEn: string;
  statementZh: string;
  figures: { percents?: Array<{ value: number; anchors: string[] }>; amounts?: number[] };
  sourceName: string;
  sourceUrl: string;
  publishedOn: string | null;
  confidence: "official" | "secondary" | "needs_verification";
}

export async function listFacts(orgId: number): Promise<HubFact[]> {
  return (await q(`SELECT * FROM hub_facts WHERE org_id = ? ORDER BY FIELD(kind,'market','subsidy','platform','competitor','regulation'), id`, [orgId])).map((f) => ({
    id: f.id, kind: f.kind, market: f.market, statementEn: f.statement_en, statementZh: f.statement_zh,
    figures: json(f.figures, {}), sourceName: f.source_name, sourceUrl: f.source_url,
    publishedOn: f.published_on ? ymd(f.published_on) : null, confidence: f.confidence,
  }));
}

export interface HubSkill {
  id: number;
  slug: string;
  nameEn: string;
  nameZh: string;
  channels: string[];
  markets: string[];
  skillMd: string;
  status: "approved" | "draft";
  version: number;
  approvedBy: string | null;
  approvedAt: string | null;
}

export async function listSkills(orgId: number): Promise<HubSkill[]> {
  return (await q(`SELECT * FROM hub_skills WHERE org_id = ? ORDER BY status = 'approved' DESC, id`, [orgId])).map((s) => ({
    id: s.id, slug: s.slug, nameEn: s.name_en, nameZh: s.name_zh, channels: json(s.channels, []),
    markets: json(s.markets, []), skillMd: s.skill_md, status: s.status, version: s.version,
    approvedBy: s.approved_by, approvedAt: s.approved_at,
  }));
}

// ── wording & regulations ───────────────────────────────────────────────────

export interface HubWording {
  id: number;
  market: "TW" | "US";
  kind: "preferred" | "swap" | "banned";
  term: string;
  replacement: string | null;
  note: string | null;
  addedBy: string | null;
  createdAt: string;
}

export async function listWording(orgId: number, market?: string): Promise<HubWording[]> {
  const rows = await q(
    `SELECT * FROM hub_wording WHERE org_id = ? ${market ? "AND market = ?" : ""} ORDER BY kind, created_at DESC`,
    market ? [orgId, market] : [orgId],
  );
  return rows.map((w) => ({
    id: w.id, market: w.market, kind: w.kind, term: w.term, replacement: w.replacement, note: w.note,
    addedBy: w.added_by, createdAt: w.created_at,
  }));
}

export interface HubRegulation {
  id: number;
  market: "TW" | "US";
  authority: string;
  /** 完整官方名稱。只在 modal 裡出現。 */
  title: string;
  /** 卡片標題：法規叫什麼，不含這次改了什麼。 */
  nameEn: string;
  nameZh: string;
  /** 卡片第二行：這次改了什麼，一句話。 */
  changeEn: string;
  changeZh: string;
  summary: string;
  summaryZh: string;
  impact: string;
  impactZh: string;
  rules: string[];
  status: "applied" | "review" | "monitoring";
  effectiveOn: string | null;
  publishedOn: string | null;
  sourceUrl: string;
}

export async function listRegulations(orgId: number): Promise<HubRegulation[]> {
  const rows = await q(
    `SELECT * FROM hub_regulations WHERE org_id = ? ORDER BY COALESCE(effective_on, published_on) DESC`,
    [orgId],
  );
  return rows.map((r) => ({
    id: r.id, market: r.market, authority: r.authority, title: r.title, summary: r.summary, impact: r.impact,
    // 2026-09-23：卡片用短名 + 一句話的變動摘要；完整標題與全文留給 modal。
    // 舊資料沒有這幾欄，所以一律退回舊欄位，不會變成空卡片。
    nameEn: r.name_en || r.title, nameZh: r.name_zh || r.title,
    changeEn: r.change_en || r.summary, changeZh: r.change_zh || r.summary_zh || r.summary,
    summaryZh: r.summary_zh || r.summary, impactZh: r.impact_zh || r.impact,
    rules: json(r.rules, []), status: r.status,
    effectiveOn: r.effective_on ? ymd(r.effective_on) : null,
    publishedOn: r.published_on ? ymd(r.published_on) : null,
    sourceUrl: r.source_url,
  }));
}

// ── links, clicks, events ───────────────────────────────────────────────────

export async function createLink(orgId: number, repId: number, channel: string | null): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomBytes(5).toString("base64url").replace(/[-_]/g, "").slice(0, 6).toLowerCase();
    if (code.length < 6) continue;
    try {
      await exec(`INSERT INTO hub_links (code, org_id, rep_id, channel) VALUES (?, ?, ?, ?)`, [code, orgId, repId, channel]);
      return code;
    } catch (e: any) {
      if (e?.code !== "ER_DUP_ENTRY") throw e;
    }
  }
  throw new Error("could not allocate a short link code");
}

export async function logEvent(orgId: number, repId: number | null, kind: string, detail: string | null, isDemo = false): Promise<void> {
  await exec(
    `INSERT INTO hub_events (org_id, rep_id, kind, detail, is_demo) VALUES (?, ?, ?, ?, ?)`,
    [orgId, repId, kind, detail ? detail.slice(0, 500) : null, isDemo ? 1 : 0],
  );
}

export function publicBaseUrl(): string {
  return (process.env.HUB_PUBLIC_BASE_URL || "https://experthub.onbrand.sowork.ai").replace(/\/$/, "");
}
