/**
 * 任務 modal 的品牌脈絡：每個 contextSources 路徑對應一個圖示＋兩三個字的短名。
 *
 * 2026-09-30（CJ「上面這幾列很浪費空間…Tesla 的介面很少文字，複雜文字都在第二層」）：
 * 原本每條脈絡是一顆黑底長 chip，五六條就佔掉半個 modal。現在第一層只剩圖示＋短名，
 * 點下去才看完整內容／改寫。
 *
 * 涵蓋範圍＝taskContextResolver 的 PATH_LABELS 全部路徑＋任務卡實際用到的
 * contextSources（含 brand.positioning.values、product.positioning.*）。
 * 查不到的路徑退回通用圖示，短名用 chip 本身的欄位名——不會因為新路徑而消失。
 */
import type { IconName } from "../../platform/components/icons";

export interface ContextChipIcon {
  icon: IconName;
  /** 圖示下方的短名（中文） */
  short: string;
  shortEn: string;
}

const P = "brand.positioning.";

export const CONTEXT_CHIP_ICONS: Record<string, ContextChipIcon> = {
  // 名稱：品牌／產品／活動範圍都走 brand.name（顯示的是該實體的名字）
  "brand.name":                             { icon: "brand",      short: "名稱",   shortEn: "Name" },
  "brand.industry":                         { icon: "building",   short: "產業",   shortEn: "Industry" },
  // 品牌
  [`${P}goldenCircle`]:                     { icon: "why",        short: "WHY",    shortEn: "Why" },
  [`${P}goldenCircle.why`]:                 { icon: "why",        short: "WHY",    shortEn: "Why" },
  [`${P}tagline.zhTagline`]:                { icon: "quote",      short: "標語",   shortEn: "Tagline" },
  [`${P}audience.primary`]:                 { icon: "people",     short: "受眾",   shortEn: "Audience" },
  [`${P}audience.matrix`]:                  { icon: "feeling",    short: "情感",   shortEn: "Emotion" },
  [`${P}competition.direct`]:               { icon: "competitor", short: "競品",   shortEn: "Rivals" },
  [`${P}competition.indirect`]:             { icon: "competitor", short: "間接競品", shortEn: "Indirect" },
  [`${P}differentiation`]:                  { icon: "standout",   short: "差異化", shortEn: "Edge" },
  [`${P}differentiation.summary`]:          { icon: "standout",   short: "差異化", shortEn: "Edge" },
  [`${P}voice`]:                            { icon: "tone",       short: "語氣",   shortEn: "Voice" },
  [`${P}voice.archetypes`]:                 { icon: "persona",    short: "原型",   shortEn: "Archetype" },
  [`${P}voice.tone`]:                       { icon: "tone",       short: "語氣",   shortEn: "Tone" },
  [`${P}voice.forbidden`]:                  { icon: "forbidden",  short: "禁用",   shortEn: "Avoid" },
  [`${P}values`]:                           { icon: "values",     short: "價值觀", shortEn: "Values" },
  [`${P}trends`]:                           { icon: "trend",      short: "趨勢",   shortEn: "Trends" },
  // 產品
  [`${P}core.coreStatement`]:               { icon: "target",     short: "定位",   shortEn: "Position" },
  [`${P}core.oneLineValueProp`]:            { icon: "target",     short: "主張",   shortEn: "Promise" },
  [`${P}value.userFeeling`]:                { icon: "feeling",    short: "感受",   shortEn: "Feeling" },
  [`${P}value.primaryEmotion`]:             { icon: "feeling",    short: "情緒",   shortEn: "Emotion" },
  [`${P}competition.uniqueUsp`]:            { icon: "standout",   short: "賣點",   shortEn: "USP" },
  [`${P}marketing.tone`]:                   { icon: "tone",       short: "語氣",   shortEn: "Tone" },
  [`${P}marketing.style`]:                  { icon: "palette",    short: "風格",   shortEn: "Style" },
  "product.positioning.coreStatement":      { icon: "target",     short: "定位",   shortEn: "Position" },
  "product.positioning.usp":                { icon: "standout",   short: "賣點",   shortEn: "USP" },
  // 活動
  [`${P}audience.primaryAudience`]:         { icon: "people",     short: "受眾",   shortEn: "Audience" },
  [`${P}smp.singleMindedProposition`]:      { icon: "target",     short: "SMP",    shortEn: "SMP" },
  [`${P}messaging.coreMessage`]:            { icon: "message",    short: "訊息",   shortEn: "Message" },
  [`${P}creative.coreTranslation`]:         { icon: "ideas",      short: "創意",   shortEn: "Hook" },
  [`${P}context.coreProblem`]:              { icon: "puzzle",     short: "問題",   shortEn: "Problem" },
};

export function contextChipIcon(source: string, fallbackName: string): ContextChipIcon {
  return CONTEXT_CHIP_ICONS[source] ?? { icon: "dot", short: fallbackName, shortEn: fallbackName };
}
