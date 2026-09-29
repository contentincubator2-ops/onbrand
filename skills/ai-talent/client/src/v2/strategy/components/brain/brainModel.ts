/**
 * brainModel — 「大腦」tray 的純資料與純函式（沒有 React，測得動）。
 *
 * 形狀對應 server brandKnowledge.brain（server/strategy/core/brandContext.ts
 * BrainItem / BRAIN_CATEGORIES）。client 不得 value-import server，所以型別在這裡
 * 另寫一份——改 server 那邊的欄位要一起改這裡。
 */
export type BrainItemStatus = "remembered" | "trimmed" | "overflow" | "checkOnly";

export interface BrainItem {
  category: string;
  label: string;
  storedChars: number;
  keptChars: number;
  status: BrainItemStatus;
  preview: string;
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

export function fmtChars(n: number): string {
  return n.toLocaleString("en-US");
}
