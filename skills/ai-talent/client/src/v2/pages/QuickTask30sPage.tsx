/**
 * QuickTask30sPage — the 30 秒 tier home (2026-05-05).
 *
 * Replaces /fb beta. Mirrors QuickTasksPage visual design (Canva-style
 * gradient cards in horizontal-scroll row + tab strip), but:
 *
 *  - Data source: trpc.quickTask.listFB (not task_catalog)
 *  - Card thumbnail: bound agent's DiceBear avatar (not generic ⚡)
 *  - Click → primary-question modal → countdown + live mockup → result
 *  - Tab "30 秒" (default) + future filter for EDM / IG when those tiers ship
 */
import React, { useMemo, useState, useEffect } from "react";
import { Navigate, useOutletContext, useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import { showToastGlobal } from "../../components/ui/Toast";
import { matchTaskWithSynonyms } from "../lib/taskSearchSynonyms";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { buildContextChips, resolveDerive } from "../lib/taskContextResolver";
import {
  Avatar, Badge, Button, Card, CardBody, Chip, Input, Modal, ModalBody,
  ModalContent, ModalFooter, ModalHeader, Progress, Skeleton, Spinner,
  Textarea,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt, faClipboard, faClipboardCheck, faClock, faPaperPlane,
  faRotateRight, faXmark, faStar, faChevronLeft, faChevronRight,
  faMagnifyingGlass, faEnvelope, faRocket, faBullhorn, faUsers,
  faFolderPlus, faCompass, faHandshake,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebookF, faInstagram, faYoutube, faTiktok, faLinkedinIn,
} from "@fortawesome/free-brands-svg-icons";
import { PlatformMockup } from "../components/PlatformMockup";
import type { MockupVariant } from "../lib/inferMockup";
// 2026-05-11 — EntityStats removed from hero (tech-spec → value-prop). Kept
// available via direct import elsewhere if any debug page needs it.
// import { EntityStats } from "../components/EntityStats";
import MediaGenFlow from "../components/media/MediaGenFlow";
import { StagePipelineView } from "../components/quickTask/StagePipelineView";
import RunningAgentCarousel from "../components/quickTask/RunningAgentCarousel";
import { faPalette, faPenNib, faFilm, faWandMagicSparkles, faSliders, faTerminal, faImage, faChevronDown } from "@fortawesome/free-solid-svg-icons";
// Lucide outline icons — Notion-style (CJ direction 2026-05-06).
// Toolbar uses these instead of FontAwesome solid for cleaner, more modern feel.
import {
  Pencil, Image as LucideImage, Video, Wand2, MessageCircle,
  Save, Sliders as LucideSliders, Copy, Sparkles,
  RotateCcw, X as LucideX,
} from "lucide-react";

// ── Client-side EN label lookup ──────────────────────────────────────────────
// Mirrors the server-side TASK_LABEL_EN map so the card title renders
// in English even when the backend label_en field is null/undefined
// (e.g. stale tRPC cache, old bundle, or deploy timing gap).
// Keyed by task id; values are the canonical English display name.
const TASK_LABEL_EN_CLIENT: Record<string, string> = {
  // Facebook 30s
  "fb-30-caption-short":    "FB Short caption",
  "fb-30-pure-text-hook":   "FB Text-only hooks × 3",
  "fb-30-link-caption":     "FB Link post caption",
  "fb-30-comment-reply":    "FB Comment reply",
  "fb-30-ad-headline":      "FB Ad headlines × 5",
  "fb-30-ad-primary":       "FB Ad primary text × 5",
  "fb-30-ad-cta":           "FB Ad CTAs × 5",
  "fb-30-ad-description":   "FB Link ad descriptions × 5",
  "fb-30-story-text":       "FB Story copy",
  "fb-30-hashtag-set":      "FB Hashtag set",
  "fb-30-countdown-1day":   "FB 1-day countdown hype",
  "fb-30-live-title":       "FB Live title + teaser",
  "fb-30-pinned-short":     "FB Pinned post copy",
  // Instagram 30s
  "ig-30-caption-short":         "IG Short caption",
  "ig-30-pure-text-hook":        "IG Text hooks × 3",
  "ig-30-story-text":            "IG Story copy + sticker ideas",
  "ig-30-reel-hook":             "IG Reel opening hook (first 3s)",
  "ig-30-reel-script-full":      "IG Reel full script (15-30s)",
  "ig-30-carousel-structure":    "IG Carousel 10-slide structure",
  "ig-30-hashtag-set":           "IG Hashtag set × 30",
  "ig-30-bio-rewrite":           "IG Bio rewrite",
  "ig-30-comment-reply":         "IG Comment reply",
  "ig-30-dm-script":             "IG DM auto-reply script",
  "ig-30-live-opening":          "IG Live opening (30s)",
  "ig-30-story-repost-strategy": "IG Story 24h repost strategy",
  "ig-30-threads-cross-post":    "IG → Threads cross-post",
  // YouTube 30s
  "yt-30-title-strategies":  "YT Video title (3 strategies)",
  "yt-30-description-seo":   "YT SEO description (full)",
  "yt-30-thumbnail-text":    "YT Thumbnail copy + visual brief",
  "yt-30-opening-hook":      "YT Opening hook (first 15s)",
  "yt-30-chapter-timeline":  "YT Chapter timestamps",
  "yt-30-end-cta":           "YT End-screen CTA",
  "yt-30-pinned-comment":    "YT Pinned comment hook",
  "yt-30-comment-reply":     "YT Comment reply",
  "yt-30-shorts-script":     "YT Shorts script (30-60s)",
  "yt-30-community-post":    "YT Community tab post",
  // TikTok 30s
  "tt-30-opening-hook":       "TikTok Opening hook (first 3s)",
  "tt-30-full-script":        "TikTok Full script (30-60s)",
  "tt-30-caption-description":"TikTok Caption (description)",
  "tt-30-caption-rhythm":     "TikTok Caption rhythm (timestamps)",
  "tt-30-hashtag-set":        "TikTok Hashtag set",
  "tt-30-trend-remix":        "TikTok Trend remix",
  "tt-30-duet-angle":         "TikTok Duet angle ideas",
  "tt-30-bio-rewrite":        "TikTok Bio rewrite",
  "tt-30-comment-reply":      "TikTok Comment reply",
  "tt-30-live-opening":       "TikTok Live opening (30s)",
  // LinkedIn 30s
  "li-30-insight-post":  "LI Insight post",
  "li-30-hook-3":        "LI Hooks × 3 (scroll-stopper)",
  "li-30-article-opener":"LI Article opener (first 200 words)",
  "li-30-newsletter":    "LI Newsletter title + intro",
  "li-30-poll":          "LI Poll (question + 4 options)",
  "li-30-document":      "LI Document (8-slide PDF carousel)",
  "li-30-comment":       "LI Comment reply",
  "li-30-dm-intro":      "LI Cold DM intro",
  "li-30-event-invite":  "LI Event invite post",
  "li-30-headline":      "LI Profile headline",
  // Email 30s
  "em-30-subject-line":   "Email subject line",
  "em-30-preview-text":   "Email preview text",
  "em-30-welcome":        "Welcome email",
  "em-30-cold-email":     "Cold email",
  "em-30-drip":           "Drip series (nth email)",
  "em-30-promo":          "Promotional email (limited offer)",
  "em-30-event-invite":   "Event invite email",
  "em-30-abandoned-cart": "Abandoned cart recovery",
  "em-30-re-engagement":  "Re-engagement email",
  "em-30-transactional":  "Transactional notification",
  // PR 30s
  "pr-30-headline":       "Press release headline",
  "pr-30-subhead":        "PR subheadline + lead",
  "pr-30-lead-paragraph": "Inverted pyramid lead paragraph",
  "pr-30-boilerplate":    "Company boilerplate",
  "pr-30-ceo-quote":      "CEO statement (speech)",
  "pr-30-fact-sheet":     "Fact sheet (one-pager)",
  "pr-30-spokesperson-qa":"Spokesperson Q&A (media prep)",
  "pr-30-media-pitch":    "Media pitch email",
  "pr-30-news-hook":      "News story idea generator",
  "pr-30-launch-social":  "Launch PR social post",
  // Facebook 60s
  "fb-60-single-full":      "FB Full post",
  "fb-60-link-full":        "FB Link post (full)",
  "fb-60-album-4":          "FB Photo album × 4",
  "fb-60-countdown-5day":   "FB 5-day countdown series",
  "fb-60-launch-kit":       "FB Event launch kit (4 posts)",
  "fb-60-live-suite":       "FB Live suite (6 pieces)",
  "fb-60-pinned-suite":     "FB Pinned + 3 companion posts",
  "fb-60-ad-pack-3":        "FB Ad pack A/B/C",
  // Instagram 60s
  "ig-60-feed-full":              "IG Full feed post",
  "ig-60-reel-full":              "IG Reel full script",
  "ig-60-carousel-7":             "IG Carousel 7-slide",
  "ig-60-story-3frame":           "IG Story 3-frame set",
  "ig-60-countdown-5day":         "IG 5-day countdown series",
  "ig-60-highlight-suite":        "IG Highlight × 5 (cover + content)",
  "ig-60-live-suite":             "IG Live suite (5 pieces)",
  "ig-60-serial-3":               "IG 3-part narrative series",
  "ig-60-viral-rewrite":          "IG Viral rewrite",
  "ig-60-testimonial-rewrite":    "IG Testimonial rewrite",
  // YouTube 60s
  "yt-60-video-package":   "YT Full video caption package",
  "yt-60-shorts-script":   "YT Shorts full script",
  "yt-60-thumbnail-suite": "YT Thumbnail × 5 styles",
  "yt-60-series-3ep":      "YT 3-episode series",
  "yt-60-community-post":  "YT Community post",
  "yt-60-viral-rewrite":   "YT Viral video rewrite",
  // TikTok 60s
  "tt-60-foryou-full":   "TikTok ForYou full package",
  "tt-60-series-3":      "TikTok 3-episode series",
  "tt-60-viral-rewrite": "TikTok Viral rewrite",
  // LinkedIn 60s
  "li-60-thought-leader": "LI Thought leadership post (full)",
  "li-60-newsletter":     "LI Newsletter (one issue)",
  "li-60-case-study":     "LI Client case study rewrite",
  // Email 60s
  "em-60-newsletter-full": "Email Newsletter (full issue)",
  "em-60-promo-sequence":  "Email promo sequence (3 emails)",
  "em-60-onboarding-3":    "Email onboarding sequence (3 emails)",
  // PR 60s
  "pr-60-news-release-full": "Full press release",
  // Brand / Research 60s
  "br-60-tagline-suite":   "Brand tagline × 5 variants",
  "br-60-value-prop":      "Value proposition rewrite",
  "br-60-brand-voice":     "Brand Voice Guideline",
  "rs-60-interview-guide": "User interview guide (full)",
  "rs-60-persona-suite":   "User persona × 5",
  "rs-60-jtbd-suite":      "Jobs-to-be-Done × 5",
  // Facebook 99s
  "fb-99-30day-calendar":         "FB 30-day content calendar",
  "fb-99-monthly-calendar-promo": "FB 30-day promo calendar (multi-product)",
  "fb-99-carousel-5":             "FB Carousel 5-card",
  "fb-99-serial-3":               "FB 3-part narrative series",
  "fb-99-viral-rewrite":          "FB Viral rewrite",
  "fb-99-testimonial-rewrite":    "FB Testimonial rewrite",
  "fb-99-trend-rewrite":          "FB Trending news rewrite",
  "fb-99-14day-countdown":        "FB Countdown series (7 / 14 days)",
  "fb-99-launch-toolkit":         "FB Full launch toolkit (8 posts)",
  "fb-99-livestream-9seg":        "FB Live 9-segment suite",
  "fb-99-crisis-playbook":        "FB Full crisis PR playbook",
  "fb-99-account-reposition":     "FB Account repositioning",
  "fb-99-quarterly-strategy":     "FB Quarterly content strategy",
  "fb-99-monthly-analytics":      "FB Monthly performance report",
  "fb-99-carousel-cvo":           "FB Carousel: awareness-to-purchase story",
  "fb-99-offer-first":            "FB Offer-led post",
  "fb-99-magnetic-marketing":     "FB Magnetic marketing post",
  "fb-99-mass-control":           "FB Grand launch playbook",
  // Instagram 99s
  "ig-99-30day-calendar":      "IG 30-day content calendar",
  "ig-99-reel-series-6":       "IG Reel 6-episode series",
  "ig-99-account-reposition":  "IG Account repositioning full kit",
  "ig-99-monthly-calendar":    "IG 30-day content calendar",
  "ig-99-youtility":           "IG Utility-first content strategy",
  "ig-99-visual-story":        "IG Visual-consistency brand posts",
  "ig-99-live-first":          "IG Live-first content strategy",
  "ig-99-document":            "IG Documentary-style content",
  "ig-99-radical-transparency":"IG Radical transparency brand posts",
  "ig-99-save-worthy":         "IG Save-worthy utility posts",
  // YouTube 99s
  "yt-99-series-6ep":         "YT 6-episode full production pack",
  "yt-99-quarterly-strategy": "YT Quarterly channel strategy",
  "yt-99-premiere-kit":       "YT Premiere full kit",
  // TikTok 99s
  "tt-99-30day-foryou": "TikTok 30-day ForYou formula",
  "tt-99-trend-week":   "TikTok 1-week trending full kit",
  // LinkedIn 99s
  "li-99-30day-thought-leadership": "LI 30-day Thought Leadership calendar",
  "li-99-newsletter-quarterly":     "LI Quarterly newsletter (4 issues)",
  // Email 99s
  "em-99-4week-nurture":   "Email 4-week onboarding nurture",
  "em-99-launch-sequence": "Email product launch automation sequence",
  // PR 99s
  "pr-99-launch-toolkit": "PR Full launch media toolkit",
  "pr-99-newsjack":        "Newsjacking (trending news hook)",
};

// ── Client-side EN description lookup ────────────────────────────────────────
// English descriptions for all tasks — used in place of t.description when
// lang === "en". Keyed by task id.
const TASK_DESC_EN_CLIENT: Record<string, string> = {
  // Facebook 30s
  "fb-30-caption-short":    "100-200 word single-image caption with 1 hook + 1 CTA",
  "fb-30-pure-text-hook":   "3 opening hooks in different tones, auto-connects to your post",
  "fb-30-link-caption":     "Lead-in text when sharing a URL (with OG preview teaser)",
  "fb-30-comment-reply":    "Brand replies to positive / neutral comments",
  "fb-30-ad-headline":      "5 ad headline angles (under 25 words), copy-paste into Ads Manager",
  "fb-30-ad-primary":       "5 ad body texts in different tones (80-150 words), matched to audience psychology",
  "fb-30-ad-cta":           "5 CTA button texts + situational guidance for each",
  "fb-30-ad-description":   "Link ad description (under 30 words), 5 different angles",
  "fb-30-pinned-short":     "Page-pinned post — who we are and why to follow",
  "fb-30-story-text":       "9:16 ephemeral copy + overlay headline",
  "fb-30-live-title":       "Teaser caption 1-2 hours before going live",
  "fb-30-hashtag-set":      "10-15 tiered hashtags (core / mid-range / long-tail)",
  "fb-30-countdown-1day":   "Single countdown post in a series (day N)",
  // Facebook 60s
  "fb-60-single-full":      "5 variants + 5 AI images + comment templates + posting schedule + 24h follow-up",
  "fb-60-link-full":        "OG copy + thumbnail style + lead-in + comment templates + posting schedule",
  "fb-60-album-4":          "Strategist plans narrative arc + 4 cohesive images + unified caption story",
  "fb-60-countdown-5day":   "Strategist designs countdown arc + 5 days × 5 parallel posts + images",
  "fb-60-launch-kit":       "Launch arc: teaser×2 / launch day / post-event — 4 posts in parallel",
  "fb-60-live-suite":       "Teaser / opening / 3 highlights / recap — 6 pieces in parallel",
  "fb-60-pinned-suite":     "Pinned post + 3 companion pieces (FAQ / about / case study)",
  "fb-60-ad-pack-3":        "3 standalone ads (emotional / rational / contrast), each with caption + 3 image styles",
  // Instagram 30s
  "ig-30-caption-short":         "80-150 word IG feed caption + 5-10 hashtags",
  "ig-30-pure-text-hook":        "3 opening hooks in different tones, auto-connects to your content",
  "ig-30-reel-hook":             "First-3s voiceover + subtitle rhythm + opening visual brief",
  "ig-30-reel-script-full":      "Structured storyboard: hook → promise → 3 content beats → CTA",
  "ig-30-story-text":            "9:16 headline + body copy + recommended sticker",
  "ig-30-carousel-structure":    "1 title card + 8 content cards + 1 CTA card, text for each",
  "ig-30-bio-rewrite":           "150-char bio with emoji + line breaks + CTA",
  "ig-30-hashtag-set":           "3-tier mix: core 5 / mid-range 15 / long-tail 10",
  "ig-30-comment-reply":         "5 tone variants (fans / friendly / peers / KOL / general inquiry)",
  "ig-30-dm-script":             "3 scenarios: price inquiry / after-sale / collaboration invite",
  "ig-30-live-opening":          "Opening speech + warm-up engagement + CTA to drive comments",
  "ig-30-story-repost-strategy": "What to do after story expires (highlight / repurpose as feed / new story)",
  "ig-30-threads-cross-post":    "Rewrite your IG post in Threads style",
  // Instagram 60s
  "ig-60-feed-full":              "5 variants + 5 AI images + hashtags + comment templates + posting schedule",
  "ig-60-reel-full":              "Strategist plans Hook-Hold-Payoff + full script + 9:16 visuals",
  "ig-60-carousel-7":             "Strategist plans narrative arc + 7 cards + unified visual tone",
  "ig-60-story-3frame":           "3-frame cohesive story: context / highlight / CTA + sticker ideas",
  "ig-60-countdown-5day":         "Strategist designs countdown arc + 5 days × 5 parallel posts + images",
  "ig-60-highlight-suite":        "5 highlight covers (about / products / FAQ / reviews / cases) + visual consistency",
  "ig-60-live-suite":             "Teaser / opening / peak / closing / recap — 5 pieces in parallel",
  "ig-60-serial-3":               "Strategist designs 3-part arc + 3 interlocking serial posts",
  "ig-60-viral-rewrite":          "Strategist finds viral structure + rewrites as brand version + comparison",
  "ig-60-testimonial-rewrite":    "Strategist finds testimonial structure + rewrites narrative + legal check",
  // YouTube 30s
  "yt-30-title-strategies":  "SEO-friendly / contrast-number / suspense — 1 of each",
  "yt-30-thumbnail-text":    "Thumbnail headline (5-8 words) + overall visual direction",
  "yt-30-description-seo":   "With timestamps / links / hashtags / tags",
  "yt-30-chapter-timeline":  "Paste video URL → auto-generates chapter timestamps from transcript",
  "yt-30-shorts-script":     "Hook → 3 content beats → CTA structure",
  "yt-30-opening-hook":      "Voiceover + subtitles + camera direction",
  "yt-30-end-cta":           "Subscribe / bell / next video / comment prompt",
  "yt-30-comment-reply":     "5 tones: fan / complaint / peer / skeptic / silent viewer",
  "yt-30-pinned-comment":    "First pinned comment after publish — sparks discussion",
  "yt-30-community-post":    "3 types: text / poll / teaser",
  // YouTube 60s
  "yt-60-video-package":   "Title + description + chapters + 5 alt titles + thumbnail style",
  "yt-60-shorts-script":   "Strategist plans structure + 60s script + thumbnail brief",
  "yt-60-thumbnail-suite": "5 thumbnail visual directions + matching title variants",
  "yt-60-series-3ep":      "Strategist designs 3-episode arc + 3 full video captions + cohesive narrative",
  "yt-60-community-post":  "5 community posts (poll / image / text / Q&A / teaser)",
  "yt-60-viral-rewrite":   "Strategist finds viral structure + rewrites as brand version + comparison",
  // TikTok 30s
  "tt-30-opening-hook":       "Voiceover + overlay text + camera direction",
  "tt-30-full-script":        "Hook → reveal → 3 content beats → CTA",
  "tt-30-caption-rhythm":     "Subtitle rhythm synced to voiceover",
  "tt-30-bio-rewrite":        "80-char bio + emoji + link",
  "tt-30-hashtag-set":        "5-15 tiered hashtags",
  "tt-30-caption-description":"Under 100-word description + CTA",
  "tt-30-duet-angle":         "React to / supplement / counter another video",
  "tt-30-trend-remix":        "Remix a trending format in your brand's version",
  "tt-30-comment-reply":      "5 tone variants",
  "tt-30-live-opening":       "Opening speech + warm-up + CTA",
  // TikTok 60s
  "tt-60-foryou-full":    "Hook + hold + payoff complete 60s script + 5 variants",
  "tt-60-series-3":       "Strategist designs 3-episode arc + 3 cohesive scripts",
  "tt-60-viral-rewrite":  "Strategist finds viral structure + rewrites as brand version + comparison",
  // LinkedIn 30s
  "li-30-insight-post":   "150-300 word professional opinion post",
  "li-30-hook-3":         "First 1-2 lines that decide if they read on",
  "li-30-article-opener": "LI Article opening 200 words — hook that keeps readers going",
  "li-30-poll":           "LI poll question + 4 options",
  "li-30-event-invite":   "Invite to webinar / meetup / workshop",
  "li-30-dm-intro":       "First DM after connecting",
  "li-30-comment":        "High-value comment on someone else's LI post",
  "li-30-headline":       "Your LinkedIn profile headline (under 120 chars)",
  "li-30-newsletter":     "LI Newsletter title + first paragraph (entices subscription)",
  "li-30-document":       "8-page LI document post structure + copy for each page",
  // LinkedIn 60s
  "li-60-thought-leader": "Strategist designs angle + 800-word deep post + pull-quote card",
  "li-60-newsletter":     "Strategist designs TOC + full newsletter (headline + intro + 3 sections + CTA)",
  "li-60-case-study":     "Strategist finds testimonial structure + rewrites narrative + legal check",
  // Email 30s
  "em-30-subject-line":   "The 30-word line that decides whether they open",
  "em-30-preview-text":   "Preview text next to the subject — reinforces open rate",
  "em-30-welcome":        "First email to new subscribers",
  "em-30-promo":          "Event / discount / limited-time promo email",
  "em-30-drip":           "One email in an automated drip campaign",
  "em-30-abandoned-cart": "Remind users to complete their purchase",
  "em-30-re-engagement":  "Win back subscribers who haven't opened in 30/60/90 days",
  "em-30-event-invite":   "Webinar / offline event / opening night invitation",
  "em-30-cold-email":     "First B2B cold outreach email",
  "em-30-transactional":  "Order confirmation / shipping notice / invoice",
  // Email 60s
  "em-60-newsletter-full":  "Strategist designs structure + subject + intro + 3 sections + CTA + preview",
  "em-60-promo-sequence":   "Strategist designs promo arc + 3 emails (teaser / launch / last call)",
  "em-60-onboarding-3":     "First 3 welcome emails for new subscribers (Day 0 / Day 3 / Day 7)",
  // PR 30s
  "pr-30-headline":       "The first line that decides if journalists open it",
  "pr-30-subhead":        "1-2 extension sentences below the headline",
  "pr-30-lead-paragraph": "5W1H first paragraph — the most important facts",
  "pr-30-ceo-quote":      "Ready-to-deliver full speech + speaker / occasion",
  "pr-30-boilerplate":    "The fixed 'About [Company]' section at the bottom",
  "pr-30-fact-sheet":     "Quick-reference bullet list for journalists",
  "pr-30-media-pitch":    "The 'why you should cover us' email to journalists",
  "pr-30-spokesperson-qa":"Anticipated media questions + standard answers",
  "pr-30-launch-social":  "Social post to run alongside the press release",
  "pr-30-news-hook":      "Turn 'what we want to say' into 'what journalists will write'",
  // PR 60s
  "pr-60-news-release-full": "Headline + subhead + 5W1H lead + 3 body sections + boilerplate + media contact",
  // Brand 60s
  "br-60-tagline-suite":   "Strategist defines archetype + 5 tagline candidates + usage contexts",
  "br-60-value-prop":      "Strategist finds competitive difference + 5 value prop versions",
  "br-60-brand-voice":     "5 brand voice samples + Do / Don't comparison",
  // Research 60s
  "rs-60-interview-guide": "Strategist designs research questions + open-ended Qs + probing prompts",
  "rs-60-persona-suite":   "5 key persona cards (demographics + psychology + pain points + channels)",
  "rs-60-jtbd-suite":      "5 JTBD statements + trigger context + competitors",
  // Cross-platform 60s
  "cw-60-crosspost-4platform": "Same topic → adapted for 4 platforms (tone / length / hashtags all differ)",
  "cw-60-ab-variants":         "2 versions from different angles + 'which will win' analysis + test setup",
  // KOL 60s
  "kl-60-pitch-pack": "Complete ready-to-send invitation + 4 attachments: brief / pricing response / follow-up / thank-you",
  // Facebook 99s
  "fb-99-30day-calendar":         "Structured 30-day calendar: 4 WHY posts / 4 product / 2 seasonal / 2 UGC / 2 authority",
  "fb-99-monthly-calendar-promo": "Structured promo calendar: 6 product / 3 urgency / 2 seasonal / 2 UGC / 1 brand story",
  "fb-99-carousel-5":             "Hook→Build→Turn→Payoff→CTA arc + 5 cards (each with copy + image)",
  "fb-99-serial-3":               "3-part narrative arc + 3 interlocking posts (each with image + full package)",
  "fb-99-viral-rewrite":          "Finds viral structure → rewrites as brand version + comparison (scout pulls viral benchmarks)",
  "fb-99-testimonial-rewrite":    "Finds testimonial structure + rewrites narrative + legal check",
  "fb-99-trend-rewrite":          "Evaluates news relevance + writes brand angle + timeliness check (scout pulls breaking news)",
  "fb-99-14day-countdown":        "Daily countdown post + 3-act pacing + D-4 onwards with CTA + scout for events",
  "fb-99-launch-toolkit":         "Teaser×3 / launch / live×2 / recap / IG cross-post + scout for events",
  "fb-99-livestream-9seg":        "Teaser + opening + 5 peak moments + closing + recap + reel editing guide",
  "fb-99-crisis-playbook":        "Detection + first statement + mid-updates×3 + follow-up + internal talking points",
  "fb-99-account-reposition":     "Trout & Ries positioning + Pulizzi Tilt + complete repositioning launch posts",
  "fb-99-quarterly-strategy":     "3-month rhythm: monthly themes + 12 key post ideas + content pillar mix",
  "fb-99-monthly-analytics":      "Engagement / reach / saves full analysis + next-month recommendations",
  "fb-99-carousel-cvo":           "10-card story: stranger → customer (awareness→interest→evaluation→purchase)",
  "fb-99-offer-first":            "Write an offer people can't refuse: value stacking + risk reversal + urgency",
  "fb-99-magnetic-marketing":     "Attract the right people proactively: precise positioning, strong appeal, clear CTA",
  "fb-99-mass-control":           "High-momentum launch: 3-phase teaser → climax → wind-down (major annual events)",
  // Instagram 99s
  "ig-99-30day-calendar":      "30-day feed/reel/story mix + per-post hook + hashtag strategy + real viral references",
  "ig-99-reel-series-6":       "6-episode arc + full script for each (hook + hold + payoff) + thumbnail brief",
  "ig-99-account-reposition":  "New bio + 9 highlight themes + 9 launch posts + visual direction",
  "ig-99-monthly-calendar":    "Daily feed / reel / story plan + seasonal hooks + themes + visual consistency",
  "ig-99-youtility":           "30 days of genuinely useful content (zero selling, pure value) — people save and share",
  "ig-99-visual-story":        "Full visual identity + color palette + composition style + 30-day feed consistency",
  "ig-99-live-first":          "Live-centric strategy: teaser + live package + post-live reel clips",
  "ig-99-document":            "Real behind-the-scenes work, unpolished — build genuine brand authenticity",
  "ig-99-radical-transparency":"Share brand backstage / failures / growth publicly — build deep trust",
  "ig-99-save-worthy":         "Carousel tutorials / lists / comparison tables — content people save and share",
  // YouTube 99s
  "yt-99-series-6ep":         "6-episode titles + 800-1200 word descriptions + 3 thumbnail briefs each + community package",
  "yt-99-quarterly-strategy": "Trending topic report + content pillars + 12 video titles + community calendar",
  "yt-99-premiere-kit":       "Teaser video + countdown community posts + live package + clip editing guide",
  // TikTok 99s
  "tt-99-30day-foryou": "30-day daily scripts + trend alignment + sound suggestions + scout for events",
  "tt-99-trend-week":   "7-day trending hooks + brand angle + 3 hook variants each + sound suggestions",
  // LinkedIn 99s
  "li-99-30day-thought-leadership": "30 days: 10 insights / 10 case studies / 10 trend predictions + scout for events",
  "li-99-newsletter-quarterly":     "4-issue quarterly newsletter full content + subscriber growth strategy",
  // Email 99s
  "em-99-4week-nurture":   "4-week onboarding: Week 1 Why / Week 2 What / Week 3 How / Week 4 Deepen",
  "em-99-launch-sequence": "Teaser×2 / launch / reminder×2 / last call / follow-up = 7 emails",
  // PR 99s
  "pr-99-launch-toolkit": "Press release + media Q&A + contact script + follow-up + spokesperson talking points",
  "pr-99-newsjack":        "Connect your brand to breaking news — produce a reportable angle",
};

const CARD_PALETTES = [
  { from: "#fde68a", to: "#fbbf24", text: "#92400e" },
  { from: "#a5f3fc", to: "#22d3ee", text: "#164e63" },
  { from: "#c4b5fd", to: "#8b5cf6", text: "#4c1d95" },
  { from: "#bbf7d0", to: "#34d399", text: "#064e3b" },
  { from: "#fecaca", to: "#f87171", text: "#7f1d1d" },
  { from: "#fed7aa", to: "#fb923c", text: "#7c2d12" },
  { from: "#bfdbfe", to: "#60a5fa", text: "#1e3a8a" },
  { from: "#f5d0fe", to: "#c084fc", text: "#581c87" },
];

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=4267B2&backgroundType=solid`;

// 2026-05-18 (CJ「沒生成前應停留在讀秒 modal，不要跑來 mockup 等待」):
// tasks whose deliverable is a complete post (copy + image). For these
// we keep the running countdown modal open until the FULL post (incl.
// image) is ready, THEN navigate to /run — instead of navigating at the
// caption_ready checkpoint and making the user watch a spinner there.
// Mirrors OrchestraConfig.holdForImages (server) + RunPage HOLD_FOR_IMAGES.
const HOLD_FOR_IMAGES = new Set<string>(["fb-60-single-full", "fb-99-carousel-5"]);

/** Tier accent color (Canva-style — vibrant, distinct per tier).
 *  30s = teal (quick / fast), 60s = purple (production / depth),
 *  100s = amber (premium / research-validated). Used for mockup frame
 *  glow, variant active dot, accordion icon backgrounds. */
function tierAccent(tier: "30s" | "60s" | "90s" | "99s" | undefined | null): string {
  if (tier === "60s") return "#7c3aed";   // purple
  if (tier === "99s") return "#f59e0b";  // amber
  if (tier === "90s") return "#f59e0b";   // legacy → amber
  return "#00b4bc";                        // 30s teal (default)
}

/**
 * Synthesize live stages while orchestra is running (no streaming yet).
 * Maps elapsed ms → which stages should be "running" / "done".
 * Tier-aware: 100s prepends a scout stage (real data fetch).
 *
 * Schedule:
 *   30s tier: pre / caption / brief / gen (~20s total)
 *   60s tier: pre / strategist / caption / brief / gen / extras / qa (~50s)
 *   100s tier: + scout at front (~60-90s)
 */
function synthesizeStages(elapsedMs: number, tier: "30s" | "60s" | "99s", lang: "zh-TW" | "en" = "zh-TW"): any[] {
  const L = (zh: string, en: string) => (lang === "en" ? en : zh);
  const t = elapsedMs;
  const isResearch = tier === "99s";
  const isProd = tier === "60s" || tier === "99s";

  // Scout offset: 100s adds 12s scout up-front; other tiers start at 0
  const scoutEnd = isResearch ? 12000 : 0;
  const preEnd = scoutEnd + 3000;
  const stratEnd = preEnd + 9000;
  const capStart = preEnd;
  const capEnd = capStart + 25000;
  const genEnd = capEnd + 10000;
  const extrasEnd = capEnd + 14000;
  const qaEnd = extrasEnd + 8000;

  const mk = (key: string, label: string, start: number, end: number) => ({
    key, label, startedAt: start,
    completedAt: t > end ? end : undefined,
    status: t < start ? "pending" : t > end ? "done" : "running",
  });

  const stages: any[] = [];
  if (isResearch) {
    stages.push(mk("scout", L("🔬 Scout 爬取真實爆款數據", "🔬 Scout pulls real viral data"), 0, scoutEnd));
  }
  stages.push(mk("pre", L("URL / persona / brand load", "URL / persona / brand load"), scoutEnd, preEnd));
  if (isProd) {
    stages.push(mk("strategist", L("Strategist 規劃敘事弧", "Strategist maps the narrative arc"), preEnd, stratEnd));
  }
  stages.push(mk("caption", L("文案寫手 撰寫版本", "Caption writer drafts variants"), capStart, capEnd));
  stages.push(mk("brief", L("視覺指導寫風格指示", "Image director writes the visual brief"), capStart, capEnd));
  stages.push(mk("gen", L("Flux 生圖", "Flux paints the image"), capEnd, genEnd));
  if (isProd) {
    stages.push(mk("extras", L("留言模板 / 發文時段 / 跟進", "Reply templates · timing · follow-up"), capEnd, extrasEnd));
    stages.push(mk("qa", L("Jordan Hayes 審核", "Jordan Hayes reviews"), extrasEnd, qaEnd));
  }
  return stages;
}

interface FBTaskCard {
  id: string;
  tier: "30s" | "60s" | "90s";
  postType: string;
  /** Platform — FB / IG / Threads / etc. Surfaced by listFB since 2026-05-05. */
  platform?: string;
  label: string;
  /** 2026-05-11 — structured bilingual label parts so modal header can show
   *  "EN · 中文" without manual string concatenation drift. */
  label_en?: string | null;
  label_zh?: string | null;
  /** 2026-05-11 — declarative list of brand-context paths this task reads
   *  (drives the "我會用 X 來跑這個任務" strip in the intake modal). */
  contextSources?: string[] | null;
  description: string;
  kind: "fast" | "mid" | "squad";
  inputs?: any[];
  primary_question?: string | null;
  primary_input?: { key: string; placeholder?: string; type: "text" | "textarea"; derive?: any } | null;
  agent_id?: number | null;
  skill_slug?: string | null;
  agent?: { id: number; name: string; title: string; avatarUrl: string | null } | null;
  /** 60s tier: full collab team (caption_writer + image_director + strategist
   *  + specialty + universal helpers Emma/Helen/David/Sophie/Jordan). */
  team?: Array<{ id: number; name: string; title: string; avatarUrl: string | null }>;
  squad_slug?: string;
  methodology?: string;
}

type Tier = "30s" | "60s" | "99s";
type Channel = "facebook" | "instagram" | "youtube" | "tiktok" | "linkedin" | "email" | "pr" | "audience" | "brand" | "kol" | "all";

interface ChannelTile {
  id: Channel;
  label: string;
  icon: any;
  bg: string;
  enabled: boolean;
}

// 2026-05-11 (CJ「30s/60s/99s 當中的用戶研究和品牌定位可以先拿掉」):
// these are workspace tasks (live on /brands), not production-tier tasks.
// Removed from channel chip nav. Backend tasks still exist for back-compat
// but won't show up in the chip filter. Re-enable by uncommenting.
const CHANNEL_TILES: ChannelTile[] = [
  { id: "all",        label: "全部",       icon: faStar,        bg: "#7C3AED", enabled: true  },
  { id: "facebook",   label: "Facebook",   icon: faFacebookF,   bg: "#1877F2", enabled: true  },
  { id: "instagram",  label: "Instagram",  icon: faInstagram,   bg: "#E4405F", enabled: true  },
  { id: "youtube",    label: "YouTube",    icon: faYoutube,     bg: "#FF0000", enabled: true  },
  { id: "tiktok",     label: "TikTok",     icon: faTiktok,      bg: "#010101", enabled: true  },
  { id: "linkedin",   label: "LinkedIn",   icon: faLinkedinIn,  bg: "#0A66C2", enabled: true  },
  { id: "email",      label: "電子報",     icon: faEnvelope,    bg: "#7B5BC8", enabled: true  },
  { id: "pr",         label: "新聞稿",     icon: faBullhorn,    bg: "#475569", enabled: true  },
  // 2026-05-12 (CJ「KOL 提供說法不提供名單」): outreach talking points tile
  { id: "kol",        label: "KOL 邀約",   icon: faHandshake,   bg: "#9333EA", enabled: true  },
];

// Channel label translations for "en" mode. zh label stays in CHANNEL_TILES.
const CHANNEL_EN_LABEL: Record<string, string> = {
  all: "All",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  email: "Newsletter",
  pr: "Press release",
  kol: "Influencer pitch",
};
const __CHANNEL_LABELS_SENTINEL__: never[] = [
  // 品牌定位 + 用戶研究 隸屬 /brands workspace，不再出現在產出 tier。
  // { id: "brand",    label: "品牌定位",   icon: faRocket,      bg: "#7C3AED", enabled: true  },
  // { id: "audience", label: "用戶研究",   icon: faUsers,       bg: "#E07B0F", enabled: true  },
];

/**
 * Inner ErrorBoundary so a runtime crash in tier-specific code (60s/100s)
 * shows a visible error panel instead of a white screen. The global
 * AppErrorBoundary (in AppV2) catches outermost errors but a crash inside
 * a deeply-nested branch (e.g. visibleTasks.map row, modal subtree)
 * sometimes blanks just this page if state corruption isolates the
 * unmount path. Inline boundary keeps the rest of the shell intact.
 */
class TierPageErrorBoundary extends React.Component<
  { children: React.ReactNode; tier: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) {
    // eslint-disable-next-line no-console
    console.error(`[QuickTask${this.props.tier}] render error:`, error, info);
  }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
          <div style={{ padding: 20, border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 12 }}>
            <p style={{ fontSize: 11, color: "#dc2626", textTransform: "uppercase", letterSpacing: 1 }}>
              /{this.props.tier} render error
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{(typeof localStorage !== "undefined" && localStorage.getItem("language") === "en") ? "Page failed to load" : "頁面載入失敗"}</h2>
            <p style={{ marginTop: 8, color: "#374151" }}>{e.message}</p>
            <pre style={{ marginTop: 12, padding: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11, maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap" }}>
              {e.stack}
            </pre>
            <button
              style={{ marginTop: 12, padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
              onClick={() => this.setState({ error: null })}
            >
              {(typeof localStorage !== "undefined" && localStorage.getItem("language") === "en") ? "Try again" : "重試渲染"}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

function QuickTask30sPageInner({ tier = "30s" }: { tier?: Tier }) {
  const { t, lang } = useLang();
  const ctx = useOutletContext<ShellOutletCtx>();
  const navigate = useNavigate();
  const brandId = (ctx?.brandId as number | null) ?? null;
  const brandName = useMemo(() => {
    const list = (ctx?.brands as any[]) ?? [];
    return list.find((b) => b?.id === brandId)?.name ?? null;
  }, [ctx, brandId]);

  // 2026-05-14 (CJ「60s 頁面在任務完成後返回時，會出現空白頁」):
  // Bug was: window.location.href = "/brands" triggers a FULL PAGE RELOAD.
  // During the brief moment between brandsLoaded toggling true with brands
  // still hydrating, the redirect could fire and the user saw a blank
  // page (URL changing, fresh React mount). Worse, it tore the SPA shell
  // mid-mount, so any unmount cleanup in child components could throw.
  //
  // We replace the hard nav with a render-time check at the bottom of
  // this function — it sets `needsOnboardingRedirect = true` and the JSX
  // return below short-circuits to <Navigate to="/brands" replace />.
  // <Navigate> swaps inside the same render commit — no flash, no
  // forced reload.
  const brandsLoaded = (ctx as any)?.brandsLoaded === true;
  const brandsList = (ctx?.brands as any[]) ?? [];
  const needsOnboardingRedirect = brandsLoaded && brandsList.length === 0;
  // Pull the active brand row to access logoUrl. Refetched every 30s so a
  // freshly-saved FB logo shows up without a full page reload.
  const brandQuery = (trpc as any).brand?.get?.useQuery
    ? (trpc as any).brand.get.useQuery(
        { id: brandId ?? 0 },
        { enabled: !!brandId, refetchInterval: 30_000, refetchOnWindowFocus: false },
      )
    : { data: null, refetch: () => {} };
  const brandLogoUrl: string | null = (brandQuery.data as any)?.logoUrl ?? null;

  // 2026-05-08 (CJ test report #3): probe brand text-asset emptiness so
  // we can prompt the user to fill them on first task run. Without
  // voice / banned_words / preferred_terms etc., the AI has no real
  // grounding for tone — first-time output ends up generic.
  const scopeActiveQuery = (trpc as any).scope?.active?.useQuery?.(
    { brandId: brandId ?? 0, productId: null, eventId: null },
    { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const brandAssetsForCheck: Record<string, any> =
    ((scopeActiveQuery?.data as any)?.brand?.positioning?._assets ?? {}) as Record<string, any>;
  const textAssetsEmpty = useMemo(() => {
    // 2026-05-10 (pre-launch UX): hint was showing on EVERY task open
    // even for brands with positioning + assets done. Now also hide if
    // brand has tagline OR positioningSummary OR positioningStatus
    // completed (any of these = brand has been set up beyond stub).
    const b: any = brandQuery?.data ?? {};
    const brandSetUp =
      (typeof b.tagline === "string" && b.tagline.trim()) ||
      (typeof b.positioningSummary === "string" && b.positioningSummary.trim()) ||
      b.positioningStatus === "completed";
    if (brandSetUp) return false;

    const v = (assetKey: string): boolean => {
      const a = brandAssetsForCheck[assetKey];
      if (!a) return true;
      if (typeof a.text === "string" && a.text.trim()) return false;
      if (Array.isArray(a.items) && a.items.some((x: any) => typeof x === "string" && x.trim())) return false;
      if (Array.isArray(a.pairs) && a.pairs.some((p: any) => p?.from?.trim() && p?.to?.trim())) return false;
      return true;
    };
    return v("voice") && v("voice_principles") && v("preferred_terms") && v("banned_words");
  }, [brandAssetsForCheck, brandQuery?.data]);

  const [channel, setChannel] = useState<Channel>("facebook");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal + run state
  const [activeTask, setActiveTask] = useState<FBTaskCard | null>(null);
  const [primaryAnswer, setPrimaryAnswer] = useState("");

  // 2026-05-11 — context-aware intake. Build a `brandCtx` from scope.active
  // payload and feed it into the resolver so the modal can:
  //   (a) pre-fill primary_input from positioning data
  //   (b) show "我會用 X 來跑這個任務" chips above the question
  // Memoized per scope payload so we don't recompute on every keystroke.
  const brandCtx = useMemo(() => {
    const data: any = scopeActiveQuery?.data;
    if (!data?.brand) return null;
    return {
      brand: {
        ...data.brand,
        // Normalise common aliases — positioning JSON sometimes lives under
        // .positioning, sometimes loose at top level; expose both.
        positioning: data.brand.positioning ?? {},
      },
      product: data.product ?? null,
      event: data.event ?? null,
    };
  }, [scopeActiveQuery?.data]);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<any | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState<any | null>(null);
  const [fetchedUrl, setFetchedUrl] = useState<{ url: string; title: string | null; chars: number; og?: { image: string | null; title: string | null; description: string | null; site_name: string | null; domain: string } } | null>(null);

  // Countdown overlay (visual SLA — counts up to expected eta)
  const [countdownStart, setCountdownStart] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(0);
  useEffect(() => {
    if (countdownStart == null) return;
    const id = window.setInterval(() => setTickMs(Date.now() - countdownStart), 100);
    return () => clearInterval(id);
  }, [countdownStart]);

  const listQuery = (trpc as any).quickTask?.listFB?.useQuery
    ? (trpc as any).quickTask.listFB.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const allTasks: FBTaskCard[] = (listQuery.data as FBTaskCard[]) ?? [];

  // 2026-05-09 (CJ direction): rerun-same-task. /run/:outputId 上點重跑
  // 會 navigate 過來帶 ?rerun=<outputId>。我們撈該 run 的 metadata.inputs
  // + mission.taskId，自動開對應 task modal 並 prefill 主問題輸入。
  const [searchParams, setSearchParams] = useSearchParams();
  const holdUtils = (trpc as any).useUtils?.() ?? null;
  const rerunId = Number(searchParams.get("rerun") ?? "0");
  const rerunQuery = (trpc as any).output?.getById?.useQuery
    ? (trpc as any).output.getById.useQuery(
        { id: rerunId },
        { enabled: rerunId > 0, staleTime: 60_000 },
      )
    : { data: null };
  useEffect(() => {
    if (!rerunId || !rerunQuery.data || allTasks.length === 0) return;
    const r = rerunQuery.data;
    const taskId = r.mission?.taskId;
    if (!taskId) return;
    const t = allTasks.find((x: FBTaskCard) => x.id === taskId);
    if (!t) return;
    // Prefill primary input from saved inputs (e.g. inputs.topic)
    const inputs = (r.metadata?.inputs ?? {}) as Record<string, string>;
    const primaryKey = (t as any).primary_input?.key ?? "topic";
    const prior = inputs[primaryKey] ?? Object.values(inputs)[0] ?? "";
    setActiveTask(t);
    setPrimaryAnswer(typeof prior === "string" ? prior : "");
    // Clear param so refresh doesn't re-trigger
    const next = new URLSearchParams(searchParams);
    next.delete("rerun");
    setSearchParams(next, { replace: true });
  }, [rerunId, rerunQuery.data, allTasks]);

  // 2026-05-15 (CJ「客服連結按下去」): Mia 客服按鈕會帶 ?topic=<主題>
  // 過來（例：父親節 · 復華穩健傳承）。把它預填到主問題輸入，使用者
  // 落地後選任務即可直接生，不用再打一次。清掉 param 防重新整理重觸發。
  useEffect(() => {
    const topic = searchParams.get("topic");
    if (!topic) return;
    setPrimaryAnswer((prev) => prev || topic);
    const next = new URLSearchParams(searchParams);
    next.delete("topic");
    setSearchParams(next, { replace: true });
  }, [searchParams]);

  // 30s tier: simple/quick tasks (3 variants, no extras).
  // 60s tier: production-package multi-agent (5 variants + extras + QA).
  // 100s tier: campaign-level deliverables (multi-week / month-long / series)
  //            with REAL-TIME scout (festivals / trending / news) — distinct
  //            task pool (quickTask100.ts), NOT 60s pool.
  const tasksThisTier = useMemo(
    () => allTasks.filter((t) => t.tier === tier),
    [allTasks, tier],
  );

  // Apply channel + search filters
  const visibleTasks = useMemo(() => {
    let list = tasksThisTier;
    // Filter by platform field returned by listFB. Tasks without platform
    // fall back to id-prefix inference (fb-* / ig-*).
    if (channel !== "all") {
      list = list.filter((t: any) => {
        const platform =
          t.platform ??
          (t.id?.startsWith("ig-") ? "instagram"
            : t.id?.startsWith("yt-") ? "youtube"
            : t.id?.startsWith("tt-") ? "tiktok"
            : t.id?.startsWith("li-") ? "linkedin"
            : t.id?.startsWith("em-") ? "email"
            : t.id?.startsWith("pr-") ? "pr"
            : t.id?.startsWith("br-") ? "brand"
            : t.id?.startsWith("rs-") ? "audience"
            : "facebook");
        return platform === channel;
      });
    }
    if (searchQuery.trim()) {
      // 2026-05-08 (CJ test report #1): synonym-aware search.
      // 「活動公告」 → matches "FB 短貼文 caption" / "FB 活動 launch kit"
      // 「TikTok 文案」 → matches all TikTok caption tasks
      // 「IG 貼文」 → matches IG caption (not just IG→Threads 改寫)
      list = list.filter((t) =>
        matchTaskWithSynonyms({
          query: searchQuery,
          label: t.label,
          description: t.description ?? "",
          agentName: t.agent?.name,
          skillSlug: t.skill_slug ?? undefined,
        }),
      );
    }
    return list;
  }, [tasksThisTier, channel, searchQuery]);

  const tierLabel = lang === "en"
    ? (tier === "30s" ? "30s" : tier === "60s" ? "60s" : "99s")
    : (tier === "30s" ? "30 秒" : tier === "60s" ? "60 秒" : "99 秒");
  // 2026-05-14 (CJ「99s 檔期任務卡片角標標示為 100s」): map the internal
  // tier id "99s" → user-facing "99s". Used for all badge / chip renders.
  const tierBadge = tier === "99s" ? "99s" : tier;
  // 2026-05-15: keep in sync with heroTitle (parallel, no redundant 秒數).
  const tierTagline = lang === "en"
    ? (tier === "30s"
        ? "What post are we writing today?"
        : tier === "60s"
        ? "What content set are we building today?"
        : "What campaign are we planning today?")
    : (tier === "30s"
        ? "今天想寫哪一篇貼文？"
        : tier === "60s"
        ? "今天想做哪一套內容？"
        : "今天想規劃哪一檔活動？");

  const runQuickMut = (trpc as any).quickTask?.runQuick?.useMutation();
  // Plan B 20s parallel orchestra (caption_writer + image_director + Flux Schnell ×N)
  const runOrchestraMut = (trpc as any).quickTask?.runOrchestra?.useMutation();
  const runOrchestra60Mut = (trpc as any).quickTask?.runOrchestra60?.useMutation();
  const runOrchestra99Mut = (trpc as any).quickTask?.runOrchestra99?.useMutation();
  const runSquadAutoMut = (trpc as any).quickTask?.runSquadAuto?.useMutation();
  // 2026-05-18 (CJ): optional AI polish of the user's brief — rewrites
  // the input textarea in place (no diff modal). Works for 30s/60s/99s.
  const polishInputMut = (trpc as any).quickTask?.polishInput?.useMutation();
  const [polishing, setPolishing] = useState(false);
  const [polishErr, setPolishErr] = useState<string | null>(null);
  const handlePolish = async () => {
    if (!activeTask || !primaryAnswer.trim() || !polishInputMut?.mutateAsync) return;
    setPolishErr(null);
    setPolishing(true);
    try {
      const r = await polishInputMut.mutateAsync({
        taskId: activeTask.id,
        text: primaryAnswer,
        taskLabel: typeof activeTask.label === "string" ? activeTask.label : undefined,
        primaryQuestion: activeTask.primary_question ?? undefined,
        brandId: brandId ?? undefined,
      });
      if (r?.ok && r.polished) setPrimaryAnswer(r.polished);
      else setPolishErr(lang === "en" ? "Polish failed — try again." : "潤稿失敗，請再試一次");
    } catch (e: any) {
      setPolishErr(lang === "en" ? "Polish failed — try again." : "潤稿失敗，請再試一次");
    } finally {
      setPolishing(false);
    }
  };
  const [orchestraStages, setOrchestraStages] = useState<any[] | null>(null);
  const [imageAgentMeta, setImageAgentMeta] = useState<any | null>(null);

  const openTask = (t: FBTaskCard) => {
    // Media tasks (photo/video/doc) navigate directly to their dedicated page
    // instead of opening the orchestra modal.
    if ((t as any).isMediaTask && (t as any).ctaPath) {
      navigate((t as any).ctaPath);
      return;
    }
    // Per CJ direction: 100s squad tasks now auto-run inline (same modal UX
    // as 30s/60s) instead of redirecting to /picker workspace. The squad
    // pipeline runs all steps sequentially via runSquadAuto and returns the
    // result as variant[] (each variant = one step output).
    setActiveTask(t);
    // 2026-05-11 — pre-fill primary_input from brand context if the task
    // declares a derive spec. mode=auto / confirm both pre-fill; mode=ask
    // leaves it blank but the chips below still hint what'll be used.
    let prefill = "";
    const derive = (t as any).primary_input?.derive;
    if (derive && brandCtx) {
      const r = resolveDerive(brandCtx, derive);
      if (r && (derive.mode === "auto" || derive.mode === "confirm")) {
        prefill = r.text;
      }
    }
    setPrimaryAnswer(prefill);
    setOutput(null);
    setErrorMsg(null);
    setLatencyMs(null);
    setAgentMeta(null);
  };

  const closeTask = () => {
    setActiveTask(null);
    setRunning(false);
    setCountdownStart(null);
  };

  const handleRun = async () => {
    if (!activeTask) return;
    // 2026-05-11 — only block run on empty primary_input when the task
    // *requires* it AND has no derive fallback. Tasks declaring
    // `inputs[0].required === false` (e.g. competitor mapping with
    // positioning context) are runnable empty — the server uses derived
    // context instead.
    const primaryRequired = (activeTask.inputs?.[0] as any)?.required !== false;
    const hasDerive = !!(activeTask.primary_input as any)?.derive
      || !!(activeTask.contextSources && activeTask.contextSources.length > 0);
    if (!primaryAnswer.trim() && activeTask.primary_input?.key && primaryRequired && !hasDerive) {
      setErrorMsg(lang === "en" ? "Answer the question first, then we'll make it." : "請先回答這個問題再生成");
      return;
    }
    setRunning(true);
    setErrorMsg(null);
    setOutput(null);
    setCountdownStart(Date.now());

    try {
      // 100s squad tasks (FB + IG): auto-run inline via runSquadAuto.
      // Each squad step → 1 variant in the result. Same modal UX as 30s/60s.
      if (activeTask.kind === "squad" && (activeTask as any).squad_slug) {
        if (runSquadAutoMut) {
          const r = await runSquadAutoMut.mutateAsync({
            squadSlug: (activeTask as any).squad_slug,
            topic: primaryAnswer || activeTask.label,
            brandId: brandId ?? undefined,
          });
          // Same channel→mockup-platform normalization as the orchestra path
          const SQUAD_CHANNEL_MAP: Record<string, string> = {
            pr: "press", brand: "generic", audience: "generic", kol: "generic",
          };
          const rawPlat = (activeTask as any).platform ?? "facebook";
          const platform = SQUAD_CHANNEL_MAP[rawPlat] ?? rawPlat;
          const transformedOutput = {
            platform,
            post_type: activeTask.postType ?? "feed",
            caption: r.variants?.[0]?.caption ?? "",
            hashtags: [],
            variants: (r.variants ?? []).map((v: any) => ({
              label: v.label,
              caption: v.caption,
              hashtags: [],
              image_style_direction: undefined,
              imageUrl: null,
              imageStatus: "skipped" as const,
              qa: null,
              extras: null,
              agent: v.agent ?? null,
            })),
          };
          // 2026-05-09 (CJ Phase 2): squad runs also navigate to /run
          // for consistent UX. Modal stays only for intake + countdown.
          // 2026-05-09 cleanup: ONE path. outputId required.
          if ((r as any).outputId) {
            closeTask();
            navigate(`/run/${(r as any).outputId}`);
            return;
          }
          setErrorMsg(lang === "en"
            ? "Squad ran but the output ID didn't come back. Try again or contact support."
            : "Squad 執行成功但 outputId 未回傳（recordTaskRun 失敗），請重試或回報。");
          return;
        }
        setErrorMsg(lang === "en" ? "Squad auto-run isn't available right now." : "Squad 自動執行 mutation 暫不可用");
        return;
      }
      const inputKey = activeTask.primary_input?.key ?? "topic";
      // 30s / 60s / 100s — all route through orchestra with tier-specific
      // mutation. Tier scales variants (3 → 5) + adds QA stage (60s+).
      const tierMut =
        tier === "60s" ? runOrchestra60Mut :
        tier === "99s" ? runOrchestra99Mut :
        runOrchestraMut;
      if (tierMut) {
        // 2026-05-11 (CJ「product / event 也要 narrow LLM context」):
        // pass shell scope (productId/eventId) so backend overlays
        // product + event positioning on top of brand baseline.
        const r = await tierMut.mutateAsync({
          taskId: activeTask.id,
          inputs: { [inputKey]: primaryAnswer },
          brandId: brandId ?? undefined,
          productId: ctx?.scope?.productId ?? null,
          eventId: ctx?.scope?.eventId ?? null,
        });
        // Transform OrchestraResult → OutputCarousel-compatible shape.
        // Platform comes from the task itself (FB / IG / Threads). The
        // mockup variant inferer keys on platform:postType; hardcoding
        // "facebook" would route all IG tasks to FBFeed (regression).
        //
        // Channel name → mockup platform key normalization:
        //   listFB tags `task.platform` with the *channel* key for the
        //   filter row (pr / brand / audience). PlatformMockup's switch
        //   keys on the *mockup* platform (press). Without this map,
        //   pr/press-release falls through to UnsupportedVariantPlaceholder.
        const CHANNEL_TO_MOCKUP_PLATFORM: Record<string, string> = {
          pr:       "press",    // 新聞稿 → minimalist press-release mockup
          brand:    "generic",  // 品牌定位 → generic doc mockup (taglines / value prop)
          audience: "generic",  // 用戶研究 → generic doc mockup (interviews / personas)
          kol:      "generic",  // 2026-05-12 KOL 訊息 / brief → generic message mockup
        };
        const rawTaskPlatform =
          (activeTask as any).platform ??
          (activeTask.id?.startsWith("ig-") ? "instagram"
            : activeTask.id?.startsWith("yt-") ? "youtube"
            : activeTask.id?.startsWith("tt-") ? "tiktok"
            : activeTask.id?.startsWith("li-") ? "linkedin"
            : activeTask.id?.startsWith("em-") ? "email"
            : activeTask.id?.startsWith("pr-") ? "press"
            : activeTask.id?.startsWith("br-") ? "press"
            : activeTask.id?.startsWith("rs-") ? "press"
            : activeTask.id?.startsWith("fb-") ? "facebook"
            : "facebook");
        const taskPlatform = CHANNEL_TO_MOCKUP_PLATFORM[rawTaskPlatform] ?? rawTaskPlatform;
        // Threads task uses platform="threads" + post_type="post" — preserve.
        const platformOverride =
          activeTask.id === "ig-30-threads-cross-post" ? "threads" : taskPlatform;
        const postTypeOverride =
          activeTask.id === "ig-30-threads-cross-post" ? "post" : (activeTask.postType ?? "feed");
        const transformedOutput = {
          platform: platformOverride,
          post_type: postTypeOverride,
          caption: r.variants?.[0]?.caption ?? "",
          hashtags: r.variants?.[0]?.hashtags ?? [],
          variants: (r.variants ?? []).map((v: any) => ({
            label: v.label,
            caption: v.caption,
            hashtags: v.hashtags,
            image_style_direction: v.image?.style ? { summary: v.image.style } : undefined,
            imageUrl: v.image?.url ?? null,
            imageStatus: v.image?.status ?? "skipped",
            // 60s/100s tier: QA result + production extras
            qa: v.qa ?? null,
            extras: v.extras ?? null,
          })),
        };
        // 2026-05-09 cleanup (CJ direction「乾淨一條路」):
        // ONE path — orchestra returns outputId → navigate to /run.
        // No setOutput fallback, no in-modal mockup. If outputId is
        // missing, that's a recordTaskRun bug — surface it loudly.
        if ((r as any).outputId) {
          const oid = (r as any).outputId;
          // 2026-05-18 (CJ「沒生成前應停留在讀秒 modal」): hold-for-images
          // tasks promise a complete post. The orchestra returns at the
          // caption_ready checkpoint (text done, image pending); instead
          // of navigating now and showing a spinner on /run, keep the
          // running countdown modal open and poll until the full post
          // (image) is done/failed, THEN navigate. 95s safety cap.
          if ((tier === "60s" || HOLD_FOR_IMAGES.has(activeTask.id)) && holdUtils?.output?.getById?.fetch) {
            const deadline = Date.now() + 95_000;
            while (Date.now() < deadline) {
              await new Promise((res) => setTimeout(res, 3000));
              try {
                const o: any = await holdUtils.output.getById.fetch({ id: oid });
                if (o?.progress && o.progress !== "caption_ready") break;
              } catch { /* transient — keep polling */ }
            }
          }
          closeTask();
          navigate(`/run/${oid}`);
          return;
        }
        // 2026-05-14 (CJ Bug#2 follow-up): more specific error UX. Three cases:
        //   (a) errors present + at least 1 caption succeeded → soft "busy" msg
        //   (b) errors present + NO caption succeeded → "this agent is dead, try another"
        //   (c) no errors, no outputId → DB write failed (specific message)
        const hasErrors = r.errors && r.errors.length > 0;
        const hasAnyCaption = (r.variants ?? []).some((v: any) => (v?.caption ?? "").trim().length > 0);
        const errorPreview = hasErrors ? r.errors.slice(0, 2).join(" · ").slice(0, 200) : "";
        setErrorMsg(
          hasErrors && !hasAnyCaption
            ? (lang === "en"
                ? `The AI specialist failed to write any content (the service may be temporarily unavailable). Try a different task. Detail: ${errorPreview}`
                : `這位 AI 專家目前無法產出文案（服務可能暫時離線）。請改試其他任務或回報客服。詳情：${errorPreview}`)
            : hasErrors
            ? (lang === "en"
                ? "AI is a bit busy — hit Make it again (usually rush-hour traffic)."
                : `AI 暫時忙不過來，再按一次「立即產出」就好（多半是熱門時段塞車）。`)
            : (lang === "en"
                ? "Captions wrote OK but persistence failed — your work isn't lost, please contact support with this task ID."
                : `文案寫出來了但沒存進資料庫（task: ${activeTask.id}），請聯絡客服貼這個 ID。`)
        );
        return;
      }
      // 2026-05-09 cleanup: legacy runQuickMut path removed.
      setErrorMsg(lang === "en"
        ? "This task isn't ready yet. Try a different one or contact support."
        : "這個任務還在開發中，請改試其他任務或聯絡客服。");
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setRunning(false);
      setCountdownStart(null);
    }
  };

  const handleCopy = () => {
    if (!output?.caption) return;
    navigator.clipboard.writeText(output.caption);
    showToastGlobal(t("toast_copied"), "success");
  };

  const mockupVariant: MockupVariant | null = useMemo(() => {
    if (!output) return null;
    const platform = (output.platform ?? "facebook") as any;
    const format = (output.post_type ?? "feed") as any;
    return { platform, format, label: `${platform}/${format}` };
  }, [output]);

  // 倒數仍對用戶承諾 30s（CJ direction 2026-05-05 — 20s 是後端的內部安全上限）
  // hold-for-images tasks wait for copy + image before leaving the modal,
  // so the countdown target is longer (else it reads "85s / 60s").
  const expectedSec =
    tier === "60s" ? 90 :
    activeTask && HOLD_FOR_IMAGES.has(activeTask.id) ? 90 :
    tier === "30s" ? 30 : 100;
  const progressPct = Math.min(100, (tickMs / (expectedSec * 1000)) * 100);

  // Tier-distinct hero metadata — user feels the difference immediately
  const tierHero = tier === "30s"
    ? {
        emoji: "⚡",
        kicker: "QUICK DRAFT",
        headline: lang === "en" ? "Make a post in 30 seconds" : "30 秒搞定一篇貼文",
        sub: lang === "en" ? "Light output · 3 caption variants · visual brief (image on demand)" : "輕量產出 · 3 個文案變體 · 風格指示（按需生圖）",
        bullets: lang === "en" ? ["3 variants", "<20s", "URL / brand voice"] : ["3 變體", "<20 秒", "URL/品牌語氣支援"],
        accent: "#00b4bc",
        gradientFrom: "rgba(0,180,188,0.10)",
      }
    : tier === "60s"
    ? {
        emoji: "🎼",
        kicker: "PRODUCTION PACKAGE",
        headline: lang === "en" ? "A full production pack in 60 seconds" : "60 秒交付一個完整套組",
        sub: lang === "en" ? "Multi-agent · 5 variants + real images + reply templates + optimal post timing + QA" : "多 AI 專家協作 · 5 版本 + 真生圖 + 留言模板 + 發文時段 + QA 審核",
        bullets: lang === "en" ? ["5 variants", "7-9 agents", "Real Flux images", "Jordan QA"] : ["5 版本", "7-9 位 AI 專家協作", "Flux 真生圖", "Jordan QA 審核"],
        accent: "#7c3aed",
        gradientFrom: "rgba(124,58,237,0.10)",
      }
    : {
        emoji: "🎯",
        kicker: "REAL SQUAD · CAMPAIGN PIPELINE",
        headline: lang === "en" ? "99s = a real multi-step AI workflow" : "99 秒任務 = 真實多步驟 AI 工作流",
        sub: lang === "en"
          ? "Click a task to enter the workspace — AI specialists hand off step by step to deliver a full calendar, launch toolkit, or crisis playbook."
          : "點擊任務後進入工作區（/picker）— 多位 AI 專家接力、按方法論交付完整月曆 / 上市工具包 / 危機劇本",
        bullets: lang === "en"
          ? ["Real multi-agent workflow", "Full methodology (Pulizzi / Cialdini / Lagadec)", "Calendar or toolkit output", "FB 11 + IG 7 plans ready"]
          : ["真實多 AI 協作流程", "完整方法論（Pulizzi / Cialdini / Lagadec）", "行事曆 / 工具包輸出", "FB 11 + IG 7 小組已就位"],
        accent: "#f59e0b",
        gradientFrom: "rgba(245,158,11,0.10)",
      };

  // Hero copy adapts to tier but the visual structure is identical to /squads
  // (eyebrow → gradient title → EntityStats → search → channel icons).
  // 2026-05-15 (CJ「標題不好念」): parallel structure, drop the redundant
  // seconds (the eyebrow + 「適合」line already carry timing/detail), one
  // consistent verb cadence: 想 + 動詞 + 名詞.
  const heroTitle = lang === "en"
    ? (tier === "30s"
        ? "What post are we writing today?"
        : tier === "60s"
        ? "What content set are we building today?"
        : "What campaign are we planning today?")
    : (tier === "30s"
        ? "今天想寫哪一篇貼文？"
        : tier === "60s"
        ? "今天想做哪一套內容？"
        : "今天想規劃哪一檔活動？");

  // 2026-05-11 (CJ「整個因果鏈在最後一公里斷掉了」): replace the tech-spec
  // EntityStats subtitle with a methodology value-prop that explicitly
  // links the previous "定位" step to the current "產出" step. Adapts:
  //   - brand has positioning → confident value-prop
  //   - brand exists but not positioned → soft nudge back to /brands
  //   - no brand selected → generic SoWork framing
  const positioningReady = useMemo(() => {
    const b: any = brandQuery?.data ?? {};
    const p: any = (scopeActiveQuery?.data as any)?.brand?.positioning ?? {};
    if (b.positioningStatus === "completed") return true;
    if (typeof b.tagline === "string" && b.tagline.trim()) return true;
    if (p.goldenCircle?.why && String(p.goldenCircle.why).trim()) return true;
    if (p.tagline?.zhTagline && String(p.tagline.zhTagline).trim()) return true;
    return false;
  }, [brandQuery?.data, scopeActiveQuery?.data]);

  // 2026-05-11 (CJ「字數儘量精簡」): trimmed subtitle copy.
  const tierKicker = lang === "en"
    ? (tier === "30s" ? "a 30-second post" : tier === "60s" ? "a 60-second production pack" : "a 99-second campaign")
    : (tier === "30s" ? "30 秒寫一件素材" : tier === "60s" ? "60 秒寫一套素材" : "99 秒企劃一個檔期");
  const heroSubtitle = !brandId
    ? (lang === "en"
        ? "Lock in who you are first so the AI knows what every post should say."
        : "先鎖定你是誰，AI 才知道每篇文章要說什麼")
    : positioningReady
      ? (lang === "en"
          ? `Using ${brandName ?? "your brand"}'s positioning as the spine — ${tierKicker}.`
          : `以 ${brandName ?? "你的品牌"} 的定位為骨架，${tierKicker}`)
      : (lang === "en"
          ? `Finish ${brandName ?? "this brand"}'s positioning first so the AI sounds like you.`
          : `先完成 ${brandName ?? "這個品牌"} 的定位，AI 產出才會像你`);

  // 2026-05-11 (CJ reviewer 反饋:「30s / 60s / 99s 的差異我看不清楚」):
  // tier-specific eyebrow + concrete "when to use" example so users
  // self-orient before clicking a task.
  const tierEyebrow = tier === "30s" ? "30S · QUICK CAPTION"
    : tier === "60s" ? "60S · PRODUCTION PACK"
    : "99S · CAMPAIGN";
  // 2026-05-11 (CJ「字數儘量精簡」): trimmed copy.
  const tierWhenToUse = lang === "en"
    ? (tier === "30s"
        ? "Daily posts · trending topics · thank-you notes · urgent updates"
        : tier === "60s"
          ? "Posts worth polishing · 5 variants + visual brief + QA"
          : "30-day calendars · launch packs · IG account repositioning")
    : (tier === "30s"
        ? "日常單篇 · 追熱點 · 客戶感謝 · 緊急發文"
        : tier === "60s"
          ? "值得打磨的單篇 · 5 變體 + 視覺指示 + 品質審核"
          : "30 天月曆 · 活動 launch 包 · IG 帳號重新定位");

  // 2026-05-14: render-time onboarding redirect — synchronous, no blank flash.
  // All hooks above have already run, so order stays stable across renders.
  if (needsOnboardingRedirect) {
    return <Navigate to="/brands" replace />;
  }

  return (
    <div>
      {/* ─── HERO (matches /squads layout) ────────────────────────────── */}
      {/* 2026-05-15 (CJ「tile 被遮住頂部」): pt-14 → pt-24. The shell's
          top chrome was clipping the eyebrow + tile row on first paint. */}
      <div className="relative pt-24 pb-10 px-6 text-center">
        <div className="relative z-10 flex flex-col items-center text-center max-w-[1100px] mx-auto">
          {/* Three lines above search: eyebrow / gradient title / stats */}
          <div className="mb-6 w-full">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-default-600 mb-3">
              {tierEyebrow}
            </p>
            <h1
              className="font-semibold tracking-tight leading-tight text-center"
              style={{
                fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
                background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {heroTitle}
            </h1>
            {/* Methodology value-prop (closes the 定位 → 產出 loop). */}
            <p
              className="mt-3 mx-auto text-default-700"
              style={{
                fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
                fontStyle: "italic",
                fontSize: 14,
                lineHeight: 1.7,
                maxWidth: 640,
              }}
            >
              {heroSubtitle}
              {brandId && !positioningReady && (
                <>
                  {" "}
                  <a
                    href={`/brands/edit?b=${brandId}`}
                    style={{
                      color: "#171717", textDecoration: "underline",
                      fontStyle: "normal", fontWeight: 600,
                    }}
                  >
                    {lang === "en" ? "Finish positioning →" : "去完成定位 →"}
                  </a>
                </>
              )}
            </p>

            {/* 2026-05-11 — concrete "when to use" line so users self-route
                between 30s / 60s / 99s before clicking. Reviewer:
                「30s / 60s / 99s 的差異我看不清楚」. Sans-serif (utility),
                small + neutral so it sits as supplementary metadata. */}
            <p
              className="mt-2 mx-auto text-default-700"
              style={{
                fontSize: 12, lineHeight: 1.55, maxWidth: 640,
                letterSpacing: "0.02em",
              }}
            >
              <span style={{ fontWeight: 600, color: "#171717", marginRight: 6 }}>
                {lang === "en" ? "Best for:" : "適合："}
              </span>
              {tierWhenToUse}
            </p>
          </div>

          {/* Search bar — matches /squads sizing */}
          <div className="w-full" style={{ maxWidth: 800 }}>
            <Input
              size="lg"
              radius="lg"
              variant="flat"
              placeholder={lang === "en" ? "Search tasks, platforms, or keywords…" : "搜尋任務、平台或關鍵字…"}
              value={searchQuery}
              onValueChange={setSearchQuery}
              isClearable
              onClear={() => setSearchQuery("")}
              startContent={
                <FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400 shrink-0" style={{ fontSize: 18 }} />
              }
              classNames={{
                base: "overflow-hidden rounded-[20px]",
                inputWrapper: "h-16 bg-white shadow-md border border-default-100 rounded-[20px] data-[focus=true]:shadow-lg",
                input: "text-medium",
              }}
            />
          </div>

          {/* Channel icon row — circle tiles, /squads style */}
          <div className="mt-6 w-full overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <div className="flex items-start gap-3 w-max mx-auto px-2">
              {CHANNEL_TILES.map((c) => {
                const active = channel === c.id;
                const disabled = !c.enabled;
                return (
                  <button
                    key={c.id}
                    onClick={() => c.enabled && setChannel(c.id)}
                    disabled={disabled}
                    className={`flex flex-col items-center gap-1.5 shrink-0 transition ${disabled ? "opacity-30 cursor-not-allowed" : "hover:scale-105 cursor-pointer"}`}
                  >
                    <div
                      className={`w-14 h-14 rounded-full flex items-center justify-center text-white ${active ? "ring-4 ring-default-300" : "shadow-sm"}`}
                      style={{ background: c.bg }}
                    >
                      <FontAwesomeIcon icon={c.icon} className="text-xl" />
                    </div>
                    <span className={`text-tiny ${active ? "font-semibold text-default-900" : "text-default-600"}`}>
                      {lang === "en" ? (CHANNEL_EN_LABEL[c.id] ?? c.label) : c.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tiny tier signature — kept so the page identifies itself, but
              tucked under the channel row so it doesn't dominate. */}
          <div className="mt-4 flex items-center gap-2 text-tiny text-default-400">
            <span
              className="px-2 py-0.5 rounded-full text-white font-semibold tracking-widest"
              style={{ background: tierHero.accent, fontSize: 9, letterSpacing: "0.15em" }}
            >
              {tierHero.kicker}
            </span>
            <span>·</span>
            <span>{lang === "en" ? `${tasksThisTier.length} ${tierLabel} tasks` : `${tasksThisTier.length} 個 ${tierLabel} 任務`}</span>
            <span>·</span>
            <span>{lang === "en" ? "Brand:" : "品牌腦："}<span className="font-medium text-default-700">{brandName ?? (lang === "en" ? "(none picked)" : "（未選）")}</span></span>
          </div>
        </div>
      </div>

      {/* ─── Catalog ───────────────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-6 pb-20">
        {tasksThisTier.length === 0 ? (
          <Card>
            <CardBody className="text-center text-default-500 py-12">
              <FontAwesomeIcon icon={faBolt} className="text-3xl mb-2 text-default-300" />
              <p className="font-semibold mb-1">{lang === "en" ? `${tierLabel} tasks in the works` : `${tierLabel} 任務製作中`}</p>
              <p className="text-tiny text-default-400">
                {tier === "60s" && (lang === "en" ? "60-second tasks (with full visual brief) launch next wave." : "60 秒任務（含完整視覺指示）將於下一波上線")}
                {tier === "99s" && (lang === "en" ? "99s: real-data validation + video generation (Phase 3 rolling out)" : "99 秒：含真實數據驗證 + 影片生成（Phase 3 啟用中）")}
                {tier === "30s" && (lang === "en" ? "Hang tight — your AI specialists are warming up." : "請稍候，AI 專家準備中")}
              </p>
            </CardBody>
          </Card>
        ) : visibleTasks.length === 0 ? (
          <Card>
            <CardBody className="text-center text-default-500 py-12">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-2xl mb-2 text-default-300" />
              <p>
                {!["facebook","instagram","youtube","tiktok","linkedin","email","pr","brand","audience","all"].includes(channel)
                  ? (lang === "en"
                      ? `No ${(CHANNEL_EN_LABEL[channel] ?? CHANNEL_TILES.find((c) => c.id === channel)?.label)} ${tierLabel} tasks yet — more coming soon.`
                      : `${CHANNEL_TILES.find((c) => c.id === channel)?.label} 通路的 ${tierLabel} 任務製作中…`)
                  : (lang === "en"
                      ? `No tasks match "${searchQuery}"`
                      : `沒有匹配 "${searchQuery}" 的任務`)}
              </p>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight">{lang === "en" ? "Featured tasks" : "精選任務"}</h2>
                <p className="text-tiny text-default-400 mt-0.5">{lang === "en" ? "Tap to make — answer one quick question first." : "按下即產出，先回答 1 個關鍵問題"}</p>
              </div>
              <Chip size="sm" variant="flat" color="secondary">{lang === "en" ? `${visibleTasks.length} tasks` : `${visibleTasks.length} 件`}</Chip>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleTasks.map((t, idx) => {
                const pal = CARD_PALETTES[idx % CARD_PALETTES.length];
                const agentName = t.agent?.name ?? "AI Agent";
                const avatarSrc = t.agent?.avatarUrl || dicebear(agentName);
                  return (
                    <button
                      key={t.id}
                      onClick={() => openTask(t)}
                      className="flex flex-col rounded-2xl overflow-hidden text-left transition hover:scale-[1.02] hover:shadow-lg"
                      style={{ border: "1px solid rgba(0,0,0,0.07)", background: "white" }}
                    >
                      {/* Top — gradient bg + agent avatar centered */}
                      <div
                        className="flex items-center justify-center relative"
                        style={{ height: 130, background: `linear-gradient(135deg, ${pal.from} 0%, ${pal.to} 100%)` }}
                      >
                        <Avatar
                          src={avatarSrc}
                          size="lg"
                          isBordered
                          color="default"
                          className="w-20 h-20 ring-2 ring-white/60"
                        />
                        <span
                          className="absolute top-2 right-2 text-tiny font-semibold px-2 py-0.5 rounded-full text-white shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${tierAccent(tier)}, ${tierAccent(tier)}cc)` }}
                        >
                          {tierBadge}
                        </span>
                      </div>
                      {/* Card info */}
                      <div className="p-3 flex flex-col gap-1 flex-1">
                        <p className="text-small font-semibold leading-tight line-clamp-2">{lang === "en" ? (t.label_en ?? TASK_LABEL_EN_CLIENT[t.id] ?? t.label) : t.label}</p>
                        <p className="text-tiny text-default-500 line-clamp-2">{lang === "en" ? (TASK_DESC_EN_CLIENT[t.id] ?? t.description) : t.description}</p>
                        {(t as any).methodology && (
                          <span className="text-[10px] text-default-400 italic">📚 {(t as any).methodology}</span>
                        )}
                        <div className="mt-auto pt-2 flex items-center gap-2 border-t border-default-100">
                          <Avatar src={avatarSrc} size="sm" className="w-5 h-5" />
                          <span className="text-tiny font-medium text-default-700 truncate">
                            {agentName}
                          </span>
                        </div>
                        {/* 60s tier: show full collab team avatar stack + count */}
                        {(t as any).team && (t as any).team.length > 1 && (
                          <div className="flex items-center gap-1.5 -mt-1">
                            <div className="flex -space-x-2">
                              {((t as any).team as Array<{id:number;name:string;avatarUrl:string|null}>)
                                .slice(0, 5)
                                .map((m) => (
                                  <Avatar
                                    key={m.id}
                                    src={m.avatarUrl || dicebear(m.name)}
                                    size="sm"
                                    className="w-5 h-5 ring-1 ring-white"
                                    title={m.name}
                                  />
                                ))}
                            </div>
                            <span className="text-[10px] text-default-500">
                              +{Math.max(0, (t as any).team.length - 5)} · {lang === "en" ? `${(t as any).team.length} collaborators` : `${(t as any).team.length} 位協作`}
                            </span>
                          </div>
                        )}
                        {t.skill_slug && (
                          <Chip size="sm" variant="flat" className="self-start text-[10px]">
                            {t.skill_slug}
                          </Chip>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

      {/* ─── Modal: intake question + running countdown ONLY.
          2026-05-09 cleanup (CJ「乾淨一條路」): output viewing moved
          permanently to /run/:outputId. Modal is just the intake gate. */}
      <Modal
        isOpen={!!activeTask}
        onClose={closeTask}
        size="2xl"
        scrollBehavior="inside"
        backdrop="blur"
        classNames={{
          base: "max-h-[90vh]",
          body: "py-3 px-4",
          footer: "border-t border-default-100 bg-white py-2 px-4",
          header: "py-2 px-3 bg-white border-b border-default-100",
          closeButton: "text-default-400 hover:bg-default-100",
        }}
      >
        <ModalContent>
          {activeTask && (
            <>
              {/* Canva-style modal header: title HIDDEN by default (only tooltip on hover);
                  primary visual is the asset. Show only tiny task name + tier chip + ✕. */}
              <ModalHeader className="flex flex-col items-stretch gap-0 py-2 px-3 border-b border-default-100">
                {/* 2026-05-11 — bilingual title: EN eyebrow (uppercase tracking)
                    + ZH main line. When `label` is structured { en, zh } both
                    parts stay semantically synced (no more "User Research 競品..."
                    drift). Falls back to single legacy label. */}
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="min-w-0 flex-1 group cursor-default"
                    title={activeTask.agent ? `${activeTask.label_zh ?? activeTask.label} · ${activeTask.agent.name}（${activeTask.agent.title}）` : (activeTask.label_zh ?? activeTask.label)}
                  >
                    <p className="text-[12px] text-default-800 truncate font-medium">
                      {lang === "en"
                        ? (activeTask.label_en ?? TASK_LABEL_EN_CLIENT[activeTask.id] ?? activeTask.label)
                        : (activeTask.label_zh ?? activeTask.label)}
                      {activeTask.agent && <span className="text-default-500 ml-2 font-normal">· {activeTask.agent.name}</span>}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full text-white shadow-sm shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${tierAccent(tier)}, ${tierAccent(tier)}cc)`,
                    }}
                  >
                    {tierBadge}
                  </span>
                </div>
              </ModalHeader>
              <ModalBody>
                {/* 2026-05-09 cleanup: only intake mode; output viewing at /run/:outputId */}
                <>
                    {/* 2026-05-08 (CJ test report #3): prompt user to set
                        brand voice/words BEFORE running, so output isn't
                        generic. Only shows when all 4 core text assets
                        (voice / principles / preferred / banned) are empty. */}
                    {textAssetsEmpty && brandId && (
                      <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">💡</span>
                        <div className="flex-1 leading-relaxed">
                          {lang === "en" ? (
                            <>
                              <span className="font-medium">This brand's word assets are empty.</span>
                              {" "}Pop into{" "}
                              <a
                                href={`/brands?b=${brandId}&cat=copy`}
                                target="_blank"
                                rel="noreferrer"
                                className="underline font-medium hover:text-amber-700"
                              >
                                Brand → Words
                              </a>
                              {" "}and click Auto-fill to set tone and vocabulary. Output will be far more on-brand. (It'll still run without, but results will be generic.)
                            </>
                          ) : (
                            <>
                              <span className="font-medium">這個品牌的「文字」資產還是空的。</span>
                              {" "}先到{" "}
                              <a
                                href={`/brands?b=${brandId}&cat=copy`}
                                target="_blank"
                                rel="noreferrer"
                                className="underline font-medium hover:text-amber-700"
                              >
                                品牌 → 文字
                              </a>
                              {" "}按「自動填寫」設好口吻 / 禁用詞，AI 產出會明顯貼合品牌語氣（不填也能跑，但結果會比較通用）。
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 2026-05-11 — context confirmation strip. ALWAYS shown
                        when brand context exists, so the user feels their
                        positioning is actively in play. If the task declares
                        explicit contextSources we use them; otherwise we
                        fall back to a default set drawn from the universal
                        SoWork positioning fields (Voice / 受眾 / 禁忌詞 /
                        WHY) — every task implicitly reads these via brand
                        prefix injection, so showing them is honest. */}
                    {(() => {
                      const DEFAULT_SOURCES = [
                        "brand.name",
                        "brand.positioning.audience.primary",
                        "brand.positioning.voice.archetypes",
                        "brand.positioning.voice.tone",
                        "brand.positioning.voice.forbidden",
                        "brand.positioning.goldenCircle.why",
                      ];
                      const sources = (activeTask.contextSources && activeTask.contextSources.length > 0)
                        ? activeTask.contextSources
                        : DEFAULT_SOURCES;
                      const chips = brandCtx ? buildContextChips(brandCtx, sources) : [];
                      // Only render when at least one chip has real content —
                      // hides the strip cleanly for brand-less / unpositioned cases.
                      const anyContent = chips.some((c) => c.hasContent);
                      if (!anyContent) return null;
                      return (
                        <div
                          className="mb-3 rounded-lg px-3 py-2.5"
                          style={{ background: "#FAFAF9", border: "1px solid #171717" }}
                        >
                          <p
                            style={{
                              fontSize: 9, fontWeight: 700, color: "#525252",
                              letterSpacing: "0.22em", textTransform: "uppercase",
                              marginBottom: 6,
                            }}
                          >
                            {lang === "en"
                              ? `Context · pulling these from ${brandName ?? "your brand"} for this task`
                              : `Context · 我會用 ${brandName ?? "你的品牌"} 的這些資料來跑這個任務`}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {chips.filter((c) => c.hasContent).map((c, i) => (
                              <span
                                key={i}
                                title={c.source}
                                style={{
                                  fontSize: 11, padding: "3px 8px",
                                  borderRadius: 4,
                                  background: "#171717",
                                  color: "#FFFFFF",
                                  fontWeight: 500,
                                }}
                              >
                                {c.label}
                              </span>
                            ))}
                            {/* Missing fields shown as dashed chips so user
                                can see what's still incomplete and improve it. */}
                            {chips.filter((c) => !c.hasContent).slice(0, 3).map((c, i) => (
                              <span
                                key={`m${i}`}
                                title={c.source + (lang === "en" ? " (not filled in yet)" : " (尚未填寫)")}
                                style={{
                                  fontSize: 11, padding: "3px 8px",
                                  borderRadius: 4,
                                  background: "transparent",
                                  color: "#A3A3A3",
                                  border: "1px dashed #D4D4D4",
                                }}
                              >
                                {c.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Primary question */}
                    {activeTask.primary_input && (
                      <div className="space-y-2">
                        <p className="text-small font-medium">{activeTask.primary_question}</p>
                        {activeTask.primary_input.type === "textarea" ? (
                          <Textarea
                            placeholder={activeTask.primary_input.placeholder ?? ""}
                            value={primaryAnswer}
                            onChange={(e) => setPrimaryAnswer(e.target.value)}
                            minRows={3}
                            autoFocus
                          />
                        ) : (
                          <Input
                            placeholder={activeTask.primary_input.placeholder ?? ""}
                            value={primaryAnswer}
                            onChange={(e) => setPrimaryAnswer(e.target.value)}
                            autoFocus
                          />
                        )}
                        {/* 2026-05-18 (CJ): optional AI polish — rewrites
                            the brief in place so the executing agent gets
                            a clearer input. Never fabricates facts. */}
                        {polishInputMut && !running && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="flat"
                              color="secondary"
                              isLoading={polishing}
                              isDisabled={polishing || !primaryAnswer.trim()}
                              onPress={handlePolish}
                              startContent={!polishing && <FontAwesomeIcon icon={faWandMagicSparkles} />}
                            >
                              {polishing
                                ? (lang === "en" ? "Polishing…" : "潤稿中…")
                                : (lang === "en" ? "AI polish my brief" : "✨ AI 潤稿")}
                            </Button>
                            <span className="text-tiny text-default-400">
                              {lang === "en"
                                ? "Tidies your input — facts kept, never invented. You can still edit."
                                : "幫你整理輸入（保留事實、不會捏造），潤完仍可自行修改"}
                            </span>
                          </div>
                        )}
                        {polishErr && (
                          <p className="text-tiny text-danger-500">{polishErr}</p>
                        )}
                      </div>
                    )}

                    {/* 2026-05-08 (CJ): unified running view across tiers —
                        small Notion-style card with concentric-ring agent
                        avatar that rotates through the team (60s/100s). The
                        previous separate paths (30s spinner / 60s 100s pipeline
                        grid) made the small modal feel inconsistent. */}
                    {running && (() => {
                      const stagesNow =
                        orchestraStages && orchestraStages.length > 0
                          ? orchestraStages
                          : synthesizeStages(tickMs, tier, lang);
                      // 2026-05-18 (CJ「60s 任務 modal 顯示 90s 看起來錯亂」):
                      // 60s tasks now wait for copy + image before leaving
                      // the modal, so a hard "/90s" contradicts the 60s
                      // tier label and looks broken. For 60s show elapsed
                      // + a phase note (no misleading denominator); other
                      // tiers keep the "x / Ns" form.
                      // 2026-05-18 (CJ「99S modal 讀秒 100 秒」): 60s/99s
                      // are multi-stage (策略→文案→出圖→配套) and run
                      // longer than the tier name — a hard "x / 100s"
                      // looks broken. Show elapsed + a phase note instead.
                      const elapsedText =
                        (tier === "60s" || tier === "99s")
                          ? `${(tickMs / 1000).toFixed(0)}s · ${lang === "en" ? "researching → writing → rendering" : "策略 → 文案 → 出圖中"}`
                          : `${(tickMs / 1000).toFixed(1)}s / ${expectedSec}s`;
                      const accent = tierAccent(tier);

                      // Build agent roster: caption_writer first, then
                      // image_director (60s+), then specialty (100s).
                      const agentRoster: Array<{ id?: number; name: string; title?: string; avatarUrl?: string | null; role?: string }> = [];
                      const cap = agentMeta ?? activeTask.agent;
                      if (cap) agentRoster.push({ id: cap.id, name: cap.name, title: cap.title, avatarUrl: cap.avatarUrl, role: lang === "en" ? "Writing caption" : "撰寫文案" });
                      if (imageAgentMeta) agentRoster.push({ id: imageAgentMeta.id, name: imageAgentMeta.name, title: imageAgentMeta.title, avatarUrl: imageAgentMeta.avatarUrl, role: lang === "en" ? "Visual direction" : "視覺方向" });

                      return (
                        <RunningAgentCarousel
                          agents={agentRoster.length > 0 ? agentRoster : [{ name: "Agent", role: lang === "en" ? "Working" : "處理中" }]}
                          stages={stagesNow}
                          accentColor={accent}
                          progressPct={progressPct}
                          elapsedText={elapsedText}
                        />
                      );
                    })()}

                    {errorMsg && (
                      <Card className="bg-warning-50 border border-warning-200 mt-4">
                        <CardBody className="text-warning-800 text-small">{errorMsg}</CardBody>
                      </Card>
                    )}
                </>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={closeTask} startContent={<FontAwesomeIcon icon={faXmark} />}>
                  {t("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleRun}
                  isLoading={running}
                  isDisabled={running}
                  startContent={!running && <FontAwesomeIcon icon={faPaperPlane} />}
                >
                  {running ? t("qt_run_busy") : t("qt_run_btn")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 2026-05-14 (CJ revised「歷史任務應該都歸屬到專案」): individual
          tier pages don't need RecentRunsTile — /projects is the
          canonical history view. Less duplication, clearer mental model. */}
    </div>
  );
}

/** Default export wraps the page in a tier-aware error boundary so a
 *  runtime crash shows a visible error panel (not a white screen). */
export default function QuickTask30sPage({ tier = "30s" }: { tier?: Tier }) {
  return (
    <TierPageErrorBoundary tier={tier}>
      <QuickTask30sPageInner tier={tier} />
    </TierPageErrorBoundary>
  );
}

/* ──────────────────────────── Output Carousel ────────────────────────────
 * Each variant becomes its own complete mockup. Left/right chevrons swap
 * between them. Style direction shows INSIDE each mockup's image slot.
 *
 * If output has 0 variants (just top-level caption), shows a single mockup.
 */
/** SavePanel — picks a project to attach the current variant to.
 *  Lists user's projects (via trpc.project.list if available) + 「新增專案」.
 *  Falls back to a placeholder message when projects API isn't wired yet. */
function SavePanel({ slide, accent, onClose }: {
  slide: any;
  pageTier: "30s" | "60s" | "99s";
  accent: string;
  brandId: number | null;
  onClose: () => void;
}) {
  const listQuery = (trpc as any).project?.list?.useQuery
    ? (trpc as any).project.list.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: null, isLoading: false };
  const { lang } = useLang();
  const projects: any[] = listQuery.data ?? [];
  const projectsAvailable = (trpc as any).project?.list?.useQuery != null;
  const [savedProjectId, setSavedProjectId] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {!projectsAvailable && (
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-tiny text-warning-800">
          <p className="font-semibold mb-1">{lang === "en" ? "Projects coming soon" : "專案功能正在接後端"}</p>
          <p>{lang === "en" ? "For now, hit Copy to grab the caption. Project picker shows up once the API is live." : "目前可以先用「複製文案」帶到你自己的文件。專案 API 上線後此處就會顯示專案清單。"}</p>
        </div>
      )}
      {projectsAvailable && (
        <>
          <p className="text-[10px] text-default-500">{lang === "en" ? "Pick a project to save this version's caption + visual brief:" : "挑一個專案，把這個版本的文案 + 視覺指示存進去："}</p>
          {projects.length === 0 && !listQuery.isLoading && (
            <p className="text-tiny text-default-400 italic py-3 text-center">{lang === "en" ? "No projects yet" : "尚未建立專案"}</p>
          )}
          <div className="space-y-1">
            {projects.map((p: any) => (
              <button
                key={p.id}
                onClick={() => {
                  // TODO: call project.attachOutput mutation when available
                  setSavedProjectId(p.id);
                  setTimeout(onClose, 1200);
                }}
                disabled={savedProjectId === p.id}
                className={`w-full flex items-center gap-2 p-2 rounded-lg border transition text-left ${
                  savedProjectId === p.id
                    ? "border-success-300 bg-success-50"
                    : "border-default-200 hover:bg-default-50"
                }`}
              >
                <span className="w-7 h-7 rounded-md flex items-center justify-center text-tiny font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
                  {p.name?.charAt(0) ?? "P"}
                </span>
                <span className="flex-1 min-w-0 truncate text-tiny font-semibold text-default-800">{p.name}</span>
                {savedProjectId === p.id && <span className="text-success-600 text-tiny">{lang === "en" ? "✓ Saved" : "✓ 已存"}</span>}
              </button>
            ))}
          </div>
        </>
      )}
      <Button
        size="sm"
        variant="flat"
        className="w-full"
        startContent={<FontAwesomeIcon icon={faFolderPlus} />}
        onPress={() => { window.location.href = "/projects"; }}
      >
        {lang === "en" ? "New project" : "新增專案"}
      </Button>
    </div>
  );
}

function OutputCarousel({
  output, activeTask, pageTier, brandName, brandId, brandLogoUrl, onBrandLogoUpdated,
  mockupVariant, latencyMs, agentMeta, imageAgentMeta, orchestraStages, fetchedUrl, errorMsg,
  onClose, onRedo,
}: {
  output: any;
  activeTask: FBTaskCard;
  /** Page-level tier ("30s" / "60s" / "99s") — drives ALL visual tier identity
   *  (chip color, gradient, accordion availability), independent of the
   *  task's data tier (FB60V2 tasks always have tier="60s" but appear on
   *  both /60s and /100s pages — visual tier follows page, not data). */
  pageTier: "30s" | "60s" | "99s";
  brandName: string | null;
  brandId: number | null;
  brandLogoUrl: string | null;
  onBrandLogoUpdated?: () => void;
  mockupVariant: MockupVariant | null;
  latencyMs: number | null;
  agentMeta: any;
  imageAgentMeta?: any;
  orchestraStages?: any[] | null;
  fetchedUrl: { url: string; title: string | null; chars: number; og?: { image: string | null; title: string | null; description: string | null; site_name: string | null; domain: string } } | null;
  errorMsg: string | null;
  /** 2026-05-08: close + redo controls relocated from ModalFooter into the floating toolbar. */
  onClose?: () => void;
  onRedo?: () => void;
}) {
  const { t, lang } = useLang();
  // Build the slide list. Plan B (orchestra) returns variants[] already as
  // the authoritative slide list — no separate "main"; first variant IS the
  // main. Legacy runQuick path uses [main, ...variants] as before.
  const slides: Array<{
    label: string; caption: string; hashtags?: string[]; imageStyle?: string;
    imageUrl?: string | null; imageStatus?: "ready" | "failed" | "skipped" | "timeout";
    qa?: { status: "pass" | "flag"; comment?: string; score?: number; suggestions?: string[] } | null;
    extras?: {
      postingTime?: string;
      replyTemplates?: Array<{ userSays: string; yourReply: string }>;
      followupPost?: string;
      compareTable?: string;
      timingAdvice?: string;
      legalCheck?: string;
    } | null;
  }> = useMemo(() => {
    const topStyle = output.image_style_direction?.summary;
    const orchestraMode = (output.variants ?? []).some((v: any) => v.imageUrl !== undefined || v.imageStatus !== undefined);
    if (orchestraMode) {
      return (output.variants ?? []).map((v: any, i: number) => ({
        label: v.label || (lang === "en" ? `Version ${i + 1}` : `版本 ${i + 1}`),
        caption: v.caption ?? "",
        hashtags: v.hashtags ?? [],
        imageStyle: v.image_style_direction?.summary || topStyle,
        imageUrl: v.imageUrl ?? null,
        imageStatus: v.imageStatus ?? "skipped",
        qa: v.qa ?? null,
        extras: v.extras ?? null,
      }));
    }
    // Legacy path
    const main = {
      label: lang === "en" ? "Main version" : "主版本",
      caption: output.caption ?? "",
      hashtags: output.hashtags ?? [],
      imageStyle: topStyle,
    };
    const vars = (output.variants ?? []).map((v: any, i: number) => ({
      label: v.label || (lang === "en" ? `Version ${i + 2}` : `版本 ${i + 2}`),
      caption: v.caption ?? "",
      hashtags: v.hashtags ?? output.hashtags ?? [],
      imageStyle: v.image_style_direction?.summary || topStyle,
    }));
    return [main, ...vars];
  }, [output]);

  const [idx, setIdx] = useState(0);
  const total = slides.length;
  const [mediaGenOpen, setMediaGenOpen] = useState(false);
  // Per-slide image overrides — set when MediaGenFlow finishes generating.
  // { [slideIdx]: imageUrl } merged on top of slide.imageUrl from orchestra.
  const [imageOverrides, setImageOverrides] = useState<Record<number, string>>({});
  const [fbLogoModalOpen, setFbLogoModalOpen] = useState(false);
  const [fbHandle, setFbHandle] = useState("");
  const [fbBusy, setFbBusy] = useState(false);
  const [fbErr, setFbErr] = useState<string | null>(null);
  const fetchFbAvatarMut = (trpc as any).brand?.fetchFacebookAvatar?.useMutation();
  const onSubmitFbHandle = async () => {
    if (!brandId) return;
    if (!fbHandle.trim()) { setFbErr(lang === "en" ? "Paste your Facebook page URL or handle" : "請輸入 FB 粉專網址或 handle"); return; }
    setFbBusy(true); setFbErr(null);
    try {
      await fetchFbAvatarMut.mutateAsync({ brandId, handleOrUrl: fbHandle.trim() });
      onBrandLogoUpdated?.();
      setFbLogoModalOpen(false);
      setFbHandle("");
    } catch (e: any) {
      setFbErr(e?.message ?? String(e));
    } finally { setFbBusy(false); }
  };
  // Per-slide caption edits (keyed by slide index). Empty = use original.
  const [edits, setEdits] = useState<Record<number, string>>({});
  const baseSlide = slides[idx];
  const slide = baseSlide
    ? {
        ...baseSlide,
        caption: edits[idx] ?? baseSlide.caption,
        imageUrl: imageOverrides[idx] ?? baseSlide.imageUrl,
        imageStatus: imageOverrides[idx] ? "ready" as const : baseSlide.imageStatus,
      }
    : baseSlide;
  const isEdited = edits[idx] != null && edits[idx] !== baseSlide?.caption;

  // Canva-style modal state. Single activeTool drives the right panel content.
  // null = no panel (mockup max width); other values toggle a context-sensitive
  // drawer to the right (edit / style / video / details / prompt).
  type ToolKind = null | "edit" | "style" | "video" | "details" | "prompt" | "chat" | "save";
  const [activeTool, setActiveTool] = useState<ToolKind>(null);
  // Image gen flow inline state — 3 steps: brief → confirm prompt → generate
  const [imageStep, setImageStep] = useState<"brief" | "prompt">("brief");
  const [editablePrompt, setEditablePrompt] = useState("");
  const [imageModel, setImageModel] = useState<"piapi/flux-schnell" | "piapi/flux-pro" | "openai/gpt-image-1" | "google/imagen-3">("piapi/flux-schnell");
  // Video gen flow — mirrors image gen
  const [videoStep, setVideoStep] = useState<"brief" | "prompt">("brief");
  const [editableVideoPrompt, setEditableVideoPrompt] = useState("");
  const [videoModel, setVideoModel] = useState<"hailuo/t2v" | "piapi/kling-v2-master">("hailuo/t2v");
  // Agents: clicking an avatar in toolbar opens a popover showing that agent's contribution
  const [openAgentPopover, setOpenAgentPopover] = useState<number | null>(null);
  // Inline image / video gen — generates directly in the right panel,
  // no MediaGenFlow modal popup (per CJ direction).
  const [imageGenStatus, setImageGenStatus] = useState<"idle" | "generating" | "ready" | "failed">("idle");
  const [imageGenError, setImageGenError] = useState<string | null>(null);
  const [videoGenStatus, setVideoGenStatus] = useState<"idle" | "generating" | "ready" | "failed" | "submitted">("idle");
  const [videoGenError, setVideoGenError] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const mediaGenerateMut = (trpc as any).media?.generate?.useMutation();
  const handleInlineImageGen = async () => {
    if (!editablePrompt.trim() || !mediaGenerateMut) return;
    setImageGenStatus("generating");
    setImageGenError(null);
    try {
      const r = await mediaGenerateMut.mutateAsync({
        kind: "image",
        modelId: imageModel,
        promptEn: editablePrompt,
        brandId: brandId ?? null,
        aspectRatio: "1:1" as const,
        quality: "medium" as const,
      });
      if (r?.ok && r.url) {
        setImageOverrides((o) => ({ ...o, [idx]: r.url }));
        setImageGenStatus("ready");
      } else {
        setImageGenStatus("failed");
        setImageGenError(r?.message ?? (lang === "en" ? "Couldn't make it" : "生成失敗"));
      }
    } catch (e: any) {
      setImageGenStatus("failed");
      setImageGenError(e?.message ?? String(e));
    }
  };
  const handleInlineVideoGen = async () => {
    if (!editableVideoPrompt.trim() || !mediaGenerateMut) return;
    setVideoGenStatus("generating");
    setVideoGenError(null);
    setGeneratedVideoUrl(null);
    try {
      const r = await mediaGenerateMut.mutateAsync({
        kind: "video",
        modelId: videoModel,
        promptEn: editableVideoPrompt,
        brandId: brandId ?? null,
        aspectRatio: "9:16" as const,
      });
      if (r?.ok && r.url) {
        setGeneratedVideoUrl(r.url);
        setVideoGenStatus("ready");
      } else if (r?.status === "submitted") {
        setVideoGenStatus("submitted");
        setVideoGenError(lang === "en" ? "Video is rendering in the background (60-180s). Hang tight." : "影片在背景生成中（60-180 秒），請耐心等候。");
      } else {
        setVideoGenStatus("failed");
        setVideoGenError(r?.message ?? (lang === "en" ? "Couldn't make it" : "生成失敗"));
      }
    } catch (e: any) {
      setVideoGenStatus("failed");
      setVideoGenError(e?.message ?? String(e));
    }
  };
  // AI chat panel state — replaces 換語氣
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; content: string; rewritten?: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const refineCaptionMut = (trpc as any).quickTask?.refineCaption?.useMutation();
  const handleChatSend = async () => {
    if (!chatInput.trim() || !slide?.caption || chatBusy) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatHistory((h) => [...h, { role: "user", content: userMsg }]);
    setChatBusy(true);
    try {
      const r = await refineCaptionMut?.mutateAsync({
        currentCaption: slide.caption,
        userFeedback: userMsg,
        agentName: agentMeta?.name,
        agentTitle: agentMeta?.title,
        brandId: brandId ?? undefined,
        history: chatHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      });
      if (r?.ok && r.rewritten) {
        setChatHistory((h) => [...h, {
          role: "assistant",
          content: r.explanation || (lang === "en" ? `Here's a rewrite based on your note:` : `根據你的意見改寫：`),
          rewritten: r.rewritten,
        }]);
      } else {
        setChatHistory((h) => [...h, { role: "assistant", content: lang === "en" ? `(Didn't work: ${r?.error ?? "unknown error"})` : `（沒寫成功：${r?.error ?? "未知錯誤"}）` }]);
      }
    } catch (e: any) {
      setChatHistory((h) => [...h, { role: "assistant", content: lang === "en" ? `(Error: ${e?.message ?? e})` : `（出錯：${e?.message ?? e}）` }]);
    } finally {
      setChatBusy(false);
    }
  };
  const stageCount = orchestraStages?.length ?? 0;
  const doneStages = orchestraStages?.filter((s: any) => s.status === "done").length ?? 0;
  const hasDetails = !!(slide?.qa?.comment || slide?.extras || (orchestraStages && orchestraStages.length > 0) || fetchedUrl);
  const toggleTool = (t: ToolKind) => setActiveTool((cur) => (cur === t ? null : t));

  // Tool rail button — icon-only, Canva-style. Active = tier-color gradient.
  // ToolBtn accepts either a FontAwesome icon (legacy) or a Lucide React component.
  // Pass `lucide={Pencil}` for Lucide outline (Notion-style); `icon={faPenNib}` for legacy FA.
  const ToolBtn = ({ icon, lucide: LucideIcon, label, active, onPress, disabled }: {
    icon?: any;
    lucide?: any;
    label: string;
    active?: boolean;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button
      onClick={onPress}
      disabled={disabled}
      title={label}
      // 2026-05-08 (CJ): toolbar 縮一半 — 40px → 28px button + smaller icon.
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition relative ${
        disabled ? "opacity-30 cursor-not-allowed"
          : active ? "shadow-md text-white scale-105"
          : "text-default-600 hover:bg-default-100 hover:scale-105"
      }`}
      style={active && !disabled ? { background: `linear-gradient(135deg, ${tierAccent(pageTier)}, ${tierAccent(pageTier)}cc)` } : undefined}
    >
      {LucideIcon ? (
        <LucideIcon size={14} strokeWidth={1.8} />
      ) : (
        <FontAwesomeIcon icon={icon} className="text-tiny" />
      )}
    </button>
  );

  return (
    <div className="space-y-2">
      {/* (Minimal info strip removed — redundant with toolbar latency token + 👥 agents button) */}

      {!slide.caption && (
        <Card className="bg-warning-50 border border-warning-200">
          <CardBody className="text-warning-800 text-tiny py-2 px-3">
            {lang === "en"
              ? `This version (${slide.label}) didn't get any text from the LLM. Check the other versions or hit Redo.`
              : `這個版本（${slide.label}）LLM 沒生出文字，先看其他版本，或按「重做」。`}
          </CardBody>
        </Card>
      )}

      {/* ═══ FLOATING TOOLBAR — Notion-style Lucide outline icons ═══
          Group A (修改文案): 編輯 / AI 對話 / AI 生圖 / AI 生影片
          ── divider ──
          Group B (Agent 頭像): toolbar 直接顯示頭像 — 點頭像 popover
          ── divider ──
          Group C (看細節): 視覺方向 / QA / Production
          ── divider ──
          Group D (拿走): 複製 / 儲存到專案  */}
      {/* 2026-05-08 (CJ): toolbar 縮一半 — px 2→1, py 1.5→0.5; ToolBtn
          inner sizing trimmed (handled by ToolBtn comp css). 關閉 / 重做
          now live in this toolbar (Group E) instead of ModalFooter. */}
      <div className="sticky top-1 z-30 flex justify-center pointer-events-none mb-1">
        <div className="pointer-events-auto inline-flex items-center gap-0.5 bg-white border border-default-200 rounded-full shadow-lg px-1.5 py-1">
          {/* GROUP A: 修改 / 生產 */}
          {slide?.caption && (
            <ToolBtn lucide={Pencil} label={lang === "en" ? "Edit caption" : "編輯文案"} active={activeTool === "edit"} onPress={() => toggleTool("edit")} />
          )}
          {slide?.caption && (
            <ToolBtn lucide={MessageCircle} label={lang === "en" ? "Chat with AI to tweak the caption" : "跟 AI 改文案（對話迭代）"} active={activeTool === "chat"}
              onPress={() => toggleTool("chat")} />
          )}
          <ToolBtn lucide={LucideImage} label={lang === "en" ? "AI image" : "AI 生圖"} active={activeTool === "style"}
            disabled={!slide?.imageStyle} onPress={() => { setImageStep("brief"); toggleTool("style"); }} />
          <ToolBtn lucide={Video} label={lang === "en" ? "AI video" : "AI 生影片"} active={activeTool === "video"}
            onPress={() => { setVideoStep("brief"); toggleTool("video"); }} />

          <span className="w-px h-5 bg-default-200 mx-1" />
          {/* GROUP B: Agent 頭像（直接 inline toolbar）— 點頭像看那位 agent 做了什麼 */}
          {(() => {
            const allAgents: Array<{ id: number; name: string; title?: string; avatarUrl?: string | null; role: string; output?: string }> = [];
            if (agentMeta) allAgents.push({ id: agentMeta.id, name: agentMeta.name, title: agentMeta.title, avatarUrl: agentMeta.avatarUrl, role: lang === "en" ? "Lead writer" : "文案主寫" });
            if (imageAgentMeta) allAgents.push({ id: imageAgentMeta.id, name: imageAgentMeta.name, title: imageAgentMeta.title, avatarUrl: imageAgentMeta.avatarUrl, role: lang === "en" ? "Visual direction" : "視覺方向" });
            for (const v of slides) {
              const va = (v as any).agent;
              if (va && !allAgents.find((a) => a.id === va.id)) {
                allAgents.push({ id: va.id, name: va.name, title: va.title, avatarUrl: va.avatarUrl, role: v.label ?? "Squad agent", output: v.caption });
              }
            }
            const visibleAgents = allAgents.slice(0, 3);
            const overflowCount = Math.max(0, allAgents.length - 3);
            if (allAgents.length === 0) return null;
            return (
              <>
                {visibleAgents.map((a) => {
                  const isOpen = openAgentPopover === a.id;
                  return (
                    <div key={a.id} className="relative">
                      <button
                        onClick={() => setOpenAgentPopover(isOpen ? null : a.id)}
                        title={`${a.name} · ${a.role}`}
                        className={`w-7 h-7 rounded-full overflow-hidden transition flex items-center justify-center ${
                          isOpen ? "ring-2 scale-105" : "hover:scale-105 ring-1 ring-default-200"
                        }`}
                        style={isOpen ? { borderColor: tierAccent(pageTier), boxShadow: `0 0 0 2px ${tierAccent(pageTier)}` } : undefined}
                      >
                        <Avatar src={a.avatarUrl || dicebear(a.name)} size="sm" className="w-7 h-7" />
                      </button>
                      {isOpen && (
                        <div
                          className="absolute top-12 left-1/2 -translate-x-1/2 z-50 w-64 bg-white border border-default-200 rounded-xl shadow-lg p-3 space-y-1.5"
                          style={{ borderColor: `${tierAccent(pageTier)}50` }}
                        >
                          <div className="flex items-center gap-2 pb-2 border-b border-default-100">
                            <Avatar src={a.avatarUrl || dicebear(a.name)} size="sm" className="w-7 h-7" />
                            <div className="flex-1 min-w-0">
                              <p className="text-tiny font-semibold truncate">{a.name}</p>
                              <p className="text-[10px] text-default-500 truncate">{a.title ?? a.role}</p>
                            </div>
                            <button onClick={() => setOpenAgentPopover(null)} className="text-default-400 hover:text-default-700">
                              <FontAwesomeIcon icon={faXmark} className="text-tiny" />
                            </button>
                          </div>
                          <p className="text-[10px] font-semibold text-default-500">{lang === "en" ? "What they did:" : "完成的事："}</p>
                          <p className="text-tiny text-default-800 whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto">
                            {a.output ? a.output.slice(0, 360) + (a.output.length > 360 ? "…" : "")
                              : (a.role === "文案主寫" || a.role === "Lead writer") ? (lang === "en"
                                  ? `Wrote ${slides.length} caption variants. Current "${slide?.label}":\n${slide?.caption?.slice(0, 200) ?? ""}…`
                                  : `撰寫了 ${slides.length} 個變體的文案。當前版本「${slide?.label}」：\n${slide?.caption?.slice(0, 200) ?? ""}…`)
                              : (a.role === "視覺方向" || a.role === "Visual direction") ? (lang === "en"
                                  ? `Wrote the visual brief:\n${slide?.imageStyle?.slice(0, 200) ?? "(no brief)"}`
                                  : `產出視覺風格指引：\n${slide?.imageStyle?.slice(0, 200) ?? "（無視覺指引）"}`)
                              : (lang === "en" ? "(no separate output recorded)" : "（無單獨輸出記錄）")}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {overflowCount > 0 && (
                  <button
                    onClick={() => toggleTool("details")}
                    title={lang === "en" ? `${overflowCount} more AI specialists — see the full collab flow` : `還有 ${overflowCount} 位 AI 專家，點開看完整協作流程`}
                    className="w-7 h-7 rounded-full bg-default-100 text-default-600 text-[10px] font-bold hover:bg-default-200 transition flex items-center justify-center"
                  >
                    +{overflowCount}
                  </button>
                )}
              </>
            );
          })()}

          <span className="w-px h-5 bg-default-200 mx-1" />
          {/* GROUP C: 看細節 */}
          <ToolBtn lucide={Wand2} label={lang === "en" ? "Visual brief / hashtags" : "視覺方向 / 主題標籤"} active={activeTool === "prompt"}
            disabled={!slide?.imageStyle} onPress={() => toggleTool("prompt")} />
          <ToolBtn lucide={LucideSliders} label={lang === "en" ? "QA / production pack / links" : "QA / Production package / 連結"} active={activeTool === "details"}
            disabled={!hasDetails} onPress={() => toggleTool("details")} />

          <span className="w-px h-5 bg-default-200 mx-1" />
          {/* GROUP D: 拿走 */}
          <ToolBtn lucide={Copy} label={lang === "en" ? "Copy caption" : "複製文案"}
            onPress={() => {
              if (slide?.caption) {
                navigator.clipboard.writeText(slide.caption);
                showToastGlobal(t("toast_copied"), "success");
              }
            }} />
          {/* 2026-05-19 (CJ): 按鈕實際功能是「編輯文案」panel，
              改名避免用戶誤以為要按才會存（任務完成時已自動記錄）。 */}
          <ToolBtn lucide={Save} label={lang === "en" ? "Edit caption" : "編輯文案"} active={activeTool === "save"}
            onPress={() => toggleTool("save")} />

          {/* GROUP E (2026-05-08): 重做 + 關閉 — relocated from ModalFooter
              so the mockup background has zero buttons.  */}
          {(onRedo || onClose) && <span className="w-px h-5 bg-default-200 mx-1" />}
          {onRedo && (
            <ToolBtn lucide={RotateCcw} label={lang === "en" ? "Redo (keep the brief, regenerate)" : "重做（保留問題、重新產出）"} onPress={onRedo} />
          )}
          {onClose && (
            <ToolBtn lucide={LucideX} label={lang === "en" ? "Close" : "關閉"} onPress={onClose} />
          )}
        </div>
      </div>

      {/* ═══ CANVA STAGE: huge mockup | optional right contextual panel ═══ */}
      <div className="flex gap-3 items-stretch">
        {/* ── CENTER STAGE: Mockup with side chevrons (each chevron shows variant name) ── */}
        <div className="flex-1 min-w-0 flex flex-col items-center">
          <div className="relative flex items-stretch gap-2">
            {total > 1 && (
              <button
                onClick={() => setIdx(Math.max(0, idx - 1))}
                disabled={idx === 0}
                className={`flex-shrink-0 self-stretch flex flex-col items-center justify-center gap-1 rounded-xl transition px-2 ${
                  idx === 0
                    ? "opacity-0 cursor-not-allowed pointer-events-none"
                    : "text-default-500 hover:text-default-800 hover:bg-white/60"
                }`}
                aria-label={lang === "en" ? "Previous version" : "上一個版本"}
                title={idx > 0 ? (lang === "en" ? `Previous: ${slides[idx - 1]?.label}` : `上一版：${slides[idx - 1]?.label}`) : ""}
              >
                <FontAwesomeIcon icon={faChevronLeft} className="text-large" />
                {idx > 0 && (
                  <span className="text-[10px] font-medium text-default-500 max-w-[60px] text-center leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {slides[idx - 1]?.label}
                  </span>
                )}
              </button>
            )}
            {/* 2026-05-09 (CJ): mockup container redesign — clean white
                elevated card on neutral gray canvas (Goldrush Business
                Settings reference). Drops the transparent style that
                let the running carousel bleed through. */}
            <div className="flex-1 min-w-0 flex justify-center py-6">
              {mockupVariant && (
                <div
                  className={`w-full ${activeTool ? "max-w-[900px]" : "max-w-[1280px]"} transition-all`}
                >
                  <div
                    className="rounded-2xl overflow-hidden bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-1 ring-black/5"
                  >
                  <PlatformMockup
                    // Inject the active variant label into the mockup's variantLabel
                    // so the FACEBOOK / FEED header reads e.g. "FACEBOOK / FEED · 情感版"
                    variant={{ ...mockupVariant, label: `${mockupVariant.label} · ${slide.label ?? ""}` }}
                    title={output.title ?? ""}
                    brief={output.description ?? ""}
                    brandName={brandName}
                    brandLogoUrl={brandLogoUrl}
                    liveCaption={slide.caption}
                    liveTitle={output.title}
                    liveDescription={output.description}
                    liveCta={output.cta}
                    liveHashtags={slide.hashtags}
                    liveImageStyle={slide.imageStyle}
                    liveImageUrl={slide.imageUrl ?? undefined}
                    liveImageStatus={slide.imageStatus}
                    liveVideoStyle={output.video_style_direction?.summary}
                    ogCard={fetchedUrl?.og ? {
                      url: fetchedUrl.url,
                      image: fetchedUrl.og.image,
                      title: fetchedUrl.og.title,
                      description: fetchedUrl.og.description,
                      siteName: fetchedUrl.og.site_name,
                      domain: fetchedUrl.og.domain,
                    } : undefined}
                  />
                  </div>
                </div>
              )}
            </div>
            {total > 1 && (
              <button
                onClick={() => setIdx(Math.min(total - 1, idx + 1))}
                disabled={idx === total - 1}
                className={`flex-shrink-0 self-stretch flex flex-col items-center justify-center gap-1 rounded-xl transition px-2 ${
                  idx === total - 1
                    ? "opacity-0 cursor-not-allowed pointer-events-none"
                    : "text-default-500 hover:text-default-800 hover:bg-white/60"
                }`}
                aria-label={lang === "en" ? "Next version" : "下一個版本"}
                title={idx < total - 1 ? (lang === "en" ? `Next: ${slides[idx + 1]?.label}` : `下一版：${slides[idx + 1]?.label}`) : ""}
              >
                <FontAwesomeIcon icon={faChevronRight} className="text-large" />
                {idx < total - 1 && (
                  <span className="text-[10px] font-medium text-default-500 max-w-[60px] text-center leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {slides[idx + 1]?.label}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Variant label removed per CJ — redundant with bottom thumbnail strip
              showing active variant. Keep modal clean (Canva pattern). */}

          {/* 2026-05-09 (CJ direction): "直接編輯" panel was previously
              docked below the mockup — moved to right-side panel
              (alongside other tool panels) for consistent UX. */}

          {/* Brand logo hint moved to floating bottom-right when applicable —
              keeps main canvas clean (Canva pattern: no nag banners). */}
          {brandId && !brandLogoUrl && (
            <button
              onClick={() => setFbLogoModalOpen(true)}
              className="fixed bottom-20 right-6 z-30 flex items-center gap-1.5 text-[10px] text-default-500 bg-white hover:bg-default-50 transition border border-default-200 rounded-full shadow-sm px-2.5 py-1"
              title={lang === "en" ? "No Facebook page avatar yet — grab it with one click" : "這個品牌還沒粉專頭像 — 點此一鍵抓取"}
            >
              <FontAwesomeIcon icon={faFacebookF} className="text-default-400 text-[9px]" />
              <span>{lang === "en" ? "Grab FB avatar" : "抓粉專頭像"}</span>
            </button>
          )}
        </div>

        {/* ── RIGHT CONTEXTUAL PANEL — slides in when ANY tool is active ──
            2026-05-09 (CJ direction): edit panel now lives here too
            (was previously inline-below-mockup which was inconsistent UX). */}
        {activeTool && (
          <div className="w-72 shrink-0 max-h-[calc(92vh-220px)] overflow-y-auto pr-1 space-y-2 animate-in slide-in-from-right-2 fade-in duration-200">
            {/* Panel header with close button */}
            <div className="sticky top-0 bg-white pb-2 flex items-center justify-between border-b border-default-100 z-10">
              <span className="text-tiny font-bold tracking-wider uppercase" style={{ color: tierAccent(pageTier) }}>
                {activeTool === "edit" && (lang === "en" ? "✏️ Direct edit" : "✏️ 直接編輯")}
                {activeTool === "style" && (lang === "en" ? "AI image" : "AI 生圖")}
                {activeTool === "video" && (lang === "en" ? "🎬 AI video" : "🎬 AI 影片生成")}
                {activeTool === "prompt" && (lang === "en" ? "🪄 Visual brief / hashtags" : "🪄 視覺方向 / 主題標籤")}
                {activeTool === "details" && (lang === "en" ? "📊 Details" : "📊 細節資訊")}
                {activeTool === "chat" && (lang === "en" ? `Chat with ${agentMeta?.name ?? "AI"}` : `跟 ${agentMeta?.name ?? "AI"} 改文案`)}
                {activeTool === "save" && (lang === "en" ? "✏️ Edit caption" : "✏️ 編輯文案（任務完成即自動記錄到專案）")}
              </span>
              <button onClick={() => setActiveTool(null)} className="text-default-400 hover:text-default-700">
                <FontAwesomeIcon icon={faXmark} className="text-tiny" />
              </button>
            </div>

            {/* EDIT panel — direct caption textarea (mockup updates live) */}
            {activeTool === "edit" && slide?.caption && (
              <div className="space-y-2">
                <p className="text-[10px] text-default-500 leading-relaxed">
                  {lang === "en"
                    ? "Edit here — the mockup updates live. Copy it or save to a project when you're done."
                    : "在這裡改文字，左邊預覽會即時跟著變。改好就直接複製或存到專案。"}
                </p>
                <Textarea
                  value={slide.caption}
                  onValueChange={(v) => setEdits((e) => ({ ...e, [idx]: v }))}
                  minRows={6}
                  maxRows={20}
                  classNames={{ input: "text-small leading-relaxed font-sans" }}
                />
                {isEdited && (
                  <button
                    onClick={() => setEdits((e) => { const next = { ...e }; delete next[idx]; return next; })}
                    className="text-tiny text-default-500 hover:text-default-700 underline-offset-2 hover:underline"
                  >
                    {lang === "en" ? "Revert to AI original" : "還原 AI 原版"}
                  </button>
                )}
              </div>
            )}

            {/* STYLE panel — 3-step image gen flow: brief → confirm prompt → generate */}
            {activeTool === "style" && (
              <div className="space-y-3">
                {/* Step 1: 中文 brief (always shown) */}
                <div className="rounded-xl border border-default-200 bg-default-50 p-3">
                  <p className="text-[10px] font-semibold text-default-500 mb-1 flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-default-200 text-default-700 text-[9px] flex items-center justify-center">1</span>
                    {lang === "en" ? "Visual style suggestion" : "中文視覺風格建議"}
                  </p>
                  <p className="text-tiny text-default-800 leading-relaxed whitespace-pre-line">
                    {slide?.imageStyle ?? (lang === "en" ? "(no visual brief)" : "（無視覺方向）")}
                  </p>
                </div>

                {/* Step 1 → Step 2 transition */}
                {imageStep === "brief" && slide?.imageStyle && !slide.imageUrl && (
                  <Button
                    size="sm"
                    className="w-full font-semibold"
                    style={{ background: tierAccent(pageTier), color: "white" }}
                    onPress={() => {
                      setEditablePrompt(slide.imageStyle ?? "");
                      setImageStep("prompt");
                    }}
                    endContent={<FontAwesomeIcon icon={faChevronRight} />}
                  >
                    {lang === "en" ? "Next: write the AI prompt" : "下一步：產出 AI 指令"}
                  </Button>
                )}

                {/* Step 2: AI prompt confirmation + model selection + generate */}
                {imageStep === "prompt" && (
                  <>
                    <div className="rounded-xl border border-default-200 bg-default-50 p-3">
                      <p className="text-[10px] font-semibold text-default-500 mb-1 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center" style={{ background: tierAccent(pageTier) }}>2</span>
                        {lang === "en" ? "Review / edit the AI prompt" : "確認 / 編輯 AI 指令"}
                      </p>
                      <Textarea
                        value={editablePrompt}
                        onValueChange={setEditablePrompt}
                        minRows={4}
                        maxRows={8}
                        classNames={{ input: "text-tiny leading-relaxed" }}
                      />
                    </div>
                    <div className="rounded-xl border border-default-200 bg-default-50 p-3 space-y-2">
                      <p className="text-[10px] font-semibold text-default-500 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center" style={{ background: tierAccent(pageTier) }}>3</span>
                        {lang === "en" ? "Pick an AI model" : "選擇 AI 模型"}
                      </p>
                      <select
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value as any)}
                        className="w-full text-tiny border border-default-200 rounded-md px-2 py-1.5 bg-white"
                      >
                        <option value="piapi/flux-schnell">{lang === "en" ? "⚡ Flux Schnell (fast, cheap)" : "⚡ Flux Schnell（快、便宜）"}</option>
                        <option value="piapi/flux-pro">{lang === "en" ? "Flux Pro (high quality)" : "Flux Pro（高品質）"}</option>
                        <option value="openai/gpt-image-1">{lang === "en" ? "🧠 GPT Image 1 (OpenAI)" : "🧠 GPT Image 1（OpenAI）"}</option>
                        <option value="google/imagen-3">{lang === "en" ? "🌈 Imagen 4 (Google)" : "🌈 Imagen 4（Google）"}</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        className="flex-1"
                        onPress={() => setImageStep("brief")}
                        isDisabled={imageGenStatus === "generating"}
                      >
                        {lang === "en" ? "‹ Back" : "‹ 上一步"}
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 font-semibold"
                        style={{ background: tierAccent(pageTier), color: "white" }}
                        startContent={<FontAwesomeIcon icon={faImage} />}
                        onPress={handleInlineImageGen}
                        isLoading={imageGenStatus === "generating"}
                        isDisabled={imageGenStatus === "generating"}
                      >
                        {imageGenStatus === "generating" ? (lang === "en" ? "Making…" : "生成中…") : (lang === "en" ? "Make it" : "生成")}
                      </Button>
                    </div>
                    {/* Inline result — image appears here when ready, no popup */}
                    {imageGenStatus === "ready" && imageOverrides[idx] && (
                      <div className="rounded-xl border border-success-200 bg-success-50 p-3 space-y-2">
                        <p className="text-tiny font-semibold text-success-700">{lang === "en" ? "✓ Applied to mockup" : "✓ 已套用到預覽"}</p>
                        <img
                          src={imageOverrides[idx]}
                          alt="generated"
                          className="w-full rounded-lg shadow-sm"
                        />
                        <Button
                          size="sm"
                          variant="flat"
                          className="w-full"
                          onPress={handleInlineImageGen}
                          startContent={<FontAwesomeIcon icon={faRotateRight} />}
                        >
                          {lang === "en" ? "Make another" : "再生一張"}
                        </Button>
                      </div>
                    )}
                    {imageGenStatus === "generating" && (
                      <div className="rounded-xl border border-default-200 bg-default-50 p-3 flex items-center gap-2">
                        <Spinner size="sm" />
                        <span className="text-tiny text-default-600">{lang === "en" ? (imageModel.includes("flux-pro") ? "Flux Pro painting (10-15s)…" : "Painting (5-10s)…") : (imageModel.includes("flux-pro") ? "Flux Pro 生圖中（10-15 秒）…" : "生圖中（5-10 秒）…")}</span>
                      </div>
                    )}
                    {imageGenStatus === "failed" && (
                      <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-tiny text-warning-800">
                        {lang === "en" ? `✗ Failed: ${imageGenError}` : `✗ 生成失敗：${imageGenError}`}
                      </div>
                    )}
                  </>
                )}

                {slide?.imageUrl && imageGenStatus === "idle" && (
                  <p className="text-tiny text-success-600">{lang === "en" ? "✓ This version already has a real image" : "✓ 此版本已有真生圖"}</p>
                )}
              </div>
            )}

            {/* (Old AGENTS slide-out panel removed — agents are now inline in
                the floating toolbar. Click any agent avatar in toolbar →
                popover shows what that agent did.) */}

            {/* VIDEO panel — same 3-step flow as image gen */}
            {activeTool === "video" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-default-200 bg-default-50 p-3">
                  <p className="text-[10px] font-semibold text-default-500 mb-1 flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-default-200 text-default-700 text-[9px] flex items-center justify-center">1</span>
                    {lang === "en" ? "Video style suggestion" : "影片風格建議"}
                  </p>
                  <p className="text-tiny text-default-800 leading-relaxed whitespace-pre-line">
                    {(output as any)?.video_style_direction?.summary ?? slide?.imageStyle ?? (lang === "en" ? "(no video brief — using the image brief as the base)" : "（沒有影片視覺指引，會用圖片指引當基礎）")}
                  </p>
                </div>
                {videoStep === "brief" && (
                  <Button
                    size="sm"
                    className="w-full font-semibold"
                    style={{ background: tierAccent(pageTier), color: "white" }}
                    onPress={() => {
                      setEditableVideoPrompt(((output as any)?.video_style_direction?.summary ?? slide?.imageStyle) ?? "");
                      setVideoStep("prompt");
                    }}
                    endContent={<FontAwesomeIcon icon={faChevronRight} />}
                  >
                    {lang === "en" ? "Next: write the AI prompt" : "下一步：產出 AI 指令"}
                  </Button>
                )}
                {videoStep === "prompt" && (
                  <>
                    <div className="rounded-xl border border-default-200 bg-default-50 p-3">
                      <p className="text-[10px] font-semibold text-default-500 mb-1 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center" style={{ background: tierAccent(pageTier) }}>2</span>
                        {lang === "en" ? "Review / edit the video AI prompt" : "確認 / 編輯影片 AI 指令"}
                      </p>
                      <Textarea
                        value={editableVideoPrompt}
                        onValueChange={setEditableVideoPrompt}
                        minRows={4}
                        maxRows={8}
                        classNames={{ input: "text-tiny leading-relaxed" }}
                      />
                    </div>
                    <div className="rounded-xl border border-default-200 bg-default-50 p-3 space-y-2">
                      <p className="text-[10px] font-semibold text-default-500 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center" style={{ background: tierAccent(pageTier) }}>3</span>
                        {lang === "en" ? "Pick an AI model" : "選擇 AI 模型"}
                      </p>
                      <select
                        value={videoModel}
                        onChange={(e) => setVideoModel(e.target.value as any)}
                        className="w-full text-tiny border border-default-200 rounded-md px-2 py-1.5 bg-white"
                      >
                        <option value="hailuo/t2v">{lang === "en" ? "⚡ Hailuo T2V (fast, cheap)" : "⚡ Hailuo T2V（快、便宜）"}</option>
                        <option value="piapi/kling-v2-master">{lang === "en" ? "Kling v2 Master (high quality)" : "Kling v2 Master（高品質）"}</option>
                      </select>
                      <p className="text-[10px] text-default-400">{lang === "en" ? "Video rendering takes 60-180s and runs in the background." : "影片產生需 60-180 秒，會在背景跑"}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="flat" className="flex-1"
                        onPress={() => setVideoStep("brief")}
                        isDisabled={videoGenStatus === "generating"}>
                        {lang === "en" ? "‹ Back" : "‹ 上一步"}
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 font-semibold"
                        style={{ background: tierAccent(pageTier), color: "white" }}
                        startContent={<FontAwesomeIcon icon={faFilm} />}
                        onPress={handleInlineVideoGen}
                        isLoading={videoGenStatus === "generating"}
                        isDisabled={videoGenStatus === "generating"}
                      >
                        {videoGenStatus === "generating" ? (lang === "en" ? "Making…" : "生成中…") : (lang === "en" ? "Make video" : "生成影片")}
                      </Button>
                    </div>
                    {/* Inline video result */}
                    {videoGenStatus === "ready" && generatedVideoUrl && (
                      <div className="rounded-xl border border-success-200 bg-success-50 p-3 space-y-2">
                        <p className="text-tiny font-semibold text-success-700">{lang === "en" ? "✓ Video ready" : "✓ 影片完成"}</p>
                        <video
                          src={generatedVideoUrl}
                          controls
                          className="w-full rounded-lg shadow-sm"
                        />
                        <Button
                          size="sm"
                          variant="flat"
                          className="w-full"
                          onPress={handleInlineVideoGen}
                          startContent={<FontAwesomeIcon icon={faRotateRight} />}
                        >
                          {lang === "en" ? "Make another" : "再生一支"}
                        </Button>
                      </div>
                    )}
                    {videoGenStatus === "generating" && (
                      <div className="rounded-xl border border-default-200 bg-default-50 p-3 flex items-center gap-2">
                        <Spinner size="sm" />
                        <span className="text-tiny text-default-600">{lang === "en" ? "Rendering video (60-180s)…" : "影片生成中（60-180 秒）…"}</span>
                      </div>
                    )}
                    {videoGenStatus === "submitted" && (
                      <div className="rounded-xl border border-default-200 bg-default-50 p-3 text-tiny text-default-700">
                        {lang === "en"
                          ? `⏳ Submitted — rendering in the background (${videoModel.includes("kling") ? "120-180" : "60-90"}s)`
                          : `⏳ 影片已提交，背景生成中（${videoModel.includes("kling") ? "120-180" : "60-90"} 秒）`}
                        <p className="text-[10px] text-default-400 mt-1">{videoGenError}</p>
                      </div>
                    )}
                    {videoGenStatus === "failed" && (
                      <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-tiny text-warning-800">
                        {lang === "en" ? `✗ Failed: ${videoGenError}` : `✗ 生成失敗：${videoGenError}`}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* CHAT panel — AI 對話迭代調整文案（取代換語氣） */}
            {activeTool === "chat" && (
              <div className="space-y-2 flex flex-col" style={{ minHeight: 320 }}>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: 380 }}>
                  {chatHistory.length === 0 && (
                    <div className="rounded-xl bg-default-50 p-3 text-tiny text-default-700 leading-relaxed">
                      <p className="font-semibold mb-1">{agentMeta?.name ?? "Aiden Hsu"}{lang === "en" ? ":" : "："}</p>
                      <p>{lang === "en" ? "The caption is done (see the mockup on the left). Tell me what you'd like to tweak — for example:" : "目前的文案已經寫好（看左邊預覽）。告訴我你想怎麼調整？例如："}</p>
                      <ul className="mt-1.5 space-y-0.5 text-[11px] text-default-600 list-disc list-inside">
                        {lang === "en" ? (
                          <>
                            <li>"Make it younger, more student-friendly"</li>
                            <li>"Drop the second paragraph, too wordy"</li>
                            <li>"Add Mother's Day emotion"</li>
                            <li>"Change the closing CTA to a limited-time offer"</li>
                          </>
                        ) : (
                          <>
                            <li>「希望更年輕、學生族群一點」</li>
                            <li>「把第二段刪掉，太囉嗦」</li>
                            <li>「加入媽媽節情緒」</li>
                            <li>「結尾的 CTA 改成限時優惠」</li>
                          </>
                        )}
                      </ul>
                    </div>
                  )}
                  {chatHistory.map((m, i) => (
                    <div key={i} className={`rounded-xl p-2.5 text-tiny leading-relaxed ${
                      m.role === "user"
                        ? "ml-6 bg-primary-50 text-default-800"
                        : "mr-2 bg-default-50"
                    }`}>
                      {m.role === "assistant" && (
                        <p className="text-[10px] font-semibold text-default-500 mb-1">{agentMeta?.name ?? "AI"}{lang === "en" ? ":" : "："}</p>
                      )}
                      <p className="whitespace-pre-line">{m.content}</p>
                      {m.rewritten && (
                        <>
                          <div className="mt-2 p-2 bg-white rounded-md border border-default-200">
                            <p className="text-[10px] font-semibold text-default-500 mb-1">{lang === "en" ? "Rewritten:" : "改寫後："}</p>
                            <p className="text-default-800 whitespace-pre-line text-[11px]">{m.rewritten}</p>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              className="flex-1 text-tiny font-semibold"
                              style={{ background: tierAccent(pageTier), color: "white" }}
                              onPress={() => {
                                setEdits((e) => ({ ...e, [idx]: m.rewritten! }));
                              }}
                            >
                              {lang === "en" ? "✓ Use this one" : "✓ 採用這版"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {chatBusy && (
                    <div className="rounded-xl bg-default-50 p-2.5 text-tiny text-default-500 italic">
                      {lang === "en" ? `${agentMeta?.name ?? "AI"} is thinking…` : `${agentMeta?.name ?? "AI"} 思考中…`}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2 border-t border-default-100">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                    placeholder={lang === "en" ? "Tell me what to tweak…" : "說明你想怎麼改…"}
                    className="flex-1 text-tiny border border-default-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-primary-400"
                    disabled={chatBusy}
                  />
                  <Button
                    size="sm"
                    onPress={handleChatSend}
                    isDisabled={!chatInput.trim() || chatBusy}
                    style={{ background: tierAccent(pageTier), color: "white" }}
                  >
                    {lang === "en" ? "Send" : "送出"}
                  </Button>
                </div>
              </div>
            )}

            {/* SAVE panel — pick a project to attach this output */}
            {activeTool === "save" && (
              <SavePanel
                slide={slide}
                pageTier={pageTier}
                accent={tierAccent(pageTier)}
                brandId={brandId}
                onClose={() => setActiveTool(null)}
              />
            )}

            {/* PROMPT panel — show what was sent to LLM */}
            {activeTool === "prompt" && (
              <div className="rounded-xl border border-default-200 bg-default-50 p-3 space-y-2">
                <p className="text-[10px] text-default-500 mb-1">{lang === "en" ? "Visual brief (goes into AI image gen)" : "視覺方向（會送進 AI 生圖）"}</p>
                <p className="text-tiny text-default-800 leading-relaxed whitespace-pre-line border-l-2 border-default-300 pl-2">
                  {slide?.imageStyle ?? (lang === "en" ? "(no visual brief for this task)" : "（這個任務沒有視覺指引）")}
                </p>
                {slide?.hashtags && slide.hashtags.length > 0 && (
                  <>
                    <p className="text-[10px] text-default-500 mt-3 mb-1">{lang === "en" ? "Suggested hashtags" : "推薦主題標籤"}</p>
                    <p className="text-tiny text-primary-700">
                      {slide.hashtags.map((h: string) => `#${h}`).join(" ")}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* DETAILS panel — QA + Production package + Agent collab */}
            {activeTool === "details" && (
              <div className="space-y-2">
                {slide?.qa && slide.qa.comment && (
                  <div className={`rounded-xl border p-3 ${
                    slide.qa.status === "pass" ? "border-success-200 bg-success-50" : "border-warning-200 bg-warning-50"
                  }`}>
                    <div className="flex items-center gap-2 text-tiny font-semibold mb-1">
                      <span>{slide.qa.status === "pass" ? "✓" : "⚠"}</span>
                      <span>QA: Jordan Hayes</span>
                      {typeof slide.qa.score === "number" && (
                        <span className="ml-auto tabular-nums">{Math.round(slide.qa.score)}/100</span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-default-700">{slide.qa.comment}</p>
                    {slide.qa.suggestions && slide.qa.suggestions.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-[10px] text-default-600">
                        {slide.qa.suggestions.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    )}
                  </div>
                )}
                {slide?.extras && (slide.extras.postingTime || slide.extras.replyTemplates?.length || slide.extras.followupPost || slide.extras.compareTable || slide.extras.timingAdvice || slide.extras.legalCheck) && (
                  <div className="rounded-xl border border-default-200 bg-white p-3 space-y-2 text-tiny">
                    <p className="font-semibold">{lang === "en" ? "Production package" : "Production package"}</p>
                    {slide.extras.postingTime && (
                      <p><span className="text-default-500">{lang === "en" ? "⏰ Posting time:" : "⏰ 發文時段："}</span><span className="text-default-800">{slide.extras.postingTime}</span></p>
                    )}
                    {slide.extras.followupPost && (
                      <div>
                        <p className="text-default-500">{lang === "en" ? "📅 24h follow-up:" : "📅 24h 跟進："}</p>
                        <p className="text-default-800 whitespace-pre-line leading-relaxed">{slide.extras.followupPost}</p>
                      </div>
                    )}
                    {slide.extras.replyTemplates && slide.extras.replyTemplates.length > 0 && (
                      <div>
                        <p className="text-default-500 mb-1">{lang === "en" ? `Reply templates (${slide.extras.replyTemplates.length})` : `留言模板（${slide.extras.replyTemplates.length} 組）`}</p>
                        <div className="space-y-1 pl-2 border-l-2 border-default-200">
                          {slide.extras.replyTemplates.slice(0, 5).map((rt, i) => (
                            <div key={i}>
                              <p className="text-default-500 text-[10px]">{lang === "en" ? "User:" : "用戶："}{rt.userSays}</p>
                              <p className="text-default-800 text-[10px]">{lang === "en" ? "You:" : "你回："}{rt.yourReply}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {slide.extras.compareTable && (
                      <div className="border-t border-default-100 pt-2">
                        <p className="text-default-500 mb-1">{lang === "en" ? "🔁 Viral comparison" : "🔁 爆款對照"}</p>
                        <p className="text-default-800 whitespace-pre-line text-[10px]">{slide.extras.compareTable}</p>
                      </div>
                    )}
                    {slide.extras.timingAdvice && (
                      <div className="border-t border-default-100 pt-2">
                        <p className="text-default-500 mb-1">{lang === "en" ? "⏱ Timing" : "⏱ 時效性"}</p>
                        <p className="text-default-800 whitespace-pre-line text-[10px]">{slide.extras.timingAdvice}</p>
                      </div>
                    )}
                    {slide.extras.legalCheck && (
                      <div className="border-t border-default-100 pt-2">
                        <p className="text-default-500 mb-1">{lang === "en" ? "⚖ Legal check" : "⚖ 法務檢核"}</p>
                        <p className="text-default-800 whitespace-pre-line text-[10px]">{slide.extras.legalCheck}</p>
                      </div>
                    )}
                  </div>
                )}
                {orchestraStages && orchestraStages.length > 0 && (
                  <div className="rounded-xl border border-default-200 bg-white p-3">
                    <p className="text-tiny font-semibold mb-2">{lang === "en" ? `🎼 AI collab (${doneStages}/${stageCount})` : `🎼 AI 專家協作 (${doneStages}/${stageCount})`}</p>
                    <StagePipelineView
                      stages={orchestraStages}
                      captionAgent={agentMeta}
                      imageAgent={imageAgentMeta}
                      tier={pageTier}
                    />
                  </div>
                )}
                {fetchedUrl && (
                  <div className="rounded-xl border border-default-200 bg-white p-3 text-tiny">
                    <p className="font-semibold mb-1">{lang === "en" ? "🔗 Link read" : "🔗 已讀連結"}</p>
                    <a href={fetchedUrl.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline break-all text-[10px]">
                      {fetchedUrl.title ?? fetchedUrl.url}
                    </a>
                    <p className="text-default-400 text-[10px] mt-1">{lang === "en" ? `${fetchedUrl.chars.toLocaleString()} chars` : `${fetchedUrl.chars.toLocaleString()} 字`}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* (Bottom thumbnail strip removed per CJ — variant switching now lives
          on the chevrons themselves with the variant name displayed inline.) */}

      {/* MediaGenFlow modal removed — image / video gen is now inline in the
          right panel (Step 3 of 🖼/🎬 tool flow). No more popup. */}

      {/* FB avatar picker — minimal modal that triggers brand.fetchFacebookAvatar */}
      <Modal isOpen={fbLogoModalOpen} onClose={() => setFbLogoModalOpen(false)} size="md" backdrop="blur">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <p className="font-semibold">{lang === "en" ? "Grab logo from FB page" : "從 FB 粉專抓 logo"}</p>
            <p className="text-tiny text-default-500 font-normal">
              {lang === "en"
                ? `Paste your FB page URL — we'll save the avatar to "${brandName ?? "your brand"}".`
                : `貼上你 FB 粉專網址，系統會抓回頭像存進「${brandName ?? "品牌"}」。`}
            </p>
          </ModalHeader>
          <ModalBody>
            <Input
              autoFocus
              size="sm"
              placeholder="https://www.facebook.com/桂冠營養研究室"
              value={fbHandle}
              onValueChange={setFbHandle}
              startContent={<FontAwesomeIcon icon={faFacebookF} className="text-default-400" />}
              isDisabled={fbBusy}
            />
            <p className="text-tiny text-default-400">
              {lang === "en" ? (
                <>Also accepts a plain handle (e.g. <code>nikecom</code>). The page must be public.</>
              ) : (
                <>也接受純 handle（例：<code>桂冠營養研究室</code>）。粉專必須是公開的。</>
              )}
            </p>
            {fbErr && (
              <p className="text-tiny text-danger-600 mt-1">{fbErr}</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setFbLogoModalOpen(false)} isDisabled={fbBusy}>{t("cancel")}</Button>
            <Button color="primary" onPress={onSubmitFbHandle} isLoading={fbBusy}>
              {lang === "en" ? "Grab it" : "抓取"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {errorMsg && (
        <Card className="bg-warning-50 border border-warning-200">
          <CardBody className="text-warning-800 text-tiny">{errorMsg}</CardBody>
        </Card>
      )}
    </div>
  );
}

