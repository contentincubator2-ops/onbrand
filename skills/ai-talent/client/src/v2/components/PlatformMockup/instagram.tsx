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
// brand icons used for IG Profile tabs
// (none needed beyond instagram itself)
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInstagram } from "@fortawesome/free-brands-svg-icons";
import {
  faHeart, faComment, faPaperPlane, faBookmark, faImages, faCircleCheck,
  faMusic, faChevronLeft, faXmark, faVolumeHigh, faTableCellsLarge,
  faVideo, faTag, faUserGroup, faEye, faShoppingBag,
} from "@fortawesome/free-solid-svg-icons";
import {
  type MockupFields, MockupHeader, StoryRingAvatar, VerticalActionRail,
  dicebear, handleOf, SlotContent, MarkdownText,
} from "./shared";

/* ─────────────── IG Feed (1:1 default) ─────────────── */

export function IGFeed({ title, brandName, variantLabel, liveCaption, liveHashtags, liveImageDesc, slotMap, imageSlotFlow }: MockupFields) {
  const handle = handleOf(brandName);

  // Resolve caption: slotMap "caption" wins over legacy liveCaption prop
  const captionSlot = slotMap?.caption;
  const hashtagSlot = slotMap?.hashtags;
  const imageSlot   = slotMap?.image ?? slotMap?.imageDesc;

  // Effective values (slotMap overrides legacy props)
  const effectiveCaption   = captionSlot?.status === "filled" ? captionSlot.value as string : liveCaption;
  const effectiveHashtags  = hashtagSlot?.status === "filled" ? hashtagSlot.value as string[] : liveHashtags;
  const effectiveImageDesc = imageSlot?.status   === "filled" ? imageSlot.value  as string : liveImageDesc;

  return (
    <div className="w-full max-w-[420px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <StoryRingAvatar src={dicebear(brandName ?? "brand")} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-small font-semibold leading-tight truncate">
                {handle}
                <FontAwesomeIcon icon={faCircleCheck} className="text-tiny text-primary" />
              </div>
              <p className="text-tiny text-default-500 truncate leading-tight">原創音訊</p>
            </div>
          </div>
          <Button isIconOnly size="sm" variant="light" radius="full" aria-label="more" className="min-w-0 w-7 h-7">
            <span className="text-medium tracking-tighter">⋯</span>
          </Button>
        </div>

        {/* Image slot — Session 7: imageSlotFlow embedded | loading spinner | skeleton placeholder */}
        <div className="relative aspect-square bg-default-100 overflow-hidden">
          {imageSlotFlow ? (
            // Session 7: 3-step media gen flow lives inside the slot
            imageSlotFlow
          ) : imageSlot?.status === "loading" ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center px-4">
                <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-tiny text-primary/70">視覺 Agent 生成中…</p>
              </div>
            </div>
          ) : imageSlot?.status === "filled" && typeof imageSlot.value === "string" && imageSlot.value.startsWith("http") ? (
            // Filled with an actual image URL — show the image
            <img src={imageSlot.value as string} alt="generated" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <>
              <Skeleton className="absolute inset-0" />
              <div className="absolute inset-0 flex items-center justify-center text-default-400 p-4">
                <div className="text-center">
                  <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
                  <p className="text-tiny line-clamp-3">{effectiveImageDesc ?? "主圖 · 等待 craft agent"}</p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-4 text-foreground">
            <FontAwesomeIcon icon={faHeart} className="text-xl" />
            <FontAwesomeIcon icon={faComment} className="text-xl" />
            <FontAwesomeIcon icon={faPaperPlane} className="text-xl" />
          </div>
          <FontAwesomeIcon icon={faBookmark} className="text-xl text-foreground" />
        </div>

        <div className="px-3 pb-1 flex items-center gap-1.5">
          <AvatarGroup max={3} size="sm" isBordered className="scale-75 -ml-1">
            <Avatar src={dicebear("liker1")} />
            <Avatar src={dicebear("liker2")} />
            <Avatar src={dicebear("liker3")} />
          </AvatarGroup>
          <p className="text-small leading-tight">
            <span className="text-default-500">由 </span>
            <span className="font-semibold">friend_handle</span>
            <span className="text-default-500"> 與其他 </span>
            <span className="font-semibold">1,234</span>
            <span className="text-default-500"> 人按讚</span>
          </p>
        </div>

        <div className="px-3 pb-1 text-small leading-snug">
          <span className="font-semibold mr-1.5">{handle}</span>
          <span className="text-foreground">{title}</span>

          {/* Caption slot — SlotContent handles loading/filled/empty */}
          <div className="mt-1.5">
            <SlotContent
              slotKey="caption"
              slotMap={slotMap}
              skeletonLines={3}
              placeholder={
                effectiveCaption ? (
                  <MarkdownText content={effectiveCaption} lineClamp={6} className="text-foreground" />
                ) : (
                  <div className="space-y-1">
                    <Skeleton className="h-2.5 w-[94%] rounded" />
                    <Skeleton className="h-2.5 w-[78%] rounded" />
                  </div>
                )
              }
            >
              {(val) => (
                <MarkdownText content={(val as string) || effectiveCaption || ""} lineClamp={6} className="text-foreground" />
              )}
            </SlotContent>
          </div>

          {/* Hashtag slot — SlotContent handles loading/filled/empty */}
          <div className="mt-1.5">
            <SlotContent
              slotKey="hashtags"
              slotMap={slotMap}
              skeletonLines={1}
              placeholder={
                effectiveHashtags && effectiveHashtags.length > 0 ? (
                  <p className="text-secondary text-small">
                    {effectiveHashtags.slice(0, 8).join(" ")}
                    {effectiveHashtags.length > 8 && <span className="text-default-500"> …更多</span>}
                  </p>
                ) : (
                  <p className="text-secondary text-small">
                    #等寫手 #等寫手 #等寫手 <span className="text-default-500">…更多</span>
                  </p>
                )
              }
            >
              {(val) => {
                const tags = Array.isArray(val) ? val as string[] : [val as string];
                return (
                  <p className="text-secondary text-small">
                    {tags.slice(0, 8).join(" ")}
                    {tags.length > 8 && <span className="text-default-500"> …更多</span>}
                  </p>
                );
              }}
            </SlotContent>
          </div>
        </div>

        <p className="px-3 pb-1 text-small text-default-500">
          查看全部 <span className="font-medium">87</span> 則留言
        </p>
        <p className="px-3 pb-3 text-tiny text-default-400 uppercase tracking-wider">5 分鐘前</p>
      </div>
    </div>
  );
}

/* ─────────────── IG Carousel ─────────────── */

export function IGCarousel({ title, brandName, variantLabel, liveCaption, liveHashtags, liveImageDesc }: MockupFields) {
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
              <div className="flex items-center gap-1 text-small font-semibold leading-tight truncate">
                {handle}
                <FontAwesomeIcon icon={faCircleCheck} className="text-tiny text-primary" />
              </div>
              <p className="text-tiny text-default-500 truncate leading-tight">原創音訊</p>
            </div>
          </div>
          <Button isIconOnly size="sm" variant="light" radius="full" aria-label="more" className="min-w-0 w-7 h-7">
            <span className="text-medium tracking-tighter">⋯</span>
          </Button>
        </div>

        <div className="relative aspect-square bg-default-100">
          <Skeleton className="absolute inset-0" />
          <div className="absolute inset-0 flex items-center justify-center text-default-400 p-4">
            <div className="text-center">
              <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
              <p className="text-tiny line-clamp-3">{liveImageDesc ?? `輪播 1 / ${carouselCount} · 等待 craft agent`}</p>
            </div>
          </div>
          <div className="absolute top-2.5 right-2.5 bg-black/55 text-white text-tiny font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
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
            <FontAwesomeIcon icon={faHeart} className="text-xl" />
            <FontAwesomeIcon icon={faComment} className="text-xl" />
            <FontAwesomeIcon icon={faPaperPlane} className="text-xl" />
          </div>
          <FontAwesomeIcon icon={faBookmark} className="text-xl text-foreground" />
        </div>

        <div className="px-3 pb-1 text-small leading-snug">
          <span className="font-semibold mr-1.5">{handle}</span>
          <span className="text-foreground">{title}</span>
          {liveCaption ? (
            <MarkdownText content={liveCaption} lineClamp={5} className="mt-1.5 text-foreground" />
          ) : (
            <div className="mt-1.5 space-y-1">
              <Skeleton className="h-2.5 w-[94%] rounded" />
              <Skeleton className="h-2.5 w-[78%] rounded" />
            </div>
          )}
          {liveHashtags && liveHashtags.length > 0 && (
            <p className="mt-1.5 text-secondary text-small">
              {liveHashtags.slice(0, 8).join(" ")}
            </p>
          )}
        </div>

        <p className="px-3 pb-3 text-tiny text-default-400 uppercase tracking-wider">5 分鐘前</p>
      </div>
    </div>
  );
}

/* ─────────────── IG Reels (9:16 + side action rail) ─────────────── */

export function IGReels({ title, brandName, variantLabel, liveCaption, liveVideoDesc }: MockupFields) {
  const handle = handleOf(brandName);
  return (
    <div className="w-full max-w-[280px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 pt-3 text-white">
          <span className="text-small font-semibold">Reels</span>
          <FontAwesomeIcon icon={faImages} />
        </div>

        {/* Video placeholder */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="absolute inset-0 opacity-30" />
          <div className="relative z-10 text-center text-white/60 p-4">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny line-clamp-3">{liveVideoDesc ?? "9:16 影片 · 等待 craft agent"}</p>
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
            <span className="text-small font-semibold">{handle}</span>
            <Button size="sm" radius="sm" variant="bordered" className="h-6 min-w-0 px-2 text-tiny border-white text-white">追蹤</Button>
          </div>
          <MarkdownText content={liveCaption ?? title ?? ""} lineClamp={3} className="text-small" />
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
            <span className="text-small font-semibold">{handle}</span>
            <span className="text-tiny opacity-80">5 分鐘前</span>
          </div>
          <div className="flex items-center gap-3 opacity-90">
            <FontAwesomeIcon icon={faVolumeHigh} className="text-small" />
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
          <div className="bg-white/20 backdrop-blur-sm rounded-medium p-2 text-white text-small line-clamp-2">
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

/* ─────────────── IG Profile (3-col grid) ─────────────── */

export function IGProfile({ brandName, variantLabel }: MockupFields) {
  const handle = handleOf(brandName);
  return (
    <div className="w-full max-w-[400px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <p className="text-medium font-semibold">{handle}</p>
          <span className="text-medium tracking-tighter">⋯</span>
        </div>
        <div className="px-4 py-3 flex items-center gap-5">
          <StoryRingAvatar src={dicebear(brandName ?? "brand")} size={84} />
          <div className="flex-1 grid grid-cols-3 gap-2 text-center text-small">
            <div><div className="font-bold">42</div><div className="text-tiny text-default-500">貼文</div></div>
            <div><div className="font-bold">12.3K</div><div className="text-tiny text-default-500">粉絲</div></div>
            <div><div className="font-bold">567</div><div className="text-tiny text-default-500">追蹤中</div></div>
          </div>
        </div>
        <div className="px-4 pb-2 space-y-1">
          <p className="text-small font-semibold flex items-center gap-1">
            {brandName ?? "Your Brand"}
            <FontAwesomeIcon icon={faCircleCheck} className="text-tiny text-primary" />
          </p>
          <p className="text-tiny text-default-500">藝術家・創作者・分享靈感</p>
          <p className="text-tiny text-primary">your-brand.com</p>
        </div>
        <div className="px-4 pb-3 grid grid-cols-3 gap-2">
          <Button size="sm" radius="md" color="primary" className="font-medium">追蹤</Button>
          <Button size="sm" radius="md" variant="bordered">傳訊息</Button>
          <Button isIconOnly size="sm" radius="md" variant="bordered" aria-label="more"><FontAwesomeIcon icon={faUserGroup} /></Button>
        </div>
        <div className="px-4 pb-3 flex gap-3 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 flex flex-col items-center gap-1 w-16">
              <div className="w-14 h-14 rounded-full border-2 border-divider bg-default-100" />
              <p className="text-tiny text-default-500 truncate w-full text-center">精選 {i + 1}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-divider flex items-center justify-around text-default-500">
          <button className="flex-1 py-2 border-t-2 border-foreground text-foreground"><FontAwesomeIcon icon={faTableCellsLarge} /></button>
          <button className="flex-1 py-2"><FontAwesomeIcon icon={faVideo} /></button>
          <button className="flex-1 py-2"><FontAwesomeIcon icon={faTag} /></button>
        </div>
        <div className="grid grid-cols-3 gap-px bg-divider">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square bg-default-100 relative flex items-center justify-center">
              <Skeleton className="absolute inset-0" />
              <FontAwesomeIcon icon={faImages} className="relative z-10 text-default-300" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── IG Live (9:16 + LIVE chip + viewers + chat) ─────────────── */

export function IGLive({ title, brandName, variantLabel }: MockupFields) {
  const handle = handleOf(brandName);
  return (
    <div className="w-full max-w-[280px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="relative bg-default-900 rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        {/* Top: LIVE badge + viewer count + close */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 pt-3 text-white">
          <div className="flex items-center gap-2">
            <span className="bg-danger text-white text-tiny font-bold px-2 py-0.5 rounded uppercase">LIVE</span>
            <span className="bg-black/40 backdrop-blur-sm text-tiny px-2 py-0.5 rounded flex items-center gap-1">
              <FontAwesomeIcon icon={faEye} className="text-tiny" /> 1.2K
            </span>
          </div>
          <FontAwesomeIcon icon={faXmark} className="text-medium" />
        </div>
        {/* Host info top-left */}
        <div className="absolute top-12 left-3 z-10 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full pl-1 pr-2 py-0.5">
          <StoryRingAvatar src={dicebear(brandName ?? "brand")} size={24} />
          <span className="text-white text-tiny font-semibold">{handle}</span>
          <button className="bg-white text-black text-tiny font-bold px-2 py-0.5 rounded-full">追蹤</button>
        </div>
        {/* Video placeholder */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="absolute inset-0 opacity-30" />
          <div className="relative z-10 text-center text-white/60">
            <FontAwesomeIcon icon={faVideo} className="text-4xl mb-2" />
            <p className="text-tiny">直播中 · 等待 craft agent</p>
          </div>
        </div>
        {/* Floating chat bubbles bottom-left */}
        <div className="absolute bottom-16 left-3 z-10 space-y-1.5 max-w-[60%]">
          {["太精彩了!", "什麼時候下一場?", "❤️❤️❤️"].map((m, i) => (
            <div key={i} className="bg-black/50 backdrop-blur-sm text-white text-tiny px-2 py-1 rounded-medium">
              <span className="font-semibold">user_{i+1}</span> {m}
            </div>
          ))}
        </div>
        {/* Bottom: comment input + reactions */}
        <div className="absolute bottom-3 inset-x-3 z-10 flex items-center gap-2">
          <div className="flex-1 bg-white/15 border border-white/30 rounded-full px-3 py-1.5 text-tiny text-white/70">
            傳訊息…
          </div>
          <FontAwesomeIcon icon={faHeart} className="text-white text-medium" />
          <FontAwesomeIcon icon={faPaperPlane} className="text-white text-medium" />
        </div>
        {/* Title overlay (small) */}
        <div className="absolute top-20 inset-x-3 z-10 text-white text-tiny opacity-80 line-clamp-2">{title}</div>
      </div>
    </div>
  );
}

/* ─────────────── IG Ad (feed + Sponsored + CTA bar) ─────────────── */

export function IGAd({ title, brandName, variantLabel }: MockupFields) {
  const handle = handleOf(brandName);
  return (
    <div className="w-full max-w-[420px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar src={dicebear(brandName ?? "brand")} size="sm" isBordered color="default" />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-small font-semibold leading-tight truncate">
                {handle}
                <FontAwesomeIcon icon={faCircleCheck} className="text-tiny text-primary" />
              </div>
              <p className="text-tiny text-default-500 truncate leading-tight">贊助 · Sponsored</p>
            </div>
          </div>
          <span className="text-medium tracking-tighter">⋯</span>
        </div>
        <div className="relative aspect-square bg-default-100">
          <Skeleton className="absolute inset-0" />
          <div className="absolute inset-0 flex items-center justify-center text-default-400">
            <div className="text-center">
              <FontAwesomeIcon icon={faShoppingBag} className="text-4xl mb-2" />
              <p className="text-tiny">廣告主圖 · 等待 craft agent</p>
            </div>
          </div>
        </div>
        {/* CTA bar — distinguishes ad from feed */}
        <div className="px-3 py-2.5 border-y border-divider bg-default-50 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-tiny text-default-500">your-brand.com</p>
            <p className="text-small font-semibold truncate">立即購買 · 限時優惠</p>
          </div>
          <FontAwesomeIcon icon={faChevronLeft} className="rotate-180 text-default-500 shrink-0 ml-2" />
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-4 text-foreground">
            <FontAwesomeIcon icon={faHeart} className="text-xl" />
            <FontAwesomeIcon icon={faComment} className="text-xl" />
            <FontAwesomeIcon icon={faPaperPlane} className="text-xl" />
          </div>
          <FontAwesomeIcon icon={faBookmark} className="text-xl text-foreground" />
        </div>
        <div className="px-3 pb-3 text-small leading-snug">
          <span className="font-semibold mr-1.5">{handle}</span>
          <span>{title}</span>
          <div className="mt-1.5 space-y-1">
            <Skeleton className="h-2.5 w-[88%] rounded" />
            <Skeleton className="h-2.5 w-[70%] rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
