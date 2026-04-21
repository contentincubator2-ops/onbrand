/**
 * merge-duplicate-squads.ts — Fix duplicate squad slugs
 *
 * When multiple squad records have the same slug, this script:
 * 1. For each duplicate slug, keeps the one with the most agents
 * 2. Marks others as is_active = 0
 * 3. Updates any missions pointing to old records to point to the kept one
 *
 * Run: ts-node scripts/merge-duplicate-squads.ts
 */

import localPool from "../server/localDb";
import { getDb } from "../server/db";

async function mergeDuplicateSquads() {
  console.log("[mergeDuplicateSquads] Starting merge...\n");

  const db = await getDb();
  if (!db) {
    console.error("Cannot connect to main DB");
    process.exit(1);
  }

  try {
    // Find duplicate slugs
    const [dupRows] = await localPool.execute(
      `SELECT slug FROM squads WHERE is_active = 1 GROUP BY slug HAVING COUNT(*) > 1`
    ) as any[];

    if ((dupRows as any[]).length === 0) {
      console.log("✅ No duplicate slugs found");
      process.exit(0);
    }

    console.log(`Found ${(dupRows as any[]).length} duplicate slugs:\n`);

    for (const { slug } of dupRows as any[]) {
      console.log(`Processing slug: "${slug}"`);

      // Get all squads with this slug, sorted by agent count (descending)
      const [squadRows] = await localPool.execute(
        `SELECT id, name, agents FROM squads WHERE slug = ? AND is_active = 1 ORDER BY agents DESC`,
        [slug]
      ) as any[];

      const squads = squadRows as any[];
      if (squads.length <= 1) continue;

      const keepSquad = squads[0];
      const mergeSquads = squads.slice(1);

      console.log(`  Keeping id=${keepSquad.id} (has most agents)`);
      console.log(`  Deactivating: ${mergeSquads.map((s) => `id=${s.id}`).join(", ")}`);

      // Deactivate duplicate squads
      for (const mergeSquad of mergeSquads) {
        await localPool.execute(
          `UPDATE squads SET is_active = 0 WHERE id = ?`,
          [mergeSquad.id]
        );
        console.log(`    ✓ Deactivated id=${mergeSquad.id}`);
      }

      // Update missions pointing to deactivated squads to point to keeper
      for (const mergeSquad of mergeSquads) {
        const [missionRows] = await db.execute(
          `SELECT id FROM missions WHERE squadSlug = ? LIMIT 100`,
          [mergeSquad.id.toString()]
        ) as any[];

        if ((missionRows as any[]).length > 0) {
          await db.execute(
            `UPDATE missions SET squadSlug = ? WHERE squadSlug = ?`,
            [keepSquad.id.toString(), mergeSquad.id.toString()]
          );
          console.log(`    ✓ Updated ${(missionRows as any[]).length} missions to point to id=${keepSquad.id}`);
        }
      }

      console.log();
    }

    console.log("✅ Merge complete!");

  } catch (error) {
    console.error("[mergeDuplicateSquads] Error:", error);
    process.exit(1);
  }

  process.exit(0);
}

mergeDuplicateSquads();
