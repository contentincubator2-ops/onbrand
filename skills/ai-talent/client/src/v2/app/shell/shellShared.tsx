/**
 * 外殼各面板共用的常數與小元件。
 */
import React from "react";

export const ICON_W  = 70;

// 2026-05-16 (CJ「進行手機版」): the shell had ZERO mobile breakpoints —
// pages were fine, the frame wasn't. Single source of truth for "is
// this a phone-width viewport" so the hardcoded-px fixed elements
// (brand pill / notif panel / trial bar) stop overflowing on ≤640px.
export function useIsMobile(maxWidth = 640): boolean {
  const [m, setM] = React.useState(
    typeof window !== "undefined" && window.innerWidth <= maxWidth,
  );
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [maxWidth]);
  return m;
}

/** Hash brand name → deterministic HSL color. Each brand gets a unique
 *  signature color used as the pill background; first-letter stays white.
 *  Uses HSL with controlled lightness/saturation so colors stay readable. */
export function brandColor(name: string): { bg: string; bgGradient: string; light: string } {
  if (!name) return { bg: "#18181b", bgGradient: "#171717", light: "rgba(24,24,27,0.10)" };
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  // 2026-09-29：全站去彩色 — 品牌識別色改為 hash 挑一階深灰（白字仍可讀）。
  const ZINC_DARK = ["#18181b", "#27272a", "#3f3f46", "#52525b"];
  const bg = ZINC_DARK[hash % ZINC_DARK.length]!;
  return {
    bg,
    bgGradient: bg,
    light: "rgba(24,24,27,0.06)",
  };
}

// 2026-09-30（CJ 參考 Tesla UI）：顏色只代表「你現在在哪」——選中＝SoWork 橘實心方塊＋白色圖示，
// 其餘單色；圖示下方永遠有字；本週企劃帶進度條（像電量），平台圖示角落顯示這週還沒寫的篇數。
export const SOWORK_ORANGE = "#F37E4A";

export const SOWORK_ORANGE_TEXT = "#B4501F";

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", padding: "4px 8px 2px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {children}
    </p>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />;
}

export function PopupRow({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 12,
      padding: "8px 8px", borderRadius: 10, border: "none", textAlign: "left", cursor: "pointer",
      background: active ? "#f4f4f5" : "none", transition: "background 0.1s",
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f9fafb"; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? "#f4f4f5" : "none"; }}
    >
      {children}
    </button>
  );
}
