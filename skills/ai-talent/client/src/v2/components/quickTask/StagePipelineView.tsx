/**
 * StagePipelineView — 60s/100s tier orchestration theater.
 *
 * Renders the orchestra `stages` array as a visible 4-stage pipeline:
 *   Stage 1 (parallel): Caption Writer + Image Director
 *   Stage 2 (parallel): Reply Writer + Scheduler + Followup Writer
 *   Stage 3:            QA Reviewer (Jordan Hayes)
 *   Stage 4 (100s):     Scout (research) — runs at start, shown in pre-stage
 *
 * Each stage card shows: agent avatar + role + status pill + elapsed time +
 * thinking preview (when running). Lines connect cards to show handoff.
 *
 * Used by QuickTask30sPage when tier === "60s" or "100s".
 */
import React from "react";
import { Avatar } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenNib, faPalette, faComments, faClock, faCalendarPlus, faShieldHalved, faMagnifyingGlassChart } from "@fortawesome/free-solid-svg-icons";

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
  /** Stage key match (orchestra.stages.key) */
  stageKey: string;
  role: string;
  agentName: string;
  agentTitle?: string;
  avatarUrl?: string | null;
  icon: any;
  description: string; // 1-line about what this agent does
}

/** Agent allocation for 60s tier — universal across channels.
 *  Caption + image agents come from per-task config; the rest are global. */
const PIPELINE_AGENTS: AgentSlot[] = [
  {
    stageKey: "scout",
    role: "Scout",
    agentName: "Perplexity Scout",
    agentTitle: "real-data 爆款研究",
    icon: faMagnifyingGlassChart,
    description: "（100s）爬近 30 天通路爆款、萃取 hook 結構",
  },
  {
    stageKey: "caption",
    role: "Caption Writer",
    agentName: "（依任務）",
    icon: faPenNib,
    description: "5 個口吻變體（並行 fanout、各自 retry）",
  },
  {
    stageKey: "brief",
    role: "Image Director",
    agentName: "（依任務）",
    icon: faPalette,
    description: "5 條視覺方向 + 真生 Flux 圖（60s+）",
  },
  {
    stageKey: "extras",
    role: "Reply / Schedule / Followup",
    agentName: "Helen Sung × David Wang × Sophie Ho",
    agentTitle: "60s production package 三人組",
    icon: faComments,
    description: "留言模板 ×5 / 最佳發文時段 / 24h 跟進貼文（並行）",
  },
  {
    stageKey: "qa",
    role: "QA Reviewer",
    agentName: "Jordan Hayes",
    agentTitle: "AI 品牌故事 CMO",
    icon: faShieldHalved,
    description: "審核 5 變體：caption / image / package coherence",
  },
];

function statusColor(s: StageInfo["status"]): string {
  return s === "done" ? "text-success-700 bg-success-50 border-success-200"
    : s === "failed" ? "text-danger-700 bg-danger-50 border-danger-200"
    : s === "running" ? "text-warning-700 bg-warning-50 border-warning-200 animate-pulse"
    : "text-default-500 bg-default-50 border-default-200";
}

function statusLabel(s: StageInfo["status"]): string {
  return s === "done" ? "✓ 完成"
    : s === "failed" ? "✗ 失敗"
    : s === "running" ? "⋯ 進行中"
    : "○ 待命";
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
  tier: "30s" | "60s" | "100s";
}) {
  if (!stages || stages.length === 0) return null;

  // Map orchestra stages by key for quick lookup
  const byKey: Record<string, StageInfo> = {};
  for (const s of stages) byKey[s.key] = s;

  // Slots actually in this run (skip those with no stage data)
  const visibleSlots = PIPELINE_AGENTS.filter((slot) => byKey[slot.stageKey]);
  if (visibleSlots.length === 0) return null;

  return (
    <div className="border border-default-200 rounded-medium bg-default-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-default-200 flex items-center justify-between">
        <p className="text-tiny font-semibold text-default-700">
          🎼 Orchestra · {tier} 流程
        </p>
        <p className="text-[10px] text-default-400 uppercase tracking-wider">
          {visibleSlots.length} agents · {stages.find((s) => s.key === "qa") ? "含 QA 審核" : "無 QA"}
        </p>
      </div>

      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {visibleSlots.map((slot) => {
          const stage = byKey[slot.stageKey]!;
          const elapsed =
            stage.completedAt != null
              ? `${(stage.completedAt / 1000).toFixed(1)}s`
              : stage.status === "running"
                ? `${Math.round((Date.now() - stage.startedAt) / 1000)}s…`
                : "";

          // Use real agent name when available
          const isCaption = slot.stageKey === "caption";
          const isImage = slot.stageKey === "brief";
          const realAgent = isCaption ? captionAgent : isImage ? imageAgent : null;
          const displayName = realAgent?.name ?? slot.agentName;
          const displayTitle = realAgent?.title ?? slot.agentTitle ?? "";
          const avatarSrc = realAgent?.avatarUrl || dicebear(displayName);

          return (
            <div
              key={slot.stageKey}
              className={`border rounded-medium p-2.5 ${statusColor(stage.status)}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Avatar src={avatarSrc} size="sm" className="w-6 h-6" />
                <div className="flex-1 min-w-0">
                  <p className="text-tiny font-semibold truncate text-default-800">{displayName}</p>
                  <p className="text-[10px] text-default-500 truncate">{displayTitle || slot.role}</p>
                </div>
                <FontAwesomeIcon icon={slot.icon} className="text-default-400 text-tiny" />
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-medium">{statusLabel(stage.status)}</span>
                <span className="tabular-nums opacity-70">{elapsed}</span>
              </div>
              <p className="text-[10px] text-default-500 mt-1.5 leading-snug line-clamp-2">{slot.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
