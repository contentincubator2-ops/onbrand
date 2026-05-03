/**
 * compute-skill-embeddings.ts
 *
 * Batch-generates Azure OpenAI embeddings for active skills and stores
 * them in skills.embedding (LONGTEXT, JSON float array).
 *
 * Run:
 *   cd /opt/marketing-os/app/skills/ai-talent
 *   ./node_modules/.bin/tsx scripts/compute-skill-embeddings.ts [--force] [--limit=N]
 *
 * Idempotent: skips skills that already have embedding IS NOT NULL.
 * --force  → re-embed all active skills (e.g. after model change)
 * --limit  → only process first N skills (for testing)
 *
 * Env vars: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_EMBEDDING_DEPLOYMENT
 *           LOCAL_DB_HOST, LOCAL_DB_USER, LOCAL_DB_PASSWORD, LOCAL_DB_NAME
 */

import { createPool } from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function getEmbedding(text: string): Promise<number[] | null> {
  const endpoint   = process.env.AZURE_OPENAI_ENDPOINT ?? "";
  const apiKey     = process.env.AZURE_OPENAI_KEY ?? "";
  const deployment = process.env.AZURE_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-large";
  if (!endpoint || !apiKey) { console.error("[embed-skills] Missing Azure env vars"); return null; }
  try {
    const resp = await fetch(
      `${endpoint}/openai/deployments/${deployment}/embeddings?api-version=2024-02-01`,
      {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ input: text.slice(0, 2000) }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!resp.ok) { console.error(`[embed-skills] API ${resp.status}: ${(await resp.text()).slice(0,200)}`); return null; }
    const data = (await resp.json()) as any;
    return data?.data?.[0]?.embedding ?? null;
  } catch (e) { console.error("[embed-skills] fetch error:", e); return null; }
}

function safeJson<T>(v: unknown, fallback: T): T {
  if (!v || v === "null") return fallback;
  if (typeof v === "object") return v as T;
  try { return JSON.parse(v as string) as T; } catch { return fallback; }
}

async function main() {
  const forceAll = process.argv.includes("--force");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const hardLimit = limitArg ? parseInt(limitArg.split("=")[1]!) : null;

  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     ?? "localhost",
    port:     parseInt(process.env.LOCAL_DB_PORT ?? "3306"),
    user:     process.env.LOCAL_DB_USER     ?? "mos_user",
    password: process.env.LOCAL_DB_PASSWORD ?? "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     ?? "mos_db",
    charset:  "utf8mb4",
  });
  const conn = await pool.getConnection();
  console.log("[embed-skills] Connected to mos_db");

  // Ensure embedding column exists
  try {
    await conn.execute("ALTER TABLE skills ADD COLUMN embedding LONGTEXT NULL");
    console.log("[embed-skills] Created skills.embedding column");
  } catch { /* already exists */ }

  const whereClause = forceAll
    ? "is_active = 1"
    : "embedding IS NULL AND is_active = 1";
  const limitClause = hardLimit ? `LIMIT ${hardLimit}` : "";

  const [rows] = await conn.execute(
    `SELECT id, slug, name, name_zh, description, description_zh, task_type, tags, workspace
       FROM skills WHERE ${whereClause} ORDER BY quality_score DESC, id ASC ${limitClause}`
  ) as any[];

  const skills = rows as any[];
  console.log(`[embed-skills] ${skills.length} skills to embed${forceAll ? " (force-all)" : ""}`);

  let success = 0, failed = 0;

  for (let i = 0; i < skills.length; i++) {
    const s = skills[i]!;
    const tags      = safeJson<string[]>(s.tags, []);
    const workspace = safeJson<string[]>(s.workspace, []);

    const parts = [
      s.name_zh       ? `技能：${s.name_zh}`          : (s.name ? `Skill: ${s.name}` : null),
      s.description_zh ? `描述：${s.description_zh}`  : (s.description ? `Description: ${s.description}` : null),
      s.task_type     ? `任務類型：${s.task_type}`     : null,
      tags.length     ? `標籤：${tags.join("、")}`      : null,
      workspace.length ? `工作區：${workspace.join("、")}` : null,
      s.slug          ? `slug: ${s.slug}`              : null,
    ].filter(Boolean);

    const embedText = parts.join(" | ").slice(0, 2000);
    const embedding = await getEmbedding(embedText);

    if (embedding) {
      await conn.execute(
        "UPDATE skills SET embedding = ? WHERE id = ?",
        [JSON.stringify(embedding), s.id]
      );
      success++;
      if ((i + 1) % 50 === 0 || i === skills.length - 1) {
        console.log(`[embed-skills] ${i + 1}/${skills.length} — skill #${s.id} "${s.name ?? s.slug}" OK`);
      }
    } else {
      failed++;
      console.warn(`[embed-skills] Skill #${s.id} "${s.name ?? s.slug}": FAILED`);
    }

    // ~100ms between calls — stay under Azure rate limits
    if (i < skills.length - 1) await new Promise(r => setTimeout(r, 110));
  }

  console.log(`\n[embed-skills] Done. success=${success} failed=${failed}`);
  conn.release();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
