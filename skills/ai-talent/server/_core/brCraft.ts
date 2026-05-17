/**
 * Brand Strategy craft layer — 2026-05-17.
 * Faithful mirror of igCraft.ts / edmCraft.ts: brand-AGNOSTIC craft
 * discipline (the HOW) for the BR family only. Injected only for
 * br-family body tasks so other platforms are completely unaffected.
 *
 * Brand strategy is about owning a mental space in competition — not
 * describing features. The rubric encodes positioning, naming,
 * voice, and manifesto craft plus zh-TW Taiwan market localisation.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * Is this a Brand Strategy task?
 * Covers br-* templates exclusively.
 */
export function isBrandStrategyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  return id.startsWith("br-");
}

/** All BR tasks are full-body outputs — no atomic fragments to exclude. */
export function isBrandStrategyBodyTask(template: FBTaskTemplate): boolean {
  return isBrandStrategyTask(template);
}

/** The award-grade Brand Strategy rubric. */
export const BR_CRAFT_RUBRIC = `
# 品牌策略得獎級工藝準則（嚴格遵守）
品牌定位是在競爭中佔據一個心智空間——不是描述功能，是宣告立場：
【定位 craft】
- 定位聲明公式：For [目標受眾], [品牌] is the [類別] that [獨特價值]，因為 [可信度證明]。
- 心智空間測試：你的定位詞語能否讓目標受眾在聽到品牌名稱時「自動聯想」到那個空間？
- 競爭定義：最好的定位都在定義敵人（對抗什麼），不只描述自己是什麼。
- 五年測試：tagline 必須在五年後仍然成立；去掉所有流行詞（disruptive、innovative、seamless）。
【Tagline craft】
- 3-8 個字：夠短以便記憶、夠長以便有意義。
- 跨受眾/產品/文化皆適用；不能只適用今天的產品。
- 有動詞或隱含動詞；給受眾一個行動框架，不是品牌一個形容詞。
【品牌聲音 craft】
- 具體不通用：「我們永遠不會說什麼」比「我們的語氣是友善的」更有用。
- Forbidden words list（禁用詞清單）是品牌個性的負空間定義。
- 一致性測試：任何人寫出的品牌文案都能被辨認出是這個品牌。
【品牌宣言 craft】
- 宣言要付出代價：品牌說的立場必須讓某些人不舒服，才算是真正的立場。
- 從信念出發，不從產品出發；受眾是信念的同盟者，不是功能的使用者。
【命名 craft】
- 音韻美學（Phonaesthetics）：音節數、母音組合、聲音意象都影響感知。
- 意義層次：字面義＋隱喻義＋情感義；可以是虛構字但需有聯想錨點。
- 商標可用性評估：命名前確認領域與市場的法律可用性。
【zh-TW 在地化｜最高優先】
- 台灣消費市場：在地品牌（85度C/大苑子/誠品）與全球品牌並存；定位必須在此競爭格局中有意義。
- 命名任務：中文音韻（注音結構）＋字義聯想＋書寫美感三維度；不能只翻譯英文名。
- 繁體中文、台灣語境；避免中國大陸市場用詞與文化指涉。
`.trim();

/**
 * Per-task award reference — transferable craft pattern per task.
 */
const BR_TASK_REF: Record<string, string> = {
  "br-30-positioning":     "Apple「Think Different」品牌定位（Cannes Lions Hall of Fame）：定位＝佔領心智空間而非描述功能；「不同凡想」對抗的是墨守成規，不是競爭對手產品。",
  "br-30-tagline":         "Nike「Just Do It」tagline（Cannes Lions Hall of Fame）：3 個字跨所有產品/受眾/文化皆成立；動詞框架給受眾行動身分，非品牌形容詞。",
  "br-30-value-prop":      "Airbnb「Belong Anywhere」價值主張（Cannes Lions Grand Prix Titanium 2014）：一句話橋接功能利益（住任何地方）＋情感利益（真正屬於）。",
  "br-30-brand-voice":     "Mailchimp 品牌聲音與語氣指南（Webby Award Best UX Writing）：業界標準品牌聲音文件；用具體例子（寫/不寫）定義語氣，非抽象形容詞。",
  "br-30-manifesto":       "Patagonia「Don't Buy This Jacket」品牌宣言（Cannes Lions PR Grand Prix 2013）：宣言需付出代價——讓品牌放棄短期利益才是真正的立場，而非行銷語言。",
  "br-30-naming":          "Häagen-Dazs 命名策略（Harvard Business School Case Study）：虛構的外語感名字創造高端感知；音韻美學先於字義，感知先於事實。",
  "br-30-archetype":       "Dove「真實美麗」品牌原型演進（Cannes Lions Grand Prix Titanium + Effie Grand Prix）：從美妝品牌重定位為社會使命；原型轉換需要全面行為改變，不只換 slogan。",
  "br-30-competitor-map":  "Apple vs IBM「1984」競爭定位（Cannes Lions Grand Prix）：透過定義敵人來定義自己；競爭地圖最有力的軸線是受眾在乎的價值取捨，非功能清單。",
  "br-30-elevator-pitch":  "Slack 早期 Beta 測試 Elevator Pitch（Andreessen Horowitz 投資案例；「email killer」重新定義工作通訊品類）：90 秒讓聽者看到不同的競爭地圖——競爭對手不是 HipChat，是「電子郵件這個習慣」；最強 pitch 都在重新定義品類，不在強調功能。",
  "br-30-forbidden-words": "Innocent Drinks 品牌聲音指南（Marketing Week Brand of the Year）：禁用詞清單透過「排除」定義品牌個性；負空間比正空間更精確。",
  "br-60-tagline-suite":   "Old Spice 品牌重定位 tagline 套組（Cannes Lions Grand Prix Titanium 2010）：套組＝一個策略主張的多執行角度；不同 tagline 攻不同受眾但出自同一核心。",
  "br-60-value-prop":      "Spotify Premium 價值主張套組（Cannes Lions Grand Prix）：價值主張層次由功能→情感→身分認同遞進；每層吸引不同決策階段的受眾。",
  "br-60-brand-voice":     "Oatly 品牌聲音指南（Cannes Lions Grand Prix Copywriting）：聲音指南本身就是娛樂，不是操作手冊；把規則寫成品牌範例本身。",
  "br-99-reposition-toolkit":"Burberry 數位品牌重定位工具包（Cannes Lions Grand Prix Cyber 2015）：完整重定位＝新視覺識別＋聲音＋平台行為全面改變；三者缺一視為失敗。",
  "br-99-voice-playbook":  "Innocent Drinks 完整聲音 playbook（Cannes Lions Bronze Craft Copywriting）：聲音 playbook 讓品牌從 0 成長至 £1 億而不靠廣告；聲音本身是成長引擎。",
};

/** Per-use-case playbook — keyed by taskId pattern. */
export function brPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = BR_TASK_REF[id];
  const P = (s: string) =>
    `# 本任務 playbook（品牌策略得獎模式）\n${s}` +
    (ref ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${ref}` : "");

  if (/positioning/.test(id))
    return P("定位聲明：For [受眾]，[品牌] is the [類別] that [獨特價值]；心智空間測試：聽到品牌名自動聯想到什麼？定義敵人比描述自己更有力。");
  if (/tagline/.test(id) && !(/suite/.test(id)))
    return P("3-8 字、動詞框架、五年測試、跨受眾成立；刪掉所有流行詞（innovative/seamless/disruptive）。");
  if (/tagline-suite/.test(id))
    return P("套組＝一個策略主張的多執行角度；每個 tagline 攻不同受眾但必須出自同一核心定位。");
  if (/value-prop/.test(id))
    return P("價值主張層次：功能利益→情感利益→身分認同；Airbnb 模型：一句橋接兩層。");
  if (/brand-voice/.test(id))
    return P("具體不通用：列「會說/不會說」的具體例子；禁用詞清單比形容詞清單更有效；一致性測試。");
  if (/manifesto/.test(id))
    return P("宣言要付出代價：必須讓品牌放棄某些短期利益；從信念出發不從產品出發；受眾是同盟者。");
  if (/naming/.test(id))
    return P("音韻美學（音節/母音/聲音意象）＋意義層次（字面/隱喻/情感）＋商標可用性；中文命名加注音結構＋字義聯想＋書寫美感。");
  if (/archetype/.test(id))
    return P("品牌原型定義受眾情感關係；原型轉換需全面行為改變（視覺/語言/產品/通路）；不只換 slogan。");
  if (/competitor-map/.test(id))
    return P("競爭地圖軸線必須是受眾在乎的價值取捨；透過定義敵人來定義自己；最強定位都有對立面。");
  if (/elevator-pitch/.test(id))
    return P("90 秒內重新定義品類；工作是讓聽者看到不同競爭地圖；結尾有具體下一步行動。");
  if (/forbidden-words/.test(id))
    return P("禁用詞清單透過負空間定義品牌個性；每條禁令附上替代方向；越具體越有效。");
  if (/reposition/.test(id))
    return P("重定位三件套：新視覺識別＋新聲音＋新平台行為；三者必須同步，任一落後即失效。");
  if (/voice-playbook/.test(id))
    return P("聲音 playbook＝完整行為指南而非形容詞清單；用真實內容範例教，不只說規則；品牌聲音是成長引擎。");

  return P("品牌策略通用：定位先於創意、心智空間先於功能描述、五年測試、具體勝過抽象。");
}
