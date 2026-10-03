/**
 * proof-metrics — print citable product numbers as a markdown table.
 *
 *   npx tsx scripts/proof-metrics.ts --days 90
 *
 * Read-only. Every row shows its N; "—" means "not measured yet", never zero.
 * Run it on the environment whose data you intend to cite (it reads the DB
 * named by the usual env vars), and quote the printed date with the numbers.
 */
import "dotenv/config";
import { computeProofMetrics } from "../server/platform/core/proofMetrics";

const arg = process.argv.indexOf("--days");
const days = arg > -1 ? Number(process.argv[arg + 1]) || 30 : 30;

const f = (v: number | null, unit = "") => (v === null ? "—" : `${v}${unit}`);

computeProofMetrics(days)
  .then((m) => {
    const rows: [string, string, string][] = [
      ["Outputs generated", String(m.outputs.n), "mission_outputs"],
      ["Completion rate", f(m.outputs.completionRate, "%"), `N=${m.outputs.n}`],
      ["Revision rate (re-versioned)", f(m.outputs.revisionRate, "%"), `N=${m.outputs.n}`],
      ["Approved / scheduled / published", f(m.outputs.approvedOrPublishedRate, "%"), `N=${m.outputs.n}`],
      ["Time to first output, median", f(m.timeToFirstValue.p50Minutes, " min"), `N=${m.timeToFirstValue.n} signups`],
      ["Time to first output, p95", f(m.timeToFirstValue.p95Minutes, " min"), `N=${m.timeToFirstValue.n} signups`],
      ["LLM fallback rate", f(m.llm.fallbackRate, "%"), `sampled calls=${m.llm.sampledCalls}`],
      ["LLM call time, median", f(m.llm.medianTotalMs, " ms"), `sampled calls=${m.llm.sampledCalls}`],
      ["LLM call time, p95", f(m.llm.p95TotalMs, " ms"), `sampled calls=${m.llm.sampledCalls}`],
      ["LLM spend", `$${m.cost.usd}`, "usage_log"],
      ["Spend per completed output", m.cost.perDoneOutputUsd === null ? "—" : `$${m.cost.perDoneOutputUsd}`, ""],
    ];
    console.log(`\nonBrand proof metrics — last ${m.windowDays} days, measured ${m.generatedAt.slice(0, 10)}\n`);
    console.log("| Metric | Value | Basis |\n|---|---|---|");
    for (const [a, b, c] of rows) console.log(`| ${a} | ${b} | ${c} |`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("proof-metrics failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
