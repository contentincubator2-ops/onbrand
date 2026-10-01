/**
 * taskModalStyle — 任務卡按下後的彈跳視窗外觀，給其他視窗共用。
 *
 * 2026-09-29（CJ 參考「Your inbox is clear」）：淡彩霧面底、大圓角白卡、置中的一句大標＋
 * 手繪插畫。底色只在遮罩層，卡片本身維持白底黑字。
 * 2026-10-02（CJ「介面設計，參考任務卡按下後，彈跳視窗的設計方式」）：抽出來讓活動時間軸的
 * 節點視窗用同一份——改一處，兩邊一起變。
 */
export const TASK_MODAL_CLASSNAMES = {
  backdrop: "bg-gradient-to-br from-rose-100/70 via-emerald-50/60 to-violet-200/60 backdrop-blur-md",
  base: "max-h-[90vh] rounded-[28px] bg-white shadow-2xl ring-1 ring-black/5",
  body: "pt-2 pb-4 px-6",
  footer: "bg-white pt-2 pb-5 px-6",
  header: "pt-4 pb-3 px-6 bg-white border-b border-default-100",
  closeButton: "top-3.5 right-4 text-default-400 hover:bg-default-100",
};

/** 標題列：圖示＋一行標題（右側留給關閉鈕）。 */
export const TASK_MODAL_HEADER = "flex flex-col items-stretch gap-0 pt-4 pb-3 pl-6 pr-14 border-b border-default-100";
/** 插畫旁的大字問句。 */
export const TASK_MODAL_QUESTION = "min-w-0 text-[20px] leading-snug font-bold text-neutral-900";
/** 大圓角輸入框。 */
export const TASK_MODAL_INPUT = { inputWrapper: "rounded-2xl pl-4 h-12", input: "text-[15px]" };
