/**
 * audit-skill-coverage.ts
 *
 * Read-only audit. Produces three reports the human can paste back:
 *
 *   PART 1 — squad-assigned agent coverage
 *     For every step in every active squad, check whether the assigned
 *     agent has primarySkill / skills[] that match the step's tool /
 *     outputType / requiredSkills, AND whether the agent's aiModel is
 *     plausible for that step type (e.g. image-gen step shouldn't
 *     resolve to a text-only LLM).
 *
 *   PART 2 — orphan agent clustering
 *     The 1,870 agents with no primarySkill, plus the broader 10,928
 *     with no skills[] array. Cluster by aiModel + name/title token
 *     similarity so we know what skill packs to author.
 *
 *   PART 3 — capability gaps by squad layer
 *     Which strategy_layer × outputType combinations exist and whether
 *     we have any agent stack capable of producing that outputType.
 */

import { getPool, closePool } from "./squad-builder/db.js";

type Step = {
  order?: number;
  name?: string;
  tool?: string;
  outputType?: string;
  assignedAgentId?: number | null;
  requiredSkills?: string[];
  owner?: string;
};

const TEXT_OUTPUTS = new Set([
  "text",
  "copy",
  "headline",
  "caption",
  "script",
  "email",
  "blog",
  "thread",
  "outline",
  "brief",
  "report",
  "analysis",
  "json",
  "table",
]);
const IMAGE_OUTPUTS = new Set(["image", "hero_image", "thumbnail", "carousel", "infographic", "moodboard"]);
const VIDEO_OUTPUTS = new Set(["video", "reel", "short", "tiktok", "yt_short", "story_video"]);
const AUDIO_OUTPUTS = new Set(["audio", "voiceover", "podcast", "tts", "music", "bgm"]);
const ASR_OUTPUTS = new Set(["transcript", "asr", "captions"]);

function classifyOutput(outputType?: string): "text" | "image" | "video" | "audio" | "asr" | "unknown" {
  if (!outputType) return "unknown";
  const t = outputType.toLowerCase();
  if (TEXT_OUTPUTS.has(t)) return "text";
  if (IMAGE_OUTPUTS.has(t)) return "image";
  if (VIDEO_OUTPUTS.has(t)) return "video";
  if (AUDIO_OUTPUTS.has(t)) return "audio";
  if (ASR_OUTPUTS.has(t)) return "asr";
  return "unknown";
}

function modelFamily(aiModel?: string | null): string {
  if (!aiModel) return "(none)";
  const m = aiModel.toLowerCase();
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("qwen")) return "qwen";
  if (m.includes("glm") || m.includes("zhipu")) return "zhipu";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("perplex") || m.startsWith("sonar")) return "perplexity";
  if (m.includes("grok")) return "grok";
  if (m.includes("phi-") || m.includes("llama") || m.includes("mistral") || m.includes("mai-") || m.includes("kimi") || m.includes("gpt-") || m.startsWith("o3") || m.startsWith("o4")) return "azure-foundry";
  return "other";
}

function isLLMText(family: string): boolean {
  return ["anthropic", "gemini", "qwen", "zhipu", "deepseek", "perplexity", "grok", "azure-foundry"].includes(family);
}

async function main() {
  const pool = getPool();

  // ───────────────────────────────────────────────────────────────────
  // PART 1: squad-assigned agent coverage
  // ───────────────────────────────────────────────────────────────────
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  PART 1 — Squad-assigned agent coverage");
  console.log("════════════════════════════════════════════════════════════════");

  const [squads] = await pool.query<any[]>(
    `SELECT id, slug, name, strategy_layer, tier, lead_agent_id, methodology, steps
     FROM squads WHERE is_active = 1`
  );

  // Pre-load all referenced agents
  const agentIds = new Set<number>();
  for (const s of squads) {
    if (s.lead_agent_id) agentIds.add(s.lead_agent_id);
    let steps: Step[] = [];
    try {
      steps = typeof s.steps === "string" ? JSON.parse(s.steps) : s.steps || [];
    } catch {
      steps = [];
    }
    for (const st of steps) if (st.assignedAgentId) agentIds.add(st.assignedAgentId);
  }
  const idList = [...agentIds];
  const agents: Map<number, any> = new Map();
  if (idList.length) {
    const [rows] = await pool.query<any[]>(
      `SELECT id, name, title, aiModel, primarySkill, skills FROM agents WHERE id IN (?)`,
      [idList]
    );
    for (const a of rows) {
      let parsedSkills: string[] = [];
      if (a.skills) {
        try {
          parsedSkills = typeof a.skills === "string" ? JSON.parse(a.skills) : a.skills;
        } catch {
          parsedSkills = [];
        }
      }
      agents.set(a.id, { ...a, parsedSkills });
    }
  }

  let totalSteps = 0;
  let stepsWithAgent = 0;
  let stepsAgentMissing = 0;
  let stepsAgentResolved = 0;
  const outputTypeCount: Record<string, number> = {};
  const layerOutputType: Record<string, Record<string, number>> = {};
  let mismatchTextStep = 0;
  let mismatchImageStep = 0;
  let mismatchVideoStep = 0;
  let mismatchAudioStep = 0;
  const sampleMismatches: Array<{ squad: string; step: string; outputType: string; agentId: number; agentModel: string }> = [];

  for (const s of squads) {
    let steps: Step[] = [];
    try {
      steps = typeof s.steps === "string" ? JSON.parse(s.steps) : s.steps || [];
    } catch {
      continue;
    }
    const layer = s.strategy_layer || "(unset)";
    if (!layerOutputType[layer]) layerOutputType[layer] = {};

    for (const st of steps) {
      totalSteps++;
      const ot = (st.outputType || "(none)").toLowerCase();
      outputTypeCount[ot] = (outputTypeCount[ot] || 0) + 1;
      layerOutputType[layer][ot] = (layerOutputType[layer][ot] || 0) + 1;

      if (st.assignedAgentId) {
        stepsWithAgent++;
        const agent = agents.get(st.assignedAgentId);
        if (!agent) {
          stepsAgentMissing++;
        } else {
          stepsAgentResolved++;
          const fam = modelFamily(agent.aiModel);
          const cls = classifyOutput(st.outputType);
          // Mismatch check: image/video/audio output but agent only has text LLM
          if (cls === "image" && isLLMText(fam)) {
            mismatchImageStep++;
            if (sampleMismatches.length < 10) sampleMismatches.push({ squad: s.slug, step: st.name || "", outputType: ot, agentId: agent.id, agentModel: agent.aiModel });
          }
          if (cls === "video" && isLLMText(fam)) {
            mismatchVideoStep++;
            if (sampleMismatches.length < 10) sampleMismatches.push({ squad: s.slug, step: st.name || "", outputType: ot, agentId: agent.id, agentModel: agent.aiModel });
          }
          if (cls === "audio" && isLLMText(fam)) {
            mismatchAudioStep++;
            if (sampleMismatches.length < 10) sampleMismatches.push({ squad: s.slug, step: st.name || "", outputType: ot, agentId: agent.id, agentModel: agent.aiModel });
          }
          if (cls === "text" && !isLLMText(fam)) mismatchTextStep++;
        }
      }
    }
  }

  console.log(`  total active squads:           ${squads.length}`);
  console.log(`  total steps:                   ${totalSteps}`);
  console.log(`  steps with assignedAgentId:    ${stepsWithAgent}`);
  console.log(`  steps where agent resolves:    ${stepsAgentResolved}`);
  console.log(`  steps where agent NOT FOUND:   ${stepsAgentMissing}`);
  console.log("");
  console.log("  ↳ outputType distribution (top 30):");
  const sortedOT = Object.entries(outputTypeCount).sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [ot, n] of sortedOT) console.log(`    ${ot.padEnd(28)} ${n}`);
  console.log("");
  console.log("  ↳ agent ↔ step capability mismatches:");
  console.log(`    image step ↔ text-only LLM:  ${mismatchImageStep}`);
  console.log(`    video step ↔ text-only LLM:  ${mismatchVideoStep}`);
  console.log(`    audio step ↔ text-only LLM:  ${mismatchAudioStep}`);
  console.log(`    text step ↔ non-LLM agent:   ${mismatchTextStep}`);
  console.log("");
  console.log("  ↳ sample mismatches (first 10):");
  for (const m of sampleMismatches) {
    console.log(`    [${m.squad}] step="${m.step}" out=${m.outputType} → agent#${m.agentId} model=${m.agentModel}`);
  }

  // ───────────────────────────────────────────────────────────────────
  // PART 2: orphan agent clustering
  // ───────────────────────────────────────────────────────────────────
  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  PART 2 — Orphan agent clustering");
  console.log("════════════════════════════════════════════════════════════════");

  // Orphan = not lead AND not assigned in any step
  const [allAgents] = await pool.query<any[]>(
    `SELECT a.id, a.name, a.title, a.aiModel, a.primarySkill, a.skills
     FROM agents a`
  );

  // Build set of "in use" ids
  const inUseIds = new Set<number>();
  for (const s of squads) {
    if (s.lead_agent_id) inUseIds.add(s.lead_agent_id);
    let steps: Step[] = [];
    try {
      steps = typeof s.steps === "string" ? JSON.parse(s.steps) : s.steps || [];
    } catch {}
    for (const st of steps) if (st.assignedAgentId) inUseIds.add(st.assignedAgentId);
  }

  let orphanCount = 0;
  let orphanNoPrimarySkill = 0;
  let orphanNoSkillsArray = 0;
  const orphanByModel: Record<string, number> = {};
  const orphanTitleTokens: Record<string, number> = {};

  for (const a of allAgents) {
    if (inUseIds.has(a.id)) continue;
    orphanCount++;
    if (!a.primarySkill) orphanNoPrimarySkill++;
    let parsedSkills: any[] = [];
    if (a.skills) {
      try { parsedSkills = typeof a.skills === "string" ? JSON.parse(a.skills) : a.skills; } catch {}
    }
    if (!Array.isArray(parsedSkills) || parsedSkills.length === 0) orphanNoSkillsArray++;

    const fam = modelFamily(a.aiModel);
    orphanByModel[fam] = (orphanByModel[fam] || 0) + 1;

    const title = (a.title || "").toLowerCase();
    for (const tok of title.split(/[\s\/,&·\-—()]+/).filter((t: string) => t.length >= 3)) {
      orphanTitleTokens[tok] = (orphanTitleTokens[tok] || 0) + 1;
    }
  }

  console.log(`  total agents:                  ${allAgents.length}`);
  console.log(`  agents in use (lead or step):  ${inUseIds.size}`);
  console.log(`  orphan agents:                 ${orphanCount}`);
  console.log(`  ↳ orphans w/o primarySkill:    ${orphanNoPrimarySkill}`);
  console.log(`  ↳ orphans w/o skills array:    ${orphanNoSkillsArray}`);
  console.log("");
  console.log("  ↳ orphans by aiModel family:");
  for (const [fam, n] of Object.entries(orphanByModel).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${fam.padEnd(20)} ${n}`);
  }
  console.log("");
  console.log("  ↳ orphan title tokens (top 30, hint at what skill packs to author):");
  const sortedTok = Object.entries(orphanTitleTokens).sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [tok, n] of sortedTok) console.log(`    ${tok.padEnd(20)} ${n}`);

  // ───────────────────────────────────────────────────────────────────
  // PART 3: capability gaps by layer × outputType
  // ───────────────────────────────────────────────────────────────────
  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  PART 3 — Layer × outputType capability matrix");
  console.log("════════════════════════════════════════════════════════════════");
  const allOutputTypes = new Set<string>();
  for (const layer of Object.keys(layerOutputType)) {
    for (const ot of Object.keys(layerOutputType[layer])) allOutputTypes.add(ot);
  }
  const layers = Object.keys(layerOutputType).sort();
  const otsSorted = [...allOutputTypes].sort();
  console.log(`  layers: ${layers.join(", ")}`);
  console.log(`  distinct outputTypes seen: ${otsSorted.length}`);
  console.log("");
  console.log("  layer | text | image | video | audio | unknown");
  for (const layer of layers) {
    let t = 0, i = 0, v = 0, a = 0, u = 0;
    for (const [ot, n] of Object.entries(layerOutputType[layer])) {
      const c = classifyOutput(ot);
      if (c === "text") t += n;
      else if (c === "image") i += n;
      else if (c === "video") v += n;
      else if (c === "audio") a += n;
      else u += n;
    }
    console.log(`  ${layer.padEnd(14)} ${String(t).padStart(4)} ${String(i).padStart(5)} ${String(v).padStart(5)} ${String(a).padStart(5)} ${String(u).padStart(7)}`);
  }
  console.log("");
  console.log("  ↳ unknown outputTypes (need taxonomy review):");
  const unknownOts = otsSorted.filter(ot => classifyOutput(ot) === "unknown");
  for (const ot of unknownOts.slice(0, 40)) console.log(`    ${ot} (${outputTypeCount[ot] || 0})`);

  console.log("");
  console.log("✅ audit done");
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
