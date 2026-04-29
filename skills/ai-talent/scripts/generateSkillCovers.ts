/**
 * generateSkillCovers.ts — landscape cover images for skills via Azure
 * gpt-image-2. Color/style determined by task_type (from classifier).
 *
 * Stored to /opt/marketing-os/covers/skill-<slug>.png; URL written into
 * skills.cover_image_url. EntityCard / LandscapeCard render via the
 * existing coverImageUrl ?? heroImageUrl fallback chain.
 *
 * Volume warning: 2,471 skills × ~$0.013 ≈ $32 USD if you run all.
 * Default behavior is --reuse (skip already-covered) so re-running is
 * cheap. Use --limit to test small batches.
 */

import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const args = process.argv.slice(2);
const arg = (n: string): string | undefined => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  if (a) return a.split("=").slice(1).join("=");
  const i = args.indexOf(`--${n}`);
  if (i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--")) return args[i + 1];
  return undefined;
};
const LIMIT = arg("limit") ? parseInt(arg("limit")!, 10) : 0;
const REUSE = args.includes("--reuse");
const DRY = args.includes("--dry-run");
const SLUG = arg("slug");
const QUALITY = (arg("quality") ?? "low") as "low" | "medium" | "high";
const TASK_TYPE_FILTER = arg("task-type"); // text|image|code|search|audio|video|multimodal

const AZ_KEY = process.env.AZURE_IMAGE_API_KEY ?? process.env.GPT ?? "";
const AZ_ENDPOINT = (process.env.AZURE_IMAGE_ENDPOINT ?? "https://proj-claude-sweden-resource.cognitiveservices.azure.com").replace(/\/+$/, "");
const AZ_DEPLOYMENT = process.env.AZURE_IMAGE_DEPLOYMENT ?? "gpt-image-2";
const AZ_API_VERSION = process.env.AZURE_IMAGE_API_VERSION ?? "2024-02-01";

if (!AZ_KEY) { console.error("Missing AZURE_IMAGE_API_KEY"); process.exit(2); }

const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/marketing-os/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";
mkdirSync(COVERS_DIR, { recursive: true });

// ── task_type → color + visual style ──────────────────────────────────────
const TASK_STYLE: Record<string, { palette: string; style: string }> = {
  text:       { palette: "warm cream beige + dark espresso accent",       style: "editorial typography aesthetic, abstract paper textures, book cover mood" },
  image:      { palette: "high-saturation magenta + violet gradient",     style: "abstract painterly brush strokes, gallery art mood" },
  code:       { palette: "deep navy + neon green accent",                 style: "abstract code blocks dissolved into shapes, terminal aesthetic" },
  search:     { palette: "navy blue + warm gold",                         style: "radar lines + light beams composition, cartographic mood" },
  audio:      { palette: "deep purple + magenta accent on black",         style: "abstract sound waves and concentric rings, vinyl record mood" },
  video:      { palette: "vivid orange-red + off-white",                  style: "abstract film strip and motion blur, cinematic mood" },
  multimodal: { palette: "soft rainbow gradient",                          style: "overlapping translucent shape collage, multi-media mood" },
  embedding:  { palette: "muted teal + warm peach",                       style: "abstract scatter dots and constellation lines" },
};
const DEFAULT_STYLE = TASK_STYLE.text!;

// ── Layer color (mirrors tokens.ts) ────────────────────────────────────────
const LAYER_ACCENT: Record<string, string> = {
  L1: "primary blue accent",
  L2: "danger red accent",
  L3: "warning amber accent",
  L4: "secondary indigo accent",
  L5: "success teal accent",
  L6: "neutral slate accent",
};

function buildPrompt(skill: {
  name: string; description: string | null; task_type: string | null; layer: string | null;
}): string {
  const ts = (skill.task_type ?? "text").toLowerCase();
  const style = TASK_STYLE[ts] ?? DEFAULT_STYLE;
  const layer = (skill.layer ?? "L1").toUpperCase();
  const layerAccent = LAYER_ACCENT[layer] ?? LAYER_ACCENT.L1!;
  const subjectHint = (skill.description ?? skill.name).slice(0, 100);

  return [
    `editorial cover illustration, abstract, NOT photographic`,
    style.style,
    `palette: ${style.palette}, with ${layerAccent}`,
    `evokes the concept of "${skill.name}"`,
    subjectHint,
    "no text, no letters, no logos, no watermarks",
    "high quality, magazine-cover composition, premium design aesthetic",
  ].filter(Boolean).join(", ").slice(0, 800);
}

async function generateImage(prompt: string): Promise<Buffer> {
  const url = `${AZ_ENDPOINT}/openai/deployments/${AZ_DEPLOYMENT}/images/generations?api-version=${AZ_API_VERSION}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${AZ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, size: "1024x1024", quality: QUALITY, output_format: "png", n: 1 }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Azure ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no image: ${JSON.stringify(data).slice(0, 200)}`);
  return Buffer.from(b64, "base64");
}

async function main() {
  const pool = getPool();
  console.log("===== generateSkillCovers =====");
  console.log(`endpoint:   ${AZ_ENDPOINT}`);
  console.log(`deployment: ${AZ_DEPLOYMENT}`);
  console.log(`quality:    ${QUALITY}`);
  console.log(`task_type:  ${TASK_TYPE_FILTER ?? "all"}`);
  console.log(`limit:      ${LIMIT || "none"}`);
  console.log(`reuse:      ${REUSE}`);
  console.log(`dry-run:    ${DRY}\n`);

  let where = "is_active = 1";
  if (REUSE) where += " AND (cover_image_url IS NULL OR cover_image_url = '')";
  if (SLUG) where += ` AND slug = '${SLUG.replace(/'/g, "''")}'`;
  if (TASK_TYPE_FILTER) where += ` AND task_type = '${TASK_TYPE_FILTER.replace(/'/g, "''")}'`;
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : "";

  // Order: by quality_score DESC so high-quality skills get covers first
  const [rows]: any = await pool.execute(
    `SELECT id, slug, name, description, task_type, strategy_layer, cover_image_url
       FROM skills
      WHERE ${where}
      ORDER BY quality_score DESC, id ASC
      ${limitSql}`
  );

  console.log(`Skills to cover: ${rows.length}\n`);
  if (rows.length === 0) { await closePool(); return; }

  let ok = 0, fail = 0;
  for (const r of rows as any[]) {
    const layer = (() => {
      const m = String(r.strategy_layer ?? "").toUpperCase().match(/L([1-6])/);
      return m ? `L${m[1]}` : "L1";
    })();
    const prompt = buildPrompt({
      name: String(r.name ?? r.slug),
      description: r.description,
      task_type: r.task_type,
      layer,
    });

    process.stdout.write(`[${r.id}] ${r.slug} (${r.task_type ?? "?"}/${layer}) ... `);

    if (DRY) {
      console.log("[dry-run]");
      console.log(`   ${prompt.slice(0, 200)}`);
      ok++;
      continue;
    }

    try {
      const buf = await generateImage(prompt);
      const safeSlug = String(r.slug).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
      const filePath = join(COVERS_DIR, `skill-${safeSlug}.png`);
      writeFileSync(filePath, buf);
      const url = `${COVERS_URL_PREFIX}/skill-${safeSlug}.png`;
      await pool.execute("UPDATE skills SET cover_image_url = ? WHERE id = ?", [url, r.id]);
      console.log(`OK (${(buf.length / 1024).toFixed(0)}KB)`);
      ok++;
    } catch (e: any) {
      console.log(`FAIL: ${e.message?.slice(0, 200)}`);
      fail++;
    }
  }

  console.log(`\n=== Done === ok=${ok} fail=${fail}`);
  const [check]: any = await pool.execute(
    "SELECT COUNT(*) AS n FROM skills WHERE cover_image_url IS NOT NULL AND cover_image_url != ''"
  );
  console.log(`Skills with cover: ${check[0].n}`);
  await closePool();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
