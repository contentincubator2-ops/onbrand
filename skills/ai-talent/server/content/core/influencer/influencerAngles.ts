/**
 * influencerAngles — 「網紅切角」：主體（品牌／產品／活動）固定，讀懂每一位網紅，
 * 請模型「當他本人」想三個他真的會想做的點子；用戶挑一個，才寫邀約信。
 *
 * 2026-10-06（CJ「參考靈感台，讓用戶選擇品牌或產品或活動以後，可以上傳一個網紅的連結或是
 * 上傳 excel 批量網紅的連結，我們根據品牌或產品或活動的特色，讀懂不同網紅連結的個人特色，
 * 然後提供給客戶不同網紅可以講的產品特色和該網紅獨特切角，可以批量匯出 excel or word
 * 或是直接在平台上發送」→ 發送定案：開啟用戶自己的信箱，不由平台代發）。
 *
 * 2026-10-06 改寫（CJ 看了實際產出：「現在的 DEMO 寫起來很生硬，不有趣，是否要換專家來寫角度，
 * 或是直接生成 agent 模擬該用戶，看會怎麼寫？」→ 對照實驗後定案：模擬本人、每位三個點子讓用戶挑）。
 * 原本的寫法是「品牌的企劃替每位網紅配一個切角」，兩個毛病：
 *   · 方向寫反：切角變成品牌在對網紅推銷產品（「旅遊創作者如何讓每篇文章都像同一個人在說話」），
 *     不是網紅做給他觀眾看的內容。
 *   · 用的是品牌簡報的話（「顧問思維×AI規模」），沒有一句是他會講的。
 * 現在每位三步：
 *   1. 口吻卡（voicePrompt）：只從他的真實內容整理他怎麼說話，附照抄的原句。
 *   2. 三個點子（ideasPrompt）：模型當他本人，用三個不同的出發點各想一個（IDEA_KINDS）。
 *      「換專家來寫」要的是不同的思考方式——三個出發點就是三種思考方式，不另外找一排專家。
 *   3. 用戶挑一個之後才寫邀約信（emailPrompt）：沒被挑的點子不花錢寫信。
 *
 * 不變的規則：
 *   · 兩種事實各有唯一來源：產品事實只能來自品牌資料；網紅的事只能來自「讀到的素材」。
 *     素材不夠就不寫（needs_material），不拿帳號名稱猜這個人。
 *   · 不替他編話：依據與邀約信裡的引用要在素材裡找得到（unsupportedQuotes）。
 *   · 不談價碼（2026-10-01 CJ 移除預算）；不碰私人生活。
 */
import type { InfluencerPlatform } from "./influencerLink";
import type { ReadSource } from "./influencerReader";

export const INFLUENCER_BATCHES_DDL = `
  CREATE TABLE IF NOT EXISTS influencer_batches (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    userId      INT          NOT NULL,
    brandId     INT          NOT NULL,
    subjectKind VARCHAR(12)  NOT NULL DEFAULT 'brand',
    subjectId   INT          NULL,
    people      LONGTEXT     NULL,
    createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_brand_updated (brandId, updatedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 一批最多幾位（一位＝一次連結讀取＋兩次模型呼叫）。 */
export const MAX_PEOPLE = 30;
/** 素材（讀到的＋用戶補的）去掉空白後至少要這麼多字才寫。 */
export const MIN_MATERIAL_CHARS = 120;
export const NOTES_MAX = 3000;

export type PersonStatus =
  | "queued" | "reading" | "thinking" | "done"
  /** 連結讀不到、用戶也沒補素材。 */
  | "needs_material"
  | "invalid_link" | "failed";

export interface PersonInput {
  id: string;
  url: string;
  name?: string;
  email?: string;
  /** 用戶自己貼的素材：這位網紅的幾則貼文、自介、合作過的案子。 */
  notes?: string;
}

/** 三個點子的出發點。順序就是卡片上的順序。 */
export const IDEA_KINDS = [
  { key: "own", zh: "從他做過的內容延伸", en: "Builds on their own work",
    ask: "從你自己最近真的做過的一支內容延伸（basedOn 寫出是哪一支，照抄素材裡的標題或開頭）" },
  { key: "contrast", zh: "反差吐槽", en: "Contrarian take",
    ask: "反差或吐槽：這個品類大家以為對、其實不完全對的一件事" },
  { key: "method", zh: "觀眾會存的方法", en: "A method worth saving",
    ask: "你的觀眾會想存下來的判斷方法、清單或實測" },
] as const;
export type IdeaKind = (typeof IDEA_KINDS)[number]["key"];

export interface Idea {
  kind: IdeaKind;
  /** 點子：像他會下的標題。 */
  title: string;
  /** 開場第一句，照他的口吻。 */
  hook: string;
  /** 會提到主體的哪一點（來自品牌資料）。 */
  productPoint: string;
  /** 為什麼他的觀眾會看。 */
  why: string;
  /** own：延伸自他的哪一支內容。 */
  basedOn?: string;
}

export interface PersonIdeas {
  /** 個人特色：他是哪一種創作者、觀眾是誰。 */
  profile: string;
  /** 判讀依據：從哪幾則內容看出來的。 */
  evidence: string;
  /** 建議的內容形式。 */
  format: string;
  ideas: Idea[];
  /** 模型從素材裡認出的名字（用戶沒填、連結也沒讀到名稱時拿來稱呼）。 */
  detectedName?: string;
}

export interface PersonResult extends PersonInput, Partial<Omit<PersonIdeas, "detectedName">> {
  status: PersonStatus;
  platform: InfluencerPlatform | null;
  handle: string | null;
  followers: string | null;
  /** 素材從哪來。 */
  source: ReadSource | "user_notes";
  /** 讀到的顯示名稱（用戶沒填名字時拿來稱呼）。 */
  displayName: string | null;
  /** 口吻卡：他怎麼說話。 */
  voice?: string;
  /** 寫信時要用的素材摘錄（挑點子是另一次請求，不重讀連結、不重複付數據商的錢）。不回給前端。 */
  materialDigest?: string;
  /** 用戶挑了第幾個點子（ideas 的索引）；還沒挑＝沒有這個欄位。 */
  picked?: number;
  emailSubject?: string;
  emailBody?: string;
  /** 重寫一次後，信裡仍有在素材中找不到的引用——卡片上提醒用戶寄出前核對。 */
  quoteWarning?: boolean;
  // ── 2026-10-06 改寫前的舊資料（一位一個切角）。新資料不寫這幾欄，讀舊名單時前端照舊顯示。 ──
  angle?: string; angleWhy?: string; hook?: string; talkingPoints?: string[];
}

export function materialEnough(material: string): boolean {
  return material.replace(/\s/g, "").length >= MIN_MATERIAL_CHARS;
}

/** 這一位怎麼稱呼：用戶填的 → 讀到的 → 帳號。 */
export function personLabel(p: Pick<PersonResult, "name" | "displayName" | "handle">): string {
  return (p.name || p.displayName || (p.handle ? `@${p.handle}` : "")).trim();
}

const PRIVATE_RULE = "素材裡的私人生活（感情、家庭、健康、爭議與道歉聲明）一律不用、不提。";
/**
 * 2026-10-06 DEV 實跑：請旅遊創作者講行銷工具時，模型為了接上她的題材，把「整合 44 個數據來源」
 * 寫成「出發前交叉核查餐廳資訊」——產品根本不做這件事，寄出去就是不實宣稱。
 */
const HONEST_USE_RULE = "主體只能做它本來做的事：照品牌資料寫它實際是做什麼的、給誰用的，不可以為了接上創作者的題材，把它的功能說成能做品牌資料沒寫的事（例如行銷工具不能說成可以查餐廳、查景點）。";

// ─── 第 1 步：口吻卡 ─────────────────────────────────────────────────

export function voicePrompt(outputLanguage: string): string {
  return [
    "你是幫品牌研究創作者的編輯。下面是一位創作者最近的公開內容。請只根據這些內容，整理「他怎麼說話」。",
    `輸出（${outputLanguage || "zh-TW"}，條列五點，總共 220 字內，不要標題、不要前言）：`,
    "1. 句子長短與節奏",
    "2. 常見的開頭方式（直接丟結論？先講數字？問句？場景？）",
    "3. 語氣與習慣（吐槽、自嘲、熱血、溫柔…；常用的語助詞、驚嘆號、emoji、hashtag）",
    "4. 他拿什麼當賣點（價格、體驗、挑戰、第一手實測、整理清單…）",
    "5. 照抄 3 句最能代表他口吻的原句（一字不改；素材不到 3 句就有幾句抄幾句）",
    `${PRIVATE_RULE}看不出來的不要補；看不出性別就不要寫「他」或「她」。`,
  ].join("\n");
}

// ─── 第 2 步：當他本人想三個點子 ─────────────────────────────────────

export function ideasPrompt(args: {
  brandName: string; subjectLine: string; brandCtx: string;
  label: string; platform: string; followers: string | null;
  material: string; voice: string; outputLanguage: string;
  /** 這一批其他網紅已經用掉的點子。 */
  avoid?: string[];
  /** 用戶補充的合作方向（選填）。 */
  direction?: string;
}): string {
  const lang = args.outputLanguage || "zh-TW";
  return [
    `你現在就是下面這位創作者本人${args.label ? `（${args.label}）` : ""}，平台是 ${args.platform}${args.followers ? `，${args.followers}` : ""}。`,
    `有個品牌來找你合作。你要想的是：如果接了，我會怎麼做這支內容，我的觀眾才不會覺得是業配而滑掉？`,
    `內容是做給「你的觀眾」看的，不是品牌在對你推銷。先想你的觀眾是誰、為什麼追蹤你，再想這個主體跟他們的生活有什麼交集；交集很小，就老實從你自己做內容、經營帳號的日常切。`,
    ``,
    `【你怎麼說話（口吻卡）】`,
    args.voice,
    ``,
    `【你最近的內容（關於你的事，只能用這裡看得到的）】`,
    args.material.slice(0, 3000),
    ``,
    `【來找你的是】${args.subjectLine}`,
    `【品牌資料（產品事實的唯一來源，沒有的不要編，不要編功效與數字）】`,
    args.brandCtx.slice(0, 6000),
    args.direction ? `【品牌希望的合作方向】${args.direction}` : "",
    args.avoid?.length ? `【這一批其他創作者已經用掉的點子——不要重複，也不要換句話說】\n${args.avoid.map((a) => `- ${a}`).join("\n")}` : "",
    ``,
    `請用三個不同的出發點各想一個點子：`,
    ...IDEA_KINDS.map((k) => `${k.key}：${k.ask}`),
    ``,
    `每個點子的欄位：`,
    `- title：點子，一句話、18 字內，像你會下的標題，不是品牌口號。`,
    `- hook：你影片或貼文的第一句，照口吻卡寫——口語、可以吐槽、可以用你習慣的語助詞或 emoji；35 字內。`,
    `- productPoint：會帶到主體的哪一點，15 字內的短語。要點名品牌資料裡一個具體的功能、規格或做法，不能是「更有方向」「更有效率」這種誰都能說的話。`,
    `- why：為什麼你的觀眾會看，一句、25 字內。`,
    `- basedOn：只有 own 要填——延伸自你的哪一支內容，照抄素材裡的標題或開頭（30 字內）。`,
    `另外四個欄位（這幾個是品牌的企劃在看的，用旁觀者的口氣寫，不要用第一人稱）：`,
    `- profile：這位創作者是哪一種創作者、觀眾大概是誰，一句、40 字內。`,
    `- evidence：從哪一兩則內容看出來的，40 字內；引用只能照抄素材裡的標題或原句。`,
    `- format：建議的內容形式，照平常做的形式挑（例如「開箱長片」「Reels 短影音」「圖文貼文」），12 字內。`,
    `- name：素材裡看得出來的名字或頻道名（12 字內）；看不出來就留空字串。`,
    ``,
    `規則：`,
    `- 不要寫成你已經用過這個產品；不要編你沒做過的經歷。`,
    `- 不要出現「洞見」「賦能」「策略夥伴」「顧問思維」這類品牌簡報用語——用你自己會講的話。`,
    `- ${HONEST_USE_RULE}`,
    `- 如果你的觀眾不是這個主體的使用者，就從你自己的身份切（你也在經營一個帳號、做內容、接合作），不要硬把它塞進你平常的題材。`,
    `- 三個點子不能講同一件事。`,
    `- ${PRIVATE_RULE}`,
    `- 看不出性別就不要寫「他」或「她」，用名字或「這位創作者」。`,
    `- 字數上限是硬規定，寧短勿長；全部用 ${lang} 寫。`,
    `只輸出 JSON，不要前言：{"name":"…","profile":"…","evidence":"…","format":"…","ideas":[{"kind":"own","title":"…","hook":"…","productPoint":"…","why":"…","basedOn":"…"},{"kind":"contrast","title":"…","hook":"…","productPoint":"…","why":"…"},{"kind":"method","title":"…","hook":"…","productPoint":"…","why":"…"}]}`,
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

const clip = (v: unknown, n: number) => String(v ?? "").replace(/[ \t]+/g, " ").trim().slice(0, n);
const oneLine = (v: unknown, n: number) => clip(String(v ?? "").replace(/\s+/g, " "), n);
/** 模型常自己把開場包一層引號，卡片又會再加一層。只拿掉包住整句的那一對。 */
function unquote(s: string): string {
  const pairs: Array<[string, string]> = [["「", "」"], ["『", "』"], ["“", "”"], ['"', '"']];
  for (const [a, b] of pairs) if (s.startsWith(a) && s.endsWith(b) && s.length > 2 && !s.slice(1, -1).includes(a)) return s.slice(1, -1).trim();
  return s;
}

/** 從模型輸出取出第一個完整的 JSON 物件。 */
function firstJson(raw: string): any {
  const s = String(raw ?? "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

const squash = (v: string) => v.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
/** 引號裡至少這麼長才當成「引用」來查（短的多半是強調用的詞）。 */
const QUOTE_MIN_CHARS = 10;

/**
 * text 裡用引號引的句子，哪幾句在 known（素材、品牌資料、這一位自己的點子）裡找不到。
 * 2026-10-06 dev 實測：素材只有影片標題，模型卻在信裡寫「你說的『規格強是一回事…』」——
 * 替網紅編一句他沒說過的話，寄出去比沒寄更糟。
 */
export function unsupportedQuotes(text: string, known: string[]): string[] {
  const hay = squash(known.join("\n"));
  const out: string[] = [];
  for (const m of text.matchAll(/[「『“"]([^「」『』“”"\n]+)[」』”"]/g)) {
    const q = m[1] ?? "";
    if (squash(q).length >= QUOTE_MIN_CHARS && !hay.includes(squash(q)) && !out.includes(q)) out.push(q);
  }
  return out;
}

/**
 * 解析三個點子。每個出發點最多一個、照 IDEA_KINDS 的順序排；至少要有兩個像樣的才算成功。
 * 上限比提示詞要求的寬：模型常多寫幾個字，硬切會切在句子中間。
 * 依據裡有素材找不到的引用就整句拿掉（依據是給人核對用的，錯的依據比沒有更糟）。
 */
export function parseIdeas(raw: string, material: string): PersonIdeas | null {
  const j = firstJson(raw);
  if (!j || !Array.isArray(j.ideas)) return null;
  const byKind = new Map<IdeaKind, Idea>();
  for (const x of j.ideas) {
    const kind = IDEA_KINDS.find((k) => k.key === x?.kind)?.key;
    if (!kind || byKind.has(kind)) continue;
    const idea: Idea = {
      kind, title: unquote(oneLine(x.title, 60)), hook: unquote(oneLine(x.hook, 110)),
      productPoint: oneLine(x.productPoint, 60), why: oneLine(x.why, 90),
    };
    const basedOn = oneLine(x.basedOn, 80);
    if (kind === "own" && basedOn) idea.basedOn = basedOn;
    if (idea.title && idea.hook) byKind.set(kind, idea);
  }
  const ideas = IDEA_KINDS.map((k) => byKind.get(k.key)).filter((x): x is Idea => !!x);
  if (ideas.length < 2) return null;
  const evidence = oneLine(j.evidence, 160);
  const out: PersonIdeas = {
    profile: oneLine(j.profile, 160),
    evidence: unsupportedQuotes(evidence, [material]).length ? "" : evidence,
    format: oneLine(j.format, 24),
    ideas,
  };
  const name = oneLine(j.name, 24);
  if (name) out.detectedName = name;
  return out;
}

// ─── 第 3 步：挑了點子才寫邀約信 ─────────────────────────────────────

/**
 * 邀約信內文超過這個字數就退回重寫。提示詞寫的目標比這個短很多（6 句、220 字）：
 * 2026-10-06 dev 實測，要求「180–280 字」時模型交 429 字——模型數中文字數不準，
 * 用句數管比較有效，目標也要留餘裕。
 */
export const EMAIL_MAX_CHARS = 340;

export function emailPrompt(args: {
  brandName: string; subjectLine: string; brandCtx: string;
  label: string; material: string; idea: Idea; outputLanguage: string;
  /** 重寫：上一版被檢查出的問題。 */
  fixes?: string[];
}): string {
  return [
    `你是「${args.brandName}」的網紅合作窗口，要寫第一封邀約信給一位還不認識你們的創作者${args.label ? `「${args.label}」` : ""}。`,
    `【想請他講的主體】${args.subjectLine}`,
    `【想跟他一起做的點子】${args.idea.title}`,
    args.idea.basedOn ? `（延伸自他做過的：${args.idea.basedOn}）` : "",
    `【會帶到主體的哪一點】${args.idea.productPoint}`,
    `【他最近的內容（提到他的事只能用這裡有的）】`,
    args.material.slice(0, 2000),
    `【品牌資料（介紹主體只能用這裡有的）】`,
    args.brandCtx.slice(0, 3000),
    args.fixes?.length ? `【上一版的問題，這次一定要改掉】\n${args.fixes.map((f) => `- ${f}`).join("\n")}` : "",
    `寫法：`,
    `- subject：主旨，28 字內，看得出是誰找他、為了什麼。`,
    `- body：內文最多 6 句、220 字內（對方是在手機上看的陌生來信，短才會被讀完；超過 ${EMAIL_MAX_CHARS} 字會被退回）。`,
    `  一句一件事：稱呼 → 提到他一則具體的內容說明為什麼找他 → 一句話介紹主體 → 想一起做的點子 → 請他回覆是否有興趣。`,
    `- 提到他的內容時只能說「你做過哪一支／哪一篇」（用素材裡的標題）；素材裡沒有他的原話，就不要寫「你說過『…』」——不可以替他編一句話。`,
    `- ${HONEST_USE_RULE}`,
    `- 不提費用、預算、報價；不承諾成效；不寫「久仰大名」這類客套；用平常寫信的話，不要品牌簡報用語。`,
    `- ${PRIVATE_RULE}看不出性別就不要寫「他」或「她」。沒有名字就用「您好」開頭。`,
    `- 署名「${args.brandName} 團隊」。用 ${args.outputLanguage || "zh-TW"} 寫。`,
    `只輸出 JSON，不要前言：{"subject":"…","body":"…"}`,
  ].filter((x) => x !== "").join("\n");
}

export function parseEmail(raw: string): { subject: string; body: string } | null {
  const j = firstJson(raw);
  const subject = oneLine(j?.subject, 60);
  const body = clip(String(j?.body ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n"), 900);
  return subject && body.length >= 40 ? { subject, body } : null;
}

/** 這封信有哪些要退回重寫的問題（空陣列＝過關）。 */
export function emailIssues(body: string, known: string[]): string[] {
  const issues = unsupportedQuotes(body, known)
    .map((q) => `「${q}」在他的內容裡找不到——不可以替他編話；改成只提他做過的內容標題，或拿掉這句。`);
  if (body.length > EMAIL_MAX_CHARS) issues.push(`內文有 ${body.length} 字，太長；整封刪到 6 句、220 字內。`);
  return issues;
}
