/**
 * campaignPlan — 從「活動設定」產出一份**可以直接開工的宣傳企劃**。
 *
 * 2026-09-25（CJ「大多數的活動，指的都是商品的促銷、優惠、或是搭售。或是有實體
 * 活動要宣傳…客戶的需求，都是希望有活動後，該活動該如何宣傳的企劃，然後，就可以
 * 針對活動，有宣傳企劃和開始撰寫內容，也包括網紅合作，異業合作等等」）。
 *
 * ── 設計上最要緊的一條 ───────────────────────────────────────────────
 * 企劃上的每一格都必須指向**真實存在的任務卡**。讓模型自由發明「任務名稱」很容易
 * 寫出一份讀起來很漂亮、但一格都按不下去的企劃——那就退回成另一份文件，而文件
 * 正是這次要取代的東西。所以：
 *
 *   1. 候選卡片是我們**給**模型的（buildTaskCatalogIndex 過濾出使用者選的通路），
 *      不是讓它自己想。
 *   2. 回來的 taskId 一律對照候選清單驗證。
 *   3. 對不到就**確定性修補**——換成那個通路的預設卡，不丟掉那一格，也不假裝成功。
 *
 * （這是 memory 裡「合約接在 prompt 最後 + 驗證重試 + 確定性修補」那套，用在
 * 企劃上。）
 *
 * ── 日期不靠模型算 ──────────────────────────────────────────────────
 * 檔期節奏（預熱／開賣／加溫／倒數／返場）與每一格的日期是**純函式**算出來的
 * （planBeats），模型只負責「這一格用哪張卡、要講什麼」。日期算錯是使用者一眼
 * 看得出來的錯，而且那種錯不該靠重跑模型來修。
 */
import localPool from "../../localDb.js";
import { buildTaskCatalogIndex, type CatalogTask } from "../../content/core/taskCatalogIndex.js";

// ── 語彙（與 client/src/v2/strategy/lib/campaignSchema.ts 同一份）───────────
// server 不能 import client 的檔案，所以這裡自己宣告一份，由
// campaignPlanVocab.test.ts（server 側的跨邊界測試）比對兩邊不會漂移。
export const CAMPAIGN_TYPE_IDS = [
  "promo_discount", "bundle", "new_launch", "seasonal", "offline", "member",
] as const;
export type CampaignTypeId = (typeof CAMPAIGN_TYPE_IDS)[number];

export const CAMPAIGN_PHASE_IDS = ["teaser", "launch", "sustain", "lastcall", "encore"] as const;
export type CampaignPhaseId = (typeof CAMPAIGN_PHASE_IDS)[number];

const PHASE_PURPOSE: Record<CampaignPhaseId, string> = {
  teaser:   "還不講折數，先把「為什麼現在該注意」說出來，累積想買的人",
  launch:   "機制一次講清楚：買什麼、優惠是什麼、到什麼時候、去哪買",
  sustain:  "換角度再說一次——使用情境、顧客回饋、比較與選購建議",
  lastcall: "把期限變成理由，給還在猶豫的人最後一次推力",
  encore:   "結束公告或加碼延長；沒買到的人要知道下一次是什麼時候",
};

export interface CampaignSettings {
  type: CampaignTypeId | "";
  mechanic: string;
  goal?: string;
  channels: string[];
  venue?: string;
  sessions?: string;
  signupUrl?: string;
  partners?: { kol?: boolean; cobrand?: boolean };
}

export interface Beat {
  phase: CampaignPhaseId;
  /** YYYY-MM-DD */
  date: string;
}

export interface PlanItem extends Beat {
  id: string;
  platform: string;
  taskId: string;
  taskLabel: string;
  angle: string;
  enabled: boolean;
  outputId?: number | null;
  scheduledAt?: string | null;
  /** 這一格的卡是模型選的，還是驗證失敗後我們補上的——使用者有權知道。 */
  repaired?: boolean;
}

export interface PartnerStep { id: string; text: string; taskId?: string; taskLabel?: string; done?: boolean }
export interface PartnerBlock { summary: string; steps: PartnerStep[] }

export interface CampaignPlan {
  smp: string;
  items: PlanItem[];
  kol?: PartnerBlock | null;
  cobrand?: PartnerBlock | null;
  generatedAt: string;
}

const DAY = 86_400_000;
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const shift = (d: Date, days: number): Date => new Date(d.getTime() + days * DAY);

/**
 * 檔期節奏 → 每一格的日期。純函式，看得懂也測得動。
 *
 * 規則刻意保守：短檔期不硬塞五個階段（三天的快閃塞不下「中段加溫」），過去的
 * 日期不排預熱（活動已經開始了才叫人期待很奇怪）。
 */
export function planBeats(args: {
  startAt: Date | null;
  endAt: Date | null;
  today?: Date;
}): Beat[] {
  const today = args.today ? new Date(ymd(args.today)) : new Date(ymd(new Date()));
  const start = args.startAt ? new Date(ymd(args.startAt)) : shift(today, 3);
  const end = args.endAt ? new Date(ymd(args.endAt)) : shift(start, 13);
  const span = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY) + 1);
  const beats: Beat[] = [];

  // 預熱：只有在開賣日還沒到、而且還來得及的時候才排。
  const leadDays = Math.round((start.getTime() - today.getTime()) / DAY);
  if (leadDays >= 5) beats.push({ phase: "teaser", date: ymd(shift(start, -5)) });
  if (leadDays >= 2) beats.push({ phase: "teaser", date: ymd(shift(start, -2)) });

  beats.push({ phase: "launch", date: ymd(start) });
  if (span >= 4) beats.push({ phase: "launch", date: ymd(shift(start, 1)) });

  // 中段加溫：檔期夠長才有中段可言，最多三篇、彼此至少隔兩天。
  if (span >= 6) {
    const innerStart = 2;
    const innerEnd = span - 3;               // 留最後兩天給倒數
    const slots = Math.min(3, Math.max(1, Math.floor((innerEnd - innerStart) / 2)));
    for (let i = 0; i < slots; i++) {
      const offset = innerStart + Math.round(((innerEnd - innerStart) * i) / Math.max(1, slots - 1 || 1));
      beats.push({ phase: "sustain", date: ymd(shift(start, Math.min(offset, innerEnd))) });
    }
  }

  if (span >= 3) beats.push({ phase: "lastcall", date: ymd(shift(end, -1)) });
  beats.push({ phase: "lastcall", date: ymd(end) });
  beats.push({ phase: "encore", date: ymd(shift(end, 1)) });

  // 同一天同一階段重複的去掉（短檔期算出來會撞在一起）
  const seen = new Set<string>();
  return beats.filter((b) => {
    const key = `${b.phase}:${b.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 這個通路可以用的卡（30s／60s；99s 是整包企劃級，不排進日更節奏）。 */
export function candidateCards(channels: string[]): CatalogTask[] {
  const wanted = new Set(channels.map((c) => c.toLowerCase()));
  return buildTaskCatalogIndex().filter(
    (t) => wanted.has(t.platform) && (t.tier === "30s" || t.tier === "60s"),
  );
}

/** 驗證失敗時的確定性修補：這個通路的第一張 30s 卡。 */
function defaultCardFor(platform: string, cards: CatalogTask[]): CatalogTask | null {
  return cards.find((c) => c.platform === platform && c.tier === "30s")
    ?? cards.find((c) => c.platform === platform)
    ?? null;
}

/**
 * 模型回來的東西 → 可用的企劃格。
 * 匯出給測試：這支是「企劃會不會按不下去」的唯一守門員。
 */
export function reconcileItems(args: {
  beats: Beat[];
  raw: any;
  cards: CatalogTask[];
  channels: string[];
}): PlanItem[] {
  const byId = new Map(args.cards.map((c) => [c.id, c]));
  const rawItems: any[] = Array.isArray(args.raw?.items) ? args.raw.items : [];
  const out: PlanItem[] = [];

  args.beats.forEach((beat, idx) => {
    const r = rawItems.find((x) => Number(x?.beat) === idx) ?? rawItems[idx] ?? {};
    const wantedId = typeof r?.taskId === "string" ? r.taskId.trim() : "";
    let card = byId.get(wantedId) ?? null;
    let repaired = false;
    if (!card) {
      // 模型挑了不存在的卡（或根本沒挑）——換成這個通路的預設卡，不丟掉這一格。
      const platform = typeof r?.platform === "string" && args.channels.includes(r.platform)
        ? r.platform
        : args.channels[idx % Math.max(1, args.channels.length)] ?? args.channels[0]!;
      card = defaultCardFor(platform, args.cards);
      repaired = true;
    }
    if (!card) return;   // 這個通路一張卡都沒有：寧可少一格，也不要放一個按不下去的
    const angle = typeof r?.angle === "string" ? r.angle.trim().slice(0, 200) : "";
    out.push({
      id: `${beat.phase}-${beat.date}-${idx}`,
      phase: beat.phase,
      date: beat.date,
      platform: card.platform,
      taskId: card.id,
      taskLabel: card.labelZh || card.labelEn || card.id,
      angle: angle || PHASE_PURPOSE[beat.phase],
      enabled: true,
      outputId: null,
      scheduledAt: null,
      ...(repaired ? { repaired: true } : {}),
    });
  });

  return out;
}

/** 網紅合作：站上已經有真的卡，直接接上去（「我們提供說法，不提供名單」）。 */
export function kolBlock(mechanic: string, cards: CatalogTask[]): PartnerBlock {
  const find = (id: string) => cards.find((c) => c.id === id) ?? null;
  const all = buildTaskCatalogIndex();
  const pick = (id: string) => find(id) ?? all.find((c) => c.id === id) ?? null;
  const steps: PartnerStep[] = [];
  const add = (text: string, id: string) => {
    const c = pick(id);
    steps.push({ id, text, ...(c ? { taskId: c.id, taskLabel: c.labelZh || c.labelEn } : {}), done: false });
  };
  add("先把這次要找誰、給什麼、怎麼分層講清楚（一次產出整包話術）", "kl-99-campaign-toolkit");
  add("寫邀約開場訊息——第一句決定對方要不要回", "kl-30-invite-opener");
  add("給合作方的 brief：這檔活動要他說什麼、不能說什麼", "kl-30-influencer-brief");
  add("回覆與追蹤：報價、檔期、交稿前的確認", "kl-30-followup");
  return {
    summary: `這檔活動的網紅合作以「${mechanic.slice(0, 40)}」為核心訊息，分層邀請、統一話術，名單由你決定。`,
    steps,
  };
}

/** 異業合作：目前沒有對應的任務卡，所以只給步驟，不假裝有卡可以按。 */
export function cobrandBlock(mechanic: string, brandName: string): PartnerBlock {
  return {
    summary: `異業合作的目的是借對方的客群：找受眾重疊、但不搶生意的品牌，用「${mechanic.slice(0, 40)}」當共同理由。`,
    steps: [
      { id: "cb-1", text: `列出 5–8 個受眾重疊、品類不衝突的品牌（想像同一個人會同時買 ${brandName} 和誰）`, done: false },
      { id: "cb-2", text: "決定合作形式：互相曝光／聯名組合／交換名單／共同贈品", done: false },
      { id: "cb-3", text: "寫提案信：先講你能帶給對方什麼，再講你想要什麼", done: false },
      { id: "cb-4", text: "講好分工與分潤：誰出素材、誰出折扣、導流怎麼算", done: false },
      { id: "cb-5", text: "對外說法要一致：雙方各自的貼文都從同一句核心訊息長出來", done: false },
    ],
  };
}

function safeJSON<T>(text: string, fallback: T): T {
  const tryParse = (s: string): T | undefined => { try { return JSON.parse(s); } catch { return undefined; } };
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (m ? m[1]! : text).trim();
  const direct = tryParse(raw);
  if (direct !== undefined) return direct;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = tryParse(raw.slice(start, end + 1));
    if (sliced !== undefined) return sliced;
  }
  return fallback;
}

/** 活動 + 它綁的產品，組成產生企劃需要的事實。 */
async function eventFacts(eventId: number, userId: number): Promise<{
  name: string; brandId: number; brandName: string; startAt: Date | null; endAt: Date | null;
  settings: CampaignSettings; products: Array<{ id: number; name: string; facts: string }>;
} | null> {
  const [rows]: any = await localPool.execute(
    `SELECT e.id, e.name, e.brandId, e.startAt, e.endAt, e.positioning, b.name AS brandName
       FROM events e LEFT JOIN brands b ON b.id = e.brandId
      WHERE e.id = ? AND e.userId = ? LIMIT 1`,
    [eventId, userId],
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  const pos = typeof row.positioning === "string"
    ? (() => { try { return JSON.parse(row.positioning); } catch { return {}; } })()
    : (row.positioning ?? {});
  const settings: CampaignSettings = { type: "", mechanic: "", channels: [], ...(pos?.campaign ?? {}) };

  const [prodRows]: any = await localPool.execute(
    `SELECT p.id, p.name, p.positioning
       FROM event_products ep JOIN products p ON p.id = ep.productId
      WHERE ep.eventId = ? LIMIT 20`,
    [eventId],
  );
  const products = (prodRows as any[]).map((p) => {
    const pp = typeof p.positioning === "string"
      ? (() => { try { return JSON.parse(p.positioning); } catch { return {}; } })()
      : (p.positioning ?? {});
    const first = (paths: string[]): string => {
      for (const path of paths) {
        const v = path.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), pp);
        if (typeof v === "string" && v.trim()) return v.trim();
      }
      return "";
    };
    // 路徑順序跟 client/.../lib/productFacts.ts 同一份
    const facts = [
      first(["facts.price", "price", "core.price"]) && `售價 ${first(["facts.price", "price", "core.price"])}`,
      first(["facts.weight", "weight"]) && `重量 ${first(["facts.weight", "weight"])}`,
      first(["facts.servings", "servings"]) && `${first(["facts.servings", "servings"])}`,
      first(["core.zhTagline"]) && `標語「${first(["core.zhTagline"])}」`,
      first(["competition.uniqueUsp"]) && `賣點：${first(["competition.uniqueUsp"]).slice(0, 80)}`,
    ].filter(Boolean).join("｜");
    return { id: Number(p.id), name: String(p.name), facts };
  });

  return {
    name: String(row.name), brandId: Number(row.brandId), brandName: String(row.brandName ?? ""),
    startAt: row.startAt ? new Date(row.startAt) : null,
    endAt: row.endAt ? new Date(row.endAt) : null,
    settings, products,
  };
}

const SYSTEM = `你是負責「檔期宣傳」的資深行銷企劃。使用者已經決定好活動與優惠機制，你要做的是把它排成一份可以馬上開工的宣傳企劃。

鐵則：
- **只能從候選任務卡裡挑**，taskId 必須逐字抄自清單。不准自己發明任務名稱或 id。
- 每一格的「要講什麼」是一句話的內容方向（20–45 字），要具體到寫的人不必再想——
  講這一篇的切角與要強調的事實，不是「宣傳活動」這種空話。
- 優惠機制、售價、期限、份量這些數字，只能用使用者提供的，不准自己編。
- 同一個切角不要重複用；預熱階段不要把折數講完（那是開賣那一格的工作）。
- 只輸出 JSON，不要任何說明文字。`;

/**
 * 產生一份企劃。
 *
 * 失敗就丟，不回半成品——「產不出來」跟「產出一份空企劃」在畫面上長得一樣，
 * 但後者會讓使用者以為系統覺得他的活動沒什麼好寫的。
 */
export async function buildCampaignPlan(args: {
  eventId: number;
  userId: number;
  today?: Date;
}): Promise<CampaignPlan> {
  const facts = await eventFacts(args.eventId, args.userId);
  if (!facts) throw new Error("找不到這個活動");
  const s = facts.settings;
  if (!s.type || !s.mechanic?.trim() || !s.channels?.length) {
    throw new Error("活動設定還沒填完（需要活動類型、優惠機制、要發的通路）");
  }

  const beats = planBeats({ startAt: facts.startAt, endAt: facts.endAt, today: args.today });
  const cards = candidateCards(s.channels);
  if (cards.length === 0) throw new Error("你選的通路目前沒有可用的任務卡，換一個通路再試");

  const cardMenu = cards
    .map((c) => `- ${c.id}｜${c.platform}｜${c.labelZh || c.labelEn}`)
    .join("\n");

  const beatList = beats
    .map((b, i) => `${i}. ${b.date}｜${b.phase}（${PHASE_PURPOSE[b.phase]}）`)
    .join("\n");

  const productBlock = facts.products.length
    ? facts.products.map((p) => `- ${p.name}${p.facts ? `：${p.facts}` : ""}`).join("\n")
    : "（這檔活動沒有綁定特定產品）";

  const user = [
    `【品牌】${facts.brandName}`,
    `【活動】${facts.name}`,
    `【活動類型】${s.type}`,
    `【優惠機制／活動內容】${s.mechanic}`,
    s.goal ? `【想達成】${s.goal}` : "",
    s.venue ? `【地點】${s.venue}` : "",
    s.sessions ? `【場次】${s.sessions}` : "",
    s.signupUrl ? `【報名連結】${s.signupUrl}` : "",
    `【適用產品】\n${productBlock}`,
    `【要排的檔期格子】\n${beatList}`,
    `【候選任務卡（只能從這裡挑）】\n${cardMenu}`,
    "",
    "請為每一格挑一張卡並寫出這一篇要講什麼。只輸出 JSON，鍵名固定如下：",
    `{"smp":"這檔活動的一句話訴求（25字內）","items":[{"beat":0,"platform":"facebook","taskId":"逐字抄自候選清單","angle":"這一篇要講什麼（20-45字）"}]}`,
    `items 必須剛好 ${beats.length} 筆，beat 從 0 到 ${beats.length - 1} 各一次。`,
  ].filter(Boolean).join("\n");

  const { invokeLLM } = await import("../../platform/core/llm.js");
  const r = await invokeLLM({
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
    maxTokens: 2500,
  });
  const text = String(r.choices?.[0]?.message?.content ?? "");
  const parsed = safeJSON<any>(text, null);
  if (!parsed) throw new Error(`企劃產生失敗：模型的輸出讀不成 JSON（${text.slice(0, 160)}）`);

  const items = reconcileItems({ beats, raw: parsed, cards, channels: s.channels });
  if (items.length === 0) throw new Error("企劃產生失敗：一格都排不出來");

  const smp = typeof parsed?.smp === "string" ? parsed.smp.trim().slice(0, 60) : "";

  return {
    smp: smp || facts.name,
    items,
    kol: s.partners?.kol ? kolBlock(s.mechanic, cards) : null,
    cobrand: s.partners?.cobrand ? cobrandBlock(s.mechanic, facts.brandName || "這個品牌") : null,
    generatedAt: new Date().toISOString(),
  };
}
