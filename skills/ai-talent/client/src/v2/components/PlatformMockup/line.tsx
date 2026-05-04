/**
 * LINE mockups.
 *
 * Variants:
 *   broadcast   — LINE Official Account mass message
 *   richmenu    — Rich Menu interactive panel
 *   card        — Flex Message card (product / event / coupon)
 */
import React from "react";
import { Avatar, Button, Chip, Divider, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLine } from "@fortawesome/free-brands-svg-icons";
import { faImages, faBell, faQrcode, faArrowRight, faGift } from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, dicebear, MarkdownText } from "./shared";

/* ─────────────── LINE Broadcast Message ─────────────── */

export function LINEBroadcast({ title, brandName, variantLabel, liveCaption, liveImageDesc, liveCta }: MockupFields) {
  const brand = brandName ?? "Your Brand";

  return (
    <div className="w-full max-w-[400px] mx-auto">
      <MockupHeader icon={faLine} label="LINE 訊息" variantLabel={variantLabel} />

      {/* Phone chrome */}
      <div className="bg-[#1b1b1b] rounded-[36px] p-3 shadow-2xl">
        <div className="bg-[#f0f0f0] rounded-[28px] overflow-hidden">

          {/* Status bar */}
          <div className="bg-[#4CAF50] px-5 pt-10 pb-3">
            <div className="flex items-center gap-2">
              <Avatar src={dicebear(brand)} size="sm" className="border-2 border-white shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-small font-bold truncate">{brand}</p>
                <p className="text-[#b2dfb4] text-tiny">官方帳號</p>
              </div>
              <FontAwesomeIcon icon={faBell} className="text-white text-sm" />
            </div>
          </div>

          {/* Chat area */}
          <div className="bg-[#c8e6c9] px-3 py-4 min-h-[360px] space-y-3">

            {/* Image message */}
            <div className="flex gap-2">
              <Avatar src={dicebear(brand)} size="sm" className="shrink-0 mt-auto" />
              <div className="max-w-[85%] space-y-1">
                <div className="aspect-[16/9] w-full bg-[#e0e0e0] rounded-2xl rounded-tl-none overflow-hidden flex items-center justify-center relative min-w-[220px]">
                  <Skeleton className="absolute inset-0 rounded-none" />
                  <div className="relative z-10 text-center p-3">
                    <FontAwesomeIcon icon={faImages} className="text-[#9e9e9e] text-2xl mb-1" />
                    <p className="text-[10px] text-[#757575] line-clamp-2">
                      {liveImageDesc ?? "訊息圖 · 等待 visual agent"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Text message bubble */}
            <div className="flex gap-2">
              <Avatar src={dicebear(brand)} size="sm" className="shrink-0 mt-auto" />
              <div className="max-w-[85%]">
                <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                  {liveCaption ? (
                    <MarkdownText content={liveCaption} className="text-small text-[#333] leading-relaxed" />
                  ) : (
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-[180px] rounded" />
                      <Skeleton className="h-3 w-[150px] rounded" />
                      <Skeleton className="h-3 w-[120px] rounded" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTA button message */}
            <div className="flex gap-2">
              <Avatar src={dicebear(brand)} size="sm" className="shrink-0 mt-auto" />
              <div className="max-w-[85%]">
                <button className="bg-white rounded-2xl rounded-tl-none px-5 py-3 shadow-sm border-b-2 border-[#4CAF50] flex items-center gap-2 text-[#4CAF50] text-small font-semibold">
                  {liveCta ?? "了解更多"}
                  <FontAwesomeIcon icon={faArrowRight} className="text-tiny" />
                </button>
              </div>
            </div>

            <p className="text-[10px] text-[#757575] text-center">剛剛</p>
          </div>

          {/* Input bar */}
          <div className="bg-white px-3 py-2.5 flex items-center gap-2 border-t border-[#e0e0e0]">
            <div className="flex-1 bg-[#f5f5f5] rounded-full px-3 py-1.5 text-tiny text-[#bdbdbd]">
              Aa
            </div>
            <div className="w-8 h-8 rounded-full bg-[#4CAF50] flex items-center justify-center">
              <FontAwesomeIcon icon={faLine} className="text-white text-sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LINE Flex Message Card ─────────────── */

export function LINECard({ title, brandName, variantLabel, liveTitle, liveDescription, liveCta, liveImageDesc }: MockupFields) {
  const brand = brandName ?? "Your Brand";

  return (
    <div className="w-full max-w-[360px] mx-auto">
      <MockupHeader icon={faLine} label="LINE Flex Card" variantLabel={variantLabel} />

      <div className="bg-[#1b1b1b] rounded-[36px] p-3 shadow-2xl">
        <div className="bg-[#c8e6c9] rounded-[28px] overflow-hidden px-3 py-12">
          <div className="flex gap-2 items-end">
            <Avatar src={dicebear(brand)} size="sm" className="shrink-0" />

            {/* Flex card */}
            <div className="flex-1 bg-white rounded-2xl rounded-tl-none overflow-hidden shadow-md">
              {/* Card image */}
              <div className="aspect-[4/3] bg-[#e0e0e0] flex items-center justify-center relative">
                <Skeleton className="absolute inset-0 rounded-none" />
                <div className="relative z-10 text-center p-3">
                  <FontAwesomeIcon icon={faImages} className="text-[#9e9e9e] text-2xl mb-1" />
                  <p className="text-[10px] text-[#757575]">{liveImageDesc ?? "商品 / 活動圖"}</p>
                </div>
              </div>

              {/* Card body */}
              <div className="px-4 py-3 space-y-1.5">
                <p className="text-small font-bold text-[#333] line-clamp-2">
                  {liveTitle ?? title}
                </p>
                {liveDescription ? (
                  <MarkdownText content={liveDescription} lineClamp={3} className="text-[11px] text-[#757575]" />
                ) : (
                  <div className="space-y-1">
                    <Skeleton className="h-2.5 w-full rounded" />
                    <Skeleton className="h-2.5 w-[80%] rounded" />
                  </div>
                )}
              </div>

              {/* Card CTA */}
              <div className="px-4 pb-3">
                <button className="w-full bg-[#4CAF50] text-white text-small font-semibold py-2 rounded-xl flex items-center justify-center gap-2">
                  <FontAwesomeIcon icon={faGift} />
                  {liveCta ?? "立即領取"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LINE Rich Menu ─────────────── */

export function LINERichMenu({ title, brandName, variantLabel }: MockupFields) {
  const brand = brandName ?? "Your Brand";
  const menuItems = [
    { icon: faImages, label: "最新優惠" },
    { icon: faGift, label: "兌換禮物" },
    { icon: faQrcode, label: "會員卡" },
    { icon: faBell, label: "活動通知" },
    { icon: faLine, label: "聯繫客服" },
    { icon: faArrowRight, label: "官方網站" },
  ];

  return (
    <div className="w-full max-w-[380px] mx-auto">
      <MockupHeader icon={faLine} label="LINE Rich Menu" variantLabel={variantLabel} />
      <div className="bg-[#1b1b1b] rounded-[36px] p-3 shadow-2xl">
        <div className="bg-[#c8e6c9] rounded-[28px] overflow-hidden">
          <div className="bg-[#4CAF50] px-5 pt-10 pb-3 flex items-center gap-2">
            <Avatar src={dicebear(brand)} size="sm" className="border-2 border-white" />
            <p className="text-white font-bold text-small">{brand}</p>
          </div>
          <div className="bg-[#c8e6c9] px-3 py-4 min-h-[140px] flex items-end">
            <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 text-small text-[#333] shadow-sm max-w-[85%]">
              嗨！歡迎加入 {brand} 的 LINE 官方帳號 👋
            </div>
          </div>
          {/* Rich Menu panel */}
          <div className="bg-white border-t-2 border-[#e0e0e0]">
            <div className="text-center py-1">
              <div className="w-8 h-1 bg-[#e0e0e0] rounded-full mx-auto" />
            </div>
            <div className="grid grid-cols-3">
              {menuItems.map((item, i) => (
                <button key={i} className={`flex flex-col items-center justify-center py-4 gap-1.5 hover:bg-[#f5f5f5] transition ${i < 3 && i < menuItems.length - 3 ? "border-b border-[#e0e0e0]" : ""} ${i % 3 !== 2 ? "border-r border-[#e0e0e0]" : ""}`}>
                  <FontAwesomeIcon icon={item.icon} className="text-[#4CAF50] text-lg" />
                  <span className="text-[11px] text-[#333] font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
