/**
 * PlatformMockup — single entry, dispatches to platform/format variant.
 *
 * variant resolution:
 *   { platform, format } from inferMockupVariant() →
 *   exact match → fall back to platform default → generic.
 *
 * PR2.2 implements 21 of 35 variants. Remaining fall-throughs documented
 * inline. See backlog memory item "Mockup tagging" — DB-level mockup
 * field will replace heuristic inference for catalog entries.
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

export interface PlatformMockupProps extends MockupFields {
  variant: MockupVariant;
}

export function PlatformMockup({ variant, ...fields }: PlatformMockupProps) {
  const f: MockupFields = { ...fields, variantLabel: variant.label };
  const key = `${variant.platform}:${variant.format}`;

  switch (key) {
    // Instagram
    case "instagram:feed":      return <IGFeed     {...f} />;
    case "instagram:carousel":  return <IGCarousel {...f} />;
    case "instagram:reel":      return <IGReels    {...f} />;
    case "instagram:story":     return <IGStories  {...f} />;
    case "instagram:profile":   return <IGProfile  {...f} />;
    case "instagram:live":
    case "instagram:ad":        return <IGFeed     {...f} />;

    // Facebook
    case "facebook:feed":       return <FBFeed        {...f} />;
    case "facebook:reel":       return <FBReel        {...f} />;
    case "facebook:story":      return <FBStory       {...f} />;
    case "facebook:marketplace":return <FBMarketplace {...f} />;
    case "facebook:event":      return <FBEvent       {...f} />;
    case "facebook:ad":
    case "facebook:carousel":   return <FBFeed        {...f} />;

    // LinkedIn
    case "linkedin:feed":       return <LIFeed       {...f} />;
    case "linkedin:article":    return <LIArticle    {...f} />;
    case "linkedin:newsletter": return <LINewsletter {...f} />;
    case "linkedin:poll":       return <LIPoll       {...f} />;
    case "linkedin:document":   return <LIDocument   {...f} />;
    case "linkedin:native-video":
    case "linkedin:ad":         return <LIFeed       {...f} />;
    case "linkedin:event":      return <LIArticle    {...f} />;

    // YouTube
    case "youtube:video-card":  return <YTVideoCard {...f} />;
    case "youtube:watch":       return <YTWatch     {...f} />;
    case "youtube:shorts":      return <YTShorts    {...f} />;
    case "youtube:community":   return <YTCommunity {...f} />;
    case "youtube:premiere":
    case "youtube:live":        return <YTVideoCard {...f} />;

    // TikTok
    case "tiktok:foryou":       return <TTForYou {...f} />;
    case "tiktok:profile":      return <TTProfile {...f} />;
    case "tiktok:carousel":
    case "tiktok:live":         return <TTForYou {...f} />;

    default:                    return <GenericMockup {...f} />;
  }
}
