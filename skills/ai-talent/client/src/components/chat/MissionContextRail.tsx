// MissionContextRail.tsx
// Left rail: fixed mission context for the workspace — brand, objective, audience, methodology, task units

export interface TaskUnit {
  id: number;
  label: string;
  status: 'not_started' | 'running' | 'needs_input' | 'review' | 'approved';
}

export interface MissionContext {
  workspace: string;       // e.g. "Facebook"
  objective: string;
  audience: string;
  offer: string;
  successMetrics: string;
  constraints: string;
  methodology: string;     // e.g. "Brand Positioning v2"
  taskUnits: TaskUnit[];
}

interface Props {
  brand: { name: string; id: number } | null;
  mission: MissionContext | null;
  workspaceName?: string;  // NEW: passed from WorkspacePage for display when mission is null
  onEditMission?: () => void;
}

const STATUS_CONFIG = {
  not_started:  { dot: 'bg-neutral-300 dark:bg-neutral-600', label: '待開始' },
  running:      { dot: 'bg-indigo-500 animate-pulse',        label: '執行中' },
  needs_input:  { dot: 'bg-yellow-400',                      label: '需要輸入' },
  review:       { dot: 'bg-blue-400',                        label: '待審核' },
  approved:     { dot: 'bg-green-500',                       label: '已完成' },
} as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-1">
      {children}
    </p>
  );
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

export default function MissionContextRail({ brand, mission, workspaceName, onEditMission }: Props) {
  const completedCount = mission?.taskUnits.filter(t => t.status === 'approved').length ?? 0;
  const totalCount = mission?.taskUnits.length ?? 0;
  const displayName = mission?.workspace ?? workspaceName ?? 'No workspace';

  return (
    <aside className="w-[280px] shrink-0 h-full flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#1a1a1a] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 dark:text-neutral-500">Workspace</p>
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 mt-0.5">
              {displayName}
            </p>
          </div>
          {onEditMission && (
            <button
              onClick={onEditMission}
              className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
        {brand && (
          <div className="mt-2 flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              {brand.name.charAt(0)}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{brand.name}</p>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {mission ? (
          <>
            {/* Progress bar */}
            {totalCount > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <SectionLabel>任務進度</SectionLabel>
                  <span className="text-[10px] text-neutral-400">{completedCount}/{totalCount}</span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
            <ContextRow label="目標" value={mission.objective} />
            <ContextRow label="受眾" value={mission.audience} />
            <ContextRow label="主張 / Offer" value={mission.offer} />
            <ContextRow label="成效指標" value={mission.successMetrics} />
            <ContextRow label="限制條件" value={mission.constraints} />

            {/* Methodology */}
            {mission.methodology && (
              <div className="mb-3">
                <SectionLabel>方法論</SectionLabel>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">{mission.methodology}</p>
                </div>
              </div>
            )}

            {/* Task units */}
            {mission.taskUnits.length > 0 && (
              <div className="mt-2">
                <SectionLabel>Task Units</SectionLabel>
                <div className="space-y-1.5">
                  {mission.taskUnits.map(unit => {
                    const cfg = STATUS_CONFIG[unit.status];
                    return (
                      <div key={unit.id} className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 flex-1 truncate">{unit.label}</p>
                        <span className="text-[10px] text-neutral-400 shrink-0">{cfg.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">開始你的任務</p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed">
                在聊天區輸入任務指令，<br/>任務脈絡會自動顯示在這裡。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
        <div className="flex gap-2">
          <button className="flex-1 text-xs py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            + Add constraint
          </button>
          <button className="flex-1 text-xs py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            Switch goal
          </button>
        </div>
      </div>
    </aside>
  );
}
