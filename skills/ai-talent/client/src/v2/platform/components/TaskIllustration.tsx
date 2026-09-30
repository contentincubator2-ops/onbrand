/**
 * 任務 modal 開頭插畫：每張卡依題目畫不同場景（場景怎麼挑見 taskScene.ts）。
 * 畫風與 EmptyIllustration 同一套：INK 描邊、FILL 底塊、整張只有 POP 一個暖色重點。
 */
import { useEffect, useState, type ComponentType } from "react";
import illustrationIds from "./taskIllustrationIds.json";
import { EmptyIllustration, IllustrationFrame, Sparks, INK, FILL, POP, type EmptyKind } from "./EmptyIllustration";
import { isTaskScene, resolveTaskScene, type TaskScene } from "./taskScene";

/** 跟空白頁共用的幾張圖直接借過來，不重畫。 */
const BORROWED: Partial<Record<TaskScene, EmptyKind>> = {
  calendar: "event",
  photo: "photo",
  profile: "persona",
  brief: "brief",
};

/**
 * 優先序：用戶挑的現成場景 → 自建卡的 AI 圖 → 內建卡的 AI 圖（repo 裡的 webp）
 * → 依題目自動挑的現成場景。圖載不到也退回現成場景，不留破圖。
 */
export function TaskIllustration({
  card, width = 132,
}: {
  card: Parameters<typeof resolveTaskScene>[0] & { id?: string; illustration_url?: string | null };
  width?: number;
}) {
  const [broken, setBroken] = useState(false);
  const picked = isTaskScene(card.scene) ? card.scene : null;
  const src = picked ? null
    : card.illustration_url
      ? card.illustration_url
      : card.id && HAS_IMAGE.has(card.id) ? `/task-illustrations/${card.id}.webp` : null;
  useEffect(() => setBroken(false), [src]);
  if (src && !broken) return <IllustrationImage src={src} width={width} onError={() => setBroken(true)} />;
  return <SceneArt scene={resolveTaskScene(card)} width={width} />;
}

const HAS_IMAGE = new Set<string>(illustrationIds as string[]);

/** AI 插畫的外框跟 SVG 場景同尺寸同圓角，換來換去版面不跳。 */
export function IllustrationImage({ src, width = 132, onError }: { src: string; width?: number; onError?: () => void }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={width}
      height={Math.round((width * 170) / 240)}
      onError={onError}
      loading="lazy"
      style={{ width, height: Math.round((width * 170) / 240), objectFit: "cover", borderRadius: Math.round(width * 18 / 240), background: "#EDF2F9" }}
    />
  );
}

/** 直接畫某個場景（自建卡的場景選單用）。 */
export function SceneArt({ scene, width = 132 }: { scene: TaskScene; width?: number }) {
  const Art = SCENES[scene];
  if (!Art) return <EmptyIllustration kind={BORROWED[scene] ?? "brief"} width={width} />;
  return (
    <IllustrationFrame width={width}>
      <Art />
    </IllustrationFrame>
  );
}

const SCENES: Partial<Record<TaskScene, ComponentType>> = {
  language: Language,
  apology: Apology,
  mascot: Mascot,
  poll: Poll,
  trophy: Trophy,
  countdown: Hourglass,
  gift: Gift,
  data: Scoreboard,
  idea: Bulb,
  stance: Flag,
  local: MapPin,
  research: Magnifier,
  audio: Headphones,
  announce: Megaphone,
  live: LivePhone,
  video: Clapper,
  carousel: Carousel,
  chat: Chat,
  mail: Envelope,
  menu: RichMenu,
  hashtag: Hashtag,
  story: Stories,
  kol: RingLight,
  voice: Microphone,
  web: Browser,
  rewrite: Remix,
  strategy: Target,
};

/** 母語／跨語言：兩個對話框，一個寫 A、一個寫「文」，中間浮一顆心——笨拙但真誠。 */
function Language() {
  return (
    <g>
      <path d="M46 44 h76 a10 10 0 0 1 10 10 v34 a10 10 0 0 1 -10 10 h-50 l-14 12 v-12 h-12 a10 10 0 0 1 -10 -10 v-34 a10 10 0 0 1 10 -10 z" fill="#fff" />
      <path d="M72 88 l12 -32 l12 32 M77 76 h14" />
      <path d="M118 72 h76 a10 10 0 0 1 10 10 v34 a10 10 0 0 1 -10 10 h-12 v12 l-14 -12 h-50 a10 10 0 0 1 -10 -10 v-34 a10 10 0 0 1 10 -10 z" fill={FILL} />
      <path d="M156 80 v5 M142 90 h28 M147 90 c4 14 12 24 24 28 M165 90 c-4 14 -12 24 -24 28" />
      <g className="ei-float">
        <path d="M120 36 c-5 -9 -19 -4 -13 7 l13 11 l13 -11 c6 -11 -8 -16 -13 -7 z" fill={POP} />
      </g>
      <path className="ei-blink" d="M34 60 c-4 6 -4 10 0 12 c4 -2 4 -6 0 -12 z" strokeWidth={2} fill="#fff" />
    </g>
  );
}

/** 道歉／翻車：一顆貼了 OK 繃的心。 */
function Apology() {
  return (
    <g>
      <g className="ei-tilt">
        <path d="M120 136 L74 90 C56 72 66 44 90 44 C104 44 114 54 120 64 C126 54 136 44 150 44 C174 44 184 72 166 90 Z" fill={POP} />
        <g transform="rotate(-28 120 88)">
          <rect x="82" y="76" width="76" height="24" rx="12" fill="#fff" />
          <rect x="108" y="76" width="24" height="24" fill={FILL} />
          <path d="M114 84 h0.1 M126 84 h0.1 M114 92 h0.1 M126 92 h0.1" strokeWidth={3.5} />
        </g>
      </g>
      <Sparks y={46} />
    </g>
  );
}

/** 吉祥物／擬人：一個圓滾滾的小角色在揮手，天線上一顆橘球。 */
function Mascot() {
  return (
    <g>
      <g className="ei-sway">
        <path d="M120 58 C118 46 124 38 130 32" strokeWidth={2.5} />
        <circle cx="132" cy="30" r="7" fill={POP} />
      </g>
      <path d="M76 104 C76 76 96 58 120 58 C144 58 164 76 164 104 C164 128 146 140 120 140 C94 140 76 128 76 104 Z" fill="#fff" />
      <circle cx="106" cy="96" r="4.5" fill={INK} stroke="none" />
      <circle cx="134" cy="96" r="4.5" fill={INK} stroke="none" />
      <ellipse cx="96" cy="110" rx="7" ry="4" fill={FILL} stroke="none" />
      <ellipse cx="144" cy="110" rx="7" ry="4" fill={FILL} stroke="none" />
      <path d="M112 112 q8 7 16 0" strokeWidth={2.5} />
      <path d="M78 110 q-14 0 -18 -12" />
      <g className="ei-tilt">
        <path d="M162 108 q16 -4 20 -22" />
      </g>
      <Sparks l={44} r={204} y={48} />
    </g>
  );
}

/** 投票：一張打了勾的選票正要投進票箱。 */
function Poll() {
  return (
    <g>
      <g className="ei-float">
        <rect x="100" y="34" width="40" height="46" rx="4" fill="#fff" />
        <rect x="108" y="44" width="12" height="12" rx="2" fill={POP} />
        <path d="M110 50 l3 3 l6 -7" stroke="#fff" strokeWidth={2.5} />
        <path d="M124 50 h8 M108 66 h24" strokeWidth={2.5} />
      </g>
      <path d="M70 90 h100 l-6 -12 H76 Z" fill={FILL} />
      <rect x="70" y="90" width="100" height="50" rx="6" fill="#fff" />
      <rect x="98" y="84" width="44" height="6" rx="3" fill={INK} />
      <path d="M100 116 h40" strokeWidth={2.5} />
      <Sparks y={46} />
    </g>
  );
}

/** 挑戰／比賽：獎盃，杯身一顆橘色星。 */
function Trophy() {
  return (
    <g>
      <path d="M86 52 h-14 c0 22 10 30 22 32 M154 52 h14 c0 22 -10 30 -22 32" />
      <path d="M86 42 h68 v26 c0 22 -16 36 -34 36 c-18 0 -34 -14 -34 -36 z" fill="#fff" />
      <path d="M120 58 l4.5 9 l10 1.5 l-7 7 l1.7 10 l-9.2 -4.8 l-9.2 4.8 l1.7 -10 l-7 -7 l10 -1.5 z" fill={POP} strokeWidth={2} />
      <path d="M112 104 h16 v14 h-16 z" fill={FILL} />
      <rect x="94" y="118" width="52" height="16" rx="3" fill={INK} />
      <Sparks y={40} />
    </g>
  );
}

/** 倒數／限時：沙漏，下層的沙是橘色的，一直在漏。 */
function Hourglass() {
  return (
    <g className="ei-tilt">
      <rect x="82" y="32" width="76" height="10" rx="3" fill={INK} />
      <rect x="82" y="132" width="76" height="10" rx="3" fill={INK} />
      <path d="M92 42 C92 70 114 78 114 87 C114 96 92 104 92 132 H148 C148 104 126 96 126 87 C126 78 148 70 148 42 Z" fill="#fff" />
      <path d="M100 58 H140 C136 70 124 76 120 82 C116 76 104 70 100 58 Z" fill={FILL} stroke="none" />
      <path d="M100 128 C104 114 114 110 120 108 C126 110 136 114 140 128 Z" fill={POP} stroke="none" />
      <path className="ei-blink" d="M120 90 V106" strokeWidth={2} stroke={POP} />
    </g>
  );
}

/** 好康／優惠：一個綁橘色緞帶的禮物盒。 */
function Gift() {
  return (
    <g>
      <rect x="80" y="86" width="80" height="54" rx="4" fill="#fff" />
      <g className="ei-float">
        <rect x="72" y="70" width="96" height="18" rx="4" fill={FILL} />
        <rect x="112" y="70" width="16" height="18" fill={POP} />
        <path d="M120 70 c-10 -18 -30 -16 -26 -4 c2 6 14 6 26 4 z M120 70 c10 -18 30 -16 26 -4 c-2 6 -14 6 -26 4 z" fill={POP} />
      </g>
      <rect x="112" y="86" width="16" height="54" fill={POP} />
      <Sparks y={50} />
    </g>
  );
}

/** 數據／成績單：長條圖，最高那根是橘的，箭頭往上。 */
function Scoreboard() {
  return (
    <g>
      <rect x="62" y="40" width="116" height="100" rx="8" fill="#fff" />
      <path d="M76 126 H164" strokeWidth={2.5} />
      <rect x="84" y="100" width="16" height="26" rx="2" fill={FILL} />
      <rect x="112" y="82" width="16" height="44" rx="2" fill={FILL} />
      <rect x="140" y="60" width="16" height="66" rx="2" fill={POP} />
      <g className="ei-float">
        <path d="M80 80 L104 64 L122 70 L150 46" strokeWidth={2.5} />
        <path d="M140 44 h12 v12" strokeWidth={2.5} />
      </g>
    </g>
  );
}

/** 冷知識／技巧：一顆燈泡，燈絲是橘的，四周在閃。 */
function Bulb() {
  return (
    <g>
      <path d="M120 38 C96 38 84 56 84 72 C84 88 98 96 102 108 H138 C142 96 156 88 156 72 C156 56 144 38 120 38 Z" fill="#fff" />
      <path d="M110 100 v-12 q5 -10 10 0 q5 10 10 0 v12" stroke={POP} strokeWidth={3} />
      <rect x="102" y="108" width="36" height="10" rx="3" fill={FILL} />
      <rect x="106" y="118" width="28" height="10" rx="3" fill={FILL} />
      <path d="M112 128 h16 l-3 8 h-10 z" fill={INK} />
      <path className="ei-blink" d="M66 60 h-10 M72 38 l-8 -7 M174 60 h10 M168 38 l8 -7 M120 24 v-8" strokeWidth={2.5} />
    </g>
  );
}

/** 立場／宣言：插在小丘上的一面橘旗。 */
function Flag() {
  return (
    <g>
      <path d="M70 140 C82 116 158 116 170 140 Z" fill={FILL} />
      <path d="M104 126 V30" />
      <circle cx="104" cy="28" r="4" fill={INK} />
      <g className="ei-swing">
        <path d="M104 36 C124 28 136 44 164 36 V78 C136 86 124 70 104 78 Z" fill={POP} />
      </g>
      <Sparks l={44} r={200} y={46} />
    </g>
  );
}

/** 在地／地方驕傲：攤開的地圖上插一根橘色圖釘。 */
function MapPin() {
  return (
    <g>
      <path d="M58 96 L92 84 L128 96 L182 84 V132 L148 144 L112 132 L58 144 Z" fill="#fff" />
      <path d="M92 84 V132 M128 96 V144" strokeWidth={2} />
      <path d="M70 124 c14 -10 30 4 44 -6 s28 0 40 -8" strokeWidth={2} stroke={FILL} />
      <g className="ei-float">
        <path d="M120 112 C108 94 98 82 98 68 C98 56 108 46 120 46 C132 46 142 56 142 68 C142 82 132 94 120 112 Z" fill={POP} />
        <circle cx="120" cy="68" r="8" fill="#fff" />
      </g>
    </g>
  );
}

/** 研究／訪談：放大鏡壓在一張寫滿筆記的紙上。 */
function Magnifier() {
  return (
    <g>
      <rect x="64" y="38" width="80" height="102" rx="6" fill="#fff" />
      <path d="M78 56 h52 M78 70 h52 M78 84 h36 M78 98 h44 M78 112 h28" strokeWidth={2.5} />
      <g className="ei-tilt">
        <circle cx="148" cy="88" r="24" fill={FILL} />
        <path d="M165 105 L186 126" stroke={POP} strokeWidth={9} />
        <circle cx="148" cy="88" r="24" />
      </g>
    </g>
  );
}

/** 聲音／ASMR：一副耳機，音符在旁邊飄。 */
function Headphones() {
  return (
    <g>
      <path d="M78 104 V92 C78 64 96 46 120 46 C144 46 162 64 162 92 V104" strokeWidth={5} />
      <rect x="68" y="96" width="22" height="38" rx="8" fill={POP} />
      <rect x="150" y="96" width="22" height="38" rx="8" fill={POP} />
      <g className="ei-float">
        <path d="M190 64 V42 l14 -4 V60" strokeWidth={2.5} />
        <ellipse cx="186" cy="64" rx="5" ry="4" fill={INK} />
        <ellipse cx="200" cy="60" rx="5" ry="4" fill={INK} />
        <path d="M42 50 V32 l10 -3" strokeWidth={2.5} />
        <ellipse cx="38" cy="50" rx="5" ry="4" fill={INK} />
      </g>
    </g>
  );
}

/** 公告／上線／新聞：一支大聲公，聲波往外擴。 */
function Megaphone() {
  return (
    <g>
      <g className="ei-tilt">
        <rect x="64" y="76" width="22" height="26" rx="4" fill={INK} />
        <path d="M86 76 L148 48 V130 L86 102 Z" fill="#fff" />
        <ellipse cx="148" cy="89" rx="7" ry="41" fill={POP} />
        <path d="M92 104 l6 26 h14 l-6 -22" fill={FILL} />
      </g>
      <path className="ei-blink" d="M170 72 a22 22 0 0 1 0 34 M182 60 a38 38 0 0 1 0 58" strokeWidth={2.5} />
    </g>
  );
}

/** 直播：一支手機，螢幕角落亮著橘色 LIVE，愛心往上冒。 */
function LivePhone() {
  return (
    <g>
      <rect x="88" y="28" width="64" height="116" rx="12" fill="#fff" />
      <rect x="96" y="42" width="48" height="84" rx="4" fill={FILL} />
      <rect x="100" y="47" width="24" height="11" rx="3" fill={POP} stroke="none" />
      <circle cx="105" cy="52.5" r="2" fill="#fff" stroke="none" />
      <circle cx="120" cy="84" r="10" fill="#fff" />
      <path d="M102 124 c2 -14 10 -22 18 -22 s16 8 18 22" fill="#fff" />
      <path d="M112 136 h16" strokeWidth={2.5} />
      <g className="ei-float">
        <path d="M172 76 c-3 -6 -12 -3 -8 4 l8 7 l8 -7 c4 -7 -5 -10 -8 -4 z" fill="#fff" strokeWidth={2} />
        <path d="M184 52 c-2 -4 -8 -2 -5 3 l5 4 l5 -4 c3 -5 -3 -7 -5 -3 z" fill="#fff" strokeWidth={2} />
      </g>
    </g>
  );
}

/** 短影音／腳本：場記板，上臂正要拍下去。 */
function Clapper() {
  return (
    <g>
      <rect x="70" y="72" width="100" height="66" rx="6" fill="#fff" />
      <path d="M84 94 h72 M84 108 h48 M84 122 h60" strokeWidth={2.5} />
      <rect x="70" y="58" width="100" height="16" rx="2" fill={INK} />
      <path d="M84 58 l-8 16 M104 58 l-8 16 M124 58 l-8 16 M144 58 l-8 16 M164 58 l-8 16" stroke="#fff" strokeWidth={3} />
      <g className="ei-sway">
        <g transform="rotate(-14 70 56)">
          <rect x="70" y="40" width="100" height="16" rx="2" fill={POP} />
          <path d="M90 40 l-8 16 M110 40 l-8 16 M130 40 l-8 16 M150 40 l-8 16" stroke="#fff" strokeWidth={3} />
        </g>
      </g>
      <Sparks l={40} r={200} y={40} />
    </g>
  );
}

/** 輪播／相簿：扇形攤開的三張卡，旁邊一顆「下一張」箭頭。 */
function Carousel() {
  return (
    <g>
      <rect x="62" y="50" width="66" height="84" rx="8" fill={FILL} transform="rotate(-12 95 92)" />
      <rect x="86" y="46" width="66" height="84" rx="8" fill="#fff" transform="rotate(-3 119 88)" />
      <rect x="108" y="44" width="66" height="84" rx="8" fill="#fff" transform="rotate(8 141 86)" />
      <g transform="rotate(8 141 86)">
        <rect x="116" y="54" width="50" height="38" rx="3" fill={FILL} />
        <path d="M120 88 l12 -14 l9 9 l7 -6 l14 11" strokeWidth={2} />
        <path d="M118 104 h40 M118 114 h26" strokeWidth={2.5} />
      </g>
      <g className="ei-float">
        <circle cx="190" cy="92" r="13" fill={POP} />
        <path d="M186 85 l7 7 l-7 7" stroke="#fff" strokeWidth={3} />
      </g>
    </g>
  );
}

/** 留言／回覆／私訊：兩個對話框一來一往，第三個正在打字。 */
function Chat() {
  return (
    <g>
      <path d="M50 42 h84 a8 8 0 0 1 8 8 v28 a8 8 0 0 1 -8 8 h-60 l-12 10 v-10 h-12 a8 8 0 0 1 -8 -8 v-28 a8 8 0 0 1 8 -8 z" fill="#fff" />
      <path d="M58 58 h68 M58 70 h44" strokeWidth={2.5} />
      <path d="M190 80 h-76 a8 8 0 0 0 -8 8 v24 a8 8 0 0 0 8 8 h52 l12 10 v-10 h12 a8 8 0 0 0 8 -8 v-24 a8 8 0 0 0 -8 -8 z" fill={FILL} />
      <path d="M116 96 h60 M116 106 h36" strokeWidth={2.5} />
      <g className="ei-float">
        <rect x="150" y="30" width="44" height="24" rx="12" fill={POP} />
        <circle className="ei-blink" cx="162" cy="42" r="2.5" fill="#fff" stroke="none" />
        <circle cx="172" cy="42" r="2.5" fill="#fff" stroke="none" />
        <circle className="ei-blink" cx="182" cy="42" r="2.5" fill="#fff" stroke="none" />
      </g>
    </g>
  );
}

/** Email／電子報：信封，信紙露出一截，封口一顆橘色封蠟。 */
function Envelope() {
  return (
    <g>
      <g className="ei-float">
        <rect x="88" y="36" width="64" height="60" rx="4" fill="#fff" />
        <path d="M98 50 h44 M98 62 h30" strokeWidth={2.5} />
      </g>
      <path d="M66 76 L120 112 L174 76 V138 H66 Z" fill="#fff" />
      <path d="M66 138 L108 104 M174 138 L132 104" strokeWidth={2.5} />
      <path d="M66 76 L120 112 L174 76" />
      <circle cx="120" cy="112" r="9" fill={POP} />
      <Sparks y={50} />
    </g>
  );
}

/** LINE 選單／分眾：手機下半是一排圖文選單，其中一格亮著。 */
function RichMenu() {
  const tiles = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const on = r === 0 && c === 1;
      tiles.push(
        <rect key={`${r}-${c}`} x={97 + c * 16} y={90 + r * 16} width="13" height="13" rx="2"
          fill={on ? POP : FILL} stroke={on ? INK : "none"} strokeWidth={on ? 2 : 0} />,
      );
    }
  }
  return (
    <g>
      <rect x="88" y="28" width="64" height="116" rx="12" fill="#fff" />
      <path d="M98 44 h30 a5 5 0 0 1 5 5 v8 a5 5 0 0 1 -5 5 h-22 l-8 6 v-6 a5 5 0 0 1 -5 -5 v-8 a5 5 0 0 1 5 -5 z" fill={FILL} strokeWidth={2} />
      {tiles}
      <path d="M112 136 h16" strokeWidth={2.5} />
      <Sparks y={46} />
    </g>
  );
}

/** 主題標籤：一塊井字牌，井字是橘的。 */
function Hashtag() {
  return (
    <g>
      <rect x="80" y="44" width="80" height="80" rx="16" fill="#fff" transform="rotate(-6 120 84)" />
      <g className="ei-tilt">
        <path d="M108 60 l-6 50 M136 60 l-6 50 M96 76 h48 M92 96 h48" stroke={POP} strokeWidth={6} />
      </g>
      <Sparks y={46} />
    </g>
  );
}

/** 限時動態：三格直式畫面排開，頂端各有一條進度條，中間那格正在播。 */
function Stories() {
  const frames = [
    { x: 58, fill: FILL, bar: 1 },
    { x: 100, fill: "#fff", bar: 0.5 },
    { x: 142, fill: FILL, bar: 0 },
  ];
  return (
    <g>
      {frames.map((f, i) => (
        <g key={i}>
          <rect x={f.x} y={i === 1 ? 32 : 44} width="40" height={i === 1 ? 104 : 88} rx="7" fill={f.fill} />
          <path d={`M${f.x + 6} ${i === 1 ? 42 : 54} h28`} strokeWidth={2} stroke={FILL} />
          {f.bar > 0 && (
            <path d={`M${f.x + 6} ${i === 1 ? 42 : 54} h${28 * f.bar}`} strokeWidth={2.5} stroke={i === 1 ? POP : INK} />
          )}
        </g>
      ))}
      <circle cx="120" cy="80" r="10" fill={POP} />
      <path d="M117 74 l8 6 l-8 6 z" fill="#fff" stroke="#fff" strokeWidth={1.5} />
      <path d="M108 110 h24 M112 120 h16" strokeWidth={2.5} />
    </g>
  );
}

/** KOL／創作者：環形補光燈架著一支手機，燈圈是亮的。 */
function RingLight() {
  return (
    <g>
      <path d="M120 116 V140 M104 142 L120 128 L136 142" />
      <g className="ei-blink">
        <circle cx="120" cy="72" r="42" stroke={POP} strokeWidth={9} />
      </g>
      <circle cx="120" cy="72" r="42" strokeWidth={2} />
      <rect x="104" y="46" width="32" height="56" rx="6" fill="#fff" />
      <circle cx="120" cy="68" r="7" fill={FILL} />
      <path d="M110 92 c2 -8 6 -12 10 -12 s8 4 10 12" fill={FILL} strokeWidth={2} />
      <path d="M120 102 V116" />
    </g>
  );
}

/** 品牌語氣／話術：一支麥克風，旁邊一個引號。 */
function Microphone() {
  return (
    <g>
      <rect x="102" y="32" width="36" height="62" rx="18" fill="#fff" />
      <path d="M110 50 h20 M110 62 h20 M110 74 h20" strokeWidth={2} stroke={FILL} />
      <path d="M92 76 c0 18 12 30 28 30 s28 -12 28 -30" />
      <path d="M120 106 V128 M100 132 h40" />
      <g className="ei-float">
        <path d="M168 44 c-8 2 -12 8 -12 16 h10 v10 h-12 M186 44 c-8 2 -12 8 -12 16 h10 v10 h-12" fill={POP} stroke={POP} strokeWidth={2} />
      </g>
      <Sparks l={52} r={196} y={100} />
    </g>
  );
}

/** 官網／長文：一個瀏覽器視窗，頂端三顆點，內文一段段排好。 */
function Browser() {
  return (
    <g>
      <rect x="56" y="38" width="128" height="100" rx="8" fill="#fff" />
      <path d="M56 58 V46 a8 8 0 0 1 8 -8 h112 a8 8 0 0 1 8 8 V58 Z" fill={FILL} />
      <circle cx="68" cy="48" r="3" fill={POP} stroke="none" />
      <circle cx="78" cy="48" r="3" fill={INK} stroke="none" />
      <circle cx="88" cy="48" r="3" fill={INK} stroke="none" />
      <rect x="70" y="70" width="44" height="34" rx="3" fill={FILL} />
      <path d="M124 72 h44 M124 84 h36 M124 96 h40 M70 116 h98 M70 126 h70" strokeWidth={2.5} />
      <g className="ei-float">
        <path d="M176 104 l10 26 l5 -10 l11 -4 z" fill={POP} strokeWidth={2.5} />
      </g>
    </g>
  );
}

/** 改寫／一稿多用：一張稿子被兩支循環箭頭圍住。 */
function Remix() {
  return (
    <g>
      <rect x="96" y="50" width="48" height="64" rx="5" fill="#fff" />
      <path d="M104 64 h32 M104 76 h32 M104 88 h20 M104 100 h26" strokeWidth={2.5} />
      <g className="ei-tilt">
        <path d="M78 76 a44 44 0 0 1 74 -34" stroke={POP} strokeWidth={5} />
        <path d="M144 32 l10 10 l-14 4" stroke={POP} strokeWidth={5} />
        <path d="M162 88 a44 44 0 0 1 -74 34" strokeWidth={5} />
        <path d="M96 132 l-10 -10 l14 -4" strokeWidth={5} />
      </g>
    </g>
  );
}

/** 策略／定位：一個靶，一支飛鏢正中紅心。 */
function Target() {
  return (
    <g>
      <circle cx="112" cy="92" r="46" fill="#fff" />
      <circle cx="112" cy="92" r="31" fill={FILL} />
      <circle cx="112" cy="92" r="16" fill="#fff" />
      <circle cx="112" cy="92" r="6" fill={POP} />
      <g className="ei-float">
        <path d="M114 90 L170 44" strokeWidth={3.5} />
        <path d="M162 40 l12 -6 l-4 12 l12 -2 l-8 10" fill={POP} strokeWidth={2.5} />
      </g>
      <Sparks l={46} r={202} y={52} />
    </g>
  );
}
