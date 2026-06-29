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
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Button, Card, CardBody, CardHeader, Chip, Divider,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Skeleton, Tabs, Tab,
  Input, Textarea, Spinner, Select, SelectItem, CheckboxGroup, Checkbox,
} from "@heroui/react";
import SegmentEditor from "../components/positioning/SegmentEditor";
import ThinkingOverlay from "../components/positioning/ThinkingOverlay";
import PipelineRunner, { type PipelineState } from "../components/positioning/PipelineRunner";
import PipelineThinkingPanel from "../components/positioning/PipelineThinkingPanel";
import AgentPersonaBar from "../components/positioning/AgentPersonaBar";
import SpeedCard from "../components/positioning/SpeedCard";
import PromptLibrary from "../components/positioning/PromptLibrary";
import BrandAssetEditor, { type AssetKey } from "../components/positioning/BrandAssetEditor";
import KnowledgeEditor from "../components/positioning/KnowledgeEditor";
import BrandMessageBar from "../components/positioning/BrandMessageBar";
import InlineAssetCard from "../components/positioning/InlineAssetCard";
import { InfoTab as BrandInfoTab, DangerTab as BrandDangerTab, PublishTab as BrandPublishTab } from "../components/positioning/BrandSettingsSheet";
import AIPromptsEditor from "../components/positioning/AIPromptsEditor";
import BrandOnboardingWizard from "../components/onboarding/BrandOnboardingWizard";
import { BrandActionChipsRow, BrandTestPanel, usePositioningStatus } from "../components/positioning/BrandActionChips";
import AddEntityModal, { type AddEntityTab } from "../components/AddEntityModal";
import ProductDetailModal from "../components/positioning/ProductDetailModal";
import { EntityStats } from "../components/EntityStats";
// Notion-style line icons
import {
  Target as LucideTarget, Type as LucideType, Palette as LucidePalette,
  Lock as LucideLock, Unlock as LucideUnlock, Play as LucidePlay,
  RotateCcw as LucideRotate, BookOpen as LucideBook,
  Sparkles, Link2 as LucideLink, Bot as LucideRobotIcon,
  Share2 as LucideShare,
  Quote as LucideQuote, Shield as LucideShield, Type as LucideTypeIcon,
  Pencil as LucidePencil, Award as LucideAward, Package as LucidePackage,
  Hash as LucideHash, MessageCircle as LucideMessage,
  FileText as LucideFileText,
  IdCard as LucideIdCard, Trash2 as LucideTrash,
} from "lucide-react";
import { SCOPE_SEGMENTS, type SegmentSpec } from "../lib/positioningSchema";
import { pipelineFor, type PipelineStepSpec } from "../lib/positioningPipeline";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown, faPlus, faCloudArrowUp, faShapes,
  faPalette, faFont, faQuoteLeft, faBullseye, faUsers,
  faImage, faIcons, faChartPie, faImages, faPenNib, faShieldHalved,
  faFolderOpen, faUserPlus, faCrown, faPlay, faLock, faLockOpen,
  faBookOpen, faTableList, faRobot, faTrademark, faBox, faCalendarDay,
  faRocket, faBullhorn,
  faWandSparkles, faEllipsis, faCircleInfo,
  faMagnifyingGlass, faGear, faCheck, faUserCircle,
} from "@fortawesome/free-solid-svg-icons";

// Sub-nav id format:
//   "asset:<key>"   — non-positioning brand assets (準則 / 標誌 / etc.)
//   "seg:<segment>" — one positioning segment (driven by positioningSchema)
//   "card" / "prompts" / "all"
type SectionId = string;

interface SubNavItem { id: SectionId; label: string; badge?: string; group?: string; }

// Brand has positioning segments + visual/asset entries.
// Per CJ: 圖像/圖示/圖表/品牌範本/準則/照片/所有資產 all removed.
const BRAND_ASSET_SUBNAV: SubNavItem[] = [
  { id: "asset:logo",   label: "標誌",     group: "visuals" },
  { id: "asset:colors", label: "顏色",     group: "visuals" },
  { id: "asset:fonts",  label: "字型",     group: "visuals" },
];

// Event-specific subnav additions (CJ direction 2026-04-29):
// - settings page lets user edit metadata (brand / name / period /
//   productIds) post-creation — previously only set at create time.
// - 視覺資產 deferred to a later round (event posters / videos go through
//   MediaGenFlow per the visual-step rule, not stored as static assets).
const EVENT_SETTINGS_SUBNAV: SubNavItem[] = [
  { id: "settings", label: "設定（品牌 / 期間 / 產品）", group: "settings" },
];

// Tile colors (HeroUI semantic-100 backgrounds + matching tone)
type Tone = "primary" | "secondary" | "success" | "warning" | "danger" | "default";
interface Tile {
  id: SectionId;
  label: string;
  icon: any;
  tone: Tone;
  count?: number;
  ready: boolean;
}

export default function BrandsPage() {
  const { t, lang } = useLang();
  const { brandId, setBrandId, brands, scope: globalScope, setScope } = useOutletContext<ShellOutletCtx>();

  // 2026-06-19 Phase 2 (CJ「BrandsPage 改用 URL 帶 id」): the global scope is
  // brand-only now. The specific product / event being edited comes from the
  // URL (?p= / ?e=), local to this editor session, so it never leaks to other
  // pages. brandId still comes from the global scope (or the ?b= the shell
  // already synced into it). All downstream `scope?.productId/eventId` reads
  // keep working against this merged object.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlProductId = Number(searchParams.get("p")) || null;
  const urlEventId = Number(searchParams.get("e")) || null;
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
  const goToEntity = React.useCallback(
    (kind: "brand" | "product" | "event", id: number | null) => {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete("p");
        sp.delete("e");
        if (kind === "product" && id) sp.set("p", String(id));
        if (kind === "event" && id) sp.set("e", String(id));
        return sp;
      }, { replace: true });
    },
    [setSearchParams],
  );

  // Add entity modal (新增品牌 / 產品 / 活動)
  const [addModal, setAddModal] = useState<{ open: boolean; tab: AddEntityTab }>({ open: false, tab: "brand" });
  // Inline test panel (試寫 expand below kicker row)
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  // 2026-05-08: onboarding wizard for first-time users (no brands yet).
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  // 2026-05-30 (CJ「modal 移除」): ?tab= deep-links now navigate to the
  // corresponding main-workspace category instead of opening a modal.
  React.useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("tab");
      if (t === "publish" || t === "ai") {
        setCategory(t);
      } else if (t === "connector") {
        setCategory("publish"); // legacy alias
      }
      // info/visual → those are already the default main tabs; no-op.
    } catch { /* no-op */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [onboardingHint, setOnboardingHint] = useState<string | undefined>(undefined);

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
          ? `Lock "${tabName}"?\nAfter locking:\n· Editor goes read-only (unlock to change)\n· Every channel uses this as the single source of truth\n· All 30s / 60s / 99s / 7-Day Publisher tasks show the locked badge\nYou can unlock anytime.`
          : `要鎖定「${tabName}」嗎？\n鎖定後：\n· 編輯欄會變成唯讀（解鎖才能改）\n· 全平台都會用這份為單一真相\n· 所有 30s/60s/99s/七日發布台任務都會看到 ✅ 已鎖定的標示\n隨時可以解鎖。`;
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
  // alongside 速查卡 / AI 指令庫 / brand assets (brand only).
  const segments = scopeMode === "none" ? [] : SCOPE_SEGMENTS[scopeMode];
  const SUBNAV: SubNavItem[] = useMemo(() => {
    const items: SubNavItem[] = [];
    items.push({ id: "card",    label: lang === "en" ? "Cheat sheet" : "速查卡",     group: "doc" });
    items.push({ id: "prompts", label: lang === "en" ? "AI prompts"  : "AI 指令庫",  group: "doc" });
    for (const s of segments) {
      items.push({
        id: `seg:${s.id}`,
        label: `${s.num} ${s.title}`,
        group: "segments",
      });
    }
    if (scopeMode === "brand") {
      items.push({ id: "asset:logo",   label: lang === "en" ? "Logo"   : "標誌", group: "visuals" });
      items.push({ id: "asset:colors", label: lang === "en" ? "Colors" : "顏色", group: "visuals" });
      items.push({ id: "asset:fonts",  label: lang === "en" ? "Fonts"  : "字型", group: "visuals" });
    }
    if (scopeMode === "event") {
      items.push({ id: "settings", label: lang === "en" ? "Campaign settings" : "設定（品牌 / 期間 / 產品）", group: "settings" });
    }
    return items;
  }, [scopeMode, segments, lang]);

  // ── Navigation ────────────────────────────────────────────────────────────
  // `cat` URL param drives the large category. After 2026-05-07 restructure,
  // we have 3 top-level tabs: positioning / copy / visual. The 200px left
  // sub-nav was removed — content area now full-bleed with a horizontal
  // tab strip above it. (searchParams/setSearchParams declared at top.)
  const urlCat = searchParams.get("cat") ?? "positioning";
  // 2026-05-07 Path A simplification: 3 main tiles only (定位/文字/知識).
  // "visual" is kept in the type for legacy lock-state code paths, but
  // is no longer exposed as a tile — its contents live in Settings.
  const category: "positioning" | "copy" | "visual" | "knowledge" | "info" | "publish" | "ai" | "settings" | "products" | "events" | "tools" =
    urlCat === "copy" ? "copy"
    : urlCat === "knowledge" ? "knowledge"
    : urlCat === "visual" ? "visual"
    : urlCat === "info" ? "info"
    : urlCat === "publish" ? "publish"
    : urlCat === "ai" ? "ai"
    : urlCat === "settings" ? "settings"
    : urlCat === "products" ? "products"
    : urlCat === "events" ? "events"
    : urlCat === "tools" ? "tools"
    : "positioning";
  const setCategory = (next: "positioning" | "copy" | "knowledge" | "info" | "visual" | "publish" | "ai" | "products" | "events" | "tools") => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("cat", next);
    setSearchParams(nextParams, { replace: true });
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

  // ── Product/Event tab hooks — MUST stay at top level (no IIFE) ──────────
  // React error #300 occurs if hooks are called inside conditional IIFE.
  const discoveryStatusQ = (trpc as any).theater?.getProductDiscoveryStatus?.useQuery?.(
    { brandId: activeBrandIdForLocks ?? 0 },
    { enabled: !!activeBrandIdForLocks && category === "products", refetchInterval: 5_000, staleTime: 0 },
  );
  const discoveryStatus = discoveryStatusQ?.data as {
    status: string; phase: string; totalFound: number; totalPositioned: number; currentProduct: string | null;
  } | null;
  const discoveryRunning = discoveryStatus?.status === "running" || discoveryStatus?.status === "pending";
  const triggerDiscoveryMut = (trpc as any).theater?.triggerProductDiscovery?.useMutation?.({
    onSuccess: () => discoveryStatusQ?.refetch?.(),
  });

  // Product detail modal
  const [productDetailId, setProductDetailId] = useState<number | null>(null);

  // While discovery is running, poll product list every 3s so cards appear
  // one-by-one as the AI positions each product (progressive reveal).
  React.useEffect(() => {
    if (!discoveryRunning) return;
    const t = setInterval(() => { brandProductsQ?.refetch?.(); }, 3_000);
    return () => clearInterval(t);
  }, [discoveryRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  const prodRemoveMut  = (trpc as any).product?.remove?.useMutation?.({ onSuccess: () => brandProductsQ?.refetch?.() });
  const prodStartMut   = (trpc as any).positioningJobs?.start?.useMutation?.();
  const prodInterimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.();

  const evRemoveMut    = (trpc as any).event?.remove?.useMutation?.({ onSuccess: () => brandEventsQ?.refetch?.() });
  const evStartMut     = (trpc as any).positioningJobs?.start?.useMutation?.();
  const evInterimMut   = (trpc as any).positioningJobs?.runInterim?.useMutation?.();

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
      else if (category === "publish" || category === "ai") setSection("pos:home");
      else                              setSection("pos:home");
    }
  }, [category]);

  // (brand dropdown moved to ShellLayout sidebar)

  // Reset to positioning grid when scope changes
  React.useEffect(() => {
    setSection("pos:home");
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
  const scopeIcon =
    scopeMode === "product" ? faBox
    : scopeMode === "event" ? faCalendarDay
    : faTrademark;
  const scopeEyebrow =
    scopeMode === "product" ? "PRODUCT"
    : scopeMode === "event" ? "EVENT"
    : "BRAND";
  const brandName = currentBrand?.name ?? (lang === "en" ? "My brand" : "我的品牌");
  const brandInitial = brandName.charAt(0).toUpperCase();

  const brainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: null, isLoading: false };

  const brainEntries: Record<string, any[]> =
    ((brainQuery.data as any)?.entries as Record<string, any[]>) ?? {};
  const cnt = (cat: string) => brainEntries[cat]?.length ?? 0;

  // Brand asset tiles (visuals — non-positioning).
  // Per CJ: only logo / colors / fonts remain.
  const TILES: Tile[] = [
    { id: "asset:logo",   label: "標誌", icon: faPenNib,  tone: "default", ready: true },
    { id: "asset:colors", label: "顏色", icon: faPalette, tone: "default", ready: true },
    { id: "asset:fonts",  label: "字型", icon: faFont,    tone: "default", ready: true },
  ];

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

  const utils = (trpc as any).useUtils?.() ?? null;
  const saveMutation = (trpc as any).scope?.savePositioning?.useMutation
    ? (trpc as any).scope.savePositioning.useMutation({
        onSuccess: () => utils?.scope?.active?.invalidate?.(),
      })
    : null;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMode, targetId, hasAnyPositioningContent, pipeline.status]);

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
    "cta_library", "hook_library", "ai_prompts", "templates_copy",
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
  // Action handler for the primary button — 文字/視覺 just navigate to
  // the first asset card; 定位 fires the real pipeline.
  const handleTabAction = (tab: "positioning" | "copy" | "visual") => {
    if (tabLocks[tab]) return; // locked guard (safety; button also disabled)
    if (tab === "positioning") { startPipeline(); return; }
    if (tab === "copy")        { setSection("asset:voice"); return; }
    if (tab === "visual")      { setSection("asset:logo");  return; }
  };

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex flex-col">
      {/* 2026-05-30 (CJ「modal 移除，功能全進主工作區」):
          BrandSettingsSheet modal removed. 平台授權 and AI 指令 are now
          full tabs in the main workspace. 危險區 remains inside 基本資料. */}

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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600 mb-4">
                BRAND · STEP 1
              </p>
              <h1 className="text-3xl font-bold text-neutral-900 mb-3 leading-tight">
                {lang === "en" ? "Set up your first brand" : "建立你的第一個品牌"}
              </h1>
              <p className="text-sm text-neutral-600 mb-6 leading-relaxed">
                {lang === "en"
                  ? "Your brand is where everything in OnBrand starts. Once it's in, the AI reads your positioning, words, and visual style — every task pulls from this brain."
                  : "品牌是 OnBrand 一切的起點。建立後，AI 會自動分析定位、用詞、視覺風格 — 接下來的所有任務都會吃這份品牌大腦。"}
              </p>
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
        {/* 2026-05-30: gear icon removed — 平台授權 / AI 指令 are now main workspace tabs */}
        {/* 2026-05-10 (CJ「4A 代理商專業感, B&W」): hero redesigned.
            Removed gradient emblem + gradient title. Editorial
            typography: tiny eyebrow, large bold title, subtle stats. */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-[1100px] mx-auto">
          {/* Eyebrow */}
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-600 mb-3">
            BRAND
          </p>

          {/* Plain title — no gradient, no emblem. Just typography. */}
          <h1
            className="font-bold tracking-tight leading-none text-neutral-900 mb-3"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
          >
            {scopeName}
          </h1>

          {/* 2026-05-11 (reviewer feedback「方法論本身是隱形的」):
              replaced tech-spec stats (X 方法論・Y 技能・Z Agents) with a
              one-line methodology manifesto. Engine stats moved to admin /
              about page. Manifesto makes the methodology→content causality
              the headline, not "we have N things". */}
          {/* Canonical subtitle — same rendering as /30s · /60s · /99s · /theater · /projects · /missions. */}
          <p
            className="mt-3 mx-auto text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 640,
            }}
          >
            {lang === "en"
              ? "The SoWork Brand Positioning Method · lock who you are first, then every post knows what to say"
              : "SoWork 品牌定位法 · 先鎖定你是誰，AI 才知道每篇文章要說什麼"}
          </p>
          <p
            className="mt-2 mb-5 mx-auto text-default-700"
            style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 640, letterSpacing: "0.02em" }}
          >
            <span style={{ fontWeight: 600, color: "#171717", marginRight: 6 }}>{lang === "en" ? "Includes:" : "包含："}</span>
            {lang === "en"
              ? "14-step positioning · Copy / visual / knowledge assets · AI prompt library"
              : "14 步定位 · 文字 / 視覺 / 知識資產 · AI 指令庫"}
          </p>

          {/* 2026-05-11 (CJ「搜尋 BAR 不需要了」): BrandMessageBar removed.
              Manifesto subtitle above already carries the value-prop;
              tagline preview lived in the bar redundantly. Kept the import
              available for any debug page that wants to surface it. */}

          {/* Tab tiles — 7 consistent tiles in one scrollable row */}
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
                // 知識 + AI指令 merged into 品牌工具.
                // 產品 + 活動 added as independent tabs with card grids.
                const allTiles = [
                  { v: "positioning" as const, label: lang === "en" ? "Positioning" : "定位",
                      desc: scopeMode === "event"   ? (lang === "en" ? "Campaign positioning" : "活動定位")
                          : scopeMode === "product" ? (lang === "en" ? "Product positioning"  : "產品定位")
                          : (lang === "en" ? "Brand core / Slogan" : "品牌核心 / Slogan"),
                      Icon: LucideTarget,    scopes: ["brand", "product", "event"] as string[] },
                  { v: "copy"        as const, label: lang === "en" ? "Copy"    : "文字",
                      desc: scopeMode === "product" ? (lang === "en" ? "Tone / style" : "語氣 / 風格")
                          : scopeMode === "event"   ? (lang === "en" ? "Voice / rules" : "語氣 / 規範")
                          : (lang === "en" ? "Words / banned / style" : "用詞 / 禁忌 / 風格"),
                      Icon: LucideType,      scopes: ["brand", "product", "event"] as string[] },
                  { v: "visual"      as const, label: lang === "en" ? "Visual"  : "視覺",
                      desc: lang === "en" ? "Logo / palette / font" : "Logo / 色票 / 字型",
                      Icon: LucidePalette,   scopes: ["brand"] },
                  { v: "info"        as const, label: lang === "en" ? "Info"    : "基本資料",
                      desc: scopeMode === "event"   ? (lang === "en" ? "Dates / products"    : "時間 / 產品")
                          : scopeMode === "product" ? (lang === "en" ? "Name / brand"        : "名稱 / 品牌")
                          : (lang === "en" ? "Name / industry" : "名稱 / 產業"),
                      Icon: LucideIdCard,    scopes: ["brand", "product", "event"] },
                  { v: "tools"       as const, label: lang === "en" ? "Brand tools" : "品牌工具",
                      desc: lang === "en" ? "Knowledge / AI prompts" : "知識庫 / AI 指令",
                      Icon: LucideBook,      scopes: ["brand"] },
                  { v: "products"    as const, label: lang === "en" ? "Products" : "產品",
                      desc: lang === "en" ? "Product cards & positioning" : "產品卡片與定位",
                      Icon: LucideRobotIcon, scopes: ["brand"] },
                  { v: "events"      as const, label: lang === "en" ? "Events"   : "活動",
                      desc: lang === "en" ? "Campaign cards & positioning" : "活動卡片與定位",
                      Icon: LucideTarget,    scopes: ["brand"] },
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
                        <LucideLock
                          size={11} strokeWidth={2.5}
                          className={active ? "text-neutral-300 ml-auto" : "text-neutral-600 ml-auto"}
                        />
                      )}
                    </div>
                    <p className={`text-[11px] mt-0.5 ${active ? "text-neutral-300" : "text-neutral-700"}`}>
                      {t.desc}
                      {locked && (lang === "en" ? " · Locked" : " · 已鎖定")}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kicker row — BRAND WORKSPACE pill + action chips (試寫 / 定案) */}
          <KickerRow
            brandId={activeBrandIdForLocks}
            scopeName={scopeName}
            testOpen={testPanelOpen}
            onToggleTest={() => setTestPanelOpen((v) => !v)}
            scopeMode={scopeMode}
            scopeEntityId={
              scopeMode === "product" ? (scope?.productId ?? null)
              : scopeMode === "event"   ? (scope?.eventId   ?? null)
              : null
            }
          />
        </div>
      </div>
      )}{/* end scopeBrands.length > 0 hero */}

      {/* Inline test panel — slides below the hero, pushes tab content
          down. Stays open until user closes via × or 收起試寫. */}
      <BrandTestPanel
        brandId={activeBrandIdForLocks}
        open={testPanelOpen}
        onClose={() => setTestPanelOpen(false)}
      />

      {/* 2026-05-11 (CJ「大腦區感覺也重複了」): the floating
          PositioningBrainBar duplicated the new in-page
          PipelineThinkingPanel. Removed — the in-page panel is now the
          single source of "AI thinking" UI. (Component retained below
          in case we want to revive it as a global indicator later.) */}

      {/* Lock controls bar — sits above each tab's content. State-aware:
          locked → green check banner with 解鎖 button
          unlocked → soft hint with 🔒 鎖定 button to commit current state */}
      {(category === "positioning" || category === "copy" || category === "visual") && activeBrandIdForLocks && (() => {
        const tabLabel = category === "positioning"
          ? (lang === "en" ? "Positioning" : "定位")
          : category === "copy"
            ? (lang === "en" ? "Copy" : "文字")
            : (lang === "en" ? "Visual" : "視覺");
        const lock = tabLocks[category];
        const isLocked = !!lock;
        return (
          <div style={{
            background: isLocked ? "#ECFDF5" : "#F9FAFB",
            borderBottom: "1px solid #E5E7EB",
            padding: "10px 28px",
          }}>
            <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: isLocked ? "#10B981" : "#E5E7EB",
                    color: isLocked ? "white" : "#6B7280",
                  }}
                >
                  <FontAwesomeIcon icon={isLocked ? faLock : faLockOpen} style={{ fontSize: 13 }} />
                </div>
                <div>
                  {isLocked ? (
                    <>
                      <p className="text-small font-semibold text-emerald-800 m-0">
                        {lang === "en"
                          ? `✅ ${tabLabel} locked — single source of truth across all channels`
                          : `✅ ${tabLabel}已鎖定 — 全平台採用此版本為單一真相`}
                      </p>
                      <p className="text-tiny text-emerald-600 m-0">
                        {lang === "en"
                          ? `Locked at ${new Date(lock.at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}`
                          : `鎖定於 ${new Date(lock.at).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" })}`}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-small font-semibold text-default-800 m-0">
                        {lang === "en" ? `${tabLabel} — not locked yet` : `${tabLabel} 尚未鎖定`}
                      </p>
                      <p className="text-tiny text-default-700 m-0">
                        {lang === "en"
                          ? "Once locked: editor goes read-only · every channel (30s / 60s / 99s / 7-Day Publisher) uses this as the single source of truth"
                          : "鎖定後：編輯欄變唯讀 · 全平台 (30s/60s/99s/七日發布台) 用這份為單一真相"}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                color={isLocked ? "default" : "success"}
                variant={isLocked ? "flat" : "solid"}
                onPress={() => handleLockToggle(category as "positioning" | "copy" | "visual")}
                isLoading={lockTabMut?.isPending || unlockTabMut?.isPending}
              >
                {/* CJ 2026-05-08: 只要出現一個 icon — kept the left circle
                    icon at line ~875, removed the duplicate startContent
                    icon from this button. */}
                {isLocked
                  ? (lang === "en" ? "Unlock" : "解鎖")
                  : (lang === "en" ? `Lock ${tabLabel}` : `鎖定${tabLabel}`)}
              </Button>
            </div>
          </div>
        );
      })()}

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
              fontSize: 10, fontWeight: 700, color: "#A8A29E",
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
              { id: "card",    label: lang === "en" ? "Cheat sheet" : "速查卡"    },
              { id: "prompts", label: lang === "en" ? "AI prompts"  : "AI 指令庫" },
              ...segments.map(s => ({ id: `seg:${s.id}`, label: `${s.num} ${lang === "en" ? (s.titleEn ?? s.title) : s.title}` })),
            ].map(item => {
              const active = section === item.id;
              return (
                <button key={item.id} onClick={() => setSection(item.id)} style={{
                  width: "100%", display: "flex", alignItems: "center",
                  padding: "5px 10px", borderRadius: 8,
                  background: active ? "rgba(163,112,252,0.15)" : "none",
                  border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  color: active ? "rgb(74,46,126)" : "rgb(15,16,21)",
                  textAlign: "left", transition: "background 0.12s",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F5F4F2"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(163,112,252,0.15)" : "none"; }}
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
                id={item.id}
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
                  background: active ? "rgba(163,112,252,0.15)" : "none",
                  border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  color: active ? "rgb(74,46,126)" : "rgb(15,16,21)",
                  textAlign: "left", transition: "background 0.12s",
                }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F5F4F2"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(163,112,252,0.15)" : "none"; }}
                >
                  <FontAwesomeIcon icon={faGear} style={{ fontSize: 11, color: active ? "rgb(74,46,126)" : "#A8A29E" }} />
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
                      <LucideTrash size={14} className="text-rose-600" />
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
                  {pipeline.status === "idle" && (
                    <>
                      {/* Persistent strategist persona bar even when idle —
                          the workspace always feels staffed by a 4A-style
                          strategy lead, who introduces the SoWork 品牌定位 method. */}
                      <AgentPersonaBar
                        persona="strategist"
                        brandName={scopeName}
                        mode="idle"
                        message={
                          scopeMode === "product"
                            ? (lang === "en"
                                ? "Positioning this product — 6 steps from audience pain to a unique selling angle that powers all copy and visuals."
                                : "為這個產品做定位 — 6 步從族群痛點推導出獨家賣點，作為文案 / 視覺的依據。")
                          : scopeMode === "event"
                            ? (lang === "en"
                                ? "Positioning this campaign — 11 steps from background and audience to an SMP (single-minded proposition), then messaging and creative."
                                : "為這場活動做定位 — 11 步從背景與受眾推導出 SMP（單一核心命題），再展開訊息架構與創意。")
                          : (lang === "en"
                              ? "I'll run the 14-step SoWork Brand Positioning Method to lock in who you are and who you're here for — every piece of content flows from this."
                              : "我會用SoWork 品牌定位法的 14 步幫你鎖定「你是誰、為誰而存在」 — 鎖定後，所有內容都會以此為基礎產出。")
                        }
                      />
                      <PositioningTopRow
                        // 2026-05-13 (CJ「按了套用活動定位框架時，出現Event not found」):
                        // pass the scope-aware entity id, not the brand id.
                        // When scope is event/product, server looks up
                        // events.id = entityId — passing brandId here
                        // mismatched and returned "not found".
                        brandId={targetId as number | null}
                        scopeMode={scopeMode}
                        locked={!!tabLocks.positioning}
                        onLockToggle={() => handleLockToggle("positioning")}
                      />
                    </>
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
                        <span style={{ fontSize: 14 }}>✅</span>
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
                    <PositioningGrid
                      scopeMode={scopeMode}
                      segments={segments}
                      onSelect={setSection}
                      segmentData={positioningSegmentData}
                    />
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
                {scopeMode !== "none" && pipelineSteps.length > 0 && (
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
                      <FontAwesomeIcon icon={faWandSparkles} className="text-primary mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-small font-semibold text-primary-800">{lang === "en" ? "🛑 SMP Checkpoint — confirm your single-minded proposition" : "🛑 SMP Checkpoint — 請確認單一核心命題"}</p>
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
                    {lang === "en" ? "⚠ These steps came back empty — re-run them from each segment:" : "⚠ 以下步驟沒寫入內容，建議到對應頁籤重跑："}{" "}
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
                  statusText={
                    tabHasContent.visual
                      ? (lang === "en" ? "Some visual assets ready — keep filling or start over from the first one" : "已有部分視覺資產 — 可繼續補完，或重新從第一張開始")
                      : (lang === "en" ? "Empty — hit start to walk through from logo on" : "尚未填寫 — 按下開始，從標誌設定起逐步完成")
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
              {section === "asset:all" && activeBrandIdForLocks && (
                <BrandPaletteHero brandId={activeBrandIdForLocks} lang={lang} locked={!!tabLocks.visual} />
              )}

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
                  "cta_library", "hook_library", "ai_prompts", "templates_copy",
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

                /* ── 預設：所有資產卡片 grid ── */
                const ASSET_GROUPS: Array<{
                  label: string;
                  items: Array<{ id: string; label: string; icon: any; bg: string; }>;
                }> = [
                  {
                    label: lang === "en" ? "Essentials" : "基礎元素",
                    items: [
                      { id: "asset:logo",       label: lang === "en" ? "Logo"   : "標誌",   icon: faPenNib,    bg: "#FFF7ED" },
                      { id: "asset:colors",     label: lang === "en" ? "Colors" : "顏色",   icon: faPalette,   bg: "#F5F3FF" },
                      { id: "asset:fonts",      label: lang === "en" ? "Fonts"  : "字型",   icon: faFont,      bg: "#EFF6FF" },
                    ],
                  },
                  {
                    label: lang === "en" ? "Visual style" : "視覺風格",
                    items: [
                      { id: "asset:imagery_style", label: lang === "en" ? "Imagery style" : "圖像風格", icon: faImage,    bg: "#FFF7ED" },
                      { id: "asset:icon_style",    label: lang === "en" ? "Icon style"    : "圖示風格", icon: faIcons,    bg: "#F5F3FF" },
                      { id: "asset:chart_style",   label: lang === "en" ? "Chart style"   : "圖表風格", icon: faChartPie, bg: "#ECFDF5" },
                    ],
                  },
                  {
                    label: lang === "en" ? "Visual rules" : "視覺規範",
                    items: [
                      { id: "asset:guidelines",   label: lang === "en" ? "Visual guidelines" : "視覺準則", icon: faShieldHalved, bg: "#F0FDF4" },
                      { id: "asset:layout_rules", label: lang === "en" ? "Layout rules"     : "排版規範", icon: faPenNib,       bg: "#FFFBEB" },
                    ],
                  },
                  {
                    label: lang === "en" ? "Library" : "素材庫",
                    items: [
                      { id: "asset:photos",     label: lang === "en" ? "Photos"    : "照片",     icon: faImages,    bg: "#F0F9FF" },
                      { id: "asset:templates",  label: lang === "en" ? "Templates" : "品牌範本", icon: faFolderOpen, bg: "#FFFBEB" },
                    ],
                  },
                ];

                return (
                  <>
                    {ASSET_GROUPS.map((group, gi) => (
                      <div key={gi}>
                        {/* 分組標題 — 細線 + 灰色小標籤 */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: "#A8A29E",
                            letterSpacing: "0.10em", textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}>{group.label}</span>
                          <div style={{ flex: 1, height: 1, background: "#F0EFED" }} />
                          <button style={{
                            fontSize: 12, color: "#6366F1", background: "none", border: "none",
                            cursor: "pointer", whiteSpace: "nowrap", padding: 0,
                            fontWeight: 500,
                          }}>
                            {lang === "en" ? "Show more" : "顯示更多"}
                          </button>
                        </div>

                        {/* 4-col card grid */}
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: 14,
                          marginBottom: 4,
                        }}>
                          {group.items.map(item => {
                            const k = item.id.startsWith("asset:") ? item.id.slice("asset:".length) : item.id;
                            const v = brandAssets[k];
                            const preview = previewForAsset(k, v, lang);
                            return (
                              <AssetCard
                                key={item.id}
                                label={item.label}
                                icon={item.icon}
                                bg={item.bg}
                                onClick={() => setSection(item.id)}
                                preview={preview}
                                hasContent={!!preview}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* 2026-05-13 (CJ「右下方的 icon 重疊了，只留客服 icon」):
                        the floating + FAB was redundant with BrandHierarchyPill's
                        「+ 新增品牌 / 產品 / 活動」menu top-left, and overlapped
                        with the bottom-right Mia 客服 avatar. Removed. */}
                  </>
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
          {derivedCategory === "copy" && activeBrandIdForLocks && scopeMode === "brand" && (
            <>
              <div style={{ padding: "16px 28px 0" }}>
                <AgentPersonaBar persona="copywriter" brandName={scopeName} mode="idle" />
              </div>
              <CopyTabInline
                key={`copy-${activeBrandIdForLocks}`}
                brandId={activeBrandIdForLocks}
                brandAssets={brandAssets}
                fullPositioning={fullPositioning}
                locked={!!tabLocks.copy}
                onLockToggle={() => handleLockToggle("copy")}
              />
            </>
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
                  pipelineThinking={null}
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
              <div style={{ padding: "16px 28px 32px" }}>
                <PositioningPanel
                  section="seg:guidelines"
                  scopeMode="event"
                  scopeName={scopeName}
                  scopeBrandId={scope?.brandId ?? null}
                  scopeProductId={scope?.productId ?? null}
                  scopeEventId={scope.eventId}
                  pipelineThinking={null}
                  onAutoFill={runSegmentAutoFill}
                  locked={!!tabLocks.copy}
                />
              </div>
            </>
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

          {/* ── AI 指令 (ai) — per-platform prompt overrides (legacy route) ── */}
          {derivedCategory === "ai" && scopeMode === "brand" && (
            <div style={{ padding: "8px 0 32px" }}>
              <AIPromptsEditor brandId={activeBrandIdForLocks} />
            </div>
          )}

          {/* ── 品牌工具 (tools) — 知識庫 + AI 指令 合一 ── */}
          {derivedCategory === "tools" && scopeMode === "brand" && (
            <div style={{ padding: "8px 0 32px" }} className="space-y-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-4 px-1">
                  {lang === "en" ? "Knowledge Base" : "知識庫"}
                </p>
                <KnowledgeEditor brandId={activeBrandIdForLocks} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-4 px-1">
                  {lang === "en" ? "AI Prompt Library" : "AI 指令庫"}
                </p>
                <AIPromptsEditor brandId={activeBrandIdForLocks} />
              </div>
            </div>
          )}

          {/* ── 產品 (products) — card grid with positioning preview ── */}
          {derivedCategory === "products" && scopeMode === "brand" && (
            <div style={{ padding: "8px 0 32px" }}>

              {/* ── AI Discovery progress banner (running) ── */}
              {discoveryRunning && (
                <div className="mx-2 mb-5 px-5 py-4 rounded-xl border-2 border-indigo-300 bg-gradient-to-r from-indigo-50 to-violet-50 flex items-start gap-4">
                  <span className="text-2xl mt-0.5">🔍</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-indigo-900 mb-1">
                      {lang === "en" ? "AI is scanning your website for products…" : "AI 正在掃描官網，自動分析產品清單…"}
                    </p>
                    <p className="text-[12px] text-indigo-700">
                      {discoveryStatus?.phase === "crawl" && (lang === "en" ? "Reading website content…" : "讀取官網內容中…")}
                      {discoveryStatus?.phase === "extract" && (lang === "en" ? "Identifying products…" : "識別產品項目中…")}
                      {discoveryStatus?.phase === "position" && discoveryStatus.currentProduct
                        ? (lang === "en" ? `Positioning: ${discoveryStatus.currentProduct}` : `正在定位「${discoveryStatus.currentProduct}」`)
                        : discoveryStatus?.phase === "position" ? (lang === "en" ? "Running product positioning…" : "執行產品定位中…") : ""}
                      {(discoveryStatus?.totalFound ?? 0) > 0 && (
                        <span className="ml-2 font-semibold text-indigo-800">
                          {discoveryStatus!.totalPositioned}/{discoveryStatus!.totalFound} {lang === "en" ? "products done" : "個完成"}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-indigo-500 mt-1">
                      {lang === "en" ? "This usually takes 30–120 seconds." : "通常需要 30–120 秒，請稍候。"}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Done but 0 products found ── */}
              {!discoveryRunning && discoveryStatus?.status === "done" && discoveryStatus.totalFound === 0 && (brandProductsList?.length ?? 0) === 0 && (
                <div className="mx-2 mb-5 px-5 py-4 rounded-xl border border-amber-200 bg-amber-50">
                  <p className="text-sm font-semibold text-amber-800 mb-1">
                    {lang === "en" ? "Scan complete — no products detected" : "掃描完成，未偵測到產品"}
                  </p>
                  <p className="text-[12px] text-amber-700 mb-3">
                    {lang === "en"
                      ? "The website may require login, or products aren't listed on public pages. You can add products manually, or retry the scan."
                      : "官網可能需要登入才能看到產品，或產品資訊未在公開頁面列出。你可以手動新增，或重新掃描。"}
                  </p>
                  <div className="flex gap-2">
                    {connData?.website && (
                      <button
                        onClick={() => {
                          if (!activeBrandIdForLocks || !connData?.website) return;
                          triggerDiscoveryMut?.mutate?.({ brandId: activeBrandIdForLocks, websiteUrl: connData.website });
                        }}
                        disabled={triggerDiscoveryMut?.isPending}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border-2 border-amber-400 text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition"
                      >
                        {lang === "en" ? "🔄 Retry scan" : "🔄 重新掃描"}
                      </button>
                    )}
                    <button
                      onClick={() => setAddModal({ open: true, tab: "product" })}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 transition"
                    >
                      {lang === "en" ? "+ Add product manually" : "+ 手動新增產品"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── No products + has website → big CTA scan banner ── */}
              {!discoveryRunning && (brandProductsList?.length ?? 0) === 0 && connData?.website && discoveryStatus?.status !== "done" && (
                <div className="mx-2 mb-5 rounded-xl border-2 border-dashed border-indigo-300 bg-gradient-to-br from-indigo-50 to-white px-6 py-8 text-center">
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="text-base font-bold text-neutral-900 mb-2">
                    {lang === "en" ? "Let AI scan your website for products" : "讓 AI 自動從官網找出你的產品"}
                  </p>
                  <p className="text-[13px] text-neutral-500 mb-5 max-w-xs mx-auto">
                    {lang === "en"
                      ? "AI will crawl your website, extract all products/services, and start positioning each one automatically."
                      : "AI 會爬取你的官網，自動列出所有產品與服務，並逐一開始定位。"}
                  </p>
                  <button
                    onClick={() => {
                      if (!activeBrandIdForLocks || !connData?.website) return;
                      triggerDiscoveryMut?.mutate?.({ brandId: activeBrandIdForLocks, websiteUrl: connData.website });
                    }}
                    disabled={triggerDiscoveryMut?.isPending}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #4F46E5, #7C3AED)" }}
                  >
                    {triggerDiscoveryMut?.isPending ? (lang === "en" ? "Starting…" : "啟動中…") : (lang === "en" ? "🔍 Scan website now" : "🔍 立即掃描官網")}
                  </button>
                  <p className="text-[11px] text-neutral-400 mt-3">
                    {lang === "en" ? "Or" : "或者"}{" "}
                    <button onClick={() => setAddModal({ open: true, tab: "product" })} className="underline hover:text-neutral-600">
                      {lang === "en" ? "add products manually" : "手動新增產品"}
                    </button>
                  </p>
                </div>
              )}

              {/* ── Has products + rescan button (compact, top-right) ── */}
              {!discoveryRunning && (brandProductsList?.length ?? 0) > 0 && connData?.website && (
                <div className="mx-2 mb-3 flex items-center justify-end">
                  <button
                    onClick={() => {
                      if (!activeBrandIdForLocks || !connData?.website) return;
                      triggerDiscoveryMut?.mutate?.({ brandId: activeBrandIdForLocks, websiteUrl: connData.website });
                    }}
                    disabled={triggerDiscoveryMut?.isPending}
                    className="text-[11px] font-medium px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 transition flex items-center gap-1.5"
                  >
                    {triggerDiscoveryMut?.isPending ? "…" : (lang === "en" ? "🔍 Re-scan" : "🔍 重新掃描")}
                  </button>
                </div>
              )}
              <BrandEntityGrid
                kind="product"
                items={brandProductsList}
                isLoading={brandProductsQ?.isLoading ?? false}
                lang={lang}
                onAdd={() => setAddModal({ open: true, tab: "product" })}
                onOpen={(id) => setProductDetailId(id)}
                onDelete={(id) => prodRemoveMut?.mutate?.({ id })}
                onPosition={(id) => {
                  prodStartMut?.mutate?.({ entityKind: "product", entityId: id });
                  prodInterimMut?.mutate?.({ entityKind: "product", entityId: id });
                }}
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
                  goToEntity("event", id);
                  setCategory("positioning");
                }}
                onDelete={(id) => evRemoveMut?.mutate?.({ id })}
                onPosition={(id) => {
                  evStartMut?.mutate?.({ entityKind: "event", entityId: id });
                  evInterimMut?.mutate?.({ entityKind: "event", entityId: id });
                }}
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
          onReposition={(id) => {
            setProductDetailId(null);
            prodStartMut?.mutate?.({ entityKind: "product", entityId: id });
            prodInterimMut?.mutate?.({ entityKind: "product", entityId: id });
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
          else if (kind === "product") goToEntity("product", id);
          else if (kind === "event") goToEntity("event", id);
        }}
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
  pipelineStatus, onPause, onResume, onSkip, onStop, onAction,
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
              : isRunning
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
              startContent={<LucidePlay size={14} strokeWidth={2} />}
              style={{ background: "#18181B", color: "white" }}
            >
              {lang === "en" ? "Continue" : "繼續"}
            </Button>
          )}
          {(!isRunning && !isPaused) && (
            <Button
              size="lg"
              isDisabled={locked}
              onPress={onAction}
              startContent={
                locked ? <LucideLock size={15} strokeWidth={2} /> :
                hasContent ? <LucideRotate size={15} strokeWidth={2} /> :
                <LucidePlay size={15} strokeWidth={2} />
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
 *
 * Mirrors the /theater BrainBar visual language: a strategist agent's
 * portrait inside a line-art frame + a speech bubble showing live
 * thinking text from the positioning pipeline.
 *
 * Always renders with the same agent (Claire Hsu — same chief strategist
 * as Theater). Future: swap per pipeline step's assigned agent.
 */
function PositioningBrainBar({ thinking }: {
  thinking: {
    segmentTarget: string;
    text: string;
    phase: string | null;
    startedAt: number | null;
    stepNum: number;
    stepTotal: number;
    stepTitle: string;
  };
}) {
  const { lang } = useLang();
  // Typewriter-feel: just render text plain (server already streams it).
  return (
    <div
      className="sticky top-0 z-30 w-full border-b border-neutral-200 backdrop-blur-md"
      style={{ background: "#7C3AED08" }}
    >
      <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-4">
        <div
          className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white flex items-center justify-center"
          style={{ border: "2px solid #111", boxShadow: "3px 3px 0 #7C3AED66" }}
        >
          <span style={{ fontSize: 22 }}>🧠</span>
        </div>
        <div
          className="relative flex-1 bg-white px-4 py-2.5 rounded-2xl"
          style={{ border: "2px solid #111", boxShadow: "3px 3px 0 #7C3AED33" }}
        >
          <div
            className="absolute left-[-8px] top-5 w-4 h-4 bg-white"
            style={{
              borderLeft: "2px solid #111",
              borderBottom: "2px solid #111",
              transform: "rotate(45deg)",
            }}
          />
          <div className="text-tiny text-neutral-700 mb-0.5 flex items-center gap-2">
            <span className="font-semibold text-neutral-800">
              {lang === "en" ? `Step ${thinking.stepNum} / ${thinking.stepTotal}` : `步驟 ${thinking.stepNum} / ${thinking.stepTotal}`}
            </span>
            <span>·</span>
            <span>{thinking.stepTitle}</span>
            {thinking.phase && (
              <>
                <span>·</span>
                <span className="text-neutral-900 font-semibold">{thinking.phase}</span>
              </>
            )}
          </div>
          <p className="text-small text-neutral-900 leading-snug">
            {thinking.text || (lang === "en" ? "Analyzing…" : "正在分析…")}
            <span
              className="inline-block w-[2px] h-[14px] ml-0.5 align-middle bg-neutral-900"
              style={{ animation: "blink 1s steps(2) infinite" }}
            />
          </p>
        </div>
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0 } }`}</style>
    </div>
  );
}

/* ─────────────────────────── PositioningGrid ───────────────────────── */
// 品牌定位的 card grid — 速查卡/指令庫 + segments 分組顯示
function PositioningGrid({
  scopeMode, segments, onSelect, segmentData,
}: {
  scopeMode: "brand" | "product" | "event" | "none";
  segments: import("../lib/positioningSchema").SegmentSpec[];
  onSelect: (section: string) => void;
  /** Map of segment id → its current content (top-level positioning keys). */
  segmentData?: Record<string, any>;
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
  // Derive groups from segment num prefix
  const groupedSegs = React.useMemo(() => {
    const map = new Map<string, { label: string; prefix: string; segs: typeof segments }>();
    for (const s of segments) {
      const prefix = s.num.split(".")[0]!;
      const pair = groupLabels[prefix];
      const label = pair
        ? (lang === "en" ? pair.en : pair.zh)
        : (lang === "en" ? `Chapter ${prefix}` : `第 ${prefix} 章`);
      // Stable key by zh label so intro lookup works regardless of UI language
      const key = pair ? pair.zh : `第 ${prefix} 章`;
      if (!map.has(key)) map.set(key, { label, prefix, segs: [] });
      map.get(key)!.segs.push(s);
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, lang]);

  // Icon map per segment id
  const ICONS: Record<string, any> = {
    goldenCircle: faBullseye, tagline: faPenNib, taglineScore: faChartPie,
    origin: faBookOpen, values: faShieldHalved,
    audience: faUsers, competition: faTableList,
    differentiation: faRocket, trends: faBullhorn, voice: faQuoteLeft,
    // product / event fallbacks
    core: faBullseye, positioning: faBullseye, smp: faWandSparkles,
  };
  // 2026-05-11 (CJ「最後品牌定位的呈現方式，也可以很 4A 廣告代理商嗎」):
  // dropped the pastel BG_CYCLE. Cards are pure white with a 1px neutral
  // border + serif eyebrow, matching the editorial discipline of the
  // brain panel above. Filled segments get a subtle darker accent on
  // the left edge instead of decorative tints.
  const BG_CYCLE = ["#FFFFFF"];

  return (
    <div style={{ padding: "8px 0 24px", display: "flex", flexDirection: "column", gap: 36 }}>
      {/* ── 工具群組 ── */}
      <div>
        <SectionLabel label={lang === "en" ? "Brand tools" : "品牌工具"} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {(() => {
            // 速查卡：把品牌定位精華（tagline / golden-circle why / differentiation）
            // 直接濃縮成一張預覽，使用者不必點進去也能掃到品牌精神。
            const cardPreview = buildBrandCheatPreview(segmentData);
            return (
              <AssetCard
                label={lang === "en" ? "Cheat sheet" : "速查卡"}
                icon={faTableList}
                bg="#FFFFFF"
                onClick={() => onSelect("card")}
                preview={cardPreview.node}
                hasContent={cardPreview.hasContent}
              />
            );
          })()}
          {(() => {
            // AI 指令庫：voice + 禁區 + tone 詞庫合成的一張預覽。
            const promptsPreview = buildPromptsPreview(segmentData, lang);
            return (
              <AssetCard
                label={lang === "en" ? "AI prompts" : "AI 指令庫"}
                icon={faRobot}
                bg="#FFFFFF"
                onClick={() => onSelect("prompts")}
                preview={promptsPreview.node}
                hasContent={promptsPreview.hasContent}
              />
            );
          })()}
        </div>
      </div>

      {/* ── Segment groups ── */}
      {groupedSegs.map((group, gi) => (
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {group.segs.map((s, si) => {
              const segVal = segmentData?.[s.id];
              const { node: preview, hasContent } = renderSegmentPreview(s.id, segVal, lang);
              return (
                <AssetCard
                  key={s.id}
                  label={`${s.num} ${lang === "en" ? (s.titleEn ?? s.title) : s.title}`}
                  icon={ICONS[s.id] ?? faBookOpen}
                  bg={BG_CYCLE[(gi * 4 + si) % BG_CYCLE.length]!}
                  onClick={() => onSelect(`seg:${s.id}`)}
                  preview={preview}
                  hasContent={hasContent}
                  rationale={lang === "en" ? (s.rationaleEn ?? s.rationale) : s.rationale}
                />
              );
            })}
          </div>
        </div>
      ))}

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

/** Render mini list of tokens (used for arrays). */
function TagRow({ items, max = 4 }: { items: string[]; max?: number }) {
  return (
    <span>
      {items.slice(0, max).map((x, i) => (
        <span key={i} style={{
          display: "inline-block", marginRight: 6, marginBottom: 3,
          fontSize: 10.5, color: "#404040",
          fontFamily: '"SF Mono", Menlo, monospace',
        }}>
          {x}
        </span>
      ))}
      {items.length > max && (
        <span style={{ fontSize: 10, color: "#525252" }}>+{items.length - max}</span>
      )}
    </span>
  );
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
              <span style={{ display: "block", marginTop: 4, fontSize: 11 }}>
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
                <span style={{ fontSize: 11, color: "#525252", marginLeft: 4 }}>/ 100</span>
              </span>
            )}
            {rows.slice(0, 3).map((r: any, i: number) => (
              <span key={i} style={{ display: "block", fontSize: 11 }}>
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
                  <span style={{ color: "#404040", marginLeft: 4, fontSize: 11 }}>
                    {truncate(it.body, 40)}
                  </span>
                )}
              </span>
            ))}
            {items.length > 4 && <span style={{ fontSize: 10, color: "#525252" }}>+{items.length - 4}</span>}
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
              <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#404040", fontFamily: "system-ui" }}>
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
              <span key={`f${i}`} style={{ display: "block", fontSize: 11 }}>
                <span style={{ color: "#059669", fontWeight: 600, fontFamily: "system-ui" }}>↗</span>
                <span style={{ marginLeft: 4 }}>{truncate(t.name, 50)}</span>
              </span>
            ))}
            {risks.slice(0, 2).map((t: any, i: number) => (
              <span key={`r${i}`} style={{ display: "block", fontSize: 11 }}>
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
                <span style={{ fontSize: 10, color: "#525252", letterSpacing: "0.15em", textTransform: "uppercase", marginRight: 6 }}>{lang === "en" ? "Archetype" : "原型"}</span>
                <TagRow items={arche} max={3} />
              </span>
            )}
            {tone && (
              <span style={{ display: "block" }}>
                <span style={{ fontSize: 10, color: "#525252", letterSpacing: "0.15em", textTransform: "uppercase", marginRight: 6 }}>{lang === "en" ? "Tone" : "語調"}</span>
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
              <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#404040" }}>
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
    }
  }
  return { node: null, hasContent: false };
}

/** 速查卡 preview — composes tagline + WHY + differentiation summary. */
function buildBrandCheatPreview(seg?: Record<string, any>): { node: React.ReactNode | null; hasContent: boolean } {
  if (!seg) return { node: null, hasContent: false };
  const tagline = firstTruthy(seg.tagline?.zhTagline);
  const why = firstTruthy(seg.goldenCircle?.why);
  const diff = firstTruthy(seg.differentiation?.summary, seg.differentiation?.emotional);
  if (!tagline && !why && !diff) return { node: null, hasContent: false };
  return {
    node: (
      <span>
        {tagline && (
          <span style={{ display: "block", color: "#171717", fontWeight: 600, fontFamily: "system-ui", fontSize: 13, marginBottom: 4 }}>
            「{truncate(tagline, 40)}」
          </span>
        )}
        {why && (
          <span style={{ display: "block", fontSize: 11, marginBottom: 2 }}>
            <span style={{ color: "#525252", fontFamily: "system-ui", marginRight: 4 }}>WHY</span>
            {truncate(why, 70)}
          </span>
        )}
        {diff && (
          <span style={{ display: "block", fontSize: 11 }}>
            <span style={{ color: "#525252", fontFamily: "system-ui", marginRight: 4 }}>EDGE</span>
            {truncate(diff, 70)}
          </span>
        )}
      </span>
    ),
    hasContent: true,
  };
}

/** AI 指令庫 preview — composes voice archetype + tone + forbidden words. */
function buildPromptsPreview(seg?: Record<string, any>, lang: "zh-TW" | "en" = "zh-TW"): { node: React.ReactNode | null; hasContent: boolean } {
  if (!seg) return { node: null, hasContent: false };
  const arche = isFilledArr(seg.voice?.archetypes) ? seg.voice.archetypes : null;
  const tone = isFilledArr(seg.voice?.tone) ? seg.voice.tone : null;
  const forbid = isFilledArr(seg.voice?.forbidden) ? seg.voice.forbidden : null;
  if (!arche && !tone && !forbid) return { node: null, hasContent: false };
  return {
    node: (
      <span>
        {arche && (
          <span style={{ display: "block", marginBottom: 4, fontSize: 11 }}>
            <span style={{ color: "#525252", fontFamily: "system-ui", marginRight: 4 }}>{lang === "en" ? "Archetype" : "原型"}</span>
            {arche.slice(0, 2).join(" / ")}
          </span>
        )}
        {tone && (
          <span style={{ display: "block", marginBottom: 4 }}>
            <TagRow items={tone} max={5} />
          </span>
        )}
        {forbid && (
          <span style={{ display: "block", fontSize: 10, color: "#B45309", fontFamily: "system-ui" }}>
            {lang === "en" ? "Avoid · " : "禁區 · "}{forbid.slice(0, 3).join(lang === "en" ? ", " : "、")}{forbid.length > 3 ? `+${forbid.length - 3}` : ""}
          </span>
        )}
      </span>
    ),
    hasContent: true,
  };
}

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
        <p style={{
          fontSize: 10, fontWeight: 600, color: "#404040",
          letterSpacing: "0.25em", textTransform: "uppercase",
          marginBottom: 6,
        }}>
          Positioning Locked · Ready for Production
        </p>
        <h3 style={{
          fontSize: 18, fontWeight: 700, color: "#171717",
          letterSpacing: "-0.01em", marginBottom: 4,
        }}>
          {lang === "en"
            ? `Your ${scopeLabel} is ready — the AI knows what every post should say`
            : `你的${scopeLabel}已備好，AI 知道每篇文章該說什麼了`}
        </h3>
        <p style={{
          fontSize: 13, lineHeight: 1.65, color: "#525252",
          fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
          maxWidth: 620,
        }}>
          {lang === "en"
            ? "This positioning becomes the backbone for 30s Singles, 60s Packs, 99s Slates, and 7-Day Publisher — every post is built from it, so the AI never sounds off-brand again."
            : "這份定位現在會自動成為 30s 單品、60s 套組、99s 檔期、七日發布台 的內容骨架 — 每篇貼文都依此產出，再也不會「AI 寫出來不像你的品牌」。"}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {/* 2026-05-12 pre-launch zombie audit: routes were /b/X/30s which
            don't exist (404). Real routes are /30s?b=X */}
        <BridgeBtn label={lang === "en" ? "30s Single"    : "30s 單品"}    onClick={() => navigate(`/30s?b=${brandId}`)} primary />
        <BridgeBtn label={lang === "en" ? "60s Pack"  : "60s 套組"}  onClick={() => navigate(`/60s?b=${brandId}`)} />
        <BridgeBtn label={lang === "en" ? "99s Slate" : "99s 檔期"}  onClick={() => navigate(`/99s?b=${brandId}`)} />
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
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: intro ? 6 : 0 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, color: "#525252",
          letterSpacing: "0.22em", textTransform: "uppercase",
        }}>
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: "#D4D4D4" }} />
        {counter && (
          <span style={{
            fontSize: 10, fontWeight: 500, color: "#525252",
            letterSpacing: "0.15em", fontVariantNumeric: "tabular-nums",
          }}>
            {counter}
          </span>
        )}
      </div>
      {intro && (
        <p style={{
          fontSize: 12.5, lineHeight: 1.7, color: "#404040",
          fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
          fontStyle: "italic", maxWidth: 700, margin: 0,
        }}>
          {intro}
        </p>
      )}
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
    zh: "把功能 × 情感雙差異化結合成一句話 — 這是 30s / 60s / 99s 內容的母題。",
    en: "Fuse functional × emotional differentiation into one line — this becomes the parent theme for every 30s / 60s / 99s piece.",
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

/* ─────────────────────────── AssetCard ───────────────────────────
   2026-05-11 (CJ「最後品牌定位的呈現方式，也可以很 4A 廣告代理商」)
   Redesigned for editorial discipline:
   - Pure white, 1px neutral border, no shadow at rest
   - 14×14 thin icon top-left, no decorative pill background
   - Eyebrow line "01.1 GOLDEN CIRCLE" in 9px uppercase tracking
   - Title in 13.5px sans, preview in serif body
   - Filled state: black 1px left edge bar — like a margin annotation
   - Hover: border → black, no scale/shadow circus
   ───────────────────────────────────────────────────────────────── */
function AssetCard({ label, icon, bg, onClick, preview, hasContent, rationale }: {
  label: string; icon: any; bg: string; onClick: () => void;
  preview?: React.ReactNode;
  hasContent?: boolean;
  /** Optional methodology rationale shown below the title — explains
   *  WHY this step matters in the SoWork brand positioning method. */
  rationale?: string;
}) {
  const { lang } = useLang();
  // Split "1.1 Golden Circle" → eyebrow "01.1" + title "Golden Circle"
  const m = label.match(/^(\S+)\s+(.+)$/);
  const eyebrow = m ? m[1] : "";
  const titleText = m ? m[2] : label;

  return (
    <button
      onClick={onClick}
      title={rationale}
      className="group relative text-left transition-colors"
      style={{
        display: "flex", flexDirection: "column", gap: 10,
        padding: "16px 16px 14px",
        background: bg,
        border: "1px solid #D4D4D4",
        borderRadius: 8,
        cursor: "pointer", width: "100%",
        minHeight: preview ? 140 : 124,
        position: "relative",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#171717"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#D4D4D4"; }}
    >
      {/* Filled accent — 1px black left edge bar */}
      {hasContent && (
        <span
          aria-hidden
          style={{
            position: "absolute", left: 0, top: 12, bottom: 12, width: 2,
            background: "#171717", borderRadius: 2,
          }}
        />
      )}

      {/* Top row: icon + eyebrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <FontAwesomeIcon
          icon={icon}
          style={{ fontSize: 12, color: hasContent ? "#171717" : "#525252", flexShrink: 0 }}
        />
        {eyebrow && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#525252",
            letterSpacing: "0.2em", textTransform: "uppercase",
            fontVariantNumeric: "tabular-nums",
          }}>
            {eyebrow}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {hasContent && (
          <span style={{
            fontSize: 9, fontWeight: 600, color: "#171717",
            letterSpacing: "0.18em", textTransform: "uppercase",
          }}>
            {lang === "en" ? "Filled" : "已填寫"}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 style={{
        fontSize: 14, fontWeight: 600, color: "#171717",
        lineHeight: 1.35, margin: 0,
      }}>
        {titleText}
      </h3>

      {/* Rationale — methodology "why this step" line. Shown ONLY when
          the segment has no content yet, so it teaches the user about the
          method while the box is empty. Once filled, real content takes
          over and the rationale is conserved for hover (title attr above). */}
      {rationale && !hasContent && (
        <p style={{
          fontSize: 11.5, lineHeight: 1.55, color: "#404040",
          fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
          fontStyle: "italic", margin: 0,
        }}>
          {rationale}
        </p>
      )}

      {/* Body: serif preview when filled, hint otherwise. Use maxHeight
          rather than -webkit-line-clamp so multi-block previews
          (lists / tag rows) render fully without being clipped at line 4. */}
      {preview ? (
        <div style={{
          flex: 1,
          fontSize: 12, lineHeight: 1.55, color: "#525252",
          fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
          overflow: "hidden",
          maxHeight: 110,
          textAlign: "left",
        }}>
          {preview}
        </div>
      ) : (
        <span style={{
          fontSize: 11, color: "#525252", marginTop: "auto",
          letterSpacing: "0.05em",
        }}>
          {lang === "en" ? "Empty — tap to start" : "尚未填寫 — 點擊開始"}
        </span>
      )}
    </button>
  );
}

/** Derive a preview ReactNode from an asset value. Returns null if no
 *  meaningful content yet (caller falls back to compact card). */
function previewForAsset(assetKey: string, value: any, lang: "zh-TW" | "en" = "zh-TW"): React.ReactNode | null {
  if (!value || typeof value !== "object") return null;
  const v = value;
  // text-like: GenericTextarea uses { text } or { links }
  const textBlob = (v.text ?? v.links ?? "").toString().trim();

  // ListEditor: { items: string[] }
  if (Array.isArray(v.items) && v.items.length > 0) {
    const cleaned = v.items.map((x: any) => String(x).trim()).filter(Boolean);
    if (cleaned.length === 0) return null;
    return (
      <span>
        {cleaned.slice(0, 4).map((x: string, i: number) => (
          <span key={i} style={{
            display: "inline-block", margin: "1px 3px 1px 0",
            padding: "1px 6px", borderRadius: 999,
            background: "rgba(255,255,255,0.7)", color: "#374151",
            fontSize: 10, fontWeight: 500,
          }}>{x.length > 14 ? x.slice(0, 14) + "…" : x}</span>
        ))}
        {cleaned.length > 4 && <span style={{ color: "#9CA3AF", fontSize: 10 }}>+{cleaned.length - 4}</span>}
      </span>
    );
  }
  // PairListEditor: { pairs: [{from, to}] }
  if (Array.isArray(v.pairs) && v.pairs.length > 0) {
    const ps = v.pairs.filter((p: any) => p?.from && p?.to);
    if (ps.length === 0) return null;
    return (
      <span>
        {ps.slice(0, 3).map((p: any, i: number) => (
          <span key={i} style={{ display: "block", marginBottom: 2 }}>
            <span style={{ color: "#9CA3AF" }}>{p.from}</span>
            <span style={{ color: "#9CA3AF", margin: "0 4px" }}>→</span>
            <span style={{ color: "#374151", fontWeight: 500 }}>{p.to}</span>
          </span>
        ))}
        {ps.length > 3 && <span style={{ color: "#9CA3AF", fontSize: 10 }}>+{ps.length - 3}{lang === "en" ? "" : " 條"}</span>}
      </span>
    );
  }
  // ColorFields: { list: [{name, hex}] }
  if (assetKey === "colors" && Array.isArray(v.list) && v.list.length > 0) {
    const colors = v.list.filter((c: any) => c?.hex);
    if (colors.length === 0) return null;
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {colors.slice(0, 6).map((c: any, i: number) => (
          <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10, color: "#374151",
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: 4,
              background: c.hex,
              border: "1px solid rgba(0,0,0,0.08)",
            }} />
            {c.name ?? c.hex}
          </span>
        ))}
      </span>
    );
  }
  // LogoFields: { primaryUrl, ... }
  if (assetKey === "logo" && (v.primaryUrl || v.iconUrl || v.darkUrl)) {
    return (
      <span style={{ fontSize: 10 }}>
        {v.primaryUrl && <span style={{ display: "block", color: "#374151" }}>{lang === "en" ? "Primary logo: " : "主 logo: "}{String(v.primaryUrl).slice(0, 40)}…</span>}
        {v.guidelines && <span style={{ display: "block", color: "#6B7280", marginTop: 2 }}>{String(v.guidelines).slice(0, 60)}</span>}
      </span>
    );
  }
  // FontFields: { primary, secondary, ... }
  if (assetKey === "fonts") {
    const lines: string[] = [];
    if (v.primary) lines.push(lang === "en" ? `Primary: ${v.primary}` : `主：${v.primary}`);
    if (v.secondary) lines.push(lang === "en" ? `Secondary: ${v.secondary}` : `副：${v.secondary}`);
    if (lines.length === 0) return null;
    return <span>{lines.join(" · ")}</span>;
  }
  // PhotoFields: { urls: [...] } or { list: [...] }
  if (assetKey === "photos") {
    const urls: string[] = Array.isArray(v.urls) ? v.urls : Array.isArray(v.list) ? v.list : [];
    if (urls.length === 0) return null;
    return <span>{lang === "en" ? `${urls.length} photos` : `${urls.length} 張照片`}</span>;
  }
  // Generic textarea
  if (textBlob) {
    return <span>{textBlob.length > 140 ? textBlob.slice(0, 140) + "…" : textBlob}</span>;
  }
  return null;
}

/* ─────────────────────────── VisualNavItem ─────────────────────────── */
// Sidebar item for visual assets — shows hover-reveal + button, purple badge for 最新.
function VisualNavItem({ id, label, badge, active, onClick }: {
  id: string; label: string; badge?: string; active: boolean; onClick: () => void;
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
        background: active ? "rgba(163,112,252,0.15)" : hovered ? "#F5F4F2" : "none",
        border: "none", cursor: "pointer",
        fontSize: 12, fontWeight: active ? 600 : 400,
        color: active ? "rgb(74,46,126)" : "rgb(15,16,21)",
        textAlign: "left", transition: "background 0.12s",
        gap: 6,
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 20,
          background: "rgba(163,112,252,0.20)", color: "rgb(74,46,126)",
          flexShrink: 0,
        }}>{badge}</span>
      )}
      {hovered && (
        <span style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: "rgba(163,112,252,0.20)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "rgb(74,46,126)", fontWeight: 700,
        }}>+</span>
      )}
    </button>
  );
}

/* ─────────────────────────── PositioningPanel ───────────────────────── */
// Renders the 完整定位書 / 速查卡 / AI 指令庫 sub-views for the active scope.
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
  pipelineThinking, onAutoFill, locked,
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
          <span>🔒</span>
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
        />
      </div>
    </div>
  );
}

function PositioningEditor({
  section, scopeMode, scopeName, brandId, productId, eventId, pipelineThinking, onAutoFill,
}: {
  section: string;
  scopeMode: "brand" | "product" | "event";
  scopeName: string;
  brandId: number | null;
  productId: number | null;
  eventId: number | null;
  pipelineThinking: PipelineThinking | null;
  onAutoFill?: (segmentId: string) => void;
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

  if (section === "card") {
    return (
      <SpeedCardView scopeMode={scopeMode} data={draft} scopeName={scopeName} />
    );
  }
  if (section === "prompts") {
    return (
      <PromptLibraryView scopeMode={scopeMode} data={draft} scopeName={scopeName} />
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
        value={draft[activeSegment.id] ?? null}
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
    setDraft(next);
    if (!saveMutation) return;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const nextAssets = { ...(positioning._assets ?? {}), [assetKey]: next };
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
              ? "Fill this section in yourself — changes auto-save 800ms after you stop typing."
              : "這個區塊由你手動填寫；改動會在 800ms 後自動儲存到 brand.positioning._assets"}
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

function PromptLibraryView({ scopeMode, data, scopeName }: { scopeMode: string; data: any; scopeName: string }) {
  return (
    <PromptLibrary
      scopeMode={scopeMode as "brand" | "product" | "event"}
      scopeName={scopeName}
      data={data}
    />
  );
}

/* ─────────────────────────── BrandAssetTile ─────────────────────────── */

function BrandAssetTile({ tile, onClick }: { tile: Tile; onClick: () => void }) {
  const { lang } = useLang();
  return (
    <Card
      isPressable
      isHoverable
      onPress={onClick}
      shadow="sm"
      radius="lg"
      className={`overflow-hidden bg-${tile.tone}-100`}
    >
      <CardBody className="aspect-[4/3] items-center justify-center relative p-0">
        <FontAwesomeIcon
          icon={tile.icon}
          className={`text-7xl text-${tile.tone}-600/70`}
        />
        {tile.count != null && tile.count > 0 && (
          <Chip size="sm" variant="flat" className="absolute top-3 right-3 bg-content1/80 backdrop-blur-md">
            {tile.count}
          </Chip>
        )}
        {!tile.ready && (
          <Chip size="sm" variant="flat" className="absolute top-3 right-3 bg-content1/80 backdrop-blur-md text-default-700">
            {lang === "en" ? "Coming soon" : "即將推出"}
          </Chip>
        )}
      </CardBody>
      <div className="px-4 py-3 bg-content1">
        <p className="text-small font-medium text-foreground">{tile.label}</p>
      </div>
    </Card>
  );
}

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

  return (
    <div className="max-w-[640px] mx-auto space-y-4">
      <div>
        <h3 className="text-medium font-semibold">{lang === "en" ? "Brand logo / avatar" : "品牌 logo / 頭像"}</h3>
        <p className="text-tiny text-default-700 mt-1">
          {lang === "en"
            ? `The "${brandName ?? "brand"}" avatar used in mockups. Auto-fetch from the FB page, or upload manually later.`
            : `mockup 顯示用的「${brandName ?? "品牌"}」頭像。可以從 FB 粉專自動抓，或之後手動上傳。`}
        </p>
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
          {okMsg && <span className="text-tiny text-success-600">✓ {okMsg}</span>}
          {err && <span className="text-tiny text-danger-600">{err}</span>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── PositioningTopRow ───────────────────────
   Compact action row for the 定位 tab — replaces wide TabActionBar.
   Shows: ✨ 自動定位 button + live job progress + 🔓 lock chip.
   The 自動定位 button fires positioningJobs.start (new background
   runner with retry × 5 + parallel waves + cost tracking).
   ───────────────────────────────────────────────────────────────────── */
function PositioningTopRow({
  brandId, scopeMode, locked, onLockToggle,
}: {
  brandId: number | null;
  scopeMode: "brand"|"product"|"event"|"none";
  locked: boolean;
  onLockToggle: () => void;
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
      {/* Auto-定位 + status row */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <button
          onClick={handleAuto}
          disabled={!brandId || !entityKind || locked || isRunning || startMut?.isPending}
          className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition ${
            isRunning ? "bg-neutral-100 text-neutral-700 cursor-wait border border-neutral-200"
            : locked ? "bg-neutral-100 text-neutral-600 cursor-not-allowed"
            : "bg-neutral-900 text-white hover:bg-neutral-800 cursor-pointer"
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
          <Sparkles size={14} className={isRunning ? "animate-pulse" : ""} />
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
              className="text-[11px] text-default-500 hover:text-default-800 underline"
              title={lang === "en" ? "Force-refresh status" : "強制重新查詢狀態"}
            >
              {lang === "en" ? "refresh" : "重新查詢"}
            </button>
          </div>
        )}
        {isFailed && jobData?.lastError && (
          <span className="text-xs text-amber-700 max-w-md truncate" title={jobData.lastError}>⚠ {String(jobData.lastError).slice(0, 80)}</span>
        )}
        {isDone && <span className="text-xs text-emerald-700">{lang === "en" ? `✓ Done · ${total} sections` : `✓ 已完成 ${total} 個段落`}</span>}
        {startError && (
          <span className="text-xs text-danger truncate max-w-md" title={startError}>⚠ {startError}</span>
        )}
      </div>

      {/* CJ 2026-05-08: removed duplicate wide lock bar from inside
          PositioningTopRow — the legacy lock bar above the body
          (BrandsPage.tsx:856) already covers all 3 tabs. The
          onLockToggle prop is kept for API compatibility but unused. */}
    </>
  );
}

/* ─────────────────────────── KickerRow ───────────────────────────────
   Tiny grey row sitting under the tiles, matches /30s "tier signature".
   BRAND WORKSPACE pill + brand name + 試寫 chip + 定案 chip.
   ───────────────────────────────────────────────────────────────────── */
function KickerRow({
  brandId, scopeName, testOpen, onToggleTest, scopeMode, scopeEntityId,
}: {
  brandId: number | null;
  scopeName: string;
  testOpen: boolean;
  onToggleTest: () => void;
  /** BUG-3 fix: pass the current scope so status reflects the right entity. */
  scopeMode: "brand" | "product" | "event" | "none";
  scopeEntityId: number | null;
}) {
  // When scopeMode is "none" (no brand selected) fall back to brand kind so
  // the hook stays valid; the enabled guard (entityId=null) will skip the query.
  const resolvedKind = (scopeMode === "none" ? "brand" : scopeMode) as "brand" | "product" | "event";
  const resolvedId   = scopeMode === "brand" ? brandId : scopeEntityId;
  const { status, isRunning } = usePositioningStatus(resolvedKind, resolvedId);
  return (
    <div className="mt-4 flex items-center gap-2 text-tiny text-default-600 flex-wrap justify-center">
      <span
        className="px-2 py-0.5 rounded-full text-white font-semibold tracking-widest"
        style={{ background: "#7C3AED", fontSize: 9, letterSpacing: "0.15em" }}
      >
        BRAND WORKSPACE
      </span>
      <span>·</span>
      <span className="text-default-600">{scopeName}</span>
      <span className="text-default-500 mx-1">|</span>
      <BrandActionChipsRow
        brandId={brandId}
        expanded={testOpen}
        onToggle={onToggleTest}
        status={status}
        isRunning={isRunning}
      />
    </div>
  );
}

/* ─────────────────────────── CopyTabInline ───────────────────────────
   Inline-editable card grid for the 文字 tab. Each card contains the
   actual editor (no click-to-navigate). Debounced auto-save (800ms)
   patches positioning._assets[<key>] via scope.savePositioning. AI 協助填
   per-card lives inside InlineAssetCard and writes through onChange.
   Compact lock chip sits top-right (replaces the old wide TabActionBar).
   ───────────────────────────────────────────────────────────────────── */
type CopyShape = "text" | "items" | "pairs";
type CopyTileItem = { key: string; labelZh: string; labelEn: string; Icon: any; bg: string; shape: CopyShape };
type CopyTileGroup = { labelZh: string; labelEn: string; items: CopyTileItem[] };
const COPY_TILE_GROUPS: CopyTileGroup[] = [
  {
    labelZh: "口吻風格", labelEn: "Voice & style",
    items: [
      { key: "voice",            labelZh: "品牌口吻", labelEn: "Brand voice",       Icon: LucideQuote,       bg: "#FFF0F6", shape: "text" },
      { key: "voice_principles", labelZh: "品牌準則", labelEn: "Voice principles",  Icon: LucideShield,      bg: "#F0FDF4", shape: "items" },
    ],
  },
  {
    labelZh: "用詞規範", labelEn: "Word rules",
    items: [
      { key: "preferred_terms",     labelZh: "推薦用詞", labelEn: "Preferred terms",   Icon: LucideTypeIcon, bg: "#ECFDF5", shape: "items" },
      { key: "banned_words",        labelZh: "禁用詞",   labelEn: "Banned words",      Icon: LucideShield,   bg: "#FEE2E2", shape: "items" },
      { key: "term_substitutions",  labelZh: "替換對照", labelEn: "Substitutions",     Icon: LucidePencil,   bg: "#FFFBEB", shape: "pairs" },
    ],
  },
  {
    labelZh: "專用詞彙", labelEn: "Brand vocabulary",
    items: [
      { key: "branded_terms",   labelZh: "品牌術語",     labelEn: "Brand terms",       Icon: LucideAward,    bg: "#F5F3FF", shape: "items" },
      { key: "product_naming",  labelZh: "產品名稱規範", labelEn: "Product naming",    Icon: LucidePackage,  bg: "#EFF6FF", shape: "text" },
      { key: "abbreviations",   labelZh: "縮寫對照",     labelEn: "Abbreviations",     Icon: LucideHash,     bg: "#FFF7ED", shape: "pairs" },
    ],
  },
  {
    labelZh: "常用文案", labelEn: "Copy library",
    items: [
      { key: "cta_library",     labelZh: "CTA 庫",     labelEn: "CTA library",        Icon: LucideMessage,    bg: "#F0F9FF", shape: "items" },
      { key: "hook_library",    labelZh: "Hook 庫",    labelEn: "Hook library",       Icon: LucideQuote,      bg: "#FFF0F6", shape: "items" },
      { key: "templates_copy",  labelZh: "文案範本",   labelEn: "Copy templates",     Icon: LucideFileText,   bg: "#FFFBEB", shape: "items" },
    ],
  },
];

function CopyTabInline({
  brandId, brandAssets, fullPositioning, locked, onLockToggle,
}: {
  brandId: number | null;
  brandAssets: Record<string, any>;
  fullPositioning: Record<string, any>;
  locked: boolean;
  onLockToggle: () => void;
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
  const allCopyKeys = COPY_TILE_GROUPS.flatMap((g) => g.items.map((it) => it.key));
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
          ? "⚠️ No website / FB found — results may be off. Add a website / social links in Settings, then retry."
          : "⚠️ 找不到官網 / FB — 結果可能不準。請到「設定」補上 website / socialLinks 後重試。");
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
      {/* Top action row: bulk auto-fill + save indicator + lock chip */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBulkAutoFill}
            disabled={!brandId || locked || bulkBusy || emptyKeys.length === 0}
            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition ${
              bulkBusy ? "bg-neutral-100 text-neutral-700 cursor-wait border border-neutral-200"
              : locked || emptyKeys.length === 0 ? "bg-default-100 text-default-600 cursor-not-allowed"
              : "bg-neutral-900 text-white hover:bg-neutral-800 cursor-pointer"
            }`}
            title={
              locked
                ? (lang === "en" ? "Locked" : "已鎖定")
                : emptyKeys.length === 0
                  ? (lang === "en" ? "All fields filled" : "所有欄位都已填寫")
                  : (lang === "en"
                      ? `Auto-fill the remaining ${emptyKeys.length} fields from website / FB`
                      : `根據官網 / FB 自動填寫剩下 ${emptyKeys.length} 個空欄`)
            }
          >
            <Sparkles size={14} className={bulkBusy ? "animate-pulse" : ""} />
            {bulkBusy
              ? (lang === "en"
                  ? `Auto-filling (${bulkFillingKeys.size} fields)…`
                  : `自動填寫中 (${bulkFillingKeys.size} 個欄位)…`)
              : emptyKeys.length === 0
                ? (lang === "en" ? "All filled" : "全部已填寫")
                : (lang === "en"
                    ? `Auto-fill ${emptyKeys.length} fields`
                    : `自動填寫 ${emptyKeys.length} 個空欄`)}
          </button>
          {savingKey ? (
            <span className="flex items-center gap-1 text-xs text-default-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> {lang === "en" ? "Auto-saving…" : "自動儲存中…"}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-default-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {lang === "en" ? "Auto-save on" : "自動儲存"}
            </span>
          )}
        </div>
        <button
          onClick={onLockToggle}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition ${
            locked ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                   : "bg-default-100 text-default-600 hover:bg-default-200"
          }`}
          title={locked
            ? (lang === "en" ? "Click to unlock copy" : "點擊解鎖文字")
            : (lang === "en" ? "Click to lock copy (becomes the single source of truth)" : "點擊鎖定文字（全平台用這份做為單一真相）")}
        >
          <FontAwesomeIcon icon={locked ? faLock : faLockOpen} className="text-[11px]" />
          {locked
            ? (lang === "en" ? "Locked · click to unlock" : "已鎖定 · 點此解鎖")
            : (lang === "en" ? "Lock copy" : "鎖定文字")}
        </button>
      </div>

      {(bulkErr || bulkResult) && (
        <div className={`text-xs px-3 py-2 rounded-lg whitespace-pre-line ${
          bulkErr && !bulkResult ? "bg-amber-50 text-amber-800" :
          bulkErr ? "bg-amber-50 text-amber-800" :
          "bg-emerald-50 text-emerald-800"
        }`}>
          {bulkResult && <div>{lang === "en"
            ? `✓ Filled ${bulkResult.filled} fields${bulkResult.sources.length > 0 ? ` (sources: ${bulkResult.sources.join(" + ")})` : ""}`
            : `✓ 已填入 ${bulkResult.filled} 個欄位${bulkResult.sources.length > 0 ? `（來源：${bulkResult.sources.join(" + ")}）` : ""}`}</div>}
          {bulkErr && <div>{bulkErr}</div>}
        </div>
      )}

      {COPY_TILE_GROUPS.map((group, gi) => (
        <div key={gi}>
          {/* 2026-05-11 (CJ「文字和知識的設計風格，也改得跟定位一樣」):
              editorial section divider, same syntax as PositioningGrid. */}
          <SectionLabel
            label={lang === "en" ? group.labelEn : group.labelZh}
            counter={`${group.items.filter((it: any) => !isEmpty(it.key)).length} / ${group.items.length}`}
          />

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 14,
          }}>
            {group.items.map((item) => (
              <InlineAssetCard
                key={item.key}
                assetKey={item.key}
                label={lang === "en" ? item.labelEn : item.labelZh}
                Icon={item.Icon}
                bg={item.bg}
                shape={item.shape}
                value={drafts[item.key]}
                onChange={(next) => updateAsset(item.key, next)}
                brandId={brandId}
                readOnly={locked}
                filling={bulkFillingKeys.has(item.key)}
              />
            ))}
          </div>
        </div>
      ))}
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
    const w = website.trim();
    const summary = [usp.trim(), w ? `官方網址：${w}` : ""].filter(Boolean).join("\n");
    await upsertM.mutateAsync({
      id: productId,
      brandId: p?.brandId ?? undefined,
      slug: p?.slug ?? String(productId),
      name: name.trim() || (p?.name ?? "未命名產品"),
      positioning: (usp.trim() || w || sku.trim())
        ? { summary: summary || undefined, website: w || undefined, sku: sku.trim() || undefined }
        : undefined,
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
          <span className="text-tiny text-success-600">{en ? "Saved ✓" : "已儲存 ✓"}</span>
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
        background: "linear-gradient(180deg, #FAFAFA 0%, #FFFFFF 100%)",
        padding: 20,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <div>
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.18em",
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
                fontSize: 10, fontWeight: 600, padding: "3px 8px",
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
                ? (en ? "✨ Extract from products" : "✨ 從產品圖萃取")
                : userLocked
                  ? (en ? "Re-extract (overwrites lock)" : "重新萃取（覆寫鎖定）")
                  : (en ? "Re-extract" : "重新萃取")}
          </button>
        </div>
      </div>

      {/* States */}
      {extractMut?.error && (
        <p style={{ fontSize: 12, color: "#DC2626", marginBottom: 10 }}>
          {String((extractMut.error as any)?.message ?? extractMut.error).slice(0, 200)}
        </p>
      )}
      {extractMut?.data?.ok === false && extractMut.data.reason === "no_product_images" && (
        <p style={{ fontSize: 12, color: "#92400E", marginBottom: 10 }}>
          {en
            ? "No product images available yet. Add a website URL or import products first, then come back."
            : "目前還沒有產品圖。請先填入官網或匯入產品，再回來這裡。"}
        </p>
      )}

      {/* Empty hint */}
      {swatches.length === 0 && !isLoading && (
        <p style={{ fontSize: 13, color: "#737373", margin: 0, lineHeight: 1.6 }}>
          {en
            ? "Run the extractor — Mia reads your product photos, runs K-means in LAB color space, and surfaces the 5–7 colors that actually define this brand. Future content generation will use these as canonical brand colors."
            : "按「從產品圖萃取」— Mia 會讀你的產品照、在 LAB 色彩空間跑 K-means，挑出真正代表這個品牌的 5-7 個核心色。之後生成的所有內容都會用這份色票。"}
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
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", opacity: 0.85,
                }}>
                  {s.role}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>
                    {s.hex.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
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
function BrandEntityGrid({
  kind, items, isLoading, lang, onAdd, onOpen, onDelete, onPosition,
}: {
  kind: "product" | "event";
  items: any[];
  isLoading: boolean;
  lang: "zh-TW" | "en";
  onAdd: () => void;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  onPosition: (id: number) => void;
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
        tagline:  extractField(p, "tagline", "tagline.zhTagline", "differentiation.summary")
                    || interim.tagline || "",
        usp:      extractField(p, "usp", "differentiation.functional", "differentiation.summary")
                    || interim.usp || "",
        audience: extractField(p, "audience.primary", "targetAudience")
                    || interim.targetAudience || "",
      };
    } else {
      return {
        tagline: extractField(p, "theme", "tagline", "tagline.zhTagline"),
        usp:     extractField(p, "cta", "offer", "usp"),
        audience: item.startAt
          ? `${new Date(item.startAt).toLocaleDateString(en ? "en-US" : "zh-TW", { month: "short", day: "numeric" })}${item.endAt ? ` → ${new Date(item.endAt).toLocaleDateString(en ? "en-US" : "zh-TW", { month: "short", day: "numeric" })}` : ""}`
          : "",
      };
    }
  };

  const hasPositioning = (item: any): boolean => {
    const p = item.positioning ?? {};
    const interim = p._interim ?? {};
    return !!(
      p.tagline || p.usp || p.theme || p.differentiation?.summary ||
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
        <div className="text-center py-12 text-neutral-400">
          <p className="text-sm font-medium mb-1">
            {kind === "product"
              ? (en ? "No products yet" : "還沒有產品")
              : (en ? "No events yet" : "還沒有活動")}
          </p>
          <p className="text-xs mb-4">
            {kind === "product"
              ? (en ? "Add your first product to start positioning" : "新增第一個產品，開始建立定位")
              : (en ? "Add a campaign or event" : "新增活動或行銷企劃")}
          </p>
          <button
            onClick={onAdd}
            className="text-xs px-4 py-2 rounded-lg bg-neutral-900 text-white font-medium hover:bg-neutral-700 transition"
          >
            {kind === "product" ? (en ? "+ New product" : "+ 新增產品") : (en ? "+ New event" : "+ 新增活動")}
          </button>
        </div>
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
                className="text-left rounded-xl border border-neutral-200 bg-white p-0 overflow-hidden hover:border-neutral-400 hover:shadow-sm transition group flex flex-col"
              >
                {/* 2026-06-21 (CJ「產品頁籤加縮圖」): thumbnail at top.
                    productDiscovery writes imageUrl when crawling sites.
                    Falls back to a soft placeholder if missing or 404. */}
                {kind === "product" && (
                  <div
                    className="w-full bg-neutral-100 flex items-center justify-center overflow-hidden"
                    style={{ aspectRatio: "4 / 3", maxHeight: 140 }}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onError={(e) => {
                          // Hide broken image; parent placeholder still shows
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-neutral-300">
                        <FontAwesomeIcon icon={faBox} className="text-2xl" />
                        <span className="text-[10px] uppercase tracking-wider">
                          {en ? "no image" : "無圖"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className={kind === "product" ? "p-3" : "p-4"}>
                {/* Name */}
                <p className="text-sm font-semibold text-neutral-900 mb-2 truncate">{item.name}</p>

                {positioned ? (
                  <div className="space-y-1.5">
                    {preview.tagline && (
                      <div>
                        <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
                          {kind === "product" ? (en ? "Tagline" : "標語") : (en ? "Theme" : "主軸")}
                        </span>
                        <p className="text-[11px] text-neutral-700 leading-tight line-clamp-2 mt-0.5">{preview.tagline}</p>
                      </div>
                    )}
                    {preview.usp && (
                      <div>
                        <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
                          {kind === "product" ? "USP" : (en ? "CTA / Offer" : "CTA / 優惠")}
                        </span>
                        <p className="text-[11px] text-neutral-600 line-clamp-1 mt-0.5">{preview.usp}</p>
                      </div>
                    )}
                    {preview.audience && (
                      <div>
                        <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
                          {kind === "product" ? (en ? "Audience" : "受眾") : (en ? "Period" : "時間")}
                        </span>
                        <p className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">{preview.audience}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[11px] text-neutral-400">
                      {en ? "Positioning not yet run" : "尚未建立定位"}
                    </span>
                  </div>
                )}

                <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center gap-1.5 flex-wrap">
                  {/* Run positioning */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onPosition(item.id); }}
                    className="text-[10px] font-medium px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition flex-1 min-w-0 text-center"
                  >
                    {positioned ? (en ? "Re-position" : "重新定位") : (en ? "▶ Run positioning" : "▶ 開始定位")}
                  </button>
                  {/* 2026-06-21 (CJ「按 riverflow 標準」): branded variant generator */}
                  {kind === "product" && item.imageUrl && (
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
                                  ? "Brand palette not extracted yet. Open the Visual tab and click ✨ Extract from products first."
                                  : "品牌色彩還沒萃取。請先到「視覺」tab 按「✨ 從產品圖萃取」。")
                              : reason === "product_has_no_image"
                                ? (en ? "This product has no image to compose." : "這個產品沒有圖片可合成。")
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
                      className="text-[10px] font-medium px-2 py-1 rounded-md bg-orange-50 text-orange-700 hover:bg-orange-100 transition"
                      title={en ? "Generate 4 branded variants" : "用品牌色生成 4 種變體"}
                    >
                      {en ? "✨ Variants" : "✨ 品牌變體"}
                    </button>
                  )}
                  {/* Open */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpen(item.id); }}
                    className="text-[10px] font-medium px-2 py-1 rounded-md bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition"
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
                    className="text-[10px] px-2 py-1 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 transition"
                    title={en ? "Delete" : "刪除"}
                  >
                    ✕
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

      {/* 2026-06-21 (CJ「按 riverflow 標準」): branded variants modal.
          Renders inline at the bottom — no portal, no fixed positioning, just
          a centered overlay that contributes flow height. Shows loading,
          error, or the 4 generated variants in a 2x2 grid with download links. */}
      {variantState && (
        <div
          onClick={() => setVariantState(null)}
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
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#78716C", margin: 0 }}>
                  {en ? "Branded variants" : "品牌變體"}
                </p>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#171717", margin: "3px 0 0" }}>
                  {variantState.productName}
                </h3>
              </div>
              <button
                onClick={() => setVariantState(null)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid #E5E7EB",
                  background: "transparent", cursor: "pointer", fontSize: 16, color: "#78716C",
                }}
                aria-label={en ? "Close" : "關閉"}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {variantState.error && (
                <div style={{ padding: 16, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, color: "#991B1B", fontSize: 13, lineHeight: 1.6 }}>
                  {variantState.error}
                </div>
              )}
              {!variantState.error && !variantState.variants && (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#78716C" }}>
                  <div style={{ display: "inline-block", width: 32, height: 32, borderRadius: "50%", border: "3px solid #E5E7EB", borderTopColor: "#E85D2E", animation: "spin 0.8s linear infinite", marginBottom: 16 }} />
                  <p style={{ fontSize: 13, margin: 0 }}>
                    {en
                      ? "Compositing — running cutout + 4 layouts (~8 sec)…"
                      : "正在合成 — 跑去背 + 4 個版型（約 8 秒）…"}
                  </p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
              {variantState.variants && variantState.variants.length > 0 && (
                <>
                  {variantState.cutoutAvailable === false && (
                    <p style={{ fontSize: 11, color: "#92400E", background: "#FEF3C7", padding: "8px 12px", borderRadius: 8, marginBottom: 14 }}>
                      {en
                        ? "⚠ REPLICATE_API_TOKEN not set — using the original product image as a tile (no transparent cutout). Set the env var for true riverflow-grade output."
                        : "⚠ 還沒設 REPLICATE_API_TOKEN — 用原圖直接合成（沒去背）。設好環境變數後就會用透明去背達到 riverflow 效果。"}
                    </p>
                  )}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}>
                    {variantState.variants.map((v) => (
                      <div key={v.layout} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <img
                          src={v.pngDataUrl}
                          alt={v.layout}
                          style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, border: "1px solid #E5E7EB" }}
                        />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "#78716C", fontWeight: 500 }}>
                            {v.layout}
                          </span>
                          <a
                            href={v.pngDataUrl}
                            download={`${variantState.productName}_${v.layout}.png`}
                            style={{
                              fontSize: 11, fontWeight: 600, color: "#E85D2E",
                              textDecoration: "none", padding: "4px 8px",
                              border: "1px solid #E85D2E", borderRadius: 6,
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
      )}
    </div>
  );
}
