/**
 * CampaignStage — 策略層的活動頁：活動定位＋宣傳企劃合成一個畫面。
 *
 * 2026-09-30（CJ「活動定位有兩條路在執行定位和執行方案…路徑很亂」→ 選了 Tesla 分割
 * 畫面 →「左邊的準備等階段，要增加一個總覽…看加溫期的時候，右邊才會 ZOOM IN」→
 * 「定稿一次鎖整份」）。取代舊的 CampaignWorkspace（一段話＋一條清單）。
 *
 *   左：策略。階段列（總覽＋各段）、倒數、這檔／這一段要講什麼、傳播圈、
 *       跟內容企劃的對話卡（CampaignChatCard，第一則是企劃檢查）。
 *   右：策略地圖（CampaignMap）。總覽看整檔，點一段就放大到那一段。
 *   上：一條控制列——階段（總覽＋各段）、狀態、通路、底圖、設定、到內容層寫、全螢幕。
 *
 * 2026-09-30（CJ「左邊的對話在下方，而右方的企畫方向在右上方，會讓整個視線很不一致」
 * →「將底下的企劃草稿的一系列 ICON 還有調整設定等，都移到右上方」＋「整個大畫布當中，
 * 硬塞了一個小畫布…可以全螢幕嗎」）：控制列從底部搬到頂端、整個畫面撐滿可用高度
 * （左右兩欄一樣高，地圖跟著長），並多一顆全螢幕。
 *
 * 分層沒有變：策略層只排不寫。定稿（標題旁的鎖頭，CampaignLockToggle）鎖整份——
 * 設定、重排、改每一篇都停住；內容層只寫定稿過的企劃。舊的 11 段活動定位留著當
 * 「策略依據」，不再是另一條要走的路。
 *
 * 設計系統：只有中性色；success 只給「已寫」。

 *
 * 2026-09-30（CJ「現在選擇底圖的視覺很差，直接移除整個選擇底圖和客製化底圖的功能」）：
 * 底圖模板整組拿掉，左邊固定是傳播圈（畫的是企劃本身），右邊是中性的地圖底。
 *
 * 2026-10-02（CJ「看到這些文章，想要真實產出」）：放大到某一段後，每一篇可以直接在這裡寫——
 * 「寫這篇」開任務視窗並直接開寫（PlatformTaskModal autoRun），寫好接著開 CampaignPostModal
 * （改字、定稿／送審、標記已發布）。不用先跳到內容層找同一篇。
 *
 * 2026-10-08（CJ「用戶的習慣，其實不太看策略依據…是直接進去改每一篇文章」）：流程倒過來——
 * 使用者先改每一篇、左邊的標語、右邊每個階段的名稱與訊息（都可以直接在畫面上改），再按控制列的
 * 「草擬提案」：照他改好的內容回頭寫出背景、目標、族群、策略…，連同每天的排程與每一篇的全文，
 * 成為一份可以改、可以存、可以下載的提案（CampaignProposalPanel），取代右邊原本的策略依據。
 * 策略依據沒有刪，入口縮到提案頁的標題列；總監在對話裡改策略依據時，右邊還是會切過去。
 */
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Modal, ModalContent, ModalHeader, ModalBody, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap, faPenNib, faSliders, faLockOpen, faLock, faArrowRight, faFileLines, faExpand, faCompress, faBullseye } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { CHANNEL_META, channelLabel, channelRoute } from "../../../platform/lib/channelMeta";
import { phaseOf, type CampaignPhaseId, type CampaignPlan, type CampaignPlanItem } from "../../../strategy/lib/campaign/campaignSchema";
import { stagePhases, stageLanes, countdown, stageNotes, phaseLabel, phaseLabelLong, type PhaseNames, type StagePhase } from "../../../strategy/lib/campaign/campaignStage";
import { LockToggle } from "../../../strategy/components/positioning/LockToggle";
import CampaignMap, { type NewItemInput } from "./CampaignMap";
import CampaignSetupForm from "./CampaignSetupForm";
import CampaignChatCard from "./CampaignChatCard";
import CampaignBasisPanel from "../../../strategy/components/events/CampaignBasisPanel";
import CampaignProposalPanel, { DraftProposalButton, useDraftProgress, type ProposalPanelHandle } from "../../../strategy/components/events/CampaignProposalPanel";
import {
  alignmentIsEmpty, applyAlignmentToPlan, applyAlignmentToSections,
  type AlignResult, type CampaignProposal, type ProposalAlignment, type ProposalQuote, type ProposalSection,
} from "../../../strategy/lib/campaign/campaignProposal";
import { readStoredDirector } from "../../../strategy/lib/strategistDirectors";
import { gatewayMessage, retryOnGateway } from "../../../platform/lib/gatewayRetry";
import type { QuoteReply } from "./CampaignChatCard";
import KolBriefForm from "./KolBriefForm";
import ChannelBriefForm, { type ChannelBriefSpec } from "./ChannelBriefForm";
import { briefFromBasis, briefFromEvent, type BasisPatch, type BasisValue } from "../../../strategy/lib/campaign/campaignBasis";
import { dockDirector } from "../../../strategy/lib/directorDock";
import CampaignHandoff from "./CampaignHandoff";
import CampaignKpiPanel from "./CampaignKpiPanel";
import CampaignPostModal from "./CampaignPostModal";
import { PlatformTaskModal } from "../../pages/PlatformTaskPage";
import { money, metricLine } from "../../../strategy/lib/campaign/campaignKpi";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const md = (s: string) => s.slice(5).replace("-", "/");
/** 前台的七個通路（planGate 隱藏的不列）。 */
// 2026-10-01：網紅、異業合作跟其他通路一樣在這裡（企劃裡各一條線），不再是只有說明的按鈕。
const DOCK_CHANNELS = ["facebook", "instagram", "threads", "line", "tiktok", "email", "website", "kol", "cobrand"];

export default function CampaignStage({ eventId, brandId }: { eventId: number; brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const utils = (trpc as any).useUtils();

  const q = (trpc as any).campaign.get.useQuery({ eventId }, { refetchOnWindowFocus: false });
  // 地圖上每一點滑過去的縮圖：寫好的那幾篇的圖與開頭（沒寫的用任務卡插畫，不用問）。
  const thumbsQ = (trpc as any).campaign.itemThumbs.useQuery({ eventId }, { refetchOnWindowFocus: false, staleTime: 5 * 60_000 });
  const productsQ = (trpc as any).product?.list?.useQuery(
    { brandId: brandId ?? undefined }, { enabled: !!brandId, refetchOnWindowFocus: false },
  ) ?? { data: [] };

  /**
   * 2026-10-05（CJ「活動定位總覽的地方，有點太複雜，當定位完成後，可以直接到左邊對話右邊
   * 企劃草稿的地方嗎? 讓用戶可以對話改」）：活動定位跑完會帶 ?draft=1 過來。還沒有企劃的話就
   * 用定位直接排第一版（CampaignSetupForm 的 autoBrief），排好左邊對話卡就在。記號只用一次，
   * 讀完馬上從網址拿掉——重新整理不會再排一次。
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const [autoDraft] = React.useState(() => searchParams.get("draft") === "1");
  const [drafting, setDrafting] = React.useState(false);
  React.useEffect(() => {
    if (searchParams.get("draft") !== "1") return;
    setSearchParams((prev) => { const sp = new URLSearchParams(prev); sp.delete("draft"); return sp; }, { replace: true });
  }, [searchParams, setSearchParams]);

  const [plan, setPlan] = React.useState<CampaignPlan | null>(null);
  const [current, setCurrent] = React.useState<CampaignPhaseId | null>(null);
  const [full, setFull] = React.useState(false);
  const [kpiOpen, setKpiOpen] = React.useState(false);
  /**
   * 右邊看什麼：企劃地圖或策略依據（2026-09-30 CJ「策略依據…可以替代右邊的行事曆，讓用戶
   * 還是可以透過跟總監的互動，進行修改和討論…位置移到最上方的企劃草稿」）。
   */
  const [view, setView] = React.useState<"map" | "basis" | "proposal">("map");
  /** 策略依據目前的值（存檔前先改畫面）與剛被總監改過的格子。 */
  const [basisLocal, setBasisLocal] = React.useState<Record<string, BasisValue | null>>({});
  const [basisRecent, setBasisRecent] = React.useState<Set<string>>(new Set());
  /** 對話卡展開＝佔滿左欄（CJ 2026-09-30）；左欄其他東西先收起來。 */
  const [chatExpanded, setChatExpanded] = React.useState(false);
  const [setupOpen, setSetupOpen] = React.useState(false);
  /** 網紅任務說明單（2026-10-01 CJ：按下網紅＝填說明單，不是調整活動設定）。 */
  const [kolOpen, setKolOpen] = React.useState(false);
  /** 其他通路的任務說明單（2026-10-02 CJ：照網紅那張做）：打開的是哪個通路。 */
  const [briefCh, setBriefCh] = React.useState<string | null>(null);
  const specsQ = (trpc as any).campaign.briefSpecs.useQuery(undefined, { staleTime: Infinity, refetchOnWindowFocus: false });
  const briefSpec: ChannelBriefSpec | undefined = briefCh ? specsQ.data?.[briefCh] : undefined;
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErr, setSaveErr] = React.useState("");
  const dirtyRef = React.useRef(false);
  const planRef = React.useRef<CampaignPlan | null>(null);
  planRef.current = plan;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!q.data) return;
    if (!dirtyRef.current) { setPlan(q.data.plan ?? null); return; }
    // 正在改企劃（還沒存）的時候，另一個視窗寫好了一篇：只把「寫好了」併進來，不蓋掉手上的修改。
    const server = new Map<string, any>((q.data.plan?.items ?? []).map((i: any) => [i.id, i]));
    const cur = planRef.current;
    if (!cur) return;
    const merged = { ...cur, items: cur.items.map((i) => {
      const s2 = server.get(i.id);
      return s2 ? { ...i, outputId: s2.outputId ?? null, publishedUrl: s2.publishedUrl ?? null } : i;
    }) };
    planRef.current = merged;
    setPlan(merged);
  }, [q.data]);

  /** 「寫這篇」開的任務視窗，以及寫好之後開的那一篇（itemId＋outputId）。 */
  const [writing, setWriting] = React.useState<CampaignPlanItem | null>(null);
  const [openPost, setOpenPost] = React.useState<{ itemId: string; outputId: number; ask?: string } | null>(null);
  const openItem = (it: CampaignPlanItem, ask?: string) => {
    if (it.outputId) setOpenPost({ itemId: it.id, outputId: Number(it.outputId), ask });
    else setWriting(it);
  };
  React.useEffect(() => {
    if (q.data?.basis?.editable) setBasisLocal(q.data.basis.editable);
  }, [q.data?.basis?.editable]);

  const saveBasisMut = (trpc as any).campaign.saveBasis.useMutation({
    onSuccess: () => { setSaveState("saved"); utils?.campaign?.get?.invalidate?.({ eventId }); },
    onError: (e: any) => { setSaveState("error"); setSaveErr(e?.message ?? ""); utils?.campaign?.get?.invalidate?.({ eventId }); },
  });
  /** 改策略依據：畫面先變、馬上存。fromChat＝總監改的——右邊切過去、標出剛改的格子。 */
  const applyBasis = (patch: BasisPatch, fromChat = false) => {
    setBasisLocal((prev) => ({ ...prev, ...patch }));
    setSaveState("saving");
    saveBasisMut.mutate({ eventId, patch });
    if (fromChat) {
      setView("basis");
      setBasisRecent(new Set(Object.keys(patch)));
    }
  };
  React.useEffect(() => {
    if (!basisRecent.size) return;
    const t = setTimeout(() => setBasisRecent(new Set()), 6000);
    return () => clearTimeout(t);
  }, [basisRecent]);

  // 對話改了活動本身的日期（或復原）：存完重讀，倒數與檔期跟著變。
  const setDatesMut = (trpc as any).campaign.setDates.useMutation({
    onSuccess: () => { utils?.campaign?.get?.invalidate?.({ eventId }); utils?.campaign?.addOptions?.invalidate?.({ eventId }); utils?.scope?.invalidate?.(); },
    onError: (e: any) => { setSaveState("error"); setSaveErr(e?.message ?? ""); utils?.campaign?.get?.invalidate?.({ eventId }); },
  });
  const applyDates = (d: { startAt: string | null; endAt: string | null }) => setDatesMut.mutate({ eventId, ...d });

  const savePlanMut = (trpc as any).campaign.savePlan.useMutation({
    onError: (e: any) => { setSaveState("error"); setSaveErr(e?.message ?? ""); },
  });
  /**
   * 存手上的企劃。存完才算「沒有未存的修改」——但只有在這次存檔送出後沒有再改過的時候。
   *
   * 2026-10-06 dev 實測：拖完一篇馬上按「放回原位」，放不回去。第一次存檔回來時把「有未存的
   * 修改」清掉並重讀，重讀到的是伺服器上還沒放回去的那一版，蓋掉了畫面上剛放回去的；接著
   * 第二次存檔就把那一版存了回去。所以每改一次記一個序號，存檔回來時序號對不上就什麼都不做
   * （後面那一次存檔會收尾）。
   */
  const editSeq = React.useRef(0);
  const savePlan = (p: CampaignPlan) => {
    const seq = editSeq.current;
    const { lockedAt: _l, ...body } = p as any;
    savePlanMut.mutate({ eventId, plan: body }, {
      onSuccess: () => {
        if (seq !== editSeq.current) return;
        dirtyRef.current = false; setSaveState("saved"); utils?.campaign?.get?.invalidate?.({ eventId });
      },
    });
  };

  /** 改了就存（停手 0.8 秒後）。標題旁的鎖頭隨時可能被按，不能留一份沒存的改動。 */
  const patchItem = (id: string, next: Partial<CampaignPlanItem>) => {
    const p = planRef.current;
    if (!p) return;
    queueSave({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...next } : i)) });
  };
  /** 直接在畫面上改標語、階段的名稱與訊息（2026-10-08）：跟改一篇同一條存檔的路。 */
  const patchPlan = (next: Partial<Pick<CampaignPlan, "smp" | "phaseNames" | "phaseMessages">>) => {
    const p = planRef.current;
    if (!p) return;
    queueSave({ ...p, ...next });
  };
  /** 階段的名稱清空＝用回預設的；訊息清空＝這一段沒有訊息。 */
  const patchPhase = (id: CampaignPhaseId, next: { name?: string; message?: string }) => {
    const p = planRef.current;
    if (!p) return;
    const set = (cur: Partial<Record<CampaignPhaseId, string>> | undefined, v: string) => {
      const out = { ...(cur ?? {}) };
      if (v.trim()) out[id] = v; else delete out[id];
      return out;
    };
    patchPlan({
      ...(next.name !== undefined ? { phaseNames: set(p.phaseNames, next.name.slice(0, 12)) } : {}),
      ...(next.message !== undefined ? { phaseMessages: set(p.phaseMessages, next.message.slice(0, 60)) } : {}),
    });
  };
  const queueSave = (updated: CampaignPlan) => {
    planRef.current = updated;
    setPlan(updated);
    dirtyRef.current = true;
    editSeq.current += 1;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (planRef.current) savePlan(planRef.current); }, 800);
  };
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const toggleFull = () => {
    if (full) {
      setFull(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } else {
      setFull(true);
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };
  React.useEffect(() => {
    if (!full) return;
    const onChange = () => { if (!document.fullscreenElement) setFull(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [full]);

  // 2026-09-30（CJ「都在左邊完成回答…在同一個地方換人」）：策略總監在左邊的對話卡裡，
  // 這一頁右下角的總監收起來。
  React.useEffect(() => dockDirector(), []);

  /** 對話帶來的修改：換掉企劃、馬上存（不等停手）。 */
  const applyPlan = (next: CampaignPlan) => {
    if (timer.current) clearTimeout(timer.current);
    planRef.current = next;
    setPlan(next);
    dirtyRef.current = true;
    editSeq.current += 1;
    setSaveState("saving");
    savePlan(next);
  };

  /**
   * 手動加一篇（2026-10-05 CJ「在某通路欄位底下，自己在該日期按+」）：伺服器驗證後回那一格，
   * 併進手上的企劃（含還沒存的修改）馬上存。失敗就 throw，表單會顯示伺服器給的原因。
   */
  const addOptsQ = (trpc as any).campaign.addOptions.useQuery({ eventId }, { enabled: !!plan, refetchOnWindowFocus: false, staleTime: 5 * 60_000 });
  const draftItemMut = (trpc as any).campaign.draftItem.useMutation();
  const addItem = async (input: NewItemInput) => {
    const { item } = await draftItemMut.mutateAsync({ eventId, ...input });
    const p = planRef.current;
    if (!p) return;
    applyPlan({ ...p, items: [...p.items, item as CampaignPlanItem].sort((a, b) => a.date.localeCompare(b.date)) });
  };

  /**
   * 總覽上直接刪一篇／復原（2026-10-06 CJ「時間軸可以新增、拖曳或刪除」）：只刪還沒寫的——
   * 寫好的那一篇有成品掛著，用「這篇不做」。馬上存，復原就是把同一格放回去。
   */
  const removeItem = (id: string) => {
    const p = planRef.current;
    if (!p || p.items.some((i) => i.id === id && i.outputId)) return;
    applyPlan({ ...p, items: p.items.filter((i) => i.id !== id) });
  };
  const restoreItem = (item: CampaignPlanItem) => {
    const p = planRef.current;
    if (!p || p.items.some((i) => i.id === item.id)) return;
    applyPlan({ ...p, items: [...p.items, item].sort((a, b) => a.date.localeCompare(b.date)) });
  };
  /** 拖到另一段之後照那一段的策略改寫（使用者說好才叫）：只回新的一句，套用由地圖走 patchItem。 */
  const retuneMut = (trpc as any).campaign.retuneItem.useMutation();
  /**
   * 草擬提案（2026-10-08）：先把手上還沒存的企劃存進去（伺服器讀的是存著的那一份），再請
   * 伺服器照企劃與每一篇的內容寫。寫好右邊換成提案。失敗時原本那一份還在。
   */
  const directorAgentId = React.useMemo(() => (brandId ? readStoredDirector(brandId, "brand") : null), [brandId]);
  const teamQ = (trpc as any).campaign.team.useQuery({ eventId, directorAgentId }, { refetchOnWindowFocus: false, staleTime: 10 * 60_000 });
  const draftMut = (trpc as any).campaign.draftProposal.useMutation();
  const saveProposalMut = (trpc as any).campaign.saveProposal.useMutation();
  const [draftErr, setDraftErr] = React.useState("");
  // 進度條跟著「這一次草擬」走，不是跟著單一次請求：伺服器重啟時會安靜地重送（gatewayRetry），
  // 中間那幾秒進度條不能歸零。
  const [draftBusy, setDraftBusy] = React.useState(false);
  const draftBusyRef = React.useRef(false);
  const [alignBusy, setAlignBusy] = React.useState(false);
  /** 正在等伺服器回來（部署重啟的那幾十秒）：畫面說一聲，不讓人以為卡住。 */
  const [waitingServer, setWaitingServer] = React.useState(false);
  const withRetry = <T,>(fn: () => Promise<T>) =>
    retryOnGateway(fn, { onWait: () => setWaitingServer(true) }).finally(() => setWaitingServer(false));
  const proposalPct = useDraftProgress(draftBusy);
  const postsQ = (trpc as any).campaign.proposalPosts.useQuery({ eventId }, { enabled: view === "proposal", refetchOnWindowFocus: false });
  const draftProposal = async () => {
    if (draftBusyRef.current) return;
    draftBusyRef.current = true; setDraftBusy(true);
    setDraftErr("");
    try {
      const p = planRef.current;
      if (p && dirtyRef.current && !p.lockedAt) {
        if (timer.current) clearTimeout(timer.current);
        const { lockedAt: _l, ...body } = p as any;
        const seq = editSeq.current;
        await withRetry(() => savePlanMut.mutateAsync({ eventId, plan: body }));
        if (seq === editSeq.current) { dirtyRef.current = false; setSaveState("saved"); }
      }
      await withRetry(() => draftMut.mutateAsync({ eventId, lang: en ? "en" : "zh", directorAgentId }));
      setAlignResult(null);
      await utils?.campaign?.get?.invalidate?.({ eventId });
      postsQ.refetch?.();
      setView("proposal");
    } catch (e: any) {
      setDraftErr(gatewayMessage(e, L("這一次沒有寫成，原本那一份還在，請再按一次", "Drafting failed — your current proposal is unchanged. Please try again."), en));
    } finally {
      draftBusyRef.current = false; setDraftBusy(false);
    }
  };
  const saveProposal = async (sections: ProposalSection[], opts: { aligned?: boolean; touched?: string[] } = {}) => {
    // 存檔是整份覆寫，重送一次結果一樣；伺服器重啟時不要讓使用者改的字存不進去。
    await withRetry(() => saveProposalMut.mutateAsync({ eventId, sections, ...opts }))
      .catch((e: any) => { throw new Error(gatewayMessage(e, L("沒有存成，請再試一次", "Couldn't save — try again"), en)); });
    await utils?.campaign?.get?.invalidate?.({ eventId });
  };

  /**
   * 反白提案的一段帶進左邊的對話（2026-10-09）：內容企劃只改那一段，改好的直接換到右邊、
   * 標「剛改」幾秒；對話裡那一則可以復原。那一段的內文拿畫面上現在的（可能還沒存）。
   */
  const panelRef = React.useRef<ProposalPanelHandle>(null);
  const [quote, setQuote] = React.useState<ProposalQuote | null>(null);
  const [recentSections, setRecentSections] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (!recentSections.size) return;
    const t = setTimeout(() => setRecentSections(new Set()), 6000);
    return () => clearTimeout(t);
  }, [recentSections]);
  const reviseMut = (trpc as any).campaign.reviseProposal.useMutation();
  const reviseQuote = async (q: ProposalQuote, instruction: string): Promise<QuoteReply> => {
    const before = panelRef.current?.sections().find((s) => s.id === q.sectionId)?.body ?? "";
    const r: any = await withRetry<any>(() => reviseMut.mutateAsync({ eventId, sectionId: q.sectionId, body: before, quote: q.text, instruction, directorAgentId }))
      .catch((e: any) => { throw new Error(gatewayMessage(e, L("這次沒有改成，原本的內容還在", "Couldn't change it — the original is unchanged"), en)); });
    if (r.changed) {
      await panelRef.current?.replace(q.sectionId, String(r.body));
      setView("proposal");
      setRecentSections(new Set([q.sectionId]));
    }
    return {
      reply: String(r.reply ?? ""), name: r.agent?.name, changed: !!r.changed,
      unsourced: Array.isArray(r.unsourced) ? r.unsourced.map(String) : [],
      undo: () => { void panelRef.current?.replace(q.sectionId, before); setRecentSections(new Set([q.sectionId])); },
    };
  };

  /**
   * 提案改過之後梳理整份（2026-10-09 CJ「要不要根據這個調整，進行整份文件的邏輯梳理…實際上的
   * 貼文等等，也要調整」）：伺服器回要跟著改的段落、標語／各段訊息、還沒寫的貼文方向，以及
   * 寫好的哪幾篇建議重寫。段落與企劃各自存；整個可以復原（放回梳理前的那一份）。
   */
  const alignMut = (trpc as any).campaign.alignProposal.useMutation();
  const [alignErr, setAlignErr] = React.useState("");
  const [alignResult, setAlignResult] = React.useState<AlignResult | null>(null);
  const alignUndo = React.useRef<{ sections: ProposalSection[]; touched: string[]; plan: CampaignPlan | null } | null>(null);
  const alignProposal = async () => {
    if (alignBusy) return;
    setAlignBusy(true);
    setAlignErr(""); setAlignResult(null);
    try {
      await panelRef.current?.flush();
      const a: ProposalAlignment = await withRetry(() => alignMut.mutateAsync({ eventId, directorAgentId }));
      const cur = panelRef.current?.sections() ?? [];
      const p = planRef.current;
      const planNext = p && !p.lockedAt ? applyAlignmentToPlan(p, a) : p;
      const planChanged = !!p && !!planNext && JSON.stringify(planNext) !== JSON.stringify(p);
      alignUndo.current = { sections: cur, touched: (q.data?.proposal?.touched ?? []) as string[], plan: planChanged ? p : null };
      // 沒有要動的也存一次（aligned）：這一批修改已經對過了，不用再問。
      await saveProposal(applyAlignmentToSections(cur, a), { aligned: true });
      if (planChanged && planNext) applyPlan(planNext);
      setRecentSections(new Set(Object.keys(a.sections)));
      const byId = new Map((planNext ?? p)?.items.map((i) => [i.id, i]) ?? []);
      setAlignResult({
        reply: a.reply, name: a.agent?.name || L("內容企劃", "The planner"),
        sectionTitles: cur.filter((s) => typeof a.sections[s.id] === "string").map((s) => s.title),
        itemCount: planChanged ? a.items.length : 0,
        planChanged: planChanged && (!!a.smp || !!Object.keys(a.phaseMessages ?? {}).length),
        rewrite: a.rewrite.flatMap((r) => (byId.get(r.id) ? [{ item: byId.get(r.id)!, reason: r.reason }] : [])),
      });
      if (alignmentIsEmpty(a)) alignUndo.current = null;
    } catch (e: any) {
      setAlignErr(gatewayMessage(e, L("這一次沒有梳理成，提案與貼文都沒有動", "Realigning failed — nothing was changed"), en));
    } finally {
      setAlignBusy(false);
    }
  };
  const undoAlign = async () => {
    const u = alignUndo.current;
    alignUndo.current = null;
    setAlignResult(null);
    if (!u) return;
    try {
      await saveProposal(u.sections, { touched: u.touched });
      if (u.plan && !planRef.current?.lockedAt) applyPlan(u.plan);
    } catch (e: any) {
      setAlignErr(gatewayMessage(e, L("沒有復原成功，請再試一次", "Undo failed — try again"), en));
    }
  };

  const retuneItem = async (it: CampaignPlanItem, from: CampaignPhaseId): Promise<string> => {
    const r = await retuneMut.mutateAsync({
      eventId, itemId: it.id, phase: it.phase, fromPhase: from, date: it.date,
      platform: it.platform, taskLabel: it.taskLabel, angle: it.angle,
    });
    return String(r.angle);
  };

  // 定稿那一刻（鎖頭在標題旁，由 CampaignLockToggle 按）跳出交接單。第一次載入就已經
  // 定稿的不跳——那不是「剛交接」。
  const [handoffOpen, setHandoffOpen] = React.useState(false);
  const prevLock = React.useRef<string | null | undefined>(undefined);
  React.useEffect(() => {
    if (!plan) return;
    const now = plan.lockedAt ?? null;
    if (prevLock.current === null && now) setHandoffOpen(true);
    prevLock.current = now;
  }, [plan?.lockedAt, plan]);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-3 py-10">
        <Spinner size="sm" /><span className="text-small text-default-500">{L("載入中…", "Loading…")}</span>
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="flex flex-col gap-3 py-6">
        <p className="text-small text-danger">{String(q.error?.message ?? "").slice(0, 200)}</p>
        <Button size="sm" variant="bordered" className="self-start" onPress={() => q.refetch?.()}>{L("重試", "Retry")}</Button>
      </div>
    );
  }

  const data = q.data ?? {};
  const ev = data.event ?? {};
  /** 自動排第一版用的那段話：有活動定位就用定位，還沒有就用新增活動時填的內容（2026-10-08）。 */
  const basisBrief = briefFromBasis(data.basis?.raw);
  const settings = data.settings ?? { channels: [] };
  const items: CampaignPlanItem[] = plan?.items ?? [];
  const locked = !!plan?.lockedAt;
  const phases = stagePhases(items);
  const lanes = stageLanes(items, settings.channels ?? []);
  const live = items.filter((i) => i.enabled);
  const done = live.filter((i) => !!i.outputId).length;
  const cur = current && phases.some((p) => p.id === current) ? current : null;
  const curPhase = cur ? phases.find((p) => p.id === cur)! : null;
  const names: PhaseNames = plan?.phaseNames;
  const proposal: CampaignProposal | null = data.proposal ?? null;
  // 提案還沒有卻停在提案那一頁：回地圖。
  const showing = view === "proposal" && !proposal ? "map" : view;
  const cd = countdown(ev.startAt ?? null, ev.endAt ?? null, ymd(new Date()));
  const notes = plan ? stageNotes(items, settings.channels ?? [], cur) : [];
  const brandProducts = (((productsQ.data as any[]) ?? []) as any[]).map((p) => ({ id: Number(p.id), name: String(p.name) }));
  const lead = data.productScope === "brand" ? L("純品牌活動", "Brand campaign")
    : (data.products ?? []).map((p: any) => p.name).join("、") || L("還沒指定", "Not set");

  const goStrategyBasis = () => {
    const sp = new URLSearchParams();
    if (brandId) sp.set("b", String(brandId));
    sp.set("e", String(eventId)); sp.set("cat", "positioning");
    navigate(`/brands/edit?${sp.toString()}`);
  };
  const goWrite = () => {
    const sp = new URLSearchParams();
    if (brandId) sp.set("b", String(brandId));
    sp.set("e", String(eventId)); sp.set("start", "1");
    navigate(`/campaigns?${sp.toString()}`);
  };

  return (
    <div className={full ? "fixed inset-0 z-50 bg-background p-3 sm:p-4" : "w-full"}>
      <div className={`rounded-3xl border border-divider bg-content1 overflow-hidden shadow-small flex flex-col ${full ? "h-full" : "lg:h-[calc(100vh-180px)] lg:min-h-[660px]"}`}>
        {/* ── 上：控制列 ─────────────────────────────────────────── */}
        <div className="border-b border-divider px-4 py-2.5 flex items-center gap-x-4 gap-y-2 flex-wrap shrink-0">
          {full && <p className="text-medium font-bold mr-1 truncate max-w-[260px]" title={ev.name}>{ev.name}</p>}
          <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={L("階段", "Phases")}>
            <button type="button" onClick={() => { setCurrent(null); setView("map"); }} aria-pressed={!cur && showing === "map"}
              className={`flex items-center gap-1.5 text-tiny font-semibold rounded-lg border px-2.5 py-1 mr-1 transition ${!cur && showing === "map" ? "bg-foreground text-background border-foreground" : "border-default-300 text-default-600 hover:border-foreground"}`}>
              <FontAwesomeIcon icon={faMap} />{L("總覽", "Overview")}
            </button>
            {phases.map((p) => {
              const on = cur === p.id && showing === "map";
              return (
                <button key={p.id} type="button" onClick={() => { setCurrent(p.id); setView("map"); }} aria-pressed={on}
                  className={`text-tiny font-semibold px-2 py-1 border-b-2 transition ${on ? "text-foreground border-foreground" : "text-default-400 border-transparent hover:text-default-700"}`}>
                  {phaseLabel(names, p.id, en)}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2.5 flex-wrap justify-end">
            {saveState === "saving" && <span className="text-tiny text-default-500">{L("儲存中…", "Saving…")}</span>}
            {saveState === "saved" && <span className="text-tiny text-default-500">{L("已儲存", "Saved")}</span>}
            {saveState === "error" && <span className="text-tiny text-danger max-w-[240px] truncate" title={saveErr}>{saveErr}</span>}
            <span className={`flex items-center gap-1.5 text-tiny font-semibold ${locked ? "text-foreground" : "text-default-500"}`}
              title={!locked && plan ? L("定稿後才能到內容層寫——按標題旁的鎖頭定稿", "Lock the plan (padlock by the title) to start writing") : undefined}>
              <FontAwesomeIcon icon={locked ? faLock : faLockOpen} />
              {locked
                ? L(`已定稿 ${new Date(plan!.lockedAt!).toLocaleDateString("zh-TW")}`, `Locked ${new Date(plan!.lockedAt!).toLocaleDateString("en-US")}`)
                : plan ? L("企劃草稿", "Draft") : L("尚未排企劃", "No plan yet")}
            </span>
            {draftErr && showing !== "proposal" && <span className="text-tiny text-danger max-w-[240px] truncate" title={draftErr}>{draftErr}</span>}
            {waitingServer && <span className="text-tiny text-default-500" role="status">{L("系統更新中，自動重試…", "Server updating — retrying…")}</span>}
            {plan && live.length > 0 && (proposal ? (
              <DraftProposalButton en={en} icon={faFileLines} label={L("提案", "Proposal")} progress={proposalPct} pressed={showing === "proposal"}
                onPress={() => setView((v) => (v === "proposal" ? "map" : "proposal"))}
                title={L("右邊換成提案：策略段落、排程與每一篇的全文", "Show the proposal on the right")} />
            ) : (
              <DraftProposalButton en={en} icon={faFileLines} label={L("草擬提案", "Draft proposal")} progress={proposalPct} onPress={draftProposal}
                title={L("照你改好的標語、階段與每一篇，寫出背景、目標、族群、策略，並附上每天的排程與全文", "Write the background, goals, audience and strategy from your plan and posts, with the full schedule")} />
            ))}
            <span className="w-px h-5 bg-divider" />
            <div className="flex gap-1.5" aria-label={L("通路", "Channels")}>
              {DOCK_CHANNELS.map((c) => {
                const on = (settings.channels ?? []).includes(c) || live.some((i) => i.platform === c)
                  || (c === "kol" && !!settings.partners?.kol)          // 舊設定的「要找網紅合作」
                  || (c === "cobrand" && !!settings.partners?.cobrand); // 舊設定的「要做異業合作」
                return (
                  <button key={c} type="button" disabled={locked || !plan}
                    title={on ? channelLabel(c, en) : L(`加入 ${channelLabel(c, en)}：到設定裡勾選後重排，或直接跟內容企劃說`, `Add ${channelLabel(c, en)} in settings, or ask the planner`)}
                    onClick={() => (c === "kol" ? setKolOpen(true) : specsQ.data?.[c] ? setBriefCh(c) : setSetupOpen(true))}
                    className={`w-7 h-7 rounded-lg grid place-items-center text-tiny transition disabled:cursor-default ${on ? "bg-foreground text-background" : "bg-default-100 text-default-400 hover:text-default-700"}`}>
                    <FontAwesomeIcon icon={CHANNEL_META[c]?.icon ?? faPenNib} />
                  </button>
                );
              })}
            </div>
            <span className="w-px h-5 bg-divider" />
            {plan && (
              <Button size="sm" variant={plan.kpi ? "light" : "bordered"} radius="md" startContent={<FontAwesomeIcon icon={faBullseye} />}
                onPress={() => setKpiOpen(true)}>{L("KPI 與預算", "KPIs & budget")}</Button>
            )}
            {plan && !locked && (
              <Button size="sm" variant="bordered" radius="md" startContent={<FontAwesomeIcon icon={faSliders} />}
                onPress={() => setSetupOpen(true)}>{L("調整設定", "Settings")}</Button>
            )}
            {locked && (
              <Button size="sm" color="primary" radius="md" endContent={<FontAwesomeIcon icon={faArrowRight} />} onPress={goWrite}>
                {L(`到內容層寫（還有 ${live.length - done} 篇）`, `Write in Content (${live.length - done} left)`)}
              </Button>
            )}
            {/* 全螢幕時標題被蓋住，鎖頭跟著搬進來（同一顆，不是第二個入口）。 */}
            {full && <div className="scale-75 -my-3"><CampaignLockToggle eventId={eventId} en={en} /></div>}
            <Button size="sm" variant="light" radius="md" isIconOnly onPress={toggleFull}
              aria-label={full ? L("離開全螢幕", "Exit full screen") : L("全螢幕", "Full screen")}
              title={full ? L("離開全螢幕（Esc）", "Exit full screen (Esc)") : L("全螢幕", "Full screen")}>
              <FontAwesomeIcon icon={full ? faCompress : faExpand} />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)]">
          {/* ── 左：策略 ─────────────────────────────────────────── */}
          <section className="relative bg-gradient-to-b from-default-50 to-default-100 min-w-0 min-h-0 lg:border-r border-b lg:border-b-0 border-divider overflow-hidden">
            <div className="relative p-5 flex flex-col gap-4 h-full overflow-y-auto">
            {!(chatExpanded && plan) && (<>
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div>
                <p className="text-6xl font-black leading-none tracking-tight tabular-nums">
                  {curPhase ? curPhase.count : cd.big}
                </p>
                <p className="text-tiny text-default-500 mt-2">
                  {curPhase
                    ? L(`篇　·　${phaseLabelLong(names, curPhase.id, false)} ${md(curPhase.from)}${curPhase.to !== curPhase.from ? ` – ${md(curPhase.to)}` : ""}`,
                        `posts · ${phaseLabelLong(names, curPhase.id, true)}`)
                    : (en ? cd.unitEn : cd.unitZh)}
                </p>
              </div>
              <div className="text-right text-tiny text-default-600 flex flex-col gap-1">
                {plan && <span className="tabular-nums">{L(`已寫 ${done} / ${live.length}`, `${done} / ${live.length} written`)}</span>}
                <span>{L("主角　", "Lead ")}<b className="text-foreground">{lead}</b></span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 shrink-0">
              {curPhase ? (
                <>
                  <p className="text-[11px] tracking-widest text-default-500">{L("這一段要做到", "THIS PHASE")}</p>
                  <p className="text-large font-bold leading-snug text-balance">{phaseOf(curPhase.id)?.purposeZh}</p>
                  {plan?.phaseMessages?.[curPhase.id] && (
                    <p className="text-small text-default-600">{L("訊息：", "Message: ")}{plan.phaseMessages[curPhase.id]}</p>
                  )}
                  {plan?.kpi?.phases?.[curPhase.id] && (() => {
                    const k = plan.kpi!.phases[curPhase.id]!;
                    return (
                      <p className="text-small text-default-600">
                        {L("預算：", "Budget: ")}{money(k.budget, en)}（{k.share}%）
                        {k.metrics.length ? `　KPI：${k.metrics.map((m) => metricLine(m, en)).join("、")}` : ""}
                      </p>
                    );
                  })()}
                </>
              ) : plan ? (
                <>
                  <p className="text-[11px] tracking-widest text-default-500">{L("一句話訴求", "CORE MESSAGE")}</p>
                  {locked ? (
                    <p className="text-xl font-bold leading-snug text-balance">{plan.smp}</p>
                  ) : (
                    // 標語直接在這裡改（2026-10-08）：停手就存，跟改一篇同一條路。
                    <textarea value={plan.smp} rows={1} maxLength={200}
                      onChange={(e) => patchPlan({ smp: e.target.value.replace(/[\r\n]+/g, "") })}
                      style={{ fieldSizing: "content" } as React.CSSProperties}
                      placeholder={L("寫下這檔活動的標語", "Write the campaign tagline")}
                      aria-label={L("標語（一句話訴求）", "Tagline")}
                      title={L("點一下直接改", "Click to edit")}
                      className="w-full text-xl font-bold leading-snug bg-transparent resize-none outline-none rounded-lg px-1.5 -mx-1.5 hover:bg-default-200/60 focus:bg-content1 focus:shadow-small" />
                  )}
                  {data.audience && <p className="text-small text-default-600 line-clamp-3" title={data.audience}>{L("對象：", "Audience: ")}{data.audience}</p>}
                  {settings.mechanic && <p className="text-small text-default-600">{L("機制：", "Offer: ")}{settings.mechanic}</p>}
                  {plan.kpi && (plan.kpi.budget || plan.kpi.goals?.length) ? (
                    <p className="text-small text-default-600">
                      {plan.kpi.budget ? `${L("預算：", "Budget: ")}${money(plan.kpi.budget, en)}` : ""}
                      {plan.kpi.goals?.length ? `${plan.kpi.budget ? "　" : ""}${L("目標：", "Goal: ")}${plan.kpi.goals.map((g) => metricLine(g, en)).join("、")}` : ""}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="text-[11px] tracking-widest text-default-500">{drafting ? L("排企劃中", "PLANNING") : L("還沒有企劃", "NO PLAN YET")}</p>
                  <p className="text-large font-bold leading-snug">
                    {drafting
                      ? L("正在排出企劃草稿。排好之後，在這裡用對話修改。", "Building the draft plan. You'll edit it by chatting here.")
                      : L("在右邊寫一段話，排出這檔活動的宣傳企劃。", "Describe the campaign on the right to build its plan.")}
                  </p>
                </>
              )}
            </div>

            <div className="shrink-0"><ReachFan phases={phases} lanes={lanes} items={items} current={cur} en={en} names={names} /></div>
            </>)}

            {plan && (
              <CampaignChatCard eventId={eventId} brandId={brandId} plan={plan} phase={cur} notes={notes} locked={locked} en={en} onApply={applyPlan} grow
                basis={basisLocal} onApplyBasis={(p) => applyBasis(p, true)} onApplyDates={applyDates} view={showing === "basis" ? "basis" : "map"}
                expanded={chatExpanded} onToggleExpand={() => setChatExpanded((v) => !v)}
                quote={showing === "proposal" ? quote : null} onClearQuote={() => setQuote(null)} onReviseQuote={reviseQuote} />
            )}

            </div>
          </section>

          {/* ── 右：策略地圖（撐滿這一欄的高度） ───────────────────── */}
          <section className="min-w-0 min-h-0 relative bg-default-100 overflow-hidden">
            {plan && showing === "proposal" && proposal ? (
              <CampaignProposalPanel ref={panelRef} proposal={proposal} plan={plan} posts={postsQ.data ?? {}} postsLoading={!!postsQ.isLoading}
                writerName={(() => { const m = teamQ.data?.planner; return (en && m?.nameEn ? m.nameEn : m?.name) || proposal.by?.name || L("內容企劃", "the planner"); })()}
                canAsk onQuote={setQuote} recent={recentSections}
                aligning={alignBusy} alignError={alignErr} onAlign={alignProposal} waitingServer={waitingServer}
                alignResult={alignResult} onUndoAlign={undoAlign} onCloseAlign={() => { setAlignResult(null); alignUndo.current = null; }}
                eventName={String(ev.name ?? "")} range={ev.startAt ? `${ev.startAt} → ${ev.endAt ?? "?"}` : ""} en={en}
                drafting={proposalPct} draftError={draftErr} onRedraft={draftProposal}
                onSave={saveProposal} saving={saveProposalMut.isPending}
                onOpenItem={openItem} onOpenBasis={() => setView("basis")} />
            ) : plan && showing === "basis" ? (
              <CampaignBasisPanel raw={data.basis?.raw ?? {}} editable={basisLocal} recent={basisRecent} locked={locked} en={en}
                onSave={(p) => applyBasis(p)} onOpenFull={goStrategyBasis} />
            ) : plan ? (
              <CampaignMap
                items={items} phases={phases} lanes={lanes} phaseMessages={plan.phaseMessages ?? {}}
                phaseNames={plan.phaseNames ?? {}} onPatchPhase={patchPhase}
                current={cur} onPick={setCurrent} locked={locked} en={en} onPatchItem={patchItem}
                fill
                phaseKpi={plan.kpi?.phases ?? {}}
                thumbs={thumbsQ.data ?? {}}
                onOpenItem={openItem}
                addOptions={addOptsQ.data ?? null} onAddItem={addItem}
                onRemoveItem={removeItem} onRestoreItem={restoreItem} onRetuneItem={retuneItem}
              />
            ) : (
              <div className="relative bg-default-100 p-4 sm:p-6 min-h-[420px] h-full overflow-y-auto">
                <div className="relative bg-content1 rounded-2xl shadow-small p-5 max-w-[620px]">
                  <CampaignSetupForm eventId={eventId} data={data} brandProducts={brandProducts} hasPlan={false} en={en}
                    autoBrief={autoDraft && !q.isFetching ? (basisBrief || briefFromEvent(ev)) : undefined}
                    autoFrom={basisBrief ? "positioning" : "event"} onAutoDrafting={setDrafting} />
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal isOpen={kpiOpen && !!plan} onClose={() => setKpiOpen(false)} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-medium">{L("KPI 與預算", "KPIs & budget")}</span>
            <span className="text-tiny font-normal text-default-500">{L("你填總數，專家拆到每一段、挑出要下廣告的貼文。各段加起來一定等於你填的總數。", "You set the totals; the specialist splits them across phases and picks posts to promote.")}</span>
          </ModalHeader>
          <ModalBody className="pb-6">
            {plan && (
              <CampaignKpiPanel eventId={eventId} plan={plan} locked={locked} en={en}
                onApply={(next) => { applyPlan(next); setKpiOpen(false); }} />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={kolOpen} onClose={() => setKolOpen(false)} size="4xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-medium">{L("網紅任務說明單", "Influencer brief")}</span>
            <span className="text-tiny font-normal text-default-500">{L("要交給網紅經紀公司或網紅本人的需求單。全部選填，填越多，邀約與 brief 越能為每一位量身寫。", "What you'd hand a talent agency. All optional — the more you fill, the more tailored each invite and brief.")}</span>
          </ModalHeader>
          <ModalBody className="pb-6">
            <KolBriefForm eventId={eventId} initial={data.kolBrief} locked={locked} en={en}
              prefill={{ smp: plan?.smp, goal: settings.goal, audience: data.audience, startAt: ev.startAt, endAt: ev.endAt }}
              onSaved={({ plan: next }) => {
                if (next) { planRef.current = next; setPlan(next); dirtyRef.current = false; }
                utils?.campaign?.get?.invalidate?.({ eventId });
                setKolOpen(false);
              }} />
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!briefSpec} onClose={() => setBriefCh(null)} size="4xl" scrollBehavior="inside">
        <ModalContent>
          {briefSpec && (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <span className="text-medium">{en ? briefSpec.en : briefSpec.zh}</span>
                <span className="text-tiny font-normal text-default-500">{en ? briefSpec.introEn : briefSpec.introZh}</span>
              </ModalHeader>
              <ModalBody className="pb-6">
                <ChannelBriefForm key={briefSpec.channel} eventId={eventId} spec={briefSpec} locked={locked} en={en}
                  initial={data.channelBriefs?.[briefSpec.channel]}
                  inherited={{ smp: plan?.smp, goal: settings.goal, audience: data.audience, startAt: ev.startAt, endAt: ev.endAt }}
                  inPlan={(settings.channels ?? []).includes(briefSpec.channel) || live.some((i) => i.platform === briefSpec.channel)
                    || (briefSpec.channel === "cobrand" && !!settings.partners?.cobrand)}
                  onOpenSetup={() => { setBriefCh(null); setSetupOpen(true); }}
                  onSaved={({ plan: next }) => {
                    if (next) { planRef.current = next; setPlan(next); dirtyRef.current = false; }
                    utils?.campaign?.get?.invalidate?.({ eventId });
                    setBriefCh(null);
                  }} />
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={setupOpen} onClose={() => setSetupOpen(false)} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="text-medium">{L("調整活動設定", "Campaign settings")}</ModalHeader>
          <ModalBody className="pb-6">
            <CampaignSetupForm eventId={eventId} data={data} brandProducts={brandProducts} hasPlan en={en}
              onPlanned={() => { setSetupOpen(false); setCurrent(null); dirtyRef.current = false; }}
              onOpenKolBrief={() => { setSetupOpen(false); setKolOpen(true); }} />
          </ModalBody>
        </ModalContent>
      </Modal>

      {plan && (
        <CampaignHandoff
          open={handoffOpen} onClose={() => setHandoffOpen(false)} onWrite={() => { setHandoffOpen(false); goWrite(); }}
          plan={plan} lead={lead} mechanic={settings.mechanic ?? ""}
          range={ev.startAt ? `${ev.startAt} → ${ev.endAt ?? "?"}` : L("未設定", "Not set")} en={en}
        />
      )}

      {/* 寫這篇：任務視窗直接開寫，寫好換成「這一篇」的視窗。 */}
      {writing && (
        <PlatformTaskModal key={`camp-${writing.id}`}
          route={channelRoute(writing.platform)} taskId={writing.taskId}
          camp={{ eventId, itemId: writing.id }} topic={writing.angle || undefined} slotDate={writing.date}
          autoRun
          onWritten={(oid) => { setOpenPost({ itemId: writing.id, outputId: oid }); }}
          onClose={() => { setWriting(null); thumbsQ.refetch?.(); if (view === "proposal") postsQ.refetch?.(); }} />
      )}
      {openPost && (() => {
        const base = items.find((i) => i.id === openPost.itemId);
        if (!base) return null;
        return (
          <CampaignPostModal key={`post-${openPost.itemId}-${openPost.outputId}`} initialAsk={openPost.ask}
            eventId={eventId} brandId={brandId}
            item={{ ...base, outputId: base.outputId ?? openPost.outputId }}
            thumb={(thumbsQ.data ?? {})[openPost.itemId] ?? null}
            phaseMessage={plan?.phaseMessages?.[base.phase] ?? ""}
            en={en} onClose={() => { setOpenPost(null); if (view === "proposal") postsQ.refetch?.(); }} />
        );
      })()}
    </div>
  );
}

/**
 * 傳播圈：中心是主角，一圈是一個階段（由內往外＝時間往後），扇區是通路，點是一篇。
 * 取代畫面稿裡的汽車道路——它畫的是這份企劃本身，不是裝飾。
 */
function ReachFan({ phases, lanes, items, current, en, names }: {
  phases: StagePhase[]; lanes: string[]; items: CampaignPlanItem[]; current: CampaignPhaseId | null; en: boolean; names?: PhaseNames;
}) {
  const VW = 360, VH = 196, CX = 180, CY = 178;
  const n = Math.max(1, phases.length || 5);
  const R0 = 42, R1 = 160;
  const r = (i: number) => (n === 1 ? (R0 + R1) / 2 : R0 + (i * (R1 - R0)) / (n - 1));
  const m = Math.max(1, lanes.length);
  const ang = (k: number) => 180 - ((k + 0.5) * 180) / m;
  const pt = (radius: number, deg: number) => {
    const t = (deg * Math.PI) / 180;
    return [CX + radius * Math.cos(t), CY - radius * Math.sin(t)] as const;
  };
  const arc = (radius: number) => `M ${CX - radius} ${CY} A ${radius} ${radius} 0 0 1 ${CX + radius} ${CY}`;
  const live = items.filter((i) => i.enabled);
  const rings = phases.length ? phases.map((p) => p.id) : (["teaser", "launch", "sustain", "lastcall", "encore"] as CampaignPhaseId[]);

  return (
    <div className="relative w-full max-w-[320px] mx-auto" style={{ aspectRatio: `${VW} / ${VH}` }} aria-hidden>
      <svg viewBox={`0 0 ${VW} ${VH}`} className="absolute inset-0 w-full h-full">
        {rings.map((id, i) => {
          const on = current === id;
          return (
            <g key={id}>
              <path d={arc(r(i))} fill="none" stroke="currentColor" strokeWidth={on ? 2.5 : 1.2}
                className={on ? "text-foreground" : current ? "text-default-200" : "text-default-300"} />
              <text x={CX - r(i)} y={CY + 14} textAnchor="middle" fontSize={10}
                className={on ? "fill-foreground font-bold" : "fill-default-400"}>
                {phaseLabel(names, id, en)}
              </text>
            </g>
          );
        })}
        {lanes.slice(0, -1).map((_, k) => {
          const [x, y] = pt(R1 + 10, 180 - ((k + 1) * 180) / m);
          return <line key={k} x1={CX} y1={CY} x2={x} y2={y} stroke="currentColor" strokeDasharray="3 5" className="text-default-300" />;
        })}
        {phases.length > 0 && live.map((it) => {
          const pi = phases.findIndex((p) => p.id === it.phase);
          const li = lanes.indexOf(it.platform);
          if (pi < 0 || li < 0) return null;
          const cell = live.filter((x) => x.phase === it.phase && x.platform === it.platform);
          const k = cell.findIndex((x) => x.id === it.id);
          const spread = Math.min(10, 150 / m / Math.max(1, cell.length));
          const [x, y] = pt(r(pi), ang(li) + (k - (cell.length - 1) / 2) * spread);
          const dim = !!current && current !== it.phase;
          return (
            <circle key={it.id} cx={x} cy={y} r={dim ? 3.2 : 5} strokeWidth={2.5} stroke="currentColor" opacity={dim ? 0.35 : 1}
              className={it.outputId ? "text-success fill-success" : "text-foreground fill-content1"} />
          );
        })}
        <circle cx={CX} cy={CY} r={11} className="fill-foreground" />
      </svg>
      {lanes.map((c, k) => {
        const [x, y] = pt(R1 + 24, ang(k));
        return (
          <span key={c} className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-content1 shadow-sm grid place-items-center text-[11px]"
            style={{ left: `${(x / VW) * 100}%`, top: `${(y / VH) * 100}%` }}>
            <FontAwesomeIcon icon={CHANNEL_META[c]?.icon ?? faPenNib} />
          </span>
        );
      })}
    </div>
  );
}

/**
 * 標題旁的鎖頭：定稿／解鎖整份企劃（CJ「定稿一次鎖整份」）。跟定位／文字／視覺用
 * 同一顆 LockToggle——策略層的鎖只有這一種長相。
 */
export function CampaignLockToggle({ eventId, en }: { eventId: number; en: boolean }) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const utils = (trpc as any).useUtils();
  const q = (trpc as any).campaign.get.useQuery({ eventId }, { refetchOnWindowFocus: false });
  const [err, setErr] = React.useState("");
  const mut = (trpc as any).campaign.setLock.useMutation({
    onSuccess: () => { setErr(""); utils?.campaign?.get?.invalidate?.({ eventId }); },
    onError: (e: any) => setErr(e?.message ?? ""),
  });
  const plan = q.data?.plan;
  if (!plan?.items?.length) return null;
  const locked = !!plan.lockedAt;
  return (
    <div className="flex flex-col items-center gap-1">
      <LockToggle
        locked={locked}
        busy={mut.isPending}
        onToggle={() => mut.mutate({ eventId, locked: !locked })}
        lockedLabel={L("已定稿", "Locked")}
        unlockedLabel={L("未定稿", "Draft")}
        title={locked
          ? L(`企劃定稿於 ${new Date(plan.lockedAt).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" })} · 點一下解鎖`,
              `Locked ${new Date(plan.lockedAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })} · click to unlock`)
          : L("定稿整份企劃：設定與每一篇都鎖住，內容層開始寫", "Lock the whole plan so the content team can start writing")}
      />
      {err && <span className="text-tiny text-danger max-w-[200px] text-center">{err.slice(0, 80)}</span>}
    </div>
  );
}
