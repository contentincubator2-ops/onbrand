/**
 * productDiscovery — auto-discovers and positions products from a brand website.
 *
 * Called after brand creation. Queues a background job that:
 *   1. Crawls the brand's website (homepage + common product pages)
 *   2. Uses LLM to extract up to 50 products
 *   3. Creates product records in DB
 *   4. Runs runInterim positioning for each product (sequentially, 2s delay)
 *   5. Queues full positioning jobs in background
 *
 * Failure strategy: every step is wrapped in try/catch. Errors are silently
 * logged in errorLog (JSON array). Users see partial results; never errors.
 *
 * Concurrency limits:
 *   - Global semaphore: max 2 discovery jobs running simultaneously
 *   - Per-brand: only 1 active job at a time
 *   - Per-product: 2s delay between positionings
 */
import localPool from "../localDb";
import { invokeLLM } from "./llm";
// 2026-07-01 (CJ「跟 riverflow 一樣」): image scraping + name-matching so
// discovered products carry a real imageUrl inside their positioning JSON.
import { scrapeWebsiteImages, matchImageToProduct, type ScrapedImage } from "./websiteImageScraper";

const MAX_PRODUCTS = 50;
const POSITION_DELAY_MS = 2_000;
const MAX_CONCURRENT_JOBS = 2;

// In-process counter for running jobs (resets on restart — DB status handles recovery)
let runningJobs = 0;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a product discovery job for a brand.
 * Called right after brand creation if websiteUrl is known.
 * Idempotent: if a job already exists for this brand (pending/running), skip.
 */
export async function enqueueProductDiscovery(
  brandId: number,
  userId: number,
  websiteUrl: string,
): Promise<void> {
  if (!websiteUrl?.trim()) return;
  try {
    // Check for existing active job
    const [existing]: any = await localPool.execute(
      `SELECT id FROM product_discovery_jobs
       WHERE brandId = ? AND status IN ('pending', 'running') LIMIT 1`,
      [brandId],
    );
    if ((existing as any[]).length > 0) return; // already queued

    await localPool.execute(
      `INSERT INTO product_discovery_jobs (brandId, userId, websiteUrl, status, phase)
       VALUES (?, ?, ?, 'pending', 'crawl')`,
      [brandId, userId, websiteUrl.trim()],
    );
    console.log(`[productDiscovery] Enqueued job for brand ${brandId}: ${websiteUrl}`);
  } catch (e: any) {
    console.error("[productDiscovery] Failed to enqueue job:", e?.message ?? e);
  }
}

/**
 * Get discovery status for a brand (for UI polling).
 * Returns null if no job exists.
 */
export async function getDiscoveryStatus(brandId: number): Promise<{
  status: string;
  phase: string;
  totalFound: number;
  totalPositioned: number;
  currentProduct: string | null;
} | null> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT status, phase, totalFound, totalPositioned, currentProduct
       FROM product_discovery_jobs
       WHERE brandId = ?
       ORDER BY createdAt DESC LIMIT 1`,
      [brandId],
    );
    const row = (rows as any[])[0];
    if (!row) return null;
    return {
      status: row.status,
      phase: row.phase,
      totalFound: Number(row.totalFound ?? 0),
      totalPositioned: Number(row.totalPositioned ?? 0),
      currentProduct: row.currentProduct ?? null,
    };
  } catch { return null; }
}

// ── Worker ────────────────────────────────────────────────────────────────────

/**
 * Process one pending discovery job. Called by the worker loop.
 * Returns true if a job was processed, false if queue was empty.
 */
export async function processNextDiscoveryJob(): Promise<boolean> {
  if (runningJobs >= MAX_CONCURRENT_JOBS) return false;

  // Pick one pending job (FIFO)
  const [rows]: any = await localPool.execute(
    `SELECT id, brandId, userId, websiteUrl
     FROM product_discovery_jobs
     WHERE status = 'pending'
     ORDER BY createdAt ASC LIMIT 1`,
  );
  const job = (rows as any[])[0];
  if (!job) return false;

  // Mark as running
  await localPool.execute(
    `UPDATE product_discovery_jobs
     SET status = 'running', startedAt = NOW(3), phase = 'crawl'
     WHERE id = ? AND status = 'pending'`,
    [job.id],
  );

  runningJobs++;
  runDiscoveryJob(job).finally(() => { runningJobs--; });
  return true;
}

/**
 * Startup recovery: reset any stuck 'running' jobs back to 'pending'
 * so they get reprocessed after a server restart.
 */
export async function recoverStuckDiscoveryJobs(): Promise<void> {
  try {
    const [r]: any = await localPool.execute(
      `UPDATE product_discovery_jobs
       SET status = 'pending', phase = 'crawl'
       WHERE status = 'running'
         AND startedAt < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`,
    );
    const recovered = (r as any).affectedRows ?? 0;
    if (recovered > 0) {
      console.log(`[productDiscovery] Recovered ${recovered} stuck job(s).`);
    }
  } catch (e: any) {
    console.error("[productDiscovery] Recovery failed:", e?.message ?? e);
  }
}

// ── Internal job runner ───────────────────────────────────────────────────────

async function runDiscoveryJob(job: {
  id: number; brandId: number; userId: number; websiteUrl: string;
}): Promise<void> {
  const errors: string[] = [];
  const log = (msg: string) => {
    errors.push(`${new Date().toISOString()} ${msg}`);
    console.warn(`[productDiscovery] job=${job.id}`, msg);
  };

  try {
    // ── Phase 1: Crawl website ──────────────────────────────────────────
    await setPhase(job.id, "crawl");
    const pages = await crawlWebsite(job.websiteUrl).catch((e) => {
      log(`crawl failed: ${e?.message ?? e}`);
      return "";
    });

    // 2026-07-07 (CJ「克服像 lativ 這種的網站」): an empty text crawl used
    // to early-return here — which skipped the image-alt fallback below and
    // left SPA storefronts (client-rendered, tag-stripped text ≈ empty) at
    // 0 products forever. Now we continue: images + alts are usually still
    // server-rendered even when the text shell is empty.
    if (!pages.trim()) {
      log(`crawl returned empty text for ${job.websiteUrl} — relying on image-alt fallback`);
    } else {
      const hasBuy = pages.includes("立即購買");
      log(`crawl OK: ${pages.length} chars, hasBuyPattern=${hasBuy}, sample800: ${pages.slice(0, 800)}`);
    }

    // ── Phase 2: Extract product list ──────────────────────────────────
    await setPhase(job.id, "extract");
    const products = pages.trim()
      ? await extractProducts(pages, job.websiteUrl).catch((e) => {
          log(`extract failed: ${e?.message ?? e}`);
          return [] as Array<{ name: string; description: string; imageUrl?: string }>;
        })
      : [];
    log(`extract result: ${products.length} products found`);

    // 2026-07-07: image scrape hoisted BEFORE the zero-product check —
    // it powers both per-product image matching AND the SPA alt-text
    // fallback below. Failures are non-fatal.
    let scrapedImages: ScrapedImage[] = [];
    try {
      scrapedImages = await scrapeWebsiteImages(job.websiteUrl, 40);
      log(`image scrape OK: ${scrapedImages.length} images`);
    } catch (e: any) {
      log(`image scrape failed (non-fatal): ${e?.message ?? e}`);
    }

    // 2026-07-07 (CJ「克服像 lativ 這種的網站」): SPA fallback. Client-
    // rendered sites (Angular/React storefronts) serve an empty text shell
    // — the LLM text extraction finds 0 products — but their homepage
    // <img> alt texts are real product blurbs (server-rendered for SEO).
    // Turn those alts into product entries, each pre-bound to its image.
    let capped = products.slice(0, MAX_PRODUCTS);
    if (capped.length === 0 && scrapedImages.some((s) => (s.alt ?? "").trim().length >= 4)) {
      log(`text extract empty — trying image-alt fallback (${scrapedImages.length} images)`);
      const fromAlts = await productsFromImageAlts(scrapedImages, log);
      log(`image-alt fallback: ${fromAlts.length} products`);
      capped = fromAlts.slice(0, MAX_PRODUCTS);
    }

    await localPool.execute(
      `UPDATE product_discovery_jobs SET totalFound = ? WHERE id = ?`,
      [capped.length, job.id],
    );

    if (capped.length === 0) {
      errors.push(`extract returned 0 products (pages length: ${pages.length})`);
      await finishJob(job.id, "done", 0, 0, errors);
      return;
    }

    // ── Phase 3: Create product records + run positioning ───────────────
    await setPhase(job.id, "position");
    let positioned = 0;

    for (const p of capped) {
      try {
        await localPool.execute(
          `UPDATE product_discovery_jobs SET currentProduct = ? WHERE id = ?`,
          [p.name.slice(0, 255), job.id],
        );

        // Alt-fallback products carry their image directly; LLM-extracted
        // ones get best-effort matched against the scraped pool.
        const matchedImage = p.imageUrl
          ?? (scrapedImages.length > 0 ? matchImageToProduct(p.name, scrapedImages) : null);

        // Create product record if not already exists
        const slug = toSlug(p.name);
        const [existing]: any = await localPool.execute(
          `SELECT id FROM products WHERE brandId = ? AND slug = ? LIMIT 1`,
          [job.brandId, slug],
        );

        let productId: number;
        if ((existing as any[]).length > 0) {
          productId = (existing as any[])[0].id;
          // Backfill imageUrl on re-scan if the product doesn't have one yet.
          // JSON_SET on NULL-guarded positioning avoids read-modify-write.
          if (matchedImage) {
            await localPool.execute(
              `UPDATE products
                 SET positioning = JSON_SET(COALESCE(positioning, '{}'), '$.imageUrl',
                       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.imageUrl')), ?))
               WHERE id = ?`,
              [matchedImage, productId],
            ).catch((e) => log(`imageUrl backfill failed for "${p.name}": ${e?.message ?? e}`));
          }
        } else {
          const posJson = JSON.stringify({
            description: p.description,
            ...(matchedImage ? { imageUrl: matchedImage } : {}),
          });
          const [ins]: any = await localPool.execute(
            `INSERT INTO products (userId, brandId, slug, name, positioning)
             VALUES (?, ?, ?, ?, ?)`,
            [job.userId, job.brandId, slug, p.name.slice(0, 255), posJson],
          );
          productId = (ins as any).insertId;
        }

        // Run interim positioning (fast, ~10s)
        await runInterimPositioning(productId, job.userId).catch((e) => {
          log(`runInterim failed for "${p.name}": ${e?.message ?? e}`);
        });

        positioned++;
        await localPool.execute(
          `UPDATE product_discovery_jobs SET totalPositioned = ? WHERE id = ?`,
          [positioned, job.id],
        );

        // Polite delay between products
        await sleep(POSITION_DELAY_MS);
      } catch (e: any) {
        log(`product "${p.name}" failed: ${e?.message ?? e}`);
      }
    }

    await finishJob(job.id, "done", capped.length, positioned, errors);
  } catch (e: any) {
    log(`job crashed: ${e?.message ?? e}`);
    await finishJob(job.id, "failed", 0, 0, errors).catch(() => {});
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setPhase(jobId: number, phase: string): Promise<void> {
  await localPool.execute(
    `UPDATE product_discovery_jobs SET phase = ? WHERE id = ?`,
    [phase, jobId],
  );
}

async function finishJob(
  jobId: number,
  status: "done" | "failed",
  totalFound: number,
  totalPositioned: number,
  errors: string[],
): Promise<void> {
  await localPool.execute(
    `UPDATE product_discovery_jobs
     SET status = ?, phase = 'complete', totalFound = ?, totalPositioned = ?,
         currentProduct = NULL, completedAt = NOW(3),
         errorLog = ?
     WHERE id = ?`,
    [
      status,
      totalFound,
      totalPositioned,
      errors.length > 0 ? JSON.stringify(errors.slice(-20)) : null,
      jobId,
    ],
  );
}

async function crawlWebsite(url: string): Promise<string> {
  // Strip common homepage file paths so suffixes attach to the domain root.
  // e.g. https://www.laurel.com.tw/index.php → https://www.laurel.com.tw
  const normalize = (u: string): string => {
    let s = u.trim().replace(/\/$/, "");
    // Strip index files at root
    s = s.replace(/\/(index|default|home)\.(php|html|htm|asp|aspx)$/i, "");
    return s;
  };
  const base = normalize(url);
  const suffixes = [
    "", "/products", "/product", "/menu", "/services", "/service",
    "/shop", "/about", "/品牌產品", "/產品", "/products.html",
  ];
  const chunks: string[] = [];

  for (const suffix of suffixes) {
    try {
      const res = await fetch(`${base}${suffix}`, {
        signal: AbortSignal.timeout(6_000),
        headers: { "User-Agent": "OnBrand/1.0 (brand intelligence crawler)" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      // Strip scripts/styles, keep text content
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")   // remove HTML comments including -->
        .replace(/<[^>]+>/g, " ")
        .replace(/-->/g, " ")               // stray --> from improperly stripped HTML
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4000);  // 4000 per page → faster LLM processing
      if (text.length > 200) chunks.push(`[${base}${suffix}]\n${text}`);
    } catch { /* skip unavailable pages */ }
  }
  return chunks.join("\n\n").slice(0, 12000);  // 12000 total → ~30s LLM response time
}

/**
 * 2026-07-07 (CJ「克服像 lativ 這種的網站」): build product candidates from
 * scraped image alt texts when the text crawl yields nothing (SPA sites).
 * An LLM pass separates real products from campaign banners and distills
 * each blurb into a concise product name; every entry keeps its exact
 * image (index-mapped), so no fuzzy matching is needed downstream.
 * LLM failure falls back to a CJK-heuristic pass — degraded but non-empty.
 */
async function productsFromImageAlts(
  images: ScrapedImage[],
  log: (msg: string) => void,
): Promise<Array<{ name: string; description: string; imageUrl?: string }>> {
  const candidates = images
    .map((img, idx) => ({ idx, alt: (img.alt ?? "").trim(), url: img.url }))
    .filter((c) => c.alt.length >= 4 && c.alt.length <= 80)
    // Drop alts that are just URLs or nav labels
    .filter((c) => !/^https?:\/\//i.test(c.alt))
    .filter((c) => !/^(facebook|instagram|line|youtube|logo|banner|icon)$/i.test(c.alt))
    .slice(0, 25);
  if (candidates.length === 0) return [];

  try {
    const llmCall = invokeLLM({
      provider: "anthropic",
      messages: [{
        role: "user",
        content: `以下是品牌官網圖片的 alt 文字清單（含編號）：

${candidates.map((c) => `${c.idx}. ${c.alt}`).join("\n")}

---

請挑出「描述具體產品」的項目（略過純活動宣傳、節慶 banner、免運廣告等），
把每一項濃縮成產品名稱。輸出 JSON array：
[
  { "idx": 編號, "name": "精簡產品名（2-20 字）", "description": "原 alt 或分類" },
  ...
]
規則：
- name 要像商品名，不要句子（例：「100%純棉，清爽背心，繽紛百搭」→「純棉清爽背心」）
- 拿不準是不是產品就略過
- 只輸出 JSON array`,
      }],
      maxTokens: 2000,
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("productsFromImageAlts LLM timeout after 60s")), 60_000),
    );
    const result = await Promise.race([llmCall, timeout]);
    const text = String((result as any)?.content ?? (result as any)?.text ?? "").trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("no JSON array in alt-fallback LLM response");
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) throw new Error("alt-fallback LLM response is not array");

    const byIdx = new Map(candidates.map((c) => [c.idx, c]));
    const items = parsed
      .filter((p: any) => typeof p?.name === "string" && p.name.trim() && byIdx.has(Number(p?.idx)))
      .map((p: any) => ({
        name: String(p.name).trim().slice(0, 255),
        description: String(p.description ?? "").trim().slice(0, 500) || "產品",
        imageUrl: byIdx.get(Number(p.idx))!.url,
      }));
    if (items.length > 0) return items;
  } catch (e: any) {
    log(`alt-fallback LLM failed, using heuristic: ${e?.message ?? e}`);
  }

  // Heuristic fallback: keep CJK-dominant alts, name = alt trimmed
  return candidates
    .filter((c) => (c.alt.match(/[一-鿿]/g) ?? []).length >= 3)
    .map((c) => ({
      name: c.alt.split(/[，,。!！]/)[0]!.trim().slice(0, 30) || c.alt.slice(0, 30),
      description: c.alt.slice(0, 200),
      imageUrl: c.url,
    }));
}

async function extractProducts(
  pageContent: string,
  websiteUrl: string,
): Promise<Array<{ name: string; description: string; imageUrl?: string }>> {
  // Hard 120-second timeout — Anthropic on large prompts can take 60-90s.
  const llmCall = invokeLLM({
    provider: "anthropic",
    messages: [{
      role: "user",
      content: `以下是品牌官網的內容（來自 ${websiteUrl}）：

${pageContent}

---

請從以上內容找出這個品牌銷售或提供的所有產品、服務或課程。
只要出現產品名稱就列出，description 可以很短或直接用產品分類代替。
最多列出 50 個，格式：
[
  { "name": "產品名稱", "description": "簡短描述或分類（可以只有 2-10 字，例如：冷凍食品、課程、服務等）" },
  ...
]

規則：
- 直接列出產品名稱，不必完整描述
- 不要列出頁面導航連結、公司名稱、版權文字
- 如果完全找不到任何產品或服務名稱，才回傳空 array []
- 只輸出 JSON array，不要其他文字`,
    }],
    maxTokens: 4000,
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("extractProducts LLM timeout after 120s")), 120_000),
  );
  const result = await Promise.race([llmCall, timeout]);

  const text = String((result as any)?.content ?? (result as any)?.text ?? "").trim();
  // Use throw instead of return [] so all non-product paths fall through to regex
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("no JSON array in LLM response");
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) throw new Error("LLM response is not array");
    const items = parsed
      .filter((p: any) => typeof p?.name === "string" && p.name.trim())
      .map((p: any) => ({
        name: String(p.name ?? "").trim().slice(0, 255),
        description: String(p.description ?? "").trim().slice(0, 500),
      }));
    if (items.length > 0) return items;
    // 0 items → fall through to regex
  } catch { /* fall through to regex fallback */ }

  // ── Regex fallback: product names appear AFTER "立即購買" or "產品介紹" ──────
  // On e-commerce pages the pattern is:
  //   "...description~ 立即購買 [ProductName] next-description..."
  //   "產品介紹 [ProductName] description..."
  // The name is the SHORT text immediately AFTER the anchor.
  const afterMatches = [
    ...pageContent.matchAll(
      // product names appear AFTER "立即購買" or "產品介紹" on TW e-commerce sites
      /(?:立即購買|產品介紹)\s+([\S]{2,30})/g,
    ),
  ];
  console.warn(`[productDiscovery] regex afterMatches count=${afterMatches.length}, pageLen=${pageContent.length}`);
  if (afterMatches.length > 0) {
    const names = afterMatches
      .map((m) => (m[1] ?? "").trim())
      // keep only CJK-dominant names (>= 2 Chinese chars), drop nav/date noise
      .filter((name) => (name.match(/[一-鿿]/g) ?? []).length >= 2)
      .filter((name) => name.length >= 2 && name.length <= 30)
      .filter((name, i, arr) => arr.indexOf(name) === i);  // dedupe
    console.warn(`[productDiscovery] regex names after filter=${names.length}: ${names.slice(0,5).join(", ")}`);
    return names.slice(0, MAX_PRODUCTS).map((name) => ({ name, description: "產品" }));
  }
  return [];
}

async function runInterimPositioning(productId: number, userId: number): Promise<void> {
  // Reuse the same generateInterimPulse + loadEntity that positioningJobsRouter.runInterim uses.
  const { generateInterimPulse } = await import("./interimQuickPulse");
  const { default: lPool } = await import("../localDb");
  const [rows]: any = await lPool.execute(
    `SELECT id, name, brandId, positioning FROM products WHERE id = ? AND userId = ? LIMIT 1`,
    [productId, userId],
  );
  const r = (rows as any[])[0];
  if (!r) return;
  await generateInterimPulse({
    userId,
    entityKind: "product",
    entityId: productId,
    brandName: String(r.name ?? ""),
    industry: undefined,
    description: String(r.positioning ? JSON.parse(typeof r.positioning === "string" ? r.positioning : "{}").description ?? "" : ""),
  });
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120)
    || `product-${Date.now()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
