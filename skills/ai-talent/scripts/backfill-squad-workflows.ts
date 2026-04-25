/**
 * backfill-squad-workflows.ts
 *
 * Goal: every active squad ends this run with a "qualified" steps[]:
 *   - 4–6 ordered steps
 *   - each step has: order, name, description, requiredSkills[],
 *     outputType, assignedAgentId (number)
 *   - last step is the universal Boardroom stress-test gate
 *
 * Algorithm per squad that doesn't already qualify:
 *   1. Hydrate context: name, methodology, description, layer, agents
 *      (with their primarySkill).
 *   2. Ask LLM (azure-foundry zh → gpt-5-nano) for 4–6 steps with
 *      name/description/requiredSkill/outputType — no agent assignment.
 *   3. Assign each step to the squad member whose primarySkill best
 *      matches the step's requiredSkill (token-overlap score). Lead
 *      member is preferred for first + last steps when tied.
 *   4. Append the stress-test step assigned to the lead, if not present.
 *   5. UPDATE squads SET steps = JSON, updatedAt = NOW() WHERE id = ?.
 *
 * Safety: the script is idempotent. It never touches squads that already
 * pass the audit gate.
 *
 * Flags:
 *   --dry-run       compute new steps, don't write
 *   --limit=N       only process the first N non-qualified squads
 *   --layer=L1,L4   restrict to these strategy layers
 *   --slugs=a,b,c   restrict to these slugs
 *
 * Usage: npx tsx scripts/backfill-squad-workflows.ts [--dry-run] [--limit=10]
 */
import { createPool, type Pool } from "mysql2/promise";
import * as dotenv from "dotenv";
import { invokeLLM } from "../server/_core/llm.js";
dotenv.config();

interface SquadRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  methodology: string | null;
  tier: string | null;
  strategy_layer: string | null;
  workspace: string | null;
  steps: any;
  agents: any;
}

interface AgentRow {
  id: number;
  slug: string | null;
  name: string;
  primarySkill: string | null;
}

interface MemberAgent {
  agentId: number;
  agentName: string;
  agentSlug: string | null;
  primarySkill: string | null;
  isLead: boolean;
  role: string;
}

interface LlmStep {
  name: string;
  description: string;
  requiredSkill: string;
  outputType: string;
}

interface FinalStep {
  order: number;
  name: string;
  description: string;
  tool: string | null;
  outputType: string;
  requiredSkills: string[];
  assignedAgentId: number;
  assignedAgentSlug: string | null;
  assignedAgentName: string;
}

const DRY = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const a = process.argv.find((x) => x.startsWith("--limit="));
  return a ? Number(a.split("=")[1]) : Infinity;
})();
const LAYER_FILTER = (() => {
  const a = process.argv.find((x) => x.startsWith("--layer="));
  return a ? a.split("=")[1].split(",").map((s) => s.trim().toUpperCase()) : null;
})();
const SLUG_FILTER = (() => {
  const a = process.argv.find((x) => x.startsWith("--slugs="));
  return a ? a.split("=")[1].split(",").map((s) => s.trim()) : null;
})();

function parseJson(val: any): any {
  if (val == null) return null;
  if (Array.isArray(val) || typeof val === "object") return val;
  const str = Buffer.isBuffer(val) ? val.toString("utf8") : String(val);
  if (!str || str === "null" || str === "[]") return [];
  try { return JSON.parse(str); } catch { return null; }
}

function isQualified(steps: any): boolean {
  if (!Array.isArray(steps) || steps.length < 3) return false;
  return steps.every((s) => typeof s?.assignedAgentId === "number" && typeof s?.name === "string");
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Score how well a member's primarySkill + role matches a requiredSkill. */
function scoreMember(m: MemberAgent, requiredSkill: string): number {
  const need = new Set(tokenize(requiredSkill));
  const have = new Set([
    ...tokenize(m.primarySkill ?? ""),
    ...tokenize(m.role ?? ""),
  ]);
  let score = 0;
  for (const t of need) if (have.has(t)) score += 2;
  // bonus: same first token
  const n0 = [...need][0]; const h0 = m.primarySkill ? tokenize(m.primarySkill)[0] : "";
  if (n0 && n0 === h0) score += 1;
  return score;
}

function bestMember(members: MemberAgent[], requiredSkill: string, opts: { preferLead?: boolean } = {}): MemberAgent {
  let best = members[0];
  let bestScore = -1;
  for (const m of members) {
    let s = scoreMember(m, requiredSkill);
    if (opts.preferLead && m.isLead) s += 0.5;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

async function loadAgents(pool: Pool, agentIds: number[]): Promise<Map<number, AgentRow>> {
  if (agentIds.length === 0) return new Map();
  const placeholders = agentIds.map(() => "?").join(",");
  const [rows] = await pool.execute(
    `SELECT id, slug, name, primarySkill FROM agents WHERE id IN (${placeholders})`,
    agentIds,
  ) as any[];
  const m = new Map<number, AgentRow>();
  for (const r of rows as AgentRow[]) m.set(r.id, r);
  return m;
}

async function generateSteps(squad: SquadRow, members: MemberAgent[]): Promise<LlmStep[]> {
  const sys = `You design 4-6 step execution workflows for marketing-strategy squads.
Output STRICT JSON: { "steps": [{ "name": string, "description": string, "requiredSkill": string, "outputType": string }] }
Rules:
- Exactly 4-6 steps, ordered logically (research → analyze → synthesize → deliver).
- Step name: 2-6 words, action-oriented, in zh-TW.
- description: <= 90 chars zh-TW, what THIS step produces.
- requiredSkill: kebab-case english, single concrete skill (e.g. "competitor-analysis", "audience-segmentation").
- outputType: one of brief|research|doc|plan|deliverable|asset|audit.
- The workflow must reflect this squad's specific methodology, not a generic template.`;

  const memberSummary = members.map((m, i) => `${i + 1}. ${m.role}${m.isLead ? " (LEAD)" : ""} — primarySkill: ${m.primarySkill ?? "n/a"}`).join("\n");
  const user = `Squad: ${squad.name}
Slug: ${squad.slug}
Methodology: ${squad.methodology ?? "(unspecified)"}
Layer: ${squad.strategy_layer ?? squad.tier ?? "?"}
Workspace: ${squad.workspace ?? "?"}
Description: ${(squad.description ?? "").slice(0, 400)}

Squad members (you MUST design steps that use these specialists' skills):
${memberSummary}

Design the 4-6 step workflow. Return the JSON now.`;

  const result = await invokeLLM({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    maxTokens: 1500,
  });
  const content = result.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? content : Array.isArray(content) ? content.map((p: any) => p?.type === "text" ? p.text : "").join("") : "{}";
  const parsed = JSON.parse(raw);
  const steps = parsed.steps;
  if (!Array.isArray(steps) || steps.length < 3) throw new Error(`LLM returned ${Array.isArray(steps) ? steps.length : "no"} steps`);
  return steps.slice(0, 6).map((s: any) => ({
    name: String(s.name ?? "").trim() || "Step",
    description: String(s.description ?? "").trim(),
    requiredSkill: String(s.requiredSkill ?? "general-strategy").trim(),
    outputType: String(s.outputType ?? "deliverable").trim(),
  }));
}

function buildFinalSteps(llmSteps: LlmStep[], members: MemberAgent[]): FinalStep[] {
  const lead = members.find((m) => m.isLead) ?? members[0];
  const final: FinalStep[] = llmSteps.map((s, i) => {
    const isFirstOrLast = i === 0 || i === llmSteps.length - 1;
    const m = bestMember(members, s.requiredSkill, { preferLead: isFirstOrLast });
    return {
      order: i + 1,
      name: s.name,
      description: s.description,
      tool: null,
      outputType: s.outputType,
      requiredSkills: [s.requiredSkill],
      assignedAgentId: m.agentId,
      assignedAgentSlug: m.agentSlug,
      assignedAgentName: m.agentName,
    };
  });
  // Append stress-test gate if not present
  const hasStressTest = final.some((s) => s.outputType === "stress-test-evidence-brief");
  if (!hasStressTest) {
    final.push({
      order: final.length + 1,
      name: "壓力測試 + 證據彙整",
      description: "Lead 對前面步驟的結論做反向質疑、列出假設與限制，並彙整成董事會可呈交的證據簡報。",
      tool: null,
      outputType: "stress-test-evidence-brief",
      requiredSkills: ["evidence-stress-test", "boardroom-synthesis"],
      assignedAgentId: lead.agentId,
      assignedAgentSlug: lead.agentSlug,
      assignedAgentName: lead.agentName,
    });
  }
  return final;
}

async function main() {
  const pool = createPool({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    charset: "utf8mb4",
  });
  console.log(`[backfill] connected to ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  console.log(`[backfill] dry-run=${DRY} limit=${Number.isFinite(LIMIT) ? LIMIT : "∞"} layer=${LAYER_FILTER?.join(",") ?? "all"} slugs=${SLUG_FILTER?.length ?? "all"}`);

  const [rows] = await pool.execute(
    `SELECT id, slug, name, description, methodology, tier, strategy_layer, workspace, steps, agents
     FROM squads WHERE is_active = 1 ORDER BY id ASC`
  ) as any[];
  const all = rows as SquadRow[];
  console.log(`[backfill] active squads: ${all.length}`);

  const candidates = all.filter((r) => {
    if (SLUG_FILTER && !SLUG_FILTER.includes(r.slug)) return false;
    if (LAYER_FILTER) {
      const layer = (r.strategy_layer || r.tier || "").toString().toUpperCase();
      const ok = LAYER_FILTER.some((f) => layer.includes(f));
      if (!ok) return false;
    }
    return !isQualified(parseJson(r.steps));
  }).slice(0, LIMIT);

  console.log(`[backfill] candidates needing backfill: ${candidates.length}`);
  if (candidates.length === 0) { console.log("[backfill] nothing to do."); await pool.end(); return; }

  let ok = 0, skipped = 0, failed = 0;
  for (let i = 0; i < candidates.length; i++) {
    const sq = candidates[i];
    const tag = `[${i + 1}/${candidates.length}] #${sq.id} ${sq.slug}`;
    try {
      const agentsJson = parseJson(sq.agents) ?? [];
      if (!Array.isArray(agentsJson) || agentsJson.length === 0) {
        console.log(`${tag}  SKIP — no agents JSON`);
        skipped++; continue;
      }
      const agentIds = agentsJson.map((a: any) => Number(a.agent_id)).filter((n: number) => Number.isFinite(n));
      const agentsById = await loadAgents(pool, agentIds);
      const members: MemberAgent[] = agentsJson.map((a: any) => {
        const ar = agentsById.get(Number(a.agent_id));
        if (!ar) return null;
        return {
          agentId: ar.id,
          agentName: ar.name,
          agentSlug: ar.slug ?? null,
          primarySkill: ar.primarySkill ?? null,
          isLead: !!a.is_lead,
          role: String(a.role ?? ar.name),
        };
      }).filter(Boolean) as MemberAgent[];
      if (members.length === 0) {
        console.log(`${tag}  SKIP — agent ids couldn't be resolved`);
        skipped++; continue;
      }

      const llmSteps = await generateSteps(sq, members);
      const finalSteps = buildFinalSteps(llmSteps, members);

      if (DRY) {
        console.log(`${tag}  DRY  → ${finalSteps.length} steps: ${finalSteps.map((s) => s.name).join(" / ")}`);
      } else {
        await pool.execute(
          `UPDATE squads SET steps = ?, updatedAt = NOW() WHERE id = ?`,
          [JSON.stringify(finalSteps), sq.id]
        );
        console.log(`${tag}  OK   → ${finalSteps.length} steps written`);
      }
      ok++;
    } catch (e: any) {
      console.log(`${tag}  FAIL — ${e?.message ?? e}`);
      failed++;
    }
  }

  console.log(`\n[backfill] DONE  ok=${ok} skipped=${skipped} failed=${failed} dry=${DRY}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
