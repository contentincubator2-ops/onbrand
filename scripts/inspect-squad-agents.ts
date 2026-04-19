/**
 * inspect-squad-agents.ts
 * 列出指定 squad 每個 Step 的指派 Agent ID、姓名、primarySkill、aiModel
 *
 * 用法（VM 上執行）：
 *   npx tsx scripts/inspect-squad-agents.ts
 *   npx tsx scripts/inspect-squad-agents.ts brand-archetype-positioning
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config({ path: require("path").resolve(__dirname, "../skills/ai-talent/.env") });

const SQUAD_SLUG = process.argv[2] ?? "brand-archetype-positioning";

async function main() {
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     ?? "127.0.0.1",
    port:     Number(process.env.LOCAL_DB_PORT ?? 3306),
    user:     process.env.LOCAL_DB_USER     ?? "mos_user",
    password: process.env.LOCAL_DB_PASSWORD ?? "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     ?? "mos_db",
    ssl: undefined,
  });

  try {
    // 1. Find squad
    const [squadRows] = await pool.execute(
      `SELECT id, slug, name, agents, steps, missionType FROM squads WHERE slug = ? AND is_active = 1 LIMIT 1`,
      [SQUAD_SLUG]
    ) as any[];
    const squad = (squadRows as any[])[0];
    if (!squad) {
      console.error(`[ERROR] Squad not found: ${SQUAD_SLUG}`);
      process.exit(1);
    }
    console.log(`\n====================================================`);
    console.log(`Squad: ${squad.name} (${squad.slug})`);
    console.log(`====================================================\n`);

    // 2. Parse steps
    const steps: any[] = JSON.parse(squad.steps ?? "[]");
    if (!steps.length) {
      console.warn("[WARN] No steps found in squad.steps, checking squad_template...");
      const [wfRows] = await pool.execute(
        `SELECT steps FROM squad_template WHERE taskType = ? AND isActive = 1 LIMIT 1`,
        [squad.missionType]
      ) as any[];
      const wf = (wfRows as any[])[0];
      if (wf) steps.push(...JSON.parse(wf.steps ?? "[]"));
    }

    // 3. Collect all assignedAgentIds
    const agentIds = [...new Set(steps.map(s => s.assignedAgentId).filter(Boolean))] as number[];

    // 4. Fetch agent details
    const agentMap: Record<number, any> = {};
    if (agentIds.length) {
      const [agentRows] = await pool.execute(
        `SELECT id, name, title, primarySkill, aiModel, specialty FROM agents WHERE id IN (${agentIds.join(",")}) LIMIT 50`
      ) as any[];
      for (const a of agentRows as any[]) agentMap[a.id] = a;
    }

    // 5. Also fetch lead info
    const agentsJson: any[] = JSON.parse(squad.agents ?? "[]");
    const leadEntry = agentsJson.find(m => m.is_lead);
    let leadAgent: any = null;
    if (leadEntry?.agent_id) {
      const [lr] = await pool.execute(
        `SELECT id, name, title, primarySkill, aiModel FROM agents WHERE id = ? LIMIT 1`,
        [leadEntry.agent_id]
      ) as any[];
      leadAgent = (lr as any[])[0] ?? null;
    }

    // 6. Print Squad Lead info
    if (leadAgent) {
      console.log(`Squad Lead (Intake + Synthesis):`);
      console.log(`  Agent ID  : ${leadAgent.id}`);
      console.log(`  Name      : ${leadAgent.name}`);
      console.log(`  Title     : ${leadAgent.title ?? "—"}`);
      console.log(`  Skill     : ${leadAgent.primarySkill ?? "—"}`);
      console.log(`  AI Model  : ${leadAgent.aiModel ?? "—"}\n`);
    }

    // 7. Print per-step assignments
    console.log(`Step-by-Step Agent Assignments:`);
    console.log(`-------------------------------------------------------`);
    for (const step of steps.sort((a, b) => (a.order ?? a.step ?? 0) - (b.order ?? b.step ?? 0))) {
      const stepNum = step.order ?? step.step ?? "?";
      const stepName = step.name ?? step.title ?? "(no name)";
      const agentId: number | null = step.assignedAgentId ?? null;
      const agent = agentId ? agentMap[agentId] : null;

      console.log(`\nStep ${stepNum}: ${stepName}`);
      if (agent) {
        console.log(`  Agent ID  : ${agent.id}`);
        console.log(`  Name      : ${agent.name}`);
        console.log(`  Title     : ${agent.title ?? "—"}`);
        console.log(`  Primary   : ${agent.primarySkill ?? "—"}`);
        console.log(`  AI Model  : ${agent.aiModel ?? "—"}`);
      } else if (agentId) {
        console.log(`  Agent ID  : ${agentId} (not found in agents table)`);
      } else {
        console.log(`  Agent     : (Squad Lead — intake/synthesis)`);
        if (leadAgent) {
          console.log(`  Agent ID  : ${leadAgent.id}`);
          console.log(`  Name      : ${leadAgent.name}`);
          console.log(`  Skill     : ${leadAgent.primarySkill ?? "—"}`);
          console.log(`  AI Model  : ${leadAgent.aiModel ?? "—"}`);
        }
      }
      if (step.requiredSkills?.length) {
        console.log(`  Req Skills: ${step.requiredSkills.join(", ")}`);
      }
    }

    console.log(`\n====================================================`);
    console.log(`Total steps: ${steps.length}`);
    console.log(`Unique specialist agents: ${agentIds.length}`);
    console.log(`====================================================\n`);

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
