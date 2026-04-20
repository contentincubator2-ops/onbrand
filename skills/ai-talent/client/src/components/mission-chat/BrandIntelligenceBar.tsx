/**
 * BrandIntelligenceBar — Unified brand context strip
 *
 * Combines:
 *   • Brand positioning estimate (tagline, audience, isEstimate flag)
 *   • Brand brain knowledge count + token meter
 *   • Mission tagline / sub-tagline (inline-editable)
 *
 * Replaces: BrandPositioningBar (AppShell) + BrandBrainStrip (MissionChatCore) + TaglineBar (above ChatInput)
 *
 * Layout (always visible, single row):
 *   [🧠 icon] [brand tagline or "推估中"] [推估 badge] [brain N筆] [████ token bar] [▼]
 *
 * When expanded (click to toggle):
 *   ─ 品牌定位 section: tagline + valueProposition + audience tags
 *   ─ 品牌大腦 section: top-3 brain items preview + "查看全部" link
 *   ─ 任務標語 section: editable tagline + subTagline inputs (replaces TaglineBar)
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "../../lib/trpc";

// ─── Constants ────────────────────────────────────────────────────────────────
const TOKEN_BUDGET = 2000;
const CHARS_PER_TOKEN = 4;
const CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN;
const ORANGE = "#C9823A";
const ORANGE_LIGHT = "#FFF7ED";
const ORANGE_BORDER = "#F5C9A8";

const CATEGORY_LABELS: Record<string, string> = {
  positioning: "定位", audience: "受眾", voice: "語調",
  competitors: "競品", custom: "其他",
};
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  positioning: { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" },
  audience:    { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  voice:       { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
  competitors: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" },
  custom:      { bg: "#F9FAFB", text: "#374151", border: "#E5E7EB" },
};

function approxTokens(items: any[]): number {
  return Math.ceil(
    items.reduce((s, i) => s + (i.content?.length ?? 0) + (i.title?.length ?? 0), 0) / CHARS_PER_TOKEN
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  brandId:    number | null | undefined;
  missionId:  number | null | undefined;
  tagline:    string | null | undefined;      // from mission
  subTagline: string | null | undefined;      // from mission
  onUpdate:   (tagline: string | null, subTagline: string | null) => void | Promise<void>;
}

export default function BrandIntelligenceBar({ brandId, missionId, tagline, subTagline, onUpdate }: Props) {
  const [expanded, setExpanded]         = useState(false);
  const [localTag, setLocalTag]         = useState(tagline ?? "");
  const [localSub, setLocalSub]         = useState(subTagline ?? "");
  const [saving, setSaving]             = useState(false);
  const initRef                         = useRef({ tag: tagline ?? "", sub: subTagline ?? "" });

  // Sync props → local when mission changes
  useEffect(() => { setLocalTag(tagline ?? ""); initRef.current.tag = tagline ?? ""; }, [tagline, missionId]);
  useEffect(() => { setLocalSub(subTagline ?? ""); initRef.current.sub = subTagline ?? ""; }, [subTagline, missionId]);

  // ── Brand positioning ──────────────────────────────────────────────────────
  const posQuery = (trpc as any).brand?.getPositioning?.useQuery
    ? (trpc as any).brand.getPositioning.useQuery(
        { brandId: brandId! },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 }
      )
    : { data: null, refetch: () => {} };
  const genEstimate = (trpc as any).brand?.generateEstimate?.useMutation
    ? (trpc as any).brand.generateEstimate.useMutation({ onSuccess: () => posQuery.refetch?.() })
    : { mutate: () => {}, isLoading: false };

  const pos = posQuery.data as any;
  const isEstimating = !pos || (!pos.tagline && genEstimate.isLoading);
  const posTagline   = pos?.tagline ?? "";
  const posSub       = pos?.valueProposition ?? "";
  const isEstimate   = pos?.isEstimate === 1;
  const posTags      = [pos?.targetMarket, pos?.audienceA, pos?.audienceB, pos?.emotionalDiff, pos?.functionalDiff].filter(Boolean) as string[];

  // Auto-trigger estimate if no tagline yet
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

  // ── Tagline commit ────────────────────────────────────────────────────────
  const commitTagline = async () => {
    if (!missionId) return;
    const t = localTag.trim();
    const s = localSub.trim();
    if (t === initRef.current.tag && s === initRef.current.sub) return;
    setSaving(true);
    try {
      await onUpdate(t.length ? t : null, s.length ? s : null);
      initRef.current = { tag: t, sub: s };
    } finally { setSaving(false); }
  };

  // ── Auto-fill tagline from positioning if mission tagline is empty ────────
  useEffect(() => {
    if (!localTag && posTagline && missionId) {
      setLocalTag(posTagline);
    }
  }, [posTagline, missionId]);

  if (!brandId) return null;

  const collapsedLabel = isEstimating
    ? "AI 正在推估品牌定位…"
    : posTagline || "品牌定位尚未設定";

  const inputBase: React.CSSProperties = {
    width: "100%", border: "1px solid #E4E3E1", borderRadius: 7,
    padding: "5px 9px", fontSize: 12, color: "#1A1A18",
    fontFamily: "inherit", outline: "none",
    background: "#FAFAF9", transition: "border-color 0.15s",
  };

  return (
    <div style={{
      flexShrink: 0,
      borderBottom: `1px solid ${expanded ? ORANGE_BORDER : "#ECEAE8"}`,
      background: expanded ? ORANGE_LIGHT : "white",
      transition: "background 0.2s",
    }}>

      {/* ── Collapsed bar (always visible) ── */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", cursor: "pointer", minHeight: 36 }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Brain icon */}
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: `linear-gradient(135deg, ${ORANGE}, #E8631A)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 2px 5px rgba(201,130,58,0.30)`,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.88A2.5 2.5 0 0 1 9.5 2Z"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.88A2.5 2.5 0 0 0 14.5 2Z"/>
          </svg>
        </div>

        {/* Brand positioning tagline */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
          {isEstimating ? (
            <span style={{ fontSize: 11, color: "#B0AFA9", fontStyle: "italic" }}>AI 正在推估品牌定位…</span>
          ) : (
            <>
              <span style={{
                fontSize: 11, fontWeight: 600, color: "#1A1A18",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200,
              }}>
                {posTagline || "品牌定位尚未設定"}
              </span>
              {isEstimate && (
                <span style={{
                  fontSize: 9, color: "#E8631A", border: "1px solid #F5C4A8",
                  borderRadius: 4, padding: "1px 5px", fontWeight: 500, flexShrink: 0,
                }}>✦ 推估中</span>
              )}
              {/* Mission tagline preview if set and differs from brand tagline */}
              {localTag && localTag !== posTagline && (
                <>
                  <span style={{ fontSize: 9, color: "#C5C3BE" }}>·</span>
                  <span style={{
                    fontSize: 11, color: "#6B6A66",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150,
                  }}>
                    {localTag}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* Brain count */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          {brainItems.length > 0 ? (
            <span style={{
              fontSize: 10, fontWeight: 600, color: "#9B7A55",
              background: ORANGE_LIGHT, border: `1px solid ${ORANGE_BORDER}`,
              borderRadius: 10, padding: "0 6px",
            }}>{brainItems.length} 筆</span>
          ) : (
            <span style={{
              fontSize: 10, color: "#C5C3BE",
              background: "#F2F1EF", border: "1px solid #E4E3E1",
              borderRadius: 10, padding: "0 6px",
            }}>無知識</span>
          )}
        </div>

        {/* Token meter */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, width: 90, flexShrink: 0 }}>
          <div style={{ flex: 1, height: 3, borderRadius: 2, background: "#EDE9E4", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: meterColor, borderRadius: 2, transition: "width 0.4s" }} />
          </div>
          <span style={{ fontSize: 9, color: isFull ? "#EF4444" : "#9B9990", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {usedTokens}/{TOKEN_BUDGET}
          </span>
        </div>

        {/* Chevron */}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Section 1: 品牌定位 */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: ORANGE, letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase" as const }}>
              品牌定位
            </div>
            {isEstimating ? (
              <div style={{ fontSize: 11, color: "#B0AFA9", fontStyle: "italic" }}>AI 正在分析品牌定位，請稍候…</div>
            ) : !posTagline ? (
              <div style={{ fontSize: 11, color: "#B0AFA9" }}>品牌定位尚未設定</div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18", marginBottom: 3 }}>
                  {posTagline}
                  {isEstimate && (
                    <span style={{
                      fontSize: 9, color: "#E8631A", border: "1px solid #F5C4A8",
                      borderRadius: 4, padding: "1px 5px", fontWeight: 500, marginLeft: 6,
                    }}>✦ 推估中</span>
                  )}
                </div>
                {posSub && <div style={{ fontSize: 11, color: "#6B6A66", lineHeight: 1.5, marginBottom: 4 }}>{posSub}</div>}
                {posTags.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                    {posTags.map((tag, i) => (
                      <span key={i} style={{
                        fontSize: 10, padding: "2px 7px", borderRadius: 10,
                        background: i === 0 ? "#FFF0E8" : "#F2F1EF",
                        color: i === 0 ? "#E8631A" : "#6B6A66",
                        border: i === 0 ? "1px solid #F5C4A8" : "1px solid #E4E3E1",
                      }}>{tag}</span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#F0EFED" }} />

          {/* Section 2: 品牌大腦 */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: ORANGE, letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                品牌大腦
              </span>
              <button
                onClick={handleFocusBrain}
                style={{
                  fontSize: 10, color: ORANGE, background: "none", border: "none",
                  cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline",
                }}>
                查看全部 →
              </button>
            </div>
            {brainItems.length === 0 ? (
              <div style={{ fontSize: 11, color: "#9B9990", fontStyle: "italic" }}>
                尚無知識。聊天後點擊「存入品牌大腦」建立首筆知識。
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                {brainItems.slice(0, 3).map((item: any, i: number) => {
                  const cat = item.category ?? item.key ?? "custom";
                  const col = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.custom;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "flex-start", gap: 6,
                      padding: "4px 8px", borderRadius: 6,
                      background: "white", border: "1px solid #ECEAE8",
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                        background: col.bg, color: col.text, border: `1px solid ${col.border}`,
                        flexShrink: 0,
                      }}>{CATEGORY_LABELS[cat] ?? cat}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18" }}>{item.title ?? item.key ?? "知識項目"}</div>
                        <div style={{ fontSize: 10, color: "#6B6A66", lineHeight: 1.4 }}>
                          {(item.content ?? "").slice(0, 70)}{(item.content?.length ?? 0) > 70 ? "…" : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {brainItems.length > 3 && (
                  <div style={{ fontSize: 10, color: "#9B9990", textAlign: "center" as const, padding: "2px 0" }}>
                    + {brainItems.length - 3} 筆更多知識
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#F0EFED" }} />

          {/* Section 3: 任務標語 (editable tagline / subTagline) */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: ORANGE, letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase" as const }}>
              任務標語
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 10, color: "#9a8f82", width: 40, flexShrink: 0 }}>主標語</span>
                <input
                  type="text"
                  value={localTag}
                  onChange={e => setLocalTag(e.target.value.slice(0, 255))}
                  onBlur={commitTagline}
                  placeholder={posTagline || "點擊新增品牌定位標語..."}
                  disabled={!missionId}
                  maxLength={255}
                  style={inputBase}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = ORANGE; }}
                  onBlurCapture={e => { (e.target as HTMLInputElement).style.borderColor = "#E4E3E1"; }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 10, color: "#9a8f82", width: 40, flexShrink: 0 }}>副標語</span>
                <input
                  type="text"
                  value={localSub}
                  onChange={e => setLocalSub(e.target.value.slice(0, 255))}
                  onBlur={commitTagline}
                  placeholder={posSub ? posSub.slice(0, 50) + "…" : "點擊新增副標語..."}
                  disabled={!missionId}
                  maxLength={255}
                  style={inputBase}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = ORANGE; }}
                  onBlurCapture={e => { (e.target as HTMLInputElement).style.borderColor = "#E4E3E1"; }}
                />
              </div>
              {saving && <span style={{ fontSize: 10, color: ORANGE }}>儲存中…</span>}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
