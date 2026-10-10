/**
 * 醫師示範頁第二版的寫法：先把醫師自己的專業寫成文章，再套流量密碼。
 *
 * 2026-10-10（CJ 轉述客戶反饋：「寫出來的內容都很表面，用 AI 工具就能寫出來……沒有考量到醫生這個行業的特色……
 * 我們是將流量密碼加在醫生原有的專業上」「先按照他的口吻寫出文章，再看他想套用哪一種流量密碼」）。
 *
 * 第一版（doctorInspire.ts）的順序是「創作者 agent 想點子 → 寫成稿」，素材只有白名單那幾條公開衛教事實，
 * 50 位醫師拿到的是同一份素材，所以寫出來像衛教單張。這一版倒過來：
 *   1. 題目來自民眾真的在問的問題（INSPIRE_QUESTIONS，客戶提供的聲量資料）。
 *   2. 醫師先口述自己在診間怎麼回答（INTERVIEW_QUESTIONS）。
 *   3. voiceArticlePrompt：編輯把口述整理成一篇署名問答文章——內容只能來自醫師口述與白名單，照醫師的寫作習慣排。
 *   4. trafficRemixPrompt：創作者 agent 只改包裝（標題、開場、順序、節奏、平台形式），不准新增任何醫療說法。
 *   5. 審查沿用 doctorInspire.reviewPrompt。
 * 第一版的流程沒有動，兩條路並存，等這一版用真的醫師內容驗過再決定換不換。
 */
import { GROUND_RULES, PLATFORM_SPEC, agentFrame, doctorByline, factsBlock } from "./doctorInspire";
import type { InspirePersona } from "./inspirePersonas";
import { writingStyleBlock } from "./doctorWritingStyle";

// ─── 民眾在問的問題 ────────────────────────────────────────────────────

export type QuestionArea = "weight" | "diabetes" | "growth";

/**
 * 能不能直接開放給醫師寫：
 *   open  — 現行規則下可以寫。
 *   legal — 題目本身在問藥品（怎麼選、劑量、副作用、停藥）。贊助方是處方藥藥廠，現行規則一律不提藥品，
 *           要不要開放、怎麼寫，得由藥廠法務決定；決定之前只列在問題地圖上，不讓醫師選。
 *   facts — 這個領域還沒有核對過的事實白名單，補齊之前不開放。
 */
export type QuestionScope = "open" | "legal" | "facts";

export interface InspireQuestion { id: string; area: QuestionArea; label: string; volume: number; scope: QuestionScope }

/** 三個領域的總聲量（則）。來源：CJ 2026-10-10 轉來的客戶資料，統計期間與來源平台未註明。 */
export const QUESTION_AREAS: Array<{ id: QuestionArea; label: string; volume: number }> = [
  { id: "weight", label: "減重", volume: 615680 },
  { id: "diabetes", label: "第二型糖尿病", volume: 10058 },
  { id: "growth", label: "兒童成長／骨齡", volume: 38994 },
];

export const INSPIRE_QUESTIONS: InspireQuestion[] = [
  { id: "w-muscle", area: "weight", label: "減脂怎麼不掉肌肉？重訓和蛋白質要怎麼配", volume: 23927, scope: "open" },
  { id: "w-choose", area: "weight", label: "減重針劑怎麼選、劑量怎麼調", volume: 21451, scope: "legal" },
  { id: "w-side", area: "weight", label: "噁心、掉髮等副作用怎麼辦", volume: 15829, scope: "legal" },
  { id: "w-liver", area: "weight", label: "脂肪肝和減重有什麼關係", volume: 10968, scope: "open" },
  { id: "w-rebound", area: "weight", label: "停藥後會不會復胖", volume: 5080, scope: "legal" },
  { id: "d-drug", area: "diabetes", label: "糖尿病藥物怎麼選？護心護腎是什麼意思", volume: 6225, scope: "legal" },
  { id: "d-diet", area: "diabetes", label: "控糖飲食：澱粉和碳水到底怎麼吃", volume: 4736, scope: "open" },
  { id: "d-reverse", area: "diabetes", label: "糖尿病能逆轉嗎？可以減藥或停藥嗎", volume: 1452, scope: "legal" },
  { id: "d-insulin", area: "diabetes", label: "打胰島素、低血糖與劑量安全", volume: 1252, scope: "legal" },
  { id: "d-food", area: "diabetes", label: "這個食物、這個保健品，糖尿病能不能吃", volume: 922, scope: "open" },
  { id: "g-rate", area: "growth", label: "孩子一年該長多少？什麼時候要就醫", volume: 17801, scope: "facts" },
  { id: "g-habit", area: "growth", label: "蛋白質、早餐、睡眠、運動，哪個對長高有用", volume: 6085, scope: "facts" },
  { id: "g-short", area: "growth", label: "比同齡矮、長不高怎麼辦", volume: 5076, scope: "facts" },
  { id: "g-bone", area: "growth", label: "骨齡檢查在看什麼？預估身高準嗎", volume: 3328, scope: "facts" },
  { id: "g-gh", area: "growth", label: "生長激素什麼情況會用？效果與風險", volume: 2063, scope: "legal" },
];

export function questionOf(id: string): InspireQuestion | undefined {
  return INSPIRE_QUESTIONS.find((q) => q.id === id);
}

/** 醫師先回答這幾題——成稿的內容只能來自這裡。 */
export const INTERVIEW_QUESTIONS: string[] = [
  "病人在診間問這個問題時，原話通常是怎麼問的？",
  "您會怎麼回答？請照平常在診間講的方式說。",
  "病人最常誤會的是什麼？您怎麼跟他解釋？",
  "有沒有您常用的比喻、口訣，或會請病人回家先做的一件事？",
];

const clip = (v: unknown, n: number) => String(v ?? "").replace(/[ \t]+/g, " ").trim().slice(0, n);

/** 醫師的口述太短就沒有東西可以寫——寧可請他多說一點，也不要讓模型自己補。 */
export function interviewIsThin(answers: string[]): boolean {
  return answers.map((a) => clip(a, 2000)).join("").replace(/\s/g, "").length < 80;
}

// ─── 第一步：照醫師的口吻寫成文章 ──────────────────────────────────────

export interface VoiceArticle {
  /** 民眾會拿去問 AI 的那種問句。 */
  title: string;
  article: string;
  /** 編輯覺得醫師還沒講到、補了文章會更完整的地方——問醫師，不自己補。 */
  gaps: string[];
}

/**
 * style 有給就用研究歸納的醫師寫作規範（doctorWritingStyle.ts）；沒給就是第一天的簡版，留著當對照。
 * 帶 style 時另外放寬一條規則：不再要求每個建議都接「請與醫師討論」——那正是 AI 衛教文的特徵。
 * 藥品的規則沒有動，等藥廠法務決定。
 */
export function voiceArticlePrompt(args: {
  doctor: string; specialty?: string; question: string; answers: string[]; sample?: string;
  style?: { specialtyId?: string; typeId?: string };
}): string {
  const specialty = clip(args.specialty, 20);
  const qa = INTERVIEW_QUESTIONS.map((q, i) => {
    const a = clip(args.answers[i], 2000);
    return a ? `問：${q}\n醫師：${a}` : "";
  }).filter(Boolean).join("\n\n");
  const sample = clip(args.sample, 3000);
  return [
    `你是醫師的文字編輯，不是作者。你的工作是把「${doctorByline(args.doctor)}」${specialty ? `（${specialty}）` : ""}的口述，整理成一篇他本人署名的衛教問答文章。`,
    `這篇文章的價值在醫師自己的專業判斷與說法。你不可以替他發明內容。`,
    ``,
    `【民眾的問題】${args.question}`,
    ``,
    `【醫師的口述（文章的內容只能來自這裡）】`,
    qa,
    sample ? `\n【醫師以前寫過的文字（只用來學他的語氣與用詞，不要搬內容）】\n${sample}` : "",
    ``,
    `【內容的界線】`,
    `- 每一個醫療說法、判斷、建議、比喻、例子，都必須是醫師口述裡有的。口述沒講的，不要寫。`,
    `- 數字與統計：醫師口述裡有的照他的說法寫；另外只能用下面白名單裡的數字，而且要寫對。不要從你自己的知識補數字、研究或指引。`,
    `- 口述裡若有認得出是誰的病人細節（年齡加職業加地點這類組合），改成泛稱。`,
    `- 你覺得文章缺了什麼（例如沒講什麼情況該回診、某個說法需要出處），不要自己補，列在 gaps 裡問醫師，最多 3 條。`,
    ``,
    ...(args.style ? [
      writingStyleBlock(args.style),
      ``,
      `【這一篇另外要做到】`,
      `- 前兩段之內要有 2 到 3 句直接回答問題的話，能單獨被引用。`,
      `- 第一人稱。保留醫師的口頭用語、比喻與講話順序，讀起來要像他本人。`,
      `- 不用「一定」「保證」「最有效」這類絕對的說法；除此之外，醫師講得肯定的地方就寫得肯定。`,
      `- 不賣關子、不用驚嘆號堆情緒、不用網路流行語。這一版是底稿，包裝是下一步的事。`,
    ] : [
      `【醫師寫東西的習慣——照這個寫】`,
      `- 第一段用 2 到 3 句直接回答問題，結論先講；這一段要能單獨被引用。`,
      `- 接著依序是：診間裡病人怎麼問（情境）→ 我怎麼回答、為什麼（理由或機轉，用醫師自己的比喻）→ 常見的誤會 → 什麼情況要找醫師。口述沒有的段落就略過，不要硬湊。`,
      `- 第一人稱。保留醫師的口頭用語、比喻與講話順序，讀起來要像他本人。`,
      `- 判斷留餘地：用「多數」「通常」「依每個人的狀況」，不用「一定」「保證」「最有效」。`,
      `- 不賣關子、不用驚嘆號堆情緒、不用網路流行語。這一版是底稿，包裝是下一步的事。`,
    ]),
    `- 標題用民眾會直接拿去問的問句。全文 500 到 800 字；口述內容少就寫短一點，不要灌水。`,
    `- 最後一行署名：「文／${doctorByline(args.doctor)}${specialty ? `（${specialty}）` : ""}」。不要編學經歷、院所或看診年資。`,
    ``,
    `【白名單（可以引用的公開數字）】\n${factsBlock()}`,
    ``,
    `【一定要守的規則】\n${args.style ? GROUND_RULES.replace("個人狀況一律請讀者與自己的醫師討論。", "需要醫師依個人狀況判斷的地方，照醫師口述的說法寫，全篇提醒一次就好，不要每段都加。") : GROUND_RULES}`,
    `- 不要用 Markdown 的標題、粗體或項目符號。不要自己加免責聲明。`,
    ``,
    `只輸出 JSON，不要前言：{"title":"…","article":"…","gaps":["…"]}`,
  ].filter((l) => l !== "").join("\n");
}

function parseObject(raw: string): any {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* 往下找第一個物件 */ }
  const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { /* 解析不了 */ } }
  return null;
}

export function parseVoiceArticle(raw: string): VoiceArticle | null {
  const o = parseObject(raw);
  const article = String(o?.article ?? "").trim();
  if (article.length < 120) return null;
  return {
    title: clip(o?.title, 60),
    article,
    gaps: (Array.isArray(o?.gaps) ? o.gaps : []).map((g: unknown) => clip(g, 80)).filter(Boolean).slice(0, 3),
  };
}

// ─── 第二步：套流量密碼（只改包裝） ────────────────────────────────────

export function trafficRemixPrompt(args: { doctor: string; title: string; article: string; persona: InspirePersona }): string {
  const p = args.persona;
  return [
    agentFrame(p, args.doctor),
    ``,
    `這一次你不是想點子。下面是醫師本人已經定稿的文章，內容是他的專業，一個字的醫療意思都不能動。`,
    `你只做一件事：用你的招牌手法重新包裝它——標題、開場、段落順序、節奏與平台形式。`,
    ``,
    `【醫師的文章】`,
    `標題：${args.title}`,
    args.article,
    ``,
    `【包裝的界線】`,
    `- 文章裡的每一個醫療說法都要保留原意；可以刪掉次要的段落來符合長度，但不可以改結論、改條件、把「多數」「通常」改成「一定」。`,
    `- 不可以新增任何醫療說法、數字、統計、研究、案例或建議。你能加的只有：情境、畫面、道具、轉場、對白裡的生活語言。`,
    `- 醫師自己的比喻與口頭用語優先保留，那是他的東西。`,
    `- 開場可以大膽，但不能拿病情開玩笑、不能嚇人、不能做身材羞辱。`,
    ``,
    `【形式】${PLATFORM_SPEC[p.platform]}`,
    ``,
    `【一定要守的規則】\n${GROUND_RULES}`,
    `- 自稱用「我」；需要署名時用「${doctorByline(args.doctor)}」。`,
    `- 不要用 Markdown 的標題、粗體或項目符號；hashtag 前面的 # 照常要寫。不要自己加免責聲明，系統會補。`,
    ``,
    `只輸出 JSON，不要前言：{"move":"你用了哪一招，一句話，不要提到任何人名","draft":"…"}`,
  ].join("\n");
}

export function parseRemix(raw: string): { move: string; draft: string } | null {
  const o = parseObject(raw);
  const draft = String(o?.draft ?? "").trim();
  return draft.length >= 60 ? { move: clip(o?.move, 80), draft } : null;
}

const numbersIn = (s: string) => new Set((String(s ?? "").replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, "")));

/**
 * 包裝後多出來的數字（底稿與白名單都沒有的）。平台形式本身會帶數字（第 1 張、0–3 秒、15 秒），這些不算。
 * 模型說「我沒有加東西」不算數，數字是最容易驗的一種新增。
 */
export function addedNumbers(source: string, remix: string): string[] {
  const allowed = numbersIn(`${source}\n${factsBlock()}`);
  const body = String(remix ?? "")
    .replace(/第\s*\d+\s*[張段點招關天步]/g, "")
    .replace(/\d+\s*[–\-~到至]\s*\d+\s*秒/g, "").replace(/\d+\s*秒/g, "")
    .replace(/#\S+/g, "");
  const digits = Array.from(numbersIn(body)).filter((n) => !allowed.has(n));
  // 2026-10-10 實跑：包裝時多了一句「你說你瘦了五公斤」，底稿沒有這個數字，但國字數字沒被抓到。
  // 國字數字只看後面接度量單位的（公斤、公分、成、倍、歲、大卡、克），「兩件事」「一個禮拜」這種不算。
  const zh = (t: string) => String(t ?? "").match(/[一二兩三四五六七八九十百千半]+(?:點[一二三四五六七八九])?\s*(?:公斤|公分|公克|毫克|大卡|成|倍|歲|克)/g) ?? [];
  const src = `${source}
${factsBlock()}`;
  const words = Array.from(new Set(zh(body))).filter((w) => !src.includes(w));
  return [...digits, ...words];
}
