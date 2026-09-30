/**
 * LockToggle — 策略層標題右側的手繪鎖頭（定位／文字／視覺 共用）。
 *
 * 2026-09-29（CJ「定案跟鎖定定位其實是相同功能…只留鎖定定位」→「學這張圖的
 * 風格作鎖定動畫」→「在品牌名和標語的右側」→「LOCK ONLY」）：
 * 鎖頭本身就是按鈕，底下一行小字表示狀態（未鎖定／已鎖定），沒有另外的 pill。
 *
 * 動畫只在 `locked` 真的改變時播（伺服器確認鎖定／解鎖之後），首次渲染直接
 * 擺成對應姿勢。關：鎖把轉正 → 落下 → 鎖身「喀」→ 笑臉畫出；開：鎖把彈起 →
 * 往外轉開 → 鎖身輕晃 → 笑臉收回。小字在「喀」那一刻才換，跟畫面同步。
 * prefers-reduced-motion 時直接換姿勢不播。
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

interface Props {
  locked: boolean;
  busy?: boolean;
  onToggle: () => void;
  /** hover 說明（鎖定時間、鎖定後的效果）。 */
  title: string;
  lockedLabel: string;
  unlockedLabel: string;
}

const OPEN   = "translateY(-15px) rotate(-32deg)";
const LIFTED = "translateY(-15px) rotate(0deg)";
const CLOSED = "translateY(0px) rotate(0deg)";

const CLOSE_MS = 620;
const OPEN_MS = 680;
/** 鎖把落進鎖身的時間點（CLOSE_SHACKLE 的 .82） */
const CLICK_AT = 0.82;

const CLOSE_SHACKLE: Keyframe[] = [
  { transform: OPEN,   offset: 0,   easing: "cubic-bezier(.3,0,.2,1)" },
  { transform: LIFTED, offset: .42, easing: "cubic-bezier(.55,0,.9,.4)" },
  { transform: "translateY(1.5px) rotate(0deg)", offset: CLICK_AT, easing: "ease-out" },
  { transform: CLOSED, offset: 1 },
];
const CLOSE_BODY: Keyframe[] = [
  { transform: "none", offset: 0 }, { transform: "none", offset: .8 },
  { transform: "translateY(2.5px) scale(1.03,.94)", offset: .88 },
  { transform: "translateY(-1px) scale(.99,1.02)", offset: .95 },
  { transform: "none", offset: 1 },
];
const OPEN_SHACKLE: Keyframe[] = [
  { transform: CLOSED, offset: 0,   easing: "cubic-bezier(.2,.8,.3,1)" },
  { transform: "translateY(-18px) rotate(0deg)", offset: .32, easing: "ease-in-out" },
  { transform: LIFTED, offset: .45, easing: "cubic-bezier(.3,.1,.3,1.4)" },
  { transform: OPEN,   offset: 1 },
];
const OPEN_BODY: Keyframe[] = [
  { transform: "none", offset: 0 },
  { transform: "rotate(-2.5deg)", offset: .18 }, { transform: "rotate(2deg)", offset: .32 },
  { transform: "rotate(-1deg)", offset: .44 }, { transform: "none", offset: .56 },
  { transform: "none", offset: 1 },
];

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function LockToggle({ locked, busy, onToggle, title, lockedLabel, unlockedLabel }: Props) {
  const uid = useId().replace(/:/g, "");
  const shackleRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const flatRef = useRef<SVGPathElement>(null);
  const smileRef = useRef<SVGPathElement>(null);
  const turbRef = useRef<SVGFETurbulenceElement>(null);
  const prev = useRef(locked);
  // 小字／顏色跟著「喀」換，不是一收到新狀態就換
  const [shown, setShown] = useState(locked);

  // 靜止姿勢由 React style 決定；動畫用 WAAPI 疊在上面（fill: forwards），
  // 結束後 cancel 就露出新的靜止姿勢。用 layout effect 讓動畫在第一次
  // paint 之前就蓋上去，不會先閃一下終點畫面。
  useLayoutEffect(() => {
    if (prev.current === locked) return;
    prev.current = locked;
    const sh = shackleRef.current, body = bodyRef.current, flat = flatRef.current, smile = smileRef.current;
    if (!sh || !body || !flat || !smile || reducedMotion() || typeof sh.animate !== "function") {
      setShown(locked); return;
    }
    const d = locked ? CLOSE_MS : OPEN_MS;
    const f = (duration: number, delay = 0): KeyframeAnimationOptions => ({ duration, delay, fill: "forwards" });
    const anims: Animation[] = [
      sh.animate(locked ? CLOSE_SHACKLE : OPEN_SHACKLE, f(d)),
      body.animate(locked ? CLOSE_BODY : OPEN_BODY, f(d)),
    ];
    if (locked) {
      anims.push(flat.animate([{ opacity: 1 }, { opacity: 0 }], f(120, d * CLICK_AT)));
      anims.push(smile.animate([{ strokeDashoffset: 24 }, { strokeDashoffset: 0 }], { ...f(300, d * .85), easing: "ease-out" }));
    } else {
      anims.push(smile.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 24 }], f(180)));
      anims.push(flat.animate([{ opacity: 0 }, { opacity: 1 }], f(150, 140)));
    }
    const labelTimer = window.setTimeout(() => setShown(locked), locked ? d * CLICK_AT : 0);
    let cancelled = false;
    Promise.all(anims.map(a => a.finished)).then(() => {
      if (!cancelled) anims.forEach(a => a.cancel());
    }).catch(() => { /* cancelled by a newer toggle */ });
    return () => {
      cancelled = true;
      window.clearTimeout(labelTimer);
      anims.forEach(a => a.cancel());
      setShown(locked);
    };
  }, [locked]); // eslint-disable-line react-hooks/exhaustive-deps

  // 手繪線條的「抖動」：約 7fps 換一次雜訊種子
  useEffect(() => {
    if (reducedMotion()) return;
    let seed = 1;
    const t = window.setInterval(() => {
      seed = (seed % 6) + 1;
      turbRef.current?.setAttribute("seed", String(seed));
    }, 150);
    return () => window.clearInterval(t);
  }, []);

  const ink = "#171717";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      title={title}
      aria-pressed={locked}
      aria-label={locked ? lockedLabel : unlockedLabel}
      className="flex flex-col items-center gap-0.5 rounded-xl p-1 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-400 disabled:opacity-60"
    >
      <svg viewBox="0 0 120 120" width={64} height={64} overflow="visible" aria-hidden="true"
        filter={`url(#wobble-${uid})`}>
        <defs>
          <filter id={`wobble-${uid}`} x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence ref={turbRef} type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed="1" />
            <feDisplacementMap in="SourceGraphic" scale="2.4" />
          </filter>
          <clipPath id={`body-${uid}`}><rect x="30" y="54" width="60" height="46" rx="10" /></clipPath>
        </defs>
        <g ref={shackleRef} style={{ transformBox: "view-box", transformOrigin: "43px 56px", transform: locked ? CLOSED : OPEN }}>
          <path d="M43 56 V40 a17 17 0 0 1 34 0 V56" fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" />
        </g>
        <g ref={bodyRef} style={{ transformBox: "view-box", transformOrigin: "60px 100px" }}>
          <rect x="30" y="54" width="60" height="46" rx="10" fill="#fff" />
          <g clipPath={`url(#body-${uid})`}>
            <path d="M26 90 L38 78 M26 98 L42 82 M30 102 L44 88 M37 103 L46 94" stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
          </g>
          <rect x="30" y="54" width="60" height="46" rx="10" fill="none" stroke={ink} strokeWidth={3.2} strokeLinejoin="round" />
          <circle cx="51" cy="72" r="2.6" fill={ink} />
          <circle cx="69" cy="72" r="2.6" fill={ink} />
          <path ref={flatRef} d="M53 83 H67" style={{ opacity: locked ? 0 : 1 }} fill="none" stroke={ink} strokeWidth={2.8} strokeLinecap="round" />
          <path ref={smileRef} d="M52 81 Q60 90 68 81" fill="none" stroke={ink} strokeWidth={2.8} strokeLinecap="round"
            strokeDasharray={24} style={{ strokeDashoffset: locked ? 0 : 24 }} />
        </g>
      </svg>
      <span className="text-[11px] font-semibold whitespace-nowrap transition-colors"
        style={{ color: shown ? "#059669" : "#6B7280" }}>
        {shown ? lockedLabel : unlockedLabel}
      </span>
    </button>
  );
}
