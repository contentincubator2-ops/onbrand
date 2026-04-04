import { useState, useRef, useEffect } from "react";
import { trpc } from "../lib/trpc";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  contentType?: string;
  imageSuggestion?: string;
  taskId?: number;
  ts: number;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Message | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const taskList = trpc.task.list.useQuery({ limit: 20 }, { refetchInterval: 5000 });
  const createAndExecute = trpc.task.createAndExecute.useMutation();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      ts: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const result = await createAndExecute.mutateAsync({ title: text, description: text });
      let content = "";
      let thinking = "";
      let contentType = "general";
      let imageSuggestion = "";

      if (result.output) {
        try {
          const parsed = JSON.parse(result.output);
          content = parsed.publishable_content ?? result.output;
          thinking = parsed.thinking ?? "";
          contentType = parsed.content_type ?? "general";
          imageSuggestion = parsed.image_suggestion ?? "";
        } catch {
          content = result.output;
        }
      } else if (result.error) {
        content = `錯誤：${result.error}`;
      }

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content,
        thinking,
        contentType,
        imageSuggestion,
        taskId: result.taskId,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setSelectedTask(assistantMsg);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: `發生錯誤：${err?.message ?? "未知錯誤"}`,
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="grid h-full" style={{ gridTemplateColumns: "220px 1fr 280px" }}>

      {/* ── Left: Task history ── */}
      <div className="border-r border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            歷史任務
          </span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {(taskList.data ?? []).length === 0 && (
            <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center py-8 px-4">
              尚無任務記錄
            </p>
          )}
          {(taskList.data ?? []).map(task => (
            <button
              key={task.id}
              onClick={() => {
                const found = messages.find(m => m.taskId === task.id);
                if (found) setSelectedTask(found);
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors group"
            >
              <p className="text-xs text-neutral-700 dark:text-neutral-300 font-medium truncate group-hover:text-neutral-900 dark:group-hover:text-neutral-100">
                {task.title}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-600 mt-0.5">
                {task.status === "completed" ? "✓ 完成" : task.status === "failed" ? "✗ 失敗" : "⟳ 進行中"}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Center: Chat ── */}
      <div className="flex flex-col overflow-hidden bg-white dark:bg-neutral-900">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 8v4l3 3"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">SoWork AI</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">企業行銷顧問</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
              <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">有什麼我可以幫你的？</p>
              <p className="text-xs text-neutral-400 dark:text-neutral-600">輸入任務，AI 會立即分析並產出內容</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
                  </svg>
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100"
                }`}
                onClick={() => msg.role === "assistant" && msg.taskId ? setSelectedTask(msg) : undefined}
                style={{ cursor: msg.role === "assistant" && msg.taskId ? "pointer" : "default" }}
              >
                <p style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>
                {msg.role === "assistant" && msg.contentType && msg.contentType !== "general" && (
                  <span className="inline-block mt-2 text-xs text-neutral-500 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-600 rounded-full px-2 py-0.5">
                    {msg.contentType}
                  </span>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
                </svg>
              </div>
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl px-4 py-3">
                <div className="flex gap-1.5 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "0ms" }}/>
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "150ms" }}/>
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "300ms" }}/>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex items-end gap-2 bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 px-4 py-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="輸入任務，例如：分析台灣市場品牌定位機會..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 outline-none max-h-32"
              style={{ lineHeight: "1.6" }}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="shrink-0 w-8 h-8 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-600 mt-1.5 px-1">
            Enter 送出，Shift+Enter 換行
          </p>
        </div>
      </div>

      {/* ── Right: Output detail ── */}
      <div className="border-l border-neutral-200 dark:border-neutral-800 hidden lg:flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            輸出內容
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedTask ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300 dark:text-neutral-700">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <p className="text-xs text-neutral-400 dark:text-neutral-600">點選訊息查看完整輸出</p>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedTask.contentType && selectedTask.contentType !== "general" && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">類型</span>
                  <p className="mt-1 text-xs border border-neutral-300 dark:border-neutral-700 rounded-full inline-block px-2 py-0.5 text-neutral-600 dark:text-neutral-400">
                    {selectedTask.contentType}
                  </p>
                </div>
              )}
              {selectedTask.thinking && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">策略思考</span>
                  <div className="mt-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-3 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-wrap">
                    {selectedTask.thinking}
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">產出內容</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedTask.content)}
                    className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                  >
                    複製
                  </button>
                </div>
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
                  {selectedTask.content}
                </div>
              </div>
              {selectedTask.imageSuggestion && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">配圖建議</span>
                  <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-3 leading-relaxed">
                    {selectedTask.imageSuggestion}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
