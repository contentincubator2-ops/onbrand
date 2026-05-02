/**
 * IGStoryMockup — Instagram Story preview (24h vertical 9:16).
 *
 * Renders a phone-frame stack with:
 *   - Top progress bars (one segment per story in the series)
 *   - Profile avatar / handle + ⋯ menu
 *   - 9:16 visual area with text + sticker overlays
 *   - Sticker zones (poll / question / quiz / link / countdown / music)
 *   - Bottom DM input + reaction icons
 *
 * Designed for series mode — 3-7 stories that flow as a sequence (e.g.
 * 24h takeover, behind-the-scenes thread, AMA arc). Each story is a
 * separate "slide" in the data.
 */
import React from "react";
import { Chip } from "@heroui/react";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export type StickerKind = "poll" | "question" | "quiz" | "link" | "countdown" | "music" | "location" | "mention";

export interface StorySticker {
  kind: StickerKind;
  text: string;             // poll question / link CTA / etc.
  options?: string[];       // poll/quiz options
  position?: "top" | "middle" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export interface IGStorySlide {
  index: number;            // 1-based
  durationSec: number;      // 5-15s typical; longer = video
  title?: string;           // big text overlay (centered by default)
  body?: string;            // sub-text
  visualDirection: string;  // image / video brief
  bgKind: "image" | "video" | "boomerang" | "gradient";
  stickers: StorySticker[];
  voiceover?: string;       // narrator if it's a video
}

export interface IGStorySeries {
  brandHandle: string;
  brandAvatarUrl?: string | null;
  arcSummary: string;       // 1-line story arc (e.g. "新品開箱 24h takeover")
  slides: IGStorySlide[];
  highlightCover?: string;  // optional: which slide becomes Highlight cover
}

interface Props extends SquadMockupCommonProps {
  data?: IGStorySeries;
  onChange?: (next: Partial<IGStorySeries>) => void;
}

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

const POSITION_CLASS: Record<NonNullable<StorySticker["position"]>, string> = {
  "top":          "top-12 left-1/2 -translate-x-1/2",
  "middle":       "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  "bottom":       "bottom-20 left-1/2 -translate-x-1/2",
  "top-left":     "top-12 left-3",
  "top-right":    "top-12 right-3",
  "bottom-left":  "bottom-20 left-3",
  "bottom-right": "bottom-20 right-3",
};

export function IGStoryMockup({ data, isActive = false }: Props) {
  if (!data || !Array.isArray(data.slides) || data.slides.length === 0) {
    return (
      <NotionCard>
        <SectionHeader icon="📱" eyebrow="ATOMIC · IG STORY" title="IG Stories 系列" />
        <EmptyHint>{!data ? "尚未產出 — 點擊執行此任務" : "資料不完整 — 缺 slides"}</EmptyHint>
      </NotionCard>
    );
  }

  const slides = data.slides;
  const handle = data.brandHandle?.replace(/^@/, "") ?? "your_brand";
  // Use first slide for the phone preview
  const preview = slides[0]!;

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon="📱"
            eyebrow="ATOMIC · IG STORY"
            title={`IG Stories · ${slides.length} 張連續系列`}
          />
          {isActive && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              ● agent 思考中…
            </Chip>
          )}
        </div>
        <p className="text-tiny text-default-500">敘事弧：{data.arcSummary || "（未填）"}</p>
      </NotionCard>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-3">
        {/* Phone preview (9:16, first slide) */}
        <NotionCard className="md:sticky md:top-2 md:self-start">
          <SectionHeader eyebrow="PREVIEW" title={`Story 1 · ${preview.durationSec}s`} />
          <div
            className="relative mx-auto rounded-2xl border-4 border-default-300 bg-black overflow-hidden"
            style={{ width: 200, aspectRatio: "9 / 16" }}
          >
            {/* Top progress bars — one per slide */}
            <div className="absolute top-1.5 left-1.5 right-1.5 flex gap-0.5 z-10">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
                >
                  <span className={`block h-full ${i === 0 ? "bg-white w-1/3" : i < 0 ? "bg-white" : ""}`} />
                </span>
              ))}
            </div>
            {/* Profile row */}
            <div className="absolute top-4 left-2 right-2 flex items-center gap-1.5 z-10">
              <div
                className="w-6 h-6 rounded-full border border-white text-tiny font-semibold flex items-center justify-center text-white shrink-0"
                style={{
                  background: data.brandAvatarUrl
                    ? `url(${data.brandAvatarUrl}) center/cover`
                    : "linear-gradient(45deg, #f09433, #dc2743, #bc1888)",
                }}
              >
                {!data.brandAvatarUrl && handle[0]?.toUpperCase()}
              </div>
              <span className="text-tiny font-semibold text-white truncate">{handle}</span>
              <span className="text-tiny text-white/70 ml-auto">⋯</span>
              <span className="text-tiny text-white/70">×</span>
            </div>

            {/* Visual placeholder */}
            <div className="absolute inset-0 flex items-center justify-center text-default-200 text-tiny px-3 text-center leading-relaxed opacity-50">
              {preview.visualDirection || "（視覺方向未填）"}
            </div>

            {/* Title / body overlay (centered if no position specified for stickers) */}
            {preview.title && (
              <div className="absolute top-1/2 left-2 right-2 -translate-y-1/2 text-center z-10">
                <span className="inline-block px-2 py-1 rounded-md bg-white text-foreground text-medium font-bold leading-tight">
                  {preview.title}
                </span>
              </div>
            )}

            {/* Stickers */}
            {preview.stickers.map((s, i) => (
              <div
                key={i}
                className={`absolute z-10 ${POSITION_CLASS[s.position ?? "bottom"]}`}
                style={{ maxWidth: "85%" }}
              >
                <div className="px-2 py-1 rounded-md bg-white/95 border border-default-200 shadow text-tiny font-medium text-foreground leading-tight">
                  <span className="text-tiny text-default-500 uppercase tracking-wider mr-1">{STICKER_LABEL[s.kind]}</span>
                  <span>{s.text}</span>
                </div>
              </div>
            ))}

            {/* Bottom DM input */}
            <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 z-10">
              <div className="flex-1 px-2 py-1 rounded-full border border-white/40 text-tiny text-white/70">
                傳訊息…
              </div>
              <span className="text-white text-medium">♥</span>
              <span className="text-white text-medium">↗</span>
            </div>
          </div>
          <p className="text-tiny text-default-500 mt-2 leading-relaxed">
            背景：{preview.bgKind === "video" ? "🎬 影片" : preview.bgKind === "boomerang" ? "🔁 Boomerang" : preview.bgKind === "gradient" ? "🌈 純漸層" : "🖼 靜態圖"}
          </p>
        </NotionCard>

        {/* Series timeline */}
        <NotionCard>
          <SectionHeader eyebrow="STORY SERIES" title="連續腳本" />
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
                          {STICKER_LABEL[st.kind]} {st.text.slice(0, 12)}{st.text.length > 12 ? "…" : ""}
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
          <SectionHeader eyebrow="HIGHLIGHT" title="精選永久封面" />
          <p className="text-tiny text-default-700">建議用 Story #{data.highlightCover} 做 Highlight cover，分類名稱跟 arc summary 對齊。</p>
        </NotionCard>
      )}
    </div>
  );
}
