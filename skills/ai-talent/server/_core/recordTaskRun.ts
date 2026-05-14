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

type Platform = "facebook" | "instagram" | "linkedin" | "youtube" | "google_ads" | "email" | "ppt" | "doc" | "script" | "other";
type OutputType = "post" | "story" | "reel" | "ad_copy" | "email_html" | "slide" | "script" | "product_desc" | "report" | "other";

interface RecordArgs {
  userId: number;
  brandId: number | null;
  workspace: string;          // e.g. "facebook" / "instagram" / "theater" / "youtube"
  taskId: string;             // e.g. "fb-30-single-post" / "ig-60-carousel"
  taskLabel: string;          // human-readable; e.g. "FB 短貼文 (介紹)"
  tier: "30s" | "60s" | "100s" | "theater";
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
    const tag = `[task:${args.taskId}]`;
    const [rows]: any = await localPool.execute(
      `SELECT id FROM missions
        WHERE userId = ?
          AND ${args.brandId ? "brandId = ?" : "brandId IS NULL"}
          AND workspace = ?
          AND description LIKE ?
        ORDER BY id DESC LIMIT 1`,
      args.brandId
        ? [args.userId, args.brandId, args.workspace, `%${tag}%`]
        : [args.userId, args.workspace, `%${tag}%`],
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
export async function recordTaskRun(args: RecordArgs): Promise<{ missionId: number | null; outputId: number | null }> {
  try {
    // 2026-05-13 (CJ「現在應該沒有100S」): user-facing tier label is now
    // "99s" (久久 wordplay). Internal orchestra config keys still use
    // "100s" to avoid touching every config map; we normalize at the
    // single boundary where the tier hits the DB.
    const displayTier = args.tier === "100s" ? "99s" : args.tier;
    const missionId = await ensureMission({
      userId: args.userId,
      brandId: args.brandId,
      workspace: args.workspace,
      taskId: args.taskId,
      taskLabel: args.taskLabel,
      tier: displayTier as any,
    });
    if (!missionId) return { missionId: null, outputId: null };

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

    let oRes: any;
    try {
      [oRes] = await localPool.execute(
        `INSERT INTO mission_outputs
           (missionId, platform, outputType, title, content, metadata, status, version, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, NOW(), NOW())`,
        [missionId, platform, outputType, title.slice(0, 250), safeContent, metadata, version],
      );
    } catch (e: any) {
      // Surface the real SQL error so we can diagnose. Common culprits:
      //   ER_DATA_TOO_LONG, ER_TRUNCATED_WRONG_VALUE (enum mismatch),
      //   ER_INCORRECT_STRING_VALUE (4-byte emoji into utf8 column),
      //   ER_NET_PACKET_TOO_LARGE.
      console.error("[recordTaskRun] INSERT mission_outputs FAILED", {
        missionId,
        platform,
        outputType,
        titleLen: (title ?? "").length,
        contentLen: safeContent.length,
        metadataLen: metadata.length,
        sqlCode: e?.code,
        sqlMessage: e?.sqlMessage,
        errno: e?.errno,
        sqlState: e?.sqlState,
        message: String(e?.message ?? e),
      });
      // Don't return — fall through. outputId will be null, but the
      // mission row exists and the LEFT JOIN in listAllForUser will
      // still surface it as an orphan card so the user knows something
      // happened.
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
    return { missionId: null, outputId: null };
  }
}
