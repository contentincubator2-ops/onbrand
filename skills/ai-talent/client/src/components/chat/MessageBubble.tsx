/**
 * MessageBubble — Renders a single chat message.
 * User messages: right-aligned orange; Assistant: left-aligned white.
 */
export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  ts: Date;
}

interface Props {
  message: Message;
  agentName?: string;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

export default function MessageBubble({ message, agentName }: Props) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <span className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold ${
        isUser ? "bg-[#FF6B35] text-white" : "bg-gray-100 text-gray-600"
      }`}>
        {isUser ? "我" : (agentName?.[0] ?? "A")}
      </span>

      {/* Bubble */}
      <div className={`max-w-[72%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {!isUser && (
          <span className="text-xs text-gray-400 font-medium px-1">{agentName}</span>
        )}
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-[#FF6B35] text-white rounded-tr-sm"
            : "bg-white border border-gray-100 text-gray-800 shadow-sm rounded-tl-sm"
        }`}>
          {message.content}
        </div>
        <span className="text-[10px] text-gray-400 px-1">{formatTime(message.ts)}</span>
      </div>
    </div>
  );
}
