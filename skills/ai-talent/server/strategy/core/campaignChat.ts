/**
 * campaignChat — 在策略層活動頁跟「內容企劃」用對話改企劃。
 *
 * 2026-09-30（CJ「策略層的討論到某個方案時…用對話的方式，看是否要增加其他管道宣傳，
 * 或是依照該策略，用對話的方式，將執行計畫完成」→ 選了 Tesla 分割畫面，對話卡在左下）。
 *
 * ── 模型只能回操作，伺服器逐條檢查 ─────────────────────────────────────
 * 跟本週企劃的總主管同一條紀律（weeklyPlanner.validateOps）：模型只能回 add／update／
 * remove 三種操作，伺服器逐條檢查後才回給畫面；畫面經由 savePlan 寫進企劃（定稿後
 * savePlan 會擋，所以定稿後的對話也不可能改到企劃）。
 * 2026-09-30 起畫面拿到就寫（不再等「套用」），留「復原」——見下面 CJ 那段。
 *
 *   · add：階段要是真的階段；日期在活動期間前後（前 14 天可以預熱、後 7 天可以返場）；
 *     通路是前台的七個之一；任務卡要是那個通路真的有的，不是就換成預設卡並標 repaired。
 *   · update／remove：只能動還沒寫的那幾篇——寫好的換掉，成品就跟企劃對不上了。
 *   · 訊息（每一段、一句話訴求）可以一起提，但只收企劃裡有的段。
 */
import { candidateCards, eventFacts, safeJSON, PLANNABLE_CHANNELS, CAMPAIGN_PHASE_IDS, type CampaignPlan, type CampaignPhaseId, type PlanItem } from "./campaignPlan.js";
import type { CatalogTask } from "../../content/core/taskCatalogIndex.js";
import { pickPlannerAgent, brandIndustry, type TeamAgent } from "./campaignTeam.js";
import { getDirectorByAgentId, listDirectorsForBrand } from "./strategistDirectory.js";
import localPool from "../../localDb.js";
import { validateBasis, basisLines, type BasisPatch } from "./campaignBasis.js";

/**
 * 2026-09-30（CJ「在這個介面上，我偏好是都在左邊完成回答，雖然要換人，但也在同一個地方
 * 換人，並且要掌握之前討論的脈絡。最大的驚喜，就是我跟 agent 講完後，圖上的訴求或是
 * 行事曆就會修改」）：
 *   · 左邊同一張對話卡裡有兩個人：內容企劃（怎麼排）與策略總監（方向：一句話訴求、
 *     各段訊息）。內容企劃遇到方向問題就把話轉給總監，總監在同一串裡接著回答。
 *   · 兩人讀的是同一串對話（標了誰說的）；總監另外讀得到他在右下角跟使用者談過的最近幾則。
 *   · 改法照舊經過 validateCampaignOps 檢查，但畫面不再等「套用」——回覆一到就寫進企劃，
 *     留一顆「復原」。
 */
export type CampaignSpeaker = "planner" | "director";
export interface CampaignChatTurn { role: "user" | "assistant"; content: string; speaker?: CampaignSpeaker; name?: string }

/** 活動頁的策略總監：使用者在右下角選過的那一位（品牌那一組），沒選過就是第一位。 */
export async function pickCampaignDirector(brandId: number, agentId?: number | null): Promise<TeamAgent | null> {
  const industry = await brandIndustry(brandId);
  const d = (agentId ? await getDirectorByAgentId(agentId, industry).catch(() => null) : null)
    ?? (await listDirectorsForBrand(industry, "brand").catch(() => []))[0] ?? null;
  return d ? { id: d.agentId, slug: d.slug, name: d.name, title: d.title, avatarUrl: d.avatarUrl } : null;
}

/** 總監在右下角跟使用者談過的最近幾則（目前那一串），讓左邊接得上。讀不到就空字串。 */
async function directorThread(userId: number, brandId: number, agentId: number): Promise<string> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT m.role, m.content FROM strategist_messages m
         JOIN strategist_conversations c ON c.id = m.conversationId
        WHERE c.userId = ? AND c.brandId = ? AND c.agentId = ? AND c.status = 'open'
        ORDER BY m.id DESC LIMIT 6`,
      [userId, brandId, agentId],
    );
    return (rows as any[]).reverse()
      .map((r) => `${r.role === "user" ? "使用者" : "你"}：${String(r.content ?? "").replace(/\s+/g, " ").slice(0, 500)}`)
      .join("\n");
  } catch {
    return "";
  }
}

export type CampaignOp =
  | { op: "add"; item: PlanItem }
  | { op: "update"; id: string; patch: Partial<Pick<PlanItem, "angle" | "date" | "enabled" | "platform" | "taskId" | "taskLabel" | "repaired">> }
  | { op: "remove"; id: string };

export interface CampaignProposal {
  ops: CampaignOp[];
  phaseMessages?: Partial<Record<CampaignPhaseId, string>>;
  smp?: string;
  /** 策略依據（11 段活動定位）的改法：路徑（段.欄位）→ 新值。只有策略總監會給。 */
  basis?: BasisPatch;
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

/**
 * 模型的回覆 → { reply, ops, phaseMessages, askDirector }。純函式。
 *
 * 2026-09-30（CJ「我請內容企劃調整方向，結果她回復：內容企劃的回覆讀不懂」）：
 * 「每一段都改」這種要求會一次回十幾條操作，回覆超過長度上限被截斷，JSON 不完整就
 * 整份丟掉。現在先照常解析；解析不了就把**完整的那幾條操作**救回來（truncated=true，
 * 畫面會說「只來得及提出前幾條」）；連 JSON 都沒有，就把文字當成一般回答。
 */
export function parseChatReply(text: string): { reply: string; ops: any[]; phaseMessages?: any; smp?: string; basis?: any; askDirector?: string; truncated: boolean } | null {
  const raw = String(text ?? "");
  const whole = safeJSON<any>(raw, null);
  if (whole && typeof whole === "object") {
    return {
      reply: String(whole.reply ?? ""), ops: Array.isArray(whole.ops) ? whole.ops : [],
      phaseMessages: whole.phaseMessages, askDirector: typeof whole.askDirector === "string" ? whole.askDirector : undefined,
      smp: typeof whole.smp === "string" ? whole.smp : undefined,
      ...(whole.basis && typeof whole.basis === "object" ? { basis: whole.basis } : {}),
      truncated: false,
    };
  }
  const start = raw.indexOf("{");
  if (start < 0) return raw.trim() ? { reply: raw.trim().slice(0, 400), ops: [], truncated: false } : null;
  const replyM = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  let reply = "";
  if (replyM) { try { reply = JSON.parse(`"${replyM[1]}"`); } catch { reply = replyM[1]!; } }
  const ops: any[] = [];
  const opsAt = raw.search(/"ops"\s*:\s*\[/);
  if (opsAt >= 0) {
    let i = raw.indexOf("[", opsAt) + 1;
    while (i < raw.length) {
      const open = raw.indexOf("{", i);
      if (open < 0) break;
      // 找到這個物件的結尾（略過字串裡的括號）
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let k = open; k < raw.length; k++) {
        const ch = raw[k]!;
        if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { end = k; break; } }
      }
      if (end < 0) break;                         // 被截斷的最後一條：丟掉
      try { ops.push(JSON.parse(raw.slice(open, end + 1))); } catch { /* 壞的那條跳過 */ }
      i = end + 1;
      const next = raw.slice(i).match(/^\s*([,\]])/);
      if (!next || next[1] === "]") break;
    }
  }
  if (!reply && !ops.length) return null;
  return { reply, ops, truncated: true };
}

const SYSTEM = `你是這檔活動的內容企劃。策略（一句話訴求、主角、每一段的訊息）是策略總監跟使用者談定的，寫在下面；你負責把它排成可以執行的貼文——哪一天、哪個通路、用哪張任務卡、這一篇講什麼。

鐵則：
- 只能用操作改企劃：add（加一篇）、update（改一篇）、remove（刪一篇）。不要重寫整份。
- taskId 必須逐字抄自候選任務卡清單，而且要是那個通路的卡。
- 日期格式 YYYY-MM-DD，而且要在允許的日期範圍內。
- 標了（已寫）的那幾篇不能改、不能刪。
- 不准編使用者沒給的數字、成效、顧客見證、名額限制或網址。
- 使用者只是在問問題、還沒要你改，ops 就回空陣列，用 reply 回答。
- 你可以改某一段的訊息（phaseMessages），那是執行層的說法；沒要改就不要填。
- 一句話訴求、主角、目標客群、定位這類「方向」的問題不是你改的——那是策略總監的工作，他就在同一個對話裡。使用者問到這些時，ops 回空陣列，reply 一句話說你請總監來回答，並在 askDirector 寫一句要請策略總監回答的問題（把使用者的原意帶過去）。
- 前面的對話裡策略總監已經定下的方向，照著排，不要再改回去。
- kol 是網紅合作那條線、cobrand 是異業合作那條線：排的是品牌要做的事（邀約、提案、brief、追蹤、分工、聯合公告…），不是品牌自己發的貼文；任務卡一樣只能挑那個通路的卡。
- ops 最多 12 條，每條 angle 20–45 字；使用者要改很多篇時，先改最重要的 12 篇，reply 說明其餘下一輪再改。
- reply 用繁體中文一到三句：你打算改什麼、為什麼。不要列清單，清單畫面會自己列。不要寫企劃的 id，要指某一篇就說日期和通路。
- 只輸出 JSON，不要任何說明文字。`;

// 「逐篇掃」那一條：2026-09-30 dev 實測，總監拿掉「免費」時改了 6 篇、漏了官網公告頁那篇。
const DIRECTOR_SYSTEM = `你是這檔活動的策略總監，跟內容企劃在同一個對話裡。你管方向：一句話訴求（smp）、每一段要讓人記住的那句話（phaseMessages）、對誰說、主角是誰。內容企劃管怎麼排。

使用者或內容企劃把方向的問題交給你。你要做決定，而且直接改進企劃——使用者講完，畫面上的訴求就會變：
- 方向確定了，就填 smp（20 字內為佳、最多 40 字）與受影響的 phaseMessages（每段一句、最多 40 字）。
- 方向一改，原本講法對不上的那幾篇（例如訴求拿掉「免費」，切角還寫著免費的那幾篇），用 update 改它們的 angle（20–45 字）。標了（已寫）的不能動。
- 改之前把【目前的企劃】從第一篇到最後一篇逐篇掃一次，每個通路（官網、電子報、LINE 也算）都要看；對不上新方向的一篇都不能漏。
- 真的缺一個只有使用者知道的事實才能決定時（例如這次是要註冊還是預約），先用最合理的假設改好，reply 最後問那一個問題。不要只丟選項給使用者挑。
- 不准編使用者沒給的數字、成效、顧客見證、名額限制或網址。
- 加篇、刪篇、換通路、換日期是內容企劃的事；除非使用者明講，否則不要動。
- 策略依據（活動定位 11 段：受眾、洞察、目標、SMP、訊息架構、創意、語氣與禁用元素…）也歸你管。使用者在看策略依據、或要改的是這些時，用 basis 改，鍵是【策略依據】列出的路徑（例如 audience.keyInsight），清單型的欄位給字串陣列。只改要改的格子。
- 一句話訴求（smp）跟策略依據的 SMP 是同一件事的兩個說法：改了其中一個，另一個對不上就一起改。
- reply 用繁體中文兩到四句，口語、不要條列、不要 markdown 粗體：你決定了什麼、為什麼。改了什麼畫面會自己列。reply 裡不要寫企劃的 id，要指某一篇就說日期和通路（例如「11/01 的 Facebook」）。
- 清單型的欄位（例如禁用元素）給完整的新清單：原本的項目逐字保留，只加或刪你要改的那幾項。
- 只輸出 JSON，不要任何說明文字。`;

const PHASE_ZH: Record<string, string> = { teaser: "預熱", launch: "開賣", sustain: "加溫", lastcall: "倒數", encore: "返場" };

const CHANNEL_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", threads: "Threads", line: "LINE", tiktok: "TikTok", email: "電子報", website: "官網",
};

/**
 * 回覆裡的企劃 id（launch-2026-11-01-2）換成人看得懂的「11/01 Facebook」。
 * 2026-10-01 dev 實測：總監回覆寫了「teaser-2026-10-27-0 沒碰到免費二字」。提示詞也要求了
 * 不要寫 id，這裡是保險。純函式。
 */
export function humanizeIds(reply: string, plan: Pick<CampaignPlan, "items">): string {
  const byId = new Map(plan.items.map((i) => [i.id, i]));
  return reply.replace(/\b(?:teaser|launch|sustain|lastcall|encore)-\d{4}-\d{2}-\d{2}-[a-z0-9]+\b/g, (id) => {
    const it = byId.get(id);
    if (!it) return "那一篇";
    return `${it.date.slice(5).replace("-", "/")} ${CHANNEL_ZH[it.platform] ?? it.platform}`;
  });
}

/** 跟內容企劃或策略總監說一句話 → 回覆＋改法（已檢查；畫面拿到就寫進企劃）。 */
export async function runCampaignChat(args: {
  eventId: number;
  userId: number;
  plan: CampaignPlan;
  message: string;
  phase?: CampaignPhaseId | null;
  history?: CampaignChatTurn[];
  /** 誰回答；預設內容企劃。 */
  speaker?: CampaignSpeaker;
  /** 策略總監是哪一位（右下角選過的那位）。 */
  directorAgentId?: number | null;
  /** 這句是內容企劃轉給總監的，不是使用者親口說的。 */
  handoff?: boolean;
  /** 活動的 positioning（策略依據從這裡讀）。 */
  positioning?: Record<string, any> | null;
  /** 使用者右邊正在看的：企劃地圖或策略依據。 */
  view?: "map" | "basis";
}): Promise<{ reply: string; proposal: CampaignProposal; askDirector: string | null; truncated: boolean; agent: TeamAgent | null; speaker: CampaignSpeaker }> {
  const facts = await eventFacts(args.eventId, args.userId);
  if (!facts) throw new Error("找不到這個活動");
  const speaker: CampaignSpeaker = args.speaker === "director" ? "director" : "planner";
  // 內容企劃跟卡片上顯示的同一位（campaign.team 也是這樣挑：避開總監的名字）。
  const director = await pickCampaignDirector(facts.brandId, args.directorAgentId);
  const agent = speaker === "director"
    ? director
    : await pickPlannerAgent(await brandIndustry(facts.brandId), director?.name ?? null);
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
    .map((i) => `- ${i.id}｜${PHASE_ZH[i.phase] ?? i.phase}｜${i.date}｜${i.platform}｜${i.taskLabel}｜${i.angle}${i.outputId ? "（已寫）" : ""}${i.enabled ? "" : "（這篇不做）"}${i.paid ? "（廣告）" : ""}`)
    .join("\n");
  const pm = args.plan.phaseMessages ?? {};
  const pmLines = CAMPAIGN_PHASE_IDS.filter((id) => pm[id]).map((id) => `- ${PHASE_ZH[id]}（${id}）：${pm[id]}`).join("\n");
  // 同一串對話兩個人都在講：標清楚是誰說的，「你」只指這次回答的人。
  const who = (h: CampaignChatTurn) => {
    if (h.role === "user") return "使用者";
    const sp = h.speaker === "director" ? "director" : "planner";
    if (sp === speaker) return "你";
    return `${h.name ? `${h.name}，` : ""}${sp === "director" ? "策略總監" : "內容企劃"}`;
  };
  const history = (args.history ?? []).slice(-10)
    .map((h) => `${who(h)}：${String(h.content).slice(0, 600)}`).join("\n");
  const thread = speaker === "director" && agent ? await directorThread(args.userId, facts.brandId, agent.id) : "";

  const user = [
    `【活動】${facts.name}（${facts.startAt ? ymd(facts.startAt) : "?"} ~ ${facts.endAt ? ymd(facts.endAt) : "?"}）`,
    `【優惠機制／活動內容】${facts.settings.mechanic || "（沒寫）"}`,
    `【一句話訴求】${args.plan.smp}`,
    pmLines ? `【每一段的訊息】\n${pmLines}` : "",
    `【允許的日期範圍】${window.from} ~ ${window.to}`,
    `【可以用的通路】${PLANNABLE_CHANNELS.join("、")}`,
    args.view === "basis"
      ? "【使用者正在看】右邊的策略依據（活動定位 11 段）——沒特別說的話，指的是策略依據"
      : args.phase ? `【使用者正在看】${PHASE_ZH[args.phase]}期（${args.phase}）——沒特別說的話，指的是這一段` : "",
    `【目前的企劃（id｜階段｜日期｜通路｜任務卡｜要講什麼）】\n${planLines}`,
    `【候選任務卡（只能從這裡挑）】\n${menu}`,
    speaker === "director" ? `【策略依據（路徑｜欄位｜目前寫的）】\n${basisLines(args.positioning ?? {})}` : "",
    thread ? `【你之前在右下角跟使用者談過（最近幾則）】\n${thread}` : "",
    history ? `【這個對話前面說過的】\n${history}` : "",
    args.handoff ? `【內容企劃轉給你的問題】${args.message.trim()}` : `【使用者現在說】${args.message.trim()}`,
    "",
    "只輸出 JSON，鍵名固定如下：",
    speaker === "director"
      ? `{"reply":"兩到四句","smp":"新的一句話訴求（要改才填）","phaseMessages":{"launch":"只有要改的段才填"},"ops":[{"op":"update","id":"企劃裡的 id","angle":"改寫後要講什麼（20-45字）"}],"basis":{"audience.keyInsight":"只有要改的格子才填","guidelines.forbiddenElements":["清單型給陣列"]}}`
      : `{"reply":"一到三句","ops":[{"op":"add","phase":"sustain","date":"YYYY-MM-DD","platform":"instagram","taskId":"逐字抄自候選清單","angle":"這一篇要講什麼（20-45字）"},{"op":"update","id":"企劃裡的 id","angle":"…","date":"…","enabled":true},{"op":"remove","id":"企劃裡的 id"}],"phaseMessages":{"sustain":"只有要改才填"},"askDirector":"只有方向的問題才填"}`,
  ].filter(Boolean).join("\n");

  const base = speaker === "director" ? DIRECTOR_SYSTEM : SYSTEM;
  let system = base;
  if (agent) {
    const { loadAgentKnowledge, withAgentKnowledge } = await import("../../platform/core/agentKnowledge.js");
    const knowledge = await loadAgentKnowledge(agent.id, { source: speaker === "director" ? "campaign.director" : "campaign.chat" }).catch(() => "");
    system = withAgentKnowledge(`你是${agent.name}（${agent.title}），${speaker === "director" ? "這檔活動的策略總監" : "負責這檔活動的內容企劃"}。\n\n${base}`, knowledge);
  }
  const { buildBrandPrefix } = await import("./brandContext.js");
  const brain = await buildBrandPrefix(facts.brandId, null, args.eventId, "full").catch(() => "");
  const { invokeLLM } = await import("../../platform/core/llm.js");
  const r = await invokeLLM({
    messages: [
      { role: "system", content: brain ? `${system}\n\n# 品牌大腦${brain}` : system },
      { role: "user", content: user },
    ],
    // 總監的回覆短（訴求＋幾段訊息＋幾篇切角），少給一點讓它快——反向代理 60 秒就斷。
    maxTokens: speaker === "director" ? 2500 : 4000,
  });
  const text = String(r.choices?.[0]?.message?.content ?? "");
  const parsed = parseChatReply(text);
  if (!parsed) throw new Error("這次沒有收到回覆，請再說一次");
  // 一句話訴求是策略總監的事：內容企劃提了也不收。
  const proposal = validateCampaignOps({
    raw: { ops: parsed.ops, phaseMessages: parsed.phaseMessages, ...(speaker === "director" ? { smp: parsed.smp } : {}) },
    plan: args.plan, cards, window,
  });
  // 策略依據只有總監能改。
  if (speaker === "director" && parsed.basis) {
    const b = validateBasis(parsed.basis, args.positioning ?? {}, { preserveItems: true });
    if (Object.keys(b).length) proposal.basis = b;
  }
  const askDirector = speaker === "planner" ? str(parsed.askDirector, 200) || null : null;
  const reply = humanizeIds(str(parsed.reply, 500), args.plan)
    || (proposal.ops.length || proposal.smp || proposal.phaseMessages || proposal.basis ? "我照你說的改好了。" : askDirector ? "這是方向的問題，我請策略總監來回答。" : "了解。");
  return { reply, proposal, askDirector, truncated: parsed.truncated && proposal.ops.length > 0, agent, speaker };
}
