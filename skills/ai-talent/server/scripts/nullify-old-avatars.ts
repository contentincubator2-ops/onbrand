/**
 * nullify-old-avatars — zero-cost instant fix for non-notionists agent avatars.
 *
 * Sets avatarUrl = NULL for every isAvailable agent whose current avatarUrl
 * is NOT a canonical /static/covers/agent-<slug>.png (the gpt-image-1 Notion
 * portraits). NULL causes AgentAvatar.tsx to fall back to DiceBear notionists,
 * which is the approved v2 style.
 *
 * Safe to re-run; agents that already have proper covers are untouched.
 *
 * Run on VM:
 *   cd /opt/marketing-os/app/skills/ai-talent
 *   npx tsx server/scripts/nullify-old-avatars.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "mos_db",
  });

  // ── Audit: show current avatar_type breakdown ─────────────────────────────
  const [audit]: any = await pool.execute(`
    SELECT
      CASE
        WHEN avatarUrl IS NULL                              THEN 'null (will use DiceBear)'
        WHEN avatarUrl LIKE '/static/covers/agent-%'       THEN 'notion-cover (keep)'
        WHEN avatarUrl LIKE '%dicebear%notionists%'        THEN 'dicebear-notionists (keep)'
        WHEN avatarUrl LIKE '%dicebear%'                   THEN 'dicebear-other (will null)'
        ELSE                                                    'old/unknown (will null)'
      END AS avatar_type,
      COUNT(*) AS cnt
    FROM agents
    WHERE isAvailable = 1
    GROUP BY 1
    ORDER BY 2 DESC
  `);
  console.log("\n── Current avatar breakdown (isAvailable=1) ──");
  for (const row of audit) {
    console.log(`  ${String(row.avatar_type).padEnd(38)} ${row.cnt}`);
  }

  // ── Count how many will be nullified ─────────────────────────────────────
  const [preview]: any = await pool.execute(`
    SELECT COUNT(*) AS cnt
    FROM agents
    WHERE isAvailable = 1
      AND avatarUrl IS NOT NULL
      AND avatarUrl NOT LIKE '/static/covers/agent-%'
      AND avatarUrl NOT LIKE '%dicebear%notionists%'
  `);
  const toNull = Number(preview[0].cnt);
  if (toNull === 0) {
    console.log("\n✓ Nothing to do — all avatars are already canonical or null.\n");
    await pool.end();
    return;
  }

  console.log(`\n→ Nullifying ${toNull} old/non-notionists avatarUrl(s)…`);

  // ── Apply ─────────────────────────────────────────────────────────────────
  const [result]: any = await pool.execute(`
    UPDATE agents
    SET avatarUrl = NULL
    WHERE isAvailable = 1
      AND avatarUrl IS NOT NULL
      AND avatarUrl NOT LIKE '/static/covers/agent-%'
      AND avatarUrl NOT LIKE '%dicebear%notionists%'
  `);
  console.log(`✓ Updated ${result.affectedRows} rows — agents now fall back to DiceBear notionists.\n`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
