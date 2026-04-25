/**
 * audit-workflow-completeness.ts
 *
 * Goal: prove how many of the ~687 active squads have a qualified
 * execution workflow. A "qualified" workflow means:
 *   - squads.steps is a JSON array
 *   - length >= 3
 *   - every element has: order (number), name (string), and
 *     assignedAgentId (number) — the new format expected by the runner.
 *
 * Reports:
 *   - total active squads
 *   - missing (NULL or empty array)
 *   - too-short (1-2 steps)
 *   - legacy format (steps use `owner` string instead of assignedAgentId)
 *   - qualified (passes all checks)
 *   - breakdown by strategy_layer + tier
 *
 * Usage: npx tsx scripts/audit-workflow-completeness.ts
 *        # add `--write-csv` to dump per-squad results
 */
import { createPool } from "mysql2/promise";
import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
dotenv.config();

const writeCsv = process.argv.includes("--write-csv");

interface Row {
  id: number;
  slug: string;
  name: string;
  tier: string | null;
  strategy_layer: string | null;
  is_active: number;
  steps: any;
  agents: any;
}

function parseJson(val: any): any {
  if (val == null) return null;
  if (Array.isArray(val) || typeof val === "object") return val;
  const str = Buffer.isBuffer(val) ? val.toString("utf8") : String(val);
  if (!str || str === "null" || str === "[]") return [];
  try { return JSON.parse(str); } catch { return null; }
}

type Verdict = "qualified" | "missing" | "too-short" | "legacy-format" | "no-agents" | "broken-json";

function classifySquad(r: Row): { verdict: Verdict; stepCount: number; reason: string } {
  const steps = parseJson(r.steps);
  const agents = parseJson(r.agents);
  if (!Array.isArray(agents) || agents.length === 0) {
    return { verdict: "no-agents", stepCount: 0, reason: "agents JSON empty" };
  }
  if (steps === null) return { verdict: "broken-json", stepCount: 0, reason: "steps JSON parse failed" };
  if (!Array.isArray(steps) || steps.length === 0) {
    return { verdict: "missing", stepCount: 0, reason: "steps null or empty" };
  }
  if (steps.length < 3) {
    return { verdict: "too-short", stepCount: steps.length, reason: `only ${steps.length} step(s)` };
  }
  // Check assignedAgentId on every step
  const missingAgent = steps.findIndex(
    (s) => typeof s?.assignedAgentId !== "number"
  );
  if (missingAgent >= 0) {
    const s = steps[missingAgent];
    if (typeof s?.owner === "string") {
      return { verdict: "legacy-format", stepCount: steps.length, reason: `step ${missingAgent + 1} uses legacy 'owner' string` };
    }
    return { verdict: "legacy-format", stepCount: steps.length, reason: `step ${missingAgent + 1} missing assignedAgentId` };
  }
  return { verdict: "qualified", stepCount: steps.length, reason: "ok" };
}

async function main() {
  const pool = createPool({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    charset: "utf8mb4",
  });
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT id, slug, name, tier, strategy_layer, is_active, steps, agents
       FROM squads
       WHERE is_active = 1
       ORDER BY id ASC`
    ) as any[];
    const squads = rows as Row[];
    console.log(`\n📊 Active squads: ${squads.length}\n`);

    const tally: Record<Verdict, number> = {
      qualified: 0, missing: 0, "too-short": 0, "legacy-format": 0, "no-agents": 0, "broken-json": 0,
    };
    const layerTally: Record<string, { total: number; bad: number }> = {};
    const detail: Array<{ id: number; slug: string; layer: string; verdict: Verdict; stepCount: number; reason: string }> = [];

    for (const r of squads) {
      const { verdict, stepCount, reason } = classifySquad(r);
      tally[verdict]++;
      const layer = (r.strategy_layer || r.tier || "?").toString();
      if (!layerTally[layer]) layerTally[layer] = { total: 0, bad: 0 };
      layerTally[layer].total++;
      if (verdict !== "qualified") layerTally[layer].bad++;
      detail.push({ id: r.id, slug: r.slug, layer, verdict, stepCount, reason });
    }

    console.log("── Verdict tally ──────────────────────────");
    for (const [k, v] of Object.entries(tally)) {
      const pct = ((v / squads.length) * 100).toFixed(1);
      console.log(`  ${k.padEnd(15)} ${String(v).padStart(4)}  (${pct}%)`);
    }
    console.log("\n── By layer ───────────────────────────────");
    const layerKeys = Object.keys(layerTally).sort();
    for (const k of layerKeys) {
      const t = layerTally[k];
      console.log(`  ${k.padEnd(20)} total=${String(t.total).padStart(4)}  bad=${String(t.bad).padStart(4)}  qual%=${(((t.total - t.bad) / t.total) * 100).toFixed(0).padStart(3)}`);
    }

    console.log("\n── First 30 problematic squads ───────────");
    const bad = detail.filter((d) => d.verdict !== "qualified");
    for (const d of bad.slice(0, 30)) {
      console.log(`  [${d.verdict.padEnd(13)}] #${String(d.id).padStart(3)} ${d.slug.padEnd(45)} layer=${d.layer.padEnd(8)} ${d.reason}`);
    }
    if (bad.length > 30) console.log(`  ... ${bad.length - 30} more`);

    if (writeCsv) {
      const out = path.join(process.cwd(), "scripts", "audit-workflow-results.csv");
      const lines = ["id,slug,layer,verdict,stepCount,reason"];
      for (const d of detail) {
        lines.push(`${d.id},"${d.slug}","${d.layer}","${d.verdict}",${d.stepCount},"${d.reason.replace(/"/g, '""')}"`);
      }
      fs.writeFileSync(out, lines.join("\n"), "utf8");
      console.log(`\n📁 Wrote ${out}`);
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
