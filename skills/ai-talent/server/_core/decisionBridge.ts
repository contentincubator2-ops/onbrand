/**
 * decisionBridge — translate a completed squad step into a Decision Record.
 *
 * Invoked by the frontend (or a server-side runner) whenever a step's agent
 * output is accepted into draft. Creates:
 *   1. a decisions row (status=draft)
 *   2. one decision_option row with the agent's primary recommendation
 *   3. optional parent lineage link
 *   4. an empty decision_chat_thread so the side drawer can post immediately
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";

export interface StepToDecisionInput {
  brandId: number;
  missionId?: number | null;
  squadId?: number | null;
  decisionType: string;           // e.g. "stp-audience"
  title?: string;
  summary?: string;
  parentDecisionId?: number | null;
  primaryOption?: {
    label: string;
    payload?: any;
    confidence?: number;          // 0-1
    reversibility?: "one-way" | "two-way";
    rationale?: string;
  };
  agentId?: number | null;
}

export interface StepToDecisionResult {
  decisionId: number;
  optionId: number | null;
  threadId: number;
}

export async function upsertDecisionFromStep(
  input: StepToDecisionInput
): Promise<StepToDecisionResult> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const reversibility = input.primaryOption?.reversibility ?? "two-way";
  const [dRes] = (await db.execute(sql`
    INSERT INTO decisions
      (brandId, squadId, missionId, decisionType, parentDecisionId,
       status, title, summary, reversibility)
    VALUES
      (${input.brandId}, ${input.squadId ?? null}, ${input.missionId ?? null},
       ${input.decisionType}, ${input.parentDecisionId ?? null},
       'draft', ${input.title ?? null}, ${input.summary ?? null},
       ${reversibility})
  `)) as any;
  const decisionId = Number(dRes?.insertId ?? 0);

  let optionId: number | null = null;
  if (input.primaryOption) {
    const [oRes] = (await db.execute(sql`
      INSERT INTO decision_options
        (decisionId, label, payload, confidence, rationale, orderIndex, isRecommended)
      VALUES
        (${decisionId}, ${input.primaryOption.label},
         ${JSON.stringify(input.primaryOption.payload ?? {})},
         ${input.primaryOption.confidence ?? null},
         ${input.primaryOption.rationale ?? null},
         0, 1)
    `)) as any;
    optionId = Number(oRes?.insertId ?? 0);
    await db.execute(sql`
      UPDATE decisions SET recommendedOptionId = ${optionId}, status = 'recommended'
      WHERE id = ${decisionId}
    `);
  }

  const [tRes] = (await db.execute(sql`
    INSERT INTO decision_chat_threads (decisionId, brandId, agentId, title)
    VALUES (${decisionId}, ${input.brandId}, ${input.agentId ?? null}, ${input.title ?? null})
  `)) as any;
  const threadId = Number(tRes?.insertId ?? 0);

  return { decisionId, optionId, threadId };
}

/**
 * Fetch the ancestor decision chain so downstream LLM calls can inject full
 * brand lineage into their system prompt.
 */
export async function loadLineage(
  decisionId: number,
  maxDepth = 20
): Promise<
  Array<{ id: number; decisionType: string; title: string | null; summary: string | null; payload: any }>
> {
  const db = await getDb();
  if (!db) return [];
  const chain: any[] = [];
  let cursor: number | null = decisionId;
  while (cursor && chain.length < maxDepth) {
    const [rows] = (await db.execute(sql`
      SELECT d.id, d.decisionType, d.title, d.summary, d.parentDecisionId,
             o.payload
      FROM decisions d
      LEFT JOIN decision_options o ON o.id = d.recommendedOptionId
      WHERE d.id = ${cursor}
      LIMIT 1
    `)) as any;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) break;
    chain.push({
      id: row.id,
      decisionType: row.decisionType,
      title: row.title,
      summary: row.summary,
      payload: row.payload,
    });
    cursor = row.parentDecisionId ?? null;
  }
  return chain.reverse(); // root → leaf
}
