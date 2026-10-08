/**
 * doctorInspire — 醫師自媒體示範頁（/inspire，免登入）的題庫、提示詞與解析。
 *
 * 2026-10-07（CJ「免登入的示範頁面，參考靈感牆……用戶是想要經營自媒體的醫生，選跟高血壓
 * 有關的議題、再選不同人的語調，產出不同的靈感給醫生參考和採用」）。
 *
 * 跟靈感舞台（planning/inspirationStage.ts）的差別：
 *   · 沒有品牌、沒有帳號：主體是「醫師本人＋一個高血壓議題」，事實只來自 inspireRegulations 的白名單。
 *   · 「誰來想」是 100 位創作者 agent（inspirePersonas.ts），每位帶自己的完整人設各呼叫一次。
 *   · 採用後不排進本週企劃，直接寫成該平台的成稿，再逐條過法規審查。
 *   · 審查只提建議（哪一句、為什麼、建議怎麼改），要不要改由醫師決定。
 */
import { INSPIRE_FACTS, FACT_SOURCE, type InspireRegulation, type RiskHit } from "./inspireRegulations";
import { leaksPersona, type InspirePersona, type InspirePlatform } from "./inspirePersonas";

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
  /** 這位 agent 的問題的答案——切角的錨。 */
  answer: string;
  title: string;
  hook: string;
  /** 怎麼做：橋段、畫面、道具、段落安排——看了就能開拍或開寫。 */
  concept: string;
  why: string;
  format: string;
}

const factsBlock = () => INSPIRE_FACTS.map((f) => `- ${f.text}`).join("\n");

const GROUND_RULES = [
  `- 這是衛教內容，不是醫療廣告：不提院所名稱、不邀請掛號或預約、不提價格與優惠、不講治療成果、不用病人見證或治療前後比較。`,
  `- 不提任何藥品商品名或廠牌；不說任何食物、保健食品、偏方能降血壓或取代藥物。`,
  `- 不保證效果，不用「根治、保證、一定、最有效、不用吃藥」這類說法。`,
  `- 不寫認得出是誰的病人故事；要舉例就用「門診常被問到」「很多人以為」這種泛稱。`,
  `- 數字、統計、標準值只能用白名單裡的，而且要寫對；白名單沒有的事，用不帶數字的說法。`,
  `- 不給個人化的用藥或劑量建議；提到調整用藥一律請讀者與自己的醫師討論。`,
  `- 挑戰、實驗、整人這類形式只能用在安全、人人做得到的事（量血壓、記錄、買菜、看標示、走路），不能拿健康冒險，也不能拿病情開玩笑。`,
].join("\n");

export const PLATFORM_LABEL: Record<InspirePlatform, string> = {
  facebook: "Facebook", youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok",
};

export const PLATFORM_FORMAT: Record<InspirePlatform, string> = {
  facebook: "貼文", youtube: "影片腳本", instagram: "輪播", tiktok: "短影音腳本",
};

/** 寫給每一位 agent 的共同交代：身分不外露、主角是醫師。接在 agentPrompt 後面。 */
function agentFrame(p: InspirePersona, doctor: string): string {
  return [
    p.agentPrompt,
    ``,
    `【這次的工作】`,
    `你現在替「${doctorByline(doctor)}」做內容企劃。出鏡、說話、署名的都是醫師本人，你出的是你的腦袋：你的形式、你的開場、你的節奏。`,
    `你的名字、帳號、頻道名、招牌口頭禪都不能出現在任何產出裡，也不要提到你是在模仿誰。`,
    `點子與成稿裡的角色一律用泛稱（先生、太太、女兒、朋友、同事），不要用你自己、家人或固定班底的名字與暱稱。`,
    `全部用台灣的繁體中文。`,
  ].join("\n");
}

/**
 * 一位 agent 一次呼叫，一次想 count 個點子。
 * 2026-10-07（CJ「產出的靈感都很無聊，看起來也沒什麼可以選擇」）：第一版把所有風格放進同一次
 * 呼叫、每個風格只有一百多字的描述，DEV 實跑出來四張卡都在重講 722 的規則本身。現在每位各自
 * 帶完整人設呼叫，並要求點子具體到「看了就能開拍」——有橋段、有畫面、有道具，而不是把衛教
 * 重點換個標題。
 */
export function personaIdeationPrompt(args: {
  doctor: string; topic: { label: string; hint: string };
  persona: InspirePersona; count: number; avoid?: string[]; direction?: string;
}): string {
  const p = args.persona;
  return [
    agentFrame(p, args.doctor),
    ``,
    `【議題】${args.topic.label}${args.topic.hint ? `（${args.topic.hint}）` : ""}——每個點子都必須在講這個議題，不能換題目。`,
    `【平台與形式】${PLATFORM_LABEL[p.platform]}・${PLATFORM_FORMAT[p.platform]}`,
    args.direction ? `【醫師希望往這個方向想】${args.direction}` : "",
    args.avoid?.length ? `【已經有的點子——不要重複，也不要換句話說】\n${args.avoid.map((a) => `- ${a}`).join("\n")}` : "",
    ``,
    `請用你自己的方法，替這個議題想 ${args.count} 個點子。做法：`,
    `1. 先回答你每次都會問自己的那個問題：「${p.question}」。${args.count} 個點子要是 ${args.count} 個不同的答案，而且各用你不同的招牌形式或題材轉換法——同一招換句話說不算。`,
    `2. 點子要具體到看了就能開拍或開寫：誰在什麼場景、手上拿什麼、第一個畫面是什麼、中間怎麼轉、最後怎麼收。`,
    `3. 不要交這種東西：「你知道嗎」「XX 的重要性」「三個重點一次看」「醫師教你」這類衛教口吻的標題；只是把規則念一遍的點子；拿掉平台名稱就看不出是誰想的點子。`,
    `4. 每個點子給：`,
    `   answer：你那個問題的答案（30 字內）。`,
    `   title：點子名稱（22 字內），要聽得出是你的形式。`,
    `   hook：成品的第一句話或第一個畫面的字卡（40 字內），可以直接用。`,
    `   concept：怎麼做（120 字內）：場景、道具、橋段順序、反轉或收尾。`,
    `   why：為什麼這樣做會有人看完（50 字內）。`,
    ``,
    `【可以用的事實（白名單，出處：${FACT_SOURCE.label}）】\n${factsBlock()}`,
    `【一定要守的規則——形式再大膽，這幾條不能破】\n${GROUND_RULES}`,
    ``,
    `只輸出 JSON，不要前言：{"ideas":[{"answer":"…","title":"…","hook":"…","concept":"…","why":"…"}]}`,
  ].filter(Boolean).join("\n");
}

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

/**
 * 一位 agent 的回覆 → 點子。最多收 max 個；露出本人名字、帳號或口頭禪的點子不收。
 * 解析不了回空陣列。
 */
export function parseIdeas(raw: string, persona: InspirePersona, max: number): InspireIdea[] {
  const obj = parseObject(raw);
  const list: any[] = Array.isArray(obj?.ideas) ? obj.ideas : Array.isArray(obj) ? obj : [];
  const out: InspireIdea[] = [];
  for (const a of list) {
    if (out.length >= max) break;
    const title = clip(a?.title, 44);
    const hook = unquote(clip(a?.hook, 80));
    if (title.length < 2 || hook.length < 2) continue;
    const idea: InspireIdea = {
      persona: persona.key, answer: clip(a?.answer, 60), title, hook,
      concept: clip(a?.concept, 240), why: clip(a?.why, 100),
      // 形式跟著平台走，不採信模型填的值。
      format: PLATFORM_FORMAT[persona.platform],
    };
    if (leaksPersona(`${idea.answer}\n${idea.title}\n${idea.hook}\n${idea.concept}\n${idea.why}`, persona)) continue;
    out.push(idea);
  }
  return out;
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
  idea: Pick<InspireIdea, "title" | "hook" | "answer" | "why"> & { concept?: string };
}): string {
  const p = args.persona;
  return [
    agentFrame(p, args.doctor),
    ``,
    `醫師採用了你的這個點子，現在把它寫成成稿。以醫師本人第一人稱寫，讀者是一般民眾。`,
    `【議題】${args.topic.label}${args.topic.hint ? `（${args.topic.hint}）` : ""}`,
    `【點子】${args.idea.title}`,
    `【開場（照這個意思開場，可以微調字句）】${args.idea.hook}`,
    args.idea.concept ? `【怎麼做】${args.idea.concept}` : "",
    args.idea.answer ? `【核心】${args.idea.answer}` : "",
    `【形式】${PLATFORM_SPEC[p.platform]}`,
    `照你的結構節拍與語言指紋寫——醫師讀起來要覺得「這不是一般的衛教文」。醫師的專業與穩重要留著：形式可以大膽，但不能拿病情開玩笑、不能嚇人。`,
    `【可以用的事實（白名單，出處：${FACT_SOURCE.label}）】\n${factsBlock()}`,
    `【一定要守的規則】\n${GROUND_RULES}`,
    `- 自稱用「我」；需要署名時用「${doctorByline(args.doctor)}」。不要編醫師的學經歷、科別、服務院所或看診經驗的數字。`,
    `- 不要用 Markdown 的標題、粗體或項目符號；hashtag 前面的 # 照常要寫。不要自己加免責聲明，系統會補。`,
    `只輸出成稿本身，不要前言或說明。`,
  ].filter(Boolean).join("\n");
}

/** 模型偶爾還是會包程式碼框或加 Markdown 粗體；清掉後補上固定提醒。 */
export function finalizeDraft(raw: string): string {
  const body = String(raw ?? "")
    .replace(/^```[a-z]*\s*/i, "").replace(/\s*```\s*$/i, "")
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "")
    .replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  return body.includes(EDUCATION_NOTE) ? body : `${body}\n\n${EDUCATION_NOTE}`;
}

// ─── 逐條審查 ──────────────────────────────────────────────────────────

export interface ReviewIssue {
  /** 違反哪一條（InspireRegulation.id）。 */
  regulationId: string;
  /** 成稿裡的原句（照抄，一定找得到）。 */
  quote: string;
  /** 為什麼（40 字內）。 */
  detail: string;
  /** 建議改成的句子；空字串＝建議整句刪除。只是建議，由醫師決定要不要改。 */
  suggestion: string;
}

/**
 * 一次審一組條文（同一部法）：只判斷有沒有落在條文的範圍，不評文筆。
 * 2026-10-07（CJ「審查後不要直接改寫，要提出建議，看醫生自己是否要改寫」）：
 * 審查只交出「哪一句、為什麼、建議怎麼改」，成稿原封不動。
 */
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
    `4. quote 要照抄成稿裡的原句（從上一個句號或換行之後，到這一句的句號為止），一個字都不能改；detail 用 40 字內說為什麼。`,
    `5. suggestion 是給醫師參考的改法：把那一句改成合規、意思接近、語氣與原文一致的一句話，長度接近原句；如果那一句拿掉最好，就填空字串。建議裡不可以加進原句沒有的事實、數字或「研究顯示」這類說法。你不要改成稿，只提建議。`,
    `6. 同一句在這一組只報一次，regulationId 填最直接相關的那一條，其他相關的條文寫在 detail 裡。每一句有疑慮的話都要報，不要因為前面報過別句就略過。`,
    `只輸出 JSON，不要前言：{"issues":[]} 或 {"issues":[{"regulationId":"${ids[0] ?? ""}","quote":"…","detail":"…","suggestion":"…"}]}`,
  ].filter(Boolean).join("\n");
}

/** 模型回的 issues 清乾淨：條號要在這一組裡、quote 要一字不差出現在成稿裡，否則不收。 */
export function parseReviewIssues(raw: string, args: { ids: string[]; text: string }): ReviewIssue[] | null {
  const obj = parseObject(raw);
  if (!obj || !Array.isArray(obj.issues)) return null;
  return (obj.issues as any[])
    .map((i) => ({
      regulationId: String(i?.regulationId ?? "").trim(),
      quote: String(i?.quote ?? "").trim().slice(0, 300),
      detail: clip(i?.detail, 80),
      suggestion: String(i?.suggestion ?? "").trim().slice(0, 300),
    }))
    .filter((i) => args.ids.includes(i.regulationId) && i.quote.length >= 2 && args.text.includes(i.quote) && i.suggestion !== i.quote)
    .slice(0, 20);
}
