/**
 * LinkedIn mockups.
 * PR2.2: feed, article, newsletter, poll, document
 *        (native-video / ad / event still fall to feed/article)
 * References (MIT):
 *   - feed:       saddamarbaa/LinkedIn-clone-app-react-typescript Feeds/Post.tsx
 *   - article:    Flowbite Blocks publisher/article
 *   - newsletter: Flowbite Blocks marketing/newsletter
 *   - poll:       Flowbite radio + animated progress bars
 *   - document:   Flowbite Carousel of PDF page thumbnails
 *
 * 2026-05-02: LIFeed visual overhaul — match Figma LinkedIn Social Post Mockup
 *   • LinkedIn blue #0A66C2 top-bar + nav dots
 *   • Authentic post chrome: degree badge, follow CTA, more-options (…)
 *   • ImageGenSlot replaces static skeleton in image area (3-step visual flow)
 */
import React from "react";
import { Avatar, Button, Chip, Divider, Skeleton, User } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLinkedin } from "@fortawesome/free-brands-svg-icons";
import {
  faThumbsUp, faComment, faShareNodes, faPaperPlane,
  faFileLines, faNewspaper, faChartSimple, faCircle, faCircleDot,
  faBell, faHome, faSearch, faBriefcase, faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, dicebear, MarkdownText } from "./shared";
import { ImageGenSlot, type ImageGenPhase } from "../SquadMockups/ImageGenSlot";

/* ─────────────── LI Feed ─────────────── */

/** Extra props for live image-gen phases, passed alongside MockupFields */
export interface LIFeedImageGenProps {
  imageGenPhase?: ImageGenPhase;
  imageGenDesignDirection?: string;
  imageGenAiPrompt?: string;
  imageGenModelName?: string;
  imageGenResultUrl?: string;
  imageGenErrorMsg?: string;
  onImageRetry?: () => void;
}

export function LIFeed({
  title, brandName, brandLogoUrl, variantLabel, liveCaption, liveHashtags,
  imageGenPhase, imageGenDesignDirection, imageGenAiPrompt,
  imageGenModelName, imageGenResultUrl, imageGenErrorMsg, onImageRetry,
}: MockupFields & LIFeedImageGenProps) {
  // LinkedIn blue per brand guidelines
  const LI_BLUE = "#0A66C2";
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");

  return (
    <div className="w-full max-w-[548px] mx-auto font-sans">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />

      {/* ── LinkedIn top-bar chrome ───────────────────────────────────── */}
      <div
        className="rounded-t-xl overflow-hidden shadow-sm border border-b-0 border-divider"
        style={{ background: "#fff" }}
      >
        {/* Nav bar */}
        <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #e0e0e0" }}>
          {/* Logo */}
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="34" height="34" rx="4" fill={LI_BLUE} />
            <path d="M8 13h4v13H8V13zm2-6.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM15 13h3.8v1.8h.05C19.38 13.73 20.9 13 22.7 13c4.1 0 4.85 2.7 4.85 6.2V26h-4v-6.1c0-1.45-.03-3.3-2.01-3.3-2.02 0-2.33 1.57-2.33 3.2V26H15V13z" fill="white"/>
          </svg>
          {/* Nav icons */}
          <div className="flex items-center gap-5">
            {[faHome, faSearch, faBriefcase, faUsers, faBell].map((ic, i) => (
              <FontAwesomeIcon
                key={i} icon={ic}
                className={`text-lg ${i === 0 ? "" : "text-[#666]"}`}
                style={i === 0 ? { color: LI_BLUE } : {}}
              />
            ))}
          </div>
          {/* Avatar */}
          <Avatar src={avatarSrc} size="sm" className="w-7 h-7" />
        </div>
      </div>

      {/* ── Post card ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-t-0 border-divider rounded-b-xl overflow-hidden shadow-lg">

        {/* Post header */}
        <div className="px-4 pt-3 pb-2 flex items-start justify-between">
          <div className="flex items-start gap-3">
            {/* Avatar with connection ring */}
            <div className="relative">
              <Avatar
                src={avatarSrc}
                size="md"
                className="w-12 h-12"
                style={{ border: `2px solid ${LI_BLUE}` }}
              />
              {/* LinkedIn badge overlay */}
              <span
                className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full flex items-center justify-center"
                style={{ background: LI_BLUE }}
              >
                <FontAwesomeIcon icon={faLinkedin} className="text-white text-[9px]" />
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[14px] font-semibold text-[#191919] leading-tight">
                  {brandName ?? "Your Brand"}
                </span>
                {/* 1st degree badge */}
                <span className="text-[12px] font-medium" style={{ color: LI_BLUE }}>• 1st</span>
              </div>
              <p className="text-[12px] text-[#666] leading-tight">
                行銷顧問 · 品牌策略師
              </p>
              <div className="flex items-center gap-1 text-[11px] text-[#666] mt-0.5">
                <span>1 小時前</span>
                <span>·</span>
                <span>🌐</span>
              </div>
            </div>
          </div>
          {/* More options + Follow */}
          <div className="flex items-center gap-2">
            <button
              className="text-[13px] font-semibold flex items-center gap-1"
              style={{ color: LI_BLUE }}
            >
              + 追蹤
            </button>
            <span className="text-[#666] text-lg leading-none px-1">…</span>
          </div>
        </div>

        {/* Post body */}
        <div className="px-4 pb-2 space-y-1.5">
          {liveCaption ? (
            <MarkdownText content={liveCaption} lineClamp={8} className="text-[14px] text-[#191919] leading-relaxed" />
          ) : (
            <div className="space-y-2 py-0.5">
              <Skeleton className="h-3 w-[95%] rounded" />
              <Skeleton className="h-3 w-[88%] rounded" />
              <Skeleton className="h-3 w-[72%] rounded" />
            </div>
          )}
          {/* Hashtags */}
          {liveHashtags && liveHashtags.length > 0 ? (
            <p className="text-[13px] mt-1" style={{ color: LI_BLUE }}>
              {liveHashtags.slice(0, 5).join(" ")}
            </p>
          ) : (
            <p className="text-[13px] mt-1" style={{ color: LI_BLUE }}>
              #品牌行銷 #LinkedIn策略 #等寫手
            </p>
          )}
        </div>

        {/* ── Image area — ImageGenSlot replaces static skeleton ────── */}
        <ImageGenSlot
          phase={imageGenPhase ?? "idle"}
          designDirection={imageGenDesignDirection}
          aiPrompt={imageGenAiPrompt}
          modelName={imageGenModelName}
          resultUrl={imageGenResultUrl}
          errorMsg={imageGenErrorMsg}
          aspectRatio="16/9"
          onRetry={onImageRetry}
        />

        {/* Reaction summary */}
        <div
          className="px-4 py-2 flex items-center justify-between text-[12px]"
          style={{ color: "#666", borderBottom: "1px solid #e0e0e0" }}
        >
          <span className="flex items-center gap-1">
            <span className="text-[15px]">👍</span>
            <span className="text-[15px]">❤️</span>
            <span className="text-[15px]">💡</span>
            <span className="ml-1">1,234</span>
          </span>
          <span>87 則留言 · 23 次轉發</span>
        </div>

        {/* Action bar */}
        <div className="px-1 py-0.5 flex items-center">
          {[
            { icon: faThumbsUp, label: "讚" },
            { icon: faComment, label: "留言" },
            { icon: faShareNodes, label: "轉發" },
            { icon: faPaperPlane, label: "傳送" },
          ].map((b, i) => (
            <button
              key={i}
              className="flex-1 py-2 hover:bg-[#f3f2ef] rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#666] transition"
            >
              <FontAwesomeIcon icon={b.icon} className="text-[#666]" />
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Article ─────────────── */

export function LIArticle({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus }: MockupFields) {
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  const lines = (liveCaption ?? "").split(/\n+/).filter(Boolean);
  const headline = title || lines[0] || "Article 標題";
  const body = title ? liveCaption ?? "" : lines.slice(1).join("\n");
  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        {liveImageUrl && liveImageStatus === "ready" ? (
          <div className="aspect-[3/1] bg-default-100 overflow-hidden">
            <img src={liveImageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : liveImageStyle ? (
          <div className="aspect-[3/1] bg-default-100 flex items-center justify-center p-4 text-default-500">
            <div className="text-center max-w-[80%]">
              <p className="text-tiny font-semibold mb-1">封面風格方向</p>
              <p className="text-tiny line-clamp-3">{liveImageStyle}</p>
            </div>
          </div>
        ) : (
          <ImageGenSlot phase="idle" aspectRatio="3/1" />
        )}
        <div className="px-8 py-6 space-y-3">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">{headline}</h2>
          <div className="flex items-center gap-3 pt-1">
            <Avatar src={avatarSrc} size="md" isBordered color="primary" />
            <div>
              <p className="text-small font-semibold">{brandName ?? "Your Brand"}</p>
              <p className="text-tiny text-default-500">3,456 位追蹤者 · 5 分鐘閱讀</p>
            </div>
          </div>
          <Divider />
          {body ? (
            <p className="text-medium text-default-800 whitespace-pre-line leading-relaxed">{body}</p>
          ) : (
            <div className="space-y-2.5">
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-[96%] rounded" />
              <Skeleton className="h-3 w-[92%] rounded" />
            </div>
          )}
        </div>
        <div className="px-8 py-3 border-t border-divider flex items-center gap-4 text-default-500 text-tiny">
          <span>👍 喜歡</span>
          <span>💬 留言</span>
          <span>↗ 轉發</span>
          <span className="ml-auto">1.2K 次閱讀</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Newsletter (article + subscribe CTA) ─────────────── */

export function LINewsletter({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus }: MockupFields) {
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  void avatarSrc;
  const lines = (liveCaption ?? "").split(/\n+/).filter(Boolean);
  const headline = title || lines[0] || "Newsletter 標題";
  const body = title ? liveCaption ?? "" : lines.slice(1).join("\n");
  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-6 py-4 flex items-center gap-3 border-b border-divider bg-primary-50">
          <span className="w-12 h-12 rounded-medium bg-primary text-white flex items-center justify-center">
            <FontAwesomeIcon icon={faNewspaper} className="text-2xl" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-small font-bold text-primary uppercase tracking-wider">電子報 · NEWSLETTER</p>
            <p className="text-medium font-semibold truncate">{brandName ?? "Your Brand"} Insights</p>
            <p className="text-tiny text-default-500">每週四 · 1,234 位訂閱者</p>
          </div>
          <Button color="primary" size="sm" radius="full">訂閱</Button>
        </div>
        {liveImageUrl && liveImageStatus === "ready" ? (
          <div className="aspect-[3/1] bg-default-100 overflow-hidden">
            <img src={liveImageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : liveImageStyle ? (
          <div className="aspect-[3/1] bg-default-100 flex items-center justify-center p-4 text-default-500">
            <div className="text-center max-w-[80%]"><p className="text-tiny font-semibold mb-1">封面風格</p><p className="text-tiny line-clamp-3">{liveImageStyle}</p></div>
          </div>
        ) : (
          <ImageGenSlot phase="idle" aspectRatio="3/1" />
        )}
        <div className="px-8 py-6 space-y-3">
          <p className="text-tiny text-default-500 uppercase tracking-wider">第 042 期 · 5 月 15 日</p>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">{headline}</h2>
          <Divider />
          {body ? (
            <p className="text-medium text-default-800 whitespace-pre-line leading-relaxed">{body}</p>
          ) : (
            <div className="space-y-2.5">
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-[96%] rounded" />
              <Skeleton className="h-3 w-[88%] rounded" />
              <Skeleton className="h-3 w-[72%] rounded" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Poll ─────────────── */

export function LIPoll({ title, brandName, brandLogoUrl, variantLabel, liveCaption }: MockupFields) {
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  // Parse poll from liveCaption: line 1 = question, lines 2-5 = options
  const lines = (liveCaption ?? "").split(/\n+/).filter(Boolean);
  const question = lines[0] || title || "問題";
  const optTexts = lines.slice(1, 5);
  const optPcts = [42, 28, 18, 12];
  const options = optTexts.length >= 2
    ? optTexts.map((text, i) => ({ text: text.replace(/^[•\-\d.\)）\s]+/, ""), pct: optPcts[i] ?? 5, leading: i === 0 }))
    : [
        { text: "選項 A", pct: 42, leading: true },
        { text: "選項 B", pct: 28, leading: false },
        { text: "選項 C", pct: 18, leading: false },
        { text: "選項 D", pct: 12, leading: false },
      ];
  return (
    <div className="w-full max-w-[540px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center justify-between">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={<span className="text-tiny text-default-500">追蹤者 1,234 · 投票 · 結束於 6 天後</span>}
            avatarProps={{ src: avatarSrc, size: "md", isBordered: true, color: "primary" }}
          />
          <FontAwesomeIcon icon={faChartSimple} className="text-default-400" />
        </div>
        <div className="px-4 pb-3 space-y-3">
          <p className="text-medium font-medium">{question}</p>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <button
                key={i}
                className="w-full relative overflow-hidden rounded-full border border-divider hover:border-primary transition px-4 py-2 text-left"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-primary-100"
                  style={{ width: `${opt.pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-2 text-small">
                  <span className="flex items-center gap-2">
                    <FontAwesomeIcon icon={opt.leading ? faCircleDot : faCircle} className={opt.leading ? "text-primary" : "text-default-300"} />
                    <span className={opt.leading ? "font-semibold" : ""}>{opt.text}</span>
                  </span>
                  <span className={`tabular-nums ${opt.leading ? "font-bold text-primary" : "text-default-500"}`}>{opt.pct}%</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-tiny text-default-500">567 票 · 您的選擇會公開顯示</p>
        </div>
        <Divider />
        <div className="px-2 py-1 flex items-center justify-around text-default-700 text-small">
          {[
            { icon: faThumbsUp, label: "讚" },
            { icon: faComment, label: "留言" },
            { icon: faShareNodes, label: "轉發" },
            { icon: faPaperPlane, label: "傳送" },
          ].map((b, i) => (
            <button key={i} className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
              <FontAwesomeIcon icon={b.icon} /> {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Document (PDF carousel) ─────────────── */

export function LIDocument({ title, brandName, brandLogoUrl, variantLabel, liveCaption }: MockupFields) {
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  // First page text from liveCaption (split by ---)
  const pages = (liveCaption ?? "").split(/---+/).map(p => p.trim()).filter(Boolean);
  const totalPages = pages.length || 12;
  const pageOneText = pages[0] || title || "PDF 文件";
  return (
    <div className="w-full max-w-[540px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={<span className="text-tiny text-default-500">追蹤者 1,234 · 1 小時前</span>}
            avatarProps={{ src: avatarSrc, size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 pb-3">
          <p className="text-small">{title || pageOneText.slice(0, 30)}</p>
        </div>
        {/* Document viewer — show first page text content */}
        <div className="relative aspect-[4/5] bg-default-100 mx-4 rounded-medium overflow-hidden border border-divider">
          <div className="absolute inset-3 bg-content1 border border-divider rounded-medium shadow-sm overflow-hidden">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-default-700 p-4">
              {pages.length > 0 ? (
                <p className="text-small whitespace-pre-line text-center leading-relaxed">{pageOneText}</p>
              ) : (
                <div className="text-center text-default-400">
                  <FontAwesomeIcon icon={faFileLines} className="text-5xl mb-3" />
                  <p className="text-small font-medium">第 1 / {totalPages} 頁</p>
                  <p className="text-tiny mt-1">PDF 文件 · 等待 craft agent</p>
                </div>
              )}
            </div>
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-tiny px-3 py-1 rounded-full backdrop-blur-sm">
            1 / {totalPages}
          </div>
          {/* Side nav arrows */}
          <button className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-content1 border border-divider shadow flex items-center justify-center text-default-500">‹</button>
          <button className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-content1 border border-divider shadow flex items-center justify-center text-default-500">›</button>
        </div>
        <div className="px-4 py-2 mt-2 flex items-center justify-between text-tiny text-default-500">
          <span>👍❤️💡 1,234</span>
          <span>87 則留言 · 23 次轉發 · 156 次下載</span>
        </div>
        <Divider />
        <div className="px-2 py-1 flex items-center justify-around text-default-700 text-small">
          {[
            { icon: faThumbsUp, label: "讚" },
            { icon: faComment, label: "留言" },
            { icon: faShareNodes, label: "轉發" },
            { icon: faPaperPlane, label: "傳送" },
          ].map((b, i) => (
            <button key={i} className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
              <FontAwesomeIcon icon={b.icon} /> {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Native Video (feed + video player) ─────────────── */

export function LINativeVideo({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[540px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={<span className="text-tiny text-default-500">追蹤者 1,234 · 1 小時前 · 🌐</span>}
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 pb-3 space-y-2">
          <p className="text-small">{title}</p>
          <Skeleton className="h-2.5 w-[88%] rounded" />
          <Skeleton className="h-2.5 w-[72%] rounded" />
        </div>
        {/* Video player */}
        <div className="relative aspect-video bg-black flex items-center justify-center">
          <div className="text-white/50 text-tiny">影片載入中…</div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <span className="ml-1 text-foreground text-xl">▶</span>
            </span>
          </div>
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-tiny px-1.5 py-0.5 rounded">3:45</div>
          {/* Caption indicator */}
          <div className="absolute top-2 right-2 bg-black/80 text-white text-tiny px-1.5 py-0.5 rounded">CC</div>
          {/* Play progress bar */}
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
            <div className="h-full w-1/4 bg-primary" />
          </div>
        </div>
        <div className="px-4 py-2 flex items-center justify-between text-tiny text-default-500">
          <span>👍❤️💡 1,234 · 12K 次觀看</span>
          <span>87 留言 · 23 次轉發</span>
        </div>
        <Divider />
        <div className="px-2 py-1 flex items-center justify-around text-default-700 text-small">
          {[
            { icon: faThumbsUp, label: "讚" },
            { icon: faComment, label: "留言" },
            { icon: faShareNodes, label: "轉發" },
            { icon: faPaperPlane, label: "傳送" },
          ].map((b, i) => (
            <button key={i} className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
              <FontAwesomeIcon icon={b.icon} /> {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Ad (feed + Promoted + CTA) ─────────────── */

export function LIAd({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[540px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3">
          <User
            name={
              <span className="flex items-center gap-1.5">
                <span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>
              </span>
            }
            description={
              <span className="text-tiny text-default-500">推廣 · Promoted · 1.2K 位追蹤者</span>
            }
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 pb-3 space-y-2">
          <p className="text-small">{title}</p>
          <Skeleton className="h-2.5 w-[90%] rounded" />
        </div>
        <ImageGenSlot phase="idle" aspectRatio="1.91/1" />
        {/* CTA bar */}
        <div className="px-4 py-3 bg-default-50 border-y border-divider flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-small font-semibold truncate">下載白皮書</p>
            <p className="text-tiny text-default-500 truncate">your-brand.com</p>
          </div>
          <Button color="primary" size="sm" radius="full" className="font-medium ml-2">了解更多</Button>
        </div>
        <div className="px-4 py-2 flex items-center justify-between text-tiny text-default-500">
          <span>👍❤️💡 234</span>
          <span>12 留言 · 5 次轉發</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Event (event card + RSVP) ─────────────── */

export function LIEvent({ title, brief, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <ImageGenSlot phase="idle" aspectRatio="2.5/1" />
        <div className="px-5 pt-4 pb-3 space-y-2">
          <Chip size="sm" variant="flat" color="primary" className="uppercase tracking-wider">
            線上活動
          </Chip>
          <p className="text-tiny font-bold uppercase tracking-wider text-primary">5 月 15 日 (四) · 10:00 PM</p>
          <h3 className="text-medium font-bold leading-snug">{title}</h3>
          <div className="flex items-center gap-2 text-tiny text-default-500">
            <Avatar src={dicebear(brandName ?? "brand")} size="sm" />
            <span>{brandName ?? "Your Brand"} · 主辦</span>
          </div>
          {brief && <p className="text-tiny text-default-500 line-clamp-2">{brief}</p>}
          <div className="flex items-center gap-2 pt-1 text-tiny text-default-500">
            <span><FontAwesomeIcon icon={faThumbsUp} /> 1,234 位有興趣</span>
            <span>· 234 位將參加</span>
          </div>
        </div>
        <div className="px-5 pb-4 flex gap-2">
          <Button color="primary" size="sm" radius="full" className="flex-1 font-medium">參加</Button>
          <Button variant="bordered" size="sm" radius="full" className="flex-1">分享</Button>
        </div>
      </div>
    </div>
  );
}
