/**
 * IGPostBriefMockup — squad-step renderer for IG single-post / carousel.
 *
 * ARCHITECTURE: wraps existing PlatformMockup chrome (IGFeed / IGCarousel)
 * for the visual preview. Adds structured-data sections (slide list,
 * full caption, hashtags, first-comment slot) that are SquadMockup-
 * specific. Avoids duplicating IG chrome / icons / dicebear avatars.
 *
 * Per CJ correction 2026-05-02: 「mockup 都是參考原有的組件，對嗎」.
 * Yes — this wraps IGFeed/IGCarousel from ../PlatformMockup/instagram
 * rather than reinventing the IG post UI.
 */
import React from "react";
import { Chip } from "@heroui/react";
import { IGFeed, IGCarousel } from "../PlatformMockup/instagram";
import type { MockupFields } from "../PlatformMockup/shared";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface IGPostBrief {
  index?: number;
  title?: string;
  body: string;
  visualDirection: string;
  altText?: string;
}

export interface IGPostData {
  brandHandle: string;
  brandAvatarUrl?: string | null;
  location?: string;
  mode: "single" | "carousel";
  briefs: IGPostBrief[];
  caption: string;
  hashtags: string[];
  mentions?: string[];
  firstComment?: string;
}

interface Props extends SquadMockupCommonProps {
  data?: IGPostData;
  onChange?: (next: Partial<IGPostData>) => void;
}

/** Project squad-mockup data into PlatformMockup's MockupFields shape. */
function toMockupFields(data: IGPostData, idx = 0): MockupFields {
  const slide = data.briefs[idx];
  return {
    title: slide?.title ?? "",
    brief: slide?.body ?? "",
    brandName: data.brandHandle?.replace(/^@/, "") ?? null,
    liveCaption: data.caption,
    liveHashtags: data.hashtags,
    liveImageDesc: slide?.visualDirection ?? "",
  };
}

export function IGPostBriefMockup({ data, isActive = false }: Props) {
  if (!data || !Array.isArray(data.briefs) || data.briefs.length === 0) {
    return (
      <NotionCard>
        <SectionHeader icon="📷" eyebrow="ATOMIC · IG POST" title="IG 單篇貼文 / 輪播" />
        <EmptyHint>{!data ? "尚未產出 — 點擊執行此任務" : "資料不完整 — 缺企劃摘要"}</EmptyHint>
      </NotionCard>
    );
  }

  const slides = data.briefs;
  const isCarousel = data.mode === "carousel" || slides.length > 1;
  const fields = toMockupFields(data, 0);

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon="📷"
            eyebrow={isCarousel ? "ATOMIC · IG CAROUSEL" : "ATOMIC · IG POST"}
            title={isCarousel ? `IG 輪播 (${slides.length} 張)` : "IG 單篇貼文"}
          />
          {isActive && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              ● agent 思考中…
            </Chip>
          )}
        </div>
        {/* Reuse existing PlatformMockup IG chrome — same visual language as
            picker live preview, no duplicated heart/comment/bookmark icons. */}
        {isCarousel ? <IGCarousel {...fields} /> : <IGFeed {...fields} />}
      </NotionCard>

      {/* Carousel slide list (squad-mockup-specific structured editing) */}
      {isCarousel && (
        <NotionCard>
          <SectionHeader eyebrow="DECK" title="輪播每張卡片" />
          <div className="flex flex-col gap-2">
            {slides.map((s, i) => (
              <div key={i} className="flex gap-2 items-start p-2 rounded-md border border-divider">
                <div className="w-12 h-12 rounded-md bg-default-100 border border-divider flex items-center justify-center text-tiny font-semibold text-default-500 shrink-0">
                  {i + 1}/{slides.length}
                </div>
                <div className="flex-1 min-w-0">
                  {s.title && <p className="text-small font-semibold leading-tight">{s.title}</p>}
                  <p className="text-tiny text-default-700 leading-relaxed line-clamp-2">{s.body}</p>
                  <p className="text-tiny text-default-500 mt-0.5 line-clamp-1">🎨 {s.visualDirection}</p>
                </div>
              </div>
            ))}
          </div>
        </NotionCard>
      )}

      {/* Full caption + hashtags + first-comment (squad-mockup additions) */}
      <NotionCard>
        <SectionHeader eyebrow="CAPTION" title="完整貼文文字" />
        <pre className="text-small leading-relaxed whitespace-pre-wrap font-sans bg-default-50 border border-divider rounded-md p-3">
          {data.caption || "（caption 未產出）"}
        </pre>
        {data.hashtags && data.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {data.hashtags.map((tag, i) => (
              <Chip key={i} size="sm" variant="flat" color="primary" className="h-5 text-tiny">
                {tag.startsWith("#") ? tag : `#${tag}`}
              </Chip>
            ))}
          </div>
        )}
        {data.firstComment && (
          <div className="mt-2 p-2 rounded-md bg-default-50 border border-divider">
            <p className="text-tiny text-default-500 mb-0.5">第一則自動留言（hashtag bundle）：</p>
            <p className="text-tiny text-default-700">{data.firstComment}</p>
          </div>
        )}
      </NotionCard>
    </div>
  );
}
