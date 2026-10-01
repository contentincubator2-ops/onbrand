/**
 * CampaignChatCard — 活動頁左邊的對話卡：跟這檔活動的團隊談這份企劃。
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
 * 2026-09-30（CJ「都在左邊完成回答，雖然要換人，但也在同一個地方換人，並且要掌握之前討論
 * 的脈絡…講完後圖上的訴求或是行事曆就會修改」）：同一張卡、同一串對話；改法一回來就寫進
 * 企劃，留一顆「復原」（只有最新那一次可以復原）。這串記在這台瀏覽器。
 *
 * 2026-10-02（CJ「無法讓策略總監再交回去給內容企劃」「提到的人跟可以換的人名字不一樣」）：
 * 交棒雙向、一串最多轉兩手；名字一律用現在的名冊（campaign.team）顯示。
 *
 * 2026-10-02（CJ「活動經過很多 Agent 協作才產出整個企劃，換人只有兩個人可以輪替不對」
 * 「問起來還是卡卡的」）：
 *   · 卡頂一排是這檔活動的團隊（server/strategy/core/campaignRoster.ts）：總監、定位撰寫者、
 *     內容企劃、投放專家、網紅／異業合作、話題公關——點頭像換人，滑過去看他管什麼、做了什麼；
 *     打「@名字」直接找那一位。誰都能把話轉給名冊上的另一位。
 *   · 等待：思考列有那一位的頭像、跳動的點與秒數；別人在回時可以先打下一句，排隊送出；
 *     失敗有「再試一次」；回完游標回到輸入框。
 */
import React from "react";
import { Avatar } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faCheck, faRotateLeft, faUpRightAndDownLeftFromCenter, faDownLeftAndUpRightToCenter, faRightLeft, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import type { CampaignPhaseId, CampaignPlan } from "../../lib/campaignSchema";
import type { StageNote } from "../../lib/campaignStage";
import { phaseShort } from "../../lib/campaignStage";
import { applyProposal, describeProposal, isEmptyProposal, routeMention, type CampaignProposal } from "../../lib/campaignChat";
import { readStoredDirector } from "../../lib/strategistDirectors";
import type { BasisPatch, BasisValue } from "../../lib/campaignBasis";

/** 名冊上的角色 id（伺服器 campaignRoster.CAMPAIGN_ROLES）。 */
type Speaker = string;
interface Member {
  id: number; name: string; title: string; avatarUrl: string;
  role: Speaker; roleZh: string; roleEn: string; duty: string; dutyEn: string; did: string; didEn: string;
}

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

interface AskOpts { handoff?: boolean; from?: Speaker | null; hops?: number; prior: Msg[] }

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
   * 2026-09-30（CJ「這個對話窗…可以展開，展開後，就是將左側欄的版面佈滿的高度即可」）：
   * 展開＝佔滿左欄（左欄其他東西先收起來），再按一次收回。
   */
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const [msgs, setMsgs] = React.useState<Msg[]>(() => loadMsgs(eventId));
  const [speaker, setSpeaker] = React.useState<Speaker>(() => {
    const last = [...loadMsgs(eventId)].reverse().find((m) => m.role === "assistant");
    return last?.speaker ?? "planner";
  });
  const [text, setText] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState<Speaker | null>(null);
  const [queued, setQueued] = React.useState<string[]>([]);
  const lastAsk = React.useRef<{ who: Speaker; message: string; opts: AskOpts } | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const planRef = React.useRef(plan);
  planRef.current = plan;
  const basisRef = React.useRef(basis);
  basisRef.current = basis;
  const msgsRef = React.useRef(msgs);
  msgsRef.current = msgs;
  const speakerRef = React.useRef(speaker);
  speakerRef.current = speaker;

  const chatMut = (trpc as any).campaign.chat.useMutation();
  const directorAgentId = React.useMemo(() => (brandId ? readStoredDirector(brandId, "brand") : null), [brandId]);
  const teamQ = (trpc as any).campaign.team.useQuery(
    { eventId, directorAgentId },
    { refetchOnWindowFocus: false, staleTime: 10 * 60_000 },
  );
  // 名冊（新）；舊伺服器只回 planner／director 時退回這兩位。
  const roster: Member[] = React.useMemo(() => {
    const r = teamQ.data?.roster;
    if (Array.isArray(r) && r.length) return r as Member[];
    const legacy = (a: any, role: Speaker, zh: string, e: string): Member | null => (a ? { ...a, role, roleZh: zh, roleEn: e, duty: "", dutyEn: "", did: "", didEn: "" } : null);
    return [legacy(teamQ.data?.director, "director", "策略總監", "Strategy director"), legacy(teamQ.data?.planner, "planner", "內容企劃", "Content planner")].filter(Boolean) as Member[];
  }, [teamQ.data]);
  const byRole = React.useMemo(() => new Map(roster.map((m) => [m.role, m])), [roster]);
  const byRoleRef = React.useRef(byRole);
  byRoleRef.current = byRole;
  const roleName = (s: Speaker) => {
    const m = byRole.get(s);
    if (m) return en ? m.roleEn : m.roleZh;
    return s === "director" ? L("策略總監", "Strategy director") : L("內容企劃", "Content planner");
  };
  const cur = byRole.get(speaker) ?? null;

  // 名冊換了（例如網紅線拿掉了）而目前的人不在上面：回到內容企劃。
  React.useEffect(() => {
    if (roster.length && !byRole.has(speaker)) setSpeaker(byRole.has("planner") ? "planner" : roster[0]!.role);
  }, [roster, byRole, speaker]);

  React.useEffect(() => { saveMsgs(eventId, msgs); }, [eventId, msgs]);
  React.useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: busy ? "auto" : "smooth" });
  }, [msgs.length, busy, queued.length]);

  const history = (list: Msg[]) => list
    .filter((x) => x.content && x.role !== "handoff")
    .slice(-14)
    .map((x) => ({ role: x.role as "user" | "assistant", content: x.content.slice(0, 1200), ...(x.speaker ? { speaker: x.speaker } : {}), ...(x.name ? { name: x.name.slice(0, 40) } : {}) }));

  // 一串（使用者一句＋轉手）結束後，送下一句排隊的話。
  const queueRef = React.useRef<string[]>([]);
  queueRef.current = queued;
  const drainRef = React.useRef<() => void>(() => {});

  /** 問某一位。handoff＝另一位轉過來的，不是使用者親口說的；hops＝這一串轉了幾手。 */
  const ask = (who: Speaker, message: string, opts: AskOpts) => {
    setErr("");
    setBusy(who);
    lastAsk.current = { who, message, opts };
    const hops = opts.hops ?? 0;
    chatMut.mutate({ eventId, message, phase, history: history(opts.prior), speaker: who, from: opts.from ?? null, directorAgentId, handoff: !!opts.handoff, hops, view: view ?? "map" }, {
      onSuccess: (r: any) => {
        const team = byRoleRef.current;
        const name = r?.agent?.name ?? team.get(who)?.name ?? "";
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
        // 交棒：名冊上任何一位都能把話轉給另一位；同一張卡裡接著回答，之後使用者的話也由接手的那位回答。
        const to: Speaker | null = typeof r?.handoff?.to === "string" ? r.handoff.to : null;
        const question = String(r?.handoff?.question ?? "");
        if (to && to !== who && question && hops < 2) {
          const toName = team.get(to)?.name ?? "";
          const fromName = name || roleName(who);
          next.push({ role: "handoff", content: toName ? L(`${fromName}請 ${toName}（${roleName(to)}）接手`, `${fromName} hands over to ${toName}`) : L(`交給${roleName(to)}`, `Handing over to the ${roleName(to)}`) });
          msgsRef.current = next;
          setMsgs(next);
          setSpeaker(to);
          ask(to, question, { handoff: true, from: who, hops: hops + 1, prior: next });
          return;
        }
        msgsRef.current = next;
        setMsgs(next);
        setBusy(null);
        drainRef.current();
      },
      onError: (e: any) => { setBusy(null); setErr(String(e?.message ?? "").slice(0, 160) || L("這次沒有回應", "No response this time")); },
    });
  };

  /** 使用者說一句（可能 @ 某一位）。 */
  const dispatch = (raw: string) => {
    const { to, message } = routeMention(raw, roster);
    const who = to ?? speakerRef.current;
    const prior = msgsRef.current;
    const next: Msg[] = [...prior];
    if (to && to !== speakerRef.current) {
      const a = byRoleRef.current.get(to);
      next.push({ role: "handoff", content: a ? L(`換 ${a.name}（${roleName(to)}）`, `Now talking to ${a.name} (${roleName(to)})`) : L(`換${roleName(to)}`, `Now: ${roleName(to)}`) });
      setSpeaker(to);
    }
    next.push({ role: "user", content: raw.trim() });
    msgsRef.current = next;
    setMsgs(next);
    ask(who, message || raw.trim(), { prior });
  };

  drainRef.current = () => {
    const [first, ...rest] = queueRef.current;
    if (!first) { requestAnimationFrame(() => inputRef.current?.focus()); return; }
    queueRef.current = rest;
    setQueued(rest);
    dispatch(first);
  };

  const send = (message: string) => {
    const m = message.trim();
    if (!m) return;
    setText("");
    // 有人正在回：先排隊，這一串回完就送。
    if (busy) { setQueued((q) => [...q, m].slice(0, 3)); return; }
    dispatch(m);
  };

  const retry = () => {
    const last = lastAsk.current;
    if (!last || busy) return;
    ask(last.who, last.message, last.opts);
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
    const a = byRole.get(s);
    setMsgs((prev) => [...prev, { role: "handoff", content: a ? L(`換 ${a.name}（${roleName(s)}）`, `Now talking to ${a.name} (${roleName(s)})`) : L(`換${roleName(s)}`, `Now: ${roleName(s)}`) }]);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const clear = () => {
    if (busy) return;
    setMsgs([]);
    setQueued([]);
  };

  const SUGGEST: Record<string, [string, string][]> = {
    director: view === "basis"
      ? [["關鍵洞察寫得更具體一點", "Make the key insight sharper"], ["禁用元素加上「免費」", "Add “free” to the don'ts"]]
      : [["這檔的一句話訴求再收斂一點", "Tighten the core message"], ["每一段的訊息有沒有接得起來？", "Do the phase messages flow?"]],
    author: [["為什麼鎖定這群受眾？", "Why this audience?"], ["關鍵洞察是從哪裡來的？", "Where did the key insight come from?"]],
    kpi: [["哪幾篇最值得下廣告？", "Which posts are worth promoting?"], ["預算該集中在哪一段？", "Which phase should get the budget?"]],
    kol: [["這檔該找大網紅還是微網紅？", "Big or micro influencers?"], ["給網紅的 brief 要寫什麼？", "What goes into the creator brief?"]],
    cobrand: [["找什麼樣的品牌一起做比較好？", "What kind of partner brand fits?"], ["聯合公告誰發、怎麼分工？", "Who posts the joint announcement?"]],
    pr: [["這檔有什麼值得被報導的角度？", "What's newsworthy here?"], ["哪些說法會被放大檢視？", "Which claims draw scrutiny?"]],
    planner: phase
      ? [[`${phaseShort(phase, false)}期再多排一篇 IG`, `One more Instagram post in ${phaseShort(phase, true)}`], ["這一段的內容太像了，換個角度", "These posts are too similar — vary the angles"]]
      : [["官網也要發，開賣日加一篇公告頁", "Add a launch announcement on the website"], ["倒數那週多排兩篇", "Two more posts in the last-call week"]],
  };
  const suggestions = (SUGGEST[speaker] ?? SUGGEST.planner!).map(([zh, e]) => L(zh, e));

  const face = (a: Member | null | undefined, s: Speaker, size = "w-7 h-7") => (a?.avatarUrl
    ? <Avatar src={a.avatarUrl} name={a.name} size="sm" className={`${size} shrink-0 ring-2 ring-background/60`} />
    : <span className={`${size} rounded-full bg-background text-foreground grid place-items-center text-tiny font-bold shrink-0`}>{(a?.name ?? roleName(s)).slice(0, 1)}</span>);

  return (
    <div className={`rounded-2xl bg-foreground text-background px-4 py-3 flex flex-col gap-2.5 ${grow ? "flex-1 min-h-[300px]" : ""}`}>
      <style>{"@keyframes obDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}"}</style>
      <div className="flex items-center gap-2.5">
        {face(cur, speaker)}
        <div className="min-w-0">
          <p className="text-small font-semibold leading-tight truncate" title={cur ? `${cur.name}｜${cur.title}` : undefined}>
            {cur ? `${cur.name}　${roleName(speaker)}` : roleName(speaker)}
          </p>
          <p className="text-[11px] opacity-60 leading-tight truncate">
            {view === "basis" ? L("正在看：策略依據", "Looking at: strategy basis")
              : phase ? L(`正在看：${phaseShort(phase, false)}期`, `Looking at: ${phaseShort(phase, true)}`) : L("正在看：整檔總覽", "Looking at: overview")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
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

      {/* 這檔活動的團隊：點頭像換人；滑過去看他管什麼、在這份企劃做了什麼。 */}
      {roster.length > 1 && (
        <div className="flex items-start gap-1.5 -mt-0.5" role="tablist" aria-label={L("這檔活動的團隊", "Campaign team")}>
          <span className="text-[10.5px] opacity-50 shrink-0 mr-0.5 pt-1">{L("團隊", "Team")}</span>
          <div className="flex items-center gap-1 flex-wrap">
            {roster.map((m) => {
              const on = m.role === speaker;
              return (
                <button key={m.role} type="button" role="tab" aria-selected={on}
                  disabled={!!busy && !on}
                  onClick={() => switchTo(m.role)}
                  className={`group relative shrink-0 flex items-center gap-1.5 rounded-full pl-0.5 pr-2 py-0.5 transition ${on ? "bg-background text-foreground" : "hover:bg-background/15 opacity-80 hover:opacity-100"} disabled:opacity-35`}>
                  {face(m, m.role, "w-5 h-5")}
                  <span className="text-[11px] whitespace-nowrap">{roleName(m.role)}</span>
                  <span role="tooltip"
                    className="pointer-events-none absolute left-0 top-full mt-1.5 z-30 w-56 rounded-xl bg-content1 text-foreground shadow-large p-2.5 text-left opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 transition">
                    <span className="block text-small font-semibold">{m.name}<span className="font-normal text-default-500">　{roleName(m.role)}</span></span>
                    {m.title && <span className="block text-[11px] text-default-500 truncate">{m.title}</span>}
                    {(en ? m.dutyEn : m.duty) && <span className="block text-[11.5px] leading-snug mt-1">{en ? m.dutyEn : m.duty}</span>}
                    {(en ? m.didEn : m.did) && <span className="block text-[11px] text-default-500 mt-1">{L("這份企劃：", "On this plan: ")}{en ? m.didEn : m.did}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div ref={boxRef} className={`flex flex-col gap-2 overflow-y-auto pr-1 -mr-1 ${grow ? "flex-1 min-h-[120px]" : "max-h-[280px]"}`}>
        {notes.map((n, k) => <p key={`n${k}`} className="text-small leading-relaxed">{en ? n.en : n.zh}</p>)}
        {msgs.length > 0 && !busy && (
          <button type="button" onClick={clear} className="self-center text-[11px] opacity-50 hover:opacity-90">{L("清掉這串對話", "Clear conversation")}</button>
        )}
        {msgs.map((m, k) => {
          if (m.role === "handoff") {
            return <p key={k} className="self-center text-[11px] opacity-60 flex items-center gap-1.5"><FontAwesomeIcon icon={faRightLeft} />{m.content}</p>;
          }
          const sp = m.speaker ?? "planner";
          const who = byRole.get(sp);
          return (
            <div key={k} className={m.role === "user" ? "self-end max-w-[88%]" : "flex gap-2 items-start"}>
              {m.role === "assistant" && face(who, sp, "w-5 h-5 mt-0.5")}
              <div className={m.role === "user" ? "" : "flex flex-col gap-2 min-w-0 flex-1"}>
                {m.role === "assistant" && (who?.name || m.name) && (
                  <p className="text-[11px] opacity-60 -mb-1">{who?.name || m.name}・{roleName(sp)}</p>
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
            </div>
          );
        })}
        {busy && <Thinking member={byRole.get(busy) ?? null} label={roleName(busy)} en={en} face={face(byRole.get(busy), busy, "w-5 h-5")} />}
        {queued.map((q, k) => (
          <div key={`q${k}`} className="self-end max-w-[88%] flex flex-col items-end gap-0.5 opacity-60">
            <p className="text-small leading-relaxed bg-background/10 rounded-xl px-3 py-1.5 whitespace-pre-line">{q}</p>
            <span className="text-[10.5px]">{L("等這一位回完就送出", "Sends when the current reply finishes")}</span>
          </div>
        ))}
        {err && (
          <div className="flex items-center gap-2 text-tiny">
            <span className="text-danger-300">{err}</span>
            {lastAsk.current && !busy && (
              <button type="button" onClick={retry} className="flex items-center gap-1 opacity-80 hover:opacity-100 underline underline-offset-2">
                <FontAwesomeIcon icon={faRotateRight} />{L("再試一次", "Retry")}
              </button>
            )}
          </div>
        )}
      </div>

      {locked ? (
        <p className="text-tiny opacity-60">{L("企劃已定稿。要再調整，先按標題旁的鎖頭解鎖。", "The plan is locked. Unlock it by the title to change it.")}</p>
      ) : (
        <>
          {msgs.length === 0 && !busy && (
            <div className="flex gap-1.5 flex-wrap">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}
                  className="text-[11.5px] border border-dashed border-background/35 rounded-full px-2.5 py-0.5 opacity-80 hover:opacity-100">{s}</button>
              ))}
            </div>
          )}
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <textarea
              ref={inputRef}
              value={text} rows={1} maxLength={800}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }}
              placeholder={busy
                ? L("可以先打下一句，回完就送出", "Type your next message — it sends when this reply finishes")
                : cur ? L(`跟${cur.name}說…（打 @名字 找團隊裡其他人）`, `Message ${cur.name}… (@name to ask someone else)`)
                  : L("跟團隊說…", "Message the team…")}
              aria-label={L(`跟${roleName(speaker)}說`, `Message the ${roleName(speaker)}`)}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="flex-1 min-w-0 resize-none bg-background/10 rounded-xl px-3 py-2 text-small placeholder:text-background/45 outline-none focus:bg-background/15 max-h-28"
            />
            <button type="submit" disabled={!text.trim()} aria-label={L("送出", "Send")}
              className="w-8 h-8 rounded-full bg-background text-foreground grid place-items-center disabled:opacity-40 shrink-0">
              <FontAwesomeIcon icon={faArrowUp} className="text-tiny" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

/** 思考列：那一位的頭像、跳動的點、秒數；等久了說明在做什麼，不讓人以為卡住。 */
function Thinking({ member, label, en, face }: { member: Member | null; label: string; en: boolean; face: React.ReactNode }) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const [sec, setSec] = React.useState(0);
  React.useEffect(() => {
    const t0 = Date.now();
    const t = window.setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [member?.id, label]);
  const stage = sec < 4 ? L("讀企劃與品牌大腦", "Reading the plan")
    : sec < 15 ? L("想怎麼改", "Working it out")
      : sec < 30 ? L("寫回覆、順便改企劃", "Writing and updating the plan")
        : L("改的地方比較多，再等一下", "Lots to change — almost there");
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      {face}
      <span className="text-small opacity-80">{member?.name ?? label}</span>
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1 h-1 rounded-full bg-background" style={{ animation: `obDot 1.2s ${i * 0.15}s infinite ease-in-out` }} />
        ))}
      </span>
      <span className="text-[11px] opacity-50 tabular-nums">{stage}・{sec}{L(" 秒", "s")}</span>
    </div>
  );
}
