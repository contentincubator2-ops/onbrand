import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { missionOutputs } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { normalizeTaskId, normalizeTier } from "../_core/tierCompat";
import {
  contentSelectorFields,
  outputItemCaption,
  requirePlanningConfirmation,
  resolveOutputContent,
  updateOutputContent,
} from "../_core/outputContentEnvelope";
import { applyVariantImageUpdate } from "../_core/variantImageUpdate";

/** Escape HTML special characters to prevent stored XSS in previewHtml */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * 2026-05-18 (CJ「整個系統還有哪些地方會遇到 taskId 沒被持久化」):
 * taskId resolution used to rely solely on metadata.taskId, so any
 * legacy row / path that didn't persist it showed "no-task" → wrong
 * mockup format, missing CraftChip, broken hold logic, blank history.
 * ensureMission ALWAYS writes "[task:<id>]" into the mission description
 * (missions has no taskId column), so that tag is the reliable
 * system-wide fallback. Use it everywhere taskId is read.
 */
function taskIdFromDescription(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const m = /\[task:([^\]]+)\]/.exec(desc);
  return m?.[1]?.trim() ?? null;
}

const PLATFORM_PREVIEW_TEMPLATES: Record<string, (content: string, title?: string) => string> = {
  facebook: (content, title) => `<div style="font-family:Helvetica,Arial,sans-serif;max-width:500px;border:1px solid #ddd;border-radius:8px;overflow:hidden;background:#fff"><div style="padding:12px 16px;display:flex;align-items:center;gap:10px"><div style="width:40px;height:40px;border-radius:50%;background:#1877F2;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:16px">B</div><div><div style="font-weight:600;font-size:14px">品牌頁面</div><div style="font-size:12px;color:#65676b">剛剛 · 🌐</div></div></div><div style="padding:0 16px 12px;font-size:15px;line-height:1.6;color:#1c1e21;white-space:pre-wrap">${escapeHtml(content)}</div></div>`,
  instagram: (content) => `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:400px;border:1px solid #dbdbdb;border-radius:4px;background:#fff"><div style="padding:14px 16px;display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)"></div><div style="font-weight:600;font-size:14px">brand_account</div></div><div style="background:#f0f0f0;aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px">圖片區域</div><div style="padding:12px 16px"><div style="font-size:14px;line-height:1.6;white-space:pre-wrap"><span style="font-weight:600">brand_account</span> ${escapeHtml(content)}</div></div></div>`,
  linkedin: (content, title) => `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:550px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;padding:16px"><div style="display:flex;gap:10px;margin-bottom:12px"><div style="width:48px;height:48px;border-radius:50%;background:#0077B5;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold">B</div><div><div style="font-weight:600;font-size:14px">品牌名稱</div><div style="font-size:12px;color:#666">行銷 · 1分鐘前</div></div></div><div style="font-size:14px;line-height:1.7;color:#1c1c1c;white-space:pre-wrap">${escapeHtml(content)}</div></div>`,
  youtube: (content, title) => `<div style="font-family:Roboto,Arial,sans-serif;max-width:560px;background:#fff"><div style="background:#f0f0f0;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#aaa;font-size:14px">▶ 影片縮圖</div><div style="padding:12px 0"><div style="font-size:16px;font-weight:600;line-height:1.4;margin-bottom:6px">${escapeHtml(title ?? '') || '影片標題'}</div><div style="font-size:13px;color:#606060;line-height:1.5;white-space:pre-wrap">${escapeHtml(content)}</div></div></div>`,
  google_ads: (content, title) => `<div style="font-family:Arial,sans-serif;max-width:480px;border:1px solid #ddd;border-radius:4px;padding:12px;background:#fff"><div style="font-size:11px;color:#006621;margin-bottom:2px">廣告 · www.example.com</div><div style="font-size:18px;color:#1a0dab;margin-bottom:4px">${escapeHtml(title ?? '') || '廣告標題'}</div><div style="font-size:14px;color:#545454;line-height:1.5">${escapeHtml(content)}</div></div>`,
  email: (content, title) => `<div style="font-family:Arial,sans-serif;max-width:600px;border:1px solid #ddd;background:#fff"><div style="background:#f5f5f5;padding:12px 16px;border-bottom:1px solid #ddd"><div style="font-size:13px;color:#666">主旨：${escapeHtml(title ?? '') || '（無主旨）'}</div></div><div style="padding:24px 16px;font-size:14px;line-height:1.8"><div style="white-space:pre-wrap">${escapeHtml(content)}</div></div></div>`,
};

export const outputRouter = router({
  list: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      status: z.enum(["draft","pending_review","approved","scheduled","published","archived"]).optional(),
      platform: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [mCheck]: any = await localPool.execute(
        `SELECT id FROM missions WHERE id = ? AND userId = ? LIMIT 1`,
        [input.missionId, ctx.user.id]
      );
      if (!(mCheck as any[])[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Mission not found" });
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [eq(missionOutputs.missionId, input.missionId)];
      if (input.status) conditions.push(eq(missionOutputs.status, input.status as any));
      return db.select().from(missionOutputs)
        .where(and(...conditions))
        .orderBy(desc(missionOutputs.createdAt));
    }),

  /**
   * 2026-05-09 (Phase 2.1 publish): send caption to a list of email
   * recipients (team review). Uses existing emailService.
   */
  emailToTeam: protectedProcedure
    .input(z.object({
      id: z.number(),
      ...contentSelectorFields,
      recipients: z.array(z.string().email()).min(1).max(10),
      note: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 2026-05-09 cleanup: localPool (drizzle.execute row shape was buggy).
      const { default: localPool } = await import("../localDb");
      const [rowsRaw]: any = await localPool.execute(
        `SELECT o.title, o.content, o.platform, m.title AS missionTitle, b.name AS brandName
         FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
         LEFT JOIN brands b ON b.id = m.brandId
         WHERE o.id = ? AND m.userId = ?
         LIMIT 1`,
        [input.id, ctx.user.id],
      );
      const row = Array.isArray(rowsRaw) ? rowsRaw[0] : null;
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Output not found or not yours" });
      const selected = resolveOutputContent(row.content, input);
      const caption = outputItemCaption(selected.item);

      const { sendEmail } = await import("../auth/emailService");
      const subject = `[${row.brandName ?? "Marketing-OS"}] ${row.missionTitle ?? row.title ?? "貼文 review"}`;
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#1A1A18;font-size:18px;margin:0 0 8px">${row.brandName ?? ""} · ${row.platform ?? ""} 貼文 review</h2>
          <p style="color:#666;font-size:13px;margin:0 0 20px">${row.missionTitle ?? ""}</p>
          ${input.note ? `<div style="background:#FFF7ED;border-left:3px solid #F97316;padding:12px 16px;margin-bottom:20px;border-radius:4px"><p style="margin:0;color:#1A1A18;font-size:14px;line-height:1.6">${input.note.replace(/\n/g,"<br>")}</p></div>` : ""}
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;font-size:14px;line-height:1.7;white-space:pre-wrap">${caption}</div>
          <p style="color:#9ca3af;font-size:11px;margin:20px 0 0">由 SoWork Marketing OS 寄出</p>
        </div>
      `;
      const failures: string[] = [];
      for (const to of input.recipients) {
        try { await sendEmail({ to, subject, html }); }
        catch (e: any) { failures.push(`${to}: ${e?.message ?? e}`); }
      }

      // 2026-05-10 (achievement trigger): tag metadata.emailedTeam = ISO date
      // so use_email_team achievement evaluator can detect this.
      try {
        await localPool.execute(
          `UPDATE mission_outputs
           SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.emailedTeam', ?)
           WHERE id = ?`,
          [new Date().toISOString(), input.id],
        );
      } catch {/* non-fatal */}

      return {
        ok: failures.length === 0,
        sentCount: input.recipients.length - failures.length,
        failures,
      };
    }),

  /**
   * 2026-05-09 (Phase 2.1 publish): generate iCalendar (.ics) data for
   * scheduled posting. Returns the .ics body so client downloads it.
   * No OAuth needed — user can drag .ics into any calendar app.
   */
  scheduleIcs: protectedProcedure
    .input(z.object({
      id: z.number(),
      ...contentSelectorFields,
      confirmPlanningContent: z.boolean().optional(),
      scheduledAt: z.string(), // ISO8601
      durationMinutes: z.number().min(5).max(480).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      // 2026-05-09 cleanup: localPool (drizzle.execute row shape was buggy).
      const { default: localPool } = await import("../localDb");
      const [rowsRaw]: any = await localPool.execute(
        `SELECT o.title, o.content, m.title AS missionTitle, b.name AS brandName
         FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
         LEFT JOIN brands b ON b.id = m.brandId
         WHERE o.id = ? AND m.userId = ?
         LIMIT 1`,
        [input.id, ctx.user.id],
      );
      const row = Array.isArray(rowsRaw) ? rowsRaw[0] : null;
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Output not found or not yours" });
      const selected = resolveOutputContent(row.content, input);
      requirePlanningConfirmation(selected, input.confirmPlanningContent, "schedule");
      const caption = outputItemCaption(selected.item);

      const start = new Date(input.scheduledAt);
      const end = new Date(start.getTime() + input.durationMinutes * 60_000);
      const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
      const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
      const uid = `output-${input.id}-${selected.kind}-${selected.index}@sowork.ai`;
      const summary = `📤 發布：${row.brandName ?? ""} · ${row.missionTitle ?? "貼文"}`;
      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SoWork//Marketing-OS//EN",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${fmt(new Date())}`,
        `DTSTART:${fmt(start)}`,
        `DTEND:${fmt(end)}`,
        `SUMMARY:${escape(summary)}`,
        `DESCRIPTION:${escape(caption)}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      // Mark output as scheduled in DB
      await localPool.execute(
        `UPDATE mission_outputs SET status = 'scheduled', scheduledAt = ?, updatedAt = NOW() WHERE id = ?`,
        [start, input.id],
      );

      return { ics, scheduledAt: start.toISOString(), filename: `sowork-post-${input.id}.ics` };
    }),

  /**
   * 2026-05-09 (CJ direction): persist edited caption back. Used by
   * RunPage's direct-edit + AI-chat-revise flows. Variant content is
   * stored as JSON in mission_outputs.content, so update means parsing,
   * mutating the right variant index, and writing back.
   */
  updateVariantCaption: protectedProcedure
    .input(z.object({
      id: z.number(),
      ...contentSelectorFields,
      caption: z.string().max(8000),
    }))
    .mutation(async ({ ctx, input }) => {
      // 2026-05-09 cleanup: localPool (drizzle.execute row shape was buggy).
      const { default: localPool } = await import("../localDb");
      const [rowsRaw]: any = await localPool.execute(
        `SELECT o.content FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
         WHERE o.id = ? AND m.userId = ?
         LIMIT 1`,
        [input.id, ctx.user.id],
      );
      const row = Array.isArray(rowsRaw) ? rowsRaw[0] : null;
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Output not found or not yours" });
      const updated = updateOutputContent(row.content, input, (item) => ({ ...item, caption: input.caption }));
      await localPool.execute(
        `UPDATE mission_outputs SET content = ?, updatedAt = NOW() WHERE id = ?`,
        [updated.content, input.id],
      );
      return {
        ok: true,
        variantIndex: input.variantIndex,
        contentKind: updated.resolved.kind,
        contentIndex: updated.resolved.index,
      };
    }),

  /**
   * 2026-05-09 (P4): write a regenerated image URL back to a variant's
   * image slot. Used after RunPage's 改圖 button calls image.generate and
   * gets a URL — we persist so reload shows the new image.
   */
  updateVariantImage: protectedProcedure
    .input(z.object({
      id: z.number(),
      cardIndex: z.number().int().nonnegative().optional(),
      ...contentSelectorFields,
      // 2026-05-10: accept either http(s) URL OR data: URL (b64 inline
      // image from OpenAI gpt-image-1 which doesn't return a URL).
      // max bumped from 2000 → 10MB since base64 expands ~33%.
      imageUrl: z.string().min(1).max(10_000_000).refine(
        (s) => {
          // 2026-05-13 (security review):
          // 1. Block data:image/svg+xml — SVGs can contain <script>.
          //    Today they're only rendered via <img> (safe), but a future
          //    code path rendering via <object>/<iframe>/innerHTML would
          //    become stored-XSS. Block at write time.
          // 2. Restrict relative paths to known-safe prefixes only —
          //    prevents using the variant image field as a CSRF probe
          //    target (e.g. /api/auth/csrf-token rendered as <img src>).
          if (s.startsWith("data:image/svg")) return false;
          if (s.startsWith("data:image/")) return true;
          if (s.startsWith("http://") || s.startsWith("https://")) return true;
          if (s.startsWith("/static/") || s.startsWith("/assets/")) return true;
          return false;
        },
        { message: "imageUrl must be http(s)://, data:image/ (not svg), /static/, or /assets/" },
      ),
      style: z.string().max(500).optional(),
      /** Model-ready scene prompt actually used for this image. Unlike
       *  `style`, this participates in generation and remains inspectable. */
      // English expansion can be longer than the <=4000-char Chinese input.
      prompt: z.string().max(8000).optional(),
      /** Human-editable Traditional Chinese counterpart of `prompt`. */
      promptZh: z.string().max(4000).optional(),
      /** Actual provider model, plus the user's requested selection for fallback transparency. */
      modelId: z.string().max(200).optional(),
      requestedModelId: z.string().max(200).optional(),
      fallbackUsed: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT o.content
         FROM mission_outputs o JOIN missions m ON m.id = o.missionId
         WHERE o.id = ? AND m.userId = ? LIMIT 1`,
        [input.id, ctx.user.id],
      );
      const row = (rows as any[])[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Output not found or not yours" });
      const updated = updateOutputContent(row.content, input, (item) =>
        applyVariantImageUpdate(item, input),
      );
      await localPool.execute(
        `UPDATE mission_outputs SET content = ?, updatedAt = NOW() WHERE id = ?`,
        [updated.content, input.id],
      );
      return {
        ok: true,
        variantIndex: input.variantIndex,
        contentKind: updated.resolved.kind,
        contentIndex: updated.resolved.index,
      };
    }),

  /**
   * 2026-05-09 (CJ direction): list recent task runs for the current
   * user × brand × tier. Powers the collapsible sidebar on 30s/60s/100s
   * pages — quick access to "what I just ran for this brand".
   */
  recent: protectedProcedure
    .input(z.object({
      brandId: z.number().nullable().optional(),
      // 2026-05-17 (CJ「現在應該沒有100S」): tier renamed 100s→99s. Still
      // accept the legacy "100s" id from old clients/bookmarks; normalized
      // to "99s" (the value the DB has always stored) before querying.
      tier: z.enum(["30s", "60s", "99s", "100s"]).optional(),
      limit: z.number().min(1).max(50).default(15),
    }))
    .query(async ({ ctx, input }) => {
      // 2026-05-09 cleanup: localPool (drizzle.execute shape was buggy).
      // 2026-05-10: LIMIT ? as prepared parameter triggers MySQL2
      // 'Incorrect arguments to mysqld_stmt_execute'. Inline as literal
      // number after Math.max + clamp (already validated by zod min/max).
      const { default: localPool } = await import("../localDb");
      const params: any[] = [ctx.user.id];
      let brandSql = `AND m.brandId IS NULL`;
      if (input.brandId) { brandSql = `AND m.brandId = ?`; params.push(input.brandId); }
      let tierSql = ``;
      if (input.tier) {
        // Map legacy "100s" → "99s" so old callers still find current
        // records (DB metadata.tier has stored "99s" since the rename).
        const queryTier = normalizeTier(input.tier);
        tierSql = `AND JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.tier')) = ?`;
        params.push(queryTier);
      }
      const safeLimit = Math.max(1, Math.min(50, Number(input.limit) || 15));
      const [rowsRaw]: any = await localPool.execute(
        `SELECT
           o.id, o.title, o.platform, o.outputType, o.status, o.createdAt,
           JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.tier')) AS tier,
           JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')) AS taskId,
           m.title AS missionTitle,
           m.description AS missionDescription,
           m.workspace AS workspace,
           m.brandId AS brandId
         FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
         WHERE m.userId = ?
           ${brandSql}
           ${tierSql}
         ORDER BY o.createdAt DESC
         LIMIT ${safeLimit}`,
        params,
      );
      const arr: any[] = Array.isArray(rowsRaw) ? rowsRaw : [];
      return arr.map((r: any) => ({
        id: r.id,
        title: r.title,
        platform: r.platform,
        outputType: r.outputType,
        status: r.status,
        createdAt: r.createdAt,
        tier: r.tier ? normalizeTier(r.tier) : r.tier,
        taskId: (() => {
          const raw = r.taskId ?? taskIdFromDescription(r.missionDescription);
          return raw ? normalizeTaskId(raw) : raw ?? null;
        })(),
        missionTitle: r.missionTitle,
        workspace: r.workspace,
        brandId: r.brandId,
      }));
    }),

  /**
   * 2026-05-09 (CJ direction): get a single run by id, with mission +
   * brand context attached. Powers the new /run/:outputId page (Phase 2
   * route-based architecture, replacing modal for 60s/100s viewing).
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      // 2026-05-09 (CJ direction「乾淨一條路」): drizzle's db.execute returns
      // shape that varies by version — was eating rows silently. Switched to
      // localPool (mysql2/promise) directly, same pattern recordTaskRun uses.
      const { default: localPool } = await import("../localDb");
      const [rowsRaw]: any = await localPool.execute(
        `SELECT o.*,
          m.id AS mission_id,
          m.title AS mission_title,
          m.description AS mission_description,
          m.workspace AS mission_workspace,
          m.brandId AS mission_brand_id,
          m.userId AS mission_user_id,
          b.name AS brand_name,
          b.logoUrl AS brand_logo,
          b.industry AS brand_industry,
          JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')) AS extracted_task_id,
          JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.tier'))   AS extracted_tier
        FROM mission_outputs o
        LEFT JOIN missions m ON m.id = o.missionId
        LEFT JOIN brands b ON b.id = m.brandId
        -- 2026-07-05 (security scan): require ownership. Dropped the
        -- "OR m.userId IS NULL" branch, which let any authenticated user read
        -- outputs of ownerless (null-userId) missions. All missions are created
        -- with a userId, so this only closes an IDOR edge, no legit access lost.
        WHERE o.id = ? AND m.userId = ?
        LIMIT 1`,
        [input.id, ctx.user.id],
      );
      const row = Array.isArray(rowsRaw) ? rowsRaw[0] : null;
      if (!row) return null;
      // 2026-05-14 (CJ「async polling」): self-healing stale-guard. If the
      // background continuation crashed (pm2 restart mid-task, process
      // OOM, etc.) the row sits at progress='caption_ready' forever and
      // RunPage polls indefinitely. After 5 min, flip to 'failed' so the
      // user sees an actionable state.
      if ((row as any).progress === "caption_ready") {
        const updated = (row as any).updatedAt instanceof Date
          ? (row as any).updatedAt.getTime()
          : Date.parse(String((row as any).updatedAt));
        // 2026-05-18 (CJ「FB 3 篇連載超時很久」): the 5-min cap was too
        // short for heavy multi-post packs (strategist + N episodes + N
        // images + per-episode extras). Make it tier-aware so a
        // legitimately-long 99s/60s pack run isn't killed prematurely.
        const tierRaw = String((row as any).extracted_tier ?? "");
        const staleMs =
          tierRaw.includes("99") || tierRaw.includes("100") ? 12 * 60_000 :
          tierRaw.includes("60") ? 8 * 60_000 :
          5 * 60_000;
        if (Number.isFinite(updated) && Date.now() - updated > staleMs) {
          {
            try {
              const { default: localPool } = await import("../localDb");
              await localPool.execute(
                `UPDATE mission_outputs
                   SET progress = 'failed',
                       progressDetail = '背景任務逾時未完成（process restart 或內部錯誤），請重跑一次',
                       updatedAt = NOW()
                 WHERE id = ? AND progress = 'caption_ready'`,
                [input.id],
              );
              (row as any).progress = "failed";
              (row as any).progressDetail = "背景任務逾時未完成（process restart 或內部錯誤），請重跑一次";
            } catch (e) {
              console.warn("[output.getById] stale-guard UPDATE failed:", (e as Error).message);
            }
          }
        }
      }
      const md = typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {});
      // SQL extracted values are the canonical source — string or null.
      // 2026-05-17 100s→99s compat: legacy rows persisted "fb-100-…" /
      // "100s". Normalize on read so RunPage mockup inference + the shell
      // history sidebar resolve legacy runs to the renamed logic.
      const rawTaskId: string | null =
        row.extracted_task_id ?? md.taskId ?? taskIdFromDescription(row.mission_description) ?? null;
      const rawTier: string | null = row.extracted_tier ?? md.tier ?? null;
      const taskId: string | null = rawTaskId ? normalizeTaskId(rawTaskId) : null;
      const tier: string | null = rawTier ? normalizeTier(rawTier) : null;

      // 2026-05-26 (CJ「mockup 顯示 SoWork 不是勝選通」):
      // productId is already stored in metadata by the orchestra. Look it up
      // now so RunPage can display the product name in the mockup instead of
      // the top-level brand name.
      let product: { id: number; name: string; logoUrl: string | null } | null = null;
      const metaProductId = md.productId ? Number(md.productId) : null;
      if (metaProductId) {
        try {
          const [pRows]: any = await localPool.execute(
            `SELECT id, name, logoUrl FROM products WHERE id = ? LIMIT 1`,
            [metaProductId],
          );
          const pr = Array.isArray(pRows) ? pRows[0] : null;
          if (pr?.name) product = { id: pr.id, name: pr.name, logoUrl: pr.logoUrl ?? null };
        } catch { /* non-fatal — fall back to brand name */ }
      }

      return {
        id: row.id,
        missionId: row.missionId,
        platform: row.platform,
        outputType: row.outputType,
        title: row.title,
        content: row.content,
        metadata: md,
        previewHtml: row.previewHtml,
        status: row.status,
        version: row.version,
        // 2026-05-14 (CJ「async polling」): expose progress so RunPage can
        // poll until the orchestra's background continuation completes.
        progress: (row as any).progress ?? "done",
        progressDetail: (row as any).progressDetail ?? null,
        scheduledAt: row.scheduledAt,
        publishedAt: row.publishedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        mission: {
          id: row.mission_id,
          title: row.mission_title,
          description: row.mission_description,
          tier,
          taskId,
          taskLabel: row.mission_title,
          workspace: row.mission_workspace,
          brandId: row.mission_brand_id,
        },
        brand: row.brand_name ? {
          id: row.mission_brand_id,
          name: row.brand_name,
          logoUrl: row.brand_logo,
          industry: row.brand_industry,
        } : null,
        // product is non-null when the task was run with a product scope.
        // RunPage uses product.name / product.logoUrl for the mockup avatar
        // so it shows 勝選通 instead of the parent brand (SoWork).
        product,
      };
    }),

  confirm: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      conversationId: z.number().optional(),
      messageId: z.number().optional(),
      platform: z.enum(["facebook","instagram","linkedin","youtube","google_ads","email","ppt","doc","script","other"]).default("other"),
      outputType: z.enum(["post","story","reel","ad_copy","email_html","slide","script","product_desc","report","other"]).default("other"),
      title: z.string().optional(),
      content: z.string(),
      metadata: z.any().optional(),
      isUrgent: z.boolean().default(false),
      deadlineAt: z.string().optional(),
      batchGroupId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [mCheck]: any = await localPool.execute(
        `SELECT id FROM missions WHERE id = ? AND userId = ? LIMIT 1`,
        [input.missionId, ctx.user.id]
      );
      if (!(mCheck as any[])[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Mission not found" });
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const previewFn = PLATFORM_PREVIEW_TEMPLATES[input.platform];
      const previewHtml = previewFn ? previewFn(input.content, input.title) : null;
      const [result] = await db.insert(missionOutputs).values({
        missionId: input.missionId,
        conversationId: input.conversationId ?? null,
        messageId: input.messageId ?? null,
        platform: input.platform,
        outputType: input.outputType,
        title: input.title ?? null,
        content: input.content,
        previewHtml: previewHtml ?? null,
        metadata: input.metadata ?? null,
        status: "draft",
        version: 1,
        isUrgent: input.isUrgent ? 1 : 0,
        deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null,
        batchGroupId: input.batchGroupId ?? null,
      });
      return { id: result.insertId, previewHtml };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["draft","pending_review","approved","scheduled","published","archived"]),
      scheduledAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [own]: any = await localPool.execute(
        `SELECT mo.id FROM mission_outputs mo JOIN missions m ON m.id = mo.missionId WHERE mo.id = ? AND m.userId = ? LIMIT 1`,
        [input.id, ctx.user.id]
      );
      if (!(own as any[])[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Output not found" });
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const updates: any = { status: input.status };
      if (input.scheduledAt) updates.scheduledAt = new Date(input.scheduledAt);
      if (input.status === "published") updates.publishedAt = new Date();
      await db.update(missionOutputs).set(updates).where(eq(missionOutputs.id, input.id));
      return { success: true };
    }),

  getVersions: protectedProcedure
    .input(z.object({ outputId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [own]: any = await localPool.execute(
        `SELECT mo.id FROM mission_outputs mo JOIN missions m ON m.id = mo.missionId WHERE mo.id = ? AND m.userId = ? LIMIT 1`,
        [input.outputId, ctx.user.id]
      );
      if (!(own as any[])[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Output not found" });
      const db = await getDb();
      if (!db) return [];
      const chain: any[] = [];
      let currentId: number | null = input.outputId;
      while (currentId) {
        const [item] = await db.select().from(missionOutputs)
          .where(eq(missionOutputs.id, currentId)).limit(1);
        if (!item) break;
        chain.unshift(item);
        currentId = item.parentOutputId ?? null;
      }
      return chain;
    }),

  batchUpdateStatus: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      status: z.enum(["draft","pending_review","approved","scheduled","published","archived"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.ids.length === 0) return { success: true, count: 0 };
      const { default: localPool } = await import("../localDb");
      const placeholders = input.ids.map(() => '?').join(',');
      const [owned]: any = await localPool.execute(
        `SELECT mo.id FROM mission_outputs mo JOIN missions m ON m.id = mo.missionId WHERE mo.id IN (${placeholders}) AND m.userId = ?`,
        [...input.ids, ctx.user.id]
      );
      if ((owned as any[]).length !== input.ids.length) throw new TRPCError({ code: "FORBIDDEN", message: "One or more outputs not found" });
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      for (const id of input.ids) {
        await db.update(missionOutputs).set({ status: input.status as any })
          .where(eq(missionOutputs.id, id));
      }
      return { success: true, count: input.ids.length };
    }),


  /**
   * 2026-05-14 (CJ「專案名稱要可以編輯」): rename a single output card.
   * Updates mission_outputs.title. Ownership enforced via the mission's
   * userId. Title is capped at 120 chars; whitespace-only rejected.
   */
  updateTitle: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(1).max(120),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      // Check ownership: the output's mission must belong to caller.
      const [own]: any = await localPool.execute(
        `SELECT mo.id FROM mission_outputs mo
         JOIN missions m ON m.id = mo.missionId
         WHERE mo.id = ? AND m.userId = ? LIMIT 1`,
        [input.id, ctx.user.id],
      );
      if (!(own as any[])[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Output not found" });
      await localPool.execute(
        `UPDATE mission_outputs SET title = ?, updatedAt = NOW() WHERE id = ?`,
        [input.title, input.id],
      );
      return { ok: true, id: input.id, title: input.title };
    }),

  finalize: protectedProcedure
    .input(z.object({
      id: z.number(),
      finalizedBy: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [own]: any = await localPool.execute(
        `SELECT mo.id FROM mission_outputs mo JOIN missions m ON m.id = mo.missionId WHERE mo.id = ? AND m.userId = ? LIMIT 1`,
        [input.id, ctx.user.id]
      );
      if (!(own as any[])[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Output not found" });
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const finalizedBy = input.finalizedBy ?? (ctx.user as any)?.id ?? 'unknown';
      await db.execute(
        sql`UPDATE mission_outputs SET finalized_status='finalized', finalized_at=NOW(), finalized_by=${finalizedBy} WHERE id=${input.id}`
      );
      return { success: true };
    }),

  setDeliverableMeta: protectedProcedure
    .input(z.object({
      id: z.number(),
      deliverableLevel: z.number().min(1).max(3).optional(),
      deliverableTool: z.enum(['none','canva','google_slides','google_doc','openclaw_video']).optional(),
      toolEditUrl: z.string().optional(),
      toolUrlExpiresAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [own]: any = await localPool.execute(
        `SELECT mo.id FROM mission_outputs mo JOIN missions m ON m.id = mo.missionId WHERE mo.id = ? AND m.userId = ? LIMIT 1`,
        [input.id, ctx.user.id]
      );
      if (!(own as any[])[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Output not found" });
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const parts: string[] = [];
      if (input.deliverableLevel !== undefined) parts.push("l");
      if (input.deliverableTool !== undefined) parts.push("t");
      if (input.toolEditUrl !== undefined) parts.push("u");
      if (input.toolUrlExpiresAt !== undefined) parts.push("e");
      if (parts.length > 0) {
        const _unused = parts;
        // Build and execute raw update using drizzle sql tag
        const setClauses = parts.map((p, i) => p).join(", ");
        // fallback: use db.update with explicit fields
        const updateObj: Record<string, any> = {};
        if (input.deliverableLevel !== undefined) (updateObj as any).deliverableLevel = input.deliverableLevel;
        if (input.deliverableTool !== undefined) (updateObj as any).deliverableTool = input.deliverableTool;
        if (input.toolEditUrl !== undefined) (updateObj as any).toolEditUrl = input.toolEditUrl;
        if (input.toolUrlExpiresAt !== undefined) (updateObj as any).toolUrlExpiresAt = new Date(input.toolUrlExpiresAt);
        await db.update(missionOutputs).set(updateObj).where(eq(missionOutputs.id, input.id));
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [own]: any = await localPool.execute(
        `SELECT mo.id FROM mission_outputs mo JOIN missions m ON m.id = mo.missionId WHERE mo.id = ? AND m.userId = ? LIMIT 1`,
        [input.id, ctx.user.id]
      );
      if (!(own as any[])[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Output not found" });
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.update(missionOutputs).set({ status: "archived" as any })
        .where(eq(missionOutputs.id, input.id));
      return { success: true };
    }),
});
