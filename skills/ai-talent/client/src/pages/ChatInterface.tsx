/**
 * ChatInterface — Full 3-column chat UI.
 * Left: AgentNavigation | Center: Chat | Right: TaskProgressTracker
 * Features: dark mode, mobile responsive, task step simulation, trpc task history.
 */
import { useState, useRef, useEffect } from "react";
import ChatInput from "../components/chat/ChatInput";
import MessageBubble, { type Message } from "../components/chat/MessageBubble";
import AgentNavigation, { type Agent } from "../components/chat/AgentNavigation";
import TaskProgressTracker, { type TaskStep } from "../components/chat/TaskProgressTracker";
import { trpc } from "../lib/trpc";

const AGENTS: Agent[] = [
  { id: 1, name: "陳映婕", title: "品牌策略總監", avatar: "品", status: "online",  specialty: "品牌定位" },
  { id: 2, name: "郭書蓉", title: "業務發展總監", avatar: "業", status: "busy",    specialty: "市場分析" },
  { id: 3, name: "楊庭志", title: "供應鏈顧問",   avatar: "供", status: "offline", specialty: "數據報告" },
];

const INITIAL_STEPS: TaskStep[] = [
  { id: 1, label: "解析需求",   status: "pending" },
  { id: 2, label: "查詢知識庫", status: "pending" },
  { id: 3, label: "生成策略",   status: "pending" },
  { id: 4, label: "格式化輸出", status: "pending" },
];

type MobileTab = "agents" | "chat" | "tasks" | "settings";

export default function ChatInterface() {
  const [activeAgentId, setActiveAgentId] = useState(AGENTS[0].id);
  const [activeModule, setActiveModule] = useState("brand");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", content: `嗨，我是${AGENTS[0].name}。有什麼可以幫你？`, ts: new Date() },
  ]);
  const [taskName, setTaskName] = useState<string | undefined>();
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load task history (trpc) — gracefully ignore auth errors in dev
  const { data: taskHistoryRaw } = trpc.task.list.useQuery({ limit: 5 }, {
    retry: false,
  } as Parameters<typeof trpc.task.list.useQuery>[1]);
  const taskHistory = taskHistoryRaw as Array<{ id: number; title?: string; status?: string }> | undefined;

  const activeAgent = AGENTS.find(a => a.id === activeAgentId)!;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Step simulation after send
  const runSteps = () => {
    if (isRunning) return;
    setIsRunning(true);
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: "pending" })));
    setProgress(0);

    INITIAL_STEPS.forEach((step, i) => {
      // Mark step as running
      setTimeout(() => {
        setSteps(prev => prev.map(s => s.id === step.id ? { ...s, status: "running" } : s));
        setProgress(Math.round(((i) / INITIAL_STEPS.length) * 100));
      }, i * 900);

      // Mark step as done
      setTimeout(() => {
        setSteps(prev => prev.map(s => s.id === step.id ? { ...s, status: "done" } : s));
        setProgress(Math.round(((i + 1) / INITIAL_STEPS.length) * 100));
        if (i === INITIAL_STEPS.length - 1) setIsRunning(false);
      }, i * 900 + 700);
    });
  };

  const handleSend = (text: string) => {
    const userMsg: Message = { id: Date.now(), role: "user", content: text, ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setTaskName(text.slice(0, 40) + (text.length > 40 ? "…" : ""));
    setMobileTab("tasks");

    runSteps();

    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: "assistant",
        content: `收到！我將以**${activeAgent.title}**的角色為你處理：「${text}」`,
        ts: new Date(),
      }]);
      setMobileTab("chat");
    }, INITIAL_STEPS.length * 900 + 200);
  };

  const handleAgentSelect = (id: number) => {
    setActiveAgentId(id);
    const agent = AGENTS.find(a => a.id === id)!;
    setMessages([
      { id: Date.now(), role: "assistant", content: `嗨，我是${agent.name}。有什麼可以幫你？`, ts: new Date() },
    ]);
    setSteps([]);
    setProgress(0);
    setTaskName(undefined);
    setMobileTab("chat");
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 font-sans overflow-hidden">
      {/* ── Left: Agent Nav (hidden on mobile unless mobileTab=agents) ── */}
      <div className={`${mobileTab === "agents" ? "flex" : "hidden"} md:flex flex-col w-64 flex-shrink-0`}>
        <AgentNavigation
          agents={AGENTS}
          activeId={activeAgentId}
          onSelect={handleAgentSelect}
          activeModule={activeModule}
          onModuleChange={setActiveModule}
        />
      </div>

      {/* ── Center: Chat ── */}
      <main className={`${mobileTab === "chat" ? "flex" : "hidden"} md:flex flex-1 flex-col min-w-0`}>
        {/* Header */}
        <div className="px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3 flex-shrink-0">
          <span className="w-9 h-9 rounded-full bg-[#FF6B35] text-white flex items-center justify-center font-semibold">
            {activeAgent.avatar}
          </span>
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{activeAgent.name}</p>
            <p className="text-xs text-gray-400">{activeAgent.title}</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {activeAgent.status === "online" ? "線上" : activeAgent.status === "busy" ? "忙碌" : "離線"}
          </span>
        </div>

        {/* Task history (if any from trpc) */}
        {taskHistory && taskHistory.length > 0 && (
          <div className="px-6 pt-3 pb-1">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5 font-medium">最近任務</p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {taskHistory!.slice(0, 3).map((t) => (
                <span key={t.id} className="flex-shrink-0 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-full">
                  {t.title ?? `任務 #${t.id}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map(m => (
            <MessageBubble key={m.id} message={m} agentName={activeAgent.name} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 pb-6 flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 pt-3">
          <ChatInput
            onSend={handleSend}
            placeholder={`向 ${activeAgent.name} 發送訊息…`}
            disabled={isRunning}
          />
        </div>
      </main>

      {/* ── Right: Task Progress (hidden on mobile unless mobileTab=tasks) ── */}
      <div className={`${mobileTab === "tasks" ? "flex" : "hidden"} md:flex flex-col w-72 flex-shrink-0`}>
        <TaskProgressTracker
          taskName={taskName}
          steps={steps}
          progress={progress}
        />
      </div>

      {/* ── Mobile bottom nav bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex md:hidden z-50">
        {(
          [
            { tab: "agents",   icon: "👥", label: "Agent" },
            { tab: "chat",     icon: "💬", label: "Chat" },
            { tab: "tasks",    icon: "📋", label: "Tasks" },
            { tab: "settings", icon: "⚙️", label: "Settings" },
          ] as { tab: MobileTab; icon: string; label: string }[]
        ).map(item => (
          <button
            key={item.tab}
            onClick={() => setMobileTab(item.tab)}
            className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
              mobileTab === item.tab ? "text-[#FF6B35]" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="mt-0.5">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
