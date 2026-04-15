/**
 * Standalone DB migration script.
 * Runs idempotent ALTER TABLE / CREATE TABLE statements.
 * Usage: npm run db:migrate
 */
import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const pool = createPool({
    host:     process.env.DB_HOST!,
    user:     process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: { rejectUnauthorized: false },
  });

  const conn = await pool.getConnection();
  try {
    console.log("[migrate] Running migrations...");

    // 1. Add description column to missions (idempotent via IF NOT EXISTS workaround)
    await conn.execute(`
      ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS description TEXT NULL
    `);
    console.log("[migrate] missions.description: OK");

    // 2. Create mission_resources table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS mission_resources (
        id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        missionId   INT          NOT NULL UNIQUE,
        status      VARCHAR(20)  NOT NULL DEFAULT 'pending',
        agents      INT          NOT NULL DEFAULT 0,
        skills      INT          NOT NULL DEFAULT 0,
        providers   INT          NOT NULL DEFAULT 0,
        skillList   LONGTEXT     NULL,
        providerList LONGTEXT    NULL,
        topAgents   LONGTEXT     NULL,
        createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] mission_resources: OK");

    console.log("[migrate] All migrations applied successfully.");
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
