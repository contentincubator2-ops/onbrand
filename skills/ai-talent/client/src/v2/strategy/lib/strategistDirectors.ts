/**
 * strategistDirectors — 前端這一側的「策略總監」型別與小工具。
 *
 * 2026-09-23（CJ「品牌頁面的右下方，品牌策略總監的三個人選」）：這裡刻意
 * 只有型別跟兩三個純函式，**沒有任何人設資料**——名字、職稱、經歷、專長
 * 全部來自 server 的 strategistChat.listDirectors（真實 mos_db agent），
 * 見 server/strategy/core/strategistDirectory.ts。
 *
 * 上一輪的 strategistPersonas.ts 把人設寫死在前端當佔位資料，是因為誤判
 * 「mos_db 查不到」；那個檔案現在只剩產品頁面那一位還在用（CJ:「我們先決定
 * 品牌策略師，等等再決定產品頁面的策略人選」），品牌頁面已經不讀它了。
 */

export interface StrategistDirector {
  agentId: number;
  slug: string;
  name: string;
  title: string;
  avatarUrl: string;
  /** 以下四個欄位是 mos_db 原文，查不到就是 null——UI 直接不顯示該區塊，不補假的。 */
  bio: string | null;
  experience: string | null;
  specialty: string | null;
  methodology: string | null;
  industry: string | null;
  roleId: string;
  roleLabel: string;
  roleLabelEn: string;
  signatureQuestions: string[];
  signatureQuestionsEn: string[];
  /** true = 沒有跟品牌產業對得上的人，用的是這個角色的預設人選。 */
  isFallback: boolean;
}

/** 記住使用者在這個品牌選過誰——per-brand，不要一個品牌換人把全部品牌都換掉。 */
const directorStorageKey = (brandId: number) => `sowork.strategyDirector.brand.${brandId}`;

export function readStoredDirector(brandId: number): number | null {
  try {
    const v = Number(localStorage.getItem(directorStorageKey(brandId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}

export function writeStoredDirector(brandId: number, agentId: number): void {
  try { localStorage.setItem(directorStorageKey(brandId), String(agentId)); } catch { /* noop */ }
}

export function signatureQuestionsOf(d: StrategistDirector | null | undefined, en: boolean): string[] {
  if (!d) return [];
  const list = en ? d.signatureQuestionsEn : d.signatureQuestions;
  return Array.isArray(list) ? list.filter((q) => typeof q === "string" && q.trim()) : [];
}

export function roleLabelOf(d: StrategistDirector | null | undefined, en: boolean): string {
  if (!d) return en ? "Strategy" : "策略";
  return (en ? d.roleLabelEn : d.roleLabel) || d.roleLabel || "";
}

/**
 * mos_db 的 avatarUrl 有兩種：dicebear 的完整 https URL（這批產業策略師）
 * 跟 /static/covers/... 的站內相對路徑（真實人物那批）。相對路徑直接用，
 * 瀏覽器會補上目前網域——OnBrand 自己就在服務 /static。
 */
export function avatarSrcOf(d: StrategistDirector | null | undefined): string {
  const raw = (d?.avatarUrl ?? "").trim();
  if (raw) return raw;
  // 真的沒有頭像時用 dicebear 依 slug 生一個穩定的——不是假資料，只是佔位圖形。
  const seed = encodeURIComponent(d?.slug || "strategy-director");
  return `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=6548C6&backgroundType=solid`;
}
