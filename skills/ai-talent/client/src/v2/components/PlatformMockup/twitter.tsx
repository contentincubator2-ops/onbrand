/**
 * Twitter / X mockups.
 * Based on Figma: X-Communities-UI-Kit (aBKidfMuKyIqQQqNMY8nM8)
 *
 * Variants:
 *   tweet   — single tweet card (light/dark)
 *   thread  — thread of tweets
 */
import React from "react";
import { Avatar, Button, Chip, Divider, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import {
  faHeart, faRepeat, faComment, faUpload, faImages, faEllipsis,
  faChartBar, faBookmark,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, dicebear, MarkdownText } from "./shared";

/* ─────────────── Tweet Card ─────────────── */

export function XTweet({ title, brandName, variantLabel, liveCaption, liveHashtags, liveImageDesc }: MockupFields) {
  const brand = brandName ?? "Your Brand";
  const handle = brand.toLowerCase().replace(/\s+/g, "_");
  const hasImage = !!liveImageDesc;

  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faXTwitter} label="X (Twitter)" variantLabel={variantLabel} />

      {/* App chrome */}
      <div className="bg-[#000000] rounded-xl overflow-hidden shadow-xl border border-[#2f3336]">
        {/* Top nav */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2f3336]">
          <FontAwesomeIcon icon={faXTwitter} className="text-white text-xl" />
          <div className="flex gap-6 text-[#71767b] text-small">
            <span className="text-white font-bold border-b-2 border-[#1d9bf0] pb-3">為你推薦</span>
            <span>追蹤中</span>
          </div>
          <div className="w-6" />
        </div>

        {/* Tweet */}
        <div className="px-4 py-4 flex gap-3">
          <Avatar
            src={dicebear(brand)}
            size="md"
            className="shrink-0"
          />
          <div className="flex-1 min-w-0">
            {/* Author line */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-white text-small font-bold">{brand}</span>
              <svg className="text-[#1d9bf0] w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.81c.66 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.33-2.19c1.4.46 2.91.2 3.92-.81s1.26-2.52.8-3.91C21.37 14.67 22.25 13.43 22.25 12z" />
              </svg>
              <span className="text-[#71767b] text-small">@{handle}</span>
              <span className="text-[#71767b] text-small">· 剛剛</span>
              <FontAwesomeIcon icon={faEllipsis} className="text-[#71767b] ml-auto" />
            </div>

            {/* Tweet body */}
            {liveCaption ? (
              <div>
                <MarkdownText content={liveCaption} className="text-white text-small leading-relaxed" />
                {liveHashtags && liveHashtags.length > 0 && (
                  <span className="text-[#1d9bf0] text-small"> {liveHashtags.slice(0, 4).join(" ")}</span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full rounded bg-[#2f3336]" />
                <Skeleton className="h-3 w-[88%] rounded bg-[#2f3336]" />
                <Skeleton className="h-3 w-[70%] rounded bg-[#2f3336]" />
              </div>
            )}

            {/* Tweet image */}
            <div className="mt-3 aspect-[16/9] bg-[#16181c] border border-[#2f3336] rounded-2xl flex items-center justify-center relative overflow-hidden">
              <Skeleton className="absolute inset-0 rounded-none bg-[#1c1f23]" />
              <div className="relative z-10 text-center p-4">
                <FontAwesomeIcon icon={faImages} className="text-[#71767b] text-2xl mb-1" />
                <p className="text-[#71767b] text-tiny line-clamp-2">
                  {liveImageDesc ?? "推文圖 · 等待 visual agent"}
                </p>
              </div>
            </div>

            {/* Engagement row */}
            <div className="flex items-center justify-between mt-3 text-[#71767b] text-small max-w-[320px]">
              <button className="flex items-center gap-1.5 hover:text-[#1d9bf0] transition group">
                <span className="w-8 h-8 rounded-full group-hover:bg-[#1d9bf01a] flex items-center justify-center">
                  <FontAwesomeIcon icon={faComment} className="text-sm" />
                </span>
                <span className="text-tiny">24</span>
              </button>
              <button className="flex items-center gap-1.5 hover:text-[#00ba7c] transition group">
                <span className="w-8 h-8 rounded-full group-hover:bg-[#00ba7c1a] flex items-center justify-center">
                  <FontAwesomeIcon icon={faRepeat} className="text-sm" />
                </span>
                <span className="text-tiny">187</span>
              </button>
              <button className="flex items-center gap-1.5 hover:text-[#f91880] transition group">
                <span className="w-8 h-8 rounded-full group-hover:bg-[#f918801a] flex items-center justify-center">
                  <FontAwesomeIcon icon={faHeart} className="text-sm" />
                </span>
                <span className="text-tiny">2.1K</span>
              </button>
              <button className="flex items-center gap-1.5 hover:text-[#1d9bf0] transition group">
                <span className="w-8 h-8 rounded-full group-hover:bg-[#1d9bf01a] flex items-center justify-center">
                  <FontAwesomeIcon icon={faChartBar} className="text-sm" />
                </span>
                <span className="text-tiny">48K</span>
              </button>
              <button className="flex items-center gap-1.5 hover:text-[#1d9bf0] transition group">
                <span className="w-8 h-8 rounded-full group-hover:bg-[#1d9bf01a] flex items-center justify-center">
                  <FontAwesomeIcon icon={faBookmark} className="text-sm" />
                </span>
              </button>
              <button className="flex items-center gap-1.5 hover:text-[#1d9bf0] transition group">
                <span className="w-8 h-8 rounded-full group-hover:bg-[#1d9bf01a] flex items-center justify-center">
                  <FontAwesomeIcon icon={faUpload} className="text-sm" />
                </span>
              </button>
            </div>
          </div>
        </div>

        <Divider className="bg-[#2f3336]" />

        {/* Reply ghost tweets */}
        {[1, 2].map((i) => (
          <div key={i} className="px-4 py-3 flex gap-3 opacity-30">
            <div className="w-10 h-10 rounded-full bg-[#2f3336] shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-[35%] rounded bg-[#2f3336]" />
              <Skeleton className="h-3 w-[90%] rounded bg-[#2f3336]" />
              <Skeleton className="h-3 w-[72%] rounded bg-[#2f3336]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── X Thread ─────────────── */

export function XThread({ title, brandName, variantLabel, liveCaption }: MockupFields) {
  const brand = brandName ?? "Your Brand";
  const handle = brand.toLowerCase().replace(/\s+/g, "_");
  const tweets = liveCaption ? liveCaption.split("\n\n").slice(0, 4) : [];

  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faXTwitter} label="X Thread" variantLabel={variantLabel} />
      <div className="bg-[#000000] rounded-xl overflow-hidden shadow-xl border border-[#2f3336]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2f3336]">
          <FontAwesomeIcon icon={faXTwitter} className="text-white" />
          <span className="text-white text-small font-bold">Thread</span>
          <Chip size="sm" variant="flat" className="bg-[#1d9bf01a] text-[#1d9bf0] ml-auto">
            {tweets.length > 0 ? `${tweets.length} 則推文` : "等待生成"}
          </Chip>
        </div>
        {tweets.length > 0 ? (
          tweets.map((tw, i) => (
            <div key={i} className="flex gap-3 px-4 py-3 relative">
              {i < tweets.length - 1 && (
                <div className="absolute left-[36px] top-14 bottom-0 w-0.5 bg-[#2f3336]" />
              )}
              <Avatar src={dicebear(brand)} size="sm" className="shrink-0 mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-white text-tiny font-bold">{brand}</span>
                  <span className="text-[#71767b] text-tiny">@{handle}</span>
                  <span className="text-[#71767b] text-tiny ml-auto">{i + 1}/{tweets.length}</span>
                </div>
                <MarkdownText content={tw} className="text-white text-small leading-relaxed" />
              </div>
            </div>
          ))
        ) : (
          [1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-[#2f3336] shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-[40%] rounded bg-[#2f3336]" />
                <Skeleton className="h-3 w-full rounded bg-[#2f3336]" />
                <Skeleton className="h-3 w-[82%] rounded bg-[#2f3336]" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
