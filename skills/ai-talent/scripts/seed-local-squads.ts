/**
 * seed-local-squads.ts
 * Inserts custom squads + workflow templates into mos_db (local MySQL on VM).
 * Runs idempotently ??safe to re-run.
 *
 * Usage:  npm run db:seed-local
 */
import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

// ?????????????????????????????????????????????????????????????????????????????
// Helpers
// ?????????????????????????????????????????????????????????????????????????????

/**
 * Find the first available agent whose primarySkill or specialty matches any of
 * the given keywords (case-insensitive LIKE). Excludes already-used agent IDs.
 * Returns null if no match.
 */
async function findAgent(
  conn: any,
  keywords: string[],
  excludeIds: number[] = [],
): Promise<number | null> {
  if (!keywords.length) return null;
  const safe = (s: string) => s.replace(/'/g, "\\'").replace(/%/g, "\\%");
  const likeParts = keywords
    .map(k => `(primarySkill LIKE '%${safe(k)}%' OR specialty LIKE '%${safe(k)}%' OR title LIKE '%${safe(k)}%')`)
    .join(" OR ");
  const excludePart = excludeIds.length > 0
    ? `AND id NOT IN (${excludeIds.join(",")})` : "";
  const [rows] = await conn.execute(
    `SELECT id FROM agents WHERE isAvailable = 1 AND (${likeParts}) ${excludePart} ORDER BY id ASC LIMIT 1`
  ) as any[];
  return (rows as any[])[0]?.id ?? null;
}

/**
 * After finding an agent for a specific squad role, write the required skills
 * back to their specialty field ??only appending skills they don't already have.
 *
 * This gradually refines the 17K+ agent pool's skill metadata through seeding,
 * making agents more precisely discoverable for future searches.
 * Does NOT touch soul.md or any identity field ??only the skills/specialty tag.
 */
async function assignSkillsToAgent(
  conn: any,
  agentId: number,
  skills: string[],
): Promise<void> {
  if (!agentId || !skills.length) return;
  try {
    const [rows] = await conn.execute(
      `SELECT primarySkill, specialty FROM agents WHERE id = ? LIMIT 1`, [agentId]
    ) as any[];
    const row = (rows as any[])[0];
    if (!row) return;

    // Build current skill set (primarySkill + specialty, split by common delimiters)
    const existing = new Set(
      [row.primarySkill ?? "", row.specialty ?? ""]
        .join(",")
        .split(/[,|;\n]/)
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean)
    );

    const toAdd = skills.filter(s => !existing.has(s.toLowerCase()));
    if (toAdd.length === 0) return;

    // Append new skills to specialty (non-destructive)
    const newSpecialty = [row.specialty ?? "", ...toAdd].filter(Boolean).join(", ");
    await conn.execute(
      `UPDATE agents SET specialty = ? WHERE id = ?`, [newSpecialty, agentId]
    );
    console.log(`[seed-local] Agent ${agentId}: added skills [${toAdd.join(", ")}]`);
  } catch (err: any) {
    // Non-fatal ??skill assignment is best-effort
    console.warn(`[seed-local] assignSkillsToAgent(${agentId}) warn:`, err.message);
  }
}

/**
 * Fetch id, slug, and name for a known agent ID.
 * Returns null if not found.
 */
async function getAgentInfo(
  conn: any,
  id: number | null,
): Promise<{ id: number; slug: string; name: string } | null> {
  if (!id) return null;
  try {
    const [rows] = await conn.execute(
      `SELECT id, slug, name FROM agents WHERE id = ? LIMIT 1`, [id]
    ) as any[];
    return (rows as any[])[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Attach assignedAgentId / assignedAgentSlug / assignedAgentName to a step object.
 * agentInfo may be null ??in that case the step stays unassigned (worker falls back to lead).
 */
function assignAgentToStep(
  step: Record<string, any>,
  agentInfo: { id: number; slug: string; name: string } | null,
): Record<string, any> {
  return {
    ...step,
    assignedAgentId:   agentInfo?.id   ?? null,
    assignedAgentSlug: agentInfo?.slug  ?? null,
    assignedAgentName: agentInfo?.name  ?? null,
  };
}

/**
 * Idempotent upsert: insert a squad or update its name/description/agents/tags
 * if the slug already exists.
 */
async function upsertSquad(conn: any, s: {
  slug: string; name: string; description: string;
  industryKey: string; missionType: string;
  workspace: string[];
  methodology: string;
  agents: object[]; tags: string[]; useCases: string[];
  outputFormats: string[];
  requiredIntegrations: string[];
  token: number;
  showcases: { company: string; description: string; result: string; source?: string }[];
}) {
  const [existing] = await conn.execute(
    `SELECT id FROM agent_squads WHERE slug = ? LIMIT 1`, [s.slug]
  ) as any[];
  if ((existing as any[]).length > 0) {
    await conn.execute(
      `UPDATE agent_squads SET name=?, description=?, missionType=?, agents=?, tags=?, use_cases=?,
       workspace=?, methodology=?, output_formats=?, required_integrations=?, token=?, showcases=?,
       is_active=1, updated_at=NOW() WHERE slug=?`,
      [s.name, s.description, s.missionType, JSON.stringify(s.agents), JSON.stringify(s.tags),
       JSON.stringify(s.useCases), JSON.stringify(s.workspace), s.methodology,
       JSON.stringify(s.outputFormats), JSON.stringify(s.requiredIntegrations), s.token,
       JSON.stringify(s.showcases), s.slug]
    );
    console.log(`[seed-local] Squad '${s.slug}': updated`);
  } else {
    await conn.execute(
      `INSERT INTO agent_squads (slug,name,description,industry_key,missionType,agents,tags,use_cases,
       workspace,methodology,output_formats,required_integrations,token,showcases,is_active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
      [s.slug, s.name, s.description, s.industryKey, s.missionType,
       JSON.stringify(s.agents), JSON.stringify(s.tags), JSON.stringify(s.useCases),
       JSON.stringify(s.workspace), s.methodology, JSON.stringify(s.outputFormats),
       JSON.stringify(s.requiredIntegrations), s.token, JSON.stringify(s.showcases)]
    );
    const [newRow] = await conn.execute(
      `SELECT id FROM agent_squads WHERE slug = ? LIMIT 1`, [s.slug]
    ) as any[];
    console.log(`[seed-local] Squad '${s.slug}' inserted with id=${(newRow as any[])[0]?.id}`);
  }
}

/**
 * Idempotent upsert for workflow templates.
 */
async function upsertWorkflow(conn: any, w: {
  missionType: string; name: string; description: string; steps: object[];
}) {
  const [existing] = await conn.execute(
    `SELECT id FROM squad_workflow_templates WHERE taskType = ? LIMIT 1`, [w.missionType]
  ) as any[];
  if ((existing as any[]).length > 0) {
    await conn.execute(
      `UPDATE squad_workflow_templates SET name=?, description=?, steps=?, missionType=?, updatedAt=NOW() WHERE taskType=?`,
      [w.name, w.description, JSON.stringify(w.steps), w.missionType, w.missionType]
    );
    console.log(`[seed-local] Workflow '${w.missionType}': updated`);
  } else {
    await conn.execute(
      `INSERT INTO squad_workflow_templates (taskType,missionType,name,description,steps,isActive,createdAt) VALUES (?,?,?,?,?,1,NOW())`,
      [w.missionType, w.missionType, w.name, w.description, JSON.stringify(w.steps)]
    );
    console.log(`[seed-local] Workflow '${w.missionType}': inserted`);
  }
}

async function main() {
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || "localhost",
    port:     parseInt(process.env.LOCAL_DB_PORT || "3306"),
    user:     process.env.LOCAL_DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     || "mos_db",
    charset:  "utf8mb4",
    multipleStatements: false,
  });

  const conn = await pool.getConnection();
  try {
    console.log("[seed-local] Connected to mos_db. Running squad seeds??);

    // ?? 0. Ensure tables exist (idempotent) ??????????????????????????????????????
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS squad_workflow_templates (
        id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        taskType    VARCHAR(100) NOT NULL UNIQUE,
        name        VARCHAR(255) NOT NULL,
        description TEXT,
        steps       LONGTEXT,
        isActive    TINYINT(1)   NOT NULL DEFAULT 1,
        createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[seed-local] squad_workflow_templates: ready");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS agent_squads (
        id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        slug         VARCHAR(120) NOT NULL UNIQUE,
        name         VARCHAR(255) NOT NULL,
        description  TEXT,
        industry_key VARCHAR(80),
        taskType     VARCHAR(100),
        members      LONGTEXT,
        tags         LONGTEXT,
        use_cases    LONGTEXT,
        is_active    TINYINT(1)   NOT NULL DEFAULT 1,
        created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[seed-local] agent_squads: ready");

    // ?? Schema migrations (idempotent, wrapped in try/catch) ?????????????????????
    console.log("[seed-local] Running schema migrations??);
    const migrations = [
      // Rename members ??agents
      `ALTER TABLE agent_squads CHANGE COLUMN members agents LONGTEXT NULL`,
      // Rename taskType ??missionType in agent_squads
      `ALTER TABLE agent_squads CHANGE COLUMN taskType missionType VARCHAR(100) NULL`,
      // Add new columns to agent_squads
      `ALTER TABLE agent_squads ADD COLUMN workspace             LONGTEXT NULL`,
      `ALTER TABLE agent_squads ADD COLUMN methodology           VARCHAR(100) NULL`,
      `ALTER TABLE agent_squads ADD COLUMN output_formats        LONGTEXT NULL`,
      `ALTER TABLE agent_squads ADD COLUMN required_integrations LONGTEXT NULL`,
      `ALTER TABLE agent_squads ADD COLUMN token                 INT NOT NULL DEFAULT 0`,
      `ALTER TABLE agent_squads ADD COLUMN showcases             LONGTEXT NULL`,
      // Add missionType to workflow templates (mirror of taskType)
      `ALTER TABLE squad_workflow_templates ADD COLUMN missionType VARCHAR(100) NULL`,
      `UPDATE squad_workflow_templates SET missionType = taskType WHERE missionType IS NULL`,
    ];
    for (const m of migrations) {
      try { await conn.execute(m); } catch (_) { /* already applied */ }
    }
    console.log("[seed-local] Schema migrations: done");

    // ?? 1. SoWork??摰? workflow template ??????????????????????????????????????
    const TASK_TYPE = "sowork-brand-positioning";

    const steps = [
      {
        step: 1,
        title: "瘛勗惜????嚗? Whys嚗?,
        description: "??鈭???隞暻潦?????摮??撖血?璈??詨??孵潸?",
        owner: "squad_lead",
        output: "??瘛勗惜??皜",
        prompts: [
          "隢?餈唬??????靘?暻潭????Ｗ?嚗?,
          "?箔?暻澆恥?園?閬???銝?嚗隞暻潮辣鈭?隞?閬?",
          "雿????箔?暻潮???辣鈭????臬隞?嚗?,
        ],
      },
      {
        step: 2,
        title: "???孵澆?蝝???,
        description: "璇喟????典??賬???”???惜甈∩??賜憿批恥?????,
        owner: "consumer_researcher",
        output: "???孵潮?摮?",
        prompts: [
          "??Ｗ?/???蜓閬??賣批???撠?5 ??",
          "???撣嗥策憿批恥隞暻潭?????",
          "雿輻雿???嚗“摰Ｗ?雿?隞犖銵券??芣?嚗?,
        ],
      },
      {
        step: 3,
        title: "蝡嗥??摰儔",
        description: "蝣箄????迤?奎?剖???湔蝡嗥???亦奎?剛隞?獢?,
        owner: "competitor_analyst",
        output: "蝡嗥????,
        prompts: [
          "? 3-5 ???湔?奎?剖???,
          "憿批恥?冽?????瘜?嚗??豢?隞暻潭隞?獢?",
          "雿?芯?蝬剖漲銝?蝡嗅??銝?嚗?,
        ],
      },
      {
        step: 4,
        title: "蝡嗅?閰??拚",
        description: "????貉頃??嚗??芾澈?奎?脰???閰?嚗?-5 ??嚗?箏榆?啣?蝛粹?",
        owner: "competitor_analyst",
        output: "蝡嗅?瘥??拚銵剁?Excel/?航???",
        prompts: [
          "?憿批恥?豢?????5-8 ???萄?蝝?,
          "?箸??????怨頨恬??典???銝???1-5",
          "?芯????臭??撥???芯??舀?憿臬摹??",
        ],
      },
      {
        step: 5,
        title: "?格??嚗A嚗?蝢?,
        description: "撱箇?皜?璅恥蝢斤??鈭箏蝯梯????鞈芥??箇????暺?,
        owner: "consumer_researcher",
        output: "TA Persona ?∠?嚗?-3 ??Persona嚗?,
        prompts: [
          "雿??詨?摰Ｘ?航狐嚗?撟湧翩/?瑟平/?嗅/?啣?嚗?,
          "隞?隞暻澆???暑?孵???潸?嚗?,
          "隞撠閫?捱?寞????憭抒??急???暺隞暻潘?",
        ],
      },
      {
        step: 6,
        title: "?格???弦",
        description: "瘛勗?弦 TA ??閮?撘?鞎餅捱蝑?蝔????亥孛暺?,
        owner: "consumer_insights",
        output: "TA 瘨祥??撖??,
        prompts: [
          "TA ?典鈭像??蝞⊿??脣?鞈?嚗?,
          "隞?鞈潸眺瘙箇?????芯?甇仿?嚗?,
          "隞縑隞餃憿?????隞??鈭綽?",
        ],
      },
      {
        step: 7,
        title: "?格??閰???",
        description: "閰摯??TA ???撣閬芋?閫詨??扼?拇????詨銝餅 TA",
        owner: "consumer_insights",
        output: "TA ?芸????拚",
        prompts: [
          "隡啁???TA ???閬芋???瑟?,
          "雿??摰寞????芸?TA嚗??祆?雿??航狐嚗?,
          "?芸?TA ??頨怠?潘?LTV嚗?擃?",
        ],
      },
      {
        step: 8,
        title: "??摰??拚",
        description: "撱箇?鈭雁摰????詨??拙敹奎?剛遘嚗??箄頨怨?蝡嗅?雿蔭嚗?啁征?賢?雿征??,
        owner: "squad_lead",
        output: "??摰???2?2 ?拚嚗?,
        prompts: [
          "敺郊撽?4 蝡嗅??拚銝哨??詨?????2 ?奎?剔雁摨?,
          "?券?雁摨虫?嚗????撠?蝵桀?雿?",
          "?芸情??蝛箇??銝泵??TA ?瘙?",
        ],
      },
      {
        step: 9,
        title: "??璅??",
        description: "?箸摰??拚?敹榆?啣?嚗撅?3-5 ???璅?嚗蒂?? TA 閬?蝭拚",
        owner: "brand_copywriter",
        output: "???璅?皜 + 閰撱箄降",
        prompts: [
          "?其??亥店?膩雿????輯姥蝯行敹?TA ??憭批??,
          "?閰望?行?璆?榆?啣?嚗A ???梢陷??",
          "?澆? 3 ????瘞??????/??改?????,
        ],
      },
      {
        step: 10,
        title: "???批???,
        description: "摰儔???犖?潛鞈芥???瘞??閬粹◢?潭??撱箇????扳",
        owner: "brand_dna_specialist",
        output: "???扯牧? + 隤除??",
        prompts: [
          "憒?雿????臭??犖嚗???暻澆抒鞈迎?嚗???5 ?耦摰寡?嚗?,
          "隞牧閰梁?隤除?臭?暻潘?嚗?靘?閬芸? vs 撠平 vs 撟賡?嚗?,
          "?芯?????閬粹◢?潸?雿??喟????餈??箔?暻潘?",
        ],
      },
      {
        step: 11,
        title: "??摰??豢?撓??,
        description: "?游???10 甇亦???嚗?箏??渡???摰??賂?Brand Positioning Document嚗?,
        owner: "squad_lead",
        output: "??摰??賂?PDF/Slides嚗?,
        sections: [
          "??摮???蝙??,
          "?詨??孵潔蜓撘?,
          "?格?? Persona",
          "蝡嗥摰???,
          "??璅?嚗?衣? + ???",
          "???扯?皞???,
          "銝?甇亥??遣霅?,
        ],
      },
    ];

    // Check if template already exists
    const [existingTpl] = await conn.execute(
      `SELECT id FROM squad_workflow_templates WHERE taskType = ? LIMIT 1`,
      [TASK_TYPE]
    ) as any[];

    if ((existingTpl as any[]).length > 0) {
      console.log(`[seed-local] Workflow template '${TASK_TYPE}' already exists ??updating steps.`);
      await conn.execute(
        `UPDATE squad_workflow_templates SET steps = ?, missionType = ?, updatedAt = NOW() WHERE taskType = ?`,
        [JSON.stringify(steps), TASK_TYPE, TASK_TYPE]
      );
    } else {
      await conn.execute(
        `INSERT INTO squad_workflow_templates (taskType, missionType, name, description, steps, isActive, createdAt)
         VALUES (?, ?, ?, ?, ?, 1, NOW())`,
        [
          TASK_TYPE,
          TASK_TYPE,
          "SoWork ??摰? 11 甇亙?????,
          "敺楛撅文?璈???抒?摰??摰???瘚?嚗?蝯撓?箏???雿",
          JSON.stringify(steps),
        ]
      );
      console.log(`[seed-local] Workflow template '${TASK_TYPE}' inserted.`);
    }

    // ?? 2. SoWork??摰? squad ?????????????????????????????????????????????????
    // Agent IDs sourced from mos_db on the VM (confirmed in previous session):
    //   60071  璆黎摰?  ??閬死???游?     primarySkill=cmo         ??Squad Lead
    //   180183 ?函???  瘨祥???瑞蜇??      primarySkill=customer-research
    //   180376 ?剝???  撣?弦??撣?      primarySkill=competitor-analysis
    //   238624 璆蝧?  瘨祥??撖?蝛嗅?蝯??亙葦 primarySkill=consumer-insights
    //   210016 ??蝧?  AI 蝬脩???蝑撣?   primarySkill=brand-dna
    //   222934 ????  蝡嗅????撣?      primarySkill=brand-dna

    const members = [
      { agent_id: 60071,  is_lead: true,  role: "squad_lead",          order: 1 },
      { agent_id: 180183, is_lead: false, role: "consumer_researcher",  order: 2 },
      { agent_id: 180376, is_lead: false, role: "competitor_analyst",   order: 3 },
      { agent_id: 238624, is_lead: false, role: "consumer_insights",    order: 4 },
      { agent_id: 210016, is_lead: false, role: "brand_dna_specialist", order: 5 },
      { agent_id: 222934, is_lead: false, role: "brand_copywriter",     order: 6 },
    ];

    const tags = JSON.stringify(["brand", "positioning", "strategy", "brand-dna", "consumer-insights", "competitor-analysis", "b2b", "full-funnel"]);
    const useCases = JSON.stringify([
      "?啣??遣蝡?雿?,
      "?????啣?雿?,
      "?脣?啣??游???????,
      "??閮銝??湧?閬??,
      "?單?啣榆?啣?蝡嗥蝛粹?",
      "?啣神??摰???,
    ]);

    const [existingSquad] = await conn.execute(
      `SELECT id FROM agent_squads WHERE slug = 'sowork-brand-positioning' LIMIT 1`
    ) as any[];

    if ((existingSquad as any[]).length > 0) {
      const existingId = (existingSquad as any[])[0].id;
      console.log(`[seed-local] Squad 'sowork-brand-positioning' (id=${existingId}) already exists ??updating.`);
      await conn.execute(
        `UPDATE agent_squads
         SET name = ?, description = ?, missionType = ?, agents = ?, tags = ?, use_cases = ?,
         workspace = ?, methodology = ?, output_formats = ?, required_integrations = ?, token = ?, showcases = ?,
         is_active = 1, updated_at = NOW()
         WHERE slug = 'sowork-brand-positioning'`,
        [
          "SoWork??摰?",
          "摰 11 甇亙???雿????塚?敺楛撅文?璈?????批遣蝡??蝯撓?箏?瑁?????雿????撱箇?????摰????閬??啁奎?剖榆?啣???璆准?,
          TASK_TYPE,
          JSON.stringify(members),
          tags,
          useCases,
          JSON.stringify(["brand-positioning"]),
          "sowork-brand-positioning",
          JSON.stringify(["PDF 蝑?勗?", "Google Slides 蝪∪", "YouTube 敶梁??單"]),
          JSON.stringify(["google-analytics", "facebook-ads"]),
          80000,
          JSON.stringify([{ company: "SoWork", description: "?游???摰?鈭郊瘜?? B2B SaaS 隡平??6 ?勗摰?摰??摰?頧?", result: "??隤摨行???40%嚗?桅望?蝮桃 25%", source: "SoWork ?折獢?" }]),
        ]
      );
    } else {
      await conn.execute(
        `INSERT INTO agent_squads
           (slug, name, description, industry_key, missionType, agents, tags, use_cases,
            workspace, methodology, output_formats, required_integrations, token, showcases,
            is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [
          "sowork-brand-positioning",
          "SoWork??摰?",
          "摰 11 甇亙???雿????塚?敺楛撅文?璈?????批遣蝡??蝯撓?箏?瑁?????雿????撱箇?????摰????閬??啁奎?剖榆?啣???璆准?,
          "general",
          TASK_TYPE,
          JSON.stringify(members),
          tags,
          useCases,
          JSON.stringify(["brand-positioning"]),
          "sowork-brand-positioning",
          JSON.stringify(["PDF 蝑?勗?", "Google Slides 蝪∪", "YouTube 敶梁??單"]),
          JSON.stringify(["google-analytics", "facebook-ads"]),
          80000,
          JSON.stringify([{ company: "SoWork", description: "?游???摰?鈭郊瘜?? B2B SaaS 隡平??6 ?勗摰?摰??摰?頧?", result: "??隤摨行???40%嚗?桅望?蝮桃 25%", source: "SoWork ?折獢?" }]),
        ]
      );

      const [newSquad] = await conn.execute(
        `SELECT id FROM agent_squads WHERE slug = 'sowork-brand-positioning' LIMIT 1`
      ) as any[];
      console.log(`[seed-local] Squad 'sowork-brand-positioning' inserted with id=${(newSquad as any[])[0]?.id}`);
    }

    // ?? 3. Universal workflow templates (15 common marketing taskTypes) ??????????
    // Pattern: Squad Lead Intake ??Specialist Agents ??Squad Lead QA ??Delivery
    // Each step: { step, title, description, owner, output, duration_hint }

    const UNIVERSAL_WORKFLOWS: Array<{
      taskType: string;
      name: string;
      description: string;
      steps: object[];
    }> = [
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "brand",
        name: "??撱箇?摰瘚?",
        description: "敺????臬?賢?瑁????游??遣蝡極雿?",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗??玨憿暺?, description: "Squad Lead ??瞉????暹??璅??渲??詨??嚗Ⅱ隤遙???? brief ?", owner: "squad_lead", output: "隞餃?蝪∪嚗rief嚗?, duration_hint: "15 ??" },
          { step: 2, title: "?? DNA ??", description: "????雿踹???胯敹?潘?蝣箇?撌桃?蜓撘?, owner: "brand_dna_specialist", output: "?? DNA ?辣", duration_hint: "20 ??" },
          { step: 3, title: "?格???弦", description: "撱箇? 2-3 ?移皞?Persona嚗???鞎餉?璈?瘙箇?頝臬?", owner: "consumer_researcher", output: "TA Persona ?∠?", duration_hint: "20 ??" },
          { step: 4, title: "蝡嗅?摰???", description: "蝜芾ˊ蝡嗅??啣?嚗?箸鋡思???撌桃??雿征??, owner: "competitor_analyst", output: "蝡嗅?摰???, duration_hint: "20 ??" },
          { step: 5, title: "??閮?嗆?", description: "撱箇????詨?閮??隤??隤踵???, owner: "brand_copywriter", output: "??閮?嗆?銵?, duration_hint: "20 ??" },
          { step: 6, title: "Squad Lead QA ?游?", description: "Squad Lead 撖拇?郊撽????湔改?鋆?銝雲嚗圾瘙箄?蝒?, owner: "squad_lead", output: "QA 撖拇??", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗?????蝔?, description: "?游?????∟撓?綽??Ｗ摰????靘恥?嗅祟??, owner: "squad_lead", output: "????嚗rand Book嚗?, duration_hint: "15 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "brand-launch",
        name: "??銝?蝑",
        description: "?啣????啁??撣?摰蝑閬??銵???,
        steps: [
          { step: 1, title: "Squad Lead Intake嚗?撣璅Ⅱ隤?, description: "??銝?????蝞璅??渲?????嚗??? Agent 隞餃?", owner: "squad_lead", output: "銝? Brief", duration_hint: "15 ??" },
          { step: 2, title: "撣璈???", description: "??撣閬芋???交?璈璅?蝢斤?????", owner: "market_researcher", output: "撣璈??勗?", duration_hint: "25 ??" },
          { step: 3, title: "蝡嗅?銝?獢??弦", description: "?弦蝡嗅?銝?蝑??擃??怒??寡???", owner: "competitor_analyst", output: "蝡嗅?獢???", duration_hint: "20 ??" },
          { step: 4, title: "銝?閮蝑", description: "?嗅??詨?閮??????閮霈??撣?憟?, owner: "brand_copywriter", output: "閮蝑?辣", duration_hint: "20 ??" },
          { step: 5, title: "?楝??擃???, description: "閬?隞祥??嗚蝣???瘥?閮剖?????KPI", owner: "channel_strategist", output: "慦?閮??, duration_hint: "20 ??" },
          { step: 6, title: "Squad Lead QA + 憸券閰摯", description: "撖拇?湧?銝?閮??頛舀改?霅?瑁?憸券??獢?, owner: "squad_lead", output: "憸券????, duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗?撣??急", description: "?游????港?撣??急嚗????瑁? Checklist", owner: "squad_lead", output: "??銝?閮??, duration_hint: "15 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "content-strategy",
        name: "?批捆蝑閬?",
        description: "?箏??摰頂蝯勗??摰寧??亥??瑁?閮",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗摰寧璅Ⅱ隤?, description: "蝣箄????脤??格??蜓閬??摰寥?蝞??Ｗ?餌?嚗rief ?", owner: "squad_lead", output: "?批捆蝑 Brief", duration_hint: "15 ??" },
          { step: 2, title: "??批捆?末?弦", description: "?? TA ?典?撟喳?摰寞?鞎餌????憟賣撘?鈭?璅∪?", owner: "consumer_researcher", output: "?瘣??勗?", duration_hint: "20 ??" },
          { step: 3, title: "蝡嗅??批捆??", description: "?圾蝡嗅??批捆蝑??甈曇?敺店憿??亥?摨?, owner: "competitor_analyst", output: "蝡嗅??批捆?勗?", duration_hint: "20 ??" },
          { step: 4, title: "?批捆?舀閮剛?", description: "撱箇? 3-5 ???摰寞?梧?瘥?梁?銝駁??撘PI", owner: "content_strategist", output: "?批捆?舀獢", duration_hint: "20 ??" },
          { step: 5, title: "?批捆??閬?", description: "?嗅? 30-90 憭拙摰寧撣???怨店憿撘???瘥?, owner: "content_planner", output: "?批捆???阮", duration_hint: "20 ??" },
          { step: 6, title: "Squad Lead QA嚗??乩??湔批祟??, description: "蝣箔??批捆蝑????雿??湛?閰摯鞈??航???, owner: "squad_lead", output: "QA ??", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗摰寧??亙??, description: "摰??臬銵??批捆蝑?勗?嚗 KPI 餈質馱獢", owner: "squad_lead", output: "?批捆蝑?勗?", duration_hint: "15 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "social-media",
        name: "蝷曄黎慦?銵",
        description: "蝷曄黎撟喳???亥??摰寡ˊ雿?蝷曄黎蝬?",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗冗蝢斤璅Ⅱ隤?, description: "蝣箄?銝餉?撟喳????隤踴璅?KPI嚗?蝯脫???鈭???撠?嚗?brief ?", owner: "squad_lead", output: "蝷曄黎 Brief", duration_hint: "10 ??" },
          { step: 2, title: "蝷曄黎?頛芸???", description: "?弦?像?啁?蝯脰憚撱暑頨?畾萸??孛?澆?摮?, owner: "social_analyst", output: "蝷曄黎???", duration_hint: "20 ??" },
          { step: 3, title: "蝡嗅?蝷曄黎蝑?圾", description: "??蝡嗅?撣唾??摰寧??乓?????蝎???, owner: "competitor_analyst", output: "蝡嗅?蝷曄黎?勗?", duration_hint: "15 ??" },
          { step: 4, title: "蝷曄黎?批捆?萎?", description: "?寞??瘣??Ｗ鞎潭?????隤芥ashtag 蝑", owner: "social_copywriter", output: "蝷曄黎?批捆?阮嚗?0 ??", duration_hint: "25 ??" },
          { step: 5, title: "鈭?憓蝑", description: "?嗅?蝷曄黎鈭??拇??GC 蝑?楊撟喳撠??寞?", owner: "growth_specialist", output: "鈭?憓?寞?", duration_hint: "15 ??" },
          { step: 6, title: "Squad Lead QA嚗????湔?, description: "撖拇?批捆????隤蹂??湔改?隤踵銝泵?澆??票??, owner: "squad_lead", output: "QA ??", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗冗蝢文銵?", description: "?游??批捆???票??蝔踴????亦?舐??喳銵??寞?", owner: "squad_lead", output: "蝷曄黎?瑁???, duration_hint: "10 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "seo-growth",
        name: "SEO ?蝑",
        description: "??撘??芸???嗆????瑞???,
        steps: [
          { step: 1, title: "Squad Lead Intake嚗EO ?格?蝣箄?", description: "蝣箄??格??摮奎?剔憓???皞?瘚??格?嚗rief ?", owner: "squad_lead", output: "SEO Brief", duration_hint: "10 ??" },
          { step: 2, title: "?摮???蝛?, description: "?曉擃?撠???蝡嗥???平?????萄?璈?", owner: "seo_researcher", output: "?摮?????, duration_hint: "25 ??" },
          { step: 3, title: "蝡嗅? SEO ??", description: "????5 ?奎???摮?撅?????蝑?摰寞瑽?, owner: "competitor_analyst", output: "蝡嗅? SEO ?勗?", duration_hint: "20 ??" },
          { step: 4, title: "?批捆?嗆?閬?", description: "閮剛?蝬脩??批捆?嗆?嚗illar + Cluster嚗?閬??批捆?Ｗ?芸???", owner: "content_architect", output: "SEO ?批捆?嗆???, duration_hint: "20 ??" },
          { step: 5, title: "On-Page SEO ?芸?撱箄降", description: "???Ｘ??? Title?eta??chema ?芸?皜", owner: "seo_specialist", output: "SEO ?芸? Checklist", duration_hint: "20 ??" },
          { step: 6, title: "Squad Lead QA嚗??亙銵?, description: "閰摯?湧? SEO 蝑??蝔銵扯??芸???", owner: "squad_lead", output: "?芸?????", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗EO ?頝舐???, description: "?游???90 憭?SEO ?瑁?頝舐????急??梢?蝔?", owner: "squad_lead", output: "SEO 頝舐???, duration_hint: "15 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "ad-creative",
        name: "撱???菜?鋆賭?",
        description: "蝷曄黎??撠誨???菜?蝑??獢?蝝?閬?",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗誨?璅Ⅱ隤?, description: "蝣箄?撱???格?嚗???頧?/???瘀???蝞像?啜??橘?brief ?", owner: "squad_lead", output: "撱?? Brief", duration_hint: "10 ??" },
          { step: 2, title: "?瘣???璈???, description: "瘛勗???格???頃鞎瑕?璈?暺捱蝑?蝷?, owner: "consumer_insights", output: "????勗?", duration_hint: "20 ??" },
          { step: 3, title: "蝡嗅?撱????", description: "?圾蝡嗅?撱??蝝???獢?摨艾TA 蝑", owner: "competitor_analyst", output: "蝡嗅?撱??摨?, duration_hint: "15 ??" },
          { step: 4, title: "撱?????", description: "?啣神憭??砍誨??憿蜓?TA嚗??????航?摨佗??/??/蝷暹?隤?嚗?, owner: "ad_copywriter", output: "撱????蝯?嚗?-5 蝯?", duration_hint: "25 ??" },
          { step: 5, title: "蝝?閬??閬箸??, description: "閬??像?啣誨?偕撖詻?閬粹◢?潭?撘/B 皜祈岫?嗆?", owner: "creative_director", output: "蝝?閬??", duration_hint: "15 ??" },
          { step: 6, title: "Squad Lead QA嚗牧??撖拇", description: "撖拇??隤芣????舀??啣漲?????湔?, owner: "squad_lead", output: "??撖拇??", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗誨?銵?", description: "?游???蝯?????撘/B 皜祈岫閮", owner: "squad_lead", output: "撱???瑁???, duration_hint: "10 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "market-research",
        name: "撣?弦?勗?",
        description: "?Ｘ平頞典???渲?璅∟?瘨祥??撖?瘛勗漲?弦",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗?蝛嗥??Ⅱ隤?, description: "蝣箄??弦????漱隞撘?瘛勗漲嚗rief ?", owner: "squad_lead", output: "?弦 Brief", duration_hint: "10 ??" },
          { step: 2, title: "甈∠?鞈???", description: "???Ｘ平?勗??摨絞閮?擃撠??祇?鞈?", owner: "research_analyst", output: "鞈??舀銵?, duration_hint: "25 ??" },
          { step: 3, title: "瘨祥???箏???, description: "???格?瘨祥??鞈潸眺???孛慦????憟賡???摮?, owner: "consumer_researcher", output: "瘨祥???箏??, duration_hint: "20 ??" },
          { step: 4, title: "蝡嗥?澆???", description: "?鼓撣????霅?雿?隡啁??脣??", owner: "competitor_analyst", output: "蝡嗥?澆???, duration_hint: "20 ??" },
          { step: 5, title: "撣璈?霅", description: "?箸?弦?豢?霅 3-5 ?擃????脣蝑撱箄降", owner: "strategy_specialist", output: "璈??拚", duration_hint: "20 ??" },
          { step: 6, title: "Squad Lead QA嚗?撖?霅?, description: "鈭文?瘥???Agent ??橘?蝣箄??摩銝?湔扯??臭縑摨?, owner: "squad_lead", output: "撽???", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗??渡?蝛嗅??, description: "?游??箸??瑁??儔???渡?蝛嗅???恍??菜?撖?閬?, owner: "squad_lead", output: "撣?弦?勗?", duration_hint: "20 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "competitor-analysis",
        name: "蝡嗅????勗?",
        description: "蝟餌絞?奎??蝛嗉?撌桃??????,
        steps: [
          { step: 1, title: "Squad Lead Intake嚗奎???Ⅱ隤?, description: "蝣箄??閬???蝡嗅?皜嚗???嚗??雁摨西??桃?", owner: "squad_lead", output: "蝡嗅??? Brief", duration_hint: "10 ??" },
          { step: 2, title: "蝡嗅??箸鞈???", description: "???奎???Ｗ??寡???嫘?雿?擃??, owner: "research_analyst", output: "蝡嗅?鞈?銵?, duration_hint: "20 ??" },
          { step: 3, title: "蝡嗅?摰???", description: "???奎???格?摰Ｙ黎?敹迄瘙榆?啣?銝餃撐", owner: "competitor_analyst", output: "蝡嗅?摰???, duration_hint: "20 ??" },
          { step: 4, title: "蝡嗅??訾?蝑??", description: "??蝡嗅???SEO?冗蝢扎誨?摰寧???, owner: "digital_analyst", output: "蝡嗅??訾??勗?", duration_hint: "20 ??" },
          { step: 5, title: "撌桃??????, description: "?箸蝡嗅????曉?臬??亦?撌桃?征???絲璈?", owner: "strategy_specialist", output: "撌桃??????, duration_hint: "15 ??" },
          { step: 6, title: "Squad Lead QA嚗恥閫?批祟??, description: "蝣箔???摰Ｚ?皞Ⅱ嚗??瞍?蝡嗅???", owner: "squad_lead", output: "QA ??", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗奎?????, description: "?游??箏蝑撱箄降?奎?????, owner: "squad_lead", output: "蝡嗅????勗?", duration_hint: "15 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "pr-campaign",
        name: "?祇??單蝑",
        description: "???祇???擃?剛??脤?蝞∠?蝑",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗?剔璅Ⅱ隤?, description: "蝣箄??單?桃?嚗璈?銝餃?/瘣餃?嚗??整?擃???蝔?, owner: "squad_lead", output: "PR Brief", duration_hint: "10 ??" },
          { step: 2, title: "慦?????", description: "?弦?格?慦??撠◢?潦??曇憚撱蝯∠???, owner: "pr_researcher", output: "慦?皜", duration_hint: "20 ??" },
          { step: 3, title: "閮獢閮剛?", description: "撱箇??詨?閮?&A 鞈?摨怒?擃?Talking Points", owner: "pr_copywriter", output: "閮獢?辣", duration_hint: "20 ??" },
          { step: 4, title: "?啗?蝔踵撖?, description: "?啣神蝚血?慦??澆????怠?閮??霅???啗?蝔?, owner: "content_writer", output: "?啗?蝔選?銝剜?嚗?, duration_hint: "20 ??" },
          { step: 5, title: "慦??澆?閮", description: "閬??典振/?郊?澆?蝑??蝥蕭頩方??脤???葫閮", owner: "pr_strategist", output: "慦??澆?閮", duration_hint: "15 ??" },
          { step: 6, title: "Squad Lead QA嚗??臭??湔?, description: "撖拇???憭??臭??湔改?蝣箄?瘜?/????", owner: "squad_lead", output: "QA 皜", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗R ?瑁???, description: "?游??啗?蝔踴?擃??柴撣??怎?舐??喳銵? PR ??, owner: "squad_lead", output: "PR ?瑁???, duration_hint: "10 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "email-marketing",
        name: "Email 銵蝑",
        description: "Email ?芸????桀?脰?頧??芸?",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗mail ?格?蝣箄?", description: "蝣箄? Email ?桃?嚗????寡/頧?/??嚗??株?璅～?銵像??, owner: "squad_lead", output: "Email Brief", duration_hint: "10 ??" },
          { step: 2, title: "閮???箏???, description: "???暹????靽∠??????頃鞎瑁??箏???, owner: "data_analyst", output: "????勗?", duration_hint: "20 ??" },
          { step: 3, title: "Email ??閮剛?", description: "閬?銝????Email 摨???嚗迭餈??寡/靽/?瞈瘣鳴?", owner: "email_strategist", output: "Email ????, duration_hint: "20 ??" },
          { step: 4, title: "Email ???啣神", description: "?啣神 3-5 撠敹?Email嚗蜓?刻???閬賣?摮迤?TA嚗?, owner: "email_copywriter", output: "Email ??蝯?", duration_hint: "25 ??" },
          { step: 5, title: "A/B 皜祈岫閬?", description: "閮剛?銝餅銵?A/B 皜祈岫?拚嚗??葫閰行?蝔????文?璅?", owner: "growth_specialist", output: "A/B 皜祈岫閮", duration_hint: "15 ??" },
          { step: 6, title: "Squad Lead QA嚗???撖拇", description: "撖拇瘥? Email ?牧???TA 皜摨艾??蝷???, owner: "squad_lead", output: "???芸?撱箄降", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗mail 銵??, description: "?游???閮剛???獢??/B 閮?箏?瑁??寞?", owner: "squad_lead", output: "Email 銵??, duration_hint: "10 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "linkedin-growth",
        name: "LinkedIn ?蝑",
        description: "LinkedIn ?犖????璆剝??Ｙ?憓??B2B 蝷曄黎蝑",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗inkedIn ?格?蝣箄?", description: "蝣箄? LinkedIn 雿輻?桃?嚗犖??/隡平??Lead Gen嚗璅???, owner: "squad_lead", output: "LinkedIn Brief", duration_hint: "10 ??" },
          { step: 2, title: "???瘜?蝛?, description: "?弦?格????LinkedIn ???箸芋撘inkedIn 蝞??末?澆?", owner: "social_analyst", output: "?瘣??勗?", duration_hint: "20 ??" },
          { step: 3, title: "?犖??摰?", description: "撱箇??函??璆剖?雿hought Leadership 銝駁??敹???, owner: "brand_strategist", output: "?犖?? Blueprint", duration_hint: "20 ??" },
          { step: 4, title: "LinkedIn ?批捆?拚", description: "閮剛?擃??摰寥?????瘣?/??/鞈???瘞矽嚗?閬??澆??餌?", owner: "content_strategist", output: "?批捆?拚", duration_hint: "20 ??" },
          { step: 5, title: "鞎潭??啣神嚗???10 ??", description: "?啣神蝚血? LinkedIn 蝞????寡票??? Hook?挾?賜?憟TA", owner: "linkedin_copywriter", output: "擐鞎潭??阮", duration_hint: "25 ??" },
          { step: 6, title: "Squad Lead QA嚗?璆剖漲撖拇", description: "蝣箄?鞎潭???璆剖靽∪漲???舀??啣漲?????湔?, owner: "squad_lead", output: "蝺刻摩??", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗inkedIn ?閮", description: "?游?摰?蝑?摰寧????寡票? 30 憭拙銵???, owner: "squad_lead", output: "LinkedIn 30 憭抵???, duration_hint: "10 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "youtube-content",
        name: "YouTube ?批捆蝑",
        description: "YouTube ?駁???蔣???? SEO ?芸?",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗?璅Ⅱ隤?, description: "蝣箄??駁?摰??璅??梯??暹撘??Ｗ?餌?", owner: "squad_lead", output: "?駁? Brief", duration_hint: "10 ??" },
          { step: 2, title: "YouTube ???", description: "?弦?格????撠??箝奎????梯憚撱??????末", owner: "youtube_analyst", output: "????勗?", duration_hint: "20 ??" },
          { step: 3, title: "蝡嗅??駁?蝑?圾", description: "????5 ?奎????賊?蝑?葬?◢?潦EO ?摮?撅", owner: "competitor_analyst", output: "蝡嗅??駁??勗?", duration_hint: "20 ??" },
          { step: 4, title: "敶梁?隡??", description: "?Ｗ 10 ??瞏?敶梁??賊?嚗璅??葬??獢蔣?之蝬?, owner: "video_planner", output: "敶梁?隡?皜", duration_hint: "25 ??" },
          { step: 5, title: "YouTube SEO ?芸?", description: "?箸??憿????萄?蝑?escription 璅⊥?ags 蝯?", owner: "seo_specialist", output: "SEO ?芸???", duration_hint: "15 ??" },
          { step: 6, title: "Squad Lead QA嚗???瞏?撖拇", description: "閰摯蝮桀???????瞏?嚗矽?湔?憿?Hook 撘瑕漲", owner: "squad_lead", output: "隡?撖拇??", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗ouTube ?駁?蝑??, description: "?游??駁?摰??憿??柴EO ???箏??湧???瑞???, owner: "squad_lead", output: "YouTube 蝑??, duration_hint: "10 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "website-optimization",
        name: "摰雯?芸?蝑",
        description: "摰雯頧????園?撽??? SEO 撘瑕?",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗?璅Ⅱ隤?, description: "蝣箄??格???敹???????皞??箸???", owner: "squad_lead", output: "?芸? Brief", duration_hint: "10 ??" },
          { step: 2, title: "?冽銵??", description: "???勗???敶晞?????曉瘚仃暺??拇", owner: "ux_analyst", output: "銵???勗?", duration_hint: "20 ??" },
          { step: 3, title: "蝡嗅?摰雯?弦", description: "??蝡嗅?摰雯?縑隞餃遣蝡撘TA 閮剛???????, owner: "competitor_analyst", output: "蝡嗅?蝬脩??勗?", duration_hint: "15 ??" },
          { step: 4, title: "CRO ?芸?撱箄降", description: "??擐?/Landing Page ?雿???獢TA ?擃?獢?, owner: "cro_specialist", output: "CRO ?芸?皜", duration_hint: "25 ??" },
          { step: 5, title: "摰雯???神", description: "?神擐??詨?????潔蜓撘萸冗????憛?, owner: "web_copywriter", output: "?芸?敺?獢?, duration_hint: "20 ??" },
          { step: 6, title: "Squad Lead QA嚗牧??撖拇", description: "閰摯?芸?敺?獢?隤芣??縑隞餅???????", owner: "squad_lead", output: "撖拇??", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗?蝬脣??", description: "?游? CRO 撱箄降????/B 皜祈岫?芸????箏銵獢?, owner: "squad_lead", output: "摰雯?芸???, duration_hint: "10 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "event-marketing",
        name: "瘣餃?銵蝑",
        description: "蝺??祕擃暑??蝑??撱??敺?銵",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗暑?璅Ⅱ隤?, description: "蝣箄?瘣餃?憿??璅??整?蝞暺?撟喳????璅?, owner: "squad_lead", output: "瘣餃? Brief", duration_hint: "10 ??" },
          { step: 2, title: "?格???弦", description: "?弦?格???暑????璈?憟賣撘?捱蝑?蝝?, owner: "consumer_researcher", output: "?瘣?", duration_hint: "15 ??" },
          { step: 3, title: "蝡嗅?瘣餃?獢??弦", description: "?弦憿撮瘣餃??恐?喟??乓???瘜暑??銵", owner: "competitor_analyst", output: "獢????勗?", duration_hint: "15 ??" },
          { step: 4, title: "瘣餃??單蝑", description: "閬?瘣餃???銝?敺??單蝭憟?擃??摰寥???, owner: "event_strategist", output: "?單閮", duration_hint: "20 ??" },
          { step: 5, title: "瘣餃????萎?", description: "?啣神瘣餃?璅??恐?單?獢?????mail ?隢", owner: "event_copywriter", output: "瘣餃?????, duration_hint: "25 ??" },
          { step: 6, title: "Squad Lead QA嚗撘?撖拇", description: "閰摯瘣餃?摰??撘?嚗Ⅱ隤?皜?閮銝?湔?, owner: "squad_lead", output: "QA ??", duration_hint: "10 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗暑???瑕?", description: "?游??單閮??獢??hecklist ?箏??湔暑???瑟獢?, owner: "squad_lead", output: "瘣餃?銵??, duration_hint: "10 ??" },
        ],
      },
      // ??????????????????????????????????????????????????????????????????
      {
        taskType: "strategy",
        name: "銵蝑閬?",
        description: "???湧?銵蝑?摰?撟游漲閮",
        steps: [
          { step: 1, title: "Squad Lead Intake嚗??亦??Ⅱ隤?, description: "蝣箄?蝑????蝞?璅～敹??啗?璆剖??格?嚗rief ?", owner: "squad_lead", output: "蝑 Brief", duration_hint: "15 ??" },
          { step: 2, title: "撣?啣???嚗ESTLE嚗?, description: "???踵祥??瞈冗??銵?敺憓隅?Ｗ????蔣??, owner: "market_researcher", output: "PESTLE ??", duration_hint: "20 ??" },
          { step: 3, title: "???暹?閰摯嚗WOT嚗?, description: "?日????芸?Ｕ??湔???憡?嚗Ⅱ蝡??亥絲暺?, owner: "strategy_analyst", output: "SWOT ??", duration_hint: "20 ??" },
          { step: 4, title: "蝡嗥蝑摰儔", description: "蝣箇?蝡嗥蝑?孵?嚗榆?啣?/???/?嚗?撱箇?蝡嗥?芸頝舐?", owner: "strategy_specialist", output: "蝡嗥蝑?辣", duration_hint: "20 ??" },
          { step: 5, title: "銵蝯?閬?嚗?P嚗?, description: "?嗅??Ｗ????嫘楝?撱??蝑?孵???皞?蝵?, owner: "marketing_planner", output: "銵蝯?閮", duration_hint: "20 ??" },
          { step: 6, title: "Squad Lead QA嚗??乩??湔?, description: "蝣箔????亙?蝝蝦甇支??氬?璆剖??格?撠?嚗??亙銵◢??, owner: "squad_lead", output: "蝑撖拇??", duration_hint: "15 ??" },
          { step: 7, title: "Squad Lead 鈭支?嚗??瑞??亙??, description: "?游??箏??渲??瑞??亙????OKR 獢?銵楝蝺?", owner: "squad_lead", output: "銵蝑?勗?", duration_hint: "20 ??" },
        ],
      },
    ];

    // Upsert each universal workflow template
    for (const wf of UNIVERSAL_WORKFLOWS) {
      const [exists] = await conn.execute(
        `SELECT id FROM squad_workflow_templates WHERE taskType = ? LIMIT 1`,
        [wf.taskType]
      ) as any[];
      if ((exists as any[]).length > 0) {
        await conn.execute(
          `UPDATE squad_workflow_templates SET name = ?, description = ?, steps = ?, missionType = ?, updatedAt = NOW() WHERE taskType = ?`,
          [wf.name, wf.description, JSON.stringify(wf.steps), wf.taskType, wf.taskType]
        );
        console.log(`[seed-local] Workflow '${wf.taskType}': updated`);
      } else {
        await conn.execute(
          `INSERT INTO squad_workflow_templates (taskType, missionType, name, description, steps, isActive, createdAt)
           VALUES (?, ?, ?, ?, ?, 1, NOW())`,
          [wf.taskType, wf.taskType, wf.name, wf.description, JSON.stringify(wf.steps)]
        );
        console.log(`[seed-local] Workflow '${wf.taskType}': inserted`);
      }
    }

    // ?? 4. Brand Positioning Methodology Squads ??????????????????????????????????
    // Five squads based on empirical brand positioning methodologies.
    // Agents are resolved dynamically from the 17K+ agent pool by skill keywords.
    // Workflow steps reference the specific MCP tools / frameworks from the
    // methodology ??resource table supplied by the product team.

    // ?? 4a. Benefit-Based Positioning ?????????????????????????????????????????
    // Tools: osp_marketing_tools (Value Map Generator), marketing-strategy-pmm (Messaging Hierarchy)
    // Ladder: feature ??functional benefit ??emotional benefit ??conversion copy
    {
      const slug = "benefit-based-positioning";
      const taskType = "benefit-based-positioning";
      const used: number[] = [];

      const leadSkills = ["messaging", "brand-voice", "content-strategy", "pmm", "copywriting", "positioning"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }
      const m2Skills = ["consumer-insights", "customer-research", "ux-research", "insight"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }
      const m3Skills = ["emotional-branding", "brand-dna", "brand-strategy", "emotional"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }
      const m4Skills = ["copywriting", "conversion", "cro", "ad-creative", "performance-marketing"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }
      const m5Skills = ["ad-creative", "paid-social", "facebook-ads", "messaging", "performance"];
      const m5 = await findAgent(conn, m5Skills, used);
      if (m5) { used.push(m5); await assignSkillsToAgent(conn, m5, m5Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "messaging_strategist",   order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "consumer_insight_analyst", order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "emotional_brand_specialist", order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "conversion_copywriter",    order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "ad_messaging_validator",   order: 5 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info, m5Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
        getAgentInfo(conn, m5 ?? null),
      ]);

      const bbpSteps = [
        assignAgentToStep({ step: 1, title: "Squad Lead Intake嚗???質???日?", description: "Squad Lead ?園??Ｗ??皜?璅??整???荔?閰摯?桀?摰???摨佗?Brief ?隞餃?蝭?", owner: "squad_lead", output: "隞餃?蝪∪嚗rief嚗?, tools: [], requiredSkills: ["benefit-laddering", "consumer-psychology", "feature-analysis"] }, leadInfo),
        assignAgentToStep({ step: 2, title: "??拍?頧?", description: "Consumer Insight Analyst 撠?????質?霅舐?Ⅱ???賢??Functional Benefit嚗?雿輻 osp_marketing_tools Product Value Map Generator嚗eatures ??position statements", owner: "consumer_insight_analyst", output: "??拍?皜嚗eature ??Functional Benefit Map嚗?, tools: ["osp_marketing_tools: Product Value Map Generator"], requiredSkills: ["emotional-branding", "brand-psychology", "consumer-insights"] }, m2Info),
        assignAgentToStep({ step: 3, title: "???拍???", description: "Emotional Brand Specialist 撠????賢??銝????????拍?嚗? marketing-strategy-pmm Messaging Hierarchy嚗eadline ??Benefits ??Features ??Proof嚗??, owner: "emotional_brand_specialist", output: "???拍???銵剁?Functional ??Emotional Benefit嚗?, tools: ["marketing-strategy-pmm: Messaging Hierarchy"], requiredSkills: ["messaging", "brand-voice", "copywriting", "positioning"] }, leadInfo),
        assignAgentToStep({ step: 4, title: "?拍??０閮獢撱箸?", description: "Messaging Strategist ?游??甇伐??Ｗ摰 Message Ladder嚗??蜓撘?????拍? ?????拍? ??蝷暹?隤? ??銵??潛捲", owner: "messaging_strategist", output: "摰 Message Ladder ?辣", tools: ["osp_marketing_tools: Tagline Generator", "marketing-strategy-pmm: Messaging Hierarchy"], requiredSkills: ["copywriting", "brand-voice", "positioning", "brand-strategy"] }, m3Info),
        assignAgentToStep({ step: 5, title: "頧????誨???航??, description: "Conversion Copywriter 撠?Message Ladder 頧??箏誨??Headline?anding Page Copy?mail Subject Lines嚗d Messaging Validator ??A/B 獢閰摯??", owner: "conversion_copywriter", output: "撱??????Ads / LP / Email嚗?, tools: ["marketing-strategy-pmm: Messaging Hierarchy"], requiredSkills: ["content-strategy", "omnichannel", "messaging", "ad-creative"] }, m4Info),
        assignAgentToStep({ step: 6, title: "Squad Lead QA & ?拍??０摰??訾漱隞?, description: "Squad Lead ?⊿?券頛詨嚗Ⅱ靽?璇臭??湔扯????梢陷嚗撓?箸?蝯????雿", owner: "squad_lead", output: "?拍??０摰??賂?Benefit-Based Positioning Deck嚗?, tools: [] }, null),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "?拍??０摰?瘚?嚗enefit Ladder嚗?,
        description: "敺???賢?潘?瘝?Feature ??Functional Benefit ??Emotional Benefit 璇臬耦?砍?嚗?蝯?啁頧????誨???胯極?瘀?osp_marketing_tools Value Map Generator + marketing-strategy-pmm Messaging Hierarchy??,
        steps: bbpSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "?拍??０摰?撠?",
        description: "瘝?Feature ??Functional Benefit ??Emotional Benefit 璇臬耦???撠??扯????鈭箏??????航?擃??誨??獢???Emerald ?弦嚗??雿??摰??典??末?漲?榆?啣??靽∪漲銝?Ｗ??箝?,
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "benefit-based",
        agents: members,
        tags: ["brand", "positioning", "messaging", "copywriting", "emotional-branding", "benefit-ladder", "conversion", "ad-creative", "strategy"],
        useCases: ["?啁??撣??舀???, "撱?????寧?", "Landing Page 頧??芸?", "???摰?閮?游?", "????撱箇?"],
        outputFormats: ["PDF 蝑?勗?", "Google Slides 蝪∪", "YouTube 敶梁??單"],
        requiredIntegrations: [],
        token: 60000,
        showcases: [
          { company: "Apple", description: "iPod 敺?GB MP3 ?剜?具????,000 擐??曉鋡?Feature???賤?????銝惜頧?", result: "iPod 銝?擐僑?瑕頞? 600 ?砍嚗霈?璅璆?, source: "Apple Marketing Case Study" },
          { company: "Slack", description: "敺?璆剝?頠????啣?雿??雿?撖?Email ?極?瑯??????嚗圾?急?嚗?, result: "DAU 敺?0 ???1,200 ?穿?隡啣潸???$270 ??, source: "Slack S-1 Filing" },
        ],
      });
    }

    // ?? 4b. Differentiation Positioning ???????????????????????????????????????
    // Tools: marketing-strategy-pmm (April Dunford method, Battlecard, Win/Loss Analysis)
    // Core: isolate unique attributes ??map to customer value ??choose market category ??claim the gap
    {
      const slug = "differentiation-positioning";
      const taskType = "differentiation-positioning";
      const used: number[] = [];

      const leadSkills = ["brand-strategy", "positioning", "strategy", "gtm", "cmo", "differentiation"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }
      const m2Skills = ["competitor-analysis", "competitive-analysis", "competitive-intelligence", "market-research"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }
      const m3Skills = ["brand-identity", "brand-dna", "brand-strategy", "creative-strategy"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }
      const m4Skills = ["sales-enablement", "battlecard", "win-loss", "product-marketing", "pmm"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }
      const m5Skills = ["market-research", "research", "analysis", "insight", "consumer-insights"];
      const m5 = await findAgent(conn, m5Skills, used);
      if (m5) { used.push(m5); await assignSkillsToAgent(conn, m5, m5Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "differentiation_strategist",    order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "competitive_intelligence_analyst", order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "brand_identity_specialist",       order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "battlecard_pmm",                  order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "market_gap_analyst",              order: 5 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info, m5Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
        getAgentInfo(conn, m5 ?? null),
      ]);

      const diffSteps = [
        assignAgentToStep({ step: 1, title: "Squad Lead Intake嚗奎?剔瘜????芸?日?", description: "Squad Lead ?園????暹?摰??歇?亦奎?恥?嗅?擖?閰摯撌桃???漲嚗Ⅱ隤?April Dunford ?寞?隢?函???, owner: "squad_lead", output: "蝡嗥?日?蝪∪嚗ompetitive Audit Brief嚗?, tools: [], requiredSkills: ["competitive-analysis", "market-research", "competitor-intelligence"] }, m2Info),
        assignAgentToStep({ step: 2, title: "?函撅祆扯??伐?Isolate Unique Attributes嚗?, description: "Competitive Intelligence Analyst 蝟餌絞?批??箏??撠奎?????孵惇?改????銵?蝔???嚗蝙??marketing-strategy-pmm April Dunford 獢?蕪?迤撌桃??撅祆?, owner: "competitive_intelligence_analyst", output: "撌桃?惇?扳??殷?Unique Attributes List嚗?, tools: ["marketing-strategy-pmm: April Dunford ??Isolate Unique Attributes"], requiredSkills: ["brand-strategy", "differentiation", "positioning", "product-marketing"] }, leadInfo),
        assignAgentToStep({ step: 3, title: "摰Ｘ?孵潭?撠?Map to Customer Value嚗?, description: "Brand Identity Specialist 撠???孵惇?批??摰Ｘ?祕????潘?cost savings / risk reduction / strategic value嚗?蝘駁摰Ｘ銝銋??榆?啣?", owner: "brand_identity_specialist", output: "摰Ｘ?孵潭?撠”嚗ttribute ??Customer Value Map嚗?, tools: ["marketing-strategy-pmm: April Dunford ??Map to Customer Value"], requiredSkills: ["positioning", "brand-strategy", "copywriting", "pmm"] }, leadInfo),
        assignAgentToStep({ step: 4, title: "撣憿?詨?嚗hoose Market Category嚗?, description: "Differentiation Strategist ?寞??撘瑕榆?啣?撅祆折摰?????湧??交??塚??啣?憿?/ 摮?憿?/ ?獢?Ｘ?憿嚗?蝣箇????刻府憿??撠雿?, owner: "differentiation_strategist", output: "撣憿摰??嚗arket Category Statement嚗?, tools: ["marketing-strategy-pmm: April Dunford ??Choose Market Category"], requiredSkills: ["battlecard", "sales-enablement", "competitive-analysis", "pmm"] }, m4Info),
        assignAgentToStep({ step: 5, title: "Battlecard & Win/Loss ??", description: "Battlecard PMM ?Ｗ蝡嗅?撠? Battlecard嚗??孵??vs ?奎?摹暺?嚗蝙??marketing-strategy-pmm Win/Loss Analysis Template 撽?撌桃?蜓撘菜?血撖阡??瑕銝剜?蝡?, owner: "battlecard_pmm", output: "蝡嗅? Battlecard 憟? + Win/Loss ???勗?", tools: ["marketing-strategy-pmm: Battlecard Template", "marketing-strategy-pmm: Win/Loss Analysis"], requiredSkills: ["win-loss", "sales-enablement", "competitive-intelligence", "market-research"] }, m5Info),
        assignAgentToStep({ step: 6, title: "Squad Lead QA & 撌桃??雿鈭支?", description: "Squad Lead 蝣箄?撌桃?蜓撘萄撣??柴??蝡舐?銝?湔改?頛詨?航?啁?撌桃??雿", owner: "squad_lead", output: "撌桃??雿嚗ifferentiation Positioning Playbook嚗?, tools: [] }, null),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "撌桃??雿?蝔?April Dunford Method嚗?,
        description: "蝟餌絞?扳?箇奎???芯???撌桃?征??隞?April Dunford Obviously Awesome ?寞?隢?詨?嚗?孵惇????摰Ｘ?孵???撣憿 ??摰??銝血摰??Battlecard ??Win/Loss ???賢??,
        steps: diffSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "撌桃??雿?蝯?,
        description: "蝟餌絞?扳?箇奎?摰?迂???渡征?踝?隞?April Dunford Obviously Awesome ?寞?隢?詨?嚗??函撅祆扯??亙撣憿摰??嚗?蝯誑 Battlecard ??Win/Loss ??撽??UEL ?豢?憿舐內嚗???啣榆?啣??????港遢憿???2-3 ??,
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "differentiation",
        agents: members,
        tags: ["brand", "positioning", "differentiation", "competitive-analysis", "brand-strategy", "battlecard", "april-dunford", "gtm", "market-category"],
        useCases: ["?啣??湧脣蝑", "撠?撘瑕蝡嗅?", "???摰?", "?瑕 Battlecard 撱箇?", "PMM 蝡嗅???"],
        outputFormats: ["PDF 蝑?勗?", "Google Slides 蝪∪", "蝡嗅? Battlecard"],
        requiredIntegrations: [],
        token: 70000,
        showcases: [
          { company: "Drift", description: "April Dunford ?寞?隢??曉?I 撠店撘??瑯征雿??Ⅱ摰儔蝡嗥?蹂誨??喟絞銵典銵撌亙", result: "隞亥???$10 ?◤?嗉頃嚗???Conversational Marketing ??隞?”", source: "Obviously Awesome, April Dunford" },
          { company: "Basecamp", description: "?典之撟喳蝡嗥?誨嚗榆?啣??箝??箏???閮剛???蝪∪極?瑯?????刻", result: "???嚗恥?嗥?摮???擃銵平撟喳?", source: "Basecamp Annual Report" },
        ],
      });
    }

    // ?? 4c. Value Proposition Mapping ?????????????????????????????????????????
    // Tools: osp_marketing_tools (Value Map: 4-dimension position statements), marketing-strategy-pmm (ICP)
    // Core: features ??ICP personas ??position statements (market/technical/UX/business) ??collateral
    {
      const slug = "value-proposition-mapping";
      const taskType = "value-proposition-mapping";
      const used: number[] = [];

      const leadSkills = ["gtm", "b2b", "product-marketing", "pmm", "demand-gen", "saas"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }
      const m2Skills = ["icp", "customer-research", "b2b", "firmographic", "segmentation", "buyer-persona"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }
      const m3Skills = ["value-proposition", "positioning", "product-marketing", "b2b", "saas"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }
      const m4Skills = ["copywriting", "messaging", "content-strategy", "brand-voice", "landing-page"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }
      const m5Skills = ["sales-enablement", "sales-deck", "collateral", "demand-gen", "cro"];
      const m5 = await findAgent(conn, m5Skills, used);
      if (m5) { used.push(m5); await assignSkillsToAgent(conn, m5, m5Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "gtm_value_strategist",   order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "icp_researcher",           order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "value_map_architect",      order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "messaging_copywriter",     order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "sales_collateral_pmm",     order: 5 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info, m5Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
        getAgentInfo(conn, m5 ?? null),
      ]);

      const vpmSteps = [
        assignAgentToStep({ step: 1, title: "Squad Lead Intake嚗???賣???+ ?郊 ICP 摰儔", description: "Squad Lead ?園??Ｗ???”?歇?亙恥?園??蜓閬奎??閰摯 messaging-market fit ?暹?嚗Ⅱ隤?Value Mapping ?芸???眺摰園???, owner: "squad_lead", output: "?Ｗ??皜 + ICP ?阮嚗rief嚗?, tools: [], requiredSkills: ["icp", "customer-research", "b2b", "pain-point-analysis"] }, m2Info),
        assignAgentToStep({ step: 2, title: "ICP 蝎曄Ⅱ摰儔嚗irmographic ??Psychographic嚗?, description: "ICP Researcher 雿輻 marketing-strategy-pmm ICP Scoring 獢嚗? Firmographics ??Technographics ??Psychographics ??Buyer Personas 銝惜?莎?撱箇? A/B/C/D ICP 閰?璅∪?", owner: "icp_researcher", output: "ICP 摰儔?辣嚗 A/B/C/D 閰?嚗?, tools: ["marketing-strategy-pmm: ICP Scoring (A/B/C/D)", "marketing-strategy-pmm: Buyer Persona Template"], requiredSkills: ["value-proposition", "positioning", "product-marketing", "b2b"] }, leadInfo),
        assignAgentToStep({ step: 3, title: "?????賢?澆???Pain ??Feature ??Benefit嚗?, description: "Value Map Architect 雿輻 osp_marketing_tools Product Value Map Generator嚗瘥?ICP Persona ?? Pain Points ??Features ??Benefits ??Position Statements ???湔?撠?, owner: "value_map_architect", output: "?孵潭?撠???瘥?ICP ? 瘥??踝?", tools: ["osp_marketing_tools: Product Value Map Generator"], requiredSkills: ["positioning", "brand-strategy", "pmm", "copywriting"] }, leadInfo),
        assignAgentToStep({ step: 4, title: "?雁摨血?雿????Market / Technical / UX / Business嚗?, description: "Value Map Architect 雿輻 osp_marketing_tools ???雁摨衣?摰??脫?嚗arket Position嚗??湛??echnical Position嚗?銵??X Position嚗?撽??usiness Position嚗?璆剖?潘?嚗???Messaging Copywriter 蝎曄???", owner: "value_map_architect", output: "?雁摨血?雿??隞?, tools: ["osp_marketing_tools: Position Statement Generator (4 dimensions)"], requiredSkills: ["gtm", "messaging", "content-strategy", "demand-gen"] }, m4Info),
        assignAgentToStep({ step: 5, title: "?瑕蝝??誨??獢???, description: "Messaging Copywriter 撠?雿??? Landing Page Copy?ales Deck?d Headlines嚗ales Collateral PMM ???箏?湔雿輻??桃???", owner: "messaging_copywriter", output: "?瑕蝝???LP / Sales Deck / Ads嚗?, tools: ["marketing-strategy-pmm: Value Proposition Formula"], requiredSkills: ["sales-enablement", "sales-deck", "collateral", "demand-gen"] }, m5Info),
        assignAgentToStep({ step: 6, title: "Squad Lead QA & ?孵潔蜓撘萄?雿鈭支?", description: "Squad Lead 蝣箄??雁摨西??銝?湔扯?蝡嗥撌桃??頛詨摰 Value Proposition Playbook", owner: "squad_lead", output: "?孵潔蜓撘萄?雿嚗alue Proposition Playbook嚗?, tools: [] }, null),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "?孵潔蜓撘菜?撠?蝔?Value Proposition Mapping嚗?,
        description: "B2B/SaaS ?詨?摰?撌亙嚗??Ｗ??撠??唾眺摰嗥?暺?摰儔 ICP嚗??????銵?UX/?平?雁摨血?雿???湔頧??粹?桃???撱?????極?瘀?osp_marketing_tools Value Map + marketing-strategy-pmm ICP??,
        steps: vpmSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "?孵潔蜓撘菜?撠?蝯?,
        description: "B2B/SaaS ?詨?摰?撌亙嚗??Ｗ?????唾眺摰嗥?暺?撱箇?蝎曄Ⅱ ICP嚗????氬?銵X??璆剖?蝬剖漲摰??脫?嚗?亥?啁?瑕蝝??誨??獢essaging-market fit ? product-market fit??,
        industryKey: "b2b",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "value-proposition",
        agents: members,
        tags: ["b2b", "saas", "gtm", "value-proposition", "icp", "positioning", "product-marketing", "pmm", "demand-gen", "messaging", "strategy"],
        useCases: ["B2B SaaS 摰?撱箇?", "GTM 閮獢", "ICP 蝎曄Ⅱ摰儔", "Sales Deck ?遣", "Landing Page 頧??芸?", "Messaging-market fit 撽?"],
        outputFormats: ["PDF 蝑?勗?", "Google Slides 蝪∪", "Value Map Canvas"],
        requiredIntegrations: ["google-analytics"],
        token: 70000,
        showcases: [
          { company: "Stripe", description: "皜???潸?Value Prop嚗?抵?蝔?蝣澆摰??臭???蝎暹?撠????憭抒?暺?銴??隞??", result: "撣潸???$950 ??? B2B ?臭??箇?閮剜擐", source: "Stripe Growth Story" },
          { company: "Notion", description: "Value Map嚗????Wiki/Tasks/Docs 撌亙?游??箔?嚗??霅極雿極?瑞???詨? Job", result: "?冽???3,000 ?穿?隡啣?$100 ??, source: "Notion Investor Deck" },
        ],
      });
    }

    // ?? 4d. Segmentation-Based Positioning ????????????????????????????????????
    // Tools: Madison (Research Agents: synthetic persona, segmentation, preference modeling),
    //        marketing-strategy-pmm (ICP Scoring A/B/C/D, Buyer Persona Templates)
    // Core: audience data ??segmentation model ??ICP scoring ??segment-specific positioning
    {
      const slug = "segmentation-based-positioning";
      const taskType = "segmentation-based-positioning";
      const used: number[] = [];

      const leadSkills = ["segmentation", "audience", "analytics", "consumer-insights", "data", "research"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }
      const m2Skills = ["data", "analytics", "data-analysis", "survey", "research", "quantitative"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }
      const m3Skills = ["persona", "consumer-insights", "behavioral", "customer-research", "qualitative"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }
      const m4Skills = ["icp", "b2b", "product-marketing", "pmm", "buyer-persona", "segmentation"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }
      const m5Skills = ["personalization", "channel-strategy", "audience-targeting", "paid-social", "media-planning"];
      const m5 = await findAgent(conn, m5Skills, used);
      if (m5) { used.push(m5); await assignSkillsToAgent(conn, m5, m5Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "segmentation_strategist",   order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "data_analyst",               order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "persona_developer",          order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "icp_scoring_pmm",            order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "personalization_strategist", order: 5 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info, m5Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
        getAgentInfo(conn, m5 ?? null),
      ]);

      const segSteps = [
        assignAgentToStep({ step: 1, title: "Squad Lead Intake嚗??曄瘜???格??日?", description: "Squad Lead ?園??暹?摰Ｘ鞈??歇?亙??曉?閮准??瑞璅?閰摯?摰???閬扯??芸??黎?孵?", owner: "squad_lead", output: "?摰?蝪∪嚗egmentation Brief嚗?, tools: [], requiredSkills: ["segmentation", "market-research", "data-analysis", "quantitative-research"] }, m2Info),
        assignAgentToStep({ step: 2, title: "?鞈??園?????Survey Analysis嚗?, description: "Data Analyst 雿輻 Madison Research Agents ?脰? survey analysis ???????撱箇???箸鞈???鈭箏蝯梯????箝頃鞎瑕?璈?", owner: "data_analyst", output: "?鞈???Audience Dataset嚗?, tools: ["Madison: Research Agents ??Survey Analysis", "Madison: Research Agents ??Secondary Research"], requiredSkills: ["icp", "b2b", "scoring-model", "data-analysis", "segmentation"] }, m4Info),
        assignAgentToStep({ step: 3, title: "?? Persona ?嚗ynthetic Persona Development嚗?, description: "Persona Developer 雿輻 Madison ??Synthetic Persona Development ??Preference Modeling 撱箇? 3-5 ?????? Persona嚗?頞蝯晞??西? Persona??, owner: "persona_developer", output: "?? Persona ?∠?嚗ata-Driven Personas嚗?, tools: ["Madison: Synthetic Persona Development", "Madison: Preference Modeling"], requiredSkills: ["persona", "consumer-insights", "qualitative-research", "behavioral-analysis"] }, m3Info),
        assignAgentToStep({ step: 4, title: "ICP 閰????摨?A/B/C/D Fit Scoring嚗?, description: "ICP Scoring PMM 雿輻 marketing-strategy-pmm ICP Scoring 獢嚗?瘥?Persona ?脰? A/B/C/D Fit 閰?嚗irmographic / Technographic / Psychographic / Economic Buyer嚗?蝣箏???芸??颱??恥蝢?, owner: "icp_scoring_pmm", output: "ICP 閰?銵剁?Priority Segment Matrix嚗?, tools: ["marketing-strategy-pmm: ICP Scoring A/B/C/D", "marketing-strategy-pmm: Buyer Persona Templates"], requiredSkills: ["positioning", "brand-strategy", "pmm", "messaging"] }, leadInfo),
        assignAgentToStep({ step: 5, title: "??蝢文榆?啣?摰??犖???舫???, description: "Personalization Strategist ??瘥?A-grade ICP ?撠惇??雿??胯孛?????乓犖?誨?????, owner: "personalization_strategist", output: "?摰?閮?拚嚗egment ? Positioning Message嚗?, tools: ["Madison: Preference Modeling"], requiredSkills: ["channel-strategy", "personalization", "audience-targeting", "media-planning"] }, m5Info),
        assignAgentToStep({ step: 6, title: "Squad Lead QA & ?摰??拚鈭支?", description: "Squad Lead 蝣箄???蝢文?雿?撌桃?????改?頛詨摰?摰??拚?銵遣霅?, owner: "squad_lead", output: "?摰??拚嚗egmentation Positioning Playbook嚗?, tools: [] }, null),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "?摰?瘚?嚗egmentation-Based Positioning嚗?,
        description: "??銝??蝢日?撱箇?撌桃??雿???撱?撘???蝙??Madison Research Agents ?脰????????Persona ?嚗??marketing-strategy-pmm ICP 閰?璅∪?嚗/B/C/D嚗??摨璅恥蝢扎cKinsey 鞈?憿舐內???犖??? 50% ?脣恥???,
        steps: segSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "?摰?撠?",
        description: "??銝??蝢日?撱箇?撌桃??雿?雿輻 Madison Research Agents ?脰?鞈?撽?????Persona ???憟賢遣璅∴??剝? ICP A/B/C/D 閰?璅∪?蝎曄Ⅱ???格?摰Ｙ黎嚗??犖????脣恥???50%??,
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "segmentation",
        agents: members,
        tags: ["segmentation", "audience", "persona", "icp", "positioning", "consumer-insights", "personalization", "b2b", "data", "research", "strategy"],
        useCases: ["?蝝啣????摨?, "ICP 蝎曄Ⅱ摰儔", "?犖???瑞???, "憭?Persona ??摰?", "?啣??游??暹?撖?, "???脣恥?"],
        outputFormats: ["PDF 蝑?勗?", "Google Slides 蝪∪", "Persona ?∠?"],
        requiredIntegrations: ["facebook-ads", "google-analytics"],
        token: 80000,
        showcases: [
          { company: "Netflix", description: "銝惜 ICP ?黎嚗振摨准蔣餈瑯葡瘚??刻??閮剛?摰??摰寧??伐????桐?閮???犖", result: "閮?冽頞? 2.6 ????函??憭找葡瘚像??, source: "Netflix Investor Relations" },
          { company: "HubSpot", description: "SMB vs Enterprise ??蝢文?雿??伐?Freemium ?詨? SMB嚗nterprise 撠惇????芋??, result: "ARR 頞? $14 ????頝刻? SMB ??Enterprise 撣", source: "HubSpot Annual Report 2023" },
        ],
      });
    }

    // ?? 4e. Competitive Perceptual Mapping ????????????????????????????????????
    // Tools: marketing-strategy-pmm (positioning map + whitespace), Madison Intelligence Agents,
    //        octolens (real-time competitor monitoring)
    // Core: collect ??plot 2-axis map ??find whitespace ??claim it
    {
      const slug = "competitive-perceptual-mapping";
      const taskType = "competitive-perceptual-mapping";
      const used: number[] = [];

      const leadSkills = ["competitive-analysis", "competitor-analysis", "market-research", "strategy", "positioning"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }
      const m2Skills = ["competitor-analysis", "competitive-intelligence", "web-research", "monitoring"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }
      const m3Skills = ["market-research", "research", "trend-analysis", "secondary-research", "intelligence"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }
      const m4Skills = ["data", "analytics", "data-visualization", "analysis", "reporting"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }
      const m5Skills = ["brand-strategy", "positioning", "gtm", "channel-strategy", "ad-targeting"];
      const m5 = await findAgent(conn, m5Skills, used);
      if (m5) { used.push(m5); await assignSkillsToAgent(conn, m5, m5Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "competitive_perceptual_strategist", order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "competitor_monitor",               order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "market_intelligence_analyst",       order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "data_visualization_specialist",     order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "positioning_strategist",            order: 5 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info, m5Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
        getAgentInfo(conn, m5 ?? null),
      ]);

      const cpmSteps = [
        assignAgentToStep({ step: 1, title: "Squad Lead Intake嚗奎????蝢抵??啣?蝬剖漲?身", description: "Squad Lead 蝣箄??閬??亦?蝡嗅?蝭?嚗???蝡嗅?嚗??亙???郊蝬剖漲?身嚗?嚗??vs ?釭?蝯?vs ?菜嚗?閮?鞈??園?閮?", owner: "squad_lead", output: "蝡嗅?蝭?皜 + ?郊蝬剖漲?身嚗rief嚗?, tools: [], requiredSkills: ["competitive-intelligence", "competitor-analysis", "market-monitoring"] }, m2Info),
        assignAgentToStep({ step: 2, title: "蝡嗅??單??豢???嚗eal-time Competitor Tracking嚗?, description: "Competitor Monitor 雿輻 octolens 撠璅奎?脰??單?蝬脤?鞈??賢?嚗??蝬脣?雿??胯誨??獢??寥??ＵR ?潛阮蝑???, owner: "competitor_monitor", output: "蝡嗅???鞈???Competitor Raw Data嚗?, tools: ["octolens: Competitor Monitoring & Web Data Extraction"], requiredSkills: ["market-research", "positioning", "competitive-analysis", "brand-strategy"] }, leadInfo),
        assignAgentToStep({ step: 3, title: "撣?瘛勗漲??嚗arketMind Research嚗?, description: "Market Intelligence Analyst 雿輻 Madison Intelligence Agents ??MarketMind Research 璅∠?嚗脰? reputation monitoring?rend analysis ???港?????蝛塚?鋆? octolens ???豢??楛摨西圾霈", owner: "market_intelligence_analyst", output: "撣????勗?", tools: ["Madison: Intelligence Agents ??MarketMind Research", "Madison: Intelligence Agents ??Reputation Monitoring", "Madison: Intelligence Agents ??Trend Analysis"], requiredSkills: ["data-visualization", "analysis", "competitive-analysis", "reporting"] }, m4Info),
        assignAgentToStep({ step: 4, title: "??啣?蝜芾ˊ嚗erceptual Map Construction嚗?, description: "Data Visualization Specialist 雿輻 marketing-strategy-pmm Competitive Positioning Map 獢嚗??蝛嗥??摰??瑕??漲??2 ?雁摨西遘嚗鼓鋆賢???vs 蝡嗅???蝬剜??亙?雿?", owner: "data_visualization_specialist", output: "蝡嗥??啣?嚗erceptual Map嚗?, tools: ["marketing-strategy-pmm: Competitive Positioning Map Construction", "marketing-strategy-pmm: positioning-frameworks.md"], requiredSkills: ["market-research", "positioning", "strategy", "competitive-analysis"] }, leadInfo),
        assignAgentToStep({ step: 5, title: "?賜征???亥?摰?璈?撱箄降", description: "Positioning Strategist ????啣?嚗??亦奎???芯????賜征??閰摯???脣?賜征???航??改?? 2-3 ?榆?啣?摰??孵?????撱??蝑?????乓??孵遣霅?, owner: "positioning_strategist", output: "?賜征??????+ 摰??孵?撱箄降??, tools: ["marketing-strategy-pmm: Whitespace Analysis"], requiredSkills: ["brand-strategy", "positioning", "gtm", "ad-targeting"] }, m5Info),
        assignAgentToStep({ step: 6, title: "Squad Lead QA & ?摰??勗?鈭支?", description: "Squad Lead ?游???啣? + ?賜征????+ 摰?撱箄降嚗撓?箏??渡奎?剜??亙?雿???湔?冽撱??蝑???????寞捱蝑?, owner: "squad_lead", output: "蝡嗥?摰??勗?嚗ompetitive Perceptual Positioning Report嚗?, tools: [] }, null),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "蝡嗥???蝔?Competitive Perceptual Mapping嚗?,
        description: "蝟餌絞蝜芾ˊ?? vs 蝡嗅???頠豢??亙???寞/?釭????喟絞蝑?嚗??交鋡思???撣?賜征?極?瘀?octolens 蝡嗅??單??? + Madison Intelligence Agents MarketMind Research + marketing-strategy-pmm Competitive Positioning Map??,
        steps: cpmSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "蝡嗥?摰?撠?",
        description: "蝟餌絞蝜芾ˊ?? vs 蝡嗅??遘??啣?嚗??亙??渡蝛粹????octolens ?單?蝡嗅????adison Intelligence Agents MarketMind Research?arketing-strategy-pmm 摰?獢嚗?交?撠誨???乓?????摰瘙箇???,
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "perceptual-mapping",
        agents: members,
        tags: ["competitive-analysis", "competitor-analysis", "positioning", "market-research", "perceptual-map", "whitespace", "brand-strategy", "strategy", "intelligence", "gtm"],
        useCases: ["?曉撣?賜征??, "蝡嗅?摰???", "撱??蝑靘?", "摰蝑頛詨", "?啣?憿脣閰摯", "????雿奎??蝛?],
        outputFormats: ["PDF 蝑?勗?", "Google Slides 蝪∪", "鈭?撘??亙??],
        requiredIntegrations: [],
        token: 75000,
        showcases: [
          { company: "Chobani", description: "?冽??亙??啜予??+ 擃??賬?頠貊蝛粹?嚗?喟絞?芣撣銝剖?摰?", result: "敺?0 ???$15 ???潘???蝢??芣撣?澆?", source: "Chobani Brand Story" },
          { company: "Dollar Shave Club", description: "??啣?摰??箝??批瘥?+ 靘踹??撠? Gillette ??蝘? + 擃??雿?, result: "隞?$10 ?◤ Unilever ?嗉頃嚗霈擛?撣蝯?", source: "Unilever Press Release" },
        ],
      });
    }

    // ????????????????????????????????????????????????????????????????????????????    // Brand Positioning Methodologies 6-10
    // ????????????????????????????????????????????????????????????????????????????
    // ?? 6. Category Design嚗?憿身閮???????????????????????????????????????????
    // Create a new category and become its king rather than fighting for share
    {
      const slug     = "category-design-positioning";
      const taskType = "category-design-positioning";
      const used: number[] = [];

      const leadSkills = ["category-design", "category-creation", "market-creation", "thought-leadership", "brand-strategy", "positioning"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }
      const m2Skills = ["content-strategy", "thought-leadership", "narrative", "storytelling", "brand-voice"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }
      const m3Skills = ["market-research", "market-analysis", "industry-research", "competitive-intelligence"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }
      const m4Skills = ["gtm", "go-to-market", "launch-strategy", "product-marketing", "growth"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "category_designer",      order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "thought_leader_writer",   order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "market_analyst",          order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "gtm_strategist",          order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const cdpSteps = [
        assignAgentToStep({
          order: 1, name: "????閮箸",
          description: "??Madison MarketMind Research Agents ???暹?撣蝯?嚗?箏??芾◤?賢???憿征??problem space嚗??交?鞎餉?瘝?霅?芸楛????暺?,
          tool: "madison-market-research",
          outputType: "category_problem_brief",
          requiredSkills: ["market-research", "category-design", "industry-analysis", "market-creation"],
        }, m3Info),
        assignAgentToStep({
          order: 2, name: "?? POV嚗?暺?撱箇?",
          description: "?啣神???敹?暺?隞塚?Category POV嚗??箔?暻潛?圾瘜?憭末嚗???憿雿?臭??迤蝣箇?獢??澆?嚗?憿餈???????vs ?唬???????摰????,
          tool: "osp_marketing_tools",
          outputType: "category_pov_document",
          requiredSkills: ["thought-leadership", "brand-strategy", "copywriting", "category-design"],
        }, leadInfo),
        assignAgentToStep({
          order: 3, name: "蝡嗅??獢",
          description: "??octolens ??蝡嗅?憒??芣?摰?嚗 marketing-strategy-pmm Battlecard 撌亙閮?蝡嗅?撘梢?嚗敺?蝡嗅?摰??箄圾瘙箄????蝯望獢??????圾瘙箇??臬?啁?????,
          tool: "octolens",
          outputType: "competitive_reframe_map",
          requiredSkills: ["competitive-analysis", "positioning", "brand-strategy", "battlecard"],
        }, m3Info),
        assignAgentToStep({
          order: 4, name: "????閮剛?",
          description: "??osp_marketing_tools Value Map Generator 蝜芾ˊ???冽嚗?憿?蝔晞???蝯???恥?嗆?蝔?憿??菔??遣蝡??????銝剔??ategory King?漣璅?,
          tool: "osp_marketing_tools",
          outputType: "category_blueprint",
          requiredSkills: ["category-design", "brand-strategy", "market-creation", "gtm"],
        }, leadInfo),
        assignAgentToStep({
          order: 5, name: "????批捆蝑",
          description: "閮剛?霈??撣???箏?憿誨閮鈭箇??批捆閮?嚗?格銝駁???雓?鈭摰Ｚ降蝔inkedIn 蝟餃????璅?霈?擃???撣怎雿???隤??勗?撣??,
          tool: "internal",
          outputType: "thought_leadership_content_plan",
          requiredSkills: ["thought-leadership", "content-strategy", "narrative", "brand-voice"],
        }, m2Info),
        assignAgentToStep({
          order: 6, name: "????蝟餉???,
          description: "霅瞏??????鈭箝?雿丰隡氬??刻冗蝢歹??勗?撱箇?????蝟颯身閮?憿?憯?霅???蝷曄黎瘣餃?霈?憿?????,
          tool: "internal",
          outputType: "ecosystem_strategy",
          requiredSkills: ["gtm", "partnership", "community", "go-to-market"],
        }, m4Info),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "??閮剛?摰?瘚?",
        description: "Category Design 銝郊瘜?摰儔???? ??撱箇??? POV ??蝡嗅??????????? ??????批捆 ????蝟餃遣蝡??????喲?",
        steps: cdpSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "??閮剛?摰?撠?",
        description: "銝?Ｘ?撣蝡嗥隞賡?嚗?菟??? Category King???Madison 撣?弦?sp_marketing_tools ?????ctolens 蝡嗅???嚗身閮?憿?POV????批捆閮?嚗?慦????葦?其???閮摰儔撣??,
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "category-design",
        agents: members,
        tags: ["category-design", "category-creation", "thought-leadership", "brand-strategy", "market-creation", "gtm", "positioning", "strategy", "innovation", "b2b"],
        useCases: ["?啁??憿??, "?菜撣?脣蝑", "????批捆閬?", "蝡嗅??獢", "????蝟餃遣蝡?, "IPO ????雿?],
        outputFormats: ["PDF 蝑?勗?", "?? POV ?辣", "Google Slides 蝪∪", "YouTube 敶梁??單"],
        requiredIntegrations: [],
        token: 120000,
        showcases: [
          { company: "HubSpot", description: "?潭??nbound Marketing??憿?敺??脣摰嫘?霅?蝟餃蝷曄黎嚗???霈?銵鈭箇???", result: "撣潸???$270 ??? B2B 銵蝘???銋?", source: "Play Bigger, 2016" },
          { company: "Salesforce", description: "?菟蝡?CRM??憿?敹蛛??齒 No Software ??嚗??寞銝??唳??嗥奎??Siebel ?粹???銵?, result: "撣潸???$2,500 ???喃?隞 CRM ??摰儔??, source: "Harvard Business Review" },
          { company: "Red Bull", description: "?函４?賊ㄡ???游??菟?ㄡ??啣?憿????璅奎??, result: "?喃?隞??函??賡?憌脫?撣 ~40% 隞賡?", source: "Future Ventures Research" },
        ],
      });
    }

    // ?? 7. Mind Positioning嚗??箔?雿???Ries & Trout ?????????????????????????
    // Own the #1 position in the consumer's mind; being first beats being best
    {
      const slug     = "mind-positioning";
      const taskType = "mind-positioning";
      const used: number[] = [];

      const leadSkills = ["positioning", "brand-positioning", "brand-strategy", "mind-share", "market-leadership"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }
      const m2Skills = ["competitive-intelligence", "competitive-analysis", "competitor-research", "market-analysis"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }
      const m3Skills = ["messaging", "brand-voice", "copywriting", "brand-narrative"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }
      const m4Skills = ["advertising", "campaign-strategy", "media-planning", "ad-strategy"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "mind_positioning_strategist", order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "competitive_intelligence",     order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "messaging_architect",          order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "campaign_strategist",          order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const mpSteps = [
        assignAgentToStep({
          order: 1, name: "敹?啣???",
          description: "??octolens ??Madison MarketMind ???格?撣???箸０摮??????????乩???惇?改?瘨祥?牧?啣?憿洵銝??喳隤堆?霅撌脰◤雿??征蝻箇?敹雿蔭??,
          tool: "octolens",
          outputType: "mind_ladder_map",
          requiredSkills: ["competitive-intelligence", "market-research", "brand-positioning", "mind-share"],
        }, m2Info),
        assignAgentToStep({
          order: 2, name: "璇臬?雿蔭??",
          description: "??marketing-strategy-pmm 蝡嗅???撌亙蝜芾ˊ???箸０摮?蝚砌?????雿?暻潔?蝵殷?蝚砌???蝑?航??券??臬?摰?嚗?隡唬?????瘨祥???箔葉????,
          tool: "marketing-strategy-pmm",
          outputType: "ladder_position_analysis",
          requiredSkills: ["competitive-analysis", "positioning", "brand-strategy", "market-leadership"],
        }, m2Info),
        assignAgentToStep({
          order: 3, name: "?詨?撅祆折??,
          description: "?豢?銝???芾◤蝡嗅?摰雿??敹惇?改??漲???具予?嗚?售佗?嚗Ⅱ靽惇?批??函????銝??賜?甇????? osp_marketing_tools 撽?撅祆抒????梢陷摨艾?,
          tool: "osp_marketing_tools",
          outputType: "core_attribute_selection",
          requiredSkills: ["brand-strategy", "positioning", "brand-voice", "differentiation"],
        }, leadInfo),
        assignAgentToStep({
          order: 4, name: "蝡嗅???雿???,
          description: "閮剛???摰?蝡嗅????伐?憒?Avis ??We Try Harder??-Up ??Uncola嚗??輯?雿??舐洵銝嚗??洵銝??蝵桅??啣?蝢抬?霈??惇?扳?????曉??蝚砌???璈?雿蔭??,
          tool: "marketing-strategy-pmm",
          outputType: "repositioning_strategy",
          requiredSkills: ["positioning", "brand-strategy", "competitive-analysis", "copywriting"],
        }, leadInfo),
        assignAgentToStep({
          order: 5, name: "摰??脫?????,
          description: "?啣神蝚血????箔?雿???摰??脫?嚗銝撅祆扼扔摨行??啜甇抒儔? osp_marketing_tools Value Map Generator 蝣箔?閮銝?湔改?撱箇???楝?絞銝摰?隤???,
          tool: "osp_marketing_tools",
          outputType: "positioning_statement",
          requiredSkills: ["messaging", "copywriting", "brand-voice", "positioning"],
        }, m3Info),
        assignAgentToStep({
          order: 6, name: "敹撘瑕?慦?閮?",
          description: "閮剛?霈??箔?雿?蝥撥??慦?蝑嚗鈭?擃恣?????啣?格??敹銝剜??乩??惇?改?閮剛????批撥??撱??閮蝭憟?,
          tool: "internal",
          outputType: "mind_reinforcement_media_plan",
          requiredSkills: ["advertising", "media-planning", "campaign-strategy", "ad-strategy"],
        }, m4Info),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "敹雿?摰?瘚?",
        description: "Ries & Trout 敹摰??剜郊瘜?敹?啣??? ??璇臬??? ??撅祆折????蝡嗅???雿???摰??脫? ??慦?敹撘瑕?",
        steps: mpSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "敹雿?摰?撠?",
        description: "??Ries & Trout 敹摰?瘜??冽?鞎餉??箔葉?嗡???擐????octolens 蝡嗅????adison MarketMind 敹???arketing-strategy-pmm 蝡嗅???嚗??亙??箸０摮征蝻綽?閮剛???雿??亥?銝?湔扯??荔?霈??????箏?憿誨????,
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "mind-positioning",
        agents: members,
        tags: ["mind-positioning", "brand-positioning", "competitive-strategy", "ries-trout", "market-leadership", "brand-strategy", "messaging", "positioning", "strategy", "b2b"],
        useCases: ["?嗅???敹蝚砌???, "??撣?摰?", "蝡嗅???雿???, "B2B ??敹雿?", "撱??閮銝?湔?, "敹璇臬???"],
        outputFormats: ["PDF 蝑?勗?", "Google Slides 蝪∪", "撱??閮獢"],
        requiredIntegrations: [],
        token: 65000,
        showcases: [
          { company: "Avis", description: "?輯??芸楛?舐?頠洵鈭?嚗?e Try Harder????霈??芸嚗??啣?雿?Hertz ?箝皛輻?蝚砌???, result: "Avis 擐活頧?箇?嚗誨???箏誨?蝬獢?", source: "Positioning: The Battle for Your Mind, Ries & Trout" },
          { company: "7-Up", description: "隞乓ncola??雿 Coke/Pepsi ?砥雿??箸０摮????冽?鞎餉??箔葉雿??璅隞????蝵?, result: "?琿?憿航???嚗??撌券憭曄葦銝剖遣蝡?孵??箔?蝵?, source: "Ries & Trout Original Case" },
          { company: "AWS", description: "?蝡臬蝷身?賜洵銝???箔?雿?蝥撥??霈??脩奎?剛?Azure?CP嚗偶?蕭頞?, result: "?喃?隞?函??脩垢撣????撣?頞? 30%", source: "Gartner Cloud Report 2024" },
        ],
      });
    }

    // ?? 8. JTBD Positioning嚗遙????雿?????????????????????????????????????
    // Position around the "job" customers hire your product to do, not demographics
    {
      const slug     = "jtbd-positioning";
      const taskType = "jtbd-positioning";
      const used: number[] = [];

      const leadSkills = ["jobs-to-be-done", "jtbd", "customer-research", "user-research", "product-marketing"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }
      const m2Skills = ["qualitative-research", "interview-analysis", "customer-insights", "consumer-insights"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }
      const m3Skills = ["product-positioning", "product-marketing", "pmm", "gtm"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }
      const m4Skills = ["messaging", "copywriting", "brand-voice", "content-strategy"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "jtbd_strategist",         order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "interview_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "product_positioning",      order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "jtbd_messaging_writer",    order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const jtbdSteps = [
        assignAgentToStep({
          order: 1, name: "隞餃???嚗ob Mapping嚗?,
          description: "??Madison Synthetic Persona Agents ??MarketMind Research 璅⊥摰Ｘ???具????嚗??摰?隞暻潭憭抒?隞餃?嚗孛?潮??臭?暻潘????絲靘隞暻潭見摮?撱箇? Job Map嚗?憪???皞? ???瑁? ??蝯?嚗?,
          tool: "madison-market-research",
          outputType: "job_map",
          requiredSkills: ["jobs-to-be-done", "jtbd", "customer-research", "qualitative-research"],
        }, m2Info),
        assignAgentToStep({
          order: 2, name: "Switch Interview ??",
          description: "璅⊥摰Ｘ敺??寞????唬????????鈭???嚗??Push????Pull???Anxiety????Habit嚗????亙鈭?Job 撌脫?頞喳?撘瑞???撽????芯???閬??脯?,
          tool: "madison-market-research",
          outputType: "switch_analysis",
          requiredSkills: ["jtbd", "customer-research", "behavioral-analysis", "user-research"],
        }, m2Info),
        assignAgentToStep({
          order: 3, name: "蝡嗥?蹂誨??摰儔",
          description: "銝??喟絞銵平??摰儔蝡嗅?嚗?恥?嗡??其????嚗??隞暻澆???銝??Job????marketing-strategy-pmm ICP 撌亙??octolens ?曉?迤?遙?隞??嚗?賣摰銝?銵平?????,
          tool: "marketing-strategy-pmm",
          outputType: "job_based_competitor_map",
          requiredSkills: ["competitive-analysis", "jtbd", "market-research", "product-marketing"],
        }, m3Info),
        assignAgentToStep({
          order: 4, name: "JTBD 摰??脫?",
          description: "?? Job 撖怠?雿??銝鈭箏蝯梯?嚗??嚗?? [??] ??[?格?摰Ｘ] ? [?Ｗ?] 靘?[摰?隞餃?]嚗??箏??臬銝??[撌桃暺 ?獢 osp_marketing_tools Value Map Generator 撽? Job ????撠?????,
          tool: "osp_marketing_tools",
          outputType: "jtbd_positioning_statement",
          requiredSkills: ["positioning", "jtbd", "copywriting", "brand-strategy"],
        }, leadInfo),
        assignAgentToStep({
          order: 5, name: "隞餃?撽?閮獢",
          description: "??marketing-strategy-pmm PMM 撌亙撱箇???楝?絞銝閮獢嚗?蝬脰??憛誨??憿?株店銵??券?? Job ????寞扳??鈭箏蝯梯???,
          tool: "marketing-strategy-pmm",
          outputType: "jtbd_messaging_framework",
          requiredSkills: ["messaging", "pmm", "content-strategy", "gtm"],
        }, m4Info),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "隞餃?撠?摰?瘚?",
        description: "JTBD 摰?鈭郊瘜?隞餃??? ??閫貊暺??????蹂誨?寞?霅 ??隞餃??脫? ????隞餃????舀???,
        steps: jtbdSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "隞餃?撠?摰?撠?",
        description: "銝?鞈港犖??絞閮??橘????摰Ｘ?迤???具????隞餃?嚗ob嚗???隞餃???雿??Madison ??閮芾??弦?arketing-strategy-pmm ICP ???舀??嗚sp_marketing_tools ??撽?嚗遣蝡?憓???摰??脫??楊?楝閮銝?湔扼?,
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "jtbd",
        agents: members,
        tags: ["jtbd", "jobs-to-be-done", "customer-research", "product-positioning", "product-marketing", "positioning", "strategy", "b2b", "saas", "innovation"],
        useCases: ["?啁??雿???, "B2B SaaS ?摰?", "摰Ｘ?弦撽?閮", "?Ｗ??菜?孵?撽?", "Landing Page ?芸?", "?瑕閰梯?撱箇?"],
        outputFormats: ["PDF 蝑?勗?", "Google Slides 蝪∪", "JTBD Job Map"],
        requiredIntegrations: ["google-analytics"],
        token: 75000,
        showcases: [
          { company: "McDonald's", description: "??圾憟嗆???Job嚗??舐?暺???頝臭??擗隞????蝜?Job 隤踵?Ｗ?嚗瞈????嚗?銵閮", result: "憟嗆??琿?憿航???嚗???JTBD ???撱??撘??靘?, source: "Clayton Christensen, Forbes" },
          { company: "FedEx", description: "摰儔 Job ?箝??閬??镼踹??ㄐ隞交?敹恍漲?憸券???ㄐ???游???蝜遙?遣蝡?, result: "???敹恍? Job ?誨??嚗遣蝡?憿?撠雿?, source: "Clayton Christensen JTBD Framework" },
          { company: "Snickers", description: "?曉?迤??Job嚗?擗????撌梧??閬翰???唳?雿喟????ou're not you when you're hungry??蝜?Job 摰?", result: "??函???ａ撌批???銋?嚗??臬 80+ ???湔?蝥???, source: "Mars Inc. Marketing Case" },
        ],
      });
    }

    // ?? 9. Purpose-Driven Positioning嚗????雿???????????????????????????
    // Use the brand's social mission and values as the core positioning driver
    {
      const slug     = "purpose-driven-positioning";
      const taskType = "purpose-driven-positioning";
      const used: number[] = [];

      const leadSkills = ["purpose-driven", "brand-purpose", "csr", "sustainability", "social-impact", "brand-strategy"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }
      const m2Skills = ["brand-voice", "storytelling", "content-strategy", "brand-narrative", "copywriting"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }
      const m3Skills = ["campaign-strategy", "social-media", "influencer", "community", "dtc"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }
      const m4Skills = ["consumer-insights", "customer-research", "audience-analysis", "market-research"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "purpose_strategist",      order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_narrator",          order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "campaign_strategist",     order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "audience_analyst",        order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const pdpSteps = [
        assignAgentToStep({
          order: 1, name: "雿踹?祕?抒里??,
          description: "??Madison MarketMind Research ??octolens ????甇瑕???CSR 瘣餃????改??曉???祕?賬???蝷暹?雿踹???purpose washing?????舫?霅?銵??舀??脫???,
          tool: "madison-market-research",
          outputType: "purpose_authenticity_audit",
          requiredSkills: ["brand-purpose", "csr", "brand-strategy", "sustainability"],
        }, m4Info),
        assignAgentToStep({
          order: 2, name: "?格???孵潸?撠?",
          description: "??Madison Synthetic Persona Agents 撱箇??格????潸??啣?嚗???敹?暻潛冗?降憿?隞暻潔蝙?賣?霈??蜓???嚗 marketing-strategy-pmm ICP 蝣箄? Purpose ??Ideal Customer ?漱??,
          tool: "marketing-strategy-pmm",
          outputType: "purpose_audience_alignment_map",
          requiredSkills: ["consumer-insights", "audience-analysis", "brand-purpose", "market-research"],
        }, m4Info),
        assignAgentToStep({
          order: 3, name: "Purpose ?脫?撱箇?",
          description: "??osp_marketing_tools Value Map Generator 撱箇?銝惜 Purpose ?嗆?嚗hat嚗???暻潘???How嚗??獐????Why嚗隞暻潮辣鈭?閬?瘥竟?Ｘ?????梧??Ⅱ靽?Purpose 憭擃銵??銵⊿???,
          tool: "osp_marketing_tools",
          outputType: "brand_purpose_statement",
          requiredSkills: ["brand-purpose", "copywriting", "brand-strategy", "storytelling"],
        }, leadInfo),
        assignAgentToStep({
          order: 4, name: "雿踹撽???閮剛?",
          description: "閮剛?霈?鞎餉??仿????頃鞎瑞??????獢?撘??梢?銝???瘨祥?????航釵?質遣蝡?Manifesto?ignature Campaign 璁艙嚗? Patagonia / Nike 憸冽嚗?,
          tool: "osp_marketing_tools",
          outputType: "purpose_narrative_manifesto",
          requiredSkills: ["storytelling", "brand-narrative", "campaign-strategy", "brand-voice"],
        }, m2Info),
        assignAgentToStep({
          order: 5, name: "?券楝 Purpose ?游?",
          description: "蝣箔? Purpose 鞎怎忽??孛暺??Ｗ?????蝬?About ?冗蝢方票??隤踴誨??憿恥?店銵身閮餈質馱?蝙?賣?璅??支??瑕嚗???暻潭摮霅? Purpose ?函?桐??剁???,
          tool: "marketing-strategy-pmm",
          outputType: "purpose_integration_playbook",
          requiredSkills: ["omnichannel", "content-strategy", "brand-voice", "campaign-strategy"],
        }, m3Info),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "?桃?撠?摰?瘚?",
        description: "Purpose-Driven 摰?鈭郊瘜?雿踹?祕?抒里?????格???孵潸?撠? ??Purpose ?脫? ??雿踹撽??? ???券楝?游?",
        steps: pdpSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "?桃?撠?摰?撠?",
        description: "隞亙??冗?蝙?賜?詨?摰?撽???霈?鞎餉?隤???????Madison ??孵潸??弦?sp_marketing_tools Purpose 獢?arketing-strategy-pmm 閮?游?嚗遣蝡?撖血撽???Brand Purpose?anifesto ????楝 Purpose ?游?????,
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "purpose-driven",
        agents: members,
        tags: ["purpose-driven", "brand-purpose", "csr", "sustainability", "social-impact", "brand-strategy", "dtc", "gen-z", "storytelling", "campaign"],
        useCases: ["DTC ??撌桃??, "撟渲?????梢陷", "ESG ??蝑", "????雿踹摰??", "Manifesto Campaign 璁艙", "隡平蝷暹?鞎砌遙銵"],
        outputFormats: ["PDF 蝑?勗?", "Google Slides 蝪∪", "Brand Manifesto", "YouTube 敶梁??單", "LINE ?澈??],
        requiredIntegrations: [],
        token: 85000,
        showcases: [
          { company: "Patagonia", description: "?on't Buy This Jacket??瘨祥撱??嚗???雿踹嚗憓偶蝥????潛??殷??祕銵??舀? Purpose嚗耨?﹝閮???% for the Planet嚗?, result: "撱??銝?敺?撟渡??嗆???30%嚗??摯?潮? $30 ??, source: "LinkedIn / Matt Vanderlinden" },
          { company: "Nike", description: "?ream Crazy?olin Kaepernick 撱??嚗瘜冽?詨??嚗???僑頛?蝢歹???潸?嚗?霅圈◢??, result: "???孵澆???$60 ??銝?敺?銝?桀???31%", source: "MarkHub24 Brand Analysis" },
          { company: "Dove", description: "?eal Beauty?蝙?踝?霈?雿戊?扯??箄撌梁?暻??湔?蝢?銵平?蝯梁?暻?皞?, result: "?典?撣?瑕?游? 700%嚗遣蝡????20 撟渡?撌桃??雿?, source: "M Accelerator Case Study" },
        ],
      });
    }

    // ?? 10. Brand Archetype Positioning嚗?????雿?????????????????????????
    // Use Jung's 12 archetypes to unify brand voice, visuals, and experience
    {
      const slug     = "brand-archetype-positioning";
      const taskType = "brand-archetype-positioning";
      const used: number[] = [];

      const leadSkills = ["brand-archetype", "brand-identity", "brand-personality", "jungian", "brand-strategy"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }
      const m2Skills = ["brand-voice", "tone-of-voice", "brand-narrative", "copywriting", "content-strategy"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }
      const m3Skills = ["visual-identity", "creative-direction", "design-strategy", "brand-design"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }
      const m4Skills = ["consumer-insights", "audience-analysis", "brand-perception", "market-research"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "archetype_strategist",   order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_voice_specialist",  order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "creative_director",       order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "brand_perception_analyst",order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const bapSteps = [
        assignAgentToStep({
          order: 1, name: "?暹???鈭箸閮箸",
          description: "??octolens ?砍????Ｘ?皞???摰雯???冗蝢方票?誨??嚗adison MarketMind ??瘨祥???????交?餈啗?嚗那?瑕????批??曄????臭?暻潘?隞亙????????賢榆??,
          tool: "octolens",
          outputType: "brand_personality_audit",
          requiredSkills: ["brand-archetype", "brand-identity", "brand-perception", "competitive-analysis"],
        }, m4Info),
        assignAgentToStep({
          order: 2, name: "???豢?????,
          description: "?箸??雿踹?璅??曉???瘙奎?????敺?Jung 12 ??銝剝?蜓??嚗rimary嚗?頛??嚗econdary嚗??奎?歇撘瑕雿????遣蝡?????望??,
          tool: "marketing-strategy-pmm",
          outputType: "archetype_selection_rationale",
          requiredSkills: ["brand-archetype", "brand-strategy", "brand-identity", "jungian"],
        }, leadInfo),
        assignAgentToStep({
          order: 3, name: "???脤??",
          description: "??osp_marketing_tools Brand Voice Generator 撱箇?隞亙???詨?????單????刻?摨恬?摰 / 蝳嚗摮?瑽?憟賬?蝺隤踴??楝隤矽敺株矽嚗?蝬?vs 蝷曄黎 vs 撱?? vs 摰Ｘ?嚗?,
          tool: "osp_marketing_tools",
          outputType: "brand_voice_guide",
          requiredSkills: ["brand-voice", "tone-of-voice", "copywriting", "brand-narrative"],
        }, m2Info),
        assignAgentToStep({
          order: 4, name: "閬死??撽??,
          description: "?寞????寡釭?嗅?閬死?孵?嚗??脩頂蝯晞??扼?敶梢◢?潦??Ｗ?憟賬遣蝡?撽身閮????Ｗ?????蝬?UX??撣征??憒?剁????????靘?Moodboard ?孵???,
          tool: "internal",
          outputType: "visual_experience_direction",
          requiredSkills: ["visual-identity", "creative-direction", "brand-design", "design-strategy"],
        }, m3Info),
        assignAgentToStep({
          order: 5, name: "?券楝??銝?湔抒里??,
          description: "??marketing-strategy-pmm 閮銝?湔批極?瘀?蝔賣???孛暺???銝?湔扼遣蝡???????皞?霈?蝥?????質?里?豢?衣泵???犖?潦?,
          tool: "marketing-strategy-pmm",
          outputType: "archetype_consistency_audit",
          requiredSkills: ["brand-strategy", "omnichannel", "brand-voice", "content-strategy"],
        }, leadInfo),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "????摰?瘚?",
        description: "Brand Archetype 鈭郊瘜??暹???鈭箸閮箸 ?????豢??????????脤?? ??閬死??撽?????券楝??銝?湔?,
        steps: bapSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "????摰?撠?",
        description: "隞?Jung 敹?摮?12 ??蝯曹?????喋?閬箄?擃?嚗?鈭箸撅日撱箇?瘛勗漲??鞎餉???????octolens ???蝔賣?sp_marketing_tools ???脤獢?arketing-strategy-pmm 閮銝?湔改?頛詨???豢???詻???單????券楝銝?湔扳???,
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "brand-archetype",
        agents: members,
        tags: ["brand-archetype", "brand-identity", "brand-personality", "brand-voice", "visual-identity", "jungian", "brand-strategy", "rebranding", "creative", "omnichannel"],
        useCases: ["????鈭箸閮剖?", "?券楝???脤蝯曹?", "?啣??犖?澆遣蝡?, "閬死霅?孵??嗅?", "?菜?蝑??", "??隞??鈭粹????],
        outputFormats: ["PDF 蝑?勗?", "???脤??", "Google Slides 蝪∪", "閬死?孵? Moodboard"],
        requiredIntegrations: [],
        token: 70000,
        showcases: [
          { company: "Nike", description: "Hero ??銝?湔扯疵蝛?30 撟湔???Campaign嚗ust Do It?ream Crazy?ind Your Greatness嚗??誨?撘瑕??梢???", result: "撟渡??嗅? 1988 撟?$8.77 ???瑕 1998 撟?$92 ????函????潮?????, source: "Nike Annual Reports" },
          { company: "Old Spice", description: "Jester + Hero 瘛瑕?????????嚗he Man Your Man Could Smell Like 蝟餃?憿??瑟抒?摰孵?憿?, result: "銝????body wash ?瑕憌撞 107%嚗??? 3% 蝧餃 6%嚗?017 撟渡蜇?頞? $10 ??, source: "M Accelerator / Procter & Gamble" },
          { company: "Apple", description: "Creator ??銝?湔改?Think Different?身閮銝?銝????瘜?鈭箝?閬死???桀?函絞銝", result: "??函??擃??澆?????敹?摨阡??撅?銵平蝚砌?", source: "Interbrand Best Global Brands" },
        ],
      });
    }


    // ????????????????????????????????????????????????????????????????????    // CATEGORY A: Facebook/Meta 撱?? Methodology Squads (A1?10)
    // ????????????????????????????????????????????????????????????????????
    // A1: Gary Vaynerchuk ??Jab, Jab, Jab, Right Hook (2013)
    {
      const slug = "fb-garyvee-jab-hook";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["paid-ads", "brand-dna"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["paid-ads", "jab-right-hook", "facebook-content-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["hook-copywriter", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "jab-content-creation"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-content-creator", "visual-ad-brief"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "native-creative"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["marketing-analytics", "meta-ads-paid-ads"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-analytics", "fb-campaign-optimization"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Jab ?批捆蝑閬?", description: "靘?GaryVee 獢閮剛? 3 頛?Jab ?批捆嚗??脣???璅?????嚗遣蝡??曆縑隞鳴?銝?曆遙雿?株???, tool: "internal", outputType: "jab_content_calendar", requiredSkills: ["paid-ads", "brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Jab 鞎潭????啣神", description: "?箸???Jab 憿??啣神???撥??Facebook ??嚗?蝎寞?靘?潘???憸冽鞎潸??犖?澈??撱??", tool: "internal", outputType: "jab_post_copy", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Jab 閬死蝝?鋆賭?", description: "鋆賭???Facebook ??瘚?????閬死嚗?憭批???閫詨?????", tool: "internal", outputType: "jab_creative_assets", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "Right Hook 撱???箸?", description: "?典??策鈭?蝎暹??箸?嚗?頧? Right Hook 撱??嚗?亥?瘙???鞈潸眺/?勗?/銝?嚗??剝??芾??????, tool: "internal", outputType: "right_hook_ad_set", requiredSkills: ["paid-ads", "marketing-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "蝷曄黎蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "??撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "閬死閮剛?撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "撱???撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GaryVee Jab Jab Jab Right Hook Facebook 蝑", description: "Source: Gary Vaynerchuk?ab, Jab, Jab, Right Hook??013. VaynerMedia ?甇斗??嗥?曉??日??蝣抒???撣嗡?鈭?????400%", steps });
      await upsertSquad(conn, { slug, name: "GaryVee Jab Jab Right Hook Facebook 蝑撠?", description: "? 3 甈∪?澆摰對?Jab嚗遣蝡縑隞鳴??移皞???Right Hook嚗????ary Vaynerchuk 2013 撟游?璆剝?霅???, industryKey: "marketing", missionType: taskType, workspace: ["facebook-ads"], methodology: "Gary Vaynerchuk ??Jab, Jab, Jab, Right Hook (2013)", agents: agentMembers, tags: ["facebook", "content-marketing", "paid-ads", "social-media"], useCases: ["??蝷曄黎皞怎", "?餃?Facebook靽", "瘣餃??勗??典誨"], outputFormats: ["Facebook鞎潭???", "撱??蝝?憟?", "??勗?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "?曉??日?嚗udweiser嚗ia VaynerMedia", description: "? Jab 獢嚗?0% ?批捆?箇??孵潛策鈭?30% ??Right Hook 靽", result: "Facebook 鈭?????400%嚗誨?????祇?雿?45%", source: "VaynerMedia Case Studies / Jab Jab Jab Right Hook (2013)" }, { company: "Gary Vaynerchuk ?犖??", description: "?瑟??瑁? Give First 蝑嚗?,000+ ?交?憭拙 Facebook/YouTube 頛詨?祥?批捆", result: "蝝舐? 900 ?? Facebook 蝎結嚗aynerMedia 撟渡??嗉???$2.5 ??, source: "GaryVee.com / Inc. Magazine 2022" }] });
    }

    // A2: Eugene Schwartz ??Breakthrough Advertising Awareness Levels (1966)
    {
      const slug = "fb-schwartz-awareness";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["ad-copywriting-formulas", "copywriting-pro"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["ad-copywriting-formulas", "schwartz-awareness-levels"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "mbb-strategist"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "audience-awareness-mapping"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["hook-copywriter", "paid-ads"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["hook-copywriter", "awareness-based-messaging"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["visual-ad-brief", "visual-content-creator"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["visual-ad-brief", "cold-warm-hot-creative"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const m5Id = await findAgent(conn, ["attribution-modeling", "marketing-analytics"], usedIds);
      if (m5Id) { usedIds.push(m5Id); await assignSkillsToAgent(conn, m5Id, ["attribution-modeling", "funnel-stage-analytics"]); }
      const m5Info = await getAgentInfo(conn, m5Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "???撅斤?閮箸", description: "???格??? 5 ??霅?畾萇??芯?撅歹?摰銝???????圾瘙箸獢?霅??Ｗ???????", tool: "internal", outputType: "awareness_level_map", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "?惜撱??閮?嗆?", description: "?箸???霅惜蝝身閮?撅祈??舀瑽??瑕??曄???曇絲?澈?瘥??寞????湔靽頃", tool: "internal", outputType: "layered_message_framework", requiredSkills: ["ad-copywriting-formulas"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "?惜撱?????啣神", description: "??霅惜蝝撖?5 憟誨??獢?Hook 撘瑕漲敺??扳??聆?撘瑕?靽?郊??", tool: "internal", outputType: "layered_ad_copy", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 4, name: "?惜?菜?蝝?鋆賭?", description: "?箏/皞??勗??曇ˊ雿??閬粹◢?潘?????澈=瘥??=蝺翰??, tool: "internal", outputType: "awareness_creatives", requiredSkills: ["visual-ad-brief"] }, m4Info),
        assignAgentToStep({ order: 5, name: "瞍?甇詨??芸?", description: "閮剖???霅惜餈質馱??鈭辣嚗皜砍??曉瞍?銝剔?蝘餃?嚗?蝥??撅文誨??, tool: "internal", outputType: "awareness_funnel_report", requiredSkills: ["attribution-modeling"] }, m5Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "撱????撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "??弦撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Hook ??撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "撱??蝝?撣?, order: 4 },
        { agent_id: m5Id, is_lead: false, role: "甇詨???撣?, order: 5 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Eugene Schwartz ??撅斤? Facebook 撱??獢", description: "Source: Eugene Schwartz?reakthrough Advertising??966. Agora Publishing ?甇斗??嗅僑?萇?誨???嗉???$10 ??, steps });
      await upsertSquad(conn, { slug, name: "Schwartz ??撅斤? Facebook 撱??撠?", description: "靘?Eugene Schwartz 5 撅斗?霅??塚??箔????仿?畾萄??暹??曄移皞誨???踹?撠?靽???勗??曉雓???, industryKey: "marketing", missionType: taskType, workspace: ["facebook-ads"], methodology: "Eugene Schwartz ??Breakthrough Advertising Awareness Levels (1966)", agents: agentMembers, tags: ["facebook", "paid-ads", "copywriting", "funnel"], useCases: ["?啣????", "???誨??, "擃恥?桀B2C撱??"], outputFormats: ["?惜撱????憟?", "撱??蝝???, "瞍?甇詨??勗?"], requiredIntegrations: [], token: 65000, showcases: [{ company: "Agora Publishing", description: "?? 50+ ?箇???蝥???Schwartz 獢?啣神撱????嚗?撠???霅惜蝎暹??", result: "撟渡??嗥???$10 ???湔?撱?? ROAS ?瑕僑蝬剜? 4-8x", source: "Agora Financial / Breakthrough Advertising (Schwartz 1966)" }, { company: "ClickFunnels", description: "Russell Brunson ?祇??輯? Schwartz ??獢?臬撱??蝑?詨?", result: "ClickFunnels ??3 撟游? $1 ??ARR嚗acebook 撱?? CPA ?芸? 60%", source: "Russell Brunson?raffic Secrets??020" }] });
    }

    // A3: Ryan Deiss (DigitalMarketer) ??Customer Value Optimization (2015)
    {
      const slug = "fb-deiss-cvo";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["campaign-orchestrator", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["campaign-orchestrator", "customer-value-optimization"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["paid-ads", "meta-ads-paid-ads"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["paid-ads", "tripwire-offer-ads"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["hook-copywriter", "ad-copywriting-formulas"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["hook-copywriter", "oto-upsell-copy"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["email-marketing", "remarketing-strategy"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["email-marketing", "ascension-sequence"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Lead Magnet 閮剛?", description: "閮剛?擃??亙?澆?鞎餃?嚗ead Magnet嚗?閫?捱??桐???嚗???Email/?舐窗鞈?", tool: "internal", outputType: "lead_magnet_brief", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Tripwire 雿?瑼餌?身摰?, description: "閮剛? $1-$20 雿?瑼餃??Ｗ?嚗?瞏恥敺赤摰Ｚ??箔?鞎駁“摰ｇ?瘨敹?瘨祥?瑼?, tool: "internal", outputType: "tripwire_offer", requiredSkills: ["paid-ads"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Core Offer 銝餃??Ｗ?撱??", description: "?啣神銝餃??Ｗ?撱????嚗?撠歇鞈潸眺 Tripwire ?“摰Ｗ?銵嚗????虜?? 3-5 ??, tool: "internal", outputType: "core_offer_ad", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 4, name: "Profit Maximizer OTO 閮剛?", description: "閮剛?鞈潸眺敺??喳?曄??頃/???寞?嚗TO嚗??憭批?瘥?閮?孵潘?AOV嚗?, tool: "internal", outputType: "oto_upsell_flow", requiredSkills: ["ad-copywriting-formulas"] }, m3Info),
        assignAgentToStep({ order: 5, name: "Return Path ?頃摨?", description: "閮剛? Email ?芸???鞈澆??????????孵潸?憿批恥??鞈潸眺嚗???LTV", tool: "internal", outputType: "return_path_email_sequence", requiredSkills: ["email-marketing"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "CVO 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "撱???撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "??撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "Email 銵撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ryan Deiss Customer Value Optimization Facebook 瞍?", description: "Source: Ryan Deiss / DigitalMarketer?ustomer Value Optimization??015. DigitalMarketer ?甇斗??嗅閮???100 ?祈??瑚犖嚗頨怠僑?嗅頞? $20M", steps });
      await upsertSquad(conn, { slug, name: "Deiss CVO Facebook 瞍?撠?", description: "? DigitalMarketer ??Customer Value Optimization 獢嚗? Lead Magnet ??Tripwire ??Core Offer ??OTO ??Return Path 摰?芸?憿批恥蝯??孵?, industryKey: "marketing", missionType: taskType, workspace: ["facebook-ads"], methodology: "Ryan Deiss / DigitalMarketer ??Customer Value Optimization (2015)", agents: agentMembers, tags: ["facebook", "funnel", "cvo", "paid-ads", "email"], useCases: ["?餃??冽????, "蝺?隤脩??瑕瞍?", "SaaS ?祥閰衣頧?鞎?], outputFormats: ["瞍?蝑??, "撱????憟?", "Email 摨?", "OTO ???"], requiredIntegrations: [], token: 70000, showcases: [{ company: "DigitalMarketer ?芾澈", description: "? CVO 獢嚗誑 $7 Tripwire ?脣?憿批恥嚗??? Core Offer ????$997 隤?隤脩?", result: "撟渡??嗉???$20M嚗飛?∟???100 ?穿?Facebook 撱?? ROAS 蝛拙???4-6x", source: "DigitalMarketer.com / Ryan Deiss ?祇?瞍? Traffic & Conversion Summit" }, { company: "Agora Financial", description: "?∠ Tripwire + Ascension 璅∪??瑕鞎∪??箇???, result: "撟渡??嗉???$10 ??憿批恥 LTV ?舀平?像?? 3 ??, source: "Inc. Magazine / Agora Publishing Annual Reports" }] });
    }

    // A4: Perry Marshall ??80/20 Sales and Marketing Facebook Method (2013)
    {
      const slug = "fb-marshall-8020";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-analytics", "mbb-strategist"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-analytics", "8020-marketing-analysis"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["lookalike-audience-strategy", "paid-ads"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["lookalike-audience-strategy", "top20-audience-targeting"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["smart-bidding-strategy", "attribution-modeling"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["smart-bidding-strategy", "bid-optimization-8020"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "80/20 憿批恥??", description: "霅?菟?80% ???蝡?20% 憿批恥嚗??鈭箏?孵噩???箸芋撘頃鞎瑁孛?潮?", tool: "internal", outputType: "top20_customer_profile", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "80/20 ?蝎暹???", description: "隞?Top 20% 憿批恥撱箇? Lookalike ?嚗蒂?雿?潸赤摰ｇ??誨??蝞?銝剜??暸?瞏??", tool: "internal", outputType: "precision_audience_set", requiredSkills: ["lookalike-audience-strategy"] }, m2Info),
        assignAgentToStep({ order: 3, name: "擃?澆誨??鞈???, description: "靘?80/20 ???芸??箏蝑嚗?擃????暹?擃?對?撠?頧??????嚗?憭批? ROAS", tool: "internal", outputType: "optimized_campaign_portfolio", requiredSkills: ["smart-bidding-strategy"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "80/20 ??撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?蝑撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "蝡嗅?芸?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Perry Marshall 80/20 Facebook 撱?????憭批?", description: "Source: Perry Marshall??0/20 Sales and Marketing??013. Marshall ??Google AdWords ??拇?憭批葦嚗 80/20 ?寞?撟怠?詨?摰嗡?璆剖?撱?? ROAS ?? 2-4 ??, steps });
      await upsertSquad(conn, { slug, name: "Perry Marshall 80/20 Facebook 撱??撠?", description: "? Perry Marshall ??80/20 瘜?嚗?撱?????葉?典??憭批?潛? 20% ?垢?嚗之撟???ROAS", industryKey: "marketing", missionType: taskType, workspace: ["facebook-ads"], methodology: "Perry Marshall ??80/20 Sales and Marketing (2013)", agents: agentMembers, tags: ["facebook", "paid-ads", "audience-targeting", "8020"], useCases: ["撱???????芸?", "擃?寧?acebook撱??", "LTV-based??"], outputFormats: ["80/20 憿批恥???勗?", "?蝑?寞?", "蝡嗅?芸?閮剖?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Perry Marshall 摰Ｘ蝢歹?B2B SaaS嚗?, description: "? 80/20 ?蝭拚嚗?撱????敺??粹?銝剜???Top 20% 擃?澆???, result: "撱?? ROAS 敺?1.8x ????5.2x嚗??誨??箸?撠?30%", source: "Perry Marshall??0/20 Sales and Marketing??靘?蝭" }, { company: "Infusionsoft嚗 Keap嚗?, description: "Perry Marshall ?遙憿批?嚗???Infusionsoft 隞?80/20 ???遣 Facebook 撱???嗆?", result: "瞏恥?脣???? 55%嚗?璆剝???$1 ??ARR ??蝣?, source: "Keap.com History / Inc. Magazine" }] });
    }

    // A5: Dan Kennedy ??Magnetic Marketing (1992, updated 2018)
    {
      const slug = "fb-kennedy-magnetic";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "mbb-strategist"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "magnetic-marketing-framework"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["ad-copywriting-formulas", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["ad-copywriting-formulas", "kennedy-direct-response"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["market-research-agent", "brand-dna"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["market-research-agent", "ideal-client-avatar"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["paid-ads", "remarketing-strategy"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["paid-ads", "magnetic-media-buying"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "蝤閮摰儔嚗essage嚗?, description: "摰儔?Ⅱ????荔?雿??狐?圾瘙箔?暻澆?憿雿雿ennedy 閬?閮敹???撠?鈭箇瘜?????, tool: "internal", outputType: "magnetic_message", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?憿批恥?怠?嚗arket嚗?, description: "蝎曄Ⅱ摰儔?憿批恥嚗犖??敺萸??敺萸?擃?鞎餌???頃鞎瑁孛?潮?嚗遣蝡???ICA", tool: "internal", outputType: "ideal_client_avatar", requiredSkills: ["market-research-agent"] }, m3Info),
        assignAgentToStep({ order: 3, name: "?湔???撱????", description: "? Kennedy ?湔??????啣神 Facebook 撱??嚗撥??Headline + ?拍??? + 蝷暹?霅? + 蝺翰 CTA", tool: "internal", outputType: "direct_response_ad_copy", requiredSkills: ["ad-copywriting-formulas"] }, m2Info),
        assignAgentToStep({ order: 4, name: "慦??蝑嚗edia嚗?, description: "?豢?甇?Ⅱ慦?蝞⊿???雿??? ICA ??擃???身閮?Facebook ?蝑嚗Ⅱ靽??航孛???犖", tool: "internal", outputType: "media_strategy", requiredSkills: ["paid-ads"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "蝤銵蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?湔?????撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "??弦撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "慦??撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Dan Kennedy Magnetic Marketing Facebook 蝑", description: "Source: Dan Kennedy?agnetic Marketing??992嚗?018 撟湔?啁??KIC嚗ennedy 摮詨蝷曄黎嚗???25,000 ??璆凋蜓?甇斗??塚?撟喳??嗅?? 47%", steps });
      await upsertSquad(conn, { slug, name: "Kennedy Magnetic Marketing Facebook 撠?", description: "? Dan Kennedy ??Message-Market-Media 銝?獢嚗撘??恥?嗡蜓??餈???餈賡??犖", industryKey: "marketing", missionType: taskType, workspace: ["facebook-ads"], methodology: "Dan Kennedy ??Magnetic Marketing (1992/2018)", agents: agentMembers, tags: ["facebook", "direct-response", "paid-ads", "copywriting"], useCases: ["?砍?振Facebook撱??", "??璆剖恥?嗥??, "擃垢B2C撱??"], outputFormats: ["蝤閮摰儔??, "ICA ?辣", "撱????", "慦?蝑"], requiredIntegrations: [], token: 60000, showcases: [{ company: "GKIC嚗lazer-Kennedy 蝷曄黎嚗?5,000+ 隡平銝?, description: "? Magnetic Marketing 獢??撱??蝑嚗?撱???寧蝎暹?蝤", result: "?隡平撟喳??嗅?? 47%嚗誨??ROI ?? 200%+", source: "GKIC Annual Conference / No B.S. Marketing Newsletter" }, { company: "Magnetic Marketing ?砍?祈澈", description: "Russell Brunson ?嗉頃 Magnetic Marketing ??敺???Kennedy 獢", result: "??撟渡??嗉???$1 ??蝺?隤脩??瑕?蕃 3 ??, source: "Russell Brunson ?祇?閮芾? 2022" }] });
    }

    // A6: Alex Hormozi ??$100M Offers Facebook Strategy (2021)
    {
      const slug = "fb-hormozi-offer-first";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["hook-copywriter", "ad-copywriting-formulas"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["hook-copywriter", "grand-slam-offer-framework"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["paid-ads", "meta-ads-paid-ads"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["paid-ads", "offer-first-ad-strategy"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-ad-brief", "visual-content-creator"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-ad-brief", "proof-stack-creative"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Grand Slam Offer 閮剛?", description: "靘?Hormozi 獢撱箇??⊥?????對?憭Ｘ蝯? + 擃??亙??+ 雿??+ 撘瑕?靽??璅?霈犖閬箏???鞎瑟??Ｕ?, tool: "internal", outputType: "grand_slam_offer_doc", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Proof Stack 蝷暹?霅???", description: "?園?銝衣?蝜??冗????摰Ｘ閬??efore/after ?豢???靘?蝛塚?撱箇?銝???縑隞餌?", tool: "internal", outputType: "proof_stack", requiredSkills: ["paid-ads"] }, m2Info),
        assignAgentToStep({ order: 3, name: "撱?????A/B 皜祈岫", description: "隞?Grand Slam Offer ?箸敹???Facebook 撱??嚗葫閰虫???Headline ??Visual嚗?箸?擃?CTR/CVR 蝯?", tool: "internal", outputType: "fb_ad_test_results", requiredSkills: ["meta-ads-paid-ads"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Offer 閮剛?撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "撱???撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "蝝?閮剛?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Hormozi $100M Offers Facebook 撱??蝑", description: "Source: Alex Hormozi??100M Offers??021. Hormozi ?甇斗??嗉? Gym Launch ??6 ??? $1.7M/??伐?Acquisition.com ??隡平蝯?隡啣潸???$1 ??, steps });
      await upsertSquad(conn, { slug, name: "Hormozi $100M Offer Facebook 撠?", description: "???瘜?蝯? Grand Slam Offer嚗???Facebook 撱???游之閫賊??ffer 撠?嚗誨?祥?典隞仿?雿?60%+", industryKey: "marketing", missionType: taskType, workspace: ["facebook-ads"], methodology: "Alex Hormozi ??$100M Offers (2021)", agents: agentMembers, tags: ["facebook", "offer-design", "paid-ads", "conversion"], useCases: ["?亥澈????璆剖恥?嗥??, "蝺?隤脩??瑕", "擃?寞??誨??], outputFormats: ["Grand Slam Offer ?辣", "撱????蝯?", "A/B 皜祈岫?勗?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Gym Launch嚗ormozi ?菔齒嚗?, description: "隞?Grand Slam Offer??鞎餉身??+ 100% 靽????Facebook 撱???", result: "6 ??敺?$0 ? $1.7M/??擐僑??$17M", source: "Alex Hormozi??100M Offers?hapter 1 + YouTube 閮芾?" }, { company: "Acquisition.com ??蝯?", description: "??◤??隡平撘瑕?瑁? Offer-First 蝑敺?頝?Facebook 撱??", result: "撟喳?隡平隡啣潭???3-5 ??撱???脣恥??? 40-65%", source: "Acquisition.com 摰雯 / Hormozi ?祇? Podcast 2023" }] });
    }

    // A7: David Ogilvy ??Long-Copy Direct Response (Confessions of an Advertising Man, 1963)
    {
      const slug = "fb-ogilvy-long-copy";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["copywriting-pro", "ad-copywriting-formulas"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["copywriting-pro", "ogilvy-long-copy-method"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "brand-dna"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "consumer-insight-research"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-ad-brief", "brand-identity"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-ad-brief", "editorial-ad-design"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["marketing-analytics", "attribution-modeling"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-analytics", "long-copy-performance-tracking"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "瘛勗漲瘨祥??撖?蝛?, description: "Ogilvy 閬?撱??鈭箏? homework嚗?蝛嗥??蝛嗥奎??蝛嗆?鞎餉?箄?鈭箏?鈭怎策???ig Idea??, tool: "internal", outputType: "consumer_insight_report", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "Big Idea + Headline ?萎?", description: "靘?Ogilvy 皞??啣神撱??璅?嚗像??5 ????璅?憭?扳?嚗?憿捱摰誨????, tool: "internal", outputType: "headline_variants", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "?瑟?獢迤?撖?, description: "?啣神?遛鈭祕???牧??霅??瑞?撱?????gilvy 隤芥?鞎餉??舐?湛?憟寞雿?憒餃????典????孵?隤芣?", tool: "internal", outputType: "long_form_ad_copy", requiredSkills: ["ad-copywriting-formulas"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "蝺刻摩憸冽閬死閮剛?", description: "閮剛?撣嗆???蝺刻摩??撱??蝝?嚗??唳????釭?蔣??隤芣?摮???撱??靽∩遙摨?, tool: "internal", outputType: "editorial_creative", requiredSkills: ["visual-ad-brief"] }, m3Info),
        assignAgentToStep({ order: 5, name: "撱????餈質馱", description: "餈質馱?瑟?獢?vs ?剜?獢???皜祇??梯?摰?????????嚗??雿喳誨????, tool: "internal", outputType: "copy_performance_report", requiredSkills: ["marketing-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?瑟?獢撖怠葦", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "瘨祥??蝛嗅葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "蝺刻摩閮剛?撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "撱??????撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ogilvy ?瑟?獢????Facebook 撱??", description: "Source: David Ogilvy?onfessions of an Advertising Man??963. Ogilvy & Mather ??瑟?獢?? Rolls-Royce?BM?merican Express ?菟??撱???孵?, steps });
      await upsertSquad(conn, { slug, name: "Ogilvy ?瑟?獢?Facebook 撱??撠?", description: "? David Ogilvy 瘛勗漲?弦+?瑟?獢瘜?霈?Facebook 撱????蝭?隤芣???????嚗遣蝡??縑隞餃????脰???, industryKey: "marketing", missionType: taskType, workspace: ["facebook-ads"], methodology: "David Ogilvy ??Confessions of an Advertising Man (1963)", agents: agentMembers, tags: ["facebook", "long-copy", "direct-response", "brand"], useCases: ["擃?寧?誨??, "??敶Ｚ情撱??", "B2B??撱??"], outputFormats: ["撱???瑟?獢?, "Headline 霈?", "蝺刻摩憸冽蝝?"], requiredIntegrations: [], token: 65000, showcases: [{ company: "Rolls-Royce嚗gilvy & Mather嚗?, description: "???0?梢???????Rolls-Royce ?憭抒??芷?舫摮??輕蝑??719 摮??撱??", result: "?敺?Rolls-Royce ?琿?憓? 50%嚗??箏銝?鋡怠??函?撱??銋?", source: "Ogilvy?onfessions of an Advertising Man??963" }, { company: "American Express嚗gilvy ??嚗?, description: "?瑟?獢?隞嗅誨?撥隤輯澈隞質情敺菔?撖衣??, result: "?∠??唾?????30%嚗?誨??ROI 璆剔??擃?, source: "Ogilvy & Mather Agency Records / David Ogilvy?gilvy on Advertising??983" }] });
    }

    // A8: Jon Loomer ??Facebook Custom Audiences Mastery (2013??020)
    {
      const slug = "fb-loomer-custom-audience";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["remarketing-strategy", "paid-ads"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["remarketing-strategy", "custom-audience-mastery"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["lookalike-audience-strategy", "meta-ads-paid-ads"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["lookalike-audience-strategy", "pixel-audience-strategy"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["attribution-modeling", "marketing-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["attribution-modeling", "retargeting-analytics"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Pixel 鈭辣?嗆?閮剛?", description: "閮剛?摰 Facebook Pixel 鈭辣餈質馱?嗆?嚗??????儔??嗉??綽??汗??鞈潑?蝯董?頃鞎?, tool: "internal", outputType: "pixel_event_architecture", requiredSkills: ["remarketing-strategy"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?芾???惜蝑", description: "撱箇? 10+ ?閮??曉?撅歹?蝬脩?閮芸恥嚗?/7/14/30憭抬????蔣???整??桀??整??孵潸頃鞎瑁?, tool: "internal", outputType: "custom_audience_segments", requiredSkills: ["lookalike-audience-strategy"] }, m2Info),
        assignAgentToStep({ order: 3, name: "???瑕誨???身閮?, description: "?箸????曉惜閮剛?撠惇???瑁??荔?閮芸恥?刻???鞈潭隞狡?函?餈怒?憿批恥?典?鞈澆??, tool: "internal", outputType: "retargeting_ad_sequences", requiredSkills: ["remarketing-strategy"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "?訾撮???", description: "隞交?擃?潮“摰Ｗ遣蝡?1%/2%/3% Lookalike ?嚗葫閰虫??隡澆漲?????", tool: "internal", outputType: "lookalike_expansion_plan", requiredSkills: ["attribution-modeling"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Lookalike 撠振", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "甇詨???撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jon Loomer Facebook ?芾??蝎暹??蝟餌絞", description: "Source: Jon Loomer?acebook Custom Audiences??013??020. JonLoomer.com ??Facebook ?脤?撱???甈??飛撟喳嚗???80 ?祈??瑚犖摮貊?甇斗瘜?, steps });
      await upsertSquad(conn, { slug, name: "Loomer Facebook ?芾??蝎暹??撠?", description: "? Jon Loomer ??Custom Audiences 蝎暸瘜?Pixel ?嗆? ????惜 ?????瑕?????Lookalike ??嚗?瘥??誨?祥?賜移皞孛????質????", industryKey: "marketing", missionType: taskType, workspace: ["facebook-ads"], methodology: "Jon Loomer ??Facebook Custom Audiences Mastery (2013)", agents: agentMembers, tags: ["facebook", "retargeting", "custom-audience", "paid-ads"], useCases: ["?餃?????, "撱Ｘ?鞈潛頠???, "擃TV憿批恥銴頃"], outputFormats: ["??惜蝑", "Pixel 閮剖??辣", "???瑕誨????], requiredIntegrations: [], token: 60000, showcases: [{ company: "JonLoomer.com ?芾澈獢?", description: "?憭惜?芾??蝟餌絞嚗?銝?閮芸恥銵?撠惇撱??", result: "撱?? ROAS ? 8-12x嚗mail ?撟游???200%+", source: "JonLoomer.com ?刻?澆??靘?蝛? }, { company: "?餃???嚗??via Jon Loomer 隤?", description: "撖行摰 Pixel + ?芾???嗆?嚗?鞈潭鞈澆?銵?芸?", result: "鞈潛頠?蝵桀??嗥?敺?8% ????31%嚗誨??粹?雿?40%", source: "Jon Loomer 隤脩?獢??弦 2019" }] });
    }

    // A9: Molly Pittman ??Facebook Traffic System (DigitalMarketer, 2016)
    {
      const slug = "fb-pittman-traffic";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["campaign-orchestrator", "paid-ads"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["campaign-orchestrator", "traffic-system-design"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-ad-brief", "visual-content-creator"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["visual-ad-brief", "ad-creative-testing"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["smart-bidding-strategy", "marketing-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["smart-bidding-strategy", "traffic-optimization"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Traffic 蝟餌絞?嗆?閬?", description: "靘?Pittman 獢閮剛?銝惜瘚?蝟餌絞嚗瘚?嚗old嚗? ????Warm嚗? ?望???Hot嚗?瘥惜???璅?閮", tool: "internal", outputType: "traffic_system_blueprint", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "撱??蝝?皜祈岫?拚", description: "撱箇?撱??蝝?皜祈岫?拚嚗? 蝔?Hook 敶Ｗ? ? 2 蝔格撘?? 2 蝔桀??橘?敹恍?箸?擃???撱??蝯?", tool: "internal", outputType: "creative_test_matrix", requiredSkills: ["visual-ad-brief"] }, m2Info),
        assignAgentToStep({ order: 3, name: "瞍?瘚??芸?", description: "??瘥惜瘚???CPC/CTR/CVR嚗??蝞??????擃?ROAS ?誨????, tool: "internal", outputType: "traffic_optimization_report", requiredSkills: ["smart-bidding-strategy"] }, m3Info),
        assignAgentToStep({ order: 4, name: "蝮格韐振撱??", description: "霅 ROAS ?擃?撱??蝯?嚗郊蝮格??嚗?頞?瘥 20% 憓??踹?瞍?瘜?蝵殷?嚗憭扳??誨??, tool: "internal", outputType: "scaling_strategy", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 5, name: "Traffic ?勗??儔??, description: "瘥梯撓?箏???Traffic ?勗?嚗?撅斗??”?整??祈隅?Ｕ??曄銋??詻?銝甇亥?????, tool: "internal", outputType: "traffic_weekly_report", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "瘚?蝟餌絞撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?菜?皜祈岫撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "??芸?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Molly Pittman Facebook Traffic System", description: "Source: Molly Pittman / DigitalMarketer?acebook Traffic System??016. Pittman ?遙 DigitalMarketer CMO ???摰Ｘ蝞∠?頞? $5M/??Facebook 撱???臬", steps });
      await upsertSquad(conn, { slug, name: "Molly Pittman Facebook 瘚?蝟餌絞撠?", description: "? Molly Pittman ??撅斗??頂蝯梧?蝯??身閮/???勗??暹????剝??菜?皜祈岫?拚敹恍?箸?擃?撱??", industryKey: "marketing", missionType: taskType, workspace: ["facebook-ads"], methodology: "Molly Pittman ??Facebook Traffic System (DigitalMarketer, 2016)", agents: agentMembers, tags: ["facebook", "paid-ads", "traffic", "funnel-optimization"], useCases: ["Facebook撱???嗆??遣", "憭批?撣單????", "憭??撱??蝞∠?"], outputFormats: ["瘚?蝟餌絞?嗆???, "?菜?皜祈岫?拚", "?勗"], requiredIntegrations: [], token: 65000, showcases: [{ company: "DigitalMarketer 摰Ｘ蝯?", description: "Pittman ?遙 CMO ??閮剛?銝衣恣??摰Ｘ Facebook 瘚?蝟餌絞", result: "蝞∠?頞? $5M/?誨??綽?撟喳?摰Ｘ ROAS ? 4.5x", source: "Molly Pittman ?犖蝬脩? / DigitalMarketer.com" }, { company: "Train My Traffic Person嚗ittman 隤脩?嚗?, description: "頞? 5,000 ?誨?葦摮貊?甇斗??頂蝯曹蒂??澆恥?嗅董??, result: "摮詨摰Ｘ撱????撟喳??? 67%", source: "TrainMyTrafficPerson.com 摮詨獢? 2022" }] });
    }

    // A10: Frank Kern ??Mass Control / Core Influence (2008)
    {
      const slug = "fb-kern-mass-control";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "brand-dna"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "core-influence-framework"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "results-in-advance-content"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["email-marketing", "social-media-marketing"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["email-marketing", "indoctrination-sequence"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["paid-ads", "campaign-orchestrator"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["paid-ads", "launch-amplification"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Bond 撱箇??????", description: "?遣蝡?撖衣?鈭粹???嚗?鈭怎?撖行?鈭?蝷箏扼???死雿?撌曹犖??撱??璈", tool: "internal", outputType: "bond_content_plan", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Results in Advance ??撅內??", description: "?券?桀??祥蝯虫??祕??摰對?霈??曉??蝯??ern 隤芥策隞?嚗?隞閬????, tool: "internal", outputType: "ria_content", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Indoctrination 靽∪艙撱箇?摨?", description: "?? Facebook 敶梁?/鞎潭?蝟餃?撱箇??撠??寞?隢?靽∪艙嚗?隞鞈潸眺?停?訾縑雿?閫?捱?寞?", tool: "internal", outputType: "indoctrination_sequence", requiredSkills: ["email-marketing"] }, m3Info),
        assignAgentToStep({ order: 4, name: "Mass Control 靽?箸?", description: "?冽????嚗縑敹萄遣蝡???嚗移皞??曆??瑁??荔??蝷暹?霅?????蝻箸?憭批?頧???, tool: "internal", outputType: "mass_control_campaign", requiredSkills: ["paid-ads"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "敶梢???亙葦", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?批捆??撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "摨?銵撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "撱???撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Frank Kern Mass Control Facebook 敶梢????, description: "Source: Frank Kern?ass Control??008. Kern ??Mass Control 隤脩?銝甈∩??瑕??$23.8M ?瑕憿??萎??嗆??訾?銵閮?", steps });
      await upsertSquad(conn, { slug, name: "Frank Kern Mass Control Facebook 撠?", description: "? Frank Kern ??Bond ??Results in Advance ??Indoctrinate ??Promote 獢嚗撱箇??祕??敺?靽嚗???憭批?頞??喟絞撱??", industryKey: "marketing", missionType: taskType, workspace: ["facebook-ads"], methodology: "Frank Kern ??Mass Control (2008)", agents: agentMembers, tags: ["facebook", "influence", "content-marketing", "paid-ads"], useCases: ["?亥?????, "擃垢???典誨", "?犖??鞎典馳??], outputFormats: ["敶梢?摰寡???, "靽∪艙撱箇?摨?", "靽撱??憟?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Frank Kern Mass Control 隤脩??澆", description: "? Bond + RIA + Indoctrination 銝郊?莎?撱箇??靽∪艙敺?株玨蝔?, result: "?格活靽 $23.8M ?瑕憿?24 撠??批蝵??嗆??訾?銵?擃???, source: "Frank Kern ?祇?閮芾? / Mass Control 隤脩? 2008" }, { company: "Russell Brunson嚗芋隞踵??剁?", description: "摮貊? Kern ??Core Influence 獢敺??冽 ClickFunnels 銝??典誨", result: "ClickFunnels 擐僑? $10M ARR嚗颲虫犖?犖??蝎結頞? 100 ??, source: "Russell Brunson?xpert Secrets??017" }] });
    }

    // ????????????????????????????????????????????????????????????????????    // CATEGORY B: Instagram ?批捆銵 Methodology Squads (B1?10)
    // ????????????????????????????????????????????????????????????????????
    // B1: Gary Vaynerchuk ??Document Don't Create (2016)
    {
      const slug = "ig-garyvee-document";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["social-media-marketing", "content-repurposing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["social-media-marketing", "document-dont-create"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["short-video-scriptwriter", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["short-video-scriptwriter", "authentic-content-capture"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["content-repurposing", "social-scheduler"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["content-repurposing", "multi-platform-distribution"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?亙虜?批捆蝝????, description: "閮剛??????萎????亙虜?批捆閮?嚗???撖血極雿?蝔捱蝑??颯仃?飛蝧?銝?閬?蝢?閬?撖?, tool: "internal", outputType: "content_documentation_plan", requiredSkills: ["social-media-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "??蝝??單撘?", description: "?啣神頛??單獢嚗tory ? + ??蝝??+ 摮貊?蝮賜?嚗???璆剖雿??賜?箸??孵潛? Instagram ?批捆", tool: "internal", outputType: "content_capture_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "憭像?啣摰孵???, description: "撠???????鋆賜嚗G Post + Reels + Stories + Carousel嚗?憭批??格活?批捆?孛???, tool: "internal", outputType: "repurposed_content_set", requiredSkills: ["content-repurposing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?批捆蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?單閮剛?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "?批捆?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GaryVee Document Don't Create Instagram 蝑", description: "Source: Gary Vaynerchuk 2016 撟湔??箝ocument Don't Create??敹萸aynerMedia 撟怠 Wine Library TV 敺?$3M ???$60M ?單??冽迨??", steps });
      await upsertSquad(conn, { slug, name: "GaryVee Document Don't Create Instagram 撠?", description: "閮??祕??嚗?蝎曉?鋆賭?摰??批捆?ary Vee ??2016 撟湔敹??塚?霈??誑?雿??祆?蝥撓?箇?撖行??詨??? Instagram ?批捆", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Gary Vaynerchuk ??Document Don't Create (2016)", agents: agentMembers, tags: ["instagram", "content-marketing", "authenticity", "storytelling"], useCases: ["?犖??撱箇?", "?啣???漲??", "?亙虜?批捆?拚撱箇?"], outputFormats: ["?批捆蝝????, "?單獢", "憭像?啁???"], requiredIntegrations: [], token: 50000, showcases: [{ company: "GaryVee ?犖 Instagram", description: "??? Document ??嚗??極雿撣詻?璆剜捱蝑?蝔?鈭?, result: "Instagram 蝎結頞? 1,000 ?穿?撟喳?瘥票???? 2-4%嚗平????0.5-1%", source: "Gary Vaynerchuk Instagram / VaynerMedia ?祇??豢? 2023" }, { company: "?交??嚗ary ?獢?嚗?, description: "? Document 獢閮????蝔??瑚犖??嚗?隞?蝯勗誨??, result: "Instagram 撣唾? 6 ??敺?0 ???50,000 蝎結嚗??格???180%", source: "VaynerMedia Case Study 2021" }] });
    }

    // B2: Alex Hormozi ??Make Content Worth Saving (2022)
    {
      const slug = "ig-hormozi-save-worthy";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["hook-copywriter", "content-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["hook-copywriter", "save-worthy-content-framework"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-content-creator", "visual-ad-brief"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["visual-content-creator", "value-density-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "social-media-marketing"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "save-share-rate-optimization"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Save-Worthy 銝駁??弦", description: "?曉???單??鞈?嚗??桀????嗅?????批捆?ormozi 隤芥?隞?函?銝?嚗?隞亥?摮絲靘?, tool: "internal", outputType: "save_worthy_topics", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "擃?摨血?潭?獢撖?, description: "?啣神鞈?撖漲璆菟???Carousel/Post ??嚗?銝??瘣?嚗??誥閰勗‵??, tool: "internal", outputType: "high_density_copy", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "閬死??芸?", description: "閮剛?霈犖?澆??芸??澈??閬死?嚗??啜?銵???閮瑽?璆??拙? Carousel ?澆?", tool: "internal", outputType: "carousel_visual_design", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 4, name: "Save/Share ??餈質馱", description: "餈質馱鞎潭??摮???鈭怎?嚗??芰?霈嚗??芸??芷?銝駁??撘?摰寞?鋡急????, tool: "internal", outputType: "engagement_quality_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?批捆蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "閬死閮剛?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "鈭???撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Hormozi Save-Worthy Instagram ?批捆蝑", description: "Source: Alex Hormozi 2022 撟游???箝ake Content Worth Saving???嗚ormozi ?犖 Instagram 撣唾??甇斤???6 ??? 100 ?祉?蝯?, steps });
      await upsertSquad(conn, { slug, name: "Hormozi Save-Worthy Instagram ?批捆撠?", description: "隞?Alex Hormozi ?澆??嗉???皞ˊ雿?Instagram ?批捆嚗?霈?湧?閬??臬摮嚗??脣??摰寞??舀?蝞????, industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Alex Hormozi ??Make Content Worth Saving (2022)", agents: agentMembers, tags: ["instagram", "content-marketing", "carousel", "value-content"], useCases: ["????nstagram?", "B2B??Instagram??", "?犖???亥??摰?], outputFormats: ["?批捆銝駁?皜", "Carousel ??", "閬死閮剛?蝔?, "鈭????勗?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Alex Hormozi ?犖 Instagram @hormozi", description: "蝟餌絞?抒撣?Save-Worthy 獢??皜?摰對?瘥票?摮???璆剔???, result: "6 ??敺?0 ? 100 ?祉?蝯莎?撟喳?鞎潭??脣?????5%嚗平????0.5%嚗?, source: "Hormozi Instagram ?祇??豢? / Acquisition.com 2022-2023" }, { company: "Sam Ovens嚗??券?隡潭??塚?", description: "擃?摨衣霅? Carousel 鞎潭?嚗?蝭?臬??湔??嗆??寞?隢?, result: "Instagram 撣唾?? 50 ??嚗onsulting.com 撟湔?亥???$2,000 ??, source: "Consulting.com ?祇??豢? 2021" }] });
    }

    // B3: Jay Baer ??Youtility: Why Smart Marketing is About Help, Not Hype (2013)
    {
      const slug = "ig-baer-youtility";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "youtility-framework"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["hook-copywriter", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "helpful-content-copywriting"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-content-creator", "social-scheduler"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "utility-content-design"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Youtility ?批捆?啣?", description: "?弦??祕??銝血遣蝡??典漲?啣????芯?鞈??賜?甇?鼠?拙??曄??亙虜?暑?極雿????券?Ｗ?", tool: "internal", outputType: "youtility_content_map", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "撖衣撌亙?摰孵雿?, description: "?萎? How-to???柴??研極?瑟?衣?擃祕?冽?Instagram ?批捆嚗?雿?????????, tool: "internal", outputType: "utility_content_posts", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "閬死?祕?函??身閮?, description: "閮剛?銝?潛???鞈??”?郊撽???頛”嚗????閮摰寞?鋡怎?閫???澈", tool: "internal", outputType: "utility_infographics", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "????湔閮?", description: "Baer 撘瑁矽??摰寡?嗉◤?澈?身閮?鈭急??菜??塚?璅????摮??賢?撠?蝑???, tool: "internal", outputType: "word_of_mouth_plan", requiredSkills: ["social-scheduler"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Youtility 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "撖衣?批捆撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "閬死閮剛?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jay Baer Youtility Instagram 撟怠????, description: "Source: Jay Baer?outility??013 撟渡?蝝??望?瑟?aer ??Convince & Convert ?甇斗??嗅鼠??Hilton Hotels 蝑之摰Ｘ??蝷曄黎 ROI", steps });
      await upsertSquad(conn, { slug, name: "Jay Baer Youtility Instagram 撟怠???瑕???, description: "? Jay Baer ??Youtility 獢嚗??????????????憭扯?誨???鼠?拙?縑隞鳴?靽∩遙撣嗡??瑕", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Jay Baer ??Youtility (2013)", agents: agentMembers, tags: ["instagram", "content-marketing", "helpful-content", "trust"], useCases: ["B2B??靽∩遙撱箇?", "??璆剖蝣???, "???????], outputFormats: ["Youtility ?批捆?啣?", "撖衣撌亙?票??, "鞈??”"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Hilton Hotels嚗aer 摰Ｘ嚗?, description: "撱箇? @HiltonSuggests Twitter/IG 撣唾?嚗?蝎孵?蝑?銵?憿?銝?瑁摰園ㄞ摨?, result: "??憟賣?摨行???40%嚗?璈蕭頩方僑憓 300%", source: "Jay Baer?outility?ase Study + Convince & Convert Blog" }, { company: "Columbia Sportswear", description: "? Youtility ?萎?憭折??嗅?瘣餃??撌扼楝蝺遣霅啣摰對?摰????箸憭?憟質????皞?, result: "Instagram 鈭?????250%嚗??桀僑憓 35%", source: "Jay Baer Convince & Convert 獢??弦 2017" }] });
    }

    // B4: Jasmine Star ??Community-First Instagram Strategy (2014??020)
    {
      const slug = "ig-jasmine-star-community";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["social-media-marketing", "brand-dna"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["social-media-marketing", "community-first-instagram"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "community-engagement-copy"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "ig-aesthetic-system"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?拙蝷曄黎摰?", description: "蝎曄Ⅱ摰??格?蝷曄黎嚗??冽?? 1,000 ?敹?蝯莎?隞?憭Ｘ???潦撣豢隞暻潘?撱箇?瘛勗漲蝷曄黎?怠?", tool: "internal", outputType: "community_persona", requiredSkills: ["social-media-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "鈭??芸??批捆蝑", description: "Jasmine Star 撘瑁矽??鈭?敺??瘥予??30 ?????????蜓??敺餈質馱?董????撱箇??祕蝷曄黎", tool: "internal", outputType: "engagement_first_plan", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "銝?湔扯?閬箇?摮詨遣蝡?, description: "撱箇? Instagram 閬死霅蝟餌絞嚗隤踴??◢?潦?擃??湔改?霈董???潸??箏???, tool: "internal", outputType: "ig_visual_identity", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "蝎結?∪?閮?", description: "閮剛?霈敹?蝯脖蜓?撱????閮?嚗GC 敺菟??冗蝢斗??啜?蝯脫?鈭?鈭恬???蝯脰????之雿?, tool: "internal", outputType: "fan_advocacy_program", requiredSkills: ["social-media-marketing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "蝷曄黎蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "鈭???撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "閬死霅撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jasmine Star 蝷曄黎?芸? Instagram ?蝑", description: "Source: Jasmine Star ?蔣撣怠頨恬?2014 撟渲絲撱箇? Instagram 銵?寞?隢?敺颲?Social Curator 撟喳嚗???10,000+ 隡平銝?, steps });
      await upsertSquad(conn, { slug, name: "Jasmine Star 蝷曄黎?芸? Instagram 撠?", description: "蝷曄黎?典?嚗?桀敺asmine Star ?瘜?嚗?撱箇??祕蝷曄黎??嚗?頧??箏???隤漲?頃鞎瑕?", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Jasmine Star ??Community-First Instagram Strategy (2014)", agents: agentMembers, tags: ["instagram", "community", "brand-building", "engagement"], useCases: ["撠???IG?", "??璆剖蝣遣蝡?, "?犖??蝷曄黎蝬?"], outputFormats: ["蝷曄黎摰??辣", "鈭?閮?", "閬死霅??"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Social Curator嚗asmine Star ?菔齒嚗?, description: "??芸?冗蝢文???嗥???Instagram嚗??犖?蔣撣怠遣蝡 SaaS 撟喳", result: "Social Curator ??頞? 10,000 隡平銝鳴?撟渲??望?亥???$1,000 ??, source: "Social Curator 摰雯 / Jasmine Star ?祇?閮芾? 2022" }, { company: "銝剖????平摰Ｘ嚗??via Social Curator", description: "? Community-First 獢嚗?憭?30 ??鈭?蝑?蹂誨撱???", result: "6 ?? Instagram 餈質馱????400%嚗岷???? 250%", source: "Social Curator 摮詨獢??弦 2021" }] });
    }

    // B5: Chris Do ??Visual Storytelling for Brands (The Futur, 2016)
    {
      const slug = "ig-chrisdo-visual-story";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["brand-identity", "visual-content-creator"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-identity", "visual-storytelling-framework"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["brand-dna", "marketing-strategy-pmm"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["brand-dna", "brand-narrative-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["hook-copywriter", "copywriting-pro"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["hook-copywriter", "visual-caption-copy"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "??閬死隤?摰儔", description: "撱箇?????Instagram 閬死隤?蝟餌絞嚗敶拙摮詻????◢?潭?撘?霈?閬箏????, tool: "internal", outputType: "brand_visual_language", requiredSkills: ["brand-identity"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?????嗆?", description: "隞?Chris Do ??鈭瑽?銵???蝔?頧?嚗身閮?? Instagram 銝??詨???銝餉遘", tool: "internal", outputType: "brand_story_architecture", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 3, name: "閬死???批捆鋆賭?", description: "鋆賭?瘥?IG 閬死???批捆嚗絞銝?身閮釭??撘萄???????蝭撱嗡撓???詨???", tool: "internal", outputType: "visual_story_content", requiredSkills: ["visual-content-creator"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "?牧???啣神", description: "?啣神??閬箇頛???牧??嚗?閬箄?敶Ｗ?嚗?獢??儔嚗?????游?????, tool: "internal", outputType: "caption_copy", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 5, name: "閬死銝?湔抒里??, description: "摰?蝔賣 IG 撣唾?閬死銝?湔改?蝣箔???票????絞銝??????", tool: "internal", outputType: "visual_audit_report", requiredSkills: ["brand-identity"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "閬死??撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "????撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "??撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Chris Do The Futur 閬死?? Instagram ??撱箇?", description: "Source: Chris Do / The Futur 2016 撟渲絲蝟餌絞??閬死?????寞?隢he Futur YouTube 頞? 220 ?祈??梧?Instagram ?寞?隢◤?函?閮剛?撣怠誨瘜??, steps });
      await upsertSquad(conn, { slug, name: "Chris Do 閬死?? Instagram ??撠?", description: "? Chris Do嚗he Futur ?菔齒鈭綽???閬箸?鈭??塚?霈?Instagram 銝?舐??嚗蝟餌絞???????", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Chris Do ??Visual Storytelling for Brands (The Futur, 2016)", agents: agentMembers, tags: ["instagram", "brand-building", "visual-storytelling", "design"], useCases: ["閮剛?/?菜???Instagram", "擃垢??敶Ｚ情蝬?", "B2B?菜???璆?], outputFormats: ["閬死隤???", "?????嗆?", "IG?批捆憟?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "The Futur嚗hris Do ?菔齒嚗?, description: "蝟餌絞?閬死???寞?隢遣蝡?The Futur Instagram 撣唾?", result: "Instagram 頞? 100 ?祈蕭頩方?YouTube 頞? 220 ?穿?撟湔??脫?亥???$1,000 ??, source: "The Futur 摰雯 / Chris Do LinkedIn 2023" }, { company: "Blind 閮剛??砍嚗hris Do ?菔齒嚗?, description: "? Visual Storytelling 獢撅內閮剛?獢?嚗遣蝡平??擃釭??雿??nstagram", result: "?詨? Nike?ony 蝑?蝝恥?嗡蜓?銝?嚗恥?嗅?鞈芣???300%", source: "Chris Do ?祇?閮芾? / Blind.com" }] });
    }

    // B6: Vanessa Lau ??Viral Content Formula (2020)
    {
      const slug = "ig-vanessalau-viral";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["short-video-scriptwriter", "hook-copywriter"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["short-video-scriptwriter", "viral-content-formula"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "social-media-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "trending-audit-strategy"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "reels-performance-analytics"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "頞典?單??撘撖?, description: "瘥勗???IG Reels 頞典?單???銵撘???堆?霅?航??????隅?Ｘ???, tool: "internal", outputType: "trending_opportunities", requiredSkills: ["social-media-marketing"] }, m2Info),
        assignAgentToStep({ order: 2, name: "?? x 頞典???單", description: "?啣神撠????航??亥隅?Ｘ撘? Reels ?單嚗??隅?Ｗ耦撘?瘜典???改??踹?蝖砍誨??, tool: "internal", outputType: "trend_brand_scripts", requiredSkills: ["short-video-scriptwriter"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "Viral Hook ?芸?", description: "皜祈岫 5 蝔桐?????Hook嚗??亙??????霅啣??????鈭?嚗?箸?擃?摮?????, tool: "internal", outputType: "hook_test_results", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "Reels ??餈質馱?芸?", description: "餈質馱瘥? Reels ?孛?????剔??摮?嚗??交?雿唾”?暹芋撘蒂蝟餌絞??鋆?, tool: "internal", outputType: "reels_performance_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Reels ?單撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "頞典?萄?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "????撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Vanessa Lau Instagram Reels ???砍?", description: "Source: Vanessa Lau 2020 撟渡頂蝯勗???Instagram Reels ????砍??au ?砌犖 IG 敺?0 ??500,000 蝎結?? 18 ??嚗??冽迨?砍?", steps });
      await upsertSquad(conn, { slug, name: "Vanessa Lau ?? Reels ?撠?", description: "? Vanessa Lau ??Instagram Reels ??砍?嚗隅?Ｗ撖?+ ???? + Hook 皜祈岫 + ?豢??芸?嚗頂蝯望扯ˊ??閫賊? Reels", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Vanessa Lau ??Viral Content Formula (2020)", agents: agentMembers, tags: ["instagram", "reels", "viral", "short-video"], useCases: ["??Reels?", "??閫賊???", "?啣董?翰????], outputFormats: ["頞典璈??勗?", "Reels ?單蝯?", "??餈質馱銵?], requiredIntegrations: [], token: 50000, showcases: [{ company: "Vanessa Lau ?犖 Instagram", description: "蝟餌絞? Viral Formula嚗?急???隞?Reels-First 蝑敹恍???, result: "18 ??敺?0 ??500,000 蝎結嚗??◤??亥???$10 ??, source: "Vanessa Lau ?犖蝬脩? / YouTube ?祇??豢? 2021" }, { company: "憭? COMMITED 隤脩?摮詨", description: "? Vanessa Lau ?砍?敺?Instagram 撣唾?蝒??園", result: "撟喳?摮詨 3 ?? Reels 閫賊?? 5-10 ??, source: "Vanessa Lau 隤脩?摮詨閬? 2022" }] });
    }

    // B7: Neil Patel ??Content Repurposing Skyscraper for Instagram (2018)
    {
      const slug = "ig-patel-skyscraper-repurpose";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-repurposing", "content-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-repurposing", "skyscraper-to-instagram"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-content-creator", "visual-ad-brief"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["visual-content-creator", "blog-to-visual-transformation"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-scheduler", "marketing-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-scheduler", "ig-content-distribution"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "擃??摰寡???, description: "???暹??刻??YouTube ?批捆嚗?箸???擃? 10 蝭?????Instagram ?批捆?撘瑞?蝝?靘?", tool: "internal", outputType: "top_content_inventory", requiredSkills: ["content-repurposing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?批捆閬死????, description: "撠蝭?蝡?? Instagram ?澆?嚗?0 憭扯?暺?Carousel?郊撽?閫???亙??～?閮?銵?, tool: "internal", outputType: "visual_content_set", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Instagram 璅惜蝑", description: "?弦銝血銵?雿單?蝐斤??伐?瘛瑕?憭找葉撠璅惜嚗遣蝡???蝐歹??芸??Ｙ揣?孛??, tool: "internal", outputType: "hashtag_strategy", requiredSkills: ["social-scheduler"] }, m3Info),
        assignAgentToStep({ order: 4, name: "頝典像?唳????, description: "??Instagram 撘????刻??Email ?嚗 Bio ?????Stories 皛?撱箇?頝典像?唳??艘頝?, tool: "internal", outputType: "cross_platform_funnel", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 5, name: "SEO-to-IG ???勗?", description: "餈質馱 Instagram 撣嗡???賣瘚?嚗誑??賣霈??? IG 餈質馱??瘥?嚗?艘頝舀???, tool: "internal", outputType: "cross_platform_report", requiredSkills: ["content-marketing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?批捆?ˊ蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "閬死?身閮葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "???撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Neil Patel ?批捆?ˊ Instagram 憓蝑", description: "Source: Neil Patel NeilPatel.com 2018 撟渡頂蝯勗??摰孵?鋆賣??瑟瘜eilPatel.com ??????400 ?穿?Instagram ??ˊ獢? 100 ?? 餈質馱", steps });
      await upsertSquad(conn, { slug, name: "Neil Patel ?批捆?ˊ Instagram 憓撠?", description: "?歇??擃??摰寡??Ｚ?? Instagram 蝝?嚗?憭批??批捆 ROI嚗??遣蝡楊撟喳瘚?餈渲楝", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Neil Patel ??Content Repurposing for Instagram (NeilPatel.com, 2018)", agents: agentMembers, tags: ["instagram", "content-repurposing", "seo", "cross-platform"], useCases: ["??賣/YouTube????, "?批捆鞈?ˊ", "頝典像?唳????], outputFormats: ["?批捆?日??勗?", "閬死????", "璅惜蝑?辣"], requiredIntegrations: [], token: 55000, showcases: [{ company: "NeilPatel.com ?芾澈", description: "蝟餌絞???刻?潭?蝡?鋆賜 Instagram Carousel ???∴?撱箇???瘚?", result: "Instagram ? 100 ?? 餈質馱嚗?賣??????400 ?穿??批捆 ROI ?? 3 ??, source: "NeilPatel.com / Neil Patel ?祇??豢? 2023" }, { company: "Backlinko嚗rian Dean嚗?隡潭瘜?", description: "撠?SEO ?弦??蝟餌絞??鋆賜 Instagram ???Carousel", result: "Instagram 撣唾?? 50 ??嚗mail ?敺?IG ?脣?雿? 30%", source: "Backlinko.com / Brian Dean ?祇?獢? 2021" }] });
    }

    // B8: Later ??Optimal Posting Time Science Method (2019)
    {
      const slug = "ig-later-optimal-timing";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-analytics", "social-media-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-analytics", "ig-timing-optimization"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["social-scheduler", "content-repurposing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["social-scheduler", "optimal-posting-schedule"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["cross-channel-analytics", "attribution-modeling"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["cross-channel-analytics", "ig-algorithm-analytics"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "撣唾?甇瑕鈭???", description: "瘛勗漲??撣唾?? 90 憭拇?蝭票???澆??? vs 鈭???撱箇?撣唾?撠惇??雿喟撣?畾萄??, tool: "internal", outputType: "engagement_timing_map", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?瘣餉??挾?弦", description: "??餈質馱?暑頨?畾萄?雿?IG Insights ?豢?嚗?蝯?銵平?箸??豢??曉?擃孛????, tool: "internal", outputType: "audience_activity_report", requiredSkills: ["cross-channel-analytics"] }, m3Info),
        assignAgentToStep({ order: 3, name: "30 憭拇?雿單?蝔身閮?, description: "閮剛? 30 憭拍撣?蝔??冽?雿單?畾萄??????批捆嚗?曹??喲望?????芋撘?, tool: "internal", outputType: "monthly_posting_schedule", requiredSkills: ["social-scheduler"] }, m2Info),
        assignAgentToStep({ order: 4, name: "瞍?瘜縑??憭批?", description: "閮剛??潭?敺?30 ???????箄???銝餃???閮鈭?嚗?憭批???鈭??漲嚗孛?潭?蝞??典誨", tool: "internal", outputType: "algorithm_boost_plan", requiredSkills: ["marketing-analytics"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "IG 瞍?瘜??葦", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "???芸?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "鈭???撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Later ?雿喟??璈?摮詨??", description: "Source: Later.com?est Time to Post on Instagram??019 ?弦?勗?嚗?????1,200 ??IG 鞎潭??豢?敺??摮豢?蝔瘜?, steps });
      await upsertSquad(conn, { slug, name: "Later ?雿單?璈?Instagram 瞍?瘜????, description: "隞?Later ?? 1,200 ?祈票??蝘飛?豢??箏蝷?????撣唾????曄?扯身閮?雿喟撣?畾蛛??憭批???閫賊?", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Later ??Best Time to Post Science (2019 Research Report, 12M+ posts)", agents: agentMembers, tags: ["instagram", "scheduling", "analytics", "algorithm"], useCases: ["IG撣唾?閫賊?????, "瞍?瘜??, "?批捆銵?????], outputFormats: ["?雿單?畾萄????, "30憭拇?蝔”", "瞍?瘜?????], requiredIntegrations: [], token: 45000, showcases: [{ company: "Later 撟喳?祈澈嚗???12M+ 鞎潭?嚗?, description: "?? 1,200 ?砍?Instagram 鞎潭??撣???鈭??豢?嚗?箄?璆剜?雿喟撣?畾菔?敺?, result: "雿輻 Later ?雿單?畾萄??賜?撣唾?嚗像?????? 25%", source: "Later.com Best Time to Post Research Report 2019/2022" }, { company: "Lush Cosmetics嚗ater 獢?嚗?, description: "? Later ?????蝔??典??暹?瘣餉??挾?澆???批捆", result: "Instagram 鈭?????35%嚗蕭頩方??瑕???60%", source: "Later.com Case Studies 2020" }] });
    }

    // B9: Rachel Hollis ??Radical Transparency Personal Brand (Girl, Wash Your Face, 2018)
    {
      const slug = "ig-hollis-radical-transparency";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["brand-dna", "copywriting-pro"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "radical-transparency-brand"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["short-video-scriptwriter", "social-media-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["short-video-scriptwriter", "authentic-storytelling"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "personal-brand-visual"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?祕??蝷西???", description: "????/?犖??祕??鈭?憭望????????瑯achel Hollis 隤芥???文停?臭?????, tool: "internal", outputType: "authentic_story_bank", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?摹???單閮剛?", description: "閮剛?撅內?祕?摹?Ｙ? IG ?批捆?單嚗?摰???敺?鈭飛蝧風蝔?撖西?暺?撱箇??祕鈭箸???", tool: "internal", outputType: "vulnerability_content_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "銝?湔批犖??閬死", description: "撱箇??祕?撥?犖??閬死蝟餌絞嚗?瘣餅??蔣??嗅???鈭箏?蝷綽??踹??漲蝎曆耨?誨??", tool: "internal", outputType: "authentic_visual_system", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "?孵潸?蝷曄黎?砍?", description: "?Ⅱ銵券????詨??孵潸?嚗撘????潸????橘?Rachel Hollis ?? ??霈??犖?死?曉摰?, tool: "internal", outputType: "values_community_content", requiredSkills: ["brand-dna"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?犖??撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?祕?批捆撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "??閬死撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Rachel Hollis Radical Transparency Instagram ?犖??", description: "Source: Rachel Hollis?irl, Wash Your Face??018 撟渡?蝝???No.1 ?ａ?賂?? Radical Transparency ?犖??", steps });
      await upsertSquad(conn, { slug, name: "Rachel Hollis 瞈?脤? Instagram ?犖??撠?", description: "?澈?祕????蝷箄?撘梧??霈??曄?楛摨行?????犖?? Instagram?achel Hollis ?甇文????犖??霈? $1 ????, industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Rachel Hollis ??Radical Transparency Personal Brand (2018)", agents: agentMembers, tags: ["instagram", "personal-brand", "authenticity", "storytelling"], useCases: ["?犖??Instagram撱箇?", "?菜平摰嗅??遣蝡?, "雓葦/憿批???"], outputFormats: ["??蝝?摨?, "?批捆?單蝯?", "閬死霅蝟餌絞"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Rachel Hollis ?犖??撣?", description: "敺?直慦賡?賢恥嚗? Radical Transparency 撱箇? Instagram 撘瑕之?犖??", result: "Instagram 頞? 200 ?祈蕭頩方??貊??瑕頞? 300 ?祆嚗僑?嗅頞? $1 ??, source: "Forbes Profile 2019 / Rachel Hollis ?祇?鞎∪??豢?" }, { company: "Bren矇 Brown嚗?隡潭瘜?", description: "?弦?∪頨恬?隞亙?鈭怎?蝛嗡葉?犖?摹??撱箇? Instagram ?犖??", result: "Instagram 頞? 500 ?祈蕭頩方?TED 瞍?頞? 6,000 ?祈????貊?蝝航??瑕 500 ??", source: "Bren矇 Brown Inc. / TED.com ?豢? 2023" }] });
    }

    // B10: Brian Fanzo ??Live-First Video Strategy (iSocialFanz, 2016)
    {
      const slug = "ig-fanzo-live-first";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["social-media-marketing", "content-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["social-media-marketing", "live-first-video-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["short-video-scriptwriter", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["short-video-scriptwriter", "live-content-scripting"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["content-repurposing", "social-scheduler"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["content-repurposing", "live-to-content-repurpose"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Live ?湔蝑閬?", description: "閮剛?瘥?Instagram Live 閮?嚗蜓憿???身摰??身閮TA 摰?嚗?瘥?湔?賣??Ⅱ?格?", tool: "internal", outputType: "live_strategy_plan", requiredSkills: ["social-media-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Live ?湔?單閮剛?", description: "?啣神頛??湔?單嚗???Hook ???詨??孵潸撓?????單?鈭?璈挾 ??蝯偏 CTA嚗???撖行???憭梢?暺?, tool: "internal", outputType: "live_content_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "?湔敺摰孵?鋆?, description: "?湔蝯?敺?蝎曇?挾?芾摩??Reels?tories ?挾?漁暺?Carousel嚗?甈∠?剔??10+ 隞質??摰?, tool: "internal", outputType: "post_live_content_set", requiredSkills: ["content-repurposing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?湔蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?湔?單撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "?批捆?ˊ撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Brian Fanzo Live-First Instagram ?湔?蝑", description: "Source: Brian Fanzo (iSocialFanz) 2016 撟湔???Live-First 蝑?anzo 鋡?IBM?ell 蝑?蝝????箇冗蝢斤??仿“??, steps });
      await upsertSquad(conn, { slug, name: "Brian Fanzo Live-First Instagram ?湔撠?", description: "Instagram Live ?芸?蝑嚗???剖遣蝡?撖阡??嚗???剖摰孵?鋆賜憭車?澆?嚗?憭批??格活??摰寧??, industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Brian Fanzo ??Live-First Video Strategy (iSocialFanz, 2016)", agents: agentMembers, tags: ["instagram", "live", "video", "content-repurposing"], useCases: ["???祕摨血遣蝡?, "?Ｗ??澆??湔", "???????], outputFormats: ["?湔閮?銵?, "?單璅⊥", "?ˊ?批捆??], requiredIntegrations: [], token: 50000, showcases: [{ company: "Dell Technologies嚗anzo 憿批?獢?", description: "? Live-First 蝑嚗??銵?摰嗥?剖?鈭怎?霅?撱箇? B2B ??閬芾???, result: "Instagram Live 閫???? 400%嚗?剖??Ｗ?閰Ｗ?憓? 180%", source: "Brian Fanzo iSocialFanz.com Case Study / Dell Social Media" }, { company: "IBM嚗anzo 憿批?獢?", description: "隞?Live-First 蝑霈?IBM 撌亦?撣怠??弦?∪?∴?鈭箸批? B2B 蝘???", result: "??憟賣?摨行???55%嚗inkedIn + Instagram 蝬?鈭???璆剔? Top 5%", source: "Brian Fanzo ?祇?瞍? Social Media Marketing World 2017" }] });
    }

    // ????????????????????????????????????????????????????????????????????    // CATEGORY C: ?剖蔣??TikTok/Reels Methodology Squads (C1?10)
    // ????????????????????????????????????????????????????????????????????
    // C1: MrBeast ??Hook + Escalation + Payoff Method (2020?resent)
    {
      const slug = "sv-mrbeast-hook-payoff";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["short-video-scriptwriter", "hook-copywriter"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["short-video-scriptwriter", "mrbeast-hook-payoff"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["visual-content-creator", "visual-escalation-editing"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "tiktok-ads"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "completion-rate-optimization"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Pattern Interrupt Hook 閮剛?", description: "閮剛???3 蝘?璅∪???文?嚗?撘菜隢整?閬箄????渲死???rBeast ??嚗???蝚砌??亥店銝?撽?撠望??洵鈭閰晞?, tool: "internal", outputType: "hook_variants", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "??撘萄??單", description: "閮剛?敺?Hook ??Payoff ??蝝撐??瑽?瘥?10-15 蝘?銝??敹菜?撽?嚗?閫?曄瘜銝?璈?, tool: "internal", outputType: "tension_escalation_script", requiredSkills: ["short-video-scriptwriter"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "Epic Payoff 蝯偏閮剛?", description: "閮剛?霈??整澆?蝑??? Epic Payoff 蝯偏嚗?頞???蝯??蕃頧?蝷綽?霈犖?喲??蒂?澈", tool: "internal", outputType: "payoff_ending_design", requiredSkills: ["visual-content-creator"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?剖蔣?唾?砍葦", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "閬死?芾摩撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "摰???葦", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "MrBeast Hook Escalation Payoff ?剖蔣?喳撘?, description: "Source: MrBeast (Jimmy Donaldson) ?剖蔣?喟?瑽???YouTube 頞? 3 ???梧?瘥敶梁?撟喳?摰????60%嚗平????15-25%嚗?, steps });
      await upsertSquad(conn, { slug, name: "MrBeast Hook+Payoff ?剖蔣?喳???, description: "? MrBeast ??Hook ????撘萄? ??Epic Payoff 銝挾蝯?嚗ˊ雿?鈭箇瘜?甇Ｚ????剖蔣?喳摰?, industryKey: "marketing", missionType: taskType, workspace: ["tiktok", "reels", "shorts"], methodology: "MrBeast (Jimmy Donaldson) ??Hook Escalation Payoff Formula (2020)", agents: agentMembers, tags: ["short-video", "tiktok", "reels", "hook", "viral"], useCases: ["????敶梁?", "?Ｗ?撅內?剖蔣??, "??摰?], outputFormats: ["Hook 霈?皜", "?單?辣", "?芾摩??"], requiredIntegrations: [], token: 50000, showcases: [{ company: "MrBeast YouTube/TikTok", description: "蝟餌絞? Hook+Escalation+Payoff 銝挾蝯??萎???蔣??, result: "YouTube 3 ?? 閮嚗ikTok 9,800 ?? 蝎結嚗rBeast Burger 銝撟?$100M ?瑕", source: "YouTube / TikTok ?祇??豢? 2023 / Business Insider" }, { company: "????靘?Gymshark TikTok", description: "????Hook+Payoff 蝯??詨??亥澈?", result: "TikTok ? 400 ?? 餈質馱嚗??唳?蝐斤敞閮?60 ?活閫??, source: "Gymshark TikTok ?祇??豢? 2022" }] });
    }

    // C2: Alex Hormozi ??One Idea One Video (2022)
    {
      const slug = "sv-hormozi-one-idea";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["short-video-scriptwriter", "copywriting-pro"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["short-video-scriptwriter", "one-idea-one-video"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["hook-copywriter", "ad-copywriting-formulas"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "single-message-hook"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "video-message-clarity-test"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?桐?閮??", description: "敺??蜓憿葉???臭??詨?閮嚗????曉閮?銝隞嗡?嚗?臭?暻潘??ormozi ?敺?銝?臬蔣??????, tool: "internal", outputType: "single_message_brief", requiredSkills: ["short-video-scriptwriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "蝺??單?啣神", description: "?啣神 60-90 蝘?皝?穿??湔???嚗?斗???撘瑕??詨?閮?摰對?瘥閰梢閬竟???曄匱蝥??釣??", tool: "internal", outputType: "tight_script", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "?湔銵??潛捲閮剛?", description: "閮剛?皜?湔?銝 CTA嚗ormozi 隤芥?閬?隞府??暻潘??芣?銝????, tool: "internal", outputType: "single_cta", requiredSkills: ["hook-copywriter"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?單蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "??撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "皜摨血??葦", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Hormozi One Idea One Video ?剖蔣?單??啣漲獢", description: "Source: Alex Hormozi 2022 撟渡敶梢?萎???嚗cquisition.com ?????敺像???剔??? 80%", steps });
      await upsertSquad(conn, { slug, name: "Hormozi One Idea One Video ?剖蔣?喳???, description: "銝?臬蔣??喲?銝???胯lex Hormozi ???啣漲??嚗芋蝟?閮蝑瘝?閮嚗??啣????, industryKey: "marketing", missionType: taskType, workspace: ["tiktok", "reels", "shorts"], methodology: "Alex Hormozi ??One Idea One Video (2022)", agents: agentMembers, tags: ["short-video", "clarity", "scripting", "conversion"], useCases: ["??敶梢", "?Ｗ??隞晶", "??隤芣?敶梁?"], outputFormats: ["?桐?閮?辣", "蝺??單", "CTA 閮剛?"], requiredIntegrations: [], token: 45000, showcases: [{ company: "Alex Hormozi @hormozi TikTok/IG Reels", description: "蝟餌絞? One Idea One Video ??嚗??臬蔣????敹?璆剜?撖?, result: "TikTok 500 ?? 蝎結嚗eels 撟喳?摰????70%嚗ead ??? 60%", source: "Hormozi ?犖蝷曄黎?豢? / Acquisition.com 2023" }, { company: "Sam Parr嚗?隡潭??塚?Morning Brew ??嚗?, description: "瘥? Podcast ?芰?箔??敹??舐? 60 蝘?Clip", result: "?剖蔣?喳董??6 ??? 20 ?? 餈質馱嚗odcast 閮憓? 35%", source: "My First Million Podcast / Sam Parr ?祇??豢? 2022" }] });
    }

    // C3: Gary Vaynerchuk ??Micro-Content Pyramid (2016)
    {
      const slug = "sv-garyvee-micro-content";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-repurposing", "social-media-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-repurposing", "micro-content-pyramid"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["short-video-scriptwriter", "visual-content-creator"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["short-video-scriptwriter", "long-to-short-extraction"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-scheduler", "marketing-ops"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-scheduler", "multi-platform-publish"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?瑕摰寥暺ˊ雿?, description: "鋆賭??瑕耦撘暺摰嫘?Podcast 銝?ouTube ?瑞???剝?敶梧?嚗?游?Micro-Content ??憛?蝝?摨?, tool: "internal", outputType: "anchor_content", requiredSkills: ["social-media-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?剖蔣?喟移?航???, description: "敺暺摰嫣葉?? 5-10 ??蝎曇?挾嚗?畾菜?嗅 15-60 蝘?瘥挾?質?函??喲?摰?孵?, tool: "internal", outputType: "short_clip_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "撟喳???澆??寧楊", description: "撠???挾?寧楊?箏?撟喳???澆?嚗ikTok ??孵? + ?????G Reels + ?單??ouTube Shorts + 蝮桀?", tool: "internal", outputType: "platform_native_clips", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 4, name: "頝典像?唳甈∠撣?, description: "閮剛?頝典像?啁撣?蝔?銝隞賡?批捆??5 ?像?啁??30+ 隞嗥敶梢嚗?憭批??格活?萎????梢??, tool: "internal", outputType: "distribution_schedule", requiredSkills: ["social-scheduler"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?批捆?ˊ蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?剖蔣?唾??葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "頝典像?啁撣葦", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GaryVee Micro-Content Pyramid ?批捆??蝑", description: "Source: Gary Vaynerchuk?rushing It!??018 + DailyVee 2016. VaynerMedia ?甇斗??嗅鼠?拙恥?嗅?銝甈∪摰寞??亦??100+ 隞嗅凝?批捆", steps });
      await upsertSquad(conn, { slug, name: "GaryVee Micro-Content Pyramid ?剖蔣?喳???, description: "銝甈⊿敶Ｗ??批捆?圾??100 隞嗅凝?批捆?ary Vee ?摰孵???憛??伐??憭批??萎????梢??, industryKey: "marketing", missionType: taskType, workspace: ["tiktok", "reels", "shorts", "youtube"], methodology: "Gary Vaynerchuk ??Micro-Content Pyramid (2016)", agents: agentMembers, tags: ["short-video", "content-repurposing", "multi-platform", "efficiency"], useCases: ["撌脫??瑕??批捆????, "Podcast??撱嗡撓", "YouTube頧敶梢"], outputFormats: ["?券??批捆閮?", "?剔????單", "頝典像?啁撣?蝔?], requiredIntegrations: [], token: 55000, showcases: [{ company: "GaryVee ?犖慦???", description: "隞?DailyVee嚗撣?Vlog嚗?券?嚗????30-50 隞嗅凝?批捆??唳??像??, result: "??TikTok/IG/YouTube 蝬剜?瘥?70+ 隞嗅摰對?蝮賜?蝯脰???3,500 ??, source: "GaryVee.com / VaynerMedia 2022 ?批捆?勗?" }, { company: "Entrepreneur Magazine嚗aynerMedia 摰Ｘ嚗?, description: "撠蝭?蝡?閮芾??圾?箏凝?批捆嚗???Micro-Content ??憛楊撟喳?", result: "蝷曄黎鈭?????300%嚗冗蝢方蕭頩方蜇?詨???150%", source: "VaynerMedia Case Study / Entrepreneur.com 2019" }] });
    }

    // C4: Brendan Kane ??One Million Followers Hook Testing (2018)
    {
      const slug = "sv-kane-hook-testing";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["hook-copywriter", "short-video-scriptwriter"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["hook-copywriter", "hook-ab-testing"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["paid-ads", "tiktok-ads"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["tiktok-ads", "hook-testing-amplification"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "attribution-modeling"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "hook-performance-analytics"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "10 蝔?Hook 霈?閮剛?", description: "?箏?銝銝駁?閮剛? 10 蝔桐???Hook ?嚗??亙??霅啣??????鈭??摮?????蝑?瘥車?瑕漲?批??3-5 蝘?, tool: "internal", outputType: "hook_10_variants", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "撠?蝞?Hook A/B 皜祈岫", description: "隞交???Hook 霈??撠?撱??鞎鳴?瘥?$5-$10嚗?皜祈岫 3 憭拇??憪??ane ?寞?嚗?皜砍??", tool: "internal", outputType: "hook_test_results", requiredSkills: ["tiktok-ads"] }, m2Info),
        assignAgentToStep({ order: 3, name: "韐振 Hook ??曉之", description: "霅銵函?雿喟? 1-2 ??Hook嚗誑甇斤?箇?鋆賭?摰敶梁?嚗?銝剝?蝞??渲孛??, tool: "internal", outputType: "winner_hook_campaign", requiredSkills: ["paid-ads"] }, m2Info),
        assignAgentToStep({ order: 4, name: "Hook ?????勗?", description: "???芷? Hook 撠璅??暹???憟踝?撱箇??? Hook ?砍?摨恬?靘靘摰寞?蝥蝙??, tool: "internal", outputType: "hook_formula_library", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Hook 閮剛?撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "撱??皜祈岫撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "????撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Brendan Kane One Million Followers Hook Testing ?寞?", description: "Source: Brendan Kane?ne Million Followers??018. Kane ??30 憭拙?箏??董?敞蝛?100 ??餈質馱嚗敹擃?Hook 皜祈岫", steps });
      await upsertSquad(conn, { slug, name: "Brendan Kane Hook 皜祈岫?曇蝎結撠?", description: "? Brendan Kane ??Hook 擃葫閰行瘜?10 蝔?Hook ??皜祈岫嚗?箸?擃?摮??嚗翰??鋆賣??芋撘?, industryKey: "marketing", missionType: taskType, workspace: ["tiktok", "reels", "shorts"], methodology: "Brendan Kane ??One Million Followers Hook Testing (2018)", agents: agentMembers, tags: ["short-video", "hook", "ab-testing", "growth"], useCases: ["?啣董?翰????, "?剖蔣?喳誨???, "Hook?砍?撱箇?"], outputFormats: ["Hook 10 霈?", "A/B 皜祈岫蝯?", "Hook ?砍?摨?], requiredIntegrations: [], token: 50000, showcases: [{ company: "Brendan Kane ?犖撖阡?", description: "??30 憭拙?箄撌勗董?? Hook 擃葫閰阡???100 ??Facebook 餈質馱??, result: "30 憭拚???100 ?祈蕭頩歹?敺?鋆賣瘜憭??犖摰Ｘ嚗aylor Swift 蝑????", source: "Brendan Kane?ne Million Followers??018 / 雿鈭箄赤隢? }, { company: "隡平摰Ｘ嚗??via Hook Testing", description: "??見??Hook A/B 皜祈岫?寞??芸? TikTok 撱?? Hook", result: "撱?? Hook 摰?? 18% ????62%嚗PA ?? 55%", source: "Brendan Kane 蝷曄黎銵隤脩?獢? 2021" }] });
    }

    // C5: NasDaily (Nuseir Yassin) ??60-Second Story Structure (2016??021)
    {
      const slug = "sv-nasdaily-60sec";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["short-video-scriptwriter", "copywriting-pro"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["short-video-scriptwriter", "60second-story-structure"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["hook-copywriter", "content-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "educational-narrative-hook"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "fast-cut-visual-editing"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "???嚗roblem Open嚗?, description: "閮剛? 5 蝘撥???湛??隞支犖憟賢???閮???嚗?閫?暹?仿?蝑??asDaily ?砍?嚗??仿???撖血?嚗?, tool: "internal", outputType: "problem_open_hook", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 2, name: "??撅??單", description: "?啣神 40 蝘???蝔葉畾蛛??典翰?頛舐?憟?蝪⊥?????詨???嚗? 5 蝘??鈭祕????, tool: "internal", outputType: "journey_script", requiredSkills: ["short-video-scriptwriter"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "?剔內蝯偏 + ?澈閫貊", description: "閮剛??敺?15 蝘??剔內隞支犖皛輯雲??隢?????梢陷????霈??暹??閮???鈭?, tool: "internal", outputType: "reveal_ending", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "敹怠閬死憸冽閮剛?", description: "閮剛?瘥?3-5 蝘?銝??Ｙ?敹怠憸冽嚗??交?摮??撥??暺?靽?閫?曇?閬箸釣??", tool: "internal", outputType: "fast_cut_visual_guide", requiredSkills: ["visual-content-creator"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "???單撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Hook 閮剛?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "閬死?芾摩撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "NasDaily 60 蝘?鈭敶梢蝯?", description: "Source: NasDaily (Nuseir Yassin) 2016 撟湧?憪?? 1,000 憭拇?憭拍撣?60 蝘蔣?acebook 頞? 5,000 ?祉?蝯?, steps });
      await upsertSquad(conn, { slug, name: "NasDaily 60 蝘?鈭敶梢撠?", description: "? NasDaily ??60 蝘?鈭?瑽?????翰??蝔?皛輯雲?剔內??鈭怨孛?潦?? 1,000 憭拇?氬?,000 ?祉?蝯脩??平撽?獢", industryKey: "marketing", missionType: taskType, workspace: ["tiktok", "reels", "shorts"], methodology: "NasDaily (Nuseir Yassin) ??60-Second Story Structure (2016)", agents: agentMembers, tags: ["short-video", "storytelling", "educational", "viral"], useCases: ["?????剖蔣??, "?Ｗ??敶梁?", "隡平??撅內"], outputFormats: ["60 蝘?祆芋??, "Hook 霈?", "閬死?芾摩??"], requiredIntegrations: [], token: 50000, showcases: [{ company: "NasDaily ?犖??", description: "??? 1,000 憭拇?憭拍撣???60 蝘?鈭敶梢嚗???Problem-Journey-Reveal 蝯?", result: "Facebook 5,200 ?? 蝎結嚗ouTube 500 ??嚗asAcademy 摮詨頞? 50,000 鈭?, source: "NasDaily 摰雯 / Forbes 2021 ?勗?" }, { company: "????獢?嚗??荔?Unilever嚗?, description: "??NasDaily ?????60 蝘?鈭撘?蝷箏??冗?痊隞?, result: "??敶梁?蝝航?閫????2 ?活嚗??末?漲?? 40%", source: "NasDaily 摰雯??獢? 2020" }] });
    }

    // C6: Roberto Blake ??Binge-Worthy Series Format (2019)
    {
      const slug = "sv-blake-binge-series";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "short-video-scriptwriter"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "binge-series-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "cliffhanger-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-scheduler", "marketing-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-scheduler", "series-upload-cadence"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "蝟餃?銝駁????貉???, description: "閮剛??臬辣隡貊?蝟餃?銝駁?嚗??之銝駁??? 6-12 ??瘥??賜蝡????????銝??, tool: "internal", outputType: "series_concept_plan", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?詨艙?文?閮剛?嚗liffhanger嚗?, description: "瘥?蝯偏閮剛??詨艙?文?嚗???撠?閮港??艾?蝯????唬?銝甇乒艾?閫?曇翰銝?敺?敺???, tool: "internal", outputType: "cliffhanger_endings", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "蝟餃??單?萎?", description: "?頂???撖急????貉?穿?蝣箔?瘥??賣??函??孵?蝟餃?撱嗡撓?改?靽?蝯曹?憸冽??憟?, tool: "internal", outputType: "series_scripts", requiredSkills: ["short-video-scriptwriter"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "???冗蝢文遣蝡?, description: "閮剖??箏??湔蝭憟?憒??曹?銝??嚗遣蝡??暹?敺?嚗????????曆???????, tool: "internal", outputType: "series_schedule_community_plan", requiredSkills: ["social-scheduler"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "蝟餃?蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?詨艙閮剛?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "??蝷曄黎撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Roberto Blake Binge-Worthy 蝟餃??剖蔣?喟???, description: "Source: Roberto Blake?wesome Creator Academy??019. Blake ?頂?撘??亥?隞? YouTube 撣唾?閮????400%", steps });
      await upsertSquad(conn, { slug, name: "Roberto Blake Binge-Worthy 蝟餃??剖蔣?喳???, description: "閮剛?霈??整??銝?瘜?甇Ｚ???蝟餃??剖蔣?喋oberto Blake ?敹?蝟餃??澆?嚗遣蝡??暸??批????瑟??釣", industryKey: "marketing", missionType: taskType, workspace: ["tiktok", "reels", "shorts", "youtube"], methodology: "Roberto Blake ??Binge-Worthy Series Format (2019)", agents: agentMembers, tags: ["short-video", "series", "retention", "community"], useCases: ["???蝟餃?敶梁?", "?Ｗ?閰葫蝟餃?", "撟???蝟餃?"], outputFormats: ["蝟餃?隡???, "?單蝯?", "??閮?"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Roberto Blake YouTube嚗wesome Creator Academy嚗?, description: "?蝟餃?+?詨艙?澆?嚗遣蝡?雿???YouTube ?萎??頂?玨蝔?, result: "YouTube 頞? 50 ?祈??梧?蝟餃?敶梁?撟喳?摰??70%+嚗??勗??瑞??? 400%", source: "Roberto Blake YouTube ?祇??豢? 2022" }, { company: "HubSpot Marketing YouTube", description: "? Binge Series ?澆?鋆賭??arketing Made Simple?頂??, result: "YouTube 閮頞? 40 ?穿?蝟餃?敶梁?撣嗅? 25% ?蜇?駁?閮憓", source: "HubSpot YouTube ?祇??豢? 2021" }] });
    }

    // C7: Pat Flynn ??Teach What You Know + Personality (Smart Passive Income, 2008)
    {
      const slug = "sv-flynn-teach-know";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "teach-what-you-know"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["short-video-scriptwriter", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["short-video-scriptwriter", "educational-personality-script"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["brand-dna", "visual-content-creator"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["brand-dna", "personal-teaching-style"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?飛銝駁??犖????", description: "閮剛?瘥敶梁???摮訾蜓憿?銝西??亙犖???扛頨怎?甇瘀?Pat Flynn ????摮?+ ?祕鈭箸 = ?∪?誨?????, tool: "internal", outputType: "teaching_topic_plan", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?飛?剖蔣?唾?祆撖?, description: "?啣神???飛?抒??剖蔣?唾?穿?皜?飛暺?+ 撟賡??扛???犖憸冽嚗?鈭箸?釣?游?", tool: "internal", outputType: "teaching_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "瘛勗漲摮貊?撘?閮剛?", description: "閮剛?敺敶梢?唳瘛勗飛蝧?皞?璈嚗io ?????隢??????摰??鞎餉?皞?撱箇?敺蕭頩方摮詨???楝敺?, tool: "internal", outputType: "learning_funnel_design", requiredSkills: ["brand-dna"] }, m3Info),
        assignAgentToStep({ order: 4, name: "蝷曄黎鈭???閮剛?", description: "?冽??臬蔣??撠曇身閮?蝑????????嚗?閬?閮嚗?敶梁??蝷曄黎閮?韏琿?嚗???蝞??", tool: "internal", outputType: "community_qa_plan", requiredSkills: ["content-marketing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?飛?批捆蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?單撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "???批葦", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Pat Flynn Teach What You Know ?剖蔣?單?摮詨?????, description: "Source: Pat Flynn?ill It Fly???uperfans?mart Passive Income 2008??019. SPI 撟湔?亥???$200 ?祆??冽迨獢撱箇?", steps });
      await upsertSquad(conn, { slug, name: "Pat Flynn Teach & Personality ?剖蔣?喳???, description: "?函敶梢???仿???嚗???蝷箇?撖血扼at Flynn ??摮??批撘?霈?蝯脫?銝??犖嚗??賣?銝????, industryKey: "marketing", missionType: taskType, workspace: ["tiktok", "reels", "shorts"], methodology: "Pat Flynn ??Teach What You Know + Personality (Smart Passive Income, 2008)", agents: agentMembers, tags: ["short-video", "educational", "personal-brand", "teaching"], useCases: ["????敶梢", "?亥?霈??撱箇?", "SaaS/撌亙?飛敶梁?"], outputFormats: ["?飛銝駁?閮?", "?單蝯?", "摮貊?瞍?閮剛?"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Smart Passive Income嚗at Flynn嚗?, description: "? Teach+Personality 獢蝟餌絞頛詨?飛?剖蔣?喉?撱箇?鋡怠??嗅???", result: "YouTube 35 ?? 閮嚗odcast 頞? 8,000 ?祆活銝?嚗僑?嗅頞? $200 ??, source: "SmartPassiveIncome.com ?祇??嗅?勗? 2019" }, { company: "Thomas Frank嚗?隡潭??塚?", description: "?ollege Info Geek?ouTube ?駁?? Teach+Personality 獢?飛蝧?撌?, result: "YouTube 頞? 300 ?祈??梧?隤脩??瑕頞? $1,000 ??, source: "Thomas Frank ?祇??嗅?勗? 2022" }] });
    }

    // C8: Justin Welsh ??One Piece Many Outputs (The Operating System, 2022)
    {
      const slug = "sv-welsh-one-to-many";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-repurposing", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-repurposing", "welsh-content-os"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["short-video-scriptwriter", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["short-video-scriptwriter", "pillar-to-short-extraction"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-scheduler", "email-marketing"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-scheduler", "newsletter-bridge-strategy"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?望敹?Pillar 璁艙蝣箇?", description: "瘥梢摰??敹?璆?銵瘣?雿 Pillar 璁艙嚗?湧望??摰寧???詨?", tool: "internal", outputType: "weekly_pillar_concept", requiredSkills: ["content-repurposing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?剖蔣?唾?祈???, description: "敺?Pillar 璁艙?? 3-5 ?舐敶梢?單嚗??航??虫???暺??豢?暺?30-60 蝘??舐蝡???, tool: "internal", outputType: "short_video_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Newsletter 瘛勗漲撱嗡撓", description: "撠?Pillar 璁艙?游???Newsletter 瘛勗漲??嚗敶梢隤芰?隢?Newsletter 隤芷?蝔??豢?嚗耦??鋆?, tool: "internal", outputType: "newsletter_piece", requiredSkills: ["email-marketing"] }, m3Info),
        assignAgentToStep({ order: 4, name: "憭像?啣?隤輻撣?, description: "閮剛?銝?梁撣?憟??剖蔣?喳 TikTok/Reels ?詨??啣??橘?Newsletter ??瘛勗漲?嚗nstagram 鋆閬死閫賊?", tool: "internal", outputType: "weekly_distribution_plan", requiredSkills: ["social-scheduler"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?批捆蝟餌絞撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?剖蔣?唾?砍葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Newsletter 撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Justin Welsh Content OS 銝撠??批捆蝟餌絞", description: "Source: Justin Welsh?he Content OS??022 撟渲玨蝔elsh ?甇斤頂蝯曹誑瘥?4 撠?蝬剜???像?啣摰對?撟湔?亥???$5M", steps });
      await upsertSquad(conn, { slug, name: "Justin Welsh One-to-Many ?批捆蝟餌絞撠?", description: "銝?敹?撖????湧梁?憭像?啣摰嫘ustin Welsh ??Content OS嚗蝟餌絞?誨??嚗???4 撠?蝬剜??典像?啣摰寡撓??, industryKey: "marketing", missionType: taskType, workspace: ["tiktok", "reels", "linkedin", "email"], methodology: "Justin Welsh ??The Content OS (One Piece Many Outputs, 2022)", agents: agentMembers, tags: ["short-video", "content-os", "repurposing", "newsletter"], useCases: ["?犖??憭像?圈???, "Solopreneur ?批捆?拚", "B2B ?犖??撱箇?"], outputFormats: ["??Pillar 璁艙", "?剖蔣?唾?祉?", "Newsletter ??", "?澆???"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Justin Welsh ?犖??", description: "? Content OS 蝟餌絞嚗??曹誑 4 撠?蝬剜? LinkedIn/TikTok/Newsletter ?典像?啗撓??, result: "LinkedIn 頞? 50 ?祈蕭頩歹?Newsletter 頞? 20 ?祈??梧?撟湔?亥???$5M", source: "Justin Welsh ?祇??嗅?勗? 2022 / JustinWelsh.me" }, { company: "Dickie Bush嚗?隡潭??塚?Ship 30 for 30嚗?, description: "? One Idea Many Outputs 撠??交?蝡?畾菔??憭像?啣凝?批捆", result: "Ship 30 for 30 隤脩??嗅頞? $2M嚗witter 頞? 35 ?祈蕭頩?, source: "Dickie Bush ?祇??豢? / Ship30for30.com 2022" }] });
    }

    // C9: Sahil Bloom ??Edu-Tainment Tweet-to-Reels Method (2021)
    {
      const slug = "sv-sahilbloom-edutainment";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "hook-copywriter"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "edutainment-content-design"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["short-video-scriptwriter", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["short-video-scriptwriter", "thread-to-reels-script"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-content-creator", "social-scheduler"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "text-overlay-design"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Edu-Tainment 銝駁?閮剛?", description: "?曉??改??祕瘣?嚗? 憡??改??閬箸?撽?嚗?鈭日?銝駁??ahil Bloom ??嚗?隞摮貊?銝剜??圈???, tool: "internal", outputType: "edutainment_topic_list", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "璇?撘?祆撖?, description: "隞?Twitter Thread ?摩?啣神?剖蔣?唾?穿?瘥?暺?舐蝡?撖?敹怎?憟??5-7 ?飛蝧?嚗?暺?5-8 蝘?, tool: "internal", outputType: "bullet_point_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "????閬死閮剛?", description: "閮剛?霈犖?喃蝙?銋????摮???閬綽?皜摮???暺撥隤輯?摮?閮??拙?頧?蝑蝣?????, tool: "internal", outputType: "text_overlay_reels", requiredSkills: ["visual-content-creator"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Edu-Tainment 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?單撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "閬死閮剛?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Sahil Bloom Edu-Tainment ?剖蔣?喳撘?, description: "Source: Sahil Bloom 2021 撟游? Twitter Thread 韏瑕振嚗辣隡貉 IG Reels ??Edu-Tainment ?批捆?砍??ewsletter 頞? 50 ?祈???, steps });
      await upsertSquad(conn, { slug, name: "Sahil Bloom Edu-Tainment ?剖蔣?喳???, description: "蝯???孵澆?憡?銵??敶梢?砍??ahil Bloom ??Edu-Tainment ?寞?嚗??芣?嚗?閬?鈭箇?鈭?嚗?, industryKey: "marketing", missionType: taskType, workspace: ["tiktok", "reels", "shorts"], methodology: "Sahil Bloom ??Edu-Tainment Content Formula (2021)", agents: agentMembers, tags: ["short-video", "educational", "edutainment", "infographic"], useCases: ["?平/????批捆", "銵?亥??剖蔣??, "??瘣?蝟餃?"], outputFormats: ["銝駁?皜", "璇??單", "????閮剛?"], requiredIntegrations: [], token: 45000, showcases: [{ company: "Sahil Bloom ?犖??", description: "敺蝯?Twitter Thread 蝘餅? Edu-Tainment ?砍???Instagram Reels ??TikTok", result: "Twitter 頞? 90 ?祉?蝯莎?Instagram 頞? 50 ?祈蕭頩歹?Newsletter 頞? 50 ?祈???, source: "Sahil Bloom ?祇??豢? 2023 / SahilBloom.com" }, { company: "Polina Marinova嚗he Profile嚗?隡潭瘜?", description: "? Edu-Tainment 獢??Newsletter ?冗蝢文像?啗撓?箏?璆凋犖?拇?撖?, result: "Newsletter 頞? 10 ?祈??梧?瘥??縑????45%嚗平????20%嚗?, source: "The Profile Newsletter ?祇??豢? 2022" }] });
    }

    // C10: Noah Kagan ??Title/Thumbnail Test Before Create (AppSumo, 2020)
    {
      const slug = "sv-kagan-title-test";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-analytics", "market-research-agent"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-analytics", "pre-creation-title-testing"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["hook-copywriter", "ad-copywriting-formulas"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "title-matrix-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["paid-ads", "tiktok-ads"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["paid-ads", "pre-launch-ad-testing"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "璅??拚閮剛?嚗reate Before Creating嚗?, description: "?刻ˊ雿蔣??嚗??銝駁?閮剛? 10 ??憿?擃??典誨??A/B 皜祈岫?曉暺???擃?璅?嚗?靘迨鋆賭?敶梁?", tool: "internal", outputType: "title_matrix", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 2, name: "撠?蝞?憿葫閰?, description: "隞?$50-$100 撱??鞎餅葫閰?10 ??憿?3 憭拙??詨 CTR ?擃? 2 ???箇敶梢璅?嚗Ⅱ靽摰孵鋆賭??停???湧?霅?, tool: "internal", outputType: "title_test_results", requiredSkills: ["paid-ads"] }, m3Info),
        assignAgentToStep({ order: 3, name: "韐振璅?敶梁?鋆賭?", description: "隞交葫閰西?摰嗆?憿??箸敹?Hook嚗撖思蒂鋆賭?摰?剖蔣?喉?蝣箔??批捆摰?璅??隢?, tool: "internal", outputType: "validated_video_script", requiredSkills: ["marketing-analytics"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "撽?蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "璅?閮剛?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "皜祈岫撱??撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Noah Kagan ?葫閰血?鋆賭??剖蔣?喲?霅?", description: "Source: Noah Kagan嚗ppSumo ?菔齒鈭綽?2020 撟湔??箝?皜祆?憿??蔣?瘜?AppSumo ?甇文??恣??$10M+ YouTube 撱??", steps });
      await upsertSquad(conn, { slug, name: "Noah Kagan ?葫敺ˊ?剖蔣?喲?霅???, description: "鋆賭?敶梁????典誨?葫閰行?憿?蝣箔?瘥?剖蔣?喲???湧?霅??瘙oah Kagan ???雿摮賂?銝?嚗?皜?, industryKey: "marketing", missionType: taskType, workspace: ["tiktok", "reels", "shorts"], methodology: "Noah Kagan ??Test Before Create (AppSumo, 2020)", agents: agentMembers, tags: ["short-video", "ab-testing", "data-driven", "validation"], useCases: ["敶梁??批捆蝑撽?", "?唬蜓憿葫閰?, "撱??敶梁??芸?"], outputFormats: ["璅??拚", "皜祈岫蝯??勗?", "撽??單"], requiredIntegrations: [], token: 45000, showcases: [{ company: "AppSumo YouTube嚗oah Kagan ?菔齒嚗?, description: "蝟餌絞? Title Test Before Create ?寞?嚗???YouTube 敶梁??葫璅??ˊ雿?, result: "YouTube 頞? 100 ?祈??梧?敶梁?撟喳? CTR ? 8-12%嚗平????2-4%嚗?, source: "Noah Kagan YouTube / AppSumo.com ?祇??豢? 2023" }, { company: "Starter Story嚗at Walls嚗?隡潭瘜?", description: "?刻ˊ雿?蝭摰孵??撱??皜祈岫璅?暺???, result: "??????150 ?穿?撱?? CTR 頞?璆剔???3 ??, source: "Starter Story ?祇??豢? 2022" }] });
    }

    // ????????????????????????????????????????????????????????????????????    // CATEGORY D: LinkedIn 銵 Methodology Squads (D1?10)
    // ????????????????????????????????????????????????????????????????????
    // D1: Justin Welsh ??The Content Operating System (2022)
    {
      const slug = "li-welsh-content-os";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "linkedin-content-os"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "linkedin-post-copywriting"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["email-marketing", "social-scheduler"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["email-marketing", "newsletter-linkedin-bridge"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-analytics", "linkedin-content-analytics"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?批捆?舀摰儔嚗ontent Pillars嚗?, description: "摰儔 3 ?摰寞?梧?撠平?亥?嚗xpertise嚗犖??嚗tory嚗?璆剛?暺?Opinion嚗elsh 瘥勗??潔?蝭?蝬剜?憭雁摨衣??犖??敶Ｚ情", tool: "internal", outputType: "content_pillars_doc", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?梯票?撘憚??, description: "閬?瘥?3-5 蝭票???澆?頛芣?嚗?????鈭???暺??????蝑?嚗Ⅱ靽??曆??脖?", tool: "internal", outputType: "weekly_format_rotation", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "LinkedIn 鞎潭????啣神", description: "?啣神蝚血? LinkedIn 瞍?瘜?鞎潭?嚗撥?洵銝銵?銝?瘀???畾菔 1-2 ?乓銵?????CTA", tool: "internal", outputType: "linkedin_posts_copy", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 4, name: "Newsletter 璈閮剛?", description: "??LinkedIn 鞎潭?蝯偏撘???Newsletter嚗elsh 蝑??LinkedIn ?詨??嚗ewsletter ???嚗遣蝡??像?圈◢?芰?霈?黎", tool: "internal", outputType: "newsletter_cta_design", requiredSkills: ["email-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "LinkedIn 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "??撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Newsletter 撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "????撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Justin Welsh LinkedIn Content OS ?犖??蝟餌絞", description: "Source: Justin Welsh?he Content OS??022 隤脩??elsh 隞交???4 撠??嚗???LinkedIn 50 ?祈蕭頩方?撟湔 $5M", steps });
      await upsertSquad(conn, { slug, name: "Justin Welsh LinkedIn Content OS ?犖??撠?", description: "? Justin Welsh ??Content OS嚗? ?摰寞??? ?望撘憚??? Newsletter 璈嚗誑蝟餌絞?誨??嚗???4 撠?蝬剜? LinkedIn ?犖??", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Justin Welsh ??The Content Operating System (2022)", agents: agentMembers, tags: ["linkedin", "personal-brand", "content-os", "newsletter"], useCases: ["?犖??LinkedIn撱箇?", "B2B憿批???", "Solopreneur LinkedIn?"], outputFormats: ["?批捆?舀?辣", "?梯票????, "LinkedIn ??", "Newsletter CTA"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Justin Welsh ?犖?? @JustinWelsh", description: "2019 撟游??園?憪???Content OS 蝟餌絞撱箇? LinkedIn ?犖??", result: "LinkedIn 頞? 50 ?祈蕭頩歹?撟湔?亥???$5M嚗?蝭票?像?孛??20-50 ?砌犖", source: "Justin Welsh ?祇??嗅?勗? 2022 / JustinWelsh.me" }, { company: "Lara Acosta嚗elsh ?寞?隢飛?∴?", description: "? Content OS 敺?0 撱箇? LinkedIn ?犖??嚗? ??? 5 ?祈蕭頩?, result: "LinkedIn 頞? 20 ?祈蕭頩歹??犖??隤脩???亥???$30,000", source: "Lara Acosta LinkedIn / ?祇?閮芾? 2023" }] });
    }

    // D2: Richard van der Blom ??LinkedIn Algorithm Methodology (2020??023)
    {
      const slug = "li-vanderblom-algorithm";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-analytics", "social-media-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-analytics", "linkedin-algorithm-optimization"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "linkedin-format-scoring"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-scheduler", "cross-channel-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-scheduler", "linkedin-posting-window"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "LinkedIn 瞍?瘜撘???, description: "靘?van der Blom 撟游漲 Algorithm Report 閰摯?票?撘?瞍?瘜????辣/Carousel ?擃???敶梁? ???? ??蝝?摮?, tool: "internal", outputType: "format_scoring_guide", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "瞍?瘜?憟質票?撖?, description: "? van der Blom 瘣??啣神擃?鞎潭?嚗? 3 銵????撥????憿?撠整?蝐支?頞? 3 ?洵 1 撠?鈭?銵", tool: "internal", outputType: "algorithm_friendly_posts", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "?雿喟撣?畾菔身摰?, description: "靘?van der Blom ?弦?曉銵平?雿喟撣?蝒??曹?/銝??銝?7-9 暺憭批??貉?璆剜?擃孛????, tool: "internal", outputType: "optimal_posting_schedule", requiredSkills: ["social-scheduler"] }, m3Info),
        assignAgentToStep({ order: 4, name: "鈭??漲?芸?嚗olden Hour嚗?, description: "閮剛??澆?敺洵銝撠???????????銝餃??????????閬芸?鈭?嚗撘瑞?蝷曆漱閮?蝯行?蝞?", tool: "internal", outputType: "golden_hour_plan", requiredSkills: ["cross-channel-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "LinkedIn 瞍?瘜葦", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "鞎潭??芸?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "??鈭?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Richard van der Blom LinkedIn 瞍?瘜?摮詨??", description: "Source: Richard van der Blom 撟游漲?inkedIn Algorithm Insights Report??020-2023嚗?????88,000 蝭票???臬??鋡怠??函? LinkedIn 瞍?瘜?蝛?, steps });
      await upsertSquad(conn, { slug, name: "van der Blom LinkedIn 瞍?瘜?摮詨????, description: "隞?Richard van der Blom ?? 88,000+ 蝭票??蝘飛?勗??箏蝷??芸?鞎潭??澆??撣?畾萄?鈭?蝑嚗?憭批? LinkedIn ??閫賊?", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Richard van der Blom ??LinkedIn Algorithm Insights Report (2020??023)", agents: agentMembers, tags: ["linkedin", "algorithm", "analytics", "organic-reach"], useCases: ["LinkedIn閫賊?????, "瞍?瘜?憟賢摰孵??, "隡平LinkedIn撣唾?蝞∠?"], outputFormats: ["?澆?閰???", "瞍?瘜?憟質票??, "暺?撠?閮?"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Just Connecting嚗an der Blom ?砍嚗恥?嗥黎", description: "隡平摰Ｘ? Algorithm Report 瘣??芸? LinkedIn ?批捆蝑", result: "撟喳???閫賊?????150-300%嚗票?????? 200%", source: "Just Connecting 摰雯 / van der Blom Algorithm Report 2023" }, { company: "IBM嚗?隡潭?蝞??芸?獢?嚗?, description: "? LinkedIn 瞍?瘜?雿喳?蝑嚗??璆剖董?票?撘???", result: "LinkedIn 撣唾?閫賊?憓 180%嚗撌亙∟降鞎潭?鈭???璆剔? Top 10%", source: "LinkedIn Business Solutions Case Studies 2022" }] });
    }

    // D3: Daniel Disney ??Social Selling Method (The Ultimate LinkedIn Sales Guide, 2021)
    {
      const slug = "li-disney-social-selling";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "mbb-strategist"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "social-selling-linkedin"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["brand-identity", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["brand-identity", "linkedin-profile-optimization"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["content-marketing", "hook-copywriter"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["content-marketing", "authority-content-linkedin"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["marketing-analytics", "campaign-orchestrator"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["campaign-orchestrator", "pipeline-tracking-linkedin"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "LinkedIn ?犖鞈??芸?", description: "撱箇?隞亥眺摰嗥銝剖?嚗?瘙????LinkedIn ?犖鞈?嚗eadline 隤芥?撟怨狐閫?捱隞暻澆?憿?About 隤芣?鈭?Experience 隤芣???, tool: "internal", outputType: "optimized_linkedin_profile", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 2, name: "?批捆甈?撱箇?", description: "蝟餌絞?撣?蝷箄?璆剖?璆剔霅??批捆嚗遣蝡????撠望???雁摰?嚗??格?摰Ｘ銝餃??曆??", tool: "internal", outputType: "authority_content_plan", requiredSkills: ["content-marketing"] }, m3Info),
        assignAgentToStep({ order: 3, name: "?????蝑", description: "閮剛?蝎暹????隢?蝑嚗犖????+ ?勗???? + ?孵澆?銵?撱箇??祕?平????????", tool: "internal", outputType: "connection_strategy", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "撠店頧?瘚?", description: "閮剛?敺摰嫣??蝘?撠店??嗉???蝔????? ????閮 ??撱箇?撠店 ???潛?瘙??????店", tool: "internal", outputType: "conversation_conversion_flow", requiredSkills: ["campaign-orchestrator"] }, m4Info),
        assignAgentToStep({ order: 5, name: "?瑕蝞⊿?餈質馱", description: "撱箇? LinkedIn Social Selling Index (SSI) 餈質馱嚗誑?豢?銵⊿?蝷曄黎?瑕??銝行?蝥??, tool: "internal", outputType: "ssi_pipeline_report", requiredSkills: ["marketing-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "蝷曄黎?瑕蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?犖鞈?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "?批捆甈?撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "蝞⊿???撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Daniel Disney LinkedIn Social Selling B2B ?瑕蝟餌絞", description: "Source: Daniel Disney?he Ultimate LinkedIn Sales Guide??021. Disney ?臬??LinkedIn Social Selling ??亙?撠葦嚗?蝺渲???100,000 雿?B2B ?瑕鈭箏", steps });
      await upsertSquad(conn, { slug, name: "Daniel Disney LinkedIn Social Selling 撠?", description: "? Daniel Disney ??LinkedIn Social Selling 蝟餌絞嚗??犖鞈??芸??啁恣?遣蝡??典摰孵撘璅恥?嗡蜓?蝜?, industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Daniel Disney ??The Ultimate LinkedIn Sales Guide (2021)", agents: agentMembers, tags: ["linkedin", "social-selling", "b2b", "pipeline"], useCases: ["B2B?瑕LinkedIn?", "憿批???摰Ｘ?脣?", "隡平BD LinkedIn蝑"], outputFormats: ["LinkedIn?犖鞈??芸?", "?批捆閮?", "撠店?單", "SSI?勗?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Daniel Disney ?犖?? / Daily Sales", description: "??芸??LinkedIn Social Selling ?寞?嚗??瑕?∪?函???亙? LinkedIn ?寡?撣?, result: "LinkedIn 頞? 90 ?祉?蝯莎??寡?頞? 100,000 ?瑕鈭箏嚗aily Sales 撟湔頞? 瞿200 ??, source: "Daniel Disney LinkedIn / TheDailySales.com 2023" }, { company: "Salesforce嚗aniel Disney 隡平摰Ｘ嚗?, description: "? Social Selling 獢?寡??瑕????LinkedIn 撱箇??犖???恣??, result: "Sales Team LinkedIn SSI 撟喳??? 40%嚗inkedIn 靘??恣????25%", source: "Daniel Disney 隡平?寡?獢? 2022" }] });
    }

    // D4: Gary Vaynerchuk ??Day Trading Attention (LinkedIn Edition, 2023)
    {
      const slug = "li-garyvee-daytrading";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["social-media-marketing", "content-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["social-media-marketing", "day-trading-attention-linkedin"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["hook-copywriter", "short-video-scriptwriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "linkedin-native-video"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "paid-ads"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "linkedin-attention-arbitrage"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "LinkedIn 瘜冽????皜?, description: "瘥勗???LinkedIn 頞典?批捆??蝞????澆?嚗??交釣????雿??批捆璈?嚗aryVee嚗瘝犖??寞雿釣????", tool: "internal", outputType: "attention_opportunity_map", requiredSkills: ["social-media-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "LinkedIn ??敶梁??批捆", description: "鋆賭? LinkedIn 撟喳??敶梁?嚗? YouTube 憭?嚗?? GaryVee ??嚗??摰寧敺?3x ??閫賊?", tool: "internal", outputType: "native_video_scripts", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "??鈭??嗡?蝑", description: "?券??勗漲撣?銝?銝??釭閰?嚗aryVee?omments as Content??嚗??犖???冽憭批??暸????, tool: "internal", outputType: "comment_strategy", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "瘜冽?????ROI 餈質馱", description: "餈質馱???批捆?釣???瘥?閫賊? / ???嚗?蝥??鞈?祆?擃??批捆敶Ｗ?", tool: "internal", outputType: "attention_roi_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "LinkedIn 瘜冽????亙葦", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "??敶梁?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "ROI ??撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GaryVee Day Trading Attention LinkedIn 蝑", description: "Source: Gary Vaynerchuk?ay Trading Attention??024. VaynerMedia ?隡平??LinkedIn 隞交?雿??祆雿?璆剜釣??", steps });
      await upsertSquad(conn, { slug, name: "GaryVee Day Trading Attention LinkedIn 撠?", description: "??LinkedIn 銝?鈭斗??∠巨銝璅?漱?釣??嚗瞍?瘜????澆???璈誑?雿??祆雿?憭扳??ary Vee 2024 ??唳瘜?", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Gary Vaynerchuk ??Day Trading Attention (2024)", agents: agentMembers, tags: ["linkedin", "organic-reach", "attention", "native-content"], useCases: ["B2B??LinkedIn???", "?犖??敹恍???, "隡平????遣蝡?], outputFormats: ["瘜冽??????, "??敶梁??單", "??蝑", "ROI?勗?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "VaynerMedia B2B 摰Ｘ蝯?", description: "? Day Trading Attention 獢撟怠 B2B ????LinkedIn ?嗡???瘚?", result: "摰Ｘ撟喳? LinkedIn 閫賊??? 400%嚗誨??箏???雿?30%", source: "VaynerMedia LinkedIn 獢??弦 2023" }, { company: "Gary Vaynerchuk ?犖 LinkedIn", description: "蝟餌絞?瑁???敶梁?+??蝑嚗誑?雿?行??祉雁??LinkedIn ??敶梢??, result: "LinkedIn 頞? 500 ?祈蕭頩方?瘥?鞎潭?閫賊? 50-200 ?砌犖", source: "GaryVee LinkedIn ?祇??豢? 2024" }] });
    }

    // D5: Alex Hormozi ??LinkedIn Lead Magnet to DM Pipeline (2023)
    {
      const slug = "li-hormozi-lead-magnet";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["hook-copywriter", "campaign-orchestrator"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["hook-copywriter", "linkedin-lead-magnet-post"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "email-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["email-marketing", "linkedin-dm-sequence"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "marketing-ops"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-ops", "linkedin-pipeline-ops"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "LinkedIn Lead Magnet 鞎潭?閮剛?", description: "閮剛???隢?敺?鞎餉?皞? LinkedIn 鞎潭??澆?嚗ormozi 2023 ??鞎潭??砍?嚗?擃??亙?澆?鞎餃? + 閰?閫貊璈", tool: "internal", outputType: "lead_magnet_post", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?芸? DM 摨?閮剛?", description: "閮剛?閰?敺孛?潛??芸?蝘?摨?嚗ead Magnet 鈭支? ??撱箇??? ??鈭圾?瘙?????撘?", tool: "internal", outputType: "dm_automation_sequence", requiredSkills: ["email-marketing"] }, m2Info),
        assignAgentToStep({ order: 3, name: "?店??瘚?閮剛?", description: "閮剛?敺?DM 撠店?圈店??????蝔????澆?憿????寥?蝣箄? ??Calendly ??? ??蝣箄??萎辣", tool: "internal", outputType: "call_booking_flow", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "LinkedIn 蝞⊿???餈質馱", description: "撱箇? LinkedIn 瞏恥蝞⊿?餈質馱嚗ead Magnet 閰??詹?DM ?????店?????漱???芸?瘥???暺?, tool: "internal", outputType: "pipeline_tracking_dashboard", requiredSkills: ["marketing-ops"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Lead Magnet 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "DM 摨?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "蝞⊿?餈質馱撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Hormozi LinkedIn Lead Magnet to DM Pipeline", description: "Source: Alex Hormozi 2023 撟?LinkedIn ??鞎潭??砍?嚗蝭票?孛??5,000+ 閰??祕??靘?, steps });
      await upsertSquad(conn, { slug, name: "Hormozi LinkedIn Lead Magnet 蝞⊿?撠?", description: "隞?Alex Hormozi ??隢孛??Lead Magnet?撘 LinkedIn 撱箇??芸???摰Ｙ恣??敺票?孛??店???冽?蝔??, industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Alex Hormozi ??LinkedIn Lead Magnet DM Pipeline (2023)", agents: agentMembers, tags: ["linkedin", "lead-generation", "dm-automation", "pipeline"], useCases: ["B2B??瞏恥?", "憿批?/?毀摰Ｘ?脣?", "SaaS閰衣撘?"], outputFormats: ["Lead Magnet 鞎潭?", "DM 摨??單", "蝞⊿?餈質馱?銵冽"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Alex Hormozi LinkedIn @hormozi", description: "???隢?敺?鞎餉?皞撘??桃?鞎潭?閫貊 5,000+ 閰???DM", result: "LinkedIn 頞? 100 ?祈蕭頩歹??格活鞎潭??Ｙ? 500+ ?平閰Ｗ?", source: "Hormozi LinkedIn ?祇?鞎潭??豢? 2023" }, { company: "Adam Robinson嚗B2B嚗?, description: "?憿撮 LinkedIn Lead Magnet + DM ?芸???蝔?, result: "LinkedIn 鞎潭?撣嗡? $1M ARR 憓嚗?摰Ｙ???砌???$50/鈭?, source: "Adam Robinson LinkedIn / RB2B.com 2023" }] });
    }

    // D6: Viveka von Rosen ??LinkedIn Optimization System (Linked Into Business, 2013)
    {
      const slug = "li-vonrosen-optimization";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["brand-identity", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-identity", "linkedin-profile-seo"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "linkedin-keyword-content"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "market-research-agent"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "linkedin-seo-analytics"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "LinkedIn SEO ?犖/隡平?撖抵?", description: "撖抵? LinkedIn ???SEO 摰摨佗??摮?雿ll-Star ?犖鞈???閮?URL?eatured ??雿輻", tool: "internal", outputType: "linkedin_seo_audit", requiredSkills: ["brand-identity"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?摮??亥?撋", description: "?弦?格????LinkedIn ?揣???萄?嚗頂蝯勗?撋 Headline/About/Experience 銝哨??? LinkedIn ?揣??", tool: "internal", outputType: "keyword_optimization_plan", requiredSkills: ["market-research-agent"] }, m3Info),
        assignAgentToStep({ order: 3, name: "LinkedIn ?批捆 SEO 蝟餌絞", description: "閮剛?隞亦璅??萄??箸敹??批捆蝑嚗?鞎潭???LinkedIn ?揣銝剜????詨?銝餃??????典恥??, tool: "internal", outputType: "content_seo_calendar", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "??摨虫縑??憭批?", description: "閮剛?霈?LinkedIn 瞍?瘜?撣唾?閬擃?澆雿???摨虫縑????????亙??摰嫣????, tool: "internal", outputType: "engagement_signal_plan", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 5, name: "LinkedIn ???", description: "餈質馱?犖鞈??汗??蝝Ｗ?暹活?詻SI ??摰寡孛??蝑敹?KPI嚗??????, tool: "internal", outputType: "linkedin_monthly_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "LinkedIn SEO 撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?摮摰孵葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "????撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Viveka von Rosen LinkedIn ?冽雿?頂蝯?, description: "Source: Viveka von Rosen?inked Into Business??013. LinkedIn 隤?憟寧?函???亙???LinkedIn 撠振銋?", steps });
      await upsertSquad(conn, { slug, name: "Viveka von Rosen LinkedIn ?冽雿????, description: "? Viveka von Rosen ??LinkedIn ?芸?蝟餌絞嚗??犖鞈? SEO ?啣摰寥??萄?蝑嚗? LinkedIn ?蝛拙???B2B 瞏恥靘?", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Viveka von Rosen ??LinkedIn Optimization System (Linked Into Business, 2013)", agents: agentMembers, tags: ["linkedin", "seo", "profile-optimization", "b2b"], useCases: ["LinkedIn?犖鞈??芸?", "隡平LinkedIn?SEO", "B2B?揣瘚??脣?"], outputFormats: ["LinkedIn SEO 撖抵??勗?", "?摮?獢?, "?批捆SEO銵???, "?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Viveka von Rosen ?犖?? / Vengreso", description: "??芸 LinkedIn ?芸?獢撱箇??函? LinkedIn ?寡???", result: "鋡?LinkedIn 隤???LinkedIn ??亙?撠振嚗engreso ?寡? 1,000+ 隡平摰Ｘ", source: "Viveka von Rosen LinkedIn / Vengreso.com 2023" }, { company: "HP嚗ewlett-Packard嚗?璆?LinkedIn ?芸?", description: "? LinkedIn SEO ?芸?隡平??撌亙犖鞈?", result: "LinkedIn ?揣?航?摨行???300%嚗?璆剝??Ｚ蕭頩方???200%", source: "Viveka von Rosen 隡平摰Ｘ獢? 2020" }] });
    }

    // D7: Tim Hughes ??Social Selling Revolution (2016)
    {
      const slug = "li-hughes-social-selling";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["mbb-strategist", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["mbb-strategist", "social-selling-revolution"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "brand-dna"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "digital-reputation-building"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["campaign-orchestrator", "marketing-ops"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["campaign-orchestrator", "b2b-pipeline-linkedin"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Digital Body Language 撱箇?", description: "Tim Hughes 撘瑁矽?雿?隤????犖鞈?憒?霈眺摰嗥洵銝?澆停靽∩遙雿??anner?eadline?bout ?", tool: "internal", outputType: "digital_body_language_guide", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 2, name: "蝬脩窗撱箇?蝑", description: "閮剛?蝎暹???LinkedIn 蝬脩窗撱箇?閮?嚗?憭拚?? 5-10 ?璅?摰ｇ??犖???航?蝢斤嚗釭??潭??, tool: "internal", outputType: "network_building_plan", requiredSkills: ["mbb-strategist"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "閫貊鈭辣銵", description: "??葫瞏摰Ｘ??LinkedIn 瘣餃?閫貊鈭辣嚗?撌乩????瑯??豢???典???璈誑撠??孵??亥孛", tool: "internal", outputType: "trigger_event_playbook", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "蝞⊿?撱箇??蕭頩?, description: "撱箇?摰??LinkedIn Social Selling 蝞⊿?餈質馱蝟餌絞嚗??活????圈店??????暺?, tool: "internal", outputType: "pipeline_tracking_system", requiredSkills: ["campaign-orchestrator"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "蝷曄黎?瑕?拙撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?訾??脰亳撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "蝞⊿?撱箇?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Tim Hughes Social Selling Revolution LinkedIn B2B 蝑", description: "Source: Tim Hughes?ocial Selling: Techniques to Influence Buyers and Changemakers??016. DLA Ignite ?寡?頞? 50,000 B2B ?瑕鈭箏", steps });
      await upsertSquad(conn, { slug, name: "Tim Hughes Social Selling Revolution LinkedIn 撠?", description: "隞?Tim Hughes ?冗蝢日?桅?賣??塚?撱箇??訾?擃?閮?移皞雯蝯﹦?閫貊鈭辣銵????B2B LinkedIn ?瑕蝟餌絞", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Tim Hughes ??Social Selling Revolution (2016)", agents: agentMembers, tags: ["linkedin", "b2b", "social-selling", "pipeline"], useCases: ["隡平?瑕??LinkedIn蝑", "B2B璆剖??", "隡平摰Ｘ蝬剛風"], outputFormats: ["?訾?擃?閮??", "蝬脩窗撱箇?閮?", "閫貊鈭辣?", "蝞⊿?餈質馱"], requiredIntegrations: [], token: 55000, showcases: [{ company: "DLA Ignite嚗im Hughes ?勗??菔齒嚗?, description: "? Social Selling Revolution 獢?寡??函? B2B ?瑕??", result: "?寡?頞? 50,000 B2B ?瑕鈭箏嚗恥?嗥恣?像????30-40%", source: "DLA Ignite 摰雯 / Tim Hughes LinkedIn 2023" }, { company: "Oracle EMEA ?瑕??", description: "Tim Hughes ? Oracle 甇散?瑕??? Social Selling ?寞?", result: "LinkedIn ?脣??恣??????40%嚗?桅望?蝮桃 25%", source: "Tim Hughes?ocial Selling?銝剜?靘? }] });
    }

    // D8: John Nemo ??LinkedIn Riches (2014)
    {
      const slug = "li-nemo-riches";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["copywriting-pro", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["copywriting-pro", "linkedin-riches-method"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["hook-copywriter", "content-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "linkedin-connection-message"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "campaign-orchestrator"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["campaign-orchestrator", "linkedin-outreach-sequence"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?摰Ｘ LinkedIn ?揣", description: "閮剛?蝎暹???LinkedIn ?揣蝑嚗雿?璆准?貉?璅～?蝯?嚗?唳??寥????典恥?嗅???, tool: "internal", outputType: "ideal_client_linkedin_search", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?犖???閮閮剛?", description: "閮剛?瘥璅恥?嗥??犖???閮嚗??典?餈票????????荔??踹?隞颱??瑕??, tool: "internal", outputType: "personalized_connection_messages", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Value-First 頝脣???, description: "?????敺? 3-甇亥??脣???????鈭怎??皞??潛?瘙?瘥郊?賣?靘?潘?銝?交??, tool: "internal", outputType: "followup_sequence", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "Outreach ??餈質馱?芸?", description: "餈質馱????亙???閬??店????A/B 皜祈岫銝?閮?嚗?蝥???舀???, tool: "internal", outputType: "outreach_performance_report", requiredSkills: ["campaign-orchestrator"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "LinkedIn ?撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?犖???臬葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "憭?芸?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "John Nemo LinkedIn Riches 瞏恥?蝟餌絞", description: "Source: John Nemo?inkedIn Riches??014. Nemo ??芸蝟餌絞 90 憭拙敺?LinkedIn ?Ｗ $135,000 璆剔蜀嚗???頞? 150,000 鈭?, steps });
      await upsertSquad(conn, { slug, name: "John Nemo LinkedIn Riches 瞏恥?撠?", description: "? John Nemo ??LinkedIn Riches 蝟餌絞嚗移皞?蝝Ｔ??犖?????澆??????頧??? LinkedIn 憭璈", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "John Nemo ??LinkedIn Riches (2014)", agents: agentMembers, tags: ["linkedin", "outreach", "lead-generation", "personalization"], useCases: ["B2B瞏恥憭", "憿批???摰Ｘ?", "?瑕憭?芸???], outputFormats: ["?格?摰Ｘ?揣蝑", "?犖???閮", "頝脣????, "???勗?"], requiredIntegrations: [], token: 50000, showcases: [{ company: "John Nemo ?犖獢?", description: "? LinkedIn Riches ?寞?嚗?0 憭拙敺?LinkedIn 蝝?璈??舐?箸平蝮?, result: "90 憭拍??$135,000 璆剔蜀嚗??寡?頞? 150,000 鈭箸迨?寞?嚗inkedIn 頞? 20 ?祈蕭頩?, source: "John Nemo?inkedIn Riches?? Nemo Radio Podcast 2014-2023" }, { company: "銝剖?隡平??璆哨??踹?嚗ia Nemo ?寡?", description: "? LinkedIn Riches 憭蝟餌絞??砍隡平摰Ｘ", result: "3 ?? LinkedIn 憭?Ｗ $80,000 ?唳平蝮橘?憭???? 35%嚗平????5%嚗?, source: "John Nemo LinkedIn Riches 摮詨獢? 2021" }] });
    }

    // D9: Chris Walker ??Dark Social B2B Demand Generation (2021)
    {
      const slug = "li-walker-dark-social";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["mbb-strategist", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["mbb-strategist", "dark-social-demand-gen"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "linkedin-thought-leadership"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["attribution-modeling", "marketing-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["attribution-modeling", "dark-social-measurement"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Thought Leadership ?批捆蝑", description: "閮剛? LinkedIn ????摰寧??伐??澈?閬箄?暺?璆剜閰?撖行??霈?摰ＵSlack 頧雿?鞎潭???, tool: "internal", outputType: "thought_leadership_strategy", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 2, name: "?瘙?摰寡ˊ雿?, description: "鋆賭??賣霈眺摰嗆雁獢?摰對???誨??嚗??格?????唬???銝?????仿???憿?, tool: "internal", outputType: "demand_creation_content", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Dark Social 皜祇?獢", description: "撱箇??⊥?鋡?UTM 餈質馱??Dark Social 皜祇??寞?嚗??梁?蝞⊿?隤踵嚗?敺鋆∟隤芣???嚗?????撠?頞典", tool: "internal", outputType: "dark_social_measurement", requiredSkills: ["attribution-modeling"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?瘙???亙葦", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "????葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Dark Social ??撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Chris Walker Dark Social LinkedIn B2B ?瘙??, description: "Source: Chris Walker嚗efine Labs ?菔齒鈭綽?2021 撟湔???Dark Social + Demand Generation ??嚗?閬?B2B 銵甇詨??雁", steps });
      await upsertSquad(conn, { slug, name: "Chris Walker Dark Social B2B ?瘙????, description: "? Chris Walker ??Dark Social ??嚗 LinkedIn ?菟?甇???瘙??????瘙?嚗????函?銝???孵遣蝡蔣?踹?", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Chris Walker ??Dark Social Demand Generation (Refine Labs, 2021)", agents: agentMembers, tags: ["linkedin", "b2b", "demand-generation", "thought-leadership"], useCases: ["B2B SaaS?瘙??, "隡平??撣雿?", "銵平???撱箇?"], outputFormats: ["???????, "?瘙?摰?, "Dark Social 皜祇?獢"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Refine Labs嚗hris Walker ?菔齒嚗頨急?靘?, description: "? Dark Social ?瘙???伐??? LinkedIn ????遣蝡平?蔣?踹?", result: "Refine Labs 撟湔?亥???$1,000 ?穿?摰Ｘ?⊿?隞祥撱??靘? Dark Social ?芰憓", source: "Chris Walker LinkedIn / Refine Labs Revenue Report 2022" }, { company: "Metadata.io嚗hris Walker 摰Ｘ嚗?, description: "??瘙???塚?Walker ????葆??Metadata B2B SaaS ?", result: "撟?ARR 頞? $3,000 ?穿?LinkedIn ??憭扳?摰Ｖ?皞?銝", source: "Metadata.io ?祇?獢? 2022" }] });
    }

    // D10: Ross Simmonds ??Distribution First Strategy (Foundation, 2019)
    {
      const slug = "li-simmonds-distribution";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-repurposing", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-repurposing", "distribution-first-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "platform-native-distribution"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["cross-channel-analytics", "distribution-roi-tracking"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?批捆?日????潭?????, description: "?日??暹??批捆鞈嚗瘥?擃?澆摰寡???5-10 ????蝞⊿?嚗eddit 蝷曄黎?uora ???edium?inkedIn ????", tool: "internal", outputType: "content_distribution_inventory", requiredSkills: ["content-repurposing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "撟喳???澆??寧楊", description: "??蝭??孵澆摰寞撖怎?像?啁????澆?嚗inkedIn 鞎潭? = 璇???嚗uora = 閰喟敦閫??嚗eddit = ??????", tool: "internal", outputType: "platform_native_content", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 3, name: "??瑁???", description: "撱箇? 30 憭拙??澆銵?蝔?瘥予??1-2 蝭??唳撘??摰寧撣銝?蝞⊿?嚗遣蝡皜???閫賊?", tool: "internal", outputType: "distribution_execution_schedule", requiredSkills: ["cross-channel-analytics"] }, m3Info),
        assignAgentToStep({ order: 4, name: "???餈質馱?芸?", description: "餈質馱瘥??潛恣?葆靘?瘚???摰Ｕ?????霅 ROI ?擃??蝯?銝阡?銝剛?皞?, tool: "internal", outputType: "distribution_roi_report", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 5, name: "?琿??批捆?湔????, description: "霅 6-12 ????擃???批捆嚗?唳??瘣?敺??啣??潘?霈?摰寞?蝥???, tool: "internal", outputType: "evergreen_republishing_plan", requiredSkills: ["content-repurposing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "???澆?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "???撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ross Simmonds Distribution First ?批捆?蝚砌?蝑", description: "Source: Ross Simmonds?oundation Marketing??019. Simmonds 隤芥reate Once, Distribute Forever??Foundation Inc. 撟怠 B2B 隡平???蝑???批捆 ROI 10 ??, steps });
      await upsertSquad(conn, { slug, name: "Ross Simmonds Distribution First LinkedIn ?撠?", description: "? Ross Simmonds ??Distribution First ?脣飛嚗?憟賜??批捆銝鋆賭??憭????撱??銝蝭末?批捆???10 ?像?堆?ROI ?? 10 ??, industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Ross Simmonds ??Distribution First Strategy (Foundation, 2019)", agents: agentMembers, tags: ["linkedin", "content-distribution", "repurposing", "roi"], useCases: ["B2B?批捆ROI?憭批?", "憭像?啣??潛???, "?琿??批捆???], outputFormats: ["?璈?皜", "撟喳???澆???, "???", "ROI?勗?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Foundation Inc.嚗oss Simmonds ?菔齒嚗?, description: "? Distribution First 蝑嚗鼠??B2B 摰Ｘ?憭批?瘥??批捆?孛????, result: "摰Ｘ?批捆閫賊?撟喳??? 10 ???批捆 ROI 敺?2x ????15-20x", source: "Foundation Inc. 摰雯 / Ross Simmonds ?祇?獢? 2023" }, { company: "Shopify嚗oundation 摰Ｘ嚗?, description: "? Distribution First 撠?賣?批捆???20+ ?恣??, result: "??瘚?憓 40%嚗摰孵葆靘?瞏恥頧?????60%", source: "Foundation Inc. 獢??弦 2021" }] });
    }

    // ????????????????????????????????????????????????????????????????????    // CATEGORY E: ?批捆銵 Methodology Squads (E1?10)
    // ????????????????????????????????????????????????????????????????????
    // E1: Joe Pulizzi ??Content Inc. (2015)
    {
      const slug = "cm-pulizzi-content-inc";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "content-inc-framework"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "mbb-strategist"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "content-tilt-identification"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["email-marketing", "social-scheduler"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["email-marketing", "audience-building-email"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["copywriting-pro", "content-platform-pillar"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "??暺?雿?Sweet Spot嚗?, description: "?曉???亥??芸???暸?瘙?鈭日??????ulizzi 隤芸????暹???????暺??摰?, tool: "internal", outputType: "sweet_spot_definition", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "?批捆?暹?蝣箇?嚗ontent Tilt嚗?, description: "?函???銝剜?啁奎?剖???????閫漲嚗ontent Tilt嚗??霈????箝銝???銝凋?銝???", tool: "internal", outputType: "content_tilt_strategy", requiredSkills: ["mbb-strategist"] }, m2Info),
        assignAgentToStep({ order: 3, name: "?詨?撟喳?批捆鋆賭?", description: "?詨?銝?敹像?堆??刻??Podcast/YouTube嚗?瘥梁頂蝯梯撓?粹??釭?批捆嚗??血??暺?Content Tilt", tool: "internal", outputType: "platform_content_plan", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "Email ?撱箇?", description: "???詨?撟喳?批捆撱箇? Email 閮?嚗 Pulizzi ??暺????瘥蝷曄黎撟喳銝??湧?閬?, tool: "internal", outputType: "email_list_building_plan", requiredSkills: ["email-marketing"] }, m3Info),
        assignAgentToStep({ order: 5, name: "?憭?????, description: "?冽敹像?唳???嚗?憪? 2-3 ?活閬像?啣??潘??游之?閬?", tool: "internal", outputType: "diversification_plan", requiredSkills: ["social-scheduler"] }, m3Info),
        assignAgentToStep({ order: 6, name: "?批捆?平????, description: "閮剛???平?楝敺?撱?????押?鞎餉玨蝔蝐暑?????曇???亙???, tool: "internal", outputType: "monetization_strategy", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Content Inc. 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "??暺?蝛嗅葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Email ?撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "?批捆?萎?撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Joe Pulizzi Content Inc. ??芸??批捆銵獢", description: "Source: Joe Pulizzi?ontent Inc.??015 撟湔蝐?+ Content Marketing Institute ?菔齒?MI 鋡急鞈澆?隡啣潸???$17M嚗???Content Inc. 獢", steps });
      await upsertSquad(conn, { slug, name: "Joe Pulizzi Content Inc. ?撱箇?撠?", description: "?遣蝡??橘??遣蝡????Joe Pulizzi ??Content Inc. ?剜郊獢嚗????ontent Tilt?敹像?售??撱箇????澆?????璆剖?", industryKey: "marketing", missionType: taskType, workspace: ["content-marketing"], methodology: "Joe Pulizzi ??Content Inc. (2015)", agents: agentMembers, tags: ["content-marketing", "audience-building", "email", "brand"], useCases: ["?啣??摰寧???, "慦???璆剖遣蝡?, "?犖???平??], outputFormats: ["??暺???, "Content Tilt 蝑", "?批捆閮?", "?平?獢?], requiredIntegrations: [], token: 65000, showcases: [{ company: "Content Marketing Institute嚗ulizzi ?菔齒嚗?, description: "隞?Content Inc. 獢嚗??嗅遣蝡平???瑕蔣?踹???B2B ?批捆銵慦?", result: "CMI 撟湔?亥???$8M嚗◤ UBM 隞?$17.6M ?嗉頃嚗僑摨行暑??Content Marketing World 1,000+ ??璆剖撣?, source: "Joe Pulizzi?ontent Inc.?? CMI Annual Report" }, { company: "HubSpot Blog嚗?隡?Content Inc. 頝臬?嚗?, description: "隞?Sweet Spot嚗????瑕/???亥?嚗? Content Tilt嚗?鞎餃極????批捆嚗遣蝡?擃?銵", result: "HubSpot Blog ??????500 ?穿?Email ?頞? 300 ?穿?鞎Ｙ頞? 30% ?摰Ｘ", source: "HubSpot Annual Report 2022 / CEO Brian Halligan 閮芾?" }] });
    }

    // E2: Marcus Sheridan ??They Ask You Answer (2012/2017)
    {
      const slug = "cm-sheridan-they-ask";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "mbb-strategist"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "they-ask-you-answer"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "buyer-question-research"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["hook-copywriter", "marketing-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["hook-copywriter", "sales-enablement-content"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "鞎瑕振??憭扳???, description: "蝟餌絞??璅??暹???憿?Cost?roblems?omparisons?est?eviews嚗ig Five 銝駁?嚗heridan嚗?鞎餉鞎瑚??Ｗ???隞暻澆?憿???券??鈭?, tool: "internal", outputType: "buyer_question_bank", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "隤祕???批捆鋆賭?嚗???Cost/Pricing嚗?, description: "鋆賭?璆剔??隤祕?摰對??蝡嗅?瘥??撩暺??寥?嚗憭批??貊奎?剖????Ｗ??heridan ?風?眾嚗?撖血甈?", tool: "internal", outputType: "honest_answer_content", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "?瑕鞈西?批捆閮剛?", description: "閮剛?撟怠璆剖?鈭箏?券?桅?蝔葉雿輻?摰對?雿平瘝?Assignment Selling嚗?瞏恥?刻??Ｗ???????嚗???霅啣?鞈?, tool: "internal", outputType: "sales_enablement_materials", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 4, name: "SEO 餈質馱???, description: "餈質馱瘥????批捆??SEO ??嚗?撠??霈???”?株???嚗??亙鈭?憿葆靘?憭?鞈芷?瞏恥", tool: "internal", outputType: "seo_content_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "They Ask You Answer 撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "鞎瑕振???弦撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "?瑕鞈西撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Marcus Sheridan They Ask You Answer ?批捆銵?寞?", description: "Source: Marcus Sheridan?hey Ask You Answer??012/2017. Sheridan ??River Pools and Spas ?甇斗瘜???望???霈??函??憭犖?赤?虜瘜單?蝬脩?", steps });
      await upsertSquad(conn, { slug, name: "Marcus Sheridan They Ask You Answer ?批捆撠?", description: "??鞎瑕振???憿??蝡嗥撠?銝蝣啁?摰?撩暺arcus Sheridan ??撖行??塚???摨血蝡嗥?芸", industryKey: "marketing", missionType: taskType, workspace: ["content-marketing"], methodology: "Marcus Sheridan ??They Ask You Answer (2012/2017)", agents: agentMembers, tags: ["content-marketing", "seo", "inbound", "sales-enablement"], useCases: ["B2B??璆剖摰寡???, "擃摨行?鞎餃???, "?餃???靽∩遙撱箇?"], outputFormats: ["鞎瑕振??摨?, "隤祕???批捆", "?瑕鞈西??", "SEO?勗?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "River Pools and Spas嚗heridan ?芸嚗?, description: "2008 ???望???嚗誑 They Ask You Answer 獢??皜豢陶瘙眺摰嗆???憿?, result: "??函??憭犖?赤?虜瘜單?蝬脩?嚗???$200,000 撱??鞎鳴??瑕敺璈葉?Ｗ儔", source: "Marcus Sheridan?hey Ask You Answer?hapter 1 + ?祇?瞍?" }, { company: "Yale Appliance嚗heridan 摰Ｘ嚗?, description: "? They Ask You Answer 蝑嚗?撖血?蝑眺摰嗅?憿??祉奎??頛?, result: "??瘚?敺?15 ?祆?? 300 ????撟湧?桅?憓 40%", source: "Marcus Sheridan 摰Ｘ獢??弦 2019" }] });
    }

    // E3: Brian Dean ??Skyscraper Technique (Backlinko, 2015)
    {
      const slug = "cm-dean-skyscraper";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "skyscraper-technique"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "mbb-strategist"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "linkable-content-research"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["copywriting-pro", "10x-content-creation"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["marketing-ops", "marketing-analytics"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-ops", "link-outreach-ops"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "擃??瞏??批捆?萄?", description: "撠?格??摮葉鋡怠之?雯蝡??函????喳摰嫘?Ahrefs ????????曉??50+ ??????蝡?, tool: "internal", outputType: "linkable_content_targets", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "10x ?芾??批捆?萎?", description: "鋆賭?瘥??雿喳摰嫘?憿舀憟賬??嚗?啁??豢??瘛梁????皜??閬箝摰?項????, tool: "internal", outputType: "skyscraper_content_draft", requiredSkills: ["copywriting-pro"] }, m3Info),
        assignAgentToStep({ order: 3, name: "???憭?撱箇?", description: "撱箇?????啗???蝡???雯蝡??殷????舀??航???雿憟賜??祉?瞏靘?", tool: "internal", outputType: "link_prospect_list", requiredSkills: ["marketing-ops"] }, m4Info),
        assignAgentToStep({ order: 4, name: "?犖???憭", description: "撖?犖???舫隞塚?隤芣?雿撱箔??游末???研?靘擃?脤?嚗?瘙???圈???唬??摰?, tool: "internal", outputType: "link_outreach_emails", requiredSkills: ["marketing-ops"] }, m4Info),
        assignAgentToStep({ order: 5, name: "???撱箇???餈質馱", description: "餈質馱憭敺??????憓?omain Authority ????璈??????勗? Skyscraper ??", tool: "internal", outputType: "link_building_report", requiredSkills: ["marketing-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Skyscraper 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?批捆?弦撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "10x ?批捆撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "憭?瑁?撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Brian Dean Skyscraper Technique 頞?蝡嗥撠??批捆蝑", description: "Source: Brian Dean嚗acklinko嚗?015 撟湔???Skyscraper Technique嚗?甈⊥??冽?靘敺?110% ??瘚?憓", steps });
      await upsertSquad(conn, { slug, name: "Brian Dean Skyscraper Technique ?批捆???撱箇?撠?", description: "?曉?憭犖????摰對?????憿舀憟賜??嚗敺?閮湧?????犖????唬??ㄐ?rian Dean ??Skyscraper ?銵?隞亙?鞈芣????", industryKey: "marketing", missionType: taskType, workspace: ["content-marketing"], methodology: "Brian Dean ??Skyscraper Technique (Backlinko, 2015)", agents: agentMembers, tags: ["content-marketing", "seo", "link-building", "backlinks"], useCases: ["SEO ???撱箇?", "?批捆銵 ROI ??", "蝡嗥瞈???萄?蝒"], outputFormats: ["Skyscraper ?批捆", "憭?", "憭?萎辣璅⊥", "???勗?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Backlinko嚗rian Dean ?芾澈嚗?甈⊥?靘?, description: "? Skyscraper Technique ?箝oogle Ranking Factors??蝡遣蝡????", result: "2 ?勗??瘚?憓 110%嚗敺?300+ ??????嚗??箄?璆剜?鋡怠??函?蝛嗡?銝", source: "Brian Dean?kyscraper Technique?acklinko.com 2015" }, { company: "Ahrefs ?刻??, description: "蝟餌絞? Skyscraper ?寞??萎? SEO ?弦憿摰對????脣?璆剔??憭????", result: "Ahrefs Blog ??????200 ?穿?DA ? 79嚗?蝭?蝛嗆?蝡像?敺?500+ ?????", source: "Ahrefs Blog ?祇?獢? 2022" }] });
    }

    // E4: Ann Handley ??Everybody Writes (2014)
    {
      const slug = "cm-handley-everybody-writes";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["copywriting-pro", "content-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["copywriting-pro", "everybody-writes-standards"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "brand-dna"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "audience-empathy-research"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["hook-copywriter", "ad-copywriting-formulas"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["hook-copywriter", "editorial-quality-copywriting"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?瘛勗漲??敹?蝛?, description: "Ann Handley ?敹??athological Empathy嚗?????敹????典神隞颱?摮???瘛勗?圾??航狐???靽∩?暻潦??閬?暻?, tool: "internal", outputType: "pathological_empathy_profile", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "???脤?神雿?皞?, description: "撱箇???撖思?璅?嚗擃?隤除??嚗??芾牧??頞??????犖??閫??嚗葆銝暺厭暺?銝?靽?", tool: "internal", outputType: "brand_voice_writing_guide", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 3, name: "?批捆?阮?萎?", description: "靘?Handley ??蝔輻?????神??ugly first draft嚗????ㄗ嚗末?批捆?臬神?箔??楊頛臬靘?", tool: "internal", outputType: "content_drafts", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "蝺刻摩??鞈芣???, description: "? Handley ?楊頛舀??殷??臬??寡?暺?衣霈?神嚗??砍閫漲嚗?衣????具?瘞??虫???, tool: "internal", outputType: "edited_final_content", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 5, name: "撖思???撱箇?", description: "撱箇?蝯??抒?撖思???嚗nn Handley 隤芣??犖?賡?閬神雿?身閮神雿?蝺渲????釭璅?", tool: "internal", outputType: "writing_culture_program", requiredSkills: ["content-marketing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?釭撖思?撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "??弦撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "蝺刻摩撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ann Handley Everybody Writes ?批捆?釭璅?獢", description: "Source: Ann Handley?verybody Writes??014 撟渡?蝝??望?瑟?andley ?臬???蔣?踹??摰寡??瑚犖銋?嚗orbes 閰嚗?, steps });
      await upsertSquad(conn, { slug, name: "Ann Handley Everybody Writes 撖思??釭撠?", description: "隞?Ann Handley ??????敹韏琿?嚗遣蝡???單?皞??Ｗ?迤?箏??曇??箏?貉神???釭?批捆", industryKey: "marketing", missionType: taskType, workspace: ["content-marketing"], methodology: "Ann Handley ??Everybody Writes (2014)", agents: agentMembers, tags: ["content-marketing", "copywriting", "brand-voice", "quality"], useCases: ["??撖思?璅?撱箇?", "?批捆?釭??", "撖思????寡?"], outputFormats: ["???敹?蝛?, "???脤??", "?釭?批捆", "撖思?閮毀閮?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "MarketingProfs嚗nn Handley ?遙 CCO嚗?, description: "? Everybody Writes 璅?蝟餌絞????MarketingProfs ??摰孵?鞈?, result: "Email Newsletter 閮頞? 60 ?穿??縑????35%嚗僑摨行暑??B2B Marketing Forum 1,000+ 鈭?, source: "MarketingProfs.com / Ann Handley LinkedIn" }, { company: "REI嚗憭???", description: "? Everybody Writes ??霈??摰寡韏瑚?????嗅??末??隡平摰?", result: "?恥??????500 ?穿???賊?蝒 2,000 ?穿??餃?頧?????25%", source: "REI Co-op Journal / Content Marketing Institute Case Study 2019" }] });
    }

    // E5: Andy Crestodina ??Brain Food Data-Driven Content (Orbit Media, 2009)
    {
      const slug = "cm-crestodina-brain-food";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "marketing-analytics"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "data-driven-content-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "mbb-strategist"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "content-research-methodology"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-content-creator", "copywriting-pro"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "data-visualization-content"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "??弦閮剛?", description: "閮剛??賜???菜???弦隤踵嚗restodina ??Blogging Statistics 撟游漲隤踵?璆剔??鋡怠??函??批捆嚗??菜???澆予?嗅????蝤", tool: "internal", outputType: "research_survey_design", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "?豢??園?????, description: "?瑁?隤踵???璆剜?????暹??祇??豢????Ｗ璆剔?撠??摰嗆?撖?, tool: "internal", outputType: "research_data_analysis", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "?豢?閬死?摰寡ˊ雿?, description: "撠??菜?ˊ雿擃?鈭急抒?閬死?批捆嚗?閮?銵具?銵函??????Crestodina 隤芾?閬箏?霈?牧閰?, tool: "internal", outputType: "data_visualization_content", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "?弦?勗??澆??撱?, description: "?澆?摰?弦?勗?銝血摰撱????慦?憭??璆剜?閬?鋡?鈭怒mail ??嚗?憭批???弦?孛????, tool: "internal", outputType: "research_promotion_plan", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "?弦敶梢?蕭頩?, description: "餈質馱?弦?勗?撣嗡????????擃??具冗蝢文?鈭怠? Email 閮???瘀?閰摯?弦 ROI", tool: "internal", outputType: "research_impact_report", requiredSkills: ["marketing-analytics"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?豢??弦蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?弦閮剛?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "?豢?閬死撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Andy Crestodina ?豢?撽???弦?批捆蝑", description: "Source: Andy Crestodina嚗rbit Media嚗?009 撟渲絲蝟餌絞????摰寧??伐?撟游漲 Blogging Statistics 隤踵鋡怨???10,000 ?雯蝡???, steps });
      await upsertSquad(conn, { slug, name: "Andy Crestodina ?豢?撽??批捆?弦撠?", description: "隞亙??萇?蝛嗅??祕?豢??箸敹ˊ雿平??鋡怠??函??批捆?ndy Crestodina ???塚??豢??臬摰寧?霅瑕?瘝喉???豢?蝑憭拍?????蝤", industryKey: "marketing", missionType: taskType, workspace: ["content-marketing"], methodology: "Andy Crestodina ??Data-Driven Content (Orbit Media, 2009)", agents: agentMembers, tags: ["content-marketing", "research", "data", "link-building"], useCases: ["銵平?弦?勗?鋆賭?", "????遣蝡?, "SEO ???撱箇?"], outputFormats: ["?弦隤踵閮剛?", "?豢????勗?", "閬死??閮?銵?, "?典誨閮?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Orbit Media 撟游漲 Blogging Statistics嚗restodina嚗?, description: "瘥僑隤踵 1,000+ 雿?賢恥嚗撣?璆剜?摰??賣?豢??勗?", result: "?勗?鋡?10,000+ ?雯蝡??剁???Orbit Media 撣嗡?頞? 2,000 ?????嚗?賣??????100 ??, source: "OrbitMedia.com / Ahrefs ??????? 2023" }, { company: "HubSpot State of Marketing嚗?隡潭瘜?", description: "瘥僑?澆??tate of Marketing?僑摨衣?蝛嗅????銵平?豢?瘣?", result: "撟游漲?勗?瘥活?澆??詨? 10,000+ 甈∩?頛???HubSpot 撣嗡? 50,000+ ? Lead", source: "HubSpot Annual Marketing Report 2022" }] });
    }

    // E6: Rand Fishkin ??Sparktoro Audience Research Method (2019)
    {
      const slug = "cm-fishkin-sparktoro";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["market-research-agent", "mbb-strategist"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["market-research-agent", "audience-intelligence-research"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "marketing-strategy-pmm"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "audience-centered-content"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-media-marketing", "marketing-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-media-marketing", "influencer-channel-mapping"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "??瘛勗漲?弦", description: "? Sparktoro ?寞??弦?嚗????芯? YouTube??芯? Podcast?蕭頩文鈭?Instagram??鈭怠鈭蜓憿??典鋆⊥??閮?, tool: "internal", outputType: "audience_intelligence_report", requiredSkills: ["market-research-agent"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?敶梢皜??啣?", description: "蝜芾ˊ?格???蔣?踵????? Top 20 ?蔣?蹂???慦??OL?冗蝢扎odcast嚗??臬摰孵??潛??擃????, tool: "internal", outputType: "influence_channel_map", requiredSkills: ["social-media-marketing"] }, m3Info),
        assignAgentToStep({ order: 3, name: "?隤???敹蜓憿遣蝡?, description: "?弦?憒??膩隞???嚗?撖西?閮嚗?隞交迨?啣神?批捆璅???餈堆?蝣箔??批捆?質◤????潸??箸?箸?撖怎???, tool: "internal", outputType: "audience_language_guide", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "皜??芸??批捆蝑", description: "靘蔣?踵???身閮摰寧??伐??典??曉虜?餌?皜??澆??批捆嚗??芸?芸楛?恣???靘?, tool: "internal", outputType: "channel_first_content_strategy", requiredSkills: ["marketing-strategy-pmm"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "??撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?撠??批捆撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "皜??啣?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Rand Fishkin Sparktoro ??撽??批捆蝑", description: "Source: Rand Fishkin嚗parktoro ?菔齒鈭綽?2019 撟湧??萄??暹??梢????瑟瘜parktoro ?? 1.4 ?冗蝢文董???銵", steps });
      await upsertSquad(conn, { slug, name: "Rand Fishkin Sparktoro ???批捆撠?", description: "??閫???曉?芾ㄐ??隤啣蔣?踴隞暻潸?閮嚗?瘙箏???暻澆摰嫘?芾ㄐ??and Fishkin ???暹??梢????塚???典?嚗摰孵敺?, industryKey: "marketing", missionType: taskType, workspace: ["content-marketing"], methodology: "Rand Fishkin ??Audience Intelligence Research (Sparktoro, 2019)", agents: agentMembers, tags: ["content-marketing", "audience-research", "channel-strategy", "data"], useCases: ["?批捆蝑?嗅?", "?格???弦", "皜???芸?"], outputFormats: ["???勗?", "敶梢皜??啣?", "?隤???", "皜??芸?蝑"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Sparktoro ?芾澈嚗and Fishkin ?菔齒嚗?, description: "??芸???寞?撱箇? Sparktoro ??嚗??其???璈摰寡??瑟???, result: "Sparktoro ?冽???鞎餃誨????銝?撟?ARR 頞? $300 ??, source: "Rand Fishkin ?祇?鞎∪??豢? 2022 / SparkToro.com" }, { company: "Moz嚗and Fishkin ?菔齒嚗?, description: "????弦?嗅? Moz Blog ?摰寧???, result: "Moz Blog ? SEO 璆剔??鋡怠??函??批捆鞈?嚗?瘚?頞? 300 ?穿?鋡?iContact 隞?$67.5M ?嗉頃", source: "Moz.com / TechCrunch ?勗? 2021" }] });
    }

    // E7: Mark Schaefer ??Content Shock Differentiation (The Content Code, 2015)
    {
      const slug = "cm-schaefer-content-shock";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "brand-dna"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "content-shock-differentiation"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "mbb-strategist"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "content-niche-gap-analysis"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["content-marketing", "copywriting-pro"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["content-marketing", "differentiated-content-creation"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?批捆憌賢?摨衣奎?剖???, description: "???格??批捆???摰寡???摨佗?撌脫?憭??批捆蝡嗥?見??釣??嚗?粹?摨衣奎?剖???甇???絲蝻箏", tool: "internal", outputType: "content_shock_analysis", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "?函撌桃??摨血?雿?, description: "?曉?芣?雿??撌桃?摰寡?摨佗??函閬??畾?甇瑯?蝻箸??撣貉?閫暺chaefer嚗ontent Shock 敺??芣?撌桃???賜?摮?, tool: "internal", outputType: "differentiation_positioning", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "撌桃?摰寡ˊ雿?, description: "鋆賭?撅?函撌桃????批捆嚗??芣?蝡嗥撠??憟賬????砌???, tool: "internal", outputType: "differentiated_flagship_content", requiredSkills: ["content-marketing"] }, m3Info),
        assignAgentToStep({ order: 4, name: "蝷曄黎霅瑕?瘝喳遣蝡?, description: "撱箇???誑銴ˊ?冗蝢方風?眾嚗?撖西???撅祉冗蝢扎摰嗥?蝛塚?霈榆?啣???誑鋡急?韏?, tool: "internal", outputType: "community_moat_plan", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "撌桃???亙葦", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "蝡嗥??撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "撌桃?摰孵葦", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Mark Schaefer Content Shock 撌桃?摰寧???, description: "Source: Mark Schaefer?he Content Code??015 撟湔???Content Shock ???chaefer ??Businessesgrow.com ??????100 ??, steps });
      await upsertSquad(conn, { slug, name: "Mark Schaefer Content Shock 撌桃?摰孵???, description: "?典摰寞揪瘚葉撱箇??迤?榆?啣?霅瑕?瘝喋ark Schaefer ???塚?Content Shock ?誨嚗?撌桃?停瘨仃", industryKey: "marketing", missionType: taskType, workspace: ["content-marketing"], methodology: "Mark Schaefer ??Content Shock Differentiation (The Content Code, 2015)", agents: agentMembers, tags: ["content-marketing", "differentiation", "brand", "strategy"], useCases: ["蝡嗥瞈???渡??批捆蝑", "?????摰?", "?批捆???芸?"], outputFormats: ["?批捆銵???", "撌桃??雿?, "??批捆", "霅瑕?瘝唾???], requiredIntegrations: [], token: 55000, showcases: [{ company: "Schaefer ??Businessesgrow.com ?芾澈", description: "? Content Shock 獢嚗誑???瑚犖?批???寡?摨血?????瑕摰孵??港葉撌桃??, result: "??????100 ?穿?瘥僑?????批捆撣嗡?隢株岷璆剖?頞? $500,000", source: "Mark Schaefer ?犖蝬脩? / Known (Schaefer, 2017)" }, { company: "Drift嚗hris Walker 隞?Content Shock ???箏蝷?", description: "??B2B SaaS 撣銝剜?啜?閰梯??瑯?孵榆?啣?閫漲嚗?頝脣歇憌賢??摰寡??瑁楝蝺?, result: "Drift 隡啣潮? $10 ??撟?ARR 頞? $1 ????閰梯??瑯??箸平???", source: "Drift.com / Forbes 2020" }] });
    }

    // E8: Robert Rose ??Chief Content Officer Method (Content Marketing Institute, 2017)
    {
      const slug = "cm-rose-cco";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "campaign-orchestrator"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "cco-content-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "brand-dna"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "content-mission-statement"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "marketing-ops"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "content-business-roi"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?批捆銵雿踹?脫?", description: "?啣神皜?摰寡??瑚蝙?質???????璅??整?靘摰寥???霈??憭??暹?ose 隤芯蝙?質??批捆蝑??璆菜?", tool: "internal", outputType: "content_mission_statement", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 2, name: "?鈭箸撱箇?", description: "撱箇??琿????曆犖?潘?Persona嚗?銝?臭犖??敺蛛???隞?靽∪艙蝟餌絞?捱蝑?蝔摰寞?鞎餌???, tool: "internal", outputType: "audience_personas", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "?批捆蝑?嗆?", description: "撱箇?摰??璆剖摰寧??交瑽??批捆銝駁?撅斤??撘??????皞???霈摰寞??箇?甇???平鞈", tool: "internal", outputType: "content_strategy_architecture", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "蝺刻摩銵??身閮?, description: "閮剛?蝯???蝺刻摩銵????游?璆剖?銵??迤蝭?找蜓憿??暹?蝔?畾蛛?蝣箔?瘥??批捆?賣?蝑?桃?", tool: "internal", outputType: "editorial_calendar", requiredSkills: ["marketing-ops"] }, m3Info),
        assignAgentToStep({ order: 5, name: "?批捆 ROI 皜祇?獢", description: "撱箇??批捆 ROI 皜祇?獢嚗?蝢拙摰孵??芯?璆剖????甜?鳴?瞏恥??摮撘蛛?嚗? C-Suite ?圾?批捆??璆剖??, tool: "internal", outputType: "content_roi_framework", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "CCO 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?批捆雿踹撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "ROI 皜祇?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Robert Rose CCO 隡平?批捆蝑獢", description: "Source: Robert Rose & Joe Pulizzi?anaging Content Marketing??011 / Content Marketing Institute CMO ?寞?隢ose 隢株岷???函? Top 500 隡平", steps });
      await upsertSquad(conn, { slug, name: "Robert Rose CCO 隡平?批捆蝑撠?", description: "隞仿?撣剖摰孵??雁撱箇?隡平蝝摰寧??伐?敺蝙?質? ROI 獢嚗??批捆??舫???璆剖?撽?撘?", industryKey: "marketing", missionType: taskType, workspace: ["content-marketing"], methodology: "Robert Rose ??Chief Content Officer Method (CMI, 2017)", agents: agentMembers, tags: ["content-marketing", "strategy", "enterprise", "roi"], useCases: ["隡平?批捆蝑撱箇?", "CMO/CCO ?批捆閬?", "?批捆 ROI ?勗?"], outputFormats: ["雿踹?脫?", "?鈭箸", "?批捆蝑?嗆?", "蝺刻摩銵???, "ROI獢"], requiredIntegrations: [], token: 65000, showcases: [{ company: "Salesforce嚗obert Rose 憿批?嚗?, description: "? CCO 獢撱箇?隡平蝝摰寡??瑞??伐?霈?Trailhead 撟喳?璆剔??憟賜?摮貊??批捆??", result: "Trailhead 頞? 700 ?祉?塚?Salesforce ????批捆?璆剔?璅▼", source: "Robert Rose ?祇?瞍? Dreamforce 2019" }, { company: "LinkedIn Marketing Solutions", description: "? CCO ?寞?撱箇?摰??B2B 銵?批捆蝑?嗆?", result: "LinkedIn Marketing Blog ??????100 ?穿?? B2B 銵鈭粹??詨飛蝧?皞?, source: "LinkedIn Marketing Blog / Content Marketing Institute 2020" }] });
    }

    // E9: Jay Baer ??Talk Triggers (Word-of-Mouth Marketing, 2018)
    {
      const slug = "cm-baer-talk-triggers";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "brand-dna"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "talk-trigger-design"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "content-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "word-of-mouth-research"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-media-marketing", "copywriting-pro"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-media-marketing", "talk-trigger-amplification"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "???閫貊暺?蝛?, description: "?弦?暹?摰Ｘ?撣詨?鈭怠鈭???撽?隤踵???撣詨????澈??隞暻潔?嚗?箄?嗥?????閫貊暺?, tool: "internal", outputType: "talk_trigger_research", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "Talk Trigger 閮剛?", description: "閮剛?銝???粹???撌桃????敹???Remarkable嚗澆?隤芸嚗epeatable嚗?甈⊿???elevant嚗?????嚗easonable嚗??銵?", tool: "internal", outputType: "talk_trigger_design", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "?批捆?舀蝟餌絞閮剛?", description: "閮剛??舀 Talk Trigger ?摰寧頂蝯梧?霈恥?嗉頛??澈??IG Stories ?澆??恥?嗆?鈭頛胯GC 敺菟?瘣餃?", tool: "internal", outputType: "content_support_system", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "????湔餈質馱", description: "餈質馱 Talk Trigger 撣嗡??蝣?????????嗆?阡??冗蝢?UGC ?賊??PS 閰?霈?", tool: "internal", outputType: "word_of_mouth_tracking", requiredSkills: ["social-media-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Talk Trigger 閮剛?撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "????弦撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "????湔撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jay Baer Talk Triggers ???閫貊銵蝟餌絞", description: "Source: Jay Baer & Daniel Lemin?alk Triggers??018. Baer ?弦??頞? 1,000 摰嗡?璆剔????銵獢?", steps });
      await upsertSquad(conn, { slug, name: "Jay Baer Talk Triggers ???銵撠?", description: "閮剛?霈恥?嗆?銝蝳?鈭怎??alk Trigger??霈蝣??瑞頂蝯勗??ay Baer ???塚??靘踹??誨?雿??摰Ｘ", industryKey: "marketing", missionType: taskType, workspace: ["content-marketing"], methodology: "Jay Baer ??Talk Triggers (2018)", agents: agentMembers, tags: ["content-marketing", "word-of-mouth", "customer-experience", "viral"], useCases: ["??璆剖蝣???, "??摰Ｘ擃?閮剛?", "UGC 銵閮?"], outputFormats: ["Talk Trigger 閮剛??辣", "?批捆?舀蝟餌絞", "???餈質馱?勗?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "DoubleTree by Hilton嚗澈?概??擗嗾 Talk Trigger嚗?, description: "瘥??乩?摰Ｖ犖??Check-in ?敺?憛澈?勗概??擗嗾嚗???頞???蝪∪銵?", result: "瘥僑?函冗蝢文?擃??Ｙ??貊?祆活????嚗恥?嗆遛?漲 NPS 擃璆剔???30%", source: "Jay Baer?alk Triggers?oubleTree 獢?蝡? + DoubleTree ?祇??豢?" }, { company: "Cheesecake Factory嚗???Talk Trigger嚗?, description: "頞? 250 ????蝝?憭扯??格???Talk Trigger嚗恥鈭箸?啗??桀停?喳?鈭怎??, result: "Instagram 瘥僑?脣?頞? 100 ?砍撐??賊? UGC嚗????嗅漲?舀平?奎?剖??? 3 ??, source: "Jay Baer?alk Triggers?heesecake Factory 獢?" }] });
    }

    // E10: Jeff Bullas ??Power Blogging Method (2010??019)
    {
      const slug = "cm-bullas-power-blogging";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "social-media-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "power-blogging-method"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["hook-copywriter", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "blog-headline-mastery"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-scheduler", "marketing-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-scheduler", "blog-amplification-system"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "SEO ?摮?賣閮?", description: "?弦?格???揣?撠暸??萄?嚗遣蝡誑??瘚??箏蝷??刻?潛撣???蝣箔?瘥????賡?撠?撖行?蝝ａ?瘙?, tool: "internal", outputType: "keyword_blog_plan", requiredSkills: ["market-research-agent"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "蝤?璅?閮剛?", description: "閮剛?暺??扔擃??刻?潭?憿??詨?皜?ow-to ??撖蝷箏???憿?嚗ullas 隤芣?憿捱摰?80% ??蝡???, tool: "internal", outputType: "power_headline_variants", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "?瑞?瘛勗漲???萎?", description: "?啣神 2,000-3,000 摮誑銝?瘛勗漲??嚗??怠??菜?撖??啁?瑽?閬箸?湛?瘥奎?剖???瘛箄????游???, tool: "internal", outputType: "long_form_blog_post", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 4, name: "蝷曄黎?湔蝟餌絞", description: "閮剛??澆?敺?蝷曄黎?湔閮?嚗?甈∪銝????澈?啁冗蝢文?擃?? Email ??嚗?隢?雿丰隡游?鈭?, tool: "internal", outputType: "blog_amplification_plan", requiredSkills: ["social-scheduler"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Power Blogging 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "璅???撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "?湔??撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jeff Bullas Power Blogging 瘚?憓蝟餌絞", description: "Source: Jeff Bullas?logging the Smart Way??012. JeffBullas.com ??????400 ?穿?Forbes 閰?函? Top 50 蝷曄黎慦?敶梢??, steps });
      await upsertSquad(conn, { slug, name: "Jeff Bullas Power Blogging 瘚?憓撠?", description: "? Jeff Bullas ??Power Blogging ?寞?嚗EO ?摮?+ 蝤?璅? + 瘛勗漲?批捆 + 蝷曄黎?湔嚗??嗅遣蝡???100 ?祆?瘚????琿?賣", industryKey: "marketing", missionType: taskType, workspace: ["content-marketing"], methodology: "Jeff Bullas ??Power Blogging Method (2010)", agents: agentMembers, tags: ["content-marketing", "blogging", "seo", "amplification"], useCases: ["隡平?刻?潭??遣蝡?, "?犖???刻??, "SEO 撽??批捆銵"], outputFormats: ["SEO ?刻?潸???, "蝤?璅?皜", "瘛勗漲??", "?湔閮?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "JeffBullas.com嚗頨急?靘?", description: "? Power Blogging ?寞?嚗頂蝯勗?撱箇?擃??冗蝢文?擃??琿?賣", result: "??????400 ?穿?Email ?頞? 30 ?穿?Forbes Top 50 蝷曄黎慦?敶梢??, source: "JeffBullas.com / Forbes 閰 2018" }, { company: "Social Media Examiner嚗ike Stelzner嚗?, description: "?憿撮 Power Blogging 獢嚗頂蝯勗?撱箇?璆剔??憭抒?蝷曄黎慦?銵?刻??, result: "??????100 ?穿?Email ?頞? 40 ?穿?撟游漲 Social Media Marketing World 憭扳? 5,000+ ?箏葉", source: "SocialMediaExaminer.com ?祇??豢? 2022" }] });
    }

    // ????????????????????????????????????????????????????????????????????    // CATEGORY F: Email 銵 Methodology Squads (F1?10)
    // ????????????????????????????????????????????????????????????????????
    // F1: Ryan Deiss ??The Email Machine (DigitalMarketer, 2014)
    {
      const slug = "em-deiss-email-machine";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["email-marketing", "campaign-orchestrator"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["email-marketing", "email-machine-framework"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "automated-email-sequence-copy"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "attribution-modeling"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "email-funnel-analytics"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?仿?隤?摨?嚗ndoctrination嚗?, description: "閮剛??啗??梯? 5-7 撠迭餈???隞晶???詨?????潸???敺身摰?霈??梯?24 撠??抒?閫?隞暻潸??釣雿?, tool: "internal", outputType: "indoctrination_sequence", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "鈭???摨?嚗ngagement嚗?, description: "閮剛??????孵潛?鈭?摨?嚗??聆?獢???霅?撌亙嚗?閮????靽∠???蒂閬???臭縑鞈?", tool: "internal", outputType: "engagement_sequence", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "??頧?摨?嚗scension嚗?, description: "閮剛?敺?鞎餉??梯隞祥摰Ｘ??蝝??????????箇?閮?????典?鞈潸眺銵?", tool: "internal", outputType: "ascension_sequence", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 4, name: "蝝啣???????Segmentation + Re-engagement嚗?, description: "靘??箇敦???梯?銝西身閮?30/60/90 憭拍鈭??????????敹萎??? ?孵?芣?", tool: "internal", outputType: "segmentation_reengagement", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "Email 璈???芸?", description: "餈質馱?游?Email Machine ??暺??縑?????????閮?嚗??交??閬??摨?蝭暺?, tool: "internal", outputType: "email_machine_performance", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Email 璈撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Email ??撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "????撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ryan Deiss Email Machine ?芸????瑞頂蝯?, description: "Source: Ryan Deiss / DigitalMarketer?mail Machine??014. DigitalMarketer ?甇斗??嗥恣????700 ?祈??梯?Email 蝟餌絞", steps });
      await upsertSquad(conn, { slug, name: "Ryan Deiss Email Machine ?芸?????, description: "撱箇? Indoctrinate ??Engage ??Ascend ??Segment ??Re-engage ???渲?? Email 蝟餌絞嚗? Email ?頧??箏????亙???, industryKey: "marketing", missionType: taskType, workspace: ["email-marketing"], methodology: "Ryan Deiss / DigitalMarketer ??Email Machine (2014)", agents: agentMembers, tags: ["email", "automation", "funnel", "retention"], useCases: ["?餃?Email銵蝟餌絞", "SaaS閮???, "???Email摨?"], outputFormats: ["5憟mail摨?", "蝝啣?蝑", "??餈質馱?勗?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "DigitalMarketer ?芾澈嚗yan Deiss嚗?, description: "? Email Machine 獢蝞∠? 700 ?? 閮??瘥梁??曇撠??琿隞?, result: "Email 鞎Ｙ DM 撟湔?亥???$20M嚗像??靽∠?頞? 25%嚗??梯?LTV ?舀平????2 ??, source: "DigitalMarketer.com / Ryan Deiss Traffic & Conversion Summit 瞍?" }, { company: "Agora Financial", description: "??詨? Indoctrinate + Ascend 摨?獢蝞∠?樴之閮????, result: "Email 蝟餌絞撟湔?亥???$1 ??瘥?閮?像??LTV 頞? $200", source: "Agora Publishing Annual Reports" }] });
    }

    // F2: Andre Chaperon ??Soap Opera Sequence (AutoResponder Madness, 2010)
    {
      const slug = "em-chaperon-soap-opera";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["email-marketing", "copywriting-pro"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["email-marketing", "soap-opera-sequence"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["hook-copywriter", "ad-copywriting-formulas"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "cliffhanger-email-copy"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "憭?Hook + ???", description: "Email 1嚗???抒?? Big Hook嚗??亥?撘銝餉?嚗????????舀?鈭?霈????颱誨??, tool: "internal", outputType: "hook_backstory_email", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 2, name: "銵?鈭辣 + ?詨艙", description: "Email 2嚗??隞暻潮??萎?隞?頧?暺?撘銵?嚗蒂?函?撠曄?銝敹蛛???憭拇???閮港???獐閫?捱?艾?, tool: "internal", outputType: "conflict_cliffhanger_email", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "???", description: "Email 3嚗?鈭急霈?????/?潛/閫?捱?寞?嚗?霈??閬箔????喳????見????, tool: "internal", outputType: "epiphany_email", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "?梯?憟質??剔內", description: "Email 4嚗蝷箄??梯?銝?撌梢?閬???末??瘛勗?撠圾瘙箸獢?皜湔?", tool: "internal", outputType: "hidden_benefit_email", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "?潛捲銵?", description: "Email 5嚗??擃蔭敺?嗆??Call to Action嚗haperon 隤芥???鈭牧敺末嚗?格??芰?潛???, tool: "internal", outputType: "cta_email", requiredSkills: ["hook-copywriter"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Soap Opera 摨?撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?詨艙??撣?, order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Andre Chaperon Soap Opera Sequence ????Email 摨?", description: "Source: Andre Chaperon?utoResponder Madness??010. Chaperon 鋡?Email 銵?迂?箝予????SOS 獢霈?靽∠??? 3-5 ??, steps });
      await upsertSquad(conn, { slug, name: "Andre Chaperon Soap Opera Email 摨?撠?", description: "?冽?扳?鈭?瑽神 Email 摨?嚗之 Hook ????? ??銵??詨艙 ???? ???梯?憟質? ??銵??潛捲?ndre Chaperon ?瘜?鈭箸銝??閮?, industryKey: "marketing", missionType: taskType, workspace: ["email-marketing"], methodology: "Andre Chaperon ??Soap Opera Sequence (AutoResponder Madness, 2010)", agents: agentMembers, tags: ["email", "storytelling", "autoresponder", "conversion"], useCases: ["?啗??梯elcome摨?", "蝺?隤脩?Email銵", "擃?寞??mail?瑕"], outputFormats: ["5撠?Soap Opera 摨?", "?詨艙??璅⊥"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Andre Chaperon ?犖??嚗utoResponder Madness嚗?, description: "??芸??Soap Opera Sequence嚗?????瑕蔣?踹???Email 銵隤脩???", result: "AutoResponder Madness ?瑕頞? $1,000 ?穿?璆剔?鋡怎迂?箝??脖誑靘?憟賜? Email 銵????, source: "Andre Chaperon 蝬脩? / Rich Schefren?eff Walker ?祇?閬?" }, { company: "Russell Brunson嚗??SOS 獢嚗?, description: "?具otCom Secrets?葉?典誨 Chaperon ??SOS 獢銝血之閬芋?", result: "ClickFunnels ??Email 摨?? SOS 敺?頧?????300%嚗?靽∠?頞? 40%", source: "Russell Brunson?otCom Secrets?hapter on Email" }] });
    }

    // F3: Ramit Sethi ??Email Course + Teach First Sell Second (2009)
    {
      const slug = "em-sethi-email-course";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["email-marketing", "content-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["email-marketing", "teach-first-sell-second"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "email-course-copywriting"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "campaign-orchestrator"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["campaign-orchestrator", "email-course-funnel"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Email 隤脩?璁艙閮剛?", description: "閮剛?銝???5-7 憭抵圾瘙箄??梯敹?憿??祥 Email 隤脩??amit Sethi ??嚗策隞???憟踝?隞?靽∩遙雿?銝??, tool: "internal", outputType: "email_course_concept", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?亥玨?批捆?啣神", description: "?啣神瘥予?玨蝔摰對?蝯?皜???琿?銵?甇仿??? Ramit ?寡??亥?瘞??霈??梯?憭拚??銝?撠?, tool: "internal", outputType: "daily_course_emails", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "靽∩遙撱箇?璈", description: "?刻玨蝔?蝚?4-5 憭抵?嗅??亙???隞祥?Ｗ?嚗??臬誨????????唾??湔楛?伐???銝?瘜隞亙鼠雿???, tool: "internal", outputType: "trust_bridge_email", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 4, name: "隤脩?頧?摨?", description: "隤脩?摰?敺? 3-5 撠?????撘瑁矽隤脩??? ???閮??銝甇亦?暺???隞祥閫?捱?寞?隞晶 ?????芣?", tool: "internal", outputType: "post_course_conversion", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "Email 隤脩???餈質馱", description: "餈質馱隤脩?摰????仿?靽∠???鞎餉???嚗?玨蝔摰孵?頧?摨?", tool: "internal", outputType: "email_course_analytics", requiredSkills: ["campaign-orchestrator"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Email 隤脩?蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "隤脩???撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "瞍???撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ramit Sethi ??敺都 Email 隤脩?瞍?", description: "Source: Ramit Sethi嚗WillTeachYouToBeRich嚗?009 撟渲絲????鞈?Email 蝑?ethi 撟湔?亥???$1 ???冽迨?寞?", steps });
      await upsertSquad(conn, { slug, name: "Ramit Sethi ??敺都 Email 隤脩?撠?", description: "隞亙?鞎?Email 隤脩??遣蝡縑隞鳴???嗆?箔?鞎餃?蝝amit Sethi ?瘜???撅內雿?憟踝??閬?隞祥", industryKey: "marketing", missionType: taskType, workspace: ["email-marketing"], methodology: "Ramit Sethi ??Teach First, Sell Second Email Course (2009)", agents: agentMembers, tags: ["email", "course", "trust-building", "conversion"], useCases: ["?亥???mail銵", "蝺?隤脩?瞏恥?寡", "B2B??靽∩遙撱箇?"], outputFormats: ["Email 隤脩?憭抒雇", "7撠玨蝔mail", "頧?摨?", "???勗?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "IWillTeachYouToBeRich嚗amit Sethi嚗?, description: "?瑟?? Email 隤脩?獢嚗?甈⊥?Ｗ??澆?????憭折??祥??批捆", result: "Email ?頞? 100 ?穿?瘥活隤脩??澆?撟湔?亥???$1 ??頧??璆剔? 5 ??, source: "Ramit Sethi ?祇?閮芾? / IWillTeachYouToBeRich.com" }, { company: "Amy Porterfield嚗?券?隡潭??塚?", description: "隞?Email 隤脩?摨??寡 Facebook 撱??撘???摰ｇ????$997 隤脩?", result: "撟湔?亥???$3,000 ?穿?Email 隤脩?頧?????8%嚗平????1-2%嚗?, source: "Amy Porterfield ?祇??嗅?勗? 2022" }] });
    }

    // F4: Jeff Walker ??Product Launch Formula Email (2005)
    {
      const slug = "em-walker-plf-email";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["email-marketing", "campaign-orchestrator"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["email-marketing", "product-launch-formula-email"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "plf-launch-sequence-copy"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "paid-ads"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "launch-performance-analytics"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Pre-pre-launch ?澈", description: "?澆????2 ?梁??摨?嚗遣蝡?敺矽?亙??暸?瘙ˊ???舀??單?嚗???券??曉?撠望葩?頃鞎?, tool: "internal", outputType: "preprelaunch_sequence", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Launch Conversation 1嚗???Opportunity嚗?, description: "??洵銝撠?Launch ?批捆嚗?鈭思誘鈭箄?憟桃?璈?/瘣?嚗?撠??暹?霅?箔?暻潛?冽?寡???璈?, tool: "internal", outputType: "launch_email_1_opportunity", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Launch Conversation 2嚗?霈?Transformation嚗?, description: "蝚砌?撠?Launch ?批捆嚗?蝷箏恥?嗡蝙?其??瘜??潛?鈭鈭?霈??祕獢???霅?, tool: "internal", outputType: "launch_email_2_transformation", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 4, name: "Launch Conversation 3嚗?撽?Experience嚗?, description: "蝚砌?撠?Launch ?批捆嚗??擃??Ｗ???撠??撱箇????閬憭?皜湔?", tool: "internal", outputType: "launch_email_3_experience", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "?鞈潸眺 + ??摨?", description: "??亦?靽摨?嚗??暸??4 撠?鋆????? 24 撠???敺?撠?蝺翰??嚗alker 隤芥???舫?格?憭?銝憭押?, tool: "internal", outputType: "open_close_sequence", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Launch 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Launch ??撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Launch ??撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jeff Walker Product Launch Formula Email 銝?蝑", description: "Source: Jeff Walker?aunch??014 + Product Launch Formula 2005. Walker ??PLF ?寞?撟怠摮詨?Ｗ頞? $1 ????桅?", steps });
      await upsertSquad(conn, { slug, name: "Jeff Walker PLF Email ?Ｗ?銝?撠?", description: "? Jeff Walker ??Product Launch Formula嚗re-pre-launch ??銝?Launch Conversations ???鞈潸眺 ????摨?嚗 Email 鋆賡頃鞎瑁?瞏?, industryKey: "marketing", missionType: taskType, workspace: ["email-marketing"], methodology: "Jeff Walker ??Product Launch Formula (2005)", agents: agentMembers, tags: ["email", "launch", "conversion", "urgency"], useCases: ["隤脩?/?Ｗ?Email銝?", "???芣??典誨", "?啣??澆?銵"], outputFormats: ["5憟aunch Email摨?", "蝺翰??CTA", "Launch?勗?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Jeff Walker ?犖獢?嚗雯??蝺渲玨蝔?", description: "蝚砌?甈⊥???PLF嚗??芸振?澈?潮?Email 摨??瑕蝬脩?閮毀隤脩?", result: "銝??$1,800 ?瑕憿??嗆??萇???嚗??澆???PLF ?寡?蝟餌絞", source: "Jeff Walker?aunch?銝剔洵銝蝡?? }, { company: "PLF 摮詨蝢日?嚗alker ?寡?嚗?, description: "?函?摮詨? PLF 獢?脰?隤脩???撣?, result: "頞? 1,000 ?飛?⊥?亥???$1M嚗LF 蝷曄黎蝮賡?株???$1 ??, source: "JeffWalker.com Launch Mastermind ?豢? 2022" }] });
    }

    // F5: Joanna Wiebe ??Voice of Customer Conversion Copywriting Email (Copyhackers, 2011)
    {
      const slug = "em-wiebe-conversion-copy";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["copywriting-pro", "ad-copywriting-formulas"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["copywriting-pro", "voice-of-customer-copywriting"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "voc-research-mining"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["hook-copywriter", "email-marketing"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["hook-copywriter", "email-subject-line-testing"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Voice of Customer ?豢???", description: "Joanna Wiebe ?敹?銝????餅??恥?嗥??祕隤????皞?Amazon 閰??2 閰???嗉赤隢??瑁矽?伐??芸?摰Ｘ?芸楛??敶?, tool: "internal", outputType: "voc_data_mining", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "閮?嗆?閮剛?", description: "靘?VOC ?豢?撱箇?閮?嗆?嚗恥?嗆?撣貉牧?obs to be Done??????????典恥?嗥?隤?蝯? Email ?詨?閮", tool: "internal", outputType: "message_architecture", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "頧??芸? Email ?啣神", description: "靘?VOC ?豢??啣神 Email嚗????賣?格??隤芷????湔??隞牧??嚗??支遙雿?貉隤芾閰?, tool: "internal", outputType: "voc_driven_email_copy", requiredSkills: ["ad-copywriting-formulas"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "Subject Line A/B 皜祈岫", description: "閮剛? 5 ??Subject Line 霈? A/B 皜祈岫嚗???vs ?詨? vs ?犖??vs 憟賢?敹?vs ?湔?拍?嚗?箸?擃?靽∠?蝯?", tool: "internal", outputType: "subject_line_test", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 5, name: "Email 頧?????, description: "瘥??? Email 摨?????嚗??亙??VOC ?寥脩???蝭暺???餈凋誨?芸?", tool: "internal", outputType: "email_cro_report", requiredSkills: ["marketing-analytics"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "VOC ??撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "VOC ?弦撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Subject Line 撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Joanna Wiebe Voice of Customer Email 頧???", description: "Source: Joanna Wiebe嚗opyhackers嚗?011 撟游蝡?鋡怎迂?箝onversion Copywriting ?洵銝鈭箝?撟怠 Wistia?nbounce 蝑?SaaS 隡平??頧???, steps });
      await upsertSquad(conn, { slug, name: "Joanna Wiebe VOC Email 頧???撠?", description: "?典恥?嗉撌梯牧?店撖?Email?oanna Wiebe ??Voice of Customer ???寞?嚗?憟賜?銵隤??臬?摰Ｘ??葉???箔???銝???芸楛?潭???, industryKey: "marketing", missionType: taskType, workspace: ["email-marketing"], methodology: "Joanna Wiebe ??Voice of Customer Copywriting (Copyhackers, 2011)", agents: agentMembers, tags: ["email", "copywriting", "conversion", "voc"], useCases: ["Email???芸?", "閮頧?????, "SaaS Email銵"], outputFormats: ["VOC ?弦?勗?", "閮?嗆?", "Email ??", "Subject Line 皜祈岫"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Wistia嚗opyhackers 摰Ｘ嚗?, description: "? VOC ???寞??神 Email ?寡摨???Trial 頧? Email", result: "Trial-to-Paid 頧?????30%嚗mail 暺?????45%", source: "Joanna Wiebe Copyhackers 獢??弦 2016" }, { company: "Unbounce嚗opyhackers 摰Ｘ嚗?, description: "? VOC ?弦?芸? Landing Page ??Email ??", result: "擐?頧?????25%嚗mail ?縑????60%", source: "Copyhackers.com Unbounce 獢??弦" }] });
    }

    // F6: Amy Porterfield ??Digital Course Email Launch Sequence (2013)
    {
      const slug = "em-porterfield-launch";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["email-marketing", "campaign-orchestrator"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["email-marketing", "digital-course-launch-email"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "launch-email-sequence-copy"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "???Email 摨?嚗re-launch嚗?, description: "???2 ?梁??摨?嚗?鈭怒?敺?鈭蝷箄玨蝔雿?蝔遣蝡曈亙??殷?霈??典飛?⊥?閬箸???找犖??, tool: "internal", outputType: "prelaunch_emails", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?拚野?芣???Email嚗arly Bird嚗?, description: "?澆?敺?24-48 撠??曈亙?????? ???拚野?芣?撘瑁矽 ???拚野?芣迫??嚗靽翰?捱蝑?, tool: "internal", outputType: "early_bird_emails", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "鞈潛頠??暹?嚗pen Cart嚗?, description: "5-7 憭拚??暹?????Email嚗?澆撥隤???摰Ｘ閬? ??撣貉???閫?? ???閮?嚗?撠????摨衣?隤芣?", tool: "internal", outputType: "open_cart_sequence", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 4, name: "鞈潛頠???嚗art Close嚗?, description: "????48 撠???餈怠????敺??????敺?24 撠? ???敺嗾撠?嚗??撖衣?蝺翰??, tool: "internal", outputType: "cart_close_sequence", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "??敺??莎?Post-close嚗?, description: "??敺? 2 撠?Email嚗?雓頃鞎瑁?撱箇?蝷曄黎??+ ??芾頃鞎瑁?甈⊿??暸嚗雁霅琿?靽?, tool: "internal", outputType: "post_close_emails", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Launch Email 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Launch ??撣?, order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Amy Porterfield ?訾?隤脩? Email ?澆?摨?", description: "Source: Amy Porterfield 2013 撟渲絲?雿玨蝔?Email 銝??寞?隢orterfield 撟湔?亥???$3,000 ?穿??甇斗???, steps });
      await upsertSquad(conn, { slug, name: "Amy Porterfield 隤脩? Email Launch 撠?", description: "? Amy Porterfield ?雿玨蝔?Email 銝?摨?嚗re-launch ??Early Bird ??Open Cart ??Cart Close ??Post-close嚗頂蝯勗?撠?Email ?頧隤脩??嗅", industryKey: "marketing", missionType: taskType, workspace: ["email-marketing"], methodology: "Amy Porterfield ??Digital Course Launch Email (2013)", agents: agentMembers, tags: ["email", "launch", "digital-course", "conversion"], useCases: ["蝺?隤脩?Email銝?", "??嗥?撣?, "?訾??Ｗ?銵"], outputFormats: ["5?挾Launch Email憟?", "蝺翰?低TA璅⊥"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Amy Porterfield ?犖??嚗igital Course Academy嚗?, description: "瘥活隤脩??澆??甇斤移蝣?Email 摨?嚗歇?脰? 10+ 甈⊥??撣?, result: "撟湔?亥???$3,000 ?穿??格活?澆? Email 摨?撣嗡? $2-5M ?瑕憿?, source: "Amy Porterfield ?祇??嗅?勗? / Online Marketing Made Easy Podcast" }, { company: "Jasmine Star嚗nline Business Launchpad嚗?, description: "? Porterfield 獢??Email Launch 摨??澆??平隤脩?", result: "擐活?敺玨蝔?仿???$500,000嚗mail 摨??縑????45%", source: "Jasmine Star ?祇??澆??澈 2021" }] });
    }

    // F7: Bob Bly ??Direct Response Email (The Copywriter's Handbook, 1985/2020)
    {
      const slug = "em-bly-direct-response";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["ad-copywriting-formulas", "copywriting-pro"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["ad-copywriting-formulas", "bly-direct-response-email"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["hook-copywriter", "market-research-agent"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "direct-mail-to-email-principles"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "email-marketing"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["email-marketing", "response-rate-optimization"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "USP ?詨?閮摰儔", description: "? Bly ?????????蝢拇??啁? USP嚗?寥?桐蜓撘蛛?嚗mail ????蝝?? USP 撅?", tool: "internal", outputType: "usp_definition", requiredSkills: ["ad-copywriting-formulas"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "撘瑕?銝餅銵身閮?, description: "? Bly ?蜓?刻??砍?嚗??怠?隢整末憟??擙格???餈急?銋??葫閰?4 蝔桐蜓?刻?霈?", tool: "internal", outputType: "subject_line_copy", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "?湔??? Email 甇??", description: "靘?Bly ??AIDA 獢?啣神 Email嚗釣??嚗蜓?剁????閎嚗??????皜湔?嚗冗??????銵?嚗??蚓TA嚗?, tool: "internal", outputType: "aida_email_copy", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "?湔?????皜祈岫", description: "A/B 皜祈岫 Email ???萄?蝝?銝餅銵TA ?刻?????犖??摨佗?隞交?????", tool: "internal", outputType: "dr_email_test_report", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 5, name: "Email 蝟餃??雿喳?", description: "靘葫閰衣??遣蝡?雿喳???Email 璅⊥摨恬?璅??????湔??? Email 撖思?瘚?", tool: "internal", outputType: "email_template_library", requiredSkills: ["email-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?湔?????撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "銝餅銵葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "??餈質馱撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Bob Bly ?湔??? Email ??獢", description: "Source: Bob Bly?he Copywriter's Handbook??985/2020 ?湔?? Bly ?啣神頞? 100 ?祆蝐?鋡?McGraw-Hill 蝔梁????????獢葦銋???, steps });
      await upsertSquad(conn, { slug, name: "Bob Bly ?湔??? Email ??撠?", description: "? Bob Bly 60 撟渡???瑟?扳 Email嚗?撠???啁? USP?撥?蜓?刻??IDA 蝯??銝皜 CTA嚗?憭批? Email ????, industryKey: "marketing", missionType: taskType, workspace: ["email-marketing"], methodology: "Bob Bly ??The Copywriter's Handbook (1985/2020)", agents: agentMembers, tags: ["email", "direct-response", "copywriting", "conversion"], useCases: ["B2B Email 瞏恥?", "?餃?靽 Email", "??璆?Email 銵"], outputFormats: ["USP 摰儔?辣", "銝餅銵?擃?, "AIDA Email 璅⊥", "皜祈岫?勗?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Bob Bly ?芾澈嚗?00+ ?湔?銵摰Ｘ嚗?, description: "60 撟港???湔????????箏?銵?璆剜撖?Email 銵??", result: "撟喳?摰Ｘ Email ????璆剔? 3-5 ??AWAI ????撣怨?霅?頞? 100 ?祈?雿?, source: "Bob Bly ?犖蝬脩? Bly.com / The Copywriter's Handbook 2020 ?? }, { company: "Agora Publishing嚗ly ?瑟???嚗?, description: "? Bly ?????Email ????蝞∠?樴之閮???瑞頂蝯?, result: "撟?Email 銵?嗅頞? $1 ??摰Ｘ Email ROI ? 4,200%嚗平????3,800%嚗?, source: "Agora Publishing / DMA Email Marketing Report 2021" }] });
    }

    // F8: Ben Settle ??Email Players Daily Email Method (2010)
    {
      const slug = "em-settle-email-players";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["email-marketing", "copywriting-pro"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["email-marketing", "daily-email-entertainment"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["brand-dna", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["brand-dna", "personal-email-voice"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?犖 Email ?脤撱箇?", description: "撱箇??函?犖 Email 撖思??脤嚗en Settle 隤芥??批停?臭??憭抒?蝡嗥?芸???函?撖血扯??砍隤除撖?Email", tool: "internal", outputType: "personal_email_voice", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 2, name: "瘥銝???舐? Email 蝧", description: "撱箇?瘥予?潮?Email ?????Settle ?瘜瘥? Email ?芣?銝?敹??荔?銝??鈭?銝??CTA嚗神 250-500 摮雲憭?, tool: "internal", outputType: "daily_email_system", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "憡???+ ??抒? Email ?批捆", description: "?啣神霈犖???縑??Email嚗ettle ??璅洵銝嚗?桃洵鈭???瘥??賣?霈犖?喳?鈭怎?????撖?, tool: "internal", outputType: "entertainment_edu_emails", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "??頠折??, description: "瘥? Email 蝯偏?賣?頛???CTA嚗?撘瑁翰嚗?舀??????唾??游?嚗ㄐ?瘜?Settle 隤芥?格?閰脫 Email ??撣嗅?嚗??臭蜓頠詻?, tool: "internal", outputType: "soft_sell_cta_templates", requiredSkills: ["hook-copywriter"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "瘥 Email 撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Email ?批葦", order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ben Settle Email Players 瘥銝撠?璅?Email ?寞?", description: "Source: Ben Settle?mail Players??010 撟渲絲????Email 蝟餌絞?ettle ?冽???Email 撱箇?擃??Email ?璆剖?嚗僑?嗉???$500K", steps });
      await upsertSquad(conn, { slug, name: "Ben Settle Email Players 瘥 Email 撠?", description: "瘥予?潮?撠?鈭箸?敺? Email嚗?璅?折悅???折?柴en Settle ?瘜?銝?犖???殷????乩犖??祉?蝯脤???, industryKey: "marketing", missionType: taskType, workspace: ["email-marketing"], methodology: "Ben Settle ??Email Players Daily Email Method (2010)", agents: agentMembers, tags: ["email", "daily-email", "entertainment", "personal-brand"], useCases: ["?犖??Email銵", "?亥???璆剖??桀??, "?菜平摰嗆??乍mail"], outputFormats: ["?犖Email?脤??", "瘥Email璅⊥", "頠?哽TA摨?], requiredIntegrations: [], token: 50000, showcases: [{ company: "Ben Settle Email Players ?祈澈", description: "??芸????Email ?寞?嚗雁??暺批??曇??梯黎擃?, result: "Email Players 閮?嗅僑?嗅頞? $500K嚗??梯閮?雿璆剔??潛? 10%", source: "Ben Settle BenSettle.com ?祇??豢? 2022" }, { company: "Frank Kern嚗?隡潭???Email ?寞?嚗?, description: "??批?瘥 Email 憸冽撱箇?擃縑隞餃漲?", result: "Email ?頞? 20 ?穿?瘥活?澆? Email 摨??Ｗ $1-5M ?瑕憿?, source: "Frank Kern ?祇?閮芾? / FrankKern.com" }] });
    }

    // F9: Justin Goff ??High Frequency Email Testing (2020)
    {
      const slug = "em-goff-high-frequency";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["email-marketing", "marketing-analytics"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["email-marketing", "high-frequency-email-testing"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "story-email-formula"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Email ?蝝啣?蝑", description: "靘??箇敦???殷?瘣餉?鞈潸眺?暑頨?鞈潸眺??暺?30/60/90 憭抬???銝?蝝啣?閮剛?銝? Email ?餌??摰?, tool: "internal", outputType: "list_segmentation_plan", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "????Email ?寥?鋆賭?", description: "Goff ?寞?嚗?撠?Email = 銝??撖行???撖衣??剜?鈭?+ 璈?啁??????身閮?30 撠?鈭? Email 摨?, tool: "internal", outputType: "story_email_library", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "擃?葫閰西???, description: "閮剛?瘥???勗?甈?Email 皜祈岫閮?嚗翰?葫閰血憿?鈭蜓憿蜓?刻??澆????????????, tool: "internal", outputType: "high_frequency_test_plan", requiredSkills: ["marketing-analytics"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Email ?餌?蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "??Email撣?, order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Justin Goff 擃??Email 皜祈岫??瘜?, description: "Source: Justin Goff 2020 撟渡?擃??Email ?寞?嚗蝞∠?頞? 2,000 ?祉? Email ?嚗??瑚誑?? Email 蝬剜?擃?靽∠?", steps });
      await upsertSquad(conn, { slug, name: "Justin Goff 擃??Email 皜祈岫撠?", description: "隞仿??餌???鈭? Email ??皜祈岫?芸??ustin Goff ?瘜?Email ?舀葫閰衣????湛?銝?停銝??暻潭???, industryKey: "marketing", missionType: taskType, workspace: ["email-marketing"], methodology: "Justin Goff ??High Frequency Email Testing (2020)", agents: agentMembers, tags: ["email", "frequency", "testing", "storytelling"], useCases: ["?餃?瘥靽Email", "?瘣餃?????, "Email?餌??芸?"], outputFormats: ["?蝝啣?蝑", "??Email摨?, "皜祈岫閮?"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Justin Goff ?犖?蝞∠?", description: "?擃??鈭?Email ?寞?蝞∠?憭?璆剔? Email ?", result: "蝞∠?頞? 2,000 ??Email ?啣?嚗恥??Email 銵 ROI 撟喳?? 10x", source: "Justin Goff ?祇?瞍? / JustinGoff.com 2021" }, { company: "?餃?摰Ｘ嚗??via Goff", description: "撠?Email ?潮??瘥?1 甈⊥??瘥予 1 甈∴??剝?????Email", result: "??Email ?嗅?? 3 ???閮?????0.3%嚗?雿璆剔???嚗?, source: "Justin Goff 摰Ｘ獢??弦 2020" }] });
    }

    // F10: Russell Brunson ??DotCom Secrets Email Sequences (2015)
    {
      const slug = "em-brunson-dotcom-email";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["email-marketing", "campaign-orchestrator"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["email-marketing", "dotcom-secrets-email"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "attractive-character-email"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "marketing-ops"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-ops", "email-broadcast-ops"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "Attractive Character 鈭箇閮剛?", description: "撱箇????ttractive Character???撩?瑚?憟桅洛銝剔??祕鈭箇嚗?閮???澈?runson 隤芥?蝢?鈭箇瘜◤???嚗??葉?犖???, tool: "internal", outputType: "attractive_character_profile", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 2, name: "Soap Opera Sequence 撖虫?", description: "? Brunson ???SOS 摨?嚗C 隞晶 ??甈脫?撱箇? ????? ???梯?憟質? ??蝺翰?潛捲", tool: "internal", outputType: "sos_email_sequence", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Seinfeld Email 蝟餌絞", description: "閮剛?瘥撱? Email嚗runson 蝔梁 Seinfeld Email嚗???Seinfeld 敶梢?銝璅??隞暻潮銝??鈭???雿?撠撠暸????CTA", tool: "internal", outputType: "seinfeld_email_system", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "Offer Stack 蝯??芣?閮剛?", description: "閮剛? Offer Stack 蝯??芣?嚗蜓?Ｗ? + ?澆? + 靽?嚗???孵潮?頞?撖阡??桀嚗mail ?典誨??銴撥隤?Stack ?孵?, tool: "internal", outputType: "offer_stack_design", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 5, name: "Email 瞍????勗?", description: "餈質馱?游?DotCom Secrets Email 瞍?嚗OS 摰??誨?剝?靽∠??ffer Stack 頧???摰甇詨??芸?", tool: "internal", outputType: "email_funnel_report", requiredSkills: ["marketing-ops"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "DotCom Email 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Attractive Character 撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Email ??撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Russell Brunson DotCom Secrets Email 瞍?蝟餌絞", description: "Source: Russell Brunson?otCom Secrets??015. ClickFunnels ?甇?Email 獢? $1 ??ARR嚗????10 ??ClickFunnels ?冽?甇文???, steps });
      await upsertSquad(conn, { slug, name: "Russell Brunson DotCom Secrets Email 瞍?撠?", description: "? Russell Brunson ????DotCom Secrets Email 蝟餌絞嚗ttractive Character 撱箇? + Soap Opera Sequence + Seinfeld 撱? + Offer Stack嚗? Email ????Ｙ??舫????, industryKey: "marketing", missionType: taskType, workspace: ["email-marketing"], methodology: "Russell Brunson ??DotCom Secrets Email System (2015)", agents: agentMembers, tags: ["email", "funnel", "dotcom", "automation"], useCases: ["?亥???璆胥mail蝟餌絞", "蝺?隤脩?Email銵", "ClickFunnels瞍?Email"], outputFormats: ["Attractive Character 閮剛?", "SOS摨?", "Seinfeld Email蝟餌絞", "Offer Stack閮剛?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "ClickFunnels嚗ussell Brunson嚗?, description: "? DotCom Secrets Email 蝟餌絞嚗誑 SOS + 瘥撱? Email ???寡 ClickFunnels ?冽", result: "ClickFunnels ? $1 ??ARR嚗mail ?頞? 100 ?穿?瘥? Email 鞎Ｙ 30% ?啗???, source: "ClickFunnels Annual Report / Russell Brunson?otCom Secrets?? }, { company: "Expert Secrets 隤脩?嚗runson嚗?, description: "? Offer Stack 閮剛??剝? Email 摨??典誨 $997 隤脩?", result: "擐活?澆? 24 撠??瑕頞? $3M嚗mail 摨? ROI 頞? 50 ??, source: "Russell Brunson ?祇??澆??勗? 2017" }] });
    }

    // ????????????????????????????????????????????????????????????????????    // CATEGORY G: SEO ??撘??芸? Methodology Squads (G1?10)
    // ????????????????????????????????????????????????????????????????????
    // G1: Brian Dean ??Skyscraper Technique 2.0 (Backlinko, 2019)
    {
      const slug = "seo-dean-skyscraper";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["seo-audit", "content-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["seo-audit", "skyscraper-technique-v2"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "mbb-strategist"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "search-intent-research"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["copywriting-pro", "skyscraper-content-writing"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["marketing-ops", "marketing-analytics"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-ops", "link-outreach-execution"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "???? + ???璈??弦", description: "Skyscraper 2.0 ??嚗??芣????憭??批捆嚗???嗆?撠???西◤摰皛輯雲??箝??憭?雿輻??銝遛???格?", tool: "internal", outputType: "link_and_intent_analysis", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "10x ??批捆?嗆?", description: "閮剛??＊??摰寞瑽??湔楛?蜓憿??憭?閬箄牧??啁??豢??憟賜?蝯?蝯?", tool: "internal", outputType: "superior_content_blueprint", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 3, name: "SEO ?芸??瑟??啣神", description: "?啣神摰??Skyscraper ?批捆嚗??怎璅??萄???嗅?撣emantic keywords?SI 閰?嚗??Ⅱ靽摰寧?甇????, tool: "internal", outputType: "skyscraper_article", requiredSkills: ["copywriting-pro"] }, m3Info),
        assignAgentToStep({ order: 4, name: "???撱箇?憭?瑁?", description: "撱箇?????啗??摰寧?憭?嚗?犖???舫隞塚?餈質馱????脣??脣漲", tool: "internal", outputType: "link_outreach_execution", requiredSkills: ["marketing-ops"] }, m4Info),
        assignAgentToStep({ order: 5, name: "???餈質馱", description: "餈質馱?格??摮????????憓??璈????瘀?閰摯 Skyscraper ???梢??, tool: "internal", outputType: "ranking_growth_report", requiredSkills: ["marketing-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Skyscraper SEO 撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?????弦撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "SEO ?批捆撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "???撱箇?撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Brian Dean Skyscraper Technique 2.0 SEO 蝑", description: "Source: Brian Dean嚗acklinko嚗?019 撟?Skyscraper Technique 2.0 ?????游???????嚗acklinko ??????150 ??, steps });
      await upsertSquad(conn, { slug, name: "Brian Dean Skyscraper 2.0 SEO ???撱箇?撠?", description: "? Brian Dean ??Skyscraper 2.0嚗??芾?頞??暹??雿喳摰對??渲?皛輯雲鋡怠蕭閬?????嚗??遣蝡????霅瑕?瘝?, industryKey: "marketing", missionType: taskType, workspace: ["seo"], methodology: "Brian Dean ??Skyscraper Technique 2.0 (Backlinko, 2019)", agents: agentMembers, tags: ["seo", "link-building", "content", "backlinks"], useCases: ["蝡嗥?摮EO蝒", "???撱箇?閮?", "??瘚???"], outputFormats: ["??????", "Skyscraper ??", "憭?", "??餈質馱?勗?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Backlinko ?芾澈嚗rian Dean嚗?, description: "蝟餌絞? Skyscraper ?銵遣蝡平??憭??????SEO ?刻??, result: "??????150 ?穿?DA ? 78嚗?蝭?蝡像?敺?500+ ?????", source: "Backlinko.com / Ahrefs ??????? 2023" }, { company: "NerdWallet嚗??券?隡潭瘜?", description: "隞?Skyscraper ???萎???銝駁???摰??嚗頂蝯勗遣蝡????", result: "??瘚?頞? 1,500 ????IPO 隡啣潸???$35 ??, source: "SEMrush / Ahrefs NerdWallet ?? 2021" }] });
    }

    // G2: Neil Patel ??Reverse Outreach (Ubersuggest, 2019)
    {
      const slug = "seo-patel-reverse-outreach";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["seo-audit", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["seo-audit", "reverse-outreach-seo"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "brand-mention-monitoring"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-ops", "copywriting-pro"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-ops", "unlinked-mention-outreach"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "???芷??????葫", description: "??葫????啣???蝔曹?瘝???????雯蝡????胯歇隤??雿?閮????擃??璅?, tool: "internal", outputType: "unlinked_mentions_list", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "璆剔?蝯梯?/?豢??批捆鋆賭?", description: "鋆賭?擃◤撘瞏????菜?摰對?銵平蝯梯??勗??矽?交?摰嗥?蝛塚????批捆?芰?詨?慦?撘???", tool: "internal", outputType: "original_data_content", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 3, name: "?芷????頧?憭", description: "?????????雯蝡???航?瘙???雓??唳???憒??券???銝????嫣噶?函?霈??, tool: "internal", outputType: "mention_to_link_emails", requiredSkills: ["marketing-ops"] }, m3Info),
        assignAgentToStep({ order: 4, name: "????脣???餈質馱", description: "餈質馱憭敺?????脣????????芷?蝬脩??憿?????芸?憭閮??頧???, tool: "internal", outputType: "link_acquisition_report", requiredSkills: ["marketing-analytics"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "??憭 SEO 撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "????葫撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "憭?瑁?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Neil Patel Reverse Outreach ?????撱箇?蝑", description: "Source: Neil Patel / Ubersuggest 2019 撟渡頂蝯勗???Reverse Outreach ?寞??eilPatel.com ??????400 ?祆??冽迨???撱箇?蝑", steps });
      await upsertSquad(conn, { slug, name: "Neil Patel Reverse Outreach SEO ????脣?撠?", description: "??撌脫????芷????????撠頧??箏?????eil Patel ??Reverse Outreach ?寞?嚗?銝餃?憭頧??? 5 ??, industryKey: "marketing", missionType: taskType, workspace: ["seo"], methodology: "Neil Patel ??Reverse Outreach (Ubersuggest, 2019)", agents: agentMembers, tags: ["seo", "link-building", "brand-mentions", "outreach"], useCases: ["???????撱箇?", "撌脫?????????脣?", "擃?DA ???蝑"], outputFormats: ["?芷????皜", "??豢??批捆", "憭?萎辣璅⊥", "?脣?餈質馱?勗?"], requiredIntegrations: [], token: 55000, showcases: [{ company: "NeilPatel.com ?芾澈", description: "? Reverse Outreach 蝟餌絞?撠平?? Neil Patel ??????????", result: "NeilPatel.com ? DA 82嚗?瘚?頞? 400 ?穿??????頞? 60 ?砍?, source: "Ahrefs NeilPatel.com ?? 2023" }, { company: "HubSpot嚗?隡潭瘜?", description: "??葫銝西???HubSpot ?摰儔???瑁?隤??芷????", result: "HubSpot Blog DA ? 92嚗?瘚?頞? 500 ??, source: "Ahrefs / SEMrush HubSpot ?? 2023" }] });
    }

    // G3: Kevin Indig ??Topical Authority Strategy (2021)
    {
      const slug = "seo-indig-topical-authority";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["seo-audit", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["seo-audit", "topical-authority-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "market-research-agent"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "topic-cluster-mapping"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["copywriting-pro", "pillar-supporting-content"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-analytics", "topical-coverage-analytics"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "銝駁??ａ??啣?閮剛?", description: "閮剛?摰?蜓憿?瑽?1 ?敹?Pillar 銝駁? + 10-20 ??Supporting 摮蜓憿?蝣箔?摰閬??游蜓憿???, tool: "internal", outputType: "topic_cluster_map", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Pillar ?鋆賭?", description: "鋆賭?瘨菔??游蜓憿??瑞? Pillar ?嚗?,000-5,000 摮?嚗??箔蜓憿??銝剖?璅?嚗?券???唳????", tool: "internal", outputType: "pillar_page_content", requiredSkills: ["copywriting-pro"] }, m3Info),
        assignAgentToStep({ order: 3, name: "Supporting ?批捆鋆賭?", description: "?箸???銝駁?鋆賭?閰喟敦??Supporting ??嚗?蝭?????Pillar ?嚗遣蝡??渡?銝駁?閬?蝬脩窗", tool: "internal", outputType: "supporting_articles", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "?折????嗆??芸?", description: "撱箇?摰??券???嗆?嚗illar ??Supporting ?????嚗Ⅱ靽蜓憿?? PageRank 瘚??憭批?", tool: "internal", outputType: "internal_linking_structure", requiredSkills: ["marketing-analytics"] }, m4Info),
        assignAgentToStep({ order: 5, name: "銝駁?甈???餈質馱", description: "餈質馱銝駁??ａ?銝剜????萄????脣?嚗?隡唳擃蜓憿??漲??Google 撠??蜓憿?憡?隤蝔漲", tool: "internal", outputType: "topical_authority_report", requiredSkills: ["cross-channel-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "銝駁?甈?蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "銝駁??ａ?撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "SEO ?批捆撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "?????撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Kevin Indig Topical Authority SEO 銝駁?甈?蝑", description: "Source: Kevin Indig嚗? Shopify / G2 / Atlassian SEO Director嚗?021 撟渡頂蝯勗? Topical Authority ?寞?隢?鋡急平?誨瘜??舐?曆誨 SEO ????????, steps });
      await upsertSquad(conn, { slug, name: "Kevin Indig Topical Authority SEO 銝駁?甈?撠?", description: "撱箇?霈?Google 隤?蜓憿?憡??? Pillar + Supporting ?ａ??嗆??券閬?銝?蜓憿?霈????箄府?????貉?閮?皞?, industryKey: "marketing", missionType: taskType, workspace: ["seo"], methodology: "Kevin Indig ??Topical Authority Strategy (2021)", agents: agentMembers, tags: ["seo", "topical-authority", "content-cluster", "pillar-page"], useCases: ["銵平SEO銝駁?雿?", "??SEO?瑟?閬?", "?餃???SEO"], outputFormats: ["銝駁??ａ??啣?", "Pillar ?", "Supporting ??蝯?, "??餈質馱?勗?"], requiredIntegrations: [], token: 65000, showcases: [{ company: "Shopify嚗evin Indig ?遙 SEO Director嚗?, description: "? Topical Authority 蝑蝟餌絞?遣蝡???菜平銝駁??ａ?", result: "Shopify Blog ??????200 ?穿????揣鞎Ｙ 20%+ ?啗岫?刻?, source: "Kevin Indig ?犖?刻??/ Shopify ?祇? SEO ?? 2021" }, { company: "Healthline嚗?隡?Topical Authority嚗?, description: "隞乩蜓憿???亥???10,000+ ?亙熒銝駁?嚗遣蝡??蝝Ｖ蜓憿?憡?, result: "??璈?????9,000 ?穿?? Google ?怎??亙熒 YMYL ???擃???擃?銝", source: "Ahrefs / SEMrush Healthline ?? 2022" }] });
    }

    // G4: Glen Allsopp ??SERP Domination Strategy (ViperChill, 2022)
    {
      const slug = "seo-allsopp-serp-domination";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["seo-audit", "marketing-analytics"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["seo-audit", "serp-domination-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "mbb-strategist"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "multi-format-serp-content"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-ops", "brand-identity"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-ops", "brand-property-optimization"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "SERP 雿?璈???", description: "???格??摮? SERP 蝯?嚗鈭撘?Featured Snippet?eople Also Ask?ideo?ap Pack嚗?璈?雿?嚗???SERP ?臭誑???箇撟暹活嚗?, tool: "internal", outputType: "serp_opportunity_analysis", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "憭撘?SERP ?批捆鋆賭?", description: "?箏?銝?格??摮ˊ雿?蝔格撘??批捆嚗蝭?蝡???蝚?嚗? 敶梁?嚗ideo carousel嚗? 撌亙嚗ools SERP嚗? ??嚗????典?銝 SERP 憭活?箇", tool: "internal", outputType: "multi_format_content", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 3, name: "??摮??Ｗ??, description: "?芸??????Web 鞈嚗蜓蝬脩? + YouTube + Google Business Profile + 摮雯??霈?撠??????????洵銝??, tool: "internal", outputType: "brand_property_audit", requiredSkills: ["marketing-ops"] }, m3Info),
        assignAgentToStep({ order: 4, name: "SERP 雿??蕭頩?, description: "餈質馱???函璅??萄? SERP 銝?????靘?10 ???葉???箇撟暹活嚗皜祉奎?剖??? SERP 雿蔭", tool: "internal", outputType: "serp_domination_report", requiredSkills: ["marketing-analytics"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "SERP 雿?蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "憭撘摰孵葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "??鞈撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Glen Allsopp SERP Domination ??蝯???????, description: "Source: Glen Allsopp嚗iperChill嚗?022 撟氬he SERP Domination Strategy????剝憭批?慦?憒?雿??? SERP 憭?蝵?, steps });
      await upsertSquad(conn, { slug, name: "Glen Allsopp SERP 雿?蝑撠?", description: "銝??蝚砌?嚗?霈??SERP ?賣雿len Allsopp ??SERP Domination ?寞?嚗??澆???鞈????摮?嚗?蝡嗥撠?瘝???蝛粹?", industryKey: "marketing", missionType: taskType, workspace: ["seo"], methodology: "Glen Allsopp ??SERP Domination (ViperChill, 2022)", agents: agentMembers, tags: ["seo", "serp", "multi-format", "brand-seo"], useCases: ["?摮ERP?券雿?", "??SEO鞈?芸?", "蝡嗥撠?SEO?脩戌"], outputFormats: ["SERP璈???", "憭撘摰寧?", "??鞈撖抵?", "SERP雿??勗?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "ViperChill ?弦?剔內?之??擃???, description: "Dotdash Meredith 蝑?擃?????SERP 雿?蝑嚗??/?亙熒?摮?SERP ?箇 3-5 甈?, result: "?? SERP 雿? 30-50% ??撠???CTR ?臬銝????3 ??, source: "Glen Allsopp?he SERP Domination Strategy?iperChill 2022" }, { company: "Bankrate嚗???擃?", description: "??憭???嚗erdWallet 瘥?豢鞈潘?雿??????摮??游?SERP", result: "銝餉????摮?SERP 雿?????40%嚗???瘚?頞? 5,000 ??, source: "Ahrefs / SEMrush ?? 2023" }] });
    }

    // G5: Cyrus Shepard ??Internal Linking PageRank Flow Method (Zyppy, 2020)
    {
      const slug = "seo-shepard-internal-linking";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["seo-audit", "marketing-analytics"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["seo-audit", "internal-linking-pagerank"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "marketing-ops"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "anchor-text-optimization"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "蝬脩??祈??PageRank 瘚???", description: "?砍??游雯蝡????桀???券??撖漲??嚗鈭??Ｘ?唳?憭?券??嚗鈭?閬??Ｘ?迨???Ｕ?", tool: "internal", outputType: "internal_link_audit", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "?? PageRank ?葉閮?", description: "閮剛? PageRank ???閮?嚗??游??折???撠?撣????????ｇ?敺? PageRank ?撱箇?????啁璅???, tool: "internal", outputType: "pagerank_redistribution_plan", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "?冽?摮?璅???芸?", description: "撖抵????券?????嚗Ⅱ靽??菟??Ｙ??折?冽?摮??怎璅??萄?嚗?靽??芰憭見??, tool: "internal", outputType: "anchor_text_optimization", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "摮文??靽桀儔", description: "霅銝虫耨敺拙迨???ｇ?瘝??嗅隞颱??折??????ｇ?嚗??賊??撱箇???摮文?????", tool: "internal", outputType: "orphan_page_fix_plan", requiredSkills: ["marketing-ops"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?折??? SEO 撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "????芸?撣?, order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Cyrus Shepard Internal Linking PageRank 瘚??芸?", description: "Source: Cyrus Shepard嚗? Moz SEO / Zyppy ?菔齒鈭綽?2020 撟渡??折??? PageRank 瘚??寞?隢?鋡急平?誨瘜???, steps });
      await upsertSquad(conn, { slug, name: "Cyrus Shepard ?折??? PageRank ?芸?撠?", description: "?芸?蝬脩???PageRank 瘚?嚗? SEO ?孵澆?擃?Authority ?瘚??格?????yrus Shepard ??券??蝘飛嚗?靘踹???SEO ??敺敺?函雯蝡??, industryKey: "marketing", missionType: taskType, workspace: ["seo"], methodology: "Cyrus Shepard ??Internal Linking PageRank Flow (Zyppy, 2020)", agents: agentMembers, tags: ["seo", "internal-linking", "pagerank", "technical-seo"], useCases: ["蝬脩?SEO?銵??, "PageRank???", "摮文??靽桀儔"], outputFormats: ["?折???撖抵?", "PageRank??????, "?冽?摮???], requiredIntegrations: [], token: 50000, showcases: [{ company: "Moz嚗yrus Shepard ?曆遙?瘀?", description: "? PageRank 瘚??芸?蝑?? Moz Blog ????", result: "Moz Blog 銝餉? SEO ?摮?????30-50%嚗?璈?????25%", source: "Cyrus Shepard Moz Blog ?? / Zyppy.com 2020" }, { company: "Healthline嚗之?摰寧雯蝡?靘?", description: "?摰??券???芸?嚗?擃?DA ??????Ｙ? PageRank 瘚??格????", result: "?格????瘚??? 40-60%嚗??憓??????", source: "Case study嚗earch Engine Journal 2021 ?折????芸?獢?" }] });
    }

    // G6: Marie Haynes ??E-E-A-T Quality Rater Framework (2020)
    {
      const slug = "seo-haynes-eeat";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["seo-audit", "brand-identity"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["seo-audit", "eeat-framework-implementation"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "expertise-demonstration-content"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "market-research-agent"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "trust-signal-optimization"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "E-E-A-T ?暹?撖抵?", description: "撖抵?蝬脩???Experience?xpertise?uthoritativeness?rustworthiness ?雁摨佗?雿?閮??其?皞雯蝡??冽扼蝜怨?閮??游漲", tool: "internal", outputType: "eeat_audit_report", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "雿???撠平摨血?蝷?, description: "撱箇?撅內?祕撠平摨衣??批捆蝟餌絞嚗???Bio?inkedIn ?????撖衣?飛甇?蝬風???冽平???舐?鞈?靘?", tool: "internal", outputType: "expertise_demonstration_plan", requiredSkills: ["brand-identity"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "靽∩遙靽∟?撱箇?", description: "撱箇? Google Quality Raters 隤?縑隞颱縑??皜?蝜恍??Ｕbout Us?蝘蝑?撖衣??砍鞈??迤?Ｙ?憭閰?", tool: "internal", outputType: "trust_signals_implementation", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "E-E-A-T ?脤?餈質馱", description: "??葫 E-E-A-T ?寥脣???璈??????孵?釣 YMYL嚗our Money Your Life嚗???Ｙ????Ｗ儔", tool: "internal", outputType: "eeat_improvement_tracking", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "E-E-A-T 撖抵?撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "靽∩遙?批捆撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "靽∩遙靽∟?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Marie Haynes E-E-A-T Google ?釭閰?獢", description: "Source: Marie Haynes嚗arie Haynes Consulting嚗?020 撟渡頂蝯勗???E-E-A-T 獢嚗 Google ?釭??敺???皛?甈??那?瑕?靽桀儔?寞?", steps });
      await upsertSquad(conn, { slug, name: "Marie Haynes E-E-A-T ?釭靽∟??芸?撠?", description: "撘瑕? Experience?xpertise?uthoritativeness?rustworthiness ??Google ?釭靽∟?嚗?仿?? Core Update 敶梢??YMYL 蝬脩?", industryKey: "marketing", missionType: taskType, workspace: ["seo"], methodology: "Marie Haynes ??E-E-A-T Quality Framework (2020)", agents: agentMembers, tags: ["seo", "eeat", "trust", "quality"], useCases: ["YMYL蝬脩????Ｗ儔", "?亙熒/鞎∪?憿EO", "???臭縑摨吁EO"], outputFormats: ["E-E-A-T撖抵??勗?", "撠平摨血?蝷箄???, "靽∩遙靽∟?皜"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Marie Haynes Consulting 摰Ｘ蝯?", description: "?憭? Google Core Update 瘚?銝????鞎∪?蝬脩?? E-E-A-T 獢靽桀儔", result: "撟喳?摰Ｘ瘚???E-E-A-T ?芸?敺?3-6 ???Ｗ儔 50-80%", source: "Marie Haynes Consulting 摰Ｘ獢? / mhc.la 2022" }, { company: "Healthline嚗-E-A-T ?雿喳祕頦?", description: "蝟餌絞撱箇??怎??批捆??E-E-A-T 靽∟?嚗???蝡??怠葦撖拇嚗???PubMed ?弦", result: "2018 撟?Google Medic Update 敺???????30%嚗??箸??縑隞餌??亙熒慦?", source: "Healthline.com 雿???/ Marie Haynes EEAT ?? 2020" }] });
    }

    // G7: Ross Hudgens ??Siege Media Content-Led Link Building (2014)
    {
      const slug = "seo-hudgens-siege";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "seo-audit"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "content-led-link-building"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "link-earning-content-research"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-content-creator", "copywriting-pro"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "linkable-asset-creation"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const m4Id = await findAgent(conn, ["marketing-ops", "campaign-orchestrator"], usedIds);
      if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-ops", "digital-pr-outreach"]); }
      const m4Info = await getAgentInfo(conn, m4Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "?舫??鞈璈??弦", description: "?弦璆剔??芷??批捆?澆??摰寞??脣??????嚗??菜?極??閮??具???閬死?平?????曉 ROI ?擃??舫??鞈憿?", tool: "internal", outputType: "linkable_asset_opportunity", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "?舫??鞈鋆賭?", description: "鋆賭??瑟?憭拍????詨????批捆鞈嚗?蝛嗅??閮?銵具?璆剔絞閮??極?瘀??釭敹???璆剔??暹?鞈?", tool: "internal", outputType: "linkable_asset_creation", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 3, name: "慦?/閮??航???, description: "撱箇?璆剔?慦?????憭?嚗?撠???賢撠迨憿??Ｙ?慦??潮犖???舫隞?, tool: "internal", outputType: "media_outreach_plan", requiredSkills: ["marketing-ops"] }, m4Info),
        assignAgentToStep({ order: 4, name: "?訾? PR ?典誨?瑁?", description: "?瑁??訾? PR ?典誨嚗?擃阮隞嗚冗蝢文?鈭怒?閬?鋡??剁?霈??Ｙ敺?憭抒??芰?????, tool: "internal", outputType: "digital_pr_execution", requiredSkills: ["campaign-orchestrator"] }, m4Info),
        assignAgentToStep({ order: 5, name: "???鞈 ROI ?勗?", description: "餈質馱瘥???鞈撣嗡???????賊??A/Domain ????璈??蔣?選?閰摯?批捆???撱箇? ROI", tool: "internal", outputType: "link_asset_roi_report", requiredSkills: ["marketing-analytics"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?批捆???撱箇?撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?舫??鞈?弦撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "閬死鞈鋆賭?撣?, order: 3 },
        { agent_id: m4Id, is_lead: false, role: "?訾?PR撣?, order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ross Hudgens Siege Media ?批捆撽????撱箇??寞?", description: "Source: Ross Hudgens嚗iege Media ?菔齒鈭綽?2014 撟渲絲蝟餌絞???批捆撽????撱箇??寞?嚗iege Media ?璆剔???亙???SEO ?批捆璈?銋?", steps });
      await upsertSquad(conn, { slug, name: "Ross Hudgens Siege Media ?批捆撽? SEO ???撠?", description: "鋆賭?霈?擃??刻?潸?嗆撘???ｇ?隞亙摰寥????撱箇??oss Hudgens ?瘜??芣??澆?????摰寞??賣偶蝥敺????", industryKey: "marketing", missionType: taskType, workspace: ["seo"], methodology: "Ross Hudgens ??Content-Led Link Building (Siege Media, 2014)", agents: agentMembers, tags: ["seo", "link-building", "digital-pr", "linkable-assets"], useCases: ["B2B??SEO???撱箇?", "慦??雯蝡??蝑", "擃A????脣?"], outputFormats: ["?舫??鞈", "慦?憭閮?", "?訾?PR?瑁?", "???ROI?勗?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Siege Media 摰Ｘ蝢歹?100+ 隡平嚗?, description: "??批捆撽????撱箇??寞?嚗???平摰Ｘ鋆賭??舫??鞈", result: "摰Ｘ撟喳??敺?50-200 ???釭?????嚗?璈??像????150%", source: "Siege Media 摰雯 / Ross Hudgens 瞍? BrightonSEO 2022" }, { company: "QuoteWizard嚗??芣?頛?", description: "? Siege Media ?寞?鋆賭?靽?賊???弦?勗?", result: "?脣? Reuters?orbes?P News 蝑?擃??剁??桃??勗?撣嗡? 300+ 擃?DA ???", source: "Siege Media QuoteWizard 獢??弦 2020" }] });
    }

    // G8: Aleyda Solis ??International SEO Framework (2015)
    {
      const slug = "seo-solis-international";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["seo-audit", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["seo-audit", "international-seo-framework"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "content-localization-seo"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "international-seo-analytics"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "??撣 SEO 璈??弦", description: "???芯??格?撣嚗?摰?隤?嚗??擃? SEO 憓璈?嚗?撠??奎?剖漲?????漲嚗?脣???湔?摨?, tool: "internal", outputType: "international_seo_opportunity", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "蝬脩??嗆?蝑?豢?", description: "?箏???SEO ?豢??雿喟雯蝡瑽?ccTLD嚗w.brand.com嚗s. 摮??brand.com/tw嚗s. 摮?嚗w.brand.com嚗?????? SEO ?拙?", tool: "internal", outputType: "international_url_structure", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "Hreflang 撖虫?閮?", description: "閮剛?摰??Hreflang 璅惜撖虫?閮?嚗Ⅱ靽?Google 甇?Ⅱ霅瘥?閮/?啣??嚗??銴摰孵?憿?, tool: "internal", outputType: "hreflang_implementation_plan", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "?典?摰寧???, description: "閮剛??迤??啣??批捆蝑嚗?璈蝧餉陌嚗??典???萄??弦??啣?雿輻??????啣?獢??冗????, tool: "internal", outputType: "localization_content_strategy", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 5, name: "?? SEO ??餈質馱", description: "撱箇????渡??函? SEO 餈質馱擃頂嚗??振/隤?????瘚????萄???????嚗??交?敹急??瑞?撣", tool: "internal", outputType: "international_seo_dashboard", requiredSkills: ["cross-channel-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "?? SEO 蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "?典?摰孵葦", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "?? SEO ??撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Aleyda Solis ?? SEO 獢???湔撘萇???, description: "Source: Aleyda Solis嚗rainti ?菔齒鈭綽?2015 撟游遣蝡??? SEO 獢嚗◤ Google Webmaster Central 撘嚗?函???亙?????SEO 撠振", steps });
      await upsertSquad(conn, { slug, name: "Aleyda Solis ?? SEO 撣?游撐撠?", description: "? Aleyda Solis ????SEO 獢嚗頂蝯勗??脣憭?閮/?振撣嚗? URL ?嗆???Hreflang ?啣?啣??批捆嚗?Ｖ?撅????", industryKey: "marketing", missionType: taskType, workspace: ["seo"], methodology: "Aleyda Solis ??International SEO Framework (Orainti, 2015)", agents: agentMembers, tags: ["seo", "international", "localization", "hreflang"], useCases: ["????SEO?游撐", "憭?閮蝬脩??芸?", "?餃?頝典?SEO"], outputFormats: ["??撣璈??勗?", "URL?嗆??寞?", "Hreflang閮?", "?典?摰寧???], requiredIntegrations: [], token: 60000, showcases: [{ company: "Atlassian嚗leyda Solis 憿批?嚗?, description: "??? SEO 獢?游撐?唳?瘣脯?瘣脣???, result: "????瘚???18 ???批???200%嚗??梯?撣?嗅??????40%", source: "Aleyda Solis ?祇?瞍? SMX Europe 2019" }, { company: "Lyst嚗?撠??", description: "? Solis 獢??40+ ??閮/撣?芸? SEO ?嗆?", result: "?函???瘚?憓 300%嚗??箏??憭扳?撠?蝝Ｗ像?唬?銝", source: "Aleyda Solis Orainti 獢??弦 2021" }] });
    }

    // G9: Kyle Roof ??On-Page SEO Methodology (PageOptimizer Pro, 2020)
    {
      const slug = "seo-roof-onpage";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["seo-audit", "marketing-analytics"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["seo-audit", "on-page-seo-optimization"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "content-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "seo-optimized-content-writing"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "???????萄?瘛勗漲??", description: "瘛勗漲???格??摮?????嚗nformational/Commercial/Transactional嚗???SERP Top 10 ?摰寞撘??詻?憿?瑽?蝣箏??雿喲??Ｘ芋??, tool: "internal", outputType: "intent_keyword_analysis", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "On-Page ?芸?閮?", description: "? Kyle Roof ?????On-Page ?芸?嚗itle Tag?1-H6 ?嗆????萄?撖漲嚗OP 撌亙蝘飛??蝞??chema Markup", tool: "internal", outputType: "onpage_optimization_plan", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "SEO ?芸??批捆?啣神/?孵神", description: "? On-Page ?芸?閮??啣神?撖怠摰對??芰撖漲???萄????泵??EEAT ?摰寞楛摨艾??啁?璅?撅斗活", tool: "internal", outputType: "seo_optimized_content", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 4, name: "CTR ?芸?嚗itle + Meta嚗?, description: "?芸???蝯?銝剔? Title Tag ??Meta Description嚗??冽摮??蝺?蝑???????撌?, tool: "internal", outputType: "ctr_optimization", requiredSkills: ["seo-audit"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "On-Page SEO 撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "SEO ?批捆撣?, order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Kyle Roof 蝘飛??On-Page SEO ?芸??寞?", description: "Source: Kyle Roof嚗ageOptimizer Pro ?菔齒鈭綽?2020 撟湧? A/B 皜祈岫撽???On-Page SEO ?寞?隢?隞交???葫?芸????", steps });
      await upsertSquad(conn, { slug, name: "Kyle Roof 蝘飛??On-Page SEO 撠?", description: "? Kyle Roof 隞?A/B 皜祈岫撽???On-Page SEO ?寞?嚗????????圈??萄?撖漲?芸?嚗??捱蝑????, industryKey: "marketing", missionType: taskType, workspace: ["seo"], methodology: "Kyle Roof ??Scientific On-Page SEO (PageOptimizer Pro, 2020)", agents: agentMembers, tags: ["seo", "on-page", "technical", "content-optimization"], useCases: ["?SEO?銵??, "?摮?????, "CTR?芸?"], outputFormats: ["??????", "On-Page?芸?閮?", "SEO?芸??批捆", "CTR?芸??勗?"], requiredIntegrations: [], token: 50000, showcases: [{ company: "PageOptimizer Pro嚗yle Roof ?菔齒嚗頨?, description: "??芸??摮詨? On-Page ?寞?蝞∠?撌亙撟喳?祈澈??SEO", result: "POP ?賊??摮???Page 1 ??嚗?鞎餌?嗉???10,000 ??SEO 撠平鈭箏ㄚ", source: "PageOptimizerPro.com / Kyle Roof ?祇?瞍? 2021" }, { company: "Charles Floate嚗???POP ?寞?摰Ｘ嚗?, description: "? Kyle Roof 蝘飛??On-Page ?寞??芸? affiliate 蝬脩?", result: "?格????敺?Page 2-3 ????Page 1 Top 3嚗?璈?亙???300%", source: "Charles Floate ?祇?獢? / YouTube 2022" }] });
    }

    // G10: Rand Fishkin ??10x Content Strategy (Moz, 2015)
    {
      const slug = "seo-fishkin-10x-content";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["content-marketing", "seo-audit"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "10x-content-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "10x-content-research"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-content-creator", "copywriting-pro"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "10x-content-production"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "10x 蝡嗥璈???", description: "?曉?桀??雿喟?蝡嗥?批捆嚗ERP Top 1-3嚗?閰摯嚗?行??航鋆賭??箝?憿?10 ?憟賬??嚗?皞??祆楛摨艾?閬箝擙桀漲?X", tool: "internal", outputType: "10x_opportunity_analysis", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "10x ?批捆鋆賭?閮?", description: "閮剛?頞??暹??雿唾?皞?10 ???批捆閮?嚗??萇?蝛嗆????閬死??摰嗆?閬??摰?蜓憿???, tool: "internal", outputType: "10x_content_blueprint", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 3, name: "10x ??批捆鋆賭?", description: "鋆賭????0 ?憟賬?皞???批捆嚗楛摨艾身閮祕?冽扼??批?Ｚ?頞奎?剖???, tool: "internal", outputType: "10x_flagship_content", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "憭扯?璅⊥撱?????撱箇?", description: "??10x ?批捆閮剛?憭扯?璅⊥撱????蝷曄黎慦??mail ????擃??胯?閬?鋡?鈭恬?霈鞈芸摰寡◤?游?鈭箇???, tool: "internal", outputType: "10x_promotion_plan", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "10x ?批捆??閰摯", description: "閰摯 10x ?批捆???SEO ??嚗?璈??????憓????甜?颯???撠???", tool: "internal", outputType: "10x_content_roi_report", requiredSkills: ["marketing-analytics"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "10x ?批捆蝑撣?, order: 1 },
        { agent_id: m2Id, is_lead: false, role: "蝡嗥?弦撣?, order: 2 },
        { agent_id: m3Id, is_lead: false, role: "10x ?批捆鋆賭?撣?, order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Rand Fishkin 10x Content SEO ??批捆蝑", description: "Source: Rand Fishkin嚗oz ?菔齒鈭綽?2015 撟湔??箝?0x Content??敹萸oz Blog ?甇文???瘚?? 300 ??", steps });
      await upsertSquad(conn, { slug, name: "Rand Fishkin 10x Content SEO ??批捆撠?", description: "銝瘥奎?剖??末銝暺??憟?10 ?and Fishkin ??10x Content ??嚗?批捆憌賢???隞???芣???璆剔?璅??摰寞??賣?蝥撘??????", industryKey: "marketing", missionType: taskType, workspace: ["seo"], methodology: "Rand Fishkin ??10x Content Strategy (Moz, 2015)", agents: agentMembers, tags: ["seo", "content", "10x", "quality"], useCases: ["蝡嗥瞈???萄?SEO", "??批捆鋆賭?", "??SEO霅瑕?瘝喳遣蝡?], outputFormats: ["10x璈???", "10x?批捆閮?", "??批捆", "?典誨閮?"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Moz Blog嚗and Fishkin嚗?, description: "? 10x Content 璅??萎? Whiteboard Friday ?楛摨?SEO ?弦嚗?蝥璆剔??鋡怠??函? SEO 鞈?", result: "Moz Blog ??????300 ?穿?鋡?iContact 隞?$67.5M ?嗉頃嚗?0x ??撟喳??脣? 500+ ?????", source: "Moz.com / Rand Fishkin?ost and Founder??018" }, { company: "HubSpot嚗?0x Content ?嚗?, description: "HubSpot Blog 蝟餌絞? 10x Content ??嚗鋆賭?璆剔??摰???瑟???, result: "??????500 ?穿??銵鈭箏飛蝧?擐?桃??堆?Email ?頞? 300 ??, source: "HubSpot Blog ?祇?蝯梯? 2023" }] });
    }

  // ?? CATEGORY H: PR / KOL (10 squads) ??????????????????????????????????????

  // H1 繚 Jonah Berger STEPPS Contagious Framework
  {
    const slug = "pr-berger-stepps";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["brand-dna", "mbb-strategist"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "mbb-strategist", "social-media-marketing"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["hook-copywriter", "copywriting-pro"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "copywriting-pro", "ad-copywriting-formulas"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["kol-brief", "social-media-marketing"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["kol-brief", "social-media-marketing"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["content-repurposing", "visual-content-creator"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["content-repurposing", "visual-content-creator"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const m5Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
    if (m5Id) { usedIds.push(m5Id); await assignSkillsToAgent(conn, m5Id, ["marketing-analytics", "cross-channel-analytics"]); }
    const m5Info = await getAgentInfo(conn, m5Id);
    const m6Id = await findAgent(conn, ["social-scheduler", "content-marketing"], usedIds);
    if (m6Id) { usedIds.push(m6Id); await assignSkillsToAgent(conn, m6Id, ["social-scheduler", "content-marketing"]); }
    const m6Info = await getAgentInfo(conn, m6Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "STEPPS Trigger Audit", description: "Analyse brand story through Jonah Berger's 6 STEPPS (Social Currency, Triggers, Emotion, Public, Practical Value, Stories) to find the highest-contagion angle.", tool: "internal", outputType: "strategy_doc", requiredSkills: ["brand-dna", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Contagious Narrative Craft", description: "Write shareable story hooks and press angles that activate the strongest STEPPS triggers identified in the audit.", tool: "internal", outputType: "copy_set", requiredSkills: ["hook-copywriter", "ad-copywriting-formulas"] }, m2Info),
      assignAgentToStep({ order: 3, name: "KOL STEPPS Match", description: "Match each STEPPS trigger to KOL profiles whose audience psychology aligns, brief them with trigger-specific talking points.", tool: "internal", outputType: "kol_brief", requiredSkills: ["kol-brief", "social-media-marketing"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Multi-Format Asset Pack", description: "Repurpose the contagious narrative into short video, carousel, long-form post and press release formats.", tool: "internal", outputType: "content_pack", requiredSkills: ["content-repurposing", "visual-content-creator"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Viral Coefficient Tracking", description: "Measure share-rate, earned reach and secondary amplification to calculate viral coefficient; iterate on underperforming STEPPS triggers.", tool: "internal", outputType: "analytics_report", requiredSkills: ["marketing-analytics", "cross-channel-analytics"] }, m5Info),
      assignAgentToStep({ order: 6, name: "Wave Scheduling", description: "Schedule content waves to sustain trigger exposure across platforms, avoiding saturation decay.", tool: "internal", outputType: "content_calendar", requiredSkills: ["social-scheduler", "content-marketing"] }, m6Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "STEPPS Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Contagious Copywriter", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "KOL Matcher", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Asset Repurposer", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "Viral Analyst", order: 5 },
      { agent_id: m6Id, is_lead: false, role: "Wave Scheduler", order: 6 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Berger STEPPS Contagious PR", description: "Source: Jonah Berger?ontagious: Why Things Catch On??013, Wharton School. Blendtec 'Will It Blend?' applied Social Currency trigger ??700% sales increase. Dollar Shave Club launch video (Practical Value + Emotion) ??12,000 orders in 48 hours.", steps });
    await upsertSquad(conn, { slug, name: "Berger STEPPS Contagious PR", description: "Use Jonah Berger's 6 STEPPS framework to engineer PR and KOL campaigns with built-in sharing psychology.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Jonah Berger ??Contagious: Why Things Catch On (2013)", agents: agentMembers, tags: ["pr", "viral", "kol", "word-of-mouth", "berger"], useCases: ["product launch PR", "KOL activation", "brand storytelling"], outputFormats: ["pr_brief", "kol_brief", "content_pack", "analytics_report"], requiredIntegrations: [], token: 58000, showcases: [{ company: "Blendtec", description: "Applied Social Currency STEPPS trigger via 'Will It Blend?' YouTube series", result: "700% increase in retail sales; 300M+ YouTube views", source: "Berger, J. (2013). Contagious. Simon & Schuster." }] });
  }

  // H2 繚 Ryan Holiday Trust Me I'm Lying ??Media Manipulation PR
  {
    const slug = "pr-holiday-media-manipulation";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["mbb-strategist", "brand-dna"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["mbb-strategist", "brand-dna", "social-media-marketing"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["hook-copywriter", "ad-copywriting-formulas"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "ad-copywriting-formulas", "copywriting-pro"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["content-marketing", "seo-audit"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["content-marketing", "seo-audit"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-analytics", "cross-channel-analytics"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Trading-Up Strategy", description: "Identify small, niche media outlets covering a genuine story angle; craft a 'tradeable' exclusive that will organically climb up to larger publications.", tool: "internal", outputType: "pr_strategy", requiredSkills: ["mbb-strategist", "brand-dna"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Outrage & Controversy Hook", description: "Write a slightly provocative pitch that journalists can't ignore ??emotionally resonant, factually defensible, headline-ready.", tool: "internal", outputType: "press_pitch", requiredSkills: ["hook-copywriter", "ad-copywriting-formulas"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Linchpin Content Anchor", description: "Publish a cornerstone piece (blog, study, video) that gives media a credible source to link and cite, fuelling SEO authority alongside earned media.", tool: "internal", outputType: "cornerstone_content", requiredSkills: ["content-marketing", "seo-audit"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Coverage Velocity Tracking", description: "Monitor media pick-up speed, share velocity and secondary citations to identify amplification opportunities and kill negative spirals early.", tool: "internal", outputType: "coverage_report", requiredSkills: ["marketing-analytics", "cross-channel-analytics"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "PR Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Controversy Copywriter", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Content Anchor Builder", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Coverage Analyst", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Holiday Media Manipulation PR", description: "Source: Ryan Holiday?rust Me, I'm Lying: Confessions of a Media Manipulator??012. Used for American Apparel + Tucker Max book campaigns ??traded stories up from blogs to national media, achieving bestseller status with near-zero ad spend.", steps });
    await upsertSquad(conn, { slug, name: "Holiday Media Manipulation PR", description: "Ryan Holiday's trade-up-the-chain tactic: plant compelling stories in small outlets, let media amplification carry them to top-tier publications.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Ryan Holiday ??Trust Me I'm Lying (2012)", agents: agentMembers, tags: ["pr", "media-relations", "earned-media", "holiday"], useCases: ["book/product launch", "brand controversy management", "media relations"], outputFormats: ["pr_strategy", "press_pitch", "cornerstone_content", "coverage_report"], requiredIntegrations: [], token: 52000, showcases: [{ company: "Tucker Max (I Hope They Serve Beer In Hell)", description: "Applied trade-up-the-chain PR strategy with manufactured controversy", result: "NY Times bestseller #1; 1.5M+ copies sold with minimal traditional ad spend", source: "Holiday, R. (2012). Trust Me, I'm Lying. Portfolio/Penguin." }] });
  }

  // H3 繚 Malcolm Gladwell Tipping Point ??Connector/Maven/Salesman PR
  {
    const slug = "pr-gladwell-tipping-point";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["market-research-agent", "mbb-strategist"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["market-research-agent", "mbb-strategist", "brand-dna"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["kol-brief", "social-media-marketing"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["kol-brief", "social-media-marketing"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["copywriting-pro", "hook-copywriter"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-analytics", "cross-channel-analytics"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "CMS Audience Mapping", description: "Identify Connectors (large networks), Mavens (information brokers) and Salesmen (persuaders) in the target audience using social graph analysis and influencer data.", tool: "internal", outputType: "audience_map", requiredSkills: ["market-research-agent", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Maven & Connector KOL Briefing", description: "Recruit and brief Connectors and Mavens as first-wave amplifiers; provide exclusive information and a clear sharing incentive.", tool: "internal", outputType: "kol_brief", requiredSkills: ["kol-brief", "social-media-marketing"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Sticky Message Engineering", description: "Apply Gladwell's Stickiness Factor: craft a message so memorable and actionable that it demands repetition. A/B test headline and hook variants.", tool: "internal", outputType: "copy_variants", requiredSkills: ["copywriting-pro", "hook-copywriter"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Tipping Point Monitoring", description: "Track cascade metrics ??shares-per-share, new-audience reach rate ??to detect and accelerate the tipping point moment.", tool: "internal", outputType: "cascade_report", requiredSkills: ["marketing-analytics", "cross-channel-analytics"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "CMS Analyst", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "KOL Activator", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Sticky Message Writer", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Cascade Tracker", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Gladwell Tipping Point PR", description: "Source: Malcolm Gladwell?he Tipping Point: How Little Things Can Make a Big Difference??000. Hush Puppies revival (1994??5) driven by a handful of Manhattan Connectors; Airwalk skate shoe launch via Maven seeding ??both cited as canonical Tipping Point cases.", steps });
    await upsertSquad(conn, { slug, name: "Gladwell Tipping Point PR", description: "Activate Connectors, Mavens and Salesmen to engineer the social tipping point for product or brand launches.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Malcolm Gladwell ??The Tipping Point (2000)", agents: agentMembers, tags: ["pr", "word-of-mouth", "influencer", "gladwell", "tipping-point"], useCases: ["product launch", "brand revival", "community seeding"], outputFormats: ["audience_map", "kol_brief", "copy_variants", "cascade_report"], requiredIntegrations: [], token: 54000, showcases: [{ company: "Hush Puppies (Wolverine World Wide)", description: "A handful of Manhattan hipster Connectors began wearing Hush Puppies; Gladwell used this as the definitive Tipping Point case study", result: "Sales jumped from 30,000 pairs/yr to 430,000 in 1995 with zero marketing spend", source: "Gladwell, M. (2000). The Tipping Point. Little, Brown." }] });
  }

  // H4 繚 Brian Solis PESO Model (Paid/Earned/Shared/Owned)
  {
    const slug = "pr-solis-peso";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["mbb-strategist", "brand-dna"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["mbb-strategist", "brand-dna", "marketing-strategy-pmm"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["paid-ads", "meta-ads-paid-ads"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["paid-ads", "meta-ads-paid-ads", "tiktok-ads"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["kol-brief", "social-media-marketing"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["kol-brief", "social-media-marketing"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["content-marketing", "seo-audit"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["content-marketing", "seo-audit"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "PESO Channel Blueprint", description: "Map the full PESO media mix for the campaign: which messages belong in Paid, Earned, Shared and Owned channels, with budget allocation rationale.", tool: "internal", outputType: "channel_blueprint", requiredSkills: ["mbb-strategist", "marketing-strategy-pmm"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Paid Media Activation", description: "Execute targeted paid ads to seed reach before earned media can compound; include retargeting layers for website visitors.", tool: "internal", outputType: "ad_campaigns", requiredSkills: ["paid-ads", "meta-ads-paid-ads"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Earned & Shared KOL Layer", description: "Brief KOLs and media partners to generate earned coverage and shared social content that multiplies the paid seed.", tool: "internal", outputType: "kol_brief", requiredSkills: ["kol-brief", "social-media-marketing"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Owned Content Hub", description: "Publish cornerstone owned content (blog, whitepaper, microsite) that becomes the SEO-capturing destination for earned and shared traffic.", tool: "internal", outputType: "owned_content", requiredSkills: ["content-marketing", "seo-audit"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "PESO Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Paid Media Lead", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Earned/Shared KOL Lead", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Owned Content Lead", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Solis PESO Integrated PR", description: "Source: Brian Solis & Deirdre Breakenridge?utting the Public Back in Public Relations??009; PESO model popularised by Spin Sucks / Gini Dietrich. Used by SAP, IBM and Salesforce for integrated comms campaigns.", steps });
    await upsertSquad(conn, { slug, name: "Solis PESO Integrated PR", description: "Orchestrate Paid, Earned, Shared and Owned media in one coherent campaign using Brian Solis's PESO framework.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Brian Solis ??PESO Model (2009)", agents: agentMembers, tags: ["pr", "paid", "earned", "shared", "owned", "peso", "integrated"], useCases: ["product launch", "brand awareness", "integrated campaign"], outputFormats: ["channel_blueprint", "ad_campaigns", "kol_brief", "owned_content"], requiredIntegrations: [], token: 56000, showcases: [{ company: "Salesforce", description: "Applied PESO integration across Dreamforce event content, paid promotion, KOL sharing, and owned Trailhead media", result: "Dreamforce consistently generates 100K+ attendees and billions in earned media value annually", source: "Solis, B. (2009). Putting the Public Back in Public Relations. FT Press." }] });
  }

  // H5 繚 Gini Dietrich PESO Execution (Spin Sucks)
  {
    const slug = "pr-dietrich-peso";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["content-marketing", "brand-dna"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["content-marketing", "brand-dna", "mbb-strategist"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["seo-audit", "market-research-agent"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["seo-audit", "market-research-agent"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["email-marketing", "copywriting-pro"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["email-marketing", "copywriting-pro"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["social-scheduler", "social-media-marketing"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["social-scheduler", "social-media-marketing"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const m5Id = await findAgent(conn, ["marketing-analytics", "attribution-modeling"], usedIds);
    if (m5Id) { usedIds.push(m5Id); await assignSkillsToAgent(conn, m5Id, ["marketing-analytics", "attribution-modeling", "cross-channel-analytics"]); }
    const m5Info = await getAgentInfo(conn, m5Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Owned Content Foundation", description: "Build the owned media hub: long-form blog, podcast and video content that establishes topical authority and earns organic traffic.", tool: "internal", outputType: "content_plan", requiredSkills: ["content-marketing", "brand-dna"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Earned SEO Link Strategy", description: "Identify guest post, citation and backlink opportunities that convert owned content into earned media credibility.", tool: "internal", outputType: "link_strategy", requiredSkills: ["seo-audit", "market-research-agent"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Subscriber Nurture (Owned List)", description: "Convert earned/shared traffic into email subscribers; deploy nurture sequences that move prospects toward brand advocacy.", tool: "internal", outputType: "email_sequence", requiredSkills: ["email-marketing", "copywriting-pro"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Shared Social Amplification", description: "Schedule and publish consistent social content that repurposes owned assets, encouraging community shares and UGC.", tool: "internal", outputType: "social_calendar", requiredSkills: ["social-scheduler", "social-media-marketing"] }, m4Info),
      assignAgentToStep({ order: 5, name: "PESO Attribution Report", description: "Attribute leads and revenue back to each PESO channel; calculate blended CPL and identify highest-ROI media mix.", tool: "internal", outputType: "attribution_report", requiredSkills: ["marketing-analytics", "attribution-modeling"] }, m5Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Content Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "SEO / Earned Lead", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Email Nurture Lead", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Social Amplifier", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "PESO Analyst", order: 5 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Dietrich PESO PR Execution", description: "Source: Gini Dietrich?pin Sucks: Communication and Reputation Management in the Digital Age??014, Que Publishing. Arment Dietrich's own Spin Sucks blog grew to 100K monthly readers using this exact PESO execution.", steps });
    await upsertSquad(conn, { slug, name: "Dietrich PESO PR Execution", description: "Gini Dietrich's practical PESO execution: start with owned content, amplify through earned SEO links, shared social and email nurture.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Gini Dietrich ??Spin Sucks (2014)", agents: agentMembers, tags: ["pr", "peso", "content", "seo", "email", "dietrich"], useCases: ["B2B PR", "thought leadership", "inbound PR"], outputFormats: ["content_plan", "link_strategy", "email_sequence", "social_calendar", "attribution_report"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Arment Dietrich / Spin Sucks", description: "Applied own PESO model to the Spin Sucks blog and PR firm marketing", result: "100K+ monthly blog readers, top-ranked PR publication, clients include Fortune 500", source: "Dietrich, G. (2014). Spin Sucks. Que Publishing." }] });
  }

  // H6 繚 Lee Odden Influence 2.0 ??Co-Creation KOL
  {
    const slug = "pr-odden-influence";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["market-research-agent", "mbb-strategist"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["market-research-agent", "mbb-strategist", "marketing-strategy-pmm"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["kol-brief", "content-marketing"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["kol-brief", "content-marketing", "brand-dna"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["visual-content-creator", "copywriting-pro"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "copywriting-pro"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["seo-audit", "cross-channel-analytics"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["seo-audit", "cross-channel-analytics"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Influence 2.0 Mapping", description: "Identify top-tier influencers (reach + relevance + resonance) aligned with brand topic; map their audience overlap and content themes.", tool: "internal", outputType: "influence_map", requiredSkills: ["market-research-agent", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Co-Creation Brief", description: "Design a collaborative content asset (roundup, co-authored research, podcast series) that gives influencers a genuine reason to participate and share.", tool: "internal", outputType: "co_creation_brief", requiredSkills: ["kol-brief", "content-marketing"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Joint Content Production", description: "Produce the co-created asset with influencer inputs ??quotes, data, expert sections ??formatted for maximum shareability.", tool: "internal", outputType: "co_created_asset", requiredSkills: ["visual-content-creator", "copywriting-pro"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Mutual Amplification Tracking", description: "Track combined reach from brand + influencer promotion; calculate share of voice and backlink acquisition from the co-creation.", tool: "internal", outputType: "amplification_report", requiredSkills: ["seo-audit", "cross-channel-analytics"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Influence Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Co-Creation Director", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Content Producer", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Amplification Analyst", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Odden Influence 2.0 Co-Creation", description: "Source: Lee Odden?ptimize??012 + TopRank Marketing Influence 2.0 model. SAP, LinkedIn and Dell used co-created influencer content via TopRank to achieve 2??? engagement vs brand-only content.", steps });
    await upsertSquad(conn, { slug, name: "Odden Influence 2.0 Co-Creation", description: "Lee Odden's Influence 2.0: co-create content WITH influencers rather than just paying them to post, driving genuine engagement and mutual amplification.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Lee Odden ??Optimize & Influence 2.0 (2012)", agents: agentMembers, tags: ["kol", "influencer", "co-creation", "earned-media", "odden"], useCases: ["B2B thought leadership", "KOL content campaigns", "industry report co-authoring"], outputFormats: ["influence_map", "co_creation_brief", "co_created_asset", "amplification_report"], requiredIntegrations: [], token: 54000, showcases: [{ company: "SAP (via TopRank Marketing)", description: "Co-created influencer content series for SAP using Odden's Influence 2.0 framework", result: "2??? higher engagement vs brand-only content; significant earned backlink acquisition", source: "Odden, L. (2012). Optimize. Wiley." }] });
  }

  // H7 繚 Neal Schaffer Social Influence ??The Age of Influence
  {
    const slug = "pr-schaffer-influence";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["social-media-marketing", "brand-dna"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["social-media-marketing", "brand-dna", "mbb-strategist"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["kol-brief", "market-research-agent"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["kol-brief", "market-research-agent"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["content-repurposing", "short-video-scriptwriter"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["content-repurposing", "short-video-scriptwriter"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-analytics", "cross-channel-analytics"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Influencer Tier Strategy", description: "Define a tiered influencer mix (mega / macro / micro / nano) aligned to campaign goals; nano and micro influencers for authenticity, macro for reach.", tool: "internal", outputType: "tier_strategy", requiredSkills: ["social-media-marketing", "brand-dna"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Relationship-First Outreach", description: "Conduct authentic relationship-building with shortlisted influencers before pitching ??comment, share, engage ??then propose a genuine collaboration.", tool: "internal", outputType: "outreach_plan", requiredSkills: ["kol-brief", "market-research-agent"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Always-On Content Stream", description: "Build a recurring influencer content programme (monthly or quarterly) rather than one-off posts, creating sustained brand association.", tool: "internal", outputType: "content_programme", requiredSkills: ["content-repurposing", "short-video-scriptwriter"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Authentic ROI Measurement", description: "Measure engagement quality (saves, comments, DMs) not just reach; calculate cost-per-engaged-user and attribute conversions.", tool: "internal", outputType: "roi_report", requiredSkills: ["marketing-analytics", "cross-channel-analytics"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Influence Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Relationship Outreach", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Content Programme Lead", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "ROI Analyst", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Schaffer Social Influence Programme", description: "Source: Neal Schaffer?he Age of Influence??020, HarperCollins. Schaffer's framework used by brands including L'Or矇al and Lenovo to build always-on micro-influencer programmes instead of episodic celebrity endorsements.", steps });
    await upsertSquad(conn, { slug, name: "Schaffer Social Influence Programme", description: "Neal Schaffer's relationship-first influencer marketing: build tiered, always-on programmes with micro and nano influencers for authentic ROI.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Neal Schaffer ??The Age of Influence (2020)", agents: agentMembers, tags: ["influencer", "kol", "micro-influencer", "schaffer", "always-on"], useCases: ["influencer programme design", "product seeding", "KOL relationship management"], outputFormats: ["tier_strategy", "outreach_plan", "content_programme", "roi_report"], requiredIntegrations: [], token: 52000, showcases: [{ company: "L'Or矇al", description: "Applied Schaffer's tiered influencer strategy across micro and macro tiers for product launches", result: "Micro-influencer campaigns achieved 60% higher engagement rates vs macro-only approach", source: "Schaffer, N. (2020). The Age of Influence. HarperCollins." }] });
  }

  // H8 繚 Mark Schaefer KNOWN ??Personal Brand PR
  {
    const slug = "pr-schaefer-known";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["brand-dna", "mbb-strategist"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "mbb-strategist", "marketing-strategy-pmm"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["content-marketing", "copywriting-pro"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "copywriting-pro", "hook-copywriter"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["social-scheduler", "social-media-marketing"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-scheduler", "social-media-marketing"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["seo-audit", "market-research-agent"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["seo-audit", "market-research-agent"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const m5Id = await findAgent(conn, ["email-marketing", "marketing-analytics"], usedIds);
    if (m5Id) { usedIds.push(m5Id); await assignSkillsToAgent(conn, m5Id, ["email-marketing", "marketing-analytics"]); }
    const m5Info = await getAgentInfo(conn, m5Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Sustainable Interest Finding", description: "Identify the brand's or executive's 'sustainable interest' ??the intersection of passion, skill and market demand ??using Schaefer's 4-step KNOWN discovery process.", tool: "internal", outputType: "brand_positioning", requiredSkills: ["brand-dna", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Content Space Domination", description: "Choose one primary content channel and produce the highest-quality, most consistent content in the chosen niche to own that space.", tool: "internal", outputType: "content_strategy", requiredSkills: ["content-marketing", "copywriting-pro"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Consistent Visibility Engine", description: "Build a publishing cadence that guarantees weekly visibility; repurpose hero content across social channels to maintain omnipresence.", tool: "internal", outputType: "publishing_schedule", requiredSkills: ["social-scheduler", "social-media-marketing"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Credibility Signals", description: "Accumulate credibility badges: media mentions, speaking invitations, backlinks, expert quotes ??then amplify each through owned channels.", tool: "internal", outputType: "credibility_plan", requiredSkills: ["seo-audit", "market-research-agent"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Audience Monetisation", description: "Convert personal brand audience into revenue via email list, digital products or consulting pipeline; track list growth and conversion rate.", tool: "internal", outputType: "monetisation_plan", requiredSkills: ["email-marketing", "marketing-analytics"] }, m5Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Brand Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Content Dominator", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Visibility Engine", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Credibility Builder", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "Audience Monetiser", order: 5 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Schaefer KNOWN Personal Brand PR", description: "Source: Mark Schaefer?NOWN: The Handbook for Building and Unleashing Your Personal Brand in the Digital Age??017. Jay Baer, Ann Handley and Brian Clark all used this model consciously; Schaefer validated with 50+ executive case studies.", steps });
    await upsertSquad(conn, { slug, name: "Schaefer KNOWN Personal Brand PR", description: "Mark Schaefer's KNOWN framework: find a sustainable interest, dominate a content space and accumulate credibility until the market recognises you.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Mark Schaefer ??KNOWN (2017)", agents: agentMembers, tags: ["personal-brand", "thought-leadership", "pr", "schaefer", "known"], useCases: ["executive personal branding", "founder brand building", "thought leadership PR"], outputFormats: ["brand_positioning", "content_strategy", "publishing_schedule", "credibility_plan", "monetisation_plan"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Jay Baer (Convince & Convert)", description: "Built personal brand using consistent, niche-dominating content in the word-of-mouth marketing space", result: "NY Times-bestselling author, keynote speaker with $20K+ fees, top-ranked marketing blog", source: "Schaefer, M. (2017). KNOWN. Schaefer Marketing Solutions." }] });
  }

  // H9 繚 Jay Baer Hug Your Haters ??Public Crisis Response
  {
    const slug = "pr-baer-hug-haters";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["brand-dna", "social-media-marketing"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "social-media-marketing", "mbb-strategist"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "hook-copywriter", "ad-copywriting-formulas"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "cross-channel-analytics"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["content-marketing", "email-marketing"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["content-marketing", "email-marketing"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Hater Audience Mapping", description: "Categorise complainers into 'onstage haters' (public social/review) and 'offstage haters' (email/phone); assign response protocols per channel per Baer's matrix.", tool: "internal", outputType: "response_matrix", requiredSkills: ["brand-dna", "social-media-marketing"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Empathy Response Templates", description: "Write channel-specific response templates that acknowledge, apologise (if warranted) and act ??turning public complaints into brand-loyalty moments.", tool: "internal", outputType: "response_templates", requiredSkills: ["copywriting-pro", "hook-copywriter"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Complaint Velocity Monitoring", description: "Track complaint volume, response time and sentiment shift to ensure the brand never ignores a complaint (Baer's core rule: answer every complaint, every time).", tool: "internal", outputType: "monitoring_dashboard", requiredSkills: ["marketing-analytics", "cross-channel-analytics"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Win-Back Content Loop", description: "Follow up resolved complaints with value-add content (exclusive offer, helpful resource) to convert former haters into advocates.", tool: "internal", outputType: "winback_sequence", requiredSkills: ["content-marketing", "email-marketing"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "PR Crisis Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Empathy Copywriter", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Complaint Monitor", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Win-Back Specialist", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Baer Hug Your Haters Crisis PR", description: "Source: Jay Baer?ug Your Haters: How to Embrace Complaints and Keep Your Customers??016, Portfolio/Penguin. Google and KFC used Baer's response framework; data shows responding to 1-star reviews publicly increases re-purchase intent by 33%.", steps });
    await upsertSquad(conn, { slug, name: "Baer Hug Your Haters Crisis PR", description: "Jay Baer's crisis PR framework: answer every complaint on every channel, every time ??turning haters into the most powerful brand advocates.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Jay Baer ??Hug Your Haters (2016)", agents: agentMembers, tags: ["pr", "crisis", "reputation", "customer-service", "baer"], useCases: ["brand crisis management", "negative review response", "reputation repair"], outputFormats: ["response_matrix", "response_templates", "monitoring_dashboard", "winback_sequence"], requiredIntegrations: [], token: 52000, showcases: [{ company: "KFC (Yum! Brands)", description: "Implemented universal complaint response policy aligned with Hug Your Haters framework", result: "33% increase in re-purchase intent among customers whose public complaints received responses", source: "Baer, J. (2016). Hug Your Haters. Portfolio/Penguin." }] });
  }

  // H10 繚 KOL Blueprint ??Micro-KOL Performance System
  {
    const slug = "pr-millen-kol-blueprint";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["kol-brief", "market-research-agent"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["kol-brief", "market-research-agent", "marketing-strategy-pmm"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["short-video-scriptwriter", "hook-copywriter"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["short-video-scriptwriter", "hook-copywriter", "tiktok-ads"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["visual-ad-brief", "visual-content-creator"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-ad-brief", "visual-content-creator"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["attribution-modeling", "marketing-analytics"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["attribution-modeling", "marketing-analytics", "cross-channel-analytics"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Micro-KOL Sourcing & Vetting", description: "Identify nano/micro KOLs (10K??00K followers) with high authentic engagement; vet for audience quality, fake-follower ratio and brand safety.", tool: "internal", outputType: "kol_shortlist", requiredSkills: ["kol-brief", "market-research-agent"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Performance Brief & Script", description: "Write a tight performance brief with hooks, key messages and CTA scripts for short-form video content; include platform-specific format guidelines.", tool: "internal", outputType: "kol_script", requiredSkills: ["short-video-scriptwriter", "hook-copywriter"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Creative Asset Package", description: "Produce visual reference assets (mood board, product shots, overlay templates) that give KOLs creative direction without restricting authenticity.", tool: "internal", outputType: "creative_pack", requiredSkills: ["visual-ad-brief", "visual-content-creator"] }, m3Info),
      assignAgentToStep({ order: 4, name: "KOL Performance Attribution", description: "Track unique promo codes, UTM links and pixel events per KOL; calculate CPE, CPA and earned media value to rank KOL ROI.", tool: "internal", outputType: "performance_report", requiredSkills: ["attribution-modeling", "marketing-analytics"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "KOL Sourcing Lead", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Script & Brief Writer", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Creative Director", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Performance Analyst", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Micro-KOL Performance Blueprint", description: "Source: KOL Blueprint methodology (2022) synthesised from Neal Schaffer, Mediakix and Influencer Marketing Hub research. Gymshark scaled to $1.3B valuation primarily through micro-KOL performance seeding; Daniel Wellington built a $200M watch brand solely via micro-influencer gifting.", steps });
    await upsertSquad(conn, { slug, name: "Micro-KOL Performance Blueprint", description: "Systematic micro-KOL programme: source authentic nano/micro influencers, brief them for performance, track ROI per KOL and scale winners.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "KOL Blueprint ??Micro-Influencer Performance System (2022)", agents: agentMembers, tags: ["kol", "micro-influencer", "performance", "tiktok", "seeding"], useCases: ["product seeding", "D2C influencer campaigns", "TikTok KOL activation"], outputFormats: ["kol_shortlist", "kol_script", "creative_pack", "performance_report"], requiredIntegrations: [], token: 54000, showcases: [{ company: "Gymshark", description: "Built entire brand through micro-KOL seeding programme; athletes and fitness micro-influencers received product and became authentic advocates", result: "Scaled from 瞿0 to 瞿1.3B valuation in 8 years with minimal traditional advertising", source: "Influencer Marketing Hub (2022). Gymshark Influencer Strategy Case Study." }] });
  }

  // ?? CATEGORY I: BRAND STRATEGY (10 squads) ????????????????????????????????

  // I1 繚 April Dunford Obviously Awesome ??Positioning
  {
    const slug = "brand-dunford-positioning";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["brand-dna", "mbb-strategist"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "mbb-strategist", "marketing-strategy-pmm"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "marketing-analytics"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["copywriting-pro", "hook-copywriter", "ad-copywriting-formulas"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["brand-identity", "visual-content-creator"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["brand-identity", "visual-content-creator"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const m5Id = await findAgent(conn, ["content-marketing", "social-media-marketing"], usedIds);
    if (m5Id) { usedIds.push(m5Id); await assignSkillsToAgent(conn, m5Id, ["content-marketing", "social-media-marketing"]); }
    const m5Info = await getAgentInfo(conn, m5Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Competitive Alternatives Audit", description: "Identify what customers would use if the product didn't exist ??these are true competitive alternatives, not just named competitors.", tool: "internal", outputType: "competitive_audit", requiredSkills: ["brand-dna", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Unique Attributes & Value Mapping", description: "List genuinely unique attributes; map each to provable customer value using Dunford's 10-step positioning canvas.", tool: "internal", outputType: "positioning_canvas", requiredSkills: ["market-research-agent", "marketing-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Positioning Statement Craft", description: "Write a crisp positioning statement and messaging hierarchy: for [best-fit customers], [product] is the [category] that [unique value] because [proof].", tool: "internal", outputType: "positioning_statement", requiredSkills: ["copywriting-pro", "hook-copywriter"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Visual Brand Alignment", description: "Align visual identity (logo, colour, typography) to the new positioning to ensure brand signals match the strategic claim.", tool: "internal", outputType: "brand_identity_update", requiredSkills: ["brand-identity", "visual-content-creator"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Market Category Communication", description: "Communicate the new market category through owned content, sales enablement and social channels to reshape buyer perception.", tool: "internal", outputType: "go_to_market_content", requiredSkills: ["content-marketing", "social-media-marketing"] }, m5Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Positioning Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Value Researcher", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Messaging Architect", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Visual Aligner", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "Market Category Publisher", order: 5 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Dunford Obviously Awesome Positioning", description: "Source: April Dunford?bviously Awesome: How to Nail Product Positioning so Customers Get It, Buy It, Love It??019. Dunford repositioned Janna Systems from document management ??CRM ??sold to IBM for $100M. She has repositioned 200+ B2B companies.", steps });
    await upsertSquad(conn, { slug, name: "Dunford Obviously Awesome Positioning", description: "April Dunford's 10-step positioning process: find competitive alternatives, isolate unique attributes, map value, define best-fit customers and own a new market category.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "April Dunford ??Obviously Awesome (2019)", agents: agentMembers, tags: ["brand", "positioning", "b2b", "dunford", "strategy"], useCases: ["product repositioning", "new market category creation", "B2B brand strategy"], outputFormats: ["competitive_audit", "positioning_canvas", "positioning_statement", "brand_identity_update", "go_to_market_content"], requiredIntegrations: [], token: 62000, showcases: [{ company: "Janna Systems", description: "April Dunford repositioned the company from document management to sales contact management (proto-CRM)", result: "Acquisition by IBM for $100M ??positioning shift was the primary value driver", source: "Dunford, A. (2019). Obviously Awesome. Ambient Press." }] });
  }

  // I2 繚 Donald Miller StoryBrand 7 Framework
  {
    const slug = "brand-miller-storybrand";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["brand-dna", "mbb-strategist"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "mbb-strategist", "marketing-strategy-pmm"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "hook-copywriter", "ad-copywriting-formulas"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["brand-identity", "visual-content-creator"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["brand-identity", "visual-content-creator"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["content-marketing", "seo-audit"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["content-marketing", "seo-audit"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const m5Id = await findAgent(conn, ["email-marketing", "marketing-analytics"], usedIds);
    if (m5Id) { usedIds.push(m5Id); await assignSkillsToAgent(conn, m5Id, ["email-marketing", "marketing-analytics"]); }
    const m5Info = await getAgentInfo(conn, m5Id);
    const m6Id = await findAgent(conn, ["paid-ads", "remarketing-strategy"], usedIds);
    if (m6Id) { usedIds.push(m6Id); await assignSkillsToAgent(conn, m6Id, ["paid-ads", "remarketing-strategy"]); }
    const m6Info = await getAgentInfo(conn, m6Id);
    const m7Id = await findAgent(conn, ["social-scheduler", "social-media-marketing"], usedIds);
    if (m7Id) { usedIds.push(m7Id); await assignSkillsToAgent(conn, m7Id, ["social-scheduler", "social-media-marketing"]); }
    const m7Info = await getAgentInfo(conn, m7Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Character (Customer Hero)", description: "Define the customer as the hero: their primary desire, external problem, internal frustration and philosophical stakes (the 3 levels of problem).", tool: "internal", outputType: "hero_profile", requiredSkills: ["brand-dna", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Guide Positioning & Empathy", description: "Position the brand as the empathetic, authoritative Guide ??write the empathy statement and authority proof points that earn the hero's trust.", tool: "internal", outputType: "guide_statement", requiredSkills: ["copywriting-pro", "hook-copywriter"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Plan & Visual Identity", description: "Create a 3-step Plan that removes the hero's fear of taking action; align visual brand identity to the guide archetype.", tool: "internal", outputType: "brand_plan_visual", requiredSkills: ["brand-identity", "visual-content-creator"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Call to Action Content", description: "Write direct CTAs (buy now) and transitional CTAs (free resource) into website and long-form content; optimise for organic discovery.", tool: "internal", outputType: "cta_content", requiredSkills: ["content-marketing", "seo-audit"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Failure Stakes & Success Email", description: "Write email sequences that describe the cost of inaction (failure stakes) and paint the success transformation clearly, driving urgency.", tool: "internal", outputType: "email_sequences", requiredSkills: ["email-marketing", "marketing-analytics"] }, m5Info),
      assignAgentToStep({ order: 6, name: "Paid Retargeting with StoryBrand Script", description: "Run retargeting ads using the StoryBrand script structure: hero problem ??guide solution ??CTA ??transformation promise.", tool: "internal", outputType: "ad_campaigns", requiredSkills: ["paid-ads", "remarketing-strategy"] }, m6Info),
      assignAgentToStep({ order: 7, name: "Ongoing StoryBrand Social Narrative", description: "Maintain social content that consistently casts the customer as hero, positions brand as guide and drives CTA ??never interrupts, always serves.", tool: "internal", outputType: "social_content", requiredSkills: ["social-scheduler", "social-media-marketing"] }, m7Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "StoryBrand Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Guide Copywriter", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Plan & Visual Designer", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "CTA Content Writer", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "Email Narrative Specialist", order: 5 },
      { agent_id: m6Id, is_lead: false, role: "Paid Retargeting Lead", order: 6 },
      { agent_id: m7Id, is_lead: false, role: "Social Narrator", order: 7 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Miller StoryBrand 7 Brand Narrative", description: "Source: Donald Miller?uilding a StoryBrand: Clarify Your Message So Customers Will Listen??017, HarperCollins. Over 10,000 companies have completed StoryBrand workshops. Chick-fil-A, Pantene and hundreds of SMBs cite measurable website conversion improvements of 20??0%.", steps });
    await upsertSquad(conn, { slug, name: "Miller StoryBrand 7 Brand Narrative", description: "Donald Miller's 7-part StoryBrand framework: cast the customer as hero, the brand as guide; communicate through all 7 narrative elements across every channel.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Donald Miller ??Building a StoryBrand (2017)", agents: agentMembers, tags: ["brand", "storytelling", "narrative", "miller", "storybrand"], useCases: ["brand messaging overhaul", "website copy", "full-funnel brand narrative"], outputFormats: ["hero_profile", "guide_statement", "brand_plan_visual", "cta_content", "email_sequences", "ad_campaigns", "social_content"], requiredIntegrations: [], token: 68000, showcases: [{ company: "Pantene (P&G)", description: "Repositioned using StoryBrand principles ??customer (hero) has bad hair problem; Pantene (guide) provides the solution", result: "Revenue grew from $500M to $1B+ after StoryBrand-aligned messaging overhaul", source: "Miller, D. (2017). Building a StoryBrand. HarperCollins." }] });
  }

  // I3 繚 Marty Neumeier Brand Gap ??Brand Strategy
  {
    const slug = "brand-neumeier-brand-gap";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["brand-dna", "brand-identity"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "brand-identity", "mbb-strategist"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "marketing-analytics"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["visual-content-creator", "copywriting-pro"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "copywriting-pro"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["content-marketing", "social-media-marketing"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["content-marketing", "social-media-marketing"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Differentiation Audit", description: "Apply Neumeier's Brand Gap audit: is the brand differentiated? Is it relevant? Is it genuine? Score on all 3 and identify the primary gap to close.", tool: "internal", outputType: "brand_gap_audit", requiredSkills: ["brand-dna", "brand-identity"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Charisma Mapping", description: "Research what customers truly feel (not think) about the brand; identify the emotional triggers that build brand charisma vs. generic trust.", tool: "internal", outputType: "charisma_map", requiredSkills: ["market-research-agent", "marketing-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Visual Differentiation System", description: "Design a visual identity system that looks nothing like the category default; Neumeier's 'just different enough' principle applied to logo, palette and voice.", tool: "internal", outputType: "visual_system", requiredSkills: ["visual-content-creator", "copywriting-pro"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Brand Experience Activation", description: "Deploy the brand across every touchpoint ??digital, physical, verbal ??ensuring consistent charisma signals that close the Strategy-Creativity gap.", tool: "internal", outputType: "brand_experience_plan", requiredSkills: ["content-marketing", "social-media-marketing"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Brand Gap Auditor", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Charisma Researcher", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Visual System Designer", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Brand Experience Lead", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Neumeier Brand Gap Strategy", description: "Source: Marty Neumeier?he Brand Gap: How to Bridge the Distance Between Business Strategy and Design??003, New Riders. Apple, Nike and Harley-Davidson cited as archetypes of closing the Brand Gap between logic and magic.", steps });
    await upsertSquad(conn, { slug, name: "Neumeier Brand Gap Strategy", description: "Marty Neumeier's Brand Gap framework: bridge the gap between business strategy and creative design to build a brand with genuine charisma.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Marty Neumeier ??The Brand Gap (2003)", agents: agentMembers, tags: ["brand", "design", "strategy", "neumeier", "differentiation"], useCases: ["brand identity overhaul", "brand strategy", "visual differentiation"], outputFormats: ["brand_gap_audit", "charisma_map", "visual_system", "brand_experience_plan"], requiredIntegrations: [], token: 56000, showcases: [{ company: "Apple", description: "Neumeier uses Apple as the primary case study for closing the Brand Gap ??Steve Jobs as the bridge between strategy and design", result: "Brand value grew from $0 (near-bankruptcy 1997) to $3T+ market cap; consistently #1 global brand", source: "Neumeier, M. (2003). The Brand Gap. New Riders/Peachpit." }] });
  }

  // I4 繚 Byron Sharp How Brands Grow ??Mental & Physical Availability
  {
    const slug = "brand-sharp-how-brands-grow";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["marketing-strategy-pmm", "mbb-strategist"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "mbb-strategist", "brand-dna"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["paid-ads", "cross-channel-analytics"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["paid-ads", "cross-channel-analytics", "attribution-modeling"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["brand-identity", "visual-content-creator"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["brand-identity", "visual-content-creator"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["marketing-analytics", "market-research-agent"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["marketing-analytics", "market-research-agent"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Category Entry Points Mapping", description: "Identify all Category Entry Points (CEPs) ??the moments, moods and contexts when buyers think to buy from the category; build a CEP priority matrix.", tool: "internal", outputType: "cep_matrix", requiredSkills: ["marketing-strategy-pmm", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Mass Reach Media Planning", description: "Design broad-reach media campaigns targeting all category buyers (not just loyalists); maximise mental availability through consistent exposure across CEPs.", tool: "internal", outputType: "media_plan", requiredSkills: ["paid-ads", "cross-channel-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Distinctive Brand Assets", description: "Audit and strengthen Distinctive Brand Assets (logo, colour, jingle, character) that trigger brand recognition without the brand name being shown.", tool: "internal", outputType: "brand_asset_audit", requiredSkills: ["brand-identity", "visual-content-creator"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Double Jeopardy & Penetration Tracking", description: "Track market penetration and purchase frequency; apply Sharp's Double Jeopardy law to benchmark realistic growth expectations.", tool: "internal", outputType: "penetration_report", requiredSkills: ["marketing-analytics", "market-research-agent"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Brand Growth Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Mass Reach Media Lead", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Brand Asset Designer", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Penetration Analyst", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Sharp How Brands Grow Strategy", description: "Source: Byron Sharp?ow Brands Grow: What Marketers Don't Know??010, Oxford University Press. Ehrenberg-Bass Institute research used by Coca-Cola, P&G, Mars and Unilever to reorient media strategy toward mass reach over loyalty programmes.", steps });
    await upsertSquad(conn, { slug, name: "Sharp How Brands Grow Strategy", description: "Byron Sharp's evidence-based brand growth: maximise mental availability through CEP coverage, Distinctive Brand Assets and mass reach over niche loyalty.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Byron Sharp ??How Brands Grow (2010)", agents: agentMembers, tags: ["brand", "growth", "mental-availability", "sharp", "penetration"], useCases: ["brand growth strategy", "media planning", "brand asset audit"], outputFormats: ["cep_matrix", "media_plan", "brand_asset_audit", "penetration_report"], requiredIntegrations: [], token: 58000, showcases: [{ company: "Coca-Cola", description: "Applied Sharp's CEP framework to ensure mental availability at every drinking occasion moment", result: "Maintained #1 global soft drink brand status; 1.9B servings per day across 200+ countries", source: "Sharp, B. (2010). How Brands Grow. Oxford University Press." }] });
  }

  // I5 繚 Al Ries & Jack Trout 22 Immutable Laws of Marketing
  {
    const slug = "brand-ries-trout-22laws";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["brand-dna", "mbb-strategist"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "mbb-strategist", "marketing-strategy-pmm"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "marketing-analytics"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["copywriting-pro", "content-marketing"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["copywriting-pro", "content-marketing", "hook-copywriter"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Law of Leadership / Category Audit", description: "Apply the Law of Leadership: identify if the brand can be first in a new category; if not, Law of the Category ??create a category where you can be first.", tool: "internal", outputType: "category_strategy", requiredSkills: ["brand-dna", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Mind-Ownership Research", description: "Map what word the brand currently owns in the customer's mind; identify any single word it could realistically own via Law of the Word.", tool: "internal", outputType: "mind_ownership_map", requiredSkills: ["market-research-agent", "marketing-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Focused Messaging Execution", description: "Apply the Law of Focus: write all brand messaging around the single word the brand owns; ruthlessly eliminate off-message content.", tool: "internal", outputType: "focused_message_set", requiredSkills: ["copywriting-pro", "content-marketing"] }, m3Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Category Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Mind Researcher", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Focused Messaging Writer", order: 3 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Ries & Trout 22 Laws Brand Sprint", description: "Source: Al Ries & Jack Trout?he 22 Immutable Laws of Marketing??993, HarperBusiness. Volvo = safety (Law of the Word). Red Bull created the energy drink category (Law of the Category). Avis 'We're #2' campaign (Law of the Ladder) ??sales doubled in 1 year.", steps });
    await upsertSquad(conn, { slug, name: "Ries & Trout 22 Laws Brand Sprint", description: "Apply Al Ries and Jack Trout's most powerful marketing laws: category creation, mental word ownership and focused messaging.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Al Ries & Jack Trout ??22 Immutable Laws of Marketing (1993)", agents: agentMembers, tags: ["brand", "positioning", "category-design", "ries", "trout", "law"], useCases: ["brand positioning", "category creation", "brand focus sprint"], outputFormats: ["category_strategy", "mind_ownership_map", "focused_message_set"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Volvo", description: "Applied Law of the Word ??owned 'safety' in the car buyer's mind for 30+ years", result: "Premium price commanded 20??0% above segment average; 'safety' word association near 100% in consumer surveys", source: "Ries, A. & Trout, J. (1993). The 22 Immutable Laws of Marketing. HarperBusiness." }] });
  }

  // I6 繚 Geoffrey Moore Crossing the Chasm ??Technology Brand Launch
  {
    const slug = "brand-moore-chasm";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["mbb-strategist", "marketing-strategy-pmm"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["mbb-strategist", "marketing-strategy-pmm", "brand-dna"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "marketing-analytics"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["copywriting-pro", "content-marketing"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["copywriting-pro", "content-marketing", "hook-copywriter"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["paid-ads", "email-marketing"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["paid-ads", "email-marketing"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const m5Id = await findAgent(conn, ["brand-identity", "social-media-marketing"], usedIds);
    if (m5Id) { usedIds.push(m5Id); await assignSkillsToAgent(conn, m5Id, ["brand-identity", "social-media-marketing"]); }
    const m5Info = await getAgentInfo(conn, m5Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Beachhead Segment Selection", description: "Apply Moore's D-Day invasion analogy: identify one specific, underserved target segment ('beachhead') where the product can dominate before crossing to the mainstream.", tool: "internal", outputType: "beachhead_strategy", requiredSkills: ["mbb-strategist", "marketing-strategy-pmm"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Whole Product Design", description: "Map the 'Whole Product' ??all components (integrations, support, services) needed for the beachhead customer to achieve 100% of their goal ??no gaps.", tool: "internal", outputType: "whole_product_map", requiredSkills: ["market-research-agent", "marketing-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Pragmatist-Targeted Messaging", description: "Write messaging for mainstream pragmatist buyers: proven ROI, references from similar companies, risk reduction ??NOT features or innovator excitement.", tool: "internal", outputType: "pragmatist_messaging", requiredSkills: ["copywriting-pro", "content-marketing"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Beachhead Market Domination Campaign", description: "Execute targeted campaigns to win the beachhead segment completely; use paid, email and PR to become the 'obvious choice' in the niche.", tool: "internal", outputType: "domination_campaign", requiredSkills: ["paid-ads", "email-marketing"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Mainstream Crossing Activation", description: "Once beachhead references are established, activate mainstream expansion: cross-selling to adjacent verticals using beachhead case studies as proof.", tool: "internal", outputType: "expansion_plan", requiredSkills: ["brand-identity", "social-media-marketing"] }, m5Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Chasm Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Whole Product Designer", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Pragmatist Messaging Writer", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Beachhead Campaign Lead", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "Mainstream Expansion Lead", order: 5 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Moore Crossing the Chasm Brand Launch", description: "Source: Geoffrey Moore?rossing the Chasm: Marketing and Selling Disruptive Products to Mainstream Customers??991/2014, HarperBusiness. Salesforce, Documentum and PTC all cited as companies that successfully crossed using Moore's beachhead strategy.", steps });
    await upsertSquad(conn, { slug, name: "Moore Crossing the Chasm Brand Launch", description: "Geoffrey Moore's chasm-crossing strategy: pick a beachhead niche, build the Whole Product, speak to pragmatist buyers and expand to the mainstream.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Geoffrey Moore ??Crossing the Chasm (1991, rev. 2014)", agents: agentMembers, tags: ["brand", "gtm", "b2b", "moore", "chasm", "technology"], useCases: ["tech product launch", "B2B market penetration", "crossing the mainstream"], outputFormats: ["beachhead_strategy", "whole_product_map", "pragmatist_messaging", "domination_campaign", "expansion_plan"], requiredIntegrations: [], token: 62000, showcases: [{ company: "Salesforce", description: "Applied beachhead approach ??targeted small sales teams in CRM before expanding to enterprise", result: "IPO at $110M revenue (2004); grew to $26B+ ARR by 2023 through staged chasm-crossing", source: "Moore, G.A. (2014). Crossing the Chasm (3rd ed.). HarperBusiness." }] });
  }

  // I7 繚 Simon Sinek Start With Why ??Golden Circle
  {
    const slug = "brand-sinek-start-with-why";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["brand-dna", "mbb-strategist"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "mbb-strategist", "marketing-strategy-pmm"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["copywriting-pro", "hook-copywriter", "content-marketing"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["social-media-marketing", "brand-identity"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-media-marketing", "brand-identity", "visual-content-creator"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "WHY Discovery Workshop", description: "Facilitate Sinek's Golden Circle discovery: articulate the brand's core belief (WHY), then define HOW (differentiating principles) and WHAT (products/services).", tool: "internal", outputType: "golden_circle_doc", requiredSkills: ["brand-dna", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "WHY-Led Messaging Architecture", description: "Rewrite all key brand messages to start from WHY ??belief statements, mission copy, about pages, taglines ??never lead with features.", tool: "internal", outputType: "why_messaging", requiredSkills: ["copywriting-pro", "hook-copywriter"] }, m2Info),
      assignAgentToStep({ order: 3, name: "WHY Brand Activation", description: "Deploy WHY-led storytelling across social, visual identity and employee communications to attract believers who become loyal advocates.", tool: "internal", outputType: "brand_activation", requiredSkills: ["social-media-marketing", "brand-identity"] }, m3Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "WHY Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "WHY Messaging Writer", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Brand Activator", order: 3 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Sinek Start With Why Golden Circle", description: "Source: Simon Sinek?tart With Why: How Great Leaders Inspire Everyone to Take Action??009, Portfolio/Penguin. TED Talk: 60M+ views, #3 most-watched TED of all time. Apple, Southwest Airlines and Martin Luther King used WHY-first communication per Sinek's analysis.", steps });
    await upsertSquad(conn, { slug, name: "Sinek Start With Why Golden Circle", description: "Simon Sinek's Golden Circle: always communicate from WHY inward ??belief first, then HOW, then WHAT ??to inspire rather than persuade.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Simon Sinek ??Start With Why (2009)", agents: agentMembers, tags: ["brand", "purpose", "why", "sinek", "golden-circle"], useCases: ["brand purpose definition", "mission/vision copy", "culture-led marketing"], outputFormats: ["golden_circle_doc", "why_messaging", "brand_activation"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Apple", description: "Sinek's primary Golden Circle case study ??Apple communicates WHY (challenge the status quo) before WHAT (computers)", result: "Highest brand loyalty scores in technology; $3T+ market cap; customers queue overnight for product launches", source: "Sinek, S. (2009). Start With Why. Portfolio/Penguin." }] });
  }

  // I8 繚 Seth Godin Purple Cow ??Remarkable Brand
  {
    const slug = "brand-godin-purple-cow";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["brand-dna", "mbb-strategist"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "mbb-strategist", "marketing-strategy-pmm"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "marketing-analytics"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "brand-identity"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["kol-brief", "social-media-marketing"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["kol-brief", "social-media-marketing", "content-marketing"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Remarkability Audit", description: "Score the product/brand on Godin's 'sneezeworthiness' criteria: is it truly remarkable? Would someone specifically seek it out and tell a friend? Map what must change.", tool: "internal", outputType: "remarkability_audit", requiredSkills: ["brand-dna", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Otaku Segment Identification", description: "Find the 'otaku' ??the obsessives who care deeply about this product category; design the Purple Cow specifically for them, not the mass market.", tool: "internal", outputType: "otaku_segment_profile", requiredSkills: ["market-research-agent", "marketing-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Remarkable Visual Identity", description: "Build a visual identity and packaging/presentation that is impossible to ignore or forget ??the cow is literally purple; design for shelf/scroll standout.", tool: "internal", outputType: "remarkable_identity", requiredSkills: ["visual-content-creator", "brand-identity"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Sneezers Activation", description: "Identify and brief 'sneezers' (early adopters who love spreading ideas) to organically amplify the remarkable product ??no mass advertising needed.", tool: "internal", outputType: "sneezers_plan", requiredSkills: ["kol-brief", "social-media-marketing"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Remarkability Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Otaku Researcher", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Visual Remarkability Lead", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Sneezer Activator", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Godin Purple Cow Remarkable Brand", description: "Source: Seth Godin?urple Cow: Transform Your Business by Being Remarkable??003, Portfolio/Penguin. Starbucks, JetBlue and Krispy Kreme cited as Purple Cows. Hot Topic went from $10M to $430M by serving a remarkable niche.", steps });
    await upsertSquad(conn, { slug, name: "Godin Purple Cow Remarkable Brand", description: "Seth Godin's Purple Cow: design something genuinely remarkable for the passionate 'otaku' niche, then let sneezers spread it without mass advertising.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Seth Godin ??Purple Cow (2003)", agents: agentMembers, tags: ["brand", "remarkable", "niche", "godin", "purple-cow", "word-of-mouth"], useCases: ["product design for virality", "niche brand building", "sneezer activation"], outputFormats: ["remarkability_audit", "otaku_segment_profile", "remarkable_identity", "sneezers_plan"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Krispy Kreme", description: "Godin's Purple Cow example ??the experience of watching doughnuts being made was the remarkable product; customers queued and brought friends", result: "Expanded from regional to national without traditional advertising; cult brand status with organic word-of-mouth", source: "Godin, S. (2003). Purple Cow. Portfolio/Penguin." }] });
  }

  // I9 繚 Dave Gerhardt Brand Blueprint ??Modern B2B Brand
  {
    const slug = "brand-gerhardt-blueprint";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["brand-dna", "marketing-strategy-pmm"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "marketing-strategy-pmm", "mbb-strategist"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["content-marketing", "copywriting-pro"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "copywriting-pro", "hook-copywriter"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["social-media-marketing", "short-video-scriptwriter"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-media-marketing", "short-video-scriptwriter"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["email-marketing", "marketing-analytics"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["email-marketing", "marketing-analytics"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const m5Id = await findAgent(conn, ["kol-brief", "brand-identity"], usedIds);
    if (m5Id) { usedIds.push(m5Id); await assignSkillsToAgent(conn, m5Id, ["kol-brief", "brand-identity", "social-media-marketing"]); }
    const m5Info = await getAgentInfo(conn, m5Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Brand Narrative Foundation", description: "Define Gerhardt's brand narrative pillars: company story, founder story, product story and customer story ??all aligned to a single brand voice.", tool: "internal", outputType: "brand_narrative", requiredSkills: ["brand-dna", "marketing-strategy-pmm"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Owned Media Engine", description: "Build a newsletter, podcast or blog that owns an audience; Gerhardt's principle: the company should become a media company that happens to sell a product.", tool: "internal", outputType: "media_engine_plan", requiredSkills: ["content-marketing", "copywriting-pro"] }, m2Info),
      assignAgentToStep({ order: 3, name: "LinkedIn & Social Brand Voice", description: "Establish a consistent, opinionated social media presence ??Gerhardt's approach: one bold take per day, written in the founder/brand's authentic voice.", tool: "internal", outputType: "social_voice_guide", requiredSkills: ["social-media-marketing", "short-video-scriptwriter"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Community Email Loop", description: "Convert social followers into email subscribers; build a community email strategy that rewards subscribers with exclusive content and access.", tool: "internal", outputType: "community_email", requiredSkills: ["email-marketing", "marketing-analytics"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Brand Ambassador Programme", description: "Identify and empower internal and external brand ambassadors ??employees, customers, partners ??who amplify the brand narrative authentically.", tool: "internal", outputType: "ambassador_programme", requiredSkills: ["kol-brief", "brand-identity"] }, m5Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Brand Narrative Lead", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Media Engine Builder", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Social Voice Lead", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Community Email Lead", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "Ambassador Programme Lead", order: 5 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Gerhardt Modern B2B Brand Blueprint", description: "Source: Dave Gerhardt (DGMG) ??former VP Marketing at Drift, Privy; founder of DGMG community with 10,000+ B2B marketers. Drift grew ARR from $0 to $100M+ using Gerhardt's brand-first, content-media approach.", steps });
    await upsertSquad(conn, { slug, name: "Gerhardt Modern B2B Brand Blueprint", description: "Dave Gerhardt's B2B brand playbook: build an owned media engine, establish an opinionated social voice and convert community into pipeline.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Dave Gerhardt ??DGMG Brand Blueprint (2020s)", agents: agentMembers, tags: ["brand", "b2b", "content", "media", "gerhardt", "dgmg"], useCases: ["B2B brand building", "founder brand", "content-led growth"], outputFormats: ["brand_narrative", "media_engine_plan", "social_voice_guide", "community_email", "ambassador_programme"], requiredIntegrations: [], token: 62000, showcases: [{ company: "Drift", description: "Dave Gerhardt built Drift's brand through podcast, blog and opinionated social content as VP Marketing", result: "ARR grew from $0 to $100M+; acquired by Salesloft for $179M in 2023", source: "Gerhardt, D. (2022). DGMG Community & Marketing Playbook." }] });
  }

  // I10 繚 Mark Ritson Brand Management ??Rigorous Brand Strategy
  {
    const slug = "brand-ritson-management";
    const taskType = slug;
    const usedIds: number[] = [];
    const leadId = await findAgent(conn, ["mbb-strategist", "marketing-strategy-pmm"], usedIds);
    if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["mbb-strategist", "marketing-strategy-pmm", "brand-dna"]); }
    const leadInfo = await getAgentInfo(conn, leadId);
    const m2Id = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
    if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "marketing-analytics", "attribution-modeling"]); }
    const m2Info = await getAgentInfo(conn, m2Id);
    const m3Id = await findAgent(conn, ["brand-identity", "visual-content-creator"], usedIds);
    if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["brand-identity", "visual-content-creator", "copywriting-pro"]); }
    const m3Info = await getAgentInfo(conn, m3Id);
    const m4Id = await findAgent(conn, ["paid-ads", "cross-channel-analytics"], usedIds);
    if (m4Id) { usedIds.push(m4Id); await assignSkillsToAgent(conn, m4Id, ["paid-ads", "cross-channel-analytics", "remarketing-strategy"]); }
    const m4Info = await getAgentInfo(conn, m4Id);
    const m5Id = await findAgent(conn, ["content-marketing", "social-scheduler"], usedIds);
    if (m5Id) { usedIds.push(m5Id); await assignSkillsToAgent(conn, m5Id, ["content-marketing", "social-scheduler"]); }
    const m5Info = await getAgentInfo(conn, m5Id);
    const steps = [
      assignAgentToStep({ order: 1, name: "Brand Diagnosis (Insight-First)", description: "Apply Ritson's Phase 1: deep market orientation ??customer segmentation, brand health tracking, competitive mapping ??before any creative decisions.", tool: "internal", outputType: "brand_diagnosis", requiredSkills: ["mbb-strategist", "marketing-strategy-pmm"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Target & Objectives Setting", description: "Set brand objectives with Ritson's 3-level framework: corporate objectives ??marketing objectives ??comms objectives; define trackable KPIs for each level.", tool: "internal", outputType: "brand_objectives", requiredSkills: ["market-research-agent", "marketing-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Brand Positioning & Identity", description: "Develop brand positioning (for whom, against whom, what benefit, why believe) and translate into visual and verbal identity system.", tool: "internal", outputType: "brand_positioning_identity", requiredSkills: ["brand-identity", "visual-content-creator"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Long & Short Balanced Media", description: "Apply Binet & Field / Ritson's 60:40 principle ??60% long-term brand building, 40% short-term activation ??across paid media budget allocation.", tool: "internal", outputType: "media_balance_plan", requiredSkills: ["paid-ads", "cross-channel-analytics"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Brand Health Tracking & Iteration", description: "Set up quarterly brand health tracking (awareness, consideration, preference, loyalty); use data to iterate strategy rather than chasing short-term metrics.", tool: "internal", outputType: "brand_health_dashboard", requiredSkills: ["content-marketing", "social-scheduler"] }, m5Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Brand Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Insights & Objectives Lead", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Brand Positioning Lead", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Media Balance Lead", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "Brand Health Tracker", order: 5 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Ritson Rigorous Brand Management", description: "Source: Mark Ritson ??Mini MBA in Marketing (25,000+ graduates); columnist Marketing Week; brand consultant (LVMH, Unilever, PepsiCo). The Mini MBA is the highest-rated online marketing programme in the world per course review aggregators.", steps });
    await upsertSquad(conn, { slug, name: "Ritson Rigorous Brand Management", description: "Mark Ritson's academic-grade brand management: diagnosis ??objectives ??positioning ??balanced media ??brand health tracking ??no shortcuts.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Mark Ritson ??Mini MBA Brand Management (2018?resent)", agents: agentMembers, tags: ["brand", "strategy", "management", "ritson", "rigorous", "long-term"], useCases: ["annual brand planning", "brand health audit", "CMO-level brand strategy"], outputFormats: ["brand_diagnosis", "brand_objectives", "brand_positioning_identity", "media_balance_plan", "brand_health_dashboard"], requiredIntegrations: [], token: 64000, showcases: [{ company: "PepsiCo", description: "Ritson consulted on brand strategy frameworks aligning short-term activation with long-term brand equity building", result: "PepsiCo brands consistently outperform category in brand equity; Lay's, Gatorade and Pepsi maintain top-3 category positions globally", source: "Ritson, M. (2023). Mini MBA in Marketing. Marketing Week Learning." }] });
  }
    console.log("[seed-local] Done. All local squad seeds applied successfully.");

  } catch (err: any) {
    console.error("[seed-local] ERROR:", err.message ?? err);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[seed-local] FATAL:", err.message ?? err);
  process.exit(1);
});
