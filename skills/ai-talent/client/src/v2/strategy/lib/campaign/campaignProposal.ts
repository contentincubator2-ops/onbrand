/**
 * campaignProposal — 提案頁（CampaignProposalPanel）要算的東西：排程表、下載用的 Word 檔。
 * 純函式、有測試。提案怎麼寫出來的在 server/content/core/campaign/campaignProposal.ts。
 *
 * 提案分兩半（2026-10-08）：策略段落是模型寫、使用者逐段改、存起來的；排程與每一篇的全文
 * 不存，每次都從企劃與成品現讀——使用者之後再改某一篇，提案後半段就是新的。
 */
import { channelLabel } from "../../../platform/lib/channelMeta";
import type { CampaignPhaseId, CampaignPlan } from "./campaignSchema";
import { phaseLabel } from "./campaignStage";

export interface ProposalSection { id: string; title: string; body: string }
export interface CampaignProposal {
  sections: ProposalSection[];
  generatedAt: string;
  editedAt?: string | null;
  /** 草擬之後企劃又改過。 */
  stale?: boolean;
  /** 模型寫了、但資料裡找不到的數字。 */
  unsourced?: string[];
}
/**
 * 排在「內容排程／每一篇全文」後面的段落（2026-10-09：預算與 KPI、廣告預算分配、整體回顧）。
 * 段落的定義在 server 的 PROPOSAL_SECTIONS（tail），server 側的測試比對兩邊。
 */
export const PROPOSAL_TAIL_IDS = ["budget", "adBudget", "recap"];
/** 不經過模型的填空表：空格（＿＿）是留給使用者填的。 */
export const PROPOSAL_FILL_IDS = ["budget", "adBudget"];

/** 提案的段落分成排程前、排程後兩半（順序不變）。 */
export function splitSections<T extends { id: string }>(sections: T[]): { head: T[]; tail: T[] } {
  return {
    head: sections.filter((s) => !PROPOSAL_TAIL_IDS.includes(s.id)),
    tail: sections.filter((s) => PROPOSAL_TAIL_IDS.includes(s.id)),
  };
}

/** 寫好的那一篇的全文（campaign.proposalPosts）。 */
export interface ProposalPost { title: string; text: string }

export interface ScheduleRow {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  phase: CampaignPhaseId;
  phaseName: string;
  platform: string;
  channel: string;
  taskLabel: string;
  angle: string;
  paid: boolean;
  partner: string;
  /** 寫好的全文；還沒寫是 null。 */
  text: string | null;
}

/** 提案後半段的排程：要做的每一篇，照日期排。 */
export function scheduleRows(
  plan: Pick<CampaignPlan, "items" | "phaseNames">, posts: Record<string, ProposalPost> | null | undefined, en: boolean,
): ScheduleRow[] {
  return plan.items.filter((i) => i.enabled)
    .sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform))
    .map((i) => ({
      id: i.id, date: i.date, phase: i.phase, phaseName: phaseLabel(plan.phaseNames, i.phase, en),
      platform: i.platform, channel: channelLabel(i.platform, en), taskLabel: i.taskLabel, angle: i.angle,
      paid: !!i.paid, partner: i.partner ?? "",
      text: posts?.[i.id]?.text?.trim() || null,
    }));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** 一段文字 → 段落（空一行分段，段內換行保留）。 */
const paras = (s: string) => s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
const md = (s: string) => s.slice(5).replace("-", "/");

/**
 * 下載用的文件：Word 打得開、可以繼續改的 HTML（存成 .doc）。不用另外的套件，
 * 表格與標題 Word 都認得。
 */
export function proposalDocHtml(args: {
  eventName: string; range: string; smp: string;
  sections: ProposalSection[];
  /** 舊提案（沒有「預算與 KPI」那一段）才用：照 KPI 設定列的幾行。 */
  kpiLines: string[];
  rows: ScheduleRow[];
  en: boolean;
}): string {
  const { en } = args;
  const L = (zh: string, e: string) => (en ? e : zh);
  const head = [L("日期", "Date"), L("階段", "Phase"), L("通路", "Channel"), L("形式", "Format"), L("這一篇要講什麼", "What it says"), L("狀態", "Status")];
  const table = `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%">`
    + `<tr>${head.map((h) => `<th style="background:#f2f2f2;text-align:left">${esc(h)}</th>`).join("")}</tr>`
    + args.rows.map((r) => `<tr>${[
      md(r.date), r.phaseName, r.channel + (r.paid ? L("（廣告）", " (ad)") : ""), r.taskLabel,
      r.angle + (r.partner ? L(`（給：${r.partner}）`, ` (for ${r.partner})`) : ""),
      r.text ? L("已寫好", "Written") : L("尚未撰寫", "Not written"),
    ].map((c) => `<td style="vertical-align:top">${esc(c)}</td>`).join("")}</tr>`).join("")
    + `</table>`;
  const posts = args.rows.map((r) => `<h3>${esc(`${md(r.date)}　${r.channel}・${r.phaseName}｜${r.taskLabel}`)}</h3>`
    + `<p style="color:#666">${esc(L("這一篇要講什麼：", "What it says: ") + r.angle)}</p>`
    + (r.text ? paras(r.text) : `<p style="color:#999">${esc(L("（尚未撰寫）", "(Not written yet)"))}</p>`)).join("");
  // 空的段落不印（使用者沒填的那一段，交出去的檔案裡不留一個空標題）。
  const { head: front, tail: back } = splitSections(args.sections);
  const block = (list: ProposalSection[]) => list.filter((s) => s.body.trim()).map((s) => `<h2>${esc(s.title)}</h2>${paras(s.body)}`).join("");
  return `﻿<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">`
    + `<head><meta charset="utf-8"><title>${esc(args.eventName)}</title>`
    + `<style>body{font-family:"Microsoft JhengHei","PingFang TC",sans-serif;font-size:11pt;line-height:1.7}h1{font-size:22pt}h2{font-size:15pt;margin-top:22pt}h3{font-size:12pt;margin-top:14pt}td,th{font-size:10pt}</style></head><body>`
    + `<h1>${esc(args.eventName)}${esc(L("　宣傳提案", " — campaign proposal"))}</h1>`
    + (args.range ? `<p style="color:#666">${esc(L("活動期間：", "Dates: ") + args.range)}</p>` : "")
    + (args.smp ? `<p style="font-size:14pt"><b>${esc(args.smp)}</b></p>` : "")
    + block(front)
    + (args.kpiLines.length && !back.some((s) => s.id === "budget") ? `<h2>${esc(L("預算與 KPI", "Budget & KPIs"))}</h2>${args.kpiLines.map((l) => `<p>${esc(l)}</p>`).join("")}` : "")
    + `<h2>${esc(L("內容排程", "Content schedule"))}</h2>${table}`
    + `<h2>${esc(L("每一篇的內容", "Every post in full"))}</h2>${posts}`
    + block(back)
    + `</body></html>`;
}

/** 檔名不能有的字元換掉。 */
export const proposalFilename = (eventName: string, en: boolean) =>
  `${eventName.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "campaign"}-${en ? "proposal" : "提案"}.doc`;

export function downloadProposal(html: string, filename: string): void {
  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 馬上 revoke 在 Safari／Firefox 會下載到空檔（lib/ics.ts 的教訓）。
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * 草擬中的進度條走到哪（0–100）。伺服器是一次問完模型，沒有真的進度可以回報，所以是照
 * 經過的時間估的：一開始快、越後面越慢，沒寫完之前不會超過 94。純函式。
 */
export function draftProgress(elapsedMs: number, expectedMs = 45_000): number {
  if (elapsedMs <= 0) return 0;
  return Math.min(94, Math.round(94 * (1 - Math.exp((-2.4 * elapsedMs) / expectedMs))));
}
