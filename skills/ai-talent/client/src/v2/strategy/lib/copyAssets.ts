/**
 * copyAssets — 文字頁卡片的定義與顯示規則（純資料與純函式，沒有 React）。
 *
 * 2026-09-26（CJ「一開始，只要出現推薦用詞、禁用詞與縮寫對照就好，其他的欄位，
 * 都提供新增的卡片的選項」）：規則本身要測得動，所以跟元件分開——元件會把整個
 * HeroUI 拖進測試環境，測試根本載不起來（日曆那次同一個坑）。
 */
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faQuoteLeft, faShieldHalved, faFont, faPenToSquare, faAward, faBoxOpen, faHashtag, faCommentDots, faFileLines,
} from "@fortawesome/free-solid-svg-icons";

export type CopyShape = "text" | "items" | "pairs";

export interface CopyAssetSpec {
  key: string;
  labelZh: string;
  labelEn: string;
  shape: CopyShape;
  icon: IconDefinition;
  /** 這張卡填了會影響什麼——使用者決定要不要加的依據。 */
  whyZh: string;
  whyEn: string;
}

/** 預設就出現的三張。 */
export const DEFAULT_COPY_KEYS = ["preferred_terms", "banned_words", "abbreviations"] as const;

export const COPY_ASSETS: CopyAssetSpec[] = [
  { key: "preferred_terms", labelZh: "推薦用詞", labelEn: "Preferred terms", shape: "items", icon: faFont,
    whyZh: "產出文案時優先使用這些說法", whyEn: "Copy will prefer these wordings" },
  { key: "banned_words", labelZh: "禁用詞", labelEn: "Banned words", shape: "items", icon: faShieldHalved,
    whyZh: "產出時硬檢查，出現就自動改掉", whyEn: "Hard-checked on every output and rewritten" },
  { key: "abbreviations", labelZh: "縮寫對照", labelEn: "Abbreviations", shape: "pairs", icon: faHashtag,
    whyZh: "同一個東西只有一種叫法", whyEn: "One name per thing" },
  { key: "term_substitutions", labelZh: "替換對照", labelEn: "Substitutions", shape: "pairs", icon: faPenToSquare,
    whyZh: "寫到 A 自動換成 B", whyEn: "Swap A for B automatically" },
  { key: "voice", labelZh: "品牌口吻", labelEn: "Brand voice", shape: "text", icon: faQuoteLeft,
    whyZh: "文案的語氣基調", whyEn: "The tone every post is written in" },
  { key: "voice_principles", labelZh: "品牌準則", labelEn: "Voice principles", shape: "items", icon: faShieldHalved,
    whyZh: "口吻的具體守則", whyEn: "Concrete rules behind the tone" },
  { key: "branded_terms", labelZh: "品牌術語", labelEn: "Brand terms", shape: "items", icon: faAward,
    whyZh: "只有你們這樣講的詞", whyEn: "Words only your brand uses" },
  { key: "product_naming", labelZh: "產品名稱規範", labelEn: "Product naming", shape: "text", icon: faBoxOpen,
    whyZh: "產品要怎麼寫全名與簡稱", whyEn: "How product names are written" },
  { key: "cta_library", labelZh: "CTA 庫", labelEn: "CTA library", shape: "items", icon: faCommentDots,
    whyZh: "常用的行動呼籲說法", whyEn: "Reusable calls to action" },
  { key: "hook_library", labelZh: "Hook 庫", labelEn: "Hook library", shape: "items", icon: faQuoteLeft,
    whyZh: "開場鉤子的口袋名單", whyEn: "Openers you keep coming back to" },
  { key: "templates_copy", labelZh: "文案範本", labelEn: "Copy templates", shape: "items", icon: faFileLines,
    whyZh: "固定格式的段落範本", whyEn: "Reusable paragraph templates" },
];

export function specOf(key: string): CopyAssetSpec | null {
  return COPY_ASSETS.find((a) => a.key === key) ?? null;
}

/** 這張卡有沒有內容——判斷規則跟 InlineAssetCard 的 isFilled 一致。 */
export function hasContent(value: any, shape: CopyShape): boolean {
  if (!value) return false;
  if (shape === "text") return typeof value.text === "string" && value.text.trim().length > 0;
  if (shape === "items") return Array.isArray(value.items) && value.items.some((x: any) => typeof x === "string" && x.trim());
  return Array.isArray(value.pairs) && value.pairs.some((p: any) => p?.from?.trim() && p?.to?.trim());
}

/** 幾條內容——卡片上顯示的數字。 */
export function countOf(value: any, shape: CopyShape): number {
  if (!value) return 0;
  if (shape === "text") return typeof value.text === "string" && value.text.trim() ? 1 : 0;
  if (shape === "items") return (value.items ?? []).filter((x: any) => typeof x === "string" && x.trim()).length;
  return (value.pairs ?? []).filter((p: any) => p?.from?.trim() && p?.to?.trim()).length;
}

/** 卡片上那兩行預覽：直接顯示實際內容，而不是「已填寫」這種沒資訊的狀態字。 */
export function previewOf(value: any, shape: CopyShape): string {
  if (!value) return "";
  if (shape === "text") return String(value.text ?? "").trim();
  if (shape === "items") {
    return (value.items ?? []).filter((x: any) => typeof x === "string" && x.trim()).slice(0, 6).join("、");
  }
  return (value.pairs ?? [])
    .filter((p: any) => p?.from?.trim() && p?.to?.trim())
    .slice(0, 4).map((p: any) => `${p.from} → ${p.to}`).join("、");
}

/**
 * 顯示哪幾張：預設三張 ∪ 使用者加的 ∪ 已經有內容的。順序照 COPY_ASSETS，
 * 這樣加卡片不會讓既有卡片跳位。
 */
export function visibleKeys(added: string[], drafts: Record<string, any>): string[] {
  const set = new Set<string>([...DEFAULT_COPY_KEYS, ...(added ?? [])]);
  for (const a of COPY_ASSETS) {
    if (hasContent(drafts?.[a.key], a.shape)) set.add(a.key);
  }
  return COPY_ASSETS.filter((a) => set.has(a.key)).map((a) => a.key);
}

