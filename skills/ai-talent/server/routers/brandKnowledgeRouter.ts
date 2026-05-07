/**
 * brandKnowledgeRouter — CRUD for brand_knowledge_items.
 *
 * NotebookLM-style: user uploads successful posts / external references.
 * Cap: 50 items × 8K chars per item = ~400K chars total per brand
 * (within Claude 200K context × 2). Items are injected as additional
 * context into Theater + 30s/60s/100s prompts (separate wiring).
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import localPool from "../localDb";

const MAX_ITEMS_PER_BRAND = 50;
const MAX_BODY_CHARS = 8_000;

export const brandKnowledgeRouter = router({
  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      try {
        const [rows]: any = await localPool.execute(
          `SELECT id, kind, title, body, sourceUrl, tags, createdAt, updatedAt
             FROM brand_knowledge_items
            WHERE userId = ? AND brandId = ?
            ORDER BY createdAt DESC`,
          [userId, input.brandId],
        );
        return (rows as any[]).map(r => ({
          id: Number(r.id),
          kind: String(r.kind),
          title: String(r.title),
          body: r.body ?? "",
          sourceUrl: r.sourceUrl ?? null,
          tags: r.tags ? (typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags) : [],
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
        }));
      } catch { return []; }
    }),

  create: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      kind: z.enum(["reference", "winning_post", "competitor", "voice_sample", "note"]).default("reference"),
      title: z.string().min(1).max(255),
      body: z.string().max(MAX_BODY_CHARS).optional(),
      sourceUrl: z.string().url().max(1024).optional(),
      tags: z.array(z.string()).max(20).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      // Cap check
      const [cnt]: any = await localPool.execute(
        `SELECT COUNT(*) AS n FROM brand_knowledge_items WHERE userId = ? AND brandId = ?`,
        [userId, input.brandId],
      );
      const n = Number((cnt as any[])[0]?.n ?? 0);
      if (n >= MAX_ITEMS_PER_BRAND) {
        return { ok: false as const, error: `已達上限（${MAX_ITEMS_PER_BRAND} 條）— 請先刪除舊條目` };
      }
      const [r]: any = await localPool.execute(
        `INSERT INTO brand_knowledge_items (userId, brandId, kind, title, body, sourceUrl, tags)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, input.brandId, input.kind, input.title, input.body ?? null, input.sourceUrl ?? null, JSON.stringify(input.tags)],
      );
      return { ok: true as const, id: Number(r?.insertId ?? 0) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      title: z.string().min(1).max(255).optional(),
      body: z.string().max(MAX_BODY_CHARS).optional(),
      sourceUrl: z.string().url().max(1024).optional(),
      tags: z.array(z.string()).max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const sets: string[] = [];
      const params: any[] = [];
      if (input.title     !== undefined) { sets.push("title = ?");     params.push(input.title); }
      if (input.body      !== undefined) { sets.push("body = ?");      params.push(input.body); }
      if (input.sourceUrl !== undefined) { sets.push("sourceUrl = ?"); params.push(input.sourceUrl); }
      if (input.tags      !== undefined) { sets.push("tags = ?");      params.push(JSON.stringify(input.tags)); }
      if (!sets.length) return { ok: true };
      params.push(input.id, userId);
      await localPool.execute(
        `UPDATE brand_knowledge_items SET ${sets.join(", ")} WHERE id = ? AND userId = ?`,
        params,
      );
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await localPool.execute(
        `DELETE FROM brand_knowledge_items WHERE id = ? AND userId = ?`,
        [input.id, userId],
      );
      return { ok: true };
    }),
});

/**
 * Helper: pull all knowledge items for a brand and format for LLM injection.
 * Used by Theater / 30s / 60s / 100s prompt builders. Cuts at total char
 * budget (default 80K — leaves room for positioning + brand context).
 *
 * No userId filter: items were created with userId scoping at write time;
 * read-time injection trusts the brand context (orchestra is already
 * gated by brand ownership upstream).
 */
export async function loadBrandKnowledgeForPrompt(
  brandId: number,
  budgetChars = 80_000,
): Promise<string> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT title, body, sourceUrl FROM brand_knowledge_items
        WHERE brandId = ?
        ORDER BY createdAt DESC LIMIT ?`,
      [brandId, MAX_ITEMS_PER_BRAND],
    );
    const items = rows as any[];
    if (!items.length) return "";
    const blocks: string[] = [];
    let used = 0;
    for (const it of items) {
      const block = `── ${it.title} ──\n${(it.body ?? "").slice(0, MAX_BODY_CHARS)}${it.sourceUrl ? `\n[來源] ${it.sourceUrl}` : ""}\n`;
      if (used + block.length > budgetChars) break;
      blocks.push(block);
      used += block.length;
    }
    return `\n\n【品牌知識庫（user-uploaded reference）— 產出時請參考語氣 / 結構 / 案例】\n${blocks.join("\n")}`;
  } catch {
    return "";
  }
}
