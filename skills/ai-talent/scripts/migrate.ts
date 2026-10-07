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
    // 2026-07-05 (security): no hardcoded password fallback — require env.
    password: (() => {
      const p = process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD;
      if (!p) throw new Error("LOCAL_DB_PASSWORD (or DB_PASSWORD) must be set");
      return p;
    })(),
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
    // 2026-05-13 (CJ「我要怎麼確保品牌定位會成功」): kind was VARCHAR(32)
    // but `positioning_step:<longStepId>` (e.g. valueProposition,
    // messagingPillars) overflows. Widening to 64 — non-breaking ALTER.
    try {
      await conn.execute(`ALTER TABLE usage_log MODIFY COLUMN kind VARCHAR(64) NOT NULL`);
    } catch { /* idempotent: ignore if already widened */ }
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

    // ── support tables (Mia · 客戶成功 — 2026-05-13) ────────────────────
    // Three-table model:
    //   support_conversations : one chat thread per user × brand
    //   support_messages      : every message (user / mia / admin)
    //   support_tickets       : when user clicks "找真人", a ticket is
    //                           opened linking back to the conversation
    //                           with auto-captured context snapshot.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS support_conversations (
        id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId      INT          NOT NULL,
        brandId     INT          NULL,
        status      VARCHAR(16)  NOT NULL DEFAULT 'open',  -- open|closed
        createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY idx_user (userId, updatedAt),
        KEY idx_brand (brandId, updatedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        conversationId  INT          NOT NULL,
        role            VARCHAR(16)  NOT NULL,            -- 'user' | 'mia' | 'admin'
        content         MEDIUMTEXT   NOT NULL,
        contextSnapshot JSON         NULL,                -- session ctx at this message
        createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_conv (conversationId, createdAt),
        CONSTRAINT fk_msg_conv FOREIGN KEY (conversationId)
          REFERENCES support_conversations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        conversationId  INT          NOT NULL,
        userId          INT          NOT NULL,
        userEmail       VARCHAR(255) NULL,
        status          VARCHAR(16)  NOT NULL DEFAULT 'open',  -- open|in_progress|resolved
        tag             VARCHAR(32)  NULL,                     -- bug|feature|how-to|billing
        priority        VARCHAR(16)  NOT NULL DEFAULT 'normal', -- low|normal|high
        subject         VARCHAR(255) NULL,
        autoContext     JSON         NULL,
        assignedTo      VARCHAR(64)  NULL,
        adminNotes      TEXT         NULL,
        createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY idx_status (status, updatedAt),
        KEY idx_user (userId, createdAt),
        KEY idx_tag (tag, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] support_* (conversations/messages/tickets): OK");

    // ── strategist chat tables (策略總監對話 — 2026-09-23) ──────────────
    // CJ「要怎麼設計，可以讓策略總監可以提供用戶，用對話的方式，問策略總監
    // 有關於策略的問題？然後，策略總監也可以引導進行策略監測和健檢？」
    // Same two-table shape as support_conversations/support_messages
    // (mirrored deliberately — see strategistChatRouter.ts's header comment
    // for why this is a dedicated table pair instead of a positioning._xxx
    // JSON field: conversations are unbounded/append-only over the brand's
    // whole lifetime, unlike the small bounded structures — _workbench,
    // _customSegments — that live inside positioning JSON).
    // No tickets/escalation table — that's Mia's job, not the strategist's.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS strategist_conversations (
        id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId      INT          NOT NULL,
        brandId     INT          NOT NULL,
        status      VARCHAR(16)  NOT NULL DEFAULT 'open',  -- open|closed
        createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY idx_user_brand (userId, brandId, updatedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS strategist_messages (
        id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        conversationId  INT          NOT NULL,
        role            VARCHAR(16)  NOT NULL,            -- 'user' | 'strategist'
        content         MEDIUMTEXT   NOT NULL,
        contextSnapshot JSON         NULL,                -- actions offered on this message
        createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_conv (conversationId, createdAt),
        CONSTRAINT fk_strategist_msg_conv FOREIGN KEY (conversationId)
          REFERENCES strategist_conversations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] strategist_* (conversations/messages): OK");

    // ── strategist_conversations.agentId（2026-09-23 第三輪）────────────
    // CJ「品牌策略總監的三個人選」＋「每位一串獨立對話」：換一位總監＝換
    // 一串對話，各自記各自的歷史。所以對話串要記住是哪一位 mos_db agent
    // 在談——不是只記在訊息上，因為 ensureOpenConversation 是用 (userId,
    // brandId) 找現有對話，沒有 agentId 的話三位總監會共用同一串。
    // agentSlug 一起存是為了「mos_db 的 id 被換掉時還看得出原本是誰」，
    // 只是紀錄用，查詢一律用 agentId。
    {
      const wantsCol = async (col: string) => {
        const [r]: any = await conn.execute(
          `SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'strategist_conversations'
              AND COLUMN_NAME = ? LIMIT 1`, [col],
        );
        return (r as any[]).length === 0;
      };
      if (await wantsCol("agentId")) {
        await conn.execute(`ALTER TABLE strategist_conversations ADD COLUMN agentId INT NULL`);
        await conn.execute(
          `CREATE INDEX idx_strategist_conv_agent ON strategist_conversations(userId, brandId, agentId)`,
        );
        console.log("[migrate] strategist_conversations.agentId: added");
      } else {
        console.log("[migrate] strategist_conversations.agentId: already exists, skipped");
      }
      if (await wantsCol("agentSlug")) {
        await conn.execute(`ALTER TABLE strategist_conversations ADD COLUMN agentSlug VARCHAR(191) NULL`);
        console.log("[migrate] strategist_conversations.agentSlug: added");
      } else {
        console.log("[migrate] strategist_conversations.agentSlug: already exists, skipped");
      }
    }

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

    // 2026-05-14 (CJ「點數系統」): pointsBalance + auto-refill timestamp on users.
    for (const [col, def] of [
      ["pointsBalance",           "INT NOT NULL DEFAULT 0"],
      ["pointsLastResetAt",       "DATETIME(3) NULL"],
    ] as const) {
      const [rows] = await conn.execute(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?
      `, [col]) as any;
      if ((rows as any[]).length === 0) {
        await conn.execute(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
        console.log(`[migrate] users.${col}: added`);
      } else {
        console.log(`[migrate] users.${col}: already exists, skipped`);
      }
    }
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS point_transactions (
        id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId        INT          NOT NULL,
        kind          VARCHAR(24)  NOT NULL COMMENT 'deduct | refill | topup | grant | refund',
        delta         INT          NOT NULL COMMENT 'positive=credit, negative=deduct',
        balanceAfter  INT          NOT NULL,
        reason        VARCHAR(64)  NOT NULL COMMENT 'task_30s | monthly_refill | topup:1000pts',
        entityKind    VARCHAR(24)  NULL,
        entityId      INT          NULL,
        createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_user_ts (userId, createdAt),
        KEY idx_kind (kind)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] point_transactions: OK");

    // 2026-05-12 (CJ「老用戶永遠保 900，新用戶才漲 1500」): early-bird flag
    // on users — set at register time based on ONBRAND_PROMO_ACTIVE env.
    for (const [col, def] of [
      ["earlyBird",               "TINYINT(1) NOT NULL DEFAULT 0"],
      ["lockedPriceTwdMonthly",   "INT NULL"],
      // 2026-05-14 (CJ「TWD + USD 雙幣」): ISO-3166-1 alpha-2 country.
      // 'TW' → TWD billing, anything else → USD billing.
      ["billingCountry",          "VARCHAR(2) NOT NULL DEFAULT 'TW'"],
    ] as const) {
      const [rows] = await conn.execute(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?
      `, [col]) as any;
      if ((rows as any[]).length === 0) {
        await conn.execute(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
        console.log(`[migrate] users.${col}: added`);
      } else {
        console.log(`[migrate] users.${col}: already exists, skipped`);
      }
    }

    // 2026-05-12 (CJ「視覺還在開發，請開發完成」): brand visual identity columns.
    // primaryColor / secondaryColor / accentColor — HEX strings (#RRGGBB)
    // fontFamily — CSS font-family hint
    // visualGuidelines — free text, fed to image-gen prompts as brandContext.
    for (const [col, def] of [
      ["primaryColor",     "VARCHAR(16) NULL"],
      ["secondaryColor",   "VARCHAR(16) NULL"],
      ["accentColor",      "VARCHAR(16) NULL"],
      ["fontFamily",       "VARCHAR(64) NULL"],
      ["visualGuidelines", "TEXT NULL"],
    ] as const) {
      const [rows] = await conn.execute(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brands' AND COLUMN_NAME = ?
      `, [col]) as any;
      if ((rows as any[]).length === 0) {
        await conn.execute(`ALTER TABLE brands ADD COLUMN ${col} ${def}`);
        console.log(`[migrate] brands.${col}: added`);
      } else {
        console.log(`[migrate] brands.${col}: already exists, skipped`);
      }
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
    // 2026-10: 1 = 已按取消訂閱、當期到期前仍可用（planStatus 仍是 active）。
    await ensureCol("users", "cancelAtPeriodEnd", "TINYINT NOT NULL DEFAULT 0");
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

    // 2026-05-11 — ECPay extensions to invoices.
    await ensureCol("invoices", "workspaceId",     "INT NULL");
    await ensureCol("invoices", "merchantTradeNo", "VARCHAR(255) NULL");
    // 2026-05-21: VARCHAR(32) is too small for Stripe session IDs (~80 chars)
    // and for pending_${timestamp}_${userId} temp values. Widen to 255.
    try {
      await conn.execute(
        `ALTER TABLE invoices MODIFY COLUMN merchantTradeNo VARCHAR(255) NULL`,
      );
    } catch (e) {
      /* already wide enough or column absent — ok */
    }
    await ensureCol("invoices", "planCode",        "VARCHAR(24) NULL");
    await ensureCol("invoices", "billingCycle",    "VARCHAR(12) NULL");
    await ensureCol("invoices", "amount",          "INT NULL");
    await ensureCol("invoices", "paidAt",          "DATETIME(3) NULL");
    await ensureCol("invoices", "rawPayload",      "JSON NULL");
    try {
      await conn.execute(`CREATE UNIQUE INDEX idx_invoices_trade ON invoices (merchantTradeNo)`);
    } catch (e: any) {
      if (!String(e?.message ?? "").includes("Duplicate")) throw e;
    }
    console.log("[migrate] invoices ECPay columns: OK");

    // 2026-05-14 (CJ「加值點數方案」): top-up pack columns. packType
    // distinguishes 'subscription' (plan upgrade) vs 'topup' (point pack)
    // so the ECPay callback knows whether to extend planEndsAt or to
    // credit pointsBalance via pointsService.addPoints().
    await ensureCol("invoices", "packType",      "VARCHAR(16) NULL COMMENT 'subscription | topup'");
    await ensureCol("invoices", "pointsGranted", "INT NULL COMMENT 'how many points to credit on successful payment'");
    // 2026-05-14 (CJ「TWD + USD 雙幣」): record what currency the invoice was paid in.
    await ensureCol("invoices", "currency",      "VARCHAR(3) NOT NULL DEFAULT 'TWD' COMMENT 'TWD | USD'");

    // 2026-05-14 (CJ「先回 caption + brief、image 跟 QA 變 async polling」):
    // Async orchestra stages. After captions+briefs return, mission_outputs
    // row is created with progress='caption_ready' so the user can hit /run
    // and edit the captions while image gen + QA + extras finish in the
    // background. RunPage polls until progress='done' (or 'failed').
    //
    // States:
    //   caption_ready — captions + briefs persisted, image/QA still running
    //   done          — image gen, extras, QA all complete and persisted
    //   failed        — background continuation threw, see progressDetail
    //
    // Default 'done' for back-compat so existing rows (synchronously written
    // before this column existed) don't appear "stuck in progress".
    await ensureCol("mission_outputs", "progress",       "VARCHAR(20) NOT NULL DEFAULT 'done' COMMENT 'caption_ready | done | failed'");
    await ensureCol("mission_outputs", "progressDetail", "TEXT NULL COMMENT 'error msg if failed, or stage notes'");
    // Index so the cleanup-stale-orphans cron can scan efficiently.
    try {
      await conn.execute(`CREATE INDEX idx_mo_progress_updated ON mission_outputs (progress, updatedAt)`);
      console.log("[migrate] mission_outputs progress index: created");
    } catch (e: any) {
      if (!String(e?.message ?? "").includes("Duplicate")) throw e;
    }

    // 2026-05-14 (CJ「美金為準，每天匯率動」): FX snapshot table.
    // server/_core/fx.ts writes one row per successful provider fetch.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS fx_rates (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        pair      VARCHAR(16)  NOT NULL COMMENT 'e.g. USD_TWD',
        rate      DECIMAL(10,4) NOT NULL,
        fetchedAt DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_pair_fetched (pair, fetchedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[migrate] fx_rates: ensured");
    console.log("[migrate] invoices topup columns: OK");

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

    // 2026-05-11 — Sentry-lite extensions: track which route fired the
    // error, allow admins to mark items as resolved (so the dashboard
    // surfaces only unhandled cases), and a fingerprint column so we
    // can roll up duplicates by source+message hash. ensureCol is
    // idempotent — re-running migrate is safe.
    await ensureCol("error_log", "route",       "VARCHAR(160) NULL AFTER source");
    await ensureCol("error_log", "fingerprint", "VARCHAR(64)  NULL AFTER stack");
    await ensureCol("error_log", "resolvedAt",  "DATETIME(3)  NULL");
    await ensureCol("error_log", "resolvedBy",  "INT          NULL");
    // Index unresolved-first for the admin dashboard query path.
    try {
      await conn.execute(`CREATE INDEX idx_error_unresolved ON error_log (resolvedAt, createdAt)`);
    } catch (e: any) {
      // 1061 = Duplicate key name (index already exists) — ignore.
      if (!String(e?.message ?? "").includes("Duplicate")) throw e;
    }
    try {
      await conn.execute(`CREATE INDEX idx_error_fingerprint ON error_log (fingerprint, createdAt)`);
    } catch (e: any) {
      if (!String(e?.message ?? "").includes("Duplicate")) throw e;
    }
    console.log("[migrate] error_log extensions (route / fingerprint / resolvedAt): OK");

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

    // ─── 2026-05-10 (CJ「成就獎勵系統」): rewards infrastructure ─────
    // users.quotaBonus  — JSON {image_gen:30, video_gen:2, brands:1, trial_extend_days:3}
    //                      added to baseline plan quota when checking limits
    // users.featureFlags — JSON {schedule_reminder_beta:true, brand_style_export:true,
    //                            founding_member:true, early_access:true}
    await ensureCol("users", "quotaBonus",   "JSON NULL");
    await ensureCol("users", "featureFlags", "JSON NULL");

    // user_route_rewards — track which routes have been granted to avoid double-grant
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_route_rewards (
        userId       INT          NOT NULL,
        route        VARCHAR(32)  NOT NULL,
        rewardJson   JSON         NULL,        -- snapshot of what was granted
        grantedAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (userId, route),
        INDEX idx_urr_user (userId, grantedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] user_route_rewards: OK");

    // promo_codes — discount tokens issued by achievement system or marketing
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        code            VARCHAR(32)  NOT NULL UNIQUE,
        userId          INT          NULL,            -- NULL = available to anyone, else owner
        kind            VARCHAR(32)  NOT NULL,        -- first_month_pct | annual_pct
        discountPct     INT          NOT NULL,        -- 10 = 10% off
        source          VARCHAR(32)  NOT NULL,        -- achievement_route_upgrade | achievement_finale | manual
        expiresAt       DATETIME(3)  NULL,
        usedAt          DATETIME(3)  NULL,
        invoiceId       INT          NULL,
        createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_promo_user (userId),
        INDEX idx_promo_used (usedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] promo_codes: OK");

    // ─── 2026-05-11 (CJ「Spotify 模式，大家貢獻範本」): community template
    // marketplace. Users publish successful outputs as reusable templates;
    // other users discover + use them; contributor earns credits when used.
    //
    // community_templates — the catalog
    //   sourceOutputId    NULLABLE — link back to the original mission_output
    //                                 it came from (for attribution / preview)
    //   content           JSON — the actual reusable structure (caption template,
    //                            agent prompt, brand-context-agnostic
    //                            scaffolding). Shape varies by `kind`.
    //   kind = "caption"  — single-post caption pattern
    //        | "campaign" — multi-post / multi-platform pattern (99s outputs)
    //        | "positioning" — a SoWork brand positioning answer set
    //        | "prompt"  — a tweaked agent system prompt
    //   tier              — 30s / 60s / 99s (matches the task tier that
    //                       can use this template)
    //   visibility = "public" (in gallery) | "unlisted" (link-only) | "private"
    //   featured          — admin curation: bumped to top of gallery
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS community_templates (
        id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        authorUserId    INT          NOT NULL,
        sourceOutputId  BIGINT       NULL,
        title           VARCHAR(160) NOT NULL,
        description     TEXT         NULL,
        kind            VARCHAR(24)  NOT NULL,
        tier            VARCHAR(8)   NULL,         -- 30s / 60s / 99s / NULL
        platform        VARCHAR(24)  NULL,         -- facebook / instagram / ...
        taskId          VARCHAR(64)  NULL,         -- which task this template plugs into
        tags            JSON         NULL,         -- ["親子", "節慶", ...]
        content         JSON         NOT NULL,     -- the reusable body
        previewText     VARCHAR(500) NULL,         -- short blurb for gallery cards
        previewImageUrl VARCHAR(500) NULL,
        visibility      VARCHAR(12)  NOT NULL DEFAULT 'public',
        featured        TINYINT(1)   NOT NULL DEFAULT 0,
        useCount        INT          NOT NULL DEFAULT 0,
        likeCount       INT          NOT NULL DEFAULT 0,
        creditsEarned   INT          NOT NULL DEFAULT 0,
        status          VARCHAR(16)  NOT NULL DEFAULT 'active', -- active / hidden / removed
        createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_ct_author (authorUserId, createdAt),
        INDEX idx_ct_visibility (visibility, status, useCount),
        INDEX idx_ct_kind_tier (kind, tier, useCount),
        INDEX idx_ct_featured (featured, useCount)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] community_templates: OK");

    // community_template_likes — one row per (template, user) who 👍'd
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS community_template_likes (
        templateId   INT          NOT NULL,
        userId       INT          NOT NULL,
        likedAt      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (templateId, userId),
        INDEX idx_ctl_user (userId, likedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] community_template_likes: OK");

    // community_template_uses — every time someone uses a template,
    // record it for analytics + credit-reward calculation. resultOutputId
    // links to the mission_output produced from this template.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS community_template_uses (
        id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        templateId     INT          NOT NULL,
        userId         INT          NOT NULL,
        resultOutputId BIGINT       NULL,
        creditsAwarded INT          NOT NULL DEFAULT 0,
        usedAt         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_ctu_template (templateId, usedAt),
        INDEX idx_ctu_user (userId, usedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] community_template_uses: OK");

    // ─── 2026-05-11 (CJ「你要考慮採用 mos_db 裡面的 squad 嗎？」): ─────────
    // squads is the canonical store per the team memory rule. Extend it
    // with the social-marketplace columns so user-contributed squads can
    // sit in the same /community gallery as lightweight caption templates.
    // - visibility: public / unlisted / private  (defaults public for
    //   admin-seeded squads, set by author when user-contributed)
    // - useCount / likeCount / creditsEarned: same semantics as
    //   community_templates, kept on squads.* so social proof rolls up
    //   per the canonical row.
    // - featured: editor-pick flag distinct from is_approved (which is
    //   admin sign-off). featured=1 → bumped to top of gallery.
    await ensureCol("squads", "visibility",     "VARCHAR(12) NOT NULL DEFAULT 'public'");
    await ensureCol("squads", "useCount",       "INT NOT NULL DEFAULT 0");
    await ensureCol("squads", "likeCount",      "INT NOT NULL DEFAULT 0");
    await ensureCol("squads", "creditsEarned",  "INT NOT NULL DEFAULT 0");
    await ensureCol("squads", "featured",       "TINYINT(1) NOT NULL DEFAULT 0");
    try {
      await conn.execute(`CREATE INDEX idx_squads_community ON squads (visibility, is_approved, useCount)`);
    } catch (e: any) {
      if (!String(e?.message ?? "").includes("Duplicate")) throw e;
    }
    console.log("[migrate] squads social columns: OK");

    // squad_likes — shares semantics with community_template_likes.
    // Composite PK so a user can only like a given squad once.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS squad_likes (
        squadId      INT          NOT NULL,
        userId       INT          NOT NULL,
        likedAt      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (squadId, userId),
        INDEX idx_sl_user (userId, likedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] squad_likes: OK");

    // squad_uses — per-execution log feeding creditsEarned + analytics.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS squad_uses (
        id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        squadId         INT          NOT NULL,
        userId          INT          NOT NULL,
        missionId       INT          NULL,
        creditsAwarded  INT          NOT NULL DEFAULT 0,
        usedAt          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_su_squad (squadId, usedAt),
        INDEX idx_su_user (userId, usedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] squad_uses: OK");

    // ─── 2026-05-11 (CJ「四個 P0 都要完成」: foundation for Team/Agency
    // plan + multi-client workspace + ECPay multi-client billing) ─────
    //
    // workspaces — a workspace = an agency / team / solo container.
    //   solo user → auto-created default workspace at first login
    //   team plan → +5 members
    //   agency plan → unlimited members + white label
    //
    // workspace_members — many users in a workspace, each with a role
    //   owner   — billing, invites, full edit
    //   admin   — invites, full edit (no billing)
    //   editor  — edit assigned brands only
    //   viewer  — read-only on assigned brands (great for clients!)
    //
    // brands.workspaceId — multi-tenant scoping. Existing brands get
    // backfilled to the user's default workspace on next login or
    // on the next CREATE/UPDATE pass (handled in brandRouter).
    //
    // workspace_member_brands — for editor/viewer, restricts which
    // brands they can see. owner/admin see all. Empty rows = full access.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        slug            VARCHAR(64)  NOT NULL UNIQUE,
        name            VARCHAR(160) NOT NULL,
        ownerUserId     INT          NOT NULL,
        planCode        VARCHAR(24)  NOT NULL DEFAULT 'solo',
        planStatus      VARCHAR(16)  NOT NULL DEFAULT 'trial',
        planEndsAt      DATETIME(3)  NULL,
        billingMode     VARCHAR(12)  NOT NULL DEFAULT 'solo',
        whiteLabelLogo  VARCHAR(500) NULL,
        whiteLabelName  VARCHAR(160) NULL,
        createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_ws_owner (ownerUserId),
        INDEX idx_ws_plan (planCode, planStatus)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // 2026-05-14 (CJ「Unknown column 'ownerUserId' in 'where clause'」):
    // older workspaces tables predate the multi-tenant rewrite and lack
    // these columns. CREATE TABLE IF NOT EXISTS is a no-op when the
    // table exists, so we ALTER each missing column idempotently.
    const wsCols = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workspaces'`,
    );
    const wsColSet = new Set<string>(((wsCols as any)[0] as any[]).map((r) => r.COLUMN_NAME));
    const wsAlters: Array<[string, string]> = [
      ["slug",            "ADD COLUMN slug VARCHAR(64) NOT NULL DEFAULT '' AFTER id"],
      ["ownerUserId",     "ADD COLUMN ownerUserId INT NOT NULL DEFAULT 0 AFTER name"],
      ["planCode",        "ADD COLUMN planCode VARCHAR(24) NOT NULL DEFAULT 'solo'"],
      ["planStatus",      "ADD COLUMN planStatus VARCHAR(16) NOT NULL DEFAULT 'trial'"],
      ["planEndsAt",      "ADD COLUMN planEndsAt DATETIME(3) NULL"],
      ["billingMode",     "ADD COLUMN billingMode VARCHAR(12) NOT NULL DEFAULT 'solo'"],
      ["whiteLabelLogo",  "ADD COLUMN whiteLabelLogo VARCHAR(500) NULL"],
      ["whiteLabelName",  "ADD COLUMN whiteLabelName VARCHAR(160) NULL"],
    ];
    for (const [col, ddl] of wsAlters) {
      if (!wsColSet.has(col)) {
        try { await conn.execute(`ALTER TABLE workspaces ${ddl}`); }
        catch (e) { console.warn(`[migrate] workspaces ALTER ${col} failed:`, (e as Error).message); }
      }
    }
    // Ensure the idx_ws_owner index exists (for ownerUserId queries).
    try { await conn.execute(`ALTER TABLE workspaces ADD INDEX idx_ws_owner (ownerUserId)`); }
    catch { /* index exists */ }

    // 2026-05-21: prod workspaces may have legacy NOT-NULL-without-DEFAULT
    // columns from an older schema (organizationId, workspaceKey, status …).
    // Any such column blocks the backfill INSERT. Make them nullable so we
    // can insert without specifying them.
    const legacyNullableCols: Array<[string, string]> = [
      ["organizationId", "INT NULL DEFAULT NULL"],
      ["workspaceKey",   "VARCHAR(128) NULL DEFAULT NULL"],
      ["status",         "VARCHAR(32)  NULL DEFAULT NULL"],
    ];
    for (const [col, ddl] of legacyNullableCols) {
      if (wsColSet.has(col)) {
        try {
          await conn.execute(
            `ALTER TABLE workspaces MODIFY COLUMN \`${col}\` ${ddl}`,
          );
          console.log(`[migrate] workspaces: ${col} made nullable (legacy col)`);
        } catch (e) {
          console.warn(`[migrate] workspaces ${col} MODIFY:`, (e as Error).message);
        }
      }
    }

    console.log("[migrate] workspaces: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS workspace_members (
        workspaceId  INT          NOT NULL,
        userId       INT          NOT NULL,
        role         VARCHAR(12)  NOT NULL DEFAULT 'viewer',
        invitedAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        joinedAt     DATETIME(3)  NULL,
        invitedBy    INT          NULL,
        PRIMARY KEY (workspaceId, userId),
        INDEX idx_wm_user (userId),
        INDEX idx_wm_role (workspaceId, role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] workspace_members: OK");
    // 2026-10 團隊共用品牌：editor 的兩個開關（NULL = 依角色預設，見 teamAccess.ts）。
    await ensureCol("workspace_members", "canEditStrategy", "TINYINT NULL");
    await ensureCol("workspace_members", "canPublish", "TINYINT NULL");

    // workspace_member_brands — restricts editor/viewer to specific brands.
    // Empty (no rows for a member) = full access to all workspace brands.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS workspace_member_brands (
        workspaceId  INT          NOT NULL,
        userId       INT          NOT NULL,
        brandId      INT          NOT NULL,
        addedAt      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (workspaceId, userId, brandId),
        INDEX idx_wmb_brand (brandId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] workspace_member_brands: OK");

    // brands.workspaceId — scoping column. Backfill happens in
    // brandRouter via a one-time pass: each user gets a default
    // workspace, all their brands move under it.
    await ensureCol("brands", "workspaceId", "INT NULL AFTER userId");
    try {
      await conn.execute(`CREATE INDEX idx_brands_workspace ON brands (workspaceId)`);
    } catch (e: any) {
      if (!String(e?.message ?? "").includes("Duplicate")) throw e;
    }
    console.log("[migrate] brands.workspaceId: OK");

    // Backfill: every user without a default workspace gets one.
    // Done in a single pass — idempotent because we INSERT IGNORE.
    try {
      // Create default workspace for users who don't own one yet.
      await conn.execute(`
        INSERT INTO workspaces (slug, name, ownerUserId, planCode, planStatus, billingMode)
        SELECT
          CONCAT('ws-', u.id, '-', SUBSTRING(MD5(RAND()), 1, 6)) AS slug,
          COALESCE(u.name, CONCAT('Workspace #', u.id)) AS name,
          u.id AS ownerUserId,
          COALESCE(u.planCode, 'solo') AS planCode,
          COALESCE(u.planStatus, 'trial') AS planStatus,
          'solo' AS billingMode
        FROM users u
        WHERE NOT EXISTS (
          SELECT 1 FROM workspaces w WHERE w.ownerUserId = u.id
        )
      `);
      // Owner becomes a member of their workspace.
      await conn.execute(`
        INSERT IGNORE INTO workspace_members (workspaceId, userId, role, joinedAt)
        SELECT w.id, w.ownerUserId, 'owner', NOW(3)
        FROM workspaces w
        WHERE NOT EXISTS (
          SELECT 1 FROM workspace_members m
          WHERE m.workspaceId = w.id AND m.userId = w.ownerUserId
        )
      `);
      // Brands without workspaceId get pointed to the owner's default workspace.
      await conn.execute(`
        UPDATE brands b
        JOIN workspaces w ON w.ownerUserId = b.userId
        SET b.workspaceId = w.id
        WHERE b.workspaceId IS NULL
      `);
      console.log("[migrate] workspaces backfill: OK");
    } catch (e: any) {
      console.warn("[migrate] workspaces backfill skipped:", e?.message ?? e);
    }

    // ─── 2026-05-11 (P0-1 calendar): scheduled_posts table ──────────
    // A scheduled post = output that will be auto-published at scheduledAt.
    // Status flow: pending → publishing → published | failed | cancelled
    // Cron worker polls every 60s, hits the platform publish endpoint
    // (publishRouter.toFacebook etc.) and updates status.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS scheduled_posts (
        id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId         INT          NOT NULL,
        workspaceId    INT          NULL,
        brandId        INT          NULL,
        outputId       BIGINT       NOT NULL,
        variantIndex   INT          NOT NULL DEFAULT 0,
        contentKind    VARCHAR(16)  NULL,
        contentIndex   INT          NULL,
        planningConfirmed TINYINT(1) NOT NULL DEFAULT 0,
        platform       VARCHAR(24)  NOT NULL,
        scheduledAt    DATETIME(3)  NOT NULL,
        status         VARCHAR(12)  NOT NULL DEFAULT 'pending',
        publishedAt    DATETIME(3)  NULL,
        externalPostId VARCHAR(120) NULL,
        externalUrl    VARCHAR(500) NULL,
        attempts       INT          NOT NULL DEFAULT 0,
        lastError      TEXT         NULL,
        cancelledAt    DATETIME(3)  NULL,
        cancelledBy    INT          NULL,
        createdAt      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_sp_due (status, scheduledAt),
        INDEX idx_sp_user (userId, scheduledAt),
        INDEX idx_sp_workspace (workspaceId, scheduledAt),
        INDEX idx_sp_brand (brandId, scheduledAt),
        INDEX idx_sp_output (outputId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await ensureCol("scheduled_posts", "contentKind", "VARCHAR(16) NULL AFTER variantIndex");
    await ensureCol("scheduled_posts", "contentIndex", "INT NULL AFTER contentKind");
    await ensureCol("scheduled_posts", "planningConfirmed", "TINYINT(1) NOT NULL DEFAULT 0 AFTER contentIndex");
    // PR #56 stored the five IG strategy reports as legacy arrays. Any rows
    // scheduled before selector columns existed are planning content, not a
    // publishable post. Backfill only the exact allowlisted task IDs/slugs.
    await conn.execute(`
      UPDATE scheduled_posts sp
      JOIN mission_outputs o ON o.id = sp.outputId
      LEFT JOIN missions m ON m.id = o.missionId
      SET sp.contentKind = 'planning',
          sp.contentIndex = sp.variantIndex,
          sp.planningConfirmed = 0
      WHERE sp.contentKind IS NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.presentation')) = 'strategy-report'
        AND COALESCE(
          JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')),
          JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.squadSlug')),
          m.squadSlug
        ) IN (
          'ig-99-youtility', 'ig-baer-youtility',
          'ig-99-visual-story', 'ig-chrisdo-visual-story',
          'ig-99-live-first', 'ig-fanzo-live-first',
          'ig-99-document', 'ig-garyvee-document',
          'ig-99-radical-transparency', 'ig-hollis-radical-transparency'
        )
    `);
    console.log("[migrate] scheduled_posts: OK");

    // ─── 2026-05-11 (CJ「節慶日曆 + 自動提醒」): festivals + dismissals ─
    //
    // festivals — calendar of events that drive proactive prompts like
    //   「下週是中秋節，要不要先準備 5 篇？」 Seeded with TW festivals
    //   2026-2028 (solar dates pre-resolved for lunar festivals).
    //
    // Categories:
    //   traditional — 春節 / 中秋 / 端午 / 清明 / 元宵 / 七夕 / 重陽
    //   commercial  — 母親節 / 父親節 / 教師節 / 情人節 / 雙11 / 雙12 / 黑五
    //   civic       — 國慶 / 二二八 / 兒童節 / 勞動節 / 元旦 / 跨年
    //   seasonal    — 24 節氣（立春 / 春分 / 夏至 / 冬至 etc.）
    //   western     — 萬聖節 / 感恩節 / 聖誕節 / 復活節
    //
    // region: TW / CN / HK / global. We index by region so SG/CN users
    // (future) see different sets.
    //
    // priority: 1 (low) → 5 (high, can't ignore). 5 = 春節 / 中秋 / 母親節.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS festivals (
        id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        slug          VARCHAR(64)  NOT NULL,
        date          DATE         NOT NULL,
        name_zh       VARCHAR(64)  NOT NULL,
        name_en       VARCHAR(96)  NOT NULL,
        region        VARCHAR(8)   NOT NULL DEFAULT 'TW',
        category      VARCHAR(16)  NOT NULL,
        priority      TINYINT(1)   NOT NULL DEFAULT 3,
        emoji         VARCHAR(8)   NULL,
        themes        JSON         NULL,        -- ["親子","團圓","禮品"]
        contentHint   TEXT         NULL,        -- short Chinese hint for AI
        createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY idx_festival_slug_year (slug, date),
        INDEX idx_festival_date (date),
        INDEX idx_festival_region_date (region, date),
        INDEX idx_festival_priority (priority, date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] festivals: OK");

    // festival_dismissals — per-user "我這個節慶不要提醒了"
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS festival_dismissals (
        userId        INT          NOT NULL,
        festivalId    INT          NOT NULL,
        dismissedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (userId, festivalId),
        INDEX idx_fd_festival (festivalId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] festival_dismissals: OK");

    // Seed TW festivals 2026-2027. Idempotent via INSERT IGNORE on
    // (slug, date) unique key. Lunar dates pre-resolved to solar.
    const FESTIVALS_SEED: Array<[string, string, string, string, string, number, string, string[], string]> = [
      // [slug, date, name_zh, name_en, category, priority, emoji, themes, contentHint]
      // 2026
      ["new-year-2026",         "2026-01-01", "元旦",       "New Year's Day",         "civic",       4, "🎊", ["新年","年度回顧","展望"],         "新年新希望、品牌年度回顧、新一年目標"],
      ["valentine-2026",        "2026-02-14", "西洋情人節", "Valentine's Day",        "commercial",  4, "💝", ["愛情","禮品","浪漫"],           "情侶禮品、單身溫暖、品牌浪漫敘事"],
      ["spring-festival-2026",  "2026-02-17", "春節",       "Lunar New Year",         "traditional", 5, "🧧", ["團圓","紅包","新春","祝福"],   "春節祝福、紅包設計、團圓飯文化、新春開運"],
      ["lantern-2026",          "2026-03-03", "元宵節",     "Lantern Festival",       "traditional", 3, "🏮", ["燈會","湯圓","團圓"],           "元宵燈會、湯圓食譜、傳統年味"],
      ["women-day-2026",        "2026-03-08", "婦女節",     "Women's Day",            "commercial",  3, "🌸", ["女性力量","賦權","致敬"],       "致敬女性、品牌平權"],
      ["white-valentine-2026",  "2026-03-14", "白色情人節", "White Valentine's Day",  "commercial",  3, "🤍", ["回禮","告白"],                  "情人節回禮、二次告白"],
      ["228-2026",              "2026-02-28", "和平紀念日", "Peace Memorial Day",     "civic",       2, "🕊️", ["紀念","和平"],                 "莊重表態（小心拿捏，可選擇不發）"],
      ["children-day-2026",     "2026-04-04", "兒童節",     "Children's Day",         "civic",       3, "🎈", ["童心","親子","回憶"],           "童年回憶、親子互動、品牌童心一面"],
      ["qingming-2026",         "2026-04-05", "清明節",     "Tomb Sweeping Day",      "traditional", 2, "🕯️", ["追思","家族"],                 "莊重，多數品牌不主動發；殯葬/家居產業可做"],
      ["mother-day-2026",       "2026-05-10", "母親節",     "Mother's Day",           "commercial",  5, "🌷", ["媽媽","感謝","禮品","檔期"], "母親節禮品、媽媽日常、感恩文案、家庭聚餐"],
      ["dragon-boat-2026",      "2026-06-19", "端午節",     "Dragon Boat Festival",   "traditional", 4, "🍙", ["粽子","划龍舟","團圓"],         "粽子設計、端午連假、傳統習俗"],
      ["father-day-2026",       "2026-08-08", "父親節",     "Father's Day",           "commercial",  5, "👨‍👧", ["爸爸","感謝","禮品"],         "父親節禮品、爸爸故事、傳統男性形象翻新"],
      ["qixi-2026",             "2026-08-19", "七夕情人節", "Qixi Festival",          "traditional", 4, "🌌", ["浪漫","東方情人節"],            "中式浪漫、東方情人節、星空意象"],
      ["ghost-month-2026",      "2026-08-13", "中元節",     "Ghost Festival",         "traditional", 2, "🕯️", ["祭祀","民俗"],                 "民俗品牌可做，普羅品牌注意分寸"],
      ["teacher-day-2026",      "2026-09-28", "教師節",     "Teacher's Day",          "commercial",  3, "🎓", ["感謝","學習"],                  "致敬教師、學習致敬"],
      ["mid-autumn-2026",       "2026-09-25", "中秋節",     "Mid-Autumn Festival",    "traditional", 5, "🌕", ["月餅","團圓","烤肉","賞月"], "月餅設計、團圓飯、烤肉檔期、賞月浪漫"],
      ["double-tenth-2026",     "2026-10-10", "國慶日",     "National Day",           "civic",       3, "🇹🇼", ["國家","認同"],                ""],
      ["double-9-2026",         "2026-10-19", "重陽節",     "Double Ninth Festival",  "traditional", 3, "🌼", ["敬老","健康"],                  "敬老檔期、銀髮族訴求"],
      ["halloween-2026",        "2026-10-31", "萬聖節",     "Halloween",              "western",     4, "🎃", ["變裝","派對","糖果"],           "變裝、派對、品牌玩心面、Z 世代"],
      ["double-11-2026",        "2026-11-11", "雙11購物節", "Double 11",              "commercial",  5, "🛍️", ["購物","促銷","限時"],          "電商促銷主檔期"],
      ["thanksgiving-2026",     "2026-11-26", "感恩節",     "Thanksgiving",           "western",     3, "🦃", ["感謝","團聚"],                  "B2B 客戶感謝、家族聚餐"],
      ["double-12-2026",        "2026-12-12", "雙12購物節", "Double 12",              "commercial",  4, "🎁", ["購物","年末"],                  "年末促銷、補刀檔期"],
      ["christmas-2026",        "2026-12-25", "聖誕節",     "Christmas",              "western",     5, "🎄", ["禮物","派對","聖誕","團圓"], "禮物清單、聖誕派對、年末感謝"],
      ["new-year-eve-2026",     "2026-12-31", "跨年夜",     "New Year's Eve",         "commercial",  4, "🎆", ["跨年","派對","煙火"],           "跨年派對、煙火、年度收尾"],
      // 2027 重要節慶
      ["new-year-2027",         "2027-01-01", "元旦",       "New Year's Day",         "civic",       4, "🎊", ["新年"],                         "新年新希望"],
      ["spring-festival-2027",  "2027-02-06", "春節",       "Lunar New Year",         "traditional", 5, "🧧", ["團圓","紅包"],                 "春節祝福、紅包文化"],
      ["mother-day-2027",       "2027-05-09", "母親節",     "Mother's Day",           "commercial",  5, "🌷", ["媽媽","感謝"],                  "母親節主檔期"],
      ["father-day-2027",       "2027-08-08", "父親節",     "Father's Day",           "commercial",  5, "👨‍👧", ["爸爸"],                       "父親節主檔期"],
      ["mid-autumn-2027",       "2027-09-15", "中秋節",     "Mid-Autumn Festival",    "traditional", 5, "🌕", ["月餅","團圓","烤肉"],           "中秋主檔期"],
      ["christmas-2027",        "2027-12-25", "聖誕節",     "Christmas",              "western",     5, "🎄", ["禮物","聖誕"],                  "聖誕主檔期"],
    ];
    try {
      for (const [slug, date, nameZh, nameEn, cat, prio, emoji, themes, hint] of FESTIVALS_SEED) {
        await conn.execute(
          `INSERT IGNORE INTO festivals (slug, date, name_zh, name_en, region, category, priority, emoji, themes, contentHint)
           VALUES (?, ?, ?, ?, 'TW', ?, ?, ?, ?, ?)`,
          [slug, date, nameZh, nameEn, cat, prio, emoji, JSON.stringify(themes), hint],
        );
      }
      console.log(`[migrate] festivals seed: ${FESTIVALS_SEED.length} TW entries`);
    } catch (e: any) {
      console.warn("[migrate] festivals seed skipped:", e?.message ?? e);
    }

    // ─── 2026-05-11 (CJ「多用戶 SaaS, 每用戶連自己 FB」): per-brand FB binding ───
    // brand.fbPageId: 該品牌綁定的 Facebook 粉專 ID (numeric)
    // brand.fbPageName: 顯示用名稱
    // brand.fbConnectedAt: OAuth 連接時間, NULL = 尚未連接
    await ensureCol("brands", "fbPageId",     "VARCHAR(64) NULL");
    await ensureCol("brands", "fbPageName",   "VARCHAR(128) NULL");
    await ensureCol("brands", "fbConnectedAt", "DATETIME(3) NULL");
    console.log("[migrate] brands FB binding columns: OK");

    // ─── 2026-05-15 (P1): failed_stripe_events for webhook audit/replay ───
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS failed_stripe_events (
        id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        eventId      VARCHAR(64)  NULL,
        sessionId    VARCHAR(128) NULL,
        eventType    VARCHAR(64)  NULL,
        reason       VARCHAR(200) NOT NULL,
        rawPayload   MEDIUMTEXT   NULL,
        userId       INT          NULL,
        createdAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        resolvedAt   DATETIME(3)  NULL,
        INDEX idx_fse_unresolved (resolvedAt, createdAt),
        INDEX idx_fse_session (sessionId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] failed_stripe_events: OK");

    // ─── 2026-05-15 (P1): oauth_failures for OAuth callback audit ───
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS oauth_failures (
        id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        provider     VARCHAR(32)  NOT NULL,
        userId       INT          NULL,
        reason       VARCHAR(200) NOT NULL,
        meta         JSON         NULL,
        createdAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_oauth_provider (provider, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] oauth_failures: OK");

    // ─── 2026-05-14 (CJ「我要確保任務會被移到任務卡片」): mission_outputs utf8mb4 ───
    // The original mission_outputs.content + title + metadata columns may
    // have been created as utf8 (3-byte). 4-byte chars (emoji, some CJK
    // supplementary plane glyphs) trip ER_INCORRECT_STRING_VALUE → INSERT
    // fails → task vanishes from /projects. Force the whole table to
    // utf8mb4 so that's no longer a failure mode.
    try {
      await conn.query(`ALTER TABLE mission_outputs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log("[migrate] mission_outputs → utf8mb4: OK");
    } catch (e: any) {
      console.warn("[migrate] mission_outputs CONVERT TO utf8mb4 skipped:", e?.message ?? e);
    }
    try {
      await conn.query(`ALTER TABLE missions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log("[migrate] missions → utf8mb4: OK");
    } catch (e: any) {
      console.warn("[migrate] missions CONVERT TO utf8mb4 skipped:", e?.message ?? e);
    }

    // 2026-05-16 (CJ「用戶 report bug → 自動除錯 → 送點數 → 通知」):
    // bug_reports drives report→triage→fix→reward→notify.
    // status: reported → triaged → (confirmed_bug | not_a_bug)
    //         confirmed_bug → dispatched → fix_proposed → resolved
    await conn.query(`
      CREATE TABLE IF NOT EXISTS bug_reports (
        id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId          INT          NOT NULL,
        userEmail       VARCHAR(320) NULL,
        conversationId  INT          NULL,
        title           VARCHAR(200) NOT NULL,
        body            TEXT         NOT NULL,
        pageUrl         VARCHAR(512) NULL,
        status          VARCHAR(20)  NOT NULL DEFAULT 'reported',
        triageVerdict   VARCHAR(20)  NULL,
        triageReason    TEXT         NULL,
        triageModel     VARCHAR(64)  NULL,
        bountyPoints    INT          NOT NULL DEFAULT 0,
        dispatchRef     VARCHAR(256) NULL,
        adminNotes      TEXT         NULL,
        resolvedAt      DATETIME(3)  NULL,
        createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY idx_status (status, createdAt),
        KEY idx_user (userId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] bug_reports: OK");

    // Private raw strategy artifacts. There is deliberately no public API for
    // this table: mission_outputs contains sanitized planning DTOs and final
    // publishable IG DTOs, never these raw rows.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS strategy_internal_step_artifacts (
        id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        runId         CHAR(36)     NOT NULL,
        userId        INT          NOT NULL,
        brandId       INT          NULL,
        missionId     INT          NOT NULL,
        outputId      INT          NOT NULL,
        taskId        VARCHAR(64)  NOT NULL,
        squadSlug     VARCHAR(96)  NOT NULL,
        stepOrder     INT          NOT NULL,
        status        ENUM('done','failed') NOT NULL,
        internalLabel VARCHAR(255) NOT NULL,
        outputType    VARCHAR(128) NULL,
        outputKind    VARCHAR(128) NULL,
        agentId       INT          NULL,
        agentName     VARCHAR(255) NULL,
        rawContent    LONGTEXT     NOT NULL,
        errorCode     VARCHAR(64)  NULL,
        latencyMs     INT          NOT NULL DEFAULT 0,
        expiresAt     DATETIME(3)  NOT NULL,
        createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_strategy_artifact_run_step (runId, stepOrder),
        KEY idx_strategy_artifact_mission (missionId),
        KEY idx_strategy_artifact_output (outputId, stepOrder),
        KEY idx_strategy_artifact_user_created (userId, createdAt),
        KEY idx_strategy_artifact_expiry (expiresAt),
        CONSTRAINT fk_strategy_artifact_mission
          FOREIGN KEY (missionId) REFERENCES missions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [strategyArtifactFkRows] = await conn.execute(`
      SELECT kcu.CONSTRAINT_NAME, rc.DELETE_RULE
      FROM information_schema.KEY_COLUMN_USAGE kcu
      JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
        ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
       AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       AND rc.TABLE_NAME = kcu.TABLE_NAME
      WHERE kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = 'strategy_internal_step_artifacts'
        AND kcu.COLUMN_NAME = 'missionId'
        AND kcu.REFERENCED_TABLE_NAME = 'missions'
    `) as any;
    if ((strategyArtifactFkRows as any[]).length === 0) {
      const [orphanRows] = await conn.execute(`
        SELECT COUNT(*) AS orphanCount
        FROM strategy_internal_step_artifacts a
        LEFT JOIN missions m ON m.id = a.missionId
        WHERE m.id IS NULL
      `) as any;
      const orphanCount = Number((orphanRows as any[])[0]?.orphanCount ?? 0);
      if (orphanCount > 0) {
        throw new Error(
          `strategy_internal_step_artifacts has ${orphanCount} orphan row(s); refusing to add cascade constraint`,
        );
      }
      await conn.execute(`
        ALTER TABLE strategy_internal_step_artifacts
          ADD CONSTRAINT fk_strategy_artifact_mission
          FOREIGN KEY (missionId) REFERENCES missions(id) ON DELETE CASCADE
      `);
    } else if ((strategyArtifactFkRows as any[]).some((row) => row.DELETE_RULE !== "CASCADE")) {
      throw new Error("strategy_internal_step_artifacts mission foreign key must use ON DELETE CASCADE");
    }
    console.log("[migrate] strategy_internal_step_artifacts: OK");

    // 2026-05-16 (CJ「schema 跟 migrate 不同步，抓出孤兒表」):
    // op-schema-audit found 8 schema.ts tables absent in prod. 3 are
    // actually referenced by code (the rest are dead/doc-only). Create
    // the 3 so unguarded drizzle queries stop throwing. DDL mirrors
    // drizzle/schema.ts; DATETIME(3) matches the existing convention.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mission_task_units (
        id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        missionId   INT NOT NULL,
        agentId     INT NULL,
        label       VARCHAR(255) NOT NULL,
        status      ENUM('not_started','running','needs_input','review','approved')
                      NOT NULL DEFAULT 'not_started',
        sortOrder   INT DEFAULT 0,
        taskId      INT NULL,
        createdAt   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY idx_mission (missionId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] mission_task_units: OK");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS agent_learnings (
        id               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        agentId          INT NOT NULL,
        userId           INT NOT NULL,
        brandId          INT NULL,
        taskId           INT NULL,
        subscriptionPlan ENUM('per_task','monthly','team') NOT NULL,
        isPrivate        TINYINT(1) NOT NULL DEFAULT 0,
        taskTitle        VARCHAR(255) NOT NULL,
        taskDescription  TEXT NULL,
        taskType         VARCHAR(64) NULL,
        outputSummary    TEXT NULL,
        fullOutput       LONGTEXT NULL,
        userRating       INT NULL,
        userFeedback     TEXT NULL,
        feedbackAt       DATETIME(3) NULL,
        brandContext     JSON NULL,
        createdAt        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY idx_agent (agentId), KEY idx_user (userId), KEY idx_brand (brandId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] agent_learnings: OK");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS agent_memories (
        id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId      INT NOT NULL,
        agentSlug   VARCHAR(64) NOT NULL,
        brandId     INT NULL,
        memoryType  ENUM('preference','forbidden','audience','style','other') DEFAULT 'other',
        content     TEXT NOT NULL,
        isActive    TINYINT(1) NOT NULL DEFAULT 1,
        createdAt   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY idx_user_agent (userId, agentSlug), KEY idx_brand (brandId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] agent_memories: OK");

    // 2026-05-17 (CJ「把參考完的得獎案例原始資料放進資料庫」):
    // pr_craft_refs — the award-craft reference each PR task is built on.
    // Single source of truth (front-end chip + back-end prompt mirror
    // this). Idempotent seed; safe to re-run / edit rows later.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS pr_craft_refs (
        taskId      VARCHAR(64)  NOT NULL PRIMARY KEY,
        caseName    VARCHAR(200) NOT NULL,
        award       VARCHAR(200) NOT NULL,
        principle   TEXT         NOT NULL,
        sourceNote  VARCHAR(300) NULL,
        updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    {
      const SRC = "業界公認之 Cannes Lions PR / 里程碑 earned-media 案例；依可轉移工藝對應，非案例背書";
      const rows: [string, string, string, string][] = [
        ["pr-30-headline", "The Tampon Book", "Cannes Lions 2019 PR 全場大獎", "用「重新框架」把舊事實變成不可忽視的新聞——標題＝reframe＋具體數字。"],
        ["pr-30-subhead", "Project Revoice", "Cannes Lions 2018 健康類全場大獎", "副標扛起標題扛不動的「人的代價/影響」，補上利害關係，不是重述標題。"],
        ["pr-30-lead-paragraph", "The Lost Class", "Cannes Lions 2022", "第一句就是一個讓人重新理解全局的事實揭露，不鋪陳。"],
        ["pr-30-ceo-quote", "Patagonia「Earth is now our only shareholder」", "2022 全球 earned-media 典範", "高層發言＝行動＋價值，每句可被記者原句引用，不是場面話。"],
        ["pr-30-boilerplate", "PR Awards 評審準則 + Dove 長青一致性", "業界評審共通準則", "用可驗證事實＋第三方背書建立可信度，能長期沿用不過期。"],
        ["pr-30-fact-sheet", "Spotify Wrapped", "全球 earned / 多獎", "把資料變成「10 秒看懂、想分享」的數字，掃描性 > 完整性。"],
        ["pr-30-media-pitch", "Whopper Detour", "Cannes Lions 2019", "賣「記者的讀者會在乎的角度」與不可抗拒的鉤，不是賣品牌。"],
        ["pr-30-spokesperson-qa", "KFC「FCK」", "Cannes Lions 2019 多項金獅 + D&AD", "危機回應：立刻 own it＋坦誠＋機智＋馬上講怎麼修，化攻擊為信任。"],
        ["pr-30-launch-social", "Spotify Wrapped 社群擴散", "全球 earned", "被分享的是「有觀點、有梗、與我有關」，不是公告。"],
        ["pr-100-launch-toolkit", "Whopper Detour（整合 earned）", "Cannes Lions 2019", "一個新聞鉤貫穿所有素材，互相加乘而非各說各話。"],
        ["pr-99-launch-toolkit", "Whopper Detour（整合 earned）", "Cannes Lions 2019", "一個新聞鉤貫穿所有素材，互相加乘而非各說各話。"],
        ["pr-30-news-hook", "The Tampon Book + Whopper Detour", "Cannes Lions 2019 PR", "得獎不是把公告寫好，而是先找到「記者會主動報、群眾會主動傳」的角度（earned idea）。"],
        ["pr-99-newsjack", "Oreo「Dunk in the Dark」", "2013 即時 newsjack 經典", "在對的時刻、用對的角度、夠快且自然地把品牌接上正在發燒的話題——不硬蹭。"],
      ];
      for (const [tid, c, a, p] of rows) {
        await conn.execute(
          `INSERT INTO pr_craft_refs (taskId, caseName, award, principle, sourceNote)
                VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE caseName=VALUES(caseName), award=VALUES(award),
                principle=VALUES(principle), sourceNote=VALUES(sourceNote)`,
          [tid, c, a, p, SRC],
        );
      }
    }
    console.log("[migrate] pr_craft_refs: OK (seeded)");

    // ── 2026-05-20: users.preferredLang — persist UI language choice to DB ──
    // Survives localStorage clears; syncs across devices on login.
    const [prefLangCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'preferredLang'
    `) as any;
    if ((prefLangCol as any[]).length === 0) {
      await conn.execute(`ALTER TABLE users ADD COLUMN preferredLang VARCHAR(8) NOT NULL DEFAULT 'zh-TW'`);
      console.log("[migrate] users.preferredLang: added");
    } else {
      console.log("[migrate] users.preferredLang: already exists, skipped");
    }

    // ── 2026-05-21 (CJ「全球每個國家都可在地化」): global market localisation ──
    // brands.targetCountry  — ISO 3166-1 alpha-2 (e.g. 'TW','JP','US')
    // brands.outputLanguage — BCP 47 output language tag (e.g. 'zh-TW','ja')
    // brands.marketContextOverride — free-text Tier C override
    for (const [col, def] of [
      ["targetCountry",          "VARCHAR(2) NULL COMMENT 'ISO 3166-1 alpha-2 target market'"],
      ["outputLanguage",         "VARCHAR(10) NULL COMMENT 'BCP 47 output language tag'"],
      ["marketContextOverride",  "TEXT NULL COMMENT 'Tier C: fully custom market brief'"],
    ] as const) {
      const [rows] = await conn.execute(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brands' AND COLUMN_NAME = ?
      `, [col]) as any;
      if ((rows as any[]).length === 0) {
        await conn.execute(`ALTER TABLE brands ADD COLUMN ${col} ${def}`);
        console.log(`[migrate] brands.${col}: added`);
      } else {
        console.log(`[migrate] brands.${col}: already exists, skipped`);
      }
    }

    // market_profiles — LLM-generated Tier B cache (one row per country code).
    // Tier A profiles (35 hand-crafted) live in marketProfiles.ts, never DB.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS market_profiles (
        id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        countryCode  VARCHAR(2)   NOT NULL UNIQUE COMMENT 'ISO 3166-1 alpha-2',
        profileJson  TEXT         NOT NULL COMMENT 'JSON MarketProfile from marketProfiles.ts',
        generatedBy  VARCHAR(32)  NOT NULL DEFAULT 'llm' COMMENT 'llm | hand',
        createdAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY idx_mp_country (countryCode)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] market_profiles: OK");

    // ─── 2026-06-03: product_discovery_jobs ──────────────────────────
    // 2026-09-24（CJ「刪除AI掃描官網的功能」）：這張表的功能已經整個移除
    // （productDiscovery.ts / websiteImageScraper.ts 已刪、worker 已拿掉、
    // tRPC 端點已拿掉）。**表本身刻意留著**：裡面有歷史工作紀錄，而且
    // 「不砍表」是這個 repo 一貫的紀律——砍掉救不回來，留著只佔幾 KB。
    // 新資料庫也照建，讓 schema 在各環境保持一致。
    // Auto-discovers products from brand website after brand creation.
    // Worker processes one job at a time, positions each product with
    // runInterim (fast) + start (full, background). Graceful: any failure
    // is silently logged; partial results always visible to user.
    //
    // Status flow: pending → running → done | failed
    // Phase flow:  crawl → extract → position (per-product)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS product_discovery_jobs (
        id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        brandId          INT          NOT NULL,
        userId           INT          NOT NULL,
        websiteUrl       VARCHAR(500) NOT NULL,
        status           VARCHAR(12)  NOT NULL DEFAULT 'pending'
                         COMMENT 'pending | running | done | failed',
        phase            VARCHAR(20)  NOT NULL DEFAULT 'crawl'
                         COMMENT 'crawl | extract | position | complete',
        totalFound       INT          NOT NULL DEFAULT 0,
        totalPositioned  INT          NOT NULL DEFAULT 0,
        currentProduct   VARCHAR(255) NULL     COMMENT 'product being positioned now',
        errorLog         TEXT         NULL     COMMENT 'JSON array of silent errors',
        startedAt        DATETIME(3)  NULL,
        completedAt      DATETIME(3)  NULL,
        createdAt        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                         ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_pdj_brand  (brandId),
        INDEX idx_pdj_status (status, createdAt),
        INDEX idx_pdj_user   (userId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] product_discovery_jobs: OK");

    // ─── 2026-06-21 (CJ「按照 riverflow.ai 做法」brand DNA sprint) ────────────
    // brand_colors: JSON column on brands that holds the auto-extracted
    // brand palette (5-7 swatches with role + frequency metadata).
    // Schema example:
    //   {
    //     "extractedAt": "2026-06-21T10:00:00Z",
    //     "sourceCount": 18,                 // number of product images sampled
    //     "swatches": [
    //       { "hex": "#C9826A", "role": "primary",   "frequency": 0.31 },
    //       { "hex": "#5C7A56", "role": "accent",    "frequency": 0.18 },
    //       { "hex": "#2A2422", "role": "ink",       "frequency": 0.16 },
    //       { "hex": "#F5E8D8", "role": "neutral",   "frequency": 0.14 },
    //       { "hex": "#E8A47F", "role": "highlight", "frequency": 0.11 }
    //     ],
    //     "userLocked": false               // true once user manually edits
    //   }
    const [bcCol] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brands' AND COLUMN_NAME = 'brand_colors'
    `) as any;
    if ((bcCol as any[]).length === 0) {
      await conn.execute(`ALTER TABLE brands ADD COLUMN brand_colors JSON NULL`);
      console.log("[migrate] brands.brand_colors: added");
    } else {
      console.log("[migrate] brands.brand_colors: already exists, skipped");
    }

    // ─── bundle.social publishing binding ─────────────────────────────────
    // 2026-07-25: Pipedream's managed Meta app cannot publish (see
    // docs/facebook-publish-provider-evaluation-2026-07-25.md). bundle.social
    // maps one team per brand. The existing fbPageId / fbPageName /
    // fbConnectedAt columns stay untouched so the Pipedream path still works
    // and PUBLISH_PROVIDER can be switched back at any time.
    for (const col of [
      { name: "bundleTeamId",      type: "VARCHAR(64) NULL" },
      { name: "bundleConnectedAt", type: "DATETIME NULL" },
    ]) {
      const [r]: any = await conn.execute(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brands' AND COLUMN_NAME = ?
      `, [col.name]);
      if ((r as any[]).length === 0) {
        await conn.execute(`ALTER TABLE brands ADD COLUMN \`${col.name}\` ${col.type}`);
        console.log(`[migrate] brands.${col.name}: added`);
      } else {
        console.log(`[migrate] brands.${col.name}: already exists, skipped`);
      }
    }

    // ─── brand_integrations — persona-agent cloud-file OAuth connections ────
    // 2026-08-22 (CJ 測試 Google Drive 連接時：「連接失敗：Table
    // 'mos_db.brand_integrations' doesn't exist」): the table was declared in
    // drizzle/schema.ts (drizzle/migrations/0000_fair_ben_parker.sql:99) but
    // this repo's real deploy-time migration path is this script, not
    // drizzle-kit push — the table was never actually created in prod.
    // Columns/shape match the drizzle schema exactly so both stay in sync.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_integrations (
        id                    INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId                INT          NOT NULL,
        brandId               INT          NULL,
        integrationType       VARCHAR(50)  NOT NULL,
        status                ENUM('connected','disconnected','error') NOT NULL DEFAULT 'disconnected',
        accessToken           TEXT         NULL,
        selectedResourceId    VARCHAR(255) NULL,
        authorizedResources   JSON         NULL,
        connectedAt           TIMESTAMP    NULL,
        createdAt             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_brand_type (userId, brandId, integrationType)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_integrations: OK");

    // ─── 2026-10-07: brand publish tenants / connections ────────────────────
    // Zernio uses provider-neutral bindings; keep legacy brand columns intact.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_publish_tenants (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        brandId     INT          NOT NULL,
        provider    VARCHAR(24)  NOT NULL,                 -- 'zernio' | 'bundle' | 'pipedream' | ...
        tenantId    VARCHAR(128) NOT NULL,
        createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_bpt_brand_provider (brandId, provider)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_publish_tenants: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brand_publish_connections (
        id              BIGINT AUTO_INCREMENT PRIMARY KEY,
        brandId         INT          NOT NULL,
        provider        VARCHAR(24)  NOT NULL,
        platform        VARCHAR(24)  NOT NULL,             -- onBrand 內部值：facebook | instagram | linkedin | threads | x | youtube | tiktok
        accountId       VARCHAR(128) NOT NULL,             -- 供應商端帳號 id（Zernio account _id）
        accountLabel    VARCHAR(255) NULL,                 -- displayName，給 UI
        accountUsername VARCHAR(255) NULL,
        status          VARCHAR(16)  NOT NULL DEFAULT 'connected',   -- 'connected' | 'disconnected'
        connectedAt     DATETIME(3)  NULL,
        disconnectedAt  DATETIME(3)  NULL,
        meta            JSON         NULL,                 -- 供應商專屬雜項（profileUrl 等），不再開新欄位
        createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_bpc_brand_provider_platform_account (brandId, provider, platform, accountId),
        KEY idx_bpc_lookup (brandId, provider, platform, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] brand_publish_connections: OK");

    // ─── 2026-10-07: 客戶核准連結（approvalRouter.ts）──────────────────────
    // 一條免登入連結對多篇貼文；每篇的留言／修改／核准都記在 approval_events。
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS approval_links (
        id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        token       VARCHAR(64)  NOT NULL,
        userId      INT          NOT NULL,                 -- 資料擁有者（團隊成員建立時＝品牌擁有者）
        createdBy   INT          NOT NULL,                 -- 實際按下建立的人
        brandId     INT          NOT NULL,
        title       VARCHAR(120) NOT NULL,
        note        VARCHAR(600) NULL,                     -- 給客戶的一句話
        expiresAt   DATETIME(3)  NOT NULL,
        revokedAt   DATETIME(3)  NULL,
        lastViewedAt DATETIME(3) NULL,
        createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_al_token (token),
        INDEX idx_al_owner (userId, brandId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] approval_links: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS approval_link_items (
        id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        linkId          BIGINT       NOT NULL,
        outputId        INT          NOT NULL,
        variantIndex    INT          NOT NULL DEFAULT 0,
        contentKind     VARCHAR(16)  NULL,
        contentIndex    INT          NULL,
        scheduledPostId BIGINT       NULL,
        platform        VARCHAR(24)  NOT NULL DEFAULT 'other',
        position        INT          NOT NULL DEFAULT 0,
        decision        VARCHAR(20)  NOT NULL DEFAULT 'pending',   -- pending | approved | changes_requested
        decidedBy       VARCHAR(60)  NULL,
        decidedAt       DATETIME(3)  NULL,
        createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_ali_link (linkId, position),
        INDEX idx_ali_output (outputId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] approval_link_items: OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS approval_events (
        id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        linkId       BIGINT       NOT NULL,
        itemId       BIGINT       NOT NULL,
        outputId     INT          NOT NULL,
        kind         VARCHAR(20)  NOT NULL,                -- comment | edit | restore | approved | changes_requested | reopened
        authorType   VARCHAR(8)   NOT NULL,                -- client | team
        authorName   VARCHAR(60)  NOT NULL,
        authorUserId INT          NULL,
        body         TEXT         NULL,
        beforeText   MEDIUMTEXT   NULL,
        afterText    MEDIUMTEXT   NULL,
        createdAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_ae_item (itemId, id),
        INDEX idx_ae_link (linkId, id),
        INDEX idx_ae_output (outputId, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] approval_events: OK");

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
