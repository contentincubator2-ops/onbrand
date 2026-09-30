/**
 * YouTube mockups.
 * PR2.2: video-card, shorts, watch, community
 *        (premiere/live still fall to video-card)
 * References (MIT):
 *   - video-card: ShakirFarhan/Youtube-Clone src/components/VideoCard.jsx
 *   - shorts:     9:16 + side rail from SashenJayathilaka/TIK-TOK-Clone
 *   - watch:      ShakirFarhan/Youtube-Clone src/pages/Watch
 */
import React from "react";
import { Avatar, Button, Divider, Skeleton, User } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import {
  faVideo, faThumbsUp, faThumbsDown, faComment, faShareNodes,
  faMusic, faImages, faDownload, faBell, faScissors,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, dicebear, MarkdownText, ImageGenSlot, CardTextOverlay } from "./shared";
import { useLang } from "../../../lib/i18n";

/* ─────────────── Thumbnail title overlay ───────────────
   User-editable title text laid ON TOP of the (text-free) AI thumbnail.
   Big, bold, high-contrast with a dark outline so it reads on any background —
   the classic YouTube-thumbnail look. Absolutely positioned; captured by the
   html2canvas "帶版型" download. */
// 2026-08-21: ThumbnailTextOverlay moved to shared.tsx as CardTextOverlay —
// IG carousel cards need the same overlay, and two copies drift apart.

/* ─────────────── YT Video Card ─────────────── */

export function YTVideoCard({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus, overlayTitle, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "channel");
  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faYoutube} label="YouTube" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="relative aspect-video bg-default-100 flex items-center justify-center overflow-hidden">
          {liveImageUrl && liveImageStatus === "ready" ? (
            <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            // 2026-07-17 (CJ「盤查生圖佔位」): standardized ImageGenSlot
            <div className="absolute inset-0">
              <ImageGenSlot
                brief={liveImageStyle}
                status={liveImageStatus}
                onGenerate={onGenerateImage}
                aspectClass="w-full h-full"
                videoFrame
              />
            </div>
          )}
          {liveImageUrl && liveImageStatus === "ready" && <CardTextOverlay text={overlayTitle} />}
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-tiny px-1.5 py-0.5 rounded z-20 pointer-events-none">12:34</div>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-medium font-semibold leading-snug line-clamp-2">{title || (liveCaption ? liveCaption.split("\n")[0] : (lang === "en" ? "Video title" : "影片標題"))}</p>
          <User
            name={<span className="text-small">{brandName ?? "Your Channel"}</span>}
            description={<span className="text-tiny text-default-500">{lang === "en" ? "12K subscribers · just now · 1.2K views" : "12K 訂閱者 · 剛剛 · 1.2K 次觀看"}</span>}
            avatarProps={{ src: avatarSrc, size: "sm" }}
          />
          <Divider />
          {liveCaption ? (
            <div className="text-tiny text-default-700 whitespace-pre-line leading-relaxed">{liveCaption}</div>
          ) : (
            <>
              <p className="text-tiny text-default-500">{lang === "en" ? "Video description" : "影片描述"}</p>
              <Skeleton className="h-2.5 w-[90%] rounded" />
              <Skeleton className="h-2.5 w-[78%] rounded" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── YT Watch (player + meta + actions) ─────────────── */

export function YTWatch({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus, overlayTitle, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "channel");
  // For YT tasks the caption typically IS the deliverable (title list / chapter
  // list / description / opening script). First line → big title; rest → body.
  const lines = (liveCaption ?? "").split(/\n+/).filter(Boolean);
  const headline = title || lines[0] || (lang === "en" ? "Video title" : "影片標題");
  const body = title ? liveCaption ?? "" : lines.slice(1).join("\n");
  return (
    <div className="w-full max-w-[800px] mx-auto">
      <MockupHeader icon={faYoutube} label="YouTube" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        {/* Player */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {liveImageUrl && liveImageStatus === "ready" ? (
            <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            // 2026-07-17 (CJ「盤查生圖佔位」): standardized ImageGenSlot
            <div className="absolute inset-0">
              <ImageGenSlot
                brief={liveImageStyle}
                status={liveImageStatus}
                onGenerate={onGenerateImage}
                aspectClass="w-full h-full"
                dark
                videoFrame
              />
            </div>
          )}
          {liveImageUrl && liveImageStatus === "ready" && <CardTextOverlay text={overlayTitle} />}
          {/* 2026-07-07 (CJ「用戶以為會生影片，其實不會」, round 2 「我現在
              看到的還是這樣」): the tooltip-only fix wasn't enough — a filled
              red circle still reads as YouTube's real play button. Remove
              every playback affordance (play glyph + fake progress bar); the
              frame reads as a thumbnail, and the badge says why. */}
          <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-black/70 text-white text-[10px] font-medium px-2 py-1 rounded-full pointer-events-none">
            <FontAwesomeIcon icon={faImages} className="text-[9px]" />
            {lang === "en" ? "Layout preview · no video file" : "版型預覽 · 不含影片檔"}
          </div>
        </div>

        {/* Title */}
        <div className="px-4 pt-4 space-y-2">
          <h2 className="text-xl font-semibold leading-tight tracking-tight line-clamp-2">{headline}</h2>
        </div>

        {/* Channel row + actions */}
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar src={avatarSrc} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-small font-semibold truncate">{brandName ?? "Your Channel"}</p>
              <p className="text-tiny text-default-500">{lang === "en" ? "12K subscribers" : "12K 訂閱者"}</p>
            </div>
            <Button color="default" radius="full" size="sm" className="bg-foreground text-background ml-2">
              {lang === "en" ? "Subscribe" : "訂閱"}
            </Button>
            <Button isIconOnly variant="light" radius="full" size="sm" aria-label="bell">
              <FontAwesomeIcon icon={faBell} />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <ActionPill icon={faThumbsUp} label="1.2K" />
            <ActionPill icon={faThumbsDown} />
            <ActionPill icon={faShareNodes} label={lang === "en" ? "Share" : "分享"} />
            <ActionPill icon={faDownload} label={lang === "en" ? "Download" : "下載"} />
            <ActionPill icon={faScissors} label={lang === "en" ? "Clip" : "片段"} />
          </div>
        </div>

        {/* Description / caption body — renders the bulk of the YT task output */}
        <div className="mx-4 mb-4 p-3 bg-default-100 rounded-medium">
          <div className="flex items-center gap-2 text-tiny text-default-700 mb-2">
            <span className="font-semibold">{lang === "en" ? "1.2K views" : "1.2K 次觀看"}</span>
            <span>{lang === "en" ? "· 5 min ago" : "· 5 分鐘前"}</span>
          </div>
          {body ? (
            <p className="text-small text-default-800 whitespace-pre-line leading-relaxed">{body}</p>
          ) : (
            <>
              <Skeleton className="h-2.5 w-[90%] rounded mb-1" />
              <Skeleton className="h-2.5 w-[78%] rounded mb-1" />
              <Skeleton className="h-2.5 w-[60%] rounded" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionPill({ icon, label }: { icon: any; label?: string }) {
  return (
    <button className="h-9 px-3 rounded-full bg-default-100 hover:bg-default-200 text-small flex items-center gap-1.5">
      <FontAwesomeIcon icon={icon} />
      {label && <span className="font-medium">{label}</span>}
    </button>
  );
}

/* ─────────────── YT Community post ─────────────── */

export function YTCommunity({ title, brief, brandName, brandLogoUrl, variantLabel, liveCaption }: MockupFields) {
  const { lang } = useLang();
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "channel");
  return (
    <div className="w-full max-w-[600px] mx-auto">
      <MockupHeader icon={faYoutube} label="YouTube" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center gap-3">
          <Avatar src={avatarSrc} size="md" />
          <div>
            <p className="text-small font-semibold">{brandName ?? "Your Channel"}</p>
            <p className="text-tiny text-default-500">{lang === "en" ? "5 min ago" : "5 分鐘前"}</p>
          </div>
        </div>
        <div className="px-4 pb-3">
          {liveCaption ? (
            <p className="text-small whitespace-pre-line leading-relaxed">{liveCaption}</p>
          ) : (
            <>
              {title && <p className="text-small">{title}</p>}
              {brief && <p className="text-tiny text-default-500 line-clamp-3 mt-1">{brief}</p>}
            </>
          )}
        </div>
        {/* Optional poll */}
        <div className="mx-4 mb-3 p-3 border border-divider rounded-medium space-y-2">
          <p className="text-tiny font-semibold uppercase tracking-wider text-default-500">{lang === "en" ? "Poll" : "投票"}</p>
          {[
            { text: lang === "en" ? "Option A" : "選項 A", pct: 56 },
            { text: lang === "en" ? "Option B" : "選項 B", pct: 32 },
            { text: lang === "en" ? "Option C" : "選項 C", pct: 12 },
          ].map((opt, i) => (
            <div key={i} className="relative h-7 rounded-full bg-default-100 overflow-hidden border border-divider">
              <span className="absolute inset-y-0 left-0 bg-danger-100" style={{ width: `${opt.pct}%` }} />
              <span className="relative h-full flex items-center justify-between px-3 text-tiny">
                <span>{opt.text}</span>
                <span className="font-semibold tabular-nums">{opt.pct}%</span>
              </span>
            </div>
          ))}
          <p className="text-tiny text-default-500">{lang === "en" ? "567 votes" : "567 票"}</p>
        </div>
        <div className="px-4 py-2 border-t border-divider flex items-center gap-4 text-default-500 text-tiny">
          <span><FontAwesomeIcon icon={faThumbsUp} /> 1.2K</span>
          <span><FontAwesomeIcon icon={faThumbsDown} /></span>
          <span><FontAwesomeIcon icon={faComment} /> 87</span>
          <span className="ml-auto">{lang === "en" ? "Share" : "分享"}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── YT Shorts ─────────────── */

export function YTShorts({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "channel");
  return (
    <div className="w-full max-w-[400px] mx-auto">
      <MockupHeader icon={faYoutube} label="YouTube" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 pt-3 text-white">
          <span className="text-small font-semibold">Shorts</span>
          <span className="text-medium">⋯</span>
        </div>
        {/* Background — generated cover OR style brief OR skeleton */}
        {liveImageUrl && liveImageStatus === "ready" ? (
          <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
        ) : (
          // 2026-07-17 (CJ「盤查生圖佔位」): standardized ImageGenSlot
          <div className="absolute inset-0">
            <ImageGenSlot
              brief={liveImageStyle}
              status={liveImageStatus}
              onGenerate={onGenerateImage}
              aspectClass="w-full h-full"
              dark
              videoFrame
            />
          </div>
        )}
        {/* Script overlay — render the Shorts script body so user sees the deliverable */}
        {liveCaption && (
          <div className="absolute top-12 inset-x-3 z-10 bg-black/55 backdrop-blur-sm rounded-medium p-2.5 max-h-[55%] overflow-y-auto pr-12">
            <p className="text-[10px] uppercase tracking-wider text-white/60 mb-1">{lang === "en" ? "Shorts script" : "Shorts 腳本"}</p>
            <p className="text-tiny text-white whitespace-pre-line leading-relaxed">{liveCaption}</p>
          </div>
        )}
        <div className="absolute right-2 bottom-20 z-10 flex flex-col items-center gap-3.5">
          <div className="relative">
            <Avatar src={avatarSrc} size="md" isBordered color="danger" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center text-tiny font-bold border-2 border-black">+</span>
          </div>
          <VerticalActionItem icon={faThumbsUp} count="12K" />
          <VerticalActionItem icon={faThumbsDown} count={lang === "en" ? "Dislike" : "不喜歡"} />
          <VerticalActionItem icon={faComment} count="456" />
          <VerticalActionItem icon={faShareNodes} count={lang === "en" ? "Share" : "分享"} />
          <span className="w-9 h-9 rounded-md bg-black/30 backdrop-blur-sm flex items-center justify-center text-white border border-white/30">
            <FontAwesomeIcon icon={faMusic} />
          </span>
        </div>
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pr-16 text-white space-y-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <div className="flex items-center gap-2">
            <span className="text-small font-semibold">@{(brandName ?? "your_channel").toLowerCase().replace(/\s+/g, "_")}</span>
            <Button size="sm" radius="sm" className="h-6 min-w-0 px-2 text-tiny bg-white text-black">{lang === "en" ? "Subscribe" : "訂閱"}</Button>
          </div>
          <p className="text-small line-clamp-2">{title}</p>
          <div className="flex items-center gap-1 text-tiny">
            <FontAwesomeIcon icon={faMusic} className="text-tiny" />
            <span>{lang === "en" ? "Original audio" : "原創音訊"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VerticalActionItem({ icon, count }: { icon: any; count: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-white drop-shadow-lg">
      <span className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
        <FontAwesomeIcon icon={icon} className="text-medium" />
      </span>
      <span className="text-tiny font-semibold">{count}</span>
    </div>
  );
}

/* ─────────────── YT Premiere (countdown overlay) ─────────────── */

export function YTPremiere({ title, brandName, variantLabel, liveImageStyle, liveImageStatus, liveImageUrl, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faYoutube} label="YouTube" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="relative aspect-video bg-black overflow-hidden">
          {/* 2026-07-17 (CJ「盤查生圖佔位」): standardized ImageGenSlot — countdown
              moved to bottom strip so the centered 點此生成主圖 CTA stays clickable */}
          {liveImageUrl && liveImageStatus === "ready" ? (
            <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0">
              <ImageGenSlot
                brief={liveImageStyle}
                status={liveImageStatus}
                onGenerate={onGenerateImage}
                aspectClass="w-full h-full"
                dark
                videoFrame
              />
            </div>
          )}
          {/* Premiere chip top-left */}
          <div className="absolute top-3 left-3 flex items-center gap-2 z-10 pointer-events-none">
            <span className="bg-danger text-white text-tiny font-bold px-2 py-0.5 rounded uppercase">{lang === "en" ? "Premiere" : "首播"}</span>
            <span className="bg-black/70 text-white text-tiny px-2 py-0.5 rounded">{lang === "en" ? "Starting soon" : "即將開始"}</span>
          </div>
          {/* Countdown bottom strip */}
          <div className="absolute bottom-2 inset-x-0 z-10 text-center text-white pointer-events-none">
            <p className="text-tiny opacity-90">
              {lang === "en" ? "Premiere in" : "距離首播"} <span className="font-bold tabular-nums tracking-tight">02:14:35</span>
            </p>
          </div>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-medium font-semibold leading-snug line-clamp-2">{title}</p>
          <User
            name={<span className="text-small">{brandName ?? "Your Channel"}</span>}
            description={<span className="text-tiny text-default-500">{lang === "en" ? "12K subscribers · 1.2K waiting" : "12K 訂閱者 · 1.2K 人在等待"}</span>}
            avatarProps={{ src: dicebear(brandName ?? "channel"), size: "sm" }}
          />
          <div className="flex gap-2 pt-1">
            <Button color="danger" size="sm" radius="full" className="flex-1">{lang === "en" ? "Set reminder" : "設定提醒"}</Button>
            <Button variant="bordered" size="sm" radius="full" className="flex-1">{lang === "en" ? "Share" : "分享"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── YT Live (LIVE chip + viewers + chat panel) ─────────────── */

export function YTLive({ title, brandName, variantLabel, liveImageStyle, liveImageStatus, liveImageUrl, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faYoutube} label="YouTube" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="relative aspect-video bg-black overflow-hidden">
          {/* 2026-07-17 (CJ「盤查生圖佔位」): standardized ImageGenSlot */}
          {liveImageUrl && liveImageStatus === "ready" ? (
            <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0">
              <ImageGenSlot
                brief={liveImageStyle}
                status={liveImageStatus}
                onGenerate={onGenerateImage}
                aspectClass="w-full h-full"
                dark
                videoFrame
              />
            </div>
          )}
          {/* LIVE chip top-left */}
          <div className="absolute top-3 left-3 flex items-center gap-2 z-10 pointer-events-none">
            <span className="bg-danger text-white text-tiny font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="bg-black/70 text-white text-tiny px-2 py-0.5 rounded">{lang === "en" ? "2,345 watching" : "2,345 人觀看"}</span>
          </div>
          {/* 2026-07-07 (CJ): no playback affordance — this is a layout
              preview, a red play button implies a watchable stream. */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-black/70 text-white text-[10px] font-medium px-2 py-1 rounded-full pointer-events-none">
            <FontAwesomeIcon icon={faImages} className="text-[9px]" />
            {lang === "en" ? "Layout preview · no video file" : "版型預覽 · 不含影片檔"}
          </div>
        </div>
        {/* Live chat preview */}
        <div className="px-4 py-2.5 border-b border-divider bg-default-50 space-y-1 max-h-32 overflow-hidden">
          <p className="text-tiny font-semibold uppercase tracking-wider text-default-500">{lang === "en" ? "Live chat" : "即時聊天"}</p>
          {(lang === "en"
            ? [
                { user: "viewer_1", msg: "Finally live!" },
                { user: "viewer_2", msg: "Audio sounds great 👍" },
                { user: "viewer_3", msg: "❤️❤️❤️" },
              ]
            : [
                { user: "viewer_1", msg: "終於開播了!" },
                { user: "viewer_2", msg: "音質很棒 👍" },
                { user: "viewer_3", msg: "❤️❤️❤️" },
              ]
          ).map((c, i) => (
            <p key={i} className="text-tiny">
              <span className="font-semibold mr-1.5">{c.user}</span>
              {c.msg}
            </p>
          ))}
        </div>
        <div className="p-4 space-y-2">
          <p className="text-medium font-semibold leading-snug line-clamp-2">{title}</p>
          <User
            name={<span className="text-small">{brandName ?? "Your Channel"}</span>}
            description={<span className="text-tiny text-default-500">{lang === "en" ? "12K subscribers · Live now" : "12K 訂閱者 · 直播中"}</span>}
            avatarProps={{ src: dicebear(brandName ?? "channel"), size: "sm" }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────── YT Storyboard (逐鏡頭分鏡圖) ───────────────
   2026-08-01: renders ALL shots at once as a numbered filmstrip — a
   storyboard is one board, not a "pick your favorite" variant switcher.
   Each frame = its own AI-rendered still + the shot's duration/visual/
   VO/camera direction, parsed from cards[] (server splits one combined
   script into N cards, see quickTaskOrchestra.ts callCarouselCards). */
export function YTStoryboard({ title, brandName, variantLabel, liveCards }: MockupFields) {
  const { lang } = useLang();
  const frames = Array.isArray(liveCards) ? liveCards : [];
  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faYoutube} label="YouTube" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <p className="text-small font-semibold leading-tight line-clamp-1">
            {title || (lang === "en" ? "Storyboard" : "分鏡圖")}
          </p>
          <span className="text-tiny text-default-500 shrink-0 ml-2">
            {brandName ?? (lang === "en" ? "Your Channel" : "您的頻道")}
          </span>
        </div>
        {frames.length === 0 ? (
          <div className="px-4 pb-4">
            <Skeleton className="aspect-video w-full rounded-lg mb-2" />
            <Skeleton className="h-2.5 w-[70%] rounded" />
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-3">
            {frames.map((c, i) => (
              <div key={i} className="border border-divider rounded-lg overflow-hidden">
                <div className="relative aspect-video bg-default-100 flex items-center justify-center">
                  {c.image?.url && c.image.status === "ready" ? (
                    <img src={c.image.url} alt={c.headline} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <>
                      <Skeleton className="absolute inset-0 opacity-40" />
                      <div className="relative z-10 text-center text-default-400 px-3">
                        <FontAwesomeIcon icon={faImages} className="text-2xl mb-1" />
                        <p className="text-[10px] line-clamp-3">
                          {c.image?.status === "failed" || c.image?.status === "timeout"
                            ? (lang === "en" ? "Frame image failed" : "此格畫面生成失敗")
                            : c.image?.style
                              ? c.image.style
                              : (lang === "en" ? "Frame 16:9" : "分鏡畫面 16:9")}
                        </p>
                      </div>
                    </>
                  )}
                  <span className="absolute top-1.5 left-1.5 bg-black/80 text-white text-tiny font-semibold px-2 py-0.5 rounded z-10">
                    {lang === "en" ? `Shot ${i + 1}` : `鏡頭 ${i + 1}`}
                  </span>
                </div>
                <div className="px-3 py-2 border-t border-divider">
                  <p className="text-small font-semibold leading-tight">{c.headline}</p>
                  {c.body && <p className="text-tiny text-default-500 leading-relaxed mt-0.5">{c.body}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── YT Comment reply (yt-30-comment-reply / -pinned-comment) ──
 *
 * 2026-08-20: "youtube:comment" had no case in PlatformMockup, so both YT
 * comment tasks fell to the「即將推出」placeholder and their produced copy
 * was never shown. `pinned` renders the「已置頂」row YouTube shows above
 * the comment list for a creator's pinned comment.
 */
export function YTComment({
  title, brandName, brandLogoUrl, variantLabel, liveCaption, liveSourceComment,
  pinned = false,
}: MockupFields & { pinned?: boolean }) {
  const { lang } = useLang();
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  const source = (liveSourceComment ?? "").trim();

  return (
    <div className="w-full max-w-[560px] mx-auto">
      <MockupHeader
        icon={faYoutube}
        label={pinned
          ? (lang === "en" ? "YouTube Pinned Comment" : "YouTube 置頂留言")
          : (lang === "en" ? "YouTube Reply" : "YouTube 留言回覆")}
        variantLabel={variantLabel}
      />

      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 border-b border-divider text-small font-semibold">
          {lang === "en" ? "1,204 Comments" : "1,204 則留言"}
        </div>

        <div className="px-4 py-3 space-y-4">
          {/* Viewer comment (context for a reply; the "what we pinned above" for pinned) */}
          {!pinned && (
            <div className="flex items-start gap-3">
              <Avatar src={dicebear("yt-viewer")} className="w-9 h-9 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-tiny text-default-500">
                  @{lang === "en" ? "a_viewer" : "某位觀眾"} · {lang === "en" ? "2 hours ago" : "2 小時前"}
                </p>
                <p className="text-small text-default-800 leading-relaxed break-words mt-0.5">
                  {source || (lang === "en"
                    ? "(the comment you pasted shows up here)"
                    : "（你貼上的原始留言會顯示在這）")}
                </p>
                <div className="flex items-center gap-4 mt-1.5 text-tiny text-default-500">
                  <span><FontAwesomeIcon icon={faThumbsUp} className="mr-1" />48</span>
                  <FontAwesomeIcon icon={faThumbsDown} />
                  <span className="font-medium">{lang === "en" ? "Reply" : "回覆"}</span>
                </div>
              </div>
            </div>
          )}

          {/* The produced comment / reply */}
          <div className={`flex items-start gap-3 ${pinned ? "" : "pl-8"}`}>
            <Avatar src={avatarSrc} className="w-9 h-9 shrink-0" />
            <div className="flex-1 min-w-0">
              {pinned && (
                <p className="text-tiny text-default-500 mb-1">
                  📌 {lang === "en" ? "Pinned by creator" : "由頻道發布者置頂"}
                </p>
              )}
              <p className="text-tiny text-default-500">
                <span className="bg-default-200 rounded-full px-2 py-0.5 font-medium text-default-700">
                  {brandName || "Your Channel"}
                </span>
                <span className="ml-2">{lang === "en" ? "Just now" : "剛剛"}</span>
              </p>
              {liveCaption
                ? <MarkdownText content={liveCaption} className="text-small text-default-800 leading-relaxed mt-1" />
                : <Skeleton className="h-3 w-3/4 rounded mt-2" />}
              <div className="flex items-center gap-4 mt-1.5 text-tiny text-default-500">
                <span><FontAwesomeIcon icon={faThumbsUp} className="mr-1" />0</span>
                <FontAwesomeIcon icon={faThumbsDown} />
                <span className="font-medium">{lang === "en" ? "Reply" : "回覆"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {title && <p className="text-tiny text-default-500 mt-2 text-center">{title}</p>}
    </div>
  );
}
