/**
 * AgentBubbleHeader.tsx
 * 顯示在每個 assistant 訊息泡泡上方的 Agent 身份條
 * 體感目標：像 Perplexity 的「Searching...」條 — 在串流開始前就出現
 *
 * Props:
 *   agentName    — agent 姓名
 *   agentTitle   — agent 職稱
 *   agentAvatar  — 頭像 URL（可選）
 *   stepLabel    — 步驟標題，e.g. "Step 2 / 4 — 競品分析"
 *   isStreaming   — 是否還在輸出（顯示 spinner）
 *   isSecondOpinion — 第二意見樣式
 *   isLead        — Squad Lead 樣式
 */

import { Loader2, CheckCircle2, MessageSquareQuote } from "lucide-react";

interface AgentBubbleHeaderProps {
  agentName: string;
  agentTitle?: string;
  agentAvatar?: string | null;
  stepLabel?: string;
  stepIndex?: number;
  totalSteps?: number;
  isStreaming?: boolean;
  isSecondOpinion?: boolean;
  isLead?: boolean;
  showHandoff?: boolean;  // true when receiving from previous agent
}

export function AgentBubbleHeader({
  agentName,
  agentTitle,
  agentAvatar,
  stepLabel,
  stepIndex,
  totalSteps,
  isStreaming = false,
  isSecondOpinion = false,
  isLead = false,
  showHandoff = false,
}: AgentBubbleHeaderProps) {
  const accentColor = isSecondOpinion
    ? "#7C5FF0"
    : isLead
    ? "#0A6EFA"
    : "#1A1A18";

  const bgColor = isSecondOpinion
    ? "#F4F0FF"
    : isLead
    ? "#EFF6FF"
    : "#F5F5F3";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "fit-content", marginBottom: 6 }}>
      {/* A2A handoff indicator — shown for non-lead specialist steps */}
      {showHandoff && !isLead && !isSecondOpinion && (
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 10, color: "#9B9990",
          paddingLeft: 2,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9B9990" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span>接收上一步成果 · A2A 交接</span>
        </div>
      )}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 8,
        background: bgColor,
        border: `1px solid ${isSecondOpinion ? "#D9D0FC" : isLead ? "#BFDBFE" : "#E4E3E1"}`,
        maxWidth: "fit-content",
      }}
    >
      {/* Avatar */}
      {agentAvatar ? (
        <img
          src={agentAvatar}
          alt={agentName}
          style={{
            width: 24, height: 24, borderRadius: "50%",
            objectFit: "cover", flexShrink: 0,
            border: `1.5px solid ${accentColor}22`,
          }}
        />
      ) : (
        <div
          style={{
            width: 24, height: 24, borderRadius: "50%",
            background: accentColor, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}
        >
          {agentName.charAt(0)}
        </div>
      )}

      {/* Name + Title */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: accentColor }}>
            {agentName}
          </span>
          {isSecondOpinion && (
            <span style={{
              fontSize: 10, color: "#7C5FF0",
              background: "#EDE9FE", borderRadius: 4,
              padding: "1px 5px", fontWeight: 500,
              display: "flex", alignItems: "center", gap: 3,
            }}>
              <MessageSquareQuote size={9} /> 第二意見
            </span>
          )}
          {isLead && (
            <span style={{
              fontSize: 10, color: "#0A6EFA",
              background: "#DBEAFE", borderRadius: 4,
              padding: "1px 5px", fontWeight: 500,
            }}>
              Squad Lead
            </span>
          )}
        </div>
        {agentTitle && (
          <span style={{ fontSize: 11, color: "#6B6A66" }}>{agentTitle}</span>
        )}
      </div>

      {/* Step badge */}
      {stepLabel && (
        <>
          <div style={{ width: 1, height: 20, background: "#E4E3E1", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#6B6A66", whiteSpace: "nowrap" }}>
            {stepLabel}
          </span>
        </>
      )}

      {/* Step progress dots */}
      {typeof stepIndex === "number" && typeof totalSteps === "number" && totalSteps > 0 && (
        <div style={{ display: "flex", gap: 3, alignItems: "center", marginLeft: 2 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 5, height: 5, borderRadius: "50%",
                background: i < stepIndex
                  ? accentColor
                  : i === stepIndex - 1
                  ? accentColor
                  : "#D1D0CE",
                opacity: i < stepIndex ? 1 : 0.4,
              }}
            />
          ))}
        </div>
      )}

      {/* Streaming indicator */}
      <div style={{ marginLeft: 2, display: "flex", alignItems: "center" }}>
        {isStreaming ? (
          <Loader2 size={13} style={{ color: accentColor, animation: "spin 1s linear infinite" }} />
        ) : (
          <CheckCircle2 size={13} style={{ color: "#22C55E" }} />
        )}
      </div>
    </div>
    </div>
  );
}
