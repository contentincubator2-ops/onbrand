/**
 * boardroomValidator.ts
 *
 * Server-side validator for the Boardroom quality contract. Runs AFTER
 * the agent's streamed output is complete, BEFORE persisting to DB.
 *
 * Checks the four required markers (methodology anchor, confidence
 * declaration, at least one [N] citation or [ASSUMPTION] tag, ## Sources
 * section) and appends a diagnostic banner when any is missing. The
 * banner itself is valid Boardroom markup — the frontend's
 * BoardroomMessageRenderer will render it as an UNSUPPORTED confidence
 * pill, which is the visible forcing function for upgrading weak squads.
 *
 * Does NOT block saves or rewrite the agent output — only appends.
 */

export interface BoardroomCheck {
  hasMethodology: boolean;
  hasConfidence: boolean;
  hasCitationOrAssumption: boolean;
  hasSources: boolean;
  missing: string[];
}

/**
 * Run all four contract checks on a completed agent output.
 */
export function checkBoardroomContract(output: string): BoardroomCheck {
  const hasMethodology =
    /^>\s*\*\*Methodology\*\*\s*[:：]/im.test(output);
  const hasConfidence =
    /^>\s*\*\*Confidence\*\*\s*[:：]\s*(HIGH|MEDIUM|LOW|UNSUPPORTED)/im.test(
      output,
    );
  const hasCitationOrAssumption =
    /\[\d+\]|\[ASSUMPTION\]/.test(output);
  const hasSources = /^##\s+Sources\s*[:：]?\s*$/im.test(output);

  const missing: string[] = [];
  if (!hasMethodology) missing.push("Methodology anchor");
  if (!hasConfidence) missing.push("Confidence declaration");
  if (!hasCitationOrAssumption) missing.push("Inline [N] / [ASSUMPTION]");
  if (!hasSources) missing.push("## Sources section");

  return {
    hasMethodology,
    hasConfidence,
    hasCitationOrAssumption,
    hasSources,
    missing,
  };
}

/**
 * Append a Boardroom diagnostic banner to the end of an output when
 * one or more contract markers are missing. Returns the enriched output.
 *
 * If all markers are present, returns the original output unchanged.
 */
export function applyBoardroomDiagnostic(
  output: string,
  context: {
    squadMethodology?: string;
    squadMethodologyAuthor?: string;
    squadMethodologyYear?: number;
    isStressTest?: boolean;
  } = {},
): { output: string; check: BoardroomCheck; appliedFallback: boolean } {
  const check = checkBoardroomContract(output);

  // All good — no intervention needed
  if (check.missing.length === 0) {
    return { output, check, appliedFallback: false };
  }

  const methodLabel =
    context.squadMethodology && context.squadMethodologyAuthor
      ? `${context.squadMethodology} — ${context.squadMethodologyAuthor}${
          context.squadMethodologyYear ? `（${context.squadMethodologyYear}）` : ""
        }`
      : context.squadMethodology ?? "（方法論未標示）";

  // Build a minimal fallback block that patches missing pieces
  const patches: string[] = [];

  // If methodology anchor is missing, prepend (but don't duplicate if
  // partial output starts with `##` we append at top-of-body region)
  if (!check.hasMethodology) {
    patches.push(
      "",
      `> **Methodology**: ${methodLabel}`,
    );
  }
  if (!check.hasConfidence) {
    patches.push(
      `> **Confidence**: UNSUPPORTED — 本次輸出缺少 Boardroom 契約標記，已標記為低信心；請調整 squad 方法論或補充資料後重跑。`,
    );
  }
  if (!check.hasCitationOrAssumption) {
    patches.push(
      "",
      `_本次分析沒有引用任何外部數據來源 [ASSUMPTION]，所有結論皆屬判斷性質。_`,
    );
  }
  if (!check.hasSources) {
    patches.push(
      "",
      "## Sources",
      `[1] 本步驟未提供具體來源 — 建議串接 GA / FB Ads / octolens 以取得可驗證數據。`,
    );
  }

  // Insert patches depending on what was missing.
  // Strategy: methodology + confidence go at the TOP of the body (after
  // the first ## heading if present, else at very top); assumptions +
  // sources go at the BOTTOM.
  let enriched = output;

  const needsTop = !check.hasMethodology || !check.hasConfidence;
  const needsBottom = !check.hasCitationOrAssumption || !check.hasSources;

  if (needsTop) {
    const topPatch = patches
      .filter((l) =>
        l.startsWith("> **Methodology") ||
        l.startsWith("> **Confidence") ||
        l === "",
      )
      .join("\n");
    // Insert after first ## heading if any; else prepend
    const firstH2 = enriched.match(/^##\s+.+$/m);
    if (firstH2) {
      const idx = enriched.indexOf(firstH2[0]) + firstH2[0].length;
      enriched =
        enriched.slice(0, idx) + "\n" + topPatch + enriched.slice(idx);
    } else {
      enriched = topPatch + "\n\n" + enriched;
    }
  }

  if (needsBottom) {
    const bottomPatch = patches
      .filter((l) => !l.startsWith("> **"))
      .join("\n");
    enriched = enriched.trimEnd() + "\n\n" + bottomPatch + "\n";
  }

  return { output: enriched, check, appliedFallback: true };
}
