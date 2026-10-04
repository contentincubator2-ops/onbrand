/**
 * editTracking — measurable "did the user edit the AI draft" signal.
 *
 * Applied at the save path for a variant caption. A save counts as a human
 * edit only when it is neither an agent switch nor an AI rewrite (those two
 * carry `writer` / `regulationCompliance`), and the text actually changed.
 * The flag lives in mission_outputs.metadata (no migration):
 *   edited: true, editedChars: abs length delta of the most recent edit,
 *   editedCharsTotal: running sum, editCount.
 * editedChars uses |len(after) - len(before)|: a cheap proxy that undercounts
 * same-length rewrites but needs no diff library; a pure replacement of equal
 * length still sets edited:true with editedChars 0.
 */

export function isHumanEdit(input: { writer?: unknown; regulationCompliance?: unknown }): boolean {
  return !input.writer && !input.regulationCompliance;
}

export function applyEditMarker(
  metadata: Record<string, any> | null | undefined,
  before: string,
  after: string,
): Record<string, any> | null {
  if (before === after) return null; // nothing changed -> not an edit
  const md: Record<string, any> = metadata && typeof metadata === "object" ? { ...metadata } : {};
  const delta = Math.abs(after.length - before.length);
  md.edited = true;
  md.editedChars = delta;
  md.editedCharsTotal = (Number(md.editedCharsTotal) || 0) + delta;
  md.editCount = (Number(md.editCount) || 0) + 1;
  return md;
}
