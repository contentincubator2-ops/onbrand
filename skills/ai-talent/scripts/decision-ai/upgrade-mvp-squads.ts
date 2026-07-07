/**
 * Decision AI — MVP squad upgrade.
 *
 * Promotes 6 squads to `tier=core` with correct `strategy_layer`, and
 * patches their `steps` so every step has `assignedAgentId`. Idempotent.
 *
 * Target squads (see docs/decision-catalog.md):
 *   546 sowork-brand-positioning        L1_brand    (already core, already complete)
 *   556 brand-archetype-positioning     L1_brand    (core; steps need assignedAgentId)
 *   715 benefit-based-positioning       L1_brand    (defer → core; steps=NULL → build 5)
 *   651 consumer-insight-intelligence   L3_audience (defer → core; steps legacy `owner` → normalize)
 *   557 fb-garyvee-jab-hook             L4_channel  (defer → core; steps already complete)
 *   569 ig-baer-youtility               L4_channel  (defer → core; steps already complete)
 *
 * Usage:
 *   npm run db:upgrade-mvp-squads
 */
import { createPool, type PoolConnection } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

type Step = {
  order: number;
  name: string;
  description: string;
  outputType: string;
  requiredSkills: string[];
  tool?: string;
  assignedAgentId?: number | null;
  assignedAgentName?: string;
  assignedAgentSlug?: string;
};

async function findAgentBySkill(
  conn: PoolConnection,
  skills: string[],
  excludeIds: Set<number>
): Promise<{ id: number; name: string; slug: string } | null> {
  for (const skill of skills) {
    const [rows] = await conn.execute(
      `SELECT id, name, slug FROM agents
        WHERE isAvailable = 1
          AND (primarySkill = ? OR JSON_CONTAINS(skills, JSON_QUOTE(?)))
          ${excludeIds.size ? `AND id NOT IN (${Array.from(excludeIds).join(",")})` : ""}
        ORDER BY id ASC
        LIMIT 1`,
      [skill, skill]
    );
    const r = (rows as any[])[0];
    if (r) {
      excludeIds.add(r.id);
      return { id: r.id, name: r.name, slug: r.slug };
    }
  }
  return null;
}

async function fallbackAnyAgent(
  conn: PoolConnection,
  excludeIds: Set<number>
): Promise<{ id: number; name: string; slug: string }> {
  const [rows] = await conn.execute(
    `SELECT id, name, slug FROM agents
      WHERE isAvailable = 1
        ${excludeIds.size ? `AND id NOT IN (${Array.from(excludeIds).join(",")})` : ""}
      ORDER BY id ASC
      LIMIT 1`
  );
  const r = (rows as any[])[0];
  if (!r) throw new Error("No agents available at all.");
  excludeIds.add(r.id);
  return { id: r.id, name: r.name, slug: r.slug };
}

async function assignAgents(
  conn: PoolConnection,
  steps: Step[],
  keepExistingIds: boolean
): Promise<Step[]> {
  const used = new Set<number>();
  if (keepExistingIds) {
    for (const s of steps) if (s.assignedAgentId) used.add(s.assignedAgentId);
  }
  const out: Step[] = [];
  for (const s of steps) {
    if (keepExistingIds && s.assignedAgentId) {
      out.push(s);
      continue;
    }
    const picked =
      (await findAgentBySkill(conn, s.requiredSkills, used)) ||
      (await fallbackAnyAgent(conn, used));
    out.push({
      ...s,
      assignedAgentId: picked.id,
      assignedAgentName: picked.name,
      assignedAgentSlug: picked.slug,
    });
  }
  return out;
}

// ─── Benefit-based (715): 5 steps from scratch (Aaker brand identity model) ──

const BENEFIT_BASED_STEPS: Step[] = [
  {
    order: 1,
    name: "特性盤點",
    description:
      "盤點產品 / 服務的所有客觀特性（規格、成分、製程、技術、價格、通路）。",
    outputType: "feature-list",
    requiredSkills: ["product-analysis", "brand-dna", "competitive-analysis"],
    tool: "internal",
  },
  {
    order: 2,
    name: "功能利益轉譯",
    description:
      "把特性翻譯為對使用者有直接用途的功能利益（功能性 benefit），量化可衡量。",
    outputType: "functional-benefits",
    requiredSkills: [
      "marketing-strategy-pmm",
      "value-proposition",
      "brand-strategy",
    ],
    tool: "internal",
  },
  {
    order: 3,
    name: "情感利益萃取",
    description:
      "從顧客語言挖掘情感利益（emotional benefit）：使用時的感受、身份認同、歸屬感。",
    outputType: "emotional-benefits",
    requiredSkills: ["consumer-insights", "brand-narrative", "qualitative-research"],
    tool: "internal",
  },
  {
    order: 4,
    name: "自我表達利益",
    description:
      "Aaker 的 self-expressive benefit：使用者藉此向世界傳達「我是誰」。",
    outputType: "self-expressive-benefit",
    requiredSkills: ["brand-dna", "cultural-strategy", "brand-narrative"],
    tool: "internal",
  },
  {
    order: 5,
    name: "利益階梯定稿 + Hero copy",
    description:
      "整合四層利益，定稿 benefit ladder；產出 landing page hero copy 與廣告 A/B headlines。",
    outputType: "benefit-ladder-doc+hero-copy-variants",
    requiredSkills: ["copywriting", "hook-copywriter", "brand-voice"],
    tool: "internal",
  },
];

// ─── Consumer-insight (651): normalize legacy `owner` strings ───────────────

const CONSUMER_INSIGHT_SKILL_MAP: Record<string, string[]> = {
  squad_lead: ["research-director", "cmo", "market-research"],
  data_analyst: ["data-analysis", "quantitative-research", "marketing-analytics"],
  qualitative_researcher: [
    "qualitative-research",
    "consumer-insights",
    "ethnographic-research",
  ],
  trend_analyst: ["trend-analysis", "market-research", "consumer-insights"],
};

async function normalizeConsumerInsightSteps(
  conn: PoolConnection,
  legacy: any[]
): Promise<Step[]> {
  const used = new Set<number>();
  const out: Step[] = [];
  const leadCache: Record<string, { id: number; name: string; slug: string }> = {};
  for (const l of legacy) {
    const owner: string = l.owner ?? "squad_lead";
    let picked = leadCache[owner];
    if (!picked) {
      const skills = CONSUMER_INSIGHT_SKILL_MAP[owner] ?? ["market-research"];
      picked =
        (await findAgentBySkill(conn, skills, used)) ||
        (await fallbackAnyAgent(conn, used));
      if (owner === "squad_lead") leadCache[owner] = picked;
    }
    out.push({
      order: l.step ?? out.length + 1,
      name: l.title,
      description: l.description,
      outputType: slugify(l.output || ""),
      requiredSkills: CONSUMER_INSIGHT_SKILL_MAP[owner] ?? ["market-research"],
      tool: "internal",
      assignedAgentId: picked.id,
      assignedAgentName: picked.name,
      assignedAgentSlug: picked.slug,
    });
  }
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ─── Archetype (556): keep existing lead_agent for step 1, fill others ──────

async function patchArchetypeSteps(
  conn: PoolConnection,
  existing: any[],
  leadAgentId: number | null
): Promise<Step[]> {
  const used = new Set<number>();
  if (leadAgentId) used.add(leadAgentId);
  const leadInfo = leadAgentId
    ? (
        ((await conn.execute(
          `SELECT id, name, slug FROM agents WHERE id = ?`,
          [leadAgentId]
        )) as any)[0] as any[]
      )[0]
    : null;
  const out: Step[] = [];
  for (let i = 0; i < existing.length; i++) {
    const s = existing[i];
    const skills: string[] = Array.isArray(s.requiredSkills)
      ? s.requiredSkills
      : s.skill
        ? [s.skill]
        : [];
    const isLeadStep = i === 0 || i === existing.length - 1;
    const picked =
      isLeadStep && leadInfo
        ? { id: leadInfo.id, name: leadInfo.name, slug: leadInfo.slug }
        : (await findAgentBySkill(conn, skills, used)) ||
          (await fallbackAnyAgent(conn, used));
    out.push({
      order: s.order ?? i + 1,
      name: s.title ?? s.name ?? `Step ${i + 1}`,
      description: s.description ?? "",
      outputType: s.outputType ?? "",
      requiredSkills: skills,
      tool: s.tool ?? "internal",
      assignedAgentId: picked.id,
      assignedAgentName: picked.name,
      assignedAgentSlug: picked.slug,
    });
  }
  return out;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || process.env.DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || process.env.DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "MUST_SET_LOCAL_DB_PASSWORD",
    database: process.env.LOCAL_DB_NAME     || process.env.DB_NAME     || "mos_db",
  });
  const conn = await pool.getConnection();
  try {
    console.log("[upgrade-mvp-squads] Starting...");

    // A) Promote layers + tier
    const promotions: Array<[number, string]> = [
      [715, "L1_brand"],      // benefit-based-positioning
      [651, "L3_audience"],   // consumer-insight-intelligence
      [557, "L4_channel"],    // fb-garyvee-jab-hook
      [569, "L4_channel"],    // ig-baer-youtility
    ];
    for (const [id, layer] of promotions) {
      await conn.execute(
        `UPDATE squads SET tier='core', strategy_layer=? WHERE id = ?`,
        [layer, id]
      );
      console.log(`[promote] squad ${id} → tier=core, layer=${layer}`);
    }

    // B) Patch benefit-based (715) steps
    const benefitSteps = await assignAgents(conn, BENEFIT_BASED_STEPS, false);
    await conn.execute(`UPDATE squads SET steps = ? WHERE id = 715`, [
      JSON.stringify(benefitSteps),
    ]);
    console.log(
      `[patch 715] benefit-based steps built: ${benefitSteps
        .map((s) => `${s.order}=${s.assignedAgentId}`)
        .join(", ")}`
    );

    // C) Normalize consumer-insight (651) steps
    const [ciRows] = await conn.execute(
      `SELECT steps FROM squads WHERE id = 651`
    );
    const ciLegacyRaw = (ciRows as any[])[0]?.steps;
    const ciLegacy =
      typeof ciLegacyRaw === "string" ? JSON.parse(ciLegacyRaw) : ciLegacyRaw;
    const alreadyNew = Array.isArray(ciLegacy)
      ? ciLegacy.every((s: any) => s.assignedAgentId)
      : false;
    if (alreadyNew) {
      console.log(`[patch 651] consumer-insight already in new format, skipped`);
    } else {
      const ciSteps = await normalizeConsumerInsightSteps(conn, ciLegacy || []);
      await conn.execute(`UPDATE squads SET steps = ? WHERE id = 651`, [
        JSON.stringify(ciSteps),
      ]);
      console.log(
        `[patch 651] consumer-insight normalized: ${ciSteps
          .map((s) => `${s.order}=${s.assignedAgentId}`)
          .join(", ")}`
      );
    }

    // D) Archetype (556): add assignedAgentId to steps
    const [archRows] = await conn.execute(
      `SELECT steps, lead_agent_id FROM squads WHERE id = 556`
    );
    const archRow = (archRows as any[])[0];
    const archLegacyRaw = archRow?.steps;
    const archLegacy =
      typeof archLegacyRaw === "string"
        ? JSON.parse(archLegacyRaw)
        : archLegacyRaw;
    const archAlready = Array.isArray(archLegacy)
      ? archLegacy.every((s: any) => s.assignedAgentId)
      : false;
    if (archAlready) {
      console.log(`[patch 556] archetype already has assignedAgentId, skipped`);
    } else {
      const archSteps = await patchArchetypeSteps(
        conn,
        archLegacy || [],
        archRow?.lead_agent_id ?? null
      );
      await conn.execute(`UPDATE squads SET steps = ? WHERE id = 556`, [
        JSON.stringify(archSteps),
      ]);
      console.log(
        `[patch 556] archetype steps patched: ${archSteps
          .map((s) => `${s.order}=${s.assignedAgentId}`)
          .join(", ")}`
      );
    }

    // E) Lead agent backfill for 546/651/715/569 (squads with no lead_agent_id)
    const [noLead] = await conn.execute(
      `SELECT id, slug, steps FROM squads WHERE id IN (546,651,715,569) AND lead_agent_id IS NULL`
    );
    for (const row of noLead as any[]) {
      const stepsRaw = row.steps;
      const steps = typeof stepsRaw === "string" ? JSON.parse(stepsRaw) : stepsRaw;
      const firstAgent = Array.isArray(steps) && steps[0]?.assignedAgentId;
      if (firstAgent) {
        await conn.execute(
          `UPDATE squads SET lead_agent_id = ? WHERE id = ?`,
          [firstAgent, row.id]
        );
        console.log(`[lead] ${row.slug} (${row.id}) → lead_agent_id=${firstAgent}`);
      }
    }

    console.log("[upgrade-mvp-squads] Done.");
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[upgrade-mvp-squads] FAILED:", err);
  process.exit(1);
});
