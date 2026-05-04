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

export const feedbackRouter = router({
  /**
   * Save (insert) a note for a mission.
   * SEC-B-05 (2026-05-04): changed from publicProcedure → protectedProcedure.
   * Anyone with a missionId could previously write arbitrary notes (vandalism
   * + storage abuse vector). The notes table also has no per-user scope, so
   * audit ownership is not enforced — flagged for follow-up (S-02 audit log).
   */
  saveNote: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      category:  z.enum(["strategy", "copy", "visual"]).default("strategy"),
      text:      z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any)?.user?.id ?? null;
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
   * SEC-B-05: protected so callers can't enumerate notes for arbitrary missionIds.
   */
  listNotes: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ input }) => {
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
