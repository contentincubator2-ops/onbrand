-- Migration: KB size caps — brand_kb_usage + brand_kb_admin_override
-- Issue #20: per-org knowledge base size limits (100 MB soft / 500 MB hard)
--
-- Design note: we use a plain table rather than a materialized view for
-- bytesUsed because:
--   1. MySQL <8.0 has no native materialized views.
--   2. The table can be written transactionally alongside INSERT/DELETE on
--      mission_knowledge_files, eliminating eventual-consistency lag.
--   3. Simple SUM(fileSize) recompute is fast enough for the expected scale.

-- Track per-brand KB usage (one row per brand, upserted on upload/delete)
CREATE TABLE IF NOT EXISTS brand_kb_usage (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  orgId           INT NULL,
  brandId         INT NOT NULL,
  bytesUsed       INT NOT NULL DEFAULT 0,
  lastComputedAt  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_brand_kb_usage_brandId (brandId)
);

-- Per-brand admin override: bypass hard limit when adminKbOverride=TRUE
-- Kept as a separate table to avoid a wide ALTER TABLE on the brands table.
CREATE TABLE IF NOT EXISTS brand_kb_admin_override (
  brandId         INT NOT NULL PRIMARY KEY,
  adminKbOverride TINYINT(1) NOT NULL DEFAULT 0,
  updatedBy       INT NULL,
  updatedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
