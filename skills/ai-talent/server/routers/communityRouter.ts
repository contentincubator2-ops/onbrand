/**
 * communityRouter — Spotify-style template marketplace.
 *
 * 2026-05-11 (CJ「Spotify 模式，大家貢獻範本」+ 「你要考慮採用 mos_db 裡面
 * 的 squad 嗎？」).
 *
 * ─── ARCHITECTURE — DUAL-SOURCE GALLERY ─────────────────────────
 * Per the team memory rule "squads is single source", the canonical
 * store for methodology-shaped templates (multi-agent + multi-step
 * workflows) is the `squads` table. We DO NOT duplicate that shape.
 *
 * The gallery surfaces TWO underlying tables in a single UNION view:
 *
 *   1. `squads`              (heavyweight — full methodology + team)
 *      - User publishes their successful squad run as a reusable
 *        methodology. Marked is_user_contributed via
 *        squads.source != 'seeded' AND squads.created_by_user_id IS NOT NULL.
 *      - Reuses existing squad pipeline + squad search embeddings.
 *      - 99s campaign / multi-step deliverables go here.
 *
 *   2. `community_templates` (lightweight — single caption / snippet)
 *      - User publishes a single-post caption pattern or prompt tweak.
 *      - Too small to justify a full squads row.
 *      - 30s / 60s individual posts go here.
 *
 * Both tables share the SAME social columns:
 *   visibility, useCount, likeCount, creditsEarned, featured
 * so `list` can UNION them with consistent ordering / filtering.
 * Their respective like / use tables share the same shape too:
 *   community_template_likes / community_template_uses
 *   squad_likes              / squad_uses
 *
 * Reward model (v1, identical on both):
 *   - Every successful "use" of your template/squad = +CREDITS_PER_USE credits
 *   - Capped per-author/day (DAILY_CONTRIB_CAP) so no self-farming
 *   - Future: convert credits → cash via 綠界 payout when ARR > $50k/mo
 *
 * Curation:
 *   - `visibility = public` shows in the gallery
 *   - `featured = 1` (admin sets, distinct from is_approved) bumps to top
 *   - default sort = trending (uses in last 7 days)
 *
 * Templates / squads are brand-context-agnostic on publish — we strip
 * the brand-specific Voice / WHY / forbidden-word fields. When another
 * user uses the template we re-apply THEIR brand context via the
 * existing taskContextResolver.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";

const CREDITS_PER_USE = 2;       // contributor reward per successful use
const DAILY_CONTRIB_CAP = 50;    // max credits an author can earn / day

const TemplateKind = z.enum(["caption", "campaign", "positioning", "prompt"]);
const Visibility = z.enum(["public", "unlisted", "private"]);

export const communityRouter = router({
  /**
   * Publish a template to the marketplace. Author = the calling user.
   * If `sourceOutputId` is provided, we verify the user owns that output
   * before linking it.
   */
  publishTemplate: protectedProcedure
    .input(z.object({
      title: z.string().min(2).max(160),
      description: z.string().max(2000).optional(),
      kind: TemplateKind,
      tier: z.enum(["30s", "60s", "99s", "100s"]).optional(),
      platform: z.string().max(24).optional(),
      taskId: z.string().max(64).optional(),
      tags: z.array(z.string().max(32)).max(10).optional(),
      content: z.any(), // shape varies by kind; validated downstream
      previewText: z.string().max(500).optional(),
      previewImageUrl: z.string().url().max(500).optional(),
      sourceOutputId: z.number().int().positive().optional(),
      visibility: Visibility.default("public"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");

      // Verify ownership of the source output (if provided) so users can't
      // republish someone else's work as their own.
      if (input.sourceOutputId) {
        const [rows]: any = await localPool.execute(
          `SELECT o.id FROM mission_outputs o
           JOIN missions m ON m.id = o.missionId
           WHERE o.id = ? AND m.userId = ? LIMIT 1`,
          [input.sourceOutputId, ctx.user.id],
        );
        if (!(rows as any[])[0]) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "你只能把自己跑出來的產出公開為模板",
          });
        }
      }

      const [r]: any = await localPool.execute(
        `INSERT INTO community_templates
           (authorUserId, sourceOutputId, title, description, kind, tier,
            platform, taskId, tags, content, previewText, previewImageUrl, visibility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ctx.user.id,
          input.sourceOutputId ?? null,
          input.title,
          input.description ?? null,
          input.kind,
          input.tier ?? null,
          input.platform ?? null,
          input.taskId ?? null,
          input.tags ? JSON.stringify(input.tags) : null,
          JSON.stringify(input.content),
          input.previewText ?? null,
          input.previewImageUrl ?? null,
          input.visibility,
        ],
      );
      return { ok: true, id: (r as any).insertId as number };
    }),

  /**
   * Update / unpublish your own template. Admins can edit anyone's.
   */
  updateTemplate: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      title: z.string().min(2).max(160).optional(),
      description: z.string().max(2000).optional(),
      tags: z.array(z.string().max(32)).max(10).optional(),
      visibility: Visibility.optional(),
      status: z.enum(["active", "hidden"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      // Check ownership (or admin)
      const [rows]: any = await localPool.execute(
        `SELECT authorUserId FROM community_templates WHERE id = ? LIMIT 1`,
        [input.id],
      );
      const t = (rows as any[])[0];
      if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      const [userRows]: any = await localPool.execute(`SELECT role FROM users WHERE id = ?`, [ctx.user.id]);
      const isAdmin = (userRows as any[])[0]?.role === "admin";
      if (t.authorUserId !== ctx.user.id && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能編輯自己發布的模板" });
      }

      const sets: string[] = [];
      const vals: any[] = [];
      if (input.title       !== undefined) { sets.push("title = ?");       vals.push(input.title); }
      if (input.description !== undefined) { sets.push("description = ?"); vals.push(input.description); }
      if (input.tags        !== undefined) { sets.push("tags = ?");        vals.push(JSON.stringify(input.tags)); }
      if (input.visibility  !== undefined) { sets.push("visibility = ?");  vals.push(input.visibility); }
      if (input.status      !== undefined) { sets.push("status = ?");      vals.push(input.status); }
      if (sets.length === 0) return { ok: true, affected: 0 };

      vals.push(input.id);
      const [r]: any = await localPool.execute(
        `UPDATE community_templates SET ${sets.join(", ")} WHERE id = ?`,
        vals,
      );
      return { ok: true, affected: (r as any).affectedRows ?? 0 };
    }),

  /**
   * List public templates AND user-contributed squads in a single
   * unified feed. The gallery doesn't distinguish — users see both as
   * "範本" — but the underlying row carries `source` ("template" |
   * "squad") so the use/like routers know which table to write to.
   *
   * sort = "trending" (default, 7d uses)
   *      | "newest"
   *      | "most-used"
   *      | "most-liked"
   */
  list: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(40),
      cursor: z.number().int().min(0).default(0),
      sort: z.enum(["trending", "newest", "most-used", "most-liked"]).default("trending"),
      kind: TemplateKind.optional(),
      tier: z.string().optional(),
      platform: z.string().optional(),
      search: z.string().max(120).optional(),
      featuredOnly: z.boolean().default(false),
      /** "all" (default), "template" (lightweight only), "squad" (heavy only). */
      source: z.enum(["all", "template", "squad"]).default("all"),
    }))
    .query(async ({ input }) => {
      const { default: localPool } = await import("../localDb");

      // ─── community_templates query ─────────────────────────────
      const ctRows: any[] = await (async () => {
        if (input.source === "squad") return [];
        const where: string[] = ["t.visibility = 'public'", "t.status = 'active'"];
        const params: any[] = [];
        if (input.kind)     { where.push("t.kind = ?");     params.push(input.kind); }
        if (input.tier)     { where.push("t.tier = ?");     params.push(input.tier); }
        if (input.platform) { where.push("t.platform = ?"); params.push(input.platform); }
        if (input.featuredOnly) where.push("t.featured = 1");
        if (input.search) {
          where.push("(t.title LIKE ? OR t.description LIKE ? OR t.previewText LIKE ?)");
          const q = `%${input.search}%`;
          params.push(q, q, q);
        }
        params.push(input.limit);
        const [r]: any = await localPool.execute(
          `SELECT
              'template' AS source,
              t.id, t.authorUserId, t.title, t.description, t.kind, t.tier,
              t.platform, t.taskId, t.tags, t.previewText, t.previewImageUrl,
              t.featured, t.useCount, t.likeCount, t.createdAt,
              u.name AS authorName,
              (SELECT COUNT(*) FROM community_template_uses cu WHERE cu.templateId = t.id AND cu.usedAt > NOW() - INTERVAL 7 DAY) AS trendingScore
            FROM community_templates t
            LEFT JOIN users u ON u.id = t.authorUserId
            WHERE ${where.join(" AND ")}
            ORDER BY t.id DESC
            LIMIT ?`,
          params,
        );
        return (r as any[]).map((x) => ({ ...x, tags: parseJsonSafe(x.tags) }));
      })();

      // ─── squads query (user-contributed only by default) ─────────
      // We include both user-contributed squads AND admin-approved
      // seed squads marked visibility=public so the gallery feels
      // populated even before user UGC arrives. Seed squads simply
      // have authorUserId = NULL.
      const squadRows: any[] = await (async () => {
        if (input.source === "template") return [];
        const where: string[] = ["s.visibility = 'public'", "s.is_approved = 1"];
        const params: any[] = [];
        if (input.tier)     { where.push("s.tier = ?");      params.push(input.tier); }
        if (input.platform) { where.push("s.workspace = ?"); params.push(input.platform); }
        if (input.featuredOnly) where.push("s.featured = 1");
        if (input.search) {
          where.push("(s.name LIKE ? OR s.description LIKE ? OR s.methodology LIKE ?)");
          const q = `%${input.search}%`;
          params.push(q, q, q);
        }
        params.push(input.limit);
        const [r]: any = await localPool.execute(
          `SELECT
              'squad' AS source,
              s.id, s.created_by_user_id AS authorUserId,
              s.name AS title, s.description, 'campaign' AS kind, s.tier,
              s.workspace AS platform, NULL AS taskId, s.tags,
              s.description AS previewText, s.hero_image_url AS previewImageUrl,
              s.featured, s.useCount, s.likeCount, s.created_at AS createdAt,
              u.name AS authorName,
              (SELECT COUNT(*) FROM squad_uses su WHERE su.squadId = s.id AND su.usedAt > NOW() - INTERVAL 7 DAY) AS trendingScore
            FROM squads s
            LEFT JOIN users u ON u.id = s.created_by_user_id
            WHERE ${where.join(" AND ")}
            ORDER BY s.id DESC
            LIMIT ?`,
          params,
        );
        return (r as any[]).map((x) => ({ ...x, tags: parseJsonSafe(x.tags) }));
      })();

      // ─── Merge + sort + slice ──────────────────────────────────
      const all = [...ctRows, ...squadRows];
      const sortFn =
        input.sort === "newest"     ? (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      : input.sort === "most-used"  ? (a: any, b: any) => (b.useCount ?? 0) - (a.useCount ?? 0)
      : input.sort === "most-liked" ? (a: any, b: any) => (b.likeCount ?? 0) - (a.likeCount ?? 0)
      :                               (a: any, b: any) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0)
                                                       || (b.useCount ?? 0) - (a.useCount ?? 0);
      all.sort(sortFn);

      // Featured items still float to the top within their sort tier.
      const featured = all.filter((x) => x.featured);
      const normal = all.filter((x) => !x.featured);
      const sliced = [...featured, ...normal].slice(input.cursor, input.cursor + input.limit);
      return sliced;
    }),

  /** Single template detail (includes content body so user can preview / use). */
  detail: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT t.*, u.name AS authorName, u.email AS authorEmail
         FROM community_templates t
         LEFT JOIN users u ON u.id = t.authorUserId
         WHERE t.id = ? AND t.status = 'active' LIMIT 1`,
        [input.id],
      );
      const t = (rows as any[])[0];
      if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "找不到此模板" });
      // Unlisted / private: only author + admin can view detail.
      if (t.visibility !== "public") {
        const myId = ctx?.user?.id ?? 0;
        const [u]: any = await localPool.execute(`SELECT role FROM users WHERE id = ?`, [myId]);
        const isAdmin = (u as any[])[0]?.role === "admin";
        if (t.authorUserId !== myId && !isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "此模板非公開" });
        }
      }
      // Has the calling user liked this?
      let likedByMe = false;
      if (ctx?.user?.id) {
        const [lr]: any = await localPool.execute(
          `SELECT 1 FROM community_template_likes WHERE templateId = ? AND userId = ? LIMIT 1`,
          [t.id, ctx.user.id],
        );
        likedByMe = !!(lr as any[])[0];
      }
      return {
        ...t,
        tags: parseJsonSafe(t.tags),
        content: parseJsonSafe(t.content),
        likedByMe,
      };
    }),

  /**
   * Record a "use" of a template. Caller already kicked off / completed
   * their task; this just logs attribution + awards credits to the author.
   * resultOutputId can be passed once known.
   *
   * Credits awarded only if:
   *   - author != caller (no self-farming)
   *   - author has < DAILY_CONTRIB_CAP credits earned in last 24h
   */
  recordUse: protectedProcedure
    .input(z.object({
      templateId: z.number().int().positive(),
      resultOutputId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [trows]: any = await localPool.execute(
        `SELECT id, authorUserId FROM community_templates WHERE id = ? AND status = 'active' LIMIT 1`,
        [input.templateId],
      );
      const tpl = (trows as any[])[0];
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND", message: "模板不存在" });

      let creditsAwarded = 0;
      if (tpl.authorUserId !== ctx.user.id) {
        // Check daily cap on author's earnings (anti-farm)
        const [capRows]: any = await localPool.execute(
          `SELECT COALESCE(SUM(creditsAwarded), 0) AS earned
           FROM community_template_uses u
           JOIN community_templates t ON t.id = u.templateId
           WHERE t.authorUserId = ?
             AND u.usedAt > NOW() - INTERVAL 24 HOUR`,
          [tpl.authorUserId],
        );
        const earned = Number((capRows as any[])[0]?.earned ?? 0);
        if (earned < DAILY_CONTRIB_CAP) {
          creditsAwarded = Math.min(CREDITS_PER_USE, DAILY_CONTRIB_CAP - earned);
        }
      }

      // Insert use log
      await localPool.execute(
        `INSERT INTO community_template_uses (templateId, userId, resultOutputId, creditsAwarded)
         VALUES (?, ?, ?, ?)`,
        [input.templateId, ctx.user.id, input.resultOutputId ?? null, creditsAwarded],
      );
      // Bump useCount + creditsEarned on template
      await localPool.execute(
        `UPDATE community_templates
         SET useCount = useCount + 1, creditsEarned = creditsEarned + ?
         WHERE id = ?`,
        [creditsAwarded, input.templateId],
      );
      // Pay the author
      if (creditsAwarded > 0) {
        await localPool.execute(
          `UPDATE users SET credits = credits + ? WHERE id = ?`,
          [creditsAwarded, tpl.authorUserId],
        );
      }
      return { ok: true, creditsAwarded };
    }),

  /** Toggle like / unlike */
  toggleLike: protectedProcedure
    .input(z.object({ templateId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [lr]: any = await localPool.execute(
        `SELECT 1 FROM community_template_likes WHERE templateId = ? AND userId = ? LIMIT 1`,
        [input.templateId, ctx.user.id],
      );
      const liked = !!(lr as any[])[0];
      if (liked) {
        await localPool.execute(
          `DELETE FROM community_template_likes WHERE templateId = ? AND userId = ?`,
          [input.templateId, ctx.user.id],
        );
        await localPool.execute(
          `UPDATE community_templates SET likeCount = GREATEST(likeCount - 1, 0) WHERE id = ?`,
          [input.templateId],
        );
        return { ok: true, liked: false };
      } else {
        await localPool.execute(
          `INSERT INTO community_template_likes (templateId, userId) VALUES (?, ?)`,
          [input.templateId, ctx.user.id],
        );
        await localPool.execute(
          `UPDATE community_templates SET likeCount = likeCount + 1 WHERE id = ?`,
          [input.templateId],
        );
        return { ok: true, liked: true };
      }
    }),

  /** Author's own templates (private dashboard). */
  myTemplates: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT id, title, kind, tier, platform, visibility, featured,
                useCount, likeCount, creditsEarned, status, createdAt
         FROM community_templates
         WHERE authorUserId = ?
         ORDER BY id DESC LIMIT ?`,
        [ctx.user.id, input?.limit ?? 50],
      );
      return rows;
    }),

  /** Admin: feature / unfeature a template (curation). */
  setFeatured: adminProcedure
    .input(z.object({ id: z.number().int().positive(), featured: z.boolean() }))
    .mutation(async ({ input }) => {
      const { default: localPool } = await import("../localDb");
      await (await import("../localDb")).default.execute(
        `UPDATE community_templates SET featured = ? WHERE id = ?`,
        [input.featured ? 1 : 0, input.id],
      );
      return { ok: true };
    }),
});

function parseJsonSafe(s: any): any {
  if (s == null) return null;
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return null; }
}
