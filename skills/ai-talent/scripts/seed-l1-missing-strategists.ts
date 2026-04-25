/**
 * seed-l1-missing-strategists.ts — Phase 2 helper
 *
 * Inserts the 3 strategist agents that were missing for L1 brand
 * methodologies (Trout differentiation, Sinek purpose, Ritson rigorous
 * brand mgmt). Each is a strategy-layer VP with a primarySkill that
 * the align-squad-leads scorer matches against the corresponding
 * squad slug.
 *
 * Idempotent: ON DUPLICATE KEY UPDATE on `slug` (unique).
 *
 * Already executed against prod 2026-04-25; this file exists so the
 * change is reproducible and reviewable in git.
 *
 *   npx tsx scripts/seed-l1-missing-strategists.ts
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

interface AgentSeed {
  slug: string;
  name: string;
  title: string;
  englishTitle: string;
  primarySkill: string;
  methodology: string;
  bio: string;
  specialty: string;
}

const SEEDS: AgentSeed[] = [
  {
    slug: "differentiation-positioning-trout-strategist",
    name: "Marcus Tsao",
    title: "Trout 差異化定位副總裁",
    englishTitle: "VP, Trout Differentiation Positioning",
    primarySkill: "differentiation-positioning-strategist",
    methodology: "differentiate-or-die",
    bio: "專精 Jack Trout《Differentiate or Die》方法論，協助品牌找出無可取代的差異化點。",
    specialty: "Trout 差異化策略 / 心智佔位 / 品牌獨特性定位",
  },
  {
    slug: "purpose-driven-positioning-sinek-strategist",
    name: "Sophia Wen",
    title: "Sinek 黃金圈定位副總裁",
    englishTitle: "VP, Purpose-Driven Positioning",
    primarySkill: "purpose-driven-positioning-strategist",
    methodology: "golden-circle",
    bio: "專精 Simon Sinek《Start With Why》黃金圈方法論，從 Why 出發建構品牌使命型定位。",
    specialty: "黃金圈定位 / 品牌使命驅動 / Why-How-What 框架",
  },
  {
    slug: "brand-ritson-management-strategist",
    name: "Daniel Ko",
    title: "Ritson 嚴謹品牌管理副總裁",
    englishTitle: "VP, Ritson Rigorous Brand Management",
    primarySkill: "ritson-brand-management-strategist",
    methodology: "rigorous-brand-management",
    bio: "專精 Mark Ritson 學院派品牌管理方法論，把證據導向、市場調研嚴謹度帶入品牌決策。",
    specialty: "Ritson 品牌管理 / 證據導向行銷 / 學院派品牌策略",
  },
];

async function main() {
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || process.env.DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || process.env.DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     || process.env.DB_NAME     || "mos_db",
  });

  try {
    for (const a of SEEDS) {
      await pool.execute(
        `INSERT INTO agents
           (slug, name, englishName, title, englishTitle, layer, primarySkill,
            jobLevel, aiModel, workspace, methodology, bio, specialty,
            isAvailable, reviewStatus)
         VALUES (?, ?, ?, ?, ?, 'strategy', ?,
            'vp', 'claude-opus-4-6', 'brand-positioning', ?, ?, ?,
            1, 'approved')
         ON DUPLICATE KEY UPDATE
            primarySkill=VALUES(primarySkill),
            methodology=VALUES(methodology),
            bio=VALUES(bio),
            specialty=VALUES(specialty)`,
        [a.slug, a.name, a.name, a.title, a.englishTitle, a.primarySkill,
         a.methodology, a.bio, a.specialty]
      );
      console.log(`[seed] upserted ${a.slug} (primarySkill=${a.primarySkill})`);
    }
    console.log(`\n[seed] ✅ ${SEEDS.length} L1 strategist agents ready.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[seed-l1-missing-strategists] FATAL:", e);
  process.exit(1);
});
