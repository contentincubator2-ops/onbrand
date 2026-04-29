/**
 * Skill upsert — INSERT or UPDATE one normalized skill.
 *
 * Idempotent on (slug). Re-running an ingest source updates existing rows
 * with newer manifest / score / security data.
 */

import type { Pool } from "mysql2/promise";
import type { NormalizedSkill } from "./types";

export interface UpsertResult {
  inserted: number;
  updated: number;
  rejected: number;   // failed security check
}

export async function upsertSkills(
  pool: Pool,
  skills: NormalizedSkill[],
): Promise<UpsertResult> {
  let inserted = 0, updated = 0, rejected = 0;

  for (const s of skills) {
    if (!s.securityCheck.passed) {
      rejected++;
      continue;
    }

    // Try INSERT first — UNIQUE on slug means duplicate triggers fallback to UPDATE.
    try {
      const [r]: any = await pool.execute(
        `INSERT INTO skills (
           slug, name, category, strategy_layer, source, source_url,
           description, manifest, origin_model, tested_models,
           security_check, quality_score, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          s.slug.slice(0, 188),
          s.name.slice(0, 254),
          s.category,
          s.strategyLayer,
          s.source,
          s.sourceUrl,
          s.description,
          s.manifest ? JSON.stringify(s.manifest) : null,
          s.originModel,
          s.testedModels ? JSON.stringify(s.testedModels) : null,
          JSON.stringify(s.securityCheck),
          s.qualityScore,
        ]
      );
      if (r.affectedRows > 0) inserted++;
    } catch (e: any) {
      if (e.code === "ER_DUP_ENTRY") {
        const [r]: any = await pool.execute(
          `UPDATE skills SET
             name = ?, category = ?, strategy_layer = ?, source_url = ?,
             description = ?, manifest = ?, origin_model = ?,
             tested_models = ?, security_check = ?, quality_score = ?
           WHERE slug = ?`,
          [
            s.name.slice(0, 254),
            s.category,
            s.strategyLayer,
            s.sourceUrl,
            s.description,
            s.manifest ? JSON.stringify(s.manifest) : null,
            s.originModel,
            s.testedModels ? JSON.stringify(s.testedModels) : null,
            JSON.stringify(s.securityCheck),
            s.qualityScore,
            s.slug.slice(0, 188),
          ]
        );
        if (r.affectedRows > 0) updated++;
      } else {
        console.error(`upsert failed for ${s.slug}:`, e.message);
        rejected++;
      }
    }
  }

  return { inserted, updated, rejected };
}
