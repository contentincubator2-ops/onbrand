// MissionContextRail.tsx
// Left rail: fixed mission context for the workspace — brand, objective, audience, methodology, task units

export interface TaskUnit {
  id: number;
  label: string;
  status: 'not_started' | 'running' | 'needs_input' | 'review' | 'approved';
}

export interface MissionContext {
  workspace: string;          // e.g. "Facebook"
  objective: string;
  audience: string;
  offer: string;
  successMetrics: string;
  constraints: string;
  methodology: string;        // e.g. "Brand Positioning v2"
  taskUnits: TaskUnit[];
}

interface Props {
  brand: { name: string; id: number } | null;
  mission: MissionContext | null;
  onEditMission?: () => void;
}

const STATUS_CONFIG = {
  not_started: { dot: 'bg-neutral-300 dark:bg-neutral-600', label: '待開始' },
  running:     { dot: 'bg-indigo-500 animate-pulse',          label: '執行中' },
  needs_input: { dot: 'bg-yellow-400',                        label: '需要輸入' },
  review:      { dot: 'bg-blue-400',                          label: '待審核' },
  approved:    { dot: 'bg-green-500',                         label: '已完成' },
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

export default function MissionContextRail({ brand, mission, onEditMission }: Props) {
  const completedCount = mission?.taskUnits.filter(t => t.status === 'approved').length ?? 0;
  const totalCount     = mission?.taskUnits.length ?? 0;

  return (
    <aside className="w-[272px] shrink-0 h-full flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#1a1a1a] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 dark:text-neutral-500">Workspace</p>
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 mt-0.5">
              {mission?.workspace ?? 'No workspace'}
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
            <div className="w-10 h-10 rounded-xl bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-xl">📋</div>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              輸入任務後，<br />任務脈絡會顯示在這裡。
            </p>
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
