/**
 * recordTaskRun — write completed task outputs to mission_outputs so the
 * /projects page actually reflects what the user has done.
 *
 * CJ direction (2026-05-07):
 *   "你要檢查，是否其他地方創建的內容，都可以加入專案了。"
 *
 * Design: 1 mission per (userId × brandId × workspace × taskId) tuple.
 *   - First time the user runs a particular task for a brand → mission
 *     row is created.
 *   - Each subsequent run → mission_outputs row appended (version++).
 *   - /projects shows missions ordered by latest output's createdAt.
 *
 * Failure here is non-fatal — the task result is still returned to the
 * user even if persistence fails.
 */
import localPool from "../localDb";
import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeTaskId, normalizeTier, legacyTaskId } from "./tierCompat";

/**
 * 2026-05-14 (CJ「我要確保任務會被移到任務卡片，不光是要記錄錯誤」):
 * Disaster-recovery sink for task runs whose INSERT into mission_outputs
 * failed even after sanitization + minimal-fallback. The args object is
 * appended as a single JSON line so an admin job can replay later via
 * the admin-replay-failed-task-runs.yml workflow.
 */
function appendDLQ(args: RecordArgs, missionId: number | null, reason: string, sqlCode?: string): void {
  try {
    // Default to user-writable PM2 logs dir on the VM (~/.pm2/logs/),
    // not /var/log which requires root. Override via TASK_DLQ_DIR if
    // you want a system path with appropriate permissions.
    const dir = process.env.TASK_DLQ_DIR
      ?? `${process.env.HOME ?? "/home/azureuser"}/.pm2/logs`;
    try { fs.mkdirSync(dir, { recursive: true }); } catch {/* may already exist */}
    const file = path.join(dir, "task-runs-failed.jsonl");
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      reason,
      sqlCode: sqlCode ?? null,
      missionId,
      args: {
        userId: args.userId,
        brandId: args.brandId,
        workspace: args.workspace,
        taskId: args.taskId,
        taskLabel: args.taskLabel,
        tier: args.tier,
        title: args.title,
        // Cap content for the DLQ too; full payload may be huge
        content: (args.content ?? "").slice(0, 100_000),
        metadata: args.metadata,
        thumbnailUrl: args.thumbnailUrl,
        platform: args.platform,
        outputType: args.outputType,
      },
    }) + "\n";
    fs.appendFileSync(file, line, "utf-8");
  } catch (e) {
    // If even the DLQ write fails, nothing we can do beyond log.
    console.error("[recordTaskRun] DLQ append failed:", (e as Error).message);
  }
}

/**
 * Strip characters that can't fit in a 3-byte utf8 column (i.e. surrogate
 * pairs / emoji / supplementary plane). Replaces them with a Unicode
 * replacement glyph so the user can still see something happened. Used
 * as a second-pass fallback when the original INSERT trips
 * ER_INCORRECT_STRING_VALUE.
 */
function stripNonBMP(s: string): string {
  if (!s) return s;
  // \u{D800}-\u{DFFF} are surrogate halves; any code point >= 0x10000
  // is represented by a surrogate pair in JS strings.
  return s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "□");
}

type Platform = "facebook" | "instagram" | "linkedin" | "youtube" | "google_ads" | "email" | "ppt" | "doc" | "script" | "other";
type OutputType = "post" | "story" | "reel" | "ad_copy" | "email_html" | "slide" | "script" | "product_desc" | "report" | "other";

interface RecordArgs {
  userId: number;
  brandId: number | null;
  workspace: string;          // e.g. "facebook" / "instagram" / "theater" / "youtube"
  taskId: string;             // e.g. "fb-30-single-post" / "ig-60-carousel"
  taskLabel: string;          // human-readable; e.g. "FB 短貼文 (介紹)"
  tier: "30s" | "60s" | "99s" | "theater";
  /** Title to show on the project card. Falls back to taskLabel. */
  title?: string;
  /** Long-form body — JSON-stringified or rendered text of all variants. */
  content: string;
  /** Optional metadata snapshot — variants array, latency, agents, etc. */
  metadata?: Record<string, any>;
  /** Optional preview thumbnail URL (e.g. first variant's image). */
  thumbnailUrl?: string | null;
  platform?: Platform;
  outputType?: OutputType;
  /**
   * 2026-05-14 (CJ「async orchestra」): when the orchestra splits its work
   * across captions-first + image/QA-background, the INITIAL write uses
   * progress='caption_ready'. When the background continuation completes,
   * call `finaliseTaskRun(outputId, …)` to update the row to 'done'.
   * Defaults to 'done' for the existing single-write callers.
   */
  progress?: "caption_ready" | "done" | "failed";
}

/**
 * Update a previously-written mission_outputs row with the final
 * (image-resolved, QA-reviewed) data after the orchestra's background
 * continuation finishes. Mirrors the write path of recordTaskRun's
 * INSERT but as an UPDATE keyed by outputId.
 */
export async function finaliseTaskRun(args: {
  outputId: number;
  /** Pass `undefined` to keep the existing content (e.g. on failure where
   *  we don't want to overwrite the partial caption already written). */
  content?: string;
  metadata?: Record<string, any>;
  thumbnailUrl?: string | null;
  title?: string;
  progress: "done" | "failed";
  progressDetail?: string;
}): Promise<{ ok: boolean }> {
  try {
    const MAX_CONTENT = 2_000_000;
    const MAX_METADATA = 200_000;

    const sets: string[] = ["progress = ?", "progressDetail = ?", "updatedAt = NOW()"];
    const params: any[] = [args.progress, args.progressDetail ?? null];

    if (args.content !== undefined) {
      let safeContent = args.content;
      if (safeContent.length > MAX_CONTENT) safeContent = safeContent.slice(0, MAX_CONTENT);
      sets.push("content = ?");
      params.push(safeContent);
    }

    if (args.metadata !== undefined || args.thumbnailUrl !== undefined) {
      let metadata = JSON.stringify({
        ...(args.metadata ?? {}),
        thumbnailUrl: args.thumbnailUrl ?? null,
      });
      if (metadata.length > MAX_METADATA) {
        metadata = JSON.stringify({
          thumbnailUrl: args.thumbnailUrl ?? null,
          _truncated: true,
          _originalSize: metadata.length,
        });
      }
      sets.push("metadata = ?");
      params.push(metadata);
    }

    if (args.title) {
      sets.push("title = ?");
      params.push(args.title.slice(0, 250));
    }

    params.push(args.outputId);
    await localPool.execute(
      `UPDATE mission_outputs SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
    return { ok: true };
  } catch (e: any) {
    console.error("[finaliseTaskRun] FAILED", {
      outputId: args.outputId,
      progress: args.progress,
      sqlCode: e?.code,
      sqlMessage: e?.sqlMessage,
      message: String(e?.message ?? e),
    });
    return { ok: false };
  }
}

const WORKSPACE_TO_PLATFORM: Record<string, Platform> = {
  facebook: "facebook", instagram: "instagram", linkedin: "linkedin",
  youtube: "youtube", email: "email", ppt: "ppt", doc: "doc",
  threads: "other", tiktok: "other", press: "other", brand: "other",
  audience: "other", theater: "other",
};

/** Find an existing mission for this (user, brand, workspace, task) tuple,
 *  or create a new one. Returns missionId. */
async function ensureMission(args: {
  userId: number;
  brandId: number | null;
  workspace: string;
  taskId: string;
  taskLabel: string;
  tier: string;
}): Promise<number | null> {
  try {
    // Look up by description tag (we store taskId in description as
    // "[task:<taskId>]" since missions has no taskId column). Falls
    // back to title match within (userId, brandId, workspace).
    //
    // 2026-05-17 100s→99s compat: incoming taskId is normalized to the
    // new id (fb-99-…). Legacy missions were tagged with the OLD id
    // (fb-100-…). Match BOTH tags so an existing legacy mission is
    // reused (no orphaned duplicate) — no DB migration needed.
    const newId = normalizeTaskId(args.taskId);
    const legacyId = legacyTaskId(newId);
    const tag = `[task:${newId}]`;
    const legacyTag = legacyId ? `[task:${legacyId}]` : tag;
    const tagsDiffer = legacyTag !== tag;
    const [rows]: any = await localPool.execute(
      `SELECT id FROM missions
        WHERE userId = ?
          AND ${args.brandId ? "brandId = ?" : "brandId IS NULL"}
          AND workspace = ?
          AND (description LIKE ?${tagsDiffer ? " OR description LIKE ?" : ""})
        ORDER BY id DESC LIMIT 1`,
      args.brandId
        ? [args.userId, args.brandId, args.workspace, `%${tag}%`, ...(tagsDiffer ? [`%${legacyTag}%`] : [])]
        : [args.userId, args.workspace, `%${tag}%`, ...(tagsDiffer ? [`%${legacyTag}%`] : [])],
    );
    const existing = (rows as any[])[0];
    if (existing?.id) return Number(existing.id);

    // Create new mission. status enum is (inactive/active/completed/archived) —
    // 2026-05-09 fix: was 'pending' which isn't in the enum → Data truncated
    // → ensureMission silently failed → no outputId → /run navigation broke.
    const [r]: any = await localPool.execute(
      `INSERT INTO missions
         (userId, brandId, workspace, title, description, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [args.userId, args.brandId, args.workspace, args.taskLabel, `${tag} ${args.tier} 任務`],
    );
    const id = Number(r?.insertId ?? 0);
    return id || null;
  } catch (e: any) {
    console.error("[recordTaskRun] ensureMission FAILED", {
      userId: args.userId,
      brandId: args.brandId,
      workspace: args.workspace,
      taskId: args.taskId,
      sqlCode: e?.code,
      sqlMessage: e?.sqlMessage,
      message: String(e?.message ?? e),
    });
    return null;
  }
}

/** Persist a completed task run's output. Non-fatal on error. */
export async function recordTaskRun(rawArgs: RecordArgs): Promise<{ missionId: number | null; outputId: number | null }> {
  // 2026-05-17 (CJ「現在應該沒有100S」): the "100s" tier was fully renamed to
  // "99s" (久久 wordplay) — code + ids. Normalize at this single ingress so
  // every downstream write (mission tag, metadata, DLQ) persists the NEW id
  // even if a legacy caller still passes "fb-100-…" / "100s". Idempotent.
  const args: RecordArgs = {
    ...rawArgs,
    taskId: normalizeTaskId(rawArgs.taskId),
    tier: normalizeTier(rawArgs.tier) as RecordArgs["tier"],
  };
  try {
    const displayTier = args.tier;
    const missionId = await ensureMission({
      userId: args.userId,
      brandId: args.brandId,
      workspace: args.workspace,
      taskId: args.taskId,
      taskLabel: args.taskLabel,
      tier: displayTier as any,
    });
    if (!missionId) {
      // ensureMission failed (already logged inside). Last resort: DLQ
      // so the data isn't lost when admin fixes whatever schema/auth
      // problem is blocking the missions INSERT.
      appendDLQ(args, null, "ensure_mission_failed");
      return { missionId: null, outputId: null };
    }

    // Bump version: count existing outputs for this mission
    const [vRows]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM mission_outputs WHERE missionId = ?`,
      [missionId],
    );
    const version = Number((vRows as any[])[0]?.n ?? 0) + 1;

    const platform = args.platform ?? WORKSPACE_TO_PLATFORM[args.workspace] ?? "other";
    const outputType = args.outputType ?? "post";
    const title = args.title ?? args.taskLabel;

    // 2026-05-14 (CJ「有些任務存到專案的時候，會無法顯示」):
    // INSERT was failing silently for some runs and the catch below
    // returned null missionId/outputId without logging WHY. Tighten:
    //   · cap content + metadata to safe sizes (MEDIUMTEXT = 16MB, but
    //     row-level packet limits + index keys can bite earlier).
    //   · log the actual SQL error (code + sqlMessage) so we can see
    //     which constraint is being violated.
    const MAX_CONTENT = 2_000_000;  // 2MB — generous, well under MEDIUMTEXT
    const MAX_METADATA = 200_000;   // 200KB — enough for variants array
    let safeContent = args.content ?? "";
    if (safeContent.length > MAX_CONTENT) {
      console.warn(`[recordTaskRun] content ${safeContent.length} > ${MAX_CONTENT}, truncating`);
      safeContent = safeContent.slice(0, MAX_CONTENT);
    }
    let metadata = JSON.stringify({
      ...(args.metadata ?? {}),
      taskId: args.taskId,
      tier: displayTier,
      thumbnailUrl: args.thumbnailUrl ?? null,
    });
    if (metadata.length > MAX_METADATA) {
      console.warn(`[recordTaskRun] metadata ${metadata.length} > ${MAX_METADATA}, stripping variants`);
      // Drop the heaviest fields and re-serialize a minimal version
      metadata = JSON.stringify({
        taskId: args.taskId,
        tier: displayTier,
        thumbnailUrl: args.thumbnailUrl ?? null,
        _truncated: true,
        _originalSize: metadata.length,
      });
    }

    // 3-tier defensive INSERT: try the normal payload, then a sanitized
    // version (BMP-only chars, fallback enums), then a minimal placeholder.
    // Whichever tier succeeds, the user gets a card; only the rare case
    // where ALL three fail falls into the JSONL DLQ for offline replay.
    const SAFE_PLATFORMS = new Set(["facebook","instagram","linkedin","youtube","google_ads","email","ppt","doc","script","other"]);
    const SAFE_OUTPUT_TYPES = new Set(["post","story","reel","ad_copy","email_html","slide","script","product_desc","report","other"]);
    const safePlatform = SAFE_PLATFORMS.has(platform) ? platform : "other";
    const safeOutputType = SAFE_OUTPUT_TYPES.has(outputType) ? outputType : "other";

    type InsertAttempt = { tier: string; title: string; content: string; metadata: string; platform: string; outputType: string };
    const attempts: InsertAttempt[] = [
      // Tier 1: as-given (already size-capped above)
      { tier: "normal", title: title.slice(0, 250), content: safeContent, metadata, platform: safePlatform, outputType: safeOutputType },
      // Tier 2: strip non-BMP chars (the most common silent killer:
      // ER_INCORRECT_STRING_VALUE when emoji or 4-byte CJK lands in
      // a utf8 — not utf8mb4 — column)
      { tier: "stripped", title: stripNonBMP(title).slice(0, 250), content: stripNonBMP(safeContent), metadata: stripNonBMP(metadata), platform: safePlatform, outputType: safeOutputType },
      // Tier 3: bare minimum placeholder — guaranteed to fit. User at
      // least gets a card; can click into detail and see the placeholder.
      {
        tier: "minimal",
        title: (stripNonBMP(title).slice(0, 100) || args.taskLabel.slice(0, 100) || "未命名任務"),
        content: "（內容過大或包含資料庫不支援的字元，已暫存為佔位卡片。請從詳情頁查看完整紀錄。）",
        metadata: JSON.stringify({ taskId: args.taskId, tier: displayTier, _recovered: true }),
        platform: "other",
        outputType: "other",
      },
    ];

    let oRes: any = null;
    let lastError: any = null;
    let succeededTier: string | null = null;
    // 2026-05-14: progress defaults to 'done' (single-write callers), or
    // 'caption_ready' for the new async path (caller will UPDATE to 'done'
    // when image gen + QA finish in the background).
    const progress = args.progress ?? "done";
    for (const a of attempts) {
      try {
        [oRes] = await localPool.execute(
          `INSERT INTO mission_outputs
             (missionId, platform, outputType, title, content, metadata, status, version, progress, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, NOW(), NOW())`,
          [missionId, a.platform, a.outputType, a.title, a.content, a.metadata, version, progress],
        );
        succeededTier = a.tier;
        if (a.tier !== "normal") {
          console.warn(`[recordTaskRun] INSERT recovered at tier=${a.tier}`, {
            missionId,
            originalSqlCode: lastError?.code,
            originalSqlMessage: lastError?.sqlMessage,
          });
        }
        break;
      } catch (e: any) {
        lastError = e;
        console.error(`[recordTaskRun] INSERT tier=${a.tier} FAILED`, {
          missionId,
          platform: a.platform,
          outputType: a.outputType,
          titleLen: a.title.length,
          contentLen: a.content.length,
          metadataLen: a.metadata.length,
          sqlCode: e?.code,
          sqlMessage: e?.sqlMessage,
          errno: e?.errno,
          sqlState: e?.sqlState,
        });
      }
    }

    if (!oRes) {
      // All three tiers failed — extraordinarily unlikely (would mean DB
      // is down or mission_outputs schema is fundamentally broken).
      // Persist to the DLQ so the run isn't lost forever and an admin
      // can replay once the underlying issue is fixed.
      appendDLQ(args, missionId, "all_tiers_failed", lastError?.code);
      // The mission row still exists; LEFT JOIN in listAllForUser will
      // surface it as an orphan card so the user knows the task ran.
      return { missionId, outputId: null };
    }
    const outputId = Number(oRes?.insertId ?? 0);

    // Touch mission's updatedAt so /projects sorts it to top
    try {
      await localPool.execute(`UPDATE missions SET updatedAt = NOW() WHERE id = ?`, [missionId]);
    } catch {/* non-fatal */}

    // 2026-05-10: fire-and-forget achievement evaluator + reward grant.
    // Fresh unlocks + reward grants bubble up next time client polls
    // achievements.evaluate (every 90s + on focus). Doesn't block task return.
    Promise.resolve().then(async () => {
      try {
        const { evaluateAndRecord } = await import("./achievements");
        await evaluateAndRecord(args.userId);
      } catch {/* swallow — never break recordTaskRun */}
    });

    return { missionId, outputId: outputId || null };
  } catch (e: any) {
    console.error("[recordTaskRun] unexpected failure", {
      userId: args.userId,
      brandId: args.brandId,
      workspace: args.workspace,
      taskId: args.taskId,
      tier: args.tier,
      sqlCode: e?.code,
      sqlMessage: e?.sqlMessage,
      message: String(e?.message ?? e),
      stack: (e as Error)?.stack,
    });
    appendDLQ(args, null, "unexpected_exception", e?.code);
    return { missionId: null, outputId: null };
  }
}
