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
import { faDownload, faFileLines, faPenNib, faRotateRight, faCommentDots } from "@fortawesome/free-solid-svg-icons";
import ConvertingToAIFormat from "../positioning/ConvertingToAIFormat";
import { CHANNEL_META } from "../../../platform/lib/channelMeta";
import type { CampaignPlan, CampaignPlanItem } from "../../lib/campaign/campaignSchema";
import { phaseLabel } from "../../lib/campaign/campaignStage";
import { money, metricLine } from "../../lib/campaign/campaignKpi";
import {
  downloadProposal, draftProgress, proposalDocHtml, proposalFilename, scheduleRows, splitSections, PROPOSAL_FILL_IDS,
  type AlignResult, type CampaignProposal, type ProposalPost, type ProposalQuote, type ProposalSection,
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

/** 父層（活動頁）要動提案的段落時用：對話裡內容企劃改好的那一段、梳理前先把手上的存掉。 */
export interface ProposalPanelHandle {
  /** 畫面上現在的段落（含還沒存的字）。 */
  sections: () => ProposalSection[];
  /** 換掉某一段的內文並存檔。 */
  replace: (id: string, body: string) => Promise<void>;
  /** 把還沒存的存掉。 */
  flush: () => Promise<void>;
}

/**
 * 2026-10-09（CJ「反白一段文字後，直接帶入顧問對話中…針對那一段話，進行修改」「提案中修改了
 * 某些地方，應該要問用戶，要不要根據這個調整，進行整份文件的邏輯梳理，要的話，進入動畫…
 * 實際上的貼文等等，也要調整」）：
 *   · 每一段標題旁有「請〈內容企劃〉改」：反白了字就帶那幾句，沒反白就指整段——帶進左邊的對話，
 *     使用者講一句要怎麼改，她只改那一段，改完這一段標「剛改」、對話裡可以復原。
 *   · 提案有段落被改過（自己改的或請她改的）：上方問要不要照這些修改梳理整份。按了就換成
 *     「轉換成 AI 格式」那支動畫；回來列出改了哪幾段、哪幾篇還沒寫的貼文換了方向、
 *     哪幾篇寫好的建議重寫（那幾篇不會自動改），可以整個復原。
 */
const CampaignProposalPanel = React.forwardRef<ProposalPanelHandle, {
  /** 內容企劃的名字（沒有就用職稱）。 */
  writerName: string;
  /** 能不能請她改（對話卡在不在）。 */
  canAsk: boolean;
  onQuote: (q: ProposalQuote) => void;
  /** 剛被改過的段落（標出來幾秒）。 */
  recent: Set<string>;
  aligning: boolean;
  /** 伺服器正在重啟、畫面在自動重送：說一聲。 */
  waitingServer?: boolean;
  alignError: string;
  onAlign: () => void;
  alignResult: AlignResult | null;
  onUndoAlign: () => void;
  onCloseAlign: () => void;
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
  /** 打開／寫某一篇（跟地圖上同一個視窗）。ask＝打開後先幫他填好要請 AI 怎麼改。 */
  onOpenItem: (item: CampaignPlanItem, ask?: string) => void;
  onOpenBasis: () => void;
}>(function CampaignProposalPanel({
  proposal, plan, posts, postsLoading, eventName, range, en, drafting, draftError, onRedraft, onSave, saving, onOpenItem, onOpenBasis,
  writerName, canAsk, onQuote, recent, aligning, waitingServer, alignError, onAlign, alignResult, onUndoAlign, onCloseAlign,
}, ref) {
  const L = (zh: string, e: string) => (en ? e : zh);
  /** 使用者在哪一段反白了哪幾句。 */
  const [sel, setSel] = React.useState<{ id: string; text: string } | null>(null);
  /** 「要不要梳理」那一列按了先不用（同一批修改不再問）。 */
  const [skipped, setSkipped] = React.useState("");
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
      if (sectionsRef.current === sending) { dirtyRef.current = false; setDirty(false); }
      setSaved(true);
    } catch (e: any) {
      setErr(e?.message || L("沒有存成，請再試一次", "Couldn't save — try again"));
    } finally { inFlight.current = false; }
  };
  React.useImperativeHandle(ref, () => ({
    sections: () => sectionsRef.current,
    replace: async (id, body) => {
      const next = sectionsRef.current.map((s) => (s.id === id ? { ...s, body } : s));
      sectionsRef.current = next;
      setSections(next);
      dirtyRef.current = true; setDirty(true); setSaved(false);
      // 前一次存檔還在路上就等它回來再存這一次（不然這一段會留在「未儲存」）。
      for (let i = 0; i < 40 && inFlight.current; i++) await new Promise((r) => setTimeout(r, 150));
      await save();
    },
    flush: async () => {
      for (let i = 0; i < 40 && inFlight.current; i++) await new Promise((r) => setTimeout(r, 150));
      await save();
    },
  }));

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
  const { head, tail } = splitSections(sections);
  // onSelect 在有些瀏覽器不會每次都來，滑鼠放開、鍵盤放開也各看一次。
  const pick = (id: string, t: HTMLTextAreaElement) => {
    const text = t.value.slice(t.selectionStart ?? 0, t.selectionEnd ?? 0).trim();
    setSel((cur) => (text.length >= 2 ? (cur?.id === id && cur.text === text ? cur : { id, text: text.slice(0, 800) }) : cur?.id === id ? null : cur));
  };
  const sectionCards = (list: ProposalSection[], from: number) => list.map((s, i) => (
            <section key={s.id} className={`rounded-xl border border-divider px-4 py-3 flex flex-col gap-1.5 transition-colors duration-700 ${recent.has(s.id) ? "bg-default-200" : "bg-content1"}`}>
              <div className="flex items-baseline gap-2">
                <span className="text-small text-default-400 tabular-nums">{String(from + i + 1).padStart(2, "0")}</span>
                <input value={s.title} maxLength={40} onChange={(e) => edit(s.id, { title: e.target.value })} onBlur={save}
                  aria-label={L("段落標題", "Section title")}
                  className="flex-1 min-w-0 text-medium font-bold bg-transparent outline-none rounded px-1 -mx-1 focus:bg-default-100" />
                {recent.has(s.id) && <span className="text-[11px] font-semibold shrink-0">{L("剛改", "Updated")}</span>}
                {canAsk && (() => {
                  const picked = sel?.id === s.id ? sel.text : "";
                  return (
                    // onMouseDown 擋掉：按下去的時候不要讓文字框失焦、反白消失。
                    <button type="button" onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onQuote({ sectionId: s.id, title: s.title, text: picked }); setSel(null); }}
                      title={L("反白幾句再按，就只改那幾句；不反白就是改整段。會帶到左邊的對話，你說一句要怎麼改。", "Select a few sentences first to change just those; otherwise it means the whole section. It goes to the chat on the left — say how to change it.")}
                      className={`shrink-0 flex items-center gap-1.5 text-tiny rounded-full px-2.5 py-0.5 transition ${picked ? "bg-foreground text-background font-semibold" : "text-default-500 hover:text-foreground hover:bg-default-100"}`}>
                      <FontAwesomeIcon icon={faCommentDots} className="text-[10px]" />
                      {picked ? L(`請${writerName}改反白的這幾句`, `Ask ${writerName} to change the selection`) : L(`請${writerName}改`, `Ask ${writerName}`)}
                    </button>
                  );
                })()}
              </div>
              <textarea value={s.body} rows={3} maxLength={6000} onChange={(e) => edit(s.id, { body: e.target.value })} onBlur={save}
                onSelect={(e) => pick(s.id, e.currentTarget)} onMouseUp={(e) => pick(s.id, e.currentTarget)} onKeyUp={(e) => pick(s.id, e.currentTarget)}
                style={{ fieldSizing: "content" } as React.CSSProperties}
                placeholder={L("這一段的資料不夠，AI 先空著沒有寫。請自己填。", "There wasn't enough to go on, so this was left blank. Fill it in yourself.")}
                aria-label={s.title}
                className="w-full text-small leading-relaxed bg-transparent resize-none outline-none rounded px-1 -mx-1 focus:bg-default-100" />
              {PROPOSAL_FILL_IDS.includes(s.id) && (
                <p className="text-tiny text-default-400">{L("空格（＿＿）請直接填上數字。已經設定過的預算與 KPI 會自動帶進來；重新草擬不會洗掉你填的。", "Fill in the blanks (＿＿). Budget and KPIs you've already set are carried in; redrafting keeps what you filled.")}</p>
              )}
            </section>
  ));
  const when = (iso: string) => new Date(iso).toLocaleString(en ? "en-US" : "zh-TW", { dateStyle: "short", timeStyle: "short" });
  const busy = drafting != null;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-5 pt-4 pb-3 flex items-start gap-3 shrink-0 border-b border-divider bg-content1 flex-wrap">
        <div className="min-w-0">
          <p className="text-medium font-bold">{L("提案", "Proposal")}</p>
          <p className="text-tiny text-default-500">
            {proposal.by?.name
              ? L(`${proposal.by.name}（${proposal.by.title}）草擬於 ${when(proposal.generatedAt)}`, `Drafted by ${proposal.by.name} · ${when(proposal.generatedAt)}`)
              : L(`草擬於 ${when(proposal.generatedAt)}`, `Drafted ${when(proposal.generatedAt)}`)}
            {proposal.editedAt ? L(`・改過 ${when(proposal.editedAt)}`, ` · edited ${when(proposal.editedAt)}`) : ""}
          </p>
          <p className="text-tiny text-default-500">
            {canAsk
              ? L(`可以直接改字，或反白幾句按「請${writerName}改」。改提案不會動到已經寫好的貼文。`, `Edit the text directly, or select a few sentences and press “Ask ${writerName}”. Editing the proposal never changes posts that are already written.`)
              : L("每一段都可以直接改。改提案不會動到已經寫好的貼文。", "Every section is editable. Editing the proposal never changes posts that are already written.")}
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
            <span className="text-tiny text-default-700">{L("重新草擬會換掉 AI 寫的每一段，包含你改過的地方。你在預算與廣告預算分配填的數字、排程與每一篇的內容不受影響。", "Redrafting replaces every AI-written section, including your edits. Numbers you filled into the budget tables, the schedule and the posts are kept.")}</span>
            <Button size="sm" radius="full" className="h-7 bg-foreground text-background" onPress={() => { setConfirm(false); setDirty(false); onRedraft(); }}>{L("確定重新草擬", "Redraft")}</Button>
            <Button size="sm" radius="full" variant="light" className="h-7" onPress={() => setConfirm(false)}>{L("取消", "Cancel")}</Button>
          </div>
        )}
        {draftError && !busy && <p className="basis-full text-tiny text-danger">{draftError}</p>}
        {waitingServer && <p className="basis-full text-tiny text-default-600" role="status">{L("系統正在更新，會自動再送一次，不用重按。你的內容都還在。", "The server is updating — this will retry by itself. Nothing is lost.")}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {aligning ? (
          <div className="max-w-[820px] mx-auto">
            <ConvertingToAIFormat
              title={L("正在照你的修改，梳理整份提案", "Realigning the whole proposal to your changes")}
              stages={en
                ? ["Reading the sections you changed…", "Checking the logic between sections…", "Comparing every post with the proposal…", "Listing what needs to change…"]
                : ["讀你改過的段落…", "檢查前後段落的邏輯…", "對照每一篇貼文的方向…", "整理要調整的地方…"]}
              hint={L("你改過的段落一個字都不會動。已經寫好的貼文也不會自動改，只會列出建議重寫的。", "Sections you changed stay exactly as they are. Posts already written are never changed automatically — they are only listed for rewriting.")} />
          </div>
        ) : (
        <div className="max-w-[820px] mx-auto flex flex-col gap-3">
          {alignResult && (
            <section className="rounded-xl border-2 border-foreground bg-content1 px-4 py-3 flex flex-col gap-2" role="status">
              <p className="text-small font-bold">{L(`${alignResult.name}梳理好了`, `${alignResult.name} realigned the proposal`)}</p>
              {alignResult.reply && <p className="text-small leading-relaxed">{alignResult.reply}</p>}
              <ul className="text-small leading-relaxed list-disc pl-4">
                {alignResult.sectionTitles.length > 0 && <li>{L(`提案改了 ${alignResult.sectionTitles.length} 段：${alignResult.sectionTitles.join("、")}`, `${alignResult.sectionTitles.length} sections updated: ${alignResult.sectionTitles.join(", ")}`)}</li>}
                {alignResult.planChanged && <li>{L("標語或階段訊息跟著調整了", "The tagline or phase messages were adjusted")}</li>}
                {alignResult.itemCount > 0 && <li>{L(`${alignResult.itemCount} 篇還沒寫的貼文換了方向（之後寫出來就是新的方向）`, `${alignResult.itemCount} unwritten posts got a new direction`)}</li>}
                {!alignResult.sectionTitles.length && !alignResult.planChanged && !alignResult.itemCount && !alignResult.rewrite.length && (
                  <li>{L("其他段落與貼文都對得上，沒有需要調整的。", "Everything else already lines up — nothing to change.")}</li>
                )}
              </ul>
              {alignResult.rewrite.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-small font-semibold">{L(`這 ${alignResult.rewrite.length} 篇已經寫好，建議照新的提案重寫（不會自動改）`, `${alignResult.rewrite.length} written posts should be rewritten (not changed automatically)`)}</p>
                  {alignResult.rewrite.map(({ item, reason }) => (
                    <div key={item.id} className="flex items-start gap-2 border-l-[3px] border-default-400 pl-2.5">
                      <p className="text-small leading-relaxed flex-1 min-w-0">
                        <b className="tabular-nums">{md(item.date)}</b>　{rows.find((r) => r.id === item.id)?.channel ?? item.platform}
                        <span className="block text-default-600">{reason}</span>
                      </p>
                      <Button size="sm" radius="full" variant="flat" className="h-7 shrink-0" onPress={() => onOpenItem(item, reason)}>{L("打開，照這個改", "Open & apply")}</Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" radius="full" className="h-7 bg-foreground text-background" onPress={onCloseAlign}>{L("好", "OK")}</Button>
                {(alignResult.sectionTitles.length > 0 || alignResult.planChanged || alignResult.itemCount > 0) && (
                  <Button size="sm" radius="full" variant="light" className="h-7" onPress={onUndoAlign}>{L("復原這次梳理", "Undo")}</Button>
                )}
              </div>
            </section>
          )}
          {!alignResult && !!proposal.touched?.length && skipped !== proposal.touched.join("|") && !busy && (
            <section className="sticky top-0 z-10 rounded-xl border border-foreground bg-content1 shadow-small px-4 py-3 flex items-center gap-3 flex-wrap" role="status">
              <p className="text-small leading-relaxed flex-1 min-w-[240px]">
                {L(`你改了「${sections.filter((s) => proposal.touched!.includes(s.id)).map((s) => s.title).join("」「")}」。要不要照這些修改，把整份提案的邏輯與貼文方向梳理一次？`,
                   `You changed “${sections.filter((s) => proposal.touched!.includes(s.id)).map((s) => s.title).join("”, “")}”. Realign the rest of the proposal and the posts to match?`)}
                <span className="block text-tiny text-default-500">{L("你改過的段落不會被動到；已經寫好的貼文只會列出建議，不會自動改。", "Your edits stay as they are; written posts are only flagged, never changed automatically.")}</span>
                {alignError && <span className="block text-tiny text-danger">{alignError}</span>}
              </p>
              <Button size="sm" radius="full" className="h-7 bg-foreground text-background" isDisabled={dirty || saving} onPress={onAlign}>{L("梳理整份", "Realign")}</Button>
              <Button size="sm" radius="full" variant="light" className="h-7" onPress={() => setSkipped(proposal.touched!.join("|"))}>{L("先不用", "Not now")}</Button>
            </section>
          )}
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

          {sectionCards(head, 0)}

          {kpiLines.length > 0 && !tail.some((s) => s.id === "budget") && (
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

          {sectionCards(tail, head.length)}
        </div>
        )}
      </div>
    </div>
  );
});
export default CampaignProposalPanel;
