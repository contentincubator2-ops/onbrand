/**
 * squad-builder / validateSquad.ts
 *
 * Sanity checks BEFORE upsert. Fail fast on structural problems.
 */

import type { SquadSpec } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSpec(spec: SquadSpec): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Structural ────────────────────────────────────────────────────────────
  if (!spec.slug) errors.push("slug is empty");
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(spec.slug ?? "")) {
    errors.push(`slug "${spec.slug}" is not valid kebab-case (≤64 chars)`);
  }
  if (!spec.name) errors.push("name is empty");
  if (!spec.description || spec.description.length < 40) {
    errors.push(
      `description too short (${spec.description?.length ?? 0} chars; need ≥40)`,
    );
  }

  // Members ───────────────────────────────────────────────────────────────
  const leads = spec.members.filter((m) => m.isLead);
  if (leads.length !== 1) {
    errors.push(`expected exactly 1 lead member, got ${leads.length}`);
  }
  if (spec.members.length < 4 || spec.members.length > 10) {
    warnings.push(
      `member count = ${spec.members.length} (recommended 5–8)`,
    );
  }

  const memberRoles = new Set<string>();
  for (const m of spec.members) {
    if (memberRoles.has(m.role)) {
      errors.push(`duplicate member role: ${m.role}`);
    }
    memberRoles.add(m.role);
    if (!m.primarySkill) errors.push(`member ${m.role} has empty primarySkill`);
  }

  // Workflow ──────────────────────────────────────────────────────────────
  if (spec.workflow.length < 3 || spec.workflow.length > 8) {
    warnings.push(
      `workflow step count = ${spec.workflow.length} (recommended 4–6)`,
    );
  }
  const stepOrders = new Set<number>();
  for (const s of spec.workflow) {
    if (stepOrders.has(s.order)) errors.push(`duplicate step order: ${s.order}`);
    stepOrders.add(s.order);
    if (s.requiredSkills.length < 3) {
      warnings.push(
        `step "${s.name}" has only ${s.requiredSkills.length} requiredSkills (recommend ≥4)`,
      );
    }
    if (!memberRoles.has(s.stepMemberRole)) {
      errors.push(
        `step "${s.name}" references stepMemberRole="${s.stepMemberRole}" but no such member`,
      );
    }
  }

  // Token / layer / tier ──────────────────────────────────────────────────
  if (spec.tokenBudget < 30_000 || spec.tokenBudget > 120_000) {
    warnings.push(
      `tokenBudget = ${spec.tokenBudget} (typical 60k–80k)`,
    );
  }
  if (!spec.layer || spec.layer === "unassigned") {
    errors.push(`strategy_layer must be set (got "${spec.layer}")`);
  }
  if (!spec.tier) errors.push("tier must be set");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
