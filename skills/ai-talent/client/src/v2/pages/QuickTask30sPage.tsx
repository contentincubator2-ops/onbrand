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
import MediaGenFlow from "../components/media/MediaGenFlow";
import { StagePipelineView } from "../components/quickTask/StagePipelineView";
import { faPalette, faPenNib, faFilm, faWandMagicSparkles, faSliders, faTerminal, faImage } from "@fortawesome/free-solid-svg-icons";

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

export default function QuickTask30sPage({ tier = "30s" }: { tier?: Tier }) {
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

  return (
    <div>
      {/* ─── HERO (tier-distinct, immediately differentiable) ─────────────── */}
      <div
        className="relative pt-14 pb-10 px-6 text-center"
        style={{ background: `linear-gradient(180deg, ${tierHero.gradientFrom} 0%, transparent 100%)` }}
      >
        <div className="inline-flex items-center gap-2 mb-3">
          <span
            className="text-[10px] font-bold tracking-[0.2em] uppercase px-3 py-1 rounded-full text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${tierHero.accent}, ${tierHero.accent}cc)` }}
          >
            {tierHero.kicker} · {tierLabel.toUpperCase()}
          </span>
        </div>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3 leading-tight">
          <span className="text-3xl md:text-4xl mr-2">{tierHero.emoji}</span>
          <span style={{ background: `linear-gradient(135deg, ${tierHero.accent} 0%, ${tierHero.accent}aa 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {tierHero.headline}
          </span>
        </h1>
        <p className="text-default-600 text-medium md:text-large mb-4 max-w-3xl mx-auto leading-relaxed">
          {tierHero.sub}
        </p>
        {/* Per-tier feature bullets */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
          {tierHero.bullets.map((b) => (
            <span
              key={b}
              className="text-tiny px-3 py-1 rounded-full font-medium"
              style={{ background: `${tierHero.accent}15`, color: tierHero.accent, border: `1px solid ${tierHero.accent}30` }}
            >
              {b}
            </span>
          ))}
        </div>
        <p className="text-default-500 text-tiny">
          {tasksThisTier.length} 個 {tierLabel} 任務 ·{" "}
          {new Set(tasksThisTier.map((t) => t.agent_id).filter(Boolean)).size} 位專屬 Agent · 品牌腦：
          <span className="font-medium text-default-700">{brandName ?? "（未選）"}</span>
        </p>

        {/* Search bar */}
        <div className="max-w-[640px] mx-auto mt-8">
          <Input
            size="lg"
            radius="full"
            placeholder={`搜尋 ${tierLabel} 任務、Agent 或 skill...`}
            value={searchQuery}
            onValueChange={setSearchQuery}
            startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400" />}
            classNames={{
              inputWrapper: "bg-white shadow-md border border-default-100 h-14",
              input: "text-medium",
            }}
          />
        </div>

        {/* Channel icon row (mirrors MissionsHome QUICK_TILES) */}
        <div className="max-w-[800px] mx-auto mt-8 grid grid-cols-5 md:grid-cols-10 gap-3">
          {CHANNEL_TILES.map((c) => {
            const active = channel === c.id;
            const disabled = !c.enabled;
            return (
              <button
                key={c.id}
                onClick={() => c.enabled && setChannel(c.id)}
                disabled={disabled}
                className={`flex flex-col items-center gap-1.5 transition ${disabled ? "opacity-30 cursor-not-allowed" : "hover:scale-105 cursor-pointer"}`}
              >
                <div
                  className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-white shadow-sm ${active ? "ring-4 ring-primary-200" : ""}`}
                  style={{ background: c.bg }}
                >
                  <FontAwesomeIcon icon={c.icon} className="text-lg md:text-xl" />
                </div>
                <span className={`text-tiny ${active ? "font-semibold text-default-900" : "text-default-600"}`}>
                  {c.label}
                </span>
              </button>
            );
          })}
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
          body: "py-2 px-3",
          footer: "border-t border-default-200 bg-white sticky bottom-0 py-2",
          header: "py-2",
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
                      isDisabled={running || (activeTask.kind === "squad")}
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

/* ──────────────────────────── Output Carousel ────────────────────────────
 * Each variant becomes its own complete mockup. Left/right chevrons swap
 * between them. Style direction shows INSIDE each mockup's image slot.
 *
 * If output has 0 variants (just top-level caption), shows a single mockup.
 */
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
  type ToolKind = null | "edit" | "style" | "video" | "details" | "prompt";
  const [activeTool, setActiveTool] = useState<ToolKind>(null);
  const stageCount = orchestraStages?.length ?? 0;
  const doneStages = orchestraStages?.filter((s: any) => s.status === "done").length ?? 0;
  const hasDetails = !!(slide?.qa?.comment || slide?.extras || (orchestraStages && orchestraStages.length > 0) || fetchedUrl);
  const toggleTool = (t: ToolKind) => setActiveTool((cur) => (cur === t ? null : t));

  // Tool rail button — icon-only, Canva-style. Active = tier-color gradient.
  const ToolBtn = ({ icon, label, active, onPress, disabled }: { icon: any; label: string; active?: boolean; onPress: () => void; disabled?: boolean }) => (
    <button
      onClick={onPress}
      disabled={disabled}
      title={label}
      className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center transition relative ${
        disabled ? "opacity-30 cursor-not-allowed"
          : active ? "shadow-md text-white scale-105"
          : "bg-default-50 text-default-600 hover:bg-default-100 hover:scale-105"
      }`}
      style={active && !disabled ? { background: `linear-gradient(135deg, ${tierAccent(pageTier)}, ${tierAccent(pageTier)}cc)` } : undefined}
    >
      <FontAwesomeIcon icon={icon} className="text-medium" />
    </button>
  );

  return (
    <div className="space-y-2">
      {/* Minimal info strip — single muted line, latency + agents only */}
      <div className="flex items-center gap-2 text-[10px] text-default-400 px-1">
        {latencyMs != null && (
          <span className="tabular-nums">{(latencyMs / 1000).toFixed(1)}s</span>
        )}
        {agentMeta && (
          <>
            <Avatar src={agentMeta.avatarUrl || dicebear(agentMeta.name)} size="sm" className="w-3.5 h-3.5" />
            <span>{agentMeta.name}</span>
          </>
        )}
        {imageAgentMeta && (
          <>
            <span>+</span>
            <Avatar src={imageAgentMeta.avatarUrl || dicebear(imageAgentMeta.name)} size="sm" className="w-3.5 h-3.5" />
            <span>{imageAgentMeta.name}</span>
          </>
        )}
        {orchestraStages && orchestraStages.length > 0 && pageTier !== "30s" && (
          <span className="ml-auto">{doneStages}/{stageCount} agents · 點 📊 看細節</span>
        )}
      </div>

      {!slide.caption && (
        <Card className="bg-warning-50 border border-warning-200">
          <CardBody className="text-warning-800 text-tiny py-2 px-3">
            這個版本（{slide.label}）LLM 沒生出文字，先看其他版本，或按「重做」。
          </CardBody>
        </Card>
      )}

      {/* ═══ CANVA TOP TOOLBAR — horizontal icon row above the asset ═══ */}
      <div className="flex items-center gap-1 px-1 py-1 border-b border-default-100">
        {slide?.caption && (
          <ToolBtn icon={faPenNib} label="編輯文案" active={activeTool === "edit"} onPress={() => toggleTool("edit")} />
        )}
        <ToolBtn icon={faImage} label="AI 生圖" active={activeTool === "style"}
          disabled={!slide?.imageStyle} onPress={() => toggleTool("style")} />
        <ToolBtn icon={faFilm} label="AI 生影片（即將推出）" active={activeTool === "video"}
          disabled onPress={() => toggleTool("video")} />
        <ToolBtn icon={faWandMagicSparkles} label="AI prompt / 視覺方向" active={activeTool === "prompt"}
          disabled={!slide?.imageStyle} onPress={() => toggleTool("prompt")} />
        <ToolBtn icon={faSliders} label="細節" active={activeTool === "details"}
          disabled={!hasDetails} onPress={() => toggleTool("details")} />
        <span className="w-px h-6 bg-default-200 mx-1" />
        <ToolBtn icon={faFolderPlus} label="加到專案"
          onPress={() => window.alert("「加到專案」功能將串到 ProjectsPage — 之後接好。")} />
        <ToolBtn icon={faCompass} label="換個語氣"
          onPress={() => { window.location.href = "/brands"; }} />
        {/* Right side: latency + agents micro-info, very faint */}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-default-400 pr-1">
          {latencyMs != null && <span className="tabular-nums">{(latencyMs / 1000).toFixed(1)}s</span>}
          {agentMeta && (
            <>
              <Avatar src={agentMeta.avatarUrl || dicebear(agentMeta.name)} size="sm" className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{agentMeta.name}</span>
            </>
          )}
          {imageAgentMeta && (
            <>
              <span>+</span>
              <Avatar src={imageAgentMeta.avatarUrl || dicebear(imageAgentMeta.name)} size="sm" className="w-3.5 h-3.5" />
            </>
          )}
        </div>
      </div>

      {/* ═══ CANVA STAGE: huge mockup | optional right contextual panel ═══ */}
      <div className="flex gap-3 items-stretch">
        {/* ── CENTER STAGE: Mockup HUGE with side chevrons + floating pill ── */}
        <div className="flex-1 min-w-0 flex flex-col items-center">
          <div className="relative flex items-stretch gap-2">
            {total > 1 && (
              <button
                onClick={() => setIdx(Math.max(0, idx - 1))}
                disabled={idx === 0}
                className={`flex-shrink-0 w-10 sm:w-12 self-stretch flex items-center justify-center rounded-2xl transition ${
                  idx === 0 ? "opacity-20 cursor-not-allowed" : "bg-default-100 hover:bg-default-200 active:bg-default-300"
                }`}
                aria-label="上一個版本"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="text-default-700 text-medium" />
              </button>
            )}
            {/* Centered mockup with Canva-style soft frame + floating pill above */}
            <div className="flex-1 min-w-0 flex justify-center">
              {mockupVariant && (
                <div className="relative w-full max-w-[640px]">
                  {/* Floating action pill above mockup (Canva pattern) */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-white border border-default-200 rounded-full shadow-md px-1 py-0.5">
                    <button
                      onClick={() => toggleTool("edit")}
                      title="編輯這個版本"
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                        activeTool === "edit" ? "text-white" : "text-default-600 hover:bg-default-100"
                      }`}
                      style={activeTool === "edit" ? { background: tierAccent(pageTier) } : undefined}
                    >
                      <FontAwesomeIcon icon={faPenNib} className="text-tiny" />
                    </button>
                    <button
                      onClick={() => { if (slide?.caption) navigator.clipboard.writeText(slide.caption); }}
                      title="複製這版"
                      className="w-7 h-7 rounded-full flex items-center justify-center text-default-600 hover:bg-default-100 transition"
                    >
                      <FontAwesomeIcon icon={faClipboard} className="text-tiny" />
                    </button>
                    {slide?.imageStyle && !slide?.imageUrl && (
                      <button
                        onClick={() => setMediaGenOpen(true)}
                        title="用此風格 AI 生圖"
                        className="w-7 h-7 rounded-full flex items-center justify-center text-default-600 hover:bg-default-100 transition"
                      >
                        <FontAwesomeIcon icon={faPalette} className="text-tiny" />
                      </button>
                    )}
                    <span className="w-px h-4 bg-default-200" />
                    <button
                      onClick={() => toggleTool("details")}
                      title="細節"
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                        activeTool === "details" ? "text-white" : "text-default-500 hover:bg-default-100"
                      }`}
                      style={activeTool === "details" ? { background: tierAccent(pageTier) } : undefined}
                      disabled={!hasDetails}
                    >
                      <FontAwesomeIcon icon={faSliders} className="text-tiny" />
                    </button>
                  </div>
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "white",
                      boxShadow: `0 12px 40px -12px ${tierAccent(pageTier)}50, 0 0 0 1px ${tierAccent(pageTier)}25`,
                    }}
                  >
                  <PlatformMockup
                    variant={mockupVariant}
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
                className={`flex-shrink-0 w-10 sm:w-12 self-stretch flex items-center justify-center rounded-2xl transition ${
                  idx === total - 1 ? "opacity-20 cursor-not-allowed" : "bg-default-100 hover:bg-default-200 active:bg-default-300"
                }`}
                aria-label="下一個版本"
              >
                <FontAwesomeIcon icon={faChevronRight} className="text-default-700 text-medium" />
              </button>
            )}
          </div>

          {/* Active variant label (small, centered) */}
          {total > 1 && (
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="text-tiny font-semibold text-default-700">{slide.label}</span>
              {slide.qa && (
                <span
                  title={slide.qa.comment ?? ""}
                  className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${
                    slide.qa.status === "pass" ? "text-success-700 bg-success-50" : "text-warning-700 bg-warning-50"
                  }`}
                >
                  {slide.qa.status === "pass" ? "✓" : "⚠"}
                  {typeof slide.qa.score === "number" ? ` ${Math.round(slide.qa.score)}` : ""}
                </span>
              )}
              <span className="text-[10px] text-default-400 tabular-nums">
                {idx + 1} / {total}
              </span>
            </div>
          )}

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

          {/* Brand logo hint (when missing) */}
          {brandId && !brandLogoUrl && (
            <button
              onClick={() => setFbLogoModalOpen(true)}
              className="w-full flex items-center gap-2 text-tiny text-default-500 bg-default-50 hover:bg-default-100 transition border border-dashed border-default-300 rounded-2xl px-3 py-2"
            >
              <FontAwesomeIcon icon={faFacebookF} className="text-default-400" />
              <span className="flex-1 text-left">
                這個品牌還沒粉專頭像 — <span className="text-default-700 font-medium">點此一鍵抓取</span>
              </span>
              <FontAwesomeIcon icon={faChevronRight} className="text-default-400 text-[10px]" />
            </button>
          )}
        </div>

        {/* ── RIGHT CONTEXTUAL PANEL — slides in only when a tool is active ── */}
        {activeTool && activeTool !== "edit" && (
          <div className="w-72 shrink-0 max-h-[calc(92vh-220px)] overflow-y-auto pr-1 space-y-2 animate-in slide-in-from-right-2 fade-in duration-200">
            {/* Panel header with close button */}
            <div className="sticky top-0 bg-white pb-2 flex items-center justify-between border-b border-default-100 z-10">
              <span className="text-tiny font-bold tracking-wider uppercase" style={{ color: tierAccent(pageTier) }}>
                {activeTool === "style" && "🎨 視覺方向 + AI 生圖"}
                {activeTool === "video" && "🎬 AI 影片生成"}
                {activeTool === "prompt" && "🪄 AI Prompt"}
                {activeTool === "details" && "📊 細節資訊"}
              </span>
              <button onClick={() => setActiveTool(null)} className="text-default-400 hover:text-default-700">
                <FontAwesomeIcon icon={faXmark} className="text-tiny" />
              </button>
            </div>

            {/* STYLE panel — image style brief + 用此風格生圖 button */}
            {activeTool === "style" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-default-200 bg-default-50 p-3">
                  <p className="text-[10px] text-default-500 mb-1">當前 image style brief</p>
                  <p className="text-tiny text-default-800 leading-relaxed whitespace-pre-line">
                    {slide?.imageStyle ?? "（無視覺方向 brief）"}
                  </p>
                </div>
                {slide?.imageStyle && !slide.imageUrl && (
                  <Button
                    color="primary"
                    size="sm"
                    className="w-full font-semibold"
                    style={{ background: tierAccent(pageTier), color: "white" }}
                    startContent={<FontAwesomeIcon icon={faImage} />}
                    onPress={() => setMediaGenOpen(true)}
                  >
                    用此風格 AI 生圖（Flux）
                  </Button>
                )}
                {slide?.imageUrl && (
                  <p className="text-tiny text-success-600">✓ 此版本已有真生圖</p>
                )}
              </div>
            )}

            {/* VIDEO panel — phase 2 placeholder */}
            {activeTool === "video" && (
              <div className="rounded-xl border border-dashed border-default-300 bg-default-50 p-4 text-center">
                <FontAwesomeIcon icon={faFilm} className="text-3xl text-default-300 mb-2" />
                <p className="text-tiny text-default-500">AI 影片生成（Hailuo / Kling）</p>
                <p className="text-[10px] text-default-400 mt-1">Phase 2 啟用中</p>
              </div>
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

      {/* ═══ Canva-style bottom thumbnail strip (page nav) — always shown ═══ */}
      <div className="flex items-center justify-center gap-2 pt-2 pb-1 border-t border-default-100 overflow-x-auto">
        {slides.map((s, i) => {
          const active = i === idx;
          return (
            <button
              key={i}
              onClick={() => setIdx(i)}
              title={s.label}
              className={`flex-shrink-0 w-14 h-14 rounded-lg flex flex-col items-center justify-center font-bold transition relative ${
                active ? "shadow-md text-white scale-105" : "bg-default-100 text-default-600 hover:bg-default-200 hover:scale-105"
              }`}
              style={active ? {
                background: `linear-gradient(135deg, ${tierAccent(pageTier)}, ${tierAccent(pageTier)}cc)`,
              } : undefined}
            >
              <span className="text-medium leading-none">{i + 1}</span>
              {s.qa && (
                <span className="text-[8px] mt-0.5 opacity-90">
                  {s.qa.status === "pass" ? "✓" : "⚠"}
                </span>
              )}
            </button>
          );
        })}
        {/* [+] regenerate more — Canva "add page" pattern */}
        <button
          onClick={() => window.alert("「再生成多版」會重跑這個任務 — 暫時請按底部的「重做」")}
          title="再生成多版"
          className="flex-shrink-0 w-14 h-14 rounded-lg border-2 border-dashed border-default-300 text-default-400 hover:border-default-500 hover:text-default-600 transition flex items-center justify-center"
        >
          <span className="text-2xl leading-none">+</span>
        </button>
      </div>

      <MediaGenFlow
        open={mediaGenOpen}
        onClose={() => setMediaGenOpen(false)}
        kind="image"
        initialBrief={slide.imageStyle ?? ""}
        brandContext={brandName ?? undefined}
        brandId={brandId ?? undefined}
        onComplete={(r) => {
          // Auto-attach generated image to the active slide's mockup
          if (r?.url) {
            setImageOverrides((o) => ({ ...o, [idx]: r.url }));
            setMediaGenOpen(false); // close modal so user sees mockup updated
          }
        }}
      />

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

