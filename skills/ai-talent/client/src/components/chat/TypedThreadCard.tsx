/**
 * TypedThreadCard.tsx — Sprint 3 upgrade
 * 六類卡片：human_request / pm_agent / team_assembly / specialist / review_request / approval_result
 */

import { useState } from "react";

export type CardType =
  | "human_request"
  | "pm_agent"
  | "team_assembly"
  | "specialist"
  | "review_request"
  | "approval_result";

export interface TeamMember {
  name: string;
  title: string;
  role?: string;
}

export interface TypedThreadCardProps {
  cardType: CardType;
  agentName?: string;
  label: string;
  status: "pending" | "running" | "done" | "approved" | "needs_revision";
  content?: string;
  stepIndex?: number;
  totalSteps?: number;
  teamMembers?: TeamMember[];       // for team_assembly
  artifactId?: number;              // for specialist → artifact linkage
  nextAction?: string;              // what happens next
  onApprove?: () => void;           // for review_request
  onRevise?: () => void;            // for review_request
  collapsible?: boolean;
}

const CARD_CFG: Record<
  CardType,
  {
    border: string;
    bg: string;
    icon: string;
    roleLabel: string;
    headerColor: string;
  }
> = {
  human_request: {
    border: "border-neutral-300 dark:border-neutral-600",
    bg: "bg-white dark:bg-neutral-800",
    icon: "👤",
    roleLabel: "你的請求",
    headerColor: "text-neutral-700 dark:text-neutral-200",
  },
  pm_agent: {
    border: "border-indigo-200 dark:border-indigo-800",
    bg: "bg-indigo-50/50 dark:bg-indigo-900/10",
    icon: "🧭",
    roleLabel: "PM 規劃",
    headerColor: "text-indigo-700 dark:text-indigo-300",
  },
  team_assembly: {
    border: "border-purple-200 dark:border-purple-800",
    bg: "bg-purple-50/40 dark:bg-purple-900/10",
    icon: "👥",
    roleLabel: "組隊",
    headerColor: "text-purple-700 dark:text-purple-300",
  },
  specialist: {
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50/50 dark:bg-blue-900/10",
    icon: "🧠",
    roleLabel: "專家產出",
    headerColor: "text-blue-700 dark:text-blue-300",
  },
  review_request: {
    border: "border-amber-300 dark:border-amber-700",
    bg: "bg-amber-50/50 dark:bg-amber-900/10",
    icon: "🔍",
    roleLabel: "待審核",
    headerColor: "text-amber-700 dark:text-amber-300",
  },
  approval_result: {
    border: "border-green-300 dark:border-green-700",
    bg: "bg-green-50/40 dark:bg-green-900/10",
    icon: "✅",
    roleLabel: "已核准",
    headerColor: "text-green-700 dark:text-green-300",
  },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:         { label: "等待中",   cls: "bg-neutral-200 text-neutral-500" },
  running:         { label: "執行中…",  cls: "bg-blue-100 text-blue-600 animate-pulse" },
  done:            { label: "完成",     cls: "bg-green-100 text-green-700" },
  approved:        { label: "已核准",   cls: "bg-green-200 text-green-800" },
  needs_revision:  { label: "需修改",   cls: "bg-red-100 text-red-600" },
};

export default function TypedThreadCard({
  cardType,
  agentName,
  label,
  status,
  content,
  stepIndex,
  totalSteps,
  teamMembers,
  artifactId,
  nextAction,
  onApprove,
  onRevise,
  collapsible = true,
}: TypedThreadCardProps) {
  const cfg = CARD_CFG[cardType] ?? CARD_CFG.specialist;
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
  const [collapsed, setCollapsed] = useState(false);

  const hasContent = !!content && content.trim().length > 0;
  const longContent = hasContent && content!.length > 300;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3 mb-2 transition-all`}>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-sm">{cfg.icon}</span>
        {agentName && (
          <span className={`text-xs font-semibold ${cfg.headerColor}`}>
            {agentName}
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/70 dark:bg-neutral-700 text-neutral-500 border border-neutral-200 dark:border-neutral-600">
          {cfg.roleLabel}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.cls}`}>
          {badge.label}
        </span>
        {stepIndex !== undefined && totalSteps !== undefined && (
          <span className="text-[10px] text-neutral-400 ml-auto">
            {stepIndex}/{totalSteps}
          </span>
        )}
        {collapsible && longContent && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-[10px] text-neutral-400 hover:text-neutral-600 ml-auto"
          >
            {collapsed ? "▶ 展開" : "▼ 收合"}
          </button>
        )}
      </div>

      {/* ── Label ── */}
      <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100 mb-1">
        {label}
      </p>

      {/* ── team_assembly: 成員列表 ── */}
      {cardType === "team_assembly" && teamMembers && teamMembers.length > 0 && (
        <div className="mt-1 space-y-1">
          {teamMembers.map((m, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-purple-400">•</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">
                {m.name}
              </span>
              <span className="text-neutral-400">{m.title}</span>
              {m.role && (
                <span className="text-[10px] px-1 rounded bg-purple-100 text-purple-600">
                  {m.role}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      {hasContent && !collapsed && (
        <div className="text-[11px] text-neutral-600 dark:text-neutral-400 border-l-2 border-neutral-300 dark:border-neutral-600 pl-2 leading-relaxed mt-1 whitespace-pre-wrap">
          {longContent ? content!.slice(0, 400) + (collapsed ? "" : content!.slice(400)) : content}
        </div>
      )}

      {/* ── Artifact linkage ── */}
      {artifactId && cardType === "specialist" && (
        <div className="mt-1 text-[10px] text-blue-500 flex items-center gap-1">
          <span>📎</span>
          <span>Artifact #{artifactId} 已建立</span>
        </div>
      )}

      {/* ── Next action hint ── */}
      {nextAction && (
        <div className="mt-1 text-[10px] text-neutral-400 italic">
          → {nextAction}
        </div>
      )}

      {/* ── review_request: 審核按鈕 ── */}
      {cardType === "review_request" && status === "done" && (
        <div className="mt-2 flex gap-2">
          {onApprove && (
            <button
              onClick={onApprove}
              className="text-[11px] px-2 py-1 rounded bg-green-500 text-white hover:bg-green-600 transition-colors"
            >
              ✅ 核准
            </button>
          )}
          {onRevise && (
            <button
              onClick={onRevise}
              className="text-[11px] px-2 py-1 rounded bg-amber-400 text-white hover:bg-amber-500 transition-colors"
            >
              ✏️ 需修改
            </button>
          )}
        </div>
      )}

      {/* ── approval_result ── */}
      {cardType === "approval_result" && (
        <div className="mt-1 flex items-center gap-1">
          <span className="text-green-600 text-[11px]">✓</span>
          <span className="text-[10px] text-green-600 font-medium">核准完成，流程結束</span>
        </div>
      )}
    </div>
  );
}
