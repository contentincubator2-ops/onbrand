/**
 * brainModel — 「大腦」tray 的純資料與純函式（沒有 React，測得動）。
 *
 * 形狀對應 server brandKnowledge.brain（server/strategy/core/brandContext.ts
 * BrainItem / BRAIN_CATEGORIES）。client 不得 value-import server，所以型別在這裡
 * 另寫一份——改 server 那邊的欄位要一起改這裡。
 */
export type BrainItemStatus = "remembered" | "trimmed" | "overflow" | "checkOnly";

export interface BrainItem {
  /** 策略層 rail 上的分類：info／brand／copy／product／event（＋legacy）。 */
  category: string;
  /** 該頁的段落標題（品牌黃金圈、商品事實…）；文字頁沒有段落，是空字串。 */
  group: string;
  /** 該頁上的欄位／卡片名稱。 */
  label: string;
  storedChars: number;
  keptChars: number;
  status: BrainItemStatus;
  preview: string;
  /** 舊版 brand_brain 列 id：沒有編輯頁，只能在記憶空間直接忘掉。 */
  legacyRowId?: number;
}

export interface BrainData {
  capacity: number;
  usedChars: number;
  items: BrainItem[];
  categories: Array<{ key: string; zh: string; en: string }>;
}

export const STATUS_TEXT: Record<BrainItemStatus, { zh: string; en: string }> = {
  remembered: { zh: "記住", en: "Remembered" },
  trimmed:    { zh: "只記住一部分", en: "Partly remembered" },
  overflow:   { zh: "超載・沒被讀到", en: "Overloaded · not read" },
  checkOnly:  { zh: "產出後檢查", en: "Checked after writing" },
};

/** 接近滿的門檻：用量超過容量的這個比例就提醒。 */
export const NEAR_FULL_RATIO = 0.85;

export interface BrainState {
  level: "ok" | "near" | "over";
  free: number;
  overflowCount: number;
  trimmedCount: number;
}

export function brainState(d: BrainData): BrainState {
  const overflowCount = d.items.filter((i) => i.status === "overflow").length;
  const trimmedCount = d.items.filter((i) => i.status === "trimmed").length;
  const free = Math.max(0, d.capacity - d.usedChars);
  const level = overflowCount > 0 ? "over" : d.usedChars >= d.capacity * NEAR_FULL_RATIO ? "near" : "ok";
  return { level, free, overflowCount, trimmedCount };
}

export interface CategorySummary {
  key: string;
  count: number;
  keptChars: number;
  trimmed: number;
  overflow: number;
  items: BrainItem[];
}

/** 依 server 給的類別順序分組；沒有內容的類別不列。 */
export function categorySummaries(d: BrainData): CategorySummary[] {
  return d.categories
    .map((c) => {
      const items = d.items.filter((i) => i.category === c.key);
      return {
        key: c.key,
        count: items.length,
        keptChars: items.reduce((n, i) => n + i.keptChars, 0),
        trimmed: items.filter((i) => i.status === "trimmed").length,
        overflow: items.filter((i) => i.status === "overflow").length,
        items,
      };
    })
    .filter((s) => s.count > 0);
}

/**
 * 同一分類底下依頁面段落分組，保持 server 給的順序（也就是頁面上的順序）。
 * 沒有段落的（文字頁）整組 group 是空字串，畫面上不印段落標題。
 */
export function groupsOf(items: BrainItem[]): Array<{ group: string; items: BrainItem[] }> {
  const out: Array<{ group: string; items: BrainItem[] }> = [];
  for (const it of items) {
    const g = out.find((x) => x.group === (it.group ?? ""));
    if (g) g.items.push(it);
    else out.push({ group: it.group ?? "", items: [it] });
  }
  return out;
}

export function fmtChars(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * 2026-09-30（CJ「超出記憶容量時，這邊會提醒用戶，然後用戶可以像在操作手機的記憶一樣，
 * 按照引導去清理記憶」）——手機「儲存空間」的「建議」清單：每一條說清楚是什麼、
 * 清掉能騰出多少，並給一個動作（回原頁精簡，或直接忘掉舊資料）。
 *
 * 排序照嚴重度：沒被讀到 → 舊資料 → 只記住一部分 → 最佔空間（只在快滿／超載時出現，
 * 空間夠的時候不要叫用戶刪東西）。
 */
export type CleanupKind = "overflow" | "legacy" | "trimmed" | "large";

export interface CleanupTip {
  kind: CleanupKind;
  items: BrainItem[];
  /** 清掉這些能騰出（或需要騰出）的字數。 */
  chars: number;
}

/** 單筆超過這個字數，快滿時才列進「最佔空間」。 */
export const LARGE_ITEM_CHARS = 600;

export function cleanupTips(d: BrainData): CleanupTip[] {
  const st = brainState(d);
  const tips: CleanupTip[] = [];
  const sum = (xs: BrainItem[], f: (i: BrainItem) => number) => xs.reduce((n, i) => n + f(i), 0);

  const overflow = d.items.filter((i) => i.status === "overflow");
  if (overflow.length) tips.push({ kind: "overflow", items: overflow, chars: sum(overflow, (i) => i.storedChars) });

  const legacy = d.items.filter((i) => i.legacyRowId && i.status !== "checkOnly");
  if (legacy.length) tips.push({ kind: "legacy", items: legacy, chars: sum(legacy, (i) => i.keptChars) });

  const trimmed = d.items.filter((i) => i.status === "trimmed");
  if (trimmed.length) tips.push({ kind: "trimmed", items: trimmed, chars: sum(trimmed, (i) => i.storedChars - i.keptChars) });

  if (st.level !== "ok") {
    const large = d.items
      .filter((i) => i.status === "remembered" && !i.legacyRowId && i.category !== "info" && i.keptChars >= LARGE_ITEM_CHARS)
      .sort((a, b) => b.keptChars - a.keptChars)
      .slice(0, 3);
    if (large.length) tips.push({ kind: "large", items: large, chars: sum(large, (i) => i.keptChars) });
  }
  return tips;
}

/**
 * 這筆記憶在策略層哪一頁改——網址參數跟 rail 的 cat 同一套。舊資料沒有編輯頁，回 null。
 * 產品／活動的記憶要帶著目前檢查的那一個 id，不然會落到品牌定位。
 */
export function editHref(
  item: BrainItem,
  scope: { brandId: number; productId?: number | null; eventId?: number | null },
): string | null {
  const base = `/brands/edit?b=${scope.brandId}`;
  switch (item.category) {
    case "info": return `${base}&cat=info`;
    case "brand": return `${base}&cat=positioning`;
    case "copy": return `${base}&cat=copy`;
    case "product": return scope.productId ? `${base}&cat=positioning&p=${scope.productId}` : `${base}&cat=products`;
    case "event": return scope.eventId ? `${base}&cat=positioning&e=${scope.eventId}` : `${base}&cat=events`;
    default: return null;
  }
}
