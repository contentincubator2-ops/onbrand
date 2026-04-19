/**
 * BrandBrainStrip.tsx
 * Compact persistent strip above chat input showing the active Brand Brain context.
 * - Fetches brand knowledge items for this brandId
 * - Shows token usage meter (budget: 2000 tokens ≈ 8000 chars)
 * - Expand/collapse to preview items
 * - Fire 'brain-panel-focus' event to lift right panel section to top
 */
import React, { useState } from "react";
import { trpc } from "../../lib/trpc";

const TOKEN_BUDGET = 2000;
const CHARS_PER_TOKEN = 4;
const CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN; // 8000 chars

const CATEGORY_LABELS: Record<string, string> = {
  positioning: "定位",
  audience: "受眾",
  voice: "語調",
  competitors: "競品",
  custom: "其他",
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  positioning: { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" },
  audience: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  voice: { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
  competitors: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" },
  custom: { bg: "#F9FAFB", text: "#374151", border: "#E5E7EB" },
};

// SoWork orange
const ORANGE = "#C9823A";
const ORANGE_LIGHT = "#FFF7ED";
const ORANGE_BORDER = "#F5C9A8";

function approxTokens(items: any[]): number {
  const totalChars = items.reduce((sum, item) => {
    return sum + (item.content?.length ?? 0) + (item.title?.length ?? 0);
  }, 0);
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

interface BrandBrainStripProps {
  brandId?: number | null;
  missionId?: number | null;
}

export function BrandBrainStrip({ brandId, missionId }: BrandBrainStripProps) {
  const [expanded, setExpanded] = useState(false);

  const brainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId! },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null, isLoading: false };

  const items: any[] = brainQuery.data ?? [];
  const usedTokens = approxTokens(items);
  const pct = Math.min(100, Math.round((usedTokens / TOKEN_BUDGET) * 100));
  const isFull = pct >= 90;
  const meterColor = isFull ? "#EF4444" : pct > 60 ? "#F59E0B" : ORANGE;

  // Focus right panel brand brain section
  const handleFocusBrain = () => {
    window.dispatchEvent(new CustomEvent("section-priority", { detail: { key: "brandbrain" } }));
  };

  if (!brandId) return null;

  return (
    <div style={{
      flexShrink: 0,
      borderBottom: `1px solid ${expanded ? ORANGE_BORDER : "#ECEAE8"}`,
      background: expanded ? ORANGE_LIGHT : "white",
      transition: "background 0.2s",
    }}>
      {/* ── Collapsed bar ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 18px",
        cursor: "pointer",
      }}
        onClick={() => { setExpanded(v => !v); handleFocusBrain(); }}
      >
        {/* Brain icon — SoWork orange glow */}
        <div style={{
          width: 24, height: 24,
          borderRadius: 7,
          background: `linear-gradient(135deg, ${ORANGE}, #E8631A)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: `0 2px 6px rgba(201,130,58,0.35)`,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.88A2.5 2.5 0 0 1 9.5 2Z"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.88A2.5 2.5 0 0 0 14.5 2Z"/>
          </svg>
        </div>

        {/* Label + item count */}
        <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, letterSpacing: 0.2 }}>
          品牌大腦
        </span>
        {items.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: "#9B7A55",
            background: ORANGE_LIGHT, border: `1px solid ${ORANGE_BORDER}`,
            borderRadius: 10, padding: "0 6px",
          }}>
            {items.length} 筆知識
          </span>
        )}

        {/* Token meter */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            flex: 1, height: 4, borderRadius: 2,
            background: "#EDE9E4", overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${pct}%`,
              background: meterColor,
              borderRadius: 2,
              transition: "width 0.4s",
            }} />
          </div>
          <span style={{ fontSize: 9, color: isFull ? "#EF4444" : "#9B9990", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
            {usedTokens.toLocaleString()} / {TOKEN_BUDGET.toLocaleString()} tokens
          </span>
        </div>

        {/* Chevron */}
        <svg
          width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {/* ── Expanded view ── */}
      {expanded && (
        <div style={{ padding: "0 18px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {items.length === 0 ? (
            <div style={{
              fontSize: 11, color: "#9B9990", textAlign: "center",
              padding: "10px 0", fontStyle: "italic",
            }}>
              尚無品牌知識。聊天時點擊「存入品牌大腦」來建立。
            </div>
          ) : (
            items.slice(0, 5).map((item: any, i: number) => {
              const cat = item.category ?? item.key ?? "custom";
              const colors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.custom;
              const preview = (item.content ?? item.value ?? "").slice(0, 80);
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 7,
                  padding: "5px 8px", borderRadius: 7,
                  background: "white", border: "1px solid #ECEAE8",
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                    background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
                    flexShrink: 0, marginTop: 1,
                  }}>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18", lineHeight: 1.3 }}>
                      {item.title ?? item.key ?? "知識項目"}
                    </div>
                    {preview && (
                      <div style={{ fontSize: 10, color: "#6B6A66", lineHeight: 1.4, marginTop: 1 }}>
                        {preview}{(item.content?.length ?? 0) > 80 ? "…" : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {items.length > 5 && (
            <button
              onClick={handleFocusBrain}
              style={{
                fontSize: 10, color: ORANGE, background: "none", border: "none",
                cursor: "pointer", fontFamily: "inherit", padding: "2px 0",
                textAlign: "center" as const,
              }}
            >
              查看全部 {items.length} 筆 →（右側欄）
            </button>
          )}

          {isFull && (
            <div style={{
              fontSize: 10, color: "#B91C1C",
              background: "#FEF2F2", border: "1px solid #FECACA",
              borderRadius: 6, padding: "4px 8px", marginTop: 2,
            }}>
              ⚠️ 品牌大腦接近上限，AI 可能無法完整讀取所有知識。建議刪除舊項目或整合重複內容。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
