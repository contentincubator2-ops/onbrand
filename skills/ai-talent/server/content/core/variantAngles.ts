/**
 * variantAngles — what a version NAME promises, written down where the writer can read it.
 *
 * 2026-09-22 (CJ「情感版、理性版、數據版跟內文產出的版本調性不符合，命名跟內文的版本設計應該要有
 * 直接關係」，附圖：標成「理性版」的貼文通篇是氣味、畫面、感覺):
 *
 * The version labels are just strings on a task config (`variantLabels: ["情感版","理性版","數據版"]`),
 * copied onto dozens of tasks. Each version is written by its own LLM call, and until now that call
 * received the label as a single word — 「【本次任務】只寫 1 個變體：**理性版**」 — with no definition
 * of what 理性 means. The image director had a per-label lens (labelLens); the copywriter had nothing.
 * So the model read the brand's sensory tone and wrote the same emotional post three times, under
 * three different names.
 *
 * This file is the single place a generic angle label is DEFINED. Both consumers read it:
 *   - the caption writer gets `writing` (how this version is written) plus the sibling labels it
 *     must differ from, and 數據版 is machine-checked for the one thing that defines it — a number;
 *   - the image director gets `visual` (previously the hand-kept labelLens table).
 * A label that isn't here is left alone (custom labels like 「第 3 天」 or 「詢價回覆」 are defined by
 * their own task prompt). A task whose own systemPrompt already names the label defines it itself
 * and keeps that wording — this never overrides a task's own definition.
 */

export interface VariantAngle {
  /** Short family name shown in the prompt. */
  name: string;
  /** How this version is written — the design the label promises. */
  writing: string;
  /** Visual lens for the image director (kept identical to the old labelLens strings). */
  visual: string;
}

const ANGLES: Record<string, VariantAngle> = {
  情感: {
    name: "情感版",
    writing:
      "從「一個具體的人、在一個具體的瞬間，身體與心裡的感受」切入（觸覺、聲音、氣味、表情、心裡那句話），" +
      "情緒先於資訊：讀者是先『感覺到』，才『知道』這是什麼。" +
      "開場不用數字、不用「因為…所以…」的推論句、不列規格或優點清單。結尾用一句貼近感受的邀請，不用生硬的促銷話術。",
    visual: "聚焦人物表情與肢體情緒、特寫、暖色光、淺景深",
  },
  理性: {
    name: "理性版",
    writing:
      "用「決策的邏輯」說服：先點出讀者面對的取捨或判斷標準，再給 2–3 個理由或比較（成本、時間、功能、風險擇二三），" +
      "最後收在一個明確的結論。語氣冷靜克制，句子偏短，可用條列或「第一、第二」。" +
      "**不寫感官描寫與情緒渲染，不用感嘆詞，不用數字當開場**（那是數據版的做法）。" +
      "每個理由都要能從用戶輸入或品牌資料驗證，不臆造。",
    visual: "簡潔資訊式構圖、幾何排版、冷調、留白、產品/介面為主體",
  },
  故事: {
    name: "故事版",
    writing:
      "寫一個有「情境（開頭）→ 卡住或意外（轉折）→ 改變（結果）」的迷你場景：有一個具體的人、時間、地點。" +
      "品牌或產品出現在轉折或結果裡，不在開頭喊口號。不列優點、不用數據開場。",
    visual: "敘事場景、環境帶入、中景、自然光、生活感瞬間",
  },
  數據: {
    name: "數據版",
    writing:
      "用「一個具體的數字」開場並貫穿全篇（比例、時間、數量、價差、次數、規格）：它代表什麼、為什麼重要、換算成讀者的生活是什麼樣子；" +
      "最多再補第二個數字。數字只能來自用戶輸入、抓到的網址內容或品牌資料——沒有可用的數字時，改用「從輸入直接數得出來的量」" +
      "（幾種、幾步、幾分鐘、幾毫升、幾個尺寸），**嚴禁杜撰統計、調查結果或百分比**。不寫抒情段落。",
    visual: "視覺化數字/圖表元素、強對比、單一焦點、現代極簡",
  },
  懸念: {
    name: "懸念版",
    writing:
      "開頭丟出一個未解的缺口（一個沒說完的事實、一個反常的現象、一個問題），中段只給線索不給答案，答案留到最後一句，或導向留言／點擊。" +
      "前兩句不揭曉結論；不做標題黨式誇大——缺口必須真的能在內容裡兌現。",
    visual: "局部遮蔽/未揭曉的構圖、戲劇光影、暗調、引發好奇",
  },
  反差: {
    name: "反差版",
    writing:
      "先立一個大家以為的樣子，再用一個具體的事實或畫面翻轉它。反差要來自真實的對比（預期 vs 實際、過去 vs 現在），不是誇大。",
    visual: "並置或前後兩態的對比構圖、預期與實際的落差、強對比色",
  },
};

/** Label spellings that mean the same angle. Only generic, repeated labels belong here. */
const ALIASES: Record<string, keyof typeof ANGLES> = {
  情感版: "情感", 情感式: "情感", 情感放大式: "情感",
  理性版: "理性",
  故事版: "故事", 故事式: "故事",
  數據版: "數據", 數據式: "數據",
  懸念版: "懸念", 懸念式: "懸念",
  反差版: "反差", 反差式: "反差",
};

export function angleFor(label: string): VariantAngle | null {
  const key = ALIASES[String(label ?? "").trim()];
  return key ? ANGLES[key]! : null;
}

/** The image director's lens for this label, or null when the label is not a generic angle. */
export function angleVisualLens(label: string): string | null {
  return angleFor(label)?.visual ?? null;
}

/**
 * Does this label get defined here for this task? Not when the task's own prompt already names the
 * label — a task that says 「口吻分別：反問式 / 數字式 / 反差式」 has its own, more specific definition.
 */
function definedHere(label: string, taskSystemPrompt: string): VariantAngle | null {
  const angle = angleFor(label);
  if (!angle) return null;
  return String(taskSystemPrompt ?? "").includes(label) ? null : angle;
}

/**
 * The prompt block that makes the version name mean something. Empty string = leave the prompt alone.
 * `siblings` are the labels of the OTHER versions written in parallel by separate calls; naming them is
 * what stops three independent calls from converging on the same middle-of-the-road post.
 */
export function angleWritingBlock(
  label: string,
  opts: { siblings?: readonly string[]; taskSystemPrompt?: string } = {},
): string {
  const angle = definedHere(label, opts.taskSystemPrompt ?? "");
  if (!angle) return "";
  const others = (opts.siblings ?? []).filter((l) => l !== label);
  return (
    `\n【版本切角 — 版本名稱就是這一版的設計】\n` +
    `這一版叫「${label}」。${angle.writing}\n` +
    `讀者只看內文（看不到版本名稱）就應該感覺得出它是這個切角；內文的切入點、句型與用詞都要對得上這個名稱。\n` +
    (others.length
      ? `同時另有 ${others.map((o) => `「${o}」`).join("、")} 由其他寫手各自負責——你這一版的開場與論證方式必須和它們明顯不同，不要寫成折衷版。\n`
      : "")
  );
}

/**
 * The one angle a machine can verify: 數據版 must actually lead with numbers. Returns a reason to
 * retry with, or null. Anything else is left to the writing block — we don't pretend to grade tone.
 */
export function checkAngle(label: string, caption: string, taskSystemPrompt = ""): string | null {
  const angle = definedHere(label, taskSystemPrompt);
  if (!angle || angle.name !== "數據版") return null;
  const head = String(caption ?? "").slice(0, 80);
  if (/[0-9０-９]/.test(head) || /[一二兩三四五六七八九十百千萬]+(?:種|步|分鐘|小時|天|週|年|次|個|款|成|倍)/.test(head)) return null;
  return "數據版的開頭 80 字內沒有任何數字或計量（例如「3 種」「5 分鐘」「100ml」）；數據版必須用一個具體的數字開場";
}
