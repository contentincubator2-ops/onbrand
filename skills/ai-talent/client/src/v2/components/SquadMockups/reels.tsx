/**
 * FBReelsMockup — atomic task fb-reels-script output.
 *
 * Renders a vertical 9:16 phone-frame preview + a Hook/Hold/Payoff
 * timeline showing per-second beat structure. Each row of the timeline
 * is a shot: timecode, on-screen text, voiceover/dialogue, action,
 * b-roll. This is the brief a video editor takes straight to shooting.
 *
 * Differs from FBPostBriefMockup (single static post) — this is a
 * time-axis script with multiple shots and overlay text per shot.
 */
import React from "react";
import { Chip } from "@heroui/react";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface ReelsShot {
  timecode: string;          // e.g. "0-3s" / "3-7s"
  beat: "hook" | "hold" | "build" | "payoff" | "cta";
  onScreenText: string;      // what appears as caption/sticker on screen
  voiceover: string;         // narrator / talent dialogue
  action: string;            // what's physically happening (movement, gesture)
  bRoll?: string;            // optional cutaway / supporting visual
}

export interface ReelsScript {
  topic: string;
  duration: 30 | 60;          // seconds
  hookHypothesis: string;     // why the first 3 seconds will retain
  hashtags: string[];
  caption: string;            // accompanying caption text (under the video)
  shots: ReelsShot[];
}

interface Props extends SquadMockupCommonProps {
  data?: ReelsScript;
  onChange?: (next: Partial<ReelsScript>) => void;
}

const BEAT_TONE: Record<ReelsShot["beat"], { label: string; color: "primary" | "secondary" | "warning" | "success" | "default" }> = {
  hook:   { label: "🎯 Hook",   color: "primary" },
  hold:   { label: "⏱ Hold",    color: "secondary" },
  build:  { label: "📈 Build",  color: "warning" },
  payoff: { label: "💥 Payoff", color: "success" },
  cta:    { label: "👉 CTA",    color: "default" },
};

export function FBReelsMockup({ data, isActive = false }: Props) {
  if (!data || !data.shots || data.shots.length === 0) {
    return (
      <NotionCard>
        <SectionHeader icon="🎬" eyebrow="ATOMIC · FB REELS" title="FB Reels 短影音腳本" />
        <EmptyHint>{!data ? "尚未產出 — 點擊執行此任務" : "資料不完整 — 缺 shots"}</EmptyHint>
      </NotionCard>
    );
  }

  // First-shot is the hook — pluck for the phone-frame preview overlay
  const hookShot = data.shots.find((s) => s.beat === "hook") ?? data.shots[0]!;

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon="🎬"
            eyebrow="ATOMIC · FB REELS"
            title={data.topic || "FB Reels 腳本"}
          />
          <div className="flex items-center gap-1.5 self-start">
            <Chip size="sm" variant="flat" className="h-5 text-tiny">
              {data.duration ?? 30}s
            </Chip>
            {isActive && (
              <Chip size="sm" variant="flat" color="primary" className="h-5 text-tiny">
                ● agent 思考中…
              </Chip>
            )}
          </div>
        </div>
      </NotionCard>

      {/* Phone-frame preview + timeline grid (2-column on wide screens) */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3">
        {/* Phone preview (9:16 vertical with hook overlay) */}
        <NotionCard className="md:sticky md:top-2 md:self-start">
          <SectionHeader eyebrow="PREVIEW" title="9:16 直立" />
          <div
            className="relative mx-auto rounded-2xl border-4 border-default-300 bg-black overflow-hidden"
            style={{ width: 200, aspectRatio: "9 / 16" }}
          >
            {/* Action area placeholder */}
            <div className="absolute inset-0 flex items-center justify-center text-default-200 text-tiny px-2 text-center leading-relaxed opacity-50">
              {hookShot.action || "（畫面動作未填）"}
            </div>
            {/* Top time badge */}
            <div className="absolute top-2 left-2">
              <Chip size="sm" variant="flat" color="primary" className="h-5 text-tiny bg-white/80">
                {hookShot.timecode}
              </Chip>
            </div>
            {/* Bottom hook overlay text */}
            {hookShot.onScreenText && (
              <div className="absolute left-2 right-2 bottom-12 text-center">
                <span className="inline-block px-2 py-1 rounded-md bg-white text-foreground text-medium font-bold leading-tight" style={{ textShadow: "0 1px 0 rgba(0,0,0,0.05)" }}>
                  {hookShot.onScreenText}
                </span>
              </div>
            )}
            {/* Bottom IG-like UI (heart/comment/share) */}
            <div className="absolute right-2 bottom-2 flex flex-col gap-2 text-white text-tiny">
              <span>♥</span>
              <span>💬</span>
              <span>↗</span>
            </div>
          </div>
          {data.hookHypothesis && (
            <p className="text-tiny text-default-500 mt-2 leading-relaxed">
              <span className="font-semibold">Hook 假設：</span>
              {data.hookHypothesis}
            </p>
          )}
        </NotionCard>

        {/* Timeline grid */}
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
                  {/* Timecode column */}
                  <div className="flex flex-col gap-1 items-start">
                    <span className="text-tiny font-mono font-semibold tabular-nums text-default-700">
                      {s.timecode}
                    </span>
                    <Chip size="sm" variant="flat" color={beat.color} className="h-4 text-tiny">
                      {beat.label}
                    </Chip>
                  </div>
                  {/* Content column */}
                  <div className="flex flex-col gap-1 min-w-0">
                    {s.onScreenText && (
                      <p className="text-small font-semibold leading-snug">
                        💬 {s.onScreenText}
                      </p>
                    )}
                    {s.voiceover && (
                      <p className="text-tiny text-default-700 leading-relaxed">
                        🎙 {s.voiceover}
                      </p>
                    )}
                    {s.action && (
                      <p className="text-tiny text-default-500 leading-relaxed">
                        🎬 {s.action}
                      </p>
                    )}
                    {s.bRoll && (
                      <p className="text-tiny text-default-400 leading-relaxed">
                        🎞 b-roll: {s.bRoll}
                      </p>
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
        <SectionHeader eyebrow="POST CAPTION" title="發布時的文字描述" />
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
