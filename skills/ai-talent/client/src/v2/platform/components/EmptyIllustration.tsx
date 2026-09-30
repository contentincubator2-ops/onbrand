/**
 * 空白頁插畫：跟 sowork.ai 首頁同一套畫風——深藍粗描邊、淺藍底塊、
 * 整張只有一個暖色重點（SoWork 橘）。新增插畫請沿用 INK / PANEL / FILL / POP 四色。
 * 動畫：重點物件加 className="ei-sway"、小動線加 "ei-blink"；使用者關掉動態效果時自動停。
 *
 *   <EmptyIllustration kind="product" />
 */
const INK = "#1F2A44";
const PANEL = "#EDF2F9";
const FILL = "#DCE6F4";
const POP = "#E85D2E";

const MOTION = `
@keyframes ei-sway { 0%,100% { transform: rotate(-5deg) } 50% { transform: rotate(6deg) } }
@keyframes ei-blink { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
.ei-sway { transform-box: fill-box; transform-origin: 0% 100%; animation: ei-sway 2.8s ease-in-out infinite }
.ei-blink { animation: ei-blink 1.8s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) { .ei-sway, .ei-blink { animation: none } }
`;

export function EmptyIllustration({ kind, width = 220 }: { kind: "product" | "event"; width?: number }) {
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
      {kind === "product" ? <EmptyBox /> : <EmptyCalendar />}
    </svg>
  );
}

/** 打開的紙箱，裡面空的，只剩一張價格吊牌。 */
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
      {/* 空氣感的小動線 */}
      <path className="ei-blink" d="M40 40 l6 4 M34 52 h7 M200 38 l-6 5 M206 50 h-7" strokeWidth={2.5} />
    </g>
  );
}

/** 空白的月曆，只有一格被點亮。 */
function EmptyCalendar() {
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const x = 84 + c * 19;
      const y = 72 + r * 19;
      const on = r === 1 && c === 2;
      cells.push(
        <rect key={`${r}-${c}`} x={x} y={y} width="13" height="13" rx="3"
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
      <path className="ei-blink" d="M44 44 l6 4 M38 56 h7 M196 42 l-6 5 M202 54 h-7" strokeWidth={2.5} />
    </g>
  );
}
