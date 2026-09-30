/**
 * visualAssets — 視覺頁卡片的定義與顯示規則（純資料與純函式，沒有 React）。
 *
 * 2026-09-26（CJ「除了每一個欄位(任務卡)，品牌視覺色彩(DNA)，也是單獨的任務卡，
 * 其他的標誌或顏色等，目前似乎都很亂，沒有統一性，請幫我整理好整個架構」）。
 *
 * ── 整理前的樣子 ─────────────────────────────────────────────────────
 * 4 組 10 張圖磚（標誌／顏色／字型／圖像風格／圖示風格／圖表風格／視覺準則／
 * 排版規範／照片／品牌範本），每張帶一個粉彩底色，外加最上面一條獨立的色票
 * hero。問題不只是亂：
 *   · **顏色 vs 色彩 DNA 是同一件事講兩次**——hero 那條是從使用者上傳的圖抽出來
 *     的真實色票，而「顏色」那張卡是另一個手填欄位，兩邊不同步。
 *   · **字型當時對產出沒有任何影響**（見下方註解），等於一張裝飾用的卡。
 *   · 十張卡一次攤開，使用者不知道從哪張開始。
 *
 * ── 整理後 ───────────────────────────────────────────────────────────
 * 預設五張，其餘自己加（跟文字頁同一套）：
 *   1. 品牌色彩 DNA —— 併掉原本的「顏色」，是真的會影響生圖的那一份
 *   2. 標誌 —— 上傳
 *   3. 圖像風格 —— 上傳參考圖，AI 歸納風格描述＋AI 提示詞
 *   4. 圖示風格 —— 同上
 *   5. 品牌照片 —— 色彩 DNA 與產品情境圖都吃這一份，所以必須看得見
 *      → 2026-09-30 升級成「素材庫」（見下方 PINNED_VISUAL_KEYS）
 *
 * ── 為什麼沒有字型 ───────────────────────────────────────────────────
 * CJ：「字型可以讓用戶自行上傳(但若是AI無法控制後續產出，我寧願沒有這各功能)」。
 * 實際查證的結果是**控制不了**：
 *   · 生圖：我們刻意不讓模型畫字（中文會生出假字，見 image_text_overlay 的決定），
 *     所以字型對生成的圖沒有作用點。
 *   · 疊層標題：目前用系統字型渲染，沒有讀品牌字型。
 *   · 文案：字型跟文字內容無關。
 * 依他自己的判準，這張卡不做。舊資料（_assets.fonts）不刪，只是不再出現在清單上；
 * 哪天疊層渲染真的吃自訂字型了，把它加回 VISUAL_ASSETS 就會回來。
 */
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faPalette, faPenNib, faImage, faIcons, faImages,
  faShieldHalved, faTableColumns, faChartPie, faFolderOpen,
} from "@fortawesome/free-solid-svg-icons";

/** 這張卡點下去是什麼體驗——決定 modal 裡放什麼。 */
export type VisualCardKind =
  | "dna"       // 色票：上傳圖 → AI 解析，或自己鎖定
  | "upload"    // 檔案上傳（標誌）
  | "gallery"   // 圖片庫（品牌範本）
  | "library"   // 素材庫：全站上傳過的圖，集中挑選、拿去作圖
  | "style"     // 上傳參考圖 → AI 歸納風格描述 + AI 提示詞
  | "text";     // 純文字規範

export interface VisualAssetSpec {
  key: string;
  labelZh: string;
  labelEn: string;
  kind: VisualCardKind;
  icon: IconDefinition;
  /** 填了會影響什麼——使用者決定要不要加的依據，也是誠實說明它有沒有用。 */
  whyZh: string;
  whyEn: string;
}

export const DEFAULT_VISUAL_KEYS = ["colors_dna", "logo", "imagery_style", "icon_style", "library"] as const;

/**
 * 常駐卡：不能刪。2026-09-30（CJ「增加一個常駐的任務卡，是點進去，可以儲存各種他上傳的
 * 照片，他可以自己選取，當成在這邊作圖使用的。也要包括客戶在網站任何地方上傳的視覺」）。
 * 素材庫取代原本的「品牌照片」卡——那張只看得到品牌 scope 的照片，產品照、標誌都不在裡面；
 * 素材庫把全站上傳的圖集中在一起，是作圖時挑主體照片的來源，所以不給刪。
 */
export const PINNED_VISUAL_KEYS: readonly string[] = ["library"];

export const VISUAL_ASSETS: VisualAssetSpec[] = [
  {
    key: "colors_dna", labelZh: "品牌色彩 DNA", labelEn: "Colour DNA", kind: "dna", icon: faPalette,
    whyZh: "生成的每一張圖都會照這組色票", whyEn: "Every generated image follows this palette",
  },
  {
    key: "logo", labelZh: "標誌", labelEn: "Logo", kind: "upload", icon: faPenNib,
    whyZh: "版型與品牌變體會用到你的標誌檔", whyEn: "Used by layouts and branded variants",
  },
  {
    key: "imagery_style", labelZh: "圖像風格", labelEn: "Imagery style", kind: "style", icon: faImage,
    whyZh: "上傳幾張你喜歡的圖，AI 歸納成生圖時的風格指令",
    whyEn: "Upload references — AI turns them into a style directive for image generation",
  },
  {
    key: "icon_style", labelZh: "圖示風格", labelEn: "Icon style", kind: "style", icon: faIcons,
    whyZh: "上傳幾個你喜歡的圖示，AI 歸納成一套可複製的規則",
    whyEn: "Upload icons you like — AI turns them into repeatable rules",
  },
  {
    key: "library", labelZh: "素材庫", labelEn: "Asset library", kind: "library", icon: faImages,
    whyZh: "你在網站各處上傳的圖都收在這裡，挑一張就能拿去作圖",
    whyEn: "Every image you've uploaded, in one place — pick one to make an image with",
  },
  // ── 以下預設不出現，使用者自己加 ──
  {
    key: "guidelines", labelZh: "視覺準則", labelEn: "Visual guidelines", kind: "text", icon: faShieldHalved,
    whyZh: "寫給人看的規範，也會進定位書", whyEn: "Written rules for your team; also enters the positioning book",
  },
  {
    key: "layout_rules", labelZh: "排版規範", labelEn: "Layout rules", kind: "text", icon: faTableColumns,
    whyZh: "留白、對齊、標題層級", whyEn: "Spacing, alignment, heading hierarchy",
  },
  {
    key: "chart_style", labelZh: "圖表風格", labelEn: "Chart style", kind: "text", icon: faChartPie,
    whyZh: "資料視覺化的配色與樣式", whyEn: "Colours and styling for data visuals",
  },
  {
    key: "templates", labelZh: "品牌範本", labelEn: "Templates", kind: "gallery", icon: faFolderOpen,
    whyZh: "現成版型檔案的存放處", whyEn: "Where your ready-made template files live",
  },
];

export function visualSpecOf(key: string): VisualAssetSpec | null {
  return VISUAL_ASSETS.find((a) => a.key === key) ?? null;
}

/**
 * 這張卡有沒有內容。每種 kind 的「有內容」長得不一樣，所以判斷寫在一起，
 * 免得畫面上的 ✓ 與「已填」的定義各自漂移。
 *
 * dna 比較特別：它不存在 _assets 裡（在 brands.brand_colors），所以由呼叫端
 * 把「有沒有色票」當參數傳進來。
 */
export function visualHasContent(key: string, value: any, dnaCount = 0): boolean {
  const spec = visualSpecOf(key);
  if (!spec) return false;
  if (spec.kind === "dna") return dnaCount > 0;
  if (spec.kind === "upload") return !!(value?.primaryUrl || value?.url);
  if (spec.kind === "gallery") return Array.isArray(value?.items) ? value.items.length > 0 : !!value?.count;
  // 素材庫的內容在 asset_photos，不在 _assets——由呼叫端把張數放進 value.count。
  if (spec.kind === "library") return !!value?.count;
  if (spec.kind === "style") return !!(value?.text?.trim() || value?.prompt?.trim());
  return typeof value?.text === "string" && value.text.trim().length > 0;
}

/**
 * 顯示哪幾張：預設五張 ∪ 使用者加的 ∪ 已經有內容的。
 * 最後一項不能少——既有品牌填過「視覺準則」，改版後看不到會以為資料被清掉。
 */
export function visibleVisualKeys(
  added: string[],
  assets: Record<string, any>,
  dnaCount = 0,
): string[] {
  const set = new Set<string>([...DEFAULT_VISUAL_KEYS, ...(added ?? [])]);
  for (const a of VISUAL_ASSETS) {
    if (visualHasContent(a.key, assets?.[a.key], dnaCount)) set.add(a.key);
  }
  return VISUAL_ASSETS.filter((a) => set.has(a.key)).map((a) => a.key);
}
