/**
 * campaignKpi — 活動企劃的 KPI、預算與廣告：用戶填總數，投放專家拆到每一段。
 *
 * 2026-09-30（CJ「目前的企劃看起來很完整，但有點空虛，似乎少了廣告素材還有 KPI 設定，
 * 所以不知道每一階段，應該用多少資源，應該達到甚麼 KPI」→「用戶自己填，AI 從 AI AGENT
 * 當中，選擇適合衡量指標的 agent，協助用戶填好 brief，AI 根據 KPI 的目標，抓不同階段的
 * 比例」＋「在現有的 fb or ig or other content，展示出屬於下廣告的」）。
 *
 * ── 數字的來源分清楚 ─────────────────────────────────────────────────
 *   · 總預算、總目標：用戶填的。這是唯一的絕對數字來源。
 *   · 每一段的比例、每一段看哪個指標、哪幾篇要下廣告：投放專家（從 agents 挑的
 *     paid-media 專家，帶著他自己的知識）提議。
 *   · 每一段的目標數字：用比例把用戶的總目標拆開（validateKpiPlan 會把模型給的數字
 *     重新按比例縮放，讓各段加起來剛好等於用戶填的總數）——模型不能憑空多生出成效。
 *   · 用戶沒給的指標，模型可以提但不能給數字（例：用戶只給申請數，觸及就只標「看觸及」）。
 *
 * 跟對話一樣只回提案，套用走 savePlan。
 */
import localPool from "../../localDb.js";
import { eventFacts, safeJSON, CAMPAIGN_PHASE_IDS, type CampaignPlan, type CampaignPhaseId } from "./campaignPlan.js";

/** 指標語彙（前端 lib/campaignKpi.ts 同一份，campaignKpiVocab.test.ts 比對）。 */
export const KPI_METRICS = ["reach", "impressions", "engagement", "clicks", "leads", "orders", "revenue", "visits", "followers"] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];
export const KPI_METRIC_ZH: Record<KpiMetric, string> = {
  reach: "觸及人數", impressions: "曝光次數", engagement: "互動數", clicks: "連結點擊",
  leads: "名單／申請", orders: "訂單數", revenue: "營收（NT$）", visits: "到店／到場", followers: "新增粉絲",
};

/** 可以下廣告的通路（官網、電子報不是「下廣告」的地方）。 */
export const PAID_CHANNELS = ["facebook", "instagram", "threads", "tiktok", "line"] as const;

export interface KpiGoal { metric: KpiMetric; target: number }
export interface PhaseKpi {
  /** 佔總預算的百分比（整數，各段加起來 100）。 */
  share: number;
  /** 由 share × 總預算算出；沒填預算就是 null。 */
  budget: number | null;
  /** 這一段看的指標；target 為 null＝要看但用戶沒給總數，不給數字。 */
  metrics: Array<{ metric: KpiMetric; target: number | null }>;
  note: string;
}
export interface KpiAgent { id: number; slug: string; name: string; title: string; avatarUrl: string }
export interface CampaignKpi {
  budget: number | null;
  goals: KpiGoal[];
  notes: string;
  brief: string;
  assumptions: string[];
  phases: Partial<Record<CampaignPhaseId, PhaseKpi>>;
  agent?: KpiAgent | null;
  generatedAt: string;
}

const isMetric = (m: unknown): m is KpiMetric => (KPI_METRICS as readonly string[]).includes(String(m));
const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/** 把一串非負數字變成加起來剛好 100 的整數（最大餘數法）。全為 0 就平均分。 */
export function toPercent(raw: number[]): number[] {
  const vals = raw.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const sum = vals.reduce((a, b) => a + b, 0);
  const base = sum > 0 ? vals.map((v) => (v / sum) * 100) : vals.map(() => 100 / Math.max(1, vals.length));
  const floor = base.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  const order = base.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; floor[i]! += 1; left--; }
  return floor;
}

/** 把一個總數依權重拆成整數，加起來剛好等於總數。 */
export function splitTotal(total: number, weights: number[]): number[] {
  const w = weights.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const raw = sum > 0 ? w.map((v) => (total * v) / sum) : w.map(() => total / Math.max(1, w.length));
  const floor = raw.map(Math.floor);
  let left = total - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; floor[i]! += 1; left--; }
  return floor;
}

/**
 * 模型回的提案 → 可以套用的 KPI 與廣告名單。純函式，規則見檔頭。
 */
export function validateKpiPlan(args: {
  raw: any;
  plan: CampaignPlan;
  budget: number | null;
  goals: KpiGoal[];
}): { phases: Partial<Record<CampaignPhaseId, PhaseKpi>>; paidIds: string[]; brief: string; assumptions: string[] } {
  const present = CAMPAIGN_PHASE_IDS.filter((id) => args.plan.items.some((i) => i.phase === id && i.enabled));
  const rawPhases = args.raw?.phases && typeof args.raw.phases === "object" ? args.raw.phases : {};
  const shares = toPercent(present.map((id) => Number(rawPhases?.[id]?.share ?? 0)));
  const budgets = args.budget && args.budget > 0 ? splitTotal(Math.round(args.budget), shares) : null;
  const goalMetrics = new Set(args.goals.map((g) => g.metric));

  const phases: Partial<Record<CampaignPhaseId, PhaseKpi>> = {};
  present.forEach((id, k) => {
    const rp = rawPhases?.[id] ?? {};
    const seen = new Set<string>();
    const metrics: PhaseKpi["metrics"] = [];
    for (const m of Array.isArray(rp.metrics) ? rp.metrics : []) {
      const metric = String(m?.metric ?? "");
      if (!isMetric(metric) || seen.has(metric) || metrics.length >= 3) continue;
      seen.add(metric);
      metrics.push({ metric, target: null });
    }
    phases[id] = { share: shares[k]!, budget: budgets ? budgets[k]! : null, metrics, note: str(rp.note, 120) };
  });

  // 用戶給了總數的指標：各段的目標依模型給的相對大小拆總數；模型沒給的段按預算比例拆。
  for (const goal of args.goals) {
    const withIt = present.filter((id) => phases[id]!.metrics.some((m) => m.metric === goal.metric));
    if (!withIt.length) continue;
    const weights = withIt.map((id) => {
      const rm = (rawPhases?.[id]?.metrics ?? []).find((m: any) => m?.metric === goal.metric);
      const t = Number(rm?.target);
      return Number.isFinite(t) && t > 0 ? t : phases[id]!.share;
    });
    const split = splitTotal(Math.round(goal.target), weights);
    withIt.forEach((id, k) => {
      const m = phases[id]!.metrics.find((x) => x.metric === goal.metric)!;
      m.target = split[k]!;
    });
  }
  // 用戶沒給總數的指標：留著「要看」，但一律沒有數字。
  for (const id of present) for (const m of phases[id]!.metrics) if (!goalMetrics.has(m.metric)) m.target = null;

  const eligible = new Set(args.plan.items
    .filter((i) => i.enabled && (PAID_CHANNELS as readonly string[]).includes(i.platform))
    .map((i) => i.id));
  const rawPaid: string[] = (Array.isArray(args.raw?.paid) ? args.raw.paid : []).map((x: unknown) => String(x));
  const paidIds = [...new Set(rawPaid)].filter((id) => eligible.has(id)).slice(0, 20);

  // 給人看的文字裡不能出現企劃的內部 id（例：sustain-2026-11-03-4）——換成「11/03 Instagram」。
  const CH: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", threads: "Threads", line: "LINE", tiktok: "TikTok", email: "電子報", website: "官網" };
  const labels = [...args.plan.items]
    .sort((a, b) => b.id.length - a.id.length)
    .map((i) => [i.id, `${i.date.slice(5).replace("-", "/")} ${CH[i.platform] ?? i.platform}`] as const);
  const humanize = (s: string) => labels.reduce((acc, [id, label]) => acc.split(id).join(label), s);
  const assumptions = (Array.isArray(args.raw?.assumptions) ? args.raw.assumptions : [])
    .map((a: unknown) => humanize(str(a, 160)).slice(0, 140)).filter(Boolean).slice(0, 5);
  return { phases, paidIds, brief: humanize(str(args.raw?.brief, 500)).slice(0, 460), assumptions };
}

/** 品牌產業 → agents slug 裡的產業代號。 */
const INDUSTRY_TOKENS: Array<[RegExp, string]> = [
  [/餐|食|飲|咖啡|烘焙|甜點|牛排|肉|茶|酒|food|restaurant|cafe|coffee|bakery|beverage/i, "food"],
  [/美妝|保養|香氛|香水|彩妝|美容|beauty|cosmetic|skincare|fragrance/i, "beauty"],
  [/保健|醫|營養|健康|health|medical|nutrition|wellness/i, "health"],
  [/教育|課程|學|edu|course/i, "edu"],
  [/旅遊|旅行|飯店|travel|hotel/i, "travel"],
  [/軟體|科技|SaaS|AI|app|平台|顧問|行銷|software|tech|platform|agency|consult/i, "saas"],
  [/電商|網購|零售|服飾|文具|ecom|retail|fashion|stationery/i, "ecom"],
];

/**
 * 挑一位「會看數字」的專家：agents 裡 primarySkillBundleKey＝paid-media-operations 的人，
 * 產業對得上的優先、台灣市場優先、評分高的優先。slug 是「職能-產業-市場-編號」，市場看
 * 第三段（-tw-）；開頭的 meta_ads_tw 是職能名稱，不代表台灣市場（2026-09-30 在 dev
 * 選到 meta_ads_tw-ecom-sea-1754 就是這樣來的）。挑不到就用本週企劃已經在用的那位
 * （meta_ads_tw-ecom-cn-6845）。
 */
export async function pickKpiAgent(industry: string | null | undefined): Promise<KpiAgent | null> {
  const token = INDUSTRY_TOKENS.find(([re]) => re.test(String(industry ?? "")))?.[1] ?? "ecom";
  const toAgent = (r: any): KpiAgent => ({
    id: Number(r.id), slug: String(r.slug ?? ""),
    name: String(r.name_zh || r.name || r.englishName || ""),
    title: String(r.title_zh || r.title || ""), avatarUrl: String(r.avatarUrl ?? ""),
  });
  try {
    const [rows]: any = await localPool.execute(
      `SELECT id, slug, name, name_zh, englishName, title, title_zh, avatarUrl FROM agents
        WHERE isAvailable = 1 AND primarySkillBundleKey = 'paid-media-operations'
        ORDER BY (slug LIKE ?) DESC, (slug LIKE '%-tw-%') DESC, rating DESC, id ASC
        LIMIT 1`,
      [`%-${token}-%`],
    );
    if ((rows as any[])[0]) return toAgent((rows as any[])[0]);
    const [fb]: any = await localPool.execute(
      `SELECT id, slug, name, name_zh, englishName, title, title_zh, avatarUrl FROM agents WHERE slug = ? LIMIT 1`,
      ["meta_ads_tw-ecom-cn-6845"],
    );
    return (fb as any[])[0] ? toAgent((fb as any[])[0]) : null;
  } catch {
    return null;
  }
}

const PHASE_ZH: Record<string, string> = { teaser: "預熱", launch: "開賣", sustain: "加溫", lastcall: "倒數", encore: "返場" };

const SYSTEM = `你是這檔活動的投放與成效專家，替用戶把「總預算」和「總目標」拆到活動的每一個階段，並挑出哪幾篇要下廣告。

鐵則：
- 絕對數字只來自用戶填的總預算與總目標。你只給比例（share）與每段的相對目標（target 當作權重用），系統會自己換算成加起來剛好等於總數的數字。
- 每一段挑 1–3 個最能衡量那一段目的的指標，只能用這些 id：${KPI_METRICS.map((m) => `${m}（${KPI_METRIC_ZH[m]}）`).join("、")}。
- 預熱通常看觸及／互動，開賣與倒數看點擊與轉換，加溫看互動與點擊，返場看名單或回訪——但要依這檔活動的機制與目標判斷，不要照抄。
- 挑要下廣告的貼文（paid）：只能從企劃裡、通路是 ${PAID_CHANNELS.join("／")} 的那幾篇挑，用 id。預算少就少挑，集中在最關鍵的幾篇。
- 不准編業界平均、轉換率、CPM 等數字當事實。需要假設才能排的，寫進 assumptions，讓用戶自己確認。
- brief 用繁體中文三到五句：你怎麼分配、為什麼、最需要用戶確認什麼。
- brief 與 assumptions 裡不要寫企劃的 id；提到某一篇時用「日期＋通路」，例如「11/03 IG 那篇」。
- 只輸出 JSON。`;

/** 請投放專家拆 KPI 與預算 → 提案（還沒套用）。 */
export async function runKpiPlan(args: {
  eventId: number; userId: number; plan: CampaignPlan;
  budget: number | null; goals: KpiGoal[]; notes: string;
}): Promise<CampaignKpi & { paidIds: string[] }> {
  const facts = await eventFacts(args.eventId, args.userId);
  if (!facts) throw new Error("找不到這個活動");
  const [brandRows]: any = await localPool.execute(`SELECT industry FROM brands WHERE id = ? LIMIT 1`, [facts.brandId]);
  const agent = await pickKpiAgent((brandRows as any[])[0]?.industry);

  const live = args.plan.items.filter((i) => i.enabled).sort((a, b) => a.date.localeCompare(b.date));
  const phaseLines = CAMPAIGN_PHASE_IDS
    .filter((id) => live.some((i) => i.phase === id))
    .map((id) => {
      const list = live.filter((i) => i.phase === id);
      return `- ${PHASE_ZH[id]}（${id}）：${list[0]!.date} ~ ${list[list.length - 1]!.date}，${list.length} 篇${args.plan.phaseMessages?.[id] ? `；訊息「${args.plan.phaseMessages[id]}」` : ""}`;
    }).join("\n");
  const itemLines = live.map((i) => `- ${i.id}｜${PHASE_ZH[i.phase]}｜${i.date}｜${i.platform}｜${i.angle}`).join("\n");
  const goalLines = args.goals.length
    ? args.goals.map((g) => `- ${KPI_METRIC_ZH[g.metric]}（${g.metric}）：${g.target}`).join("\n")
    : "（用戶沒有填總目標）";

  const user = [
    `【活動】${facts.name}`,
    `【優惠機制／活動內容】${facts.settings.mechanic || "（沒寫）"}`,
    `【一句話訴求】${args.plan.smp}`,
    `【總預算】${args.budget ? `NT$${args.budget}` : "（用戶沒有填，只給比例）"}`,
    `【總目標】\n${goalLines}`,
    args.notes ? `【用戶補充】${args.notes}` : "",
    `【階段】\n${phaseLines}`,
    `【企劃裡的每一篇（id｜階段｜日期｜通路｜內容）】\n${itemLines}`,
    "",
    "只輸出 JSON，鍵名固定如下：",
    `{"brief":"三到五句","assumptions":["需要用戶確認的假設"],"phases":{"launch":{"share":35,"metrics":[{"metric":"clicks","target":40},{"metric":"leads","target":120}],"note":"這一段錢花在哪、為什麼（40字內）"}},"paid":["企劃裡的 id"]}`,
  ].filter(Boolean).join("\n");

  let system = SYSTEM;
  if (agent) {
    const { loadAgentKnowledge, withAgentKnowledge } = await import("../../platform/core/agentKnowledge.js");
    const knowledge = await loadAgentKnowledge(agent.id, { source: "campaign.planKpi" }).catch(() => "");
    system = withAgentKnowledge(`你是${agent.name}（${agent.title}）。\n\n${SYSTEM}`, knowledge);
  }
  const { buildBrandPrefix } = await import("./brandContext.js");
  const brain = await buildBrandPrefix(facts.brandId, null, args.eventId, "full").catch(() => "");
  const { invokeLLM } = await import("../../platform/core/llm.js");
  const r = await invokeLLM({
    messages: [
      { role: "system", content: brain ? `${system}\n\n# 品牌大腦${brain}` : system },
      { role: "user", content: user },
    ],
    maxTokens: 1800,
  });
  const text = String(r.choices?.[0]?.message?.content ?? "");
  const parsed = safeJSON<any>(text, null);
  if (!parsed) throw new Error("投放專家的回覆讀不懂，請再試一次");
  const v = validateKpiPlan({ raw: parsed, plan: args.plan, budget: args.budget, goals: args.goals });
  return {
    budget: args.budget, goals: args.goals, notes: args.notes,
    brief: v.brief, assumptions: v.assumptions, phases: v.phases, agent,
    generatedAt: new Date().toISOString(), paidIds: v.paidIds,
  };
}
