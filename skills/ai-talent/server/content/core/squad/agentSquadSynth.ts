/**
 * agentSquadSynth.ts — turn any DB agent row into a squad-shaped runtime object.
 *
 * Purpose: let the chip recommender + mission chat + right sidebar treat an
 * individual agent the same way they treat a full Lead-solo squad. This
 * unlocks 17k+ agents as potential "squad chips" without seeding new squads.
 *
 * Design rules:
 *   1. STEPS derived from agent.skills (JSON array). Each skill = 1 step.
 *      If no skills JSON → fall back to [primarySkill, "交付"].
 *      Hard cap at 5 steps (last step always reserved for boardroom output).
 *
 *   2. TOOLS per step assigned by skill-keyword rules (see SKILL_TOOL_RULES).
 *      Research/audit skills get web tools. Deliverable/report skills get
 *      citation_bundler + boardroom_pdf. Creative/strategy skills get no
 *      external tools (pure text generation). The LAST step ALWAYS gets
 *      citation_bundler + boardroom_pdf appended — guarantees every agent
 *      produces an automation-ops deliverable.
 *
 *   3. METHODOLOGY falls back in priority: agent.methodology → specialty →
 *      "Apply your primarySkill ({primarySkill}) rigorously" synthetic.
 *
 *   4. All fields mirror what squadTemplateRouter.getMembersById returns so
 *      the sidebar component needs zero changes.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface AgentRow {
  id: number;
  slug?: string | null;
  name: string;
  title?: string | null;
  specialty?: string | null;
  primarySkill?: string | null;
  methodology?: string | null;
  skills?: unknown; // JSON — may be array of strings or objects, or string, or null
  taskType?: string | null;
  layer?: string | null;
  aiModel?: string | null;
  avatarUrl?: string | null;
  industries?: unknown;
}

export interface SynthStep {
  order: number;
  title: string;
  description: string;
  skill: string;
  requiredTools: string[];
  outputType: string;
}

export interface SynthSquad {
  /** discriminator — this is a synthesized squad, not a real row */
  kind: "agent";
  /** synthetic squad id: negative number = -agentId, avoids collision with real squads */
  squadId: number;
  slug: string;
  name: string;
  methodology: string;
  leadAgentId: number;
  leadName: string;
  leadTitle: string;
  steps: SynthStep[];
  agents: Array<{ agent_id: number; role: string; is_lead: 1; order: 1 }>;
}

// ── Skill → Tools mapping ──────────────────────────────────────────────────
//
// Rules evaluated in order. First match wins (except boardroom which is
// always appended to the last step, handled separately in synthesize()).

type ToolRule = { match: RegExp; tools: string[] };

const SKILL_TOOL_RULES: ToolRule[] = [
  // Research / audit / intelligence
  {
    match: /audit|research|analysis|analytic|intelligence|insight|listen|monitor|competitor|benchmark|scan|crawl|trend|search|keyword|mapping|survey|interview|ethnograph/i,
    tools: ["web_search", "web_fetch", "site_crawl"],
  },
  // SEO / technical website work
  {
    match: /seo|on[-_\s]?page|off[-_\s]?page|schema|structured[-_\s]?data|link[-_\s]?build|backlink|technical[-_\s]?audit|website|site[-_\s]?arch|information[-_\s]?arch|ux[-_\s]?audit/i,
    tools: ["site_crawl", "web_fetch", "web_search"],
  },
  // Social / content listening (needs crawl + search)
  {
    match: /social[-_\s]?listen|sentiment|buzz|trend|viral|hashtag|community[-_\s]?research/i,
    tools: ["web_search", "web_fetch"],
  },
  // Reporting / dashboards / exports
  {
    match: /report|dashboard|deliverable|export|scorecard|brief|present/i,
    tools: ["citation_bundler", "boardroom_pdf"],
  },
  // Pure strategy / creative / writing — no external tools
  {
    match: /strategy|positioning|narrative|story|copy|writing|creative|design|persona|segmentation|ladder|funnel[-_\s]?design|offer|value[-_\s]?prop|messaging|campaign[-_\s]?design|hook|archetype/i,
    tools: [],
  },
];

const DEFAULT_TOOLS = ["web_search"];
const FINAL_DELIVERABLE_TOOLS = ["citation_bundler", "boardroom_pdf"];

function toolsForSkill(skill: string): string[] {
  for (const rule of SKILL_TOOL_RULES) {
    if (rule.match.test(skill)) return [...rule.tools];
  }
  return [...DEFAULT_TOOLS];
}

// ── Skill extraction ────────────────────────────────────────────────────────

function parseSkills(raw: unknown): string[] {
  if (!raw) return [];
  let arr: any = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return [raw]; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => {
      if (typeof s === "string") return s.trim();
      if (s && typeof s === "object") return String(s.name ?? s.skill ?? s.label ?? "").trim();
      return "";
    })
    .filter(Boolean);
}

function humanizeSkill(skill: string): string {
  // "seo-audit" → "SEO 稽核"; "keyword_research" → "Keyword Research"
  const cleaned = skill.replace(/[-_]/g, " ").trim();
  // Leave Chinese untouched
  if (/[\u4e00-\u9fff]/.test(cleaned)) return cleaned;
  return cleaned.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

// ── Main synthesize ─────────────────────────────────────────────────────────

const MAX_STEPS = 5;

export function synthesizeAgentAsSquad(agent: AgentRow): SynthSquad {
  const rawSkills = parseSkills(agent.skills);
  const primarySkill = (agent.primarySkill ?? "").trim();

  // Compose skill list — primary first if not already in skills
  const skillSet: string[] = [];
  if (primarySkill) skillSet.push(primarySkill);
  for (const s of rawSkills) {
    if (!skillSet.some((x) => x.toLowerCase() === s.toLowerCase())) skillSet.push(s);
  }
  if (skillSet.length === 0) {
    skillSet.push(agent.specialty ?? "諮詢");
  }

  // Reserve the last slot for a final deliverable step
  const bodySkills = skillSet.slice(0, MAX_STEPS - 1);

  const steps: SynthStep[] = bodySkills.map((skill, i) => {
    const tools = toolsForSkill(skill);
    return {
      order: i + 1,
      title: humanizeSkill(skill),
      description: `以 ${agent.name} 的 ${humanizeSkill(skill)} 專長展開本步：蒐集證據、產出結構化發現、為下一步鋪路。`,
      skill,
      requiredTools: tools,
      outputType: i === bodySkills.length - 1 && bodySkills.length === skillSet.length
        ? "boardroom-pdf"
        : "structured-note",
    };
  });

  // Always append a final boardroom deliverable step (automation-ops guarantee)
  steps.push({
    order: steps.length + 1,
    title: "董事會交付",
    description: "把前面幾步的發現彙整為可直接交付客戶的 boardroom PDF：Executive Summary、Sections、Recommendations、Citations。",
    skill: "boardroom-deliverable",
    requiredTools: FINAL_DELIVERABLE_TOOLS,
    outputType: "boardroom-pdf",
  });

  // Fallback methodology
  const methodology = agent.methodology?.trim()
    || (agent.specialty ? `You are ${agent.name}. Specialty: ${agent.specialty}. Apply your primary skill "${primarySkill || "consulting"}" with rigor, cite evidence, and move the engagement toward a boardroom-quality deliverable.`
      : `You are ${agent.name}, a specialist focused on ${primarySkill || "marketing consulting"}. Operate rigorously: every claim grounded in evidence, every step produces a concrete artifact, the final step produces a boardroom PDF.`);

  return {
    kind: "agent",
    squadId: -Math.abs(agent.id), // negative id sentinel — never collides with real squads
    slug: `agent:${agent.slug ?? agent.id}`,
    name: `${agent.name} ${agent.title ? `（${agent.title}）` : ""}`.trim(),
    methodology,
    leadAgentId: agent.id,
    leadName: agent.name,
    leadTitle: agent.title ?? "Specialist",
    steps,
    agents: [{ agent_id: agent.id, role: agent.title ?? "Specialist", is_lead: 1, order: 1 }],
  };
}

// ── Helpers for routers ────────────────────────────────────────────────────

