/**
 * analyze-existing-squads.ts
 * 分析 mos_db 中現有的 squads 和 agents，輸出 JSON 報告
 * 用途：在為新方法論分配 squad 前，先了解現有資源
 *
 * Usage: npm run analyze-squads
 */
import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
import { writeFileSync } from "fs";
import { join } from "path";

dotenv.config();

async function main() {
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || "localhost",
    port:     parseInt(process.env.LOCAL_DB_PORT || "3306"),
    user:     process.env.LOCAL_DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || "MUST_SET_LOCAL_DB_PASSWORD",
    database: process.env.LOCAL_DB_NAME     || "mos_db",
    charset:  "utf8mb4",
  });

  const conn = await pool.getConnection();
  try {
    // ── 1. 總覽 ─────────────────────────────────────────────────────────────
    const [totalSquads] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM squads WHERE is_active=1`
    ) as any[];
    const [totalAgents] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM agents WHERE isAvailable=1`
    ) as any[];

    console.log(`\n===== mos_db 資源摘要 =====`);
    console.log(`Active Squads: ${(totalSquads as any[])[0].cnt}`);
    console.log(`Available Agents: ${(totalAgents as any[])[0].cnt}`);

    // ── 2. 所有 Squads 清單 ──────────────────────────────────────────────────
    const [squads] = await conn.execute(`
      SELECT id, slug, name, description,
             missionType, methodology,
             workspace, tags, token,
             JSON_LENGTH(agents) as agent_count
      FROM squads
      WHERE is_active=1
      ORDER BY id ASC
    `) as any[];

    console.log(`\n===== 所有 Squads（${(squads as any[]).length}個）=====`);
    (squads as any[]).forEach((s: any) => {
      console.log(`[${s.id}] ${s.slug}`);
      console.log(`  名稱: ${s.name}`);
      console.log(`  missionType: ${s.missionType || "(無)"}`);
      console.log(`  methodology: ${s.methodology || "(無)"}`);
      console.log(`  workspace: ${s.workspace || "(無)"}`);
      console.log(`  agents: ${s.agent_count || 0} 人`);
      console.log(`  tags: ${s.tags ? s.tags.slice(0, 100) : "(無)"}`);
      console.log("");
    });

    // ── 3. Agent 技能分佈 ────────────────────────────────────────────────────
    const [skillDist] = await conn.execute(`
      SELECT primarySkill, COUNT(*) as cnt
      FROM agents
      WHERE isAvailable=1 AND primarySkill IS NOT NULL AND primarySkill != ''
      GROUP BY primarySkill
      ORDER BY cnt DESC
      LIMIT 80
    `) as any[];

    console.log(`\n===== Agent primarySkill 分佈（Top 80）=====`);
    (skillDist as any[]).forEach((r: any) => {
      console.log(`${r.cnt.toString().padStart(5)} agents | ${r.primarySkill}`);
    });

    // ── 4. Workspace 分佈（squads）──────────────────────────────────────────
    const [wsDist] = await conn.execute(`
      SELECT workspace, COUNT(*) as cnt
      FROM squads
      WHERE is_active=1 AND workspace IS NOT NULL AND workspace != ''
      GROUP BY workspace
      ORDER BY cnt DESC
      LIMIT 40
    `) as any[];

    console.log(`\n===== Squad workspace 分佈（Top 40）=====`);
    (wsDist as any[]).forEach((r: any) => {
      console.log(`${r.cnt.toString().padStart(4)} squads | ${r.workspace}`);
    });

    // ── 5. MissionType 分佈 ──────────────────────────────────────────────────
    const [mtDist] = await conn.execute(`
      SELECT missionType, COUNT(*) as cnt
      FROM squads
      WHERE is_active=1
      GROUP BY missionType
      ORDER BY cnt DESC
      LIMIT 60
    `) as any[];

    console.log(`\n===== Squad missionType 分佈（Top 60）=====`);
    (mtDist as any[]).forEach((r: any) => {
      console.log(`${r.cnt.toString().padStart(4)} squads | ${r.missionType || "(null)"}`);
    });

    // ── 6. 匯出 JSON 供後續分析 ──────────────────────────────────────────────
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalActiveSquads: (totalSquads as any[])[0].cnt,
        totalAvailableAgents: (totalAgents as any[])[0].cnt,
      },
      squads: (squads as any[]).map((s: any) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        missionType: s.missionType,
        methodology: s.methodology,
        workspace: s.workspace,
        tags: s.tags,
        agentCount: s.agent_count,
      })),
      skillDistribution: skillDist,
      workspaceDistribution: wsDist,
      missionTypeDistribution: mtDist,
    };

    const outputPath = join(process.cwd(), "scripts", "squad-analysis-report.json");
    writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n✅ JSON 報告已輸出：${outputPath}`);

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message ?? err);
  process.exit(1);
});
