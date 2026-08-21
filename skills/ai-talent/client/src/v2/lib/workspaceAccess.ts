/**
 * workspaceAccess — 哪個帳號看得到哪些工作區（左側 rail 的切換器）。
 *
 * 2026-08-21 (CJ「媽爹講故事的左方 mission rail 也要改成這樣，有個切換按鈕，
 * 可以切換策略和內容」)。
 *
 * 在此之前這件事是一個寫死在兩個檔案裡的 email 比對
 * （ShellLayout 的 isPrivatePreview + BrandsPage 的同名 state），而且是
 * 全有全無 —— 要嘛四個工作區全開，要嘛完全沒有切換器。媽爹講故事只需要
 * 策略 + 內容：市場情報與成效儀表板背後的 /market-intel、/performance 頁面
 * 本來就只開放 sowork@sowork.tw，給了入口只會撞到「此功能目前只開放…」。
 *
 * 所以改成 per-account 的清單。要開給下一個客戶就是這裡加一行，
 * 不用再回去改 rail 或 BrandsPage 的判斷。
 *
 * 兩邊共用同一個函式是刻意的：ShellLayout 用它決定 rail 與切換器，
 * BrandsPage 用它決定要不要隱藏頁內的 tile 列。兩者若各自比對 email 而
 * 漂移，使用者會拿到兩個切換器、或一個都沒有。
 */
export type WorkspaceMode = "market" | "strategy" | "content" | "performance";

const ALL_MODES: WorkspaceMode[] = ["market", "strategy", "content", "performance"];

const WORKSPACE_ACCESS: Record<string, WorkspaceMode[]> = {
  // 內部預覽帳號 — 四個工作區全開
  "sowork@sowork.tw": ALL_MODES,
  // 媽爹講故事：只有策略 + 內容
  "marketing@momdadstory.com": ["strategy", "content"],
};

/** 這個帳號可以切換的工作區。沒設定的帳號回 [] = 維持原本的單一 rail。 */
export function workspaceModesFor(email?: string | null): WorkspaceMode[] {
  return WORKSPACE_ACCESS[String(email ?? "").trim().toLowerCase()] ?? [];
}

export function hasWorkspace(email: string | null | undefined, mode: WorkspaceMode): boolean {
  return workspaceModesFor(email).includes(mode);
}

/** 只有一個工作區時不顯示切換器 —— 一個選項的下拉選單只是雜訊。 */
export function hasWorkspaceSwitcher(email?: string | null): boolean {
  return workspaceModesFor(email).length > 1;
}
