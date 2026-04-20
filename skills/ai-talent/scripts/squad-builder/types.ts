/**
 * squad-builder / types.ts
 *
 * Canonical interfaces for the Day 1 squad-builder framework.
 * Everything follows squad-master-spec.md §「Seed Framework 約定」.
 */

export type StrategyLayer =
  | "L1_brand"
  | "L2_product"
  | "L3_audience"
  | "L4_channel"
  | "L5_campaign"
  | "L6_validation"
  | "unassigned";

export type SquadTier = "core" | "defer" | "kill";

export type AgentLayer = "strategy" | "execution" | "training";

export type AgentJobLevel =
  | "ae" | "sae" | "sae2" | "as" | "aam" | "am" | "ad" | "vp" | "gm"
  | "freelance" | "specialist";

/**
 * A fully-specified member role for a squad.
 * The builder uses this to either find an existing agent
 * (by primarySkill matching) or create a new one.
 */
export interface SquadMemberSpec {
  role: string;                  // snake_case, e.g. "mind_strategist"
  order: number;                 // 0 for lead, 1..N for steps
  isLead: boolean;
  primarySkill: string;          // canonical skill name. If not in DB, agent will be created.
  fallbackSkills?: string[];     // if preferred primarySkill can't find agent, try these
  // When we have to CREATE a new agent:
  createAgent?: {
    name: string;                // 中文名稱
    englishName: string;
    title: string;               // 中文職稱
    englishTitle: string;
    bio: string;
    specialtyTags: string[];     // included in `specialty` text
    jobLevel?: AgentJobLevel;    // default "vp" for leads, "ad" for members
    industry?: string;           // default "tech"
  };
}

/**
 * Workflow step spec.
 * Matches `squad_workflow_templates.steps[]` JSON structure.
 */
export interface WorkflowStepSpec {
  order: number;
  name: string;                  // 中文 step name
  description: string;           // 150 字內
  tool: "octolens" | "marketing-strategy-pmm" | "osp_marketing_tools" | "internal";
  outputType: string;            // snake_case
  requiredSkills: string[];      // at least 4
  // assignedAgentId / Slug / Name are filled AFTER members are created/located
  stepMemberRole: string;        // maps to SquadMemberSpec.role — which member executes this step
}

/**
 * Top-level squad spec.
 */
export interface SquadSpec {
  slug: string;
  name: string;
  description: string;
  methodology: string;           // methodology slug or short form
  methodologyAuthor: string;     // e.g. "Al Ries & Jack Trout"
  methodologyYear: number;
  tags: string[];
  workspace: string[];           // JSON array values, e.g. ["brand-positioning"]
  layer: StrategyLayer;
  tier: SquadTier;
  tokenBudget: number;           // 60_000 ~ 80_000
  members: SquadMemberSpec[];    // first member with isLead=true is the lead
  workflow: WorkflowStepSpec[];  // 4-6 steps typically
}

/**
 * Minimal row returned from `agents` query.
 */
export interface AgentRow {
  id: number;
  slug: string;
  name: string;
  englishName: string | null;
  title: string;
  primarySkill: string | null;
  layer: AgentLayer;
  specialty: string | null;
}

/**
 * After findOrCreateAgent, the builder produces this composite.
 */
export interface ResolvedMember {
  spec: SquadMemberSpec;
  agent: AgentRow;
  wasCreated: boolean;
}
