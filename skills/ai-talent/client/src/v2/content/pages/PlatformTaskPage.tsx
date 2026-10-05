/**
 * PlatformTaskPage — platform-first navigation (2026-05-26).
 *
 * Route: /tasks/:platform  (platform = fb | ig | threads | line | tt | email | web)
 *
 * Users pick the *platform* in the sidebar, then filter by format / source
 * inside this page. Tier is internal engine config and never shown.
 */
import { IllustratedEmpty } from "../../platform/components/EmptyIllustration";
import { TaskIllustration } from "../../platform/components/TaskIllustration";
import { TASK_MODAL_CLASSNAMES } from "../../platform/components/taskModalStyle";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { Navigate, useParams, useOutletContext, useNavigate, useSearchParams } from "react-router-dom";
import CalendarTabs from "../components/CalendarTabs";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { agentLabel, agentShortName } from "../../platform/lib/agentName";
import { taskQuestion, taskPlaceholder, taskInputText, localizeSource } from "../../platform/lib/taskEn";
import { showToastGlobal } from "../../platform/components/Toast";
import { TaskCardShell, TaskCardAvatar } from "../../platform/components/TaskCardShell";
import { campaignPrefill } from "../lib/campaignIntakePrefill";
import { friendlyError } from "../../platform/lib/friendlyError";
import { cancelToastText, newRunKey } from "../lib/runCancel";
import { toastWithUpgrade } from "../../platform/lib/upgradeToast";
import { matchTaskWithSynonyms } from "../lib/taskSearchSynonyms";
import {
  resolveSource, sourceAccent, sourceWhy,
  sourcePillText, sourceTooltip,
  FRONT_CARD_KINDS, frontCardKind, frontCardKindLabel, isFrontVisibleCard, type FrontCardKind,
} from "../../platform/lib/sourceVocabulary";
import {
  FB_FORMAT_TABS as FORMAT_TABS,
  FB_TASK_FORMAT_MAP as TASK_FORMAT_MAP,
  type FBActiveFormat as ActiveFormat,
  IG_FORMAT_TABS, IG_TASK_FORMAT_MAP, type IGActiveFormat,
  LI_FORMAT_TABS, LI_TASK_FORMAT_MAP, type LIActiveFormat,
  YT_FORMAT_TABS, YT_TASK_FORMAT_MAP, type YTActiveFormat,
  TT_FORMAT_TABS, TT_TASK_FORMAT_MAP, type TTActiveFormat,
  EM_FORMAT_TABS, EM_TASK_FORMAT_MAP, type EMActiveFormat,
  PR_FORMAT_TABS, PR_TASK_FORMAT_MAP, type PRActiveFormat,
  WEB_FORMAT_TABS, WEB_TASK_FORMAT_MAP, type WEBActiveFormat,
  adFormatText,
} from "../lib/taskFormats";
import type { ShellOutletCtx } from "../../platform/lib/shellContext";
import { buildContextChips, resolveDerive } from "../lib/taskContextResolver";
import { getStrategyPublicGenerationState } from "../lib/strategyContentEnvelope";
import { checkViralSource, platformLabelForTask, taskNeedsViralSource } from "../lib/viralSourceGuard";
import { intakeExtraFields, missingRequiredInputs, type IntakeField } from "../lib/taskIntake";
import TaskCardComposer, { type ComposerChannel } from "../../strategy/components/taskCard/TaskCardComposer";
import ListingBatchModal from "../components/batch/ListingBatchModal";
import { AddEntityModal } from "../../strategy/components/AddEntityModal";
import RewriteDraftModal from "../components/quickTask/RewriteDraftModal";
import OwnCardLabelsEditor from "../components/quickTask/OwnCardLabelsEditor";
import {
  Avatar, Button, Card, CardBody, Chip, Input, Modal, ModalBody,
  ModalContent, ModalHeader, Textarea, Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { HelpTip } from "../../platform/components/HelpTip";
import { faBolt, faMagnifyingGlass, faWandMagicSparkles, faTriangleExclamation, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import RunningAgentCarousel from "../../platform/components/RunningAgentCarousel";
import ImageCardTile from "../components/imageCard/ImageCardTile";
import type { ImageCardInfo } from "../../platform/lib/imageCardHandoff";
import ImageSizePicker from "../components/imageCard/ImageSizePicker";
import { imageCardHref, imageChannelOf } from "../../platform/lib/imageCardHandoff";
import CardDetailDrawer, { isRecentCard } from "../components/quickTask/CardDetailDrawer";
import ChannelPicker from "../../platform/components/plan/ChannelPicker";
import TaskPicker from "../../platform/components/plan/TaskPicker";
import { LibraryIcon, AddIcon, EditIcon, TaskCardsIcon, FavoriteIcon, Icon, type IconName } from "../../platform/components/icons";
import { contextChipIcon } from "../lib/contextChipIcons";
import { departAgentHandoff } from "../lib/agentHandoff";
import { resolveTrayIds, toggleTrayId, taskPlatformOf } from "../lib/taskTrayClient";
import { useCustomChannels, isCustomChannelId } from "../lib/customChannels";
import { recordTaskUsed, getLastUsedDays, routeToPlatform, isComposerChannel, customPlatformMeta, PLATFORM_META, dicebear, HOLD_FOR_IMAGES, synthesizeStages, FBTaskCard, trimmedExtras, chipFieldPath, getNested, setNested, CHIP_SIBLING_CANDIDATES, TaskEmbed } from "./platformTask/taskModel";
import { PlatformPageErrorBoundary } from "./platformTask/PlatformPageErrorBoundary";
export type { TaskEmbed } from "./platformTask/taskModel";

// ── Shared utilities ─────────────────────────────────────────────────────────
/**
 * 2026-09-06：原本這裡是 8 組彩色漸層（琥珀／青／紫／綠／紅／橘／藍／洋紅），
 * 以 idx % 8 依「卡片在清單裡的位置」輪換 —— 同一張卡換個位置就換個顏色，
 * 完全不帶資訊。那是色彩當裝飾，違反 BrandsPage.tsx:1407 從 2026-05-10
 * 就寫著的紀律：「4A 代理商專業感，不要彩色」B&W Notion discipline。
 *
 * 現在卡片頂端是單一的中性底色，資訊由頭像、標題與來源 pill 承擔。
 */
// CARD_SURFACE 已搬進 TaskCardShell —— 任務卡的幾何只有一份。

// 2026-09-29（CJ「頁面上還有在讀秒…也不需要單篇 套組和企劃的備註了」）：
// tier 只是內部引擎設定（路由／額度／timeout），畫面上不再出現——
// 沒有讀秒、沒有 單篇／套組／企劃 標籤、也沒有依 tier 篩選的分頁。

// ── Format category config (FB only) ────────────────────────────
// 2026-08-23: 搬到 v2/lib/fbTaskFormats.ts —— 這份對照表爫過一次（90s 退役後
// 11 個 key 全指向不存在的任務，16 張 99s 卡一個都沒補），抽出去才能被
// fbTaskFormats.test.ts import 並鎖住。

// ── Format category config (IG / LI / YT / TT / Email / PR) ───────────
// 2026-08-23: 與 FB 一起搬到 v2/lib/taskFormats.ts —— 這 7 份對照表共 162 條
// 手抄，埋在頁面裡沒有任何東西能驗證它們跟真實任務目錄對不對得上，
// FB 與 IG 實際都漂過。現在由 server/_core/taskFormatCoverage.test.ts 鎖住。

// ── Main page ────────────────────────────────────────────────────────────────
function PlatformTaskPageInner({ embed }: { embed?: TaskEmbed } = {}) {
  const { platform: urlRoute = "fb" } = useParams<{ platform: string }>();
  const routeParam = embed?.route ?? urlRoute;
  const platform = routeToPlatform(routeParam) ?? "facebook";

  const { t, lang } = useLang();
  const ctx = useOutletContext<ShellOutletCtx>();
  // 2026-10-04：自訂通路（c<brandId>-<slug>）的標題用戶自己取，要從通路清單查。
  const customChannelsHook = useCustomChannels((ctx?.brandId as number | null) ?? null);
  const customChannel = customChannelsHook.channels.find((c) => c.id === platform) ?? null;
  const meta = PLATFORM_META[platform]
    ?? (isCustomChannelId(platform) ? customPlatformMeta(customChannel?.name ?? "…") : PLATFORM_META.facebook);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 2026-07-28 (CJ 策略工作台「內容角度→一鍵開任務」): the workbench's
  // dig chips deep-link here with ?topic=<角度>. Capture once, strip the
  // param, show a banner; the next task the user opens gets the topic
  // prefilled as its primary answer (strategy → copy in one line).
  const [strategyTopic, setStrategyTopic] = useState<string | null>(embed?.topic?.trim() ? embed.topic.trim().slice(0, 200) : null);
  // 換頻道時把客製 pill 歸位 —— 「生活實踐」留在官網頁會濾成空白。
  useEffect(() => { setActivePackFormat("all"); }, [platform]);
  useEffect(() => {
    if (embed) return;
    const t = searchParams.get("topic");
    if (t && t.trim()) {
      setStrategyTopic(t.trim().slice(0, 200));
      const next = new URLSearchParams(searchParams);
      next.delete("topic");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brandId = (ctx?.brandId as number | null) ?? null;
  const imageChannel = imageChannelOf(platform);
  const imageCardsQ = trpc.imageCard.list.useQuery(
    { channel: (imageChannel ?? "facebook") as any },
    { enabled: !!imageChannel, staleTime: 5 * 60_000 },
  );
  const imageCards = (imageChannel ? imageCardsQ.data?.cards ?? [] : []) as ImageCardInfo[];
  // 2026-09-30 CJ：圖片卡不一次全列——每通路預設兩張，其餘用戶用「新增尺寸」自己加。
  const imageTrayQ = trpc.imageCard.tray.useQuery(
    { brandId: brandId ?? 0, channel: (imageChannel ?? "facebook") as any },
    { enabled: !!imageChannel && !!brandId, refetchOnWindowFocus: false },
  );
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const setImageTrayMut = trpc.imageCard.setTray.useMutation({
    onSuccess: () => { setImagePickerOpen(false); imageTrayQ.refetch(); },
    onError: (e) => toastWithUpgrade(friendlyError(e, lang === "en" ? "Couldn't save. Please try again." : "儲存沒成功，再試一次。"), lang === "en"),
  });
  /** 實際擺出來的圖片卡。還沒載入托盤（或沒有品牌）時先只擺預設的兩張，不閃出全部。 */
  const shownImageCards = useMemo(() => {
    const ids = imageTrayQ.data?.ids;
    if (!ids) return imageCards.filter((c) => c.pinned);
    const byId = new Map(imageCards.map((c) => [c.id, c] as const));
    return ids.map((id) => byId.get(id)).filter((c): c is ImageCardInfo => !!c);
  }, [imageCards, imageTrayQ.data]);
  const brandName = useMemo(() => {
    const list = (ctx?.brands as any[]) ?? [];
    return list.find((b) => b?.id === brandId)?.name ?? null;
  }, [ctx, brandId]);

  // Onboarding redirect when no brands
  const brandsLoaded = (ctx as any)?.brandsLoaded === true;
  const brandsList = (ctx?.brands as any[]) ?? [];
  const needsOnboardingRedirect = brandsLoaded && brandsList.length === 0;

  // Brand data
  const brandQuery = (trpc as any).brand?.get?.useQuery
    ? (trpc as any).brand.get.useQuery(
        { id: brandId ?? 0 },
        { enabled: !!brandId, refetchInterval: 30_000, refetchOnWindowFocus: false },
      )
    : { data: null };

  // 2026-05-26 fix: was hardcoded productId/eventId: null → always fetched
  // brand-only positioning even when a product/event scope was active.
  // Now passes the real scope ids so context chips show the correct entity.
  // 2026-06-16 (CJ「右上只選品牌，產品/活動在任務卡跳窗時選」): per-task
  // entity selection. Defaults to brand-only; the user picks a product or
  // event inside the launch modal. This replaces relying on the global
  // scope.productId/eventId so the right-top picker can eventually drop
  // those options. Initialized from global scope when a task opens (so
  // existing right-top selections still carry through during the
  // transition), then editable in-modal.
  const [modalEntity, setModalEntity] = useState<{ kind: "brand" | "product" | "event"; id: number | null }>(
    { kind: "brand", id: null },
  );
  // Effective per-task ids fed to context resolution + orchestra. Brand
  // scope → both null; product/event scope → the matching id.
  const taskProductId = modalEntity.kind === "product" ? modalEntity.id : null;
  const taskEventId   = modalEntity.kind === "event"   ? modalEntity.id : null;

  // Product / event lists for the in-modal picker, scoped to current brand.
  const modalProductsQuery = (trpc as any).product?.list?.useQuery
    ? (trpc as any).product.list.useQuery(
        { brandId: brandId ?? undefined },
        { enabled: !!brandId, refetchOnWindowFocus: false },
      )
    : { data: [] };
  const modalEventsQuery = (trpc as any).event?.list?.useQuery
    ? (trpc as any).event.list.useQuery(
        { brandId: brandId ?? undefined },
        { enabled: !!brandId, refetchOnWindowFocus: false },
      )
    : { data: [] };
  const modalProducts = (modalProductsQuery.data as any[]) ?? [];
  const modalEvents = (modalEventsQuery.data as any[]) ?? [];

  // 2026-06-16 (CJ「受眾不對／想改賣點 — 可下拉選也可改寫」): inline editing
  // of a context field straight from the task modal. editingChip holds the
  // chip source path being edited; editValue is the working text. Saves write
  // back to the SELECTED entity's RAW positioning (never the merged overlay,
  // which would pollute a product with brand data).
  const [editingChip, setEditingChip] = useState<{ source: string; label: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  // 2026-09-30 任務 modal 圖示化：目前點開的脈絡圖示（"__entity"＝產出對象），與選填欄位開關。
  const [ctxOpen, setCtxOpen] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  // 任務 modal 裡直接新增產品／活動（AddEntityModal 疊在上面）。
  const [addEntityTab, setAddEntityTab] = useState<"product" | "event" | null>(null);
  const savePositioningMut = (trpc as any).scope?.savePositioning?.useMutation?.();

  const scopeActiveQuery = (trpc as any).scope?.active?.useQuery(
    {
      brandId:   brandId ?? 0,
      productId: taskProductId,
      eventId:   taskEventId,
    },
    { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 },
  );

  const brandAssetsForCheck: Record<string, any> =
    ((scopeActiveQuery?.data as any)?.brand?.positioning?._assets ?? {}) as Record<string, any>;

  const textAssetsEmpty = useMemo(() => {
    const b: any = brandQuery?.data ?? {};
    const brandSetUp =
      (typeof b.tagline === "string" && b.tagline.trim()) ||
      (typeof b.positioningSummary === "string" && b.positioningSummary.trim()) ||
      b.positioningStatus === "completed";
    if (brandSetUp) return false;
    const v = (assetKey: string): boolean => {
      const a = brandAssetsForCheck[assetKey];
      if (!a) return true;
      if (typeof a.text === "string" && a.text.trim()) return false;
      if (Array.isArray(a.items) && a.items.some((x: any) => typeof x === "string" && x.trim())) return false;
      if (Array.isArray(a.pairs) && a.pairs.some((p: any) => p?.from?.trim() && p?.to?.trim())) return false;
      return true;
    };
    return v("voice") && v("voice_principles") && v("preferred_terms") && v("banned_words");
  }, [brandAssetsForCheck, brandQuery?.data]);

  // Tier tab state (used for non-FB/non-IG platforms)
  // 結構來源篩選。"all" = 不篩。與 tier 是兩條獨立的軸，可同時生效。
  const [activeSource, setActiveSource] = useState<FrontCardKind | "all">("all");
  /** 2026-09-29 CJ「每個平台要增加一個圖片的類別」；9/30 移到分類列最後。選它時下面
   *  改列這個通路的圖片任務卡（imageCard.list），不列文字任務。
   *  放在網址（?view=images）：從圖片卡按上一頁回來時停在圖片，換通路時自然歸零。 */
  const imageMode = searchParams.get("view") === "images";
  const setImageMode = (on: boolean) => {
    if (on === imageMode) return;
    const next = new URLSearchParams(searchParams);
    if (on) next.set("view", "images"); else next.delete("view");
    setSearchParams(next, { replace: true });
  };
  // Format tab state (used for FB)
  const [activeFormat, setActiveFormat] = useState<ActiveFormat>("all");
  // Format tab state (used for IG)
  const [activeIGFormat, setActiveIGFormat] = useState<IGActiveFormat>("all");
  // Format tab state (used for LI)
  const [activeLIFormat, setActiveLIFormat] = useState<LIActiveFormat>("all");
  // Format tab state (used for YT)
  const [activeYTFormat, setActiveYTFormat] = useState<YTActiveFormat>("all");
  // Format tab state (used for TikTok)
  const [activeTTFormat, setActiveTTFormat] = useState<TTActiveFormat>("all");
  // Format tab state (used for Email)
  const [activeEMFormat, setActiveEMFormat] = useState<EMActiveFormat>("all");
  // Format tab state (used for PR)
  const [activePRFormat, setActivePRFormat] = useState<PRActiveFormat>("all");
  const [activeWEBFormat, setActiveWEBFormat] = useState<WEBActiveFormat>("all");
  // 客製包的 pill。分類值由 pack 定義，所以是自由字串，不是 union。
  const [activePackFormat, setActivePackFormat] = useState<string>("all");

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  // 2026-09-08 卡片詳情（出處與說明）與「只看新卡」。通知點進來帶 ?new=1。
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [onlyNew, setOnlyNew] = useState<boolean>(() => searchParams.get("new") === "1");

  // Task modal state
  const [activeTask, setActiveTask] = useState<FBTaskCard | null>(null);
  // 自建卡在任務視窗裡改標題／欄位標題（只有 ownCardId 的卡才有入口）。
  const [editingLabels, setEditingLabels] = useState(false);
  const [primaryAnswer, setPrimaryAnswer] = useState("");
  // 2026-09-02: primary 以外的欄位。在這之前 intake 只渲染也只送出
  // primary_input 一格，225 張卡裡有 24 張宣告了額外欄位、其中 7 張還是必填 ——
  // 那些格子沒有任何 UI 可以填，模型只好自己編（例如「新品上市全套」從來不問
  // 活動什麼時候辦）。要問哪幾格由 lib/taskIntake 決定，server 用同一份判斷驗。
  const [extraAnswers, setExtraAnswers] = useState<Record<string, string>>({});

  // 2026-09-04 (CJ「加任務卡的符號，要在 facebook, instagram 等等頁面中，
  // 比較明顯的右上方」): 自建任務卡的入口。
  const [composerOpen, setComposerOpen] = useState(false);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [resumeCardId, setResumeCardId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 2026-08-23: intake validation error, rendered right under the question
  // box (errorMsg renders at the bottom of the modal, often below the fold).
  const [inputError, setInputError] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState<any | null>(null);
  const [imageAgentMeta, setImageAgentMeta] = useState<any | null>(null);
  const [orchestraStages, setOrchestraStages] = useState<any[] | null>(null);
  // 2026-09-30：品牌有啟用中的法規卡 → 執行進度多一格「合規檢查」（跟 server 的 regcheck 對齊）。
  const activeRegulationQ = (trpc as any).brandRegulation.activeCount.useQuery(
    { brandId: brandId ?? 0 }, { enabled: !!brandId, staleTime: 60_000, refetchOnWindowFocus: false },
  );
  const activeRegulationCount: number = activeRegulationQ.data?.count ?? 0;
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Countdown
  const [countdownStart, setCountdownStart] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(0);
  useEffect(() => {
    if (countdownStart == null) return;
    const id = window.setInterval(() => setTickMs(Date.now() - countdownStart), 100);
    return () => clearInterval(id);
  }, [countdownStart]);

  // Brand context for modal chips.
  // When product/event scope is active, overlay their positioning on top of
  // the brand's so context chips reflect the selected product/event, not
  // the parent brand. Use product/event name as the display name.
  //
  // 2026-05-27 v2 (CJ「根治勝選通 modal 仍出現 SoWork」): two-level fix:
  //
  // A) Real-content check: `Object.keys(pos).length > 0` is insufficient because
  //    the auto-trigger writes `positioning._interim = {...}` which makes the check
  //    true even though no real segment data exists yet. We now check for non-"_"
  //    keys with actual string/array content (mirrors BrandsPage hasAnyPositioningContent).
  //
  // B) Interim overlay: if a product/event has only interim data (no real segments),
  //    use the interim sub-object as the overlay source — NOT the whole positioning
  //    object which would just merge brand+_interim and still expose brand chips.
  //
  // C) Hard isolation: if product/event scope is active but NOTHING exists yet,
  //    use {} so chips render as "尚未填寫" — never fall back to brand positioning.
  const brandCtx = useMemo(() => {
    const data: any = scopeActiveQuery?.data;
    if (!data?.brand) return null;
    const basePositioning    = data.brand.positioning    ?? {};
    const productPositioning = (data.product?.positioning ?? {}) as Record<string, any>;
    const eventPositioning   = (data.event?.positioning   ?? {}) as Record<string, any>;
    const productScopeActive = !!taskProductId;
    const eventScopeActive   = !!taskEventId;

    /** Does a positioning object have real (non-internal) segment data? */
    const posHasReal = (pos: Record<string, any>): boolean =>
      Object.keys(pos).filter(k => !k.startsWith("_")).some(k => {
        const v = pos[k];
        if (!v || typeof v !== "object" || Array.isArray(v)) return false;
        return Object.values(v).some(fv =>
          (typeof fv === "string" && (fv as string).trim().length > 0) ||
          (Array.isArray(fv) && (fv as any[]).length > 0)
        );
      });

    const productHasReal    = posHasReal(productPositioning);
    const productInterim    = productPositioning._interim as Record<string, any> | undefined ?? {};
    const productHasInterim = Object.keys(productInterim).length > 0;
    const eventHasReal      = posHasReal(eventPositioning);
    const eventInterim      = eventPositioning._interim as Record<string, any> | undefined ?? {};
    const eventHasInterim   = Object.keys(eventInterim).length > 0;

    // Overlay priority:
    //   1. Product real segments → merge on base (full override)
    //   2. Product interim only  → merge interim sub-object on base
    //   3. Event real segments   → merge on base
    //   4. Event interim only    → merge interim sub-object on base
    //   5. product/event scope active but truly empty → {} (no brand fallback)
    //   6. Brand scope           → brand positioning as-is
    const overlayPositioning =
      productHasReal    ? { ...basePositioning, ...productPositioning }
      : productHasInterim ? { ...basePositioning, ...productInterim }
      : eventHasReal    ? { ...basePositioning, ...eventPositioning }
      : eventHasInterim ? { ...basePositioning, ...eventInterim }
      : (productScopeActive || eventScopeActive)
        ? {}
        : basePositioning;

    const displayName =
      data.product?.name ?? data.event?.name ?? data.brand?.name ?? null;
    return {
      brand:   { ...data.brand, name: displayName, positioning: overlayPositioning },
      product: data.product ?? null,
      event:   data.event   ?? null,
    };
  }, [scopeActiveQuery?.data, taskProductId, taskEventId]);

  // Auto-trigger interim positioning for product/event scope with no positioning.
  // Mirrors BrandsPage auto-trigger so users don't need to visit BrandsPage first.
  // Phase: fires once per (kind, entityId) and is reset on scope change.
  const _autoPosTaskRef = React.useRef<string | null>(null);
  const autoRunInterimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.();
  const autoStartJobMut   = (trpc as any).positioningJobs?.start?.useMutation?.();
  const trpcUtils = (trpc as any).useUtils?.() ?? null;
  useEffect(() => {
    const productId = taskProductId;
    const eventId   = taskEventId;
    if (!productId && !eventId) return; // Brand scope — BrandsPage handles it
    const kind: "product" | "event" = productId ? "product" : "event";
    const entityId = (productId ?? eventId) as number;
    const key = `${kind}:${entityId}`;
    if (_autoPosTaskRef.current === key) return; // Already fired
    const data: any = scopeActiveQuery?.data;
    if (!data) return; // Query not yet loaded
    const entityPositioning = kind === "product"
      ? (data.product?.positioning ?? {})
      : (data.event?.positioning   ?? {});
    // Check for real content (ignore _interim / _meta internal keys)
    const hasContent = Object.keys(entityPositioning)
      .filter(k => !k.startsWith("_"))
      .some(k => {
        const v = entityPositioning[k];
        if (!v || typeof v !== "object" || Array.isArray(v)) return false;
        return Object.values(v).some(fv =>
          (typeof fv === "string" && (fv as string).trim().length > 0) ||
          (Array.isArray(fv)      && (fv as any[]).length > 0)
        );
      });
    if (hasContent) return; // Already has positioning — nothing to do
    if (!autoRunInterimMut?.mutate || !autoStartJobMut?.mutate) return;
    _autoPosTaskRef.current = key;
    (async () => {
      // 1. Fire full pipeline fire-and-forget (background, takes minutes)
      try { autoStartJobMut.mutate({ entityKind: kind, entityId }); } catch { /* non-fatal */ }
      // 2. Run interim (≤12s) — writes _interim positioning used by content tasks
      try { await autoRunInterimMut.mutateAsync?.({ entityKind: kind, entityId }); } catch { /* non-fatal */ }
      // 3. Refresh scope.active so chips pick up the new interim data
      trpcUtils?.scope?.active?.invalidate?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskProductId, taskEventId, scopeActiveQuery?.data]);

  // Polish input
  const polishInputMut = (trpc as any).quickTask?.polishInput?.useMutation();
  const [polishing, setPolishing] = useState(false);
  const [polishErr, setPolishErr] = useState<string | null>(null);

  const handlePolish = async () => {
    if (!activeTask || !primaryAnswer.trim() || !polishInputMut?.mutateAsync) return;
    setPolishErr(null);
    setPolishing(true);
    try {
      const r = await polishInputMut.mutateAsync({
        taskId: activeTask.id,
        text: primaryAnswer,
        taskLabel: typeof activeTask.label === "string" ? activeTask.label : undefined,
        primaryQuestion: activeTask.primary_question ?? undefined,
        brandId: brandId ?? undefined,
        productId: taskProductId ?? undefined,
        eventId: taskEventId ?? undefined,
      });
      if (r?.ok && r.polished) setPrimaryAnswer(r.polished);
      else setPolishErr(lang === "en" ? "Couldn't refine — try again." : "完善失敗，請再試一次");
    } catch {
      setPolishErr(lang === "en" ? "Couldn't refine — try again." : "完善失敗，請再試一次");
    } finally {
      setPolishing(false);
    }
  };

  // Task data
  // 2026-07-20 (CJ「直連 /tasks/fb?b=XXXX 顯示 0/0 個任務」): a failed
  // catalog fetch used to silently render as「0/0 個任務」— retry transient
  // fresh-load hiccups and surface a real error state instead.
  // 2026-08-29：帶 brandId 進去，有客製任務包的品牌會拿到「只有他的卡」的
  // 目錄。沒有包的品牌回傳的東西跟以前一模一樣。
  const listQuery = (trpc as any).quickTask?.listFB?.useQuery
    ? (trpc as any).quickTask.listFB.useQuery(
        { brandId: brandId ?? undefined, brandName: brandName ?? undefined },
        { refetchOnWindowFocus: false, retry: 2 },
      )
    : { data: [] };
  // 這個品牌的頻道 / pill 結構。null = 沒有客製包，走既有的全域 pill。
  const packNavQuery = (trpc as any).quickTask?.brandNav?.useQuery
    ? (trpc as any).quickTask.brandNav.useQuery(
        { brandId: brandId ?? undefined, brandName: brandName ?? undefined },
        { refetchOnWindowFocus: false, staleTime: 300_000 },
      )
    : { data: null };
  const packNav = (packNavQuery.data as any) ?? null;
  const packChannel = packNav?.channels?.find((c: any) => c.key === platform) ?? null;
  // 這個品牌在這個頻道還沒上架的自建卡。listFB 只回 ready 的，所以「建了一半」
  // 的卡如果不在這裡列出來就等於消失 —— 使用者會以為自己的卡不見了。
  const ownCardsQuery = (trpc as any).brandTaskCard?.list?.useQuery
    ? (trpc as any).brandTaskCard.list.useQuery(
        { brandId: brandId ?? 0, channel: platform },
        { enabled: !!brandId && isComposerChannel(platform), refetchOnWindowFocus: false },
      )
    : { data: null };
  const unfinishedOwnCards: any[] = ((ownCardsQuery.data as any[]) ?? [])
    .filter((c) => c.status !== "ready");

  const allTasks: FBTaskCard[] = (listQuery.data as FBTaskCard[]) ?? [];
  // 2026-09-29 CJ：前台只列爆款結構＋品牌自建（sourceVocabulary.frontCardKind）。
  // allTasks 保留完整清單給「用 id 找卡」的地方（?rerun=、?slot=、本週企劃回填）；
  // 清單、張數、篩選、選卡器一律吃 shownTasks。
  const shownTasks: FBTaskCard[] = useMemo(() => allTasks.filter(isFrontVisibleCard), [allTasks]);
  const catalogFailed = !!listQuery?.error && allTasks.length === 0;

  // Mutations
  const runOrchestraMut    = (trpc as any).quickTask?.runOrchestra?.useMutation();
  const runOrchestra60Mut  = (trpc as any).quickTask?.runOrchestra60?.useMutation();
  const runOrchestra99Mut  = (trpc as any).quickTask?.runOrchestra99?.useMutation();
  const runSquadAutoMut    = (trpc as any).quickTask?.runSquadAuto?.useMutation();
  const cancelRunMut       = (trpc as any).quickTask?.cancelRun?.useMutation?.();
  // Key of the orchestra run currently in flight (null once the server answered).
  const runKeyRef = useRef<string | null>(null);
  const holdUtils          = (trpc as any).useUtils?.() ?? null;
  // 2026-07-20 (CJ「取消的任務應該就死掉，不需要留在專案中」): cancelled
  // runs archive their output on arrival (soft delete — hidden from
  // Projects). recordTaskRun's finalize never touches `status`, so the
  // archive sticks even when the server finishes writing afterwards.
  const deleteOutputMut    = (trpc as any).output?.delete?.useMutation?.();

  // ?rerun=<outputId> support
  const rerunId = Number(searchParams.get("rerun") ?? "0");
  const rerunQuery = (trpc as any).output?.getById?.useQuery
    ? (trpc as any).output.getById.useQuery(
        { id: rerunId },
        { enabled: rerunId > 0, staleTime: 60_000 },
      )
    : { data: null };
  useEffect(() => {
    if (!rerunId || !rerunQuery.data || allTasks.length === 0) return;
    const r = rerunQuery.data;
    const taskId = r.mission?.taskId;
    if (!taskId) return;
    const task = allTasks.find((x: FBTaskCard) => x.id === taskId);
    if (!task) return;
    const inputs = (r.metadata?.inputs ?? {}) as Record<string, string>;
    const primaryKey = (task as any).primary_input?.key ?? "topic";
    const prior = inputs[primaryKey] ?? Object.values(inputs)[0] ?? "";
    setActiveTask(task);
    // Rerun: restore the entity the original run used if recorded, else fall
    // back to current global scope, else brand.
    const rpid = (r.metadata as any)?.productId ?? ctx?.scope?.productId ?? null;
    const reid = (r.metadata as any)?.eventId ?? ctx?.scope?.eventId ?? null;
    setModalEntity(
      reid ? { kind: "event", id: reid } :
      rpid ? { kind: "product", id: rpid } :
      { kind: "brand", id: null },
    );
    setPrimaryAnswer(typeof prior === "string" ? prior : "");
    // 重跑時把上一次填的額外欄位一併帶回來 —— 只還原 primary 的話，使用者
    // 得把「活動什麼時候辦」之類的東西再打一次。
    const priorExtra: Record<string, string> = {};
    for (const f of intakeExtraFields(task as any)) {
      const v = inputs[f.key];
      if (typeof v === "string" && v.trim()) priorExtra[f.key] = v;
    }
    setExtraAnswers(priorExtra);
    const next = new URLSearchParams(searchParams);
    next.delete("rerun");
    setSearchParams(next, { replace: true });
  }, [rerunId, rerunQuery.data, allTasks]);

  // ?topic=<text> prefill
  useEffect(() => {
    const topic = searchParams.get("topic");
    if (!topic) return;
    setPrimaryAnswer((prev) => prev || topic);
    const next = new URLSearchParams(searchParams);
    next.delete("topic");
    setSearchParams(next, { replace: true });
  }, [searchParams]);

  // 2026-08-11: ?sid=<scenarioId>&si=<spotIndex> — which strategy-workbench
  // sweet spot this task was opened from. Held in a ref rather than state
  // because the params are stripped from the URL immediately (same as topic)
  // but the value must survive until the user actually presses run, which can
  // be several interactions later. Only the reference is kept; the server
  // resolves the audience labels from the stored scenario.
  // 2026-09-25（CJ 的活動企劃改版）：從活動 tray 過來的一格。寫完要回貼給企劃，
  // 策略層那格的 ✓ 與 tray 的進度都靠它。用 ref 不用 state：參數會立刻從網址上
  // 清掉（跟 topic 一樣），但值要活到使用者真的按下產生為止。
  const campaignRef = React.useRef<{ eventId: number; itemId: string } | null>(null);
  // 2026-09-25（CJ「他忘記帶入日期時間了，本來在活動企畫中，有該則貼文要發布的
  // 時間」）：要預填「日期 / 時間」「為什麼參加 / 重點」就得真的去拿活動資料，
  // 所以除了 ref 還要一份 state —— ref 不會觸發 query。
  const [campaignScope, setCampaignScope] = React.useState<{ eventId: number; itemId: string } | null>(null);
  /** 活動資料已經填進欄位（autoRun 要等這一步，不然會用空白欄位開跑）。 */
  const [campaignPrefilled, setCampaignPrefilled] = React.useState(false);
  const campaignQ = (trpc as any).campaign?.get?.useQuery(
    { eventId: campaignScope?.eventId ?? 0 },
    { enabled: !!campaignScope?.eventId, refetchOnWindowFocus: false, staleTime: 60_000 },
  ) ?? { data: null };
  const campUtils = (trpc as any).useUtils?.() ?? null;
  // 寫完回貼企劃後，活動頁的地圖與狀態要馬上跟著變（不是等使用者重新整理）。
  const markWrittenMut = (trpc as any).campaign?.markWritten?.useMutation?.({
    onSuccess: () => { campUtils?.campaign?.get?.invalidate?.(); campUtils?.campaign?.itemThumbs?.invalidate?.(); },
  });
  // 2026-09-27（本週企劃）：?slot=<planned_slots.id> —— 從本週企劃「寫這篇」過來，寫完回填那一格。
  const plannerSlotRef = React.useRef<number | null>(null);
  const markSlotMut = (trpc as any).planner?.markWritten?.useMutation?.();
  /** 寫完這一格 —— 失敗不擋使用者看產出（回貼失敗只是進度沒更新，不是內容沒寫成）。 */
  const finishCampaignItem = React.useCallback((outputId: number) => {
    const slotId = plannerSlotRef.current;
    if (slotId && outputId && markSlotMut) {
      plannerSlotRef.current = null;
      try { markSlotMut.mutate({ slotId, outputId }); } catch { /* 不致命 */ }
    }
    const c = campaignRef.current;
    if (!c || !outputId || !markWrittenMut) return;
    campaignRef.current = null;
    try { markWrittenMut.mutate({ eventId: c.eventId, itemId: c.itemId, outputId }); } catch { /* 不致命 */ }
  }, [markWrittenMut, markSlotMut]);

  const spotRefRef = React.useRef<{ scenarioId: string; spotIndex: number } | null>(null);
  useEffect(() => {
    const sid = searchParams.get("sid");
    const si = searchParams.get("si");
    if (!sid || si == null) return;
    const idx = Number(si);
    if (Number.isInteger(idx) && idx >= 0) {
      spotRefRef.current = { scenarioId: sid, spotIndex: idx };
    }
    const next = new URLSearchParams(searchParams);
    next.delete("sid");
    next.delete("si");
    setSearchParams(next, { replace: true });
  }, [searchParams]);

  // 2026-09-25：?task=<卡片id>&camp=<活動id>&item=<企劃格子id> —— 活動 tray 的
  // 「去寫這篇」。交棒要一路到底：直接開那張卡，而不是把人丟在列表前面再找一次。
  const campOpenedRef = React.useRef(false);
  useEffect(() => {
    const taskId = embed ? embed.taskId : searchParams.get("task");
    if (!taskId || campOpenedRef.current) return;
    if (!allTasks.length) return;                     // 卡還沒載完，下一輪再試
    const t = allTasks.find((x: any) => x.id === taskId);
    const camp = embed ? (embed.camp?.eventId ?? 0) : Number(searchParams.get("camp") ?? 0);
    const item = embed ? (embed.camp?.itemId ?? null) : searchParams.get("item");
    if (camp && item) { campaignRef.current = { eventId: camp, itemId: item }; setCampaignScope({ eventId: camp, itemId: item }); }
    const slot = embed ? (embed.slotId ?? 0) : Number(searchParams.get("slot") ?? 0);
    if (slot > 0) plannerSlotRef.current = slot;
    campOpenedRef.current = true;
    if (!embed) {
      const next = new URLSearchParams(searchParams);
      next.delete("task"); next.delete("camp"); next.delete("item"); next.delete("slot");
      setSearchParams(next, { replace: true });
    }
    if (t) openTask(t as any);
    else {
      showToastGlobal(lang === "en"
        ? "That task card isn't available for this brand."
        : "這個品牌目前沒有這張任務卡。");
      embed?.onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allTasks]);

  // 從活動企劃開卡時，把活動設定裡**已經有的**答案填進去。被系統問一個它自己
  // 已經知道的問題（期間、優惠機制），比沒有預填更糟——那等於在說剛才填的沒人看。
  // 規則與「只填空的、不知道的不要編」都在 lib/campaignIntakePrefill.ts，有測試。
  useEffect(() => {
    if (!activeTask || !campaignScope || !campaignQ.data) return;
    const d: any = campaignQ.data;
    const item = (d.plan?.items ?? []).find((i: any) => i.id === campaignScope.itemId) ?? null;
    const st = d.settings ?? {};
    const { primary, extras } = campaignPrefill({
      primaryKey: (activeTask as any).primary_input?.key ?? null,
      primaryLabel: (activeTask as any).primary_question ?? null,
      fields: (activeTask as any).inputs ?? [],
      existing: extraAnswers,
      ctx: {
        eventName: d.event?.name ?? "",
        startAt: d.event?.startAt ?? null,
        endAt: d.event?.endAt ?? null,
        itemDate: item?.date ?? null,
        mechanic: st.mechanic ?? null,
        venue: st.venue ?? null,
        sessions: st.sessions ?? null,
        signupUrl: st.signupUrl ?? null,
        angle: item?.angle ?? null,
      },
    });
    if (Object.keys(extras).length) setExtraAnswers((prev) => ({ ...extras, ...prev }));
    if (primary) setPrimaryAnswer((prev) => (prev.trim() ? prev : primary));
    setCampaignPrefilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTask, campaignScope, campaignQ.data]);

  // ── Platform inference (matches QuickTask30sPage logic) ──────────────────
  // 2026-10-04：規則搬到 taskTrayClient.taskPlatformOf——「我的任務卡」總覽頁要用同一份。
  const inferPlatform = (task: FBTaskCard): string => taskPlatformOf(task);

  // ── Filtered task list ────────────────────────────────────────────────────
  /** 這個通路的全部可見卡（已過方案閘門）。托盤與選卡器都吃這一份。 */
  const platformTasks = useMemo(
    () => shownTasks.filter((task) => inferPlatform(task) === platform),
    [shownTasks, platform],
  );

  // ── 2026-09-06 任務托盤 ─────────────────────────────────────────────
  // FB 有 47 張卡擠在同一頁，使用者要在 9 種 postType × 4 種來源裡自己找。
  // 托盤把「瀏覽」與「選擇」分開：平常只擺挑過的（沒挑過就每個分類一張），
  // 要換再開選卡器。
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const trayQuery = (trpc as any).quickTask?.tray?.useQuery
    ? (trpc as any).quickTask.tray.useQuery(
        { brandId: brandId ?? 0, platform },
        { enabled: !!brandId, refetchOnWindowFocus: false },
      )
    : { data: undefined, refetch: () => {} };
  const trayData = trayQuery.data as
    | { stored: string[] | null; fallback: string[]; maxTray: number; viralLocked: number }
    | undefined;

  const setTrayMut = (trpc as any).quickTask?.setTray?.useMutation?.({
    onSuccess: () => { setPickerOpen(false); trayQuery.refetch?.(); },
    onError: (e: any) => toastWithUpgrade(friendlyError(e, lang === "en" ? "Couldn't save. Please try again." : "儲存沒成功，再試一次。"), lang === "en"),
  });

  /** 這個通路實際擺出來的卡 id。存過的要跟「現在看得到的」取交集 —— 降級
   *  或卡退役之後，托盤不能把方案擋掉的卡漏出來。 */
  // 2026-10-04：解析搬到 taskTrayClient.resolveTrayIds（「我的任務卡」總覽頁共用同一份）。
  const trayIds = useMemo<string[]>(() => resolveTrayIds(trayData, platformTasks), [trayData, platformTasks]);

  /**
   * 卡片上的星號（2026-10-04，CJ「可以在不同的平台中，管理到自己常用的」）。
   * 原本要加一張常用卡得開選卡器、在清單裡找到它、勾起來、存檔；星號是同一件事的一步版。
   * 兩個擋下來的情況（到上限、最後一張）見 toggleTrayId。
   */
  const toggleFavorite = (taskId: string) => {
    if (!brandId || !trayData) return;
    const r = toggleTrayId(trayIds, taskId, trayData.maxTray ?? 12);
    if (!r.ok) {
      showToastGlobal(r.reason === "full"
        ? (lang === "en" ? `You can keep up to ${trayData.maxTray ?? 12} saved cards per channel.` : `每個通路最多 ${trayData.maxTray ?? 12} 張常用卡，先拿掉一張再加。`)
        : (lang === "en" ? "Keep at least one saved card." : "常用清單至少留一張。"));
      return;
    }
    setTrayMut?.mutate?.({ brandId, platform, taskIds: r.next });
  };

  /**
   * 這個通路「目前這個分類」的卡 —— 只套用分類分頁（貼文／連結貼文／廣告…，
   * 或沒有分頁的通路走來源＋長度），不套搜尋／新卡／托盤。
   *
   * 2026-09-09 (CJ「新增任務卡時，若僅在 facebook 貼文的類別中新增，就只要出現
   * facebook 貼文類別的任務即可」)：抽成獨立一份，因為「新增任務卡」的選卡器
   * 要吃同一份 —— 之前它收的是整個通路 50 張，跟畫面上正在看哪個分類無關，
   * 選卡器與畫面對不起來。
   */
  const categoryTasks = useMemo(() => {
    let list = platformTasks;
    if (platform === "facebook") {
      // Format-based filter for FB
      if (activeFormat !== "all") {
        list = list.filter((task) => TASK_FORMAT_MAP[task.id] === activeFormat);
      }
    } else if (platform === "instagram") {
      // Format-based filter for IG
      if (activeIGFormat !== "all") {
        list = list.filter((task) => IG_TASK_FORMAT_MAP[task.id] === activeIGFormat);
      }
    } else if (platform === "linkedin") {
      // Format-based filter for LI
      if (activeLIFormat !== "all") {
        list = list.filter((task) => LI_TASK_FORMAT_MAP[task.id] === activeLIFormat);
      }
    } else if (platform === "youtube") {
      // Format-based filter for YT
      if (activeYTFormat !== "all") {
        list = list.filter((task) => YT_TASK_FORMAT_MAP[task.id] === activeYTFormat);
      }
    } else if (platform === "tiktok") {
      // Format-based filter for TikTok
      if (activeTTFormat !== "all") {
        list = list.filter((task) => TT_TASK_FORMAT_MAP[task.id] === activeTTFormat);
      }
    } else if (platform === "email") {
      // Format-based filter for Email
      if (activeEMFormat !== "all") {
        list = list.filter((task) => EM_TASK_FORMAT_MAP[task.id] === activeEMFormat);
      }
    } else if (platform === "pr") {
      // Format-based filter for PR
      if (activePRFormat !== "all") {
        list = list.filter((task) => PR_TASK_FORMAT_MAP[task.id] === activePRFormat);
      }
    } else if (packChannel) {
      // 2026-08-29 客製包優先：分類值來自 pack，卡片自帶 packFormat。
      if (activePackFormat !== "all") {
        list = list.filter((task) => (task as any).packFormat === activePackFormat);
      }
    } else if (platform === "website") {
      // Format-based filter for 官網
      if (activeWEBFormat !== "all") {
        list = list.filter((task) => WEB_TASK_FORMAT_MAP[task.id] === activeWEBFormat);
      }
    }
    // 類型篩選（爆款結構／品牌自建）每個通路都套用。
    if (activeSource !== "all") {
      list = list.filter((task) => frontCardKind(task) === activeSource);
    }
    return list;
  }, [platformTasks, platform, activeSource, activeFormat, activeIGFormat, activeLIFormat, activeYTFormat, activeTTFormat, activeEMFormat, activePRFormat, activeWEBFormat, activePackFormat, packChannel]);

  /** 目前選的分類分頁顯示名；「全部」或沒有分頁分類的通路回 null。 */
  const activeCategoryLabel: string | null = packChannel
    ? (activePackFormat !== "all" ? activePackFormat : null)
    : platform === "facebook" ? (activeFormat !== "all" ? activeFormat : null)
    : platform === "instagram" ? (activeIGFormat !== "all" ? activeIGFormat : null)
    : platform === "linkedin" ? (activeLIFormat !== "all" ? activeLIFormat : null)
    : platform === "youtube" ? (activeYTFormat !== "all" ? activeYTFormat : null)
    : platform === "tiktok" ? (activeTTFormat !== "all" ? activeTTFormat : null)
    : platform === "email" ? (activeEMFormat !== "all" ? activeEMFormat : null)
    : platform === "pr" ? (activePRFormat !== "all" ? activePRFormat : null)
    : platform === "website" ? (activeWEBFormat !== "all" ? activeWEBFormat : null)
    : null;

  const visibleTasks = useMemo(() => {
    let list = categoryTasks;
    if (onlyNew) {
      list = list.filter((task) => isRecentCard((task as any).addedAt));
    }
    if (searchQuery.trim()) {
      list = list.filter((task) =>
        matchTaskWithSynonyms({
          query: searchQuery,
          label: task.label,
          description: task.description ?? "",
          agentName: task.agent?.name,
          skillSlug: task.skill_slug ?? undefined,
        }),
      );
    }
    // 托盤模式：只擺挑過的那幾張。有搜尋或篩選時自動退出托盤（那時使用者
    // 是在找東西，不是在用日常的那幾張）。
    const filtering = searchQuery.trim().length > 0
      || activeSource !== "all" || onlyNew;
    // 2026-09-29：托盤（含系統預設）可能擺著前台已不列的類型——只算看得到的那幾張，
    // 全都看不到就當沒設托盤，不要讓用戶停在「常用清單裡沒有這個分類的卡」。
    const shownIds = new Set(shownTasks.map((t) => t.id));
    const liveTray = trayIds.filter((id) => shownIds.has(id));
    if (!showAllTasks && !filtering && liveTray.length) {
      const inTray = new Set(liveTray);
      list = list.filter((task) => inTray.has(task.id));
    }
    return list;
  }, [categoryTasks, shownTasks, activeSource, searchQuery, showAllTasks, trayIds, onlyNew]);

  const totalForPlatform = useMemo(
    () => shownTasks.filter((task) => inferPlatform(task) === platform).length,
    [shownTasks, platform],
  );

  // Count tasks per format category (FB)
  const formatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "facebook") return {};
    const fbTasks = shownTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: fbTasks.length };
    for (const task of fbTasks) {
      const fmt = TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [shownTasks, platform]);

  // Count tasks per format category (IG)
  const igFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "instagram") return {};
    const igTasks = shownTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: igTasks.length };
    for (const task of igTasks) {
      const fmt = IG_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [shownTasks, platform]);

  // Count tasks per format category (LI)
  const liFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "linkedin") return {};
    const liTasks = shownTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: liTasks.length };
    for (const task of liTasks) {
      const fmt = LI_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [shownTasks, platform]);

  // Count tasks per format category (YT)
  const ytFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "youtube") return {};
    const ytTasks = shownTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: ytTasks.length };
    for (const task of ytTasks) {
      const fmt = YT_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [shownTasks, platform]);

  // Count tasks per format category (TikTok)
  const ttFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "tiktok") return {};
    const ttTasks = shownTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: ttTasks.length };
    for (const task of ttTasks) {
      const fmt = TT_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [shownTasks, platform]);

  // Count tasks per format category (Email)
  const emFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "email") return {};
    const emTasks = shownTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: emTasks.length };
    for (const task of emTasks) {
      const fmt = EM_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [shownTasks, platform]);

  // Count tasks per format category (PR)
  const prFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "pr") return {};
    const prTasks = shownTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: prTasks.length };
    for (const task of prTasks) {
      const fmt = PR_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [shownTasks, platform]);

  // Count tasks per format category (客製包)
  const packFormatCounts = useMemo<Record<string, number>>(() => {
    if (!packChannel) return {};
    const scoped = shownTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: scoped.length };
    for (const task of scoped) {
      const fmt = (task as any).packFormat;
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [shownTasks, platform, packChannel]);

  // Count tasks per format category (官網)
  const webFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "website") return {};
    const webTasks = shownTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: webTasks.length };
    for (const task of webTasks) {
      const fmt = WEB_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [shownTasks, platform]);

  // ── Open / close task modal ───────────────────────────────────────────────
  const openTask = (task: FBTaskCard) => {
    if ((task as any).isMediaTask && (task as any).ctaPath) {
      navigate((task as any).ctaPath);
      return;
    }
    recordTaskUsed(task.id);
    setActiveTask(task);
    // Seed the per-task entity selector from the (legacy) global scope so an
    // existing right-top product/event selection still carries through. Once
    // the right-top picker drops these options, this just defaults to brand.
    const gp = ctx?.scope?.productId ?? null;
    // 從活動企劃過來時，活動就是這一篇的脈絡——優先於全域 scope。
    const ge = campaignRef.current?.eventId ?? ctx?.scope?.eventId ?? null;
    setModalEntity(
      embed?.entity ? { kind: embed.entity.kind, id: embed.entity.id } :
      ge ? { kind: "event", id: ge } :
      gp ? { kind: "product", id: gp } :
      { kind: "brand", id: null },
    );
    let prefill = "";
    const derive = (task as any).primary_input?.derive;
    if (derive && brandCtx) {
      const r = resolveDerive(brandCtx, derive);
      if (r && (derive.mode === "auto" || derive.mode === "confirm")) prefill = r.text;
    }
    // 策略工作台帶入的題目優先於 derive 預填（用戶剛從策略點過來，意圖明確）
    if (strategyTopic) prefill = strategyTopic;
    setPrimaryAnswer(prefill);
    setExtraAnswers({});
    setErrorMsg(null);
    setInputError(null);
    setLatencyMs(null);
    setAgentMeta(null);
  };

  // 2026-07-20 (CJ QA「取消後 AI 仍在後端執行，完成時不經同意自動跳轉，
  // 中斷當下操作」): the in-flight run attempt is invalidated whenever the
  // modal closes. The server keeps generating (an HTTP mutation can't be
  // recalled) and the output still lands in /projects — but a cancelled
  // attempt must NEVER navigate or mutate UI state when it resolves.
  const runSeqRef = useRef(0);

  // Ask the server to really stop the in-flight run (and refund when it can).
  const cancelInFlightRun = () => {
    const key = runKeyRef.current;
    runKeyRef.current = null;
    if (!key || !cancelRunMut?.mutateAsync) return;
    cancelRunMut.mutateAsync({ runKey: key })
      .then((r: any) => {
        const txt = cancelToastText(r, lang === "en");
        if (txt) showToastGlobal(txt);
      })
      .catch((e: any) => showToastGlobal(friendlyError(e, lang === "en" ? "Couldn't stop the task." : "沒辦法停止任務。")));
  };

  const closeTask = () => {
    cancelInFlightRun();
    setCampaignScope(null);   // 不收的話，下一張卡會沿用上一格的活動預填
    runSeqRef.current++; // invalidate any in-flight run attempt
    setActiveTask(null);
    setEditingLabels(false);
    setRunning(false);
    setInputError(null);
    setCountdownStart(null);
    setOrchestraStages(null);
    setModalEntity({ kind: "brand", id: null });
    setEditingChip(null);
    setEditValue("");
    setCtxOpen(null);
    setShowOptional(false);
    embed?.onClose();
  };
  /** 成功要換到成品頁前呼叫：頭像分身從執行中的進度環起飛，降落在成品頁的主筆位置。 */
  const departToRun = () => {
    const cap = agentMeta ?? activeTask?.agent;
    if (!cap?.name) return;
    departAgentHandoff(document.querySelector("[data-agent-handoff]"), cap.avatarUrl || dicebear(cap.name));
  };
  /** 成品頁網址：從本週企劃來的要帶回程資訊，成品頁才會出現「存回本週企劃」。 */
  const runHref = (outputId: number | string) => {
    if (!embed) return `/run/${outputId}`;
    const sp = new URLSearchParams({ from: "planner" });
    if (embed.weekStart) sp.set("w", embed.weekStart);
    if (embed.slotId) sp.set("slot", String(embed.slotId));
    if (embed.slotDate) sp.set("d", embed.slotDate);
    if (embed.camp) { sp.set("camp", String(embed.camp.eventId)); sp.set("item", embed.camp.itemId); }
    return `/run/${outputId}?${sp.toString()}`;
  };

  // ── Inline context-field editing ────────────────────────────────────────
  // Save target = the SELECTED entity (brand/product/event), and its RAW
  // positioning (not the merged overlay shown in chips).
  const editSaveTarget = useMemo(() => {
    const data: any = scopeActiveQuery?.data;
    if (modalEntity.kind === "product" && modalEntity.id) {
      return { kind: "product" as const, id: modalEntity.id, raw: (data?.product?.positioning ?? {}) as any };
    }
    if (modalEntity.kind === "event" && modalEntity.id) {
      return { kind: "event" as const, id: modalEntity.id, raw: (data?.event?.positioning ?? {}) as any };
    }
    if (brandId) {
      return { kind: "brand" as const, id: brandId, raw: (data?.brand?.positioning ?? {}) as any };
    }
    return null;
  }, [modalEntity, scopeActiveQuery?.data, brandId]);

  const openChipEditor = (chip: { source: string; label: string }) => {
    if (!editSaveTarget) return;
    const fieldPath = chipFieldPath(chip.source);
    const cur = getNested(editSaveTarget.raw, fieldPath);
    // Only string-typed fields are inline-editable; arrays/objects (matrix,
    // competitors, pains, etc.) are left to the full positioning editor.
    if (cur != null && typeof cur !== "string") return;
    setEditingChip(chip);
    setEditValue(typeof cur === "string" ? cur : "");
  };

  const commitChipEdit = async () => {
    if (!editingChip || !editSaveTarget || !savePositioningMut?.mutateAsync) return;
    const fieldPath = chipFieldPath(editingChip.source);
    const nextPositioning = setNested(editSaveTarget.raw, fieldPath, editValue.trim());
    try {
      await savePositioningMut.mutateAsync({
        kind: editSaveTarget.kind,
        id: editSaveTarget.id,
        positioning: nextPositioning,
      });
      await trpcUtils?.scope?.active?.invalidate?.();
      setEditingChip(null);
      setEditValue("");
    } catch (e: any) {
      setErrorMsg(friendlyError(e, lang === "en" ? "Couldn't save. Please try again." : "儲存沒成功，再試一次。"));
    }
  };

  // ── Determine effective tier for running (tab || task.tier) ──────────────
  const effectiveTier = (task: FBTaskCard): "30s" | "60s" | "99s" => {
    const t = task.tier as any;
    if (t === "60s" || t === "99s" || t === "30s") return t;
    return "30s";
  };

  // ── handleRun (same logic as QuickTask30sPage, tier = effectiveTier) ─────
  const handleRun = async () => {
    if (!activeTask) return;
    const tier = effectiveTier(activeTask);
    const primaryRequired = (activeTask.inputs?.[0] as any)?.required !== false;
    const hasDerive = !!(activeTask.primary_input as any)?.derive
      || !!(activeTask.contextSources && activeTask.contextSources.length > 0);
    // 2026-07-07 (CJ「開始做按下去沒反應」— live repro): the errorMsg card
    // renders at the BOTTOM of the scrollable ModalBody, below the fold on
    // laptop screens, so validation read as a silent no-op. Every intake
    // rejection now toasts, prints under the question box, and scrolls the
    // input into view.
    const rejectIntake = (msg: string) => {
      setErrorMsg(msg);
      setInputError(msg);
      showToastGlobal(msg);
      try {
        const el = document.querySelector<HTMLElement>("[data-primary-question]");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
      } catch { /* non-fatal */ }
    };
    // 2026-08-23 (CJ「tt-60-viral-rewrite 沒給爆款連結或主題時要出現錯誤提醒」):
    // 爆款改寫任務沒有來源就無從改寫 — 模型會自己編一支不存在的爆款去拆解。
    // 空白、敷衍字（無 / 隨便 / test）、太簡略的答案都在這裡擋下。
    // 權威判斷在 server（扣點前），這份鏡像只是讓提示即時出現。
    if (taskNeedsViralSource(activeTask as any)) {
      const viral = checkViralSource(primaryAnswer, {
        platformLabel: platformLabelForTask(activeTask.platform),
      });
      if (!viral.ok) {
        rejectIntake(lang === "en" ? viral.message.en : viral.message.zh);
        return;
      }
    }
    if (!primaryAnswer.trim() && activeTask.primary_input?.key && primaryRequired && !hasDerive) {
      rejectIntake(lang === "en" ? "Answer the question first, then we'll make it." : "請先回答這個問題再生成");
      return;
    }
    // 2026-09-02: primary 以外的必填。判斷跟 server 用同一份（lib/taskIntake
    // 是 server/_core/taskIntake 的鏡像，parity 測試綁著），所以這裡擋得下來的
    // 東西 server 也會擋，反之亦然 —— 不會出現「畫面過了但送出被拒」。
    const missingExtra = missingRequiredInputs(activeTask as any, extraAnswers);
    if (missingExtra.length > 0) {
      rejectIntake(lang === "en"
        ? `Fill in: ${missingExtra.map((f) => f.label).join(", ")}`
        : `還缺必填欄位：${missingExtra.map((f) => f.label).join("、")}`);
      return;
    }
    setRunning(true);
    setErrorMsg(null);
    setInputError(null);
    setCountdownStart(Date.now());
    // 2026-07-20 (CJ QA): this attempt's ticket. closeTask() bumps the ref,
    // so a cancelled attempt resolves silently — no navigation, no state.
    const mySeq = ++runSeqRef.current;
    const isStale = () => runSeqRef.current !== mySeq;
    // Cancelled attempt resolving late: archive the output so it never
    // shows up in Projects (取消 = 死掉), and say so quietly.
    const discardCancelledOutput = (oid: number | null | undefined) => {
      if (oid) { try { deleteOutputMut?.mutate?.({ id: Number(oid) }); } catch { /* best-effort */ } }
      showToastGlobal(lang === "en"
        ? "Cancelled task discarded."
        : "已取消的任務已捨棄。");
    };

    try {
      // Squad tasks (99s campaign workflows)
      if (activeTask.kind === "squad" && (activeTask as any).squad_slug) {
        if (runSquadAutoMut) {
          const r = await runSquadAutoMut.mutateAsync({
            squadSlug: (activeTask as any).squad_slug,
            topic: primaryAnswer || activeTask.label,
            brandId: brandId ?? undefined,
            productId: taskProductId ?? undefined,
            eventId: taskEventId ?? undefined,
          });
          if (isStale()) { if ((r as any).outputId) discardCancelledOutput((r as any).outputId); return; }
          if ((r as any).outputId) {
            const publicVariants = (r as any).variants ?? [];
            const hasAnyPublicCaption = publicVariants
              .some((variant: any) => (variant?.caption ?? "").trim().length > 0);
            const strategyPublicState = getStrategyPublicGenerationState({
              taskId: (r as any).taskId,
              isStrategyEnvelope: Array.isArray((r as any).planningArtifacts),
              progress: (r as any).progress,
              publicVariantCount: publicVariants.length,
            });
            if (strategyPublicState === "generating") {
              showToastGlobal(lang === "en"
                ? "Planning is ready. Public posts are being generated in the background."
                : "內容規劃已完成，對外貼文正在背景產生。");
            } else if ((r as any).ok === false || !hasAnyPublicCaption) {
              showToastGlobal(lang === "en"
                ? "Public posts weren't generated. Only internal drafts are available right now; you can regenerate them."
                : "公開貼文未產生，目前只有內部草稿，可重新產生。");
            }
            if (!embed?.onWritten) departToRun();
            const doneCb = embed?.onWritten;
            closeTask();
            finishCampaignItem(Number((r as any).outputId));
            if (doneCb) doneCb(Number((r as any).outputId));
            else navigate(runHref((r as any).outputId));
            return;
          }
          const squadErrors = Array.isArray((r as any).errors) ? (r as any).errors : [];
          const errorPreview = squadErrors.slice(0, 2).join(" · ").slice(0, 200);
          setErrorMsg(errorPreview
            ? (lang === "en"
                ? `The squad couldn't produce an output. Detail: ${errorPreview}`
                : `Squad 無法產出內容。詳情：${errorPreview}`)
            : (lang === "en"
                ? "The squad couldn't produce an output. Try again or contact support."
                : "Squad 無法產出內容，請重試或回報。"));
          return;
        }
        setErrorMsg(lang === "en" ? "Squad auto-run isn't available right now." : "Squad 自動執行 mutation 暫不可用");
        return;
      }

      // Orchestra path (30s / 60s / 99s)
      const inputKey = activeTask.primary_input?.key ?? "topic";
      const tierMut =
        tier === "60s" ? runOrchestra60Mut :
        tier === "99s" ? runOrchestra99Mut :
        runOrchestraMut;

      if (tierMut) {
        // 額外欄位先鋪、primary 後蓋 —— 萬一某張卡把 primary 的 key 又
        // 宣告了一次，主問題的答案必須贏。
        const runKey = newRunKey();
        runKeyRef.current = runKey;
        let r: any;
        try {
          r = await tierMut.mutateAsync({
          runKey,
          taskId: activeTask.id,
          inputs: { ...trimmedExtras(extraAnswers), [inputKey]: primaryAnswer },
          brandId: brandId ?? undefined,
          productId: taskProductId,
          eventId: taskEventId,
          // Null when the task wasn't opened from a workbench sweet spot —
          // the run just goes untagged, it never blocks.
          spotRef: spotRefRef.current,
          // 2026-09-30：從活動企劃開的卡，告訴寫手是哪一篇（要不要下廣告）。
          campaignItem: campaignScope ?? null,
          });
        } finally {
          // Server has answered (or failed): nothing left to cancel for this attempt.
          if (runKeyRef.current === runKey) runKeyRef.current = null;
        }
        if (isStale()) { if ((r as any).outputId) discardCancelledOutput((r as any).outputId); return; }

        if ((r as any).outputId) {
          const oid = (r as any).outputId;
          // Hold-for-images: wait for full post before navigating
          if ((tier === "60s" || HOLD_FOR_IMAGES.has(activeTask.id)) && holdUtils?.output?.getById?.fetch) {
            const deadline = Date.now() + 95_000;
            while (Date.now() < deadline) {
              await new Promise((res) => setTimeout(res, 3000));
              if (isStale()) { discardCancelledOutput(oid); return; }
              try {
                const o: any = await holdUtils.output.getById.fetch({ id: oid });
                if (o?.progress && o.progress !== "caption_ready") break;
              } catch { /* transient */ }
            }
          }
          if (isStale()) { discardCancelledOutput(oid); return; }
          if (!embed?.onWritten) departToRun();
          const doneCb = embed?.onWritten;
          closeTask();
          finishCampaignItem(Number(oid));
          if (doneCb) doneCb(Number(oid));
          else navigate(runHref(oid));
          return;
        }

        const hasErrors = r.errors && r.errors.length > 0;
        const hasAnyCaption = (r.variants ?? []).some((v: any) => (v?.caption ?? "").trim().length > 0);
        const errorPreview = hasErrors ? r.errors.slice(0, 2).join(" · ").slice(0, 200) : "";
        setErrorMsg(
          hasErrors && !hasAnyCaption
            ? (lang === "en"
                ? `The AI specialist failed to write any content. Try a different task. Detail: ${errorPreview}`
                : `這位 AI 專家目前無法產出文案，請改試其他任務。詳情：${errorPreview}`)
            : hasErrors
            ? (lang === "en"
                ? "AI is a bit busy — hit Make it again."
                : "AI 暫時忙不過來，再按一次「立即產出」就好。")
            : (lang === "en"
                ? "Captions wrote OK but persistence failed — please contact support."
                : `文案寫出來了但沒存進資料庫（task: ${activeTask.id}），請聯絡客服。`)
        );
        return;
      }

      setErrorMsg(lang === "en"
        ? "This task isn't ready yet."
        : "這個任務還在開發中，請改試其他任務。");
    } catch (e: any) {
      if (!isStale()) {
        const msg = friendlyError(e, lang === "en" ? "Something went wrong. Please try again." : "剛剛沒成功，再試一次。");
        setErrorMsg(msg);
        // The errorMsg card sits at the bottom of the modal body — toast it
        // too, so a server-side rejection (e.g. the viral-source guard on a
        // stale client) is never a silent no-op.
        showToastGlobal(msg);
      }
    } finally {
      // Only the CURRENT attempt may reset run state — a cancelled attempt
      // resolving late must not clobber a newer run the user has started.
      if (!isStale()) {
        setRunning(false);
        setCountdownStart(null);
      }
    }
  };

  // 2026-10-02 autoRun（活動地圖「點了再寫」）：活動資料填進欄位之後，答得出所有必填就直接開跑。
  // 答不出來就停在問題上——跟手動按「立即產出」走同一個 handleRun，閘門一條都沒少。
  const autoRanRef = React.useRef(false);
  useEffect(() => {
    if (!embed?.autoRun || autoRanRef.current || running || !activeTask || !campaignPrefilled) return;
    const primaryRequired = (activeTask.inputs?.[0] as any)?.required !== false;
    const hasDerive = !!(activeTask.primary_input as any)?.derive
      || !!(activeTask.contextSources && activeTask.contextSources.length > 0);
    const primaryOk = !!primaryAnswer.trim() || !activeTask.primary_input?.key || !primaryRequired || hasDerive;
    autoRanRef.current = true;
    if (!primaryOk || taskNeedsViralSource(activeTask as any) || missingRequiredInputs(activeTask as any, extraAnswers).length > 0) {
      showToastGlobal(lang === "en"
        ? "This card needs one more answer before it can write."
        : "這張卡還差一格要你補，補好按「立即產出」。");
      return;
    }
    void handleRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embed?.autoRun, activeTask, campaignPrefilled, primaryAnswer, extraAnswers, running]);

  // ── Progress / countdown ──────────────────────────────────────────────────
  const activeTierForProgress = activeTask ? effectiveTier(activeTask) : "30s";
  // 2026-08-19: squad campaigns are the slow outlier. They run the whole
  // quickTask.runSquadAuto pipeline inside one request — 5 planning steps in
  // sequence plus a 30-post synthesis, measured worst case ~196s. A 100s ring
  // hits 100% while there is still a minute and a half to go, which reads as
  // "stuck" and gets the user clicking 開始做 again. Only the squad branch is
  // widened; every other 99s task keeps its existing 100s pacing.
  const expectedSec =
    activeTierForProgress === "60s" ? 90 :
    activeTask && HOLD_FOR_IMAGES.has(activeTask.id) ? 90 :
    activeTask?.kind === "squad" ? 200 :
    activeTierForProgress === "99s" ? 100 : 30;
  const progressPct = Math.min(100, (tickMs / (expectedSec * 1000)) * 100);

  // Render-time onboarding redirect (must be after all hooks)
  if (needsOnboardingRedirect && !embed) return <Navigate to="/brands" replace />;

  // Redirect unknown platform params
  if (!routeToPlatform(routeParam)) return <Navigate to="/tasks/fb" replace />;
  // 自訂通路載入後發現已被刪除（書籤、舊連結）：導回 FB，不要停在一個沒有入口的空頁。
  if (isCustomChannelId(platform) && !!brandId && !customChannelsHook.isLoading && !customChannel) {
    return <Navigate to="/tasks/fb" replace />;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {!embed && (<>
      {/* 2026-09-27：行事曆合一——當月規劃（/tasks/calendar）與排程與發布共用同一組分頁。 */}
      {platform === "calendar" && <CalendarTabs />}
      {/* ─── HERO ──────────────────────────────────────────────────────── */}
      <div className="relative pt-8 pb-4 px-6 text-center">

        {/* 2026-09-04 (CJ「加任務卡的符號，要在 facebook, instagram 等等頁面中，
            比較明顯的右上方」): 自建任務卡的入口。

            絕對定位在 hero 右上角而不是排進中央那一欄 —— hero 是置中的敘事區
            （頻道 eyebrow → 標題 → 副標 → 搜尋），把一顆動作按鈕插進去會打斷
            閱讀順序，而且會被誤讀成「這是這一頁的主要動作」（主要動作是挑一張
            卡來跑）。右上角是這個產品裡固定放「新增」的位置。

            沒選品牌就只顯示提示不給按 —— 卡是掛在品牌下面的，先問「哪個品牌」
            比按下去才說「請先選品牌」好。 */}
        {isComposerChannel(platform) && (
          <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
            {brandId ? (
              <>
                {/* 2026-09-16（CJ「要讓用戶可以有地方，輸入原文後改寫就好」）：
                    跟新增任務卡是姊妹動作，放在同一個角落——新增任務卡是教會
                    AI 一種新寫法，這顆按鈕只改這一篇，貼上就結束。 */}
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<FontAwesomeIcon icon={faWandMagicSparkles} />}
                  onPress={() => setRewriteOpen(true)}
                >
                  {lang === "en" ? "Rewrite my text" : "改寫原文"}
                </Button>
                {/* 2026-10-05：商品頁（電商／開店平台）的批次產出——同一張卡、很多個商品，逐筆核准後匯出。 */}
                {customChannel?.format === "listing" && (
                  <Button size="sm" variant="flat" onPress={() => setBatchOpen(true)}>
                    {lang === "en" ? "Batch write" : "批次產出"}
                  </Button>
                )}
                {/* 2026-09-29（CJ「新增任務卡有兩個地方，功能重複」）：右上角的
                    「新增任務卡」拿掉，只留卡片旁邊那張虛線卡；品牌自建從那張卡
                    打開的選卡器裡進。 */}
              </>
            ) : (
              <Chip size="sm" variant="flat" className="text-default-500">
                {lang === "en" ? "Pick a brand to add a card" : "選擇品牌後可新增任務卡"}
              </Chip>
            )}
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center text-center max-w-[1100px] mx-auto">

          {/* Platform header：單色 logo＋平台名（2026-09-29 介面去文字化：各通路標語已刪） */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm bg-default-900">
              <FontAwesomeIcon icon={meta.icon} className="text-sm" />
            </div>
            <h1 className="font-bold tracking-tight leading-tight text-default-900" style={{ fontSize: "clamp(1.35rem, 2.4vw, 1.75rem)" }}>
              {lang === "en" ? meta.label : meta.labelZh}
            </h1>
          </div>

          {/* Search */}
          <div className="w-full mb-5" style={{ maxWidth: 740 }}>
            <Input
              size="lg"
              radius="lg"
              variant="flat"
              placeholder={lang === "en" ? "Search tasks or keywords…" : "搜尋任務或關鍵字…"}
              value={searchQuery}
              onValueChange={setSearchQuery}
              isClearable
              onClear={() => setSearchQuery("")}
              startContent={
                <FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-600 shrink-0" style={{ fontSize: 16 }} />
              }
              classNames={{
                base: "overflow-hidden rounded-[18px]",
                inputWrapper: "h-14 bg-white shadow-md border border-default-100 rounded-[18px] data-[focus=true]:shadow-lg",
                input: "text-medium",
              }}
            />
          </div>

          {/* ── 分類列：貼文／連結貼文／廣告／Reels…＋圖片 ──
              2026-08-29 客製包的 pill 優先於所有內建平台分類。分類值由該品牌的
              pack 定義（例如五感十築的 生活實踐／生態健築／永續生活／永續價值），
              不是全域那七份手抄對照表 —— 有包的品牌完全繞開它們。
              2026-09-30（CJ「圖片的 tile 應該要跟廣告貼文、Reels 在同一個地方，而不是跟
              爆款結構在同一個地方」）：圖片是一種形式，放在這一列最後；原本八份一模一樣的
              分類列收成一份。Threads／LINE 沒有文字分類，這列只有「全部｜圖片」。 */}
          {(() => {
            type Tab = { id: string; label: string; labelEn: string };
            const row: { tabs: Tab[]; active: string; set: (id: string) => void; counts: Record<string, number> } | null =
              packChannel
                ? {
                    tabs: [{ id: "all", label: "全部", labelEn: "All" }, ...packChannel.formats.map((f: any) => ({ id: f.id, label: f.labelZh, labelEn: f.labelEn }))],
                    active: activePackFormat, set: setActivePackFormat, counts: packFormatCounts,
                  }
              : platform === "facebook" ? { tabs: FORMAT_TABS, active: activeFormat, set: (id) => setActiveFormat(id as ActiveFormat), counts: formatCounts }
              : platform === "instagram" ? { tabs: IG_FORMAT_TABS, active: activeIGFormat, set: (id) => setActiveIGFormat(id as IGActiveFormat), counts: igFormatCounts }
              : platform === "linkedin" ? { tabs: LI_FORMAT_TABS, active: activeLIFormat, set: (id) => setActiveLIFormat(id as LIActiveFormat), counts: liFormatCounts }
              : platform === "youtube" ? { tabs: YT_FORMAT_TABS, active: activeYTFormat, set: (id) => setActiveYTFormat(id as YTActiveFormat), counts: ytFormatCounts }
              : platform === "tiktok" ? { tabs: TT_FORMAT_TABS, active: activeTTFormat, set: (id) => setActiveTTFormat(id as TTActiveFormat), counts: ttFormatCounts }
              : platform === "email" ? { tabs: EM_FORMAT_TABS, active: activeEMFormat, set: (id) => setActiveEMFormat(id as EMActiveFormat), counts: emFormatCounts }
              : platform === "pr" ? { tabs: PR_FORMAT_TABS, active: activePRFormat, set: (id) => setActivePRFormat(id as PRActiveFormat), counts: prFormatCounts }
              : platform === "website" ? { tabs: WEB_FORMAT_TABS, active: activeWEBFormat, set: (id) => setActiveWEBFormat(id as WEBActiveFormat), counts: webFormatCounts }
              : null;
            const hasImages = imageCards.length > 0;
            if (!row && !hasImages) return null;
            const tabs: Tab[] = row?.tabs ?? [{ id: "all", label: "全部", labelEn: "All" }];
            const pill = (key: string, active: boolean, label: string, count: number | null, onClick: () => void, title?: string) => (
              <button
                key={key}
                onClick={onClick}
                title={title}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                style={
                  active
                    ? { background: "#171717", color: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }
                    : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
                }
              >
                {label}
                {count !== null && (
                  <span
                    className="text-[12px] px-1.5 py-0.5 rounded-full tabular-nums font-semibold"
                    style={{
                      background: active ? "rgba(255,255,255,0.18)" : "#F5F5F5",
                      color: active ? "rgba(255,255,255,0.85)" : "#737373",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
            return (
              <div className="w-full" style={{ maxWidth: 860 }}>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {tabs.map((tab) => {
                    const count = row?.counts[tab.id] ?? 0;
                    if (tab.id !== "all" && count === 0) return null;
                    return pill(
                      tab.id,
                      !imageMode && (row?.active ?? "all") === tab.id,
                      lang === "en" ? tab.labelEn : tab.label,
                      tab.id === "all" ? null : count,
                      () => { setImageMode(false); row?.set(tab.id); },
                    );
                  })}
                  {hasImages && pill(
                    "__image",
                    imageMode,
                    lang === "en" ? "Images" : "圖片",
                    imageCards.length,
                    () => setImageMode(true),
                    lang === "en" ? "Image cards in this channel's sizes." : "這個平台各種尺寸的圖片任務卡。",
                  )}
                </div>
              </div>
            );
          })()}

          {/* 2026-09-06 通路選擇。沒有這一區，用戶被鎖在方案預設值上，
              「11 個通路選 2 個、每月可更換一次」那句賣點就不存在。 */}
          {brandId ? <ChannelPicker brandId={brandId} /> : null}

          {/* 結構來源篩選 —— 只列出這個頻道實際存在的類型，避免一排點不動的空篩選。
              與上面的 tier 分頁是兩條獨立的軸：一條問「產出多大」，一條問「憑什麼這樣寫」。 */}
          {(() => {
            // 2026-09-29 CJ「已經沒有品牌自建和爆款結構兩個 chips」：兩類一律列出並附張數，
            // 就算其中一類是 0 張——0 張的「品牌自建」正是要引導用戶去建卡的入口。
            const counts: Record<FrontCardKind, number> = { viral: 0, own: 0 };
            for (const t of shownTasks) {
              if (inferPlatform(t) !== platform) continue;
              const k = frontCardKind(t);
              if (k) counts[k] += 1;
            }
            // 圖片卡沒有「爆款結構／品牌自建」之分——看圖片時這列收起來。
            if (imageMode) return null;
            const tabs: Array<FrontCardKind | "all"> = ["all", ...FRONT_CARD_KINDS];
            return (
              <div className="mt-3 flex items-center gap-1.5 flex-wrap justify-center">
                {tabs.map((id) => {
                  const active = activeSource === id;
                  const acc = id === "all" || id === "viral" ? "#171717" : "#404040";
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveSource(id)}
                      title={id === "all" ? undefined : id === "viral" ? sourceWhy("viral", lang) : (lang === "en" ? "Cards you built for this brand." : "你替這個品牌自己建的卡。")}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-tiny font-medium transition-all"
                      style={
                        active
                          ? { background: acc, color: "white" }
                          : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
                      }
                    >
                      {id !== "all" && (
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: active ? "rgba(255,255,255,0.75)" : acc }}
                        />
                      )}
                      {id === "all"
                        ? (lang === "en" ? "All" : "全部")
                        : `${frontCardKindLabel(id, lang)} ${counts[id]}`}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Task count micro-label */}
          {!imageMode && <div className="mt-3 text-tiny text-default-600">
            {lang === "en"
              ? `${visibleTasks.length} of ${totalForPlatform} tasks`
              : `${visibleTasks.length} / ${totalForPlatform} 個任務`}
            {brandName && (
              <span className="ml-2">
                · {lang === "en" ? "Brand:" : "品牌腦："}<span className="font-medium text-default-600">{brandName}</span>
              </span>
            )}
          </div>}
          {/* 2026-07-20 (CJ): failed catalog fetch is now visible + retryable
              instead of a silent 0/0. */}
          {strategyTopic && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              border: "1.5px solid #2A2630", background: "#F7F6F3", borderRadius: 12,
              padding: "10px 16px", marginBottom: 14, fontSize: 13,
            }}>
              <span>
                <b>{lang === "en" ? "Strategy topic loaded: " : "策略題目已帶入："}</b>
                「{strategyTopic}」
                <span style={{ marginLeft: 6 }}>
                  <HelpTip>{lang === "en" ? "Open any task — it autofills." : "點任一任務卡，題目會自動填入"}</HelpTip>
                </span>
              </span>
              <button onClick={() => setStrategyTopic(null)}
                      style={{ border: "none", background: "none", color: "#8A8494", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {lang === "en" ? "Clear" : "清除"}
              </button>
            </div>
          )}
          {catalogFailed && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 max-w-xl mx-auto">
              <p className="text-tiny text-warning-800 flex-1 text-left">
                {lang === "en"
                  ? "Task list failed to load — this is a network hiccup, not missing tasks."
                  : "任務清單載入失敗——這是連線問題，不是沒有任務。"}
              </p>
              <button
                onClick={() => listQuery?.refetch?.()}
                className="text-tiny font-semibold px-3 py-1 rounded-md bg-warning-500 text-white hover:bg-warning-600 transition shrink-0"
              >
                {lang === "en" ? "Reload" : "重新載入"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 推薦起點 row removed — it duplicated the grid and pushed tiles below fold */}

      {/* ─── Task grid ─────────────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-6 pb-20 mt-2">
        {imageMode ? (
          <>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {shownImageCards.map((c) => (
                <ImageCardTile key={c.id} card={c} onOpen={() => navigate(imageCardHref(c.id))} />
              ))}
              {/* 跟「新增任務卡」同一個長相：它跟卡片並排，做的是同一件事的延伸。 */}
              {brandId && (
                <button
                  onClick={() => setImagePickerOpen(true)}
                  className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white text-neutral-500 transition hover:border-neutral-500 hover:text-neutral-800"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300">
                    <AddIcon size={14} />
                  </span>
                  <span className="text-[14px] font-medium">
                    {lang === "en" ? "Add image size" : "新增圖片尺寸"}
                  </span>
                </button>
              )}
            </div>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-neutral-500 tabular-nums">
              <TaskCardsIcon size={12} /> {shownImageCards.length} / {imageCards.length}
              <span className="ml-1">{lang === "en" ? "sizes on this channel" : "這個平台的尺寸"}</span>
            </div>
          </>
        ) : totalForPlatform === 0 && allTasks.length === 0 ? (
          <Card>
            <CardBody className="text-center text-default-500 py-12">
              <FontAwesomeIcon icon={faBolt} className="text-3xl mb-2 text-default-300" />
              <p className="font-semibold mb-1">
                {lang === "en" ? `${meta.label} tasks loading…` : `${meta.labelZh} 任務準備中`}
              </p>
            </CardBody>
          </Card>
        ) : visibleTasks.length === 0 ? (
          <Card>
            <CardBody className="text-center text-default-500 py-12">
              {searchQuery.trim() ? (
                <>
                  <FontAwesomeIcon icon={faMagnifyingGlass} className="text-2xl mb-2 text-default-300" />
                  <p>{lang === "en" ? `No tasks match "${searchQuery}"` : `沒有匹配 "${searchQuery}" 的任務`}</p>
                </>
              ) : categoryTasks.length === 0 ? (
                /**
                 * 2026-09-10 (CJ「若該類別當中，沒有任何預設的任務卡，請直接顯示
                 * 新增任務卡的按鈕，而非即將上線。因為新增當中，至少可以讓用戶
                 * 自己創造新的任務卡」)：這個分類真的一張預設卡都沒有——不是
                 * 卡被托盤／搜尋濾掉了，是 categoryTasks 本身是空的。「即將上線」
                 * 是死路；「新增任務卡」至少讓用戶當場自己建一張。
                 */
                <IllustratedEmpty
                  kind="cards"
                  size="sm"
                  title={activeSource === "own"
                    ? (lang === "en" ? "No moves of your own yet" : "還沒有你們自己的招式")
                    : activeSource === "viral"
                      ? (lang === "en" ? `No viral-structure cards in ${activeCategoryLabel ?? meta.label} yet` : `「${activeCategoryLabel ?? meta.labelZh}」目前還沒有爆款結構卡`)
                      : (lang === "en"
                        ? `No preset cards in ${activeCategoryLabel ?? meta.label} yet`
                        : `「${activeCategoryLabel ?? meta.labelZh}」目前還沒有預設任務卡`)}
                  /* 2026-09-29：前台只列爆款結構＋品牌自建，基礎方案看不到爆款卡——
                     講清楚空的原因，不要讓用戶以為壞了。 */
                  note={(trayData?.viralLocked ?? 0) > 0
                    ? (lang === "en"
                      ? `${trayData!.viralLocked} viral-structure cards here are on the Pro plan.`
                      : `這個通路有 ${trayData!.viralLocked} 張爆款結構卡，屬於專業方案。`)
                    : !(isComposerChannel(platform) && brandId)
                      ? (lang === "en" ? "Coming soon." : "即將上線。")
                      : undefined}
                  action={isComposerChannel(platform) && brandId
                    ? { label: lang === "en" ? "+ New card" : "＋ 新增任務卡", onPress: () => { setResumeCardId(null); setComposerOpen(true); } }
                    : undefined}
                />
              ) : (
                // 分類本身有卡，只是這裡只擺常用的那幾張、剛好都不在這個分類——
                // 不是沒有卡，是托盤沒挑到，該做的是看全部，不是「即將上線」。
                <>
                  <FontAwesomeIcon icon={faMagnifyingGlass} className="text-2xl mb-2 text-default-300" />
                  <p className="mb-3">
                    {lang === "en" ? "None of your saved cards are in this category." : "常用清單裡沒有這個分類的卡。"}
                  </p>
                  <Button size="sm" variant="flat" onPress={() => setShowAllTasks(true)}>
                    {lang === "en" ? "Show all" : "看全部"}
                  </Button>
                </>
              )}
            </CardBody>
          </Card>
        ) : (
          <>
            {/* 2026-09-04：建了一半的自建卡。沒有這條，中途關掉 composer 的卡
                就無處可回（listFB 只列 ready），使用者會以為卡不見了。 */}
            {unfinishedOwnCards.length > 0 && (
              <div className="mb-4 rounded-medium border border-warning-200 bg-warning-50/60 px-4 py-3">
                <p className="text-small font-semibold text-warning-800">
                  {lang === "en"
                    ? `${unfinishedOwnCards.length} card(s) not finished`
                    : `你有 ${unfinishedOwnCards.length} 張還沒完成的任務卡`}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {unfinishedOwnCards.map((c) => (
                    <Button
                      key={c.id}
                      size="sm"
                      variant="flat"
                      color={c.status === "failed" ? "danger" : "warning"}
                      startContent={<FontAwesomeIcon icon={faPenToSquare} />}
                      onPress={() => { setResumeCardId(c.id); setComposerOpen(true); }}
                    >
                      {c.name}
                      {c.status === "failed"
                        ? (lang === "en" ? " · failed" : "・生成失敗")
                        : c.skill
                          ? (lang === "en" ? " · ready to test" : "・可試寫")
                          : (lang === "en" ? " · distilling" : "・生成中")}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight flex items-center gap-1">
                  {lang === "en" ? "Tasks" : "精選任務"}
                  <HelpTip>{lang === "en" ? "Tap to make — answer one quick question first." : "按下即產出，先回答 1 個關鍵問題"}</HelpTip>
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {/* 2026-09-08 亮出節奏：這個通路 30 天內上架了幾張。有新卡才顯示，
                    沒有就不佔位 —— 「本月新卡 0 張」只會提醒用戶我們沒動。 */}
                {(() => {
                  const fresh = platformTasks.filter((t) => isRecentCard((t as any).addedAt)).length;
                  if (!fresh && !onlyNew) return null;
                  return (
                    <button
                      onClick={() => { setOnlyNew((v) => !v); if (!onlyNew) setShowAllTasks(true); }}
                      className="rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition"
                      style={onlyNew
                        ? { borderColor: "#171717", background: "#171717", color: "#fff" }
                        : { borderColor: "#171717", background: "#fff", color: "#171717" }}
                      title={lang === "en" ? "Cards published in the last 30 days" : "最近 30 天上架的卡"}
                    >
                      {onlyNew
                        ? (lang === "en" ? "Showing new cards · back to all" : "只看新卡 · 回全部")
                        : (lang === "en" ? `${fresh} new this month` : `本月新卡 ${fresh} 張`)}
                    </button>
                  );
                })()}
                <Chip size="sm" variant="flat" color="secondary">
                  {lang === "en" ? `${visibleTasks.length} tasks` : `${visibleTasks.length} 件`}
                </Chip>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleTasks.map((task, idx) => {
                const agentName = task.agent?.name ?? "AI Agent";
                const avatarSrc = task.agent?.avatarUrl || dicebear(agentName);
                return (
                  // 2026-09-25（CJ「任務卡的格式，我想要跟品牌的任務卡統一格式」）：
                  // 外框與圖片區的幾何搬到 TaskCardShell，活動 tray 用的是同一個殼。
                  // 共用元件而不是複製樣式 —— 複製的那份遲早會漂移。
                  <TaskCardShell
                    key={task.id}
                    onClick={() => openTask(task)}
                    media={<>
                      {/* 自己建的卡：標記 + 編輯入口。編輯放在卡片上而不是另開
                          管理頁 —— 使用者想改的時候，眼睛正看著這張卡。
                          用 span 而不是巢狀 button（button 不能包 button）。 */}
                      {task.ownCardId && (
                        <span
                          role="button"
                          tabIndex={0}
                          title={lang === "en" ? "Edit this card" : "編輯這張卡"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setResumeCardId(task.ownCardId!);
                            setComposerOpen(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault(); e.stopPropagation();
                            setResumeCardId(task.ownCardId!);
                            setComposerOpen(true);
                          }}
                          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-white/85 hover:bg-white text-[12px] font-semibold text-default-700 cursor-pointer"
                        >
                          <FontAwesomeIcon icon={faPenToSquare} />
                          {lang === "en" ? "My card" : "我的卡"}
                        </span>
                      )}
                      <TaskCardAvatar src={avatarSrc} />
                      {/* Last-used badge — bottom right, only when used before */}
                      {(() => {
                        const days = getLastUsedDays(task.id);
                        if (days === null) return null;
                        return (
                          <span
                            className="absolute bottom-2 right-2 text-[12px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(0,0,0,0.55)", color: "#fff", letterSpacing: "0.03em" }}
                          >
                            {days === 0 ? (lang === "en" ? "today" : "今天用過") : `${days}d ago`}
                          </span>
                        );
                      })()}
                      {/* 2026-10-04 常用星號——左下角。右上是「我的卡」、右下是「用過」、左上是平台圖示。 */}
                      {brandId && trayData && (() => {
                        const fav = trayIds.includes(task.id);
                        const label = fav
                          ? (lang === "en" ? "Remove from saved cards" : "從常用移除")
                          : (lang === "en" ? "Add to saved cards" : "加入常用");
                        return (
                          <span
                            role="button"
                            tabIndex={0}
                            title={label}
                            aria-label={label}
                            aria-pressed={fav}
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(task.id); }}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault(); e.stopPropagation();
                              toggleFavorite(task.id);
                            }}
                            className={`absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/85 hover:bg-white cursor-pointer ${fav ? "text-neutral-900" : "text-neutral-300 hover:text-neutral-600"}`}
                          >
                            <FavoriteIcon size={12} />
                          </span>
                        );
                      })()}
                      {/* Platform icon — top left */}
                      <div
                        className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: meta.bg }}
                      >
                        <FontAwesomeIcon icon={meta.icon} className="text-white" style={{ fontSize: 12 }} />
                      </div>
                    </>}
                  >
                      <p className="text-small font-semibold leading-tight line-clamp-2">
                        {lang === "en" ? (task.label_en ?? task.label) : task.label}
                      </p>
                      <p className="text-tiny text-default-500 line-clamp-2">
                        {lang === "en" ? (task.description_en ?? task.description) : task.description}
                      </p>
                      {/* 結構來源 —— 用戶看得到「這張卡憑什麼這樣寫」。
                          有具體出處就印出處（那才是賣點），沒有就印分類名。 */}
                      {(() => {
                        const src = resolveSource(localizeSource((task as any).source ?? {}, task as any, lang));
                        const acc = sourceAccent(src.type);
                        // 自建卡沒有 source，resolveSource 會退回「長青公式」—— 印成品牌自建。
                        const isOwn = frontCardKind(task) === "own";
                        // 2026-09-06：改為單色。原本是彩色圓點＋彩色文字＋淡色底，
                        // 249 張卡每張都有 —— 違反「不要彩色」的紀律。現在只用
                        // 墨色深淺與邊框，字級也從 10px 提到 12px。
                        return (
                          <span
                            role="button"
                            tabIndex={0}
                            className="inline-flex items-center self-start rounded-full border px-2 py-0.5 max-w-full cursor-pointer hover:border-neutral-800"
                            style={{ borderColor: "#E5E5E5", background: "#FFFFFF" }}
                            title={isOwn ? frontCardKindLabel("own", lang) : sourceTooltip(src, lang)}
                            // 2026-09-08 (CJ「在 dev 還看不到出處說明」)：出處 pill 本身就能點開詳情，
                            // 不必找下面那行小字。
                            onClick={(e) => { e.stopPropagation(); setDetailTaskId(task.id); }}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault(); e.stopPropagation(); setDetailTaskId(task.id);
                            }}
                          >
                            <span
                              className="text-[12px] font-medium truncate"
                              style={{ color: acc }}
                            >
                              {isOwn
                                ? frontCardKindLabel("own", lang)
                                : frontCardKind(task) === "viral"
                                  ? `${lang === "en" ? "Reference: " : "參考貼文："}${sourcePillText(src, lang)}`
                                  : sourcePillText(src, lang)}
                            </span>
                          </span>
                        );
                      })()}
                      {/* 2026-09-29（CJ「爆款結構卡上都要有這些文字：參考貼文、副標題、數字是原貼文的」）：
                          爆款卡直接印數字＋量測年月，不用點進詳情才看得到。副標題就是 description。
                          （2026-09-30 CJ「備註的地方都拿掉」：前台不印 caveat，只留在 server 資料層。） */}
                      {frontCardKind(task) === "viral" && (() => {
                        const raw = localizeSource((task as any).source ?? {}, task as any, lang);
                        return (
                          <div className="flex flex-col gap-0.5">
                            {(raw.metric || raw.asOf) && (
                              <p className="text-[12px] leading-snug text-default-600 line-clamp-2">
                                {raw.metric}{raw.metric && raw.asOf ? " · " : ""}{raw.asOf}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      {/* 2026-09-11 (CJ「還是沒有直接打開，就可以看到那些廣告形式的文字」)：
                          Meta 的四種廣告格式（圖像／影片／輪播／精選集）在產品裡一個字都沒
                          出現過。它不能當 pill 分類 —— 我們 6 張廣告卡全是欄位卡（標題／
                          主要文字／說明／行動呼籲），一組標題四種格式都能用，硬分會變成
                          三個空分類。所以印在卡片上當屬性：使用者打開頁面就看得到 Meta 的
                          用語，而我們沒有謊稱每種格式都有專屬的卡。
                          只有 adFormats 有值的卡才渲染這一行 —— 259 張裡目前只有 6 張。 */}
                      {(() => {
                        const fmt = adFormatText((task as any).adFormats, lang);
                        if (!fmt) return null;
                        return (
                          <p className="text-[12px] text-default-500">
                            {lang === "en" ? "Ad formats: " : "適用格式："}{fmt}
                          </p>
                        );
                      })()}
                      {isRecentCard((task as any).addedAt) && (
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="rounded-full border border-neutral-900 px-1.5 py-px text-[11px] text-neutral-900">
                            {lang === "en" ? "New" : "新上架"}
                            {(task as any).addedAt ? ` · ${String((task as any).addedAt).slice(5).replace("-", "/")}` : ""}
                          </span>
                        </div>
                      )}
                      {(task as any).methodology && (
                        <span className="text-[12px] text-default-600 italic inline-flex items-center gap-1"><LibraryIcon size={11} /> {(task as any).methodology}</span>
                      )}
                      <div className="mt-auto pt-2 flex items-center gap-2 border-t border-default-100">
                        <Avatar src={avatarSrc} alt={agentLabel(task.agent, lang) || agentName} size="sm" className="w-5 h-5" />
                        <span className="text-tiny font-medium text-default-700 truncate" title={agentLabel(task.agent, lang)}>{task.agent ? agentShortName(task.agent, lang) : agentName}</span>
                        {/* 2026-09-08 出處詳情：點開看這張卡憑什麼、什麼時候用、上架日。
                            2026-09-30（CJ「出處與說明改成出處，放右下角跟 agent 姓名對稱」）。
                            用 span 而不是巢狀 button（button 不能包 button）。 */}
                        <span
                          role="button"
                          tabIndex={0}
                          className="ml-auto shrink-0 text-tiny font-medium text-neutral-800 underline underline-offset-2 hover:text-neutral-950"
                          onClick={(e) => { e.stopPropagation(); setDetailTaskId(task.id); }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault(); e.stopPropagation(); setDetailTaskId(task.id);
                          }}
                        >
                          {lang === "en" ? "Source" : "出處"}
                        </span>
                      </div>
                      {/* 60s team stack */}
                      {(task as any).team && (task as any).team.length > 1 && (
                        <div className="flex items-center gap-1.5 -mt-1">
                          <div className="flex -space-x-2">
                            {((task as any).team as Array<{ id: number; name: string; nameEn?: string; avatarUrl: string | null }>)
                              .slice(0, 4)
                              .map((m) => (
                                <Avatar key={m.id} src={m.avatarUrl || dicebear(m.name)} size="sm" className="w-5 h-5 ring-1 ring-white" title={agentLabel(m, lang)} alt={agentLabel(m, lang)} />
                              ))}
                          </div>
                          <span className="text-[12px] text-default-500">
                            {lang === "en" ? `${(task as any).team.length} collaborators` : `${(task as any).team.length} 位協作`}
                          </span>
                        </div>
                      )}
                  </TaskCardShell>
                );
              })}

              {/* 2026-09-06 「新增任務卡」入口。刻意長得像一張任務卡而不是
                  一顆按鈕 —— 它跟卡片並排，做的是同一件事的延伸。 */}
              {brandId && trayIds.length > 0 && (
                <button
                  onClick={() => setPickerOpen(true)}
                  className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white text-neutral-500 transition hover:border-neutral-500 hover:text-neutral-800"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300">
                    <AddIcon size={14} />
                  </span>
                  <span className="text-[14px] font-medium">
                    {lang === "en" ? "Add task card" : "新增任務卡"}
                  </span>
                </button>
              )}
            </div>

            {/* 托盤／全部 切換。顯示「現在只擺 N 張，這個通路共 M 張」，
                讓使用者知道有東西被收起來了，而不是以為卡不見了。 */}
            {brandId && trayIds.length > 0 && (
              <div className="mt-4 flex items-center justify-center gap-2 text-[13px] text-neutral-500">
                <span>
                  {showAllTasks
                    ? (lang === "en"
                      ? `Showing all ${platformTasks.length} cards`
                      : `目前顯示全部 ${platformTasks.length} 張`)
                    : (
                      <span className="inline-flex items-center gap-1.5 tabular-nums" title={lang === "en" ? "Your saved cards / all cards in this channel" : "常用 / 這個通路全部"}>
                        <TaskCardsIcon size={12} /> {trayIds.length} / {platformTasks.length}
                      </span>
                    )}
                </span>
                <button
                  onClick={() => setShowAllTasks((v) => !v)}
                  className="font-medium text-neutral-800 underline-offset-2 hover:underline"
                >
                  {showAllTasks
                    ? (lang === "en" ? "Show my cards" : "只看常用")
                    : (lang === "en" ? "Show all" : "看全部")}
                </button>
                <span aria-hidden className="text-neutral-300">·</span>
                {/* 2026-10-04：跨通路的總覽（常用／自建卡的修改、複製、刪除）。 */}
                <button
                  onClick={() => navigate("/my-cards")}
                  className="font-medium text-neutral-800 underline-offset-2 hover:underline"
                >
                  {lang === "en" ? "Manage my cards" : "管理我的任務卡"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      </>)}

      <CardDetailDrawer
        taskId={detailTaskId}
        lang={lang}
        onClose={() => setDetailTaskId(null)}
        onRun={(id) => {
          const t = allTasks.find((x: any) => x.id === id);
          setDetailTaskId(null);
          if (t) openTask(t as any);
        }}
      />
      <ImageSizePicker
        open={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        cards={imageCards}
        selected={shownImageCards.map((c) => c.id)}
        max={imageTrayQ.data?.max ?? 12}
        saving={setImageTrayMut.isPending}
        onSave={(ids) => imageChannel && brandId && setImageTrayMut.mutate({ brandId, channel: imageChannel as any, cardIds: ids })}
      />
      <TaskPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        tasks={categoryTasks as any[]}
        categoryLabel={activeCategoryLabel}
        selected={trayIds.filter((id) => shownTasks.some((t) => t.id === id))}
        maxTray={trayData?.maxTray ?? 12}
        viralLocked={trayData?.viralLocked ?? 0}
        saving={setTrayMut?.isPending}
        onSave={(ids) => setTrayMut?.mutate?.({ brandId: brandId ?? 0, platform, taskIds: ids })}
        onDetail={(id) => setDetailTaskId(id)}
        onCreateOwn={isComposerChannel(platform)
          ? () => { setPickerOpen(false); setResumeCardId(null); setComposerOpen(true); }
          : undefined}
      />

      {/* ─── Task modal (intake + running countdown) ───────────────────── */}
      <Modal
        isOpen={!!activeTask}
        onClose={closeTask}
        size="2xl"
        scrollBehavior="inside"
        backdrop="blur"
        // 2026-09-29（CJ 參考「Your inbox is clear」）：外觀定義在 taskModalStyle，活動節點視窗共用。
        classNames={TASK_MODAL_CLASSNAMES}
      >
        <ModalContent>
          {activeTask && (
            <>
              <ModalHeader className="flex flex-col items-stretch gap-0 pt-4 pb-3 pl-6 pr-14 border-b border-default-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FontAwesomeIcon icon={meta.icon} className="text-neutral-900 shrink-0" style={{ fontSize: 18 }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] text-neutral-900 truncate font-semibold">
                      {lang === "en"
                        ? (activeTask.label_en ?? activeTask.label)
                        : (activeTask.label_zh ?? activeTask.label)}
                    </p>
                  </div>
                  {activeTask.ownCardId && !running && brandId && (
                    <Tooltip content={lang === "en" ? "Edit this card (titles, SKILL)" : "編輯這張卡（標題、SKILL）"}>
                      <button
                        type="button"
                        onClick={() => setEditingLabels((v) => !v)}
                        aria-label={lang === "en" ? "Edit this card (titles, SKILL)" : "編輯這張卡（標題、SKILL）"}
                        aria-pressed={editingLabels}
                        className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition ${editingLabels ? "bg-neutral-900 text-white" : "text-default-500 hover:bg-default-100 hover:text-default-800"}`}
                      >
                        <FontAwesomeIcon icon={faPenToSquare} className="text-tiny" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </ModalHeader>

              <ModalBody>
                {/* 2026-09-30（CJ「上面這幾列還可以優化…Tesla 的介面很少文字，圖示很明顯，
                    複雜文字都在第二層」）：整個 modal 收成三塊——
                      1. 插畫＋問題（同一列；CJ 喜歡插畫，保留）
                      2. 輸入框，「AI 完善提示詞」是框內右下角的橘色 ✨
                      3. 品牌脈絡圖示列（點開才看全文／改寫）＋ agent 頭像＝開始鍵
                    執行中同一個 modal 原地變形：輸入收成一行引用，頭像到正中間變進度環。 */}
                {!running && editingLabels && activeTask.ownCardId && brandId && (
                  <OwnCardLabelsEditor
                    key={activeTask.id}
                    brandId={brandId}
                    cardId={activeTask.ownCardId}
                    name={typeof activeTask.label === "string" ? activeTask.label : (activeTask.label_zh ?? "")}
                    primaryQuestion={activeTask.primary_question ?? ""}
                    fields={(activeTask.inputs ?? []).slice(1).map((f: any) => ({ key: f.key, label: f.label }))}
                    en={lang === "en"}
                    onCancel={() => setEditingLabels(false)}
                    onEditSkill={() => {
                      // 作者視窗疊在任務視窗上面開；關掉後回到同一張卡，可以直接照新的 SKILL 寫。
                      setResumeCardId(activeTask.ownCardId!);
                      setComposerOpen(true);
                    }}
                    onSaved={(patch) => {
                      // 視窗當下就換上新字；目錄重抓一次，卡片列表也跟著更新。
                      setActiveTask((t) => t && ({
                        ...t,
                        label: patch.name, label_zh: patch.name, label_en: patch.name,
                        primary_question: patch.primaryQuestion,
                        inputs: (t.inputs ?? []).map((f: any, i: number) =>
                          i === 0 ? f : ({ ...f, label: patch.fieldLabels[f.key] ?? f.label })),
                      } as FBTaskCard));
                      setEditingLabels(false);
                      listQuery?.refetch?.();
                    }}
                  />
                )}
                {!running && (
                  <div className="flex items-center gap-4 pt-3 pb-1">
                    <div className="shrink-0">
                      <TaskIllustration card={activeTask} width={104} />
                    </div>
                    <h2 className="min-w-0 text-[20px] leading-snug font-bold text-neutral-900">
                      {taskQuestion(activeTask, activeTask.primary_question, lang)
                        || (lang === "en" ? (activeTask.label_en ?? activeTask.label) : (activeTask.label_zh ?? activeTask.label))}
                    </h2>
                  </div>
                )}

                {/* Primary question input */}
                {activeTask.primary_input && !running && (() => {
                  const extraFields = intakeExtraFields(activeTask as any);
                  const optionalCount = extraFields.filter((f) => !f.required).length;
                  const polishBtn = polishInputMut ? (
                    <Tooltip content={polishing
                      ? (lang === "en" ? "Refining…" : "完善中…")
                      : (lang === "en" ? "AI refine prompt — facts kept, never invented" : "AI 完善提示詞（保留事實、不會捏造）")}>
                      <button
                        type="button"
                        onClick={handlePolish}
                        disabled={polishing || !primaryAnswer.trim()}
                        aria-label={lang === "en" ? "AI refine prompt" : "AI 完善提示詞"}
                        className="w-9 h-9 rounded-full bg-[#F37E4A] text-white flex items-center justify-center shadow-sm transition hover:bg-[#D04E22] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {polishing
                          ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <Icon name="generate" size={15} />}
                      </button>
                    </Tooltip>
                  ) : null;
                  const moreBtn = optionalCount > 0 ? (
                    <Tooltip content={lang === "en" ? `Optional details (${optionalCount})` : `補充資訊（選填，${optionalCount} 項）`}>
                      <button
                        type="button"
                        onClick={() => setShowOptional((v) => !v)}
                        aria-label={lang === "en" ? "Optional details" : "補充資訊"}
                        aria-pressed={showOptional}
                        className={`relative w-9 h-9 rounded-full flex items-center justify-center transition ${showOptional ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 ring-1 ring-default-200 hover:ring-default-400"}`}
                      >
                        <Icon name="add" size={14} />
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-neutral-900 text-white text-[10px] leading-4 text-center ring-2 ring-white">{optionalCount}</span>
                      </button>
                    </Tooltip>
                  ) : null;
                  return (
                    <div className="space-y-2" data-primary-question>
                      <div className="relative">
                        {activeTask.primary_input.type === "textarea" ? (
                          <Textarea
                            placeholder={taskPlaceholder(activeTask, activeTask.primary_input.placeholder, lang)}
                            value={primaryAnswer}
                            onChange={(e) => { setPrimaryAnswer(e.target.value); if (inputError) setInputError(null); }}
                            minRows={3}
                            autoFocus
                            isInvalid={!!inputError}
                            classNames={{ inputWrapper: "rounded-2xl px-4 pt-3 pb-12", input: "text-[15px]" }}
                          />
                        ) : (
                          <Input
                            placeholder={taskPlaceholder(activeTask, activeTask.primary_input.placeholder, lang)}
                            value={primaryAnswer}
                            onChange={(e) => { setPrimaryAnswer(e.target.value); if (inputError) setInputError(null); }}
                            autoFocus
                            isInvalid={!!inputError}
                            classNames={{ inputWrapper: "rounded-2xl pl-4 pr-24 h-12", input: "text-[15px]" }}
                          />
                        )}
                        {(polishBtn || moreBtn) && (
                          <div className={`absolute right-2 flex items-center gap-1.5 z-10 ${activeTask.primary_input.type === "textarea" ? "bottom-2" : "top-1.5"}`}>
                            {moreBtn}
                            {polishBtn}
                          </div>
                        )}
                      </div>
                      {/* 2026-08-23: intake rejection prints here, next to the
                          field it is about — not only in the card at the very
                          bottom of the modal body. */}
                      {inputError && (
                        <p className="text-tiny text-danger-500 flex items-start gap-1.5">
                          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-[2px]" />
                          <span>{inputError}</span>
                        </p>
                      )}
                      {polishErr && <p className="text-tiny text-danger-500">{polishErr}</p>}
                    </div>
                  );
                })()}

                {/* 2026-09-02 — primary 以外的欄位。
                    在這之前 intake 只渲染 primary_input 一格，`template.inputs[]`
                    其餘欄位是死的：225 張卡有 24 張宣告了額外欄位，其中 7 張標成
                    required 卻沒有任何 UI 可以填（fb-60-launch-kit 從來不問活動
                    什麼時候辦、為什麼辦，模型就自己編一個）。

                    必填的永遠展開；選填的收在輸入框右下角的「＋」（2026-09-30 起，
                    原本是一行「補充資訊（選填）」摺疊標題）。 */}
                {!running && (() => {
                  const fields = intakeExtraFields(activeTask as any);
                  if (fields.length === 0) return null;
                  const required = fields.filter((f) => f.required);
                  const optional = fields.filter((f) => !f.required);
                  // 沒有主問題的卡，「＋」按鈕不存在 —— 選填欄位直接展開。
                  const optionalOpen = showOptional || !activeTask.primary_input;
                  const renderField = (f: IntakeField) => (
                    <div key={f.key} className="space-y-1">
                      <p className="text-tiny font-medium text-default-700">
                        {taskInputText(activeTask, f.key, "label", f.label, lang)}
                        {f.required && <span className="text-danger-500 ml-1">*</span>}
                      </p>
                      {f.type === "textarea" ? (
                        <Textarea
                          size="sm"
                          minRows={2}
                          placeholder={taskInputText(activeTask, f.key, "placeholder", f.placeholder, lang)}
                          value={extraAnswers[f.key] ?? ""}
                          onChange={(e) => {
                            setExtraAnswers((prev) => ({ ...prev, [f.key]: e.target.value }));
                            if (inputError) setInputError(null);
                          }}
                        />
                      ) : (
                        <Input
                          size="sm"
                          placeholder={taskInputText(activeTask, f.key, "placeholder", f.placeholder, lang)}
                          value={extraAnswers[f.key] ?? ""}
                          onChange={(e) => {
                            setExtraAnswers((prev) => ({ ...prev, [f.key]: e.target.value }));
                            if (inputError) setInputError(null);
                          }}
                        />
                      )}
                    </div>
                  );
                  if (required.length === 0 && !optionalOpen) return null;
                  return (
                    <div className="space-y-3" data-extra-inputs>
                      {required.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-tiny text-default-500">
                            {lang === "en"
                              ? "This task needs a couple more things — without them the model makes them up."
                              : "這張卡還需要這幾項 —— 沒給的話模型會自己編。"}
                          </p>
                          {required.map(renderField)}
                        </div>
                      )}
                      {optional.length > 0 && optionalOpen && (
                        <div className="space-y-2">{optional.map(renderField)}</div>
                      )}
                    </div>
                  );
                })()}

                {/* 2026-09-25（CJ「本來在活動企畫中，有該則貼文要發布的時間」）：
                    這一篇在企劃上排在哪一天，要看得見。卡片裡問的「日期 / 時間」
                    是**活動**什麼時候發生（已自動帶入活動期間），跟這篇貼文的
                    發布日是兩件事——不講清楚，使用者會以為系統把日期搞丟了。 */}
                {!running && (() => {
                  if (!campaignScope || !campaignQ.data) return null;
                  const d: any = campaignQ.data;
                  const item = (d.plan?.items ?? []).find((i: any) => i.id === campaignScope.itemId);
                  if (!item) return null;
                  return (
                    <p className="text-tiny text-default-600 m-0 flex items-center gap-1.5 flex-wrap">
                      <Icon name="campaign" size={12} />
                      {lang === "en"
                        ? `From the campaign plan for “${d.event?.name ?? ""}” — this post is scheduled for ${item.date}.`
                        : `來自「${d.event?.name ?? ""}」的宣傳企劃 —— 這篇排在 ${item.date} 發布。`}
                      {/* 2026-09-30（CJ「廣告文案要標註」）：寫之前就講清楚這篇是廣告。 */}
                      {item.paid && (
                        <span className="inline-flex items-center rounded-full bg-foreground text-background px-2 py-0.5 text-[11px] font-semibold">
                          {lang === "en" ? "Ad copy — will be promoted" : "廣告文案・這篇會下廣告"}
                        </span>
                      )}
                    </p>
                  );
                })()}

                {/* Brand assets empty hint */}
                {!running && textAssetsEmpty && brandId && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-900 leading-relaxed">
                    {lang === "en" ? (
                      <>
                        <span className="font-medium">This brand's word assets are empty.</span>
                        {" "}Pop into{" "}
                        <a href={`/brands?b=${brandId}&cat=copy`} target="_blank" rel="noreferrer" className="underline font-medium hover:text-amber-700">
                          Brand → Words
                        </a>
                        {" "}and click Auto-fill. Output will be far more on-brand.
                      </>
                    ) : (
                      <>
                        <span className="font-medium">這個品牌的「文字」資產還是空的。</span>
                        {" "}先到{" "}
                        <a href={`/brands?b=${brandId}&cat=copy`} target="_blank" rel="noreferrer" className="underline font-medium hover:text-amber-700">
                          品牌 → 文字
                        </a>
                        {" "}按「自動填寫」，AI 產出會明顯貼合品牌語氣。
                      </>
                    )}
                  </div>
                )}

                {/* ── 品牌脈絡圖示列＋開始鍵 ─────────────────────────────────────
                    2026-09-30：原本的黑底長 chip 全部改成「圖示＋兩三個字」，
                    完整內容與改寫收進點開後的第二層。涵蓋的東西跟原本一樣：
                      - 產出對象（品牌／產品／活動）→ 第一顆「名稱」圖示，點開切換
                      - 每條 contextSources（有內容的全部＋沒填的最多 4 條，虛線）
                      - 字串欄位可直接改寫（含「可選用」的相鄰欄位），其餘只讀
                    圖示對照：v2/content/lib/contextChipIcons.ts */}
                {!running && (() => {
                  // 2026-05-27 (CJ「modal chip 仍抓 SoWork」): scope-aware DEFAULT_SOURCES.
                  // Product uses segment ids: core / audience / value / competition / strategy / marketing.
                  // Brand uses: goldenCircle / audience / voice / differentiation / values / tagline.
                  const isProductScope = !!(brandCtx?.product);
                  const isEventScope   = !!(brandCtx?.event);
                  const BRAND_SOURCES = [
                    "brand.name",
                    "brand.positioning.audience.primary",
                    "brand.positioning.voice.archetypes",
                    "brand.positioning.voice.tone",
                    "brand.positioning.voice.forbidden",
                    "brand.positioning.goldenCircle.why",
                  ];
                  const PRODUCT_SOURCES = [
                    "brand.name",                                   // displayName = product name
                    "brand.positioning.audience.primary",           // product.audience.primary
                    "brand.positioning.core.coreStatement",         // product.core.coreStatement
                    "brand.positioning.marketing.tone",             // product.marketing.tone
                    "brand.positioning.competition.uniqueUsp",      // product.competition.uniqueUsp
                    "brand.positioning.value.userFeeling",          // product.value.userFeeling
                  ];
                  const EVENT_SOURCES = [
                    "brand.name",                                          // displayName = event name
                    "brand.positioning.audience.primaryAudience",          // event.audience.primaryAudience
                    "brand.positioning.smp.singleMindedProposition",       // event.smp.singleMindedProposition
                    "brand.positioning.messaging.coreMessage",             // event.messaging.coreMessage
                    "brand.positioning.creative.coreTranslation",          // event.creative.coreTranslation
                  ];
                  const DEFAULT_SOURCES =
                    isProductScope ? PRODUCT_SOURCES :
                    isEventScope   ? EVENT_SOURCES   :
                    BRAND_SOURCES;
                  const sources = (activeTask.contextSources && activeTask.contextSources.length > 0)
                    ? activeTask.contextSources
                    : DEFAULT_SOURCES;
                  const chips = brandCtx ? buildContextChips(brandCtx, sources) : [];
                  // Is a chip inline-editable? Only string-typed (or empty)
                  // segment fields; arrays/objects route to the full editor.
                  const isEditable = (source: string): boolean => {
                    if (!editSaveTarget) return false;
                    const v = getNested(editSaveTarget.raw, chipFieldPath(source));
                    return v == null || typeof v === "string";
                  };
                  const anyContent = chips.some((c) => c.hasContent);
                  const showChips = anyContent || chips.some((c) => isEditable(c.source));
                  const nameChip = chips.find((c) => c.source === "brand.name");
                  const tiles = showChips ? [
                    ...chips.filter((c) => c.hasContent && c.source !== "brand.name"),
                    ...chips.filter((c) => !c.hasContent && c.source !== "brand.name").slice(0, 4),
                  ] : [];
                  // 2026-09-30（CJ「缺乏選擇產品的地方」）：只要有品牌就能切換；還沒有產品／活動時
                  // 第二層直接給「＋新增產品／＋新增活動」，建完自動選成這次的產出對象。
                  const hasEntityChoice = !!brandId;
                  const showNameTile = hasEntityChoice || (showChips && !!nameChip);
                  const entityName =
                    modalEntity.kind === "product" ? (modalProducts.find((p: any) => p.id === modalEntity.id)?.name ?? "")
                    : modalEntity.kind === "event" ? (modalEvents.find((e: any) => e.id === modalEntity.id)?.name ?? "")
                    : (brandName ?? brandCtx?.brand?.name ?? "");
                  const entityIcon: IconName =
                    modalEntity.kind === "product" ? "shop" : modalEntity.kind === "event" ? "campaign" : "brand";
                  const entityShort =
                    modalEntity.kind === "product" ? (lang === "en" ? "Product" : "產品")
                    : modalEntity.kind === "event" ? (lang === "en" ? "Event" : "活動")
                    : (lang === "en" ? "Brand" : "品牌");
                  const openChip = ctxOpen && ctxOpen !== "__entity" ? chips.find((c) => c.source === ctxOpen) ?? null : null;

                  const tile = (key: string, icon: IconName, short: string, opts: { missing?: boolean; active?: boolean; tip: string; onPress: () => void }) => (
                    <Tooltip key={key} content={<span className="block max-w-[260px] text-[12px] leading-snug">{opts.tip}</span>} delay={250}>
                      <button
                        type="button"
                        onClick={opts.onPress}
                        aria-label={short}
                        aria-expanded={!!opts.active}
                        className="flex flex-col items-center gap-1 w-[52px] group"
                      >
                        <span className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition ${
                          opts.active
                            ? "bg-neutral-900 text-white"
                            : opts.missing
                            ? "border border-dashed border-default-300 text-default-600 group-hover:border-default-500"
                            : "bg-default-100 text-neutral-800 group-hover:bg-default-200"
                        }`}>
                          <Icon name={icon} size={16} />
                          {!opts.missing && !opts.active && (
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          )}
                        </span>
                        <span className={`w-full truncate text-center text-[11px] leading-tight ${opts.missing ? "text-default-600" : "text-default-600"}`}>{short}</span>
                      </button>
                    </Tooltip>
                  );
                  const toggle = (key: string) => {
                    setEditingChip(null);
                    setEditValue("");
                    setCtxOpen((cur) => (cur === key ? null : key));
                  };
                  const agent = activeTask.agent;
                  const agentSrc = agent ? (agent.avatarUrl || dicebear(agent.name)) : null;

                  return (
                    <div className="pt-1">
                      <div className="flex items-end gap-3">
                        <div className="flex-1 min-w-0 flex flex-wrap gap-x-0.5 gap-y-2">
                          {showNameTile && tile(
                            "__entity",
                            entityIcon,
                            `${entityShort} ▾`,
                            {
                              active: ctxOpen === "__entity",
                              tip: `${entityShort} · ${entityName}` + (hasEntityChoice ? (lang === "en" ? " — switch to a product or event" : " —— 點一下改成產品或活動") : ""),
                              onPress: () => toggle("__entity"),
                            },
                          )}
                          {tiles.map((c) => {
                            const ic = contextChipIcon(c.source, c.name);
                            return tile(c.source, ic.icon, lang === "en" ? ic.shortEn : ic.short, {
                              missing: !c.hasContent,
                              active: ctxOpen === c.source,
                              tip: c.hasContent ? `${c.name} · ${c.text.length > 80 ? c.text.slice(0, 80) + "…" : c.text}` : `${c.name} · ${lang === "en" ? "not filled yet" : "尚未填寫"}`,
                              onPress: () => toggle(c.source),
                            });
                          })}
                        </div>

                        {/* agent 頭像＝開始鍵（2026-09-30 CJ「agent 本身就是啟動的按鈕」） */}
                        <button
                          type="button"
                          onClick={handleRun}
                          aria-label={t("qt_run_btn")}
                          className="shrink-0 flex flex-col items-center gap-1 group"
                        >
                          <span className="relative block rounded-full p-[3px] ring-[3px] ring-[#F37E4A] transition group-hover:scale-105 group-active:scale-95">
                            {agentSrc ? (
                              <Avatar src={agentSrc} className="w-14 h-14" />
                            ) : (
                              <span className="w-14 h-14 rounded-full bg-default-100 flex items-center justify-center text-neutral-700">
                                <Icon name="agent" size={22} />
                              </span>
                            )}
                            <span className="absolute -right-1 -bottom-1 w-7 h-7 rounded-full bg-[#F37E4A] text-white flex items-center justify-center ring-2 ring-white">
                              <Icon name="play" size={11} />
                            </span>
                          </span>
                          {/* 2026-09-30（CJ「Yawen 的名字要跟人像對齊」）：名字從標題列搬到頭像正下方 */}
                          <span className="flex flex-col items-center leading-tight">
                            {agent && <span className="text-[12px] font-semibold text-neutral-900 max-w-[96px] truncate" title={agentLabel(agent, lang)}>{agentShortName(agent, lang)}</span>}
                            <span className="text-[11px] font-semibold text-[#F37E4A]">{t("qt_run_btn")}</span>
                          </span>
                        </button>
                      </div>

                      {/* 第二層：產出對象切換 */}
                      {ctxOpen === "__entity" && (
                        <div className="mt-3 rounded-2xl bg-default-50 px-3 py-2.5">
                          <p className="text-tiny text-default-500 mb-1.5">
                            {lang === "en" ? "Generate for" : "產出對象"}
                          </p>
                          {hasEntityChoice ? (
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                onClick={() => setModalEntity({ kind: "brand", id: null })}
                                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                                  modalEntity.kind === "brand"
                                    ? "bg-neutral-900 text-white border-neutral-900"
                                    : "bg-white text-default-700 border-default-300 hover:border-default-500"
                                }`}
                              >
                                {lang === "en" ? "Brand" : "品牌"}{brandName ? ` · ${brandName}` : ""}
                              </button>
                              {modalProducts.map((p: any) => (
                                <button
                                  key={`p-${p.id}`}
                                  onClick={() => setModalEntity({ kind: "product", id: p.id })}
                                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                                    modalEntity.kind === "product" && modalEntity.id === p.id
                                      ? "bg-neutral-900 text-white border-neutral-900"
                                      : "bg-white text-default-700 border-default-300 hover:border-default-500"
                                  }`}
                                >
                                  {lang === "en" ? "Product · " : "產品 · "}{p.name}
                                </button>
                              ))}
                              {modalEvents.map((e: any) => (
                                <button
                                  key={`e-${e.id}`}
                                  onClick={() => setModalEntity({ kind: "event", id: e.id })}
                                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                                    modalEntity.kind === "event" && modalEntity.id === e.id
                                      ? "bg-neutral-900 text-white border-neutral-900"
                                      : "bg-white text-default-700 border-default-300 hover:border-default-500"
                                  }`}
                                >
                                  {lang === "en" ? "Event · " : "活動 · "}{e.name}
                                </button>
                              ))}
                              {(["product", "event"] as const).map((k) => (
                                <button
                                  key={`add-${k}`}
                                  onClick={() => setAddEntityTab(k)}
                                  className="text-xs px-2.5 py-1 rounded-full border border-dashed border-default-300 text-default-500 hover:border-default-500 hover:text-default-800 transition flex items-center gap-1"
                                >
                                  <AddIcon size={10} />
                                  {k === "product"
                                    ? (lang === "en" ? "New product" : "新增產品")
                                    : (lang === "en" ? "New event" : "新增活動")}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-small text-default-800 m-0">{nameChip?.text || brandName}</p>
                          )}
                        </div>
                      )}

                      {/* 第二層：單一脈絡的全文＋改寫 */}
                      {openChip && (() => {
                        const editable = isEditable(openChip.source);
                        const editing = editingChip?.source === openChip.source;
                        const fieldPath = chipFieldPath(openChip.source);
                        const siblings = (CHIP_SIBLING_CANDIDATES[fieldPath] ?? [])
                          .map((sp) => ({ path: sp, val: getNested(editSaveTarget?.raw, sp) }))
                          .filter((s) => typeof s.val === "string" && s.val.trim().length > 0);
                        return (
                          <div className="mt-3 rounded-2xl bg-default-50 px-3.5 py-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Icon name={contextChipIcon(openChip.source, openChip.name).icon} size={13} className="text-default-500" />
                              <p className="text-tiny font-semibold text-default-700 flex-1 m-0">{openChip.name}</p>
                              {editable && !editing && (
                                <button
                                  type="button"
                                  onClick={() => openChipEditor(openChip)}
                                  className="text-tiny text-default-600 hover:text-default-900 flex items-center gap-1"
                                >
                                  {openChip.hasContent ? <EditIcon size={11} /> : <AddIcon size={11} />}
                                  {openChip.hasContent ? (lang === "en" ? "Rewrite" : "改寫") : (lang === "en" ? "Fill in" : "填寫")}
                                </button>
                              )}
                            </div>
                            {!editing && (
                              <p className="text-small text-default-800 whitespace-pre-wrap leading-relaxed m-0">
                                {openChip.hasContent ? openChip.text : (
                                  <span className="text-default-600">{lang === "en" ? "Not filled yet." : "尚未填寫。"}</span>
                                )}
                              </p>
                            )}
                            {!editable && (
                              <p className="text-[12px] text-default-600 mt-1.5 m-0">
                                {lang === "en" ? "Edit this one in the full positioning editor." : "這一項請到定位頁完整編輯。"}
                              </p>
                            )}
                            {editing && (
                              <>
                                {siblings.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-1.5">
                                    <span className="text-[12px] text-default-600 self-center">
                                      {lang === "en" ? "Pick:" : "可選用："}
                                    </span>
                                    {siblings.map((s) => (
                                      <button
                                        key={s.path}
                                        onClick={() => setEditValue(s.val)}
                                        className="text-[12px] px-2 py-0.5 rounded-full border border-default-300 bg-white text-default-600 hover:border-default-500"
                                        title={s.val}
                                      >
                                        {s.val.length > 24 ? s.val.slice(0, 24) + "…" : s.val}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <Textarea
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  minRows={2}
                                  autoFocus
                                  placeholder={lang === "en" ? "Type or rewrite…" : "輸入或改寫…"}
                                />
                                <p className="text-[12px] text-default-600 mt-1">
                                  {lang === "en"
                                    ? `Saves to this ${editSaveTarget?.kind ?? "brand"}'s positioning.`
                                    : `會更新此${editSaveTarget?.kind === "product" ? "產品" : editSaveTarget?.kind === "event" ? "活動" : "品牌"}的定位。`}
                                </p>
                                <div className="flex gap-2 mt-1.5">
                                  <Button size="sm" color="secondary"
                                    isLoading={savePositioningMut?.isPending}
                                    onPress={commitChipEdit}>
                                    {lang === "en" ? "Save" : "儲存"}
                                  </Button>
                                  <Button size="sm" variant="flat"
                                    onPress={() => { setEditingChip(null); setEditValue(""); }}>
                                    {lang === "en" ? "Cancel" : "取消"}
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* 執行中：同一個 modal 原地變形 —— 輸入收成一行引用，頭像到正中間，
                    進度環＝開始鍵那圈橘色；階段改成一排圖示（策略→文案→圖片→審核）。 */}
                {running && (() => {
                  const tier = effectiveTier(activeTask);
                  const stagesNow = orchestraStages && orchestraStages.length > 0
                    ? orchestraStages
                    : synthesizeStages(tickMs, tier, lang, activeRegulationCount > 0);
                  const agentRoster: Array<{ id?: number; name: string; nameEn?: string; titleEn?: string; title?: string; avatarUrl?: string | null; role?: string }> = [];
                  const cap = agentMeta ?? activeTask.agent;
                  if (cap) agentRoster.push({ id: cap.id, name: cap.name, nameEn: cap.nameEn, titleEn: cap.titleEn, title: cap.title, avatarUrl: cap.avatarUrl, role: lang === "en" ? "Writing caption" : "撰寫文案" });
                  if (imageAgentMeta) agentRoster.push({ id: imageAgentMeta.id, name: imageAgentMeta.name, nameEn: imageAgentMeta.nameEn, titleEn: imageAgentMeta.titleEn, title: imageAgentMeta.title, avatarUrl: imageAgentMeta.avatarUrl, role: lang === "en" ? "Visual direction" : "視覺方向" });
                  const PHASES: Array<{ key: string; stageKeys: string[]; icon: IconName; zh: string; en: string }> = [
                    { key: "plan",   stageKeys: ["scout", "pre", "strategist"], icon: "strategy", zh: "策略", en: "Plan" },
                    { key: "write",  stageKeys: ["caption"],                   icon: "content",  zh: "文案", en: "Copy" },
                    { key: "check",  stageKeys: ["brandcheck"],                icon: "shield",   zh: "一致性", en: "On-brand" },
                    // 2026-09-30（CJ「寫在任務卡上的顯示進度，表示有進行合規檢查」）：品牌有啟用中的法規才出現。
                    { key: "comply", stageKeys: ["regcheck"],                  icon: "regulation", zh: "合規檢查", en: "Compliance" },
                    { key: "image",  stageKeys: ["gen"],                       icon: "image",    zh: "圖片", en: "Image" },
                    { key: "review", stageKeys: ["extras", "qa"],              icon: "review",   zh: "審核", en: "Review" },
                  ];
                  // 2026-09-30（CJ「文案和圖片是分開處理的，不會同時寫文又產圖」）：
                  // 單篇任務這次執行根本不呼叫生圖模型（runImageGen=false，圖到成品頁才由用戶
                  // 自己生），所以不列「圖片」；只有這個視窗會等圖生完的任務才列，而且只對應
                  // 真正的生圖（gen），不含跟文案同時寫的風格指示（brief）——文案寫完才會亮。
                  const waitsForImages = tier === "60s" || HOLD_FOR_IMAGES.has(activeTask.id);
                  const phases = PHASES.filter((p) => p.key !== "image" || waitsForImages).map((p) => {
                    const ss = (stagesNow as any[]).filter((s) => p.stageKeys.includes(s.key));
                    if (ss.length === 0) return null;
                    const status = ss.some((s) => s.status === "running") ? "running"
                      : ss.every((s) => s.status === "done") ? "done" : "pending";
                    return { ...p, status };
                  }).filter(Boolean) as Array<(typeof PHASES)[number] & { status: string }>;
                  const current = phases.find((p) => p.status === "running");
                  return (
                    <div className="flex flex-col items-center">
                      {primaryAnswer.trim() && (
                        <p className="self-stretch mt-2 mb-0 rounded-xl bg-default-100 px-3 py-2 text-tiny text-default-600 truncate">
                          <Icon name="quote" size={10} className="mr-1.5 text-default-600" />
                          {primaryAnswer.trim()}
                        </p>
                      )}
                      <RunningAgentCarousel
                        agents={agentRoster.length > 0 ? agentRoster : [{ name: "Agent", role: lang === "en" ? "Working" : "處理中" }]}
                        stages={null}
                        accentColor="#F37E4A"
                        progressPct={progressPct}
                        handoffAnchor
                      />
                      <div className="flex items-center gap-1.5 -mt-1">
                        {phases.map((p, i) => (
                          <React.Fragment key={p.key}>
                            {i > 0 && (
                              <span className={`w-5 h-0.5 rounded-full ${phases[i - 1].status === "done" ? "bg-neutral-900" : "bg-default-200"}`} />
                            )}
                            <Tooltip content={lang === "en" ? p.en : p.zh}>
                              <span
                                aria-label={lang === "en" ? p.en : p.zh}
                                className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition ${
                                  p.status === "done" ? "bg-neutral-900 text-white"
                                  : p.status === "running" ? "bg-[#F37E4A]/10 text-[#F37E4A] ring-2 ring-[#F37E4A]/60 animate-pulse"
                                  : "bg-default-100 text-default-600"
                                }`}
                              >
                                <Icon name={p.status === "done" ? "check" : p.icon} size={15} />
                              </span>
                            </Tooltip>
                          </React.Fragment>
                        ))}
                      </div>
                      <p className="text-[12px] text-default-500 mt-2 mb-1">
                        {current
                          ? (lang === "en" ? current.en : current.zh)
                          : (lang === "en" ? "Wrapping up" : "收尾中")}
                      </p>
                      <Button size="sm" variant="flat" className="mt-1" onPress={closeTask}>
                        {lang === "en" ? "Stop" : "停止"}
                      </Button>
                    </div>
                  );
                })()}

                {/* Error message */}
                {errorMsg && (
                  <Card className="bg-warning-50 border border-warning-200 mt-2">
                    <CardBody className="text-warning-800 text-small">{errorMsg}</CardBody>
                  </Card>
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      <AddEntityModal
        isOpen={!!addEntityTab}
        initialTab={addEntityTab ?? "product"}
        defaultBrandId={brandId ?? null}
        onClose={() => setAddEntityTab(null)}
        onCreated={(kind, id) => {
          if (kind === "product" || kind === "event") setModalEntity({ kind, id });
          void modalProductsQuery?.refetch?.();
          void modalEventsQuery?.refetch?.();
        }}
      />

      {/* 自建任務卡的作者流程。上架成功後重抓 listFB，新卡立刻出現在這一頁。 */}
      <TaskCardComposer
        isOpen={composerOpen}
        onClose={() => { setComposerOpen(false); setResumeCardId(null); void ownCardsQuery?.refetch?.(); }}
        brandId={brandId ?? null}
        channel={platform as ComposerChannel}
        channelLabel={lang === "en" ? meta.label : meta.labelZh}
        format={customChannel?.format === "listing" ? "listing" : "post"}
        initialCardId={resumeCardId}
        onPublished={() => { void listQuery?.refetch?.(); void ownCardsQuery?.refetch?.(); }}
      />
      {customChannel?.format === "listing" && !!brandId && (
        <ListingBatchModal
          isOpen={batchOpen}
          onClose={() => setBatchOpen(false)}
          brandId={brandId}
          channelId={platform}
          channelLabel={lang === "en" ? meta.label : meta.labelZh}
        />
      )}

      <RewriteDraftModal
        isOpen={rewriteOpen}
        onClose={() => setRewriteOpen(false)}
        brandId={brandId ?? null}
      />
    </div>
  );
}

/** 本週企劃用：只有任務視窗，疊在呼叫它的頁面上。 */
export function PlatformTaskModal(props: TaskEmbed) {
  return (
    <PlatformPageErrorBoundary platform={props.route}>
      <PlatformTaskPageInner embed={props} />
    </PlatformPageErrorBoundary>
  );
}

export default function PlatformTaskPage() {
  const { platform = "fb" } = useParams<{ platform: string }>();
  return (
    <PlatformPageErrorBoundary platform={platform}>
      <PlatformTaskPageInner />
    </PlatformPageErrorBoundary>
  );
}
