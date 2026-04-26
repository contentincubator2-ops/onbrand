/**
 * apply-multimedia-upgrades.ts
 *
 * Reads data/multimedia-upgrade-proposals.json (produced by
 * llm-reclassify-outputtypes.ts) and rewrites each affected squad's
 * `steps` JSON so a single image/video/audio/multi step becomes
 * 2–3 concrete sub-steps with proper tool + outputType:
 *
 *   multi  → {ot}_caption (text, gpt-4o)
 *            {ot}_image   (image, fal/flux-pro-1.1)
 *            {ot}_video   (video, fal/kling-2)
 *   image  → {ot}_image   (image, fal/flux-pro-1.1)
 *   video  → {ot}_video   (video, fal/kling-2)
 *   audio  → {ot}_audio   (audio, fal/elevenlabs-tts)
 *
 * Preserves the original step's `name`, `requiredSkills`, `assignedAgentId`
 * across all sub-steps and renumbers `order` so the workflow stays
 * sequential. Original step is replaced in-place.
 *
 * Idempotent guard: if a step's outputType already ends in
 * `_image`/`_video`/`_audio`/`_caption` we assume it's already split
 * and skip.
 *
 * Flags:
 *   --dry-run   show planned mutations, do not UPDATE
 *   --squad N   only this squad id (for smoke test)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROPOSALS_PATH = resolve(__dirname, "../data/multimedia-upgrade-proposals.json");
const DRY_RUN = process.argv.includes("--dry-run");
const squadArg = process.argv.find((a) => a.startsWith("--squad="));
const ONLY_SQUAD = squadArg ? parseInt(squadArg.split("=")[1], 10) : 0;

type Proposal = {
  squadId: number;
  squadSlug: string;
  layer: string;
  stepName: string;
  outputType: string;
  currentCategory: "image" | "video" | "audio" | "multi";
  suggestedSubsteps: string[];
};

const SUFFIXES = ["_caption", "_image", "_video", "_audio"];
function alreadySplit(ot: string): boolean {
  return SUFFIXES.some((s) => ot?.endsWith?.(s));
}

function buildSubsteps(ot: string, cat: Proposal["currentCategory"]): Array<{ outputType: string; tool: string; aiModel: string }> {
  if (cat === "multi") {
    return [
      { outputType: `${ot}_caption`, tool: "azure-foundry", aiModel: "gpt-4o" },
      { outputType: `${ot}_image`,   tool: "fal.ai",        aiModel: "fal/flux-pro-1.1" },
      { outputType: `${ot}_video`,   tool: "fal.ai",        aiModel: "fal/kling-2" },
    ];
  }
  if (cat === "image") return [{ outputType: `${ot}_image`, tool: "fal.ai", aiModel: "fal/flux-pro-1.1" }];
  if (cat === "video") return [{ outputType: `${ot}_video`, tool: "fal.ai", aiModel: "fal/kling-2" }];
  if (cat === "audio") return [{ outputType: `${ot}_audio`, tool: "fal.ai", aiModel: "fal/elevenlabs-tts" }];
  return [];
}

async function main() {
  if (!existsSync(PROPOSALS_PATH)) {
    console.error(`proposals not found at ${PROPOSALS_PATH} — run db:llm-reclassify-outputtypes first`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(PROPOSALS_PATH, "utf-8"));
  const proposals: Proposal[] = raw?.proposals || [];
  console.log(`▼ ${proposals.length} proposals loaded${DRY_RUN ? " (DRY RUN)" : ""}`);

  // Group proposals by squadId
  const bySquad: Record<number, Proposal[]> = {};
  for (const p of proposals) {
    if (ONLY_SQUAD && p.squadId !== ONLY_SQUAD) continue;
    (bySquad[p.squadId] ||= []).push(p);
  }
  const squadIds = Object.keys(bySquad).map(Number);
  console.log(`▼ ${squadIds.length} squads to upgrade`);

  const pool = getPool();
  let touchedSquads = 0, addedSteps = 0, skipped = 0;

  for (const sid of squadIds) {
    const [rows]: any = await pool.query(`SELECT id, slug, steps FROM squads WHERE id = ?`, [sid]);
    if (!rows.length) continue;
    const sq = rows[0];
    let steps: any[] = [];
    try { steps = typeof sq.steps === "string" ? JSON.parse(sq.steps) : sq.steps || []; } catch { continue; }
    if (!Array.isArray(steps) || !steps.length) continue;

    const propsByStepName = new Map<string, Proposal>();
    for (const p of bySquad[sid]) propsByStepName.set(p.stepName, p);

    const newSteps: any[] = [];
    let mutated = false;
    for (const st of steps) {
      const prop = propsByStepName.get(st.name);
      if (!prop || alreadySplit(st.outputType)) {
        newSteps.push(st);
        if (prop && alreadySplit(st.outputType)) skipped++;
        continue;
      }
      const subs = buildSubsteps(prop.outputType, prop.currentCategory);
      if (!subs.length) { newSteps.push(st); continue; }
      for (let i = 0; i < subs.length; i++) {
        const s = subs[i];
        newSteps.push({
          ...st,
          name: i === 0 ? st.name : `${st.name} (${s.outputType.split("_").pop()})`,
          outputType: s.outputType,
          tool: s.tool,
          aiModel: s.aiModel,
        });
        addedSteps++;
      }
      mutated = true;
    }
    if (!mutated) continue;
    // Renumber order
    newSteps.forEach((s, idx) => { s.order = idx + 1; });

    if (DRY_RUN) {
      console.log(`  [DRY] squad ${sid} ${sq.slug}: ${steps.length} → ${newSteps.length} steps`);
    } else {
      await pool.execute(`UPDATE squads SET steps = ? WHERE id = ?`, [JSON.stringify(newSteps), sid]);
    }
    touchedSquads++;
  }

  console.log(`\n✅ ${DRY_RUN ? "would update" : "updated"} ${touchedSquads} squads, +${addedSteps} sub-steps, ${skipped} skipped (already split)`);
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
