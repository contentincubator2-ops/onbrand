/**
 * Sales Hub demo seed.
 *
 *   tsx scripts/hub-seed.ts                 tables + positioning, facts, skills, solutions, reps
 *   tsx scripts/hub-seed.ts --reset         wipe the org's hub_* rows first
 *   tsx scripts/hub-seed.ts --samples       generate real sample posts (LLM) used by the backfill
 *   tsx scripts/hub-seed.ts --backfill      21 days of synthetic history (needs samples)
 */
import "../server/bootstrap-env";

const args = new Set(process.argv.slice(2));

const { seedHub, backfillHistory } = await import("../server/strategy/core/hub/hubSeed");
const { getOrg, listReps, listSolutions, exec, q } = await import("../server/platform/core/hub/hubStore");

const seeded = await seedHub({ reset: args.has("--reset") });
console.log("[hub-seed] seeded", seeded);

if (args.has("--samples")) {
  const { generateRepPost } = await import("../server/content/core/hub/generateRepPost");
  const org = await getOrg();
  const reps = await listReps(org.id);
  const solutions = await listSolutions(org.id);
  const tw = reps.find((r) => r.market === "TW")!;
  const us = reps.find((r) => r.market === "US")!;
  const byslug = (s: string) => solutions.find((x) => x.slug === s)!;
  const plan: Array<[typeof tw, string, "facebook" | "linkedin" | "instagram" | "line", string]> = [
    [tw, "asus-daas", "facebook", "owner-pain-story"],
    [tw, "zynkr", "linkedin", "market-insight"],
    [tw, "lightning-order", "line", "owner-pain-story"],
    [tw, "gogoform", "instagram", "solution-spotlight"],
    [tw, "asus-ais-smart-scheduling", "facebook", "subsidy-explainer"],
    [us, "zynkr", "linkedin", "ai-myth-buster"],
    [us, "asus-daas", "linkedin", "market-insight"],
    [us, "lightning-order", "instagram", "solution-spotlight"],
  ];
  const existing = await q(`SELECT COUNT(*) n FROM hub_posts WHERE org_id = ? AND source = 'sample'`, [org.id]);
  if (Number(existing[0]?.n ?? 0) >= plan.length && !args.has("--force-samples")) {
    console.log("[hub-seed] samples already exist — pass --force-samples to regenerate");
  } else {
    await exec(`DELETE FROM hub_posts WHERE org_id = ? AND source = 'sample'`, [org.id]);
    for (const [rep, slug, channel, skillSlug] of plan) {
      const post = await generateRepPost({ repId: rep.id, solutionId: byslug(slug).id, channel, skillSlug, source: "web" });
      await exec(`UPDATE hub_posts SET source = 'sample', is_demo = 1, created_at = NOW(3) - INTERVAL 22 DAY WHERE id = ?`, [post.postId]);
      console.log(`[hub-seed] sample ${rep.market} ${channel} ${slug}: ${post.compliance.verdict} (${post.latencyMs}ms)`);
    }
  }
}

if (args.has("--backfill")) {
  console.log("[hub-seed] backfill", await backfillHistory());
}

process.exit(0);
