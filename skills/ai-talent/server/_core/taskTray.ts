/**
 * taskTray — 「這個品牌在這個通路，平常擺哪幾張卡」。
 *
 * 2026-09-06 (CJ「每一個平台的每一個分類，是否都先預設一個任務卡就好…
 * 旁邊有新增任務卡的選項…可以讓用戶自己新增，也可訂選自己常用的」)。
 *
 * ── 為什麼需要 ───────────────────────────────────────────────────────
 * FB 現在有 47 張卡擠在同一頁，用戶要在 9 種 postType × 4 種來源裡自己找。
 * 那不是「功能多」，那是把分類的工作丟給使用者。托盤把「瀏覽」與「選擇」
 * 分開：平常只擺每個分類一張，要換再進選卡器。
 *
 * ── 預設挑哪一張 ─────────────────────────────────────────────────────
 * 每個 postType 挑「來源最強」的那張，不是隨便一張，也不是長青。
 * 長青是我們明講沒有出處的那一類 —— 拿它當門面等於把最弱的放最前面。
 * 順序寫在 SOURCE_RANK，要改就改那一個常數。
 *
 * 同分時取 tier 較小的（30s 先於 60s / 99s）：門面應該是「點下去馬上有東西」
 * 的那種，不是要填一堆欄位的企劃。
 *
 * ── 存哪裡 ───────────────────────────────────────────────────────────
 * `brands.positioning.__tray[platform] = string[]`，沿用 __channels 與
 * brandTaskCards 同一套存法，不開新欄位、不需要 migration。
 */

/** 來源強度。說得出出處的排前面；長青最後。 */
export const SOURCE_RANK: Record<string, number> = {
  award: 5,
  viral: 4,
  benchmark: 3,
  "brand-method": 3,
  "channel-spec": 1,
  evergreen: 0,
};

export interface TrayTask {
  id: string;
  platform?: string | null;
  postType?: string | null;
  tier?: string | null;
  source?: { type?: string } | null;
}

const TIER_ORDER: Record<string, number> = { "30s": 0, "60s": 1, "99s": 2 };

function rank(t: TrayTask): [number, number, string] {
  return [
    -(SOURCE_RANK[t.source?.type ?? "evergreen"] ?? 0),
    TIER_ORDER[String(t.tier ?? "")] ?? 9,
    t.id,
  ];
}

/** 排序用比較子：來源強 → tier 小 → id。 */
function cmp(a: TrayTask, b: TrayTask): number {
  const [ra, ta, ia] = rank(a);
  const [rb, tb, ib] = rank(b);
  return ra - rb || ta - tb || ia.localeCompare(ib);
}

/**
 * 這個通路的預設托盤：每個 postType 一張，取來源最強的。
 *
 * 傳進來的 tasks 應該已經過方案閘門（filterTasksByPlan）—— 基礎方案看不到
 * 爆款卡，它的預設托盤自然也不會出現爆款卡，不必在這裡再判斷一次方案。
 */
export function defaultTray(tasks: TrayTask[], platform: string): string[] {
  const byType = new Map<string, TrayTask[]>();
  for (const t of tasks) {
    if (t.platform && t.platform !== platform) continue;
    const k = String(t.postType ?? "other");
    const arr = byType.get(k) ?? [];
    arr.push(t);
    byType.set(k, arr);
  }
  const out: string[] = [];
  for (const [, arr] of [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const best = [...arr].sort(cmp)[0];
    if (best) out.push(best.id);
  }
  return out;
}

/** positioning JSON 裡存的托盤。格式壞掉一律當成沒設定。 */
export function storedTray(positioning: unknown, platform: string): string[] | null {
  const tray = positioning && typeof positioning === "object"
    ? (positioning as any).__tray
    : null;
  if (!tray || typeof tray !== "object") return null;
  const arr = (tray as any)[platform];
  if (!Array.isArray(arr)) return null;
  const ids = arr.filter((x): x is string => typeof x === "string");
  return ids.length ? ids : null;
}

export interface TrayResult {
  /** 實際要擺出來的卡 id，已濾掉不存在或方案看不到的。 */
  taskIds: string[];
  /** true = 用戶沒挑過，這是系統預設。前台可以據此顯示「預設」字樣。 */
  isDefault: boolean;
  /** 存過但現在拿不到的卡（降級或卡退役）。前台可以提示他重挑。 */
  dropped: string[];
}

/**
 * 解出這個品牌在這個通路要擺的卡。
 *
 * 存過的優先，但一定要跟 `available` 交集 —— 降級到基礎方案時，存在托盤裡
 * 的爆款卡必須消失，否則方案閘門在目錄擋住了、卻從托盤漏出去。
 */
export function resolveTray(
  positioning: unknown,
  available: TrayTask[],
  platform: string,
): TrayResult {
  const ok = new Set(
    available.filter((t) => !t.platform || t.platform === platform).map((t) => t.id),
  );
  const stored = storedTray(positioning, platform);
  if (!stored) {
    return { taskIds: defaultTray(available, platform), isDefault: true, dropped: [] };
  }
  const taskIds = stored.filter((id) => ok.has(id));
  const dropped = stored.filter((id) => !ok.has(id));
  // 存過但一張都不剩（整批被降級擋掉 / 全退役）→ 回預設，不要給空畫面
  if (!taskIds.length) {
    return { taskIds: defaultTray(available, platform), isDefault: true, dropped };
  }
  return { taskIds, isDefault: false, dropped };
}

/** 托盤上限。單一通路擺太多就失去「托盤」的意義了。 */
export const MAX_TRAY = 12;
