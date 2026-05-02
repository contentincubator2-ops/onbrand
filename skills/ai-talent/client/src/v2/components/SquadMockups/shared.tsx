/**
 * SquadMockups/shared.tsx — types shared across all squad-step mockups.
 *
 * Per project_squad_design_methodology.md, every squad step declares a
 * `mockupVariant` string. The variant strings here map to the React
 * components in this folder. New squads can mix and match.
 */
import React from "react";
import { Card, CardBody, Chip } from "@heroui/react";

export type SquadMockupVariant =
  // ── Universal ─────────────────────────────────────────────────────────────
  | "IntakeFormMockup"
  | "ResearchPanelMockup"
  | "PillarTableMockup"
  | "CalendarGridMockup"
  | "QAReportMockup"
  // ── Facebook ──────────────────────────────────────────────────────────────
  | "FBPostBriefMockup"
  | "FBCarouselMockup"
  | "FBReelsMockup"
  // ── Instagram ─────────────────────────────────────────────────────────────
  | "IGPostBriefMockup"
  | "IGStoryMockup"
  | "IGReelsMockup"
  // ── LinkedIn ──────────────────────────────────────────────────────────────
  | "LIFeedMockup"
  | "LIArticleMockup"
  | "LINewsletterMockup"
  | "LIPollMockup"
  | "LIDocumentMockup"
  | "LINativeVideoMockup"
  | "LIAdMockup"
  | "LIEventMockup"
  // ── YouTube ───────────────────────────────────────────────────────────────
  | "YTVideoMockup"
  | "YTShortsMockup"
  | "YTCommunityMockup"
  | "YTPremiereMockup"
  | "YTLiveMockup"
  // ── TikTok ────────────────────────────────────────────────────────────────
  | "TTForYouMockup"
  | "TTCarouselMockup"
  | "TTLiveMockup";

/**
 * Mockup category — broader bucket for picker UX / theming.
 */
export type MockupCategory =
  | "intake"
  | "research"
  | "strategy"        // pillars / positioning matrices
  | "calendar"
  | "post-preview"    // single post / carousel (FB/IG/LI)
  | "video-script"    // Reels / Shorts / TikTok storyboards
  | "story-preview"   // 9:16 story formats
  | "article"         // long-form (LI Article, Blog)
  | "newsletter"      // newsletter issues
  | "ad"              // paid / sponsored content
  | "event"           // event promotions
  | "live"            // live stream run-of-show
  | "analytics"
  | "qa";

export const VARIANT_CATEGORY: Record<SquadMockupVariant, MockupCategory> = {
  // Universal
  IntakeFormMockup:    "intake",
  ResearchPanelMockup: "research",
  PillarTableMockup:   "strategy",
  CalendarGridMockup:  "calendar",
  QAReportMockup:      "qa",
  // Facebook
  FBPostBriefMockup:   "post-preview",
  FBCarouselMockup:    "post-preview",
  FBReelsMockup:       "video-script",
  // Instagram
  IGPostBriefMockup:   "post-preview",
  IGStoryMockup:       "story-preview",
  IGReelsMockup:       "video-script",
  // LinkedIn
  LIFeedMockup:        "post-preview",
  LIArticleMockup:     "article",
  LINewsletterMockup:  "newsletter",
  LIPollMockup:        "post-preview",
  LIDocumentMockup:    "post-preview",
  LINativeVideoMockup: "video-script",
  LIAdMockup:          "ad",
  LIEventMockup:       "event",
  // YouTube
  YTVideoMockup:       "video-script",
  YTShortsMockup:      "video-script",
  YTCommunityMockup:   "post-preview",
  YTPremiereMockup:    "event",
  YTLiveMockup:        "live",
  // TikTok
  TTForYouMockup:      "video-script",
  TTCarouselMockup:    "post-preview",
  TTLiveMockup:        "live",
};

/** Shared props — every squad mockup may receive these. */
export interface SquadMockupCommonProps {
  /** Read-only when previewing in design system gallery. */
  readOnly?: boolean;
  /** When this step is the active running step, show a subtle highlight. */
  isActive?: boolean;
}

/** Section header used by Intake / QA report — Notion-style eyebrow + title. */
export function SectionHeader({
  eyebrow, title, icon, color = "default",
}: {
  eyebrow: string;
  title: string;
  icon?: string;
  color?: "default" | "primary" | "warning" | "success" | "danger";
}) {
  return (
    <div className="flex items-start gap-2 mb-3">
      {icon && <span className="text-large leading-none mt-0.5">{icon}</span>}
      <div className="min-w-0">
        <p className="text-tiny text-default-500 uppercase tracking-wider font-medium">
          {eyebrow}
        </p>
        <h3 className="text-medium font-semibold tracking-tight">{title}</h3>
      </div>
    </div>
  );
}

/** Read-only data chip — system-already-has bucket. */
export function DataChip({
  label, value, color = "default",
}: {
  label: string;
  value: string | number | null | undefined;
  color?: "default" | "primary" | "success" | "warning" | "danger";
}) {
  const display = value == null || value === "" ? "—" : String(value);
  return (
    <Chip
      size="sm"
      variant="flat"
      color={color}
      classNames={{ content: "flex items-center gap-1.5" }}
    >
      <span className="text-tiny text-default-500">{label}</span>
      <span className="text-tiny font-medium text-foreground">{display}</span>
    </Chip>
  );
}

/** Empty placeholder for cells / sections without data. */
export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-tiny text-default-400 italic">{children}</span>
  );
}

/** Notion-style bordered container — used by every variant. */
export function NotionCard({
  children, className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <Card shadow="none" className={`border border-divider ${className}`}>
      <CardBody className="p-5 gap-3">{children}</CardBody>
    </Card>
  );
}
