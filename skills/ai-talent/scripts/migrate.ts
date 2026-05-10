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

    // ─── 9. agents.modelStack — multi-modal model declaration per agent ────
    // One JSON blob with the agent's full toolkit:
    //   {
    //     primary_llm: "gpt-4o" | "claude-opus-4-6" | ...,
    //     image_gen:   "fal/flux-pro-1.1" | "openai/gpt-image-1" | null,
    //     video_gen:   "fal/kling-2" | "fal/minimax-video" | null,
    //     tts:         "fal/elevenlabs-tts" | "openai/tts-1" | null,
    //     asr:         "fal/whisper" | "openai/whisper" | null,
    //     embed:       "azure/text-embedding-3-large" | "cohere/embed-v4",
    //     web_search:  "tavily" | "perplexity" | null,
    //     browser:     "browserbase" | null,
    //     social_post: "meta-graph" | null
    //   }
    // primary_llm SHOULD mirror agents.aiModel; the rest is opt-in per skill needs.
    const [agentModelStackCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agents' AND COLUMN_NAME = 'modelStack'
    `) as any;
    if ((agentModelStackCol as any[]).length === 0) {
      await conn.execute(`ALTER TABLE agents ADD COLUMN modelStack JSON NULL`);
      console.log("[migrate] agents.modelStack: added");
    } else {
      console.log("[migrate] agents.modelStack: already exists, skipped");
    }

    // ── 9a-bis. taskSystemPrompt — thick per-role operating manual (CJ 2026-05-08)
    // Each agent gets a 200-500w role-specific prompt: formulas, structure,
    // banlist, examples. Read by loadAgent() in quickTaskOrchestra and
    // prepended to every LLM call routed through the agent.
    const [agentSysPromptCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agents' AND COLUMN_NAME = 'taskSystemPrompt'
    `) as any;
    if ((agentSysPromptCol as any[]).length === 0) {
      await conn.execute(`ALTER TABLE agents ADD COLUMN taskSystemPrompt TEXT NULL`);
      console.log("[migrate] agents.taskSystemPrompt: added");
    } else {
      console.log("[migrate] agents.taskSystemPrompt: already exists, skipped");
    }

    // ── 9b. preferredModelTags — drives the squad-runner media picker ─────────
    // When a step's outputKind is image|video, the runner asks mediaModels.ts
    // `modelsForTag()` for each tag in this array and pre-selects the union as
    // recommended models in MediaGenFlow Step 3. Examples:
    //   ["logo", "vector"]              → Ideogram v3, Recraft v3, GPT Image 1
    //   ["cinematic", "ad-film"]        → Runway Gen-4, Veo 3
    //   ["i2v", "kv-animate"]           → Kling v1.6 i2v
    //   ["lipsync", "spokesperson"]     → Hedra Character 3
    //   ["asian-face", "chinese-style"] → Kling v2 master, Hailuo image
    // Empty / null = runner falls back to all `availableModels(kind)`.
    // agents + squads only — skills are an embedded JSON column on agents,
    // not their own table. Squad-runner reads either source.
    for (const table of ["agents", "squads"] as const) {
      const [tagCol] = await conn.execute(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = 'preferredModelTags'
      `) as any;
      if ((tagCol as any[]).length === 0) {
        // agents uses camelCase; squads (raw-SQL table) uses snake_case
        // historically but Drizzle migration above shows quoted ident is fine.
        // Use camelCase consistently — MySQL is case-insensitive on identifiers.
        await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN preferredModelTags JSON NULL`);
        console.log(`[migrate] ${table}.preferredModelTags: added`);
      } else {
        console.log(`[migrate] ${table}.preferredModelTags: already exists, skipped`);
      }
    }

    // ── 9c. mission_step_progress.canonical_message ─────────────────────────
    // Per CJ direction 2026-04-30: cross-model agents need ONE canonical
    // envelope (AgentMessage — see server/_core/agentMessage.ts). Each step
    // output gets persisted here as JSON conforming to the AgentMessage
    // schema. Legacy columns (status / agent_output / user_input) stay for
    // back-compat — read-time converter synthesizes envelope when missing.
    // Auto-create the table first in case earlier migrations haven't run.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS mission_step_progress (
        id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        mission_id   INT           NOT NULL,
        step_order   INT           NOT NULL,
        status       VARCHAR(20)   NOT NULL DEFAULT 'pending',
        user_input   TEXT,
        agent_output MEDIUMTEXT,
        agent_id     INT,
        agent_name   VARCHAR(120),
        history      JSON          NULL,
        updated_at   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                   ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uniq_step (mission_id, step_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [canonCol]: any = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'mission_step_progress'
        AND COLUMN_NAME = 'canonical_message'
    `);
    if ((canonCol as any[]).length === 0) {
      await conn.execute(
        `ALTER TABLE mission_step_progress ADD COLUMN canonical_message JSON NULL`,
      );
      console.log("[migrate] mission_step_progress.canonical_message: added");
    } else {
      console.log("[migrate] mission_step_progress.canonical_message: already exists, skipped");
    }

    // ── 9d. squads governance columns (is_approved + approval audit) ────────
    // CJ direction 2026-04-30: every squad must be CJ-reviewed before
    // appearing in front-stage pickers. is_approved=1 means audited &
    // released. Default 0 = drafted, won't show until flipped.
    // listForFront procedure (added in squadTemplateRouter) filters
    // is_active=1 AND is_approved=1.
    for (const col of [
      { name: "is_approved",   def: "TINYINT NOT NULL DEFAULT 0" },
      { name: "approved_by",   def: "INT NULL" },
      { name: "approved_at",   def: "TIMESTAMP NULL" },
    ]) {
      const [exists]: any = await conn.execute(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'squads'
          AND COLUMN_NAME = '${col.name}'
      `);
      if ((exists as any[]).length === 0) {
        await conn.execute(`ALTER TABLE squads ADD COLUMN ${col.name} ${col.def}`);
        console.log(`[migrate] squads.${col.name}: added`);
      } else {
        console.log(`[migrate] squads.${col.name}: already exists, skipped`);
      }
    }
    // Index for the listForFront filter — most common query.
    await conn.execute(`
      CREATE INDEX IF NOT EXISTS idx_squads_active_approved
        ON squads (is_active, is_approved)
    `).catch(() => { /* MySQL 5.7 doesn't support IF NOT EXISTS on CREATE INDEX */ });

    // CJ correction 2026-04-30: existing squads are NOT auto-approved.
    // All current squads are drafts pending CJ review. The previous one-
    // time seed was reverted via admin-revert-squad-approval workflow.
    // Future squads default is_approved=0 and require explicit approval.
    console.log("[migrate] squads.is_approved: column ready (no auto-seed; CJ reviews each squad)");

    // ─── 10. skill_catalog — harvested skill registry (anthropic + GLM + tools) ──
    // Source of truth for orphan-agent skill assignment. Each row binds a skill
    // to a provider so the skill cannot be moved across model families.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS skill_catalog (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        slug              VARCHAR(160) NOT NULL UNIQUE,
        name              VARCHAR(255) NOT NULL,
        source            VARCHAR(64)  NOT NULL,
        sourceUrl         VARCHAR(1024) NULL,
        boundProvider     VARCHAR(64)  NOT NULL,
        compatibleModels  JSON         NULL,
        category          VARCHAR(64)  NULL,
        description       TEXT         NULL,
        tools             JSON         NULL,
        modelCompat       JSON         NULL,
        tags              JSON         NULL,
        harvestedAt       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_provider (boundProvider),
        INDEX idx_category (category),
        INDEX idx_source   (source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] skill_catalog: OK");

    // ─── 11. agent_skill_assignments — orphan agent ↔ skill_catalog binding ──
    // Tracks which catalog skill each agent has been assigned, with provenance
    // (matched by primarySkill / aiModel / title token) for later audit.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS agent_skill_assignments (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        agentId       INT NOT NULL,
        skillSlug     VARCHAR(160) NOT NULL,
        boundProvider VARCHAR(64)  NOT NULL,
        matchReason   VARCHAR(64)  NULL,
        confidence    DECIMAL(4,3) NULL,
        assignedAt    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_agent_skill (agentId, skillSlug),
        INDEX idx_agent (agentId),
        INDEX idx_skill (skillSlug),
        INDEX idx_provider (boundProvider)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] agent_skill_assignments: OK");

    // ─── 12. Localized name columns for skills + agents ────────────────────
    // CJ direction 2026-04-28: skill code names (e.g., "accessibility-tester")
    // and English agent bios need a zh-TW human-readable variant for display.
    for (const col of [
      { table: "skills", name: "name_zh",        type: "VARCHAR(255) NULL" },
      { table: "skills", name: "description_zh", type: "TEXT NULL" },
      { table: "agents", name: "name_zh",        type: "VARCHAR(128) NULL" },
      { table: "agents", name: "title_zh",       type: "VARCHAR(255) NULL" },
      { table: "agents", name: "bio_zh",         type: "TEXT NULL" },
      { table: "squads", name: "name_zh",        type: "VARCHAR(255) NULL" },
      { table: "squads", name: "description_zh", type: "TEXT NULL" },
    ]) {
      const [r]: any = await conn.execute(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      `, [col.table, col.name]);
      if ((r as any[]).length === 0) {
        await conn.execute(`ALTER TABLE \`${col.table}\` ADD COLUMN \`${col.name}\` ${col.type}`);
        console.log(`[migrate] ${col.table}.${col.name}: added`);
      } else {
        console.log(`[migrate] ${col.table}.${col.name}: already exists, skipped`);
      }
    }

    // ─── 13. products + events tables (scope: brand × product × event) ────
    // CJ direction 2026-04-28: every agent run reads scope (user × brand
    // × product × event) before kicking off. Choose-one is allowed; user
    // selects one of the three as the active scope.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId          INT NOT NULL,
        brandId         INT NULL,
        slug            VARCHAR(120) NOT NULL,
        name            VARCHAR(255) NOT NULL,
        positioning     JSON NULL,
        createdAt       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_user_slug (userId, slug),
        INDEX idx_user (userId),
        INDEX idx_brand (brandId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] products: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS events (
        id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId          INT NOT NULL,
        brandId         INT NULL,
        productId       INT NULL,
        slug            VARCHAR(120) NOT NULL,
        name            VARCHAR(255) NOT NULL,
        startAt         DATETIME NULL,
        endAt           DATETIME NULL,
        positioning     JSON NULL,
        createdAt       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_user_slug (userId, slug),
        INDEX idx_user (userId),
        INDEX idx_brand (brandId),
        INDEX idx_product (productId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] events: OK");

    // event_products — many-to-many join (CJ direction 2026-04-29:
    // 活動可以隸屬於品牌或多個產品). The single events.productId column
    // stays for backward compat — when an event scopes to exactly ONE
    // product, both columns agree; when it spans multiple, productId stays
    // NULL and links live in this join table.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS event_products (
        eventId    INT NOT NULL,
        productId  INT NOT NULL,
        createdAt  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (eventId, productId),
        INDEX idx_event   (eventId),
        INDEX idx_product (productId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] event_products (m:n): OK");

    // brands.positioning JSON column (full brand positioning book + cards)
    const [bp]: any = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brands' AND COLUMN_NAME = 'positioning'
    `);
    if ((bp as any[]).length === 0) {
      await conn.execute(`ALTER TABLE brands ADD COLUMN positioning JSON NULL`);
      console.log("[migrate] brands.positioning: added");
    } else {
      console.log("[migrate] brands.positioning: already exists, skipped");
    }

    // ─── 14. Creative cases / award frameworks (event positioning RAG) ──
    // From sowork-ai-v2 — campaign positioning analysis pipeline injects
    // these as context when matching awards + generating proposals.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS award_frameworks (
        id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name            VARCHAR(200) NOT NULL,
        category        VARCHAR(100) NULL,
        description     TEXT NULL,
        successCriteria JSON NULL,
        caseStudies     JSON NULL,
        averageRoi      VARCHAR(50) NULL,
        suitableFor     JSON NULL,
        createdAt       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_name (name),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] award_frameworks: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS creative_cases (
        id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        award_name      VARCHAR(200) NULL,
        year            INT NULL,
        award_level     VARCHAR(100) NULL COMMENT 'Grand Prix/Gold/Silver/Bronze/Shortlist',
        award_category  VARCHAR(300) NULL,
        sub_category    VARCHAR(300) NULL,
        campaign_title  VARCHAR(500) NULL,
        brand           VARCHAR(300) NULL,
        agency          VARCHAR(300) NULL,
        country         VARCHAR(100) NULL,
        industry        VARCHAR(300) NULL,
        description     TEXT NULL,
        source_url      VARCHAR(500) NULL,
        tags            JSON NULL,
        scraped_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_award_name (award_name),
        INDEX idx_year (year),
        INDEX idx_award_level (award_level),
        INDEX idx_industry (industry),
        UNIQUE KEY uk_source_url (source_url(490))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] creative_cases: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS award_categories (
        id                   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        award_name           VARCHAR(200) NOT NULL,
        category_name        VARCHAR(300) NOT NULL COMMENT '子獎項名稱',
        category_description TEXT NULL,
        judging_criteria     TEXT NULL,
        eligibility          TEXT NULL,
        entry_fee            VARCHAR(200) NULL,
        source_url           TEXT NULL,
        scraped_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_award_name (award_name),
        UNIQUE KEY uk_award_category (award_name, category_name(200))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] award_categories: OK");

    // Seed 6 base award frameworks (idempotent — INSERT IGNORE)
    await conn.execute(`
      INSERT IGNORE INTO award_frameworks
        (name, category, description, successCriteria, suitableFor, averageRoi)
      VALUES
        ('坎城創意節 (Cannes Lions)',  '國際創意獎', '全球廣告創意界最高榮譽，著重於原創性、品牌關聯性和商業影響力',
          '[\"原創創意概念\",\"品牌契合度\",\"商業影響力\",\"跨媒體整合\"]',
          '{\"challenges\":[\"awareness\",\"differentiation\",\"perception\"],\"goals\":[\"brand_awareness\",\"brand_refresh\"]}', '300%+'),
        ('艾菲獎 (Effie Awards)',      '行銷效果獎', '專注於行銷效果和 ROI 的權威獎項',
          '[\"清晰的策略思維\",\"可量化的成效指標\",\"創意與效果的平衡\",\"預算效率\"]',
          '{\"challenges\":[\"conversion\",\"retention\",\"motivation\"],\"goals\":[\"sales_growth\",\"market_expansion\"]}', '250%+'),
        ('龍璽獎 (Long Xi Awards)',    '大中華創意獎', '大中華區最具影響力的創意獎項',
          '[\"本土文化洞察\",\"國際創意水準\",\"市場適應性\",\"社會影響力\"]',
          '{\"challenges\":[\"awareness\",\"trust\",\"engagement\"],\"goals\":[\"brand_awareness\",\"new_product_launch\"]}', '200%+'),
        ('金手指獎 (Golden Finger Awards)', '數位行銷獎', '專注於數位行銷創新的獎項',
          '[\"數位創新\",\"用戶體驗\",\"數據驅動\",\"社群互動\"]',
          '{\"challenges\":[\"engagement\",\"conversion\",\"differentiation\"],\"goals\":[\"sales_growth\",\"brand_awareness\"]}', '180%+'),
        ('時報廣告金像獎', '台灣本土獎', '台灣歷史最悠久的廣告獎項',
          '[\"本土市場洞察\",\"創意表現\",\"品牌建設\",\"社會責任\"]',
          '{\"challenges\":[\"awareness\",\"trust\",\"perception\"],\"goals\":[\"brand_awareness\",\"brand_refresh\"]}', '150%+'),
        ('CLIO 獎', '國際創意獎', '歷史悠久的國際廣告獎項',
          '[\"創意卓越\",\"文化影響力\",\"執行品質\",\"突破性概念\"]',
          '{\"challenges\":[\"differentiation\",\"perception\",\"awareness\"],\"goals\":[\"brand_refresh\",\"brand_awareness\"]}', '220%+')
    `);
    console.log("[migrate] award_frameworks seed: OK");

    // ── task_catalog (CJ direction 2026-05-01) ─────────────────────────────
    // Curated list of REAL deliverables agency actually sells. Replaces
    // raw squad-search as the front-door — picker hits this first, only
    // falls back to squads when catalog is empty. Lets us hide ~4000
    // generic auto-generated squads behind status='archived' until they
    // get reviewed.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS task_catalog (
        id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        slug          VARCHAR(120) NOT NULL UNIQUE,
        name_zh       VARCHAR(255) NOT NULL,
        name_en       VARCHAR(255) NULL,
        description   TEXT         NOT NULL,
        workspace     VARCHAR(50)  NOT NULL,
        category      VARCHAR(50)  NOT NULL,
        impl_kind     ENUM('atomic','squad') NOT NULL,
        squad_id      INT          NULL,
        agent_id      INT          NULL,
        status        ENUM('active','coming_soon','archived') NOT NULL DEFAULT 'coming_soon',
        bypassable    BOOLEAN      NOT NULL DEFAULT TRUE,
        search_keywords TEXT       NULL,
        estimated_minutes INT      NULL,
        upvotes       INT          NOT NULL DEFAULT 0,
        created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        approved_at   TIMESTAMP    NULL,
        approved_by   INT          NULL,
        KEY idx_status (status),
        KEY idx_workspace_status (workspace, status),
        KEY idx_category_status (category, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] task_catalog: created (or already existed)");

    // ── task_category (CJ direction 2026-05-02) ────────────────────────────
    // Groups task_catalog rows by deliverable type. Lets multiple
    // methodologies coexist for the same outcome, e.g.
    //   category "FB 月行事曆" — methods:
    //     - Joe Pulizzi 內容支柱法 (task_catalog row 1)
    //     - GaryVee Jab Hook 法    (task_catalog row N)
    //     - Latane Conant 法       (task_catalog row N+1)
    // Picker shows categories first; user picks methodology after.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS task_category (
        id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        slug            VARCHAR(120) NOT NULL UNIQUE,
        name_zh         VARCHAR(255) NOT NULL,
        name_en         VARCHAR(255) NULL,
        description     TEXT         NOT NULL,
        workspace       VARCHAR(50)  NOT NULL,
        category_kind   VARCHAR(50)  NOT NULL,
        default_mockup  VARCHAR(80)  NULL,
        search_keywords TEXT         NULL,
        status          ENUM('active','coming_soon','archived') NOT NULL DEFAULT 'active',
        is_open_for_methods BOOLEAN  NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_workspace_status (workspace, status),
        KEY idx_category_kind (category_kind)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] task_category: created (or already existed)");

    // Add category_id + methodology_label to task_catalog (idempotent)
    const [tcCols] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_catalog'
         AND COLUMN_NAME IN ('category_id', 'methodology_label')
    `) as any;
    const haveCols = new Set((tcCols as any[]).map((r) => r.COLUMN_NAME));
    if (!haveCols.has("category_id")) {
      await conn.execute(`ALTER TABLE task_catalog ADD COLUMN category_id INT NULL,
                                                   ADD KEY idx_category_id (category_id)`);
      console.log("[migrate] task_catalog.category_id: added");
    } else {
      console.log("[migrate] task_catalog.category_id: already exists, skipped");
    }
    if (!haveCols.has("methodology_label")) {
      await conn.execute(`ALTER TABLE task_catalog ADD COLUMN methodology_label VARCHAR(255) NULL`);
      console.log("[migrate] task_catalog.methodology_label: added");
    } else {
      console.log("[migrate] task_catalog.methodology_label: already exists, skipped");
    }

    // Add output_image_url + cover_image_url to missions (idempotent)
    // output_image_url: written after execution completes (real output screenshot / cover)
    // cover_image_url:  user-customisable cover (future feature)
    const [missionImgCols] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'missions'
         AND COLUMN_NAME IN ('output_image_url', 'cover_image_url')
    `) as any;
    const haveMissionImgCols = new Set((missionImgCols as any[]).map((r: any) => r.COLUMN_NAME));
    if (!haveMissionImgCols.has("output_image_url")) {
      await conn.execute(`ALTER TABLE missions ADD COLUMN output_image_url TEXT NULL COMMENT 'Real output image written after execution'`);
      console.log("[migrate] missions.output_image_url: added");
    } else {
      console.log("[migrate] missions.output_image_url: already exists, skipped");
    }
    if (!haveMissionImgCols.has("cover_image_url")) {
      await conn.execute(`ALTER TABLE missions ADD COLUMN cover_image_url TEXT NULL COMMENT 'User-customisable cover image'`);
      console.log("[migrate] missions.cover_image_url: added");
    } else {
      console.log("[migrate] missions.cover_image_url: already exists, skipped");
    }

    // Add mockup_images JSON array column to squads (idempotent)
    // Stores an ordered list of image URLs shown in the card hover slideshow.
    const [mockupImgCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'squads'
         AND COLUMN_NAME = 'mockup_images'
    `) as any;
    if ((mockupImgCol as any[]).length === 0) {
      await conn.execute(`ALTER TABLE squads ADD COLUMN mockup_images TEXT NULL COMMENT 'JSON array of mockup image URLs for hover slideshow'`);
      console.log("[migrate] squads.mockup_images: added");
    } else {
      console.log("[migrate] squads.mockup_images: already exists, skipped");
    }

    // ── Positioning jobs (Batch 1: background pipeline runner) ──────────
    // Tracks the state of long-running positioning analysis jobs that run
    // in the background after entity creation. Each job is per (entityKind,
    // entityId). Status transitions: pending → running → done | failed.
    // 'currentStep' / 'totalSteps' drive the in-app progress UI.
    // 'retryCount' caps at 5 (exponential backoff: 5s/15s/45s/2m/5m).
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS positioning_jobs (
        id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId       INT          NOT NULL,
        entityKind   VARCHAR(16)  NOT NULL COMMENT 'brand | product | event',
        entityId     INT          NOT NULL,
        status       VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending | running | done | failed',
        currentStep  INT          NOT NULL DEFAULT 0,
        totalSteps   INT          NOT NULL DEFAULT 0,
        retryCount   INT          NOT NULL DEFAULT 0,
        lastError    TEXT         NULL,
        startedAt    DATETIME(3)  NULL,
        finishedAt   DATETIME(3)  NULL,
        createdAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uniq_entity (entityKind, entityId),
        KEY idx_user_status (userId, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] positioning_jobs: OK");

    // ── Usage log (cost tracking per LLM call) ──────────────────────────
    // Every LLM/scout call records token + cost so we can bill or audit.
    // Keyed loosely by entityKind/entityId so we can roll up cost per
    // brand later. NULL entityId = global (e.g. theater scout cache miss).
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS usage_log (
        id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId       INT          NOT NULL,
        entityKind   VARCHAR(16)  NULL,
        entityId     INT          NULL,
        kind         VARCHAR(32)  NOT NULL COMMENT 'positioning_step | interim_pulse | theater_caption | scout | ...',
        model        VARCHAR(64)  NOT NULL,
        inputTokens  INT          NOT NULL DEFAULT 0,
        outputTokens INT          NOT NULL DEFAULT 0,
        costUsd      DECIMAL(10,6) NOT NULL DEFAULT 0.000000,
        ts           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_user_ts (userId, ts),
        KEY idx_entity (entityKind, entityId, ts)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] usage_log: OK");

    // ── brand_knowledge_items (NotebookLM-style knowledge tile) ─────────
    // CJ direction (2026-05-07): user uploads their own successful posts /
    // reference texts; injected into Theater + 30s/60s/100s as additional
    // context. Cap: 50 items × 8K chars = ~400K chars total per brand.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_knowledge_items (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        userId     INT NOT NULL,
        brandId    INT NOT NULL,
        kind       VARCHAR(32) NOT NULL DEFAULT 'reference',
        title      VARCHAR(255) NOT NULL,
        body       MEDIUMTEXT NULL,
        sourceUrl  VARCHAR(1024) NULL,
        tags       JSON NULL,
        createdAt  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY idx_brand (brandId, userId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_knowledge_items: OK");

    // ── 2026-05-08 (P1-3): UNIQUE index on users.email ──────────────────
    // Race-safe register — concurrent POST /api/auth/register with the
    // same email should produce ONE user, not two. The check-then-insert
    // pattern in authRouter is racy without a DB-level uniqueness guard.
    // We also add `lastVerificationSentAt` for resend-verification rate
    // limiting (was P0-B promised but never migrated).
    try {
      const [hasUniqIdx]: any = await conn.execute(`
        SELECT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
           AND INDEX_NAME = 'uniq_users_email'
      `);
      if ((hasUniqIdx as any[]).length === 0) {
        // Some legacy rows may have NULL email (oauth without email scope) —
        // MySQL UNIQUE allows multiple NULLs so this is safe.
        try {
          await conn.execute(`ALTER TABLE users ADD UNIQUE INDEX uniq_users_email (email)`);
          console.log("[migrate] users.email UNIQUE: added");
        } catch (err: any) {
          // Likely duplicate emails exist — log and skip (don't fail boot)
          console.warn("[migrate] users.email UNIQUE: skipped — duplicates exist; clean before re-running.", err?.message);
        }
      } else {
        console.log("[migrate] users.email UNIQUE: already exists, skipped");
      }
    } catch (e: any) {
      console.warn("[migrate] users.email UNIQUE: skipped:", e?.message);
    }

    const [vsCol]: any = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'lastVerificationSentAt'
    `);
    if ((vsCol as any[]).length === 0) {
      await conn.execute(`ALTER TABLE users ADD COLUMN lastVerificationSentAt DATETIME(3) NULL`);
      console.log("[migrate] users.lastVerificationSentAt: added");
    } else {
      console.log("[migrate] users.lastVerificationSentAt: already exists, skipped");
    }

    // ── Brand tab locks (定位 / 文字 / 視覺 lock state) ─────────────────
    // Stores per-brand lock state for the 3 brand workspace tabs. When a
    // tab is locked, the editor is read-only and the platform treats that
    // tab's content as the single source of truth. Format:
    //   { positioning: {at: ISO, by: userId} | null, copy: ..., visual: ... }
    const [tlCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brands'
         AND COLUMN_NAME = 'tabLocks'
    `) as any;
    if ((tlCol as any[]).length === 0) {
      await conn.execute(`ALTER TABLE brands ADD COLUMN tabLocks TEXT NULL COMMENT 'JSON: per-tab lock state'`);
      console.log("[migrate] brands.tabLocks: added");
    } else {
      console.log("[migrate] brands.tabLocks: already exists, skipped");
    }

    // ── Theater brand_caption_rules (Phase 3a) ──────────────────────────
    // User-defined caption rules per brand. Injected into Theater
    // generateCell prompt as additional rules. Scope determines lifetime:
    //   "brand"  — apply to all future runs for this brand (persistent)
    //   "run"    — apply to current run only (frontend handles transient)
    //   "post"   — apply to a single cell (frontend handles per-cell redo)
    // Only "brand" scope is persisted in this table; the others live in
    // memory on the client.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_caption_rules (
        id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId     INT          NOT NULL,
        userId      INT          NOT NULL,
        rule        TEXT         NOT NULL,
        scope       VARCHAR(16)  NOT NULL DEFAULT 'brand',
        active      TINYINT(1)   NOT NULL DEFAULT 1,
        createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_brand_rules_brandId (brandId),
        INDEX idx_brand_rules_active (brandId, active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_caption_rules: OK");

    // ─── 2026-05-10 (CJ「明天串金流」): subscription columns ─────
    const ensureCol = async (table: string, col: string, def: string) => {
      const [rows]: any = await conn.execute(
        `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, col],
      );
      if (Number(rows[0]?.n ?? 0) === 0) {
        await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`[migrate] ${table}.${col} added`);
      }
    };
    await ensureCol("users", "planCode",   "VARCHAR(32) NOT NULL DEFAULT 'trial'");
    await ensureCol("users", "planStatus", "VARCHAR(16) NOT NULL DEFAULT 'trial'");
    await ensureCol("users", "planEndsAt", "DATETIME(3) NULL");
    await conn.execute(`
      UPDATE users
      SET planEndsAt = DATE_ADD(createdAt, INTERVAL 7 DAY)
      WHERE planEndsAt IS NULL
    `);
    console.log("[migrate] users.planEndsAt backfilled (7 days from createdAt)");

    // invoices stub (綠界/ezPay 明天接)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId          INT          NOT NULL,
        invoiceNumber   VARCHAR(32)  NULL,
        amountTwd       INT          NOT NULL,
        status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
        provider        VARCHAR(16)  NULL,
        providerRef     VARCHAR(128) NULL,
        taxId           VARCHAR(16)  NULL,
        companyName     VARCHAR(128) NULL,
        downloadUrl     VARCHAR(512) NULL,
        issuedAt        DATETIME(3)  NULL,
        createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_invoices_userId (userId),
        INDEX idx_invoices_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] invoices: OK");

    // error_log (Sentry-lite for prod anomalies)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS error_log (
        id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        level       VARCHAR(8)   NOT NULL DEFAULT 'error',
        source      VARCHAR(64)  NOT NULL,
        userId      INT          NULL,
        message     VARCHAR(500) NOT NULL,
        stack       TEXT         NULL,
        meta        JSON         NULL,
        createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_error_source_time (source, createdAt),
        INDEX idx_error_user (userId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] error_log: OK");

    // ─── 2026-05-10 (CJ「成就系統」): user_achievements ─────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_achievements (
        userId       INT          NOT NULL,
        code         VARCHAR(64)  NOT NULL,
        unlockedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (userId, code),
        INDEX idx_user_ach_user (userId, unlockedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] user_achievements: OK");

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
