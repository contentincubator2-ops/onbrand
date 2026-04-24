/**
 * Standalone DB migration script.
 * Runs idempotent ALTER TABLE / CREATE TABLE statements.
 * Usage: npm run db:migrate
 */
import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // All data lives in mos_db — prefer LOCAL_DB_* env vars
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || process.env.DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || process.env.DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     || process.env.DB_NAME     || "mos_db",
  });

  const conn = await pool.getConnection();
  try {
    console.log("[migrate] Running migrations...");

    // 1. Add description column to missions (idempotent: check information_schema first)
    const [colRows] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'missions' AND COLUMN_NAME = 'description'
    `) as any;
    if ((colRows as any[]).length === 0) {
      await conn.execute(`ALTER TABLE missions ADD COLUMN description TEXT NULL`);
      console.log("[migrate] missions.description: added");
    } else {
      console.log("[migrate] missions.description: already exists, skipped");
    }

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

    // 3. Add 'inactive' to missions.status enum (idempotent: check current column type first)
    const [enumRows] = await conn.execute(`
      SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'missions'
        AND COLUMN_NAME = 'status'
    `) as any;
    const currentType: string = (enumRows as any[])[0]?.COLUMN_TYPE ?? "";
    console.log("[migrate] missions.status current type:", currentType);
    if (!currentType.includes("'inactive'")) {
      await conn.execute(`
        ALTER TABLE missions
          MODIFY COLUMN \`status\`
          ENUM('inactive','active','completed','archived')
          CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
          NOT NULL DEFAULT 'inactive'
      `);
      console.log("[migrate] missions.status: added 'inactive', default changed");
    } else {
      console.log("[migrate] missions.status: 'inactive' already present, skipped");
    }

    // 4. Add tier + strategy_layer columns to squads (idempotent)
    //    tier: core/defer/kill — determines what clients see in UI
    //    strategy_layer: L1–L6 — the 6-layer strategy decision hierarchy
    const [squadTierCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'squads'
        AND COLUMN_NAME = 'tier'
    `) as any;
    if ((squadTierCol as any[]).length === 0) {
      await conn.execute(`
        ALTER TABLE squads
          ADD COLUMN tier ENUM('core','defer','kill')
            CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            NOT NULL DEFAULT 'defer'
      `);
      await conn.execute(`CREATE INDEX idx_squads_tier ON squads(tier)`);
      console.log("[migrate] squads.tier: added (default 'defer')");
    } else {
      console.log("[migrate] squads.tier: already exists, skipped");
    }

    const [squadLayerCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'squads'
        AND COLUMN_NAME = 'strategy_layer'
    `) as any;
    if ((squadLayerCol as any[]).length === 0) {
      await conn.execute(`
        ALTER TABLE squads
          ADD COLUMN strategy_layer ENUM(
            'L1_brand',
            'L2_product',
            'L3_audience',
            'L4_channel',
            'L5_campaign',
            'L6_validation',
            'unassigned'
          )
            CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            NOT NULL DEFAULT 'unassigned'
      `);
      await conn.execute(`CREATE INDEX idx_squads_layer ON squads(strategy_layer)`);
      console.log("[migrate] squads.strategy_layer: added (default 'unassigned')");
    } else {
      console.log("[migrate] squads.strategy_layer: already exists, skipped");
    }

    // 5. brand_reports + brand_report_sections
    //    Structured, editable squad-run outputs. Each workflow step becomes
    //    a brand_report_sections row so users can edit in-platform and
    //    regenerate from source messages without context switching.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_reports (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        missionId    INT NOT NULL UNIQUE,
        squadId      INT NOT NULL,
        squadSlug    VARCHAR(100),
        brandId      INT NULL,
        title        VARCHAR(255),
        status       ENUM('draft','finalized') NOT NULL DEFAULT 'draft',
        createdAt    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_mission (missionId),
        INDEX idx_brand   (brandId),
        INDEX idx_squad   (squadId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_reports: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_report_sections (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        reportId         INT NOT NULL,
        stepOrder        INT NOT NULL,
        stepName         VARCHAR(255),
        agentId          INT,
        agentRole        VARCHAR(128),
        agentName        VARCHAR(128),
        content          LONGTEXT,
        userEdited       TINYINT(1) NOT NULL DEFAULT 0,
        version          INT NOT NULL DEFAULT 1,
        sourceMessageId  INT NULL,
        isCurrent        TINYINT(1) NOT NULL DEFAULT 1,
        createdAt        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_report_step (reportId, stepOrder, isCurrent),
        INDEX idx_current     (reportId, isCurrent),
        INDEX idx_source_msg  (sourceMessageId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_report_sections: OK");

    // 6. users.registrationIp + users.lastLoginIp (idempotent)
    //    Drizzle schema added these for signup/login IP tracking; Azure
    //    sowork_db users was missing them, causing `Unknown column` on
    //    every auth query from Vercel.
    for (const col of ["registrationIp", "lastLoginIp"] as const) {
      const [exists] = await conn.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
        [col],
      ) as any;
      if ((exists as any[]).length === 0) {
        await conn.execute(`ALTER TABLE users ADD COLUMN \`${col}\` VARCHAR(45) NULL`);
        console.log(`[migrate] users.${col}: added`);
      } else {
        console.log(`[migrate] users.${col}: already exists, skipped`);
      }
    }

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
