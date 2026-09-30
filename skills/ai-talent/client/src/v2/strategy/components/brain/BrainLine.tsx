/**
 * BrainLine — 「記憶」tray 的主視覺：一筆畫的線條大腦，線條本身就是容量條。
 *
 * 2026-09-30（CJ「我喜歡這種視覺化、線條的 brain logo，而不是真實的大腦紋路，線條簡單的，
 * 會比較像是 tesla 的設計」）：一條線從腦幹往上繞一圈，畫到哪裡＝記憶用到哪裡。
 * 淺灰是整顆腦（容量），深色是已經記住的部分；快滿變琥珀、超載變紅——顏色只表達狀態。
 */
export type BrainLevel = "ok" | "near" | "over";

/** 一筆畫：腦幹 → 右腦 → 頭頂 → 左腦 → 底部 → 內圈的迴紋，收在腦幹上方。 */
const BRAIN_PATH =
  // 腦幹往上，接到後腦
  "M130,164 C129,152 127,144 126,136 " +
  // 小腦、後腦、頭頂三個起伏、前額、底部，繞一圈回到腦幹
  "C142,134 160,126 168,110 C182,94 182,68 168,52 C162,32 142,22 124,28 " +
  "C112,14 86,12 72,26 C52,22 32,38 32,60 C18,74 22,100 40,108 " +
  "C54,122 78,124 94,116 C106,124 118,132 126,136 " +
  // 內圈一個迴紋（像腦溝），收在中間
  "C122,112 122,90 110,76 C96,60 68,62 66,82 C64,102 94,104 104,86 " +
  "C112,70 132,58 150,66";

const TONE: Record<BrainLevel, string> = { ok: "#171717", near: "#d97706", over: "#dc2626" };

export default function BrainLine({ pct, level, size = 220, ariaLabel }: {
  pct: number; level: BrainLevel; size?: number; ariaLabel: string;
}) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="10 10 180 160" width={size} height={size * (160 / 180)} role="img" aria-label={ariaLabel}>
      <style>{`
        @keyframes bl-draw { from { stroke-dashoffset: ${p}; } to { stroke-dashoffset: 0; } }
        .bl-fill { animation: bl-draw 1.1s cubic-bezier(.2,.7,.2,1) both; }
        @media (prefers-reduced-motion: reduce) { .bl-fill { animation: none; } }
      `}</style>
      <path d={BRAIN_PATH} pathLength={100} fill="none" stroke="#e5e5e5" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      {p > 0 && (
        <path d={BRAIN_PATH} pathLength={100} fill="none" stroke={TONE[level]} strokeWidth={9}
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${p} 100`} className="bl-fill" />
      )}
    </svg>
  );
}
