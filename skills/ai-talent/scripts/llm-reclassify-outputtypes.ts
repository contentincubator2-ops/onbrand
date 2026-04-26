/**
 * llm-reclassify-outputtypes.ts
 *
 * Takes the rule-based taxonomy at data/outputtype-taxonomy.json,
 * pulls every entry where category === "unknown" (~300 strings),
 * batches them to Azure Foundry gpt-4o, asks for one of:
 *   text | image | video | audio | data | interactive | multi
 *
 * The "multi" category is new — for steps like jab_creative_assets that
 * really need text+image+video co-produced. We treat those as an upgrade
 * proposal: split into 3 sub-steps in a follow-up migration.
 *
 * Output:
 *   data/outputtype-taxonomy.json  — merged with LLM verdicts
 *   data/multimedia-upgrade-proposals.json  — list of (squad, step) where
 *                                              outputType resolved to image/video/audio/multi
 *
 * Resilient to LLM hiccups: retries individual batches, falls back to
 * deepseek-v3 if Foundry returns 5xx.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { invokeLLM } from "../server/_core/llm.js";
import { getPool, closePool } from "./squad-builder/db.js";

type Category = "text" | "image" | "video" | "audio" | "data" | "interactive" | "multi" | "unknown";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAX_PATH = resolve(__dirname, "../data/outputtype-taxonomy.json");
const PROPOSALS_PATH = resolve(__dirname, "../data/multimedia-upgrade-proposals.json");
const BATCH = 25;

const SYSTEM_PROMPT = `You are classifying marketing-workflow outputType tokens.

For each token, return EXACTLY one category:
  text        — written deliverable: copy, brief, plan, manifesto, script, caption, email, doc
  image       — single still image: hero image, banner, poster, illustration, infographic, moodboard
  video       — moving image: reel, short, tiktok, story video, animation, cinemagraph, gif
  audio       — sound only: voiceover, podcast, music, jingle, narration
  data        — structured analytics: report, dashboard, scorecard, audit, map, matrix, metrics
  interactive — code/form/page/playbook/template that user interacts with (not static doc)
  multi       — a creative bundle that REALLY requires text+image+video co-production
                (e.g. ad_set, creative_assets, campaign_creative, awareness_creatives, jab_creatives)

Rules:
- "research" / "insight" / "finding" → data
- "audit" / "scorecard" / "tracker" → data
- "ad" / "creative_assets" / "campaign_creative" → multi (because real ad = visual + copy + maybe video)
- "playbook" / "template" / "framework" → interactive
- "asset" alone (no qualifier) → text (default; specific qualifier overrides)
- prefer "multi" over "image" when the token implies a full creative package
- when in doubt, return "text"

Return ONLY a JSON array of objects: [{"token":"...", "category":"...", "reason":"<5 words>"}]
No prose, no code fences.`;

async function classifyBatch(tokens: string[]): Promise<Array<{ token: string; category: Category; reason: string }>> {
  const userMsg = tokens.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const tryOnce = async (provider: "azure-foundry" | "openai", model: string) => {
    const resp = await invokeLLM({
      provider,
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Classify these ${tokens.length} tokens:\n${userMsg}` },
      ],
      max_tokens: 4096,
    });
    const text = (resp as any)?.text || (resp as any)?.content || (resp as any)?.choices?.[0]?.message?.content || "";
    const cleaned = text.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("not array");
    return parsed;
  };
  try {
    return await tryOnce("azure-foundry", "gpt-4o");
  } catch (e1) {
    console.log(`  ↻ foundry failed (${(e1 as Error).message?.slice(0, 80)}), retrying with openai gpt-4o-mini`);
    try {
      return await tryOnce("openai", "gpt-4o-mini");
    } catch (e2) {
      console.log(`  ✗ both failed: ${(e2 as Error).message?.slice(0, 80)}`);
      return tokens.map((t) => ({ token: t, category: "unknown" as Category, reason: "llm-error" }));
    }
  }
}

async function main() {
  if (!existsSync(TAX_PATH)) {
    console.error(`taxonomy not found at ${TAX_PATH} — run db:classify-outputtypes first`);
    process.exit(1);
  }
  const tax = JSON.parse(readFileSync(TAX_PATH, "utf-8"));
  const unknownTokens = Object.entries<any>(tax.taxonomy)
    .filter(([, v]) => v.category === "unknown")
    .map(([k]) => k);

  console.log(`▼ ${unknownTokens.length} unknown outputTypes to reclassify via LLM`);
  const verdicts: Record<string, { category: Category; reason: string }> = {};
  for (let i = 0; i < unknownTokens.length; i += BATCH) {
    const slice = unknownTokens.slice(i, i + BATCH);
    process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(unknownTokens.length / BATCH)} (${slice.length} tokens)... `);
    const t0 = Date.now();
    const out = await classifyBatch(slice);
    for (const r of out) {
      if (r && r.token && r.category) verdicts[r.token] = { category: r.category as Category, reason: r.reason || "" };
    }
    console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
  }

  // Merge verdicts back into taxonomy
  let updated = 0;
  for (const [tok, v] of Object.entries(verdicts)) {
    if (tax.taxonomy[tok]) {
      tax.taxonomy[tok].category = v.category;
      tax.taxonomy[tok].reason = `llm: ${v.reason}`;
      updated++;
    }
  }
  tax.llm_reclassified_at = new Date().toISOString();
  tax.llm_updated_count = updated;

  // Recompute layer matrix and category totals
  const cats: Category[] = ["text", "image", "video", "audio", "data", "interactive", "multi", "unknown"];
  const catTotals: Record<string, number> = Object.fromEntries(cats.map((c) => [c, 0]));
  const catDistinct: Record<string, number> = Object.fromEntries(cats.map((c) => [c, 0]));
  for (const [, v] of Object.entries<any>(tax.taxonomy)) {
    catTotals[v.category] = (catTotals[v.category] || 0) + (v.count || 0);
    catDistinct[v.category] = (catDistinct[v.category] || 0) + 1;
  }
  tax.catTotals = catTotals;
  tax.catDistinct = catDistinct;

  writeFileSync(TAX_PATH, JSON.stringify(tax, null, 2));
  console.log(`\n✅ updated ${updated} entries, wrote ${TAX_PATH}`);
  console.log("");
  console.log("  Final category totals (distinct strings / step count):");
  for (const c of cats) {
    console.log(`    ${c.padEnd(14)} ${String(catDistinct[c]).padStart(4)} distinct / ${String(catTotals[c]).padStart(5)} steps`);
  }

  // ── Generate multimedia upgrade proposals ─────────────────────────────
  console.log("\n▼ Generating multimedia upgrade proposals...");
  const pool = getPool();
  const [squads] = await pool.query<any[]>(
    `SELECT id, slug, name, strategy_layer, steps FROM squads WHERE is_active = 1`
  );
  const proposals: Array<{
    squadId: number; squadSlug: string; layer: string;
    stepName: string; outputType: string;
    currentCategory: Category; suggestedSubsteps: string[];
  }> = [];

  for (const s of squads) {
    let steps: any[] = [];
    try { steps = typeof s.steps === "string" ? JSON.parse(s.steps) : s.steps || []; } catch {}
    for (const st of steps) {
      const ot = (st.outputType || "").toString();
      const entry = tax.taxonomy[ot];
      if (!entry) continue;
      const cat: Category = entry.category;
      if (cat === "image" || cat === "video" || cat === "audio" || cat === "multi") {
        const subs: string[] = [];
        if (cat === "multi") {
          subs.push(`${ot}_caption (text)`, `${ot}_image (image, fal.ai flux-pro)`, `${ot}_video (video, fal.ai kling-2)`);
        } else if (cat === "image") {
          subs.push(`${ot} (image, fal.ai flux-pro / gpt-image-1)`);
        } else if (cat === "video") {
          subs.push(`${ot} (video, fal.ai kling-2 / minimax-video)`);
        } else if (cat === "audio") {
          subs.push(`${ot} (audio, fal.ai elevenlabs / openai tts-1)`);
        }
        proposals.push({
          squadId: s.id,
          squadSlug: s.slug,
          layer: s.strategy_layer || "(unset)",
          stepName: st.name || "",
          outputType: ot,
          currentCategory: cat,
          suggestedSubsteps: subs,
        });
      }
    }
  }
  writeFileSync(PROPOSALS_PATH, JSON.stringify({ generated_at: new Date().toISOString(), count: proposals.length, proposals }, null, 2));
  console.log(`  wrote ${proposals.length} multimedia upgrade proposals → ${PROPOSALS_PATH}`);

  // Show breakdown
  const byCat: Record<string, number> = {};
  const byLayer: Record<string, number> = {};
  for (const p of proposals) {
    byCat[p.currentCategory] = (byCat[p.currentCategory] || 0) + 1;
    byLayer[p.layer] = (byLayer[p.layer] || 0) + 1;
  }
  console.log("  proposals by category:", byCat);
  console.log("  proposals by layer:   ", byLayer);

  // Top 15 sample
  console.log("\n  ↳ sample proposals (first 15):");
  for (const p of proposals.slice(0, 15)) {
    console.log(`    [${p.layer}] ${p.squadSlug} → "${p.stepName}" out=${p.outputType} (${p.currentCategory})`);
    for (const sub of p.suggestedSubsteps) console.log(`        ↳ ${sub}`);
  }

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
