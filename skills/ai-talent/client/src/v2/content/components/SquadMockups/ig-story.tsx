/**
 * IGStoryMockup — squad-step renderer for IG Story series.
 *
 * Wraps PlatformMockup's IGStories for the visual preview, then adds
 * squad-mockup-specific sections: per-slide timeline + sticker config.
 *
 * Per CJ correction 2026-05-02: don't duplicate IG chrome. The phone-frame
 * progress-bars + DM input + heart/share icons all live in IGStories
 * (PlatformMockup/instagram.tsx).
 */
import { Chip } from "@heroui/react";
import { IGStories } from "../PlatformMockup/instagram";
import type { MockupFields } from "../PlatformMockup/shared";
import { useLang } from "../../../../lib/i18n";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export type StickerKind = "poll" | "question" | "quiz" | "link" | "countdown" | "music" | "location" | "mention";

export interface StorySticker {
  kind: StickerKind;
  text: string;
  options?: string[];
  position?: "top" | "middle" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export interface IGStorySlide {
  index: number;
  durationSec: number;
  title?: string;
  body?: string;
  visualDirection: string;
  bgKind: "image" | "video" | "boomerang" | "gradient";
  stickers: StorySticker[];
  voiceover?: string;
}

export interface IGStorySeries {
  brandHandle: string;
  brandAvatarUrl?: string | null;
  arcSummary: string;
  slides: IGStorySlide[];
  highlightCover?: string;
}

interface Props extends SquadMockupCommonProps {
  data?: IGStorySeries;
  onChange?: (next: Partial<IGStorySeries>) => void;
}

const STICKER_LABEL_EN: Record<StickerKind, string> = {
  poll:      "📊 Poll",
  question:  "❓ Question",
  quiz:      "🎯 Quiz",
  link:      "🔗 Link",
  countdown: "⏳ Countdown",
  music:     "🎵 Music",
  location:  "📍 Location",
  mention:   "@ Mention",
};

const STICKER_LABEL: Record<StickerKind, string> = {
  poll:      "📊 票",
  question:  "❓ 問",
  quiz:      "🎯 測",
  link:      "🔗 連結",
  countdown: "⏳ 倒數",
  music:     "🎵 音樂",
  location:  "📍 位置",
  mention:   "@ 標註",
};

function toMockupFields(data: IGStorySeries): MockupFields {
  const first = data.slides[0];
  return {
    title: first?.title ?? data.arcSummary ?? "",
    brief: first?.body ?? "",
    brandName: data.brandHandle?.replace(/^@/, "") ?? null,
    liveImageDesc: first?.visualDirection ?? "",
  };
}

export function IGStoryMockup({ data, isActive = false }: Props) {
  const { lang } = useLang();
  if (!data || !Array.isArray(data.slides) || data.slides.length === 0) {
    return (
      <NotionCard>
        <SectionHeader icon="📱" eyebrow="ATOMIC · IG STORY" title={lang === "en" ? "IG Stories series" : "IG Stories 系列"} />
        <EmptyHint>{!data ? (lang === "en" ? "Not generated yet — click to run this task" : "尚未產出 — 點擊執行此任務") : (lang === "en" ? "Incomplete data — slides missing" : "資料不完整 — 缺 slides")}</EmptyHint>
      </NotionCard>
    );
  }

  const slides = data.slides;
  const fields = toMockupFields(data);

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon="📱"
            eyebrow="ATOMIC · IG STORY"
            title={lang === "en" ? `IG Stories · ${slides.length}-slide series` : `IG Stories · ${slides.length} 張連續系列`}
          />
          {isActive && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              {lang === "en" ? "● AI expert thinking…" : "● AI 專家思考中…"}
            </Chip>
          )}
        </div>
        <p className="text-tiny text-default-500">{lang === "en" ? "Narrative arc:" : "敘事弧："}{data.arcSummary || (lang === "en" ? "(not filled)" : "（未填）")}</p>
      </NotionCard>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3">
        {/* Visual preview — reuse PlatformMockup's IGStories chrome */}
        <div className="md:sticky md:top-2 md:self-start">
          <IGStories {...fields} />
        </div>

        {/* Series timeline (squad-mockup-specific) */}
        <NotionCard>
          <SectionHeader eyebrow="STORY SERIES" title={lang === "en" ? "Series script" : "連續腳本"} />
          <div className="flex flex-col">
            {slides.map((s) => (
              <div
                key={s.index}
                className="grid grid-cols-[40px_1fr] gap-3 py-2 border-b border-divider last:border-0"
              >
                <div className="flex flex-col items-center gap-1">
                  <Chip size="sm" variant="flat" color="primary" className="h-5 text-tiny w-full justify-center">
                    {s.index}
                  </Chip>
                  <span className="text-tiny text-default-500 tabular-nums">{s.durationSec}s</span>
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  {s.title && (
                    <p className="text-small font-semibold leading-snug">{s.title}</p>
                  )}
                  {s.body && (
                    <p className="text-tiny text-default-700 leading-relaxed">{s.body}</p>
                  )}
                  {s.voiceover && (
                    <p className="text-tiny text-default-500 leading-relaxed">🎙 {s.voiceover}</p>
                  )}
                  <p className="text-tiny text-default-500 leading-relaxed">🎨 {s.visualDirection}</p>
                  {s.stickers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {s.stickers.map((st, i) => (
                        <Chip key={i} size="sm" variant="flat" className="h-4 text-tiny">
                          {(lang === "en" ? STICKER_LABEL_EN : STICKER_LABEL)[st.kind]} {st.text.slice(0, 12)}{st.text.length > 12 ? "…" : ""}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </NotionCard>
      </div>

      {data.highlightCover && (
        <NotionCard>
          <SectionHeader eyebrow="HIGHLIGHT" title={lang === "en" ? "Highlight cover" : "精選永久封面"} />
          <p className="text-tiny text-default-700">{lang === "en" ? <>Use Story #{data.highlightCover} as the Highlight cover; keep the category name aligned with the arc summary.</> : <>建議用 Story #{data.highlightCover} 做 Highlight cover，分類名稱跟 arc summary 對齊。</>}</p>
        </NotionCard>
      )}
    </div>
  );
}
