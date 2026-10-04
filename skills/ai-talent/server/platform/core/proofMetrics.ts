/**
 * proofMetrics — citable numbers computed from real data only.
 *
 * Built for awards submissions and sales decks: every figure carries its
 * window and sample size (N), and a figure with no data comes back `null`
 * rather than 0 so nobody quotes "0%" when the truth is "not measured yet".
 *
 * Consumers: adminStatsRouter.proofMetrics (admin UI) and
 * scripts/proof-metrics.ts (markdown table for pasting).
 */
import localPool from "../../localDb";
import { featureOfTaskId } from "./ops/genMetrics";

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const ratio = (a: number, b: number): number | null =>
  b > 0 ? Math.round((a / b) * 1000) / 10 : null;
const percentile = (sorted: number[], p: number): number | null =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]! : null;

export interface ProofMetrics {
  windowDays: number;
  generatedAt: string;
  outputs: {
    n: number;
    completionRate: number | null; // progress = 'done'
    revisionRate: number | null; // outputs that are a re-version of another
    approvedOrPublishedRate: number | null;
  };
  timeToFirstValue: { n: number; p50Minutes: number | null; p95Minutes: number | null };
  llm: {
    sampledCalls: number;
    /** Weighted by each row's sampleRate, so sampling doesn't skew it. */
    fallbackRate: number | null;
    medianTotalMs: number | null;
    p95TotalMs: number | null;
  };
  cost: { usd: number; perDoneOutputUsd: number | null };
  /** Wall-clock generation time per output (mission_outputs.metadata.durationMs). */
  generation: {
    n: number;
    p50Ms: number | null;
    p95Ms: number | null;
    byFeature: Array<{ feature: string; n: number; p50Ms: number | null; p95Ms: number | null }>;
  };
  /**
   * How much users change what the AI wrote. `editRate` counts outputs saved
   * with a human edit (metadata.edited, set by outputRouter.updateVariantCaption);
   * only saves made after that flag shipped are visible, so read it with N.
   * `editedOrRevisedRate` also counts re-versioned outputs (version>1 / parent).
   */
  edits: {
    n: number;
    editRate: number | null;
    editedOrRevisedRate: number | null;
    editedN: number;
    medianEditedChars: number | null;
  };
}

export async function computeProofMetrics(days = 30): Promise<ProofMetrics> {
  const d = Math.max(1, Math.min(365, Math.floor(days)));

  const [[o]]: any = await localPool.execute(
    `SELECT COUNT(*) AS n,
            SUM(progress = 'done') AS done,
            SUM(parentOutputId IS NOT NULL) AS revised,
            SUM(status IN ('approved','scheduled','published')) AS adopted
       FROM mission_outputs
      WHERE createdAt >= NOW() - INTERVAL ${d} DAY`,
  );

  const [ttfv]: any = await localPool.execute(
    `SELECT TIMESTAMPDIFF(MINUTE, u.createdAt, MIN(mo.createdAt)) AS mins
       FROM users u
       JOIN missions m ON m.userId = u.id
       JOIN mission_outputs mo ON mo.missionId = m.id
      WHERE u.createdAt >= NOW() - INTERVAL ${d} DAY
      GROUP BY u.id, u.createdAt
     HAVING mins IS NOT NULL AND mins >= 0
      ORDER BY mins ASC`,
  );
  const mins = (ttfv as any[]).map((r) => num(r.mins));

  // llm.attempts rows are written by llmRouter (info level, sampled).
  const [llmRows]: any = await localPool.execute(
    `SELECT JSON_EXTRACT(meta, '$.fellBack') AS fell,
            JSON_EXTRACT(meta, '$.totalMs') AS ms,
            JSON_EXTRACT(meta, '$.sampleRate') AS sr
       FROM error_log
      WHERE source = 'llm.attempts' AND level = 'info'
        AND createdAt >= NOW() - INTERVAL ${d} DAY`,
  );
  let wAll = 0;
  let wFell = 0;
  const totals: number[] = [];
  for (const r of llmRows as any[]) {
    const w = 1 / Math.max(0.01, num(r.sr) || 1);
    wAll += w;
    if (String(r.fell) === "true" || r.fell === 1) wFell += w;
    totals.push(num(r.ms));
  }
  totals.sort((a, b) => a - b);

  let usd = 0;
  try {
    const [[c]]: any = await localPool.execute(
      `SELECT COALESCE(SUM(costUsd), 0) AS usd FROM usage_log WHERE ts >= NOW() - INTERVAL ${d} DAY`,
    );
    usd = num(c.usd);
  } catch {
    /* usage_log absent in some environments — report 0 spend, not an error */
  }

  // ── generation duration + edits (metadata JSON; absent on old rows) ──────
  const genMs: number[] = [];
  const byFeature = new Map<string, number[]>();
  try {
    const [genRows]: any = await localPool.execute(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.genTaskId')) AS taskId,
              JSON_EXTRACT(metadata, '$.durationMs') AS ms
         FROM mission_outputs
        WHERE createdAt >= NOW() - INTERVAL ${d} DAY
          AND JSON_EXTRACT(metadata, '$.durationMs') IS NOT NULL`,
    );
    for (const r of genRows as any[]) {
      const ms = num(r.ms);
      if (ms <= 0) continue;
      genMs.push(ms);
      const f = featureOfTaskId(r.taskId);
      (byFeature.get(f) ?? byFeature.set(f, []).get(f)!).push(ms);
    }
  } catch {
    /* metadata not JSON-queryable in this environment — report "not measured" */
  }
  genMs.sort((a, b) => a - b);

  let editedN = 0;
  let editedOrRevised = 0;
  let editTotal = 0;
  const editChars: number[] = [];
  try {
    const [editRows]: any = await localPool.execute(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.edited')) AS edited,
              JSON_EXTRACT(metadata, '$.editedChars') AS chars,
              (COALESCE(version, 1) > 1 OR parentOutputId IS NOT NULL) AS revised
         FROM mission_outputs
        WHERE createdAt >= NOW() - INTERVAL ${d} DAY`,
    );
    for (const r of editRows as any[]) {
      editTotal++;
      const edited = String(r.edited) === "true";
      if (edited) {
        editedN++;
        if (r.chars !== null && r.chars !== undefined) editChars.push(num(r.chars));
      }
      if (edited || num(r.revised) > 0) editedOrRevised++;
    }
  } catch {
    /* same: leave as not measured */
  }
  editChars.sort((a, b) => a - b);

  const n = num(o.n);
  const done = num(o.done);
  return {
    windowDays: d,
    generatedAt: new Date().toISOString(),
    outputs: {
      n,
      completionRate: ratio(done, n),
      revisionRate: ratio(num(o.revised), n),
      approvedOrPublishedRate: ratio(num(o.adopted), n),
    },
    timeToFirstValue: { n: mins.length, p50Minutes: percentile(mins, 0.5), p95Minutes: percentile(mins, 0.95) },
    llm: {
      sampledCalls: totals.length,
      fallbackRate: wAll > 0 ? Math.round((wFell / wAll) * 1000) / 10 : null,
      medianTotalMs: percentile(totals, 0.5),
      p95TotalMs: percentile(totals, 0.95),
    },
    cost: { usd: Math.round(usd * 100) / 100, perDoneOutputUsd: done > 0 ? Math.round((usd / done) * 1000) / 1000 : null },
    generation: {
      n: genMs.length,
      p50Ms: percentile(genMs, 0.5),
      p95Ms: percentile(genMs, 0.95),
      byFeature: [...byFeature.entries()]
        .map(([feature, v]) => {
          v.sort((a, b) => a - b);
          return { feature, n: v.length, p50Ms: percentile(v, 0.5), p95Ms: percentile(v, 0.95) };
        })
        .sort((a, b) => b.n - a.n),
    },
    edits: {
      n: editTotal,
      editRate: ratio(editedN, editTotal),
      editedOrRevisedRate: ratio(editedOrRevised, editTotal),
      editedN,
      medianEditedChars: percentile(editChars, 0.5),
    },
  };
}
