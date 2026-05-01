/**
 * patch-squad-557-mockups — add outputKind + mockupVariant to legacy
 * GaryVee Jab squad #557. The squad pre-dates the governance layer
 * so its 8 steps have neither field set.
 *
 * Mapping (per CJ's mockup catalog):
 *   - 策略規劃 / 思考類       → text_strategic / ResearchPanelMockup
 *   - 文案 / 廣告出擊         → text_content   / FBPostBriefMockup
 *   - 視覺素材 (image)        → image_brief    / FBPostBriefMockup
 *   - 視覺素材 (video)        → video_brief    / FBPostBriefMockup
 *
 * Idempotent — re-runs just rewrite same JSON.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

interface Patch {
  match: (s: any) => boolean;
  outputKind: string;
  mockupVariant: string;
}

const PATCHES: Patch[] = [
  // Order matters — most-specific first.
  { match: (s) => /\(video\)/i.test(s.name),  outputKind: "video_brief",     mockupVariant: "FBPostBriefMockup" },
  { match: (s) => /\(image\)/i.test(s.name),  outputKind: "image_brief",     mockupVariant: "FBPostBriefMockup" },
  { match: (s) => /視覺素材/.test(s.name),     outputKind: "image_brief",     mockupVariant: "FBPostBriefMockup" },
  { match: (s) => /策略規劃|策略|規劃/.test(s.name), outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup" },
  { match: (s) => /文案|廣告出擊|貼文/.test(s.name), outputKind: "text_content",   mockupVariant: "FBPostBriefMockup" },
];

function defaultDataReq(outputKind: string) {
  if (outputKind === "image_brief" || outputKind === "video_brief") {
    return { minUrls: 0, minChars: 0 };
  }
  return { minUrls: 0, minChars: 0 };
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  const [sq]: any = await pool.execute(`SELECT id, slug, steps FROM squads WHERE id = 557 LIMIT 1`);
  const row = (sq as any[])?.[0];
  if (!row) { console.error("squad 557 not found"); await pool.end(); process.exit(1); }
  const steps = typeof row.steps === "string" ? JSON.parse(row.steps) : row.steps;
  if (!Array.isArray(steps)) { console.error("steps not array"); await pool.end(); process.exit(1); }

  console.log(`Patching squad #${row.id} ${row.slug} (${steps.length} steps)\n`);
  let patched = 0;
  for (const s of steps) {
    if (s.mockupVariant && s.outputKind) {
      console.log(`  ↪ step ${s.order} "${s.name}" already has both fields — skipping`);
      continue;
    }
    const hit = PATCHES.find((p) => p.match(s));
    if (!hit) {
      // Fallback — generic content
      s.outputKind = s.outputKind || "text_content";
      s.mockupVariant = s.mockupVariant || "FBPostBriefMockup";
      console.log(`  ⚠ step ${s.order} "${s.name}": no rule matched, used fallback (text_content / FBPostBriefMockup)`);
    } else {
      s.outputKind = s.outputKind || hit.outputKind;
      s.mockupVariant = s.mockupVariant || hit.mockupVariant;
      console.log(`  ✓ step ${s.order} "${s.name}": ${s.outputKind} / ${s.mockupVariant}`);
    }
    // Backfill governance attrs if entirely empty
    if (!s.dataRequirements) s.dataRequirements = defaultDataReq(s.outputKind);
    if (!s.userInputFields) s.userInputFields = [];
    if (!s.storageTarget) s.storageTarget = `mission_step_progress.canonical_message[step=${s.order}]`;
    if (!("reviewerAgentId" in s)) s.reviewerAgentId = null;
    if (!s.aiModel) {
      s.aiModel = s.outputKind === "image_brief" || s.outputKind === "video_brief"
        ? "claude-sonnet-4-5"
        : "claude-opus-4-6";
    }
    patched++;
  }
  if (patched > 0) {
    await pool.execute(`UPDATE squads SET steps = ? WHERE id = 557`, [JSON.stringify(steps)]);
    console.log(`\n✓ Wrote ${patched} patched step(s) back to squad #557`);
  } else {
    console.log(`\n  All steps already had mockupVariant — no changes`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
