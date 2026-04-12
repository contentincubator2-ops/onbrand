import { useState, useRef, useEffect } from "react";
import { trpc } from "../lib/trpc";
import OnboardingWizard from "./OnboardingWizard";
import TaskProgressTracker, { type TaskStep } from "../components/chat/TaskProgressTracker";
import TypedThreadCard from "../components/chat/TypedThreadCard";

const A2A_PATTERNS: { regex: RegExp; workflowId: string }[] = [
  { regex: /品牌上市|brand.launch|全套.*行銷|行銷.*全套|完整.*上市|上市.*計劃|上市.*策略/i, workflowId: "brand-launch-v1" },
  { regex: /市場調研|市場研究|market.research|競品.*分析.*消費者|消費者.*洞察.*報告/i, workflowId: "market-research-v1" },
];

function detectA2AWorkflow(text: string): string | null {
  for (const p of A2A_PATTERNS) {
    if (p.regex.test(text)) return p.workflowId;
  }
  return null;
}

function isTaskLike(text: string): boolean {
  return /幫我|請|做一份|產出|撰寫|分析|規劃|設計|研究|執行|建立|生成|整理|報告|文案|策略|campaign|seo|廣告/i.test(text);
}

function detectTaskType(text: string): string {
  if (/文案|copywriting|廣告.*文字|copy/i.test(text)) return 'copywriting';
  if (/社群|social|instagram|facebook|linkedin|twitter/i.test(text)) return 'social_media';
  if (/seo|搜尋|關鍵字|keyword/i.test(text)) return 'seo';
  if (/email|郵件|電子報|newsletter/i.test(text)) return 'email';
  if (/分析|analysis|報告|report|調研/i.test(text)) return 'analysis';
  if (/策略|strategy|規劃|plan/i.test(text)) return 'strategy';
  return 'general';
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  contentType?: string;
  imageSuggestion?: string;
  taskId?: number;
  ts: number;
  model?: string;   // AI model used (e.g. 'DeepSeek V3', 'Claude 3.5')
  agentName?: string;  // agent name for this message
  agentTitle?: string; // agent title for this message
  agentModel?: string | null; // raw aiModel from DB
  isStreaming?: boolean; // currently streaming
  taskId?: number; // task ID for export
}

interface Conversation {
  id: string;
  title: string;
  messages: Msg[];
  brandId?: number;
  brandName?: string;
  createdAt: number;
}

interface AssembledAgent {
  id: number;
  name: string;
  title: string;
  layer: string;
  specialty?: string | null;
}

interface ExecutionStep {
  step: number;
  agentName: string;
  agentTitle: string;
  layer: string;
  action: string;
}

interface TeamAssemblyState {
  phase: "analyzing" | "assembling" | "proposal" | "executing" | "done";
  agents: AssembledAgent[];
  plan: ExecutionStep[];
  taskType?: string;
  taskText?: string;
}

interface RelayStepState {
  id: number;
  label: string;
  agentName: string;
  agentTitle: string;
  layer: string;
  status: "pending" | "running" | "done";
  eta: string;
  summary?: string;
  expanded?: boolean;
}

// Squad-chat 步驟狀態
interface SquadStepState {
  currentStep: number;
  totalSteps: number;
  agentName?: string;
  agentTitle?: string;
  agentRole?: string;
  isComplete: boolean;
}

const IconSend = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IconChevron = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
const IconPlus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;

function formatModelName(raw: string): string {
  if (!raw) return '';
  const r = raw.toLowerCase();
  if (r.includes('claude') && r.includes('sonnet') && (r.includes('4') || r.includes('3-7') || r.includes('3.7'))) return 'Claude Sonnet 4';
  if (r.includes('claude') && r.includes('opus')) return 'Claude Opus 4';
  if (r.includes('claude') && r.includes('haiku')) return 'Claude Haiku 3.5';
  if (r.includes('claude')) return 'Claude';
  if (r.includes('gpt-4o')) return 'GPT-4o';
  if (r.includes('gpt-4')) return 'GPT-4';
  if (r.includes('gemini-2.0-flash')) return 'Gemini 2.0 Flash';
  if (r.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';
  if (r.includes('gemini')) return 'Gemini';
  if (r.includes('deepseek')) return 'DeepSeek R1';
  if (r.includes('llama')) return 'Llama 3';
  return raw;
}

// ── Mission Steps Rail ──────────────────────────────────────────────────────
const MISSION_STEPS_FRONTEND: Record<string, string[]> = {
  "tw-b2b-saas-gtm": ["品牌基礎研究","競品分析","目標受眾","差異化優勢","價值主張草稿","品牌個性與語調","訊息策略","通路策略","定位方案 A","定位方案 B"],
  "mkt-analytics-attribution": ["確認追蹤競品清單","競品動態搜尋","情報分析與威脅評級","行動建議","報告格式確認"],
  "tw-website-rebuild": ["官網現況分析","競品官網比較","Hero 文案優化","CTA 與 Value Prop","完整文案交付"],
  "mkt-seo-growth": ["關鍵字研究","競品文章分析","文章大綱","草稿（前半）","完整長文交付"],
  "mkt-content-engine": ["本週話題研究","品牌語調確認","一週排期規劃","貼文草稿前3篇","完整版貼文"],
  "tw-ecom-full-funnel": ["廣告現況診斷","競品廣告研究","受眾策略優化","素材與文案建議","完整優化方案"],
};

function MissionStepsRail({ squadSlug, currentStep, totalSteps }: { squadSlug: string; currentStep: number; totalSteps: number }) {
  const steps = MISSION_STEPS_FRONTEND[squadSlug] ?? Array.from({ length: totalSteps }, (_, i) => `Step ${i + 1}`);
  return (
    <div className="w-64 shrink-0 border-l border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">任務進度</p>
        <p className="text-xs text-neutral-400 mt-0.5">{currentStep}/{steps.length} 完成</p>
      </div>
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {steps.map((label, i) => {
          const stepNum = i + 1;
          const isDone = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          const isPending = stepNum > currentStep;
          return (
            <div key={i} className={`flex items-start gap-2.5 px-2 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-neutral-200 dark:bg-neutral-700' : isDone ? '' : ''
            }`}>
              <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                isDone ? 'bg-green-500 text-white' :
                isActive ? 'bg-neutral-800 dark:bg-neutral-100 text-white dark:text-neutral-900 ring-2 ring-neutral-400' :
                'bg-neutral-200 dark:bg-neutral-700 text-neutral-400'
              }`}>
                {isDone ? '✓' : stepNum}
              </div>
              <span className={`text-xs leading-relaxed ${
                isActive ? 'text-neutral-800 dark:text-neutral-100 font-semibold' :
                isDone ? 'text-neutral-400 dark:text-neutral-500 line-through' :
                'text-neutral-400 dark:text-neutral-500'
              }`}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderContent(raw: string): { main: string; thinking: string } {
  try {
    const d = JSON.parse(raw);
    // Case 1: has publishable_content
    if (d.publishable_content) return { main: d.publishable_content, thinking: d.thinking || "" };
    // Case 2: only has thinking (strip it, show nothing or a placeholder)
    if (d.thinking && !d.content && !d.output) return { main: "", thinking: d.thinking };
    // Case 3: has content or output field
    if (d.content || d.output) return { main: d.content || d.output, thinking: d.thinking || "" };
  } catch {}
  return { main: raw, thinking: "" };
}

function formatText(text: string): string {
  if (!text) return '';
  // Full markdown renderer
  let html = text
    // Headers
    .replace(/^### (.+)$/gm, '<h3 style="font-size:0.95em;font-weight:700;margin:1em 0 0.3em;color:inherit">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.05em;font-weight:700;margin:1.2em 0 0.4em;color:inherit">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.15em;font-weight:700;margin:1.2em 0 0.4em;color:inherit">$1</h1>')
    // Tables — convert | col | col | rows to HTML table
    .replace(/((?:\|.+\|\n?)+)/g, (block) => {
      const rows = block.trim().split('\n').filter(r => r.trim());
      const isHeader = rows[1]?.replace(/[\s|:-]/g, '') === '';
      let table = '<table style="border-collapse:collapse;width:100%;margin:0.5em 0;font-size:0.85em">';
      rows.forEach((row, i) => {
        if (isHeader && i === 1) return; // skip separator
        const cells = row.split('|').filter((_, ci) => ci > 0 && ci < row.split('|').length - 1);
        const tag = (isHeader && i === 0) ? 'th' : 'td';
        const style = tag === 'th'
          ? 'background:#f5f5f5;font-weight:600;padding:4px 8px;border:1px solid #ddd;text-align:left'
          : 'padding:4px 8px;border:1px solid #ddd;vertical-align:top';
        table += '<tr>' + cells.map(c => `<${tag} style="${style}">${c.trim()}</${tag}>`).join('') + '</tr>';
      });
      table += '</table>';
      return table;
    })
    // Bold & italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rule
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e5e5e5;margin:0.8em 0">')
    // Unordered lists
    .replace(/^[\-\*] (.+)$/gm, '<li style="margin:0.2em 0 0.2em 1.2em;list-style:disc">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:0.2em 0 0.2em 1.5em;list-style:decimal">$1</li>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:0.85em;font-family:monospace">$1</code>')
    // Newlines (after block elements handled)
    .replace(/\n\n/g, '</p><p style="margin:0.5em 0">')
    .replace(/\n/g, '<br/>');
  return `<p style="margin:0">${html}</p>`;
}

function LayerBadge({ layer }: { layer: string }) {
  const map: Record<string, string> = {
    strategy: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
    execution: "bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-200",
    training: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  };
  const label: Record<string, string> = {
    strategy: "策略層",
    execution: "執行層",
    training: "訓練層",
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[layer] ?? "bg-gray-100 text-gray-500"}`}>{label[layer] ?? layer}</span>;
}

function AgentAvatar({ name, layer }: { name: string; layer: string }) {
  const colors: Record<string, string> = { strategy: "bg-gray-700", execution: "bg-gray-600", training: "bg-gray-500" };
  return <div className={`w-9 h-9 rounded-full ${colors[layer] ?? "bg-gray-500"} text-white flex items-center justify-center text-sm font-bold flex-shrink-0`}>{name.charAt(0)}</div>;
}

function TeamAssemblyPanel({
  state,
  relaySteps,
  onApprove,
  onToggleSummary,
}: {
  state: TeamAssemblyState;
  relaySteps: RelayStepState[];
  onApprove: () => void;
  onToggleSummary: (id: number) => void;
}) {
  const activeStep = relaySteps.find((s) => s.status === "running");
  const completedCount = relaySteps.filter((s) => s.status === "done").length;
  const progress = relaySteps.length ? Math.round((completedCount / relaySteps.length) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-lg">
              {state.phase === "analyzing" ? "🔍" : state.phase === "assembling" ? "🧩" : state.phase === "proposal" ? "📋" : state.phase === "executing" ? "⚙️" : "✅"}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">
                {state.phase === "analyzing" && "分析任務中..."}
                {state.phase === "assembling" && "組建自主代理團隊中..."}
                {state.phase === "proposal" && "Team Proposal 已準備完成"}
                {state.phase === "executing" && "自主代理接力執行中"}
                {state.phase === "done" && "任務已由 AI 團隊完成"}
              </p>
              <p className="text-gray-300 text-xs mt-0.5">Autonomous Agent Operations</p>
            </div>
            {(state.phase === "analyzing" || state.phase === "assembling") && (
              <div className="ml-auto flex gap-1">{[0,150,300].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div>
            )}
          </div>
        </div>

        {relaySteps.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">執行進度</p>
              <p className="text-xs text-gray-400 dark:text-neutral-500">{completedCount}/{relaySteps.length} steps</p>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-gray-600 to-gray-800 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            {activeStep && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 font-medium">
                目前由 {activeStep.agentName} 執行：{activeStep.label}
              </p>
            )}
          </div>
        )}

        {state.agents.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-neutral-800">
            <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider mb-3">本次任務團隊</p>
            <div className="space-y-2.5">
              {state.agents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3">
                  <AgentAvatar name={agent.name} layer={agent.layer} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 dark:text-neutral-100">{agent.name}</p>
                      <LayerBadge layer={agent.layer} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-neutral-400 truncate">{agent.title}</p>
                    {agent.specialty && <p className="text-[10px] text-gray-400 dark:text-neutral-500 truncate mt-0.5">{agent.specialty.slice(0, 80)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {state.plan.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">Task Breakdown</p>
              {state.phase === "proposal" && (
                <button
                  onClick={onApprove}
                  className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold transition-colors"
                >
                  開始執行
                </button>
              )}
            </div>
            <div className="space-y-3">
              {relaySteps.map((step, i) => (
                <div key={step.id} className="relative pl-10">
                  {i < relaySteps.length - 1 && <div className="absolute left-[15px] top-8 bottom-[-14px] w-px bg-gray-200 dark:bg-neutral-700" />}
                  <div className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step.status === "done" ? "bg-gray-500 text-white" : step.status === "running" ? "bg-gray-700 text-white animate-pulse" : "bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-neutral-300"}`}>
                    {step.status === "done" ? "✓" : step.id}
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/70 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <AgentAvatar name={step.agentName} layer={step.layer} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800 dark:text-neutral-100">Step {step.id}. {step.label}</p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${step.status === "done" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : step.status === "running" ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" : "bg-gray-100 text-gray-500 dark:bg-neutral-700 dark:text-neutral-300"}`}>
                            {step.status === "done" ? "已完成" : step.status === "running" ? "正在執行..." : "待執行"}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-neutral-500">ETA {step.eta}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1">{step.agentName} · {step.agentTitle}</p>
                        {step.summary && (
                          <div className="mt-2">
                            <button onClick={() => onToggleSummary(step.id)} className="text-xs text-gray-600 dark:text-gray-400 hover:underline">
                              {step.expanded ? "收合摘要" : "查看摘要"}
                            </button>
                            {step.expanded && (
                              <div className="mt-2 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-3 text-xs text-gray-600 dark:text-neutral-300 leading-relaxed">
                                {step.summary}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {state.phase === "proposal" && (
          <div className="px-5 py-4 bg-gray-50 dark:bg-gray-900/20">
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">批准後，AI 團隊會一棒接一棒自動完成任務。</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage({
  initialBrandId,
  activeMissionId,
  preselectedAgent,
  onClearAgent,
}: {
  initialBrandId?: number | null;
  activeMissionId?: number | null;
  preselectedAgent?: { id: number; name: string; title?: string; type: 'agent' | 'squad' } | null;
  onClearAgent?: () => void;
} = {}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [activeBrandId, setActiveBrandId] = useState<number | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [a2aSteps, setA2aSteps] = useState<TaskStep[]>([]);
  const [a2aProgress, setA2aProgress] = useState(0);
  const [a2aTaskName, setA2aTaskName] = useState<string | undefined>(undefined);
  const [teamAssembly, setTeamAssembly] = useState<TeamAssemblyState | null>(null);
  const [relaySteps, setRelaySteps] = useState<RelayStepState[]>([]);
  const [pendingTask, setPendingTask] = useState("");
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [squadStep, setSquadStep] = useState<SquadStepState>({ currentStep: 0, totalSteps: 10, isComplete: false });
  const [streamingAgentName, setStreamingAgentName] = useState<string | null>(null);
  const [streamingAgentTitle, setStreamingAgentTitle] = useState<string | null>(null);
  const [streamingModel, setStreamingModel] = useState<string | null>(null);
  const [streamingThinking, setStreamingThinking] = useState<string>("");
  const [isStopped, setIsStopped] = useState(false);
  const stopRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const handleStop = () => {
    stopRef.current = true;
    setIsStopped(true);
    readerRef.current?.cancel();
    sseRef.current?.close();
    setLoading(false);
    setStreamingAgentName(null);
    setStreamingAgentTitle(null);
    setStreamingModel(null);
    setStreamingThinking("");
  };

  const createAndExecute = trpc.task.createAndExecute.useMutation();
  const workflowStart = trpc.workflow.start.useMutation();
  const pmChat = trpc.workflow.pmChat.useMutation();

  // BullMQ 輪詢：每 2 秒查一次，最多等 60 秒
  // 直接呼叫 tRPC HTTP 避免 React hook 限制
  const pollWorkflowResult = async (jobId: string): Promise<any> => {
    const token = localStorage.getItem('authToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const res = await fetch(
          `/trpc/workflow.status?input=${encodeURIComponent(JSON.stringify({ jobId }))}`,
          { headers }
        );
        const data = await res.json();
        const status = data?.result?.data?.json ?? data?.result?.data;
        if (!status) continue;
        if (status.status === 'completed' && status.result) {
          setA2aProgress(100);
          return status.result;
        }
        if (status.status === 'failed') {
          throw new Error(status.error || 'Workflow task failed');
        }
        const pct = typeof status.progress === 'number' ? status.progress : Math.min((i + 1) * 5, 90);
        setA2aProgress(pct);
      } catch (pollErr: any) {
        if (pollErr?.message?.includes('failed')) throw pollErr;
        // 網路錯誤繼續重試
      }
    }
    throw new Error('Workflow timeout after 60 seconds');
  };
  const saveMessage = trpc.conversation.saveMessage.useMutation();
  const brandsQuery = trpc.brand.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const missionDataQuery = trpc.mission.getById.useQuery(
    { id: activeMissionId! },
    { enabled: !!activeMissionId, refetchOnWindowFocus: false }
  );
  const matchQuery = trpc.agent.matchForTask.useQuery(
    { taskDescription: pendingTask },
    { enabled: pendingTask.length > 0, refetchOnWindowFocus: false }
  );
  // When mission active → load mission history; else load brand history
  const historyQuery = trpc.conversation.list.useQuery(
    activeMissionId
      ? ({ missionId: activeMissionId } as any)
      : { brandId: activeBrandId ?? undefined },
    { enabled: activeMissionId ? !!activeMissionId : !!activeBrandId, refetchOnWindowFocus: false }
  );

  const brands = brandsQuery.data ?? [];
  const active = conversations.find((c) => c.id === activeId) ?? null;
  const activeBrand = brands.find((b: any) => b.id === activeBrandId) ?? brands[0] ?? null;

  useEffect(() => {
    if (brandsQuery.isSuccess && brands.length === 0) setShowOnboarding(true);
    if (brands.length > 0 && !activeBrandId) {
      // Prefer initialBrandId from parent (WorkspacePage) if provided
      const preferred = initialBrandId
        ? brands.find((b: any) => b.id === initialBrandId)
        : null;
      const def = preferred ?? brands.find((b: any) => b.isDefault) ?? brands[0];
      setActiveBrandId(def.id);
    }
  }, [brandsQuery.isSuccess, brands.length, activeBrandId, brands, initialBrandId]);

  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (preselectedAgent) setTimeout(() => chatInputRef.current?.focus(), 150);
  }, [preselectedAgent]);

  // Mission 切換：自動啟動 Agent（__AUTO_START__ 模式）或顯示靜態歡迎詞
  const autoStartedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!activeMissionId || !missionDataQuery.data) return;
    const missionData = missionDataQuery.data as any;
    if (!missionData.welcomeMessage) return;

    const missionConvId = `conv-mission-${activeMissionId}`;
    const isAutoStart = missionData.welcomeMessage === "__AUTO_START__";
    const squadSlug: string = missionData.squadSlug ?? "";

    // Reset state
    setActiveId(missionConvId);
    setConversationHistory([]);
    setTeamAssembly(null);
    setRelaySteps([]);
    setPendingTask("");
    setAwaitingApproval(false);
    setSquadStep({ currentStep: 0, totalSteps: 10, isComplete: false });
    setStreamingAgentName(null);
    setStreamingAgentTitle(null);

    // Init conversation if not exists
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === missionConvId);
      if (existing) return prev;
      return [{ id: missionConvId, title: missionData.title, messages: [], createdAt: Date.now() }, ...prev];
    });

    // Auto-start: trigger Agent immediately without user input
    if (isAutoStart && squadSlug && !autoStartedRef.current.has(activeMissionId)) {
      autoStartedRef.current.add(activeMissionId);

      // Small delay to let conversation state settle
      setTimeout(async () => {
        const token = localStorage.getItem("authToken");
        if (!token) return;

        // Auto-trigger message (invisible to user, just starts the flow)
        const autoMsg = "開始";
        setLoading(true);
        setStreamingAgentName(null);
        setStreamingAgentTitle(null);

        let streamBuffer = "";
        const streamMsgId = `auto-${Date.now()}`;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === missionConvId
              ? { ...c, messages: [...c.messages, { id: streamMsgId, role: "assistant" as const, content: "", ts: Date.now() }] }
              : c
          )
        );

        try {
          const brandCtx = {
            name: activeBrand?.name,
            industry: (activeBrand as any)?.industry ?? (activeBrand as any)?.soworkAnalysis?.industry,
            website: (activeBrand as any)?.websiteUrl,
            targetAudience: (activeBrand as any)?.targetAudience,
            description: (activeBrand as any)?.description,
          };

          const resp = await fetch("/api/stream/squad-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              squadSlug,
              missionId: activeMissionId,
              userMessage: autoMsg,
              conversationHistory: [],
              brandContext: brandCtx,
              currentStep: 0,
            }),
          });

          if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let lastAgentName: string | undefined;
          let lastAgentTitle: string | undefined;
          let lastAgentModel: string | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split(String.fromCharCode(10));
            buf = lines.pop() ?? "";
            let curEvent = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) curEvent = line.slice(7).trim();
              else if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (curEvent === "agent") {
                    lastAgentName = data.agentName;
                    lastAgentTitle = data.agentTitle;
                    lastAgentModel = data.agentModel ?? null;
                    setStreamingAgentName(data.agentName);
                    setStreamingAgentTitle(data.agentTitle);
                    setStreamingModel(data.agentModel ? formatModelName(data.agentModel) : null);
                    setSquadStep((prev) => ({ ...prev, currentStep: data.step, totalSteps: data.totalSteps, agentName: data.agentName, agentTitle: data.agentTitle }));
                  } else if (curEvent === "delta") {
                    streamBuffer += data.text;
                    setConversations((prev) =>
                      prev.map((c) =>
                        c.id === missionConvId
                          ? { ...c, messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: streamBuffer } : m) }
                          : c
                      )
                    );
                  } else if (curEvent === "done") {
                    lastAgentModel = data.agentModel ?? lastAgentModel;
                    setSquadStep((prev) => ({ ...prev, currentStep: data.step, totalSteps: data.totalSteps, isComplete: data.isComplete }));
                  }
                } catch { /* ignore */ }
              }
            }
          }

          setConversations((prev) =>
            prev.map((c) =>
              c.id === missionConvId
                ? { ...c, messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: streamBuffer || "（分析完成）", agentName: lastAgentName, agentTitle: lastAgentTitle, agentModel: lastAgentModel } : m) }
                : c
            )
          );
          setConversationHistory([{ role: "assistant", content: streamBuffer }]);
        } catch (err: any) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === missionConvId
                ? { ...c, messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: `⚠️ 自動啟動失敗：${err?.message}` } : m) }
                : c
            )
          );
        } finally {
          setLoading(false);
        }
      }, 400);
    } else if (!isAutoStart) {
      // Static welcome message
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === missionConvId);
        if (existing && existing.messages.length > 0) return prev;
        const welcomeMsg: Msg = { id: `welcome-${activeMissionId}`, role: "assistant", content: missionData.welcomeMessage!, ts: Date.now() };
        if (existing) return prev.map((c) => c.id === missionConvId ? { ...c, messages: [welcomeMsg] } : c);
        return [{ id: missionConvId, title: missionData.title, messages: [welcomeMsg], createdAt: Date.now() }, ...prev.filter(c => c.id !== missionConvId)];
      });
    }
  }, [activeMissionId, missionDataQuery.data]);

  useEffect(() => {
    // If mission is active, auto-start will handle conversation init — skip history load
    if (activeMissionId) return;
    if (!historyQuery.data || historyQuery.data.length === 0) return;
    if (conversations.length > 0) return;
    const msgs: Msg[] = historyQuery.data.map((row: any) => {
      const parsed = renderContent(row.content);
      return {
        id: `db-${row.id}`,
        role: row.role as "user" | "assistant",
        content: parsed.main,
        thinking: parsed.thinking,
        taskId: row.taskId ?? undefined,
        ts: new Date(row.createdAt).getTime(),
      };
    });
    if (msgs.length > 0) {
      const convId = `conv-history-${activeBrandId}`;
      setConversations([{ id: convId, title: "歷史對話", messages: msgs, brandId: activeBrandId ?? undefined, brandName: activeBrand?.name, createdAt: msgs[0].ts }]);
      setActiveId(convId);
      setConversationHistory(msgs.slice(-5).map((m) => ({ role: m.role, content: m.content })));
    }
  }, [historyQuery.data, conversations.length, activeBrandId, activeBrand?.name]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, loading, teamAssembly, relaySteps]);

  useEffect(() => {
    if (!matchQuery.data || pendingTask === "") return;
    const agents = matchQuery.data.agents?.length
      ? matchQuery.data.agents
      : [{ id: 0, name: "策略總監", title: "CMO / 首席行銷官", layer: "strategy", specialty: "品牌策略與任務拆解" }];
    const plan = matchQuery.data.plan?.length
      ? matchQuery.data.plan
      : agents.map((a: any, i: number) => ({ step: i + 1, agentName: a.name, agentTitle: a.title, layer: a.layer, action: i === 0 ? "分析任務與制定策略" : i === 1 ? "執行內容產出" : "整合輸出與交付" }));

    setTeamAssembly({ phase: "assembling", agents, plan, taskType: matchQuery.data.taskType, taskText: pendingTask });

    const timer = setTimeout(() => {
      const relays = plan.map((step: any, idx: number) => ({
        id: idx + 1,
        label: step.action,
        agentName: step.agentName,
        agentTitle: step.agentTitle,
        layer: step.layer,
        status: "pending" as const,
        eta: idx === 0 ? "1-2 分鐘" : idx === 1 ? "2-4 分鐘" : "1 分鐘",
        summary: undefined,
        expanded: false,
      }));
      setRelaySteps(relays);
      setTeamAssembly((prev) => prev ? { ...prev, phase: "proposal" } : prev);
      setAwaitingApproval(true);
    }, 1200);

    return () => clearTimeout(timer);
  }, [matchQuery.data, pendingTask]);

  const newConv = () => {
    const id = `conv-${Date.now()}`;
    setConversations((prev) => [{ id, title: "新對話", messages: [], brandId: activeBrand?.id, brandName: activeBrand?.name, createdAt: Date.now() }, ...prev]);
    setActiveId(id);
    setConversationHistory([]);
    setTeamAssembly(null);
    setRelaySteps([]);
    setPendingTask("");
    setAwaitingApproval(false);
  };

  const runRelayAnimation = () => {
    relaySteps.forEach((step, idx) => {
      setTimeout(() => {
        setRelaySteps((prev) => prev.map((s) => s.id === step.id ? { ...s, status: "running" } : s));
      }, idx * 1600);
      setTimeout(() => {
        setRelaySteps((prev) => prev.map((s) => s.id === step.id ? {
          ...s,
          status: "done",
          summary: `${step.agentName} 已完成「${step.label}」，產出核心結果並交接給下一位代理。`,
        } : s));
      }, idx * 1600 + 1100);
    });
  };

  const executeSquadChat = async (text: string, convId: string): Promise<boolean> => {
    const missionData = missionDataQuery.data as any;
    const squadSlug: string = missionData?.squadSlug ?? "";
    if (!squadSlug) return false;
    const token = localStorage.getItem("authToken");
    if (!token) return false;

    // ── 用戶反遈偵測：負面評價 / 要求重做 ──
    const isNegativeFeedback = /不對|不好|不滳意|不喜歡|不要這個|不是這樣|重做|重新|撤销|差太遠|跟我想的不一樣|no|wrong|redo|again/i.test(text);
    if (isNegativeFeedback) {
      // 立即回應返回與確認問題
      const clarifyMsgId = `clarify-${Date.now()}`;
      const currentAgent = streamingAgentName ?? missionData?.title ?? "Agent";
      const clarifyContent = `我聽到了，你對這個方向不满意。讓我确認一下：

**不满意的地方是？**（請選擇其一）
1️⃣ 內容方向不對，請告訴我你想要的方向
2️⃣ 分析結果不準確，我重新搜尋資料
3️⃣ 說明風格不對，我調整语調重做
4️⃣ 完全不對，用其他 Agent 重新分析

單純回覆數字或告訴我具體哪裡不對，我马上重做。`;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: [...c.messages, { id: clarifyMsgId, role: "assistant" as const, content: clarifyContent, agentName: currentAgent, ts: Date.now() }] }
            : c
        )
      );
      return true;
    }

    setLoading(true);
    setStreamingAgentName(null);
    setStreamingAgentTitle(null);

    let streamBuffer = "";
    let lastAgentModel: string | null = null;
    const streamMsgId = `squad-stream-${Date.now()}`;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? { ...c, messages: [...c.messages, { id: streamMsgId, role: "assistant" as const, content: "", ts: Date.now() }] }
          : c
      )
    );

    try {
      const brandCtx = {
        name: (activeBrand as any)?.name,
        industry: (activeBrand as any)?.industry,
        website: (activeBrand as any)?.websiteUrl,
        targetAudience: (activeBrand as any)?.targetAudience,
        description: (activeBrand as any)?.description,
      };
      const resp = await fetch("/api/stream/squad-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          squadSlug,
          missionId: activeMissionId,
          userMessage: text,
          conversationHistory: conversationHistory.slice(-12),
          brandContext: brandCtx,
          currentStep: squadStep.currentStep,
        }),
      });
      if (!resp.ok || !resp.body) throw new Error(`squad-chat HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastAgentName: string | undefined;
      let lastAgentTitle: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        let curEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            curEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (curEvent === "agent") {
                lastAgentName = data.agentName;
                lastAgentTitle = data.agentTitle;
                lastAgentModel = data.agentModel ?? null;
                setStreamingAgentName(data.agentName);
                setStreamingAgentTitle(data.agentTitle);
                setSquadStep((prev) => ({ ...prev, currentStep: data.step, totalSteps: data.totalSteps, agentName: data.agentName, agentTitle: data.agentTitle, agentRole: data.agentRole }));
              } else if (curEvent === "delta") {
                streamBuffer += data.text;
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === convId
                      ? { ...c, messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: streamBuffer } : m) }
                      : c
                  )
                );
              } else if (curEvent === "done") {
                lastAgentModel = data.agentModel ?? lastAgentModel;
                setSquadStep((prev) => ({ ...prev, currentStep: data.step, totalSteps: data.totalSteps, isComplete: data.isComplete }));
              }
            } catch { /* ignore */ }
          }
        }
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: streamBuffer || "（Agent 回覆完成）", agentName: lastAgentName, agentTitle: lastAgentTitle, agentModel: lastAgentModel } : m) }
            : c
        )
      );
      setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: streamBuffer }].slice(-14));
      setLoading(false);
      return true;
    } catch (err: any) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: `⚠️ Squad chat 錯誤：${err?.message ?? "未知"}，切換一般模式...` } : m) }
            : c
        )
      );
      setLoading(false);
      return false;
    }
  };

  const executeTask = async (text: string, convId: string) => {
    const workflowId = detectA2AWorkflow(text);
    if (workflowId) {
      sseRef.current?.close();
      setA2aSteps([]);
      setA2aProgress(0);
      setA2aTaskName(undefined);
      const token = localStorage.getItem("authToken");
      const url = `/api/a2a/stream?workflowId=${workflowId}${activeBrand?.id ? `&brandId=${activeBrand.id}` : ""}`;
      const sse = new EventSource(url + (token ? `&_token=${encodeURIComponent(token)}` : ""));
      sseRef.current = sse;

      sse.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "workflow_start") {
            setA2aTaskName(event.name);
            setA2aSteps([]);
          } else if (event.type === "node_start") {
            setA2aSteps((prev) => {
              const exists = prev.find((s) => s.id === event.step);
              if (exists) return prev.map((s) => s.id === event.step ? { ...s, status: "running" } : s);
              return [...prev, { id: event.step, label: event.nodeName, status: "running" }];
            });
            setA2aProgress(Math.round(((event.step - 1) / event.total) * 100));
          } else if (event.type === "node_done") {
            setA2aSteps((prev) => prev.map((s) => s.id === event.step ? { ...s, status: "done" } : s));
            setA2aProgress(Math.round((event.step / event.total) * 100));
          } else if (event.type === "node_error") {
            setA2aSteps((prev) => prev.map((s) => s.label === event.nodeName ? { ...s, status: "error" } : s));
          } else if (event.type === "workflow_done") {
            setA2aProgress(100);
          } else if (event.type === "result") {
            const outputs = Object.entries(event.result.nodeResults as Record<string, any>)
              .filter(([, v]) => v.output)
              .map(([nodeId, v]) => `**${nodeId.replace(/-/g, " ")}**\n${v.output?.slice(0, 400)}...`)
              .join("\n\n---\n\n");
            const content = outputs || "工作流已完成";
            const aMsg: Msg = { id: `a2a-${Date.now()}`, role: "assistant", content, ts: Date.now() };
            setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, aMsg] } : c));
            saveMessage.mutate({ brandId: activeBrand?.id, missionId: activeMissionId ?? undefined, role: "assistant", content });
            sse.close();
            setLoading(false);
            setTeamAssembly((prev) => prev ? { ...prev, phase: "done" } : prev);
          }
        } catch {}
      };
      sse.onerror = () => { sse.close(); setLoading(false); };
      return;
    }

    try {
      // ── A2A BullMQ workflow.start 路徑 ────────────────────────────────────
      const { jobId } = await workflowStart.mutateAsync({
        userRequest: text,
        brand: activeBrand?.name,
        industry: (activeBrand as any)?.industry,
        taskType: detectTaskType(text),
      });

      if (!jobId) throw new Error('No jobId returned from workflow.start');

      // 輪詢得到結果
      const workflowResult = await pollWorkflowResult(jobId as string);

      let content = "";
      let thinking = "";
      let resultModel = "";
      let resultAgentName = "";
      let resultAgentTitle = "";
      if (workflowResult && typeof workflowResult === 'object') {
        content = workflowResult.publishable_content
          ?? workflowResult.output
          ?? workflowResult.result
          ?? JSON.stringify(workflowResult);
        thinking = workflowResult.thinking ?? "";
        resultModel = workflowResult.model ?? "";
        resultAgentName = workflowResult.agent?.name ?? "";
        resultAgentTitle = workflowResult.agent?.title ?? "";
      } else if (typeof workflowResult === 'string') {
        try {
          const p = JSON.parse(workflowResult);
          content = p.publishable_content ?? workflowResult;
          thinking = p.thinking ?? "";
          resultModel = p.model ?? "";
          resultAgentName = p.agent?.name ?? "";
          resultAgentTitle = p.agent?.title ?? "";
        } catch { content = workflowResult; }
      } else {
        content = '任務已完成，但未有產出內容';
      }

      const aMsg: Msg = { id: `a-${Date.now()}`, role: "assistant", content, thinking, ts: Date.now(), model: resultModel || undefined, agentName: resultAgentName || undefined, agentTitle: resultAgentTitle || undefined };
      setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, aMsg] } : c));
      saveMessage.mutate({ brandId: activeBrand?.id, missionId: activeMissionId ?? undefined, role: "assistant", content });
      setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content }].slice(-10));
      setTeamAssembly((prev) => prev ? { ...prev, phase: "done" } : prev);
    } catch (err: any) {
      // Fallback: 如果 workflow.start 失敗，回退到 createAndExecute
      try {
        let description = text;
        if (activeBrand) {
          const soworkAnalysis = activeBrand.soworkAnalysis as Record<string, unknown> | null | undefined;
          description = text + `\n\n[品牌背景：${activeBrand.name}，目標受眾：${(activeBrand as any).targetAudience || ""}，品牌定位：${soworkAnalysis?.positioning as string || ""}]`;
        }
        const result = await createAndExecute.mutateAsync({
          title: text,
          description,
          brandId: activeBrand?.id,
          conversationHistory: conversationHistory.slice(-5),
        });
        let content = "", thinking = "";
        if (result.output) {
          try {
            const p = JSON.parse(result.output);
            content = p.publishable_content ?? result.output;
            thinking = p.thinking ?? "";
          } catch { content = result.output; }
        } else if (result.error) {
          content = `很抱歉，發生錯誤：${result.error}`;
        }
        const aMsg: Msg = { id: `a-${Date.now()}`, role: "assistant", content, thinking, ts: Date.now() };
        setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, aMsg] } : c));
        saveMessage.mutate({ brandId: activeBrand?.id, missionId: activeMissionId ?? undefined, role: "assistant", content });
        setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content }].slice(-10));
        setTeamAssembly((prev) => prev ? { ...prev, phase: "done" } : prev);
      } catch (fallbackErr: any) {
        setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, { id: `e-${Date.now()}`, role: "assistant" as const, content: `很抱歉，發生錯誤：${fallbackErr?.message ?? "未知錯誤"}`, ts: Date.now() }] } : c));
      }
    } finally {
      setLoading(false);
    }
  };

  const approveExecution = async () => {
    if (!teamAssembly?.taskText || !activeId) return;
    setAwaitingApproval(false);
    setLoading(true);
    setTeamAssembly((prev) => prev ? { ...prev, phase: "executing" } : prev);
    runRelayAnimation();
    await executeTask(teamAssembly.taskText, activeId);
    setPendingTask("");
  };

  const handleSend = async () => {
    const rawText = input.trim();
    if (!rawText || loading) return;
    stopRef.current = false;
    setIsStopped(false);
    setStreamingThinking("");
    setStreamingModel(null);
    const text = preselectedAgent
      ? `[指定${preselectedAgent.type === 'agent' ? 'Agent' : 'Squad'}：${preselectedAgent.name}] ${rawText}`
      : rawText;
    setInput("");
    if (preselectedAgent && onClearAgent) onClearAgent();

    let convId = activeId;
    if (!convId) {
      const id = `conv-${Date.now()}`;
      setConversations((prev) => [{ id, title: text.slice(0, 30), messages: [], brandId: activeBrand?.id, brandName: activeBrand?.name, createdAt: Date.now() }, ...prev]);
      setActiveId(id);
      convId = id;
    }

    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() };
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, title: c.messages.length === 0 ? text.slice(0, 32) : c.title, messages: [...c.messages, userMsg] } : c));
    saveMessage.mutate({ brandId: activeBrand?.id, missionId: activeMissionId ?? undefined, role: "user", content: text });

    const missionSlug = (missionDataQuery.data as any)?.squadSlug;
    if (activeMissionId && missionSlug) {
      const handled = await executeSquadChat(text, convId);
      if (handled) return;
    }

    if (isTaskLike(text)) {
      setTeamAssembly({ phase: "analyzing", agents: [], plan: [], taskText: text });
      setRelaySteps([]);
      setPendingTask(text);
      return;
    }

    setLoading(true);
    await executeTask(text, convId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleOnboardingComplete = (brandId: number) => {
    setShowOnboarding(false);
    setActiveBrandId(brandId);
    brandsQuery.refetch();
  };

  const toggleSummary = (id: number) => {
    setRelaySteps((prev) => prev.map((s) => s.id === id ? { ...s, expanded: !s.expanded } : s));
  };

  if (showOnboarding) return <OnboardingWizard onComplete={handleOnboardingComplete} />;

  return (
    <div className="flex h-screen bg-white dark:bg-[#212121] overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Squad 步驟進度條 + 換 Squad 按鈕 */}
        {activeMissionId && (missionDataQuery.data as any)?.squadSlug && squadStep.currentStep > 0 && (
          <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 shrink-0 bg-neutral-50 dark:bg-neutral-900/60">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {streamingAgentName && <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 truncate">{streamingAgentName}</span>}
                  {streamingAgentTitle && <span className="text-xs text-neutral-400 dark:text-neutral-500 truncate hidden sm:inline">· {streamingAgentTitle}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
                    Step {squadStep.currentStep}/{squadStep.totalSteps}{squadStep.isComplete ? " ✅" : ""}
                  </span>
                  {/* 換小組按鈕 */}
                  <button
                    onClick={() => {
                      const msg = `我想換一支不同的小組來執行這個任務，請列出可選的 Squad 選項`;
                      setInput(msg);
                    }}
                    className="text-[10px] text-neutral-400 hover:text-neutral-600 bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 px-2 py-0.5 rounded-full transition-colors"
                  >
                    換 Squad
                  </button>
                </div>
              </div>
              <div className="w-full h-1 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                <div className="h-full rounded-full bg-neutral-700 dark:bg-neutral-300 transition-all duration-500"
                  style={{ width: `${Math.round((squadStep.currentStep / squadStep.totalSteps) * 100)}%` }} />
              </div>
            </div>
          </div>
        )}
        {/* Status badges */}
        {(loading || awaitingApproval) && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
            {loading && <span className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full font-medium animate-pulse">執行中…</span>}
            {awaitingApproval && <span className="text-xs text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full font-medium">等待批准</span>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto" onClick={() => setBrandMenuOpen(false)}>
          {(!active || active.messages.length === 0) && !loading && !teamAssembly ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 px-6 py-12">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center text-2xl">🤖</div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-1">{activeBrand ? `${activeBrand.name} 的自主代理團隊` : "啟動自主代理任務"}</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-500">輸入任務後，系統會先提案團隊與執行計劃，再接力式自動完成。</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  { label: "📘 品牌定位報告", text: "幫我做一份品牌定位報告" },
                  { label: "✍️ 廣告文案組合", text: "幫我寫一組 Facebook 廣告文案" },
                  { label: "🔍 市場調研分析", text: "幫我做市場調研分析報告" },
                  { label: "📅 社群內容規劃", text: "幫我規劃社群媒體月曆" },
                ].map((s) => (
                  <button key={s.label} onClick={() => setInput(s.text)} className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-400 hover:border-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">{s.label}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
              {(active?.messages ?? []).map((msg) => (
                <div key={msg.id} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && <div className="w-8 h-8 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0 mt-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" /></svg></div>}
                  <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    {msg.role === "assistant" && msg.thinking && (
                      <details className="w-full">
                        <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-600 select-none">策略思考過程</summary>
                        <div className="mt-2 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-500 leading-relaxed border border-neutral-200 dark:border-neutral-700" dangerouslySetInnerHTML={{ __html: formatText(msg.thinking) }} />
                      </details>
                    )}
                    {msg.role === "assistant" ? (
                      <div className="w-full rounded-2xl rounded-bl-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                        {(msg.agentName || msg.model || msg.agentModel) && (
                          <div className="px-4 pt-2.5 pb-1 flex items-center gap-1.5 border-b border-neutral-200 dark:border-neutral-700">
                            {msg.agentName && <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{msg.agentName}</span>}
                            {msg.agentTitle && <span className="text-xs text-neutral-400 dark:text-neutral-500">{msg.agentTitle}</span>}
                            {(msg.agentModel || msg.model) && (
                              <span className="text-[10px] text-indigo-500 dark:text-indigo-400 ml-auto bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
                                {formatModelName(msg.agentModel ?? msg.model ?? "")}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="px-4 py-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100" dangerouslySetInnerHTML={{ __html: formatText(msg.content || (msg.thinking ? "✅ 分析完成，請查看策略思考過程" : "（無輸出內容）")) }} />
                        {/* Export buttons */}
                        {msg.content && msg.content.length > 50 && (
                          <div className="px-4 pb-3 pt-1 flex items-center gap-2 border-t border-neutral-200 dark:border-neutral-700">
                            <span className="text-[10px] text-neutral-400 mr-1">匯出：</span>
                            <button
                              onClick={async () => {
                                const token = localStorage.getItem("authToken");
                                if (!token) return;
                                const res = await fetch("/api/export/pptx", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ title: msg.agentTitle ?? "SoWork 報告", content: msg.content, brandName: activeBrand?.name }),
                                });
                                if (res.ok) {
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url; a.download = "sowork-report.pptx"; a.click();
                                  URL.revokeObjectURL(url);
                                }
                              }}
                              className="text-[10px] px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600 transition-colors font-medium"
                            >
                              📥 下載 PPT
                            </button>
                            <button
                              onClick={async () => {
                                const token = localStorage.getItem("authToken");
                                if (!token) return;
                                const res = await fetch("/api/export/docx", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ title: msg.agentTitle ?? "SoWork 報告", content: msg.content, brandName: activeBrand?.name }),
                                });
                                if (res.ok) {
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url; a.download = "sowork-report.docx"; a.click();
                                  URL.revokeObjectURL(url);
                                }
                              }}
                              className="text-[10px] px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors font-medium"
                            >
                              📄 下載 Word
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900" style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                    )}
                  </div>
                </div>
              ))}

              {teamAssembly && <div className="-mx-4"><TeamAssemblyPanel state={teamAssembly} relaySteps={relaySteps} onApprove={approveExecution} onToggleSummary={toggleSummary} /></div>}

            {/* Sprint 5: Typed Thread Cards */}
            {relaySteps.length > 0 && (
              <div className="mt-4 space-y-3">
                <h4 className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Execution Thread</h4>
                {relaySteps.filter(s => s.status === 'done').map((step, i) => (
                  <TypedThreadCard
                    key={step.id}
                    cardType={i === 0 ? 'pm_agent' : 'specialist'}
                    agentName={step.agentName}
                    label={step.label}
                    status={step.status}
                    content={step.summary || ''}
                    stepIndex={i + 1}
                    totalSteps={relaySteps.length}
                  />
                ))}
              </div>
            )}

              {/* ── Perplexity-style Live Execution Card ── */}
              {loading && !teamAssembly && (
                <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 overflow-hidden shadow-sm">
                  {/* Header row */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-blue-100 dark:border-blue-800/60">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {streamingAgentName && <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">{streamingAgentName}</span>}
                        {streamingAgentTitle && <span className="text-xs text-blue-500 dark:text-blue-400">{streamingAgentTitle}</span>}
                        {streamingModel && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700">
                            {streamingModel}
                          </span>
                        )}
                        {!streamingAgentName && (
                          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">正在分析任務...</span>
                        )}
                      </div>
                    </div>
                    {/* Stop button */}
                    <button
                      onClick={handleStop}
                      className="shrink-0 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 bg-white dark:bg-red-900/20 dark:border-red-700 px-2.5 py-1 rounded-lg transition-colors font-medium"
                    >
                      ⏹ 停止
                    </button>
                  </div>
                  {/* Thinking stream */}
                  <div className="px-4 py-3 flex gap-2 items-start">
                    <div className="flex gap-1.5 items-center mt-1 shrink-0">{[0, 150, 300].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 italic leading-relaxed">
                      {streamingThinking ? streamingThinking.slice(0, 200) + (streamingThinking.length > 200 ? "…" : "") : "思考中，請稍候…"}
                    </p>
                  </div>
                </div>
              )}
              {isStopped && (
                <div className="text-xs text-neutral-400 text-center py-2">⏹ 已停止生成</div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-6 pt-3" onClick={() => setBrandMenuOpen(false)}>
          <div className="max-w-3xl mx-auto">
            {preselectedAgent && (
              <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl bg-orange-50 border border-orange-200 text-sm">
                <span className="text-orange-500">{preselectedAgent.type === 'agent' ? '🤖' : '👥'}</span>
                <span className="font-medium text-orange-700">{preselectedAgent.name}</span>
                {preselectedAgent.title && <span className="text-orange-500 text-xs">· {preselectedAgent.title}</span>}
                <span className="text-xs text-orange-400 ml-1">已選擇，輸入你的任務 👇</span>
                <button onClick={onClearAgent} className="ml-auto text-orange-300 hover:text-orange-500 text-xs">✕</button>
              </div>
            )}
            <div className="flex items-end gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 px-4 py-3">
              <textarea
                ref={chatInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={preselectedAgent ? `告訴 ${preselectedAgent.name} 你要完成的任務…` : (activeBrand ? `告訴我你想為「${activeBrand.name}」完成什麼任務…` : "選擇品牌後開始輸入任務…")}
                rows={1}
                disabled={loading}
                className="flex-1 resize-none bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 outline-none"
                style={{ maxHeight: 160, lineHeight: 1.6 }}
              />
              <button onClick={handleSend} disabled={!input.trim() || loading} className="shrink-0 w-9 h-9 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><IconSend /></button>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center mt-2">Enter 送出 · Shift+Enter 換行</p>
          </div>
        </div>
      </div>

      {(a2aSteps.length > 0 || (loading && a2aSteps.length > 0)) && (
        <TaskProgressTracker taskName={a2aTaskName} steps={a2aSteps} progress={a2aProgress} onComplete={() => {}} />
      )}

      {/* 右側任務流程 Rail — 只在 Squad 任務內顯示 */}
      {activeMissionId && (missionDataQuery.data as any)?.squadSlug && squadStep.totalSteps > 0 && (
        <MissionStepsRail
          squadSlug={(missionDataQuery.data as any).squadSlug}
          currentStep={squadStep.currentStep}
          totalSteps={squadStep.totalSteps}
        />
      )}
    </div>
  );
}
