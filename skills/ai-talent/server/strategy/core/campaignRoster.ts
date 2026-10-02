/**
 * campaignRoster — 活動頁對話裡的「這檔活動的團隊」：每一位做過這份企劃的人都在名冊上。
 *
 * 2026-10-02（CJ「我的活動應該有經過很多 Agent 協作才產出整個企劃，但現在換人，只有兩個人
 * 可以輪替，這樣不對」）：
 *   · 名冊＝真的參與過這份企劃的人，各自管一件事：
 *       策略總監（方向）、活動定位撰寫者（策略依據是他寫的）、內容企劃（排程）、
 *       投放專家（預算／哪幾篇下廣告）、網紅合作、異業合作、話題公關。
 *     網紅、異業只有企劃裡真的有那條線才上名冊；定位撰寫者跟總監同一位就不重複列。
 *   · 誰能改什麼由這裡的 ROLES 決定，伺服器照表擋（validateCampaignOps 的 role），
 *     不只靠指令。
 *   · 名冊只有一份：畫面（campaign.team）與對話（runCampaignChat）都從 buildCampaignRoster 來，
 *     名字才不會對不上（10/02 #312 修過一次的那個問題）。
 */
import type { CampaignPlan } from "./campaignPlan.js";
import { agentByRef, brandIndustry, englishOf, pickKpiAgent, pickPlannerAgent, type TeamAgent } from "./campaignTeam.js";

export const CAMPAIGN_ROLES = ["director", "author", "planner", "kpi", "kol", "cobrand", "pr"] as const;
export type CampaignRole = (typeof CAMPAIGN_ROLES)[number];

export interface RoleSpec {
  zh: string;
  en: string;
  /** 一句話：這個人在這檔活動管什麼（進指令，也顯示在畫面）。 */
  duty: string;
  dutyEn: string;
  /** 能改什麼。schedule＝加／刪／挪日期／換通路／換卡；angle 可限定通路。 */
  can: {
    schedule?: boolean;
    angle?: "all" | readonly string[];
    smp?: boolean;
    phaseMessages?: boolean;
    basis?: boolean;
    paid?: boolean;
  };
}

export const ROLES: Record<CampaignRole, RoleSpec> = {
  director: {
    zh: "策略總監", en: "Strategy director",
    duty: "方向：一句話訴求、每一段的訊息、對誰說、策略依據",
    dutyEn: "Direction: core message, phase messages, audience, strategy basis",
    can: { angle: "all", smp: true, phaseMessages: true, basis: true },
  },
  author: {
    zh: "活動定位", en: "Campaign positioning",
    duty: "寫了這檔的策略依據（受眾、洞察、目標、創意、禁用元素），回答「為什麼這樣定」",
    dutyEn: "Wrote the strategy basis; explains why it was set this way",
    can: { angle: "all", basis: true },
  },
  planner: {
    zh: "內容企劃", en: "Content planner",
    duty: "排程：哪一天、哪個通路、用哪張任務卡、這一篇講什麼",
    dutyEn: "Schedule: date, channel, task card and angle for each post",
    can: { schedule: true, angle: "all", phaseMessages: true },
  },
  kpi: {
    zh: "投放專家", en: "Paid media",
    duty: "資源：預算怎麼分、每一段看什麼數字、哪幾篇下廣告",
    dutyEn: "Resources: budget split, KPIs per phase, which posts to promote",
    can: { paid: true },
  },
  kol: {
    zh: "網紅合作", en: "Influencer partners",
    duty: "網紅那條線：找誰、邀約、brief、追蹤、接住自然提及",
    dutyEn: "Influencer lane: who, outreach, brief, follow-up",
    can: { angle: ["kol"] },
  },
  cobrand: {
    zh: "異業合作", en: "Co-brand partners",
    duty: "異業合作那條線：找誰合作、提案、分工、聯合公告",
    dutyEn: "Co-brand lane: partners, pitch, split of work, joint announcement",
    can: { angle: ["cobrand"] },
  },
  pr: {
    zh: "話題公關", en: "Buzz & PR",
    duty: "話題：有沒有媒體或路人願意轉述的切角、要不要發新聞稿、哪些說法會被放大檢視",
    dutyEn: "Buzz: newsworthy angles, press release or not, claims that draw scrutiny",
    can: { angle: "all" },
  },
};

export interface RosterMember extends TeamAgent {
  role: CampaignRole;
  /** 英文介面用（查不到就是空字串，畫面退回中文）。 */
  nameEn: string;
  titleEn: string;
  /** 這位在這份企劃做了什麼（畫面顯示、也進指令）。 */
  did: string;
  didEn: string;
}

// 固定人選：跟策略層活動頁右下角的活動顧問同一批（strategistDirectory 的 events scope）。
const FIXED: Partial<Record<CampaignRole, { slug?: string; id?: number }>> = {
  kol: { slug: "chen-xiaoling-kol-agent" },
  pr: { slug: "lin-yaxin-pr-director" },
  // 異業合作任務卡（quickTaskCobrand.ts）第一張卡的人。
  cobrand: { id: 180279 },
};

/** 名冊的組法（純函式，好測）：誰上名冊、做了什麼。 */
export function rosterRoles(args: {
  plan: Pick<CampaignPlan, "items" | "kpi"> | null;
  positioning: Record<string, any> | null;
  directorId: number | null;
}): Array<{ role: CampaignRole; did: string; didEn: string; authorId?: number }> {
  const items = (args.plan?.items ?? []).filter((i) => i.enabled);
  const n = (ch: string) => items.filter((i) => i.platform === ch).length;
  const authorId = Number(args.positioning?._director?.agentId);
  const out: Array<{ role: CampaignRole; did: string; didEn: string; authorId?: number }> = [
    { role: "director", did: "定了一句話訴求與各段訊息", didEn: "Set the core message and phase messages" },
  ];
  if (Number.isFinite(authorId) && authorId > 0 && authorId !== args.directorId) {
    out.push({ role: "author", did: "寫了策略依據（活動定位 11 段）", didEn: "Wrote the strategy basis", authorId });
  }
  out.push({ role: "planner", did: `排了 ${items.length} 篇`, didEn: `Scheduled ${items.length} items` });
  const kpi = (args.plan as any)?.kpi;
  out.push(kpi
    ? { role: "kpi", did: `拆了預算與 KPI、挑了 ${items.filter((i) => i.paid).length} 篇下廣告`, didEn: "Split the budget and KPIs" }
    : { role: "kpi", did: "還沒設定預算與 KPI", didEn: "No budget or KPI yet" });
  if (n("kol") || args.positioning?.kolBrief) out.push({ role: "kol", did: `網紅線 ${n("kol")} 件事`, didEn: `${n("kol")} influencer tasks` });
  if (n("cobrand")) out.push({ role: "cobrand", did: `異業線 ${n("cobrand")} 件事`, didEn: `${n("cobrand")} co-brand tasks` });
  out.push({ role: "pr", did: "看話題與說法風險", didEn: "Checks buzz angles and claim risk" });
  return out;
}

/** 這檔活動的名冊。director 由呼叫端先挑好（品牌那組策略總監，見 pickCampaignDirector）。 */
export async function buildCampaignRoster(args: {
  brandId: number;
  plan: Pick<CampaignPlan, "items" | "kpi"> | null;
  positioning: Record<string, any> | null;
  director: TeamAgent | null;
}): Promise<RosterMember[]> {
  const industry = await brandIndustry(args.brandId);
  const slots = rosterRoles({ plan: args.plan, positioning: args.positioning, directorId: args.director?.id ?? null });
  const people = await Promise.all(slots.map(async (s): Promise<TeamAgent | null> => {
    switch (s.role) {
      case "director": return args.director;
      case "author": return agentByRef({ id: s.authorId! });
      case "planner": return pickPlannerAgent(industry, args.director?.name ?? null);
      case "kpi": return pickKpiAgent(industry);
      default: return FIXED[s.role] ? agentByRef(FIXED[s.role]!) : null;
    }
  }));
  const seen = new Set<number>();
  const out: RosterMember[] = [];
  slots.forEach((s, k) => {
    const a = people[k];
    if (!a || seen.has(a.id)) return;      // 同一個人只列一次（例如定位撰寫者就是總監）
    seen.add(a.id);
    out.push({ ...a, role: s.role, did: s.did, didEn: s.didEn, nameEn: "", titleEn: "" });
  });
  const en = await englishOf(out.map((m) => m.id));
  for (const m of out) Object.assign(m, en.get(m.id) ?? {});
  return out;
}

export const isCampaignRole = (s: unknown): s is CampaignRole => (CAMPAIGN_ROLES as readonly string[]).includes(String(s));
