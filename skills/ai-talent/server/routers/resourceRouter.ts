// 參考 workspaceRouter.ts 的寫法
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { readdir } from "fs/promises";
import { z } from "zod";

export const resourceRouter = router({
  summary: protectedProcedure
    .input(z.object({ missionWorkspace: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { agents: 0, skills: 0, providers: 0, providerList: [] };

      if (input?.missionWorkspace === 'strategy') {
        const [squadRows] = await db.execute(
          sql`SELECT a.id, a.aiModel, a.primarySkill
              FROM agent_squad_members asm
              JOIN agents a ON a.id = asm.agentId
              JOIN agent_squads s ON s.id = asm.squadId
              WHERE s.slug = 'brand-positioning' AND a.isAvailable = 1`
        ) as any;
        const members = (squadRows ?? []) as Array<{id:number, aiModel:string, primarySkill:string}>;
        const providers = new Set<string>();
        const skills = new Set<string>();
        for (const m of members) {
          const mod = m.aiModel?.toLowerCase() ?? '';
          if (mod.includes('gpt') || mod.includes('openai')) providers.add('OpenAI');
          else if (mod.includes('claude') || mod.includes('anthropic')) providers.add('Anthropic');
          else if (mod.includes('gemini') || mod.includes('google')) providers.add('Google');
          else if (mod.includes('deepseek')) providers.add('DeepSeek');
          if (m.primarySkill) skills.add(m.primarySkill);
        }
        return {
          agents: members.length,
          skills: skills.size || 3,
          providers: providers.size || 2,
          providerList: Array.from(providers),
          mode: 'positioning',
        };
      }

      const agentCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM agents WHERE isAvailable=1`);
      let skillsCount = 0;
      try {
        const dirs = await readdir("/home/azureuser/marketing-os/skills");
        skillsCount = dirs.filter(d => !d.startsWith('.')).length;
      } catch { skillsCount = 5; }

      const modelRows = await db.execute(sql`SELECT DISTINCT aiModel FROM agents WHERE aiModel IS NOT NULL AND aiModel != ''`);
      const models = (Array.isArray(modelRows[0]) ? modelRows[0] : modelRows) as Array<{aiModel: string}>;
      const providers = new Set<string>();
      for (const row of models) {
        const m = (row as any).aiModel?.toLowerCase() ?? '';
        if (m.includes('gpt') || m.includes('openai')) providers.add('OpenAI');
        else if (m.includes('claude') || m.includes('anthropic')) providers.add('Anthropic');
        else if (m.includes('gemini') || m.includes('google') || m.includes('vertex')) providers.add('Google');
        else if (m.includes('deepseek')) providers.add('DeepSeek');
        else if (m.includes('qwen') || m.includes('alibaba')) providers.add('Alibaba');
        else if (m.includes('azure')) providers.add('Azure');
        else if (m.includes('mistral')) providers.add('Mistral');
        else if (m.includes('llama') || m.includes('meta')) providers.add('Meta');
        else if (m) providers.add(m);
      }

      const agentRows = Array.isArray(agentCount[0]) ? agentCount[0] : agentCount;
      const agents = (agentRows[0] as any)?.cnt ?? 0;

      return {
        agents: Number(agents),
        skills: skillsCount,
        providers: providers.size,
        providerList: Array.from(providers),
        mode: 'global',
      };
    }),
});
