/**
 * IGReelsMockup — squad-step renderer for IG Reels script.
 *
 * Wraps PlatformMockup's IGReels for the visual preview, then adds
 * squad-mockup-specific sections: Hook/Hold/Build/Payoff/CTA shot list,
 * audio attribution, remix flag, full caption.
 *
 * Per CJ correction 2026-05-02: don't duplicate IG chrome — IGReels
 * already handles the 9:16 phone-frame, action stack, audio bar.
 */
import { Chip } from "@heroui/react";
import { IGReels } from "../PlatformMockup/instagram";
import type { MockupFields } from "../PlatformMockup/shared";
import { useLang } from "../../../../lib/i18n";
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
  audioName?: string;
  remixAllowed: boolean;
  caption: string;
  hashtags: string[];
  shots: ReelsShot[];
}

interface Props extends SquadMockupCommonProps {
  data?: IGReelsScript;
  onChange?: (next: Partial<IGReelsScript>) => void;
}

const BEAT_TONE: Record<ReelsShot["beat"], { label: string; labelEn?: string; color: "primary" | "secondary" | "warning" | "success" | "default" }> = {
  hook:   { label: "🎯 Hook",   color: "primary" },
  hold:   { label: "⏱ Hold",    color: "secondary" },
  build:  { label: "📈 Build",  color: "warning" },
  payoff: { label: "💥 Payoff", color: "success" },
  cta:    { label: "👉 行動呼籲", labelEn: "👉 CTA",    color: "default" },
};

const AUDIO_LABEL_EN = {
  original:  "🎙 Original audio",
  trending:  "🔥 Trending audio",
  licensed:  "🎵 Licensed music",
} as const;

const AUDIO_LABEL = {
  original:  "🎙 原創音訊",
  trending:  "🔥 熱門音樂",
  licensed:  "🎵 授權音樂",
} as const;

function toMockupFields(data: IGReelsScript): MockupFields {
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

export function IGReelsMockup({ data, isActive = false }: Props) {
  const { lang } = useLang();
  if (!data || !Array.isArray(data.shots) || data.shots.length === 0) {
    return (
      <NotionCard>
        <SectionHeader icon="🎬" eyebrow="ATOMIC · IG REELS" title={lang === "en" ? "IG Reels short-video script" : "IG Reels 短影音腳本"} />
        <EmptyHint>{!data ? (lang === "en" ? "Not generated yet — click to run this task" : "尚未產出 — 點擊執行此任務") : (lang === "en" ? "Incomplete data — shots missing" : "資料不完整 — 缺 shots")}</EmptyHint>
      </NotionCard>
    );
  }

  const fields = toMockupFields(data);

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon="🎬"
            eyebrow="ATOMIC · IG REELS"
            title={data.topic || (lang === "en" ? "IG Reels script" : "IG Reels 腳本")}
          />
          <div className="flex items-center gap-1.5 self-start">
            <Chip size="sm" variant="flat" className="h-5 text-tiny">{data.duration ?? 30}s</Chip>
            <Chip size="sm" variant="flat" className="h-5 text-tiny">{(lang === "en" ? AUDIO_LABEL_EN : AUDIO_LABEL)[data.audioKind] ?? "🎵"}</Chip>
            {isActive && (
              <Chip size="sm" variant="flat" color="primary" className="h-5 text-tiny">
                {lang === "en" ? "● AI expert thinking…" : "● AI 專家思考中…"}
              </Chip>
            )}
          </div>
        </div>
      </NotionCard>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3">
        {/* Visual preview — reuse PlatformMockup's IGReels chrome */}
        <div className="md:sticky md:top-2 md:self-start space-y-2">
          <IGReels {...fields} />
          {data.audioName && (
            <p className="text-tiny text-default-500 leading-relaxed px-1">
              <span className="font-semibold">{lang === "en" ? "Audio:" : "音訊："}</span>{data.audioName}
            </p>
          )}
          <p className="text-tiny text-default-500 px-1">
            {lang === "en" ? "Remix allowed:" : "Remix 開放："}{data.remixAllowed ? (lang === "en" ? "✓ Yes" : "✓ 是") : (lang === "en" ? "✗ No" : "✗ 否")}
          </p>
          {data.hookHypothesis && (
            <p className="text-tiny text-default-500 leading-relaxed px-1">
              <span className="font-semibold">{lang === "en" ? "Hook hypothesis:" : "開場鉤假設："}</span>{data.hookHypothesis}
            </p>
          )}
        </div>

        {/* Shot list (squad-mockup-specific) */}
        <NotionCard>
          <SectionHeader eyebrow="SHOT LIST" title={lang === "en" ? "Second-by-second shot list" : "逐秒分鏡"} />
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
                      {lang === "en" ? (beat.labelEn ?? beat.label) : beat.label}
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
