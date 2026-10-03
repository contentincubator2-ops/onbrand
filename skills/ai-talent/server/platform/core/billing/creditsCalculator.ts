/**
 * Credits Calculator — Hybrid Model (Plan C)
 *
 * Formula:
 *   finalCredits = baseCredits × knowledgeDepthFactor × instructionComplexityFactor × outputScaleFactor
 *                  + ragQueryCredits ± randomVariation(5%)
 *
 * Billing rules:
 *   - User-initiated chat / tasks: FREE (included in monthly plan, logged only)
 *   - User adopts AI proactive proposal: CHARGED (deducted from credits)
 *
 * NOTE (2026-05-19): Active billing now uses plans.ts pointsPerCycle + deductCredits.ts wallet system.
 * PLAN_CREDITS here is a legacy lookup used ONLY for wallet initialisation in deductCredits.ts ensureWallet().
 * Plan codes: trial / drop_starter / drop_pro / enterprise.
 * Trial = 1,000 pts one-time (aligned with plans.ts quota.pointsPerCycle).
 * Starter uses run-count gating (runsPerCycle=50), not points — pointsPerCycle=-1 bypasses check.
 */

// ─── Plan tiers & monthly credits ────────────────────────────────────────────

export const PLAN_CREDITS: Record<string, number> = {
  trial: 1_000,         // 7-day one-time grant (aligned with plans.ts trial.quota.pointsPerCycle)
  // Paid plans: pointsPerCycle=-1 (unlimited) — these values are fallback only
  drop_starter: -1,     // Starter uses run-count gating, not points
  drop_pro: -1,         // Solo: unlimited
  enterprise: -1,       // Enterprise: unlimited
  // Legacy aliases (kept for backward compat with old wallets in DB)
  starter: 1_000,
  professional: -1,
  community: 1_000,
  integration: -1,
};

// ─── Base credits per action type (8× cost multiplier applied) ───────────────
// Original values × 8 to reflect true LLM API cost + knowledge infrastructure + margin

// ─── Knowledge depth factor table ────────────────────────────────────────────
// Derived from: agent layer × knowledge richness
// training (0 layers) → 1.00
// execution generic    → 1.15–1.35
// execution top-tier   → 1.40–1.65
// strategy consultant  → 1.70–2.20

// ─── Instruction complexity factor ───────────────────────────────────────────
// Scores 4 sub-indicators (0–1 each), maps total to a multiplier

interface ComplexityInput {
  instructionLength: number;  // char count of user instruction
  multiGoalCount: number;     // occurrences of "和","同時","另外","plus","also"
  constraintCount: number;    // occurrences of "不要","必須","只能","must","don't"
  isCrossSpecialty: boolean;  // instruction crosses agent's core specialty
}

// ─── Plan tier helpers ────────────────────────────────────────────────────────

export function getRemainingCredits(planCredits: number, usedCredits: number, extraCredits: number): number {
  return Math.max(0, planCredits - usedCredits + extraCredits);
}

/**
 * Pure function — checks if credits are sufficient WITHOUT querying the database.
 * Use this for quick client-side validation or pre-execution estimates.
 *
 * For the authoritative server-side check (including enterprise pool balance),
 * use `checkEnoughCredits()` from `deductCredits.ts`.
 */
export function hasEnoughCredits(
  planCredits: number,
  usedCredits: number,
  extraCredits: number,
  required: number
): boolean {
  return getRemainingCredits(planCredits, usedCredits, extraCredits) >= required;
}
