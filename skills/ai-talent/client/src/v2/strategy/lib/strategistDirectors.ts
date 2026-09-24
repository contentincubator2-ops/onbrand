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
  /** slug 的語系段（tw/cn/sea/en/my/sg/th）——UI 誠實標示「這位的資料是哪個市場的」。 */
  locale: string | null;
  /** 對不上產業時的備用人選（只有 primary 會帶）。 */
  alternatives: StrategistDirector[];
  roleId: string;
  roleLabel: string;
  roleLabelEn: string;
  signatureQuestions: string[];
  signatureQuestionsEn: string[];
  /** true = 沒有跟品牌產業對得上的人，用的是這個角色的預設人選。 */
  isFallback: boolean;
}

/**
 * 記住使用者選過誰——per-brand 而且 per-scope。
 * 2026-09-24：品牌頁與產品頁是兩組不同的角色（產品頁＝價值主張／Kano／定價），
 * 共用一個 key 的話，在產品頁換人會把品牌頁的選擇也蓋掉。
 */
export type StrategistScope = "brand" | "product";
const directorStorageKey = (brandId: number, scope: StrategistScope) =>
  `sowork.strategyDirector.${scope}.${brandId}`;

export function readStoredDirector(brandId: number, scope: StrategistScope = "brand"): number | null {
  try {
    const v = Number(localStorage.getItem(directorStorageKey(brandId, scope)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}

export function writeStoredDirector(brandId: number, agentId: number, scope: StrategistScope = "brand"): void {
  try { localStorage.setItem(directorStorageKey(brandId, scope), String(agentId)); } catch { /* noop */ }
}

/**
 * 語系標籤。2026-09-24（CJ「服飾 → fallback、不動產 → 對不到…這各狀況要提共
 * 備用的人選」）：備用人選常常是「同產業但別的市場」，市場一定要標出來——
 * 使用者才知道這位顧問的產業經驗是在哪裡累積的，而不是以為他就是台灣的。
 */
export function localeLabelOf(locale: string | null | undefined, en: boolean): string | null {
  switch (locale) {
    case "tw":  return null;                       // 繁中是預設，不用特別標
    case "cn":  return en ? "China market" : "中國市場";
    case "sea": return en ? "SE Asia" : "東南亞市場";
    case "en":  return en ? "English-language" : "英文市場";
    case "my":  return en ? "Malaysia" : "馬來西亞市場";
    case "sg":  return en ? "Singapore" : "新加坡市場";
    case "th":  return en ? "Thailand" : "泰國市場";
    default:    return null;
  }
}

/**
 * 這個頁面該用哪一組策略總監。
 *
 * 2026-09-24（CJ：「右下方，還是寫著策略總監，沒有更換成產品的專家」——他當時
 * 站在**產品清單頁**）：第一版只看 URL 的 `?p=`（單一產品頁）就切 scope，結果
 * 產品清單頁（`cat=products`）還是掛著品牌定位總監。產品清單頁從頭到尾在談產品，
 * 卻配一位品牌策略師，那就是答非所問。
 *
 * 規則寫成函式而不是散在元件裡的條件式，是因為「哪些頁面算產品情境」之後一定
 * 還會長（產品變體、產品任務…），散著寫就會有兩套不同步的判斷。
 */
export function scopeFromUrl(params: { p?: string | null; cat?: string | null }): StrategistScope {
  const pid = Number(params.p);
  if (Number.isFinite(pid) && pid > 0) return "product";   // 單一產品頁
  if ((params.cat ?? "") === "products") return "product"; // 產品清單頁
  return "brand";
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
