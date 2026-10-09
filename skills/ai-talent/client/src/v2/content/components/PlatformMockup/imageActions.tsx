/**
 * imageActions — 貼文預覽裡「這張圖從哪來」的入口：AI 生成／上傳／素材庫／Canva。
 *
 * 2026-10-10（CJ「將上傳素材、連結 CANVA 還有 AI 生成等圖示，直接做在圖像示意的旁邊」）。
 * 在這之前入口是右欄裡的一列文字，離圖很遠。現在：
 *   · 還沒有圖 → 圖片格本身就是入口，圖示排在正中間（ImageActionTiles）
 *   · 已經有圖 → 縮成圖右上角一排小圖示，不擋圖（ImageActionBar）
 *
 * 由 PlatformMockup 外層用 context 往下傳，27 個平台外框不必各自多收一個 prop。
 * 兩種呈現都標 data-html2canvas-ignore——「帶版型下載」不能把按鈕截進要發出去的圖裡。
 */
import React from "react";
import { Spinner, Tooltip } from "@heroui/react";
import { Icon, type IconName } from "../../../platform/components/icons";

export interface ImageAction {
  id: string;
  icon: IconName;
  label: string;
  onClick: () => void;
  busy?: boolean;
}

export const ImageActionsContext = React.createContext<ImageAction[] | null>(null);
export const useImageActions = () => React.useContext(ImageActionsContext);

const stop = (fn: () => void) => (e: React.SyntheticEvent) => { e.stopPropagation(); fn(); };

/** 空的圖片格正中間：圖示＋名稱，一眼看得出有哪幾種做法。 */
export function ImageActionTiles({ actions, dark = false }: { actions: ImageAction[]; dark?: boolean }) {
  const anyBusy = actions.some((a) => a.busy);
  return (
    <div data-html2canvas-ignore="true" className="relative z-20 flex flex-wrap items-start justify-center gap-2">
      {actions.map((a) => (
        <button key={a.id} type="button" disabled={anyBusy} onClick={stop(a.onClick)}
          onKeyDown={(e) => e.stopPropagation()}
          className={`flex w-[58px] flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-[10px] leading-none transition disabled:opacity-50 ${
            dark ? "bg-white/90 text-default-900 hover:bg-white" : "border border-default-300 bg-white text-default-700 hover:border-default-500"
          }`}>
          {a.busy ? <Spinner size="sm" classNames={{ wrapper: "w-4 h-4" }} /> : <Icon name={a.icon} size={16} />}
          <span className="whitespace-nowrap">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

/** 已經有圖：右上角一排小圖示，滑過顯示名稱。 */
export function ImageActionBar({ actions, style }: { actions: ImageAction[]; style?: React.CSSProperties }) {
  const anyBusy = actions.some((a) => a.busy);
  return (
    <div data-html2canvas-ignore="true" style={style}
      className="absolute z-30 flex items-center gap-0.5 rounded-full bg-white/90 p-0.5 shadow-sm ring-1 ring-black/10 backdrop-blur-sm">
      {actions.map((a) => (
        <Tooltip key={a.id} content={a.label} placement="bottom" delay={200} closeDelay={0}>
          <button type="button" aria-label={a.label} disabled={anyBusy} onClick={stop(a.onClick)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-default-700 transition hover:bg-default-200 disabled:opacity-50">
            {a.busy ? <Spinner size="sm" classNames={{ wrapper: "w-3.5 h-3.5" }} /> : <Icon name={a.icon} size={13} />}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * 圖在外框裡的哪裡，每個平台都不一樣——量出那張 <img> 的位置，把小圖示列貼在它的右上角。
 * 找不到（外框沒畫出這張圖）就貼在整個預覽的右上角。
 */
export function useImageCorner(containerRef: React.RefObject<HTMLElement | null>, imageUrl: string | null | undefined, enabled: boolean) {
  const [pos, setPos] = React.useState<{ top: number; right: number }>({ top: 8, right: 8 });
  React.useLayoutEffect(() => {
    const box = containerRef.current;
    if (!enabled || !box || !imageUrl) return;
    const measure = () => {
      const img = Array.from(box.querySelectorAll("img")).find((el) => el.getAttribute("src") === imageUrl);
      if (!img) { setPos({ top: 8, right: 8 }); return; }
      const b = box.getBoundingClientRect();
      const r = img.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) { setPos({ top: 8, right: 8 }); return; }
      const next = { top: Math.max(0, Math.round(r.top - b.top) + 8), right: Math.max(0, Math.round(b.right - r.right) + 8) };
      setPos((cur) => (cur.top === next.top && cur.right === next.right ? cur : next));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    // 圖載入完高度才定下來。
    box.addEventListener("load", measure, true);
    return () => { ro?.disconnect(); box.removeEventListener("load", measure, true); };
  }, [containerRef, imageUrl, enabled]);
  return pos;
}
