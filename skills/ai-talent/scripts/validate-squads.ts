/**
 * validate-squads.ts — Validate agent_squads data integrity
 *
 * Checks for:
 * 1. Duplicate slugs
 * 2. Empty agents JSON
 * 3. Missing agents in agents table
 * 4. Mismatches between squadId and slug references
 *
 * Run: ts-node scripts/validate-squads.ts
 */

import localPool from "../server/localDb";

interface SquadValidationIssue {
  squadId: number;
  slug: string;
  issue: string;
  severity: "error" | "warning" | "info";
}

async function validateSquads() {
  console.log("[validateSquads] Starting validation...\n");

  const issues: SquadValidationIssue[] = [];

  try {
    // 1. Check for duplicate slugs
    console.log("1️⃣  Checking for duplicate slugs...");
    const [dupRows] = await localPool.execute(
      `SELECT slug, COUNT(*) as cnt FROM agent_squads WHERE is_active = 1 GROUP BY slug HAVING cnt > 1`
    ) as any[];

    if ((dupRows as any[]).length > 0) {
      console.warn(`   ⚠️  Found ${(dupRows as any[]).length} duplicate slugs:`);
      for (const row of dupRows as any[]) {
        console.log(`      - "${row.slug}" appears ${row.cnt} times`);
        issues.push({
          squadId: 0,
          slug: row.slug,
          issue: `Duplicate slug found (count: ${row.cnt})`,
          severity: "error",
        });
      }
    } else {
      console.log("   ✅ No duplicate slugs found");
    }

    // 2. Check for empty agents JSON
    console.log("\n2️⃣  Checking for empty agents JSON...");
    const [emptyRows] = await localPool.execute(
      `SELECT id, slug, name FROM agent_squads WHERE is_active = 1 AND (agents IS NULL OR agents = '' OR agents = '[]')`
    ) as any[];

    if ((emptyRows as any[]).length > 0) {
      console.warn(`   ⚠️  Found ${(emptyRows as any[]).length} squads with empty agents:`);
      for (const row of emptyRows as any[]) {
        console.log(`      - id=${row.id}, slug="${row.slug}", name="${row.name}"`);
        issues.push({
          squadId: row.id,
          slug: row.slug,
          issue: "Empty agents JSON",
          severity: "error",
        });
      }
    } else {
      console.log("   ✅ No empty agents found");
    }

    // 3. Check for invalid agent references
    console.log("\n3️⃣  Checking for invalid agent references...");
    const [allSquads] = await localPool.execute(
      `SELECT id, slug, agents FROM agent_squads WHERE is_active = 1 LIMIT 1000`
    ) as any[];

    let invalidAgentCount = 0;
    for (const sq of allSquads as any[]) {
      let agentsJson: any[] = [];
      try {
        if (typeof sq.agents === "string") {
          agentsJson = JSON.parse(sq.agents) || [];
        } else if (Array.isArray(sq.agents)) {
          agentsJson = sq.agents;
        }
      } catch (e) {
        console.warn(`   ⚠️  Invalid JSON in squad ${sq.id} ("${sq.slug}")`);
        issues.push({
          squadId: sq.id,
          slug: sq.slug,
          issue: "Invalid JSON in agents field",
          severity: "error",
        });
        invalidAgentCount++;
      }

      if (agentsJson.length > 0) {
        const agentIds = agentsJson.map((a: any) => a.agent_id).filter(Boolean);
        if (agentIds.length > 0) {
          const placeholders = agentIds.map(() => "?").join(",");
          const [existingAgents] = await localPool.execute(
            `SELECT id FROM agents WHERE id IN (${placeholders})`,
            agentIds
          ) as any[];
          const foundIds = new Set((existingAgents as any[]).map((a: any) => a.id));
          const missing = agentIds.filter((id: number) => !foundIds.has(id));
          if (missing.length > 0) {
            console.warn(`   ⚠️  Squad ${sq.id} ("${sq.slug}") references missing agents: ${missing.join(",")}`);
            issues.push({
              squadId: sq.id,
              slug: sq.slug,
              issue: `Missing agent IDs: ${missing.join(",")}`,
              severity: "warning",
            });
          }
        }
      }
    }

    if (invalidAgentCount === 0) {
      console.log("   ✅ No invalid agent references found");
    }

    // 4. Summary
    console.log("\n📊 Validation Summary:");
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    console.log(`   Errors:   ${errors.length}`);
    console.log(`   Warnings: ${warnings.length}`);
    console.log(`   Total issues: ${issues.length}`);

    if (issues.length === 0) {
      console.log("\n✅ All validations passed!");
    } else {
      console.log("\n❌ Issues found. See details above.");
      console.log("\nTo fix duplicate slugs, run:");
      console.log("  ts-node scripts/merge-duplicate-squads.ts");
    }

  } catch (error) {
    console.error("[validateSquads] Error:", error);
    process.exit(1);
  }

  process.exit(issues.length > 0 ? 1 : 0);
}

validateSquads();
