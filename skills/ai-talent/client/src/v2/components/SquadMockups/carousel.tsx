/**
 * FBCarouselMockup — atomic task fb-carousel output.
 *
 * Renders a multi-slide deck preview: 5-10 cards with per-slide title +
 * body + visual direction + optional CTA on the final card. Shows the
 * narrative arc (hook / build / payoff) so the user sees how the
 * sequence flows, not just one slide in isolation.
 *
 * Differs from FBPostBriefMockup (which is a single post card) — this
 * is a horizontal swipe deck with a slide counter + progress bar.
 */
import React from "react";
import { Chip, Progress } from "@heroui/react";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface CarouselSlide {
  index: number;            // 1-based for display
  title: string;            // big text on slide
  body: string;             // sub-headline / supporting line
  visualDirection: string;  // image / illustration brief
  arcPosition: "hook" | "build" | "turn" | "payoff" | "cta";
}

export interface CarouselDeck {
  topic: string;
  hookLine: string;         // first-slide hook
  arcSummary: string;       // 1-line narrative arc description
  slides: CarouselSlide[];
  caption: string;          // post body that accompanies the carousel
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
  const total = slides.length;

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      {/* Header */}
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🖼" eyebrow="ATOMIC · FB CAROUSEL" title={data.topic || "FB 輪播圖文"} />
          {isActive && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              ● agent 思考中…
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-2 text-tiny text-default-500">
          <span>共 {total} 張</span>
          <span>·</span>
          <span>敘事弧：{data.arcSummary || "（未填）"}</span>
        </div>
        {data.hookLine && (
          <p className="text-medium font-semibold leading-snug mt-1">
            {data.hookLine}
          </p>
        )}
      </NotionCard>

      {/* Horizontal slide deck — Apple-keynote style strip */}
      <NotionCard>
        <SectionHeader eyebrow="DECK" title="連續圖卡（左→右滑）" />
        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {slides.map((s) => {
            const arc = ARC_TONE[s.arcPosition] ?? ARC_TONE.build;
            return (
              <div
                key={s.index}
                className="shrink-0 w-[260px] border border-divider rounded-md bg-content1 flex flex-col"
                style={{ scrollSnapAlign: "start", aspectRatio: "1 / 1.1" }}
              >
                {/* Visual placeholder area — 1:1 square */}
                <div className="relative bg-default-100 border-b border-divider" style={{ aspectRatio: "1 / 1" }}>
                  <div className="absolute inset-0 flex items-center justify-center text-default-400 text-tiny px-3 text-center leading-relaxed">
                    {s.visualDirection || "（視覺方向未填）"}
                  </div>
                  <div className="absolute top-2 left-2">
                    <Chip size="sm" variant="flat" color={arc.color} className="h-5 text-tiny">
                      {s.index}/{total} · {arc.label}
                    </Chip>
                  </div>
                </div>
                {/* Caption */}
                <div className="p-2 flex flex-col gap-0.5">
                  <p className="text-small font-semibold leading-tight line-clamp-2">{s.title}</p>
                  <p className="text-tiny text-default-500 line-clamp-3">{s.body}</p>
                </div>
              </div>
            );
          })}
        </div>
        {/* Progress dots */}
        <div className="flex items-center gap-1 justify-center mt-1">
          {slides.map((_, i) => (
            <span
              key={i}
              className="rounded-full bg-default-300"
              style={{ width: i === 0 ? 16 : 5, height: 5 }}
            />
          ))}
        </div>
      </NotionCard>

      {/* Caption + hashtags accompanying the post */}
      <NotionCard>
        <SectionHeader eyebrow="POST CAPTION" title="發布時搭配的貼文文字" />
        <pre className="text-small leading-relaxed whitespace-pre-wrap font-sans bg-default-50 border border-divider rounded-md p-3">
          {data.caption || "（caption 未產出）"}
        </pre>
        {data.hashtags && data.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {data.hashtags.map((tag, i) => (
              <Chip key={i} size="sm" variant="flat" className="h-5 text-tiny">
                {tag.startsWith("#") ? tag : `#${tag}`}
              </Chip>
            ))}
          </div>
        )}
      </NotionCard>
    </div>
  );
}
