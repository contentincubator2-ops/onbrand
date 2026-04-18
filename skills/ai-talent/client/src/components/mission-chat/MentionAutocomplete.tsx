/**
 * MentionAutocomplete.tsx
 * 當用戶在 textarea 輸入 @ 時，顯示可 @mention 的 agent 下拉選單
 *
 * 使用方式：
 *   - 由 MissionChatCore 傳入 squadMembers（從 missionHomePage squad data 取得）
 *   - 監聽 textarea 的 input event，解析 @ 後的文字
 *   - 用戶點選後，自動補全 @AgentName 到 textarea
 */

import { useEffect, useRef } from "react";
import { UserRound } from "lucide-react";

export interface MentionAgent {
  id: number;
  name: string;
  title: string;
  avatarUrl?: string | null;
  role?: string;
  isLead?: boolean;
}

interface MentionAutocompleteProps {
  visible: boolean;
  query: string;               // @ 後面輸入的文字
  agents: MentionAgent[];
  anchorRect?: DOMRect | null; // textarea 的位置，用於定位
  onSelect: (agent: MentionAgent) => void;
  onClose: () => void;
}

export function MentionAutocomplete({
  visible,
  query,
  agents,
  anchorRect,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 過濾 agents
  const filtered = agents.filter(a =>
    !query || a.name.toLowerCase().includes(query.toLowerCase())
  );

  // 點外部關閉
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onClose]);

  if (!visible || filtered.length === 0) return null;

  // 定位：浮在 textarea 上方
  const style: React.CSSProperties = {
    position: "fixed",
    left: anchorRect ? anchorRect.left : 24,
    bottom: anchorRect ? window.innerHeight - anchorRect.top + 6 : 80,
    zIndex: 9999,
    background: "#fff",
    border: "1px solid #E4E3E1",
    borderRadius: 10,
    boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
    minWidth: 260,
    maxWidth: 340,
    maxHeight: 260,
    overflowY: "auto",
    padding: "4px 0",
  };

  return (
    <div ref={containerRef} style={style}>
      <div style={{
        padding: "4px 10px 6px",
        fontSize: 10, color: "#9CA3AF",
        borderBottom: "1px solid #F3F2F0",
      }}>
        @提及成員或備援專家取得第二意見
      </div>

      {filtered.map(agent => (
        <button
          key={agent.id}
          onMouseDown={(e) => {
            e.preventDefault(); // 防止 textarea blur
            onSelect(agent);
          }}
          style={{
            width: "100%", textAlign: "left",
            padding: "7px 10px",
            border: "none", background: "transparent",
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 8,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F3")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          {/* Avatar */}
          {agent.avatarUrl ? (
            <img
              src={agent.avatarUrl}
              alt={agent.name}
              style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: agent.isLead ? "#0A6EFA" : "#1A1A18",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <UserRound size={14} color="#fff" />
            </div>
          )}

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18" }}>
                {agent.name}
              </span>
              {agent.isLead && (
                <span style={{
                  fontSize: 9, color: "#0A6EFA",
                  background: "#EFF6FF", borderRadius: 3,
                  padding: "1px 4px", fontWeight: 500,
                }}>
                  Lead
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
              {agent.title}
              {agent.role && ` · ${agent.role}`}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Hook：解析 textarea 裡的 @mention ────────────────────────────────────────
export function useMentionParser(value: string) {
  // 找最後一個 @ 後面的文字（如果游標在 @ 後面）
  const match = value.match(/@([\u4e00-\u9fa5\w]*)$/);
  return {
    isMentioning: !!match,
    query: match?.[1] ?? "",
    mentionStart: match ? value.lastIndexOf("@") : -1,
  };
}
