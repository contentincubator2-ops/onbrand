/**
 * FBCarouselMockup — squad-step renderer for FB carousel deck.
 *
 * Wraps PlatformMockup's FBCarousel for the visual preview, then adds
 * squad-mockup-specific sections (per-slide arc tagging, caption,
 * hashtags). Avoids duplicating FB chrome.
 */
import React from "react";
import { Chip } from "@heroui/react";
import { FBCarousel } from "../PlatformMockup/facebook";
import type { MockupFields } from "../PlatformMockup/shared";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface CarouselSlide {
  index: number;
  title: string;
  body: string;
  visualDirection: string;
  arcPosition: "hook" | "build" | "turn" | "payoff" | "cta";
}

export interface CarouselDeck {
  topic: string;
  hookLine: string;
  arcSummary: string;
  slides: CarouselSlide[];
  caption: string;
  hashtags: string[];
}

interface Props extends SquadMockupCommonProps {
  data?: CarouselDeck;
  onChange?: (next: Partial<CarouselDeck>) => void;
}

const ARC_TONE: Record<CarouselSlide["arcPosition"], { label: string; color: "primary" | "secondary" | "warning" | "success" | "default" }> = {
  hook:    { label: "Hook",    color: "primary" },
  build:   { label: "Build",   color: "secondary" },
  turn:    { label: "Turn",    color: "warning" },
  payoff:  { label: "Payoff",  color: "success" },
  cta:     { label: "CTA",     color: "default" },
};

function toMockupFields(data: CarouselDeck): MockupFields {
  const first = data.slides[0];
  return {
    title: data.topic ?? "",
    brief: data.hookLine ?? data.arcSummary ?? "",
    brandName: null,
    liveCaption: data.caption,
    liveHashtags: data.hashtags,
    liveImageDesc: first?.visualDirection ?? "",
  };
}

export function FBCarouselMockup({ data, isActive = false }: Props) {
  if (!data || !data.slides || data.slides.length === 0) {
    return (
      <NotionCard>
        <SectionHeader icon="🖼" eyebrow="ATOMIC · FB CAROUSEL" title="FB 輪播圖文" />
        <EmptyHint>{!data ? "尚未產出 — 點擊執行此任務" : "資料不完整 — 缺 slides"}</EmptyHint>
      </NotionCard>
    );
  }

  const slides = data.slides;
  const fields = toMockupFields(data);

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🖼" eyebrow="ATOMIC · FB CAROUSEL" title={data.topic || "FB 輪播圖文"} />
          {isActive && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              ● AI 專家思考中…
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-2 text-tiny text-default-500">
          <span>共 {slides.length} 張</span>
          <span>·</span>
          <span>敘事弧：{data.arcSummary || "（未填）"}</span>
        </div>
        {data.hookLine && (
          <p className="text-medium font-semibold leading-snug mt-1">{data.hookLine}</p>
        )}
        {/* Reuse existing PlatformMockup FB carousel chrome */}
        <FBCarousel {...fields} />
      </NotionCard>

      {/* Per-slide arc tagging — squad-mockup-specific structured editing */}
      <NotionCard>
        <SectionHeader eyebrow="DECK" title="每張卡片 + 敘事弧位置" />
        <div className="flex flex-col gap-2">
          {slides.map((s) => {
            const arc = ARC_TONE[s.arcPosition] ?? ARC_TONE.build;
            return (
              <div
                key={s.index}
                className="flex gap-2 items-start p-2 rounded-md border border-divider"
              >
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <Chip size="sm" variant="flat" color={arc.color} className="h-5 text-tiny w-full justify-center">
                    {s.index}/{slides.length}
                  </Chip>
                  <span className="text-tiny text-default-500">{arc.label}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-small font-semibold leading-tight">{s.title}</p>
                  <p className="text-tiny text-default-700 leading-relaxed mt-0.5">{s.body}</p>
                  <p className="text-tiny text-default-500 leading-relaxed mt-1">🎨 {s.visualDirection}</p>
                </div>
              </div>
            );
          })}
        </div>
      </NotionCard>
    </div>
  );
}
