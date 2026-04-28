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
      const conds: string[] = ["userId = ?"];
      const params: any[] = [userId];
      if (input?.brandId)   { conds.push("brandId = ?");   params.push(input.brandId); }
      if (input?.productId) { conds.push("productId = ?"); params.push(input.productId); }
      return rows(
        `SELECT id, slug, name, brandId, productId, startAt, endAt, positioning, createdAt, updatedAt
           FROM events
          WHERE ${conds.join(" AND ")}
          ORDER BY updatedAt DESC`,
        params,
      ).then((r) =>
        r.map((e: any) => ({ ...e, positioning: safeJson(e.positioning) })),
      );
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
      return { ...r, positioning: safeJson(r.positioning) };
    }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      brandId: z.number().nullable().optional(),
      productId: z.number().nullable().optional(),
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
      if (input.id) {
        await localPool.execute(
          `UPDATE events
              SET brandId = ?, productId = ?, slug = ?, name = ?,
                  startAt = ?, endAt = ?, positioning = ?
            WHERE id = ? AND userId = ?`,
          [input.brandId ?? null, input.productId ?? null,
           input.slug, input.name, startAt, endAt, positioningJson,
           input.id, userId],
        );
        return { id: input.id };
      }
      const [r]: any = await localPool.execute(
        `INSERT INTO events (userId, brandId, productId, slug, name, startAt, endAt, positioning)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, input.brandId ?? null, input.productId ?? null,
         input.slug, input.name, startAt, endAt, positioningJson],
      );
      return { id: Number(r?.insertId ?? 0) };
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
   * disambiguate — given a name + optional URLs + description, ask
   * OpenClaw gateway (web_search baked in) to surface 1-3 candidate
   * matches so the user can confirm "是不是同名同姓的別的牌子" before
   * the scope row is created. Returns { candidates[], summary }.
   *
   * Stateless — no DB write. The caller passes the picked candidate
   * back to brand.create / product.upsert / event.upsert.
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
      const GATEWAY_HTTP  = process.env.OPENCLAW_GATEWAY_HTTP  ?? "http://localhost:18790";
      const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? "mos-pm-claw-2026";

      const sys = `你是 SoWork 品牌驗證助手。`
        + `任務：使用者要新增 ${input.kind === "brand" ? "品牌" : input.kind === "product" ? "產品" : "活動"}「${input.name}」。`
        + `請使用 web_search 找出可能的同名候選（最多 3 個），讓使用者確認是否選對。\n\n`
        + `補充資訊：`
        + (input.website     ? `\n- 官網：${input.website}`     : "")
        + (input.facebook    ? `\n- Facebook：${input.facebook}` : "")
        + (input.description ? `\n- 描述：${input.description}`  : "")
        + `\n\n嚴格回傳 JSON：`
        + `\n{"candidates":[{"name":"...","url":"...","description":"50-100 字摘要","confidence":0-100}],"summary":"找到 N 個候選..."}`
        + `\n如果使用者已提供官網 / Facebook，第一個候選應該就是該來源。`
        + `\nconfidence 越高表示越像同一個 ${input.kind === "brand" ? "品牌" : input.kind}。`
        + `\n語言：繁體中文（zh-TW）。`;

      const user = `請幫我找出「${input.name}」的可能候選，特別注意是否有同名的不同品牌（例如 sowork.tw vs sowork.com）。`;

      let raw = "";
      try {
        const resp = await fetch(`${GATEWAY_HTTP}/v1/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${GATEWAY_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openclaw/pm",
            messages: [
              { role: "system", content: sys },
              { role: "user",   content: user },
            ],
            stream: false,
          }),
          signal: AbortSignal.timeout(120_000),
        });
        if (resp.ok) {
          const data: any = await resp.json();
          raw = data?.choices?.[0]?.message?.content ?? "";
        }
      } catch {
        // gateway unavailable — fall back to empty result
      }

      // Parse JSON response (strip markdown fences)
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      let parsed: any = { candidates: [], summary: "" };
      try { parsed = JSON.parse(cleaned); } catch { /* ignore */ }

      const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates.slice(0, 3).map((c: any) => ({
        name: String(c?.name ?? ""),
        url: String(c?.url ?? ""),
        description: String(c?.description ?? "").slice(0, 400),
        confidence: Math.max(0, Math.min(100, Number(c?.confidence ?? 0))),
      })) : [];

      return {
        candidates,
        summary: String(parsed?.summary ?? "（系統無回應，可直接以你輸入的資料建立）"),
      };
    }),

  /** Pick lists for the top-right ScopeBar (brands/products/events the user owns). */
  options: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id;
    const [b, p, e] = await Promise.all([
      rows(`SELECT id, name FROM brands   WHERE userId = ? ORDER BY name ASC`, [userId]),
      rows(`SELECT id, name, brandId FROM products WHERE userId = ? ORDER BY name ASC`, [userId]),
      rows(`SELECT id, name, brandId, productId FROM events WHERE userId = ? ORDER BY name ASC`, [userId]),
    ]);
    return { brands: b, products: p, events: e };
  }),
});
