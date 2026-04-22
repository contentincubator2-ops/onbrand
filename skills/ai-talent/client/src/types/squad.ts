/**
 * squad.ts — Shared squad types for DB-driven squad data
 * Replaces the static SquadOption from taskSquads.ts
 */

export interface DBSquadLead {
  agentId: number;
  name: string;
  title: string;
}

/** A squad chip returned from getRecommendedSquads */
export interface DBSquad {
  /** Discriminator: "squad" = real DB squad; "agent" = synthesized single-agent squad */
  type?: "squad" | "agent";
  squadId: number;
  slug: string;
  name: string;
  description?: string | null;
  industryKey?: string | null;
  missionType?: string | null;
  agentCount?: number;
  lead?: DBSquadLead | null;
  matchScore?: number;
  // ── Agent-chip extras (only present when type === "agent") ────────────
  agentId?: number;
  agentTitle?: string | null;
  primarySkill?: string | null;
  avatarUrl?: string | null;
  stepCount?: number;
}

/** A real DB agent returned from getMembersById */
export interface DBAgent {
  agentId: number;
  role: string;
  isLead: boolean;
  order: number;
  name: string;
  title: string;
  specialty: string;
  primarySkill: string;
  aiModel: string;
  avatarUrl?: string | null;
}

/** @deprecated Use DBAgent instead */
export type DBAgentMember = DBAgent;

/** Full squad detail: lead + agents + workflow steps */
export interface DBSquadDetail {
  squadName: string;
  methodology: string;
  lead: DBAgent | null;
  agents: DBAgent[];
  steps: DBWorkflowStep[];
  showcases: any[];
}

/** One step from squad_workflow_templates */
export interface DBWorkflowStep {
  step: number;
  skill: string;
  role_key: string;
  description: string;
  missionType?: string;
}
