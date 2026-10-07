/**
 * festivalCheck — 面向「節慶檔期」：重要節點快到了、品牌還沒有對應的活動，先把方向想好。
 *
 * 節點來源跟策略層「活動」頁的年度時間軸同一份（eventCalendar）：依品牌市場算出的內建節慶
 * ＋用戶自己加的節點，扣掉用戶隱藏的。節點 ≠ 活動——這裡只提方向，按「開始企劃」才建活動。
 *
 * ── 什麼時候出現、什麼時候消失 ───────────────────────────────────────
 *   · 節點在 3–30 天內、重要度 4 以上（自建節點一律算），而且品牌沒有一檔活動蓋到那個日期。
 *   · 每個節點每年一則；用戶按「今年不做」不會再出現。
 *   · 用戶建了活動、或日期到了，這一則自己收掉。
 *
 * ── 成本線（不是產品承諾）─────────────────────────────────────────────
 *   只替 21 天內有動靜的品牌想；一拍只叫一次模型；同一個節點最多試 2 次。
 *   模型判斷「這個節點跟品牌搭不上」就不出事件——寧可不提，不要硬湊。
 */
import localPool from "../../localDb";
import { callModel } from "../../platform/core/llm/multiModelRouter";
import { getBrandMarket } from "../../strategy/core/brand/brandMarket";
import { addDays, builtinNodes, expandCustomNodes, loadNodeRows, type CalendarNode } from "../../strategy/core/entities/eventCalendar";
import { createEvent, eventExists, track, type NewProactiveEvent } from "./proactiveStore";
import { fmtYmd, taipeiMidnight, taipeiParts } from "./proactiveTime";

export const FESTIVAL_LOOKAHEAD_DAYS = 30;
export const FESTIVAL_MIN_DAYS = 3;
export const FESTIVAL_MIN_PRIORITY = 4;
/** 活動開始日落在節點前這麼多天內，就算「這個節點已經有活動在做」。 */
export const CAMPAIGN_LEAD_DAYS = 28;
const ACTIVE_WITHIN_DAYS = 21;
const MAX_ATTEMPTS = 2;

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** 視窗內、夠重要的節點。純函式。 */
export function upcomingNodes(nodes: CalendarNode[], today: string, lookahead = FESTIVAL_LOOKAHEAD_DAYS): CalendarNode[] {
  return nodes.filter((n) => {
    const d = dayDiff(today, n.date);
    return d >= FESTIVAL_MIN_DAYS && d <= lookahead && n.priority >= FESTIVAL_MIN_PRIORITY;
  });
}

export interface CampaignSpan { name: string; startAt: string | null; endAt: string | null }

/** 這個節點是不是已經有活動在做：活動期間蓋到節點當天、活動在節點前四週內開始、或名稱就寫了這個節點。純函式。 */
export function coveredByCampaign(node: CalendarNode, campaigns: CampaignSpan[]): boolean {
  const nodeEnd = node.endDate ?? node.date;
  return campaigns.some((c) => {
    if (c.name && (c.name.includes(node.nameZh) || c.name.toLowerCase().includes(node.nameEn.toLowerCase()))) {
      // 同名但明顯是別的年份（結束超過半年前）不算
      if (!c.startAt || Math.abs(dayDiff(c.startAt, node.date)) < 180) return true;
    }
    if (!c.startAt) return false;
    const end = c.endAt ?? c.startAt;
    if (c.startAt <= nodeEnd && end >= node.date) return true;
    const lead = dayDiff(c.startAt, node.date);
    return lead >= 0 && lead <= CAMPAIGN_LEAD_DAYS;
  });
}

export const festivalKey = (brandId: number, node: CalendarNode) => `festival:${brandId}:${node.key}`;

export interface FestivalIdeas { angle: string; ideas: string[] }

/** 模型回覆 → 方向。解析不了回 null；模型說搭不上回 angle 空字串。 */
export function parseFestivalIdeas(raw: string): FestivalIdeas | null {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let obj: any = null;
  try { obj = JSON.parse(cleaned); } catch {
    const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) { try { obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { obj = null; } }
  }
  if (!obj || typeof obj !== "object") return null;
  const angle = String(obj.angle ?? "").trim().slice(0, 80);
  const ideas = (Array.isArray(obj.ideas) ? obj.ideas : [])
    .map((x: unknown) => String(x ?? "").trim().slice(0, 60)).filter((x: string) => x.length >= 2).slice(0, 3);
  if (angle && !ideas.length) return null;
  return { angle, ideas };
}

export function festivalPrompt(args: { brandName: string; brandCtx: string; node: CalendarNode; daysLeft: number }): string {
  return [
    `你是「${args.brandName}」的內容總監。${args.node.nameZh}在 ${args.node.date}，還有 ${args.daysLeft} 天。`,
    `使用者還沒替這個節點開活動。請根據品牌資料，先想好這一檔可以怎麼做，讓他一眼決定要不要做。`,
    ``,
    `規則：`,
    `- 只能用品牌資料裡有的產品、賣點與事實。不要編折扣、價格、贈品、名額、活動期間——資料沒寫的促銷一律不寫。`,
    `- angle 是一句話的主軸（30 字內），要說得出為什麼是這個品牌來做，不是任何品牌都能套的節慶祝賀。`,
    `- ideas 是 3 個可以直接寫成貼文的題目（各 20 字內），三個的切入點要不一樣。`,
    `- 這個節點跟品牌真的搭不上（硬做會很尷尬），就回 {"angle":"","ideas":[]}。`,
    `- 只輸出 JSON，不要前言：{"angle":"…","ideas":["…","…","…"]}`,
    ``,
    args.brandCtx ? `【品牌資料】\n${args.brandCtx.slice(0, 24000)}` : `【品牌資料】（沒有）`,
  ].join("\n");
}

export async function draftFestivalIdeas(brand: { brandId: number; userId: number; brandName: string }, node: CalendarNode, today: string): Promise<FestivalIdeas | null> {
  const { gatherBrandContext } = await import("../../strategy/routers/strategistChatRouter");
  const brandCtx = await gatherBrandContext(brand.brandId, brand.userId).catch(() => "");
  try {
    const r = await callModel([
      { role: "system", content: festivalPrompt({ brandName: brand.brandName, brandCtx, node, daysLeft: dayDiff(today, node.date) }) },
      { role: "user", content: "請開始。" },
    ], "general");
    return parseFestivalIdeas(String(r.content ?? ""));
  } catch { return null; }
}

/** 純函式：節點＋方向 → 事件。 */
export function festivalEvent(brand: { brandId: number; userId: number }, node: CalendarNode, ideas: FestivalIdeas, today: string): NewProactiveEvent {
  const daysLeft = dayDiff(today, node.date);
  const q = new URLSearchParams({ b: String(brand.brandId), cat: "events", plan: node.nameZh, ps: node.date });
  if (node.endDate) q.set("pe", node.endDate);
  return {
    userId: brand.userId, brandId: brand.brandId, aspect: "festival", kind: "festival_node",
    dedupeKey: festivalKey(brand.brandId, node),
    title: `${node.nameZh}還有 ${daysLeft} 天，方向先想好了`,
    body: [`${fmtYmd(node.date)}｜${ideas.angle}`, ...ideas.ideas.map((i) => `・${i}`)].join("\n"),
    payload: { nodeKey: node.key, name: node.nameZh, date: node.date, endDate: node.endDate, angle: ideas.angle, ideas: ideas.ideas },
    navUrl: `/brands/edit?${q.toString()}`,
    dueAt: taipeiMidnight(node.date),
  };
}

export interface FestivalBrand { brandId: number; userId: number; brandName: string }

export async function activeBrands(): Promise<FestivalBrand[]> {
  const [rows]: any = await localPool.execute(
    `SELECT b.id, b.userId, b.name FROM brands b
      WHERE EXISTS (SELECT 1 FROM missions m WHERE m.brandId = b.id AND m.createdAt > NOW() - INTERVAL ${ACTIVE_WITHIN_DAYS} DAY)
         OR EXISTS (SELECT 1 FROM planner_messages pm WHERE pm.brandId = b.id AND pm.createdAt > NOW() - INTERVAL ${ACTIVE_WITHIN_DAYS} DAY)
      ORDER BY b.id DESC LIMIT 200`,
  );
  return (rows as any[]).map((r) => ({ brandId: Number(r.id), userId: Number(r.userId), brandName: String(r.name ?? "") }));
}

const toYmd = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return new Date(v.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/** 這個品牌現在「該提、還沒有活動」的節點。 */
export async function openNodesFor(brandId: number, today: string, lookahead = FESTIVAL_LOOKAHEAD_DAYS): Promise<CalendarNode[]> {
  const to = addDays(today, lookahead + 1);
  const [{ targetCountry }, { custom, hidden }, [evRows]] = await Promise.all([
    getBrandMarket(brandId), loadNodeRows(brandId),
    localPool.execute(`SELECT name, startAt, endAt FROM events WHERE brandId = ?`, [brandId]) as Promise<any>,
  ]);
  const nodes = [
    ...builtinNodes(targetCountry, today, to).filter((n) => !hidden.has(n.builtinKey!)),
    ...expandCustomNodes(custom, today, to),
  ];
  const campaigns: CampaignSpan[] = (evRows as any[]).map((e) => ({ name: String(e.name ?? ""), startAt: toYmd(e.startAt), endAt: toYmd(e.endAt) }));
  return upcomingNodes(nodes, today, lookahead).filter((n) => !coveredByCampaign(n, campaigns));
}

const attempts = new Map<string, number>();

/**
 * 一拍：算出所有還成立的節點（給 resolveGone 用），並替其中一個還沒提過的想方向。
 * 回 { created, stillTrue }。
 */
export async function tickFestival(now: Date): Promise<{ created: number; stillTrue: Set<string> }> {
  const today = taipeiParts(now).ymd;
  const stillTrue = new Set<string>();
  let created = 0;
  let spent = false;
  for (const b of await activeBrands()) {
    let nodes: CalendarNode[] = [];
    try { nodes = await openNodesFor(b.brandId, today); } catch { continue; }
    for (const n of nodes) {
      const key = festivalKey(b.brandId, n);
      stillTrue.add(`${b.userId}|${key}`);
      if (spent || (attempts.get(key) ?? 0) >= MAX_ATTEMPTS) continue;
      if (await eventExists(b.userId, key)) continue;
      attempts.set(key, (attempts.get(key) ?? 0) + 1);
      spent = true;
      const ideas = await draftFestivalIdeas(b, n, today);
      if (!ideas) continue;
      if (!ideas.angle) { attempts.set(key, MAX_ATTEMPTS); continue; } // 搭不上：這個節點今年不提
      if (await createEvent(festivalEvent(b, n, ideas, today))) {
        created++;
        void track("created", b.userId, { kind: "festival_node", aspect: "festival", brandId: b.brandId, node: n.key });
      }
    }
  }
  return { created, stillTrue };
}
