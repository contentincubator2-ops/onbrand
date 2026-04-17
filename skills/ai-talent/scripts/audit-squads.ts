/**
 * audit-squads.ts
 * 全面審計 agent_squads 欄位完整性
 * 輸出：每個 squad 哪些欄位缺失 / 空陣列 / 為 null
 *
 * Usage: npm run db:audit-squads
 */
import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

// 欄位完整性規範
const REQUIRED_FIELDS = [
  "name",
  "description",
  "missionType",
  "methodology",
  "workspace",    // JSON array, length >= 1
  "agents",       // JSON array, length >= 1
  "tags",         // JSON array, length >= 3
  "use_cases",    // JSON array, length >= 1
  "output_formats",
  "required_integrations",
  "showcases",    // JSON array, length >= 1
] as const;

type FieldName = typeof REQUIRED_FIELDS[number];

interface SquadAudit {
  id: number;
  slug: string;
  name: string;
  missing: FieldName[];
  empty: FieldName[];
  agentCount: number;
  tagCount: number;
  showcaseCount: number;
  token: number;
}

function parseJsonArray(val: string | null): any[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function checkField(val: string | null, fieldName: FieldName, minLen = 1): "ok" | "null" | "empty" {
  if (val === null || val === undefined) return "null";
  const trimmed = val.toString().trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "[]" || trimmed === "{}") return "empty";
  // For JSON array fields, also check array length
  if (["workspace", "agents", "tags", "use_cases", "output_formats", "required_integrations", "showcases"].includes(fieldName)) {
    const arr = parseJsonArray(val);
    if (arr.length < minLen) return "empty";
  }
  return "ok";
}

async function main() {
  const pool = createPool({
    host:     process.env.DB_HOST!,
    user:     process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: { rejectUnauthorized: false },
  });

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT
        id, slug, name, description,
        missionType, methodology,
        workspace, agents, tags,
        use_cases, output_formats, required_integrations,
        showcases, token
      FROM agent_squads
      WHERE is_active = 1
      ORDER BY id ASC
    `) as any[];

    const squads = rows as any[];
    console.log(`\n${"=".repeat(70)}`);
    console.log(`SQUAD 欄位完整性審計  (${squads.length} 個 active squads)`);
    console.log(`${"=".repeat(70)}\n`);

    const audits: SquadAudit[] = [];
    let perfectCount = 0;

    for (const s of squads) {
      const missing: FieldName[] = [];
      const empty: FieldName[] = [];

      // 各欄位最低要求
      const checks: [FieldName, string | null, number][] = [
        ["name",                   s.name,                   1],
        ["description",            s.description,            1],
        ["missionType",            s.missionType,            1],
        ["methodology",            s.methodology,            1],
        ["workspace",              s.workspace,              1],
        ["agents",                 s.agents,                 1],
        ["tags",                   s.tags,                   3],
        ["use_cases",              s.use_cases,              1],
        ["output_formats",         s.output_formats,         1],
        ["required_integrations",  s.required_integrations,  1],
        ["showcases",              s.showcases,              1],
      ];

      for (const [field, val, minLen] of checks) {
        const result = checkField(val, field, minLen);
        if (result === "null") missing.push(field);
        else if (result === "empty") empty.push(field);
      }

      const agentArr = parseJsonArray(s.agents);
      const tagArr   = parseJsonArray(s.tags);
      const showArr  = parseJsonArray(s.showcases);

      audits.push({
        id: s.id,
        slug: s.slug,
        name: s.name ?? "(no name)",
        missing,
        empty,
        agentCount: agentArr.length,
        tagCount:   tagArr.length,
        showcaseCount: showArr.length,
        token: s.token ?? 0,
      });

      if (missing.length === 0 && empty.length === 0) perfectCount++;
    }

    // ── 問題 squads 輸出 ────────────────────────────────────────────────────
    const problemSquads = audits.filter(a => a.missing.length > 0 || a.empty.length > 0);
    if (problemSquads.length === 0) {
      console.log("✅ 所有 squads 欄位均完整！\n");
    } else {
      console.log(`⚠️  發現 ${problemSquads.length} 個 squad 有欄位問題：\n`);
      for (const a of problemSquads) {
        console.log(`[${a.id}] ${a.slug}`);
        console.log(`  名稱: ${a.name}`);
        if (a.missing.length > 0) console.log(`  ❌ 欄位缺失 (NULL): ${a.missing.join(", ")}`);
        if (a.empty.length > 0)   console.log(`  ⚠️  欄位為空陣列/空字串: ${a.empty.join(", ")}`);
        console.log(`  agents: ${a.agentCount}  tags: ${a.tagCount}  showcases: ${a.showcaseCount}  token: ${a.token}`);
        console.log("");
      }
    }

    // ── 欄位缺失統計 ────────────────────────────────────────────────────────
    console.log(`${"─".repeat(70)}`);
    console.log(`各欄位缺失統計：`);
    const fieldStats: Record<string, { null: number; empty: number }> = {};
    for (const f of REQUIRED_FIELDS) fieldStats[f] = { null: 0, empty: 0 };
    for (const a of audits) {
      for (const f of a.missing) fieldStats[f].null++;
      for (const f of a.empty)   fieldStats[f].empty++;
    }
    let anyIssue = false;
    for (const [field, stat] of Object.entries(fieldStats)) {
      if (stat.null > 0 || stat.empty > 0) {
        console.log(`  ${field.padEnd(26)} NULL: ${stat.null}  EMPTY: ${stat.empty}`);
        anyIssue = true;
      }
    }
    if (!anyIssue) console.log("  （所有欄位均無問題）");

    // ── 摘要 ────────────────────────────────────────────────────────────────
    console.log(`\n${"─".repeat(70)}`);
    console.log(`摘要`);
    console.log(`  總 active squads:      ${squads.length}`);
    console.log(`  ✅ 完整 squads:        ${perfectCount}`);
    console.log(`  ⚠️  有問題 squads:     ${problemSquads.length}`);

    // agents 數量分布
    const agentDist = { zero: 0, one: 0, twoThree: 0, fourPlus: 0 };
    for (const a of audits) {
      if (a.agentCount === 0) agentDist.zero++;
      else if (a.agentCount === 1) agentDist.one++;
      else if (a.agentCount <= 3) agentDist.twoThree++;
      else agentDist.fourPlus++;
    }
    console.log(`\n  Agent 數量分佈:`);
    console.log(`    0 agents: ${agentDist.zero}  |  1 agent: ${agentDist.one}  |  2-3 agents: ${agentDist.twoThree}  |  4+ agents: ${agentDist.fourPlus}`);

    // tags 數量分布
    const tagDist = { few: 0, ok: 0, rich: 0 };
    for (const a of audits) {
      if (a.tagCount < 3) tagDist.few++;
      else if (a.tagCount < 8) tagDist.ok++;
      else tagDist.rich++;
    }
    console.log(`\n  Tags 數量分佈:`);
    console.log(`    <3 tags: ${tagDist.few}  |  3-7 tags: ${tagDist.ok}  |  8+ tags: ${tagDist.rich}`);

    console.log(`\n${"=".repeat(70)}\n`);

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[audit-squads] ERROR:", err.message ?? err);
  process.exit(1);
});
