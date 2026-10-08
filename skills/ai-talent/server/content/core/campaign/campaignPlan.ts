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
import localPool from "../../../localDb.js";
import { buildTaskCatalogIndex, type CatalogTask } from "../catalog/taskCatalogIndex.js";
import { influencerLabel, cleanKolBrief, type KolInfluencer, type KolBrief } from "./campaignKolBrief.js";
import { cleanChannelBriefs, channelBriefText, briefPartners, isBriefChannel, type BriefChannel, type ChannelBrief } from "./campaignChannelBrief.js";
import { isHiddenContentPlatform } from "../../../platform/core/billing/planGate.js";
import {
  loadEventProducts, productScopeBrief, resolveProductScope,
  type ProductScope, type ScopedProduct,
} from "../../../strategy/core/entities/eventProductScope.js";

// ── 語彙（與 client/src/v2/strategy/lib/campaign/campaignSchema.ts 同一份）───────────
// server 不能 import client 的檔案，所以這裡自己宣告一份，由
// campaignPlanVocab.test.ts（server 側的跨邊界測試）比對兩邊不會漂移。
export const CAMPAIGN_TYPE_IDS = [
  "promo_discount", "bundle", "new_launch", "seasonal", "offline", "member",
] as const;
export type CampaignTypeId = (typeof CAMPAIGN_TYPE_IDS)[number];

export const CAMPAIGN_PHASE_IDS = ["teaser", "launch", "sustain", "lastcall", "encore"] as const;
export type CampaignPhaseId = (typeof CAMPAIGN_PHASE_IDS)[number];

export const PHASE_PURPOSE: Record<CampaignPhaseId, string> = {
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
  /** 搭配產品／純品牌。沒有這個 key＝還沒選（見 eventProductScope.ts）。 */
  productScope?: ProductScope;
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
  /** 內容層可以把某一篇拿出本週企劃（false）；沒有這個欄位＝定稿後照日期進本週企劃。 */
  inPlanner?: boolean;
  /** 這一篇要下廣告（投放專家提議、用戶可改）；只有 PAID_CHANNELS 的通路能下。 */
  paid?: boolean;
  /** 合作類的線：這一件是給誰（網紅任務說明單裡的那一位／那一類）。 */
  partner?: string;
  /** 發出去之後的貼文連結（campaign.markPublished；2026-10-02）。 */
  publishedUrl?: string | null;
}

export interface PartnerStep { id: string; text: string; taskId?: string; taskLabel?: string; done?: boolean }
export interface PartnerBlock { summary: string; steps: PartnerStep[] }

export interface CampaignPlan {
  smp: string;
  items: PlanItem[];
  /**
   * 每一段要讓人記住的一句話（2026-09-30 CJ 的策略地圖：總覽時每段上方寫這一段
   * 的訊息，放大到某一段時是那一段的主軸）。舊企劃沒有這個欄位，畫面就不顯示。
   */
  phaseMessages?: Partial<Record<CampaignPhaseId, string>>;
  kol?: PartnerBlock | null;
  cobrand?: PartnerBlock | null;
  generatedAt: string;
  /** 定稿時間。定稿＝整份（設定＋企劃）鎖住，要改先解鎖；內容層只寫定稿過的東西。 */
  lockedAt?: string | null;
  /** KPI、預算與每一段的分配（見 campaignKpi.ts）。 */
  kpi?: import("./campaignKpi").CampaignKpi | null;
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

/**
 * 零件卡：產出是「一篇貼文的一部分」，不是可以直接發出去的東西。
 *
 * 2026-09-26（CJ「剛剛生出來的文案，顯示得很奇怪」的根源，以及「現在的顯示方式
 * 很複雜」的一部分）：企劃是一張**發布時間表**，每一行代表「這天要發這個」。
 * 把「FB 廣告 CTA 5 種」「IG 主題標籤 30 個」這種素材零件排進去，使用者得自己
 * 判斷哪幾行不是貼文——而且那幾行的產出放進貼文版型時一定長得很怪。
 *
 * 這些卡沒有消失，它們在任務庫裡照樣可以用；需要時也可以從企劃某一行的「⋯」
 * 叫出來當那一篇的附屬素材。這裡只是不讓它們自己佔一行。
 */
const PART_CARD_PATTERNS: RegExp[] = [
  /ad-(headline|primary|cta|description)$/,   // 廣告欄位：標題／主文／CTA／說明
  /pure-text-hook|reel-hook/,                  // 開場鉤子（搭配你自己的原文用）
  /hashtag-set/,                               // 標籤組
  /comment-reply|comment-signal/,              // 留言回覆：反應型，不是排得出日期的
  /bio-rewrite|profile-self-insert|highlight-suite/, // 個人檔案，不屬於檔期
  /dm-script/,
  /repost-strategy/,                           // 策略建議，不是一篇內容
];

export function isPartCard(taskId: string): boolean {
  return PART_CARD_PATTERNS.some((re) => re.test(taskId));
}

/**
 * 這個通路可以用的卡：30s／60s（99s 是整包企劃級，不排進日更節奏），
 * 而且必須是「整篇可以發的」。
 */
export function candidateCards(channels: string[]): CatalogTask[] {
  const wanted = new Set(channels.map((c) => c.toLowerCase()));
  return buildTaskCatalogIndex().filter(
    (t) => wanted.has(t.platform) && !isHiddenContentPlatform(t.platform) && (t.tier === "30s" || t.tier === "60s") && !isPartCard(t.id),
  );
}

/**
 * 活動企劃用的卡：只有單篇。
 *
 * 2026-10-08（CJ「活動企劃當中的任務卡，都只要是單篇貼文的，不需要四篇貼文的活動
 * 組合。因為，我們都設定好是哪一天要發甚麼文章了」）：活動企劃的每一格已經是
 * 「這一天發這一篇」，再排一張「活動上線包（4 篇）」「5 天倒數系列」進去，等於在
 * 一格裡面又塞了一份時間表。本週企劃／靈感舞台仍走 candidateCards，不受影響。
 */
export function campaignCards(channels: string[]): CatalogTask[] {
  return candidateCards(channels).filter((c) => c.tier === "30s");
}

/** 驗證失敗時的確定性修補：這個通路的第一張 30s 卡。 */
function defaultCardFor(platform: string, cards: CatalogTask[]): CatalogTask | null {
  return cards.find((c) => c.platform === platform && c.tier === "30s")
    ?? cards.find((c) => c.platform === platform)
    ?? null;
}

/**
 * 舊企劃裡還沒寫的格子若排的是套組／企劃級的卡，換成那個通路的單篇預設卡。
 * 已經寫好的（有 outputId）不動——那篇產出是照原本的卡寫的。不在目錄裡的卡
 * （品牌自建卡、任務包）也不動，這裡只認得出目錄卡的層級。
 */
export function toSingleCardItems(items: PlanItem[], catalog: CatalogTask[] = buildTaskCatalogIndex()): PlanItem[] {
  const tierOf = new Map(catalog.map((c) => [c.id, c.tier]));
  const singles = catalog.filter((c) => c.tier === "30s" && !isPartCard(c.id));
  return items.map((i) => {
    const tier = tierOf.get(i.taskId);
    if (i.outputId || !tier || tier === "30s") return i;
    const card = defaultCardFor(i.platform, singles);
    if (!card) return i;
    return { ...i, taskId: card.id, taskLabel: card.labelZh || card.labelEn || card.id, repaired: true };
  });
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

/**
 * 模型回來的「每一段的訊息」→ 只收這份企劃真的有的階段，其他丟掉。
 * 沒寫的段就留空——不拿階段目的去冒充訊息，畫面上空著比講錯好。
 */
export function reconcilePhaseMessages(raw: any, beats: Beat[]): Partial<Record<CampaignPhaseId, string>> {
  const present = new Set(beats.map((b) => b.phase));
  const out: Partial<Record<CampaignPhaseId, string>> = {};
  const list: any[] = Array.isArray(raw?.phases) ? raw.phases : [];
  for (const p of list) {
    const id = typeof p?.phase === "string" ? p.phase.trim() : "";
    const msg = typeof p?.message === "string" ? p.message.trim().slice(0, 60) : "";
    if (!msg || !(CAMPAIGN_PHASE_IDS as readonly string[]).includes(id)) continue;
    if (!present.has(id as CampaignPhaseId) || out[id as CampaignPhaseId]) continue;
    out[id as CampaignPhaseId] = msg;
  }
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

export function safeJSON<T>(text: string, fallback: T): T {
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
export async function eventFacts(eventId: number, userId: number): Promise<{
  name: string; brandId: number; brandName: string; startAt: Date | null; endAt: Date | null;
  settings: CampaignSettings; products: ScopedProduct[];
  /** 網紅任務說明單（campaignKolBrief.ts）。 */
  kolBrief: KolBrief;
  /** 其他通路的任務說明單（campaignChannelBrief.ts）。 */
  channelBriefs: Partial<Record<BriefChannel, ChannelBrief>>;
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

  const products = await loadEventProducts(eventId);

  return {
    name: String(row.name), brandId: Number(row.brandId), brandName: String(row.brandName ?? ""),
    startAt: row.startAt ? new Date(row.startAt) : null,
    endAt: row.endAt ? new Date(row.endAt) : null,
    settings, products,
    kolBrief: cleanKolBrief(pos?.kolBrief),
    channelBriefs: cleanChannelBriefs(pos?.channelBriefs),
  };
}

/** 可以排進企劃的通路——推斷結果只能落在這裡面。 */
// 2026-09-29 CJ：拿掉 LinkedIn／YouTube／新聞稿／X（planGate.HIDDEN_CONTENT_PLATFORMS）；
// Threads 與 LINE CJ 要留。
// 2026-10-01 CJ「網紅合作跟 instagram 相同功能，也是可以新增的管道，目前按進去，只有說明，
// 這樣不夠，他要被納入行銷計畫」：加 kol。kol 這條線排的是「要做的事」（邀約、brief、
// 追蹤、素材包、接住自然提及），日期跟著開賣日往回推，見 kolItems。
// 2026-10-01 CJ「這兩件事情，都要修正」：異業合作（cobrand）也一樣，從說明變成一條線。
export const PLANNABLE_CHANNELS = [
  "facebook", "instagram", "email", "website", "tiktok", "threads", "line", "kol", "cobrand",
] as const;

export const KOL_CHANNEL = "kol";
export const COBRAND_CHANNEL = "cobrand";
/** 合作類的線：排的是品牌要做的事，日期跟著開賣日走，不佔模型的檔期格子。 */
export const PARTNER_CHANNELS: readonly string[] = [KOL_CHANNEL, COBRAND_CHANNEL];

type LaneStep = {
  off: number; taskId: string; angle: (hook: string) => string;
  /** 說明單有名單時（網紅名單、異業合作夥伴），名單上每一位各一件，角度照他的（見 laneItems）。 */
  each?: (r: { angle?: string }, label: string, hook: string) => string;
};
const LANE_STEPS: Record<string, LaneStep[]> = {
  [KOL_CHANNEL]: [
    {
      off: -21, taskId: "kl-30-invite-opener",
      angle: (h) => (h ? `邀約開場：用「${h}」當合作理由，第一句就讓對方想回` : "邀約開場：第一句就讓對方想回"),
      each: (r, label, h) => `邀約 ${label}：${r.angle ? `從「${r.angle}」切入` : h ? `用「${h}」當合作理由` : "講清楚為什麼是他"}，第一句就讓對方想回`,
    },
    {
      off: -14, taskId: "kl-30-influencer-brief",
      angle: () => "給合作網紅的 brief：這檔要說什麼、不能說什麼、什麼時候交稿",
      each: (r, label) => `給 ${label} 的 brief：${r.angle ? `角度「${r.angle}」，` : ""}這檔要說什麼、不能說什麼、什麼時候交稿`,
    },
    { off: -7, taskId: "kl-30-followup", angle: () => "回覆與追蹤：報價、檔期、交稿前的確認" },
    { off: 0, taskId: "kl-30-fan-template-kit", angle: () => "開賣當天給網紅與粉絲的素材包：照著就能發" },
    { off: 5, taskId: "kl-30-catch-organic-fan", angle: () => "接住自然提到你的粉絲與創作者，邀他們一起加入這波" },
  ],
  [COBRAND_CHANNEL]: [
    { off: -28, taskId: "cb-30-partner-shortlist", angle: () => "列出受眾重疊、品類不衝突的合作夥伴輪廓，選定合作形式" },
    {
      off: -21, taskId: "cb-30-pitch-letter",
      angle: (h) => (h ? `寫提案信：先講對方能得到什麼，再用「${h}」當共同理由` : "寫提案信：先講對方能得到什麼，再講我們想要什麼"),
      // 2026-10-02：異業合作任務說明單的夥伴名單，每一位各一封（對象類型不同，提案的方案就不同）。
      each: (r, label, h) => `寫給 ${label} 的提案信：${r.angle ? `從「${r.angle}」切入，` : h ? `用「${h}」當共同理由，` : ""}先講對方能得到什麼`,
    },
    { off: -14, taskId: "cb-30-followup", angle: () => "提案後追蹤：沒回的補資訊、聊過的推下一步" },
    {
      off: -10, taskId: "cb-30-deal-terms", angle: () => "講好分工與導流：誰出素材、誰出優惠、成效怎麼算",
      each: (_r, label) => `跟 ${label} 講好合作條件：照說明單裡這一類要談的事，誰出什麼、成效怎麼算`,
    },
    { off: 0, taskId: "cb-30-joint-post", angle: () => "開賣當天雙方一起發的聯合公告：同一句核心訊息、各自的開場" },
  ],
};

/**
 * 合作類的一條線（網紅、異業合作）：固定幾件事，日期以開賣日為準（見 LANE_STEPS）。
 * 過去的日期往後挪到今天起、一天一件；最晚不超過活動結束後 7 天。對應的任務卡不存在就
 * 跳過那一件（不放按不下去的格子）。純函式，有測試。
 */
export function laneItems(channel: string, args: {
  launch: string; end: string; today: string; mechanic: string; cards: CatalogTask[];
  /** 網紅任務說明單的名單（選填）。有的話，邀約與 brief 每一位各一件、一天錯開一位（最多錯開 4 天）。 */
  influencers?: KolInfluencer[];
  /** 其他說明單的名單（異業合作夥伴；campaignChannelBrief.briefPartners）。跟 influencers 擇一。 */
  partners?: Array<{ label: string; angle?: string }>;
}): PlanItem[] {
  const steps = LANE_STEPS[channel] ?? [];
  const addDays = (s: string, n: number) => ymd(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * DAY));
  const latest = addDays(args.end, 7);
  const hook = args.mechanic.trim().slice(0, 30);
  const people: Array<{ label: string; angle?: string }> = args.influencers?.length
    ? args.influencers.filter((r) => r.name || r.type).map((r) => ({ label: influencerLabel(r), ...(r.angle ? { angle: r.angle } : {}) }))
    : (args.partners ?? []).filter((p) => p.label);
  // 展開成一件一件：有名單的步驟每一位一件。
  const plan: Array<{ off: number; taskId: string; angle: string; partner?: string }> = [];
  for (const p of steps) {
    if (p.each && people.length) {
      people.forEach((r, i) => {
        plan.push({ off: p.off + Math.min(i, 4), taskId: p.taskId, angle: p.each!(r, r.label, hook), partner: r.label });
      });
    } else {
      plan.push({ off: p.off, taskId: p.taskId, angle: p.angle(hook) });
    }
  }
  const out: PlanItem[] = [];
  let prev = "";
  plan.forEach((p, n) => {
    const card = args.cards.find((c) => c.id === p.taskId);
    if (!card) return;
    let date = addDays(args.launch, p.off);
    // 已經過去的：從今天起一天一件往後排，不要全部疊在今天。沒過去的照原定日期（同一天可以有好幾件）。
    if (date < args.today) date = prev && prev >= args.today ? addDays(prev, 1) : args.today;
    else if (date < prev) date = prev;
    if (date > latest) return;
    prev = date;
    const phase: CampaignPhaseId = date < args.launch ? "teaser" : date === args.launch ? "launch" : "sustain";
    out.push({
      id: `${phase}-${date}-${channel}${n}`, phase, date, platform: channel,
      taskId: card.id, taskLabel: card.labelZh || card.labelEn || card.id, angle: p.angle.slice(0, 200),
      enabled: true, outputId: null, scheduledAt: null,
      ...(p.partner ? { partner: p.partner } : {}),
    });
  });
  return out;
}

/** 網紅那條線（相容舊名稱與測試）。 */
export const kolItems = (args: Parameters<typeof laneItems>[1]) => laneItems(KOL_CHANNEL, args);

/**
 * 選了的貼文通路，每個至少一篇。
 *
 * 2026-10-01（CJ 看到活動 31 選了官網／Threads／LINE，模型一篇都沒排，左邊對話卡還在提醒
 * 「整檔一篇都沒排」）：提示詞也要求了，這裡是確定性的保底——還是 0 篇的通路，在開賣那一天
 * 補一篇這個通路的預設卡，講這一段的訊息。純函式，有測試。
 */
export function ensureChannelCoverage(args: {
  items: PlanItem[]; channels: string[]; cards: CatalogTask[];
  launch: string; launchMessage?: string | null;
}): PlanItem[] {
  const have = new Set(args.items.map((i) => i.platform));
  const extra: PlanItem[] = [];
  for (const ch of args.channels) {
    if (have.has(ch) || PARTNER_CHANNELS.includes(ch)) continue;
    const card = defaultCardFor(ch, args.cards);
    if (!card) continue;
    extra.push({
      id: `launch-${args.launch}-cover-${ch}`, phase: "launch", date: args.launch, platform: ch,
      taskId: card.id, taskLabel: card.labelZh || card.labelEn || card.id,
      angle: (args.launchMessage || PHASE_PURPOSE.launch).slice(0, 200),
      enabled: true, outputId: null, scheduledAt: null,
    });
  }
  return [...args.items, ...extra];
}

export interface InferredSettings {
  type: CampaignTypeId;
  mechanic: string;
  goal: string;
  channels: string[];
  productIds: number[];
  /** 推斷出來的搭配範圍：挑得到產品＝products，挑不到＝brand。使用者已經選了就不會用到。 */
  productScope: ProductScope;
  /** 講給使用者看的一行摘要（猜錯才需要點開改）。 */
  summary: string;
}

const INFER_SYSTEM = `你在幫行銷人員把一段隨手寫的活動說明，整理成系統需要的設定。

鐵則：
- **只整理，不發明**。使用者沒寫的優惠內容、折數、期限，一個字都不要加。
- mechanic 要盡量逐字保留使用者寫的機制（折數、門檻、期限、限量）；他沒寫就留空字串。
- channels 只能從提供的清單裡挑，挑 2–3 個最合理的。
- productIds 只能從提供的產品清單裡挑，挑使用者明確提到或明顯對應的；不確定就回空陣列。
  活動講的是整個品牌、或沒有指向任何一個產品時，也回空陣列（代表純品牌活動）。
- 只輸出 JSON，不要任何說明文字。`;

/**
 * 從一段自由文字推斷活動設定。
 *
 * 2026-09-26（CJ「我怎麼還是覺得，現在的顯示方式很複雜」）：原本設定區要使用者
 * 回答 24 個控制項（6 種類型 chips、10 個通路 chips、產品、目標、合作模組…），
 * 而這些答案幾乎都寫在他腦子裡那一句「中秋檔期，橫膈牛排跟牛舌組合 85 折，
 * 9/20 到 9/28」裡面。所以改成：他寫那一句，我們推斷，**結果用一行摘要呈現**，
 * 猜錯才點開改。
 *
 * 「提案不自動套用」：這支只回建議值，要不要採用由前端讓使用者確認。
 */
export async function inferCampaignSettings(args: {
  eventId: number;
  userId: number;
  brief: string;
}): Promise<InferredSettings> {
  const facts = await eventFacts(args.eventId, args.userId);
  if (!facts) throw new Error("找不到這個活動");

  // 2026-09-30：候選是**這個品牌的所有產品**。以前拿的是 event_products（這檔活動
  // 已經綁的），新活動一個都還沒綁，模型永遠看到「還沒有建立產品」，推不出任何產品。
  const [brandProdRows]: any = await localPool.execute(
    `SELECT id, name FROM products WHERE userId = ? AND brandId = ? ORDER BY id LIMIT 60`,
    [args.userId, facts.brandId],
  );
  const brandProducts = ((brandProdRows as any[]) ?? []).map((p) => ({ id: Number(p.id), name: String(p.name) }));
  const productList = brandProducts.length
    ? brandProducts.map((p) => `- id ${p.id}｜${p.name}`).join("\n")
    : "（這個品牌還沒有建立產品）";

  const typeList = CAMPAIGN_TYPE_IDS.map((t) => `- ${t}`).join("\n");

  const user = [
    `【品牌】${facts.brandName}`,
    `【活動名稱】${facts.name}`,
    facts.startAt ? `【期間】${facts.startAt.toISOString().slice(0, 10)} ~ ${facts.endAt ? facts.endAt.toISOString().slice(0, 10) : "?"}` : "",
    `【使用者寫的活動說明】\n${args.brief.trim() || "（沒有寫）"}`,
    `【可選的活動類型】\n${typeList}`,
    `【可選的通路】\n${PLANNABLE_CHANNELS.map((c) => `- ${c}${c === KOL_CHANNEL ? "（網紅合作：使用者提到網紅、KOL、創作者、團購主合作才選）" : c === COBRAND_CHANNEL ? "（異業合作：使用者提到聯名、異業、跨品牌、合作夥伴才選）" : ""}`).join("\n")}`,
    `【這個品牌的產品】\n${productList}`,
    "",
    "只輸出 JSON，鍵名固定如下：",
    `{"type":"活動類型 id","mechanic":"優惠機制（逐字保留使用者寫的數字與期限）","goal":"想達成什麼（使用者沒寫就空字串）","channels":["通路id"],"productIds":[產品id],"summary":"一行摘要（20字內，例如「促銷折扣・FB+IG・橫膈牛排、牛舌」）"}`,
  ].filter(Boolean).join("\n");

  const { invokeLLM } = await import("../../../platform/core/llm/llm.js");
  const r = await invokeLLM({
    messages: [{ role: "system", content: INFER_SYSTEM }, { role: "user", content: user }],
    maxTokens: 700,
  });
  const parsed = safeJSON<any>(String(r.choices?.[0]?.message?.content ?? ""), null);
  if (!parsed) throw new Error("讀不懂這段活動說明，請再寫具體一點（賣什麼、優惠是什麼、到什麼時候）");

  // 驗證與確定性修補：推斷出來的東西一律關在合法值域內，不然下游會拿到
  // 不存在的通路／別人的產品 id。
  const type = (CAMPAIGN_TYPE_IDS as readonly string[]).includes(parsed?.type) ? parsed.type : "promo_discount";
  const channels = (Array.isArray(parsed?.channels) ? parsed.channels : [])
    .map((c: any) => String(c).toLowerCase())
    .filter((c: string) => (PLANNABLE_CHANNELS as readonly string[]).includes(c));
  const validIds = new Set(brandProducts.map((p) => p.id));
  const productIds = (Array.isArray(parsed?.productIds) ? parsed.productIds : [])
    .map((n: any) => Number(n)).filter((n: number) => validIds.has(n));

  return {
    type: type as CampaignTypeId,
    mechanic: typeof parsed?.mechanic === "string" ? parsed.mechanic.trim().slice(0, 600) : "",
    goal: typeof parsed?.goal === "string" ? parsed.goal.trim().slice(0, 300) : "",
    channels: channels.length ? channels : ["facebook", "instagram"],
    productIds,
    productScope: productIds.length ? "products" : "brand",
    summary: typeof parsed?.summary === "string" ? parsed.summary.trim().slice(0, 60) : "",
  };
}

const SYSTEM = `你是負責「檔期宣傳」的資深行銷企劃。使用者已經決定好活動與優惠機制，你要做的是把它排成一份可以馬上開工的宣傳企劃。

鐵則：
- **只能從候選任務卡裡挑**，taskId 必須逐字抄自清單。不准自己發明任務名稱或 id。
- 每一格的「要講什麼」是一句話的內容方向（20–45 字），要具體到寫的人不必再想——
  講這一篇的切角與要強調的事實，不是「宣傳活動」這種空話。
- 優惠機制、售價、期限、份量這些數字，只能用使用者提供的，不准自己編。
- 同樣不准編的還有：銷售／試用／申請人數等成效數據、顧客或使用者的回饋與見證、
  「名額有限」「限量」這類稀缺條件、網址。使用者沒提供，切角就不要建立在它上面
  （例如不要排「用試用數據做成績單」「引用真實使用者回饋」）；需要這類素材的切角，
  改成「邀請／徵求」的寫法，或換一個只靠已知事實就能寫的角度。
- 【活動搭配】寫的是這檔活動的主角：單一產品就每篇圍繞它；多產品聯合要讓每個產品都
  輪到、並交代為什麼放在一起；純品牌活動就不要自己挑產品當主打。
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
  // 2026-09-29：舊設定裡的下架通路（LinkedIn／YouTube／新聞稿／X）不排進新企劃。
  const s = { ...facts.settings, channels: (facts.settings.channels ?? []).filter((c) => !isHiddenContentPlatform(c)) };
  // 舊設定的「要找網紅合作」「要做異業合作」勾選＝那條通路。
  if (s.partners?.kol && !s.channels.includes(KOL_CHANNEL)) s.channels = [...s.channels, KOL_CHANNEL];
  if (s.partners?.cobrand && !s.channels.includes(COBRAND_CHANNEL)) s.channels = [...s.channels, COBRAND_CHANNEL];
  if (!s.type || !s.mechanic?.trim() || !s.channels?.length) {
    throw new Error("活動設定還沒填完（需要活動類型、優惠機制、要發的通路）");
  }

  const beats = planBeats({ startAt: facts.startAt, endAt: facts.endAt, today: args.today });
  // 合作類的線（網紅、異業合作）是固定的幾件事（laneItems），不佔模型的檔期格子；模型只排貼文通路。
  const partnerLanes = s.channels.filter((c) => PARTNER_CHANNELS.includes(c));
  const postChannels = s.channels.filter((c) => !PARTNER_CHANNELS.includes(c));
  const partnerCards = partnerLanes.length ? campaignCards(partnerLanes) : [];
  const cards = campaignCards(postChannels);
  if (cards.length === 0 && partnerCards.length === 0) throw new Error("你選的通路目前沒有可用的任務卡，換一個通路再試");
  const today = ymd(args.today ?? new Date());
  const launchDate = beats.find((b) => b.phase === "launch")?.date ?? (facts.startAt ? ymd(facts.startAt) : today);
  const endDate = facts.endAt ? ymd(facts.endAt) : launchDate;
  const influencers = (facts.kolBrief?.influencers ?? []) as KolInfluencer[];
  const kol = partnerLanes.flatMap((ch) => laneItems(ch, {
    launch: launchDate, end: endDate, today, mechanic: s.mechanic, cards: partnerCards,
    ...(ch === KOL_CHANNEL ? { influencers } : {}),
    ...(ch === COBRAND_CHANNEL ? { partners: briefPartners("cobrand", facts.channelBriefs.cobrand) } : {}),
  }));
  // 2026-10-02：貼文通路的任務說明單（發在哪、推給誰、哪種形式…）帶進來，角度照清單排。
  const channelBriefBlock = postChannels
    .filter(isBriefChannel)
    .map((c) => (facts.channelBriefs[c] ? channelBriefText(c, facts.channelBriefs[c]) : ""))
    .filter(Boolean)
    .join("\n\n");

  const cardMenu = cards
    .map((c) => `- ${c.id}｜${c.platform}｜${c.labelZh || c.labelEn}`)
    .join("\n");

  const beatList = beats
    .map((b, i) => `${i}. ${b.date}｜${b.phase}（${PHASE_PURPOSE[b.phase]}）`)
    .join("\n");

  // 單一產品／多產品聯合／純品牌——三種的企劃長得不一樣（見 eventProductScope.ts）。
  const scope = resolveProductScope(s.productScope, facts.products.length);
  const productBlock = productScopeBrief(scope, facts.products);

  const user = [
    `【品牌】${facts.brandName}`,
    `【活動】${facts.name}`,
    `【活動類型】${s.type}`,
    `【優惠機制／活動內容】${s.mechanic}`,
    s.goal ? `【想達成】${s.goal}` : "",
    s.venue ? `【地點】${s.venue}` : "",
    s.sessions ? `【場次】${s.sessions}` : "",
    s.signupUrl ? `【報名連結】${s.signupUrl}` : "",
    `【活動搭配】\n${productBlock}`,
    `【要排的檔期格子】\n${beatList}`,
    `【候選任務卡（只能從這裡挑）】\n${cardMenu}`,
    channelBriefBlock ? `【各通路任務說明單（使用者填的；有清單的通路，angle 要對準清單裡的某一列，盡量每一列都排到）】\n${channelBriefBlock}` : "",
    "",
    "請為每一格挑一張卡並寫出這一篇要講什麼，再為每一個階段寫一句這段要讓人記住的訊息。只輸出 JSON，鍵名固定如下：",
    `{"smp":"這檔活動的一句話訴求（25字內）","phases":[{"phase":"階段 id","message":"這一段要讓人記住的一句話（20字內）"}],"items":[{"beat":0,"platform":"facebook","taskId":"逐字抄自候選清單","angle":"這一篇要講什麼（20-45字）"}]}`,
    `items 必須剛好 ${beats.length} 筆，beat 從 0 到 ${beats.length - 1} 各一次。`,
    postChannels.length > 1 ? `這些通路每一個都至少要排到一篇：${postChannels.join("、")}。` : "",
    `phases 只寫這些階段，各一次：${[...new Set(beats.map((b) => b.phase))].join("、")}。每段的訊息要扣回一句話訴求，而且段與段之間要有推進（預熱不講優惠、開賣講清楚機制、倒數講期限）。`,
  ].filter(Boolean).join("\n");

  // 2026-09-29（CJ「生文前都要讀取策略層的內容」）：以前只給品牌名稱＋活動設定＋
  // 5 項產品事實，每篇的「要講什麼」跟品牌定位、活動定位、文字規則都沒關係。
  // 改帶同一份品牌大腦（含這檔活動的定位）。
  const { buildBrandPrefix } = await import("../../../strategy/core/brand/brandContext");
  const brain = await buildBrandPrefix(facts.brandId, null, args.eventId, "full").catch(() => "");
  const { invokeLLM } = await import("../../../platform/core/llm/llm.js");
  // 只選了網紅：不必問模型排貼文，訴求用活動名稱，使用者之後可以跟總監改。
  let parsed: any = {};
  if (cards.length) {
    const r = await invokeLLM({
      messages: [
        { role: "system", content: brain ? `${SYSTEM}\n\n# 品牌大腦（每一篇的角度都要扣回這裡）${brain}` : SYSTEM },
        { role: "user", content: user },
      ],
      maxTokens: 3000,
    });
    const text = String(r.choices?.[0]?.message?.content ?? "");
    parsed = safeJSON<any>(text, null);
    if (!parsed) throw new Error(`企劃產生失敗：模型的輸出讀不成 JSON（${text.slice(0, 160)}）`);
  }

  const phaseMessages = reconcilePhaseMessages(parsed, beats);
  const posts = cards.length
    ? ensureChannelCoverage({
        items: reconcileItems({ beats, raw: parsed, cards, channels: postChannels }),
        channels: postChannels, cards, launch: launchDate, launchMessage: phaseMessages.launch,
      })
    : [];
  const items = [...posts, ...kol].sort((a, b) => a.date.localeCompare(b.date));
  if (items.length === 0) throw new Error("企劃產生失敗：一格都排不出來");

  const smp = typeof parsed?.smp === "string" ? parsed.smp.trim().slice(0, 60) : "";

  return {
    smp: smp || facts.name,
    items,
    phaseMessages,
    lockedAt: null,
    // 網紅不再是一段說明，而是企劃裡的一條線（kolItems）。
    kol: null,
    // 異業合作也不再是一段說明，而是企劃裡的一條線（laneItems）。
    cobrand: null,
    generatedAt: new Date().toISOString(),
  };
}
