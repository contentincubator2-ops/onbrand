/**
 * AiImageNotice — AI 生成圖片的小警語。
 *
 * 2026-10-02（CJ「只要生成圖時，都要有 AI 生圖，請都提供小警語的圖示，會顯示『本圖片由生成式 AI
 * 技術合成，畫面細節（如手指、背景文字）可能存在不精準或非真實之變形，僅供視覺示意參考。』」）。
 *
 * 一個小圖示＋「AI 生成」，滑過或點一下顯示整句警語（點一下是給手機用的，手機沒有 hover）。
 * 用法：
 *   · <AiImageNotice />                 圖片下方的一行（預設）
 *   · <AiImageNotice overlay />         疊在圖片角落（父層要 relative）
 * 文案只在這裡，改一次全站跟著改。
 */
import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { useLang } from "../../../lib/i18n";

export const AI_IMAGE_NOTICE_ZH = "本圖片由生成式 AI 技術合成，畫面細節（如手指、背景文字）可能存在不精準或非真實之變形，僅供視覺示意參考。";
export const AI_IMAGE_NOTICE_EN = "This image was synthesised with generative AI. Details (such as fingers or background text) may be inaccurate or distorted; it is for visual reference only.";

export default function AiImageNotice({ overlay = false, className = "" }: { overlay?: boolean; className?: string }) {
  const { lang } = useLang();
  const en = lang === "en";
  const text = en ? AI_IMAGE_NOTICE_EN : AI_IMAGE_NOTICE_ZH;
  const [open, setOpen] = React.useState(false);
  return (
    <Popover isOpen={open} onOpenChange={setOpen} placement="top" showArrow>
      <PopoverTrigger>
        <button
          type="button"
          // 「帶版型下載」用 html2canvas 截預覽：警語是畫面上的說明，不能被印進要發出去的圖裡。
          data-html2canvas-ignore="true"
          aria-label={text}
          title={text}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className={`inline-flex items-center gap-1 rounded-full text-[11px] leading-none transition ${
            overlay
              ? "absolute top-2 right-2 z-30 bg-black/55 text-white px-2 py-1 backdrop-blur-sm hover:bg-black/70"
              : "text-default-500 hover:text-foreground px-1 py-0.5"
          } ${className}`}
        >
          <FontAwesomeIcon icon={faCircleInfo} className="text-[10px]" />
          {en ? "AI-generated" : "AI 生成"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[280px] px-3 py-2">
        <p className="text-[12px] leading-relaxed text-default-700">{text}</p>
      </PopoverContent>
    </Popover>
  );
}
