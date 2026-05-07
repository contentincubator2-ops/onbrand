/**
 * QuickTask30sPage — the 30 秒 tier home (2026-05-05).
 *
 * Replaces /fb beta. Mirrors QuickTasksPage visual design (Canva-style
 * gradient cards in horizontal-scroll row + tab strip), but:
 *
 *  - Data source: trpc.quickTask.listFB (not task_catalog)
 *  - Card thumbnail: bound agent's DiceBear avatar (not generic ⚡)
 *  - Click → primary-question modal → countdown + live mockup → result
 *  - Tab "30 秒" (default) + future filter for EDM / IG when those tiers ship
 */
import React, { useMemo, useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Badge, Button, Card, CardBody, Chip, Input, Modal, ModalBody,
  ModalContent, ModalFooter, ModalHeader, Progress, Skeleton, Spinner,
  Textarea,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt, faClipboard, faClipboardCheck, faClock, faPaperPlane,
  faRotateRight, faXmark, faStar, faChevronLeft, faChevronRight,
  faMagnifyingGlass, faEnvelope, faRocket, faBullhorn, faUsers,
  faFolderPlus, faCompass,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebookF, faInstagram, faYoutube, faTiktok, faLinkedinIn,
} from "@fortawesome/free-brands-svg-icons";
import { PlatformMockup } from "../components/PlatformMockup";
import type { MockupVariant } from "../lib/inferMockup";
import { EntityStats } from "../components/EntityStats";
import MediaGenFlow from "../components/media/MediaGenFlow";
import { StagePipelineView } from "../components/quickTask/StagePipelineView";
import { faPalette, faPenNib, faFilm, faWandMagicSparkles, faSliders, faTerminal, faImage, faChevronDown } from "@fortawesome/free-solid-svg-icons";
// Lucide outline icons — Notion-style (CJ direction 2026-05-06).
// Toolbar uses these instead of FontAwesome solid for cleaner, more modern feel.
import {
  Pencil, Image as LucideImage, Video, Wand2, MessageCircle,
  Save, Sliders as LucideSliders, Copy, Sparkles,
} from "lucide-react";

const CARD_PALETTES = [
  { from: "#fde68a", to: "#fbbf24", text: "#92400e" },
  { from: "#a5f3fc", to: "#22d3ee", text: "#164e63" },
  { from: "#c4b5fd", to: "#8b5cf6", text: "#4c1d95" },
  { from: "#bbf7d0", to: "#34d399", text: "#064e3b" },
  { from: "#fecaca", to: "#f87171", text: "#7f1d1d" },
  { from: "#fed7aa", to: "#fb923c", text: "#7c2d12" },
  { from: "#bfdbfe", to: "#60a5fa", text: "#1e3a8a" },
  { from: "#f5d0fe", to: "#c084fc", text: "#581c87" },
];

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=4267B2&backgroundType=solid`;

/** Tier accent color (Canva-style — vibrant, distinct per tier).
 *  30s = teal (quick / fast), 60s = purple (production / depth),
 *  100s = amber (premium / research-validated). Used for mockup frame
 *  glow, variant active dot, accordion icon backgrounds. */
function tierAccent(tier: "30s" | "60s" | "90s" | "100s" | undefined | null): string {
  if (tier === "60s") return "#7c3aed";   // purple
  if (tier === "100s") return "#f59e0b";  // amber
  if (tier === "90s") return "#f59e0b";   // legacy → amber
  return "#00b4bc";                        // 30s teal (default)
}

/**
 * Synthesize live stages while orchestra is running (no streaming yet).
 * Maps elapsed ms → which stages should be "running" / "done".
 * Tier-aware: 100s prepends a scout stage (real data fetch).
 *
 * Schedule:
 *   30s tier: pre / caption / brief / gen (~20s total)
 *   60s tier: pre / strategist / caption / brief / gen / extras / qa (~50s)
 *   100s tier: + scout at front (~60-90s)
 */
function synthesizeStages(elapsedMs: number, tier: "30s" | "60s" | "100s"): any[] {
  const t = elapsedMs;
  const isResearch = tier === "100s";
  const isProd = tier === "60s" || tier === "100s";

  // Scout offset: 100s adds 12s scout up-front; other tiers start at 0
  const scoutEnd = isResearch ? 12000 : 0;
  const preEnd = scoutEnd + 3000;
  const stratEnd = preEnd + 9000;
  const capStart = preEnd;
  const capEnd = capStart + 25000;
  const genEnd = capEnd + 10000;
  const extrasEnd = capEnd + 14000;
  const qaEnd = extrasEnd + 8000;

  const mk = (key: string, label: string, start: number, end: number) => ({
    key, label, startedAt: start,
    completedAt: t > end ? end : undefined,
    status: t < start ? "pending" : t > end ? "done" : "running",
  });

  const stages: any[] = [];
  if (isResearch) {
    stages.push(mk("scout", "🔬 Scout 爬取真實爆款數據", 0, scoutEnd));
  }
  stages.push(mk("pre", "URL / persona / brand load", scoutEnd, preEnd));
  if (isProd) {
    stages.push(mk("strategist", "Strategist 規劃敘事弧", preEnd, stratEnd));
  }
  stages.push(mk("caption", "Caption Writer 寫變體", capStart, capEnd));
  stages.push(mk("brief", "Image Director 寫視覺 brief", capStart, capEnd));
  stages.push(mk("gen", "Flux 生圖", capEnd, genEnd));
  if (isProd) {
    stages.push(mk("extras", "留言模板 / 發文時段 / 跟進", capEnd, extrasEnd));
    stages.push(mk("qa", "Jordan Hayes 審核", extrasEnd, qaEnd));
  }
  return stages;
}

interface FBTaskCard {
  id: string;
  tier: "30s" | "60s" | "90s";
  postType: string;
  /** Platform — FB / IG / Threads / etc. Surfaced by listFB since 2026-05-05. */
  platform?: string;
  label: string;
  description: string;
  kind: "fast" | "mid" | "squad";
  inputs?: any[];
  primary_question?: string | null;
  primary_input?: { key: string; placeholder?: string; type: "text" | "textarea" } | null;
  agent_id?: number | null;
  skill_slug?: string | null;
  agent?: { id: number; name: string; title: string; avatarUrl: string | null } | null;
  /** 60s tier: full collab team (caption_writer + image_director + strategist
   *  + specialty + universal helpers Emma/Helen/David/Sophie/Jordan). */
  team?: Array<{ id: number; name: string; title: string; avatarUrl: string | null }>;
  squad_slug?: string;
  methodology?: string;
}

type Tier = "30s" | "60s" | "100s";
type Channel = "facebook" | "instagram" | "youtube" | "tiktok" | "linkedin" | "email" | "pr" | "audience" | "brand" | "all";

interface ChannelTile {
  id: Channel;
  label: string;
  icon: any;
  bg: string;
  enabled: boolean;
}

const CHANNEL_TILES: ChannelTile[] = [
  { id: "all",        label: "全部",       icon: faStar,        bg: "#7C3AED", enabled: true  },
  { id: "facebook",   label: "Facebook",   icon: faFacebookF,   bg: "#1877F2", enabled: true  },
  { id: "instagram",  label: "Instagram",  icon: faInstagram,   bg: "#E4405F", enabled: true  },
  { id: "youtube",    label: "YouTube",    icon: faYoutube,     bg: "#FF0000", enabled: true  },
  { id: "tiktok",     label: "TikTok",     icon: faTiktok,      bg: "#010101", enabled: true  },
  { id: "linkedin",   label: "LinkedIn",   icon: faLinkedinIn,  bg: "#0A66C2", enabled: true  },
  { id: "email",      label: "電子報",     icon: faEnvelope,    bg: "#7B5BC8", enabled: true  },
  { id: "brand",      label: "品牌定位",   icon: faRocket,      bg: "#7C3AED", enabled: true  },
  { id: "pr",         label: "新聞稿",     icon: faBullhorn,    bg: "#475569", enabled: true  },
  { id: "audience",   label: "用戶研究",   icon: faUsers,       bg: "#E07B0F", enabled: true  },
];

/**
 * Inner ErrorBoundary so a runtime crash in tier-specific code (60s/100s)
 * shows a visible error panel instead of a white screen. The global
 * AppErrorBoundary (in AppV2) catches outermost errors but a crash inside
 * a deeply-nested branch (e.g. visibleTasks.map row, modal subtree)
 * sometimes blanks just this page if state corruption isolates the
 * unmount path. Inline boundary keeps the rest of the shell intact.
 */
class TierPageErrorBoundary extends React.Component<
  { children: React.ReactNode; tier: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) {
    // eslint-disable-next-line no-console
    console.error(`[QuickTask${this.props.tier}] render error:`, error, info);
  }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
          <div style={{ padding: 20, border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 12 }}>
            <p style={{ fontSize: 11, color: "#dc2626", textTransform: "uppercase", letterSpacing: 1 }}>
              /{this.props.tier} render error
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>頁面載入失敗</h2>
            <p style={{ marginTop: 8, color: "#374151" }}>{e.message}</p>
            <pre style={{ marginTop: 12, padding: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11, maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap" }}>
              {e.stack}
            </pre>
            <button
              style={{ marginTop: 12, padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
              onClick={() => this.setState({ error: null })}
            >
              重試渲染
            </button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

function QuickTask30sPageInner({ tier = "30s" }: { tier?: Tier }) {
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = (ctx?.brandId as number | null) ?? null;
  const brandName = useMemo(() => {
    const list = (ctx?.brands as any[]) ?? [];
    return list.find((b) => b?.id === brandId)?.name ?? null;
  }, [ctx, brandId]);
  // Pull the active brand row to access logoUrl. Refetched every 30s so a
  // freshly-saved FB logo shows up without a full page reload.
  const brandQuery = (trpc as any).brand?.get?.useQuery
    ? (trpc as any).brand.get.useQuery(
        { id: brandId ?? 0 },
        { enabled: !!brandId, refetchInterval: 30_000, refetchOnWindowFocus: false },
      )
    : { data: null, refetch: () => {} };
  const brandLogoUrl: string | null = (brandQuery.data as any)?.logoUrl ?? null;

  const [channel, setChannel] = useState<Channel>("facebook");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal + run state
  const [activeTask, setActiveTask] = useState<FBTaskCard | null>(null);
  const [primaryAnswer, setPrimaryAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<any | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState<any | null>(null);
  const [fetchedUrl, setFetchedUrl] = useState<{ url: string; title: string | null; chars: number; og?: { image: string | null; title: string | null; description: string | null; site_name: string | null; domain: string } } | null>(null);

  // Countdown overlay (visual SLA — counts up to expected eta)
  const [countdownStart, setCountdownStart] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(0);
  useEffect(() => {
    if (countdownStart == null) return;
    const id = window.setInterval(() => setTickMs(Date.now() - countdownStart), 100);
    return () => clearInterval(id);
  }, [countdownStart]);

  const listQuery = (trpc as any).quickTask?.listFB?.useQuery
    ? (trpc as any).quickTask.listFB.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const allTasks: FBTaskCard[] = (listQuery.data as FBTaskCard[]) ?? [];

  // 30s tier: simple/quick tasks (3 variants, no extras).
  // 60s tier: production-package multi-agent (5 variants + extras + QA).
  // 100s tier: campaign-level deliverables (multi-week / month-long / series)
  //            with REAL-TIME scout (festivals / trending / news) — distinct
  //            task pool (quickTask100.ts), NOT 60s pool.
  const tasksThisTier = useMemo(
    () => allTasks.filter((t) => t.tier === tier),
    [allTasks, tier],
  );

  // Apply channel + search filters
  const visibleTasks = useMemo(() => {
    let list = tasksThisTier;
    // Filter by platform field returned by listFB. Tasks without platform
    // fall back to id-prefix inference (fb-* / ig-*).
    if (channel !== "all") {
      list = list.filter((t: any) => {
        const platform =
          t.platform ??
          (t.id?.startsWith("ig-") ? "instagram"
            : t.id?.startsWith("yt-") ? "youtube"
            : t.id?.startsWith("tt-") ? "tiktok"
            : t.id?.startsWith("li-") ? "linkedin"
            : t.id?.startsWith("em-") ? "email"
            : t.id?.startsWith("pr-") ? "pr"
            : t.id?.startsWith("br-") ? "brand"
            : t.id?.startsWith("rs-") ? "audience"
            : "facebook");
        return platform === channel;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.agent?.name ?? "").toLowerCase().includes(q) ||
        (t.skill_slug ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [tasksThisTier, channel, searchQuery]);

  const tierLabel = tier === "30s" ? "30 秒" : tier === "60s" ? "60 秒" : "100 秒";
  const tierTagline = tier === "30s"
    ? "今天，要寫哪一篇 30 秒搞定的貼文？"
    : tier === "60s"
    ? "今天，要做哪一個 60 秒製作包？"
    : "今天，要做哪一個 100 秒研究驗證版？";

  const runQuickMut = (trpc as any).quickTask?.runQuick?.useMutation();
  // Plan B 20s parallel orchestra (caption_writer + image_director + Flux Schnell ×N)
  const runOrchestraMut = (trpc as any).quickTask?.runOrchestra?.useMutation();
  const runOrchestra60Mut = (trpc as any).quickTask?.runOrchestra60?.useMutation();
  const runOrchestra100Mut = (trpc as any).quickTask?.runOrchestra100?.useMutation();
  const runSquadAutoMut = (trpc as any).quickTask?.runSquadAuto?.useMutation();
  const [orchestraStages, setOrchestraStages] = useState<any[] | null>(null);
  const [imageAgentMeta, setImageAgentMeta] = useState<any | null>(null);

  const openTask = (t: FBTaskCard) => {
    // Per CJ direction: 100s squad tasks now auto-run inline (same modal UX
    // as 30s/60s) instead of redirecting to /picker workspace. The squad
    // pipeline runs all steps sequentially via runSquadAuto and returns the
    // result as variant[] (each variant = one step output).
    setActiveTask(t);
    setPrimaryAnswer("");
    setOutput(null);
    setErrorMsg(null);
    setLatencyMs(null);
    setAgentMeta(null);
  };

  const closeTask = () => {
    setActiveTask(null);
    setRunning(false);
    setCountdownStart(null);
  };

  const handleRun = async () => {
    if (!activeTask) return;
    if (!primaryAnswer.trim() && activeTask.primary_input?.key) {
      setErrorMsg("請先回答這個問題再生成");
      return;
    }
    setRunning(true);
    setErrorMsg(null);
    setOutput(null);
    setCountdownStart(Date.now());

    try {
      // 100s squad tasks (FB + IG): auto-run inline via runSquadAuto.
      // Each squad step → 1 variant in the result. Same modal UX as 30s/60s.
      if (activeTask.kind === "squad" && (activeTask as any).squad_slug) {
        if (runSquadAutoMut) {
          const r = await runSquadAutoMut.mutateAsync({
            squadSlug: (activeTask as any).squad_slug,
            topic: primaryAnswer || activeTask.label,
            brandId: brandId ?? undefined,
          });
          const platform = (activeTask as any).platform ?? "facebook";
          const transformedOutput = {
            platform,
            post_type: activeTask.postType ?? "feed",
            caption: r.variants?.[0]?.caption ?? "",
            hashtags: [],
            variants: (r.variants ?? []).map((v: any) => ({
              label: v.label,
              caption: v.caption,
              hashtags: [],
              image_style_direction: undefined,
              imageUrl: null,
              imageStatus: "skipped" as const,
              qa: null,
              extras: null,
              agent: v.agent ?? null,
            })),
          };
          setOutput(transformedOutput);
          setLatencyMs(r.totalLatencyMs);
          setAgentMeta(r.captionAgent ?? null);
          setImageAgentMeta(null);
          setOrchestraStages(r.stages ?? null);
          setFetchedUrl(null);
          if (!r.ok) {
            setErrorMsg(`Squad 部分步驟失敗：${(r.errors ?? []).slice(0, 1).join("")}`);
          }
          return;
        }
        setErrorMsg("Squad 自動執行 mutation 暫不可用");
        return;
      }
      const inputKey = activeTask.primary_input?.key ?? "topic";
      // 30s / 60s / 100s — all route through orchestra with tier-specific
      // mutation. Tier scales variants (3 → 5) + adds QA stage (60s+).
      const tierMut =
        tier === "60s" ? runOrchestra60Mut :
        tier === "100s" ? runOrchestra100Mut :
        runOrchestraMut;
      if (tierMut) {
        const r = await tierMut.mutateAsync({
          taskId: activeTask.id,
          inputs: { [inputKey]: primaryAnswer },
          brandId: brandId ?? undefined,
        });
        // Transform OrchestraResult → OutputCarousel-compatible shape.
        // Platform comes from the task itself (FB / IG / Threads). The
        // mockup variant inferer keys on platform:postType; hardcoding
        // "facebook" would route all IG tasks to FBFeed (regression).
        const taskPlatform =
          (activeTask as any).platform ??
          (activeTask.id?.startsWith("ig-") ? "instagram"
            : activeTask.id?.startsWith("yt-") ? "youtube"
            : activeTask.id?.startsWith("tt-") ? "tiktok"
            : activeTask.id?.startsWith("li-") ? "linkedin"
            : activeTask.id?.startsWith("em-") ? "email"
            : activeTask.id?.startsWith("pr-") ? "press"
            : activeTask.id?.startsWith("br-") ? "press"
            : activeTask.id?.startsWith("rs-") ? "press"
            : activeTask.id?.startsWith("fb-") ? "facebook"
            : "facebook");
        // Threads task uses platform="threads" + post_type="post" — preserve.
        const platformOverride =
          activeTask.id === "ig-30-threads-cross-post" ? "threads" : taskPlatform;
        const postTypeOverride =
          activeTask.id === "ig-30-threads-cross-post" ? "post" : (activeTask.postType ?? "feed");
        const transformedOutput = {
          platform: platformOverride,
          post_type: postTypeOverride,
          caption: r.variants?.[0]?.caption ?? "",
          hashtags: r.variants?.[0]?.hashtags ?? [],
          variants: (r.variants ?? []).map((v: any) => ({
            label: v.label,
            caption: v.caption,
            hashtags: v.hashtags,
            image_style_direction: v.image?.style ? { summary: v.image.style } : undefined,
            imageUrl: v.image?.url ?? null,
            imageStatus: v.image?.status ?? "skipped",
            // 60s/100s tier: QA result + production extras
            qa: v.qa ?? null,
            extras: v.extras ?? null,
          })),
        };
        setOutput(transformedOutput);
        setLatencyMs(r.totalLatencyMs);
        setAgentMeta(r.captionAgent ?? null);
        setImageAgentMeta(r.imageAgent ?? null);
        setOrchestraStages(r.stages ?? null);
        setFetchedUrl(r.fetchedUrl ?? null);
        if (!r.ok) {
          setErrorMsg(`Orchestra 部分階段失敗：${(r.errors ?? []).slice(0, 1).join("")}`);
        }
        return;
      }
      const r = await runQuickMut.mutateAsync({
        taskId: activeTask.id,
        inputs: { [inputKey]: primaryAnswer },
        brandId: brandId ?? undefined,
      });
      setOutput(r.output);
      setLatencyMs(r.latencyMs);
      setAgentMeta(r.agent ?? null);
      setFetchedUrl(r.fetchedUrl ?? null);
      if (!r.ok) {
        setErrorMsg(`部分欄位 LLM 輸出格式有差異，UI 已盡量呈現：${(r.validationErrors ?? []).slice(0, 1).join("")}`);
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setRunning(false);
      setCountdownStart(null);
    }
  };

  const handleCopy = () => {
    if (!output?.caption) return;
    navigator.clipboard.writeText(output.caption);
  };

  const mockupVariant: MockupVariant | null = useMemo(() => {
    if (!output) return null;
    const platform = (output.platform ?? "facebook") as any;
    const format = (output.post_type ?? "feed") as any;
    return { platform, format, label: `${platform}/${format}` };
  }, [output]);

  // 倒數仍對用戶承諾 30s（CJ direction 2026-05-05 — 20s 是後端的內部安全上限）
  const expectedSec = tier === "30s" ? 30 : tier === "60s" ? 60 : 100;
  const progressPct = Math.min(100, (tickMs / (expectedSec * 1000)) * 100);

  // Tier-distinct hero metadata — user feels the difference immediately
  const tierHero = tier === "30s"
    ? {
        emoji: "⚡",
        kicker: "QUICK DRAFT",
        headline: "30 秒搞定一篇貼文",
        sub: "輕量產出 · 3 個 caption 變體 · 風格 brief（按需生圖）",
        bullets: ["3 變體", "<20 秒", "URL/品牌語氣支援"],
        accent: "#00b4bc",
        gradientFrom: "rgba(0,180,188,0.10)",
      }
    : tier === "60s"
    ? {
        emoji: "🎼",
        kicker: "PRODUCTION PACKAGE",
        headline: "60 秒交付一份完整製作包",
        sub: "多 Agent 協作 · 5 變體 + 真生圖 + 留言模板 + 發文時段 + QA 審核",
        bullets: ["5 變體", "7-9 位 agent 協作", "Flux 真生圖", "Jordan QA 審核"],
        accent: "#7c3aed",
        gradientFrom: "rgba(124,58,237,0.10)",
      }
    : {
        emoji: "🎯",
        kicker: "REAL SQUAD · CAMPAIGN PIPELINE",
        headline: "100 秒任務 = 真實 Squad 多步驟工作流",
        sub: "點擊任務後進入 Squad 工作區（/picker）— 多位 agent 接力、按方法論交付完整月曆 / launch toolkit / 危機劇本",
        bullets: ["真實 Squad pipeline", "完整方法論（Pulizzi / Cialdini / Lagadec）", "calendar / toolkit shape 輸出", "FB 11 + IG 7 squad 已就位"],
        accent: "#f59e0b",
        gradientFrom: "rgba(245,158,11,0.10)",
      };

  // Hero copy adapts to tier but the visual structure is identical to /squads
  // (eyebrow → gradient title → EntityStats → search → channel icons).
  const heroTitle = tier === "30s"
    ? "今天，要寫哪一篇 30 秒搞定的貼文？"
    : tier === "60s"
    ? "今天，要做哪一個 60 秒製作包？"
    : "今天，要做哪一個 100 秒研究驗證版？";

  return (
    <div>
      {/* ─── HERO (matches /squads layout) ────────────────────────────── */}
      <div className="relative pt-14 pb-10 px-6 text-center">
        <div className="relative z-10 flex flex-col items-center text-center max-w-[1100px] mx-auto">
          {/* Three lines above search: eyebrow / gradient title / stats */}
          <div className="mb-6 w-full">
            <p className="text-xs font-semibold uppercase tracking-widest text-default-400 mb-3">
              SoWork · Marketing OS
            </p>
            <h1
              className="font-semibold tracking-tight leading-tight text-center"
              style={{
                fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
                background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {heroTitle}
            </h1>
            <div className="mt-3 text-small text-default-500">
              <EntityStats variant="inline" />
            </div>
          </div>

          {/* Search bar — matches /squads sizing */}
          <div className="w-full" style={{ maxWidth: 800 }}>
            <Input
              size="lg"
              radius="lg"
              variant="flat"
              placeholder={`搜尋 ${tierLabel} 任務、Agent 或 skill…`}
              value={searchQuery}
              onValueChange={setSearchQuery}
              isClearable
              onClear={() => setSearchQuery("")}
              startContent={
                <FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400 shrink-0" style={{ fontSize: 18 }} />
              }
              classNames={{
                base: "overflow-hidden rounded-[20px]",
                inputWrapper: "h-16 bg-white shadow-md border border-default-100 rounded-[20px] data-[focus=true]:shadow-lg",
                input: "text-medium",
              }}
            />
          </div>

          {/* Channel icon row — circle tiles, /squads style */}
          <div className="mt-6 w-full overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <div className="flex items-start gap-3 w-max mx-auto px-2">
              {CHANNEL_TILES.map((c) => {
                const active = channel === c.id;
                const disabled = !c.enabled;
                return (
                  <button
                    key={c.id}
                    onClick={() => c.enabled && setChannel(c.id)}
                    disabled={disabled}
                    className={`flex flex-col items-center gap-1.5 shrink-0 transition ${disabled ? "opacity-30 cursor-not-allowed" : "hover:scale-105 cursor-pointer"}`}
                  >
                    <div
                      className={`w-14 h-14 rounded-full flex items-center justify-center text-white ${active ? "ring-4 ring-default-300" : "shadow-sm"}`}
                      style={{ background: c.bg }}
                    >
                      <FontAwesomeIcon icon={c.icon} className="text-xl" />
                    </div>
                    <span className={`text-tiny ${active ? "font-semibold text-default-900" : "text-default-600"}`}>
                      {c.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tiny tier signature — kept so the page identifies itself, but
              tucked under the channel row so it doesn't dominate. */}
          <div className="mt-4 flex items-center gap-2 text-tiny text-default-400">
            <span
              className="px-2 py-0.5 rounded-full text-white font-semibold tracking-widest"
              style={{ background: tierHero.accent, fontSize: 9, letterSpacing: "0.15em" }}
            >
              {tierHero.kicker}
            </span>
            <span>·</span>
            <span>{tasksThisTier.length} 個 {tierLabel} 任務</span>
            <span>·</span>
            <span>品牌腦：<span className="font-medium text-default-700">{brandName ?? "（未選）"}</span></span>
          </div>
        </div>
      </div>

      {/* ─── Catalog ───────────────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-6 pb-20">
        {tasksThisTier.length === 0 ? (
          <Card>
            <CardBody className="text-center text-default-500 py-12">
              <FontAwesomeIcon icon={faBolt} className="text-3xl mb-2 text-default-300" />
              <p className="font-semibold mb-1">{tierLabel} 任務製作中</p>
              <p className="text-tiny text-default-400">
                {tier === "60s" && "60 秒任務（含完整視覺 brief）將於下一波上線"}
                {tier === "100s" && "100 秒：含真實數據驗證 + 影片生成（Phase 3 啟用中）"}
                {tier === "30s" && "請稍候，Agent 正在準備中"}
              </p>
            </CardBody>
          </Card>
        ) : visibleTasks.length === 0 ? (
          <Card>
            <CardBody className="text-center text-default-500 py-12">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-2xl mb-2 text-default-300" />
              <p>
                {!["facebook","instagram","youtube","tiktok","linkedin","email","pr","brand","audience","all"].includes(channel)
                  ? `${CHANNEL_TILES.find((c) => c.id === channel)?.label} 通路的 ${tierLabel} 任務製作中…`
                  : `沒有匹配 "${searchQuery}" 的任務`}
              </p>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight">精選任務</h2>
                <p className="text-tiny text-default-400 mt-0.5">按下即產出，先回答 1 個關鍵問題</p>
              </div>
              <Chip size="sm" variant="flat" color="secondary">{visibleTasks.length} 件</Chip>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleTasks.map((t, idx) => {
                const pal = CARD_PALETTES[idx % CARD_PALETTES.length];
                const agentName = t.agent?.name ?? "AI Agent";
                const avatarSrc = t.agent?.avatarUrl || dicebear(agentName);
                  return (
                    <button
                      key={t.id}
                      onClick={() => openTask(t)}
                      className="flex flex-col rounded-2xl overflow-hidden text-left transition hover:scale-[1.02] hover:shadow-lg"
                      style={{ border: "1px solid rgba(0,0,0,0.07)", background: "white" }}
                    >
                      {/* Top — gradient bg + agent avatar centered */}
                      <div
                        className="flex items-center justify-center relative"
                        style={{ height: 130, background: `linear-gradient(135deg, ${pal.from} 0%, ${pal.to} 100%)` }}
                      >
                        <Avatar
                          src={avatarSrc}
                          size="lg"
                          isBordered
                          color="default"
                          className="w-20 h-20 ring-2 ring-white/60"
                        />
                        <span
                          className="absolute top-2 right-2 text-tiny font-semibold px-2 py-0.5 rounded-full text-white shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${tierAccent(tier)}, ${tierAccent(tier)}cc)` }}
                        >
                          {tier}
                        </span>
                      </div>
                      {/* Card info */}
                      <div className="p-3 flex flex-col gap-1 flex-1">
                        <p className="text-small font-semibold leading-tight line-clamp-2">{t.label}</p>
                        <p className="text-tiny text-default-500 line-clamp-2">{t.description}</p>
                        {(t as any).methodology && (
                          <span className="text-[10px] text-default-400 italic">📚 {(t as any).methodology}</span>
                        )}
                        <div className="mt-auto pt-2 flex items-center gap-2 border-t border-default-100">
                          <Avatar src={avatarSrc} size="sm" className="w-5 h-5" />
                          <span className="text-tiny font-medium text-default-700 truncate">
                            {agentName}
                          </span>
                        </div>
                        {/* 60s tier: show full collab team avatar stack + count */}
                        {(t as any).team && (t as any).team.length > 1 && (
                          <div className="flex items-center gap-1.5 -mt-1">
                            <div className="flex -space-x-2">
                              {((t as any).team as Array<{id:number;name:string;avatarUrl:string|null}>)
                                .slice(0, 5)
                                .map((m) => (
                                  <Avatar
                                    key={m.id}
                                    src={m.avatarUrl || dicebear(m.name)}
                                    size="sm"
                                    className="w-5 h-5 ring-1 ring-white"
                                    title={m.name}
                                  />
                                ))}
                            </div>
                            <span className="text-[10px] text-default-500">
                              +{Math.max(0, (t as any).team.length - 5)} · {(t as any).team.length} 位協作
                            </span>
                          </div>
                        )}
                        {t.skill_slug && (
                          <Chip size="sm" variant="flat" className="self-start text-[10px]">
                            {t.skill_slug}
                          </Chip>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

      {/* ─── Modal: primary question + countdown + live mockup result ─── */}
      <Modal
        isOpen={!!activeTask}
        onClose={closeTask}
        size="5xl"
        scrollBehavior="inside"
        backdrop="blur"
        classNames={{
          base: "max-h-[94vh]",
          body: "py-2 px-3 bg-default-50",
          footer: "border-t border-default-200 bg-white sticky bottom-0 py-2",
          header: "py-2 bg-white",
        }}
      >
        <ModalContent>
          {activeTask && (
            <>
              {/* Canva-style modal header: title HIDDEN by default (only tooltip on hover);
                  primary visual is the asset. Show only tiny task name + tier chip + ✕. */}
              <ModalHeader className="flex items-center gap-2 py-1.5 px-3 border-b border-default-100">
                {/* Tiny task name (almost-hidden) — only readable for orientation */}
                <div
                  className="min-w-0 flex-1 group cursor-default"
                  title={activeTask.agent ? `${activeTask.label} · ${activeTask.agent.name}（${activeTask.agent.title}）` : activeTask.label}
                >
                  <p className="text-[11px] text-default-400 truncate group-hover:text-default-600 transition">
                    {activeTask.label}
                    {activeTask.agent && <span className="text-default-300 ml-2">· {activeTask.agent.name}</span>}
                  </p>
                </div>
                <span
                  className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full text-white shadow-sm shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${tierAccent(tier)}, ${tierAccent(tier)}cc)`,
                  }}
                >
                  {tier}
                </span>
              </ModalHeader>
              <ModalBody>
                {!output ? (
                  <>
                    {/* Primary question */}
                    {activeTask.primary_input && (
                      <div className="space-y-2">
                        <p className="text-small font-medium">{activeTask.primary_question}</p>
                        {activeTask.primary_input.type === "textarea" ? (
                          <Textarea
                            placeholder={activeTask.primary_input.placeholder ?? ""}
                            value={primaryAnswer}
                            onChange={(e) => setPrimaryAnswer(e.target.value)}
                            minRows={3}
                            autoFocus
                          />
                        ) : (
                          <Input
                            placeholder={activeTask.primary_input.placeholder ?? ""}
                            value={primaryAnswer}
                            onChange={(e) => setPrimaryAnswer(e.target.value)}
                            autoFocus
                          />
                        )}
                      </div>
                    )}

                    {/* Countdown progress (only while running) */}
                    {running && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-tiny">
                          <span>
                            <FontAwesomeIcon icon={faClock} className="mr-1" />
                            {(tickMs / 1000).toFixed(1)}s / {expectedSec}s
                          </span>
                          <span className="text-default-500">
                            {tickMs < expectedSec * 1000 ? "請稍候…" : `已超出預估，繼續中`}
                          </span>
                        </div>
                        <Progress
                          size="sm"
                          color={tickMs < expectedSec * 1000 ? "primary" : "warning"}
                          value={progressPct}
                        />
                        {/* 30s tier: simple spinner. 60s/100s: live team grid. */}
                        {tier === "30s" && (
                          <div className="text-center pt-2">
                            <Spinner size="sm" />
                            <p className="text-tiny text-default-500 mt-1">
                              {activeTask.agent?.name ?? "Agent"} 正在寫…
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 60s/100s tier — Live multi-agent collaboration view.
                        While running: synthesize stages from elapsed time so user
                        sees the pipeline kick in immediately (real stage timestamps
                        only arrive when orchestra completes — no streaming yet).
                        After complete: swap to real orchestra stages. */}
                    {(tier === "60s" || tier === "100s") && (running || (orchestraStages && orchestraStages.length > 0)) && (
                      <div className="mt-4">
                        <StagePipelineView
                          stages={
                            orchestraStages && orchestraStages.length > 0
                              ? orchestraStages
                              : synthesizeStages(tickMs, tier)
                          }
                          captionAgent={agentMeta ?? activeTask.agent ?? null}
                          imageAgent={imageAgentMeta}
                          tier={tier}
                        />
                      </div>
                    )}

                    {errorMsg && (
                      <Card className="bg-warning-50 border border-warning-200 mt-4">
                        <CardBody className="text-warning-800 text-small">{errorMsg}</CardBody>
                      </Card>
                    )}
                  </>
                ) : (
                  /* Output: variants as swipeable mockup carousel.
                     The "main" caption is variant[0] (or the top-level caption
                     if no variants). Use chevron arrows to swipe between.
                     Style direction lives INSIDE each mockup's image slot. */
                  <OutputCarousel
                    output={output}
                    activeTask={activeTask}
                    pageTier={tier}
                    brandName={brandName}
                    brandId={brandId}
                    brandLogoUrl={brandLogoUrl}
                    onBrandLogoUpdated={() => brandQuery.refetch?.()}
                    mockupVariant={mockupVariant}
                    latencyMs={latencyMs}
                    agentMeta={agentMeta}
                    imageAgentMeta={imageAgentMeta}
                    orchestraStages={orchestraStages}
                    fetchedUrl={fetchedUrl}
                    errorMsg={errorMsg}
                  />
                )}
              </ModalBody>
              <ModalFooter>
                {!output ? (
                  <>
                    <Button variant="light" onPress={closeTask} startContent={<FontAwesomeIcon icon={faXmark} />}>
                      取消
                    </Button>
                    <Button
                      color="primary"
                      onPress={handleRun}
                      isLoading={running}
                      isDisabled={running}
                      startContent={!running && <FontAwesomeIcon icon={faPaperPlane} />}
                    >
                      {running ? "生成中…" : "立即產出"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="light" onPress={closeTask}>關閉</Button>
                    <Button
                      variant="flat"
                      onPress={() => { setOutput(null); setPrimaryAnswer(primaryAnswer); }}
                      startContent={<FontAwesomeIcon icon={faRotateRight} />}
                      className="hover:scale-[1.02] transition"
                    >
                      重做
                    </Button>
                    <Button
                      onPress={handleCopy}
                      startContent={<FontAwesomeIcon icon={faClipboard} />}
                      className="font-semibold hover:scale-[1.02] transition"
                      style={{
                        background: `linear-gradient(135deg, ${tierAccent(tier)}, ${tierAccent(tier)}dd)`,
                        color: "white",
                      }}
                    >
                      複製全文
                    </Button>
                  </>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

/** Default export wraps the page in a tier-aware error boundary so a
 *  runtime crash shows a visible error panel (not a white screen). */
export default function QuickTask30sPage({ tier = "30s" }: { tier?: Tier }) {
  return (
    <TierPageErrorBoundary tier={tier}>
      <QuickTask30sPageInner tier={tier} />
    </TierPageErrorBoundary>
  );
}

/* ──────────────────────────── Output Carousel ────────────────────────────
 * Each variant becomes its own complete mockup. Left/right chevrons swap
 * between them. Style direction shows INSIDE each mockup's image slot.
 *
 * If output has 0 variants (just top-level caption), shows a single mockup.
 */
/** SavePanel — picks a project to attach the current variant to.
 *  Lists user's projects (via trpc.project.list if available) + 「新增專案」.
 *  Falls back to a placeholder message when projects API isn't wired yet. */
function SavePanel({ slide, accent, onClose }: {
  slide: any;
  pageTier: "30s" | "60s" | "100s";
  accent: string;
  brandId: number | null;
  onClose: () => void;
}) {
  const listQuery = (trpc as any).project?.list?.useQuery
    ? (trpc as any).project.list.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: null, isLoading: false };
  const projects: any[] = listQuery.data ?? [];
  const projectsAvailable = (trpc as any).project?.list?.useQuery != null;
  const [savedProjectId, setSavedProjectId] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {!projectsAvailable && (
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-tiny text-warning-800">
          <p className="font-semibold mb-1">專案功能正在接後端</p>
          <p>目前可以先用「複製文案」帶到你自己的文件。專案 API 上線後此處就會顯示專案清單。</p>
        </div>
      )}
      {projectsAvailable && (
        <>
          <p className="text-[10px] text-default-500">挑一個專案，把這個版本的文案 + 圖片風格存進去：</p>
          {projects.length === 0 && !listQuery.isLoading && (
            <p className="text-tiny text-default-400 italic py-3 text-center">尚未建立專案</p>
          )}
          <div className="space-y-1">
            {projects.map((p: any) => (
              <button
                key={p.id}
                onClick={() => {
                  // TODO: call project.attachOutput mutation when available
                  setSavedProjectId(p.id);
                  setTimeout(onClose, 1200);
                }}
                disabled={savedProjectId === p.id}
                className={`w-full flex items-center gap-2 p-2 rounded-lg border transition text-left ${
                  savedProjectId === p.id
                    ? "border-success-300 bg-success-50"
                    : "border-default-200 hover:bg-default-50"
                }`}
              >
                <span className="w-7 h-7 rounded-md flex items-center justify-center text-tiny font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
                  {p.name?.charAt(0) ?? "P"}
                </span>
                <span className="flex-1 min-w-0 truncate text-tiny font-semibold text-default-800">{p.name}</span>
                {savedProjectId === p.id && <span className="text-success-600 text-tiny">✓ 已存</span>}
              </button>
            ))}
          </div>
        </>
      )}
      <Button
        size="sm"
        variant="flat"
        className="w-full"
        startContent={<FontAwesomeIcon icon={faFolderPlus} />}
        onPress={() => { window.location.href = "/projects"; }}
      >
        新增專案
      </Button>
    </div>
  );
}

function OutputCarousel({
  output, activeTask, pageTier, brandName, brandId, brandLogoUrl, onBrandLogoUpdated,
  mockupVariant, latencyMs, agentMeta, imageAgentMeta, orchestraStages, fetchedUrl, errorMsg,
}: {
  output: any;
  activeTask: FBTaskCard;
  /** Page-level tier ("30s" / "60s" / "100s") — drives ALL visual tier identity
   *  (chip color, gradient, accordion availability), independent of the
   *  task's data tier (FB60V2 tasks always have tier="60s" but appear on
   *  both /60s and /100s pages — visual tier follows page, not data). */
  pageTier: "30s" | "60s" | "100s";
  brandName: string | null;
  brandId: number | null;
  brandLogoUrl: string | null;
  onBrandLogoUpdated?: () => void;
  mockupVariant: MockupVariant | null;
  latencyMs: number | null;
  agentMeta: any;
  imageAgentMeta?: any;
  orchestraStages?: any[] | null;
  fetchedUrl: { url: string; title: string | null; chars: number; og?: { image: string | null; title: string | null; description: string | null; site_name: string | null; domain: string } } | null;
  errorMsg: string | null;
}) {
  // Build the slide list. Plan B (orchestra) returns variants[] already as
  // the authoritative slide list — no separate "main"; first variant IS the
  // main. Legacy runQuick path uses [main, ...variants] as before.
  const slides: Array<{
    label: string; caption: string; hashtags?: string[]; imageStyle?: string;
    imageUrl?: string | null; imageStatus?: "ready" | "failed" | "skipped" | "timeout";
    qa?: { status: "pass" | "flag"; comment?: string; score?: number; suggestions?: string[] } | null;
    extras?: {
      postingTime?: string;
      replyTemplates?: Array<{ userSays: string; yourReply: string }>;
      followupPost?: string;
      compareTable?: string;
      timingAdvice?: string;
      legalCheck?: string;
    } | null;
  }> = useMemo(() => {
    const topStyle = output.image_style_direction?.summary;
    const orchestraMode = (output.variants ?? []).some((v: any) => v.imageUrl !== undefined || v.imageStatus !== undefined);
    if (orchestraMode) {
      return (output.variants ?? []).map((v: any, i: number) => ({
        label: v.label || `版本 ${i + 1}`,
        caption: v.caption ?? "",
        hashtags: v.hashtags ?? [],
        imageStyle: v.image_style_direction?.summary || topStyle,
        imageUrl: v.imageUrl ?? null,
        imageStatus: v.imageStatus ?? "skipped",
        qa: v.qa ?? null,
        extras: v.extras ?? null,
      }));
    }
    // Legacy path
    const main = {
      label: "主版本",
      caption: output.caption ?? "",
      hashtags: output.hashtags ?? [],
      imageStyle: topStyle,
    };
    const vars = (output.variants ?? []).map((v: any, i: number) => ({
      label: v.label || `版本 ${i + 2}`,
      caption: v.caption ?? "",
      hashtags: v.hashtags ?? output.hashtags ?? [],
      imageStyle: v.image_style_direction?.summary || topStyle,
    }));
    return [main, ...vars];
  }, [output]);

  const [idx, setIdx] = useState(0);
  const total = slides.length;
  const [mediaGenOpen, setMediaGenOpen] = useState(false);
  // Per-slide image overrides — set when MediaGenFlow finishes generating.
  // { [slideIdx]: imageUrl } merged on top of slide.imageUrl from orchestra.
  const [imageOverrides, setImageOverrides] = useState<Record<number, string>>({});
  const [fbLogoModalOpen, setFbLogoModalOpen] = useState(false);
  const [fbHandle, setFbHandle] = useState("");
  const [fbBusy, setFbBusy] = useState(false);
  const [fbErr, setFbErr] = useState<string | null>(null);
  const fetchFbAvatarMut = (trpc as any).brand?.fetchFacebookAvatar?.useMutation();
  const onSubmitFbHandle = async () => {
    if (!brandId) return;
    if (!fbHandle.trim()) { setFbErr("請輸入 FB 粉專網址或 handle"); return; }
    setFbBusy(true); setFbErr(null);
    try {
      await fetchFbAvatarMut.mutateAsync({ brandId, handleOrUrl: fbHandle.trim() });
      onBrandLogoUpdated?.();
      setFbLogoModalOpen(false);
      setFbHandle("");
    } catch (e: any) {
      setFbErr(e?.message ?? String(e));
    } finally { setFbBusy(false); }
  };
  // Per-slide caption edits (keyed by slide index). Empty = use original.
  const [edits, setEdits] = useState<Record<number, string>>({});
  const baseSlide = slides[idx];
  const slide = baseSlide
    ? {
        ...baseSlide,
        caption: edits[idx] ?? baseSlide.caption,
        imageUrl: imageOverrides[idx] ?? baseSlide.imageUrl,
        imageStatus: imageOverrides[idx] ? "ready" as const : baseSlide.imageStatus,
      }
    : baseSlide;
  const isEdited = edits[idx] != null && edits[idx] !== baseSlide?.caption;

  // Canva-style modal state. Single activeTool drives the right panel content.
  // null = no panel (mockup max width); other values toggle a context-sensitive
  // drawer to the right (edit / style / video / details / prompt).
  type ToolKind = null | "edit" | "style" | "video" | "details" | "prompt" | "chat" | "save";
  const [activeTool, setActiveTool] = useState<ToolKind>(null);
  // Image gen flow inline state — 3 steps: brief → confirm prompt → generate
  const [imageStep, setImageStep] = useState<"brief" | "prompt">("brief");
  const [editablePrompt, setEditablePrompt] = useState("");
  const [imageModel, setImageModel] = useState<"piapi/flux-schnell" | "piapi/flux-pro" | "openai/gpt-image-1" | "google/imagen-3">("piapi/flux-schnell");
  // Video gen flow — mirrors image gen
  const [videoStep, setVideoStep] = useState<"brief" | "prompt">("brief");
  const [editableVideoPrompt, setEditableVideoPrompt] = useState("");
  const [videoModel, setVideoModel] = useState<"hailuo/t2v" | "piapi/kling-v2-master">("hailuo/t2v");
  // Agents: clicking an avatar in toolbar opens a popover showing that agent's contribution
  const [openAgentPopover, setOpenAgentPopover] = useState<number | null>(null);
  // Inline image / video gen — generates directly in the right panel,
  // no MediaGenFlow modal popup (per CJ direction).
  const [imageGenStatus, setImageGenStatus] = useState<"idle" | "generating" | "ready" | "failed">("idle");
  const [imageGenError, setImageGenError] = useState<string | null>(null);
  const [videoGenStatus, setVideoGenStatus] = useState<"idle" | "generating" | "ready" | "failed" | "submitted">("idle");
  const [videoGenError, setVideoGenError] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const mediaGenerateMut = (trpc as any).media?.generate?.useMutation();
  const handleInlineImageGen = async () => {
    if (!editablePrompt.trim() || !mediaGenerateMut) return;
    setImageGenStatus("generating");
    setImageGenError(null);
    try {
      const r = await mediaGenerateMut.mutateAsync({
        kind: "image",
        modelId: imageModel,
        promptEn: editablePrompt,
        brandId: brandId ?? null,
        aspectRatio: "1:1" as const,
        quality: "medium" as const,
      });
      if (r?.ok && r.url) {
        setImageOverrides((o) => ({ ...o, [idx]: r.url }));
        setImageGenStatus("ready");
      } else {
        setImageGenStatus("failed");
        setImageGenError(r?.message ?? "生成失敗");
      }
    } catch (e: any) {
      setImageGenStatus("failed");
      setImageGenError(e?.message ?? String(e));
    }
  };
  const handleInlineVideoGen = async () => {
    if (!editableVideoPrompt.trim() || !mediaGenerateMut) return;
    setVideoGenStatus("generating");
    setVideoGenError(null);
    setGeneratedVideoUrl(null);
    try {
      const r = await mediaGenerateMut.mutateAsync({
        kind: "video",
        modelId: videoModel,
        promptEn: editableVideoPrompt,
        brandId: brandId ?? null,
        aspectRatio: "9:16" as const,
      });
      if (r?.ok && r.url) {
        setGeneratedVideoUrl(r.url);
        setVideoGenStatus("ready");
      } else if (r?.status === "submitted") {
        setVideoGenStatus("submitted");
        setVideoGenError("影片在背景生成中（60-180 秒），請耐心等候。");
      } else {
        setVideoGenStatus("failed");
        setVideoGenError(r?.message ?? "生成失敗");
      }
    } catch (e: any) {
      setVideoGenStatus("failed");
      setVideoGenError(e?.message ?? String(e));
    }
  };
  // AI chat panel state — replaces 換語氣
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; content: string; rewritten?: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const refineCaptionMut = (trpc as any).quickTask?.refineCaption?.useMutation();
  const handleChatSend = async () => {
    if (!chatInput.trim() || !slide?.caption || chatBusy) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatHistory((h) => [...h, { role: "user", content: userMsg }]);
    setChatBusy(true);
    try {
      const r = await refineCaptionMut?.mutateAsync({
        currentCaption: slide.caption,
        userFeedback: userMsg,
        agentName: agentMeta?.name,
        agentTitle: agentMeta?.title,
        brandId: brandId ?? undefined,
        history: chatHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      });
      if (r?.ok && r.rewritten) {
        setChatHistory((h) => [...h, {
          role: "assistant",
          content: r.explanation || `根據你的意見改寫：`,
          rewritten: r.rewritten,
        }]);
      } else {
        setChatHistory((h) => [...h, { role: "assistant", content: `（沒寫成功：${r?.error ?? "未知錯誤"}）` }]);
      }
    } catch (e: any) {
      setChatHistory((h) => [...h, { role: "assistant", content: `（出錯：${e?.message ?? e}）` }]);
    } finally {
      setChatBusy(false);
    }
  };
  const stageCount = orchestraStages?.length ?? 0;
  const doneStages = orchestraStages?.filter((s: any) => s.status === "done").length ?? 0;
  const hasDetails = !!(slide?.qa?.comment || slide?.extras || (orchestraStages && orchestraStages.length > 0) || fetchedUrl);
  const toggleTool = (t: ToolKind) => setActiveTool((cur) => (cur === t ? null : t));

  // Tool rail button — icon-only, Canva-style. Active = tier-color gradient.
  // ToolBtn accepts either a FontAwesome icon (legacy) or a Lucide React component.
  // Pass `lucide={Pencil}` for Lucide outline (Notion-style); `icon={faPenNib}` for legacy FA.
  const ToolBtn = ({ icon, lucide: LucideIcon, label, active, onPress, disabled }: {
    icon?: any;
    lucide?: any;
    label: string;
    active?: boolean;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button
      onClick={onPress}
      disabled={disabled}
      title={label}
      className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center transition relative ${
        disabled ? "opacity-30 cursor-not-allowed"
          : active ? "shadow-md text-white scale-105"
          : "text-default-600 hover:bg-default-100 hover:scale-105"
      }`}
      style={active && !disabled ? { background: `linear-gradient(135deg, ${tierAccent(pageTier)}, ${tierAccent(pageTier)}cc)` } : undefined}
    >
      {LucideIcon ? (
        <LucideIcon size={18} strokeWidth={1.8} />
      ) : (
        <FontAwesomeIcon icon={icon} className="text-medium" />
      )}
    </button>
  );

  return (
    <div className="space-y-2">
      {/* (Minimal info strip removed — redundant with toolbar latency token + 👥 agents button) */}

      {!slide.caption && (
        <Card className="bg-warning-50 border border-warning-200">
          <CardBody className="text-warning-800 text-tiny py-2 px-3">
            這個版本（{slide.label}）LLM 沒生出文字，先看其他版本，或按「重做」。
          </CardBody>
        </Card>
      )}

      {/* ═══ FLOATING TOOLBAR — Notion-style Lucide outline icons ═══
          Group A (修改文案): 編輯 / AI 對話 / AI 生圖 / AI 生影片
          ── divider ──
          Group B (Agent 頭像): toolbar 直接顯示頭像 — 點頭像 popover
          ── divider ──
          Group C (看細節): 視覺方向 / QA / Production
          ── divider ──
          Group D (拿走): 複製 / 儲存到專案  */}
      <div className="sticky top-1 z-30 flex justify-center pointer-events-none mb-1">
        <div className="pointer-events-auto inline-flex items-center gap-0.5 bg-white border border-default-200 rounded-full shadow-lg px-2 py-1.5">
          {/* GROUP A: 修改 / 生產 */}
          {slide?.caption && (
            <ToolBtn lucide={Pencil} label="編輯文案" active={activeTool === "edit"} onPress={() => toggleTool("edit")} />
          )}
          {slide?.caption && (
            <ToolBtn lucide={MessageCircle} label="跟 AI 改文案（對話迭代）" active={activeTool === "chat"}
              onPress={() => toggleTool("chat")} />
          )}
          <ToolBtn lucide={LucideImage} label="AI 生圖" active={activeTool === "style"}
            disabled={!slide?.imageStyle} onPress={() => { setImageStep("brief"); toggleTool("style"); }} />
          <ToolBtn lucide={Video} label="AI 生影片" active={activeTool === "video"}
            onPress={() => { setVideoStep("brief"); toggleTool("video"); }} />

          <span className="w-px h-5 bg-default-200 mx-1" />
          {/* GROUP B: Agent 頭像（直接 inline toolbar）— 點頭像看那位 agent 做了什麼 */}
          {(() => {
            const allAgents: Array<{ id: number; name: string; title?: string; avatarUrl?: string | null; role: string; output?: string }> = [];
            if (agentMeta) allAgents.push({ id: agentMeta.id, name: agentMeta.name, title: agentMeta.title, avatarUrl: agentMeta.avatarUrl, role: "文案主寫" });
            if (imageAgentMeta) allAgents.push({ id: imageAgentMeta.id, name: imageAgentMeta.name, title: imageAgentMeta.title, avatarUrl: imageAgentMeta.avatarUrl, role: "視覺方向" });
            for (const v of slides) {
              const va = (v as any).agent;
              if (va && !allAgents.find((a) => a.id === va.id)) {
                allAgents.push({ id: va.id, name: va.name, title: va.title, avatarUrl: va.avatarUrl, role: v.label ?? "Squad agent", output: v.caption });
              }
            }
            const visibleAgents = allAgents.slice(0, 3);
            const overflowCount = Math.max(0, allAgents.length - 3);
            if (allAgents.length === 0) return null;
            return (
              <>
                {visibleAgents.map((a) => {
                  const isOpen = openAgentPopover === a.id;
                  return (
                    <div key={a.id} className="relative">
                      <button
                        onClick={() => setOpenAgentPopover(isOpen ? null : a.id)}
                        title={`${a.name} · ${a.role}`}
                        className={`w-9 h-9 rounded-full overflow-hidden transition flex items-center justify-center ${
                          isOpen ? "ring-2 scale-105" : "hover:scale-105 ring-1 ring-default-200"
                        }`}
                        style={isOpen ? { borderColor: tierAccent(pageTier), boxShadow: `0 0 0 2px ${tierAccent(pageTier)}` } : undefined}
                      >
                        <Avatar src={a.avatarUrl || dicebear(a.name)} size="sm" className="w-9 h-9" />
                      </button>
                      {isOpen && (
                        <div
                          className="absolute top-12 left-1/2 -translate-x-1/2 z-50 w-64 bg-white border border-default-200 rounded-xl shadow-lg p-3 space-y-1.5"
                          style={{ borderColor: `${tierAccent(pageTier)}50` }}
                        >
                          <div className="flex items-center gap-2 pb-2 border-b border-default-100">
                            <Avatar src={a.avatarUrl || dicebear(a.name)} size="sm" className="w-7 h-7" />
                            <div className="flex-1 min-w-0">
                              <p className="text-tiny font-semibold truncate">{a.name}</p>
                              <p className="text-[10px] text-default-500 truncate">{a.title ?? a.role}</p>
                            </div>
                            <button onClick={() => setOpenAgentPopover(null)} className="text-default-400 hover:text-default-700">
                              <FontAwesomeIcon icon={faXmark} className="text-tiny" />
                            </button>
                          </div>
                          <p className="text-[10px] font-semibold text-default-500">完成的事：</p>
                          <p className="text-tiny text-default-800 whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto">
                            {a.output ? a.output.slice(0, 360) + (a.output.length > 360 ? "…" : "")
                              : a.role === "文案主寫" ? `撰寫了 ${slides.length} 個變體的 caption。當前版本「${slide?.label}」：\n${slide?.caption?.slice(0, 200) ?? ""}…`
                              : a.role === "視覺方向" ? `產出視覺風格 brief：\n${slide?.imageStyle?.slice(0, 200) ?? "（沒有 brief）"}`
                              : "（無單獨輸出記錄）"}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {overflowCount > 0 && (
                  <button
                    onClick={() => toggleTool("details")}
                    title={`還有 ${overflowCount} 位 agent，點開看完整協作流程`}
                    className="w-9 h-9 rounded-full bg-default-100 text-default-600 text-tiny font-bold hover:bg-default-200 transition flex items-center justify-center"
                  >
                    +{overflowCount}
                  </button>
                )}
              </>
            );
          })()}

          <span className="w-px h-5 bg-default-200 mx-1" />
          {/* GROUP C: 看細節 */}
          <ToolBtn lucide={Wand2} label="視覺方向 / hashtag" active={activeTool === "prompt"}
            disabled={!slide?.imageStyle} onPress={() => toggleTool("prompt")} />
          <ToolBtn lucide={LucideSliders} label="QA / Production package / 連結" active={activeTool === "details"}
            disabled={!hasDetails} onPress={() => toggleTool("details")} />

          <span className="w-px h-5 bg-default-200 mx-1" />
          {/* GROUP D: 拿走 */}
          <ToolBtn lucide={Copy} label="複製文案"
            onPress={() => { if (slide?.caption) navigator.clipboard.writeText(slide.caption); }} />
          <ToolBtn lucide={Save} label="儲存 / 加到專案" active={activeTool === "save"}
            onPress={() => toggleTool("save")} />
        </div>
      </div>

      {/* ═══ CANVA STAGE: huge mockup | optional right contextual panel ═══ */}
      <div className="flex gap-3 items-stretch">
        {/* ── CENTER STAGE: Mockup with side chevrons (each chevron shows variant name) ── */}
        <div className="flex-1 min-w-0 flex flex-col items-center">
          <div className="relative flex items-stretch gap-2">
            {total > 1 && (
              <button
                onClick={() => setIdx(Math.max(0, idx - 1))}
                disabled={idx === 0}
                className={`flex-shrink-0 self-stretch flex flex-col items-center justify-center gap-1 rounded-xl transition px-2 ${
                  idx === 0
                    ? "opacity-0 cursor-not-allowed pointer-events-none"
                    : "text-default-500 hover:text-default-800 hover:bg-white/60"
                }`}
                aria-label="上一個版本"
                title={idx > 0 ? `上一版：${slides[idx - 1]?.label}` : ""}
              >
                <FontAwesomeIcon icon={faChevronLeft} className="text-large" />
                {idx > 0 && (
                  <span className="text-[10px] font-medium text-default-500 max-w-[60px] text-center leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {slides[idx - 1]?.label}
                  </span>
                )}
              </button>
            )}
            {/* Canva-style canvas: grey breathing room + asset centered + soft shadow */}
            <div className="flex-1 min-w-0 flex justify-center">
              {mockupVariant && (
                <div
                  className={`w-full ${activeTool ? "max-w-[640px]" : "max-w-[760px]"} transition-all`}
                >
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "white",
                      boxShadow: `0 24px 48px -16px ${tierAccent(pageTier)}55, 0 8px 24px -8px rgba(0,0,0,0.10), 0 0 0 1px ${tierAccent(pageTier)}25`,
                    }}
                  >
                  <PlatformMockup
                    // Inject the active variant label into the mockup's variantLabel
                    // so the FACEBOOK / FEED header reads e.g. "FACEBOOK / FEED · 情感版"
                    variant={{ ...mockupVariant, label: `${mockupVariant.label} · ${slide.label ?? ""}` }}
                    title={output.title ?? ""}
                    brief={output.description ?? ""}
                    brandName={brandName}
                    brandLogoUrl={brandLogoUrl}
                    liveCaption={slide.caption}
                    liveTitle={output.title}
                    liveDescription={output.description}
                    liveCta={output.cta}
                    liveHashtags={slide.hashtags}
                    liveImageStyle={slide.imageStyle}
                    liveImageUrl={slide.imageUrl ?? undefined}
                    liveImageStatus={slide.imageStatus}
                    liveVideoStyle={output.video_style_direction?.summary}
                    ogCard={fetchedUrl?.og ? {
                      url: fetchedUrl.url,
                      image: fetchedUrl.og.image,
                      title: fetchedUrl.og.title,
                      description: fetchedUrl.og.description,
                      siteName: fetchedUrl.og.site_name,
                      domain: fetchedUrl.og.domain,
                    } : undefined}
                  />
                  </div>
                </div>
              )}
            </div>
            {total > 1 && (
              <button
                onClick={() => setIdx(Math.min(total - 1, idx + 1))}
                disabled={idx === total - 1}
                className={`flex-shrink-0 self-stretch flex flex-col items-center justify-center gap-1 rounded-xl transition px-2 ${
                  idx === total - 1
                    ? "opacity-0 cursor-not-allowed pointer-events-none"
                    : "text-default-500 hover:text-default-800 hover:bg-white/60"
                }`}
                aria-label="下一個版本"
                title={idx < total - 1 ? `下一版：${slides[idx + 1]?.label}` : ""}
              >
                <FontAwesomeIcon icon={faChevronRight} className="text-large" />
                {idx < total - 1 && (
                  <span className="text-[10px] font-medium text-default-500 max-w-[60px] text-center leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {slides[idx + 1]?.label}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Variant label removed per CJ — redundant with bottom thumbnail strip
              showing active variant. Keep modal clean (Canva pattern). */}

          {/* Inline edit textarea — only shows when ✏️ tool active (Canva pattern) */}
          {activeTool === "edit" && slide?.caption && (
            <div className="w-full max-w-[640px] mt-3 rounded-2xl border-2 bg-white shadow-md p-3 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
                 style={{ borderColor: tierAccent(pageTier) }}>
              <div className="flex items-center justify-between">
                <span className="text-tiny font-semibold text-default-700 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faPenNib} style={{ color: tierAccent(pageTier) }} />
                  直接編輯（mockup 即時更新）
                </span>
                <div className="flex items-center gap-2">
                  {isEdited && (
                    <button
                      onClick={() => setEdits((e) => { const next = { ...e }; delete next[idx]; return next; })}
                      className="text-tiny text-default-500 hover:text-default-700 underline-offset-2 hover:underline"
                    >
                      還原 AI 原版
                    </button>
                  )}
                  <button onClick={() => setActiveTool(null)} className="text-default-400 hover:text-default-600">
                    <FontAwesomeIcon icon={faXmark} className="text-tiny" />
                  </button>
                </div>
              </div>
              <Textarea
                value={slide.caption}
                onValueChange={(v) => setEdits((e) => ({ ...e, [idx]: v }))}
                minRows={4}
                maxRows={10}
                classNames={{ input: "text-small leading-relaxed font-sans" }}
              />
            </div>
          )}

          {/* Brand logo hint moved to floating bottom-right when applicable —
              keeps main canvas clean (Canva pattern: no nag banners). */}
          {brandId && !brandLogoUrl && (
            <button
              onClick={() => setFbLogoModalOpen(true)}
              className="fixed bottom-20 right-6 z-30 flex items-center gap-1.5 text-[10px] text-default-500 bg-white hover:bg-default-50 transition border border-default-200 rounded-full shadow-sm px-2.5 py-1"
              title="這個品牌還沒粉專頭像 — 點此一鍵抓取"
            >
              <FontAwesomeIcon icon={faFacebookF} className="text-default-400 text-[9px]" />
              <span>抓粉專頭像</span>
            </button>
          )}
        </div>

        {/* ── RIGHT CONTEXTUAL PANEL — slides in only when a tool is active ── */}
        {activeTool && activeTool !== "edit" && (
          <div className="w-72 shrink-0 max-h-[calc(92vh-220px)] overflow-y-auto pr-1 space-y-2 animate-in slide-in-from-right-2 fade-in duration-200">
            {/* Panel header with close button */}
            <div className="sticky top-0 bg-white pb-2 flex items-center justify-between border-b border-default-100 z-10">
              <span className="text-tiny font-bold tracking-wider uppercase" style={{ color: tierAccent(pageTier) }}>
                {activeTool === "style" && "🎨 AI 生圖"}
                {activeTool === "video" && "🎬 AI 影片生成"}
                {activeTool === "prompt" && "🪄 視覺方向 / hashtag"}
                {activeTool === "details" && "📊 細節資訊"}
                {activeTool === "chat" && `💬 跟 ${agentMeta?.name ?? "AI"} 改文案`}
                {activeTool === "save" && "💾 儲存 / 加到專案"}
              </span>
              <button onClick={() => setActiveTool(null)} className="text-default-400 hover:text-default-700">
                <FontAwesomeIcon icon={faXmark} className="text-tiny" />
              </button>
            </div>

            {/* STYLE panel — 3-step image gen flow: brief → confirm prompt → generate */}
            {activeTool === "style" && (
              <div className="space-y-3">
                {/* Step 1: 中文 brief (always shown) */}
                <div className="rounded-xl border border-default-200 bg-default-50 p-3">
                  <p className="text-[10px] font-semibold text-default-500 mb-1 flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-default-200 text-default-700 text-[9px] flex items-center justify-center">1</span>
                    中文視覺風格建議
                  </p>
                  <p className="text-tiny text-default-800 leading-relaxed whitespace-pre-line">
                    {slide?.imageStyle ?? "（無視覺方向 brief）"}
                  </p>
                </div>

                {/* Step 1 → Step 2 transition */}
                {imageStep === "brief" && slide?.imageStyle && !slide.imageUrl && (
                  <Button
                    size="sm"
                    className="w-full font-semibold"
                    style={{ background: tierAccent(pageTier), color: "white" }}
                    onPress={() => {
                      setEditablePrompt(slide.imageStyle ?? "");
                      setImageStep("prompt");
                    }}
                    endContent={<FontAwesomeIcon icon={faChevronRight} />}
                  >
                    下一步：產出 AI 指令
                  </Button>
                )}

                {/* Step 2: AI prompt confirmation + model selection + generate */}
                {imageStep === "prompt" && (
                  <>
                    <div className="rounded-xl border border-default-200 bg-default-50 p-3">
                      <p className="text-[10px] font-semibold text-default-500 mb-1 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center" style={{ background: tierAccent(pageTier) }}>2</span>
                        確認 / 編輯 AI 指令
                      </p>
                      <Textarea
                        value={editablePrompt}
                        onValueChange={setEditablePrompt}
                        minRows={4}
                        maxRows={8}
                        classNames={{ input: "text-tiny leading-relaxed" }}
                      />
                    </div>
                    <div className="rounded-xl border border-default-200 bg-default-50 p-3 space-y-2">
                      <p className="text-[10px] font-semibold text-default-500 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center" style={{ background: tierAccent(pageTier) }}>3</span>
                        選擇 AI 模型
                      </p>
                      <select
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value as any)}
                        className="w-full text-tiny border border-default-200 rounded-md px-2 py-1.5 bg-white"
                      >
                        <option value="piapi/flux-schnell">⚡ Flux Schnell（快、便宜）</option>
                        <option value="piapi/flux-pro">✨ Flux Pro（高品質）</option>
                        <option value="openai/gpt-image-1">🧠 GPT Image 1（OpenAI）</option>
                        <option value="google/imagen-3">🌈 Imagen 3（Google）</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        className="flex-1"
                        onPress={() => setImageStep("brief")}
                        isDisabled={imageGenStatus === "generating"}
                      >
                        ‹ 上一步
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 font-semibold"
                        style={{ background: tierAccent(pageTier), color: "white" }}
                        startContent={<FontAwesomeIcon icon={faImage} />}
                        onPress={handleInlineImageGen}
                        isLoading={imageGenStatus === "generating"}
                        isDisabled={imageGenStatus === "generating"}
                      >
                        {imageGenStatus === "generating" ? "生成中…" : "生成"}
                      </Button>
                    </div>
                    {/* Inline result — image appears here when ready, no popup */}
                    {imageGenStatus === "ready" && imageOverrides[idx] && (
                      <div className="rounded-xl border border-success-200 bg-success-50 p-3 space-y-2">
                        <p className="text-tiny font-semibold text-success-700">✓ 已套用到 mockup</p>
                        <img
                          src={imageOverrides[idx]}
                          alt="generated"
                          className="w-full rounded-lg shadow-sm"
                        />
                        <Button
                          size="sm"
                          variant="flat"
                          className="w-full"
                          onPress={handleInlineImageGen}
                          startContent={<FontAwesomeIcon icon={faRotateRight} />}
                        >
                          再生一張
                        </Button>
                      </div>
                    )}
                    {imageGenStatus === "generating" && (
                      <div className="rounded-xl border border-default-200 bg-default-50 p-3 flex items-center gap-2">
                        <Spinner size="sm" />
                        <span className="text-tiny text-default-600">{imageModel.includes("flux-pro") ? "Flux Pro 生圖中（10-15 秒）…" : "生圖中（5-10 秒）…"}</span>
                      </div>
                    )}
                    {imageGenStatus === "failed" && (
                      <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-tiny text-warning-800">
                        ✗ 生成失敗：{imageGenError}
                      </div>
                    )}
                  </>
                )}

                {slide?.imageUrl && imageGenStatus === "idle" && (
                  <p className="text-tiny text-success-600">✓ 此版本已有真生圖</p>
                )}
              </div>
            )}

            {/* (Old AGENTS slide-out panel removed — agents are now inline in
                the floating toolbar. Click any agent avatar in toolbar →
                popover shows what that agent did.) */}

            {/* VIDEO panel — same 3-step flow as image gen */}
            {activeTool === "video" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-default-200 bg-default-50 p-3">
                  <p className="text-[10px] font-semibold text-default-500 mb-1 flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-default-200 text-default-700 text-[9px] flex items-center justify-center">1</span>
                    影片風格建議
                  </p>
                  <p className="text-tiny text-default-800 leading-relaxed whitespace-pre-line">
                    {(output as any)?.video_style_direction?.summary ?? slide?.imageStyle ?? "（沒有 video brief，會用 image brief 當基礎）"}
                  </p>
                </div>
                {videoStep === "brief" && (
                  <Button
                    size="sm"
                    className="w-full font-semibold"
                    style={{ background: tierAccent(pageTier), color: "white" }}
                    onPress={() => {
                      setEditableVideoPrompt(((output as any)?.video_style_direction?.summary ?? slide?.imageStyle) ?? "");
                      setVideoStep("prompt");
                    }}
                    endContent={<FontAwesomeIcon icon={faChevronRight} />}
                  >
                    下一步：產出 AI 指令
                  </Button>
                )}
                {videoStep === "prompt" && (
                  <>
                    <div className="rounded-xl border border-default-200 bg-default-50 p-3">
                      <p className="text-[10px] font-semibold text-default-500 mb-1 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center" style={{ background: tierAccent(pageTier) }}>2</span>
                        確認 / 編輯影片 AI 指令
                      </p>
                      <Textarea
                        value={editableVideoPrompt}
                        onValueChange={setEditableVideoPrompt}
                        minRows={4}
                        maxRows={8}
                        classNames={{ input: "text-tiny leading-relaxed" }}
                      />
                    </div>
                    <div className="rounded-xl border border-default-200 bg-default-50 p-3 space-y-2">
                      <p className="text-[10px] font-semibold text-default-500 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center" style={{ background: tierAccent(pageTier) }}>3</span>
                        選擇 AI 模型
                      </p>
                      <select
                        value={videoModel}
                        onChange={(e) => setVideoModel(e.target.value as any)}
                        className="w-full text-tiny border border-default-200 rounded-md px-2 py-1.5 bg-white"
                      >
                        <option value="hailuo/t2v">⚡ Hailuo T2V（快、便宜）</option>
                        <option value="piapi/kling-v2-master">✨ Kling v2 Master（高品質）</option>
                      </select>
                      <p className="text-[10px] text-default-400">影片產生需 60-180 秒，會在背景跑</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="flat" className="flex-1"
                        onPress={() => setVideoStep("brief")}
                        isDisabled={videoGenStatus === "generating"}>
                        ‹ 上一步
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 font-semibold"
                        style={{ background: tierAccent(pageTier), color: "white" }}
                        startContent={<FontAwesomeIcon icon={faFilm} />}
                        onPress={handleInlineVideoGen}
                        isLoading={videoGenStatus === "generating"}
                        isDisabled={videoGenStatus === "generating"}
                      >
                        {videoGenStatus === "generating" ? "生成中…" : "生成影片"}
                      </Button>
                    </div>
                    {/* Inline video result */}
                    {videoGenStatus === "ready" && generatedVideoUrl && (
                      <div className="rounded-xl border border-success-200 bg-success-50 p-3 space-y-2">
                        <p className="text-tiny font-semibold text-success-700">✓ 影片完成</p>
                        <video
                          src={generatedVideoUrl}
                          controls
                          className="w-full rounded-lg shadow-sm"
                        />
                        <Button
                          size="sm"
                          variant="flat"
                          className="w-full"
                          onPress={handleInlineVideoGen}
                          startContent={<FontAwesomeIcon icon={faRotateRight} />}
                        >
                          再生一支
                        </Button>
                      </div>
                    )}
                    {videoGenStatus === "generating" && (
                      <div className="rounded-xl border border-default-200 bg-default-50 p-3 flex items-center gap-2">
                        <Spinner size="sm" />
                        <span className="text-tiny text-default-600">影片生成中（60-180 秒）…</span>
                      </div>
                    )}
                    {videoGenStatus === "submitted" && (
                      <div className="rounded-xl border border-default-200 bg-default-50 p-3 text-tiny text-default-700">
                        ⏳ 影片已提交，背景生成中（{videoModel.includes("kling") ? "120-180" : "60-90"} 秒）
                        <p className="text-[10px] text-default-400 mt-1">{videoGenError}</p>
                      </div>
                    )}
                    {videoGenStatus === "failed" && (
                      <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-tiny text-warning-800">
                        ✗ 生成失敗：{videoGenError}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* CHAT panel — AI 對話迭代調整文案（取代換語氣） */}
            {activeTool === "chat" && (
              <div className="space-y-2 flex flex-col" style={{ minHeight: 320 }}>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: 380 }}>
                  {chatHistory.length === 0 && (
                    <div className="rounded-xl bg-default-50 p-3 text-tiny text-default-700 leading-relaxed">
                      <p className="font-semibold mb-1">{agentMeta?.name ?? "Aiden Hsu"}：</p>
                      <p>目前的文案已經寫好（看左邊 mockup）。告訴我你想怎麼調整？例如：</p>
                      <ul className="mt-1.5 space-y-0.5 text-[11px] text-default-600 list-disc list-inside">
                        <li>「希望更年輕、學生族群一點」</li>
                        <li>「把第二段刪掉，太囉嗦」</li>
                        <li>「加入媽媽節情緒」</li>
                        <li>「結尾的 CTA 改成限時優惠」</li>
                      </ul>
                    </div>
                  )}
                  {chatHistory.map((m, i) => (
                    <div key={i} className={`rounded-xl p-2.5 text-tiny leading-relaxed ${
                      m.role === "user"
                        ? "ml-6 bg-primary-50 text-default-800"
                        : "mr-2 bg-default-50"
                    }`}>
                      {m.role === "assistant" && (
                        <p className="text-[10px] font-semibold text-default-500 mb-1">{agentMeta?.name ?? "AI"}：</p>
                      )}
                      <p className="whitespace-pre-line">{m.content}</p>
                      {m.rewritten && (
                        <>
                          <div className="mt-2 p-2 bg-white rounded-md border border-default-200">
                            <p className="text-[10px] font-semibold text-default-500 mb-1">改寫後：</p>
                            <p className="text-default-800 whitespace-pre-line text-[11px]">{m.rewritten}</p>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              className="flex-1 text-tiny font-semibold"
                              style={{ background: tierAccent(pageTier), color: "white" }}
                              onPress={() => {
                                setEdits((e) => ({ ...e, [idx]: m.rewritten! }));
                              }}
                            >
                              ✓ 採用這版
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {chatBusy && (
                    <div className="rounded-xl bg-default-50 p-2.5 text-tiny text-default-500 italic">
                      {agentMeta?.name ?? "AI"} 思考中…
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2 border-t border-default-100">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                    placeholder="說明你想怎麼改…"
                    className="flex-1 text-tiny border border-default-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-primary-400"
                    disabled={chatBusy}
                  />
                  <Button
                    size="sm"
                    onPress={handleChatSend}
                    isDisabled={!chatInput.trim() || chatBusy}
                    style={{ background: tierAccent(pageTier), color: "white" }}
                  >
                    送出
                  </Button>
                </div>
              </div>
            )}

            {/* SAVE panel — pick a project to attach this output */}
            {activeTool === "save" && (
              <SavePanel
                slide={slide}
                pageTier={pageTier}
                accent={tierAccent(pageTier)}
                brandId={brandId}
                onClose={() => setActiveTool(null)}
              />
            )}

            {/* PROMPT panel — show what was sent to LLM */}
            {activeTool === "prompt" && (
              <div className="rounded-xl border border-default-200 bg-default-50 p-3 space-y-2">
                <p className="text-[10px] text-default-500 mb-1">視覺方向（會送進 AI 生圖）</p>
                <p className="text-tiny text-default-800 leading-relaxed whitespace-pre-line border-l-2 border-default-300 pl-2">
                  {slide?.imageStyle ?? "（這個任務沒有 visual brief）"}
                </p>
                {slide?.hashtags && slide.hashtags.length > 0 && (
                  <>
                    <p className="text-[10px] text-default-500 mt-3 mb-1">推薦 hashtag</p>
                    <p className="text-tiny text-primary-700">
                      {slide.hashtags.map((h: string) => `#${h}`).join(" ")}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* DETAILS panel — QA + Production package + Agent collab */}
            {activeTool === "details" && (
              <div className="space-y-2">
                {slide?.qa && slide.qa.comment && (
                  <div className={`rounded-xl border p-3 ${
                    slide.qa.status === "pass" ? "border-success-200 bg-success-50" : "border-warning-200 bg-warning-50"
                  }`}>
                    <div className="flex items-center gap-2 text-tiny font-semibold mb-1">
                      <span>{slide.qa.status === "pass" ? "✓" : "⚠"}</span>
                      <span>QA: Jordan Hayes</span>
                      {typeof slide.qa.score === "number" && (
                        <span className="ml-auto tabular-nums">{Math.round(slide.qa.score)}/100</span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-default-700">{slide.qa.comment}</p>
                    {slide.qa.suggestions && slide.qa.suggestions.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-[10px] text-default-600">
                        {slide.qa.suggestions.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    )}
                  </div>
                )}
                {slide?.extras && (slide.extras.postingTime || slide.extras.replyTemplates?.length || slide.extras.followupPost || slide.extras.compareTable || slide.extras.timingAdvice || slide.extras.legalCheck) && (
                  <div className="rounded-xl border border-default-200 bg-white p-3 space-y-2 text-tiny">
                    <p className="font-semibold flex items-center gap-1.5"><span>📦</span> Production package</p>
                    {slide.extras.postingTime && (
                      <p><span className="text-default-500">⏰ 發文時段：</span><span className="text-default-800">{slide.extras.postingTime}</span></p>
                    )}
                    {slide.extras.followupPost && (
                      <div>
                        <p className="text-default-500">📅 24h 跟進：</p>
                        <p className="text-default-800 whitespace-pre-line leading-relaxed">{slide.extras.followupPost}</p>
                      </div>
                    )}
                    {slide.extras.replyTemplates && slide.extras.replyTemplates.length > 0 && (
                      <div>
                        <p className="text-default-500 mb-1">💬 留言模板（{slide.extras.replyTemplates.length} 組）</p>
                        <div className="space-y-1 pl-2 border-l-2 border-default-200">
                          {slide.extras.replyTemplates.slice(0, 5).map((rt, i) => (
                            <div key={i}>
                              <p className="text-default-500 text-[10px]">用戶：{rt.userSays}</p>
                              <p className="text-default-800 text-[10px]">你回：{rt.yourReply}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {slide.extras.compareTable && (
                      <div className="border-t border-default-100 pt-2">
                        <p className="text-default-500 mb-1">🔁 爆款對照</p>
                        <p className="text-default-800 whitespace-pre-line text-[10px]">{slide.extras.compareTable}</p>
                      </div>
                    )}
                    {slide.extras.timingAdvice && (
                      <div className="border-t border-default-100 pt-2">
                        <p className="text-default-500 mb-1">⏱ 時效性</p>
                        <p className="text-default-800 whitespace-pre-line text-[10px]">{slide.extras.timingAdvice}</p>
                      </div>
                    )}
                    {slide.extras.legalCheck && (
                      <div className="border-t border-default-100 pt-2">
                        <p className="text-default-500 mb-1">⚖ 法務檢核</p>
                        <p className="text-default-800 whitespace-pre-line text-[10px]">{slide.extras.legalCheck}</p>
                      </div>
                    )}
                  </div>
                )}
                {orchestraStages && orchestraStages.length > 0 && (
                  <div className="rounded-xl border border-default-200 bg-white p-3">
                    <p className="text-tiny font-semibold mb-2">🎼 Agent 協作 ({doneStages}/{stageCount})</p>
                    <StagePipelineView
                      stages={orchestraStages}
                      captionAgent={agentMeta}
                      imageAgent={imageAgentMeta}
                      tier={pageTier}
                    />
                  </div>
                )}
                {fetchedUrl && (
                  <div className="rounded-xl border border-default-200 bg-white p-3 text-tiny">
                    <p className="font-semibold mb-1">🔗 已讀連結</p>
                    <a href={fetchedUrl.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline break-all text-[10px]">
                      {fetchedUrl.title ?? fetchedUrl.url}
                    </a>
                    <p className="text-default-400 text-[10px] mt-1">{fetchedUrl.chars.toLocaleString()} 字</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* (Bottom thumbnail strip removed per CJ — variant switching now lives
          on the chevrons themselves with the variant name displayed inline.) */}

      {/* MediaGenFlow modal removed — image / video gen is now inline in the
          right panel (Step 3 of 🖼/🎬 tool flow). No more popup. */}

      {/* FB avatar picker — minimal modal that triggers brand.fetchFacebookAvatar */}
      <Modal isOpen={fbLogoModalOpen} onClose={() => setFbLogoModalOpen(false)} size="md" backdrop="blur">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <p className="font-semibold">從 FB 粉專抓 logo</p>
            <p className="text-tiny text-default-500 font-normal">
              貼上你 FB 粉專網址，系統會抓回頭像存進「{brandName ?? "品牌"}」。
            </p>
          </ModalHeader>
          <ModalBody>
            <Input
              autoFocus
              size="sm"
              placeholder="https://www.facebook.com/桂冠營養研究室"
              value={fbHandle}
              onValueChange={setFbHandle}
              startContent={<FontAwesomeIcon icon={faFacebookF} className="text-default-400" />}
              isDisabled={fbBusy}
            />
            <p className="text-tiny text-default-400">
              也接受純 handle（例：<code>桂冠營養研究室</code>）。粉專必須是公開的。
            </p>
            {fbErr && (
              <p className="text-tiny text-danger-600 mt-1">{fbErr}</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setFbLogoModalOpen(false)} isDisabled={fbBusy}>取消</Button>
            <Button color="primary" onPress={onSubmitFbHandle} isLoading={fbBusy}>
              抓取
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {errorMsg && (
        <Card className="bg-warning-50 border border-warning-200">
          <CardBody className="text-warning-800 text-tiny">{errorMsg}</CardBody>
        </Card>
      )}
    </div>
  );
}

