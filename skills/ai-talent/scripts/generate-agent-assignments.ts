/**
 * generate-agent-assignments.ts
 *
 * One-shot offline script: reads B+ agent pool from mos_db (≥400 char,
 * all 4 fields filled, isAvailable=1, approved), reads task slot
 * inventory from quickTask*.ts + squads + positioning, then produces
 * a deterministic 1:1 assignment.
 *
 * Output: data/agent-assignments.json
 *
 * Runtime impact: ZERO. The orchestra reads this JSON via single map
 * lookup at request time (O(1), no DB query, no timeout risk).
 *
 * Run on VM:
 *   cd /opt/marketing-os/skills/ai-talent
 *   bun run scripts/generate-agent-assignments.ts
 *   git add data/agent-assignments.json && git commit && git push
 *
 * Re-runnable: every run produces same result for same DB state +
 * task list (deterministic hash-based ordering).
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirnameSafe = (() => {
  try { return dirname(fileURLToPath(import.meta.url)); }
  catch { return process.cwd() + "/scripts"; }
})();

// ── Task slot inventory ──────────────────────────────────────────────────
//
// Roles per task:
//   30s: lead, imageDirector?
//   60s: lead, imageDirector, strategist?, specialty?
//   100s: same as 60s
//   squads (100sSquads): lead + 4-7 step members
//   positioning steps: lead per step
//   media: imageDirector / videoDirector (per gen request)
//   extras (60s/100s): replyWriter, timingAdvisor, followupWriter, etc.

import { FB_30S_TASKS } from "../server/content/core/quickTaskFB";
import { IG_30S_TASKS } from "../server/content/core/quickTaskIG";
import { YT_30S_TASKS } from "../server/content/core/quickTaskYT";
import { TT_30S_TASKS } from "../server/content/core/quickTaskTikTok";
import { LI_30S_TASKS } from "../server/content/core/quickTaskLI";
import { EMAIL_30S_TASKS } from "../server/content/core/quickTaskEmail";
import { PR_30S_TASKS } from "../server/content/core/quickTaskPR";
import { BRAND_30S_TASKS, BRAND_30S_ORCHESTRA } from "../server/content/core/quickTaskBrand";
import { RESEARCH_30S_TASKS, RESEARCH_30S_ORCHESTRA } from "../server/content/core/quickTaskResearch";
import { FB_60S_TASKS_V2 } from "../server/content/core/quickTaskFB60";
import { IG_60S_TASKS } from "../server/content/core/quickTaskIG60";
import { YT_60S_TASKS } from "../server/content/core/quickTaskYT60";
import { MULTI_60S_TASKS } from "../server/content/core/quickTaskMulti60";
import { ALL_99S_TASKS, ALL_99S_ORCHESTRA } from "../server/content/core/quickTask100";

// Configs (with extras / strategist / specialty info)
import { FB_30S_ORCHESTRA } from "../server/content/core/quickTaskFB";
import { IG_30S_ORCHESTRA } from "../server/content/core/quickTaskIG";
import { YT_30S_ORCHESTRA } from "../server/content/core/quickTaskYT";
import { TT_30S_ORCHESTRA } from "../server/content/core/quickTaskTikTok";
import { LI_30S_ORCHESTRA } from "../server/content/core/quickTaskLI";
import { EMAIL_30S_ORCHESTRA } from "../server/content/core/quickTaskEmail";
import { FB_60S_ORCHESTRA } from "../server/content/core/quickTaskFB60";
import { IG_60S_ORCHESTRA } from "../server/content/core/quickTaskIG60";
import { YT_60S_ORCHESTRA } from "../server/content/core/quickTaskYT60";
import { MULTI_60S_ORCHESTRA } from "../server/content/core/quickTaskMulti60";

interface AgentRow {
  id: number;
  name: string;
  title: string;
  primarySkill: string;
  total: number;
}

interface SlotKey {
  taskId: string;
  role: string; // "lead" | "imageDirector" | "strategist" | "specialty" | "replyWriter" | ...
  hint: string; // skill-area hint for matching
  platform: string;
}

const platformHints: Record<string, string[]> = {
  facebook:  ["facebook", "fb-", "social"],
  instagram: ["instagram", "ig-", "social"],
  youtube:   ["youtube", "yt-", "video", "channel"],
  tiktok:    ["tiktok", "short-video", "short-form"],
  linkedin:  ["linkedin", "b2b", "thought-leader"],
  email:     ["email", "newsletter", "crm", "lifecycle"],
  press:     ["pr", "press", "comm", "spokesperson", "media-relations"],
  generic:   ["brand", "strategy", "positioning"],
  research:  ["research", "user-research", "insights"],
};

const roleHints: Record<string, string[]> = {
  lead:          ["copywrit", "writer", "creator", "scriptwriter", "marketing"],
  imageDirector: ["design", "visual", "art-direct", "creative-direct", "brand-identity"],
  strategist:    ["strateg", "planner", "consultant", "director"],
  specialty:     ["legal", "compliance", "trend", "research", "review", "qa"],
  replyWriter:   ["community", "engagement", "customer-service"],
  timingAdvisor: ["analytics", "trend", "data"],
  followupWriter:["copywrit", "engagement"],
  compareTable:  ["analytics", "research", "insights", "benchmark"],
  legalAssistant:["legal", "compliance", "counsel", "risk"],
  videoDirector: ["video", "motion", "cinematic", "director"],
  promptEngineer:["ai", "ml", "prompt"],
};

function scoreAgentForSlot(agent: AgentRow, slot: SlotKey): number {
  const hay = `${agent.title} ${agent.primarySkill}`.toLowerCase();
  let score = 0;

  // Platform match: +10 per hit
  const ph = platformHints[slot.platform] ?? [];
  for (const h of ph) if (hay.includes(h)) score += 10;

  // Role match: +5 per hit
  const rh = roleHints[slot.role] ?? [];
  for (const h of rh) if (hay.includes(h)) score += 5;

  // Hint match: +3 per hit
  if (slot.hint) for (const h of slot.hint.toLowerCase().split(/\s+/)) {
    if (h && hay.includes(h)) score += 3;
  }

  // Thickness bonus: prefer thicker
  score += Math.floor(agent.total / 200); // every 200 char = +1

  return score;
}

function inferPlatformFromTaskId(id: string): string {
  if (id.startsWith("fb-")) return "facebook";
  if (id.startsWith("ig-")) return "instagram";
  if (id.startsWith("yt-")) return "youtube";
  if (id.startsWith("tt-")) return "tiktok";
  if (id.startsWith("li-")) return "linkedin";
  if (id.startsWith("em-")) return "email";
  if (id.startsWith("pr-")) return "press";
  if (id.startsWith("br-")) return "generic";
  if (id.startsWith("rs-")) return "research";
  return "generic";
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "mos_user",
    // 2026-07-05 (security): no hardcoded password fallback — require env.
    password: (() => {
      const p = process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD;
      if (!p) throw new Error("LOCAL_DB_PASSWORD (or DB_PASSWORD) must be set");
      return p;
    })(),
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  console.log("[1/5] Loading B+ agent pool from mos_db...");
  const [agentRows]: any = await pool.execute(`
    SELECT id, name, title, primarySkill,
      (CHAR_LENGTH(IFNULL(bio,''))
      + CHAR_LENGTH(IFNULL(specialty,''))
      + CHAR_LENGTH(IFNULL(methodology,''))
      + CHAR_LENGTH(IFNULL(experienceDetail,''))) AS total
    FROM agents
    WHERE isAvailable=1 AND reviewStatus='approved'
      AND CHAR_LENGTH(IFNULL(bio,'')) > 0
      AND CHAR_LENGTH(IFNULL(specialty,'')) > 0
      AND CHAR_LENGTH(IFNULL(methodology,'')) > 0
      AND CHAR_LENGTH(IFNULL(experienceDetail,'')) > 0
      AND (CHAR_LENGTH(IFNULL(bio,''))
        + CHAR_LENGTH(IFNULL(specialty,''))
        + CHAR_LENGTH(IFNULL(methodology,''))
        + CHAR_LENGTH(IFNULL(experienceDetail,''))) >= 400
    ORDER BY total DESC
  `);
  const pool_: AgentRow[] = agentRows as AgentRow[];
  console.log(`    → ${pool_.length} qualifying B+ agents available`);

  // ── Build slot inventory ────────────────────────────────────────────
  const slots: SlotKey[] = [];
  function addSlots(tasks: any[], orch: Record<string, any> | undefined) {
    for (const t of tasks) {
      const platform = t.outputDefaults?.platform ?? inferPlatformFromTaskId(t.id);
      const hint = `${t.label ?? ""} ${t.skill_slug ?? ""}`;
      slots.push({ taskId: t.id, role: "lead", hint, platform });
      const cfg = orch?.[t.id];
      if (cfg) {
        if (cfg.imageDirectorId) slots.push({ taskId: t.id, role: "imageDirector", hint, platform });
        if (cfg.strategistAgentId) slots.push({ taskId: t.id, role: "strategist", hint, platform });
        if (cfg.specialtyAgentId) slots.push({ taskId: t.id, role: "specialty", hint, platform });
        const ex = cfg.extras ?? {};
        if (ex.replyTemplates) slots.push({ taskId: t.id, role: "replyWriter", hint, platform });
        if (ex.postingTime) slots.push({ taskId: t.id, role: "timingAdvisor", hint, platform });
        if (ex.followupPost) slots.push({ taskId: t.id, role: "followupWriter", hint, platform });
        if (ex.compareTable) slots.push({ taskId: t.id, role: "compareTable", hint, platform });
        if (ex.timingAdvisor) slots.push({ taskId: t.id, role: "trendTimingAdvisor", hint, platform });
        if (ex.legalAssistant) slots.push({ taskId: t.id, role: "legalAssistant", hint, platform });
      }
    }
  }

  console.log("[2/5] Enumerating task slots...");
  addSlots(FB_30S_TASKS, FB_30S_ORCHESTRA);
  addSlots(IG_30S_TASKS, IG_30S_ORCHESTRA);
  addSlots(YT_30S_TASKS, YT_30S_ORCHESTRA);
  addSlots(TT_30S_TASKS, TT_30S_ORCHESTRA);
  addSlots(LI_30S_TASKS, LI_30S_ORCHESTRA);
  addSlots(EMAIL_30S_TASKS, EMAIL_30S_ORCHESTRA);
  addSlots(PR_30S_TASKS, undefined);
  addSlots(BRAND_30S_TASKS, BRAND_30S_ORCHESTRA);
  addSlots(RESEARCH_30S_TASKS, RESEARCH_30S_ORCHESTRA);
  addSlots(FB_60S_TASKS_V2, FB_60S_ORCHESTRA);
  addSlots(IG_60S_TASKS, IG_60S_ORCHESTRA);
  addSlots(YT_60S_TASKS, YT_60S_ORCHESTRA);
  addSlots(MULTI_60S_TASKS, MULTI_60S_ORCHESTRA);
  addSlots(ALL_99S_TASKS, ALL_99S_ORCHESTRA);

  // Media generation directors (image + video)
  slots.push({ taskId: "media-image-gen", role: "imageDirector", hint: "image gen prompt engineer + art direction", platform: "generic" });
  slots.push({ taskId: "media-video-gen", role: "videoDirector", hint: "video gen prompt engineer + cinematic direction", platform: "generic" });

  // 2026-05-09 (CJ direction): 企劃室補完 — Squad missions + positioning
  // steps assigned through JSON. Each squad mission exposes per-step
  // assigned agent slots so the planning room can show distinct agents
  // for every step.
  try {
    const { ALL_99S_SQUADS } = await import("../server/content/core/quickTask100Squads");
    for (const sq of ALL_99S_SQUADS) {
      const platform = (sq as any).platform ?? inferPlatformFromTaskId(sq.id);
      const hint = `${sq.label ?? ""} ${sq.methodology ?? ""}`;
      // 6 step slots per squad (lead + 5 specialists)
      const stepRoles = ["lead", "imageDirector", "strategist", "specialty", "replyWriter", "compareTable"];
      for (const role of stepRoles) {
        slots.push({ taskId: `squad-${sq.id}`, role, hint, platform });
      }
    }
    console.log(`    → +${ALL_99S_SQUADS.length * 6} squad slots`);
  } catch (e) {
    console.warn(`    ⚠ squad import failed: ${(e as Error).message}`);
  }

  // Positioning workflow steps (brand / product / event = ~24 steps total)
  try {
    const { buildBrandPositioningSteps, buildProductPositioningSteps, buildEventPositioningSteps } = await import("../server/strategy/core/positioningSteps");
    const allPosSteps = [
      ...buildBrandPositioningSteps({}).map((s: any) => ({ id: s.id, kind: "brand", platform: "generic" })),
      ...buildProductPositioningSteps({}).map((s: any) => ({ id: s.id, kind: "product", platform: "generic" })),
      ...buildEventPositioningSteps({}).map((s: any) => ({ id: s.id, kind: "event", platform: "generic" })),
    ];
    for (const ps of allPosSteps) {
      slots.push({ taskId: `positioning-${ps.kind}-${ps.id}`, role: "lead", hint: `positioning step ${ps.id}`, platform: ps.platform });
    }
    console.log(`    → +${allPosSteps.length} positioning step slots`);
  } catch (e) {
    console.warn(`    ⚠ positioning import failed: ${(e as Error).message}`);
  }

  console.log(`    → ${slots.length} slots total`);

  // ── Greedy 1:1 assignment ──────────────────────────────────────────
  // Process slots in priority order: lead first (most important), then
  // imageDir, strategist, etc. Within each role, sort by platform-narrow
  // first (avoid burning specialist agents on generic slots).
  console.log("[3/5] Computing 1:1 assignment...");
  const rolePriority: Record<string, number> = {
    lead: 1, imageDirector: 2, strategist: 3, specialty: 4,
    replyWriter: 5, timingAdvisor: 6, followupWriter: 7,
    compareTable: 8, trendTimingAdvisor: 9, legalAssistant: 10,
  };
  slots.sort((a, b) => (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99));

  const used = new Set<number>();
  const assignments: Record<string, Record<string, number>> = {};

  for (const slot of slots) {
    const ranked = pool_
      .filter((a) => !used.has(a.id))
      .map((a) => ({ a, score: scoreAgentForSlot(a, slot) }))
      .sort((x, y) => y.score - x.score);
    if (ranked.length === 0) {
      console.warn(`    ⚠ Pool exhausted at slot ${slot.taskId}/${slot.role}`);
      break;
    }
    const picked = ranked[0]!.a;
    used.add(picked.id);
    if (!assignments[slot.taskId]) assignments[slot.taskId] = {};
    assignments[slot.taskId]![slot.role] = picked.id;
  }
  console.log(`    → assigned ${used.size} unique agents to ${slots.length} slots`);

  // ── Verify thickness ───────────────────────────────────────────────
  console.log("[4/5] Verifying thickness...");
  const usedAgentMap = new Map(pool_.map((a) => [a.id, a]));
  let minThick = Infinity, total = 0;
  for (const id of used) {
    const a = usedAgentMap.get(id);
    if (a) { total += a.total; minThick = Math.min(minThick, a.total); }
  }
  console.log(`    → avg thickness ${Math.round(total / used.size)}, min ${minThick}`);

  // ── Write output ───────────────────────────────────────────────────
  const out = {
    generatedAt: new Date().toISOString(),
    poolSize: pool_.length,
    slotCount: slots.length,
    uniqueAgents: used.size,
    avgThickness: Math.round(total / used.size),
    minThickness: minThick,
    assignments,
  };
  const outPath = join(__dirnameSafe, "..", "data", "agent-assignments.json");
  mkdirSync(join(__dirnameSafe, "..", "data"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[5/5] Written → ${outPath}`);

  await pool.end();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
