import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { computeMissionResources } from "../missionResourceComputer";

// resourceRouter.ts - Workspace resource summary
// Fixed 2025-04: use proper DB COUNT(DISTINCT) queries instead of readdir()
//
// Actual DB numbers confirmed 2025-04:
//  strategy: agents=5608, skills=253, models=123
//  website:  agents=2686, skills=65,  models=61
//  facebook: agents=1808, skills=51,  models=54
//  global:   agents=17095, skills=539, models=265

export const resourceRouter = router({
  summary: protectedProcedure
    .input(
      z.object({
        workspace: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { agents: 0, skills: 0, providers: 0, providerList: [], skillList: [] };

      const wsKey = input?.workspace ?? "global";

      // Map wsKey to SQL WHERE fragment (matches AppShell.tsx wsKey values)
      // Note: agents table uses 'specialty' and 'skills' (JSON array), not 'primarySkill'
      const wsFilterMap: Record<string, string> = {
        strategy: `layer='strategy' OR specialty LIKE '%brand%' OR specialty LIKE '%strategy%' OR specialty LIKE '%positioning%'`,
        website:  `specialty LIKE '%seo%' OR specialty LIKE '%website%' OR specialty LIKE '%content%' OR specialty LIKE '%copywriting%'`,
        facebook: `specialty LIKE '%facebook%' OR specialty LIKE '%social%' OR specialty LIKE '%ads%' OR specialty LIKE '%paid-ads%'`,
      };

      const filter = wsFilterMap[wsKey];
      const whereClause = filter
        ? `isAvailable=1 AND (${filter})`
        : `isAvailable=1`;

      // Count agents matching this workspace
      const [agentCountRows] = await db.execute(
        sql.raw(`SELECT COUNT(*) as cnt FROM agents WHERE ${whereClause}`)
      ) as any;
      const agentCount = Number((agentCountRows as any)?.[0]?.cnt ?? 0);

      // For skills, we use the JSON 'skills' array field
      // Count agents with non-empty skills
      const [skillCountRows] = await db.execute(
        sql.raw(`SELECT COUNT(*) as cnt FROM agents WHERE ${whereClause} AND skills IS NOT NULL AND JSON_LENGTH(skills) > 0`)
      ) as any;
      const skillCount = Number((skillCountRows as any)?.[0]?.cnt ?? 0);

      // Get sample skills from agents (skills is a JSON array)
      const [skillRows] = await db.execute(
        sql.raw(`SELECT skills FROM agents WHERE ${whereClause} AND skills IS NOT NULL AND JSON_LENGTH(skills) > 0 LIMIT 50`)
      ) as any;

      // Extract and flatten all skills from JSON arrays
      const skillSet = new Set<string>();
      for (const row of (skillRows ?? [])) {
        try {
          const skills = JSON.parse(row.skills);
          if (Array.isArray(skills)) {
            skills.forEach((skill: string) => {
              if (typeof skill === 'string' && skill.trim()) {
                skillSet.add(skill.trim());
              }
            });
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }

      // Note: agents table doesn't have 'aiModel' column
      // Return 0 for providers since we don't track this
      const providerCount = 0;
      const providerList: string[] = [];

      return {
        agents: agentCount,
        skills: skillCount,
        skillList: Array.from(skillSet).slice(0, 20), // Limit to 20
        providers: providerCount,
        providerList,
        mode: wsKey,
      };
    }),

  // Per-mission semantic resource summary (polled by MissionHomePage)
  summaryByMission: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { status: "pending" as const, agents: 0, skills: 0, providers: 0 };

      const [rows] = await db.execute(
        sql`SELECT status, agents, skills, providers, skillList, providerList, topAgents
            FROM mission_resources
            WHERE missionId = ${input.missionId}
            LIMIT 1`
      ) as any;

      const row = (rows as any)?.[0];
      if (!row) return { status: "pending" as const, agents: 0, skills: 0, providers: 0 };

      return {
        status: (row.status ?? "pending") as "pending" | "ready" | "error",
        agents:      Number(row.agents ?? 0),
        skills:      Number(row.skills ?? 0),
        providers:   Number(row.providers ?? 0),
        skillList:   row.skillList   ? JSON.parse(row.skillList)   as string[] : [],
        providerList: row.providerList ? JSON.parse(row.providerList) as string[] : [],
        topAgents:   row.topAgents   ? JSON.parse(row.topAgents)   as unknown[] : [],
      };
    }),

  // Trigger semantic computation for an existing mission (used when switching to old missions)
  triggerCompute: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { triggered: false };

      // Skip if already computed
      const [resRows] = await db.execute(
        sql`SELECT status FROM mission_resources WHERE missionId = ${input.missionId} LIMIT 1`
      ) as any;
      if ((resRows as any)?.[0]?.status === "ready") return { triggered: false };

      // Fetch mission + brand details
      const [missionRows] = await db.execute(
        sql`SELECT m.title, m.description, m.workspace, m.brandId, b.name as brandName
            FROM missions m
            LEFT JOIN brands b ON b.id = m.brandId
            WHERE m.id = ${input.missionId} AND m.userId = ${ctx.user.id}
            LIMIT 1`
      ) as any;
      const mission = (missionRows as any)?.[0];
      if (!mission) return { triggered: false };

      // Fire-and-forget — same pattern as missionRouter.create
      computeMissionResources({
        missionId:   input.missionId,
        title:       mission.title       ?? "",
        description: mission.description ?? undefined,
        workspace:   mission.workspace   ?? "",
        brandName:   mission.brandName   ?? undefined,
      }).catch(console.error);

      return { triggered: true };
    }),
});
