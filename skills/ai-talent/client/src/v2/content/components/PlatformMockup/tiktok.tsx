/**
 * TikTok mockups.
 * PR2.2: foryou, profile (carousel/live still fall to foryou)
 * Reference: SashenJayathilaka/TIK-TOK-Clone (MIT)
 */
import { Avatar, Button, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTiktok } from "@fortawesome/free-brands-svg-icons";
import {
  faVideo, faHeart, faComment, faShareNodes, faMusic, faPlus,
  faPlay, faLock, faShare, faGear,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, dicebear, MarkdownText, ImageGenSlot } from "./shared";
import { useLang } from "../../../../lib/i18n";
import { getPostTitleFallback } from "../../lib/mockupTitle";

/* ─────────────── TT For-You ─────────────── */

export function TTForYou({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  const postTitleFallback = getPostTitleFallback(title, liveCaption);
  return (
    <div className="w-full max-w-[400px] mx-auto">
      <MockupHeader icon={faTiktok} label="TikTok" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-center gap-4 pt-3 text-white text-small">
          <span className="opacity-60">{lang === "en" ? "Following" : "追蹤中"}</span>
          <span className="font-semibold border-b-2 border-white pb-1">{lang === "en" ? "For You" : "為你推薦"}</span>
        </div>
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
              // 2026-09-08：影片生成移除，所有 TikTok 卡都只出靜圖，一律標示不產影片檔。
              videoFrame
            />
          </div>
        )}
        {liveCaption && (
          <div className="absolute top-12 inset-x-3 z-10 bg-black/55 backdrop-blur-sm rounded-medium p-2 max-h-[55%] overflow-y-auto pr-12">
            <p className="text-sm text-white whitespace-pre-line leading-relaxed">{liveCaption}</p>
          </div>
        )}
        <div className="absolute right-2 bottom-24 z-10 flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar src={avatarSrc} size="md" isBordered color="danger" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#FE2C55] text-white flex items-center justify-center text-tiny font-bold border-2 border-black">
              <FontAwesomeIcon icon={faPlus} className="text-tiny" />
            </span>
          </div>
          <RailIcon icon={faHeart}      count="123.4K" />
          <RailIcon icon={faComment}    count="2,345"  />
          <RailIcon icon={faShareNodes} count={lang === "en" ? "Share" : "分享"}   />
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center text-white border-2 border-black">
            <FontAwesomeIcon icon={faMusic} className="text-medium" />
          </span>
        </div>
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pr-16 text-white space-y-1 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-small font-semibold">@{handle}</p>
          {postTitleFallback && (
            <p className="text-small line-clamp-2">{postTitleFallback}</p>
          )}
          <div className="flex items-center gap-1 text-tiny">
            <FontAwesomeIcon icon={faMusic} className="text-tiny" />
            <span>{lang === "en" ? "Original audio" : "原創音訊"} · @{handle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RailIcon({ icon, count }: { icon: any; count: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-white drop-shadow-lg">
      <FontAwesomeIcon icon={icon} className="text-2xl" />
      <span className="text-tiny font-semibold">{count}</span>
    </div>
  );
}

/* ─────────────── TT Profile (3-col grid) ─────────────── */

export function TTProfile({ brandName, brandLogoUrl, variantLabel, liveCaption }: MockupFields) {
  const { lang } = useLang();
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  return (
    <div className="w-full max-w-[400px] mx-auto">
      <MockupHeader icon={faTiktok} label="TikTok" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <FontAwesomeIcon icon={faShare} className="text-default-500" />
          <p className="text-small font-semibold">@{handle}</p>
          <FontAwesomeIcon icon={faGear} className="text-default-500" />
        </div>
        {/* Profile */}
        <div className="text-center px-4 py-3 space-y-2">
          <Avatar src={avatarSrc} size="lg" className="mx-auto" />
          <p className="text-medium font-bold">@{handle}</p>
          <div className="flex items-center justify-center gap-4 text-small">
            <div><span className="font-bold">12</span> <span className="text-default-500">{lang === "en" ? "Following" : "追蹤中"}</span></div>
            <div><span className="font-bold">12.3K</span> <span className="text-default-500">{lang === "en" ? "Followers" : "粉絲"}</span></div>
            <div><span className="font-bold">456K</span> <span className="text-default-500">{lang === "en" ? "Likes" : "獲贊"}</span></div>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button color="danger" size="sm" radius="md" className="bg-[#FE2C55]">{lang === "en" ? "Follow" : "追蹤"}</Button>
            <Button variant="bordered" size="sm" radius="md">{lang === "en" ? "Message" : "傳訊息"}</Button>
          </div>
          {liveCaption ? (
            <p className="text-sm text-default-700 whitespace-pre-line leading-relaxed pt-1">{liveCaption}</p>
          ) : (
            <p className="text-tiny text-default-500 pt-1">{brandName ?? "Your Brand"} · {lang === "en" ? "Tap to view bio" : "點擊查看簡介"}</p>
          )}
        </div>
        {/* Tabs */}
        <div className="flex items-center justify-around border-t border-divider text-default-500">
          <button className="flex-1 py-2 border-b-2 border-foreground text-foreground">{lang === "en" ? "Videos" : "影片"}</button>
          <button className="flex-1 py-2"><FontAwesomeIcon icon={faLock} /></button>
          <button className="flex-1 py-2"><FontAwesomeIcon icon={faHeart} /></button>
        </div>
        {/* Grid */}
        <div className="grid grid-cols-3 gap-px bg-divider">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-[9/16] bg-default-100 relative flex items-center justify-center">
              <Skeleton className="absolute inset-0" />
              <FontAwesomeIcon icon={faPlay} className="relative z-10 text-default-300 text-medium" />
              <span className="absolute bottom-1 left-1 text-tiny text-white drop-shadow flex items-center gap-1 z-10">
                <FontAwesomeIcon icon={faPlay} className="text-tiny" /> {(Math.random() * 100).toFixed(0)}K
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── TT Photo Carousel ─────────────── */

export function TTCarousel({ title, brandName, variantLabel, liveImageStyle, liveImageStatus, liveImageUrl, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  return (
    <div className="w-full max-w-[400px] mx-auto">
      <MockupHeader icon={faTiktok} label="TikTok" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-center gap-4 pt-3 text-white text-small">
          <span className="font-semibold border-b-2 border-white pb-1">{lang === "en" ? "For You" : "為你推薦"}</span>
        </div>
        {/* 2026-07-17 (CJ「盤查生圖佔位」): standardized ImageGenSlot（圖文輪播
            第 1 格 — 產出是圖片，非影片，故不加 videoFrame 註記） */}
        {liveImageUrl && liveImageStatus === "ready" ? (
          <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
        ) : (
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
        <div className="absolute top-12 right-3 z-10 bg-black/50 backdrop-blur-sm text-white text-tiny px-2 py-0.5 rounded-full">
          1/8
        </div>
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <span key={i} className={`rounded-full w-1 h-1 ${i === 0 ? "bg-white" : "bg-white/40"}`} />
          ))}
        </div>
        <div className="absolute right-2 bottom-24 z-10 flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar src={dicebear(brandName ?? "brand")} size="md" isBordered color="danger" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#FE2C55] text-white flex items-center justify-center text-tiny font-bold border-2 border-black">
              <FontAwesomeIcon icon={faPlus} className="text-tiny" />
            </span>
          </div>
          <RailItem icon={faHeart} count="98K" />
          <RailItem icon={faComment} count="1,234" />
          <RailItem icon={faShareNodes} count={lang === "en" ? "Share" : "分享"} />
        </div>
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pr-16 text-white space-y-1 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-small font-semibold">@{handle}</p>
          <p className="text-small line-clamp-2">{title}</p>
          <div className="flex items-center gap-1 text-tiny">
            <FontAwesomeIcon icon={faMusic} className="text-tiny" />
            <span>{lang === "en" ? "Original audio" : "原創音訊"} · @{handle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RailItem({ icon, count }: { icon: any; count: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-white drop-shadow-lg">
      <FontAwesomeIcon icon={icon} className="text-2xl" />
      <span className="text-tiny font-semibold">{count}</span>
    </div>
  );
}

/* ─────────────── TT Live (LIVE chip + viewers + gifts) ─────────────── */

export function TTLive({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus, onGenerateImage }: MockupFields) {
  const { lang } = useLang();
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  void title;
  return (
    <div className="w-full max-w-[400px] mx-auto">
      <MockupHeader icon={faTiktok} label="TikTok" variantLabel={variantLabel} />
      <div className="relative bg-default-900 rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        {/* Top: host pill + LIVE + viewers */}
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full pl-1 pr-2 py-0.5">
            <Avatar src={avatarSrc} size="sm" classNames={{ base: "w-5 h-5" }} />
            <span className="text-white text-tiny font-semibold">{handle}</span>
            <span className="bg-[#FE2C55] text-white text-tiny font-bold px-1.5 py-0 rounded uppercase">LIVE</span>
          </div>
          <span className="bg-black/40 backdrop-blur-sm text-white text-tiny px-2 py-0.5 rounded">
            👁 8,432
          </span>
        </div>
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
        {liveCaption && (
          <div className="absolute top-12 inset-x-3 z-10 bg-black/55 backdrop-blur-sm rounded-medium p-2.5 max-h-[55%] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-white/60 mb-1">{lang === "en" ? "Opening script" : "開場腳本"}</p>
            <p className="text-sm text-white whitespace-pre-line leading-relaxed">{liveCaption}</p>
          </div>
        )}
        {/* Floating gift animations */}
        <div className="absolute right-3 bottom-32 z-10 space-y-2">
          {["🌹", "💎", "🚀"].map((g, i) => (
            <span key={i} className="block text-2xl drop-shadow-lg animate-pulse">{g}</span>
          ))}
        </div>
        {/* Chat bubbles bottom-left */}
        <div className="absolute bottom-20 left-3 z-10 space-y-1.5 max-w-[60%]">
          {[
            { user: "fan_01", msg: lang === "en" ? "So good!" : "好厲害!" },
            { user: "fan_02", msg: lang === "en" ? "Sending you 🌹" : "送你 🌹" },
            { user: "fan_03", msg: lang === "en" ? "When is the next stream?" : "下次什麼時候開播?" },
          ].map((c, i) => (
            <div key={i} className="bg-black/50 backdrop-blur-sm text-white text-tiny px-2 py-1 rounded-medium">
              <span className="font-semibold text-[#FE2C55]">{c.user}</span> {c.msg}
            </div>
          ))}
        </div>
        {/* Bottom: input + gift button */}
        <div className="absolute bottom-3 inset-x-3 z-10 flex items-center gap-2">
          <div className="flex-1 bg-white/15 border border-white/30 rounded-full px-3 py-1.5 text-tiny text-white/70">
            {lang === "en" ? "Say something…" : "說點什麼…"}
          </div>
          <span className="w-9 h-9 rounded-full bg-[#FE2C55] flex items-center justify-center text-white text-medium">🎁</span>
          <FontAwesomeIcon icon={faShareNodes} className="text-white text-medium" />
        </div>
        {/* Title */}
        <div className="absolute top-12 inset-x-3 z-10 text-white text-tiny opacity-80 line-clamp-2">{title}</div>
      </div>
    </div>
  );
}

/* ─────────────── TT Storyboard (分鏡表) ─────────────── */
/**
 * 2026-08-01: TikTok counterpart to YTStoryboard. Not a reuse of it —
 * that one is aspect-video and YouTube-branded, and a vertical shot list
 * squeezed into 16:9 frames misrepresents what will actually be shot.
 *
 * Frames are 9:16 and laid out as a 2-column grid: five tall verticals
 * stacked in a single column would push the last shots far below the fold,
 * and a storyboard is only useful when you can see the sequence at a glance.
 */
export function TTStoryboard({ title, brandName, variantLabel, liveCards }: MockupFields) {
  const { lang } = useLang();
  const frames = Array.isArray(liveCards) ? liveCards : [];
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faTiktok} label="TikTok" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <p className="text-small font-semibold leading-tight line-clamp-1">
            {title || (lang === "en" ? "Storyboard" : "分鏡表")}
          </p>
          <span className="text-tiny text-default-500 shrink-0 ml-2">
            {brandName ?? (lang === "en" ? "Your account" : "你的帳號")}
          </span>
        </div>
        {frames.length === 0 ? (
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <div key={i}>
                <Skeleton className="w-full rounded-lg mb-2" style={{ aspectRatio: "9 / 16" }} />
                <Skeleton className="h-2.5 w-[70%] rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            {frames.map((c, i) => (
              <div key={i} className="border border-divider rounded-lg overflow-hidden">
                <div
                  className="relative bg-black flex items-center justify-center"
                  style={{ aspectRatio: "9 / 16" }}
                >
                  {c.image?.url && c.image.status === "ready" ? (
                    <img
                      src={c.image.url}
                      alt={c.headline}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <Skeleton className="absolute inset-0 opacity-40" />
                      <div className="relative z-10 text-center text-default-400 px-2">
                        <FontAwesomeIcon icon={faVideo} className="text-xl mb-1" />
                        <p className="text-[10px] line-clamp-4">
                          {c.image?.status === "failed" || c.image?.status === "timeout"
                            ? (lang === "en" ? "Frame generation failed" : "此格畫面生成失敗")
                            : c.image?.style
                              ? c.image.style
                              : (lang === "en" ? "Storyboard frame 9:16" : "分鏡畫面 9:16")}
                        </p>
                      </div>
                    </>
                  )}
                  <span className="absolute top-1.5 left-1.5 bg-black/80 text-white text-tiny font-semibold px-1.5 py-0.5 rounded z-10">
                    {lang === "en" ? `Shot ${i + 1}` : `鏡頭 ${i + 1}`}
                  </span>
                </div>
                <div className="px-2 py-1.5 border-t border-divider">
                  <p className="text-tiny font-semibold leading-tight line-clamp-2">{c.headline}</p>
                  {c.body && (
                    <p className="text-[10px] text-default-500 leading-relaxed mt-0.5 line-clamp-4">
                      {c.body}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── TT Comment reply (tt-30-comment-reply) ───────────────
 *
 * 2026-08-20: "tiktok:comment" had no case in PlatformMockup, so
 * tt-30-comment-reply fell to the「即將推出」placeholder instead of
 * rendering the reply that was actually produced. TikTok's comment
 * sheet is dark, with the creator reply carrying a「作者」badge.
 */
export function TTComment({
  title, brandName, brandLogoUrl, variantLabel, liveCaption, liveSourceComment,
}: MockupFields) {
  const { lang } = useLang();
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  const source = (liveSourceComment ?? "").trim();

  return (
    <div className="w-full max-w-[420px] mx-auto">
      <MockupHeader
        icon={faTiktok}
        label={lang === "en" ? "TikTok Reply" : "TikTok 留言回覆"}
        variantLabel={variantLabel}
      />

      <div className="bg-[#121212] rounded-xl overflow-hidden shadow-lg text-white">
        <div className="px-4 py-2.5 border-b border-white/10 text-center text-small font-semibold">
          {lang === "en" ? "128 comments" : "128 則留言"}
        </div>

        <div className="px-4 py-3 space-y-4">
          {/* The comment being answered */}
          <div className="flex items-start gap-2.5">
            <Avatar src={dicebear("tt-commenter")} className="w-8 h-8 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-tiny text-white/60">{lang === "en" ? "a_viewer" : "某位觀眾"}</p>
              <p className="text-small text-white/90 leading-snug break-words mt-0.5">
                {source || (lang === "en"
                  ? "(the comment you pasted shows up here)"
                  : "（你貼上的原始留言會顯示在這）")}
              </p>
              <div className="flex items-center gap-3 mt-1 text-tiny text-white/45">
                <span>{lang === "en" ? "2h ago" : "2 小時前"}</span>
                <span>{lang === "en" ? "Reply" : "回覆"}</span>
              </div>
            </div>
            <div className="flex flex-col items-center text-white/45 text-tiny gap-0.5">
              <FontAwesomeIcon icon={faHeart} />
              <span>32</span>
            </div>
          </div>

          {/* The produced reply */}
          <div className="flex items-start gap-2.5 pl-8">
            <Avatar src={avatarSrc} className="w-7 h-7 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-tiny text-white/60 flex items-center gap-1.5">
                {handle}
                <span className="bg-[#FE2C55] text-white text-[9px] px-1 rounded">
                  {lang === "en" ? "Creator" : "作者"}
                </span>
              </p>
              {liveCaption
                ? <MarkdownText content={liveCaption} className="text-small text-white/90 leading-snug mt-0.5" />
                : <Skeleton className="h-3 w-2/3 rounded mt-1" />}
              <div className="flex items-center gap-3 mt-1 text-tiny text-white/45">
                <span>{lang === "en" ? "Just now" : "剛剛"}</span>
                <span>{lang === "en" ? "Reply" : "回覆"}</span>
              </div>
            </div>
            <div className="flex flex-col items-center text-white/45 text-tiny gap-0.5">
              <FontAwesomeIcon icon={faHeart} />
              <span>0</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10">
          <div className="flex-1 bg-white/10 rounded-full px-3 py-1.5 text-tiny text-white/45">
            {lang === "en" ? "Add comment…" : "新增留言…"}
          </div>
        </div>
      </div>

      {title && <p className="text-tiny text-default-500 mt-2 text-center">{title}</p>}
    </div>
  );
}
