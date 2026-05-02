/**
 * generateAgentAvatars.ts — generate illustrated portrait avatars for
 * every agent in soworkAgents via Azure OpenAI gpt-image-2.
 *
 * Variable system (deterministic per-agent seed) drives 10-axis
 * combinatorial diversity (~56M combinations) so 10K+ agents would all
 * be visually distinct. We hash agent.id → indexes into each axis,
 * giving repeatable but unique portraits.
 *
 * Stored to /opt/marketing-os/covers/agent-<slug>.png and URL written
 * into agents.avatarUrl.
 *
 * Cost: ~$0.013 per low-quality 1024×1024 PNG.
 *
 * Flags:
 *   --limit N         only first N agents
 *   --reuse           skip agents already with avatarUrl
 *   --dry-run         print prompts only
 *   --slug=<slug>     only this agent
 */

import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
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

const AZ_KEY = process.env.AZURE_IMAGE_API_KEY ?? process.env.GPT ?? "";
const AZ_ENDPOINT = (process.env.AZURE_IMAGE_ENDPOINT ?? "https://proj-claude-sweden-resource.cognitiveservices.azure.com").replace(/\/+$/, "");
const AZ_DEPLOYMENT = process.env.AZURE_IMAGE_DEPLOYMENT ?? "gpt-image-2";
const AZ_API_VERSION = process.env.AZURE_IMAGE_API_VERSION ?? "2024-02-01";

if (!AZ_KEY) { console.error("Missing AZURE_IMAGE_API_KEY"); process.exit(2); }

const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/marketing-os/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";
mkdirSync(COVERS_DIR, { recursive: true });

// ── Variable system — bold graphic novel portrait avatars ────────────────
// Style: webtoon / graphic novel illustration with solid colored background.
// Character rendered in black + white with thick bold outlines on a vivid
// background that reflects the agent's platform or specialty.
// Diversity: 6 × 10 × 5 × 6 × 7 × 4 = 50,400 combinations.

const FACE_SHAPES = ["oval", "round", "square", "heart-shaped", "long", "diamond"];
const HAIR_STYLES = ["short crop", "shoulder-length wavy", "high ponytail", "top knot",
  "curly afro", "long straight", "braided", "buzz cut", "bob cut", "dreadlocks"];
const EYEWEAR     = ["no glasses", "round wire-frame glasses", "square black frames",
  "thin oval glasses", "minimal half-rim glasses"];
const EXPRESSIONS = ["subtle confident smile", "calm focused", "thoughtful",
  "warm welcoming", "serene professional", "quietly determined"];
const OUTFITS     = ["collared shirt with simple tie", "open-collar shirt",
  "turtleneck sweater", "casual hoodie", "blazer over t-shirt",
  "minimal structured jacket", "polo shirt"];
const ANGLES      = ["front-facing", "three-quarter left turn",
  "three-quarter right turn", "subtle profile"];

// Background colour per platform / specialty (CSS hex, no #)
const SPECIALTY_COLORS: Record<string, string> = {
  facebook:  "#4267B2",
  instagram: "#C13584",
  linkedin:  "#0077B5",
  youtube:   "#CC0000",
  strategy:  "#6548C6",
  research:  "#0891B2",
  writer:    "#059669",
  visual:    "#E11D48",
  analytics: "#D97706",
  pr:        "#7C3AED",
  calendar:  "#0369A1",
  ads:       "#B45309",
};
const COLOR_PALETTE = Object.values(SPECIALTY_COLORS);

function bgColorForAgent(agent: { slug: string; title: string | null; specialty: string | null }): string {
  const hint = [agent.slug, agent.title, agent.specialty].join(" ").toLowerCase();
  if (hint.includes("facebook") || hint.includes(" fb ")) return SPECIALTY_COLORS.facebook!;
  if (hint.includes("instagram") || hint.includes(" ig "))  return SPECIALTY_COLORS.instagram!;
  if (hint.includes("linkedin") || hint.includes(" li "))   return SPECIALTY_COLORS.linkedin!;
  if (hint.includes("youtube") || hint.includes(" yt "))    return SPECIALTY_COLORS.youtube!;
  if (hint.includes("strateg") || hint.includes("策略") || hint.includes("brand"))
    return SPECIALTY_COLORS.strategy!;
  if (hint.includes("research") || hint.includes("研究") || hint.includes("insight"))
    return SPECIALTY_COLORS.research!;
  if (hint.includes("writ") || hint.includes("copy") || hint.includes("文案") || hint.includes("content"))
    return SPECIALTY_COLORS.writer!;
  if (hint.includes("visual") || hint.includes("視覺") || hint.includes("design") || hint.includes("art"))
    return SPECIALTY_COLORS.visual!;
  if (hint.includes("analyt") || hint.includes("分析") || hint.includes("data") || hint.includes("kpi"))
    return SPECIALTY_COLORS.analytics!;
  if (hint.includes("pr") || hint.includes("公關") || hint.includes("media"))
    return SPECIALTY_COLORS.pr!;
  if (hint.includes("calendar") || hint.includes("行事曆") || hint.includes("pillar"))
    return SPECIALTY_COLORS.calendar!;
  if (hint.includes("ads") || hint.includes("廣告"))
    return SPECIALTY_COLORS.ads!;
  // Deterministic fallback — pick from palette by id hash
  const h = createHash("sha256").update(agent.slug).digest();
  return COLOR_PALETTE[h[0]! % COLOR_PALETTE.length]!;
}

// Deterministic hash → axis indexes
function pickByHash(seed: string, axes: string[][]): string[] {
  const h = createHash("sha256").update(seed).digest();
  return axes.map((axis, i) => {
    const offset = (h[i % h.length]! << 8) | h[(i + 1) % h.length]!;
    return axis[offset % axis.length]!;
  });
}

function buildAvatarPrompt(agent: { id: number; slug: string; name: string; title: string | null; specialty: string | null }): string {
  const seed = `${agent.id}-${agent.slug}`;
  const [face, hairStyle, eyewear, expression, outfit, angle] =
    pickByHash(seed, [FACE_SHAPES, HAIR_STYLES, EYEWEAR, EXPRESSIONS, OUTFITS, ANGLES]);

  const bgColor = bgColorForAgent(agent);

  return [
    // STYLE — bold graphic novel / webtoon character portrait
    "bold graphic novel portrait illustration",
    "thick clean black outlines, flat color fills, no gradients, no halftones",
    "webtoon / indie comic book character design",
    `solid ${bgColor} background, character in black and white with bold thick ink outlines`,
    "high contrast, crisp edges, professionally illustrated avatar",
    // SUBJECT — half-body waist-up framing for round avatar AND card portrait use
    `${angle} half-body portrait of a person, waist-up showing head shoulders and upper torso`,
    `${face} face`,
    `${hairStyle} hair`,
    eyewear === "no glasses" ? "" : eyewear,
    `${expression} expression`,
    `wearing ${outfit}`,
    "subject centered with space above head and below shoulders for safe cropping",
    // CONSTRAINTS
    "no text, no logos, no watermarks, no background elements, clean avatar",
  ].filter(Boolean).join(", ").slice(0, 900);
}

async function generateImage(prompt: string): Promise<Buffer> {
  const url = `${AZ_ENDPOINT}/openai/deployments/${AZ_DEPLOYMENT}/images/generations?api-version=${AZ_API_VERSION}`;
  const MAX_RETRIES = 5;
  let lastErr = "";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${AZ_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, size: "1024x1024", quality: QUALITY, output_format: "png", n: 1 }),
    });
    if (resp.status === 429 || resp.status === 503) {
      const t = await resp.text();
      lastErr = `Azure ${resp.status}: ${t.slice(0, 200)}`;
      const wait = 15000 * (attempt + 1);
      process.stdout.write(`(429, retry in ${wait/1000}s) `);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`Azure ${resp.status}: ${t.slice(0, 300)}`);
    }
    const data: any = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error(`no image: ${JSON.stringify(data).slice(0, 200)}`);
    return Buffer.from(b64, "base64");
  }
  throw new Error(`Azure 429 after ${MAX_RETRIES} retries: ${lastErr}`);
}

async function main() {
  const pool = getPool();
  console.log("===== generateAgentAvatars =====");
  console.log(`endpoint:   ${AZ_ENDPOINT}`);
  console.log(`deployment: ${AZ_DEPLOYMENT}`);
  console.log(`quality:    ${QUALITY}`);
  console.log(`limit:      ${LIMIT || "none"}`);
  console.log(`reuse:      ${REUSE}`);
  console.log(`dry-run:    ${DRY}\n`);

  let where = "isAvailable = 1";
  if (REUSE) where += " AND (avatarUrl IS NULL OR avatarUrl = '')";
  if (SLUG) where += ` AND slug = '${SLUG.replace(/'/g, "''")}'`;
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : "";

  const [rows]: any = await pool.execute(
    `SELECT id, slug, name, title, specialty, avatarUrl
       FROM agents
      WHERE ${where}
      ORDER BY id ASC
      ${limitSql}`
  );

  console.log(`Agents to avatar: ${rows.length}\n`);
  if (rows.length === 0) { await closePool(); return; }

  let ok = 0, fail = 0;
  for (const r of rows as any[]) {
    const prompt = buildAvatarPrompt({
      id: r.id, slug: String(r.slug ?? `a${r.id}`),
      name: String(r.name ?? ""), title: r.title, specialty: r.specialty,
    });

    process.stdout.write(`[${r.id}] ${r.slug} ... `);

    if (DRY) {
      console.log("[dry-run]");
      console.log(`   ${prompt.slice(0, 200)}`);
      ok++;
      continue;
    }

    try {
      const buf = await generateImage(prompt);
      const safeSlug = String(r.slug).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
      const filePath = join(COVERS_DIR, `agent-${safeSlug}.png`);
      writeFileSync(filePath, buf);
      const url = `${COVERS_URL_PREFIX}/agent-${safeSlug}.png`;
      await pool.execute("UPDATE agents SET avatarUrl = ? WHERE id = ?", [url, r.id]);
      console.log(`OK (${(buf.length / 1024).toFixed(0)}KB)`);
      ok++;
    } catch (e: any) {
      console.log(`FAIL: ${e.message?.slice(0, 200)}`);
      fail++;
    }
  }

  console.log(`\n=== Done === ok=${ok} fail=${fail}`);
  const [check]: any = await pool.execute(
    "SELECT COUNT(*) AS n FROM agents WHERE avatarUrl IS NOT NULL AND avatarUrl != ''"
  );
  console.log(`Agents with avatar: ${check[0].n}`);
  await closePool();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
