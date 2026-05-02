/**
 * FBReelsMockup — squad-step renderer for FB Reels script.
 *
 * Wraps PlatformMockup's FBReel for the visual preview, then adds
 * squad-mockup-specific sections: Hook/Hold/Build/Payoff/CTA shot list,
 * caption, hashtags. Avoids duplicating FB chrome.
 */
import React from "react";
import { Chip } from "@heroui/react";
import { FBReel } from "../PlatformMockup/facebook";
import type { MockupFields } from "../PlatformMockup/shared";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface ReelsShot {
  timecode: string;
  beat: "hook" | "hold" | "build" | "payoff" | "cta";
  onScreenText: string;
  voiceover: string;
  action: string;
  bRoll?: string;
}

export interface ReelsScript {
  topic: string;
  duration: 30 | 60;
  hookHypothesis: string;
  hashtags: string[];
  caption: string;
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

function toMockupFields(data: ReelsScript): MockupFields {
  const hook = data.shots.find((s) => s.beat === "hook") ?? data.shots[0];
  return {
    title: data.topic ?? "",
    brief: data.hookHypothesis ?? "",
    brandName: null,
    liveCaption: data.caption,
    liveHashtags: data.hashtags,
    liveTitle: hook?.onScreenText ?? "",
    liveVideoDesc: hook?.action ?? "",
  };
}

export function FBReelsMockup({ data, isActive = false }: Props) {
  if (!data || !data.shots || data.shots.length === 0) {
    return (
      <NotionCard>
        <SectionHeader icon="🎬" eyebrow="ATOMIC · FB REELS" title="FB Reels 短影音腳本" />
        <EmptyHint>{!data ? "尚未產出 — 點擊執行此任務" : "資料不完整 — 缺 shots"}</EmptyHint>
      </NotionCard>
    );
  }

  const fields = toMockupFields(data);

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🎬" eyebrow="ATOMIC · FB REELS" title={data.topic || "FB Reels 腳本"} />
          <div className="flex items-center gap-1.5 self-start">
            <Chip size="sm" variant="flat" className="h-5 text-tiny">{data.duration ?? 30}s</Chip>
            {isActive && (
              <Chip size="sm" variant="flat" color="primary" className="h-5 text-tiny">
                ● agent 思考中…
              </Chip>
            )}
          </div>
        </div>
      </NotionCard>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3">
        {/* Visual preview — reuse PlatformMockup's FBReel chrome */}
        <div className="md:sticky md:top-2 md:self-start space-y-2">
          <FBReel {...fields} />
          {data.hookHypothesis && (
            <p className="text-tiny text-default-500 leading-relaxed px-1">
              <span className="font-semibold">Hook 假設：</span>{data.hookHypothesis}
            </p>
          )}
        </div>

        {/* Shot list (squad-mockup-specific) */}
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
                    {s.onScreenText && <p className="text-small font-semibold leading-snug">💬 {s.onScreenText}</p>}
                    {s.voiceover && <p className="text-tiny text-default-700 leading-relaxed">🎙 {s.voiceover}</p>}
                    {s.action && <p className="text-tiny text-default-500 leading-relaxed">🎬 {s.action}</p>}
                    {s.bRoll && <p className="text-tiny text-default-400 leading-relaxed">🎞 b-roll: {s.bRoll}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </NotionCard>
      </div>
    </div>
  );
}
