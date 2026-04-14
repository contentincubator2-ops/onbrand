/**
 * TypedThreadCard.tsx — Perplexity-style design
 * 六類卡片：human_request / pm_agent / team_assembly / specialist / review_request / approval_result
 * Design: minimal dark, single accent color, no emoji, SVG icons only
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
  teamMembers?: TeamMember[];
  artifactId?: number;
  nextAction?: string;
  onApprove?: () => void;
  onRevise?: () => void;
  collapsible?: boolean;
}

// SVG icons — Perplexity style (thin stroke, no fill)
const Icons: Record<CardType, JSX.Element> = {
  human_request: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
  pm_agent: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
    </svg>
  ),
  team_assembly: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3"/><circle cx="15" cy="7" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6h6c3.3 0 6 2.7 6 6"/>
    </svg>
  ),
  specialist: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  review_request: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v3l2 2"/>
    </svg>
  ),
  approval_result: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
};

const CARD_CFG: Record<CardType, {
  label: string;
  iconColor: string;
  accentBar: string;
}> = {
  human_request:   { label: "Request",  iconColor: "text-neutral-400", accentBar: "bg-neutral-600" },
  pm_agent:        { label: "Planning", iconColor: "text-blue-400",    accentBar: "bg-blue-500" },
  team_assembly:   { label: "Assembly", iconColor: "text-neutral-400", accentBar: "bg-neutral-500" },
  specialist:      { label: "Output",   iconColor: "text-blue-400",    accentBar: "bg-blue-500" },
  review_request:  { label: "Review",   iconColor: "text-amber-400",   accentBar: "bg-amber-500" },
  approval_result: { label: "Approved", iconColor: "text-emerald-400", accentBar: "bg-emerald-500" },
};

const STATUS_DOT: Record<string, { color: string; pulse: boolean }> = {
  pending:        { color: "bg-neutral-600", pulse: false },
  running:        { color: "bg-blue-400",    pulse: true  },
  done:           { color: "bg-neutral-500", pulse: false },
  approved:       { color: "bg-emerald-500", pulse: false },
  needs_revision: { color: "bg-amber-500",   pulse: false },
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
  const dot = STATUS_DOT[status] ?? STATUS_DOT.pending;
  const [collapsed, setCollapsed] = useState(false);
  const hasContent = !!content && content.trim().length > 0;
  const longContent = hasContent && content!.length > 300;

  return (
    <div className="flex gap-3 mb-3">
      {/* Left accent bar */}
      <div className={`w-[2px] rounded-full shrink-0 ${cfg.accentBar} opacity-60 mt-1`} style={{ minHeight: 36 }} />

      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1">
          {/* Icon */}
          <span className={`${cfg.iconColor} shrink-0`}>
            {Icons[cardType]}
          </span>

          {/* Type label */}
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-500 tracking-wide uppercase">
            {cfg.label}
          </span>

          {/* Agent name */}
          {agentName && (
            <>
              <span className="text-neutral-700 dark:text-neutral-600 text-[11px]">·</span>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-400 font-normal">
                {agentName}
              </span>
            </>
          )}

          {/* Status dot */}
          <span className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${dot.color} ${dot.pulse ? "animate-pulse" : ""}`} />

          {/* Step counter */}
          {stepIndex !== undefined && totalSteps !== undefined && (
            <span className="text-[10px] text-neutral-600 dark:text-neutral-600 font-mono">
              {stepIndex}/{totalSteps}
            </span>
          )}

          {/* Collapse toggle */}
          {collapsible && longContent && (
            <button
              onClick={() => setCollapsed(v => !v)}
              className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors ml-1"
            >
              {collapsed ? "show" : "hide"}
            </button>
          )}
        </div>

        {/* Label */}
        <p className="text-[13px] font-normal text-neutral-200 dark:text-neutral-200 leading-snug mb-1.5">
          {label}
        </p>

        {/* Team assembly: member list */}
        {cardType === "team_assembly" && teamMembers && teamMembers.length > 0 && (
          <div className="space-y-1 mb-1.5">
            {teamMembers.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="text-neutral-600">—</span>
                <span className="text-neutral-300">{m.name}</span>
                <span className="text-neutral-600">{m.title}</span>
                {m.role && (
                  <span className="text-[10px] text-neutral-500 border border-neutral-700 rounded px-1">
                    {m.role}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {hasContent && !collapsed && (
          <div className="text-[12px] text-neutral-400 dark:text-neutral-500 leading-relaxed whitespace-pre-wrap border-l border-neutral-800 pl-2.5 mt-1">
            {content}
          </div>
        )}

        {/* Artifact linkage */}
        {artifactId && cardType === "specialist" && (
          <div className="mt-1.5 text-[11px] text-neutral-600 flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            <span>artifact/{artifactId}</span>
          </div>
        )}

        {/* Next action */}
        {nextAction && (
          <div className="mt-1.5 text-[11px] text-neutral-600 dark:text-neutral-600">
            → {nextAction}
          </div>
        )}

        {/* Review buttons */}
        {cardType === "review_request" && status === "done" && (
          <div className="mt-2 flex gap-2">
            {onApprove && (
              <button
                onClick={onApprove}
                className="text-[11px] px-3 py-1 rounded border border-emerald-700 text-emerald-400 hover:bg-emerald-900/30 transition-colors"
              >
                Approve
              </button>
            )}
            {onRevise && (
              <button
                onClick={onRevise}
                className="text-[11px] px-3 py-1 rounded border border-neutral-700 text-neutral-400 hover:bg-neutral-800 transition-colors"
              >
                Request revision
              </button>
            )}
          </div>
        )}

        {/* Approval result */}
        {cardType === "approval_result" && (
          <div className="mt-1 text-[11px] text-emerald-500">
            Approved · workflow complete
          </div>
        )}
      </div>
    </div>
  );
}
