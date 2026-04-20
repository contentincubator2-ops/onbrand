/**
 * BrandBrainBar.tsx
 *
 * Brand context strip with:
 *  - Neural-node tiling pattern as background texture
 *  - Prominent "品牌大腦" section header
 *  - Inline positioning data (tagline, value prop, audience, USP)
 *  - Knowledge meter row
 */
import React, { useEffect, useMemo } from "react";
import { trpc } from "../../lib/trpc";

// ─── Design tokens ────────────────────────────────────────────────────────────
const INK    = "#1A1A18";
const MUTED  = "#8C8B87";
const SUBTLE = "#B8B7B3";
const BORDER = "#E8E7E5";

const TOKEN_BUDGET    = 2000;
const CHARS_PER_TOKEN = 4;

// ─── Neural-network tiling pattern (SVG data URL) ─────────────────────────────
// 48×48 tile: centre node → 4 cardinal nodes → 4 corner nodes + spokes.
// Tiled, these form a continuous network across the panel background.
const PATTERN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">
  <circle cx="24" cy="24" r="1.8" fill="${INK}" opacity="0.09"/>
  <circle cx="24" cy="0"  r="1.1" fill="${INK}" opacity="0.055"/>
  <circle cx="24" cy="48" r="1.1" fill="${INK}" opacity="0.055"/>
  <circle cx="0"  cy="24" r="1.1" fill="${INK}" opacity="0.055"/>
  <circle cx="48" cy="24" r="1.1" fill="${INK}" opacity="0.055"/>
  <circle cx="0"  cy="0"  r="0.9" fill="${INK}" opacity="0.03"/>
  <circle cx="48" cy="0"  r="0.9" fill="${INK}" opacity="0.03"/>
  <circle cx="0"  cy="48" r="0.9" fill="${INK}" opacity="0.03"/>
  <circle cx="48" cy="48" r="0.9" fill="${INK}" opacity="0.03"/>
  <line x1="24" y1="22.2" x2="24" y2="1.1"  stroke="${INK}" stroke-width="0.6" opacity="0.045"/>
  <line x1="24" y1="25.8" x2="24" y2="46.9" stroke="${INK}" stroke-width="0.6" opacity="0.045"/>
  <line x1="22.2" y1="24" x2="1.1"  y2="24" stroke="${INK}" stroke-width="0.6" opacity="0.045"/>
  <line x1="25.8" y1="24" x2="46.9" y2="24" stroke="${INK}" stroke-width="0.6" opacity="0.045"/>
  <line x1="22.7" y1="22.7" x2="1"   y2="1"   stroke="${INK}" stroke-width="0.5" opacity="0.025"/>
  <line x1="25.3" y1="22.7" x2="47"  y2="1"   stroke="${INK}" stroke-width="0.5" opacity="0.025"/>
  <line x1="22.7" y1="25.3" x2="1"   y2="47"  stroke="${INK}" stroke-width="0.5" opacity="0.025"/>
  <line x1="25.3" y1="25.3" x2="47"  y2="47"  stroke="${INK}" stroke-width="0.5" opacity="0.025"/>
</svg>`;

const PATTERN_URL = `url("data:image/svg+xml,${encodeURIComponent(PATTERN_SVG)}")`;

// ─── Neural-node icon (inline, matches pattern motif) ────────────────────────
function NeuralIcon({ size = 15, opacity = 1 }: { size?: number; opacity?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={{ opacity, flexShrink: 0 }}>
      <circle cx="12" cy="12" r="2.4" fill={INK} />
      <circle cx="12" cy="4"  r="1.4" fill={INK} opacity="0.7" />
      <circle cx="12" cy="20" r="1.4" fill={INK} opacity="0.7" />
      <circle cx="4"  cy="12" r="1.4" fill={INK} opacity="0.7" />
      <circle cx="20" cy="12" r="1.4" fill={INK} opacity="0.7" />
      <circle cx="5.8"  cy="5.8"  r="1.0" fill={INK} opacity="0.38" />
      <circle cx="18.2" cy="5.8"  r="1.0" fill={INK} opacity="0.38" />
      <circle cx="5.8"  cy="18.2" r="1.0" fill={INK} opacity="0.38" />
      <circle cx="18.2" cy="18.2" r="1.0" fill={INK} opacity="0.38" />
      <line x1="12" y1="9.6"  x2="12" y2="5.4"  stroke={INK} strokeWidth="0.9" opacity="0.45"/>
      <line x1="12" y1="14.4" x2="12" y2="18.6" stroke={INK} strokeWidth="0.9" opacity="0.45"/>
      <line x1="9.6"  y1="12" x2="5.4"  y2="12" stroke={INK} strokeWidth="0.9" opacity="0.45"/>
      <line x1="14.4" y1="12" x2="18.6" y2="12" stroke={INK} strokeWidth="0.9" opacity="0.45"/>
      <line x1="10.5" y1="10.5" x2="6.7"  y2="6.7"  stroke={INK} strokeWidth="0.7" opacity="0.22"/>
      <line x1="13.5" y1="10.5" x2="17.3" y2="6.7"  stroke={INK} strokeWidth="0.7" opacity="0.22"/>
      <line x1="10.5" y1="13.5" x2="6.7"  y2="17.3" stroke={INK} strokeWidth="0.7" opacity="0.22"/>
      <line x1="13.5" y1="13.5" x2="17.3" y2="17.3" stroke={INK} strokeWidth="0.7" opacity="0.22"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Component ───────────────────────────────────────────────────────────────
export function BrandBrainBar({ brandId, missionId }: Props) {

  // ── Brand positioning ──────────────────────────────────────────────────────
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

  // ── Brand knowledge ────────────────────────────────────────────────────────
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
  const meterFill  = isFull ? "#EF4444" : pct > 60 ? "#F59E0B" : INK;

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
      borderBottom: `1px solid ${BORDER}`,
      position: "relative",
      overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
      background: "#FFFFFF",
    }}>

      {/* ══════════════════════════════════════════════════════════
          SECTION HEADER — "品牌大腦" with neural-pattern background
          ══════════════════════════════════════════════════════════ */}
      <div style={{
        position: "relative",
        backgroundImage: PATTERN_URL,
        backgroundSize: "48px 48px",
        backgroundRepeat: "repeat",
        borderBottom: `1px solid ${BORDER}`,
        padding: "8px 20px 7px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        {/* Frosted overlay so text stays legible */}
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(0px)",
          pointerEvents: "none",
        }} />

        {/* Icon + label (above overlay via z-index) */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 7 }}>
          <NeuralIcon size={14} />
          <span style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: INK,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            品牌大腦
          </span>
        </div>

        {/* Knowledge count badge */}
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          {brainItems.length > 0 ? (
            <span style={{
              fontSize: 10, color: MUTED,
              background: "rgba(255,255,255,0.9)",
              border: `1px solid ${BORDER}`,
              borderRadius: 20, padding: "1px 7px",
              letterSpacing: "0.02em",
            }}>
              {brainItems.length} 筆知識
            </span>
          ) : (
            <span style={{
              fontSize: 10, color: SUBTLE,
              background: "rgba(255,255,255,0.9)",
              border: `1px solid ${BORDER}`,
              borderRadius: 20, padding: "1px 7px",
            }}>
              尚無知識
            </span>
          )}
        </div>

        {/* Token meter in header */}
        <div style={{
          position: "relative", zIndex: 1,
          display: "flex", alignItems: "center", gap: 5, width: 120,
        }}>
          <div style={{
            flex: 1, height: 2, borderRadius: 1,
            background: "rgba(0,0,0,0.08)", overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: `${pct}%`,
              background: meterFill, borderRadius: 1, transition: "width 0.4s",
            }} />
          </div>
          <span style={{
            fontSize: 9.5, color: isFull ? "#EF4444" : SUBTLE,
            fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          }}>
            {usedTokens} / {TOKEN_BUDGET}
          </span>
        </div>

        <button
          onClick={handleFocusBrain}
          style={{
            position: "relative", zIndex: 1,
            fontSize: 10.5, color: MUTED, background: "none", border: "none",
            cursor: "pointer", fontFamily: "inherit", padding: 0, flexShrink: 0,
            letterSpacing: "0.01em", transition: "color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = INK)}
          onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
        >
          查看 →
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          POSITIONING DATA
          ══════════════════════════════════════════════════════════ */}
      <div style={{ padding: "10px 20px 11px" }}>

        {genEstimate.isLoading && !hasPos ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <NeuralIcon size={13} opacity={0.4} />
            <span style={{ fontSize: 11.5, color: MUTED, letterSpacing: "0.01em" }}>
              正在推估品牌定位…
            </span>
          </div>

        ) : hasPos ? (
          <>
            {/* Tagline */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 5 }}>
              <div style={{ paddingTop: 1, flexShrink: 0 }}>
                <NeuralIcon size={13} opacity={0.55} />
              </div>
              <span style={{
                fontSize: 13.5, fontWeight: 650, color: INK,
                letterSpacing: "-0.01em", lineHeight: 1.35, flex: 1,
              }}>
                {tagline}
              </span>
              {isEst && (
                <span style={{
                  fontSize: 9.5, fontWeight: 500, color: MUTED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 20, padding: "1px 7px", flexShrink: 0,
                  letterSpacing: "0.03em", marginTop: 2,
                }}>
                  AI 推估
                </span>
              )}
            </div>

            {/* Value proposition */}
            {valueProp && (
              <p style={{
                margin: "0 0 6px 22px",
                fontSize: 12, color: "#5A5955", lineHeight: 1.55,
                letterSpacing: "0.005em",
              }}>
                {valueProp}
              </p>
            )}

            {/* Audience */}
            {hasAudience && (
              <div style={{
                display: "flex", alignItems: "center",
                flexWrap: "wrap", gap: "3px 5px",
                marginLeft: 22, marginBottom: 5,
              }}>
                <span style={{
                  fontSize: 9.5, fontWeight: 600, color: SUBTLE,
                  textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 2,
                }}>
                  受眾
                </span>
                {audience.map((a, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span style={{ color: BORDER, fontSize: 13 }}>·</span>}
                    <span style={{ fontSize: 11.5, color: "#3D3C39" }}>{a}</span>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* USP */}
            {hasUSP && (
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "3px 16px", marginLeft: 22,
              }}>
                {emoUSP && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{
                      fontSize: 9.5, fontWeight: 600, color: SUBTLE,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>情感</span>
                    <span style={{ fontSize: 11.5, color: "#3D3C39" }}>{emoUSP}</span>
                  </div>
                )}
                {funcUSP && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{
                      fontSize: 9.5, fontWeight: 600, color: SUBTLE,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>功能</span>
                    <span style={{ fontSize: 11.5, color: "#3D3C39" }}>{funcUSP}</span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11.5, color: SUBTLE }}>尚未設定品牌定位</span>
        )}

        {isFull && (
          <p style={{
            margin: "8px 0 0", fontSize: 10.5,
            color: "#B91C1C", letterSpacing: "0.01em",
          }}>
            ⚠ 知識庫接近上限，建議整合或移除舊項目。
          </p>
        )}
      </div>
    </div>
  );
}
