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
