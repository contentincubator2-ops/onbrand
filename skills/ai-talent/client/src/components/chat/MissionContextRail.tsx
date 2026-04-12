/**
 * MissionContextRail.tsx — Sprint 1 (Mission Workspace Completion)
 * Left rail: Mission Context only — Brand, Workspace, Objective, Audience, Offer,
 * KPI, Methodology, Constraints, Mission Stages
 *
 * Removed: agents / agentsLoading props (agents now live in right ArtifactReviewPanel Team tab)
 */
import React from 'react';

export interface MissionContext {
  workspace: string;       // e.g. "Facebook"
  objective: string;
  audience: string;
  offer: string;
  successMetrics: string;
  constraints: string;
  methodology: string;     // e.g. "Brand Positioning v2"
}

// AgentEntry kept for external consumers (WorkspacePage maps leftAgents for right panel)
export interface AgentEntry {
  id: number;
  name: string;
  specialty: string;
  workspace: string;
  layer: 'execution' | 'strategy';
  status: 'idle' | 'running' | 'review' | 'done';
  aiModel?: string;
}

export interface TaskUnit {
  id: string;
  label: string;
  status: 'not_started' | 'running' | 'needs_input' | 'ready_review' | 'approved';
}

interface Props {
  brand: { name: string; id: number } | null;
  mission: MissionContext | null;
  taskUnits?: TaskUnit[];
  workspaceName?: string;
  onEditMission?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-1">
      {children}
    </p>
  );
}

function Divider() {
  return <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-3" />;
}

function ContextRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="mb-3">
      <SectionLabel>{label}</SectionLabel>
      <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">{value}</p>
    </div>
  );
}

// Mission Stages — numbered 01/02/03 with status colours
const STAGE_STATUS: Record<string, { dot: string; text: string; bg: string }> = {
  not_started:  { dot: 'bg-neutral-300 dark:bg-neutral-600',      text: 'text-neutral-400',                   bg: '' },
  running:      { dot: 'bg-amber-500 animate-pulse',               text: 'text-neutral-800 dark:text-neutral-100', bg: 'bg-amber-50/60 dark:bg-amber-900/20' },
  needs_input:  { dot: 'bg-amber-400',                             text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50/60 dark:bg-amber-900/20' },
  ready_review: { dot: 'bg-indigo-500',                            text: 'text-neutral-700 dark:text-neutral-300', bg: '' },
  approved:     { dot: 'bg-green-500',                             text: 'text-neutral-400 line-through',      bg: '' },
};

function MissionStages({ units }: { units: TaskUnit[] }) {
  if (!units || units.length === 0) return null;
  const done = units.filter(u => u.status === 'approved').length;
  const pct  = Math.round((done / units.length) * 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>Mission Stages</SectionLabel>
        <span className="text-[10px] text-neutral-400">{done}/{units.length}</span>
      </div>
      {/* Progress bar */}
      <div className="w-full h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-green-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="space-y-0.5">
        {units.map((u, idx) => {
          const s = STAGE_STATUS[u.status] ?? STAGE_STATUS.not_started;
          const num = String(idx + 1).padStart(2, '0');
          return (
            <div
              key={u.id}
              className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md ${s.bg}`}
            >
              <span className="text-[10px] font-mono text-neutral-300 dark:text-neutral-600 shrink-0 w-5">{num}</span>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
              <span className={`text-[11px] flex-1 ${s.text}`}>{u.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MissionContextRail({
  brand,
  mission,
  taskUnits,
  workspaceName,
  onEditMission,
}: Props) {
  const displayWorkspace = mission?.workspace ?? workspaceName ?? 'No workspace';

  return (
    <aside
      className="w-[280px] shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-[#faf9f7] dark:bg-[#1a1a1a] flex flex-col overflow-hidden"
      style={{ position: 'sticky', top: 0, height: '100vh' }}
    >
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        {/* Brand */}
        {brand ? (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-[12px] font-bold text-white shrink-0">
              {brand.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 dark:text-neutral-500">Brand</p>
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate">{brand.name}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold text-neutral-400 mb-2">— No Brand —</p>
        )}

        {/* Workspace + Edit */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 dark:text-neutral-500">Workspace</p>
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mt-0.5">{displayWorkspace}</p>
          </div>
          {onEditMission && (
            <button
              onClick={onEditMission}
              className="text-xs text-amber-600 hover:text-amber-800 dark:hover:text-amber-400 transition-colors font-medium"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {mission ? (
          <>
            {/* 1. Objective */}
            <ContextRow label="目標 Objective" value={mission.objective} />

            {/* 2. Audience */}
            <ContextRow label="受眾 Audience" value={mission.audience} />

            {/* 3. Offer */}
            <ContextRow label="提案 / 產品 Offer" value={mission.offer} />

            {/* 4. KPI / Success Metrics — amber badge list */}
            {mission.successMetrics && (
              <div className="mb-3">
                <SectionLabel>KPI / 成功指標</SectionLabel>
                <div className="flex flex-wrap gap-1">
                  {mission.successMetrics.split(/[,，；;、\n]+/).filter(Boolean).map((m, i) => (
                    <span
                      key={i}
                      className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium"
                    >
                      {m.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Methodology */}
            {mission.methodology && (
              <div className="mb-3">
                <SectionLabel>方法論 Methodology</SectionLabel>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">{mission.methodology}</p>
                </div>
              </div>
            )}

            {/* 6. Constraints */}
            <ContextRow label="限制條件 Constraints" value={mission.constraints} />

            {/* Divider */}
            {taskUnits && taskUnits.length > 0 && <Divider />}

            {/* Mission Stages */}
            {taskUnits && <MissionStages units={taskUnits} />}
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="9" x2="15" y2="9"/>
                <line x1="9" y1="13" x2="13" y2="13"/>
                <line x1="12" y1="17" x2="15" y2="17"/>
              </svg>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              尚未建立任務<br />
              <span className="text-neutral-300">點擊 <strong className="text-amber-500">+ 新任務</strong> 開始</span>
            </p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 shrink-0">
        <div className="flex gap-2">
          <button className="flex-1 text-xs py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            + 新增限制條件
          </button>
          <button className="flex-1 text-xs py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            Switch goal
          </button>
        </div>
      </div>
    </aside>
  );
}
