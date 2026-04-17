/**
 * BrandPositioningBook.tsx
 * Beautiful QuickCard-style brand positioning book display.
 * Inspired by sowork-ai-v2 QuickCard + PositioningBookStyles design.
 * Renders inside the chat stream when positioning content is detected.
 */
import React, { useState } from "react";

export interface PositioningBookData {
  brandName?: string;
  positioningStatement?: string;
  tagline?: string;
  englishTagline?: string;
  targetAudience?: string;
  valueProposition?: string;
  differentiator?: string;
  brandVoice?: string;
  brandPersonality?: string[];
  keyMessages?: string[];
  competitiveContext?: string;
  icp?: string;
}

interface Props {
  data: PositioningBookData;
  onSaveToBrain?: () => void;
  onConfirm?: () => void;
}

// ── Section header (black bar like QuickCard) ─────────────────────────────────
function SectionHeader({ en, zh }: { en: string; zh: string }) {
  return (
    <div style={{
      background: "#1A1A18",
      padding: "6px 14px",
      borderRadius: "4px 4px 0 0",
      marginBottom: 0,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#9B9990", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginRight: 6 }}>
        {en}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF" }}>{zh}</span>
    </div>
  );
}

// ── Content cell ──────────────────────────────────────────────────────────────
function ContentCell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "#FFFFFF",
      border: "1px solid #E4E3E1",
      borderTop: "none",
      padding: "12px 14px",
      borderRadius: "0 0 4px 4px",
      marginBottom: 12,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Tag pill ──────────────────────────────────────────────────────────────────
function Tag({ text, color = "#F2F1EF", textColor = "#6B6A66" }: { text: string; color?: string; textColor?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: color, color: textColor,
      fontSize: 11, fontWeight: 500,
      borderRadius: 20, padding: "3px 10px",
      margin: "2px 3px", border: "1px solid rgba(0,0,0,0.06)",
    }}>
      {text}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function BrandPositioningBook({ data, onSaveToBrain, onConfirm }: Props) {
  const [saved, setSaved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSave = () => {
    setSaved(true);
    onSaveToBrain?.();
  };

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm?.();
  };

  const hasData = !!(
    data.positioningStatement || data.tagline || data.targetAudience ||
    data.valueProposition || data.differentiator
  );

  if (!hasData) return null;

  return (
    <div style={{
      border: "2px solid #1A1A18",
      borderRadius: 8,
      overflow: "hidden",
      margin: "16px 0",
      background: "#F9F9F8",
      fontFamily: "inherit",
    }}>
      {/* Book cover header */}
      <div style={{
        background: "linear-gradient(135deg, #1A1A18 0%, #2D2D2A 100%)",
        padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 10, color: "#9B9990", textTransform: "uppercase" as const, letterSpacing: "0.12em", marginBottom: 4 }}>
            Brand Positioning Book
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.3px" }}>
            {data.brandName || "品牌定位書"}
          </div>
          <div style={{ fontSize: 11, color: "#6B6A66", marginTop: 3 }}>
            AI Generated · {new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: 8,
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22,
        }}>
          🎯
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 16px 8px" }}>

        {/* Core Positioning Statement */}
        {data.positioningStatement && (
          <div style={{ marginBottom: 12 }}>
            <SectionHeader en="Core Positioning" zh="核心定位陳述" />
            <ContentCell style={{ borderLeft: "3px solid #0A6EFA" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", lineHeight: 1.7, margin: 0 }}>
                {data.positioningStatement}
              </p>
            </ContentCell>
          </div>
        )}

        {/* Taglines */}
        {(data.tagline || data.englishTagline) && (
          <div style={{ marginBottom: 12 }}>
            <SectionHeader en="Brand Tagline" zh="品牌標語" />
            <ContentCell>
              {data.tagline && (
                <div style={{ marginBottom: data.englishTagline ? 8 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9990", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 4 }}>
                    中文標語
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 700, color: "#1A1A18", margin: 0, letterSpacing: "-0.2px" }}>
                    {data.tagline}
                  </p>
                </div>
              )}
              {data.englishTagline && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9990", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 4 }}>
                    English Tagline
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "#4A4A45", fontStyle: "italic", margin: 0 }}>
                    "{data.englishTagline}"
                  </p>
                </div>
              )}
            </ContentCell>
          </div>
        )}

        {/* Two column: Target Audience + Value Proposition */}
        {(data.targetAudience || data.valueProposition || data.icp) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {(data.targetAudience || data.icp) && (
              <div>
                <SectionHeader en="Target Audience" zh="目標受眾" />
                <ContentCell>
                  <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.65, margin: 0 }}>
                    {data.targetAudience || data.icp}
                  </p>
                </ContentCell>
              </div>
            )}
            {data.valueProposition && (
              <div>
                <SectionHeader en="Value Proposition" zh="價值主張" />
                <ContentCell>
                  <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.65, margin: 0 }}>
                    {data.valueProposition}
                  </p>
                </ContentCell>
              </div>
            )}
          </div>
        )}

        {/* Differentiator */}
        {data.differentiator && (
          <div style={{ marginBottom: 12 }}>
            <SectionHeader en="Differentiator" zh="差異化競爭優勢" />
            <ContentCell style={{ borderLeft: "3px solid #7C3AED" }}>
              <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.65, margin: 0 }}>
                {data.differentiator}
              </p>
            </ContentCell>
          </div>
        )}

        {/* Brand Personality */}
        {data.brandPersonality && data.brandPersonality.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <SectionHeader en="Brand Personality" zh="品牌個性" />
            <ContentCell>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, margin: "-2px -3px" }}>
                {data.brandPersonality.map((trait, i) => (
                  <Tag
                    key={i} text={trait}
                    color={["#EFF6FF", "#F0FDF4", "#FEF3C7", "#FDF2F8", "#F0F9FF"][i % 5]}
                    textColor={["#1D4ED8", "#065F46", "#92400E", "#7C2D90", "#0C4A6E"][i % 5]}
                  />
                ))}
              </div>
            </ContentCell>
          </div>
        )}

        {/* Key Messages */}
        {data.keyMessages && data.keyMessages.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <SectionHeader en="Key Messages" zh="核心訊息" />
            <ContentCell>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {data.keyMessages.map((msg, i) => (
                  <li key={i} style={{ fontSize: 12, color: "#374151", lineHeight: 1.65, marginBottom: i < data.keyMessages!.length - 1 ? 6 : 0 }}>
                    {msg}
                  </li>
                ))}
              </ol>
            </ContentCell>
          </div>
        )}

        {/* Brand Voice */}
        {data.brandVoice && (
          <div style={{ marginBottom: 12 }}>
            <SectionHeader en="Brand Voice" zh="品牌語調" />
            <ContentCell>
              <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.65, margin: 0 }}>
                {data.brandVoice}
              </p>
            </ContentCell>
          </div>
        )}

      </div>

      {/* Action bar */}
      <div style={{
        borderTop: "1px solid #E4E3E1",
        padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end",
        background: "#F2F1EF",
      }}>
        {!saved && (
          <button
            onClick={handleSave}
            style={{
              fontSize: 12, fontWeight: 600, padding: "6px 14px",
              borderRadius: 8, border: "1px solid #E4E3E1",
              background: "#FFFFFF", color: "#6B6A66",
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            🧠 存入品牌大腦
          </button>
        )}
        {saved && (
          <span style={{ fontSize: 11, color: "#059669", fontWeight: 500 }}>
            ✓ 已存入品牌大腦
          </span>
        )}
        {!confirmed && (
          <button
            onClick={handleConfirm}
            style={{
              fontSize: 12, fontWeight: 600, padding: "6px 16px",
              borderRadius: 8, border: "none",
              background: "#1A1A18", color: "#FFFFFF",
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            ✓ 確認定位書
          </button>
        )}
        {confirmed && (
          <span style={{ fontSize: 11, color: "#059669", fontWeight: 500 }}>
            ✓ 品牌定位已確認
          </span>
        )}
      </div>
    </div>
  );
}

// ── Parser: extract positioning data from markdown text ───────────────────────
export function parsePositioningData(markdown: string): PositioningBookData | null {
  if (!markdown || markdown.length < 100) return null;

  // Must contain positioning-related keywords
  const isPositioning = /定位陳述|Positioning Statement|品牌定位書|核心定位|Brand Positioning/i.test(markdown);
  if (!isPositioning) return null;

  const extract = (patterns: RegExp[]): string | undefined => {
    for (const pattern of patterns) {
      const m = markdown.match(pattern);
      if (m && m[1]) return m[1].trim();
    }
    return undefined;
  };

  const extractList = (patterns: RegExp[]): string[] | undefined => {
    for (const pattern of patterns) {
      const m = markdown.match(pattern);
      if (m && m[1]) {
        return m[1]
          .split(/\n/)
          .map(l => l.replace(/^[\d\-\*\•]+\s*/, "").trim())
          .filter(Boolean);
      }
    }
    return undefined;
  };

  const positioningStatement = extract([
    /(?:核心定位陳述|Positioning Statement)[：:]\s*([^\n]{10,200})/i,
    /(?:定位陳述)[：:]\s*([^\n]{10,200})/i,
    /\*\*(?:定位陳述|核心定位)[：:]\*\*\s*([^\n]{10,200})/i,
  ]);

  const tagline = extract([
    /(?:中文標語|品牌標語|標語)[：:]\s*([^\n]{5,100})/i,
    /(?:Tagline)[：:（(（\s]+([^\n）)）]{5,80})/i,
  ]);

  const englishTagline = extract([
    /(?:英文標語|English Tagline)[：:]\s*([^\n]{5,100})/i,
  ]);

  const targetAudience = extract([
    /(?:目標受眾|Target Audience|ICP)[：:]\s*([^\n]{10,300})/i,
  ]);

  const valueProposition = extract([
    /(?:價值主張|Value Proposition)[：:]\s*([^\n]{10,300})/i,
  ]);

  const differentiator = extract([
    /(?:差異化|競爭優勢|Differentiator)[：:]\s*([^\n]{10,300})/i,
  ]);

  const brandVoice = extract([
    /(?:品牌語調|Brand Voice|語調)[：:]\s*([^\n]{10,200})/i,
  ]);

  const keyMessages = extractList([
    /(?:核心訊息|Key Messages)[：:]\s*\n((?:[\d\-\*\•][^\n]+\n?){2,8})/i,
  ]);

  const brandPersonality = extractList([
    /(?:品牌個性|Brand Personality)[：:]\s*\n((?:[\d\-\*\•][^\n]+\n?){2,8})/i,
  ]) ?? (() => {
    const m = markdown.match(/(?:品牌個性|Brand Personality)[：:]\s*([^\n]{5,200})/i);
    return m ? m[1].split(/[、，,]+/).map(s => s.trim()).filter(Boolean) : undefined;
  })();

  const icp = extract([
    /(?:理想客戶|ICP|Ideal Customer)[：:]\s*([^\n]{10,200})/i,
  ]);

  const hasContent = positioningStatement || tagline || targetAudience || valueProposition;
  if (!hasContent) return null;

  return {
    positioningStatement, tagline, englishTagline,
    targetAudience, valueProposition, differentiator,
    brandVoice, keyMessages, brandPersonality, icp,
  };
}
