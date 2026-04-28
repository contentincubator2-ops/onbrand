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

export function TTForYou({ title, brandName, variantLabel }: MockupFields) {
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
  return (
    <div className="w-full max-w-[280px] mx-auto">
      <MockupHeader icon={faTiktok} label="TikTok" variantLabel={variantLabel} />
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "9 / 16" }}>
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-center gap-4 pt-3 text-white text-[0.82rem]">
          <span className="opacity-60">追蹤中</span>
          <span className="font-semibold border-b-2 border-white pb-1">為你推薦</span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="absolute inset-0 opacity-30" />
          <div className="relative z-10 text-center text-white/60">
            <FontAwesomeIcon icon={faVideo} className="text-4xl mb-2" />
            <p className="text-tiny">9:16 影片 · 等待 craft agent</p>
          </div>
        </div>
        <div className="absolute right-2 bottom-24 z-10 flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar src={dicebear(brandName ?? "brand")} size="md" isBordered color="danger" />
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
          <p className="text-[0.84rem] font-semibold">@{handle}</p>
          <p className="text-[0.78rem] line-clamp-2">{title}</p>
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

export function TTProfile({ brandName, variantLabel }: MockupFields) {
  const handle = (brandName ?? "your_brand").toLowerCase().replace(/\s+/g, "_");
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
          <Avatar src={dicebear(brandName ?? "brand")} size="lg" className="mx-auto" />
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
          <p className="text-tiny text-default-500 pt-1">{brandName ?? "Your Brand"} · 點擊查看簡介</p>
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
                <FontAwesomeIcon icon={faPlay} className="text-[0.5rem]" /> {(Math.random() * 100).toFixed(0)}K
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
