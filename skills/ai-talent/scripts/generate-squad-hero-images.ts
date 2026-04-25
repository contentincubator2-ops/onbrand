/**
 * generate-squad-hero-images.ts
 *
 * For every active squad without a hero_image_url, generate a 3D pastel
 * mockup illustration via OpenAI gpt-image-1 and save it as a PNG.
 *
 * Pipeline per squad:
 *   1. Build a prompt from {layer, name, methodology author/year, tier}.
 *   2. Call OpenAI Images API (gpt-image-1, 1024x1024, b64).
 *   3. Decode base64 → write to /opt/marketing-os/app/public/squad-hero/{slug}.png
 *   4. UPDATE squads SET hero_image_url = '/squad-hero/{slug}.png',
 *                        hero_image_prompt = '<prompt used>'
 *
 * Flags:
 *   --dry-run        Print prompt + skip API call & write
 *   --limit=N        Process at most N squads
 *   --slugs=a,b,c    Restrict to comma-separated slugs
 *   --regenerate     Re-do squads that already have hero_image_url
 *   --out=/abs/dir   Override output dir (default: $APP_PUBLIC_DIR/squad-hero
 *                    or ./public/squad-hero)
 *   --size=1024x1024 Override (default 1024x1024)
 *   --quality=medium  low|medium|high|auto (default medium — best $/quality)
 *
 * Idempotent: only fills missing rows unless --regenerate.
 */
import { createPool } from "mysql2/promise";
import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
dotenv.config();

const DRY = process.argv.includes("--dry-run");
const REGEN = process.argv.includes("--regenerate");

function flag(name: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
const LIMIT = (() => {
  const v = flag("limit");
  return v ? Math.max(1, Number(v)) : null;
})();
const SLUGS = (() => {
  const v = flag("slugs");
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null;
})();
const SIZE = flag("size") || "1024x1024";
const QUALITY = (flag("quality") || "medium") as "low" | "medium" | "high" | "auto";
const OUT_DIR = flag("out") ||
  process.env.HERO_OUT_DIR ||
  (fs.existsSync("/opt/marketing-os/app/skills/ai-talent/public")
    ? "/opt/marketing-os/app/skills/ai-talent/public/squad-hero"
    : path.join(process.cwd(), "public", "squad-hero"));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com";
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

const LAYER_THEME: Record<string, string> = {
  L1: "abstract brand monogram, geometric symbol of identity, archetypal motif",
  L2: "product packaging mockup, single SKU floating, premium retail object",
  L3: "audience persona vignette, group of stylised silhouettes, demographic mosaic",
  L4: "channel platform device mockup, phone or laptop screen content, social media UI",
  L5: "campaign event scene, banner streamers and stage, launch moment frozen",
  L6: "validation dashboard, gauges and charts, audit clipboard with checklist",
};

/**
 * Infer L1-L6 from slug + name when strategy_layer is "unassigned" / null.
 * First match wins; precedence ordered specific → general.
 */
const LAYER_KEYWORDS: Array<{ layer: string; patterns: RegExp[] }> = [
  {
    layer: "L6",
    patterns: [
      /audit|validation|stress[-_ ]?test|consistenc|integrity|monitor|scorecard|watchtower|sentiment|audit-/i,
      /驗證|校準|監測|稽核|健診|追蹤/,
    ],
  },
  {
    layer: "L5",
    patterns: [
      /campaign|launch|event|plf|tribe|cem|activation|ted|networking|culture-building|product-launch/i,
      /活動|發布|啟動|大會|論壇|品牌活動/,
    ],
  },
  {
    layer: "L4",
    patterns: [
      /(^|[-_/])(fb|facebook|ig|instagram|linkedin|li|youtube|yt|tiktok|x[-_]twitter|threads|line|wechat|pinterest|reddit|pr)([-_/]|$)/i,
      /social[-_ ]?channel|social[-_ ]?content|content[-_ ]?strategy|performance[-_ ]?marketing|paid[-_ ]?(ads|media)|seo|ecommerce|funnel|growth/i,
      /貼文|社群|廣告|通路|內容創作|公關/,
    ],
  },
  {
    layer: "L3",
    patterns: [
      /audience|persona|icp|stp|vals|tribes|segment|psychograph|ethnograph|generational/i,
      /受眾|客群|分眾|人物誌/,
    ],
  },
  {
    layer: "L2",
    patterns: [
      /product|pmf|jtbd|fab|kano|chasm|4p|value[-_ ]?prop|benefit[-_ ]?ladder/i,
      /產品|價值主張/,
    ],
  },
  {
    layer: "L1",
    patterns: [
      /brand|archetype|positioning|differentiation|cbbe|equity|narrative|story|blue[-_ ]?ocean|category[-_ ]?design|purpose|mind[-_ ]?position/i,
      /品牌|原型|定位|策略組|策略師|gtm|策略/,
    ],
  },
];

function inferLayer(slug: string, name: string, declared: string | null): string {
  const d = (declared || "").toString().toUpperCase();
  if (/^L[1-6]$/.test(d.slice(0, 2))) return d.slice(0, 2);
  const hay = `${slug} ${name}`;
  for (const { layer, patterns } of LAYER_KEYWORDS) {
    if (patterns.some((p) => p.test(hay))) return layer;
  }
  return "L1";
}

interface Row {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  tier: string | null;
  strategy_layer: string | null;
  hero_image_url: string | null;
  methodology_author?: string | null;
  methodology_year?: string | null;
}

function buildPrompt(r: Row): string {
  const layerKey = inferLayer(r.slug, r.name, r.strategy_layer || r.tier);
  const theme = LAYER_THEME[layerKey] ?? LAYER_THEME.L1;
  const author = r.methodology_author ? `, methodology by ${r.methodology_author}` : "";
  const subject = r.name.replace(/[\u3000-\u303f\uff00-\uffef]/g, "").trim() || r.slug;
  return [
    `3D pastel mockup illustration for a marketing methodology card titled "${subject}"${author}.`,
    `Theme: ${theme}.`,
    `Style: soft cream and lavender background, agency boardroom presentation aesthetic,`,
    `tilted isometric angle, gentle drop shadow, matte finish, no text, no logos, no watermarks,`,
    `tiny floating geometric props, depth-of-field blur on the rear, single hero object centred,`,
    `editorial luxury feel, Behance-quality 3D render, octane-style soft global illumination.`,
  ].join(" ");
}

async function callOpenAIImage(prompt: string): Promise<Buffer> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set in env");
  const body = {
    model: MODEL,
    prompt,
    size: SIZE,
    quality: QUALITY,
    n: 1,
  };
  const res = await fetch(`${OPENAI_BASE}/v1/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI image API ${res.status}: ${t.slice(0, 500)}`);
  }
  const json: any = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) {
    // Some endpoints return URL — fetch it
    const url = json?.data?.[0]?.url;
    if (url) {
      const r2 = await fetch(url);
      const ab = await r2.arrayBuffer();
      return Buffer.from(ab);
    }
    throw new Error(`OpenAI image API returned no b64_json or url: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return Buffer.from(b64, "base64");
}

async function main() {
  const pool = createPool({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    charset: "utf8mb4",
  });
  console.log(`[hero-img] DB ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  console.log(`[hero-img] OUT_DIR=${OUT_DIR}  size=${SIZE}  quality=${QUALITY}  model=${MODEL}`);
  console.log(`[hero-img] flags: dry=${DRY} regen=${REGEN} limit=${LIMIT ?? "all"} slugs=${SLUGS ? SLUGS.join(",") : "all"}`);
  if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });

  const conn = await pool.getConnection();
  try {
    // Pull squads, optionally with methodology join. We try to load author from
    // a sibling JSON column or related table — fall back to nothing if missing.
    let where = "is_active = 1";
    if (!REGEN) where += " AND (hero_image_url IS NULL OR hero_image_url = '')";
    if (SLUGS && SLUGS.length) {
      where += ` AND slug IN (${SLUGS.map((s) => `'${s.replace(/'/g, "''")}'`).join(",")})`;
    }
    const lim = LIMIT ? ` LIMIT ${LIMIT}` : "";
    const sql = `SELECT id, slug, name, description, tier, strategy_layer, hero_image_url FROM squads WHERE ${where} ORDER BY id ASC${lim}`;
    const [rows] = await conn.query(sql) as any[];
    const squads = rows as Row[];
    console.log(`[hero-img] candidates: ${squads.length}`);

    let ok = 0, failed = 0, skipped = 0;
    for (let i = 0; i < squads.length; i++) {
      const r = squads[i];
      const tag = `[${i + 1}/${squads.length}] #${r.id} ${r.slug}`;
      const prompt = buildPrompt(r);
      const inferredLayer = inferLayer(r.slug, r.name, r.strategy_layer || r.tier);
      if (DRY) {
        console.log(`${tag}  layer=${inferredLayer}  name="${r.name}"`);
        console.log(`  prompt: ${prompt}\n`);
        skipped++;
        continue;
      }
      try {
        const png = await callOpenAIImage(prompt);
        const filePath = path.join(OUT_DIR, `${r.slug}.png`);
        fs.writeFileSync(filePath, png);
        const url = `/squad-hero/${r.slug}.png`;
        await conn.execute(
          `UPDATE squads SET hero_image_url = ?, hero_image_prompt = ? WHERE id = ?`,
          [url, prompt, r.id]
        );
        const kb = (png.length / 1024).toFixed(0);
        console.log(`${tag}  OK  (${kb}KB)`);
        ok++;
      } catch (e: any) {
        console.error(`${tag}  FAIL  ${e?.message ?? e}`);
        failed++;
      }
    }
    console.log(`\n[hero-img] DONE  ok=${ok} failed=${failed} skipped=${skipped} dry=${DRY}`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
