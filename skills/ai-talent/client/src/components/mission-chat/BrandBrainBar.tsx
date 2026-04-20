/**
 * BrandBrainBar.tsx
 *
 * Persistent brand context bar — always-visible, no expand required.
 * Shows brand positioning data + brain knowledge meter in one compact strip.
 *
 * Layout (all visible by default):
 *   Row 1: 🧠 icon | Tagline (bold) | [✦推估中 badge]
 *   Row 2: Value Proposition
 *   Row 3: Audience chips + Target market
 *   Row 4: USP — 情感 / 功能
 *   ──────────────────────────────────────
 *   Row 5: 品牌大腦 N筆 | token meter | [查看全部→]
 *
 * Replaces: BrandPositioningBar (AppShell) + BrandBrainStrip (MissionChatCore)
 * Renamed from: BrandIntelligenceBar → BrandBrainBar
 */
import React, { useEffect, useMemo } from "react";
import { trpc } from "../../lib/trpc";

// ─── Constants ────────────────────────────────────────────────────────────────
const TOKEN_BUDGET  = 2000;
const CHARS_PER_TOKEN = 4;
const ORANGE        = "#C9823A";
const ORANGE_LIGHT  = "#FFF7ED";
const ORANGE_BORDER = "#F5C9A8";

function approxTokens(items: any[]): number {
  return Math.ceil(
    items.reduce((s: number, i: any) => s + (i.content?.length ?? 0) + (i.title?.length ?? 0), 0)
    / CHARS_PER_TOKEN
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  brandId:   number | null | undefined;
  missionId: number | null | undefined;
}

// ─── BrandBrainBar ────────────────────────────────────────────────────────────
export function BrandBrainBar({ brandId, missionId }: Props) {

  // ── Brand positioning ──────────────────────────────────────────────────────
  const posQuery = (trpc as any).brand?.getPositioning?.useQuery
    ? (trpc as any).brand.getPositioning.useQuery(
        { brandId: brandId! },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 }
      )
    : { data: null, isLoading: false, refetch: () => {} };

  const genEstimate = (trpc as any).brand?.generateEstimate?.useMutation
    ? (trpc as any).brand.generateEstimate.useMutation({
        onSuccess: () => posQuery.refetch?.(),
      })
    : { mutate: () => {}, isLoading: false };

  const pos         = posQuery.data as any;
  const tagline     = pos?.tagline ?? "";
  const valueProp   = pos?.valueProposition ?? "";
  const targetMkt   = pos?.targetMarket ?? "";
  const audA        = pos?.audienceA ?? "";
  const audB        = pos?.audienceB ?? "";
  const emoUSP      = pos?.emotionalDiff ?? "";
  const funcUSP     = pos?.functionalDiff ?? "";
  const isEstimate  = pos?.isEstimate === 1;
  const isLoading   = posQuery.isLoading || genEstimate.isLoading;

  // Auto-trigger estimate if brand has no tagline yet
  useEffect(() => {
    if (brandId && pos && !pos.tagline && !genEstimate.isLoading) {
      genEstimate.mutate({ brandId });
    }
  }, [brandId, pos]);

  // ── Brand brain ───────────────────────────────────────────────────────────
  const brainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId! },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null, isLoading: false };

  const brainItems: any[] = brainQuery.data ?? [];
  const usedTokens = useMemo(() => approxTokens(brainItems), [brainQuery.data]);
  const pct        = Math.min(100, Math.round((usedTokens / TOKEN_BUDGET) * 100));
  const isFull     = pct >= 90;
  const meterColor = isFull ? "#EF4444" : pct > 60 ? "#F59E0B" : ORANGE;

  const handleFocusBrain = () => {
    window.dispatchEvent(new CustomEvent("section-priority", { detail: { key: "brandbrain" } }));
  };

  if (!brandId) return null;

  const hasPositioning = !!tagline;
  const hasAudience    = !!(audA || audB || targetMkt);
  const hasUSP         = !!(emoUSP || funcUSP);

  return (
    <div style={{
      flexShrink: 0,
      borderBottom: "1px solid #ECEAE8",
      background: "#FAFAF9",
      padding: "10px 18px 8px",
    }}>

      {/* ── Positioning section ── */}
      {isLoading && !hasPositioning ? (
        <div style={{ fontSize: 11, color: "#B0AFA9", fontStyle: "italic", marginBottom: 6 }}>
          AI 正在推估品牌定位…
        </div>
      ) : hasPositioning ? (
        <div style={{ marginBottom: 8 }}>

          {/* Row 1: Tagline */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            {/* 🧠 icon */}
            <div style={{
              width: 20, height: 20, borderRadius: 5, flexShrink: 0,
              background: `linear-gradient(135deg, ${ORANGE}, #E8631A)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 1px 4px rgba(201,130,58,0.30)`,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.88A2.5 2.5 0 0 1 9.5 2Z"/>
                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.88A2.5 2.5 0 0 0 14.5 2Z"/>
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A18", flex: 1, lineHeight: 1.3 }}>
              {tagline}
            </span>
            {isEstimate && (
              <span style={{
                fontSize: 9, color: "#E8631A", border: "1px solid #F5C4A8",
                borderRadius: 4, padding: "1px 5px", fontWeight: 600, flexShrink: 0,
              }}>✦ 推估中</span>
            )}
          </div>

          {/* Row 2: Value Proposition */}
          {valueProp && (
            <div style={{ fontSize: 11, color: "#4A4A45", lineHeight: 1.5, marginBottom: 5, paddingLeft: 26 }}>
              {typeof valueProp === "string" ? valueProp : JSON.stringify(valueProp)}
            </div>
          )}

          {/* Row 3: Audience chips */}
          {hasAudience && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 5, paddingLeft: 26 }}>
              {targetMkt && (
                <Chip label={targetMkt} bg="#F2F1EF" text="#6B6A66" border="#E4E3E1" />
              )}
              {audA && (
                <Chip label={audA} bg="#EFF6FF" text="#1D4ED8" border="#BFDBFE" />
              )}
              {audB && (
                <Chip label={audB} bg="#F0FDF4" text="#15803D" border="#BBF7D0" />
              )}
            </div>
          )}

          {/* Row 4: USP */}
          {hasUSP && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 26 }}>
              {emoUSP && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                  <Chip label="情感" bg="#FFF7ED" text="#C2410C" border="#FED7AA" />
                  <span style={{ fontSize: 11, color: "#4A4A45", lineHeight: 1.45 }}>{emoUSP}</span>
                </div>
              )}
              {funcUSP && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                  <Chip label="功能" bg="#F5F3FF" text="#7C3AED" border="#DDD6FE" />
                  <span style={{ fontSize: 11, color: "#4A4A45", lineHeight: 1.45 }}>{funcUSP}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Divider (only when positioning is shown) ── */}
      {hasPositioning && (
        <div style={{ height: 1, background: "#ECEAE8", margin: "6px 0" }} />
      )}

      {/* ── Brain meter row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: ORANGE, letterSpacing: 0.2 }}>
          品牌大腦
        </span>

        {brainItems.length === 0 ? (
          <span style={{
            fontSize: 10, color: "#C5C3BE",
            background: "#F2F1EF", border: "1px solid #E4E3E1",
            borderRadius: 10, padding: "0 6px",
          }}>尚無知識</span>
        ) : (
          <span style={{
            fontSize: 10, fontWeight: 600, color: "#9B7A55",
            background: ORANGE_LIGHT, border: `1px solid ${ORANGE_BORDER}`,
            borderRadius: 10, padding: "0 6px",
          }}>{brainItems.length} 筆知識</span>
        )}

        {/* Token meter */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{
            flex: 1, height: 3, borderRadius: 2,
            background: "#EDE9E4", overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: `${pct}%`,
              background: meterColor, borderRadius: 2, transition: "width 0.4s",
            }} />
          </div>
          <span style={{
            fontSize: 9, color: isFull ? "#EF4444" : "#9B9990",
            fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {usedTokens.toLocaleString()} / {TOKEN_BUDGET.toLocaleString()} tokens
          </span>
        </div>

        {/* Focus right panel */}
        <button
          onClick={handleFocusBrain}
          style={{
            fontSize: 10, color: ORANGE, background: "none", border: "none",
            cursor: "pointer", fontFamily: "inherit", padding: 0,
            flexShrink: 0, textDecoration: "underline",
          }}
        >
          查看全部 →
        </button>
      </div>

      {isFull && (
        <div style={{
          fontSize: 10, color: "#B91C1C",
          background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 6, padding: "4px 8px", marginTop: 5,
        }}>
          ⚠️ 品牌大腦接近上限，建議刪除舊項目或整合重複內容。
        </div>
      )}
    </div>
  );
}

// ─── Chip helper ──────────────────────────────────────────────────────────────
function Chip({ label, bg, text, border }: { label: string; bg: string; text: string; border: string }) {
  return (
    <span style={{
      fontSize: 10, padding: "1px 7px", borderRadius: 10,
      background: bg, color: text, border: `1px solid ${border}`,
      whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {label}
    </span>
  );
}
