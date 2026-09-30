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
import { IllustratedEmpty } from "../../platform/components/EmptyIllustration";
import React, { useMemo, useState, useRef } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import type { ShellOutletCtx } from "../../app/shell/ShellLayout";
import { isStrategyPreviewEmail, isPersonaPreviewEmail } from "../../app/shell/ShellLayout";
import { Avatar, Button, Card, CardBody, Chip, Input, Textarea, Spinner, Select, SelectItem, CheckboxGroup, Checkbox } from "@heroui/react";
import SegmentEditor from "../components/positioning/SegmentEditor";
import ThinkingOverlay from "../components/positioning/ThinkingOverlay";
import PipelineRunner, { type PipelineState } from "../components/positioning/PipelineRunner";
import PipelineThinkingPanel from "../components/positioning/PipelineThinkingPanel";
import AgentPersonaBar from "../components/positioning/AgentPersonaBar";
import SpeedCard from "../components/positioning/SpeedCard";
import BrandAssetEditor, { type AssetKey } from "../components/positioning/BrandAssetEditor";
import KnowledgeEditor from "../components/positioning/KnowledgeEditor";
import PositioningDocPanel from "../components/positioning/PositioningDocPanel";
import CustomCardEditor, { type EditableCard } from "../components/positioning/CustomCardEditor";
import AssetPhotoGallery from "../components/positioning/AssetPhotoGallery";
import { InfoTab as BrandInfoTab, DangerTab as BrandDangerTab, PublishTab as BrandPublishTab } from "../components/positioning/BrandSettingsSheet";
import StrategyMeetingsPanel from "../components/meetings/StrategyMeetingsPanel";
import BrainPanel from "../components/brain/BrainPanel";
import BrandOnboardingWizard from "../components/onboarding/BrandOnboardingWizard";
import StrategyWorkbench from "../components/positioning/StrategyWorkbench";
import AIBriefPanel from "../components/positioning/AIBriefPanel";
import StrategyAlertsPanel from "../components/positioning/StrategyAlertsPanel";
import PersonaAgentPanel from "../components/positioning/PersonaAgentPanel";
import { showToastGlobal } from "../../../components/ui/Toast";
import AddEntityModal, { type AddEntityTab } from "../components/AddEntityModal";
import ProductDetailModal from "../components/positioning/ProductDetailModal";
// Notion-style line icons
import { LockToggle } from "../components/positioning/LockToggle";
import { AgentIcon, MemoryIcon, AwardIcon, BundleIcon, CommentIcon, DeleteIcon, EditIcon, FontIcon, GenerateIcon, HashtagIcon, IdCardIcon, LibraryIcon, LockIcon, PaletteIcon, PeopleIcon, PlayIcon, QuoteIcon, RegenerateIcon, ShieldIcon, TargetIcon, TextIcon, DoneIcon, StopIcon, WarningIcon, CheckIcon, CloseIcon } from "../../platform/components/icons";
import { SCOPE_SEGMENTS, type SegmentSpec } from "../lib/positioningSchema";
import { pickProductImageUrl } from "../lib/productImage";
import { readProductFacts } from "../lib/productFacts";
import CampaignWorkspace from "../components/positioning/CampaignWorkspace";
import CopyAssetBoard, { COPY_ASSETS } from "../components/positioning/CopyAssetBoard";
import VisualAssetBoard from "../components/positioning/VisualAssetBoard";
import { pipelineFor, type PipelineStepSpec } from "../lib/positioningPipeline";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { HelpTip } from "../../platform/components/HelpTip";
import {
  faPlus, faPalette, faFont, faQuoteLeft, faBullseye, faUsers, faImage, faIcons, faChartPie, faImages, faPenNib, faShieldHalved, faFolderOpen, faBookOpen, faTableList, faBox, faRocket, faBullhorn, faWandMagicSparkles, faGear, faStickyNote, faTrashCan, faSatelliteDish, faStethoscope, faFileArrowUp,
} from "@fortawesome/free-solid-svg-icons";

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
  const [activeStrategyTool, setActiveStrategyTool] = useState<null | "monitor" | "healthcheck">(() => {
    const t = searchParams.get("tool");
    return t === "monitor" || t === "healthcheck" ? t : null;
  });
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
  const tabLocksQuery = (trpc as any).theater?.getTabLocks?.useQuery
    ? (trpc as any).theater.getTabLocks.useQuery(
        { brandId: activeBrandIdForLocks ?? 0 },
        { enabled: !!activeBrandIdForLocks, refetchOnWindowFocus: false }
      )
    : { data: null, refetch: () => {} };
  const tabLocks = (tabLocksQuery.data as { positioning: any; copy: any; visual: any } | null) ?? { positioning: null, copy: null, visual: null };
  const lockTabMut   = (trpc as any).theater?.lockTab?.useMutation();
  const unlockTabMut = (trpc as any).theater?.unlockTab?.useMutation();
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
        bo.rootBelief && { layer: "根信念", body: bo.rootBelief },
        bo.founderStory && { layer: "創辦故事", body: bo.founderStory },
        bo.triggerMoment && { layer: "觸發時刻", body: bo.triggerMoment },
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
        story: others.length ? `其他候選：\n${others.map((c: string) => "· " + c).join("\n")}` : "",
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
  const dnaQ = (trpc as any).brandColors?.getCurrent?.useQuery?.(
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
  const connQuery = (trpc as any).brand?.getConnections?.useQuery?.(
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

  // 2026-07-29 (「穩定了」— generalize Strategy Workbench to events): the
  // workbench's chip-derivation logic expects brand-shaped keys (audience.
  // primary/secondary, competition.direct, differentiation). Events store
  // audience under primaryAudience/secondaryAudience and have no competition/
  // differentiation segments of their own — so when scope is on an event we
  // build a translated + merged view for the workbench only: event's own
  // audience (remapped) + the PARENT BRAND's competition/differentiation
  // borrowed read-only for grounding. positioningSegmentData itself (used by
  // PositioningGrid / AssetCard) stays untouched — this merge is workbench-only.
  const workbenchPositioning: Record<string, any> = React.useMemo(() => {
    if (scopeMode !== "event") return positioningSegmentData;
    const evAud = positioningSegmentData?.audience ?? {};
    const brandPos = (_sa?.brand?.positioning ?? {}) as Record<string, any>;
    return {
      ...positioningSegmentData,
      audience: {
        primary: [evAud.primaryAudience, evAud.keyInsight].filter(Boolean).join("\n"),
        secondary: evAud.secondaryAudience ?? "",
      },
      competition: brandPos.competition ?? {},
      differentiation: brandPos.differentiation ?? {},
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMode, positioningSegmentData, _sa?.brand?.positioning]);

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
  const category: "positioning" | "copy" | "visual" | "knowledge" | "info" | "publish" | "settings" | "products" | "events" | "meetings" | "brain" | "persona" | "campaign" =
    urlCat === "copy" ? "copy"
    : urlCat === "knowledge" ? "knowledge"
    : urlCat === "visual" ? "visual"
    : urlCat === "info" ? "info"
    : urlCat === "publish" ? "publish"
    : urlCat === "settings" ? "settings"
    : urlCat === "products" ? "products"
    : urlCat === "events" ? "events"
    : urlCat === "meetings" ? "meetings"
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
  const setCategory = (next: "positioning" | "copy" | "knowledge" | "info" | "visual" | "publish" | "products" | "events" | "meetings" | "brain" | "persona") => {
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set("cat", next);
      return nextParams;
    }, { replace: true });
  };

  // Products + events for brand tabs — must be after `category` is declared (TDZ guard)
  const brandProductsQ = (trpc as any).product?.list?.useQuery?.(
    { brandId: activeBrandIdForLocks ?? 0 },
    { enabled: !!activeBrandIdForLocks && category === "products", refetchOnWindowFocus: false, staleTime: 30_000 },
  );
  const brandEventsQ = (trpc as any).event?.list?.useQuery?.(
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
  const prodPosStatusQ = (trpc as any).positioningJobs?.getStatusBatch?.useQuery?.(
    { entityKind: "product", entityIds: posRunning.product },
    { enabled: posRunning.product.length > 0, refetchInterval: 4000 },
  );
  const evPosStatusQ = (trpc as any).positioningJobs?.getStatusBatch?.useQuery?.(
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

      const text = realThinking ?? step.mockThinking ?? "";
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
  const autoPosJobStatus = (trpc as any).positioningJobs?.getStatus?.useQuery?.(
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
          stepTitle: pipelineSteps[pipeline.cursor]!.title,
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
        {/* 2026-05-11 (CJ「品牌管理」): breadcrumb back to /brands manager */}
        <div className="absolute top-5 left-5 z-10">
          <a
            href="/brands?all=1"
            className="flex items-center gap-1 text-xs text-neutral-700 hover:text-neutral-900 transition"
          >
            ← {lang === "en" ? "All brands" : "所有品牌"}
          </a>
        </div>
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
                  { v: "meetings"    as const, label: lang === "en" ? "Meetings" : "會議",
                      desc: lang === "en" ? "Recurring strategy meetings" : "定期策略會議",
                      Icon: PeopleIcon,     scopes: ["brand", "product"] },
                  { v: "brain"       as const, label: lang === "en" ? "Brain" : "大腦",
                      desc: lang === "en" ? "What the AI remembers" : "AI 記住了什麼",
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
                  設定
                </button>
              );
            })()}
          </nav>
        </aside>
        )}

        {/* Right: scope-aware content pane — driven by `section` (sidebar handles all nav) */}
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col" style={{ minWidth: 0 }}>
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
                  {(pipeline.status === "idle" || pipeline.status === "done") && scopeMode !== "none" && (
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {scopeMode === "brand" && activeBrandIdForLocks && (
                        <StrategyToolIcon
                          active={activeStrategyTool === "monitor"}
                          onClick={() => setActiveStrategyTool(activeStrategyTool === "monitor" ? null : "monitor")}
                          icon={faSatelliteDish}
                          label={lang === "en" ? "Strategy Monitoring" : "策略監測"}
                        />
                      )}
                      {(scopeMode === "brand" || scopeMode === "event") && activeBrandIdForLocks && (
                        <StrategyToolIcon
                          active={activeStrategyTool === "healthcheck"}
                          onClick={() => setActiveStrategyTool(activeStrategyTool === "healthcheck" ? null : "healthcheck")}
                          icon={faStethoscope}
                          label={lang === "en" ? "Strategy Health Check" : "策略健檢"}
                        />
                      )}
                      <StrategyToolIcon
                        active={false}
                        onClick={() => setSection("doc" as any)}
                        icon={faFileArrowUp}
                        label={lang === "en" ? "Upload your positioning doc" : "上傳定位資料"}
                        // 格式以 PositioningDocPanel 的 ACCEPT 為準（.docx/.pptx/
                        // .pdf/.md/.txt/.html）＋貼對話文字，不要在這裡承諾它吃不了的。
                        title={lang === "en"
                          ? "Upload your own positioning doc (Word / PPT / PDF / Markdown / txt / html) — or paste a ChatGPT conversation"
                          : "上傳你自己的定位文件（Word / PPT / PDF / Markdown / txt / html），或直接貼 ChatGPT 對話文字"}
                      />
                      {pipeline.status === "idle" && (
                        <PositioningTopRow
                          // 2026-05-13 (CJ「按了套用活動定位框架時，出現Event not found」):
                          // pass the scope-aware entity id, not the brand id.
                          // When scope is event/product, server looks up
                          // events.id = entityId — passing brandId here
                          // mismatched and returned "not found".
                          brandId={targetId as number | null}
                          scopeMode={scopeMode}
                          locked={!!tabLocks.positioning}
                        />
                      )}
                    </div>
                  )}

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
                      {activeStrategyTool === "healthcheck" && (scopeMode === "brand" || scopeMode === "event") && activeBrandIdForLocks ? (
                        <StrategyWorkbench
                          brandId={activeBrandIdForLocks}
                          eventId={scopeMode === "event" ? (scope?.eventId ?? null) : null}
                          positioning={workbenchPositioning}
                          lang={lang}
                          // 2026-08-21 (CJ「鎖定後，策略工作檯就會只留下最後
                          // 定案的，變成下方的文字就好」): only brand scope
                          // has a 定位 lock — events aren't lockable.
                          locked={scopeMode === "brand" ? !!tabLocks.positioning : false}
                        />
                      ) : null}
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
                    </>
                  )}
                </div>
              ) : (
              /* ── 選了具體 section → 原本的內容 ── */
              <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
                <button onClick={() => setSection("pos:home")} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, color: "#78716C", background: "none", border: "none",
                  cursor: "pointer", padding: 0, marginBottom: 4,
                }}>
                  ← {lang === "en" ? "Positioning overview" : "品牌定位總覽"}
                </button>
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
                      {/* Back to grid */}
                      <button onClick={() => setSection("asset:all")} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        fontSize: 12, color: "#78716C", background: "none", border: "none",
                        cursor: "pointer", marginBottom: 16, padding: 0,
                      }}>
                        ← {lang === "en" ? "All assets" : "所有資產"}
                      </button>
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

          {/* ── 宣傳企劃（活動限定）──
              2026-09-25：策略層只排不寫。每一格的「去寫這篇」與底部的「開始撰寫」
              都是通往內容層活動 tray 的門。 */}
          {derivedCategory === "campaign" && scopeMode === "event" && scope?.eventId && (
            <div style={{ padding: "24px" }}>
              <CampaignWorkspace eventId={scope.eventId} brandId={scope?.brandId ?? brandId ?? null} />
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

          {/* ── 會議 (meetings) — 定期策略會議 ──
               2026-09-26（CJ「將定期開會變成一個新的 mission tray」）：取代原本的
               「品牌工具」。品牌與產品範圍都看得到——會議本身
               可以選要討論品牌或某個產品。 */}
          {derivedCategory === "meetings" && activeBrandIdForLocks && (
            <div style={{ padding: "8px 0 32px" }}>
              <StrategyMeetingsPanel brandId={activeBrandIdForLocks} />
            </div>
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
                kind="product"
                items={brandProductsList}
                isLoading={brandProductsQ?.isLoading ?? false}
                lang={lang}
                onAdd={() => setAddModal({ open: true, tab: "product" })}
                onOpen={(id) => setProductDetailId(id)}
                onDelete={(id) => prodRemoveMut?.mutate?.({ id })}
                onPosition={(id) => kickReposition("product", id, brandProductsList?.find((p: any) => p.id === id)?.name)}
                runningIds={posRunning.product}
                progressMap={posProgress}
              />
            </div>
          )}

          {/* ── 活動 (events) — card grid with positioning preview ── */}
          {derivedCategory === "events" && scopeMode === "brand" && (
            <div style={{ padding: "8px 0 32px" }}>
              <BrandEntityGrid
                kind="event"
                items={brandEventsList}
                isLoading={brandEventsQ?.isLoading ?? false}
                lang={lang}
                onAdd={() => setAddModal({ open: true, tab: "event" })}
                onOpen={(id) => {
                  // 2026-07-28 (CJ「選活動定位卡片，跑回品牌定位頁面」follow-up):
                  // the previous setCategory fix (functional-updater form)
                  // still wasn't enough — react-router-dom's setSearchParams
                  // recomputes its updater against the `searchParams` value
                  // captured in THIS render's closure, not a truly queued
                  // "latest" state the way React's own useState setter works.
                  // Two separate setSearchParams calls in the same
                  // synchronous handler (goToEntity, then setCategory) both
                  // read that same pre-call snapshot, so the second call's
                  // result always overwrites the first's — dropping `e`
                  // every time. Single combined call is the only fix that
                  // actually lands both changes atomically.
                  // 2026-09-25（CJ「我填完活動定位後，他按下開始定位，居然跑到品牌
                  // 的頁籤」）：活動的落點改成宣傳企劃。得獎 brief 仍在
                  // cat=positioning，由企劃頁的「參獎／提案」進階入口進去。
                  setSearchParams((prev) => {
                    const sp = new URLSearchParams(prev);
                    sp.delete("p");
                    sp.set("e", String(id));
                    sp.set("cat", "campaign");
                    return sp;
                  }, { replace: true });
                }}
                onDelete={(id) => evRemoveMut?.mutate?.({ id })}
                // 2026-09-25：活動的「開始」＝進宣傳企劃頁，不是跑得獎 brief。
                onPosition={(id) => {
                  setSearchParams((prev) => {
                    const sp = new URLSearchParams(prev);
                    sp.delete("p");
                    sp.set("e", String(id));
                    sp.set("cat", "campaign");
                    return sp;
                  }, { replace: true });
                }}
                runningIds={posRunning.event}
                progressMap={posProgress}
              />
            </div>
          )}
        </div>
      </div>

      {/* 2026-05-13 (CJ「右下方的客服，被新增擋住了」):
          page-level + 新增 FAB removed — it overlapped Mia avatar at the
          same screen corner. Same actions are reachable from the
          BrandHierarchyPill 「+ 新增品牌 / 產品 / 活動」 menu top-left.
          AddEntityModal is still mounted below (other triggers fire it). */}

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
        onClose={() => setAddModal({ open: false, tab: addModal.tab })}
        onCreated={(kind, id) => {
          if (kind === "brand") { setBrandId(id); setScope({ brandId: id, productId: null, eventId: null }); }
          // 2026-07-27 (CJ「新增產品後，突然跑到一個奇怪頁面」): goToEntity(kind, id)
          // drills straight into the new product/event's own near-empty
          // sub-workspace page — disorienting right after creation, when
          // there's nothing there yet. Land back on the list instead (clear
          // any stale p/e so a leftover single-item view doesn't win) so the
          // user can see the new card and kick off positioning from there.
          else if (kind === "product" || kind === "event") {
            void id;
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set("cat", kind === "product" ? "products" : "events");
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
    </main>
  );
}

/* ─────────────────────────── TabActionBar ───────────────────────────
 *
 * Shared action bar for 定位 / 文字 / 視覺 tabs. State-aware label:
 *   locked        → button disabled "已鎖定 — 解鎖才能編輯"
 *   running (定位) → 暫停 / 跳過此步 / 停止
 *   paused  (定位) → 繼續
 *   has content   → 重新___ (rotate icon)
 *   empty         → 開始___ (play icon)
 *
 * Uses Notion-style line icons (Lucide) instead of FontAwesome.
 */
function TabActionBar({
  tab, label, locked, hasContent, statusText, subText,
  pipelineStatus, onPause, onResume, onSkip, onStop, onAction, busy,
}: {
  tab: "positioning" | "copy" | "visual";
  label: string;
  locked: boolean;
  hasContent: boolean;
  statusText: string;
  subText?: string;
  pipelineStatus?: string;
  onPause?: () => void;
  onResume?: () => void;
  onSkip?: () => void;
  onStop?: () => void;
  onAction: () => void;
  /** Non-pipeline tabs (visual/copy) don't have a running/paused pipeline
   *  state — `busy` covers a one-shot mutation in flight (e.g. visual
   *  auto-fill) so the button still shows a loading state. */
  busy?: boolean;
}) {
  const { lang } = useLang();
  const isRunning = pipelineStatus === "running";
  const isPaused  = pipelineStatus === "paused";
  return (
    <div style={{
      borderBottom: "1px solid #E5E7EB",
      background: "#FAFAFA",
      padding: "16px 28px",
    }}>
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#18181B", margin: 0 }}>
            {locked
              ? (lang === "en" ? `${label} is locked — unlock to edit` : `${label}已鎖定 — 解鎖才能編輯`)
              : isRunning || busy
                ? (lang === "en" ? "Analyzing…" : "正在分析中…")
                : statusText}
          </p>
          {subText && (
            <p style={{ fontSize: 12, color: "#71717A", margin: "2px 0 0" }}>
              {subText}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {tab === "positioning" && isRunning && (
            <>
              <Button size="sm" variant="bordered" onPress={onPause}>{lang === "en" ? "Pause" : "暫停"}</Button>
              <Button size="sm" variant="bordered" onPress={onSkip}>{lang === "en" ? "Skip step" : "跳過此步"}</Button>
              <Button size="sm" variant="bordered" color="danger" onPress={onStop}>{lang === "en" ? "Stop" : "停止"}</Button>
            </>
          )}
          {tab === "positioning" && isPaused && (
            <Button
              size="sm"
              onPress={onResume}
              startContent={<PlayIcon size={14} strokeWidth={2} />}
              style={{ background: "#18181B", color: "white" }}
            >
              {lang === "en" ? "Continue" : "繼續"}
            </Button>
          )}
          {(!isRunning && !isPaused) && (
            <Button
              size="lg"
              isDisabled={locked || busy}
              isLoading={busy}
              onPress={onAction}
              startContent={
                busy ? undefined :
                locked ? <LockIcon size={15} strokeWidth={2} /> :
                hasContent ? <RegenerateIcon size={15} strokeWidth={2} /> :
                <PlayIcon size={15} strokeWidth={2} />
              }
              style={{
                background: locked ? "#E4E4E7" : "#18181B",
                color: locked ? "#A1A1AA" : "white",
                fontSize: 14, fontWeight: 600,
                cursor: locked ? "not-allowed" : "pointer",
              }}
            >
              {locked
                ? (lang === "en" ? "Locked" : "已鎖定")
                : busy
                  ? (lang === "en" ? "Generating…" : "生成中…")
                  : hasContent
                    ? (lang === "en" ? `Redo ${label.toLowerCase()}` : `重新${label}`)
                    : (lang === "en" ? `Start ${label.toLowerCase()}` : `開始${label}`)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── PositioningBrainBar ─────────────────────

/* ─────────────────────────── PositioningGrid ───────────────────────── */
// 品牌定位的 card grid — 速查卡/指令庫 + segments 分組顯示
function PositioningGrid({
  scopeMode, segments, onSelect, segmentData, customSegments, onDeleteCustomSegment, onEditCustomSegment,
}: {
  scopeMode: "brand" | "product" | "event" | "none";
  segments: import("../lib/positioningSchema").SegmentSpec[];
  onSelect: (section: string) => void;
  /** Map of segment id → its current content (top-level positioning keys). */
  segmentData?: Record<string, any>;
  /** 2026-09-23: cards the user built from an uploaded/pasted positioning doc
   *  that don't map onto any fixed schema segment (e.g. 「品牌願景」). Full
   *  management (create from a document, delete) lives in PositioningDocPanel
   *  ("我的定位文件"); shown here too so they sit alongside the fixed
   *  segments instead of being hidden in a sub-page. */
  customSegments?: { id: string; title: string; fields: { key: string; label: string; value: string }[] }[];
  onDeleteCustomSegment?: (segmentId: string) => void;
  /** 2026-09-24（CJ「按下新增卡片時，只是要她編輯該卡片的標題和內容」）：
   *  開卡片編輯器。傳 null = 新增一張；傳 id = 編輯那一張。 */
  onEditCustomSegment?: (segmentId: string | null) => void;
}) {
  const { lang } = useLang();
  const groupLabels: Record<string, { zh: string; en: string }> = {
    "1": { zh: "品牌識別", en: "Brand identity" },
    "2": { zh: "品牌背景", en: "Brand backstory" },
    "3": { zh: "目標受眾", en: "Target audience" },
    "4": { zh: "市場分析", en: "Market analysis" },
    "5": { zh: "競爭策略", en: "Competitive strategy" },
    "6": { zh: "行銷策略", en: "Marketing strategy" },
    "7": { zh: "市場趨勢", en: "Market trends" },
    "8": { zh: "品牌個性", en: "Brand personality" },
  };
  // 2026-07-28 (CJ「定位的呈現沒有邏輯性…看起來沒有策略感」→ mockup 定案):
  // brand scope reorders into a STRATEGY NARRATIVE — research → synthesis →
  // expression → tools — each act titled by the question it answers.
  // Display numbers follow the acts (data/segment ids untouched); the tools
  // group moves to the END (they're positioning OUTPUTS, not the opening).
  // Product/event keep the original num-prefix grouping.
  //
  // 2026-09-23（CJ「目前第一排是一張卡片，第二排有兩張卡片，版面都沒有排
  // 整齊，我想要每一排都是三張卡片」）：原本 5 幕（1/2/2/2/3 張）沒有一幕
  // 是自己的 grid 容器裡塞滿 3 張，行行都缺角。10 個 segment 重新分成 3 幕
  // 各 3 張——goldenCircle 從「策略結晶」搬到「自我探索」跟起源／價值觀放
  // 一起（WHY 信念本來就該扎根在起源與價值觀，敘事上比跟差異化放一起更
  // 合理，不只是為了湊數）。taglineScore 不再是獨立卡片（資料還在，只是
  // 暫時沒有專屬卡片入口）。
  const BRAND_ACTS: Array<{ label: { zh: string; en: string }; q: { zh: string; en: string }; ids: string[] }> = [
    { label: { zh: "第一幕・市場與競爭研究", en: "Act 1 · Market & competitive research" },
      q: { zh: "她缺什麼？誰已經在滿足她、缺口在哪？—— 定位不是從「我是誰」開始，是先看懂她，再看懂戰場。", en: "What does she lack, and who's already trying to serve her? Positioning starts with her and the battlefield, not with us." },
      ids: ["audience", "competition", "trends"] },
    { label: { zh: "第二幕・自我探索", en: "Act 2 · Self discovery" },
      q: { zh: "憑什麼是我們？—— 起源、價值觀與信念一起回答「為什麼是我們」，三者本來就是同一件事。", en: "Why us? Origin, values, and belief answer 'why us' together — they were never three separate things." },
      ids: ["origin", "values", "goldenCircle"] },
    { label: { zh: "第三幕・策略表達", en: "Act 3 · Strategy & expression" },
      q: { zh: "所以，我們該說什麼、怎麼說 —— 差異化是前兩幕的結論，標語與語氣把它變成日常可執行的文字。", en: "So what do we say, and how — differentiation is the conclusion of the first two acts; tagline and voice turn it into words you use every day." },
      ids: ["differentiation", "tagline", "voice"] },
  ];
  const brandActGroups = React.useMemo(() => {
    if (scopeMode !== "brand") return null;
    const byId = new Map(segments.map((s) => [s.id, s]));
    return BRAND_ACTS
      .map((act, ai) => ({
        label: lang === "en" ? act.label.en : act.label.zh,
        intro: lang === "en" ? act.q.en : act.q.zh,
        segs: act.ids
          .map((id, i) => ({ spec: byId.get(id), num: `${ai + 1}.${i + 1}` }))
          .filter((x): x is { spec: NonNullable<typeof x.spec>; num: string } => !!x.spec),
      }))
      .filter((g) => g.segs.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, lang, scopeMode]);

  // Derive groups from segment num prefix
  const groupedSegs = React.useMemo(() => {
    const map = new Map<string, { label: string; prefix: string; segs: typeof segments }>();
    for (const s of segments) {
      const prefix = s.num.split(".")[0]!;
      // 2026-07-20 (CJ「活動定位頁第 9-11 章顯示通用編號，其餘有描述性名稱，
      // 命名不一致」): groupLabels only covers 1-8 AND its wording is
      // brand-specific (品牌識別/市場分析…). Event segments are one-per-
      // chapter with proper titles of their own (戰略 Brief…用戶旅程) —
      // use those directly so all 11 chapters are descriptive and
      // semantically correct. Brand/product grouping unchanged.
      const pair = scopeMode === "event" ? undefined : groupLabels[prefix];
      const ownTitle = scopeMode === "event"
        ? (lang === "en" ? ((s as any).titleEn ?? s.title) : s.title)
        : null;
      const label = pair
        ? (lang === "en" ? pair.en : pair.zh)
        : ownTitle ?? (lang === "en" ? `Chapter ${prefix}` : `第 ${prefix} 章`);
      // Stable key by zh label so intro lookup works regardless of UI language
      const key = pair ? pair.zh : (scopeMode === "event" ? s.title : `第 ${prefix} 章`);
      if (!map.has(key)) map.set(key, { label, prefix, segs: [] });
      map.get(key)!.segs.push(s);
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, lang, scopeMode]);

  // Icon map per segment id
  const ICONS: Record<string, any> = {
    goldenCircle: faBullseye, tagline: faPenNib, taglineScore: faChartPie,
    origin: faBookOpen, values: faShieldHalved,
    audience: faUsers, competition: faTableList,
    differentiation: faRocket, trends: faBullhorn, voice: faQuoteLeft,
    // product / event fallbacks
    core: faBullseye, positioning: faBullseye, smp: faWandMagicSparkles,
  };

  const segFilled = (sid: string) => {
    const v = segmentData?.[sid];
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "object") return Object.values(v).some(x => x != null && (typeof x !== "string" || x.trim()));
    return true;
  };

  return (
    <div style={{ padding: "8px 0 24px", display: "flex", flexDirection: "column", gap: 36 }}>
      {/* ── Brand scope: four-act strategy narrative ── */}
      {brandActGroups && brandActGroups.map((group) => (
        <div key={group.label}>
          <SectionLabel
            label={group.label}
            counter={`${group.segs.filter(({ spec }) => segFilled(spec.id)).length} / ${group.segs.length}`}
            intro={group.intro}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {group.segs.map(({ spec: s, num }) => {
              const segVal = segmentData?.[s.id];
              const { node: preview, hasContent } = renderSegmentPreview(s.id, segVal, lang);
              return (
                <PositioningCard
                  key={s.id}
                  label={`${num} ${lang === "en" ? (s.titleEn ?? s.title) : s.title}`}
                  icon={ICONS[s.id] ?? faBookOpen}
                  onClick={() => onSelect(`seg:${s.id}`)}
                  preview={preview}
                  hasContent={hasContent}
                  rationale={lang === "en" ? (s.rationaleEn ?? s.rationale) : s.rationale}
                  sourceLabel={lang === "en" ? "SoWork positioning method" : "SoWork 品牌定位法"}
                  headline={segmentHeadline(s.id, segVal)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Segment groups (product / event — unchanged) ── */}
      {!brandActGroups && groupedSegs.map((group) => (
        <div key={group.label}>
          <SectionLabel
            label={group.label}
            counter={`${group.segs.filter(s => {
              const v = segmentData?.[s.id];
              if (v == null) return false;
              if (typeof v === "string") return v.trim().length > 0;
              if (typeof v === "object") return Object.values(v).some(x => x != null && (typeof x !== "string" || x.trim()));
              return true;
            }).length} / ${group.segs.length}`}
            intro={SOWORK_GROUP_INTRO[group.prefix]?.[lang === "en" ? "en" : "zh"]}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {group.segs.map((s) => {
              const segVal = segmentData?.[s.id];
              const { node: preview, hasContent } = renderSegmentPreview(s.id, segVal, lang);
              return (
                <PositioningCard
                  key={s.id}
                  label={`${s.num} ${lang === "en" ? (s.titleEn ?? s.title) : s.title}`}
                  icon={ICONS[s.id] ?? faBookOpen}
                  onClick={() => onSelect(`seg:${s.id}`)}
                  preview={preview}
                  hasContent={hasContent}
                  rationale={lang === "en" ? (s.rationaleEn ?? s.rationale) : s.rationale}
                  sourceLabel={lang === "en" ? "SoWork positioning method" : "SoWork 品牌定位法"}
                  headline={segmentHeadline(s.id, segVal)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* ── 自訂卡片 — 從上傳/貼上的定位文件建立、套不進上面任何固定欄位的內容
          （例如「品牌願景」）。跟固定 segment 卡片同一套視覺，永遠顯示（就算目前
          0 張）讓使用者發現這個功能，虛線卡是進入點 —— 完整的建立/確認流程在
          「我的定位文件」("doc")，這裡不重做一次上傳/AI 提案的 UI。 ── */}
      <div>
        <SectionLabel
          label={lang === "en" ? "Your cards" : "自訂卡片"}
          counter={customSegments && customSegments.length > 0 ? String(customSegments.length) : undefined}
          intro={lang === "en"
            ? "Content that didn't fit any fixed field above — built from an uploaded document or a pasted AI conversation. Read by every task just like the fields above."
            : "套不進上面固定欄位的內容 —— 從上傳的定位文件或貼上的 AI 對話建立，一樣會被每次任務執行讀到。"}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(customSegments ?? []).map((seg) => (
            <PositioningCard
              key={seg.id}
              label={seg.title}
              icon={faStickyNote}
              // 2026-09-24：點自己的卡片就是要改它的內容，不是跳去「我的定位
              // 文件」那一整套上傳/對映流程（那裡也沒有「編輯這張卡」這個動作）。
              onClick={() => onEditCustomSegment?.(seg.id)}
              hasContent
              preview={
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                  {seg.fields.slice(0, 4).map((f) => (
                    <li key={f.key}>
                      <strong style={{ color: "#171717", fontWeight: 600 }}>{f.label}：</strong>
                      {truncate(f.value, 60)}
                    </li>
                  ))}
                </ul>
              }
              onDelete={onDeleteCustomSegment ? () => onDeleteCustomSegment(seg.id) : undefined}
              sourceLabel={lang === "en" ? "From your document" : "來自你的定位文件"}
              headline={seg.fields[0]?.value ? truncate(seg.fields[0].value, 50) : undefined}
            />
          ))}
          <button
            // 2026-09-24（CJ「按下新增卡片時，只是要她編輯該卡片的標題和內容，
            // 內容可以打字或是直接上傳文件」）：原本按下去是跳到「我的定位文件」
            // ——那是「上傳整份定位書 → AI 對映固定欄位」的流程，跟「我要自己
            // 加一張卡」是兩件事，而且那一頁根本沒有「新增卡片」這個動作。
            onClick={() => onEditCustomSegment?.(null)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
            style={{ minHeight: 124, padding: 16 }}
          >
            <FontAwesomeIcon icon={faPlus} style={{ fontSize: 16 }} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>
              {lang === "en" ? "Add a card" : "新增卡片"}
            </span>
          </button>
        </div>
      </div>

      {/* 2026-05-11 (CJ 4A discipline): removed gradient purple FAB.
          New tasks are launched via top-bar / hero, not a decorative
          floating button. Page stays editorial. */}
    </div>
  );
}

/* ────────────────────── Preview extractors ──────────────────────
   These read the actual positioning JSON shape per segment and render
   a short editorial preview (≤4 lines) for the layer-1 card grid, so
   users see real content without drilling in.
   2026-05-11 (CJ「我希望只有在一頁呈現，不用再點進去」)
   ────────────────────────────────────────────────────────────────── */
const truncate = (s: string, n = 130) => {
  const t = String(s).trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};
const firstTruthy = (...xs: any[]): string | null => {
  for (const x of xs) {
    if (typeof x === "string" && x.trim()) return x.trim();
  }
  return null;
};
const isFilledArr = (a: any) => Array.isArray(a) && a.some((x: any) =>
  typeof x === "string" ? x.trim() : x != null,
);

/**
 * 2026-09-23（CJ「在看到品牌定位卡片之上，有太多按鈕了…策略總監化為一個
 * ICON。問用戶是否需要策略監測或健檢，若需要，才會啟動」）：策略總監／
 * 策略監測／策略健檢三個區塊的統一收合入口——單色線條圖示 + 文字標籤的
 * 小圓角按鈕，點下去才等於「使用者說需要」，對應區塊才真的掛載（不是
 * 只是 CSS 收合，未點開時 StrategyAlertsPanel/StrategyWorkbench 的查詢
 * 都不會發出）。active 狀態純用墨色深淺分，不上色——跟這個頁面其餘卡片
 * 同一套紀律。
 */
function StrategyToolIcon({
  active, onClick, icon, label, title,
}: { active: boolean; onClick: () => void; icon: any; label: string;
     /** 需要比標籤講更多時（例如「上傳定位資料」要說明吃哪些格式）。預設用 label。 */
     title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
        active
          ? "bg-neutral-900 border-neutral-900 text-white"
          : "bg-white border-neutral-300 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900"
      }`}
    >
      <FontAwesomeIcon icon={icon} style={{ fontSize: 12 }} />
      {label}
    </button>
  );
}

/** Render mini list of tokens (used for arrays). */
function TagRow({ items, max = 4 }: { items: string[]; max?: number }) {
  return (
    <span>
      {items.slice(0, max).map((x, i) => (
        <span key={i} style={{
          display: "inline-block", marginRight: 6, marginBottom: 3,
          fontSize: 12.5, color: "#404040",
          fontFamily: '"SF Mono", Menlo, monospace',
        }}>
          {x}
        </span>
      ))}
      {items.length > max && (
        <span style={{ fontSize: 12, color: "#525252" }}>+{items.length - max}</span>
      )}
    </span>
  );
}

/**
 * 2026-09-23（CJ「卡片上的縮圖，要怎麼樣，才能更具有意義，現在感覺是隨興
 * 出來的圖，是否要改成文字？」）：卡片 header 原本一律放一顆概念 icon——
 * 對定位卡來說，icon 只能代表「這是哪一格」，代表不了「這個品牌在這格寫了
 * 什麼」。改成直接抓這個 segment 自己最有代表性的一小段真實內容，當成
 * pull-quote 放大顯示——每張卡的縮圖因此變成獨一無二、屬於這個品牌自己的
 * 文字，不是套版圖示。回傳 null（還沒填）時 PositioningCard 照舊退回 icon，
 * 空卡片不會看起來壞掉。刻意跟 renderSegmentPreview 分開：這裡要純文字、
 * 更短（header 空間比 body 小很多），不需要 renderSegmentPreview 那套
 * 多行/列表的豐富排版。
 */
function segmentHeadline(segId: string, v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") { const t = truncate(v.trim(), 50); return t || null; }
  if (typeof v !== "object") return null;
  switch (segId) {
    case "goldenCircle": {
      const why = firstTruthy(v.why);
      return why ? truncate(why, 50) : null;
    }
    case "tagline": {
      const t = firstTruthy(v.zhTagline, v.enTagline);
      return t ? `「${truncate(t, 40)}」` : null;
    }
    case "origin": {
      const story = firstTruthy(v.story);
      return story ? truncate(story, 50) : null;
    }
    case "values": {
      const first = Array.isArray(v.items) ? v.items.find((x: any) => x?.label) : null;
      return first ? truncate(String(first.label), 30) : null;
    }
    case "audience": {
      const p = firstTruthy(v.primary, v.primaryAudience);
      return p ? truncate(p, 50) : null;
    }
    case "competition": {
      const first = Array.isArray(v.direct) ? v.direct.find((x: any) => x?.name) : null;
      if (first) return truncate(String(first.name), 30);
      const intensity = firstTruthy(v.intensity);
      return intensity ? truncate(intensity, 40) : null;
    }
    case "differentiation": {
      const t = firstTruthy(v.discriminator, v.summary);
      return t ? truncate(t, 50) : null;
    }
    case "trends": {
      const first = Array.isArray(v.favorable) ? v.favorable.find((x: any) => x?.name) : null;
      return first ? truncate(String(first.name), 40) : null;
    }
    case "voice": {
      const arche = isFilledArr(v.archetypes) ? v.archetypes[0] : null;
      return arche ? truncate(String(arche), 30) : null;
    }
    case "core": {
      const t = firstTruthy(v.oneLineValueProp, v.coreStatement, v.zhTagline);
      return t ? truncate(t, 50) : null;
    }
    case "smp": {
      const t = firstTruthy(v.singleMindedProposition);
      return t ? truncate(t, 50) : null;
    }
  }
  const cand = firstTruthy(
    v.summary, v.statement, v.text, v.story, v.body, v.description,
    v.primary, v.primaryAudience, v.coreMessage, v.creativeTheme,
    v.coreStatement, v.briefSummary, v.businessGoal,
  );
  return cand ? truncate(cand, 50) : null;
}

/** Smart preview per segment. Returns React node + whether considered filled. */
function renderSegmentPreview(segId: string, v: any, lang: "zh-TW" | "en" = "zh-TW"): { node: React.ReactNode | null; hasContent: boolean } {
  if (v == null) return { node: null, hasContent: false };
  if (typeof v === "string") {
    const t = v.trim();
    return t ? { node: <span>{truncate(t, 140)}</span>, hasContent: true } : { node: null, hasContent: false };
  }
  if (typeof v !== "object") return { node: null, hasContent: false };

  // ── Per-segment custom renderers ──
  switch (segId) {
    case "goldenCircle": {
      const why = firstTruthy(v.why);
      if (!why) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            <strong style={{ color: "#171717", fontFamily: "system-ui" }}>WHY · </strong>
            {truncate(why, 120)}
          </span>
        ),
        hasContent: true,
      };
    }
    case "tagline": {
      const zh = firstTruthy(v.zhTagline);
      const en = firstTruthy(v.enTagline);
      if (!zh && !en) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {zh && (
              <span style={{ display: "block", color: "#171717", fontWeight: 600, fontFamily: "system-ui", fontSize: 13 }}>
                「{truncate(zh, 40)}」
              </span>
            )}
            {en && (
              <span style={{ display: "block", color: "#404040", fontStyle: "italic", marginTop: 2 }}>
                {truncate(en, 60)}
              </span>
            )}
            {v.story && (
              <span style={{ display: "block", marginTop: 4, fontSize: 12 }}>
                {truncate(v.story, 80)}
              </span>
            )}
          </span>
        ),
        hasContent: true,
      };
    }
    case "taglineScore": {
      const total = v.total ?? (Array.isArray(v.rows) ? v.rows.reduce((acc: number, r: any) => acc + Number(r.score ?? 0), 0) : null);
      const rows = Array.isArray(v.rows) ? v.rows.filter((r: any) => r?.dim) : [];
      if (!total && rows.length === 0) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {total != null && (
              <span style={{ display: "block", marginBottom: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: "#171717", fontFamily: "system-ui" }}>{total}</span>
                <span style={{ fontSize: 12, color: "#525252", marginLeft: 4 }}>/ 100</span>
              </span>
            )}
            {rows.slice(0, 3).map((r: any, i: number) => (
              <span key={i} style={{ display: "block", fontSize: 12 }}>
                <span style={{ color: "#404040" }}>{r.dim}</span>
                <span style={{ color: "#171717", fontWeight: 600, marginLeft: 6 }}>{r.score}</span>
              </span>
            ))}
          </span>
        ),
        hasContent: true,
      };
    }
    case "origin": {
      const story = firstTruthy(v.story);
      if (!story) return { node: null, hasContent: false };
      return { node: <span>{truncate(story, 150)}</span>, hasContent: true };
    }
    case "values": {
      const items = Array.isArray(v.items) ? v.items.filter((x: any) => x?.label) : [];
      if (items.length === 0) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {items.slice(0, 4).map((it: any, i: number) => (
              <span key={i} style={{ display: "block", marginBottom: 2 }}>
                <span style={{ color: "#171717", fontWeight: 600, fontFamily: "system-ui" }}>· {it.label}</span>
                {it.body && (
                  <span style={{ color: "#404040", marginLeft: 4, fontSize: 12 }}>
                    {truncate(it.body, 40)}
                  </span>
                )}
              </span>
            ))}
            {items.length > 4 && <span style={{ fontSize: 12, color: "#525252" }}>+{items.length - 4}</span>}
          </span>
        ),
        hasContent: true,
      };
    }
    case "audience": {
      const p = firstTruthy(v.primary, v.primaryAudience);
      if (!p) return { node: null, hasContent: false };
      return { node: <span>{truncate(p, 150)}</span>, hasContent: true };
    }
    case "competition": {
      const intensity = firstTruthy(v.intensity);
      const direct = Array.isArray(v.direct) ? v.direct.filter((x: any) => x?.name) : [];
      if (!intensity && direct.length === 0) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {intensity && <span style={{ display: "block" }}>{truncate(intensity, 90)}</span>}
            {direct.length > 0 && (
              <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#404040", fontFamily: "system-ui" }}>
                vs {direct.slice(0, 3).map((d: any) => d.name).join("、")}
                {direct.length > 3 && <span> +{direct.length - 3}</span>}
              </span>
            )}
          </span>
        ),
        hasContent: true,
      };
    }
    case "differentiation": {
      const txt = firstTruthy(v.summary, v.emotional, v.functional);
      if (!txt) return { node: null, hasContent: false };
      return { node: <span>{truncate(txt, 150)}</span>, hasContent: true };
    }
    case "trends": {
      const fav = Array.isArray(v.favorable) ? v.favorable.filter((x: any) => x?.name) : [];
      const risks = Array.isArray(v.risks) ? v.risks.filter((x: any) => x?.name) : [];
      if (fav.length === 0 && risks.length === 0) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {fav.slice(0, 2).map((t: any, i: number) => (
              <span key={`f${i}`} style={{ display: "block", fontSize: 12 }}>
                <span style={{ color: "#059669", fontWeight: 600, fontFamily: "system-ui" }}>↗</span>
                <span style={{ marginLeft: 4 }}>{truncate(t.name, 50)}</span>
              </span>
            ))}
            {risks.slice(0, 2).map((t: any, i: number) => (
              <span key={`r${i}`} style={{ display: "block", fontSize: 12 }}>
                <span style={{ color: "#B45309", fontWeight: 600, fontFamily: "system-ui" }}>↘</span>
                <span style={{ marginLeft: 4 }}>{truncate(t.name, 50)}</span>
              </span>
            ))}
          </span>
        ),
        hasContent: true,
      };
    }
    case "voice": {
      const arche = isFilledArr(v.archetypes) ? v.archetypes : null;
      const tone = isFilledArr(v.tone) ? v.tone : null;
      if (!arche && !tone) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {arche && (
              <span style={{ display: "block", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#525252", letterSpacing: "0.15em", textTransform: "uppercase", marginRight: 6 }}>{lang === "en" ? "Archetype" : "原型"}</span>
                <TagRow items={arche} max={3} />
              </span>
            )}
            {tone && (
              <span style={{ display: "block" }}>
                <span style={{ fontSize: 12, color: "#525252", letterSpacing: "0.15em", textTransform: "uppercase", marginRight: 6 }}>{lang === "en" ? "Tone" : "語調"}</span>
                <TagRow items={tone} max={4} />
              </span>
            )}
          </span>
        ),
        hasContent: true,
      };
    }
    // Product / event fall-throughs
    case "core": {
      const txt = firstTruthy(v.oneLineValueProp, v.coreStatement, v.zhTagline);
      if (!txt) return { node: null, hasContent: false };
      return { node: <span>{truncate(txt, 150)}</span>, hasContent: true };
    }
    case "smp": {
      const smp = firstTruthy(v.singleMindedProposition);
      if (!smp) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            <span style={{ display: "block", color: "#171717", fontWeight: 600, fontFamily: "system-ui" }}>
              「{truncate(smp, 60)}」
            </span>
            {v.rationale && (
              <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#404040" }}>
                {truncate(v.rationale, 80)}
              </span>
            )}
          </span>
        ),
        hasContent: true,
      };
    }
  }

  // ── Generic fallback: pull the first useful string-ish field ──
  const candidates = [
    v.summary, v.statement, v.text, v.story, v.body, v.description,
    v.primary, v.primaryAudience, v.coreMessage, v.creativeTheme,
    v.coreStatement, v.briefSummary, v.businessGoal,
  ].filter((x: any) => typeof x === "string" && x.trim());
  if (candidates.length > 0) {
    return { node: <span>{truncate(candidates[0]!, 140)}</span>, hasContent: true };
  }
  // last resort: arrays
  for (const key of Object.keys(v)) {
    const arr = (v as any)[key];
    if (Array.isArray(arr)) {
      const strs = arr.filter((x: any) => typeof x === "string" && x.trim());
      if (strs.length > 0) {
        return { node: <TagRow items={strs} max={4} />, hasContent: true };
      }
      const named = arr.filter((x: any) => x?.name || x?.label);
      if (named.length > 0) {
        return {
          node: <TagRow items={named.map((x: any) => x.name ?? x.label)} max={4} />,
          hasContent: true,
        };
      }
      // 2026-07-19 (CJ「活動定位總覽第 10/11 章顯示尚未填寫但內容存在」):
      // tableRows segments (event channels.phases / journey.journey) are
      // arrays of row OBJECTS whose keys are stage/channels/step/… — no
      // name/label — so the two checks above missed them and the card
      // showed empty. Any row with a non-empty string value = filled;
      // preview shows the first row's string cells.
      const rowish = arr.filter((x: any) =>
        x && typeof x === "object" && !Array.isArray(x) &&
        Object.values(x).some((val: any) => typeof val === "string" && val.trim()));
      if (rowish.length > 0) {
        const firstVals = Object.values(rowish[0])
          .filter((val: any) => typeof val === "string" && val.trim())
          .map((val: any) => String(val)) as string[];
        return { node: <TagRow items={firstVals} max={4} />, hasContent: true };
      }
    }
  }
  return { node: null, hasContent: false };
}

// 2026-09-23：buildBrandCheatPreview 移除——它只服務已經拿掉的「武器化工具」
// 卡片預覽（速查卡），現在沒有任何 call site。SpeedCardView 這條 section 路由
// 本身還在，沒有牽動它。

/* ────────────────── PositioningCompletionBridge ──────────────────
   Renders right after the 14-step pipeline finishes — closes the loop
   between "定位完成" and "內容產出". Makes the methodology→content
   causality explicit (reviewer feedback 2026-05-11).
   ────────────────────────────────────────────────────────────────── */
function PositioningCompletionBridge({
  brandId, scopeMode,
}: { brandId: number | null; scopeMode: "brand"|"product"|"event"|"none" }) {
  const navigate = useNavigate();
  const { lang } = useLang();
  if (!brandId) return null;
  const scopeLabel = scopeMode === "product"
    ? (lang === "en" ? "product positioning" : "產品定位")
    : scopeMode === "event"
      ? (lang === "en" ? "campaign positioning" : "活動定位")
      : (lang === "en" ? "brand positioning"    : "品牌定位");
  return (
    <div
      style={{
        background: "#FAFAF9",
        border: "1px solid #171717",
        borderRadius: 14,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <h3 style={{
          fontSize: 18, fontWeight: 700, color: "#171717",
          letterSpacing: "-0.01em", marginBottom: 4,
        }}>
          {lang === "en"
            ? `Your ${scopeLabel} is ready`
            : `你的${scopeLabel}已備好`}
        </h3>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {/* 2026-07-17 (CJ 去除時間分類 + zombie audit round 2): the /30s /60s
            /99s tier routes were removed 2026-05-27 — these three buttons all
            404'd. Tasks are platform-first now, one wall covers all sizes. */}
        <BridgeBtn label={lang === "en" ? "Run a task" : "去跑任務"} onClick={() => navigate(`/tasks/fb?b=${brandId}`)} primary />
        <BridgeBtn label={lang === "en" ? "7-Day Publisher" : "七日發布台"} onClick={() => navigate(`/theater?b=${brandId}`)} />
      </div>
    </div>
  );
}

function BridgeBtn({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        borderRadius: 6,
        cursor: "pointer",
        border: "1px solid #171717",
        background: primary ? "#171717" : "#FFFFFF",
        color: primary ? "#FFFFFF" : "#171717",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (primary) e.currentTarget.style.background = "#262626";
        else e.currentTarget.style.background = "#F5F5F4";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = primary ? "#171717" : "#FFFFFF";
      }}
    >
      {label} →
    </button>
  );
}

/* Editorial section label — tiny eyebrow + thin rule, optional counter chip.
   2026-05-11: added optional `intro` line (serif italic) that explains the
   methodology rationale for this group of segments. Surfaces the
   "why this order matters" narrative reviewer flagged. */
function SectionLabel({ label, counter, intro }: { label: string; counter?: string; intro?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "#525252",
          letterSpacing: "0.22em", textTransform: "uppercase",
        }}>
          {label}
        </span>
        {intro && <HelpTip>{intro}</HelpTip>}
        <div style={{ flex: 1, height: 1, background: "#D4D4D4" }} />
        {counter && (
          // 2026-09-23：改成小圓角計數 chip（跟 content 層任務卡格頭的計數
          // Chip 呼應），純灰階、不上色 —— 只是換個容器，不違反「不要彩色」。
          <span style={{
            fontSize: 11.5, fontWeight: 600, color: "#525252",
            letterSpacing: "0.1em", fontVariantNumeric: "tabular-nums",
            background: "#F5F5F5", borderRadius: 999, padding: "3px 10px",
          }}>
            {counter}
          </span>
        )}
      </div>
    </div>
  );
}

/* SoWork 品牌定位法 — group-level narrative explaining why each
   block of segments sits where it does in the sequence. Keyed by the
   prefix-derived label produced in PositioningGrid. */
const SOWORK_GROUP_INTRO: Record<string, { zh: string; en: string }> = {
  "1": {
    zh: "起手式 — 沒有 WHY，後面所有差異化、Voice 都會飄。先把信念 → 標語 → 評分鎖好。",
    en: "Opening move — without a WHY, every differentiation and voice choice drifts. Lock the belief, the tagline, and the score first.",
  },
  "2": {
    zh: "信念的證據 — 起源故事 + 價值觀回答「為什麼是你？」沒有這層，黃金圈就只是抽象口號。",
    en: "Evidence for the belief — origin story plus values answer 'why you?'. Without this layer, the golden circle is just slogans.",
  },
  "3": {
    zh: "從『我』轉到『你』— 鎖定主受眾後，每篇貼文才知道對誰說話、要打哪個情感按鈕。",
    en: "Pivot from 'me' to 'you' — once the primary audience is locked, every post knows who it's talking to and which emotional button to press.",
  },
  "4": {
    zh: "外部座標 — 直接 / 間接 / 潛在競品看清楚，才知道差異化要切哪一刀。",
    en: "External coordinates — see direct, indirect, and latent competitors clearly so you know where to cut your differentiation.",
  },
  "5": {
    zh: "把功能 × 情感雙差異化結合成一句話 — 這是所有內容的母題。",
    en: "Fuse functional × emotional differentiation into one line — this becomes the parent theme for every piece.",
  },
  "7": {
    zh: "切入時機 — 對的策略放錯時機等於 0。識別有利趨勢 + 風險，作為議題日曆的母本。",
    en: "Timing the entry — the right strategy at the wrong time is zero. Spot the favorable trends and risks; they seed your editorial calendar.",
  },
  "8": {
    zh: "AI 寫貼文的最後濾鏡 — 人格原型 + 語調詞 + 禁區字三件套，把品牌「說話的方式」變成可複製規則。",
    en: "The final filter the AI runs every post through — archetype, tone words, and forbidden words turn 'how the brand talks' into a repeatable rule.",
  },
};

/* 2026-09-26：AssetCard（舊的視覺／文字圖磚）退場。視覺與文字兩頁現在都用
   TaskCardShell —— 站上的任務卡只有一種長相。 */


/* ─────────────────────────── PositioningCard ───────────────────────────
   2026-09-23 (CJ 看到自訂卡片後：「我們首先，先將品牌定位的卡片，改成跟
   內容層一致的呈現方式」— 貼了 PlatformTaskPage.tsx 的任務卡截圖當參照)。
   AssetCard 只把外殼（圓角/hover）改了一輪，內部排版還是原本的純文字編輯
   卡；這支才是真的照 content 層任務卡的解剖結構重做，只用在 PositioningGrid
   （固定 segment、自訂卡片、速查卡），品牌視覺資產格（logo/
   調色盤）繼續用原本的 AssetCard，不在這次範圍內：
   - 上方灰底 header block（PlatformTaskPage 是置中大頭貼，這裡沒有「人」
     可以當頭貼，換成置中的圓形 icon徽章 —— 概念的頭貼）
   - 左上角編號徽章（對應 content 卡的平台徽章位置，一樣是純資訊不是裝飾）
   - 右下角一律顯示「已填寫／未填寫」深色膠囊（對應 content 卡的「上次
     使用」膠囊位置與樣式，換成定位卡真正有意義的狀態）
   - 自訂卡片的刪除鈕移到 header block 右上角，對應 content 卡「自己的卡」
     編輯鈕的位置
   - 內文下方一顆「出處」膠囊（對應 content 卡的來源標籤 + 「出處與說明」
     連結）：固定 segment 一律標「SoWork 品牌定位法」，自訂卡片標「來自你
     的定位文件」，速查卡（純輸出物，沒有方法論出處）不顯示。
   - 不做的：agent 頭像 + 具名掛名的頁尾列——定位卡沒有「誰寫的」這個概念，
     硬套會是編出來的資訊，寧可不做。
   ─────────────────────────────────────────────────────────────────────── */
function PositioningCard({
  label, icon, onClick, preview, hasContent, rationale, onDelete, sourceLabel, headline,
}: {
  label: string; icon: any; onClick: () => void;
  preview?: React.ReactNode;
  hasContent?: boolean;
  rationale?: string;
  onDelete?: () => void;
  /** Small "where this came from" pill, echoing content layer's source pill. */
  sourceLabel?: string;
  /** 2026-09-23：這個 segment 自己最有代表性的一小段真實內容（見
   *  segmentHeadline()）。有值時取代 header 裡的概念 icon，用品牌自己的
   *  文字當縮圖；沒有（通常代表還沒填）就退回 icon，避免空卡片看起來壞掉。 */
  headline?: string | null;
}) {
  const { lang } = useLang();
  const m = label.match(/^([\d.]+)\s+(.+)$/);
  const eyebrow = m ? m[1] : "";
  const titleText = m ? m[2] : label;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      title={rationale}
      // 2026-09-23 (CJ「策略監測的按鈕再小一點，我想讓底下的策略卡片更明顯」)：
      // 邊框加深一級（neutral-200→300）＋常駐 shadow-sm，卡片在白底頁面上
      // 不用 hover 就有存在感，跟同時縮小的策略監測按鈕形成對比。
      className="group relative flex flex-col text-left cursor-pointer overflow-hidden transition-all duration-150 rounded-2xl border border-neutral-300 shadow-sm hover:border-neutral-900 hover:shadow-lg hover:scale-[1.02] bg-white"
    >
      {/* Header block — content 卡是置中大頭貼 + 平台徽章；定位卡沒有「人」，
          換成置中的概念 icon，其餘位置語意照搬（左上角資訊徽章、右上角
          「自己的卡」動作、右下角狀態膠囊）。 */}
      <div style={{
        height: 100, background: "#F5F4F2", borderBottom: "1px solid rgba(0,0,0,0.06)",
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {eyebrow && (
          <span style={{
            position: "absolute", top: 8, left: 8,
            fontSize: 10, fontWeight: 700, color: "#fff", background: "#171717",
            borderRadius: 5, padding: "2px 6px", letterSpacing: "0.05em",
            fontVariantNumeric: "tabular-nums",
          }}>
            {eyebrow}
          </span>
        )}
        {onDelete && (
          <button
            type="button"
            aria-label={lang === "en" ? "Delete card" : "刪除卡片"}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1.5 bg-white/85 hover:bg-white"
            style={{ color: "#525252" }}
          >
            <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 11 }} />
          </button>
        )}
        {headline ? (
          <p style={{
            margin: 0, padding: "0 18px", textAlign: "center",
            fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
            fontSize: 14.5, fontWeight: 600, color: "#171717", lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {headline}
          </p>
        ) : (
          <div style={{
            width: 58, height: 58, borderRadius: "50%", background: "#fff",
            border: "1px solid #D4D4D4", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <FontAwesomeIcon icon={icon} style={{ fontSize: 21, color: hasContent ? "#171717" : "#A3A3A3" }} />
          </div>
        )}
        <span style={{
          position: "absolute", bottom: 8, right: 8,
          fontSize: 10, fontWeight: 600, color: "#fff",
          background: hasContent ? "rgba(23,23,23,0.75)" : "rgba(115,115,115,0.6)",
          borderRadius: 999, padding: "2px 8px", letterSpacing: "0.05em",
        }}>
          {hasContent ? (lang === "en" ? "Filled" : "已填寫") : (lang === "en" ? "Empty" : "未填寫")}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <h3 style={{ fontSize: 14.5, fontWeight: 700, color: "#171717", margin: 0, lineHeight: 1.3 }}>
          {titleText}
        </h3>
        {preview ? (
          <div style={{
            fontSize: 12, lineHeight: 1.55, color: "#525252",
            fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
            overflow: "hidden", maxHeight: 56,
          }}>
            {preview}
          </div>
        ) : rationale ? (
          <p style={{
            fontSize: 12, lineHeight: 1.5, color: "#525252", fontStyle: "italic", margin: 0,
            fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
            overflow: "hidden", maxHeight: 56,
          }}>
            {rationale}
          </p>
        ) : (
          <span style={{ fontSize: 12, color: "#A3A3A3" }}>
            {lang === "en" ? "Tap to start" : "點擊開始"}
          </span>
        )}
        {sourceLabel && (
          <span style={{
            display: "inline-flex", alignSelf: "flex-start", alignItems: "center",
            borderRadius: 999, border: "1px solid #E5E5E5", background: "#fff",
            padding: "2px 9px", fontSize: 10.5, color: "#525252", marginTop: 2,
          }}>
            {sourceLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/* 2026-09-26：previewForAsset 隨舊視覺圖磚一起退場（卡片預覽改由
   VisualAssetBoard 自己算，規則跟 visualHasContent 同一份）。 */


/* ─────────────────────────── VisualNavItem ─────────────────────────── */
// Sidebar item for visual assets — shows hover-reveal + button, purple badge for 最新.
function VisualNavItem({ label, badge, active, onClick }: {
  label: string; badge?: string; active: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center",
        padding: "4px 12px", borderRadius: 8,
        background: active ? "rgba(24,24,27,0.06)" : hovered ? "#F5F4F2" : "none",
        border: "none", cursor: "pointer",
        fontSize: 12, fontWeight: active ? 600 : 400,
        color: active ? "rgb(24,24,27)" : "rgb(15,16,21)",
        textAlign: "left", transition: "background 0.12s",
        gap: 6,
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 12, fontWeight: 700, padding: "1px 6px", borderRadius: 20,
          background: "rgba(24,24,27,0.08)", color: "rgb(24,24,27)",
          flexShrink: 0,
        }}>{badge}</span>
      )}
      {hovered && (
        <span style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: "rgba(24,24,27,0.08)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 12, color: "rgb(24,24,27)", fontWeight: 700,
        }}>+</span>
      )}
    </button>
  );
}

/* ─────────────────────────── PositioningPanel ───────────────────────── */
// Renders the 完整定位書 / 速查卡 sub-views for the active scope.
// Reads positioning JSON from the appropriate router (brand / product / event)
// and persists edits via mutation; segment list comes from positioningSchema.

interface PipelineThinking {
  segmentTarget: string;
  text: string;
  phase: "loading" | "typing" | "writing";
  startedAt: number | null;
  stepNum: number;
  stepTotal: number;
  stepTitle: string;
}

function PositioningPanel({
  section, scopeMode, scopeName,
  scopeBrandId, scopeProductId, scopeEventId,
  pipelineThinking, onAutoFill, locked, onBackToOverview,
}: {
  section: string;
  scopeMode: "brand" | "product" | "event" | "none";
  scopeName: string;
  scopeBrandId: number | null;
  scopeProductId: number | null;
  scopeEventId: number | null;
  pipelineThinking?: PipelineThinking | null;
  onAutoFill?: (segmentId: string) => void;
  locked?: boolean;
  /** 回定位總覽——「我的定位文件」寫入完成後的出口（CJ:「會迷路」）。 */
  onBackToOverview?: () => void;
}) {
  const { lang } = useLang();
  if (scopeMode === "none") {
    return (
      <Card shadow="none" className="border-2 border-dashed border-divider">
        <CardBody className="py-16 items-center text-center gap-3">
          <FontAwesomeIcon icon={faBookOpen} className="text-3xl text-default-500" />
          <p className="text-medium font-medium">{lang === "en" ? "No scope picked yet" : "尚未選擇 scope"}</p>
          <p className="text-small text-default-700 max-w-[320px]">
            {lang === "en"
              ? "Pick a brand, product, or campaign from the ScopeBar (top right) to edit positioning."
              : "請於右上 ScopeBar 選擇品牌 / 產品 / 活動，才能編輯定位內容。"}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div style={locked ? { position: "relative" } : undefined}>
      {locked && (
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          background: "#FEF3C7", border: "1px solid #FCD34D",
          padding: "8px 14px", borderRadius: 8, marginBottom: 12,
          fontSize: 12, color: "#92400E",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <LockIcon size={13} />
          <span>{lang === "en" ? "Positioning is locked — this section is read-only. Go to Brand settings to unlock and edit." : "定位已鎖定 — 此 segment 為唯讀。回 /brands 解鎖才能編輯。"}</span>
        </div>
      )}
      <div style={locked ? { opacity: 0.65, pointerEvents: "none" } : undefined}>
        <PositioningEditor
          section={section}
          scopeMode={scopeMode}
          scopeName={scopeName}
          brandId={scopeBrandId}
          productId={scopeProductId}
          eventId={scopeEventId}
          pipelineThinking={pipelineThinking ?? null}
          onAutoFill={onAutoFill}
          onBackToOverview={onBackToOverview}
        />
      </div>
    </div>
  );
}

function PositioningEditor({
  section, scopeMode, scopeName, brandId, productId, eventId, pipelineThinking, onAutoFill, onBackToOverview,
}: {
  section: string;
  scopeMode: "brand" | "product" | "event";
  scopeName: string;
  brandId: number | null;
  productId: number | null;
  eventId: number | null;
  pipelineThinking: PipelineThinking | null;
  onAutoFill?: (segmentId: string) => void;
  /** 回定位總覽——「我的定位文件」寫入完成後的出口（CJ:「會迷路」）。 */
  onBackToOverview?: () => void;
}) {
  const { lang } = useLang();
  const segments: SegmentSpec[] = SCOPE_SEGMENTS[scopeMode] ?? [];
  const segmentId = section.startsWith("seg:") ? section.slice(4) : null;
  const activeSegment = segmentId ? segments.find((s) => s.id === segmentId) ?? null : null;

  // Read scope.active to get the merged positioning data for the chosen scope.
  const scopeActive = (trpc as any).scope?.active?.useQuery
    ? (trpc as any).scope.active.useQuery(
        { brandId, productId, eventId },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null, isLoading: false };

  const dbPositioning =
    (scopeActive.data as any)?.[scopeMode]?.positioning ?? null;
  const targetId =
    scopeMode === "brand" ? brandId
    : scopeMode === "product" ? productId
    : eventId;

  // Local working copy + debounced persist via scope.savePositioning.
  const [draft, setDraft] = React.useState<Record<string, any>>({});
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  React.useEffect(() => {
    if (dbPositioning && typeof dbPositioning === "object") setDraft(dbPositioning);
  }, [dbPositioning]);

  const utils = (trpc as any).useUtils?.() ?? null;
  const saveMutation = (trpc as any).scope?.savePositioning?.useMutation
    ? (trpc as any).scope.savePositioning.useMutation({
        onSuccess: () => {
          setSaveState("saved");
          utils?.scope?.active?.invalidate?.();
        },
        onError: () => setSaveState("error"),
      })
    : null;

  const dirtyRef = React.useRef(false);
  const timerRef = React.useRef<any>(null);
  const onDraftChange = (next: Record<string, any>) => {
    setDraft(next);
    dirtyRef.current = true;
    if (!targetId || !saveMutation) return;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveMutation.mutate({ kind: scopeMode, id: targetId, positioning: next });
      dirtyRef.current = false;
    }, 800);
  };

  if (section === "doc") {
    return (
      <PositioningDocPanel
        scopeMode={scopeMode}
        scopeId={targetId ?? null}
        scopeName={scopeName}
        // 2026-09-23（CJ「我寫入四格後，也沒有儲存或回到品牌頁面的按鈕。
        // 會迷路」）：寫入完成後要有一條明確的出口回總覽，不是靠使用者
        // 自己找左上角那顆返回。
        onBackToOverview={onBackToOverview}
      />
    );
  }
  if (section === "card") {
    return (
      <SpeedCardView scopeMode={scopeMode} data={draft} scopeName={scopeName} />
    );
  }

  // section === "seg:xxx" — render ONE segment editor
  if (!activeSegment) {
    return (
      <Card shadow="none" className="border border-divider">
        <CardBody className="py-12 items-center text-center gap-2">
          <FontAwesomeIcon icon={faBookOpen} className="text-3xl text-default-500" />
          <p className="text-medium font-medium">{lang === "en" ? "Section not found" : "找不到段落"}</p>
          <p className="text-small text-default-700">{lang === "en" ? "Pick a positioning section from the left to edit." : "請於左側選擇要編輯的定位書段落。"}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-5 py-4 gap-1 flex-row items-center justify-between flex-wrap">
          <div>
            <p className="text-tiny text-default-700 uppercase tracking-wider">
              {scopeMode.toUpperCase()} · {activeSegment.num} {lang === "en" ? (activeSegment.titleEn ?? activeSegment.title) : activeSegment.title}
            </p>
            <h2 className="text-xl font-semibold tracking-tight">{scopeName}</h2>
          </div>
          <SaveIndicator state={saveState} hasTarget={!!targetId} />
        </CardBody>
      </Card>
      {pipelineThinking && (
        <ThinkingOverlay
          text={pipelineThinking.text}
          phase={pipelineThinking.phase}
          startedAt={pipelineThinking.startedAt ?? undefined}
          stepNum={pipelineThinking.stepNum}
          stepTotal={pipelineThinking.stepTotal}
          stepTitle={pipelineThinking.stepTitle}
        />
      )}
      <SegmentEditor
        spec={activeSegment}
        // 2026-09-25：商品事實這一段開起來要先帶出舊位置的值（售價／商品網址本來
        // 就存在 positioning 頂層），否則使用者會看到空表單，以為資料不見了，
        // 然後重打一次。第一次編輯存檔後就落在 canonical 的 facts.*。
        value={
          activeSegment.id === "facts" && scopeMode === "product"
            ? { ...readProductFacts(draft), ...(draft.facts ?? {}) }
            : draft[activeSegment.id] ?? null
        }
        onChange={(next) => onDraftChange({ ...draft, [activeSegment.id]: next })}
        onRunAgent={() => onAutoFill?.(activeSegment.id)}
        research={(draft._research as any)?.[activeSegment.id] ?? null}
        wizardMeta={(draft._wizardMeta as any)?.[activeSegment.id] ?? null}
      />
    </div>
  );
}

/* ─────────────────────────── BrandAssetPanel ───────────────────────── */
// Manual-fill panel for non-positioning brand assets (logo/colors/fonts/...).
// Reads scope.active.brand.positioning._assets[assetKey], writes via
// scope.savePositioning with debounced (800ms) auto-save.
function BrandAssetPanel({ assetKey, brandId, locked }: { assetKey: AssetKey; brandId: number; locked?: boolean }) {
  const { lang } = useLang();
  const utils = (trpc as any).useUtils?.() ?? null;
  const scopeActive = (trpc as any).scope?.active?.useQuery
    ? (trpc as any).scope.active.useQuery(
        { brandId, productId: null, eventId: null },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null };
  const positioning = (scopeActive.data as any)?.brand?.positioning ?? {};
  const initialValue = (positioning._assets as any)?.[assetKey] ?? null;

  const [draft, setDraft] = useState<any>(initialValue);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  React.useEffect(() => { setDraft(initialValue); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [JSON.stringify(initialValue)]);

  const saveMutation = (trpc as any).scope?.savePositioning?.useMutation
    ? (trpc as any).scope.savePositioning.useMutation({
        onSuccess: () => { setSaveState("saved"); utils?.scope?.active?.invalidate?.(); },
        onError: () => setSaveState("error"),
      })
    : null;

  const timerRef = React.useRef<any>(null);
  const onChange = (next: any) => {
    // Once the user touches an AI-drafted field, it's no longer a pending
    // suggestion — drop the badge flag so it reads as confirmed content.
    const { aiSuggested: _drop, ...cleaned } = next ?? {};
    void _drop;
    setDraft(cleaned);
    if (!saveMutation) return;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const nextAssets = { ...(positioning._assets ?? {}), [assetKey]: cleaned };
      const nextPositioning = { ...positioning, _assets: nextAssets };
      saveMutation.mutate({ kind: "brand", id: brandId, positioning: nextPositioning });
    }, 800);
  };

  return (
    <div className="flex flex-col gap-3">
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-5 py-3 flex-row items-center justify-between flex-wrap">
          <p className="text-small text-default-700">
            {lang === "en"
              ? "Filled in manually · auto-saves"
              : "手動填寫 · 自動儲存"}
          </p>
          <SaveIndicator state={saveState} hasTarget={true} />
        </CardBody>
      </Card>
      <BrandAssetEditor assetKey={assetKey} value={draft} onChange={onChange} readOnly={!!locked} />
    </div>
  );
}

function SaveIndicator({ state, hasTarget }: { state: "idle" | "saving" | "saved" | "error"; hasTarget: boolean }) {
  const { t, lang } = useLang();
  if (!hasTarget) {
    return (
      <Chip size="sm" variant="flat" color="warning" className="shrink-0">
        {lang === "en" ? "No ID bound — edits won't save" : "未綁定 ID — 編輯不會儲存"}
      </Chip>
    );
  }
  if (state === "saving") return <Chip size="sm" variant="flat" color="default" className="shrink-0">{t("saving")}</Chip>;
  if (state === "saved")  return <Chip size="sm" variant="flat" color="success" className="shrink-0">{t("saved")}</Chip>;
  if (state === "error")  return <Chip size="sm" variant="flat" color="danger"  className="shrink-0">{t("toast_save_failed")}</Chip>;
  return null;
}

function SpeedCardView({ scopeMode, data, scopeName }: { scopeMode: string; data: any; scopeName: string }) {
  return (
    <SpeedCard
      scopeMode={scopeMode as "brand" | "product" | "event"}
      scopeName={scopeName}
      data={data}
    />
  );
}

/* ─────────────────────────── BrandAssetTile ─────────────────────────── */

/* ─────────────────────── Event Settings Panel ───────────────────────
 * CJ direction 2026-04-29: post-creation event editing — brand picker,
 * name, period, linked productIds (m:n via event_products). All metadata
 * that previously could only be set at create time. Lives as the
 * "settings" sub-nav entry under event scope.
 */
function EventSettingsPanel({
  eventId, brands,
}: { eventId: number; brands: any[] }) {
  const { t, lang } = useLang();
  const utils = (trpc as any).useUtils?.() ?? null;
  const eventQuery = (trpc as any).event?.get?.useQuery
    ? (trpc as any).event.get.useQuery({ id: eventId }, { refetchOnWindowFocus: false, enabled: eventId > 0 })
    : { data: null, isLoading: false };
  const event = eventQuery.data as any;

  const [name, setName] = React.useState("");
  const [brandId, setBrandId] = React.useState<number | null>(null);
  const [startAt, setStartAt] = React.useState("");
  const [endAt, setEndAt]     = React.useState("");
  const [productIds, setProductIds] = React.useState<number[]>([]);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // Hydrate from server data once it arrives.
  React.useEffect(() => {
    if (!event) return;
    setName(event.name ?? "");
    setBrandId(event.brandId ?? null);
    const fmt = (d: any): string => {
      if (!d) return "";
      try {
        const s = String(d);
        return s.split("T")[0] ?? s;
      } catch { return ""; }
    };
    setStartAt(fmt(event.startAt));
    setEndAt(fmt(event.endAt));
    setProductIds(Array.isArray(event.productIds) ? event.productIds : []);
  }, [event]);

  // Candidate products from the picked brand (so user can re-link if
  // brand changes). Same query the create-modal uses.
  const productsQuery = (trpc as any).product?.list?.useQuery
    ? (trpc as any).product.list.useQuery(
        { brandId: brandId ?? undefined },
        { enabled: !!brandId, refetchOnWindowFocus: false },
      )
    : { data: [] };
  const candidateProducts: any[] = (productsQuery.data as any[]) ?? [];

  const upsert = (trpc as any).event?.upsert?.useMutation?.() ?? null;

  const onSave = async () => {
    if (!upsert) { setErr("event.upsert not available"); return; }
    if (!name.trim()) { setErr(lang === "en" ? "Name can't be empty" : "名稱不能為空"); return; }
    if (!brandId) { setErr(lang === "en" ? "Pick a brand to link" : "必須綁定品牌"); return; }
    setErr(null);
    try {
      await upsert.mutateAsync({
        id: eventId,
        brandId,
        slug: event?.slug ?? "",
        name: name.trim(),
        startAt: startAt || undefined,
        endAt: endAt || undefined,
        productIds, // replace full set per upsert contract
      });
      setSavedAt(new Date().toLocaleTimeString());
      utils?.event?.get?.invalidate?.();
      utils?.scope?.options?.invalidate?.();
      utils?.scope?.active?.invalidate?.();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  if (eventQuery.isLoading) {
    return <p className="text-small text-default-700">{t("loading")}</p>;
  }
  if (!event) {
    return (
      <Card shadow="none" className="border border-divider">
        <CardBody className="py-16 items-center text-center">
          <p className="text-medium font-medium">{lang === "en" ? "Campaign not found" : "找不到此活動"}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-5 py-4 gap-1">
          <p className="text-tiny text-default-700 uppercase tracking-wider">{lang === "en" ? "EVENT · Settings" : "EVENT · 設定"}</p>
          <h2 className="text-xl font-semibold tracking-tight">{event.name}</h2>
          <p className="text-small text-default-700">
            slug: <code className="text-tiny">{event.slug}</code>
          </p>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-5 gap-4">
          <Input
            label={lang === "en" ? "Campaign name (required)" : "活動名稱（必填）"}
            labelPlacement="outside"
            variant="bordered" size="sm" radius="md"
            value={name}
            onValueChange={setName}
            isRequired
          />
          <Select
            label={lang === "en" ? "Owning brand (required)" : "所屬品牌（必選）"}
            labelPlacement="outside"
            variant="bordered" size="sm" radius="md"
            selectedKeys={brandId ? new Set([String(brandId)]) : new Set()}
            onSelectionChange={(keys) => {
              const k = Array.from(keys as Set<string>)[0];
              setBrandId(k ? Number(k) : null);
            }}
            isRequired
          >
            {brands.map((b: any) => (
              <SelectItem key={String(b.id)}>{b.name}</SelectItem>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={lang === "en" ? "Start date" : "開始日期"} labelPlacement="outside"
              variant="bordered" size="sm" radius="md" type="date"
              value={startAt} onValueChange={setStartAt}
            />
            <Input
              label={lang === "en" ? "End date" : "結束日期"} labelPlacement="outside"
              variant="bordered" size="sm" radius="md" type="date"
              value={endAt} onValueChange={setEndAt}
            />
          </div>
          <div>
            <p className="text-small font-medium mb-1">{lang === "en" ? "Linked products (multi-select)" : "關聯產品（可多選）"}</p>
            <p className="text-tiny text-default-700 mb-2">
              {lang === "en"
                ? "0 = brand-level campaign; 2+ = cross-product campaign. The product list updates when you switch the linked brand."
                : "選 0 個 = 品牌層級活動；2+ 個 = 跨產品活動。改變綁定的品牌後產品清單會更新。"}
            </p>
            {candidateProducts.length === 0 ? (
              <p className="text-tiny text-default-700">{lang === "en" ? "This brand has no products yet." : "此品牌尚無產品。"}</p>
            ) : (
              <CheckboxGroup
                value={productIds.map(String)}
                onValueChange={(vals) => setProductIds((vals as string[]).map((v) => Number(v)))}
                classNames={{ wrapper: "gap-1.5" }}
              >
                {candidateProducts.map((p: any) => (
                  <Checkbox key={p.id} value={String(p.id)} size="sm">
                    <span className="text-small">{p.name}</span>
                  </Checkbox>
                ))}
              </CheckboxGroup>
            )}
          </div>
          {err && <p className="text-tiny text-danger">{err}</p>}
          <div className="flex items-center gap-3">
            <Button
              color="primary" size="sm"
              isLoading={upsert?.isPending ?? false}
              onPress={onSave}
            >
              {t("save")}
            </Button>
            {savedAt && <span className="text-tiny text-success">{lang === "en" ? `Saved · ${savedAt}` : `已儲存 · ${savedAt}`}</span>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ─────────────────── BrandLogoSettings ─────────────────── */
/**
 * Brand logo block (2026-05-05): preview current logoUrl + 一鍵抓 FB 粉專
 * 大頭貼 + 換一張. Used in BrandsPage settings tab.
 */
function BrandLogoSettings({ brandId, brandName }: { brandId: number; brandName: string | null }) {
  // 2026-09-10 (CJ「允許用戶上傳照片到品牌或個別產品」)：logo 也可以自己
  // 上傳，不必只靠 FB 粉專抓——單張圖，走 /api/asset-photo/upload 後把
  // 拿到的網址指定成 logoUrl（brand.setLogo），跟品牌照片庫共用同一支
  // 上傳端點，但這裡不用 AssetPhotoGallery（那是多張照片庫的元件），
  // logo 只有一張、也不需要「刪除／設主圖」這些操作。
  const setLogoMut = (trpc as any).brand?.setLogo?.useMutation?.();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const { lang } = useLang();
  const brandQuery = (trpc as any).brand?.get?.useQuery
    ? (trpc as any).brand.get.useQuery({ id: brandId }, { refetchOnWindowFocus: false, enabled: brandId > 0 })
    : { data: null, refetch: () => {} };
  const logoUrl: string | null = (brandQuery.data as any)?.logoUrl ?? null;

  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const fetchMut = (trpc as any).brand?.fetchFacebookAvatar?.useMutation();

  const submit = async () => {
    if (!handle.trim()) { setErr(lang === "en" ? "Paste a FB page URL or handle" : "請輸入 FB 粉專網址或 handle"); return; }
    setBusy(true); setErr(null); setOkMsg(null);
    try {
      const r = await fetchMut.mutateAsync({ brandId, handleOrUrl: handle.trim() });
      setOkMsg(lang === "en" ? `Fetched (${r.bytes.toLocaleString()} bytes)` : `已抓取 (${r.bytes.toLocaleString()} bytes)`);
      setHandle("");
      await brandQuery.refetch?.();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploadingLogo(true); setErr(null); setOkMsg(null);
    try {
      const res = await fetch("/api/asset-photo/upload", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-brand-id": String(brandId), "x-scope": "brand", "x-scope-id": String(brandId),
          "x-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      await setLogoMut?.mutateAsync?.({ brandId, logoUrl: json.photo.url });
      setOkMsg(lang === "en" ? "Logo updated" : "logo 已更新");
      await brandQuery.refetch?.();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setUploadingLogo(false);
      if (logoFileRef.current) logoFileRef.current.value = "";
    }
  };

  return (
    <div className="max-w-[640px] mx-auto space-y-4">
      <div>
        <h3 className="text-medium font-semibold flex items-center gap-1.5">
          {lang === "en" ? "Brand logo / avatar" : "品牌 logo / 頭像"}
          <HelpTip>
            {lang === "en"
              ? `The "${brandName ?? "brand"}" avatar used in mockups. Auto-fetch from the FB page, or upload manually later.`
              : `mockup 顯示用的「${brandName ?? "品牌"}」頭像。可以從 FB 粉專自動抓，或之後手動上傳。`}
          </HelpTip>
        </h3>
      </div>

      <div className="flex items-center gap-4 border border-default-200 rounded-medium p-4 bg-default-50">
        <Avatar
          src={logoUrl ?? `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(brandName ?? "brand")}`}
          size="lg"
          className="w-20 h-20"
        />
        <div className="flex-1 min-w-0">
          <p className="text-small font-medium">
            {logoUrl
              ? (lang === "en" ? "Current logo" : "目前 logo")
              : (lang === "en" ? "No logo yet (showing dicebear placeholder)" : "尚未設定 logo（顯示 dicebear 預設圖）")}
          </p>
          {logoUrl && (
            <p className="text-tiny text-default-600 truncate">{logoUrl}</p>
          )}
        </div>
      </div>

      <div className="space-y-2 border border-default-200 rounded-medium p-4">
        <p className="text-small font-medium">
          {logoUrl
            ? (lang === "en" ? "Swap (re-fetch from FB page)" : "換一張（從 FB 粉專重抓）")
            : (lang === "en" ? "Auto-fetch from FB page" : "從 FB 粉專自動抓")}
        </p>
        <p className="text-tiny text-default-700">
          {lang === "en"
            ? "Paste the page URL or handle. The page must be public. This overwrites your current logo."
            : "貼粉專網址或純 handle。粉專必須是公開的。會覆蓋現有 logo。"}
        </p>
        <Input
          size="sm"
          placeholder="https://www.facebook.com/yourbrand"
          value={handle}
          onValueChange={setHandle}
          isDisabled={busy}
        />
        <div className="flex items-center gap-2">
          <Button color="primary" size="sm" onPress={submit} isLoading={busy}>
            {logoUrl
              ? (lang === "en" ? "Re-fetch" : "重新抓取")
              : (lang === "en" ? "Fetch logo" : "抓取 logo")}
          </Button>
          {okMsg && <span className="text-tiny text-success-600 inline-flex items-center gap-1"><CheckIcon size={10} /> {okMsg}</span>}
          {err && <span className="text-tiny text-danger-600">{err}</span>}
        </div>
      </div>

      <div className="space-y-2 border border-default-200 rounded-medium p-4">
        <p className="text-small font-medium">{lang === "en" ? "Or upload your own" : "或自己上傳"}</p>
        <p className="text-tiny text-default-700">
          {lang === "en" ? "PNG / JPEG / WebP, up to 15MB. Overwrites your current logo." : "PNG／JPEG／WebP，上限 15MB。會覆蓋現有 logo。"}
        </p>
        <Button size="sm" variant="flat" isLoading={uploadingLogo} onPress={() => logoFileRef.current?.click()}>
          {lang === "en" ? "Choose file" : "選擇檔案"}
        </Button>
        <input
          ref={logoFileRef} type="file" hidden
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          onChange={(e) => void uploadLogo(e.target.files?.[0])}
        />
      </div>

      <div className="pt-2">
        <h3 className="text-medium font-semibold flex items-center gap-1.5 mb-3">
          {lang === "en" ? "Brand photo library" : "品牌照片庫"}
          <HelpTip>
            {lang === "en"
              ? "Real photos of the brand — materials, storefront, packaging — used as reference for on-brand image generation and color extraction. We no longer scrape these from your website."
              : "品牌的真實照片——材質、門市、包裝——用來當 on-brand 生圖與取色的參考。我們不再從網站爬這些圖了。"}
          </HelpTip>
        </h3>
        <AssetPhotoGallery brandId={brandId} scope="brand" scopeId={brandId} scopeLabel={lang === "en" ? "this brand" : "這個品牌"} />
      </div>
    </div>
  );
}

/* ─────────────────────────── PositioningTopRow ───────────────────────
   Compact action row for the 定位 tab — replaces wide TabActionBar.
   Shows: 自動定位 button + live job progress + 🔓 lock chip.
   The 自動定位 button fires positioningJobs.start (new background
   runner with retry × 5 + parallel waves + cost tracking).
   ───────────────────────────────────────────────────────────────────── */
function PositioningTopRow({
  brandId, scopeMode, locked,
}: {
  brandId: number | null;
  scopeMode: "brand"|"product"|"event"|"none";
  locked: boolean;
}) {
  const { lang } = useLang();
  // 2026-05-08: hooks must be called unconditionally (Rules of Hooks).
  // Previous version did `(entityKind && brandId) ? useQuery(...) : null`
  // which made hook count vary across renders → React broke silently
  // and the auto-定位 button stopped working.
  const entityKind: "brand"|"product"|"event"|null =
    scopeMode === "brand" ? "brand" :
    scopeMode === "product" ? "product" :
    scopeMode === "event" ? "event" : null;

  const [startError, setStartError] = useState<string | null>(null);
  // 2026-05-11 (CJ「第一次按重新自動定位的時候，都沒有反應」): the
  // getStatus query polls every 4s, so after start mutation succeeds
  // the button label stayed "重新自動定位" for up to 4 seconds —
  // users thought nothing happened. Use a local optimistic flag so the
  // UI flips to "啟動中…" instantly, plus immediate invalidate.
  const [optimisticStarting, setOptimisticStarting] = useState(false);
  const utils = (trpc as any).useUtils?.() ?? null;

  // 2026-06-16 (CJ「產品定位卡住了，無法完成」): job 376 (product 46) showed
  // backend status=done after 26s, but the UI stayed on "分析中 0/6" forever.
  // Root cause: refetchInterval pauses while the tab is backgrounded (React
  // Query default), and this pipeline can finish faster than the user
  // switches back. refetchIntervalInBackground keeps polling even when the
  // tab isn't focused; refetchOnWindowFocus/refetchOnMount force a fresh
  // read the moment the user does look back, instead of trusting stale cache.
  const job = (trpc as any).positioningJobs?.getStatus?.useQuery?.(
    { entityKind: entityKind ?? "brand", entityId: brandId ?? 0 },
    {
      enabled: !!brandId && !!entityKind,
      refetchInterval: 4_000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    },
  );
  const jobData = (job?.data as any) ?? null;
  const isRunning = jobData?.status === "running" || optimisticStarting;
  const isDone = jobData?.status === "done";
  const isFailed = jobData?.status === "failed";
  const cur = Number(jobData?.currentStep ?? 0);
  const total = Number(jobData?.totalSteps ?? 0);

  const startMut = (trpc as any).positioningJobs?.start?.useMutation?.({
    onSuccess: (data: any) => {
      if (!data?.ok) {
        setStartError(data?.error || (lang === "en" ? "Couldn't start" : "啟動失敗"));
        setOptimisticStarting(false);
      } else {
        setStartError(null);
        // Immediately refetch status so the button flips to "自動定位中…".
        utils?.positioningJobs?.getStatus?.invalidate?.();
        // Stop optimistic state once the server reports running.
        setTimeout(() => setOptimisticStarting(false), 5_000);
      }
    },
    onError: (e: any) => {
      setStartError(String(e?.message ?? e ?? (lang === "en" ? "Couldn't start" : "啟動失敗")));
      setOptimisticStarting(false);
    },
  });

  const handleAuto = () => {
    if (!brandId || !entityKind || locked || isRunning) return;
    setStartError(null);
    setOptimisticStarting(true); // instant feedback
    startMut?.mutate?.({ entityKind, entityId: brandId, lang: "zh-TW" });
  };

  // 2026-05-17: brand pipeline = 10 steps (one per BRAND_SEGMENTS id).
  // 2026-06-16: event pipeline = 11 steps (one per EVENT_SEGMENTS id);
  // product = 6 (one per PRODUCT_SEGMENTS id). Match positioningSteps.ts.
  const totalSteps = entityKind === "brand" ? 10 : entityKind === "product" ? 6 : 11;
  // 2026-05-11 (reviewer:「重新自動定位 可以更名... 強調套用SoWork 品牌定位框架」)
  // — frame the button as applying a named methodology, not as a generic
  // "AI fills it in" action. Methodology becomes the competitive moat.
  const methodLabel = entityKind === "brand"
    ? (lang === "en" ? "the SoWork Brand Positioning Method (14 steps)" : "SoWork 品牌定位法（14 步）")
    : entityKind === "product"
      ? (lang === "en" ? "the product positioning framework (6 steps)" : "產品定位框架（6 步）")
      : (lang === "en" ? "the campaign positioning framework (11 steps)" : "活動定位框架（11 步）");
  const buttonLabel =
    optimisticStarting && !jobData?.status
      ? (lang === "en" ? "Starting…" : "啟動中…")
      : isRunning
        ? (lang === "en" ? `Analyzing ${cur}/${total || totalSteps}` : `分析中 ${cur}/${total || totalSteps}`)
      : isDone
        ? (lang === "en" ? `Re-apply ${methodLabel}` : `重新套用${methodLabel}`)
      : isFailed
        ? (lang === "en" ? `Retry — ${methodLabel}` : `重試 — ${methodLabel}`)
        : (lang === "en" ? `Apply ${methodLabel}` : `套用${methodLabel}`);

  return (
    <>
      {/* Auto-定位 + status row。
          2026-09-23（CJ「套用SoWork定位法的按鈕，跟策略監測的按鈕大小樣式都相同，
          就可以」）：原本是一顆 px-4 py-2 的黑色實心按鈕，跟同一排的策略監測／
          策略健檢兩顆描邊 pill 不同量級。三件事是並列的入口，長得不一樣只會讓人
          以為有一個比較重要。改成跟 StrategyToolIcon 同一組 class（rounded-full /
          border / px-3 py-1.5 / text-[12.5px]）——那邊是 12.5px + icon 12，這裡照抄，
          兩邊要一起改才不會又各長各的。
          外層的 mb-3 也拿掉：現在它被包在工具列那一排裡面，間距由那一排統一給。 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleAuto}
          disabled={!brandId || !entityKind || locked || isRunning || startMut?.isPending}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            isRunning ? "bg-neutral-100 border-neutral-200 text-neutral-700 cursor-wait"
            : locked ? "bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed"
            : "bg-white border-neutral-300 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 cursor-pointer"
          }`}
          title={
            locked
              ? (lang === "en" ? "Locked — unlock to re-run" : "已鎖定 — 解鎖後才能重跑")
              : isRunning
                ? (lang === "en" ? `Running in the background (step ${cur}/${total})` : `背景產生中（步驟 ${cur}/${total}）`)
                : (lang === "en"
                    ? `Auto-fill every positioning field via a ${totalSteps}-step pipeline (background run, retry × 5)`
                    : `自動填寫所有定位欄位（共 ${totalSteps} 步，背景執行，最多重試 5 次）`)
          }
        >
          <GenerateIcon size={12} className={isRunning ? "animate-pulse" : ""} />
          {buttonLabel}
        </button>

        {isRunning && total > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-32 h-1.5 bg-default-200 rounded-full overflow-hidden">
              <div className="h-full bg-neutral-900 transition-all" style={{ width: `${Math.min(100, (cur / total) * 100)}%` }} />
            </div>
            <span className="text-xs text-default-700 tabular-nums">{cur}/{total}</span>
            {/* 2026-06-16: manual escape hatch — if polling ever misses the
                done/failed transition (e.g. tab was backgrounded mid-run),
                this forces an immediate re-read instead of leaving the user
                staring at a stale "分析中 0/總數" with no way to recover
                short of a full page reload. */}
            <button
              onClick={() => utils?.positioningJobs?.getStatus?.invalidate?.()}
              className="text-[12px] text-default-500 hover:text-default-800 underline"
              title={lang === "en" ? "Force-refresh status" : "強制重新查詢狀態"}
            >
              {lang === "en" ? "refresh" : "重新查詢"}
            </button>
          </div>
        )}
        {isFailed && jobData?.lastError && (
          <span className="text-xs text-amber-700 max-w-md truncate" title={jobData.lastError}><WarningIcon size={11} /> {String(jobData.lastError).slice(0, 80)}</span>
        )}
        {isDone && <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckIcon size={11} />{lang === "en" ? `Done · ${total} sections` : `已完成 ${total} 個段落`}</span>}
        {startError && (
          <span className="text-xs text-danger truncate max-w-md" title={startError}><WarningIcon size={11} /> {startError}</span>
        )}
      </div>

      {/* CJ 2026-05-08: removed duplicate wide lock bar from inside
          PositioningTopRow — the legacy lock bar above the body
          (BrandsPage.tsx:856) already covers all 3 tabs.
          2026-09-24：連帶把當時保留的 onLockToggle prop 也拿掉了——留著一個
          永遠不會被呼叫的 callback，只會讓下一個人以為這裡按了會鎖定。 */}
    </>
  );
}

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

function CopyTabInline({
  brandId, brandAssets, fullPositioning, locked, customCards, onEditCustomCard, onDeleteCustomCard,
}: {
  brandId: number | null;
  brandAssets: Record<string, any>;
  fullPositioning: Record<string, any>;
  locked: boolean;
  // 2026-09-26：鎖定改由上方那條既有的鎖定列負責，所以這裡不再收 onLockToggle——
  // 留著一個永遠不會被呼叫的 callback，只會讓下一個人以為這裡按了會鎖定
  // （PositioningTopRow 2026-09-24 已經踩過同一個坑）。
  /** 2026-09-26（CJ「新增的任務卡，也可以由用戶自行定義卡片名稱和內容」）：
   *  跟品牌頁同一份自訂卡片（positioning 的 customSegments），不是另一套。 */
  customCards?: { id: string; title: string; fields: { key: string; label: string; value: string }[] }[];
  onEditCustomCard?: (card: EditableCard | null) => void;
  onDeleteCustomCard?: (segmentId: string) => void;
}) {
  const { lang } = useLang();
  const utils = (trpc as any).useUtils?.() ?? null;
  const saveMut = (trpc as any).scope?.savePositioning?.useMutation
    ? (trpc as any).scope.savePositioning.useMutation({
        onSuccess: () => utils?.scope?.active?.invalidate?.(),
      })
    : null;
  const bulkMut = (trpc as any).brandKnowledge?.bulkSuggestEmptyAssets?.useMutation?.();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFillingKeys, setBulkFillingKeys] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<{ filled: number; sources: string[] } | null>(null);
  const [bulkErr, setBulkErr] = useState<string | null>(null);

  // Local working draft per asset key — keeps inputs responsive while a
  // 800ms debounce flushes to the server.
  const [drafts, setDrafts] = useState<Record<string, any>>(brandAssets);
  React.useEffect(() => { setDrafts((d) => ({ ...brandAssets, ...d })); /* server > local on first load only */ }, [brandId]); // eslint-disable-line
  // Whenever server data changes (fresh fetch), merge in only keys we
  // haven't locally edited yet (avoid clobbering user typing).
  const dirtyRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    setDrafts((d) => {
      const next = { ...d };
      for (const k of Object.keys(brandAssets)) {
        if (!dirtyRef.current.has(k)) next[k] = brandAssets[k];
      }
      return next;
    });
  }, [brandAssets]);

  const timersRef = React.useRef<Record<string, any>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // 2026-09-26：使用者自己加的文字卡片。存在 positioning._assetCards（跟
  // _assets 同一層），所以不需要新欄位也不必改 schema。
  const addedCopyCards: string[] = Array.isArray((fullPositioning as any)?._assetCards)
    ? ((fullPositioning as any)._assetCards as any[]).filter((k) => typeof k === "string")
    : [];
  const addCopyCard = (key: string) => {
    if (locked || !brandId || addedCopyCards.includes(key)) return;
    const merged = { ...fullPositioning, _assetCards: [...addedCopyCards, key] };
    saveMut?.mutate?.({ kind: "brand", id: brandId, positioning: merged });
  };

  /**
   * 2026-09-26（CJ「任務卡上，要增加刪除的按鈕」）：刪掉一張預設卡。
   *
   * **內容一定要一起清掉**：顯示規則是「有內容的一定看得見」（CopyAssetBoard
   * .visibleKeys），只把 key 從 _assetCards 拿掉的話，那張卡下一秒又自己回來，
   * 看起來像刪除壞了。所以確認訊息要先講明這件事——有內容的卡片刪掉就是真的
   * 刪掉那幾條。
   */
  const deleteCopyCard = (key: string) => {
    if (locked || !brandId) return;
    const hadContent = !isEmpty(key);
    const msg = hadContent
      ? (lang === "en"
          ? "Delete this card? Everything written in it will be removed."
          : "確定要刪除這張卡片嗎？裡面寫的內容會一起刪掉。")
      : (lang === "en" ? "Remove this card?" : "確定要移除這張卡片嗎？");
    if (!confirm(msg)) return;
    dirtyRef.current.add(key);
    setDrafts((d) => ({ ...d, [key]: null }));
    const merged = {
      ...fullPositioning,
      _assets: { ...(fullPositioning._assets ?? {}), [key]: null },
      _assetCards: addedCopyCards.filter((k) => k !== key),
    };
    saveMut?.mutate?.({ kind: "brand", id: brandId, positioning: merged }, {
      onSuccess: () => dirtyRef.current.delete(key),
    });
  };

  const updateAsset = (key: string, next: any) => {
    if (locked || !brandId) return;
    dirtyRef.current.add(key);
    setDrafts((d) => ({ ...d, [key]: next }));
    // Debounced flush
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    setSavingKey(key);
    timersRef.current[key] = setTimeout(() => {
      const merged = {
        ...fullPositioning,
        _assets: { ...(fullPositioning._assets ?? {}), [key]: next },
      };
      saveMut?.mutate?.({ kind: "brand", id: brandId, positioning: merged }, {
        onSuccess: () => { setSavingKey(null); dirtyRef.current.delete(key); },
        onError:   () => setSavingKey(null),
      });
    }, 800);
  };

  // Detect empty asset keys (for the global "自動填寫所有空欄" button).
  const isEmpty = (k: string): boolean => {
    const v = drafts[k];
    if (!v) return true;
    if (typeof v.text === "string" && v.text.trim().length > 0) return false;
    if (Array.isArray(v.items) && v.items.filter((x: any) => typeof x === "string" && x.trim()).length > 0) return false;
    if (Array.isArray(v.pairs) && v.pairs.filter((p: any) => p?.from?.trim() && p?.to?.trim()).length > 0) return false;
    return true;
  };
  const allCopyKeys = COPY_ASSETS.map((a) => a.key);
  const emptyKeys = allCopyKeys.filter(isEmpty);

  const handleBulkAutoFill = async () => {
    if (!brandId || locked || bulkBusy || emptyKeys.length === 0) return;
    setBulkErr(null); setBulkResult(null); setBulkBusy(true);
    setBulkFillingKeys(new Set(emptyKeys));
    try {
      const r = await bulkMut?.mutateAsync?.({ brandId, emptyKeys });
      if (!r?.ok) { setBulkErr(lang === "en" ? "Auto-fill failed (no server response)" : "自動填寫失敗（伺服器無回應）"); return; }
      // Merge all results into drafts and persist in ONE save.
      const updates: Record<string, any> = {};
      for (const [k, payload] of Object.entries(r.results ?? {})) {
        updates[k] = (payload as any).value;
        // Mark filled keys dirty so server-state refresh doesn't clobber them.
        dirtyRef.current.add(k);
      }
      const nextDrafts = { ...drafts, ...updates };
      setDrafts(nextDrafts);
      if (saveMut && Object.keys(updates).length > 0) {
        const merged = {
          ...fullPositioning,
          _assets: { ...(fullPositioning._assets ?? {}), ...updates },
        };
        saveMut.mutate({ kind: "brand", id: brandId, positioning: merged }, {
          onSuccess: () => {
            // Now safe to clear dirty flag — server has the values.
            for (const k of Object.keys(updates)) dirtyRef.current.delete(k);
          },
        });
      }
      setBulkResult({ filled: Object.keys(updates).length, sources: r.sources ?? [] });

      // Surface per-field failures (the silent-fail bug from 2026-05-07)
      const errCount = Object.keys(r.errors ?? {}).length;
      const warnings: string[] = [];
      if (!r.hasRealContent) {
        warnings.push(lang === "en"
          ? "No website / FB found — results may be off. Add a website / social links in Settings, then retry."
          : "找不到官網 / FB — 結果可能不準。請到「設定」補上 website / socialLinks 後重試。");
      }
      if (errCount > 0) {
        const firstFew = Object.entries(r.errors ?? {}).slice(0, 3)
          .map(([k, msg]) => `${k}: ${msg}`).join(" | ");
        warnings.push(lang === "en"
          ? `${errCount} field(s) failed (${firstFew}${errCount > 3 ? " …" : ""})`
          : `${errCount} 個欄位失敗（${firstFew}${errCount > 3 ? " …" : ""}）`);
      }
      if (warnings.length > 0) setBulkErr(warnings.join("\n"));
    } catch (e: any) {
      setBulkErr(String(e?.message ?? e));
    } finally {
      setBulkBusy(false);
      setBulkFillingKeys(new Set());
    }
  };

  if (!brandId) {
    return <div className="p-8 text-center text-default-700">{lang === "en" ? "Pick a brand first" : "請先選擇品牌"}</div>;
  }

  return (
    <div style={{ padding: "16px 28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 2026-09-26（CJ「自動填寫等功能，也變成 chips 就好」）：原本是一顆黑色
          大按鈕＋另一顆鎖定按鈕分站兩端。改成跟品牌頁同一顆 StrategyToolIcon
          的 pill —— 同一種動作在站上只有一種長相。 */}
      <div className="flex items-center gap-2 flex-wrap">
        <StrategyToolIcon
          active={bulkBusy}
          onClick={() => { if (!bulkBusy && !locked && emptyKeys.length > 0) void handleBulkAutoFill(); }}
          icon={faWandMagicSparkles}
          label={bulkBusy
            ? (lang === "en" ? `Auto-filling (${bulkFillingKeys.size})…` : `自動填寫中（${bulkFillingKeys.size}）…`)
            : emptyKeys.length === 0
              ? (lang === "en" ? "All filled" : "全部已填寫")
              : (lang === "en" ? `Auto-fill ${emptyKeys.length}` : `自動填寫 ${emptyKeys.length} 欄`)}
          title={locked
            ? (lang === "en" ? "Locked — unlock to edit" : "已鎖定，解鎖才能編輯")
            : emptyKeys.length === 0
              ? (lang === "en" ? "Every card already has content" : "每張卡都有內容了")
              : (lang === "en"
                  ? `Fill the remaining ${emptyKeys.length} cards from website / FB`
                  : `根據官網 / FB 自動填寫剩下的 ${emptyKeys.length} 張卡`)}
        />
        {/* 鎖定不放在這裡：上方那條「文字 尚未鎖定／鎖定文字」的列已經是
            同一個動作。同一件事給兩顆按鈕，使用者會以為它們不一樣。 */}
        <span className="text-tiny text-default-500">
          {savingKey ? (lang === "en" ? "Saving…" : "儲存中…") : (lang === "en" ? "Auto-save on" : "自動儲存")}
        </span>
      </div>

      {(bulkErr || bulkResult) && (
        <div className={`text-xs px-3 py-2 rounded-lg whitespace-pre-line ${
          bulkErr && !bulkResult ? "bg-amber-50 text-amber-800" :
          bulkErr ? "bg-amber-50 text-amber-800" :
          "bg-emerald-50 text-emerald-800"
        }`}>
          {bulkResult && <div><CheckIcon size={11} /> {lang === "en"
            ? `Filled ${bulkResult.filled} fields${bulkResult.sources.length > 0 ? ` (sources: ${bulkResult.sources.join(" + ")})` : ""}`
            : `已填入 ${bulkResult.filled} 個欄位${bulkResult.sources.length > 0 ? `（來源：${bulkResult.sources.join(" + ")}）` : ""}`}</div>}
          {bulkErr && <div>{bulkErr}</div>}
        </div>
      )}

      {/* 2026-09-26（CJ「改成跟品牌頁面相同格式的任務卡格式」＋「一開始，只要
          出現推薦用詞、禁用詞與縮寫對照就好，其他的欄位，都提供新增的卡片的
          選項」）：原本一次攤開 4 組 11 張圖磚。十一個空欄位擺在眼前，使用者
          不知道從哪格開始，結果一格都不填。改成預設三張＋自己加。
          顯示規則見 CopyAssetBoard.visibleKeys——已經有內容的卡片一定看得見，
          不然既有品牌會以為資料不見了。 */}
      <CopyAssetBoard
        brandId={brandId}
        drafts={drafts}
        added={addedCopyCards}
        onChange={updateAsset}
        onAddCard={addCopyCard}
        readOnly={locked}
        fillingKeys={bulkFillingKeys}
        lang={lang}
        customCards={customCards ?? []}
        onEditCustomCard={onEditCustomCard}
        onDeleteCard={deleteCopyCard}
        onDeleteCustomCard={onDeleteCustomCard}
      />
    </div>
  );
}

// 2026-05-18 (CJ「產品基本資料東西太少，右下也沒有 +新增選單管理」):
// real product editor — name / SKU / URL / positioning + re-analyze.
// Mirrors the brand BrandBasicEditor. Persists into product.upsert
// (positioning JSON carries summary/website/sku — no schema migration).
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-default-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function ProductInfoEditor({ productId, brandName, en }: { productId: number; brandName: string | null; en: boolean }) {
  const q = (trpc as any).product?.get?.useQuery?.(
    { id: productId },
    { enabled: !!productId, refetchOnWindowFocus: false },
  );
  const upsertM = (trpc as any).product?.upsert?.useMutation?.({ onSuccess: () => q?.refetch?.() });
  const startPositioningM = (trpc as any).positioningJobs?.start?.useMutation?.();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [website, setWebsite] = useState("");
  const [usp, setUsp] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [recalDone, setRecalDone] = useState(false);

  React.useEffect(() => {
    const p = q?.data;
    if (!p) return;
    setName(p.name ?? "");
    const pos = (typeof p.positioning === "string" ? safeParse(p.positioning) : p.positioning) ?? {};
    setSku(pos.sku ?? "");
    setWebsite(pos.website ?? "");
    // summary may have an appended 「官方網址：…」 line — show only the USP part
    setUsp(String(pos.summary ?? "").replace(/\n?官方網址：.*$/s, "").trim());
  }, [q?.data]);

  function safeParse(s: string): any { try { return JSON.parse(s); } catch { return {}; } }

  async function handleSave() {
    if (!productId || !upsertM?.mutateAsync) return;
    const p = q?.data;
    const existingPositioning = (typeof p?.positioning === "string"
      ? safeParse(p.positioning)
      : p?.positioning) ?? {};
    const w = website.trim();
    const summary = [usp.trim(), w ? `官方網址：${w}` : ""].filter(Boolean).join("\n");
    await upsertM.mutateAsync({
      id: productId,
      brandId: p?.brandId ?? undefined,
      slug: p?.slug ?? String(productId),
      name: name.trim() || (p?.name ?? "未命名產品"),
      // 2026-08-21: spread existing positioning so imageUrl / price /
      // pipeline segments survive an edit. Cleared fields are sent as null
      // (not undefined) — the server's merge drops undefined keys, so null
      // is the only way for the user to actually clear a value.
      positioning: {
        ...existingPositioning,
        summary: summary || null,
        website: w || null,
        sku: sku.trim() || null,
      },
    });
    setSavedAt(Date.now());
  }

  async function handleRecalibrate() {
    if (!productId) return;
    await handleSave();
    await startPositioningM?.mutateAsync?.({ entityKind: "product", entityId: productId, lang: "zh-TW" });
    setRecalDone(true);
  }

  if (q?.isLoading) {
    return <div className="mt-4 flex justify-center"><Spinner size="sm" /></div>;
  }

  return (
    <div className="bg-default-50 rounded-xl border border-default-200 p-5">
      <FieldRow label={en ? "Belongs to brand" : "所屬品牌"}>
        <div className="text-sm text-default-700 px-1">{brandName ?? "—"}</div>
      </FieldRow>
      <FieldRow label={en ? "Product name" : "產品名稱"}>
        <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} />
      </FieldRow>
      <FieldRow label={en ? "SKU (optional)" : "SKU 型號（可選）"}>
        <Input size="sm" value={sku} onChange={(e) => setSku(e.target.value)} placeholder={en ? "e.g. OB-PRO-2026" : "例：OB-PRO-2026"} />
      </FieldRow>
      <FieldRow label={en ? "Product URL" : "產品網址"}>
        <Input size="sm" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://onbrand.sowork.ai" />
        <p className="text-tiny text-default-400 mt-1">{en ? "The AI re-reads this page when you re-analyze." : "按「重新分析」時 AI 會重讀這個頁面"}</p>
      </FieldRow>
      <FieldRow label={en ? "Positioning / USP" : "產品定位 / USP"}>
        <Textarea minRows={3} value={usp} onChange={(e) => setUsp(e.target.value)}
          placeholder={en ? "What makes this product different — the AI treats this as ground truth." : "這個產品的核心差異——AI 會把這段當成事實依據。"} />
      </FieldRow>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <Button size="sm" color="primary" isLoading={upsertM?.isPending}
          isDisabled={!productId || upsertM?.isPending} onPress={handleSave}>
          {en ? "Save" : "儲存"}
        </Button>
        <Button size="sm" variant="flat" color="secondary" isLoading={startPositioningM?.isPending}
          isDisabled={!productId || startPositioningM?.isPending} onPress={handleRecalibrate}
          title={en ? "Re-reads the product URL and rebuilds positioning" : "重新讀取產品頁，重建產品定位"}>
          {en ? "Re-analyze (re-read product page)" : "重新分析（重讀產品頁）"}
        </Button>
        {savedAt && !upsertM?.isPending && (
          <span className="text-tiny text-success-600 inline-flex items-center gap-1"><CheckIcon size={10} />{en ? "Saved" : "已儲存"}</span>
        )}
        {recalDone && !startPositioningM?.isPending && (
          <span className="text-tiny text-secondary-600">
            {en ? "Re-analysis started — updates in the background." : "已開始重新分析 — 會在背景更新產品定位"}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── BrandedVariantsModal (shared) ───────────────────
 * 2026-07-19 (CJ「品牌視覺頁通常只有色號跑得出來」): extracted from the
 * per-product grid so the palette hero's brand-level「生成品牌視覺」can
 * reuse the exact same overlay. */
function BrandedVariantsModal({ title, loading, error, variants, cutoutAvailable, onClose, en }: {
  title: string;
  loading: boolean;
  error: string | null;
  variants: Array<{ layout: string; pngDataUrl: string }> | null;
  cutoutAvailable?: boolean;
  onClose: () => void;
  en: boolean;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(15,15,14,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF", borderRadius: 14,
          maxWidth: 920, width: "100%", maxHeight: "90vh", overflow: "auto",
          border: "2px solid #0F0F0E",
          boxShadow: "8px 8px 0 #0F0F0E",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #E5E7EB" }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#78716C", margin: 0 }}>
              {en ? "Branded variants" : "品牌變體"}
            </p>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#171717", margin: "3px 0 0" }}>
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "1px solid #E5E7EB",
              background: "transparent", cursor: "pointer", fontSize: 16, color: "#78716C",
            }}
            aria-label={en ? "Close" : "關閉"}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {error && (
            <div style={{ padding: 16, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, color: "#991B1B", fontSize: 13, lineHeight: 1.6 }}>
              {error}
            </div>
          )}
          {!error && loading && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#78716C" }}>
              <div style={{ display: "inline-block", width: 32, height: 32, borderRadius: "50%", border: "3px solid #E5E7EB", borderTopColor: "#18181B", animation: "spin 0.8s linear infinite", marginBottom: 16 }} />
              <p style={{ fontSize: 13, margin: 0 }}>
                {en
                  ? "Compositing — running cutout + 4 layouts (~8 sec)…"
                  : "正在合成 — 跑去背 + 4 個版型（約 8 秒）…"}
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {variants && variants.length > 0 && (
            <>
              {cutoutAvailable === false && (
                <p style={{ fontSize: 12, color: "#92400E", background: "#FEF3C7", padding: "8px 12px", borderRadius: 8, marginBottom: 14 }}>
                  <WarningIcon size={12} /> {en
                    ? "REPLICATE_API_TOKEN not set — using the original product image as a tile (no transparent cutout). Set the env var for true riverflow-grade output."
                    : "還沒設 REPLICATE_API_TOKEN — 用原圖直接合成（沒去背）。設好環境變數後就會用透明去背達到 riverflow 效果。"}
                </p>
              )}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
              }}>
                {variants.map((v) => (
                  <div key={v.layout} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <img
                      src={v.pngDataUrl}
                      alt={v.layout}
                      style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, border: "1px solid #E5E7EB" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "#78716C", fontWeight: 500 }}>
                        {v.layout}
                      </span>
                      <a
                        href={v.pngDataUrl}
                        download={`${title}_${v.layout}.png`}
                        style={{
                          fontSize: 12, fontWeight: 600, color: "#18181B",
                          textDecoration: "none", padding: "4px 8px",
                          border: "1px solid #18181B", borderRadius: 6,
                        }}
                      >
                        {en ? "Download" : "下載"}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── BrandPaletteHero ────────────────────────────
 * 2026-06-21 (CJ「按 riverflow 標準」brand DNA): hero strip above the
 * Visual asset cards that surfaces the auto-extracted brand palette.
 * Calls brandColors.getCurrent for read + extractForBrand for trigger.
 * Empty-state / loading / locked / live-swatches states are all handled
 * inline so the host tab doesn't need to thread props.
 * ─────────────────────────────────────────────────────────────────── */
function BrandPaletteHero({
  brandId, lang, locked,
}: { brandId: number; lang: "zh-TW" | "en"; locked: boolean }) {
  const en = lang === "en";
  const paletteQ = (trpc as any).brandColors?.getCurrent?.useQuery?.(
    { brandId },
    { enabled: !!brandId, staleTime: 30_000 },
  );
  const extractMut = (trpc as any).brandColors?.extractForBrand?.useMutation?.({
    onSuccess: () => paletteQ?.refetch?.(),
  });
  // 2026-07-19 (CJ「品牌視覺頁通常只有色號跑得出來」): brand-level visual
  // generator — most brands have no product with an image, so the only
  // variants entry (per-product ✨ button) never appeared. This button runs
  // generateBrandedVariants({brandId}); the server falls back to website
  // images (the same source the palette extraction already used).
  const genVisualMut = (trpc as any).brandColors?.generateBrandedVariants?.useMutation?.();
  const [brandVisual, setBrandVisual] = React.useState<null | {
    variants: Array<{ layout: string; pngDataUrl: string }> | null;
    error: string | null;
    cutoutAvailable?: boolean;
  }>(null);
  const handleBrandVisual = async () => {
    if (locked || !brandId || !genVisualMut) return;
    setBrandVisual({ variants: null, error: null });
    try {
      const r = await genVisualMut.mutateAsync({ brandId });
      if (r?.ok) {
        setBrandVisual({ variants: r.variants, error: null, cutoutAvailable: r.cutoutAvailable });
      } else {
        const reason = (r as any)?.reason ?? "unknown";
        const msg = reason === "no_palette_yet"
          ? (en ? "Extract the palette first (Extract from products)." : "請先按「從產品圖萃取」取得色彩。")
          : reason === "no_subject_image"
            ? (en
                // 2026-09-10：不再爬官網湊圖，改指向上傳
                ? "No usable photo found — upload a photo to the brand or a product (Settings tab), then retry."
                : "找不到可用的照片 — 請先到「設定」上傳一張品牌或產品照片，再試一次。")
            : String(reason);
        setBrandVisual({ variants: null, error: msg });
      }
    } catch (e: any) {
      setBrandVisual({ variants: null, error: String(e?.message ?? e).slice(0, 200) });
    }
  };
  const data = paletteQ?.data as any;
  const swatches: Array<{
    hex: string; role: string; weight: number;
    lab: { L: number; a: number; b: number };
  }> = data?.swatches ?? [];
  const sourceCount = data?.sourceImageCount ?? 0;
  const userLocked = !!data?.userLocked;
  const isLoading = paletteQ?.isLoading || extractMut?.isPending;

  const handleExtract = () => {
    if (locked || !brandId) return;
    extractMut?.mutate?.({ brandId, targetSize: 7, force: userLocked });
  };

  // Pick text color (black / white) by luminance for contrast on each chip
  const pickFg = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? "#1a1a1a" : "#ffffff";
  };

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid #E5E7EB",
        background: "#FFFFFF",
        padding: 20,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <div>
          <p style={{
            fontSize: 12, fontWeight: 600, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "#78716C", margin: 0,
          }}>
            {en ? "Brand DNA · Color palette" : "品牌 DNA · 色彩"}
          </p>
          <h3 style={{
            fontSize: 17, fontWeight: 700, color: "#171717",
            margin: "4px 0 0", letterSpacing: "-0.01em",
          }}>
            {swatches.length > 0
              ? (en
                  ? `${swatches.length} core colors auto-extracted from ${sourceCount} product image${sourceCount === 1 ? "" : "s"}`
                  : `從 ${sourceCount} 張產品圖自動萃取出 ${swatches.length} 個核心色`)
              : (en ? "Not yet extracted" : "尚未萃取")}
          </h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {userLocked && (
            <span
              title={en ? "User-locked — re-extracting will overwrite manual edits" : "已鎖定 — 重新萃取會覆寫手動編輯"}
              style={{
                fontSize: 12, fontWeight: 600, padding: "3px 8px",
                borderRadius: 4, background: "#FEF3C7", color: "#92400E",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}
            >
              {en ? "Locked" : "已鎖定"}
            </span>
          )}
          <button
            onClick={handleExtract}
            disabled={locked || isLoading}
            style={{
              fontSize: 12, fontWeight: 600, padding: "7px 14px",
              borderRadius: 8, cursor: locked || isLoading ? "not-allowed" : "pointer",
              border: "1px solid #171717",
              background: swatches.length === 0 ? "#171717" : "#FFFFFF",
              color: swatches.length === 0 ? "#FFFFFF" : "#171717",
              opacity: locked ? 0.5 : 1,
              transition: "all 0.15s",
            }}
          >
            {isLoading
              ? (en ? "Extracting…" : "萃取中…")
              : swatches.length === 0
                ? (en ? "Extract from products" : "從產品圖萃取")
                : userLocked
                  ? (en ? "Re-extract (overwrites lock)" : "重新萃取（覆寫鎖定）")
                  : (en ? "Re-extract" : "重新萃取")}
          </button>
          {swatches.length > 0 && (
            <button
              onClick={handleBrandVisual}
              disabled={locked || genVisualMut?.isPending}
              style={{
                fontSize: 12, fontWeight: 600, padding: "7px 14px",
                borderRadius: 8, cursor: locked || genVisualMut?.isPending ? "not-allowed" : "pointer",
                border: "1px solid #18181B",
                background: "#18181B", color: "#FFFFFF",
                opacity: locked ? 0.5 : 1,
                transition: "all 0.15s",
              }}
            >
              {genVisualMut?.isPending
                ? (en ? "Generating…" : "生成中…")
                : (en ? "Brand visuals" : "生成品牌視覺")}
            </button>
          )}
        </div>
      </div>
      {brandVisual && (
        <BrandedVariantsModal
          title={en ? "Brand visuals" : "品牌視覺"}
          loading={!brandVisual.error && !brandVisual.variants}
          error={brandVisual.error}
          variants={brandVisual.variants}
          cutoutAvailable={brandVisual.cutoutAvailable}
          onClose={() => setBrandVisual(null)}
          en={en}
        />
      )}

      {/* States */}
      {extractMut?.error && (
        <p style={{ fontSize: 12, color: "#DC2626", marginBottom: 10 }}>
          {String((extractMut.error as any)?.message ?? extractMut.error).slice(0, 200)}
        </p>
      )}
      {extractMut?.data?.ok === false && extractMut.data.reason === "no_product_images" && (
        <p style={{ fontSize: 12, color: "#92400E", marginBottom: 10 }}>
          {en
            ? "No photos yet. Upload a photo to a product or to the brand's photo library (Settings tab), then come back."
            : "目前還沒有照片。請先到「設定」上傳一張產品照片或品牌照片，再回來這裡。"}
        </p>
      )}

      {/* Empty hint */}
      {swatches.length === 0 && !isLoading && (
        <p style={{ fontSize: 13, color: "#737373", margin: 0, lineHeight: 1.6 }}>
          {en
            ? "Run the extractor to pull 5–7 core colors from your product photos. Generated content will use them."
            : "按「從產品圖萃取」，從產品照挑出 5–7 個核心色；之後生成的內容都會用這份色票。"}
        </p>
      )}

      {/* Swatches row */}
      {swatches.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(swatches.length, 7)}, minmax(0, 1fr))`,
          gap: 8,
          marginTop: 4,
        }}>
          {swatches.map((s, i) => {
            const fg = pickFg(s.hex);
            return (
              <div
                key={`${s.hex}-${i}`}
                title={`${s.hex} · ${s.role} · ${(s.weight * 100).toFixed(1)}%`}
                style={{
                  background: s.hex,
                  borderRadius: 10,
                  padding: 12,
                  minHeight: 96,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  border: "1px solid rgba(0,0,0,0.06)",
                  color: fg,
                  cursor: "default",
                }}
              >
                <span style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", opacity: 0.85,
                }}>
                  {s.role}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>
                    {s.hex.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                    {(s.weight * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── BrandEntityGrid ────────────────────────────
 * Shared card grid for 產品 and 活動 tabs.
 * Shows each entity's positioning preview (tagline / USP / audience).
 * Cards with no positioning show a placeholder state.
 * ─────────────────────────────────────────────────────────────────── */
/**
 * ProductCardThumbnail — 產品列表的縮圖。
 *
 * 2026-09-25（CJ「產品列表的縮圖，我想要用跟任務卡一樣的樣式」→ 看到結果後
 * 「如果要好好展現產品圖的話，應該要用哪一張任務卡的格式？…要如何可以不要旁邊
 * 都是馬賽克」）：
 *
 * 我們站上有兩種卡片格式，它們是為不同東西設計的：
 *
 *   (A) 任務卡（content/pages/PlatformTaskPage.tsx）：頂端是 130px 的中性色塊，
 *       中間放一顆 80×80 的 agent 頭像。那塊底色不是「背景」，是構圖的一部分——
 *       它**從來不是拿來放照片的**。把一張 4:3 的產品照塞進去，兩側必然留白。
 *
 *   (B) 作品卡（content/pages/ProjectsPage.tsx 的 MissionCard）：aspect-[4/3] 的
 *       圖片區 + object-cover 滿版，沒有任何留白；沒有圖時退回有顏色的圖示磚。
 *       這張卡的主角就是圖。
 *
 * 產品列表要「好好展現產品圖」，所以走 (B)。連帶解決馬賽克：先前為了不裁切用
 * object-contain，兩側空白就用同一張圖模糊放大去填——那圈模糊就是畫面上看到的
 * 「馬賽克」。滿版裁切之後不需要填補，模糊層整個拿掉。
 *
 * 取捨講明白：object-cover 會裁掉直式照片的上下。產品照多半是方形或橫式擺拍，
 * 4:3 裁掉的很少；而且縮圖的工作是「認得出這是哪支產品」，完整照片在產品視窗
 * 裡看得到。要改成不裁切就得回到留白，兩者只能選一個。
 */
function ProductCardThumbnail({ imageUrl, name, en }: { imageUrl?: string; name: string; en: boolean }) {
  const [failed, setFailed] = React.useState(false);
  const showImage = !!imageUrl && !failed;
  return (
    <div
      className="relative w-full aspect-[4/3] flex items-center justify-center overflow-hidden"
      style={{ background: showImage ? "#F4F4F5" : "#FAFAF9" }}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          onError={() => setFailed(true)}
        />
      ) : (
        // 沒有圖也要顯示「某個東西」——整片空灰色的格子看起來像壞掉的。
        <div className={`flex flex-col items-center gap-1 px-3 text-center ${failed ? "text-amber-700" : "text-neutral-400"}`}>
          <FontAwesomeIcon icon={faBox} className="text-3xl opacity-60" />
          <span className="text-[12px] font-semibold tracking-wide">
            {failed
              ? (en ? "Image link expired" : "圖片連結已失效")
              : (en ? "No image" : "尚無圖片")}
          </span>
          <span className="text-[12px] opacity-80">
            {en ? "Open this product to fix it" : "點擊查看以修正"}
          </span>
        </div>
      )}
    </div>
  );
}

function BrandEntityGrid({
  kind, items, isLoading, lang, onAdd, onOpen, onDelete, onPosition,
  runningIds, progressMap,
}: {
  kind: "product" | "event";
  items: any[];
  isLoading: boolean;
  lang: "zh-TW" | "en";
  onAdd: () => void;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  onPosition: (id: number) => void;
  /** 2026-07-24: entity ids with a positioning pipeline in flight. */
  runningIds?: number[];
  /** id-keyed (`kind:id`) progress labels, e.g. "3/6". */
  progressMap?: Record<string, string>;
}) {
  const en = lang === "en";

  // 2026-06-21 (CJ「按 riverflow 標準」brand DNA): branded variant generator
  // state. When user clicks "品牌變體" on a card, we mutate, store results
  // in this state, and render a modal showing 4 variants.
  const [variantState, setVariantState] = React.useState<{
    productId: number;
    productName: string;
    variants: Array<{ layout: string; pngDataUrl: string }> | null;
    error: string | null;
    cutoutAvailable?: boolean;
  } | null>(null);
  const genVariantsMut = (trpc as any).brandColors?.generateBrandedVariants?.useMutation?.();

  const extractField = (positioning: any, ...keys: string[]): string => {
    if (!positioning) return "";
    for (const key of keys) {
      const parts = key.split(".");
      let val: any = positioning;
      for (const p of parts) { val = val?.[p]; }
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    return "";
  };

  const getPreview = (item: any) => {
    const p = item.positioning ?? {};
    const interim = p._interim ?? {};   // interim positioning from auto-discovery
    if (kind === "product") {
      return {
        tagline:  extractField(p, "tagline", "tagline.zhTagline", "core.zhTagline", "core.oneLineValueProp", "differentiation.summary")
                    || interim.tagline || "",
        usp:      extractField(p, "usp", "competition.uniqueUsp", "core.oneLineValueProp", "differentiation.functional", "differentiation.summary")
                    || interim.usp || "",
        audience: extractField(p, "audience.primary", "targetAudience")
                    || interim.targetAudience || "",
        // 2026-09-25：售價的 canonical 位置改成 facts.price，舊資料仍在頂層。
        price: extractField(p, "facts.price", "price"),
      };
    } else {
      return {
        tagline: extractField(p, "theme", "tagline", "tagline.zhTagline"),
        usp:     extractField(p, "cta", "offer", "usp"),
        audience: item.startAt
          ? `${new Date(item.startAt).toLocaleDateString(en ? "en-US" : "zh-TW", { month: "short", day: "numeric" })}${item.endAt ? ` → ${new Date(item.endAt).toLocaleDateString(en ? "en-US" : "zh-TW", { month: "short", day: "numeric" })}` : ""}`
          : "",
        price: "",
      };
    }
  };

  const hasPositioning = (item: any): boolean => {
    const p = item.positioning ?? {};
    const interim = p._interim ?? {};
    return !!(
      p.tagline || p.usp || p.theme || p.differentiation?.summary ||
      p.core?.zhTagline || p.core?.oneLineValueProp || p.competition?.uniqueUsp ||
      p.audience?.primary || p.targetAudience ||
      interim.tagline || interim.usp || interim.targetAudience
    );
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50 animate-pulse h-36" />
        ))}
      </div>
    );
  }

  return (
    <div className="px-2">
      {items.length === 0 && (
        <IllustratedEmpty
          kind={kind === "product" ? "product" : "event"}
          title={kind === "product"
            ? (en ? "This box is still empty" : "箱子還是空的")
            : (en ? "Ready to kick off?" : "準備起跑了嗎？")}
          action={{
            label: kind === "product" ? (en ? "+ New product" : "+ 新增產品") : (en ? "+ New event" : "+ 新增活動"),
            onPress: onAdd,
          }}
        />
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {items.map((item, idx) => {
            const preview = getPreview(item);
            const positioned = hasPositioning(item);
            return (
              <button
                key={item.id}
                style={{
                  animation: `fadeSlideIn 0.35s ease both`,
                  animationDelay: `${Math.min(idx * 60, 400)}ms`,
                }}
                onClick={() => onOpen(item.id)}
                // 2026-09-25：外框跟著圖片格式一起走 ProjectsPage 作品卡那一套。
                className="text-left rounded-xl bg-white border border-default-100 p-0 overflow-hidden transition group flex flex-col hover:shadow-md hover:border-default-300"
              >
                {/* 2026-06-21 (CJ「產品頁籤加縮圖」): thumbnail at top.
                    2026-06-30 (prod bug): products.imageUrl column doesn't
                    exist — dig into positioning JSON for image locations. */}
                {kind === "product" && (() => {
                  // 2026-09-25（CJ「有選擇一張主題，但沒有出現在產品列表的縮圖當中」）：
                  // 挑圖規則搬到 lib/productImage.ts 並補上測試——原因是舊的篩選只收
                  // http(s)，把使用者上傳主圖的根相對路徑（/static/asset-photos/…）
                  // 濾掉了，所以「設為主圖」寫進 DB 卻顯示「尚無圖片」。
                  const imgUrl = pickProductImageUrl(item.positioning, item.imageUrl);
                  return <ProductCardThumbnail key={imgUrl ?? "none"} imageUrl={imgUrl} name={item.name} en={en} />;
                })()}

                <div className={kind === "product" ? "p-3" : "p-4"}>
                {/* Name */}
                <p className="text-sm font-semibold text-neutral-900 mb-2 truncate">{item.name}</p>
                {kind === "product" && preview.price && (
                  <p className="text-[12px] font-medium text-neutral-500 -mt-1 mb-2">{preview.price}</p>
                )}

                {positioned ? (
                  <div className="space-y-1.5">
                    {preview.tagline && (
                      <div>
                        <span className="text-[12px] font-semibold uppercase tracking-widest text-neutral-400">
                          {kind === "product" ? (en ? "Tagline" : "標語") : (en ? "Theme" : "主軸")}
                        </span>
                        <p className="text-[12px] text-neutral-700 leading-tight line-clamp-2 mt-0.5">{preview.tagline}</p>
                      </div>
                    )}
                    {preview.usp && (
                      <div>
                        <span className="text-[12px] font-semibold uppercase tracking-widest text-neutral-400">
                          {kind === "product" ? "USP" : (en ? "CTA / Offer" : "CTA / 優惠")}
                        </span>
                        <p className="text-[12px] text-neutral-600 line-clamp-1 mt-0.5">{preview.usp}</p>
                      </div>
                    )}
                    {preview.audience && (
                      <div>
                        <span className="text-[12px] font-semibold uppercase tracking-widest text-neutral-400">
                          {kind === "product" ? (en ? "Audience" : "受眾") : (en ? "Period" : "時間")}
                        </span>
                        <p className="text-[12px] text-neutral-500 line-clamp-1 mt-0.5">{preview.audience}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[12px] text-neutral-400">
                      {en ? "Positioning not yet run" : "尚未建立定位"}
                    </span>
                  </div>
                )}

                <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center gap-1.5 flex-wrap">
                  {/* Run positioning — running state shows live step progress */}
                  {(() => {
                    const isRunning = runningIds?.includes(item.id) ?? false;
                    const prog = progressMap?.[`${kind}:${item.id}`];
                    return (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (kind === "event" || !isRunning) onPosition(item.id); }}
                        disabled={kind !== "event" && isRunning}
                        className={`text-[12px] font-medium px-2 py-1 rounded-md transition flex-1 min-w-0 text-center ${
                          isRunning
                            ? "bg-zinc-100 text-zinc-500 cursor-wait animate-pulse"
                            : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                        }`}
                      >
                        {/* 2026-09-25（CJ「按下開始定位，居然跑到品牌的頁籤」）：
                            活動卡的主要動作是「宣傳企劃」——按下去進企劃頁，不是
                            跑那份 11 段的得獎 brief。產品卡維持原本的定位流程。 */}
                        {kind === "event"
                          ? (en ? "▶ Promotion plan" : "▶ 宣傳企劃")
                          : isRunning
                            ? (en ? `Positioning… ${prog ?? ""}` : `定位中…${prog ? ` ${prog}` : ""}`)
                            : positioned ? (en ? "Re-position" : "重新定位") : (en ? "▶ Run positioning" : "▶ 開始定位")}
                      </button>
                    );
                  })()}
                  {/* 2026-06-21 (CJ「按 riverflow 標準」): branded variant generator.
                      2026-06-30: dropped item.imageUrl gate — column doesn't
                      exist. Backend returns `product_has_no_image` if positioning
                      JSON has no image, and the modal shows that message. */}
                  {kind === "product" && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setVariantState({
                          productId: item.id,
                          productName: item.name,
                          variants: null,
                          error: null,
                        });
                        try {
                          const r = await genVariantsMut?.mutateAsync?.({ productId: item.id });
                          if (r?.ok) {
                            setVariantState({
                              productId: item.id,
                              productName: item.name,
                              variants: r.variants,
                              error: null,
                              cutoutAvailable: r.cutoutAvailable,
                            });
                          } else {
                            const reason = (r as any)?.reason ?? "unknown";
                            const msg = reason === "no_palette_yet"
                              ? (en
                                  ? "Brand palette not extracted yet. Open the Visual tab and click Extract from products first."
                                  : "品牌色彩還沒萃取。請先到「視覺」tab 按「從產品圖萃取」。")
                              : reason === "product_has_no_image" || reason === "no_subject_image"
                                ? (en
                                    ? "No usable photo found — this product has no photo, and neither does the brand's photo library. Upload one first."
                                    : "找不到可用照片 — 這個產品沒有照片，品牌照片庫也沒有。請先上傳一張。")
                                : reason;
                            setVariantState({ productId: item.id, productName: item.name, variants: null, error: msg });
                          }
                        } catch (err: any) {
                          setVariantState({
                            productId: item.id, productName: item.name,
                            variants: null,
                            error: String(err?.message ?? err).slice(0, 200),
                          });
                        }
                      }}
                      className="text-[12px] font-medium px-2 py-1 rounded-md bg-zinc-50 text-zinc-700 hover:bg-zinc-100 transition"
                      title={en ? "Generate 4 branded variants" : "用品牌色生成 4 種變體"}
                    >
                      {en ? "Variants" : "品牌變體"}
                    </button>
                  )}
                  {/* Open */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpen(item.id); }}
                    className="text-[12px] font-medium px-2 py-1 rounded-md bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition"
                  >
                    {en ? "View" : "查看"}
                  </button>
                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(en
                        ? `Delete "${item.name}"? This cannot be undone.`
                        : `確定刪除「${item.name}」？此操作無法復原。`)) {
                        onDelete(item.id);
                      }
                    }}
                    className="text-[12px] px-2 py-1 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 transition"
                    title={en ? "Delete" : "刪除"}
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
                </div>
              </button>
            );
          })}

          {/* Add new card */}
          <button
            onClick={onAdd}
            className="rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/50 p-4 flex flex-col items-center justify-center gap-2 hover:border-neutral-400 hover:bg-neutral-50 transition min-h-[140px]"
          >
            <span className="text-2xl text-neutral-300">+</span>
            <span className="text-xs text-neutral-400 font-medium">
              {kind === "product" ? (en ? "New product" : "新增產品") : (en ? "New event" : "新增活動")}
            </span>
          </button>
        </div>
      )}

      {/* 2026-06-21 (CJ「按 riverflow 標準」) → 2026-07-19: markup extracted
          to the shared BrandedVariantsModal (also used by the palette hero's
          brand-level 生成品牌視覺 button). */}
      {variantState && (
        <BrandedVariantsModal
          title={variantState.productName}
          loading={!variantState.error && !variantState.variants}
          error={variantState.error}
          variants={variantState.variants}
          cutoutAvailable={variantState.cutoutAvailable}
          onClose={() => setVariantState(null)}
          en={en}
        />
      )}
    </div>
  );
}
