/**
 * StagePipelineView — 60s/100s tier orchestration theater.
 *
 * Renders the orchestra `stages` array as a visible 5-card pipeline.
 * Each card shows: agent avatar + role + status pill + elapsed time +
 * **streaming "thinking" lines** that rotate while running.
 *
 * The QA card cycles through specific verification items (caption length /
 * agent leak / brand voice / image quality / package coherence) so the
 * user sees what's actually being checked.
 */
import React, { useEffect, useState } from "react";
import { Avatar } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenNib, faPalette, faComments, faShieldHalved, faMagnifyingGlassChart, faSitemap, faGavel } from "@fortawesome/free-solid-svg-icons";
import { useLang } from "../../../lib/i18n";

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=4267B2&backgroundType=solid`;

interface StageInfo {
  key: string;
  startedAt: number;
  completedAt?: number;
  status: "pending" | "running" | "done" | "failed";
  label: string;
}

interface AgentSlot {
  stageKey: string;
  role: string;
  agentName: string;
  agentTitle?: string;
  icon: any;
  /** Rotating thinking lines shown while status="running". Cycles every 2s. */
  thinking: string[];
  /** What appears in "已完成" state — single line summary */
  doneText: string;
}

const PIPELINE_AGENTS: AgentSlot[] = [
  {
    stageKey: "scout",
    role: "Scout",
    agentName: "Perplexity Scout",
    agentTitle: "🔬 真實爆款數據爬取",
    icon: faMagnifyingGlassChart,
    thinking: [
      "🌐 連到 Tavily / Perplexity API…",
      "🔍 搜尋近 30 天該通路 viral 貼文…",
      "📊 抓取 5-10 篇高互動文章原文…",
      "🧬 比對 hook 結構與情緒節奏…",
      "📈 萃取共通成功模式（數字/反差/問句）…",
      "📋 整理成研究筆記，注入文案撰寫師…",
    ],
    doneText: "✓ 真實抓到 N 個爆款結構，已注入後續 agents",
  },
  {
    stageKey: "strategist",
    role: "Strategist",
    agentName: "Strategist",
    agentTitle: "規劃整體敘事弧",
    icon: faSitemap,
    thinking: [
      "分析任務需求與品牌語氣…",
      "規劃多篇之間的敘事結構…",
      "設計每一篇的角色定位…",
      "寫下勾連邏輯給後續寫手…",
    ],
    doneText: "✓ 已完成系列敘事弧錨點",
  },
  {
    stageKey: "caption",
    role: "文案撰寫師",
    agentName: "文案撰寫師",
    icon: faPenNib,
    thinking: [
      "讀取品牌語氣 + URL 內容…",
      "擬出第一個版本的開場鉤…",
      "並行寫 5 種口吻版本…",
      "每個版本各自重試確認品質…",
      "檢查不要洩漏 AI 自介…",
    ],
    doneText: "✓ 5 個文案版本完成（各自重試過）",
  },
  {
    stageKey: "brief",
    role: "視覺指導",
    agentName: "視覺指導",
    icon: faPalette,
    thinking: [
      "讀取文案主題，抓視覺方向…",
      "決定構圖、光線、色調…",
      "並行寫 5 條視覺指引…",
      "送 Flux Schnell 跑真實生圖…",
    ],
    doneText: "✓ 5 條視覺指引 + 真實 Flux 圖完成",
  },
  {
    stageKey: "extras",
    role: "Production Package",
    agentName: "Emma × Helen × David × Sophie",
    agentTitle: "hashtag / reply / schedule / followup",
    icon: faComments,
    thinking: [
      "Emma：根據主題挑 hashtag 分層…",
      "Helen：預測 5 種留言並寫品牌回覆…",
      "David：分析最佳發文時段…",
      "Sophie：草擬 24h 跟進貼文…",
      "（4 人並行進行中）",
    ],
    doneText: "✓ Hashtag / 5 組留言模板 / 發文時段 / 跟進貼文 完成",
  },
  {
    stageKey: "specialty",
    role: "Specialty Role",
    agentName: "Specialty",
    agentTitle: "Compare / Timing / Legal",
    icon: faGavel,
    thinking: [
      "讀取改寫版 vs 原版…",
      "進行專業檢核（對照 / 時效 / 法務）…",
      "輸出檢核報告…",
    ],
    doneText: "✓ 專業檢核完成",
  },
  {
    stageKey: "qa",
    role: "QA Reviewer",
    agentName: "Jordan Hayes",
    agentTitle: "AI 品牌故事 CMO",
    icon: faShieldHalved,
    thinking: [
      "正在審核：文案字數是否合規…",
      "正在審核：是否洩漏 AI 自介…",
      "正在審核：品牌語氣一致性…",
      "正在審核：視覺指引與文案是否互相呼應…",
      "正在審核：留言模板覆蓋度…",
      "正在審核：發文時段建議是否合理…",
      "正在生成最終 QA 報告…",
    ],
    doneText: "✓ 所有版本審核完成（通過 / 標記 各別標記）",
  },
];

function statusColor(s: StageInfo["status"]): string {
  return s === "done" ? "text-success-700 bg-success-50 border-success-200"
    : s === "failed" ? "text-danger-700 bg-danger-50 border-danger-200"
    : s === "running" ? "text-warning-700 bg-warning-50 border-warning-200"
    : "text-default-500 bg-default-50 border-default-200";
}

function statusLabel(s: StageInfo["status"], lang: "zh-TW" | "en"): string {
  if (lang === "en") {
    return s === "done" ? "✓ Done"
      : s === "failed" ? "✗ Failed"
      : s === "running" ? "⋯ Running"
      : "○ Standby";
  }
  return s === "done" ? "✓ 完成"
    : s === "failed" ? "✗ 失敗"
    : s === "running" ? "⋯ 進行中"
    : "○ 待命";
}

/** Hook: rotates an index every 2s (for cycling through thinking lines). */
function useRotatingIndex(arrayLen: number, intervalMs = 2000): number {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (arrayLen <= 1) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % arrayLen), intervalMs);
    return () => window.clearInterval(id);
  }, [arrayLen, intervalMs]);
  return idx;
}

function StageCard({
  slot,
  stage,
  realAgent,
}: {
  slot: AgentSlot;
  stage: StageInfo;
  realAgent: { id: number; name: string; title: string; avatarUrl: string | null } | null;
}) {
  const { lang } = useLang();
  const thinkingIdx = useRotatingIndex(slot.thinking.length, 2200);
  const elapsed =
    stage.completedAt != null
      ? `${(stage.completedAt / 1000).toFixed(1)}s`
      : stage.status === "running"
        ? `${Math.round((Date.now() - stage.startedAt) / 1000)}s…`
        : "";

  const displayName = realAgent?.name ?? slot.agentName;
  const displayTitle = realAgent?.title ?? slot.agentTitle ?? slot.role;
  const avatarSrc = realAgent?.avatarUrl || dicebear(displayName);

  // What text shows below: rotating thinking line (running) / done summary / static description
  const liveLine =
    stage.status === "running" ? slot.thinking[thinkingIdx]
    : stage.status === "done" ? slot.doneText
    : stage.status === "failed" ? (lang === "en" ? "Stage failed — check error message" : "此階段失敗 — 請看錯誤訊息")
    : (lang === "en" ? "Waiting for previous stage…" : "等待上一階段完成…");

  return (
    <div className={`border rounded-medium p-3 ${statusColor(stage.status)} transition-colors`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="relative">
          <Avatar src={avatarSrc} size="sm" className={`w-9 h-9 ${stage.status === "running" ? "ring-2 ring-warning-300 animate-pulse" : ""}`} />
          {stage.status === "running" && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-warning-500 ring-2 ring-white animate-pulse" />
          )}
          {stage.status === "done" && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success-500 ring-2 ring-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-tiny font-semibold truncate text-default-800">{displayName}</p>
          <p className="text-[10px] text-default-500 truncate">{displayTitle}</p>
        </div>
        <FontAwesomeIcon icon={slot.icon} className="text-default-400 text-tiny" />
      </div>
      <div className="flex items-center justify-between text-[10px] mb-1.5">
        <span className="font-medium">{statusLabel(stage.status, lang)}</span>
        <span className="tabular-nums opacity-70">{elapsed}</span>
      </div>
      {/* Live "thinking" / status text — animates while running */}
      <div className={`text-[11px] leading-snug min-h-[2.5rem] ${stage.status === "running" ? "text-default-700" : stage.status === "done" ? "text-success-700" : "text-default-400"}`}>
        {stage.status === "running" && (
          <span className="inline-block w-1 h-1 rounded-full bg-warning-500 mr-1 animate-pulse" />
        )}
        {liveLine}
      </div>
    </div>
  );
}

export function StagePipelineView({
  stages,
  captionAgent,
  imageAgent,
  tier,
}: {
  stages: StageInfo[] | null | undefined;
  captionAgent?: { id: number; name: string; title: string; avatarUrl: string | null } | null;
  imageAgent?: { id: number; name: string; title: string; avatarUrl: string | null } | null;
  tier: "30s" | "60s" | "99s";
}) {
  const { lang } = useLang();
  if (!stages || stages.length === 0) return null;

  const byKey: Record<string, StageInfo> = {};
  for (const s of stages) byKey[s.key] = s;

  // Show all slots that have a stage (preserving PIPELINE_AGENTS order)
  const visibleSlots = PIPELINE_AGENTS.filter((slot) => byKey[slot.stageKey]);
  if (visibleSlots.length === 0) return null;

  // Force a re-render every second so "elapsed" + thinking rotation stay live
  const [, force] = useState(0);
  useEffect(() => {
    const hasRunning = stages.some((s) => s.status === "running");
    if (!hasRunning) return;
    const id = window.setInterval(() => force((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [stages]);

  const completedCount = visibleSlots.filter((s) => byKey[s.stageKey]?.status === "done").length;

  return (
    <div className="border border-default-200 rounded-medium bg-default-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-default-200 flex items-center justify-between">
        <p className="text-tiny font-semibold text-default-700">
          {lang === "en" ? `🎼 Multi-agent collab · ${tier}` : `🎼 多 AI 專家協作 · ${tier}`}
        </p>
        <p className="text-[10px] text-default-500 tabular-nums">
          {completedCount} / {visibleSlots.length} {lang === "en" ? "done" : "完成"}
        </p>
      </div>

      <div className="p-3 flex flex-col gap-2">
        {visibleSlots.map((slot) => {
          const stage = byKey[slot.stageKey]!;
          const isCaption = slot.stageKey === "caption";
          const isImage = slot.stageKey === "brief";
          const realAgent = isCaption ? captionAgent ?? null : isImage ? imageAgent ?? null : null;
          return (
            <StageCard
              key={slot.stageKey}
              slot={slot}
              stage={stage}
              realAgent={realAgent}
            />
          );
        })}
      </div>
    </div>
  );
}
