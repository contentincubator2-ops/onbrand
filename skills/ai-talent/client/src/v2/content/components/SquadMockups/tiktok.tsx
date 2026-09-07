/**
 * TikTok SquadMockup wrappers.
 *
 * Wraps PlatformMockup/tiktok.tsx chrome — reuses TTForYou, TTCarousel,
 * TTLive components. Adds script structure sections.
 *
 * Variants:
 *   TTForYouMockup    — FYP video script (hook/hold/payoff)
 *   TTCarouselMockup  — photo carousel post
 *   TTLiveMockup      — live stream run-of-show
 */
import { Chip } from "@heroui/react";
import { TTForYou, TTCarousel, TTLive } from "../PlatformMockup/tiktok";
import type { MockupFields } from "../PlatformMockup/shared";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

// ── Data shapes ──────────────────────────────────────────────────────────────

export interface TTVideoScript {
  creatorHandle: string;
  creatorAvatarUrl?: string | null;
  videoTitle: string;
  hook: string;       // 0–3s
  hold: string;       // main content
  payoff: string;     // CTA / loop
  audioTrack?: string;
  overlayTexts?: string[];
  hashtags?: string[];
  durationSec?: number;
}

export interface TTCarouselData {
  creatorHandle: string;
  slides: { imageDesc: string; caption: string }[];
  caption: string;
  hashtags?: string[];
}

export interface TTLiveData {
  creatorHandle: string;
  streamTitle: string;
  scheduledTime: string;
  runOfShow: { time: string; segment: string; notes?: string }[];
  expectedDurationMin?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toFields(handle: string, extra: Partial<MockupFields> = {}): MockupFields {
  return {
    brandName: handle?.replace(/^@/, "") ?? null,
    title: extra.title ?? "",
    brief: extra.brief ?? "",
    liveCaption: extra.liveCaption,
    liveHashtags: extra.liveHashtags,
    liveImageDesc: extra.liveImageDesc,
  };
}

// ── TTForYouMockup ───────────────────────────────────────────────────────────

interface ForYouProps extends SquadMockupCommonProps { data?: TTVideoScript; }

export function TTForYouMockup({ data, isActive = false }: ForYouProps) {
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="🎵" eyebrow="SQUAD · TT FORYOU" title="TikTok 短影音腳本" />
      <EmptyHint>尚未產出 — 點擊執行此任務</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.creatorHandle, {
    title: data.videoTitle,
    liveHashtags: data.hashtags,
  });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🎵" eyebrow="SQUAD · TT FORYOU" title={`TikTok 短影音（${data.durationSec ?? 60}秒）`} />
          {isActive && <Chip size="sm" variant="flat" color="secondary" className="self-start">● AI 專家思考中…</Chip>}
        </div>
        <TTForYou {...fields} />
      </NotionCard>

      <NotionCard>
        <SectionHeader eyebrow="SCRIPT" title="腳本三段式結構" />
        <div className="flex flex-col gap-2">
          {[
            { label: "🪝 開場鉤（0–3s）", text: data.hook, color: "border-l-secondary" },
            { label: "⏱ 主體段落（主體內容）", text: data.hold, color: "border-l-warning" },
            { label: "🔁 結尾回報 / 循環 / CTA", text: data.payoff, color: "border-l-success" },
          ].map((row, i) => (
            <div key={i} className={`p-3 rounded-md border border-divider border-l-4 ${row.color} bg-default-50`}>
              <p className="text-tiny text-default-500 font-medium mb-0.5">{row.label}</p>
              <p className="text-small text-default-700 leading-relaxed">{row.text}</p>
            </div>
          ))}
        </div>
        {data.audioTrack && <p className="text-tiny text-default-500 mt-1">🎵 配樂方向：{data.audioTrack}</p>}
        {data.overlayTexts && data.overlayTexts.length > 0 && (
          <div className="mt-1">
            <p className="text-tiny text-default-500 font-medium mb-0.5">字幕 Overlay：</p>
            <div className="flex flex-wrap gap-1.5">
              {data.overlayTexts.map((t, i) => (
                <Chip key={i} size="sm" variant="flat" className="h-5 text-tiny">{t}</Chip>
              ))}
            </div>
          </div>
        )}
      </NotionCard>

      {data.hashtags && data.hashtags.length > 0 && (
        <NotionCard>
          <SectionHeader eyebrow="HASHTAGS" title="標籤策略" />
          <div className="flex flex-wrap gap-1.5">
            {data.hashtags.map((t, i) => (
              <Chip key={i} size="sm" variant="flat" color="secondary" className="h-5 text-tiny">
                {t.startsWith("#") ? t : `#${t}`}
              </Chip>
            ))}
          </div>
        </NotionCard>
      )}
    </div>
  );
}

// ── TTCarouselMockup ─────────────────────────────────────────────────────────

interface CarouselProps extends SquadMockupCommonProps { data?: TTCarouselData; }

export function TTCarouselMockup({ data, isActive = false }: CarouselProps) {
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="🖼️" eyebrow="ATOMIC · TT CAROUSEL" title="TikTok 輪播圖文" />
      <EmptyHint>尚未產出 — 點擊執行此任務</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.creatorHandle, {
    liveCaption: data.caption, liveHashtags: data.hashtags,
  });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🖼️" eyebrow="ATOMIC · TT CAROUSEL" title={`TikTok 輪播圖文（${data.slides?.length ?? 0} 張）`} />
          {isActive && <Chip size="sm" variant="flat" color="secondary" className="self-start">● AI 專家思考中…</Chip>}
        </div>
        <TTCarousel {...fields} />
      </NotionCard>
      {data.slides?.length > 0 && (
        <NotionCard>
          <SectionHeader eyebrow="SLIDES" title="每張卡片內容" />
          <div className="flex flex-col gap-2">
            {data.slides.map((s, i) => (
              <div key={i} className="flex gap-2 items-start p-2 rounded-md border border-divider">
                <div className="w-10 h-10 rounded-md bg-default-100 border border-divider flex items-center justify-center text-tiny font-semibold text-default-500 shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-tiny text-default-500">🎨 {s.imageDesc}</p>
                  <p className="text-small text-default-700 leading-relaxed">{s.caption}</p>
                </div>
              </div>
            ))}
          </div>
        </NotionCard>
      )}
    </div>
  );
}

// ── TTLiveMockup ─────────────────────────────────────────────────────────────

interface TtLiveProps extends SquadMockupCommonProps { data?: TTLiveData; }

export function TTLiveMockup({ data, isActive = false }: TtLiveProps) {
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="🔴" eyebrow="SQUAD · TT LIVE" title="TikTok 直播企劃" />
      <EmptyHint>尚未產出 — 點擊執行此任務</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.creatorHandle, { title: data.streamTitle });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🔴" eyebrow="SQUAD · TT LIVE" title="TikTok 直播企劃" />
          {isActive && <Chip size="sm" variant="flat" color="secondary" className="self-start">● LIVE</Chip>}
        </div>
        <TTLive {...fields} />
      </NotionCard>
      {data.runOfShow?.length > 0 && (
        <NotionCard>
          <SectionHeader eyebrow="RUN OF SHOW" title={`直播流程表（${data.expectedDurationMin ?? "?"}分鐘）`} />
          <div className="flex flex-col gap-1.5">
            {data.runOfShow.map((row, i) => (
              <div key={i} className="flex gap-2 p-2 rounded-md border border-divider">
                <span className="text-tiny font-mono text-default-500 shrink-0 pt-0.5">{row.time}</span>
                <div>
                  <p className="text-small font-medium">{row.segment}</p>
                  {row.notes && <p className="text-tiny text-default-500">{row.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </NotionCard>
      )}
    </div>
  );
}
