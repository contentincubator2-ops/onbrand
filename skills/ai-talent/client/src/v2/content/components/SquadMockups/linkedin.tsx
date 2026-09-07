/**
 * LinkedIn SquadMockup wrappers.
 *
 * Each component wraps the corresponding PlatformMockup chrome so we never
 * duplicate LinkedIn UI (avatar, action bar, etc.). SquadMockup adds the
 * structured-data sections that squad steps produce (body copy, hashtags,
 * document deck, poll options, etc.).
 *
 * Variants exposed:
 *   LIFeedMockup       — standard feed post
 *   LIArticleMockup    — long-form article
 *   LINewsletterMockup — newsletter issue brief
 *   LIPollMockup       — interactive poll
 *   LIDocumentMockup   — PDF / document carousel
 *   LINativeVideoMockup — native video script + thumbnail brief
 *   LIAdMockup         — sponsored / lead-gen ad copy
 *   LIEventMockup      — event promotion
 */
import { Chip } from "@heroui/react";
import {
  LIFeed, LIArticle, LINewsletter, LIPoll, LIDocument,
  LINativeVideo, LIAd, LIEvent,
} from "../PlatformMockup/linkedin";
import type { MockupFields } from "../PlatformMockup/shared";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";
import { useLang } from "../../../../lib/i18n";

// ── Shared data shapes ──────────────────────────────────────────────────────

export interface LIPostData {
  brandHandle: string;
  brandAvatarUrl?: string | null;
  body: string;
  hashtags: string[];
  imageDesc?: string;
  firstComment?: string;
}

export interface LIArticleData {
  brandHandle: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
  cta?: string;
}

export interface LINewsletterData {
  brandHandle: string;
  issueTitle: string;
  subtitle?: string;
  teaserText: string;
  callToAction: string;
}

export interface LIPollData {
  brandHandle: string;
  question: string;
  options: string[];       // 2–4 choices
  contextBody?: string;
}

export interface LIDocumentData {
  brandHandle: string;
  documentTitle: string;
  slides: { title: string; body: string }[];
  cta?: string;
}

export interface LINativeVideoData {
  brandHandle: string;
  videoTitle: string;
  hook: string;
  body: string;
  cta: string;
  durationSec?: number;
  thumbnailDesc?: string;
}

export interface LIAdData {
  brandHandle: string;
  headline: string;
  introText: string;
  cta: string;
  targetAudience?: string;
  adObjective?: string;
}

export interface LIEventData {
  brandHandle: string;
  eventName: string;
  dateTime: string;
  location?: string;
  description: string;
  cta?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toFields(brandHandle: string, extra: Partial<MockupFields> = {}): MockupFields {
  return {
    brandName: brandHandle?.replace(/^@/, "") ?? null,
    title: extra.title ?? "",
    brief: extra.brief ?? "",
    liveCaption: extra.liveCaption,
    liveHashtags: extra.liveHashtags,
    liveImageDesc: extra.liveImageDesc,
  };
}

// ── LIFeedMockup ─────────────────────────────────────────────────────────────

interface FeedProps extends SquadMockupCommonProps { data?: LIPostData; }

export function LIFeedMockup({ data, isActive = false }: FeedProps) {
  const { lang } = useLang();
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="💼" eyebrow="SQUAD · LI FEED" title={lang === "en" ? "LinkedIn post" : "LinkedIn 貼文"} />
      <EmptyHint>{lang === "en" ? "Not generated — tap to run this task" : "尚未產出 — 點擊執行此任務"}</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.brandHandle, {
    liveCaption: data.body,
    liveHashtags: data.hashtags,
    liveImageDesc: data.imageDesc,
  });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="💼" eyebrow="SQUAD · LI FEED" title={lang === "en" ? "LinkedIn post" : "LinkedIn 貼文"} />
          {isActive && <Chip size="sm" variant="flat" color="primary" className="self-start">{lang === "en" ? "● AI working…" : "● AI 專家思考中…"}</Chip>}
        </div>
        <LIFeed {...fields} />
      </NotionCard>
      {data.hashtags?.length > 0 && (
        <NotionCard>
          <SectionHeader eyebrow="HASHTAGS" title={lang === "en" ? "Hashtag strategy" : "標籤策略"} />
          <div className="flex flex-wrap gap-1.5">
            {data.hashtags.map((t, i) => (
              <Chip key={i} size="sm" variant="flat" color="primary" className="h-5 text-tiny">
                {t.startsWith("#") ? t : `#${t}`}
              </Chip>
            ))}
          </div>
        </NotionCard>
      )}
      {data.firstComment && (
        <NotionCard>
          <SectionHeader eyebrow="FIRST COMMENT" title={lang === "en" ? "First comment (hashtag bundle)" : "首則留言（主題標籤組合）"} />
          <p className="text-small text-default-700 leading-relaxed">{data.firstComment}</p>
        </NotionCard>
      )}
    </div>
  );
}

// ── LIArticleMockup ──────────────────────────────────────────────────────────

interface ArticleProps extends SquadMockupCommonProps { data?: LIArticleData; }

export function LIArticleMockup({ data, isActive = false }: ArticleProps) {
  const { lang } = useLang();
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="📝" eyebrow="SQUAD · LI ARTICLE" title={lang === "en" ? "LinkedIn article" : "LinkedIn 長文章"} />
      <EmptyHint>{lang === "en" ? "Not generated — tap to run this task" : "尚未產出 — 點擊執行此任務"}</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.brandHandle, { title: data.title, brief: data.summary });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="📝" eyebrow="SQUAD · LI ARTICLE" title={lang === "en" ? "LinkedIn article" : "LinkedIn 長文章"} />
          {isActive && <Chip size="sm" variant="flat" color="primary" className="self-start">{lang === "en" ? "● AI working…" : "● AI 專家思考中…"}</Chip>}
        </div>
        <LIArticle {...fields} />
      </NotionCard>
      {data.sections?.length > 0 && (
        <NotionCard>
          <SectionHeader eyebrow="SECTIONS" title={lang === "en" ? "Article structure" : "文章段落結構"} />
          <div className="flex flex-col gap-3">
            {data.sections.map((s, i) => (
              <div key={i} className="p-3 rounded-md border border-divider">
                <p className="text-small font-semibold mb-1">{i + 1}. {s.heading}</p>
                <p className="text-tiny text-default-700 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </NotionCard>
      )}
      {data.cta && (
        <NotionCard>
          <SectionHeader eyebrow="CTA" title={lang === "en" ? "Call to action" : "行動呼籲"} />
          <p className="text-small text-primary font-medium">{data.cta}</p>
        </NotionCard>
      )}
    </div>
  );
}

// ── LINewsletterMockup ───────────────────────────────────────────────────────

interface NewsletterProps extends SquadMockupCommonProps { data?: LINewsletterData; }

export function LINewsletterMockup({ data, isActive = false }: NewsletterProps) {
  const { lang } = useLang();
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="📨" eyebrow="SQUAD · LI NEWSLETTER" title={lang === "en" ? "LinkedIn Newsletter" : "LinkedIn Newsletter 期刊"} />
      <EmptyHint>{lang === "en" ? "Not generated — tap to run this task" : "尚未產出 — 點擊執行此任務"}</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.brandHandle, { title: data.issueTitle, brief: data.teaserText });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="📨" eyebrow="SQUAD · LI NEWSLETTER" title={lang === "en" ? "LinkedIn Newsletter" : "LinkedIn Newsletter 期刊"} />
          {isActive && <Chip size="sm" variant="flat" color="primary" className="self-start">{lang === "en" ? "● AI working…" : "● AI 專家思考中…"}</Chip>}
        </div>
        <LINewsletter {...fields} />
      </NotionCard>
      <NotionCard>
        <SectionHeader eyebrow="ISSUE BRIEF" title={lang === "en" ? "Issue brief" : "期刊企劃摘要"} />
        {data.subtitle && <p className="text-tiny text-default-500 mb-1">{data.subtitle}</p>}
        <pre className="text-small leading-relaxed whitespace-pre-wrap font-sans bg-default-50 border border-divider rounded-md p-3">
          {data.teaserText}
        </pre>
        <p className="text-small text-primary font-medium mt-1">👉 {data.callToAction}</p>
      </NotionCard>
    </div>
  );
}

// ── LIPollMockup ─────────────────────────────────────────────────────────────

interface PollProps extends SquadMockupCommonProps { data?: LIPollData; }

export function LIPollMockup({ data, isActive = false }: PollProps) {
  const { lang } = useLang();
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="📊" eyebrow="ATOMIC · LI POLL" title={lang === "en" ? "LinkedIn poll" : "LinkedIn 互動民調"} />
      <EmptyHint>{lang === "en" ? "Not generated — tap to run this task" : "尚未產出 — 點擊執行此任務"}</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.brandHandle, { title: data.question, brief: data.contextBody ?? "" });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="📊" eyebrow="ATOMIC · LI POLL" title={lang === "en" ? "LinkedIn poll" : "LinkedIn 互動民調"} />
          {isActive && <Chip size="sm" variant="flat" color="primary" className="self-start">{lang === "en" ? "● AI working…" : "● AI 專家思考中…"}</Chip>}
        </div>
        <LIPoll {...fields} />
      </NotionCard>
      {data.options?.length > 0 && (
        <NotionCard>
          <SectionHeader eyebrow="OPTIONS" title={lang === "en" ? "Poll options" : "投票選項"} />
          <div className="flex flex-col gap-1.5">
            {data.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-md border border-divider">
                <span className="w-5 h-5 rounded-full border-2 border-primary shrink-0" />
                <span className="text-small">{opt}</span>
              </div>
            ))}
          </div>
        </NotionCard>
      )}
    </div>
  );
}

// ── LIDocumentMockup ─────────────────────────────────────────────────────────

interface DocumentProps extends SquadMockupCommonProps { data?: LIDocumentData; }

export function LIDocumentMockup({ data, isActive = false }: DocumentProps) {
  const { lang } = useLang();
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="📄" eyebrow="SQUAD · LI DOCUMENT" title={lang === "en" ? "LinkedIn Document carousel" : "LinkedIn Document 輪播"} />
      <EmptyHint>{lang === "en" ? "Not generated — tap to run this task" : "尚未產出 — 點擊執行此任務"}</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.brandHandle, { title: data.documentTitle });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="📄" eyebrow="SQUAD · LI DOCUMENT" title={lang === "en" ? `LinkedIn Document (${data.slides?.length ?? 0} pages)` : `LinkedIn Document (${data.slides?.length ?? 0} 頁)`} />
          {isActive && <Chip size="sm" variant="flat" color="primary" className="self-start">{lang === "en" ? "● AI working…" : "● AI 專家思考中…"}</Chip>}
        </div>
        <LIDocument {...fields} />
      </NotionCard>
      {data.slides?.length > 0 && (
        <NotionCard>
          <SectionHeader eyebrow="SLIDE DECK" title={lang === "en" ? "Slide outline" : "投影片大綱"} />
          <div className="flex flex-col gap-2">
            {data.slides.map((s, i) => (
              <div key={i} className="flex gap-2 items-start p-2 rounded-md border border-divider">
                <div className="w-10 h-10 rounded-md bg-default-100 border border-divider flex items-center justify-center text-tiny font-semibold text-default-500 shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-small font-semibold leading-tight">{s.title}</p>
                  <p className="text-tiny text-default-700 leading-relaxed line-clamp-2">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </NotionCard>
      )}
    </div>
  );
}

// ── LINativeVideoMockup ──────────────────────────────────────────────────────

interface NativeVideoProps extends SquadMockupCommonProps { data?: LINativeVideoData; }

export function LINativeVideoMockup({ data, isActive = false }: NativeVideoProps) {
  const { lang } = useLang();
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="🎬" eyebrow="SQUAD · LI NATIVE VIDEO" title={lang === "en" ? "LinkedIn native video" : "LinkedIn 原生影片"} />
      <EmptyHint>{lang === "en" ? "Not generated — tap to run this task" : "尚未產出 — 點擊執行此任務"}</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.brandHandle, { title: data.videoTitle, liveCaption: data.body });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🎬" eyebrow="SQUAD · LI NATIVE VIDEO" title={lang === "en" ? "LinkedIn native video script" : "LinkedIn 原生影片腳本"} />
          {isActive && <Chip size="sm" variant="flat" color="primary" className="self-start">{lang === "en" ? "● AI working…" : "● AI 專家思考中…"}</Chip>}
        </div>
        <LINativeVideo {...fields} />
      </NotionCard>
      <NotionCard>
        <SectionHeader eyebrow="SCRIPT" title={lang === "en" ? "Video script structure" : "影片腳本結構"} />
        <div className="flex flex-col gap-2">
          {[
            { label: lang === "en" ? "🪝 Opening hook (first 3s)" : "🪝 開場鉤（前 3 秒）", text: data.hook },
            { label: lang === "en" ? "📖 Main body" : "📖 主體內容", text: data.body },
            { label: "🎯 CTA", text: data.cta },
          ].map((row, i) => (
            <div key={i} className="p-3 rounded-md border border-divider">
              <p className="text-tiny text-default-500 font-medium mb-0.5">{row.label}</p>
              <p className="text-small text-default-700 leading-relaxed">{row.text}</p>
            </div>
          ))}
        </div>
        {data.durationSec && (
          <p className="text-tiny text-default-500 mt-1">{lang === "en" ? `Suggested duration: ${data.durationSec}s` : `建議時長：${data.durationSec} 秒`}</p>
        )}
        {data.thumbnailDesc && (
          <p className="text-tiny text-default-500">{lang === "en" ? `Thumbnail direction: ${data.thumbnailDesc}` : `縮圖方向：${data.thumbnailDesc}`}</p>
        )}
      </NotionCard>
    </div>
  );
}

// ── LIAdMockup ───────────────────────────────────────────────────────────────

interface AdProps extends SquadMockupCommonProps { data?: LIAdData; }

export function LIAdMockup({ data, isActive = false }: AdProps) {
  const { lang } = useLang();
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="🎯" eyebrow="SQUAD · LI AD" title={lang === "en" ? "LinkedIn ad copy" : "LinkedIn 廣告文案"} />
      <EmptyHint>{lang === "en" ? "Not generated — tap to run this task" : "尚未產出 — 點擊執行此任務"}</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.brandHandle, { title: data.headline, liveCaption: data.introText });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🎯" eyebrow="SQUAD · LI AD" title={lang === "en" ? "LinkedIn ad copy" : "LinkedIn 廣告文案"} />
          {isActive && <Chip size="sm" variant="flat" color="primary" className="self-start">{lang === "en" ? "● AI working…" : "● AI 專家思考中…"}</Chip>}
        </div>
        <LIAd {...fields} />
      </NotionCard>
      <NotionCard>
        <SectionHeader eyebrow="AD BRIEF" title={lang === "en" ? "Ad brief details" : "廣告文案詳情"} />
        <div className="flex flex-col gap-2">
          <div className="p-2 rounded-md bg-default-50 border border-divider">
            <p className="text-tiny text-default-500">Headline</p>
            <p className="text-small font-semibold">{data.headline}</p>
          </div>
          <div className="p-2 rounded-md bg-default-50 border border-divider">
            <p className="text-tiny text-default-500">Intro Text</p>
            <p className="text-small leading-relaxed">{data.introText}</p>
          </div>
          <div className="p-2 rounded-md bg-default-50 border border-divider">
            <p className="text-tiny text-default-500">CTA Button</p>
            <p className="text-small font-medium text-primary">{data.cta}</p>
          </div>
          {data.targetAudience && (
            <div className="p-2 rounded-md bg-default-50 border border-divider">
              <p className="text-tiny text-default-500">Target Audience</p>
              <p className="text-small">{data.targetAudience}</p>
            </div>
          )}
        </div>
      </NotionCard>
    </div>
  );
}

// ── LIEventMockup ─────────────────────────────────────────────────────────────

interface EventProps extends SquadMockupCommonProps { data?: LIEventData; }

export function LIEventMockup({ data, isActive = false }: EventProps) {
  const { lang } = useLang();
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="📅" eyebrow="ATOMIC · LI EVENT" title={lang === "en" ? "LinkedIn event promo" : "LinkedIn 活動宣傳"} />
      <EmptyHint>{lang === "en" ? "Not generated — tap to run this task" : "尚未產出 — 點擊執行此任務"}</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.brandHandle, { title: data.eventName, brief: data.description });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="📅" eyebrow="ATOMIC · LI EVENT" title={lang === "en" ? "LinkedIn event promo" : "LinkedIn 活動宣傳"} />
          {isActive && <Chip size="sm" variant="flat" color="primary" className="self-start">{lang === "en" ? "● AI working…" : "● AI 專家思考中…"}</Chip>}
        </div>
        <LIEvent {...fields} />
      </NotionCard>
      <NotionCard>
        <SectionHeader eyebrow="EVENT DETAILS" title={lang === "en" ? "Event details" : "活動詳情"} />
        <div className="flex flex-col gap-1.5 text-small">
          <p>🗓️ <strong>{lang === "en" ? "Time: " : "時間："}</strong>{data.dateTime}</p>
          {data.location && <p>📍 <strong>{lang === "en" ? "Location: " : "地點："}</strong>{data.location}</p>}
          <p className="text-default-700 leading-relaxed mt-1">{data.description}</p>
          {data.cta && <p className="text-primary font-medium mt-1">👉 {data.cta}</p>}
        </div>
      </NotionCard>
    </div>
  );
}
