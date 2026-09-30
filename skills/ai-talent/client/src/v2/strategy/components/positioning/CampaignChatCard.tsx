/**
 * CampaignChatCard — 活動頁左下角的對話卡：跟內容企劃談這份企劃。
 *
 * 2026-09-30（CJ「用對話的方式，看是否要增加其他管道宣傳，或是依照該策略，用對話的方式，
 * 將執行計畫完成」＋畫面稿 A 的 AI 對話卡）。
 *
 *   · 第一則永遠是「企劃檢查」（空窗、沒排到的通路）——這些不用問模型就知道。
 *   · 說一句話 → 內容企劃回一兩句＋一份提案（加哪幾篇、改哪幾篇）；按「套用」才寫進
 *     企劃，按「不要」就什麼都沒變。提案的檢查在 server/strategy/core/campaignChat.ts。
 *   · 放大到某一段時，對話預設在談那一段。
 *   · 定稿後不能再改企劃，輸入框收起來。
 *   · 策略（訴求、主角）要大改，找右下角的策略總監；這張卡管的是「怎麼排」。
 *
 * 2026-09-30（CJ「內容企劃應該是一個人，要匹配 AI agent」＋「跟右下方的策略總監，是否會
 * 衝突」）：
 *   · 卡上是一個真的人（agents 裡的社群／內容策略師，依品牌產業挑，見
 *     server/strategy/core/campaignTeam.ts），帶著他自己的知識回答。
 *   · 分工：策略總監管方向、內容企劃管怎麼排。問到方向時她不自己改，給一顆
 *     「請策略總監回答」，按了就打開右下角的總監、問題已經填好。
 *   · 回覆太長被截斷時，救回完整的那幾條，告訴使用者說「繼續」改剩下的。
 */
import React from "react";
import { Avatar } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faCheck, faArrowRight, faUpRightAndDownLeftFromCenter, faDownLeftAndUpRightToCenter } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import type { CampaignPhaseId, CampaignPlan } from "../../lib/campaignSchema";
import type { StageNote } from "../../lib/campaignStage";
import { phaseShort } from "../../lib/campaignStage";
import { applyProposal, describeProposal, isEmptyProposal, type CampaignProposal } from "../../lib/campaignChat";

interface Msg {
  role: "user" | "assistant"; content: string;
  proposal?: CampaignProposal; state?: "open" | "applied" | "dismissed";
  /** 方向的問題：轉給策略總監。 */
  askDirector?: string | null;
  /** 回覆被截斷，只救回前幾條。 */
  truncated?: boolean;
}

export default function CampaignChatCard({ eventId, plan, phase, notes, locked, en, onApply, grow, expanded, onToggleExpand }: {
  eventId: number;
  plan: CampaignPlan;
  phase: CampaignPhaseId | null;
  notes: StageNote[];
  locked: boolean;
  en: boolean;
  /** 套用提案：父層換掉企劃並立刻存。 */
  onApply: (next: CampaignPlan) => void;
  /** 撐滿父層剩下的高度（活動頁左欄）；對話區跟著長，而不是固定一小格。 */
  grow?: boolean;
  /**
   * 2026-09-30（CJ「這個對話窗，我想讓用戶也可以有選項，可以展開，展開後，就是將左側欄的
   * 版面佈滿的高度即可」）：展開＝佔滿左欄（左欄其他東西先收起來），再按一次收回。
   */
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [text, setText] = React.useState("");
  const [err, setErr] = React.useState("");
  const boxRef = React.useRef<HTMLDivElement>(null);
  const chatMut = (trpc as any).campaign.chat.useMutation();
  const teamQ = (trpc as any).campaign.team.useQuery({ eventId }, { refetchOnWindowFocus: false, staleTime: 10 * 60_000 });
  const agent = teamQ.data?.planner ?? null;

  React.useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, chatMut.isPending]);

  const send = (message: string) => {
    const m = message.trim();
    if (!m || chatMut.isPending) return;
    setErr("");
    const history = msgs.filter((x) => x.content).map((x) => ({ role: x.role, content: x.content.slice(0, 1200) }));
    setMsgs((prev) => [...prev, { role: "user", content: m }]);
    setText("");
    chatMut.mutate({ eventId, message: m, phase, history }, {
      onSuccess: (r: any) => setMsgs((prev) => [...prev, {
        role: "assistant", content: String(r?.reply ?? ""),
        ...(isEmptyProposal(r?.proposal) ? {} : { proposal: r.proposal, state: "open" as const }),
        askDirector: r?.askDirector ?? null,
        truncated: !!r?.truncated,
      }]),
      onError: (e: any) => setErr(String(e?.message ?? "").slice(0, 160)),
    });
  };

  const settle = (idx: number, state: "applied" | "dismissed") => {
    const m = msgs[idx];
    if (!m?.proposal) return;
    if (state === "applied") onApply(applyProposal(plan, m.proposal));
    setMsgs((prev) => prev.map((x, k) => (k === idx ? { ...x, state } : x)));
  };

  const suggestions = phase
    ? [L(`${phaseShort(phase, false)}期再多排一篇 IG`, `One more Instagram post in ${phaseShort(phase, true)}`),
       L("這一段的內容太像了，換個角度", "These posts are too similar — vary the angles")]
    : [L("官網也要發，開賣日加一篇公告頁", "Add a launch announcement on the website"),
       L("倒數那週多排兩篇", "Two more posts in the last-call week")];

  return (
    <div className={`rounded-2xl bg-foreground text-background px-4 py-3 flex flex-col gap-2.5 ${grow ? "flex-1 min-h-[300px]" : ""}`}>
      <div className="flex items-center gap-2.5">
        {agent?.avatarUrl
          ? <Avatar src={agent.avatarUrl} name={agent.name} size="sm" className="w-7 h-7 shrink-0 ring-2 ring-background/60" />
          : <span className="w-7 h-7 rounded-full bg-background text-foreground grid place-items-center text-tiny font-bold shrink-0">{L("內", "C")}</span>}
        <div className="min-w-0">
          <p className="text-small font-semibold leading-tight truncate" title={agent ? `${agent.name}｜${agent.title}` : undefined}>
            {agent ? `${agent.name}　${L("內容企劃", "Content planner")}` : L("內容企劃", "Content planner")}
          </p>
          <p className="text-[11px] opacity-60 leading-tight">
            {phase ? L(`正在看：${phaseShort(phase, false)}期`, `Looking at: ${phaseShort(phase, true)}`) : L("正在看：整檔總覽", "Looking at: overview")}
          </p>
        </div>
        {onToggleExpand && (
          <button type="button" onClick={onToggleExpand}
            aria-label={expanded ? L("收回對話", "Collapse chat") : L("展開對話", "Expand chat")}
            title={expanded ? L("收回", "Collapse") : L("展開到整欄", "Expand to full column")}
            className="ml-auto w-7 h-7 shrink-0 rounded-lg grid place-items-center opacity-70 hover:opacity-100 hover:bg-background/15 transition">
            <FontAwesomeIcon icon={expanded ? faDownLeftAndUpRightToCenter : faUpRightAndDownLeftFromCenter} className="text-tiny" />
          </button>
        )}
      </div>

      <div ref={boxRef} className={`flex flex-col gap-2 overflow-y-auto pr-1 -mr-1 ${grow ? "flex-1 min-h-[120px]" : "max-h-[280px]"}`}>
        {notes.map((n, k) => <p key={`n${k}`} className="text-small leading-relaxed">{en ? n.en : n.zh}</p>)}
        {msgs.map((m, k) => (
          <div key={k} className={m.role === "user" ? "self-end max-w-[88%]" : "flex flex-col gap-2"}>
            {m.content && (
              <p className={`text-small leading-relaxed ${m.role === "user" ? "bg-background/15 rounded-xl px-3 py-1.5" : ""}`}>{m.content}</p>
            )}
            {m.askDirector && (
              <button type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("onbrand:ask-director", { detail: { question: m.askDirector } }))}
                className="self-start text-tiny font-semibold bg-background text-foreground rounded-lg px-3 py-1 flex items-center gap-1.5">
                {L("請策略總監回答", "Ask the strategy director")}<FontAwesomeIcon icon={faArrowRight} />
              </button>
            )}
            {m.proposal && (
              <div className={`rounded-xl border px-3 py-2 flex flex-col gap-1.5 ${m.state === "open" ? "border-background/40" : "border-background/15 opacity-60"}`}>
                <p className="text-[11px] opacity-70">{L("提案（還沒寫進企劃）", "Proposal (not applied yet)")}</p>
                {m.truncated && (
                  <p className="text-[11px] opacity-70">{L("改的篇數太多，先提出前幾條；套用後說「繼續」改剩下的。", "Too many changes at once — here are the first few. Say “continue” for the rest.")}</p>
                )}
                {describeProposal(plan, m.proposal, en).map((line, j) => (
                  <p key={j} className="text-tiny leading-snug">{line}</p>
                ))}
                {m.state === "open" ? (
                  <div className="flex items-center gap-3 pt-0.5">
                    <button type="button" onClick={() => settle(k, "applied")}
                      className="bg-background text-foreground rounded-lg px-3 py-0.5 text-tiny font-bold">{L("套用", "Apply")}</button>
                    <button type="button" onClick={() => settle(k, "dismissed")} className="text-tiny opacity-70 hover:opacity-100">{L("不要", "Discard")}</button>
                  </div>
                ) : (
                  <p className="text-tiny opacity-70 flex items-center gap-1.5">
                    {m.state === "applied" ? <><FontAwesomeIcon icon={faCheck} />{L("已套用", "Applied")}</> : L("沒有套用", "Discarded")}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {chatMut.isPending && <p className="text-small opacity-60">{agent ? L(`${agent.name}想一下…`, `${agent.name} is thinking…`) : L("內容企劃想一下…", "Thinking…")}</p>}
        {err && <p className="text-tiny text-danger-300">{err}</p>}
      </div>

      {locked ? (
        <p className="text-tiny opacity-60">{L("企劃已定稿。要再調整，先按標題旁的鎖頭解鎖。", "The plan is locked. Unlock it by the title to change it.")}</p>
      ) : (
        <>
          {msgs.length === 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}
                  className="text-[11.5px] border border-dashed border-background/35 rounded-full px-2.5 py-0.5 opacity-80 hover:opacity-100">{s}</button>
              ))}
            </div>
          )}
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <textarea
              value={text} rows={1} maxLength={800}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }}
              placeholder={L("跟內容企劃說：例如「Threads 每週一篇」", "Tell the planner, e.g. “one Threads post a week”")}
              aria-label={L("跟內容企劃說", "Message the planner")}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="flex-1 min-w-0 resize-none bg-background/10 rounded-xl px-3 py-2 text-small placeholder:text-background/45 outline-none focus:bg-background/15 max-h-28"
            />
            <button type="submit" disabled={!text.trim() || chatMut.isPending} aria-label={L("送出", "Send")}
              className="w-8 h-8 rounded-full bg-background text-foreground grid place-items-center disabled:opacity-40 shrink-0">
              <FontAwesomeIcon icon={faArrowUp} className="text-tiny" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
