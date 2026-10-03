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

import { getDb } from "../../../db";
import { sql } from "drizzle-orm";

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
