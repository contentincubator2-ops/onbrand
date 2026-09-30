/**
 * 空白頁插畫：跟 sowork.ai 首頁同一套畫風——深藍粗描邊、淺藍底塊、
 * 整張只有一個暖色重點（SoWork 橘）。新增插畫請沿用 INK / PANEL / FILL / POP 四色。
 * 動畫 class：ei-sway（底部為支點）、ei-swing（頂部為支點）、ei-tilt（中心）、
 * ei-float（上下浮）、ei-blink（閃）；使用者關掉動態效果時自動停。
 *
 * 空白頁一律「插畫＋一句標題＋一個按鈕」，不放說明副標：
 *   <IllustratedEmpty kind="product" title="箱子還是空的" action={{ label: "＋新增產品", onPress: add }} />
 */
import type { ComponentType, ReactNode } from "react";

export const INK = "#1F2A44";
export const PANEL = "#EDF2F9";
export const FILL = "#DCE6F4";
export const POP = "#F37E4A";

const MOTION = `
@keyframes ei-rock { 0%,100% { transform: rotate(-5deg) } 50% { transform: rotate(6deg) } }
@keyframes ei-rock-sm { 0%,100% { transform: rotate(-3deg) } 50% { transform: rotate(3deg) } }
@keyframes ei-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
@keyframes ei-fade { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
.ei-sway, .ei-swing, .ei-tilt { transform-box: fill-box }
.ei-sway { transform-origin: 0% 100%; animation: ei-rock 2.8s ease-in-out infinite }
.ei-swing { transform-origin: 50% 0%; animation: ei-rock-sm 3.2s ease-in-out infinite }
.ei-tilt { transform-origin: 50% 50%; animation: ei-rock-sm 3.6s ease-in-out infinite }
.ei-float { animation: ei-bob 2.6s ease-in-out infinite }
.ei-blink { animation: ei-fade 1.8s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) { .ei-sway, .ei-swing, .ei-tilt, .ei-float, .ei-blink { animation: none } }
`;

export type EmptyKind =
  | "product" | "event" | "projects" | "cards" | "clock" | "meeting"
  | "persona" | "photo" | "folder" | "lens" | "report" | "review" | "brief";

const ART: Record<EmptyKind, ComponentType> = {
  product: EmptyBox,
  event: EmptyCalendar,
  projects: EmptyFrame,
  cards: EmptyCards,
  clock: IdleClock,
  meeting: EmptyMeeting,
  persona: EmptyBadge,
  photo: EmptyCamera,
  folder: EmptyFolder,
  lens: Telescope,
  report: EmptyReport,
  review: EmptyTray,
  brief: BriefNote,
};

export function EmptyIllustration({ kind, width = 220 }: { kind: EmptyKind; width?: number }) {
  const Art = ART[kind];
  return (
    <IllustrationFrame width={width}>
      <Art />
    </IllustrationFrame>
  );
}

/** 共用畫框：淺藍圓角底＋地面陰影＋動畫樣式。任務卡插畫（TaskIllustration）也用這個。 */
export function IllustrationFrame({ width, children }: { width: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 240 170"
      width={width}
      height={(width * 170) / 240}
      role="img"
      aria-hidden="true"
      fill="none"
      stroke={INK}
      strokeWidth={3}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <style>{MOTION}</style>
      <rect x="0" y="0" width="240" height="170" rx="18" fill={PANEL} stroke="none" />
      <ellipse cx="120" cy="146" rx="62" ry="7" fill={FILL} stroke="none" />
      {children}
    </svg>
  );
}

/** 插畫＋一句標題＋一個按鈕。size="sm" 給面板內的小區塊用。 */
export function IllustratedEmpty({
  kind, title, action, note, size = "lg",
}: {
  kind: EmptyKind;
  title: ReactNode;
  action?: { label: ReactNode; onPress: () => void };
  /** 只在「空的原因」用戶必須知道時才放（例如方案限制），不是說明副標。 */
  note?: ReactNode;
  size?: "lg" | "sm";
}) {
  const lg = size === "lg";
  return (
    <div className={`flex flex-col items-center text-center ${lg ? "py-10" : "py-6"}`}>
      <EmptyIllustration kind={kind} width={lg ? 220 : 160} />
      <p className={`${lg ? "mt-6 text-lg" : "mt-4 text-[15px]"} font-semibold text-neutral-800`}>{title}</p>
      {note ? <div className="mt-1.5 text-xs text-neutral-500">{note}</div> : null}
      {action ? (
        <button
          onClick={action.onPress}
          className={`${lg ? "mt-6 text-sm px-6 py-2.5" : "mt-4 text-[13px] px-5 py-2"} rounded-lg bg-neutral-900 text-white font-medium hover:bg-neutral-700 transition`}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export const Sparks = ({ l = 40, r = 200, y = 40 }: { l?: number; r?: number; y?: number }) => (
  <path className="ei-blink" strokeWidth={2.5}
    d={`M${l} ${y} l6 4 M${l - 6} ${y + 12} h7 M${r} ${y - 2} l-6 5 M${r + 6} ${y + 10} h-7`} />
);

/** 產品：打開的紙箱，裡面空的，只剩一張價格吊牌。 */
function EmptyBox() {
  return (
    <g>
      {/* 吊牌：線垂進箱子裡，以箱口為支點擺動 */}
      <g className="ei-sway">
        <path d="M126 76 C128 66 132 58 136 50" strokeWidth={2} />
        <g transform="rotate(18 142 38)">
          <path d="M128 30 h24 a4 4 0 0 1 4 4 v14 a4 4 0 0 1 -4 4 h-24 l-8 -11 z" fill={POP} />
          <circle cx="128.5" cy="41" r="2.4" fill="#fff" />
          <path d="M137 37 h12 M137 45 h8" strokeWidth={2} />
        </g>
      </g>
      {/* 箱口內部（深色）＋兩片外翻的蓋子 */}
      <path d="M66 84 L174 84 L162 68 L78 68 Z" fill={INK} />
      <path d="M66 84 L78 68 L50 58 L36 76 Z" fill={FILL} />
      <path d="M174 84 L162 68 L192 56 L204 74 Z" fill={FILL} />
      {/* 箱身 */}
      <path d="M66 84 L174 84 L168 142 L72 142 Z" fill="#fff" />
      <rect x="102" y="102" width="36" height="20" rx="3" fill={FILL} />
      <path d="M108 109 h24 M108 115 h14" strokeWidth={2} />
      <Sparks />
    </g>
  );
}

/** 活動：空白的月曆，只有一格被點亮。 */
function EmptyCalendar() {
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const on = r === 1 && c === 2;
      cells.push(
        <rect key={`${r}-${c}`} x={84 + c * 19} y={72 + r * 19} width="13" height="13" rx="3"
          fill={on ? POP : FILL} stroke={on ? INK : "none"} strokeWidth={on ? 2 : 0} />,
      );
    }
  }
  return (
    <g>
      <rect x="72" y="40" width="96" height="104" rx="10" fill="#fff" />
      <path d="M72 62 V50 a10 10 0 0 1 10 -10 h76 a10 10 0 0 1 10 10 V62 Z" fill={INK} />
      <rect x="92" y="32" width="6" height="16" rx="3" fill="#fff" />
      <rect x="142" y="32" width="6" height="16" rx="3" fill="#fff" />
      {cells}
      <Sparks l={44} r={196} y={44} />
    </g>
  );
}

/** 專案：牆上掛著一個空畫框，輕輕晃。 */
function EmptyFrame() {
  return (
    <g>
      <g className="ei-swing">
        <path d="M120 30 L90 64 M120 30 L150 64" strokeWidth={2} />
        <rect x="78" y="62" width="84" height="66" rx="5" fill="#fff" />
        <rect x="89" y="73" width="62" height="44" rx="2" fill={FILL} />
        <path d="M97 109 l14 -16 l10 10 l8 -7 l14 13" strokeWidth={2} />
      </g>
      <circle cx="120" cy="30" r="5" fill={POP} />
      <Sparks />
    </g>
  );
}

/** 任務卡：一疊空卡，最上面那張浮起來，等著被加上去。 */
function EmptyCards() {
  return (
    <g>
      <rect x="66" y="78" width="86" height="58" rx="8" fill={FILL} transform="rotate(-8 109 107)" />
      <rect x="82" y="80" width="86" height="58" rx="8" fill="#fff" transform="rotate(5 125 109)" />
      <g className="ei-float">
        <rect x="76" y="40" width="88" height="60" rx="8" fill="#fff" />
        <circle cx="120" cy="70" r="13" fill={POP} />
        <path d="M120 63 v14 M113 70 h14" stroke="#fff" strokeWidth={3} />
      </g>
      <Sparks />
    </g>
  );
}

/** 行事曆本月無排程：一個閒著的鬧鐘，旁邊冒 z。 */
function IdleClock() {
  return (
    <g>
      <path d="M96 128 l-8 12 M144 128 l8 12" />
      <g className="ei-tilt">
        <path d="M82 62 a14 14 0 0 1 22 -12 z" fill={INK} />
        <path d="M158 62 a14 14 0 0 0 -22 -12 z" fill={INK} />
        <circle cx="120" cy="94" r="38" fill="#fff" />
        <circle cx="120" cy="94" r="29" fill={FILL} stroke="none" />
        <path d="M120 94 V74 M120 94 h14" />
        <circle cx="120" cy="94" r="4" fill={POP} />
      </g>
      <path className="ei-blink" d="M170 46 h10 l-10 12 h10 M186 30 h7 l-7 8 h7" strokeWidth={2.5} />
    </g>
  );
}

/** 會議：空的會議桌，兩張椅子沒人坐，只有一杯冒煙的咖啡。 */
function EmptyMeeting() {
  return (
    <g>
      <path d="M40 66 V140 M40 112 H62 V140" />
      <path d="M200 66 V140 M200 112 H178 V140" />
      <rect x="62" y="92" width="116" height="10" rx="3" fill={INK} />
      <path d="M76 102 V140 M164 102 V140" />
      <rect x="110" y="70" width="20" height="22" rx="3" fill={POP} />
      <path d="M130 76 a6 6 0 0 1 0 10" strokeWidth={2.5} />
      <path className="ei-blink" d="M114 60 c-3 -5 3 -8 0 -13 M124 60 c-3 -5 3 -8 0 -13" strokeWidth={2.5} />
    </g>
  );
}

/** 人設：一張空白名牌掛在掛繩上晃。 */
function EmptyBadge() {
  return (
    <g>
      <g className="ei-swing">
        <path d="M100 14 L116 50 M140 14 L124 50" strokeWidth={2.5} />
        <rect x="112" y="46" width="16" height="10" rx="2" fill={INK} />
        <rect x="84" y="54" width="72" height="86" rx="8" fill="#fff" />
        <path d="M84 70 V62 a8 8 0 0 1 8 -8 h56 a8 8 0 0 1 8 8 V70 Z" fill={POP} />
        <circle cx="120" cy="92" r="13" fill={FILL} />
        <path d="M100 128 h40 M106 118 h28" strokeWidth={2.5} />
      </g>
      <Sparks y={50} />
    </g>
  );
}

/** 照片：一台相機，閃光燈在閃，但還沒拍到任何東西。 */
function EmptyCamera() {
  return (
    <g>
      <path d="M92 64 l8 -12 h40 l8 12" fill="#fff" />
      <rect x="62" y="64" width="116" height="74" rx="10" fill="#fff" />
      <circle cx="120" cy="101" r="25" fill={FILL} />
      <circle cx="120" cy="101" r="12" fill={INK} />
      <rect x="148" y="74" width="18" height="9" rx="2" fill={POP} />
      <path className="ei-blink" d="M172 58 l8 -8 M180 70 h10 M166 48 v-10" strokeWidth={2.5} />
    </g>
  );
}

/** 定位文件：一個空資料夾。 */
function EmptyFolder() {
  return (
    <g>
      <path d="M64 136 V58 a4 4 0 0 1 4 -4 h32 l10 12 h62 a4 4 0 0 1 4 4 V136 Z" fill={FILL} />
      <g className="ei-float">
        <rect x="92" y="46" width="52" height="40" rx="3" fill="#fff" />
        <path d="M102 58 h32 M102 68 h22" strokeWidth={2.5} />
      </g>
      <path d="M58 84 h124 l-8 54 H66 Z" fill="#fff" />
      <rect x="106" y="102" width="28" height="10" rx="3" fill={POP} />
      <Sparks />
    </g>
  );
}

/** 成效視角：一支望遠鏡，還在找方向。 */
function Telescope() {
  return (
    <g>
      <path d="M120 100 L96 140 M120 100 L120 142 M120 100 L144 140" />
      <g className="ei-tilt">
        <g transform="rotate(-18 120 90)">
          <rect x="62" y="82" width="12" height="18" rx="2" fill={INK} />
          <rect x="72" y="78" width="84" height="26" rx="6" fill="#fff" />
          <rect x="154" y="72" width="16" height="38" rx="4" fill={POP} />
        </g>
      </g>
      <circle cx="120" cy="100" r="5" fill={INK} />
      <path className="ei-blink" d="M186 30 v12 M180 36 h12 M204 54 v8 M200 58 h8" strokeWidth={2.5} />
    </g>
  );
}

/** 月報：空白報表夾，一支筆在旁邊點。 */
function EmptyReport() {
  return (
    <g>
      <rect x="72" y="38" width="86" height="104" rx="8" fill="#fff" />
      <rect x="99" y="30" width="32" height="14" rx="4" fill={INK} />
      <path d="M88 124 V64 M88 124 H144" strokeWidth={2.5} />
      <rect x="96" y="104" width="10" height="16" rx="2" fill={FILL} stroke="none" />
      <rect x="112" y="92" width="10" height="28" rx="2" fill={FILL} stroke="none" />
      <rect x="128" y="80" width="10" height="40" rx="2" fill={FILL} stroke="none" />
      <g className="ei-float">
        <g transform="rotate(30 178 88)">
          <rect x="172" y="44" width="13" height="54" rx="2" fill={POP} />
          <path d="M172 98 l6.5 13 l6.5 -13 Z" fill="#fff" />
        </g>
      </g>
    </g>
  );
}

/** 審核佇列：空的文件盤，上方一個打勾——沒有待辦是好消息。 */
function EmptyTray() {
  return (
    <g>
      <path d="M60 104 L78 76 H162 L180 104 V138 H60 Z" fill="#fff" />
      <path d="M60 104 H96 l6 10 h36 l6 -10 H180" />
      <g className="ei-float">
        <circle cx="120" cy="48" r="17" fill={POP} />
        <path d="M112 48 l6 6 l11 -12" stroke="#fff" strokeWidth={3.5} />
      </g>
      <Sparks y={44} />
    </g>
  );
}

/** 任務 modal 開頭：一張等你寫的便條，筆浮在旁邊點——不是空白頁，是「開始吧」。 */
function BriefNote() {
  return (
    <g>
      <rect x="70" y="50" width="84" height="92" rx="8" fill={FILL} transform="rotate(-6 112 96)" />
      <rect x="80" y="44" width="84" height="92" rx="8" fill="#fff" />
      <path d="M94 66 h56 M94 80 h56 M94 94 h34" strokeWidth={2.5} />
      <circle cx="102" cy="116" r="4" fill={POP} stroke="none" />
      <path d="M112 116 h30" strokeWidth={2.5} />
      <g className="ei-float">
        <g transform="rotate(35 184 72)">
          <rect x="178" y="30" width="13" height="54" rx="2" fill={POP} />
          <path d="M178 84 l6.5 13 l6.5 -13 Z" fill="#fff" />
        </g>
      </g>
      <Sparks l={46} r={206} y={40} />
    </g>
  );
}
