/**
 * weeklyPlanner — 「本週企劃」：跟總主管對話，排出一週的內容格子；取代原本的行事曆。
 *
 * 2026-09-27（CJ「用 Claude 規劃社群內容的流程……在所有 mission tray 當中加一個新的」→
 * 「混合式」→「左談右曆」→「本週企劃取代行事曆，活動企劃與其他任務卡產出都要出現，登入後
 * 直接落在本週企劃」→「總主管帶路，分歧時才出現兩張方案卡」）。
 *
 * 這一層只管「規劃格子」（planned_slots）與對話紀錄（planner_messages）。同一週裡另外兩種
 * 東西由既有的來源提供、前端合併：活動企劃的格子（events.positioning.campaignPlan）、已排程／
 * 已發布的內容（calendar.range）。
 *
 * ── 模型只能用「操作」改格子 ─────────────────────────────────────────
 * 總主管每次回覆除了一兩句話，只能回 add／update／remove 三種操作；伺服器逐條檢查：
 * 日期在這一週、通路是品牌加入的、任務卡是目錄裡真的有且屬於那個通路（不是就換成那個通路的
 * 預設卡並標 repaired）、題目不能空。檢查不過的操作丟掉，不會讓模型直接寫進資料庫。
 */
import localPool from "../../../localDb";
import { candidateCards } from "../campaign/campaignPlan";
import { isHiddenContentPlatform, isHiddenHistoryItem } from "../../../platform/core/billing/planGate";

export const PLANNED_SLOTS_DDL = `
  CREATE TABLE IF NOT EXISTS planned_slots (
    id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId      INT          NOT NULL,
    brandId     INT          NOT NULL,
    slotDate    DATE         NOT NULL,
    platform    VARCHAR(24)  NOT NULL,
    taskId      VARCHAR(100) NOT NULL,
    taskLabel   VARCHAR(160) NULL,
    topic       VARCHAR(200) NOT NULL,
    format      VARCHAR(40)  NULL,
    reason      VARCHAR(300) NULL,
    status      VARCHAR(12)  NOT NULL DEFAULT 'draft',
    outputId    BIGINT       NULL,
    createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_planned_slots_brand_date (brandId, slotDate)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const PLANNER_MESSAGES_DDL = `
  CREATE TABLE IF NOT EXISTS planner_messages (
    id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId      INT          NOT NULL,
    brandId     INT          NOT NULL,
    role        VARCHAR(12)  NOT NULL,
    content     TEXT         NOT NULL,
    meta        JSON         NULL,
    createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_planner_messages (brandId, userId, createdAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export type SlotStatus = "draft" | "planned" | "written" | "dismissed";

/** navPrefs 的 id → 任務目錄的通路名。 */
export const NAV_TO_PLATFORM: Record<string, string> = {
  fb: "facebook", ig: "instagram", li: "linkedin", yt: "youtube", tt: "tiktok",
  email: "email", pr: "pr", x: "x", web: "website", threads: "threads", line: "line",
};
export const PLATFORM_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok",
  email: "電子報", pr: "新聞稿", x: "X", website: "官網", threads: "Threads", line: "LINE",
};
const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

// ─── 日期（一律以 YYYY-MM-DD 字串運算，避免時區把日期推前一天）─────────────

export function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 這一週（週一開始）的七天。 */
export function weekDays(weekStart: string): Array<{ date: string; label: string }> {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const d = new Date(`${date}T00:00:00Z`);
    return { date, label: `週${WEEKDAY_ZH[d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}` };
  });
}
/** 任一天所在週的週一。 */
export function mondayOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay();            // 0=日
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

// ─── 操作檢查 ─────────────────────────────────────────────────────────

export interface Card { id: string; platform: string; labelZh: string }
export interface SlotRow {
  id: number; slotDate: string; platform: string; taskId: string; taskLabel: string | null;
  topic: string; format: string | null; reason: string | null; status: SlotStatus; outputId: number | null;
}
export type Op =
  | { op: "add"; date: string; platform: string; taskId: string; topic: string; format: string; reason: string; repaired: boolean }
  | { op: "update"; id: number; date?: string; platform?: string; taskId?: string; topic?: string; format?: string; reason?: string; repaired?: boolean }
  | { op: "remove"; id: number };

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

function pickCard(platform: string, taskId: unknown, cards: Card[]): { card: Card | null; repaired: boolean } {
  const own = cards.filter((c) => c.platform === platform);
  const exact = own.find((c) => c.id === String(taskId ?? ""));
  if (exact) return { card: exact, repaired: false };
  return { card: own[0] ?? null, repaired: true };
}

/**
 * 模型回的操作 → 可以套用的操作。規則見檔頭。已寫好（written）的格子不能改也不能刪——
 * 那是已經產出的內容，換掉會讓成品跟格子對不上。
 */
export function validateOps(args: {
  raw: unknown; weekStart: string; platforms: string[]; cards: Card[]; slots: SlotRow[];
}): Op[] {
  const days = new Set(weekDays(args.weekStart).map((d) => d.date));
  const editable = new Map(args.slots.filter((s) => s.status === "draft" || s.status === "planned").map((s) => [s.id, s]));
  const out: Op[] = [];
  for (const o of Array.isArray(args.raw) ? args.raw : []) {
    const kind = String((o as any)?.op ?? "");
    if (kind === "add") {
      const date = String((o as any).date ?? "");
      const platform = String((o as any).platform ?? "");
      const topic = str((o as any).topic, 60);
      if (!days.has(date) || !args.platforms.includes(platform) || topic.length < 2) continue;
      const { card, repaired } = pickCard(platform, (o as any).taskId, args.cards);
      if (!card) continue;
      out.push({ op: "add", date, platform, taskId: card.id, topic, format: str((o as any).format, 20), reason: str((o as any).reason, 120), repaired });
    } else if (kind === "update") {
      const id = Number((o as any).id);
      const cur = editable.get(id);
      if (!cur) continue;
      const u: Op & { op: "update" } = { op: "update", id };
      if ((o as any).date != null) { const d = String((o as any).date); if (days.has(d)) u.date = d; }
      const platform = (o as any).platform != null ? String((o as any).platform) : cur.platform;
      if ((o as any).platform != null && args.platforms.includes(platform)) u.platform = platform;
      const effPlatform = u.platform ?? cur.platform;
      if ((o as any).taskId != null || u.platform) {
        const { card, repaired } = pickCard(effPlatform, (o as any).taskId ?? cur.taskId, args.cards);
        if (card) { u.taskId = card.id; u.repaired = repaired; }
      }
      const topic = str((o as any).topic, 60); if (topic.length >= 2) u.topic = topic;
      const format = str((o as any).format, 20); if (format) u.format = format;
      const reason = str((o as any).reason, 120); if (reason) u.reason = reason;
      if (Object.keys(u).length > 2) out.push(u);
    } else if (kind === "remove") {
      const id = Number((o as any).id);
      if (editable.has(id)) out.push({ op: "remove", id });
    }
    if (out.length >= 14) break;
  }
  return out;
}

/** 模型沒接好時的退場句。存進對話時會標 failed，下一輪不再餵回給模型。 */
export const PLANNER_FALLBACK = "我這邊剛剛沒接好，再說一次看看？";
/** 模型有排格子卻沒寫 reply 時補上的一句（prompt 叫它「改了什麼不用逐條描述」，它有時乾脆不說）。 */
const DEFAULT_REPLY = "排好了，看右邊。";

/** 被截斷或壞掉的 JSON：把 reply 與寫完整的 ops 救回來（寫到一半的最後一條丟掉）。 */
function salvagePlannerReply(raw: string): { reply: string; ops: unknown[] } {
  const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  let reply = "";
  if (m) { try { reply = JSON.parse(`"${m[1]}"`); } catch { reply = m[1]!; } }
  const ops: unknown[] = [];
  const at = raw.search(/"ops"\s*:\s*\[/);
  let i = at < 0 ? raw.length : raw.indexOf("[", at) + 1;
  while (i < raw.length) {
    const open = raw.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let k = open; k < raw.length; k++) {
      const ch = raw[k]!;
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { end = k; break; } }
    }
    if (end < 0) break;
    try { ops.push(JSON.parse(raw.slice(open, end + 1))); } catch { /* 壞的那條跳過 */ }
    i = end + 1;
    const next = raw.slice(i).match(/^\s*([,\]])/);
    if (!next || next[1] === "]") break;
  }
  return { reply, ops };
}

/**
 * 模型回覆：{"reply","choices","ops"}；真的沒東西可用才回 null。
 * 2026-10-07（CJ「常常出現我沒接好」）：原本只要 JSON 解不開或 reply 是空的就整輪作廢。
 * 現在三種情況都接得住——有排格子但沒寫 reply（補一句）、沒照格式直接講話（那段話就是 reply）、
 * JSON 被截斷（救回 reply 與寫完整的 ops）。
 */
export function parsePlannerReply(raw: string): { reply: string; choices: string[]; ops: unknown[]; fork: string | null } | null {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  if (!cleaned) return null;
  let obj: any = null;
  try { obj = JSON.parse(cleaned); } catch {
    const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) { try { obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { obj = null; } }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    if (!cleaned.includes("{")) return { reply: str(cleaned, 300), choices: [], ops: [], fork: null };
    const saved = salvagePlannerReply(cleaned);
    if (!saved.reply && !saved.ops.length) return null;
    return { reply: str(saved.reply, 300) || DEFAULT_REPLY, choices: [], ops: saved.ops, fork: null };
  }
  const choices = (Array.isArray(obj.choices) ? obj.choices : []).map((c: unknown) => str(c, 24)).filter((c: string) => c.length >= 2).slice(0, 3);
  const fork = typeof obj.fork === "string" && obj.fork.trim() ? obj.fork.trim() : null;
  const ops = Array.isArray(obj.ops) ? obj.ops : [];
  const reply = str(obj.reply, 300) || (ops.length || fork || choices.length ? DEFAULT_REPLY : "");
  if (!reply) return null;
  return { reply, choices, ops, fork };
}

/**
 * 餵給模型的對話：沒接好的那一輪（退場句＋它沒回到的那句話）整輪拿掉——使用者會再說一次，
 * 留著只會讓模型看到同一句話重複、還學著回退場句。開頭一定是使用者的話（Anthropic 的格式要求）。
 */
export function plannerHistory(messages: Array<{ role: string; content: string; failed?: boolean }>, keep = 10): Array<{ role: "user" | "assistant"; content: string }> {
  const kept: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.role !== "user" && (m.failed || m.content === PLANNER_FALLBACK)) {
      if (kept[kept.length - 1]?.role === "user") kept.pop();
      continue;
    }
    kept.push({ role: m.role === "user" ? "user" : "assistant", content: m.content });
  }
  const out = kept.slice(-keep);
  while (out.length && out[0]!.role !== "user") out.shift();
  return out;
}

// ─── 資料存取 ─────────────────────────────────────────────────────────

const parse = (v: unknown): any => {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
  return v ?? null;
};

/** 品牌加入的通路（側欄設定；沒設定過＝預設 FB＋IG）。只回內容通路，不含工具。 */
export async function brandPlatforms(brandId: number): Promise<string[]> {
  let ids: string[] = ["fb", "ig"];
  try {
    const [rows]: any = await localPool.execute(`SELECT items FROM brand_nav_prefs WHERE brandId = ? LIMIT 1`, [brandId]);
    const r = (rows as any[])[0];
    if (r) { const p = parse(r.items); if (Array.isArray(p)) ids = p.map(String); }
  } catch { /* 表還沒建：用預設 */ }
  // 2026-09-29：存過 li/yt/pr/x 的舊品牌也不能再把下架通路帶進企劃。
  const out = (ids.map((id) => NAV_TO_PLATFORM[id]).filter(Boolean) as string[])
    .filter((p) => !isHiddenContentPlatform(p));
  return out.length ? out : ["facebook", "instagram"];
}

export function cardsFor(platforms: string[]): Card[] {
  return candidateCards(platforms).map((c) => ({ id: c.id, platform: c.platform, labelZh: c.labelZh }));
}

export function rowToSlot(r: any): SlotRow {
  const d = r.slotDate instanceof Date ? r.slotDate.toISOString().slice(0, 10) : String(r.slotDate).slice(0, 10);
  return {
    id: Number(r.id), slotDate: d, platform: String(r.platform), taskId: String(r.taskId), taskLabel: r.taskLabel ?? null,
    topic: String(r.topic), format: r.format ?? null, reason: r.reason ?? null,
    status: (["draft", "planned", "written", "dismissed"].includes(r.status) ? r.status : "draft") as SlotStatus,
    outputId: r.outputId == null ? null : Number(r.outputId),
  };
}

export async function loadWeekSlots(brandId: number, weekStart: string): Promise<SlotRow[]> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM planned_slots WHERE brandId = ? AND slotDate >= ? AND slotDate < ? AND status <> 'dismissed'
      ORDER BY slotDate ASC, id ASC`,
    [brandId, weekStart, addDays(weekStart, 7)],
  );
  // 2026-09-29 CJ「前台隱藏，資料保留」：下架通路的舊格子不列（資料不刪）。
  return (rows as any[]).map(rowToSlot).filter((s) => !isHiddenHistoryItem(s));
}

export interface CampaignSlot {
  eventId: number; eventName: string; itemId: string; date: string; platform: string;
  taskId: string; taskLabel: string; angle: string; outputId: number | null;
  /** 這一篇要下廣告（本週企劃標「廣告」）。 */
  paid?: boolean;
}
/**
 * 一份活動企劃裡、落在這一週的格子。純函式。
 *
 * 2026-09-30（CJ「策略層只排不寫…定稿以後，再到內容層寫內容…決定哪些行動方案，例如
 * 某一天的貼文，要排程到本周企畫的行事曆上」）：
 *   · 只收定稿（lockedAt）的企劃——草稿還在改，排進行事曆等於叫人寫一篇可能會被換掉的。
 *   · 內容層在活動日曆上按了「不排進本週企劃」（inPlanner === false）的那篇不收。
 */
export function campaignItemsInWeek(
  event: { id: number; name: string }, plan: any, weekStart: string,
): CampaignSlot[] {
  if (!plan?.lockedAt) return [];
  const end = addDays(weekStart, 7);
  const out: CampaignSlot[] = [];
  for (const it of Array.isArray(plan?.items) ? plan.items : []) {
    if (it?.enabled === false || it?.inPlanner === false) continue;
    const date = String(it?.date ?? "");
    if (!isYmd(date) || date < weekStart || date >= end) continue;
    if (isHiddenHistoryItem({ platform: it?.platform, taskId: it?.taskId })) continue;
    out.push({
      eventId: event.id, eventName: event.name, itemId: String(it.id), date,
      platform: String(it.platform ?? ""), taskId: String(it.taskId ?? ""), taskLabel: String(it.taskLabel ?? ""),
      angle: String(it.angle ?? ""), outputId: it.outputId ? Number(it.outputId) : null,
      ...(it.paid ? { paid: true } : {}),
    });
  }
  return out;
}

/** 這一週裡，品牌各活動企劃排到的格子（活動企劃存在 events.positioning.campaignPlan）。 */
export async function loadWeekCampaignItems(brandId: number, weekStart: string): Promise<CampaignSlot[]> {
  const [rows]: any = await localPool.execute(`SELECT id, name, positioning FROM events WHERE brandId = ?`, [brandId]);
  const out: CampaignSlot[] = [];
  for (const e of rows as any[]) {
    out.push(...campaignItemsInWeek({ id: Number(e.id), name: String(e.name ?? "") }, parse(e.positioning)?.campaignPlan, weekStart));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface WeekEvent {
  eventId: number; name: string; startAt: string; endAt: string;
  /** 企劃裡共幾篇（含未定稿的企劃）／已寫幾篇——檔期橫條上顯示進度。 */
  total: number; written: number;
}
/**
 * 這一週跟哪些活動檔期重疊（2026-10-11 CJ「顯示活動企劃中已經有的檔期」）。
 * 檔期＝events.startAt～endAt；沒填的話退回企劃裡最早／最晚那一篇的日期。完全沒日期的活動不列。
 */
export async function loadWeekEvents(brandId: number, weekStart: string): Promise<WeekEvent[]> {
  const [rows]: any = await localPool.execute(`SELECT id, name, startAt, endAt, positioning FROM events WHERE brandId = ?`, [brandId]);
  const weekEnd = addDays(weekStart, 6);
  const day = (d: any) => { if (!d) return null; const t = new Date(d); return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10); };
  const out: WeekEvent[] = [];
  for (const e of rows as any[]) {
    const items: any[] = (() => { const a = parse(e.positioning)?.campaignPlan?.items; return Array.isArray(a) ? a.filter((i) => i?.enabled !== false && !isHiddenHistoryItem({ platform: i?.platform, taskId: i?.taskId })) : []; })();
    const dates = items.map((i) => String(i?.date ?? "")).filter(isYmd).sort();
    const startAt = day(e.startAt) ?? dates[0] ?? null;
    const endAt = day(e.endAt) ?? dates[dates.length - 1] ?? null;
    if (!startAt || !endAt || endAt < weekStart || startAt > weekEnd) continue;
    out.push({ eventId: Number(e.id), name: String(e.name ?? ""), startAt, endAt, total: items.length, written: items.filter((i) => i?.outputId).length });
  }
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/**
 * 側欄的「儀表」（2026-09-30 CJ 參考 Tesla：本週企劃像電量、平台圖示顯示待處理數）。
 * 只算已排定的：草稿格子（總監提案、還沒按排定）不算；已寫＝slot written 或活動格子有 outputId。
 * pendingByNav 用側欄的 nav id（fb/ig/…）當 key，前端直接對得上。
 */
export function railStatusOf(slots: SlotRow[], campaign: CampaignSlot[]): { total: number; written: number; pendingByNav: Record<string, number> } {
  const platformToNav = new Map(Object.entries(NAV_TO_PLATFORM).map(([nav, p]) => [p, nav]));
  const navOf = (platform: string) => platformToNav.get(platform) ?? (NAV_TO_PLATFORM[platform] ? platform : null);
  const items = [
    ...slots.filter((s) => s.status === "planned" || s.status === "written").map((s) => ({ platform: s.platform, done: s.status === "written" })),
    ...campaign.map((c) => ({ platform: c.platform, done: c.outputId != null })),
  ];
  const pendingByNav: Record<string, number> = {};
  for (const it of items) {
    if (it.done) continue;
    const nav = navOf(it.platform);
    if (nav) pendingByNav[nav] = (pendingByNav[nav] ?? 0) + 1;
  }
  return { total: items.length, written: items.filter((i) => i.done).length, pendingByNav };
}

export async function applyOps(args: { userId: number; brandId: number; ops: Op[]; cards: Card[] }): Promise<number[]> {
  const label = (id: string) => args.cards.find((c) => c.id === id)?.labelZh ?? null;
  const touched: number[] = [];
  for (const o of args.ops) {
    if (o.op === "add") {
      const [r]: any = await localPool.execute(
        `INSERT INTO planned_slots (userId, brandId, slotDate, platform, taskId, taskLabel, topic, format, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
        [args.userId, args.brandId, o.date, o.platform, o.taskId, label(o.taskId), o.topic, o.format || null, o.reason || null],
      );
      touched.push(Number(r.insertId));
    } else if (o.op === "update") {
      const sets: string[] = []; const vals: any[] = [];
      if (o.date) { sets.push("slotDate = ?"); vals.push(o.date); }
      if (o.platform) { sets.push("platform = ?"); vals.push(o.platform); }
      if (o.taskId) { sets.push("taskId = ?", "taskLabel = ?"); vals.push(o.taskId, label(o.taskId)); }
      if (o.topic) { sets.push("topic = ?"); vals.push(o.topic); }
      if (o.format) { sets.push("format = ?"); vals.push(o.format); }
      if (o.reason) { sets.push("reason = ?"); vals.push(o.reason); }
      if (!sets.length) continue;
      await localPool.execute(
        `UPDATE planned_slots SET ${sets.join(", ")} WHERE id = ? AND brandId = ? AND status IN ('draft','planned')`,
        [...vals, o.id, args.brandId],
      );
      touched.push(o.id);
    } else {
      await localPool.execute(
        `UPDATE planned_slots SET status = 'dismissed' WHERE id = ? AND brandId = ? AND status IN ('draft','planned')`,
        [o.id, args.brandId],
      );
    }
  }
  return touched;
}

// ─── 提示詞 ───────────────────────────────────────────────────────────

export interface PlannerCtxArgs {
  brandName: string; brandCtx: string; weekStart: string; platforms: string[]; cards: Card[];
  slots: SlotRow[]; campaign: CampaignSlot[]; scheduled: Array<{ date: string; platform: string; title: string }>;
}

/** 總監與分歧顧問共用：這一週的資料＋排法規則。 */
export function plannerContext(args: PlannerCtxArgs): string {
  const days = weekDays(args.weekStart);
  const cardList = args.cards.map((c) => `${c.id}｜${PLATFORM_ZH[c.platform] ?? c.platform}｜${c.labelZh}`).join("\n");
  const slotList = args.slots.length
    ? args.slots.map((s) => `#${s.id}｜${s.slotDate}｜${PLATFORM_ZH[s.platform] ?? s.platform}｜${s.topic}｜${s.format ?? ""}｜${s.status === "written" ? "已寫好（不可改）" : s.status === "planned" ? "已排定" : "草稿"}`).join("\n")
    : "（還沒有）";
  const campList = args.campaign.length
    ? args.campaign.map((c) => `${c.date}｜${PLATFORM_ZH[c.platform] ?? c.platform}｜活動「${c.eventName}」：${c.angle}${c.outputId ? "（已寫）" : ""}`).join("\n")
    : "（這週沒有）";
  const schedList = args.scheduled.length
    ? args.scheduled.map((s) => `${s.date}｜${PLATFORM_ZH[s.platform] ?? s.platform}｜${s.title}`).join("\n")
    : "（這週沒有）";
  return [
    `【品牌】${args.brandName}`,
    `【這一週】${days.map((d) => `${d.date}（${d.label}）`).join("、")}`,
    `【品牌加入的通路】${args.platforms.map((p) => `${p}（${PLATFORM_ZH[p] ?? p}）`).join("、")}——只能排在這些通路。`,
    `【這週已經有的內容，不要重複排】\n已排程／已發布：\n${schedList}\n活動企劃：\n${campList}`,
    `【已排的格子（可以改的是草稿與已排定）】\n${slotList}`,
    `【任務卡目錄（id｜通路｜名稱）——每一格要挑一張，id 一字不差】\n${cardList}`,
    // 2026-09-29：原本整份品牌資料截前 7,000 字——產品／活動排在最後，最先被切掉。
    // 品牌大腦本身已有容量上限（BRAIN_CAPACITY），這裡只防異常超長。
    args.brandCtx ? `【品牌資料】\n${args.brandCtx.slice(0, 24000)}` : "",
    ``,
    `排法規則：`,
    `- 產品名稱、產地、價格、活動起訖日照品牌資料寫，資料沒有的不要編；活動截止日寫確切日期，不要寫「節日前」。活動在這週之前就已經開始的，不要寫「開搶」「今天開始」這類開賣字眼。`,
    `- topic 是一句能直接寫成貼文的題目（20 字內），format 只寫形式名稱（貼文、輪播、Reels、限時動態、直播），不要加說明；reason 一句話說為什麼排這篇。`,
    `- 不要編顧客說過的話、評價或數字（「買過的人說…」要品牌資料裡真的有才能寫）；想用顧客聲音就排成「邀請顧客分享」的題目。`,
  ].filter(Boolean).join("\n");
}

export function plannerSystemPrompt(args: PlannerCtxArgs): string {
  return [
    `你是「${args.brandName}」的內容總監，負責跟使用者一起排這一週的內容。使用者是內容企劃或小公司老闆，沒時間讀長文。`,
    `說話規則：reply 最多兩句、口語、直接。改了什麼不用逐條描述（右邊的行事曆會亮起來）。`,
    `需要使用者做決定時，不要用長問句，把選項放進 choices（最多 3 個、每個 12 字內），例如「三篇風格一致」「風格差異大」。`,
    `你會從品牌一致性的角度帶使用者思考：題目、語氣要不要統一，活動與日常怎麼分配。但只在關鍵處提醒，不要每次都講。`,
    ``,
    plannerContext(args),
    ``,
    `對話規則：`,
    `1. 使用者只是打招呼或還沒說要推什麼，就先用 choices 問一個最關鍵的決定，不要自己亂排。`,
    `2. 一週不要排超過使用者要的篇數；沒指定就 4–6 篇，留白比塞滿好。`,
    `3. 分歧：這週有兩條都合理、但會讓一週長得很不一樣的路，而且使用者還沒表態時，不要自己選——填 fork，請兩位立場相反的顧問各排一版。`
      + `fork 只能是 consistency（一致調性 vs 每篇換打法）、conversion（衝單 vs 養品牌）、volume（天天出現 vs 少而精）、voice（顧客說 vs 老闆說）其中一個。`
      + `用 fork 時 ops 與 choices 留空，reply 一句話交代「這題有兩種走法，請兩位顧問各排一版」。使用者已經選了方向、只是要改一兩格、或要求你直接排，就不要用 fork。`,
    `4. 只輸出 JSON，不要前言：`,
    `{"reply":"…","choices":["…"],"fork":null,"ops":[{"op":"add","date":"YYYY-MM-DD","platform":"facebook","taskId":"…","topic":"…","format":"…","reason":"…"},{"op":"update","id":12,"topic":"…"},{"op":"remove","id":12}]}`,
  ].join("\n");
}
