/**
 * boothFlow — 展場對話背後真正做事的五個動作。
 *
 * 2026-09-19 (CJ)：訪客給公司名和網址 → 我們盤他的產品、建他的品牌大腦 →
 * 他貼一篇自己喜歡的文章 → 我們照他的寫法寫一篇。
 *
 * 這裡沒有一個動作是新的能力，全部是把既有管線包成「一個對話回合能等完」的
 * 形狀。Hermes 只負責決定什麼時候呼叫哪一個、以及中間跟人說什麼。
 *
 * ── 展場模式跟正常建立品牌差在哪 ─────────────────────────────────────
 *   · 定位跑小定位（boothPositioning），不跑 14 步、不叫 Perplexity
 *   · 產品上限從 50 壓到 10 —— 一百個人掃碼就是一百份帳單
 *   · 帳號是 trial：7 天、1000 點，點數本身就是每人成本的上限
 *
 * 每個動作都回一個 `say` 欄位：那是 bot 可以直接講出來的話。長工作一律回
 * 「還在跑」而不是卡住等，因為訪客站在攤位前面，不會等你六分鐘。
 */
import localPool from "../../../localDb";
import {
  ensureTrialUser,
  getVisitorById,
  newStyleToken,
  updateVisitor,
  type BoothVisitor,
} from "./boothStore";
import { SiteUnreadableError, summariseSiteIntoPositioning } from "../../../strategy/core/boothPositioning";
import { enqueueProductDiscovery, getDiscoveryStatus } from "../../../strategy/core/productDiscovery";
import { publicBaseUrl } from "../hub/hubStore";

/** 展場模式的產品上限。正常模式是 50。 */
export const BOOTH_PRODUCT_CAP = 10;

export class BoothError extends Error {
  constructor(message: string, public readonly hint?: string) {
    super(message);
    this.name = "BoothError";
  }
}

async function loadVisitor(visitorId: number): Promise<BoothVisitor> {
  const v = await getVisitorById(visitorId);
  if (!v) throw new BoothError(`visitor ${visitorId} not found`);
  return v;
}

function normaliseWebsite(input: string): string {
  const s = input.trim();
  if (!s) throw new BoothError("A website is required.");
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) throw new Error("no tld");
    return u.origin + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    throw new BoothError(`"${input}" doesn't look like a website address.`);
  }
}

function slugify(name: string): string {
  return (
    name.toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "brand"
  );
}

// ── 1. 建品牌大腦 ────────────────────────────────────────────────────────────

export interface CreateBrainResult {
  brandId: number;
  userId: number;
  company: string;
  website: string;
  discoveryQueued: boolean;
  say: string;
}

/**
 * 公司名 + 網址 → 訪客自己的試用帳號 + 品牌 + 背景開始爬站盤產品。
 * 回得很快（只有幾次 DB 寫入），盤產品與定位都在背景，因為訪客在等。
 */
export async function createBrandBrain(args: {
  visitorId: number;
  company: string;
  website: string;
}): Promise<CreateBrainResult> {
  const visitor = await loadVisitor(args.visitorId);
  const company = args.company.trim().slice(0, 200);
  if (!company) throw new BoothError("A company name is required.");
  const website = normaliseWebsite(args.website);

  const userId = await ensureTrialUser(visitor);

  // 同一位訪客重來一次不要長出第二個品牌。
  if (visitor.brandId) {
    await updateVisitor(visitor.id, { company, website });
    return {
      brandId: visitor.brandId,
      userId,
      company,
      website,
      discoveryQueued: false,
      say: `You already have a brand brain for ${company}. I'll keep building on it.`,
    };
  }

  const [ins]: any = await localPool.execute(
    `INSERT INTO brands (userId, name, slug, createdBy, website, positioning) VALUES (?, ?, ?, ?, ?, '{}')`,
    [userId, company, `${slugify(company)}-${Date.now().toString(36)}`, userId, website],
  );
  const brandId = ins.insertId;

  // 沒有這一列，listByMember 會把品牌濾掉，使用者在挑選器裡看不到自己的品牌
  // ——CJ 2026-04-30 抓到過一次（Pokemon GO 活動的品牌挑選器是空的）。
  // 跟 brandRouter.create 一樣：失敗不致命，owner 還有 brands.userId 這條路。
  try {
    await localPool.execute(
      `INSERT INTO brand_members (brandId, userId, role, addedBy) VALUES (?, ?, 'owner', ?)`,
      [brandId, userId, userId],
    );
  } catch (e: any) {
    console.error("[booth] brand_members seed failed:", e?.message ?? e);
  }

  await updateVisitor(visitor.id, { brandId, company, website });

  let discoveryQueued = false;
  try {
    await enqueueProductDiscovery(brandId, userId, website);
    discoveryQueued = true;
  } catch (e: any) {
    console.warn("[booth] discovery enqueue failed:", e?.message ?? e);
  }

  return {
    brandId,
    userId,
    company,
    website,
    discoveryQueued,
    say: `Reading ${new URL(website).hostname} now. Give me a moment and I'll tell you what I see.`,
  };
}

// ── 2. 小定位 ────────────────────────────────────────────────────────────────

export interface QuickPulseResult {
  ok: boolean;
  tagline: string | null;
  say: string;
  filled: string[];
  /** 官網撐不起、要跑完整版才有的部分——這是升級說詞，不是失敗。 */
  needsFullRun: string[];
  latencyMs: number;
}

/**
 * 讀官網、摘要成定位。約 15 秒，所以呼叫端應該先對訪客說一句「我在看你的網站」。
 * 爬不到就明講並要一個產品頁網址，不要假裝讀到了。
 */
export async function getQuickPulse(args: { visitorId: number; lang?: "zh-TW" | "en-US" }): Promise<QuickPulseResult> {
  const visitor = await loadVisitor(args.visitorId);
  if (!visitor.brandId || !visitor.userId || !visitor.website || !visitor.company) {
    throw new BoothError("No brand yet — call create_brand_brain first.");
  }
  try {
    const r = await summariseSiteIntoPositioning({
      brandId: visitor.brandId,
      userId: visitor.userId,
      brandName: visitor.company,
      website: visitor.website,
      lang: args.lang,
    });
    return {
      ok: true,
      tagline: r.tagline,
      say: r.pulse,
      filled: r.filled,
      needsFullRun: ["competition", "trends", "origin", "values"],
      latencyMs: r.latencyMs,
    };
  } catch (e) {
    if (e instanceof SiteUnreadableError) {
      throw new BoothError(
        "I couldn't read that site — it looks like a JavaScript storefront that serves an empty shell to crawlers.",
        "Ask them for a direct product page URL and call create_brand_brain again with it.",
      );
    }
    throw e;
  }
}

// ── 3. 產品盤查進度 ─────────────────────────────────────────────────────────

export interface DiscoveryResult {
  status: string;
  phase: string;
  found: number;
  positioned: number;
  /** 已經建檔的產品名，讓 bot 能真的唸出幾個來。 */
  names: string[];
  done: boolean;
  say: string;
}

export async function discoveryStatus(args: { visitorId: number }): Promise<DiscoveryResult> {
  const visitor = await loadVisitor(args.visitorId);
  if (!visitor.brandId) throw new BoothError("No brand yet — call create_brand_brain first.");

  const job = await getDiscoveryStatus(visitor.brandId);
  // LIMIT 不能用 placeholder —— mysql2 的 prepared statement 會回
  // "Incorrect arguments to mysqld_stmt_execute"。這裡是模組常數不是輸入，
  // 直接內插，並且斷言它是數字免得日後有人改成字串。
  const cap = Number(BOOTH_PRODUCT_CAP);
  const [rows]: any = await localPool.execute(
    `SELECT name FROM products WHERE brandId = ? ORDER BY id LIMIT ${cap}`,
    [visitor.brandId],
  );
  const names = (rows as any[]).map((r) => String(r.name));

  if (!job) {
    return {
      status: "none", phase: "none", found: names.length, positioned: 0, names,
      done: true,
      say: names.length
        ? `I have ${names.length} products on file.`
        : "I haven't found a product list on that site yet.",
    };
  }

  const done = job.status === "done" || job.status === "failed";
  const shown = names.slice(0, 3).join(", ");
  return {
    status: job.status,
    phase: job.phase,
    found: Math.min(job.totalFound, BOOTH_PRODUCT_CAP),
    positioned: job.totalPositioned,
    names,
    done,
    say: names.length
      ? `Found ${Math.min(job.totalFound, BOOTH_PRODUCT_CAP)} products so far — ${shown}${names.length > 3 ? "…" : ""}`
      : "Still reading the site.",
  };
}

// ── 4. 學他的寫法 ───────────────────────────────────────────────────────────

export interface StyleLinkResult {
  url: string;
  say: string;
}

/**
 * 回一個只屬於這位訪客的貼文網址。
 *
 * 為什麼不直接在聊天室裡收：手機上貼一篇八百字會被切成好幾則、會斷行、
 * 中途還可能被 bot 當成新問題回應。一個單欄位的網頁穩得多。
 */
export async function styleLink(args: { visitorId: number }): Promise<StyleLinkResult> {
  const visitor = await loadVisitor(args.visitorId);
  if (!visitor.brandId) throw new BoothError("No brand yet — call create_brand_brain first.");

  let token = visitor.styleToken;
  if (!token) {
    token = newStyleToken();
    await updateVisitor(visitor.id, { styleToken: token });
  }
  return {
    url: `${publicBaseUrl()}/booth/style/${token}`,
    say: "Paste one post you've written that you actually liked, and I'll work out how you write.",
  };
}

/**
 * SKILL 生成完就自動上架。
 *
 * 正常流程是使用者在網頁上看完 SKILL、試寫一次、按上架。展場訪客不會走那三步
 * ——他貼完就回聊天室了。`publish` 本來就不強制試寫（只要求 SKILL 存在），所以
 * 這裡等 SKILL 落地再替他按下去。
 *
 * 失敗不致命：卡還在，狀態停在 drafting，之後在網頁上一樣能上架。
 */
export async function publishStyleWhenReady(args: {
  brandId: number;
  userId: number;
  cardId: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const { getBrandTaskCard } = await import("../../../strategy/core/brandTaskCards");
  const deadline = Date.now() + (args.timeoutMs ?? 180_000);

  while (Date.now() < deadline) {
    const card = await getBrandTaskCard(args.brandId, args.cardId);
    if (!card) return false;
    if (card.status === "failed") {
      console.warn(`[booth] style card ${args.cardId} failed: ${card.lastError}`);
      return false;
    }
    if (card.skill) {
      try {
        const { appRouter } = await import("../../../routers");
        const caller = appRouter.createCaller({ user: { id: args.userId } } as any);
        await caller.brandTaskCard.publish({ brandId: args.brandId, cardId: args.cardId });
        return true;
      } catch (e: any) {
        console.warn("[booth] auto-publish failed:", e?.message ?? e);
        return false;
      }
    }
    await new Promise((r) => setTimeout(r, 4_000));
  }
  console.warn(`[booth] style card ${args.cardId} still had no SKILL when we gave up waiting`);
  return false;
}

// ── 5. 目前狀態（Hermes 每回合先問這個，才知道走到哪） ──────────────────────

export interface BoothState {
  visitorId: number;
  channel: string;
  displayName: string | null;
  company: string | null;
  website: string | null;
  brandId: number | null;
  hasPositioning: boolean;
  productCount: number;
  /** 他的寫法學到哪了。ready 才寫得出「像他寫的」貼文。 */
  styleCard: { id: string; status: string; hasSkill: boolean } | null;
  nextStep: "ask_company" | "ask_style" | "learning_style" | "ready_to_write";
}

export async function boothState(args: { visitorId: number }): Promise<BoothState> {
  const v = await loadVisitor(args.visitorId);

  let hasPositioning = false;
  let productCount = 0;
  let styleCard: BoothState["styleCard"] = null;

  if (v.brandId) {
    const [b]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ? LIMIT 1`, [v.brandId]);
    const raw = (b as any[])[0]?.positioning;
    const pos = typeof raw === "string" ? safeJson(raw) : (raw ?? {});
    // 底線開頭的是 _source / _taskCards / _assets 這類旁掛資料，不是定位本身。
    hasPositioning = Boolean(pos && Object.keys(pos).some((k) => !k.startsWith("_")));

    // 卡片存在 positioning._taskCards，鍵名只認 brandTaskCards 那一份。
    const { listBrandTaskCards } = await import("../../../strategy/core/brandTaskCards");
    const [card] = await listBrandTaskCards(v.brandId);
    styleCard = card ? { id: card.id, status: card.status, hasSkill: Boolean(card.skill) } : null;

    const [c]: any = await localPool.execute(`SELECT COUNT(*) n FROM products WHERE brandId = ?`, [v.brandId]);
    productCount = Number((c as any[])[0]?.n ?? 0);
  }

  // nextStep 只講「還需要這個人做什麼」，不講系統自己在忙什麼。
  // 讀網站與盤產品是背景工作，訪客不必等它們就能先貼自己的文章——把它們寫進
  // 這條鏈會讓人卡在一個他根本無從推進的步驟上。系統進度看 hasPositioning
  // 與 productCount。
  //
  // 學寫法則有中間狀態：卡建了但 SKILL 還在生，這時候寫出來的不會像他，
  // 所以要跟「還沒貼」分開，Hermes 才知道是該催他貼、還是該叫他等一下。
  const nextStep: BoothState["nextStep"] = !v.brandId
    ? "ask_company"
    : !styleCard
      ? "ask_style"
      : styleCard.status === "ready"
        ? "ready_to_write"
        : "learning_style";

  return {
    visitorId: v.id,
    channel: v.channel,
    displayName: v.displayName,
    company: v.company,
    website: v.website,
    brandId: v.brandId,
    hasPositioning,
    productCount,
    styleCard,
    nextStep,
  };
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}

/** 只給測試用的出口，避免為了測兩個純函式把它們變成公開 API。 */
export const __test = { normaliseWebsite, slugify };
