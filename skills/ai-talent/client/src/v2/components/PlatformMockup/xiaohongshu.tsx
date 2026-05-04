/**
 * 小紅書 (Xiaohongshu / RED) mockups.
 *
 * Variants:
 *   note     — 圖文筆記 (photo note, the primary format)
 *   video    — 影片筆記 (short video note)
 *   search   — 搜索結果卡片 (search result card)
 */
import React from "react";
import { Avatar, Chip, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHeart, faComment, faStar, faShare,
  faLocationDot, faSearch, faMagnifyingGlass,
  faPlay, faEllipsis,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, dicebear, handleOf, MarkdownText } from "./shared";

/* XHS brand red */
const XHS_RED = "#FF2442";
const XHS_DARK = "#1A1A1A";
const XHS_GRAY = "#9B9B9B";
const XHS_BG   = "#F5F5F5";

/* ─────────────── XHS Avatar helper ─────────────── */
const xhsAvatar = (name: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name || "xhs")}&backgroundColor=FF2442&backgroundType=solid`;

/* ─────────────── 圖文筆記 (Note) ─────────────── */

export function XHSNote({
  title, brandName, variantLabel,
  liveTitle, liveCaption, liveDescription, liveHashtags, liveImageDesc, liveCta,
}: MockupFields) {
  const brand   = brandName ?? "品牌帳號";
  const handle  = handleOf(brandName);
  const tags    = liveHashtags ?? ["品牌", "生活", "推薦"];

  return (
    <div className="w-full max-w-[375px] mx-auto">
      <MockupHeader icon={faHeart} label="小紅書 · 圖文筆記" variantLabel={variantLabel} />

      {/* Phone chrome */}
      <div className="bg-[#1A1A1A] rounded-[36px] p-3 shadow-2xl">
        <div className="bg-white rounded-[28px] overflow-hidden">

          {/* Status bar */}
          <div className="bg-white px-5 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#1A1A1A]">9:41</span>
            <div className="flex gap-1 items-center">
              <div className="w-4 h-2 border border-[#1A1A1A] rounded-sm">
                <div className="h-full w-3/4 bg-[#1A1A1A] rounded-sm" />
              </div>
            </div>
          </div>

          {/* Top nav */}
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="flex gap-4 items-center">
              <span className="text-[13px] text-[#9B9B9B]">關注</span>
              <span className="text-[13px] font-bold text-[#1A1A1A] border-b-2 pb-0.5" style={{ borderColor: XHS_RED }}>
                發現
              </span>
              <span className="text-[13px] text-[#9B9B9B]">台灣</span>
            </div>
            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-[#1A1A1A] text-[15px]" />
          </div>

          {/* Cover image — 3:4 portrait */}
          <div className="relative mx-3 rounded-xl overflow-hidden" style={{ aspectRatio: "3/4" }}>
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 z-10">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mb-2">
                <FontAwesomeIcon icon={faHeart} className="text-white text-lg" />
              </div>
              <p className="text-white/80 text-[11px] leading-tight">
                {liveImageDesc ?? "封面圖 · 等待 visual agent"}
              </p>
            </div>

            {/* Overlay gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/50 to-transparent z-10" />

            {/* Bottom overlay: tags */}
            <div className="absolute bottom-3 left-3 z-20 flex flex-wrap gap-1">
              {tags.slice(0, 2).map((tag, i) => (
                <span key={i} className="text-[10px] text-white/90 bg-black/30 px-2 py-0.5 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>

            {/* Top-right: 收藏 */}
            <div className="absolute top-3 right-3 z-20 flex flex-col items-center gap-2">
              <button className="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center">
                <FontAwesomeIcon icon={faEllipsis} className="text-white text-[12px]" />
              </button>
            </div>
          </div>

          {/* Note content */}
          <div className="px-4 pt-3 pb-2">
            {/* Title */}
            <h2 className="text-[15px] font-bold text-[#1A1A1A] leading-snug line-clamp-2 mb-2">
              {liveTitle ?? title}
            </h2>

            {/* Body */}
            {liveCaption ? (
              <MarkdownText content={liveCaption} lineClamp={3} className="text-[13px] text-[#333] leading-relaxed mb-2" />
            ) : (
              <div className="space-y-1.5 mb-2">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-[92%] rounded" />
                <Skeleton className="h-3 w-[78%] rounded" />
              </div>
            )}

            {/* Hashtags */}
            <div className="flex flex-wrap gap-1 mb-3">
              {tags.map((tag, i) => (
                <span key={i} className="text-[12px] font-medium" style={{ color: XHS_RED }}>
                  #{tag}
                </span>
              ))}
            </div>

            {/* Location tag */}
            <div className="flex items-center gap-1 text-[11px] text-[#9B9B9B] mb-3">
              <FontAwesomeIcon icon={faLocationDot} className="text-[10px]" />
              <span>台灣 · 台北市</span>
            </div>
          </div>

          {/* Author bar */}
          <div className="px-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar src={xhsAvatar(brand)} size="sm" className="w-7 h-7 shrink-0" />
              <span className="text-[12px] font-medium text-[#1A1A1A] truncate max-w-[120px]">
                {brand}
              </span>
            </div>

            {/* Engagement */}
            <div className="flex items-center gap-4">
              <button className="flex flex-col items-center gap-0.5">
                <FontAwesomeIcon icon={faHeart} className="text-[16px]" style={{ color: XHS_RED }} />
                <span className="text-[10px] text-[#9B9B9B]">1.2k</span>
              </button>
              <button className="flex flex-col items-center gap-0.5">
                <FontAwesomeIcon icon={faStar} className="text-[16px] text-[#FFB800]" />
                <span className="text-[10px] text-[#9B9B9B]">856</span>
              </button>
              <button className="flex flex-col items-center gap-0.5">
                <FontAwesomeIcon icon={faComment} className="text-[16px] text-[#9B9B9B]" />
                <span className="text-[10px] text-[#9B9B9B]">234</span>
              </button>
            </div>
          </div>

          {/* Bottom nav */}
          <div className="border-t border-[#F0F0F0] px-6 py-2 flex items-center justify-around">
            {["首頁", "探索", "發佈", "購物", "我"].map((item, i) => (
              <button key={i} className="flex flex-col items-center gap-0.5">
                {i === 2 ? (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-lg font-bold"
                    style={{ background: `linear-gradient(135deg, ${XHS_RED}, #FF6B6B)` }}
                  >
                    +
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded bg-[#F0F0F0]" />
                )}
                <span className="text-[10px]" style={{ color: i === 0 ? XHS_RED : "#9B9B9B" }}>
                  {item}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 影片筆記 (Video Note) ─────────────── */

export function XHSVideo({
  title, brandName, variantLabel,
  liveTitle, liveCaption, liveHashtags, liveImageDesc, liveDescription,
}: MockupFields) {
  const brand = brandName ?? "品牌帳號";
  const tags  = liveHashtags ?? ["短影音", "品牌", "推薦"];

  return (
    <div className="w-full max-w-[375px] mx-auto">
      <MockupHeader icon={faPlay} label="小紅書 · 影片筆記" variantLabel={variantLabel} />

      <div className="bg-[#1A1A1A] rounded-[36px] p-3 shadow-2xl">
        <div className="bg-black rounded-[28px] overflow-hidden">

          {/* 9:16 video area */}
          <div className="relative" style={{ aspectRatio: "9/16" }}>
            <Skeleton className="absolute inset-0 rounded-none bg-neutral-900" />

            {/* Overlay gradient bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-2/5 bg-gradient-to-t from-black to-transparent z-10" />

            {/* Play indicator */}
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                <FontAwesomeIcon icon={faPlay} className="text-white text-2xl ml-1" />
              </div>
            </div>

            {/* Right action rail */}
            <div className="absolute right-3 bottom-32 z-20 flex flex-col items-center gap-5">
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white">
                  <Avatar src={xhsAvatar(brand)} size="sm" className="w-full h-full" />
                </div>
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white font-bold -mt-2"
                  style={{ backgroundColor: XHS_RED }}
                >
                  +
                </div>
              </div>
              {[
                { icon: faHeart,   count: "2.3k", color: XHS_RED },
                { icon: faStar,    count: "1.1k", color: "#FFB800" },
                { icon: faComment, count: "456",  color: "white" },
                { icon: faShare,   count: "分享",   color: "white" },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <FontAwesomeIcon icon={item.icon} className="text-2xl" style={{ color: item.color }} />
                  <span className="text-[10px] text-white">{item.count}</span>
                </div>
              ))}
            </div>

            {/* Bottom content */}
            <div className="absolute bottom-4 left-4 right-14 z-20">
              <p className="text-white font-bold text-[15px] leading-snug mb-1 line-clamp-2">
                {liveTitle ?? title}
              </p>
              {liveDescription ? (
                <MarkdownText content={liveDescription} lineClamp={2} className="text-white/80 text-[12px] mb-2" />
              ) : (
                <div className="space-y-1 mb-2">
                  <Skeleton className="h-2.5 w-[85%] rounded bg-white/20" />
                  <Skeleton className="h-2.5 w-[65%] rounded bg-white/20" />
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 3).map((tag, i) => (
                  <span key={i} className="text-[11px] text-white/90">#{tag}</span>
                ))}
              </div>

              {/* Music ticker */}
              <div className="flex items-center gap-1 mt-2">
                <div className="w-3 h-3 rounded-full border border-white/60 flex items-center justify-center">
                  <div className="w-1 h-1 rounded-full bg-white/60" />
                </div>
                <p className="text-white/60 text-[11px] truncate max-w-[180px]">
                  {brand} 原創音樂 · 推薦
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 搜索結果卡片 (Search Card) ─────────────── */

export function XHSSearch({
  title, brandName, variantLabel,
  liveTitle, liveCaption, liveHashtags, liveImageDesc,
}: MockupFields) {
  const brand = brandName ?? "品牌帳號";
  const tags  = liveHashtags ?? ["品牌", "推薦"];

  const fakeResults = [
    { title: liveTitle ?? title, isMain: true },
    { title: "同類型筆記推薦", isMain: false },
    { title: "相關品牌體驗", isMain: false },
    { title: "用戶真實評測", isMain: false },
  ];

  return (
    <div className="w-full max-w-[375px] mx-auto">
      <MockupHeader icon={faSearch} label="小紅書 · 搜索筆記" variantLabel={variantLabel} />

      <div className="bg-[#1A1A1A] rounded-[36px] p-3 shadow-2xl">
        <div className="bg-[#F5F5F5] rounded-[28px] overflow-hidden">

          {/* Search bar */}
          <div className="bg-white px-4 pt-10 pb-3">
            <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-full px-3 py-2">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-[#9B9B9B] text-[13px]" />
              <span className="text-[13px] text-[#9B9B9B] flex-1">
                {tags[0] ?? brand}
              </span>
              <span className="text-[12px] font-semibold" style={{ color: XHS_RED }}>搜索</span>
            </div>
            {/* Filter tabs */}
            <div className="flex gap-3 mt-2.5 overflow-x-auto">
              {["綜合", "最新", "視頻", "圖文", "品牌號"].map((tab, i) => (
                <button
                  key={i}
                  className="text-[12px] shrink-0 pb-1"
                  style={{
                    color: i === 0 ? XHS_RED : "#9B9B9B",
                    borderBottom: i === 0 ? `2px solid ${XHS_RED}` : "none",
                    fontWeight: i === 0 ? 700 : 400,
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Masonry-style grid */}
          <div className="px-3 py-3 grid grid-cols-2 gap-2">
            {fakeResults.map((result, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm">
                {/* Card image */}
                <div
                  className="relative bg-[#E8E8E8]"
                  style={{ aspectRatio: i === 0 ? "3/4" : "3/3.5" }}
                >
                  <Skeleton className="absolute inset-0 rounded-none" />
                  {result.isMain && (
                    <div className="absolute top-2 left-2 z-10">
                      <span
                        className="text-[10px] text-white px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ backgroundColor: XHS_RED }}
                      >
                        品牌
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/30 to-transparent" />
                </div>

                {/* Card text */}
                <div className="px-2 py-2">
                  <p className="text-[12px] text-[#1A1A1A] font-medium line-clamp-2 leading-snug">
                    {result.isMain
                      ? (liveTitle ?? title)
                      : result.title
                    }
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1">
                      <Avatar src={xhsAvatar(brand)} size="sm" className="w-4 h-4" />
                      <span className="text-[10px] text-[#9B9B9B] truncate max-w-[50px]">
                        {result.isMain ? brand : "推薦用戶"}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 text-[#9B9B9B]">
                      <FontAwesomeIcon icon={faHeart} className="text-[10px]" />
                      <span className="text-[10px]">{result.isMain ? "1.2k" : `${(i + 1) * 300}`}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
