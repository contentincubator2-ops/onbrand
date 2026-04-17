/**
 * PositioningBar.tsx
 * Sticky info bar shown after squad completes and positioning statement is detected.
 */
import React from "react";

export interface PositioningBarProps {
  positioningText: string;
  icp: string;
  onDismiss: () => void;
  onEdit?: () => void;
}

export function PositioningBar({ positioningText, icp, onDismiss, onEdit }: PositioningBarProps) {
  const preview = positioningText.length > 60 ? positioningText.slice(0, 60) + "…" : positioningText;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 16px",
      background: "linear-gradient(135deg, #EFF6FF, #F0FDF4)",
      border: "1px solid #BFDBFE",
      borderRadius: 8,
      flexShrink: 0,
      margin: "0 0 4px 0",
    }}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>🎯</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1D4ED8" }}>品牌定位確認</span>
        <span style={{ fontSize: 12, color: "#374151", marginLeft: 6 }}>· {preview}</span>
        {icp && (
          <span style={{ fontSize: 12, color: "#6B7280", marginLeft: 6 }}>
            · 受眾: <span style={{ color: "#065F46", fontWeight: 500 }}>{icp.length > 40 ? icp.slice(0, 40) + "…" : icp}</span>
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {onEdit && (
          <button
            onClick={onEdit}
            style={{
              fontSize: 11, padding: "2px 10px", borderRadius: 6,
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
            fontSize: 12, lineHeight: 1,
            background: "none", border: "none",
            color: "#9CA3AF", cursor: "pointer",
            padding: "2px 4px",
          }}
          title="關閉"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
