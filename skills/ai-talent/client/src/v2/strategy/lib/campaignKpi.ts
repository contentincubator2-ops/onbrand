/**
 * 活動企劃的 KPI 與預算：語彙與顯示。規則（數字從哪來）在
 * server/content/core/campaign/campaignKpi.ts；指標 id 兩邊各宣告一份，
 * server 側的 campaignKpiVocab.test.ts 比對。
 */
import type { CampaignPhaseId } from "./campaignSchema";

export const KPI_METRICS = ["reach", "impressions", "engagement", "clicks", "leads", "orders", "revenue", "visits", "followers"] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

export const KPI_METRIC_LABEL: Record<KpiMetric, { zh: string; en: string }> = {
  reach: { zh: "觸及人數", en: "Reach" },
  impressions: { zh: "曝光次數", en: "Impressions" },
  engagement: { zh: "互動數", en: "Engagement" },
  clicks: { zh: "連結點擊", en: "Link clicks" },
  leads: { zh: "名單／申請", en: "Leads / sign-ups" },
  orders: { zh: "訂單數", en: "Orders" },
  revenue: { zh: "營收（NT$）", en: "Revenue (NT$)" },
  visits: { zh: "到店／到場", en: "Visits" },
  followers: { zh: "新增粉絲", en: "New followers" },
};

/** 可以下廣告的通路。 */
export const PAID_CHANNELS = ["facebook", "instagram", "threads", "tiktok", "line"];

export interface KpiGoal { metric: KpiMetric; target: number }
export interface PhaseKpi {
  share: number;
  budget: number | null;
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

export const metricLabel = (m: KpiMetric, en: boolean) => (en ? KPI_METRIC_LABEL[m]?.en : KPI_METRIC_LABEL[m]?.zh) ?? m;

/** NT$ 金額：萬以上用「萬」，比較好讀。 */
export function money(n: number | null | undefined, en: boolean): string {
  if (n == null) return "—";
  if (!en && n >= 10000) {
    const w = n / 10000;
    return `NT$${Number.isInteger(w) ? w : w.toFixed(1)} 萬`;
  }
  return `NT$${n.toLocaleString("en-US")}`;
}

/** 一個指標的一行：「名單／申請 120」或只有名稱（用戶沒給總數時）。 */
export function metricLine(m: { metric: KpiMetric; target: number | null }, en: boolean): string {
  const name = metricLabel(m.metric, en);
  if (m.target == null) return name;
  return m.metric === "revenue" ? `${name} ${money(m.target, en)}` : `${name} ${m.target.toLocaleString("en-US")}`;
}
