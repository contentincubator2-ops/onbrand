/**
 * SupportDrawer.types.ts — shared types for Mia support surface.
 *
 * Extracted from SupportDrawer.tsx so other modules (miaNudgeCatalog,
 * miaNudges) can import MiaAction without dragging in the whole drawer
 * component graph.
 *
 * 2026-06-12: extracted as part of the Mia contextual-nudge refactor.
 */

/**
 * Action button rendered under a Mia message. When the user clicks it,
 * the drawer executes the corresponding navigation or task-open flow.
 *
 * `auto?: true` (legacy field) means the action would fire on its own
 * after a countdown — the new nudge system uses click-only by default,
 * so `auto` is treated as optional metadata not behaviour.
 */
export type MiaAction =
  | {
      kind: "navigate";
      url: string;
      label: string;
      auto?: boolean;
    }
  | {
      kind: "open_task";
      tier: "30s" | "60s" | "99s";
      topic?: string;
      label: string;
      auto?: boolean;
    };

