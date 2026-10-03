/**
 * scopeRouter — brand × product × event scope CRUD + active scope read.
 *
 * Per CJ direction 2026-04-28:
 *   - User selects ONE active scope: brand | product | event (choose-one).
 *   - Every agent / squad / skill run reads `scope.active` first; the
 *     intake agent / orchestrator recaps its understanding before kicking
 *     off downstream pipeline steps.
 *   - All three entities live under the same userId for isolation.
 *
 * Endpoints:
 *   product.list / product.get / product.upsert / product.remove
 *   event.list   / event.get   / event.upsert   / event.remove
 *   scope.active(brandId?, productId?, eventId?) — returns the merged
 *     positioning payload for the active scope (one of three).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { planQuotaFor, isUnlimited, checkCap } from "../../platform/core/billing/planGate";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import { callLLM } from "../../platform/core/llm/llmRouter";
import { assertUrlSafe } from "../../platform/core/web/urlGuard";
import { fetchImageBuffer } from "../../platform/core/media/imageFetch";
import { fetchProductMeta } from "../core/entities/productMeta";

// ── helpers ────────────────────────────────────────────────────────────────
function safeJson(s: any): any {
  if (s == null) return null;
  if (typeof s === "object") return s;
  try { return JSON.parse(String(s)); } catch { return null; }
}

async function row<T = any>(sqlText: string, params: any[] = []): Promise<T | null> {
  const [rows]: any = await localPool.execute(sqlText, params);
  return (rows[0] as T) ?? null;
}

async function rows<T = any>(sqlText: string, params: any[] = []): Promise<T[]> {
  const [r]: any = await localPool.execute(sqlText, params);
  return (r as T[]) ?? [];
}

function definedPositioningPatch(value: any): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));
}

function formatProductPrice(price: string, currency?: string): string {
  const trimmed = price.trim();
  const numeric = Number(trimmed.replace(/,/g, ""));
  const amount = Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric)
    : trimmed;
  const code = currency?.trim().toUpperCase();
  return code === "TWD" ? `NT$${amount}` : code ? `${code} ${amount}` : amount;
}

function productMetaDescription(name: string, url: string, price?: string): string {
  return price
    ? `「${name}」，定價 ${price}。商品頁：${url}`
    : `「${name}」。商品頁：${url}`;
}

/**
 * Detached metadata fill. Each JSON_SET value is guarded in SQL so a manual
 * edit or positioning step that lands while the fetch is in flight wins.
 *
 * 2026-09-10 (CJ「所有品牌／產品的照片都應該由用戶上傳」)：imageUrl 拿掉了——
 * 這支原本會把單頁抓到的 og:image 寫進 positioning.imageUrl，跟 CJ 的決定
 * 直接衝突。price／productUrl／description 是不同的訊號（不是「爬圖片」），
 * 繼續保留；skip 條件也從「有圖有價」改成只看「有價」。
 */
async function backfillProductMeta(args: {
  productId: number;
  userId: number;
  productName: string;
  positioning: Record<string, any>;
}): Promise<void> {
  const website = [args.positioning.productUrl, args.positioning.website]
    .find((value) => typeof value === "string" && value.trim())?.trim();
  if (!website || args.positioning.price) return;

  try {
    const meta = await fetchProductMeta(website);
    const price = meta.price ? formatProductPrice(meta.price, meta.currency) : undefined;
    const description = productMetaDescription(meta.name ?? args.productName, website, price);
    const candidates: Array<[string, string | undefined]> = [
      ["price", price],
      ["productUrl", website],
      ["description", description],
    ];
    const available = candidates.filter((entry): entry is [string, string] => !!entry[1]);
    if (available.length === 0) {
      console.warn(`[productMeta] no metadata found for product ${args.productId}: ${website}`);
      return;
    }

    const jsonSetArgs: string[] = [];
    const params: any[] = [];
    for (const [key, value] of available) {
      const path = `$.${key}`;
      jsonSetArgs.push(
        `'${path}', IF(JSON_EXTRACT(positioning, '${path}') IS NULL OR JSON_TYPE(JSON_EXTRACT(positioning, '${path}')) = 'NULL' OR JSON_UNQUOTE(JSON_EXTRACT(positioning, '${path}')) = '', ?, JSON_UNQUOTE(JSON_EXTRACT(positioning, '${path}')))`
      );
      params.push(value);
    }
    await localPool.execute(
      `UPDATE products
          SET positioning = JSON_SET(COALESCE(positioning, JSON_OBJECT()), ${jsonSetArgs.join(", ")})
        WHERE id = ? AND userId = ?`,
      [...params, args.productId, args.userId],
    );
    console.log(`[productMeta] backfilled product ${args.productId} from ${meta.source}: ${available.map(([key]) => key).join(", ")}`);
  } catch (error) {
    console.warn(`[productMeta] backfill failed for product ${args.productId}:`, error instanceof Error ? error.message : error);
  }
}

// ── product router ─────────────────────────────────────────────────────────
/** onboarding 一次最多收幾個商品頁網址。刻意訂低 —— 這不是批次匯入工具，
 *  是「先設定幾個優先產品」。要大量匯入走產品頁的批次功能。 */
const MAX_INTAKE_URLS = 8;

/** 產品數量級距。純粹用來推薦方案（products 額度：基礎 0、專業 10），
 *  不需要爬任何東西就答得出來 —— 這是 CJ 偏好問級距而非掃描的理由。 */
export const PRODUCT_COUNT_BANDS = ["none", "1-3", "4-10", "11-30", "31-100", "100+"] as const;

export interface ProductImportResult {
  url: string;
  /** 抓到的中介資料層級。none = 什麼都讀不到，前端要退回手填。 */
  source: "jsonld" | "og" | "title" | "none" | "unsafe";
  /** source 不是 none/unsafe，也就是至少讀到名稱。 */
  readable: boolean;
  name?: string;
  price?: string;
  description?: string;
  productId?: number;
  /** 沒建產品的原因。plan = 方案沒有產品定位；quota = 額度用完。 */
  skipped?: "plan" | "quota" | "error";
  error?: string;
}

/** 與 client autoSlug 同一套規則（小寫、去音標、非字母數字換成 -、加亂碼尾）。 */
function slugFromName(name: string): string {
  const base = name.toLowerCase().trim()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base || "product"}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 單一網址：先過 SSRF 白名單，再抓中介資料。任何失敗都回結果，不 throw ——
 *  一個網址壞掉不該讓整批匯入失敗（onboarding 每一步都要能繼續）。 */
async function importOneProductUrl(args: { url: string }): Promise<ProductImportResult> {
  const { url } = args;
  try {
    await assertUrlSafe(url);
  } catch {
    // 內網位址、非 http(s)、DNS 解析不到 —— 一律不抓，也不要回報細節。
    return { url, source: "unsafe", readable: false };
  }
  const meta = await fetchProductMeta(url);
  const readable = meta.source !== "none" && !!meta.name;
  return {
    url,
    source: meta.source,
    readable,
    ...(meta.name ? { name: meta.name } : {}),
    ...(meta.price ? { price: formatProductPrice(meta.price, meta.currency) } : {}),
    ...(meta.description ? { description: meta.description.slice(0, 500) } : {}),
  };
}

export const productRouter = router({
  list: protectedProcedure
    .input(z.object({ brandId: z.number().nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const where = input?.brandId
        ? "userId = ? AND brandId = ?"
        : "userId = ?";
      const params = input?.brandId ? [userId, input.brandId] : [userId];
      return rows(
        `SELECT id, slug, name, brandId, positioning, createdAt, updatedAt
           FROM products
          WHERE ${where}
          ORDER BY updatedAt DESC`,
        params,
      ).then((r) =>
        r.map((p: any) => ({ ...p, positioning: safeJson(p.positioning) })),
      );
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const r = await row<any>(
        `SELECT id, slug, name, brandId, positioning, createdAt, updatedAt
           FROM products WHERE id = ? AND userId = ? LIMIT 1`,
        [input.id, userId],
      );
      // 2026-05-15 (CJ「完整後端測試」): return null instead of NOT_FOUND.
      // Stale scope.productId pointing at deleted/foreign products caused
      // ~2s log spam. Frontend already null-tolerant (data?.name pattern).
      if (!r) return null;
      return { ...r, positioning: safeJson(r.positioning) };
    }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      brandId: z.number().nullable().optional(),
      slug: z.string().min(1).max(120),
      name: z.string().min(1).max(255),
      positioning: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const patch = definedPositioningPatch(input.positioning);
      let nextPositioning: Record<string, any>;
      let productId: number;
      if (input.id) {
        const existing = await row<{ positioning: any }>(
          `SELECT positioning FROM products WHERE id = ? AND userId = ? LIMIT 1`,
          [input.id, userId],
        );
        const oldPositioning = safeJson(existing?.positioning) ?? {};
        nextPositioning = { ...oldPositioning, ...patch };
        await localPool.execute(
          `UPDATE products SET brandId = ?, slug = ?, name = ?, positioning = ?
            WHERE id = ? AND userId = ?`,
          [input.brandId ?? null, input.slug, input.name, JSON.stringify(nextPositioning), input.id, userId],
        );
        productId = input.id;
      } else {
        // 2026-09-06 方案上限：只擋新增，既有的不動（降級的人保有已建好的）。
        const pQuota = await planQuotaFor(userId);
        if (!isUnlimited(pQuota.products)) {
          const [cnt]: any = await localPool.execute(
            `SELECT COUNT(*) AS n FROM products WHERE userId = ?`
              + (input.brandId ? ` AND brandId = ?` : ``),
            input.brandId ? [userId, input.brandId] : [userId],
          );
          const used = Number((cnt as any[])[0]?.n ?? 0);
          const chk = checkCap(used, pQuota.products, "個產品定位");
          if (!chk.ok) throw new TRPCError({ code: "BAD_REQUEST", message: chk.message! });
        }
        nextPositioning = patch;
        const [r]: any = await localPool.execute(
          `INSERT INTO products (userId, brandId, slug, name, positioning)
                VALUES (?, ?, ?, ?, ?)`,
          [userId, input.brandId ?? null, input.slug, input.name, JSON.stringify(nextPositioning)],
        );
        productId = Number(r?.insertId ?? 0);
      }

      if (productId) {
        void backfillProductMeta({ productId, userId, productName: input.name, positioning: nextPositioning });
      }
      return { id: productId };
    }),

  /** Replace only the canonical product image URL, preserving positioning. */
  updateImageUrl: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      imageUrl: z.string().url().refine((url) => url.startsWith("https://"), {
        message: "圖片網址必須以 https:// 開頭",
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const product = await row<{ id: number }>(
        `SELECT id FROM products WHERE id = ? AND userId = ? LIMIT 1`,
        [input.id, userId],
      );
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個產品" });

      try {
        await assertUrlSafe(input.imageUrl);
        await fetchImageBuffer(input.imageUrl, { timeoutMs: 10_000 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: message.startsWith("產品圖片連結已失效")
            ? message
            : "產品圖片連結已失效：請確認網址可公開存取且直接指向圖片",
        });
      }

      await localPool.execute(
        `UPDATE products
            SET positioning = JSON_SET(COALESCE(positioning, JSON_OBJECT()), '$.imageUrl', ?)
          WHERE id = ? AND userId = ?`,
        [input.imageUrl, input.id, userId],
      );
      return { ok: true as const, imageUrl: input.imageUrl };
    }),

  /**
   * importFromUrls — 從商品頁網址逐頁匯入產品。onboarding 第 2 步用。
   *
   * 2026-09-10 (CJ「因為官網掃描的功能，持續不穩定，所以我還是偏好問產品
   * 數量，或是他可以貼上幾個優先設定的產品網址」)
   *
   * ── 為什麼不全站爬 ───────────────────────────────────────────────
   * 當時的另一條路是「掃描官網」（crawlWebsite → LLM 抽最多 50 個產品）。
   * 同日實測 8 個商品頁：Shopify 站（gymshark）有完整 JSON-LD Product，
   * 而 Amazon 對 bot 回 404、自架 SPA 回 200 但只有 1KB 空殼。成敗由對方
   * 站台的技術棧決定，不是我們能修的 —— 所以不要在 onboarding 賭它。
   * （2026-09-24：那條全站爬的路已依 CJ 指示整個移除，這支是現在唯一的
   * 「從網址讀產品」入口。）
   *
   * 這支走 fetchProductMeta 的**單頁**路徑（JSON-LD → OG tag → title 三層
   * cascade），而且它會自報是哪一層抓到的（meta.source）。前端直接顯示那
   * 個層級，抓不到就退回手填 —— 不假裝抓到了。
   *
   * ── 額度為 0 時為什麼還是收下網址 ────────────────────────────────
   * products 額度：試用 0、基礎 0、專業 10。硬建會被 upsert 的 checkCap
   * 擋掉並丟 BAD_REQUEST，於是 onboarding 在基礎方案上必定失敗。
   *
   * 所以額度為 0 時**只存不建**：網址與抓到的中介資料寫進
   * brands.positioning.__productIntake，回傳 skipped:"plan"。升級後可以
   * 一鍵匯入，而且這是一個誠實的升級鉤子 —— 我們已經替他讀好了，只是
   * 他的方案還沒有產品定位。
   *
   * 存法沿用 __channels / __tray / brandTaskCards 同一套 positioning.<key>
   * 慣例，不開新欄位、不需要 migration。
   */
  importFromUrls: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      /** 商品頁網址，一行一個。上限刻意訂低 —— onboarding 不是批次匯入工具。 */
      urls: z.array(z.string().trim().min(1)).max(MAX_INTAKE_URLS).default([]),
      /** 產品數量級距。問這個是為了推薦方案，不需要爬任何東西就答得出來。 */
      countBand: z.enum(PRODUCT_COUNT_BANDS).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const brand = await row<{ id: number; positioning: any }>(
        `SELECT id, positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.brandId, userId],
      );
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個品牌" });

      // 正規化 + 去重。同一個網址貼兩次只算一次。
      const seen = new Set<string>();
      const urls: string[] = [];
      for (const raw of input.urls) {
        const u = raw.trim();
        if (!u) continue;
        const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
        const key = withScheme.replace(/\/+$/, "").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        urls.push(withScheme);
      }

      const pQuota = await planQuotaFor(userId);
      const canCreate = isUnlimited(pQuota.products) || pQuota.products > 0;
      let remaining = isUnlimited(pQuota.products) ? Number.MAX_SAFE_INTEGER : pQuota.products;
      if (canCreate && !isUnlimited(pQuota.products)) {
        const used = await row<{ n: number }>(
          `SELECT COUNT(*) AS n FROM products WHERE userId = ? AND brandId = ?`,
          [userId, input.brandId],
        );
        remaining = Math.max(0, pQuota.products - Number(used?.n ?? 0));
      }

      const results: ProductImportResult[] = [];
      // 併發 3。對象是別人的站，這裡不需要更快。
      const queue = [...urls];
      const worker = async () => {
        while (queue.length) {
          const url = queue.shift();
          if (!url) break;
          results.push(await importOneProductUrl({ url }));
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      // 併發會打亂順序，還原成使用者貼上的順序 —— 畫面要對得上他的輸入。
      results.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));

      // 建產品。額度不足的照樣留在 intake 裡，只是不建。
      for (const r of results) {
        if (!r.readable) continue;
        if (!canCreate || remaining <= 0) {
          r.skipped = canCreate ? "quota" : "plan";
          continue;
        }
        const name = (r.name ?? "").trim() || r.url;
        try {
          const [ins]: any = await localPool.execute(
            `INSERT INTO products (userId, brandId, slug, name, positioning) VALUES (?, ?, ?, ?, ?)`,
            [
              userId,
              input.brandId,
              slugFromName(name),
              name.slice(0, 255),
              JSON.stringify({
                productUrl: r.url,
                ...(r.price ? { price: r.price } : {}),
                ...(r.description ? { description: r.description } : {}),
              }),
            ],
          );
          r.productId = Number(ins?.insertId ?? 0) || undefined;
          if (r.productId) remaining -= 1;
        } catch (e: any) {
          r.skipped = "error";
          r.error = String(e?.message ?? e).slice(0, 200);
        }
      }

      // intake 一律留檔（含級距與逐一結果），升級後可以直接匯入。
      const intake = {
        countBand: input.countBand ?? null,
        capturedAt: new Date().toISOString(),
        urls: results.map((r) => ({
          url: r.url,
          name: r.name ?? null,
          price: r.price ?? null,
          source: r.source,
          productId: r.productId ?? null,
        })),
      };
      await localPool.execute(
        `UPDATE brands
            SET positioning = JSON_SET(COALESCE(positioning, JSON_OBJECT()), '$.__productIntake', CAST(? AS JSON))
          WHERE id = ? AND userId = ?`,
        [JSON.stringify(intake), input.brandId, userId],
      );

      return {
        results,
        created: results.filter((r) => r.productId).length,
        /** true = 讀到了但方案不給建。前端據此顯示升級提示，不是錯誤。 */
        pendingUpgrade: results.some((r) => r.skipped === "plan"),
        productQuota: pQuota.products,
      };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await localPool.execute(`DELETE FROM products WHERE id = ? AND userId = ?`, [input.id, userId]);
      return { ok: true };
    }),
});

// ── event router ──────────────────────────────────────────────────────────
export const eventRouter = router({
  list: protectedProcedure
    .input(z.object({
      brandId: z.number().nullable().optional(),
      productId: z.number().nullable().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const conds: string[] = ["e.userId = ?"];
      const params: any[] = [userId];
      // Strict brand match — null-brand legacy events would otherwise leak
      // into every brand's list and get mis-attributed on selection. Use
      // `brand-clear` flow (separate query without brandId) for orphans.
      if (input?.brandId)   { conds.push("e.brandId = ?");   params.push(input.brandId); }
      if (input?.productId) {
        // Match either the legacy single-product link OR the m:n join table.
        conds.push("(e.productId = ? OR EXISTS (SELECT 1 FROM event_products ep WHERE ep.eventId = e.id AND ep.productId = ?))");
        params.push(input.productId, input.productId);
      }
      const list = await rows(
        `SELECT e.id, e.slug, e.name, e.brandId, e.productId, e.startAt, e.endAt,
                e.positioning, e.createdAt, e.updatedAt
           FROM events e
          WHERE ${conds.join(" AND ")}
          ORDER BY e.updatedAt DESC`,
        params,
      );
      // Hydrate productIds[] from event_products for each row
      return Promise.all(list.map(async (e: any) => ({
        ...e,
        positioning: safeJson(e.positioning),
        productIds: await rows(
          `SELECT productId FROM event_products WHERE eventId = ? ORDER BY productId`,
          [e.id],
        ).then((rs: any[]) => rs.map((x) => Number(x.productId))),
      })));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const r = await row<any>(
        `SELECT id, slug, name, brandId, productId, startAt, endAt, positioning, createdAt, updatedAt
           FROM events WHERE id = ? AND userId = ? LIMIT 1`,
        [input.id, userId],
      );
      // 2026-05-15 (CJ「完整後端測試」): null over NOT_FOUND — same rationale
      // as product.get above.
      if (!r) return null;
      const productIds = await rows(
        `SELECT productId FROM event_products WHERE eventId = ? ORDER BY productId`,
        [input.id],
      ).then((rs: any[]) => rs.map((x) => Number(x.productId)));
      return { ...r, positioning: safeJson(r.positioning), productIds };
    }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      brandId: z.number().nullable().optional(),
      productId: z.number().nullable().optional(),     // primary product (back-compat)
      productIds: z.array(z.number()).optional(),      // many-to-many — full list of linked products
      slug: z.string().min(1).max(120),
      name: z.string().min(1).max(255),
      startAt: z.string().nullable().optional(),
      endAt: z.string().nullable().optional(),
      positioning: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const positioningJson = input.positioning != null
        ? JSON.stringify(input.positioning)
        : null;
      const startAt = input.startAt ? new Date(input.startAt) : null;
      const endAt   = input.endAt   ? new Date(input.endAt)   : null;
      // Resolve primary productId: explicit input wins; else first of productIds.
      const primaryProductId: number | null = input.productId
        ?? (input.productIds && input.productIds.length > 0 ? input.productIds[0]! : null);
      let eventId: number;
      if (input.id) {
        await localPool.execute(
          `UPDATE events
              SET brandId = ?, productId = ?, slug = ?, name = ?,
                  startAt = ?, endAt = ?, positioning = ?
            WHERE id = ? AND userId = ?`,
          [input.brandId ?? null, primaryProductId,
           input.slug, input.name, startAt, endAt, positioningJson,
           input.id, userId],
        );
        eventId = input.id;
      } else {
        // 2026-09-06 方案上限：活動定位是「每個計費週期幾次」，不是總量，
        // 所以數的是最近 30 天內建立的筆數，不是全部。
        const eQuota = await planQuotaFor(userId);
        if (!isUnlimited(eQuota.eventsPerCycle)) {
          const [cnt]: any = await localPool.execute(
            `SELECT COUNT(*) AS n FROM events
              WHERE userId = ? AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
            [userId],
          );
          const used = Number((cnt as any[])[0]?.n ?? 0);
          const chk = checkCap(used, eQuota.eventsPerCycle, "次活動定位／月");
          if (!chk.ok) throw new TRPCError({ code: "BAD_REQUEST", message: chk.message! });
        }
        const [r]: any = await localPool.execute(
          `INSERT INTO events (userId, brandId, productId, slug, name, startAt, endAt, positioning)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, input.brandId ?? null, primaryProductId,
           input.slug, input.name, startAt, endAt, positioningJson],
        );
        eventId = Number(r?.insertId ?? 0);
      }
      // Sync m:n event_products. When productIds is undefined, we leave it
      // alone (no change). When provided (even empty array), we replace
      // the full set so the UI is the single source of truth.
      if (input.productIds !== undefined) {
        await localPool.execute(`DELETE FROM event_products WHERE eventId = ?`, [eventId]);
        for (const pid of input.productIds) {
          await localPool.execute(
            `INSERT IGNORE INTO event_products (eventId, productId) VALUES (?, ?)`,
            [eventId, pid],
          );
        }
      } else if (primaryProductId && !input.id) {
        // New event with single productId only — mirror into the join table
        // so list/get can read uniformly.
        await localPool.execute(
          `INSERT IGNORE INTO event_products (eventId, productId) VALUES (?, ?)`,
          [eventId, primaryProductId],
        );
      }
      return { id: eventId };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await localPool.execute(`DELETE FROM events WHERE id = ? AND userId = ?`, [input.id, userId]);
      return { ok: true };
    }),
});

// ── scope router ──────────────────────────────────────────────────────────
// Active scope = (brandId, productId, eventId) — choose-one. Returns the
// merged positioning payload to feed into intake / orchestrator agents.
export const scopeRouter = router({
  active: protectedProcedure
    .input(z.object({
      brandId:   z.number().nullable().optional(),
      productId: z.number().nullable().optional(),
      eventId:   z.number().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const out: any = {
        userId, brandId: null, productId: null, eventId: null,
        brand: null, product: null, event: null,
      };

      if (input.brandId) {
        const r = await row<any>(
          `SELECT id, name, positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
          [input.brandId, userId],
        );
        if (r) { out.brandId = r.id; out.brand = { ...r, positioning: safeJson(r.positioning) }; }
      }
      if (input.productId) {
        const r = await row<any>(
          `SELECT id, name, brandId, positioning FROM products WHERE id = ? AND userId = ? LIMIT 1`,
          [input.productId, userId],
        );
        if (r) { out.productId = r.id; out.product = { ...r, positioning: safeJson(r.positioning) }; }
      }
      if (input.eventId) {
        const r = await row<any>(
          `SELECT id, name, brandId, productId, startAt, endAt, positioning
             FROM events WHERE id = ? AND userId = ? LIMIT 1`,
          [input.eventId, userId],
        );
        if (r) { out.eventId = r.id; out.event = { ...r, positioning: safeJson(r.positioning) }; }
      }
      return out;
    }),

  /**
   * Persist positioning JSON for any scope kind. Single endpoint avoids
   * having three near-identical save mutations on the client.
   */
  savePositioning: protectedProcedure
    .input(z.object({
      kind: z.enum(["brand", "product", "event"]),
      id: z.number(),
      positioning: z.any(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const json = input.positioning != null ? JSON.stringify(input.positioning) : null;
      const table = input.kind === "brand" ? "brands"
                  : input.kind === "product" ? "products" : "events";
      const userCol = input.kind === "brand" ? "userId" : "userId";
      const [r]: any = await localPool.execute(
        `UPDATE \`${table}\` SET positioning = ? WHERE id = ? AND ${userCol} = ?`,
        [json, input.id, userId],
      );
      const affected = (r as any)?.affectedRows ?? 0;
      if (!affected) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `${input.kind} #${input.id} not found for this user`,
        });
      }
      return { ok: true };
    }),

  /**
   * disambiguate — server fetches the provided URL(s) for real content
   * (title / og:meta / description / first heading), and asks OpenClaw
   * gateway (web_search baked in) for additional candidates. Each
   * candidate is grounded in REAL scraped data, not the user's typed
   * input. Returns { candidates[], summary, evidence[] } so the user
   * can verify "is this the brand I mean".
   */
  disambiguate: protectedProcedure
    .input(z.object({
      kind: z.enum(["brand", "product", "event"]),
      name: z.string().min(1).max(255),
      website:  z.string().optional(),
      facebook: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // ── 1. Server-side fetch of provided URLs to extract real metadata ──
      const evidence: { url: string; title: string; description: string; ogImage?: string; charCount: number; excerpt: string }[] = [];

      const tryFetch = async (raw: string) => {
        if (!raw) return;
        let url = raw.trim();
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        try {
          // SSRF guard: validate the initial URL + every redirect hop against
          // the DNS-resolved private-range blocklist. Manual redirects so an
          // allowed host can't 302 us to an internal address unchecked.
          let current = url;
          let resp: Response;
          for (let hop = 0; ; hop++) {
            await assertUrlSafe(current);
            resp = await fetch(current, {
              method: "GET",
              redirect: "manual",
              signal: AbortSignal.timeout(15_000),
              headers: { "User-Agent": "Mozilla/5.0 SoWork-MarketingOS-Verifier/1.0" },
            });
            if (resp.status >= 300 && resp.status < 400 && resp.headers.get("location")) {
              if (hop >= 5) return; // too many redirects
              current = new URL(resp.headers.get("location")!, current).toString();
              continue;
            }
            break;
          }
          if (!resp.ok) return;
          const html = await resp.text();
          // Extract title + meta description + og tags + first h1 + first chunk of body text
          const pick = (re: RegExp): string => {
            const m = html.match(re);
            return m?.[1]?.trim() ?? "";
          };
          const title = pick(/<title[^>]*>([^<]+)<\/title>/i);
          const desc =
            pick(/<meta\s+(?:name|property)=["']?(?:description|og:description)["']?\s+content=["']([^"']+)["']/i) ||
            pick(/<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["']?(?:description|og:description)["']?/i);
          const ogTitle = pick(/<meta\s+(?:property|name)=["']?og:title["']?\s+content=["']([^"']+)["']/i);
          const ogImage = pick(/<meta\s+(?:property|name)=["']?og:image["']?\s+content=["']([^"']+)["']/i);
          const h1 = pick(/<h1[^>]*>([^<]{3,200})<\/h1>/i);
          // Strip tags for excerpt (very rough)
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const excerpt = text.slice(0, 1500);
          const finalTitle = (ogTitle || title || h1 || "").slice(0, 200);
          const finalDesc  = (desc || excerpt).slice(0, 400);
          evidence.push({
            url,
            title: finalTitle || url,
            description: finalDesc,
            ogImage: ogImage || undefined,
            charCount: text.length,
            excerpt,
          });
        } catch { /* tolerate any fetch error */ }
      };

      await Promise.all([tryFetch(input.website ?? ""), tryFetch(input.facebook ?? "")]);

      // ── 2. Ask LLM with cross-provider fallback ──
      const evidenceBlock = evidence.length
        ? evidence.map((e, i) =>
            `[${i + 1}] ${e.url}\n  title: ${e.title}\n  description: ${e.description}\n  body excerpt (first 1500 chars): ${e.excerpt.slice(0, 500)}…`
          ).join("\n\n")
        : "（使用者未提供任何 URL）";

      const kindLabel = input.kind === "brand" ? "品牌" : input.kind === "product" ? "產品" : "活動";
      const sys = `你是 SoWork 品牌驗證助手。`
        + `\n任務：使用者要新增 ${kindLabel}「${input.name}」。`
        + `\n伺服器已實際 fetch 使用者提供的 URL，下方是抓到的真實內容；請只根據這些證據 + 你 web_search 的結果產出 candidates。`
        + `\n禁止憑空臆測或單純複述使用者輸入；每個 candidate 都必須有可驗證的 URL 與摘要。`
        + `\n\n【已抓取的證據】\n${evidenceBlock}`
        + (input.description ? `\n\n【使用者描述】${input.description}` : "")
        + `\n\n【輸出規則】嚴格回傳 JSON：`
        + `\n{"candidates":[{"name":"...","url":"...","description":"50-150 字基於證據的摘要","confidence":0-100,"evidenceIdx":1}],"summary":"找到 N 個候選 / 評估說明"}`
        + `\n- 若已抓到的證據明確就是這個 ${kindLabel}，confidence 必須 ≥ 80 並 evidenceIdx 指到該編號。`
        + `\n- 若你 web_search 發現同名其他品牌（例如 sowork.tw vs sowork.com），各列為獨立 candidate。`
        + `\n- 若沒任何證據可驗證，candidates 可為空陣列，summary 說明「找不到可信來源，請補充官網或描述」。`
        + `\n語言：繁體中文（zh-TW）。`;

      const user = `請驗證「${input.name}」並列出 candidates。`;

      let raw = "";
      try {
        const result = await callLLM({ system: sys, user, maxTokens: 3000, timeoutMs: 120_000 });
        raw = result.text;
      } catch { /* swallow — fall through to evidence-only candidates */ }

      // ── 3. Parse + ground candidates back to evidence ──
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      let parsed: any = { candidates: [], summary: "" };
      try { parsed = JSON.parse(cleaned); } catch { /* ignore */ }

      const llmCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates.slice(0, 3).map((c: any) => ({
        name: String(c?.name ?? ""),
        url: String(c?.url ?? ""),
        description: String(c?.description ?? "").slice(0, 600),
        confidence: Math.max(0, Math.min(100, Number(c?.confidence ?? 0))),
        evidenceIdx: Number.isFinite(Number(c?.evidenceIdx)) ? Number(c?.evidenceIdx) : null,
      })) : [];

      // If gateway returned nothing but we DO have scraped evidence,
      // build candidates directly from evidence (verified real content).
      let candidates = llmCandidates;
      if (candidates.length === 0 && evidence.length > 0) {
        candidates = evidence.map((e) => ({
          name: e.title.replace(/\s*[|｜\-—].*$/, "").trim() || input.name,
          url: e.url,
          description: e.description,
          confidence: 90, // we DID fetch the URL, content is real
          evidenceIdx: null,
        }));
      }

      const summary = String(parsed?.summary ?? "") || (
        candidates.length === 0
          ? "找不到可信來源 — 請在上一步補充官網 / Facebook / 描述後再試。"
          : `已實際抓取 ${evidence.length} 個 URL 並比對，列出 ${candidates.length} 個候選。`
      );

      return {
        candidates,
        summary,
        evidence: evidence.map((e) => ({
          url: e.url, title: e.title, description: e.description,
          ogImage: e.ogImage, charCount: e.charCount,
        })),
      };
    }),

  /** Pick lists for the top-right ScopeBar (brands/products/events the user owns). */
  options: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id;
    const [b, p, e, ep] = await Promise.all([
      rows(`SELECT id, name FROM brands   WHERE userId = ? ORDER BY name ASC`, [userId]),
      rows(`SELECT id, name, brandId FROM products WHERE userId = ? ORDER BY name ASC`, [userId]),
      rows(`SELECT id, name, brandId, productId FROM events WHERE userId = ? ORDER BY name ASC`, [userId]),
      // event_products join — for each event, the list of linked product ids.
      // Single query joined back in JS to avoid N+1.
      rows<{ eventId: number; productId: number }>(
        `SELECT ep.eventId, ep.productId
           FROM event_products ep
           JOIN events e ON e.id = ep.eventId
          WHERE e.userId = ?
          ORDER BY ep.eventId, ep.productId`,
        [userId],
      ),
    ]);
    // Group productIds by eventId
    const productIdsByEvent = new Map<number, number[]>();
    for (const r of ep as any[]) {
      const list = productIdsByEvent.get(Number(r.eventId)) ?? [];
      list.push(Number(r.productId));
      productIdsByEvent.set(Number(r.eventId), list);
    }
    const eventsWithIds = (e as any[]).map((ev) => ({
      ...ev,
      productIds: productIdsByEvent.get(Number(ev.id)) ?? (ev.productId ? [Number(ev.productId)] : []),
    }));
    return { brands: b, products: p, events: eventsWithIds };
  }),
});
