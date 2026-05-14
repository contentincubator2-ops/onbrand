/**
 * classifySquadTasks.ts — LLM-driven classifier giving each squad a
 * clean human-readable task label + mockup variant tag.
 *
 * Per squad, sends name + description + steps + tags + workspace to
 * Azure Foundry gpt-4o-mini, parses JSON back, writes:
 *   - squads.task_label_zh        e.g. "Facebook 月度行事曆", "品牌定位書"
 *   - squads.task_label_en        e.g. "Facebook Monthly Calendar"
 *   - squads.mockup_platform      instagram|facebook|linkedin|youtube|tiktok|generic
 *   - squads.mockup_format        feed|reel|story|calendar|article|swot|persona|...
 *   - squads.output_kind          strategic|content
 *   - squads.classified_task_at   now
 *
 * Cost: ~688 squads × ~600 tok in + ~120 tok out, batched 20 per call,h
 * ~$0.20 USD on gpt-4o-mini.
 *
 * Auto-migrates the 6 columns on first run (idempotent ALTER TABLE).
 *h
 * Flags:
 *   --limit N         only classify first N unclassified squads
 *   --reclassify      include rows that already have classified_task_at
 *   --batch N         squads per LLM call (default 20; max 30)
 *   --sample          tiny test mode (5 squads, dry-run, prints stdout)
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const limArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limArg ? parseInt(limArg.split("=")[1] ?? "0", 10) : 0;
const RECLASSIFY = process.argv.includes("--reclassify");
const batchArg = process.argv.find((a) => a.startsWith("--batch="));
const BATCH = Math.min(30, batchArg ? parseInt(batchArg.split("=")[1] ?? "20", 10) : 20);
const SAMPLE = process.argv.includes("--sample");

const AZURE_KEY = process.env.AZURE_FOUNDRY_API_KEY ?? process.env.AZURE_AI_API_KEY ?? "";
const AZURE_ENDPOINT = (
  process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT ??
  process.env.AZURE_AI_ENDPOINT ??
  "https://sowork-foundry-claw-api-router.services.ai.azure.com/api/projects/onbrand"
).replace(/\/+$/, "");
const AZURE_DEPLOYMENT = process.env.AZURE_FOUNDRY_MODEL ?? "gpt-4o-mini";

if (!AZURE_KEY) { console.error("Missing AZURE_FOUNDRY_API_KEY"); process.exit(2); }

/* ─── Mockup variant enum communicated to the LLM ─────────────────── */

const MOCKUP_VARIANTS = `
PLATFORM × FORMAT enum (use these exact strings; pick "generic" + "generic" when none fits):

instagram: feed | carousel | reel | story | live | profile | ad
facebook:  feed | reel | story | marketplace | event | ad | carousel
linkedin:  feed | article | newsletter | poll | document | native-video | ad | event
youtube:   video-card | watch | shorts | community | premiere | live
tiktok:    foryou | carousel | live | profile
generic:   generic   ← use for STRATEGIC outputs (SWOT / persona / brief / framework / report / plan)
`;

const SYSTEM_PROMPT = `
You are a marketing strategist who labels marketing methodology squads
(small AI agent teams that produce a deliverable). For each squad,
output ONE concise task label that says what the user actually gets
when they run this squad.

GOAL: give a marketer-readable label they instantly recognize.

GOOD examples (ZH-TW):
  - "Facebook 月度行事曆"
  - "Instagram Reels 短影音腳本"
  - "品牌定位書"
  - "SWOT 競爭分析"
  - "受眾 Persona 卡"
  - "YouTube 縮圖 A/B 測試"
  - "LinkedIn 思想領袖長文"
  - "電子報每週 issue"
  - "新品上市 90 天計畫"
  - "TikTok For-You 短片"

BAD examples (DON'T do this):
  - "Jab Jab Jab Right Hook" (methodology jargon, doesn't say what you get)
  - "Content Strategy" (too vague)
  - "Engagement" (too abstract)

Also tag a mockup variant — what platform/format the deliverable
should look like in the preview. Strategic outputs (research, frameworks,
analysis) get platform=generic, format=generic.

OUTPUT FORMAT — strict JSON, no prose:
{
  "items": [
    {
      "id": <number, the squad id you were given>,
      "task_label_zh": "<concise zh-TW label, ≤20 chars>",
      "task_label_en": "<concise en label, ≤30 chars>",
      "mockup_platform": "<one of: instagram|facebook|linkedin|youtube|tiktok|generic>",
      "mockup_format": "<one of the format strings above>",
      "output_kind": "<strategic|content>"
    },
    ...
  ]
}

${MOCKUP_VARIANTS}
`.trim();

/* ─── DB helpers ──────────────────────────────────────────────────── */

interface SquadRow {
  id: number;
  slug: string;
  name: string | null;
  description: string | null;
  workspace: string | null;
  tags: string | null;
  output_formats: string | null;
  steps: string | null;
}

async function ensureColumns(pool: any) {
  const cols = ["task_label_zh", "task_label_en", "mockup_platform", "mockup_format", "output_kind", "classified_task_at"];
  for (const col of cols) {
    const [rows]: any = await pool.execute(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'squads' AND COLUMN_NAME = ?`,
      [col],
    );
    const c = Number(rows?.[0]?.c ?? 0);
    if (c > 0) continue;
    const ddl = (() => {
      switch (col) {
        case "task_label_zh":      return "ALTER TABLE squads ADD COLUMN task_label_zh VARCHAR(80) NULL";
        case "task_label_en":      return "ALTER TABLE squads ADD COLUMN task_label_en VARCHAR(120) NULL";
        case "mockup_platform":    return "ALTER TABLE squads ADD COLUMN mockup_platform VARCHAR(32) NULL";
        case "mockup_format":      return "ALTER TABLE squads ADD COLUMN mockup_format VARCHAR(64) NULL";
        case "output_kind":        return "ALTER TABLE squads ADD COLUMN output_kind VARCHAR(16) NULL";
        case "classified_task_at": return "ALTER TABLE squads ADD COLUMN classified_task_at DATETIME(3) NULL";
        default: throw new Error("unknown col " + col);
      }
    })();
    await pool.execute(ddl);
    console.log(`  ✓ added column squads.${col}`);
  }
}

async function fetchSquads(pool: any): Promise<SquadRow[]> {
  let where = "1=1";
  if (!RECLASSIFY) where += " AND classified_task_at IS NULL";
  const lim = SAMPLE ? "LIMIT 5" : LIMIT ? `LIMIT ${LIMIT}` : "";
  const [rows]: any = await pool.execute(
    `SELECT id, slug, name, description, workspace, tags, output_formats, steps
       FROM squads WHERE ${where} ORDER BY id ASC ${lim}`,
  );
  return rows as SquadRow[];
}

function summarizeSquad(s: SquadRow): string {
  const parseJson = (raw: string | null) => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };
  const name = (() => {
    const n = parseJson(s.name);
    if (n?.["zh-TW"]) return n["zh-TW"];
    if (n?.en) return n.en;
    return typeof s.name === "string" ? s.name : s.slug;
  })();
  const desc = (() => {
    const d = parseJson(s.description);
    if (d?.["zh-TW"]) return d["zh-TW"];
    if (d?.en) return d.en;
    return typeof s.description === "string" ? s.description : "";
  })();
  const ws = parseJson(s.workspace) ?? [];
  const tags = parseJson(s.tags) ?? [];
  const outs = parseJson(s.output_formats) ?? [];
  const steps = parseJson(s.steps) ?? [];
  const stepNames = (Array.isArray(steps) ? steps : [])
    .slice(0, 5)
    .map((st: any) => st.name ?? st.title ?? "")
    .filter(Boolean)
    .join(" / ");
  return [
    `id=${s.id}`,
    `slug=${s.slug}`,
    `name=${name}`,
    desc ? `desc=${String(desc).slice(0, 200)}` : "",
    Array.isArray(ws) && ws.length ? `workspace=${ws.join(",")}` : "",
    Array.isArray(tags) && tags.length ? `tags=${tags.slice(0, 6).join(",")}` : "",
    Array.isArray(outs) && outs.length ? `outputs=${outs.join(",")}` : "",
    stepNames ? `steps=${stepNames}` : "",
  ].filter(Boolean).join(" | ");
}

/* ─── LLM call ────────────────────────────────────────────────────── */

// Endpoint can be either format (matches classifySkills.ts):
//   Foundry router:  https://*.services.ai.azure.com  → /openai/v1/chat/completions, model in body
//   Azure OpenAI:    https://*.openai.azure.com       → /openai/deployments/{name}/chat/completions?api-version=...
const IS_AZURE_OPENAI = AZURE_ENDPOINT.includes("openai.azure.com");
const URL_PATH = IS_AZURE_OPENAI
  ? `/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=2024-10-01-preview`
  : `/openai/v1/chat/completions`;

async function callLLM(squads: SquadRow[]): Promise<any[]> {
  const userMsg = squads.map(summarizeSquad).join("\n");
  const url = `${AZURE_ENDPOINT}${URL_PATH}`;
  const body: any = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
    temperature: 0.2,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  };
  // Foundry router needs `model` in body; Azure OpenAI doesn't (deployment in URL).
  if (!IS_AZURE_OPENAI) body.model = AZURE_DEPLOYMENT;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "api-key": AZURE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Azure ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`empty content: ${JSON.stringify(data).slice(0, 200)}`);
  const parsed = JSON.parse(content);
  return parsed.items ?? [];
}

/* ─── Main ────────────────────────────────────────────────────────── */

async function main() {
  const pool = getPool();
  console.log("===== classifySquadTasks =====");
  console.log(`endpoint:   ${AZURE_ENDPOINT}`);
  console.log(`deployment: ${AZURE_DEPLOYMENT}`);
  console.log(`limit:      ${LIMIT || "none"}`);
  console.log(`batch:      ${BATCH}`);
  console.log(`reclassify: ${RECLASSIFY}`);
  console.log(`sample:     ${SAMPLE}\n`);

  console.log("Ensuring columns…");
  await ensureColumns(pool);

  const squads = await fetchSquads(pool);
  console.log(`\nSquads to classify: ${squads.length}\n`);
  if (squads.length === 0) { await closePool(); return; }

  let ok = 0, fail = 0;
  for (let i = 0; i < squads.length; i += BATCH) {
    const batch = squads.slice(i, i + BATCH);
    process.stdout.write(`[${i + 1}-${i + batch.length}/${squads.length}] `);
    try {
      const items = await callLLM(batch);
      if (SAMPLE) {
        console.log("\n--- DRY RUN ---");
        console.log(JSON.stringify(items, null, 2));
        ok += items.length;
        continue;
      }
      for (const item of items) {
        if (!item?.id) { fail++; continue; }
        await pool.execute(
          `UPDATE squads SET
             task_label_zh = ?, task_label_en = ?,
             mockup_platform = ?, mockup_format = ?,
             output_kind = ?, classified_task_at = NOW(3)
           WHERE id = ?`,
          [
            String(item.task_label_zh ?? "").slice(0, 80),
            String(item.task_label_en ?? "").slice(0, 120),
            String(item.mockup_platform ?? "generic").slice(0, 32),
            String(item.mockup_format ?? "generic").slice(0, 64),
            String(item.output_kind ?? "content").slice(0, 16),
            Number(item.id),
          ],
        );
        ok++;
      }
      console.log(`OK (${items.length})`);
    } catch (e: any) {
      console.log(`FAIL: ${e.message?.slice(0, 200)}`);
      fail += batch.length;
    }
  }

  console.log(`\n=== Done === ok=${ok} fail=${fail}`);
  const [check]: any = await pool.execute(
    "SELECT COUNT(*) AS n FROM squads WHERE classified_task_at IS NOT NULL",
  );
  console.log(`Squads classified total: ${check[0].n}`);

  // Summary: top task labels
  if (!SAMPLE) {
    const [top]: any = await pool.execute(
      `SELECT task_label_zh, COUNT(*) AS n FROM squads
       WHERE task_label_zh IS NOT NULL AND task_label_zh != ''
       GROUP BY task_label_zh ORDER BY n DESC LIMIT 20`,
    );
    console.log(`\nTop 20 task labels:`);
    for (const r of top) console.log(`  ${r.n}× ${r.task_label_zh}`);
  }

  await closePool();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
