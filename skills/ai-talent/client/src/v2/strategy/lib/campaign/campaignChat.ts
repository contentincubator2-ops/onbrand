/**
 * 活動頁對話的提案：畫面上怎麼講、按「套用」之後企劃變成什麼樣。純函式、有測試。
 *
 * 提案由 server/content/core/campaign/campaignChat.ts 檢查過才回來（格式一樣，兩邊各宣告一份）；
 * 這裡只負責套用與描述，不再判斷合不合法。
 */
import { channelLabel } from "../../../platform/lib/channelMeta";
import type { CampaignPhaseId, CampaignPlan, CampaignPlanItem } from "./campaignSchema";
import { phaseShort } from "./campaignStage";
import { basisLabel, type BasisPatch } from "./campaignBasis";

export type CampaignOp =
  | { op: "add"; item: CampaignPlanItem }
  | { op: "update"; id: string; patch: Partial<CampaignPlanItem> }
  | { op: "remove"; id: string };

export interface CampaignProposal {
  ops: CampaignOp[];
  phaseMessages?: Partial<Record<CampaignPhaseId, string>>;
  smp?: string;
  /** 策略依據（11 段活動定位）的改法；只有策略總監會給。不在企劃裡，另外存（campaign.saveBasis）。 */
  basis?: BasisPatch;
}

export function isEmptyProposal(p: CampaignProposal | null | undefined): boolean {
  return !p || (!p.ops.length && !p.smp && !Object.keys(p.phaseMessages ?? {}).length && !Object.keys(p.basis ?? {}).length);
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
  for (const [path, v] of Object.entries(p.basis ?? {})) {
    const text = v == null ? L("（清空）", "(cleared)") : Array.isArray(v) ? v.join(L("、", ", ")) : v;
    lines.push(L(`策略依據・${basisLabel(path, false)}：「${text}」`, `Basis · ${basisLabel(path, true)}: “${text}”`));
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
      if (o.patch.paid === true) bits.push(L("改成廣告", "promote as ad"));
      if (o.patch.paid === false) bits.push(L("改回一般貼文", "back to organic"));
      if (bits.length) lines.push(`${L("✎", "✎")} ${md(i.date)} ${channelLabel(i.platform, en)}${L("：", ": ")}${bits.join(L("，", ", "))}`);
    }
  }
  return lines;
}

/**
 * 「@朱怡君 倒數多兩篇」「@投放 哪幾篇下廣告」→ 名冊上的那一位＋去掉 @ 的訊息。
 * 認人：名字（全名或開頭）→ 角色（「投放專家」或前兩字「投放」、英文、角色 id）。找不到就照原樣。純函式。
 */
export function routeMention(text: string, roster: Array<{ role: string; name: string; roleZh: string; roleEn: string }>): { to: string | null; message: string } {
  const m = text.match(/^\s*[@＠]\s*(\S+)\s*([\s\S]*)$/);
  if (!m) return { to: null, message: text };
  const word = m[1]!;
  const key = word.toLowerCase();
  // 每個人可以被叫的說法，長的先比（「投放專家」先於「投放」）。
  const calls = roster.flatMap((r) => [r.name, r.roleZh, r.roleZh.slice(0, 2), r.roleEn, r.role]
    .filter((c) => c && c.length >= 2)
    .map((c) => ({ r, c: c.toLowerCase() })))
    .sort((x, y) => y.c.length - x.c.length);
  const glued = calls.find(({ c }) => key.startsWith(c));
  const prefix = glued ? null : calls.find(({ c }) => key.length >= 1 && c.startsWith(key));
  const hit = glued ?? prefix;
  if (!hit) return { to: null, message: text };
  // 名字後面直接接字（「@朱怡君倒數多兩篇」）：切掉叫人的那段，留後半句。
  const tail = glued ? word.slice(hit.c.length) : "";
  return { to: hit.r.role, message: [tail, m[2]!.trim()].filter(Boolean).join(" ").trim() };
}
