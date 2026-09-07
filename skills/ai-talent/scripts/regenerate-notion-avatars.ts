/**
 * regenerate-notion-avatars — bulk-rebuild all surfaced agents'
 * avatars in the Notion-style aesthetic CJ approved on 2026-04-30.
 *
 * Modes (ENV-controlled):
 *   AGENTS=bound_to_active   (default) — only agents bound to active
 *                              task_catalog rows (squads' crews + atomic
 *                              agents). ~10-20 images.
 *   AGENTS=all               — every agent in DB. WARNING: ~14k agents,
 *                              gpt-image-1 cost ~$0.04 each = thousands
 *                              of dollars. Don't run blindly.
 *   AGENTS=ids:1,2,3         — explicit comma-separated ID list.
 *
 *   FORCE=1                  — regenerate even if agent-<slug>.1024.png
 *                              already exists. Default skip-if-exists.
 *
 *   LIMIT=N                  — cap the run. Useful for previewing 5
 *                              before committing to the full batch.
 *
 * Per-agent prompt is auto-derived from agent.specialty + agent.title
 * via a single callLLM round-trip — keeps each avatar distinctive
 * without us hand-writing 14k prompts.
 *
 * Pipeline per agent: gpt-image-1 1024 → sharp resize → 64/128/256/512
 * variants. avatarUrl in DB → /static/covers/agent-<slug>.png.
 */
import "dotenv/config";
import { existsSync, writeFileSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import mysql from "mysql2/promise";
import { callLLM } from "../server/platform/core/llmRouter";

const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/marketing-os/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";
mkdirSync(COVERS_DIR, { recursive: true });

const AVATAR_SIZES = [64, 128, 256, 512] as const;

const NOTION_BASE_PROMPT = `Flat 2D vector illustration in Notion-style aesthetic. Head-and-shoulders portrait. Character drawn entirely in solid black silhouette with selective white highlights only for facial features (eyes, nose, mouth, hair detail) — no gradients, no shading complexity. Background is a single solid pastel color filling the entire frame edge to edge. Hand-drawn outline character, friendly and professional. Square 1:1 composition. Modern, clean, approachable. Asian character. Subject takes up most of the frame.`;

const PASTEL_BG = [
  "#B89AFF", "#FFB89A", "#9AFFB8", "#9AC8FF", "#FFE89A",
  "#FF9AC8", "#9AFFE8", "#E89AFF", "#FFC89A", "#9AE8FF",
];
function pickBg(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PASTEL_BG[h % PASTEL_BG.length]!;
}

interface Agent {
  id: number; slug: string; name: string;
  title: string; specialty: string;
  primarySkill: string;
  avatarUrl: string | null;
}

async function genAvatarBase(prompt: string, savePath: string, bgHex: string): Promise<void> {
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const fullPrompt = `${NOTION_BASE_PROMPT}\n\nBackground color: solid ${bgHex} pastel.\n\nSubject details: ${prompt}`;
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1", prompt: fullPrompt,
      size: "1024x1024", quality: "high", n: 1,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data: any = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI no b64");
  writeFileSync(savePath, Buffer.from(b64, "base64"));
}

async function makeVariants(basePath: string, slug: string): Promise<void> {
  let sharp: any = null;
  try { sharp = (await import("sharp")).default; } catch { /* */ }
  if (!sharp) { console.warn(`    ⚠ sharp not installed — keeping only 1024 base`); return; }
  for (const size of AVATAR_SIZES) {
    const out = join(COVERS_DIR, `agent-${slug}.${size}.png`);
    try {
      await sharp(basePath).resize(size, size, { fit: "cover", position: "centre" })
        .png({ compressionLevel: 9, palette: size <= 128 }).toFile(out);
    } catch (e: any) { console.warn(`    ⚠ resize ${size}: ${e.message}`); }
  }
}

/** LLM-derive a 1-2 sentence visual prompt from agent.specialty/title.
 *  Falls back to a generic prompt if LLM fails. */
async function derivePromptForAgent(a: Agent): Promise<string> {
  const sys = `You write SHORT visual avatar descriptions for marketing-agency role-playing AI agents. Output 1-2 English sentences only — describing a person's appearance (gender, hair, glasses, clothing, expression, optional small object hinting at their specialty). NO background description. NO meta talk.`;
  const user = `Agent: ${a.name} (${a.title || "specialist"})\nSpecialty: ${(a.specialty || a.primarySkill || "marketing").slice(0, 300)}\n\nWrite a 1-2 sentence visual description.`;
  try {
    const r = await callLLM({ system: sys, user, maxTokens: 200, timeoutMs: 25_000 });
    const t = r.text.trim().replace(/^["']|["']$/g, "");
    if (t.length > 20) return t;
  } catch { /* fall through */ }
  // Fallback — generic Asian professional, gender derived from name heuristic
  return `Asian professional in their late 20s. Friendly expression. Casual professional attire.`;
}

function urlFor(slug: string): string {
  return `${COVERS_URL_PREFIX}/agent-${slug}.png`;
}

async function loadAgents(pool: mysql.Pool): Promise<Agent[]> {
  const mode = process.env.AGENTS ?? "bound_to_active";
  if (mode.startsWith("ids:")) {
    const ids = mode.slice(4).split(",").map((x) => Number(x.trim())).filter(Boolean);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const [rows]: any = await pool.execute(
      `SELECT id, slug, name, title, specialty, primarySkill, avatarUrl
         FROM agents WHERE id IN (${placeholders})`,
      ids,
    );
    return rows as Agent[];
  }
  if (mode === "all") {
    const [rows]: any = await pool.execute(
      `SELECT id, slug, name, title, specialty, primarySkill, avatarUrl
         FROM agents WHERE slug IS NOT NULL AND slug <> ''
         ORDER BY id ASC`,
    );
    return rows as Agent[];
  }
  // Default: agents bound to active catalog tasks. Three sources:
  // 1. atomic tasks' agent_id
  // 2. squad-impl tasks' bound squad → agents JSON
  // 3. Squad lead too (if separate)
  const ids = new Set<number>();
  const [atomic]: any = await pool.execute(
    `SELECT DISTINCT agent_id FROM task_catalog
      WHERE status = 'active' AND impl_kind = 'atomic' AND agent_id IS NOT NULL`,
  );
  for (const r of (atomic as any[])) ids.add(Number(r.agent_id));

  const [squads]: any = await pool.execute(
    `SELECT s.id, s.agents, s.lead_agent_id FROM squads s
       JOIN task_catalog t ON t.squad_id = s.id
      WHERE t.status = 'active' AND t.impl_kind = 'squad'`,
  );
  for (const r of (squads as any[])) {
    if (r.lead_agent_id) ids.add(Number(r.lead_agent_id));
    try {
      const arr = typeof r.agents === "string" ? JSON.parse(r.agents) : r.agents;
      if (Array.isArray(arr)) for (const a of arr) {
        const id = Number(a?.id); if (Number.isFinite(id)) ids.add(id);
      }
    } catch { /* */ }
  }
  if (ids.size === 0) return [];
  const list = [...ids];
  const placeholders = list.map(() => "?").join(",");
  const [rows]: any = await pool.execute(
    `SELECT id, slug, name, title, specialty, primarySkill, avatarUrl
       FROM agents WHERE id IN (${placeholders}) ORDER BY id`,
    list,
  );
  return rows as Agent[];
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  const force = process.env.FORCE === "1";
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : null;
  const mode = process.env.AGENTS ?? "bound_to_active";

  let agents = await loadAgents(pool);
  if (limit) agents = agents.slice(0, limit);
  console.log(`[regenerate-notion-avatars] mode=${mode}, force=${force}, ${agents.length} agent(s)\n`);
  if (mode === "all" && agents.length > 100 && !process.env.I_KNOW_THE_COST) {
    console.warn(`✗ AGENTS=all selected ${agents.length} agents. gpt-image-1 cost ~$0.04 ea = ~$${(agents.length * 0.04).toFixed(0)}.`);
    console.warn(`  Set I_KNOW_THE_COST=1 to actually run, or use LIMIT=10 to sample first.`);
    await pool.end(); process.exit(1);
  }

  let done = 0, skipped = 0, failed = 0;
  for (const a of agents) {
    if (!a.slug) { console.log(`  ⚠ #${a.id} no slug — skipping`); skipped++; continue; }
    const basePath = join(COVERS_DIR, `agent-${a.slug}.png`);
    if (!force && existsSync(basePath) && statSync(basePath).size > 50_000) {
      console.log(`  ↪ #${a.id} ${a.slug} — already has Notion avatar (size > 50KB), skipping`);
      skipped++;
      continue;
    }
    try {
      const visual = await derivePromptForAgent(a);
      const bg = pickBg(a.slug);
      console.log(`  → #${a.id} ${a.name} (${a.slug})`);
      console.log(`    bg=${bg}  prompt="${visual.slice(0, 120)}…"`);
      await genAvatarBase(visual, basePath, bg);
      await makeVariants(basePath, a.slug);
      // Update avatarUrl if not already canonical
      const targetUrl = urlFor(a.slug);
      if (a.avatarUrl !== targetUrl) {
        await pool.execute(`UPDATE agents SET avatarUrl = ? WHERE id = ?`, [targetUrl, a.id]);
      }
      done++;
      console.log(`    ✓ saved + ${AVATAR_SIZES.length} variants`);
    } catch (e: any) {
      failed++;
      console.error(`    ✗ ${e?.message ?? e}`);
    }
  }

  console.log(`\n[regenerate-notion-avatars] done=${done} skipped=${skipped} failed=${failed}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
