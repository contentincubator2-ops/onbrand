/**
 * directorDock — 某個頁面把策略總監「收進自己的畫面」時，右下角的總監就不出現。
 *
 * 2026-09-30（CJ「在這個介面上，我偏好是都在左邊完成回答，雖然要換人，但也在同一個地方
 * 換人」）：活動頁的總監在左邊的對話卡裡（CampaignChatCard），同一個人不能同時在右下角
 * 再開一個對話框——兩個框各說各的，脈絡就斷了。
 *
 * 用法：頁面 mount 時 `useEffect(() => dockDirector(), [])`；StrategyDirectorDrawer 用
 * useDirectorDocked() 決定要不要畫。
 */
import React from "react";

let docks = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** 收進來；回傳的函式放掉（給 useEffect 當 cleanup）。 */
export function dockDirector(): () => void {
  docks++;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    docks = Math.max(0, docks - 1);
    emit();
  };
}

export function useDirectorDocked(): boolean {
  return React.useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => docks > 0,
    () => false,
  );
}
