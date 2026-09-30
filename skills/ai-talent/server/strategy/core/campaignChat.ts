/**
 * campaignChat — 在策略層活動頁跟「內容企劃」用對話改企劃。
 *
 * 2026-09-30（CJ「策略層的討論到某個方案時…用對話的方式，看是否要增加其他管道宣傳，
 * 或是依照該策略，用對話的方式，將執行計畫完成」→ 選了 Tesla 分割畫面，對話卡在左下）。
 *
 * ── 對話只出提案，不直接改 ───────────────────────────────────────────
 * 跟本週企劃的總主管同一條紀律（weeklyPlanner.validateOps）：模型只能回 add／update／
 * remove 三種操作，伺服器逐條檢查後變成「提案」回給畫面；使用者按「套用」才經由
 * savePlan 寫進企劃（定稿後 savePlan 會擋，所以定稿後的對話也不可能改到企劃）。
 *
 *   · add：階段要是真的階段；日期在活動期間前後（前 14 天可以預熱、後 7 天可以返場）；
 *     通路是前台的七個之一；任務卡要是那個通路真的有的，不是就換成預設卡並標 repaired。
 *   · update／remove：只能動還沒寫的那幾篇——寫好的換掉，成品就跟企劃對不上了。
 *   · 訊息（每一段、一句話訴求）可以一起提，但只收企劃裡有的段。
 */
import { candidateCards, eventFacts, safeJSON, PLANNABLE_CHANNELS, CAMPAIGN_PHASE_IDS, type CampaignPlan, type CampaignPhaseId, type PlanItem } from "./campaignPlan.js";
import type { CatalogTask } from "../../content/core/taskCatalogIndex.js";

export type CampaignOp =
  | { op: "add"; item: PlanItem }
  | { op: "update"; id: string; patch: Partial<Pick<PlanItem, "angle" | "date" | "enabled" | "platform" | "taskId" | "taskLabel" | "repaired">> }
  | { op: "remove"; id: string };

export interface CampaignProposal {
  ops: CampaignOp[];
  phaseMessages?: Partial<Record<CampaignPhaseId, string>>;
  smp?: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

function pickCard(platform: string, taskId: unknown, cards: CatalogTask[]): { card: CatalogTask | null; repaired: boolean } {
  const own = cards.filter((c) => c.platform === platform);
  const exact = own.find((c) => c.id === String(taskId ?? ""));
  if (exact) return { card: exact, repaired: false };
  return { card: own.find((c) => c.tier === "30s") ?? own[0] ?? null, repaired: true };
}

/** 模型回的東西 → 可以套用的提案。純函式，規則見檔頭。 */
export function validateCampaignOps(args: {
  raw: any;
  plan: CampaignPlan;
  cards: CatalogTask[];
  window: { from: string; to: string };
  newId?: (phase: string, date: string, n: number) => string;
}): CampaignProposal {
  const { plan, cards, window } = args;
  const byId = new Map(plan.items.map((i) => [i.id, i]));
  const editable = (id: string) => { const it = byId.get(id); return it && !it.outputId ? it : null; };
  const inWindow = (d: string) => YMD.test(d) && d >= window.from && d <= window.to;
  const newId = args.newId ?? ((phase, date, n) => `${phase}-${date}-c${Date.now().toString(36)}${n}`);
  const ops: CampaignOp[] = [];
  const touched = new Set<string>();

  for (const o of Array.isArray(args.raw?.ops) ? args.raw.ops : []) {
    if (ops.length >= 14) break;
    const kind = String(o?.op ?? "");
    if (kind === "add") {
      const phase = String(o?.phase ?? "");
      const date = String(o?.date ?? "");
      const platform = String(o?.platform ?? "").toLowerCase();
      const angle = str(o?.angle, 200);
      if (!(CAMPAIGN_PHASE_IDS as readonly string[]).includes(phase)) continue;
      if (!inWindow(date) || !(PLANNABLE_CHANNELS as readonly string[]).includes(platform) || angle.length < 4) continue;
      const { card, repaired } = pickCard(platform, o?.taskId, cards);
      if (!card) continue;
      ops.push({
        op: "add",
        item: {
          id: newId(phase, date, ops.length), phase: phase as CampaignPhaseId, date, platform,
          taskId: card.id, taskLabel: card.labelZh || card.labelEn || card.id, angle,
          enabled: true, outputId: null, scheduledAt: null, ...(repaired ? { repaired: true } : {}),
        },
      });
    } else if (kind === "update") {
      const id = String(o?.id ?? "");
      const cur = editable(id);
      if (!cur || touched.has(id)) continue;
      const patch: Extract<CampaignOp, { op: "update" }>["patch"] = {};
      const angle = str(o?.angle, 200);
      if (angle.length >= 4 && angle !== cur.angle) patch.angle = angle;
      if (o?.date != null && inWindow(String(o.date)) && String(o.date) !== cur.date) patch.date = String(o.date);
      if (typeof o?.enabled === "boolean" && o.enabled !== cur.enabled) patch.enabled = o.enabled;
      const platform = o?.platform != null ? String(o.platform).toLowerCase() : "";
      if (platform && platform !== cur.platform && (PLANNABLE_CHANNELS as readonly string[]).includes(platform)) {
        const { card, repaired } = pickCard(platform, o?.taskId, cards);
        if (card) Object.assign(patch, { platform, taskId: card.id, taskLabel: card.labelZh || card.labelEn || card.id, repaired });
      } else if (o?.taskId != null && String(o.taskId) !== cur.taskId) {
        const card = cards.find((c) => c.platform === cur.platform && c.id === String(o.taskId));
        if (card) Object.assign(patch, { taskId: card.id, taskLabel: card.labelZh || card.labelEn || card.id, repaired: false });
      }
      if (Object.keys(patch).length) { ops.push({ op: "update", id, patch }); touched.add(id); }
    } else if (kind === "remove") {
      const id = String(o?.id ?? "");
      if (editable(id) && !touched.has(id)) { ops.push({ op: "remove", id }); touched.add(id); }
    }
  }

  // 訊息只收套用之後企劃裡還有的段。
  const removed = new Set(ops.filter((o) => o.op === "remove").map((o) => (o as any).id));
  const phasesAfter = new Set<string>([
    ...plan.items.filter((i) => !removed.has(i.id)).map((i) => i.phase),
    ...ops.filter((o) => o.op === "add").map((o) => (o as any).item.phase),
  ]);
  const out: CampaignProposal = { ops };
  if (args.raw?.phaseMessages && typeof args.raw.phaseMessages === "object") {
    const pm: Partial<Record<CampaignPhaseId, string>> = {};
    for (const id of CAMPAIGN_PHASE_IDS) {
      const m = str(args.raw.phaseMessages[id], 60);
      if (m && phasesAfter.has(id) && m !== plan.phaseMessages?.[id]) pm[id] = m;
    }
    if (Object.keys(pm).length) out.phaseMessages = pm;
  }
  const smp = str(args.raw?.smp, 60);
  if (smp && smp !== plan.smp) out.smp = smp;
  return out;
}

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

const SYSTEM = `你是這檔活動的內容企劃。策略（一句話訴求、主角、每一段的訊息）是策略總監跟使用者談定的，寫在下面；你負責把它排成可以執行的貼文——哪一天、哪個通路、用哪張任務卡、這一篇講什麼。

鐵則：
- 只能用操作改企劃：add（加一篇）、update（改一篇）、remove（刪一篇）。不要重寫整份。
- taskId 必須逐字抄自候選任務卡清單，而且要是那個通路的卡。
- 日期格式 YYYY-MM-DD，而且要在允許的日期範圍內。
- 標了（已寫）的那幾篇不能改、不能刪。
- 不准編使用者沒給的數字、成效、顧客見證、名額限制或網址。
- 使用者只是在問問題、還沒要你改，ops 就回空陣列，用 reply 回答。
- 要改一句話訴求或某一段的訊息，才填 smp／phaseMessages；沒要改就不要填。
- reply 用繁體中文一到三句：你打算改什麼、為什麼。不要列清單，清單畫面會自己列。
- 只輸出 JSON，不要任何說明文字。`;

const PHASE_ZH: Record<string, string> = { teaser: "預熱", launch: "開賣", sustain: "加溫", lastcall: "倒數", encore: "返場" };

/** 跟內容企劃說一句話 → 回覆＋提案（還沒套用）。 */
export async function runCampaignChat(args: {
  eventId: number;
  userId: number;
  plan: CampaignPlan;
  message: string;
  phase?: CampaignPhaseId | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ reply: string; proposal: CampaignProposal }> {
  const facts = await eventFacts(args.eventId, args.userId);
  if (!facts) throw new Error("找不到這個活動");
  const today = new Date(ymd(new Date()));
  const start = facts.startAt ? new Date(ymd(facts.startAt)) : today;
  const end = facts.endAt ? new Date(ymd(facts.endAt)) : new Date(start.getTime() + 30 * DAY);
  const window = {
    from: ymd(new Date(Math.max(today.getTime(), start.getTime() - 14 * DAY))),
    to: ymd(new Date(end.getTime() + 7 * DAY)),
  };
  const cards = candidateCards([...PLANNABLE_CHANNELS]);
  const menu = PLANNABLE_CHANNELS
    .flatMap((p) => cards.filter((c) => c.platform === p).slice(0, 30))
    .map((c) => `- ${c.id}｜${c.platform}｜${c.labelZh || c.labelEn}`).join("\n");
  const planLines = [...args.plan.items]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((i) => `- ${i.id}｜${PHASE_ZH[i.phase] ?? i.phase}｜${i.date}｜${i.platform}｜${i.taskLabel}｜${i.angle}${i.outputId ? "（已寫）" : ""}${i.enabled ? "" : "（這篇不做）"}`)
    .join("\n");
  const pm = args.plan.phaseMessages ?? {};
  const pmLines = CAMPAIGN_PHASE_IDS.filter((id) => pm[id]).map((id) => `- ${PHASE_ZH[id]}（${id}）：${pm[id]}`).join("\n");
  const history = (args.history ?? []).slice(-8)
    .map((h) => `${h.role === "user" ? "使用者" : "你"}：${String(h.content).slice(0, 600)}`).join("\n");

  const user = [
    `【活動】${facts.name}（${facts.startAt ? ymd(facts.startAt) : "?"} ~ ${facts.endAt ? ymd(facts.endAt) : "?"}）`,
    `【優惠機制／活動內容】${facts.settings.mechanic || "（沒寫）"}`,
    `【一句話訴求】${args.plan.smp}`,
    pmLines ? `【每一段的訊息】\n${pmLines}` : "",
    `【允許的日期範圍】${window.from} ~ ${window.to}`,
    `【可以用的通路】${PLANNABLE_CHANNELS.join("、")}`,
    args.phase ? `【使用者正在看】${PHASE_ZH[args.phase]}期（${args.phase}）——沒特別說的話，指的是這一段` : "",
    `【目前的企劃（id｜階段｜日期｜通路｜任務卡｜要講什麼）】\n${planLines}`,
    `【候選任務卡（只能從這裡挑）】\n${menu}`,
    history ? `【前面的對話】\n${history}` : "",
    `【使用者現在說】${args.message.trim()}`,
    "",
    "只輸出 JSON，鍵名固定如下：",
    `{"reply":"一到三句","ops":[{"op":"add","phase":"sustain","date":"YYYY-MM-DD","platform":"instagram","taskId":"逐字抄自候選清單","angle":"這一篇要講什麼（20-45字）"},{"op":"update","id":"企劃裡的 id","angle":"…","date":"…","enabled":true},{"op":"remove","id":"企劃裡的 id"}],"phaseMessages":{"sustain":"只有要改才填"},"smp":"只有要改才填"}`,
  ].filter(Boolean).join("\n");

  const { buildBrandPrefix } = await import("./brandContext.js");
  const brain = await buildBrandPrefix(facts.brandId, null, args.eventId, "full").catch(() => "");
  const { invokeLLM } = await import("../../platform/core/llm.js");
  const r = await invokeLLM({
    messages: [
      { role: "system", content: brain ? `${SYSTEM}\n\n# 品牌大腦${brain}` : SYSTEM },
      { role: "user", content: user },
    ],
    maxTokens: 1800,
  });
  const text = String(r.choices?.[0]?.message?.content ?? "");
  const parsed = safeJSON<any>(text, null);
  if (!parsed) throw new Error("內容企劃的回覆讀不懂，請換個說法再試一次");
  const proposal = validateCampaignOps({ raw: parsed, plan: args.plan, cards, window });
  const reply = str(parsed?.reply, 400) || (proposal.ops.length ? "我照你說的改了，看一下下面的提案。" : "了解。");
  return { reply, proposal };
}
