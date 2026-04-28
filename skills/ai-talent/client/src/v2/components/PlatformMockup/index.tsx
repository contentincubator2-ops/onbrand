/**
 * PlatformMockup — single entry, dispatches to platform/format variant.
 *
 * variant resolution:
 *   { platform, format } from inferMockupVariant() →
 *   exact match → fall back to platform's "feed"-equivalent → generic.
 *
 * Variants implemented in PR2.1:
 *   instagram: feed, carousel, reel, story
 *   facebook:  feed
 *   linkedin:  feed, article
 *   youtube:   video-card, shorts
 *   tiktok:    foryou
 *   generic:   generic
 *
 * PR2.2 will add the remaining 17 variants.
 */
import React from "react";
import type { MockupVariant } from "../../lib/inferMockup";
import type { MockupFields } from "./shared";
import { IGFeed, IGCarousel, IGReels, IGStories } from "./instagram";
import { FBFeed } from "./facebook";
import { LIFeed, LIArticle } from "./linkedin";
import { YTVideoCard, YTShorts } from "./youtube";
import { TTForYou } from "./tiktok";
import { GenericMockup } from "./generic";

export interface PlatformMockupProps extends MockupFields {
  variant: MockupVariant;
}

export function PlatformMockup({ variant, ...fields }: PlatformMockupProps) {
  const fieldsWithLabel: MockupFields = { ...fields, variantLabel: variant.label };
  const key = `${variant.platform}:${variant.format}`;

  switch (key) {
    // Instagram
    case "instagram:feed":      return <IGFeed     {...fieldsWithLabel} />;
    case "instagram:carousel":  return <IGCarousel {...fieldsWithLabel} />;
    case "instagram:reel":      return <IGReels    {...fieldsWithLabel} />;
    case "instagram:story":     return <IGStories  {...fieldsWithLabel} />;
    // Instagram fall-throughs (live / profile / ad → feed)
    case "instagram:live":
    case "instagram:profile":
    case "instagram:ad":        return <IGFeed     {...fieldsWithLabel} />;

    // Facebook (single variant for now; rest fall back to feed)
    case "facebook:feed":
    case "facebook:reel":       // PR2.2: dedicated FBReel
    case "facebook:story":      // PR2.2: dedicated FBStory
    case "facebook:marketplace":
    case "facebook:event":
    case "facebook:ad":
    case "facebook:carousel":   return <FBFeed     {...fieldsWithLabel} />;

    // LinkedIn
    case "linkedin:article":
    case "linkedin:newsletter": return <LIArticle  {...fieldsWithLabel} />;
    case "linkedin:feed":
    case "linkedin:poll":
    case "linkedin:document":
    case "linkedin:native-video":
    case "linkedin:ad":
    case "linkedin:event":      return <LIFeed     {...fieldsWithLabel} />;

    // YouTube
    case "youtube:shorts":      return <YTShorts   {...fieldsWithLabel} />;
    case "youtube:video-card":
    case "youtube:watch":
    case "youtube:community":
    case "youtube:premiere":
    case "youtube:live":        return <YTVideoCard {...fieldsWithLabel} />;

    // TikTok (all → foryou for now)
    case "tiktok:foryou":
    case "tiktok:carousel":
    case "tiktok:live":
    case "tiktok:profile":      return <TTForYou   {...fieldsWithLabel} />;

    default:                    return <GenericMockup {...fieldsWithLabel} />;
  }
}
