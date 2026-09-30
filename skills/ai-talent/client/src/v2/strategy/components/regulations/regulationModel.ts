/**
 * regulationModel — 法規 tray 的純資料層（對應 server/strategy/core/brandRegulations.ts）。
 *
 * client 不得 value-import server，型別與字數算法在這裡另寫一份——改 server 那邊要一起改這裡。
 * server 存檔時會再檢查一次；這裡只是讓用戶打字時就看得到還能放幾字。
 *
 * 2026-09-30 第二版：原文（只存著）＋審查重點（進大腦、合規檢查讀它）。
 */
export type RegulationJobStatus = "idle" | "extracting" | "review" | "failed";

export interface Regulation {
  id: number;
  brandId: number;
  title: string;
  source: string;
  body: string;
  enabled: boolean;
  chars: number;
  digest: string;
  digestChars: number;
  draftDigest: string;
  jobStatus: RegulationJobStatus;
  jobProgress: { stage: "reading" | "extracting" | "merging" | "done"; done: number; total: number } | null;
  jobError: string | null;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RegulationList {
  items: Regulation[];
  usedTotal: number;
  reviewCount: number;
  budget: {
    /** 審查重點合計最多能放多少字（硬上限與品牌大腦剩餘空間取小）。 */
    allowedTotal: number;
    limitedByBrain: boolean;
    /** 不含法規時，一次寫作最多讀進大腦幾字。 */
    nonRegulationChars: number;
    capacity: number;
  };
  limits: { titleMax: number; sourceMax: number; bodyMax: number; digestMax: number; totalMax: number; maxCards: number };
}

/** 存完原文後「要萃取嗎？」視窗的數字（server statsFor）。 */
export interface RegulationStats {
  chars: number;
  capacity: number;
  pctOfCapacity: number;
  usedByOthers: number;
  digestMax: number;
  digestRoom: number;
  canAdoptOriginal: boolean;
}

/** 跟 server 的 charLen 同一種算法（以字元計，emoji 算一個）。 */
export const charLen = (s: string) => [...s.trim()].length;

/**
 * 這張卡的審查重點最多能放幾字：單張上限，與「總額度扣掉其他生效中的卡」取小。
 * 卡停用時只受單張上限限制（停用的不進大腦、不佔空間）。
 */
export function digestRoom(list: Pick<RegulationList, "items" | "budget" | "limits">, editingId: number | null, enabled: boolean): number {
  if (!enabled) return list.limits.digestMax;
  const others = list.items.filter((r) => r.active && r.id !== editingId).reduce((n, r) => n + r.digestChars, 0);
  return Math.max(0, Math.min(list.limits.digestMax, list.budget.allowedTotal - others));
}

/** 卡片上的狀態（決定標籤、按鈕與進度條）。 */
export type CardState = "extracting" | "review" | "failed" | "active" | "off" | "pending";

export function cardState(r: Pick<Regulation, "jobStatus" | "digest" | "enabled">): CardState {
  if (r.jobStatus === "extracting") return "extracting";
  if (r.jobStatus === "review") return "review";
  if (r.jobStatus === "failed" && !r.digest) return "failed";
  if (!r.digest) return "pending";
  return r.enabled ? "active" : "off";
}

/** 萃取進度 0–100：讀取 5%、逐段萃取到 85%、整理到 95%。 */
export function progressPct(p: Regulation["jobProgress"]): number {
  if (!p) return 3;
  if (p.stage === "reading") return 5;
  if (p.stage === "extracting") return p.total > 0 ? Math.round(5 + (p.done / p.total) * 80) : 5;
  if (p.stage === "merging") return 92;
  return 100;
}

export function progressText(p: Regulation["jobProgress"], en: boolean): string {
  if (!p || p.stage === "reading") return en ? "Reading the full text…" : "讀取原文中…";
  if (p.stage === "extracting") return en ? `Extracting · section ${p.done}/${p.total}` : `萃取中・第 ${p.done}／${p.total} 段`;
  if (p.stage === "merging") return en ? "Organizing the checklist…" : "整理成審查清單…";
  return en ? "Done" : "完成";
}

export const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

export const fmt = (n: number) => n.toLocaleString("en-US");
