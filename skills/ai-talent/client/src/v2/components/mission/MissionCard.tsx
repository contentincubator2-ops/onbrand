/**
 * MissionCard — represents one of the user's missions (NOT a methodology).
 *
 * Decision (2026-04-25 CJ): mission and methodology cards must look
 * visually distinct so users can instantly tell which list they're in.
 *
 * Visual differences from MethodologyCard:
 *   - Landscape-leaning aspect ratio (4:5 vs methodology 5:7.4)
 *   - Title is the dominant typography on a white field (no colour pill)
 *   - Status pill (進行中 / 已完成) sits top-right
 *   - Layer eyebrow uses the methodology's layer if applied, else "—"
 *   - No glyph hero — replaced with a methodology summary strip
 *     ("M · 品牌原型小組" with mini-glyph) so user sees what's running
 *   - Footer is light (not dark) with brand + last update + CTA
 *
 * Rationale: missions live longer than methodologies. The card needs to
 * support repeated glances at "what's the state, what's running, when
 * was it touched", not "shop for a tool".
 */

import React from "react";
import {
  LAYER_TOKENS,
  resolveLayer,
  type MosLayer,
} from "../../../studio/primitives/tokens";
import MethodologyGlyph from "../methodology/MethodologyGlyph";

export interface MissionCardProps {
  title: string;
  /** Free text — mission objective shown under title, 2 lines. */
  brief?: string | null;
  /** Brand name (top-right area). */
  brandName?: string | null;
  /** Workspace tag — small caps. */
  workspace?: string | null;
  /** "active" | "completed" | "archived" etc. */
  status?: string | null;
  /** Methodology slug → seeds the mini-glyph. */
  methodologySlug?: string | null;
  /** Methodology display name — e.g. "Pearson 12 原型". */
  methodologyName?: string | null;
  /** Methodology layer L1-L6. */
  methodologyLayer?: string | MosLayer | null;
  /** Step count (how many workflow steps the squad has). */
  stepCount?: number | null;
  /** Last update — ISO string or pre-formatted. */
  lastUpdated?: string | null;
  /** CTA pill — default "進入 →". */
  ctaLabel?: string;
  onCtaClick?: () => void;
  onClick?: () => void;
  className?: string;
}

const STATUS_LABEL: Record<string, { label: string; tone: string; bg: string }> = {
  active:    { label: "進行中", tone: "#0E6B62", bg: "#DEF1EE" },
  completed: { label: "已完成", tone: "#525866", bg: "#E8EAEE" },
  archived:  { label: "已封存", tone: "#9B9B9B", bg: "#F2F2F2" },
  inactive:  { label: "暫停",   tone: "#9C5208", bg: "#FCEFD9" },
};

export default function MissionCard({
  title,
  brief,
  brandName,
  workspace,
  status,
  methodologySlug,
  methodologyName,
  methodologyLayer,
  stepCount,
  lastUpdated,
  ctaLabel = "進入 →",
  onCtaClick,
  onClick,
  className = "",
}: MissionCardProps) {
  const hasMethodology = !!(methodologySlug || methodologyName);
  const lk: MosLayer = resolveLayer(methodologyLayer ?? null);
  const tone = LAYER_TOKENS[lk];
  const st = STATUS_LABEL[(status ?? "active").toLowerCase()] ?? STATUS_LABEL.active;

  const updatedTxt =
    lastUpdated
      ? new Date(lastUpdated).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })
      : null;

  return (
    <article
      onClick={onClick}
      className={[
        "group relative flex flex-col w-[360px] bg-white",
        "border border-mos-hair shadow-card overflow-hidden",
        "transition-shadow duration-200",
        onClick ? "cursor-pointer hover:shadow-lift" : "",
        className,
      ].join(" ")}
      style={{ aspectRatio: "4 / 5" }}
    >
      {/* ── HEADER: brand + status ─────────────────────────────────── */}
      <header className="flex items-start justify-between px-5 pt-4">
        <div>
          <div className="text-[0.6rem] tracking-[0.28em] uppercase text-mos-soft">
            MISSION
          </div>
          <div className="mt-0.5 text-[0.74rem] tracking-[0.12em] text-mos-muted truncate max-w-[200px]">
            {(brandName ?? "SOWORK")} · {(workspace ?? "WORKSPACE").toUpperCase()}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 px-2 py-1 text-[0.62rem] tracking-[0.18em] uppercase rounded-full"
          style={{ background: st.bg, color: st.tone }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: st.tone }}
          />
          {st.label}
        </span>
      </header>

      {/* ── BODY: huge title + brief ───────────────────────────────── */}
      <div className="px-5 pt-5 pb-3">
        <h3 className="font-display text-[1.5rem] leading-[1.12] text-mos-ink tracking-[-0.015em] line-clamp-3">
          {title}
        </h3>
        {brief && (
          <p className="mt-2 text-[0.84rem] leading-snug text-mos-body line-clamp-3">
            {brief}
          </p>
        )}
      </div>

      <div className="mx-5 border-t border-mos-hair" />

      {/* ── METHODOLOGY STRIP (if applied) ─────────────────────────── */}
      {hasMethodology ? (
        <div className="flex items-center gap-3 px-5 py-3">
          <MethodologyGlyph
            seed={methodologySlug ?? methodologyName ?? "x"}
            layer={lk}
            size={56}
            withBackground
          />
          <div className="flex-1 min-w-0">
            <div className="text-[0.62rem] tracking-[0.04em] text-mos-soft">
              已套用 ・{lk}・{tone.label}
            </div>
            <div className="mt-0.5 font-display text-[0.96rem] leading-tight text-mos-ink truncate">
              {methodologyName ?? methodologySlug}
            </div>
            {typeof stepCount === "number" && stepCount > 0 && (
              <div className="text-[0.68rem] text-mos-muted">
                {stepCount} steps · 工作流就緒
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-5 py-3">
          <div
            className="flex items-center justify-center w-14 h-14"
            style={{
              background: "#F5F5F0",
              borderRadius: "9999px 9999px 9999px 0",
            }}
          >
            <span className="text-mos-soft text-[0.6rem] tracking-[0.2em] uppercase">N/A</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[0.58rem] tracking-[0.28em] uppercase text-mos-soft">
              METHODOLOGY · NONE
            </div>
            <div className="mt-0.5 font-display text-[0.96rem] leading-tight text-mos-muted">
              尚未套用任務範本
            </div>
            <div className="text-[0.68rem] text-mos-soft">進入後 AI 會自動推薦</div>
          </div>
        </div>
      )}

      {/* ── FOOTER: light strip with updated + CTA ─────────────────── */}
      <footer className="mt-auto flex items-center justify-between border-t border-mos-hair px-5 py-3 bg-mos-paper">
        <div className="text-[0.7rem] text-mos-muted">
          {updatedTxt ? `更新 · ${updatedTxt}` : "尚未啟動"}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCtaClick?.();
          }}
          className="px-3.5 py-1.5 text-[0.7rem] tracking-[0.16em] uppercase font-medium text-white hover:opacity-90 transition"
          style={{ background: hasMethodology ? tone.bg : "#0A0A0A" }}
        >
          {ctaLabel}
        </button>
      </footer>
    </article>
  );
}
