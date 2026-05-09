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
  } catch (e) {
    console.warn("[recordTaskRun] ensureMission failed:", (e as Error).message);
    return null;
  }
}

/** Persist a completed task run's output. Non-fatal on error. */
export async function recordTaskRun(args: RecordArgs): Promise<{ missionId: number | null; outputId: number | null }> {
  try {
    const missionId = await ensureMission({
      userId: args.userId,
      brandId: args.brandId,
      workspace: args.workspace,
      taskId: args.taskId,
      taskLabel: args.taskLabel,
      tier: args.tier,
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
    const metadata = JSON.stringify({
      ...(args.metadata ?? {}),
      taskId: args.taskId,
      tier: args.tier,
      thumbnailUrl: args.thumbnailUrl ?? null,
    });

    const [oRes]: any = await localPool.execute(
      `INSERT INTO mission_outputs
         (missionId, platform, outputType, title, content, metadata, status, version, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, NOW(), NOW())`,
      [missionId, platform, outputType, title.slice(0, 250), args.content, metadata, version],
    );
    const outputId = Number(oRes?.insertId ?? 0);

    // Touch mission's updatedAt so /projects sorts it to top
    try {
      await localPool.execute(`UPDATE missions SET updatedAt = NOW() WHERE id = ?`, [missionId]);
    } catch {/* non-fatal */}

    return { missionId, outputId: outputId || null };
  } catch (e) {
    console.warn("[recordTaskRun] failed:", (e as Error).message);
    return { missionId: null, outputId: null };
  }
}
