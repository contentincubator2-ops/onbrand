/**
 * CampaignChatCard — 活動頁左邊的對話卡：跟內容企劃、策略總監談這份企劃。
 *
 * 2026-09-30（CJ「用對話的方式，看是否要增加其他管道宣傳，或是依照該策略，用對話的方式，
 * 將執行計畫完成」＋畫面稿 A 的 AI 對話卡）。
 *
 *   · 第一則永遠是「企劃檢查」（空窗、沒排到的通路）——這些不用問模型就知道。
 *   · 放大到某一段時，對話預設在談那一段。
 *   · 定稿後不能再改企劃，輸入框收起來。
 *   · 回覆太長被截斷時，救回完整的那幾條，告訴使用者說「繼續」改剩下的。
 *
 * 2026-09-30（CJ「內容企劃應該是一個人，要匹配 AI agent」）：卡上是真的人（agents 裡的
 * 社群／內容策略師，見 server/strategy/core/campaignTeam.ts），帶著他自己的知識回答。
 *
 * 2026-09-30（CJ「在這個介面上，我偏好是都在左邊完成回答，雖然要換人，但也在同一個地方
 * 換人，並且要掌握之前討論的脈絡。最大的驚喜，就是我跟 agent 講完後，圖上的訴求或是
 * 行事曆就會修改」）：
 *   · 同一張卡、同一串對話、兩個人：內容企劃管怎麼排，策略總監（右下角選過的那位）管
 *     方向。標題的「換人」切換；內容企劃遇到方向問題直接把話轉給總監，總監接著回答，
 *     不用跳到右下角。活動頁的右下角總監收起來（directorDock）。
 *   · 兩個人都讀同一串（標了誰說的）；這串記在這台瀏覽器，重新整理還在。
 *   · 改法一回來就寫進企劃——圖上的訴求、各段訊息、行事曆馬上變；留一顆「復原」
 *     （只有最新那一次可以復原，免得蓋掉之後的修改）。
 *
 * 2026-10-02（CJ「無法讓策略總監再交回去給內容企劃」「提到的人跟可以換的人名字不一樣」）：
 *   · 交棒雙向：伺服器回 handoff {to, question}，誰都能交給另一位；一串最多轉兩手。
 *   · 名字一律用現在的名冊（campaign.team）顯示——舊訊息存的名字可能是換人之前的。
 */
import React from "react";
import { Avatar } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faCheck, faRotateLeft, faUpRightAndDownLeftFromCenter, faDownLeftAndUpRightToCenter, faRightLeft } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import type { CampaignPhaseId, CampaignPlan } from "../../lib/campaignSchema";
import type { StageNote } from "../../lib/campaignStage";
import { phaseShort } from "../../lib/campaignStage";
import { applyProposal, describeProposal, isEmptyProposal, type CampaignProposal } from "../../lib/campaignChat";
import { readStoredDirector } from "../../lib/strategistDirectors";
import type { BasisPatch, BasisValue } from "../../lib/campaignBasis";

type Speaker = "planner" | "director";
interface Agent { id: number; name: string; title: string; avatarUrl: string }

interface Msg {
  role: "user" | "assistant" | "handoff";
  content: string;
  speaker?: Speaker;
  name?: string;
  /** 這則帶來的修改（已經寫進企劃）。 */
  proposal?: CampaignProposal;
  /** 修改前的企劃，復原用；只存在這次開著的頁面裡。 */
  before?: CampaignPlan;
  /** 修改前的策略依據（只有被改的那幾格），復原用。 */
  beforeBasis?: BasisPatch;
  undone?: boolean;
  truncated?: boolean;
}

const KEY = (eventId: number) => `onbrand.campaignChat.${eventId}`;
function loadMsgs(eventId: number): Msg[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(eventId)) ?? "[]");
    return Array.isArray(raw) ? raw.slice(-40) : [];
  } catch { return []; }
}
function saveMsgs(eventId: number, msgs: Msg[]) {
  try {
    localStorage.setItem(KEY(eventId), JSON.stringify(msgs.slice(-40).map(({ before: _b, beforeBasis: _bb, ...m }) => m)));
  } catch { /* 私密模式：重新整理之後對話就沒了，不影響企劃 */ }
}

export default function CampaignChatCard({ eventId, brandId, plan, phase, notes, locked, en, onApply, basis, onApplyBasis, view, grow, expanded, onToggleExpand }: {
  eventId: number;
  brandId: number | null;
  plan: CampaignPlan;
  phase: CampaignPhaseId | null;
  notes: StageNote[];
  locked: boolean;
  en: boolean;
  /** 寫進企劃：父層換掉企劃並立刻存。 */
  onApply: (next: CampaignPlan) => void;
  /** 策略依據目前的值（能改的格子）。 */
  basis?: Record<string, BasisValue | null>;
  /** 寫進策略依據：父層存、右邊切到策略依據並標出剛改的格子。 */
  onApplyBasis?: (patch: BasisPatch) => void;
  /** 右邊正在看的：企劃地圖或策略依據（總監據此判斷「這裡」指哪裡）。 */
  view?: "map" | "basis";
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
  const [msgs, setMsgs] = React.useState<Msg[]>(() => loadMsgs(eventId));
  const [speaker, setSpeaker] = React.useState<Speaker>(() => {
    const last = [...loadMsgs(eventId)].reverse().find((m) => m.role === "assistant");
    return last?.speaker === "director" ? "director" : "planner";
  });
  const [text, setText] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState<Speaker | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const planRef = React.useRef(plan);
  planRef.current = plan;
  const basisRef = React.useRef(basis);
  basisRef.current = basis;
  const msgsRef = React.useRef(msgs);
  msgsRef.current = msgs;

  const chatMut = (trpc as any).campaign.chat.useMutation();
  const directorAgentId = React.useMemo(() => (brandId ? readStoredDirector(brandId, "brand") : null), [brandId]);
  const teamQ = (trpc as any).campaign.team.useQuery(
    { eventId, directorAgentId },
    { refetchOnWindowFocus: false, staleTime: 10 * 60_000 },
  );
  const agents: Record<Speaker, Agent | null> = { planner: teamQ.data?.planner ?? null, director: teamQ.data?.director ?? null };
  const roleName = (s: Speaker) => (s === "director" ? L("策略總監", "Strategy director") : L("內容企劃", "Content planner"));
  const cur = agents[speaker];
  const other: Speaker = speaker === "planner" ? "director" : "planner";

  React.useEffect(() => { saveMsgs(eventId, msgs); }, [eventId, msgs]);
  React.useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, busy]);

  const history = (list: Msg[]) => list
    .filter((x) => x.content && x.role !== "handoff")
    .slice(-14)
    .map((x) => ({ role: x.role as "user" | "assistant", content: x.content.slice(0, 1200), ...(x.speaker ? { speaker: x.speaker } : {}), ...(x.name ? { name: x.name.slice(0, 40) } : {}) }));

  /** 問某一位。handoff＝另一位轉過來的，不是使用者親口說的；hops＝這一串轉了幾手。 */
  const ask = (who: Speaker, message: string, opts: { handoff?: boolean; hops?: number; prior: Msg[] }) => {
    setErr("");
    setBusy(who);
    const hops = opts.hops ?? 0;
    chatMut.mutate({ eventId, message, phase, history: history(opts.prior), speaker: who, directorAgentId, handoff: !!opts.handoff, hops, view: view ?? "map" }, {
      onSuccess: (r: any) => {
        setBusy(null);
        const name = r?.agent?.name ?? agents[who]?.name ?? "";
        const proposal: CampaignProposal | undefined = isEmptyProposal(r?.proposal) ? undefined : r.proposal;
        let before: CampaignPlan | undefined;
        let beforeBasis: BasisPatch | undefined;
        if (proposal && !locked) {
          if (proposal.ops.length || proposal.smp || Object.keys(proposal.phaseMessages ?? {}).length) {
            before = planRef.current;
            onApply(applyProposal(planRef.current, proposal));
          }
          if (proposal.basis && Object.keys(proposal.basis).length && onApplyBasis) {
            beforeBasis = Object.fromEntries(Object.keys(proposal.basis).map((p) => [p, basisRef.current?.[p] ?? null]));
            onApplyBasis(proposal.basis);
          }
        }
        const reply: Msg = {
          role: "assistant", content: String(r?.reply ?? ""), speaker: who, name,
          ...(proposal ? { proposal, before, beforeBasis } : {}), truncated: !!r?.truncated,
        };
        const next = [...msgsRef.current, reply];
        // 交棒（雙向）：內容企劃遇到方向 → 總監；總監遇到加篇／刪篇／挪日期 → 內容企劃。
        // 同一張卡裡接著回答，之後使用者的話也由接手的那位回答。
        const to: Speaker | null = r?.handoff?.to === "director" || r?.handoff?.to === "planner" ? r.handoff.to : null;
        const question = String(r?.handoff?.question ?? "");
        if (to && to !== who && question && hops < 2) {
          const toName = agents[to]?.name ?? "";
          const fromName = name || roleName(who);
          next.push({ role: "handoff", content: toName ? L(`${fromName}請 ${toName}（${roleName(to)}）接手`, `${fromName} hands over to ${toName}`) : L(`交給${roleName(to)}`, `Handing over to the ${roleName(to)}`) });
          setMsgs(next);
          setSpeaker(to);
          ask(to, question, { handoff: true, hops: hops + 1, prior: next });
          return;
        }
        setMsgs(next);
      },
      onError: (e: any) => { setBusy(null); setErr(String(e?.message ?? "").slice(0, 160)); },
    });
  };

  const send = (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    const next = [...msgs, { role: "user" as const, content: m }];
    setMsgs(next);
    setText("");
    ask(speaker, m, { prior: msgs });
  };

  // 只有最新那一次修改可以復原；之後又改過，復原會把後面的也蓋掉。
  const lastChangeIdx = (() => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i]!.proposal && !msgs[i]!.undone) return i; return -1; })();
  const undo = (idx: number) => {
    const m = msgs[idx];
    if (!m || (!m.before && !m.beforeBasis) || locked) return;
    if (m.before) onApply(m.before);
    if (m.beforeBasis) onApplyBasis?.(m.beforeBasis);
    setMsgs((prev) => prev.map((x, k) => (k === idx ? { ...x, undone: true, before: undefined, beforeBasis: undefined } : x)));
  };

  const switchTo = (s: Speaker) => {
    if (s === speaker || busy) return;
    setSpeaker(s);
    const a = agents[s];
    setMsgs((prev) => [...prev, { role: "handoff", content: a ? L(`換 ${a.name}（${roleName(s)}）`, `Now talking to ${a.name} (${roleName(s)})`) : L(`換${roleName(s)}`, `Now: ${roleName(s)}`) }]);
  };

  const clear = () => {
    if (busy) return;
    setMsgs([]);
  };

  const suggestions = speaker === "director"
    ? view === "basis"
      ? [L("關鍵洞察寫得更具體一點", "Make the key insight sharper"),
         L("禁用元素加上「免費」", "Add “free” to the don'ts")]
      : [L("這檔的一句話訴求再收斂一點", "Tighten the core message"),
         L("每一段的訊息有沒有接得起來？", "Do the phase messages flow?")]
    : phase
      ? [L(`${phaseShort(phase, false)}期再多排一篇 IG`, `One more Instagram post in ${phaseShort(phase, true)}`),
         L("這一段的內容太像了，換個角度", "These posts are too similar — vary the angles")]
      : [L("官網也要發，開賣日加一篇公告頁", "Add a launch announcement on the website"),
         L("倒數那週多排兩篇", "Two more posts in the last-call week")];

  const face = (a: Agent | null, s: Speaker, size = "w-7 h-7") => (a?.avatarUrl
    ? <Avatar src={a.avatarUrl} name={a.name} size="sm" className={`${size} shrink-0 ring-2 ring-background/60`} />
    : <span className={`${size} rounded-full bg-background text-foreground grid place-items-center text-tiny font-bold shrink-0`}>{s === "director" ? L("總", "D") : L("內", "C")}</span>);

  return (
    <div className={`rounded-2xl bg-foreground text-background px-4 py-3 flex flex-col gap-2.5 ${grow ? "flex-1 min-h-[300px]" : ""}`}>
      <div className="flex items-center gap-2.5">
        {face(cur, speaker)}
        <div className="min-w-0">
          <p className="text-small font-semibold leading-tight truncate" title={cur ? `${cur.name}｜${cur.title}` : undefined}>
            {cur ? `${cur.name}　${roleName(speaker)}` : roleName(speaker)}
          </p>
          <p className="text-[11px] opacity-60 leading-tight">
            {view === "basis" ? L("正在看：策略依據", "Looking at: strategy basis")
              : phase ? L(`正在看：${phaseShort(phase, false)}期`, `Looking at: ${phaseShort(phase, true)}`) : L("正在看：整檔總覽", "Looking at: overview")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {!locked && (
            <button type="button" onClick={() => switchTo(other)} disabled={!!busy}
              title={agents[other] ? L(`換 ${agents[other]!.name}（${roleName(other)}）`, `Switch to ${agents[other]!.name}`) : L(`換${roleName(other)}`, `Switch to ${roleName(other)}`)}
              className="h-7 rounded-lg px-2 flex items-center gap-1.5 text-[11.5px] opacity-80 hover:opacity-100 hover:bg-background/15 transition disabled:opacity-40">
              <FontAwesomeIcon icon={faRightLeft} className="text-[10px]" />
              {face(agents[other], other, "w-5 h-5")}
              <span>{L("換人", "Switch")}</span>
            </button>
          )}
          {onToggleExpand && (
            <button type="button" onClick={onToggleExpand}
              aria-label={expanded ? L("收回對話", "Collapse chat") : L("展開對話", "Expand chat")}
              title={expanded ? L("收回", "Collapse") : L("展開到整欄", "Expand to full column")}
              className="w-7 h-7 rounded-lg grid place-items-center opacity-70 hover:opacity-100 hover:bg-background/15 transition">
              <FontAwesomeIcon icon={expanded ? faDownLeftAndUpRightToCenter : faUpRightAndDownLeftFromCenter} className="text-tiny" />
            </button>
          )}
        </div>
      </div>

      <div ref={boxRef} className={`flex flex-col gap-2 overflow-y-auto pr-1 -mr-1 ${grow ? "flex-1 min-h-[120px]" : "max-h-[280px]"}`}>
        {notes.map((n, k) => <p key={`n${k}`} className="text-small leading-relaxed">{en ? n.en : n.zh}</p>)}
        {msgs.length > 0 && !busy && (
          <button type="button" onClick={clear} className="self-center text-[11px] opacity-50 hover:opacity-90">{L("清掉這串對話", "Clear conversation")}</button>
        )}
        {msgs.map((m, k) => {
          if (m.role === "handoff") {
            return <p key={k} className="self-center text-[11px] opacity-60 flex items-center gap-1.5"><FontAwesomeIcon icon={faRightLeft} />{m.content}</p>;
          }
          return (
            <div key={k} className={m.role === "user" ? "self-end max-w-[88%]" : "flex flex-col gap-2"}>
              {m.role === "assistant" && (agents[m.speaker === "director" ? "director" : "planner"]?.name || m.name) && (
                <p className="text-[11px] opacity-60 -mb-1">{agents[m.speaker === "director" ? "director" : "planner"]?.name || m.name}・{roleName(m.speaker === "director" ? "director" : "planner")}</p>
              )}
              {m.content && (
                <p className={`text-small leading-relaxed whitespace-pre-line ${m.role === "user" ? "bg-background/15 rounded-xl px-3 py-1.5" : ""}`}>{m.content}</p>
              )}
              {m.proposal && (
                <div className={`rounded-xl border px-3 py-2 flex flex-col gap-1.5 ${m.undone ? "border-background/15 opacity-60" : "border-background/40"}`}>
                  <p className="text-[11px] opacity-70 flex items-center gap-1.5">
                    {m.undone ? L("已復原", "Undone") : <><FontAwesomeIcon icon={faCheck} />{L("已改進企劃", "Applied to the plan")}</>}
                  </p>
                  {m.truncated && (
                    <p className="text-[11px] opacity-70">{L("改的篇數太多，先改了前幾條；說「繼續」改剩下的。", "Too many changes at once — did the first few. Say “continue” for the rest.")}</p>
                  )}
                  {describeProposal(m.before ?? plan, m.proposal, en).map((line, j) => (
                    <p key={j} className="text-tiny leading-snug">{line}</p>
                  ))}
                  {k === lastChangeIdx && (m.before || m.beforeBasis) && !locked && (
                    <button type="button" onClick={() => undo(k)}
                      className="self-start text-tiny opacity-70 hover:opacity-100 flex items-center gap-1.5 pt-0.5">
                      <FontAwesomeIcon icon={faRotateLeft} />{L("復原", "Undo")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {busy && (
          <p className="text-small opacity-60">
            {agents[busy] ? L(`${agents[busy]!.name}想一下…`, `${agents[busy]!.name} is thinking…`) : L(`${roleName(busy)}想一下…`, "Thinking…")}
          </p>
        )}
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
              placeholder={speaker === "director"
                ? L("跟策略總監說：例如「訴求不要有免費兩個字」", "Tell the director, e.g. “drop the word free”")
                : L("跟內容企劃說：例如「Threads 每週一篇」", "Tell the planner, e.g. “one Threads post a week”")}
              aria-label={L(`跟${roleName(speaker)}說`, `Message the ${roleName(speaker)}`)}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="flex-1 min-w-0 resize-none bg-background/10 rounded-xl px-3 py-2 text-small placeholder:text-background/45 outline-none focus:bg-background/15 max-h-28"
            />
            <button type="submit" disabled={!text.trim() || !!busy} aria-label={L("送出", "Send")}
              className="w-8 h-8 rounded-full bg-background text-foreground grid place-items-center disabled:opacity-40 shrink-0">
              <FontAwesomeIcon icon={faArrowUp} className="text-tiny" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
