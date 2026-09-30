/**
 * 任務 modal → 成品頁的 agent 頭像銜接動畫（2026-09-30 CJ「執行完成後跳到完成頁，
 * 有什麼動畫可以讓 Yawen Yeh 銜接到他在完成頁中出現的位置？然後讓文案展開？」）。
 *
 * 為什麼不用 View Transitions / framer layoutId：modal 關掉、路由換頁，成品頁還要
 * 先抓資料才畫得出主筆頭像（幾百毫秒到一兩秒），兩邊的元素不會同時存在。所以做法是：
 *
 *   1. 起飛 departAgentHandoff()：換頁前在 document.body 放一顆頭像分身（不屬於
 *      React 樹，換頁不會被拆掉），停在 modal 裡頭像原本的位置，輕輕呼吸等待。
 *   2. 降落 landAgentHandoff()：成品頁的主筆頭像一掛上就呼叫，分身飛過去（位置＋
 *      大小），抵達後淡出、真的頭像淡入；回傳 true 代表這次是從 modal 來的，
 *      呼叫端就接著播「文案展開」。
 *   3. 等不到降落點（例如成品頁是舊版、或出錯）→ 8 秒後分身自己淡出，不殘留。
 *
 * 使用者關掉動態效果（prefers-reduced-motion）時完全不做，landAgentHandoff 回 false。
 */

let pending: { el: HTMLElement; timer: number } | null = null;

const reduceMotion = () =>
  typeof window !== "undefined"
  && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function discard(fade = true) {
  if (!pending) return;
  const { el, timer } = pending;
  pending = null;
  window.clearTimeout(timer);
  if (!fade) { el.remove(); return; }
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" })
    .finished.then(() => el.remove(), () => el.remove());
}

/** 從 `from` 元素的位置起飛。src 是降落後要變成的那個頭像（主筆）。 */
export function departAgentHandoff(from: Element | null, src: string) {
  if (typeof document === "undefined" || !from || !src || reduceMotion()) return;
  discard(false);
  const r = from.getBoundingClientRect();
  if (r.width === 0) return;
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed", left: `${r.left}px`, top: `${r.top}px`,
    width: `${r.width}px`, height: `${r.height}px`,
    borderRadius: "9999px", overflow: "hidden", zIndex: "9999",
    pointerEvents: "none", background: "#fff",
    boxShadow: "0 12px 32px rgba(0,0,0,0.18), 0 0 0 3px #E85D2E",
  } as CSSStyleDeclaration);
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" });
  el.appendChild(img);
  document.body.appendChild(el);
  el.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }],
    { duration: 1400, iterations: Infinity, easing: "ease-in-out" },
  );
  pending = { el, timer: window.setTimeout(() => discard(true), 8000) };
}

/** 成品頁沒有主筆面板（策略企劃等）時呼叫，分身直接淡出。 */
export function cancelAgentHandoff() {
  discard(true);
}

/** 成品頁主筆頭像掛上時呼叫。回傳 true＝剛播完（或正在播）銜接動畫。 */
export function landAgentHandoff(target: Element | null): boolean {
  if (!pending || !target) return false;
  const { el, timer } = pending;
  pending = null;
  window.clearTimeout(timer);
  const to = target.getBoundingClientRect();
  if (to.width === 0) { el.remove(); return false; }
  // 降落點在畫面外（手機版主筆面板排在貼文下面）：不硬飛出畫面，分身淡出就好，
  // 文案照樣展開。
  if (to.bottom < 0 || to.top > window.innerHeight) {
    pending = { el, timer: 0 };
    discard(true);
    return true;
  }
  const from = el.getBoundingClientRect();
  el.getAnimations().forEach((a) => a.cancel());
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  const s = to.width / from.width;
  const tgt = target as HTMLElement;
  const prevOpacity = tgt.style.opacity;
  tgt.style.opacity = "0";
  el.style.transformOrigin = "0 0";
  const fly = el.animate(
    [
      { transform: "translate(0,0) scale(1)", boxShadow: "0 12px 32px rgba(0,0,0,0.18), 0 0 0 3px #E85D2E" },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 40}px) scale(${1 + (s - 1) * 0.55})`, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, boxShadow: "0 0 0 0 rgba(0,0,0,0), 0 0 0 0 #E85D2E" },
    ],
    { duration: 720, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
  );
  const settle = () => {
    tgt.style.opacity = prevOpacity;
    tgt.animate([{ transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 260, easing: "ease-out" });
    el.remove();
  };
  fly.finished.then(settle, settle);
  return true;
}
