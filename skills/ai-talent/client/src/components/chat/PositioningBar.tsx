/**
 * PositioningBar.tsx
 * Sticky info bar shown after squad completes and positioning statement is detected.
 * Upgraded: stronger visual identity, "查看定位書" button, typing animation.
 */
import React, { useState } from "react";

export interface PositioningBarProps {
  positioningText: string;
  icp: string;
  onDismiss: () => void;
  onEdit?: () => void;
  onViewBook?: () => void;
}

export function PositioningBar({ positioningText, icp, onDismiss, onEdit, onViewBook }: PositioningBarProps) {
  const [expanded, setExpanded] = useState(false);
  const preview = positioningText.length > 80 ? positioningText.slice(0, 80) + "…" : positioningText;
  const showPreview = !expanded && positioningText.length > 80;

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      padding: "10px 14px",
      background: "linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)",
      border: "1px solid #BFDBFE",
      borderRadius: 10,
      flexShrink: 0,
      margin: "0 0 4px 0",
      boxShadow: "0 1px 6px rgba(10,110,250,0.08)",
    }}>
      {/* Left icon */}
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: "linear-gradient(135deg, #0A6EFA, #059669)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, boxShadow: "0 2px 8px rgba(10,110,250,0.2)",
        marginTop: 1,
      }}>
        🎯
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#1D4ED8", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            品牌定位已確認
          </span>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "#059669", animation: "pulse 2s infinite",
            flexShrink: 0,
          }} />
        </div>

        <div style={{
          fontSize: 13, color: "#1E3A5F", lineHeight: 1.5, fontWeight: 500,
        }}>
          {showPreview ? preview : positioningText}
          {positioningText.length > 80 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                marginLeft: 6, fontSize: 11, color: "#2563EB",
                background: "none", border: "none", padding: 0, cursor: "pointer",
                textDecoration: "underline", fontFamily: "inherit",
              }}
            >
              {expanded ? "收起" : "展開"}
            </button>
          )}
        </div>

        {icp && (
          <div style={{ fontSize: 11, color: "#374151", marginTop: 4 }}>
            <span style={{ color: "#6B7280" }}>目標受眾：</span>
            <span style={{ color: "#065F46", fontWeight: 500 }}>
              {icp.length > 60 ? icp.slice(0, 60) + "…" : icp}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "flex-start", paddingTop: 1 }}>
        {onViewBook && (
          <button
            onClick={onViewBook}
            style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 7,
              border: "1px solid #BFDBFE",
              background: "linear-gradient(135deg, #0A6EFA, #0053c8)",
              color: "white", cursor: "pointer", fontFamily: "inherit",
              fontWeight: 600, whiteSpace: "nowrap" as const,
              boxShadow: "0 2px 6px rgba(10,110,250,0.25)",
            }}
          >
            查看定位書
          </button>
        )}
        {onEdit && (
          <button
            onClick={onEdit}
            style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 7,
              border: "1px solid #BFDBFE", background: "white",
              color: "#2563EB", cursor: "pointer", fontFamily: "inherit",
              fontWeight: 500,
            }}
          >
            編輯
          </button>
        )}
        <button
          onClick={onDismiss}
          style={{
            fontSize: 14, lineHeight: 1,
            background: "none", border: "none",
            color: "#9CA3AF", cursor: "pointer",
            padding: "3px 4px",
          }}
          title="關閉"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
