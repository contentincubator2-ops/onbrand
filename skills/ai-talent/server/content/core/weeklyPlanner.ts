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
import localPool from "../../localDb";
import { candidateCards } from "../../strategy/core/campaignPlan";

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
  email: "email", pr: "pr", x: "x", web: "website",
};
export const PLATFORM_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok",
  email: "電子報", pr: "新聞稿", x: "X", website: "官網",
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

/** 模型回覆：{"reply","choices","ops"}；解析失敗回 null。 */
export function parsePlannerReply(raw: string): { reply: string; choices: string[]; ops: unknown[] } | null {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let obj: any = null;
  try { obj = JSON.parse(cleaned); } catch {
    const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) { try { obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { obj = null; } }
  }
  if (!obj || typeof obj !== "object") return null;
  const reply = str(obj.reply, 300);
  if (!reply) return null;
  const choices = (Array.isArray(obj.choices) ? obj.choices : []).map((c: unknown) => str(c, 24)).filter((c: string) => c.length >= 2).slice(0, 3);
  return { reply, choices, ops: Array.isArray(obj.ops) ? obj.ops : [] };
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
  const out = ids.map((id) => NAV_TO_PLATFORM[id]).filter(Boolean) as string[];
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
  return (rows as any[]).map(rowToSlot);
}

export interface CampaignSlot {
  eventId: number; eventName: string; itemId: string; date: string; platform: string;
  taskId: string; taskLabel: string; angle: string; outputId: number | null;
}
/** 這一週裡，品牌各活動企劃排到的格子（活動企劃存在 events.positioning.campaignPlan）。 */
export async function loadWeekCampaignItems(brandId: number, weekStart: string): Promise<CampaignSlot[]> {
  const end = addDays(weekStart, 7);
  const [rows]: any = await localPool.execute(`SELECT id, name, positioning FROM events WHERE brandId = ?`, [brandId]);
  const out: CampaignSlot[] = [];
  for (const e of rows as any[]) {
    const plan = parse(e.positioning)?.campaignPlan;
    for (const it of Array.isArray(plan?.items) ? plan.items : []) {
      if (it?.enabled === false) continue;
      const date = String(it?.date ?? "");
      if (!isYmd(date) || date < weekStart || date >= end) continue;
      out.push({
        eventId: Number(e.id), eventName: String(e.name ?? ""), itemId: String(it.id), date,
        platform: String(it.platform ?? ""), taskId: String(it.taskId ?? ""), taskLabel: String(it.taskLabel ?? ""),
        angle: String(it.angle ?? ""), outputId: it.outputId ? Number(it.outputId) : null,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
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

export function plannerSystemPrompt(args: {
  brandName: string; brandCtx: string; weekStart: string; platforms: string[]; cards: Card[];
  slots: SlotRow[]; campaign: CampaignSlot[]; scheduled: Array<{ date: string; platform: string; title: string }>;
}): string {
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
    `你是「${args.brandName}」的內容總監，負責跟使用者一起排這一週的內容。使用者是內容企劃或小公司老闆，沒時間讀長文。`,
    `說話規則：reply 最多兩句、口語、直接。改了什麼不用逐條描述（右邊的行事曆會亮起來）。`,
    `需要使用者做決定時，不要用長問句，把選項放進 choices（最多 3 個、每個 12 字內），例如「三篇風格一致」「風格差異大」。`,
    `你會從品牌一致性的角度帶使用者思考：題目、語氣要不要統一，活動與日常怎麼分配。但只在關鍵處提醒，不要每次都講。`,
    ``,
    `【這一週】${days.map((d) => `${d.date}（${d.label}）`).join("、")}`,
    `【品牌加入的通路】${args.platforms.map((p) => `${p}（${PLATFORM_ZH[p] ?? p}）`).join("、")}——只能排在這些通路。`,
    `【這週已經有的內容，不要重複排】\n已排程／已發布：\n${schedList}\n活動企劃：\n${campList}`,
    `【你排的格子（可以改的是草稿與已排定）】\n${slotList}`,
    `【任務卡目錄（id｜通路｜名稱）——每一格要挑一張，id 一字不差】\n${cardList}`,
    args.brandCtx ? `【品牌資料】\n${args.brandCtx.slice(0, 7000)}` : "",
    ``,
    `規則：`,
    `1. 產品名稱、產地、價格、活動起訖日照品牌資料寫，資料沒有的不要編；活動截止日寫確切日期，不要寫「節日前」。`,
    `2. 使用者只是打招呼或還沒說要推什麼，就先用 choices 問一個最關鍵的決定，不要自己亂排。`,
    `3. 一週不要排超過使用者要的篇數；沒指定就 4–6 篇，留白比塞滿好。`,
    `4. topic 是一句能直接寫成貼文的題目（20 字內），format 是形式（貼文、輪播、Reels、限時動態…），reason 一句話說為什麼排這篇。`,
    `5. 只輸出 JSON，不要前言：`,
    `{"reply":"…","choices":["…"],"ops":[{"op":"add","date":"YYYY-MM-DD","platform":"facebook","taskId":"…","topic":"…","format":"…","reason":"…"},{"op":"update","id":12,"topic":"…"},{"op":"remove","id":12}]}`,
  ].filter(Boolean).join("\n");
}
