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
import { eq, and, desc, or, isNull, sql } from "drizzle-orm";
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

  // List ALL missions for the current user across every brand. Powers the
  // new MissionsHome (任務牆) — Sprint 1 D1. Returns mission rows joined
  // with brand name + squad slug so the rack-card can render without an
  // extra round-trip per card.
  listAllForUser: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`
        SELECT m.id, m.title, m.description, m.workspace, m.methodology,
               m.squad_slug AS squadSlug, m.brand_id AS brandId,
               m.status, m.updated_at AS updatedAt,
               b.name AS brandName
          FROM missions m
          LEFT JOIN brands b ON b.id = m.brand_id
         WHERE m.user_id = ${ctx.user.id}
         ORDER BY m.updated_at DESC
         LIMIT 60
      `);
      // drizzle returns [rows, fields] for raw execute on mysql2
      const data = Array.isArray(rows) ? rows[0] : (rows as any).rows ?? rows;
      return Array.isArray(data) ? data : [];
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
      status: z.enum(["inactive", "active", "completed", "archived"]).optional(),
      squadSlug: z.string().max(64).optional().nullable(),
      tagline: z.string().max(255).optional().nullable(),
      subTagline: z.string().max(255).optional().nullable(),
      savedSquadFlow: z.string().optional().nullable(), // JSON string of customized steps
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

  // ── Mission Requirements (Layer 1 + Layer 2) ────────────────────────────────
  // Stored in mission_requirements table (auto-created on first use).

  /** Return filled requirement values for a mission + squad as a plain map */
  getRequirementValues: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      squadSlug: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return {} as Record<string, string>;
      // Auto-create table if it doesn't exist yet
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS mission_requirements (
          id             INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
          mission_id     INT           NOT NULL,
          squad_slug     VARCHAR(120)  NOT NULL,
          requirement_id VARCHAR(80)   NOT NULL,
          value          TEXT,
          updated_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                       ON UPDATE CURRENT_TIMESTAMP(3),
          UNIQUE KEY uniq_req (mission_id, squad_slug, requirement_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      const [rows] = await db.execute(
        sql`SELECT requirement_id, value
            FROM mission_requirements
            WHERE mission_id = ${input.missionId}
              AND squad_slug  = ${input.squadSlug}`
      ) as any[];
      const result: Record<string, string> = {};
      for (const row of (rows as any[])) {
        result[row.requirement_id] = row.value ?? "";
      }
      return result;
    }),

  /** Upsert a single requirement value (manual fill or Layer 2 auto-fill) */
  setRequirementValue: protectedProcedure
    .input(z.object({
      missionId:     z.number(),
      squadSlug:     z.string(),
      requirementId: z.string().max(80),
      value:         z.string().max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS mission_requirements (
          id             INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
          mission_id     INT           NOT NULL,
          squad_slug     VARCHAR(120)  NOT NULL,
          requirement_id VARCHAR(80)   NOT NULL,
          value          TEXT,
          updated_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                       ON UPDATE CURRENT_TIMESTAMP(3),
          UNIQUE KEY uniq_req (mission_id, squad_slug, requirement_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(sql`
        INSERT INTO mission_requirements (mission_id, squad_slug, requirement_id, value)
        VALUES (${input.missionId}, ${input.squadSlug}, ${input.requirementId}, ${input.value})
        ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW(3)
      `);
      return { ok: true };
    }),

  /** Bulk-upsert multiple requirement values (used by Layer 2 auto-extract) */
  bulkSetRequirements: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      squadSlug: z.string(),
      values:    z.record(z.string().max(80), z.string().max(2000)),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false, count: 0 };
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS mission_requirements (
          id             INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
          mission_id     INT           NOT NULL,
          squad_slug     VARCHAR(120)  NOT NULL,
          requirement_id VARCHAR(80)   NOT NULL,
          value          TEXT,
          updated_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                       ON UPDATE CURRENT_TIMESTAMP(3),
          UNIQUE KEY uniq_req (mission_id, squad_slug, requirement_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      let count = 0;
      for (const [reqId, val] of Object.entries(input.values)) {
        if (!val?.trim()) continue;
        await db.execute(sql`
          INSERT INTO mission_requirements (mission_id, squad_slug, requirement_id, value)
          VALUES (${input.missionId}, ${input.squadSlug}, ${reqId}, ${val})
          ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW(3)
        `);
        count++;
      }
      return { ok: true, count };
    }),

});