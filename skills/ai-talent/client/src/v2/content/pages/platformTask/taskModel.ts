/**
 * 平台任務頁的資料與純函式：平台對照、最近使用、欄位路徑、階段合成。
 */
import { faFacebook, faInstagram, faLinkedin, faYoutube, faTiktok, faThreads, faLine } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope, faBullhorn, faBookBookmark, faCalendarDays, faGlobe, faUserGroup, faHandshake, faStore } from "@fortawesome/free-solid-svg-icons";
import { isCustomChannelId } from "../../lib/customChannelId";

// ── Recently used tasks helpers ─────────────────────────────────────────────
export const LAST_USED_KEY = "onbrand_last_used_tasks_v1";

export function recordTaskUsed(taskId: string) {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[taskId] = Date.now();
    localStorage.setItem(LAST_USED_KEY, JSON.stringify(map));
  } catch { /* non-fatal */ }
}

export function getLastUsedDays(taskId: string): number | null {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY);
    if (!raw) return null;
    const map: Record<string, number> = JSON.parse(raw);
    if (!map[taskId]) return null;
    return Math.floor((Date.now() - map[taskId]) / 86_400_000);
  } catch { return null; }
}

// ── Platform route mapping ───────────────────────────────────────────────────
// URL param → internal platform filter key (matches task.platform from listFB)
export const ROUTE_TO_PLATFORM: Record<string, string> = {
  // 2026-09-29 CJ：內容通路只留 FB／IG／TikTok／電子報／官網。li／yt／pr／x 從白名單
  // 拿掉，舊書籤 /tasks/li 之類會被下面的 Navigate 導回 /tasks/fb。
  fb:    "facebook",
  ig:    "instagram",
  tt:    "tiktok",
  email: "email",
  // 2026-08-29 官網頻道。路由是 /tasks/web，平台代號是 website。
  web:   "website",
  // 2026-09-29 CJ：台灣市場加 Threads、LINE（目前只有品牌自建卡）。
  threads: "threads",
  line:    "line",
  // 2026-10-10：新聞稿開回來（AI 搜尋讀得到的通路）。li／yt／x 仍下架。
  pr:      "pr",
  // 2026-10-01：活動企劃的網紅那條線（kl- 卡）從這裡開卡。
  kol:     "kol",
  cobrand: "cobrand",
  // 素材與規劃頻道。目前只有品牌任務包會用到，全域目錄沒有卡 ——
  // 沒有包的品牌走到這兩個路由會看到空清單，側邊欄也不會有入口。
  case:     "case",
  calendar: "calendar",
};

export interface PlatformMeta {
  label: string;
  labelZh: string;
  icon: any;
  bg: string;
}

export const PLATFORM_META: Record<string, PlatformMeta> = {
  facebook: {
    label: "Facebook", labelZh: "Facebook", icon: faFacebook, bg: "#18181b",
  },
  instagram: {
    label: "Instagram", labelZh: "Instagram", icon: faInstagram, bg: "#18181b",
  },
  linkedin: {
    label: "LinkedIn", labelZh: "LinkedIn", icon: faLinkedin, bg: "#18181b",
  },
  youtube: {
    label: "YouTube", labelZh: "YouTube", icon: faYoutube, bg: "#18181b",
  },
  tiktok: {
    label: "TikTok", labelZh: "TikTok", icon: faTiktok, bg: "#18181b",
  },
  email: {
    label: "Newsletter", labelZh: "電子報", icon: faEnvelope, bg: "#18181b",
  },
  pr: {
    label: "PR", labelZh: "新聞稿", icon: faBullhorn, bg: "#18181b",
  },
  case: {
    label: "Case Library", labelZh: "案例", icon: faBookBookmark, bg: "#18181b",
  },
  calendar: {
    label: "Content Calendar", labelZh: "行事曆", icon: faCalendarDays, bg: "#18181b",
  },
  website: {
    label: "Website", labelZh: "官網", icon: faGlobe, bg: "#18181b",
  },
  kol: {
    label: "Influencers", labelZh: "網紅", icon: faUserGroup, bg: "#18181b",
  },
  cobrand: {
    label: "Co-branding", labelZh: "異業合作", icon: faHandshake, bg: "#18181b",
  },
  // 2026-09-29 CJ：台灣市場加 Threads、LINE。目前沒有預設卡，用戶從自己的範例建卡。
  threads: {
    label: "Threads", labelZh: "Threads", icon: faThreads, bg: "#000000",
  },
  line: {
    label: "LINE", labelZh: "LINE", icon: faLine, bg: "#18181b",
  },
};

export const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=4267B2&backgroundType=solid`;

// Tasks that should hold the modal open until image is done
export const HOLD_FOR_IMAGES = new Set<string>(["fb-60-single-full", "fb-99-carousel-5"]);

export function synthesizeStages(elapsedMs: number, tier: string, lang: string, hasRegulations = false): any[] {
  const L = (zh: string, en: string) => (lang === "en" ? en : zh);
  const t = elapsedMs;
  const isResearch = tier === "99s";
  const isProd = tier === "60s" || tier === "99s";
  const scoutEnd = isResearch ? 12000 : 0;
  const preEnd = scoutEnd + 3000;
  const stratEnd = preEnd + 9000;
  const capStart = preEnd;
  // 單篇實測約 8 秒寫完（2026-09-30 dev run 3784／3788）；套組以上維持 25 秒。
  const capEnd = capStart + (isProd ? 25000 : 9000);
  // 2026-09-30：文案寫完先過品牌一致性檢查（server brandConsistency.ts），圖與附加項都在它之後。
  const brandCheckEnd = capEnd + 8000;
  // 2026-09-30：品牌有啟用中的法規卡時，一致性之後再過法規合規檢查（server regulationCompliance.ts）。
  const checkEnd = hasRegulations ? brandCheckEnd + 8000 : brandCheckEnd;
  const genEnd = checkEnd + 10000;
  const extrasEnd = checkEnd + 14000;
  const qaEnd = extrasEnd + 8000;
  const mk = (key: string, label: string, start: number, end: number) => ({
    key, label, startedAt: start,
    completedAt: t > end ? end : undefined,
    status: t < start ? "pending" : t > end ? "done" : "running",
  });
  const stages: any[] = [];
  if (isResearch) stages.push(mk("scout", L("Scout 爬取真實爆款數據", "Scout pulls real viral data"), 0, scoutEnd));
  stages.push(mk("pre", L("URL / persona / brand load", "URL / persona / brand load"), scoutEnd, preEnd));
  if (isProd) stages.push(mk("strategist", L("Strategist 規劃敘事弧", "Strategist maps the narrative arc"), preEnd, stratEnd));
  stages.push(mk("caption", L("文案寫手 撰寫版本", "Caption writer drafts variants"), capStart, capEnd));
  stages.push(mk("brief", L("視覺指導寫風格指示", "Image director writes the visual brief"), capStart, capEnd));
  stages.push(mk("brandcheck", L("品牌一致性檢查", "Brand consistency check"), capEnd, brandCheckEnd));
  if (hasRegulations) stages.push(mk("regcheck", L("法規合規檢查", "Regulation compliance check"), brandCheckEnd, checkEnd));
  stages.push(mk("gen", L("AI 生圖", "AI paints the image"), checkEnd, genEnd));
  if (isProd) {
    stages.push(mk("extras", L("留言模板 / 發文時段 / 跟進", "Reply templates · timing · follow-up"), checkEnd, extrasEnd));
    stages.push(mk("qa", L("Jordan Hayes 審核", "Jordan Hayes reviews"), extrasEnd, qaEnd));
  }
  return stages;
}

// ── FBTaskCard type (same as QuickTask30sPage) ───────────────────────────────
export interface FBTaskCard {
  id: string;
  tier: "30s" | "60s" | "90s" | "99s";
  postType: string;
  platform?: string;
  label: string;
  label_en?: string | null;
  label_zh?: string | null;
  contextSources?: string[] | null;
  description: string;
  description_en?: string | null;
  kind: "fast" | "mid" | "squad";
  inputs?: any[];
  primary_question?: string | null;
  /** server 附的英文旁路；沒有就 null／undefined。 */
  en?: import("../../../platform/lib/taskEn").TaskEn | null;
  /** 2026-09-30：自建卡用戶自選的插畫場景；null＝依題目自動挑。 */
  scene?: string | null;
  /** 自建卡的 AI 插畫；內建卡的圖走 taskIllustrationIds.json。 */
  illustration_url?: string | null;
  primary_input?: { key: string; placeholder?: string; type: "text" | "textarea"; derive?: any } | null;
  agent_id?: number | null;
  skill_slug?: string | null;
  agent?: { id: number; name: string; title: string; nameEn?: string; titleEn?: string; avatarUrl: string | null } | null;
  team?: Array<{ id: number; name: string; title: string; nameEn?: string; titleEn?: string; avatarUrl: string | null }>;
  squad_slug?: string;
  methodology?: string;
  /** 2026-09-04：非 null 代表這是使用者自己建的卡，可以編輯。 */
  ownCardId?: string | null;
}

/**
 * 2026-09-02 — 額外欄位送出前的整理。
 *
 * 空白與只有空格的格子整個拿掉，不要送空字串過去：orchestra 的 prompt 組裝
 * 會把「有這個 key」當成使用者有講，於是模型看到一個空的「活動優惠：」欄位，
 * 反而比完全沒有這個欄位更容易生出胡話。
 */
/**
 * 哪些頻道可以自建卡 —— 要跟 brandTaskCardRouter 的 CHANNELS 對齊。
 * case / calendar 沒進來：那兩個是素材與規劃型頻道，只有品牌任務包在用，
 * 產出形狀不是一篇貼文，自建卡的骨架套不上去。
 */
export const COMPOSER_CHANNELS = new Set<string>([
  "facebook", "instagram", "threads", "linkedin", "tiktok",
  "youtube", "email", "pr", "website", "line",
]);

/** 這個通路能不能自建卡：內建清單，或用戶自己加的通路（2026-10-04）。 */
export function isComposerChannel(platform: string): boolean {
  return COMPOSER_CHANNELS.has(platform) || isCustomChannelId(platform);
}

/**
 * 路由片段 → 平台代號。內建通路查表；自訂通路的路由片段就是它的 id（/tasks/c12-shopee）。
 * 都不是就回 undefined（頁面據此導回 /tasks/fb）。
 */
export function routeToPlatform(route: string): string | undefined {
  return ROUTE_TO_PLATFORM[route] ?? (isCustomChannelId(route) ? route : undefined);
}

/** 自訂通路的標頭資料。用戶取的名字當標題；圖示用通用的店面，不假裝成某個平台的 logo。 */
export function customPlatformMeta(name: string): PlatformMeta {
  return { label: name, labelZh: name, icon: faStore, bg: "#18181b" };
}

export function trimmedExtras(bag: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag)) {
    const t = String(v ?? "").trim();
    if (t) out[k] = t;
  }
  return out;
}

// ── Inline positioning-edit helpers (task modal) ─────────────────────────────
// A context chip's `source` is "brand.positioning.<segment>.<field>" (the
// "brand.positioning." prefix is a display convention even in product/event
// scope). Editing must target the raw entity positioning at "<segment>.<field>".
export function chipFieldPath(source: string): string {
  return source.replace(/^brand\.positioning\./, "");
}

export function getNested(obj: any, path: string): any {
  return path.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

/** Immutable deep-set: returns a new object with `path` set to `value`. */
export function setNested(obj: any, path: string, value: any): any {
  const keys = path.split(".");
  const root = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) };
  let cur: any = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    cur[k] = (cur[k] && typeof cur[k] === "object") ? (Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] }) : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]!] = value;
  return root;
}

// Sibling fields offered as one-click "pick a different option" candidates
// when editing a given chip. Keyed by the chip field path (prefix stripped).
export const CHIP_SIBLING_CANDIDATES: Record<string, string[]> = {
  // Product / brand
  "audience.primary":               ["audience.secondary"],
  "competition.uniqueUsp":          ["competition.rareUsp", "competition.commonUsp"],
  "core.coreStatement":             ["core.oneLineValueProp"],
  "value.userFeeling":              ["value.primaryEmotion"],
  // Event
  "audience.primaryAudience":       ["audience.secondaryAudience", "audience.keyInsight"],
  "smp.singleMindedProposition":    ["smp.rationale"],
  "creative.coreTranslation":       ["creative.creativeTheme", "creative.coreMetaphor"],
};

/**
 * 2026-09-28（CJ「按下日曆上的某一篇要寫文章時，直接跳出按下任務卡以後的視窗開始撰寫，
 * 寫完要可以存回日曆，回到左談右曆的畫面」）：本週企劃直接把這一頁的任務視窗疊在自己上面，
 * 不換頁。embed 模式只渲染視窗（不畫頁面本體），產生完帶著 from=planner 去成品頁，
 * 成品頁再用「存回本週企劃」回來。
 */
export interface TaskEmbed {
  route: string;
  taskId: string;
  slotId?: number;
  camp?: { eventId: number; itemId: string };
  topic?: string;
  weekStart?: string;
  /** 這一格排在哪天——成品頁「排程到日曆」預填這天。 */
  slotDate?: string;
  /** 靈感舞台：主體是某個產品／活動時，任務視窗直接選好它，不必再選一次。 */
  entity?: { kind: "product" | "event"; id: number };
  /**
   * 2026-10-02（CJ 活動地圖「點了再寫」）：開窗就直接開始寫，不用再按「立即產出」。
   * 活動已經答得出所有必填才會自動開跑；缺了就停在問題上讓使用者補（不靜默失敗）。
   */
  autoRun?: boolean;
  /** 寫好之後交給呼叫者（不換到成品頁）。沒給就照舊去成品頁。 */
  onWritten?: (outputId: number) => void;
  onClose: () => void;
}
