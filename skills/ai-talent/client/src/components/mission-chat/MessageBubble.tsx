/**
 * MessageBubble — Sprint 3
 * Renders a single chat message with Claude-style warm design.
 * User messages: right-aligned amber; Assistant: left-aligned warm white.
 * Supports agent role display and markdown-style content.
 */

/** Agent avatar SVG — monochrome warm-amber bot icon */
function AgentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* head */}
      <rect x="4" y="6" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      {/* eyes */}
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      {/* antenna */}
      <line x1="12" y1="6" x2="12" y2="2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="1.5" r="1.2" fill="currentColor" />
      {/* mouth/indicator */}
      <rect x="10" y="15" width="4" height="1.2" rx="0.6" fill="currentColor" />
    </svg>
  );
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  ts: Date;
  agentRole?: string; // e.g. "Brand Strategist", "PM Agent"
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
      {isUser ? (
        <span className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold bg-[#c9823a] text-white">
          我
        </span>
      ) : (
        <span className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-[#3d3530] text-[#c9823a]">
          <AgentIcon className="w-5 h-5" />
        </span>
      )}

      {/* Bubble */}
      <div className={`max-w-[72%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {!isUser && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-[#5a4f47] font-medium">{agentName}</span>
            {message.agentRole && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3d3530] text-[#c9823a] font-medium">
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
