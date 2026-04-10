/**
 * MessageBubble — Sprint 3
 * Renders a single chat message with Claude-style warm design.
 * User messages: right-aligned amber; Assistant: left-aligned warm white.
 * Supports agent role display and markdown-style content.
 */

export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  ts: Date;
  agentRole?: string;  // e.g. "Brand Strategist", "PM Agent"
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
        isUser ? "bg-[#c9823a] text-white" : "bg-[#e8e5e0] text-[#5a4f47]"
      }`}>
        {isUser ? "我" : (agentName?.[0] ?? "A")}
      </span>

      {/* Bubble */}
      <div className={`max-w-[72%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {!isUser && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-[#5a4f47] font-medium">{agentName}</span>
            {message.agentRole && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0ece8] text-[#9b8fa0] font-medium">
                {message.agentRole}
              </span>
            )}
          </div>
        )}
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-[#c9823a] text-white rounded-tr-sm"
            : "bg-white border border-[#e8e5e0] text-[#3d3530] shadow-sm rounded-tl-sm"
        }`}>
          {message.content}
        </div>
        <span className="text-[10px] text-[#b8b0a8] px-1">{formatTime(message.ts)}</span>
      </div>
    </div>
  );
}
