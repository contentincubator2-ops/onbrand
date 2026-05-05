/**
 * TikTok mockups.
 * PR2.2: foryou, profile (carousel/live still fall to foryou)
 * Reference: SashenJayathilaka/TIK-TOK-Clone (MIT)
 */
import React from "react";
import { Avatar, Button, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTiktok } from "@fortawesome/free-brands-svg-icons";
import {
  faVideo, faHeart, faComment, faShareNodes, faMusic, faPlus,
  faPlay, faLock, faShare, faGear,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, dicebear } from "./shared";

/* ─────────────── TT For-You ─────────────── */

export function TTForYou({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus }: MockupFields) {
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  return (
    <div className="w-full max-w-[280px] mx-auto">
      <MockupHeader icon={faTiktok} label="TikTok" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-center gap-4 pt-3 text-white text-small">
          <span className="opacity-60">追蹤中</span>
          <span className="font-semibold border-b-2 border-white pb-1">為你推薦</span>
        </div>
        {liveImageUrl && liveImageStatus === "ready" ? (
          <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="absolute inset-0 opacity-30" />
            {liveImageStyle && (
              <div className="relative z-10 text-center text-white/80 px-4 max-w-[80%]">
                <FontAwesomeIcon icon={faVideo} className="text-2xl mb-2" />
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1">封面風格</p>
                <p className="text-tiny line-clamp-3">{liveImageStyle}</p>
              </div>
            )}
          </div>
        )}
        {liveCaption && (
          <div className="absolute top-12 inset-x-3 z-10 bg-black/55 backdrop-blur-sm rounded-medium p-2 max-h-[55%] overflow-y-auto pr-12">
            <p className="text-tiny text-white whitespace-pre-line leading-relaxed">{liveCaption}</p>
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
          <RailIcon icon={faShareNodes} count="分享"   />
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center text-white border-2 border-black">
            <FontAwesomeIcon icon={faMusic} className="text-medium" />
          </span>
        </div>
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pr-16 text-white space-y-1 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-small font-semibold">@{handle}</p>
          {title && <p className="text-small line-clamp-2">{title}</p>}
          <div className="flex items-center gap-1 text-tiny">
            <FontAwesomeIcon icon={faMusic} className="text-tiny" />
            <span>原創音訊 · @{handle}</span>
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
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  return (
    <div className="w-full max-w-[360px] mx-auto">
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
            <div><span className="font-bold">12</span> <span className="text-default-500">追蹤中</span></div>
            <div><span className="font-bold">12.3K</span> <span className="text-default-500">粉絲</span></div>
            <div><span className="font-bold">456K</span> <span className="text-default-500">獲贊</span></div>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button color="danger" size="sm" radius="md" className="bg-[#FE2C55]">追蹤</Button>
            <Button variant="bordered" size="sm" radius="md">傳訊息</Button>
          </div>
          {liveCaption ? (
            <p className="text-tiny text-default-700 whitespace-pre-line leading-relaxed pt-1">{liveCaption}</p>
          ) : (
            <p className="text-tiny text-default-500 pt-1">{brandName ?? "Your Brand"} · 點擊查看簡介</p>
          )}
        </div>
        {/* Tabs */}
        <div className="flex items-center justify-around border-t border-divider text-default-500">
          <button className="flex-1 py-2 border-b-2 border-foreground text-foreground">影片</button>
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

export function TTCarousel({ title, brandName, variantLabel }: MockupFields) {
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  return (
    <div className="w-full max-w-[280px] mx-auto">
      <MockupHeader icon={faTiktok} label="TikTok" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-center gap-4 pt-3 text-white text-small">
          <span className="font-semibold border-b-2 border-white pb-1">為你推薦</span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="absolute inset-0 opacity-30" />
          <div className="relative z-10 text-center text-white/60">
            <FontAwesomeIcon icon={faPlay} className="text-4xl mb-2" />
            <p className="text-tiny">圖文 1 / 8 · 等待 craft agent</p>
          </div>
        </div>
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
          <RailItem icon={faShareNodes} count="分享" />
        </div>
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pr-16 text-white space-y-1 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-small font-semibold">@{handle}</p>
          <p className="text-small line-clamp-2">{title}</p>
          <div className="flex items-center gap-1 text-tiny">
            <FontAwesomeIcon icon={faMusic} className="text-tiny" />
            <span>原創音訊 · @{handle}</span>
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

export function TTLive({ title, brandName, brandLogoUrl, variantLabel, liveCaption, liveImageStyle, liveImageUrl, liveImageStatus }: MockupFields) {
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  const avatarSrc = brandLogoUrl || dicebear(brandName ?? "brand");
  void title;
  return (
    <div className="w-full max-w-[280px] mx-auto">
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
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="absolute inset-0 opacity-30" />
            {liveImageStyle && (
              <div className="relative z-10 text-center text-white/80 px-4 max-w-[80%]">
                <FontAwesomeIcon icon={faVideo} className="text-2xl mb-2" />
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1">封面風格</p>
                <p className="text-tiny line-clamp-3">{liveImageStyle}</p>
              </div>
            )}
          </div>
        )}
        {liveCaption && (
          <div className="absolute top-12 inset-x-3 z-10 bg-black/55 backdrop-blur-sm rounded-medium p-2.5 max-h-[55%] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-white/60 mb-1">開場腳本</p>
            <p className="text-tiny text-white whitespace-pre-line leading-relaxed">{liveCaption}</p>
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
            { user: "fan_01", msg: "好厲害!" },
            { user: "fan_02", msg: "送你 🌹" },
            { user: "fan_03", msg: "下次什麼時候開播?" },
          ].map((c, i) => (
            <div key={i} className="bg-black/50 backdrop-blur-sm text-white text-tiny px-2 py-1 rounded-medium">
              <span className="font-semibold text-[#FE2C55]">{c.user}</span> {c.msg}
            </div>
          ))}
        </div>
        {/* Bottom: input + gift button */}
        <div className="absolute bottom-3 inset-x-3 z-10 flex items-center gap-2">
          <div className="flex-1 bg-white/15 border border-white/30 rounded-full px-3 py-1.5 text-tiny text-white/70">
            說點什麼…
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
