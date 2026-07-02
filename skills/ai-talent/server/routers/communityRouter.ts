/**
 * communityRouter — personal template library + community marketplace.
 *
 * 2026-05-11 (CJ「回到原始目的 — 讓人收集自己互動好的模板。我的（官方
 * squads）就不用顯示了。」).
 *
 * ─── 重新框架：個人收藏為主，社群分享為輔 ──────────────────
 *
 * 用戶心智模型：
 *   1. 我跑出一篇成功貼文 → 一鍵存為「我的模板」（私人）
 *   2. 想分享給其他人 → 同一個模板再設為「公開」
 *   3. 在 /community 看到別人公開的範本 → 可參考 / 收藏
 *
 * 三個視圖：
 *   - my-private: 我存下、沒公開的（個人收藏）
 *   - my-public:  我貢獻給社群的
 *   - community:  別人公開的（不含我自己；不含 admin-seeded squads）
 *
 * Squads 是平台基礎建設（admin-curated 711 個方法論），跟用戶 UGC 範本
 * 是不同物件，**不放在同一個 gallery**。Squads 仍透過 /picker / 99s
 * tier 使用，跟這個 community 系統解耦。
 *
 * Reward model (個人收藏不給 credits；只有當別人用「你公開的」範本時):
 *   - 別人用你的公開範本一次 → +CREDITS_PER_USE credits
 *   - 每日上限 DAILY_CONTRIB_CAP，防自己 farm 自己
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { normalizeTaskId, normalizeTier } from "../_core/tierCompat";

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
      // 100s→99s rename (2026-05-17): still accept legacy "100s" input.
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
          // 100s→99s rename: persist the normalized id/tier for new shares.
          input.tier ? normalizeTier(input.tier) : null,
          input.platform ?? null,
          input.taskId ? normalizeTaskId(input.taskId) : null,
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
   * Community gallery — public templates from OTHER users only.
   * Admin-seeded squads NOT included (separate system; access via /picker).
   *
   * Excludes the calling user's own templates so the gallery feels like
   * "what others made". Use myList to see your own private + public.
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
    }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const where: string[] = ["t.visibility = 'public'", "t.status = 'active'"];
      const params: any[] = [];
      // Exclude calling user's own contributions from the community feed.
      if (ctx?.user?.id) {
        where.push("t.authorUserId <> ?");
        params.push(ctx.user.id);
      }
      if (input.kind)     { where.push("t.kind = ?");     params.push(input.kind); }
      if (input.tier)     { where.push("t.tier = ?");     params.push(normalizeTier(input.tier)); }
      if (input.platform) { where.push("t.platform = ?"); params.push(input.platform); }
      if (input.featuredOnly) where.push("t.featured = 1");
      if (input.search) {
        where.push("(t.title LIKE ? OR t.description LIKE ? OR t.previewText LIKE ?)");
        const q = `%${input.search}%`;
        params.push(q, q, q);
      }
      const orderBy = input.sort === "newest" ? "t.createdAt DESC"
        : input.sort === "most-used" ? "t.useCount DESC, t.createdAt DESC"
        : input.sort === "most-liked" ? "t.likeCount DESC, t.createdAt DESC"
        : "trendingScore DESC, t.useCount DESC, t.createdAt DESC";

      const selectTrending = input.sort === "trending"
        ? `(SELECT COUNT(*) FROM community_template_uses u WHERE u.templateId = t.id AND u.usedAt > NOW() - INTERVAL 7 DAY) AS trendingScore,`
        : "";

      // 2026-05-10: LIMIT ? + OFFSET ? as prepared params trip MySQL.
      const safeLimit = Math.max(1, Math.min(200, Number(input.limit) || 50));
      const safeOffset = Math.max(0, Math.min(100000, Number(input.cursor) || 0));
      const [rows]: any = await localPool.execute(
        `SELECT
            'template' AS source,
            t.id, t.authorUserId, t.title, t.description, t.kind, t.tier,
            t.platform, t.taskId, t.tags, t.previewText, t.previewImageUrl,
            t.featured, t.useCount, t.likeCount, t.createdAt,
            ${selectTrending}
            u.name AS authorName
          FROM community_templates t
          LEFT JOIN users u ON u.id = t.authorUserId
          WHERE ${where.join(" AND ")}
          ORDER BY ${orderBy}
          LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params,
      );
      return (rows as any[]).map((r) => ({ ...r, tags: parseJsonSafe(r.tags) }));
    }),

  /**
   * Personal library — calling user's own templates.
   *   filter="all" | "private" | "public"
   * 2026-05-11 — CJ's clarified primary use case: "讓人收集自己互動好的
   * 模板". This is the user's private successful-output collection.
   */
  myList: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(100),
      filter: z.enum(["all", "private", "public"]).default("all"),
      sort: z.enum(["newest", "most-used"]).default("newest"),
    }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const where = ["t.authorUserId = ?", "t.status = 'active'"];
      const params: any[] = [ctx.user.id];
      if (input.filter === "private") {
        where.push("t.visibility <> 'public'");
      } else if (input.filter === "public") {
        where.push("t.visibility = 'public'");
      }
      const orderBy = input.sort === "most-used"
        ? "t.useCount DESC, t.createdAt DESC"
        : "t.createdAt DESC";
      const safeLimit = Math.max(1, Math.min(200, Number(input.limit) || 100));
      const [rows]: any = await localPool.execute(
        `SELECT
            'template' AS source,
            t.id, t.authorUserId, t.title, t.description, t.kind, t.tier,
            t.platform, t.taskId, t.tags, t.previewText, t.previewImageUrl,
            t.visibility, t.featured, t.useCount, t.likeCount, t.creditsEarned,
            t.createdAt, t.sourceOutputId
          FROM community_templates t
          WHERE ${where.join(" AND ")}
          ORDER BY ${orderBy}
          LIMIT ${safeLimit}`,
        params,
      );
      return (rows as any[]).map((r) => ({ ...r, tags: parseJsonSafe(r.tags) }));
    }),

  /** Single template detail (includes content body so user can preview / use). */
  detail: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      // 2026-06-28 (security scan): do NOT select u.email here — this is a
      // publicProcedure and the result is spread ({...t}) to the client, which
      // leaked author emails to unauthenticated callers. Only authorName is
      // shown in the UI.
      const [rows]: any = await localPool.execute(
        `SELECT t.*, u.name AS authorName
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
      const safeLimit = Math.max(1, Math.min(100, Number(input?.limit) || 50));
      const [rows]: any = await localPool.execute(
        `SELECT id, title, kind, tier, platform, visibility, featured,
                useCount, likeCount, creditsEarned, status, createdAt
         FROM community_templates
         WHERE authorUserId = ?
         ORDER BY id DESC LIMIT ${safeLimit}`,
        [ctx.user.id],
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
