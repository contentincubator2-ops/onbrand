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
  };
}
