import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";

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
              if (!db) return { agents: 0, skills: 0, providers: 0, providerList: [] };

                   const wsKey = input?.workspace ?? "global";

                   // Map wsKey to SQL WHERE fragment (matches AppShell.tsx wsKey values)
                   const wsFilterMap: Record<string, string> = {
                             strategy: `layer='strategy' OR primarySkill LIKE '%brand%' OR primarySkill LIKE '%strategy%' OR primarySkill LIKE '%positioning%'`,
                             website:  `primarySkill LIKE '%seo%' OR primarySkill LIKE '%website%' OR primarySkill LIKE '%content%' OR primarySkill LIKE '%copywriting%'`,
                             facebook: `primarySkill LIKE '%facebook%' OR primarySkill LIKE '%social%' OR primarySkill LIKE '%ads%' OR primarySkill LIKE '%paid-ads%'`,
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

                   // Count distinct skills (fix: was using readdir() before = wrong count)
                   const [skillCountRows] = await db.execute(
                             sql.raw(`SELECT COUNT(DISTINCT primarySkill) as cnt FROM agents WHERE ${whereClause} AND primarySkill IS NOT NULL AND primarySkill != ''`)
                           ) as any;
              const skillCount = Number((skillCountRows as any)?.[0]?.cnt ?? 0);

                   // Get sample skill list (top 20 for display)
                   const [skillRows] = await db.execute(
                             sql.raw(`SELECT DISTINCT primarySkill FROM agents WHERE ${whereClause} AND primarySkill IS NOT NULL AND primarySkill != '' LIMIT 20`)
                           ) as any;
              const skillSet = new Set<string>((skillRows ?? []).map((r: any) => r.primarySkill).filter(Boolean));

                   // Count distinct AI models (fix: was returning 2 before)
                   const [modelCountRows] = await db.execute(
                             sql.raw(`SELECT COUNT(DISTINCT aiModel) as cnt FROM agents WHERE ${whereClause} AND aiModel IS NOT NULL AND aiModel != ''`)
                           ) as any;
              const providerCount = Number((modelCountRows as any)?.[0]?.cnt ?? 0);

                   // Get distinct AI model list
                   const [modelRows] = await db.execute(
                             sql.raw(`SELECT DISTINCT aiModel FROM agents WHERE ${whereClause} AND aiModel IS NOT NULL AND aiModel != ''`)
                           ) as any;
              const providerList = (modelRows ?? []).map((r: any) => r.aiModel).filter(Boolean) as string[];

                   return {
                             agents: agentCount,
                             skills: skillCount,
                             skillList: Array.from(skillSet),
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
});
