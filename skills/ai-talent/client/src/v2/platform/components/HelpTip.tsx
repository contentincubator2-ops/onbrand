/**
 * 「?」說明浮窗：欄位與區塊的說明文字一律收進這裡，不直接攤在畫面上。
 * 滑過或點擊（觸控）都會打開；內容保持 1–3 句。
 *
 *   <h3>品牌色 <HelpTip>AI 生圖時會以這三色為主視覺基調</HelpTip></h3>
 */
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/react";
import { HelpIcon } from "./icons";

export function HelpTip({ children, size = 13, label = "?" }: { children: ReactNode; size?: number; label?: string }) {
  return (
    <Popover placement="top" showArrow triggerScaleOnOpen={false}>
      <PopoverTrigger>
        <button
          type="button"
          aria-label={label}
          className="inline-flex items-center align-middle text-default-400 hover:text-default-700 focus-visible:text-default-700 outline-none"
          style={{ lineHeight: 0, padding: 2 }}
        >
          <HelpIcon size={size} />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="max-w-[260px] px-1 py-1.5 text-[13px] leading-5 text-default-700">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
