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

    // 6. queued_jobs — DB-backed queue rows for Vercel-native execution.
    //    Replaces BullMQ/Redis state on Vercel (see server/queue/marketingQueue.ts).
    //    The VM path still uses BullMQ, so this table is Vercel-only data.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS queued_jobs (
        id             VARCHAR(64)  NOT NULL PRIMARY KEY,
        queue          VARCHAR(64)  NOT NULL,
        name           VARCHAR(100) NOT NULL,
        data           LONGTEXT     NOT NULL,
        status         ENUM('waiting','active','completed','failed')
                       NOT NULL DEFAULT 'waiting',
        progress       INT          NOT NULL DEFAULT 0,
        result         LONGTEXT     NULL,
        failed_reason  TEXT         NULL,
        attempts       INT          NOT NULL DEFAULT 0,
        created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                              ON UPDATE CURRENT_TIMESTAMP(3),
        started_at     DATETIME(3)  NULL,
        completed_at   DATETIME(3)  NULL,
        INDEX idx_queue_status (queue, status),
        INDEX idx_status_updated (status, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] queued_jobs: OK");

    // 7. brands columns the drizzle schema expects but Azure sowork_db
    //    is missing. Code paths that read these (positioningSummary,
    //    positioningReport, brandVoice, soworkAnalysis, isDefault) would
    //    otherwise raise ER_BAD_FIELD_ERROR like users.registrationIp did.
    for (const col of [
      { name: "positioningSummary", type: "TEXT NULL" },
      { name: "positioningReport",  type: "JSON NULL" },
      { name: "brandVoice",         type: "TEXT NULL" },
      { name: "soworkAnalysis",     type: "JSON NULL" },
      { name: "isDefault",          type: "TINYINT(1) NOT NULL DEFAULT 0" },
    ] as const) {
      const [exists] = await conn.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brands' AND COLUMN_NAME = ?`,
        [col.name],
      ) as any;
      if ((exists as any[]).length === 0) {
        await conn.execute(`ALTER TABLE \`brands\` ADD COLUMN \`${col.name}\` ${col.type}`);
        console.log(`[migrate] brands.${col.name}: added`);
      } else {
        console.log(`[migrate] brands.${col.name}: already exists, skipped`);
      }
    }

    // 8. chat_messages.phaseOrder (idempotent)
    {
      const [exists] = await conn.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_messages' AND COLUMN_NAME = 'phaseOrder'`,
      ) as any;
      if ((exists as any[]).length === 0) {
        await conn.execute(`ALTER TABLE \`chat_messages\` ADD COLUMN \`phaseOrder\` INT NULL`);
        console.log("[migrate] chat_messages.phaseOrder: added");
      } else {
        console.log("[migrate] chat_messages.phaseOrder: already exists, skipped");
      }
    }

    // 9. users.registrationIp + users.lastLoginIp (idempotent)
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

    // ── main-branch additions (merged from origin/main) ──────────────
    // Strategy Deck — brand_strategies table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_strategies (
        id                INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId           INT          NOT NULL,
        userId            INT          NULL,
        methodologySlug   VARCHAR(100) NOT NULL,
        methodologyName   VARCHAR(255) NOT NULL,
        methodologyAuthor VARCHAR(255) NULL,
        layer             VARCHAR(32)  NULL,
        name              VARCHAR(255) NOT NULL,
        status            ENUM('draft','active','archived') NOT NULL DEFAULT 'draft',
        summary           TEXT         NULL,
        config            JSON         NULL,
        activatedAt       TIMESTAMP(3) NULL,
        expiresAt         TIMESTAMP(3) NULL,
        archivedAt        TIMESTAMP(3) NULL,
        createdAt         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_brand         (brandId),
        INDEX idx_status        (status),
        INDEX idx_brand_status  (brandId, status),
        INDEX idx_expires       (expiresAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_strategies: OK");

    // Strategy chat — lightweight per-strategy mini conversations (card-back drawer)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_strategy_messages (
        id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        strategyId  INT          NOT NULL,
        role        ENUM('user','assistant','system') NOT NULL,
        content     LONGTEXT     NOT NULL,
        createdAt   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_strategy (strategyId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_strategy_messages: OK");

    // Intel zone — brand_intel_signals table (Phase 2A)
    // One row = one "情報點": competitor move, trend, social mention, internal data, or manual note.
    // Strategy deck autoFill reads recent signals to ground its output in real data.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_intel_signals (
        id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId      INT          NOT NULL,
        userId       INT          NULL,
        type         ENUM('competitor','trend','social','internal','manual') NOT NULL DEFAULT 'manual',
        source       VARCHAR(255) NOT NULL,
        headline     VARCHAR(500) NOT NULL,
        body         TEXT         NULL,
        url          VARCHAR(1000) NULL,
        relevance    ENUM('high','medium','low') NOT NULL DEFAULT 'medium',
        capturedAt   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        createdAt    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_brand           (brandId, capturedAt),
        INDEX idx_brand_type      (brandId, type),
        INDEX idx_brand_relevance (brandId, relevance, capturedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_intel_signals: OK");

    // Intel zone — brand_watchlist (Phase 2A Ext)
    // Tracks which keywords/competitor names the DetectZone auto-feed should
    // surface from sowork_db.market_data. One row per brand; JSON arrays for
    // keywords and competitorNames. suggestedBy/suggestedAt track the last LLM
    // recommendation so we can diff user edits vs AI suggestions.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_watchlist (
        id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId          INT          NOT NULL UNIQUE,
        userId           INT          NULL,
        keywords         JSON         NULL,
        competitorNames  JSON         NULL,
        industryTags     JSON         NULL,
        suggestedBy      VARCHAR(64)  NULL,
        suggestedAt      TIMESTAMP(3) NULL,
        createdAt        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_watchlist: OK");

    // Intel zone — brand_tool_credentials (Phase 2A Ext Batch 2-1)
    // Per-brand credentials for third-party marketing tools (Similarweb, Ahrefs,
    // SEMrush, GWI, Meltwater, Opview, Reddit, YouTube, etc.). Payload is a JSON
    // blob encrypted at rest via _core/encryption.ts (AES-256-GCM).
    //
    // authType:
    //   api_key           — single API token (Ahrefs, Similarweb, YouTube)
    //   username_password — browser-automation login (Opview, Meltwater, GWI)
    //   oauth_token       — OAuth refresh+access (Reddit, future Meta/LinkedIn)
    //
    // We NEVER return encryptedPayload back to the client; UI reads maskedFields
    // which is rebuilt server-side on each read.
    //
    // UNIQUE KEY (brandId, tool) ensures one credential row per tool per brand;
    // upsert via ON DUPLICATE KEY UPDATE.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_tool_credentials (
        id                INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId           INT          NOT NULL,
        userId            INT          NULL,
        tool              VARCHAR(64)  NOT NULL,
        authType          ENUM('api_key','username_password','oauth_token') NOT NULL,
        encryptedPayload  TEXT         NOT NULL,
        fieldHints        JSON         NULL,
        status            ENUM('pending','ok','error','expired') NOT NULL DEFAULT 'pending',
        lastTestedAt      TIMESTAMP(3) NULL,
        lastError         VARCHAR(500) NULL,
        termsAcceptedAt   TIMESTAMP(3) NULL,
        createdAt         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_brand_tool (brandId, tool),
        INDEX idx_brand_status (brandId, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_tool_credentials: OK");

    // ───────────────────────────────────────────────────────────────
    // 7. Decision AI tables (decisions / options / evidence / outcomes
    //    + triage_sessions + execution_combinations)
    //
    //    Pivot: Marketing OS squads stop being "workflow executors" and
    //    start producing Decision Records. Each squad run writes a row
    //    into `decisions` with options, evidence refs, recommendation,
    //    confidence, reversibility, audit score, stale date.
    //
    //    All tables are additive — they do NOT alter `squads` or any
    //    existing table. Backwards-compatible with current workflow engine.
    // ───────────────────────────────────────────────────────────────

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS decisions (
        id                  BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId             INT          NOT NULL,
        squadId             INT          NULL,
        missionId           INT          NULL,
        decisionType        VARCHAR(64)  NOT NULL,
        parentDecisionId    BIGINT       NULL,
        status              ENUM('draft','recommended','approved','active','stale','archived','dissented')
                                         NOT NULL DEFAULT 'draft',
        title               VARCHAR(255) NULL,
        summary             TEXT         NULL,
        recommendedOptionId BIGINT       NULL,
        confidence          DECIMAL(4,3) NULL,
        reversibility       ENUM('one-way','two-way') NOT NULL DEFAULT 'two-way',
        auditScore          SMALLINT     NULL,
        auditedAt           TIMESTAMP(3) NULL,
        activatedAt         TIMESTAMP(3) NULL,
        staleAt             TIMESTAMP(3) NULL,
        publishedAt         TIMESTAMP(3) NULL,
        decidedBy           VARCHAR(128) NULL,
        decidedAt           TIMESTAMP(3) NULL,
        payload             JSON         NULL,
        createdAt           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                         ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_brand_status (brandId, status),
        INDEX idx_brand_type   (brandId, decisionType),
        INDEX idx_parent       (parentDecisionId),
        INDEX idx_stale        (status, staleAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] decisions: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS decision_options (
        id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        decisionId        BIGINT       NOT NULL,
        label             VARCHAR(255) NOT NULL,
        rationale         TEXT         NULL,
        pros              JSON         NULL,
        cons              JSON         NULL,
        expectedOutcome   TEXT         NULL,
        isRecommended     TINYINT(1)   NOT NULL DEFAULT 0,
        orderIndex        SMALLINT     NOT NULL DEFAULT 0,
        createdAt         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_decision (decisionId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] decision_options: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS decision_evidence (
        id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        decisionId  BIGINT       NOT NULL,
        sourceType  ENUM('scout','market_data','archetype','user_input','calc','parent_decision')
                                 NOT NULL,
        sourceRef   VARCHAR(255) NOT NULL,
        weight      DECIMAL(4,3) NULL,
        stance      ENUM('supports','contradicts','neutral') NOT NULL DEFAULT 'supports',
        snippet     TEXT         NULL,
        createdAt   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_decision (decisionId),
        INDEX idx_source   (sourceType, sourceRef)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] decision_evidence: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS decision_outcomes (
        id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        decisionId      BIGINT       NOT NULL,
        observedAt      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        metrics         JSON         NULL,
        verdict         ENUM('win','loss','push','inconclusive') NULL,
        lessonsLearned  TEXT         NULL,
        reportedBy      VARCHAR(128) NULL,
        INDEX idx_decision (decisionId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] decision_outcomes: OK");

    // Diagnostic wizard state — point B of the UX pivot
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS decision_triage_sessions (
        id                    BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId               INT          NOT NULL,
        userId                INT          NULL,
        \`trigger\`           VARCHAR(64)  NOT NULL,
        stageOrScale          VARCHAR(64)  NULL,
        recommendedDecisionIds JSON        NULL,
        selectedDecisionId    BIGINT       NULL,
        notes                 TEXT         NULL,
        createdAt             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_brand (brandId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] decision_triage_sessions: OK");

    // Strategy × Channel × KPI combinator — point D of the UX pivot
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS execution_combinations (
        id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId              INT          NOT NULL,
        strategyDecisionId   BIGINT       NOT NULL,
        channelId            VARCHAR(32)  NOT NULL,
        kpiTarget            VARCHAR(64)  NULL,
        generatedOutput      LONGTEXT     NULL,
        auditScore           SMALLINT     NULL,
        auditIssues          JSON         NULL,
        status               ENUM('generated','audited','approved','published','dissented')
                                          NOT NULL DEFAULT 'generated',
        publishedAt          TIMESTAMP(3) NULL,
        createdAt            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                          ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_brand_channel (brandId, channelId),
        INDEX idx_strategy      (strategyDecisionId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] execution_combinations: OK");

    // ─── 8. Decision AI phase 2 — templates, chat threads, image gen ─────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_methodology_templates (
        id                 BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId            INT          NOT NULL,
        userId             INT          NOT NULL,
        baseSquadId        INT          NULL,
        slug               VARCHAR(160) NOT NULL,
        name               VARCHAR(255) NOT NULL,
        description        TEXT         NULL,
        accent             ENUM('teal','red','blue') NOT NULL DEFAULT 'teal',
        stepsOverride      JSON         NULL,
        promptsOverride    JSON         NULL,
        scheduleCron       VARCHAR(64)  NULL,
        scheduleNextRunAt  TIMESTAMP(3) NULL,
        runCount           INT          NOT NULL DEFAULT 0,
        avgAuditScore      DECIMAL(5,2) NULL,
        lastRunAt          TIMESTAMP(3) NULL,
        createdAt          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                         ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_brand_slug (brandId, slug),
        INDEX idx_brand_user     (brandId, userId),
        INDEX idx_schedule       (scheduleNextRunAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] user_methodology_templates: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS decision_chat_threads (
        id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        decisionId   BIGINT       NOT NULL,
        brandId      INT          NOT NULL,
        agentId      INT          NULL,
        title        VARCHAR(255) NULL,
        createdAt    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_decision (decisionId),
        INDEX idx_brand (brandId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] decision_chat_threads: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS decision_chat_messages (
        id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        threadId    BIGINT       NOT NULL,
        decisionId  BIGINT       NOT NULL,
        role        ENUM('user','agent','mention','system') NOT NULL,
        authorUserId  INT        NULL,
        authorAgentId INT        NULL,
        mentionUserIds JSON      NULL,
        content     MEDIUMTEXT   NOT NULL,
        createdAt   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_thread (threadId, createdAt),
        INDEX idx_decision (decisionId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] decision_chat_messages: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS generated_images (
        id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId        INT          NOT NULL,
        decisionId     BIGINT       NULL,
        optionId       BIGINT       NULL,
        provider       VARCHAR(32)  NOT NULL,
        model          VARCHAR(64)  NOT NULL,
        prompt         TEXT         NOT NULL,
        negativePrompt TEXT         NULL,
        sizeSpec       VARCHAR(24)  NULL,
        url            VARCHAR(1024) NULL,
        b64DataKey     VARCHAR(255) NULL,
        cost           DECIMAL(8,4) NULL,
        status         ENUM('pending','ready','failed') NOT NULL DEFAULT 'pending',
        errorMsg       TEXT         NULL,
        createdAt      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_brand_decision (brandId, decisionId),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] generated_images: OK");

    // ─── Methodology provenance (Sprint 1, 2026-04-25) ─────────────────────
    // Adds the columns that turn squads.* into a versioned methodology
    // graph: every squad knows where it came from (seeded / ingested
    // from a URL / forked from another squad), who created it, and
    // what its parent is. Powers MethodologyCatalog source pills,
    // the IngestDrawer, and the Hermes-style "save as new methodology"
    // flow on MissionDetail dirty edits.
    const wantsCol = async (col: string): Promise<boolean> => {
      const [r] = await conn.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'squads' AND COLUMN_NAME = ?`,
        [col]
      ) as any;
      return (r as any[]).length === 0;
    };
    if (await wantsCol("source")) {
      await conn.execute(`
        ALTER TABLE squads
          ADD COLUMN source ENUM('seeded','ingested','forked')
            CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            NOT NULL DEFAULT 'seeded'
      `);
      await conn.execute(`CREATE INDEX idx_squads_source ON squads(source)`);
      console.log("[migrate] squads.source: added (default 'seeded')");
    } else {
      console.log("[migrate] squads.source: already exists, skipped");
    }
    if (await wantsCol("parent_squad_id")) {
      await conn.execute(`ALTER TABLE squads ADD COLUMN parent_squad_id INT NULL`);
      await conn.execute(`CREATE INDEX idx_squads_parent ON squads(parent_squad_id)`);
      console.log("[migrate] squads.parent_squad_id: added");
    } else {
      console.log("[migrate] squads.parent_squad_id: already exists, skipped");
    }
    if (await wantsCol("created_by_user_id")) {
      await conn.execute(`ALTER TABLE squads ADD COLUMN created_by_user_id INT NULL`);
      await conn.execute(`CREATE INDEX idx_squads_creator ON squads(created_by_user_id)`);
      console.log("[migrate] squads.created_by_user_id: added");
    } else {
      console.log("[migrate] squads.created_by_user_id: already exists, skipped");
    }
    if (await wantsCol("ingest_source_url")) {
      await conn.execute(`ALTER TABLE squads ADD COLUMN ingest_source_url VARCHAR(1024) NULL`);
      console.log("[migrate] squads.ingest_source_url: added");
    } else {
      console.log("[migrate] squads.ingest_source_url: already exists, skipped");
    }
    if (await wantsCol("hero_image_url")) {
      await conn.execute(`ALTER TABLE squads ADD COLUMN hero_image_url VARCHAR(1024) NULL`);
      console.log("[migrate] squads.hero_image_url: added");
    } else {
      console.log("[migrate] squads.hero_image_url: already exists, skipped");
    }
    if (await wantsCol("hero_image_prompt")) {
      await conn.execute(`ALTER TABLE squads ADD COLUMN hero_image_prompt TEXT NULL`);
      console.log("[migrate] squads.hero_image_prompt: added");
    } else {
      console.log("[migrate] squads.hero_image_prompt: already exists, skipped");
    }

    // squad_ingest_jobs — async ingest log so users can retry / audit.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS squad_ingest_jobs (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        userId        INT NOT NULL,
        sourceUrl     VARCHAR(1024) NOT NULL,
        status        ENUM('pending','extracting','reviewing','done','failed') NOT NULL DEFAULT 'pending',
        extracted     LONGTEXT NULL,
        squadId       INT NULL,
        errorMsg      TEXT NULL,
        createdAt     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_user (userId),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] squad_ingest_jobs: OK");

    // project_sync_jobs — Pipedream-driven asset sync from FB/IG/YT/Drive/etc.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS project_sync_jobs (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        userId          INT NOT NULL,
        brandId         INT NULL,
        missionId       INT NULL,
        source          VARCHAR(32) NOT NULL,
        sourceParams    JSON NULL,
        pipedreamRunId  VARCHAR(128) NULL,
        status          ENUM('pending','running','done','failed') NOT NULL DEFAULT 'pending',
        assetCount      INT NOT NULL DEFAULT 0,
        progressPct     INT NOT NULL DEFAULT 0,
        errorMsg        TEXT NULL,
        webhookSecret   VARCHAR(64) NOT NULL,
        createdAt       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_user (userId),
        INDEX idx_brand (brandId),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] project_sync_jobs: OK");

    // project_assets — synced assets land here for use in missions.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS project_assets (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        userId        INT NOT NULL,
        brandId       INT NULL,
        missionId     INT NULL,
        syncJobId     INT NULL,
        source        VARCHAR(32) NOT NULL,
        kind          VARCHAR(32) NOT NULL,
        title         VARCHAR(512) NULL,
        externalId    VARCHAR(256) NULL,
        externalUrl   VARCHAR(1024) NULL,
        mediaUrl      VARCHAR(1024) NULL,
        thumbnailUrl  VARCHAR(1024) NULL,
        mimeType      VARCHAR(64) NULL,
        sizeBytes     BIGINT NULL,
        textContent   LONGTEXT NULL,
        meta          JSON NULL,
        createdAt     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_user (userId),
        INDEX idx_brand (brandId),
        INDEX idx_mission (missionId),
        INDEX idx_job (syncJobId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] project_assets: OK");

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
