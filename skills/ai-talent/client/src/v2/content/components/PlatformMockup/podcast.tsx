/**
 * Podcast mockups.
 *
 * Variants:
 *   episode  — single episode player (mobile, Spotify-inspired dark UI)
 *   show     — show/channel page with episode list
 *   audiogram — square audiogram social card (for sharing on IG/FB/TW)
 */
import { Avatar, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay, faPause, faForwardStep, faBackwardStep,
  faHeart, faEllipsis, faShuffle, faRepeat,
  faHeadphones, faMicrophone, faShare,
  faVolumeHigh, faWaveSquare,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader } from "./shared";

const POD_GREEN   = "#1DB954";  /* Spotify green — widely understood as "podcast play" */
const POD_DARK    = "#121212";
const POD_SURFACE = "#282828";
const POD_SUB     = "#B3B3B3";
const POD_TEXT    = "#FFFFFF";

const podAvatar = (name: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name || "podcast")}&backgroundColor=1DB954&backgroundType=solid`;

/* ─── Waveform decoration ─── */
function Waveform({ color = POD_GREEN, bars = 24 }: { color?: string; bars?: number }) {
  const heights = [
    40, 60, 80, 55, 90, 45, 70, 85, 50, 65,
    75, 40, 95, 60, 80, 55, 70, 40, 85, 60,
    50, 75, 45, 65,
  ].slice(0, bars);

  return (
    <div className="flex items-center gap-0.5" style={{ height: 40 }}>
      {heights.map((h, i) => (
        <div
          key={i}
          className="rounded-full"
          style={{
            width: 3,
            height: `${h}%`,
            backgroundColor: i < bars * 0.4 ? color : `${color}55`,
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Progress bar ─── */
function ProgressBar({ progress = 0.38, dark = true }: { progress?: number; dark?: boolean }) {
  const track = dark ? "#3E3E3E" : "#E0E0E0";
  return (
    <div className="w-full">
      <div className="relative h-1 rounded-full w-full" style={{ backgroundColor: track }}>
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${progress * 100}%`, backgroundColor: POD_GREEN }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-md"
          style={{ left: `calc(${progress * 100}% - 6px)`, backgroundColor: POD_TEXT }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px]" style={{ color: POD_SUB }}>14:32</span>
        <span className="text-[10px]" style={{ color: POD_SUB }}>38:15</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   PODCAST EPISODE (mobile, dark player)
───────────────────────────────────────────────────── */
export function PodcastEpisode({
  title, brandName, variantLabel,
  liveTitle, liveCaption, liveDescription, liveImageDesc, liveCta,
}: MockupFields) {
  const brand    = brandName ?? "品牌播客";
  const epTitle  = liveTitle ?? title;
  const desc     = liveDescription ?? liveCaption;

  return (
    <div className="w-full max-w-[375px] mx-auto">
      <MockupHeader icon={faHeadphones} label="Podcast · 單集播放" variantLabel={variantLabel} />

      {/* Phone chrome — dark */}
      <div className="bg-[#1A1A1A] rounded-[36px] p-3 shadow-2xl">
        <div className="rounded-[28px] overflow-hidden" style={{ backgroundColor: POD_DARK }}>

          {/* Status bar */}
          <div className="px-6 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-white">9:41</span>
            <div className="w-4 h-2 border border-white/50 rounded-sm">
              <div className="h-full w-3/4 bg-white/50 rounded-sm" />
            </div>
          </div>

          {/* Nav */}
          <div className="px-4 py-2 flex items-center justify-between">
            <FontAwesomeIcon icon={faHeadphones} className="text-white text-[18px]" />
            <span className="text-[13px] font-bold text-white">正在播放</span>
            <FontAwesomeIcon icon={faEllipsis} className="text-white text-[18px]" />
          </div>

          {/* Album art */}
          <div className="mx-6 my-3">
            <div
              className="rounded-2xl overflow-hidden relative flex items-center justify-center shadow-xl"
              style={{ aspectRatio: "1/1", backgroundColor: POD_SURFACE }}
            >
              <Skeleton className="absolute inset-0 rounded-none" />
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-center px-4">
                <FontAwesomeIcon icon={faMicrophone} className="text-white/30 text-4xl mb-2" />
                <p className="text-white/50 text-[11px]">{liveImageDesc ?? "單集封面圖 · 等待 AI 圖像"}</p>
              </div>
            </div>
          </div>

          {/* Title + like */}
          <div className="px-6 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-[16px] font-bold text-white leading-snug line-clamp-2">
                {epTitle}
              </h2>
              <p className="text-[13px] mt-0.5 truncate" style={{ color: POD_SUB }}>
                {brand}
              </p>
            </div>
            <button className="mt-1 shrink-0">
              <FontAwesomeIcon icon={faHeart} className="text-[22px]" style={{ color: POD_GREEN }} />
            </button>
          </div>

          {/* Waveform */}
          <div className="px-6 mt-3">
            <Waveform bars={24} />
          </div>

          {/* Progress */}
          <div className="px-6 mt-2">
            <ProgressBar progress={0.38} dark />
          </div>

          {/* Controls */}
          <div className="px-6 mt-4 flex items-center justify-between">
            <button>
              <FontAwesomeIcon icon={faShuffle} className="text-[18px]" style={{ color: POD_SUB }} />
            </button>
            <button>
              <FontAwesomeIcon icon={faBackwardStep} className="text-[28px] text-white" />
            </button>
            <button
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
              style={{ backgroundColor: POD_TEXT }}
            >
              <FontAwesomeIcon icon={faPlay} className="text-[22px] ml-1" style={{ color: POD_DARK }} />
            </button>
            <button>
              <FontAwesomeIcon icon={faForwardStep} className="text-[28px] text-white" />
            </button>
            <button>
              <FontAwesomeIcon icon={faRepeat} className="text-[18px]" style={{ color: POD_SUB }} />
            </button>
          </div>

          {/* Volume */}
          <div className="px-8 mt-4 flex items-center gap-2">
            <FontAwesomeIcon icon={faVolumeHigh} className="text-[14px]" style={{ color: POD_SUB }} />
            <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: "#3E3E3E" }}>
              <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: POD_TEXT }} />
            </div>
            <FontAwesomeIcon icon={faVolumeHigh} className="text-[18px]" style={{ color: POD_TEXT }} />
          </div>

          {/* Description (if any) */}
          {desc && (
            <div className="mx-6 mt-4 p-3 rounded-xl" style={{ backgroundColor: POD_SURFACE }}>
              <p className="text-[12px] leading-relaxed line-clamp-3" style={{ color: POD_SUB }}>
                {desc}
              </p>
            </div>
          )}

          {/* Share */}
          <div className="px-6 mt-4 pb-4 flex justify-center gap-6">
            <button className="flex flex-col items-center gap-1">
              <FontAwesomeIcon icon={faShare} className="text-[18px]" style={{ color: POD_SUB }} />
              <span className="text-[10px]" style={{ color: POD_SUB }}>分享</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   PODCAST SHOW PAGE (episode list)
───────────────────────────────────────────────────── */
export function PodcastShow({
  title, brandName, variantLabel,
  liveTitle, liveCaption, liveDescription, liveHashtags,
}: MockupFields) {
  const brand    = brandName ?? "品牌播客";
  const showName = liveTitle ?? title;
  const desc     = liveDescription ?? liveCaption;
  const tags     = liveHashtags ?? ["商業", "行銷", "品牌"];

  const fakeEps = [
    { title: showName,           time: "38:15", date: "今天" },
    { title: "EP.2 品牌策略實戰分享", time: "42:30", date: "3天前" },
    { title: "EP.1 行銷趨勢解析",    time: "35:10", date: "1週前" },
  ];

  return (
    <div className="w-full max-w-[375px] mx-auto">
      <MockupHeader icon={faMicrophone} label="Podcast · 節目頁" variantLabel={variantLabel} />

      <div className="bg-[#1A1A1A] rounded-[36px] p-3 shadow-2xl">
        <div className="rounded-[28px] overflow-hidden" style={{ backgroundColor: POD_DARK }}>

          {/* Status bar */}
          <div className="px-5 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-white">9:41</span>
            <div className="w-4 h-2 border border-white/50 rounded-sm">
              <div className="h-full w-3/4 bg-white/50 rounded-sm" />
            </div>
          </div>

          {/* Show header */}
          <div className="px-4 pt-2 pb-4 flex gap-4 items-start">
            <div
              className="w-24 h-24 rounded-xl overflow-hidden relative shrink-0 flex items-center justify-center shadow-lg"
              style={{ backgroundColor: POD_SURFACE }}
            >
              <Skeleton className="absolute inset-0 rounded-none" />
              <FontAwesomeIcon icon={faMicrophone} className="text-white/20 text-3xl z-10" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-bold text-white leading-snug line-clamp-2">{showName}</h1>
              <p className="text-[12px] mt-0.5 mb-2" style={{ color: POD_GREEN }}>{brand}</p>
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 2).map((t, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: POD_SURFACE, color: POD_SUB }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Follow + play buttons */}
          <div className="px-4 flex gap-2 mb-4">
            <button
              className="flex-1 py-2 rounded-full text-[13px] font-bold border"
              style={{ borderColor: POD_TEXT, color: POD_TEXT }}
            >
              追蹤
            </button>
            <button
              className="px-5 py-2 rounded-full text-[13px] font-bold flex items-center gap-1"
              style={{ backgroundColor: POD_GREEN, color: POD_DARK }}
            >
              <FontAwesomeIcon icon={faPlay} className="text-[12px]" />
              播放
            </button>
          </div>

          {/* Description */}
          {desc && (
            <div className="px-4 mb-4">
              <p className="text-[12px] leading-relaxed line-clamp-3" style={{ color: POD_SUB }}>{desc}</p>
            </div>
          )}

          {/* Episode list */}
          <div className="px-4 mb-4">
            <h2 className="text-[13px] font-bold text-white mb-3">所有單集</h2>
            <div className="space-y-3">
              {fakeEps.map((ep, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: POD_SURFACE }}
                >
                  <div
                    className="w-12 h-12 rounded-lg overflow-hidden relative shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: "#3A3A3A" }}
                  >
                    <Skeleton className="absolute inset-0 rounded-none" />
                    <FontAwesomeIcon icon={faMicrophone} className="text-white/20 text-lg z-10" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white line-clamp-1">{ep.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: POD_SUB }}>
                      {ep.date} · {ep.time}
                    </p>
                    {/* Waveform mini */}
                    <div className="mt-1">
                      <Waveform bars={16} />
                    </div>
                  </div>
                  <button
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: i === 0 ? POD_GREEN : "transparent", border: i === 0 ? "none" : `1px solid ${POD_SUB}` }}
                  >
                    <FontAwesomeIcon
                      icon={i === 0 ? faPause : faPlay}
                      className="text-[12px] ml-0.5"
                      style={{ color: i === 0 ? POD_DARK : POD_SUB }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   PODCAST AUDIOGRAM (square social share card)
───────────────────────────────────────────────────── */
export function PodcastAudiogram({
  title, brandName, variantLabel,
  liveTitle, liveCaption, liveImageDesc,
}: MockupFields) {
  const brand   = brandName ?? "品牌播客";
  const epTitle = liveTitle ?? title;
  const quote   = liveCaption;

  return (
    <div className="w-full max-w-[375px] mx-auto">
      <MockupHeader icon={faWaveSquare} label="Podcast · Audiogram" variantLabel={variantLabel} />

      {/* Square card */}
      <div
        className="w-full rounded-2xl overflow-hidden shadow-xl relative"
        style={{ aspectRatio: "1/1", backgroundColor: POD_DARK }}
      >
        {/* Background cover art (blurred) */}
        <Skeleton className="absolute inset-0 rounded-none opacity-30" />

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 to-black/40 z-10" />

        {/* Content */}
        <div className="absolute inset-0 z-20 p-8 flex flex-col justify-between">
          {/* Top: brand */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg overflow-hidden">
              <Avatar src={podAvatar(brand)} size="sm" className="w-full h-full" />
            </div>
            <span className="text-white text-[13px] font-bold">{brand}</span>
          </div>

          {/* Center: quote / title */}
          <div>
            {quote ? (
              <>
                <p className="text-white/40 text-[13px] mb-1">"</p>
                <p className="text-white text-[18px] font-bold leading-snug line-clamp-4">
                  {quote}
                </p>
                <p className="text-white/40 text-[13px] mt-1">"</p>
              </>
            ) : (
              <p className="text-white text-[18px] font-bold leading-snug line-clamp-3">
                {epTitle}
              </p>
            )}
          </div>

          {/* Waveform */}
          <div>
            <Waveform bars={28} />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px]" style={{ color: POD_SUB }}>
                {epTitle}
              </span>
              <div className="flex items-center gap-1">
                <FontAwesomeIcon icon={faHeadphones} className="text-[11px]" style={{ color: POD_GREEN }} />
                <span className="text-[11px]" style={{ color: POD_GREEN }}>Listen now</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
