/**
 * brandContext — single source of truth for "inject brand_brain into LLM prompts".
 *
 * Every router that calls an LLM on behalf of a brand should pull its
 * system-prompt prefix from `buildBrandPrefix(brandId)` so brand voice,
 * positioning, audience, and guardrails are applied uniformly.
 *
 * If brandId is missing or the table query fails, returns "" so the caller
 * can fall back gracefully to a brand-less prompt.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { buildMarketContext } from "./marketProfiles";

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}


/**
 * 2026-09-29（CJ「在策略端增加一個 mission tray，是檢查大腦……像手機記憶體的感覺，
 * 透明化品牌大腦當中有記到的內容」）：大腦畫面與產文 prompt 必須是**同一份**。
 *
 * 做法：組 prompt 的每一行都先登記成一筆 BrainEntry（屬於哪一類、用戶存了多少字、
 * 實際記住多少字），prompt 由這份清單組出來，「檢查大腦」畫面也讀這份清單——
 * 沒有第二套計算，所以畫面上寫「記住」的，就是 AI 真的讀得到的。
 *
 * 以前每一格各自 .slice()、超過就默默截掉，用戶不會知道。現在截掉的會標成
 * 「只記住一部分」，總量超過容量時被擠掉的會標成「超載」。
 */
export type BrainCategoryKey =
  | "market" | "identity" | "voice" | "rules" | "context" | "custom" | "doc"
  | "product" | "event" | "legacy";

export const BRAIN_CATEGORIES: Record<BrainCategoryKey, { zh: string; en: string }> = {
  market:   { zh: "市場與語言", en: "Market & language" },
  identity: { zh: "品牌核心",   en: "Brand core" },
  voice:    { zh: "品牌聲音",   en: "Brand voice" },
  rules:    { zh: "文字規則",   en: "Copy rules" },
  context:  { zh: "品牌脈絡",   en: "Brand context" },
  custom:   { zh: "自訂卡片",   en: "Custom cards" },
  doc:      { zh: "定位文件",   en: "Positioning docs" },
  product:  { zh: "產品",       en: "Product" },
  event:    { zh: "活動",       en: "Campaign" },
  legacy:   { zh: "舊版補充",   en: "Legacy notes" },
};

/**
 * 大腦容量：一次產文最多帶進多少字的品牌記憶。超過時從優先度最低的類別
 * 開始割捨（見 PRIORITY），並在大腦畫面標成「超載」。
 */
export const BRAIN_CAPACITY = 12_000;

/** 割捨順序：數字越大越先被擠掉。市場設定永遠保留。 */
const PRIORITY: Record<BrainCategoryKey, number> = {
  market: 0, identity: 1, voice: 2, rules: 3, product: 4, event: 5,
  context: 6, custom: 7, doc: 8, legacy: 9,
};

type SectionKey = "locked" | "voice" | "assets" | "context" | "legacy" | "product" | "event";

interface BrainEntry {
  section: SectionKey;
  category: BrainCategoryKey;
  label: string;
  line: string;
  storedChars: number;
  trimmed: boolean;
  dropped: boolean;
}

export type BrainItemStatus = "remembered" | "trimmed" | "overflow" | "checkOnly";

export interface BrainItem {
  category: BrainCategoryKey;
  label: string;
  /** 用戶存了多少字。 */
  storedChars: number;
  /** 實際進到 prompt 的字數（超載時是 0）。 */
  keptChars: number;
  status: BrainItemStatus;
  /** 存的內容開頭，給畫面預覽。 */
  preview: string;
}

export interface BrandBrain {
  prefix: string;
  items: BrainItem[];
  capacity: number;
  usedChars: number;
}

const len = (s: string) => [...s].length;

/** 截到 max 字；回傳有沒有截。 */
function clip(raw: string, max: number): { text: string; trimmed: boolean } {
  const chars = [...raw];
  return chars.length <= max ? { text: raw, trimmed: false } : { text: chars.slice(0, max).join(""), trimmed: true };
}

class BrainCollector {
  entries: BrainEntry[] = [];
  checkOnly: BrainItem[] = [];

  /** 一行 prompt＝一筆記憶。raw 是用戶存的原文，max 是這一格最多記住幾字。 */
  add(section: SectionKey, category: BrainCategoryKey, label: string, raw: string, max: number, render?: (kept: string) => string): void {
    const text = raw.trim();
    if (!text) return;
    const { text: kept, trimmed } = clip(text, max);
    this.entries.push({
      section, category, label,
      line: render ? render(kept) : `【${label}】${kept}`,
      storedChars: len(text), trimmed, dropped: false,
    });
  }

  /** 不進 prompt、但每篇產出後都會硬檢查的規則（禁用詞、替換對照）。 */
  addCheckOnly(label: string, raw: string): void {
    const text = raw.trim();
    if (!text) return;
    this.checkOnly.push({ category: "rules", label, storedChars: len(text), keptChars: 0, status: "checkOnly", preview: text.slice(0, 80) });
  }
}

/**
 * 依 canonical dot-path 取值並登記（產品／活動定位用）。
 *
 * 2026-09-01：產品與活動的區塊本來是手寫的 `if (pp.usp) …`，路徑全是
 * PRODUCT_SEGMENTS / EVENT_SEGMENTS 裡不存在的舊 key，於是那兩層定位從來沒進過
 * prompt。走登錄表的原因是：路徑寫在一起就看得出對不對，而且能被 positioningDocs
 * 的 PROMPT_FIELDS 拿去做落差報告。值可能是字串或字串陣列；物件與 tableRows
 * 一律跳過（String() 出來就是 "[object Object]"）。
 */
function pushFrom(
  c: BrainCollector, section: SectionKey, category: BrainCategoryKey,
  obj: any, specs: [path: string, label: string, max: number][],
): void {
  for (const [path, label, max] of specs) {
    const v = path.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), obj);
    if (v == null) continue;
    let text = "";
    if (typeof v === "string") text = v.trim();
    else if (Array.isArray(v)) text = v.filter((x) => typeof x === "string" && x.trim()).join(" · ");
    else continue;
    c.add(section, category, label, text, max);
  }
}

/**
 * 同一個標籤、多個可能路徑，第一個有值的就用（不是每個都印一行）。
 * 2026-09-25：事實欄位的 canonical 位置是 `facts.*`，舊資料在頂層（price /
 * productUrl）。兩邊都有值時只能印一次，否則模型看到兩個售價得自己猜。
 */
function pushFirst(c: BrainCollector, section: SectionKey, category: BrainCategoryKey, obj: any, label: string, paths: string[], max: number): void {
  for (const path of paths) {
    const v = path.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), obj);
    const text = typeof v === "string" ? v.trim() : "";
    if (!text) continue;
    c.add(section, category, label, text, max);
    return;
  }
}

/**
 * 用戶上傳的定位文件裡，對不到 canonical 欄位、但他選擇照樣餵進來的段落。
 * 上限在寫入端（positioningDocs.MAX_INJECTED_CHARS）已卡住，這裡不再截。
 */
function pushSourceDoc(c: BrainCollector, section: SectionKey, pos: any, label: string): void {
  const text = String(pos?._sourceDoc?.injectedContext ?? "").trim();
  if (text) c.add(section, "doc", label, text, 100_000, (kept) => `【${label}】\n${kept}`);
}

/** 自訂卡片每張最多記住的字數（全部欄位合計）。 */
const CUSTOM_CARD_MAX = 1_200;

/**
 * 2026-09-23：使用者自己開的定位卡片（positioning._customSegments[]）。
 * 2026-09-29：以前每張只帶前 3 格、500 字——畫面上填了 8 格，AI 只讀到 3 格，
 * 用戶不會知道。改成全部欄位都讀，每張上限 CUSTOM_CARD_MAX，超過會在大腦畫面標出來。
 */
function pushCustomSegments(c: BrainCollector, section: SectionKey, pos: any): void {
  const segs = Array.isArray(pos?._customSegments) ? pos._customSegments : [];
  for (const s of segs) {
    const title = String(s?.title ?? "").trim();
    const fields = Array.isArray(s?.fields) ? s.fields : [];
    if (!title || fields.length === 0) continue;
    const body = fields
      .map((f: any) => `${String(f?.label ?? "").trim()}：${String(f?.value ?? "").trim()}`)
      .filter((l: string) => l !== "：")
      .join("；");
    if (body) c.add(section, "custom", title, body, CUSTOM_CARD_MAX);
  }
}

/**
 * 總量超過容量時，從優先度最低（PRIORITY 數字大）、同類別裡排在後面的開始擠掉。
 * 擠掉的那筆整行不進 prompt——截半句比整句不放更糟。
 */
function applyCapacity(entries: BrainEntry[], fixedChars: number, capacity: number): void {
  let used = fixedChars + entries.reduce((n, e) => n + len(e.line), 0);
  if (used <= capacity) return;
  const order = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (PRIORITY[b.e.category] - PRIORITY[a.e.category]) || (b.i - a.i));
  for (const { e } of order) {
    if (used <= capacity) break;
    if (e.category === "market") continue;
    e.dropped = true;
    used -= len(e.line);
  }
}

// Cache key includes optional product/event so different scopes don't collide.
const CACHE = new Map<string, { brain: BrandBrain; expiresAt: number }>();
const TTL_MS = 60_000; // 1-minute cache — brand_brain edits become visible quickly
const cacheKey = (brandId: number, productId?: number | null, eventId?: number | null) =>
  `${brandId}:${productId ?? 0}:${eventId ?? 0}`;

export interface BrandSummary {
  id: number;
  name: string | null;
  prefix: string; // formatted system-prompt suffix (starts with "\n\n[品牌大腦摘要]\n…")
  entryCount: number;
}

/**
 * Returns a system-prompt suffix string ready to append to any LLM system message.
 * Pulls up to 8 most recently updated brand_brain entries, PLUS:
 *   - if productId set → product name + positioning JSON keys layered after brand
 *   - if eventId   set → event name + dates + positioning JSON layered last
 *
 * Precedence (bottom = wins in prompt-following): brand → product → event.
 * This lets LLM honor brand identity while letting product/event narrow it.
 *
 * 2026-05-11 (CJ「選了 product / event 也要 narrow LLM context」).
 */
/**
 * 2026-05-17 (CJ「所有任務的產出，有遵守品牌大腦的規範嗎？」→ 硬檢查
 * + 自動修正): structured brand-rule assets for the orchestra's
 * post-generation enforcement layer. Soft prompt injection alone never
 * guaranteed adherence; this returns the deterministically-checkable
 * rules from positioning._assets so the orchestra can auto-apply
 * substitutions and detect banned words after generation.
 */
export interface BrandRuleAssets {
  banned: string[];
  subs: Array<{ from: string; to: string }>;
  preferred: string[];
}

export interface BrandRuleAssetsLoadResult {
  rules: BrandRuleAssets;
  loaded: boolean;
}

export async function getBrandRuleAssetsWithStatus(
  brandId: number | undefined | null,
): Promise<BrandRuleAssetsLoadResult> {
  const empty = { banned: [] as string[], subs: [] as Array<{ from: string; to: string }>, preferred: [] as string[] };
  if (!brandId) return { rules: empty, loaded: true };
  try {
    const { default: localPool } = await import("../../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT id, positioning FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) return { rules: empty, loaded: false };
    if (!row?.positioning) return { rules: empty, loaded: true };
    const p = typeof row.positioning === "string" ? safeParse(row.positioning) : row.positioning;
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      return { rules: empty, loaded: false };
    }
    const a = p?._assets ?? {};
    const strArr = (x: any): string[] =>
      Array.isArray(x?.items) ? x.items.map((s: any) => String(s ?? "").trim()).filter(Boolean)
      : Array.isArray(x) ? x.map((s: any) => String(s ?? "").trim()).filter(Boolean) : [];
    const pairs = Array.isArray(a?.term_substitutions?.pairs)
      ? a.term_substitutions.pairs
          .map((pr: any) => ({ from: String(pr?.from ?? "").trim(), to: String(pr?.to ?? "").trim() }))
          .filter((pr: any) => pr.from && pr.to)
      : [];
    return {
      rules: { banned: strArr(a?.banned_words), subs: pairs, preferred: strArr(a?.preferred_terms) },
      loaded: true,
    };
  } catch {
    return { rules: empty, loaded: false };
  }
}

export async function getBrandRuleAssets(
  brandId: number | undefined | null,
): Promise<BrandRuleAssets> {
  return (await getBrandRuleAssetsWithStatus(brandId)).rules;
}

/**
 * 2026-05-17 (CJ「重新檢查，是否所有任務都按照規範」): the single
 * deterministic brand-rule enforcement used by EVERY caption-output
 * boundary (quick-task orchestra, Theater cell/polish, refineCaption).
 * Apply term_substitutions (X→Y); if a banned word survives, rewrite
 * once via anthropic with a hard "must not contain" instruction, then
 * re-apply subs. Fail-safe: any error → returns the input unchanged.
 */
export async function enforceBrandRulesOnText(
  brandId: number | undefined | null,
  text: string,
): Promise<string> {
  const r = await enforceBrandRulesOnTextWithReport(brandId, text);
  return r.text;
}

/**
 * 2026-06-05 (CJ「不阻擋，事後解釋」): same enforcement logic but ALSO
 * returns what was fixed so the UI layer can surface a friendly nudge
 * ("我發現你寫了「X」，但你品牌定位裡標為禁用詞，已自動改寫成「Y」。
 *   想調整定位？") instead of silently rewriting.
 */
export async function enforceBrandRulesOnTextWithReport(
  brandId: number | undefined | null,
  text: string,
): Promise<{
  text: string;
  bannedHits: string[];
  subsApplied: Array<{ from: string; to: string }>;
  rewrittenByLLM: boolean;
}> {
  const empty = { text, bannedHits: [] as string[], subsApplied: [] as Array<{ from: string; to: string }>, rewrittenByLLM: false };
  if (!brandId || !text || !text.trim()) return empty;
  try {
    const rules = await getBrandRuleAssets(brandId);
    if (!rules.subs.length && !rules.banned.length) return empty;

    // Detect which subs actually apply to this text (for reporting)
    const subsApplied = rules.subs.filter(({ from }) => from && text.includes(from));
    const applySubs = (t: string) => {
      let s = t;
      for (const { from, to } of rules.subs) if (from) s = s.split(from).join(to);
      return s;
    };
    const findBannedHits = (t: string) => rules.banned.filter((b) => b && t.includes(b));

    // Detect banned words BEFORE applying subs (subs may already neutralize some)
    const bannedHits = findBannedHits(text);

    let c = applySubs(text);
    let rewrittenByLLM = false;
    const surviving = findBannedHits(c);

    if (surviving.length) {
      try {
        const { invokeLLM } = await import("../../platform/core/llm");
        const r: any = await invokeLLM({
          provider: "anthropic",
          messages: [{ role: "user", content:
            `改寫以下文字。嚴禁出現這些詞：${surviving.join("、")}。` +
            (rules.subs.length ? `並務必套用替換：${rules.subs.map((s) => `「${s.from}」改說「${s.to}」`).join("、")}。` : "") +
            `保持原意、語氣、長度與換行，只輸出改寫後文字本身，不要前言：\n\n${c}` }],
          maxTokens: 1200,
        });
        const rewritten = String(r?.content ?? r?.text ?? "").trim();
        if (rewritten) {
          c = applySubs(rewritten);
          rewrittenByLLM = true;
        }
      } catch { /* keep substituted version */ }
    }
    return {
      text: c || text,
      bannedHits,
      subsApplied,
      rewrittenByLLM,
    };
  } catch { return empty; }
}

/**
 * 組出品牌大腦：prompt 前綴＋逐筆記憶清單（檢查大腦畫面用）。
 *
 * 2026-09-29（CJ「一律讀完整版」）：拿掉 2026-05-17 的 core／full 分層。短任務
 * 以前只拿到精簡 digest，會漏掉自訂卡片、定位文件、禁用句式、CTA 庫——大腦畫面
 * 要誠實，就只能有一份。buildBrandPrefix 的 mode 參數保留相容，但不再有作用。
 *
 * 順序：市場設定（最外層約束）→ 鎖定屬性 → 聲音指南 → 寫手指引 → 脈絡 →
 * 舊版補充 → 產品 → 活動。LLM 對靠後的內容較易執行，所以 product/event 放最後。
 */
export async function buildBrandBrain(
  brandId: number | undefined | null,
  productId?: number | null,
  eventId?: number | null,
  /**
   * 2026-09-26（策略會議「採用前預覽」）：用一份還沒寫進資料庫的定位算簡報。
   * 有 override 時不讀也不寫快取。
   */
  opts?: { positioningOverride?: any; productPositioningOverride?: any },
): Promise<BrandBrain> {
  const empty: BrandBrain = { prefix: "", items: [], capacity: BRAIN_CAPACITY, usedChars: 0 };
  if (!brandId) return empty;

  const hasOverride = opts?.positioningOverride !== undefined || opts?.productPositioningOverride !== undefined;
  const ck = cacheKey(brandId, productId, eventId);
  const cached = hasOverride ? undefined : CACHE.get(ck);
  if (cached && cached.expiresAt > Date.now()) return cached.brain;

  try {
    const db = await getDb();
    if (!db) return empty;

    // brand.positioning JSON 是單一真相；tagline/positioningSummary/positioningReport
    // 頂層欄位是 LEGACY，多半是 NULL，仍讀以相容。
    const { default: localPool } = await import("../../localDb");
    const [brandRowsRaw]: any = await localPool.execute(
      `SELECT name, tagline, positioningSummary, positioningReport, positioningStatus, positioning,
              targetCountry, outputLanguage, marketContextOverride
       FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    const brandRow = Array.isArray(brandRowsRaw) ? brandRowsRaw[0] : null;

    const positioning: any = (() => {
      if (opts?.positioningOverride !== undefined) return opts.positioningOverride;
      if (!brandRow?.positioning) return null;
      if (typeof brandRow.positioning === "string") return safeParse(brandRow.positioning);
      return brandRow.positioning;
    })();

    // 舊版 brand_brain 表（已無寫入端）。獨立 try：這張表查失敗不能讓整份大腦變空。
    let rows: any[] = [];
    try {
      const [r] = (await db.execute(
        sql`SELECT category, title, content
            FROM brand_brain
            WHERE brand_id = ${brandId}
            ORDER BY updated_at DESC
            LIMIT 8`
      )) as any;
      rows = Array.isArray(r) ? r : [];
    } catch { rows = []; }

    const c = new BrainCollector();

    // ── 鎖定屬性（tagline / archetype / WHY / HOW） ──
    const tlObj = positioning?.tagline;
    if (tlObj && typeof tlObj === "object") {
      if (tlObj.zhTagline) c.add("locked", "identity", "Tagline 中", String(tlObj.zhTagline), 300);
      if (tlObj.enTagline) c.add("locked", "identity", "Tagline EN", String(tlObj.enTagline), 300);
    } else if (typeof tlObj === "string" && tlObj.trim()) {
      c.add("locked", "identity", "Tagline", tlObj, 300);
    } else if (brandRow?.tagline) {
      c.add("locked", "identity", "Tagline (legacy)", String(brandRow.tagline), 300);
    }

    const archetypes = positioning?.voice?.archetypes;
    if (Array.isArray(archetypes) && archetypes.length > 0) {
      c.add("locked", "identity", "Archetype", archetypes.join(" / "), 200);
    } else if (brandRow?.positioningReport) {
      try {
        const rep = typeof brandRow.positioningReport === "string" ? JSON.parse(brandRow.positioningReport) : brandRow.positioningReport;
        const arch = rep?.archetype ?? rep?.brandArchetype ?? rep?.archetypePrimary;
        if (arch) c.add("locked", "identity", "Archetype (legacy)", typeof arch === "string" ? arch : JSON.stringify(arch), 200);
      } catch {}
    }

    const gc = positioning?.goldenCircle;
    if (gc && typeof gc === "object") {
      if (gc.why) c.add("locked", "identity", "WHY (信念)", String(gc.why), 400);
      if (gc.how) c.add("locked", "identity", "HOW (作法)", String(gc.how), 400);
      if (gc.what) c.add("locked", "identity", "WHAT (產品/服務)", String(gc.what), 300);
    }
    if (brandRow?.positioningSummary) c.add("locked", "identity", "定位摘要 (legacy)", String(brandRow.positioningSummary), 1_200);

    // ── 聲音指南 —— positioning.voice 的 tone/forbidden/samples 完整餵給 LLM ──
    const voice = positioning?.voice;
    if (voice && typeof voice === "object") {
      if (Array.isArray(voice.tone) && voice.tone.length > 0) {
        c.add("voice", "voice", "語氣關鍵詞", voice.tone.join(" / "), 300, (k) => `tone keywords: ${k}`);
      }
      if (Array.isArray(voice.forbidden) && voice.forbidden.length > 0) {
        const items = voice.forbidden.map((x: any) => String(x ?? "").trim()).filter(Boolean);
        c.add("voice", "voice", "禁用詞彙 / 句式", items.join("\n"), 1_000,
          (k) => `✗ 禁用詞彙 / 句式：\n  ${k.split("\n").map((x) => `· ${x}`).join("\n  ")}`);
      }
      if (Array.isArray(voice.samples) && voice.samples.length > 0) {
        voice.samples.slice(0, 6).forEach((s: any, i: number) => {
          const ours = s?.ours ?? s?.good ?? s?.brand;
          const generic = s?.generic ?? s?.bad ?? s?.wrong;
          if (!ours) return;
          c.add("voice", "voice", `語氣範例 ${i + 1}`, String(ours), 400,
            (k) => `【模仿這個範例的口吻】\n    ✓ 我們會寫：${k}\n    ✗ 不要寫：${generic ?? "(略)"}`);
        });
      }
    }

    // ── 寫手指引：文字頁（_assets）──
    // 2026-09-29（CJ 同意「Hook 庫等丟給生文 prompt」）：Hook 庫、文案範本、產品
    // 命名、縮寫、品牌術語以前只存著、主產文引擎不讀（縮寫與術語只有劇場讀）。
    // 禁用詞與替換對照照舊不進 prompt——每篇產出後由 enforceBrandRulesOnText 硬檢查，
    // 大腦畫面把它們標成「產出後檢查」。
    const assets = positioning?._assets;
    if (assets && typeof assets === "object") {
      const grab = (key: string, label: string, max = 600, maxItems = 12) => {
        const a = assets[key];
        if (!a) return;
        if (typeof a.text === "string" && a.text.trim()) {
          c.add("assets", "rules", label, a.text, max);
        } else if (Array.isArray(a.items) && a.items.length > 0) {
          const items = a.items.map((x: any) => String(x ?? "").trim()).filter(Boolean);
          if (items.length) c.add("assets", "rules", label, items.slice(0, maxItems).join(" · "), max);
          if (items.length > maxItems) c.entries[c.entries.length - 1]!.trimmed = true;
        } else if (Array.isArray(a.pairs) && a.pairs.length > 0) {
          const ps = a.pairs.filter((p: any) => p?.from || p?.to).map((p: any) => `${p.from ?? "?"} → ${p.to ?? "?"}`);
          if (ps.length) c.add("assets", "rules", label, ps.slice(0, maxItems).join(" · "), max);
          if (ps.length > maxItems) c.entries[c.entries.length - 1]!.trimmed = true;
        }
      };
      grab("voice", "聲音指南", 600);
      grab("voice_principles", "聲音原則");
      grab("preferred_terms", "偏好用詞");
      grab("branded_terms", "品牌術語");
      grab("abbreviations", "縮寫對照（同一個東西只有一種叫法）");
      grab("product_naming", "產品名稱規範");
      grab("cta_library", "CTA 範例");
      grab("hook_library", "開場 Hook 範例");
      grab("templates_copy", "文案範本", 1_500, 8);
      grab("audience", "目標受眾");

      const strList = (x: any): string[] => Array.isArray(x?.items) ? x.items.map((s: any) => String(s ?? "").trim()).filter(Boolean) : [];
      const banned = strList(assets.banned_words);
      if (banned.length) c.addCheckOnly("禁用詞（產出後自動檢查）", banned.join("、"));
      const subs = Array.isArray(assets.term_substitutions?.pairs)
        ? assets.term_substitutions.pairs.filter((p: any) => p?.from && p?.to).map((p: any) => `${p.from} → ${p.to}`)
        : [];
      if (subs.length) c.addCheckOnly("替換對照（產出後自動套用）", subs.join("、"));
    }

    // ── 補充脈絡：品牌故事 / 受眾 / 差異化 / 價值觀 / 競爭 ──
    if (positioning?.origin?.story) c.add("context", "context", "品牌故事", String(positioning.origin.story), 400);
    if (positioning?.audience && typeof positioning.audience === "object") {
      const aud = positioning.audience;
      if (aud.primary) c.add("context", "context", "主要受眾", String(aud.primary), 200);
      if (aud.painPoints && Array.isArray(aud.painPoints)) {
        c.add("context", "context", "受眾痛點", aud.painPoints.slice(0, 5).join(" · "), 300);
      }
    }
    if (positioning?.differentiation) {
      const d = positioning.differentiation;
      if (typeof d === "string") c.add("context", "context", "差異化", d, 300);
      else if (d.summary) c.add("context", "context", "差異化", String(d.summary), 300);
      if (d && typeof d === "object" && d.discriminator) c.add("context", "context", "唯一致勝理由", String(d.discriminator), 100);
      if (d && typeof d === "object" && d.reasonToBelieve) c.add("context", "context", "支撐證據", String(d.reasonToBelieve), 300);
    }
    if (positioning?.values?.items && Array.isArray(positioning.values.items)) {
      const vals = positioning.values.items
        .filter((v: any) => v?.label)
        .slice(0, 5)
        .map((v: any) => (v.body ? `${v.label}（${String(v.body).slice(0, 60)}）` : v.label))
        .join("、");
      if (vals) c.add("context", "context", "核心價值觀", vals, 500);
    }
    if (positioning?.origin?.belief5Layers && Array.isArray(positioning.origin.belief5Layers)) {
      const layers = positioning.origin.belief5Layers
        .filter((l: any) => l?.body)
        .slice(0, 5)
        .map((l: any) => String(l.body).slice(0, 90))
        .join(" → ");
      if (layers) c.add("context", "context", "信念五層深挖", layers, 500);
    }
    if (positioning?.competition && typeof positioning.competition === "object") {
      const comp = positioning.competition;
      if (comp.intensity) c.add("context", "context", "競爭強度", String(comp.intensity), 150);
      if (Array.isArray(comp.direct) && comp.direct.length) {
        const d2 = comp.direct
          .slice(0, 3)
          .map((x: any) => {
            const edge = x.ourEdge ? `我方優勢：${String(x.ourEdge).slice(0, 60)}`
              : x.weakness ? `對方弱點：${String(x.weakness).slice(0, 60)}` : "";
            return [x.name, edge].filter(Boolean).join(" — ");
          })
          .filter(Boolean)
          .join("；");
        if (d2) c.add("context", "context", "直接競品", d2, 400);
      }
      if (comp.map) c.add("context", "context", "競爭定位地圖", String(comp.map), 200);
    }
    pushSourceDoc(c, "context", positioning, "品牌定位文件補充");
    pushCustomSegments(c, "context", positioning);

    // ── 舊版 brand_brain 表（已無寫入端，仍讀以相容）──
    if (rows && rows.length > 0) {
      for (const r of rows as any[]) {
        c.add("legacy", "legacy", `${r.category}｜${r.title}`, String(r.content ?? ""), 400,
          (k) => `【${r.category}】${r.title}：${k}`);
      }
    }

    // ── 產品定位 ──
    let productName: string | null = null;
    if (productId) {
      try {
        const [prodRows]: any = await localPool.execute(
          `SELECT name, positioning FROM products WHERE id = ? LIMIT 1`,
          [productId],
        );
        const p = Array.isArray(prodRows) ? prodRows[0] : null;
        if (p) {
          productName = p.name ?? "(未命名)";
          c.add("product", "product", "產品名稱", String(productName), 100);
          const rawPp = opts?.productPositioningOverride !== undefined ? opts.productPositioningOverride : p.positioning;
          const pp = rawPp ? (typeof rawPp === "string" ? safeParse(rawPp) : rawPp) : null;
          if (pp && typeof pp === "object") {
            // 事實欄位（售價／規格／重量／份數／網址）：路徑順序跟
            // client/src/v2/strategy/lib/productFacts.ts 同一份，改那支要一起改這裡。
            pushFirst(c, "product", "product", pp, "產品售價",   ["facts.price", "price", "core.price"], 60);
            pushFirst(c, "product", "product", pp, "產品規格",   ["facts.spec", "spec"], 80);
            pushFirst(c, "product", "product", pp, "重量／容量", ["facts.weight", "weight"], 40);
            pushFirst(c, "product", "product", pp, "份數",       ["facts.servings", "servings"], 40);
            pushFirst(c, "product", "product", pp, "商品網址",   ["facts.url", "productUrl", "url"], 150);
            pushFrom(c, "product", "product", pp, [
              ["core.coreStatement",       "產品核心定位", 400],
              ["core.zhTagline",           "產品 Slogan",  100],
              ["core.enTagline",           "產品英文標語", 100],
              ["core.oneLineValueProp",    "一句話價值主張", 200],
              ["audience.primary",         "產品目標客群", 250],
              ["audience.pains",           "客群痛點",     250],
              ["value.coreFunctions",      "核心功能",     250],
              ["value.primaryEmotion",     "主要情緒價值", 150],
              ["value.personality",        "產品個性",     150],
              ["value.userFeeling",        "使用者感受",   200],
              ["competition.uniqueUsp",    "獨家賣點",     300],
              ["competition.rareUsp",      "次級賣點",     200],
              ["competition.commonUsp",    "普遍賣點",     200],
              ["marketing.tone",           "產品語氣",     200],
              ["marketing.style",          "溝通風格",     200],
              ["marketing.keywords",       "關鍵詞彙",     200],
            ]);
            if (pp?.competition?.competitors && Array.isArray(pp.competition.competitors)) {
              const comps = pp.competition.competitors
                .filter((x: any) => x?.name)
                .slice(0, 5)
                .map((x: any) => (x.position ? `${x.name}（${String(x.position).slice(0, 40)}）` : x.name))
                .join("、");
              if (comps) c.add("product", "product", "競品", comps, 300);
            }
            pushSourceDoc(c, "product", pp, "產品定位文件補充");
            pushCustomSegments(c, "product", pp);
          }
        }
      } catch {/* non-fatal */}
    }

    // ── 活動定位 ──
    if (eventId) {
      try {
        const [evRows]: any = await localPool.execute(
          `SELECT name, startAt, endAt, positioning FROM events WHERE id = ? LIMIT 1`,
          [eventId],
        );
        const e = Array.isArray(evRows) ? evRows[0] : null;
        if (e) {
          c.add("event", "event", "活動名稱", String(e.name ?? "(未命名活動)"), 100);
          if (e.startAt) {
            const start = new Date(e.startAt);
            c.add("event", "event", "活動開始", start.toLocaleDateString("zh-TW"), 40);
            const daysLeft = Math.ceil((start.getTime() - Date.now()) / 86400_000);
            const cd = daysLeft > 0 ? `還有 ${daysLeft} 天 — 可以做倒數 hook / 預熱`
              : daysLeft === 0 ? "今天就是活動日" : null;
            if (cd) c.add("event", "event", "倒數", cd, 60);
            else c.add("event", "event", "活動", `已開始 ${-daysLeft} 天`, 60);
          }
          if (e.endAt) c.add("event", "event", "活動結束", new Date(e.endAt).toLocaleDateString("zh-TW"), 40);
          const ep = e.positioning ? (typeof e.positioning === "string" ? safeParse(e.positioning) : e.positioning) : null;
          if (ep && typeof ep === "object") {
            pushFrom(c, "event", "event", ep, [
              ["brief.briefSummary",             "活動定位摘要", 400],
              ["brief.eventType",                "活動類型",     60],
              ["context.coreProblem",            "核心問題",     250],
              ["audience.primaryAudience",       "活動核心受眾", 300],
              ["audience.keyInsight",            "關鍵洞察",     200],
              ["objectives.marketingGoal",       "行銷目標",     200],
              ["smp.singleMindedProposition",    "SMP 單一主張", 200],
              ["messaging.coreMessage",          "核心訊息",     250],
              ["messaging.supportingPoints",     "支撐訊息",     300],
              ["creative.creativeTheme",         "創意主題",     200],
            ]);
            pushSourceDoc(c, "event", ep, "活動定位文件補充");
            pushCustomSegments(c, "event", ep);
          }
        }
      } catch {/* non-fatal */}
    }

    // ── 市場設定（最外層約束，永遠保留）──
    let marketSection = "";
    try {
      marketSection = await buildMarketContext(
        brandRow?.targetCountry,
        brandRow?.outputLanguage,
        brandRow?.marketContextOverride,
      );
    } catch { /* non-fatal: market context is best-effort */ }

    applyCapacity(c.entries, len(marketSection), BRAIN_CAPACITY);

    const live = (s: SectionKey) => c.entries.filter((e) => e.section === s && !e.dropped);
    const block = (s: SectionKey, header: string, bullet = true) => {
      const es = live(s);
      if (!es.length) return "";
      return `\n${header}\n` + es.map((e) => (bullet ? `- ${e.line}` : e.line)).join("\n") + "\n";
    };

    const body =
      block("locked",  "[品牌已鎖定屬性 — 最高優先級，所有產出都要符合]") +
      block("voice",   "[品牌聲音指南 — 嚴格遵守，這是品牌的「人聲」]", false) +
      block("assets",  "[寫手指引 — 用詞 / CTA / Hook / 範本 / 受眾規範]") +
      block("context", "[補充脈絡 — 品牌故事 / 受眾 / 差異化]") +
      block("legacy",  "[品牌大腦補充條目]") +
      block("product", "[本次產出聚焦的產品 — 必須圍繞此產品撰寫]") +
      block("event",   "[本次產出對應的活動 — 必須提及活動 / 時程 / 主軸]");

    const prefix = (marketSection || body) ? "\n\n" + marketSection + body : "";

    const items: BrainItem[] = [
      ...(marketSection ? [{
        category: "market" as const, label: "市場與語言設定", storedChars: len(marketSection.trim()),
        keptChars: len(marketSection.trim()), status: "remembered" as const, preview: marketSection.trim().slice(0, 80),
      }] : []),
      ...c.entries.map((e): BrainItem => ({
        category: e.category,
        label: e.label,
        storedChars: e.storedChars,
        keptChars: e.dropped ? 0 : len(e.line),
        status: e.dropped ? "overflow" : e.trimmed ? "trimmed" : "remembered",
        preview: e.line.replace(/^【[^】]*】/, "").slice(0, 80),
      })),
      ...c.checkOnly,
    ];
    const brain: BrandBrain = {
      prefix,
      items,
      capacity: BRAIN_CAPACITY,
      usedChars: items.reduce((n, i) => n + i.keptChars, 0),
    };

    if (!hasOverride) CACHE.set(ck, { brain, expiresAt: Date.now() + TTL_MS });
    return brain;
  } catch {
    return empty;
  }
}

/**
 * 回給 LLM 的品牌前綴。所有產文路徑都走這裡。
 *
 * mode 參數保留給既有呼叫端相容；2026-09-29 起 core 與 full 是同一份（見 buildBrandBrain）。
 */
export async function buildBrandPrefix(
  brandId: number | undefined | null,
  productId?: number | null,
  eventId?: number | null,
  _mode: "core" | "full" = "full",
  opts?: { positioningOverride?: any; productPositioningOverride?: any },
): Promise<string> {
  return (await buildBrandBrain(brandId, productId, eventId, opts)).prefix;
}

/**
 * Lightweight summary used by procedures that want to log or surface
 * "we did inject brand X" feedback to the client.
 */
export async function getBrandSummary(
  brandId: number | undefined | null
): Promise<BrandSummary | null> {
  if (!brandId) return null;
  try {
    const db = await getDb();
    if (!db) return null;

    const [nameRows] = (await db.execute(
      sql`SELECT name FROM brands WHERE id = ${brandId} LIMIT 1`
    )) as any;
    const [countRows] = (await db.execute(
      sql`SELECT COUNT(*) AS c FROM brand_brain WHERE brand_id = ${brandId}`
    )) as any;

    const prefix = await buildBrandPrefix(brandId);
    return {
      id: brandId,
      name: nameRows?.[0]?.name ?? null,
      prefix,
      entryCount: Number(countRows?.[0]?.c ?? 0),
    };
  } catch {
    return null;
  }
}

/** Test-only: clear the cache. */
export function _clearBrandPrefixCache() {
  CACHE.clear();
}

/** 定位被寫入之後立刻讓下一次產文讀到新簡報（不等 1 分鐘快取過期）。 */
export function invalidateBrandPrefix(brandId: number): void {
  for (const k of [...CACHE.keys()]) if (k.startsWith(`${brandId}:`)) CACHE.delete(k);
}
