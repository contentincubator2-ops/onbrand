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

// ── 10-axis variable system (≈ 56M combinations) ─────────────────────────────
const FACE_SHAPES = ["oval", "round", "square", "heart", "long", "diamond"];
const SKIN_TONES = ["fair beige", "honey", "warm tan", "deep brown", "olive", "rosy", "stylised pale blue"];
const HAIR_STYLES = ["short crop", "shoulder-length wavy", "high ponytail", "top knot", "curly afro", "long straight", "braided", "buzz cut", "bob cut", "dreadlocks"];
const HAIR_COLORS = ["jet black", "warm brown", "honey blonde", "auburn red", "silver grey", "pastel lavender", "mint green", "rose pink"];
const EYEWEAR = ["no glasses", "round glasses", "square glasses", "sunglasses", "thin wire frames"];
const EXPRESSIONS = ["soft smile", "confident gaze", "serious focus", "thoughtful look", "warm welcoming smile", "calm composure"];
const OUTFITS = ["tailored blazer", "casual t-shirt", "turtleneck", "designer hoodie", "creative jumpsuit", "utility shirt", "academic cardigan"];
const BG_COLORS = ["soft cream", "muted blue", "sage green", "blush pink", "warm peach", "lavender mist", "buttery yellow", "neutral grey"];
const ANGLES = ["front-facing", "three-quarter left", "three-quarter right", "soft profile"];
const ART_STYLES = [
  "flat illustration, clean vector art",
  "fine line art with soft watercolor wash",
  "modern editorial illustration, gouache",
  "minimal 3D render, matte clay finish",
  "bold geometric flat illustration",
];

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
  const [face, skin, hairStyle, hairColor, eyewear, expression, outfit, bg, angle, art] =
    pickByHash(seed, [FACE_SHAPES, SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYEWEAR, EXPRESSIONS, OUTFITS, BG_COLORS, ANGLES, ART_STYLES]);

  const role = agent.title ?? agent.specialty ?? "professional";

  return [
    "portrait avatar, illustrated, NOT a real photograph",
    art,
    `${angle} portrait of a person who works as a ${role}`,
    `${face} face shape, ${skin} skin tone`,
    `${hairStyle}, ${hairColor} hair`,
    eyewear === "no glasses" ? "" : eyewear,
    expression,
    `wearing ${outfit}`,
    `${bg} solid background, no text, no logos`,
    "centered composition, head and shoulders, friendly approachable, premium illustration aesthetic",
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
