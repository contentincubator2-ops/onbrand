/**
 * TaskCardShell — 任務卡的**外框與圖片區**。站上只要是「一張任務卡」，就用這個殼。
 *
 * 2026-09-25（CJ「任務卡的格式，我想要跟品牌的任務卡統一格式」）：活動 tray 也要
 * 出任務卡。統一格式如果靠「照抄一份樣式過去」，兩份會各自演化——這在這個 repo
 * 已經發生過（inferMockup 的 FORMAT_RULES 與 RunPage 的 formatFromTaskId 是兩個
 * 互不同步的關鍵字比對器）。所以共用的是**元件**，不是一段可以複製的 class。
 *
 * 只抽外框與圖片區，不抽卡身：卡身跟 PlatformTaskPage 的十幾個區域函式綁在一起
 * （出處 pill、上架日、廣告格式、團隊堆疊…），整個搬過來等於把那一頁重寫一次，
 * 風險遠大於收益。外框＋圖片區才是「看起來是不是同一種卡」的來源：
 *
 *   · 圓角 rounded-2xl、邊框 rgba(0,0,0,0.07)、白底
 *   · 圖片區固定高 130、底色 #F5F4F2、下緣 rgba(0,0,0,0.06)
 *   · hover 放大 1.02 + 陰影
 *
 * 這三行數值原本散在 PlatformTaskPage 裡，現在只有這裡一份。
 */
import type { ReactNode } from "react";
import { Avatar } from "@heroui/react";

export const CARD_SURFACE = "#F5F4F2";
export const CARD_MEDIA_H = 130;
export const CARD_BORDER = "1px solid rgba(0,0,0,0.07)";

export function TaskCardShell({
  onClick, media, children, style, disabled, ariaLabel,
}: {
  onClick?: () => void;
  /** 圖片區的內容（頭像、角標…）。這一區的幾何由殼決定，內容由呼叫端決定。 */
  media: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex flex-col rounded-2xl overflow-hidden text-left transition hover:scale-[1.02] hover:shadow-lg disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none"
      style={{ border: CARD_BORDER, background: "white", ...style }}
    >
      <div
        className="flex items-center justify-center relative"
        style={{ height: CARD_MEDIA_H, background: CARD_SURFACE, borderBottom: "1px solid rgba(0,0,0,0.06)" }}
      >
        {media}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">{children}</div>
    </button>
  );
}

/** 圖片區正中央那顆 agent 頭像——任務卡的主視覺一律是「誰來寫」。 */
export function TaskCardAvatar({ src }: { src: string }) {
  return <Avatar src={src} size="lg" isBordered color="default" className="w-20 h-20 ring-2 ring-white/60" />;
}
