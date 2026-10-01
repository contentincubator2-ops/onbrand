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
/**
 * 內容層通路頁：路由段 → scope（2026-09-27，跟 server CHANNEL_SCOPES 同一份）。
 * 2026-09-29（CJ：內容通路只剩 FB／IG／TikTok／電子報／官網）：前端拿掉
 * li／yt／pr／x；server 端 CHANNEL_SCOPES 與角色資料保留（只藏不刪）。
 */
export const CHANNEL_ROUTE_SCOPE = {
  fb: "facebook", ig: "instagram", tt: "tiktok",
  email: "email", web: "website",
  // 2026-10-01（CJ「每個頁面右下方的 ai agent 都要符合該頁面」）：七通路裡只有
  // Threads／LINE 沒有自己的顧問，原本落回品牌策略那三位。
  threads: "threads", line: "line",
} as const;
export type ChannelScope = (typeof CHANNEL_ROUTE_SCOPE)[keyof typeof CHANNEL_ROUTE_SCOPE];
/** 不是發文通路的頁面顧問（活動／視覺／法規／成效層／內容層共用頁）。跟 server PAGE_SCOPES 同一份。 */
export type PageScope = "events" | "visual" | "regulations" | "performance" | "content";
export type StrategistScope = "brand" | "product" | "copy" | ChannelScope | PageScope;

const CHANNEL_NAME: Record<ChannelScope, { zh: string; en: string }> = {
  facebook: { zh: "FB", en: "Facebook" }, instagram: { zh: "IG", en: "Instagram" },
  tiktok: { zh: "TikTok", en: "TikTok" }, email: { zh: "電子報", en: "Email" },
  website: { zh: "官網", en: "Website" },
  threads: { zh: "Threads", en: "Threads" }, line: { zh: "LINE", en: "LINE" },
};
const PAGE_NAME: Record<PageScope, { zh: string; en: string }> = {
  events: { zh: "活動顧問", en: "Campaign Advisors" },
  visual: { zh: "視覺顧問", en: "Visual Advisors" },
  regulations: { zh: "法規顧問", en: "Compliance Advisors" },
  performance: { zh: "成效顧問", en: "Performance Advisors" },
  content: { zh: "內容企劃顧問", en: "Content Advisors" },
};
export function isChannelScope(s: StrategistScope): s is ChannelScope {
  return s in CHANNEL_NAME;
}
export function isPageScope(s: StrategistScope): s is PageScope {
  return s in PAGE_NAME;
}
/** 右下角標籤：「FB 顧問」「電子報顧問」…。 */
export function channelAdvisorLabel(s: ChannelScope, en: boolean): string {
  return en ? `${CHANNEL_NAME[s].en} Advisors` : `${CHANNEL_NAME[s].zh} 顧問`.replace(/^(\p{Script=Han}+) 顧問$/u, "$1顧問");
}

/**
 * 右下角那顆標籤／面板標題的字——每種 scope 一句。集中在這裡，抽屜元件原本四處
 * 各寫一串三元運算，加一種頁面就要改四個地方。
 */
export function advisorLabelOf(s: StrategistScope, en: boolean): string {
  if (s === "product") return en ? "Product Strategy" : "產品策略總監";
  if (s === "copy") return en ? "Copy & Wording" : "用詞總監";
  if (isChannelScope(s)) return channelAdvisorLabel(s, en);
  if (isPageScope(s)) return en ? PAGE_NAME[s].en : PAGE_NAME[s].zh;
  return en ? "Strategy Director" : "策略總監";
}
/** 面板副標（還沒載入到人時）。 */
export function advisorSubtitleOf(s: StrategistScope, en: boolean): string {
  if (s === "product") return en ? "Built for this product" : "為這支產品而設計";
  if (s === "copy") return en ? "Built for your wording rules" : "為你的用詞規範而設計";
  if (isChannelScope(s)) return en ? "Built for this channel" : "為這個通路而設計";
  if (isPageScope(s)) return en ? "Built for this page" : "為這一頁而設計";
  return en ? "Built for your brand" : "為你的品牌而設計";
}

/**
 * 這些頁面不掛右下角顧問（2026-10-01 逐頁比對）：帳號／工作區設定、後台、更新紀錄、
 * 品牌連線設定——沒有行銷問題可問，掛一位品牌策略師只是佔位置。
 */
export function isAdvisorHiddenPath(path: string | null | undefined): boolean {
  return /^\/(settings|admin|changelog|brands\/settings)(\/|$)/.test(path ?? "");
}
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
export function scopeFromUrl(params: { p?: string | null; cat?: string | null; path?: string | null; e?: string | null }): StrategistScope {
  const path = params.path ?? "";
  // 2026-09-27（CJ「要陸續更改各頁面右下方的顧問人選，從 fb 開始」）：內容層的
  // Facebook 任務頁有自己的三位（社群口碑／再行銷漏斗／廣告節奏）。看路徑，不看 cat——
  // 內容層的頁面沒有 cat 參數；而網址上可能還留著 ?p=（使用者選了產品在寫貼文）。
  const m = /^\/tasks\/([a-z]+)/.exec(path);
  if (m && m[1] && m[1] in CHANNEL_ROUTE_SCOPE) return CHANNEL_ROUTE_SCOPE[m[1] as keyof typeof CHANNEL_ROUTE_SCOPE];
  // 2026-10-01（CJ「每個頁面右下方的 ai agent，都要符合該頁面的需求」）：逐頁比對後
  // 補上的頁面。成效層全部（總覽／Meta／Google／電商／GA／歸因／月報／活動）同一組。
  if (/^\/performance(\/|$)/.test(path)) return "performance";
  // 內容層的活動 tray 跟策略層的活動頁談的是同一件事——同一組活動顧問。
  if (/^\/campaigns(\/|$)/.test(path)) return "events";
  // 內容層其餘共用頁（任務頁以外）：本週企劃、靈感、專案、產出頁、圖片卡、案例、審核。
  if (/^\/(planner|inspiration|projects|run|image|review)(\/|$)/.test(path) || /^\/tasks\/(case|calendar)(\/|$)/.test(path)) {
    return "content";
  }
  const cat = params.cat ?? "";
  // 2026-09-26（CJ「要從 mos_db 當中，選擇三個負責這一頁的 agent」）：文字頁
  // （cat=copy）有自己的三位——語氣／用詞規範／產業用語。判斷要放在產品之前，
  // 因為在文字頁時網址上可能還留著 ?p=（使用者剛從產品頁切過來）。
  // 人設（cat=persona）管的是語調 agent，跟文字頁同一組最對題。
  if (cat === "copy" || cat === "persona") return "copy";
  if (cat === "visual") return "visual";
  if (cat === "regulations") return "regulations";
  // 活動清單頁或單一活動頁（?e=）。放在產品前：活動頁網址可能同時帶著 ?p=（活動綁的產品）。
  const eid = Number(params.e);
  if (cat === "events" || (Number.isFinite(eid) && eid > 0)) return "events";
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
