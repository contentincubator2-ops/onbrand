/**
 * SquadMockups — dispatcher by `mockupVariant` string from squad steps.
 *
 * Per project_squad_design_methodology.md, every squad step declares
 * `mockupVariant` in its JSON. Squad runner / step preview reads that
 * string and routes to the right component here.
 */
import React from "react";
import type { SquadMockupVariant } from "./shared";
import { IntakeFormMockup, type IntakeFormData } from "./intake";
import { PillarTableMockup, type PillarRow } from "./pillar";
import { CalendarGridMockup, type CalendarEntry } from "./calendar";
import { FBPostBriefMockup, type PostBrief } from "./brief";
import { FBCarouselMockup, type CarouselDeck, type CarouselSlide } from "./carousel";
import { FBReelsMockup, type ReelsScript, type ReelsShot } from "./reels";
import { IGPostBriefMockup, type IGPostData, type IGPostBrief } from "./ig-post";
import { IGStoryMockup, type IGStorySeries, type IGStorySlide, type StorySticker, type StickerKind } from "./ig-story";
import { IGReelsMockup, type IGReelsScript } from "./ig-reels";
import { QAReportMockup, type QAReport } from "./qa";
import { ResearchPanelMockup, type ResearchData } from "./research";
import {
  LIFeedMockup, LIArticleMockup, LINewsletterMockup, LIPollMockup,
  LIDocumentMockup, LINativeVideoMockup, LIAdMockup, LIEventMockup,
  type LIPostData, type LIArticleData, type LINewsletterData, type LIPollData,
  type LIDocumentData, type LINativeVideoData, type LIAdData, type LIEventData,
} from "./linkedin";
import {
  YTVideoMockup, YTShortsMockup, YTCommunityMockup, YTPremiereMockup, YTLiveMockup,
  type YTVideoScript, type YTShortsScript, type YTCommunityData,
  type YTPremiereData, type YTLiveData,
} from "./youtube";
import {
  TTForYouMockup, TTCarouselMockup, TTLiveMockup,
  type TTVideoScript, type TTCarouselData, type TTLiveData,
} from "./tiktok";

export { type SquadMockupVariant, type MockupCategory, VARIANT_CATEGORY } from "./shared";
export { IntakeFormMockup, type IntakeFormData } from "./intake";
export { PillarTableMockup, type PillarRow } from "./pillar";
export { CalendarGridMockup, type CalendarEntry } from "./calendar";
export { FBPostBriefMockup, type PostBrief } from "./brief";
export { FBCarouselMockup, type CarouselDeck, type CarouselSlide } from "./carousel";
export { FBReelsMockup, type ReelsScript, type ReelsShot } from "./reels";
export { IGPostBriefMockup, type IGPostData, type IGPostBrief } from "./ig-post";
export { IGStoryMockup, type IGStorySeries, type IGStorySlide, type StorySticker, type StickerKind } from "./ig-story";
export { IGReelsMockup, type IGReelsScript } from "./ig-reels";
export { QAReportMockup, type QAReport } from "./qa";
export { ResearchPanelMockup, type ResearchData } from "./research";
export {
  LIFeedMockup, LIArticleMockup, LINewsletterMockup, LIPollMockup,
  LIDocumentMockup, LINativeVideoMockup, LIAdMockup, LIEventMockup,
  type LIPostData, type LIArticleData, type LINewsletterData, type LIPollData,
  type LIDocumentData, type LINativeVideoData, type LIAdData, type LIEventData,
} from "./linkedin";
export {
  YTVideoMockup, YTShortsMockup, YTCommunityMockup, YTPremiereMockup, YTLiveMockup,
  type YTVideoScript, type YTShortsScript, type YTCommunityData,
  type YTPremiereData, type YTLiveData,
} from "./youtube";
export {
  TTForYouMockup, TTCarouselMockup, TTLiveMockup,
  type TTVideoScript, type TTCarouselData, type TTLiveData,
} from "./tiktok";

export interface SquadMockupProps {
  variant: SquadMockupVariant;
  data?: any;            // shape depends on variant — caller's responsibility
  readOnly?: boolean;
  isActive?: boolean;
  onChange?: (next: any) => void;
  onSubmit?: () => void;
}

/** Empty placeholder rendered when data is null/undefined (e.g. live mode
 *  before LLM result arrives). Centralizes the null-check so individual
 *  variant components don't all need defensive guards. */
function EmptyStateForVariant({ variant, isActive }: { variant: SquadMockupVariant; isActive?: boolean }) {
  const label = isActive ? "等待 LLM 回應…" : "尚未產出 — 點擊 Run Live 真實執行";
  return (
    <div className="rounded-md border border-dashed border-divider p-6 text-center bg-default-50">
      <p className="text-tiny text-default-500 uppercase tracking-wider">{variant}</p>
      <p className="text-small text-default-700 mt-1">{label}</p>
    </div>
  );
}

export function SquadMockup({ variant, data, readOnly, isActive, onChange, onSubmit }: SquadMockupProps) {
  // Centralized null guard — every variant gets an empty state instead
  // of crashing when data is null/undefined.
  if (data == null) {
    return <EmptyStateForVariant variant={variant} isActive={isActive} />;
  }
  switch (variant) {
    case "IntakeFormMockup":
      return <IntakeFormMockup data={data as IntakeFormData} readOnly={readOnly} isActive={isActive} onChange={onChange} onSubmit={onSubmit} />;
    case "PillarTableMockup":
      return <PillarTableMockup data={data as { pillars: PillarRow[]; tilt?: string }} readOnly={readOnly} isActive={isActive} onChange={onChange} />;
    case "CalendarGridMockup":
      return <CalendarGridMockup data={data} readOnly={readOnly} isActive={isActive} />;
    case "FBPostBriefMockup":
      return <FBPostBriefMockup data={data as { briefs: PostBrief[] }} readOnly={readOnly} isActive={isActive} onChange={onChange as any} />;
    case "FBCarouselMockup":
      return <FBCarouselMockup data={data as CarouselDeck} readOnly={readOnly} isActive={isActive} onChange={onChange as any} />;
    case "FBReelsMockup":
      return <FBReelsMockup data={data as ReelsScript} readOnly={readOnly} isActive={isActive} onChange={onChange as any} />;
    case "IGPostBriefMockup":
      return <IGPostBriefMockup data={data as IGPostData} readOnly={readOnly} isActive={isActive} onChange={onChange as any} />;
    case "IGStoryMockup":
      return <IGStoryMockup data={data as IGStorySeries} readOnly={readOnly} isActive={isActive} onChange={onChange as any} />;
    case "IGReelsMockup":
      return <IGReelsMockup data={data as IGReelsScript} readOnly={readOnly} isActive={isActive} onChange={onChange as any} />;
    case "QAReportMockup":
      return <QAReportMockup data={data as QAReport} readOnly={readOnly} isActive={isActive} />;
    case "ResearchPanelMockup":
      return <ResearchPanelMockup data={data as ResearchData} readOnly={readOnly} isActive={isActive} />;
    // ── LinkedIn ────────────────────────────────────────────────────────────
    case "LIFeedMockup":
      return <LIFeedMockup data={data as LIPostData} readOnly={readOnly} isActive={isActive} />;
    case "LIArticleMockup":
      return <LIArticleMockup data={data as LIArticleData} readOnly={readOnly} isActive={isActive} />;
    case "LINewsletterMockup":
      return <LINewsletterMockup data={data as LINewsletterData} readOnly={readOnly} isActive={isActive} />;
    case "LIPollMockup":
      return <LIPollMockup data={data as LIPollData} readOnly={readOnly} isActive={isActive} />;
    case "LIDocumentMockup":
      return <LIDocumentMockup data={data as LIDocumentData} readOnly={readOnly} isActive={isActive} />;
    case "LINativeVideoMockup":
      return <LINativeVideoMockup data={data as LINativeVideoData} readOnly={readOnly} isActive={isActive} />;
    case "LIAdMockup":
      return <LIAdMockup data={data as LIAdData} readOnly={readOnly} isActive={isActive} />;
    case "LIEventMockup":
      return <LIEventMockup data={data as LIEventData} readOnly={readOnly} isActive={isActive} />;
    // ── YouTube ─────────────────────────────────────────────────────────────
    case "YTVideoMockup":
      return <YTVideoMockup data={data as YTVideoScript} readOnly={readOnly} isActive={isActive} />;
    case "YTShortsMockup":
      return <YTShortsMockup data={data as YTShortsScript} readOnly={readOnly} isActive={isActive} />;
    case "YTCommunityMockup":
      return <YTCommunityMockup data={data as YTCommunityData} readOnly={readOnly} isActive={isActive} />;
    case "YTPremiereMockup":
      return <YTPremiereMockup data={data as YTPremiereData} readOnly={readOnly} isActive={isActive} />;
    case "YTLiveMockup":
      return <YTLiveMockup data={data as YTLiveData} readOnly={readOnly} isActive={isActive} />;
    // ── TikTok ──────────────────────────────────────────────────────────────
    case "TTForYouMockup":
      return <TTForYouMockup data={data as TTVideoScript} readOnly={readOnly} isActive={isActive} />;
    case "TTCarouselMockup":
      return <TTCarouselMockup data={data as TTCarouselData} readOnly={readOnly} isActive={isActive} />;
    case "TTLiveMockup":
      return <TTLiveMockup data={data as TTLiveData} readOnly={readOnly} isActive={isActive} />;
    default:
      // Exhaustive switch — TypeScript will flag missing variants
      const _exhaustive: never = variant;
      return null;
  }
}
