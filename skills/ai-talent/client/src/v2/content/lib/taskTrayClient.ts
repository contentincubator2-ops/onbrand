/**
 * taskTrayClient — 「這個通路的常用清單實際擺哪幾張」的前端解析。
 *
 * 2026-10-04（CJ「在所有的任務卡中…可以在不同的平台中，管理到自己常用的」）：原本這段
 * 只寫在 PlatformTaskPage 的 useMemo 裡。「我的任務卡」總覽頁要對七個通路做同一件事，
 * 抄一份的話兩邊遲早各算各的（平台頁說常用 5 張、總覽頁說 4 張），所以抽出來共用。
 *
 * 解析在前端做的理由見 server 的 quickTask.tray：只有前端手上有完整的可見清單
 * （全域目錄＋品牌任務包＋自建卡）。
 */

export interface TrayData {
  stored: string[] | null;
  fallback: string[];
  maxTray?: number;
}

interface TrayCard { id: string; postType?: string | null; platform?: string | null }

/** 卡片屬於哪個通路。listFB 有給 platform 就用它，沒有就看 id 前綴。 */
export function taskPlatformOf(task: TrayCard): string {
  const id = task.id ?? "";
  return task.platform ??
    (id.startsWith("ig-") ? "instagram"
      : id.startsWith("yt-") ? "youtube"
      : id.startsWith("tt-") ? "tiktok"
      : id.startsWith("li-") ? "linkedin"
      : id.startsWith("em-") ? "email"
      : id.startsWith("pr-") ? "pr"
      : id.startsWith("web-") ? "website"
      : id.startsWith("x-") ? "x"
      : id.startsWith("th-") ? "threads"
      : id.startsWith("ln-") ? "line"
      : id.startsWith("br-") ? "brand"
      : id.startsWith("rs-") ? "audience"
      : "facebook");
}

/**
 * 這個通路實際擺出來的卡 id。
 *
 * 存過的要跟「現在看得到的」取交集——降級或卡退役之後，常用清單不能把方案擋掉的卡漏出來。
 * 沒存過（或存的全都看不到了）走預設：
 *   - 看得到的卡不超過上限 → 全部擺出來。IG 兩張留言卡共用同一個形式、私訊卡又是 feed
 *     形式，「每個形式挑一張」會把 8 張砍成 6 張，藏掉唯一的私訊卡。
 *   - 超過上限 → 每個形式挑一張，server 的預設順序當次序參考（它是從全部卡裡挑的，
 *     跟前台看得到的交集後常常只剩一兩張，所以只拿來排序、不拿來當清單）。
 */
export function resolveTrayIds(tray: TrayData | undefined | null, platformTasks: TrayCard[]): string[] {
  if (!tray) return [];
  const visible = new Set(platformTasks.map((t) => t.id));
  const stored = (tray.stored ?? []).filter((id) => visible.has(id));
  if (stored.length) return stored;
  if (platformTasks.length <= (tray.maxTray ?? 12)) return platformTasks.map((t) => t.id);
  const fallbackOrder = new Map((tray.fallback ?? []).map((id, i) => [id, i] as const));
  const byType = new Map<string, TrayCard>();
  const ranked = [...platformTasks].sort((a, b) =>
    (fallbackOrder.get(a.id) ?? 1e9) - (fallbackOrder.get(b.id) ?? 1e9));
  for (const t of ranked) {
    const k = String(t.postType ?? "other");
    if (!byType.has(k)) byType.set(k, t);
  }
  return [...byType.values()].map((t) => t.id);
}

/** 使用者有沒有自己挑過（true＝現在擺的是系統預設）。 */
export function isDefaultTray(tray: TrayData | undefined | null, platformTasks: TrayCard[]): boolean {
  if (!tray) return true;
  const visible = new Set(platformTasks.map((t) => t.id));
  return !(tray.stored ?? []).some((id) => visible.has(id));
}

export type ToggleResult =
  | { ok: true; next: string[]; added: boolean }
  | { ok: false; reason: "full" | "last" };

/**
 * 按一下星號。從「目前實際擺的那幾張」出發——使用者沒挑過時看到的是系統預設，
 * 他按星號是在那份預設上加減，不是從空清單開始。
 *
 * 兩個擋下來的情況：
 *   - full：已經到上限。單一通路擺太多就失去「常用」的意義。
 *   - last：拿掉最後一張。存空陣列在 server 的語意是「回到系統預設」，畫面會突然
 *     跳出一批他沒挑過的卡——與其那樣，不如直接告訴他至少留一張。
 */
export function toggleTrayId(current: string[], id: string, maxTray = 12): ToggleResult {
  if (current.includes(id)) {
    if (current.length <= 1) return { ok: false, reason: "last" };
    return { ok: true, next: current.filter((x) => x !== id), added: false };
  }
  if (current.length >= maxTray) return { ok: false, reason: "full" };
  return { ok: true, next: [...current, id], added: true };
}
