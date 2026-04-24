/**
 * StrategyCard — a single card in the Decide zone grid.
 *
 * Shows:
 *   - Methodology name + author
 *   - User-given strategy name (the primary title)
 *   - Status badge (draft / active / stale / archived)
 *   - One-line summary
 *   - Expiry progress bar for active strategies
 */
import React from "react";
import type { StrategyCardRow } from "./types";

const C = {
  bg:        "#FFFFFF",
  border:    "#E4E3E1",
  borderHover: "#C9C7C2",
  text:      "#1A1A18",
  textMuted: "#6B6A64",
  textDim:   "#9B9990",
  accent:    "#E8631A",
  draft:     "#B5B4AF",
  active:    "#2B8A3E",
  stale:     "#C59A2E",
  archived:  "#9B9990",
};

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = then - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function statusColor(card: StrategyCardRow): string {
  if (card.status === "archived") return C.archived;
  if (card.status === "draft") return C.draft;
  const daysLeft = daysUntil(card.expiresAt);
  if (daysLeft !== null && daysLeft <= 14) return C.stale;
  return C.active;
}

function statusLabel(card: StrategyCardRow): string {
  if (card.status === "archived") return "封存";
  if (card.status === "draft") return "草稿";
  const daysLeft = daysUntil(card.expiresAt);
  if (daysLeft !== null && daysLeft <= 0) return "已過期 · 重驗";
  if (daysLeft !== null && daysLeft <= 14) return `再 ${daysLeft} 天到期`;
  return "使用中";
}

export function StrategyCard({
  card,
  onClick,
}: {
  card: StrategyCardRow;
  onClick: () => void;
}) {
  const color = statusColor(card);
  const isStale = card.status === "active" && (daysUntil(card.expiresAt) ?? 99) <= 14;
  const isArchived = card.status === "archived";

  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = C.borderHover;
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = C.border;
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
      style={{
        textAlign: "left",
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 16,
        cursor: "pointer",
        minHeight: 150,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "transform .15s, border-color .15s",
        opacity: isArchived ? 0.7 : 1,
        fontFamily: "inherit",
      }}
    >
      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color,
            background: `${color}18`,
            padding: "2px 8px",
            borderRadius: 4,
            letterSpacing: 0.4,
          }}
        >
          {statusLabel(card)}
        </span>
        {isStale && <span style={{ fontSize: 11 }}>⏰</span>}
      </div>

      {/* Strategy name */}
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
        {card.name}
      </div>

      {/* Methodology */}
      <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>
        {card.methodologyName}
        {card.methodologyAuthor && (
          <>
            {" · "}
            <span style={{ color: C.textDim }}>{card.methodologyAuthor}</span>
          </>
        )}
      </div>

      {/* Summary */}
      {card.summary && (
        <div
          style={{
            fontSize: 12,
            color: C.textMuted,
            lineHeight: 1.5,
            marginTop: 2,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {card.summary}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Footer: expiry / updated */}
      <div style={{ fontSize: 10, color: C.textDim, display: "flex", justifyContent: "space-between" }}>
        <span>
          {card.status === "active" && card.expiresAt
            ? `到期：${new Date(card.expiresAt).toLocaleDateString("zh-TW")}`
            : card.status === "draft"
              ? "草稿 — 尚未啟用"
              : ""}
        </span>
        <span>更新 {new Date(card.updatedAt).toLocaleDateString("zh-TW")}</span>
      </div>
    </button>
  );
}
