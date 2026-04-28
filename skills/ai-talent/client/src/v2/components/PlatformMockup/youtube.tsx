/**
 * YouTube mockups.
 * PR2.1: video-card, shorts (rest fall back to video-card)
 * References (MIT):
 *   - video-card: ShakirFarhan/Youtube-Clone src/components/VideoCard.jsx
 *   - shorts: 9:16 + side rail pattern from SashenJayathilaka/TIK-TOK-Clone
 */
import React from "react";
import { Avatar, Button, Divider, Skeleton, User } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import {
  faPlay, faVideo, faThumbsUp, faThumbsDown, faComment, faShareNodes, faMusic,
  faImages,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, VerticalActionRail, dicebear } from "./shared";

/* ─────────────── YT Video Card ─────────────── */

export function YTVideoCard({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faYoutube} label="YouTube" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="relative aspect-video bg-default-100 flex items-center justify-center">
          <Skeleton className="absolute inset-0" />
          <div className="text-center text-default-400 relative z-10">
            <FontAwesomeIcon icon={faVideo} className="text-5xl mb-2" />
            <p className="text-tiny">縮圖 · 等待 craft agent</p>
          </div>
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-tiny px-1.5 py-0.5 rounded">12:34</div>
          <Button isIconOnly radius="full" size="lg" color="danger" className="absolute opacity-90" aria-label="play">
            <FontAwesomeIcon icon={faPlay} />
          </Button>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-medium font-semibold leading-snug line-clamp-2">{title}</p>
          <User
            name={<span className="text-small">{brandName ?? "Your Channel"}</span>}
            description={<span className="text-tiny text-default-500">12K 訂閱者 · 剛剛 · 1.2K 次觀看</span>}
            avatarProps={{ src: dicebear(brandName ?? "channel"), size: "sm" }}
          />
          <Divider />
          <p className="text-tiny text-default-500">影片描述</p>
          <Skeleton className="h-2.5 w-[90%] rounded" />
          <Skeleton className="h-2.5 w-[78%] rounded" />
          <p className="text-tiny text-default-500 mt-2">章節時間軸</p>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────── YT Shorts (9:16 + side rail) ─────────────── */

export function YTShorts({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[280px] mx-auto">
      <MockupHeader icon={faYoutube} label="YouTube" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        {/* Top */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 pt-3 text-white">
          <span className="text-[0.92rem] font-semibold">Shorts</span>
          <span className="text-medium">⋯</span>
        </div>

        {/* Video placeholder */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="absolute inset-0 opacity-30" />
          <div className="relative z-10 text-center text-white/60">
            <FontAwesomeIcon icon={faVideo} className="text-4xl mb-2" />
            <p className="text-tiny">9:16 短片 · 等待 craft agent</p>
          </div>
        </div>

        {/* Right rail (Shorts pattern: subscribe avatar plus, like, dislike, comment, share, audio disc) */}
        <div className="absolute right-2 bottom-20 z-10 flex flex-col items-center gap-3.5">
          <div className="relative">
            <Avatar src={dicebear(brandName ?? "channel")} size="md" isBordered color="danger" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center text-tiny font-bold border-2 border-black">+</span>
          </div>
          <VerticalActionItem icon={faThumbsUp} count="12K" />
          <VerticalActionItem icon={faThumbsDown} count="不喜歡" />
          <VerticalActionItem icon={faComment} count="456" />
          <VerticalActionItem icon={faShareNodes} count="分享" />
          <span className="w-9 h-9 rounded-md bg-black/30 backdrop-blur-sm flex items-center justify-center text-white border border-white/30">
            <FontAwesomeIcon icon={faMusic} />
          </span>
        </div>

        {/* Bottom */}
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pr-16 text-white space-y-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <div className="flex items-center gap-2">
            <span className="text-[0.82rem] font-semibold">@{(brandName ?? "your_channel").toLowerCase().replace(/\s+/g, "_")}</span>
            <Button size="sm" radius="sm" className="h-6 min-w-0 px-2 text-tiny bg-white text-black">訂閱</Button>
          </div>
          <p className="text-[0.78rem] line-clamp-2">{title}</p>
          <div className="flex items-center gap-1 text-tiny">
            <FontAwesomeIcon icon={faMusic} className="text-tiny" />
            <span>原創音訊</span>
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
