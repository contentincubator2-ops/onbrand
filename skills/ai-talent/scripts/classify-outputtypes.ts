/**
 * classify-outputtypes.ts
 *
 * Read-only. Walks every active squad's steps, classifies each
 * distinct outputType string into one of:
 *   text | image | video | audio | data | interactive | unknown
 *
 * Outputs:
 *   - console: layer × category matrix + top unknowns + sample mismatches
 *   - file:    skills/ai-talent/data/outputtype-taxonomy.json
 *
 * Rule-based first pass. Strings that don't match any rule stay 'unknown'
 * and get printed for human review (next pass will use LLM batch).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "./squad-builder/db.js";

type Category = "text" | "image" | "video" | "audio" | "data" | "interactive" | "unknown";

// Rule order matters — first hit wins.
const RULES: Array<{ pattern: RegExp; category: Category; reason: string }> = [
  // ── image ───────────────────────────────────────────────────────────
  { pattern: /\b(image|hero[_-]?image|thumbnail|carousel|infographic|moodboard|poster|banner|cover|visual[_-]?asset|key[_-]?visual|illustration|graphic|logo|icon|wireframe[_-]?mockup|figma|product[_-]?shot|art[_-]?direction|mood[_-]?board|color[_-]?palette|visual[_-]?system)/i, category: "image", reason: "image keyword" },
  { pattern: /(_image|_visual|_thumbnail|_banner|_poster|_cover)\b/i, category: "image", reason: "image suffix" },

  // ── video ───────────────────────────────────────────────────────────
  { pattern: /\b(video|reel|short[s]?|tiktok|yt[_-]?short|story[_-]?video|trailer|teaser|cinemagraph|gif|motion|animation|storyboard|shot[_-]?list)/i, category: "video", reason: "video keyword" },
  { pattern: /(_video|_reel|_motion|_animation|_storyboard)\b/i, category: "video", reason: "video suffix" },

  // ── audio ───────────────────────────────────────────────────────────
  { pattern: /\b(audio|voiceover|voice[_-]?over|podcast|tts|music|bgm|jingle|soundtrack|narration|audio[_-]?bed)/i, category: "audio", reason: "audio keyword" },
  { pattern: /(_audio|_voiceover|_music|_bgm|_narration)\b/i, category: "audio", reason: "audio suffix" },

  // ── data ────────────────────────────────────────────────────────────
  { pattern: /\b(report|dashboard|analysis|analytics|metrics|kpi|scorecard|tracker|attribution|forecast|funnel|cohort|retention|benchmark|map|matrix|pipeline|attribution|leaderboard|index|score)/i, category: "data", reason: "data/report keyword" },
  { pattern: /(_report|_analysis|_analytics|_metrics|_dashboard|_scorecard|_matrix|_map|_index)\b/i, category: "data", reason: "data suffix" },
  { pattern: /\b(audit|stress[_-]?test|consistency[_-]?check|integrity[_-]?check|gap[_-]?analysis|swot|pestle)/i, category: "data", reason: "audit-style data" },

  // ── interactive (form / quiz / tool / app / page) ───────────────────
  { pattern: /\b(quiz|survey|form|landing[_-]?page|website|microsite|chatbot|widget|tool|calculator|template|playbook|workflow)/i, category: "interactive", reason: "interactive keyword" },
  { pattern: /(_form|_landing|_page|_template|_playbook|_workflow)\b/i, category: "interactive", reason: "interactive suffix" },

  // ── text (broad fallback for written deliverables) ──────────────────
  { pattern: /\b(plan|brief|strategy|positioning|statement|manifesto|narrative|story|message|copy|caption|headline|script|email|blog|thread|article|outline|summary|memo|doc(ument)?|guideline|framework|charter|manual|spec|sop)/i, category: "text", reason: "text deliverable keyword" },
  { pattern: /(_plan|_brief|_strategy|_statement|_manifesto|_narrative|_story|_copy|_caption|_script|_email|_outline|_summary|_doc|_guideline|_framework|_charter|_spec)\b/i, category: "text", reason: "text suffix" },
  { pattern: /\b(asset|deliverable|content|recommendation|rationale|insight|finding|hypothesis)/i, category: "text", reason: "generic text noun" },
];

function classify(ot: string): { category: Category; reason: string } {
  const s = ot.toLowerCase();
  for (const r of RULES) {
    if (r.pattern.test(s)) return { category: r.category, reason: r.reason };
  }
  return { category: "unknown", reason: "no rule match" };
}

async function main() {
  const pool = getPool();
  const [squads] = await pool.query<any[]>(
    `SELECT id, slug, strategy_layer, steps FROM squads WHERE is_active = 1`
  );

  const seen = new Set<string>();
  const taxonomy: Record<string, { category: Category; reason: string; count: number }> = {};
  const layerMatrix: Record<string, Record<Category, number>> = {};

  for (const s of squads) {
    let steps: any[] = [];
    try { steps = typeof s.steps === "string" ? JSON.parse(s.steps) : s.steps || []; } catch {}
    const layer = s.strategy_layer || "(unset)";
    if (!layerMatrix[layer]) {
      layerMatrix[layer] = { text: 0, image: 0, video: 0, audio: 0, data: 0, interactive: 0, unknown: 0 };
    }
    for (const st of steps) {
      const ot = (st.outputType || "(none)").toString();
      seen.add(ot);
      if (!taxonomy[ot]) {
        const c = classify(ot);
        taxonomy[ot] = { ...c, count: 0 };
      }
      taxonomy[ot].count++;
      layerMatrix[layer][taxonomy[ot].category]++;
    }
  }

  // ── Print layer × category matrix ────────────────────────────────────
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  OutputType taxonomy — layer × category");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  layer            text  image  video  audio   data interact unknown");
  for (const layer of Object.keys(layerMatrix).sort()) {
    const m = layerMatrix[layer];
    console.log(
      `  ${layer.padEnd(15)} ${String(m.text).padStart(5)} ${String(m.image).padStart(6)} ${String(m.video).padStart(6)} ${String(m.audio).padStart(6)} ${String(m.data).padStart(6)} ${String(m.interactive).padStart(8)} ${String(m.unknown).padStart(7)}`
    );
  }

  // ── Category summary ──────────────────────────────────────────────────
  const catTotals: Record<Category, number> = { text: 0, image: 0, video: 0, audio: 0, data: 0, interactive: 0, unknown: 0 };
  const catDistinct: Record<Category, number> = { text: 0, image: 0, video: 0, audio: 0, data: 0, interactive: 0, unknown: 0 };
  for (const [, v] of Object.entries(taxonomy)) {
    catTotals[v.category] += v.count;
    catDistinct[v.category]++;
  }
  console.log("");
  console.log("  ↳ Category totals (distinct strings / step count):");
  for (const c of ["text", "image", "video", "audio", "data", "interactive", "unknown"] as Category[]) {
    console.log(`    ${c.padEnd(14)} ${String(catDistinct[c]).padStart(4)} distinct / ${String(catTotals[c]).padStart(5)} steps`);
  }

  // ── Top unknowns for human review ────────────────────────────────────
  const unknowns = Object.entries(taxonomy)
    .filter(([, v]) => v.category === "unknown")
    .sort((a, b) => b[1].count - a[1].count);
  console.log("");
  console.log(`  ↳ ${unknowns.length} distinct outputTypes still UNKNOWN (top 40):`);
  for (const [ot, v] of unknowns.slice(0, 40)) {
    console.log(`    ${ot.padEnd(45)} (${v.count})`);
  }

  // ── Sample of each non-text category ─────────────────────────────────
  console.log("");
  for (const cat of ["image", "video", "audio", "data", "interactive"] as Category[]) {
    const items = Object.entries(taxonomy)
      .filter(([, v]) => v.category === cat)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8);
    if (items.length === 0) {
      console.log(`  [${cat}] — none classified`);
      continue;
    }
    console.log(`  [${cat}] sample:`);
    for (const [ot, v] of items) console.log(`    ${ot} (${v.count}, ${v.reason})`);
  }

  // ── Write JSON ────────────────────────────────────────────────────────
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outFile = resolve(__dirname, "../data/outputtype-taxonomy.json");
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(
    { generated_at: new Date().toISOString(), distinct: seen.size, taxonomy, layerMatrix, catTotals, catDistinct },
    null, 2
  ));
  console.log("");
  console.log(`✅ wrote taxonomy to ${outFile}`);
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
