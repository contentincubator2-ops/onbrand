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
  | "IntakeFormMockup"
  | "ResearchPanelMockup"   // existing — uses ThinkingOverlay + SourceViewer
  | "PillarTableMockup"
  | "CalendarGridMockup"
  | "FBPostBriefMockup"
  | "FBCarouselMockup"      // NEW (CJ 2026-05-02) — multi-slide deck preview
  | "FBReelsMockup"         // NEW (CJ 2026-05-02) — 9:16 video script with hook/hold/payoff timeline
  // IG variants — built next sprint
  | "IGPostBriefMockup"
  | "IGStoryMockup"
  | "IGReelsMockup"
  | "QAReportMockup";

/**
 * Mockup category — broader bucket for picker UX. Multiple variants can
 * share a category (e.g. FBPostBrief + FBCarousel + FBReels are all
 * "post-preview" variants of FB content). Picker filters / theming use
 * this when the specific variant doesn't matter.
 */
export type MockupCategory =
  | "intake"
  | "research"
  | "strategy"        // pillars / positioning matrices
  | "calendar"
  | "post-preview"    // FB / IG single post / carousel / reel
  | "video-script"    // Reels / TikTok storyboards
  | "story-preview"   // 9:16 IG/FB story
  | "analytics"
  | "qa";

export const VARIANT_CATEGORY: Record<SquadMockupVariant, MockupCategory> = {
  IntakeFormMockup:    "intake",
  ResearchPanelMockup: "research",
  PillarTableMockup:   "strategy",
  CalendarGridMockup:  "calendar",
  FBPostBriefMockup:   "post-preview",
  FBCarouselMockup:    "post-preview",
  FBReelsMockup:       "video-script",
  IGPostBriefMockup:   "post-preview",
  IGStoryMockup:       "story-preview",
  IGReelsMockup:       "video-script",
  QAReportMockup:      "qa",
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
