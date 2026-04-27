/**
 * classifySkills.ts — LLM-driven classifier for skill→model fit.
 *
 * For each skill: send name + description + manifest snippet to
 * Azure Foundry gpt-4o-mini, parse JSON back, write into:
 *   - skills.task_type           (text|image|audio|video|search|code|multimodal|embedding)
 *   - skills.recommended_models  (JSON array, top 3 best fits from our pool)
 *   - skills.alternative_models  (JSON array, also workable)
 *   - skills.unsuitable_models   (JSON array, explicitly bad fit)
 *   - skills.classified_at       (now)
 *
 * Cost: 2,526 skills × ~400 tok in + ~150 tok out, batched 50 per LLM call,
 * ~$0.40 USD on gpt-4o-mini.
 *
 * Flags:
 *   --limit N         only classify first N unclassified skills
 *   --reclassify      include rows that already have classified_at set
 *   --batch N         skills per LLM call (default 25; max 50)
 *   --sample          tiny test mode (5 skills, dry-run, prints to stdout)
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

// ── Args ───────────────────────────────────────────────────────────────────
const limArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limArg ? parseInt(limArg.split("=")[1] ?? "0", 10) : 0;
const RECLASSIFY = process.argv.includes("--reclassify");
const batchArg = process.argv.find((a) => a.startsWith("--batch="));
const BATCH = Math.min(50, batchArg ? parseInt(batchArg.split("=")[1] ?? "25", 10) : 25);
const SAMPLE = process.argv.includes("--sample");

// ── Azure Foundry (gpt-4o-mini) ────────────────────────────────────────────
const AZURE_KEY = process.env.AZURE_AI_API_KEY ?? "";
const AZURE_ENDPOINT = (process.env.AZURE_AI_ENDPOINT ?? "https://sowork-foundry-claw-api-router.services.ai.azure.com").replace(/\/+$/, "");
const AZURE_DEPLOYMENT = "gpt-4o-mini";

if (!AZURE_KEY) { console.error("Missing AZURE_AI_API_KEY"); process.exit(2); }

// ── Model pool — what the user actually has access to. ────────────────────
//
// Communicated to the classifier so it picks from real options only.
const MODEL_POOL_DESCRIPTION = `
Available models the user has access to (pick recommendations ONLY from this list):

TEXT / REASONING:
  - claude (Claude API direct keys; sonnet/haiku/opus families)
  - openai (OpenAI direct: gpt-4o, gpt-4-turbo)
  - gemini (Google Gemini direct keys)
  - deepseek (DeepSeek direct keys; V3/R1 strong on reasoning + coding)
  - cohere (Cohere Command R/R+; strong on RAG)
  - qwen (Alibaba Qwen)
  - zhipu (智譜 GLM)
  - openrouter (multi-model proxy)

AZURE FOUNDRY (deployed in this account):
  - gpt-4o-mini (cheap general)
  - gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
  - o3, o4-mini (deep reasoning)
  - llama-3.3-70b
  - phi-4-multimodal (text+vision+audio)

MULTIMODAL (vision):
  - claude (vision built-in)
  - gemini (vision built-in)
  - openai (gpt-4o vision)
  - phi-4-multimodal

EMBEDDING:
  - text-embedding-3-large (Azure)
  - text-embedding-3-small (Azure)

IMAGE GEN:
  - fal (Stable Diffusion / Flux variants)
  - recraft

AUDIO STT (speech → text):
  - whisper (OpenAI direct)
  - azure-stt (Azure Speech eastus)

AUDIO TTS (text → speech):
  - suno (music-quality)
  - hailuo (multilingual TTS)
  - azure-tts (Azure Speech eastus, 400+ voices)

VIDEO GEN:
  - hailuo

WEB SEARCH:
  - tavily
  - perplexity
  - serp
`;

const SYSTEM_PROMPT = `You are a skill→model fit classifier for a marketing AI platform.

For each skill given (with id, name, description, optional manifest snippet),
classify it and pick which AI models from the available pool should run it.

${MODEL_POOL_DESCRIPTION}

Rules:
- task_type must be EXACTLY one of: text, image, audio, video, search, code, multimodal, embedding
- recommended_models: top 1-3 BEST fits, ordered most→least preferred. Use exact names from the pool above.
- alternative_models: 1-4 also-workable picks (less ideal but functional)
- unsuitable_models: 1-3 picks that are clearly the WRONG type (e.g., text-only models for image generation tasks). Empty array OK.
- A "skill" that's a writing/strategy/copy prompt → task_type=text, recommend Claude/OpenAI/Gemini for general, DeepSeek/o3 for deep reasoning
- A skill describing image/visual generation → task_type=image, recommend fal/recraft
- A skill describing transcription → task_type=audio, recommend whisper/azure-stt
- A skill that fetches web data → task_type=search, recommend tavily/perplexity/serp
- A skill writing code → task_type=code, recommend deepseek/openai/claude
- Don't invent models — only pick from the pool list verbatim.

Output ONLY a JSON array, one object per input skill, in the same order:
[
  {
    "id": <input id>,
    "task_type": "...",
    "recommended_models": ["...", "..."],
    "alternative_models": ["...", "..."],
    "unsuitable_models": ["..."]
  },
  ...
]
No prose. No markdown fences. Pure JSON.`;

interface SkillRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  manifest: any;
  category: string | null;
}

interface Classification {
  id: number;
  task_type: string;
  recommended_models: string[];
  alternative_models: string[];
  unsuitable_models: string[];
}

function manifestSnippet(m: any): string {
  if (!m) return "";
  try {
    const o = typeof m === "string" ? JSON.parse(m) : m;
    const str = JSON.stringify(o);
    return str.slice(0, 300);
  } catch { return String(m).slice(0, 300); }
}

// Endpoint can be either format:
//   Foundry router:  https://*.services.ai.azure.com  (uses /openai/v1/chat/completions, model in body)
//   Azure OpenAI:    https://*.openai.azure.com       (uses /openai/deployments/{name}/chat/completions?api-version=...)
const IS_AZURE_OPENAI = AZURE_ENDPOINT.includes("openai.azure.com");
const URL_PATH = IS_AZURE_OPENAI
  ? `/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=2024-10-01-preview`
  : `/openai/v1/chat/completions`;

async function callAzure(skills: SkillRow[]): Promise<Classification[]> {
  const userMsg = skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: (s.description ?? "").slice(0, 240),
    category: s.category,
    manifest_snippet: manifestSnippet(s.manifest),
  }));

  const url = `${AZURE_ENDPOINT}${URL_PATH}`;
  const body: any = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Classify these ${skills.length} skills:\n${JSON.stringify(userMsg)}` },
    ],
    max_tokens: 4000,
    temperature: 0.1,
    response_format: { type: "json_object" },
  };
  // Foundry router needs `model` in body; Azure OpenAI deployments don't (deployment is in URL).
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
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  // Response may be either { results: [...] } or just an array — handle both
  let parsed: any;
  try { parsed = JSON.parse(text); } catch (e) {
    throw new Error(`JSON parse failed: ${text.slice(0, 300)}`);
  }
  const arr: Classification[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.results) ? parsed.results
    : Array.isArray(parsed?.classifications) ? parsed.classifications
    : Object.values(parsed).find((v: any) => Array.isArray(v)) as any ?? [];

  return arr;
}

async function main() {
  const pool = getPool();

  console.log(`===== classifySkills =====`);
  // Print only host (no path), no key — the GHA log redacts it as ***
  console.log(`endpoint:   ${AZURE_ENDPOINT.replace(/^(https?:\/\/[^/]+).*/, "$1")}`);
  console.log(`format:     ${IS_AZURE_OPENAI ? "Azure OpenAI (deployment-in-url)" : "Foundry router (model-in-body)"}`);
  console.log(`url path:   ${URL_PATH}`);
  console.log(`deployment: ${AZURE_DEPLOYMENT}`);
  console.log(`batch size: ${BATCH}`);
  console.log(`limit:      ${LIMIT || "none"}`);
  console.log(`reclassify: ${RECLASSIFY}`);
  console.log(`sample:     ${SAMPLE}\n`);

  // Pull skills to classify
  let where = "is_active = 1";
  if (!RECLASSIFY) where += " AND classified_at IS NULL";
  let limitSql = "";
  if (SAMPLE)        limitSql = "ORDER BY id LIMIT 5";
  else if (LIMIT)    limitSql = `ORDER BY id LIMIT ${LIMIT}`;
  else               limitSql = "ORDER BY id";

  const [rows]: any = await pool.execute(
    `SELECT id, slug, name, description, manifest, category
       FROM skills
      WHERE ${where}
      ${limitSql}`
  );
  console.log(`Skills to classify: ${rows.length}\n`);

  if (rows.length === 0) {
    console.log("Nothing to do.");
    await closePool();
    return;
  }

  // Process in batches
  let done = 0, errors = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch: SkillRow[] = rows.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH);
    process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} skills) … `);
    try {
      const cls = await callAzure(batch);

      // Match results back by id
      const byId = new Map<number, Classification>();
      for (const c of cls) byId.set(Number(c.id), c);

      let batchOk = 0;
      for (const s of batch) {
        const c = byId.get(s.id);
        if (!c) { errors++; continue; }

        if (SAMPLE) {
          console.log(`\n  [${s.id}] ${s.name}`);
          console.log(`    task_type:           ${c.task_type}`);
          console.log(`    recommended_models:  ${(c.recommended_models ?? []).join(", ")}`);
          console.log(`    alternative_models:  ${(c.alternative_models ?? []).join(", ")}`);
          console.log(`    unsuitable_models:   ${(c.unsuitable_models ?? []).join(", ")}`);
          batchOk++;
          continue;
        }

        await pool.execute(
          `UPDATE skills SET
             task_type = ?,
             recommended_models = ?,
             alternative_models = ?,
             unsuitable_models = ?,
             classified_at = NOW()
           WHERE id = ?`,
          [
            c.task_type,
            JSON.stringify(c.recommended_models ?? []),
            JSON.stringify(c.alternative_models ?? []),
            JSON.stringify(c.unsuitable_models ?? []),
            s.id,
          ]
        );
        batchOk++;
      }
      done += batchOk;
      console.log(`✓ (+${batchOk})`);
    } catch (e: any) {
      console.log(`FAIL: ${e.message?.slice(0, 200)}`);
      errors += batch.length;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`classified: ${done}`);
  console.log(`errors:     ${errors}`);

  if (!SAMPLE) {
    const [byTask]: any = await pool.execute(
      "SELECT task_type, COUNT(*) AS n FROM skills WHERE classified_at IS NOT NULL GROUP BY task_type ORDER BY n DESC"
    );
    console.log(`\nBy task_type:`);
    for (const r of byTask as any[]) console.log(`  ${r.task_type}: ${r.n}`);
  }

  await closePool();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
