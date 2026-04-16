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
  squadId: number;
  slug: string;
  name: string;
  description?: string | null;
  industryKey?: string | null;
  taskType?: string | null;
  memberCount?: number;
  lead?: DBSquadLead | null;
  matchScore?: number;
}

/** A real DB agent member returned from getMembersById */
export interface DBAgentMember {
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

/** Full squad detail: lead + members + workflow steps */
export interface DBSquadDetail {
  squadName: string;
  lead: DBAgentMember | null;
  members: DBAgentMember[];
  steps: DBWorkflowStep[];
}

/** One step from squad_workflow_templates */
export interface DBWorkflowStep {
  step: number;
  skill: string;
  role_key: string;
  description: string;
  taskType?: string;
}
