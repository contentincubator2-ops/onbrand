/**
 * influencerAngles — 「網紅切角」：主體（品牌／產品／活動）固定，讀懂每一位網紅的個人特色，
 * 替每一位各配「他可以講的產品特色」＋「只有他講才成立的切角」＋一封邀約信。
 *
 * 2026-10-06（CJ「參考靈感台，讓用戶選擇品牌或產品或活動以後，可以上傳一個網紅的連結或是
 * 上傳 excel 批量網紅的連結，我們根據品牌或產品或活動的特色，讀懂不同網紅連結的個人特色，
 * 然後提供給客戶不同網紅可以講的產品特色和該網紅獨特切角，可以批量匯出 excel or word
 * 或是直接在平台上發送」→ 發送定案：開啟用戶自己的信箱，不由平台代發）。
 *
 * 設計取捨：
 *   · 兩種事實各有唯一來源：產品特色只能來自品牌資料；網紅特色只能來自「讀到的素材」
 *     （influencerReader 讀到的＋用戶補貼的貼文）。素材不夠就不寫（needs_material），
 *     不拿帳號名稱猜這個人——猜錯的邀約信寄出去比沒寄更糟。
 *   · 切角不能撞：一次處理一小組（CHUNK 位），後面的組會拿到前面已用掉的切角。
 *   · 不談價碼：跟網紅任務說明單同一個決定（2026-10-01 CJ 移除預算），邀約信不提費用。
 *   · 跟活動頁的「網紅任務說明單」（campaignKolBrief）分工：那張是給經紀公司的需求單、名單手填；
 *     這裡是從連結讀人、逐位配切角。兩邊互通是第二階段。
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

/** 一批最多幾位（一位＝一次連結讀取＋五分之一次模型呼叫）。 */
export const MAX_PEOPLE = 30;
/** 一次模型呼叫處理幾位。 */
export const CHUNK = 5;
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

export interface PersonAngle {
  /** 個人特色：他是哪一種創作者、怎麼說話、觀眾是誰。 */
  profile: string;
  /** 判讀依據：從哪幾則內容看出來的。 */
  evidence: string;
  /** 他可以講的產品特色（每一點都來自品牌資料）。 */
  talkingPoints: string[];
  /** 獨特切角。 */
  angle: string;
  /** 為什麼這個切角只有他講才成立。 */
  angleWhy: string;
  /** 開場示範（用他的口吻）。 */
  hook: string;
  /** 建議的內容形式。 */
  format: string;
  emailSubject: string;
  emailBody: string;
}

export interface PersonResult extends PersonInput, Partial<PersonAngle> {
  status: PersonStatus;
  platform: InfluencerPlatform | null;
  handle: string | null;
  followers: string | null;
  /** 素材從哪來。 */
  source: ReadSource | "user_notes";
  /** 讀到的顯示名稱（用戶沒填名字時拿來稱呼）。 */
  displayName: string | null;
}

export function materialEnough(material: string): boolean {
  return material.replace(/\s/g, "").length >= MIN_MATERIAL_CHARS;
}

/** 這一位怎麼稱呼：用戶填的 → 讀到的 → 帳號。 */
export function personLabel(p: Pick<PersonResult, "name" | "displayName" | "handle">): string {
  return (p.name || p.displayName || (p.handle ? `@${p.handle}` : "")).trim();
}

export interface ChunkPerson { id: string; label: string; platform: string; followers: string | null; material: string }

export function anglesSystemPrompt(args: {
  brandName: string; subjectLine: string; brandCtx: string;
  people: ChunkPerson[]; outputLanguage: string;
  /** 這一批前面已經用掉的切角。 */
  avoid?: string[];
  /** 用戶補充的合作方向（選填）。 */
  direction?: string;
}): string {
  const lang = args.outputLanguage || "zh-TW";
  const roster = args.people.map((p) =>
    `■ id=${p.id}｜${p.label || "（沒有名字）"}｜${p.platform}${p.followers ? `｜${p.followers}` : ""}\n${p.material}`).join("\n\n");
  return [
    `你是「${args.brandName}」的網紅合作企劃。下面有 ${args.people.length} 位網紅的素材，請替每一位各設計一個合作切角，並寫一封邀約信。`,
    `【這次要請他們講的主體】${args.subjectLine}——每一位的切角都必須在講這個主體。`,
    args.direction ? `【用戶希望的合作方向】${args.direction}` : "",
    args.avoid?.length ? `【這一批其他網紅已經用掉的切角——不要重複，也不要換句話說】\n${args.avoid.map((a) => `- ${a}`).join("\n")}` : "",
    args.brandCtx ? `【品牌資料（產品特色的唯一來源）】\n${args.brandCtx.slice(0, 6000)}` : "",
    ``,
    `【網紅素材（個人特色的唯一來源）】`,
    roster,
    ``,
    `做法（每一位都照做）：`,
    `1. profile：先讀他的素材，用 80 字內說清楚他是哪一種創作者——常做什麼題材、說話方式、觀眾大概是誰。只寫素材裡看得出來的，看不出來的不要補。`,
    `2. evidence：指出你是從哪兩三則內容看出來的（引用素材裡的標題或原話，60 字內）。`,
    `3. talkingPoints：從品牌資料裡挑 2–3 個「跟他的題材接得上」的產品特色，每點 40 字內。產品名稱、成分、規格、價格、產地、活動日期照品牌資料寫，資料沒有的不要編，不要編功效與數字。`,
    `4. angle：只有他講才成立的切角，24 字內，說清楚這支內容在講什麼（不是口號）。檢查方法：把他的名字換成名單上另一位，如果切角照樣成立，就是太泛，重想。`,
    `5. angleWhy：為什麼是他（他的哪個題材或習慣＋產品的哪個特色接在一起），60 字內。`,
    `6. hook：用他的口吻示範開場第一句，40 字內。不要編他沒做過的經歷，也不要寫成他已經用過產品。`,
    `7. format：建議的內容形式，照他平常做的形式挑（例如「開箱長片」「Reels 短影音」「圖文貼文」「Podcast 口播」），12 字內。`,
    `8. emailSubject：邀約信主旨，28 字內，看得出是誰找他、為了什麼。`,
    `9. emailBody：邀約信內文，180–280 字。開頭稱呼他；第二句提到他一則具體的內容（來自素材）說明為什麼找他；接著一句話介紹主體；再說想跟他一起做的切角；最後請他回覆是否有興趣與方便的聯絡方式。`,
    `   不要提費用、預算、報價；不要承諾成效；不要寫「久仰大名」這類客套；署名用「${args.brandName} 團隊」。沒有名字的人用「您好」開頭。`,
    `- 任兩位的 angle 不能講同一件事。`,
    `- 全部用 ${lang} 寫。`,
    `只輸出 JSON，不要前言：{"people":[{"id":"${args.people[0]?.id ?? "p1"}","profile":"…","evidence":"…","talkingPoints":["…","…"],"angle":"…","angleWhy":"…","hook":"…","format":"…","emailSubject":"…","emailBody":"…"}]}`,
  ].filter(Boolean).join("\n");
}

const clip = (v: unknown, n: number) => String(v ?? "").replace(/[ \t]+/g, " ").trim().slice(0, n);
const oneLine = (v: unknown, n: number) => clip(String(v ?? "").replace(/\s+/g, " "), n);

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

/** 解析一組的結果：只留這一組要的 id、每個 id 一筆、缺關鍵欄位的丟掉。 */
export function parsePeopleAngles(raw: string, ids: string[]): Map<string, PersonAngle> {
  const out = new Map<string, PersonAngle>();
  const list = firstJson(raw)?.people;
  if (!Array.isArray(list)) return out;
  for (const x of list) {
    const id = String(x?.id ?? "");
    if (!ids.includes(id) || out.has(id)) continue;
    const talkingPoints = (Array.isArray(x.talkingPoints) ? x.talkingPoints : [])
      .map((t: unknown) => oneLine(t, 80)).filter(Boolean).slice(0, 3);
    const a: PersonAngle = {
      profile: oneLine(x.profile, 160), evidence: oneLine(x.evidence, 140), talkingPoints,
      angle: oneLine(x.angle, 48), angleWhy: oneLine(x.angleWhy, 120), hook: oneLine(x.hook, 80),
      format: oneLine(x.format, 24),
      emailSubject: oneLine(x.emailSubject, 60),
      emailBody: clip(String(x.emailBody ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n"), 900),
    };
    if (!a.profile || !a.angle || !a.talkingPoints.length || a.emailBody.length < 40) continue;
    out.set(id, a);
  }
  return out;
}
