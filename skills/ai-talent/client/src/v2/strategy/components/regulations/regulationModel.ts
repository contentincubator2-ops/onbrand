/**
 * regulationModel — 法規 tray 的純資料層（對應 server/strategy/core/brandRegulations.ts）。
 *
 * client 不得 value-import server，型別與字數算法在這裡另寫一份——改 server 那邊要一起改這裡。
 * server 存檔時會再檢查一次；這裡只是讓用戶打字時就看得到還能放幾字。
 */
export interface Regulation {
  id: number;
  brandId: number;
  title: string;
  source: string;
  body: string;
  enabled: boolean;
  chars: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RegulationList {
  items: Regulation[];
  usedTotal: number;
  budget: {
    /** 法規合計最多能放多少字（硬上限與品牌大腦剩餘空間取小）。 */
    allowedTotal: number;
    limitedByBrain: boolean;
    /** 不含法規時，一次寫作最多讀進大腦幾字。 */
    nonRegulationChars: number;
    capacity: number;
  };
  limits: { titleMax: number; sourceMax: number; cardMax: number; totalMax: number; maxCards: number };
}

/** 跟 server 的 charLen 同一種算法（以字元計，emoji 算一個）。 */
export const charLen = (s: string) => [...s.trim()].length;

/**
 * 正在編輯的這張卡最多能放幾字：單張上限，與「總額度扣掉其他啟用中的卡」取小。
 * 存成停用時只受單張上限限制（停用的不進大腦、不佔空間）。
 */
export function cardRoom(list: Pick<RegulationList, "items" | "budget" | "limits">, editingId: number | null, enabled: boolean): number {
  if (!enabled) return list.limits.cardMax;
  const others = list.items.filter((r) => r.enabled && r.id !== editingId).reduce((n, r) => n + r.chars, 0);
  return Math.max(0, Math.min(list.limits.cardMax, list.budget.allowedTotal - others));
}

export const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

export const fmt = (n: number) => n.toLocaleString("en-US");
