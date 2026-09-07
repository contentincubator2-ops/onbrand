/**
 * Pinterest mockups.
 *
 * Variants:
 *   pin      — single pin card (mobile phone chrome)
 *   board    — board / masonry grid view (desktop MacBook frame)
 *   story-pin — idea pin / story format (fullscreen mobile)
 */
import { Avatar, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHeart, faSearch, faEllipsis,
  faPlus, faShare, faBookmark,
  faArrowUpFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, handleOf } from "./shared";

const PIN_RED    = "#E60023";
const PIN_GRAY   = "#767676";
const PIN_BORDER = "#E0E0E0";
const PIN_BG     = "#EFEFEF";

const pinAvatar = (name: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name || "pinterest")}&backgroundColor=E60023&backgroundType=solid`;

/* ─── Fake pin card ─── */
interface PinCardProps {
  label: string;
  tall?: boolean;
  isMain?: boolean;
  brandName?: string;
}
function PinCard({ label, tall = false, isMain = false, brandName }: PinCardProps) {
  const aspectRatio = tall ? "2/3" : "4/5";
  return (
    <div className="rounded-2xl overflow-hidden bg-white shadow-sm relative">
      <div
        className="relative bg-[#E8E8E8] w-full"
        style={{ aspectRatio }}
      >
        <Skeleton className="absolute inset-0 rounded-none" />
        {isMain && (
          <div
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center z-10"
            style={{ backgroundColor: PIN_RED }}
          >
            <FontAwesomeIcon icon={faBookmark} className="text-white text-[12px]" />
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-[11px] font-medium text-[#111] line-clamp-2 leading-snug">{label}</p>
        {isMain && brandName && (
          <div className="flex items-center gap-1 mt-1">
            <Avatar src={pinAvatar(brandName)} size="sm" className="w-4 h-4" />
            <span className="text-[10px] text-[#767676] truncate max-w-[80px]">{brandName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   PINTEREST PIN (single pin, mobile)
───────────────────────────────────────────────────── */
export function PinterestPin({
  title, brandName, variantLabel,
  liveTitle, liveCaption, liveDescription, liveImageDesc, liveCta,
}: MockupFields) {
  const brand  = brandName ?? "品牌帳號";
  const handle = handleOf(brandName);
  const pinTitle = liveTitle ?? title;
  const desc     = liveDescription ?? liveCaption;

  return (
    <div className="w-full max-w-[375px] mx-auto">
      <MockupHeader icon={faBookmark} label="Pinterest · Pin" variantLabel={variantLabel} />

      {/* Phone chrome */}
      <div className="bg-[#1A1A1A] rounded-[36px] p-3 shadow-2xl">
        <div className="bg-white rounded-[28px] overflow-hidden">

          {/* Status bar */}
          <div className="bg-white px-5 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#111]">9:41</span>
            <div className="w-4 h-2 border border-[#111] rounded-sm">
              <div className="h-full w-3/4 bg-[#111] rounded-sm" />
            </div>
          </div>

          {/* Nav */}
          <div className="px-4 py-2 flex items-center justify-between border-b" style={{ borderColor: PIN_BORDER }}>
            <button
              className="text-[20px] font-black"
              style={{ color: PIN_RED, fontFamily: "Georgia, serif" }}
            >
              P
            </button>
            <div className="flex-1 mx-3 bg-[#EFEFEF] rounded-full px-3 py-1.5 flex items-center gap-2">
              <FontAwesomeIcon icon={faSearch} className="text-[#767676] text-[11px]" />
              <span className="text-[12px] text-[#767676]">搜尋</span>
            </div>
            <Avatar src={pinAvatar(brand)} size="sm" className="w-7 h-7" />
          </div>

          {/* Pin image — tall portrait */}
          <div className="relative bg-[#E8E8E8]" style={{ aspectRatio: "2/3" }}>
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 z-10 text-center">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mb-2">
                <FontAwesomeIcon icon={faBookmark} className="text-white text-lg" />
              </div>
              <p className="text-white/80 text-[11px]">{liveImageDesc ?? "Pin 圖片 · 等待 AI 圖像"}</p>
            </div>

            {/* Save button */}
            <button
              className="absolute top-3 right-3 z-20 px-4 py-2 rounded-full text-white text-[13px] font-bold"
              style={{ backgroundColor: PIN_RED }}
            >
              儲存
            </button>
          </div>

          {/* Pin details */}
          <div className="px-4 pt-3 pb-2">
            <h2 className="text-[16px] font-bold text-[#111] leading-snug mb-1.5 line-clamp-2">
              {pinTitle}
            </h2>
            {desc ? (
              <p className="text-[13px] text-[#444] leading-relaxed line-clamp-3 mb-2">{desc}</p>
            ) : (
              <div className="space-y-1.5 mb-2">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-[80%] rounded" />
              </div>
            )}
            {liveCta && (
              <button
                className="mt-1 text-[13px] font-semibold underline"
                style={{ color: PIN_RED }}
              >
                {liveCta}
              </button>
            )}
          </div>

          {/* Author row */}
          <div className="px-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar src={pinAvatar(brand)} size="sm" className="w-8 h-8" />
              <div>
                <p className="text-[13px] font-semibold text-[#111] truncate max-w-[140px]">{brand}</p>
                <p className="text-[11px] text-[#767676]">{handle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button>
                <FontAwesomeIcon icon={faShare} className="text-[#767676] text-[18px]" />
              </button>
              <button>
                <FontAwesomeIcon icon={faEllipsis} className="text-[#767676] text-[18px]" />
              </button>
            </div>
          </div>

          {/* Comments / engagement */}
          <div className="px-4 pb-3 border-t pt-3" style={{ borderColor: PIN_BORDER }}>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#EFEFEF] rounded-full px-3 py-2">
                <span className="text-[12px] text-[#767676]">新增留言...</span>
              </div>
              <button>
                <FontAwesomeIcon icon={faHeart} className="text-[#767676] text-[20px]" />
              </button>
            </div>
          </div>

          {/* Bottom nav */}
          <div className="border-t px-6 py-2 flex items-center justify-around" style={{ borderColor: PIN_BORDER }}>
            {["首頁", "探索", "", "通知", "我"].map((item, i) => (
              <button key={i} className="flex flex-col items-center gap-0.5">
                {i === 2 ? (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: PIN_RED }}
                  >
                    <FontAwesomeIcon icon={faPlus} className="text-white text-[14px]" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded bg-[#E8E8E8]" />
                )}
                {item && <span className="text-[10px] text-[#767676]">{item}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   PINTEREST BOARD (masonry grid, desktop MacBook frame)
───────────────────────────────────────────────────── */
export function PinterestBoard({
  title, brandName, variantLabel,
  liveTitle, liveCaption, liveHashtags,
}: MockupFields) {
  const brand = brandName ?? "品牌帳號";
  const mainTitle = liveTitle ?? title;
  const tags  = liveHashtags ?? ["設計", "靈感", "品牌"];

  const fakePins = [
    { label: mainTitle,                    tall: true,  isMain: true },
    { label: "相關靈感 #1",                 tall: false, isMain: false },
    { label: "相關靈感 #2",                 tall: true,  isMain: false },
    { label: liveCaption ?? "品牌內容展示",  tall: false, isMain: false },
    { label: "靈感收藏 #3",                 tall: false, isMain: false },
    { label: "靈感收藏 #4",                 tall: true,  isMain: false },
  ];

  return (
    <div className="w-full max-w-[600px] mx-auto">
      <MockupHeader icon={faBookmark} label="Pinterest · 看板" variantLabel={variantLabel} />

      {/* MacBook frame */}
      <div className="bg-[#2B2B2B] rounded-[16px] p-3 shadow-2xl">
        {/* Screen bezel */}
        <div className="bg-white rounded-[10px] overflow-hidden">

          {/* Browser chrome */}
          <div className="bg-[#F1F1F1] px-4 py-2 flex items-center gap-2 border-b" style={{ borderColor: PIN_BORDER }}>
            <div className="flex gap-1.5">
              {["#FF5F57", "#FEBC2E", "#28C840"].map((c, i) => (
                <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex-1 bg-white rounded-md px-3 py-1 text-[11px] text-[#767676] mx-4 text-center">
              pinterest.com/{handleOf(brandName)}
            </div>
          </div>

          {/* Pinterest desktop nav */}
          <div className="bg-white px-4 py-2 flex items-center gap-3 border-b" style={{ borderColor: PIN_BORDER }}>
            <span className="text-[20px] font-black" style={{ color: PIN_RED }}>P</span>
            <div className="flex-1 bg-[#EFEFEF] rounded-full px-3 py-1.5 flex items-center gap-2">
              <FontAwesomeIcon icon={faSearch} className="text-[#767676] text-[11px]" />
              <span className="text-[12px] text-[#767676]">搜尋</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-4 py-1.5 rounded-full text-white text-[12px] font-bold"
                style={{ backgroundColor: PIN_RED }}
              >
                建立
              </button>
              <Avatar src={pinAvatar(brand)} size="sm" className="w-7 h-7" />
            </div>
          </div>

          {/* Board header */}
          <div className="px-6 py-4 text-center border-b" style={{ borderColor: PIN_BORDER }}>
            <Avatar src={pinAvatar(brand)} className="w-16 h-16 mx-auto mb-2" />
            <h1 className="text-[20px] font-bold text-[#111]">{brand}</h1>
            <p className="text-[13px] text-[#767676] mt-1">{handleOf(brandName)} · {mainTitle}</p>
            <div className="flex justify-center gap-2 mt-2 flex-wrap">
              {tags.map((t, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: PIN_BG, color: PIN_GRAY }}
                >
                  #{t}
                </span>
              ))}
            </div>
          </div>

          {/* Masonry grid — 3 cols */}
          <div className="px-4 py-4 columns-3 gap-3 space-y-3">
            {fakePins.map((pin, i) => (
              <div key={i} className="break-inside-avoid mb-3">
                <PinCard
                  label={pin.label}
                  tall={pin.tall}
                  isMain={pin.isMain}
                  brandName={brand}
                />
              </div>
            ))}
          </div>
        </div>

        {/* MacBook base notch */}
        <div className="h-4 flex items-center justify-center mt-1">
          <div className="w-20 h-1.5 rounded-full bg-[#3A3A3A]" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   PINTEREST STORY PIN (idea pin, fullscreen mobile)
───────────────────────────────────────────────────── */
export function PinterestStoryPin({
  title, brandName, variantLabel,
  liveTitle, liveDescription, liveImageDesc, liveCta,
}: MockupFields) {
  const brand = brandName ?? "品牌帳號";

  return (
    <div className="w-full max-w-[375px] mx-auto">
      <MockupHeader icon={faArrowUpFromBracket} label="Pinterest · Idea Pin" variantLabel={variantLabel} />

      <div className="bg-[#1A1A1A] rounded-[36px] p-3 shadow-2xl">
        <div className="bg-black rounded-[28px] overflow-hidden">
          <div className="relative" style={{ aspectRatio: "9/16" }}>
            <Skeleton className="absolute inset-0 rounded-none bg-neutral-900" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 z-10" />

            {/* Top: progress + close */}
            <div className="absolute top-4 left-4 right-4 z-20 flex gap-1">
              {[1, 2, 3, 4].map((_, i) => (
                <div
                  key={i}
                  className="h-0.5 flex-1 rounded-full"
                  style={{ backgroundColor: i === 0 ? "white" : "rgba(255,255,255,0.4)" }}
                />
              ))}
            </div>

            {/* Author row */}
            <div className="absolute top-10 left-4 right-4 z-20 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-white/50">
                <Avatar src={pinAvatar(brand)} size="sm" className="w-full h-full" />
              </div>
              <span className="text-white text-[13px] font-semibold">{brand}</span>
              <button
                className="ml-auto px-3 py-1 rounded-full text-[12px] font-semibold border border-white text-white"
              >
                追蹤
              </button>
            </div>

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mb-3">
                <FontAwesomeIcon icon={faArrowUpFromBracket} className="text-white text-xl" />
              </div>
              <p className="text-white/70 text-[12px]">{liveImageDesc ?? "Idea Pin 圖片 · 等待 AI 圖像"}</p>
            </div>

            {/* Bottom */}
            <div className="absolute bottom-6 left-4 right-4 z-20">
              <h2 className="text-white text-[18px] font-bold leading-snug mb-1">
                {liveTitle ?? title}
              </h2>
              {liveDescription && (
                <p className="text-white/80 text-[13px] line-clamp-2 mb-2">{liveDescription}</p>
              )}
              {liveCta && (
                <button
                  className="px-5 py-2 rounded-full text-white text-[13px] font-bold"
                  style={{ backgroundColor: PIN_RED }}
                >
                  {liveCta}
                </button>
              )}
              <div className="flex items-center justify-between mt-3">
                <button>
                  <FontAwesomeIcon icon={faHeart} className="text-white text-[22px]" />
                </button>
                <button>
                  <FontAwesomeIcon icon={faShare} className="text-white text-[22px]" />
                </button>
                <button>
                  <FontAwesomeIcon icon={faEllipsis} className="text-white text-[22px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
