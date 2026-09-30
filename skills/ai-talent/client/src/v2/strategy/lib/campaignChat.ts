/**
 * 活動頁對話的提案：畫面上怎麼講、按「套用」之後企劃變成什麼樣。純函式、有測試。
 *
 * 提案由 server/strategy/core/campaignChat.ts 檢查過才回來（格式一樣，兩邊各宣告一份）；
 * 這裡只負責套用與描述，不再判斷合不合法。
 */
import { channelLabel } from "../../content/lib/channelMeta";
import type { CampaignPhaseId, CampaignPlan, CampaignPlanItem } from "./campaignSchema";
import { phaseShort } from "./campaignStage";

export type CampaignOp =
  | { op: "add"; item: CampaignPlanItem }
  | { op: "update"; id: string; patch: Partial<CampaignPlanItem> }
  | { op: "remove"; id: string };

export interface CampaignProposal {
  ops: CampaignOp[];
  phaseMessages?: Partial<Record<CampaignPhaseId, string>>;
  smp?: string;
}

export function isEmptyProposal(p: CampaignProposal | null | undefined): boolean {
  return !p || (!p.ops.length && !p.smp && !Object.keys(p.phaseMessages ?? {}).length);
}

/** 套用提案 → 新的企劃。已寫好的那篇就算提案裡有也不動（伺服器已經擋過，這裡再保險一次）。 */
export function applyProposal(plan: CampaignPlan, p: CampaignProposal): CampaignPlan {
  const written = new Set(plan.items.filter((i) => i.outputId).map((i) => i.id));
  let items = [...plan.items];
  for (const o of p.ops) {
    if (o.op === "add") {
      if (!items.some((i) => i.id === o.item.id)) items.push(o.item);
    } else if (o.op === "update") {
      if (written.has(o.id)) continue;
      items = items.map((i) => (i.id === o.id ? { ...i, ...o.patch } : i));
    } else if (o.op === "remove") {
      if (written.has(o.id)) continue;
      items = items.filter((i) => i.id !== o.id);
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    ...plan,
    items,
    ...(p.smp ? { smp: p.smp } : {}),
    ...(p.phaseMessages ? { phaseMessages: { ...(plan.phaseMessages ?? {}), ...p.phaseMessages } } : {}),
  };
}

const md = (s: string) => s.slice(5).replace("-", "/");

/** 提案的每一條，用一句話講給人看。 */
export function describeProposal(plan: CampaignPlan, p: CampaignProposal, en: boolean): string[] {
  const L = (zh: string, e: string) => (en ? e : zh);
  const byId = new Map(plan.items.map((i) => [i.id, i]));
  const lines: string[] = [];
  if (p.smp) lines.push(L(`訴求改成「${p.smp}」`, `Core message → “${p.smp}”`));
  for (const [id, m] of Object.entries(p.phaseMessages ?? {})) {
    lines.push(L(`${phaseShort(id as CampaignPhaseId, false)}的訊息改成「${m}」`, `${phaseShort(id as CampaignPhaseId, true)} message → “${m}”`));
  }
  for (const o of p.ops) {
    if (o.op === "add") {
      const i = o.item;
      lines.push(L(`＋ ${md(i.date)} ${channelLabel(i.platform, false)}：${i.angle}`, `+ ${md(i.date)} ${channelLabel(i.platform, true)}: ${i.angle}`));
    } else if (o.op === "remove") {
      const i = byId.get(o.id);
      if (i) lines.push(L(`－ 刪掉 ${md(i.date)} ${channelLabel(i.platform, false)}：${i.angle}`, `− Remove ${md(i.date)} ${channelLabel(i.platform, true)}: ${i.angle}`));
    } else {
      const i = byId.get(o.id);
      if (!i) continue;
      const bits: string[] = [];
      if (o.patch.date) bits.push(L(`改到 ${md(o.patch.date)}`, `move to ${md(o.patch.date)}`));
      if (o.patch.platform) bits.push(L(`改發 ${channelLabel(o.patch.platform, false)}`, `switch to ${channelLabel(o.patch.platform, true)}`));
      if (o.patch.enabled === false) bits.push(L("這篇不做", "skip"));
      if (o.patch.enabled === true) bits.push(L("放回企劃", "put back"));
      if (o.patch.angle) bits.push(L(`內容改成「${o.patch.angle}」`, `now: “${o.patch.angle}”`));
      if (bits.length) lines.push(`${L("✎", "✎")} ${md(i.date)} ${channelLabel(i.platform, en)}：${bits.join(L("，", ", "))}`);
    }
  }
  return lines;
}
