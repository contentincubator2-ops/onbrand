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

// ── Variable system for B&W line-art portraits ───────────────────────────
// Style is FIXED (white bg + black line). Variety comes from facial features,
// hair, accessories, pose. 6 × 10 × 5 × 6 × 7 × 4 = 50,400 combinations.
const FACE_SHAPES   = ["oval", "round", "square", "heart-shaped", "long", "diamond"];
const HAIR_STYLES   = ["short crop", "shoulder-length wavy", "high ponytail", "top knot", "curly afro", "long straight", "braided", "buzz cut", "bob cut", "dreadlocks"];
const EYEWEAR       = ["no glasses", "round wire glasses", "square frames", "thin oval glasses", "minimal half-rim glasses"];
const EXPRESSIONS   = ["subtle smile", "confident neutral", "calm focused", "thoughtful", "warm welcoming", "serene"];
const OUTFITS       = ["collared shirt with simple tie", "open-collar shirt", "turtleneck sweater", "casual hoodie", "blazer over t-shirt", "minimal jumpsuit", "polo shirt"];
const ANGLES        = ["front-facing", "three-quarter left turn", "three-quarter right turn", "subtle profile"];

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

  return [
    // STYLE — fixed: black ink line drawing on pure white background
    "single-line minimalist portrait illustration",
    "pure black ink lines on solid pure white background",
    "no color, no shading, no fills, no gradients, no halftones",
    "thin clean continuous lines, vector-like quality",
    "minimalist editorial portrait, gallery line art aesthetic",
    // SUBJECT — variable
    `${angle} head-and-shoulders portrait of a person`,
    `${face} face`,
    `${hairStyle} hair`,
    eyewear === "no glasses" ? "" : eyewear,
    `${expression} expression`,
    `wearing ${outfit}`,
    // CONSTRAINTS
    "centered composition, balanced negative space, no text, no logos, no watermarks",
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
