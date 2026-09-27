/**
 * strategyMeetings — 策略會議：用戶自己設定主題、與會的策略總監、多久開一次；
 * 時間到了由總監們在背景開會，留下一份會議紀錄，重點是「策略要不要調整」。
 *
 * 2026-09-26（CJ「會議的主題、與會人員由用戶去設定，還有每多久開一次會，
 * 然後會有定期的會議記錄，回去看策略上有沒有調整的」；「會議頁要先有一個
 * 範例，讓用戶看得懂要怎麼做」）。
 *
 * ── 兩張表 ────────────────────────────────────────────────────────────
 *
 *   strategy_meetings      會議設定：主題、範圍（品牌／某產品）、與會者、頻率、下次開會時間
 *   strategy_meeting_runs  每開一次會一列：逐字發言、會議紀錄（摘要／策略檢查／行動項目）、用戶的決定
 *
 * ── 一場會怎麼開 ──────────────────────────────────────────────────────
 *
 *   1. 讀品牌大腦（gatherBrandContext，跟總監對話同一份）、近 30 天的策略監測
 *      提醒（當作證據，編號 E1…）、上一場的結論。
 *   2. 與會者依序發言，每位都看得到前面的人講了什麼（真的在「討論」，不是各寫各的）。
 *   3. 最後一次呼叫把討論收成 JSON 紀錄：對「目前策略」逐項判定維持／建議調整。
 *
 * ── 刻意的界線 ────────────────────────────────────────────────────────
 *
 * 1. **「目前策略」是伺服器讀出來的，不是模型說的。** 要檢查的錨點與它現在
 *    的內容由 loadAnchors() 從定位 JSON 取，模型只能對這張清單下判定，
 *    清單外的 id 一律丟掉。
 * 2. **建議調整要說依據。** 引用了監測證據就標 E 編號；沒有就標「會中討論」，
 *    前台照實顯示——不假裝每一條建議都有市場數據撐腰。
 * 3. **不自動改定位。** 用戶「採用」只是留下決定，實際修改在定位頁做
 *    （跟策略監測「提醒指向錨點，不代替決定」同一條紀律）。
 * 4. **失敗也留一列。** LLM 壞掉就把那場記成 failed、寫原因，並照常排下一次，
 *    否則壞掉的會議每 15 分鐘會被 worker 重挑一次。
 */
import localPool from "../../localDb";
import { callModel } from "../../platform/core/multiModelRouter";
import { loadAgentKnowledge } from "../../platform/core/agentKnowledge";
import { planQuotaFor } from "../../platform/core/planGate";
import { getDirectorByAgentId, getRole } from "./strategistDirectory";
import { buildMeetingSources, sourcesBlock, verifyQuote, type MeetingSource } from "./meetingSources";

export const STRATEGY_MEETINGS_DDL = `
  CREATE TABLE IF NOT EXISTS strategy_meetings (
    id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId        INT          NOT NULL,
    brandId       INT          NOT NULL,
    scope         VARCHAR(16)  NOT NULL DEFAULT 'brand',
    scopeId       INT          NOT NULL,
    topic         VARCHAR(120) NOT NULL,
    agenda        TEXT         NULL,
    attendees     JSON         NULL,
    frequency     VARCHAR(16)  NOT NULL DEFAULT 'monthly',
    dayOfWeek     TINYINT      NULL,
    dayOfMonth    TINYINT      NULL,
    enabled       TINYINT(1)   NOT NULL DEFAULT 1,
    nextRunAt     DATETIME(3)  NULL,
    lastRunAt     DATETIME(3)  NULL,
    createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_strategy_meetings_brand (brandId),
    KEY idx_strategy_meetings_due (enabled, nextRunAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const STRATEGY_MEETING_RUNS_DDL = `
  CREATE TABLE IF NOT EXISTS strategy_meeting_runs (
    id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    meetingId     INT          NOT NULL,
    userId        INT          NOT NULL,
    brandId       INT          NOT NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'running',
    note          VARCHAR(255) NULL,
    transcript    JSON         NULL,
    minutes       JSON         NULL,
    evidence      JSON         NULL,
    decisions     JSON         NULL,
    trigger_kind  VARCHAR(16)  NOT NULL DEFAULT 'schedule',
    createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_meeting_runs_meeting (meetingId, createdAt),
    KEY idx_meeting_runs_brand (brandId, createdAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export type MeetingScope = "brand" | "product";
export type MeetingFrequency = "weekly" | "biweekly" | "monthly" | "quarterly";
export const MEETING_FREQUENCIES: readonly MeetingFrequency[] = ["weekly", "biweekly", "monthly", "quarterly"] as const;

/** 與會上限：超過這個數字，成本與會議紀錄的長度都會失控。 */
export const MAX_ATTENDEES = 4;
/** 一場會最多提出幾條「建議調整」——超過就變成閱讀負擔。 */
export const MAX_ADJUSTMENTS = 3;
/** 手動「現在開一次」的冷卻（小時）。 */
export const MANUAL_RUN_COOLDOWN_HOURS = 6;
/** 會議固定在台北時間早上 9 點開（UTC+8，無日光節約）。 */
const RUN_HOUR_TAIPEI = 9;

export interface MeetingAttendee { agentId: number; name: string; title: string }

export interface StrategyMeeting {
  id: number;
  brandId: number;
  scope: MeetingScope;
  scopeId: number;
  topic: string;
  agenda: string;
  attendees: MeetingAttendee[];
  frequency: MeetingFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export interface Anchor { id: string; label: string; current: string }

export type Verdict = "keep" | "adjust";
export interface StrategyCheck {
  anchorId: string;
  label: string;
  current: string;
  verdict: Verdict;
  proposal: string;
  reason: string;
  /** 引用的監測證據編號（E1 → 0）。 */
  evidence: number[];
  /**
   * 引用的品牌資料來源（S 編號，對到 minutes.sources）＋逐字原文（驗證過是來源的子字串，
   * 否則 null）。evidence 與 cites 都空 = 依據只有會中討論。
   */
  cites: Cite[];
  raisedBy: string;
}
export interface Cite { code: string; quote: string | null }
export interface MeetingAction {
  title: string; owner: string; kind: "content" | "work"; cites: Cite[];
  /**
   * 內容類行動對應的任務卡（目錄裡真的存在的 id）。有值時前台「開任務」直接打開這張卡、
   * 題目帶好（2026-09-26 CJ「按下開任務直接到 facebook 頁面就困惑了，開任務的時候
   * 可以直接跳出對應的任務卡」）。挑不到就留空，前台誠實說「沒有對應的任務卡」。
   */
  taskId?: string; taskLabel?: string; platform?: string;
}

/** 可以給會議行動挑的通路：整篇可以發的內容通路。 */
const CONTENT_CHANNELS = ["facebook", "instagram", "linkedin", "youtube", "tiktok", "x", "email", "pr", "website"];
const PLATFORM_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok",
  x: "X", email: "電子報", pr: "新聞稿", website: "官網",
};

/** 模型挑的卡 → 只收目錄裡真的有的 id（跟 campaignPlan.reconcileItems 同一條紀律）。 */
export function applyTaskPicks(actions: MeetingAction[], raw: unknown, cards: Array<{ id: string; platform: string; labelZh: string }>): MeetingAction[] {
  const picks = Array.isArray((raw as any)?.picks) ? (raw as any).picks as any[] : [];
  return actions.map((a, i) => {
    if (a.kind !== "content") return a;
    const pick = picks.find((p) => Number(p?.index) === i);
    const card = pick ? cards.find((c) => c.id === String(pick.taskId ?? "")) : undefined;
    if (!card) return a;
    return { ...a, taskId: card.id, taskLabel: `${PLATFORM_ZH[card.platform] ?? card.platform}・${card.labelZh}`, platform: card.platform };
  });
}

async function pickTaskCards(actions: MeetingAction[], brandName: string): Promise<MeetingAction[]> {
  const content = actions.map((a, i) => ({ a, i })).filter((x) => x.a.kind === "content");
  if (!content.length) return actions;
  const { candidateCards } = await import("./campaignPlan");
  const cards = candidateCards(CONTENT_CHANNELS).map((c) => ({ id: c.id, platform: c.platform, labelZh: c.labelZh }));
  if (!cards.length) return actions;
  const prompt = [
    `品牌「${brandName}」的策略會議決定要做下面幾篇內容。幫每一篇挑一張最適合的任務卡（任務卡決定格式與平台）。`,
    `【要做的內容】\n${content.map((x) => `${x.i}. ${x.a.title}`).join("\n")}`,
    `【任務卡目錄（id｜平台｜名稱）】\n${cards.map((c) => `${c.id}｜${PLATFORM_ZH[c.platform] ?? c.platform}｜${c.labelZh}`).join("\n")}`,
    `規則：taskId 只能從目錄挑、一字不差。內容沒指定平台時，挑最能表現這個題目的格式。只輸出 JSON：{"picks":[{"index":0,"taskId":"…"}]}`,
  ].join("\n\n");
  try {
    const r = await callModel([{ role: "user", content: prompt }], "general");
    return applyTaskPicks(actions, parseJsonLoose(String(r.content ?? "")), cards);
  } catch {
    return actions;
  }
}
export interface MeetingMinutes {
  summary: string;
  remarks: Array<{ name: string; title: string; gist: string }>;
  checks: StrategyCheck[];
  /** kind: content = 可以直接變成一篇內容（前台給「開任務」）；work = 研究／營運工作。 */
  actions: MeetingAction[];
  /** 這場會可引用的品牌資料來源（S 編號）——連結到 OnBrand 的哪一頁。 */
  sources: MeetingSource[];
}
export type DecisionStatus = "adopted" | "modified" | "rejected";
export interface Decision {
  status: DecisionStatus; note: string; at: string;
  /** 有寫進品牌大腦時的版本 id（strategy_positioning_versions）。 */
  versionId?: number;
  /** 寫入了哪些欄位（顯示「已寫入：差異化總結、唯一致勝理由」用）。 */
  written?: string[];
}

// ─── 錨點：要檢查哪幾格定位 ────────────────────────────────────────────

const BRAND_ANCHORS: Array<{ id: string; label: string }> = [
  { id: "audience", label: "目標受眾" },
  { id: "competition", label: "競爭格局" },
  { id: "differentiation", label: "差異化" },
  { id: "tagline", label: "品牌標語" },
  { id: "voice", label: "品牌語氣" },
];
const PRODUCT_ANCHORS: Array<{ id: string; label: string }> = [
  { id: "core", label: "產品核心定位" },
  { id: "audience", label: "產品受眾" },
  { id: "value", label: "價值主張" },
  { id: "competition", label: "競品比較" },
  { id: "strategy", label: "產品策略" },
];

/** 把一格定位（字串或巢狀物件）攤成人讀得懂的一段文字。 */
export function flattenSegment(v: unknown, max = 400): string {
  const out: string[] = [];
  const walk = (x: unknown, depth: number) => {
    if (out.join(" ").length > max || depth > 4 || x == null) return;
    if (typeof x === "string") { const s = x.trim(); if (s) out.push(s); return; }
    if (typeof x === "number" || typeof x === "boolean") { out.push(String(x)); return; }
    if (Array.isArray(x)) { for (const y of x) walk(y, depth + 1); return; }
    if (typeof x === "object") {
      for (const [k, y] of Object.entries(x as Record<string, unknown>)) {
        if (k.startsWith("_") || /score|updatedAt|createdAt|source/i.test(k)) continue;
        walk(y, depth + 1);
      }
    }
  };
  walk(v, 0);
  const s = out.join("／").replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * overrides：品牌受眾的「目前」優先用 brands.targetAudience（受眾錨點，文案任務鎖定的
 * 客群、會議採用後也寫這一欄）；沒有才退回受眾那一格的研究內容。
 */
export function anchorsFromPositioning(scope: MeetingScope, positioning: unknown, overrides: Record<string, string> = {}): Anchor[] {
  const pos = positioning && typeof positioning === "object" ? positioning as Record<string, unknown> : {};
  return (scope === "product" ? PRODUCT_ANCHORS : BRAND_ANCHORS).map((a) => ({
    ...a, current: (overrides[a.id] ?? "").trim() ? flattenSegment(overrides[a.id]) : flattenSegment(pos[a.id]),
  }));
}

// ─── 排程 ─────────────────────────────────────────────────────────────

const TPE_OFFSET_MS = 8 * 3_600_000;

/**
 * 下一次開會時間（UTC Date）。一律落在台北時間早上 9 點。
 * - weekly／biweekly：下一個 dayOfWeek（0=週日）；biweekly 從上次開會起算至少 14 天。
 * - monthly／quarterly：下一個 dayOfMonth（1–28，避開月底長短不一）；quarterly 間隔 3 個月。
 * 沒有上次開會時間（新建）就取「從現在起最近的那一天」。
 */
export function computeNextRunAt(args: {
  frequency: MeetingFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  now?: Date;
  lastRunAt?: Date | null;
}): Date {
  const now = args.now ?? new Date();
  // 在「台北牆上時間」的座標系裡算，最後再換回 UTC。
  const tpeNow = new Date(now.getTime() + TPE_OFFSET_MS);
  const at9 = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, RUN_HOUR_TAIPEI) - TPE_OFFSET_MS);

  if (args.frequency === "weekly" || args.frequency === "biweekly") {
    const dow = Math.min(6, Math.max(0, Number(args.dayOfWeek ?? 1)));
    const minGapDays = args.frequency === "biweekly" && args.lastRunAt ? 13 : 0;
    const earliest = args.lastRunAt
      ? new Date(Math.max(now.getTime(), args.lastRunAt.getTime() + minGapDays * 86_400_000))
      : now;
    const tpeEarliest = new Date(earliest.getTime() + TPE_OFFSET_MS);
    for (let i = 0; i < 21; i++) {
      const d = new Date(Date.UTC(tpeEarliest.getUTCFullYear(), tpeEarliest.getUTCMonth(), tpeEarliest.getUTCDate() + i));
      if (d.getUTCDay() !== dow) continue;
      const cand = at9(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      if (cand.getTime() > earliest.getTime()) return cand;
    }
  }

  const dom = Math.min(28, Math.max(1, Number(args.dayOfMonth ?? 1)));
  const stepMonths = args.frequency === "quarterly" ? 3 : 1;
  const y = tpeNow.getUTCFullYear();
  let m = tpeNow.getUTCMonth();
  let cand = at9(y, m, dom);
  if (cand.getTime() <= now.getTime()) { m += 1; cand = at9(y, m, dom); }
  if (args.lastRunAt && stepMonths > 1) {
    // 季會：離上次至少兩個半月，避免建好馬上開、下個月又開一次。
    const minNext = args.lastRunAt.getTime() + 75 * 86_400_000;
    while (cand.getTime() < minNext) { m += 1; cand = at9(y, m, dom); }
  }
  return cand;
}

// ─── 解析模型輸出 ──────────────────────────────────────────────────────

function parseJsonLoose(raw: string): any {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { /* fallthrough */ } }
  return null;
}

/**
 * 把模型回的紀錄收斂成合法結構：錨點 id 必須在清單裡；證據編號必須存在；
 * 「建議調整」沒有具體 proposal 就降成「維持」；最多 MAX_ADJUSTMENTS 條調整。
 * 清單上的每一格都一定會出現（模型漏掉的補成「維持／本次未討論」）。
 */
export function parseCites(raw: unknown, sources: MeetingSource[]): Cite[] {
  const out: Cite[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(raw) ? raw : []) {
    const code = String((c && typeof c === "object" ? (c as any).code : c) ?? "").trim().toUpperCase().replace(/[\[\]]/g, "");
    if (!/^S\d+$/.test(code) || seen.has(code)) continue;
    const src = sources.find((x) => x.code === code);
    if (!src) continue;
    seen.add(code);
    out.push({ code, quote: verifyQuote(c && typeof c === "object" ? (c as any).quote : null, src) });
    if (out.length >= 4) break;
  }
  return out;
}

export function parseMinutesJson(raw: string, anchors: Anchor[], evidenceCount: number, attendees: MeetingAttendee[], sources: MeetingSource[] = []): MeetingMinutes | null {
  const obj = parseJsonLoose(raw);
  if (!obj || typeof obj !== "object") return null;
  const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const byId = new Map<string, any>();
  for (const c of Array.isArray(obj.checks) ? obj.checks : []) {
    const id = str(c?.anchorId, 40);
    if (anchors.some((a) => a.id === id) && !byId.has(id)) byId.set(id, c);
  }
  let adjustCount = 0;
  const checks: StrategyCheck[] = anchors.map((a) => {
    const c = byId.get(a.id);
    const proposal = str(c?.proposal, 600);
    let verdict: Verdict = c?.verdict === "adjust" && proposal.length >= 4 ? "adjust" : "keep";
    if (verdict === "adjust") {
      if (adjustCount >= MAX_ADJUSTMENTS) verdict = "keep";
      else adjustCount++;
    }
    // E 編號可能放在 evidence，也可能混在 cites 裡——兩邊都收。
    const eCodes = [
      ...(Array.isArray(c?.evidence) ? c.evidence as unknown[] : []),
      ...(Array.isArray(c?.cites) ? (c.cites as unknown[]).map((x: any) => (x && typeof x === "object" ? x.code : x)) : []),
    ].map((x) => String(x ?? "").trim()).filter((x) => /^E?\d+$/i.test(x));
    const evidence = eCodes
      .map((x) => Number(x.replace(/^E/i, "")) - 1)
      .filter((n) => Number.isInteger(n) && n >= 0 && n < evidenceCount);
    return {
      anchorId: a.id,
      label: a.label,
      current: a.current,
      verdict,
      proposal: verdict === "adjust" ? proposal : "",
      reason: str(c?.reason, 600) || (c ? "" : "本次會議未討論這一格"),
      evidence: [...new Set(evidence)].slice(0, 5),
      cites: parseCites(c?.cites, sources),
      raisedBy: str(c?.raisedBy, 40),
    };
  });
  const names = new Set(attendees.map((x) => x.name));
  const remarks = (Array.isArray(obj.remarks) ? obj.remarks : [])
    .map((r: any) => ({ name: str(r?.name, 40), gist: str(r?.gist, 400) }))
    .filter((r: any) => names.has(r.name) && r.gist)
    .map((r: any) => ({ ...r, title: attendees.find((x) => x.name === r.name)?.title ?? "" }));
  const actions = (Array.isArray(obj.actions) ? obj.actions : [])
    .map((x: any) => ({ title: str(x?.title, 200), owner: str(x?.owner, 40), kind: x?.kind === "content" ? "content" as const : "work" as const, cites: parseCites(x?.cites, sources) }))
    .filter((x: any) => x.title.length >= 4)
    .slice(0, 5);
  const summary = str(obj.summary, 800);
  if (!summary) return null;
  return { summary, remarks, checks, actions, sources };
}

// ─── 資料存取 ─────────────────────────────────────────────────────────

const parseJ = <T>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return v as T;
};
const iso = (v: unknown) => (v ? new Date(v as any).toISOString() : null);

export function rowToMeeting(r: any): StrategyMeeting {
  return {
    id: Number(r.id), brandId: Number(r.brandId),
    scope: r.scope === "product" ? "product" : "brand", scopeId: Number(r.scopeId),
    topic: String(r.topic ?? ""), agenda: String(r.agenda ?? ""),
    attendees: parseJ<MeetingAttendee[]>(r.attendees, []).filter((a) => a && Number(a.agentId) > 0),
    frequency: (MEETING_FREQUENCIES as readonly string[]).includes(r.frequency) ? r.frequency : "monthly",
    dayOfWeek: r.dayOfWeek == null ? null : Number(r.dayOfWeek),
    dayOfMonth: r.dayOfMonth == null ? null : Number(r.dayOfMonth),
    enabled: !!Number(r.enabled),
    nextRunAt: iso(r.nextRunAt), lastRunAt: iso(r.lastRunAt),
  };
}

export interface MeetingRun {
  id: number;
  meetingId: number;
  status: "running" | "done" | "failed";
  note: string;
  trigger: string;
  transcript: Array<{ name: string; title: string; content: string }>;
  minutes: MeetingMinutes | null;
  evidence: Array<{ title: string; url?: string; source?: string; date?: string }>;
  decisions: Record<string, Decision>;
  createdAt: string;
}

/** 一場會跑超過這個時間還是 running，就是伺服器中途重啟了——顯示成失敗，不要永遠轉圈。 */
const STALE_RUNNING_MS = 30 * 60_000;

export function rowToRun(r: any, now: Date = new Date()): MeetingRun {
  const stale = r.status === "running" && now.getTime() - new Date(r.createdAt).getTime() > STALE_RUNNING_MS;
  return {
    id: Number(r.id), meetingId: Number(r.meetingId),
    status: r.status === "done" ? "done" : (r.status === "failed" || stale) ? "failed" : "running",
    note: stale ? "interrupted：會議中途中斷（伺服器重啟），請再開一次" : String(r.note ?? ""),
    trigger: String(r.trigger_kind ?? "schedule"),
    transcript: parseJ(r.transcript, []),
    minutes: parseJ<MeetingMinutes | null>(r.minutes, null),
    evidence: parseJ(r.evidence, []),
    decisions: parseJ<Record<string, Decision>>(r.decisions, {}),
    createdAt: new Date(r.createdAt).toISOString(),
  };
}

/** 一場會裡還沒決定的「建議調整」數。側欄紅點用這個數字。 */
export function pendingDecisionCount(run: MeetingRun): number {
  if (run.status !== "done" || !run.minutes) return 0;
  return run.minutes.checks.filter((c) => c.verdict === "adjust" && !run.decisions[c.anchorId]).length;
}

// ─── 開會 ─────────────────────────────────────────────────────────────

async function loadScope(meeting: StrategyMeeting): Promise<{ brandName: string; industry: string | null; scopeName: string; positioning: unknown; overrides: Record<string, string> }> {
  const [bRows]: any = await localPool.execute(
    `SELECT name, industry, positioning, targetAudience FROM brands WHERE id = ? LIMIT 1`, [meeting.brandId],
  );
  const b = (bRows as any[])[0] ?? {};
  if (meeting.scope === "product") {
    const [pRows]: any = await localPool.execute(
      `SELECT name, positioning FROM products WHERE id = ? AND brandId = ? LIMIT 1`, [meeting.scopeId, meeting.brandId],
    );
    const p = (pRows as any[])[0] ?? {};
    return { brandName: String(b.name ?? ""), industry: b.industry ?? null, scopeName: String(p.name ?? ""), positioning: parseJ(p.positioning, {}), overrides: {} };
  }
  return {
    brandName: String(b.name ?? ""), industry: b.industry ?? null, scopeName: String(b.name ?? ""), positioning: parseJ(b.positioning, {}),
    overrides: b.targetAudience ? { audience: String(b.targetAudience) } : {},
  };
}

async function loadEvidence(meeting: StrategyMeeting): Promise<{ lines: string; items: MeetingRun["evidence"] }> {
  const [rows]: any = await localPool.execute(
    `SELECT title, summary, evidence, createdAt FROM strategy_alerts
      WHERE brandId = ? AND status <> 'dismissed' AND createdAt > NOW() - INTERVAL 30 DAY
        ${meeting.scope === "product" ? "AND (scope = 'brand' OR (scope = 'product' AND scopeId = ?))" : "AND scope = 'brand'"}
      ORDER BY createdAt DESC LIMIT 8`,
    meeting.scope === "product" ? [meeting.brandId, meeting.scopeId] : [meeting.brandId],
  );
  const items: MeetingRun["evidence"] = [];
  const lines: string[] = [];
  for (const r of rows as any[]) {
    const ev = parseJ<any[]>(r.evidence, [])[0] ?? {};
    items.push({ title: String(r.title ?? ""), url: ev.url, source: ev.source, date: new Date(r.createdAt).toISOString().slice(0, 10) });
    lines.push(`E${items.length}. ${r.title}（${items[items.length - 1]!.date}）：${String(r.summary ?? "").slice(0, 300)}`);
  }
  return { lines: lines.join("\n"), items };
}

async function lastConclusion(meetingId: number): Promise<string> {
  const [rows]: any = await localPool.execute(
    `SELECT minutes, decisions, createdAt FROM strategy_meeting_runs
      WHERE meetingId = ? AND status = 'done' ORDER BY createdAt DESC LIMIT 1`, [meetingId],
  );
  const r = (rows as any[])[0];
  if (!r) return "";
  const m = parseJ<MeetingMinutes | null>(r.minutes, null);
  if (!m) return "";
  const d = parseJ<Record<string, Decision>>(r.decisions, {});
  const adj = m.checks.filter((c) => c.verdict === "adjust")
    .map((c) => `- ${c.label}：建議「${c.proposal}」→ 用戶${d[c.anchorId]?.status === "adopted" ? "採用" : d[c.anchorId]?.status === "modified" ? "修改後採用" : d[c.anchorId]?.status === "rejected" ? "不採用" : "尚未決定"}`);
  return `【上一場（${new Date(r.createdAt).toISOString().slice(0, 10)}）結論】${m.summary}${adj.length ? `\n${adj.join("\n")}` : ""}`;
}

function personaBlock(d: Awaited<ReturnType<typeof getDirectorByAgentId>>, fallback: MeetingAttendee): string {
  if (!d) return `你是${fallback.name}，職稱${fallback.title}。以第一人稱說話，不要自稱 AI。`;
  const role = getRole(d.roleId);
  return [
    `你叫${d.name}，職稱是${d.title}。以第一人稱用這個身分說話，不要自稱「AI」或「助理」。`,
    role.promptAngle,
    d.specialty ? `你的專長：${d.specialty}` : "",
    d.methodology ? `你慣用的方法論：\n${d.methodology.slice(0, 600)}` : "",
    `經歷裡沒寫到的事不要編（客戶名字、數字、年份）。`,
  ].filter(Boolean).join("\n");
}

export interface RunResult { ok: boolean; runId: number; note: string }

/**
 * 開一場會。呼叫端負責權限與方案檢查；這裡只負責開完、存好、排下一次。
 * gatherBrandContext 從總監對話 router 動態載入，避免 core 在載入期就依賴 router。
 */
export async function createRun(meeting: StrategyMeeting, userId: number, trigger: "schedule" | "manual"): Promise<number> {
  const [ins]: any = await localPool.execute(
    `INSERT INTO strategy_meeting_runs (meetingId, userId, brandId, status, trigger_kind) VALUES (?, ?, ?, 'running', ?)`,
    [meeting.id, userId, meeting.brandId, trigger],
  );
  return Number(ins.insertId);
}

/** 手動開會：先建好那一列、馬上回 runId，會在背景開（一場要 1–2 分鐘，不讓請求掛著等）。 */
export async function startMeetingInBackground(meeting: StrategyMeeting, userId: number): Promise<number> {
  const runId = await createRun(meeting, userId, "manual");
  void runMeeting(meeting, userId, "manual", runId).then(
    (r) => console.log(`[strategyMeetings] manual meeting#${meeting.id}: ${r.note}`),
    (e) => console.error(`[strategyMeetings] manual meeting#${meeting.id} crashed`, e?.message ?? e),
  );
  return runId;
}

export async function runMeeting(meeting: StrategyMeeting, userId: number, trigger: "schedule" | "manual", existingRunId?: number): Promise<RunResult> {
  const runId = existingRunId ?? await createRun(meeting, userId, trigger);
  const now = new Date();
  const scheduleNext = async () => {
    const next = computeNextRunAt({ frequency: meeting.frequency, dayOfWeek: meeting.dayOfWeek, dayOfMonth: meeting.dayOfMonth, now, lastRunAt: now });
    await localPool.execute(`UPDATE strategy_meetings SET lastRunAt = ?, nextRunAt = ? WHERE id = ?`, [now, next, meeting.id]);
  };
  const fail = async (note: string, transcript: MeetingRun["transcript"] = []): Promise<RunResult> => {
    await localPool.execute(
      `UPDATE strategy_meeting_runs SET status = 'failed', note = ?, transcript = ? WHERE id = ?`,
      [note.slice(0, 255), JSON.stringify(transcript), runId],
    );
    await scheduleNext();
    return { ok: false, runId, note };
  };

  try {
    const attendees = meeting.attendees.slice(0, MAX_ATTENDEES);
    if (!attendees.length) return await fail("no_attendees：這場會沒有設定與會者");
    const scope = await loadScope(meeting);
    // 「目前」讀的是產文實際用的那一格（buildBrandPrefix 讀 audience.primary），
    // 不用 targetAudience 覆蓋——否則會議看到的跟品牌大腦實際在用的不一樣。
    const anchors = anchorsFromPositioning(meeting.scope, scope.positioning);
    const { gatherBrandContext } = await import("../routers/strategistChatRouter");
    const brandCtx = await gatherBrandContext(meeting.brandId, userId, meeting.scope === "product" ? meeting.scopeId : null).catch(() => "");
    const ev = await loadEvidence(meeting);
    const sources = await buildMeetingSources({ userId, brandId: meeting.brandId, scope: meeting.scope, scopeId: meeting.scopeId }).catch(() => [] as MeetingSource[]);
    const prev = await lastConclusion(meeting.id);

    const anchorList = anchors.map((a) => `- [${a.id}] ${a.label}：${a.current || "（未填）"}`).join("\n");
    const briefing = [
      `【會議主題】${meeting.topic}`,
      meeting.agenda ? `【議程】${meeting.agenda}` : "",
      `【討論對象】${meeting.scope === "product" ? `產品「${scope.scopeName}」（品牌：${scope.brandName}）` : `品牌「${scope.brandName}」`}`,
      `【目前的策略】\n${anchorList}`,
      sources.length ? `【品牌資料來源（OnBrand 各頁的實際內容，引用時標 S 編號）】\n${sourcesBlock(sources)}` : "",
      ev.lines ? `【近 30 天策略監測情報（引用時標 E 編號）】\n${ev.lines}` : `【近 30 天策略監測情報】沒有。不要假裝有市場數據。`,
      prev,
      brandCtx ? `【品牌資料】\n${brandCtx.slice(0, 6000)}` : "",
    ].filter(Boolean).join("\n\n");

    const transcript: MeetingRun["transcript"] = [];
    for (const a of attendees) {
      const d = await getDirectorByAgentId(a.agentId, scope.industry).catch(() => null);
      const knowledge = d ? await loadAgentKnowledge(d.agentId, { source: "strategy.meeting" }).catch(() => "") : "";
      const sys = [
        personaBlock(d, a),
        knowledge,
        `你正在參加一場策略會議。用你的專業角度發言，200–350 字，繁體中文（台灣用語）。`,
        `要回應前面與會者的觀點（同意就補充，不同意就直說理由），不要重複別人講過的。`,
        `必須明講：目前策略裡哪一格該維持、哪一格該調整、調成什麼。`,
        `每個主張都要標出處：品牌資料寫 [S編號] 並用「」逐字引用那一頁的原文（例如 [S12]「讓家人眼睛一亮」）；市場情報寫 [E編號]。資料裡沒有的就明說是你的判斷，不要編原文。`,
      ].filter(Boolean).join("\n\n");
      const prior = transcript.length
        ? `\n\n【前面的發言】\n${transcript.map((t) => `${t.name}（${t.title}）：${t.content}`).join("\n\n")}`
        : "";
      let content = "";
      try {
        const r = await callModel([
          { role: "system", content: sys },
          { role: "user", content: `${briefing}${prior}\n\n輪到你發言。` },
        ], "general");
        content = String(r.content ?? "").trim();
      } catch (e) {
        return await fail(`llm_error：${a.name} 發言失敗 ${String((e as Error)?.message ?? e).slice(0, 150)}`, transcript);
      }
      if (!content) return await fail(`llm_empty：${a.name} 沒有發言內容`, transcript);
      transcript.push({ name: d?.name ?? a.name, title: d?.title ?? a.title, content: content.slice(0, 3000) });
    }

    const synthPrompt = [
      `你是會議記錄。根據下面的會議資料與逐字發言，整理成會議紀錄，只輸出 JSON。`,
      briefing.slice(0, 5000),
      `【逐字發言】\n${transcript.map((t) => `${t.name}（${t.title}）：${t.content}`).join("\n\n")}`,
      `規則：`,
      `1. checks 必須逐一涵蓋「目前的策略」清單的每個 id（${anchors.map((a) => a.id).join(", ")}），不能新增清單外的 id。`,
      `2. verdict 只能是 keep 或 adjust。只有與會者真的主張要改、而且講得出改成什麼，才標 adjust；最多 ${MAX_ADJUSTMENTS} 條。`,
      `3. adjust 的 proposal 寫具體的新內容（可以直接貼回定位的那段話），reason 寫為什麼。`,
      `4. 出處：evidence 填引用到的市場情報編號（例如 ["E1"]）；cites 填引用到的品牌資料來源，格式 [{"code":"S12","quote":"逐字原文"}]——quote 必須是那個來源裡一字不差的片段（發言引用過的優先），找不到原文就只填 code、quote 留空。維持的格子也要標出支撐判斷的來源。沒有就填 []，不要自己補。`,
      `5. raisedBy 填提出這個主張的與會者姓名。remarks 每位一句 gist（60 字內）。actions 也可以有 cites（同格式）。actions 是會後要做的事（最多 5 條）：能直接寫成一篇貼文／文章的標 kind:"content"，title 寫成內容題目；研究、訪談、分析、營運修正標 kind:"work"。`,
      `6. summary 用 2–3 句講這場會的結論。全部繁體中文（台灣用語）。`,
      `格式：{"summary":"…","remarks":[{"name":"…","gist":"…"}],"checks":[{"anchorId":"audience","verdict":"keep","proposal":"","reason":"…","evidence":[],"cites":[{"code":"S3","quote":"…"}],"raisedBy":"…"}],"actions":[{"title":"…","owner":"…","kind":"content","cites":[]}]}`,
    ].join("\n\n");
    let minutes: MeetingMinutes | null = null;
    for (let attempt = 0; attempt < 2 && !minutes; attempt++) {
      try {
        const r = await callModel([{ role: "user", content: synthPrompt }], "general");
        minutes = parseMinutesJson(String(r.content ?? ""), anchors, ev.items.length, transcript.map((t) => ({ agentId: 0, name: t.name, title: t.title })), sources);
      } catch { minutes = null; }
    }
    if (!minutes) return await fail("minutes_error：會議紀錄整理失敗（發言已保留）", transcript);
    minutes.actions = await pickTaskCards(minutes.actions, scope.brandName);

    const adj = minutes.checks.filter((c) => c.verdict === "adjust").length;
    const note = adj ? `建議調整 ${adj} 項` : "策略維持，沒有需要調整的地方";
    await localPool.execute(
      `UPDATE strategy_meeting_runs SET status = 'done', note = ?, transcript = ?, minutes = ?, evidence = ? WHERE id = ?`,
      [note, JSON.stringify(transcript), JSON.stringify(minutes), JSON.stringify(ev.items), runId],
    );
    await scheduleNext();
    return { ok: true, runId, note };
  } catch (e) {
    return await fail(`error：${String((e as Error)?.message ?? e).slice(0, 200)}`);
  }
}

/**
 * worker 的一拍：挑一場到期、開著、擁有者方案有策略監測（專業方案）的會來開。
 * 一拍只開一場 —— 一場會是 N+1 次 LLM 呼叫，寧可慢。
 */
export async function tickStrategyMeetings(): Promise<{ ran: number }> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM strategy_meetings WHERE enabled = 1 AND nextRunAt IS NOT NULL AND nextRunAt <= NOW(3)
      ORDER BY nextRunAt ASC LIMIT 5`,
  );
  for (const r of rows as any[]) {
    const m = rowToMeeting(r);
    const userId = Number(r.userId);
    let allowed = false;
    try { allowed = (await planQuotaFor(userId)).strategyMonitoring; } catch { allowed = false; }
    if (!allowed) {
      // 方案沒有：不開，但把下一次往後排，免得每拍都重挑到它。
      const next = computeNextRunAt({ frequency: m.frequency, dayOfWeek: m.dayOfWeek, dayOfMonth: m.dayOfMonth, lastRunAt: new Date() });
      await localPool.execute(`UPDATE strategy_meetings SET nextRunAt = ? WHERE id = ?`, [next, m.id]);
      continue;
    }
    const res = await runMeeting(m, userId, "schedule");
    console.log(`[strategyMeetings] meeting#${m.id} brand#${m.brandId}: ${res.note}`);
    return { ran: 1 };
  }
  return { ran: 0 };
}
