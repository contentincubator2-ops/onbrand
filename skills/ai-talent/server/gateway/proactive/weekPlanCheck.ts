/**
 * weekPlanCheck — 面向「發文節奏」：這週還沒排，總監先排一版草稿，等用戶點頭。
 *
 * 用的是本週企劃同一位總監、同一套規則（weeklyPlanner 的提示詞與 validateOps），
 * 差別只在沒有人先開口。排出來的是「草稿」格子：用戶按排定才算數，按不用就整批收掉。
 *
 * ── 成本線（不是產品承諾）─────────────────────────────────────────────
 *   · 只替 21 天內有動靜的品牌排（沒人在用的品牌不花模型錢）。
 *   · 每個品牌每週最多一次；被略過不會重排。
 *   · 每位用戶每週最多 3 個品牌；一拍只排一個品牌。
 *   · 模型沒排出東西就記一次失敗，同一個品牌同一週最多試 2 次。
 *
 * 只排格子、不寫內文——寫一篇要跑整張任務卡，等用戶排定之後再做（階段 1）。
 */
import localPool from "../../localDb";
import { callModel } from "../../platform/core/llm/multiModelRouter";
import {
  addDays, applyOps, brandPlatforms, cardsFor, loadWeekCampaignItems, loadWeekSlots, mondayOf,
  parsePlannerReply, plannerSystemPrompt, validateOps, PLATFORM_ZH, type Card, type Op, type PlannerCtxArgs,
} from "../../content/core/planning/weeklyPlanner";
import { createEvent, eventExists, track } from "./proactiveStore";
import { fmtYmd, taipeiMidnight, taipeiParts } from "./proactiveTime";

export const ACTIVE_WITHIN_DAYS = 21;
export const MAX_BRANDS_PER_USER_PER_WEEK = 3;
const MAX_ATTEMPTS = 2;

/**
 * 現在該替哪一週排。週一到週三排這一週（只排今天起的日子）；週六、週日排下一週；
 * 週四、週五不排——這週剩沒幾天，下週又還太早。
 */
export function targetWeek(now: Date): { weekStart: string; fromDate: string } | null {
  const { ymd, dow } = taipeiParts(now);
  if (dow >= 1 && dow <= 3) return { weekStart: mondayOf(ymd), fromDate: ymd };
  if (dow === 6 || dow === 0) { const next = addDays(mondayOf(ymd), 7); return { weekStart: next, fromDate: next }; }
  return null;
}

export const weekKey = (brandId: number, weekStart: string) => `week:${brandId}:${weekStart}`;

/** 只留「今天起、這一週內」的新增——主動排的這一版不改、不刪用戶已經有的格子。 */
export function keepFutureAdds(ops: Op[], fromDate: string, max = 5): Op[] {
  return ops.filter((o) => o.op === "add" && o.date >= fromDate).slice(0, max);
}

export function proactiveInstruction(fromDate: string): string {
  return [
    `【這一次是你主動排】使用者這週還沒排，也還沒跟你說話。不要問問題：choices 留空陣列、fork 填 null。`,
    `直接排 3–5 篇草稿，只能排在 ${fromDate}（含）之後的日子，只用 add。`,
    `reply 用一句話說這週的主軸（30 字內），不要說「我幫你排好了」這類客套話。`,
  ].join("\n");
}

export interface Candidate { brandId: number; userId: number; brandName: string }

async function candidates(weekStart: string): Promise<Candidate[]> {
  const [rows]: any = await localPool.execute(
    `SELECT c.id, c.userId, c.name FROM (
        SELECT b.id, b.userId, b.name,
               GREATEST(
                 COALESCE((SELECT MAX(pm.createdAt) FROM planner_messages pm WHERE pm.brandId = b.id), '2000-01-01'),
                 COALESCE((SELECT MAX(m.createdAt) FROM missions m WHERE m.brandId = b.id), '2000-01-01')
               ) AS lastActive
          FROM brands b
       ) c
      WHERE c.lastActive > NOW() - INTERVAL ${ACTIVE_WITHIN_DAYS} DAY
        AND NOT EXISTS (SELECT 1 FROM planned_slots s
                         WHERE s.brandId = c.id AND s.status <> 'dismissed' AND s.slotDate >= ? AND s.slotDate < ?)
        AND NOT EXISTS (SELECT 1 FROM proactive_events e WHERE e.userId = c.userId AND e.dedupeKey = CONCAT('week:', c.id, ':', ?))
      ORDER BY c.lastActive DESC LIMIT 30`,
    [weekStart, addDays(weekStart, 7), weekStart],
  );
  return (rows as any[]).map((r) => ({ brandId: Number(r.id), userId: Number(r.userId), brandName: String(r.name ?? "") }));
}

async function plannedThisWeek(userId: number, weekStart: string): Promise<number> {
  const [rows]: any = await localPool.execute(
    `SELECT COUNT(*) AS n FROM proactive_events WHERE userId = ? AND kind = 'week_plan_ready' AND dedupeKey LIKE ?`,
    [userId, `week:%:${weekStart}`],
  );
  return Number((rows as any[])[0]?.n ?? 0);
}

// 同一個品牌同一週試過幾次（記在行程裡就夠：重啟後最多再多試兩次）。
const attempts = new Map<string, number>();

export interface WeekDraft {
  lead: string; ops: Op[]; cards: Card[];
  items: Array<{ date: string; platform: string; topic: string; format: string }>;
}

/** 請總監排一版——只算，不寫資料庫（探測與正式流程共用）。排不出來回 null。 */
export async function draftWeekFor(c: Candidate, weekStart: string, fromDate: string): Promise<WeekDraft | null> {
  const platforms = await brandPlatforms(c.brandId);
  const cards = cardsFor(platforms);
  const [slots, campaign] = await Promise.all([
    loadWeekSlots(c.brandId, weekStart),
    loadWeekCampaignItems(c.brandId, weekStart).catch(() => []),
  ]);
  const { gatherBrandContext } = await import("../../strategy/routers/strategistChatRouter");
  const brandCtx = await gatherBrandContext(c.brandId, c.userId).catch(() => "");
  const ctxArgs: PlannerCtxArgs = { brandName: c.brandName, brandCtx, weekStart, platforms, cards, slots, campaign, scheduled: [] };
  const system = `${plannerSystemPrompt(ctxArgs)}\n\n${proactiveInstruction(fromDate)}`;

  let parsed: ReturnType<typeof parsePlannerReply> = null;
  try {
    const r = await callModel([{ role: "system", content: system }, { role: "user", content: "請排這一週。" }], "general");
    parsed = parsePlannerReply(String(r.content ?? ""));
  } catch { parsed = null; }
  if (!parsed) return null;

  const ops = keepFutureAdds(validateOps({ raw: parsed.ops, weekStart, platforms, cards, slots }), fromDate);
  if (!ops.length) return null;
  const items = ops.map((o) => (o.op === "add" ? { date: o.date, platform: o.platform, topic: o.topic, format: o.format } : null))
    .filter((x): x is { date: string; platform: string; topic: string; format: string } => !!x)
    .sort((x, y) => x.date.localeCompare(y.date));
  return { lead: parsed.reply, ops, cards, items };
}

/** 替一個品牌排這一週並寫成草稿格子＋一則事件。回新增的格子數；0＝沒排出來。 */
export async function planWeekFor(c: Candidate, weekStart: string, fromDate: string): Promise<number> {
  const draft = await draftWeekFor(c, weekStart, fromDate);
  if (!draft) return 0;
  const { lead, items } = draft;
  const slotIds = await applyOps({ userId: c.userId, brandId: c.brandId, ops: draft.ops, cards: draft.cards });

  // 用戶打開本週企劃時，對話裡看得到這一版是誰排的、主軸是什麼。
  await localPool.execute(
    `INSERT INTO planner_messages (userId, brandId, role, content, meta) VALUES (?, ?, 'lead', ?, ?)`,
    [c.userId, c.brandId, `這週你還沒排，我先排了 ${items.length} 篇草稿。${lead}`, JSON.stringify({ choices: [], touched: slotIds, proactive: true })],
  ).catch(() => { /* 對話紀錄寫不進去不擋事件 */ });

  await createEvent({
    userId: c.userId, brandId: c.brandId, aspect: "rhythm", kind: "week_plan_ready",
    dedupeKey: weekKey(c.brandId, weekStart),
    title: `這週先排了 ${items.length} 篇，看一下就能排定`,
    body: [lead, ...items.map((i) => `${fmtYmd(i.date)} ${PLATFORM_ZH[i.platform] ?? i.platform}｜${i.topic}`)].join("\n"),
    payload: { weekStart, slotIds, items, lead },
    navUrl: `/planner?b=${c.brandId}&w=${weekStart}`,
    dueAt: taipeiMidnight(addDays(weekStart, 7)),
  });
  void track("created", c.userId, { kind: "week_plan_ready", aspect: "rhythm", brandId: c.brandId, slots: items.length });
  return items.length;
}

/** 一拍：挑一個該排的品牌排一版。回新增的事件數（0 或 1）。 */
export async function tickWeekPlan(now: Date): Promise<number> {
  const target = targetWeek(now);
  if (!target) return 0;
  for (const c of await candidates(target.weekStart)) {
    const key = weekKey(c.brandId, target.weekStart);
    if ((attempts.get(key) ?? 0) >= MAX_ATTEMPTS) continue;
    if ((await plannedThisWeek(c.userId, target.weekStart)) >= MAX_BRANDS_PER_USER_PER_WEEK) continue;
    if (await eventExists(c.userId, key)) continue;
    attempts.set(key, (attempts.get(key) ?? 0) + 1);
    const n = await planWeekFor(c, target.weekStart, target.fromDate);
    if (n > 0) return 1;
    // 沒排出來：這一拍就到這裡（一拍只叫一次模型），下一拍再試或換下一個品牌。
    return 0;
  }
  return 0;
}
