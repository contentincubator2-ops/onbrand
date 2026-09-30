/**
 * BrainGlyph — 「記憶」tray 的主視覺：線條大腦，裡面的填色＝記憶用了多少（像電池）。
 *
 * 2026-09-30（CJ「喜歡線條的大腦……線條簡單會比較像 tesla」→「不能直接用該設計，會違反
 * 創作人格權」）：這是我們自己畫的——從正上方看的左右兩個半腦、中間一條縱裂、每邊三道
 * 腦溝，全部用基本曲線構成，不描摹任何既有的 logo。
 * 填色由下往上：空間夠是黑、快滿琥珀、滿了紅——顏色只表達狀態。
 */
export type BrainLevel = "ok" | "near" | "over";

/** 左半腦外框（右半腦用鏡像），中線在 x=60。 */
const HEMI =
  "M57,14 C51,9 42,9 37,14 C27,12 19,19 19,29 C11,35 10,47 15,53 " +
  "C10,61 12,73 20,77 C22,87 32,93 41,88 C47,93 55,92 57,86 Z";
/** 左半腦的三道腦溝。 */
const SULCI = ["M29,34 C36,31 42,36 49,33", "M22,55 C31,51 38,58 48,54", "M31,74 C37,70 43,74 49,70"];

const TONE: Record<BrainLevel, string> = { ok: "#171717", near: "#d97706", over: "#dc2626" };

export default function BrainGlyph({ pct, level, size = 150, ariaLabel }: {
  pct: number; level: BrainLevel; size?: number; ariaLabel: string;
}) {
  const p = Math.max(0, Math.min(100, pct));
  // 填色範圍：大腦的上緣 y≈9 到下緣 y≈93。
  const top = 93 - (84 * p) / 100;
  const mirror = "translate(120,0) scale(-1,1)";
  return (
    <svg viewBox="4 2 112 98" width={size} height={size * (98 / 112)} role="img" aria-label={ariaLabel}>
      <defs>
        <clipPath id="bg-hemis">
          <path d={HEMI} />
          <path d={HEMI} transform={mirror} />
        </clipPath>
        <style>{`
          @keyframes bg-rise { from { transform: translateY(${93 - top}px); } to { transform: translateY(0); } }
          .bg-fill { animation: bg-rise 1s cubic-bezier(.2,.7,.2,1) both; }
          @media (prefers-reduced-motion: reduce) { .bg-fill { animation: none; } }
        `}</style>
      </defs>
      <g clipPath="url(#bg-hemis)">
        <rect className="bg-fill" x="0" y={top} width="120" height={100 - top} fill={TONE[level]} opacity={0.22} />
      </g>
      {[undefined, mirror].map((t, i) => (
        <g key={i} transform={t} fill="none" stroke={TONE[level]} strokeLinecap="round" strokeLinejoin="round">
          <path d={HEMI} strokeWidth={3.2} />
          {SULCI.map((d) => <path key={d} d={d} strokeWidth={2.4} />)}
        </g>
      ))}
    </svg>
  );
}
