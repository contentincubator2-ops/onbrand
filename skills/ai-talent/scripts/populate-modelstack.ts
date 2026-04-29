/**
 * populate-modelstack.ts
 *
 * Fills agents.modelStack for every agent based on their primary aiModel.
 * Each modelStack is a JSON object declaring the agent's full multi-modal
 * toolkit:
 *
 *   {
 *     primary_llm: "<aiModel value>",      // mirrors agents.aiModel
 *     image_gen:   "<provider/model>",     // single image
 *     video_gen:   "<provider/model>",     // short video
 *     tts:         "<provider/model>",     // text-to-speech
 *     asr:         "<provider/model>",     // speech-to-text
 *     embed:       "<provider/model>",     // text embeddings
 *     web_search:  "tavily" | "perplexity" | null,
 *     browser:     "browserbase" | null,
 *     social_post: "meta-graph" | null
 *   }
 *
 * Strategy:
 *   - Azure AI Foundry is priority for primary_llm whenever the agent's
 *     aiModel is a Foundry-deployed family (gpt, o3, o4, Phi, Llama,
 *     DeepSeek, Kimi, Mistral, MAI).
 *   - fal.ai is the universal multimedia carrier (Flux, Kling, MiniMax-Video,
 *     LTX, ElevenLabs, Whisper, Stable-Audio) for everyone except OpenAI-native
 *     stacks which prefer gpt-image-1, dall-e-3, tts-1, whisper-1.
 *   - Cohere embed v4 is the default embed model; Azure 3-large fallback.
 *   - Tavily for web_search, Browserbase for browser, Meta Graph for social.
 *
 * Idempotent: re-running overwrites modelStack with the freshest mapping.
 *
 * Flags:
 *   --dry-run   show stats only, do not UPDATE
 *   --limit N   only process first N agents (for smoke test)
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const limitFlag = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitFlag ? parseInt(limitFlag.split("=")[1], 10) : 0;

type ModelStack = {
  primary_llm: string;
  image_gen: string | null;
  image_gen_backup?: string | null;
  video_gen: string | null;
  video_gen_backup?: string | null;
  video_gen_backup_2?: string | null;
  tts: string | null;
  tts_backup?: string | null;
  asr: string | null;
  asr_backup?: string | null;
  embed: string;
  web_search: string | null;
  browser: string | null;
  social_post: string | null;
};

function family(aiModel: string): string {
  const m = (aiModel || "").toLowerCase();
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gpt") || m.startsWith("o3") || m.startsWith("o4") || m.includes("openai")) return "openai";
  if (m.includes("gemini") || m.includes("google") || m.includes("vertex")) return "google";
  if (m.includes("glm") || m.includes("zai") || m.includes("zhipu")) return "zai";
  if (m.includes("qwen") || m.includes("alibaba")) return "qwen";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("kimi") || m.includes("moonshot")) return "moonshot";
  if (m.includes("mistral")) return "mistral";
  if (m.includes("phi")) return "microsoft";
  if (m.includes("llama") || m.includes("meta-llama")) return "meta";
  if (m.includes("mai-")) return "microsoft";
  if (m.includes("grok")) return "xai";
  if (m.includes("perplexity") || m.includes("sonar")) return "perplexity";
  if (m.includes("cohere") || m.includes("command")) return "cohere";
  return "other";
}

function buildStack(aiModel: string): ModelStack {
  const fam = family(aiModel);
  // OpenAI / Azure Foundry GPT line — prefer OpenAI-native multimedia
  if (fam === "openai") {
    return {
      primary_llm: aiModel,
      image_gen: "openai/gpt-image-1",
      video_gen: "fal/kling-2",
      tts: "openai/tts-1",
      asr: "openai/whisper-1",
      embed: "azure/text-embedding-3-large",
      web_search: "tavily",
      browser: "browserbase",
      social_post: "meta-graph",
    };
  }
  // Google / Gemini — Imagen 3 for image, Veo would be ideal but use fal/kling fallback
  if (fam === "google") {
    return {
      primary_llm: aiModel,
      image_gen: "google/imagen-3",
      video_gen: "fal/kling-2",
      tts: "google/tts-chirp",
      asr: "openai/whisper-1",
      embed: "cohere/embed-v4",
      web_search: "tavily",
      browser: "browserbase",
      social_post: "meta-graph",
    };
  }
  // Qwen / Alibaba — DashScope native multimedia (Wan video, Qwen-Image, Cosy TTS)
  // Useful as a fal.ai-independent path while fal.ai is admin-locked.
  if (fam === "qwen") {
    return {
      primary_llm: aiModel,
      image_gen: "qwen/qwen-image-plus",
      video_gen: "qwen/wan2.5-t2v-plus",
      tts: "qwen/cosyvoice-v2",
      asr: "qwen/paraformer-v2",
      embed: "qwen/text-embedding-v4",
      web_search: "tavily",
      browser: "browserbase",
      social_post: "meta-graph",
    };
  }
  // Zhipu / GLM — CogVideoX native, GLM-4V multimodal
  if (fam === "zai") {
    return {
      primary_llm: aiModel,
      image_gen: "zai/cogview-3-plus",
      video_gen: "zai/cogvideox-2",
      tts: "qwen/cosyvoice-v2",
      asr: "qwen/paraformer-v2",
      embed: "cohere/embed-v4",
      web_search: "tavily",
      browser: "browserbase",
      social_post: "meta-graph",
    };
  }
  // All other families route multimedia through fal.ai (universal carrier)
  // with Qwen DashScope as the documented backup carrier when fal.ai is down.
  return {
    primary_llm: aiModel,
    image_gen: "fal/flux-pro-1.1",
    image_gen_backup: "qwen/qwen-image-plus",
    video_gen: "fal/kling-2",
    video_gen_backup: "minimax/hailuo-02",
    video_gen_backup_2: "qwen/wan2.5-t2v-plus",
    tts: "fal/elevenlabs-tts",
    tts_backup: "qwen/cosyvoice-v2",
    asr: "fal/whisper",
    asr_backup: "qwen/paraformer-v2",
    embed: "cohere/embed-v4",
    web_search: "tavily",
    browser: "browserbase",
    social_post: "meta-graph",
  } as ModelStack;
}

async function main() {
  const pool = getPool();
  const sql = `SELECT id, aiModel FROM agents WHERE aiModel IS NOT NULL AND aiModel <> ''${LIMIT ? ` LIMIT ${LIMIT}` : ""}`;
  const [rows]: any = await pool.query(sql);
  console.log(`▼ ${rows.length} agents to populate modelStack${DRY_RUN ? " (DRY RUN)" : ""}`);

  const famCounts: Record<string, number> = {};
  let updated = 0;
  for (const r of rows) {
    const fam = family(r.aiModel);
    famCounts[fam] = (famCounts[fam] || 0) + 1;
    if (DRY_RUN) continue;
    const stack = buildStack(r.aiModel);
    await pool.execute(`UPDATE agents SET modelStack = ? WHERE id = ?`, [JSON.stringify(stack), r.id]);
    updated++;
    if (updated % 1000 === 0) console.log(`  …${updated} updated`);
  }
  console.log(`\n✅ ${DRY_RUN ? "would update" : "updated"} ${DRY_RUN ? rows.length : updated} agents`);
  console.log("  by family:");
  for (const [k, v] of Object.entries(famCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(14)} ${v}`);
  }
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
