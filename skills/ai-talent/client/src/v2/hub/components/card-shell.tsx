/**
 * 卡片外框 —— 總管理、品牌、產品三個地方共用的那一種卡。
 *
 * 2026-09-23：第三個地方要用同一種卡的時候抽出來的。前兩處各自有一份幾乎一樣
 * 的 JSX，再複製第三份就是 mockup 推斷那個坑的形狀（兩個沒同步的關鍵字比對器，
 * 改了一邊另一邊不會跟著動）。
 *
 * 骨架照內容層任務卡：圓角、頭部色塊、左上圓形圖示、右上徽章、標題、
 * 「口徑：」一行、一個說明框、底部一列。差別只在頭部色塊裡放什麼——
 * 數字、圖表、或價格，由呼叫端自己決定。
 *
 * 可以是連結（給 `to`）或按鈕（給 `onClick`），因為有些卡是跳頁、有些是開 modal。
 */
import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "../lang";

export interface CardShellProps {
  /** 跳頁用。跟 onClick 二擇一。 */
  to?: string;
  /** 開 modal 用。跟 to 二擇一。 */
  onClick?: () => void;
  accent: string;
  icon: LucideIcon;
  tag: string;
  name: string;
  /** 這個數字／這份資料的口徑。不是「為什麼重要」。 */
  measure: string;
  detail: React.ReactNode;
  /** 底部那一列的動詞，預設「打開」。 */
  action?: string;
  /** 圖表卡要比數字卡高一點。 */
  bandHeight?: number;
  children: React.ReactNode;
}

export default function CardShell({
  to,
  onClick,
  accent,
  icon: Icon,
  tag,
  name,
  measure,
  detail,
  action,
  bandHeight = 130,
  children,
}: CardShellProps) {
  const t = useT();

  const inner = (
    <>
      <div
        className="relative flex flex-col items-center justify-center px-3"
        style={{ height: bandHeight, background: "#F5F4F2", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
      >
        {children}
        <div
          className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full"
          style={{ background: accent }}
        >
          <Icon className="h-3 w-3 text-white" aria-hidden />
        </div>
        <span
          className="absolute right-2 top-2 rounded-full px-2 py-0.5 font-bold text-white shadow-sm"
          style={{ background: accent, fontSize: 11, letterSpacing: "0.06em" }}
        >
          {tag}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="text-small font-semibold text-neutral-900">{name}</div>
        <p className="text-tiny leading-relaxed text-default-500">
          <span className="font-medium text-neutral-600">{t("How it's counted: ", "口徑：")}</span>
          {measure}
        </p>
        <div>
          <span className="inline-flex rounded-lg border px-2 py-1 text-[12px] leading-relaxed text-neutral-600">
            {detail}
          </span>
        </div>
        <div className="mt-auto flex items-center gap-2 border-t border-neutral-100 pt-2">
          <span className="truncate text-[12px] text-neutral-600">{action ?? t("Open", "打開")}</span>
          <ArrowRight
            className="ml-auto h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
      </div>
    </>
  );

  const className =
    "group flex flex-col overflow-hidden rounded-2xl text-left transition hover:scale-[1.02] hover:shadow-lg";
  const style = { border: "1px solid rgba(0,0,0,0.07)", background: "white" } as const;

  if (to) {
    return (
      <Link to={to} className={className} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {inner}
    </button>
  );
}

/** 三個頁面共用的欄數斷點。手機一欄，因為口徑那一行是完整的句子。 */
export const CARD_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
