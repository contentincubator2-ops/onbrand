/**
 * doctorInspire — 醫師自媒體示範頁（/inspire，免登入）的題庫、提示詞與解析。
 *
 * 2026-10-07（CJ「免登入的示範頁面，參考靈感牆……用戶是想要經營自媒體的醫生，選跟高血壓
 * 有關的議題、再選不同人的語調，產出不同的靈感給醫生參考和採用」）。
 *
 * 跟靈感舞台（planning/inspirationStage.ts）的差別：
 *   · 沒有品牌、沒有帳號：主體是「醫師本人＋一個體重管理議題」（2026-10-09 CJ：提案對象是肥胖症領域的藥廠專案，不是高血壓——
 *     議題與白名單整組換掉；同日再補：範圍是體重管理、糖尿病、脂肪肝三個領域，議題依領域分組；因為贊助方是處方藥藥廠，內容一律不出現任何藥品名、成分名或俗稱），事實只來自 inspireRegulations 的白名單。
 *   · 「誰來想」是 100 位創作者 agent（inspirePersonas.ts），每位帶自己的完整人設各呼叫一次。
 *   · 採用後不排進本週企劃，直接寫成該平台的成稿，再逐條過法規審查。
 *   · 審查只提建議（哪一句、為什麼、建議怎麼改），要不要改由醫師決定。
 */
import { INSPIRE_FACTS, FACT_SOURCE, type InspireRegulation, type RiskHit } from "./inspireRegulations";
import { leaksPersona, type InspirePersona, type InspirePlatform } from "./inspirePersonas";

// ─── 議題 ──────────────────────────────────────────────────────────────

export type InspireArea = "weight" | "diabetes" | "liver";

/** 議題分三個領域（2026-10-09 CJ：「適應症包括糖尿病、脂肪肝」）。畫面先選領域，再選議題。 */
export const INSPIRE_AREAS: Array<{ id: InspireArea; label: string }> = [
  { id: "weight", label: "體重管理" },
  { id: "diabetes", label: "糖尿病" },
  { id: "liver", label: "脂肪肝" },
];

export interface InspireTopic { id: string; area: InspireArea; label: string; hint: string }

export const INSPIRE_TOPICS: InspireTopic[] = [
  { id: "bmi", area: "weight", label: "我算胖嗎？BMI 與腰圍怎麼看", hint: "BMI 24 過重、27 肥胖；腰圍男 90、女 80 公分" },
  { id: "disease", area: "weight", label: "肥胖是一種慢性疾病", hint: "不是意志力的問題，也不只是外表的事" },
  { id: "waist", area: "weight", label: "體重正常，肚子卻很大", hint: "為什麼除了 BMI 還要量腰圍" },
  { id: "five-percent", area: "weight", label: "先減 5% 就有幫助", hint: "不用一次瘦很多，健康就會有感" },
  { id: "calories", area: "weight", label: "少吃多少才會瘦？", hint: "每天少 500 大卡，一週約 0.5 公斤" },
  { id: "exercise", area: "weight", label: "運動要做到多少才夠", hint: "每週 150 分鐘；想減重要 250 到 300 分鐘" },
  { id: "yoyo", area: "weight", label: "為什麼瘦了又胖回來", hint: "復胖不是你不夠努力" },
  { id: "diet-myth", area: "weight", label: "不吃澱粉、極端節食的迷思", hint: "每日熱量不應低於 1,200 大卡" },
  { id: "risk", area: "weight", label: "胖久了，身體會怎樣", hint: "糖尿病、高血壓、心血管與關節的風險" },
  { id: "plate", area: "weight", label: "外食族怎麼吃", hint: "全穀、蔬果、優質蛋白質，少油少鹽少糖" },
  { id: "when-doctor", area: "weight", label: "什麼時候該找醫師談體重", hint: "體重影響到健康時，可以討論有哪些做法" },
  { id: "stigma", area: "weight", label: "別再說「你就是懶」", hint: "體重汙名怎麼讓人更不敢求助" },
  { id: "dm-pre", area: "diabetes", label: "血糖偏高，還不算糖尿病？", hint: "空腹血糖 100 到 125、糖化血色素 5.7% 到 6.4% 是糖尿病前期" },
  { id: "dm-silent", area: "diabetes", label: "沒有症狀，不代表沒事", hint: "糖尿病前期要抽血才知道" },
  { id: "dm-reverse", area: "diabetes", label: "糖尿病前期可以逆轉", hint: "改善生活型態，風險可以降低五成以上" },
  { id: "dm-habits", area: "diabetes", label: "穩血糖的日常", hint: "低油、低鹽、低糖、高纖；每週運動 150 分鐘" },
  { id: "dm-metabolic", area: "diabetes", label: "代謝症候群是警訊", hint: "血糖異常加上腹部肥胖、血壓或血脂過高任兩項" },
  { id: "dm-comp", area: "diabetes", label: "血糖沒顧好，身體會怎樣", hint: "心血管、腎臟、視網膜都會受影響" },
  { id: "liver-what", area: "liver", label: "脂肪肝是怎麼來的", hint: "肥胖、三高、飲酒與生活型態" },
  { id: "liver-silent", area: "liver", label: "脂肪肝沒感覺，為什麼要管", hint: "可能一路走到肝硬化、肝癌" },
  { id: "liver-common", area: "liver", label: "脂肪肝比你想的更常見", hint: "研究指出臺灣的脂肪肝盛行率約 33.3%" },
  { id: "liver-weight", area: "liver", label: "顧肝，從體重和腰圍開始", hint: "認識 BMI、聰明吃、快樂動、天天量體重" },
  { id: "liver-myth", area: "liver", label: "保肝偏方的迷思", hint: "不要相信偏方，接受正規的追蹤與治療" },
  { id: "liver-follow", area: "liver", label: "有脂肪肝，要追蹤什麼", hint: "定期追蹤肝指數與腹部超音波" },
];

export function topicOf(id: string): InspireTopic | undefined {
  return INSPIRE_TOPICS.find((t) => t.id === id);
}

/** 自訂議題必須跟體重管理、糖尿病或脂肪肝有關——這頁的白名單與法規只涵蓋這個範圍。 */
export function isOnTopic(text: string): boolean {
  return /肥胖|體重|減重|減肥|瘦|胖|BMI|腰圍|體脂|體位|復胖|熱量|卡路里|代謝症候群|血糖|糖尿病|糖化血色素|脂肪肝|肝指數|肝硬化|obes|weight|diabet|liver/i.test(String(text ?? ""));
}

/** 自訂議題不可以談藥品或業配——贊助方是處方藥藥廠，題目本身就不能往藥品帶。 */
export function mentionsDrug(text: string): boolean {
  return /藥|針|GLP|semaglutide|tirzepatide|liraglutide|業配|代言|團購/i.test(String(text ?? ""));
}

export function resolveTopic(input: { topicId?: string; customTopic?: string }): { label: string; hint: string } | null {
  const custom = String(input.customTopic ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (custom) return isOnTopic(custom) && !mentionsDrug(custom) ? { label: custom, hint: "" } : null;
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

export const factsBlock = () => INSPIRE_FACTS.map((f) => `- ${f.text}`).join("\n");

export const GROUND_RULES = [
  `- 這是衛教內容，不是醫療廣告：不提院所名稱、不邀請掛號或預約、不提價格與優惠、不講治療成果、不用病人見證或減重前後對比。`,
  `- 不提任何藥品的商品名、成分名、廠牌或俗稱（包含瘦瘦針、減肥針、GLP-1、降血糖藥、保肝藥這類說法），也不暗示有某種藥、某種針可以解決；需要提到醫療協助時，只說「可以和醫師討論適合自己的做法」。`,
  `- 不說任何食物、飲品、保健食品、偏方、器材能減重、燃脂、降血糖、保肝、排毒或取代正規治療。`,
  `- 不叫讀者自己停藥、減藥或調整藥量；不說糖尿病或脂肪肝可以「根治」「不用再吃藥」。`,
  `- 不保證效果，不用「保證瘦、快速瘦、躺著瘦、不復胖、幾天瘦幾公斤、一定、最有效」這類說法。`,
  `- 不嘲笑體型、不做身材羞辱、不把胖歸咎於懶或沒意志力；幽默只能對著情境與迷思，不能對著人的身體。`,
  `- 不寫認得出是誰的病人故事；要舉例就用「門診常被問到」「很多人以為」這種泛稱。`,
  `- 數字、統計、標準值只能用白名單裡的，而且要寫對；白名單沒有的事，用不帶數字的說法。`,
  `- 不給個人化的熱量、體重目標、血糖目標或用藥建議；個人狀況一律請讀者與自己的醫師討論。`,
  `- 挑戰、實驗、整人這類形式只能用在安全、人人做得到的事（量腰圍、算 BMI、記錄飲食、看營養標示、走路、看懂健檢報告），不能做節食、斷食、極端運動或比誰瘦得快的挑戰，也不能拿病情開玩笑。`,
].join("\n");

export const PLATFORM_LABEL: Record<InspirePlatform, string> = {
  facebook: "Facebook", youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok",
};

export const PLATFORM_FORMAT: Record<InspirePlatform, string> = {
  facebook: "貼文", youtube: "影片腳本", instagram: "輪播", tiktok: "短影音腳本",
};

/** 寫給每一位 agent 的共同交代：身分不外露、主角是醫師。接在 agentPrompt 後面。 */
export function agentFrame(p: InspirePersona, doctor: string): string {
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

export const PLATFORM_SPEC: Record<InspirePlatform, string> = {
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
    `你是醫療內容的法規審查。這是一篇醫師寫給民眾的衛教內容，主題是體重管理、糖尿病或脂肪肝。你只判斷它有沒有落在下面這幾條的禁止範圍，不評文筆、不管風格。`,
    ``,
    ...items.map((r) => `■ ${r.id}｜${r.law} ${r.article}｜${r.title}\n  條文重點：${r.gist}\n  判斷標準：${r.check}`),
    // 2026-10-09 實跑：審查把官方原句「糖尿病前期是可以逆轉的」判成保證療效、把「研究指出…盛行率」判成摘錄醫學刊物、
    // 把「約三分之一」判成偏離 33.3%。白名單是主管機關自己的說法，每一組都要看得到，照著寫的不算違規。
    `\n【主管機關的公開衛教說法（白名單）】\n${factsBlock()}`,
    `成稿照白名單的意思寫的句子不算違規：包含白名單裡的說法本身（例如「糖尿病前期是可以逆轉的」「研究指出盛行率約…」）、
等值的換算（33.3% 寫成約三分之一、51.3% 寫成超過一半、五成寫成一半）、以及沒有標出調查年份或出處。
只有超出白名單的延伸才報：把「前期可以逆轉」說成「糖尿病可以逆轉、根治」、加上白名單沒有的數字或保證。`,
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
