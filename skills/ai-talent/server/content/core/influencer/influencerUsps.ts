/**
 * influencerUsps — 網紅切角的「賣點」：從定位裡現成的 USP 拿清單，再策略性地替每位網紅配一個。
 *
 * 2026-10-06（CJ「目前都是用同一個產品特色去講，所以看來會太一致性…產品定位、活動定位或品牌定位的
 * 過程中，本來就有產出 USP，直接套用那些 USP 或是讓用戶選擇 USP，當然也可以新增，然後你自由幫忙
 * 策略性匹配」「並且標註在卡片上」）。
 *
 *   · 賣點不是這裡生的：品牌看「差異化」、產品看「競爭定位＋核心功能」、活動看「主張與訊息」，
 *     都是定位流程已經寫好、用戶看過的欄位（路徑跟 brandContext 注入的同一批）。用戶可以取消勾選、自己加。
 *   · 匹配是一次模型呼叫看完整批名單再分：一位一位各自挑，大家都會挑最顯眼的那一個，
 *     等於沒分。分配規則（每個賣點盡量有人講、不要全擠在同一個）寫在提示詞，
 *     模型漏掉或亂填的人由程式補到目前最少人講的賣點。
 *   · 配到的賣點會帶進想點子的提示詞：三個點子都帶同一個賣點，換的是出發點。
 */
import localPool from "../../../localDb";

export const MAX_USPS = 8;
export const USP_MAX_CHARS = 120;

export interface Usp {
  text: string;
  /** 出自定位的哪一格（卡片上的小字）；用戶自己加的沒有。 */
  from?: string;
}

type SubjectKind = "brand" | "product" | "event";

/** 各主體的賣點欄位：[positioning 路徑, 這一格叫什麼]。順序＝清單上的順序（最獨特的在前）。 */
const USP_FIELDS: Record<SubjectKind, Array<[string, string]>> = {
  brand: [
    ["differentiation.discriminator", "唯一致勝理由"],
    ["differentiation.functional", "功能差異化"],
    ["differentiation.emotional", "情感差異化"],
  ],
  product: [
    ["competition.uniqueUsp", "獨家賣點"],
    ["competition.rareUsp", "少數競品也說的賣點"],
    ["value.coreFunctions", "核心功能"],
    ["core.oneLineValueProp", "一句話價值主張"],
  ],
  event: [
    ["smp.singleMindedProposition", "單一主張"],
    ["messaging.coreMessage", "核心訊息"],
    ["messaging.supportingPoints", "支撐訊息"],
  ],
};

const squash = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();

/**
 * 一格定位文字 → 幾條賣點。定位欄位是自由填的：可能是一句話、條列、編號，或用「·」「；」串起來。
 * 只在明確的分隔處切（換行、分號、條列符號、編號）；一整段沒有分隔的長文不硬切——
 * 切在句子中間的半句話不是賣點。
 */
export function splitUspText(raw: unknown): string[] {
  const text = Array.isArray(raw)
    ? raw.filter((x) => typeof x === "string").join("\n")
    : typeof raw === "string" ? raw : "";
  // 編號：「1.」「2、」「3)」「（4）」「①」；小數（3.5 倍）不算編號。
  const NUM = String.raw`(?:\d{1,2}(?:[、)）]|\.(?!\d))|[（(]\d{1,2}[)）]|[①-⑩])`;
  const BULLET = String.raw`[•●▪◆■\-–—]`;
  return text
    .split(new RegExp(String.raw`\n+|[；;]|\s·\s|(?:^|\s)${BULLET}\s+|(?:^|\s)${NUM}\s*`, "u"))
    // 分號切開後，後半段開頭可能還帶著自己的編號或條列符號。
    .map((s) => (s ?? "").replace(/\s+/g, " ").trim().replace(new RegExp(String.raw`^(?:${NUM}|${BULLET}\s)\s*`, "u"), "")
      .replace(/^[\s:：、，,。.]+|[\s、，,；;]+$/g, "").trim())
    .filter((s) => s.length >= 4)
    .map((s) => (s.length > USP_MAX_CHARS ? `${s.slice(0, USP_MAX_CHARS - 1)}…` : s));
}

/** 定位 JSON → 這個主體的賣點清單（去重、最多 MAX_USPS 條）。 */
export function uspsFromPositioning(kind: SubjectKind, positioning: unknown): Usp[] {
  const pos = typeof positioning === "string" ? safeParse(positioning) : positioning;
  if (!pos || typeof pos !== "object") return [];
  const out: Usp[] = [];
  const seen = new Set<string>();
  for (const [path, from] of USP_FIELDS[kind]) {
    const v = path.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), pos);
    for (const text of splitUspText(v)) {
      const key = squash(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ text, from });
      if (out.length >= MAX_USPS) return out;
    }
  }
  return out;
}

function safeParse(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }

/** 讀這個主體的賣點。產品／活動必須屬於這個品牌；讀不到就是空清單（不丟錯——沒有賣點照樣能研究）。 */
export async function loadUsps(brandId: number, subject: { kind: SubjectKind; id: number | null }): Promise<Usp[]> {
  try {
    if (subject.kind === "brand" || !subject.id) {
      const [rows]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ? LIMIT 1`, [brandId]);
      return uspsFromPositioning("brand", (rows as any[])[0]?.positioning);
    }
    const table = subject.kind === "product" ? "products" : "events";
    const [rows]: any = await localPool.execute(`SELECT positioning FROM ${table} WHERE id = ? AND brandId = ? LIMIT 1`, [subject.id, brandId]);
    return uspsFromPositioning(subject.kind, (rows as any[])[0]?.positioning);
  } catch {
    return [];
  }
}

/** 用戶送來的賣點清單：去空白、去重、限長度與數量。 */
export function cleanUsps(list: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(list) ? list : []) {
    const text = String(x ?? "").replace(/\s+/g, " ").trim().slice(0, USP_MAX_CHARS);
    const key = squash(text);
    if (text.length < 2 || seen.has(key)) continue;
    seen.add(key); out.push(text);
    if (out.length >= MAX_USPS) break;
  }
  return out;
}

// ─── 策略性匹配 ──────────────────────────────────────────────────────

export interface MatchPerson { id: string; label: string; platform: string; followers: string | null; digest: string }
export interface UspMatch { usp: string; why: string }

export function matchPrompt(args: {
  brandName: string; subjectLine: string; usps: string[]; people: MatchPerson[];
  /** 這一批裡已經配好的人各講哪個（補寫／重寫單一位時用）：賣點 → 人數。 */
  taken?: Record<string, number>;
  outputLanguage: string;
}): string {
  const taken = args.usps.map((u, i) => (args.taken?.[u] ? `${i + 1}：已有 ${args.taken[u]} 位在講` : "")).filter(Boolean);
  return [
    `你是「${args.brandName}」的網紅合作策略。這次要請幾位創作者講：${args.subjectLine}。`,
    `同一個主體有好幾個賣點，不該每一位都講同一句。請替每一位創作者挑一個「由他來講最有說服力」的賣點。`,
    ``,
    `【賣點】`,
    ...args.usps.map((u, i) => `${i + 1}. ${u}`),
    taken.length ? `\n【這一批其他創作者已經配好的】\n${taken.join("\n")}` : "",
    ``,
    `【創作者】`,
    ...args.people.map((p) => `■ id=${p.id}｜${p.label || "（沒有名字）"}｜${p.platform}${p.followers ? `｜${p.followers}` : ""}\n${p.digest}`),
    ``,
    `怎麼配：`,
    `- 看他平常的題材與觀眾：這個賣點由他講，觀眾會不會信、會不會想聽。題材接得上比粉絲多重要。`,
    `- 分散：每個賣點盡量至少有一位在講；除非真的只有一個賣點適合，不要讓超過一半的人擠在同一個。`,
    `- 同一位只配一個賣點。`,
    `- why：為什麼是他講這一個，一句、30 字內，要講到他的題材或觀眾（不是重複賣點）。用 ${args.outputLanguage || "zh-TW"} 寫。`,
    `- 素材裡的私人生活不要拿來當理由；看不出性別就不要寫「他」或「她」。`,
    `只輸出 JSON，不要前言：{"matches":[{"id":"${args.people[0]?.id ?? "p1"}","usp":1,"why":"…"}]}`,
  ].filter((x) => x !== "").join("\n");
}

function firstJson(raw: string): any {
  const s = String(raw ?? "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

/**
 * 解析匹配結果，並把沒配到的人補上：模型漏掉、編號不存在的，分給目前最少人講的賣點
 * （理由留空——那不是判斷出來的，不裝成有理由）。raw 可以是 null（模型呼叫失敗）＝全部用補的。
 */
export function parseMatches(
  raw: string | null, usps: string[], ids: string[], taken: Record<string, number> = {},
): Map<string, UspMatch> {
  const out = new Map<string, UspMatch>();
  if (!usps.length) return out;
  const count = new Map(usps.map((u) => [u, taken[u] ?? 0]));
  const list = raw ? firstJson(raw)?.matches : null;
  for (const m of Array.isArray(list) ? list : []) {
    const id = String(m?.id ?? "");
    const usp = usps[Number(m?.usp) - 1];
    if (!ids.includes(id) || out.has(id) || !usp) continue;
    out.set(id, { usp, why: String(m?.why ?? "").replace(/\s+/g, " ").trim().slice(0, 90) });
    count.set(usp, (count.get(usp) ?? 0) + 1);
  }
  for (const id of ids) {
    if (out.has(id)) continue;
    const usp = usps.reduce((best, u) => ((count.get(u) ?? 0) < (count.get(best) ?? 0) ? u : best), usps[0]!);
    out.set(id, { usp, why: "" });
    count.set(usp, (count.get(usp) ?? 0) + 1);
  }
  return out;
}
