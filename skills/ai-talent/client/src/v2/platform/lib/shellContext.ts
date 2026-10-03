/**
 * shellContext — 外殼（ShellLayout）與各層頁面共用的型別與帳號閘門。
 *
 * 放在 platform 是為了讓策略／內容／成效的頁面不必 import app 層：
 * 頁面用 useOutletContext<ShellOutletCtx>() 拿外殼提供的品牌與範圍，
 * 外殼本身也從這裡取同一份定義。
 */
import type { ScopeState } from "../components/ScopeBar";

// 2026-08-20: 策略 (Strategy) workspace — 品牌大腦's tile strip promoted to
// a left-rail workspace. Originally gated to a 2-account preview list.
//
// 2026-08-21 (CJ「所有用戶左方的mission rail上方，都改成策略和內容可切換
// 的」): graduated from the 2-account preview to every account —
// isStrategyPreviewEmail() now always returns true. The helper (rather than
// inlining `true` at each of its three call sites) stays so a future
// partial-rollout need doesn't require re-threading them again.
// Exported so BrandsPage.tsx's in-page tile strip (hidden once the left rail
// already lists the same 7 sections) can gate on the exact same check —
// two independently-maintained copies of this list is how a user ends up
// with either two switchers or none.
export function isStrategyPreviewEmail(_email?: string | null): boolean {
  return true;
}

// 2026-08-22 (CJ「人設的功能，我只想嘗試在媽爹講故事的帳號」): unlike the
// 策略/內容 switcher above (graduated to everyone), the 人設 tab specifically
// stays gated while it's still being shaken out — real bugs (missing
// brand_integrations table, an unbounded OAuth-callback fetch) turned up in
// the first round of testing. Exported so BrandsPage.tsx's render guard uses
// the exact same check as the nav item, not an independently-drifting copy.
const PERSONA_PREVIEW_EMAILS = ["marketing@momdadstory.com"];
export function isPersonaPreviewEmail(email?: string | null): boolean {
  return PERSONA_PREVIEW_EMAILS.includes(String(email ?? "").toLowerCase());
}

export interface ShellOutletCtx {
  brandId: number | null;
  setBrandId: (id: number | null) => void;
  brands: any[];
  brandsLoaded: boolean;
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  /** 2026-08-20 (Codex review, PR #119): the shell's own resolved
   *  `/api/auth/me` email — child pages that need the strategy-preview
   *  gate must read THIS instead of firing their own independent fetch.
   *  Two separate requests can disagree (one fails transiently while the
   *  other succeeds), leaving the rail and the in-page controls out of
   *  sync with no way to recover short of a reload. Null while the
   *  shell's own fetch hasn't resolved yet. */
  userEmail: string | null;
}
