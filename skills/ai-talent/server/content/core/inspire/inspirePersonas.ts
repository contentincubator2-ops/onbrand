/**
 * 醫師自媒體示範頁的創作者 agent——四個平台 × 台灣／美國，共 100 位。
 *
 * 2026-10-07（CJ「從台灣和美國的排行榜當中選各平台最有名的人，進行人設 agent 的模擬」
 * 「真實網紅名字不要露出」→「100 個人選我全部都要留……靈感都很無聊，你應該是沒有好好建立成
 * 網紅的 agent 來寫」）。
 *
 * 第一版每個風格只有一百多字的手法描述、全部塞進同一次呼叫，產出分不出誰是誰。現在每一位
 * 是一個獨立的 agent：各有一份 2,200 字以上的 agentPrompt（招牌形式、開場公式、結構節拍、
 * 語言指紋、題材轉換法、不會做的事），各自呼叫一次模型。資料在 inspirePersonaData.ts
 * （由研究結果產生，名單與出處見 docs/inspire-influencer-list-100.md）。
 *
 * 人名怎麼處理：agentPrompt 裡可以有本人的名字（模型認得人，寫得才像），但名字、帳號、
 * 招牌口頭禪一律不出 server——config 只回 label／reference／pitch，產出再過 leaksPersona 擋一次。
 */
import { PERSONA_DATA } from "./inspirePersonaData";

export type InspirePlatform = "facebook" | "youtube" | "instagram" | "tiktok";
export type InspireMarket = "tw" | "us";

export interface InspirePersona {
  key: string;
  platform: InspirePlatform;
  market: InspireMarket;
  /** 參考的創作者（只在 server 用）。 */
  name: string;
  /** 帳號、頻道名、其他寫法——用來擋產出裡的人名。 */
  aliases: string[];
  /** 本人的招牌口頭禪——用來擋，不是用來寫。 */
  catchphrases: string[];
  /** 卡片上的風格名（不含人名）。 */
  label: string;
  /** 參考的是哪一類、什麼量級的創作者（卡片上會顯示，不含人名）。 */
  reference: string;
  /** 一句話說這個風格怎麼說話（卡片副標）。 */
  pitch: string;
  /** 這個 agent 拿到任何題目都會先問自己的問題——答案就是切角的錨。 */
  question: string;
  /** agent 的完整人設（2,200 字以上）。 */
  agentPrompt: string;
}

export const INSPIRE_PERSONAS: InspirePersona[] = PERSONA_DATA;

export const PERSONA_KEYS: string[] = INSPIRE_PERSONAS.map((p) => p.key);

const BY_KEY = new Map(INSPIRE_PERSONAS.map((p) => [p.key, p]));
export function personaOf(key: string): InspirePersona | undefined {
  return BY_KEY.get(key);
}

const norm = (s: string) => s.toLowerCase().replace(/[\s·・\-_.'’@]/g, "");

/**
 * 研究資料裡的別名有些是一般用字（頻道名的一部分、綽號剛好是食物或物品）。照擋的話，點子只要提到
 * 洋蔥、雪碧、筆電就整個被丟掉——2026-10-08 CJ 回報「會產不出靈感」就是這類誤擋造成的。
 */
const GENERIC_ALIASES = new Set(["筆電", "洋蔥", "麻糬", "雪碧", "小陳", "小象", "大牛", "很煩", "speed"].map(norm));

/** 研究資料沒列、但實跑時被寫進成稿的家人與固定班底名字（key → 名字）。 */
const EXTRA_NAMES: Record<string, string[]> = {
  "tw-fb-02": ["妮妮"],
};

/**
 * 產出裡有沒有露出這位創作者的名字、帳號或招牌口頭禪。回傳命中的字串；沒有回 null。
 * 太短的別名（中文 1 字、英數 3 字以內）與一般用字的別名不比對。口頭禪只擋夠長、夠獨特的
 * （中文 8 字、英數 15 字以上）：「留言告訴我」「真的假的」這種誰都會說的話，擋了等於不准寫字。
 */
export function leaksPersona(text: string, p: Pick<InspirePersona, "name" | "aliases" | "catchphrases"> & { key?: string }): string | null {
  const hay = norm(String(text ?? ""));
  const hit = (raw: string, minAscii: number, minCjk: number): boolean => {
    const n = norm(String(raw ?? ""));
    return n.length >= (/^[\x00-\x7f]+$/.test(n) ? minAscii : minCjk) && hay.includes(n);
  };
  const names = [p.name, ...p.aliases, ...(p.key ? EXTRA_NAMES[p.key] ?? [] : [])];
  for (const raw of names) if (!GENERIC_ALIASES.has(norm(String(raw ?? ""))) && hit(raw, 4, 2)) return String(raw);
  for (const raw of p.catchphrases) if (hit(raw, 15, 8)) return String(raw);
  return null;
}
