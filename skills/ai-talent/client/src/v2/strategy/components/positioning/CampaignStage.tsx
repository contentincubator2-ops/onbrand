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
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Modal, ModalContent, ModalHeader, ModalBody, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap, faPenNib, faSliders, faLockOpen, faLock, faArrowRight, faBookOpen, faExpand, faCompress, faBullseye } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { CHANNEL_META, channelLabel } from "../../../content/lib/channelMeta";
import { phaseOf, type CampaignPhaseId, type CampaignPlan, type CampaignPlanItem } from "../../lib/campaignSchema";
import { stagePhases, stageLanes, countdown, stageNotes, phaseShort, type StagePhase } from "../../lib/campaignStage";
import { LockToggle } from "./LockToggle";
import CampaignMap from "./CampaignMap";
import CampaignSetupForm from "./CampaignSetupForm";
import CampaignChatCard from "./CampaignChatCard";
import CampaignBasisPanel from "./CampaignBasisPanel";
import KolBriefForm from "./KolBriefForm";
import ChannelBriefForm, { type ChannelBriefSpec } from "./ChannelBriefForm";
import type { BasisPatch, BasisValue } from "../../lib/campaignBasis";
import { dockDirector } from "../../lib/directorDock";
import CampaignHandoff from "./CampaignHandoff";
import CampaignKpiPanel from "./CampaignKpiPanel";
import { money, metricLine } from "../../lib/campaignKpi";

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

  const [plan, setPlan] = React.useState<CampaignPlan | null>(null);
  const [current, setCurrent] = React.useState<CampaignPhaseId | null>(null);
  const [full, setFull] = React.useState(false);
  const [kpiOpen, setKpiOpen] = React.useState(false);
  /**
   * 右邊看什麼：企劃地圖或策略依據（2026-09-30 CJ「策略依據…可以替代右邊的行事曆，讓用戶
   * 還是可以透過跟總監的互動，進行修改和討論…位置移到最上方的企劃草稿」）。
   */
  const [view, setView] = React.useState<"map" | "basis">("map");
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
    if (!q.data || dirtyRef.current) return;
    setPlan(q.data.plan ?? null);
  }, [q.data]);
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

  const savePlanMut = (trpc as any).campaign.savePlan.useMutation({
    onSuccess: () => { dirtyRef.current = false; setSaveState("saved"); utils?.campaign?.get?.invalidate?.({ eventId }); },
    onError: (e: any) => { setSaveState("error"); setSaveErr(e?.message ?? ""); },
  });

  /** 改了就存（停手 0.8 秒後）。標題旁的鎖頭隨時可能被按，不能留一份沒存的改動。 */
  const patchItem = (id: string, next: Partial<CampaignPlanItem>) => {
    const p = planRef.current;
    if (!p) return;
    const updated = { ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...next } : i)) };
    planRef.current = updated;
    setPlan(updated);
    dirtyRef.current = true;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const { lockedAt: _l, ...body } = planRef.current as any;
      savePlanMut.mutate({ eventId, plan: body });
    }, 800);
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
    setSaveState("saving");
    const { lockedAt: _l, ...body } = next as any;
    savePlanMut.mutate({ eventId, plan: body });
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
  const settings = data.settings ?? { channels: [] };
  const items: CampaignPlanItem[] = plan?.items ?? [];
  const locked = !!plan?.lockedAt;
  const phases = stagePhases(items);
  const lanes = stageLanes(items, settings.channels ?? []);
  const live = items.filter((i) => i.enabled);
  const done = live.filter((i) => !!i.outputId).length;
  const cur = current && phases.some((p) => p.id === current) ? current : null;
  const curPhase = cur ? phases.find((p) => p.id === cur)! : null;
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
            <button type="button" onClick={() => { setCurrent(null); setView("map"); }} aria-pressed={!cur && view === "map"}
              className={`flex items-center gap-1.5 text-tiny font-semibold rounded-lg border px-2.5 py-1 mr-1 transition ${!cur && view === "map" ? "bg-foreground text-background border-foreground" : "border-default-300 text-default-600 hover:border-foreground"}`}>
              <FontAwesomeIcon icon={faMap} />{L("總覽", "Overview")}
            </button>
            {phases.map((p) => {
              const on = cur === p.id && view === "map";
              return (
                <button key={p.id} type="button" onClick={() => { setCurrent(p.id); setView("map"); }} aria-pressed={on}
                  className={`text-tiny font-semibold px-2 py-1 border-b-2 transition ${on ? "text-foreground border-foreground" : "text-default-400 border-transparent hover:text-default-700"}`}>
                  {phaseShort(p.id, en)}
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
            {plan && (
              <button type="button" onClick={() => setView((v) => (v === "basis" ? "map" : "basis"))} aria-pressed={view === "basis"}
                title={L("右邊換成策略依據（活動定位 11 段），左邊照常跟總監談", "Show the strategy basis on the right")}
                className={`flex items-center gap-1.5 text-tiny font-semibold rounded-lg border px-2 py-0.5 transition ${view === "basis" ? "bg-foreground text-background border-foreground" : "border-default-300 text-default-600 hover:border-foreground"}`}>
                <FontAwesomeIcon icon={faBookOpen} className="text-[10px]" />{L("策略依據", "Basis")}
              </button>
            )}
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
                    ? L(`篇　·　${phaseShort(curPhase.id, false)}期 ${md(curPhase.from)}${curPhase.to !== curPhase.from ? ` – ${md(curPhase.to)}` : ""}`,
                        `posts · ${phaseShort(curPhase.id, true)}`)
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
                  <p className="text-xl font-bold leading-snug text-balance">{plan.smp}</p>
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
                  <p className="text-[11px] tracking-widest text-default-500">{L("還沒有企劃", "NO PLAN YET")}</p>
                  <p className="text-large font-bold leading-snug">{L("在右邊寫一段話，排出這檔活動的宣傳企劃。", "Describe the campaign on the right to build its plan.")}</p>
                </>
              )}
            </div>

            <div className="shrink-0"><ReachFan phases={phases} lanes={lanes} items={items} current={cur} en={en} /></div>
            </>)}

            {plan && (
              <CampaignChatCard eventId={eventId} brandId={brandId} plan={plan} phase={cur} notes={notes} locked={locked} en={en} onApply={applyPlan} grow
                basis={basisLocal} onApplyBasis={(p) => applyBasis(p, true)} view={view}
                expanded={chatExpanded} onToggleExpand={() => setChatExpanded((v) => !v)} />
            )}

            </div>
          </section>

          {/* ── 右：策略地圖（撐滿這一欄的高度） ───────────────────── */}
          <section className="min-w-0 min-h-0 relative bg-default-100 overflow-hidden">
            {plan && view === "basis" ? (
              <CampaignBasisPanel raw={data.basis?.raw ?? {}} editable={basisLocal} recent={basisRecent} locked={locked} en={en}
                onSave={(p) => applyBasis(p)} onOpenFull={goStrategyBasis} />
            ) : plan ? (
              <CampaignMap
                items={items} phases={phases} lanes={lanes} phaseMessages={plan.phaseMessages ?? {}}
                current={cur} onPick={setCurrent} locked={locked} en={en} onPatchItem={patchItem}
                fill
                phaseKpi={plan.kpi?.phases ?? {}}
                thumbs={thumbsQ.data ?? {}}
              />
            ) : (
              <div className="relative bg-default-100 p-4 sm:p-6 min-h-[420px] h-full overflow-y-auto">
                <div className="relative bg-content1 rounded-2xl shadow-small p-5 max-w-[620px]">
                  <CampaignSetupForm eventId={eventId} data={data} brandProducts={brandProducts} hasPlan={false} en={en} />
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

    </div>
  );
}

/**
 * 傳播圈：中心是主角，一圈是一個階段（由內往外＝時間往後），扇區是通路，點是一篇。
 * 取代畫面稿裡的汽車道路——它畫的是這份企劃本身，不是裝飾。
 */
function ReachFan({ phases, lanes, items, current, en }: {
  phases: StagePhase[]; lanes: string[]; items: CampaignPlanItem[]; current: CampaignPhaseId | null; en: boolean;
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
                {phaseShort(id, en)}
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
