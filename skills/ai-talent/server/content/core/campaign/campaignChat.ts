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
import { PAID_CHANNELS } from "./campaignKpi.js";
import { candidateCards, eventFacts, safeJSON, PLANNABLE_CHANNELS, CAMPAIGN_PHASE_IDS, type CampaignPlan, type CampaignPhaseId, type PlanItem } from "./campaignPlan.js";
import type { CatalogTask } from "../catalog/taskCatalogIndex.js";
import { brandIndustry, type TeamAgent } from "./campaignTeam.js";
import { buildCampaignRoster, isCampaignRole, ROLES, type CampaignRole, type RosterMember } from "./campaignRoster.js";
import { getDirectorByAgentId, listDirectorsForBrand } from "../../../strategy/core/strategist/strategistDirectory.js";
import localPool from "../../../localDb.js";
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
 *
 * 2026-10-02（CJ「一個對話中，無法讓策略總監再交回去給內容企劃」「潘建宇提到的人，跟我們
 * 可以換的人，人名顯示都不一樣」→ 定案：總監用策略總監那一組）：
 *   · 交棒雙向：內容企劃 askDirector、總監 askPlanner；一串最多轉兩手（hops），不會互踢。
 *   · 分工由伺服器擋，不只靠指令：總監只能改切角（angle），加篇／刪篇／換通路／換日期／
 *     換卡一律丟掉，要的話交給內容企劃。
 *   · 名冊只有一份：兩人的名字都從同一次挑人來；指令裡列出名冊、不准編別的人名；前面對話
 *     的標籤用現在的名冊，不用畫面存的舊名字（舊名字是換人之前留下的）。
 */
/**
 * 2026-10-02（CJ「活動經過很多 Agent 協作才產出整個企劃，換人只有兩個人可以輪替不對」）：
 *   · 對話裡的人＝這檔活動的名冊（campaignRoster.ts）：總監、定位撰寫者、內容企劃、投放專家、
 *     網紅／異業合作、話題公關。誰能改什麼照 ROLES 表，伺服器擋。
 *   · 交棒一般化：handoffTo＝名冊上任何一位的角色 id（舊的 askDirector／askPlanner 照收）。
 */
export type CampaignSpeaker = CampaignRole;
export interface CampaignChatTurn { role: "user" | "assistant"; content: string; speaker?: CampaignSpeaker; name?: string }

/** 活動頁的策略總監：使用者在右下角選過的那一位（品牌那一組），沒選過就是第一位。 */
export async function pickCampaignDirector(brandId: number, agentId?: number | null): Promise<TeamAgent | null> {
  const industry = await brandIndustry(brandId);
  const d = (agentId ? await getDirectorByAgentId(agentId, industry).catch(() => null) : null)
    ?? (await listDirectorsForBrand(industry, "brand").catch(() => []))[0] ?? null;
  return d ? { id: d.agentId, slug: d.slug, name: d.name, title: d.title, avatarUrl: d.avatarUrl, nameEn: d.nameEn, titleEn: d.titleEn } : null;
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
  | { op: "update"; id: string; patch: Partial<Pick<PlanItem, "angle" | "date" | "enabled" | "platform" | "taskId" | "taskLabel" | "repaired" | "paid">> }
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
  /** 誰提的。能改什麼照 campaignRoster.ROLES——排程（加／刪／通路／日期／卡）只有內容企劃。 */
  role?: CampaignSpeaker;
}): CampaignProposal {
  const { plan, cards, window } = args;
  const byId = new Map(plan.items.map((i) => [i.id, i]));
  const editable = (id: string) => { const it = byId.get(id); return it && !it.outputId ? it : null; };
  const inWindow = (d: string) => YMD.test(d) && d >= window.from && d <= window.to;
  const newId = args.newId ?? ((phase, date, n) => `${phase}-${date}-c${Date.now().toString(36)}${n}`);
  const ops: CampaignOp[] = [];
  const touched = new Set<string>();
  // 沒指定角色（舊呼叫端與測試）：內容企劃的權限＋一句話訴求，跟改版前一樣。
  const can = args.role ? ROLES[args.role].can : { ...ROLES.planner.can, smp: true };

  for (const o of Array.isArray(args.raw?.ops) ? args.raw.ops : []) {
    if (ops.length >= 14) break;
    const kind = String(o?.op ?? "");
    if (!can.schedule) {
      // 不管排程的人：只收 update，而且只收他能改的欄位（切角限他管的通路、下不下廣告）。
      if (kind !== "update") continue;
      const id = String(o?.id ?? "");
      const cur = editable(id);
      if (!cur || touched.has(id)) continue;
      const patch: Extract<CampaignOp, { op: "update" }>["patch"] = {};
      const angle = str(o?.angle, 200);
      const angleOk = can.angle === "all" || (Array.isArray(can.angle) && can.angle.includes(cur.platform));
      if (angleOk && angle.length >= 4 && angle !== cur.angle) patch.angle = angle;
      if (can.paid && typeof o?.paid === "boolean" && o.paid !== !!cur.paid
        && (!o.paid || (PAID_CHANNELS as readonly string[]).includes(cur.platform))) patch.paid = o.paid;
      if (Object.keys(patch).length) { ops.push({ op: "update", id, patch }); touched.add(id); }
      continue;
    }
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
  if (can.phaseMessages && args.raw?.phaseMessages && typeof args.raw.phaseMessages === "object") {
    const pm: Partial<Record<CampaignPhaseId, string>> = {};
    for (const id of CAMPAIGN_PHASE_IDS) {
      const m = str(args.raw.phaseMessages[id], 60);
      if (m && phasesAfter.has(id) && m !== plan.phaseMessages?.[id]) pm[id] = m;
    }
    if (Object.keys(pm).length) out.phaseMessages = pm;
  }
  const smp = can.smp ? str(args.raw?.smp, 60) : "";
  if (smp && smp !== plan.smp) out.smp = smp;
  return out;
}

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 這檔活動可以排文的日期範圍：今天（或開跑前兩週，取晚的）到結束後一週。
 * 對話加篇與手動加篇（draftManualItem）用同一條，畫面上的日期選單也照這個。
 */
export function campaignWindow(startAt: Date | null, endAt: Date | null, now: Date = new Date()): { from: string; to: string } {
  const today = new Date(ymd(now));
  const start = startAt ? new Date(ymd(startAt)) : today;
  const end = endAt ? new Date(ymd(endAt)) : new Date(start.getTime() + 30 * DAY);
  return {
    from: ymd(new Date(Math.max(today.getTime(), start.getTime() - 14 * DAY))),
    to: ymd(new Date(end.getTime() + 7 * DAY)),
  };
}

/**
 * 使用者自己在某個通路加一篇（2026-10-05 CJ「在某通路欄位底下，自己在該日期按+」）。
 *
 * 規則跟對話加篇同一套（日期範圍、通路、切角至少 4 個字），差別只有一個：卡是使用者
 * 親手選的，對不到就明講，不像模型挑錯時那樣默默換成預設卡。
 * 只回這一格、不寫入——畫面把它併進手上的企劃再送 savePlan（跟對話的提案同一條路）。
 */
export function draftManualItem(args: {
  input: { phase: string; date: string; platform: string; taskId: string; angle: string };
  cards: CatalogTask[];
  window: { from: string; to: string };
  newId?: (phase: string, date: string) => string;
}): { ok: true; item: PlanItem } | { ok: false; reason: "phase" | "date" | "platform" | "card" | "angle" } {
  const phase = String(args.input.phase ?? "");
  const date = String(args.input.date ?? "");
  const platform = String(args.input.platform ?? "").toLowerCase();
  const angle = str(args.input.angle, 200);
  if (!(CAMPAIGN_PHASE_IDS as readonly string[]).includes(phase)) return { ok: false, reason: "phase" };
  if (!YMD.test(date) || date < args.window.from || date > args.window.to) return { ok: false, reason: "date" };
  if (!(PLANNABLE_CHANNELS as readonly string[]).includes(platform)) return { ok: false, reason: "platform" };
  const card = args.cards.find((c) => c.platform === platform && c.id === String(args.input.taskId ?? ""));
  if (!card) return { ok: false, reason: "card" };
  if (angle.length < 4) return { ok: false, reason: "angle" };
  const newId = args.newId ?? ((ph, d) => `${ph}-${d}-m${Date.now().toString(36)}`);
  return {
    ok: true,
    item: {
      id: newId(phase, date), phase: phase as CampaignPhaseId, date, platform,
      taskId: card.id, taskLabel: card.labelZh || card.labelEn || card.id, angle,
      enabled: true, outputId: null, scheduledAt: null,
    },
  };
}

/**
 * 模型的回覆 → { reply, ops, phaseMessages, askDirector }。純函式。
 *
 * 2026-09-30（CJ「我請內容企劃調整方向，結果她回復：內容企劃的回覆讀不懂」）：
 * 「每一段都改」這種要求會一次回十幾條操作，回覆超過長度上限被截斷，JSON 不完整就
 * 整份丟掉。現在先照常解析；解析不了就把**完整的那幾條操作**救回來（truncated=true，
 * 畫面會說「只來得及提出前幾條」）；連 JSON 都沒有，就把文字當成一般回答。
 */
export function parseChatReply(text: string): { reply: string; ops: any[]; phaseMessages?: any; smp?: string; basis?: any; askDirector?: string; askPlanner?: string; handoffTo?: string; ask?: string; truncated: boolean } | null {
  const raw = String(text ?? "");
  const whole = safeJSON<any>(raw, null);
  if (whole && typeof whole === "object") {
    return {
      reply: String(whole.reply ?? ""), ops: Array.isArray(whole.ops) ? whole.ops : [],
      phaseMessages: whole.phaseMessages, askDirector: typeof whole.askDirector === "string" ? whole.askDirector : undefined,
      askPlanner: typeof whole.askPlanner === "string" ? whole.askPlanner : undefined,
      handoffTo: typeof whole.handoffTo === "string" ? whole.handoffTo : undefined,
      ask: typeof whole.ask === "string" ? whole.ask : undefined,
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
- 一句話訴求、主角、目標客群、定位、策略依據這類「方向」的問題不是你改的——那是策略總監的工作，他就在同一個對話裡。使用者問到這些時，ops 回空陣列，reply 一句話說你請總監（叫他的名字）來回答，handoffTo 填 director，ask 寫一句要請策略總監回答的問題（把使用者的原意帶過去）。
- 預算、下不下廣告問投放專家（kpi）；網紅、異業合作那條線的細節問網紅合作（kol）／異業合作（cobrand）；話題、新聞稿、說法會不會被放大檢視問話題公關（pr）；「策略依據為什麼這樣寫」問活動定位（author）——名冊上有那位才交，交法同上。
- 前面的對話裡策略總監已經定下的方向，照著排，不要再改回去。
- 策略總監轉給你的指示（加篇、刪篇、挪日期、換通路），照著用操作排好，reply 說你排了什麼。
- kol 是網紅合作那條線、cobrand 是異業合作那條線：排的是品牌要做的事（邀約、提案、brief、追蹤、分工、聯合公告…），不是品牌自己發的貼文；任務卡一樣只能挑那個通路的卡。
- ops 最多 12 條，每條 angle 20–45 字；使用者要改很多篇時，先改最重要的 12 篇，reply 說明其餘下一輪再改。
- reply 用繁體中文一到三句：你打算改什麼、為什麼。不要列清單，清單畫面會自己列。不要寫企劃的 id，要指某一篇就說日期和通路。
- 只輸出 JSON，不要任何說明文字。`;

// 「逐篇掃」那一條：2026-09-30 dev 實測，總監拿掉「免費」時改了 6 篇、漏了官網公告頁那篇。
const DIRECTOR_SYSTEM = `你是這檔活動的策略總監，跟這檔活動的團隊（內容企劃與幾位專家，名冊在下面）在同一個對話裡。你管方向：一句話訴求（smp）、每一段要讓人記住的那句話（phaseMessages）、對誰說、主角是誰。內容企劃管怎麼排。

使用者或內容企劃把方向的問題交給你。你要做決定，而且直接改進企劃——使用者講完，畫面上的訴求就會變：
- 方向確定了，就填 smp（20 字內為佳、最多 40 字）與受影響的 phaseMessages（每段一句、最多 40 字）。
- 方向一改，原本講法對不上的那幾篇（例如訴求拿掉「免費」，切角還寫著免費的那幾篇），用 update 改它們的 angle（20–45 字）。標了（已寫）的不能動。
- 改之前把【目前的企劃】從第一篇到最後一篇逐篇掃一次，每個通路（官網、電子報、LINE 也算）都要看；對不上新方向的一篇都不能漏。
- 真的缺一個只有使用者知道的事實才能決定時（例如這次是要註冊還是預約），先用最合理的假設改好，reply 最後問那一個問題。不要只丟選項給使用者挑。
- 不准編使用者沒給的數字、成效、顧客見證、名額限制或網址。
- 加篇、刪篇、換通路、換日期、換任務卡是內容企劃的事，你不能動（就算寫了也會被丟掉）。使用者要這些，或你改完方向後需要加篇、刪篇、挪日期時：reply 說你請內容企劃（叫他的名字）接手，handoffTo 填 planner，ask 寫一句給內容企劃的具體指示（帶上你剛定的方向、要加或刪什麼）。名冊上其他專家（投放、網紅、異業、公關）的專業問題也可以交給他們。只是改切角就自己用 update 改，不用交棒。
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

/**
 * 名冊上其他人（定位撰寫者、投放專家、網紅／異業合作、話題公關）的指令。
 * 他們各管一件事，能改的照 ROLES 表；要加篇刪篇就交給內容企劃，要動方向就交給策略總監。
 */
function specialistSystem(role: CampaignRole): string {
  const spec = ROLES[role];
  const can = spec.can;
  const may = [
    can.angle === "all" ? "改任何一篇還沒寫的切角（update 的 angle，20–45 字）" : Array.isArray(can.angle) ? `改 ${can.angle.join("／")} 那條線還沒寫的切角（update 的 angle，20–45 字）` : "",
    can.paid ? `決定哪幾篇下廣告（update 的 paid: true／false；只有 ${PAID_CHANNELS.join("／")} 能下）` : "",
    can.basis ? "改策略依據（basis，鍵是【策略依據】列出的路徑，只改要改的格子；清單型給完整新清單、原本的項目逐字保留）" : "",
  ].filter(Boolean);
  return `你是這檔活動團隊裡的${spec.zh}。你管的事：${spec.duty}。團隊裡其他人各管一件事，名冊在下面。

鐵則：
- 用你自己的專業回答，講具體的判斷，不要講空話。使用者只是在問，就用 reply 回答、ops 回空陣列。
- 你能直接改的只有：${may.length ? may.join("；") : "（沒有——你只給意見）"}。其他的寫了也會被丟掉。
- 加篇、刪篇、挪日期、換通路、換任務卡是內容企劃的事；一句話訴求與各段訊息是策略總監的事。需要這些時：reply 說你請誰（叫他的名字）接手，handoffTo 填他的角色 id，ask 寫一句給他的具體指示（帶上你的判斷）。
- 前面的對話裡別人已經定下的事，照著做，不要改回去。
- 不准編使用者沒給的數字、成效、顧客見證、名額限制、報價或網址。
- reply 用繁體中文兩到四句，口語、不要條列、不要 markdown 粗體。不要寫企劃的 id，要指某一篇就說日期和通路。
- 只輸出 JSON，不要任何說明文字。`;
}

/** 跟名冊上某一位說一句話 → 回覆＋改法（已檢查；畫面拿到就寫進企劃）。 */
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
  /** 這句是另一位轉過來的，不是使用者親口說的。 */
  handoff?: boolean;
  /** 轉過來的是誰（handoff 時）。 */
  from?: CampaignSpeaker | null;
  /** 這一串已經轉了幾手（使用者那句算 0）；到 2 就不再轉，免得互踢。 */
  hops?: number;
  /** 活動的 positioning（策略依據從這裡讀）。 */
  positioning?: Record<string, any> | null;
  /** 使用者右邊正在看的：企劃地圖或策略依據。 */
  view?: "map" | "basis";
  /** 最近幾段已結束的討論的摘要（2026-10-02 分段）：這段只讀這段的對話，前情用摘要補。 */
  earlier?: string[];
  /**
   * 使用者的介面語言（2026-10-02 CJ「英文版也能正確顯示嗎」）。en：reply 用英文、提到同事用英文名字；
   * 企劃本身（切角、訴求、各段訊息、策略依據）照品牌原本的語言，不跟著介面換。
   */
  lang?: "zh" | "en";
}): Promise<{ reply: string; proposal: CampaignProposal; askDirector: string | null; handoff: { to: CampaignSpeaker; question: string } | null; truncated: boolean; agent: TeamAgent | null; speaker: CampaignSpeaker }> {
  const facts = await eventFacts(args.eventId, args.userId);
  if (!facts) throw new Error("找不到這個活動");
  // 2026-10-02（CJ「問起來還是卡卡的」）：準備工作平行跑——總監、品牌大腦互不相依。
  const { buildBrandPrefix } = await import("../../../strategy/core/brand/brandContext.js");
  const [director, brain] = await Promise.all([
    pickCampaignDirector(facts.brandId, args.directorAgentId),
    buildBrandPrefix(facts.brandId, null, args.eventId, "full").catch(() => ""),
  ]);
  const roster = await buildCampaignRoster({ brandId: facts.brandId, plan: args.plan, positioning: args.positioning ?? null, director });
  const byRole = new Map<CampaignRole, RosterMember>(roster.map((m) => [m.role, m]));
  const speaker: CampaignSpeaker = args.speaker && byRole.has(args.speaker) ? args.speaker : "planner";
  const agent: TeamAgent | null = byRole.get(speaker) ?? null;
  const roleZh = (s: CampaignSpeaker) => ROLES[s].zh;
  const label = (s: CampaignSpeaker) => (byRole.get(s)?.name ? `${byRole.get(s)!.name}（${roleZh(s)}）` : roleZh(s));
  const window = campaignWindow(facts.startAt, facts.endAt);
  const cards = candidateCards([...PLANNABLE_CHANNELS]);
  // 候選卡清單很長（每通路 30 張），只有會加篇換卡的內容企劃需要——其他人少讀一大段，回得快。
  const menu = speaker === "planner"
    ? PLANNABLE_CHANNELS.flatMap((p) => cards.filter((c) => c.platform === p).slice(0, 30))
      .map((c) => `- ${c.id}｜${c.platform}｜${c.labelZh || c.labelEn}`).join("\n")
    : "";
  const planLines = [...args.plan.items]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((i) => `- ${i.id}｜${PHASE_ZH[i.phase] ?? i.phase}｜${i.date}｜${i.platform}｜${i.taskLabel}｜${i.angle}${i.outputId ? "（已寫）" : ""}${i.enabled ? "" : "（這篇不做）"}${i.paid ? "（廣告）" : ""}${i.partner ? `（給：${i.partner}）` : ""}`)
    .join("\n");
  const pm = args.plan.phaseMessages ?? {};
  const pmLines = CAMPAIGN_PHASE_IDS.filter((id) => pm[id]).map((id) => `- ${PHASE_ZH[id]}（${id}）：${pm[id]}`).join("\n");
  // 同一串對話好幾個人都在講：標清楚是誰說的，「你」只指這次回答的人。
  // 名字用現在的名冊，不用畫面送來的 h.name——那可能是換人之前的舊名字，模型會照著叫錯人。
  const who = (h: CampaignChatTurn) => {
    if (h.role === "user") return "使用者";
    const sp: CampaignSpeaker = isCampaignRole(h.speaker) ? h.speaker : "planner";
    return sp === speaker ? "你" : label(sp);
  };
  const history = (args.history ?? []).slice(-10)
    .map((h) => `${who(h)}：${String(h.content).slice(0, 600)}`).join("\n");

  const { loadAgentKnowledge, withAgentKnowledge } = await import("../../../platform/core/agents/agentKnowledge.js");
  const source = speaker === "director" ? "campaign.director" : speaker === "planner" ? "campaign.chat" : `campaign.${speaker}`;
  const [thread, knowledge] = await Promise.all([
    speaker === "director" && agent ? directorThread(args.userId, facts.brandId, agent.id) : Promise.resolve(""),
    agent ? loadAgentKnowledge(agent.id, { source }).catch(() => "") : Promise.resolve(""),
  ]);

  const rosterBlock = [
    `【這檔活動的團隊（只有這幾位；交棒時 handoffTo 填角色 id）】`,
    ...roster.map((m) => `- ${m.role === speaker ? "你：" : ""}${m.name}${args.lang === "en" && m.nameEn ? `／${m.nameEn}` : ""}（${ROLES[m.role].zh}，角色 id：${m.role}）——管${ROLES[m.role].duty}；這份企劃裡${m.did}`),
    `- 使用者`,
    `提到同事只能用上面的名字；不要編別的人名，也不要說要去找名單以外的人。`,
  ].join("\n");
  const hops = Math.max(0, Math.min(2, Number(args.hops ?? (args.handoff ? 1 : 0)) || 0));
  const from: CampaignSpeaker | null = args.from && byRole.has(args.from) ? args.from
    : args.handoff ? (speaker === "director" ? "planner" : "director") : null;
  const kpi = args.plan.kpi;
  const can = ROLES[speaker].can;
  const specialistJson = `{"reply":"兩到四句","ops":[{"op":"update","id":"企劃裡的 id"${can.angle ? `,"angle":"改寫後要講什麼（20-45字）"` : ""}${can.paid ? `,"paid":true` : ""}}],${can.basis ? `"basis":{"audience.keyInsight":"只有要改的格子才填"},` : ""}"handoffTo":"要交棒才填：名冊上的角色 id","ask":"給接手那位的一句具體指示"}`;

  const user = [
    rosterBlock,
    `【活動】${facts.name}（${facts.startAt ? ymd(facts.startAt) : "?"} ~ ${facts.endAt ? ymd(facts.endAt) : "?"}）`,
    `【優惠機制／活動內容】${facts.settings.mechanic || "（沒寫）"}`,
    `【一句話訴求】${args.plan.smp}`,
    pmLines ? `【每一段的訊息】\n${pmLines}` : "",
    speaker === "planner" ? `【允許的日期範圍】${window.from} ~ ${window.to}` : "",
    speaker === "planner" ? `【可以用的通路】${PLANNABLE_CHANNELS.join("、")}` : "",
    speaker === "kpi" && kpi ? `【目前的預算與 KPI】${JSON.stringify(kpi).slice(0, 1500)}` : "",
    speaker === "kol" && args.positioning?.kolBrief ? `【網紅任務說明單】${JSON.stringify(args.positioning.kolBrief).slice(0, 2000)}` : "",
    args.view === "basis"
      ? "【使用者正在看】右邊的策略依據（活動定位 11 段）——沒特別說的話，指的是策略依據"
      : args.phase ? `【使用者正在看】${PHASE_ZH[args.phase]}期（${args.phase}）——沒特別說的話，指的是這一段` : "",
    `【目前的企劃（id｜階段｜日期｜通路｜任務卡｜要講什麼）】\n${planLines}`,
    menu ? `【候選任務卡（只能從這裡挑）】\n${menu}` : "",
    can.basis ? `【策略依據（路徑｜欄位｜目前寫的）】\n${basisLines(args.positioning ?? {})}` : "",
    thread ? `【你之前在右下角跟使用者談過（最近幾則）】\n${thread}` : "",
    args.earlier?.length ? `【之前幾段討論的結論（已經做完的事，不用重做）】\n${args.earlier.map((e) => `- ${e.slice(0, 300)}`).join("\n")}` : "",
    history ? `【這段討論前面說過的】\n${history}` : "",
    args.handoff && from ? `【${label(from)}轉給你的問題】${args.message.trim()}` : `【使用者現在說】${args.message.trim()}`,
    args.lang === "en"
      ? "【語言】使用者用的是英文介面：reply 一律用英文寫，提到同事用斜線後面的英文名字（沒有就用中文名字）。企劃內容（angle、smp、phaseMessages、basis）照品牌原本的語言寫，不要因為介面是英文就改成英文。上面要求「繁體中文」的地方，只對企劃內容有效。"
      : "",
    hops >= 2 ? `這個問題已經轉過兩手，這次不要再交棒（handoffTo 留空），能做的自己做，做不到的在 reply 說明。` : "",
    "",
    "只輸出 JSON，鍵名固定如下：",
    speaker === "director"
      ? `{"reply":"兩到四句","smp":"新的一句話訴求（要改才填）","phaseMessages":{"launch":"只有要改的段才填"},"ops":[{"op":"update","id":"企劃裡的 id","angle":"改寫後要講什麼（20-45字）"}],"basis":{"audience.keyInsight":"只有要改的格子才填","guidelines.forbiddenElements":["清單型給陣列"]},"handoffTo":"要交棒才填：planner 或名冊上的角色 id","ask":"給接手那位的一句具體指示"}`
      : speaker === "planner"
        ? `{"reply":"一到三句","ops":[{"op":"add","phase":"sustain","date":"YYYY-MM-DD","platform":"instagram","taskId":"逐字抄自候選清單","angle":"這一篇要講什麼（20-45字）"},{"op":"update","id":"企劃裡的 id","angle":"…","date":"…","enabled":true},{"op":"remove","id":"企劃裡的 id"}],"phaseMessages":{"sustain":"只有要改才填"},"handoffTo":"要交棒才填：director 或名冊上的角色 id","ask":"給接手那位的一句具體指示"}`
        : specialistJson,
  ].filter(Boolean).join("\n");

  const base = speaker === "director" ? DIRECTOR_SYSTEM : speaker === "planner" ? SYSTEM : specialistSystem(speaker);
  const system = agent
    ? withAgentKnowledge(`你是${agent.name}（${agent.title}），這檔活動團隊裡的${roleZh(speaker)}。\n\n${base}`, knowledge)
    : base;
  const { invokeLLM } = await import("../../../platform/core/llm/llm.js");
  const r = await invokeLLM({
    messages: [
      { role: "system", content: brain ? `${system}\n\n# 品牌大腦${brain}` : system },
      { role: "user", content: user },
    ],
    // 只有內容企劃會一次回十幾條操作；其他人回覆短，少給一點讓它快——反向代理 60 秒就斷。
    maxTokens: speaker === "planner" ? 4000 : 2500,
  });
  const text = String(r.choices?.[0]?.message?.content ?? "");
  const parsed = parseChatReply(text);
  if (!parsed) throw new Error("這次沒有收到回覆，請再說一次");
  // 能改什麼由角色決定（smp 只有總監、排程只有內容企劃…），validateCampaignOps 照表擋。
  const proposal = validateCampaignOps({
    raw: { ops: parsed.ops, phaseMessages: parsed.phaseMessages, smp: parsed.smp },
    plan: args.plan, cards, window, role: speaker,
  });
  if (can.basis && parsed.basis) {
    const b = validateBasis(parsed.basis, args.positioning ?? {}, { preserveItems: true });
    if (Object.keys(b).length) proposal.basis = b;
  }
  const handoff = hops >= 2 ? null : pickHandoff(parsed, speaker, new Set(byRole.keys()));
  const askDirector = handoff?.to === "director" ? handoff.question : null;
  const reply = humanizeIds(str(parsed.reply, 500), args.plan)
    || (proposal.ops.length || proposal.smp || proposal.phaseMessages || proposal.basis ? "我照你說的改好了。"
      : handoff ? `這部分我請${label(handoff.to)}接手。` : "了解。");
  return { reply, proposal, askDirector, handoff, truncated: parsed.truncated && proposal.ops.length > 0, agent, speaker };
}

/**
 * 交棒給誰：handoffTo＋ask（新）或 askDirector／askPlanner（舊）。只交給名冊上的另一位。純函式。
 */
export function pickHandoff(
  parsed: { handoffTo?: string; ask?: string; askDirector?: string; askPlanner?: string },
  speaker: CampaignSpeaker,
  onRoster: Set<CampaignSpeaker>,
): { to: CampaignSpeaker; question: string } | null {
  const to: CampaignSpeaker | null = isCampaignRole(parsed.handoffTo) ? parsed.handoffTo
    : parsed.askDirector ? "director" : parsed.askPlanner ? "planner" : null;
  if (!to || to === speaker || !onRoster.has(to)) return null;
  const question = str(parsed.ask || (to === "director" ? parsed.askDirector : to === "planner" ? parsed.askPlanner : "") || "", 200);
  return question ? { to, question } : null;
}
