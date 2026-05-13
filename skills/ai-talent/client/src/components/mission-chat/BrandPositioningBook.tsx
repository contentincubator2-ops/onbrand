/**
 * BrandPositioningBook.tsx
 * Beautiful QuickCard-style brand positioning book display.
 * Inspired by sowork-ai-v2 QuickCard + PositioningBookStyles design.
 * Renders inside the chat stream when positioning content is detected.
 */
import React, { useState } from "react";
import { useLang } from "../../lib/i18n";

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
  const { lang } = useLang();
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
      {lang !== "en" && (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF" }}>{zh}</span>
      )}
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
  const { lang } = useLang();
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
            {data.brandName || (lang === "en" ? "Brand Positioning Book" : "品牌定位書")}
          </div>
          <div style={{ fontSize: 11, color: "#6B6A66", marginTop: 3 }}>
            AI Generated · {new Date().toLocaleDateString(lang === "en" ? "en-US" : "zh-TW", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>
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
                    {lang === "en" ? "Chinese Tagline" : "中文標語"}
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.88A2.5 2.5 0 0 1 9.5 2Z"/>
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.88A2.5 2.5 0 0 0 14.5 2Z"/>
            </svg>
            {lang === "en" ? "Save to Brand Brain" : "存入品牌大腦"}
          </button>
        )}
        {saved && (
          <span style={{ fontSize: 11, color: "#059669", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {lang === "en" ? "Saved to Brand Brain" : "已存入品牌大腦"}
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {lang === "en" ? "Confirm Positioning" : "確認定位書"}
          </button>
        )}
        {confirmed && (
          <span style={{ fontSize: 11, color: "#059669", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {lang === "en" ? "Positioning confirmed" : "品牌定位已確認"}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Parser: extract positioning data from markdown text ───────────────────────
export function parsePositioningData(markdown: string): PositioningBookData | null {
  if (!markdown || markdown.length < 100) return null;

  // Broader positioning detection: Dunford, Moore, STP, headline/tagline markers
  const isPositioning = /定位(?:陳述|宣言|書)|Positioning|核心定位|Brand\s+Positioning|Tagline|主訊息|Headline|Dunford|Obviously\s+Awesome/i.test(markdown);
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
          .map(l => l.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*+/g, "").trim())  // clean ** markers
          .filter(Boolean);
      }
    }
    return undefined;
  };

  // Clean markdown/formatting artifacts from extracted values
  const cleanValue = (s: string): string =>
    s
      .replace(/^[#>\s]+/, "")                    // leading #, >, whitespace
      .replace(/\*\*([^*]+)\*\*/g, "$1")          // paired **bold** → bold
      .replace(/\*+/g, "")                        // stray unpaired *
      .replace(/^[🚀🎯💡⚡✨📣🔥💎🌟]+\s*/, "")    // leading emoji
      .replace(/^「|」$/g, "")                    // Chinese quotes if still present
      .replace(/^"|"$/g, "")                      // straight quotes
      .trim();

  // Helper: extract text after a specific heading (##/###/****, colon, or bold)
  // Scans from heading position for the pattern within the next 1500 chars
  const extractAfterHeading = (headings: string[], valuePatterns: RegExp[]): string | undefined => {
    for (const heading of headings) {
      const headingRe = new RegExp(`(?:^|\\n)\\s*(?:#{2,4}|\\*\\*|)\\s*(?:${heading})(?:\\*\\*)?(?:（[^）]*）|\\s*\\([^)]*\\))?[：:\\s]*\\n?`, "i");
      const m = markdown.match(headingRe);
      if (!m || m.index === undefined) continue;
      const start = m.index + m[0].length;
      const chunk = markdown.slice(start, start + 1500);
      for (const vp of valuePatterns) {
        const vm = chunk.match(vp);
        if (vm && vm[1]) return cleanValue(vm[1]);
      }
    }
    return undefined;
  };

  // Clean markdown formatting (bold/italic/inline code) but preserve structure (> separators)
  const cleanMarkdown = (s: string): string =>
    s
      .replace(/\*\*([^*]+)\*\*/g, "$1")  // **bold** → bold
      .replace(/\*([^*]+)\*/g, "$1")       // *italic* → italic
      .replace(/\*+/g, "")                 // any stray unpaired *
      .replace(/`([^`]+)`/g, "$1")         // `code` → code
      .replace(/^#{1,6}\s*/gm, "")         // remove markdown headings
      .replace(/\s*>\s*/g, " · ")          // Moore template "> " separator → " · "
      .replace(/\n{2,}/g, "\n")            // collapse blank lines
      .replace(/\s{2,}/g, " ")             // collapse extra whitespace
      .trim();

  // Positioning statement — prefer paragraph under "主定位宣言" / "完整定位宣言" headings
  const positioningStatementRaw = extractAfterHeading(
    ["主定位宣言", "完整定位宣言", "核心定位陳述", "定位陳述", "Positioning Statement", "Core Positioning"],
    [
      // Multi-line paragraph up to next heading or blank-blank
      /^\s*>?\s*([\s\S]{20,600}?)(?=\n\s*(?:#{1,4}\s|\*\*[A-Z\u4e00-\u9fff][^*]*\*\*\s*\n)|\n\n)/,
      /^\s*>?\s*([^\n]{20,500})/,
    ]
  ) ?? extract([
    /(?:核心定位陳述|Positioning Statement|定位陳述|主定位宣言)[：:]\s*([^\n]{10,400})/i,
    /(For\s+[^\n]{20,400}(?:Unlike|Our\s+product)[^\n]{5,200})/i,
  ]);
  const positioningStatement = positioningStatementRaw ? cleanMarkdown(positioningStatementRaw) : undefined;

  // Tagline — MUST come after "主訊息" / "Headline" / "品牌標語" heading to avoid noise
  const tagline = extractAfterHeading(
    ["主訊息", "Headline", "中文標語", "品牌標語", "Tagline"],
    [
      // Priority 1: find the FIRST 「XXX」 quote within the chunk (after heading)
      //            — works with any prefix (### 🚀 > ** etc.)
      /[\s\S]{0,200}?「([^」\n]{5,80})」/,
      // Priority 2: plain non-quote line (after heading, skip markdown prefixes)
      /^(?:[#>*\s🚀🎯💡⚡✨📣]*)\s*([^\n：:「」]{5,80})(?=\n|$)/,
    ]
  ) ?? extract([
    // Fallback: colon format inline
    /(?:中文標語|品牌標語)[：:]\s*([^\n]{5,100})/i,
    // Fallback: table row A in Tagline Options section
    /(?:Tagline\s*選項)[\s\S]{0,200}?\|\s*A\s*\|\s*[\*｜「"]?([^「」\|\n]{5,80}?)[\*｜」"]?\s*\|/i,
  ]);

  // English tagline — table row D or "英文標語"
  const englishTagline = extractAfterHeading(
    ["英文標語", "English Tagline"],
    [/^\s*>?\s*([^\n]{5,100})/],
  ) ?? extract([
    // Table row D in Tagline Options section
    /(?:Tagline\s*選項)[\s\S]{0,500}?\|\s*D\s*\|\s*[\*｜「"]?([^「」\|\n]{5,80}?)[\*｜」"]?\s*\|/i,
  ]);

  // Target audience — Dunford "主力 ICP" or 目標受眾
  const targetAudience = extractAfterHeading(
    ["主力\\s*ICP", "目標受眾", "Target\\s+Audience", "Ideal\\s+Customer\\s+Profile"],
    [
      /^\s*>?\s*([^\n]{10,300})/,
    ]
  ) ?? extract([
    /(?:目標受眾|Target Audience|主力\s*ICP|ICP)[：:]\s*([^\n]{10,300})/i,
  ]);

  const valueProposition = extract([
    /(?:價值主張|Value Proposition|對應屬性\s*→\s*價值主張)[：:]?\s*([^\n]{10,300})/i,
    // "【轉機】SoWork AI：..." short form
    /【(?:轉機|價值)】\s*([^\n]{10,300})/,
  ]);

  const differentiatorRaw = extractAfterHeading(
    ["差異化訊息架構", "差異化", "競爭優勢", "獨特屬性", "Differentiator", "Unique\\s+Attributes"],
    [
      // Paragraph after heading, skip table header rows (lines starting with |)
      /^(?:(?!\|)[\s\S]){0,500}?(?:^|\n)\s*((?!\|)[^\n]{15,300})/m,
      /^\s*>?\s*([^\n|]{15,300})/,
    ]
  ) ?? extract([
    /(?:差異化|競爭優勢|獨特屬性|Differentiator|Unique\s+Attributes)[：:]\s*([^\n|]{10,300})/i,
    /Unlike\s+([^\n]{10,200}Our\s+product[^\n]{10,200})/i,
  ]);
  const differentiator = differentiatorRaw ? cleanMarkdown(differentiatorRaw) : undefined;

  const brandVoice = extract([
    /(?:品牌語調|Brand Voice|語調|Tone)[：:]\s*([^\n]{10,200})/i,
  ]);

  const keyMessages = extractList([
    /(?:核心訊息|Key Messages|支撐訊息|支撐柱|Supporting Messages)[^\n]*\n((?:(?:[\d\-\*\•]|柱子\s*\d|Pillar)[^\n]+\n?){2,8})/i,
  ]) ?? (() => {
    // Try to extract "柱子 1: XXX\n柱子 2: XXX\n柱子 3: XXX"
    const pillars = markdown.match(/柱子\s*\d[：:\s]+([^\n]{5,150})/g);
    if (pillars && pillars.length >= 2) {
      return pillars.map(p =>
        p.replace(/^\**\s*柱子\s*\d[：:\s]+/, "")  // strip "**柱子 1：" prefix
         .replace(/\*\*([^*]+)\*\*/g, "$1")         // paired **
         .replace(/\*+/g, "")                       // any stray *
         .trim()
      );
    }
    return undefined;
  })();

  const brandPersonality = extractList([
    /(?:品牌個性|Brand Personality)[：:]\s*\n((?:[\d\-\*\•][^\n]+\n?){2,8})/i,
  ]) ?? (() => {
    const m = markdown.match(/(?:品牌個性|Brand Personality)[：:]\s*([^\n]{5,200})/i);
    return m ? m[1].split(/[、，,]+/).map(s => s.trim()).filter(Boolean) : undefined;
  })();

  const icp = extract([
    // Same as targetAudience but prioritize "主力 ICP" specifically
    /(?:主力\s*ICP)[：:\s]*\n+>?\s*([^\n]{10,200})/i,
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
