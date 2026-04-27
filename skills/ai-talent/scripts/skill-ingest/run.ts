/**
 * Skill ingest — entry point.
 *
 * Usage:
 *   tsx scripts/skill-ingest/run.ts --source anthropic-claude-skills [--limit 50] [--dry-run]
 *
 * Available sources: see `sources/index.ts` registry.
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "../squad-builder/db.js";
import { upsertSkills } from "./upsert";
import { anthropicClaudeSkills } from "./sources/anthropicClaudeSkills";
import { wshobsonAgents } from "./sources/wshobsonAgents";
import { awesomeChatgptPrompts } from "./sources/awesomeChatgptPrompts";
import { linexjlinGpts } from "./sources/linexjlinGpts";
import { voltagentSubagents } from "./sources/voltagentSubagents";
import type { SourceFetcher } from "./types";

dotenv.config();

const REGISTRY: Record<string, SourceFetcher> = {
  [anthropicClaudeSkills.id]: anthropicClaudeSkills,
  [wshobsonAgents.id]:        wshobsonAgents,
  [awesomeChatgptPrompts.id]: awesomeChatgptPrompts,
  [linexjlinGpts.id]:         linexjlinGpts,
  [voltagentSubagents.id]:    voltagentSubagents,
};

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (a) return a.split("=").slice(1).join("=");
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith("--")) {
    return process.argv[i + 1];
  }
  return undefined;
}

async function main() {
  const sourceId = arg("source");
  const limit    = arg("limit") ? parseInt(arg("limit")!, 10) : undefined;
  const dryRun   = process.argv.includes("--dry-run");

  if (!sourceId) {
    console.error("ERROR: --source <id> required");
    console.error("Available:", Object.keys(REGISTRY).join(", "));
    process.exit(2);
  }

  const fetcher = REGISTRY[sourceId];
  if (!fetcher) {
    console.error(`Unknown source: ${sourceId}`);
    console.error("Available:", Object.keys(REGISTRY).join(", "));
    process.exit(2);
  }

  console.log(`===== Ingest: ${fetcher.label} =====`);
  console.log(`origin_model: ${fetcher.originModel}`);
  console.log(`limit:        ${limit ?? "none"}`);
  console.log(`dry-run:      ${dryRun}\n`);

  const skills = await fetcher.fetch({ limit });
  console.log(`\nFetched ${skills.length} skills.`);

  // Aggregates
  const passed = skills.filter((s) => s.securityCheck.passed).length;
  const layers: Record<string, number> = {};
  for (const s of skills) {
    const l = s.strategyLayer ?? "—";
    layers[l] = (layers[l] ?? 0) + 1;
  }
  console.log(`Security: ${passed}/${skills.length} passed`);
  console.log(`Layers:   ${Object.entries(layers).map(([k, v]) => `${k}=${v}`).join("  ")}`);

  if (dryRun) {
    console.log("\n[dry-run] would upsert. Skipping DB write.");
    return;
  }

  const pool = getPool();
  const result = await upsertSkills(pool, skills);
  console.log(`\nDB: inserted=${result.inserted}, updated=${result.updated}, rejected=${result.rejected}`);

  const [total]: any = await pool.execute(
    "SELECT origin_model, COUNT(*) AS n FROM skills GROUP BY origin_model"
  );
  console.log("\nCurrent skills.origin_model distribution:");
  for (const r of total as any[]) console.log(`  ${r.origin_model}: ${r.n}`);

  await closePool();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
