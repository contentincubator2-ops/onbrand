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
  dicebear, handleOf, SlotContent, MarkdownText, ImageGenSlot,
  SHOW_IMAGE_STYLE_OVERLAY,
} from "./shared";
import { useLang } from "../../../../lib/i18n";
import { getPostTitleFallback } from "../../lib/mockupTitle";

/* ─────────────── IG Feed (1:1 default) ─────────────── */

export function IGFeed({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveHashtags, liveImageDesc, liveImageStyle, liveImageUrl, liveImageStatus, onGenerateImage, slotMap, imageSlotFlow }: MockupFields) {
  const { lang } = useLang();
  const handle = handleOf(brandName);
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");

  // Resolve caption: slotMap "caption" wins over legacy liveCaption prop
  const captionSlot = slotMap?.caption;
  const hashtagSlot = slotMap?.hashtags;
  const imageSlot   = slotMap?.image ?? slotMap?.imageDesc;

  // Effective values (slotMap overrides legacy props)
  const effectiveCaption   = captionSlot?.status === "filled" ? captionSlot.value as string : liveCaption;
  const effectiveHashtags  = hashtagSlot?.status === "filled" ? hashtagSlot.value as string[] : liveHashtags;
  const effectiveImageDesc = imageSlot?.status   === "filled" ? imageSlot.value  as string : liveImageDesc;
  const postTitleFallback = getPostTitleFallback(title, effectiveCaption);

  return (
    <div className="w-full max-w-[420px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <StoryRingAvatar src={avatarSrc} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-small font-semibold leading-tight truncate">
                {handle}
                <FontAwesomeIcon icon={faCircleCheck} className="text-tiny text-primary" />
              </div>
            </div>
          </div>
          <Button isIconOnly size="sm" variant="light" radius="full" aria-label="more" className="min-w-0 w-7 h-7">
            <span className="text-medium tracking-tighter">⋯</span>
          </Button>
        </div>

        {/* Image slot — priorities: liveImageUrl > imageSlotFlow > slotMap > liveImageStyle text > skeleton */}
        {/* 2026-05-10 (CJ feedback「IG 主圖太高」): collapse to slim h-32 strip
            when no image yet; use full aspect-square only when image ready. */}
        <div
          className={`relative bg-default-100 overflow-hidden ${
            liveImageUrl && liveImageStatus === "ready" ? "aspect-square" : "h-32"
          }`}
        >
          {liveImageUrl && liveImageStatus === "ready" ? (
            <>
              <img src={liveImageUrl} alt={liveImageStyle ?? "generated"} className="absolute inset-0 w-full h-full object-cover" />
              {/* 2026-08-19: hidden behind SHOW_IMAGE_STYLE_OVERLAY — the
                  Chinese style text never produced this image. Flip the flag
                  in shared.tsx to restore. */}
              {SHOW_IMAGE_STYLE_OVERLAY && liveImageStyle && (
                <div className="absolute bottom-2 left-2 right-2 bg-black/55 backdrop-blur-sm rounded px-2 py-1">
                  <p className="text-[10px] text-white/90 line-clamp-2">{liveImageStyle}</p>
                </div>
              )}
            </>
          ) : imageSlotFlow ? (
            imageSlotFlow
          ) : imageSlot?.status === "loading" ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center px-4">
                <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-tiny text-primary/70">{lang === "en" ? "Visual agent generating…" : "視覺 Agent 生成中…"}</p>
              </div>
            </div>
          ) : imageSlot?.status === "filled" && typeof imageSlot.value === "string" && imageSlot.value.startsWith("http") ? (
            <img src={imageSlot.value as string} alt="generated" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            // 2026-07-17 (CJ「盤查生圖佔位」): standardized ImageGenSlot
            <div className="absolute inset-0">
              <ImageGenSlot
                brief={liveImageStyle || effectiveImageDesc}
                status={liveImageStatus}
                onGenerate={onGenerateImage}
                aspectClass="w-full h-full"
              />
            </div>
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
          {/* 2026-05-10 (CJ feedback「假資料誤導」): generic placeholder. */}
          <p className="text-small leading-tight text-default-500">
            {lang === "en" ? "Likes · Comments · Shares" : "按讚 · 留言 · 分享"}
          </p>
        </div>

        <div className="px-3 pb-1 text-small leading-snug">
          <span className="font-semibold mr-1.5">{handle}</span>
          {/* A real caption is the post body; mission_outputs.title is only a
              fallback for legacy runs whose caption is empty. */}
          {postTitleFallback && (
            <span className="text-foreground">{postTitleFallback}</span>
          )}

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
                    {effectiveHashtags.length > 8 && <span className="text-default-500">{lang === "en" ? " …more" : " …更多"}</span>}
                  </p>
                ) : (
                  <p className="text-secondary text-small">
                    {lang === "en" ? "#writer-pending #writer-pending #writer-pending" : "#等寫手 #等寫手 #等寫手"} <span className="text-default-500">{lang === "en" ? "…more" : "…更多"}</span>
                  </p>
                )
              }
            >
              {(val) => {
                const tags = Array.isArray(val) ? val as string[] : [val as string];
                return (
                  <p className="text-secondary text-small">
                    {tags.slice(0, 8).join(" ")}
                    {tags.length > 8 && <span className="text-default-500">{lang === "en" ? " …more" : " …更多"}</span>}
                  </p>
                );
              }}
            </SlotContent>
          </div>
        </div>

        <p className="px-3 pb-1 text-small text-default-500">
          {lang === "en" ? "View comments" : "查看留言"}
        </p>
        <p className="px-3 pb-3 text-tiny text-default-400 uppercase tracking-wider">{lang === "en" ? "5 minutes ago" : "5 分鐘前"}</p>
      </div>
    </div>
  );
}

/* ─────────────── IG Carousel ─────────────── */

export function IGCarousel({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveHashtags, liveImageDesc, liveImageStyle, liveImageUrl, liveImageStatus, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const handle = handleOf(brandName);
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  const postTitleFallback = getPostTitleFallback(title, liveCaption);
  const carouselCount = 9;
  return (
    <div className="w-full max-w-[420px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <StoryRingAvatar src={avatarSrc} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-small font-semibold leading-tight truncate">
                {handle}
                <FontAwesomeIcon icon={faCircleCheck} className="text-tiny text-primary" />
              </div>
            </div>
          </div>
          <Button isIconOnly size="sm" variant="light" radius="full" aria-label="more" className="min-w-0 w-7 h-7">
            <span className="text-medium tracking-tighter">⋯</span>
          </Button>
        </div>

        {/* 2026-05-10 (CJ feedback「IG 主圖太高」): collapse to slim h-32 strip
            when no image yet; use full aspect-square only when image ready. */}
        <div
          className={`relative bg-default-100 overflow-hidden ${
            liveImageUrl && liveImageStatus === "ready" ? "aspect-square" : "h-32"
          }`}
        >
          {liveImageUrl && liveImageStatus === "ready" ? (
            <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            // 2026-07-17 (CJ「盤查生圖佔位」): standardized ImageGenSlot
            <div className="absolute inset-0">
              <ImageGenSlot
                brief={liveImageStyle || liveImageDesc}
                status={liveImageStatus}
                onGenerate={onGenerateImage}
                aspectClass="w-full h-full"
              />
            </div>
          )}
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
          {/* A real caption is the post body; mission_outputs.title is only a
              fallback for legacy runs whose caption is empty. */}
          {postTitleFallback && (
            <span className="text-foreground">{postTitleFallback}</span>
          )}
          {liveCaption ? (
            // 2026-05-13 (CJ「標題看起來都會不完整」): removed line-clamp
            // — IG captions can be long (2200 char cap), trimming at 5 lines
            // made 30s outputs look like the AI cut off mid-sentence.
            <MarkdownText content={liveCaption} className="mt-1.5 text-foreground" />
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

        <p className="px-3 pb-3 text-tiny text-default-400 uppercase tracking-wider">{lang === "en" ? "5 minutes ago" : "5 分鐘前"}</p>
      </div>
    </div>
  );
}

/* ─────────────── IG Reels (9:16 + side action rail) ─────────────── */

export function IGReels({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveVideoDesc, liveImageStyle, liveImageUrl, liveImageStatus, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const handle = handleOf(brandName);
  return (
    <div className="w-full max-w-[400px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 pt-3 text-white">
          <span className="text-small font-semibold">Reels</span>
          <FontAwesomeIcon icon={faImages} />
        </div>

        {/* Cover / video placeholder — uses generated image when available, else style brief */}
        {liveImageUrl && liveImageStatus === "ready" ? (
          <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
        ) : (
          // 2026-07-17 (CJ「盤查生圖佔位」): standardized ImageGenSlot
          <div className="absolute inset-0">
            <ImageGenSlot
              brief={liveImageStyle || liveVideoDesc}
              status={liveImageStatus}
              onGenerate={onGenerateImage}
              aspectClass="w-full h-full"
              dark
              videoFrame
            />
          </div>
        )}
        {/* Avatar overlay so brand logo is visible */}
        <div className="absolute top-12 left-3 z-10">
          <img src={brandLogoUrl || dicebear(brandName ?? "brand")} alt="" className="w-9 h-9 rounded-full border-2 border-white/40" />
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
            <Button size="sm" radius="sm" variant="bordered" className="h-6 min-w-0 px-2 text-tiny border-white text-white">{lang === "en" ? "Follow" : "追蹤"}</Button>
          </div>
          <MarkdownText content={liveCaption ?? title ?? ""} lineClamp={3} className="text-small" />
          <div className="flex items-center gap-1 text-tiny">
            <FontAwesomeIcon icon={faMusic} className="text-tiny" />
            <span>{lang === "en" ? "Original audio" : "原創音訊"} · {handle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── IG Stories (top progress bars + 9:16) ─────────────── */

export function IGStories({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const handle = handleOf(brandName);
  const segCount = 5;
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  // Caption first line treated as the overlay 主標 (large text), rest = sub-content
  const lines = (liveCaption ?? "").split(/\n+/).filter(Boolean);
  const overlayMain = lines[0] ?? title;
  const overlaySub = lines.slice(1).join("\n");
  return (
    <div className="w-full max-w-[400px] mx-auto">
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
            <img src={avatarSrc} alt="" className="w-7 h-7 rounded-full border border-white/40" />
            <span className="text-small font-semibold">{handle}</span>
            <span className="text-tiny opacity-80">{lang === "en" ? "5m ago" : "5 分鐘前"}</span>
          </div>
          <div className="flex items-center gap-3 opacity-90">
            <FontAwesomeIcon icon={faVolumeHigh} className="text-small" />
            <FontAwesomeIcon icon={faXmark} className="text-medium" />
          </div>
        </div>

        {/* Background — generated image OR style brief OR skeleton */}
        {liveImageUrl && liveImageStatus === "ready" ? (
          <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-95" />
        ) : (
          // 2026-07-17 (CJ「盤查生圖佔位」): standardized ImageGenSlot
          <div className="absolute inset-0">
            <ImageGenSlot
              brief={liveImageStyle}
              status={liveImageStatus}
              onGenerate={onGenerateImage}
              aspectClass="w-full h-full"
              dark
            />
          </div>
        )}

        {/* Overlay text — large main 主標 (caption line 1), small sub (rest)
            pointer-events-none so the underlying 點此生成主圖 CTA stays clickable */}
        <div className="absolute top-1/2 -translate-y-1/2 inset-x-4 z-10 text-center pointer-events-none">
          <p className="text-white font-bold text-2xl drop-shadow-md leading-tight" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
            {overlayMain}
          </p>
          {overlaySub && (
            <p className="text-white text-small mt-3 leading-relaxed whitespace-pre-line drop-shadow-md" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
              {overlaySub}
            </p>
          )}
        </div>

        {/* Reply input */}
        <div className="absolute bottom-3 inset-x-3 z-10 flex items-center gap-2">
          <div className="flex-1 bg-white/15 border border-white/30 rounded-full px-3 py-1.5 text-tiny text-white/70">
            {lang === "en" ? `Message ${handle}…` : `傳訊息給 ${handle}…`}
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

export function IGProfile({ brandName, brandLogoUrl, variantLabel, liveCaption }: MockupFields) {
  const { lang } = useLang();
  const handle = handleOf(brandName);
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  return (
    <div className="w-full max-w-[400px] mx-auto">
      <MockupHeader icon={faInstagram} label="Instagram" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <p className="text-medium font-semibold">{handle}</p>
          <span className="text-medium tracking-tighter">⋯</span>
        </div>
        <div className="px-4 py-3 flex items-center gap-5">
          <StoryRingAvatar src={avatarSrc} size={84} />
          <div className="flex-1 grid grid-cols-3 gap-2 text-center text-small">
            <div><div className="font-bold">42</div><div className="text-tiny text-default-500">{lang === "en" ? "posts" : "貼文"}</div></div>
            <div><div className="font-bold">12.3K</div><div className="text-tiny text-default-500">{lang === "en" ? "followers" : "粉絲"}</div></div>
            <div><div className="font-bold">567</div><div className="text-tiny text-default-500">{lang === "en" ? "following" : "追蹤中"}</div></div>
          </div>
        </div>
        <div className="px-4 pb-2 space-y-1">
          <p className="text-small font-semibold flex items-center gap-1">
            {brandName ?? "Your Brand"}
            <FontAwesomeIcon icon={faCircleCheck} className="text-tiny text-primary" />
          </p>
          {/* Bio = liveCaption (the rewritten bio). Preserve user's line breaks. */}
          {liveCaption ? (
            <p className="text-tiny text-default-700 whitespace-pre-line leading-relaxed">{liveCaption}</p>
          ) : (
            <p className="text-tiny text-default-400">{lang === "en" ? "(bio pending — agent will write)" : "（bio 等待 AI 寫入）"}</p>
          )}
          <p className="text-tiny text-primary">your-brand.com</p>
        </div>
        <div className="px-4 pb-3 grid grid-cols-3 gap-2">
          <Button size="sm" radius="md" color="primary" className="font-medium">{lang === "en" ? "Follow" : "追蹤"}</Button>
          <Button size="sm" radius="md" variant="bordered">{lang === "en" ? "Message" : "傳訊息"}</Button>
          <Button isIconOnly size="sm" radius="md" variant="bordered" aria-label="more"><FontAwesomeIcon icon={faUserGroup} /></Button>
        </div>
        <div className="px-4 pb-3 flex gap-3 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 flex flex-col items-center gap-1 w-16">
              <div className="w-14 h-14 rounded-full border-2 border-divider bg-default-100" />
              <p className="text-tiny text-default-500 truncate w-full text-center">{lang === "en" ? `Highlight ${i + 1}` : `精選 ${i + 1}`}</p>
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

export function IGLive({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const handle = handleOf(brandName);
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  return (
    <div className="w-full max-w-[400px] mx-auto">
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
          <StoryRingAvatar src={avatarSrc} size={24} />
          <span className="text-white text-tiny font-semibold">{handle}</span>
          <button className="bg-white text-black text-tiny font-bold px-2 py-0.5 rounded-full">{lang === "en" ? "Follow" : "追蹤"}</button>
        </div>
        {/* Background — generated cover image OR style brief OR skeleton */}
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
        {/* Live script overlay — the segment's script (opening 30s for the
            30s task; one time-block of the run-of-show for ig-60-live-suite,
            which is why this no longer says "開場"). */}
        {liveCaption && (
          <div className="absolute top-24 inset-x-3 z-10 bg-black/55 backdrop-blur-sm rounded-medium p-2.5 max-h-[55%] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-white/60 mb-1">{lang === "en" ? "Live script" : "直播腳本"}</p>
            <p className="text-tiny text-white whitespace-pre-line leading-relaxed">{liveCaption}</p>
          </div>
        )}
        {/* Floating chat bubbles bottom-left */}
        <div className="absolute bottom-16 left-3 z-10 space-y-1.5 max-w-[60%]">
          {(lang === "en" ? ["So good!", "When's the next one?", "❤️❤️❤️"] : ["太精彩了!", "什麼時候下一場?", "❤️❤️❤️"]).map((m, i) => (
            <div key={i} className="bg-black/50 backdrop-blur-sm text-white text-tiny px-2 py-1 rounded-medium">
              <span className="font-semibold">user_{i+1}</span> {m}
            </div>
          ))}
        </div>
        {/* Bottom: comment input + reactions */}
        <div className="absolute bottom-3 inset-x-3 z-10 flex items-center gap-2">
          <div className="flex-1 bg-white/15 border border-white/30 rounded-full px-3 py-1.5 text-tiny text-white/70">
            {lang === "en" ? "Message…" : "傳訊息…"}
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

export function IGAd({ title, brandName, variantLabel, liveImageStyle, liveImageStatus, liveImageUrl, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
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
              <p className="text-tiny text-default-500 truncate leading-tight">{lang === "en" ? "Sponsored" : "贊助 · Sponsored"}</p>
            </div>
          </div>
          <span className="text-medium tracking-tighter">⋯</span>
        </div>
        <div className="relative aspect-square bg-default-100">
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
              />
            </div>
          )}
        </div>
        {/* CTA bar — distinguishes ad from feed */}
        <div className="px-3 py-2.5 border-y border-divider bg-default-50 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-tiny text-default-500">your-brand.com</p>
            <p className="text-small font-semibold truncate">{lang === "en" ? "Shop now · Limited offer" : "立即購買 · 限時優惠"}</p>
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

/* ─────────────── IG Comment reply (ig-30-comment-reply) ───────────────
 *
 * 2026-08-20 (CJ「IG 留言回覆（一般）出現『此格式的精準預覽正在製作中』，
 * 而且看起來沒有產出內容」): RunPage maps any taskId containing "comment"
 * to format "comment", so ig-30-comment-reply resolved to the key
 * "instagram:comment" — which had no case in PlatformMockup and fell to
 * UnsupportedVariantPlaceholder. The reply copy WAS produced; the
 * placeholder simply never rendered it. This is the real IG comment
 * thread chrome: the original comment on top, the brand's reply indented
 * under it.
 */
export function IGComment({
  title, brandName, brandLogoUrl, variantLabel, liveCaption, liveSourceComment,
}: MockupFields) {
  const { lang } = useLang();
  const handle = handleOf(brandName ?? null);
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  const userComment = (liveSourceComment ?? "").trim();

  return (
    <div className="w-full max-w-[440px] mx-auto">
      <MockupHeader
        icon={faInstagram}
        label={lang === "en" ? "Instagram Reply" : "Instagram 留言回覆"}
        variantLabel={variantLabel}
      />

      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        {/* IG comment sheet header */}
        <div className="flex items-center gap-3 px-3 py-2.5 border-b border-divider">
          <FontAwesomeIcon icon={faChevronLeft} className="text-small text-default-600" />
          <p className="text-small font-semibold flex-1 text-center pr-4">
            {lang === "en" ? "Comments" : "留言"}
          </p>
        </div>

        <div className="px-3 py-3 space-y-3">
          {/* ── The comment being answered ── */}
          <div className="flex items-start gap-2.5">
            <Avatar src={dicebear("ig-commenter")} className="w-8 h-8 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-small leading-snug break-words">
                <span className="font-semibold mr-1.5">
                  {lang === "en" ? "a_follower" : "某位粉絲"}
                </span>
                {userComment ? (
                  <span className="text-default-800">{userComment}</span>
                ) : (
                  <span className="text-default-400">
                    {lang === "en"
                      ? "(the comment you pasted shows up here)"
                      : "（你貼上的原始留言會顯示在這）"}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3 mt-1 text-tiny text-default-500">
                <span>{lang === "en" ? "2h" : "2 小時"}</span>
                <span>{lang === "en" ? "12 likes" : "12 個讚"}</span>
                <span className="font-medium">{lang === "en" ? "Reply" : "回覆"}</span>
              </div>
            </div>
            <FontAwesomeIcon icon={faHeart} className="text-tiny text-default-400 mt-1.5" />
          </div>

          {/* ── The produced reply ── */}
          <div className="flex items-start gap-2.5 pl-8">
            <Avatar src={avatarSrc} className="w-7 h-7 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-small leading-snug break-words">
                <span className="font-semibold mr-1.5 inline-flex items-center gap-1">
                  {handle}
                  <FontAwesomeIcon icon={faCircleCheck} className="text-[10px] text-primary-500" />
                </span>
                {liveCaption
                  ? <span className="text-default-800 whitespace-pre-wrap">{liveCaption}</span>
                  : <Skeleton className="h-3 w-40 rounded inline-block align-middle" />}
              </div>
              <div className="flex items-center gap-3 mt-1 text-tiny text-default-500">
                <span>{lang === "en" ? "Just now" : "剛剛"}</span>
                <span className="font-medium">{lang === "en" ? "Reply" : "回覆"}</span>
              </div>
            </div>
            <FontAwesomeIcon icon={faHeart} className="text-tiny text-default-400 mt-1.5" />
          </div>
        </div>

        {/* IG comment composer */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-divider">
          <Avatar src={avatarSrc} className="w-7 h-7 shrink-0" />
          <p className="flex-1 text-tiny text-default-400 truncate">
            {lang === "en" ? `Reply as ${handle}…` : `以 ${handle} 的身分回覆…`}
          </p>
          <span className="text-tiny text-primary-500 font-semibold">
            {lang === "en" ? "Post" : "發布"}
          </span>
        </div>
      </div>

      {title && <p className="text-tiny text-default-500 mt-2 text-center">{title}</p>}
    </div>
  );
}
