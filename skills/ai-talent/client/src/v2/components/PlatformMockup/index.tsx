/**
 * PlatformMockup — single entry, dispatches to platform/format variant.
 *
 * Variants implemented (63):
 *   instagram: feed, carousel, reel, story, profile, live, ad, comment
 *   facebook:  feed, reel, story, marketplace, event, ad, carousel
 *   linkedin:  feed, article, newsletter, poll, document,
 *              native-video, ad, event
 *   youtube:   video-card, watch, shorts, community, premiere, live
 *   tiktok:    foryou, profile, carousel, live
 *   email:     edm, email-newsletter
 *   google:    search-ad, display-ad, pmax, shopping-ad, video-ad
 *   twitter:   tweet, thread
 *   line:      broadcast, line-card, richmenu
 *   web:       landing, blog, product-page
 *   press:        press-release
 *   deck:         slide
 *   xiaohongshu:  note, xhs-video, xhs-search
 *   threads:      post, thread
 *   pinterest:    pin, board, story-pin
 *   podcast:      episode, show, audiogram
 *   generic:      generic
 */
import React from "react";
import type { MockupVariant } from "../../lib/inferMockup";
import type { MockupFields } from "./shared";
import {
  IGFeed, IGCarousel, IGReels, IGStories, IGProfile, IGLive, IGAd, IGComment,
} from "./instagram";
import {
  FBFeed, FBReel, FBStory, FBMarketplace, FBEvent, FBAd, FBCarousel, FBCalendar,
} from "./facebook";
// 2026-05-05 quick-task pivot: 8 new FB variants
import {
  FBLive, FBCover, FBPoll, FBComment, FBGroup, FBRecommendation,
  FBPinned, FBAlbum,
} from "./facebook-quicktask";
import {
  LIFeed, LIArticle, LINewsletter, LIPoll, LIDocument,
  LINativeVideo, LIAd, LIEvent, LIComment,
} from "./linkedin";
import {
  YTVideoCard, YTShorts, YTWatch, YTCommunity, YTPremiere, YTLive, YTStoryboard,
  YTComment,
} from "./youtube";
import { TTForYou, TTProfile, TTCarousel, TTLive, TTStoryboard, TTComment } from "./tiktok";
import { EDMMockup, EmailNewsletterMockup, KOLEmailMockup } from "./email";
import { GoogleSearchAd, GoogleDisplayAd, GooglePMax } from "./google";
import { XTweet, XThread } from "./twitter";
import { LINEBroadcast, LINECard, LINERichMenu } from "./line";
import { WebLanding, WebBlog, WebProduct } from "./web";
import { PressRelease, DeckMockup, QAMockup, SpeechMockup, FactSheetMockup, WebAboutMockup, NewsHookMockup } from "./press";
import { GenericMockup } from "./generic";
import { ProposalCover, ProposalSpec, ResearchDoc, PersonaCard } from "./proposal";
import { XHSNote, XHSVideo, XHSSearch } from "./xiaohongshu";
import { ThreadsPost, ThreadsThread } from "./threads";
import { PinterestPin, PinterestBoard, PinterestStoryPin } from "./pinterest";
import { PodcastEpisode, PodcastShow, PodcastAudiogram } from "./podcast";
import { UnsupportedVariantPlaceholder } from "./unsupported";

export interface PlatformMockupProps extends MockupFields {
  variant: MockupVariant;
}

export function PlatformMockup({ variant, ...fields }: PlatformMockupProps) {
  const f: MockupFields = { ...fields, variantLabel: variant.label };
  const key = `${variant.platform}:${variant.format}`;

  switch (key) {
    // ── Instagram (7) ─────────────────────────────────────────────────
    case "instagram:feed":      return <IGFeed     {...f} />;
    case "instagram:carousel":  return <IGCarousel {...f} />;
    // 2026-05-19 (CJ 驗收 IG5 10/14「instagram:document 無 mockup →
    // 主內容『製作中』無法評估」): an IG "document" post IS a swipe
    // carousel of text slides — render via IGCarousel (handles
    // caption-only content) instead of falling to the unsupported stub.
    case "instagram:document":  return <IGCarousel {...f} />;
    case "instagram:reel":      return <IGReels    {...f} />;
    case "instagram:story":     return <IGStories  {...f} />;
    case "instagram:profile":   return <IGProfile  {...f} />;
    case "instagram:live":      return <IGLive     {...f} />;
    case "instagram:ad":        return <IGAd       {...f} />;
    // 2026-08-20 (CJ「IG 留言回覆（一般）出現『製作中』而且沒有產出內容」):
    // ig-30-comment-reply resolves to instagram:comment. Without this case
    // it fell to UnsupportedVariantPlaceholder, which dropped the reply copy
    // the squad had already produced.
    case "instagram:comment":   return <IGComment  {...f} />;

    // ── Facebook (15) ─────────────────────────────────────────────────
    case "facebook:feed":           return <FBFeed           {...f} />;
    case "facebook:reel":           return <FBReel           {...f} />;
    case "facebook:story":          return <FBStory          {...f} />;
    case "facebook:marketplace":    return <FBMarketplace    {...f} />;
    case "facebook:event":          return <FBEvent          {...f} />;
    case "facebook:ad":             return <FBAd             {...f} />;
    case "facebook:carousel":       return <FBCarousel       {...f} />;
    // ↓ Quick-task pivot 2026-05-05
    case "facebook:live":           return <FBLive           {...f} />;
    case "facebook:cover":          return <FBCover          {...f} />;
    case "facebook:poll":           return <FBPoll           {...f} />;
    // 2026-05-18 (CJ「釘選主文要 PIN / FAQ 要問答 / about us 要關於我們」):
    // pinned-suite pieces each get the right chrome (reuse Q&A + About).
    case "facebook:pinned":         return <FBFeed           {...f} pinned />;
    case "facebook:qa":             return <QAMockup         {...f} />;
    case "facebook:about":          return <WebAboutMockup   {...f} />;
    case "facebook:calendar":       return <FBCalendar       {...f} />;
    case "facebook:comment":        return <FBComment        {...f} />;
    case "facebook:group":          return <FBGroup          {...f} />;
    case "facebook:recommendation": return <FBRecommendation {...f} />;
    case "facebook:pinned":         return <FBPinned         {...f} />;
    case "facebook:album":          return <FBAlbum          {...f} />;

    // ── LinkedIn (8) ──────────────────────────────────────────────────
    case "linkedin:feed":          return <LIFeed        {...f} />;
    case "linkedin:article":       return <LIArticle     {...f} />;
    case "linkedin:newsletter":    return <LINewsletter  {...f} />;
    case "linkedin:poll":          return <LIPoll        {...f} />;
    case "linkedin:document":      return <LIDocument    {...f} />;
    case "linkedin:native-video":  return <LINativeVideo {...f} />;
    case "linkedin:ad":            return <LIAd          {...f} />;
    case "linkedin:event":         return <LIEvent       {...f} />;
    // 2026-08-20: li-30-comment → real LinkedIn comment chrome (was placeholder).
    case "linkedin:comment":       return <LIComment     {...f} />;

    // ── YouTube (6) ───────────────────────────────────────────────────
    case "youtube:video-card":  return <YTVideoCard {...f} />;
    case "youtube:watch":       return <YTWatch     {...f} />;
    case "youtube:shorts":      return <YTShorts    {...f} />;
    case "youtube:community":   return <YTCommunity {...f} />;
    case "youtube:premiere":    return <YTPremiere  {...f} />;
    case "youtube:live":        return <YTLive      {...f} />;
    case "youtube:storyboard":  return <YTStoryboard {...f} />;
    // 2026-08-20: yt-30-comment-reply / yt-30-pinned-comment (was placeholder).
    case "youtube:comment":        return <YTComment {...f} />;
    case "youtube:pinned-comment": return <YTComment {...f} pinned />;

    // ── TikTok (5) ────────────────────────────────────────────────────
    case "tiktok:foryou":     return <TTForYou     {...f} />;
    case "tiktok:profile":    return <TTProfile    {...f} />;
    case "tiktok:carousel":   return <TTCarousel   {...f} />;
    case "tiktok:live":       return <TTLive       {...f} />;
    case "tiktok:storyboard": return <TTStoryboard {...f} />;
    // 2026-08-20: tt-30-comment-reply → real TikTok comment sheet (was placeholder).
    case "tiktok:comment":    return <TTComment    {...f} />;

    // ── Email / EDM (2) ───────────────────────────────────────────────
    case "email:edm":              return <EDMMockup           {...f} />;
    case "email:email-newsletter": return <EmailNewsletterMockup {...f} />;
    case "email:dm":               return <KOLEmailMockup       {...f} />;

    // ── Google Ads (5) ────────────────────────────────────────────────
    case "google:search-ad":   return <GoogleSearchAd  {...f} />;
    case "google:display-ad":  return <GoogleDisplayAd {...f} />;
    case "google:pmax":        return <GooglePMax      {...f} />;
    case "google:shopping-ad": return <GoogleSearchAd  {...f} />; // reuse search layout until shopping component built
    case "google:video-ad":    return <GoogleDisplayAd {...f} />; // reuse display layout until video ad component built

    // ── Twitter / X (2) ───────────────────────────────────────────────
    case "twitter:tweet":   return <XTweet  {...f} />;
    case "twitter:thread":  return <XThread {...f} />;

    // ── LINE (3) ──────────────────────────────────────────────────────
    case "line:broadcast":   return <LINEBroadcast {...f} />;
    case "line:line-card":   return <LINECard      {...f} />;
    case "line:richmenu":    return <LINERichMenu  {...f} />;

    // ── Web (3) ───────────────────────────────────────────────────────
    case "web:landing":       return <WebLanding {...f} />;
    case "web:blog":          return <WebBlog    {...f} />;
    case "web:product-page":  return <WebProduct {...f} />;

    // ── Press Release (1) ─────────────────────────────────────────────
    case "press:press-release": return <PressRelease {...f} />;

    // ── Spokesperson Q&A / FAQ (2026-05-17) ───────────────────────────
    case "press:qa": return <QAMockup {...f} />;

    // ── CEO Speech 致辭講稿 (2026-05-17) ──────────────────────────────
    case "press:speech": return <SpeechMockup {...f} />;

    // ── Fact Sheet 一頁式 (2026-05-17) ────────────────────────────────
    case "press:factsheet": return <FactSheetMockup {...f} />;

    // ── Company boilerplate · 官網關於我們 (2026-05-17) ─────────────────
    case "press:about": return <WebAboutMockup {...f} />;

    // ── News hook · 新聞點子 (2026-05-17) ──────────────────────────────
    case "press:hook": return <NewsHookMockup {...f} />;

    // ── Deck / Presentation (1) ───────────────────────────────────────
    case "deck:slide": return <DeckMockup {...f} />;

    // ── 小紅書 / Xiaohongshu (3) ──────────────────────────────────────
    case "xiaohongshu:note":       return <XHSNote   {...f} />;
    case "xiaohongshu:xhs-video":  return <XHSVideo  {...f} />;
    case "xiaohongshu:xhs-search": return <XHSSearch {...f} />;

    // ── Threads (2) ───────────────────────────────────────────────────
    case "threads:post":    return <ThreadsPost   {...f} />;
    case "threads:thread":  return <ThreadsThread {...f} />;

    // ── Pinterest (3) ─────────────────────────────────────────────────
    case "pinterest:pin":       return <PinterestPin      {...f} />;
    case "pinterest:board":     return <PinterestBoard    {...f} />;
    case "pinterest:story-pin": return <PinterestStoryPin {...f} />;

    // ── Podcast (3) ───────────────────────────────────────────────────
    case "podcast:episode":   return <PodcastEpisode   {...f} />;
    case "podcast:show":      return <PodcastShow      {...f} />;
    case "podcast:audiogram": return <PodcastAudiogram {...f} />;

    // ── Generic ───────────────────────────────────────────────────────
    case "generic:generic": return <GenericMockup {...f} />;

    // ── Proposal-style for Brand + Research tasks (2026-05-09) ──────
    case "generic:proposal-cover": return <ProposalCover {...f} />;
    case "generic:proposal-spec":  return <ProposalSpec  {...f} />;
    case "generic:research-doc":   return <ResearchDoc   {...f} />;
    case "generic:persona-card":   return <PersonaCard   {...f} />;

    // Any other generic:* (e.g. generic:feed from RunPage's "last
    // resort" layer for tasks without a platform prefix like
    // kl-30-invite-opener) → GenericMockup, which renders the actual
    // produced copy. 2026-05-16: previously fell to the placeholder
    // below and silently dropped liveCaption.
    default:
      if (variant.platform === "generic") return <GenericMockup {...f} />;
      // Defensive: unknown non-generic variant → honest placeholder
      return <UnsupportedVariantPlaceholder variant={variant} {...f} />;
  }
}
