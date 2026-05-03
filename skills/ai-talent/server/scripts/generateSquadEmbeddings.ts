/**
 * generateSquadEmbeddings.ts
 *
 * Batch-generates Azure OpenAI embeddings for all active squads and
 * persists them to squad_embeddings (mos_db).
 *
 * Run:
 *   cd /opt/ai-talent
 *   npx tsx server/scripts/generateSquadEmbeddings.ts
 *
 * Env vars required:
 *   AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_EMBEDDING_DEPLOYMENT
 *   LOCAL_DB_HOST, LOCAL_DB_USER, LOCAL_DB_PASSWORD, LOCAL_DB_NAME
 *
 * Idempotent: skips rows where content_hash matches (squad unchanged).
 * Re-run freely; only changed / new squads incur API calls.
 */

import * as crypto from "crypto";
import * as dotenv from "dotenv";
import localPool from "../localDb.js";
import { getEmbedding } from "../_core/embedding.js";

dotenv.config({ path: ".env" });

// ── helpers ──────────────────────────────────────────────────────────────────

function safeJson(v: any): any {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(String(v)); } catch { return String(v); }
}

function squadContentString(row: any): string {
  const name =
    String(row.name_zh ?? row.name ?? "");
  const desc =
    String(row.description_zh ?? row.description ?? "");
  const tags = (() => {
    const t = safeJson(row.tags);
    if (Array.isArray(t)) return t.join(" ");
    if (typeof t === "string") return t;
    return "";
  })();
  const useCases = (() => {
    const u = safeJson(row.use_cases ?? row.useCases);
    if (Array.isArray(u)) return u.join(" ");
    return "";
  })();
  const workspace = (() => {
    const w = safeJson(row.workspace);
    if (Array.isArray(w)) return w.join(" ");
    if (typeof w === "string") return w;
    return "";
  })();
  const slug = String(row.slug ?? "");

  return [name, desc, tags, useCases, workspace, slug]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" | ");
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("▶ generateSquadEmbeddings starting…");

  // 1. Fetch all active squads
  const [rows]: any = await localPool.execute(
    `SELECT id, slug, name, name_zh, description, description_zh,
            tags, use_cases, workspace
       FROM squads
      WHERE is_active = 1
      ORDER BY id`
  );
  console.log(`   ${rows.length} active squads found`);

  // 2. Load existing embeddings (for hash comparison)
  const [existing]: any = await localPool.execute(
    "SELECT squad_id, content_hash FROM squad_embeddings"
  );
  const hashMap = new Map<number, string>(
    existing.map((r: any) => [Number(r.squad_id), String(r.content_hash)])
  );
  console.log(`   ${hashMap.size} existing embedding rows`);

  let inserted = 0, updated = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const squadId = Number(row.id);
    const content = squadContentString(row);
    const hash = sha256(content);

    if (hashMap.get(squadId) === hash) {
      skipped++;
      continue;
    }

    // Rate-limit: ~10 req/s to stay well under Azure limits
    await sleep(110);

    const embedding = await getEmbedding(content);
    if (!embedding) {
      console.warn(`   ✗ squad ${squadId} (${row.slug}) — embedding failed`);
      failed++;
      continue;
    }

    const embeddingJson = JSON.stringify(embedding);

    if (hashMap.has(squadId)) {
      // Update existing row
      await localPool.execute(
        `UPDATE squad_embeddings
            SET embedding = ?, content_hash = ?, updated_at = NOW()
          WHERE squad_id = ?`,
        [embeddingJson, hash, squadId]
      );
      updated++;
    } else {
      // Insert new row
      await localPool.execute(
        `INSERT INTO squad_embeddings (squad_id, content_hash, embedding)
         VALUES (?, ?, ?)`,
        [squadId, hash, embeddingJson]
      );
      inserted++;
    }

    if ((inserted + updated) % 50 === 0) {
      console.log(`   … ${inserted + updated} processed`);
    }
  }

  console.log(`\n✅ Done.`);
  console.log(`   inserted: ${inserted}  updated: ${updated}  skipped: ${skipped}  failed: ${failed}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
