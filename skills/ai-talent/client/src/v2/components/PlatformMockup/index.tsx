/**
 * PlatformMockup — single entry, dispatches to platform/format variant.
 *
 * variant resolution:
 *   { platform, format } from inferMockupVariant() →
 *   exact match → UnsupportedVariantPlaceholder ("即將推出" with squad
 *   step list) → generic.
 *
 * PR2.4 design decision (2026-04-28): no more silent fall-through to a
 * sibling variant. Falling FB Ad → FBFeed mis-rendered the user's
 * intent. Honest "coming soon" is better than fake polish.
 *
 * Variants implemented (21):
 *   instagram: feed, carousel, reel, story, profile
 *   facebook:  feed, reel, story, marketplace, event
 *   linkedin:  feed, article, newsletter, poll, document
 *   youtube:   video-card, watch, shorts, community
 *   tiktok:    foryou, profile
 *   generic:   generic
 *
 * Variants honestly placeheld (11):
 *   instagram: live, ad
 *   facebook:  ad, carousel
 *   linkedin:  native-video, ad, event
 *   youtube:   premiere, live
 *   tiktok:    carousel, live
 */
import React from "react";
import type { MockupVariant } from "../../lib/inferMockup";
import type { MockupFields } from "./shared";
import { IGFeed, IGCarousel, IGReels, IGStories, IGProfile } from "./instagram";
import { FBFeed, FBReel, FBStory, FBMarketplace, FBEvent } from "./facebook";
import { LIFeed, LIArticle, LINewsletter, LIPoll, LIDocument } from "./linkedin";
import { YTVideoCard, YTShorts, YTWatch, YTCommunity } from "./youtube";
import { TTForYou, TTProfile } from "./tiktok";
import { GenericMockup } from "./generic";
import { UnsupportedVariantPlaceholder } from "./unsupported";

export interface PlatformMockupProps extends MockupFields {
  variant: MockupVariant;
}

export function PlatformMockup({ variant, ...fields }: PlatformMockupProps) {
  const f: MockupFields = { ...fields, variantLabel: variant.label };
  const key = `${variant.platform}:${variant.format}`;

  switch (key) {
    // Instagram (5 implemented)
    case "instagram:feed":      return <IGFeed     {...f} />;
    case "instagram:carousel":  return <IGCarousel {...f} />;
    case "instagram:reel":      return <IGReels    {...f} />;
    case "instagram:story":     return <IGStories  {...f} />;
    case "instagram:profile":   return <IGProfile  {...f} />;

    // Facebook (5 implemented)
    case "facebook:feed":       return <FBFeed        {...f} />;
    case "facebook:reel":       return <FBReel        {...f} />;
    case "facebook:story":      return <FBStory       {...f} />;
    case "facebook:marketplace":return <FBMarketplace {...f} />;
    case "facebook:event":      return <FBEvent       {...f} />;

    // LinkedIn (5 implemented)
    case "linkedin:feed":       return <LIFeed       {...f} />;
    case "linkedin:article":    return <LIArticle    {...f} />;
    case "linkedin:newsletter": return <LINewsletter {...f} />;
    case "linkedin:poll":       return <LIPoll       {...f} />;
    case "linkedin:document":   return <LIDocument   {...f} />;

    // YouTube (4 implemented)
    case "youtube:video-card":  return <YTVideoCard {...f} />;
    case "youtube:watch":       return <YTWatch     {...f} />;
    case "youtube:shorts":      return <YTShorts    {...f} />;
    case "youtube:community":   return <YTCommunity {...f} />;

    // TikTok (2 implemented)
    case "tiktok:foryou":       return <TTForYou {...f} />;
    case "tiktok:profile":      return <TTProfile {...f} />;

    // Generic
    case "generic:generic":     return <GenericMockup {...f} />;

    // 11 unsupported → honest placeholder (NOT fall-through)
    default:                    return <UnsupportedVariantPlaceholder variant={variant} {...f} />;
  }
}
