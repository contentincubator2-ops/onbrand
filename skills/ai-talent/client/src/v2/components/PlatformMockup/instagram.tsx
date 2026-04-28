/**
 * Instagram mockups.
 *
 * Variants implemented in PR2.1: feed, carousel, reel, story
 * (live / profile / ad → fall back to feed for now)
 *
 * Structure references (MIT-licensed; we re-implemented in HeroUI +
 * Tailwind, but structural decisions track these sources):
 *   - feed/carousel: Flowbite Card + Carousel (themesberg/flowbite, MIT)
 *   - story: justinTsugranes/project_instagram-stories-ui-tailwind (MIT)
 *   - reel: 9:16 + side rail pattern from SashenJayathilaka/TIK-TOK-Clone (MIT)
 */
import React from "react";
import {
  Avatar, AvatarGroup, Button, Skeleton,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInstagram } from "@fortawesome/free-brands-svg-icons";
import {
  faHeart, faComment, faPaperPlane, faBookmark, faImages, faCircleCheck,
  faMusic, faChevronLeft, faXmark, faVolumeHigh,
} from "@fortawesome/free-solid-svg-icons";
import {
  type MockupFields, MockupHeader, StoryRingAvatar, VerticalActionRail,
  dicebear, handleOf,
} from "./shared";

/* ─────────────── IG Feed (1:1 default) ─────────────── */

export function IGFeed({ title, brandName, variantLabel }: MockupFields) {
  const handle = handleOf(brandName);
  return (
    <div className="w-full max-w-[420px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <StoryRingAvatar src={dicebear(brandName ?? "brand")} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[0.84rem] font-semibold leading-tight truncate">
                {handle}
                <FontAwesomeIcon icon={faCircleCheck} className="text-[0.66rem] text-primary" />
              </div>
              <p className="text-[0.7rem] text-default-500 truncate leading-tight">原創音訊</p>
            </div>
          </div>
          <Button isIconOnly size="sm" variant="light" radius="full" aria-label="more" className="min-w-0 w-7 h-7">
            <span className="text-medium tracking-tighter">⋯</span>
          </Button>
        </div>

        <div className="relative aspect-square bg-default-100">
          <Skeleton className="absolute inset-0" />
          <div className="absolute inset-0 flex items-center justify-center text-default-400">
            <div className="text-center">
              <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
              <p className="text-tiny">主圖 · 等待 craft agent</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-4 text-foreground">
            <FontAwesomeIcon icon={faHeart} className="text-[1.4rem]" />
            <FontAwesomeIcon icon={faComment} className="text-[1.35rem]" />
            <FontAwesomeIcon icon={faPaperPlane} className="text-[1.35rem]" />
          </div>
          <FontAwesomeIcon icon={faBookmark} className="text-[1.4rem] text-foreground" />
        </div>

        <div className="px-3 pb-1 flex items-center gap-1.5">
          <AvatarGroup max={3} size="sm" isBordered className="scale-75 -ml-1">
            <Avatar src={dicebear("liker1")} />
            <Avatar src={dicebear("liker2")} />
            <Avatar src={dicebear("liker3")} />
          </AvatarGroup>
          <p className="text-[0.78rem] leading-tight">
            <span className="text-default-500">由 </span>
            <span className="font-semibold">friend_handle</span>
            <span className="text-default-500"> 與其他 </span>
            <span className="font-semibold">1,234</span>
            <span className="text-default-500"> 人按讚</span>
          </p>
        </div>

        <div className="px-3 pb-1 text-[0.82rem] leading-snug">
          <span className="font-semibold mr-1.5">{handle}</span>
          <span className="text-foreground">{title}</span>
          <div className="mt-1.5 space-y-1">
            <Skeleton className="h-2.5 w-[94%] rounded" />
            <Skeleton className="h-2.5 w-[78%] rounded" />
          </div>
          <p className="mt-1.5 text-secondary text-[0.78rem]">
            #等寫手 #等寫手 #等寫手 <span className="text-default-500">…更多</span>
          </p>
        </div>

        <p className="px-3 pb-1 text-[0.78rem] text-default-500">
          查看全部 <span className="font-medium">87</span> 則留言
        </p>
        <p className="px-3 pb-3 text-[0.66rem] text-default-400 uppercase tracking-wider">5 分鐘前</p>
      </div>
    </div>
  );
}

/* ─────────────── IG Carousel ─────────────── */

export function IGCarousel({ title, brandName, variantLabel }: MockupFields) {
  const handle = handleOf(brandName);
  const carouselCount = 9;
  return (
    <div className="w-full max-w-[420px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <StoryRingAvatar src={dicebear(brandName ?? "brand")} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[0.84rem] font-semibold leading-tight truncate">
                {handle}
                <FontAwesomeIcon icon={faCircleCheck} className="text-[0.66rem] text-primary" />
              </div>
              <p className="text-[0.7rem] text-default-500 truncate leading-tight">原創音訊</p>
            </div>
          </div>
          <Button isIconOnly size="sm" variant="light" radius="full" aria-label="more" className="min-w-0 w-7 h-7">
            <span className="text-medium tracking-tighter">⋯</span>
          </Button>
        </div>

        <div className="relative aspect-square bg-default-100">
          <Skeleton className="absolute inset-0" />
          <div className="absolute inset-0 flex items-center justify-center text-default-400">
            <div className="text-center">
              <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
              <p className="text-tiny">輪播 1 / {carouselCount} · 等待 craft agent</p>
            </div>
          </div>
          <div className="absolute top-2.5 right-2.5 bg-black/55 text-white text-[0.66rem] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
            1/{carouselCount}
          </div>
        </div>

        <div className="flex items-center justify-center gap-1 py-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`rounded-full ${i === 0 ? "bg-primary w-1.5 h-1.5" : "bg-default-300 w-1.5 h-1.5 opacity-70"}`} />
          ))}
        </div>

        <div className="flex items-center justify-between px-3 pb-1.5">
          <div className="flex items-center gap-4 text-foreground">
            <FontAwesomeIcon icon={faHeart} className="text-[1.4rem]" />
            <FontAwesomeIcon icon={faComment} className="text-[1.35rem]" />
            <FontAwesomeIcon icon={faPaperPlane} className="text-[1.35rem]" />
          </div>
          <FontAwesomeIcon icon={faBookmark} className="text-[1.4rem] text-foreground" />
        </div>

        <div className="px-3 pb-1 text-[0.82rem] leading-snug">
          <span className="font-semibold mr-1.5">{handle}</span>
          <span className="text-foreground">{title}</span>
          <div className="mt-1.5 space-y-1">
            <Skeleton className="h-2.5 w-[94%] rounded" />
            <Skeleton className="h-2.5 w-[78%] rounded" />
          </div>
        </div>

        <p className="px-3 pb-3 text-[0.66rem] text-default-400 uppercase tracking-wider">5 分鐘前</p>
      </div>
    </div>
  );
}

/* ─────────────── IG Reels (9:16 + side action rail) ─────────────── */

export function IGReels({ title, brandName, variantLabel }: MockupFields) {
  const handle = handleOf(brandName);
  return (
    <div className="w-full max-w-[280px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 pt-3 text-white">
          <span className="text-[0.92rem] font-semibold">Reels</span>
          <FontAwesomeIcon icon={faImages} />
        </div>

        {/* Video placeholder */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="absolute inset-0 opacity-30" />
          <div className="relative z-10 text-center text-white/60">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny">9:16 影片 · 等待 craft agent</p>
          </div>
        </div>

        {/* Right action rail */}
        <VerticalActionRail items={[
          { icon: faHeart,       label: "love",    count: "12.3K" },
          { icon: faComment,     label: "comment", count: "456"  },
          { icon: faPaperPlane,  label: "share",   count: "1.2K" },
          { icon: faBookmark,    label: "save"                    },
          { icon: faMusic,       label: "audio"                   },
        ]} />

        {/* Bottom caption */}
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pr-16 text-white space-y-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <div className="flex items-center gap-2">
            <StoryRingAvatar src={dicebear(brandName ?? "brand")} size={28} />
            <span className="text-[0.82rem] font-semibold">{handle}</span>
            <Button size="sm" radius="sm" variant="bordered" className="h-6 min-w-0 px-2 text-tiny border-white text-white">追蹤</Button>
          </div>
          <p className="text-[0.78rem] line-clamp-2">{title}</p>
          <div className="flex items-center gap-1 text-tiny">
            <FontAwesomeIcon icon={faMusic} className="text-tiny" />
            <span>原創音訊 · {handle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── IG Stories (top progress bars + 9:16) ─────────────── */

export function IGStories({ title, brandName, variantLabel }: MockupFields) {
  const handle = handleOf(brandName);
  const segCount = 5;
  return (
    <div className="w-full max-w-[280px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="relative bg-default-900 rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        {/* Progress bars */}
        <div className="absolute top-2 inset-x-2 z-20 flex gap-1">
          {Array.from({ length: segCount }).map((_, i) => (
            <span key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              {i === 0 && <span className="block h-full w-1/3 bg-white rounded-full" />}
              {i < 0 && <span className="block h-full w-full bg-white rounded-full" />}
            </span>
          ))}
        </div>

        {/* Top bar */}
        <div className="absolute top-5 inset-x-0 z-20 flex items-center justify-between px-3 pt-2 text-white">
          <div className="flex items-center gap-2">
            <img src={dicebear(brandName ?? "brand")} alt="" className="w-7 h-7 rounded-full border border-white/40" />
            <span className="text-[0.78rem] font-semibold">{handle}</span>
            <span className="text-tiny opacity-80">5 分鐘前</span>
          </div>
          <div className="flex items-center gap-3 opacity-90">
            <FontAwesomeIcon icon={faVolumeHigh} className="text-[0.92rem]" />
            <FontAwesomeIcon icon={faXmark} className="text-medium" />
          </div>
        </div>

        {/* Image placeholder */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="absolute inset-0 opacity-30" />
          <div className="relative z-10 text-center text-white/60">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny">限動圖 · 等待 craft agent</p>
          </div>
        </div>

        {/* Bottom caption / sticker placeholder */}
        <div className="absolute bottom-16 inset-x-3 z-10">
          <div className="bg-white/20 backdrop-blur-sm rounded-medium p-2 text-white text-[0.82rem] line-clamp-2">
            {title}
          </div>
        </div>

        {/* Reply input */}
        <div className="absolute bottom-3 inset-x-3 z-10 flex items-center gap-2">
          <div className="flex-1 bg-white/15 border border-white/30 rounded-full px-3 py-1.5 text-tiny text-white/70">
            傳訊息給 {handle}…
          </div>
          <FontAwesomeIcon icon={faHeart} className="text-white" />
          <FontAwesomeIcon icon={faPaperPlane} className="text-white" />
        </div>

        {/* Tap navigation hints (nav arrows) */}
        <div className="absolute left-1 top-1/2 -translate-y-1/2 z-10 text-white/40">
          <FontAwesomeIcon icon={faChevronLeft} />
        </div>
      </div>
    </div>
  );
}
