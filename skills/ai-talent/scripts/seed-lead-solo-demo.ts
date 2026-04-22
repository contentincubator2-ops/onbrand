/**
 * seed-lead-solo-demo.ts — one-shot Lead-solo demo seeder.
 *
 * Does everything needed for tomorrow's demo:
 *   1. Schema migration (squads.lead_agent_id + architecture)
 *   2. Dump & hide old A2A squads
 *   3. Ensure 3 Lead agents exist (Mary Allen, Deiss-style, Hormozi-style)
 *   4. Upsert 3 Lead-solo squads with new steps JSON shape
 *   5. Create/upsert 復華投信 brand
 *   6. Create 3 missions (one per squad) for 復華投信
 *
 * Idempotent.
 *
 * Run: npx tsx scripts/seed-lead-solo-demo.ts
 */

import localPool from "../server/localDb";
import * as fs from "node:fs";
import * as path from "node:path";

const ARCHIVE_DIR = path.resolve(
  process.cwd(), "..", "..", "..",
  "A2A-Marketing-Claw-archive", "2026-04-22-a2a-version", "db-dumps",
);

const DEMO_USER_ID = Number(process.env.DEMO_USER_ID ?? 1235277);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "x";
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await localPool.execute(
    `SELECT COUNT(*) as c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  ) as any[];
  return (rows as any[])[0].c > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`  ↷ ${table}.${column} exists, skip`);
    return;
  }
  await localPool.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`  ✓ ${table}.${column} added`);
}

async function dumpTable(table: string) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  try {
    const [rows] = await localPool.execute(`SELECT * FROM ${table}`) as any[];
    fs.writeFileSync(path.join(ARCHIVE_DIR, `${table}.json`), JSON.stringify(rows, null, 2));
    console.log(`  ✓ dumped ${table} (${(rows as any[]).length} rows)`);
  } catch (err: any) {
    console.log(`  ↷ ${table} dump skip: ${err.message}`);
  }
}

// ── Step 1: Schema migration ────────────────────────────────────────────────
async function migrate() {
  console.log("\n[1/6] Schema migration");
  await addColumn("squads", "lead_agent_id", "lead_agent_id INT NULL AFTER methodology");
  await addColumn("squads", "architecture", "architecture VARCHAR(16) NOT NULL DEFAULT 'a2a' AFTER lead_agent_id");

  // Backfill lead_agent_id from squad_members
  try {
    await localPool.execute(`
      UPDATE squads s
      LEFT JOIN (
        SELECT squad_id, MIN(agent_id) AS lead_id FROM squad_members
        WHERE is_lead = 1 GROUP BY squad_id
      ) sm ON sm.squad_id = s.id
      SET s.lead_agent_id = sm.lead_id
      WHERE s.lead_agent_id IS NULL AND sm.lead_id IS NOT NULL
    `);
    console.log("  ✓ backfilled lead_agent_id");
  } catch (err: any) {
    console.log(`  ! backfill: ${err.message}`);
  }
}

// ── Step 2: Archive & hide old ──────────────────────────────────────────────
async function archiveOld() {
  console.log("\n[2/6] Archive & hide A2A squads");
  await dumpTable("squads");
  await dumpTable("squad_members");
  await dumpTable("squad_template");
  await dumpTable("workflow_templates");
  await dumpTable("squad_chat_sessions");

  const [r] = await localPool.execute(
    `UPDATE squads SET is_active = 0 WHERE architecture = 'a2a'`
  ) as any[];
  console.log(`  ✓ hid ${(r as any).affectedRows} A2A squads`);
}

// ── Step 3: Ensure Lead agents ──────────────────────────────────────────────
interface LeadAgentSpec {
  name: string;
  title: string;
  specialty: string;
  primarySkill: string;
  methodology: string;
  aiModel?: string;
  avatarUrl?: string;
}

async function findOrCreateAgent(spec: LeadAgentSpec): Promise<number> {
  const [found] = await localPool.execute(
    `SELECT id FROM agents WHERE name = ? LIMIT 1`, [spec.name]
  ) as any[];
  if ((found as any[])[0]?.id) {
    const id = (found as any[])[0].id;
    // Update methodology + specialty to keep fresh
    await localPool.execute(
      `UPDATE agents SET specialty = ?, primarySkill = ?, methodology = ?, aiModel = COALESCE(?, aiModel)
       WHERE id = ?`,
      [spec.specialty, spec.primarySkill, spec.methodology, spec.aiModel ?? null, id],
    );
    console.log(`  ↷ agent exists: ${spec.name} (id=${id}), methodology refreshed`);
    return id;
  }
  const [result] = await localPool.execute(
    `INSERT INTO agents (slug, name, title, layer, specialty, primarySkill, methodology, aiModel, avatarUrl, createdAt, updatedAt)
     VALUES (?, ?, ?, 'strategy', ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      slugify(spec.name),
      spec.name,
      spec.title,
      spec.specialty,
      spec.primarySkill,
      spec.methodology,
      spec.aiModel ?? "claude-sonnet-4-6",
      spec.avatarUrl ?? null,
    ],
  ) as any[];
  const id = (result as any).insertId;
  console.log(`  ✓ created agent: ${spec.name} (id=${id})`);
  return id;
}

async function ensureLeadAgents() {
  console.log("\n[3/6] Ensure Lead agents");

  const maryId = await findOrCreateAgent({
    name: "Mary Allen",
    title: "Brand Archetype Lead",
    specialty: "Brand archetype positioning with Pearson 12 framework",
    primarySkill: "archetype-positioning",
    methodology:
`You are Mary Allen, founder of signalandstory.co and a Pearson 12 Archetype specialist.
You combine rigorous positioning work with unflinching challenge — you never let clients settle for sameness-trap language.

Your operating rules:
- Every claim must be grounded in evidence (crawled website text, cited competitor material, documented methodology).
- Call out weak positioning bluntly but constructively.
- Always move the conversation toward boardroom-quality deliverables — crisp, actionable, defensible.
- When you use tools, narrate what you're doing and why so the user trusts the process.`,
  });

  const deissId = await findOrCreateAgent({
    name: "Ryan Voss",
    title: "Facebook CVO Lead",
    specialty: "Customer Value Optimization for Facebook ads & funnels",
    primarySkill: "cvo-strategy",
    methodology:
`You are Ryan Voss, a Customer Value Optimization strategist trained in Ryan Deiss's CVO framework and Alex Hormozi's offer mechanics.
You think in terms of traffic temperature (cold / warm / hot), value ladders (lead magnet → tripwire → core → profit maximizer → return path), and ruthless KPI accountability.

Operating rules:
- Always diagnose the whole funnel, never just tactics.
- Every creative direction must tie back to a measurable KPI.
- Call out sameness in ad creative — if every competitor runs the same hook, so will you unless we pivot.
- Boardroom deliverables must include KPI dashboards with targets.`,
  });

  const hormoziId = await findOrCreateAgent({
    name: "Zane Moreno",
    title: "Grand Slam Offer Lead",
    specialty: "Offer creation using Hormozi $100M Offers framework",
    primarySkill: "offer-forge",
    methodology:
`You are Zane Moreno, an offer strategist trained in Alex Hormozi's Value Equation.
You obsess over four levers: Dream Outcome (↑), Perceived Likelihood (↑), Time Delay (↓), Effort & Sacrifice (↓).
You believe a Grand Slam Offer is when total value presented is 10× the price.

Operating rules:
- No Dream Outcome is too ambitious, but it must be visualizable (time + place + number + feeling).
- Every guarantee must be risk-assessed — never promise what breaks the business.
- Value Stack tables are non-negotiable — show the numbers.
- Scarcity must be real. Never manufacture fake urgency.`,
  });

  return { maryId, deissId, hormoziId };
}

// ── Step 4: Seed 3 Lead-solo squads ─────────────────────────────────────────
interface Step {
  order: number;
  title: string;
  description: string;
  skill: string;
  requiredTools: string[];
  outputType: string;
}

interface SquadSpec {
  slug: string;
  name: string;
  missionType: string;
  workspace: string;
  methodology: string;
  leadAgentId: number;
  steps: Step[];
}

async function upsertSquad(spec: SquadSpec) {
  const [found] = await localPool.execute(
    `SELECT id FROM squads WHERE slug = ? LIMIT 1`, [spec.slug]
  ) as any[];
  const stepsJson = JSON.stringify(spec.steps);
  const agentsJson = JSON.stringify([
    { agent_id: spec.leadAgentId, role: spec.name.split(" ")[0] + " Lead", is_lead: 1, order: 1 },
  ]);

  if ((found as any[])[0]?.id) {
    const id = (found as any[])[0].id;
    await localPool.execute(
      `UPDATE squads SET name = ?, methodology = ?, lead_agent_id = ?, architecture = 'lead_solo',
         steps = ?, agents = ?, missionType = ?, workspace = ?, is_active = 1, updatedAt = NOW()
       WHERE id = ?`,
      [spec.name, spec.methodology, spec.leadAgentId, stepsJson, agentsJson,
       spec.missionType, spec.workspace, id],
    );
    console.log(`  ↷ upsert squad: ${spec.slug} (id=${id})`);
    return id;
  }
  const [result] = await localPool.execute(
    `INSERT INTO squads (slug, name, methodology, lead_agent_id, architecture,
        steps, agents, missionType, workspace, is_active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'lead_solo', ?, ?, ?, ?, 1, NOW(), NOW())`,
    [spec.slug, spec.name, spec.methodology, spec.leadAgentId, stepsJson, agentsJson,
     spec.missionType, spec.workspace],
  ) as any[];
  const id = (result as any).insertId;
  console.log(`  ✓ new squad: ${spec.slug} (id=${id})`);
  return id;
}

async function seedSquads(ids: { maryId: number; deissId: number; hormoziId: number }) {
  console.log("\n[4/6] Seed 3 Lead-solo squads");

  // Squad 1: Brand Archetype Positioning (Mary Allen)
  await upsertSquad({
    slug: "brand-archetype-positioning",
    name: "品牌原型定位小組",
    missionType: "strategy",
    workspace: "strategy",
    methodology: "Carol Pearson & Margaret Mark — 12 Archetype Framework (The Hero and the Outlaw)",
    leadAgentId: ids.maryId,
    steps: [
      {
        order: 1,
        title: "原型選擇",
        description: "根據品牌證據挑主 + 次原型",
        skill: "archetype-selection",
        requiredTools: ["web_fetch", "web_search", "site_crawl"],
        outputType: "archetype-decision-brief",
      },
      {
        order: 2,
        title: "原型表達",
        description: "把原型翻譯成語言、視覺、行為規範",
        skill: "archetype-expression",
        requiredTools: [],
        outputType: "expression-guide",
      },
      {
        order: 3,
        title: "同質化稽核",
        description: "對照競品找紅燈詞與差異化機會",
        skill: "sameness-audit",
        requiredTools: ["web_search", "site_crawl"],
        outputType: "sameness-matrix",
      },
      {
        order: 4,
        title: "董事會交付",
        description: "輸出 boardroom-grade PDF",
        skill: "boardroom-deliverable",
        requiredTools: ["citation_bundler", "boardroom_pdf"],
        outputType: "boardroom-pdf",
      },
    ],
  });

  // Squad 2: Facebook Deiss CVO (Ryan Voss)
  await upsertSquad({
    slug: "facebook-deiss-cvo",
    name: "Facebook CVO 小組",
    missionType: "social",
    workspace: "social",
    methodology: "Ryan Deiss — Customer Value Optimization (traffic temperature × value ladder)",
    leadAgentId: ids.deissId,
    steps: [
      {
        order: 1,
        title: "FB 流量稽核",
        description: "盤點冷/溫/熱流量結構",
        skill: "fb-traffic-audit",
        requiredTools: ["web_fetch", "web_search", "site_crawl"],
        outputType: "traffic-audit",
      },
      {
        order: 2,
        title: "Value Ladder 設計",
        description: "設計 5 階 offer 梯子",
        skill: "fb-offer-ladder",
        requiredTools: [],
        outputType: "ladder-blueprint",
      },
      {
        order: 3,
        title: "廣告創意方向",
        description: "為每階設計廣告 hook/agitate/solve 方向",
        skill: "fb-ad-creative",
        requiredTools: [],
        outputType: "creative-directions",
      },
      {
        order: 4,
        title: "指標儀表 + 董事會交付",
        description: "設計 KPI + 輸出 PDF",
        skill: "fb-metrics-dashboard",
        requiredTools: ["citation_bundler", "boardroom_pdf"],
        outputType: "boardroom-pdf",
      },
    ],
  });

  // Squad 3: Hormozi Offer Forge (Zane Moreno)
  await upsertSquad({
    slug: "hormozi-offer-forge",
    name: "Grand Slam Offer 小組",
    missionType: "campaign",
    workspace: "campaign",
    methodology: "Alex Hormozi — $100M Offers Value Equation Framework",
    leadAgentId: ids.hormoziId,
    steps: [
      {
        order: 1,
        title: "Dream Outcome 鎖定",
        description: "從模糊到尖銳的終極成果陳述",
        skill: "hormozi-dream-outcome",
        requiredTools: ["web_fetch", "web_search", "site_crawl"],
        outputType: "dream-outcome-brief",
      },
      {
        order: 2,
        title: "Value Equation 四象限",
        description: "拉高分子、壓低分母",
        skill: "hormozi-value-equation",
        requiredTools: ["web_search"],
        outputType: "value-equation-map",
      },
      {
        order: 3,
        title: "Guarantee Stack",
        description: "設計疊層保證與風險控管",
        skill: "hormozi-guarantee-stack",
        requiredTools: ["web_search"],
        outputType: "guarantee-design",
      },
      {
        order: 4,
        title: "Grand Slam Offer + 董事會交付",
        description: "Value Stack 表 + 命名 + PDF",
        skill: "hormozi-offer-presentation",
        requiredTools: ["citation_bundler", "boardroom_pdf"],
        outputType: "boardroom-pdf",
      },
    ],
  });
}

// ── Step 5: Brand 復華投信 ──────────────────────────────────────────────────
async function ensureBrand(): Promise<number> {
  console.log("\n[5/6] Upsert 復華投信 brand");
  const [found] = await localPool.execute(
    `SELECT id FROM brands WHERE name = ? LIMIT 1`, ["復華投信"]
  ) as any[];
  if ((found as any[])[0]?.id) {
    const id = (found as any[])[0].id;
    await localPool.execute(
      `UPDATE brands SET website = ?, industry = ?, description = ? WHERE id = ?`,
      ["https://www.fhtrust.com.tw/", "投信 / 資產管理",
       "復華投信為台灣老牌投信業者，提供基金、ETF、退休理財等資產管理服務。", id],
    );
    console.log(`  ↷ brand exists: 復華投信 (id=${id})`);
    return id;
  }
  const [result] = await localPool.execute(
    `INSERT INTO brands (name, slug, website, industry, description, createdBy, userId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    ["復華投信", "fuh-hwa-investment-trust", "https://www.fhtrust.com.tw/", "投信 / 資產管理",
     "復華投信為台灣老牌投信業者，提供基金、ETF、退休理財等資產管理服務。",
     DEMO_USER_ID, DEMO_USER_ID],
  ) as any[];
  const id = (result as any).insertId;
  console.log(`  ✓ new brand: 復華投信 (id=${id})`);
  return id;
}

// ── Step 6: Missions ────────────────────────────────────────────────────────
async function ensureMission(brandId: number, title: string, squadSlug: string, workspace: string) {
  const [found] = await localPool.execute(
    `SELECT id FROM missions WHERE brandId = ? AND title = ? LIMIT 1`,
    [brandId, title],
  ) as any[];
  if ((found as any[])[0]?.id) {
    const id = (found as any[])[0].id;
    await localPool.execute(
      `UPDATE missions SET squadSlug = ?, workspace = ?, updatedAt = NOW() WHERE id = ?`,
      [squadSlug, workspace, id],
    );
    console.log(`  ↷ mission exists: ${title} (id=${id})`);
    return id;
  }
  const [result] = await localPool.execute(
    `INSERT INTO missions (userId, brandId, title, squadSlug, workspace, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
    [DEMO_USER_ID, brandId, title, squadSlug, workspace],
  ) as any[];
  const id = (result as any).insertId;
  console.log(`  ✓ new mission: ${title} (id=${id})`);
  return id;
}

async function seedMissions(brandId: number) {
  console.log("\n[6/6] Seed 3 missions for 復華投信");
  await ensureMission(brandId, "復華投信品牌原型定位", "brand-archetype-positioning", "strategy");
  await ensureMission(brandId, "復華投信 Facebook CVO 策略", "facebook-deiss-cvo", "social");
  await ensureMission(brandId, "復華投信 Grand Slam Offer 設計", "hormozi-offer-forge", "campaign");
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Lead-solo demo seeder — 2026-04-22 ===");
  await migrate();
  await archiveOld();
  const ids = await ensureLeadAgents();
  await seedSquads(ids);
  const brandId = await ensureBrand();
  await seedMissions(brandId);
  console.log("\n✅ Done. Verify with:");
  console.log("   SELECT slug, lead_agent_id, architecture, is_active FROM squads WHERE is_active = 1;");
  console.log("   SELECT id, name, website FROM brands WHERE name = '復華投信';");
  console.log("   SELECT id, title, squadSlug FROM missions WHERE brandId = <復華投信 id>;");
  process.exit(0);
}

main().catch(err => {
  console.error("[seed] fatal:", err);
  process.exit(1);
});
