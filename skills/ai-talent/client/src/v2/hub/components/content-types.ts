/** Content page — types inferred from the hub router (type-only import). */
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../server/routers";

type Outputs = inferRouterOutputs<AppRouter>;
export type ContentData = Outputs["hub"]["admin"]["content"];
export type Skill = ContentData["skills"][number];
export type Pack = ContentData["packs"][number];
export type RepRow = Outputs["hub"]["admin"]["reps"][number];
export type DraftCheck = Outputs["hub"]["rep"]["checkDraft"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO timestamp → "Sep 16, 2026". */
export function shortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Rough, human-readable view of a blocked-wording regex:
 * `\b(the )?(cheapest|lowest[- ]priced?)\b` → "(the) (cheapest / lowest-price(d))".
 * Top-level alternatives come back as separate entries.
 */
export function readablePattern(source: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      cur += ch + (source[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "|" && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);

  return parts
    .map((p) =>
      p
        .replace(/\\b/g, "")
        .replace(/\(\?<?[!=][^)]*\)/g, "") // lookarounds
        .replace(/\(\?:/g, "(")
        .replace(/\\s[?*]/g, "")
        .replace(/\\s\+?/g, " ")
        .replace(/\[([^\]])[^\]]*\]/g, "$1") // [- ] → -
        .replace(/\(([^()]*?)(\s*)\)\?/g, "($1)$2") // optional group, keeps the trailing space
        .replace(/([\p{L}\p{N}])\?/gu, "($1)") // optional char: priced? → price(d)
        .replace(/\\(.)/g, "$1")
        .replace(/\|/g, " / ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean);
}
