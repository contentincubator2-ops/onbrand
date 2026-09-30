/**
 * 文字任務 → 圖片任務卡的交接（2026-09-29 CJ「要生圖嗎？要的話會打開生圖的任務卡，
 * 直接帶入文案」）。文案可能很長，不放網址（隱私＋長度），放 sessionStorage；
 * 讀不到（無痕、被擋）時頁面照樣能用，只是文案欄是空的。
 */

const KEY = "onbrand.imageCard.handoff";

export interface ImageCardHandoff {
  copy: string;
  /** 來源文字任務（回上一頁用）。 */
  fromRunId?: string | number;
}

/** 文字任務的通路 → 圖片卡通路。不在清單裡的通路不提供圖片卡。 */
export function imageChannelOf(platform: string | null | undefined): string | null {
  const p = String(platform ?? "").toLowerCase();
  const map: Record<string, string> = {
    facebook: "facebook", fb: "facebook",
    instagram: "instagram", ig: "instagram",
    threads: "threads",
    line: "line",
    tiktok: "tiktok", tt: "tiktok",
    email: "email", edm: "email", em: "email",
    website: "website", web: "website",
  };
  return map[p] ?? null;
}

export function saveImageCardHandoff(h: ImageCardHandoff): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(h)); } catch { /* 無痕或被擋：略過 */ }
}

export function readImageCardHandoff(): ImageCardHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.copy === "string" ? v : null;
  } catch { return null; }
}

export function imageCardHref(cardId: string): string {
  return `/image/${encodeURIComponent(cardId)}`;
}

/**
 * 素材庫 → 圖片任務卡：使用者在素材庫挑了一張「用這張作圖」（2026-09-30 CJ「可以自己
 * 選取，當成作圖使用」）。跟文案交接分開存——兩者可以同時存在（先從文字任務帶文案過來，
 * 再從素材庫挑照片），也各自只用一次。
 */
const SUBJECT_KEY = "onbrand.imageCard.subjectPhoto";

export interface ImageSubjectHandoff {
  url: string;
  /** 挑選器上顯示的名字（產品名／「素材庫」）。 */
  label: string;
}

export function saveImageSubjectHandoff(h: ImageSubjectHandoff): void {
  try { sessionStorage.setItem(SUBJECT_KEY, JSON.stringify(h)); } catch { /* 無痕或被擋：略過 */ }
}

/** 讀一次就清掉——重新整理或下一次開卡不該又被預選。 */
export function takeImageSubjectHandoff(): ImageSubjectHandoff | null {
  try {
    const raw = sessionStorage.getItem(SUBJECT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SUBJECT_KEY);
    const v = JSON.parse(raw);
    return typeof v?.url === "string" ? { url: v.url, label: String(v.label ?? "") } : null;
  } catch { return null; }
}
