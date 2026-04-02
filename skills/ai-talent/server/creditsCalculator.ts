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
 * Pricing revision (2026-03-01):
 *   - BASE_CREDITS multiplied by 8× to reflect true infrastructure cost + margin
 *   - New user trial: 500 points (enough for ~8–12 short content adoptions)
 *   - Plans: starter 1,500 / professional 15,000 / enterprise 150,000 pts/month
 */

// ─── Plan tiers & monthly credits ────────────────────────────────────────────

export const PLAN_CREDITS: Record<string, number> = {
  trial: 500,          // New user gift — enough to experience the product
  starter: 1_500,      // NT$900/mo (discounted) / NT$1,500 (original)
  professional: 15_000, // NT$9,000/mo (discounted) / NT$15,000 (original)
  enterprise: 150_000, // NT$90,000/mo (discounted) / NT$150,000 (original)
  // Legacy aliases (kept for backward compat)
  community: 1_500,
  integration: 15_000,
};

// ─── Base credits per action type (8× cost multiplier applied) ───────────────
// Original values × 8 to reflect true LLM API cost + knowledge infrastructure + margin

export const BASE_CREDITS = {
  chat: 40,              // per conversation turn  (was 5 × 8)
  short_content: 120,    // output < 300 chars     (was 15 × 8)
  long_content: 280,     // output 300–1000 chars  (was 35 × 8)
  full_report: 480,      // full structured report (was 60 × 8)
  strategy: 400,         // strategy / positioning (was 50 × 8)
  image: 640,            // image generation       (was 80 × 8)
  rag_query: 64,         // per RAG lookup         (was 8 × 8)
} as const;

export type ActionCategory = keyof typeof BASE_CREDITS;

// ─── Knowledge depth factor table ────────────────────────────────────────────
// Derived from: agent layer × knowledge richness
// training (0 layers) → 1.00
// execution generic    → 1.15–1.35
// execution top-tier   → 1.40–1.65
// strategy consultant  → 1.70–2.20

export function getDefaultKnowledgeDepthFactor(layer: "strategy" | "execution" | "training"): number {
  switch (layer) {
    case "strategy":  return 1.90; // midpoint of 1.70–2.20
    case "execution": return 1.25; // midpoint of 1.15–1.35
    case "training":  return 1.00;
  }
}

// ─── Instruction complexity factor ───────────────────────────────────────────
// Scores 4 sub-indicators (0–1 each), maps total to a multiplier

interface ComplexityInput {
  instructionLength: number;  // char count of user instruction
  multiGoalCount: number;     // occurrences of "和","同時","另外","plus","also"
  constraintCount: number;    // occurrences of "不要","必須","只能","must","don't"
  isCrossSpecialty: boolean;  // instruction crosses agent's core specialty
}

export function calcInstructionComplexityFactor(input: ComplexityInput): number {
  // Sub-scores (0–1 each)
  const lengthScore = Math.min(input.instructionLength / 300, 1);
  const multiGoalScore = Math.min(input.multiGoalCount / 3, 1);
  const constraintScore = Math.min(input.constraintCount / 4, 1);
  const crossScore = input.isCrossSpecialty ? 1 : 0;

  const total = lengthScore + multiGoalScore + constraintScore + crossScore;

  // Map total (0–4) → factor
  if (total < 0.5)  return 0.80;
  if (total < 1.0)  return 0.95;
  if (total < 1.8)  return 1.10;
  if (total < 2.5)  return 1.30;
  if (total < 3.2)  return 1.55;
  return 1.85;
}

// ─── Output scale factor ──────────────────────────────────────────────────────

export function calcOutputScaleFactor(outputTokens: number, category: ActionCategory): number {
  const benchmarks: Record<ActionCategory, { base: number; rate: number }> = {
    chat:          { base: 100, rate: 0.002 },
    short_content: { base: 200, rate: 0.003 },
    long_content:  { base: 500, rate: 0.004 },
    full_report:   { base: 1000, rate: 0.005 },
    strategy:      { base: 800,  rate: 0.004 },
    image:         { base: 1,    rate: 0 },     // fixed cost
    rag_query:     { base: 1,    rate: 0 },     // fixed cost
  };

  const { base, rate } = benchmarks[category];
  if (rate === 0) return 1.0;

  const ratio = outputTokens / base;
  return Math.max(0.5, 1.0 + ratio * rate * base);
}

// ─── Instruction parser (simple heuristic) ───────────────────────────────────

export function parseInstruction(instruction: string): Omit<ComplexityInput, "isCrossSpecialty"> {
  const multiGoalKeywords = ["和", "同時", "另外", "plus", "also", "and also", "additionally"];
  const constraintKeywords = ["不要", "必須", "只能", "must", "don't", "cannot", "only", "never"];

  const multiGoalCount = multiGoalKeywords.reduce(
    (acc, kw) => acc + (instruction.toLowerCase().split(kw.toLowerCase()).length - 1),
    0
  );
  const constraintCount = constraintKeywords.reduce(
    (acc, kw) => acc + (instruction.toLowerCase().split(kw.toLowerCase()).length - 1),
    0
  );

  return {
    instructionLength: instruction.length,
    multiGoalCount,
    constraintCount,
  };
}

// ─── Main calculator ──────────────────────────────────────────────────────────

export interface CalculateCreditsInput {
  category: ActionCategory;
  knowledgeDepthFactor: number;    // from agent_credit_config or default
  instruction: string;             // user's instruction text
  isCrossSpecialty?: boolean;
  outputTokens: number;
  ragQueryCount?: number;          // number of RAG lookups performed
  // Override base credits (from agent_credit_config)
  baseCreditsOverride?: number;
}

export interface CreditsBreakdown {
  baseCredits: number;
  knowledgeDepthFactor: number;
  instructionComplexityFactor: number;
  outputScaleFactor: number;
  ragQueryCredits: number;
  randomVariation: number;
  total: number;
}

export function calculateCredits(input: CalculateCreditsInput): CreditsBreakdown {
  const {
    category,
    knowledgeDepthFactor,
    instruction,
    isCrossSpecialty = false,
    outputTokens,
    ragQueryCount = 0,
    baseCreditsOverride,
  } = input;

  // 1. Base credits
  const baseCredits = baseCreditsOverride ?? BASE_CREDITS[category];

  // 2. Instruction complexity
  const parsed = parseInstruction(instruction);
  const instructionComplexityFactor = calcInstructionComplexityFactor({
    ...parsed,
    isCrossSpecialty,
  });

  // 3. Output scale
  const outputScaleFactor = calcOutputScaleFactor(outputTokens, category);

  // 4. RAG query credits (fixed per lookup, no multiplier)
  const ragQueryCredits = ragQueryCount * BASE_CREDITS.rag_query;

  // 5. Core cost (before RAG and variation)
  const core = baseCredits * knowledgeDepthFactor * instructionComplexityFactor * outputScaleFactor;

  // 6. Random variation ±5% applied ONLY to token-driven part (not base)
  const variationRate = (Math.random() * 0.10) - 0.05; // -0.05 to +0.05
  const randomVariation = core * variationRate;

  // 7. Total (round to integer)
  const total = Math.max(1, Math.round(core + randomVariation + ragQueryCredits));

  return {
    baseCredits,
    knowledgeDepthFactor,
    instructionComplexityFactor,
    outputScaleFactor,
    ragQueryCredits,
    randomVariation: Math.round(randomVariation * 100) / 100,
    total,
  };
}

// ─── Estimate credits range (before execution) ───────────────────────────────

export interface EstimateInput {
  category: ActionCategory;
  knowledgeDepthFactor: number;
  instruction: string;
  isCrossSpecialty?: boolean;
  expectedOutputTokens?: number;  // rough estimate
  ragQueryCount?: number;
  baseCreditsOverride?: number;
}

export function estimateCreditsRange(input: EstimateInput): { min: number; max: number; midpoint: number } {
  const tokens = input.expectedOutputTokens ?? 300;

  const mid = calculateCredits({
    ...input,
    outputTokens: tokens,
  });

  return {
    min: Math.max(1, Math.round(mid.total * 0.75)),
    max: Math.round(mid.total * 1.35),
    midpoint: mid.total,
  };
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
