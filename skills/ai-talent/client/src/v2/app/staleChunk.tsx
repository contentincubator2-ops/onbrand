/**
 * 部署後的「舊分頁抓不到新程式檔」自動復原。
 *
 * 每次部署都會換掉帶 hash 的程式檔；還開著的舊分頁一切頁就去抓已經不存在的檔案，
 * 丟出 "Failed to fetch dynamically imported module"。重新整理拿到新的 index.html
 * 就好了。原本只重試一次（15 秒內），碰上部署中或網路閃斷的第二次失敗就直接把
 * 工程用的錯誤畫面丟給用戶。這裡改成：
 *   - 60 秒內最多自動重新整理 2 次（sessionStorage 計數，避免無限迴圈）
 *   - 也接 Vite 的 vite:preloadError（CSS／預載失敗不會進 React error boundary）
 *   - 真的救不回來時，只顯示圖示＋「重新整理」按鈕，不秀英文錯誤訊息
 *
 * 獨立成一個檔：AppV2 與 ShellLayout 都要用，放在任一邊都會循環 import。
 */
import { RegenerateIcon } from "../platform/components/icons";

const KEY = "_chunk_reload_log";
const WINDOW_MS = 60_000;
const MAX_RELOADS = 2;

export function isChunkLoadError(err: unknown): boolean {
  const e = err as { message?: string; stack?: string } | null;
  const text = (e?.message ?? String(err ?? "")) + " " + (e?.stack ?? "");
  return /Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk|Loading CSS chunk|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(text);
}

/** 視窗內還有額度就重新整理並回傳 true；額度用完回傳 false（交給畫面處理）。 */
export function autoReloadForStaleChunk(): boolean {
  try {
    const now = Date.now();
    const log: number[] = JSON.parse(sessionStorage.getItem(KEY) ?? "[]").filter((t: number) => now - t < WINDOW_MS);
    if (log.length >= MAX_RELOADS) return false;
    log.push(now);
    sessionStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    return false; // sessionStorage 被擋就不自動重整，避免無法計數造成迴圈
  }
  window.location.reload();
  return true;
}

let installed = false;
/** main.tsx 啟動時呼叫一次。 */
export function installStaleChunkRecovery() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("vite:preloadError", (event) => {
    if (autoReloadForStaleChunk()) event.preventDefault();
  });
}

/** 自動重整額度用完時的畫面：一個圖示、一個按鈕。 */
export function StaleChunkScreen({ fullPage = false }: { fullPage?: boolean }) {
  const en = typeof navigator !== "undefined" && !/^zh/i.test(navigator.language);
  return (
    <div
      style={{
        minHeight: fullPage ? "100vh" : 320,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
        color: "#3f3f46", fontFamily: "system-ui, sans-serif",
      }}
    >
      <RegenerateIcon size={28} />
      <button
        onClick={() => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } window.location.reload(); }}
        style={{ padding: "8px 18px", background: "#18181b", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}
      >
        {en ? "Reload" : "重新整理"}
      </button>
    </div>
  );
}
