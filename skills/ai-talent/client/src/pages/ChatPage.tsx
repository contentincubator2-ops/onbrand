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

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  contentType?: string;
  imageSuggestion?: string;
  taskId?: number;
  ts: number;
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

const IconSend = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IconChevron = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
const IconPlus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;

function renderContent(raw: string): { main: string; thinking: string } {
  try {
    const d = JSON.parse(raw);
    if (d.publishable_content) return { main: d.publishable_content, thinking: d.thinking || "" };
  } catch {}
  return { main: raw, thinking: "" };
}

function formatText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
}

function LayerBadge({ layer }: { layer: string }) {
  const map: Record<string, string> = {
    strategy: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    execution: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    training: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  };
  const label: Record<string, string> = {
    strategy: "策略層",
    execution: "執行層",
    training: "訓練層",
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[layer] ?? "bg-gray-100 text-gray-500"}`}>{label[layer] ?? layer}</span>;
}

function AgentAvatar({ name, layer }: { name: string; layer: string }) {
  const colors: Record<string, string> = { strategy: "bg-purple-600", execution: "bg-blue-600", training: "bg-green-600" };
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
      <div className="bg-white dark:bg-neutral-900 border border-indigo-200 dark:border-indigo-900/40 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">
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
              <p className="text-indigo-200 text-xs mt-0.5">Autonomous Agent Operations</p>
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
              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            {activeStep && (
              <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-2 font-medium">
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
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
                >
                  開始執行
                </button>
              )}
            </div>
            <div className="space-y-3">
              {relaySteps.map((step, i) => (
                <div key={step.id} className="relative pl-10">
                  {i < relaySteps.length - 1 && <div className="absolute left-[15px] top-8 bottom-[-14px] w-px bg-gray-200 dark:bg-neutral-700" />}
                  <div className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step.status === "done" ? "bg-green-600 text-white" : step.status === "running" ? "bg-indigo-600 text-white animate-pulse" : "bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-neutral-300"}`}>
                    {step.status === "done" ? "✓" : step.id}
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/70 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <AgentAvatar name={step.agentName} layer={step.layer} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800 dark:text-neutral-100">Step {step.id}. {step.label}</p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${step.status === "done" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : step.status === "running" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" : "bg-gray-100 text-gray-500 dark:bg-neutral-700 dark:text-neutral-300"}`}>
                            {step.status === "done" ? "已完成" : step.status === "running" ? "正在執行..." : "待執行"}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-neutral-500">ETA {step.eta}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1">{step.agentName} · {step.agentTitle}</p>
                        {step.summary && (
                          <div className="mt-2">
                            <button onClick={() => onToggleSummary(step.id)} className="text-xs text-indigo-600 dark:text-indigo-300 hover:underline">
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
          <div className="px-5 py-4 bg-indigo-50/60 dark:bg-indigo-950/20">
            <p className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">批准後，AI 團隊會一棒接一棒自動完成任務。</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  const createAndExecute = trpc.task.createAndExecute.useMutation();
  const saveMessage = trpc.conversation.saveMessage.useMutation();
  const brandsQuery = trpc.brand.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const matchQuery = trpc.agent.matchForTask.useQuery(
    { taskDescription: pendingTask },
    { enabled: pendingTask.length > 0, refetchOnWindowFocus: false }
  );
  const historyQuery = trpc.conversation.list.useQuery(
    { brandId: activeBrandId ?? undefined },
    { enabled: !!activeBrandId, refetchOnWindowFocus: false }
  );

  const brands = brandsQuery.data ?? [];
  const active = conversations.find((c) => c.id === activeId) ?? null;
  const activeBrand = brands.find((b: any) => b.id === activeBrandId) ?? brands[0] ?? null;

  useEffect(() => {
    if (brandsQuery.isSuccess && brands.length === 0) setShowOnboarding(true);
    if (brands.length > 0 && !activeBrandId) {
      const def = brands.find((b: any) => b.isDefault) ?? brands[0];
      setActiveBrandId(def.id);
    }
  }, [brandsQuery.isSuccess, brands.length, activeBrandId, brands]);

  useEffect(() => {
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
            saveMessage.mutate({ brandId: activeBrand?.id, role: "assistant", content });
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

      let content = "", thinking = "", contentType = "general", imageSuggestion = "";
      if (result.output) {
        try {
          const p = JSON.parse(result.output);
          content = p.publishable_content ?? result.output;
          thinking = p.thinking ?? "";
          contentType = p.content_type ?? "general";
          imageSuggestion = p.image_suggestion ?? "";
        } catch { content = result.output; }
      } else if (result.error) {
        content = `很抱歉，發生錯誤：${result.error}`;
      }

      const aMsg: Msg = { id: `a-${Date.now()}`, role: "assistant", content, thinking, contentType, imageSuggestion, taskId: result.taskId, ts: Date.now() };
      setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, aMsg] } : c));
      saveMessage.mutate({ brandId: activeBrand?.id, role: "assistant", content: result.output ?? content, taskId: result.taskId });
      setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content }].slice(-10));
      setTeamAssembly((prev) => prev ? { ...prev, phase: "done" } : prev);
    } catch (err: any) {
      setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, { id: `e-${Date.now()}`, role: "assistant" as const, content: `很抱歉，發生錯誤：${err?.message ?? "未知錯誤"}`, ts: Date.now() }] } : c));
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
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    let convId = activeId;
    if (!convId) {
      const id = `conv-${Date.now()}`;
      setConversations((prev) => [{ id, title: text.slice(0, 30), messages: [], brandId: activeBrand?.id, brandName: activeBrand?.name, createdAt: Date.now() }, ...prev]);
      setActiveId(id);
      convId = id;
    }

    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() };
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, title: c.messages.length === 0 ? text.slice(0, 32) : c.title, messages: [...c.messages, userMsg] } : c));
    saveMessage.mutate({ brandId: activeBrand?.id, role: "user", content: text });

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
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-indigo-600">🤖 Autonomous Agent Ops</span>
            {loading && <span className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full font-medium animate-pulse">執行中…</span>}
            {awaitingApproval && <span className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">等待批准</span>}
          </div>

          <div className="relative">
            <button onClick={() => setBrandMenuOpen((o) => !o)} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 bg-white dark:bg-neutral-900 transition-colors">
              <div className="w-4 h-4 rounded-full bg-neutral-800 dark:bg-neutral-200 shrink-0" />
              <span className="max-w-[140px] truncate">{activeBrand?.name ?? "選擇品牌"}</span>
              <IconChevron />
            </button>
            {brandMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800"><p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">我的品牌</p></div>
                {brands.map((b: any) => (
                  <button key={b.id} onClick={() => { setActiveBrandId(b.id); setBrandMenuOpen(false); }} className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${activeBrandId === b.id ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"}`}>
                    <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-500">{b.name.charAt(0)}</div>
                    <span className="truncate">{b.name}</span>
                    {b.isDefault && <span className="ml-auto text-xs text-neutral-400">預設</span>}
                  </button>
                ))}
                <div className="border-t border-neutral-100 dark:border-neutral-800">
                  <button onClick={() => { setShowOnboarding(true); setBrandMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-700 transition-colors"><IconPlus /> 新增品牌</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" onClick={() => setBrandMenuOpen(false)}>
          {(!active || active.messages.length === 0) && !loading && !teamAssembly ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 px-6 py-12">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl">🤖</div>
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
                  <button key={s.label} onClick={() => setInput(s.text)} className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">{s.label}</button>
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
                        <div className="px-4 py-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100" dangerouslySetInnerHTML={{ __html: formatText(msg.content) }} />
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

              {loading && !teamAssembly && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" /></svg></div>
                  <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3"><div className="flex gap-1.5 items-center h-5">{[0, 150, 300].map((d) => <span key={d} className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div></div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-6 pt-3" onClick={() => setBrandMenuOpen(false)}>
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 px-4 py-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeBrand ? `告訴我你想為「${activeBrand.name}」完成什麼任務…` : "選擇品牌後開始輸入任務…"}
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
    </div>
  );
}
