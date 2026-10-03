/**
 * 圖片任務卡的卡片外觀——沿用 TaskCardShell（同一種卡），圖片區畫出這個規格的
 * 實際比例外框，讓用戶一眼看出「直的、方的、寬的」。
 */
import { TaskCardShell, CARD_MEDIA_H } from "../../../platform/components/TaskCardShell";
import { useLang } from "../../../../lib/i18n";
import type { ImageCardInfo } from "../../../platform/lib/imageCardHandoff";

export function RatioFrame({ width, height, box = CARD_MEDIA_H - 34 }: { width: number; height: number; box?: number }) {
  const r = width / height;
  const w = r >= 1 ? box * 1.5 : box * r;
  const h = r >= 1 ? Math.min(box, (box * 1.5) / r) : box;
  return (
    <div
      aria-hidden
      style={{ width: Math.round(w), height: Math.round(h), border: "1.5px solid #A3A3A3", borderRadius: 4, background: "white" }}
    />
  );
}

export default function ImageCardTile({ card, onOpen }: { card: ImageCardInfo; onOpen: () => void }) {
  const { lang } = useLang();
  return (
    <TaskCardShell
      onClick={onOpen}
      ariaLabel={lang === "en" ? card.labelEn : card.labelZh}
      media={
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
          <RatioFrame width={card.width} height={card.height} />
          <span className="text-[11px] text-default-500 tabular-nums">
            {card.ratio} · {card.width}×{card.height}
          </span>
        </div>
      }
    >
      <div className="text-left">
        <p className="text-small font-semibold text-default-900">{lang === "en" ? card.labelEn : card.labelZh}</p>
        <p className="text-tiny text-default-500 mt-1 leading-relaxed line-clamp-2">
          {lang === "en" ? card.descEn : card.descZh}
        </p>
        {card.maxImages > 1 && (
          <p className="text-[11px] text-default-400 mt-1.5">
            {lang === "en" ? `Up to ${card.maxImages} images` : `最多 ${card.maxImages} 張`}
          </p>
        )}
      </div>
    </TaskCardShell>
  );
}
