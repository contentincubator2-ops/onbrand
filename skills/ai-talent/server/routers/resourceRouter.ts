// 參考 workspaceRouter.ts 的寫法
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { readdir } from "fs/promises";

export const resourceRouter = router({
  // 可用資源摘要（給 AppShell Drawer 顯示）
  summary: protectedProcedure.query(async () => {
    const db = await getDb();
    
    // 1. Agents count
    const agentCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM agents WHERE isAvailable=1`);
    
    // 2. Skills count（讀 /home/azureuser/marketing-os/skills/ 目錄）
    let skillsCount = 0;
    try {
      const dirs = await readdir("/home/azureuser/marketing-os/skills");
      skillsCount = dirs.filter(d => !d.startsWith('.')).length;
    } catch { skillsCount = 5; }
    
    // 3. API Providers（從 agents.aiModel 去重歸類）
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
    };
  }),
});
