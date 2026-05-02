/**
 * YouTube SquadMockup wrappers.
 *
 * Wraps PlatformMockup/youtube.tsx chrome — no duplicated YT UI.
 *
 * Variants:
 *   YTVideoMockup      — video script + watch-page preview
 *   YTShortsMockup     — 9:16 Shorts script (hook / hold / payoff)
 *   YTCommunityMockup  — community post (text / poll)
 *   YTPremiereMockup   — premiere event brief
 *   YTLiveMockup       — live stream run-of-show
 */
import React from "react";
import { Chip } from "@heroui/react";
import {
  YTVideoCard, YTShorts, YTCommunity, YTPremiere, YTLive,
} from "../PlatformMockup/youtube";
import type { MockupFields } from "../PlatformMockup/shared";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

// ── Data shapes ──────────────────────────────────────────────────────────────

export interface YTVideoScript {
  channelName: string;
  channelAvatarUrl?: string | null;
  videoTitle: string;
  thumbnailDesc: string;
  hook: string;
  chapters: { timecode: string; title: string; body: string }[];
  cta: string;
  descriptionCopy?: string;
  tags?: string[];
  durationMin?: number;
}

export interface YTShortsScript {
  channelName: string;
  videoTitle: string;
  hook: string;       // 0–3s
  hold: string;       // 4–45s
  payoff: string;     // final loop / CTA
  audioNote?: string;
  overlayText?: string[];
  durationSec?: number;
}

export interface YTCommunityData {
  channelName: string;
  body: string;
  isPoll?: boolean;
  pollOptions?: string[];
  imageDesc?: string;
}

export interface YTPremiereData {
  channelName: string;
  videoTitle: string;
  premiereDate: string;
  teaser: string;
  thumbnailDesc: string;
}

export interface YTLiveData {
  channelName: string;
  streamTitle: string;
  scheduledTime: string;
  runOfShow: { time: string; segment: string; notes?: string }[];
  expectedDurationMin?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toFields(channelName: string, extra: Partial<MockupFields> = {}): MockupFields {
  return {
    brandName: channelName ?? null,
    title: extra.title ?? "",
    brief: extra.brief ?? "",
    liveCaption: extra.liveCaption,
    liveHashtags: extra.liveHashtags,
    liveImageDesc: extra.liveImageDesc,
  };
}

// ── YTVideoMockup ─────────────────────────────────────────────────────────────

interface VideoProps extends SquadMockupCommonProps { data?: YTVideoScript; }

export function YTVideoMockup({ data, isActive = false }: VideoProps) {
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="▶️" eyebrow="SQUAD · YT VIDEO" title="YouTube 影片腳本" />
      <EmptyHint>尚未產出 — 點擊執行此任務</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.channelName, {
    title: data.videoTitle, liveImageDesc: data.thumbnailDesc,
  });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="▶️" eyebrow="SQUAD · YT VIDEO" title={`YouTube 影片（${data.durationMin ?? "?"}分鐘）`} />
          {isActive && <Chip size="sm" variant="flat" color="danger" className="self-start">● agent 思考中…</Chip>}
        </div>
        <YTVideoCard {...fields} />
      </NotionCard>

      <NotionCard>
        <SectionHeader eyebrow="HOOK" title="開場鉤子（前 30 秒）" />
        <p className="text-small text-default-700 leading-relaxed">{data.hook}</p>
      </NotionCard>

      {data.chapters?.length > 0 && (
        <NotionCard>
          <SectionHeader eyebrow="CHAPTERS" title={`影片章節（${data.chapters.length} 段）`} />
          <div className="flex flex-col gap-2">
            {data.chapters.map((ch, i) => (
              <div key={i} className="flex gap-2 items-start p-2 rounded-md border border-divider">
                <span className="text-tiny font-mono text-default-500 shrink-0 pt-0.5">{ch.timecode}</span>
                <div>
                  <p className="text-small font-semibold">{ch.title}</p>
                  <p className="text-tiny text-default-700 leading-relaxed">{ch.body}</p>
                </div>
              </div>
            ))}
          </div>
        </NotionCard>
      )}

      <NotionCard>
        <SectionHeader eyebrow="CTA + DESCRIPTION" title="行動呼籲 + 說明欄" />
        <p className="text-small text-danger font-medium mb-2">👉 {data.cta}</p>
        {data.descriptionCopy && (
          <pre className="text-tiny leading-relaxed whitespace-pre-wrap font-sans bg-default-50 border border-divider rounded-md p-3">
            {data.descriptionCopy}
          </pre>
        )}
        {data.tags && data.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {data.tags.map((t, i) => (
              <Chip key={i} size="sm" variant="flat" className="h-5 text-tiny">{t}</Chip>
            ))}
          </div>
        )}
      </NotionCard>
    </div>
  );
}

// ── YTShortsMockup ───────────────────────────────────────────────────────────

interface ShortsProps extends SquadMockupCommonProps { data?: YTShortsScript; }

export function YTShortsMockup({ data, isActive = false }: ShortsProps) {
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="🎬" eyebrow="ATOMIC · YT SHORTS" title="YouTube Shorts 腳本" />
      <EmptyHint>尚未產出 — 點擊執行此任務</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.channelName, { title: data.videoTitle });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🎬" eyebrow="ATOMIC · YT SHORTS" title={`YouTube Shorts（${data.durationSec ?? "60"}秒）`} />
          {isActive && <Chip size="sm" variant="flat" color="danger" className="self-start">● agent 思考中…</Chip>}
        </div>
        <YTShorts {...fields} />
      </NotionCard>
      <NotionCard>
        <SectionHeader eyebrow="SCRIPT" title="腳本三段式結構" />
        <div className="flex flex-col gap-2">
          {[
            { label: "🪝 Hook（0–3s）", text: data.hook, color: "border-danger" },
            { label: "⏱ Hold（4–45s）", text: data.hold, color: "border-warning" },
            { label: "🎯 Payoff / CTA", text: data.payoff, color: "border-success" },
          ].map((row, i) => (
            <div key={i} className={`p-3 rounded-md border-l-4 border border-divider ${row.color} bg-default-50`}>
              <p className="text-tiny text-default-500 font-medium mb-0.5">{row.label}</p>
              <p className="text-small text-default-700 leading-relaxed">{row.text}</p>
            </div>
          ))}
        </div>
        {data.audioNote && <p className="text-tiny text-default-500 mt-1">🎵 音樂方向：{data.audioNote}</p>}
        {data.overlayText && data.overlayText.length > 0 && (
          <div className="mt-1">
            <p className="text-tiny text-default-500 font-medium mb-0.5">字幕 Overlay：</p>
            <div className="flex flex-wrap gap-1.5">
              {data.overlayText.map((t, i) => (
                <Chip key={i} size="sm" variant="flat" className="h-5 text-tiny">{t}</Chip>
              ))}
            </div>
          </div>
        )}
      </NotionCard>
    </div>
  );
}

// ── YTCommunityMockup ────────────────────────────────────────────────────────

interface CommunityProps extends SquadMockupCommonProps { data?: YTCommunityData; }

export function YTCommunityMockup({ data, isActive = false }: CommunityProps) {
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="💬" eyebrow="ATOMIC · YT COMMUNITY" title="YouTube 社群貼文" />
      <EmptyHint>尚未產出 — 點擊執行此任務</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.channelName, { liveCaption: data.body });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="💬" eyebrow="ATOMIC · YT COMMUNITY" title="YouTube 社群貼文" />
          {isActive && <Chip size="sm" variant="flat" color="danger" className="self-start">● agent 思考中…</Chip>}
        </div>
        <YTCommunity {...fields} />
      </NotionCard>
      {data.isPoll && data.pollOptions && data.pollOptions.length > 0 && (
        <NotionCard>
          <SectionHeader eyebrow="POLL OPTIONS" title="投票選項" />
          <div className="flex flex-col gap-1.5">
            {data.pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-md border border-divider">
                <span className="w-4 h-4 rounded-full border-2 border-danger shrink-0" />
                <span className="text-small">{opt}</span>
              </div>
            ))}
          </div>
        </NotionCard>
      )}
    </div>
  );
}

// ── YTPremiereMockup ─────────────────────────────────────────────────────────

interface PremiereProps extends SquadMockupCommonProps { data?: YTPremiereData; }

export function YTPremiereMockup({ data, isActive = false }: PremiereProps) {
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="🎞️" eyebrow="SQUAD · YT PREMIERE" title="YouTube 首播企劃" />
      <EmptyHint>尚未產出 — 點擊執行此任務</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.channelName, { title: data.videoTitle, brief: data.teaser });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🎞️" eyebrow="SQUAD · YT PREMIERE" title="YouTube 首播企劃" />
          {isActive && <Chip size="sm" variant="flat" color="danger" className="self-start">● agent 思考中…</Chip>}
        </div>
        <YTPremiere {...fields} />
      </NotionCard>
      <NotionCard>
        <SectionHeader eyebrow="PREMIERE BRIEF" title="首播企劃詳情" />
        <div className="flex flex-col gap-1.5 text-small">
          <p>📅 <strong>首播時間：</strong>{data.premiereDate}</p>
          <p className="text-default-700 leading-relaxed mt-1">{data.teaser}</p>
          {data.thumbnailDesc && <p className="text-tiny text-default-500 mt-1">🎨 縮圖方向：{data.thumbnailDesc}</p>}
        </div>
      </NotionCard>
    </div>
  );
}

// ── YTLiveMockup ─────────────────────────────────────────────────────────────

interface LiveProps extends SquadMockupCommonProps { data?: YTLiveData; }

export function YTLiveMockup({ data, isActive = false }: LiveProps) {
  if (!data) return (
    <NotionCard>
      <SectionHeader icon="🔴" eyebrow="SQUAD · YT LIVE" title="YouTube 直播企劃" />
      <EmptyHint>尚未產出 — 點擊執行此任務</EmptyHint>
    </NotionCard>
  );
  const fields = toFields(data.channelName, { title: data.streamTitle });
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🔴" eyebrow="SQUAD · YT LIVE" title="YouTube 直播企劃" />
          {isActive && <Chip size="sm" variant="flat" color="danger" className="self-start">● LIVE</Chip>}
        </div>
        <YTLive {...fields} />
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
