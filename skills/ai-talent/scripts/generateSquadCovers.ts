/**
 * generateSquadCovers.ts — generate landscape cover images for the
 * 30 curated squads via FAL flux/dev.
 *
 * For each squad we build a layer-aware editorial-cover prompt and
 * write the resulting URL into squads.hero_image_url. EntityCard /
 * LandscapeCard / EntityDetailModal already check that field and
 * fall back to MethodologyGlyph SVG when null.
 *
 * Cost: ~$0.025 per image × 30 ≈ $0.75 USD on flux/dev.
 *
 * Flags:
 *   --limit N         only process first N squads
 *   --reuse           skip squads that already have hero_image_url
 *   --dry-run         print the prompts that would be sent, no API call
 *   --slug=<slug>     only this slug
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  if (a) return a.split("=").slice(1).join("=");
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--")) return args[i + 1];
  return undefined;
};
const LIMIT = arg("limit") ? parseInt(arg("limit")!, 10) : 0;
const REUSE = args.includes("--reuse");
const DRY = args.includes("--dry-run");
const SLUG = arg("slug");

// ── FAL — pick first available key from the pool ──────────────────────────
const FAL_KEY = process.env.FAL_AI_API_KEY_1 ?? process.env.FAL_AI_API_KEY_2
  ?? process.env.FAL_AI_API_KEY_3 ?? process.env.FAL_AI_API_KEY_4
  ?? process.env.FAL_AI_API_KEY_5 ?? process.env.FAL_AI_API_KEY ?? "";
const FAL_MODEL = process.env.FAL_IMAGE_MODEL ?? "fal-ai/flux/dev";

if (!FAL_KEY) { console.error("Missing FAL_AI_API_KEY_*"); process.exit(2); }

// ── Layer-aware prompt construction ────────────────────────────────────────
const LAYER_PROMPT: Record<string, string> = {
  L1: "minimalist editorial brand mood, abstract geometric shapes, neutral muted color palette with one accent color, premium magazine cover, soft shadows",
  L2: "clean product launch hero, abstract product silhouette, studio lighting, gradient backdrop, premium minimal aesthetic",
  L3: "diverse abstract human figures rendered as soft silhouettes, pastel gradient background, ethereal, persona portraits, audience research mood",
  L4: "vibrant social media mood collage, colorful overlapping abstract panels, dynamic composition, channel marketing aesthetic",
  L5: "dynamic launch energy, bold abstract strokes, motion blur, dramatic lighting, campaign poster mood",
  L6: "data visualization aesthetic, abstract charts and dashboards rendered as art, navy + cyan + warm accent palette, analytics editorial",
};

function buildPrompt(squad: { name: string; layer: string; methodology: any; description: string | null; }): string {
  const layerStyle = LAYER_PROMPT[squad.layer] ?? LAYER_PROMPT.L1!;
  const author = squad.methodology?.author ?? "";
  const themeHint = (squad.description ?? "").slice(0, 120);
  const subject = author ? `${squad.name} (${author} methodology)` : squad.name;
  return [
    layerStyle,
    `editorial cover for "${subject}"`,
    themeHint,
    "no text, no letters, no logos, no watermarks",
    "high quality, 4k, magazine cover composition, professional design aesthetic",
  ].filter(Boolean).join(", ").slice(0, 800);
}

// ── FAL flux/dev — sync call ───────────────────────────────────────────────
async function generateImage(prompt: string): Promise<string> {
  const url = `https://fal.run/${FAL_MODEL}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "landscape_16_9",
      num_inference_steps: 28,
      guidance_scale: 3.5,
      enable_safety_checker: true,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`FAL ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  const imgUrl = data?.images?.[0]?.url;
  if (!imgUrl) throw new Error(`FAL no image: ${JSON.stringify(data).slice(0, 200)}`);
  return imgUrl;
}

async function main() {
  const pool = getPool();
  console.log("===== generateSquadCovers =====");
  console.log(`model: ${FAL_MODEL}`);
  console.log(`limit: ${LIMIT || "none"}`);
  console.log(`reuse: ${REUSE}`);
  console.log(`dry-run: ${DRY}\n`);

  // Pull 30 curated squads (or fewer if --limit / --slug)
  let where = "is_curated = 1 AND is_active = 1";
  if (REUSE) where += " AND (hero_image_url IS NULL OR hero_image_url = '')";
  if (SLUG) where += ` AND slug = ${pool.escape ? pool.escape(SLUG) : `'${SLUG.replace(/'/g, "''")}'`}`;
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : "";

  const [rows]: any = await pool.execute(
    `SELECT id, slug, name, description, strategy_layer, methodology, hero_image_url
       FROM squads
      WHERE ${where}
      ORDER BY id ASC
      ${limitSql}`
  );

  console.log(`Squads to cover: ${rows.length}\n`);
  if (rows.length === 0) { await closePool(); return; }

  let ok = 0, fail = 0;
  for (const r of rows as any[]) {
    const layer = (() => {
      const m = String(r.strategy_layer ?? "").toUpperCase().match(/L([1-6])/);
      return m ? `L${m[1]}` : "L1";
    })();
    const meth = (() => {
      if (!r.methodology) return null;
      if (typeof r.methodology === "object") return r.methodology;
      try { return JSON.parse(r.methodology); } catch { return null; }
    })();

    const prompt = buildPrompt({
      name: String(r.name ?? r.slug),
      layer,
      methodology: meth,
      description: r.description,
    });

    process.stdout.write(`[${r.id}] ${r.slug}  (${layer}) … `);

    if (DRY) {
      console.log("[dry-run]");
      console.log(`   prompt: ${prompt.slice(0, 200)}`);
      ok++;
      continue;
    }

    try {
      const imgUrl = await generateImage(prompt);
      await pool.execute(
        "UPDATE squads SET hero_image_url = ? WHERE id = ?",
        [imgUrl, r.id]
      );
      console.log(`✓ ${imgUrl.split("/").pop()?.slice(0, 32)}…`);
      ok++;
    } catch (e: any) {
      console.log(`FAIL: ${e.message?.slice(0, 200)}`);
      fail++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`generated: ${ok}`);
  console.log(`failed:    ${fail}`);

  if (!DRY) {
    const [check]: any = await pool.execute(
      "SELECT COUNT(*) AS n FROM squads WHERE is_curated = 1 AND hero_image_url IS NOT NULL"
    );
    console.log(`\nCurated squads with cover: ${check[0].n} / 30`);
  }

  await closePool();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
