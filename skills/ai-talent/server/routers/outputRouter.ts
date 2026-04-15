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
