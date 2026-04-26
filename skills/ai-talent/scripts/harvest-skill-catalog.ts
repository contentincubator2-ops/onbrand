/**
 * harvest-skill-catalog.ts
 *
 * Builds skills/ai-talent/data/skill-catalog.json by cloning / fetching
 * skill libraries and parsing them into a normalized record:
 *
 *   {
 *     slug:           "claude.brand-strategist",
 *     name:           "Brand Strategist",
 *     source:         "anthropics/skills",
 *     source_url:     "https://github.com/anthropics/skills/.../SKILL.md",
 *     bound_provider: "anthropic",   // skill author wrote for this provider's tool format
 *     compatible_models: ["claude-opus-4-6", "claude-sonnet-4-6"],
 *     category:       "brand-strategy",
 *     description:    "...",
 *     tools:          ["web_search", "code_interpreter"],
 *     model_compat:   ["anthropic"],   // which provider buckets can run this
 *     tags:           ["copy", "positioning", "narrative"]
 *   }
 *
 * Sources scanned:
 *   1. anthropics/skills           — official Claude SKILL.md spec
 *   2. zai-org/GLM-skills          — GLM-flavored skills
 *   3. VoltAgent/awesome-agent-skills — curated multi-provider list (parses README markdown)
 *   4. Built-in tool capabilities  — fal.ai (image/video/audio), tavily, browserbase, meta
 *      These are not "skills" per se but tool wrappers — emitted with bound_provider="tool".
 *
 * Failure tolerant: each source can fail independently; logs partial results.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = resolve(__dirname, "../.skill-harvest");
const OUT = resolve(__dirname, "../data/skill-catalog.json");

type SkillRecord = {
  slug: string;
  name: string;
  source: string;
  source_url: string;
  bound_provider: "anthropic" | "openai" | "azure-foundry" | "qwen" | "zhipu" | "deepseek" | "perplexity" | "gemini" | "grok" | "cohere" | "tool" | "any";
  compatible_models?: string[];
  category: string;
  description: string;
  tools?: string[];
  model_compat: string[]; // which provider buckets can run this
  tags?: string[];
};

const records: SkillRecord[] = [];

function shellOk(cmd: string): boolean {
  try { execSync(cmd, { stdio: "ignore" }); return true; } catch { return false; }
}
function shell(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function safeReadDir(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}

function walkSkillMd(rootDir: string): Array<{ path: string; rel: string }> {
  const out: Array<{ path: string; rel: string }> = [];
  const stack = [rootDir];
  while (stack.length) {
    const d = stack.pop()!;
    for (const name of safeReadDir(d)) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const p = join(d, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) stack.push(p);
      else if (/^skill\.(md|markdown)$/i.test(name)) {
        out.push({ path: p, rel: p.slice(rootDir.length + 1) });
      }
    }
  }
  return out;
}

function parseSkillMd(text: string): { name?: string; description?: string; tools?: string[]; tags?: string[] } {
  const out: any = {};
  // YAML frontmatter
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const m = line.match(/^(\w+):\s*(.+)$/);
      if (!m) continue;
      const k = m[1].toLowerCase(), v = m[2].trim().replace(/^["']|["']$/g, "");
      if (k === "name" || k === "title") out.name = v;
      if (k === "description" || k === "summary") out.description = v;
      if (k === "tools" || k === "tags") out[k] = v.split(/[,;]\s*/).filter(Boolean);
    }
  }
  // First H1
  if (!out.name) {
    const h = text.match(/^#\s+(.+)$/m);
    if (h) out.name = h[1].trim();
  }
  // First non-frontmatter paragraph
  if (!out.description) {
    const stripped = text.replace(/^---\n[\s\S]*?\n---\n/, "");
    const para = stripped.split(/\n\n/).find((p) => p.trim() && !p.startsWith("#"));
    if (para) out.description = para.trim().replace(/\n/g, " ").slice(0, 280);
  }
  return out;
}

// ─── 1. anthropics/skills ──────────────────────────────────────────────
function harvestAnthropics() {
  const dir = join(TMP, "anthropics-skills");
  console.log("▼ source 1: anthropics/skills");
  if (!shellOk(`git clone --depth 1 https://github.com/anthropics/skills "${dir}"`)) {
    console.log("  ⊘ clone failed");
    return;
  }
  const files = walkSkillMd(dir);
  console.log(`  found ${files.length} SKILL.md files`);
  for (const f of files) {
    const text = readFileSync(f.path, "utf-8");
    const meta = parseSkillMd(text);
    const slug = `claude.${basename(dirname(f.path))}`.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
    records.push({
      slug,
      name: meta.name || basename(dirname(f.path)),
      source: "anthropics/skills",
      source_url: `https://github.com/anthropics/skills/blob/main/${f.rel.replace(/\\/g, "/")}`,
      bound_provider: "anthropic",
      compatible_models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4"],
      category: "claude-skill",
      description: meta.description || "",
      tools: meta.tools,
      model_compat: ["anthropic"],
      tags: meta.tags,
    });
  }
  console.log(`  ✓ ${files.length} skills harvested`);
}

// ─── 2. zai-org/GLM-skills ─────────────────────────────────────────────
function harvestGLM() {
  const dir = join(TMP, "glm-skills");
  console.log("▼ source 2: zai-org/GLM-skills");
  if (!shellOk(`git clone --depth 1 https://github.com/zai-org/GLM-skills "${dir}"`)) {
    console.log("  ⊘ clone failed (repo may not exist or be private)");
    return;
  }
  // Parse top-level skills/ subfolders OR root README.md if no skills dir
  const skillDirs = ["skills", "agents", "tools"].map((d) => join(dir, d)).filter(existsSync);
  let n = 0;
  for (const sd of skillDirs) {
    for (const name of safeReadDir(sd)) {
      const p = join(sd, name);
      try {
        const st = statSync(p);
        if (!st.isDirectory()) continue;
        const readme = ["README.md", "SKILL.md", "skill.md"].map((f) => join(p, f)).find(existsSync);
        if (!readme) continue;
        const meta = parseSkillMd(readFileSync(readme, "utf-8"));
        records.push({
          slug: `glm.${name}`.toLowerCase().replace(/[^a-z0-9.-]/g, "-"),
          name: meta.name || name,
          source: "zai-org/GLM-skills",
          source_url: `https://github.com/zai-org/GLM-skills/tree/main/${basename(sd)}/${name}`,
          bound_provider: "zhipu",
          compatible_models: ["glm-4.6", "glm-z1"],
          category: "glm-skill",
          description: meta.description || "",
          tools: meta.tools,
          model_compat: ["zhipu"],
          tags: meta.tags,
        });
        n++;
      } catch {}
    }
  }
  // If no skills/ dir, try parsing README list
  if (n === 0 && existsSync(join(dir, "README.md"))) {
    const text = readFileSync(join(dir, "README.md"), "utf-8");
    const items = text.match(/^[-*]\s+\*\*(.+?)\*\*[:：]?\s*(.+)$/gm) || [];
    for (const item of items) {
      const m = item.match(/^[-*]\s+\*\*(.+?)\*\*[:：]?\s*(.+)$/);
      if (!m) continue;
      records.push({
        slug: `glm.${m[1].toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.-]/g, "-")}`,
        name: m[1],
        source: "zai-org/GLM-skills",
        source_url: "https://github.com/zai-org/GLM-skills",
        bound_provider: "zhipu",
        compatible_models: ["glm-4.6"],
        category: "glm-skill",
        description: m[2].slice(0, 280),
        model_compat: ["zhipu"],
      });
      n++;
    }
  }
  console.log(`  ✓ ${n} skills harvested`);
}

// ─── 3. VoltAgent/awesome-agent-skills ────────────────────────────────
function harvestVoltAgent() {
  const dir = join(TMP, "voltagent");
  console.log("▼ source 3: VoltAgent/awesome-agent-skills");
  if (!shellOk(`git clone --depth 1 https://github.com/VoltAgent/awesome-agent-skills "${dir}"`)) {
    console.log("  ⊘ clone failed");
    return;
  }
  const readme = ["README.md", "readme.md"].map((f) => join(dir, f)).find(existsSync);
  if (!readme) { console.log("  ⊘ no README"); return; }
  const text = readFileSync(readme, "utf-8");
  // Lines like "- [Skill Name](https://...) - description"
  const items = text.match(/^[-*]\s*\[(.+?)\]\((https?:\/\/[^)]+)\)\s*[-—:]?\s*(.*)$/gm) || [];
  let n = 0;
  for (const item of items) {
    const m = item.match(/^[-*]\s*\[(.+?)\]\((https?:\/\/[^)]+)\)\s*[-—:]?\s*(.*)$/);
    if (!m) continue;
    const name = m[1].trim();
    const url = m[2];
    const desc = m[3].trim();
    // Infer provider from name/url
    let provider: SkillRecord["bound_provider"] = "any";
    let compat = ["anthropic", "openai", "azure-foundry"];
    if (/qwen/i.test(name + url)) { provider = "qwen"; compat = ["qwen"]; }
    else if (/glm|zhipu/i.test(name + url)) { provider = "zhipu"; compat = ["zhipu"]; }
    else if (/claude|anthropic/i.test(name + url)) { provider = "anthropic"; compat = ["anthropic"]; }
    else if (/openai|gpt-/i.test(name + url)) { provider = "openai"; compat = ["openai", "azure-foundry"]; }
    else if (/gemini|google/i.test(name + url)) { provider = "gemini"; compat = ["gemini"]; }
    records.push({
      slug: `voltagent.${name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.-]/g, "-")}`,
      name,
      source: "VoltAgent/awesome-agent-skills",
      source_url: url,
      bound_provider: provider,
      category: "community-skill",
      description: desc.slice(0, 280),
      model_compat: compat,
    });
    n++;
  }
  console.log(`  ✓ ${n} skills harvested`);
}

// ─── 4. Built-in tool wrappers ─────────────────────────────────────────
function harvestTools() {
  console.log("▼ source 4: built-in tool wrappers (fal.ai / tavily / browserbase / meta / cohere)");
  const tools: Array<Omit<SkillRecord, "model_compat" | "bound_provider">> = [
    { slug: "tool.fal.flux-pro",       name: "fal.ai Flux Pro (image gen)",      source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/flux-pro", category: "image-gen",  description: "High-end text-to-image. Hero, banner, poster." },
    { slug: "tool.fal.flux-dev",       name: "fal.ai Flux Dev (image gen)",      source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/flux/dev", category: "image-gen",  description: "Open-weight Flux for fast iteration." },
    { slug: "tool.fal.flux-kontext",   name: "fal.ai Flux Kontext (image edit)", source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/flux-pro/kontext", category: "image-edit", description: "Image-to-image editing, in-paint, background removal." },
    { slug: "tool.fal.recraft-v3",     name: "fal.ai Recraft V3 (image gen)",    source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/recraft-v3", category: "image-gen",  description: "Brand-grade illustration with style control." },
    { slug: "tool.fal.ideogram-v2",    name: "fal.ai Ideogram V2 (image gen)",   source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/ideogram/v2", category: "image-gen",  description: "Best-in-class typography in images." },
    { slug: "tool.fal.kling-2",        name: "fal.ai Kling 2 (video gen)",       source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/kling-video/v2/master/text-to-video", category: "video-gen",  description: "Text-to-video, 5–10s, cinematic motion." },
    { slug: "tool.fal.minimax-video",  name: "fal.ai MiniMax Video-01",          source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/minimax/video-01", category: "video-gen",  description: "Text/image-to-video, expressive characters." },
    { slug: "tool.fal.ltx-video",      name: "fal.ai LTX Video",                 source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/ltx-video", category: "video-gen",  description: "Fast video gen, low cost, 5s clips." },
    { slug: "tool.fal.elevenlabs-tts", name: "fal.ai ElevenLabs TTS",            source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/elevenlabs/tts", category: "tts",        description: "Studio-grade voice cloning + multilingual TTS." },
    { slug: "tool.fal.fish-tts",       name: "fal.ai Fish Audio TTS",            source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/fish-speech-tts", category: "tts",        description: "Open-weight TTS, low latency." },
    { slug: "tool.fal.stable-audio",   name: "fal.ai Stable Audio",              source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/stable-audio", category: "music-gen",  description: "Text-to-music, 30s loops for BGM." },
    { slug: "tool.fal.whisper",        name: "fal.ai Whisper Large v3",          source: "fal.ai", source_url: "https://fal.ai/models/fal-ai/whisper", category: "asr",        description: "Speech-to-text, 99 languages." },
    { slug: "tool.openai.gpt-image-1", name: "OpenAI gpt-image-1 (image gen)",   source: "openai", source_url: "https://platform.openai.com/docs/guides/images", category: "image-gen",  description: "Native image gen + edit + in-paint." },
    { slug: "tool.openai.dall-e-3",    name: "OpenAI DALL·E 3 (image gen)",      source: "openai", source_url: "https://platform.openai.com/docs/guides/images", category: "image-gen",  description: "Text-to-image with prompt expansion." },
    { slug: "tool.openai.tts-1",       name: "OpenAI TTS-1",                     source: "openai", source_url: "https://platform.openai.com/docs/guides/text-to-speech", category: "tts",        description: "Multilingual TTS, 6 voices." },
    { slug: "tool.openai.whisper",     name: "OpenAI Whisper API",               source: "openai", source_url: "https://platform.openai.com/docs/guides/speech-to-text", category: "asr",        description: "Speech-to-text via OpenAI." },
    { slug: "tool.gemini.image",       name: "Gemini 2.5 Flash Image",           source: "gemini", source_url: "https://ai.google.dev/gemini-api/docs/image-generation", category: "image-gen",  description: "Imagen via Gemini API, fast, prompt-coherent." },
    { slug: "tool.tavily.search",      name: "Tavily Search",                    source: "tavily", source_url: "https://app.tavily.com", category: "web-search", description: "LLM-optimized web search, real-time." },
    { slug: "tool.perplexity.sonar",   name: "Perplexity Sonar",                 source: "perplexity", source_url: "https://www.perplexity.ai/api", category: "web-search", description: "Real-time search w/ citations." },
    { slug: "tool.browserbase",        name: "Browserbase Cloud Browser",        source: "browserbase", source_url: "https://www.browserbase.com", category: "browser",    description: "Headless real Chrome — LinkedIn, X, Threads, etc." },
    { slug: "tool.meta.graph",         name: "Meta Graph API",                   source: "meta", source_url: "https://developers.facebook.com/docs/graph-api", category: "social-post", description: "FB/IG publish, insights, ads." },
    { slug: "tool.cohere.embed-v4",    name: "Cohere Embed v4",                  source: "cohere", source_url: "https://docs.cohere.com/docs/embeddings", category: "embed",      description: "Multilingual semantic embeddings." },
    { slug: "tool.cohere.rerank-v3",   name: "Cohere Rerank v3",                 source: "cohere", source_url: "https://docs.cohere.com/docs/rerank-overview", category: "rerank",     description: "Search result reranking." },
    { slug: "tool.manus.agent",        name: "Manus Autonomous Agent",           source: "manus", source_url: "https://manus.im", category: "agent-platform", description: "End-to-end task agent — research, code, deliverables." },
  ];
  for (const t of tools) {
    records.push({
      ...t,
      bound_provider: "tool",
      model_compat: ["any"],
    } as SkillRecord);
  }
  console.log(`  ✓ ${tools.length} tool wrappers added`);
}

async function main() {
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  📚 Skill catalog harvest");
  console.log("════════════════════════════════════════════════════════════════");
  mkdirSync(TMP, { recursive: true });
  // Clean previous clones
  try { execSync(`rm -rf "${TMP}"/*`, { stdio: "ignore" }); } catch {}
  mkdirSync(TMP, { recursive: true });

  harvestAnthropics();
  harvestGLM();
  harvestVoltAgent();
  harvestTools();

  // Dedupe by slug
  const bySlug = new Map<string, SkillRecord>();
  for (const r of records) bySlug.set(r.slug, r);
  const final = [...bySlug.values()];

  // Stats
  const byProvider: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const r of final) {
    byProvider[r.bound_provider] = (byProvider[r.bound_provider] || 0) + 1;
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(
    { generated_at: new Date().toISOString(), count: final.length, byProvider, byCategory, skills: final },
    null, 2
  ));
  console.log("");
  console.log(`✅ wrote ${final.length} skills → ${OUT}`);
  console.log("  by bound_provider:", byProvider);
  console.log("  by category:      ", byCategory);
}

main().catch((e) => { console.error(e); process.exit(1); });
