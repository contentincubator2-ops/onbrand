/**
 * Facebook mockups.
 * PR2.2: feed, reel, story, marketplace, event (ad/carousel still fall to feed)
 * References (MIT):
 *   - feed:        Flowbite Card + Reactions row
 *   - reel/story:  9:16 + side rail / progress bar pattern from IG variants
 *   - marketplace: Flowbite Blocks application/product-cards
 *   - event:       Flowbite Blocks marketing/events (date block + venue)
 */
import React from "react";
import { Avatar, Button, Skeleton, User } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook } from "@fortawesome/free-brands-svg-icons";
import {
  faImages, faThumbsUp, faComment, faShare, faGlobe, faPaperPlane,
  faMusic, faVolumeHigh, faXmark, faChevronLeft, faVideo, faHeart,
  faBookmark, faLocationDot, faCalendarDays, faUserGroup,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, MarkdownText, dicebear } from "./shared";

/* ─────────────── FB Feed ─────────────── */

export function FBFeed({ title, brandName, variantLabel, liveCaption, liveImageDesc, liveImageStyle, liveImageUrl, liveImageStatus, liveHashtags, ogCard }: MockupFields) {
  // 2026-05-05: liveImageStyle takes priority over liveImageDesc — it's the
  // "style direction" the quick-task agent produced, kept inside the image
  // slot as a brief for the user to carry into MediaGenFlow.
  // ogCard wins when present — renders the actual link preview FB would
  // auto-generate (image + title + description + domain).
  const styleText = liveImageStyle || liveImageDesc;
  const hasContent = !!styleText;
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center gap-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={
              <span className="text-tiny text-default-500 flex items-center gap-1">
                贊助 · 剛剛 · <FontAwesomeIcon icon={faGlobe} className="text-tiny" />
              </span>
            }
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 py-2 space-y-2">
          <p className="text-small">{title}</p>
          {liveCaption ? (
            <MarkdownText content={liveCaption} lineClamp={6} />
          ) : (
            <>
              <Skeleton className="h-2.5 w-[88%] rounded" />
              <Skeleton className="h-2.5 w-[75%] rounded" />
            </>
          )}
          {liveHashtags && liveHashtags.length > 0 && (
            <p className="text-tiny text-primary-500 break-words">
              {liveHashtags.map(t => `#${t.replace(/^#/, "")}`).join(" ")}
            </p>
          )}
        </div>
        {ogCard ? (
          // OG link-card — mirrors FB's auto-rendered link preview
          <a
            href={ogCard.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block border-t border-divider hover:bg-default-50 transition"
          >
            {ogCard.image ? (
              <div className="aspect-[1.91/1] bg-default-100 overflow-hidden">
                <img
                  src={ogCard.image}
                  alt={ogCard.title ?? ""}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            ) : (
              <div className="aspect-[1.91/1] bg-default-100 flex items-center justify-center text-default-400">
                <FontAwesomeIcon icon={faImages} className="text-3xl" />
              </div>
            )}
            <div className="px-4 py-2 bg-default-50 border-t border-divider">
              <p className="text-[10px] uppercase tracking-wider text-default-500">{ogCard.domain}</p>
              <p className="text-small font-semibold line-clamp-2 leading-tight mt-0.5">
                {ogCard.title ?? ogCard.url}
              </p>
              {ogCard.description && (
                <p className="text-tiny text-default-500 line-clamp-2 mt-1">{ogCard.description}</p>
              )}
            </div>
          </a>
        ) : (
          liveImageUrl && liveImageStatus === "ready" ? (
            // Plan B: real generated image (Flux Schnell) — render directly
            <div className="aspect-[16/9] bg-default-100 overflow-hidden relative">
              <img
                src={liveImageUrl}
                alt={liveImageStyle ?? "Generated image"}
                className="w-full h-full object-cover"
              />
              {liveImageStyle && (
                <div className="absolute bottom-2 left-2 right-2 bg-black/55 backdrop-blur-sm rounded px-2 py-1">
                  <p className="text-[10px] text-white/90 line-clamp-2">{liveImageStyle}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-[16/9] bg-default-100 flex items-center justify-center text-default-400 relative">
              {!hasContent && <Skeleton className="absolute inset-0" />}
              <div className={`text-center relative z-10 p-4 ${hasContent ? "bg-default-50/80 backdrop-blur-sm rounded-medium m-3" : ""}`}>
                <FontAwesomeIcon icon={faImages} className="text-3xl mb-2 text-default-400" />
                {liveImageStatus === "timeout" ? (
                  <>
                    <p className="text-tiny font-semibold text-warning-600 mb-1">補完中…（20s 已超）</p>
                    <p className="text-tiny line-clamp-3 text-default-600">{liveImageStyle}</p>
                  </>
                ) : liveImageStatus === "failed" ? (
                  <>
                    <p className="text-tiny font-semibold text-danger-600 mb-1">生圖失敗</p>
                    <p className="text-tiny line-clamp-3 text-default-600">{liveImageStyle}</p>
                  </>
                ) : liveImageStyle ? (
                  <>
                    <p className="text-tiny font-semibold text-default-600 mb-1">圖片風格方向</p>
                    <p className="text-tiny line-clamp-4 text-default-700 leading-relaxed">{liveImageStyle}</p>
                    <p className="text-[10px] text-default-400 mt-2">點此用 MediaGenFlow 生圖</p>
                  </>
                ) : (
                  <p className="text-tiny line-clamp-3">{liveImageDesc ?? "主圖 · 等待 craft agent"}</p>
                )}
              </div>
            </div>
          )
        )}
        <div className="px-4 py-2 border-t border-divider flex items-center justify-between text-default-500 text-tiny">
          <span>👍❤️🎉 1,234</span>
          <span>87 留言 · 23 分享</span>
        </div>
        <div className="px-4 py-1 border-t border-divider flex items-center justify-around text-default-700 text-small">
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faThumbsUp} /> 讚
          </button>
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faComment} /> 留言
          </button>
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faShare} /> 分享
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Reel ─────────────── */

export function FBReel({ title, brandName, variantLabel }: MockupFields) {
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  return (
    <div className="w-full max-w-[280px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 pt-3 text-white">
          <span className="text-small font-semibold">Reels</span>
          <FontAwesomeIcon icon={faVideo} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="absolute inset-0 opacity-30" />
          <div className="relative z-10 text-center text-white/60">
            <FontAwesomeIcon icon={faVideo} className="text-4xl mb-2" />
            <p className="text-tiny">9:16 影片 · 等待 craft agent</p>
          </div>
        </div>
        <div className="absolute right-2 bottom-20 z-10 flex flex-col items-center gap-3.5 text-white drop-shadow-lg">
          <RailIcon icon={faThumbsUp} count="12K" />
          <RailIcon icon={faComment} count="456" />
          <RailIcon icon={faPaperPlane} count="分享" />
          <RailIcon icon={faMusic} />
        </div>
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pr-16 text-white space-y-1.5 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center gap-2">
            <Avatar src={dicebear(brandName ?? "brand")} size="sm" isBordered color="primary" />
            <span className="text-small font-semibold">{handle}</span>
            <Button size="sm" radius="sm" className="h-6 min-w-0 px-2 text-tiny bg-primary text-white">追蹤</Button>
          </div>
          <p className="text-small line-clamp-2">{title}</p>
          <div className="flex items-center gap-1 text-tiny">
            <FontAwesomeIcon icon={faMusic} className="text-tiny" />
            <span>原創音訊 · {handle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Story ─────────────── */

export function FBStory({ title, brandName, variantLabel }: MockupFields) {
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  return (
    <div className="w-full max-w-[280px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="relative bg-default-900 rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        <div className="absolute top-2 inset-x-2 z-20 flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              {i === 0 && <span className="block h-full w-1/3 bg-white rounded-full" />}
            </span>
          ))}
        </div>
        <div className="absolute top-5 inset-x-0 z-20 flex items-center justify-between px-3 pt-2 text-white">
          <div className="flex items-center gap-2">
            <Avatar src={dicebear(brandName ?? "brand")} size="sm" isBordered color="primary" />
            <span className="text-small font-semibold">{handle}</span>
            <span className="text-tiny opacity-80">5 分鐘前</span>
          </div>
          <div className="flex items-center gap-3 opacity-90">
            <FontAwesomeIcon icon={faVolumeHigh} className="text-small" />
            <FontAwesomeIcon icon={faXmark} className="text-medium" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="absolute inset-0 opacity-30" />
          <div className="relative z-10 text-center text-white/60">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny">限動圖 · 等待 craft agent</p>
          </div>
        </div>
        <div className="absolute bottom-16 inset-x-3 z-10">
          <div className="bg-white/20 backdrop-blur-sm rounded-medium p-2 text-white text-small line-clamp-2">{title}</div>
        </div>
        <div className="absolute bottom-3 inset-x-3 z-10 flex items-center gap-2">
          <div className="flex-1 bg-white/15 border border-white/30 rounded-full px-3 py-1.5 text-tiny text-white/70">
            傳訊息給 {handle}…
          </div>
          <FontAwesomeIcon icon={faHeart} className="text-white" />
          <FontAwesomeIcon icon={faPaperPlane} className="text-white" />
        </div>
        <div className="absolute left-1 top-1/2 -translate-y-1/2 z-10 text-white/40">
          <FontAwesomeIcon icon={faChevronLeft} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Marketplace ─────────────── */

export function FBMarketplace({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[420px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="aspect-square bg-default-100 flex items-center justify-center text-default-400 relative">
          <Skeleton className="absolute inset-0" />
          <div className="text-center relative z-10">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny">商品圖 · 等待 craft agent</p>
          </div>
          <span className="absolute top-2 right-2 bg-black/60 text-white text-tiny px-2 py-0.5 rounded-full backdrop-blur-sm">
            <FontAwesomeIcon icon={faBookmark} className="mr-1" /> 儲存
          </span>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-2xl font-bold text-foreground">NT$ 1,234</p>
          <p className="text-small font-medium line-clamp-2">{title}</p>
          <div className="flex items-center gap-1 text-tiny text-default-500">
            <FontAwesomeIcon icon={faLocationDot} />
            <span>台北市 · 5 分鐘前刊登</span>
          </div>
          <div className="pt-2 flex gap-2">
            <Button color="primary" size="sm" radius="md" className="flex-1">傳訊息</Button>
            <Button variant="bordered" size="sm" radius="md" className="flex-1">分享</Button>
          </div>
          <div className="pt-2 flex items-center gap-2 border-t border-divider mt-2">
            <Avatar src={dicebear(brandName ?? "seller")} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-tiny font-medium truncate">{brandName ?? "賣家"}</p>
              <p className="text-tiny text-default-500">5.0 ★ · 32 筆評價</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Event ─────────────── */

export function FBEvent({ title, brief, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[480px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="aspect-[2/1] bg-default-100 flex items-center justify-center text-default-400 relative">
          <Skeleton className="absolute inset-0" />
          <div className="text-center relative z-10">
            <FontAwesomeIcon icon={faCalendarDays} className="text-4xl mb-2" />
            <p className="text-tiny">活動封面 · 等待 craft agent</p>
          </div>
        </div>
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="shrink-0 w-14 text-center">
            <div className="text-tiny font-bold uppercase text-danger tracking-wider">5月</div>
            <div className="text-2xl font-bold leading-none mt-0.5">15</div>
            <div className="text-tiny text-default-500 mt-0.5">週四</div>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-medium font-bold leading-snug line-clamp-2">{title}</p>
            <div className="flex items-center gap-1 text-tiny text-default-500">
              <FontAwesomeIcon icon={faLocationDot} />
              <span>線上 · {brandName ?? "Your Brand"} 主辦</span>
            </div>
            <div className="flex items-center gap-1 text-tiny text-default-500">
              <FontAwesomeIcon icon={faUserGroup} />
              <span>1.2K 人感興趣 · 234 人參加</span>
            </div>
            {brief && <p className="text-tiny text-default-500 line-clamp-2 mt-1">{brief}</p>}
          </div>
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <Button color="primary" size="sm" radius="md" className="flex-1">參加</Button>
          <Button variant="bordered" size="sm" radius="md" className="flex-1">感興趣</Button>
          <Button variant="light" size="sm" radius="md">分享</Button>
        </div>
      </div>
    </div>
  );
}

function RailIcon({ icon, count }: { icon: any; count?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
        <FontAwesomeIcon icon={icon} className="text-medium" />
      </span>
      {count && <span className="text-tiny font-semibold">{count}</span>}
    </div>
  );
}

/* ─────────────── FB Ad (feed + Sponsored + CTA) ─────────────── */

export function FBAd({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center gap-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={
              <span className="text-tiny text-default-500 flex items-center gap-1">
                贊助 · <FontAwesomeIcon icon={faGlobe} className="text-tiny" />
              </span>
            }
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 py-2">
          <p className="text-small">{title}</p>
          <p className="text-tiny text-default-500 mt-1">立即購買，限時 9 折優惠 →</p>
        </div>
        <div className="aspect-[16/9] bg-default-100 flex items-center justify-center text-default-400 relative">
          <Skeleton className="absolute inset-0" />
          <div className="text-center relative z-10">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny">廣告主圖 · 等待 craft agent</p>
          </div>
        </div>
        {/* CTA bar (FB ad signature) */}
        <div className="px-4 py-2.5 bg-default-100 border-y border-divider flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-tiny text-default-500 uppercase tracking-wider">YOUR-BRAND.COM</p>
            <p className="text-small font-semibold truncate">立即購買 · 限時優惠</p>
          </div>
          <Button color="default" size="sm" radius="md" className="bg-default-200 font-semibold ml-2">
            選購
          </Button>
        </div>
        <div className="px-4 py-2 flex items-center justify-between text-default-500 text-tiny">
          <span>👍❤️🎉 12K</span>
          <span>456 留言 · 89 分享</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Carousel Ad (multi-card horizontal scroll) ─────────────── */

export function FBCarousel({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center gap-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={<span className="text-tiny text-default-500">贊助 · 輪播廣告</span>}
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 py-2">
          <p className="text-small">{title}</p>
        </div>
        {/* Carousel: 3 cards visible side-by-side, 4th peeking */}
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="shrink-0 w-[170px] border border-divider rounded-medium overflow-hidden bg-content1">
              <div className="aspect-square bg-default-100 relative flex items-center justify-center">
                <Skeleton className="absolute inset-0" />
                <FontAwesomeIcon icon={faImages} className="relative z-10 text-default-400 text-2xl" />
              </div>
              <div className="p-2 space-y-1">
                <p className="text-tiny font-semibold leading-tight line-clamp-2">商品 {i + 1}</p>
                <p className="text-tiny text-default-500">NT$ 1,234</p>
                <Button size="sm" radius="sm" color="default" className="w-full text-tiny h-6 bg-default-200 font-semibold">
                  選購
                </Button>
              </div>
            </div>
          ))}
        </div>
        {/* Carousel dots */}
        <div className="flex items-center justify-center gap-1 pb-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`rounded-full w-1.5 h-1.5 ${i === 0 ? "bg-primary" : "bg-default-300"}`} />
          ))}
        </div>
        <div className="px-4 py-1 border-t border-divider flex items-center justify-around text-default-700 text-small">
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faThumbsUp} /> 讚
          </button>
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faComment} /> 留言
          </button>
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faShare} /> 分享
          </button>
        </div>
      </div>
    </div>
  );
}
