/**
 * compute-squad-embeddings.ts
 *
 * One-time (and incremental) script: embed every squad in squads
 * using text-embedding-3-large and store the vector in squads.embedding.
 *
 * Embed text = name | description | methodology | workspace | tags | use_cases
 *
 * Run: npm run embed:squads --prefix skills/ai-talent
 * Safe to re-run: skips squads that already have an embedding.
 */

import { createPool } from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

// ── Embedding helper ──────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[] | null> {
  const endpoint   = process.env.AZURE_OPENAI_ENDPOINT ?? "";
  const apiKey     = process.env.AZURE_OPENAI_KEY ?? "";
  const deployment = process.env.AZURE_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-large";

  if (!endpoint || !apiKey) {
    console.error("[embed-squads] Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_KEY");
    return null;
  }

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
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[embed-squads] API error ${resp.status}: ${err.slice(0, 200)}`);
      return null;
    }
    const data = (await resp.json()) as any;
    return data?.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("[embed-squads] fetch error:", e);
    return null;
  }
}

function safeJsonParse<T>(val: unknown, fallback: T): T {
  if (!val || val === "null") return fallback;
  if (typeof val === "object") return val as T;
  try { return JSON.parse(val as string) as T; } catch { return fallback; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     ?? "localhost",
    port:     parseInt(process.env.LOCAL_DB_PORT ?? "3306"),
    user:     process.env.LOCAL_DB_USER     ?? "mos_user",
    password: process.env.LOCAL_DB_PASSWORD ?? "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     ?? "mos_db",
    charset:  "utf8mb4",
  });

  const conn = await pool.getConnection();
  console.log("[embed-squads] Connected to mos_db");

  // Ensure embedding column exists
  try {
    await conn.execute(`ALTER TABLE squads ADD COLUMN embedding LONGTEXT NULL`);
    console.log("[embed-squads] Created embedding column");
  } catch { /* already exists */ }

  // Fetch squads that need (re-)embedding
  const forceAll = process.argv.includes("--force");
  const whereClause = forceAll ? "is_active = 1" : "embedding IS NULL AND is_active = 1";

  const [rows] = await conn.execute(
    `SELECT id, name, description, methodology, tags, use_cases, workspace
     FROM squads WHERE ${whereClause}
     ORDER BY id ASC`
  ) as any[];

  const squads = rows as any[];
  console.log(`[embed-squads] Squads to embed: ${squads.length}${forceAll ? " (force-all)" : ""}`);

  let success = 0, failed = 0;

  for (let i = 0; i < squads.length; i++) {
    const squad = squads[i]!;
    const tags      = safeJsonParse<string[]>(squad.tags, []);
    const useCases  = safeJsonParse<string[]>(squad.use_cases, []);
    const workspace = safeJsonParse<string[]>(squad.workspace, []);

    // Compose embed text: structured multilingual context
    const parts = [
      squad.name         ? `小組：${squad.name}`             : null,
      squad.description  ? `描述：${squad.description}`       : null,
      squad.methodology  ? `方法論：${squad.methodology}`     : null,
      workspace.length   ? `工作區：${workspace.join("、")}`  : null,
      tags.length        ? `標籤：${tags.join("、")}`         : null,
      useCases.length    ? `適用情境：${useCases.join("、")}` : null,
    ].filter(Boolean);

    const embedText = parts.join(" | ").slice(0, 2000);

    const embedding = await getEmbedding(embedText);

    if (embedding) {
      await conn.execute(
        `UPDATE squads SET embedding = ? WHERE id = ?`,
        [JSON.stringify(embedding), squad.id]
      );
      success++;
      if ((i + 1) % 10 === 0 || i === squads.length - 1) {
        console.log(`[embed-squads] Progress: ${i + 1}/${squads.length} — squad #${squad.id} "${squad.name}" OK`);
      }
    } else {
      failed++;
      console.warn(`[embed-squads] Squad #${squad.id} "${squad.name}": embedding FAILED, skipping`);
    }

    // Rate-limit: ~50ms between calls to avoid throttling
    if (i < squads.length - 1) await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n[embed-squads] Done. Success: ${success}  Failed: ${failed}`);

  conn.release();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
