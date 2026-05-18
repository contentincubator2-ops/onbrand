/**
 * Proposal-style mockups for Brand + Research tasks.
 *
 * 2026-05-09 (CJ direction): the 20 Brand+Research tasks were falling
 * back to GenericMockup which showed only a "即將推出" placeholder.
 * Inspired by betterproposals.io brand-design-proposal templates,
 * these new variants render the agent's output as a proper document
 * (cover / spec sheet / research doc / persona card) instead of an
 * empty card.
 *
 * 2026-05-19 (CJ): redesigned to match Figma Community "Project Proposal
 * Template" split-panel aesthetic — dark left sidebar (slate-950) with
 * brand metadata + clean white right content area. Applies to all 4 variants.
 *
 * 4 variants cover all tasks:
 *   ProposalCover  → tagline / positioning / manifesto / elevator-pitch
 *   ProposalSpec   → value-prop / voice / archetype / forbidden-words /
 *                    naming / competitor-map
 *   ResearchDoc    → research docs + 99s strategy tabs (save-worthy,
 *                    yt-quarterly, li-newsletter, etc.)
 *   PersonaCard    → persona-draft / journey-map / competitive-interview
 */
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Divider } from "@heroui/react";
import { type MockupFields } from "./shared";

// ─── shared palette ──────────────────────────────────────────────────────────
const SIDEBAR_BG   = "#0F172A";   // slate-950
const SIDEBAR_TEXT = "#F8FAFC";   // near-white
const ACCENT       = "#38BDF8";   // sky-400 — section label + decorative
const ACCENT_DIM   = "rgba(56,189,248,0.18)";
const META_DIM     = "rgba(248,250,252,0.38)";

// ─── MarkdownDoc — full prose renderer for sidebar-right layout ──────────────
function MarkdownDoc({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0F172A", marginTop: "1.4rem", marginBottom: "0.4rem", lineHeight: 1.3, borderBottom: "1.5px solid #E2E8F0", paddingBottom: "0.3rem" }}>
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1E293B", marginTop: "1.2rem", marginBottom: "0.3rem", lineHeight: 1.35, display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
            <span style={{ color: ACCENT, fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2, flexShrink: 0 }}>▸</span>
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 style={{ fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginTop: "0.9rem", marginBottom: "0.2rem", lineHeight: 1.4 }}>
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p style={{ fontSize: "0.82rem", lineHeight: 1.75, color: "#475569", marginBottom: "0.55rem" }}>
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong style={{ fontWeight: 700, color: "#1E293B" }}>{children}</strong>
        ),
        em: ({ children }) => (
          <em style={{ color: "#64748B", fontStyle: "italic" }}>{children}</em>
        ),
        ul: ({ children }) => (
          <ul style={{ paddingLeft: "1.1rem", marginBottom: "0.55rem", listStyleType: "disc" }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ paddingLeft: "1.1rem", marginBottom: "0.55rem" }}>{children}</ol>
        ),
        li: ({ children }) => (
          <li style={{ fontSize: "0.82rem", lineHeight: 1.7, color: "#475569", marginBottom: "0.15rem" }}>{children}</li>
        ),
        blockquote: ({ children }) => (
          <blockquote style={{ borderLeft: `3px solid ${ACCENT}`, paddingLeft: "0.75rem", color: "#64748B", fontStyle: "italic", margin: "0.6rem 0" }}>
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => {
          const isBlock = !!className;
          return isBlock
            ? <code style={{ display: "block", background: "#F1F5F9", padding: "0.6rem 0.8rem", borderRadius: 6, fontSize: "0.74rem", color: "#334155", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{children}</code>
            : <code style={{ background: "#F1F5F9", padding: "0.1rem 0.3rem", borderRadius: 4, fontSize: "0.74rem", color: "#0EA5E9", fontFamily: "monospace" }}>{children}</code>;
        },
        table: ({ children }) => (
          <div style={{ overflowX: "auto", marginBottom: "0.7rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "0.35rem 0.55rem", fontWeight: 600, color: "#334155", textAlign: "left" }}>{children}</th>
        ),
        td: ({ children }) => (
          <td style={{ border: "1px solid #E2E8F0", padding: "0.3rem 0.55rem", color: "#475569" }}>{children}</td>
        ),
        hr: () => <hr style={{ border: "none", borderTop: "1px solid #E2E8F0", margin: "1rem 0" }} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Sidebar — shared left panel ─────────────────────────────────────────────
interface SidebarProps {
  brandName?: string | null;
  variantLabel?: string;
  docType?: string;
  chipLabel?: string;
}

function ProposalSidebar({ brandName, variantLabel, docType = "Document", chipLabel }: SidebarProps) {
  const today = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
  const initial = (brandName ?? "B").charAt(0).toUpperCase();

  return (
    <div
      style={{
        width: 188,
        flexShrink: 0,
        background: SIDEBAR_BG,
        display: "flex",
        flexDirection: "column",
        padding: "28px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Accent left strip */}
      <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: ACCENT }} />

      {/* Brand monogram */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 7, background: ACCENT_DIM,
          border: `1.5px solid ${ACCENT}40`, display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 14, color: ACCENT, letterSpacing: "-0.02em",
        }}>
          {initial}
        </div>
        <span style={{ color: META_DIM, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
          {brandName ?? "Brand"}
        </span>
      </div>

      {/* Thin divider */}
      <div style={{ width: "100%", height: 1, background: "rgba(248,250,252,0.10)", marginBottom: 20 }} />

      {/* Document type chip */}
      {chipLabel && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12,
          background: ACCENT_DIM, borderRadius: 99, padding: "2px 8px",
          fontSize: 9, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em",
          alignSelf: "flex-start",
        }}>
          {chipLabel}
        </div>
      )}

      {/* Document title */}
      <p style={{
        color: SIDEBAR_TEXT, fontSize: 13, fontWeight: 700, lineHeight: 1.45,
        marginBottom: 20, wordBreak: "keep-all",
      }}>
        {variantLabel ?? docType}
      </p>

      {/* Metadata block */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        <div>
          <p style={{ color: META_DIM, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3, fontWeight: 600 }}>Date</p>
          <p style={{ color: "rgba(248,250,252,0.72)", fontSize: 11 }}>{today}</p>
        </div>
        <div>
          <p style={{ color: META_DIM, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3, fontWeight: 600 }}>Type</p>
          <p style={{ color: "rgba(248,250,252,0.72)", fontSize: 11 }}>{docType}</p>
        </div>
        <div>
          <p style={{ color: META_DIM, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3, fontWeight: 600 }}>Powered by</p>
          <p style={{ color: "rgba(248,250,252,0.72)", fontSize: 11 }}>SoWork OnBrand</p>
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Decorative circles */}
      <div style={{
        position: "absolute", bottom: -28, right: -28,
        width: 88, height: 88, borderRadius: "50%",
        border: `1.5px solid ${ACCENT}30`,
      }} />
      <div style={{
        position: "absolute", bottom: -10, right: -10,
        width: 52, height: 52, borderRadius: "50%",
        background: ACCENT_DIM,
      }} />

      {/* Confidential stamp */}
      <p style={{ color: META_DIM, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
        Confidential
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COVER — single big statement type (tagline / positioning / manifesto)
// ─────────────────────────────────────────────────────────────────────────────
export function ProposalCover({ title, brandName, variantLabel, liveCaption }: MockupFields) {
  const today = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
  const initial = (brandName ?? "B").charAt(0).toUpperCase();

  return (
    <div style={{
      width: "100%", maxWidth: 800, margin: "0 auto",
      background: "#fff",
      boxShadow: "0 8px 40px rgba(15,23,42,0.14)",
      borderRadius: 12,
      overflow: "hidden",
      border: "1px solid #E2E8F0",
    }}>
      {/* Top accent bar */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${ACCENT}, #6366F1 60%, #EC4899)` }} />

      <div style={{ display: "flex", minHeight: 520 }}>
        {/* Left sidebar */}
        <ProposalSidebar
          brandName={brandName}
          variantLabel={variantLabel ?? "Brand Proposal"}
          docType="Proposal"
          chipLabel="Cover"
        />

        {/* Right — hero content */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Hero zone */}
          <div style={{
            flex: 1,
            padding: "40px 36px 32px",
            background: "linear-gradient(145deg, #F8FAFC 0%, #EEF2FF 100%)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
          }}>
            {/* Decorative bg circles */}
            <div style={{
              position: "absolute", top: -40, right: -40,
              width: 160, height: 160, borderRadius: "50%",
              background: "rgba(99,102,241,0.07)",
            }} />
            <div style={{
              position: "absolute", bottom: -20, right: 20,
              width: 80, height: 80, borderRadius: "50%",
              background: "rgba(56,189,248,0.09)",
            }} />

            <p style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.14em", color: ACCENT, marginBottom: 14,
            }}>
              {title || variantLabel || "Brand Statement"}
            </p>

            <div style={{
              fontSize: "clamp(1.3rem, 3vw, 1.85rem)",
              fontWeight: 800,
              color: "#0F172A",
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
            }}>
              <MarkdownDoc content={liveCaption || "（agent 撰寫中…）"} />
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: "14px 36px",
            borderTop: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fff",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 6, background: ACCENT_DIM,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: ACCENT,
              }}>
                {initial}
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#1E293B", lineHeight: 1.2 }}>{brandName ?? "Brand"}</p>
                <p style={{ fontSize: 9, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em" }}>SoWork · OnBrand</p>
              </div>
            </div>
            <p style={{ fontSize: 10, color: "#94A3B8" }}>{today}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEC — structured spec sheet (value-prop / voice / archetype / etc.)
// ─────────────────────────────────────────────────────────────────────────────
export function ProposalSpec({ title, brandName, variantLabel, liveCaption }: MockupFields) {
  return (
    <div style={{
      width: "100%", maxWidth: 800, margin: "0 auto",
      background: "#fff",
      boxShadow: "0 8px 40px rgba(15,23,42,0.14)",
      borderRadius: 12,
      overflow: "hidden",
      border: "1px solid #E2E8F0",
    }}>
      {/* Top accent bar */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${ACCENT}, #6366F1 60%, #EC4899)` }} />

      <div style={{ display: "flex", minHeight: 520 }}>
        {/* Left sidebar */}
        <ProposalSidebar
          brandName={brandName}
          variantLabel={variantLabel ?? title ?? "Brand Spec"}
          docType="Brand Spec"
          chipLabel="Spec"
        />

        {/* Right — spec content */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Content header */}
          <div style={{
            padding: "22px 32px 16px",
            borderBottom: "1px solid #E2E8F0",
          }}>
            <p style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 5 }}>
              OnBrand AI · Brand Spec
            </p>
            <h1 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0F172A", lineHeight: 1.3 }}>
              {title || variantLabel || "Brand Specification"}
            </h1>
          </div>

          {/* Body */}
          <div style={{
            flex: 1,
            padding: "20px 32px 16px",
            overflowY: "auto",
            maxHeight: 480,
          }}>
            <MarkdownDoc content={liveCaption || "（agent 撰寫中… 結果將以 spec 樣式呈現）"} />
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 32px",
            borderTop: "1px solid #E2E8F0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#FAFAFA",
          }}>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>SoWork OnBrand · Brand Spec</span>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>1 / 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCH — research doc + 99s strategy tabs (most-used variant)
// ─────────────────────────────────────────────────────────────────────────────
export function ResearchDoc({ title, brandName, variantLabel, liveCaption }: MockupFields) {
  // Derive a short doc-type label from variantLabel for the chip
  const chipLabel = (() => {
    const v = (variantLabel ?? "").toLowerCase();
    if (v.includes("策略") || v.includes("strategy")) return "Strategy";
    if (v.includes("研究") || v.includes("research")) return "Research";
    if (v.includes("分析") || v.includes("analysis")) return "Analysis";
    if (v.includes("月曆") || v.includes("calendar")) return "Calendar";
    if (v.includes("指標") || v.includes("metric")) return "Metrics";
    if (v.includes("報告") || v.includes("report")) return "Report";
    if (v.includes("支柱") || v.includes("pillar")) return "Pillars";
    return "Doc";
  })();

  return (
    <div style={{
      width: "100%", maxWidth: 800, margin: "0 auto",
      background: "#fff",
      boxShadow: "0 8px 40px rgba(15,23,42,0.14)",
      borderRadius: 12,
      overflow: "hidden",
      border: "1px solid #E2E8F0",
    }}>
      {/* Top accent bar */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${ACCENT}, #6366F1 60%, #EC4899)` }} />

      <div style={{ display: "flex", minHeight: 520 }}>
        {/* Left sidebar */}
        <ProposalSidebar
          brandName={brandName}
          variantLabel={variantLabel ?? title ?? "Research Document"}
          docType="Research"
          chipLabel={chipLabel}
        />

        {/* Right — document content */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Content header */}
          <div style={{
            padding: "22px 32px 16px",
            borderBottom: "1px solid #E2E8F0",
          }}>
            <p style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 5 }}>
              OnBrand AI · {chipLabel}
            </p>
            <h1 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0F172A", lineHeight: 1.3 }}>
              {title || variantLabel || "Research Document"}
            </h1>
          </div>

          {/* Body */}
          <div style={{
            flex: 1,
            padding: "20px 32px 16px",
            overflowY: "auto",
            maxHeight: 480,
          }}>
            <MarkdownDoc content={liveCaption || "（agent 撰寫研究文件中…）"} />
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 32px",
            borderTop: "1px solid #E2E8F0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#FAFAFA",
          }}>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>SoWork OnBrand · Internal</span>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>Confidential · 1 / 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONA CARD — persona / journey / competitive-interview
// ─────────────────────────────────────────────────────────────────────────────
export function PersonaCard({ title, brandName, variantLabel, liveCaption }: MockupFields) {
  const firstLine = (liveCaption ?? "").split("\n").find(l => l.trim().length > 0) ?? "";
  const personaName = firstLine.replace(/^#+\s*/, "").slice(0, 30) || variantLabel || "Persona";
  const initial = (personaName.match(/[\p{L}A-Z]/u)?.[0] ?? "P").toUpperCase();

  return (
    <div style={{
      width: "100%", maxWidth: 800, margin: "0 auto",
      background: "#fff",
      boxShadow: "0 8px 40px rgba(15,23,42,0.14)",
      borderRadius: 12,
      overflow: "hidden",
      border: "1px solid #E2E8F0",
    }}>
      {/* Top accent bar — warmer for persona */}
      <div style={{ height: 4, background: "linear-gradient(90deg, #F59E0B, #F97316 60%, #EF4444)" }} />

      <div style={{ display: "flex", minHeight: 520 }}>
        {/* Left sidebar — amber tone for persona */}
        <div style={{
          width: 188, flexShrink: 0, background: "#1C1917",
          display: "flex", flexDirection: "column", padding: "28px 20px",
          position: "relative", overflow: "hidden",
        }}>
          {/* Accent strip — amber */}
          <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: "#F59E0B" }} />

          {/* Persona avatar */}
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "rgba(245,158,11,0.2)",
            border: "2px solid rgba(245,158,11,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 800, color: "#F59E0B",
            marginBottom: 16,
          }}>
            {initial}
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.10)", marginBottom: 16 }} />

          {/* Chip */}
          <div style={{
            display: "inline-flex", alignItems: "center",
            background: "rgba(245,158,11,0.18)", borderRadius: 99, padding: "2px 8px",
            fontSize: 9, fontWeight: 700, color: "#F59E0B",
            textTransform: "uppercase", letterSpacing: "0.1em",
            alignSelf: "flex-start", marginBottom: 10,
          }}>
            Persona
          </div>

          <p style={{ color: "#F8FAFC", fontSize: 13, fontWeight: 700, lineHeight: 1.45, marginBottom: 16, wordBreak: "keep-all" }}>
            {variantLabel ?? title ?? "User Persona"}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <p style={{ color: META_DIM, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3, fontWeight: 600 }}>Brand</p>
              <p style={{ color: "rgba(248,250,252,0.72)", fontSize: 11 }}>{brandName ?? "Brand"}</p>
            </div>
            <div>
              <p style={{ color: META_DIM, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3, fontWeight: 600 }}>Type</p>
              <p style={{ color: "rgba(248,250,252,0.72)", fontSize: 11 }}>User Research</p>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Decorative */}
          <div style={{ position: "absolute", bottom: -28, right: -28, width: 88, height: 88, borderRadius: "50%", border: "1.5px solid rgba(245,158,11,0.2)" }} />
          <div style={{ position: "absolute", bottom: -10, right: -10, width: 52, height: 52, borderRadius: "50%", background: "rgba(245,158,11,0.12)" }} />

          <p style={{ color: META_DIM, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>Confidential</p>
        </div>

        {/* Right — persona content */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "22px 32px 16px", borderBottom: "1px solid #E2E8F0" }}>
            <p style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 5 }}>
              OnBrand AI · User Persona
            </p>
            <h1 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0F172A", lineHeight: 1.3 }}>
              {title || variantLabel || "用戶 Persona"}
            </h1>
          </div>

          <div style={{ flex: 1, padding: "20px 32px 16px", overflowY: "auto", maxHeight: 480 }}>
            <MarkdownDoc content={liveCaption || "（agent 正在描繪 persona…）"} />
          </div>

          <div style={{
            padding: "10px 32px",
            borderTop: "1px solid #E2E8F0",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#FAFAFA",
          }}>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>🎭 User Persona · {variantLabel}</span>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>1 / 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
