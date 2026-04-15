/**
 * missionResourceComputer.ts
 *
 * Async (fire-and-forget) function that:
 * 1. Embeds the mission context using text-embedding-3-large
 * 2. Fetches up to 2000 agent embeddings from the DB
 * 3. Computes cosine similarity and finds matching agents
 * 4. Writes results into mission_resources table (status: ready)
 *
 * Called after missionRouter.create; never awaited by the caller.
 */

import { getDb, getSoworkDb } from "./db";
import { missionResources } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "./_core/embedding";

export interface MissionComputeInput {
  missionId: number;
  title: string;
  description?: string | null;
  workspace: string;
  brandName?: string | null;
}

interface AgentRow {
  slug: string;
  name: string;
  title: string;
  primarySkill: string | null;
  aiModel: string | null;
  embeddingJson: string | null;
}

const THRESHOLD_HIGH = 0.20;   // lowered: 0.35 was too strict for diverse agent pool
const THRESHOLD_LOW  = 0.10;   // lowered: fallback threshold
const MIN_RESULTS    = 50;     // guarantee at least this many agents (take top-N if needed)
const AGENT_FETCH_LIMIT = 5000; // increased: sample more of the 17K agent pool

export async function computeMissionResources(input: MissionComputeInput): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Insert pending record first (upsert-safe: IGNORE duplicate missionId)
  try {
    await db.execute(sql`
      INSERT IGNORE INTO mission_resources (missionId, status, agents, skills, providers)
      VALUES (${input.missionId}, 'pending', 0, 0, 0)
    `);
  } catch {
    // record may already exist — continue to update it
  }

  try {
    const embedText = [input.brandName, input.workspace, input.title, input.description]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 2000);

    const missionVec = await getEmbedding(embedText);

    if (!missionVec) {
      // Fallback: count by workspace from sowork agents table
      await fallbackByWorkspace(input.missionId, input.workspace);
      return;
    }

    // Fetch agents with embeddings from the sowork database
    const sowork = await getSoworkDb();
    const rows = await sowork.execute<AgentRow>(sql`
      SELECT
        a.slug,
        a.name,
        a.title,
        a.primarySkill,
        a.aiModel,
        ae.embedding AS embeddingJson
      FROM agents a
      JOIN agent_embeddings ae ON ae.agent_id = a.id
      WHERE a.isAvailable = 1
      LIMIT ${AGENT_FETCH_LIMIT}
    `);

    const agentRows: AgentRow[] = (rows as any)[0] ?? [];

    // Score each agent
    type ScoredAgent = { slug: string; name: string; title: string; score: number; skill: string; model: string };
    const scored: ScoredAgent[] = [];

    for (const row of agentRows) {
      if (!row.embeddingJson) continue;
      let vec: number[];
      try {
        vec = JSON.parse(row.embeddingJson);
      } catch {
        continue;
      }
      const score = cosineSimilarity(missionVec, vec);
      scored.push({
        slug:  row.slug,
        name:  row.name,
        title: row.title,
        score,
        skill: row.primarySkill ?? "",
        model: row.aiModel ?? "",
      });
    }

    // Sort all agents by score descending first
    scored.sort((a, b) => b.score - a.score);

    let matched = scored.filter((a) => a.score >= THRESHOLD_HIGH);

    // Auto-lower threshold if too few matches
    if (matched.length < MIN_RESULTS) {
      matched = scored.filter((a) => a.score >= THRESHOLD_LOW);
    }

    // Still too few? Take top MIN_RESULTS by score regardless of threshold
    if (matched.length < MIN_RESULTS) {
      matched = scored.slice(0, MIN_RESULTS);
    }

    const uniqueSkills   = new Set(matched.map((a) => a.skill).filter(Boolean));
    const uniqueModels   = new Set(matched.map((a) => a.model).filter(Boolean));
    const topAgents      = matched.slice(0, 20).map(({ slug, name, title, score }) => ({ slug, name, title, score: Math.round(score * 1000) / 1000 }));

    await db.execute(sql`
      UPDATE mission_resources
      SET
        status       = 'ready',
        agents       = ${matched.length},
        skills       = ${uniqueSkills.size},
        providers    = ${uniqueModels.size},
        skillList    = ${JSON.stringify([...uniqueSkills])},
        providerList = ${JSON.stringify([...uniqueModels])},
        topAgents    = ${JSON.stringify(topAgents)}
      WHERE missionId = ${input.missionId}
    `);
  } catch (err) {
    console.error("[missionResourceComputer] error:", err);
    await db.execute(sql`
      UPDATE mission_resources SET status = 'error' WHERE missionId = ${input.missionId}
    `).catch(() => {});
  }
}

async function fallbackByWorkspace(missionId: number, workspace: string): Promise<void> {
  try {
    const sowork = await getSoworkDb();
    const [[row]] = await sowork.execute(sql`
      SELECT COUNT(*) AS cnt FROM agents WHERE workspace = ${workspace} AND isAvailable = 1
    `) as any;
    const cnt = Number((row as any)?.cnt ?? 0);

    const db = await getDb();
    if (!db) return;
    await db.execute(sql`
      UPDATE mission_resources
      SET status = 'ready', agents = ${cnt}, skills = 0, providers = 0
      WHERE missionId = ${missionId}
    `);
  } catch (err) {
    console.error("[missionResourceComputer] fallback error:", err);
  }
}
