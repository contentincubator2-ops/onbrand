/**
 * BrandsPage — Canva Brand Kit clone v2 (full-bleed layout).
 *
 * Layout matches Canva exactly:
 *   - Top: thin pastel header strip with 品牌工具組 chip + brand name
 *   - Left rail (260px, fixed width, no max-w): sub-nav links + brand
 *     switcher dropdown
 *   - Right: full-bleed grid of large pastel asset tiles (4 cols on
 *     desktop, each ~4:3 aspect)
 *
 * Each tile is a HeroUI Card isPressable with a unique pastel-100 bg,
 * a giant FA icon as the visual centerpiece, and a label below.
 *
 * No max-width container anywhere — extends to viewport edges.
 */
import React, { useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang, tr } from "../../../lib/i18n";
import type { ShellOutletCtx } from "../../platform/lib/shellContext";
import { isStrategyPreviewEmail, isPersonaPreviewEmail } from "../../platform/lib/shellContext";
import { Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/react";
import PipelineRunner, { type PipelineState } from "../components/positioning/PipelineRunner";
import PipelineThinkingPanel from "../components/positioning/PipelineThinkingPanel";
import AgentPersonaBar from "../components/positioning/AgentPersonaBar";
import { type AssetKey } from "../components/assets/BrandAssetEditor";
import KnowledgeEditor from "../components/assets/KnowledgeEditor";
import PositioningDocPanel from "../components/positioning/PositioningDocPanel";
import CustomCardEditor, { type EditableCard } from "../components/assets/CustomCardEditor";
import ChannelRoleModal from "../components/positioning/ChannelRoleModal";
import ChannelRolesTray from "./brands/ChannelRolesTray";
import { type ChannelId } from "../lib/channelRoles";
import { InfoTab as BrandInfoTab, DangerTab as BrandDangerTab, PublishTab as BrandPublishTab } from "../components/positioning/BrandSettingsSheet";
import BrainPanel from "../components/brain/BrainPanel";
import RegulationsPanel from "../components/regulations/RegulationsPanel";
import BrandOnboardingWizard from "../components/onboarding/BrandOnboardingWizard";
import AIBriefPanel from "../components/positioning/AIBriefPanel";
import StrategyAlertsPanel from "../components/director/StrategyAlertsPanel";
import PersonaAgentPanel from "../components/director/PersonaAgentPanel";
import { showToastGlobal } from "../../platform/components/Toast";
import AddEntityModal, { type AddEntityTab } from "../components/AddEntityModal";
import ProductDetailModal from "../components/assets/ProductDetailModal";
import EventCardGrid from "../components/events/EventCardGrid";
import EventYearTimeline, { type PlanPrefill } from "../components/events/EventYearTimeline";
import { toYmd } from "../lib/eventTimeline";
// Notion-style line icons
import { LockToggle } from "../components/positioning/LockToggle";
import { AgentIcon, CommentIcon, MemoryIcon, RegulationIcon, DeleteIcon, FontIcon, IdCardIcon, LockIcon, PaletteIcon, TargetIcon, DoneIcon, StopIcon, WarningIcon } from "../../platform/components/icons";
import { SCOPE_SEGMENTS } from "../lib/positioningSchema";
import { specOf as copySpecOf } from "../lib/copyAssets";
import { visualSpecOf } from "../lib/visualAssets";
import { strategyCrumbs, type CrumbTarget } from "../lib/strategyCrumbs";
import { useCampaignSlots } from "../lib/campaign/campaignSlots";
import VisualAssetBoard from "../components/assets/VisualAssetBoard";
import { pipelineFor, stepTitleText, stepThinkingText, type PipelineStepSpec } from "../lib/positioningPipeline";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTableList, faBullhorn, faWandMagicSparkles, faGear, faSatelliteDish, faFileArrowUp } from "@fortawesome/free-solid-svg-icons";
import { TabActionBar, StrategyToolIcon, VisualNavItem } from "./brands/tabChrome";
import { PositioningGrid } from "./brands/PositioningGrid";
import { PositioningPanel, BrandAssetPanel } from "./brands/PositioningPanel";
import { PositioningCompletionBridge, PositioningTopRow } from "./brands/PositioningTopRow";
import { EventSettingsPanel } from "./brands/EventSettingsPanel";
import { BrandLogoSettings, BrandPaletteHero } from "./brands/BrandVisuals";
import { CopyTabInline } from "./brands/CopyTabInline";
import { ProductInfoEditor } from "./brands/ProductInfoEditor";
import { BrandEntityGrid } from "./brands/BrandEntityGrid";

// Sub-nav id format:
//   "asset:<key>"   — non-positioning brand assets (準則 / 標誌 / etc.)
//   "seg:<segment>" — one positioning segment (driven by positioningSchema)
//   "card" / "all"
type SectionId = string;

// Brand has positioning segments + visual/asset entries.
// Per CJ: 圖像/圖示/圖表/品牌範本/準則/照片/所有資產 all removed.

// Event-specific subnav additions (CJ direction 2026-04-29):
// - settings page lets user edit metadata (brand / name / period /
//   productIds) post-creation — previously only set at create time.
// - 視覺資產 deferred to a later round (event posters / videos go through
//   MediaGenFlow per the visual-step rule, not stored as static assets).

export default function BrandsPage() {
  const campaignSlots = useCampaignSlots();
  const { t, lang } = useLang();
  const { brandId, setBrandId, brands, scope: globalScope, setScope, userEmail } = useOutletContext<ShellOutletCtx>();

  // 2026-06-19 Phase 2 (CJ「BrandsPage 改用 URL 帶 id」): the global scope is
  // brand-only now. The specific product / event being edited comes from the
  // URL (?p= / ?e=), local to this editor session, so it never leaks to other
  // pages. brandId still comes from the global scope (or the ?b= the shell
  // already synced into it). All downstream `scope?.productId/eventId` reads
  // keep working against this merged object.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlProductId = Number(searchParams.get("p")) || null;
  const urlEventId = Number(searchParams.get("e")) || null;

  // 2026-08-20: the 策略 rail (ShellLayout) lists this page's seven sections
  // for strategy-preview accounts, which makes the in-page tile strip below
  // a duplicate of the same control. Gate on the SAME resolved email the
  // shell already fetched (via outlet context), not a second independent
  // `/api/auth/me` call — two separate requests can disagree (one fails
  // transiently while the other succeeds), leaving the rail and this tile
  // strip out of sync with no way to recover short of a reload (Codex
  // review, PR #119).
  const isStrategyPreview = isStrategyPreviewEmail(userEmail);
  const isPersonaPreview = isPersonaPreviewEmail(userEmail);
  const scope = React.useMemo(
    () => ({
      brandId: globalScope?.brandId ?? brandId ?? null,
      productId: urlProductId,
      eventId: urlEventId,
    }),
    [globalScope?.brandId, brandId, urlProductId, urlEventId],
  );
  // Navigate the editor to a specific entity by writing ?p= / ?e= (replaces
  // the old setScope({productId/eventId}) which the brand-only global scope
  // no longer supports).

  // Add entity modal (新增品牌 / 產品 / 活動)
  const [addModal, setAddModal] = useState<{ open: boolean; tab: AddEntityTab }>({ open: false, tab: "brand" });
  // 2026-10-02：從活動時間軸節點「開始企劃」時帶進新增活動視窗的名稱與日期。
  const [eventPrefill, setEventPrefill] = useState<PlanPrefill | null>(null);
  // 2026-05-08: onboarding wizard for first-time users (no brands yet).
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  // 2026-09-23（CJ「在看到品牌定位卡片之上，有太多按鈕了…問用戶是否需要
  // 策略監測或健檢，若需要，才會啟動」）：策略監測／策略健檢兩個區塊
  // 原本一律展開、疊在卡片正上方。改成一排小 icon，預設全部收起——點了
  // 才等於「使用者說需要」，才真的渲染那個區塊（不是只是視覺收合，未點開
  // 時那些元件根本不掛載）。一次只開一個。（策略總監本身已經搬到全域
  // 右上角常駐入口，見 StrategyDirectorDrawer.tsx，這裡不再重複。）
  // 也讀 ?tool= —— 全域總監的「引導進行」按鈕會帶著這個參數導過來，讓
  // 這一頁自動展開對應面板，不用使用者自己再點一次 icon。
  //
  // 2026-09-30（CJ「我要刪除策略健檢的功能，要有一個 chip 是『定位資料』，按下去
  // 可看到目前填寫好的定位資料」）：健檢刪除；「定位資料」與「策略監測」變成
  // 二選一的兩個視圖——定位資料＝下面那組定位卡片（預設），策略監測＝只看情報。
  // 以前監測是疊在卡片上方，要一路往下捲才回得到定位。舊連結 ?tool=healthcheck
  // 落在預設的定位資料。
  const toolFromUrl = searchParams.get("tool");
  const [activeStrategyTool, setActiveStrategyTool] = useState<"positioning" | "monitor">(
    () => (toolFromUrl === "monitor" ? "monitor" : "positioning"),
  );
  // 已經在這一頁時，左下角通知或策略總監帶 ?tool=monitor 導過來，也要切過去。
  React.useEffect(() => {
    if (toolFromUrl === "monitor") setActiveStrategyTool("monitor");
  }, [toolFromUrl]);
  // 使用者自己切 chip 時把 ?tool= 拿掉——不然網址還停在 monitor，下一次通知帶同一個網址過來會沒反應。
  const switchStrategyTool = (t: "positioning" | "monitor") => {
    setActiveStrategyTool(t);
    if (searchParams.get("tool")) {
      setSearchParams((prev) => { const sp = new URLSearchParams(prev); sp.delete("tool"); return sp; }, { replace: true });
    }
  };
  // 2026-05-30 (CJ「modal 移除」): ?tab= deep-links now navigate to the
  // corresponding main-workspace category instead of opening a modal.
  React.useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("tab");
      if (t === "publish") {
        setCategory(t);
      } else if (t === "connector") {
        setCategory("publish"); // legacy alias
      }
      // info/visual → those are already the default main tabs; no-op.
    } catch { /* no-op */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab locks (定位 / 文字 / 視覺) — fetched per-brand
  const activeBrandIdForLocks = scope?.brandId ?? brandId ?? null;
  // 2026-09-30：策略監測 chip 上的未讀數。跟側欄「品牌」圖示、左下角通知同一支查詢（react-query 共用快取）。
  const monitorUnreadQ = (trpc as any).strategyMonitor.unreadSummary.useQuery(
    { brandId: activeBrandIdForLocks ?? 0 },
    { enabled: !!activeBrandIdForLocks, staleTime: 30_000 },
  );
  const monitorUnread = Number(monitorUnreadQ.data?.count ?? 0);
  const tabLocksQuery = (trpc as any).tabLock?.get?.useQuery
    ? (trpc as any).tabLock.get.useQuery(
        { brandId: activeBrandIdForLocks ?? 0 },
        { enabled: !!activeBrandIdForLocks, refetchOnWindowFocus: false }
      )
    : { data: null, refetch: () => {} };
  const tabLocks = (tabLocksQuery.data as { positioning: any; copy: any; visual: any } | null) ?? { positioning: null, copy: null, visual: null };
  const lockTabMut   = (trpc as any).tabLock?.lock?.useMutation();
  const unlockTabMut = (trpc as any).tabLock?.unlock?.useMutation();
  // Load brand's full positioning JSON so cards can show preview content
  // without re-fetching per-tile (single round trip via scope.active).
  // 2026-05-18 (CJ「選了 onbrand.ai 產品，品牌大腦還是顯示 sowork.ai」):
  // was hardcoded productId/eventId: null → always queried + showed the
  // BRAND's positioning even when a product/event scope was selected.
  // Pass the active scope ids so we can show the product/event's own
  // positioning.
  const scopeActiveQuery = (trpc as any).scope?.active?.useQuery
    ? (trpc as any).scope.active.useQuery(
        {
          brandId: activeBrandIdForLocks ?? 0,
          productId: scope?.productId ?? null,
          eventId: scope?.eventId ?? null,
        },
        { enabled: !!activeBrandIdForLocks, refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null };
  // 2026-05-13 (CJ「復華顯示定位完成，但很多內容都沒有填寫」): the
  // positioning runner writes server-side data shapes that don't match
  // what the UI segment renderers expect. Two-level mismatch:
  //   (a) top-level key   — server `brandOrigin` vs UI `origin`
  //   (b) inner field key — server `founderStory` vs UI `story`
  // Translate at read time so existing data renders without a server
  // migration. Renderers only require the keys they care about; extra
  // fields are ignored.
  // Source positioning from the ACTIVE scope entity: product → product's
  // own positioning, event → event's, otherwise the brand's. (Speed-card
  // / 指令庫 are brand-level knowledge and still inherit from the brand.)
  const _sa = scopeActiveQuery.data as any;
  const rawPositioning =
    (scope?.productId ? _sa?.product?.positioning
      : scope?.eventId ? _sa?.event?.positioning
      : _sa?.brand?.positioning) ?? {};
  const fullPositioning: Record<string, any> = (() => {
    // 2026-05-13 (post-deploy bug — "網站空白"): defensive wrapper.
    // If any step of the shape translation throws (malformed JSON, unexpected
    // primitive where an object is expected, etc.) we fall back to the raw
    // positioning so the page still renders.
    try {
    const safeRaw = (rawPositioning && typeof rawPositioning === "object" && !Array.isArray(rawPositioning))
      ? rawPositioning : {};
    const merged: Record<string, any> = { ...safeRaw };
    const isObj = (x: any) => x != null && typeof x === "object" && !Array.isArray(x);
    const setIfEmpty = (k: string, v: any) => {
      if (v == null) return;
      const existing = merged[k];
      if (existing == null) { merged[k] = v; return; }
      if (isObj(existing) && Object.keys(existing).length === 0) { merged[k] = v; return; }
    };

    // (1) origin: server brandOrigin{rootBelief, founderStory, triggerMoment}
    //     → UI origin{story, belief5Layers[]}
    const bo = merged.brandOrigin;
    if (bo && typeof bo === "object") {
      const story = [bo.founderStory, bo.rootBelief, bo.triggerMoment]
        .filter(Boolean).join("\n\n");
      const belief5Layers = [
        bo.rootBelief && { layer: tr("Root belief", "根信念"), body: bo.rootBelief },
        bo.founderStory && { layer: tr("Founder story", "創辦故事"), body: bo.founderStory },
        bo.triggerMoment && { layer: tr("Trigger moment", "觸發時刻"), body: bo.triggerMoment },
      ].filter(Boolean);
      setIfEmpty("origin", { story, belief5Layers });
    }

    // (2) values: server brandValues{coreValues:string[], brandVision, brandMission, goldenCircle}
    //     → UI values{items: [{label, body}]}
    const bv = merged.brandValues;
    if (bv && typeof bv === "object") {
      const cv = Array.isArray(bv.coreValues) ? bv.coreValues : [];
      const items = cv.map((entry: any) => {
        if (typeof entry === "string") {
          // Split "穩健信賴：以數十年..." into label / body
          const m = entry.match(/^([^：:]+)[：:]\s*(.+)$/);
          return m ? { label: m[1]!.trim(), body: m[2]!.trim() } : { label: entry, body: "" };
        }
        if (entry && typeof entry === "object") {
          return { label: entry.label ?? entry.name ?? "", body: entry.body ?? entry.description ?? "" };
        }
        return { label: "", body: "" };
      }).filter((x: any) => x.label);
      setIfEmpty("values", { items });
    }

    // (3) audience: server targetAudience{primarySegment, keyPersonas[], demographics, psychographics, buyingBehavior}
    //     → UI audience{primary, secondary, matrix?[]}
    const ta = merged.targetAudience;
    if (ta && typeof ta === "object") {
      const personas = Array.isArray(ta.keyPersonas) ? ta.keyPersonas : [];
      const primary = [ta.primarySegment, personas[0]?.description].filter(Boolean).join("\n\n");
      const secondary = personas[1]?.description ?? "";
      setIfEmpty("audience", { primary, secondary, matrix: [] });
    }

    // (4) goldenCircle: server goldenCircleRefined{why, how, what} — already matches UI shape
    if (merged.goldenCircleRefined && !merged.goldenCircle) {
      merged.goldenCircle = merged.goldenCircleRefined;
    }
    // 2026-05-20: old auto pipeline wrote "goldenCircleRefine" (no trailing 'd')
    if (merged.goldenCircleRefine && !merged.goldenCircle) {
      merged.goldenCircle = merged.goldenCircleRefine;
    }
    // ...fallback: derive from brandValues.goldenCircle if outer not present
    if (!merged.goldenCircle && bv?.goldenCircle) {
      merged.goldenCircle = bv.goldenCircle;
    }

    // (5) tagline: server taglineCandidates{candidates[], recommended}
    //     → UI tagline{zhTagline, enTagline, type, scenes[], competitorDiff, story}
    const tc = merged.taglineCandidates;
    if (tc && typeof tc === "object") {
      const recommended = tc.recommended ?? (Array.isArray(tc.candidates) ? tc.candidates[0] : "");
      const candidates = Array.isArray(tc.candidates) ? tc.candidates : [];
      const others = candidates.filter((c: string) => c !== recommended).slice(0, 4);
      setIfEmpty("tagline", {
        zhTagline: recommended,
        enTagline: "",
        story: others.length ? `${tr("Other candidates:", "其他候選：")}\n${others.map((c: string) => "· " + c).join("\n")}` : "",
        type: "",
        scenes: [],
        competitorDiff: "",
      });
    }
    // 2026-05-20: old auto pipeline wrote "taglineCreative" — map to tagline shape
    const tce = merged.taglineCreative;
    if (tce && typeof tce === "object") {
      setIfEmpty("tagline", {
        zhTagline: tce.zhTagline ?? tce.tagline ?? tce.mainTagline ?? "",
        enTagline: tce.enTagline ?? "",
        type: tce.type ?? "",
        scenes: Array.isArray(tce.scenes) ? tce.scenes : [],
        competitorDiff: tce.competitorDiff ?? "",
        story: tce.story ?? tce.rationale ?? "",
      });
    }

    // (6) taglineScore: server brandPositioningScore — pass through best-effort
    if (merged.brandPositioningScore && !merged.taglineScore) {
      merged.taglineScore = merged.brandPositioningScore;
    }

    // 2026-05-20: old auto pipeline segment ID normalizations (pre-May-17 data)
    // competitorAnalysis{mainCompetitors[{name,positioning,weakness}], marketGaps, competitiveAdvantages}
    //   → competition{direct[{name}], intensity}
    const compA = merged.competitorAnalysis;
    if (compA && typeof compA === "object") {
      const direct = Array.isArray(compA.mainCompetitors)
        ? compA.mainCompetitors.map((c: any) => ({ name: c.name ?? c, positioning: c.positioning ?? "" }))
        : [];
      const intensity = Array.isArray(compA.competitiveAdvantages)
        ? compA.competitiveAdvantages.slice(0, 2).join("；")
        : (compA.marketGaps ? String(compA.marketGaps).slice(0, 100) : "");
      setIfEmpty("competition", { direct, intensity });
    }
    // brandPersonality{archetypes[], tone (string), voice, communicationStyle}
    //   → voice{archetypes[], tone[], forbidden[]}
    const bp = merged.brandPersonality;
    if (bp && typeof bp === "object") {
      setIfEmpty("voice", {
        archetypes: Array.isArray(bp.archetypes) ? bp.archetypes : [],
        tone: Array.isArray(bp.tone) ? bp.tone : (bp.tone ? [bp.tone] : []),
        forbidden: [],
      });
    }
    // valueProposition{headline, subheadline, keyBenefits[], proofPoints[]}
    //   → differentiation{summary, emotional, functional}
    const vp = merged.valueProposition;
    if (vp && typeof vp === "object") {
      setIfEmpty("differentiation", {
        summary: vp.uniqueSellingProposition ?? vp.positioningStatement ?? vp.headline ?? "",
        emotional: vp.subheadline ?? "",
        functional: Array.isArray(vp.keyBenefits) ? vp.keyBenefits : (Array.isArray(vp.keyDifferentiators) ? vp.keyDifferentiators : []),
      });
    }
    // marketInsight{...} → trends{favorable[], risks[]} (best-effort shape coercion)
    const mi = merged.marketInsight;
    if (mi && typeof mi === "object") {
      const favorable = Array.isArray(mi.favorable) ? mi.favorable
        : Array.isArray(mi.opportunities) ? mi.opportunities.map((o: any) => ({ name: o.title ?? o, body: o.description ?? "" }))
        : [];
      const risks = Array.isArray(mi.risks) ? mi.risks
        : Array.isArray(mi.threats) ? mi.threats.map((t: any) => ({ name: t.title ?? t, body: t.description ?? "" }))
        : [];
      if (favorable.length > 0 || risks.length > 0) setIfEmpty("trends", { favorable, risks });
    }

    // ── LEGACY product data → canonical segment translation (2026-05-26) ────
    // 2026-06-16: the product pipeline now writes canonical PRODUCT_SEGMENTS
    // keys directly (core/audience/value/competition/strategy/marketing), so
    // this block is a BACKWARD-COMPAT shim only — it migrates products whose
    // positioning still holds the OLD ad-hoc keys (marketFit / targetUser /
    // valueProp / productDifferentiation / productMessaging / gtmSummary) from
    // before the fix. setIfEmpty never overwrites canonical data, so it no-ops
    // for freshly-run products and only fills gaps for legacy ones.
    const pMktFit = merged.marketFit;
    const pTargetUser = merged.targetUser;
    const pValProp = merged.valueProp;
    const pDiff = merged.productDifferentiation;
    const pMsg = merged.productMessaging;
    const pGtm = merged.gtmSummary;

    if (pMsg && typeof pMsg === "object") {
      // core: name / zhTagline / coreStatement / oneLineValueProp
      setIfEmpty("core", {
        name: pMsg.oneLiner ?? "",
        zhTagline: pMsg.tagline ?? "",
        enTagline: "",
        coreStatement: Array.isArray(pMsg.threePillars) ? pMsg.threePillars.join(" · ") : "",
        oneLineValueProp: (pValProp as any)?.headline ?? pMsg.oneLiner ?? "",
      });
      // also fill tagline so 速查卡 can read seg.tagline?.zhTagline
      setIfEmpty("tagline", {
        zhTagline: pMsg.tagline ?? "",
        enTagline: "",
        type: "",
        scenes: [],
        competitorDiff: (pDiff as any)?.comparisonHook ?? "",
        story: "",
      });
    }

    if (pTargetUser && typeof pTargetUser === "object") {
      setIfEmpty("audience", {
        primary: (pTargetUser as any).primaryUser ?? "",
        secondary: Array.isArray((pTargetUser as any).useCases)
          ? (pTargetUser as any).useCases.slice(0, 2).join("\n") : "",
        pains: Array.isArray((pTargetUser as any).userPainPoints) ? (pTargetUser as any).userPainPoints : [],
        needs: Array.isArray((pTargetUser as any).useCases) ? (pTargetUser as any).useCases : [],
        mots: [],
      });
    }

    if (pValProp && typeof pValProp === "object") {
      setIfEmpty("value", {
        coreFunctions: Array.isArray((pValProp as any).keyBenefits) ? (pValProp as any).keyBenefits : [],
        features: Array.isArray((pDiff as any)?.keyDifferentiators) ? (pDiff as any).keyDifferentiators : [],
        advantages: [],
        primaryEmotion: (pValProp as any).emotionalHook ?? "",
        personality: "",
        userFeeling: (pValProp as any).emotionalHook ?? "",
      });
      // also fill differentiation so 速查卡 can read seg.differentiation?.summary
      setIfEmpty("differentiation", {
        summary: (pValProp as any).headline ?? "",
        emotional: (pValProp as any).emotionalHook ?? "",
        functional: Array.isArray((pValProp as any).keyBenefits) ? (pValProp as any).keyBenefits : [],
      });
    }

    if (pMktFit && typeof pMktFit === "object") {
      setIfEmpty("competition", {
        competitors: Array.isArray((pMktFit as any).competingProducts)
          ? (pMktFit as any).competingProducts.map((n: any) => ({ name: String(n), position: "" }))
          : [],
        uniqueUsp: (pDiff as any)?.comparisonHook ?? "",
        rareUsp: (pMktFit as any).whitespace ?? "",
        commonUsp: "",
      });
    }

    if (pGtm) {
      setIfEmpty("strategy", {
        positioning: typeof pGtm === "string" ? pGtm : "",
        pricing: "",
        channel: (pMktFit as any)?.marketNeed ?? "",
      });
    }

    return merged;
    } catch (e) {
      console.error("[BrandsPage] positioning normalizer crashed:", e);
      return (rawPositioning && typeof rawPositioning === "object") ? rawPositioning : {};
    }
  })();
  const brandAssets: Record<string, any> = (fullPositioning?._assets ?? {}) as Record<string, any>;

  // ── 視覺卡片板（2026-09-26 CJ「請幫我整理好整個架構」）─────────────────
  // 使用者自己加的視覺卡存在 positioning._visualCards（跟文字頁的 _assetCards
  // 同一個模式，不需要新欄位）。
  const addedVisualCards: string[] = Array.isArray((fullPositioning as any)?._visualCards)
    ? ((fullPositioning as any)._visualCards as any[]).filter((k) => typeof k === "string")
    : [];
  const visualSaveMut = (trpc as any).scope?.savePositioning?.useMutation?.();
  const saveVisualPositioning = (next: Record<string, any>) => {
    const id = (scope?.brandId ?? brandId) as number | null;
    if (!id) return;
    visualSaveMut?.mutate?.({ kind: "brand", id, positioning: next });
  };
  /** 一張卡的內容（_assets[key]）。風格卡存 {text, prompt}，文字卡存 {text}。 */
  const saveBrandAsset = (key: string, value: any) => {
    saveVisualPositioning({
      ...fullPositioning,
      _assets: { ...(fullPositioning._assets ?? {}), [key]: value },
    });
  };
  const addVisualCard = (key: string) => {
    if (addedVisualCards.includes(key)) return;
    saveVisualPositioning({ ...fullPositioning, _visualCards: [...addedVisualCards, key] });
  };
  /**
   * 刪一張視覺卡。內容一起清掉——顯示規則是「有內容的一定看得見」
   * （visualAssets.visibleVisualKeys），只移除 key 的話那張卡會自己回來。
   * 色彩 DNA 與品牌照片不走這裡刪（它們是獨立資料，刪卡不等於刪素材）。
   */
  const deleteVisualCard = (key: string) => {
    const hadContent = !!brandAssets[key];
    const msg = hadContent
      ? (lang === "en" ? "Delete this card? Everything written in it will be removed."
                       : "確定要刪除這張卡片嗎？裡面寫的內容會一起刪掉。")
      : (lang === "en" ? "Remove this card?" : "確定要移除這張卡片嗎？");
    if (!confirm(msg)) return;
    saveVisualPositioning({
      ...fullPositioning,
      _assets: { ...(fullPositioning._assets ?? {}), [key]: null },
      _visualCards: addedVisualCards.filter((k) => k !== key),
    });
  };
  // 色票只是拿來判斷「這張卡有沒有內容」與縮圖，所以讀現成的那一份就好。
  const dnaQ = (trpc as any).brandColors?.getCurrent?.useQuery(
    { brandId: activeBrandIdForLocks ?? 0 },
    { enabled: !!activeBrandIdForLocks, staleTime: 60_000 },
  );
  const dnaSwatches: string[] = Array.isArray(dnaQ?.data?.swatches)
    ? (dnaQ.data.swatches as any[])
        .map((sw) => (typeof sw?.hex === "string" ? sw.hex : ""))
        .filter(Boolean)
    : [];

  // Onboarding nudge: if this brand has no website / socialLinks yet,
  // auto-open Settings → 連結 once. localStorage tracks dismissal so
  // the prompt doesn't bug returning users.
  const connQuery = (trpc as any).brand?.getConnections?.useQuery(
    { brandId: activeBrandIdForLocks ?? 0 },
    { enabled: !!activeBrandIdForLocks, refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const connData = connQuery?.data as { website: string; socialLinks: Record<string,string> } | null | undefined;
  React.useEffect(() => {
    if (!activeBrandIdForLocks || !connData) return;
    const hasWebsite = (connData.website ?? "").trim().length > 0;
    const hasSocial = Object.values(connData.socialLinks ?? {}).some(
      (v) => typeof v === "string" && v.trim().length > 0,
    );

    // 2026-05-11 (CJ feedback「中英夾雜變全中文」):
    // 之前條件是 hasAny — 填了 website 就不再 nudge。但網頁文字往往是
    // 正式中文，跟用戶 FB/IG 真實夾雜風格不同。改成「全空 OR 缺社群」
    // 都 nudge，並用不同訊息對應狀態。
    // 兩個 dismiss key 分開：補完 social 後就不會再跳。
    const stage =
      !hasWebsite && !hasSocial ? "none" :
      hasWebsite && !hasSocial ? "social-missing" :
      null; // 兩個都有 → 不 nudge
    if (!stage) return;

    // 2026-05-13 (CJ「我按了品牌應該直接呈現定位文字知識，現在跳modal」):
    // Auto-opening the settings sheet on landing is too aggressive — the
    // workspace should render cleanly and the connector page is reachable
    // via the gear icon. We keep the nudge logic but it no longer pops the
    // modal automatically. (A passive in-page banner can be added later.)
    void stage; // intentionally unused
    return;
  }, [activeBrandIdForLocks, connData]);
  // Positioning segments live as top-level keys in `positioning` (e.g.
  // positioning.goldenCircle, positioning.tagline...) — written by the
  // pipeline runner. We pass the whole bag to PositioningGrid for preview.
  const positioningSegmentData: Record<string, any> = fullPositioning ?? {};

  // True when at least one positioning segment key has non-empty content.
  // Used to decide whether to show the quick-intake wizard.
  const hasAnyPositioningContent = React.useMemo(() => {
    const SEG_KEYS = [
      "core", "audience", "value", "competition", "strategy",
      "goldenCircle", "tagline", "origin", "values", "differentiation",
      "voice", "goldenCircleRefined", "goldenCircleRefine",
      "taglineCandidates", "taglineCreative",
    ];
    return SEG_KEYS.some(k => {
      const v = positioningSegmentData[k];
      if (!v || typeof v !== "object" || Array.isArray(v)) return false;
      return Object.values(v).some(fv =>
        (typeof fv === "string" && (fv as string).trim().length > 0) ||
        (Array.isArray(fv) && (fv as any[]).length > 0)
      );
    });
  }, [positioningSegmentData]);

  const handleLockToggle = async (tab: "positioning" | "copy" | "visual") => {
    if (!activeBrandIdForLocks) return;
    try {
      const tabName = tab === "positioning"
        ? (lang === "en" ? "Positioning" : "定位")
        : tab === "copy"
          ? (lang === "en" ? "Copy" : "文字")
          : (lang === "en" ? "Visual" : "視覺");
      if (tabLocks[tab]) {
        const msg = lang === "en"
          ? `Unlock "${tabName}"? You'll be able to edit again, and every channel will pick up the latest version.`
          : `確定要解鎖「${tabName}」？解鎖後可以繼續編輯，全平台會用最新版本。`;
        if (!confirm(msg)) return;
        await unlockTabMut?.mutateAsync({ brandId: activeBrandIdForLocks, tab });
      } else {
        const msg = lang === "en"
          ? `Lock "${tabName}"?\nAfter locking:\n· Editor goes read-only (unlock to change)\n· Every channel uses this as the single source of truth\n· All tasks and the 7-Day Publisher show the locked badge\nYou can unlock anytime.`
          : `要鎖定「${tabName}」嗎？\n鎖定後：\n· 編輯欄會變成唯讀（解鎖才能改）\n· 全平台都會用這份為單一真相\n· 所有任務與七日發布台都會看到已鎖定的標示\n隨時可以解鎖。`;
        if (!confirm(msg)) return;
        await lockTabMut?.mutateAsync({ brandId: activeBrandIdForLocks, tab });
      }
      tabLocksQuery.refetch?.();
    } catch (e) {
      console.error("[brands] lock toggle failed:", e);
    }
  };

  // Resolve scope mode — choose-one rule from ScopeBar.
  const scopeMode: "brand" | "product" | "event" | "none" =
    scope?.eventId ? "event"
    : scope?.productId ? "product"
    : scope?.brandId ? "brand"
    : (brandId ? "brand" : "none"); // legacy fallback


  // Pull product/event details when those scopes are active
  const productQuery = (trpc as any).product?.get?.useQuery
    ? (trpc as any).product.get.useQuery(
        { id: scope?.productId ?? 0 },
        { enabled: scopeMode === "product" && !!scope?.productId, refetchOnWindowFocus: false }
      )
    : { data: null };
  const eventQuery = (trpc as any).event?.get?.useQuery
    ? (trpc as any).event.get.useQuery(
        { id: scope?.eventId ?? 0 },
        { enabled: scopeMode === "event" && !!scope?.eventId, refetchOnWindowFocus: false }
      )
    : { data: null };
  // scope.options is the canonical brand list (filtered by userId, same
  // as ScopeBar). Legacy `brands` from listByMember can lag — use this
  // when resolving the active brand name.
  const scopeOptionsQuery = (trpc as any).scope?.options?.useQuery
    ? (trpc as any).scope.options.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: null };
  const scopeBrands = ((scopeOptionsQuery.data as any)?.brands as any[]) ?? brands;

  // 2026-05-08: auto-open onboarding wizard for first-time users (0
  // brands), unless they previously dismissed it.
  React.useEffect(() => {
    if (scopeOptionsQuery?.isLoading) return;
    const dismissedKey = "sowork.onboarding.dismissed";
    if (scopeBrands.length === 0 && !localStorage.getItem(dismissedKey)) {
      setOnboardingOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeBrands.length, scopeOptionsQuery?.isLoading]);

  // Build sub-nav from positioning schema + brand-only asset list.
  // Each segment becomes its own sub-nav entry (id = "seg:<segmentId>"),
  // alongside 速查卡 / brand assets (brand only).
  const segments = scopeMode === "none" ? [] : SCOPE_SEGMENTS[scopeMode];

  // ── Navigation ────────────────────────────────────────────────────────────
  // `cat` URL param drives the large category. After 2026-05-07 restructure,
  // we have 3 top-level tabs: positioning / copy / visual. The 200px left
  // sub-nav was removed — content area now full-bleed with a horizontal
  // tab strip above it. (searchParams/setSearchParams declared at top.)
  const urlCat = searchParams.get("cat") ?? "positioning";
  // 2026-05-07 Path A simplification: 3 main tiles only (定位/文字/知識).
  // "visual" is kept in the type for legacy lock-state code paths, but
  // is no longer exposed as a tile — its contents live in Settings.
  const category: "positioning" | "copy" | "visual" | "knowledge" | "info" | "publish" | "settings" | "products" | "events" | "regulations" | "channels" | "brain" | "persona" | "campaign" =
    urlCat === "copy" ? "copy"
    : urlCat === "knowledge" ? "knowledge"
    : urlCat === "visual" ? "visual"
    : urlCat === "info" ? "info"
    : urlCat === "publish" ? "publish"
    : urlCat === "settings" ? "settings"
    : urlCat === "products" ? "products"
    : urlCat === "events" ? "events"
    : urlCat === "regulations" ? "regulations"
    : urlCat === "channels" ? "channels"
    : urlCat === "brain" ? "brain"
    : urlCat === "persona" ? "persona"
    // 2026-09-25（CJ「應該要在活動的 mission tray 當中，增加這個活動的任務卡」）：
    // 活動的預設落點是宣傳企劃，不是 11 段的得獎 brief（那退成 cat=positioning
    // 的「參獎／提案」進階模式）。
    : urlCat === "campaign" ? "campaign"
    : "positioning";
  // 2026-07-28 (CJ「選活動定位卡片，跑回品牌定位頁面」): this built its
  // next params from the `searchParams` closure instead of the functional
  // updater form. Callers like BrandEntityGrid's onOpen fire
  // goToEntity("event", id) immediately followed by setCategory("positioning")
  // in the same handler — goToEntity uses the safe functional form so its
  // `e=<id>` write always lands on the latest state, but this stale-closure
  // version clobbered it with a snapshot from BEFORE that write, dropping
  // `e` and silently falling back to brand-level positioning. Functional
  // form fixes it for every caller, not just this one site.
  const setCategory = (next: "positioning" | "copy" | "knowledge" | "info" | "visual" | "publish" | "products" | "events" | "regulations" | "channels" | "brain" | "persona") => {
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set("cat", next);
      return nextParams;
    }, { replace: true });
  };

  // Products + events for brand tabs — must be after `category` is declared (TDZ guard)
  const brandProductsQ = (trpc as any).product?.list?.useQuery(
    { brandId: activeBrandIdForLocks ?? 0 },
    { enabled: !!activeBrandIdForLocks && category === "products", refetchOnWindowFocus: false, staleTime: 30_000 },
  );
  const brandEventsQ = (trpc as any).event?.list?.useQuery(
    { brandId: activeBrandIdForLocks ?? 0 },
    { enabled: !!activeBrandIdForLocks && category === "events", refetchOnWindowFocus: false, staleTime: 30_000 },
  );
  const brandProductsList: any[] = brandProductsQ?.data ?? [];
  const brandEventsList: any[] = brandEventsQ?.data ?? [];

  // 2026-09-24（CJ「刪除AI掃描官網的功能」）：這裡原本有「掃描官網自動分析
  // 產品清單」的狀態輪詢、觸發 mutation 與進度輪詢 effect，連同下面四塊
  // banner 一起移除。產品一律由使用者自己新增。

  // Product detail modal
  const [productDetailId, setProductDetailId] = useState<number | null>(null);
  // 2026-10-03：產品卡「上傳定位」開的視窗（PositioningDocPanel 的 product scope）。
  const [productDocId, setProductDocId] = useState<number | null>(null);

  const prodRemoveMut  = (trpc as any).product?.remove?.useMutation?.({ onSuccess: () => brandProductsQ?.refetch?.() });
  const prodStartMut   = (trpc as any).positioningJobs?.start?.useMutation?.();
  const prodInterimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.();

  const evRemoveMut    = (trpc as any).event?.remove?.useMutation?.({ onSuccess: () => brandEventsQ?.refetch?.() });
  const evStartMut     = (trpc as any).positioningJobs?.start?.useMutation?.();
  const evInterimMut   = (trpc as any).positioningJobs?.runInterim?.useMutation?.();

  // 2026-07-24 (CJ「產品按下重新定位時，會沒有反應」): the start mutation
  // fires a BACKGROUND pipeline — with no toast, no running state and no
  // completion refetch the click looked dead and the card stayed stale
  // until a manual page reload. Track running entity ids, poll a batch
  // status query, refetch the grid + toast on completion.
  const [posRunning, setPosRunning] = useState<{ product: number[]; event: number[] }>({ product: [], event: [] });
  const markPosRunning = (kind: "product" | "event", id: number) =>
    setPosRunning((s) => (s[kind].includes(id) ? s : { ...s, [kind]: [...s[kind], id] }));
  const unmarkPosRunning = (kind: "product" | "event", id: number) =>
    setPosRunning((s) => ({ ...s, [kind]: s[kind].filter((x) => x !== id) }));
  const kickReposition = (kind: "product" | "event", id: number, name?: string) => {
    markPosRunning(kind, id);
    showToastGlobal(
      lang === "en"
        ? `Re-positioning started${name ? ` for ${name}` : ""} — the card updates automatically when done.`
        : `已開始重新定位${name ? `「${name}」` : ""}，完成後卡片會自動更新`,
      "success",
    );
    const startMut = kind === "product" ? prodStartMut : evStartMut;
    const interimMut = kind === "product" ? prodInterimMut : evInterimMut;
    startMut?.mutate?.({ entityKind: kind, entityId: id }, {
      onSuccess: (r: any) => {
        if (r && r.ok === false) {
          unmarkPosRunning(kind, id);
          showToastGlobal(lang === "en" ? `Positioning failed to start: ${r.error ?? "unknown"}` : `定位啟動失敗：${r.error ?? "未知原因"}`);
        }
      },
      onError: (e: any) => {
        unmarkPosRunning(kind, id);
        showToastGlobal((typeof e?.message === "string" ? e.message : null) ?? (lang === "en" ? "Positioning failed to start" : "定位啟動失敗"));
      },
    });
    interimMut?.mutate?.({ entityKind: kind, entityId: id });
  };
  const prodPosStatusQ = (trpc as any).positioningJobs?.getStatusBatch?.useQuery(
    { entityKind: "product", entityIds: posRunning.product },
    { enabled: posRunning.product.length > 0, refetchInterval: 4000 },
  );
  const evPosStatusQ = (trpc as any).positioningJobs?.getStatusBatch?.useQuery(
    { entityKind: "event", entityIds: posRunning.event },
    { enabled: posRunning.event.length > 0, refetchInterval: 4000 },
  );
  React.useEffect(() => {
    for (const [kind, q, listQ] of [["product", prodPosStatusQ, brandProductsQ], ["event", evPosStatusQ, brandEventsQ]] as const) {
      const rows: Array<{ entityId: number; status: string }> = q?.data ?? [];
      for (const r of rows) {
        if (r.status === "done" || r.status === "failed") {
          unmarkPosRunning(kind, r.entityId);
          listQ?.refetch?.();
          showToastGlobal(
            r.status === "done"
              ? (lang === "en" ? "Positioning complete" : "定位完成，卡片已更新")
              : (lang === "en" ? "Positioning failed — try again" : "定位失敗，請再試一次"),
            r.status === "done" ? "success" : undefined,
          );
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodPosStatusQ?.data, evPosStatusQ?.data]);
  // progress map for card buttons: id → "3/6"
  const posProgress: Record<string, string> = {};
  for (const [kind, q] of [["product", prodPosStatusQ], ["event", evPosStatusQ]] as const) {
    for (const r of (q?.data ?? []) as Array<{ entityId: number; status: string; currentStep: number; totalSteps: number }>) {
      if (r.status === "running" || r.status === "pending") posProgress[`${kind}:${r.entityId}`] = `${r.currentStep}/${r.totalSteps}`;
    }
  }

  const defaultSection: SectionId =
    category === "visual" ? "asset:all"
    : category === "copy" ? "asset:all"
    : category === "settings" ? "settings"
    : "pos:home";
  const [section, setSection] = useState<SectionId>(defaultSection);
  const derivedCategory = category; // alias for content-area conditions

  // When category changes via URL, reset section to a sensible default
  const prevCatRef = React.useRef(category);
  React.useEffect(() => {
    if (prevCatRef.current !== category) {
      prevCatRef.current = category;
      if (category === "visual" || category === "copy") setSection("asset:all");
      else if (category === "settings") setSection("settings");
      else if (category === "knowledge") setSection("settings");
      else if (category === "publish") setSection("pos:home");
      else                              setSection("pos:home");
    }
  }, [category]);

  // (brand dropdown moved to ShellLayout sidebar)

  // Reset section when scope changes — but respect the ACTIVE category's
  // default. 2026-07-01 (CJ「hero 初始不渲染」bug): this used to hardcode
  // "pos:home", which stomped the "asset:all" initial value during the
  // none→brand scope hydration on direct URL loads like ?cat=visual.
  // category never *changes* in that flow, so the category-change effect
  // above never restored it → BrandPaletteHero + TabActionBar (gated on
  // section === "asset:all") silently didn't render until the user
  // clicked into an asset and back out.
  React.useEffect(() => {
    setSection(
      category === "visual" || category === "copy" ? "asset:all"
      : category === "settings" ? "settings"
      : "pos:home",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMode]);

  // 2026-09-30（CJ「修改後，要怎麼導引回記憶這個頁面」「加一個到記憶的按鈕」）：從「記憶」點欄位
  // 過來時網址帶 focus（`seg:<id>` / `asset:<key>`），直接打開那一段。放在上面兩個重設 section
  // 的 effect 之後，scope 載入完成觸發重設時也會再套回來。
  const memoryFocus = searchParams.get("focus");
  const fromMemory = searchParams.get("from") === "memory" && category !== "brain";
  React.useEffect(() => {
    if (!memoryFocus) return;
    // 只在它所屬的頁套用：切到別的分頁時網址還留著 focus，不能在那裡打開錯的段落。
    const fits = memoryFocus.startsWith("seg:") ? category === "positioning"
      : memoryFocus.startsWith("asset:") ? category === "copy" || category === "visual" : false;
    if (fits) setSection(memoryFocus);
  }, [memoryFocus, category, scopeMode]);
  const backToMemory = () => setSearchParams(() => {
    const next = new URLSearchParams();
    if (activeBrandIdForLocks) next.set("b", String(activeBrandIdForLocks));
    next.set("cat", "brain");
    const mem = searchParams.get("mem");
    if (mem) next.set("mem", mem);
    return next;
  });

  // When scope switches to event/product, knowledge/visual tiles
  // aren't shown — force category back to positioning so the content
  // area doesn't render a hidden tab's contents. CJ 2026-05-13.
  // NOTE: "copy" is intentionally NOT reset — product has 行銷指引 (marketing)
  // and event has 創意與內容規範 (guidelines) as their own 文字 content.
  React.useEffect(() => {
    if ((scopeMode === "event" || scopeMode === "product") &&
        (category === "knowledge" || category === "visual")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("cat", "positioning");
      setSearchParams(nextParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMode, category]);

  const currentBrand = useMemo(
    () => scopeBrands.find((b: any) => b.id === (scope?.brandId ?? brandId)) ?? null,
    [scopeBrands, scope?.brandId, brandId]
  );
  const scopeName =
    scopeMode === "product" ? ((productQuery.data as any)?.name ?? (lang === "en" ? "(Select a product above)" : "（請於右上選擇產品）"))
    : scopeMode === "event" ? ((eventQuery.data as any)?.name ?? (lang === "en" ? "(Select an event above)" : "（請於右上選擇活動）"))
    : (currentBrand?.name ?? (lang === "en" ? "(Select a brand above)" : "（請於右上選擇品牌）"));

  // 路徑列（見 lib/strategyCrumbs.ts）：名稱都從這一頁已有的資料查，不另打 API。
  const crumbs = useMemo(() => {
    const en = lang === "en";
    const segId = section.startsWith("seg:") ? section.slice(4) : null;
    const seg = segId && scopeMode !== "none" ? SCOPE_SEGMENTS[scopeMode].find((x) => x.id === segId) : null;
    const assetKey = section.startsWith("asset:") ? section.slice(6) : null;
    const copySpec = assetKey ? copySpecOf(assetKey) : null;
    const visSpec = assetKey ? visualSpecOf(assetKey) : null;
    return strategyCrumbs({
      en, brandName: currentBrand?.name ?? null, scopeMode,
      entityName: scopeMode === "product" ? (productQuery.data as any)?.name ?? null
        : scopeMode === "event" ? (eventQuery.data as any)?.name ?? null : null,
      category, section,
      segmentTitle: seg ? ((en && seg.titleEn) || seg.title) : null,
      assetLabel: copySpec ? (en ? copySpec.labelEn : copySpec.labelZh)
        : visSpec ? (en ? visSpec.labelEn : visSpec.labelZh) : assetKey,
    });
  }, [lang, currentBrand?.name, scopeMode, productQuery.data, eventQuery.data, category, section]);
  const goCrumb = (t: CrumbTarget) => {
    if ("href" in t) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("cat", t.cat);
      // focus 只在從記憶點過來的那一下有用；留著會讓切頁後又自動打開同一段。
      next.delete("focus");
      if (t.scope === "brand") { next.delete("p"); next.delete("e"); }
      return next;
    }, { replace: true });
    if (t.section) setSection(t.section);
  };



  // Brand asset tiles (visuals — non-positioning).
  // Per CJ: only logo / colors / fonts remain.

  // (tiles and onTileClick replaced by category === "visual" inline rendering)

  // ── Pipeline (research mode) — scope-aware (brand 14 / product 5 / event 11) ─
  const pipelineSteps: PipelineStepSpec[] = pipelineFor(scopeMode);

  // Read positioning at top level (deduped by React Query — same key as
  // PositioningEditor's query). Used to surface SMP value in the
  // checkpoint card without requiring user to click into the SMP segment.
  const topScopeActive = (trpc as any).scope?.active?.useQuery
    ? (trpc as any).scope.active.useQuery(
        { brandId: scope?.brandId, productId: scope?.productId, eventId: scope?.eventId },
        { enabled: scopeMode !== "none", refetchOnWindowFocus: false, staleTime: 30_000 },
      )
    : { data: null };
  const topPositioning = (topScopeActive.data as any)?.[scopeMode]?.positioning ?? null;
  const smpData = topPositioning?.smp ?? null;

  // Persist pipeline state per (kind, id) so page refresh resumes mid-run.
  const pipelineKey = scopeMode !== "none" && (scope?.brandId ?? scope?.productId ?? scope?.eventId)
    ? `sowork.pipeline.${scopeMode}.${scope?.brandId ?? scope?.productId ?? scope?.eventId}`
    : null;
  const [pipeline, setPipeline] = useState<PipelineState>(() => {
    if (!pipelineKey) return { status: "idle", cursor: 0, completed: [] };
    try {
      const raw = localStorage.getItem(pipelineKey);
      if (raw) {
        const saved = JSON.parse(raw);
        // Auto-resume if previous run was paused; running runs become paused
        // (user must hit ▶ continue to actually fire) so we don't surprise
        // them with an LLM call on cold load.
        if (saved && (saved.status === "running" || saved.status === "paused")) {
          return { status: "paused", cursor: saved.cursor ?? 0, completed: saved.completed ?? [] };
        }
      }
    } catch { /* ignore */ }
    return { status: "idle", cursor: 0, completed: [] };
  });
  React.useEffect(() => {
    if (!pipelineKey) return;
    try {
      if (pipeline.status === "done" || pipeline.status === "idle") {
        localStorage.removeItem(pipelineKey);
      } else {
        localStorage.setItem(pipelineKey, JSON.stringify(pipeline));
      }
    } catch { /* ignore */ }
  }, [pipelineKey, pipeline]);
  // Reset pipeline state when scope changes (user picks a different brand)
  const lastKeyRef = React.useRef<string | null>(pipelineKey);
  React.useEffect(() => {
    if (lastKeyRef.current === pipelineKey) return;
    lastKeyRef.current = pipelineKey;
    if (!pipelineKey) {
      setPipeline({ status: "idle", cursor: 0, completed: [] });
      return;
    }
    try {
      const raw = localStorage.getItem(pipelineKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.status === "running" || saved?.status === "paused") {
          setPipeline({ status: "paused", cursor: saved.cursor ?? 0, completed: saved.completed ?? [] });
          return;
        }
      }
    } catch { /* ignore */ }
    setPipeline({ status: "idle", cursor: 0, completed: [] });
  }, [pipelineKey]);

  const targetId =
    scopeMode === "brand" ? (scope?.brandId ?? brandId)
    : scopeMode === "product" ? scope?.productId
    : scopeMode === "event" ? scope?.eventId
    : null;

  // 2026-09-23 (CJ「請將自訂卡片加到品牌頁面」): 自訂卡片（從上傳/貼上的定位文件
  // 建立、套不進固定 10/6/11 個 schema 欄位的卡片，例如「品牌願景」）原本只在
  // 「我的定位文件」子頁面看得到。這裡另外查一次 coverage，把 customSegments
  // 餵給 PositioningGrid，讓它們跟固定欄位卡片一起出現在主要總覽。
  const positioningCoverageQuery = (trpc as any).positioningDocs?.coverage?.useQuery
    ? (trpc as any).positioningDocs.coverage.useQuery(
        { scope: scopeMode === "none" ? "brand" : scopeMode, scopeId: targetId ?? 0 },
        { enabled: !!targetId && scopeMode !== "none", refetchOnWindowFocus: false }
      )
    : { data: null, refetch: () => {} };
  const customPositioningSegments: { id: string; title: string; fields: { key: string; label: string; value: string }[] }[] =
    positioningCoverageQuery.data?.customSegments ?? [];
  const removeCustomSegmentMut = (trpc as any).positioningDocs?.removeCustomSegment?.useMutation
    ? (trpc as any).positioningDocs.removeCustomSegment.useMutation({
        onSuccess: () => positioningCoverageQuery.refetch?.(),
      })
    : null;
  // 2026-09-24（CJ「按下新增卡片時，只是要她編輯該卡片的標題和內容」）：
  // 自訂卡片的編輯器開在這一層——scopeMode / targetId / coverage 的 refetch
  // 都在這裡，編輯器本身只管一張卡。null = 沒開。
  const [editingCard, setEditingCard] = React.useState<EditableCard | null>(null);
  // 2026-10-03：通路角色（每個平台各自的定位）— 開哪一個平台的編輯視窗。null = 沒開。
  const [editingChannel, setEditingChannel] = React.useState<ChannelId | null>(null);

  const utils = (trpc as any).useUtils?.() ?? null;

  // Phase 6 — call pipeline.runStep tRPC, server hits OpenClaw gateway
  // (web_search) until budget met, persists conclusion + sources scoped
  // to the active id, returns { thinking, conclusion, sources }. Client
  // shows the returned thinking via ThinkingOverlay typewriter, then
  // advances. Mock fallback remains if mutation isn't available yet.
  const runStepMutation = (trpc as any).pipeline?.runStep?.useMutation
    ? (trpc as any).pipeline.runStep.useMutation({
        // Invalidate as soon as the server has written; the segment editor's
        // draft will refresh while the typewriter is still animating, so by
        // the time it finishes the user sees the fields already populated.
        onSuccess: () => utils?.scope?.active?.invalidate?.(),
      })
    : null;
  const [liveThinking, setLiveThinking] = useState<string | null>(null);
  const [thinkingPhase, setThinkingPhase] = useState<"loading" | "typing" | "writing">("loading");
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);

  React.useEffect(() => {
    if (pipeline.status !== "running") return;
    const step = pipelineSteps[pipeline.cursor];
    if (!step) {
      setPipeline((p) => ({ ...p, status: "done" }));
      setLiveThinking(null);
      return;
    }
    // 2026-05-11 (CJ「直接在第一層顯現」): keep user on pos:home so the
    // editorial PipelineThinkingPanel stays visible. Only auto-jump to
    // the segment target if user has already drilled into a segment
    // (i.e., they explicitly left the home grid).
    setSection((curr) => (curr === "pos:home" ? "pos:home" : step.segmentTarget));
    setLiveThinking(null); // clear previous

    let cancelled = false;
    const advance = () => {
      if (cancelled) return;
      utils?.scope?.active?.invalidate?.();
      // If single-segment auto-fill: halt after this step.
      if (autoFillStopAt !== null && pipeline.cursor === autoFillStopAt) {
        setPipeline((p) => ({
          ...p,
          status: "done",
          completed: [...p.completed, step.id],
        }));
        setAutoFillStopAt(null);
        setLiveThinking(null);
        return;
      }
      // SMP checkpoint gate (event scope only). Server marks the segment
      // with _wizardMeta.smp.requiresUserApproval=true after writing; we
      // pause here so user must press 繼續 before steps 7-11 fire.
      if (scopeMode === "event" && step.segmentId === "smp") {
        setPipeline((p) => ({
          ...p,
          status: "paused",
          completed: [...p.completed, step.id],
        }));
        setSmpCheckpointActive(true);
        setLiveThinking(null);
        return;
      }
      setPipeline((p) => ({
        ...p,
        cursor: p.cursor + 1,
        completed: [...p.completed, step.id],
      }));
      setLiveThinking(null);
    };

    const runReal = async () => {
      if (!targetId || scopeMode === "none" || !runStepMutation) return null;
      // 2026-05-11 (CJ「你好中文按了品牌定位後，一直停留在 0/14」):
      // Race the mutation against a 90s hard timeout so a hung LLM call
      // never wedges the whole pipeline. On timeout we mark the step
      // failed and let the loop advance with mock thinking.
      const HARD_TIMEOUT_MS = 90_000;
      try {
        const res: any = await Promise.race([
          runStepMutation.mutateAsync({
            kind: scopeMode as "brand" | "product" | "event",
            id: targetId,
            stepId: step.id,
            segmentId: step.segmentId,
            agent: step.agent,
            title: step.title,
            budget: step.researchBudget,
            systemHint: step.promptTemplate, // CJ-spec prompt per step
            schemaHint: step.mockConclusion, // canonical JSON shape for this segment
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`step ${step.id} timed out after ${HARD_TIMEOUT_MS / 1000}s`)), HARD_TIMEOUT_MS),
          ),
        ]);
        // Track empty conclusion as a failure even if the request succeeded —
        // 2026-04-29 CJ caught: product step 3-5 silently empty after step 2.
        if (!res?.conclusion || Object.keys(res.conclusion).length === 0) {
          setFailedStepIds((s) => Array.from(new Set([...s, step.id])));
          // eslint-disable-next-line no-console
          console.warn(`[pipeline] step ${step.id} (${step.segmentId}) returned empty conclusion — segment will be blank. Run "重跑此步" to retry.`);
        }
        return res?.thinking ?? null;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[pipeline] runStep failed/timed out, falling back to mock:", e);
        setFailedStepIds((s) => Array.from(new Set([...s, step.id])));
        return null;
      }
    };

    (async () => {
      // Three-phase UX: loading → typing → writing. CJ caught timing bug:
      // pipeline advanced before fields visibly populated. Extended the
      // "fields visible" hold to 5s + double-invalidate to force refetch.
      setThinkingStartedAt(Date.now());
      setThinkingPhase("loading");
      setLiveThinking("");

      const realThinking = await runReal();
      if (cancelled) return;
      // Force a refetch right after server write so the draft/query is
      // already updated by the time typing finishes.
      utils?.scope?.active?.invalidate?.();

      const text = realThinking ?? stepThinkingText(step) ?? "";
      setThinkingPhase("typing");
      setLiveThinking(text);

      const cps = 35;
      const typingMs = (text.length / cps) * 1000;
      setTimeout(() => {
        if (cancelled) return;
        setThinkingPhase("writing");
        // Re-invalidate at the writing handoff so any in-flight render gets
        // the latest server state before the overlay fades.
        utils?.scope?.active?.invalidate?.();
        setTimeout(() => {
          if (cancelled) return;
          setLiveThinking(null); // hide overlay → fields visible
          // Long hold so user actually reads the populated fields
          // (CJ feedback: 跳太快). 5 seconds gives query refetch + render
          // time + reading time for the average user.
          setTimeout(() => {
            if (cancelled) return;
            advance();
          }, 5000);
        }, 1500);
      }, typingMs + 300);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.status, pipeline.cursor]);

  const startPipeline = () => {
    setFailedStepIds([]); // reset error trail on fresh start
    setSmpCheckpointActive(false); // clear stale SMP gate
    setPipeline({ status: "running", cursor: 0, completed: [] });
  };
  // SMP checkpoint resume — fired when user presses 繼續 on the gate card.
  // Resume = clear gate flag + advance cursor + flip pipeline back to running.
  const resumeAfterSmp = () => {
    setSmpCheckpointActive(false);
    setPipeline((p) => ({
      ...p,
      status: "running",
      cursor: p.cursor + 1,
    }));
  };
  const pausePipeline  = () => setPipeline((p) => ({ ...p, status: "paused" }));
  const resumePipeline = () => setPipeline((p) => ({ ...p, status: "running" }));
  const skipPipeline   = () => {
    const step = pipelineSteps[pipeline.cursor];
    if (!step) return;
    setPipeline((p) => ({
      ...p,
      cursor: p.cursor + 1,
      completed: [...p.completed, step.id],
    }));
  };
  const stopPipeline = () => setPipeline({ status: "idle", cursor: 0, completed: [] });

  // "自動填寫" — single-segment auto-fill. Track a stop-cursor so the
  // runner halts after the requested segment finishes (vs the full
  // Wizard which runs all 14 steps).
  const [autoFillStopAt, setAutoFillStopAt] = useState<number | null>(null);
  // Tracks which step ids failed (LLM error or empty conclusion). Surfaces
  // as a banner so user can spot which segments need rerun. Cleared on
  // pipeline restart.
  const [failedStepIds, setFailedStepIds] = useState<number[]>([]);
  // SMP checkpoint state — when event scope's SMP step completes, server
  // marks _wizardMeta.smp.requiresUserApproval=true. We pause the runner
  // here and surface a confirmation card; user clicks 繼續 to resume.
  // Per CJ direction 2026-04-29: SMP is the campaign's highest principle,
  // user must commit before steps 7-11 (messaging/creative/...) fire.
  const [smpCheckpointActive, setSmpCheckpointActive] = useState(false);

  // ── Auto background positioning (fires when entity has no positioning) ──────
  // Phase: "idle" → "interim-running" → "interim-done" → "full-done"
  // No user interaction required — triggers automatically on mount/scope change.
  const [autoPosPhase, setAutoPosPhase] = useState<"idle"|"interim-running"|"interim-done"|"full-done">("idle");
  const runInterimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.();
  const startJobMut   = (trpc as any).positioningJobs?.start?.useMutation?.();
  // Poll job status once interim is done (every 15s until full pipeline finishes)
  const autoPosJobStatus = (trpc as any).positioningJobs?.getStatus?.useQuery(
    { entityKind: (scopeMode !== "none" ? scopeMode : "brand") as "brand"|"product"|"event", entityId: targetId ?? 0 },
    {
      enabled: autoPosPhase === "interim-done" && !!targetId && scopeMode !== "none",
      refetchInterval: autoPosPhase === "interim-done" ? 15_000 : false,
    }
  );
  // Advance to "full-done" when job status flips to "done"
  React.useEffect(() => {
    if (autoPosPhase === "interim-done" && autoPosJobStatus?.data?.status === "done") {
      setAutoPosPhase("full-done");
      utils?.scope?.active?.invalidate?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPosJobStatus?.data?.status, autoPosPhase]);

  // Auto-trigger: when scope becomes active and positioning is empty,
  // run interim (≤12s) immediately then fire full pipeline in background.
  const _autoPosFired = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = `${scopeMode}:${targetId ?? "null"}`;
    // Reset phase whenever scope changes
    if (_autoPosFired.current !== key) {
      _autoPosFired.current = null;
      setAutoPosPhase("idle");
    }
    // 2026-08-21 (CJ「有推導過的品牌，解鎖時不用再觸發新的推導」/「他一直
    // 不斷地重新推導」): scopeActiveQuery hasn't necessarily resolved yet on
    // first mount/scope-change — until it does, `fullPositioning` (and so
    // `hasAnyPositioningContent`) falls back to `{}`, making an ALREADY-
    // positioned brand look empty for one render. Without this guard the
    // effect fired a full pipeline right then (fire-and-forget, so the
    // later re-run with real data couldn't undo it) — every fresh page
    // load/scope switch for that brand could silently re-derive and
    // overwrite manually-finalized content. Mirrors the guard
    // PlatformTaskPage.tsx already has for product/event scope.
    if (scopeActiveQuery?.isLoading || !scopeActiveQuery?.data) return;
    // Guard: only fire once per (scopeMode, targetId), skip if already has content
    if (
      _autoPosFired.current === key ||
      scopeMode === "none" ||
      !targetId ||
      hasAnyPositioningContent ||
      pipeline.status !== "idle" ||
      !runInterimMut || !startJobMut
    ) return;
    // Mark as fired BEFORE the async call so concurrent renders don't double-fire
    _autoPosFired.current = key;
    setAutoPosPhase("interim-running");

    (async () => {
      // 1. Fire full pipeline fire-and-forget (background, takes minutes)
      try {
        startJobMut.mutate?.({
          entityKind: scopeMode as "brand"|"product"|"event",
          entityId: targetId,
        });
      } catch { /* non-fatal */ }
      // 2. Run interim synchronously (≤12s) — writes positioning._interim to DB
      //    which loadInterimPositioningBlock() already reads for all content tasks
      try {
        await runInterimMut.mutateAsync?.({
          entityKind: scopeMode as "brand"|"product"|"event",
          entityId: targetId,
        });
      } catch { /* non-fatal */ }
      setAutoPosPhase("interim-done");
      // Invalidate so the strategist bar / speed card pick up the new _interim data
      utils?.scope?.active?.invalidate?.();
    })();
    // scopeActiveQuery?.data is in deps so this re-evaluates once loading
    // resolves — without it, a genuinely-empty brand whose
    // hasAnyPositioningContent reads `false` both before and after load
    // would never re-fire (React sees no dependency change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMode, targetId, hasAnyPositioningContent, pipeline.status, scopeActiveQuery?.isLoading, scopeActiveQuery?.data]);

  // 2026-07-28 (CJ「視覺頁沒有全自動填寫按鈕」): one-shot LLM draft for the
  // visual tab's text/style asset cards (視覺規範/圖像風格/圖示風格/圖表
  // 風格/排版規範/字型/色票建議). Server only fills genuinely-empty keys
  // and tags results `aiSuggested: true` — safe to press again later
  // (no-ops on anything already filled).
  const autoFillVisualMut = (trpc as any).brand?.autoFillVisualAssets?.useMutation?.();
  const [visualAutoFillBusy, setVisualAutoFillBusy] = useState(false);
  const [visualAutoFillNote, setVisualAutoFillNote] = useState<string | null>(null);
  const ASSET_LABEL_ZH: Record<string, string> = {
    guidelines: "視覺規範", imagery_style: "圖像風格", icon_style: "圖示風格",
    chart_style: "圖表風格", layout_rules: "排版規範", fonts: "字型建議", colors: "色票建議",
  };
  const ASSET_LABEL_EN: Record<string, string> = {
    guidelines: "Guidelines", imagery_style: "Imagery style", icon_style: "Icon style",
    chart_style: "Chart style", layout_rules: "Layout rules", fonts: "Fonts", colors: "Colors",
  };
  const runVisualAutoFill = async () => {
    if (!activeBrandIdForLocks || !autoFillVisualMut) return;
    setVisualAutoFillBusy(true);
    setVisualAutoFillNote(null);
    try {
      const res = await autoFillVisualMut.mutateAsync({ brandId: activeBrandIdForLocks });
      const labels = (res?.filled ?? []).map((k: string) => (lang === "en" ? ASSET_LABEL_EN[k] : ASSET_LABEL_ZH[k]) ?? k);
      setVisualAutoFillNote(
        labels.length > 0
          ? (lang === "en" ? `AI drafted: ${labels.join(", ")} — review and edit each card.` : `已為你草擬：${labels.join("、")} — 請逐一確認並調整。`)
          : (lang === "en" ? "Everything fillable already has content — nothing to draft." : "可自動填寫的欄位都已經有內容了，沒有需要草擬的項目。")
      );
      utils?.scope?.active?.invalidate?.();
    } catch (e: any) {
      setVisualAutoFillNote(lang === "en" ? `Failed: ${e?.message ?? e}` : `失敗：${e?.message ?? e}`);
    } finally {
      setVisualAutoFillBusy(false);
    }
  };

  const runSegmentAutoFill = (segmentId: string) => {
    if (scopeMode === "none" || pipelineSteps.length === 0) return;
    const targetIdx = pipelineSteps.findIndex((s) => s.segmentId === segmentId);
    if (targetIdx < 0) return;
    setAutoFillStopAt(targetIdx);
    setPipeline({
      status: "running",
      cursor: targetIdx,
      completed: pipelineSteps.slice(0, targetIdx).map((s) => s.id),
    });
  };

  const pipelineThinking =
    pipeline.status === "running" && pipelineSteps[pipeline.cursor] && liveThinking !== null
      ? {
          segmentTarget: pipelineSteps[pipeline.cursor]!.segmentTarget,
          text: liveThinking,
          phase: thinkingPhase,
          startedAt: thinkingStartedAt,
          stepNum: pipeline.cursor + 1,
          stepTotal: pipelineSteps.length,
          stepTitle: stepTitleText(pipelineSteps[pipeline.cursor]!),
        }
      : null;

  // Per-tab completion state — drives the action button label
  // ("開始___" vs "重新___") and the empty-state hint.
  const COPY_KEYS_FOR_COMPLETION: AssetKey[] = [
    "voice", "voice_principles",
    "preferred_terms", "banned_words", "term_substitutions",
    "branded_terms", "product_naming", "abbreviations",
    "cta_library", "hook_library", "templates_copy",
  ];
  const VISUAL_KEYS_FOR_COMPLETION: AssetKey[] = [
    "logo", "colors", "fonts", "photos", "guidelines", "templates",
    "imagery_style", "icon_style", "chart_style", "layout_rules",
  ];
  const hasAnyAsset = (keys: AssetKey[]) => keys.some((k) => {
    const v = brandAssets[k];
    if (!v || typeof v !== "object") return false;
    if (typeof v.text === "string" && v.text.trim()) return true;
    if (typeof v.links === "string" && v.links.trim()) return true;
    if (Array.isArray(v.items) && v.items.some((x: any) => String(x).trim())) return true;
    if (Array.isArray(v.pairs) && v.pairs.some((p: any) => p?.from && p?.to)) return true;
    if (Array.isArray(v.list) && v.list.length > 0) return true;
    if (Array.isArray(v.urls) && v.urls.length > 0) return true;
    if (typeof v.primaryUrl === "string" && v.primaryUrl.trim()) return true;
    if (typeof v.primary === "string" && v.primary.trim()) return true;
    return false;
  });
  const tabHasContent = {
    positioning: pipeline.status === "done" || pipeline.status === "running" || pipeline.status === "paused"
      || Object.keys(fullPositioning ?? {}).some((k) => k !== "_assets" && fullPositioning?.[k]),
    copy:   hasAnyAsset(COPY_KEYS_FOR_COMPLETION),
    visual: hasAnyAsset(VISUAL_KEYS_FOR_COMPLETION),
  };
  // Action handler for the primary button — 文字 just navigates to the
  // first asset card (still fully manual); 定位 fires the real pipeline;
  // 視覺 now fires the AI draft pass (2026-07-28) and stays on the grid so
  // the result note + freshly-filled cards are visible immediately.
  const handleTabAction = (tab: "positioning" | "copy" | "visual") => {
    if (tabLocks[tab]) return; // locked guard (safety; button also disabled)
    if (tab === "positioning") { startPipeline(); return; }
    if (tab === "copy")        { setSection("asset:voice"); return; }
    if (tab === "visual")      { void runVisualAutoFill(); return; }
  };

  // 2026-09-30（CJ「我按了上傳資料後，上方的 chips 不見了」）：工具列原本只畫在定位總覽
  // （section === "pos:home"），點「上傳定位資料」切到 section="doc" 就整排消失。抽出來讓兩頁共用，
  // 在上傳頁「上傳定位資料」是選中的那顆，點「定位資料／策略監測」會回到總覽。上傳頁不放
  // 「重新套用定位法」——9/23 CJ 已說過那一頁不要同時推「照我的來」和「AI 幫你分析」兩條路。
  const positioningToolbar = (
    (pipeline.status === "idle" || pipeline.status === "done") && scopeMode !== "none" && (
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {/* 2026-09-30（CJ「在活動頁籤上，又找不到入口了」）：活動定位頁以前
            沒有任何一條路通往這檔活動的宣傳企劃。 */}
        {scopeMode === "event" && scope?.eventId && (
          <StrategyToolIcon
            active
            onClick={() => setSearchParams((prev) => {
              const sp = new URLSearchParams(prev);
              sp.set("cat", "campaign");
              return sp;
            })}
            icon={faBullhorn}
            label={lang === "en" ? "Campaign plan →" : "宣傳企劃 →"}
            title={lang === "en" ? "Open this campaign's promotion plan" : "打開這檔活動的宣傳企劃"}
          />
        )}
        {scopeMode === "brand" && activeBrandIdForLocks && (
          <>
            <StrategyToolIcon
              active={section === "doc" || (section === "pos:home" && activeStrategyTool === "positioning")}
              onClick={() => { switchStrategyTool("positioning"); setSection("pos:home"); }}
              icon={faTableList}
              label={lang === "en" ? "Positioning" : "定位資料"}
              title={lang === "en" ? "The positioning you've filled in so far" : "目前填寫好的定位資料"}
            />
            <StrategyToolIcon
              active={section === "pos:home" && activeStrategyTool === "monitor"}
              onClick={() => { switchStrategyTool("monitor"); setSection("pos:home"); }}
              icon={faSatelliteDish}
              label={lang === "en" ? "Strategy Monitoring" : "策略監測"}
              count={monitorUnread}
              title={monitorUnread > 0
                ? (lang === "en" ? `${monitorUnread} new alert${monitorUnread === 1 ? "" : "s"}` : `${monitorUnread} 則新情報還沒看`)
                : undefined}
            />
          </>
        )}
        {/* 2026-09-30（CJ「上傳定位資料，是只有在定位資料的頁面才需要出現的，用戶可以使用 SoWork
            定位或是自己上傳定位資料，我想要做得像是策略監測右上方的 agent 一樣的呈現方式…就是兩個
            按鈕的選項」）：「上傳定位資料」從 chip 列移到右側，跟「品牌定位總監＋SoWork 定位法」並列
            成二選一。只在定位資料總覽出現（策略監測、上傳頁都不顯示）。 */}
        {pipeline.status === "idle" && section !== "doc" && !(scopeMode === "brand" && activeStrategyTool === "monitor") && (
          <div className="ml-auto flex items-start gap-3">
            <button
              type="button"
              onClick={() => setSection("doc" as any)}
              aria-label={lang === "en" ? "Upload your own positioning" : "自己上傳定位資料"}
              // 格式以 PositioningDocPanel 的 ACCEPT 為準（.docx/.pptx/.pdf/.md/.txt/.html）＋貼對話文字。
              title={lang === "en"
                ? "Upload your own positioning doc (Word / PPT / PDF / Markdown / txt / html) — or paste a ChatGPT conversation"
                : "上傳你自己的定位文件（Word / PPT / PDF / Markdown / txt / html），或直接貼 ChatGPT 對話文字"}
              className="shrink-0 flex flex-col items-center gap-1 group"
            >
              <span className="block rounded-full p-[3px] ring-[3px] ring-neutral-300 transition group-hover:ring-neutral-900 group-hover:scale-105 group-active:scale-95">
                <span className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
                  <FontAwesomeIcon icon={faFileArrowUp} style={{ fontSize: 18 }} />
                </span>
              </span>
              <span className="flex flex-col items-center leading-tight">
                <span className="text-[12px] font-semibold text-neutral-900">{lang === "en" ? "Your own" : "自己上傳"}</span>
                <span className="text-[11px] font-semibold text-neutral-500">{lang === "en" ? "Upload doc" : "定位資料"}</span>
              </span>
            </button>
            <span className="mt-6 text-[11px] text-neutral-400">{lang === "en" ? "or" : "或"}</span>
            <PositioningTopRow
              // 2026-05-13 (CJ「按了套用活動定位框架時，出現Event not found」):
              // pass the scope-aware entity id, not the brand id.
              brandId={targetId as number | null}
              directorBrandId={activeBrandIdForLocks}
              scopeMode={scopeMode}
              locked={!!tabLocks.positioning}
            />
          </div>
        )}
      </div>
    )
  );

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex flex-col">
      {/* 2026-05-30 (CJ「modal 移除，功能全進主工作區」):
          BrandSettingsSheet modal removed. 平台授權 is now a full tab in
          the main workspace. 危險區 remains inside 基本資料. */}

      {/* 2026-05-13 (CJ「建立好品牌後我點選左側品牌會是空白畫面」):
          when scope just changed to a brand that hasn't landed in
          scopeBrands yet (cache lag right after create), neither the
          empty-state nor the hero branch was rendering visible content
          for this newly-picked brand — show a loading skeleton instead
          of falling through to a blank page. */}
      {scopeBrands.length > 0 &&
        scope?.brandId &&
        !scopeBrands.some((b: any) => b.id === scope.brandId) && (
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="text-center text-default-500 text-sm">
              <div className="inline-block w-5 h-5 border-2 border-default-300 border-t-default-700 rounded-full animate-spin mb-3" />
              <p>{lang === "en" ? "Loading brand…" : "載入品牌中…"}</p>
            </div>
          </div>
        )}

      {/* 2026-05-08: empty state — first-time user has zero brands.
          Auto-opens the BrandOnboardingWizard (4-step guided flow).
          Behind the wizard we keep a soft welcome screen so the page
          doesn't look broken if user dismisses the wizard mid-way. */}
      {scopeBrands.length === 0 && (
        <>
          <BrandOnboardingWizard
            isOpen={onboardingOpen}
            onClose={() => {
              setOnboardingOpen(false);
              try { localStorage.setItem("sowork.onboarding.dismissed", "1"); } catch {}
            }}
            onComplete={(createdBrandId?: number) => {
              setOnboardingOpen(false);
              try { localStorage.setItem("sowork.onboarding.dismissed", "1"); } catch {}
              utils.scope?.options?.invalidate?.();
              utils.brand?.listByMember?.invalidate?.();
              // 2026-05-13 (CJ「建立好品牌後我點選左側品牌會是空白畫面」):
              // wizard previously only navigated to /brands?b=<id> without
              // setting scope, so the page mounted with scope.brandId=null
              // and the user had to manually click the brand pill again.
              // Hydrate scope immediately so the editor renders directly.
              if (createdBrandId) {
                setBrandId(createdBrandId);
                setScope({ brandId: createdBrandId, productId: null, eventId: null });
              }
            }}
          />
          {/* 2026-05-10 (CJ「4A 代理商專業感, 不要彩色」): empty state
              redesigned for B&W Notion discipline. No gradient. No
              decorative emblem. Editorial typography hierarchy. */}
          <div className="min-h-[60vh] flex items-center justify-center px-6">
            <div className="max-w-[440px] text-left">
              <h1 className="text-3xl font-bold text-neutral-900 mb-6 leading-tight">
                {lang === "en" ? "Set up your first brand" : "建立你的第一個品牌"}
              </h1>
              <button
                onClick={() => setOnboardingOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 transition"
              >
                {lang === "en" ? "Start setup" : "開始建立品牌"}
                <FontAwesomeIcon icon={faPlus} className="text-xs" />
              </button>
              <p className="text-xs text-neutral-600 mt-4">
                {lang === "en" ? "About 2 min · pause anytime" : "預計 2 分鐘完成 · 過程中可隨時暫停"}
              </p>
            </div>
          </div>
        </>
      )}

      {/* ─── Hero — /30s-style centered axis (CJ feedback 2026-05-07) ───
          eyebrow → title → stats → message bar → tiles → kicker.
          測試 / 定案 chips live in the kicker row, NOT in the bar. */}
      {scopeBrands.length > 0 &&
       (!scope?.brandId || scopeBrands.some((b: any) => b.id === scope.brandId)) && (
      <div className="relative pt-6 pb-6 px-6 text-center">
        {/* 2026-09-30：原本這裡的「← 所有品牌」併進內容區頂端的路徑列（見 strategyCrumbs）。 */}
        {/* 2026-05-30: gear icon removed — 平台授權 is now a main workspace tab */}
        {/* 2026-05-10 (CJ「4A 代理商專業感, B&W」): hero redesigned.
            Removed gradient emblem + gradient title. Editorial
            typography: tiny eyebrow, large bold title, subtle stats. */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-[1100px] mx-auto">
          {/* 2026-09-23 (CJ「header太亂了。金安德森香氛留大標題就好」)：拿掉
              「BRAND」眉標（本來就寫死不分 brand/product/event，產品頁看了
              也是「BRAND」，本身還算是個小 bug）跟旁邊的「方法論」小 badge
              ——說明文字（SoWork 品牌定位法／14 步定位…）沒有不見，搬進
              策略總監的系統提示詞了（見 strategistChatRouter.ts），使用者
              直接問策略總監就有，不用再靠這裡一顆 hover 才看得到的按鈕。
              現在只剩最單純的大標題。 */}
          {/* 2026-09-29 (CJ「定案跟鎖定定位其實是相同功能，只留鎖定」→「在品牌名和標語的
              右側」→「LOCK ONLY」)：原本標題下的「定案」chip 與內容上方整條「定位
              尚未鎖定／鎖定定位」橫列是同一件事兩個入口，合併成標題區右側一顆手繪
              鎖頭（LockToggle），鎖頭本身就是按鈕、下方小字表狀態。鎖的是目前頁籤
              （定位／文字／視覺）。標題維持置中：鎖頭 absolute 掛在標題區右緣，
              窄螢幕沒空間時改排到標語下方。 */}
          <div className="relative inline-flex flex-col items-center">
          <h1
            className="font-bold tracking-tight leading-none text-neutral-900 mb-5"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
          >
            {scopeName}
          </h1>

          {/* 2026-09-23 (CJ「標語要出現在最上面的品牌名字底下」): tagline 搬
              回標題正下方，獨立一行——BrandMessageBar 移除時（2026-05-11）
              tagline 預覽是跟著搜尋列一起拿掉的，這次單獨補回來，不用搜尋
              列的殼。沒填標語就不顯示，不留空行。 */}
          {(() => {
            const zh = positioningSegmentData?.tagline?.zhTagline;
            const enTag = positioningSegmentData?.tagline?.enTagline;
            const t = lang === "en" ? (enTag || zh) : (zh || enTag);
            if (!t) return null;
            return (
              <p className="mb-1" style={{ fontSize: 15, fontWeight: 600, color: "#525252", letterSpacing: "0.02em" }}>
                {t}
              </p>
            );
          })()}

            {/* 活動的宣傳企劃：同一個位置、同一顆鎖頭，鎖的是整份企劃（定稿）。 */}
            {category === "campaign" && scopeMode === "event" && scope?.eventId && (
              <div className="mt-2 sm:mt-0 sm:absolute sm:top-1/2 sm:-translate-y-1/2 sm:left-[calc(100%+18px)]">
                {campaignSlots && (
                  <React.Suspense fallback={null}><campaignSlots.LockToggle eventId={scope.eventId} en={lang === "en"} /></React.Suspense>
                )}
              </div>
            )}
            {(category === "positioning" || category === "copy" || category === "visual") && activeBrandIdForLocks && (() => {
              const tab = category as "positioning" | "copy" | "visual";
              const tabLabel = tab === "positioning"
                ? (lang === "en" ? "Positioning" : "定位")
                : tab === "copy"
                  ? (lang === "en" ? "Copy" : "文字")
                  : (lang === "en" ? "Visual" : "視覺");
              const lock = tabLocks[tab];
              const isLocked = !!lock;
              return (
                <div className="mt-2 sm:mt-0 sm:absolute sm:top-1/2 sm:-translate-y-1/2 sm:left-[calc(100%+18px)]">
                  <LockToggle
                    locked={isLocked}
                    busy={!!(lockTabMut?.isPending || unlockTabMut?.isPending)}
                    onToggle={() => handleLockToggle(tab)}
                    lockedLabel={lang === "en" ? "Locked" : "已鎖定"}
                    unlockedLabel={lang === "en" ? "Unlocked" : "未鎖定"}
                    title={isLocked
                      ? (lang === "en"
                          ? `${tabLabel} locked ${new Date(lock.at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })} · single source of truth · click to unlock`
                          : `${tabLabel}鎖定於 ${new Date(lock.at).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" })} · 全平台採用此版本 · 點一下解鎖`)
                      : (lang === "en"
                          ? `Lock ${tabLabel} — editor goes read-only · every task uses this as the single source of truth`
                          : `鎖定${tabLabel}：編輯欄變唯讀 · 所有任務用這份為單一真相`)}
                  />
                </div>
              );
            })()}
          </div>

          {/* 2026-05-11 (CJ「搜尋 BAR 不需要了」): BrandMessageBar removed.
              Manifesto subtitle above already carries the value-prop;
              tagline preview lived in the bar redundantly. Kept the import
              available for any debug page that wants to surface it. */}

          {/* Tab tiles — 7 consistent tiles in one scrollable row.
              2026-08-20: under the 策略 workspace the left rail already lists
              these exact seven sections, so rendering them again here is a
              duplicate control for the same state. Hidden for strategy-preview
              accounts only — everyone else has no rail, and hiding it for
              them would leave no way to change section at all. */}
          {!isStrategyPreview && (
          <div className="mt-6 w-full overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <div className="flex items-start gap-2 min-w-max mx-auto px-2">
              {(() => {
                // Tile set adapts to scope:
                //  - Brand:   all 5 (定位 / 文字 / 知識 / 基本資料 / 視覺)
                //  - Product: 定位 + 基本資料 (copy / knowledge / visual inherit from brand)
                //  - Event:   定位 + 基本資料 (same — events are seasonal overlays on a brand)
                // CJ 2026-05-13「左上選活動時，這一頁就呈現該活動的定位等等資訊」.
                // 2026-06-03 (CJ): Redesigned tab structure — 7 consistent tabs.
                // 平台授權 removed (handled in Calendar connect flow).
                // 產品 + 活動 added as independent tabs with card grids.
                const allTiles = [
                  { v: "positioning" as const, label: lang === "en" ? "Positioning" : "定位",
                      desc: scopeMode === "event"   ? (lang === "en" ? "Campaign positioning" : "活動定位")
                          : scopeMode === "product" ? (lang === "en" ? "Product positioning"  : "產品定位")
                          : (lang === "en" ? "Brand core / Slogan" : "品牌核心 / Slogan"),
                      Icon: TargetIcon,    scopes: ["brand", "product", "event"] as string[] },
                  { v: "copy"        as const, label: lang === "en" ? "Copy"    : "文字",
                      desc: scopeMode === "product" ? (lang === "en" ? "Tone / style" : "語氣 / 風格")
                          : scopeMode === "event"   ? (lang === "en" ? "Voice / rules" : "語氣 / 規範")
                          : (lang === "en" ? "Words / banned / style" : "用詞 / 禁忌 / 風格"),
                      Icon: FontIcon,      scopes: ["brand", "product", "event"] as string[] },
                  { v: "visual"      as const, label: lang === "en" ? "Visual"  : "視覺",
                      desc: lang === "en" ? "Logo / palette / font" : "Logo / 色票 / 字型",
                      Icon: PaletteIcon,   scopes: ["brand"] },
                  { v: "info"        as const, label: lang === "en" ? "Info"    : "基本資料",
                      desc: scopeMode === "event"   ? (lang === "en" ? "Dates / products"    : "時間 / 產品")
                          : scopeMode === "product" ? (lang === "en" ? "Name / brand"        : "名稱 / 品牌")
                          : (lang === "en" ? "Name / industry" : "名稱 / 產業"),
                      Icon: IdCardIcon,    scopes: ["brand", "product", "event"] },
                  { v: "regulations" as const, label: lang === "en" ? "Regulations" : "法規",
                      desc: lang === "en" ? "Checked before every draft" : "寫文前先審查",
                      Icon: RegulationIcon, scopes: ["brand"] },
                  { v: "channels"    as const, label: lang === "en" ? "Channels" : "通路",
                      desc: lang === "en" ? "Each platform's role" : "每個平台的角色",
                      Icon: CommentIcon,   scopes: ["brand"] },
                  { v: "brain"       as const, label: lang === "en" ? "Memory" : "記憶",
                      desc: lang === "en" ? "What the AI remembers" : "AI 記住了什麼、滿了怎麼清",
                      Icon: MemoryIcon,    scopes: ["brand", "product", "event"] },
                  { v: "products"    as const, label: lang === "en" ? "Products" : "產品",
                      desc: lang === "en" ? "Product cards & positioning" : "產品卡片與定位",
                      Icon: AgentIcon, scopes: ["brand"] },
                  { v: "events"      as const, label: lang === "en" ? "Events"   : "活動",
                      desc: lang === "en" ? "Campaign cards & positioning" : "活動卡片與定位",
                      Icon: TargetIcon,    scopes: ["brand"] },
                ];
                const visibleTiles = allTiles.filter((tile) =>
                  tile.scopes.includes(scopeMode === "none" ? "brand" : scopeMode),
                );
                return visibleTiles;
              })().map((t) => {
                const active = category === t.v;
                const locked = t.v === "positioning" || t.v === "copy"
                  ? !!tabLocks[t.v as "positioning"|"copy"]
                  : false;
                const Icon = t.Icon;
                /* 2026-05-10 (CJ「4A 代理商專業感, B&W」): tab tiles
                   redesigned. Was: colored circles (purple/blue/green).
                   Now: monochrome rectangular tabs with subtitle + lock chip.
                   Active = neutral-900 bg + white. Inactive = white +
                   neutral-200 border, hover lifts. */
                return (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => setCategory(t.v)}
                    className={`relative px-3 py-2.5 rounded-lg border transition text-left flex-1 min-w-[100px] max-w-[160px] ${
                      active
                        ? "bg-neutral-900 border-neutral-900 text-white"
                        : "bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={16} strokeWidth={2} className={active ? "text-white" : "text-neutral-700"} />
                      <span className="text-sm font-semibold">{t.label}</span>
                      {locked && (
                        <LockIcon
                          size={11} strokeWidth={2.5}
                          className={active ? "text-neutral-300 ml-auto" : "text-neutral-600 ml-auto"}
                        />
                      )}
                    </div>
                    <p className={`text-[12px] mt-0.5 ${active ? "text-neutral-300" : "text-neutral-700"}`}>
                      {t.desc}
                      {locked && (lang === "en" ? " · Locked" : " · 已鎖定")}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          )}

        </div>
      </div>
      )}{/* end scopeBrands.length > 0 hero */}

      {/* 2026-05-11 (CJ「大腦區感覺也重複了」): the floating
          PositioningBrainBar duplicated the new in-page
          PipelineThinkingPanel. Removed — the in-page panel is now the
          single source of "AI thinking" UI. (Component retained below
          in case we want to revive it as a global indicator later.) */}

      {/* ─── Body: full-bleed (left rail removed 2026-05-07) ─────────────────── */}
      <div className="flex-1 flex">
        {/* Sub-nav aside (kept ONLY for settings; positioning/copy/visual now
            use full-width grid). Hide entirely for the 3 main tabs. */}
        {false && (
        <aside style={{
          width: 200, flexShrink: 0,
          borderRight: "1px solid #E4E3E1",
          background: "white",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
          fontFamily: "Inter, system-ui, sans-serif",
        }}>
          {/* Sub-nav — items for the active category (set by ShellLayout sidebar via ?cat=) */}
          <nav style={{ flex: 1, padding: "6px 8px 16px", display: "flex", flexDirection: "column", gap: 0, overflowY: "auto" }}>
            <p style={{
              fontSize: 12, fontWeight: 700, color: "#A8A29E",
              letterSpacing: "0.10em", textTransform: "uppercase",
              padding: "4px 4px 6px", margin: 0,
            }}>
              {category === "visual"
                ? (lang === "en" ? "Visual assets" : "視覺資產")
                : category === "settings"
                  ? (lang === "en" ? "Settings" : "設定")
                  : scopeMode === "product"
                    ? (lang === "en" ? "Product positioning" : "產品定位")
                    : scopeMode === "event"
                      ? (lang === "en" ? "Campaign positioning" : "活動定位")
                      : (lang === "en" ? "Brand positioning" : "品牌定位")
              }
            </p>

            {/* 品牌定位 sub-items */}
            {category === "positioning" && [
              { id: "doc",     label: lang === "en" ? "My document" : "我的定位文件" },
              { id: "card",    label: lang === "en" ? "Cheat sheet" : "速查卡"    },
              ...segments.map(s => ({ id: `seg:${s.id}`, label: `${s.num} ${lang === "en" ? (s.titleEn ?? s.title) : s.title}` })),
            ].map(item => {
              const active = section === item.id;
              return (
                <button key={item.id} onClick={() => setSection(item.id)} style={{
                  width: "100%", display: "flex", alignItems: "center",
                  padding: "5px 10px", borderRadius: 8,
                  background: active ? "rgba(24,24,27,0.06)" : "none",
                  border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  color: active ? "rgb(24,24,27)" : "rgb(15,16,21)",
                  textAlign: "left", transition: "background 0.12s",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F5F4F2"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(24,24,27,0.06)" : "none"; }}
                >
                  {item.label}
                </button>
              );
            })}

            {/* Visual assets sub-items */}
            {category === "visual" && [
              { id: "asset:all",        label: lang === "en" ? "All assets"   : "所有資產",  badge: undefined },
              { id: "asset:guidelines", label: lang === "en" ? "Guidelines"   : "準則",      badge: undefined },
              { id: "asset:templates",  label: lang === "en" ? "Templates"    : "品牌範本",  badge: lang === "en" ? "New" : "最新" },
              { id: "asset:logo",       label: lang === "en" ? "Logo"         : "標誌",      badge: undefined },
              { id: "asset:colors",     label: lang === "en" ? "Colors"       : "顏色",      badge: undefined },
              { id: "asset:fonts",      label: lang === "en" ? "Fonts"        : "字型",      badge: undefined },
              { id: "asset:voice",      label: lang === "en" ? "Brand voice"  : "品牌口吻",  badge: undefined },
              { id: "asset:photos",     label: lang === "en" ? "Photos"       : "照片",      badge: undefined },
              { id: "asset:images",     label: lang === "en" ? "Images"       : "圖像",      badge: undefined },
              { id: "asset:icons",      label: lang === "en" ? "Icons"        : "圖示",      badge: undefined },
              { id: "asset:charts",     label: lang === "en" ? "Charts"       : "圖表",      badge: undefined },
            ].map(item => (
              <VisualNavItem
                key={item.id}
                label={item.label}
                badge={(item as any).badge}
                active={section === item.id}
                onClick={() => setSection(item.id)}
              />
            ))}

            {/* 設定 sub-items (event only) */}
            {category === "settings" && scopeMode === "event" && (() => {
              const active = section === "settings";
              return (
                <button onClick={() => setSection("settings")} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 10px", borderRadius: 8,
                  background: active ? "rgba(24,24,27,0.06)" : "none",
                  border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  color: active ? "rgb(24,24,27)" : "rgb(15,16,21)",
                  textAlign: "left", transition: "background 0.12s",
                }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F5F4F2"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(24,24,27,0.06)" : "none"; }}
                >
                  <FontAwesomeIcon icon={faGear} style={{ fontSize: 12, color: active ? "rgb(24,24,27)" : "#A8A29E" }} />
                  {tr("Settings", "設定")}
                </button>
              );
            })()}
          </nav>
        </aside>
        )}

        {/* Right: scope-aware content pane — driven by `section` (sidebar handles all nav) */}
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col" style={{ minWidth: 0 }}>
          {/* 2026-09-30（CJ「所有品牌跟品牌定位總覽似乎很像……可以選擇上一頁到哪一個」）：
              「← 所有品牌」「← 品牌定位總覽」「← 所有資產」收成這一條路徑列，每一段都能點；
              從「記憶」點過來時，最右邊有「回到記憶」（見 backToMemory）。 */}
          {currentBrand && (
            <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: "12px 28px 0" }}>
              <nav aria-label={lang === "en" ? "Breadcrumb" : "路徑"} className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
                {crumbs.map((c, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-neutral-300">›</span>}
                    {!c.target ? (
                      <span className="font-semibold text-neutral-900" aria-current="page">{c.label}</span>
                    ) : "href" in c.target ? (
                      <a href={c.target.href} className="text-neutral-500 transition-colors hover:text-neutral-900">{c.label}</a>
                    ) : (
                      <button type="button" onClick={() => goCrumb(c.target as CrumbTarget)}
                        className="text-neutral-500 transition-colors hover:text-neutral-900">{c.label}</button>
                    )}
                  </React.Fragment>
                ))}
              </nav>
              {fromMemory && (
                <button type="button" onClick={backToMemory}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-neutral-800 transition-colors hover:border-neutral-900">
                  <MemoryIcon size={13} />
                  {lang === "en" ? "Back to Memory" : "回到記憶"}
                </button>
              )}
            </div>
          )}
          {/* ── 知識庫 ── */}
          {derivedCategory === "knowledge" && (
            <div style={{ padding: "16px 28px 0", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* 2026-05-11 (CJ「在定位和文字的地方，都有常駐的 agents」):
                  Persistent persona bar so the workspace feels staffed even
                  when nothing is running. Same line-art style as 定位. */}
              <AgentPersonaBar persona="librarian" brandName={scopeName} mode="idle" />
              {/* 2026-09-08 (CJ「顯示出幫他把定位化為 AI 讀懂的文字的過程」)：
                  每張任務卡開跑前塞進模型的那段簡報，攤開來、對回欄位。
                  「上傳定位文件」是不走 14 步的那條路，從這裡直接跳過去。 */}
              <AIBriefPanel
                brandId={activeBrandIdForLocks}
                onOpenDocs={() => { setCategory("positioning"); setSection("doc" as any); }}
              />
              <KnowledgeEditor key={`knowledge-${activeBrandIdForLocks ?? 0}`} brandId={activeBrandIdForLocks} />
            </div>
          )}

          {/* ── 基本資料 (info) — scope-aware: brand / product / event ── */}
          {derivedCategory === "info" && scopeMode === "brand" && (
            <div style={{ padding: "16px 28px 32px" }}>
              <BrandInfoTab
                brandId={activeBrandIdForLocks}
                brandName={scopeName}
              />
              {/* Danger zone — delete brand. CJ「危險區直接救出現在 定位
                  文字知識的某個地方，作為刪除」: integrate the destructive
                  action here instead of buried in a settings modal. */}
              {activeBrandIdForLocks && (
                <div className="mt-8 max-w-[700px] mx-auto">
                  <div className="border border-rose-200 rounded-xl bg-rose-50/40 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <DeleteIcon size={14} className="text-rose-600" />
                      <h3 className="text-sm font-semibold text-rose-700">
                        {lang === "en" ? "Danger zone" : "危險區"}
                      </h3>
                    </div>
                    <BrandDangerTab
                      brandId={activeBrandIdForLocks}
                      brandName={scopeName}
                      onClose={() => { /* navigate back to /brands after delete */ }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Event info — reuses the existing EventSettingsPanel which
              edits dates / brand / linked products. */}
          {derivedCategory === "info" && scopeMode === "event" && scope?.eventId && (
            <div style={{ padding: "24px" }}>
              <EventSettingsPanel eventId={scope.eventId} brands={scopeBrands} />
            </div>
          )}
          {/* 2026-05-18 (CJ「產品基本資料東西太少，右下也沒有+新增選單管理」):
              real editable product editor (name / SKU / 網址 / 定位)
              + re-analyze, replacing the dead placeholder. */}
          {derivedCategory === "info" && scopeMode === "product" && scope?.productId && (
            <div style={{ padding: "24px" }}>
              <div className="max-w-[700px] mx-auto">
                <h2 className="text-2xl font-semibold text-default-900 mb-2">
                  {lang === "en" ? "Product info" : "產品基本資料"}
                </h2>
                <p className="text-sm text-default-500 mb-6">
                  {lang === "en" ? "Name / SKU / URL / positioning" : "名稱 / SKU / 網址 / 定位"}
                </p>
                <ProductInfoEditor productId={scope.productId} brandName={scopeName} en={lang === "en"} />
              </div>
            </div>
          )}



          {/* ── 品牌 / 產品 / 活動定位 ── */}
          {derivedCategory === "positioning" && (
            <>
              {/* ── 定位 card grid (pos:home) ── */}
              {section === "pos:home" ? (
                <div style={{ padding: "16px 28px 0", display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* 2026-05-11 (CJ「目前就是工作區以上的鎖定定位等等內容有點重複」):
                      while the pipeline is running the brain bar IS the workspace —
                      hide the lock toolbar + 品牌工具 grid until it's done.
                      Idle: show lock toolbar + tile grid (normal view).
                      Running / Paused: show ONLY the brain panel.
                      Done: brain panel above + tiles below (so user sees results immediately). */}
                  {/* 2026-09-23（CJ 三則連續指示，見 StrategyDirectorDrawer.tsx
                      的完整脈絡）：策略總監從這裡的展開式 icon 搬成全域右上角
                      常駐入口，這裡不再重複——策略監測／策略健檢兩個 icon
                      留著（它們開的是這一頁本來就有的面板，全域總監只是
                      「引導過去」）。PositioningTopRow（重新套用14步）恢復
                      成一律顯示，不再需要先點總監 icon 才看得到。 */}
                  {/* 2026-09-23（CJ「套用SoWork定位法的按鈕，跟策略監測的按鈕大小
                      樣式都相同，就可以。而我看起來，還缺乏一個功能，是上傳自己的
                      定位資料(PDF OR WORD OR 對話文字)，也可以作在跟策略監測的相同
                      位置」）：原本是兩排——上排兩顆小 pill（監測/健檢），下排一顆
                      大黑按鈕（套用定位法）。同一層級的三件事長得不一樣，看起來像
                      「有一個比較重要」，但它們其實是並列的入口。現在收成同一排
                      pill，PositioningTopRow 的按鈕也改成同樣的 pill 樣式。

                      上傳定位資料這顆是新的入口，但不是新功能——PositioningDocPanel
                      （section="doc"）本來就做得完整（PDF/Word 上傳、貼 ChatGPT 對話
                      串、AI 提案對映、落差表），只是躲在左側欄「我的定位文件」裡，
                      使用者在這一頁看不到，以為沒有這個功能。這裡只是把它拉出來。
                      （跟定位卡片下方的「新增卡片」不同：那是新增單一欄位卡片，
                      不是上傳整份定位書——CJ 特別點出這兩件事不要混為一談。） */}
                  {positioningToolbar}

                  {scopeMode !== "none" && pipelineSteps.length > 0 && pipeline.status !== "idle" && (
                    <PipelineThinkingPanel
                      steps={pipelineSteps}
                      status={pipeline.status}
                      cursor={pipeline.cursor}
                      completedIds={pipeline.completed}
                      thinkingText={liveThinking}
                      phase={thinkingPhase}
                      startedAt={thinkingStartedAt}
                      title={
                        scopeMode === "product" ? "Product Positioning"
                        : scopeMode === "event" ? "Event Positioning"
                        : "Brand Positioning"
                      }
                      brandName={scopeName}
                      onStart={startPipeline}
                      onPause={pausePipeline}
                      onResume={resumePipeline}
                      onSkip={skipPipeline}
                      onStop={stopPipeline}
                    />
                  )}

                  {/* 2026-05-11 (reviewer feedback「從定位到內容產出的連結是斷裂的」):
                      bridge banner shown after pipeline completes — makes the
                      causal chain "定位 → 30s / 60s / 企劃台" visible. */}
                  {pipeline.status === "done" && (
                    <PositioningCompletionBridge
                      brandId={(scope?.brandId ?? brandId) as number | null}
                      scopeMode={scopeMode}
                    />
                  )}

                  {/* ── Auto-positioning status banner ───────────────────────────
                      Shown while the background interim/full pipeline is running.
                      No user action needed — just a subtle status indicator. */}
                  {(autoPosPhase === "interim-running" || autoPosPhase === "interim-done" || autoPosPhase === "full-done") && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 16px", borderRadius: 8,
                      background: autoPosPhase === "full-done" ? "#F0FDF4" : "#FAFAFA",
                      border: autoPosPhase === "full-done" ? "1px solid #BBF7D0" : "1px solid #E5E5E5",
                    }}>
                      {autoPosPhase === "full-done" ? (
                        <span style={{ fontSize: 14, display: "inline-flex" }}><DoneIcon size={14} /></span>
                      ) : (
                        <>
                          <div style={{
                            width: 12, height: 12, flexShrink: 0,
                            border: "2px solid #D6D3D1", borderTopColor: "#525252",
                            borderRadius: "50%", animation: "spin 0.9s linear infinite",
                          }} />
                          <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeSlideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
                        </>
                      )}
                      <span style={{ fontSize: 12, color: autoPosPhase === "full-done" ? "#166534" : "#525252" }}>
                        {autoPosPhase === "interim-running"
                          ? (lang === "en" ? "AI quick-positioning running… content tasks will use it automatically once ready" : "AI 定位分析中⋯完成後文章產出會自動套用")
                          : autoPosPhase === "interim-done"
                            ? (lang === "en" ? "Quick positioning ready — full analysis running in background" : "初步定位已就緒，文章已可套用 · 完整分析仍在背景執行中")
                            : (lang === "en" ? "Full positioning complete — all content tasks now use the upgraded positioning" : "完整定位已完成 — 所有文章產出已升級為完整定位版本")}
                      </span>
                    </div>
                  )}

                  {/* 品牌工具 grid — hidden while running/paused; shown when idle
                      (user hasn't started yet) or done (results ready). */}
                  {(pipeline.status === "idle" || pipeline.status === "done") && (
                    <>
                      {/* 2026-07-28 (CJ「開工」策略工作台 P1): 受眾×競爭組×優勢
                          三錨點 → 四區看板＋標語推導鏈。
                          2026-07-29 (「穩定了」): generalized to event scope —
                          scenarios persist on the event's own positioning;
                          competition/differentiation ground material is
                          borrowed read-only from the parent brand. */}
                      {/* 2026-09-08 策略監測（專業方案）：品牌、產品與競爭者有變化時
                          亮出情報，指回下面工作台的哪個錨點。
                          2026-09-23：不再一律展開——只有上面的 icon row 被點開
                          （activeStrategyTool）才掛載，見同一天的 CJ 指示。 */}
                      {activeStrategyTool === "monitor" && scopeMode === "brand" && activeBrandIdForLocks ? (
                        <StrategyAlertsPanel brandId={activeBrandIdForLocks} />
                      ) : null}
                      {!(activeStrategyTool === "monitor" && scopeMode === "brand" && activeBrandIdForLocks) && (
                      <PositioningGrid
                        scopeMode={scopeMode}
                        segments={segments}
                        onSelect={setSection}
                        segmentData={positioningSegmentData}
                        customSegments={customPositioningSegments}
                        onDeleteCustomSegment={(segmentId) => {
                          const msg = lang === "en" ? "Delete this card?" : "確定要刪除這張卡片嗎？";
                          if (!confirm(msg)) return;
                          removeCustomSegmentMut?.mutate({
                            scope: scopeMode === "none" ? "brand" : scopeMode,
                            scopeId: targetId ?? 0,
                            segmentId,
                          });
                        }}
                        onEditCustomSegment={(segmentId) => {
                          const seg = segmentId
                            ? (customPositioningSegments ?? []).find((x: any) => x.id === segmentId)
                            : null;
                          setEditingCard(
                            seg
                              ? { id: seg.id, title: seg.title, fields: seg.fields.map((f: any) => ({ label: f.label, value: f.value })) }
                              : { id: null, title: "", fields: [] },
                          );
                        }}
                      />
                      )}
                    </>
                  )}
                </div>
              ) : (
              /* ── 選了具體 section → 原本的內容 ── */
              <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
                {section === "doc" && positioningToolbar}
                {/* 2026-09-23（CJ「就不需要品牌分析的這一列功能了」——在上傳
                    定位文件那一頁）：「我的定位文件」是「我已經有定位了，照
                    我的來」的入口，頂上再擺一列「品牌定位分析／開始分析」等於
                    在同一頁同時推兩條互斥的路，而且那條路在定位總覽已經有
                    按鈕（重新套用 SoWork 定位法）。其他 section 維持原樣。 */}
                {scopeMode !== "none" && pipelineSteps.length > 0 && section !== "doc" && (
                  <PipelineRunner
                    steps={pipelineSteps}
                    state={pipeline}
                    title={
                      scopeMode === "product"
                        ? (lang === "en" ? "Product positioning analysis" : "產品定位分析")
                      : scopeMode === "event"
                        ? (lang === "en" ? "Campaign positioning analysis" : "活動定位分析")
                        : (lang === "en" ? "Brand positioning analysis"    : "品牌定位分析")
                    }
                    onStart={startPipeline}
                    onPause={pausePipeline}
                    onResume={resumePipeline}
                    onSkip={skipPipeline}
                    onStop={stopPipeline}
                  />
                )}
                {smpCheckpointActive && (
                  <div className="mt-2 rounded-md border border-primary-200 bg-primary-50 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <FontAwesomeIcon icon={faWandMagicSparkles} className="text-primary mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-small font-semibold text-primary-800"><StopIcon size={12} /> {lang === "en" ? "SMP Checkpoint — confirm your single-minded proposition" : "SMP Checkpoint — 請確認單一核心命題"}</p>
                        <p className="text-tiny text-default-600 mt-1">{lang === "en" ? "SMP is the core creative principle for this campaign — the next 5 steps are built around it. Review it before moving on." : "SMP 是這次活動的最高創意準則，後面 5 個 step 都會圍繞它展開。先確認再繼續。"}</p>
                        {smpData?.singleMindedProposition && (
                          <div className="mt-2 p-2 rounded bg-white border border-divider">
                            <p className="text-small font-medium text-foreground">「{smpData.singleMindedProposition}」</p>
                            {smpData.rationale && typeof smpData.rationale === "string" && <p className="text-tiny text-default-700 mt-1 leading-relaxed">{smpData.rationale}</p>}
                          </div>
                        )}
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <button className="px-3 py-1 rounded-md bg-primary text-white text-tiny font-medium hover:opacity-90" onClick={resumeAfterSmp}>{lang === "en" ? "▶ Continue (steps 7-11)" : "▶ 繼續（跑步驟 7-11）"}</button>
                          <button className="px-3 py-1 rounded-md border border-divider text-tiny hover:bg-default-50" onClick={() => setSection("seg:smp")}>{lang === "en" ? "Edit SMP" : "編輯 SMP"}</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {failedStepIds.length > 0 && (
                  <div className="mt-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-tiny text-warning-800">
                    <WarningIcon size={11} /> {lang === "en" ? "These steps came back empty — re-run them from each segment:" : "以下步驟沒寫入內容，建議到對應頁籤重跑："}{" "}
                    {failedStepIds.map(id => { const s = pipelineSteps.find(x => x.id === id); return lang === "en" ? (s ? `Step ${id} · ${s.segmentId}` : `Step ${id}`) : (s ? `步驟 ${id} · ${s.segmentId}` : `步驟 ${id}`); }).join(lang === "en" ? ", " : "、")}
                    <button className="ml-2 underline" onClick={() => setFailedStepIds([])}>{t("close")}</button>
                  </div>
                )}
                <PositioningPanel
                  section={section}
                  scopeMode={scopeMode}
                  scopeName={scopeName}
                  scopeBrandId={scope?.brandId ?? null}
                  scopeProductId={scope?.productId ?? null}
                  scopeEventId={scope?.eventId ?? null}
                  pipelineThinking={pipelineThinking && pipelineThinking.segmentTarget === section ? pipelineThinking : null}
                  onAutoFill={runSegmentAutoFill}
                  locked={!!tabLocks.positioning}
                  onBackToOverview={() => setSection("pos:home")}
                />
              </div>
              )}  {/* end section !== pos:home */}
            </>
          )}

          {/* ── 視覺資產 ── */}
          {derivedCategory === "visual" && scopeMode === "brand" && (
            <div style={{ padding: "0 0 32px", display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
              {/* Action bar — only on grid view (not while editing a single asset) */}
              {section === "asset:all" && (
                <TabActionBar
                  tab="visual"
                  label={lang === "en" ? "Visual" : "視覺"}
                  locked={!!tabLocks.visual}
                  hasContent={tabHasContent.visual}
                  busy={visualAutoFillBusy}
                  statusText={
                    visualAutoFillNote
                      ?? (tabHasContent.visual
                        ? (lang === "en" ? "Some visual assets ready — hit redo to AI-draft anything still empty" : "已有部分視覺資產 — 按下重新，AI 會幫還沒填的欄位草擬建議")
                        : (lang === "en" ? "Empty — hit start for an AI-drafted starting point (logo/photos still need your real assets)" : "尚未填寫 — 按下開始，AI 會草擬視覺規範/風格/字型/色票建議（Logo、照片仍需你提供真實素材）"))
                  }
                  subText={lang === "en" ? "Logo / colors / fonts / imagery / guidelines / library" : "標誌 / 顏色 / 字型 / 圖像風格 / 視覺規範 / 素材庫"}
                  onAction={() => handleTabAction("visual")}
                />
              )}
              <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 32 }}>

              {/* 2026-06-21 (CJ「按 riverflow 標準」brand DNA): hero strip
                  surfacing the auto-extracted brand palette at the TOP of
                  the visual tab, so the most distinctive thing OnBrand
                  knows about the brand is visible without a click. The
                  per-asset card grid below remains unchanged. */}
              {/* 2026-09-26（CJ「品牌視覺色彩(DNA)，也是單獨的任務卡」）：
                  色票 hero 不再常駐在最上面——它現在是「品牌色彩 DNA」那張卡
                  點開後的內容。常駐一條 hero＋底下又有一張「顏色」卡，正是
                  CJ 說的「很亂、沒有統一性」的來源。 */}

              {/* ── 若選了具體資產類別，顯示其編輯器 ── */}
              {(() => {
                const VALID_ASSET_KEYS: AssetKey[] = [
                  // 視覺
                  "logo", "colors", "fonts", "photos", "guidelines", "templates",
                  "imagery_style", "icon_style", "chart_style", "layout_rules",
                  // 文字
                  "voice", "voice_principles",
                  "preferred_terms", "banned_words", "term_substitutions",
                  "branded_terms", "product_naming", "abbreviations",
                  "cta_library", "hook_library", "templates_copy",
                ];
                const assetKey = section.slice("asset:".length) as AssetKey;
                const activeBrandId = scope?.brandId ?? brandId;
                if (VALID_ASSET_KEYS.includes(assetKey) && activeBrandId) {
                  return (
                    <div>
                      <BrandAssetPanel assetKey={assetKey} brandId={activeBrandId} locked={!!tabLocks.visual} />
                    </div>
                  );
                }

                /* ── 預設：視覺資產卡片板 ──
                   2026-09-26（CJ「請幫我整理好整個架構」＋「一開始也只要呈現出
                   五個任務卡，其他的任務卡，請參考文字和產品的體驗設計」）：
                   原本是 4 組 10 張帶粉彩底色的圖磚。現在預設五張（色彩 DNA／
                   標誌／圖像風格／圖示風格／品牌照片），其餘自己加；卡片外框用
                   跟任務卡同一個殼。顯示規則與「為什麼沒有字型卡」在
                   lib/visualAssets.ts。 */
                if (!activeBrandId) return null;
                return (
                  <VisualAssetBoard
                    brandId={activeBrandId}
                    assets={brandAssets}
                    added={addedVisualCards}
                    dnaSwatches={dnaSwatches}
                    lang={lang}
                    readOnly={!!tabLocks.visual}
                    onChange={(key, next) => saveBrandAsset(key, next)}
                    onAddCard={(key) => addVisualCard(key)}
                    onDeleteCard={(key) => deleteVisualCard(key)}
                    customCards={customPositioningSegments}
                    onEditCustomCard={(card) => setEditingCard(card)}
                    onDeleteCustomCard={(segmentId) => {
                      const msg = lang === "en" ? "Delete this card?" : "確定要刪除這張卡片嗎？";
                      if (!confirm(msg)) return;
                      removeCustomSegmentMut?.mutate({ scope: "brand", scopeId: activeBrandId, segmentId });
                    }}
                    renderDna={() => (
                      <BrandPaletteHero brandId={activeBrandId} lang={lang} locked={!!tabLocks.visual} />
                    )}
                    renderLogo={() => (
                      <BrandAssetPanel assetKey={"logo" as AssetKey} brandId={activeBrandId} locked={!!tabLocks.visual} />
                    )}
                  />
                );
              })()}
              </div>
            </div>
          )}

          {/* ── 文字 ──
              Brand:   voice/tone/forbidden assets via CopyTabInline
              Product: 行銷指引 (marketing segment) — tone/style/keywords
              Event:   創意與內容規範 (guidelines segment) — toneOfVoice/mustHave/forbidden
              2026-05-27 (CJ「為產品和活動設計與品牌相同的文字標籤頁」) */}
          {/* 2026-09-26（CJ「目前文字總監的位置，請參考品牌頁面的做法，移除該
              文件總監的位置」）：這一頁原本頂著一個大對話框（頭像＋「等你的定位
              鎖定後…」）。品牌頁早就把總監收成右下角的常駐入口了，文字頁留著
              那個框等於同一個角色在畫面上出現兩次，而且它佔掉整個第一屏。 */}
          {derivedCategory === "copy" && activeBrandIdForLocks && scopeMode === "brand" && (
            <CopyTabInline
              key={`copy-${activeBrandIdForLocks}`}
              brandId={activeBrandIdForLocks}
              brandAssets={brandAssets}
              fullPositioning={fullPositioning}
              locked={!!tabLocks.copy}
              customCards={customPositioningSegments}
              onEditCustomCard={(card) => setEditingCard(card)}
              onDeleteCustomCard={(segmentId) => {
                const msg = lang === "en" ? "Delete this card?" : "確定要刪除這張卡片嗎？";
                if (!confirm(msg)) return;
                removeCustomSegmentMut?.mutate({ scope: "brand", scopeId: activeBrandIdForLocks, segmentId });
              }}
            />
          )}
          {/* 2026-05-27 (CJ「為產品和活動設計文字標籤頁」):
              Product → 行銷指引 (marketing segment: tone/style/keywords)
              Event   → 創意與內容規範 (guidelines segment: toneOfVoice/mustHave/forbidden) */}
          {derivedCategory === "copy" && scopeMode === "product" && scope?.productId && (
            <>
              <div style={{ padding: "16px 28px 0" }}>
                <AgentPersonaBar persona="copywriter" brandName={scopeName} mode="idle"
                  message={lang === "en"
                    ? "Marketing tone, style, and keywords for this product — derived from its positioning and target audience."
                    : "此產品的行銷語氣、溝通風格、關鍵詞彙 — 從定位與目標族群推導而來。"}
                />
              </div>
              <div style={{ padding: "16px 28px 32px" }}>
                <PositioningPanel
                  section="seg:marketing"
                  scopeMode="product"
                  scopeName={scopeName}
                  scopeBrandId={scope?.brandId ?? null}
                  scopeProductId={scope.productId}
                  scopeEventId={null}
                  pipelineThinking={pipelineThinking}
                  onAutoFill={runSegmentAutoFill}
                  locked={!!tabLocks.copy}
                />
              </div>
            </>
          )}
          {derivedCategory === "copy" && scopeMode === "event" && scope?.eventId && (
            <>
              <div style={{ padding: "16px 28px 0" }}>
                <AgentPersonaBar persona="copywriter" brandName={scopeName} mode="idle"
                  message={lang === "en"
                    ? "Creative & content guidelines for this campaign — tone of voice, must-haves, and forbidden elements."
                    : "此活動的創意與內容規範 — 語氣基調、必須出現元素、禁用元素，從品牌聲音與活動概念推導而來。"}
                />
              </div>
              {/* 2026-07-19 (CJ「文字頁自動填寫沒反應」): pipelineThinking was
                  null here — the autofill DID run server-side, but with no
                  thinking overlay the 90s execution looked completely dead. */}
              <div style={{ padding: "16px 28px 32px" }}>
                <PositioningPanel
                  section="seg:guidelines"
                  scopeMode="event"
                  scopeName={scopeName}
                  scopeBrandId={scope?.brandId ?? null}
                  scopeProductId={scope?.productId ?? null}
                  scopeEventId={scope.eventId}
                  pipelineThinking={pipelineThinking}
                  onAutoFill={runSegmentAutoFill}
                  locked={!!tabLocks.copy}
                />
              </div>
            </>
          )}

          {/* ── 活動（策略＋宣傳企劃，活動限定）──
              2026-09-30（CJ 選 Tesla 分割畫面）：活動定位與宣傳企劃合成一個畫面，
              策略層只排不寫；定稿後「到內容層寫」才出現。 */}
          {derivedCategory === "campaign" && scopeMode === "event" && scope?.eventId && (
            <div style={{ padding: "16px 24px 32px" }}>
              {campaignSlots && (
                <React.Suspense fallback={null}>
                  <campaignSlots.Stage eventId={scope.eventId} brandId={scope?.brandId ?? brandId ?? null} />
                </React.Suspense>
              )}
            </div>
          )}

          {/* ── 設定（活動限定）── */}
          {derivedCategory === "settings" && scopeMode === "event" && scope?.eventId && (
            <div style={{ padding: "24px" }}>
              <EventSettingsPanel eventId={scope.eventId} brands={scopeBrands} />
            </div>
          )}

          {/* ── 設定（品牌 — 含 FB 自動抓 logo）── */}
          {derivedCategory === "settings" && scopeMode === "brand" && (scope?.brandId ?? brandId) && (
            <div style={{ padding: "24px" }}>
              <BrandLogoSettings
                brandId={(scope?.brandId ?? brandId) as number}
                brandName={currentBrand?.name ?? null}
              />
            </div>
          )}

          {/* ── 平台授權 (publish) — OAuth connections ── */}
          {/* 2026-05-30 (CJ「modal 移除，功能全進主工作區」) */}
          {derivedCategory === "publish" && scopeMode === "brand" && (
            <div style={{ padding: "8px 0 32px" }}>
              <BrandPublishTab brandId={activeBrandIdForLocks} />
            </div>
          )}

          {/* ── 法規 (regulations) — 寫文前先審查 ──
               2026-09-30（CJ「策略層加一個 mission tray，是法規，用戶自行增加整個法規來源（有字數
               上限，確定品牌大腦吃得下），agent 寫文章前要審查，介面上要有免責。每一個法規就是一個
               任務卡的形式」）。品牌層：一條法規對整個品牌的所有產文生效。 */}
          {derivedCategory === "regulations" && activeBrandIdForLocks && (
            <div style={{ padding: "8px 0 32px" }}>
              <RegulationsPanel
                brandId={activeBrandIdForLocks}
                focusId={memoryFocus?.startsWith("reg:") ? Number(memoryFocus.slice(4)) || null : null}
              />
            </div>
          )}

          {/* ── 通路 (channels) — 每個平台各自的定位 ──
               2026-10-03（CJ「不同平台的定位不同，不是加在品牌頁面，而是增加一個 mission tray，
               呈現方式參考品牌頁面」）：七個平台各一張卡（樣式同品牌定位卡），點開編輯五格，
               也可以在裡面與 AI 討論或貼上現成文字。只有發在該平台的任務會讀到那張卡。 */}
          {derivedCategory === "channels" && scopeMode === "brand" && activeBrandIdForLocks && (
            <ChannelRolesTray
              channelRoles={positioningSegmentData.channelRoles}
              onEdit={setEditingChannel}
            />
          )}

          {/* ── 大腦 (brain) — 檢查品牌大腦 ──
               2026-09-29（CJ「在策略端增加一個 mission tray，是檢查大腦……像手機
               記憶體的感覺」）：列出每篇產文實際讀到的品牌大腦、用了多少容量、
               哪些只記住一部分、哪些超載。資料與產文 prompt 同源（buildBrandBrain）。 */}
          {derivedCategory === "brain" && activeBrandIdForLocks && (
            <div style={{ padding: "8px 0 32px" }}>
              <BrainPanel
                brandId={activeBrandIdForLocks}
                initialProductId={scope?.productId ?? null}
                initialEventId={scope?.eventId ?? null}
              />
            </div>
          )}

          {/* ── 人設 Agent (persona) — user-created, trained persona agents ──
               2026-08-22: gated to isPersonaPreview independently of the nav
               item that links here — a direct ?cat=persona URL shouldn't
               bypass the same gate. */}
          {derivedCategory === "persona" && scopeMode === "brand" && isPersonaPreview && (
            <div style={{ padding: "8px 0 32px" }}>
              <PersonaAgentPanel brandId={activeBrandIdForLocks} />
            </div>
          )}

          {/* ── 產品 (products) — card grid with positioning preview ── */}
          {derivedCategory === "products" && scopeMode === "brand" && (
            <div style={{ padding: "8px 0 32px" }}>

              <BrandEntityGrid
                items={brandProductsList}
                isLoading={brandProductsQ?.isLoading ?? false}
                lang={lang}
                onAdd={() => setAddModal({ open: true, tab: "product" })}
                onOpen={(id) => setProductDetailId(id)}
                onDelete={(id) => prodRemoveMut?.mutate?.({ id })}
                onPosition={(id) => kickReposition("product", id, brandProductsList?.find((p: any) => p.id === id)?.name)}
                onUpload={(id) => setProductDocId(id)}
                runningIds={posRunning.product}
                progressMap={posProgress}
              />
            </div>
          )}

          {/* ── 活動 (events) — 年度時間軸＋活動卡 ──
              2026-10-02（CJ「活動頁的卡片要參考品牌頁面的」「要不要用行事曆鼓勵用戶把一整年的
              活動先建進來」「建議節點也可以讓用戶自己增加」）：上面是 12 個月時間軸（節慶＋自建
              節點＋活動橫條），下面是照 BrandCard 版型的活動卡。點卡片／橫條都進宣傳企劃。
              2026-09-25 的決定不變：活動的落點是宣傳企劃（cat=campaign），不是得獎 brief。
              2026-07-28 的教訓也還在：p/e/cat 必須一次 setSearchParams 寫完，分兩次會互蓋。 */}
          {derivedCategory === "events" && scopeMode === "brand" && (() => {
            const openEvent = (id: number) => {
              setSearchParams((prev) => {
                const sp = new URLSearchParams(prev);
                sp.delete("p");
                sp.set("e", String(id));
                sp.set("cat", "campaign");
                return sp;
              }, { replace: true });
            };
            const todayYmd = toYmd(new Date())!;
            return (
              <div style={{ padding: "8px 8px 32px" }}>
                {activeBrandIdForLocks && (
                  <EventYearTimeline
                    brandId={activeBrandIdForLocks}
                    events={brandEventsList}
                    lang={lang}
                    today={todayYmd}
                    onOpenEvent={openEvent}
                    onPlanFromNode={(prefill: PlanPrefill) => {
                      setEventPrefill(prefill);
                      setAddModal({ open: true, tab: "event" });
                    }}
                  />
                )}
                <EventCardGrid
                  events={brandEventsList}
                  isLoading={brandEventsQ?.isLoading ?? false}
                  lang={lang}
                  today={todayYmd}
                  onAdd={() => { setEventPrefill(null); setAddModal({ open: true, tab: "event" }); }}
                  onOpen={openEvent}
                  onDelete={(id) => evRemoveMut?.mutate?.({ id })}
                />
              </div>
            );
          })()}
        </div>
      </div>

      {/* 2026-05-13 (CJ「右下方的客服，被新增擋住了」):
          page-level + 新增 FAB removed — it overlapped Mia avatar at the
          same screen corner. Same actions are reachable from the
          BrandHierarchyPill 「+ 新增品牌 / 產品 / 活動」 menu top-left.
          AddEntityModal is still mounted below (other triggers fire it). */}

      {/* 2026-10-03（CJ「策略層的產品定位，每個產品也要能讓用戶上傳定位文件或純文字」）：
          產品卡的「上傳定位」。後端 positioningDocs 本來就支援 product scope，這裡只是把
          既有的 PositioningDocPanel 掛進視窗，不另寫第二套上傳流程。 */}
      <Modal
        isOpen={productDocId != null}
        onClose={() => { setProductDocId(null); brandProductsQ?.refetch?.(); }}
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="text-base font-semibold">
            {lang === "en" ? "Upload product positioning" : "上傳產品定位"}
            {" · "}
            {brandProductsList?.find((p: any) => p.id === productDocId)?.name ?? ""}
          </ModalHeader>
          <ModalBody className="pb-6">
            {productDocId != null && (
              <PositioningDocPanel
                scopeMode="product"
                scopeId={productDocId}
                scopeName={brandProductsList?.find((p: any) => p.id === productDocId)?.name ?? ""}
                onBackToOverview={() => { setProductDocId(null); brandProductsQ?.refetch?.(); }}
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* ProductDetailModal — 點選產品卡片時開啟 */}
      {productDetailId && activeBrandIdForLocks && (
        <ProductDetailModal
          productId={productDetailId}
          brandId={activeBrandIdForLocks}
          onClose={() => setProductDetailId(null)}
          onImageUpdated={() => brandProductsQ?.refetch?.()}
          onReposition={(id) => {
            setProductDetailId(null);
            kickReposition("product", id, brandProductsList?.find((p: any) => p.id === id)?.name);
          }}
        />
      )}

      {/* AddEntityModal — shared dialog for 品牌 / 產品 / 活動 */}
      <AddEntityModal
        isOpen={addModal.open}
        initialTab={addModal.tab}
        defaultBrandId={(scope?.brandId ?? brandId) ?? null}
        eventPrefill={addModal.tab === "event" ? eventPrefill : null}
        onClose={() => { setAddModal({ open: false, tab: addModal.tab }); setEventPrefill(null); }}
        onCreated={(kind, id) => {
          if (kind === "brand") { setBrandId(id); setScope({ brandId: id, productId: null, eventId: null }); }
          // 2026-07-27 (CJ「新增產品後，突然跑到一個奇怪頁面」): goToEntity(kind, id)
          // drills straight into the new product/event's own near-empty
          // sub-workspace page — disorienting right after creation, when
          // there's nothing there yet. Land back on the list instead (clear
          // any stale p/e so a leftover single-item view doesn't win) so the
          // user can see the new card and kick off positioning from there.
          else if (kind === "event") {
            // 2026-09-30（CJ「活動定位完成後，我有點迷路…又找不到入口了」）：建完活動
            // 直接進這檔活動的宣傳企劃——那是下一步要做的事。以前落回活動列表，
            // 要自己再找到卡片上的「宣傳企劃」按鈕才進得來。
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set("cat", "campaign");
            nextParams.delete("p");
            nextParams.set("e", String(id));
            setSearchParams(nextParams, { replace: true });
          }
          else if (kind === "product") {
            void id;
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set("cat", "products");
            nextParams.delete("p");
            nextParams.delete("e");
            setSearchParams(nextParams, { replace: true });
          }
        }}
      />

      {/* 2026-09-24：自訂定位卡片的編輯器（標題 + 內容，可從檔案帶入）。
          掛在這一層是因為 scopeMode / targetId / coverage 的 refetch 都在這裡；
          PositioningGrid 只負責「哪一張卡被點了」。 */}
      <CustomCardEditor
        open={!!editingCard}
        card={editingCard}
        scopeMode={scopeMode === "none" ? "brand" : scopeMode}
        scopeId={targetId ?? null}
        onClose={() => setEditingCard(null)}
        onSaved={() => positioningCoverageQuery.refetch?.()}
      />

      {/* 2026-10-03：通路角色編輯視窗（五格 + 與 AI 討論 + 貼上現成文字）。
          存檔後重抓 scope.active，卡片才會讀到新內容。 */}
      <ChannelRoleModal
        open={!!editingChannel}
        channel={editingChannel}
        brandId={scopeMode === "brand" ? (targetId ?? null) : null}
        saved={editingChannel ? positioningSegmentData.channelRoles?.[editingChannel] : null}
        onClose={() => setEditingChannel(null)}
        onSaved={() => utils?.scope?.active?.invalidate?.()}
      />
    </main>
  );
}

// 2026-09-23：buildBrandCheatPreview 移除——它只服務已經拿掉的「武器化工具」
// 卡片預覽（速查卡），現在沒有任何 call site。SpeedCardView 這條 section 路由
// 本身還在，沒有牽動它。

/* 2026-09-26：AssetCard（舊的視覺／文字圖磚）退場。視覺與文字兩頁現在都用
   TaskCardShell —— 站上的任務卡只有一種長相。 */


/* 2026-09-26：previewForAsset 隨舊視覺圖磚一起退場（卡片預覽改由
   VisualAssetBoard 自己算，規則跟 visualHasContent 同一份）。 */


/* ─────────────────────────── PositioningPanel ───────────────────────── */
// Renders the 完整定位書 / 速查卡 sub-views for the active scope.
// Reads positioning JSON from the appropriate router (brand / product / event)
// and persists edits via mutation; segment list comes from positioningSchema.

/* ─────────────────────────── BrandAssetTile ─────────────────────────── */

/* ─────────────────────────── CopyTabInline ───────────────────────────
   Inline-editable card grid for the 文字 tab. Each card contains the
   actual editor (no click-to-navigate). Debounced auto-save (800ms)
   patches positioning._assets[<key>] via scope.savePositioning. AI 協助填
   per-card lives inside InlineAssetCard and writes through onChange.
   Compact lock chip sits top-right (replaces the old wide TabActionBar).
   ───────────────────────────────────────────────────────────────────── */
/* 2026-09-26：COPY_TILE_GROUPS（4 組 11 張帶粉彩底色的圖磚）已退場。卡片定義
   搬到 components/positioning/CopyAssetBoard.tsx 的 COPY_ASSETS——那裡沒有色票
   （設計系統：顏色只有功能性意義），而且每張多了「填了會影響什麼」，使用者才
   判斷得出要不要加那張卡。 */

