/**
 * missionRouter.ts — Sprint 2: Mission CRUD
 * 
 * Missions are the core work unit within a workspace.
 * Workspace (e.g. Facebook) > Mission (e.g. "Q2 Brand Launch Campaign")
 * Each mission has context (objective, audience, methodology) and task units.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { missions, missionTaskUnits } from "../../drizzle/schema";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import { computeMissionResources } from "../missionResourceComputer";

export const missionRouter = router({
  // List missions for a workspace
  list: protectedProcedure
    .input(z.object({
      workspace: z.string().max(50).optional().default(""),
      brandId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(missions.userId, ctx.user.id), eq(missions.workspace, input.workspace)];
      if (input.brandId) conditions.push(eq(missions.brandId, input.brandId));
      return db.select().from(missions).where(and(...conditions)).orderBy(desc(missions.updatedAt));
    }),

  // List all missions for a brand across all workspaces
  listByBrand: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(missions)
        .where(and(eq(missions.userId, ctx.user.id), eq(missions.brandId, input.brandId)))
        .orderBy(missions.workspace, desc(missions.updatedAt));
    }),

  // Get single mission with task units
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [mission] = await db.select().from(missions)
        .where(and(eq(missions.id, input.id), eq(missions.userId, ctx.user.id)))
        .limit(1);
      if (!mission) return null;
      const units = await db.select().from(missionTaskUnits)
        .where(eq(missionTaskUnits.missionId, mission.id))
        .orderBy(missionTaskUnits.sortOrder);
      return { ...mission, taskUnits: units };
    }),

  // Get single mission by ID (includes squadSlug, welcomeMessage)
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [mission] = await db.select().from(missions)
        .where(and(eq(missions.id, input.id), eq(missions.userId, ctx.user.id)))
        .limit(1);
      if (!mission) return null;
      return mission;
    }),

  // Create a new mission
  create: protectedProcedure
    .input(z.object({
      workspace: z.string().max(50).optional().default(""),
      brandId: z.number().optional(),
      brandName: z.string().optional(),   // for semantic matching context
      title: z.string().min(1).max(255),
      description: z.string().optional(), // 任務說明，給語意配對用
      objective: z.string().optional(),
      audience: z.string().optional(),
      offer: z.string().optional(),
      successMetrics: z.string().optional(),
      constraints: z.string().optional(),
      methodology: z.string().optional(),
      squadSlug: z.string().max(64).optional(),
      welcomeMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const [result] = await db.insert(missions).values({
        userId: ctx.user.id,
        workspace: input.workspace,
        brandId: input.brandId ?? null,
        title: input.title,
        description: input.description ?? null,
        objective: input.objective ?? "",
        audience: input.audience ?? "",
        offer: input.offer ?? "",
        successMetrics: input.successMetrics ?? "",
        constraints: input.constraints ?? "",
        methodology: input.methodology ?? "",
        squadSlug: input.squadSlug ?? null,
        welcomeMessage: input.welcomeMessage ?? null,
        status: "active",
      });
      const missionId = result.insertId;
      // Fire-and-forget: compute semantic agent matching asynchronously
      computeMissionResources({
        missionId,
        title: input.title,
        description: input.description,
        workspace: input.workspace,
        brandName: input.brandName,
      }).catch(console.error);
      return { id: missionId };
    }),

  // Update mission context
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      objective: z.string().optional(),
      audience: z.string().optional(),
      offer: z.string().optional(),
      successMetrics: z.string().optional(),
      constraints: z.string().optional(),
      methodology: z.string().optional(),
      status: z.enum(["active", "completed", "archived"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const { id, ...updates } = input;
      // Remove undefined values
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => v !== undefined)
      );
      if (Object.keys(cleanUpdates).length === 0) return { success: true };
      await db.update(missions).set(cleanUpdates)
        .where(and(eq(missions.id, id), eq(missions.userId, ctx.user.id)));
      return { success: true };
    }),

  // Add a task unit to a mission
  addTaskUnit: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      label: z.string().min(1).max(255),
      agentId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      // Get max sort order
      const existing = await db.select().from(missionTaskUnits)
        .where(eq(missionTaskUnits.missionId, input.missionId));
      const maxSort = existing.reduce((max, u) => Math.max(max, u.sortOrder ?? 0), 0);
      const [result] = await db.insert(missionTaskUnits).values({
        missionId: input.missionId,
        label: input.label,
        agentId: input.agentId ?? null,
        status: "not_started",
        sortOrder: maxSort + 1,
      });
      return { id: result.insertId };
    }),

  // Update task unit status
  updateTaskUnit: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["not_started", "running", "needs_input", "review", "approved"]).optional(),
      label: z.string().min(1).max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const { id, ...updates } = input;
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => v !== undefined)
      );
      await db.update(missionTaskUnits).set(cleanUpdates)
        .where(eq(missionTaskUnits.id, id));
      return { success: true };
    }),

  // Get active mission for a workspace (most recently updated active mission)
  getActive: protectedProcedure
    .input(z.object({
      workspace: z.string().max(50).optional().default(""),
      brandId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const conditions = [
        eq(missions.userId, ctx.user.id),
        eq(missions.workspace, input.workspace),
        eq(missions.status, "active"),
      ];
      if (input.brandId) conditions.push(eq(missions.brandId, input.brandId));
      const [mission] = await db.select().from(missions)
        .where(and(...conditions))
        .orderBy(desc(missions.updatedAt))
        .limit(1);
      if (!mission) return null;
      const units = await db.select().from(missionTaskUnits)
        .where(eq(missionTaskUnits.missionId, mission.id))
        .orderBy(missionTaskUnits.sortOrder);
      return { ...mission, taskUnits: units };
    }),

  // Delete a mission
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB not available');
      await db.delete(missions)
        .where(and(eq(missions.id, input.id), eq(missions.userId, ctx.user.id)));
      return { success: true };
    }),


  // Rename a mission
  rename: protectedProcedure
    .input(z.object({ id: z.number(), title: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.update(missions)
        .set({ title: input.title })
        .where(and(eq(missions.id, input.id), eq(missions.userId, ctx.user.id)));
      return { success: true };
    }),

  // Move mission to a workspace
  move: protectedProcedure
    .input(z.object({ id: z.number(), workspace: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.update(missions)
        .set({ workspace: input.workspace })
        .where(and(eq(missions.id, input.id), eq(missions.userId, ctx.user.id)));
      return { success: true };
    }),

  // List uncategorized missions (workspace is null or empty string)
  listUncategorized: protectedProcedure
    .input(z.object({ brandId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [
        eq(missions.userId, ctx.user.id),
        or(isNull(missions.workspace), eq(missions.workspace, "")),
      ];
      if (input.brandId) conditions.push(eq(missions.brandId, input.brandId));
      return db.select({
        id: missions.id,
        title: missions.title,
        workspace: missions.workspace,
        brandId: missions.brandId,
        createdAt: missions.createdAt,
      })
        .from(missions)
        .where(and(...(conditions as any[])))
        .orderBy(desc(missions.createdAt))
        .limit(20);
    }),

});