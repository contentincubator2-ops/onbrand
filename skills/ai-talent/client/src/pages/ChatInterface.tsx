import { useState } from "react";
import ChatInput from "../components/chat/ChatInput";
import MessageBubble, { type Message } from "../components/chat/MessageBubble";

const AGENTS = [
  { id: 1, name: "陳映婕", title: "品牌策略總監", avatar: "品" },
  { id: 2, name: "郭書蓉", title: "業務發展總監", avatar: "業" },
  { id: 3, name: "楊庭志", title: "供應鏈顧問", avatar: "供" },
];

export default function ChatInterface() {
  const [activeAgent, setActiveAgent] = useState(AGENTS[0]);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", content: `嗨，我是${AGENTS[0].name}。有什麼可以幫你？`, ts: new Date() },
  ]);
  const [activeTask, setActiveTask] = useState<string | null>(null);

  const handleSend = (text: string) => {
    const userMsg: Message = { id: Date.now(), role: "user", content: text, ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setActiveTask(text.slice(0, 40) + (text.length > 40 ? "…" : ""));
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: "assistant",
        content: `收到！我將以**${activeAgent.title}**的角色為你處理：「${text}」`,
        ts: new Date(),
      }]);
    }, 800);
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Left — Agent Nav */}
      <aside className="w-64 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-100">
          <span className="text-[#FF6B35] font-bold text-lg tracking-tight">SoWork</span>
          <span className="text-gray-400 text-lg font-light"> Enterprise</span>
        </div>
        <p className="px-4 pt-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-widest">Agents</p>
        <ul className="flex-1 overflow-y-auto px-2 space-y-1">
          {AGENTS.map(a => (
            <li key={a.id}>
              <button
                onClick={() => setActiveAgent(a)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  activeAgent.id === a.id ? "bg-[#FF6B35]/10 text-[#FF6B35]" : "hover:bg-gray-50 text-gray-700"
                }`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  activeAgent.id === a.id ? "bg-[#FF6B35] text-white" : "bg-gray-100 text-gray-500"
                }`}>{a.avatar}</span>
                <div>
                  <p className="text-sm font-medium leading-tight">{a.name}</p>
                  <p className="text-xs text-gray-400 leading-tight">{a.title}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Center — Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-gray-100 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-[#FF6B35] text-white flex items-center justify-center font-semibold">
            {activeAgent.avatar}
          </span>
          <div>
            <p className="font-semibold text-gray-900">{activeAgent.name}</p>
            <p className="text-xs text-gray-400">{activeAgent.title}</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Online
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map(m => <MessageBubble key={m.id} message={m} agentName={activeAgent.name} />)}
        </div>

        {/* Input */}
        <div className="px-6 pb-6">
          <ChatInput onSend={handleSend} placeholder={`向 ${activeAgent.name} 發送訊息…`} />
        </div>
      </main>

      {/* Right — Task Detail */}
      <aside className="w-72 bg-white border-l border-gray-100 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-100">
          <p className="font-semibold text-gray-800 text-sm">任務詳情</p>
        </div>
        <div className="flex-1 p-4">
          {activeTask ? (
            <div className="rounded-xl border border-[#FF6B35]/20 bg-[#FF6B35]/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse" />
                <span className="text-xs font-semibold text-[#FF6B35] uppercase tracking-wider">執行中</span>
              </div>
              <p className="text-sm text-gray-700 font-medium leading-snug">{activeTask}</p>
              <div className="mt-4 space-y-2">
                {["分析需求", "生成策略", "輸出結果"].map((step, i) => (
                  <div key={step} className="flex items-center gap-2 text-xs text-gray-500">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                      i === 0 ? "bg-[#FF6B35] text-white" : "bg-gray-100"
                    }`}>{i + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center mt-12">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">發送訊息後任務詳情將在此顯示</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
