/**
 * publishGate — the one rule for "may this output go out?".
 *
 * An output may be published only after a reviewer approved it. Before
 * 2026-10-04 the calendar path blocked outputs that were *in* review but let
 * through ones that were never submitted, and publishRouter.toFacebook checked
 * nothing, so review and publish were two unrelated steps.
 *
 * Source of truth is the newest mission_review_queue row; when there is none,
 * mission_outputs.status = 'approved' (set by review sync) is accepted.
 * Solo users (nobody else in their workspace who could review: no other
 * owner/admin) publish directly — there is no one to approve, so requiring it
 * would only lock them out (CJ 2026-10-04「單人使用就不用核准」).
 *
 * Approval is NOT revoked by editing the text afterwards — editing and
 * rescheduling stay possible until the post actually goes out.
 */
export type ApprovalState = "approved" | "in_review" | "revision_requested" | "not_submitted";

interface Queryable {
  execute: (sql: string, params?: any) => Promise<any>;
}

/** True when no other owner/admin shares a workspace with this user. Fails closed (not solo) if the lookup errors. */
export async function isSoloUser(pool: Queryable, userId: number): Promise<boolean> {
  try {
    const [rows]: any = await pool.execute(
      `SELECT 1 FROM workspace_members me
         JOIN workspace_members other ON other.workspaceId = me.workspaceId
        WHERE me.userId = ? AND other.userId <> ? AND other.role IN ('owner','admin')
        LIMIT 1`,
      [userId, userId],
    );
    return (rows as any[]).length === 0;
  } catch {
    return false;
  }
}

/**
 * May `actorId` publish a post that `ownerId` owns?
 * The owner always may; otherwise the actor must be an owner/admin of a
 * workspace the owner belongs to (same join as reviewRouter.canApprove). This
 * only decides *who may press publish* — the approval gate still applies.
 * Fails closed when the lookup errors. Viewer-role blocking is assertCanAct's job.
 */
export async function canPublishFor(pool: Queryable, actorId: number, ownerId: number): Promise<boolean> {
  if (actorId === ownerId) return true;
  try {
    const [rows]: any = await pool.execute(
      `SELECT 1 FROM workspace_members me
         JOIN workspace_members own ON own.workspaceId = me.workspaceId
        WHERE me.userId = ? AND me.role IN ('owner','admin') AND own.userId = ?
        LIMIT 1`,
      [actorId, ownerId],
    );
    return (rows as any[]).length > 0;
  } catch {
    return false;
  }
}

/** ownerId: the user publishing (or owning the scheduled post); solo users skip review. */
export async function outputApprovalState(pool: Queryable, outputId: number, ownerId?: number): Promise<ApprovalState> {
  if (ownerId && (await isSoloUser(pool, ownerId))) return "approved";
  const [rv]: any = await pool.execute(
    `SELECT status FROM mission_review_queue WHERE outputId = ? ORDER BY id DESC LIMIT 1`,
    [outputId],
  );
  const q = String((rv as any[])[0]?.status ?? "");
  if (q === "approved") return "approved";
  if (q === "pending" || q === "in_review") return "in_review";
  if (q === "revision_requested") return "revision_requested";

  const [ov]: any = await pool.execute(`SELECT status FROM mission_outputs WHERE id = ? LIMIT 1`, [outputId]);
  return String((ov as any[])[0]?.status ?? "") === "approved" ? "approved" : "not_submitted";
}

export const APPROVAL_BLOCK_MESSAGE: Record<Exclude<ApprovalState, "approved">, string> = {
  in_review: "這篇還在審核中，放行後才能發布",
  revision_requested: "這篇被退回修改，改好再送審、放行後才能發布",
  not_submitted: "這篇還沒核准。請先送審並核准，核准後才能發布",
};
