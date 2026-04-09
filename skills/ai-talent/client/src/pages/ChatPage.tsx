import { useState, useRef, useEffect } from "react";
import { trpc } from "../lib/trpc";
import OnboardingWizard from "./OnboardingWizard";
import TaskProgressTracker, { type TaskStep } from "../components/chat/TaskProgressTracker";

// ── A2A intent detection ──────────────────────────────────────────────────────
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

// ── Team Assembly types ───────────────────────────────────────────────────────
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
  phase: "analyzing" | "assembling" | "ready";
  agents: AssembledAgent[];
  plan: ExecutionStep[];
  taskType?: string;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconSend    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IconChevron = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
const IconPlus    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;

function renderContent(raw: string): { main: string; thinking: string } {
  try {
    const d = JSON.parse(raw);
    if (d.publishable_content) {
      return { main: d.publishable_content, thinking: d.thinking || "" };
    }
  } catch {}
  return { main: raw, thinking: "" };
}

function formatText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

// ── Layer badge ───────────────────────────────────────────────────────────────
function LayerBadge({ layer }: { layer: string }) {
  const map: Record<string, string> = {
    strategy:  "bg-purple-100 text-purple-700",
    execution: "bg-blue-100 text-blue-700",
    training:  "bg-green-100 text-green-700",
  };
  const label: Record<string, string> = {
    strategy:  "策略層",
    execution: "執行層",
    training:  "訓練層",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[layer] ?? "bg-gray-100 text-gray-500"}`}>
      {label[layer] ?? layer}
    </span>
  );
}

// ── Agent Avatar ──────────────────────────────────────────────────────────────
function AgentAvatar({ name, layer }: { name: string; layer: string }) {
  const colors: Record<string, string> = {
    strategy:  "bg-purple-600",
    execution: "bg-blue-600",
    training:  "bg-green-600",
  };
  return (
    <div className={`w-9 h-9 rounded-full ${colors[layer] ?? "bg-gray-500"} text-white flex items-center justify-center text-sm font-bold flex-shrink-0`}>
      {name.charAt(0)}
    </div>
  );
}

// ── Team Assembly Panel ───────────────────────────────────────────────────────
function TeamAssemblyPanel({ state }: { state: TeamAssemblyState }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              {state.phase === "analyzing" ? "🔍" : state.phase === "assembling" ? "🧩" : "✅"}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">
                {state.phase === "analyzing" && "OpenClaw 正在分析任務…"}
                {state.phase === "assembling" && "組建 AI 團隊中…"}
                {state.phase === "ready" && "AI 團隊已就緒，開始執行"}
              </p>
              <p className="text-indigo-200 text-xs mt-0.5">A2A 多代理協作架構</p>
            </div>
            {state.phase !== "ready" && (
              <div className="ml-auto flex gap-1">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agents — graceful fallback if no agents returned */}
        {state.agents.length === 0 && state.phase !== "analyzing" && (
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">策</div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800">策略總監</p>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">策略層</span>
                </div>
                <p className="text-xs text-gray-500">CMO / 首席行銷官</p>
              </div>
              <span className="text-green-500 text-sm ml-auto">✓</span>
            </div>
          </div>
        )}
        {state.agents.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">本次任務團隊</p>
            <div className="space-y-2.5">
              {state.agents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3">
                  <AgentAvatar name={agent.name} layer={agent.layer} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{agent.name}</p>
                      <LayerBadge layer={agent.layer} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">{agent.title}</p>
                    {agent.specialty && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{agent.specialty.slice(0, 60)}</p>
                    )}
                  </div>
                  <span className="text-green-500 text-sm">✓</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Execution plan */}
        {state.plan.length > 0 && (
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">執行計劃</p>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-3.5 top-4 bottom-4 w-px bg-gray-200" />
              <div className="space-y-3">
                {state.plan.map((step, i) => (
                  <div key={step.step} className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 z-10 ${
                      i === 0 ? "bg-purple-600 text-white" :
                      i === 1 ? "bg-blue-600 text-white" :
                                "bg-green-600 text-white"
                    }`}>
                      {step.step}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <p className="text-sm font-medium text-gray-800">{step.action}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{step.agentName} · {step.agentTitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [conversations, setConversations]           = useState<Conversation[]>([]);
  const [activeId, setActiveId]                     = useState<string | null>(null);
  const [input, setInput]                           = useState("");
  const [loading, setLoading]                       = useState(false);
  const [brandMenuOpen, setBrandMenuOpen]           = useState(false);
  const [activeBrandId, setActiveBrandId]           = useState<number | null>(null);
  const [showOnboarding, setShowOnboarding]         = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([]);

  // A2A tracker state
  const [a2aSteps, setA2aSteps]       = useState<TaskStep[]>([]);
  const [a2aProgress, setA2aProgress] = useState(0);
  const [a2aTaskName, setA2aTaskName] = useState<string | undefined>(undefined);
  const sseRef = useRef<EventSource | null>(null);

  // Team Assembly state
  const [teamAssembly, setTeamAssembly] = useState<TeamAssemblyState | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const createAndExecute = trpc.task.createAndExecute.useMutation();
  const saveMessage       = trpc.conversation.saveMessage.useMutation();
  const brandsQuery       = trpc.brand.list.useQuery(undefined, { refetchOnWindowFocus: false });

  const brands      = brandsQuery.data ?? [];
  const active      = conversations.find((c) => c.id === activeId) ?? null;
  const activeBrand = brands.find((b) => b.id === activeBrandId) ?? brands[0] ?? null;

  // matchForTask query (lazy — only fires when taskDescription is set)
  const [pendingTask, setPendingTask] = useState<string>("");
  const matchQuery = trpc.agent.matchForTask.useQuery(
    { taskDescription: pendingTask },
    { enabled: pendingTask.length > 0, refetchOnWindowFocus: false }
  );

  const historyQuery = trpc.conversation.list.useQuery(
    { brandId: activeBrandId ?? undefined },
    { enabled: !!activeBrandId, refetchOnWindowFocus: false }
  );

  // Init brand
  useEffect(() => {
    if (brandsQuery.isSuccess && brands.length === 0) setShowOnboarding(true);
    if (brands.length > 0 && !activeBrandId) {
      const def = brands.find((b) => b.isDefault) ?? brands[0];
      setActiveBrandId(def.id);
    }
  }, [brandsQuery.isSuccess, brands.length]);

  // Load history into conversations
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
      setConversations([{
        id: convId, title: "歷史對話",
        messages: msgs, brandId: activeBrandId ?? undefined, brandName: activeBrand?.name,
        createdAt: msgs[0].ts,
      }]);
      setActiveId(convId);
      setConversationHistory(msgs.slice(-5).map((m) => ({ role: m.role, content: m.content })));
    }
  }, [historyQuery.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, loading, teamAssembly]);

  // When matchQuery resolves, advance team assembly
  useEffect(() => {
    if (!matchQuery.data || pendingTask === "") return;
    setTeamAssembly({
      phase:    "assembling",
      agents:   matchQuery.data.agents,
      plan:     matchQuery.data.plan,
      taskType: matchQuery.data.taskType,
    });
    // After 1.5s, mark as ready then execute
    const timer = setTimeout(() => {
      setTeamAssembly((prev) => prev ? { ...prev, phase: "ready" } : prev);
    }, 1500);
    return () => clearTimeout(timer);
  }, [matchQuery.data]);

  const newConv = () => {
    const id = `conv-${Date.now()}`;
    setConversations((prev) => [{
      id, title: "新對話", messages: [],
      brandId: activeBrand?.id, brandName: activeBrand?.name, createdAt: Date.now(),
    }, ...prev]);
    setActiveId(id);
    setConversationHistory([]);
    setTeamAssembly(null);
    setPendingTask("");
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
            setTeamAssembly(null);
          } else if (event.type === "error") {
            const aMsg: Msg = { id: `e-${Date.now()}`, role: "assistant", content: `A2A 錯誤：${event.message}`, ts: Date.now() };
            setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, aMsg] } : c));
            sse.close();
            setLoading(false);
            setTeamAssembly(null);
          }
        } catch { /* parse error, skip */ }
      };
      sse.onerror = () => { sse.close(); setLoading(false); setTeamAssembly(null); };
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

      const aMsg: Msg = {
        id: `a-${Date.now()}`, role: "assistant",
        content, thinking, contentType, imageSuggestion,
        taskId: result.taskId, ts: Date.now(),
      };
      setConversations((prev) => prev.map((c) =>
        c.id === convId ? { ...c, messages: [...c.messages, aMsg] } : c
      ));
      saveMessage.mutate({ brandId: activeBrand?.id, role: "assistant", content: result.output ?? content, taskId: result.taskId });
      setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content }].slice(-10));
    } catch (err: any) {
      setConversations((prev) => prev.map((c) =>
        c.id === convId ? { ...c, messages: [...c.messages, {
          id: `e-${Date.now()}`, role: "assistant" as const,
          content: `很抱歉，發生錯誤：${err?.message ?? "未知錯誤"}`, ts: Date.now(),
        }]} : c
      ));
    } finally {
      setLoading(false);
      setTeamAssembly(null);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    let convId = activeId;
    if (!convId) {
      const id = `conv-${Date.now()}`;
      setConversations((prev) => [{
        id, title: text.slice(0, 30), messages: [],
        brandId: activeBrand?.id, brandName: activeBrand?.name, createdAt: Date.now(),
      }, ...prev]);
      setActiveId(id);
      convId = id;
    }

    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() };
    setConversations((prev) => prev.map((c) =>
      c.id === convId
        ? { ...c, title: c.messages.length === 0 ? text.slice(0, 32) : c.title, messages: [...c.messages, userMsg] }
        : c
    ));
    saveMessage.mutate({ brandId: activeBrand?.id, role: "user", content: text });

    // Show "analyzing" phase
    setTeamAssembly({ phase: "analyzing", agents: [], plan: [] });

    // Trigger matchForTask (useQuery will fire automatically when pendingTask changes)
    setPendingTask(text);

    // Wait briefly for the "analyzing" animation, then auto-execute
    // The useEffect above will advance to "assembling" once matchQuery resolves
    // and after 1.5s set "ready". We execute after another 500ms.
    // Simpler approach: just execute after a short delay for UX
    const convIdFinal = convId;
    setTimeout(async () => {
      await executeTask(text, convIdFinal);
      setPendingTask("");
    }, 2500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleOnboardingComplete = (brandId: number, brandName: string) => {
    setShowOnboarding(false);
    setActiveBrandId(brandId);
    brandsQuery.refetch();
  };

  if (showOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="flex h-screen bg-white dark:bg-[#212121] overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-indigo-600">🤖 A2A 任務執行</span>
            {loading && (
              <span className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full font-medium animate-pulse">
                執行中…
              </span>
            )}
          </div>

          {/* Brand selector */}
          <div className="relative">
            <button
              onClick={() => setBrandMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 bg-white dark:bg-neutral-900 transition-colors"
            >
              <div className="w-4 h-4 rounded-full bg-neutral-800 dark:bg-neutral-200 shrink-0" />
              <span className="max-w-[140px] truncate">{activeBrand?.name ?? "選擇品牌"}</span>
              <IconChevron />
            </button>

            {brandMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">我的品牌</p>
                </div>
                {brands.map((b) => (
                  <button key={b.id}
                    onClick={() => { setActiveBrandId(b.id); setBrandMenuOpen(false); }}
                    className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      activeBrandId === b.id
                        ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium"
                        : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    }`}>
                    <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-500">
                      {b.name.charAt(0)}
                    </div>
                    <span className="truncate">{b.name}</span>
                    {b.isDefault && <span className="ml-auto text-xs text-neutral-400">預設</span>}
                  </button>
                ))}
                <div className="border-t border-neutral-100 dark:border-neutral-800">
                  <button
                    onClick={() => { setShowOnboarding(true); setBrandMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-700 transition-colors"
                  >
                    <IconPlus /> 新增品牌
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages + Team Assembly */}
        <div className="flex-1 overflow-y-auto" onClick={() => setBrandMenuOpen(false)}>
          {(!active || active.messages.length === 0) && !loading && !teamAssembly ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 px-6 py-12">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl">🤖</div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                  {activeBrand ? `${activeBrand.name} 的 AI 任務` : "啟動 AI 任務"}
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-500">
                  OpenClaw 會自動分析任務、組建最佳 AI 團隊，並執行到底
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  { label: "🚀 品牌上市工作流",    text: "幫我執行品牌上市完整工作流" },
                  { label: "🔍 市場調研工作流",    text: "幫我做市場調研分析報告" },
                  { label: "✍️ Facebook 廣告文案", text: "寫一則 Facebook 廣告文案" },
                  { label: "📊 競品定位分析",      text: "分析競品的品牌定位差異" },
                  { label: "📅 社群媒體月曆",      text: "設計社群媒體月曆" },
                  { label: "📰 PR 新聞稿",         text: "撰寫 PR 新聞稿" },
                ].map((s) => (
                  <button key={s.label} onClick={() => setInput(s.text)}
                    className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
              {/* Messages */}
              {(active?.messages ?? []).map((msg) => (
                <div key={msg.id} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0 mt-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
                      </svg>
                    </div>
                  )}
                  <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    {msg.role === "assistant" && msg.thinking && (
                      <details className="w-full">
                        <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-600 select-none">策略思考過程</summary>
                        <div className="mt-2 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-500 leading-relaxed border border-neutral-200 dark:border-neutral-700"
                          dangerouslySetInnerHTML={{ __html: formatText(msg.thinking) }}
                        />
                      </details>
                    )}
                    {msg.role === "assistant" ? (
                      <div className="w-full rounded-2xl rounded-bl-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                        <div className="px-4 py-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100"
                          dangerouslySetInnerHTML={{ __html: formatText(msg.content) }}
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900" style={{ whiteSpace: "pre-wrap" }}>
                        {msg.content}
                      </div>
                    )}
                    {msg.imageSuggestion && (
                      <p className="text-xs text-neutral-400 px-1">配圖：{msg.imageSuggestion}</p>
                    )}
                    {msg.role === "assistant" && (
                      <button onClick={() => navigator.clipboard.writeText(msg.content)}
                        className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors px-1">複製</button>
                    )}
                  </div>
                </div>
              ))}

              {/* Team Assembly Panel */}
              {teamAssembly && (
                <div className="-mx-4">
                  <TeamAssemblyPanel state={teamAssembly} />
                </div>
              )}

              {/* Loading dots (when no team assembly) */}
              {loading && !teamAssembly && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" /></svg>
                  </div>
                  <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5 items-center h-5">
                      {[0, 150, 300].map((d) => <span key={d} className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 pb-6 pt-3" onClick={() => setBrandMenuOpen(false)}>
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 px-4 py-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeBrand ? `告訴我你想為「${activeBrand.name}」做什麼任務…` : "選擇品牌後開始輸入任務…"}
                rows={1}
                disabled={loading}
                className="flex-1 resize-none bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 outline-none"
                style={{ maxHeight: 160, lineHeight: 1.6 }}
              />
              <button onClick={handleSend} disabled={!input.trim() || loading}
                className="shrink-0 w-9 h-9 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <IconSend />
              </button>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center mt-2">Enter 送出　·　Shift+Enter 換行</p>
          </div>
        </div>
      </div>

      {/* A2A Task Tracker (right panel, visible when A2A workflow running) */}
      {(a2aSteps.length > 0 || (loading && a2aSteps.length > 0)) && (
        <TaskProgressTracker
          taskName={a2aTaskName}
          steps={a2aSteps}
          progress={a2aProgress}
          onComplete={() => { /* keep visible until user closes */ }}
        />
      )}
    </div>
  );
}
