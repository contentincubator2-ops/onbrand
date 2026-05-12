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
 * 4 variants cover all 20 tasks:
 *   ProposalCover  → tagline / positioning / manifesto / elevator-pitch
 *   ProposalSpec   → value-prop / voice / archetype / forbidden-words /
 *                    naming / competitor-map
 *   ResearchDoc    → interview-guide / survey / jtbd / usability /
 *                    screener / consent / synthesis-template
 *   PersonaCard    → persona-draft / journey-map / competitive-interview
 */
import React from "react";
import { Avatar, Chip, Divider } from "@heroui/react";
import { type MockupFields, MarkdownText } from "./shared";

// ─────────────────────────────────────────────────────────────────────────────
// COVER — single big statement type (tagline / positioning / manifesto)
// ─────────────────────────────────────────────────────────────────────────────
export function ProposalCover({ title, brandName, variantLabel, liveCaption }: MockupFields) {
  const today = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
  return (
    <div className="w-full max-w-[760px] mx-auto bg-white">
      {/* Header strip */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-default-100 text-tiny text-default-500">
        <span className="uppercase tracking-widest">PROPOSAL · {brandName ?? "BRAND"}</span>
        <span>{variantLabel ?? "封面"}</span>
      </div>

      {/* Hero block */}
      <div
        className="px-10 py-16 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%)" }}
      >
        <p className="text-tiny font-semibold uppercase tracking-[0.2em] text-secondary mb-4">
          {title || "Brand Proposal"}
        </p>
        <h1
          className="font-bold leading-tight text-default-900"
          style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.4rem)" }}
        >
          <MarkdownText content={liveCaption || "（agent 撰寫中…）"} />
        </h1>
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-secondary/10" />
        <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-primary/10" />
      </div>

      {/* Footer signature */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-default-100">
        <div className="flex items-center gap-2">
          <Avatar size="sm" name={brandName ?? "B"} className="w-8 h-8 bg-secondary/15 text-secondary" />
          <div className="text-tiny">
            <p className="font-semibold">{brandName ?? "Brand"}</p>
            <p className="text-default-500">SoWork · Drop</p>
          </div>
        </div>
        <p className="text-tiny text-default-500">{today}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEC — structured spec sheet (value-prop / voice / archetype / etc.)
// ─────────────────────────────────────────────────────────────────────────────
export function ProposalSpec({ title, brandName, variantLabel, liveCaption }: MockupFields) {
  const today = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
  return (
    <div className="w-full max-w-[760px] mx-auto bg-white">
      {/* Header */}
      <div className="px-8 py-5 border-b border-default-200">
        <div className="flex items-baseline justify-between mb-1.5">
          <h2 className="text-large font-bold text-default-900">{title || variantLabel || "Brand Spec"}</h2>
          <Chip size="sm" variant="flat" color="secondary" className="h-5 text-tiny">v1</Chip>
        </div>
        <div className="flex items-center gap-3 text-tiny text-default-500">
          <span>{brandName ?? "Brand"}</span>
          <span>·</span>
          <span>{today}</span>
          <span>·</span>
          <span className="font-mono">{variantLabel}</span>
        </div>
      </div>

      {/* Body — formatted as document content */}
      <div className="px-8 py-6 prose prose-sm max-w-none">
        <div className="text-default-800 leading-relaxed text-small whitespace-pre-wrap">
          <MarkdownText content={liveCaption || "（agent 撰寫中… 結果將以 spec 樣式呈現）"} />
        </div>
      </div>

      {/* Sign-off footer */}
      <div className="px-8 py-3 border-t border-default-100 flex items-center justify-between text-tiny text-default-400">
        <span>SoWork OnBrand · Brand Spec</span>
        <span>第 1 頁，共 1 頁</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCH — research document (interview-guide / survey / jtbd / etc.)
// ─────────────────────────────────────────────────────────────────────────────
export function ResearchDoc({ title, brandName, variantLabel, liveCaption }: MockupFields) {
  return (
    <div className="w-full max-w-[760px] mx-auto bg-white">
      {/* Header — research doc style */}
      <div className="px-8 py-4 bg-default-50 border-b border-default-200">
        <div className="flex items-center gap-2 mb-1">
          <Chip size="sm" variant="flat" color="warning" className="h-5 text-tiny">RESEARCH</Chip>
          <span className="text-tiny text-default-500">{brandName ?? ""}</span>
        </div>
        <h2 className="text-large font-bold text-default-900">{title || variantLabel || "Research Document"}</h2>
        <p className="text-tiny text-default-500 mt-1">{variantLabel}</p>
      </div>

      {/* Body — research content with hierarchical formatting */}
      <div className="px-8 py-6">
        <div className="text-small leading-relaxed text-default-800">
          <MarkdownText content={liveCaption || "（agent 撰寫研究文件中…）"} />
        </div>
      </div>

      {/* Footnote */}
      <div className="px-8 py-3 border-t border-default-100 flex items-center justify-between text-tiny text-default-400">
        <span>📋 Research Protocol · 由 SoWork OnBrand 產出</span>
        <span>機密 · Internal use only</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONA CARD — persona / journey / competitive-interview
// ─────────────────────────────────────────────────────────────────────────────
export function PersonaCard({ title, brandName, variantLabel, liveCaption }: MockupFields) {
  // Try to extract a "name" from the first line of caption to display as avatar
  const firstLine = (liveCaption ?? "").split("\n").find(l => l.trim().length > 0) ?? "";
  const initial = (firstLine.match(/[\p{L}A-Z]/u)?.[0] ?? "P").toUpperCase();
  return (
    <div className="w-full max-w-[760px] mx-auto bg-white">
      {/* Header — persona-card style */}
      <div
        className="px-8 py-6 flex items-center gap-4"
        style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #FBBF24 100%)" }}
      >
        <Avatar
          size="lg"
          name={initial}
          className="w-16 h-16 text-large font-bold bg-white/90 text-default-800 shadow-md"
        />
        <div className="flex-1 min-w-0">
          <Chip size="sm" variant="flat" className="h-5 text-tiny mb-1 bg-white/60">PERSONA</Chip>
          <h2 className="text-large font-bold text-default-900 truncate">
            {title || variantLabel || "用戶 Persona"}
          </h2>
          <p className="text-tiny text-default-700">{brandName ?? "Brand"}</p>
        </div>
      </div>

      <Divider />

      {/* Body */}
      <div className="px-8 py-6">
        <div className="text-small leading-relaxed text-default-800">
          <MarkdownText content={liveCaption || "（agent 正在描繪 persona…）"} />
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-3 border-t border-default-100 text-tiny text-default-400 text-center">
        🎭 User Persona · {variantLabel}
      </div>
    </div>
  );
}
