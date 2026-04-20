/**
 * BrandBrainBar.tsx
 *
 * Compact brand-context strip.
 * Layout: large NeuralIcon on LEFT spanning all rows · text column on RIGHT
 * Neural-node pattern tiles the full background.
 * Capacity bar at bottom shows 字數 usage via pattern fill.
 */
import React, { useEffect, useMemo } from "react";
import { trpc } from "../../lib/trpc";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const INK    = "#1A1A18";
const MUTED  = "#8C8B87";
const SUBTLE = "#B8B7B3";
const BORDER = "#E4E3E1";

// Characters budget (displayed as 字數)
const CHAR_BUDGET = 8000;

function totalChars(items: any[]): number {
  return items.reduce((s: number, i: any) =>
    s + (i.content?.length ?? 0) + (i.title?.length ?? 0), 0);
}

// ─── Pattern ──────────────────────────────────────────────────────────────────
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

// ─── Neural icon — large left-column version ───────────────────────────────
function NeuralIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block", flexShrink: 0 }}>
      {/* Center node */}
      <circle cx="12" cy="12" r="2.6" fill={INK} />
      {/* Cardinal nodes */}
      <circle cx="12" cy="4"  r="1.5" fill={INK} opacity="0.65"/>
      <circle cx="12" cy="20" r="1.5" fill={INK} opacity="0.65"/>
      <circle cx="4"  cy="12" r="1.5" fill={INK} opacity="0.65"/>
      <circle cx="20" cy="12" r="1.5" fill={INK} opacity="0.65"/>
      {/* Diagonal nodes */}
      <circle cx="5.5"  cy="5.5"  r="1.05" fill={INK} opacity="0.35"/>
      <circle cx="18.5" cy="5.5"  r="1.05" fill={INK} opacity="0.35"/>
      <circle cx="5.5"  cy="18.5" r="1.05" fill={INK} opacity="0.35"/>
      <circle cx="18.5" cy="18.5" r="1.05" fill={INK} opacity="0.35"/>
      {/* Cardinal spokes */}
      <line x1="12" y1="9.4"  x2="12" y2="5.5"  stroke={INK} strokeWidth="1" opacity="0.4"/>
      <line x1="12" y1="14.6" x2="12" y2="18.5" stroke={INK} strokeWidth="1" opacity="0.4"/>
      <line x1="9.4"  y1="12" x2="5.5"  y2="12" stroke={INK} strokeWidth="1" opacity="0.4"/>
      <line x1="14.6" y1="12" x2="18.5" y2="12" stroke={INK} strokeWidth="1" opacity="0.4"/>
      {/* Diagonal spokes */}
      <line x1="10.3" y1="10.3" x2="6.7"  y2="6.7"  stroke={INK} strokeWidth="0.7" opacity="0.22"/>
      <line x1="13.7" y1="10.3" x2="17.3" y2="6.7"  stroke={INK} strokeWidth="0.7" opacity="0.22"/>
      <line x1="10.3" y1="13.7" x2="6.7"  y2="17.3" stroke={INK} strokeWidth="0.7" opacity="0.22"/>
      <line x1="13.7" y1="13.7" x2="17.3" y2="17.3" stroke={INK} strokeWidth="0.7" opacity="0.22"/>
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

  const brainItems: any[] = brainQuery.data ?? [];
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
  const isLoading   = genEstimate.isLoading || (posQuery.isLoading && !pos);

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
      {/* Frosted overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(255,255,255,0.88)",
        pointerEvents: "none",
      }} />

      {/* ── Main content: icon LEFT | text RIGHT ── */}
      <div style={{
        position: "relative",
        display: "flex",
        alignItems: "stretch",
        padding: "12px 16px 12px 14px",
        gap: 13,
      }}>

        {/* ── Left column: large neural icon, vertically centered ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          opacity: isLoading ? 0.4 : 0.82,
          transition: "opacity 0.3s",
        }}>
          <NeuralIcon size={40} />
        </div>

        {/* ── Right column: all text ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>

          {/* Header row: "品牌大腦" label + optional badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: MUTED,
              textTransform: "uppercase", letterSpacing: "0.09em",
            }}>
              品牌大腦
            </span>
            {isEst && (
              <span style={{
                fontSize: 9, color: SUBTLE,
                border: `1px solid ${BORDER}`,
                borderRadius: 20, padding: "0px 6px",
                letterSpacing: "0.03em",
              }}>
                AI 推估
              </span>
            )}
          </div>

          {/* Tagline or status */}
          {isLoading ? (
            <span style={{ fontSize: 11.5, color: MUTED }}>正在推估品牌定位…</span>
          ) : hasPos ? (
            <span style={{
              fontSize: 13, fontWeight: 650, color: INK,
              letterSpacing: "-0.01em", lineHeight: 1.35,
            }}>
              {tagline}
            </span>
          ) : (
            <span style={{ fontSize: 11.5, color: SUBTLE }}>尚未設定品牌定位</span>
          )}

          {/* Value proposition */}
          {!isLoading && valueProp && (
            <p style={{
              margin: 0,
              fontSize: 11, color: "#5A5955", lineHeight: 1.55,
            }}>
              {valueProp}
            </p>
          )}

          {/* Audience chips */}
          {!isLoading && hasAudience && (
            <div style={{
              display: "flex", alignItems: "center",
              flexWrap: "wrap", gap: "2px 4px",
            }}>
              <span style={{
                fontSize: 9, fontWeight: 600, color: SUBTLE,
                textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 2,
              }}>受眾</span>
              {audience.map((a, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{ color: BORDER, fontSize: 11 }}>·</span>}
                  <span style={{ fontSize: 11, color: "#3D3C39" }}>{a}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* USP row */}
          {!isLoading && hasUSP && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
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
      </div>

      {/* ── Capacity bar ── */}
      <div
        title={`品牌知識庫：已使用 ${usedChars.toLocaleString()} / ${CHAR_BUDGET.toLocaleString()} 字`}
        style={{
          position: "relative", height: 18,
          cursor: "pointer", overflow: "hidden",
          borderTop: `1px solid ${BORDER}`,
        }}
        onClick={handleFocusBrain}
      >
        {/* Track — very faint pattern */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: PATTERN,
          backgroundSize: "48px 48px",
          backgroundRepeat: "repeat",
          opacity: 0.2,
        }} />

        {/* Filled portion — pattern + dark tint, clips by pct */}
        {pct > 0 && (
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0,
            width: `${pct}%`,
            backgroundImage: PATTERN,
            backgroundSize: "48px 48px",
            backgroundRepeat: "repeat",
            opacity: isFull ? 1 : 0.8,
            boxShadow: "inset 0 0 0 999px rgba(26,26,24,0.1)",
            transition: "width 0.5s ease",
          }} />
        )}

        {/* Labels */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center",
          padding: "0 10px", gap: 5,
          pointerEvents: "none",
        }}>
          <span style={{
            fontSize: 9.5, fontWeight: 600, color: INK, opacity: 0.5,
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}>
            {brainItems.length > 0 ? `${brainItems.length} 筆知識` : "尚無知識"}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontSize: 9.5, color: isFull ? "#B91C1C" : INK,
            opacity: isFull ? 1 : 0.4,
            fontVariantNumeric: "tabular-nums",
          }}>
            {isFull ? "⚠ 接近上限 " : ""}{usedChars.toLocaleString()} / {CHAR_BUDGET.toLocaleString()} 字
          </span>
          <span style={{
            fontSize: 9.5, color: INK, opacity: 0.38, marginLeft: 6,
            textDecoration: "underline",
          }}>
            查看 →
          </span>
        </div>
      </div>

    </div>
  );
}
