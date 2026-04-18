/**
 * stepAgentResolver.ts — Resolve which agent executes a workflow step
 *
 * Dual-track resolution strategy (per user architecture 2026-04-18):
 *   1. Hard assignment: step.assignedAgentId → find exact agent in squad
 *   2. Skill fallback:   step.requiredSkills → match squad agent by skill
 *   3. Last resort:      squad lead (or first agent)
 *
 * Used by Squad Lead logic in squadLeaderWorker + missionChatHandler
 * to drive step-by-step execution with deterministic agent dispatch.
 */

export interface WorkflowStep {
  order?: number;
  name?: string;
  description?: string;
  outputType?: string;
  requiredSkills?: string[];
  assignedAgentId?: number;
  assignedAgentSlug?: string;
  assignedAgentName?: string;
}

export interface SquadAgent {
  agent_id?: number;
  agentId?: number;
  id?: number;
  slug?: string;
  name?: string;
  title?: string;
  skills?: string[];
  primarySkill?: string;
  is_lead?: boolean;
  isLead?: boolean;
  role?: string;
  order?: number;
}

/**
 * Resolve the executor agent for a single workflow step.
 *
 * @param step     Workflow step definition (from squads.steps JSON)
 * @param agents   Squad member list (from squads.agents JSON, possibly enriched with `skills`)
 * @returns        Best-match agent, or null if no candidate
 */
export function resolveStepAgent(
  step: WorkflowStep,
  agents: SquadAgent[]
): SquadAgent | null {
  if (!agents || agents.length === 0) return null;

  const getId = (a: SquadAgent): number | undefined => a.id ?? a.agentId ?? a.agent_id;
  const isLead = (a: SquadAgent): boolean => !!(a.is_lead || a.isLead);

  // 1. Priority: hard-assigned agent_id
  if (step.assignedAgentId) {
    const hardMatch = agents.find((a) => getId(a) === step.assignedAgentId);
    if (hardMatch) return hardMatch;
  }

  // 1b. Slug fallback (if ID missing but slug present)
  if (step.assignedAgentSlug) {
    const slugMatch = agents.find((a) => a.slug === step.assignedAgentSlug);
    if (slugMatch) return slugMatch;
  }

  // 2. Skill-based matching
  if (step.requiredSkills && step.requiredSkills.length > 0) {
    const skillSet = new Set(step.requiredSkills.map((s) => s.toLowerCase()));

    // Find agent with matching skills (score by overlap count)
    let bestMatch: SquadAgent | null = null;
    let bestScore = 0;

    for (const agent of agents) {
      const agentSkills: string[] = [];
      if (agent.skills) agentSkills.push(...agent.skills);
      if (agent.primarySkill) agentSkills.push(agent.primarySkill);

      const normalized = agentSkills.map((s) => s.toLowerCase());
      const overlap = normalized.filter((s) => skillSet.has(s)).length;

      if (overlap > bestScore) {
        bestScore = overlap;
        bestMatch = agent;
      }
    }

    if (bestMatch) return bestMatch;
  }

  // 3. Last resort: squad lead (or first available)
  const lead = agents.find(isLead);
  if (lead) return lead;

  return agents[0] ?? null;
}

/**
 * Enrich a step definition with the resolved agent's display info.
 * Useful for SSE events sent to the frontend.
 */
export function enrichStepWithAgent(
  step: WorkflowStep,
  agents: SquadAgent[]
): WorkflowStep & { resolvedAgent?: SquadAgent } {
  const resolved = resolveStepAgent(step, agents);
  if (!resolved) return step;

  return {
    ...step,
    resolvedAgent: resolved,
    // Populate missing fields if resolver filled them in
    assignedAgentId: step.assignedAgentId ?? (resolved.id ?? resolved.agentId ?? resolved.agent_id),
    assignedAgentSlug: step.assignedAgentSlug ?? resolved.slug,
    assignedAgentName: step.assignedAgentName ?? resolved.name,
  };
}
