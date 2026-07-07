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
  faChevronRight, faArrowRight, faThumbtack,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, MarkdownText, dicebear, titleEchoesCaption } from "./shared";
import { useLang } from "../../../lib/i18n";

/* ─────────────── FB Feed ─────────────── */

export function FBFeed({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageDesc, liveImageStyle, liveImageUrl, liveImageStatus, liveHashtags, ogCard, pinned, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
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
        {/* 2026-05-18 (CJ「釘選主文應該有個 PIN」): FB pinned-post chrome
            — the small "📌 已釘選貼文" row FB shows above a pinned post. */}
        {pinned && (
          <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-tiny text-default-500 font-medium border-b border-divider/60">
            <FontAwesomeIcon icon={faThumbtack} className="text-[11px] -rotate-45" />
            {lang === "en" ? "Pinned post" : "已釘選貼文"}
          </div>
        )}
        <div className="px-4 py-3 flex items-center gap-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={
              <span className="text-tiny text-default-500 flex items-center gap-1">
                {lang === "en" ? "Just now" : "剛剛"} · <FontAwesomeIcon icon={faGlobe} className="text-tiny" />
              </span>
            }
            avatarProps={{ src: brandLogoUrl || dicebear(brandName ?? "brand"), size: "md", isBordered: !!brandLogoUrl, color: brandLogoUrl ? "default" : "primary" }}
          />
        </div>
        <div className="px-4 py-2 space-y-2">
          {/* 2026-05-14 (CJ「標題重複問題已經解決很多次，怎都無法根除」):
              use shared titleEchoesCaption helper — handles ellipsis,
              punctuation, leading-bracket cases that the previous inline
              startsWith() comparison kept missing. */}
          {(() => {
            const t = (title ?? "").trim();
            if (!t) return null;
            if (titleEchoesCaption(t, liveCaption)) return null;
            return <p className="text-small font-medium">{t}</p>;
          })()}
          {liveCaption ? (
            // 2026-05-13 (CJ「標題看起來都會不完整」): the caption was
            // line-clamped at 6 lines, so 100-200 字 Chinese captions
            // truncated mid-sentence in the mockup preview — users
            // thought the AI cut it off when the DB row was fully
            // complete. Removed the clamp; FB feed previews are meant
            // to show the full post anyway.
            <MarkdownText content={liveCaption} />
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
            // 2026-05-18 (CJ「指令寫 1:1 但 mockup 用自己的比例裁切」):
            // was a hard aspect-[16/9] + object-cover that CROPPED a
            // square/portrait generated image. Show the real generated
            // image at its NATURAL ratio (the gen ratio = the task's
            // fluxSize, e.g. square_hd → 1:1). object-contain + capped
            // height so a tall image doesn't blow the card.
            <div className="bg-default-100 overflow-hidden relative flex items-center justify-center">
              <img
                src={liveImageUrl}
                alt={liveImageStyle ?? "Generated image"}
                className="w-full h-auto object-contain"
                style={{ maxHeight: 560 }}
              />
              {liveImageStyle && (
                <div className="absolute bottom-2 left-2 right-2 bg-black/55 backdrop-blur-sm rounded px-2 py-1">
                  <p className="text-[10px] text-white/90 line-clamp-2">{liveImageStyle}</p>
                </div>
              )}
            </div>
          ) : (
            <div
              role={onGenerateImage ? "button" : undefined}
              tabIndex={onGenerateImage ? 0 : undefined}
              onClick={onGenerateImage}
              onKeyDown={onGenerateImage ? (e) => { if (e.key === "Enter" || e.key === " ") onGenerateImage(); } : undefined}
              className={`aspect-[16/9] bg-default-100 flex items-center justify-center text-default-400 relative ${onGenerateImage ? "cursor-pointer hover:bg-default-200 transition" : ""}`}
            >
              {!hasContent && <Skeleton className="absolute inset-0" />}
              <div className={`text-center relative z-10 p-4 ${hasContent ? "bg-default-50/80 backdrop-blur-sm rounded-medium m-3" : ""}`}>
                <FontAwesomeIcon icon={faImages} className="text-3xl mb-2 text-default-400" />
                {/* 2026-05-14 (CJ「圖片還是跑很久」): status-aware placeholder.
                    Drops the misleading "等待 AI 生成" generic copy.
                    Each branch now matches a real OrchestraVariant.image.status. */}
                {liveImageStatus === "timeout" ? (
                  <>
                    <p className="text-tiny font-semibold text-warning-600 mb-1">{lang === "en" ? "Image generation timed out" : "圖片生成超時"}</p>
                    {liveImageStyle && <p className="text-tiny line-clamp-3 text-default-600">{liveImageStyle}</p>}
                    <p className="text-[10px] text-default-400 mt-2">{lang === "en" ? "Tap to retry" : "點此重試"}</p>
                  </>
                ) : liveImageStatus === "failed" ? (
                  // 2026-05-28: use neutral styling — auto-gen may have failed
                  // without user action. Red "失敗" wording confused users who
                  // hadn't clicked anything. Tap-to-generate is still offered.
                  <>
                    <p className="text-tiny font-semibold text-default-600 mb-1">{lang === "en" ? "Image not yet generated" : "圖片尚未生成"}</p>
                    {liveImageStyle && <p className="text-tiny line-clamp-3 text-default-600">{liveImageStyle}</p>}
                    <p className="text-[10px] text-default-400 mt-2">{lang === "en" ? "Tap to generate" : "點此生圖"}</p>
                  </>
                ) : liveImageStatus === "skipped" ? (
                  <>
                    <p className="text-tiny font-semibold text-default-600 mb-1">{lang === "en" ? "This task doesn't include images" : "此任務不含主圖"}</p>
                    {liveImageStyle && <p className="text-tiny line-clamp-3 text-default-500">{liveImageStyle}</p>}
                    <p className="text-[10px] text-default-400 mt-2">{lang === "en" ? "Tap to generate manually" : "點此手動生圖"}</p>
                  </>
                ) : liveImageStyle ? (
                  <>
                    <p className="text-tiny font-semibold text-default-600 mb-1">{lang === "en" ? "Visual direction" : "圖片風格方向"}</p>
                    <p className="text-tiny line-clamp-4 text-default-700 leading-relaxed">{liveImageStyle}</p>
                    <p className="text-[10px] text-default-400 mt-2">{lang === "en" ? "Tap to generate via MediaGenFlow" : "點此用 MediaGenFlow 生圖"}</p>
                  </>
                ) : (
                  <p className="text-tiny line-clamp-3 text-default-500">
                    {liveImageDesc ?? (lang === "en" ? "No image generated" : "尚未生成圖片 · 點此手動生圖")}
                  </p>
                )}
              </div>
            </div>
          )
        )}
        <div className="px-4 py-2 border-t border-divider flex items-center justify-between text-default-500 text-tiny">
          {/* 2026-05-10 (CJ feedback「假資料誤導」): replaced specific
              numbers with neutral icons + placeholder so users don't
              think these are predictions. */}
          <span>👍❤️🎉</span>
          <span className="text-default-400">{lang === "en" ? "Comments · Shares" : "留言 · 分享"}</span>
        </div>
        <div className="px-4 py-1 border-t border-divider flex items-center justify-around text-default-700 text-small">
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faThumbsUp} /> {lang === "en" ? "Like" : "讚"}
          </button>
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faComment} /> {lang === "en" ? "Comment" : "留言"}
          </button>
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faShare} /> {lang === "en" ? "Share" : "分享"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Reel ─────────────── */

export function FBReel({ title, brandName, variantLabel }: MockupFields) {
  const { lang } = useLang();
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  return (
    <div className="w-full max-w-[400px] mx-auto">
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
            <p className="text-tiny">{lang === "en" ? "9:16 video · waiting for craft agent" : "9:16 影片 · 等待 AI 生成"}</p>
          </div>
        </div>
        <div className="absolute right-2 bottom-20 z-10 flex flex-col items-center gap-3.5 text-white drop-shadow-lg">
          <RailIcon icon={faThumbsUp} count="12K" />
          <RailIcon icon={faComment} count="456" />
          <RailIcon icon={faPaperPlane} count={lang === "en" ? "Share" : "分享"} />
          <RailIcon icon={faMusic} />
        </div>
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pr-16 text-white space-y-1.5 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center gap-2">
            <Avatar src={dicebear(brandName ?? "brand")} size="sm" isBordered color="primary" />
            <span className="text-small font-semibold">{handle}</span>
            <Button size="sm" radius="sm" className="h-6 min-w-0 px-2 text-tiny bg-primary text-white">{lang === "en" ? "Follow" : "追蹤"}</Button>
          </div>
          <p className="text-small line-clamp-2">{title}</p>
          <div className="flex items-center gap-1 text-tiny">
            <FontAwesomeIcon icon={faMusic} className="text-tiny" />
            <span>{lang === "en" ? "Original audio" : "原創音訊"} · {handle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Story ─────────────── */

export function FBStory({ title, brandName, variantLabel, liveCaption, liveTitle, liveImageUrl, liveImageStatus, liveImageStyle, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  // 2026-05-18 (CJ「FB Story 文案任務沒有產出文字」): FBStory previously
  // rendered only `title` (the run title) and never showed the generated
  // Story 文案 at all. The whole deliverable of fb-30-story-text IS the
  // caption (30-60 字 疊在圖上的文) + a short overlay 主標 (liveTitle).
  // Now: caption is the prominent text, liveTitle the small 主標 chip,
  // live image as background when ready (mirrors the approved FBAd fix).
  const storyText = (liveCaption ?? "").trim();
  const overlayTitle = (liveTitle ?? "").trim();
  const hasImage = !!liveImageUrl && liveImageStatus === "ready";
  return (
    <div className="w-full max-w-[400px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="relative bg-default-900 rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        {hasImage && (
          <img
            src={liveImageUrl}
            alt={liveImageStyle ?? "Story image"}
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
        )}
        {hasImage && <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />}
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
            <span className="text-tiny opacity-80">{lang === "en" ? "5m ago" : "5 分鐘前"}</span>
          </div>
          <div className="flex items-center gap-3 opacity-90">
            <FontAwesomeIcon icon={faVolumeHigh} className="text-small" />
            <FontAwesomeIcon icon={faXmark} className="text-medium" />
          </div>
        </div>
        {!hasImage && (
          <div
            role={onGenerateImage ? "button" : undefined}
            tabIndex={onGenerateImage ? 0 : undefined}
            onClick={onGenerateImage}
            onKeyDown={onGenerateImage ? (e) => { if (e.key === "Enter" || e.key === " ") onGenerateImage(); } : undefined}
            className={`absolute inset-0 flex items-center justify-center z-0 ${onGenerateImage ? "cursor-pointer" : ""}`}
          >
            <Skeleton className="absolute inset-0 opacity-30" />
            <div className="relative z-10 text-center text-white/50 px-4">
              <FontAwesomeIcon icon={faImages} className="text-3xl mb-2" />
              <p className="text-tiny">
                {liveImageStyle
                  ? liveImageStyle
                  : liveImageStatus === "timeout"
                    ? (lang === "en" ? "Story image timed out · tap to retry" : "限動圖超時 · 點此重試")
                    : liveImageStatus === "failed"
                      ? (lang === "en" ? "Story image · tap to generate" : "限動背景圖 · 點此生成")
                      : (lang === "en" ? "Story image · tap to generate" : "限動背景圖 · 點此生成")}
              </p>
            </div>
          </div>
        )}
        {/* Overlay 主標 (5-8 字) + Story 文案 (30-60 字) — the actual deliverable */}
        <div className="absolute inset-x-3 bottom-20 z-10 flex flex-col items-center text-center gap-2">
          {overlayTitle && (
            <div className="bg-white text-default-900 font-bold text-medium px-3 py-1 rounded-md shadow-md -rotate-1">
              {overlayTitle}
            </div>
          )}
          {storyText ? (
            <div className="bg-black/45 backdrop-blur-sm rounded-medium px-3 py-2 text-white text-small leading-relaxed whitespace-pre-wrap max-h-[42%] overflow-y-auto">
              {storyText}
            </div>
          ) : (
            <div className="bg-white/15 backdrop-blur-sm rounded-medium px-3 py-2 text-white/70 text-small line-clamp-2">
              {title}
            </div>
          )}
        </div>
        <div className="absolute bottom-3 inset-x-3 z-10 flex items-center gap-2">
          <div className="flex-1 bg-white/15 border border-white/30 rounded-full px-3 py-1.5 text-tiny text-white/70">
            {lang === "en" ? `Message ${handle}…` : `傳訊息給 ${handle}…`}
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
  const { lang } = useLang();
  return (
    <div className="w-full max-w-[420px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="aspect-square bg-default-100 flex items-center justify-center text-default-400 relative">
          <Skeleton className="absolute inset-0" />
          <div className="text-center relative z-10">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny">{lang === "en" ? "Product image · waiting for craft agent" : "商品圖 · 等待 AI 生成"}</p>
          </div>
          <span className="absolute top-2 right-2 bg-black/60 text-white text-tiny px-2 py-0.5 rounded-full backdrop-blur-sm">
            <FontAwesomeIcon icon={faBookmark} className="mr-1" /> {lang === "en" ? "Save" : "儲存"}
          </span>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-2xl font-bold text-foreground">{lang === "en" ? "$39" : "NT$ 1,234"}</p>
          <p className="text-small font-medium line-clamp-2">{title}</p>
          <div className="flex items-center gap-1 text-tiny text-default-500">
            <FontAwesomeIcon icon={faLocationDot} />
            <span>{lang === "en" ? "Taipei · Listed 5m ago" : "台北市 · 5 分鐘前刊登"}</span>
          </div>
          <div className="pt-2 flex gap-2">
            <Button color="primary" size="sm" radius="md" className="flex-1">{lang === "en" ? "Message" : "傳訊息"}</Button>
            <Button variant="bordered" size="sm" radius="md" className="flex-1">{lang === "en" ? "Share" : "分享"}</Button>
          </div>
          <div className="pt-2 flex items-center gap-2 border-t border-divider mt-2">
            <Avatar src={dicebear(brandName ?? "seller")} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-tiny font-medium truncate">{brandName ?? (lang === "en" ? "Seller" : "賣家")}</p>
              <p className="text-tiny text-default-500">{lang === "en" ? "5.0 ★ · 32 reviews" : "5.0 ★ · 32 筆評價"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Event ─────────────── */

export function FBEvent({ title, brief, brandName, variantLabel }: MockupFields) {
  const { lang } = useLang();
  return (
    <div className="w-full max-w-[480px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="aspect-[2/1] bg-default-100 flex items-center justify-center text-default-400 relative">
          <Skeleton className="absolute inset-0" />
          <div className="text-center relative z-10">
            <FontAwesomeIcon icon={faCalendarDays} className="text-4xl mb-2" />
            <p className="text-tiny">{lang === "en" ? "Event cover · waiting for craft agent" : "活動封面 · 等待 AI 生成"}</p>
          </div>
        </div>
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="shrink-0 w-14 text-center">
            <div className="text-tiny font-bold uppercase text-danger tracking-wider">{lang === "en" ? "MAY" : "5月"}</div>
            <div className="text-2xl font-bold leading-none mt-0.5">15</div>
            <div className="text-tiny text-default-500 mt-0.5">{lang === "en" ? "Thu" : "週四"}</div>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-medium font-bold leading-snug line-clamp-2">{title}</p>
            <div className="flex items-center gap-1 text-tiny text-default-500">
              <FontAwesomeIcon icon={faLocationDot} />
              <span>{lang === "en" ? `Online · Hosted by ${brandName ?? "Your Brand"}` : `線上 · ${brandName ?? "Your Brand"} 主辦`}</span>
            </div>
            <div className="flex items-center gap-1 text-tiny text-default-500">
              <FontAwesomeIcon icon={faUserGroup} />
              <span>{lang === "en" ? "1.2K interested · 234 going" : "1.2K 人感興趣 · 234 人參加"}</span>
            </div>
            {brief && <p className="text-tiny text-default-500 line-clamp-2 mt-1">{brief}</p>}
          </div>
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <Button color="primary" size="sm" radius="md" className="flex-1">{lang === "en" ? "Going" : "參加"}</Button>
          <Button variant="bordered" size="sm" radius="md" className="flex-1">{lang === "en" ? "Interested" : "感興趣"}</Button>
          <Button variant="light" size="sm" radius="md">{lang === "en" ? "Share" : "分享"}</Button>
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

export function FBAd({ title, brandName, variantLabel, liveCaption, liveImageUrl, liveImageStatus, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  // 2026-05-18 (CJ): FBAd ignored the generated headline — showed the
  // run title (same for every pill). Use the variant's caption (the
  // actual ad headline) as the primary ad text.
  const adText = (liveCaption ?? "").trim() || title;
  // 2026-05-18 (CJ「選 A：隱藏空圖框」): only render the image block when
  // an image actually exists or was attempted. Headline-only ad tasks
  // (images:0 → no url, no status) → no fake forever-skeleton box.
  const showImage = !!liveImageUrl || !!liveImageStatus;
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center gap-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={
              <span className="text-tiny text-default-500 flex items-center gap-1">
                {lang === "en" ? "Sponsored" : "贊助"} · <FontAwesomeIcon icon={faGlobe} className="text-tiny" />
              </span>
            }
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 py-3">
          <p className="text-small font-medium leading-relaxed whitespace-pre-wrap">{adText}</p>
          <p className="text-tiny text-default-500 mt-1">{lang === "en" ? "Shop now — 10% off, limited time →" : "立即購買，限時 9 折優惠 →"}</p>
        </div>
        {showImage && (
          liveImageUrl ? (
            <div className="bg-default-100 overflow-hidden flex items-center justify-center">
              <img src={liveImageUrl} alt={lang === "en" ? "Ad image" : "廣告主圖"}
                className="w-full h-auto object-contain" style={{ maxHeight: 420 }} />
            </div>
          ) : (
            <div
              role={onGenerateImage ? "button" : undefined}
              tabIndex={onGenerateImage ? 0 : undefined}
              onClick={onGenerateImage}
              onKeyDown={onGenerateImage ? (e) => { if (e.key === "Enter" || e.key === " ") onGenerateImage(); } : undefined}
              className={`aspect-[16/9] bg-default-100 flex items-center justify-center text-default-400 relative ${onGenerateImage ? "cursor-pointer hover:bg-default-200 transition" : ""}`}
            >
              {liveImageStatus === "ready" ? <Skeleton className="absolute inset-0" /> : null}
              <div className="text-center relative z-10">
                <FontAwesomeIcon icon={faImages} className="text-3xl mb-2" />
                <p className="text-tiny">
                  {liveImageStatus === "timeout"
                    ? (lang === "en" ? "Image timed out · tap to retry" : "圖片超時 · 點此重試")
                    : (lang === "en" ? "Ad image · tap to generate" : "廣告主圖 · 點此生成")}
                </p>
              </div>
            </div>
          )
        )}
        {/* CTA bar (FB ad signature) */}
        <div className="px-4 py-2.5 bg-default-100 border-y border-divider flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-tiny text-default-500 uppercase tracking-wider">YOUR-BRAND.COM</p>
            <p className="text-small font-semibold truncate">{lang === "en" ? "Shop now · Limited offer" : "立即購買 · 限時優惠"}</p>
          </div>
          <Button color="default" size="sm" radius="md" className="bg-default-200 font-semibold ml-2">
            {lang === "en" ? "Shop" : "選購"}
          </Button>
        </div>
        <div className="px-4 py-2 flex items-center justify-between text-default-500 text-tiny">
          <span>👍❤️🎉 12K</span>
          <span className="text-default-400">{lang === "en" ? "Comments · Shares" : "留言 · 分享"}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Carousel Ad (multi-card horizontal scroll) ─────────────── */

// 2026-05-18 (CJ「FB Carousel 尺寸/版型不對，要照 FB 規格 + Figma 參考」):
// the old FBCarousel was a hardcoded e-commerce product grid (tiny 170px
// tiles, "商品 N / NT$1,234"). Rebuilt to the real FB carousel-AD spec:
//   - 1:1 (1080×1080) card image per FB business help guidance
//   - one card prominent + next card peeking (feed swipe UX) + chevrons
//   - each card chrome: headline (bold) + description + CTA pill
//   - post primary text = generated caption; first card uses live image
// Card copy is derived from the generated caption (numbered/line split).
function parseCarouselCards(caption: string): { headline: string; desc: string }[] {
  const raw = (caption ?? "").trim();
  if (!raw) return [];
  // Prefer explicit per-card lines ("卡1：…" / "1. …" / "Card 1 -")
  let segs = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^(卡片?|Card|第)?\s*\d+\s*[\.\):、\-－—]?\s*/i, "").trim())
    .filter(Boolean);
  // Fall back to sentence split if it wasn't a multi-line list
  if (segs.length < 2) {
    segs = raw.split(/(?<=[。！？!?])\s*/).map((s) => s.trim()).filter((s) => s.length >= 4);
  }
  return segs.slice(0, 5).map((s) => {
    const cut = s.search(/[。！？!?：:，,\-－—]/);
    const headline = (cut > 2 && cut < 24 ? s.slice(0, cut) : s.slice(0, 18)).trim();
    const desc = s.slice(headline.length).replace(/^[。！？!?：:，,\s\-－—]+/, "").trim();
    return { headline: headline || s.slice(0, 14), desc };
  });
}

export function FBCarousel({
  title, brandName, variantLabel, liveCaption, liveImageUrl, liveImageStatus, liveImageStyle, liveCards,
}: MockupFields) {
  const { lang } = useLang();
  const handle = brandName ?? (lang === "en" ? "Your Brand" : "您的品牌");
  const postText = (liveCaption ?? "").trim();
  // 2026-05-18 (CJ「carousel 一個貼文還是只出現一張圖」): when the
  // orchestra produced real per-card images (liveCards), render EACH card
  // with its own image. Fall back to caption-split (legacy, no per-card
  // image) only when liveCards is absent.
  type Slot = { headline: string; desc: string; imageUrl: string | null; imageStatus: string | null; imageStyle: string | null };
  let cardSlots: Slot[];
  if (Array.isArray(liveCards) && liveCards.length > 0) {
    cardSlots = liveCards.map((c) => ({
      headline: c.headline,
      desc: c.body,
      imageUrl: c.image?.url ?? null,
      imageStatus: c.image?.status ?? null,
      imageStyle: c.image?.style ?? null,
    }));
  } else {
    const parsed = parseCarouselCards(postText);
    const padded = parsed.length >= 2 ? parsed : [
      ...parsed,
      ...Array.from({ length: Math.max(0, 3 - parsed.length) }, (_, i) => ({
        headline: lang === "en" ? `Card ${parsed.length + i + 1}` : `第 ${parsed.length + i + 1} 張`,
        desc: "",
      })),
    ];
    cardSlots = padded.map((c, i) => ({
      headline: c.headline,
      desc: c.desc,
      // legacy single-image path: only card 0 can show the one live image
      imageUrl: i === 0 ? (liveImageUrl ?? null) : null,
      imageStatus: i === 0 ? (liveImageStatus ?? null) : null,
      imageStyle: i === 0 ? (liveImageStyle ?? null) : null,
    }));
  }

  return (
    <div className="w-full max-w-[500px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 pt-3 pb-2 flex items-center gap-3">
          <User
            name={<span className="text-small font-semibold">{handle}</span>}
            description={<span className="text-tiny text-default-500">{lang === "en" ? "Sponsored · Carousel" : "贊助 · 輪播廣告"} · <FontAwesomeIcon icon={faGlobe} className="text-[10px]" /></span>}
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        {/* Post primary text (the generated carousel narrative) */}
        <div className="px-4 pb-3 text-small text-default-800 whitespace-pre-wrap leading-relaxed">
          {postText
            ? <MarkdownText content={postText} />
            : <span className="text-default-400">{title}</span>}
        </div>
        {/* Carousel viewport: card 1 prominent + next peeking + chevrons */}
        <div className="relative bg-default-50">
          <div className="flex gap-2 px-4 py-3 overflow-hidden">
            {cardSlots.map((c, i) => (
              <div
                key={i}
                className={`shrink-0 ${i === 0 ? "w-[78%]" : "w-[78%]"} border border-divider rounded-lg overflow-hidden bg-content1 shadow-sm`}
                style={i === 0 ? undefined : { marginRight: i === cardSlots.length - 1 ? 0 : undefined }}
              >
                {/* 1:1 image — FB recommends 1080×1080 */}
                <div className="aspect-square bg-default-100 relative flex items-center justify-center">
                  {c.imageUrl && c.imageStatus === "ready" ? (
                    <img src={c.imageUrl} alt={c.imageStyle ?? "card"} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <>
                      <Skeleton className="absolute inset-0 opacity-40" />
                      <div className="relative z-10 text-center text-default-400 px-3">
                        <FontAwesomeIcon icon={faImages} className="text-2xl mb-1" />
                        <p className="text-[10px] line-clamp-3">
                          {c.imageStatus === "failed" || c.imageStatus === "timeout"
                            ? (lang === "en" ? "Card image failed" : "此卡圖生成失敗")
                            : c.imageStyle
                              ? c.imageStyle
                              : (lang === "en" ? "Carousel image 1:1" : "輪播圖 1:1（1080×1080）")}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                {/* Card chrome: headline + desc + CTA (FB carousel ad card) */}
                <div className="px-3 py-2 flex items-center gap-2 border-t border-divider">
                  <div className="min-w-0 flex-1">
                    <p className="text-small font-semibold leading-tight line-clamp-1">{c.headline}</p>
                    {c.desc && <p className="text-tiny text-default-500 leading-tight line-clamp-1">{c.desc}</p>}
                  </div>
                  <Button size="sm" radius="sm" className="shrink-0 h-7 px-3 text-tiny font-semibold bg-default-200 text-default-800">
                    {lang === "en" ? "Learn more" : "了解更多"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {/* Swipe chevrons */}
          <button className="absolute left-2 top-[38%] -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-default-500">
            <FontAwesomeIcon icon={faChevronLeft} className="text-tiny" />
          </button>
          <button className="absolute right-2 top-[38%] -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-default-600">
            <FontAwesomeIcon icon={faChevronRight} className="text-tiny" />
          </button>
        </div>
        {/* Dots */}
        <div className="flex items-center justify-center gap-1 py-2">
          {cardSlots.map((_, i) => (
            <span key={i} className={`rounded-full ${i === 0 ? "w-2 h-2 bg-primary" : "w-1.5 h-1.5 bg-default-300"}`} />
          ))}
        </div>
        {/* CTA row (FB shows a footer link bar on carousel ads) */}
        <div className="px-4 py-2 bg-default-50 border-t border-divider flex items-center justify-between">
          <span className="text-tiny text-default-500 truncate">{(handle + "").toLowerCase().replace(/\s+/g, "")}.com</span>
          <span className="text-tiny font-semibold text-primary flex items-center gap-1">
            {lang === "en" ? "Learn more" : "了解更多"} <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
          </span>
        </div>
        <div className="px-4 py-1 border-t border-divider flex items-center justify-around text-default-700 text-small">
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faThumbsUp} /> {lang === "en" ? "Like" : "讚"}
          </button>
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faComment} /> {lang === "en" ? "Comment" : "留言"}
          </button>
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faShare} /> {lang === "en" ? "Share" : "分享"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB 30-day Content Calendar ─────────────── */
// 2026-05-18 (CJ「30天行事曆結果很不理想，要結構化行事曆」): the task
// now emits a strict JSON array of 14 posts (4 理念WHY / 4 產品 / 2 節慶
// / 2 UGC見證 / 2 權威觀點). Render it as an actual calendar/agenda —
// dated, pillar-colour-coded cards + legend — not a feed text dump.
type CalPost = {
  day: number; pillar: string; audience?: string; usp?: string;
  product?: string; hook?: string; message?: string; format?: string; cta?: string;
};
const PILLAR_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  "理念WHY":   { bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-500" },
  "產品":      { bg: "bg-sky-50",     text: "text-sky-700",     dot: "bg-sky-500" },
  "節慶":      { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
  "UGC見證":   { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "權威觀點":  { bg: "bg-rose-50",    text: "text-rose-700",    dot: "bg-rose-500" },
};
const PILLAR_FALLBACK = { bg: "bg-default-100", text: "text-default-600", dot: "bg-default-400" };

function parseCalendar(raw: string): CalPost[] {
  if (!raw) return [];
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/,"").trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p: any) => ({
        day: Number(p?.day) || 0,
        pillar: String(p?.pillar ?? "").trim(),
        audience: p?.audience ? String(p.audience) : "",
        usp: p?.usp ? String(p.usp) : "",
        product: p?.product ? String(p.product) : "",
        hook: p?.hook ? String(p.hook) : "",
        message: p?.message ? String(p.message) : "",
        format: p?.format ? String(p.format) : "",
        cta: p?.cta ? String(p.cta) : "",
      }))
      .filter((p: CalPost) => p.hook || p.message)
      .sort((x: CalPost, y: CalPost) => x.day - y.day);
  } catch { return []; }
}

// 2026-05-18 (CJ「格式更亂了，乾脆用往下滑瀑布式的 FB mockup」):
// render the 14 calendar posts as a SCROLLABLE waterfall of real
// FB-post cards (brand header + Day/pillar tag + the post itself +
// FB action row). Robust: even if some posts are missing fields it
// still renders; falls back to raw text only if nothing parses.
export function FBCalendar({ title, brandName, variantLabel, liveCaption, brandLogoUrl }: MockupFields) {
  const { lang } = useLang();
  const posts = parseCalendar(liveCaption ?? "");
  const handle = brandName ?? (lang === "en" ? "Your Brand" : "您的品牌");

  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faCalendarDays} label={lang === "en" ? "30-Day Content Plan" : "30 天內容行事曆"} variantLabel={variantLabel} />
      <div className="bg-default-50 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-2.5 bg-content1 border-b border-divider flex items-center justify-between">
          <p className="text-small font-semibold text-default-800">{handle} · {lang === "en" ? "30-Day FB Plan" : "30 天 FB 內容規劃"}</p>
          <span className="text-tiny text-default-500">{posts.length} {lang === "en" ? "posts" : "篇貼文"}</span>
        </div>

        {posts.length === 0 ? (
          <div className="px-5 py-8 text-tiny text-default-400 whitespace-pre-wrap max-h-[560px] overflow-y-auto">
            {(liveCaption ?? "").slice(0, 1500) || (lang === "en" ? "Calendar is generating…" : "行事曆生成中…")}
          </div>
        ) : (
          <div className="max-h-[680px] overflow-y-auto px-3 py-3 space-y-3 bg-default-100/40">
            {posts.map((p, i) => {
              const st = PILLAR_STYLE[p.pillar] ?? PILLAR_FALLBACK;
              const meta = [p.audience, p.usp, p.product].filter(Boolean).join(" · ");
              const body = [p.hook, p.message].filter(Boolean).join("\n\n");
              return (
                <div key={i} className="bg-content1 border border-divider rounded-xl shadow-sm overflow-hidden">
                  {/* Post header: brand + Day + pillar */}
                  <div className="px-4 pt-3 pb-2 flex items-center gap-2.5">
                    <Avatar src={brandLogoUrl || dicebear(brandName ?? "brand")} size="sm" isBordered={!!brandLogoUrl} color={brandLogoUrl ? "default" : "primary"} />
                    <div className="min-w-0 flex-1">
                      <p className="text-small font-semibold leading-tight">{handle}</p>
                      <p className="text-tiny text-default-500 flex items-center gap-1.5">
                        {lang === "en" ? `Day ${p.day || i + 1}` : `第 ${p.day || i + 1} 天`}
                        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{p.pillar || "—"}
                        </span>
                        {p.format && <span className="text-[10px] text-default-400">· {p.format}</span>}
                      </p>
                    </div>
                  </div>
                  {/* Post body — like a real FB post */}
                  <div className="px-4 pb-2 text-small text-default-800 whitespace-pre-wrap leading-relaxed">
                    {body || <span className="text-default-400">{lang === "en" ? "(empty)" : "（無內容）"}</span>}
                  </div>
                  {meta && <p className="px-4 pb-1 text-[11px] text-default-400">🎯 {meta}</p>}
                  {p.cta && (
                    <div className="px-4 pb-3">
                      <span className="inline-block text-tiny font-semibold text-primary-600 bg-primary-50 rounded-md px-2 py-1">→ {p.cta}</span>
                    </div>
                  )}
                  {/* FB action row */}
                  <div className="px-4 py-1 border-t border-divider flex items-center justify-around text-default-500 text-tiny">
                    <span className="flex items-center gap-1.5 py-1"><FontAwesomeIcon icon={faThumbsUp} /> {lang === "en" ? "Like" : "讚"}</span>
                    <span className="flex items-center gap-1.5 py-1"><FontAwesomeIcon icon={faComment} /> {lang === "en" ? "Comment" : "留言"}</span>
                    <span className="flex items-center gap-1.5 py-1"><FontAwesomeIcon icon={faShare} /> {lang === "en" ? "Share" : "分享"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {title && <p className="text-tiny text-default-400 mt-2 text-center line-clamp-1">{title}</p>}
    </div>
  );
}
