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
 * 底圖（2026-09-30 CJ「左邊和右邊的底圖，我們有固定模板，但用戶也可以自己選擇」）：
 * 模板在 lib/campaignBackdrops.ts。有圖的模板，左邊是主視覺、右邊是地圖底下的故事圖；
 * 「傳播圈」沒有圖，左邊畫企劃本身（ReachFan）。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Modal, ModalContent, ModalHeader, ModalBody, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap, faPenNib, faSliders, faLockOpen, faLock, faArrowRight, faBookOpen, faImage, faCheck, faExpand, faCompress, faBullseye } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { CHANNEL_META, channelLabel } from "../../../content/lib/channelMeta";
import { phaseOf, type CampaignPhaseId, type CampaignPlan, type CampaignPlanItem } from "../../lib/campaignSchema";
import { stagePhases, stageLanes, countdown, stageNotes, phaseShort, type StagePhase } from "../../lib/campaignStage";
import { LockToggle } from "./LockToggle";
import CampaignMap from "./CampaignMap";
import CampaignSetupForm from "./CampaignSetupForm";
import CampaignChatCard from "./CampaignChatCard";
import CampaignHandoff from "./CampaignHandoff";
import CampaignKpiPanel from "./CampaignKpiPanel";
import { money, metricLine } from "../../lib/campaignKpi";
import {
  availableBackdrops, backdropForIndustry, backdropUrl, resolveBackdrop, BACKDROP_THEMES, DEFAULT_BACKDROP,
} from "../../lib/campaignBackdrops";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const md = (s: string) => s.slice(5).replace("-", "/");
/** 前台的七個通路（planGate 隱藏的不列）。 */
const DOCK_CHANNELS = ["facebook", "instagram", "threads", "line", "tiktok", "email", "website"];

export default function CampaignStage({ eventId, brandId }: { eventId: number; brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const utils = (trpc as any).useUtils();

  const q = (trpc as any).campaign.get.useQuery({ eventId }, { refetchOnWindowFocus: false });
  const productsQ = (trpc as any).product?.list?.useQuery(
    { brandId: brandId ?? undefined }, { enabled: !!brandId, refetchOnWindowFocus: false },
  ) ?? { data: [] };

  const [plan, setPlan] = React.useState<CampaignPlan | null>(null);
  const [current, setCurrent] = React.useState<CampaignPhaseId | null>(null);
  const [full, setFull] = React.useState(false);
  const [kpiOpen, setKpiOpen] = React.useState(false);
  /** 對話卡展開＝佔滿左欄（CJ 2026-09-30）；左欄其他東西先收起來。 */
  const [chatExpanded, setChatExpanded] = React.useState(false);
  const [setupOpen, setSetupOpen] = React.useState(false);
  const [partner, setPartner] = React.useState<"kol" | "cobrand" | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
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

  const backdropMut = (trpc as any).campaign.setBackdrop.useMutation({
    onSuccess: () => utils?.campaign?.get?.invalidate?.({ eventId }),
  });
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

  /** 對話提案按了「套用」：換掉企劃、馬上存（不等停手）。 */
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
  const theme = resolveBackdrop(data.backdrop, data.industry);
  const pictured = theme !== DEFAULT_BACKDROP;
  const autoTheme = backdropForIndustry(data.industry);
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
            <button type="button" onClick={() => setCurrent(null)} aria-pressed={!cur}
              className={`flex items-center gap-1.5 text-tiny font-semibold rounded-lg border px-2.5 py-1 mr-1 transition ${!cur ? "bg-foreground text-background border-foreground" : "border-default-300 text-default-600 hover:border-foreground"}`}>
              <FontAwesomeIcon icon={faMap} />{L("總覽", "Overview")}
            </button>
            {phases.map((p) => {
              const on = cur === p.id;
              return (
                <button key={p.id} type="button" onClick={() => setCurrent(p.id)} aria-pressed={on}
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
            <span className="w-px h-5 bg-divider" />
            <div className="flex gap-1.5" aria-label={L("通路", "Channels")}>
              {DOCK_CHANNELS.map((c) => {
                const on = (settings.channels ?? []).includes(c) || live.some((i) => i.platform === c);
                return (
                  <button key={c} type="button" disabled={locked || !plan}
                    title={on ? channelLabel(c, en) : L(`加入 ${channelLabel(c, en)}：到設定裡勾選後重排，或直接跟內容企劃說`, `Add ${channelLabel(c, en)} in settings, or ask the planner`)}
                    onClick={() => setSetupOpen(true)}
                    className={`w-7 h-7 rounded-lg grid place-items-center text-tiny transition disabled:cursor-default ${on ? "bg-foreground text-background" : "bg-default-100 text-default-400 hover:text-default-700"}`}>
                    <FontAwesomeIcon icon={CHANNEL_META[c]?.icon ?? faPenNib} />
                  </button>
                );
              })}
            </div>
            <span className="w-px h-5 bg-divider" />
            {plan?.kol && <Button size="sm" variant="light" radius="md" onPress={() => setPartner("kol")}>{L("網紅合作", "Influencers")}</Button>}
            {plan?.cobrand && <Button size="sm" variant="light" radius="md" onPress={() => setPartner("cobrand")}>{L("異業合作", "Co-branding")}</Button>}
            <Button size="sm" variant="light" radius="md" isIconOnly aria-label={L("底圖", "Backdrop")} title={L("底圖", "Backdrop")}
              onPress={() => setPickerOpen(true)}>
              <FontAwesomeIcon icon={faImage} />
            </Button>
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
            {pictured && (
              <>
                <img src={backdropUrl(theme, "left")} alt="" aria-hidden draggable={false}
                  className="absolute inset-0 w-full h-full object-cover object-bottom pointer-events-none select-none dark:opacity-30" />
                <div className="absolute inset-x-0 top-0 h-3/5 bg-gradient-to-b from-default-50 via-default-50/85 to-transparent pointer-events-none" />
              </>
            )}
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

            {pictured
              ? <div className={`${plan ? "min-h-[120px]" : "flex-1 min-h-[200px]"} shrink-0`} aria-hidden />
              : <div className="shrink-0"><ReachFan phases={phases} lanes={lanes} items={items} current={cur} en={en} /></div>}
            </>)}

            {plan && (
              <CampaignChatCard eventId={eventId} plan={plan} phase={cur} notes={notes} locked={locked} en={en} onApply={applyPlan} grow
                expanded={chatExpanded} onToggleExpand={() => setChatExpanded((v) => !v)} />
            )}

            {!(chatExpanded && plan) && (
              <button type="button" onClick={goStrategyBasis}
                className="self-start shrink-0 text-tiny text-default-500 hover:text-foreground flex items-center gap-1.5">
                <FontAwesomeIcon icon={faBookOpen} />{L("策略依據：活動定位（11 段）", "Strategy basis: campaign positioning")}
              </button>
            )}
            </div>
          </section>

          {/* ── 右：策略地圖（撐滿這一欄的高度） ───────────────────── */}
          <section className="min-w-0 min-h-0 relative bg-default-100 overflow-hidden">
            {plan ? (
              <CampaignMap
                items={items} phases={phases} lanes={lanes} phaseMessages={plan.phaseMessages ?? {}}
                current={cur} onPick={setCurrent} locked={locked} en={en} onPatchItem={patchItem}
                backdrop={pictured ? <RightBackdrop id={theme} /> : undefined} fill
                phaseKpi={plan.kpi?.phases ?? {}}
              />
            ) : (
              <div className="relative bg-default-100 p-4 sm:p-6 min-h-[420px] h-full overflow-y-auto">
                {pictured && <div className="absolute inset-0 pointer-events-none"><RightBackdrop id={theme} /></div>}
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

      <Modal isOpen={setupOpen} onClose={() => setSetupOpen(false)} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="text-medium">{L("調整活動設定", "Campaign settings")}</ModalHeader>
          <ModalBody className="pb-6">
            <CampaignSetupForm eventId={eventId} data={data} brandProducts={brandProducts} hasPlan en={en}
              onPlanned={() => { setSetupOpen(false); setCurrent(null); dirtyRef.current = false; }} />
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

      <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-medium">{L("選擇底圖", "Choose a backdrop")}</span>
            <span className="text-tiny font-normal text-default-500">{L("左邊是主視覺，右邊是策略地圖底下的故事。只換畫面，不影響企劃。", "Left is the hero picture, right sits under the strategy map. Visual only — the plan doesn't change.")}</span>
          </ModalHeader>
          <ModalBody className="pb-6">
            <BackdropPicker
              chosen={data.backdrop ?? null} current={theme} autoTheme={autoTheme} en={en}
              busy={backdropMut.isPending}
              onPick={(id) => backdropMut.mutate({ eventId, backdrop: id }, { onSuccess: () => setPickerOpen(false) })}
            />
            {availableBackdrops().length === 1 && (
              <p className="text-tiny text-default-500">{L("其他模板的圖還在準備中。", "More templates are on the way.")}</p>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!partner} onClose={() => setPartner(null)} size="lg" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="text-medium">{partner === "kol" ? L("網紅合作", "Influencer collab") : L("異業合作", "Co-branding")}</ModalHeader>
          <ModalBody className="pb-6 gap-3">
            {partner && (plan as any)?.[partner] && (
              <>
                <p className="text-small text-default-600">{(plan as any)[partner].summary}</p>
                <ul className="pl-5 list-disc flex flex-col gap-1.5">
                  {((plan as any)[partner].steps ?? []).map((st: any) => (
                    <li key={st.id} className="text-small leading-relaxed">
                      {st.text}{st.taskLabel && <span className="text-tiny text-default-500">（{st.taskLabel}）</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}

function RightBackdrop({ id }: { id: string }) {
  return (
    <img src={backdropUrl(id, "right")} alt="" aria-hidden draggable={false}
      className="w-full h-full object-cover pointer-events-none select-none opacity-60 dark:opacity-25" />
  );
}

/** 底圖模板清單：第一格是「依產業自動」，其餘每一格是一組左右兩張。 */
function BackdropPicker({ chosen, current, autoTheme, en, busy, onPick }: {
  chosen: string | null; current: string; autoTheme: string; en: boolean; busy: boolean;
  onPick: (id: string | null) => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const nameOf = (id: string) => { const t = BACKDROP_THEMES.find((x) => x.id === id); return t ? (en ? t.en : t.zh) : id; };
  const cards: Array<{ key: string; id: string | null; title: string; story: string; preview: string }> = [
    { key: "auto", id: null, title: L("依產業自動", "Match my industry"), story: L(`目前會用「${nameOf(autoTheme)}」`, `Currently: ${nameOf(autoTheme)}`), preview: autoTheme },
    ...availableBackdrops().map((t) => ({ key: t.id, id: t.id, title: en ? t.en : t.zh, story: en ? t.storyEn : t.storyZh, preview: t.id })),
  ];
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
      {cards.map((c) => {
        const on = c.id === null ? chosen === null : chosen === c.id;
        return (
          <button key={c.key} type="button" disabled={busy} onClick={() => onPick(c.id)} aria-pressed={on}
            className={`text-left rounded-2xl border p-2 flex flex-col gap-2 transition ${on ? "border-foreground ring-1 ring-foreground" : "border-divider hover:border-default-400"}`}>
            <div className="relative aspect-[3/1] rounded-xl overflow-hidden bg-default-100">
              {c.preview === DEFAULT_BACKDROP ? (
                <div className="absolute inset-0 grid place-items-center text-default-400">
                  <svg viewBox="0 0 120 64" className="w-28" aria-hidden>
                    {[18, 30, 42, 54].map((r) => (
                      <path key={r} d={`M ${60 - r} 60 A ${r} ${r} 0 0 1 ${60 + r} 60`} fill="none" stroke="currentColor" strokeWidth={1.4} />
                    ))}
                    <circle cx={60} cy={60} r={4} fill="currentColor" />
                  </svg>
                </div>
              ) : (
                <>
                  {/* 右邊的故事圖在原圖的中間三分之一，裁成 3:1 剛好是那一條。 */}
                  <img src={backdropUrl(c.preview, "right")} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <img src={backdropUrl(c.preview, "left")} alt=""
                    className="absolute left-1.5 bottom-1.5 w-9 h-12 object-cover object-bottom rounded-md border border-divider bg-content1" />
                </>
              )}
            </div>
            <div className="px-1 pb-1">
              <p className="text-small font-semibold flex items-center gap-1.5">
                {c.title}{on && <FontAwesomeIcon icon={faCheck} className="text-tiny" />}
                {c.id !== null && current === c.id && !on && <span className="text-[11px] font-normal text-default-500">{L("（目前）", "(current)")}</span>}
              </p>
              <p className="text-tiny text-default-500 leading-snug">{c.story}</p>
            </div>
          </button>
        );
      })}
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
