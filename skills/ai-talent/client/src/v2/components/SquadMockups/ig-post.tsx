/**
 * IGPostBriefMockup — Instagram single-post + carousel preview.
 *
 * Differs from FBPostBriefMockup:
 *   - Square 1:1 image frame (FB allows landscape)
 *   - IG-specific chrome (heart / comment / paper-plane / bookmark)
 *   - Caption appears UNDER the image, NOT inside the post block
 *   - @ mentions and #hashtags get highlighted
 *   - Location pin row above the image
 *   - Carousel mode: dots indicator + slide counter
 *
 * Usage: data.briefs is an array — single-post mode renders 1 card,
 * carousel mode (length > 1) renders the same UI with slide-counter.
 */
import React from "react";
import { Chip } from "@heroui/react";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface IGPostBrief {
  index?: number;            // 1-based for carousel display
  title?: string;            // optional headline (1st-line / on-image text)
  body: string;              // visible-on-image copy / caption excerpt
  visualDirection: string;   // image / illustration brief
  altText?: string;          // accessibility alt text
}

export interface IGPostData {
  brandHandle: string;       // e.g. "@pokemon_go_tw"
  brandAvatarUrl?: string | null;
  location?: string;         // e.g. "台北市・大安森林公園"
  mode: "single" | "carousel";
  briefs: IGPostBrief[];     // 1 for single, 2-10 for carousel
  caption: string;           // full caption shown under the post
  hashtags: string[];
  mentions?: string[];       // @other_brand collabs
  firstComment?: string;     // optional auto-comment for hashtag bundling
}

interface Props extends SquadMockupCommonProps {
  data?: IGPostData;
  onChange?: (next: Partial<IGPostData>) => void;
}

function formatCaption(caption: string, hashtags: string[], mentions: string[] = []): React.ReactNode {
  // Render with @mentions and #hashtags highlighted
  const tokens = (caption || "").split(/(\s+|@\w+|#[\w一-龥]+)/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? "";
    if (t.startsWith("@")) out.push(<span key={i} className="text-primary">{t}</span>);
    else if (t.startsWith("#")) out.push(<span key={i} className="text-primary">{t}</span>);
    else out.push(<React.Fragment key={i}>{t}</React.Fragment>);
  }
  return out;
}

export function IGPostBriefMockup({ data, isActive = false }: Props) {
  if (!data || !Array.isArray(data.briefs) || data.briefs.length === 0) {
    return (
      <NotionCard>
        <SectionHeader icon="📷" eyebrow="ATOMIC · IG POST" title="IG 單篇貼文 / 輪播" />
        <EmptyHint>{!data ? "尚未產出 — 點擊執行此任務" : "資料不完整 — 缺 briefs"}</EmptyHint>
      </NotionCard>
    );
  }

  const slides = data.briefs;
  const isCarousel = data.mode === "carousel" || slides.length > 1;
  const handle = data.brandHandle?.replace(/^@/, "") ?? "your_brand";

  return (
    <div className="flex flex-col gap-3 max-w-md">
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

        {/* IG post mockup — phone-feed-style card */}
        <div className="bg-content1 border border-divider rounded-md overflow-hidden">
          {/* Header: avatar + handle + location + ⋯ menu */}
          <div className="flex items-center gap-2 px-3 py-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-tiny font-semibold text-white shrink-0"
              style={{
                background: data.brandAvatarUrl
                  ? `url(${data.brandAvatarUrl}) center/cover`
                  : "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
              }}
            >
              {!data.brandAvatarUrl && handle[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-tiny font-semibold leading-tight truncate">{handle}</p>
              {data.location && (
                <p className="text-tiny text-default-500 leading-tight truncate">📍 {data.location}</p>
              )}
            </div>
            <span className="text-default-400 text-medium leading-none">⋯</span>
          </div>

          {/* Square 1:1 image area */}
          <div className="relative bg-default-100 border-y border-divider" style={{ aspectRatio: "1 / 1" }}>
            <div className="absolute inset-0 flex items-center justify-center text-default-500 text-tiny px-6 text-center leading-relaxed">
              <div>
                <p className="text-default-400 uppercase tracking-wider mb-2">VISUAL</p>
                <p className="text-foreground/80 whitespace-pre-wrap">{slides[0]!.visualDirection || "（視覺方向未填）"}</p>
                {slides[0]!.title && (
                  <p className="mt-3 text-default-700 font-semibold">{slides[0]!.title}</p>
                )}
              </div>
            </div>
            {isCarousel && (
              <div className="absolute top-2 right-2">
                <Chip size="sm" variant="flat" className="h-5 text-tiny bg-black/60 text-white">
                  1/{slides.length}
                </Chip>
              </div>
            )}
          </div>

          {/* Action row — IG icons */}
          <div className="flex items-center gap-3 px-3 py-2 text-foreground">
            <span className="text-medium">♡</span>
            <span className="text-medium">💬</span>
            <span className="text-medium">↗</span>
            <span className="ml-auto text-medium">🔖</span>
          </div>

          {/* Carousel dots */}
          {isCarousel && (
            <div className="flex items-center justify-center gap-1 pb-1">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className={`rounded-full ${i === 0 ? "bg-primary" : "bg-default-300"}`}
                  style={{ width: 5, height: 5 }}
                />
              ))}
            </div>
          )}

          {/* Caption preview */}
          <div className="px-3 pb-2">
            <p className="text-tiny leading-relaxed">
              <span className="font-semibold">{handle}</span>{" "}
              <span className="text-foreground">
                {formatCaption(data.caption?.slice(0, 200) || "", data.hashtags ?? [], data.mentions ?? [])}
                {(data.caption?.length ?? 0) > 200 && <span className="text-default-500"> ...更多</span>}
              </span>
            </p>
          </div>
        </div>
      </NotionCard>

      {/* Carousel slide list (when carousel) */}
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

      {/* Full caption + hashtags */}
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
