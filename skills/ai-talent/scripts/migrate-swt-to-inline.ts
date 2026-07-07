/**
 * migrate-swt-to-inline.ts — Phase 1 of schema consolidation
 *
 * Backfills `squads.steps` (canonical shape) from `squad_workflow_templates`
 * (legacy curated table). Also normalizes any existing inline `squads.steps`
 * into the same canonical shape.
 *
 * After this script runs successfully and the read path is verified,
 * Phase 4 will DROP the squad_workflow_templates table and the LEFT JOIN
 * inside listByBrand.
 *
 * Canonical step shape (single source of truth):
 *   {
 *     order: number,
 *     name: string,
 *     description: string | null,
 *     requiredSkill: string | null,
 *     assignedAgentId: number | null,
 *     outputType: string | null,
 *     tools: string[],
 *     prompts?: string[]
 *   }
 *
 * Source shapes folded:
 *   - swt.steps:    { step, title, description, owner, output, prompts, sections }
 *   - inline.steps: { order, skill, title|name, outputType, description, requiredTools, assignedAgentId }
 *
 * Resolution rule per squad slug:
 *   1. swt has non-empty rows for slug → use swt (richer; has prompts)
 *   2. else if squads.steps non-empty   → normalize inline in place
 *   3. else → skip (Phase 3 will fill these with squad-builder)
 *
 * Modes:
 *   --dry-run   print plan, no writes
 *   --apply     write squads.steps
 *
 * Usage:
 *   npm run db:migrate-swt -- --dry-run
 *   npm run db:migrate-swt -- --apply
 */

import { createPool, type Pool } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

interface CanonicalStep {
  order: number;
  name: string;
  description: string | null;
  requiredSkill: string | null;
  assignedAgentId: number | null;
  outputType: string | null;
  tools: string[];
  prompts?: string[];
}

function safeJson<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  return fallback;
}

function asArray(val: unknown): any[] {
  if (Array.isArray(val)) return val;
  return [];
}

function asString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val.trim() || null;
  if (typeof val === "number") return String(val);
  return null;
}

function asNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a single raw step (either swt or inline shape) into canonical.
 * Field priority — when both exist, prefer the more specific one.
 */
function normalizeStep(raw: any, fallbackOrder: number): CanonicalStep {
  // order
  const order = asNumber(raw.order) ?? asNumber(raw.step) ?? fallbackOrder;

  // name (curated uses `title`; inline often uses `title` too; some inline use `name`)
  const name = asString(raw.name) ?? asString(raw.title) ?? `Step ${order}`;

  // description
  const description = asString(raw.description);

  // requiredSkill: inline usually has `skill` (string) or `requiredSkills[]`;
  // curated has `owner` (string label) — treat as fallback only
  let requiredSkill: string | null = null;
  if (Array.isArray(raw.requiredSkills) && raw.requiredSkills.length > 0) {
    requiredSkill = asString(raw.requiredSkills[0]);
  }
  if (!requiredSkill) requiredSkill = asString(raw.skill);
  if (!requiredSkill) requiredSkill = asString(raw.requiredSkill);
  if (!requiredSkill) requiredSkill = asString(raw.owner);

  // assignedAgentId — only inline has it; swt does not
  const assignedAgentId = asNumber(raw.assignedAgentId);

  // outputType (inline) / output (curated)
  const outputType = asString(raw.outputType) ?? asString(raw.output);

  // tools — inline has `requiredTools[]`; curated has none
  const toolsRaw = Array.isArray(raw.requiredTools) ? raw.requiredTools
                 : Array.isArray(raw.tools) ? raw.tools : [];
  const tools = toolsRaw.map((t: any) => asString(t)).filter((t): t is string => !!t);

  // prompts (curated only)
  const promptsRaw = Array.isArray(raw.prompts) ? raw.prompts : null;
  const prompts = promptsRaw
    ? promptsRaw.map((p: any) => asString(p)).filter((p): p is string => !!p)
    : null;

  const out: CanonicalStep = {
    order,
    name,
    description,
    requiredSkill,
    assignedAgentId,
    outputType,
    tools,
  };
  if (prompts && prompts.length > 0) out.prompts = prompts;
  return out;
}

function normalizeStepArray(raw: unknown): CanonicalStep[] {
  return asArray(raw).map((s, i) => normalizeStep(s, i + 1));
}

interface SquadRow {
  id: number;
  slug: string;
  name: string;
  inline_steps: any;
}

interface SwtRow {
  taskType: string;
  steps: any;
}

interface PlanItem {
  squadId: number;
  slug: string;
  name: string;
  source: "swt" | "inline-renormalize" | "skip-empty" | "no-change";
  beforeCount: number;
  afterCount: number;
  newSteps: CanonicalStep[];
}

async function buildPlan(pool: Pool): Promise<PlanItem[]> {
  const [squadRows] = await pool.execute(
    `SELECT id, slug, name, steps AS inline_steps
       FROM squads
      WHERE is_active = 1
      ORDER BY id ASC`
  );
  const [swtRows] = await pool.execute(
    `SELECT taskType, steps FROM squad_workflow_templates WHERE isActive = 1`
  );

  const swtMap = new Map<string, any>();
  for (const r of swtRows as SwtRow[]) {
    const arr = safeJson<any[]>(r.steps, []);
    if (Array.isArray(arr) && arr.length > 0) {
      swtMap.set(r.taskType, arr);
    }
  }

  const plan: PlanItem[] = [];
  for (const r of squadRows as SquadRow[]) {
    const inline = safeJson<any[]>(r.inline_steps, []);
    const inlineCount = Array.isArray(inline) ? inline.length : 0;

    const swtSteps = swtMap.get(r.slug);
    let source: PlanItem["source"];
    let newSteps: CanonicalStep[];

    if (swtSteps && swtSteps.length > 0) {
      source = "swt";
      newSteps = normalizeStepArray(swtSteps);
    } else if (inlineCount > 0) {
      // Re-normalize inline so shape is canonical
      newSteps = normalizeStepArray(inline);
      // Compare against current — if identical (already canonical), mark no-change
      const before = JSON.stringify(inline);
      const after = JSON.stringify(newSteps);
      source = before === after ? "no-change" : "inline-renormalize";
    } else {
      source = "skip-empty";
      newSteps = [];
    }

    plan.push({
      squadId: r.id,
      slug: r.slug,
      name: r.name ?? "",
      source,
      beforeCount: inlineCount,
      afterCount: newSteps.length,
      newSteps,
    });
  }
  return plan;
}

function summarize(plan: PlanItem[]) {
  const counts = { swt: 0, inlineRe: 0, noChange: 0, skipEmpty: 0 };
  for (const p of plan) {
    if (p.source === "swt") counts.swt++;
    else if (p.source === "inline-renormalize") counts.inlineRe++;
    else if (p.source === "no-change") counts.noChange++;
    else counts.skipEmpty++;
  }
  console.log("");
  console.log("===== Migration plan summary =====");
  console.log(`  Total active squads:           ${plan.length}`);
  console.log(`  Backfill from swt:             ${counts.swt}`);
  console.log(`  Re-normalize inline in place:  ${counts.inlineRe}`);
  console.log(`  Already canonical (no change): ${counts.noChange}`);
  console.log(`  Empty (Phase 3 will fill):     ${counts.skipEmpty}`);
  console.log(`  Total writes:                  ${counts.swt + counts.inlineRe}`);
  console.log("");
}

function showSamples(plan: PlanItem[], n = 3) {
  console.log("===== Sample (first " + n + " writes from swt) =====");
  let shown = 0;
  for (const p of plan) {
    if (p.source !== "swt") continue;
    if (shown >= n) break;
    shown++;
    console.log(`\n[${p.slug}] (id=${p.squadId}) — ${p.name}`);
    console.log(`  before=${p.beforeCount} steps, after=${p.afterCount} steps`);
    console.log(`  step1:`, JSON.stringify(p.newSteps[0]).slice(0, 300));
  }
}

async function applyPlan(pool: Pool, plan: PlanItem[]) {
  const conn = await pool.getConnection();
  let written = 0;
  try {
    await conn.beginTransaction();
    for (const p of plan) {
      if (p.source !== "swt" && p.source !== "inline-renormalize") continue;
      await conn.execute(
        `UPDATE squads SET steps = CAST(? AS JSON) WHERE id = ?`,
        [JSON.stringify(p.newSteps), p.squadId]
      );
      written++;
      if (written % 25 === 0) console.log(`  ... wrote ${written} rows`);
    }
    await conn.commit();
    console.log(`\n[apply] ✅ Wrote ${written} squads.steps rows in single transaction.`);
  } catch (e) {
    await conn.rollback();
    console.error(`\n[apply] ❌ Rolled back due to error:`, e);
    throw e;
  } finally {
    conn.release();
  }
  return written;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  if (!dryRun && !apply) {
    console.error("Usage: tsx migrate-swt-to-inline.ts --dry-run | --apply");
    process.exit(1);
  }
  if (dryRun && apply) {
    console.error("Pick one: --dry-run OR --apply");
    process.exit(1);
  }

  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || process.env.DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || process.env.DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "MUST_SET_LOCAL_DB_PASSWORD",
    database: process.env.LOCAL_DB_NAME     || process.env.DB_NAME     || "mos_db",
    multipleStatements: false,
  });

  try {
    console.log(`[migrate-swt] Building plan (mode=${dryRun ? "DRY-RUN" : "APPLY"})...`);
    const plan = await buildPlan(pool);
    summarize(plan);
    showSamples(plan, 3);

    if (dryRun) {
      console.log("\n[dry-run] No writes performed. Re-run with --apply to commit.");
      return;
    }

    console.log("\n[apply] Writing canonical steps...");
    await applyPlan(pool, plan);

    // Verify post-write counts
    const [verifyRows]: any = await pool.execute(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN JSON_LENGTH(COALESCE(steps, JSON_ARRAY())) > 0 THEN 1 ELSE 0 END) AS with_steps
      FROM squads WHERE is_active = 1
    `);
    console.log(`\n[verify] active squads = ${verifyRows[0].total}, with_steps = ${verifyRows[0].with_steps}`);

    // Orphan swt rows that have no matching squad — log for awareness
    const [orphans]: any = await pool.execute(`
      SELECT t.taskType
        FROM squad_workflow_templates t
       WHERE t.isActive = 1
         AND NOT EXISTS (
           SELECT 1 FROM squads s
            WHERE s.slug COLLATE utf8mb4_unicode_ci = t.taskType COLLATE utf8mb4_unicode_ci
              AND s.is_active = 1
         )
    `);
    if ((orphans as any[]).length > 0) {
      console.log(`\n[verify] ${(orphans as any[]).length} swt rows have no matching active squad (will be lost when swt is dropped):`);
      for (const o of orphans as any[]) console.log(`   - ${o.taskType}`);
    } else {
      console.log(`\n[verify] No orphan swt rows. Safe to DROP squad_workflow_templates.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[migrate-swt] FATAL:", e);
  process.exit(1);
});
