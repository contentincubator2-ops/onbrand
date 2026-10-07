/**
 * brandVoice — 建品牌時丟參考文章，學成這個品牌自己的寫法。
 *
 * 2026-10-07（CJ「我要在流程中，增加這件事情」）：
 *   1. 依類別丟文章（產品介紹／節慶活動／知識教育／品牌故事／互動閒聊），每類 2–5 篇；
 *      系統自動分類，分錯可拖曳改
 *   2. 每一類量出字數、語氣、結構、常用詞，反推成該品牌的寫法
 *   3. 每一類一篇試寫（用品牌自己的產品當題目），左右對照原文
 *   4. 按「像」或「不像＋哪裡不像」，修到像為止；確認後每類變成一張品牌專屬任務卡，
 *      語氣寫進品牌大腦
 *   沒文章可丟的新品牌退回原本的流程，不擋路。
 *
 * 這條線刻意**沿用自建任務卡的管線**（brandTaskCards：貼成品 → 反推 SKILL → 試寫 → 上架），
 * 不另起一套：每一類就是一張 `origin: "voice"` 的自建卡，反推、字數量測、事實洩漏三件套、
 * 試寫、上架全走同一份程式。這支只放這條線自己多出來的東西：類別、分類結果解析、
 * 語氣／常用詞、寫進品牌大腦的那一段文字。全部是純函式，router 在 brandVoiceRouter。
 */
import type { BrandTaskCard } from "./brandTaskCards";

export type VoiceCategoryId = "product" | "festival" | "knowledge" | "story" | "chat";

export interface VoiceCategory {
  id: VoiceCategoryId;
  zh: string;
  en: string;
  /** 給分類模型看的判斷依據。 */
  hint: string;
  /** 這一類的卡每次執行要問的主問題。 */
  question: string;
  placeholder: string;
  /** 品牌沒有任何產品資料時的試寫題目（{brand} 換成品牌名）。 */
  fallbackTopic: string;
}

export const VOICE_CATEGORIES: readonly VoiceCategory[] = [
  {
    id: "product", zh: "產品介紹", en: "Product",
    hint: "介紹某個產品或服務：特色、規格、用法、新品上市、開箱",
    question: "這次要介紹哪個產品？想講的重點是什麼",
    placeholder: "例：新口味上市，主打少糖、冷泡也好喝",
    fallbackTopic: "介紹{brand}最具代表性的一項產品或服務",
  },
  {
    id: "festival", zh: "節慶活動", en: "Festival & promo",
    hint: "節慶、檔期、優惠、促銷、抽獎、活動公告與活動回顧",
    question: "這次是哪個節慶或活動？時間、優惠內容是什麼",
    placeholder: "例：母親節檔期，5/1–5/12 全館滿千折百",
    fallbackTopic: "{brand}下一個節慶檔期的活動預告",
  },
  {
    id: "knowledge", zh: "知識教育", en: "Education",
    hint: "教學、知識、觀念、懶人包、迷思破解、使用技巧",
    question: "這次要教什麼？想讓讀者學會或搞懂哪件事",
    placeholder: "例：為什麼冷泡茶不苦澀，三個關鍵",
    fallbackTopic: "{brand}的顧客最常問的一個問題，把觀念講清楚",
  },
  {
    id: "story", zh: "品牌故事", en: "Brand story",
    hint: "品牌理念、創辦緣起、團隊與幕後、顧客故事、價值觀",
    question: "這次要說哪一段故事？主角是誰、發生了什麼",
    placeholder: "例：創辦人第一次去產地找茶農的那一天",
    fallbackTopic: "{brand}為什麼開始做這件事",
  },
  {
    id: "chat", zh: "互動閒聊", en: "Chat & engagement",
    hint: "跟粉絲聊天、問答、投票、日常、時事哏、不賣東西的輕鬆貼文",
    question: "這次想跟粉絲聊什麼",
    placeholder: "例：週一上班症候群，大家都怎麼撐過去",
    fallbackTopic: "{brand}跟粉絲聊聊最近的日常",
  },
];

export const VOICE_CATEGORY_IDS = VOICE_CATEGORIES.map((c) => c.id) as VoiceCategoryId[];

export function voiceCategory(id: string): VoiceCategory | null {
  return VOICE_CATEGORIES.find((c) => c.id === id) ?? null;
}

/** 一類至少要幾篇才學。一篇量不出「共同點」，只會把那一篇抄成規則。 */
export const VOICE_MIN_PER_CATEGORY = 2;
/** 一類最多收幾篇（建議 2–5；多貼不擋，但超過這個數就只取前面的）。 */
export const VOICE_MAX_PER_CATEGORY = 10;
/** 一次最多貼幾篇。 */
export const VOICE_MAX_ARTICLES = 40;
/** 單篇最短字數（跟自建卡的範例下限一致）。 */
export const VOICE_MIN_ARTICLE_CHARS = 20;

/** 這一類的卡 id：一個品牌一類只有一張，所以 id 固定，重跑是覆蓋不是再長一張。 */
export function voiceCardId(brandId: number, category: VoiceCategoryId): string {
  return `u${brandId}-voice-${category}`;
}

export interface VoiceProfile {
  /** 語氣：一兩句、要具體（誰對誰說話、用什麼口吻）。 */
  tone: string;
  /** 結構：開場 → 中段 → 收尾各做什麼。 */
  structure: string;
  /** 常用詞：逐字出現在範例裡的，附出現在幾篇。 */
  phrases: { text: string; count: number }[];
}

/**
 * 這張卡在「學寫法」流程裡的狀態。掛在 BrandTaskCard.voice。
 *
 * phase：
 *   learning  反推寫法＋量語氣常用詞中
 *   writing   試寫中
 *   review    試寫好了，等使用者按像／不像
 *   revising  使用者說不像，照他講的修 SKILL 中（修完自動再試寫）
 *   failed    卡住了（原因在 card.lastError）
 */
export interface VoiceState {
  category: VoiceCategoryId;
  phase: "learning" | "writing" | "review" | "revising" | "failed";
  profile: VoiceProfile | null;
  /** 試寫用的題目。 */
  topic: string;
  /** 使用者的判定。null＝還沒按。 */
  verdict: "like" | "unlike" | null;
  /** 修了幾輪（按過幾次不像）。 */
  rounds: number;
  /** 使用者每一輪說的「哪裡不像」，修的時候全部帶著，避免修了新的、舊的又跑回來。 */
  notes: string[];
}

/**
 * 學寫法的卡不佔「自建任務卡」的方案額度。
 *
 * 試用方案只有 1 張、基礎 3 張，而這個流程一次最多五類——照算的話，新用戶建品牌的
 * 第一步就會撞到額度。這些卡是品牌設定的一部分（一類一張、最多五張），不是用戶
 * 另外開的卡。
 */
export function countsTowardCardQuota(card: Pick<BrandTaskCard, "origin">): boolean {
  return card.origin !== "voice";
}

// ─────────────────────────────────────────────────────────────────────
// 貼上的一大段 → 一篇一篇
// ─────────────────────────────────────────────────────────────────────
/**
 * 把一次貼上的多篇文章切開。分隔方式（擇一即可）：
 *   - 單獨一行的 `---`、`===`、`＊＊＊`（三個以上的同一符號）
 *   - 連續三行以上的空行
 * 只有一個空行不切——貼文本身就有分段。
 */
export function splitArticles(text: string): string[] {
  const norm = text.replace(/\r\n?/g, "\n");
  return norm
    .split(/\n[ \t　]*(?:-{3,}|={3,}|\*{3,}|＊{3,}|—{3,}|_{3,})[ \t　]*\n|\n(?:[ \t　]*\n){3,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= VOICE_MIN_ARTICLE_CHARS);
}

// ─────────────────────────────────────────────────────────────────────
// 自動分類
// ─────────────────────────────────────────────────────────────────────
/**
 * 拿掉幾乎一樣的文章（同一篇貼了兩次、同一篇的不同版本）。留先出現的那篇。
 *
 * 2026-10-07 DEV 用真實範例實跑：四篇「品牌故事」裡有三篇是同一篇的改版，於是
 * 「反覆出現的常用詞」量到的全是那一篇的內文（「從一個車庫裡的實驗」×3），
 * 字數區間與結構也等於只看了一篇。學寫法要的是**不同文章之間**的共同點。
 *
 * 判斷：把文章切成 8 字的片段，兩篇共有的片段佔較短那篇的一半以上就算同一篇。
 */
export function dropNearDuplicates(articles: string[]): string[] {
  const grams = (t: string): Set<string> => {
    const chars = [...squash(t)];
    const set = new Set<string>();
    for (let i = 0; i + 8 <= chars.length; i += 4) set.add(chars.slice(i, i + 8).join(""));
    return set;
  };
  const kept: { text: string; g: Set<string> }[] = [];
  for (const a of articles) {
    const g = grams(a);
    const dup = kept.some((k) => {
      const [small, big] = g.size <= k.g.size ? [g, k.g] : [k.g, g];
      if (small.size === 0) return squash(a) === squash(k.text);
      let shared = 0;
      for (const x of small) if (big.has(x)) shared++;
      return shared / small.size >= 0.5;
    });
    if (!dup) kept.push({ text: a, g });
  }
  return kept.map((k) => k.text);
}

/** 給分類模型看的編號清單。只秀開頭——判斷類別不需要全文。 */
export function renderForClassify(articles: string[], previewChars = 500): string {
  return articles
    .map((a, i) => {
      const t = a.trim().replace(/\n{2,}/g, "\n");
      return `[${i + 1}] ${t.length > previewChars ? `${t.slice(0, previewChars)}…` : t}`;
    })
    .join("\n\n");
}

/**
 * 解析分類結果。期待 {"items":[{"n":1,"cat":"product"}]}，也吃 {"1":"product"} 與
 * 被截斷的 JSON（逐筆用正則撈）。沒被分到、或類別不認得的回 null（＝未分類，交給使用者拖）。
 */
export function parseClassification(body: string, count: number): (VoiceCategoryId | null)[] {
  const out: (VoiceCategoryId | null)[] = Array.from({ length: count }, () => null);
  const put = (n: unknown, cat: unknown) => {
    const i = Number(n);
    const c = String(cat ?? "").trim().toLowerCase();
    if (!Number.isInteger(i) || i < 1 || i > count) return;
    if ((VOICE_CATEGORY_IDS as string[]).includes(c)) out[i - 1] = c as VoiceCategoryId;
  };
  const a = body.indexOf("{"), b = body.lastIndexOf("}");
  let parsed = false;
  if (a >= 0 && b > a) {
    try {
      const j = JSON.parse(body.slice(a, b + 1));
      if (Array.isArray(j?.items)) {
        for (const it of j.items) put(it?.n ?? it?.i ?? it?.id, it?.cat ?? it?.category);
      } else if (j && typeof j === "object") {
        for (const [k, v] of Object.entries(j)) put(k, v);
      }
      parsed = true;
    } catch { /* 往下用正則撈 */ }
  }
  if (!parsed) {
    for (const m of body.matchAll(/"?n"?\s*[:=]\s*(\d+)[^a-z]{1,20}"?cat(?:egory)?"?\s*[:=]\s*"?([a-z]+)/gi)) put(m[1], m[2]);
  }
  return out;
}

/** 分類結果 → 每一類的文章（依原順序）。未分類的不在裡面。 */
export function groupByCategory(
  articles: string[], assignments: (VoiceCategoryId | null)[],
): Record<VoiceCategoryId, string[]> {
  const groups = Object.fromEntries(VOICE_CATEGORY_IDS.map((id) => [id, [] as string[]])) as Record<VoiceCategoryId, string[]>;
  articles.forEach((a, i) => {
    const c = assignments[i];
    if (c) groups[c].push(a);
  });
  return groups;
}

// ─────────────────────────────────────────────────────────────────────
// 語氣／結構／常用詞
// ─────────────────────────────────────────────────────────────────────
const squash = (t: string) => t.replace(/[\s　]+/g, "");

/**
 * 常用詞只留**真的逐字出現在範例裡**的，次數由我們數，不採信模型報的數字。
 *
 * 「常用詞」是要寫進品牌大腦、之後每一篇都會讀到的東西。模型很會編聽起來像這個品牌
 * 會說的詞；編出來的詞一旦進了大腦，之後每篇都會被要求用一個品牌從沒用過的說法。
 *
 * 另外丟掉：
 *   - 只出現在一篇的（那是那一篇的內容，不是習慣）
 *   - 含兩位數以上數字的（價格、日期、數量——跟 SKILL 的事實洩漏是同一件事）
 *   - 太短（兩個字以下：「我們」「故事」「留言」這種每個品牌都會用的普通詞）或太長（整句照抄）
 *   - 被另一個留下來的詞整個包住、出現篇數又沒有比較多的（留「嗨茶友們」就不必再留「茶友」）
 */
export function verifiedPhrases(candidates: unknown[], samples: string[], max = 10): VoiceProfile["phrases"] {
  const hay = samples.map(squash);
  const seen = new Set<string>();
  const out: VoiceProfile["phrases"] = [];
  for (const c of candidates) {
    const text = String((c as any)?.text ?? c ?? "").trim();
    const needle = squash(text);
    if ([...needle].length < 3 || [...needle].length > 14) continue;
    if (/\d{2,}/.test(needle)) continue;
    if (seen.has(needle)) continue;
    const count = hay.filter((h) => h.includes(needle)).length;
    if (count < Math.min(2, samples.length)) continue;
    seen.add(needle);
    out.push({ text, count });
  }
  const kept = out.filter((p) => !out.some((q) =>
    q !== p && squash(q.text).length > squash(p.text).length && squash(q.text).includes(squash(p.text)) && q.count >= p.count));
  return kept.sort((x, y) => y.count - x.count).slice(0, max);
}

const TONE_MAX = 90;
const STRUCTURE_MAX = 110;
const clipText = (t: unknown, max: number) => {
  // 句尾標點拿掉：這幾句之後會用「；」接成一行，留著會變成「。；」。
  const s = String(t ?? "").replace(/\s+/g, " ").trim().replace(/[。.；;，,、]+$/, "");
  const chars = [...s];
  return chars.length <= max ? s : `${chars.slice(0, max - 1).join("")}…`;
};

/** 解析模型回的 {"tone","structure","phrases":[…]}。解析不出來回 null（這一類就不顯示語氣，不擋流程）。 */
export function parseVoiceProfile(body: string, samples: string[]): VoiceProfile | null {
  const a = body.indexOf("{"), b = body.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try { j = JSON.parse(body.slice(a, b + 1)); } catch { return null; }
  const tone = clipText(j?.tone, TONE_MAX);
  const structure = clipText(j?.structure, STRUCTURE_MAX);
  if (!tone && !structure) return null;
  return { tone, structure, phrases: verifiedPhrases(Array.isArray(j?.phrases) ? j.phrases : [], samples) };
}

// ─────────────────────────────────────────────────────────────────────
// 試寫題目
// ─────────────────────────────────────────────────────────────────────
/**
 * 用品牌自己的產品當題目。有產品就輪流取（五類不要全寫同一支）；
 * 一支都沒有就用該類別的通用題目——仍然是這個品牌的題目，不是範例那一篇的題目。
 */
export function pickTrialTopic(category: VoiceCategory, brandName: string, productNames: string[], index: number): string {
  const brand = brandName.trim() || "我們";
  const names = productNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return category.fallbackTopic.replace("{brand}", brand);
  const product = names[index % names.length]!;
  switch (category.id) {
    case "product":   return `介紹「${product}」`;
    case "festival":  return `「${product}」的檔期活動預告`;
    case "knowledge": return `跟「${product}」有關、顧客最常問的一個問題`;
    case "story":     return `「${product}」是怎麼做出來的`;
    case "chat":      return `跟粉絲聊聊「${product}」的日常使用情境`;
  }
}

// ─────────────────────────────────────────────────────────────────────
// 寫進品牌大腦
// ─────────────────────────────────────────────────────────────────────
/**
 * 語氣寫到文字頁的「品牌口吻」（positioning._assets.voice.text）。
 *
 * 選這一格的原因：它本來就進所有生文的 prompt（brandContext 的「聲音指南」），
 * 使用者在策略層文字頁看得到也改得了，「記憶」頁會自動列出來——不用另開一個
 * 使用者找不到的欄位。
 *
 * 我們寫的那一段用頭尾標記包起來：重跑時只換掉自己那一段，使用者自己寫在
 * 同一格裡的其他內容不動。
 */
export const VOICE_BLOCK_START = "【從你的文章學到的寫法】";
export const VOICE_BLOCK_END = "【以上依參考文章整理】";

export interface VoiceBlockEntry {
  category: VoiceCategoryId;
  measured: BrandTaskCard["measured"];
  profile: VoiceProfile | null;
}

export function buildVoiceBlock(entries: VoiceBlockEntry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    const cat = voiceCategory(e.category);
    if (!cat) continue;
    const parts = [`${e.measured.minChars}–${e.measured.maxChars} 字`];
    if (e.profile?.tone) parts.push(`語氣：${e.profile.tone}`);
    if (e.profile?.structure) parts.push(`結構：${e.profile.structure}`);
    if (e.profile?.phrases.length) parts.push(`常用詞：${e.profile.phrases.slice(0, 8).map((p) => p.text).join("、")}`);
    lines.push(`・${cat.zh}（依 ${e.measured.count} 篇）｜${parts.join("；")}`);
  }
  if (lines.length === 0) return "";
  return [VOICE_BLOCK_START, ...lines, VOICE_BLOCK_END].join("\n");
}

/** 把我們那一段放進「品牌口吻」：有舊的就換掉，沒有就接在使用者原本的內容後面。 */
export function mergeVoiceText(existing: string, block: string): string {
  const s = existing.indexOf(VOICE_BLOCK_START);
  const e = existing.indexOf(VOICE_BLOCK_END);
  const rest = s >= 0 && e > s
    ? `${existing.slice(0, s)}${existing.slice(e + VOICE_BLOCK_END.length)}`
    : existing;
  return [rest.trim(), block.trim()].filter(Boolean).join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────
// 提示詞（放在這裡而不是 router：純字串，探測腳本可以直接拿這一份去實跑）
// ─────────────────────────────────────────────────────────────────────
/** 自動分類。回 {"items":[{"n":1,"cat":"product"}]}，交給 parseClassification。 */
export function classifyPrompt(): string {
  return `使用者貼了一批自己品牌發過的文章，每篇前面有編號 [n]（只顯示開頭）。請把每一篇分到下面其中一類。

${VOICE_CATEGORIES.map((c) => `- ${c.id}：${c.zh}——${c.hint}`).join("\n")}

規則：
- 每一篇只能分到一類；看這篇「主要在做什麼」，不是看它提到什麼（節慶貼文提到產品，仍然是 festival）。
- 真的哪一類都不像（例如徵才、公告、客服回覆）就不要列出那一篇。
- 只回 JSON：{"items":[{"n":1,"cat":"product"},{"n":2,"cat":"chat"}]}，第一個字元就是 {。`;
}

/** 語氣／結構／常用詞。回 JSON，交給 parseVoiceProfile（常用詞會再逐字驗證）。 */
export function profilePrompt(categoryZh: string, count: number): string {
  return `下面是同一個品牌發過的 ${count} 篇「${categoryZh}」文章。請描述這個品牌寫這類文章的共同習慣。繁體中文。

只回 JSON（第一個字元就是 {）：
{"tone":"……","structure":"……","phrases":["……","……"]}

- tone（60 字內）：語氣。要具體到能分辨——誰對誰說話、用什麼口吻、句子長短、用不用語助詞與 emoji。
  不要寫「溫暖專業」「親切有溫度」這種每個品牌都能套的形容詞。
- structure（80 字內）：結構。開場怎麼起、中段放什麼、怎麼收尾（有沒有固定的 CTA、hashtag、署名）。
- phrases（最多 12 個）：這些文章裡**反覆出現**的口頭禪、稱呼、固定句型、招牌用語，每個 2–10 字。
  必須**一字不差地出現在兩篇以上**；不要放產品名、價格、日期、活動名稱，也不要自己歸納出原文沒有的詞。`;
}

/** 使用者說「不像」之後，照他說的修 SKILL。 */
export function revisePrompt(measured: BrandTaskCard["measured"]): string {
  return `你在修一份寫作 SKILL。這份 SKILL 是從使用者自己發過的文章反推出來的；照它試寫了一篇，使用者看完說「不像我們寫的」，並指出哪裡不像。

請依他的意見修改 SKILL，讓下一篇更像原文。繁體中文。

【怎麼修】
- 先回頭對照原文：他說的那一點，原文實際上是怎麼做的？把那個做法寫成**可逐字檢查**的規則
  （例如「開場第一句不超過 15 字、不用問句」「全篇不用驚嘆號」「結尾固定一行 hashtag，不超過 3 個」），
  不要只是加一句「更口語一點」。
- 只動跟這些意見有關的規則；其他規則、結構、字數區間照舊。之前幾輪的意見也要繼續成立。
- 不可以把原文裡的具體事實（商品名、價格數字、日期、活動名稱）寫進規則。
- 輸出**完整的** SKILL 本文（純文字），不要前言、不要說明改了什麼。開頭第一行就是規則。

【字數】原文實測最短 ${measured.minChars} 字、最長 ${measured.maxChars} 字、中位數 ${measured.medianChars} 字。`;
}
