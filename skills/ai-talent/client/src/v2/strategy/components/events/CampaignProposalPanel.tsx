/**
 * CampaignProposalPanel — 活動頁右邊的「提案」，取代原本的策略依據。
 *
 * 2026-10-08（CJ「用戶的習慣，其實不太看策略依據的詳細內容，也不知道改完以後要怎樣。它們的
 * 習慣，是直接進去改每一篇文章…有一個按鈕，叫做 草擬提案…顯示方式，是在草擬提案這個按鈕有
 * 進度條，生成完成後，可以替代策略依據的頁面，讓用戶可以逐步修改，還可以儲存，然後還可以下載」）。
 *
 *   · 上半：策略段落（背景、目標、族群、洞察、策略、階段、通路）——模型從改好的企劃回頭寫的，
 *     每一段的標題與內文都可以直接改；離開那一格就存，也有「儲存」。
 *   · 下半：預算與 KPI、內容排程、每一篇的全文——不存在提案裡，每次從企劃與成品現讀。
 *     要改某一篇就打開那一篇改，這裡跟著變。
 *   · 下載：Word 打得開的檔（lib/campaign/campaignProposal.ts）。
 *
 * 定稿後也能草擬與修改：提案是在描述企劃，不會改到企劃。
 * 原本的策略依據沒有刪——標題列有一個小入口，策略總監在對話裡改的格子還是顯示在那裡。
 */
import React from "react";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faFileLines, faPenNib, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { CHANNEL_META } from "../../../platform/lib/channelMeta";
import type { CampaignPlan, CampaignPlanItem } from "../../lib/campaign/campaignSchema";
import { phaseLabel } from "../../lib/campaign/campaignStage";
import { money, metricLine } from "../../lib/campaign/campaignKpi";
import {
  downloadProposal, draftProgress, proposalDocHtml, proposalFilename, scheduleRows,
  type CampaignProposal, type ProposalPost, type ProposalSection,
} from "../../lib/campaign/campaignProposal";

const md = (s: string) => s.slice(5).replace("-", "/");

/** 草擬中的進度（0–100）；沒在草擬是 null。 */
export function useDraftProgress(busy: boolean): number | null {
  const [p, setP] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!busy) { setP(null); return; }
    const t0 = Date.now();
    setP(0);
    const t = setInterval(() => setP(draftProgress(Date.now() - t0)), 400);
    return () => clearInterval(t);
  }, [busy]);
  return p;
}

/**
 * 「草擬提案」按鈕：草擬中整顆按鈕變成進度條。進度是照時間估的（伺服器一次問完模型，
 * 沒有真的進度），所以只寫百分比，不假裝知道現在做到哪一步。
 */
export function DraftProposalButton({ label, progress, onPress, pressed, disabled, icon, en, title }: {
  label: string;
  /** 草擬中的進度；null＝沒在草擬。 */
  progress: number | null;
  onPress: () => void;
  /** 當成切換鈕用的時候（已經有提案）：目前是不是在看提案。 */
  pressed?: boolean;
  disabled?: boolean;
  icon?: any;
  en: boolean;
  title?: string;
}) {
  const busy = progress != null;
  return (
    <button type="button" onClick={onPress} disabled={disabled || busy} aria-pressed={pressed} aria-busy={busy} title={title}
      className={`relative overflow-hidden flex items-center gap-1.5 text-tiny font-semibold rounded-lg border px-2.5 py-1 transition disabled:cursor-default ${busy ? "border-foreground text-foreground min-w-[132px] justify-center" : pressed ? "bg-foreground text-background border-foreground" : "border-default-300 text-default-600 hover:border-foreground"}`}>
      {busy && (
        <span className="absolute inset-y-0 left-0 bg-default-300 transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${progress}%` }}
          role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} />
      )}
      <span className="relative flex items-center gap-1.5 tabular-nums">
        <FontAwesomeIcon icon={icon ?? faFileLines} className="text-[10px]" />
        {busy ? (en ? `Drafting ${progress}%` : `草擬中 ${progress}%`) : label}
      </span>
    </button>
  );
}

export default function CampaignProposalPanel({ proposal, plan, posts, postsLoading, eventName, range, en, drafting, draftError, onRedraft, onSave, saving, onOpenItem, onOpenBasis }: {
  proposal: CampaignProposal;
  plan: CampaignPlan;
  /** 寫好的那幾篇的全文（itemId → 文字）。 */
  posts: Record<string, ProposalPost>;
  postsLoading: boolean;
  eventName: string;
  range: string;
  en: boolean;
  /** 重新草擬中的進度；null＝沒在草擬。 */
  drafting: number | null;
  draftError: string;
  onRedraft: () => void;
  /** 存改過的段落；失敗就 throw。 */
  onSave: (sections: ProposalSection[]) => Promise<void>;
  saving: boolean;
  /** 打開／寫某一篇（跟地圖上同一個視窗）。 */
  onOpenItem: (item: CampaignPlanItem) => void;
  onOpenBasis: () => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const [sections, setSections] = React.useState<ProposalSection[]>(proposal.sections);
  const [dirty, setDirty] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const dirtyRef = React.useRef(false);
  dirtyRef.current = dirty;
  const sectionsRef = React.useRef(sections);
  sectionsRef.current = sections;

  // 重新草擬回來的是一份新的：換上去。自己存檔後重讀回來的不蓋掉正在打的字。
  React.useEffect(() => {
    if (dirtyRef.current) return;
    setSections(proposal.sections);
  }, [proposal.generatedAt, proposal.sections]);
  React.useEffect(() => { setDirty(false); setSaved(false); setConfirm(false); setSections(proposal.sections); }, [proposal.generatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (id: string, next: Partial<ProposalSection>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
    setDirty(true); setSaved(false);
  };
  const inFlight = React.useRef(false);
  const save = async () => {
    // 離開那一格會存一次，緊接著按「儲存」不用再送一次。
    if (!dirtyRef.current || inFlight.current) return;
    inFlight.current = true;
    const sending = sectionsRef.current;
    setErr("");
    try {
      await onSave(sending);
      // 存的這段時間又打了字：那些還沒存，留著「未儲存」。
      if (sectionsRef.current === sending) setDirty(false);
      setSaved(true);
    } catch (e: any) {
      setErr(e?.message || L("沒有存成，請再試一次", "Couldn't save — try again"));
    } finally { inFlight.current = false; }
  };

  const rows = scheduleRows(plan, posts, en);
  const itemById = new Map(plan.items.map((i) => [i.id, i]));
  const k = plan.kpi;
  const kpiLines: string[] = k && (k.budget || k.goals?.length || Object.keys(k.phases ?? {}).length)
    ? [
        k.budget ? `${L("總預算：", "Total budget: ")}${money(k.budget, en)}` : "",
        k.goals?.length ? `${L("目標：", "Goals: ")}${k.goals.map((g) => metricLine(g, en)).join(en ? ", " : "、")}` : "",
        ...Object.entries(k.phases ?? {}).map(([id, p]) => p
          ? `${phaseLabel(plan.phaseNames, id as any, en)}：${money(p.budget, en)}（${p.share}%）${p.metrics.length ? `　${p.metrics.map((m) => metricLine(m, en)).join(en ? ", " : "、")}` : ""}`
          : ""),
      ].filter(Boolean)
    : [];
  const download = () => downloadProposal(
    proposalDocHtml({ eventName, range, smp: plan.smp, sections, kpiLines, rows, en }),
    proposalFilename(eventName, en),
  );
  const when = (iso: string) => new Date(iso).toLocaleString(en ? "en-US" : "zh-TW", { dateStyle: "short", timeStyle: "short" });
  const busy = drafting != null;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-5 pt-4 pb-3 flex items-start gap-3 shrink-0 border-b border-divider bg-content1 flex-wrap">
        <div className="min-w-0">
          <p className="text-medium font-bold">{L("提案", "Proposal")}</p>
          <p className="text-tiny text-default-500">
            {L(`草擬於 ${when(proposal.generatedAt)}`, `Drafted ${when(proposal.generatedAt)}`)}
            {proposal.editedAt ? L(`・你改過 ${when(proposal.editedAt)}`, ` · edited ${when(proposal.editedAt)}`) : ""}
            {L("。每一段都可以直接改。", ". Every section is editable.")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {err ? <span className="text-tiny text-danger max-w-[220px] truncate" title={err}>{err}</span>
            : saving ? <span className="text-tiny text-default-500">{L("儲存中…", "Saving…")}</span>
            : dirty ? <span className="text-tiny text-default-500">{L("有未儲存的修改", "Unsaved changes")}</span>
            : saved ? <span className="text-tiny text-default-500">{L("已儲存", "Saved")}</span> : null}
          <Button size="sm" radius="md" className="bg-foreground text-background" isDisabled={!dirty || busy} isLoading={saving} onPress={save}>
            {L("儲存", "Save")}
          </Button>
          <Button size="sm" radius="md" variant="bordered" isDisabled={busy} startContent={<FontAwesomeIcon icon={faDownload} />} onPress={download}
            title={L("下載成 Word 檔（含排程與每一篇的全文）", "Download as a Word file, with the schedule and every post")}>
            {L("下載", "Download")}
          </Button>
          <DraftProposalButton en={en} icon={faRotateRight} label={L("重新草擬", "Redraft")} progress={drafting}
            onPress={() => (proposal.editedAt || dirty ? setConfirm(true) : onRedraft())}
            title={L("照現在的企劃與貼文重寫策略段落", "Rewrite the strategy sections from the current plan and posts")} />
          <button type="button" onClick={onOpenBasis} className="text-tiny text-default-500 hover:text-foreground">{L("策略依據", "Basis")}</button>
        </div>
        {confirm && !busy && (
          <div className="basis-full flex items-center gap-2 flex-wrap rounded-lg bg-default-100 px-3 py-2">
            <span className="text-tiny text-default-700">{L("重新草擬會換掉上面七段，包含你改過的地方。排程與每一篇的內容不受影響。", "Redrafting replaces the sections above, including your edits. The schedule and posts are not affected.")}</span>
            <Button size="sm" radius="full" className="h-7 bg-foreground text-background" onPress={() => { setConfirm(false); setDirty(false); onRedraft(); }}>{L("確定重新草擬", "Redraft")}</Button>
            <Button size="sm" radius="full" variant="light" className="h-7" onPress={() => setConfirm(false)}>{L("取消", "Cancel")}</Button>
          </div>
        )}
        {draftError && !busy && <p className="basis-full text-tiny text-danger">{draftError}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        <div className="max-w-[820px] mx-auto flex flex-col gap-3">
          {proposal.stale && !busy && (
            <p className="text-tiny text-default-700 rounded-lg bg-default-200 px-3 py-2">
              {L("草擬之後，企劃又改過了（標語、階段或某一篇）。下面的排程與全文已經是最新的；上面的策略段落要跟上的話，按「重新草擬」。",
                 "The plan changed after this was drafted. The schedule and posts below are current; press Redraft to bring the strategy sections up to date.")}
            </p>
          )}
          {!!proposal.unsourced?.length && (
            <p className="text-tiny text-default-700 rounded-lg border border-default-300 px-3 py-2">
              {L("請確認這幾個數字——它們不在你的活動資料與貼文裡，可能是 AI 自己寫的：", "Please check these numbers — they aren't in your campaign data or posts, so the AI may have made them up: ")}
              <b className="tabular-nums">{proposal.unsourced.join(en ? ", " : "、")}</b>
            </p>
          )}

          {plan.smp && (
            <section className="rounded-xl bg-content1 border border-divider px-4 py-3">
              <p className="text-[11px] tracking-widest text-default-500">{L("標語", "TAGLINE")}</p>
              <p className="text-large font-bold leading-snug">{plan.smp}</p>
            </section>
          )}

          {sections.map((s, i) => (
            <section key={s.id} className="rounded-xl bg-content1 border border-divider px-4 py-3 flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-small text-default-400 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <input value={s.title} maxLength={40} onChange={(e) => edit(s.id, { title: e.target.value })} onBlur={save}
                  aria-label={L("段落標題", "Section title")}
                  className="flex-1 min-w-0 text-medium font-bold bg-transparent outline-none rounded px-1 -mx-1 focus:bg-default-100" />
              </div>
              <textarea value={s.body} rows={3} maxLength={6000} onChange={(e) => edit(s.id, { body: e.target.value })} onBlur={save}
                style={{ fieldSizing: "content" } as React.CSSProperties}
                placeholder={L("這一段還是空的，可以自己寫。", "This section is empty — write it yourself.")}
                aria-label={s.title}
                className="w-full text-small leading-relaxed bg-transparent resize-none outline-none rounded px-1 -mx-1 focus:bg-default-100" />
            </section>
          ))}

          {kpiLines.length > 0 && (
            <section className="rounded-xl bg-content1 border border-divider px-4 py-3 flex flex-col gap-1">
              <p className="text-medium font-bold">{L("預算與 KPI", "Budget & KPIs")}</p>
              {kpiLines.map((l) => <p key={l} className="text-small leading-relaxed tabular-nums">{l}</p>)}
              <p className="text-tiny text-default-400">{L("這一段照「KPI 與預算」的設定顯示，要改請到那裡改。", "Shown from KPIs & budget — edit it there.")}</p>
            </section>
          )}

          <section className="rounded-xl bg-content1 border border-divider px-4 py-3 flex flex-col gap-2">
            <p className="text-medium font-bold">{L("內容排程", "Content schedule")}
              <span className="ml-2 text-tiny font-normal text-default-500">{L(`${rows.length} 篇・已寫好 ${rows.filter((r) => r.text).length} 篇`, `${rows.length} posts · ${rows.filter((r) => r.text).length} written`)}</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <thead>
                  <tr className="text-left text-tiny text-default-500 border-b border-divider">
                    <th className="py-1.5 pr-3 font-normal">{L("日期", "Date")}</th>
                    <th className="py-1.5 pr-3 font-normal">{L("階段", "Phase")}</th>
                    <th className="py-1.5 pr-3 font-normal">{L("通路", "Channel")}</th>
                    <th className="py-1.5 pr-3 font-normal">{L("這一篇要講什麼", "What it says")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-divider last:border-b-0 align-top">
                      <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">{md(r.date)}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{r.phaseName}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        <FontAwesomeIcon icon={CHANNEL_META[r.platform]?.icon ?? faPenNib} className="text-tiny mr-1.5" />{r.channel}{r.paid ? L("（廣告）", " (ad)") : ""}
                      </td>
                      <td className="py-1.5 leading-relaxed">{r.angle}{r.partner ? <span className="text-default-500">{L(`（給：${r.partner}）`, ` (for ${r.partner})`)}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl bg-content1 border border-divider px-4 py-3 flex flex-col gap-3">
            <div>
              <p className="text-medium font-bold">{L("每一篇的內容", "Every post in full")}</p>
              <p className="text-tiny text-default-500">{L("這裡直接讀每一篇目前的內容。要改就打開那一篇改，這裡與下載的檔案會跟著變。", "Read live from each post. Open a post to change it; this page and the download follow.")}</p>
            </div>
            {rows.map((r) => {
              const it = itemById.get(r.id);
              return (
                <div key={r.id} className={`border-l-[3px] pl-3 flex flex-col gap-1 ${r.text ? "border-success" : "border-default-300"}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-small font-semibold">
                      <span className="tabular-nums">{md(r.date)}</span>　{r.channel}・{r.phaseName}
                      <span className="ml-2 text-tiny font-normal text-default-500">{r.taskLabel}</span>
                    </p>
                    {it && (
                      <button type="button" onClick={() => onOpenItem(it)} className="ml-auto text-tiny text-default-500 hover:text-foreground">
                        {r.text ? L("打開這篇", "Open") : L("寫這篇", "Write it")}
                      </button>
                    )}
                  </div>
                  <p className="text-tiny text-default-500 leading-relaxed">{L("要講什麼：", "What it says: ")}{r.angle}</p>
                  {r.text
                    ? <p className="text-small leading-relaxed whitespace-pre-line">{r.text}</p>
                    : <p className="text-small text-default-400">{postsLoading && it?.outputId ? L("讀取中…", "Loading…") : L("尚未撰寫——寫好之後，全文會出現在這裡。", "Not written yet — the full text appears here once it is.")}</p>}
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
