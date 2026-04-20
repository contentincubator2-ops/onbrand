/**
 * BrandBrainBar.tsx
 *
 * Compact brand-context strip.
 * - Neural-node pattern tiles the ENTIRE background (visible texture)
 * - "品牌大腦" label sits inline with the tagline row — no separate header
 * - Capacity bar at bottom uses pattern-fill to show 字數 usage (no tokens)
 */
import React, { useEffect, useMemo } from "react";
import { trpc } from "../../lib/trpc";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const INK    = "#1A1A18";
const MUTED  = "#8C8B87";
const SUBTLE = "#B8B7B3";
const BORDER = "#E4E3E1";

// Characters budget (displayed as 字數, not tokens)
const CHAR_BUDGET = 8000;

function totalChars(items: any[]): number {
  return items.reduce((s: number, i: any) =>
    s + (i.content?.length ?? 0) + (i.title?.length ?? 0), 0);
}

// ─── Pattern ──────────────────────────────────────────────────────────────────
// 48×48 tile — nodes + spokes at higher opacity so texture is actually visible.
const TILE = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">
  <circle cx="24" cy="24" r="2"   fill="#1A1A18" opacity="0.13"/>
  <circle cx="24" cy="0"  r="1.3" fill="#1A1A18" opacity="0.08"/>
  <circle cx="24" cy="48" r="1.3" fill="#1A1A18" opacity="0.08"/>
  <circle cx="0"  cy="24" r="1.3" fill="#1A1A18" opacity="0.08"/>
  <circle cx="48" cy="24" r="1.3" fill="#1A1A18" opacity="0.08"/>
  <circle cx="0"  cy="0"  r="1"   fill="#1A1A18" opacity="0.05"/>
  <circle cx="48" cy="0"  r="1"   fill="#1A1A18" opacity="0.05"/>
  <circle cx="0"  cy="48" r="1"   fill="#1A1A18" opacity="0.05"/>
  <circle cx="48" cy="48" r="1"   fill="#1A1A18" opacity="0.05"/>
  <line x1="24" y1="22"  x2="24" y2="1.3"  stroke="#1A1A18" stroke-width="0.7" opacity="0.07"/>
  <line x1="24" y1="26"  x2="24" y2="46.7" stroke="#1A1A18" stroke-width="0.7" opacity="0.07"/>
  <line x1="22"  y1="24" x2="1.3"  y2="24" stroke="#1A1A18" stroke-width="0.7" opacity="0.07"/>
  <line x1="26"  y1="24" x2="46.7" y2="24" stroke="#1A1A18" stroke-width="0.7" opacity="0.07"/>
  <line x1="22.7" y1="22.7" x2="1"  y2="1"  stroke="#1A1A18" stroke-width="0.55" opacity="0.04"/>
  <line x1="25.3" y1="22.7" x2="47" y2="1"  stroke="#1A1A18" stroke-width="0.55" opacity="0.04"/>
  <line x1="22.7" y1="25.3" x2="1"  y2="47" stroke="#1A1A18" stroke-width="0.55" opacity="0.04"/>
  <line x1="25.3" y1="25.3" x2="47" y2="47" stroke="#1A1A18" stroke-width="0.55" opacity="0.04"/>
</svg>`;

const PATTERN = `url("data:image/svg+xml,${encodeURIComponent(TILE)}")`;

// ─── Neural icon ──────────────────────────────────────────────────────────────
function NeuralIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="2.4" fill={INK} />
      <circle cx="12" cy="4"  r="1.4" fill={INK} opacity="0.65"/>
      <circle cx="12" cy="20" r="1.4" fill={INK} opacity="0.65"/>
      <circle cx="4"  cy="12" r="1.4" fill={INK} opacity="0.65"/>
      <circle cx="20" cy="12" r="1.4" fill={INK} opacity="0.65"/>
      <circle cx="5.8"  cy="5.8"  r="1" fill={INK} opacity="0.35"/>
      <circle cx="18.2" cy="5.8"  r="1" fill={INK} opacity="0.35"/>
      <circle cx="5.8"  cy="18.2" r="1" fill={INK} opacity="0.35"/>
      <circle cx="18.2" cy="18.2" r="1" fill={INK} opacity="0.35"/>
      <line x1="12" y1="9.6"  x2="12" y2="5.4"  stroke={INK} strokeWidth="0.9" opacity="0.4"/>
      <line x1="12" y1="14.4" x2="12" y2="18.6" stroke={INK} strokeWidth="0.9" opacity="0.4"/>
      <line x1="9.6"  y1="12" x2="5.4"  y2="12" stroke={INK} strokeWidth="0.9" opacity="0.4"/>
      <line x1="14.4" y1="12" x2="18.6" y2="12" stroke={INK} strokeWidth="0.9" opacity="0.4"/>
      <line x1="10.5" y1="10.5" x2="6.8"  y2="6.8"  stroke={INK} strokeWidth="0.65" opacity="0.2"/>
      <line x1="13.5" y1="10.5" x2="17.2" y2="6.8"  stroke={INK} strokeWidth="0.65" opacity="0.2"/>
      <line x1="10.5" y1="13.5" x2="6.8"  y2="17.2" stroke={INK} strokeWidth="0.65" opacity="0.2"/>
      <line x1="13.5" y1="13.5" x2="17.2" y2="17.2" stroke={INK} strokeWidth="0.65" opacity="0.2"/>
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  brandId:   number | null | undefined;
  missionId: number | null | undefined;
}

// ─── BrandBrainBar ────────────────────────────────────────────────────────────
export function BrandBrainBar({ brandId, missionId }: Props) {

  // Brand positioning
  const posQuery = (trpc as any).brand?.getPositioning?.useQuery
    ? (trpc as any).brand.getPositioning.useQuery(
        { brandId: brandId! },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 }
      )
    : { data: null, isLoading: false, refetch: () => {} };

  const genEstimate = (trpc as any).brand?.generateEstimate?.useMutation
    ? (trpc as any).brand.generateEstimate.useMutation({ onSuccess: () => posQuery.refetch?.() })
    : { mutate: () => {}, isLoading: false };

  const pos       = posQuery.data as any;
  const tagline   = pos?.tagline ?? "";
  const valueProp = typeof pos?.valueProposition === "string"
    ? pos.valueProposition
    : pos?.valueProposition ? JSON.stringify(pos.valueProposition) : "";
  const targetMkt = pos?.targetMarket  ?? "";
  const audA      = pos?.audienceA     ?? "";
  const audB      = pos?.audienceB     ?? "";
  const emoUSP    = pos?.emotionalDiff ?? "";
  const funcUSP   = pos?.functionalDiff ?? "";
  const isEst     = pos?.isEstimate === 1;

  useEffect(() => {
    if (brandId && pos && !pos.tagline && !genEstimate.isLoading) {
      genEstimate.mutate({ brandId });
    }
  }, [brandId, pos]);

  // Brand knowledge
  const brainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId! },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null, isLoading: false };

  const brainItems: any[]  = brainQuery.data ?? [];
  const usedChars = useMemo(() => totalChars(brainItems), [brainQuery.data]);
  const pct       = Math.min(100, Math.round((usedChars / CHAR_BUDGET) * 100));
  const isFull    = pct >= 90;

  const handleFocusBrain = () =>
    window.dispatchEvent(new CustomEvent("section-priority", { detail: { key: "brandbrain" } }));

  if (!brandId) return null;

  const hasPos      = !!tagline;
  const hasAudience = !!(audA || audB || targetMkt);
  const hasUSP      = !!(emoUSP || funcUSP);
  const audience    = [targetMkt, audA, audB].filter(Boolean);

  return (
    <div style={{
      flexShrink: 0,
      position: "relative",
      borderBottom: `1px solid ${BORDER}`,
      overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
    }}>

      {/* ── Full-area neural pattern background ── */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: PATTERN,
        backgroundSize: "48px 48px",
        backgroundRepeat: "repeat",
        pointerEvents: "none",
      }} />
      {/* Frosted overlay — white at 88% keeps content readable */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(255,255,255,0.88)",
        pointerEvents: "none",
      }} />

      {/* ── Content (sits above pattern) ── */}
      <div style={{ position: "relative", padding: "10px 18px 0" }}>

        {/* ── Row 1: tagline + inline "品牌大腦" label ── */}
        {genEstimate.isLoading && !hasPos ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
            <NeuralIcon size={13} />
            <span style={{ fontSize: 11.5, color: MUTED }}>正在推估品牌定位…</span>
          </div>
        ) : hasPos ? (
          <div style={{ marginBottom: 7 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
              {/* Icon */}
              <div style={{ paddingTop: 2, flexShrink: 0, opacity: 0.7 }}>
                <NeuralIcon size={12} />
              </div>
              {/* Tagline */}
              <span style={{
                fontSize: 13, fontWeight: 650, color: INK,
                letterSpacing: "-0.01em", lineHeight: 1.35, flex: 1,
              }}>
                {tagline}
              </span>
              {/* 品牌大腦 label — inline */}
              <span style={{
                fontSize: 10, fontWeight: 700, color: MUTED,
                textTransform: "uppercase", letterSpacing: "0.07em",
                flexShrink: 0, paddingTop: 3,
              }}>
                品牌大腦
              </span>
              {/* AI推估 badge */}
              {isEst && (
                <span style={{
                  fontSize: 9.5, color: MUTED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 20, padding: "1px 7px", flexShrink: 0,
                  marginTop: 2, letterSpacing: "0.03em",
                }}>
                  AI 推估
                </span>
              )}
            </div>

            {/* Value prop */}
            {valueProp && (
              <p style={{
                margin: "0 0 5px 20px",
                fontSize: 11.5, color: "#5A5955", lineHeight: 1.55,
              }}>
                {valueProp}
              </p>
            )}

            {/* Audience */}
            {hasAudience && (
              <div style={{
                display: "flex", alignItems: "center",
                flexWrap: "wrap", gap: "2px 5px",
                marginLeft: 20, marginBottom: 4,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 600, color: SUBTLE,
                  textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 1,
                }}>受眾</span>
                {audience.map((a, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span style={{ color: BORDER, fontSize: 12 }}>·</span>}
                    <span style={{ fontSize: 11, color: "#3D3C39" }}>{a}</span>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* USP */}
            {hasUSP && (
              <div style={{
                display: "flex", flexWrap: "wrap",
                gap: "2px 14px", marginLeft: 20,
              }}>
                {emoUSP && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: SUBTLE,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>情感</span>
                    <span style={{ fontSize: 11, color: "#3D3C39" }}>{emoUSP}</span>
                  </div>
                )}
                {funcUSP && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: SUBTLE,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>功能</span>
                    <span style={{ fontSize: 11, color: "#3D3C39" }}>{funcUSP}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <NeuralIcon size={12} />
            <span style={{ fontSize: 11, color: SUBTLE }}>尚未設定品牌定位</span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: MUTED,
              textTransform: "uppercase", letterSpacing: "0.07em", marginLeft: "auto",
            }}>品牌大腦</span>
          </div>
        )}
      </div>

      {/* ── Capacity bar — pattern fill shows 字數 usage ── */}
      <div
        title={`品牌知識庫：已使用 ${usedChars.toLocaleString()} / ${CHAR_BUDGET.toLocaleString()} 字`}
        style={{
          position: "relative", height: 18,
          cursor: "pointer", overflow: "hidden",
          borderTop: `1px solid ${BORDER}`,
        }}
        onClick={handleFocusBrain}
      >
        {/* Track background — subtle pattern at low opacity */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: PATTERN,
          backgroundSize: "48px 48px",
          backgroundRepeat: "repeat",
          opacity: 0.25,
        }} />

        {/* Filled portion — same pattern but denser/darker, clipped by pct */}
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: `${pct}%`,
          backgroundImage: PATTERN,
          backgroundSize: "48px 48px",
          backgroundRepeat: "repeat",
          opacity: isFull ? 1 : 0.75,
          filter: isFull ? "hue-rotate(0deg) saturate(2)" : "none",
          transition: "width 0.5s ease",
          // darken filled region
          boxShadow: "inset 0 0 0 999px rgba(26,26,24,0.08)",
        }} />

        {/* Labels */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center",
          padding: "0 10px", gap: 5,
          pointerEvents: "none",
        }}>
          <span style={{
            fontSize: 9.5, fontWeight: 600, color: INK, opacity: 0.55,
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}>
            {brainItems.length > 0 ? `${brainItems.length} 筆知識` : "尚無知識"}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontSize: 9.5, color: isFull ? "#B91C1C" : INK,
            opacity: isFull ? 1 : 0.45,
            fontVariantNumeric: "tabular-nums",
          }}>
            {isFull ? "⚠ 接近上限 " : ""}{usedChars.toLocaleString()} / {CHAR_BUDGET.toLocaleString()} 字
          </span>
          <span style={{
            fontSize: 9.5, color: INK, opacity: 0.4, marginLeft: 6,
            textDecoration: "underline",
          }}>
            查看 →
          </span>
        </div>
      </div>

    </div>
  );
}
