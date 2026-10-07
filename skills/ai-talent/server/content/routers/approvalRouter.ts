/**
 * approvalRouter — 客戶核准連結。
 *
 * 2026-10-07（CJ「排完一篇或選定某個範圍的文章後，可以讓他人點擊連結後提供修改意見或
 * 直接修改，而且每篇文章的修改都有紀錄」；要解的是來回過稿的時間和流程）。
 *
 * 兩種呼叫者：
 *   · 團隊（protectedProcedure）：create／list／revoke。
 *   · 拿到連結的人（publicProcedure）：view／comment／editCaption／decide／restore。
 *     免登入，唯一的憑證是 token。每一支都先用 token 找連結，再確認 itemId 屬於那條連結——
 *     tenantGuard 只掛在 protectedProcedure 上，這裡沒有第二道防線，所以不接受任何
 *     outputId／brandId 之類的直接編號。
 *
 * 團隊成員自己打開連結時（登入中、而且是擁有者或建立者）紀錄記成 team，不用另外填名字。
 *
 * 規則（狀態怎麼變、為什麼客戶核准不等於放行發布）在 core/approval/approvalLink.ts。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure, actorIdOf } from "../../platform/core/trpc";
import { assertApprovalLinkAllowed } from "../../platform/core/billing/planGate";
import { ContentKindSchema, resolveOutputContent } from "../core/engine/outputContentEnvelope";
import {
  APPROVAL_LIMITS, APPROVAL_TOKEN_RE, approvalLinkState, approvalProgress, asDecision, cleanAuthorName,
  createWriteLimiter, eventKindForDecision, newApprovalToken, normalizeApprovalPlatform,
} from "../core/approval/approvalLink";
import {
  approvalPostView, insertApprovalEvent, selectorOf, toIso, writeApprovalCaption,
  type ApprovalAuthor, type ApprovalItemRow,
} from "../core/approval/approvalStore";

const tokenInput = z.string().regex(APPROVAL_TOKEN_RE);
const nameInput = z.string().max(APPROVAL_LIMITS.name).optional();
const writeLimiter = createWriteLimiter();

const GONE = "這條連結已經失效。請向寄給你的人要一條新的。";

async function pool() {
  return (await import("../../localDb")).default;
}

async function linkByToken(token: string) {
  const db = await pool();
  const [rows]: any = await db.execute(
    `SELECT l.id, l.token, l.userId, l.createdBy, l.brandId, l.title, l.note, l.expiresAt, l.revokedAt, l.createdAt,
            b.name AS brandName, b.logoUrl AS brandLogo, u.name AS senderName
       FROM approval_links l
       LEFT JOIN brands b ON b.id = l.brandId
       LEFT JOIN users u ON u.id = l.createdBy
      WHERE l.token = ? LIMIT 1`,
    [token],
  );
  const link = (rows as any[])[0];
  if (!link) throw new TRPCError({ code: "NOT_FOUND", message: GONE });
  return { db, link };
}

/** 登入中的擁有者／建立者＝團隊；其餘一律是客戶，要自己報名字。 */
async function authorFor(db: any, ctx: { user: { id: number } | null }, link: any, rawName: unknown): Promise<ApprovalAuthor> {
  const uid = ctx.user?.id ?? 0;
  if (uid > 0 && (uid === Number(link.userId) || uid === Number(link.createdBy))) {
    const [u]: any = await db.execute(`SELECT name, email FROM users WHERE id = ? LIMIT 1`, [uid]);
    const who = (u as any[])[0];
    return { type: "team", name: String(who?.name || who?.email || "團隊").slice(0, 60), userId: uid };
  }
  const name = cleanAuthorName(rawName);
  if (!name) throw new TRPCError({ code: "BAD_REQUEST", message: "請先留下你的名字，對方才知道是誰的意見。" });
  return { type: "client", name, userId: null };
}

/** 寫入前的共同檢查：連結有效、沒被灌爆、這一篇屬於這條連結。 */
async function openForWrite(token: string, itemId: number) {
  const { db, link } = await linkByToken(token);
  if (approvalLinkState(link) !== "active") throw new TRPCError({ code: "FORBIDDEN", message: GONE });
  if (!writeLimiter.allow(token)) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "操作太頻繁了，稍等幾分鐘再試。" });
  }
  const [cnt]: any = await db.execute(`SELECT COUNT(*) AS n FROM approval_events WHERE linkId = ?`, [link.id]);
  if (Number((cnt as any[])[0]?.n ?? 0) >= APPROVAL_LIMITS.eventsPerLink) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "這條連結的紀錄已達上限。請向寄給你的人要一條新的。" });
  }
  const [rows]: any = await db.execute(
    `SELECT id, linkId, outputId, variantIndex, contentKind, contentIndex, scheduledPostId, decision
       FROM approval_link_items WHERE id = ? AND linkId = ? LIMIT 1`,
    [itemId, link.id],
  );
  const r = (rows as any[])[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這一篇。" });
  const item: ApprovalItemRow = {
    id: Number(r.id), linkId: Number(r.linkId), outputId: Number(r.outputId), variantIndex: Number(r.variantIndex ?? 0),
    contentKind: r.contentKind ?? null, contentIndex: r.contentIndex == null ? null : Number(r.contentIndex),
    scheduledPostId: r.scheduledPostId == null ? null : Number(r.scheduledPostId), decision: String(r.decision ?? "pending"),
  };
  return { db, link, item };
}

const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(",");

export const approvalRouter = router({
  // ── 團隊 ────────────────────────────────────────────────────────────────

  /** 建一條連結。每一篇都要是這個品牌、這位擁有者的產出。 */
  create: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      title: z.string().trim().min(1).max(APPROVAL_LIMITS.title),
      note: z.string().trim().max(APPROVAL_LIMITS.note).optional(),
      expiresInDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(14),
      items: z.array(z.object({
        outputId: z.number().int().positive(),
        variantIndex: z.number().int().min(0).default(0),
        contentKind: ContentKindSchema.optional(),
        contentIndex: z.number().int().min(0).optional(),
        scheduledPostId: z.number().int().positive().optional(),
      })).min(1).max(APPROVAL_LIMITS.itemsPerLink),
    }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = ctx.user.id;
      await assertApprovalLinkAllowed(ownerId);
      const db = await pool();

      const outputIds = [...new Set(input.items.map((i) => i.outputId))];
      const [outs]: any = await db.execute(
        `SELECT o.id, o.content, o.status, m.brandId, m.workspace
           FROM mission_outputs o JOIN missions m ON m.id = o.missionId
          WHERE m.userId = ? AND o.id IN (${placeholders(outputIds.length)})`,
        [ownerId, ...outputIds],
      );
      const outById = new Map<number, any>((outs as any[]).map((o) => [Number(o.id), o]));

      const spIds = [...new Set(input.items.map((i) => i.scheduledPostId).filter((n): n is number => !!n))];
      const spById = new Map<number, any>();
      if (spIds.length > 0) {
        const [sps]: any = await db.execute(
          `SELECT id, outputId, brandId, platform FROM scheduled_posts
            WHERE userId = ? AND id IN (${placeholders(spIds.length)})`,
          [ownerId, ...spIds],
        );
        for (const s of sps as any[]) spById.set(Number(s.id), s);
      }

      const seen = new Set<string>();
      const rows: Array<{ outputId: number; variantIndex: number; contentKind: string | null; contentIndex: number | null; scheduledPostId: number | null; platform: string }> = [];
      for (const it of input.items) {
        const out = outById.get(it.outputId);
        const sp = it.scheduledPostId ? spById.get(it.scheduledPostId) : null;
        const spOk = !!sp && Number(sp.outputId) === it.outputId;
        const inBrand = !!out && (Number(out.brandId) === input.brandId || (spOk && Number(sp.brandId) === input.brandId));
        if (!inBrand) throw new TRPCError({ code: "NOT_FOUND", message: "有一篇找不到，或不屬於這個品牌。請重新選一次。" });
        if (out.status === "published") continue; // 已經發出去的沒有東西可以核准
        // 選到的版本要真的存在（越界會丟 BAD_REQUEST）。
        const resolved = resolveOutputContent(out.content, selectorOf(it));
        const key = `${it.outputId}:${resolved.kind}:${resolved.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          outputId: it.outputId, variantIndex: it.variantIndex,
          contentKind: it.contentKind ?? null, contentIndex: it.contentIndex ?? null,
          scheduledPostId: spOk ? it.scheduledPostId! : null,
          platform: normalizeApprovalPlatform(spOk ? sp.platform : out.workspace),
        });
      }
      if (rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "選到的貼文都已經發布了，沒有需要核准的。" });

      const token = newApprovalToken();
      const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
      const [r]: any = await db.execute(
        `INSERT INTO approval_links (token, userId, createdBy, brandId, title, note, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [token, ownerId, actorIdOf(ctx) || ownerId, input.brandId, input.title, input.note || null, expiresAt],
      );
      const linkId = Number(r?.insertId ?? 0);
      for (const [i, x] of rows.entries()) {
        await db.execute(
          `INSERT INTO approval_link_items (linkId, outputId, variantIndex, contentKind, contentIndex, scheduledPostId, platform, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [linkId, x.outputId, x.variantIndex, x.contentKind, x.contentIndex, x.scheduledPostId, x.platform, i],
        );
      }
      return { id: linkId, token, count: rows.length, expiresAt: expiresAt.toISOString() };
    }),

  /** 這個品牌發出去的連結與進度。每一篇的狀態也帶回去，本週企劃的卡片要標「客戶已核准／要修改」。 */
  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await pool();
      const [links]: any = await db.execute(
        `SELECT id, token, title, note, expiresAt, revokedAt, lastViewedAt, createdAt
           FROM approval_links WHERE userId = ? AND brandId = ?
          ORDER BY id DESC LIMIT 50`,
        [ctx.user.id, input.brandId],
      );
      const ids = (links as any[]).map((l) => Number(l.id));
      if (ids.length === 0) return [];
      const [items]: any = await db.execute(
        `SELECT id, linkId, outputId, variantIndex, scheduledPostId, decision
           FROM approval_link_items WHERE linkId IN (${placeholders(ids.length)}) ORDER BY position`,
        ids,
      );
      const [acts]: any = await db.execute(
        `SELECT linkId, MAX(createdAt) AS at, COUNT(*) AS n FROM approval_events
          WHERE authorType = 'client' AND linkId IN (${placeholders(ids.length)}) GROUP BY linkId`,
        ids,
      );
      const actBy = new Map<number, any>((acts as any[]).map((a) => [Number(a.linkId), a]));
      return (links as any[]).map((l) => {
        const mine = (items as any[]).filter((i) => Number(i.linkId) === Number(l.id));
        const act = actBy.get(Number(l.id));
        return {
          id: Number(l.id), token: String(l.token), title: String(l.title), note: l.note ? String(l.note) : null,
          state: approvalLinkState(l), expiresAt: toIso(l.expiresAt), createdAt: toIso(l.createdAt),
          lastViewedAt: toIso(l.lastViewedAt), lastClientActivityAt: toIso(act?.at), clientEventCount: Number(act?.n ?? 0),
          progress: approvalProgress(mine),
          items: mine.map((i) => ({
            id: Number(i.id), outputId: Number(i.outputId), variantIndex: Number(i.variantIndex ?? 0),
            scheduledPostId: i.scheduledPostId == null ? null : Number(i.scheduledPostId), decision: asDecision(i.decision),
          })),
        };
      });
    }),

  /** 收回連結：客戶那一頭立刻打不開。紀錄留著。 */
  revoke: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await pool();
      const [r]: any = await db.execute(
        `UPDATE approval_links SET revokedAt = NOW(3) WHERE id = ? AND userId = ? AND revokedAt IS NULL`,
        [input.id, ctx.user.id],
      );
      return { ok: Number(r?.affectedRows ?? 0) > 0 };
    }),

  // ── 拿到連結的人（免登入）────────────────────────────────────────────────

  view: publicProcedure
    .input(z.object({ token: tokenInput }))
    .query(async ({ ctx, input }) => {
      const { db, link } = await linkByToken(input.token);
      const state = approvalLinkState(link);
      const uid = ctx.user?.id ?? 0;
      const isTeam = uid > 0 && (uid === Number(link.userId) || uid === Number(link.createdBy));
      const head = {
        state, title: String(link.title), note: link.note ? String(link.note) : null,
        brand: { name: String(link.brandName ?? ""), logoUrl: link.brandLogo ? String(link.brandLogo) : null },
        from: String(link.senderName ?? ""), expiresAt: toIso(link.expiresAt), isTeam,
      };
      if (state !== "active") return { ...head, progress: approvalProgress([]), items: [] };

      const [rows]: any = await db.execute(
        `SELECT i.id, i.outputId, i.variantIndex, i.contentKind, i.contentIndex, i.platform, i.decision, i.decidedBy, i.decidedAt,
                o.content, o.status AS outputStatus, m.title AS missionTitle,
                sp.scheduledAt, sp.status AS spStatus
           FROM approval_link_items i
           LEFT JOIN mission_outputs o ON o.id = i.outputId
           LEFT JOIN missions m ON m.id = o.missionId AND m.userId = ?
           LEFT JOIN scheduled_posts sp ON sp.id = i.scheduledPostId
          WHERE i.linkId = ?
          ORDER BY (sp.scheduledAt IS NULL), sp.scheduledAt, i.position`,
        [link.userId, link.id],
      );
      const [evs]: any = await db.execute(
        `SELECT id, itemId, kind, authorType, authorName, body, beforeText, afterText, createdAt
           FROM approval_events WHERE linkId = ? ORDER BY id`,
        [link.id],
      );
      if (!isTeam) {
        db.execute(`UPDATE approval_links SET lastViewedAt = NOW(3) WHERE id = ?`, [link.id]).catch(() => { /* 不影響讀取 */ });
      }
      const items = (rows as any[]).map((r) => {
        const post = approvalPostView(r.content, selectorOf(r));
        const published = r.outputStatus === "published" || r.spStatus === "published";
        return {
          id: Number(r.id), platform: String(r.platform ?? "other"),
          scheduledAt: r.spStatus === "cancelled" ? null : toIso(r.scheduledAt),
          title: String(r.missionTitle ?? ""),
          ...post,
          published,
          editable: post.available && !published,
          decision: asDecision(r.decision), decidedBy: r.decidedBy ? String(r.decidedBy) : null, decidedAt: toIso(r.decidedAt),
          events: (evs as any[]).filter((e) => Number(e.itemId) === Number(r.id)).map((e) => ({
            id: Number(e.id), kind: String(e.kind), authorType: String(e.authorType), authorName: String(e.authorName),
            body: e.body ? String(e.body) : null,
            beforeText: e.beforeText == null ? null : String(e.beforeText),
            afterText: e.afterText == null ? null : String(e.afterText),
            createdAt: toIso(e.createdAt),
          })),
        };
      });
      return { ...head, progress: approvalProgress(items), items };
    }),

  comment: publicProcedure
    .input(z.object({ token: tokenInput, itemId: z.number().int().positive(), name: nameInput, body: z.string().trim().min(1).max(APPROVAL_LIMITS.comment) }))
    .mutation(async ({ ctx, input }) => {
      const { db, link, item } = await openForWrite(input.token, input.itemId);
      const author = await authorFor(db, ctx, link, input.name);
      const id = await insertApprovalEvent(db, { linkId: item.linkId, itemId: item.id, outputId: item.outputId, kind: "comment", author, body: input.body });
      return { id };
    }),

  /** 直接改文字，立即生效。base＝開始改的那一版，用來擋「兩個人同時改」。 */
  editCaption: publicProcedure
    .input(z.object({
      token: tokenInput, itemId: z.number().int().positive(), name: nameInput,
      caption: z.string().max(APPROVAL_LIMITS.caption),
      base: z.string().max(APPROVAL_LIMITS.caption * 2),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.caption.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "內文不能是空的。想整篇不要，請用「要修改」說明。" });
      const { db, link, item } = await openForWrite(input.token, input.itemId);
      const author = await authorFor(db, ctx, link, input.name);
      return writeApprovalCaption(db, { ownerId: Number(link.userId), item, author, caption: input.caption, base: input.base, kind: "edit" });
    }),

  /** 核准／要修改／重新開啟。要修改一定要寫原因——沒有原因的退件只會再來回一次。 */
  decide: publicProcedure
    .input(z.object({
      token: tokenInput, itemId: z.number().int().positive(), name: nameInput,
      decision: z.enum(["approved", "changes_requested", "pending"]),
      note: z.string().trim().max(APPROVAL_LIMITS.comment).optional(),
    }).refine((v) => v.decision !== "changes_requested" || (v.note ?? "").length >= 2, { message: "請寫下要修改的地方。", path: ["note"] }))
    .mutation(async ({ ctx, input }) => {
      const { db, link, item } = await openForWrite(input.token, input.itemId);
      const author = await authorFor(db, ctx, link, input.name);
      if (asDecision(item.decision) === input.decision && !input.note) return { decision: input.decision, changed: false };
      await db.execute(
        `UPDATE approval_link_items SET decision = ?, decidedBy = ?, decidedAt = ${input.decision === "pending" ? "NULL" : "NOW(3)"} WHERE id = ?`,
        [input.decision, input.decision === "pending" ? null : author.name, item.id],
      );
      await insertApprovalEvent(db, {
        linkId: item.linkId, itemId: item.id, outputId: item.outputId, kind: eventKindForDecision(input.decision), author,
        body: input.note || null,
      });
      return { decision: input.decision, changed: true };
    }),

  /** 還原到某一次修改之前的文字。還原本身也是一筆紀錄，所以還原也能再還原。 */
  restore: publicProcedure
    .input(z.object({ token: tokenInput, itemId: z.number().int().positive(), name: nameInput, eventId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { db, link, item } = await openForWrite(input.token, input.itemId);
      const author = await authorFor(db, ctx, link, input.name);
      const [rows]: any = await db.execute(
        `SELECT beforeText FROM approval_events WHERE id = ? AND itemId = ? AND kind IN ('edit','restore') LIMIT 1`,
        [input.eventId, item.id],
      );
      const before = (rows as any[])[0]?.beforeText;
      if (typeof before !== "string" || !before.trim()) throw new TRPCError({ code: "NOT_FOUND", message: "找不到那一次修改。" });
      return writeApprovalCaption(db, { ownerId: Number(link.userId), item, author, caption: before, kind: "restore" });
    }),
});
