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
 *
 * When creating a NEW agent, all these fields are populated from SquadSpec
 * so L3/L4/L5/L6 builders don't need a separate upgrade-fields step:
 *   - aiModel              = 'claude-opus-4-6'   (agency policy)
 *   - aiModelSource        = 'policy'
 *   - aiModelFallback      = 'claude-sonnet-4-6'
 *   - aiModelFallbackSource = 'policy'
 *   - avatarUrl            = DiceBear notionists (deterministic by slug)
 *   - coverUrl             = DiceBear shapes
 *   - bio_en               = built from englishName/Title/methodology
 *   - specialty_en         = from primarySkill + tags
 *   - workspace            = derived from squad layer
 *   - workspace_tags       = from squad tags
 *   - methodology          = from squad methodology
 *   - workingPrinciples    = 3 structured lines
 */

import type { PoolConnection } from "mysql2/promise";
import type {
  AgentRow,
  Layer,
  ResolvedMember,
  SquadMemberSpec,
  SquadSpec,
} from "./types.js";
import { getPool } from "./db.js";

const DICEBEAR_AVATAR = "https://api.dicebear.com/7.x/notionists/svg?seed=";
const DICEBEAR_COVER = "https://api.dicebear.com/7.x/shapes/svg?seed=";
const POLICY_AI_MODEL = "claude-opus-4-6";
const POLICY_AI_MODEL_FALLBACK = "claude-sonnet-4-6";

/** Slug-safe kebab-case converter. */
function kebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function layerToWorkspace(layer: Layer): string {
  if (layer === "L1_brand") return "brand-positioning";
  if (layer === "L2_product") return "product-positioning";
  if (layer === "L3_audience") return "audience-strategy";
  if (layer === "L4_channel") return "channel-strategy";
  if (layer === "L5_campaign") return "campaign-strategy";
  if (layer === "L6_validation") return "validation";
  return "strategy";
}

function buildBioEn(
  englishName: string,
  englishTitle: string,
  methodologyAuthor: string | undefined,
  methodologyYear: number | undefined,
  methodology: string,
): string {
  const era = methodologyYear ? ` (${methodologyYear})` : "";
  const author = methodologyAuthor ? `${methodologyAuthor}'s ` : "";
  return (
    `${englishName} is ${englishTitle} at SoWork's AI Strategic Consultancy. ` +
    `Trained on ${author}${methodology} methodology${era}, ` +
    `with practical engagement across ${methodologyYear && methodologyYear < 2000 ? "classic" : "modern"} brand strategy cases. ` +
    `Leads squad-based deliverables that turn methodology into boardroom-ready outputs.`
  );
}

function buildSpecialtyEn(primarySkill: string, tags: string[]): string {
  const head = primarySkill.replace(/-/g, " ");
  const rest = tags
    .slice(0, 4)
    .map((t) => t.replace(/-/g, " "))
    .join(", ");
  return `${head} — specializing in: ${rest}.`;
}

function buildWorkingPrinciples(squad: SquadSpec): string {
  return [
    `1. Methodology-first: every deliverable traces back to ${squad.methodologyAuthor ?? "authored"} ${squad.methodology}.`,
    `2. Squad accountability: leads ${squad.members.length - 1} specialists across a ${squad.workflow.length}-step workflow.`,
    `3. Evidence discipline: every strategic claim anchored to audit trail, not opinion.`,
  ].join("\n");
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

/** Build a slug for a newly-created agent: "{squadSlug}-{kebabRole}". */
function generateAgentSlug(spec: SquadMemberSpec, squadSlug: string): string {
  const role = kebab(spec.role);
  return `${squadSlug}-${role}`;
}

/**
 * Insert a brand-new agent row with ALL default fields populated.
 * Returns the AgentRow.
 */
async function createAgent(
  conn: PoolConnection,
  spec: SquadMemberSpec,
  squad: SquadSpec,
): Promise<AgentRow> {
  if (!spec.createAgent) {
    throw new Error(
      `createAgent called but spec.createAgent is missing (role=${spec.role})`,
    );
  }
  const c = spec.createAgent;
  const slug = generateAgentSlug(spec, squad.slug);
  const layer = "strategy"; // L1–L6 all strategy (job layer, not squad layer)
  const jobLevel = c.jobLevel ?? (spec.isLead ? "vp" : "ad");
  const industry = c.industry ?? "tech";
  const specialty = [spec.primarySkill, ...c.specialtyTags].join(", ");
  const skills = JSON.stringify([
    c.title,
    ...c.specialtyTags.slice(0, 4).map((s) =>
      s
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    ),
  ]);

  // Populated-by-default fields (previously null, now policy-driven)
  const avatarUrl = `${DICEBEAR_AVATAR}${encodeURIComponent(slug)}`;
  const coverUrl = `${DICEBEAR_COVER}${encodeURIComponent(squad.slug)}`;
  const bio_en = buildBioEn(
    c.englishName,
    c.englishTitle,
    squad.methodologyAuthor,
    squad.methodologyYear,
    squad.methodology,
  );
  const specialty_en = buildSpecialtyEn(spec.primarySkill, squad.tags);
  const workspace = layerToWorkspace(squad.layer);
  const workspace_tags = JSON.stringify(squad.tags.slice(0, 8));
  const methodology = squad.methodology;
  const workingPrinciples = buildWorkingPrinciples(squad);

  const sql = `
    INSERT INTO agents (
      slug, name, englishName, title, englishTitle,
      layer, bio, specialty, skills, primarySkill,
      industry, jobLevel, isAvailable, reviewStatus, rating,
      avatarUrl, coverUrl, bio_en, specialty_en,
      workspace, workspace_tags, methodology, workingPrinciples,
      aiModel, aiModelSource, aiModelFallback, aiModelFallbackSource,
      createdAt, updatedAt
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, 1, 'approved', 5.00,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, 'policy', ?, 'policy',
      NOW(), NOW()
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
    avatarUrl,
    coverUrl,
    bio_en,
    specialty_en,
    workspace,
    workspace_tags,
    methodology,
    workingPrinciples,
    POLICY_AI_MODEL,
    POLICY_AI_MODEL_FALLBACK,
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
 * @param spec         The member spec to resolve.
 * @param squad        Full squad spec — needed for default-field derivation.
 * @param usedAgentIds Ids already picked by THIS squad — prevent duplicates within
 *                     a single squad (one agent cannot cover 2 roles).
 * @param leadsUsed    Ids already used as LEAD across squads this run. Pass empty
 *                     array if you don't care.
 */
export async function findOrCreateAgent(
  spec: SquadMemberSpec,
  squad: SquadSpec,
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
      const created = await createAgent(conn, spec, squad);
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
