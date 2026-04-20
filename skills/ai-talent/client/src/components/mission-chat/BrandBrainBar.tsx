/**
 * BrandBrainBar.tsx — Perplexity-style brand context strip
 *
 * Always-visible. Shows brand positioning + knowledge meter inline.
 * Clean, typography-first design — no colored backgrounds, minimal chrome.
 */
import React, { useEffect, useMemo } from "react";
import { trpc } from "../../lib/trpc";

// ─── Constants ────────────────────────────────────────────────────────────────
const TOKEN_BUDGET    = 2000;
const CHARS_PER_TOKEN = 4;
const ACCENT          = "#1A1A18";   // near-black
const MUTED           = "#8C8B87";   // mid-gray
const BORDER          = "#EBEBEA";   // very light border

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

// ─── Neural-node icon (custom — replaces generic brain path) ──────────────────
function BrandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Central node */}
      <circle cx="12" cy="12" r="2.2" fill={ACCENT} />
      {/* Outer nodes */}
      <circle cx="12" cy="4"  r="1.4" fill={ACCENT} opacity="0.75" />
      <circle cx="12" cy="20" r="1.4" fill={ACCENT} opacity="0.75" />
      <circle cx="4"  cy="12" r="1.4" fill={ACCENT} opacity="0.75" />
      <circle cx="20" cy="12" r="1.4" fill={ACCENT} opacity="0.75" />
      <circle cx="6.3"  cy="6.3"  r="1.1" fill={ACCENT} opacity="0.45" />
      <circle cx="17.7" cy="6.3"  r="1.1" fill={ACCENT} opacity="0.45" />
      <circle cx="6.3"  cy="17.7" r="1.1" fill={ACCENT} opacity="0.45" />
      <circle cx="17.7" cy="17.7" r="1.1" fill={ACCENT} opacity="0.45" />
      {/* Spokes from center */}
      <line x1="12" y1="9.8"  x2="12" y2="5.4"  stroke={ACCENT} strokeWidth="0.9" opacity="0.5" />
      <line x1="12" y1="14.2" x2="12" y2="18.6" stroke={ACCENT} strokeWidth="0.9" opacity="0.5" />
      <line x1="9.8"  y1="12" x2="5.4"  y2="12" stroke={ACCENT} strokeWidth="0.9" opacity="0.5" />
      <line x1="14.2" y1="12" x2="18.6" y2="12" stroke={ACCENT} strokeWidth="0.9" opacity="0.5" />
      <line x1="10.4" y1="10.4" x2="7.2"  y2="7.2"  stroke={ACCENT} strokeWidth="0.9" opacity="0.3" />
      <line x1="13.6" y1="10.4" x2="16.8" y2="7.2"  stroke={ACCENT} strokeWidth="0.9" opacity="0.3" />
      <line x1="10.4" y1="13.6" x2="7.2"  y2="16.8" stroke={ACCENT} strokeWidth="0.9" opacity="0.3" />
      <line x1="13.6" y1="13.6" x2="16.8" y2="16.8" stroke={ACCENT} strokeWidth="0.9" opacity="0.3" />
    </svg>
  );
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
    ? (trpc as any).brand.generateEstimate.useMutation({ onSuccess: () => posQuery.refetch?.() })
    : { mutate: () => {}, isLoading: false };

  const pos        = posQuery.data as any;
  const tagline    = pos?.tagline ?? "";
  const valueProp  = typeof pos?.valueProposition === "string"
    ? pos.valueProposition
    : pos?.valueProposition ? JSON.stringify(pos.valueProposition) : "";
  const targetMkt  = pos?.targetMarket  ?? "";
  const audA       = pos?.audienceA     ?? "";
  const audB       = pos?.audienceB     ?? "";
  const emoUSP     = pos?.emotionalDiff ?? "";
  const funcUSP    = pos?.functionalDiff ?? "";
  const isEstimate = pos?.isEstimate === 1;

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
  const meterColor = isFull ? "#EF4444" : pct > 60 ? "#F59E0B" : "#6B6A66";

  const handleFocusBrain = () =>
    window.dispatchEvent(new CustomEvent("section-priority", { detail: { key: "brandbrain" } }));

  if (!brandId) return null;

  const hasPos      = !!tagline;
  const hasAudience = !!(audA || audB || targetMkt);
  const hasUSP      = !!(emoUSP || funcUSP);

  const audienceItems = [targetMkt, audA, audB].filter(Boolean);

  return (
    <div style={{
      flexShrink: 0,
      borderBottom: `1px solid ${BORDER}`,
      background: "#FFFFFF",
      padding: "12px 20px 10px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
    }}>

      {/* ── Positioning ── */}
      {genEstimate.isLoading && !hasPos ? (

        /* Loading state */
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
          <BrandIcon />
          <span style={{ fontSize: 12, color: MUTED, letterSpacing: "0.01em" }}>
            正在推估品牌定位…
          </span>
          <span style={{
            display: "inline-block", width: 5, height: 5, borderRadius: "50%",
            background: MUTED, animation: "pulse 1.5s ease-in-out infinite",
          }} />
        </div>

      ) : hasPos ? (
        <div style={{ marginBottom: 9 }}>

          {/* ── Row 1: Icon + Tagline + badge ── */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 5 }}>
            <div style={{ paddingTop: 1, flexShrink: 0, opacity: 0.85 }}>
              <BrandIcon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                fontSize: 13.5, fontWeight: 650, color: ACCENT,
                letterSpacing: "-0.01em", lineHeight: 1.35,
              }}>
                {tagline}
              </span>
            </div>
            {isEstimate && (
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

          {/* ── Row 2: Value proposition ── */}
          {valueProp && (
            <p style={{
              margin: "0 0 7px 25px",
              fontSize: 12, color: "#5A5955", lineHeight: 1.55,
              letterSpacing: "0.005em",
            }}>
              {valueProp}
            </p>
          )}

          {/* ── Row 3: Audience ── */}
          {hasAudience && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginLeft: 25, marginBottom: 5 }}>
              <span style={{ fontSize: 10.5, color: MUTED, marginRight: 1, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 500 }}>
                受眾
              </span>
              {audienceItems.map((a, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{ color: BORDER, fontSize: 12, userSelect: "none" }}>·</span>}
                  <span style={{ fontSize: 11.5, color: "#3D3C39" }}>{a}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* ── Row 4: USP ── */}
          {hasUSP && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginLeft: 25 }}>
              {emoUSP && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span style={{
                    fontSize: 9.5, fontWeight: 600, color: MUTED,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>情感</span>
                  <span style={{ fontSize: 11.5, color: "#3D3C39" }}>{emoUSP}</span>
                </div>
              )}
              {funcUSP && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span style={{
                    fontSize: 9.5, fontWeight: 600, color: MUTED,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>功能</span>
                  <span style={{ fontSize: 11.5, color: "#3D3C39" }}>{funcUSP}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Divider ── */}
      {hasPos && <div style={{ height: 1, background: BORDER, margin: "8px 0 7px" }} />}

      {/* ── Brain meter row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: ACCENT, letterSpacing: "0.01em" }}>
          品牌知識庫
        </span>

        <span style={{ fontSize: 11, color: brainItems.length > 0 ? "#3D3C39" : MUTED }}>
          {brainItems.length > 0 ? `${brainItems.length} 筆` : "尚無內容"}
        </span>

        {/* Meter */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            flex: 1, height: 2, borderRadius: 1,
            background: "#EBEBEA", overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: `${pct}%`,
              background: meterColor, borderRadius: 1,
              transition: "width 0.4s ease",
            }} />
          </div>
          <span style={{
            fontSize: 10, color: isFull ? "#EF4444" : MUTED,
            fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          }}>
            {usedTokens} / {TOKEN_BUDGET}
          </span>
        </div>

        <button
          onClick={handleFocusBrain}
          style={{
            fontSize: 11, color: MUTED, background: "none", border: "none",
            cursor: "pointer", fontFamily: "inherit", padding: 0,
            flexShrink: 0, letterSpacing: "0.01em",
            transition: "color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = ACCENT)}
          onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
        >
          查看 →
        </button>
      </div>

      {isFull && (
        <p style={{
          margin: "6px 0 0",
          fontSize: 10.5, color: "#B91C1C",
          letterSpacing: "0.01em", lineHeight: 1.4,
        }}>
          ⚠ 知識庫接近上限，建議整合或移除舊項目。
        </p>
      )}
    </div>
  );
}
