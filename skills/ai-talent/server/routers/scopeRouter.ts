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
import { router, protectedProcedure } from "../_core/trpc";
import localPool from "../localDb";
import { callLLM } from "../_core/llmRouter";

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

// ── product router ─────────────────────────────────────────────────────────
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
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "product not found" });
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
      const positioningJson = input.positioning != null
        ? JSON.stringify(input.positioning)
        : null;
      if (input.id) {
        await localPool.execute(
          `UPDATE products SET brandId = ?, slug = ?, name = ?, positioning = ?
            WHERE id = ? AND userId = ?`,
          [input.brandId ?? null, input.slug, input.name, positioningJson, input.id, userId],
        );
        return { id: input.id };
      }
      const [r]: any = await localPool.execute(
        `INSERT INTO products (userId, brandId, slug, name, positioning)
              VALUES (?, ?, ?, ?, ?)`,
        [userId, input.brandId ?? null, input.slug, input.name, positioningJson],
      );
      return { id: Number(r?.insertId ?? 0) };
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
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "event not found" });
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
          const resp = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: AbortSignal.timeout(15_000),
            headers: { "User-Agent": "Mozilla/5.0 SoWork-MarketingOS-Verifier/1.0" },
          });
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
