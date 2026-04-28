/**
 * PlatformMockup — single entry, dispatches to platform/format variant.
 *
 * PR2.5 (2026-04-28): all 32 variants now have dedicated mockups.
 * UnsupportedVariantPlaceholder kept as a safety net for unknown
 * combinations (defensive default).
 *
 * Variants implemented (32):
 *   instagram: feed, carousel, reel, story, profile, live, ad
 *   facebook:  feed, reel, story, marketplace, event, ad, carousel
 *   linkedin:  feed, article, newsletter, poll, document,
 *              native-video, ad, event
 *   youtube:   video-card, watch, shorts, community, premiere, live
 *   tiktok:    foryou, profile, carousel, live
 *   generic:   generic
 */
import React from "react";
import type { MockupVariant } from "../../lib/inferMockup";
import type { MockupFields } from "./shared";
import {
  IGFeed, IGCarousel, IGReels, IGStories, IGProfile, IGLive, IGAd,
} from "./instagram";
import {
  FBFeed, FBReel, FBStory, FBMarketplace, FBEvent, FBAd, FBCarousel,
} from "./facebook";
import {
  LIFeed, LIArticle, LINewsletter, LIPoll, LIDocument,
  LINativeVideo, LIAd, LIEvent,
} from "./linkedin";
import {
  YTVideoCard, YTShorts, YTWatch, YTCommunity, YTPremiere, YTLive,
} from "./youtube";
import { TTForYou, TTProfile, TTCarousel, TTLive } from "./tiktok";
import { GenericMockup } from "./generic";
import { UnsupportedVariantPlaceholder } from "./unsupported";

export interface PlatformMockupProps extends MockupFields {
  variant: MockupVariant;
}

export function PlatformMockup({ variant, ...fields }: PlatformMockupProps) {
  const f: MockupFields = { ...fields, variantLabel: variant.label };
  const key = `${variant.platform}:${variant.format}`;

  switch (key) {
    // Instagram (7)
    case "instagram:feed":      return <IGFeed     {...f} />;
    case "instagram:carousel":  return <IGCarousel {...f} />;
    case "instagram:reel":      return <IGReels    {...f} />;
    case "instagram:story":     return <IGStories  {...f} />;
    case "instagram:profile":   return <IGProfile  {...f} />;
    case "instagram:live":      return <IGLive     {...f} />;
    case "instagram:ad":        return <IGAd       {...f} />;

    // Facebook (7)
    case "facebook:feed":       return <FBFeed        {...f} />;
    case "facebook:reel":       return <FBReel        {...f} />;
    case "facebook:story":      return <FBStory       {...f} />;
    case "facebook:marketplace":return <FBMarketplace {...f} />;
    case "facebook:event":      return <FBEvent       {...f} />;
    case "facebook:ad":         return <FBAd          {...f} />;
    case "facebook:carousel":   return <FBCarousel    {...f} />;

    // LinkedIn (8)
    case "linkedin:feed":         return <LIFeed        {...f} />;
    case "linkedin:article":      return <LIArticle    {...f} />;
    case "linkedin:newsletter":   return <LINewsletter {...f} />;
    case "linkedin:poll":         return <LIPoll       {...f} />;
    case "linkedin:document":     return <LIDocument   {...f} />;
    case "linkedin:native-video": return <LINativeVideo {...f} />;
    case "linkedin:ad":           return <LIAd         {...f} />;
    case "linkedin:event":        return <LIEvent      {...f} />;

    // YouTube (6)
    case "youtube:video-card":  return <YTVideoCard {...f} />;
    case "youtube:watch":       return <YTWatch     {...f} />;
    case "youtube:shorts":      return <YTShorts    {...f} />;
    case "youtube:community":   return <YTCommunity {...f} />;
    case "youtube:premiere":    return <YTPremiere  {...f} />;
    case "youtube:live":        return <YTLive      {...f} />;

    // TikTok (4)
    case "tiktok:foryou":       return <TTForYou   {...f} />;
    case "tiktok:profile":      return <TTProfile  {...f} />;
    case "tiktok:carousel":     return <TTCarousel {...f} />;
    case "tiktok:live":         return <TTLive     {...f} />;

    // Generic
    case "generic:generic":     return <GenericMockup {...f} />;

    // Defensive: unknown variant → honest placeholder
    default:                    return <UnsupportedVariantPlaceholder variant={variant} {...f} />;
  }
}
