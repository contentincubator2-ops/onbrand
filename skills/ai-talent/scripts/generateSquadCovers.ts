/**
 * generateSquadCovers.ts — generate landscape cover images for the
 * 30 curated squads via Azure OpenAI gpt-image-2.
 *
 * Endpoint: <AZURE_IMAGE_ENDPOINT>/openai/deployments/<deployment>/images/generations?api-version=2024-02-01
 * Auth:     Authorization: Bearer <AZURE_IMAGE_KEY>
 * Response: { data: [{ b64_json: "..." }] }  (base64 PNG, no URL form)
 *
 * Each result is decoded → /opt/marketing-os/covers/<slug>.png on the
 * VM (persistent path, served by the marketing-os Express app at
 * /static/covers/<slug>.png). The relative URL is then stored in
 * squads.hero_image_url so EntityCard / LandscapeCard /
 * EntityDetailModal automatically display it.
 *
 * Cost: ~30 squads × low-quality 1024×1024 ≈ <$1 USD on gpt-image-2.
 *
 * Flags:
 *   --limit N         only process first N squads
 *   --reuse           skip squads that already have hero_image_url
 *   --dry-run         print prompts only, no API call
 *   --slug=<slug>     only this slug
 *   --quality=low|medium|high  default=low
 */

import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
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
const QUALITY = (arg("quality") ?? "low") as "low" | "medium" | "high";

// ── Azure gpt-image-2 ──────────────────────────────────────────────────────
const AZ_KEY = process.env.AZURE_IMAGE_API_KEY ?? process.env.GPT ?? "";
const AZ_ENDPOINT = (
  process.env.AZURE_IMAGE_ENDPOINT
  ?? "https://proj-claude-sweden-resource.cognitiveservices.azure.com"
).replace(/\/+$/, "");
const AZ_DEPLOYMENT = process.env.AZURE_IMAGE_DEPLOYMENT ?? "gpt-image-2";
const AZ_API_VERSION = process.env.AZURE_IMAGE_API_VERSION ?? "2024-02-01";

if (!AZ_KEY) { console.error("Missing AZURE_IMAGE_API_KEY (or GPT)"); process.exit(2); }

// Persistent dir matching server/index.ts express.static config
const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/marketing-os/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";

mkdirSync(COVERS_DIR, { recursive: true });

// ── Layer-aware prompt ─────────────────────────────────────────────────────
const LAYER_PROMPT: Record<string, string> = {
  L1: "minimalist editorial brand mood, abstract geometric shapes, neutral muted color palette with one accent color, premium magazine cover, soft shadows",
  L2: "clean product launch hero, abstract product silhouette, studio lighting, gradient backdrop, premium minimal aesthetic",
  L3: "diverse abstract human figures rendered as soft silhouettes, pastel gradient background, ethereal, persona portraits, audience research mood",
  L4: "vibrant social media mood collage, colorful overlapping abstract panels, dynamic composition, channel marketing aesthetic",
  L5: "dynamic launch energy, bold abstract strokes, motion blur, dramatic lighting, campaign poster mood",
  L6: "data visualization aesthetic, abstract charts and dashboards rendered as art, navy + cyan + warm accent palette, analytics editorial",
};

function buildPrompt(squad: { name: string; layer: string; methodology: any; description: string | null }): string {
  const layerStyle = LAYER_PROMPT[squad.layer] ?? LAYER_PROMPT.L1!;
  const author = squad.methodology?.author ?? "";
  const themeHint = (squad.description ?? "").slice(0, 120);
  const subject = author ? `${squad.name} (${author} methodology)` : squad.name;
  return [
    layerStyle,
    `editorial cover for "${subject}"`,
    themeHint,
    "no text, no letters, no logos, no watermarks",
    "high quality, magazine cover composition, professional design aesthetic",
  ].filter(Boolean).join(", ").slice(0, 800);
}

// ── Azure gpt-image-2 call (returns base64 PNG) ────────────────────────────
async function generateImage(prompt: string): Promise<Buffer> {
  const url = `${AZ_ENDPOINT}/openai/deployments/${AZ_DEPLOYMENT}/images/generations?api-version=${AZ_API_VERSION}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AZ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      size: "1024x1024",
      quality: QUALITY,
      output_format: "png",
      n: 1,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Azure ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`Azure no image in response: ${JSON.stringify(data).slice(0, 200)}`);
  return Buffer.from(b64, "base64");
}

async function main() {
  const pool = getPool();
  console.log("===== generateSquadCovers =====");
  console.log(`endpoint:   ${AZ_ENDPOINT}`);
  console.log(`deployment: ${AZ_DEPLOYMENT}`);
  console.log(`quality:    ${QUALITY}`);
  console.log(`covers dir: ${COVERS_DIR}`);
  console.log(`url prefix: ${COVERS_URL_PREFIX}`);
  console.log(`limit:      ${LIMIT || "none"}`);
  console.log(`reuse:      ${REUSE}`);
  console.log(`dry-run:    ${DRY}\n`);

  let where = "is_curated = 1 AND is_active = 1";
  if (REUSE) where += " AND (hero_image_url IS NULL OR hero_image_url = '')";
  if (SLUG) where += ` AND slug = '${SLUG.replace(/'/g, "''")}'`;
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

    process.stdout.write(`[${r.id}] ${r.slug}  (${layer}) ... `);

    if (DRY) {
      console.log("[dry-run]");
      console.log(`   prompt: ${prompt.slice(0, 200)}`);
      ok++;
      continue;
    }

    try {
      const buf = await generateImage(prompt);
      const safeSlug = String(r.slug).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
      const filePath = join(COVERS_DIR, `${safeSlug}.png`);
      writeFileSync(filePath, buf);
      const url = `${COVERS_URL_PREFIX}/${safeSlug}.png`;
      await pool.execute("UPDATE squads SET hero_image_url = ? WHERE id = ?", [url, r.id]);
      console.log(`OK  ${url} (${(buf.length / 1024).toFixed(0)}KB)`);
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
      "SELECT COUNT(*) AS n FROM squads WHERE is_curated = 1 AND hero_image_url IS NOT NULL AND hero_image_url != ''"
    );
    console.log(`\nCurated squads with cover: ${check[0].n} / 30`);
  }

  await closePool();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
