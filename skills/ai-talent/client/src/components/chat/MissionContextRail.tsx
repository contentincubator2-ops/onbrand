/**
 * MissionContextRail.tsx — Sprint 3
 * Left rail: mission context + live agent roster for this workspace
 *
 * Sprint 3 wiring:
 * - Accepts `agents` prop (from agent.list tRPC via WorkspacePage)
 * - Shows agent avatars, specialties, workspace layer tag
 * - Keeps MissionContext type (used by WorkspacePage state)
 * - TaskUnit type removed — tasks now tracked via agent status
 */

export interface MissionContext {
  workspace: string;       // e.g. "Facebook"
  objective: string;
  audience: string;
  offer: string;
  successMetrics: string;
  constraints: string;
  methodology: string;     // e.g. "Brand Positioning v2"
}

export interface AgentEntry {
  id: number;
  name: string;
  specialty: string;
  workspace: string;       // facebook | linkedin | youtube | pr | event | instore
  layer: 'execution' | 'strategy';
  status: 'idle' | 'running' | 'review' | 'done';
    aiModel?: string;    // e.g. "claude-sonnet-4-20250514", "gpt-4o"
}

export interface TaskUnit {
  id: string;
  label: string;
  status: 'not_started' | 'running' | 'needs_input' | 'ready_review' | 'approved';
}

interface Props {
  brand: { name: string; id: number } | null;
  mission: MissionContext | null;
  agents: AgentEntry[];
  taskUnits?: TaskUnit[];
  agentsLoading?: boolean;
  workspaceName?: string;
  onEditMission?: () => void;
}

const TASK_STATUS_CFG: Record<string, { icon: string; cls: string }> = {
  not_started: { icon: '\u25CB', cls: 'text-neutral-400' },
  running: { icon: '\u25D4', cls: 'text-blue-600 animate-pulse' },
  needs_input: { icon: '\u26A0', cls: 'text-amber-500' },
  ready_review: { icon: '\u25C9', cls: 'text-purple-600' },
  approved: { icon: '\u2713', cls: 'text-green-600' },
};

function TaskUnitList({ units }: { units: TaskUnit[] }) {
  if (!units || units.length === 0) return null;
  const done = units.filter(u => u.status === 'approved').length;
  const pct = Math.round((done / units.length) * 100);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>Task Progress</SectionLabel>
        <span className="text-[10px] text-neutral-400">{done}/{units.length}</span>
      </div>
      <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full mb-2 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber-400 to-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-0.5">
        {units.map(u => {
          const s = (TASK_STATUS_CFG as any)[u.status] || TASK_STATUS_CFG.not_started;
          return (
            <div key={u.id} className={`flex items-center gap-2 px-2 py-1 rounded-md ${u.status === 'running' ? 'bg-blue-50/80 dark:bg-blue-900/20' : u.status === 'needs_input' ? 'bg-amber-50/80 dark:bg-amber-900/20' : ''}`}>
              <span className={`text-[11px] ${s.cls}`}>{s.icon}</span>
              <span className={`text-[11px] flex-1 ${u.status === 'approved' ? 'text-neutral-400 line-through' : 'text-neutral-700 dark:text-neutral-300'}`}>{u.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_DOT: Record<AgentEntry['status'], string> = {
  idle:    'bg-neutral-300 dark:bg-neutral-600',
  running: 'bg-indigo-500 animate-pulse',
  review:  'bg-amber-400',
  done:    'bg-green-500',
};

const STATUS_LABEL: Record<AgentEntry['status'], string> = {
  idle:    '待命',
  running: '執行中',
  review:  '待審',
  done:    '完成',
};

const LAYER_COLOR: Record<AgentEntry['layer'], string> = {
  execution: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  strategy:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

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

function AgentCard({ agent }: { agent: AgentEntry }) {
  const initials = agent.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-2 py-1.5">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
        {initials}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100 truncate">{agent.name}</p>
        <p className="text-[10px] text-neutral-400 truncate">{agent.specialty}</p>         {agent.aiModel && (           <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium mt-0.5">             <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/></svg>             {agent.aiModel.replace('claude-', '').replace('gpt-', 'GPT-').replace('-20250514', '').slice(0, 16)}           </span>         )}
      </div>
      {/* Status dot */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} title={STATUS_LABEL[agent.status]} />
    </div>
  );
}

export default function MissionContextRail({
  brand,
  mission,
  agents,
  agentsLoading,
  workspaceName,
  onEditMission,
  taskUnits,
}: Props) {
  const displayName = mission?.workspace ?? workspaceName ?? 'No workspace';

  // Group agents by layer
  const executionAgents = agents.filter((a) => a.layer === 'execution');
  const strategyAgents  = agents.filter((a) => a.layer === 'strategy');

  return (
    <aside className="w-[280px] shrink-0 h-full flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-[#faf9f7] dark:bg-[#1a1a1a] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 dark:text-neutral-500">Workspace</p>
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 mt-0.5">{displayName}</p>
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
        {brand && (
          <div className="mt-2 flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              {brand.name.charAt(0)}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{brand.name}</p>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {/* Mission context fields */}
        {mission ? (
          <>
            <ContextRow label="目標" value={mission.objective} />
            <ContextRow label="受眾" value={mission.audience} />
            <ContextRow label="主張 / Offer" value={mission.offer} />
            <ContextRow label="成效指標" value={mission.successMetrics} />
            <ContextRow label="限制條件" value={mission.constraints} />
            {mission.methodology && (
              <div className="mb-4">
                <SectionLabel>方法論</SectionLabel>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">{mission.methodology}</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="mb-4 p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800/50">
            <p className="text-xs text-neutral-400 text-center leading-relaxed">
              在聊天區輸入任務指令，<br />任務脈絡會顯示在這裡。
            </p>
          </div>
        )}

        {/* Task Units */}
        {taskUnits && taskUnits.length > 0 && <TaskUnitList units={taskUnits} />}
        {/* Divider */}
        <div className="pt-2 pb-1">
          <div className="h-px bg-neutral-200 dark:bg-neutral-800" />
        </div>

        {/* Agents section */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Workspace Agents</SectionLabel>
            {!agentsLoading && (
              <span className="text-[10px] text-neutral-400">{agents.length} 位</span>
            )}
          </div>

          {agentsLoading ? (
            // Skeleton
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
                  <div className="flex-1 space-y-1">
                    <div className="h-2.5 w-24 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
                    <div className="h-2 w-16 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : agents.length === 0 ? (
            <p className="text-xs text-neutral-400 text-center py-4">尚無 Agents 分配</p>
          ) : (
            <div className="space-y-0">
              {executionAgents.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${LAYER_COLOR.execution}`}>Execution</span>
                  </div>
                  {executionAgents.map((a) => <AgentCard key={a.id} agent={a} />)}
                </div>
              )}
              {strategyAgents.length > 0 && (
                <div>
                  <div className="mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${LAYER_COLOR.strategy}`}>Strategy</span>
                  </div>
                  {strategyAgents.map((a) => <AgentCard key={a.id} agent={a} />)}
                </div>
              )}
            </div>
          )}
        </div>
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
