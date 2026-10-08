/**
 * campaignProposal — 「草擬提案」：從使用者已經改好的企劃，回頭寫出一份可以交出去的提案。
 *
 * 2026-10-08（CJ「目前用戶的習慣，其實不太看策略依據的詳細內容，也不知道改完以後要怎樣。
 * 它們的習慣，是直接進去改每一篇文章…當用戶調整完每一則貼文內容，甚至連左邊的標語還有右邊的
 * 每個階段的名稱…有一個按鈕，叫做 草擬提案，按下去，會根據他寫的內容，重新撰寫到背景、策略、
 * 目標族群等策略提案應有的，也包括到每一天要在哪個平台發哪些內容，連完整的內容都要寫進去」）。
 *
 * 方向跟原本的策略依據相反：策略依據是「先有策略、再排內容」，使用者不讀也不知道改了會怎樣。
 * 提案是「內容定了，回頭把策略寫出來」——標語、各階段的名稱與訊息、每一篇要講什麼與寫好的
 * 全文是定案的東西，舊的策略依據只當參考，兩邊不一致時以實際內容為準。
 *
 * 提案分兩半：
 *   · 策略段落（背景、目標、族群、洞察、策略、階段、通路）——模型寫，存在
 *     events.positioning.campaignProposal，使用者可以逐段改。
 *   · 排程與每一篇的全文——不經過模型，畫面直接從企劃與成品讀（campaign.proposalPosts）。
 *     模型重抄一次全文只會抄錯；而且使用者之後再改某一篇，提案後半段要跟著是新的。
 *
 * 最弱的地方是編造事實（Foundry 評測的結論），所以除了提示詞，還有一道確定性的檢查：
 * 模型寫出來的數字，資料裡找不到的就列出來給使用者看（unsourcedNumbers）。
 */
import localPool from "../../../localDb";
import { BASIS_FIELDS, basisValue } from "./campaignBasis";
import { CAMPAIGN_PHASE_IDS, PHASE_PURPOSE, eventFacts, safeJSON, type CampaignPhaseId, type CampaignPlan } from "./campaignPlan";
import { KPI_METRIC_ZH, PAID_CHANNELS } from "./campaignKpi";

/**
 * 提案的段落，順序就是提案的順序（2026-10-09 CJ「缺乏提案最後會有的結尾，主要是整體回顧…
 * 缺乏廣告預算分配的部分，這部分寫出來，讓用戶填。中間還缺乏一個 creative idea。還有缺少
 * 競爭者的分析」）。照得獎案例報告的故事線排：挑戰 → 洞察 → 概念 → 執行 → 成果 → 回顧。
 *
 *   kind "ai"   ＝模型寫。資料不夠就回空字串，畫面上是一格空的讓使用者自己寫
 *                 （CJ「不確定的空位，就請空著」）。
 *   kind "fill" ＝不經過模型的填空表：有設定的數字帶進來，沒有的留「＿＿」讓使用者填。
 *                 重新草擬時，使用者填過的不會被洗掉。
 *   tail        ＝排在「內容排程／每一篇全文」後面的段落（排程與全文不存在提案裡，畫面現讀）。
 *   needs       ＝要有那份資料才有這一段（沒選得獎案例的活動就沒有「借鏡」）。
 */
export const PROPOSAL_SECTIONS = [
  { id: "summary", kind: "ai", zh: "一頁摘要", en: "Executive summary", ask: "整份提案的五句話版本：挑戰、對象與洞察、概念、做法、要看的成果。最後才寫，只重述其他段落寫過的事。120–200 字。" },
  { id: "background", kind: "ai", zh: "背景與挑戰", en: "Background & challenge", ask: "為什麼現在做這檔活動：品牌與產品的現況、這檔活動的內容（機制、期間），最後一句點出這檔要解決的那一個問題。100–220 字。" },
  { id: "competitors", kind: "ai", zh: "競爭者分析", en: "Competitor analysis", ask: "只寫資料裡提到的競爭對手：他們怎麼說、我們這檔活動跟他們不一樣在哪。每個對手一行，開頭用「・」。資料裡沒有提到任何競爭對手，就給空字串，不要自己舉例。" },
  { id: "objective", kind: "ai", zh: "活動目標", en: "Objectives", ask: "這檔活動要達成什麼：商業目標、行銷目標、希望對方做的行為。有使用者填的目標就照寫；沒有數字就不要寫數字。60–160 字。" },
  { id: "audience", kind: "ai", zh: "目標族群與洞察", en: "Audience & insight", ask: "對誰說：從每一篇實際在跟誰說話推回來，這群人是誰、現在的處境；接著寫他們心裡的那個想法，以及這檔活動為什麼接得住。分兩段。140–280 字。" },
  { id: "reference", kind: "ai", needs: "cases", zh: "參考案例與借鏡", en: "Reference case", ask: "只用【參考的得獎案例】裡寫的內容：那個案例做了什麼、我們借了哪一點、哪裡不一樣。不要補獎項、年份、成效數字。沒有提供案例就給空字串。" },
  { id: "concept", kind: "ai", zh: "核心概念", en: "Core idea", ask: "標語（一句話訴求）原文照抄一次，接著寫為什麼是這一句：它回應了哪個洞察、跟競爭對手的說法差在哪。80–180 字。" },
  { id: "creative", kind: "ai", zh: "創意概念（Creative idea）", en: "Creative idea", ask: "這檔活動的創意點子：用什麼比喻、畫面或說故事的方式，把核心概念變成看得見的內容。從每一篇實際的寫法歸納，有舊策略依據的創意主題／核心比喻可以參考。120–240 字。" },
  { id: "strategy", kind: "ai", zh: "傳播策略", en: "Communication strategy", ask: "整檔怎麼從第一段推進到最後一段，每一段在整體裡扮演什麼角色。120–250 字。" },
  { id: "phases", kind: "ai", zh: "階段規劃", en: "Phases", ask: "每一段一小段：用使用者取的階段名稱，寫日期、這一段要做到什麼、要讓人記住的那句話、這一段的貼文各自在做什麼。段與段之間空一行。" },
  { id: "channels", kind: "ai", zh: "通路分工", en: "Channel roles", ask: "每個通路在這檔活動裡負責什麼、排了幾篇、為什麼這樣分。每個通路一行，開頭用「・」。" },
  { id: "budget", kind: "fill", tail: true, zh: "預算與 KPI", en: "Budget & KPIs" },
  { id: "adBudget", kind: "fill", tail: true, zh: "廣告預算分配", en: "Ad budget allocation" },
  { id: "recap", kind: "ai", tail: true, zh: "整體回顧", en: "Overall recap", ask: "提案的結尾：把整條線重講一次——要解決的挑戰、看到的洞察、提出的概念與創意、怎麼執行、預期看到什麼成果（只能寫使用者填過的目標；沒有就寫要觀察哪些指標，不寫數字）。每一項一行，開頭用「・」，最後一句收尾。只重述前面寫過的，不加新東西。" },
] as const satisfies ReadonlyArray<{ id: string; kind: "ai" | "fill"; zh: string; en: string; ask?: string; tail?: boolean; needs?: "cases" }>;
export type ProposalSectionId = (typeof PROPOSAL_SECTIONS)[number]["id"];

export interface ProposalSection { id: string; title: string; body: string }
export interface CampaignProposal {
  sections: ProposalSection[];
  generatedAt: string;
  /** 使用者改過才有。 */
  editedAt?: string | null;
  /** 草擬當下企劃的指紋——之後企劃改了，畫面提示可以重新草擬。 */
  planMark: string;
  /** 模型寫了、但資料裡找不到的數字（給使用者確認；改掉就會消失）。 */
  unsourced?: string[];
}

const PHASE_ZH: Record<CampaignPhaseId, string> = { teaser: "預熱", launch: "開賣", sustain: "加溫", lastcall: "倒數", encore: "返場" };
const CHANNEL_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", threads: "Threads", line: "LINE", tiktok: "TikTok", email: "電子報", website: "官網",
  kol: "網紅合作", cobrand: "異業合作",
};
const md = (s: string) => s.slice(5).replace("-", "/");

type PlanLike = Pick<CampaignPlan, "smp" | "items" | "phaseMessages" | "kpi"> & { phaseNames?: Partial<Record<CampaignPhaseId, string>> };

/** 階段的名稱：使用者取的優先。 */
export function phaseNameOf(plan: { phaseNames?: Partial<Record<CampaignPhaseId, string>> }, id: CampaignPhaseId): string {
  return plan.phaseNames?.[id]?.trim() || PHASE_ZH[id] || id;
}

/**
 * 成品（mission_outputs.content）→ 一段可以讀的文字。content 可能是版本陣列（取第一個版本）、
 * 帶 variants／publicVariants 的物件、或就是一段文字；多卡貼文把每張卡的標題與內文接起來。純函式。
 */
export function outputPlainText(content: unknown): string {
  const raw = typeof content === "string" ? content : content == null ? "" : JSON.stringify(content);
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch { /* 就是一段文字 */ }
  const list: any[] | null = Array.isArray(parsed) ? parsed
    : parsed && typeof parsed === "object"
      ? (Array.isArray(parsed.publicVariants) && parsed.publicVariants.length ? parsed.publicVariants
        : Array.isArray(parsed.variants) ? parsed.variants : null)
      : null;
  const v = list?.[0];
  let text = raw;
  if (v && typeof v === "object") {
    const cards = Array.isArray(v.cards) ? v.cards.map((c: any) => [c?.headline, c?.body].filter(Boolean).join("\n")).filter(Boolean).join("\n\n") : "";
    text = [typeof v.caption === "string" ? v.caption : "", cards].filter(Boolean).join("\n\n");
  } else if (typeof v === "string") text = v;
  else if (list) text = "";
  return text
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")
    .replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 企劃的指紋：標語、階段名稱與訊息、每一篇的日期／通路／要講什麼／寫了沒。純函式。 */
export function planMark(plan: PlanLike): string {
  const s = JSON.stringify([
    plan.smp ?? "",
    CAMPAIGN_PHASE_IDS.map((id) => [plan.phaseNames?.[id] ?? "", plan.phaseMessages?.[id] ?? ""]),
    plan.items.filter((i) => i.enabled).map((i) => [i.id, i.date, i.phase, i.platform, i.angle, i.outputId ?? 0])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const numbersIn = (text: string): string[] =>
  [...text.matchAll(/\d[\d,]*(?:\.\d+)?\s*[%％]?/g)].map((m) => m[0]!.replace(/[,\s]/g, "").replace("％", "%"));
/** 比對用：去掉整數前面的 0（10/08 與 10/8 是同一天）。 */
const numKey = (t: string) => t.replace(/^0+(?=\d)/, "");

/**
 * 模型寫出來、但資料裡找不到的數字。只看兩位數以上或帶百分比的（「三個階段」「2 個通路」這種
 * 個位數不看——誤報太多）。資料裡的數字不看單位，只要同一個數字出現過就算有出處。純函式。
 */
export function unsourcedNumbers(text: string, source: string): string[] {
  const known = new Set(numbersIn(source).flatMap((t) => [numKey(t), numKey(t.replace("%", ""))]));
  const out: string[] = [];
  for (const t of numbersIn(text)) {
    const digits = t.replace(/[^\d]/g, "");
    if (digits.length < 2 && !t.endsWith("%")) continue;
    if (known.has(numKey(t.replace("%", "")))) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

/** 填空的地方長這樣（使用者一看就知道要填）。 */
export const BLANK = "＿＿";

/**
 * 活動定位裡注入的得獎參考案例（creative.referenceCases 的每一列）。每一列的欄位照存的樣子
 * 接成一行——這裡不挑欄位，存了什麼就給什麼；沒有就回空陣列。純函式。
 */
export function referenceCaseLines(positioning: Record<string, any>): string[] {
  const rows = positioning?.creative?.referenceCases;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => (r && typeof r === "object"
    ? Object.values(r).filter((v) => typeof v === "string" || typeof v === "number").map((v) => String(v).replace(/\s+/g, " ").trim()).filter(Boolean).join("｜")
    : String(r ?? "").trim())).filter((l) => l.length >= 4).map((l) => `- ${l.slice(0, 500)}`).slice(0, 4);
}

const amount = (n: number | null | undefined) => (n ? `NT$${Number(n).toLocaleString("en-US")}` : `NT$${BLANK}`);

/**
 * 「預算與 KPI」填空表：使用者在 KPI 視窗填過的帶進來，沒有的留空格。不經過模型——
 * 模型在這一段最會編數字。純函式。
 */
export function budgetTemplate(plan: PlanLike): string {
  const k = plan.kpi;
  const phases = CAMPAIGN_PHASE_IDS.filter((id) => plan.items.some((i) => i.enabled && i.phase === id));
  const goals = (k?.goals ?? []).map((g) => `・${KPI_METRIC_ZH[g.metric] ?? g.metric}：${Number(g.target).toLocaleString("en-US")}`);
  return [
    `・總預算：${amount(k?.budget)}`,
    ...(goals.length ? goals : [`・主要 KPI：${BLANK}`, `・次要 KPI：${BLANK}`]),
    "",
    "各階段要看的指標",
    ...phases.map((id) => {
      const p = k?.phases?.[id];
      const metrics = (p?.metrics ?? []).map((m) => `${KPI_METRIC_ZH[m.metric] ?? m.metric}${m.target != null ? ` ${Number(m.target).toLocaleString("en-US")}` : ""}`).join("、");
      return `・${phaseNameOf(plan, id)}：${metrics || BLANK}`;
    }),
  ].join("\n");
}

/**
 * 「廣告預算分配」填空表：依通路、依階段、要下廣告的貼文各列好，金額留給使用者填。
 * KPI 視窗拆過各階段預算的話帶進來。純函式。
 */
export function adBudgetTemplate(plan: PlanLike): string {
  const k = plan.kpi;
  const items = plan.items.filter((i) => i.enabled).sort((a, b) => a.date.localeCompare(b.date));
  const phases = CAMPAIGN_PHASE_IDS.filter((id) => items.some((i) => i.phase === id));
  const paidChannels = [...new Set(items.map((i) => i.platform))].filter((c) => (PAID_CHANNELS as readonly string[]).includes(c));
  const paid = items.filter((i) => i.paid);
  return [
    `廣告總預算：${amount(k?.budget)}`,
    "",
    "依通路",
    ...(paidChannels.length
      ? paidChannels.map((c) => `・${CHANNEL_ZH[c] ?? c}：NT$${BLANK}（${BLANK}%）`)
      : [`・${BLANK}：NT$${BLANK}（${BLANK}%）`]),
    "",
    "依階段",
    ...phases.map((id) => {
      const p = k?.phases?.[id];
      return `・${phaseNameOf(plan, id)}：${amount(p?.budget)}（${p?.share != null ? p.share : BLANK}%）`;
    }),
    "",
    "要下廣告的貼文",
    ...(paid.length
      ? paid.map((i) => `・${md(i.date)} ${CHANNEL_ZH[i.platform] ?? i.platform}｜${i.angle.slice(0, 40)}：NT$${BLANK}`)
      : [`・（企劃上還沒有標記要下廣告的貼文——可以在那一篇的「⋯」裡標記，或直接寫在這裡）`]),
  ].join("\n");
}

export interface WrittenPost { title: string; text: string }

/** 寫好的那幾篇的全文（itemId → 標題＋文字）。只讀這個帳號自己的成品。 */
export async function loadWrittenPosts(plan: Pick<CampaignPlan, "items"> | null | undefined, userId: number): Promise<Record<string, WrittenPost>> {
  const byOutput = new Map<number, string>();
  for (const i of plan?.items ?? []) if (i.outputId) byOutput.set(Number(i.outputId), i.id);
  if (!byOutput.size) return {};
  const [rows]: any = await localPool.query(
    `SELECT mo.id, COALESCE(NULLIF(mo.title, ''), m.title) AS title, mo.content
       FROM mission_outputs mo JOIN missions m ON m.id = mo.missionId
      WHERE mo.id IN (?) AND m.userId = ?`,
    [[...byOutput.keys()].slice(0, 200), userId],
  );
  const out: Record<string, WrittenPost> = {};
  for (const r of rows as any[]) {
    const itemId = byOutput.get(Number(r.id));
    if (itemId) out[itemId] = { title: String(r.title ?? ""), text: outputPlainText(r.content) };
  }
  return out;
}

export interface ProposalFacts {
  eventName: string; brandName: string;
  startAt: string | null; endAt: string | null;
  mechanic: string; goal: string; type: string;
  products: string[];
  note: string;
}

const SYSTEM = `你是資深行銷企劃。有一檔活動已經排好、內容也改好了，你要回頭把它整理成一份可以交給客戶或主管的提案。使用者是先改好標語、各階段與每一篇貼文，才請你寫提案的——所以提案要從「實際排的內容」推回去，不是另外發想一套。

鐵則：
- 以【實際排的內容】為準：標語、各階段的名稱與訊息、每一篇要講什麼與寫好的全文，是使用者定案的東西。【舊的策略依據】只是參考，跟實際內容不一致時，照實際內容寫。
- 只寫資料裡有的事實。市場數據、成長率、調查結果、顧客見證、競品的名字與說法、得獎案例的細節、預算與 KPI 數字，資料沒給就不要寫；不要用「根據調查」「研究顯示」「數據指出」。
- 不確定的就空著：某一段的資料不夠寫，那個鍵就給空字串 ""，使用者會自己填。寧可空著，不要編，也不要寫「資料不足」這種說明。
- 預算、KPI、廣告預算分配不用你寫——系統會另外列成填空表讓使用者填。
- 日期、通路、篇數照資料寫，不要自己加一篇、挪日期或多一個通路。階段用使用者取的名稱。
- 給客戶看的提案語氣：直述句，不喊口號、不用驚嘆號、不堆形容詞，不要「我們將」「本提案旨在」這種開場。
- 不要用 Markdown 記號（#、**、表格）。要條列就每行開頭用「・」。
- 不要重抄每一篇貼文的全文——每天的排程與全文，系統會另外附在提案後面。
- 語言照品牌資料與貼文原本的語言寫；中文一律繁體。
- 只輸出一個 JSON 物件，不要任何說明文字。`;

/** 給模型的那一段。純函式，有測試。 */
export function proposalPrompt(args: {
  facts: ProposalFacts;
  plan: PlanLike;
  posts: Record<string, WrittenPost>;
  positioning: Record<string, any>;
}): string {
  const { facts, plan, posts } = args;
  const items = plan.items.filter((i) => i.enabled).sort((a, b) => a.date.localeCompare(b.date));
  // 全文一共給多少字：篇數多就每篇短一點（策略段落要的是「這一篇在做什麼」，不是逐字稿）。
  const written = items.filter((i) => posts[i.id]?.text);
  const each = Math.max(160, Math.min(700, Math.floor(14_000 / Math.max(1, written.length))));
  const phases = CAMPAIGN_PHASE_IDS.filter((id) => items.some((i) => i.phase === id));
  const phaseLines = phases.map((id) => {
    const list = items.filter((i) => i.phase === id);
    const from = list[0]!.date, to = list[list.length - 1]!.date;
    return `- ${phaseNameOf(plan, id)}｜${md(from)}${to !== from ? `–${md(to)}` : ""}（${from}${to !== from ? `～${to}` : ""}）｜${list.length} 篇｜這一段通常要做到：${PHASE_PURPOSE[id]}${plan.phaseMessages?.[id] ? `｜使用者寫的訊息：「${plan.phaseMessages[id]}」` : ""}`;
  });
  const postLines = items.map((i) => {
    const p = posts[i.id];
    const head = `- ${md(i.date)}（${i.date}）｜${phaseNameOf(plan, i.phase)}｜${CHANNEL_ZH[i.platform] ?? i.platform}｜${i.taskLabel}｜要講什麼：${i.angle}${i.paid ? "｜下廣告" : ""}${i.partner ? `｜給：${i.partner}` : ""}`;
    return p?.text ? `${head}\n  已寫好的全文：「${p.text.replace(/\s*\n\s*/g, " ／ ").slice(0, each)}」` : `${head}｜（還沒寫）`;
  });
  const channels = [...new Set(items.map((i) => i.platform))];
  const stats = [
    `共 ${items.length} 篇、${channels.length} 個通路、${phases.length} 個階段；已寫好 ${written.length} 篇`,
    channels.map((c) => `${CHANNEL_ZH[c] ?? c} ${items.filter((i) => i.platform === c).length} 篇`).join("、"),
  ].join("；");
  const basis = Object.entries(BASIS_FIELDS).map(([path, spec]) => {
    const v = basisValue(args.positioning, path);
    if (v == null) return "";
    return `- ${spec.label}：${(Array.isArray(v) ? v.join("／") : v).replace(/\s+/g, " ").slice(0, 260)}`;
  }).filter(Boolean);
  const k = plan.kpi;
  const cases = referenceCaseLines(args.positioning);
  const kpi = k && (k.budget || k.goals?.length)
    ? [k.budget ? `總預算 NT$${k.budget}` : "", ...(k.goals ?? []).map((g) => `${g.metric} 目標 ${g.target}`)].filter(Boolean).join("、")
    : "";

  return [
    `【品牌】${facts.brandName}`,
    `【活動】${facts.eventName}`,
    facts.startAt ? `【活動期間】${facts.startAt}${facts.endAt ? `～${facts.endAt}` : ""}` : "",
    facts.type ? `【活動類型】${facts.type}` : "",
    facts.mechanic.trim() ? `【優惠機制／活動內容】${facts.mechanic.trim().slice(0, 600)}` : "",
    facts.goal.trim() ? `【使用者填的目標】${facts.goal.trim().slice(0, 300)}` : "",
    kpi ? `【使用者填的預算與 KPI】${kpi}` : "",
    facts.products.length ? `【搭配產品】${facts.products.join("、")}` : "【搭配產品】純品牌活動（沒有指定產品）",
    facts.note ? `【建立活動時寫的重點】${facts.note}` : "",
    "",
    "═══ 實際排的內容（使用者定案的，以這裡為準） ═══",
    `【標語／一句話訴求】${plan.smp || "（還沒寫）"}`,
    `【階段】\n${phaseLines.join("\n")}`,
    `【每一篇】\n${postLines.join("\n")}`,
    `【統計】${stats}`,
    "",
    basis.length ? `═══ 舊的策略依據（只是參考；跟上面不一致時以上面為準） ═══\n${basis.join("\n")}` : "",
    "",
    cases.length ? `═══ 參考的得獎案例（「參考案例與借鏡」只能用這裡寫的） ═══\n${cases.join("\n")}` : "",
    "",
    "請寫出提案的策略段落。只輸出一個 JSON 物件，鍵名固定、值都是字串（同一段裡分段用 \\n\\n）：",
    `{${aiSections(cases.length > 0).map((s) => `"${s.id}":"${s.zh}——${s.ask}"`).join(",")}}`,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

/** 這一次要請模型寫的段落（沒有得獎案例就沒有「借鏡」）。 */
export function aiSections(hasCases: boolean) {
  return PROPOSAL_SECTIONS.filter((s) => s.kind === "ai" && (!("needs" in s) || hasCases)) as ReadonlyArray<{ id: string; zh: string; en: string; ask: string }>;
}

const tidyBody = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v.map(String).join("\n") : "")
  .replace(/\r/g, "").replace(/^\s*#{1,6}\s*/gm, "").replace(/\*\*/g, "").replace(/^\s*[-*]\s+/gm, "・")
  .replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);

/**
 * 模型回的東西＋填空表 → 提案的每一段，照固定順序。模型給空字串的那一段照樣留著（空的，
 * 使用者自己填）。讀不出來、或有寫的段落太少就回 null。
 * prev＝上一份提案：填空表使用者填過的沿用，不被新的空白表洗掉。純函式。
 */
export function cleanProposalSections(text: string, en: boolean, opts: { plan?: PlanLike; hasCases?: boolean; prev?: ProposalSection[] } = {}): ProposalSection[] | null {
  const parsed = safeJSON<any>(text, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const prev = new Map((opts.prev ?? []).map((s) => [s.id, s]));
  const sections: ProposalSection[] = [];
  for (const s of PROPOSAL_SECTIONS) {
    if ("needs" in s && !opts.hasCases) continue;
    const title = en ? s.en : s.zh;
    if (s.kind === "fill") {
      const kept = prev.get(s.id)?.body?.trim();
      const fresh = opts.plan ? (s.id === "budget" ? budgetTemplate(opts.plan) : adBudgetTemplate(opts.plan)) : "";
      sections.push({ id: s.id, title, body: kept || fresh });
    } else {
      sections.push({ id: s.id, title, body: tidyBody(parsed[s.id]) });
    }
  }
  const written = sections.filter((s) => PROPOSAL_SECTIONS.some((d) => d.id === s.id && d.kind === "ai") && s.body.length >= 20);
  if (written.length < 4) return null;
  return sections;
}

/** 使用者存檔送來的段落：只留認得的 id、照固定順序、整理長度。純函式。 */
export function cleanSavedSections(input: Array<{ id: string; title: string; body: string }>, prev: ProposalSection[]): ProposalSection[] {
  const byId = new Map(input.map((s) => [s.id, s]));
  return prev.map((p) => {
    const s = byId.get(p.id);
    if (!s) return p;
    return { id: p.id, title: s.title.replace(/\s+/g, " ").trim().slice(0, 40) || p.title, body: s.body.replace(/\r/g, "").trim().slice(0, 6000) };
  });
}

/** 草擬一份提案（問模型一次）。失敗就丟，不存半成品——原本那一份還在。 */
export async function draftCampaignProposal(args: {
  eventId: number; userId: number;
  plan: PlanLike; positioning: Record<string, any>;
  lang: "zh" | "en";
  /** 上一份提案（有的話）：填空表裡使用者填過的沿用。 */
  prev?: ProposalSection[];
}): Promise<CampaignProposal> {
  const facts = await eventFacts(args.eventId, args.userId);
  if (!facts) throw new Error("找不到這個活動");
  const posts = await loadWrittenPosts(args.plan, args.userId);
  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const user = proposalPrompt({
    facts: {
      eventName: facts.name, brandName: facts.brandName, startAt: ymd(facts.startAt), endAt: ymd(facts.endAt),
      mechanic: String(facts.settings.mechanic ?? ""), goal: String(facts.settings.goal ?? ""), type: String(facts.settings.type ?? ""),
      products: facts.products.map((p: any) => String(p.name ?? "")).filter(Boolean),
      note: typeof args.positioning?.note === "string" ? args.positioning.note.trim().slice(0, 800) : "",
    },
    plan: args.plan, posts, positioning: args.positioning,
  });
  const { buildBrandPrefix } = await import("../../../strategy/core/brand/brandContext");
  const brain = await buildBrandPrefix(facts.brandId, null, args.eventId, "full").catch(() => "");
  const { invokeLLM } = await import("../../../platform/core/llm/llm.js");
  const r = await invokeLLM({
    messages: [
      { role: "system", content: brain ? `${SYSTEM}\n\n# 品牌大腦（背景與族群可以引用這裡寫的事實）${brain}` : SYSTEM },
      { role: "user", content: user },
    ],
    maxTokens: 7000,
  });
  const text = String(r.choices?.[0]?.message?.content ?? "");
  const hasCases = referenceCaseLines(args.positioning).length > 0;
  const sections = cleanProposalSections(text, args.lang === "en", { plan: args.plan, hasCases, prev: args.prev });
  if (!sections) throw new Error("這一次沒有寫成（模型的回覆讀不出完整的提案），請再按一次");
  // 填空表的數字是從設定帶進來的，不用查；只查模型寫的那幾段。
  const aiIds = new Set(aiSections(true).map((s) => s.id));
  const unsourced = unsourcedNumbers(sections.filter((s) => aiIds.has(s.id)).map((s) => s.body).join("\n"), `${user}\n${brain}`);
  return {
    sections, generatedAt: new Date().toISOString(), editedAt: null,
    planMark: planMark(args.plan),
    ...(unsourced.length ? { unsourced } : {}),
  };
}
