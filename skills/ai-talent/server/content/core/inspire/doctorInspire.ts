/**
 * doctorInspire — 醫師自媒體示範頁（/inspire，免登入）的題庫、提示詞與解析。
 *
 * 2026-10-07（CJ「免登入的示範頁面，參考靈感牆……用戶是想要經營自媒體的醫生，選跟高血壓
 * 有關的議題、再選不同人的語調，產出不同的靈感給醫生參考和採用」）。
 *
 * 跟靈感舞台（planning/inspirationStage.ts）的差別：
 *   · 沒有品牌、沒有帳號：主體是「醫師本人＋一個高血壓議題」，事實只來自 inspireRegulations 的白名單。
 *   · 「誰來想」不是思考派別，而是各平台的說話風格（inspirePersonas.ts）。
 *   · 採用後不排進本週企劃，直接寫成該平台的成稿，再逐條過法規審查。
 * 沿用靈感舞台的做法：一輪一次呼叫、每人先回答自己的問題再長出切角（原因見那邊的檔頭）。
 */
import { INSPIRE_FACTS, FACT_SOURCE, type InspireRegulation, type RiskHit } from "./inspireRegulations";
import { PERSONA_KEYS, personaOf, type InspirePersona, type InspirePlatform } from "./inspirePersonas";

// ─── 議題 ──────────────────────────────────────────────────────────────

export interface InspireTopic { id: string; label: string; hint: string }

export const INSPIRE_TOPICS: InspireTopic[] = [
  { id: "threshold", label: "血壓多少算高？", hint: "130/80 的新標準，為什麼跟以前聽到的不一樣" },
  { id: "722", label: "在家怎麼量才準：722 原則", hint: "連續七天、早晚各一次、每次量兩遍" },
  { id: "measure-mistakes", label: "量血壓最常犯的錯", hint: "量的時間、姿勢、次數，哪些習慣會讓數字失真" },
  { id: "white-coat", label: "在診間量比較高，是高血壓嗎？", hint: "診間血壓與居家血壓的差別" },
  { id: "silent", label: "沒有不舒服，需要理它嗎？", hint: "高血壓常常沒有症狀" },
  { id: "salt", label: "吃清淡一點，到底是多淡？", hint: "低鹽、低油、低糖、高纖的日常做法" },
  { id: "exercise", label: "運動對血壓的幫助", hint: "一天至少 30 分鐘，怎麼開始" },
  { id: "young", label: "年輕人也會高血壓", hint: "不是長輩才要量血壓" },
  { id: "medication-myth", label: "吃了藥就要吃一輩子？", hint: "對降血壓藥最常見的擔心" },
  { id: "stop-medication", label: "血壓正常了，可以自己停藥嗎？", hint: "為什麼調藥要跟醫師討論" },
  { id: "complications", label: "血壓高久了會怎樣", hint: "與心臟病、中風的關係" },
  { id: "checkup", label: "多久沒量血壓了？", hint: "將近四分之一的成年人一年內沒量過" },
];

export function topicOf(id: string): InspireTopic | undefined {
  return INSPIRE_TOPICS.find((t) => t.id === id);
}

/** 自訂議題必須跟高血壓／血壓有關——這頁的白名單與法規只涵蓋這個範圍。 */
export function isHypertensionTopic(text: string): boolean {
  return /血壓|高血壓|降壓|收縮壓|舒張壓|量血壓|血壓計|hypertension|blood\s*pressure/i.test(String(text ?? ""));
}

export function resolveTopic(input: { topicId?: string; customTopic?: string }): { label: string; hint: string } | null {
  const custom = String(input.customTopic ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (custom) return isHypertensionTopic(custom) ? { label: custom, hint: "" } : null;
  const t = input.topicId ? topicOf(input.topicId) : undefined;
  return t ? { label: t.label, hint: t.hint } : null;
}

/** 醫師輸入的名字：去掉控制字元與引號，留 20 字；空的回 null。 */
export function cleanDoctorName(raw: unknown): string | null {
  const s = String(raw ?? "").replace(/[\u0000-\u001f<>{}「」『』"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
  return s.length >= 1 ? s : null;
}

/** 文案裡的自稱：名字本身已經帶「醫師」就不重複。 */
export function doctorByline(name: string): string {
  return /醫師|醫生|Dr\.?/i.test(name) ? name : `${name}醫師`;
}

// ─── 靈感（切角） ──────────────────────────────────────────────────────

export interface InspireIdea {
  persona: string;
  /** 這個風格的問題的答案——切角的錨。 */
  answer: string;
  title: string;
  hook: string;
  why: string;
  format: string;
}

const factsBlock = () => INSPIRE_FACTS.map((f) => `- ${f.text}`).join("\n");

const GROUND_RULES = [
  `- 這是衛教內容，不是醫療廣告：不提院所名稱、不邀請掛號或預約、不提價格與優惠、不講治療成果、不用病人見證或治療前後比較。`,
  `- 不提任何藥品商品名或廠牌；不說任何食物、保健食品、偏方能降血壓或取代藥物。`,
  `- 不保證效果，不用「根治、保證、一定、最有效、不用吃藥」這類說法。`,
  `- 不寫認得出是誰的病人故事；要舉例就用「門診常被問到」「很多人以為」這種泛稱。`,
  `- 數字、統計、標準值只能用下面白名單裡的，而且要寫對；白名單沒有的事，用不帶數字的說法。`,
  `- 不給個人化的用藥或劑量建議；提到調整用藥一律請讀者與自己的醫師討論。`,
].join("\n");

/**
 * 一輪只打一次模型：選到的風格全部放進同一份提示詞（多樣性的理由同 inspirationStage）。
 * 風格只描述「怎麼說」，不出現任何真實人名——模型不知道是誰，就不會寫出來。
 */
export function inspireIdeationPrompt(args: {
  doctor: string; topic: { label: string; hint: string };
  personas: InspirePersona[]; count: number; avoid?: string[]; direction?: string;
}): string {
  const solo = args.personas.length === 1;
  const roster = args.personas.map((p) =>
    `■ ${p.key}｜${p.label}｜${PLATFORM_LABEL[p.platform]}\n  先回答：${p.question}\n  說話方式：${p.style}`).join("\n");
  return [
    `你要替「${doctorByline(args.doctor)}」想自媒體內容的切角——只想切角，不寫全文。內容一律是醫師本人第一人稱說話。`,
    `【這次固定講的議題】${args.topic.label}${args.topic.hint ? `（${args.topic.hint}）` : ""}——每個切角都必須在講這個議題，不能換題目。`,
    solo
      ? `這次只用一種說話風格，照它想 ${args.count} 個不同的切角；每個切角的 answer 都要是那個問題的另一個答案，同一個答案換句話說不算：`
      : `下面每一種說話風格各想 ${args.count} 個切角。風格只決定「怎麼開場、怎麼安排」，講的仍然是醫師自己的專業：`,
    roster,
    ``,
    args.direction ? `【醫師希望往這個方向再想】${args.direction}` : "",
    args.avoid?.length ? `【畫面上已經有的切角——不要重複，也不要換句話說】\n${args.avoid.map((a) => `- ${a}`).join("\n")}` : "",
    `【可以用的事實（白名單，出處：${FACT_SOURCE.label}）】\n${factsBlock()}`,
    `【一定要守的規則】\n${GROUND_RULES}`,
    ``,
    `做法：`,
    `1. answer：先用一句話回答那個風格的問題（25 字內），要具體到只屬於這個議題。`,
    `2. 從 answer 長出切角。title：切角名稱，20 字內，說清楚這一篇講什麼；hook：成品的第一句，40 字內，要聽得出那個風格；why：為什麼這個風格這樣切，60 字內。`,
    `3. format 填那個風格所在平台的形式：${Object.entries(PLATFORM_FORMAT).map(([k, v]) => `${PLATFORM_LABEL[k as InspirePlatform]}＝${v}`).join("、")}。`,
    `4. 寫完自己檢查：任兩個切角如果可以互換、或是講同一件事，就重想其中一個。`,
    `- 不要寫出任何真實網紅、名人、頻道的名字，也不要模仿特定人的口頭禪。`,
    `- 全部用台灣的繁體中文。`,
    `只輸出 JSON，不要前言：{"ideas":[{"persona":"${args.personas[0]?.key ?? ""}","answer":"…","title":"…","hook":"…","why":"…","format":"…"}]}`,
  ].filter(Boolean).join("\n");
}

export const PLATFORM_LABEL: Record<InspirePlatform, string> = {
  facebook: "Facebook", youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok",
};

export const PLATFORM_FORMAT: Record<InspirePlatform, string> = {
  facebook: "貼文", youtube: "影片腳本", instagram: "輪播", tiktok: "短影音腳本",
};

const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function parseObject(raw: string): any {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* 往下找第一個物件 */ }
  const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { /* 解析不了 */ } }
  return null;
}

function unquote(s: string): string {
  const pairs: Array<[string, string]> = [["「", "」"], ["『", "』"], ["“", "”"], ['"', '"']];
  for (const [o, c] of pairs) {
    if (s.startsWith(o) && s.endsWith(c) && s.length > 2 && !s.slice(1, -1).includes(o)) return s.slice(1, -1).trim();
  }
  return s;
}

/** 模型回覆 → 每個風格的切角；只收要求的風格，每個最多 perPersona 個。解析不了回空陣列。 */
export function parseIdeas(raw: string, args: { keys: string[]; perPersona: number }): InspireIdea[] {
  const obj = parseObject(raw);
  const list: any[] = Array.isArray(obj?.ideas) ? obj.ideas : Array.isArray(obj) ? obj : [];
  const out: InspireIdea[] = [];
  const per = new Map<string, number>();
  for (const a of list) {
    const k = String(a?.persona ?? "").trim();
    const key = args.keys.includes(k) ? k : args.keys.length === 1 ? args.keys[0]! : null;
    if (!key || !PERSONA_KEYS.includes(key) || (per.get(key) ?? 0) >= args.perPersona) continue;
    const title = clip(a?.title, 40);
    const hook = unquote(clip(a?.hook, 80));
    if (title.length < 2 || hook.length < 2) continue;
    out.push({
      persona: key, answer: clip(a?.answer, 60), title, hook, why: clip(a?.why, 120),
      // 形式跟著平台走，不採信模型填的值。
      format: PLATFORM_FORMAT[personaOf(key)!.platform],
    });
    per.set(key, (per.get(key) ?? 0) + 1);
  }
  return out.sort((x, y) => args.keys.indexOf(x.persona) - args.keys.indexOf(y.persona));
}

// ─── 成稿 ──────────────────────────────────────────────────────────────

const PLATFORM_SPEC: Record<InspirePlatform, string> = {
  facebook: "Facebook 貼文：350–500 字。第一句就是開場句；短段落、每段 1–3 句、段落之間空一行；結尾留一個讓人想留言的問題；最後 2–3 個 hashtag。",
  instagram: "Instagram 輪播：先寫 6 張卡的文字，每張一行，格式「第 1 張｜…」到「第 6 張｜…」，每張 30 字內，第 1 張是開場句、第 6 張是一句帶得走的結論；空一行後寫說明文字 120–180 字；最後 5–8 個 hashtag。",
  youtube: "YouTube 影片腳本（約 4–6 分鐘）：依序寫「標題｜」（30 字內）、「開場 15 秒｜」（照開場句說）、「第一段｜」「第二段｜」「第三段｜」（每段 120–180 字的口白，段首用一句話說這段的重點）、「結尾｜」（一句總結＋請觀眾留言想聽的主題）。口語、像對著鏡頭說話。",
  tiktok: "TikTok 短影音口播腳本（30–45 秒，約 150–220 字）：依序寫「0–3 秒｜」（開場句）、「3–25 秒｜」（最多三個重點，每點一句）、「25–40 秒｜」（收尾＋一句行動提醒）；每一行後面用括號寫畫面或字卡提示；最後 3–5 個 hashtag。",
};

/** 固定加在成稿最後的提醒——程式補上，不靠模型記得寫。 */
export const EDUCATION_NOTE = "※ 本文是衛教資訊，不能取代看診。個人狀況與用藥調整，請與您的醫師討論。";

export function inspireWritePrompt(args: {
  doctor: string; topic: { label: string; hint: string }; persona: InspirePersona;
  idea: Pick<InspireIdea, "title" | "hook" | "answer" | "why">;
}): string {
  const p = args.persona;
  return [
    `你是「${doctorByline(args.doctor)}」的自媒體寫手。這一篇以醫師本人第一人稱寫，讀者是一般民眾。`,
    `【議題】${args.topic.label}${args.topic.hint ? `（${args.topic.hint}）` : ""}`,
    `【這一篇的切角】${args.idea.title}`,
    `【開場句（照這個意思開場，可以微調字句）】${args.idea.hook}`,
    args.idea.answer ? `【切角的核心】${args.idea.answer}` : "",
    `【說話風格：${p.label}】${p.style}`,
    `風格只用在節奏、開場、結構與用字；不要寫出任何真實網紅、名人、頻道的名字，也不要模仿特定人的口頭禪。醫師的專業與穩重要留著——風格再活潑，也不能拿病情開玩笑、不能嚇人。`,
    `【形式】${PLATFORM_SPEC[p.platform]}`,
    `【可以用的事實（白名單，出處：${FACT_SOURCE.label}）】\n${factsBlock()}`,
    `【一定要守的規則】\n${GROUND_RULES}`,
    `- 自稱用「我」；需要署名時用「${doctorByline(args.doctor)}」。不要編醫師的學經歷、科別、服務院所或看診經驗的數字。`,
    `- 全部用台灣的繁體中文；不要用 Markdown 符號（#、**、-）。`,
    `- 不要自己加免責聲明，系統會補。`,
    `只輸出成稿本身，不要前言或說明。`,
  ].filter(Boolean).join("\n");
}

/** 模型偶爾還是會包程式碼框或加 Markdown 粗體；清掉後補上固定提醒。 */
export function finalizeDraft(raw: string): string {
  const body = String(raw ?? "")
    .replace(/^```[a-z]*\s*/i, "").replace(/\s*```\s*$/i, "")
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n").trim();
  return body.includes(EDUCATION_NOTE) ? body : `${body}\n\n${EDUCATION_NOTE}`;
}

export function stripEducationNote(text: string): string {
  return String(text ?? "").replace(EDUCATION_NOTE, "").trim();
}

// ─── 逐條審查 ──────────────────────────────────────────────────────────

export interface ReviewIssue {
  /** 違反哪一條（InspireRegulation.id）。 */
  regulationId: string;
  /** 成稿裡的原句（照抄）。 */
  quote: string;
  /** 為什麼（40 字內）。 */
  detail: string;
}

/** 一次審一組條文（同一部法）：只判斷有沒有落在條文的範圍，不評文筆。 */
export function reviewPrompt(items: InspireRegulation[], hits: RiskHit[]): string {
  const ids = items.map((r) => r.id);
  const own = hits.filter((h) => ids.includes(h.regulationId));
  return [
    `你是醫療內容的法規審查。這是一篇醫師寫給民眾的高血壓衛教內容。你只判斷它有沒有落在下面這幾條的禁止範圍，不評文筆、不管風格。`,
    ``,
    ...items.map((r) => `■ ${r.id}｜${r.law} ${r.article}｜${r.title}\n  條文重點：${r.gist}\n  判斷標準：${r.check}`),
    items.some((r) => r.id === "facts") ? `\n【白名單】\n${factsBlock()}` : "",
    own.length ? `\n【關鍵字掃描先標出的句子（只是線索，仍要你判斷）】\n${own.map((h) => `- ${h.regulationId}｜${h.why}｜${h.quote}`).join("\n")}` : "",
    ``,
    `做法：`,
    `1. 逐條讀，逐句對照成稿。只有「成稿的說法落在判斷標準描述的範圍」才算；條文沒提到的不要自己延伸。`,
    `2. 同義改寫、暗示、疑問句包裝一樣算。`,
    `3. 成稿最後那句「本文是衛教資訊……」是系統加的提醒，不用審。`,
    `4. quote 要照抄成稿裡的原句，不能改字；detail 40 字內說為什麼。`,
    `只輸出 JSON，不要前言：{"issues":[]} 或 {"issues":[{"regulationId":"${ids[0] ?? ""}","quote":"…","detail":"…"}]}`,
  ].filter(Boolean).join("\n");
}

const squash = (s: string) => s.replace(/\s+/g, "");

/** 模型回的 issues 清乾淨：條號要在這一組裡、quote 要真的出現在成稿裡，否則不收。 */
export function parseReviewIssues(raw: string, args: { ids: string[]; text: string }): ReviewIssue[] | null {
  const obj = parseObject(raw);
  if (!obj || !Array.isArray(obj.issues)) return null;
  const hay = squash(args.text);
  return (obj.issues as any[])
    .map((i) => ({
      regulationId: String(i?.regulationId ?? "").trim(),
      quote: String(i?.quote ?? "").trim().slice(0, 200),
      detail: clip(i?.detail, 80),
    }))
    .filter((i) => args.ids.includes(i.regulationId) && i.quote.length >= 2 && hay.includes(squash(i.quote)))
    .slice(0, 6);
}

/** 有問題時的最小幅度修正：只改被點名的句子。 */
export function fixPrompt(issues: Array<ReviewIssue & { law: string }>): string {
  return [
    `你是醫療內容的編輯。下面這篇高血壓衛教內容有幾句不符合法規，請做最小幅度修正。`,
    ...issues.map((i) => `- 原句：${i.quote}\n  問題（${i.law}）：${i.detail}`),
    ``,
    `做法：`,
    `1. 只改被點名的句子，換成合規、意思接近的說法；改不了就刪掉那一句。其餘文字、段落、換行、格式標記（例如「第 1 張｜」「0–3 秒｜」）、hashtag 全部保留。`,
    `2. 修正後不能再出現被點名的原句。數字只能用這幾條：\n${factsBlock()}`,
    `3. 不要加任何說明或免責聲明。`,
    `只輸出修正後的全文。`,
  ].join("\n");
}

/** 修正稿可不可以收：長度沒有大幅縮水、沒有殘留被點名的原句。回傳拒收原因；可以收回 null。 */
export function rejectFix(original: string, revised: string, issues: ReviewIssue[]): string | null {
  const a = stripEducationNote(original); const b = stripEducationNote(revised);
  if (b.length < 40) return "empty";
  if (b.length < a.length * 0.6 || b.length > a.length * 1.4) return "length";
  const hay = squash(b);
  if (issues.some((i) => hay.includes(squash(i.quote)))) return "kept violating sentence";
  return null;
}
