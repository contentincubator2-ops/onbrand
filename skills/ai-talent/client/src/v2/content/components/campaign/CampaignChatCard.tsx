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
 * 社群／內容策略師，見 server/content/core/campaign/campaignTeam.ts），帶著他自己的知識回答。
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
 *   · 卡頂一排是這檔活動的團隊（server/content/core/campaign/campaignRoster.ts）：總監、定位撰寫者、
 *     內容企劃、投放專家、網紅／異業合作、話題公關——點頭像換人，滑過去看他管什麼、做了什麼；
 *     打「@名字」直接找那一位。誰都能把話轉給名冊上的另一位。
 *   · 等待：思考列有那一位的頭像、跳動的點與秒數；別人在回時可以先打下一句，排隊送出；
 *     失敗有「再試一次」；回完游標回到輸入框。
 *
 * 2026-10-02（CJ「對話要存到資料庫中」）：這串改存資料庫（campaign.chatHistory／chatAppend，
 * server/content/core/campaign/campaignChatStore.ts），換電腦、重新整理都還在；「復原」用的修改前快照
 * 也存進去，重新整理後還能復原最新那一次。每則有 key，畫面多一則就補送沒送過的那幾則。
 * 以前記在這台瀏覽器的對話，第一次打開時搬進資料庫，搬完就從瀏覽器刪掉。
 *
 * 2026-10-02（CJ「對話多了以後就很亂，也沒辦法告一個段落，整個版面很擠，也無法重新開啟對話」）：
 *   · 一段一段的討論：「新討論」結束這段（存標題與摘要），「過去的討論」列出每一段、點一下接著談；
 *     一段放超過一天，下次打開從新的一段開始，上一段留一張卡可一鍵接回。
 *   · 版面：新的一段才顯示企劃檢查；一段超過 14 則只顯示最後 10 則；修改卡收成一行，只有最新那次展開。
 *   · 模型只讀這一段，前面幾段用摘要補（伺服器 recentSummaries）。
 *
 * 2026-10-05（CJ「活動企劃當中的對話，要能讀取官網連結、或是上傳檔案解析」）：
 *   · 話裡貼網址，伺服器去讀；輸入框左邊的迴紋針上傳檔案（走既有的 extract-text 抽文字）。
 *   · 讀進來的資料跟著這檔活動，列在輸入框上方，團隊每一位、每一段討論都讀得到，可以移除。
 *   · 讀不到的連結在那一則底下直接標出來，不靠模型轉述（server/content/core/campaign/campaignChatSources.ts）。
 */
import React from "react";
import { Avatar } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faCheck, faRotateLeft, faUpRightAndDownLeftFromCenter, faDownLeftAndUpRightToCenter, faRightLeft, faRotateRight, faPenToSquare, faClockRotateLeft, faChevronDown, faPaperclip, faXmark, faLink, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import type { CampaignPhaseId, CampaignPlan } from "../../../strategy/lib/campaign/campaignSchema";
import type { StageNote } from "../../../strategy/lib/campaign/campaignStage";
import { phaseShort } from "../../../strategy/lib/campaign/campaignStage";
import { applyProposal, describeProposal, isEmptyProposal, routeMention, type CampaignProposal } from "../../../strategy/lib/campaign/campaignChat";
import { agentLabel } from "../../../platform/lib/agentName";
import { readStoredDirector } from "../../../strategy/lib/strategistDirectors";
import type { BasisPatch, BasisValue } from "../../../strategy/lib/campaign/campaignBasis";

/** 名冊上的角色 id（伺服器 campaignRoster.CAMPAIGN_ROLES）。 */
type Speaker = string;
interface Member {
  id: number; name: string; title: string; avatarUrl: string;
  role: Speaker; roleZh: string; roleEn: string; duty: string; dutyEn: string; did: string; didEn: string;
  /** 英文介面用的名字與職稱（伺服器查 agents.englishName／title；查不到是空字串）。 */
  nameEn?: string; titleEn?: string;
}

interface Msg {
  /** 畫面產的鍵，資料庫用它認這一則（標已復原、避免重送）。 */
  key?: string;
  role: "user" | "assistant" | "handoff";
  content: string;
  speaker?: Speaker;
  name?: string;
  /** 這則帶來的修改（已經寫進企劃）。 */
  proposal?: CampaignProposal;
  /** 修改前的企劃，復原用（資料庫只回最新一次修改的）。 */
  before?: CampaignPlan;
  /** 修改前的策略依據（只有被改的那幾格），復原用。 */
  beforeBasis?: BasisPatch;
  undone?: boolean;
  truncated?: boolean;
  /** 這一句裡讀不到的連結（只在當下顯示，不存資料庫）。 */
  linkFailed?: string[];
}

/** 這檔活動的參考資料（伺服器 campaignChatSources.SourceMeta）。 */
interface Source { id: number; kind: "url" | "file"; name: string; url: string | null; chars: number; partial: boolean }
/** 上傳檔案走的抽取端點最多回這麼多字（server positioningDocRoute.EXTRACT_TEXT_MAX_CHARS）。 */
const FILE_TEXT_MAX = 20_000;
const FILE_ACCEPT = ".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.md,.markdown,.txt,.html,.htm";

interface Thread { id: number; title: string; summary: string | null; status: "open" | "closed"; messageCount: number; changeCount: number; updatedAt: string }

interface AskOpts { handoff?: boolean; from?: Speaker | null; hops?: number; prior: Msg[] }

/** 舊版記在瀏覽器的這串（2026-10-02 前）；只用來搬進資料庫。 */
const LEGACY_KEY = (eventId: number) => `onbrand.campaignChat.${eventId}`;
function loadLegacy(eventId: number): Msg[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY(eventId)) ?? "[]");
    return Array.isArray(raw) ? raw.slice(-40) : [];
  } catch { return []; }
}
function dropLegacy(eventId: number) {
  try { localStorage.removeItem(LEGACY_KEY(eventId)); } catch { /* 私密模式 */ }
}
let seq = 0;
const newKey = () => `m${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** 新的一則一律經過這裡，才有 key。 */
const mk = (m: Msg): Msg => ({ ...m, key: m.key ?? newKey() });

export default function CampaignChatCard({ eventId, brandId, plan, phase, notes, locked, en, onApply, basis, onApplyBasis, onApplyDates, view, grow, expanded, onToggleExpand }: {
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
  /** 改活動本身的開始／結束日（對話提的，或復原回原本的）：父層存。 */
  onApplyDates?: (dates: { startAt: string | null; endAt: string | null }) => void;
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
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [speaker, setSpeaker] = React.useState<Speaker>("planner");
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
  // 英文介面：名字與職稱用英文（有的話）。2026-10-02 CJ「英文版也能正確顯示嗎」。
  const dn = (m: Member | null | undefined): string => (m ? (en && m.nameEn ? m.nameEn : m.name) : "");
  /** 完整標籤（tooltip／alt）：英文介面「English (中文原名)」。 */
  const df = (m: Member | null | undefined): string => (m ? agentLabel(m, en ? "en" : "zh") : "");
  const dt = (m: Member | null | undefined): string => (m ? (en ? m.titleEn || "" : m.title) : "");
  /** 交棒／換人那一行：存的是誰交給誰（speaker＝接手的、name＝交出去的角色），顯示時才用目前的語言組字。 */
  const handoffText = (m: Msg): string => {
    const to = m.speaker ? byRole.get(m.speaker) : null;
    if (!m.speaker || !to) return m.content;
    const from = m.name ? byRole.get(m.name) : null;
    if (from) return L(`${dn(from)}請 ${dn(to)}（${roleName(to.role)}）接手`, `${dn(from)} hands over to ${dn(to)} (${roleName(to.role)})`);
    return L(`換 ${dn(to)}（${roleName(to.role)}）`, `Now talking to ${dn(to)} (${roleName(to.role)})`);
  };
  const threadName = (t: { title: string }) => (t.title === "討論" || t.title === "Discussion" ? L("討論", "Discussion") : t.title);
  const cur = byRole.get(speaker) ?? null;

  // 名冊換了（例如網紅線拿掉了）而目前的人不在上面：回到內容企劃。
  React.useEffect(() => {
    if (roster.length && !byRole.has(speaker)) setSpeaker(byRole.has("planner") ? "planner" : roster[0]!.role);
  }, [roster, byRole, speaker]);

  // ── 資料庫：一段一段的討論（campaign.chatThreads／chatHistory／chatAppend）──
  // 2026-10-02（CJ「對話多了以後很亂，沒辦法告一個段落…也無法重新開啟對話」）：
  // 結束這段＝留標題與摘要、下一句開新的一段；「過去的討論」列出每一段，點一下接著談。
  const utils = (trpc as any).useUtils();
  const threadsQ = (trpc as any).campaign.chatThreads.useQuery({ eventId }, { refetchOnWindowFocus: false, refetchOnMount: "always", staleTime: 0 });
  const appendMut = (trpc as any).campaign.chatAppend.useMutation();
  const undoneMut = (trpc as any).campaign.chatUndone.useMutation();
  const closeMut = (trpc as any).campaign.chatCloseThread.useMutation();
  const reopenMut = (trpc as any).campaign.chatReopenThread.useMutation();

  // ── 參考資料：貼的連結、上傳的檔案（campaign.chatSources／chatAddSource／chatRemoveSource）──
  const sourcesQ = (trpc as any).campaign.chatSources.useQuery({ eventId }, { refetchOnWindowFocus: false });
  const addSourceMut = (trpc as any).campaign.chatAddSource.useMutation();
  const removeSourceMut = (trpc as any).campaign.chatRemoveSource.useMutation();
  const sources: Source[] = sourcesQ.data?.sources ?? [];
  const refreshSources = () => utils?.campaign?.chatSources?.invalidate?.({ eventId });
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState("");
  const [fileNote, setFileNote] = React.useState<{ text: string; bad: boolean } | null>(null);
  const onFile = async (file: File) => {
    if (!brandId || uploading) return;
    setFileNote(null);
    setUploading(file.name);
    try {
      const r = await fetch("/api/positioning-doc/extract-text", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/octet-stream",
          "x-brand-id": String(brandId),
          "x-scope": "event",
          "x-scope-id": String(eventId),
          "x-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.detail ? `${j.error}：${j.detail}` : (j?.error ?? `HTTP ${r.status}`));
      const raw = String(j.text ?? "").trim();
      if (!raw) throw new Error(L("這份檔案讀不出文字", "No text could be read from this file"));
      const total = Math.max(Number(j.chars) || 0, raw.length);
      await addSourceMut.mutateAsync({ eventId, name: file.name.slice(0, 200), text: raw.slice(0, FILE_TEXT_MAX), chars: total });
      refreshSources();
      // 明講被切掉了，不要讓人以為整份都讀進來了。
      setFileNote(total > FILE_TEXT_MAX
        ? { text: L(`${file.name} 約 ${total.toLocaleString()} 字，只讀進前 ${FILE_TEXT_MAX.toLocaleString()} 字。`, `${file.name} has about ${total.toLocaleString()} characters — only the first ${FILE_TEXT_MAX.toLocaleString()} were read.`), bad: false }
        : { text: L(`已讀進 ${file.name}，團隊現在讀得到。`, `${file.name} is now available to the team.`), bad: false });
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (e: any) {
      setFileNote({ text: String(e?.message ?? e).slice(0, 200), bad: true });
    } finally {
      setUploading("");
    }
  };
  const removeSource = (id: number) => removeSourceMut.mutate({ eventId, id }, { onSettled: refreshSources });
  const threads: Thread[] = threadsQ.data?.threads ?? [];
  /** 目前這段（null＝還沒說話的新一段，第一句送出時伺服器開）。 */
  const [threadId, setThreadId] = React.useState<number | null>(null);
  const threadRef = React.useRef<number | null>(null);
  threadRef.current = threadId;
  /** 要從資料庫讀回哪一段（打開卡片、重新打開某一段時才設）。 */
  const [loadFor, setLoadFor] = React.useState<number | null>(null);
  const [panel, setPanel] = React.useState<"chat" | "threads">("chat");
  const synced = React.useRef<Set<string>>(new Set());
  const [loaded, setLoaded] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  // 換到另一檔活動：重新讀那一檔的討論。
  React.useEffect(() => {
    setLoaded(false); setMsgs([]); setThreadId(null); setLoadFor(null); setPanel("chat");
    synced.current = new Set();
  }, [eventId]);
  // 打開卡片：接最近那段（一天內動過、還開著）；沒有就是新的一段，舊的瀏覽器紀錄搬進來。
  React.useEffect(() => {
    if (loaded || !threadsQ.data || threadsQ.isFetching) return;
    const cur = threadsQ.data.currentId ?? null;
    if (cur) { setThreadId(cur); setLoadFor(cur); return; }
    if (!threadsQ.data.threads?.length) {
      const legacy = loadLegacy(eventId).map(mk);
      if (legacy.length) setMsgs(legacy);
    }
    setLoaded(true);
  }, [threadsQ.data, threadsQ.isFetching, loaded, eventId]);
  const historyQ = (trpc as any).campaign.chatHistory.useQuery(
    { eventId, threadId: loadFor ?? 0 },
    { enabled: !!loadFor, refetchOnWindowFocus: false, refetchOnMount: "always", staleTime: 0 },
  );
  React.useEffect(() => {
    if (!loadFor || !historyQ.data || historyQ.isFetching) return;
    const server: Msg[] = historyQ.data.messages ?? [];
    server.forEach((m) => m.key && synced.current.add(m.key));
    setMsgs(server);
    msgsRef.current = server;
    const last = [...server].reverse().find((m) => m.role === "assistant");
    if (last?.speaker) setSpeaker(last.speaker);
    setShowAll(false);
    setLoadFor(null);
    setLoaded(true);
  }, [historyQ.data, historyQ.isFetching, loadFor]);
  // 每多一則就補送沒送過的。第一句送出時這段還沒有 id：等伺服器開好、回 id 之後才送下一批。
  const appending = React.useRef(false);
  const [retick, setRetick] = React.useState(0);
  React.useEffect(() => {
    if (!loaded || appending.current) return;
    const fresh = msgs.filter((m) => m.key && !synced.current.has(m.key));
    if (!fresh.length) return;
    appending.current = true;
    fresh.forEach((m) => synced.current.add(m.key!));
    appendMut.mutate({ eventId, threadId: threadRef.current, messages: fresh.slice(-60), lang: en ? "en" : "zh" }, {
      onSuccess: (r: any) => {
        appending.current = false;
        if (r?.threadId && r.threadId !== threadRef.current) { threadRef.current = r.threadId; setThreadId(r.threadId); }
        dropLegacy(eventId);
        utils?.campaign?.chatThreads?.invalidate?.({ eventId });
        setRetick((n) => n + 1);
      },
      // 沒送成：下次有新的一則時一起補送（伺服器用 key 去重）。
      onError: () => { appending.current = false; fresh.forEach((m) => synced.current.delete(m.key!)); },
    });
  }, [msgs, loaded, eventId, retick]);

  /** 這段改了什麼（結束時存成摘要；畫面算，跟卡片上列的一樣）。 */
  const summarize = (list: Msg[]): string => {
    const lines = list.filter((m) => m.proposal && !m.undone)
      .flatMap((m) => describeProposal(m.before ?? plan, m.proposal!, en).map((l) => l.replace(/^✎\s*/, "")));
    if (!lines.length) {
      const last = [...list].reverse().find((m) => m.role === "assistant")?.content ?? "";
      return [L("只有討論，沒改企劃", "Discussion only"), last.split(/(?<=[。！？!?])/)[0]?.slice(0, 80)].filter(Boolean).join("・");
    }
    const head = lines.slice(0, 3).join("；");
    return lines.length > 3 ? L(`${head}；另 ${lines.length - 3} 處`, `${head}; +${lines.length - 3} more`) : head;
  };
  /** 結束這段：存摘要、清空畫面，下一句就是新的一段。 */
  const endThread = () => {
    if (busy) return;
    const tid = threadRef.current;
    if (tid && msgs.length) {
      closeMut.mutate({ eventId, threadId: tid, summary: summarize(msgs).slice(0, 600) }, {
        onSuccess: () => utils?.campaign?.chatThreads?.invalidate?.({ eventId }),
      });
    }
    setMsgs([]); msgsRef.current = []; setThreadId(null); threadRef.current = null;
    setQueued([]); setErr(""); setPanel("chat"); setShowAll(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  /** 重新打開過去的一段，接著談。 */
  const openThread = (id: number) => {
    if (busy) return;
    if (id === threadRef.current) { setPanel("chat"); return; }
    reopenMut.mutate({ eventId, threadId: id, lang: en ? "en" : "zh" }, {
      onSuccess: () => {
        utils?.campaign?.chatThreads?.invalidate?.({ eventId });
        setThreadId(id); threadRef.current = id; setLoadFor(id); setPanel("chat");
      },
    });
  };
  const lastClosed = threads.find((t) => t.id !== threadId) ?? null;
  const pastCount = threads.filter((t) => t.id !== threadId).length;

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
    chatMut.mutate({ eventId, message, phase, history: history(opts.prior), speaker: who, from: opts.from ?? null, directorAgentId, handoff: !!opts.handoff, hops, view: view ?? "map", threadId: threadRef.current, lang: en ? "en" : "zh" }, {
      onSuccess: (r: any) => {
        const team = byRoleRef.current;
        const name = r?.agent?.name ?? team.get(who)?.name ?? "";
        const linkFailed: string[] = Array.isArray(r?.links?.failed) ? r.links.failed.map(String) : [];
        if (r?.links?.read?.length || linkFailed.length) refreshSources();
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
          // 活動日期不在企劃裡，另外存；改之前的日期就在 proposal.dates.from，復原讀它。
          if (proposal.dates && onApplyDates) onApplyDates({ startAt: proposal.dates.startAt, endAt: proposal.dates.endAt });
        }
        const reply: Msg = mk({
          role: "assistant", content: String(r?.reply ?? ""), speaker: who, name,
          ...(proposal ? { proposal, before, beforeBasis } : {}), truncated: !!r?.truncated,
          ...(linkFailed.length ? { linkFailed } : {}),
        });
        const next = [...msgsRef.current, reply];
        // 交棒：名冊上任何一位都能把話轉給另一位；同一張卡裡接著回答，之後使用者的話也由接手的那位回答。
        const to: Speaker | null = typeof r?.handoff?.to === "string" ? r.handoff.to : null;
        const question = String(r?.handoff?.question ?? "");
        if (to && to !== who && question && hops < 2) {
          const toName = dn(team.get(to));
          const fromName = dn(team.get(who)) || name || roleName(who);
          next.push(mk({ role: "handoff", speaker: to, name: who, content: toName ? L(`${fromName}請 ${toName}（${roleName(to)}）接手`, `${fromName} hands over to ${toName}`) : L(`交給${roleName(to)}`, `Handing over to the ${roleName(to)}`) }));
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
    // @ 找人：中文名字、英文名字都認得。
    const { to, message } = routeMention(raw, roster.flatMap((m) => (m.nameEn ? [m, { ...m, name: m.nameEn }] : [m])));
    const who = to ?? speakerRef.current;
    const prior = msgsRef.current;
    const next: Msg[] = [...prior];
    if (to && to !== speakerRef.current) {
      const a = byRoleRef.current.get(to);
      next.push(mk({ role: "handoff", speaker: to, content: a ? L(`換 ${dn(a)}（${roleName(to)}）`, `Now talking to ${dn(a)} (${roleName(to)})`) : L(`換${roleName(to)}`, `Now: ${roleName(to)}`) }));
      setSpeaker(to);
    }
    next.push(mk({ role: "user", content: raw.trim() }));
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
    if (!m || (!m.before && !m.beforeBasis && !m.proposal?.dates) || locked) return;
    if (m.before) onApply(m.before);
    if (m.beforeBasis) onApplyBasis?.(m.beforeBasis);
    if (m.proposal?.dates) onApplyDates?.(m.proposal.dates.from);
    setMsgs((prev) => prev.map((x, k) => (k === idx ? { ...x, undone: true, before: undefined, beforeBasis: undefined } : x)));
    if (m.key) undoneMut.mutate({ eventId, key: m.key });
  };

  const switchTo = (s: Speaker) => {
    if (s === speaker || busy) return;
    setSpeaker(s);
    const a = byRole.get(s);
    setMsgs((prev) => [...prev, mk({ role: "handoff", speaker: s, content: a ? L(`換 ${dn(a)}（${roleName(s)}）`, `Now talking to ${dn(a)} (${roleName(s)})`) : L(`換${roleName(s)}`, `Now: ${roleName(s)}`) })]);
    requestAnimationFrame(() => inputRef.current?.focus());
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
    ? <Avatar src={a.avatarUrl} name={df(a)} size="sm" className={`${size} shrink-0 ring-2 ring-background/60`} />
    : <span className={`${size} rounded-full bg-background text-foreground grid place-items-center text-tiny font-bold shrink-0`}>{(dn(a) || roleName(s)).slice(0, 1)}</span>);

  return (
    <div className={`rounded-2xl bg-foreground text-background px-4 py-3 flex flex-col gap-2.5 ${grow ? "flex-1 min-h-[300px]" : ""}`}>
      <style>{"@keyframes obDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}"}</style>
      <div className="flex items-center gap-2.5">
        {face(cur, speaker)}
        <div className="min-w-0">
          <p className="text-small font-semibold leading-tight truncate" title={cur ? [df(cur), dt(cur)].filter(Boolean).join("｜") : undefined}>
            {cur ? `${dn(cur)}　${roleName(speaker)}` : roleName(speaker)}
          </p>
          <p className="text-[11px] opacity-60 leading-tight truncate">
            {view === "basis" ? L("正在看：策略依據", "Looking at: strategy basis")
              : phase ? L(`正在看：${phaseShort(phase, false)}期`, `Looking at: ${phaseShort(phase, true)}`) : L("正在看：整檔總覽", "Looking at: overview")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {/* 結束這段，開新的討論；過去的討論（可以重新打開）。 */}
          <button type="button" onClick={endThread} disabled={!!busy || !msgs.length}
            title={L("結束這段，開新的討論", "End this thread and start a new one")}
            className="h-7 rounded-lg px-2 flex items-center gap-1.5 text-[11.5px] opacity-80 hover:opacity-100 hover:bg-background/15 transition disabled:opacity-30">
            <FontAwesomeIcon icon={faPenToSquare} className="text-[11px]" />{L("新討論", "New")}
          </button>
          <button type="button" onClick={() => setPanel(panel === "threads" ? "chat" : "threads")} disabled={!!busy}
            aria-pressed={panel === "threads"}
            title={L("過去的討論", "Past threads")}
            className={`h-7 rounded-lg px-2 flex items-center gap-1.5 text-[11.5px] transition disabled:opacity-30 ${panel === "threads" ? "bg-background text-foreground" : "opacity-80 hover:opacity-100 hover:bg-background/15"}`}>
            <FontAwesomeIcon icon={faClockRotateLeft} className="text-[11px]" />
            {pastCount > 0 && <span className="tabular-nums">{pastCount}</span>}
          </button>
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
                    <span className="block text-small font-semibold">{df(m)}<span className="font-normal text-default-500">　{roleName(m.role)}</span></span>
                    {dt(m) && <span className="block text-[11px] text-default-500 truncate">{dt(m)}</span>}
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
        {panel === "threads" ? (
          <ThreadList threads={threads} currentId={threadId} en={en} onOpen={openThread} onBack={() => setPanel("chat")} />
        ) : !loaded ? (
          <p className="text-tiny opacity-50">{L("讀取對話…", "Loading…")}</p>
        ) : (<>
        {/* 新的一段還沒開口：企劃檢查＋上一段的結論（一鍵接著談）。談起來之後這些收掉，版面只留對話。 */}
        {msgs.length === 0 && notes.map((n, k) => <p key={`n${k}`} className="text-small leading-relaxed">{en ? n.en : n.zh}</p>)}
        {msgs.length === 0 && lastClosed && (
          <button type="button" onClick={() => openThread(lastClosed.id)}
            className="text-left rounded-xl border border-background/25 hover:border-background/50 px-3 py-2 flex flex-col gap-0.5 transition">
            <span className="text-[11px] opacity-60">{L("上一段討論", "Last thread")}・{ago(lastClosed.updatedAt, en)}</span>
            <span className="text-small font-semibold truncate">{threadName(lastClosed)}</span>
            {lastClosed.summary && <span className="text-tiny opacity-70 line-clamp-2">{lastClosed.summary}</span>}
            <span className="text-[11px] opacity-60 pt-0.5 flex items-center gap-1"><FontAwesomeIcon icon={faRotateRight} className="text-[9px]" />{L("接著這段談", "Continue this thread")}</span>
          </button>
        )}
        {/* 一段很長時只顯示最後幾則，前面的收成一行。 */}
        {!showAll && msgs.length > FOLD_AT && (
          <button type="button" onClick={() => setShowAll(true)} className="self-center text-[11px] opacity-60 hover:opacity-100 border border-background/20 rounded-full px-2.5 py-0.5">
            {L(`顯示前面 ${msgs.length - SHOW_LAST} 則`, `Show ${msgs.length - SHOW_LAST} earlier`)}
          </button>
        )}
        {msgs.map((m, k) => {
          if (!showAll && msgs.length > FOLD_AT && k < msgs.length - SHOW_LAST) return null;
          if (m.role === "handoff") {
            return <p key={m.key ?? k} className="self-center text-[11px] opacity-50 flex items-center gap-1.5"><FontAwesomeIcon icon={faRightLeft} className="text-[9px]" />{handoffText(m)}</p>;
          }
          const sp = m.speaker ?? "planner";
          const who = byRole.get(sp);
          return (
            <div key={m.key ?? k} className={m.role === "user" ? "self-end max-w-[88%]" : "flex gap-2 items-start"}>
              {m.role === "assistant" && face(who, sp, "w-5 h-5 mt-0.5")}
              <div className={m.role === "user" ? "" : "flex flex-col gap-1.5 min-w-0 flex-1"}>
                {m.role === "assistant" && (dn(who) || m.name) && (
                  <p className="text-[11px] opacity-60 -mb-0.5">{dn(who) || m.name}・{roleName(sp)}</p>
                )}
                {m.content && (
                  <p className={`text-small leading-relaxed whitespace-pre-line ${m.role === "user" ? "bg-background/15 rounded-xl px-3 py-1.5" : ""}`}>{m.content}</p>
                )}
                {m.linkFailed?.length ? (
                  <p className="text-[11px] opacity-70 break-all">
                    <FontAwesomeIcon icon={faLink} className="text-[9px] mr-1" />
                    {L(`這個連結讀不到：${m.linkFailed.join("、")}。可以改上傳檔案，或把重點貼進來。`, `Couldn’t read this link: ${m.linkFailed.join(", ")}. Upload a file or paste the key points instead.`)}
                  </p>
                ) : null}
                {m.proposal && (
                  <ChangeCard
                    lines={describeProposal(m.before ?? plan, m.proposal, en)}
                    undone={!!m.undone} truncated={!!m.truncated} en={en}
                    defaultOpen={k === lastChangeIdx}
                    onUndo={k === lastChangeIdx && (m.before || m.beforeBasis || m.proposal.dates) && !locked ? () => undo(k) : undefined}
                  />
                )}
              </div>
            </div>
          );
        })}
        </>)}
        {panel === "chat" && busy && <Thinking member={byRole.get(busy) ?? null} label={dn(byRole.get(busy)) || roleName(busy)} en={en} face={face(byRole.get(busy), busy, "w-5 h-5")} />}
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
          {loaded && msgs.length === 0 && !busy && (
            <div className="flex gap-1.5 flex-wrap">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}
                  className="text-[11.5px] border border-dashed border-background/35 rounded-full px-2.5 py-0.5 opacity-80 hover:opacity-100">{s}</button>
              ))}
            </div>
          )}
          {(sources.length > 0 || uploading) && (
            <div className="flex gap-1.5 flex-wrap items-center" aria-label={L("團隊讀得到的參考資料", "Reference material the team can read")}>
              {sources.map((s) => (
                <span key={s.id} className="max-w-[220px] flex items-center gap-1.5 text-[11.5px] bg-background/10 rounded-full pl-2.5 pr-1 py-0.5"
                  title={[s.name, s.url, s.partial ? L("只讀到標題與描述", "Only the title and description could be read") : L(`${s.chars.toLocaleString()} 字`, `${s.chars.toLocaleString()} characters`)].filter(Boolean).join("｜")}>
                  <FontAwesomeIcon icon={s.kind === "url" ? faLink : faFileLines} className="text-[10px] opacity-70 shrink-0" />
                  <span className="truncate">{s.name || s.url}</span>
                  {s.partial && <span className="opacity-60 shrink-0">{L("（只有摘要）", "(summary only)")}</span>}
                  <button type="button" onClick={() => removeSource(s.id)} aria-label={L(`移除 ${s.name}`, `Remove ${s.name}`)}
                    className="w-4 h-4 grid place-items-center rounded-full opacity-60 hover:opacity-100 hover:bg-background/15 shrink-0">
                    <FontAwesomeIcon icon={faXmark} className="text-[9px]" />
                  </button>
                </span>
              ))}
              {uploading && <span className="text-[11.5px] opacity-70 truncate max-w-[220px]">{L(`正在讀 ${uploading}…`, `Reading ${uploading}…`)}</span>}
            </div>
          )}
          {fileNote && <p className={`text-[11.5px] ${fileNote.bad ? "text-danger-300" : "opacity-70"}`}>{fileNote.text}</p>}
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input ref={fileRef} type="file" accept={FILE_ACCEPT} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!brandId || !!uploading}
              aria-label={L("上傳檔案給團隊讀", "Upload a file for the team to read")}
              title={L("上傳檔案給團隊讀（PDF、Word、PowerPoint、Excel、文字檔）；網址直接貼在話裡就會讀", "Upload a file for the team to read (PDF, Word, PowerPoint, Excel, text). Paste a link in your message and it will be read too.")}
              className="w-8 h-8 rounded-full bg-background/10 hover:bg-background/20 grid place-items-center disabled:opacity-40 shrink-0">
              <FontAwesomeIcon icon={faPaperclip} className="text-tiny" />
            </button>
            <textarea
              ref={inputRef}
              value={text} rows={1} maxLength={800}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }}
              placeholder={busy
                ? L("可以先打下一句，回完就送出", "Type your next message — it sends when this reply finishes")
                : cur ? L(`跟${dn(cur)}說…（@名字 找其他人；可貼官網連結）`, `Message ${dn(cur)}… (@name for someone else; links are read)`)
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
      <span className="text-small opacity-80">{label}</span>
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1 h-1 rounded-full bg-background" style={{ animation: `obDot 1.2s ${i * 0.15}s infinite ease-in-out` }} />
        ))}
      </span>
      <span className="text-[11px] opacity-50 tabular-nums">{stage}・{sec}{L(" 秒", "s")}</span>
    </div>
  );
}

/** 一段超過這麼多則就把前面的收起來，只顯示最後 SHOW_LAST 則。 */
const FOLD_AT = 14;
const SHOW_LAST = 10;

/** 「3 分鐘前」「昨天」「10/01」。 */
function ago(isoStr: string, en: boolean): string {
  const t = Date.parse(isoStr);
  if (!Number.isFinite(t)) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return en ? "just now" : "剛剛";
  if (m < 60) return en ? `${m}m ago` : `${m} 分鐘前`;
  const h = Math.round(m / 60);
  if (h < 24) return en ? `${h}h ago` : `${h} 小時前`;
  if (h < 48) return en ? "yesterday" : "昨天";
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 一則帶來的修改：收成一行「已改進企劃・N 處」，點開看每一處。最新那次預設打開、可復原；
 * 舊的收著——一段談久了，十幾張展開的修改卡會把對話擠掉（CJ「版面很擠」）。
 */
function ChangeCard({ lines, undone, truncated, en, defaultOpen, onUndo }: {
  lines: string[]; undone: boolean; truncated: boolean; en: boolean; defaultOpen: boolean; onUndo?: () => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const [open, setOpen] = React.useState(defaultOpen);
  React.useEffect(() => { setOpen(defaultOpen); }, [defaultOpen]);
  return (
    <div className={`rounded-xl border px-3 py-1.5 flex flex-col gap-1 ${undone ? "border-background/15 opacity-60" : "border-background/35"}`}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="flex items-center gap-1.5 text-[11px] opacity-75 hover:opacity-100 min-w-0">
          {undone ? L("已復原", "Undone") : <><FontAwesomeIcon icon={faCheck} className="text-[9px]" />{L(`已改進企劃・${lines.length} 處`, `Applied · ${lines.length}`)}</>}
          <FontAwesomeIcon icon={faChevronDown} className={`text-[8px] transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {onUndo && (
          <button type="button" onClick={onUndo} className="ml-auto text-[11px] opacity-70 hover:opacity-100 flex items-center gap-1">
            <FontAwesomeIcon icon={faRotateLeft} className="text-[9px]" />{L("復原", "Undo")}
          </button>
        )}
      </div>
      {open && (
        <>
          {truncated && <p className="text-[11px] opacity-70">{L("改的篇數太多，先改了前幾條；說「繼續」改剩下的。", "Too many changes at once. Say “continue” for the rest.")}</p>}
          {lines.map((line, j) => <p key={j} className="text-tiny leading-snug">{line}</p>)}
        </>
      )}
    </div>
  );
}

/** 過去的討論：每一段一列（標題、多久前、改了幾次、摘要），點一下重新打開接著談。 */
function ThreadList({ threads, currentId, en, onOpen, onBack }: {
  threads: Thread[]; currentId: number | null; en: boolean; onOpen: (id: number) => void; onBack: () => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <p className="text-small font-semibold">{L("過去的討論", "Past threads")}</p>
        <button type="button" onClick={onBack} className="ml-auto text-[11px] opacity-70 hover:opacity-100">{L("回到對話", "Back to chat")}</button>
      </div>
      {!threads.length && <p className="text-tiny opacity-60 py-2">{L("還沒有討論過。", "No threads yet.")}</p>}
      {threads.map((t) => {
        const cur = t.id === currentId;
        return (
          <button key={t.id} type="button" onClick={() => onOpen(t.id)}
            className={`text-left rounded-xl px-3 py-2 flex flex-col gap-0.5 transition ${cur ? "bg-background/15" : "hover:bg-background/10"}`}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-small font-semibold truncate">{t.title === "討論" || t.title === "Discussion" ? L("討論", "Discussion") : t.title}</span>
              {cur && <span className="shrink-0 text-[10.5px] rounded-full bg-background text-foreground px-1.5">{L("目前", "Current")}</span>}
              <span className="ml-auto shrink-0 text-[11px] opacity-50 tabular-nums">{ago(t.updatedAt, en)}</span>
            </span>
            <span className="text-[11px] opacity-60">
              {L(`${t.messageCount} 則`, `${t.messageCount} messages`)}{t.changeCount ? L(`・改了企劃 ${t.changeCount} 次`, ` · ${t.changeCount} changes`) : ""}
            </span>
            {t.summary && <span className="text-tiny opacity-75 line-clamp-2">{t.summary}</span>}
          </button>
        );
      })}
    </div>
  );
}
