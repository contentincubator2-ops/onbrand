// 參考 workspaceRouter.ts 的寫法
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { readdir } from "fs/promises";
import { z } from "zod";

export const resourceRouter = router({
  summary: protectedProcedure
    .input(z.object({ workspace: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { agents: 0, skills: 0, providers: 0, providerList: [] };

      const wsKey = input?.workspace ?? 'global';

      // Map wsKey to agent filter conditions
      const wsFilterMap: Record<string, string> = {
        strategy: `layer='strategy' OR primarySkill LIKE '%brand%' OR primarySkill LIKE '%strategy%' OR primarySkill LIKE '%positioning%'`,
        website:  `primarySkill LIKE '%seo%' OR primarySkill LIKE '%website%' OR primarySkill LIKE '%content%' OR primarySkill LIKE '%copywriting%'`,
        facebook: `primarySkill LIKE '%facebook%' OR primarySkill LIKE '%social%' OR primarySkill LIKE '%ads%' OR primarySkill LIKE '%paid-ads%'`,
      };

      const filter = wsFilterMap[wsKey];

      if (filter) {
        // Count agents matching this workspace
        const [countRows] = await db.execute(
          sql.raw(`SELECT COUNT(*) as cnt FROM agents WHERE isAvailable=1 AND (${filter})`)
        ) as any;
        const agentCount = Number((countRows as any)?.[0]?.cnt ?? 0);

        // Count distinct skills
        const [skillCountRows] = await db.execute(
          sql.raw(`SELECT COUNT(DISTINCT primarySkill) as cnt FROM agents WHERE isAvailable=1 AND primarySkill IS NOT NULL AND primarySkill != '' AND (${filter})`)
        ) as any;
        const skillCount = Number((skillCountRows as any)?.[0]?.cnt ?? 0);
        // Also get list for display
        const [skillRows] = await db.execute(
          sql.raw(`SELECT DISTINCT primarySkill FROM agents WHERE isAvailable=1 AND primarySkill IS NOT NULL AND primarySkill != '' AND (${filter}) LIMIT 20`)
        ) as any;
        const skillSet = new Set<string>((skillRows ?? []).map((r: any) => r.primarySkill).filter(Boolean));

        // Get distinct aiModels (raw strings, no grouping)
        const [modelRows] = await db.execute(
          sql.raw(`SELECT DISTINCT aiModel FROM agents WHERE isAvailable=1 AND aiModel IS NOT NULL AND aiModel != '' AND (${filter})`)
        ) as any;
        const providerList = (modelRows ?? []).map((r: any) => r.aiModel).filter(Boolean) as string[];
        return {
          agents: agentCount,
          skills: skillCount,
          skillList: Array.from(skillSet),
          providers: providerList.length,
          providerList,
          mode: wsKey,
        };
      }

      // Global stats
      const [agentCount] = await db.execute(sql`SELECT COUNT(*) as cnt FROM agents WHERE isAvailable=1`) as any;
      let skillsCount = 0;
      try {
        const dirs = await readdir("/home/azureuser/marketing-os/skills");
        skillsCount = dirs.filter(d => !d.startsWith('.')).length;
      } catch { skillsCount = 5; }

      const [modelRows] = await db.execute(sql`SELECT DISTINCT aiModel FROM agents WHERE aiModel IS NOT NULL AND aiModel != ''`) as any;
      const providerList = (modelRows ?? []).map((r: any) => r.aiModel).filter(Boolean) as string[];

      const agents = (agentCount as any)?.[0]?.cnt ?? 0;
      return {
        agents: Number(agents),
        skills: skillsCount,
        providers: providerList.length,
        providerList,
        mode: 'global',
      };
    }),
});
