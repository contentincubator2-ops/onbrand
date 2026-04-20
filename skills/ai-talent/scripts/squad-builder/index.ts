/**
 * squad-builder / index.ts
 *
 * CLI entry. Orchestrates: validate → resolve members → upsert.
 *
 * Usage:
 *   npx tsx scripts/squad-builder/index.ts L1-brand
 *   npx tsx scripts/squad-builder/index.ts L1-brand --slug=mind-positioning
 *   npx tsx scripts/squad-builder/index.ts L1-brand --dry-run
 */

import type { ResolvedMember, SquadSpec } from "./types.js";
import { findOrCreateAgent } from "./findOrCreateAgent.js";
import { upsertSquad } from "./upsertSquad.js";
import { validateSpec } from "./validateSquad.js";
import { closePool } from "./db.js";

interface BuildResult {
  spec: SquadSpec;
  squadId?: number;
  members: ResolvedMember[];
  errors: string[];
  warnings: string[];
  skipped: boolean;
}

export async function buildSquad(
  spec: SquadSpec,
  opts: { dryRun?: boolean; leadsUsed?: number[] } = {},
): Promise<BuildResult> {
  const result: BuildResult = {
    spec,
    members: [],
    errors: [],
    warnings: [],
    skipped: false,
  };

  // 1. Validate spec
  const v = validateSpec(spec);
  result.warnings.push(...v.warnings);
  if (!v.valid) {
    result.errors.push(...v.errors);
    result.skipped = true;
    return result;
  }

  // 2. Resolve members (find existing or create new)
  const usedIds: number[] = [];
  for (const memberSpec of spec.members) {
    try {
      const resolved = await findOrCreateAgent(
        memberSpec,
        spec.slug,
        usedIds,
        opts.leadsUsed ?? [],
      );
      result.members.push(resolved);
      usedIds.push(resolved.agent.id);
    } catch (err: any) {
      result.errors.push(
        `member ${memberSpec.role}: ${err.message ?? err}`,
      );
      result.skipped = true;
      return result;
    }
  }

  // 3. Upsert (unless dry-run)
  if (opts.dryRun) {
    console.log(`[buildSquad] DRY RUN — would upsert squad "${spec.slug}"`);
    return result;
  }

  try {
    const { squadId } = await upsertSquad(spec, result.members);
    result.squadId = squadId;
  } catch (err: any) {
    result.errors.push(`upsert failed: ${err.message ?? err}`);
    result.skipped = true;
  }

  return result;
}

/**
 * Build an entire layer's worth of squads.
 */
export async function buildLayer(
  layerName: string,
  specs: SquadSpec[],
  opts: { dryRun?: boolean; onlySlug?: string } = {},
): Promise<void> {
  const toBuild = opts.onlySlug
    ? specs.filter((s) => s.slug === opts.onlySlug)
    : specs;

  if (toBuild.length === 0) {
    console.log(`[buildLayer] no specs match filter; nothing to do.`);
    return;
  }

  console.log(
    `\n======= building layer=${layerName} (${toBuild.length} squads, dry-run=${!!opts.dryRun}) =======\n`,
  );

  const leadsUsed: number[] = [];
  const report: BuildResult[] = [];

  for (const spec of toBuild) {
    console.log(`\n--- squad: ${spec.slug} (${spec.name}) ---`);
    const res = await buildSquad(spec, {
      dryRun: opts.dryRun,
      leadsUsed,
    });
    if (res.warnings.length > 0) {
      for (const w of res.warnings) console.log(`  ⚠️  ${w}`);
    }
    if (res.errors.length > 0) {
      for (const e of res.errors) console.log(`  ❌  ${e}`);
    }
    if (!res.skipped) {
      for (const m of res.members) {
        const lead = m.spec.isLead ? " ⭐ LEAD" : "";
        const newMark = m.wasCreated ? " [NEW]" : "";
        console.log(
          `  ✓ ${m.spec.role.padEnd(32)} → agent #${m.agent.id} ${m.agent.name} (${m.agent.primarySkill})${lead}${newMark}`,
        );
        if (m.spec.isLead) leadsUsed.push(m.agent.id);
      }
      if (res.squadId) {
        console.log(`  → squad_id=${res.squadId}`);
      }
    }
    report.push(res);
  }

  // Summary
  const ok = report.filter((r) => !r.skipped).length;
  const failed = report.filter((r) => r.skipped).length;
  const newAgents = report
    .flatMap((r) => r.members)
    .filter((m) => m.wasCreated).length;
  console.log(
    `\n======= done: ${ok} squads built, ${failed} skipped, ${newAgents} new agents created =======\n`,
  );
}

/**
 * Dynamic import of a layer's spec file.
 */
async function loadLayerSpecs(layerName: string): Promise<SquadSpec[]> {
  // e.g. "L1-brand" → "./L1-brand.js"
  const mod = await import(`./${layerName}.js`);
  if (!mod.specs || !Array.isArray(mod.specs)) {
    throw new Error(
      `Layer file ${layerName} does not export a \`specs: SquadSpec[]\`.`,
    );
  }
  return mod.specs as SquadSpec[];
}

// ── CLI entry ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const layerName = args[0];
  if (!layerName) {
    console.error("Usage: tsx scripts/squad-builder/index.ts <layer-name> [--dry-run] [--slug=...]");
    console.error("Example: tsx scripts/squad-builder/index.ts L1-brand");
    process.exit(2);
  }

  const dryRun = args.includes("--dry-run");
  const slugArg = args.find((a) => a.startsWith("--slug="));
  const onlySlug = slugArg ? slugArg.split("=")[1] : undefined;

  try {
    const specs = await loadLayerSpecs(layerName);
    await buildLayer(layerName, specs, { dryRun, onlySlug });
  } catch (err: any) {
    console.error("[build] FAILED:", err?.message ?? err);
    console.error(err?.stack ?? "");
    process.exit(1);
  } finally {
    await closePool();
  }
}

// tsx always runs top-level; only call main if this file is the entry
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` ||
    process.argv[1].endsWith("index.ts")) {
  main();
}
