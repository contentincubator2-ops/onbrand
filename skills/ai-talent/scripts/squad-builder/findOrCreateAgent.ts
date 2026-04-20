/**
 * squad-builder / findOrCreateAgent.ts
 *
 * Decision flow for each SquadMemberSpec:
 *   1. Try to find an agent whose primarySkill === spec.primarySkill (exact match)
 *   2. Try each fallbackSkill in order (still exact match on primarySkill)
 *   3. If spec.createAgent is provided, CREATE a new agent with spec.primarySkill
 *   4. Otherwise throw — caller must decide
 *
 * Duplicate-lead guard: for lead agents, we avoid re-using an agent that is
 * already lead on another squad. (This addresses the 9-squads-sharing-id=25 bug
 * documented in the master spec.)
 */

import type { PoolConnection } from "mysql2/promise";
import type {
  AgentRow,
  ResolvedMember,
  SquadMemberSpec,
} from "./types.js";
import { getPool } from "./db.js";

/** Slug-safe kebab-case converter. */
function kebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Fetch agents matching a primarySkill exactly, optionally excluding ids. */
async function findBySkill(
  conn: PoolConnection,
  primarySkill: string,
  excludeIds: number[],
): Promise<AgentRow[]> {
  const placeholders =
    excludeIds.length > 0 ? excludeIds.map(() => "?").join(",") : null;
  const sql = `
    SELECT id, slug, name, englishName, title, primarySkill, layer, specialty
    FROM agents
    WHERE primarySkill = ?
      AND isAvailable = 1
      ${placeholders ? `AND id NOT IN (${placeholders})` : ""}
    ORDER BY rating DESC, createdAt DESC
    LIMIT 5
  `;
  const params: any[] = [primarySkill, ...excludeIds];
  const [rows] = await conn.execute(sql, params);
  return rows as AgentRow[];
}

/** Build a slug for a newly-created agent: "{primarySkill-kebab}-lead" or similar. */
function generateAgentSlug(spec: SquadMemberSpec, squadSlug: string): string {
  const role = kebab(spec.role);
  return `${squadSlug}-${role}`;
}

/** Insert a brand-new agent row, return the numeric id. */
async function createAgent(
  conn: PoolConnection,
  spec: SquadMemberSpec,
  squadSlug: string,
): Promise<AgentRow> {
  if (!spec.createAgent) {
    throw new Error(
      `createAgent called but spec.createAgent is missing (role=${spec.role})`,
    );
  }
  const c = spec.createAgent;
  const slug = generateAgentSlug(spec, squadSlug);
  const layer = spec.isLead ? "strategy" : "strategy"; // L1 all strategy
  const jobLevel = c.jobLevel ?? (spec.isLead ? "vp" : "ad");
  const industry = c.industry ?? "tech";
  const specialty = [spec.primarySkill, ...c.specialtyTags].join(", ");
  const skills = JSON.stringify([
    c.title,
    ...(c.specialtyTags.slice(0, 4).map((s) =>
      s
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    )),
  ]);

  const sql = `
    INSERT INTO agents (
      slug, name, englishName, title, englishTitle,
      layer, bio, specialty, skills, primarySkill,
      industry, jobLevel, isAvailable, reviewStatus,
      rating, createdAt, updatedAt
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, 1, 'approved',
      5.00, NOW(), NOW()
    )
  `;
  const [result] = await conn.execute(sql, [
    slug,
    c.name,
    c.englishName,
    c.title,
    c.englishTitle,
    layer,
    c.bio,
    specialty,
    skills,
    spec.primarySkill,
    industry,
    jobLevel,
  ]);
  const insertId = (result as any).insertId as number;
  return {
    id: insertId,
    slug,
    name: c.name,
    englishName: c.englishName,
    title: c.title,
    primarySkill: spec.primarySkill,
    layer,
    specialty,
  };
}

/**
 * Main entry point.
 *
 * usedAgentIds: ids already picked by THIS squad — prevent duplicates within
 *               a single squad (one agent cannot cover 2 roles).
 * leadsUsed:    ids already used as LEAD across squads this run. Pass empty
 *               array if you don't care.
 */
export async function findOrCreateAgent(
  spec: SquadMemberSpec,
  squadSlug: string,
  usedAgentIds: number[],
  leadsUsed: number[] = [],
): Promise<ResolvedMember> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    // ── 1. Try exact primarySkill match ────────────────────────────────
    const excludeIds = [
      ...usedAgentIds,
      ...(spec.isLead ? leadsUsed : []),
    ];

    const primaryMatches = await findBySkill(
      conn,
      spec.primarySkill,
      excludeIds,
    );
    if (primaryMatches.length > 0) {
      return {
        spec,
        agent: primaryMatches[0],
        wasCreated: false,
      };
    }

    // ── 2. Try fallback skills (non-leads only — leads must use exact skill) ──
    if (!spec.isLead && spec.fallbackSkills) {
      for (const fb of spec.fallbackSkills) {
        const matches = await findBySkill(conn, fb, excludeIds);
        if (matches.length > 0) {
          return {
            spec,
            agent: matches[0],
            wasCreated: false,
          };
        }
      }
    }

    // ── 3. Create new agent if spec allows ─────────────────────────────
    if (spec.createAgent) {
      const created = await createAgent(conn, spec, squadSlug);
      return {
        spec,
        agent: created,
        wasCreated: true,
      };
    }

    // ── 4. Give up ─────────────────────────────────────────────────────
    throw new Error(
      `[findOrCreateAgent] No agent found for role=${spec.role} ` +
        `primarySkill=${spec.primarySkill}, no fallback matched, ` +
        `and spec.createAgent not provided.`,
    );
  } finally {
    conn.release();
  }
}
