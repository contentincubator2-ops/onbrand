/**
 * Sales Hub (ExpertHub demo) — tables.
 *
 * 2026-09-16 (CJ「equip marketing team for sales reps — growth + compliance」,
 * Dallas show demo): one org (ASUS ExpertHub, concept demo) whose HQ / marketing
 * use the web admin and whose sales reps use a LINE bot. Every table is prefixed
 * `hub_` and owned by this module; nothing else in OnBrand reads them.
 *
 * `is_demo = 1` marks synthetic rows (illustrative reps, back-filled history).
 * Rows produced by real interactions at the booth (a scanned QR, a generated
 * post) are `is_demo = 0`, and the dashboard shows them as LIVE.
 */

const TAIL = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

export const HUB_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS hub_org (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug            VARCHAR(64)  NOT NULL UNIQUE,
    name            VARCHAR(160) NOT NULL,
    disclaimer      VARCHAR(400) NOT NULL,
    positioning     JSON         NULL,
    landing_url     VARCHAR(500) NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_reps (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    name            VARCHAR(120) NOT NULL,
    title           VARCHAR(160) NOT NULL,
    team            VARCHAR(120) NOT NULL,
    avatar_seed     VARCHAR(64)  NOT NULL,
    line_user_id    VARCHAR(64)  NULL UNIQUE,
    bind_code       VARCHAR(12)  NULL UNIQUE,
    mcp_token_hash  CHAR(64)     NULL,
    consent_at      DATETIME(3)  NULL,
    linkedin_status VARCHAR(20)  NOT NULL DEFAULT 'none',
    instagram_status VARCHAR(20) NOT NULL DEFAULT 'none',
    facebook_status VARCHAR(20)  NOT NULL DEFAULT 'none',
    network_size    INT          NOT NULL DEFAULT 0,
    is_demo         TINYINT      NOT NULL DEFAULT 1,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_org (org_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_solutions (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    slug            VARCHAR(80)  NOT NULL,
    name_en         VARCHAR(160) NOT NULL,
    name_zh         VARCHAR(160) NOT NULL,
    vendor          VARCHAR(160) NOT NULL,
    category        VARCHAR(80)  NOT NULL,
    industries      JSON         NULL,
    summary_en      TEXT         NOT NULL,
    summary_zh      TEXT         NOT NULL,
    features        JSON         NULL,
    audience_en     VARCHAR(300) NULL,
    audience_zh     VARCHAR(300) NULL,
    source_url      VARCHAR(500) NULL,
    featured        TINYINT      NOT NULL DEFAULT 0,
    is_asus         TINYINT      NOT NULL DEFAULT 0,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_org_slug (org_id, slug)
  ) ${TAIL}`,

  // Prices are versioned: a post may only quote a price that is active today,
  // and a price change makes older posts that quoted the old price "stale".
  `CREATE TABLE IF NOT EXISTS hub_prices (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    solution_id     INT          NOT NULL,
    plan_en         VARCHAR(120) NOT NULL,
    plan_zh         VARCHAR(120) NOT NULL,
    amount          INT          NULL,
    currency        VARCHAR(3)   NOT NULL DEFAULT 'TWD',
    billing         VARCHAR(12)  NOT NULL,
    starts_from     TINYINT      NOT NULL DEFAULT 0,
    effective_from  DATE         NOT NULL,
    effective_to    DATE         NULL,
    source_url      VARCHAR(500) NULL,
    INDEX idx_solution (solution_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_facts (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    kind            VARCHAR(20)  NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    statement_en    TEXT         NOT NULL,
    statement_zh    TEXT         NOT NULL,
    figures         JSON         NULL,
    source_name     VARCHAR(200) NOT NULL,
    source_url      VARCHAR(500) NOT NULL,
    published_on    DATE         NULL,
    confidence      VARCHAR(20)  NOT NULL,
    INDEX idx_org_kind (org_id, kind)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_skills (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    slug            VARCHAR(80)  NOT NULL,
    name_en         VARCHAR(160) NOT NULL,
    name_zh         VARCHAR(160) NOT NULL,
    channels        JSON         NOT NULL,
    markets         JSON         NOT NULL,
    skill_md        MEDIUMTEXT   NOT NULL,
    status          VARCHAR(12)  NOT NULL DEFAULT 'draft',
    version         INT          NOT NULL DEFAULT 1,
    approved_by     VARCHAR(160) NULL,
    approved_at     DATETIME(3)  NULL,
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_org_slug (org_id, slug)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_posts (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    rep_id          INT          NOT NULL,
    solution_id     INT          NULL,
    skill_id        INT          NULL,
    channel         VARCHAR(20)  NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    angle           VARCHAR(600) NULL,
    first_draft     MEDIUMTEXT   NULL,
    caption         MEDIUMTEXT   NOT NULL,
    compliance      JSON         NULL,
    verdict         VARCHAR(12)  NOT NULL,
    short_code      VARCHAR(12)  NULL,
    status          VARCHAR(12)  NOT NULL DEFAULT 'generated',
    post_url        VARCHAR(500) NULL,
    source          VARCHAR(12)  NOT NULL,
    model           VARCHAR(80)  NULL,
    latency_ms      INT          NULL,
    is_demo         TINYINT      NOT NULL DEFAULT 0,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    shared_at       DATETIME(3)  NULL,
    INDEX idx_org_created (org_id, created_at),
    INDEX idx_rep (rep_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_links (
    code            VARCHAR(12)  NOT NULL PRIMARY KEY,
    org_id          INT          NOT NULL,
    rep_id          INT          NOT NULL,
    post_id         INT          NULL,
    channel         VARCHAR(20)  NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_rep (rep_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_clicks (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    code            VARCHAR(12)  NOT NULL,
    rep_id          INT          NOT NULL,
    post_id         INT          NULL,
    visitor_hash    CHAR(16)     NULL,
    is_demo         TINYINT      NOT NULL DEFAULT 0,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_org_created (org_id, created_at),
    INDEX idx_rep (rep_id)
  ) ${TAIL}`,

  // One row per (post, snapshot). grade says how much to trust the number:
  // verified (platform API) / tracked (our short link) / self_reported (rep
  // pasted it) / estimated (network size × typical rate).
  `CREATE TABLE IF NOT EXISTS hub_metrics (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    rep_id          INT          NOT NULL,
    post_id         INT          NULL,
    channel         VARCHAR(20)  NOT NULL,
    grade           VARCHAR(16)  NOT NULL,
    impressions     INT          NOT NULL DEFAULT 0,
    engagements     INT          NOT NULL DEFAULT 0,
    leads           INT          NOT NULL DEFAULT 0,
    is_demo         TINYINT      NOT NULL DEFAULT 1,
    captured_on     DATE         NOT NULL,
    INDEX idx_org_date (org_id, captured_on),
    INDEX idx_rep (rep_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_events (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    rep_id          INT          NULL,
    kind            VARCHAR(32)  NOT NULL,
    detail          VARCHAR(500) NULL,
    is_demo         TINYINT      NOT NULL DEFAULT 0,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_org_created (org_id, created_at)
  ) ${TAIL}`,

  // Strategy tray: preferred terms, word swaps and company-banned words.
  // Legal claim rules stay in the policy packs (code); this is what marketing
  // edits day to day, and the compliance check reads it on every post.
  `CREATE TABLE IF NOT EXISTS hub_wording (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    kind            VARCHAR(12)  NOT NULL,
    term            VARCHAR(120) NOT NULL,
    replacement     VARCHAR(160) NULL,
    note            VARCHAR(300) NULL,
    added_by        VARCHAR(160) NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_term (org_id, market, kind, term),
    INDEX idx_org (org_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_regulations (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    authority       VARCHAR(160) NOT NULL,
    title           VARCHAR(300) NOT NULL,
    summary         TEXT         NOT NULL,
    impact          TEXT         NOT NULL,
    rules           JSON         NULL,
    status          VARCHAR(12)  NOT NULL,
    effective_on    DATE         NULL,
    published_on    DATE         NULL,
    source_url      VARCHAR(500) NOT NULL,
    INDEX idx_org (org_id)
  ) ${TAIL}`,
];

export async function ensureHubTables(): Promise<void> {
  const { default: localPool } = await import("../../../localDb");
  for (const ddl of HUB_DDL) {
    await localPool.execute(ddl);
  }
}
