/**
 * AgentWorkspace — Lobster Architecture full-screen agent interface.
 * v2: 整合 AI 向量搜尋（agents + squads）
 */
import { useState, useCallback, useRef } from "react";
import AgentNavigation, { type Agent } from "../components/chat/AgentNavigation";
import MessageBubble, { type Message } from "../components/chat/MessageBubble";
import ChatInput from "../components/chat/ChatInput";
import TaskProgressTracker, { type TaskStep } from "../components/chat/TaskProgressTracker";
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

// ── Search Types ──────────────────────────────────────────────────────────────
interface AgentResult {
  id: number;
  slug: string;
  name: string;
  title: string;
  layer: string;
  specialty: string;
  rating: number;
  pricePerTask: number;
  score: number;
}

interface SquadResult {
  id: number;
  slug: string;
  name: string;
  name_en: string;
  squad_type: string;
  member_count: number;
  taskType: string;
  score: number;
  vec_score: number;
}

// ── Search Hook ───────────────────────────────────────────────────────────────
function useVectorSearch() {
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);
  const [squadResults, setSquadResults] = useState<SquadResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const search = useCallback(async (query: string, tab: "agents" | "squads") => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchQuery(query);
    try {
      const endpoint = tab === "agents" ? "/api/agents/search" : "/api/squads/search";
      const token = localStorage.getItem("authToken");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, limit: 12 }),
      });
      const data = await res.json();
      if (tab === "agents") setAgentResults(data.results ?? []);
      else setSquadResults(data.results ?? []);
    } catch (e) {
      console.error("search error", e);
    } finally {
      setSearching(false);
    }
  }, []);

  return { agentResults, squadResults, searching, searchQuery, search };
}

// ── Score Badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 60 ? "bg-emerald-100 text-emerald-700" : pct >= 40 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>
      {pct}% match
    </span>
  );
}

// ── Layer Badge ───────────────────────────────────────────────────────────────
function LayerBadge({ layer }: { layer: string }) {
  const map: Record<string, string> = {
    strategy: "bg-purple-100 text-purple-700",
    execution: "bg-blue-100 text-blue-700",
    training: "bg-green-100 text-green-700",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${map[layer] ?? "bg-gray-100 text-gray-500"}`}>
      {layer === "strategy" ? "策略" : layer === "execution" ? "執行" : "培訓"}
    </span>
  );
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

  // Search state
  const [searchTab, setSearchTab] = useState<"agents" | "squads">("agents");
  const [searchInput, setSearchInput] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { agentResults, squadResults, searching, searchQuery, search } = useVectorSearch();

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      search(searchInput.trim(), searchTab);
      setShowSearch(true);
    }
  };

  const handleSelectAgent = (result: AgentResult) => {
    const agent: Agent = {
      id: result.id,
      name: result.name,
      title: result.title,
      avatar: result.name.slice(0, 1),
      status: "online",
      specialty: result.specialty,
    };
    setActiveId(result.id);
    setShowSearch(false);
    setSearchInput("");
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

      {/* Center: Chat + Search */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-neutral-900">

        {/* ── AI Search Bar ── */}
        <div className="bg-white dark:bg-neutral-800 border-b border-gray-100 dark:border-neutral-700 px-5 py-2">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            {/* Tab toggle */}
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-600 text-xs shrink-0">
              <button
                type="button"
                onClick={() => setSearchTab("agents")}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  searchTab === "agents"
                    ? "bg-orange-500 text-white"
                    : "bg-white dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-700"
                }`}
              >
                🤖 Agent
              </button>
              <button
                type="button"
                onClick={() => setSearchTab("squads")}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  searchTab === "squads"
                    ? "bg-orange-500 text-white"
                    : "bg-white dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-700"
                }`}
              >
                👥 Squad
              </button>
            </div>

            {/* Search input */}
            <div className="flex-1 relative">
              <input
                ref={searchRef}
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder={searchTab === "agents" ? "AI 搜尋 Agent，例如「電商 SEO 策略師」…" : "AI 搜尋 Squad，例如「美妝品牌行銷團隊」…"}
                className="w-full text-sm px-3 py-1.5 pr-8 rounded-lg border border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-700 text-gray-800 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(""); setShowSearch(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={searching || !searchInput.trim()}
              className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 dark:disabled:bg-neutral-600 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              {searching ? "搜尋中…" : "搜尋"}
            </button>
          </form>
        </div>

        {/* ── Search Results Panel ── */}
        {showSearch && (
          <div className="bg-white dark:bg-neutral-800 border-b border-gray-100 dark:border-neutral-700 px-5 py-3 max-h-72 overflow-y-auto">
            {searching ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-4 justify-center">
                <span className="animate-spin">⟳</span> AI 向量搜尋中…
              </div>
            ) : searchTab === "agents" ? (
              agentResults.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">沒有找到相關 Agent</p>
              ) : (
                <div>
                  <p className="text-xs text-gray-400 dark:text-neutral-500 mb-2">
                    「{searchQuery}」的 AI 匹配結果（{agentResults.length} 位）
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {agentResults.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => handleSelectAgent(agent)}
                        className="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-100 dark:border-neutral-700 hover:border-orange-300 dark:hover:border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/10 text-left transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 font-bold text-sm shrink-0">
                          {agent.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-gray-800 dark:text-neutral-100 truncate">{agent.name}</span>
                            <LayerBadge layer={agent.layer} />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-neutral-400 truncate mt-0.5">{agent.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <ScoreBadge score={agent.score} />
                            {agent.pricePerTask > 0 && (
                              <span className="text-xs text-gray-400">${agent.pricePerTask}/任務</span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : (
              squadResults.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">沒有找到相關 Squad</p>
              ) : (
                <div>
                  <p className="text-xs text-gray-400 dark:text-neutral-500 mb-2">
                    「{searchQuery}」的 AI 匹配結果（{squadResults.length} 個 Squad）
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {squadResults.map(squad => (
                      <div
                        key={squad.id}
                        className="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-100 dark:border-neutral-700 hover:border-orange-300 dark:hover:border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/10 text-left transition-colors cursor-default"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                          👥
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 dark:text-neutral-100 truncate">{squad.name}</p>
                          <p className="text-xs text-gray-400 dark:text-neutral-500 truncate">{squad.name_en}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <ScoreBadge score={squad.score} />
                            <span className="text-xs text-gray-400">{squad.member_count} 人</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}

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
