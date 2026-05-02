/**
 * IGReelsMockup — Instagram Reels script preview (9:16 short video).
 *
 * Differs from FBReelsMockup:
 *   - IG-specific chrome (heart / comment / paper-plane / bookmark
 *     stacked on right side; audio attribution at bottom-left)
 *   - Caption overlays directly on the video while playing
 *   - Audio source row (trending sound icon if applicable)
 *   - "Original audio" or "Trending" tag
 *   - Remix-eligible flag (do we want others to be able to use our audio)
 *
 * Same Hook/Hold/Build/Payoff/CTA beat structure as FBReels for
 * consistency — only chrome differs.
 */
import React from "react";
import { Chip } from "@heroui/react";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface ReelsShot {
  timecode: string;
  beat: "hook" | "hold" | "build" | "payoff" | "cta";
  onScreenText: string;
  voiceover: string;
  action: string;
  bRoll?: string;
}

export interface IGReelsScript {
  topic: string;
  duration: 15 | 30 | 60 | 90;
  hookHypothesis: string;
  audioKind: "original" | "trending" | "licensed";
  audioName?: string;        // e.g. "Trending: 周杰倫 - 稻香 (sped up)"
  remixAllowed: boolean;     // can other creators use our audio?
  caption: string;
  hashtags: string[];
  shots: ReelsShot[];
}

interface Props extends SquadMockupCommonProps {
  data?: IGReelsScript;
  onChange?: (next: Partial<IGReelsScript>) => void;
}

const BEAT_TONE: Record<ReelsShot["beat"], { label: string; color: "primary" | "secondary" | "warning" | "success" | "default" }> = {
  hook:   { label: "🎯 Hook",   color: "primary" },
  hold:   { label: "⏱ Hold",    color: "secondary" },
  build:  { label: "📈 Build",  color: "warning" },
  payoff: { label: "💥 Payoff", color: "success" },
  cta:    { label: "👉 CTA",    color: "default" },
};

const AUDIO_LABEL = {
  original:  "🎙 原創音訊",
  trending:  "🔥 熱門音樂",
  licensed:  "🎵 授權音樂",
} as const;

export function IGReelsMockup({ data, isActive = false }: Props) {
  if (!data || !Array.isArray(data.shots) || data.shots.length === 0) {
    return (
      <NotionCard>
        <SectionHeader icon="🎬" eyebrow="ATOMIC · IG REELS" title="IG Reels 短影音腳本" />
        <EmptyHint>{!data ? "尚未產出 — 點擊執行此任務" : "資料不完整 — 缺 shots"}</EmptyHint>
      </NotionCard>
    );
  }

  const hookShot = data.shots.find((s) => s.beat === "hook") ?? data.shots[0]!;

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon="🎬"
            eyebrow="ATOMIC · IG REELS"
            title={data.topic || "IG Reels 腳本"}
          />
          <div className="flex items-center gap-1.5 self-start">
            <Chip size="sm" variant="flat" className="h-5 text-tiny">
              {data.duration ?? 30}s
            </Chip>
            <Chip size="sm" variant="flat" className="h-5 text-tiny">
              {AUDIO_LABEL[data.audioKind] ?? "🎵"}
            </Chip>
            {isActive && (
              <Chip size="sm" variant="flat" color="primary" className="h-5 text-tiny">
                ● agent 思考中…
              </Chip>
            )}
          </div>
        </div>
      </NotionCard>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3">
        {/* Phone preview — IG-specific chrome */}
        <NotionCard className="md:sticky md:top-2 md:self-start">
          <SectionHeader eyebrow="PREVIEW" title="9:16 IG Reel" />
          <div
            className="relative mx-auto rounded-2xl border-4 border-default-300 bg-black overflow-hidden"
            style={{ width: 200, aspectRatio: "9 / 16" }}
          >
            {/* Visual placeholder */}
            <div className="absolute inset-0 flex items-center justify-center text-default-200 text-tiny px-2 text-center leading-relaxed opacity-50">
              {hookShot.action || "（畫面動作未填）"}
            </div>

            {/* Top time badge */}
            <div className="absolute top-2 left-2">
              <Chip size="sm" variant="flat" color="primary" className="h-5 text-tiny bg-white/80">
                {hookShot.timecode}
              </Chip>
            </div>

            {/* Center hook overlay text */}
            {hookShot.onScreenText && (
              <div className="absolute left-2 right-12 top-1/2 -translate-y-1/2 text-center">
                <span className="inline-block px-2 py-1 rounded-md bg-white/90 text-foreground text-medium font-bold leading-tight">
                  {hookShot.onScreenText}
                </span>
              </div>
            )}

            {/* IG action stack on right */}
            <div className="absolute right-2 top-1/2 -translate-y-1/4 flex flex-col gap-3 text-white text-medium">
              <span>♡</span>
              <span>💬</span>
              <span>↗</span>
              <span>🔖</span>
              <span>⋯</span>
            </div>

            {/* Bottom: caption excerpt + audio attribution */}
            <div className="absolute left-2 right-12 bottom-2 text-tiny text-white space-y-0.5">
              <p className="line-clamp-2 leading-tight">{(data.caption ?? "").slice(0, 80)}</p>
              <p className="text-white/80 flex items-center gap-1">
                🎵 <span className="truncate">{data.audioName ?? "（音訊未指定）"}</span>
              </p>
            </div>
          </div>
          {data.hookHypothesis && (
            <p className="text-tiny text-default-500 mt-2 leading-relaxed">
              <span className="font-semibold">Hook 假設：</span>
              {data.hookHypothesis}
            </p>
          )}
          <p className="text-tiny text-default-500 mt-1">
            Remix 開放：{data.remixAllowed ? "✓ 是" : "✗ 否"}
          </p>
        </NotionCard>

        {/* Shot list */}
        <NotionCard>
          <SectionHeader eyebrow="SHOT LIST" title="逐秒分鏡" />
          <div className="flex flex-col">
            {data.shots.map((s, i) => {
              const beat = BEAT_TONE[s.beat] ?? BEAT_TONE.build;
              return (
                <div
                  key={i}
                  className="grid grid-cols-[60px_1fr] gap-3 py-2 border-b border-divider last:border-0"
                >
                  <div className="flex flex-col gap-1 items-start">
                    <span className="text-tiny font-mono font-semibold tabular-nums text-default-700">
                      {s.timecode}
                    </span>
                    <Chip size="sm" variant="flat" color={beat.color} className="h-4 text-tiny">
                      {beat.label}
                    </Chip>
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    {s.onScreenText && (
                      <p className="text-small font-semibold leading-snug">💬 {s.onScreenText}</p>
                    )}
                    {s.voiceover && (
                      <p className="text-tiny text-default-700 leading-relaxed">🎙 {s.voiceover}</p>
                    )}
                    {s.action && (
                      <p className="text-tiny text-default-500 leading-relaxed">🎬 {s.action}</p>
                    )}
                    {s.bRoll && (
                      <p className="text-tiny text-default-400 leading-relaxed">🎞 b-roll: {s.bRoll}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </NotionCard>
      </div>

      {/* Caption + hashtags */}
      <NotionCard>
        <SectionHeader eyebrow="CAPTION" title="貼文文字（在 Reel 下方）" />
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
      </NotionCard>
    </div>
  );
}
