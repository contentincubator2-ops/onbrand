import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { missionOutputs } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const PLATFORM_PREVIEW_TEMPLATES: Record<string, (content: string, title?: string) => string> = {
  facebook: (content, title) => `<div style="font-family:Helvetica,Arial,sans-serif;max-width:500px;border:1px solid #ddd;border-radius:8px;overflow:hidden;background:#fff"><div style="padding:12px 16px;display:flex;align-items:center;gap:10px"><div style="width:40px;height:40px;border-radius:50%;background:#1877F2;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:16px">B</div><div><div style="font-weight:600;font-size:14px">品牌頁面</div><div style="font-size:12px;color:#65676b">剛剛 · 🌐</div></div></div><div style="padding:0 16px 12px;font-size:15px;line-height:1.6;color:#1c1e21;white-space:pre-wrap">${content}</div></div>`,
  instagram: (content) => `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:400px;border:1px solid #dbdbdb;border-radius:4px;background:#fff"><div style="padding:14px 16px;display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)"></div><div style="font-weight:600;font-size:14px">brand_account</div></div><div style="background:#f0f0f0;aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px">圖片區域</div><div style="padding:12px 16px"><div style="font-size:14px;line-height:1.6;white-space:pre-wrap"><span style="font-weight:600">brand_account</span> ${content}</div></div></div>`,
  linkedin: (content, title) => `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:550px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;padding:16px"><div style="display:flex;gap:10px;margin-bottom:12px"><div style="width:48px;height:48px;border-radius:50%;background:#0077B5;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold">B</div><div><div style="font-weight:600;font-size:14px">品牌名稱</div><div style="font-size:12px;color:#666">行銷 · 1分鐘前</div></div></div><div style="font-size:14px;line-height:1.7;color:#1c1c1c;white-space:pre-wrap">${content}</div></div>`,
  youtube: (content, title) => `<div style="font-family:Roboto,Arial,sans-serif;max-width:560px;background:#fff"><div style="background:#f0f0f0;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#aaa;font-size:14px">▶ 影片縮圖</div><div style="padding:12px 0"><div style="font-size:16px;font-weight:600;line-height:1.4;margin-bottom:6px">${title || '影片標題'}</div><div style="font-size:13px;color:#606060;line-height:1.5;white-space:pre-wrap">${content}</div></div></div>`,
  google_ads: (content, title) => `<div style="font-family:Arial,sans-serif;max-width:480px;border:1px solid #ddd;border-radius:4px;padding:12px;background:#fff"><div style="font-size:11px;color:#006621;margin-bottom:2px">廣告 · www.example.com</div><div style="font-size:18px;color:#1a0dab;margin-bottom:4px">${title || '廣告標題'}</div><div style="font-size:14px;color:#545454;line-height:1.5">${content}</div></div>`,
  email: (content, title) => `<div style="font-family:Arial,sans-serif;max-width:600px;border:1px solid #ddd;background:#fff"><div style="background:#f5f5f5;padding:12px 16px;border-bottom:1px solid #ddd"><div style="font-size:13px;color:#666">主旨：${title || '（無主旨）'}</div></div><div style="padding:24px 16px;font-size:14px;line-height:1.8"><div style="white-space:pre-wrap">${content}</div></div></div>`,
};

export const outputRouter = router({
  list: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      status: z.enum(["draft","pending_review","approved","scheduled","published","archived"]).optional(),
      platform: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
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
      variantIndex: z.number().min(0),
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
      if (!row) throw new Error("Output not found");
      let caption = "";
      try {
        const parsed = JSON.parse(row.content);
        const arrSrc = Array.isArray(parsed) ? parsed : (parsed.variants ?? [parsed]);
        caption = arrSrc[input.variantIndex]?.caption ?? "";
      } catch { caption = row.content; }

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
      variantIndex: z.number().min(0),
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
      if (!row) throw new Error("Output not found");
      let caption = "";
      try {
        const parsed = JSON.parse(row.content);
        const arrSrc = Array.isArray(parsed) ? parsed : (parsed.variants ?? [parsed]);
        caption = arrSrc[input.variantIndex]?.caption ?? "";
      } catch { caption = row.content; }

      const start = new Date(input.scheduledAt);
      const end = new Date(start.getTime() + input.durationMinutes * 60_000);
      const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
      const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
      const uid = `output-${input.id}-${input.variantIndex}@sowork.ai`;
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
      variantIndex: z.number().min(0),
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
      if (!row) throw new Error("Output not found");
      let parsed: any;
      try { parsed = JSON.parse(row.content); }
      catch { parsed = [{ label: "主版本", caption: row.content }]; }
      const arrSrc = Array.isArray(parsed) ? parsed : (parsed.variants ?? [parsed]);
      if (input.variantIndex >= arrSrc.length) throw new Error("Variant index out of range");
      arrSrc[input.variantIndex] = { ...arrSrc[input.variantIndex], caption: input.caption };
      const newContent = Array.isArray(parsed)
        ? JSON.stringify(arrSrc, null, 2)
        : JSON.stringify({ ...parsed, variants: arrSrc }, null, 2);
      await localPool.execute(
        `UPDATE mission_outputs SET content = ?, updatedAt = NOW() WHERE id = ?`,
        [newContent, input.id],
      );
      return { ok: true, variantIndex: input.variantIndex };
    }),

  /**
   * 2026-05-09 (P4): write a regenerated image URL back to a variant's
   * image slot. Used after RunPage's 改圖 button calls image.generate and
   * gets a URL — we persist so reload shows the new image.
   */
  updateVariantImage: protectedProcedure
    .input(z.object({
      id: z.number(),
      variantIndex: z.number().min(0),
      // 2026-05-10: accept either http(s) URL OR data: URL (b64 inline
      // image from OpenAI gpt-image-1 which doesn't return a URL).
      // max bumped from 2000 → 10MB since base64 expands ~33%.
      imageUrl: z.string().min(1).max(10_000_000).refine(
        (s) => s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:image/"),
        { message: "imageUrl must be http(s):// or data:image/" },
      ),
      style: z.string().max(500).optional(),
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
      if (!row) throw new Error("Output not found");
      let parsed: any;
      try { parsed = JSON.parse(row.content); }
      catch { parsed = [{ label: "主版本", caption: row.content }]; }
      const arr = Array.isArray(parsed) ? parsed : (parsed.variants ?? [parsed]);
      if (input.variantIndex >= arr.length) throw new Error("variant index out of range");
      arr[input.variantIndex] = {
        ...arr[input.variantIndex],
        image: { ...(arr[input.variantIndex].image ?? {}), url: input.imageUrl, status: "ready", style: input.style ?? arr[input.variantIndex].image?.style ?? null },
        imageUrl: input.imageUrl,
        imageStatus: "ready",
      };
      const newContent = Array.isArray(parsed) ? JSON.stringify(arr, null, 2) : JSON.stringify({ ...parsed, variants: arr }, null, 2);
      await localPool.execute(
        `UPDATE mission_outputs SET content = ?, updatedAt = NOW() WHERE id = ?`,
        [newContent, input.id],
      );
      return { ok: true, variantIndex: input.variantIndex };
    }),

  /**
   * 2026-05-09 (CJ direction): list recent task runs for the current
   * user × brand × tier. Powers the collapsible sidebar on 30s/60s/100s
   * pages — quick access to "what I just ran for this brand".
   */
  recent: protectedProcedure
    .input(z.object({
      brandId: z.number().nullable().optional(),
      tier: z.enum(["30s", "60s", "100s"]).optional(),
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
      if (input.tier) { tierSql = `AND JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.tier')) = ?`; params.push(input.tier); }
      const safeLimit = Math.max(1, Math.min(50, Number(input.limit) || 15));
      const [rowsRaw]: any = await localPool.execute(
        `SELECT
           o.id, o.title, o.platform, o.outputType, o.status, o.createdAt,
           JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.tier')) AS tier,
           JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')) AS taskId,
           m.title AS missionTitle,
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
        tier: r.tier,
        taskId: r.taskId,
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
        WHERE o.id = ? AND (m.userId = ? OR m.userId IS NULL)
        LIMIT 1`,
        [input.id, ctx.user.id],
      );
      const row = Array.isArray(rowsRaw) ? rowsRaw[0] : null;
      if (!row) return null;
      const md = typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {});
      // SQL extracted values are the canonical source — string or null.
      const taskId: string | null = row.extracted_task_id ?? md.taskId ?? null;
      const tier: string | null = row.extracted_tier ?? md.tier ?? null;
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
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      for (const id of input.ids) {
        await db.update(missionOutputs).set({ status: input.status as any })
          .where(eq(missionOutputs.id, id));
      }
      return { success: true, count: input.ids.length };
    }),


  finalize: protectedProcedure
    .input(z.object({
      id: z.number(),
      finalizedBy: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
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
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.update(missionOutputs).set({ status: "archived" as any })
        .where(eq(missionOutputs.id, input.id));
      return { success: true };
    }),
});
