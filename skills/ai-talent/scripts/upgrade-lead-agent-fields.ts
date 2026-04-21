/**
 * upgrade-lead-agent-fields.ts
 *
 * Fills in the UI + metadata fields on the 20 L1/L2 lead agents
 * (and Mary Allen id=180797) that were left NULL by findOrCreateAgent:
 *
 *   - avatarUrl        (DiceBear notionists SVG, deterministic per slug)
 *   - coverUrl         (DiceBear shapes SVG)
 *   - bio_en           (English version built from englishName/Title + methodology)
 *   - specialty_en     (English version of specialty)
 *   - workspace        ("brand-positioning" or "product-positioning")
 *   - workspace_tags   (from squad tags)
 *   - methodology      (from squad methodology)
 *   - workingPrinciples (3 structured principles)
 *   - aiModelSource         = "policy"
 *   - aiModelFallback       = "claude-sonnet-4-6"
 *   - aiModelFallbackSource = "policy"
 *
 * Source of truth: squad specs in scripts/squad-builder/L1-brand.ts
 * and L2-product.ts. Reads by slug = `{squad.slug}-{kebab(lead.role)}`.
 *
 * Idempotent: re-running just overwrites same fields with same values.
 *
 * Usage:
 *   npm run db:upgrade-lead-fields          # dry-run, prints what would change
 *   npm run db:upgrade-lead-fields -- --apply  # actually UPDATE
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
import { specs as L1_specs } from "./squad-builder/L1-brand.js";
import { specs as L2_specs } from "./squad-builder/L2-product.js";
import type { SquadSpec, SquadMemberSpec } from "./squad-builder/types.js";

dotenv.config();

const DICEBEAR_AVATAR = "https://api.dicebear.com/7.x/notionists/svg?seed=";
const DICEBEAR_COVER = "https://api.dicebear.com/7.x/shapes/svg?seed=";

function kebabCase(s: string): string {
  return s.replace(/_/g, "-").toLowerCase();
}

function buildLeadAgentSlug(squadSlug: string, leadRole: string): string {
  return `${squadSlug}-${kebabCase(leadRole)}`;
}

function layerToWorkspace(layer: string): string {
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

function buildWorkingPrinciples(
  spec: SquadSpec,
  lead: SquadMemberSpec,
): string {
  const principles = [
    `1. Methodology-first: every deliverable traces back to ${spec.methodologyAuthor ?? "authored"} ${spec.methodology}.`,
    `2. Squad accountability: leads ${spec.members.length - 1} specialists across a ${spec.workflow.length}-step workflow.`,
    `3. Evidence discipline: every strategic claim anchored to audit trail, not opinion.`,
  ];
  return principles.join("\n");
}

interface PatchRow {
  agentSlug: string;
  agentId?: number;
  agentName?: string;
  values: {
    avatarUrl: string;
    coverUrl: string;
    bio_en: string;
    specialty_en: string;
    workspace: string;
    workspace_tags: string;
    methodology: string;
    workingPrinciples: string;
    aiModelSource: string;
    aiModelFallback: string;
    aiModelFallbackSource: string;
  };
}

function buildPatchFromSpec(spec: SquadSpec): PatchRow | null {
  const lead = spec.members.find((m) => m.isLead);
  if (!lead || !lead.createAgent) return null;
  const ca = lead.createAgent;
  const agentSlug = buildLeadAgentSlug(spec.slug, lead.role);

  return {
    agentSlug,
    values: {
      avatarUrl: `${DICEBEAR_AVATAR}${encodeURIComponent(agentSlug)}`,
      coverUrl: `${DICEBEAR_COVER}${encodeURIComponent(spec.slug)}`,
      bio_en: buildBioEn(
        ca.englishName,
        ca.englishTitle,
        spec.methodologyAuthor,
        spec.methodologyYear,
        spec.methodology,
      ),
      specialty_en: buildSpecialtyEn(lead.primarySkill, spec.tags),
      workspace: layerToWorkspace(spec.layer),
      workspace_tags: JSON.stringify(spec.tags.slice(0, 8)),
      methodology: spec.methodology,
      workingPrinciples: buildWorkingPrinciples(spec, lead),
      aiModelSource: "policy",
      aiModelFallback: "claude-sonnet-4-6",
      aiModelFallbackSource: "policy",
    },
  };
}

/**
 * Mary Allen (id=180797) is not built by squad-builder; hand-craft her patch.
 */
const MARY_ALLEN_PATCH: PatchRow = {
  agentSlug: "mary-allen-intuit-mkt",
  agentId: 180797,
  agentName: "Mary Allen",
  values: {
    avatarUrl: `${DICEBEAR_AVATAR}mary-allen-intuit-mkt`,
    coverUrl: `${DICEBEAR_COVER}brand-archetype-positioning`,
    bio_en:
      "Mary Allen is VP of Brand Archetype Positioning at SoWork's AI Strategic Consultancy. " +
      "Trained on Carol Pearson & Margaret Mark's 12 Jungian Archetypes methodology (2001), " +
      "leads archetype discovery, voice codification, and cross-touchpoint consistency auditing. " +
      "Lead of the flagship brand-archetype-positioning squad — the golden standard for SoWork's L1 brand strategy layer.",
    specialty_en:
      "brand archetype positioning — specializing in: jungian archetypes, brand voice, brand personality, visual identity.",
    workspace: "brand-positioning",
    workspace_tags: JSON.stringify([
      "brand-archetype",
      "brand-identity",
      "brand-personality",
      "brand-voice",
      "visual-identity",
      "jungian",
      "brand-strategy",
      "omnichannel",
    ]),
    methodology: "brand-archetype",
    workingPrinciples: [
      "1. Methodology-first: every deliverable traces back to Pearson/Mark 12 Jungian Archetypes.",
      "2. Squad accountability: leads 5 specialists across a 5-step workflow.",
      "3. Evidence discipline: every archetype claim anchored to consumer insight + historical brand data.",
    ].join("\n"),
    aiModelSource: "policy",
    aiModelFallback: "claude-sonnet-4-6",
    aiModelFallbackSource: "policy",
  },
};

async function main() {
  const applyFlag = process.argv.includes("--apply");

  const pool = createPool({
    host: process.env.DB_HOST || process.env.LOCAL_DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || process.env.LOCAL_DB_PORT || "3306"),
    user: process.env.DB_USER || process.env.LOCAL_DB_USER || "mos_user",
    password:
      process.env.DB_PASSWORD ||
      process.env.LOCAL_DB_PASSWORD ||
      "mos_secure_2026",
    database: process.env.DB_NAME || process.env.LOCAL_DB_NAME || "mos_db",
    charset: "utf8mb4",
  });

  const conn = await pool.getConnection();
  try {
    const patches: PatchRow[] = [];

    // L1 + L2 specs
    for (const spec of [...L1_specs, ...L2_specs]) {
      const p = buildPatchFromSpec(spec);
      if (p) patches.push(p);
    }
    // Mary Allen
    patches.push(MARY_ALLEN_PATCH);

    console.log(`[upgrade-lead-fields] ${patches.length} patches planned\n`);

    // Resolve agentId for each patch by slug (except Mary Allen who has id)
    for (const p of patches) {
      if (p.agentId) continue;
      const [rows] = (await conn.execute(
        `SELECT id, name FROM agents WHERE slug = ? LIMIT 1`,
        [p.agentSlug],
      )) as any[];
      const row = (rows as any[])[0];
      if (!row) {
        console.log(`  [SKIP] slug not found: ${p.agentSlug}`);
        continue;
      }
      p.agentId = row.id;
      p.agentName = row.name;
    }

    let updated = 0;
    let skipped = 0;

    for (const p of patches) {
      if (!p.agentId) {
        skipped++;
        continue;
      }
      const v = p.values;
      console.log(
        `  id=${p.agentId}  ${p.agentName}  [${p.agentSlug}]  workspace=${v.workspace}`,
      );

      if (applyFlag) {
        await conn.execute(
          `UPDATE agents SET
             avatarUrl = ?, coverUrl = ?,
             bio_en = ?, specialty_en = ?,
             workspace = ?, workspace_tags = ?,
             methodology = ?, workingPrinciples = ?,
             aiModelSource = ?, aiModelFallback = ?, aiModelFallbackSource = ?,
             updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            v.avatarUrl,
            v.coverUrl,
            v.bio_en,
            v.specialty_en,
            v.workspace,
            v.workspace_tags,
            v.methodology,
            v.workingPrinciples,
            v.aiModelSource,
            v.aiModelFallback,
            v.aiModelFallbackSource,
            p.agentId,
          ],
        );
        updated++;
      }
    }

    if (applyFlag) {
      console.log(`\n[upgrade-lead-fields] UPDATED ${updated} agents`);
    } else {
      console.log(
        `\n[upgrade-lead-fields] DRY-RUN. Would update ${patches.length - skipped} agents. Re-run with --apply to commit.`,
      );
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[upgrade-lead-fields] FAILED:", err);
  process.exit(1);
});
