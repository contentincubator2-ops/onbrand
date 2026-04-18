/**
 * AgentWorkspace — Lobster Architecture full-screen agent interface.
 * Advanced A2A agent workspace, separate from general /chat.
 */
import { useState } from "react";
import AgentNavigation, { type Agent } from "../components/mission-chat/AgentNavigation";
import MessageBubble, { type Message } from "../components/mission-chat/MessageBubble";
import ChatInput from "../components/mission-chat/ChatInput";
import TaskProgressTracker, { type TaskStep } from "../components/mission-chat/TaskProgressTracker";
import { trpc } from "../lib/trpc";

const DEMO_STEPS: TaskStep[] = [
  { id: 1, label: "分析品牌定位", status: "done" },
  { id: 2, label: "組建 A2A 團隊", status: "done" },
  { id: 3, label: "生成內容策略", status: "running" },
  { id: 4, label: "輸出報告", status: "pending" },
];

let _msgId = 1;
function makeMsg(role: "user" | "assistant", content: string): Message {
  return { id: _msgId++, role, content, ts: new Date() };
}

export default function AgentWorkspace() {
  const { data: agentData, isLoading } = trpc.agent.list.useQuery({ layer: undefined });

  const agents: Agent[] = (agentData ?? []).slice(0, 20).map(a => ({
    id:        a.id,
    name:      a.name,
    title:     a.title,
    avatar:    a.name.slice(0, 1),
    status:    "online" as const,
    specialty: a.specialty ?? undefined,
  }));

  const [activeId,     setActiveId]     = useState<number>(0);
  const [activeModule, setActiveModule] = useState("brand");
  const [messages,     setMessages]     = useState<Message[]>([
    makeMsg("assistant", "您好！我是您的 A2A Agent Workspace。請選擇左側的 Agent，或直接描述您的任務，我會為您組建最合適的執行團隊。"),
  ]);
  const [showTracker, setShowTracker] = useState(false);

  const activeAgent = agents.find(a => a.id === activeId) ?? agents[0];

  const handleSend = (text: string) => {
    setMessages(prev => [...prev, makeMsg("user", text)]);
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        makeMsg("assistant", `收到指令：「${text}」\n\n正在協調 A2A 團隊為您執行，請稍候任務進度更新。`),
      ]);
      setShowTracker(true);
    }, 800);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-6 -mb-6 overflow-hidden">
      {/* Left: Agent Navigator */}
      {isLoading ? (
        <div className="w-64 border-r border-gray-100 dark:border-neutral-700 flex items-center justify-center">
          <span className="text-sm text-gray-400 dark:text-neutral-500">載入中…</span>
        </div>
      ) : (
        <AgentNavigation
          agents={agents}
          activeId={activeId || (agents[0]?.id ?? 0)}
          onSelect={setActiveId}
          activeModule={activeModule}
          onModuleChange={setActiveModule}
        />
      )}

      {/* Center: Chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-neutral-900">
        {/* Agent header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-white dark:bg-neutral-800 border-b border-gray-100 dark:border-neutral-700">
          {activeAgent ? (
            <>
              <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold text-sm">
                {activeAgent.avatar}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{activeAgent.name}</p>
                <p className="text-xs text-gray-400 dark:text-neutral-500">{activeAgent.title}</p>
              </div>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                線上
              </span>
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-neutral-500">請從左側選擇 Agent</p>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} agentName={activeAgent?.name} />
          ))}
        </div>

        {/* Input */}
        <div className="px-5 pb-4 bg-gray-50 dark:bg-neutral-900">
          <ChatInput
            onSend={handleSend}
            placeholder={`向 ${activeAgent?.name ?? "Agent"} 發送指令…`}
          />
        </div>
      </div>

      {/* Right: Task Progress */}
      {showTracker && (
        <div className="w-72 border-l border-gray-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-700">
            <p className="text-sm font-semibold text-gray-700 dark:text-neutral-200">任務進度</p>
            <button
              onClick={() => setShowTracker(false)}
              className="text-gray-400 hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-300 text-xs"
            >
              收起
            </button>
          </div>
          <div className="p-4">
            <TaskProgressTracker steps={DEMO_STEPS} progress={50} taskName="A2A 任務執行" />
          </div>
        </div>
      )}
    </div>
  );
}
