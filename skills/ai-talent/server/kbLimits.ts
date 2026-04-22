/**
 * kbLimits.ts — Knowledge Base size cap logic (Issue #20)
 *
 * Limits are env-configurable; defaults: soft=100 MB, hard=500 MB.
 *
 * Soft limit (KB_SOFT_LIMIT_MB): emit a notification event at 80%.
 * Hard limit (KB_HARD_LIMIT_MB): reject uploads that would exceed this.
 *
 * Admin override (adminKbOverride=true on brand_kb_admin_override): bypass
 * the hard limit entirely. Every bypass is audit-logged via sessionLogger.
 *
 * TODO(#3): replace emitKbWarningEvent stub with real notification delivery
 *           once the #3 notification backbone is implemented.
 */

import { TRPCError } from "@trpc/server";
import { eq, sum } from "drizzle-orm";
import type { DB } from "./db";
import { missionKnowledgeFiles, brandKbUsage, brandKbAdminOverride } from "../drizzle/schema";
import { logEvent, newSessionId } from "./_core/sessionLogger";

// ─── Limit constants (env-configurable) ──────────────────────────────────────

const MB = 1024 * 1024;

export function getSoftLimitBytes(): number {
  const v = parseInt(process.env.KB_SOFT_LIMIT_MB ?? "100", 10);
  return (isNaN(v) ? 100 : v) * MB;
}

export function getHardLimitBytes(): number {
  const v = parseInt(process.env.KB_HARD_LIMIT_MB ?? "500", 10);
  return (isNaN(v) ? 500 : v) * MB;
}

/** 80% of soft limit triggers the warning notification */
export function getWarningThresholdBytes(): number {
  return Math.floor(getSoftLimitBytes() * 0.8);
}

// ─── Usage recompute ──────────────────────────────────────────────────────────

/**
 * Recompute SUM(fileSize) for the brand from mission_knowledge_files and
 * upsert the result into brand_kb_usage.
 * Returns the fresh bytesUsed value.
 */
export async function recomputeKbUsage(db: DB, brandId: number): Promise<number> {
  const rows = await db
    .select({ total: sum(missionKnowledgeFiles.fileSize) })
    .from(missionKnowledgeFiles)
    .where(eq(missionKnowledgeFiles.brandId, brandId));

  const bytesUsed = Number(rows[0]?.total ?? 0);

  // Upsert — insert or update on duplicate brandId
  await db
    .insert(brandKbUsage)
    .values({ brandId, bytesUsed, lastComputedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { bytesUsed, lastComputedAt: new Date() } });

  return bytesUsed;
}

// ─── Admin override lookup ────────────────────────────────────────────────────

export async function isAdminOverrideEnabled(db: DB, brandId: number): Promise<boolean> {
  const rows = await db
    .select({ adminKbOverride: brandKbAdminOverride.adminKbOverride })
    .from(brandKbAdminOverride)
    .where(eq(brandKbAdminOverride.brandId, brandId));
  return rows[0]?.adminKbOverride === true;
}

// ─── Notification stub ────────────────────────────────────────────────────────

/**
 * Emit a KB-80% warning event.
 * TODO(#3): wire this to the real notification delivery backbone (#3).
 *           For now we log a structured event to session_event_logs so the
 *           signal is captured and can be replayed once #3 lands.
 */
export function emitKbWarningEvent(params: {
  userId: number;
  brandId: number;
  bytesUsed: number;
  softLimitBytes: number;
}): void {
  logEvent({
    sessionId: newSessionId(),
    userId: params.userId,
    eventType: "output",
    metadata: {
      event: "kb_soft_limit_80pct_warning",
      brandId: params.brandId,
      bytesUsed: params.bytesUsed,
      softLimitBytes: params.softLimitBytes,
      pct: Math.round((params.bytesUsed / params.softLimitBytes) * 100),
      // TODO(#3): after #3 backbone lands, dispatch a real notification here
    },
  });
}

// ─── Pre-flight check ─────────────────────────────────────────────────────────

/**
 * checkKbUploadAllowed — called before inserting a new knowledge file.
 *
 * 1. Recomputes current usage for the brand.
 * 2. If adminKbOverride is set, logs an audit entry and allows the upload.
 * 3. If current + incomingBytes > hardLimit → throws PAYLOAD_TOO_LARGE.
 * 4. If current + incomingBytes > 80% of softLimit → emits warning event.
 *
 * Returns the pre-insert bytesUsed (so the caller can update after insert).
 */
export async function checkKbUploadAllowed(
  db: DB,
  params: {
    brandId: number;
    userId: number;
    incomingBytes: number;
  }
): Promise<{ bytesUsed: number; overrideActive: boolean }> {
  const { brandId, userId, incomingBytes } = params;

  const bytesUsed = await recomputeKbUsage(db, brandId);
  const projected = bytesUsed + incomingBytes;

  const hardLimit = getHardLimitBytes();
  const softLimit = getSoftLimitBytes();
  const warnThreshold = getWarningThresholdBytes();

  // Admin override — bypass hard limit with audit log
  const overrideActive = await isAdminOverrideEnabled(db, brandId);
  if (overrideActive) {
    logEvent({
      sessionId: newSessionId(),
      userId,
      eventType: "output",
      metadata: {
        event: "kb_hard_limit_bypassed_by_admin_override",
        brandId,
        bytesUsed,
        incomingBytes,
        hardLimitBytes: hardLimit,
      },
    });
    // Still emit 80% warning if applicable
    if (projected > warnThreshold) {
      emitKbWarningEvent({ userId, brandId, bytesUsed: projected, softLimitBytes: softLimit });
    }
    return { bytesUsed, overrideActive: true };
  }

  // Hard limit check
  if (projected > hardLimit) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: `Upload would exceed the knowledge base hard limit of ${getHardLimitBytes() / MB} MB. ` +
        `Current usage: ${(bytesUsed / MB).toFixed(1)} MB, ` +
        `file size: ${(incomingBytes / MB).toFixed(2)} MB. ` +
        `Please delete unused files or contact your admin.`,
    });
  }

  // 80% soft-limit warning
  if (projected > warnThreshold) {
    emitKbWarningEvent({ userId, brandId, bytesUsed: projected, softLimitBytes: softLimit });
  }

  return { bytesUsed, overrideActive: false };
}
