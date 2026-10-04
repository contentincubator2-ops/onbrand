/**
 * ConvertingToAIFormat — 定位文件上傳後「正在轉換成 AI 格式」的等待動畫。
 *
 * 2026-10-03（CJ「產品定位也要能上傳定位文件或純文字，解析過程想增加動畫，稱為
 * 正在轉換成AI格式」）：上傳 → 抽取結構 → LLM 對映欄位要花十幾秒，原本只有按鈕上
 * 一個小轉圈，用戶看不出系統在做什麼。這裡把三個階段攤開：
 * 左邊是用戶的文件（一疊文字行），中間的點流向右邊，右邊的欄位方塊逐格亮起，
 * 代表「自由格式的文字被拆成 AI 讀得懂的欄位」。
 *
 * 單色線條（呼應全站 B&W 設計）；動畫純 CSS，prefers-reduced-motion 時停止移動、
 * 只留文字。階段文案是定時輪播，不假裝是真實進度——後端沒有回報進度。
 */
import React from "react";
import { useLang } from "../../../../lib/i18n";

const STAGES = {
  zh: ["讀取文件內容…", "拆解標題與段落…", "辨識定位欄位…", "逐字對照原文…"],
  en: ["Reading your document…", "Splitting headings and sections…", "Recognising positioning fields…", "Checking every value against the source…"],
};

const FIELD_COUNT = 6;
const LINE_WIDTHS = [92, 78, 86, 64, 90, 72, 56];

interface Props {
  fileName?: string;
  /** 覆寫標題／階段文案／底部提示——讓其他「把文字變成 AI 可用結構」的等待共用這個動畫。 */
  title?: string;
  stages?: string[];
  hint?: string;
}

export default function ConvertingToAIFormat({ fileName, title, stages: stagesOverride, hint }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const stages = stagesOverride ?? (en ? STAGES.en : STAGES.zh);
  const [stage, setStage] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), 3200);
    return () => clearInterval(t);
  }, [stages.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-medium border border-divider bg-content1 px-6 py-10 flex flex-col items-center gap-6"
    >
      <style>{`
        @keyframes ctai-line { 0%, 100% { opacity: .25; transform: scaleX(.55); } 50% { opacity: 1; transform: scaleX(1); } }
        @keyframes ctai-flow { 0% { transform: translateX(0); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translateX(var(--ctai-dist, 96px)); opacity: 0; } }
        @keyframes ctai-field { 0%, 100% { border-color: #d4d4d8; background: transparent; } 40%, 60% { border-color: #171717; background: #f4f4f5; } }
        @keyframes ctai-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
        @media (prefers-reduced-motion: reduce) {
          .ctai-anim { animation: none !important; }
        }
      `}</style>

      <div className="flex items-center gap-3 sm:gap-5">
        {/* 左：用戶自己的文件，一疊文字行 */}
        <div className="w-[110px] sm:w-[128px] rounded-md border-2 border-neutral-800 bg-white p-3 flex flex-col gap-2" aria-hidden>
          {LINE_WIDTHS.map((w, i) => (
            <span
              key={i}
              className="ctai-anim block h-[5px] rounded-full bg-neutral-700 origin-left"
              style={{ width: `${w}%`, animation: `ctai-line 2.4s ease-in-out ${i * 0.18}s infinite` }}
            />
          ))}
        </div>

        {/* 中：流動的點 */}
        <div className="relative w-[64px] sm:w-[96px] h-[60px]" aria-hidden style={{ ["--ctai-dist" as any]: "80px" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="ctai-anim absolute left-0 w-[7px] h-[7px] rounded-full bg-neutral-900"
              style={{ top: 6 + (i % 3) * 22, animation: `ctai-flow 2.2s ease-in-out ${i * 0.42}s infinite` }}
            />
          ))}
        </div>

        {/* 右：AI 格式的欄位方塊 */}
        <div className="grid grid-cols-2 gap-2" aria-hidden>
          {Array.from({ length: FIELD_COUNT }).map((_, i) => (
            <span
              key={i}
              className="ctai-anim block w-[42px] sm:w-[52px] h-[26px] rounded-[6px] border-2 border-neutral-300"
              style={{ animation: `ctai-field 3s ease-in-out ${i * 0.45}s infinite` }}
            />
          ))}
        </div>
      </div>

      <div className="text-center">
        <p className="text-medium font-semibold text-default-900">
          {title ?? (en ? "Converting to AI format" : "正在轉換成 AI 格式")}
        </p>
        <p className="text-small text-default-600 mt-1 min-h-[20px]" key={stage}>{stages[stage]}</p>
        {fileName && <p className="text-tiny text-default-400 mt-1 truncate max-w-[320px]">{fileName}</p>}
      </div>

      <div className="relative h-[3px] w-48 overflow-hidden rounded-full bg-neutral-200" aria-hidden>
        <span className="ctai-anim absolute inset-y-0 left-0 w-1/3 rounded-full bg-neutral-900" style={{ animation: "ctai-bar 1.6s ease-in-out infinite" }} />
      </div>

      <p className="text-tiny text-default-400 text-center max-w-[360px]">
        {hint ?? (en
          ? "Takes about 10–30 seconds. Nothing is written to your positioning until you confirm."
          : "約需 10–30 秒。轉換完成後由你確認，確認前不會寫進任何定位欄位。")}
      </p>
    </div>
  );
}
