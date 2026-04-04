/**
 * ChatPage — 全對話介面，Claude.ai 風格
 * 左側：對話歷史 + 新對話按鈕
 * 主區：對話 + 輸入框
 * 右上角：品牌 / 產品 / 活動 Context Selector
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "../lib/trpc";

/* ── Types ── */
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
  contextType?: "brand" | "product" | "campaign";
  contextLabel?: string;
  createdAt: number;
}

const CONTEXT_OPTIONS = [
  { type: "brand",    label: "品牌定位",  icon: "◇" },
  { type: "product",  label: "產品行銷",  icon: "○" },
  { type: "campaign", label: "活動企劃",  icon: "△" },
] as const;

/* ── Icons ── */
const IconNew = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconChat = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const IconMenu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const IconChevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const IconLogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

/* ── Main Component ── */
export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const createAndExecute = trpc.task.createAndExecute.useMutation();

  const active = conversations.find(c => c.id === activeId) ?? null;
  const contextType = active?.contextType ?? "brand";
  const contextLabel = active?.contextLabel ?? "品牌定位";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, loading]);

  /* ── new conversation ── */
  const newConv = (type: "brand" | "product" | "campaign" = "brand", label = "品牌定位") => {
    const id = `conv-${Date.now()}`;
    const conv: Conversation = {
      id, title: "新對話", messages: [],
      contextType: type, contextLabel: label,
      createdAt: Date.now(),
    };
    setConversations(prev => [conv, ...prev]);
    setActiveId(id);
    setContextOpen(false);
  };

  /* ── send ── */
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    // 確保有 active conversation
    let convId = activeId;
    if (!convId) {
      const id = `conv-${Date.now()}`;
      const conv: Conversation = {
        id, title: text.slice(0, 30),
        messages: [], contextType: "brand", contextLabel: "品牌定位",
        createdAt: Date.now(),
      };
      setConversations(prev => [conv, ...prev]);
      setActiveId(id);
      convId = id;
    }

    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() };

    setConversations(prev => prev.map(c =>
      c.id === convId
        ? { ...c, title: c.messages.length === 0 ? text.slice(0, 32) : c.title, messages: [...c.messages, userMsg] }
        : c
    ));

    try {
      const ctx = conversations.find(c => c.id === convId);
      const result = await createAndExecute.mutateAsync({
        title: text,
        description: `[${ctx?.contextLabel ?? "品牌定位"}] ${text}`,
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
      setConversations(prev => prev.map(c =>
        c.id === convId ? { ...c, messages: [...c.messages, aMsg] } : c
      ));
    } catch (err: any) {
      const eMsg: Msg = {
        id: `e-${Date.now()}`, role: "assistant",
        content: `很抱歉，發生錯誤：${err?.message ?? "未知錯誤"}`, ts: Date.now(),
      };
      setConversations(prev => prev.map(c =>
        c.id === convId ? { ...c, messages: [...c.messages, eMsg] } : c
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const logout = () => { localStorage.removeItem("authToken"); window.location.href = "/login"; };

  /* ── Render ── */
  return (
    <div className="flex h-screen bg-white dark:bg-[#212121] text-neutral-900 dark:text-neutral-100 overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ═══ SIDEBAR ═══ */}
      {sidebarOpen && (
        <aside className="w-64 flex flex-col shrink-0 bg-neutral-100 dark:bg-[#171717] border-r border-neutral-200 dark:border-neutral-800">
          {/* Top */}
          <div className="flex items-center justify-between px-3 py-3">
            <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 tracking-tight">SoWork AI</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 transition-colors"
            >
              <IconMenu />
            </button>
          </div>

          {/* New chat */}
          <div className="px-3 pb-2">
            <button
              onClick={() => newConv()}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors font-medium"
            >
              <IconNew />
              新對話
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
            {conversations.length === 0 && (
              <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center py-6 px-4">
                尚無對話記錄
              </p>
            )}
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setActiveId(conv.id)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors group ${
                  conv.id === activeId
                    ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                <span className="shrink-0 text-neutral-400 dark:text-neutral-600"><IconChat /></span>
                <span className="truncate text-xs leading-relaxed">{conv.title}</span>
              </button>
            ))}
          </div>

          {/* Logout */}
          <div className="px-3 py-3 border-t border-neutral-200 dark:border-neutral-800">
            <button
              onClick={logout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 transition-colors"
            >
              <IconLogout />
              登出
            </button>
          </div>
        </aside>
      )}

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 transition-colors mr-1"
              >
                <IconMenu />
              </button>
            )}
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {active ? active.title : "新對話"}
            </span>
          </div>

          {/* Context selector */}
          <div className="relative">
            <button
              onClick={() => setContextOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors bg-white dark:bg-neutral-900"
            >
              <span className="text-xs font-medium">
                {CONTEXT_OPTIONS.find(o => o.type === contextType)?.icon ?? "◇"}
              </span>
              {contextLabel}
              <IconChevron />
            </button>

            {contextOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg overflow-hidden z-50">
                {CONTEXT_OPTIONS.map(opt => (
                  <button
                    key={opt.type}
                    onClick={() => {
                      if (active) {
                        setConversations(prev => prev.map(c =>
                          c.id === activeId
                            ? { ...c, contextType: opt.type, contextLabel: opt.label }
                            : c
                        ));
                      } else {
                        newConv(opt.type, opt.label);
                      }
                      setContextOpen(false);
                    }}
                    className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      contextType === opt.type
                        ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium"
                        : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-800 dark:hover:text-neutral-200"
                    }`}
                  >
                    <span className="text-neutral-400">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto" onClick={() => setContextOpen(false)}>
          {(!active || active.messages.length === 0) && !loading ? (
            /* Empty state */
            <div className="h-full flex flex-col items-center justify-center gap-6 px-6 py-12">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 dark:text-neutral-600">
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 8v4l3 3"/>
                </svg>
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                  今天想做什麼？
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-500">
                  選擇右上角的情境，然後開始對話
                </p>
              </div>
              {/* Suggestion chips */}
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  "分析競品的品牌定位差異",
                  "幫我寫一則 Facebook 廣告文案",
                  "設計 A/B 測試方案",
                  "分析台灣市場機會",
                  "撰寫品牌口號與 Tagline",
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
              {(active?.messages ?? []).map(msg => (
                <div key={msg.id} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0 mt-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
                      </svg>
                    </div>
                  )}
                  <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    {/* 策略思考（可展開） */}
                    {msg.role === "assistant" && msg.thinking && (
                      <details className="w-full">
                        <summary className="text-xs text-neutral-400 dark:text-neutral-600 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-400 select-none">
                          查看策略思考過程
                        </summary>
                        <div className="mt-2 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed whitespace-pre-wrap border border-neutral-200 dark:border-neutral-700">
                          {msg.thinking}
                        </div>
                      </details>
                    )}
                    {/* 主要內容 */}
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-br-md"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 rounded-bl-md"
                    }`}>
                      <p style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>
                    </div>
                    {/* 配圖建議 */}
                    {msg.imageSuggestion && (
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 px-1">
                        配圖建議：{msg.imageSuggestion}
                      </p>
                    )}
                    {/* 複製按鈕 */}
                    {msg.role === "assistant" && (
                      <button
                        onClick={() => navigator.clipboard.writeText(msg.content)}
                        className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors px-1"
                      >
                        複製內容
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {/* Loading dots */}
              {loading && (
                <div className="flex gap-4 justify-start">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
                    </svg>
                  </div>
                  <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5 items-center h-5">
                      {[0, 150, 300].map(delay => (
                        <span key={delay} className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: `${delay}ms` }}/>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Input ── */}
        <div className="shrink-0 px-4 pb-6 pt-3" onClick={() => setContextOpen(false)}>
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 px-4 py-3 shadow-sm">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`在「${contextLabel}」情境下，告訴我你想做什麼...`}
                rows={1}
                disabled={loading}
                className="flex-1 resize-none bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 outline-none"
                style={{ maxHeight: 160, lineHeight: 1.6 }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="shrink-0 w-9 h-9 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <IconSend />
              </button>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center mt-2">
              Enter 送出　·　Shift+Enter 換行
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
