/**
 * feedbackRouter — mission feedback notes (tRPC).
 *
 * Notes are freeform text the user writes in the right FeedbackPanel
 * while reviewing squad output. Persisted to mission_feedback_notes table
 * (auto-created on first use).
 *
 * tRPC procedures:
 *   feedback.saveNote    — upsert a note (category × missionId)
 *   feedback.listNotes   — get all notes for a mission
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc.js";
import localPool from "../localDb.js";

// Ensure table exists (idempotent — called at module load)
async function ensureTable() {
  await localPool.execute(`
    CREATE TABLE IF NOT EXISTS mission_feedback_notes (
      id          INT          NOT NULL AUTO_INCREMENT,
      mission_id  INT          NOT NULL,
      category    VARCHAR(32)  NOT NULL DEFAULT 'strategy',
      text        TEXT         NOT NULL,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_feedback_mission (mission_id),
      KEY idx_feedback_cat    (mission_id, category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => { /* already exists */ });
}
ensureTable();

/**
 * SEC-B-05 v2 (2026-05-05): assert the caller owns the given mission.
 * Throws TRPCError("FORBIDDEN") if not. Used by saveNote + listNotes.
 */
async function assertMissionOwner(userId: number | null, missionId: number): Promise<void> {
  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login required" });
  }
  const [rows]: any = await localPool.execute(
    "SELECT userId FROM missions WHERE id = ? LIMIT 1",
    [missionId],
  );
  const row = (rows as any[])?.[0];
  if (!row) {
    // Don't leak whether the mission exists — generic forbidden
    throw new TRPCError({ code: "FORBIDDEN", message: "Not allowed" });
  }
  if (Number(row.userId) !== Number(userId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not allowed" });
  }
}

export const feedbackRouter = router({
  /**
   * Save (insert) a note for a mission.
   * SEC-B-05 v1: changed from publicProcedure → protectedProcedure.
   * SEC-B-05 v2: also asserts the caller owns the mission (no horizontal
   * privilege escalation — previously any authenticated user could write
   * notes against any missionId).
   */
  saveNote: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      category:  z.enum(["strategy", "copy", "visual"]).default("strategy"),
      text:      z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any)?.user?.id ?? null;
      await assertMissionOwner(userId, input.missionId);
      await localPool.execute(
        `INSERT INTO mission_feedback_notes (mission_id, category, text, user_id)
         VALUES (?, ?, ?, ?)`,
        [input.missionId, input.category, input.text, userId]
      ).catch(async () => {
        // Fallback if user_id column doesn't exist yet (older schema)
        await localPool.execute(
          `INSERT INTO mission_feedback_notes (mission_id, category, text)
           VALUES (?, ?, ?)`,
          [input.missionId, input.category, input.text]
        );
      });
      return { ok: true };
    }),

  /**
   * List all notes for a mission, newest first.
   * SEC-B-05 v2: ownership scope enforced.
   */
  listNotes: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = (ctx as any)?.user?.id ?? null;
      await assertMissionOwner(userId, input.missionId);
      const [rows]: any = await localPool.execute(
        `SELECT id, category, text, created_at
           FROM mission_feedback_notes
          WHERE mission_id = ?
          ORDER BY created_at DESC`,
        [input.missionId]
      );
      return rows as Array<{
        id: number;
        category: string;
        text: string;
        created_at: string;
      }>;
    }),
});
