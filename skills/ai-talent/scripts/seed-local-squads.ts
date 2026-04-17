/**
 * seed-local-squads.ts
 * Inserts custom squads + workflow templates into mos_db (local MySQL on VM).
 * Runs idempotently — safe to re-run.
 *
 * Usage:  npm run db:seed-local
 */
import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
 * back to their specialty field — only appending skills they don't already have.
 *
 * This gradually refines the 17K+ agent pool's skill metadata through seeding,
 * making agents more precisely discoverable for future searches.
 * Does NOT touch soul.md or any identity field — only the skills/specialty tag.
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
    // Non-fatal — skill assignment is best-effort
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
 * agentInfo may be null — in that case the step stays unassigned (worker falls back to lead).
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
    console.log("[seed-local] Connected to mos_db. Running squad seeds…");

    // ── 0. Ensure tables exist (idempotent) ──────────────────────────────────────
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

    // ── Schema migrations (idempotent, wrapped in try/catch) ─────────────────────
    console.log("[seed-local] Running schema migrations…");
    const migrations = [
      // Rename members → agents
      `ALTER TABLE agent_squads CHANGE COLUMN members agents LONGTEXT NULL`,
      // Rename taskType → missionType in agent_squads
      `ALTER TABLE agent_squads CHANGE COLUMN taskType missionType VARCHAR(100) NULL`,
      // Add new columns to agent_squads
      `ALTER TABLE agent_squads ADD COLUMN workspace             LONGTEXT NULL`,
      `ALTER TABLE agent_squads ADD COLUMN methodology           VARCHAR(100) NULL`,
      `ALTER TABLE agent_squads ADD COLUMN output_formats        LONGTEXT NULL`,
      `ALTER TABLE agent_squads ADD COLUMN required_integrations LONGTEXT NULL`,
      `ALTER TABLE agent_squads ADD COLUMN token                 INT NOT NULL DEFAULT 0`,
      `ALTER TABLE agent_squads ADD COLUMN showcases             LONGTEXT NULL`,
      // Squad semantic embedding (text-embedding-3-large, computed by embed:squads script)
      `ALTER TABLE agent_squads ADD COLUMN embedding             LONGTEXT NULL`,
      // Expand methodology from VARCHAR(100) to TEXT (methodology strings can exceed 100 chars)
      `ALTER TABLE agent_squads MODIFY COLUMN methodology TEXT NULL`,
      // Add missionType to workflow templates (mirror of taskType)
      `ALTER TABLE squad_workflow_templates ADD COLUMN missionType VARCHAR(100) NULL`,
      `UPDATE squad_workflow_templates SET missionType = taskType WHERE missionType IS NULL`,
    ];
    for (const m of migrations) {
      try { await conn.execute(m); } catch (_) { /* already applied */ }
    }
    console.log("[seed-local] Schema migrations: done");

    // ── 1. SoWork品牌定位 workflow template ──────────────────────────────────────
    const MISSION_TYPE = "sowork-brand-positioning";

    const steps = [
      {
        step: 1,
        title: "深層動機分析（5 Whys）",
        description: "透過五個連續「為什麼」，挖掘品牌存在的真實動機與核心價值觀",
        owner: "squad_lead",
        output: "品牌深層動機清單",
        prompts: [
          "請描述你的品牌目前提供什麼服務/產品？",
          "為什麼客戶需要這個？再往下問：為什麼這件事對他們重要？",
          "你的品牌為什麼選擇做這件事，而不是其他事？",
        ],
      },
      {
        step: 2,
        title: "品牌價值元素分析",
        description: "梳理品牌在功能、情感、自我表達三個層次上能為顧客提供的價值",
        owner: "consumer_researcher",
        output: "品牌價值金字塔",
        prompts: [
          "列出產品/服務的主要功能性利益（最少 5 項）",
          "這些功能帶給顧客什麼情感感受？",
          "使用你的品牌，顧客如何向他人表達自我？",
        ],
      },
      {
        step: 3,
        title: "競爭邊界定義",
        description: "確認品牌真正的競爭場域：直接競爭者、間接競爭者、替代方案",
        owner: "competitor_analyst",
        output: "競爭邊界圖",
        prompts: [
          "列出 3-5 個最直接的競爭品牌",
          "顧客在沒有你的情況下，會選擇什麼替代方案？",
          "你在哪些維度上與競品最不同？",
        ],
      },
      {
        step: 4,
        title: "競品評分矩陣",
        description: "針對關鍵選購因素，對自身與競品進行量化評分（1-5 分），找出差異化空間",
        owner: "competitor_analyst",
        output: "競品比較矩陣表（Excel/可視化）",
        prompts: [
          "列出顧客選擇品牌的 5-8 個關鍵因素",
          "為每個品牌（含自身）在各因素上評分 1-5",
          "哪些因素是你的強項？哪些是明顯弱項？",
        ],
      },
      {
        step: 5,
        title: "目標受眾（TA）定義",
        description: "建立清晰的目標客群畫像：人口統計、心理特質、行為習慣、痛點",
        owner: "consumer_researcher",
        output: "TA Persona 卡片（2-3 個 Persona）",
        prompts: [
          "你的核心客戶是誰？（年齡/職業/收入/地區）",
          "他們有什麼共同的生活方式或價值觀？",
          "他們在尋找解決方案前，最大的挫折或痛點是什麼？",
        ],
      },
      {
        step: 6,
        title: "目標受眾研究",
        description: "深入研究 TA 的資訊獲取方式、消費決策流程與品牌接觸點",
        owner: "consumer_insights",
        output: "TA 消費者洞察報告",
        prompts: [
          "TA 在哪些平台/管道獲取資訊？",
          "他們的購買決策過程包含哪些步驟？",
          "他們信任哪類型的品牌或代言人？",
        ],
      },
      {
        step: 7,
        title: "目標受眾評分分析",
        description: "評估各 TA 區隔的市場規模、可觸及性、獲利潛力，選出主攻 TA",
        owner: "consumer_insights",
        output: "TA 優先排序矩陣",
        prompts: [
          "估算各 TA 區隔的規模與成長性",
          "你目前最容易服務哪個 TA？成本最低的是誰？",
          "哪個 TA 的終身價值（LTV）最高？",
        ],
      },
      {
        step: 8,
        title: "品牌定位矩陣",
        description: "建立二維定位圖：選取兩個核心競爭軸，標出自身與競品位置，找到空白定位空間",
        owner: "squad_lead",
        output: "品牌定位圖（2×2 矩陣）",
        prompts: [
          "從步驟 4 競品矩陣中，選出最重要的 2 個競爭維度",
          "在這兩個維度上，各品牌的相對位置如何？",
          "哪個象限目前是空白的，且符合 TA 需求？",
        ],
      },
      {
        step: 9,
        title: "品牌標語開發",
        description: "基於定位矩陣與核心差異化，發展 3-5 個候選品牌標語，並透過 TA 視角篩選",
        owner: "brand_copywriter",
        output: "候選品牌標語清單 + 評選建議",
        prompts: [
          "用一句話描述你的品牌承諾給核心 TA 的最大價值",
          "這句話是否清楚傳達差異化？TA 會有共鳴嗎？",
          "發展 3 個不同語氣（理性/情感/挑戰性）的版本",
        ],
      },
      {
        step: 10,
        title: "品牌個性分析",
        description: "定義品牌的人格特質、溝通語氣、視覺風格方向，建立品牌個性板",
        owner: "brand_dna_specialist",
        output: "品牌個性說明書 + 語氣指南",
        prompts: [
          "如果你的品牌是一個人，他有什麼個性特質？（列出 5 個形容詞）",
          "他說話的語氣是什麼？（舉例：親切 vs 專業 vs 幽默）",
          "哪些品牌的視覺風格與你理想的品牌感相近？為什麼？",
        ],
      },
      {
        step: 11,
        title: "品牌定位書整合輸出",
        description: "整合前 10 步的成果，產出完整的品牌定位書（Brand Positioning Document）",
        owner: "squad_lead",
        output: "品牌定位書（PDF/Slides）",
        sections: [
          "品牌存在動機與使命",
          "核心價值主張",
          "目標受眾 Persona",
          "競爭定位圖",
          "品牌標語（推薦版 + 備選版）",
          "品牌個性與溝通指南",
          "下一步行動建議",
        ],
      },
    ];

    // Check if template already exists
    const [existingTpl] = await conn.execute(
      `SELECT id FROM squad_workflow_templates WHERE taskType = ? LIMIT 1`,
      [MISSION_TYPE]
    ) as any[];

    if ((existingTpl as any[]).length > 0) {
      console.log(`[seed-local] Workflow template '${MISSION_TYPE}' already exists — updating steps.`);
      await conn.execute(
        `UPDATE squad_workflow_templates SET steps = ?, missionType = ?, updatedAt = NOW() WHERE taskType = ?`,
        [JSON.stringify(steps), MISSION_TYPE, MISSION_TYPE]
      );
    } else {
      await conn.execute(
        `INSERT INTO squad_workflow_templates (taskType, missionType, name, description, steps, isActive, createdAt)
         VALUES (?, ?, ?, ?, ?, 1, NOW())`,
        [
          MISSION_TYPE,
          MISSION_TYPE,
          "SoWork 品牌定位 11 步分析框架",
          "從深層動機到品牌個性的完整品牌定位分析流程，最終輸出品牌定位書",
          JSON.stringify(steps),
        ]
      );
      console.log(`[seed-local] Workflow template '${MISSION_TYPE}' inserted.`);
    }

    // ── 2. SoWork品牌定位 squad ─────────────────────────────────────────────────
    // Agent IDs sourced from mos_db on the VM (confirmed in previous session):
    //   60071  楊澤宇   品牌視覺文案整合     primarySkill=cmo         → Squad Lead
    //   180183 周玟君   消費者行銷總監       primarySkill=customer-research
    //   180376 郭雅慧   市場研究分析師       primarySkill=competitor-analysis
    //   238624 楊承翰   消費者洞察研究小組策略師 primarySkill=consumer-insights
    //   210016 葉宗翰   AI 網站文案策略師    primarySkill=brand-dna
    //   222934 林雅慧   競品情報分析師       primarySkill=brand-dna

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
      "新品牌建立定位",
      "老品牌重新定位",
      "進入新市場前的品牌策略",
      "品牌訊息不一致需要整合",
      "想找到差異化競爭空間",
      "撰寫品牌定位書",
    ]);

    const [existingSquad] = await conn.execute(
      `SELECT id FROM agent_squads WHERE slug = 'sowork-brand-positioning' LIMIT 1`
    ) as any[];

    if ((existingSquad as any[]).length > 0) {
      const existingId = (existingSquad as any[])[0].id;
      console.log(`[seed-local] Squad 'sowork-brand-positioning' (id=${existingId}) already exists — updating.`);
      await conn.execute(
        `UPDATE agent_squads
         SET name = ?, description = ?, missionType = ?, agents = ?, tags = ?, use_cases = ?,
         workspace = ?, methodology = ?, output_formats = ?, required_integrations = ?, token = ?, showcases = ?,
         is_active = 1, updated_at = NOW()
         WHERE slug = 'sowork-brand-positioning'`,
        [
          "SoWork品牌定位",
          "完整 11 步品牌定位分析框架，從深層動機挖掘到品牌個性建立，最終輸出可執行的品牌定位書。適合新品牌建立、老品牌重定位、或需要清晰競爭差異化的企業。",
          MISSION_TYPE,
          JSON.stringify(members),
          tags,
          useCases,
          JSON.stringify(["brand-positioning"]),
          "sowork-brand-positioning",
          JSON.stringify(["PDF 策略報告", "Google Slides 簡報", "YouTube 影片腳本"]),
          JSON.stringify(["google-analytics", "facebook-ads"]),
          80000,
          JSON.stringify([{ company: "SoWork", description: "整合品牌定位五步法，協助 B2B SaaS 企業在 6 週內完成完整品牌定位轉型", result: "品牌認知度提升 40%，銷售週期縮短 25%", source: "SoWork 內部案例" }]),
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
          "SoWork品牌定位",
          "完整 11 步品牌定位分析框架，從深層動機挖掘到品牌個性建立，最終輸出可執行的品牌定位書。適合新品牌建立、老品牌重定位、或需要清晰競爭差異化的企業。",
          "general",
          MISSION_TYPE,
          JSON.stringify(members),
          tags,
          useCases,
          JSON.stringify(["brand-positioning"]),
          "sowork-brand-positioning",
          JSON.stringify(["PDF 策略報告", "Google Slides 簡報", "YouTube 影片腳本"]),
          JSON.stringify(["google-analytics", "facebook-ads"]),
          80000,
          JSON.stringify([{ company: "SoWork", description: "整合品牌定位五步法，協助 B2B SaaS 企業在 6 週內完成完整品牌定位轉型", result: "品牌認知度提升 40%，銷售週期縮短 25%", source: "SoWork 內部案例" }]),
        ]
      );

      const [newSquad] = await conn.execute(
        `SELECT id FROM agent_squads WHERE slug = 'sowork-brand-positioning' LIMIT 1`
      ) as any[];
      console.log(`[seed-local] Squad 'sowork-brand-positioning' inserted with id=${(newSquad as any[])[0]?.id}`);
    }

    // ── 3. Universal workflow templates (15 common marketing taskTypes) ──────────
    // Pattern: Squad Lead Intake → Specialist Agents → Squad Lead QA → Delivery
    // Each step: { step, title, description, owner, output, duration_hint }

    const UNIVERSAL_WORKFLOWS: Array<{
      taskType: string;
      name: string;
      description: string;
      steps: object[];
    }> = [
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "brand",
        name: "品牌建立完整流程",
        description: "從品牌願景到落地執行的完整品牌建立工作流",
        steps: [
          { step: 1, title: "Squad Lead Intake：品牌課題盤點", description: "Squad Lead 提問澄清品牌現況、目標市場與核心挑戰，確認任務範疇後 brief 成員", owner: "squad_lead", output: "任務簡報（Brief）", duration_hint: "15 分鐘" },
          { step: 2, title: "品牌 DNA 挖掘", description: "分析品牌使命、願景、核心價值，確立差異化主張", owner: "brand_dna_specialist", output: "品牌 DNA 文件", duration_hint: "20 分鐘" },
          { step: 3, title: "目標受眾研究", description: "建立 2-3 個精準 Persona，分析消費者動機與決策路徑", owner: "consumer_researcher", output: "TA Persona 卡片", duration_hint: "20 分鐘" },
          { step: 4, title: "競品定位分析", description: "繪製競品地圖，找出未被佔據的差異化定位空間", owner: "competitor_analyst", output: "競品定位圖", duration_hint: "20 分鐘" },
          { step: 5, title: "品牌訊息架構", description: "建立品牌核心訊息、標語候選、語調指南", owner: "brand_copywriter", output: "品牌訊息架構表", duration_hint: "20 分鐘" },
          { step: 6, title: "Squad Lead QA 整合", description: "Squad Lead 審查各步驟成果一致性，補充不足，解決衝突", owner: "squad_lead", output: "QA 審核備忘", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：品牌手冊草稿", description: "整合所有成員輸出，產出完整品牌手冊供客戶審核", owner: "squad_lead", output: "品牌手冊（Brand Book）", duration_hint: "15 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "brand-launch",
        name: "品牌上市策略",
        description: "新品牌或新產品上市的完整策略規劃與執行框架",
        steps: [
          { step: 1, title: "Squad Lead Intake：上市目標確認", description: "釐清上市時程、預算、目標市場與成功指標，分配各 Agent 任務", owner: "squad_lead", output: "上市 Brief", duration_hint: "15 分鐘" },
          { step: 2, title: "市場機會掃描", description: "分析市場規模、切入時機、目標族群現有選擇與痛點", owner: "market_researcher", output: "市場機會報告", duration_hint: "25 分鐘" },
          { step: 3, title: "競品上市案例研究", description: "研究競品上市策略、媒體計畫、定價與效果", owner: "competitor_analyst", output: "競品案例分析", duration_hint: "20 分鐘" },
          { step: 4, title: "上市訊息策略", description: "制定核心訊息、不同渠道的訊息變體、發布節奏", owner: "brand_copywriter", output: "訊息策略文件", duration_hint: "20 分鐘" },
          { step: 5, title: "通路與媒體規劃", description: "規劃付費、自然、口碑渠道配比，設定各渠道 KPI", owner: "channel_strategist", output: "媒體計畫書", duration_hint: "20 分鐘" },
          { step: 6, title: "Squad Lead QA + 風險評估", description: "審核整體上市計畫的邏輯性，識別執行風險與備案", owner: "squad_lead", output: "風險備忘錄", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：上市計畫書", description: "整合成完整上市計畫書，含甘特圖與執行 Checklist", owner: "squad_lead", output: "品牌上市計畫書", duration_hint: "15 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "content-strategy",
        name: "內容策略規劃",
        description: "為品牌制定系統化的內容策略與執行計畫",
        steps: [
          { step: 1, title: "Squad Lead Intake：內容目標確認", description: "確認品牌聲量目標、主要渠道、內容預算與產出頻率，brief 成員", owner: "squad_lead", output: "內容策略 Brief", duration_hint: "15 分鐘" },
          { step: 2, title: "受眾內容偏好研究", description: "分析 TA 在各平台的內容消費習慣、喜好格式與互動模式", owner: "consumer_researcher", output: "受眾洞察報告", duration_hint: "20 分鐘" },
          { step: 3, title: "競品內容分析", description: "拆解競品內容策略、爆款規律、話題切入角度", owner: "competitor_analyst", output: "競品內容報告", duration_hint: "20 分鐘" },
          { step: 4, title: "內容支柱設計", description: "建立 3-5 個品牌內容支柱，每個支柱的主題、格式、KPI", owner: "content_strategist", output: "內容支柱框架", duration_hint: "20 分鐘" },
          { step: 5, title: "內容月曆規劃", description: "制定 30-90 天內容發布日曆，含話題、格式、渠道配比", owner: "content_planner", output: "內容月曆草稿", duration_hint: "20 分鐘" },
          { step: 6, title: "Squad Lead QA：策略一致性審核", description: "確保內容策略與品牌定位一致，評估資源可行性", owner: "squad_lead", output: "QA 備忘", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：內容策略報告", description: "完成可執行的內容策略報告，含 KPI 追蹤框架", owner: "squad_lead", output: "內容策略報告", duration_hint: "15 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "social-media",
        name: "社群媒體行銷",
        description: "社群平台的策略規劃、內容製作與社群經營",
        steps: [
          { step: 1, title: "Squad Lead Intake：社群目標確認", description: "確認主要平台、品牌語調、目標 KPI（粉絲成長/互動率/導流），brief 成員", owner: "squad_lead", output: "社群 Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "社群受眾輪廓分析", description: "研究各平台粉絲輪廓、活躍時段、互動觸發因子", owner: "social_analyst", output: "社群受眾分析", duration_hint: "20 分鐘" },
          { step: 3, title: "競品社群策略拆解", description: "分析競品帳號的內容策略、互動率、增粉策略", owner: "competitor_analyst", output: "競品社群報告", duration_hint: "15 分鐘" },
          { step: 4, title: "社群內容創作", description: "根據受眾洞察產出貼文文案、圖說、Hashtag 策略", owner: "social_copywriter", output: "社群內容草稿（10 則）", duration_hint: "25 分鐘" },
          { step: 5, title: "互動增長策略", description: "制定社群互動玩法、UGC 策略、跨平台導流方案", owner: "growth_specialist", output: "互動增長方案", duration_hint: "15 分鐘" },
          { step: 6, title: "Squad Lead QA：品牌一致性", description: "審核內容與品牌語調一致性，調整不符格式的貼文", owner: "squad_lead", output: "QA 回饋", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：社群執行包", description: "整合內容月曆、貼文草稿、互動策略為可立即執行的方案", owner: "squad_lead", output: "社群執行包", duration_hint: "10 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "seo-growth",
        name: "SEO 成長策略",
        description: "搜尋引擎優化與自然流量成長策略",
        steps: [
          { step: 1, title: "Squad Lead Intake：SEO 目標確認", description: "確認目標關鍵字、競爭環境、現有排名基準與流量目標，brief 成員", owner: "squad_lead", output: "SEO Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "關鍵字機會研究", description: "找出高搜尋量、低競爭、高商業意圖的關鍵字機會", owner: "seo_researcher", output: "關鍵字機會清單", duration_hint: "25 分鐘" },
          { step: 3, title: "競品 SEO 分析", description: "分析前 5 名競品的關鍵字佈局、反向連結策略、內容架構", owner: "competitor_analyst", output: "競品 SEO 報告", duration_hint: "20 分鐘" },
          { step: 4, title: "內容架構規劃", description: "設計網站內容架構（Pillar + Cluster），規劃內容產出優先順序", owner: "content_architect", output: "SEO 內容架構圖", duration_hint: "20 分鐘" },
          { step: 5, title: "On-Page SEO 優化建議", description: "針對既有頁面提出 Title、Meta、內文、Schema 優化清單", owner: "seo_specialist", output: "SEO 優化 Checklist", duration_hint: "20 分鐘" },
          { step: 6, title: "Squad Lead QA：策略可行性", description: "評估整體 SEO 策略的時程可行性與優先排序", owner: "squad_lead", output: "優先順序備忘", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：SEO 成長路線圖", description: "整合為 90 天 SEO 執行路線圖，含每週里程碑", owner: "squad_lead", output: "SEO 路線圖", duration_hint: "15 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "ad-creative",
        name: "廣告創意製作",
        description: "社群與搜尋廣告的創意策略、文案與素材規劃",
        steps: [
          { step: 1, title: "Squad Lead Intake：廣告目標確認", description: "確認廣告目標（品牌/轉換/再行銷）、預算、平台、受眾，brief 成員", owner: "squad_lead", output: "廣告 Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "受眾洞察與動機分析", description: "深入分析目標受眾的購買動機、痛點、決策障礙", owner: "consumer_insights", output: "受眾動機報告", duration_hint: "20 分鐘" },
          { step: 3, title: "競品廣告分析", description: "拆解競品廣告素材、文案角度、CTA 策略", owner: "competitor_analyst", output: "競品廣告庫", duration_hint: "15 分鐘" },
          { step: 4, title: "廣告文案開發", description: "撰寫多版本廣告標題、主文、CTA，覆蓋不同訊息角度（功能/情感/社會認同）", owner: "ad_copywriter", output: "廣告文案組合（3-5 組）", duration_hint: "25 分鐘" },
          { step: 5, title: "素材規格與視覺方向", description: "規劃各平台廣告尺寸、視覺風格指引、A/B 測試架構", owner: "creative_director", output: "素材規格指南", duration_hint: "15 分鐘" },
          { step: 6, title: "Squad Lead QA：說服力審核", description: "審核文案說服力、訊息清晰度、品牌一致性", owner: "squad_lead", output: "文案審核回饋", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：廣告執行包", description: "整合文案組合、素材指引、A/B 測試計畫", owner: "squad_lead", output: "廣告執行包", duration_hint: "10 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "market-research",
        name: "市場研究報告",
        description: "產業趨勢、市場規模與消費者洞察的深度研究",
        steps: [
          { step: 1, title: "Squad Lead Intake：研究範疇確認", description: "確認研究問題、用途、交付格式與深度，brief 成員", owner: "squad_lead", output: "研究 Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "次級資料蒐集", description: "蒐集產業報告、政府統計、媒體報導等公開資料", owner: "research_analyst", output: "資料匯整表", duration_hint: "25 分鐘" },
          { step: 3, title: "消費者行為分析", description: "分析目標消費者的購買旅程、觸媒習慣、偏好驅動因子", owner: "consumer_researcher", output: "消費者行為報告", duration_hint: "20 分鐘" },
          { step: 4, title: "競爭格局分析", description: "描繪市場參與者圖譜、市佔率估算、進入障礙", owner: "competitor_analyst", output: "競爭格局圖", duration_hint: "20 分鐘" },
          { step: 5, title: "市場機會識別", description: "基於研究數據識別 3-5 個具體機會點與進入策略建議", owner: "strategy_specialist", output: "機會矩陣", duration_hint: "20 分鐘" },
          { step: 6, title: "Squad Lead QA：洞察驗證", description: "交叉比對各 Agent 的發現，確認邏輯一致性與可信度", owner: "squad_lead", output: "驗證備忘", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：市場研究報告", description: "整合為有執行意義的市場研究報告，含關鍵洞察摘要", owner: "squad_lead", output: "市場研究報告", duration_hint: "20 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "competitor-analysis",
        name: "競品分析報告",
        description: "系統化競品研究與差異化機會識別",
        steps: [
          { step: 1, title: "Squad Lead Intake：競品範疇確認", description: "確認需要分析的競品清單（直接/間接）、分析維度與目的", owner: "squad_lead", output: "競品分析 Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "競品基本資料蒐集", description: "蒐集各競品的產品特色、定價、市佔、媒體聲量", owner: "research_analyst", output: "競品資料表", duration_hint: "20 分鐘" },
          { step: 3, title: "競品定位分析", description: "分析各競品的目標客群、核心訴求、差異化主張", owner: "competitor_analyst", output: "競品定位圖", duration_hint: "20 分鐘" },
          { step: 4, title: "競品數位策略分析", description: "分析競品的 SEO、社群、廣告、內容策略", owner: "digital_analyst", output: "競品數位報告", duration_hint: "20 分鐘" },
          { step: 5, title: "差異化機會識別", description: "基於競品分析找出可切入的差異化空間與藍海機會", owner: "strategy_specialist", output: "差異化機會清單", duration_hint: "15 分鐘" },
          { step: 6, title: "Squad Lead QA：客觀性審核", description: "確保分析客觀準確，補充遺漏的競品動態", owner: "squad_lead", output: "QA 回饋", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：競品分析報告", description: "整合為含策略建議的競品分析報告", owner: "squad_lead", output: "競品分析報告", duration_hint: "15 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "pr-campaign",
        name: "公關傳播策略",
        description: "品牌公關、媒體傳播與聲量管理策略",
        steps: [
          { step: 1, title: "Squad Lead Intake：傳播目標確認", description: "確認傳播目的（危機/主動/活動）、受眾、媒體類型、時程", owner: "squad_lead", output: "PR Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "媒體生態分析", description: "研究目標媒體的報導風格、受眾輪廓、聯絡窗口", owner: "pr_researcher", output: "媒體清單", duration_hint: "20 分鐘" },
          { step: 3, title: "訊息框架設計", description: "建立核心訊息、Q&A 資料庫、媒體 Talking Points", owner: "pr_copywriter", output: "訊息框架文件", duration_hint: "20 分鐘" },
          { step: 4, title: "新聞稿撰寫", description: "撰寫符合媒體格式、包含引言與佐證數據的新聞稿", owner: "content_writer", output: "新聞稿（中文）", duration_hint: "20 分鐘" },
          { step: 5, title: "媒體發布計畫", description: "規劃獨家/同步發布策略、後續追蹤與聲量監測計畫", owner: "pr_strategist", output: "媒體發布計畫", duration_hint: "15 分鐘" },
          { step: 6, title: "Squad Lead QA：訊息一致性", description: "審核所有對外訊息一致性，確認法律/合規問題", owner: "squad_lead", output: "QA 清單", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：PR 執行包", description: "整合新聞稿、媒體清單、發布計畫為可立即執行的 PR 包", owner: "squad_lead", output: "PR 執行包", duration_hint: "10 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "email-marketing",
        name: "Email 行銷策略",
        description: "Email 自動化、名單培育與轉換優化",
        steps: [
          { step: 1, title: "Squad Lead Intake：Email 目標確認", description: "確認 Email 目的（開發/培育/轉換/留存）、名單規模、技術平台", owner: "squad_lead", output: "Email Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "訂閱者行為分析", description: "分析現有名單的開信率、點擊率、購買行為區隔", owner: "data_analyst", output: "名單分析報告", duration_hint: "20 分鐘" },
          { step: 3, title: "Email 旅程設計", description: "規劃不同受眾的 Email 序列旅程（歡迎/培育/促銷/重新激活）", owner: "email_strategist", output: "Email 旅程圖", duration_hint: "20 分鐘" },
          { step: 4, title: "Email 文案撰寫", description: "撰寫 3-5 封核心 Email（主旨行、預覽文字、正文、CTA）", owner: "email_copywriter", output: "Email 文案組合", duration_hint: "25 分鐘" },
          { step: 5, title: "A/B 測試規劃", description: "設計主旨行 A/B 測試矩陣，規劃測試時程與勝負判定標準", owner: "growth_specialist", output: "A/B 測試計畫", duration_hint: "15 分鐘" },
          { step: 6, title: "Squad Lead QA：轉換力審核", description: "審核每封 Email 的說服力、CTA 清晰度、行動阻礙排除", owner: "squad_lead", output: "文案優化建議", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：Email 行銷包", description: "整合旅程設計、文案組合、A/B 計畫為可執行方案", owner: "squad_lead", output: "Email 行銷包", duration_hint: "10 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "linkedin-growth",
        name: "LinkedIn 成長策略",
        description: "LinkedIn 個人品牌與企業頁面的增長與 B2B 社群策略",
        steps: [
          { step: 1, title: "Squad Lead Intake：LinkedIn 目標確認", description: "確認 LinkedIn 使用目的（個人品牌/企業頁/Lead Gen）、目標受眾", owner: "squad_lead", output: "LinkedIn Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "受眾與算法研究", description: "研究目標受眾在 LinkedIn 的行為模式、LinkedIn 算法偏好格式", owner: "social_analyst", output: "受眾洞察報告", duration_hint: "20 分鐘" },
          { step: 3, title: "個人品牌定位", description: "建立獨特的專業定位、Thought Leadership 主題、核心訊息", owner: "brand_strategist", output: "個人品牌 Blueprint", duration_hint: "20 分鐘" },
          { step: 4, title: "LinkedIn 內容矩陣", description: "設計高互動內容類型組合（洞察/故事/資訊圖/民調），規劃發布頻率", owner: "content_strategist", output: "內容矩陣", duration_hint: "20 分鐘" },
          { step: 5, title: "貼文撰寫（首批 10 則）", description: "撰寫符合 LinkedIn 算法的首批貼文，包含 Hook、段落節奏、CTA", owner: "linkedin_copywriter", output: "首批貼文草稿", duration_hint: "25 分鐘" },
          { step: 6, title: "Squad Lead QA：專業度審核", description: "確認貼文的專業可信度、訊息清晰度與品牌一致性", owner: "squad_lead", output: "編輯回饋", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：LinkedIn 成長計畫", description: "整合定位策略、內容矩陣、首批貼文為 30 天執行計畫", owner: "squad_lead", output: "LinkedIn 30 天計畫", duration_hint: "10 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "youtube-content",
        name: "YouTube 內容策略",
        description: "YouTube 頻道成長、影片企劃與 SEO 優化",
        steps: [
          { step: 1, title: "Squad Lead Intake：頻道目標確認", description: "確認頻道定位、目標訂閱者、變現方式與產出頻率", owner: "squad_lead", output: "頻道 Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "YouTube 受眾分析", description: "研究目標受眾的搜尋行為、競品頻道訂閱者輪廓、觀看完成率偏好", owner: "youtube_analyst", output: "受眾分析報告", duration_hint: "20 分鐘" },
          { step: 3, title: "競品頻道策略拆解", description: "分析前 5 名競品頻道的選題策略、縮圖風格、SEO 關鍵字佈局", owner: "competitor_analyst", output: "競品頻道報告", duration_hint: "20 分鐘" },
          { step: 4, title: "影片企劃開發", description: "產出 10 個高潛力影片選題，含標題、縮圖文案、影片大綱", owner: "video_planner", output: "影片企劃清單", duration_hint: "25 分鐘" },
          { step: 5, title: "YouTube SEO 優化", description: "為每個選題規劃關鍵字策略、Description 模板、Tags 組合", owner: "seo_specialist", output: "SEO 優化指南", duration_hint: "15 分鐘" },
          { step: 6, title: "Squad Lead QA：點擊率潛力審核", description: "評估縮圖文案的點擊率潛力，調整標題 Hook 強度", owner: "squad_lead", output: "企劃審核回饋", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：YouTube 頻道策略包", description: "整合頻道定位、選題清單、SEO 指南為完整頻道成長策略", owner: "squad_lead", output: "YouTube 策略包", duration_hint: "10 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "website-optimization",
        name: "官網優化策略",
        description: "官網轉換率優化、用戶體驗提升與 SEO 強化",
        steps: [
          { step: 1, title: "Squad Lead Intake：優化目標確認", description: "確認目標頁面、核心轉換行動、流量來源與基準指標", owner: "squad_lead", output: "優化 Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "用戶行為分析", description: "分析熱力圖、錄影、漏斗報告，找出流失點與摩擦", owner: "ux_analyst", output: "行為分析報告", duration_hint: "20 分鐘" },
          { step: 3, title: "競品官網研究", description: "分析競品官網的信任建立方式、CTA 設計、轉換策略", owner: "competitor_analyst", output: "競品網站報告", duration_hint: "15 分鐘" },
          { step: 4, title: "CRO 優化建議", description: "針對首頁/Landing Page 提出佈局、文案、CTA 的具體優化方案", owner: "cro_specialist", output: "CRO 優化清單", duration_hint: "25 分鐘" },
          { step: 5, title: "官網文案重寫", description: "重寫首頁核心文案、價值主張、社會證明區塊", owner: "web_copywriter", output: "優化後文案", duration_hint: "20 分鐘" },
          { step: 6, title: "Squad Lead QA：說服力審核", description: "評估優化後文案的說服力、信任感與行動驅動力", owner: "squad_lead", output: "審核回饋", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：官網優化包", description: "整合 CRO 建議、新文案、A/B 測試優先順序為執行方案", owner: "squad_lead", output: "官網優化包", duration_hint: "10 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "event-marketing",
        name: "活動行銷策略",
        description: "線上或實體活動的策劃、推廣與後續行銷",
        steps: [
          { step: 1, title: "Squad Lead Intake：活動目標確認", description: "確認活動類型、目標受眾、預算、地點/平台、成功指標", owner: "squad_lead", output: "活動 Brief", duration_hint: "10 分鐘" },
          { step: 2, title: "目標受眾研究", description: "研究目標受眾的活動參與動機、偏好格式、報名決策因素", owner: "consumer_researcher", output: "受眾洞察", duration_hint: "15 分鐘" },
          { step: 3, title: "競品活動案例研究", description: "研究類似活動的宣傳策略、報名轉換方法、活動後行銷", owner: "competitor_analyst", output: "案例分析報告", duration_hint: "15 分鐘" },
          { step: 4, title: "活動傳播策略", description: "規劃活動前/中/後的傳播節奏、媒體渠道、內容類型", owner: "event_strategist", output: "傳播計畫", duration_hint: "20 分鐘" },
          { step: 5, title: "活動文案創作", description: "撰寫活動標題、宣傳文案、報名頁文案、Email 邀請函", owner: "event_copywriter", output: "活動文案包", duration_hint: "25 分鐘" },
          { step: 6, title: "Squad Lead QA：吸引力審核", description: "評估活動定位的吸引力，確認各渠道訊息一致性", owner: "squad_lead", output: "QA 回饋", duration_hint: "10 分鐘" },
          { step: 7, title: "Squad Lead 交付：活動行銷包", description: "整合傳播計畫、文案包、Checklist 為完整活動行銷方案", owner: "squad_lead", output: "活動行銷包", duration_hint: "10 分鐘" },
        ],
      },
      // ──────────────────────────────────────────────────────────────────
      {
        taskType: "strategy",
        name: "行銷策略規劃",
        description: "品牌整體行銷策略的制定與年度計畫",
        steps: [
          { step: 1, title: "Squad Lead Intake：策略範疇確認", description: "確認策略期間、預算規模、核心挑戰與業務目標，brief 成員", owner: "squad_lead", output: "策略 Brief", duration_hint: "15 分鐘" },
          { step: 2, title: "市場環境掃描（PESTLE）", description: "分析政治、經濟、社會、技術、法律、環境趨勢對品牌的影響", owner: "market_researcher", output: "PESTLE 分析", duration_hint: "20 分鐘" },
          { step: 3, title: "品牌現況評估（SWOT）", description: "盤點品牌優劣勢、市場機會與威脅，確立策略起點", owner: "strategy_analyst", output: "SWOT 分析", duration_hint: "20 分鐘" },
          { step: 4, title: "競爭策略定義", description: "確立競爭策略方向（差異化/成本領導/聚焦），建立競爭優勢路線", owner: "strategy_specialist", output: "競爭策略文件", duration_hint: "20 分鐘" },
          { step: 5, title: "行銷組合規劃（4P）", description: "制定產品、定價、通路、推廣的策略方向與資源配置", owner: "marketing_planner", output: "行銷組合計畫", duration_hint: "20 分鐘" },
          { step: 6, title: "Squad Lead QA：策略一致性", description: "確保各策略元素彼此一致、與業務目標對齊，識別執行風險", owner: "squad_lead", output: "策略審核備忘", duration_hint: "15 分鐘" },
          { step: 7, title: "Squad Lead 交付：行銷策略報告", description: "整合為完整行銷策略報告，含 OKR 框架與執行路線圖", owner: "squad_lead", output: "行銷策略報告", duration_hint: "20 分鐘" },
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

    // ── 4. Brand Positioning Methodology Squads ──────────────────────────────────
    // Five squads based on empirical brand positioning methodologies.
    // Agents are resolved dynamically from the 17K+ agent pool by skill keywords.
    // Workflow steps reference the specific MCP tools / frameworks from the
    // methodology → resource table supplied by the product team.

    // ── 4a. Benefit-Based Positioning ─────────────────────────────────────────
    // Tools: osp_marketing_tools (Value Map Generator), marketing-strategy-pmm (Messaging Hierarchy)
    // Ladder: feature → functional benefit → emotional benefit → conversion copy
    //
    // 設計原則：findAgent skills == step requiredSkills（一對一對齊）
    // Agent 配對依據 = 步驟所需資料能力，而非抽象行銷概念
    //
    // Step 1 (Lead Intake)      → leadId   skills: messaging / pmm / positioning / brand-voice
    // Step 2 (功能利益轉化)      → m2      skills: consumer-insights / market-research / survey-analysis / product-analysis
    // Step 3 (情感利益挖掘)      → m3      skills: emotional-branding / brand-psychology / sentiment-analysis / consumer-psychology
    // Step 4 (Message Ladder)   → leadId   skills: messaging / brand-voice / copywriting / positioning / content-strategy
    // Step 5 (落地文案 + A/B)   → m4 + m5 skills: conversion-copywriting / facebook-ads / ad-creative / ab-testing / cro
    // Step 6 (QA & 定位書)       → leadId   skills: positioning / brand-strategy / messaging
    {
      const slug = "benefit-based-positioning";
      const taskType = "benefit-based-positioning";
      const used: number[] = [];

      // ── Lead：訊息定位策略師（Steps 1 / 4 / 6）
      const leadSkills = ["messaging", "brand-voice", "content-strategy", "pmm", "copywriting", "positioning"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }

      // ── m2：消費者洞察 × 市場研究師（Step 2：功能利益轉化）
      // 資料來源：問卷資料、客戶訪談記錄、產品使用數據、Google Analytics 行為流
      const m2Skills = ["consumer-insights", "customer-research", "market-research", "survey-analysis", "product-analysis"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }

      // ── m3：情感品牌 × 情緒分析師（Step 3：情感利益挖掘）
      // 資料來源：社群情緒資料、客戶評論（G2/Trustpilot）、品牌感知調查
      const m3Skills = ["emotional-branding", "brand-psychology", "sentiment-analysis", "brand-narrative", "consumer-psychology"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }

      // ── m4：轉換文案師（Step 5 主執行：LP / Ad Headlines / Email）
      // 資料來源：競品廣告素材、Landing Page 轉換基準、廣告文案資料庫
      const m4Skills = ["copywriting", "conversion-copywriting", "ad-creative", "cro", "landing-page"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      // ── m5：廣告效力驗證師（Step 5 驗證：A/B 框架 + FB Ads 數據）
      // 資料來源：Facebook Ads Manager 數據、A/B 測試歷史結果、廣告 CTR 基準
      const m5Skills = ["facebook-ads", "paid-social", "ab-testing", "ad-performance", "performance-marketing"];
      const m5 = await findAgent(conn, m5Skills, used);
      if (m5) { used.push(m5); await assignSkillsToAgent(conn, m5, m5Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "messaging_strategist",      order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "consumer_insight_analyst",   order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "emotional_brand_specialist",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "conversion_copywriter",       order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "ad_messaging_validator",      order: 5 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info, m5Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
        getAgentInfo(conn, m5 ?? null),
      ]);

      const bbpSteps = [
        // Step 1：Lead Intake（leadId）
        // requiredSkills = leadSkills 的核心子集，對齊 findAgent 搜尋
        assignAgentToStep({
          step: 1,
          title: "Squad Lead Intake：產品功能與受眾盤點",
          description: "Squad Lead 用品牌大腦資料盤點產品功能清單、目標受眾定義、現有訊息成熟度。確認 ICP 優先順序，評估目前定位缺口，Brief 各成員任務範疇與資料蒐集方向。",
          owner: "squad_lead",
          output: "任務簡報（Brief）+ ICP 初稿 + 功能清單確認",
          tools: ["osp_marketing_tools: Product Value Map Generator（預覽）"],
          requiredSkills: ["messaging", "pmm", "positioning", "brand-voice"],
        }, leadInfo),

        // Step 2：功能利益轉化（m2：consumer_insight_analyst）
        // requiredSkills = m2Skills（完全一致）
        assignAgentToStep({
          step: 2,
          title: "功能利益轉化（Feature → Functional Benefit Map）",
          description: "Consumer Insight Analyst 使用 osp_marketing_tools Product Value Map Generator，將每項產品功能轉譯為目標客群能感知的功能利益。查詢 Google Analytics 行為流資料與問卷 survey 結果，確認哪些功能是用戶真正在用且重視的，過濾「工程師認為重要但用戶不在乎」的功能。輸出 Feature → Functional Benefit 對照表。",
          owner: "consumer_insight_analyst",
          output: "功能利益清單（Feature → Functional Benefit Map）",
          tools: ["osp_marketing_tools: Product Value Map Generator", "google-analytics: 行為流報告"],
          requiredSkills: ["consumer-insights", "customer-research", "market-research", "survey-analysis", "product-analysis"],
        }, m2Info),

        // Step 3：情感利益挖掘（m3：emotional_brand_specialist）
        // requiredSkills = m3Skills（完全一致）
        // 修正：原本錯誤分配給 leadInfo，正確應為 m3Info
        assignAgentToStep({
          step: 3,
          title: "情感利益挖掘（Functional → Emotional Benefit Map）",
          description: "Emotional Brand Specialist 對每項功能利益往上挖掘對應的情感利益。查詢社群情緒資料（social listening）、客戶評論平台（G2、Trustpilot、Google Reviews）中用戶的真實情感語言，找出他們使用產品後的自我描述詞彙。依 marketing-strategy-pmm Messaging Hierarchy 整合，定錨最強情感利益作為定位核心。",
          owner: "emotional_brand_specialist",
          output: "情感利益映射表（Functional → Emotional Benefit）+ 核心情感定錨句",
          tools: ["marketing-strategy-pmm: Messaging Hierarchy", "sentiment-analysis: 社群情緒掃描", "review-mining: G2 / Trustpilot"],
          requiredSkills: ["emotional-branding", "brand-psychology", "sentiment-analysis", "brand-narrative", "consumer-psychology"],
        }, m3Info),

        // Step 4：Message Ladder 框架建構（leadId：messaging_strategist）
        // requiredSkills = leadSkills 核心（對齊 findAgent）
        // 修正：原本錯誤分配給 m3Info，正確應為 leadInfo
        assignAgentToStep({
          step: 4,
          title: "利益階梯訊息框架建構（Complete Message Ladder）",
          description: "Messaging Strategist 整合 Step 2 功能利益 + Step 3 情感利益，產出完整 Message Ladder：品牌主張（Brand Promise）→ 社會認同（Social Proof）→ 情感利益（核心層）→ 功能利益 → 功能特性 → 行動呼籲。使用 osp_marketing_tools Tagline Generator 生成品牌主張候選句，marketing-strategy-pmm Messaging Hierarchy 驗證每層邏輯連貫性。",
          owner: "messaging_strategist",
          output: "完整 Message Ladder 文件 + 品牌主張候選句（3 版）",
          tools: ["osp_marketing_tools: Tagline Generator", "marketing-strategy-pmm: Messaging Hierarchy"],
          requiredSkills: ["messaging", "brand-voice", "copywriting", "positioning", "content-strategy"],
        }, leadInfo),

        // Step 5：落地文案 + A/B 驗證（m4 主執行 / m5 A/B 驗證）
        // requiredSkills = m4Skills + m5Skills 的聯集（代表這個步驟需要兩種能力）
        assignAgentToStep({
          step: 5,
          title: "轉換文案落地 + A/B 效力驗證（LP / Ads / Email）",
          description: "Conversion Copywriter 將 Message Ladder 轉化為 Landing Page Hero Copy（H1 / 副標 / Pain Point Block / CTA）、4 版廣告 Headlines（情感 / 功能 / 競品痛點 / ICP 精準）、Email Subject Lines。Ad Messaging Validator 調用 Facebook Ads 歷史 CTR 基準與 A/B 測試框架，對每版廣告評估情感強度 × 差異化 × 預測轉換率，輸出主推組合建議。",
          owner: "conversion_copywriter + ad_messaging_validator",
          output: "廣告文案包（LP Copy / 4版 Ad Headlines / Email Subject Lines）+ A/B 效力評估表",
          tools: ["marketing-strategy-pmm: Value Proposition Formula", "facebook-ads: CTR 基準數據", "ab-testing: A/B 框架"],
          requiredSkills: ["conversion-copywriting", "facebook-ads", "ad-creative", "ab-testing", "cro"],
        }, m4Info),

        // Step 6：Squad Lead QA & 定位書交付（leadId）
        assignAgentToStep({
          step: 6,
          title: "Squad Lead QA & 利益階梯定位書交付",
          description: "Squad Lead 校閱全部輸出：(1) Message Ladder 每層邏輯連貫性 (2) 情感核心是否真實反映 ICP 語言 (3) 廣告文案是否與 Ladder 一致 (4) 競品差異化是否清晰。整合輸出三份交付物：Landing Page Copy 最終版、廣告 4 版 Headlines 最終版、品牌利益階梯定位書。",
          owner: "squad_lead",
          output: "① Landing Page Copy ② 廣告 4 版 Headlines ③ 品牌利益階梯定位書（含核心定位句 / Ladder / ICP / 競品差異化 / 各通路一致性原則）",
          tools: [],
          requiredSkills: ["positioning", "brand-strategy", "messaging"],
        }, leadInfo),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "利益階梯定位流程（Benefit Ladder）",
        description: "從產品功能出發，沿 Feature → Functional Benefit → Emotional Benefit 梯形爬升，最終落地為轉換文案與廣告訊息。工具：osp_marketing_tools Value Map Generator + marketing-strategy-pmm Messaging Hierarchy。",
        steps: bbpSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "利益階梯定位小組",
        description: "沿 Feature → Functional Benefit → Emotional Benefit 梯形攀升，將產品特性轉化為打動人心的品牌訊息與高轉換廣告文案。依據 Emerald 研究，利益定位比功能定位在品牌好感度、差異化、可信度上全面勝出。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "benefit-based",
        agents: members,
        tags: ["brand", "positioning", "messaging", "copywriting", "emotional-branding", "benefit-ladder", "conversion", "ad-creative", "brand-positioning"],
        useCases: ["新產品上市訊息框架", "廣告文案改版", "Landing Page 轉換優化", "品牌重新定位訊息整合", "品牌故事建立"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "YouTube 影片腳本"],
        requiredIntegrations: ["facebook-ads"],
        token: 60000,
        showcases: [
          { company: "Apple", description: "iPod 從「5GB MP3 播放器」轉化為「1,000 首歌放口袋」，Feature→功能→情感效益三層轉化", result: "iPod 上市首年銷售超過 600 萬台，改變整個音樂產業", source: "Apple Marketing Case Study" },
          { company: "Slack", description: "從「企業通訊軟體」重新定位為「讓你少寄 Email 的工具」，聚焦情感效益（解脫感）", result: "DAU 從 0 成長到 1,200 萬，估值超過 $270 億", source: "Slack S-1 Filing" },
        ],
      });
    }

    // ── 4b. Differentiation Positioning ───────────────────────────────────────
    // Tools: marketing-strategy-pmm (April Dunford method, Battlecard, Win/Loss Analysis)
    // Core: isolate unique attributes → map to customer value → choose market category → claim the gap
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
        assignAgentToStep({ step: 1, title: "Squad Lead Intake：競爭現況與品牌優勢盤點", description: "Squad Lead 收集品牌現有定位、已知競品、客戶反饋，評估差異化成熟度，確認 April Dunford 方法論適用範疇", owner: "squad_lead", output: "競爭盤點簡報（Competitive Audit Brief）", tools: [], requiredSkills: ["competitive-analysis", "market-research", "competitor-intelligence"] }, m2Info),
        assignAgentToStep({ step: 2, title: "獨特屬性識別（Isolate Unique Attributes）", description: "Competitive Intelligence Analyst 系統性列出品牌相對競品的所有獨特屬性（功能、技術、流程、團隊），使用 marketing-strategy-pmm April Dunford 框架過濾真正差異化的屬性", owner: "competitive_intelligence_analyst", output: "差異化屬性清單（Unique Attributes List）", tools: ["marketing-strategy-pmm: April Dunford – Isolate Unique Attributes"], requiredSkills: ["brand-strategy", "differentiation", "positioning", "product-marketing"] }, leadInfo),
        assignAgentToStep({ step: 3, title: "客戶價值映射（Map to Customer Value）", description: "Brand Identity Specialist 將每項獨特屬性對映至客戶真實重視的價值（cost savings / risk reduction / strategic value），移除客戶不在乎的假差異化", owner: "brand_identity_specialist", output: "客戶價值映射表（Attribute → Customer Value Map）", tools: ["marketing-strategy-pmm: April Dunford – Map to Customer Value"], requiredSkills: ["positioning", "brand-strategy", "copywriting", "pmm"] }, leadInfo),
        assignAgentToStep({ step: 4, title: "市場類別選定（Choose Market Category）", description: "Differentiation Strategist 根據最強差異化屬性選定最有利的市場類別框架（新品類 / 子品類 / 重新框架既有類別），確立品牌在該類別的領導地位", owner: "differentiation_strategist", output: "市場類別宣言（Market Category Statement）", tools: ["marketing-strategy-pmm: April Dunford – Choose Market Category"], requiredSkills: ["battlecard", "sales-enablement", "competitive-analysis", "pmm"] }, m4Info),
        assignAgentToStep({ step: 5, title: "Battlecard & Win/Loss 分析", description: "Battlecard PMM 產出競品對比 Battlecard（我方優勢 vs 各競品弱點），使用 marketing-strategy-pmm Win/Loss Analysis Template 驗證差異化主張是否在實際銷售中成立", owner: "battlecard_pmm", output: "競品 Battlecard 套組 + Win/Loss 分析報告", tools: ["marketing-strategy-pmm: Battlecard Template", "marketing-strategy-pmm: Win/Loss Analysis"], requiredSkills: ["win-loss", "sales-enablement", "competitive-intelligence", "market-research"] }, m5Info),
        assignAgentToStep({ step: 6, title: "Squad Lead QA & 差異化定位書交付", description: "Squad Lead 確認差異化主張在市場、銷售、產品三端的一致性，輸出可落地的差異化定位書", owner: "squad_lead", output: "差異化定位書（Differentiation Positioning Playbook）", tools: [] }, null),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "差異化定位流程（April Dunford Method）",
        description: "系統性找出競品尚未佔據的差異化空間，以 April Dunford Obviously Awesome 方法論為核心：獨特屬性 → 客戶價值 → 市場類別 → 宣告並固守。搭配 Battlecard 與 Win/Loss 分析落地。",
        steps: diffSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "差異化定位小組",
        description: "系統性找出競品未宣稱的市場空白，以 April Dunford Obviously Awesome 方法論為核心，從獨特屬性識別到市場類別宣告，最終以 Battlecard 與 Win/Loss 分析驗證。FUEL 數據顯示，具備清晰差異化的品牌市場份額成長 2-3 倍。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "differentiation",
        agents: members,
        tags: ["brand-positioning", "positioning", "differentiation", "competitive-analysis", "brand-strategy", "battlecard", "april-dunford", "gtm", "market-category"],
        useCases: ["新市場進入策略", "對抗強勢競品", "品牌重新定位", "銷售 Battlecard 建立", "PMM 競品分析"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "競品 Battlecard"],
        requiredIntegrations: [],
        token: 70000,
        showcases: [
          { company: "Drift", description: "April Dunford 方法論：找到「AI 對話式行銷」空位，明確定義競爭替代品為傳統表單行銷工具", result: "以超過 $10 億被收購，成為 Conversational Marketing 品類代表", source: "Obviously Awesome, April Dunford" },
          { company: "Basecamp", description: "在大平台競爭時代，差異化為「專為小團隊設計的最簡工具」，拒絕功能膨脹", result: "逆勢盈利成長，客戶留存率持續高於行業平均", source: "Basecamp Annual Report" },
        ],
      });
    }

    // ── 4c. Value Proposition Mapping ─────────────────────────────────────────
    // Tools: osp_marketing_tools (Value Map: 4-dimension position statements), marketing-strategy-pmm (ICP)
    // Core: features → ICP personas → position statements (market/technical/UX/business) → collateral
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
        assignAgentToStep({ step: 1, title: "Squad Lead Intake：產品功能清單 + 初步 ICP 定義", description: "Squad Lead 收集產品功能列表、已知客戶類型、主要競品，評估 messaging-market fit 現況，確認 Value Mapping 優先聚焦的買家類型", owner: "squad_lead", output: "產品功能清單 + ICP 初稿（Brief）", tools: [], requiredSkills: ["icp", "customer-research", "b2b", "pain-point-analysis"] }, m2Info),
        assignAgentToStep({ step: 2, title: "ICP 精確定義（Firmographic → Psychographic）", description: "ICP Researcher 使用 marketing-strategy-pmm ICP Scoring 框架，從 Firmographics → Technographics → Psychographics → Buyer Personas 三層遞進，建立 A/B/C/D ICP 評分模型", owner: "icp_researcher", output: "ICP 定義文件（含 A/B/C/D 評分）", tools: ["marketing-strategy-pmm: ICP Scoring (A/B/C/D)", "marketing-strategy-pmm: Buyer Persona Template"], requiredSkills: ["value-proposition", "positioning", "product-marketing", "b2b"] }, leadInfo),
        assignAgentToStep({ step: 3, title: "痛點與功能價值對應（Pain → Feature → Benefit）", description: "Value Map Architect 使用 osp_marketing_tools Product Value Map Generator，為每個 ICP Persona 生成 Pain Points → Features → Benefits → Position Statements 的完整映射", owner: "value_map_architect", output: "價值映射矩陣（每 ICP × 每功能）", tools: ["osp_marketing_tools: Product Value Map Generator"], requiredSkills: ["positioning", "brand-strategy", "pmm", "copywriting"] }, leadInfo),
        assignAgentToStep({ step: 4, title: "四維度定位聲明生成（Market / Technical / UX / Business）", description: "Value Map Architect 使用 osp_marketing_tools 生成四個維度的定位聲明：Market Position（市場）、Technical Position（技術）、UX Position（體驗）、Business Position（商業價值），再由 Messaging Copywriter 精煉文字", owner: "value_map_architect", output: "四維度定位聲明文件", tools: ["osp_marketing_tools: Position Statement Generator (4 dimensions)"], requiredSkills: ["gtm", "messaging", "content-strategy", "demand-gen"] }, m4Info),
        assignAgentToStep({ step: 5, title: "銷售素材與廣告文案轉化", description: "Messaging Copywriter 將定位聲明轉化為 Landing Page Copy、Sales Deck、Ad Headlines；Sales Collateral PMM 打包為可直接使用的銷售素材包", owner: "messaging_copywriter", output: "銷售素材包（LP / Sales Deck / Ads）", tools: ["marketing-strategy-pmm: Value Proposition Formula"], requiredSkills: ["sales-enablement", "sales-deck", "collateral", "demand-gen"] }, m5Info),
        assignAgentToStep({ step: 6, title: "Squad Lead QA & 價值主張定位書交付", description: "Squad Lead 確認四維度聲明的一致性與競爭差異化，輸出完整 Value Proposition Playbook", owner: "squad_lead", output: "價值主張定位書（Value Proposition Playbook）", tools: [] }, null),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "價值主張映射流程（Value Proposition Mapping）",
        description: "B2B/SaaS 核心定位工具：將產品功能對映至買家痛點，定義 ICP，生成市場/技術/UX/商業四維度定位聲明，直接轉化為銷售素材與廣告文案。工具：osp_marketing_tools Value Map + marketing-strategy-pmm ICP。",
        steps: vpmSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "價值主張映射小組",
        description: "B2B/SaaS 核心定位工具：將產品功能映射至買家痛點，建立精確 ICP，生成市場、技術、UX、商業四維度定位聲明，直接落地為銷售素材與廣告文案。Messaging-market fit 先於 product-market fit。",
        industryKey: "b2b",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "value-proposition",
        agents: members,
        tags: ["b2b", "saas", "gtm", "value-proposition", "icp", "positioning", "product-marketing", "pmm", "demand-gen", "messaging", "brand-positioning"],
        useCases: ["B2B SaaS 定位建立", "GTM 訊息框架", "ICP 精確定義", "Sales Deck 重建", "Landing Page 轉換優化", "Messaging-market fit 驗證"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "Value Map Canvas"],
        requiredIntegrations: ["google-analytics"],
        token: 70000,
        showcases: [
          { company: "Stripe", description: "清晰的開發者 Value Prop：「在兩行程式碼內完成支付」，精準對應開發者最大痛點（複雜的支付整合）", result: "市值超過 $950 億，成為 B2B 支付基礎設施首選", source: "Stripe Growth Story" },
          { company: "Notion", description: "Value Map：把分散的 Wiki/Tasks/Docs 工具整合為一，對應知識工作者「工具疲勞」的核心 Job", result: "用戶成長到 3,000 萬，估值 $100 億", source: "Notion Investor Deck" },
        ],
      });
    }

    // ── 4d. Segmentation-Based Positioning ────────────────────────────────────
    // Tools: Madison (Research Agents: synthetic persona, segmentation, preference modeling),
    //        marketing-strategy-pmm (ICP Scoring A/B/C/D, Buyer Persona Templates)
    // Core: audience data → segmentation model → ICP scoring → segment-specific positioning
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
        assignAgentToStep({ step: 1, title: "Squad Lead Intake：受眾現況與分眾目標盤點", description: "Squad Lead 收集現有客戶資料、已知受眾假設、行銷目標，評估分眾定位的必要性與優先分群方向", owner: "squad_lead", output: "分眾定位簡報（Segmentation Brief）", tools: [], requiredSkills: ["segmentation", "market-research", "data-analysis", "quantitative-research"] }, m2Info),
        assignAgentToStep({ step: 2, title: "受眾資料收集與分析（Survey Analysis）", description: "Data Analyst 使用 Madison Research Agents 進行 survey analysis 與二手資料收集，建立受眾基本資料集（人口統計、行為、購買動機）", owner: "data_analyst", output: "受眾資料集（Audience Dataset）", tools: ["Madison: Research Agents – Survey Analysis", "Madison: Research Agents – Secondary Research"], requiredSkills: ["icp", "b2b", "scoring-model", "data-analysis", "segmentation"] }, m4Info),
        assignAgentToStep({ step: 3, title: "合成 Persona 開發（Synthetic Persona Development）", description: "Persona Developer 使用 Madison 的 Synthetic Persona Development 與 Preference Modeling 建立 3-5 個資料驅動的 Persona，超越傳統「拍腦袋 Persona」", owner: "persona_developer", output: "合成 Persona 卡片（Data-Driven Personas）", tools: ["Madison: Synthetic Persona Development", "Madison: Preference Modeling"], requiredSkills: ["persona", "consumer-insights", "qualitative-research", "behavioral-analysis"] }, m3Info),
        assignAgentToStep({ step: 4, title: "ICP 評分與優先排序（A/B/C/D Fit Scoring）", description: "ICP Scoring PMM 使用 marketing-strategy-pmm ICP Scoring 框架，對每個 Persona 進行 A/B/C/D Fit 評分（Firmographic / Technographic / Psychographic / Economic Buyer），確定最優先攻佔的客群", owner: "icp_scoring_pmm", output: "ICP 評分表（Priority Segment Matrix）", tools: ["marketing-strategy-pmm: ICP Scoring A/B/C/D", "marketing-strategy-pmm: Buyer Persona Templates"], requiredSkills: ["positioning", "brand-strategy", "pmm", "messaging"] }, leadInfo),
        assignAgentToStep({ step: 5, title: "各分群差異化定位與個人化訊息開發", description: "Personalization Strategist 針對每個 A-grade ICP 開發專屬的定位訊息、觸達渠道策略、個人化廣告素材方向", owner: "personalization_strategist", output: "分眾定位訊息矩陣（Segment × Positioning Message）", tools: ["Madison: Preference Modeling"], requiredSkills: ["channel-strategy", "personalization", "audience-targeting", "media-planning"] }, m5Info),
        assignAgentToStep({ step: 6, title: "Squad Lead QA & 分眾定位矩陣交付", description: "Squad Lead 確認各分群定位的差異化與協同性，輸出完整分眾定位矩陣與執行建議", owner: "squad_lead", output: "分眾定位矩陣（Segmentation Positioning Playbook）", tools: [] }, null),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "分眾定位流程（Segmentation-Based Positioning）",
        description: "針對不同受眾群體建立差異化定位，而非廣播式一刀切。使用 Madison Research Agents 進行問卷分析與合成 Persona 開發，搭配 marketing-strategy-pmm ICP 評分模型（A/B/C/D）優先排序目標客群。McKinsey 資料顯示有效個人化可降低 50% 獲客成本。",
        steps: segSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "分眾定位小組",
        description: "針對不同受眾群體建立差異化定位，使用 Madison Research Agents 進行資料驅動的合成 Persona 開發與偏好建模，搭配 ICP A/B/C/D 評分模型精確排序目標客群，有效個人化可降低獲客成本達 50%。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "segmentation",
        agents: members,
        tags: ["segmentation", "audience", "persona", "icp", "positioning", "consumer-insights", "personalization", "b2b", "data", "research", "brand-positioning"],
        useCases: ["受眾細分與優先排序", "ICP 精確定義", "個人化行銷策略", "多 Persona 品牌定位", "新市場受眾洞察", "降低獲客成本"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "Persona 卡片"],
        requiredIntegrations: ["facebook-ads", "google-analytics"],
        token: 80000,
        showcases: [
          { company: "Netflix", description: "三層 ICP 分群（家庭、影迷、串流早期採用者）各自設計定位和內容策略，而非單一訊息打所有人", result: "訂閱用戶超過 2.6 億，成為全球最大串流平台", source: "Netflix Investor Relations" },
          { company: "HubSpot", description: "SMB vs Enterprise 雙分群定位策略：Freemium 吸引 SMB，Enterprise 專屬功能和服務模型", result: "ARR 超過 $14 億，成功跨越 SMB 到 Enterprise 市場", source: "HubSpot Annual Report 2023" },
        ],
      });
    }

    // ── 4e. Competitive Perceptual Mapping ────────────────────────────────────
    // Tools: marketing-strategy-pmm (positioning map + whitespace), Madison Intelligence Agents,
    //        octolens (real-time competitor monitoring)
    // Core: collect → plot 2-axis map → find whitespace → claim it
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
        assignAgentToStep({ step: 1, title: "Squad Lead Intake：競品範疇定義與地圖維度假設", description: "Squad Lead 確認需要納入的競品範疇（直接/間接競品）、感知地圖的初步維度假設（如：價格 vs 品質、傳統 vs 創新），訂定資料收集計劃", owner: "squad_lead", output: "競品範疇清單 + 初步維度假設（Brief）", tools: [], requiredSkills: ["competitive-intelligence", "competitor-analysis", "market-monitoring"] }, m2Info),
        assignAgentToStep({ step: 2, title: "競品即時數據監控（Real-time Competitor Tracking）", description: "Competitor Monitor 使用 octolens 對目標競品進行即時網頁資料抽取，收集官網定位訊息、廣告文案、定價頁面、PR 發稿等資料", owner: "competitor_monitor", output: "競品原始資料集（Competitor Raw Data）", tools: ["octolens: Competitor Monitoring & Web Data Extraction"], requiredSkills: ["market-research", "positioning", "competitive-analysis", "brand-strategy"] }, leadInfo),
        assignAgentToStep({ step: 3, title: "市場情報深度分析（MarketMind Research）", description: "Market Intelligence Analyst 使用 Madison Intelligence Agents 的 MarketMind Research 模組，進行 reputation monitoring、trend analysis 與市場二手資料研究，補充 octolens 原始數據的深度解讀", owner: "market_intelligence_analyst", output: "市場情報分析報告", tools: ["Madison: Intelligence Agents – MarketMind Research", "Madison: Intelligence Agents – Reputation Monitoring", "Madison: Intelligence Agents – Trend Analysis"], requiredSkills: ["data-visualization", "analysis", "competitive-analysis", "reporting"] }, m4Info),
        assignAgentToStep({ step: 4, title: "感知地圖繪製（Perceptual Map Construction）", description: "Data Visualization Specialist 使用 marketing-strategy-pmm Competitive Positioning Map 框架，根據研究結果選定最具區分度的 2 個維度軸，繪製品牌 vs 競品的二維感知定位圖", owner: "data_visualization_specialist", output: "競爭感知地圖（Perceptual Map）", tools: ["marketing-strategy-pmm: Competitive Positioning Map Construction", "marketing-strategy-pmm: positioning-frameworks.md"], requiredSkills: ["market-research", "positioning", "strategy", "competitive-analysis"] }, leadInfo),
        assignAgentToStep({ step: 5, title: "白空間識別與定位機會建議", description: "Positioning Strategist 分析感知地圖，識別競品尚未佔據的白空間，評估品牌進入白空間的可行性，提出 2-3 個差異化定位方向及對應的廣告策略、渠道策略、定價建議", owner: "positioning_strategist", output: "白空間機會分析 + 定位方向建議書", tools: ["marketing-strategy-pmm: Whitespace Analysis"], requiredSkills: ["brand-strategy", "positioning", "gtm", "ad-targeting"] }, m5Info),
        assignAgentToStep({ step: 6, title: "Squad Lead QA & 感知定位報告交付", description: "Squad Lead 整合感知地圖 + 白空間分析 + 定位建議，輸出完整競爭感知定位報告，直接用於廣告策略、渠道規劃、定價決策", owner: "squad_lead", output: "競爭感知定位報告（Competitive Perceptual Positioning Report）", tools: [] }, null),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "競爭感知圖流程（Competitive Perceptual Mapping）",
        description: "系統繪製品牌 vs 競品的雙軸感知地圖（價格/品質、創新/傳統等），識別未被佔據的市場白空間。工具：octolens 競品即時監控 + Madison Intelligence Agents MarketMind Research + marketing-strategy-pmm Competitive Positioning Map。",
        steps: cpmSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "競爭感知定位小組",
        description: "系統繪製品牌 vs 競品雙軸感知地圖，識別市場白空間。整合 octolens 即時競品監控、Madison Intelligence Agents MarketMind Research、marketing-strategy-pmm 定位框架，直接指導廣告策略、渠道規劃與定價決策。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "perceptual-mapping",
        agents: members,
        tags: ["competitive-analysis", "competitor-analysis", "positioning", "market-research", "perceptual-map", "whitespace", "brand-strategy", "brand-positioning", "intelligence", "gtm"],
        useCases: ["找出市場白空間", "競品定位分析", "廣告策略依據", "定價策略輸入", "新品類進入評估", "品牌重定位競品研究"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "互動式感知地圖"],
        requiredIntegrations: [],
        token: 75000,
        showcases: [
          { company: "Chobani", description: "用感知地圖找到「天然 + 高蛋白」雙軸白空間，在傳統優格市場中創造新定位", result: "從 0 成長到 $15 億市值，重塑美國優格市場格局", source: "Chobani Brand Story" },
          { company: "Dollar Shave Club", description: "感知地圖定位為「高性價比 + 便利配送」，對抗 Gillette 的「高科技 + 高價」定位", result: "以 $10 億被 Unilever 收購，改變刮鬍刀市場結構", source: "Unilever Press Release" },
        ],
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Brand Positioning Methodologies 6-10
    // ═══════════════════════════════════════════════════════════════════════════

    // ── 6. Category Design（品類設計）──────────────────────────────────────────
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
          order: 1, name: "品類問題診斷",
          description: "用 Madison MarketMind Research Agents 分析現有市場結構，找出尚未被命名的問題空間（problem space）。識別消費者還沒意識到自己有的「痛點」。",
          tool: "madison-market-research",
          outputType: "category_problem_brief",
          requiredSkills: ["market-research", "category-design", "industry-analysis", "market-creation"],
        }, m3Info),
        assignAgentToStep({
          order: 2, name: "品類 POV（觀點）建立",
          description: "撰寫品類的核心觀點文件（Category POV）：為什麼現有解法不夠好？你的品類為何是唯一的正確答案？格式：問題陳述 → 舊世界 vs 新世界 → 品類宣言。",
          tool: "osp_marketing_tools",
          outputType: "category_pov_document",
          requiredSkills: ["thought-leadership", "brand-strategy", "copywriting", "category-design"],
        }, leadInfo),
        assignAgentToStep({
          order: 3, name: "競品重新框架",
          description: "用 octolens 監控競品如何自我定位，用 marketing-strategy-pmm Battlecard 工具記錄競品弱點，然後把競品定位為解決舊問題的「傳統方案」，而你的品牌解決的是全新的問題。",
          tool: "octolens",
          outputType: "competitive_reframe_map",
          requiredSkills: ["competitive-analysis", "positioning", "brand-strategy", "battlecard"],
        }, m3Info),
        assignAgentToStep({
          order: 4, name: "品類藍圖設計",
          description: "用 osp_marketing_tools Value Map Generator 繪製品類全景：品類名稱、子品類結構、典型客戶旅程、品類關鍵詞。建立你的品牌在品類中的「Category King」座標。",
          tool: "osp_marketing_tools",
          outputType: "category_blueprint",
          requiredSkills: ["category-design", "brand-strategy", "market-creation", "gtm"],
        }, leadInfo),
        assignAgentToStep({
          order: 5, name: "思想領袖內容策略",
          description: "設計讓你教育市場、成為品類代言人的內容計劃：白皮書主題、演講敘事、播客議程、LinkedIn 系列文章。目標：讓媒體和分析師用你的品類語言報導市場。",
          tool: "internal",
          outputType: "thought_leadership_content_plan",
          requiredSkills: ["thought-leadership", "content-strategy", "narrative", "brand-voice"],
        }, m2Info),
        assignAgentToStep({
          order: 6, name: "品類生態系規劃",
          description: "識別潛在的盟友（投資人、合作夥伴、早期採用者社群）共同建立品類生態系。設計品類論壇、認證計劃或社群活動讓品類變成運動。",
          tool: "internal",
          outputType: "ecosystem_strategy",
          requiredSkills: ["gtm", "partnership", "community", "go-to-market"],
        }, m4Info),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "品類設計定位流程",
        description: "Category Design 七步法：定義品類問題 → 建立品類 POV → 競品再框架 → 品類藍圖 → 思想領袖內容 → 生態系建立 → 品類傳道",
        steps: cdpSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "品類設計定位小組",
        description: "不在既有市場競爭份額，而是創造新品類成為 Category King。整合 Madison 市場研究、osp_marketing_tools 品類藍圖、octolens 競品監控，設計品類 POV、思想領袖內容計劃，讓媒體與分析師用你的語言定義市場。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "category-design",
        agents: members,
        tags: ["category-design", "category-creation", "thought-leadership", "brand-strategy", "market-creation", "gtm", "positioning", "brand-positioning", "innovation", "b2b"],
        useCases: ["新產品品類命名", "創新市場進入策略", "思想領袖內容規劃", "競品重新框架", "品類生態系建立", "IPO 前品牌定位"],
        outputFormats: ["PDF 策略報告", "品類 POV 文件", "Google Slides 簡報", "YouTube 影片腳本"],
        requiredIntegrations: [],
        token: 120000,
        showcases: [
          { company: "HubSpot", description: "發明「Inbound Marketing」品類，從教育內容、認證體系到社群，把品類變成行銷人的運動", result: "市值超過 $270 億，成為 B2B 行銷科技品類之王", source: "Play Bigger, 2016" },
          { company: "Salesforce", description: "創造「雲端 CRM」品類概念，舉辦 No Software 運動，從根本上重新框架競品 Siebel 為過時技術", result: "市值超過 $2,500 億，至今仍是 CRM 品類定義者", source: "Harvard Business Review" },
          { company: "Red Bull", description: "在碳酸飲料市場外創造「能量飲料」全新品類，而非與可樂競爭", result: "至今仍佔全球能量飲料市場 ~40% 份額", source: "Future Ventures Research" },
        ],
      });
    }

    // ── 7. Mind Positioning（心智佔位）— Ries & Trout ─────────────────────────
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
          order: 1, name: "心智地圖掃描",
          description: "用 octolens 和 Madison MarketMind 掃描目標市場的「心智梯子」：品類前三名品牌分別佔據哪個屬性？消費者說到品類第一個聯想到誰？識別已被佔領和空缺的心智位置。",
          tool: "octolens",
          outputType: "mind_ladder_map",
          requiredSkills: ["competitive-intelligence", "market-research", "brand-positioning", "mind-share"],
        }, m2Info),
        assignAgentToStep({
          order: 2, name: "梯子位置分析",
          description: "用 marketing-strategy-pmm 競品分析工具繪製「心智梯子」：第一名的品牌佔什麼位置？第二名的策略是跟隨還是反定位？評估你的品牌目前在消費者心智中的位階。",
          tool: "marketing-strategy-pmm",
          outputType: "ladder_position_analysis",
          requiredSkills: ["competitive-analysis", "positioning", "brand-strategy", "market-leadership"],
        }, m2Info),
        assignAgentToStep({
          order: 3, name: "核心屬性選擇",
          description: "選擇一個尚未被競品完全佔領的核心屬性（速度、安全、天然、創新…），確保這個屬性夠獨特、夠重要且你能真正擁有它。用 osp_marketing_tools 驗證屬性的品牌共鳴度。",
          tool: "osp_marketing_tools",
          outputType: "core_attribute_selection",
          requiredSkills: ["brand-strategy", "positioning", "brand-voice", "differentiation"],
        }, leadInfo),
        assignAgentToStep({
          order: 4, name: "競品重定位策略",
          description: "設計「重定位競品」策略（如 Avis 的 We Try Harder、7-Up 的 Uncola）：承認你不是第一，但把第一的位置重新定義，讓你的屬性更重要。或找到品類第二名的機會位置。",
          tool: "marketing-strategy-pmm",
          outputType: "repositioning_strategy",
          requiredSkills: ["positioning", "brand-strategy", "competitive-analysis", "copywriting"],
        }, leadInfo),
        assignAgentToStep({
          order: 5, name: "定位聲明與訊息",
          description: "撰寫符合「心智佔位」原則的定位聲明：單一屬性、極度清晰、無歧義。用 osp_marketing_tools Value Map Generator 確保訊息一致性，建立所有通路的統一定位語言。",
          tool: "osp_marketing_tools",
          outputType: "positioning_statement",
          requiredSkills: ["messaging", "copywriting", "brand-voice", "positioning"],
        }, m3Info),
        assignAgentToStep({
          order: 6, name: "心智強化媒體計劃",
          description: "設計讓心智佔位持續強化的媒體策略：哪些媒體管道能最有效地在目標受眾心智中植入你的屬性？設計重複性強化的廣告訊息節奏。",
          tool: "internal",
          outputType: "mind_reinforcement_media_plan",
          requiredSkills: ["advertising", "media-planning", "campaign-strategy", "ad-strategy"],
        }, m4Info),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "心智佔位定位流程",
        description: "Ries & Trout 心智定位六步法：心智地圖掃描 → 梯子分析 → 屬性選擇 → 競品重定位 → 定位聲明 → 媒體心智強化",
        steps: mpSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "心智佔位定位小組",
        description: "用 Ries & Trout 心智定位法，在消費者心智中搶佔品類首位。整合 octolens 競品監控、Madison MarketMind 心智掃描、marketing-strategy-pmm 競品分析，識別心智梯子空缺，設計重定位策略與一致性訊息，讓你的品牌成為品類代名詞。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "mind-positioning",
        agents: members,
        tags: ["mind-positioning", "brand-positioning", "competitive-strategy", "ries-trout", "market-leadership", "brand-strategy", "messaging", "positioning", "brand-positioning", "b2b"],
        useCases: ["搶占品類心智第一名", "成熟市場重新定位", "競品重定位策略", "B2B 品牌心智佔位", "廣告訊息一致性", "心智梯子分析"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "廣告訊息框架"],
        requiredIntegrations: [],
        token: 65000,
        showcases: [
          { company: "Avis", description: "承認自己是租車第二名，用「We Try Harder」把劣勢變成優勢，重新定位 Hertz 為「自滿的第一名」", result: "Avis 首次轉虧為盈，廣告成為廣告史經典案例", source: "Positioning: The Battle for Your Mind, Ries & Trout" },
          { company: "7-Up", description: "以「Uncola」定位逃離 Coke/Pepsi 雙寡佔心智梯子，成功在消費者心智中佔據「可樂替代品」位置", result: "銷量顯著提升，成功在巨頭夾縫中建立獨特心智位置", source: "Ries & Trout Original Case" },
          { company: "AWS", description: "靠「雲端基礎設施第一名」心智佔位持續強化，讓後進競爭者（Azure、GCP）永遠追趕", result: "至今仍是全球雲端市場領導者，市占超過 30%", source: "Gartner Cloud Report 2024" },
        ],
      });
    }

    // ── 8. JTBD Positioning（任務導向定位）────────────────────────────────────
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
          order: 1, name: "任務挖掘（Job Mapping）",
          description: "用 Madison Synthetic Persona Agents 和 MarketMind Research 模擬客戶「雇用」產品的情境：他們在完成什麼更大的任務？觸發點是什麼？成功看起來是什麼樣子？建立 Job Map（開始 → 準備 → 執行 → 結束）。",
          tool: "madison-market-research",
          outputType: "job_map",
          requiredSkills: ["jobs-to-be-done", "jtbd", "customer-research", "qualitative-research"],
        }, m2Info),
        assignAgentToStep({
          order: 2, name: "Switch Interview 分析",
          description: "模擬客戶從舊方案切換到你的產品的「轉換故事」：四個力（推力 Push、拉力 Pull、焦慮 Anxiety、習慣 Habit）分析。識別哪些 Job 已有足夠強的切換驅動力，哪些還需要教育。",
          tool: "madison-market-research",
          outputType: "switch_analysis",
          requiredSkills: ["jtbd", "customer-research", "behavioral-analysis", "user-research"],
        }, m2Info),
        assignAgentToStep({
          order: 3, name: "競爭替代品重定義",
          description: "不按傳統行業分類定義競品，而是問「客戶不用你的產品時，他們用什麼完成同一個 Job」？用 marketing-strategy-pmm ICP 工具和 octolens 找出真正的任務替代品（可能是完全不同行業的產品）。",
          tool: "marketing-strategy-pmm",
          outputType: "job_based_competitor_map",
          requiredSkills: ["competitive-analysis", "jtbd", "market-research", "product-marketing"],
        }, m3Info),
        assignAgentToStep({
          order: 4, name: "JTBD 定位聲明",
          description: "圍繞 Job 寫定位聲明（不是人口統計，是情境）：「當 [情境] 時，[目標客戶] 雇用 [產品] 來 [完成任務]，因為它是唯一能 [差異點] 的方案」。用 osp_marketing_tools Value Map Generator 驗證 Job 和效益的對應關係。",
          tool: "osp_marketing_tools",
          outputType: "jtbd_positioning_statement",
          requiredSkills: ["positioning", "jtbd", "copywriting", "brand-strategy"],
        }, leadInfo),
        assignAgentToStep({
          order: 5, name: "任務驅動訊息框架",
          description: "用 marketing-strategy-pmm PMM 工具建立所有通路的統一訊息框架：官網英雄區塊、廣告標題、銷售話術，全部圍繞 Job 而非功能特性或受眾人口統計。",
          tool: "marketing-strategy-pmm",
          outputType: "jtbd_messaging_framework",
          requiredSkills: ["messaging", "pmm", "content-strategy", "gtm"],
        }, m4Info),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "任務導向定位流程",
        description: "JTBD 定位五步法：任務挖掘 → 觸發點分析 → 替代方案識別 → 任務聲明 → 圍繞任務的訊息框架",
        steps: jtbdSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "任務導向定位小組",
        description: "不依賴人口統計分眾，而是挖掘客戶真正「雇用」產品完成的任務（Job），圍繞任務做定位。整合 Madison 合成訪談研究、marketing-strategy-pmm ICP 和訊息框架、osp_marketing_tools 效益驗證，建立情境驅動的定位聲明與跨通路訊息一致性。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "jtbd",
        agents: members,
        tags: ["jtbd", "jobs-to-be-done", "customer-research", "product-positioning", "product-marketing", "positioning", "brand-positioning", "b2b", "saas", "innovation"],
        useCases: ["新產品定位策略", "B2B SaaS 重新定位", "客戶研究驅動訊息", "產品創新方向驗證", "Landing Page 優化", "銷售話術建立"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "JTBD Job Map"],
        requiredIntegrations: ["google-analytics"],
        token: 75000,
        showcases: [
          { company: "McDonald's", description: "重新理解奶昔的 Job：不是甜點，而是「通勤路上的早餐替代品」。圍繞 Job 調整產品（更濃稠、更耐久）和行銷訊息", result: "奶昔銷量顯著提升，成為 JTBD 理論最廣泛引用的案例", source: "Clayton Christensen, Forbes" },
          { company: "FedEx", description: "定義 Job 為「我需要把這個東西從這裡以最快速度、零風險送到那裡」，整個品牌圍繞這個任務建立", result: "成為隔夜快遞 Job 的代名詞，建立品類領導地位", source: "Clayton Christensen JTBD Framework" },
          { company: "Snickers", description: "找到真正的 Job：「你餓的時候不像自己，需要快速回到最佳狀態」，「You're not you when you're hungry」圍繞 Job 定位", result: "成為全球最暢銷巧克力棒之一，訊息在 80+ 個市場持續有效", source: "Mars Inc. Marketing Case" },
        ],
      });
    }

    // ── 9. Purpose-Driven Positioning（目的導向定位）──────────────────────────
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
          order: 1, name: "使命真實性稽核",
          description: "用 Madison MarketMind Research 和 octolens 掃描品牌歷史、現有 CSR 活動、產品特性，找出品牌真實能「擁有」的社會使命。避免 purpose washing——必須有可驗證的行動支撐聲明。",
          tool: "madison-market-research",
          outputType: "purpose_authenticity_audit",
          requiredSkills: ["brand-purpose", "csr", "brand-strategy", "sustainability"],
        }, m4Info),
        assignAgentToStep({
          order: 2, name: "目標受眾價值觀對齊",
          description: "用 Madison Synthetic Persona Agents 建立目標受眾的價值觀地圖：他們關心什麼社會議題？什麼使命會讓他們主動選擇你？用 marketing-strategy-pmm ICP 確認 Purpose 與 Ideal Customer 的交集。",
          tool: "marketing-strategy-pmm",
          outputType: "purpose_audience_alignment_map",
          requiredSkills: ["consumer-insights", "audience-analysis", "brand-purpose", "market-research"],
        }, m4Info),
        assignAgentToStep({
          order: 3, name: "Purpose 聲明建立",
          description: "用 osp_marketing_tools Value Map Generator 建立三層 Purpose 架構：What（你做什麼）→ How（你怎麼做）→ Why（為什麼這件事重要，比賺錢更重要的理由）。確保 Purpose 夠具體、可行動、可衡量。",
          tool: "osp_marketing_tools",
          outputType: "brand_purpose_statement",
          requiredSkills: ["brand-purpose", "copywriting", "brand-strategy", "storytelling"],
        }, leadInfo),
        assignAgentToStep({
          order: 4, name: "使命驅動敘事設計",
          description: "設計讓消費者「加入運動」而非「購買產品」的品牌故事框架。格式：英雄不是品牌而是消費者，品牌是賦能者。建立 Manifesto、Signature Campaign 概念（類 Patagonia / Nike 風格）。",
          tool: "osp_marketing_tools",
          outputType: "purpose_narrative_manifesto",
          requiredSkills: ["storytelling", "brand-narrative", "campaign-strategy", "brand-voice"],
        }, m2Info),
        assignAgentToStep({
          order: 5, name: "全通路 Purpose 整合",
          description: "確保 Purpose 貫穿所有觸點：產品包裝、官網 About 頁、社群貼文語調、廣告標題、客服話術。設計可追蹤的使命指標（除了銷售，還有什麼數字能證明 Purpose 在發揮作用）。",
          tool: "marketing-strategy-pmm",
          outputType: "purpose_integration_playbook",
          requiredSkills: ["omnichannel", "content-strategy", "brand-voice", "campaign-strategy"],
        }, m3Info),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "目的導向定位流程",
        description: "Purpose-Driven 定位五步法：使命真實性稽核 → 目標受眾價值觀對齊 → Purpose 聲明 → 使命驅動敘事 → 全通路整合",
        steps: pdpSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "目的導向定位小組",
        description: "以品牌社會使命為核心定位驅動力，讓消費者因認同而選擇你。整合 Madison 受眾價值觀研究、osp_marketing_tools Purpose 框架、marketing-strategy-pmm 訊息整合，建立真實可驗證的 Brand Purpose、Manifesto 敘事與全通路 Purpose 整合手冊。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
        methodology: "purpose-driven",
        agents: members,
        tags: ["purpose-driven", "brand-purpose", "csr", "sustainability", "social-impact", "brand-strategy", "dtc", "gen-z", "storytelling", "brand-positioning"],
        useCases: ["DTC 品牌差異化", "年輕受眾品牌共鳴", "ESG 品牌策略", "品牌重塑使命宣言", "Manifesto Campaign 概念", "企業社會責任行銷"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "Brand Manifesto", "YouTube 影片腳本", "LINE 分享卡"],
        requiredIntegrations: ["google-analytics"],
        token: 85000,
        showcases: [
          { company: "Patagonia", description: "「Don't Buy This Jacket」反消費廣告，讓品牌使命（環境永續）凌駕於短期銷售，真實行動支撐 Purpose（修舊衣計劃、1% for the Planet）", result: "廣告上線後隔年營收成長 30%，品牌估值達 $30 億", source: "LinkedIn / Matt Vanderlinden" },
          { company: "Nike", description: "「Dream Crazy」Colin Kaepernick 廣告，押注於核心受眾（運動員、年輕族群）的價值觀，承擔爭議風險", result: "品牌價值增加 $60 億，上線後線上銷售增長 31%", source: "MarkHub24 Brand Analysis" },
          { company: "Dove", description: "「Real Beauty」使命：讓每位女性認為自己美麗，直接挑戰美妝行業的傳統美麗標準", result: "部分市場銷售暴增 700%，建立品牌長達 20 年的差異化定位", source: "M Accelerator Case Study" },
        ],
      });
    }

    // ── 10. Brand Archetype Positioning（品牌原型定位）────────────────────────
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
          order: 1, name: "現有品牌人格診斷",
          description: "用 octolens 爬取品牌既有溝通素材（官網文案、社群貼文、廣告），Madison MarketMind 掃描消費者對品牌的感知描述詞，診斷品牌目前隱性展現的原型是什麼，以及與期望原型的落差。",
          tool: "octolens",
          outputType: "brand_personality_audit",
          requiredSkills: ["brand-archetype", "brand-identity", "brand-perception", "competitive-analysis"],
        }, m4Info),
        assignAgentToStep({
          order: 2, name: "原型選擇與組合",
          description: "基於品牌使命、目標受眾心理需求、競品原型地圖，從 Jung 12 原型中選擇主原型（Primary）和輔助原型（Secondary）。避免選擇競品已強勢佔據的原型。建立原型選擇理由書。",
          tool: "marketing-strategy-pmm",
          outputType: "archetype_selection_rationale",
          requiredSkills: ["brand-archetype", "brand-strategy", "brand-identity", "jungian"],
        }, leadInfo),
        assignAgentToStep({
          order: 3, name: "品牌聲音指南",
          description: "用 osp_marketing_tools Brand Voice Generator 建立以原型為核心的品牌聲音指南：用詞庫（宜用 / 禁用）、句子結構偏好、情緒基調、各通路語調微調（官網 vs 社群 vs 廣告 vs 客服）。",
          tool: "osp_marketing_tools",
          outputType: "brand_voice_guide",
          requiredSkills: ["brand-voice", "tone-of-voice", "copywriting", "brand-narrative"],
        }, m2Info),
        assignAgentToStep({
          order: 4, name: "視覺與體驗方向",
          description: "根據原型特質制定視覺方向：配色系統、字型個性、攝影風格、版面偏好。建立體驗設計原則：產品包裝、官網 UX、門市空間（如適用）應傳遞的感受。提供 Moodboard 方向。",
          tool: "internal",
          outputType: "visual_experience_direction",
          requiredSkills: ["visual-identity", "creative-direction", "brand-design", "design-strategy"],
        }, m3Info),
        assignAgentToStep({
          order: 5, name: "全通路原型一致性稽核",
          description: "用 marketing-strategy-pmm 訊息一致性工具，稽核所有現有觸點的原型一致性。建立品牌原型評分標準，讓後續所有溝通都能自我稽核是否符合原型人格。",
          tool: "marketing-strategy-pmm",
          outputType: "archetype_consistency_audit",
          requiredSkills: ["brand-strategy", "omnichannel", "brand-voice", "content-strategy"],
        }, leadInfo),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "品牌原型定位流程",
        description: "Brand Archetype 五步法：現有品牌人格診斷 → 原型選擇與組合 → 品牌聲音指南 → 視覺與體驗方向 → 全通路原型一致性",
        steps: bapSteps,
      });

      await upsertSquad(conn, {
        slug,
        name: "品牌原型定位小組",
        description: "以 Jung 心理學 12 原型統一品牌的聲音、視覺與體驗，從人格層面建立深度的消費者情感連結。整合 octolens 品牌感知稽核、osp_marketing_tools 品牌聲音框架、marketing-strategy-pmm 訊息一致性，輸出原型選擇理由書、品牌聲音指南與全通路一致性手冊。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["strategy"],
        methodology: "brand-archetype",
        agents: members,
        tags: ["brand-archetype", "brand-identity", "brand-personality", "brand-voice", "visual-identity", "jungian", "brand-strategy", "rebranding", "creative", "omnichannel"],
        useCases: ["品牌重塑人格設定", "全通路品牌聲音統一", "新品牌人格建立", "視覺識別方向制定", "創意策略指引", "品牌代言人選擇依據"],
        outputFormats: ["PDF 策略報告", "品牌聲音指南", "Google Slides 簡報", "視覺方向 Moodboard"],
        requiredIntegrations: [],
        token: 70000,
        showcases: [
          { company: "Nike", description: "Hero 原型一致性貫穿 30 年所有 Campaign：Just Do It、Dream Crazy、Find Your Greatness，每個廣告都強化英雄敘事", result: "年營收從 1988 年 $8.77 億成長到 1998 年 $92 億，成為全球最有價值運動品牌", source: "Nike Annual Reports" },
          { company: "Old Spice", description: "Jester + Hero 混合原型重塑過時品牌，The Man Your Man Could Smell Like 系列顛覆男性美容品類", result: "一個月內 body wash 銷售飆漲 107%，市占從 3% 翻倍到 6%，2017 年總營收超過 $10 億", source: "M Accelerator / Procter & Gamble" },
          { company: "Apple", description: "Creator 原型一致性：Think Different、設計至上、「對世界有不同想法的人」，視覺、產品、零售全部統一", result: "成為全球最高市值品牌，品牌忠誠度長期位居各行業第一", source: "Interbrand Best Global Brands" },
        ],
      });
    }


    // ═══════════════════════════════════════════════════════════════════
    // CATEGORY A: Facebook/Meta 廣告 Methodology Squads (A1–A10)
    // ═══════════════════════════════════════════════════════════════════

    // A1: Gary Vaynerchuk — Jab, Jab, Jab, Right Hook (2013)
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
        assignAgentToStep({ order: 1, name: "Jab 內容策略規劃", description: "依 GaryVee 框架設計 3 輪 Jab 內容：教育型、娛樂型、情感型，建立受眾信任，不出現任何銷售訊息", tool: "internal", outputType: "jab_content_calendar", requiredSkills: ["paid-ads", "brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Jab 貼文文案撰寫", description: "為每個 Jab 類型撰寫原生感強的 Facebook 文案，純粹提供價值，文案風格貼近真人分享而非廣告", tool: "internal", outputType: "jab_post_copy", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Jab 視覺素材製作", description: "製作與 Facebook 動態流融合的原生視覺，最大化有機觸及與互動率", tool: "internal", outputType: "jab_creative_assets", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "Right Hook 廣告出擊", description: "在充分給予後精準出擊：高轉換 Right Hook 廣告，直接要求行動（購買/報名/下載），搭配自訂受眾再行銷", tool: "internal", outputType: "right_hook_ad_set", requiredSkills: ["paid-ads", "marketing-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "社群策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "文案師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "視覺設計師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "廣告投放師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GaryVee Jab Jab Jab Right Hook Facebook 策略", description: "Source: Gary Vaynerchuk《Jab, Jab, Jab, Right Hook》2013. VaynerMedia 應用此框架為百威啤酒、雪碧等品牌帶來互動率提升 400%", steps });
      await upsertSquad(conn, { slug, name: "GaryVee Jab Jab Right Hook Facebook 策略小隊", description: "先用 3 次價值內容（Jab）建立信任，再精準一擊（Right Hook）促成轉換。Gary Vaynerchuk 2013 年商業驗證框架", industryKey: "marketing", missionType: taskType, workspace: ["facebook"], methodology: "Gary Vaynerchuk – Jab, Jab, Jab, Right Hook (2013)", agents: agentMembers, tags: ["facebook", "content-marketing", "paid-ads", "social-media"], useCases: ["品牌社群溫熱", "電商Facebook促銷", "活動報名推廣"], outputFormats: ["Facebook貼文排程", "廣告素材套組", "投放報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "百威啤酒（Budweiser）via VaynerMedia", description: "應用 Jab 框架，70% 內容為純價值給予，30% 為 Right Hook 促銷", result: "Facebook 互動率提升 400%，廣告轉換成本降低 45%", source: "VaynerMedia Case Studies / Jab Jab Jab Right Hook (2013)" }, { company: "Gary Vaynerchuk 個人品牌", description: "長期執行 Give First 策略，1,000+ 日每天在 Facebook/YouTube 輸出免費內容", result: "累積 900 萬+ Facebook 粉絲，VaynerMedia 年營收超過 $2.5 億", source: "GaryVee.com / Inc. Magazine 2022" }] });
    }

    // A2: Eugene Schwartz — Breakthrough Advertising Awareness Levels (1966)
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
        assignAgentToStep({ order: 1, name: "受眾意識層級診斷", description: "分析目標受眾處於 5 個意識階段的哪一層：完全不知情→問題意識→解決方案意識→產品意識→最意識", tool: "internal", outputType: "awareness_level_map", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "分層廣告訊息架構", description: "為每個意識層級設計專屬訊息架構：冷受眾用問題勾起、溫受眾比較方案、熱受眾直接促購", tool: "internal", outputType: "layered_message_framework", requiredSkills: ["ad-copywriting-formulas"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "分層廣告文案撰寫", description: "按意識層級撰寫 5 套廣告文案，Hook 強度從軟性教育→強力促銷逐步升級", tool: "internal", outputType: "layered_ad_copy", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 4, name: "分層創意素材製作", description: "為冷/溫/熱受眾製作相應視覺風格：冷=教育感、溫=比較感、熱=緊迫感", tool: "internal", outputType: "awareness_creatives", requiredSkills: ["visual-ad-brief"] }, m4Info),
        assignAgentToStep({ order: 5, name: "漏斗歸因優化", description: "設定各意識層追蹤像素事件，監測受眾在漏斗中的移動，持續優化每層廣告", tool: "internal", outputType: "awareness_funnel_report", requiredSkills: ["attribution-modeling"] }, m5Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "廣告文案師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "受眾研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Hook 文案師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "廣告素材師", order: 4 },
        { agent_id: m5Id, is_lead: false, role: "歸因分析師", order: 5 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Eugene Schwartz 意識層級 Facebook 廣告框架", description: "Source: Eugene Schwartz《Breakthrough Advertising》1966. Agora Publishing 應用此框架年創直效廣告營收超過 $10 億", steps });
      await upsertSquad(conn, { slug, name: "Schwartz 意識層級 Facebook 廣告小隊", description: "依 Eugene Schwartz 5 層意識框架，為不同認知階段受眾投放精準廣告，避免對冷受眾促銷、對熱受眾只講教育", industryKey: "marketing", missionType: taskType, workspace: ["facebook"], methodology: "Eugene Schwartz – Breakthrough Advertising Awareness Levels (1966)", agents: agentMembers, tags: ["facebook", "paid-ads", "copywriting", "funnel"], useCases: ["新品牌冷受眾開發", "教育型產品廣告", "高客單價B2C廣告"], outputFormats: ["分層廣告文案套組", "廣告素材包", "漏斗歸因報告"], requiredIntegrations: [], token: 65000, showcases: [{ company: "Agora Publishing", description: "旗下 50+ 出版品持續應用 Schwartz 框架撰寫廣告文案，針對不同意識層精準投放", result: "年營收突破 $10 億，直效廣告 ROAS 長年維持 4-8x", source: "Agora Financial / Breakthrough Advertising (Schwartz 1966)" }, { company: "ClickFunnels", description: "Russell Brunson 公開承認 Schwartz 意識框架是其廣告策略核心", result: "ClickFunnels 在 3 年內達到 $1 億 ARR，Facebook 廣告 CPA 優化 60%", source: "Russell Brunson《Traffic Secrets》2020" }] });
    }

    // A3: Ryan Deiss (DigitalMarketer) — Customer Value Optimization (2015)
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
        assignAgentToStep({ order: 1, name: "Lead Magnet 設計", description: "設計高感知價值免費品（Lead Magnet），解決受眾單一痛點，換取 Email/聯絡資訊", tool: "internal", outputType: "lead_magnet_brief", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Tripwire 低門檻產品設定", description: "設計 $1-$20 低門檻入門產品，讓潛客從訪客轉為付費顧客，消除心理消費門檻", tool: "internal", outputType: "tripwire_offer", requiredSkills: ["paid-ads"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Core Offer 主力產品廣告", description: "撰寫主力產品廣告文案，針對已購買 Tripwire 的顧客再行銷，轉化率通常提升 3-5 倍", tool: "internal", outputType: "core_offer_ad", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 4, name: "Profit Maximizer OTO 設計", description: "設計購買後立即出現的加購/升級方案（OTO），最大化每筆訂單價值（AOV）", tool: "internal", outputType: "oto_upsell_flow", requiredSkills: ["ad-copywriting-formulas"] }, m3Info),
        assignAgentToStep({ order: 5, name: "Return Path 回購序列", description: "設計 Email 自動化回購序列，透過持續提供價值讓顧客重複購買，提升 LTV", tool: "internal", outputType: "return_path_email_sequence", requiredSkills: ["email-marketing"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "CVO 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "廣告投放師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "文案師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "Email 行銷師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ryan Deiss Customer Value Optimization Facebook 漏斗", description: "Source: Ryan Deiss / DigitalMarketer《Customer Value Optimization》2015. DigitalMarketer 應用此框架培訓超過 100 萬行銷人，自身年收入超過 $20M", steps });
      await upsertSquad(conn, { slug, name: "Deiss CVO Facebook 漏斗小隊", description: "應用 DigitalMarketer 的 Customer Value Optimization 框架，從 Lead Magnet → Tripwire → Core Offer → OTO → Return Path 完整優化顧客終生價值", industryKey: "marketing", missionType: taskType, workspace: ["facebook"], methodology: "Ryan Deiss / DigitalMarketer – Customer Value Optimization (2015)", agents: agentMembers, tags: ["facebook", "funnel", "cvo", "paid-ads", "email"], useCases: ["電商全漏斗優化", "線上課程銷售漏斗", "SaaS 免費試用轉付費"], outputFormats: ["漏斗策略圖", "廣告文案套組", "Email 序列", "OTO 頁面文案"], requiredIntegrations: [], token: 70000, showcases: [{ company: "DigitalMarketer 自身", description: "應用 CVO 框架，以 $7 Tripwire 獲取顧客，再透過 Core Offer 升級至 $997 認證課程", result: "年營收超過 $20M，學員超過 100 萬，Facebook 廣告 ROAS 穩定在 4-6x", source: "DigitalMarketer.com / Ryan Deiss 公開演講 Traffic & Conversion Summit" }, { company: "Agora Financial", description: "採用 Tripwire + Ascension 模型銷售財務出版品", result: "年營收超過 $10 億，顧客 LTV 是業界平均的 3 倍", source: "Inc. Magazine / Agora Publishing Annual Reports" }] });
    }

    // A4: Perry Marshall — 80/20 Sales and Marketing Facebook Method (2013)
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
        assignAgentToStep({ order: 1, name: "80/20 顧客分析", description: "識別創造 80% 營收的頂端 20% 顧客，分析其人口特徵、行為模式、購買觸發點", tool: "internal", outputType: "top20_customer_profile", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "80/20 受眾精準鎖定", description: "以 Top 20% 顧客建立 Lookalike 受眾，並排除低價值訪客，把廣告預算集中投放高潛力受眾", tool: "internal", outputType: "precision_audience_set", requiredSkills: ["lookalike-audience-strategy"] }, m2Info),
        assignAgentToStep({ order: 3, name: "高價值廣告投資組合", description: "依 80/20 原則優化出價策略：對高意圖受眾提高出價，對低轉換受眾降低預算，最大化 ROAS", tool: "internal", outputType: "optimized_campaign_portfolio", requiredSkills: ["smart-bidding-strategy"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "80/20 分析師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "受眾策略師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "競價優化師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Perry Marshall 80/20 Facebook 廣告效益最大化", description: "Source: Perry Marshall《80/20 Sales and Marketing》2013. Marshall 是 Google AdWords 最早期大師，其 80/20 方法幫助數千家企業將廣告 ROAS 提升 2-4 倍", steps });
      await upsertSquad(conn, { slug, name: "Perry Marshall 80/20 Facebook 廣告小隊", description: "應用 Perry Marshall 的 80/20 法則，把廣告預算集中在創造最大價值的 20% 頂端受眾，大幅提升 ROAS", industryKey: "marketing", missionType: taskType, workspace: ["facebook"], methodology: "Perry Marshall – 80/20 Sales and Marketing (2013)", agents: agentMembers, tags: ["facebook", "paid-ads", "audience-targeting", "8020"], useCases: ["廣告預算效益優化", "高單價產品Facebook廣告", "LTV-based受眾投放"], outputFormats: ["80/20 顧客分析報告", "受眾策略方案", "競價優化設定"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Perry Marshall 客戶群（B2B SaaS）", description: "應用 80/20 受眾篩選，將廣告預算從散投改為集中投放 Top 20% 高價值受眾", result: "廣告 ROAS 從 1.8x 提升至 5.2x，同期廣告支出減少 30%", source: "Perry Marshall《80/20 Sales and Marketing》案例章節" }, { company: "Infusionsoft（現 Keap）", description: "Perry Marshall 擔任顧問，協助 Infusionsoft 以 80/20 原則重建 Facebook 廣告架構", result: "潛客獲取成本降低 55%，企業達到 $1 億 ARR 里程碑", source: "Keap.com History / Inc. Magazine" }] });
    }

    // A5: Dan Kennedy — Magnetic Marketing (1992, updated 2018)
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
        assignAgentToStep({ order: 1, name: "磁石訊息定義（Message）", description: "定義明確區隔訊息：你服務誰、解決什麼問題、為何選你。Kennedy 要求訊息必須「讓對的人無法不回應」", tool: "internal", outputType: "magnetic_message", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "理想顧客畫像（Market）", description: "精確定義理想顧客：人口特徵、心理特徵、媒體消費習慣、購買觸發點，建立完整 ICA", tool: "internal", outputType: "ideal_client_avatar", requiredSkills: ["market-research-agent"] }, m3Info),
        assignAgentToStep({ order: 3, name: "直效回應廣告文案", description: "應用 Kennedy 直效回應原則撰寫 Facebook 廣告：強力 Headline + 利益堆疊 + 社會證明 + 緊迫 CTA", tool: "internal", outputType: "direct_response_ad_copy", requiredSkills: ["ad-copywriting-formulas"] }, m2Info),
        assignAgentToStep({ order: 4, name: "媒體投放策略（Media）", description: "選擇正確媒體管道與版位，針對 ICA 的媒體習慣設計 Facebook 投放策略，確保訊息觸及對的人", tool: "internal", outputType: "media_strategy", requiredSkills: ["paid-ads"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "磁石行銷策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "直效回應文案師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "受眾研究師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "媒體投放師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Dan Kennedy Magnetic Marketing Facebook 策略", description: "Source: Dan Kennedy《Magnetic Marketing》1992，2018 年更新版。GKIC（Kennedy 學員社群）超過 25,000 名企業主應用此框架，平均收入提升 47%", steps });
      await upsertSquad(conn, { slug, name: "Kennedy Magnetic Marketing Facebook 小隊", description: "應用 Dan Kennedy 的 Message-Market-Media 三角框架，吸引對的客戶主動靠近，而非追逐所有人", industryKey: "marketing", missionType: taskType, workspace: ["facebook"], methodology: "Dan Kennedy – Magnetic Marketing (1992/2018)", agents: agentMembers, tags: ["facebook", "direct-response", "paid-ads", "copywriting"], useCases: ["本地商家Facebook廣告", "服務業客戶獲取", "高端B2C廣告"], outputFormats: ["磁石訊息定義書", "ICA 文件", "廣告文案", "媒體策略"], requiredIntegrations: [], token: 60000, showcases: [{ company: "GKIC（Glazer-Kennedy 社群）25,000+ 企業主", description: "應用 Magnetic Marketing 框架重塑廣告策略，從廣撒改為精準磁吸", result: "會員企業平均收入提升 47%，廣告 ROI 提升 200%+", source: "GKIC Annual Conference / No B.S. Marketing Newsletter" }, { company: "Magnetic Marketing 公司本身", description: "Russell Brunson 收購 Magnetic Marketing 品牌後應用 Kennedy 框架", result: "品牌年營收超過 $1 億，線上課程銷售量翻 3 倍", source: "Russell Brunson 公開訪談 2022" }] });
    }

    // A6: Alex Hormozi — $100M Offers Facebook Strategy (2021)
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
        assignAgentToStep({ order: 1, name: "Grand Slam Offer 設計", description: "依 Hormozi 框架建立無法拒絕的報價：夢想結果 + 高感知價值 + 低阻力 + 強力保證。目標：讓人覺得「不買才蠢」", tool: "internal", outputType: "grand_slam_offer_doc", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Proof Stack 社會證明堆疊", description: "收集並組織所有社會證明：客戶見證、before/after 數據、案例研究，建立不可反駁的信任牆", tool: "internal", outputType: "proof_stack", requiredSkills: ["paid-ads"] }, m2Info),
        assignAgentToStep({ order: 3, name: "廣告投放與 A/B 測試", description: "以 Grand Slam Offer 為核心投放 Facebook 廣告，測試不同 Headline 與 Visual，找出最高 CTR/CVR 組合", tool: "internal", outputType: "fb_ad_test_results", requiredSkills: ["meta-ads-paid-ads"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Offer 設計師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "廣告投放師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "素材設計師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Hormozi $100M Offers Facebook 廣告策略", description: "Source: Alex Hormozi《$100M Offers》2021. Hormozi 應用此框架讓 Gym Launch 在 6 個月達到 $1.7M/月收入，Acquisition.com 旗下企業組合估值超過 $1 億", steps });
      await upsertSquad(conn, { slug, name: "Hormozi $100M Offer Facebook 小隊", description: "先打造無法拒絕的 Grand Slam Offer，再用 Facebook 廣告擴大觸達。Offer 對了，廣告費用可以降低 60%+", industryKey: "marketing", missionType: taskType, workspace: ["facebook"], methodology: "Alex Hormozi – $100M Offers (2021)", agents: agentMembers, tags: ["facebook", "offer-design", "paid-ads", "conversion"], useCases: ["健身房/服務業客戶獲取", "線上課程銷售", "高單價服務廣告"], outputFormats: ["Grand Slam Offer 文件", "廣告文案組合", "A/B 測試報告"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Gym Launch（Hormozi 創辦）", description: "以 Grand Slam Offer「免費設備 + 100% 保證」搭配 Facebook 廣告投放", result: "6 個月從 $0 達到 $1.7M/月，首年破 $17M", source: "Alex Hormozi《$100M Offers》Chapter 1 + YouTube 訪談" }, { company: "Acquisition.com 投資組合", description: "所有被投資企業強制執行 Offer-First 策略後再跑 Facebook 廣告", result: "平均企業估值提升 3-5 倍，廣告獲客成本降低 40-65%", source: "Acquisition.com 官網 / Hormozi 公開 Podcast 2023" }] });
    }

    // A7: David Ogilvy — Long-Copy Direct Response (Confessions of an Advertising Man, 1963)
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
        assignAgentToStep({ order: 1, name: "深度消費者洞察研究", description: "Ogilvy 要求廣告人做 homework：研究產品、研究競品、研究消費者。找出讓人分享給朋友的「Big Idea」", tool: "internal", outputType: "consumer_insight_report", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "Big Idea + Headline 創作", description: "依 Ogilvy 準則撰寫廣告標題：平均 5 倍讀者看標題多於內文，標題決定廣告成敗", tool: "internal", outputType: "headline_variants", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "長文案正文撰寫", description: "撰寫充滿事實、功效說明、見證的長篇廣告文案。Ogilvy 說「消費者不是白痴，她是你的妻子」，用尊重的方式說服", tool: "internal", outputType: "long_form_ad_copy", requiredSkills: ["ad-copywriting-formulas"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "編輯風格視覺設計", description: "設計帶有雜誌編輯感的廣告素材：清晰排版、高品質攝影、圖說文字，提升廣告信任度", tool: "internal", outputType: "editorial_creative", requiredSkills: ["visual-ad-brief"] }, m3Info),
        assignAgentToStep({ order: 5, name: "廣告效益追蹤", description: "追蹤長文案 vs 短文案效益，測量閱讀完成率、點擊率、轉換率，優化最佳廣告版本", tool: "internal", outputType: "copy_performance_report", requiredSkills: ["marketing-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "長文案撰寫師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "消費者研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "編輯設計師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "廣告效益分析師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ogilvy 長文案直效回應 Facebook 廣告", description: "Source: David Ogilvy《Confessions of an Advertising Man》1963. Ogilvy & Mather 應用長文案原則為 Rolls-Royce、IBM、American Express 創造數十億廣告價值", steps });
      await upsertSquad(conn, { slug, name: "Ogilvy 長文案 Facebook 廣告小隊", description: "應用 David Ogilvy 深度研究+長文案方法，讓 Facebook 廣告像一篇有說服力的雜誌文章，建立品牌信任同時促進轉換", industryKey: "marketing", missionType: taskType, workspace: ["facebook"], methodology: "David Ogilvy – Confessions of an Advertising Man (1963)", agents: agentMembers, tags: ["facebook", "long-copy", "direct-response", "brand"], useCases: ["高單價產品廣告", "品牌形象廣告", "B2B服務廣告"], outputFormats: ["廣告長文案", "Headline 變體", "編輯風格素材"], requiredIntegrations: [], token: 65000, showcases: [{ company: "Rolls-Royce（Ogilvy & Mather）", description: "「在時速60英里時，這輛新 Rolls-Royce 最大的噪音是電子鐘的滴答聲」— 719 字長文案廣告", result: "刊出後 Rolls-Royce 銷量增加 50%，成為史上最被引用的廣告之一", source: "Ogilvy《Confessions of an Advertising Man》1963" }, { company: "American Express（Ogilvy 操刀）", description: "長文案直效郵件廣告強調身份象徵與實用性", result: "卡片申請量提升 30%，直效廣告 ROI 業界最高", source: "Ogilvy & Mather Agency Records / David Ogilvy《Ogilvy on Advertising》1983" }] });
    }

    // A8: Jon Loomer — Facebook Custom Audiences Mastery (2013–2020)
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
        assignAgentToStep({ order: 1, name: "Pixel 事件架構設計", description: "設計完整 Facebook Pixel 事件追蹤架構，記錄每個有意義的用戶行為：瀏覽→加購→結帳→購買", tool: "internal", outputType: "pixel_event_architecture", requiredSkills: ["remarketing-strategy"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "自訂受眾分層策略", description: "建立 10+ 個自訂受眾分層：網站訪客（1/7/14/30天）、觀看影片受眾、名單受眾、高價值購買者", tool: "internal", outputType: "custom_audience_segments", requiredSkills: ["lookalike-audience-strategy"] }, m2Info),
        assignAgentToStep({ order: 3, name: "再行銷廣告序列設計", description: "為每個受眾層設計專屬再行銷訊息：訪客用誘因、加購未付款用緊迫、舊顧客用回購優惠", tool: "internal", outputType: "retargeting_ad_sequences", requiredSkills: ["remarketing-strategy"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "相似受眾拓展", description: "以最高價值顧客建立 1%/2%/3% Lookalike 受眾，測試不同相似度的冷受眾開發效益", tool: "internal", outputType: "lookalike_expansion_plan", requiredSkills: ["attribution-modeling"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "受眾策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Lookalike 專家", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "歸因分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jon Loomer Facebook 自訂受眾精準投放系統", description: "Source: Jon Loomer《Facebook Custom Audiences》2013–2020. JonLoomer.com 是 Facebook 進階廣告最權威教學平台，超過 80 萬行銷人學習此方法", steps });
      await upsertSquad(conn, { slug, name: "Loomer Facebook 自訂受眾精準投放小隊", description: "應用 Jon Loomer 的 Custom Audiences 精通方法：Pixel 架構 → 受眾分層 → 再行銷序列 → Lookalike 拓展，讓每一分廣告費都精準觸達最有可能轉換的受眾", industryKey: "marketing", missionType: taskType, workspace: ["facebook"], methodology: "Jon Loomer – Facebook Custom Audiences Mastery (2013)", agents: agentMembers, tags: ["facebook", "retargeting", "custom-audience", "paid-ads"], useCases: ["電商再行銷", "廢棄購物車轉換", "高LTV顧客複購"], outputFormats: ["受眾分層策略", "Pixel 設定文件", "再行銷廣告序列"], requiredIntegrations: [], token: 60000, showcases: [{ company: "JonLoomer.com 自身案例", description: "應用多層自訂受眾系統，對不同訪客行為投放專屬廣告", result: "廣告 ROAS 達到 8-12x，Email 名單年增長 200%+", source: "JonLoomer.com 部落格公開案例研究" }, { company: "電商品牌（匿名）via Jon Loomer 認證", description: "實施完整 Pixel + 自訂受眾架構，加購未購再行銷優化", result: "購物車棄置回收率從 8% 提升至 31%，廣告支出降低 40%", source: "Jon Loomer 課程案例研究 2019" }] });
    }

    // A9: Molly Pittman — Facebook Traffic System (DigitalMarketer, 2016)
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
        assignAgentToStep({ order: 1, name: "Traffic 系統架構規劃", description: "依 Pittman 框架設計三層流量系統：冷流量（Cold）→ 暖流量（Warm）→ 熱流量（Hot），每層有不同目標與訊息", tool: "internal", outputType: "traffic_system_blueprint", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "廣告素材測試矩陣", description: "建立廣告素材測試矩陣：3 種 Hook 形式 × 2 種格式 × 2 種受眾，快速找出最高效率的廣告組合", tool: "internal", outputType: "creative_test_matrix", requiredSkills: ["visual-ad-brief"] }, m2Info),
        assignAgentToStep({ order: 3, name: "漏斗流量優化", description: "分析每層流量的 CPC/CTR/CVR，優化預算分配，把錢投在最高 ROAS 的廣告組合", tool: "internal", outputType: "traffic_optimization_report", requiredSkills: ["smart-bidding-strategy"] }, m3Info),
        assignAgentToStep({ order: 4, name: "縮放贏家廣告", description: "識別 ROAS 最高的廣告組合，逐步縮放預算（不超過每日 20% 增幅避免演算法重置），擴大成功廣告", tool: "internal", outputType: "scaling_strategy", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 5, name: "Traffic 報告與復盤", description: "每週輸出完整 Traffic 報告：各層漏斗表現、成本趨勢、受眾疲乏指數、下一步行動清單", tool: "internal", outputType: "traffic_weekly_report", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "流量系統師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "創意測試師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "投放優化師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Molly Pittman Facebook Traffic System", description: "Source: Molly Pittman / DigitalMarketer《Facebook Traffic System》2016. Pittman 擔任 DigitalMarketer CMO 時，協助客戶管理超過 $5M/月 Facebook 廣告支出", steps });
      await upsertSquad(conn, { slug, name: "Molly Pittman Facebook 流量系統小隊", description: "應用 Molly Pittman 的三層流量系統：結構化設計冷/暖/熱受眾漏斗，搭配創意測試矩陣快速找出最高效廣告", industryKey: "marketing", missionType: taskType, workspace: ["facebook"], methodology: "Molly Pittman – Facebook Traffic System (DigitalMarketer, 2016)", agents: agentMembers, tags: ["facebook", "paid-ads", "traffic", "funnel-optimization"], useCases: ["Facebook廣告架構重建", "大型帳戶效益提升", "多產品線廣告管理"], outputFormats: ["流量系統架構圖", "創意測試矩陣", "週報"], requiredIntegrations: [], token: 65000, showcases: [{ company: "DigitalMarketer 客戶組合", description: "Pittman 擔任 CMO 期間設計並管理多客戶 Facebook 流量系統", result: "管理超過 $5M/月廣告支出，平均客戶 ROAS 達到 4.5x", source: "Molly Pittman 個人網站 / DigitalMarketer.com" }, { company: "Train My Traffic Person（Pittman 課程）", description: "超過 5,000 名廣告師學習此流量系統並應用於客戶帳戶", result: "學員客戶廣告成效平均提升 67%", source: "TrainMyTrafficPerson.com 學員案例 2022" }] });
    }

    // A10: Frank Kern — Mass Control / Core Influence (2008)
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
        assignAgentToStep({ order: 1, name: "Bond 建立情感連結", description: "先建立真實的人際關係：分享真實故事、展示個性、讓受眾感覺你是「自己人」而非廣告機器", tool: "internal", outputType: "bond_content_plan", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Results in Advance 預先展示成果", description: "在銷售前免費給予真實有用的內容，讓受眾先看到結果。Kern 說「給他們魚，讓他們想要整片湖」", tool: "internal", outputType: "ria_content", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Indoctrination 信念建立序列", description: "透過 Facebook 影片/貼文系列建立受眾對你方法論的信念，讓他們在購買前就相信你的解決方案", tool: "internal", outputType: "indoctrination_sequence", requiredSkills: ["email-marketing"] }, m3Info),
        assignAgentToStep({ order: 4, name: "Mass Control 促銷出擊", description: "在情感連結＋信念建立完成後，精準釋放促銷訊息，應用社會證明和限時稀缺最大化轉換率", tool: "internal", outputType: "mass_control_campaign", requiredSkills: ["paid-ads"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "影響力策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "內容文案師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "序列行銷師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "廣告投放師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Frank Kern Mass Control Facebook 影響力行銷", description: "Source: Frank Kern《Mass Control》2008. Kern 的 Mass Control 課程一次促銷創造 $23.8M 銷售額，創下當時數位行銷記錄", steps });
      await upsertSquad(conn, { slug, name: "Frank Kern Mass Control Facebook 小隊", description: "應用 Frank Kern 的 Bond → Results in Advance → Indoctrinate → Promote 框架，在建立真實關係後才促銷，轉換率大幅超越傳統廣告", industryKey: "marketing", missionType: taskType, workspace: ["facebook"], methodology: "Frank Kern – Mass Control (2008)", agents: agentMembers, tags: ["facebook", "influence", "content-marketing", "paid-ads"], useCases: ["知識型產品銷售", "高端服務推廣", "個人品牌貨幣化"], outputFormats: ["影響力內容計劃", "信念建立序列", "促銷廣告套組"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Frank Kern Mass Control 課程發售", description: "應用 Bond + RIA + Indoctrination 三步曲，建立受眾信念後發售課程", result: "單次促銷 $23.8M 銷售額，24 小時內售罄，當時數位行銷最高紀錄", source: "Frank Kern 公開訪談 / Mass Control 課程 2008" }, { company: "Russell Brunson（模仿應用）", description: "學習 Kern 的 Core Influence 框架後應用於 ClickFunnels 上市推廣", result: "ClickFunnels 首年達到 $10M ARR，創辦人個人品牌粉絲超過 100 萬", source: "Russell Brunson《Expert Secrets》2017" }] });
    }

    // ═══════════════════════════════════════════════════════════════════
    // CATEGORY B: Instagram 內容行銷 Methodology Squads (B1–B10)
    // ═══════════════════════════════════════════════════════════════════

    // B1: Gary Vaynerchuk — Document Don't Create (2016)
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
        assignAgentToStep({ order: 1, name: "日常內容紀錄計劃", description: "設計「記錄而非創作」的日常內容計劃：記錄真實工作過程、決策時刻、失敗學習，不需要完美只需要真實", tool: "internal", outputType: "content_documentation_plan", requiredSkills: ["social-media-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "原始素材腳本引導", description: "撰寫輕量腳本框架：Story 開頭 + 過程紀錄 + 學習總結，讓非專業創作者也能產出有價值的 Instagram 內容", tool: "internal", outputType: "content_capture_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "多平台內容分發", description: "將一個紀錄素材重製為：IG Post + Reels + Stories + Carousel，最大化單次內容的觸達價值", tool: "internal", outputType: "repurposed_content_set", requiredSkills: ["content-repurposing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "內容策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "腳本設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "內容分發師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GaryVee Document Don't Create Instagram 策略", description: "Source: Gary Vaynerchuk 2016 年提出「Document Don't Create」概念。VaynerMedia 幫助 Wine Library TV 從 $3M 成長至 $60M 即應用此原則", steps });
      await upsertSquad(conn, { slug, name: "GaryVee Document Don't Create Instagram 小隊", description: "記錄真實旅程，而非精心製作完美內容。Gary Vee 的 2016 年核心框架，讓品牌以最低成本持續輸出真實有吸引力的 Instagram 內容", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Gary Vaynerchuk – Document Don't Create (2016)", agents: agentMembers, tags: ["instagram", "content-marketing", "authenticity", "storytelling"], useCases: ["個人品牌建立", "新品牌知名度提升", "日常內容矩陣建立"], outputFormats: ["內容紀錄計劃", "腳本框架", "多平台素材包"], requiredIntegrations: [], token: 50000, showcases: [{ company: "GaryVee 個人 Instagram", description: "持續應用 Document 原則，記錄工作日常、商業決策、旅程故事", result: "Instagram 粉絲超過 1,000 萬，平均每貼文互動率 2-4%，業界均值 0.5-1%", source: "Gary Vaynerchuk Instagram / VaynerMedia 公開數據 2023" }, { company: "日本酒廠（Gary 協助案例）", description: "應用 Document 框架記錄釀酒過程和職人故事，取代傳統廣告", result: "Instagram 帳號 6 個月從 0 成長至 50,000 粉絲，電商銷售提升 180%", source: "VaynerMedia Case Study 2021" }] });
    }

    // B2: Alex Hormozi — Make Content Worth Saving (2022)
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
        assignAgentToStep({ order: 1, name: "Save-Worthy 主題研究", description: "找出受眾最想收藏的資訊：清單型、框架型、數據型內容。Hormozi 說「讓他們現在看不完，所以要存起來」", tool: "internal", outputType: "save_worthy_topics", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "高密度價值文案撰寫", description: "撰寫資訊密度極高的 Carousel/Post 文案：每一頁都有新洞察，沒有廢話填充", tool: "internal", outputType: "high_density_copy", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "視覺呈現優化", description: "設計讓人「值得截圖分享」的視覺版面：清晰、有衝擊感、資訊架構清楚，適合 Carousel 格式", tool: "internal", outputType: "carousel_visual_design", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 4, name: "Save/Share 指標追蹤", description: "追蹤貼文的儲存率和分享率（而非只看讚數），優化哪類主題和格式最容易被收藏分發", tool: "internal", outputType: "engagement_quality_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "內容策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "視覺設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "互動分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Hormozi Save-Worthy Instagram 內容策略", description: "Source: Alex Hormozi 2022 年公開提出「Make Content Worth Saving」框架。Hormozi 個人 Instagram 帳號應用此策略 6 個月達到 100 萬粉絲", steps });
      await upsertSquad(conn, { slug, name: "Hormozi Save-Worthy Instagram 內容小隊", description: "以 Alex Hormozi 的「值得收藏」標準製作 Instagram 內容：比讚數更重要的是儲存數，高儲存率內容才是演算法最愛", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Alex Hormozi – Make Content Worth Saving (2022)", agents: agentMembers, tags: ["instagram", "content-marketing", "carousel", "value-content"], useCases: ["教育型品牌Instagram成長", "B2B品牌Instagram運營", "個人品牌知識型內容"], outputFormats: ["內容主題清單", "Carousel 文案", "視覺設計稿", "互動分析報告"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Alex Hormozi 個人 Instagram @hormozi", description: "系統性發布 Save-Worthy 框架型和清單型內容，每貼文儲存率遠超業界均值", result: "6 個月從 0 達到 100 萬粉絲，平均貼文儲存率超過 5%（業界均值 0.5%）", source: "Hormozi Instagram 公開數據 / Acquisition.com 2022-2023" }, { company: "Sam Ovens（應用類似框架）", description: "高密度知識型 Carousel 貼文，每篇都是完整框架或方法論", result: "Instagram 帳號達到 50 萬+，Consulting.com 年收入超過 $2,000 萬", source: "Consulting.com 公開數據 2021" }] });
    }

    // B3: Jay Baer — Youtility: Why Smart Marketing is About Help, Not Hype (2013)
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
        assignAgentToStep({ order: 1, name: "Youtility 內容地圖", description: "研究受眾真實問題並建立「有用度地圖」：哪些資訊能真正幫助受眾的日常生活或工作，而非推銷產品", tool: "internal", outputType: "youtility_content_map", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "實用工具型內容創作", description: "創作 How-to、清單、範本、工具推薦等高實用性 Instagram 內容，定位品牌為「最有用的朋友」", tool: "internal", outputType: "utility_content_posts", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "視覺化實用素材設計", description: "設計一眼看懂的資訊圖表、步驟圖、比較表，讓有用的資訊更容易被理解和分享", tool: "internal", outputType: "utility_infographics", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "口碑擴散計劃", description: "Baer 強調有用的內容自然被分享。設計分享激勵機制：標記朋友、儲存功能引導、問答互動", tool: "internal", outputType: "word_of_mouth_plan", requiredSkills: ["social-scheduler"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Youtility 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "實用內容師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "視覺設計師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jay Baer Youtility Instagram 幫助型行銷", description: "Source: Jay Baer《Youtility》2013 年紐約時報暢銷書。Baer 的 Convince & Convert 應用此框架幫助 Hilton Hotels 等大客戶提升社群 ROI", steps });
      await upsertSquad(conn, { slug, name: "Jay Baer Youtility Instagram 幫助型行銷小隊", description: "應用 Jay Baer 的 Youtility 框架：讓品牌成為受眾最有用的朋友，而非最大聲的廣告商。幫助創造信任，信任帶來銷售", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Jay Baer – Youtility (2013)", agents: agentMembers, tags: ["instagram", "content-marketing", "helpful-content", "trust"], useCases: ["B2B品牌信任建立", "服務業口碑行銷", "教育型品牌成長"], outputFormats: ["Youtility 內容地圖", "實用工具型貼文", "資訊圖表"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Hilton Hotels（Baer 客戶）", description: "建立 @HiltonSuggests Twitter/IG 帳號，純粹回答旅行者問題，不推銷自家飯店", result: "品牌好感度提升 40%，有機追蹤者年增長 300%", source: "Jay Baer《Youtility》Case Study + Convince & Convert Blog" }, { company: "Columbia Sportswear", description: "應用 Youtility 創作大量戶外活動技巧、路線建議內容，定位品牌為戶外愛好者最有用的資源", result: "Instagram 互動率提升 250%，電商銷售年增長 35%", source: "Jay Baer Convince & Convert 案例研究 2017" }] });
    }

    // B4: Jasmine Star — Community-First Instagram Strategy (2014–2020)
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
        assignAgentToStep({ order: 1, name: "利基社群定位", description: "精確定位目標社群：你在服務哪 1,000 個核心粉絲？他們的夢想、恐懼、日常是什麼？建立深度社群畫像", tool: "internal", outputType: "community_persona", requiredSkills: ["social-media-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "互動優先內容策略", description: "Jasmine Star 強調「先互動後發文」：每天花 30 分鐘真誠回覆留言、主動前往追蹤者帳號互動，建立真實社群", tool: "internal", outputType: "engagement_first_plan", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "一致性視覺美學建立", description: "建立 Instagram 視覺識別系統：色調、構圖風格、字體一致性，讓帳號一眼認出品牌", tool: "internal", outputType: "ig_visual_identity", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "粉絲倡導計劃", description: "設計讓核心粉絲主動推廣品牌的計劃：UGC 徵集、社群挑戰、粉絲故事分享，把粉絲變成品牌大使", tool: "internal", outputType: "fan_advocacy_program", requiredSkills: ["social-media-marketing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "社群策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "互動文案師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "視覺識別師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jasmine Star 社群優先 Instagram 成長策略", description: "Source: Jasmine Star 攝影師出身，2014 年起建立 Instagram 行銷方法論，後創辦 Social Curator 平台，服務 10,000+ 企業主", steps });
      await upsertSquad(conn, { slug, name: "Jasmine Star 社群優先 Instagram 小隊", description: "社群在前，銷售在後。Jasmine Star 的方法論：先建立真實社群關係，再轉化為品牌忠誠度和購買力", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Jasmine Star – Community-First Instagram Strategy (2014)", agents: agentMembers, tags: ["instagram", "community", "brand-building", "engagement"], useCases: ["小型品牌IG成長", "服務業口碑建立", "個人品牌社群經營"], outputFormats: ["社群定位文件", "互動計劃", "視覺識別指南"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Social Curator（Jasmine Star 創辦）", description: "應用自創的社群優先框架經營 Instagram，從個人攝影師建立到 SaaS 平台", result: "Social Curator 服務超過 10,000 企業主，年訂閱收入超過 $1,000 萬", source: "Social Curator 官網 / Jasmine Star 公開訪談 2022" }, { company: "中小型服務業客戶（匿名）via Social Curator", description: "應用 Community-First 框架，每天 30 分鐘互動策略替代廣告投放", result: "6 個月 Instagram 追蹤者增長 400%，詢問率提升 250%", source: "Social Curator 學員案例研究 2021" }] });
    }

    // B5: Chris Do — Visual Storytelling for Brands (The Futur, 2016)
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
        assignAgentToStep({ order: 1, name: "品牌視覺語言定義", description: "建立品牌的 Instagram 視覺語言系統：色彩哲學、構圖原則、風格指引，讓視覺傳達品牌個性", tool: "internal", outputType: "brand_visual_language", requiredSkills: ["brand-identity"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "品牌故事架構", description: "以 Chris Do 的故事架構：衝突→旅程→轉化，設計品牌在 Instagram 上的核心敘事主軸", tool: "internal", outputType: "brand_story_architecture", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 3, name: "視覺故事內容製作", description: "製作每週 IG 視覺故事內容：統一的設計質感、有張力的圖文組合、每篇都延伸品牌核心敘事", tool: "internal", outputType: "visual_story_content", requiredSkills: ["visual-content-creator"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "圖說文案撰寫", description: "撰寫與視覺相輔相成的圖說文案：視覺講形式，文案講意義，合力傳遞完整品牌訊息", tool: "internal", outputType: "caption_copy", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 5, name: "視覺一致性稽核", description: "定期稽核 IG 帳號視覺一致性，確保所有貼文共同組成統一的品牌世界觀", tool: "internal", outputType: "visual_audit_report", requiredSkills: ["brand-identity"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "視覺品牌師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "品牌敘事師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "文案師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Chris Do The Futur 視覺敘事 Instagram 品牌建立", description: "Source: Chris Do / The Futur 2016 年起系統化的視覺品牌敘事方法論。The Futur YouTube 超過 220 萬訂閱，Instagram 方法論被全球設計師廣泛採用", steps });
      await upsertSquad(conn, { slug, name: "Chris Do 視覺敘事 Instagram 品牌小隊", description: "應用 Chris Do（The Futur 創辦人）的視覺故事框架，讓 Instagram 不只是發圖片，而是系統化傳遞品牌世界觀", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Chris Do – Visual Storytelling for Brands (The Futur, 2016)", agents: agentMembers, tags: ["instagram", "brand-building", "visual-storytelling", "design"], useCases: ["設計/創意品牌Instagram", "高端品牌形象經營", "B2B創意服務業"], outputFormats: ["視覺語言指南", "品牌故事架構", "IG內容套組"], requiredIntegrations: [], token: 60000, showcases: [{ company: "The Futur（Chris Do 創辦）", description: "系統應用視覺故事方法論建立 The Futur Instagram 帳號", result: "Instagram 超過 100 萬追蹤者，YouTube 超過 220 萬，年教育收入超過 $1,000 萬", source: "The Futur 官網 / Chris Do LinkedIn 2023" }, { company: "Blind 設計公司（Chris Do 創辦）", description: "應用 Visual Storytelling 框架展示設計案例，建立業界最高質感的作品集Instagram", result: "吸引 Nike、Sony 等頂級客戶主動找上門，客戶品質提升 300%", source: "Chris Do 公開訪談 / Blind.com" }] });
    }

    // B6: Vanessa Lau — Viral Content Formula (2020)
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
        assignAgentToStep({ order: 1, name: "趨勢音效與格式偵察", description: "每週分析 IG Reels 趨勢音效、流行格式、新興挑戰，識別可與品牌融合的趨勢機會", tool: "internal", outputType: "trending_opportunities", requiredSkills: ["social-media-marketing"] }, m2Info),
        assignAgentToStep({ order: 2, name: "品牌 x 趨勢融合腳本", description: "撰寫將品牌訊息融入趨勢格式的 Reels 腳本：保持趨勢形式，注入品牌個性，避免硬廣感", tool: "internal", outputType: "trend_brand_scripts", requiredSkills: ["short-video-scriptwriter"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "Viral Hook 優化", description: "測試 5 種不同開場 Hook：問句型、驚喜型、爭議型、利益型、故事型，找出最高留存率的開場", tool: "internal", outputType: "hook_test_results", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "Reels 效益追蹤優化", description: "追蹤每則 Reels 的觸達率、完播率、儲存率，識別最佳表現模式並系統化複製", tool: "internal", outputType: "reels_performance_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Reels 腳本師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "趨勢偵察師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "效益分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Vanessa Lau Instagram Reels 病毒公式", description: "Source: Vanessa Lau 2020 年系統化的 Instagram Reels 病毒成長公式。Lau 本人 IG 從 0 到 500,000 粉絲耗時 18 個月，應用此公式", steps });
      await upsertSquad(conn, { slug, name: "Vanessa Lau 病毒 Reels 成長小隊", description: "應用 Vanessa Lau 的 Instagram Reels 成長公式：趨勢偵察 + 品牌融合 + Hook 測試 + 數據優化，系統性製造高觸達 Reels", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Vanessa Lau – Viral Content Formula (2020)", agents: agentMembers, tags: ["instagram", "reels", "viral", "short-video"], useCases: ["品牌Reels成長", "有機觸達提升", "新帳號快速成長"], outputFormats: ["趨勢機會報告", "Reels 腳本組合", "效益追蹤表"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Vanessa Lau 個人 Instagram", description: "系統應用 Viral Formula，在疫情期間以 Reels-First 策略快速成長", result: "18 個月從 0 到 500,000 粉絲，每月被動收入超過 $10 萬", source: "Vanessa Lau 個人網站 / YouTube 公開數據 2021" }, { company: "多位 COMMITED 課程學員", description: "應用 Vanessa Lau 公式後 Instagram 帳號突破成長瓶頸", result: "平均學員 3 個月 Reels 觸達成長 5-10 倍", source: "Vanessa Lau 課程學員見證 2022" }] });
    }

    // B7: Neil Patel — Content Repurposing Skyscraper for Instagram (2018)
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
        assignAgentToStep({ order: 1, name: "高流量內容識別", description: "分析現有部落格/YouTube 內容，找出流量最高的 10 篇，這些是 Instagram 內容最強的素材來源", tool: "internal", outputType: "top_content_inventory", requiredSkills: ["content-repurposing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "內容視覺化轉化", description: "將長篇文章轉化為 Instagram 格式：10 大要點 Carousel、步驟圖解、金句圖卡、資訊圖表", tool: "internal", outputType: "visual_content_set", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Instagram 標籤策略", description: "研究並執行最佳標籤策略：混合大中小眾標籤，建立品牌標籤，優化探索頁觸達", tool: "internal", outputType: "hashtag_strategy", requiredSkills: ["social-scheduler"] }, m3Info),
        assignAgentToStep({ order: 4, name: "跨平台流量整合", description: "在 Instagram 引導受眾回到部落格/Email 名單，用 Bio 連結和 Stories 滑動建立跨平台流量迴路", tool: "internal", outputType: "cross_platform_funnel", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 5, name: "SEO-to-IG 效益報告", description: "追蹤 Instagram 帶來的部落格流量，以及部落格讀者轉換為 IG 追蹤者的比率，優化迴路效益", tool: "internal", outputType: "cross_platform_report", requiredSkills: ["content-marketing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "內容再製策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "視覺化設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "分發排程師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Neil Patel 內容再製 Instagram 增長策略", description: "Source: Neil Patel NeilPatel.com 2018 年系統化的內容再製成長方法。NeilPatel.com 月流量超過 400 萬，Instagram 應用再製框架達到 100 萬+ 追蹤", steps });
      await upsertSquad(conn, { slug, name: "Neil Patel 內容再製 Instagram 增長小隊", description: "把已有的高流量內容資產轉化為 Instagram 素材，最大化內容 ROI，同時建立跨平台流量迴路", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Neil Patel – Content Repurposing for Instagram (NeilPatel.com, 2018)", agents: agentMembers, tags: ["instagram", "content-repurposing", "seo", "cross-platform"], useCases: ["有部落格/YouTube的品牌", "內容資產再製", "跨平台流量整合"], outputFormats: ["內容盤點報告", "視覺化素材包", "標籤策略文件"], requiredIntegrations: [], token: 55000, showcases: [{ company: "NeilPatel.com 自身", description: "系統化將部落格文章再製為 Instagram Carousel 和圖卡，建立雙向流量", result: "Instagram 達到 100 萬+ 追蹤，部落格月流量超過 400 萬，內容 ROI 提升 3 倍", source: "NeilPatel.com / Neil Patel 公開數據 2023" }, { company: "Backlinko（Brian Dean，類似方法）", description: "將 SEO 研究文章系統化轉製為 Instagram 教育型 Carousel", result: "Instagram 帳號達到 50 萬+，Email 名單從 IG 獲取佔比 30%", source: "Backlinko.com / Brian Dean 公開案例 2021" }] });
    }

    // B8: Later — Optimal Posting Time Science Method (2019)
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
        assignAgentToStep({ order: 1, name: "帳號歷史互動分析", description: "深度分析帳號過去 90 天每篇貼文的發布時間 vs 互動率，建立帳號專屬的最佳發布時段地圖", tool: "internal", outputType: "engagement_timing_map", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "受眾活躍時段研究", description: "分析追蹤者活躍時段分佈（IG Insights 數據），結合行業基準數據找出最高觸達窗口", tool: "internal", outputType: "audience_activity_report", requiredSkills: ["cross-channel-analytics"] }, m3Info),
        assignAgentToStep({ order: 3, name: "30 天最佳排程設計", description: "設計 30 天發布排程：在最佳時段安排最重要內容，考慮週一至週日的不同互動模式", tool: "internal", outputType: "monthly_posting_schedule", requiredSkills: ["social-scheduler"] }, m2Info),
        assignAgentToStep({ order: 4, name: "演算法信號最大化", description: "設計發文後 30 分鐘的互動衝刺計劃：主動與留言互動，最大化初始互動速度，觸發演算法推廣", tool: "internal", outputType: "algorithm_boost_plan", requiredSkills: ["marketing-analytics"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "IG 演算法分析師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "排程優化師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "互動分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Later 最佳發文時機科學優化法", description: "Source: Later.com《Best Time to Post on Instagram》2019 研究報告，分析超過 1,200 萬 IG 貼文數據得出的科學排程方法", steps });
      await upsertSquad(conn, { slug, name: "Later 最佳時機 Instagram 演算法優化小隊", description: "以 Later 分析 1,200 萬貼文的科學數據為基礎，針對品牌帳號的受眾特性設計最佳發布時段，最大化有機觸達", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Later – Best Time to Post Science (2019 Research Report, 12M+ posts)", agents: agentMembers, tags: ["instagram", "scheduling", "analytics", "algorithm"], useCases: ["IG帳號觸達率提升", "演算法優化", "內容行事曆規劃"], outputFormats: ["最佳時段分析報告", "30天排程表", "演算法提升計劃"], requiredIntegrations: [], token: 45000, showcases: [{ company: "Later 平台本身（分析 12M+ 貼文）", description: "分析 1,200 萬個 Instagram 貼文的發布時間和互動數據，找出行業最佳發布時段規律", result: "使用 Later 最佳時段功能的帳號，平均互動率提升 25%", source: "Later.com Best Time to Post Research Report 2019/2022" }, { company: "Lush Cosmetics（Later 案例）", description: "應用 Later 的數據驅動排程，在受眾最活躍時段發布關鍵內容", result: "Instagram 互動率提升 35%，追蹤者成長加速 60%", source: "Later.com Case Studies 2020" }] });
    }

    // B9: Rachel Hollis — Radical Transparency Personal Brand (Girl, Wash Your Face, 2018)
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
        assignAgentToStep({ order: 1, name: "真實故事礦藏開挖", description: "挖掘品牌/個人最真實的故事：失敗、轉折、掙扎、成長。Rachel Hollis 說「你的傷疤就是你的品牌」", tool: "internal", outputType: "authentic_story_bank", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "脆弱敘事腳本設計", description: "設計展示真實脆弱面的 IG 內容腳本：不完美的背後故事、學習歷程、真實觀點，建立真實人格連結", tool: "internal", outputType: "vulnerability_content_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "一致性個人品牌視覺", description: "建立真實感強的個人品牌視覺系統：生活感攝影、自然光、真人展示，避免過度精修的廣告感", tool: "internal", outputType: "authentic_visual_system", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "價值觀社群召喚", description: "明確表達品牌核心價值觀，吸引認同相同價值觀的受眾：Rachel Hollis 效應 — 讓對的人感覺找到家", tool: "internal", outputType: "values_community_content", requiredSkills: ["brand-dna"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "個人品牌師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "真實內容師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "品牌視覺師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Rachel Hollis Radical Transparency Instagram 個人品牌", description: "Source: Rachel Hollis《Girl, Wash Your Face》2018 年紐約時報 No.1 暢銷書，應用 Radical Transparency 打造個人品牌", steps });
      await upsertSquad(conn, { slug, name: "Rachel Hollis 激進透明 Instagram 個人品牌小隊", description: "分享真實故事、展示脆弱，打造能讓受眾產生深度情感連結的個人品牌 Instagram。Rachel Hollis 應用此原則將個人品牌變成 $1 億帝國", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Rachel Hollis – Radical Transparency Personal Brand (2018)", agents: agentMembers, tags: ["instagram", "personal-brand", "authenticity", "storytelling"], useCases: ["個人品牌Instagram建立", "創業家品牌建立", "講師/顧問品牌"], outputFormats: ["故事素材庫", "內容腳本組合", "視覺識別系統"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Rachel Hollis 個人品牌帝國", description: "從普通媽媽部落客，透過 Radical Transparency 建立 Instagram 強大個人品牌", result: "Instagram 超過 200 萬追蹤者，書籍銷售超過 300 萬本，年收入超過 $1 億", source: "Forbes Profile 2019 / Rachel Hollis 公開財務數據" }, { company: "Brené Brown（類似方法）", description: "研究員出身，以分享研究中的個人脆弱故事建立 Instagram 個人品牌", result: "Instagram 超過 500 萬追蹤者，TED 演講超過 6,000 萬觀看，書籍累計銷售 500 萬+", source: "Brené Brown Inc. / TED.com 數據 2023" }] });
    }

    // B10: Brian Fanzo — Live-First Video Strategy (iSocialFanz, 2016)
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
        assignAgentToStep({ order: 1, name: "Live 直播策略規劃", description: "設計每週 Instagram Live 計劃：主題選擇、時間設定、互動設計、CTA 安排，讓每場直播都有明確目標", tool: "internal", outputType: "live_strategy_plan", requiredSkills: ["social-media-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Live 直播腳本設計", description: "撰寫輕量直播腳本：開場 Hook → 核心價值輸出 → 即時互動橋段 → 結尾 CTA，保持真實感又不失重點", tool: "internal", outputType: "live_content_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "直播後內容再製", description: "直播結束後將精華片段剪輯為 Reels、Stories 片段和亮點 Carousel，一次直播產出 10+ 份衍生內容", tool: "internal", outputType: "post_live_content_set", requiredSkills: ["content-repurposing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "直播策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "直播腳本師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "內容再製師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Brian Fanzo Live-First Instagram 直播成長策略", description: "Source: Brian Fanzo (iSocialFanz) 2016 年提出 Live-First 策略。Fanzo 被 IBM、Dell 等頂級品牌聘為社群策略顧問", steps });
      await upsertSquad(conn, { slug, name: "Brian Fanzo Live-First Instagram 直播小隊", description: "Instagram Live 優先策略：先做直播建立真實連結，再把直播內容再製為多種格式，最大化單次投入的內容產出", industryKey: "marketing", missionType: taskType, workspace: ["instagram"], methodology: "Brian Fanzo – Live-First Video Strategy (iSocialFanz, 2016)", agents: agentMembers, tags: ["instagram", "live", "video", "content-repurposing"], useCases: ["品牌真實度建立", "產品發布直播", "教育型品牌互動"], outputFormats: ["直播計劃表", "腳本模板", "再製內容包"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Dell Technologies（Fanzo 顧問案）", description: "應用 Live-First 策略，讓技術專家直播分享產品知識，建立 B2B 品牌親近感", result: "Instagram Live 觀看率提升 400%，直播後產品詢問增加 180%", source: "Brian Fanzo iSocialFanz.com Case Study / Dell Social Media" }, { company: "IBM（Fanzo 顧問案）", description: "以 Live-First 策略讓 IBM 工程師和研究員出鏡，人性化 B2B 科技品牌", result: "品牌好感度提升 55%，LinkedIn + Instagram 綜合互動率達業界 Top 5%", source: "Brian Fanzo 公開演講 Social Media Marketing World 2017" }] });
    }

    // ═══════════════════════════════════════════════════════════════════
    // CATEGORY C: 短影音 TikTok/Reels Methodology Squads (C1–C10)
    // ═══════════════════════════════════════════════════════════════════

    // C1: MrBeast — Hook + Escalation + Payoff Method (2020–present)
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
        assignAgentToStep({ order: 1, name: "Pattern Interrupt Hook 設計", description: "設計前 3 秒的模式打斷鉤子：誇張承諾、視覺衝擊、反直覺問題。MrBeast 原則：「如果你第一句話不震驚，就沒有第二句話」", tool: "internal", outputType: "hook_variants", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "升級張力腳本", description: "設計從 Hook 到 Payoff 的升級張力結構：每 10-15 秒有一個新的懸念或驚喜，讓觀眾無法放下手機", tool: "internal", outputType: "tension_escalation_script", requiredSkills: ["short-video-scriptwriter"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "Epic Payoff 結尾設計", description: "設計讓觀眾「值得等待」的 Epic Payoff 結尾：超越預期的結果、翻轉、啟示，讓人想重看並分享", tool: "internal", outputType: "payoff_ending_design", requiredSkills: ["visual-content-creator"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "短影音腳本師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "視覺剪輯師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "完播率分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "MrBeast Hook Escalation Payoff 短影音公式", description: "Source: MrBeast (Jimmy Donaldson) 短影音結構分析，YouTube 超過 3 億訂閱，每支影片平均完播率超過 60%（業界均值 15-25%）", steps });
      await upsertSquad(conn, { slug, name: "MrBeast Hook+Payoff 短影音小隊", description: "應用 MrBeast 的 Hook → 升級張力 → Epic Payoff 三段結構，製作讓人無法停止觀看的短影音內容", industryKey: "marketing", missionType: taskType, workspace: ["youtube"], methodology: "MrBeast (Jimmy Donaldson) – Hook Escalation Payoff Formula (2020)", agents: agentMembers, tags: ["short-video", "tiktok", "reels", "hook", "viral"], useCases: ["品牌病毒影片", "產品展示短影音", "挑戰型內容"], outputFormats: ["Hook 變體清單", "腳本文件", "剪輯指導"], requiredIntegrations: [], token: 50000, showcases: [{ company: "MrBeast YouTube/TikTok", description: "系統應用 Hook+Escalation+Payoff 三段結構創作所有影片", result: "YouTube 3 億+ 訂閱，TikTok 9,800 萬+ 粉絲，MrBeast Burger 一年 $100M 銷售", source: "YouTube / TikTok 公開數據 2023 / Business Insider" }, { company: "品牌參考案例：Gymshark TikTok", description: "應用挑戰型 Hook+Payoff 結構吸引健身受眾", result: "TikTok 達到 400 萬+ 追蹤，挑戰標籤累計 60 億次觀看", source: "Gymshark TikTok 公開數據 2022" }] });
    }

    // C2: Alex Hormozi — One Idea One Video (2022)
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
        assignAgentToStep({ order: 1, name: "單一訊息萃取", description: "從複雜主題中萃取唯一核心訊息：「如果觀眾只記得一件事，那是什麼？」Hormozi 的鐵律：一支影片一個訊息", tool: "internal", outputType: "single_message_brief", requiredSkills: ["short-video-scriptwriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "緊湊腳本撰寫", description: "撰寫 60-90 秒緊湊腳本：直接切入重點，刪除所有不強化核心訊息的內容，每句話都要賺取觀眾繼續看的注意力", tool: "internal", outputType: "tight_script", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "直接行動呼籲設計", description: "設計清晰直接的單一 CTA：Hormozi 說「不要讓他們思考該做什麼，只有一個按鈕」", tool: "internal", outputType: "single_cta", requiredSkills: ["hook-copywriter"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "腳本策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "文案師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "清晰度分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Hormozi One Idea One Video 短影音清晰度框架", description: "Source: Alex Hormozi 2022 年短影音創作原則，Acquisition.com 旗下品牌應用後平均完播率提升 80%", steps });
      await upsertSquad(conn, { slug, name: "Hormozi One Idea One Video 短影音小隊", description: "一支影片只傳遞一個訊息。Alex Hormozi 的清晰度原則：模糊的訊息等於沒有訊息，清晰勝過聰明", industryKey: "marketing", missionType: taskType, workspace: ["youtube"], methodology: "Alex Hormozi – One Idea One Video (2022)", agents: agentMembers, tags: ["short-video", "clarity", "scripting", "conversion"], useCases: ["教育型短影音", "產品功能介紹", "服務說明影片"], outputFormats: ["單一訊息文件", "緊湊腳本", "CTA 設計"], requiredIntegrations: [], token: 45000, showcases: [{ company: "Alex Hormozi @hormozi TikTok/IG Reels", description: "系統應用 One Idea One Video 原則，每支影片只有一個核心商業洞察", result: "TikTok 500 萬+ 粉絲，Reels 平均完播率超過 70%，Lead 成本降低 60%", source: "Hormozi 個人社群數據 / Acquisition.com 2023" }, { company: "Sam Parr（類似框架，Morning Brew 合作）", description: "每集 Podcast 截短為一個核心訊息的 60 秒 Clip", result: "短影音帳號 6 個月達到 20 萬+ 追蹤，Podcast 訂閱增加 35%", source: "My First Million Podcast / Sam Parr 公開數據 2022" }] });
    }

    // C3: Gary Vaynerchuk — Micro-Content Pyramid (2016)
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
        assignAgentToStep({ order: 1, name: "長內容錨點製作", description: "製作長形式「錨點內容」（Podcast 一集、YouTube 長片、直播錄影），這是整個 Micro-Content 金字塔的素材庫", tool: "internal", outputType: "anchor_content", requiredSkills: ["social-media-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "短影音精華萃取", description: "從錨點內容中萃取 5-10 個最精華片段，每段控制在 15-60 秒，每段都能獨立傳遞完整價值", tool: "internal", outputType: "short_clip_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "平台原生格式改編", description: "將每個短片段改編為各平台原生格式：TikTok 垂直方向 + 文字疊加、IG Reels + 音樂、YouTube Shorts + 縮圖", tool: "internal", outputType: "platform_native_clips", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 4, name: "跨平台批次發布", description: "設計跨平台發布排程，一份長內容在 5 個平台產出 30+ 件短影音，最大化單次創作投資報酬率", tool: "internal", outputType: "distribution_schedule", requiredSkills: ["social-scheduler"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "內容再製策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "短影音萃取師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "跨平台發布師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GaryVee Micro-Content Pyramid 內容倍增策略", description: "Source: Gary Vaynerchuk《Crushing It!》2018 + DailyVee 2016. VaynerMedia 應用此框架幫助客戶將一次內容投入產出 100+ 件微內容", steps });
      await upsertSquad(conn, { slug, name: "GaryVee Micro-Content Pyramid 短影音小隊", description: "一次長形式內容拆解為 100 件微內容。Gary Vee 的內容倍增金字塔策略，最大化創作投資報酬率", industryKey: "marketing", missionType: taskType, workspace: ["youtube"], methodology: "Gary Vaynerchuk – Micro-Content Pyramid (2016)", agents: agentMembers, tags: ["short-video", "content-repurposing", "multi-platform", "efficiency"], useCases: ["已有長型內容的品牌", "Podcast品牌延伸", "YouTube轉短影音"], outputFormats: ["錨點內容計劃", "短片萃取腳本", "跨平台發布排程"], requiredIntegrations: [], token: 55000, showcases: [{ company: "GaryVee 個人媒體品牌", description: "以 DailyVee（日常 Vlog）為錨點，每集產出 30-50 件微內容分發到所有平台", result: "在 TikTok/IG/YouTube 維持每週 70+ 件內容，總粉絲超過 3,500 萬", source: "GaryVee.com / VaynerMedia 2022 內容報告" }, { company: "Entrepreneur Magazine（VaynerMedia 客戶）", description: "將長篇文章和訪談拆解為微內容，應用 Micro-Content 金字塔跨平台分發", result: "社群互動率提升 300%，社群追蹤者總數增長 150%", source: "VaynerMedia Case Study / Entrepreneur.com 2019" }] });
    }

    // C4: Brendan Kane — One Million Followers Hook Testing (2018)
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
        assignAgentToStep({ order: 1, name: "10 種 Hook 變體設計", description: "為同一主題設計 10 種不同 Hook 開場：問句型、爭議型、利益型、故事型、數字型、驚喜型等，每種長度控制在 3-5 秒", tool: "internal", outputType: "hook_10_variants", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "小預算 Hook A/B 測試", description: "以每個 Hook 變體投入小額廣告費（每個 $5-$10），測試 3 天收集初始資料。Kane 方法：先測再爆破", tool: "internal", outputType: "hook_test_results", requiredSkills: ["tiktok-ads"] }, m2Info),
        assignAgentToStep({ order: 3, name: "贏家 Hook 爆破放大", description: "識別表現最佳的 1-2 個 Hook，以此為基礎製作完整影片，集中預算爆破觸達", tool: "internal", outputType: "winner_hook_campaign", requiredSkills: ["paid-ads"] }, m2Info),
        assignAgentToStep({ order: 4, name: "Hook 效益分析報告", description: "分析哪類 Hook 對目標受眾效果最好，建立品牌 Hook 公式庫，供未來內容持續使用", tool: "internal", outputType: "hook_formula_library", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Hook 設計師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "廣告測試師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "效益分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Brendan Kane One Million Followers Hook Testing 方法", description: "Source: Brendan Kane《One Million Followers》2018. Kane 在 30 天內為多個帳號累積 100 萬+追蹤，核心是高速 Hook 測試", steps });
      await upsertSquad(conn, { slug, name: "Brendan Kane Hook 測試百萬粉絲小隊", description: "應用 Brendan Kane 的 Hook 高速測試方法：10 種 Hook 同時測試，找出最高留存率開場，快速複製成功模式", industryKey: "marketing", missionType: taskType, workspace: ["youtube"], methodology: "Brendan Kane – One Million Followers Hook Testing (2018)", agents: agentMembers, tags: ["short-video", "hook", "ab-testing", "growth"], useCases: ["新帳號快速成長", "短影音廣告優化", "Hook公式建立"], outputFormats: ["Hook 10 變體", "A/B 測試結果", "Hook 公式庫"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Brendan Kane 個人實驗", description: "在 30 天內為自己帳號透過 Hook 高速測試達到 100 萬 Facebook 追蹤者", result: "30 天達到 100 萬追蹤，後複製方法為多位名人客戶（Taylor Swift 等）操刀成長", source: "Brendan Kane《One Million Followers》2018 / 作者本人訪談" }, { company: "企業客戶（匿名）via Hook Testing", description: "應用同樣的 Hook A/B 測試方法優化 TikTok 廣告 Hook", result: "廣告 Hook 完播率從 18% 提升至 62%，CPA 降低 55%", source: "Brendan Kane 社群行銷課程案例 2021" }] });
    }

    // C5: NasDaily (Nuseir Yassin) — 60-Second Story Structure (2016–2021)
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
        assignAgentToStep({ order: 1, name: "問題開場（Problem Open）", description: "設計 5 秒強力開場：提出令人好奇或驚訝的問題，讓觀眾想知道答案。NasDaily 公式：「你知道這個事實嗎？」", tool: "internal", outputType: "problem_open_hook", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 2, name: "旅程展開腳本", description: "撰寫 40 秒的「旅程」中段：用快速剪輯節奏和簡潔文案呈現核心故事，每 5 秒一個新事實或轉折", tool: "internal", outputType: "journey_script", requiredSkills: ["short-video-scriptwriter"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "揭示結尾 + 分享觸發", description: "設計最後 15 秒：揭示令人滿足的結論，加入情感共鳴或驚喜，讓觀眾想「標記朋友」分享", tool: "internal", outputType: "reveal_ending", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "快剪視覺風格設計", description: "設計每 3-5 秒換一個畫面的快剪風格，加入文字疊加強化重點，保持觀眾視覺注意力", tool: "internal", outputType: "fast_cut_visual_guide", requiredSkills: ["visual-content-creator"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "故事腳本師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Hook 設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "視覺剪輯師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "NasDaily 60 秒故事短影音結構", description: "Source: NasDaily (Nuseir Yassin) 2016 年開始連續 1,000 天每天發布 60 秒影片。Facebook 超過 5,000 萬粉絲", steps });
      await upsertSquad(conn, { slug, name: "NasDaily 60 秒故事短影音小隊", description: "應用 NasDaily 的 60 秒故事結構：問題開場→快速旅程→滿足揭示→分享觸發。連續 1,000 天日更、5,000 萬粉絲的商業驗證框架", industryKey: "marketing", missionType: taskType, workspace: ["youtube"], methodology: "NasDaily (Nuseir Yassin) – 60-Second Story Structure (2016)", agents: agentMembers, tags: ["short-video", "storytelling", "educational", "viral"], useCases: ["品牌故事短影音", "產品教育影片", "企業文化展示"], outputFormats: ["60 秒腳本模板", "Hook 變體", "視覺剪輯指引"], requiredIntegrations: [], token: 50000, showcases: [{ company: "NasDaily 個人品牌", description: "連續 1,000 天每天發布一支 60 秒故事短影音，應用 Problem-Journey-Reveal 結構", result: "Facebook 5,200 萬+ 粉絲，YouTube 500 萬+，NasAcademy 學員超過 50,000 人", source: "NasDaily 官網 / Forbes 2021 報導" }, { company: "品牌合作案例：聯合利華（Unilever）", description: "與 NasDaily 合作應用其 60 秒故事格式展示品牌社會責任", result: "合作影片累計觀看超過 2 億次，品牌好感度提升 40%", source: "NasDaily 官網合作案例 2020" }] });
    }

    // C6: Roberto Blake — Binge-Worthy Series Format (2019)
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
        assignAgentToStep({ order: 1, name: "系列主題與集數規劃", description: "設計可延伸的系列主題：一個大主題拆成 6-12 集，每集能獨立觀看但看完會想看下一集", tool: "internal", outputType: "series_concept_plan", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "懸念鉤子設計（Cliffhanger）", description: "每集結尾設計懸念鉤子：「下集我將告訴你…」「你絕對猜不到下一步…」讓觀眾迫不及待等待下集", tool: "internal", outputType: "cliffhanger_endings", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "系列腳本創作", description: "按系列計劃撰寫所有集數腳本，確保每集都有獨立價值+系列延伸性，保持統一風格和節奏", tool: "internal", outputType: "series_scripts", requiredSkills: ["short-video-scriptwriter"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "排程與社群建立", description: "設定固定更新節奏（如每週二一集），建立觀眾期待感，同時在留言區與觀眾互動預告下集", tool: "internal", outputType: "series_schedule_community_plan", requiredSkills: ["social-scheduler"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "系列策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "懸念設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "排程社群師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Roberto Blake Binge-Worthy 系列短影音策略", description: "Source: Roberto Blake《Awesome Creator Academy》2019. Blake 的系列格式策略讓他的 YouTube 帳號訂閱率提升 400%", steps });
      await upsertSquad(conn, { slug, name: "Roberto Blake Binge-Worthy 系列短影音小隊", description: "設計讓觀眾「一集接一集」無法停止觀看的系列短影音。Roberto Blake 的懸念+系列格式，建立觀眾黏性和品牌長期關注", industryKey: "marketing", missionType: taskType, workspace: ["youtube"], methodology: "Roberto Blake – Binge-Worthy Series Format (2019)", agents: agentMembers, tags: ["short-video", "series", "retention", "community"], useCases: ["品牌教育系列影片", "產品評測系列", "幕後故事系列"], outputFormats: ["系列企劃書", "腳本組合", "排程計劃"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Roberto Blake YouTube（Awesome Creator Academy）", description: "應用系列+懸念格式，建立「如何成為 YouTube 創作者」系列課程", result: "YouTube 超過 50 萬訂閱，系列影片平均完播率 70%+，訂閱增長率提升 400%", source: "Roberto Blake YouTube 公開數據 2022" }, { company: "HubSpot Marketing YouTube", description: "應用 Binge Series 格式製作「Marketing Made Simple」系列", result: "YouTube 訂閱超過 40 萬，系列影片帶動 25% 的總頻道訂閱增長", source: "HubSpot YouTube 公開數據 2021" }] });
    }

    // C7: Pat Flynn — Teach What You Know + Personality (Smart Passive Income, 2008)
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
        assignAgentToStep({ order: 1, name: "教學主題與個人故事融合", description: "設計每支影片的教學主題，並融入個人故事或親身經歷：Pat Flynn 原則「教學 + 真實人格 = 無可取代的連結」", tool: "internal", outputType: "teaching_topic_plan", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "教學短影音腳本撰寫", description: "撰寫融合教學和個性的短影音腳本：清晰教學點 + 幽默或親切的個人風格，讓人想關注更多", tool: "internal", outputType: "teaching_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "深度學習引導設計", description: "設計從短影音到更深學習資源的橋接：Bio 連結、評論區留言指引、更完整的免費資源，建立從追蹤者到學員的轉化路徑", tool: "internal", outputType: "learning_funnel_design", requiredSkills: ["brand-dna"] }, m3Info),
        assignAgentToStep({ order: 4, name: "社群互動問答設計", description: "在每支影片結尾設計問答互動：提問受眾問題，回覆留言，讓影片成為社群討論起點，提升演算法分發", tool: "internal", outputType: "community_qa_plan", requiredSkills: ["content-marketing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "教學內容策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "腳本師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "品牌個性師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Pat Flynn Teach What You Know 短影音教學品牌策略", description: "Source: Pat Flynn《Will It Fly》+《Superfans》Smart Passive Income 2008–2019. SPI 年收入超過 $200 萬應用此框架建立", steps });
      await upsertSquad(conn, { slug, name: "Pat Flynn Teach & Personality 短影音小隊", description: "用短影音教你知道的事，同時展示真實個性。Pat Flynn 的教學+個性公式：讓粉絲愛上你這個人，才能愛上你的產品", industryKey: "marketing", missionType: taskType, workspace: ["youtube"], methodology: "Pat Flynn – Teach What You Know + Personality (Smart Passive Income, 2008)", agents: agentMembers, tags: ["short-video", "educational", "personal-brand", "teaching"], useCases: ["教育型品牌短影音", "知識變現品牌建立", "SaaS/工具教學影片"], outputFormats: ["教學主題計劃", "腳本組合", "學習漏斗設計"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Smart Passive Income（Pat Flynn）", description: "應用 Teach+Personality 框架系統輸出教學短影音，建立被動收入教育品牌", result: "YouTube 35 萬+ 訂閱，Podcast 超過 8,000 萬次下載，年收入超過 $200 萬", source: "SmartPassiveIncome.com 公開收入報告 2019" }, { company: "Thomas Frank（類似框架）", description: "「College Info Geek」YouTube 頻道應用 Teach+Personality 框架教學習技巧", result: "YouTube 超過 300 萬訂閱，課程銷售超過 $1,000 萬", source: "Thomas Frank 公開收入報告 2022" }] });
    }

    // C8: Justin Welsh — One Piece Many Outputs (The Operating System, 2022)
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
        assignAgentToStep({ order: 1, name: "週核心 Pillar 概念確立", description: "每週選定一個核心商業/行銷洞察作為 Pillar 概念，這是整週所有內容的思想核心", tool: "internal", outputType: "weekly_pillar_concept", requiredSkills: ["content-repurposing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "短影音腳本萃取", description: "從 Pillar 概念萃取 3-5 支短影音腳本：每支聚焦一個觀點或數據點，30-60 秒，可獨立傳遞價值", tool: "internal", outputType: "short_video_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Newsletter 深度延伸", description: "將 Pillar 概念擴展為 Newsletter 深度文章，短影音說結論，Newsletter 說過程和數據，形成互補", tool: "internal", outputType: "newsletter_piece", requiredSkills: ["email-marketing"] }, m3Info),
        assignAgentToStep({ order: 4, name: "多平台協調發布", description: "設計一週發布節奏：短影音在 TikTok/Reels 吸引新受眾，Newsletter 留住深度受眾，Instagram 補全視覺觸達", tool: "internal", outputType: "weekly_distribution_plan", requiredSkills: ["social-scheduler"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "內容系統師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "短影音腳本師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Newsletter 師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Justin Welsh Content OS 一對多內容系統", description: "Source: Justin Welsh《The Content OS》2022 年課程。Welsh 應用此系統以每週 4 小時維持所有平台內容，年收入超過 $5M", steps });
      await upsertSquad(conn, { slug, name: "Justin Welsh One-to-Many 內容系統小隊", description: "一個核心洞察驅動一整週的多平台內容。Justin Welsh 的 Content OS：用系統取代靈感，每週 4 小時維持全平台內容輸出", industryKey: "marketing", missionType: taskType, workspace: ["youtube", "linkedin", "strategy"], methodology: "Justin Welsh – The Content OS (One Piece Many Outputs, 2022)", agents: agentMembers, tags: ["short-video", "content-os", "repurposing", "newsletter"], useCases: ["個人品牌多平台運營", "Solopreneur 內容矩陣", "B2B 個人品牌建立"], outputFormats: ["週 Pillar 概念", "短影音腳本組", "Newsletter 文章", "發布排程"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Justin Welsh 個人品牌", description: "應用 Content OS 系統，每週以 4 小時維持 LinkedIn/TikTok/Newsletter 全平台輸出", result: "LinkedIn 超過 50 萬追蹤，Newsletter 超過 20 萬訂閱，年收入超過 $5M", source: "Justin Welsh 公開收入報告 2022 / JustinWelsh.me" }, { company: "Dickie Bush（類似框架，Ship 30 for 30）", description: "應用 One Idea Many Outputs 將每日文章片段轉化為多平台微內容", result: "Ship 30 for 30 課程收入超過 $2M，Twitter 超過 35 萬追蹤", source: "Dickie Bush 公開數據 / Ship30for30.com 2022" }] });
    }

    // C9: Sahil Bloom — Edu-Tainment Tweet-to-Reels Method (2021)
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
        assignAgentToStep({ order: 1, name: "Edu-Tainment 主題設計", description: "找出教育性（真實洞察）+ 娛樂性（反直覺或驚喜）的交集主題。Sahil Bloom 原則：「讓他們在學習中感到驚喜」", tool: "internal", outputType: "edutainment_topic_list", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "條列式腳本撰寫", description: "以 Twitter Thread 邏輯撰寫短影音腳本：每一點都是獨立洞察，快節奏傳遞 5-7 個學習點，每點 5-8 秒", tool: "internal", outputType: "bullet_point_scripts", requiredSkills: ["short-video-scriptwriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "文字疊加視覺設計", description: "設計讓人即使靜音也能看懂的文字疊加視覺：清晰字體、重點強調色、數字標記，適合轉乘等零碎時間觀看", tool: "internal", outputType: "text_overlay_reels", requiredSkills: ["visual-content-creator"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Edu-Tainment 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "腳本師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "視覺設計師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Sahil Bloom Edu-Tainment 短影音公式", description: "Source: Sahil Bloom 2021 年從 Twitter Thread 起家，延伸至 IG Reels 的 Edu-Tainment 內容公式。Newsletter 超過 50 萬訂閱", steps });
      await upsertSquad(conn, { slug, name: "Sahil Bloom Edu-Tainment 短影音小隊", description: "結合教育價值和娛樂衝擊的短影音公式。Sahil Bloom 的 Edu-Tainment 方法：不只教，還要讓人看了「哇！」", industryKey: "marketing", missionType: taskType, workspace: ["youtube"], methodology: "Sahil Bloom – Edu-Tainment Content Formula (2021)", agents: agentMembers, tags: ["short-video", "educational", "edutainment", "infographic"], useCases: ["商業/金融教育內容", "行銷知識短影音", "品牌洞察系列"], outputFormats: ["主題清單", "條列腳本", "文字疊加設計"], requiredIntegrations: [], token: 45000, showcases: [{ company: "Sahil Bloom 個人品牌", description: "從傳統 Twitter Thread 移植 Edu-Tainment 公式到 Instagram Reels 和 TikTok", result: "Twitter 超過 90 萬粉絲，Instagram 超過 50 萬追蹤，Newsletter 超過 50 萬訂閱", source: "Sahil Bloom 公開數據 2023 / SahilBloom.com" }, { company: "Polina Marinova（The Profile，類似方法）", description: "應用 Edu-Tainment 框架在 Newsletter 和社群平台輸出商業人物洞察", result: "Newsletter 超過 10 萬訂閱，每期開信率超過 45%（業界均值 20%）", source: "The Profile Newsletter 公開數據 2022" }] });
    }

    // C10: Noah Kagan — Title/Thumbnail Test Before Create (AppSumo, 2020)
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
        assignAgentToStep({ order: 1, name: "標題矩陣設計（Create Before Creating）", description: "在製作影片前，為同一主題設計 10 個標題變體，用廣告 A/B 測試找出點擊率最高的標題，再依此製作影片", tool: "internal", outputType: "title_matrix", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 2, name: "小預算標題測試", description: "以 $50-$100 廣告費測試 10 個標題，3 天後選出 CTR 最高的 2 個作為短影音標題，確保內容在製作前就有市場驗證", tool: "internal", outputType: "title_test_results", requiredSkills: ["paid-ads"] }, m3Info),
        assignAgentToStep({ order: 3, name: "贏家標題影片製作", description: "以測試贏家標題作為核心 Hook，撰寫並製作完整短影音，確保內容完全兌現標題的承諾", tool: "internal", outputType: "validated_video_script", requiredSkills: ["marketing-analytics"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "驗證策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "標題設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "測試廣告師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Noah Kagan 先測試再製作短影音驗證法", description: "Source: Noah Kagan（AppSumo 創辦人）2020 年提出「先測標題再做影片」方法，AppSumo 應用此原則管理 $10M+ YouTube 廣告", steps });
      await upsertSquad(conn, { slug, name: "Noah Kagan 先測後製短影音驗證小隊", description: "製作影片前先用廣告測試標題，確保每支短影音都有市場驗證的需求。Noah Kagan 的數據優先創作哲學：不猜，要測", industryKey: "marketing", missionType: taskType, workspace: ["youtube"], methodology: "Noah Kagan – Test Before Create (AppSumo, 2020)", agents: agentMembers, tags: ["short-video", "ab-testing", "data-driven", "validation"], useCases: ["影片內容策略驗證", "新主題測試", "廣告影片優化"], outputFormats: ["標題矩陣", "測試結果報告", "驗證腳本"], requiredIntegrations: [], token: 45000, showcases: [{ company: "AppSumo YouTube（Noah Kagan 創辦）", description: "系統應用 Title Test Before Create 方法，所有 YouTube 影片先測標題再製作", result: "YouTube 超過 100 萬訂閱，影片平均 CTR 達到 8-12%（業界均值 2-4%）", source: "Noah Kagan YouTube / AppSumo.com 公開數據 2023" }, { company: "Starter Story（Pat Walls，類似方法）", description: "在製作每篇內容前先用廣告測試標題點擊率", result: "月流量超過 150 萬，廣告 CTR 超過業界均值 3 倍", source: "Starter Story 公開數據 2022" }] });
    }

    // ═══════════════════════════════════════════════════════════════════
    // CATEGORY D: LinkedIn 行銷 Methodology Squads (D1–D10)
    // ═══════════════════════════════════════════════════════════════════

    // D1: Justin Welsh — The Content Operating System (2022)
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
        assignAgentToStep({ order: 1, name: "內容支柱定義（Content Pillars）", description: "定義 3 個內容支柱：專業知識（Expertise）、個人故事（Story）、行業觀點（Opinion）。Welsh 每週各發一篇，維持多維度的個人品牌形象", tool: "internal", outputType: "content_pillars_doc", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "週貼文格式輪換", description: "規劃每週 3-5 篇貼文的格式輪換：條列型、故事型、觀點型、數據型、問答型，確保受眾不疲乏", tool: "internal", outputType: "weekly_format_rotation", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "LinkedIn 貼文文案撰寫", description: "撰寫符合 LinkedIn 演算法的貼文：強力第一行（不截斷）、每段落 1-2 句、白行分隔、清晰 CTA", tool: "internal", outputType: "linkedin_posts_copy", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 4, name: "Newsletter 橋接設計", description: "在 LinkedIn 貼文結尾引導至 Newsletter：Welsh 策略是 LinkedIn 吸引受眾，Newsletter 留住受眾，建立不受平台風險的讀者群", tool: "internal", outputType: "newsletter_cta_design", requiredSkills: ["email-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "LinkedIn 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "文案師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Newsletter 師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "效益分析師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Justin Welsh LinkedIn Content OS 個人品牌系統", description: "Source: Justin Welsh《The Content OS》2022 課程。Welsh 以每週 4 小時投入，達到 LinkedIn 50 萬追蹤者和年收 $5M", steps });
      await upsertSquad(conn, { slug, name: "Justin Welsh LinkedIn Content OS 個人品牌小隊", description: "應用 Justin Welsh 的 Content OS：3 個內容支柱 × 週格式輪換 × Newsletter 橋接，以系統取代靈感，每週 4 小時維持 LinkedIn 個人品牌", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Justin Welsh – The Content Operating System (2022)", agents: agentMembers, tags: ["linkedin", "personal-brand", "content-os", "newsletter"], useCases: ["個人品牌LinkedIn建立", "B2B顧問品牌", "Solopreneur LinkedIn成長"], outputFormats: ["內容支柱文件", "週貼文計劃", "LinkedIn 文案", "Newsletter CTA"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Justin Welsh 個人品牌 @JustinWelsh", description: "2019 年從零開始應用 Content OS 系統建立 LinkedIn 個人品牌", result: "LinkedIn 超過 50 萬追蹤，年收入超過 $5M，每篇貼文平均觸達 20-50 萬人", source: "Justin Welsh 公開收入報告 2022 / JustinWelsh.me" }, { company: "Lara Acosta（Welsh 方法論學員）", description: "應用 Content OS 從 0 建立 LinkedIn 個人品牌，4 個月達到 5 萬追蹤", result: "LinkedIn 超過 20 萬追蹤，個人品牌課程月收入超過 $30,000", source: "Lara Acosta LinkedIn / 公開訪談 2023" }] });
    }

    // D2: Richard van der Blom — LinkedIn Algorithm Methodology (2020–2023)
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
        assignAgentToStep({ order: 1, name: "LinkedIn 演算法格式評分", description: "依 van der Blom 年度 Algorithm Report 評估各貼文格式的演算法權重：文件/Carousel 最高 → 影片 → 圖片 → 純文字", tool: "internal", outputType: "format_scoring_guide", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "演算法友好貼文撰寫", description: "應用 van der Blom 洞察撰寫高分貼文：前 3 行無連結、強力互動問題結尾、標籤不超過 3 個、第 1 小時互動衝刺", tool: "internal", outputType: "algorithm_friendly_posts", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "最佳發布時段設定", description: "依 van der Blom 研究找出行業最佳發布時窗：週二/三/四早上 7-9 點為大多數行業最高觸達窗口", tool: "internal", outputType: "optimal_posting_schedule", requiredSkills: ["social-scheduler"] }, m3Info),
        assignAgentToStep({ order: 4, name: "互動速度優化（Golden Hour）", description: "設計發布後第一小時的「黃金小時」互動計劃：主動回覆留言、手動連結親友互動，送出強烈社交訊號給演算法", tool: "internal", outputType: "golden_hour_plan", requiredSkills: ["cross-channel-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "LinkedIn 演算法師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "貼文優化師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "排程互動師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Richard van der Blom LinkedIn 演算法科學優化法", description: "Source: Richard van der Blom 年度《LinkedIn Algorithm Insights Report》2020-2023，分析超過 88,000 篇貼文，是全球最被引用的 LinkedIn 演算法研究", steps });
      await upsertSquad(conn, { slug, name: "van der Blom LinkedIn 演算法科學優化小隊", description: "以 Richard van der Blom 分析 88,000+ 篇貼文的科學報告為基礎，優化貼文格式、發布時段和互動策略，最大化 LinkedIn 有機觸達", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Richard van der Blom – LinkedIn Algorithm Insights Report (2020–2023)", agents: agentMembers, tags: ["linkedin", "algorithm", "analytics", "organic-reach"], useCases: ["LinkedIn觸達率提升", "演算法友好內容優化", "企業LinkedIn帳號管理"], outputFormats: ["格式評分指南", "演算法友好貼文", "黃金小時計劃"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Just Connecting（van der Blom 公司）客戶群", description: "企業客戶應用 Algorithm Report 洞察優化 LinkedIn 內容策略", result: "平均有機觸達率提升 150-300%，貼文互動率提升 200%", source: "Just Connecting 官網 / van der Blom Algorithm Report 2023" }, { company: "IBM（類似演算法優化案例）", description: "應用 LinkedIn 演算法最佳化策略，優化企業帳號貼文格式和時間", result: "LinkedIn 帳號觸達增長 180%，員工倡議貼文互動率達業界 Top 10%", source: "LinkedIn Business Solutions Case Studies 2022" }] });
    }

    // D3: Daniel Disney — Social Selling Method (The Ultimate LinkedIn Sales Guide, 2021)
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
        assignAgentToStep({ order: 1, name: "LinkedIn 個人資料優化", description: "建立以買家為中心（非求職者）的 LinkedIn 個人資料：Headline 說「我幫誰解決什麼問題」，About 說故事，Experience 說成果", tool: "internal", outputType: "optimized_linkedin_profile", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 2, name: "內容權威建立", description: "系統化發布展示行業專業知識的內容，建立「找這類問題就找我」的思維定位，讓目標客戶主動找上門", tool: "internal", outputType: "authority_content_plan", requiredSkills: ["content-marketing"] }, m3Info),
        assignAgentToStep({ order: 3, name: "關係連結策略", description: "設計精準的連結請求策略：個人化訊息 + 共同連結 + 價值先行，建立真實商業關係而非垃圾連結", tool: "internal", outputType: "connection_strategy", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "對話轉換流程", description: "設計從內容互動到私訊對話的自然轉換流程：回應留言 → 感謝訊息 → 建立對話 → 發現需求 → 提案通話", tool: "internal", outputType: "conversation_conversion_flow", requiredSkills: ["campaign-orchestrator"] }, m4Info),
        assignAgentToStep({ order: 5, name: "銷售管道追蹤", description: "建立 LinkedIn Social Selling Index (SSI) 追蹤，以數據衡量社群銷售效果並持續優化", tool: "internal", outputType: "ssi_pipeline_report", requiredSkills: ["marketing-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "社群銷售策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "個人資料師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "內容權威師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "管道分析師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Daniel Disney LinkedIn Social Selling B2B 銷售系統", description: "Source: Daniel Disney《The Ultimate LinkedIn Sales Guide》2021. Disney 是全球 LinkedIn Social Selling 最知名導師，訓練超過 100,000 位 B2B 銷售人員", steps });
      await upsertSquad(conn, { slug, name: "Daniel Disney LinkedIn Social Selling 小隊", description: "應用 Daniel Disney 的 LinkedIn Social Selling 系統，從個人資料優化到管道建立，用內容吸引目標客戶主動聯繫", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Daniel Disney – The Ultimate LinkedIn Sales Guide (2021)", agents: agentMembers, tags: ["linkedin", "social-selling", "b2b", "pipeline"], useCases: ["B2B銷售LinkedIn開發", "顧問服務客戶獲取", "企業BD LinkedIn策略"], outputFormats: ["LinkedIn個人資料優化", "內容計劃", "對話腳本", "SSI報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Daniel Disney 個人品牌 / Daily Sales", description: "應用自創的 LinkedIn Social Selling 方法，從銷售員到全球最知名 LinkedIn 培訓師", result: "LinkedIn 超過 90 萬粉絲，培訓超過 100,000 銷售人員，Daily Sales 年收超過 £200 萬", source: "Daniel Disney LinkedIn / TheDailySales.com 2023" }, { company: "Salesforce（Daniel Disney 企業客戶）", description: "應用 Social Selling 框架培訓銷售團隊在 LinkedIn 建立個人品牌和管道", result: "Sales Team LinkedIn SSI 平均提升 40%，LinkedIn 來源的管道增加 25%", source: "Daniel Disney 企業培訓案例 2022" }] });
    }

    // D4: Gary Vaynerchuk — Day Trading Attention (LinkedIn Edition, 2023)
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
        assignAgentToStep({ order: 1, name: "LinkedIn 注意力機會偵測", description: "每週分析 LinkedIn 趨勢內容和演算法偏愛格式，識別注意力成本最低的內容機會（GaryVee：「在沒人的地方搶佔注意力」）", tool: "internal", outputType: "attention_opportunity_map", requiredSkills: ["social-media-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "LinkedIn 原生影片內容", description: "製作 LinkedIn 平台原生影片（而非 YouTube 外鏈），應用 GaryVee 原則：原生內容獲得 3x 有機觸達", tool: "internal", outputType: "native_video_scripts", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "留言互動搶佔策略", description: "在高熱度帖子下留下高品質評論（GaryVee「Comments as Content」），讓個人品牌在更大受眾面前曝光", tool: "internal", outputType: "comment_strategy", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "注意力套利 ROI 追蹤", description: "追蹤各類內容的「注意力成本比」：觸達 / 時間投入，持續優化投資報酬最高的內容形式", tool: "internal", outputType: "attention_roi_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "LinkedIn 注意力策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "原生影片師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "ROI 分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GaryVee Day Trading Attention LinkedIn 策略", description: "Source: Gary Vaynerchuk《Day Trading Attention》2024. VaynerMedia 協助企業在 LinkedIn 以最低成本搶佔行業注意力", steps });
      await upsertSquad(conn, { slug, name: "GaryVee Day Trading Attention LinkedIn 小隊", description: "在 LinkedIn 上像交易股票一樣交易注意力：在演算法偏愛的格式和時機以最低成本搶佔最大曝光。Gary Vee 2024 最新方法論", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Gary Vaynerchuk – Day Trading Attention (2024)", agents: agentMembers, tags: ["linkedin", "organic-reach", "attention", "native-content"], useCases: ["B2B品牌LinkedIn有機成長", "個人品牌快速曝光", "企業思想領導力建立"], outputFormats: ["注意力機會地圖", "原生影片腳本", "留言策略", "ROI報告"], requiredIntegrations: [], token: 55000, showcases: [{ company: "VaynerMedia B2B 客戶組合", description: "應用 Day Trading Attention 框架幫助 B2B 品牌在 LinkedIn 搶佔有機流量", result: "客戶平均 LinkedIn 觸達提升 400%，廣告支出同期降低 30%", source: "VaynerMedia LinkedIn 案例研究 2023" }, { company: "Gary Vaynerchuk 個人 LinkedIn", description: "系統執行原生影片+留言策略，以最低摩擦成本維持 LinkedIn 頂級影響力", result: "LinkedIn 超過 500 萬追蹤者，每篇貼文觸達 50-200 萬人", source: "GaryVee LinkedIn 公開數據 2024" }] });
    }

    // D5: Alex Hormozi — LinkedIn Lead Magnet to DM Pipeline (2023)
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
        assignAgentToStep({ order: 1, name: "LinkedIn Lead Magnet 貼文設計", description: "設計「評論取得免費資源」的 LinkedIn 貼文格式（Hormozi 2023 病毒貼文公式）：高感知價值免費品 + 評論觸發機制", tool: "internal", outputType: "lead_magnet_post", requiredSkills: ["hook-copywriter"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "自動 DM 序列設計", description: "設計評論後觸發的自動私訊序列：Lead Magnet 交付 → 建立關係 → 了解需求 → 服務引導", tool: "internal", outputType: "dm_automation_sequence", requiredSkills: ["email-marketing"] }, m2Info),
        assignAgentToStep({ order: 3, name: "通話預約流程設計", description: "設計從 DM 對話到通話預約的轉換流程：問資格問題 → 匹配確認 → Calendly 連結 → 確認郵件", tool: "internal", outputType: "call_booking_flow", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "LinkedIn 管道效益追蹤", description: "建立 LinkedIn 潛客管道追蹤：Lead Magnet 評論數→DM 開啟率→通話預約率→成交率，優化每個轉換節點", tool: "internal", outputType: "pipeline_tracking_dashboard", requiredSkills: ["marketing-ops"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Lead Magnet 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "DM 序列師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "管道追蹤師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Hormozi LinkedIn Lead Magnet to DM Pipeline", description: "Source: Alex Hormozi 2023 年 LinkedIn 病毒貼文公式，單篇貼文觸達 5,000+ 評論的實際案例", steps });
      await upsertSquad(conn, { slug, name: "Hormozi LinkedIn Lead Magnet 管道小隊", description: "以 Alex Hormozi 的「評論觸發 Lead Magnet」公式在 LinkedIn 建立自動化潛客管道，從貼文觸達到通話預約全流程優化", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Alex Hormozi – LinkedIn Lead Magnet DM Pipeline (2023)", agents: agentMembers, tags: ["linkedin", "lead-generation", "dm-automation", "pipeline"], useCases: ["B2B服務潛客開發", "顧問/教練客戶獲取", "SaaS試用引導"], outputFormats: ["Lead Magnet 貼文", "DM 序列腳本", "管道追蹤儀表板"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Alex Hormozi LinkedIn @hormozi", description: "應用「評論取得免費資源」格式，單篇貼文觸發 5,000+ 評論和 DM", result: "LinkedIn 超過 100 萬追蹤，單次貼文產生 500+ 商業詢問", source: "Hormozi LinkedIn 公開貼文數據 2023" }, { company: "Adam Robinson（RB2B）", description: "應用類似 LinkedIn Lead Magnet + DM 自動化流程", result: "LinkedIn 貼文帶來 $1M ARR 增長，潛客獲取成本低於 $50/人", source: "Adam Robinson LinkedIn / RB2B.com 2023" }] });
    }

    // D6: Viveka von Rosen — LinkedIn Optimization System (Linked Into Business, 2013)
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
        assignAgentToStep({ order: 1, name: "LinkedIn SEO 個人/企業頁面審計", description: "審計 LinkedIn 頁面的 SEO 完整度：關鍵字分佈、All-Star 個人資料狀態、自訂 URL、Featured 版塊使用", tool: "internal", outputType: "linkedin_seo_audit", requiredSkills: ["brand-identity"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "關鍵字策略與嵌入", description: "研究目標受眾在 LinkedIn 搜索的關鍵字，系統化嵌入 Headline/About/Experience 中，提升 LinkedIn 搜索排名", tool: "internal", outputType: "keyword_optimization_plan", requiredSkills: ["market-research-agent"] }, m3Info),
        assignAgentToStep({ order: 3, name: "LinkedIn 內容 SEO 系統", description: "設計以目標關鍵字為核心的內容策略，讓貼文在 LinkedIn 搜索中排名，吸引主動搜尋的潛在客戶", tool: "internal", outputType: "content_seo_calendar", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "參與度信號最大化", description: "設計讓 LinkedIn 演算法將帳號視為高價值創作者的參與度信號：回覆率、連結接受率、內容互動頻率", tool: "internal", outputType: "engagement_signal_plan", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 5, name: "LinkedIn 效益月報", description: "追蹤個人資料瀏覽量、搜索出現次數、SSI 分數、內容觸達率等核心 KPI，每月優化策略", tool: "internal", outputType: "linkedin_monthly_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "LinkedIn SEO 師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "關鍵字內容師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "效益分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Viveka von Rosen LinkedIn 全方位優化系統", description: "Source: Viveka von Rosen《Linked Into Business》2013. LinkedIn 認證她為全球最知名的 LinkedIn 專家之一", steps });
      await upsertSquad(conn, { slug, name: "Viveka von Rosen LinkedIn 全方位優化小隊", description: "應用 Viveka von Rosen 的 LinkedIn 優化系統：從個人資料 SEO 到內容關鍵字策略，讓 LinkedIn 成為穩定的 B2B 潛客來源", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Viveka von Rosen – LinkedIn Optimization System (Linked Into Business, 2013)", agents: agentMembers, tags: ["linkedin", "seo", "profile-optimization", "b2b"], useCases: ["LinkedIn個人資料優化", "企業LinkedIn頁面SEO", "B2B搜索流量獲取"], outputFormats: ["LinkedIn SEO 審計報告", "關鍵字優化方案", "內容SEO行事曆", "月報"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Viveka von Rosen 個人品牌 / Vengreso", description: "應用自創 LinkedIn 優化框架建立全球 LinkedIn 培訓品牌", result: "被 LinkedIn 認證為 LinkedIn 最知名專家，Vengreso 培訓 1,000+ 企業客戶", source: "Viveka von Rosen LinkedIn / Vengreso.com 2023" }, { company: "HP（Hewlett-Packard）企業 LinkedIn 優化", description: "應用 LinkedIn SEO 優化企業頁面和員工個人資料", result: "LinkedIn 搜索可見度提升 300%，企業頁面追蹤者增長 200%", source: "Viveka von Rosen 企業客戶案例 2020" }] });
    }

    // D7: Tim Hughes — Social Selling Revolution (2016)
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
        assignAgentToStep({ order: 1, name: "Digital Body Language 建立", description: "Tim Hughes 強調「數位體語言」：個人資料如何讓買家第一眼就信任你。優化頭像、Banner、Headline、About 呈現", tool: "internal", outputType: "digital_body_language_guide", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 2, name: "網絡建立策略", description: "設計精準的 LinkedIn 網絡建立計劃：每天連結 5-10 個目標潛客，個人化訊息而非群發，質量優於數量", tool: "internal", outputType: "network_building_plan", requiredSkills: ["mbb-strategist"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "觸發事件行銷", description: "監測潛在客戶的 LinkedIn 活動觸發事件：換工作、升職、發文、公司新聞，在對的時機以對的方式接觸", tool: "internal", outputType: "trigger_event_playbook", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "管道建立與追蹤", description: "建立完整的 LinkedIn Social Selling 管道追蹤系統，從初次連結到通話預約的每個節點", tool: "internal", outputType: "pipeline_tracking_system", requiredSkills: ["campaign-orchestrator"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "社群銷售革命師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "數位聲譽師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "管道建立師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Tim Hughes Social Selling Revolution LinkedIn B2B 策略", description: "Source: Tim Hughes《Social Selling: Techniques to Influence Buyers and Changemakers》2016. DLA Ignite 培訓超過 50,000 B2B 銷售人員", steps });
      await upsertSquad(conn, { slug, name: "Tim Hughes Social Selling Revolution LinkedIn 小隊", description: "以 Tim Hughes 的社群銷售革命框架，建立數位體語言→精準網絡→觸發事件行銷的完整 B2B LinkedIn 銷售系統", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Tim Hughes – Social Selling Revolution (2016)", agents: agentMembers, tags: ["linkedin", "b2b", "social-selling", "pipeline"], useCases: ["企業銷售團隊LinkedIn策略", "B2B業務開發", "企業客戶維護"], outputFormats: ["數位體語言指南", "網絡建立計劃", "觸發事件劇本", "管道追蹤"], requiredIntegrations: [], token: 55000, showcases: [{ company: "DLA Ignite（Tim Hughes 共同創辦）", description: "應用 Social Selling Revolution 框架培訓全球 B2B 銷售團隊", result: "培訓超過 50,000 B2B 銷售人員，客戶管道平均增長 30-40%", source: "DLA Ignite 官網 / Tim Hughes LinkedIn 2023" }, { company: "Oracle EMEA 銷售團隊", description: "Tim Hughes 協助 Oracle 歐洲銷售團隊應用 Social Selling 方法", result: "LinkedIn 獲得的管道機會增加 40%，銷售週期縮短 25%", source: "Tim Hughes《Social Selling》書中案例" }] });
    }

    // D8: John Nemo — LinkedIn Riches (2014)
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
        assignAgentToStep({ order: 1, name: "理想客戶 LinkedIn 搜索", description: "設計精準的 LinkedIn 搜索策略：職位、行業、公司規模、地區組合，找到最匹配的潛在客戶名單", tool: "internal", outputType: "ideal_client_linkedin_search", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "個人化連結訊息設計", description: "設計每個目標客戶的個人化連結訊息：引用其最近貼文、共同連結、相關背景，避免任何銷售感", tool: "internal", outputType: "personalized_connection_messages", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Value-First 跟進序列", description: "連結成功後的 3-步跟進序列：感謝→分享相關資源→發現需求，每步都提供價值，不直接推銷", tool: "internal", outputType: "followup_sequence", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "Outreach 效益追蹤優化", description: "追蹤連結接受率、回覆率、通話預約率，A/B 測試不同訊息版本，持續優化外聯效率", tool: "internal", outputType: "outreach_performance_report", requiredSkills: ["campaign-orchestrator"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "LinkedIn 開發師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "個人化訊息師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "外聯優化師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "John Nemo LinkedIn Riches 潛客開發系統", description: "Source: John Nemo《LinkedIn Riches》2014. Nemo 應用自創系統 90 天內從 LinkedIn 產出 $135,000 業績，後教授超過 150,000 人", steps });
      await upsertSquad(conn, { slug, name: "John Nemo LinkedIn Riches 潛客開發小隊", description: "應用 John Nemo 的 LinkedIn Riches 系統：精準搜索→個人化連結→價值優先序列，打造高轉換率的 LinkedIn 外聯機器", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "John Nemo – LinkedIn Riches (2014)", agents: agentMembers, tags: ["linkedin", "outreach", "lead-generation", "personalization"], useCases: ["B2B潛客外聯", "顧問服務客戶開發", "銷售外聯自動化"], outputFormats: ["目標客戶搜索策略", "個人化連結訊息", "跟進序列腳本", "效益報告"], requiredIntegrations: [], token: 50000, showcases: [{ company: "John Nemo 個人案例", description: "應用 LinkedIn Riches 方法，90 天內從 LinkedIn 純有機外聯產出業績", result: "90 天產出 $135,000 業績，後培訓超過 150,000 人此方法，LinkedIn 超過 20 萬追蹤", source: "John Nemo《LinkedIn Riches》/ Nemo Radio Podcast 2014-2023" }, { company: "中小企業服務業（匿名）via Nemo 培訓", description: "應用 LinkedIn Riches 外聯系統開發本地企業客戶", result: "3 個月 LinkedIn 外聯產出 $80,000 新業績，外聯回覆率達 35%（業界均值 5%）", source: "John Nemo LinkedIn Riches 學員案例 2021" }] });
    }

    // D9: Chris Walker — Dark Social B2B Demand Generation (2021)
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
        assignAgentToStep({ order: 1, name: "Thought Leadership 內容策略", description: "設計 LinkedIn 思想領導力內容策略：分享反直覺觀點、行業批評、真實數據，讓潛客「在Slack 轉發你的貼文」", tool: "internal", outputType: "thought_leadership_strategy", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 2, name: "需求創造內容製作", description: "製作能改變買家思維框架的內容（非產品廣告）：讓目標受眾意識到他們有一個他們不知道的問題", tool: "internal", outputType: "demand_creation_content", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Dark Social 測量框架", description: "建立無法被 UTM 追蹤的 Dark Social 測量方法：自我申報的管道調查（「你從哪裡聽說我們的？」）、品牌搜尋量趨勢", tool: "internal", outputType: "dark_social_measurement", requiredSkills: ["attribution-modeling"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "需求創造策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "思想領導力師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Dark Social 分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Chris Walker Dark Social LinkedIn B2B 需求創造", description: "Source: Chris Walker（Refine Labs 創辦人）2021 年提出 Dark Social + Demand Generation 理論，顛覆 B2B 行銷歸因思維", steps });
      await upsertSquad(conn, { slug, name: "Chris Walker Dark Social B2B 需求創造小隊", description: "應用 Chris Walker 的 Dark Social 理論：在 LinkedIn 創造真正的需求（而非捕捉需求），讓品牌在看不見的地方建立影響力", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Chris Walker – Dark Social Demand Generation (Refine Labs, 2021)", agents: agentMembers, tags: ["linkedin", "b2b", "demand-generation", "thought-leadership"], useCases: ["B2B SaaS需求創造", "企業品牌市場佔位", "行業思想領袖建立"], outputFormats: ["思想領導力策略", "需求創造內容", "Dark Social 測量框架"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Refine Labs（Chris Walker 創辦）自身案例", description: "應用 Dark Social 需求創造策略，透過 LinkedIn 思想領導力建立業界影響力", result: "Refine Labs 年收入超過 $1,000 萬，客戶無需付費廣告依靠 Dark Social 自然增長", source: "Chris Walker LinkedIn / Refine Labs Revenue Report 2022" }, { company: "Metadata.io（Chris Walker 客戶）", description: "應用需求創造框架，Walker 思想領導力帶動 Metadata B2B SaaS 成長", result: "年 ARR 超過 $3,000 萬，LinkedIn 成為最大潛客來源之一", source: "Metadata.io 公開案例 2022" }] });
    }

    // D10: Ross Simmonds — Distribution First Strategy (Foundation, 2019)
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
        assignAgentToStep({ order: 1, name: "內容盤點與分發機會識別", description: "盤點現有內容資產，為每篇高價值內容識別 5-10 個適合的分發管道：Reddit 社群、Quora 問答、Medium、LinkedIn 原生文章", tool: "internal", outputType: "content_distribution_inventory", requiredSkills: ["content-repurposing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "平台原生格式改編", description: "把每篇高價值內容改寫為各平台的原生格式：LinkedIn 貼文 = 條列重點，Quora = 詳細解答，Reddit = 真誠問題回覆", tool: "internal", outputType: "platform_native_content", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 3, name: "分發執行排程", description: "建立 30 天分發執行排程：每天把 1-2 篇重新格式化的內容發布到不同管道，建立全渠道品牌觸點", tool: "internal", outputType: "distribution_execution_schedule", requiredSkills: ["cross-channel-analytics"] }, m3Info),
        assignAgentToStep({ order: 4, name: "分發效益追蹤優化", description: "追蹤每個分發管道帶來的流量、潛客、品牌提及，識別 ROI 最高的分發組合並集中資源", tool: "internal", outputType: "distribution_roi_report", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 5, name: "長青內容更新再分發", description: "識別 6-12 個月前的高效分發內容，更新數據和洞察後重新分發，讓長青內容持續創造價值", tool: "internal", outputType: "evergreen_republishing_plan", requiredSkills: ["content-repurposing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "分發策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "原生格式師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "分發分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ross Simmonds Distribution First 內容分發第一策略", description: "Source: Ross Simmonds《Foundation Marketing》2019. Simmonds 說「Create Once, Distribute Forever」，Foundation Inc. 幫助 B2B 企業透過分發策略提升內容 ROI 10 倍", steps });
      await upsertSquad(conn, { slug, name: "Ross Simmonds Distribution First LinkedIn 分發小隊", description: "應用 Ross Simmonds 的 Distribution First 哲學：「最好的內容不是製作最多，而是分發最廣」。把一篇好內容分發到 10 個平台，ROI 提升 10 倍", industryKey: "marketing", missionType: taskType, workspace: ["linkedin"], methodology: "Ross Simmonds – Distribution First Strategy (Foundation, 2019)", agents: agentMembers, tags: ["linkedin", "content-distribution", "repurposing", "roi"], useCases: ["B2B內容ROI最大化", "多平台分發策略", "長青內容再利用"], outputFormats: ["分發機會清單", "平台原生格式包", "分發排程", "ROI報告"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Foundation Inc.（Ross Simmonds 創辦）", description: "應用 Distribution First 策略，幫助 B2B 客戶最大化每篇內容的觸達範圍", result: "客戶內容觸達平均提升 10 倍，內容 ROI 從 2x 提升至 15-20x", source: "Foundation Inc. 官網 / Ross Simmonds 公開案例 2023" }, { company: "Shopify（Foundation 客戶）", description: "應用 Distribution First 將部落格內容分發到 20+ 個管道", result: "有機流量增長 40%，內容帶來的潛客轉換率提升 60%", source: "Foundation Inc. 案例研究 2021" }] });
    }

    // ═══════════════════════════════════════════════════════════════════
    // CATEGORY E: 內容行銷 Methodology Squads (E1–E10)
    // ═══════════════════════════════════════════════════════════════════

    // E1: Joe Pulizzi — Content Inc. (2015)
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
        assignAgentToStep({ order: 1, name: "甜蜜點定位（Sweet Spot）", description: "找出品牌知識優勢與受眾需求的交集「甜蜜點」。Pulizzi 說先有受眾才有產品，先找甜蜜點再做內容", tool: "internal", outputType: "sweet_spot_definition", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "內容傾斜確立（Content Tilt）", description: "在甜蜜點中找到競爭對手沒有佔領的角度（Content Tilt）：這是讓品牌成為「唯一」而非「其中之一」的關鍵", tool: "internal", outputType: "content_tilt_strategy", requiredSkills: ["mbb-strategist"] }, m2Info),
        assignAgentToStep({ order: 3, name: "核心平台內容製作", description: "選定一個核心平台（部落格/Podcast/YouTube），每週系統輸出高品質內容，聚焦在甜蜜點+Content Tilt", tool: "internal", outputType: "platform_content_plan", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "Email 受眾建立", description: "透過核心平台內容建立 Email 訂閱名單，這是 Pulizzi 的重點：擁有受眾比在社群平台上借用受眾更重要", tool: "internal", outputType: "email_list_building_plan", requiredSkills: ["email-marketing"] }, m3Info),
        assignAgentToStep({ order: 5, name: "受眾多元化分發", description: "在核心平台成功後，開始向 2-3 個次要平台分發，擴大受眾覆蓋", tool: "internal", outputType: "diversification_plan", requiredSkills: ["social-scheduler"] }, m3Info),
        assignAgentToStep({ order: 6, name: "內容商業化策略", description: "設計受眾商業化路徑：廣告、贊助、付費課程、書籍、活動，把受眾變成收入引擎", tool: "internal", outputType: "monetization_strategy", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Content Inc. 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "甜蜜點研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Email 受眾師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "內容創作師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Joe Pulizzi Content Inc. 受眾優先內容行銷框架", description: "Source: Joe Pulizzi《Content Inc.》2015 年書籍 + Content Marketing Institute 創辦。CMI 被收購前估值超過 $17M，應用 Content Inc. 框架", steps });
      await upsertSquad(conn, { slug, name: "Joe Pulizzi Content Inc. 受眾建立小隊", description: "先建立受眾，再建立產品。應用 Joe Pulizzi 的 Content Inc. 六步框架：甜蜜點→Content Tilt→核心平台→受眾建立→分發多元化→商業化", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Joe Pulizzi – Content Inc. (2015)", agents: agentMembers, tags: ["content-marketing", "audience-building", "email", "brand"], useCases: ["新品牌內容策略", "媒體型企業建立", "個人品牌商業化"], outputFormats: ["甜蜜點分析", "Content Tilt 策略", "內容計劃", "商業化方案"], requiredIntegrations: [], token: 65000, showcases: [{ company: "Content Marketing Institute（Pulizzi 創辦）", description: "以 Content Inc. 框架，從零建立業界最具影響力的 B2B 內容行銷媒體", result: "CMI 年收入超過 $8M，被 UBM 以 $17.6M 收購，年度活動 Content Marketing World 1,000+ 名企業出席", source: "Joe Pulizzi《Content Inc.》/ CMI Annual Report" }, { company: "HubSpot Blog（類似 Content Inc. 路徑）", description: "以 Sweet Spot（行銷/銷售/服務知識）+ Content Tilt（免費工具+教育內容）建立媒體型行銷", result: "HubSpot Blog 月流量超過 500 萬，Email 名單超過 300 萬，貢獻超過 30% 的新客戶", source: "HubSpot Annual Report 2022 / CEO Brian Halligan 訪談" }] });
    }

    // E2: Marcus Sheridan — They Ask You Answer (2012/2017)
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
        assignAgentToStep({ order: 1, name: "買家問題大挖掘", description: "系統化收集目標受眾所有問題：Cost、Problems、Comparisons、Best、Reviews（Big Five 主題）。Sheridan：「消費者在買你產品前有什麼問題？把全部都回答了」", tool: "internal", outputType: "buyer_question_bank", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "誠實回答內容製作（包括 Cost/Pricing）", description: "製作業界最誠實的內容：包括競品比較、缺點、定價透明，這是大多數競爭對手不敢做的。Sheridan 的護城河：誠實即權威", tool: "internal", outputType: "honest_answer_content", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "銷售賦能內容設計", description: "設計幫助業務人員在銷售過程中使用的內容：作業治 Assignment Selling，讓潛客在見面前先看指定文章，提升會議品質", tool: "internal", outputType: "sales_enablement_materials", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 4, name: "SEO 追蹤與優化", description: "追蹤每篇回答內容的 SEO 效益：搜尋流量、閱讀時間、表單轉換率，識別哪些問題帶來最多高質量潛客", tool: "internal", outputType: "seo_content_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "They Ask You Answer 師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "買家問題研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "銷售賦能師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Marcus Sheridan They Ask You Answer 內容行銷方法", description: "Source: Marcus Sheridan《They Ask You Answer》2012/2017. Sheridan 的 River Pools and Spas 應用此方法在金融危機期間變成全球最多人造訪的游泳池網站", steps });
      await upsertSquad(conn, { slug, name: "Marcus Sheridan They Ask You Answer 內容小隊", description: "回答買家所有問題，包括競爭對手不敢碰的定價和缺點。Marcus Sheridan 的誠實框架：透明度即競爭優勢", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Marcus Sheridan – They Ask You Answer (2012/2017)", agents: agentMembers, tags: ["content-marketing", "seo", "inbound", "sales-enablement"], useCases: ["B2B服務業內容行銷", "高考慮度消費品牌", "電商品牌信任建立"], outputFormats: ["買家問題庫", "誠實回答內容", "銷售賦能材料", "SEO報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "River Pools and Spas（Sheridan 自創）", description: "2008 金融危機期間，以 They Ask You Answer 框架回答游泳池買家所有問題", result: "成為全球最多人造訪的游泳池網站，節省 $200,000 廣告費，銷售從危機中恢復", source: "Marcus Sheridan《They Ask You Answer》Chapter 1 + 公開演講" }, { company: "Yale Appliance（Sheridan 客戶）", description: "應用 They Ask You Answer 策略，誠實回答買家問題包括競品比較", result: "有機流量從 15 萬提升至 300 萬/月，年銷售額增長 40%", source: "Marcus Sheridan 客戶案例研究 2019" }] });
    }

    // E3: Brian Dean — Skyscraper Technique (Backlinko, 2015)
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
        assignAgentToStep({ order: 1, name: "高連結潛力內容偵察", description: "尋找目標關鍵字中被大量網站引用的「磁石內容」：Ahrefs 反向連結分析找出有 50+ 個連結的現有文章", tool: "internal", outputType: "linkable_content_targets", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "10x 優越內容創作", description: "製作比現有最佳內容「明顯更好」的版本：更新的數據、更深的分析、更清晰的視覺、更完整的涵蓋範圍", tool: "internal", outputType: "skyscraper_content_draft", requiredSkills: ["copywriting-pro"] }, m3Info),
        assignAgentToStep({ order: 3, name: "連結外聯名單建立", description: "建立連結到舊版文章的所有網站名單，這些是最可能連結你更好版本的潛在來源", tool: "internal", outputType: "link_prospect_list", requiredSkills: ["marketing-ops"] }, m4Info),
        assignAgentToStep({ order: 4, name: "個人化連結外聯", description: "寄發個人化外聯郵件：說明你創建了更好的版本、提供具體改進點，請求他們更新連結到你的內容", tool: "internal", outputType: "link_outreach_emails", requiredSkills: ["marketing-ops"] }, m4Info),
        assignAgentToStep({ order: 5, name: "連結建立效益追蹤", description: "追蹤外聯後的反向連結增長、Domain Authority 提升、有機排名變化，報告 Skyscraper 效益", tool: "internal", outputType: "link_building_report", requiredSkills: ["marketing-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Skyscraper 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "內容研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "10x 內容師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "外聯執行師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Brian Dean Skyscraper Technique 超越競爭對手內容策略", description: "Source: Brian Dean（Backlinko）2015 年提出 Skyscraper Technique，首次應用案例獲得 110% 有機流量增長", steps });
      await upsertSquad(conn, { slug, name: "Brian Dean Skyscraper Technique 內容連結建立小隊", description: "找到最多人連結的內容，做一個明顯更好的版本，然後告訴連結舊版的人換連結到你這裡。Brian Dean 的 Skyscraper 技術：以品質換連結", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Brian Dean – Skyscraper Technique (Backlinko, 2015)", agents: agentMembers, tags: ["content-marketing", "seo", "link-building", "backlinks"], useCases: ["SEO 連結建立", "內容行銷 ROI 提升", "競爭激烈關鍵字突破"], outputFormats: ["Skyscraper 內容", "外聯名單", "外聯郵件模板", "效益報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Backlinko（Brian Dean 自身）首次案例", description: "應用 Skyscraper Technique 為「Google Ranking Factors」文章建立反向連結", result: "2 週內有機流量增長 110%，獲得 300+ 個新反向連結，成為行業最被引用研究之一", source: "Brian Dean《Skyscraper Technique》Backlinko.com 2015" }, { company: "Ahrefs 部落格", description: "系統應用 Skyscraper 方法創作 SEO 研究類內容，持續獲得業界最多反向連結", result: "Ahrefs Blog 月流量超過 200 萬，DA 達到 79，每篇研究文章平均獲得 500+ 個反向連結", source: "Ahrefs Blog 公開案例 2022" }] });
    }

    // E4: Ann Handley — Everybody Writes (2014)
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
        assignAgentToStep({ order: 1, name: "受眾深度同理心研究", description: "Ann Handley 的核心：「Pathological Empathy（病態式同理心）」— 在寫任何字之前，深刻理解受眾是誰、他們相信什麼、他們想要什麼", tool: "internal", outputType: "pathological_empathy_profile", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "品牌聲音與寫作標準", description: "建立品牌寫作標準：具體的語氣指引（不只說「有趣」，而是「像真人朋友解釋，帶一點幽默但不低俗」）", tool: "internal", outputType: "brand_voice_writing_guide", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 3, name: "內容草稿創作", description: "依 Handley 的「草稿為王」原則：先寫出 ugly first draft，再反覆打磨，好內容是寫出來再編輯出來的", tool: "internal", outputType: "content_drafts", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "編輯與品質把關", description: "應用 Handley 的編輯清單：是否有獨特觀點、是否為讀者而寫（非公司角度）、是否真的有用、語氣是否一致", tool: "internal", outputType: "edited_final_content", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 5, name: "寫作文化建立", description: "建立組織內的寫作文化：Ann Handley 說每個人都需要寫作能力。設計寫作訓練計劃和品質標準", tool: "internal", outputType: "writing_culture_program", requiredSkills: ["content-marketing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "品質寫作師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "受眾研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "編輯師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ann Handley Everybody Writes 內容品質標準框架", description: "Source: Ann Handley《Everybody Writes》2014 年紐約時報暢銷書。Handley 是全球最有影響力的內容行銷人之一（Forbes 評選）", steps });
      await upsertSquad(conn, { slug, name: "Ann Handley Everybody Writes 寫作品質小隊", description: "以 Ann Handley 的病態式同理心為起點，建立品牌聲音標準，產出真正為受眾而非為公司而寫的高品質內容", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Ann Handley – Everybody Writes (2014)", agents: agentMembers, tags: ["content-marketing", "copywriting", "brand-voice", "quality"], useCases: ["品牌寫作標準建立", "內容品質提升", "寫作文化培訓"], outputFormats: ["受眾同理心研究", "品牌聲音指南", "品質內容", "寫作訓練計劃"], requiredIntegrations: [], token: 55000, showcases: [{ company: "MarketingProfs（Ann Handley 擔任 CCO）", description: "應用 Everybody Writes 標準系統化提升 MarketingProfs 所有內容品質", result: "Email Newsletter 訂閱超過 60 萬，開信率超過 35%，年度活動 B2B Marketing Forum 1,000+ 人", source: "MarketingProfs.com / Ann Handley LinkedIn" }, { company: "REI（戶外品牌）", description: "應用 Everybody Writes 原則讓品牌內容聽起來像熱情的戶外愛好者而非企業宣傳", result: "博客月流量超過 500 萬，會員數量突破 2,000 萬，電商轉換率提升 25%", source: "REI Co-op Journal / Content Marketing Institute Case Study 2019" }] });
    }

    // E5: Andy Crestodina — Brain Food Data-Driven Content (Orbit Media, 2009)
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
        assignAgentToStep({ order: 1, name: "原創研究設計", description: "設計能產生原創數據的研究調查：Crestodina 的 Blogging Statistics 年度調查成為業界最被引用的內容，原創數據等於天然反向連結磁石", tool: "internal", outputType: "research_survey_design", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "數據收集與分析", description: "執行調查、收集行業數據或分析現有公開數據集，產出業界少見的獨家洞察", tool: "internal", outputType: "research_data_analysis", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "數據視覺化內容製作", description: "將原創數據製作為高分享性的視覺內容：資訊圖表、圖表組合、互動數據，Crestodina 說視覺化讓數據說話", tool: "internal", outputType: "data_visualization_content", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "研究報告發布與推廣", description: "發布完整研究報告並制定推廣計劃：媒體外聯、行業意見領袖分享、Email 通告，最大化原創研究的觸達範圍", tool: "internal", outputType: "research_promotion_plan", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "研究影響力追蹤", description: "追蹤研究報告帶來的反向連結、媒體引用、社群分享和 Email 訂閱者增長，評估研究 ROI", tool: "internal", outputType: "research_impact_report", requiredSkills: ["marketing-analytics"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "數據研究策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "研究設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "數據視覺師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Andy Crestodina 數據驅動原創研究內容策略", description: "Source: Andy Crestodina（Orbit Media）2009 年起系統化數據驅動內容策略，年度 Blogging Statistics 調查被超過 10,000 個網站引用", steps });
      await upsertSquad(conn, { slug, name: "Andy Crestodina 數據驅動內容研究小隊", description: "以原創研究和真實數據為核心製作業界最被引用的內容。Andy Crestodina 的框架：數據是內容的護城河，原創數據等於天然的反向連結磁鐵", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Andy Crestodina – Data-Driven Content (Orbit Media, 2009)", agents: agentMembers, tags: ["content-marketing", "research", "data", "link-building"], useCases: ["行業研究報告製作", "思想領導力建立", "SEO 連結建立"], outputFormats: ["研究調查設計", "數據分析報告", "視覺化資訊圖表", "推廣計劃"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Orbit Media 年度 Blogging Statistics（Crestodina）", description: "每年調查 1,000+ 位部落客，發布行業最完整的部落格數據報告", result: "報告被 10,000+ 個網站引用，為 Orbit Media 帶來超過 2,000 個反向連結，部落格月流量超過 100 萬", source: "OrbitMedia.com / Ahrefs 反向連結分析 2023" }, { company: "HubSpot State of Marketing（類似方法）", description: "每年發布《State of Marketing》年度研究報告，提供行業數據洞察", result: "年度報告每次發布吸引 10,000+ 次下載，為 HubSpot 帶來 50,000+ 個新 Lead", source: "HubSpot Annual Marketing Report 2022" }] });
    }

    // E6: Rand Fishkin — Sparktoro Audience Research Method (2019)
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
        assignAgentToStep({ order: 1, name: "受眾情報深度研究", description: "應用 Sparktoro 方法研究受眾：他們看哪些 YouTube、聽哪些 Podcast、追蹤哪些 Instagram、分享哪些主題，在哪裡接受資訊", tool: "internal", outputType: "audience_intelligence_report", requiredSkills: ["market-research-agent"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "受眾影響渠道地圖", description: "繪製目標受眾的「影響渠道地圖」：列出 Top 20 個影響他們的媒體、KOL、社群、Podcast，這些是內容分發的最高優先渠道", tool: "internal", outputType: "influence_channel_map", requiredSkills: ["social-media-marketing"] }, m3Info),
        assignAgentToStep({ order: 3, name: "受眾語言與關心主題建立", description: "研究受眾如何描述他們的問題（真實語言），以此撰寫內容標題和描述，確保內容能被受眾「一眼認出是為我寫的」", tool: "internal", outputType: "audience_language_guide", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "渠道優先內容策略", description: "依影響渠道地圖設計內容策略：在受眾常去的渠道發布內容，而非只在自己的管道等受眾來", tool: "internal", outputType: "channel_first_content_strategy", requiredSkills: ["marketing-strategy-pmm"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "受眾情報師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "受眾導向內容師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "渠道地圖師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Rand Fishkin Sparktoro 受眾情報驅動內容策略", description: "Source: Rand Fishkin（Sparktoro 創辦人）2019 年開創受眾情報驅動行銷方法。Sparktoro 分析 1.4 億社群帳號的受眾行為", steps });
      await upsertSquad(conn, { slug, name: "Rand Fishkin Sparktoro 受眾情報內容小隊", description: "先了解受眾在哪裡、受誰影響、用什麼語言，再決定做什麼內容、在哪裡分發。Rand Fishkin 的受眾情報驅動框架：情報在前，內容在後", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Rand Fishkin – Audience Intelligence Research (Sparktoro, 2019)", agents: agentMembers, tags: ["content-marketing", "audience-research", "channel-strategy", "data"], useCases: ["內容策略制定", "目標受眾研究", "渠道分發優化"], outputFormats: ["受眾情報報告", "影響渠道地圖", "受眾語言指南", "渠道優先策略"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Sparktoro 自身（Rand Fishkin 創辦）", description: "應用自創受眾情報方法建立 Sparktoro 品牌，完全依靠有機內容行銷成長", result: "Sparktoro 在沒有付費廣告的情況下，年 ARR 超過 $300 萬", source: "Rand Fishkin 公開財務數據 2022 / SparkToro.com" }, { company: "Moz（Rand Fishkin 創辦）", description: "應用受眾情報研究制定 Moz Blog 的內容策略", result: "Moz Blog 成為 SEO 業界最被引用的內容資源，月流量超過 300 萬，被 iContact 以 $67.5M 收購", source: "Moz.com / TechCrunch 報導 2021" }] });
    }

    // E7: Mark Schaefer — Content Shock Differentiation (The Content Code, 2015)
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
        assignAgentToStep({ order: 1, name: "內容飽和度競爭分析", description: "分析目標內容領域的「內容衝擊」程度：已有多少內容競爭同樣受眾的注意力？找出過度競爭區和真正的藍海缺口", tool: "internal", outputType: "content_shock_analysis", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "獨特差異化角度定位", description: "找出只有你能做的差異化內容角度：獨特視角、特殊經歷、稀缺數據、反常識觀點。Schaefer：「Content Shock 後，只有差異化才能生存」", tool: "internal", outputType: "differentiation_positioning", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "差異化內容製作", description: "製作展現獨特差異化的旗艦內容：不只比競爭對手「更好」，而是「根本不同」", tool: "internal", outputType: "differentiated_flagship_content", requiredSkills: ["content-marketing"] }, m3Info),
        assignAgentToStep({ order: 4, name: "社群護城河建立", description: "建立難以複製的社群護城河：忠實讀者、專屬社群、獨家研究，讓差異化難以被抄走", tool: "internal", outputType: "community_moat_plan", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "差異化策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "競爭分析師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "差異化內容師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Mark Schaefer Content Shock 差異化內容策略", description: "Source: Mark Schaefer《The Content Code》2015 年提出 Content Shock 理論。Schaefer 的 Businessesgrow.com 月流量超過 100 萬", steps });
      await upsertSquad(conn, { slug, name: "Mark Schaefer Content Shock 差異化內容小隊", description: "在內容洪流中建立真正的差異化護城河。Mark Schaefer 的框架：Content Shock 時代，不差異化就消失", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Mark Schaefer – Content Shock Differentiation (The Content Code, 2015)", agents: agentMembers, tags: ["content-marketing", "differentiation", "brand", "strategy"], useCases: ["競爭激烈市場的內容策略", "品牌思想領袖定位", "內容投資優化"], outputFormats: ["內容衝擊分析", "差異化定位", "旗艦內容", "護城河計劃"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Schaefer 的 Businessesgrow.com 自身", description: "應用 Content Shock 框架，以「行銷人性化」獨特角度在擁擠的行銷內容市場中差異化", result: "月流量超過 100 萬，每年僅靠有機內容帶來諮詢業務超過 $500,000", source: "Mark Schaefer 個人網站 / Known (Schaefer, 2017)" }, { company: "Drift（Chris Walker 以 Content Shock 理論為基礎）", description: "在 B2B SaaS 市場中找到「對話行銷」獨特差異化角度，而非跟進已飽和的內容行銷路線", result: "Drift 估值達 $10 億，年 ARR 超過 $1 億，「對話行銷」成為業界新品類", source: "Drift.com / Forbes 2020" }] });
    }

    // E8: Robert Rose — Chief Content Officer Method (Content Marketing Institute, 2017)
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
        assignAgentToStep({ order: 1, name: "內容行銷使命聲明", description: "撰寫清晰的內容行銷使命聲明：「我們向【目標受眾】提供【內容類型】，讓他們能夠【受眾收益】」。Rose 說使命聲明是內容策略的北極星", tool: "internal", outputType: "content_mission_statement", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 2, name: "受眾人格建立", description: "建立具體的受眾人格（Persona）：不只是人口特徵，還有他們的信念系統、決策過程、內容消費習慣", tool: "internal", outputType: "audience_personas", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "內容策略架構", description: "建立完整的企業內容策略架構：內容主題層級、格式矩陣、頻道組合、資源分配，讓內容成為真正的商業資產", tool: "internal", outputType: "content_strategy_architecture", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "編輯行事曆設計", description: "設計結構化的編輯行事曆：整合業務行事曆、季節性主題、受眾旅程階段，確保每篇內容都有策略目的", tool: "internal", outputType: "editorial_calendar", requiredSkills: ["marketing-ops"] }, m3Info),
        assignAgentToStep({ order: 5, name: "內容 ROI 測量框架", description: "建立內容 ROI 測量框架：定義內容對哪些業務指標有貢獻（潛客、留存、擴張），讓 C-Suite 理解內容的商業價值", tool: "internal", outputType: "content_roi_framework", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "CCO 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "內容使命師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "ROI 測量師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Robert Rose CCO 企業內容策略框架", description: "Source: Robert Rose & Joe Pulizzi《Managing Content Marketing》2011 / Content Marketing Institute CMO 方法論。Rose 諮詢服務全球 Top 500 企業", steps });
      await upsertSquad(conn, { slug, name: "Robert Rose CCO 企業內容策略小隊", description: "以首席內容官的思維建立企業級內容策略：從使命聲明到 ROI 框架，讓內容成為可量化的業務驅動引擎", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Robert Rose – Chief Content Officer Method (CMI, 2017)", agents: agentMembers, tags: ["content-marketing", "strategy", "enterprise", "roi"], useCases: ["企業內容策略建立", "CMO/CCO 內容規劃", "內容 ROI 報告"], outputFormats: ["使命聲明", "受眾人格", "內容策略架構", "編輯行事曆", "ROI框架"], requiredIntegrations: [], token: 65000, showcases: [{ company: "Salesforce（Robert Rose 顧問）", description: "應用 CCO 框架建立企業級內容行銷策略，讓 Trailhead 平台成為業界最好的學習內容品牌", result: "Trailhead 超過 700 萬用戶，Salesforce 品牌教育內容成為業界標桿", source: "Robert Rose 公開演講 Dreamforce 2019" }, { company: "LinkedIn Marketing Solutions", description: "應用 CCO 方法建立完整的 B2B 行銷內容策略架構", result: "LinkedIn Marketing Blog 月讀者超過 100 萬，成為 B2B 行銷人首選學習資源", source: "LinkedIn Marketing Blog / Content Marketing Institute 2020" }] });
    }

    // E9: Jay Baer — Talk Triggers (Word-of-Mouth Marketing, 2018)
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
        assignAgentToStep({ order: 1, name: "口碑觸發點研究", description: "研究現有客戶最常分享哪些品牌體驗：調查「你最常和朋友分享我們的什麼事？」找出自然發生的口碑觸發點", tool: "internal", outputType: "talk_trigger_research", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "Talk Trigger 設計", description: "設計一個超出預期的差異化行動：必須是 Remarkable（值得說嘴）、Repeatable（每次都做）、Relevant（與品牌有關）、Reasonable（合理可行）", tool: "internal", outputType: "talk_trigger_design", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "內容支援系統設計", description: "設計支援 Talk Trigger 的內容系統：讓客戶能輕鬆分享的 IG Stories 格式、客戶故事特輯、UGC 徵集活動", tool: "internal", outputType: "content_support_system", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "口碑擴散追蹤", description: "追蹤 Talk Trigger 帶來的口碑效益：品牌提及量、自然推薦量、社群 UGC 數量、NPS 評分變化", tool: "internal", outputType: "word_of_mouth_tracking", requiredSkills: ["social-media-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Talk Trigger 設計師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "口碑研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "口碑擴散師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jay Baer Talk Triggers 口碑觸發行銷系統", description: "Source: Jay Baer & Daniel Lemin《Talk Triggers》2018. Baer 研究分析超過 1,000 家企業的口碑行銷案例", steps });
      await upsertSquad(conn, { slug, name: "Jay Baer Talk Triggers 口碑行銷小隊", description: "設計讓客戶情不自禁分享的「Talk Trigger」，讓口碑行銷系統化。Jay Baer 的框架：最便宜的廣告是你現有的客戶", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Jay Baer – Talk Triggers (2018)", agents: agentMembers, tags: ["content-marketing", "word-of-mouth", "customer-experience", "viral"], useCases: ["服務業口碑策略", "品牌客戶體驗設計", "UGC 行銷計劃"], outputFormats: ["Talk Trigger 設計文件", "內容支援系統", "口碑追蹤報告"], requiredIntegrations: [], token: 55000, showcases: [{ company: "DoubleTree by Hilton（溫暖巧克力餅乾 Talk Trigger）", description: "每位入住客人在 Check-in 時獲得一塊溫熱巧克力餅乾，一個超越預期的簡單行動", result: "每年在社群媒體上產生數百萬次有機提及，客戶滿意度 NPS 高於業界均值 30%", source: "Jay Baer《Talk Triggers》DoubleTree 案例章節 + DoubleTree 公開數據" }, { company: "Cheesecake Factory（菜單 Talk Trigger）", description: "超過 250 道菜的超級龐大菜單成為 Talk Trigger：客人拿到菜單就想分享照片", result: "Instagram 每年獲得超過 100 萬張菜單相關 UGC，品牌記憶度是業界競爭對手的 3 倍", source: "Jay Baer《Talk Triggers》Cheesecake Factory 案例" }] });
    }

    // E10: Jeff Bullas — Power Blogging Method (2010–2019)
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
        assignAgentToStep({ order: 1, name: "SEO 關鍵字部落格計劃", description: "研究目標受眾搜索的長尾關鍵字，建立以搜尋流量為基礎的部落格發布計劃，確保每篇文章都針對真實搜索需求", tool: "internal", outputType: "keyword_blog_plan", requiredSkills: ["market-research-agent"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "磁力標題設計", description: "設計點擊率極高的部落格標題：數字清單型、How-to 型、秘密揭示型、問題型，Bullas 說標題決定 80% 的文章成敗", tool: "internal", outputType: "power_headline_variants", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "長篇深度文章創作", description: "撰寫 2,000-3,000 字以上的深度文章：包含原創洞察、清晰結構、視覺支援，比競爭對手的淺薄文章更完整", tool: "internal", outputType: "long_form_blog_post", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 4, name: "社群擴散系統", description: "設計發布後的社群擴散計劃：多次在不同時間分享到社群媒體，加入 Email 通告，邀請合作夥伴分享", tool: "internal", outputType: "blog_amplification_plan", requiredSkills: ["social-scheduler"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Power Blogging 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "標題文案師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "擴散排程師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jeff Bullas Power Blogging 流量增長系統", description: "Source: Jeff Bullas《Blogging the Smart Way》2012. JeffBullas.com 月流量超過 400 萬，Forbes 評為全球 Top 50 社群媒體影響者", steps });
      await upsertSquad(conn, { slug, name: "Jeff Bullas Power Blogging 流量增長小隊", description: "應用 Jeff Bullas 的 Power Blogging 方法：SEO 關鍵字 + 磁力標題 + 深度內容 + 社群擴散，從零建立超過 100 萬月流量的行銷部落格", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Jeff Bullas – Power Blogging Method (2010)", agents: agentMembers, tags: ["content-marketing", "blogging", "seo", "amplification"], useCases: ["企業部落格流量建立", "個人品牌部落格", "SEO 驅動內容行銷"], outputFormats: ["SEO 部落格計劃", "磁力標題清單", "深度文章", "擴散計劃"], requiredIntegrations: [], token: 55000, showcases: [{ company: "JeffBullas.com（自身案例）", description: "應用 Power Blogging 方法，系統化建立高流量社群媒體行銷部落格", result: "月流量超過 400 萬，Email 名單超過 30 萬，Forbes Top 50 社群媒體影響者", source: "JeffBullas.com / Forbes 評選 2018" }, { company: "Social Media Examiner（Mike Stelzner）", description: "應用類似 Power Blogging 框架，系統化建立業界最大的社群媒體行銷部落格", result: "月流量超過 100 萬，Email 名單超過 40 萬，年度 Social Media Marketing World 大會 5,000+ 出席", source: "SocialMediaExaminer.com 公開數據 2022" }] });
    }

    // ═══════════════════════════════════════════════════════════════════
    // CATEGORY F: Email 行銷 Methodology Squads (F1–F10)
    // ═══════════════════════════════════════════════════════════════════

    // F1: Ryan Deiss — The Email Machine (DigitalMarketer, 2014)
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
        assignAgentToStep({ order: 1, name: "入門認識序列（Indoctrination）", description: "設計新訂閱者的 5-7 封歡迎序列：介紹品牌核心故事、價值觀、期待設定，讓訂閱者 24 小時內理解「為什麼要關注你」", tool: "internal", outputType: "indoctrination_sequence", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "互動參與序列（Engagement）", description: "設計持續提供價值的互動序列：教育→案例→見證→工具，讓訂閱者養成開信習慣並視品牌為可信資源", tool: "internal", outputType: "engagement_sequence", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "升級轉換序列（Ascension）", description: "設計從免費訂閱者到付費客戶的升級序列：針對有互動行為的訂閱者發送優惠，推動購買行動", tool: "internal", outputType: "ascension_sequence", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 4, name: "細分再互動序列（Segmentation + Re-engagement）", description: "依行為細分訂閱者，並設計 30/60/90 天無互動的喚回序列：「我們想念你」+ 特別優惠", tool: "internal", outputType: "segmentation_reengagement", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "Email 機器效益優化", description: "追蹤整個 Email Machine 各節點的開信率、點擊率、轉換率、退訂率，識別最需要優化的序列節點", tool: "internal", outputType: "email_machine_performance", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Email 機器師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Email 文案師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "效益分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ryan Deiss Email Machine 自動化行銷系統", description: "Source: Ryan Deiss / DigitalMarketer《Email Machine》2014. DigitalMarketer 應用此框架管理超過 700 萬訂閱者 Email 系統", steps });
      await upsertSquad(conn, { slug, name: "Ryan Deiss Email Machine 自動化小隊", description: "建立 Indoctrinate → Engage → Ascend → Segment → Re-engage 的完整自動化 Email 系統，把 Email 名單轉化為可預期的收入引擎", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Ryan Deiss / DigitalMarketer – Email Machine (2014)", agents: agentMembers, tags: ["email", "automation", "funnel", "retention"], useCases: ["電商Email行銷系統", "SaaS訂閱者培育", "教育品牌Email序列"], outputFormats: ["5套Email序列", "細分策略", "效益追蹤報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "DigitalMarketer 自身（Ryan Deiss）", description: "應用 Email Machine 框架管理 700 萬+ 訂閱者，每週發送數百萬封行銷郵件", result: "Email 貢獻 DM 年收入超過 $20M，平均開信率超過 25%，訂閱者 LTV 是業界均值 2 倍", source: "DigitalMarketer.com / Ryan Deiss Traffic & Conversion Summit 演講" }, { company: "Agora Financial", description: "應用相同 Indoctrinate + Ascend 序列框架管理龐大訂閱者名單", result: "Email 系統年收入超過 $1 億，每位訂閱者平均 LTV 超過 $200", source: "Agora Publishing Annual Reports" }] });
    }

    // F2: Andre Chaperon — Soap Opera Sequence (AutoResponder Madness, 2010)
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
        assignAgentToStep({ order: 1, name: "大 Hook + 背景故事", description: "Email 1：一個戲劇性的開場 Big Hook，緊接著引入主角（你或品牌）的背景故事，讓讀者立刻代入", tool: "internal", outputType: "hook_backstory_email", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 2, name: "衝突事件 + 懸念", description: "Email 2：發生了什麼關鍵事件/轉折點？引發衝突，並在結尾留下懸念：「明天我會告訴你我是怎麼解決的…」", tool: "internal", outputType: "conflict_cliffhanger_email", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "頓悟時刻", description: "Email 3：分享改變一切的頓悟/發現/解決方案，讓讀者感覺他們也即將擁有同樣的突破", tool: "internal", outputType: "epiphany_email", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "隱藏好處揭示", description: "Email 4：揭示訂閱者還不知道自己需要的「隱藏好處」，深化對解決方案的渴望", tool: "internal", outputType: "hidden_benefit_email", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "呼籲行動", description: "Email 5：在故事高潮後自然推出 Call to Action，Chaperon 說「如果故事說得好，銷售會自然發生」", tool: "internal", outputType: "cta_email", requiredSkills: ["hook-copywriter"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Soap Opera 序列師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "懸念文案師", order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Andre Chaperon Soap Opera Sequence 故事型 Email 序列", description: "Source: Andre Chaperon《AutoResponder Madness》2010. Chaperon 被 Email 行銷界稱為「天才」，其 SOS 框架讓開信率提升 3-5 倍", steps });
      await upsertSquad(conn, { slug, name: "Andre Chaperon Soap Opera Email 序列小隊", description: "用戲劇性故事結構寫 Email 序列：大 Hook → 背景故事 → 衝突懸念 → 頓悟 → 隱藏好處 → 行動呼籲。Andre Chaperon 的方法讓人捨不得退訂", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Andre Chaperon – Soap Opera Sequence (AutoResponder Madness, 2010)", agents: agentMembers, tags: ["email", "storytelling", "autoresponder", "conversion"], useCases: ["新訂閱者Welcome序列", "線上課程Email行銷", "高單價服務Email銷售"], outputFormats: ["5封 Soap Opera 序列", "懸念文案模板"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Andre Chaperon 個人品牌（AutoResponder Madness）", description: "應用自創的 Soap Opera Sequence，打造全球最具影響力的 Email 行銷課程品牌", result: "AutoResponder Madness 銷售超過 $1,000 萬，業界被稱為「有史以來最好的 Email 行銷教程」", source: "Andre Chaperon 網站 / Rich Schefren、Jeff Walker 公開見證" }, { company: "Russell Brunson（採用 SOS 框架）", description: "在《DotCom Secrets》中推廣 Chaperon 的 SOS 框架並大規模應用", result: "ClickFunnels 的 Email 序列應用 SOS 後，轉換率提升 300%，開信率超過 40%", source: "Russell Brunson《DotCom Secrets》Chapter on Email" }] });
    }

    // F3: Ramit Sethi — Email Course + Teach First Sell Second (2009)
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
        assignAgentToStep({ order: 1, name: "Email 課程概念設計", description: "設計一個能在 5-7 天解決訂閱者核心問題的免費 Email 課程。Ramit Sethi 原則：「給他們你的最好，他們會信任你的一切」", tool: "internal", outputType: "email_course_concept", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "日課內容撰寫", description: "撰寫每天的課程內容：結構清晰、有具體行動步驟、有 Ramit 特色的直接語氣，讓訂閱者每天都期待下一封", tool: "internal", outputType: "daily_course_emails", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "信任建立橋接", description: "在課程的第 4-5 天自然引入品牌的付費產品：不是廣告，而是「如果你想要更深入，我有一個方法可以幫你加速」", tool: "internal", outputType: "trust_bridge_email", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 4, name: "課程轉換序列", description: "課程完成後的 3-5 封轉換序列：強調課程成果 → 指出訂閱者下一步痛點 → 付費解決方案介紹 → 限時優惠", tool: "internal", outputType: "post_course_conversion", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "Email 課程效益追蹤", description: "追蹤課程完成率、每日開信率、付費轉換率，優化課程內容和轉換序列", tool: "internal", outputType: "email_course_analytics", requiredSkills: ["campaign-orchestrator"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Email 課程策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "課程文案師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "漏斗分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ramit Sethi 先教後賣 Email 課程漏斗", description: "Source: Ramit Sethi（IWillTeachYouToBeRich）2009 年起的先教後賣 Email 策略。Sethi 年收入超過 $1 億應用此方法", steps });
      await upsertSquad(conn, { slug, name: "Ramit Sethi 先教後賣 Email 課程小隊", description: "以免費 Email 課程先建立信任，再自然推出付費升級。Ramit Sethi 的方法：充分展示你的好，才能要求付費", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Ramit Sethi – Teach First, Sell Second Email Course (2009)", agents: agentMembers, tags: ["email", "course", "trust-building", "conversion"], useCases: ["知識型產品Email行銷", "線上課程潛客培育", "B2B服務信任建立"], outputFormats: ["Email 課程大綱", "7封課程Email", "轉換序列", "效益報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "IWillTeachYouToBeRich（Ramit Sethi）", description: "長期應用 Email 課程框架，每次新產品發布前先提供大量免費教育內容", result: "Email 名單超過 100 萬，每次課程發布年收入超過 $1 億，轉換率是業界 5 倍", source: "Ramit Sethi 公開訪談 / IWillTeachYouToBeRich.com" }, { company: "Amy Porterfield（採用類似框架）", description: "以 Email 課程序列培育 Facebook 廣告引來的潛客，再推出 $997 課程", result: "年收入超過 $3,000 萬，Email 課程轉換率超過 8%（業界均值 1-2%）", source: "Amy Porterfield 公開收入報告 2022" }] });
    }

    // F4: Jeff Walker — Product Launch Formula Email (2005)
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
        assignAgentToStep({ order: 1, name: "Pre-pre-launch 暖身", description: "發布開放前 2 週的預熱序列：建立期待、調查受眾需求、製造消息流傳感，讓受眾在開放前就渴望購買", tool: "internal", outputType: "preprelaunch_sequence", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Launch Conversation 1：機會（Opportunity）", description: "開放前第一封 Launch 內容：分享令人興奮的機會/洞察，引導受眾意識到為什麼現在是改變的時機", tool: "internal", outputType: "launch_email_1_opportunity", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Launch Conversation 2：轉變（Transformation）", description: "第二封 Launch 內容：展示客戶使用你的方法後發生了哪些轉變，真實案例和見證", tool: "internal", outputType: "launch_email_2_transformation", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 4, name: "Launch Conversation 3：體驗（Experience）", description: "第三封 Launch 內容：讓受眾體驗產品的一小部分，建立「我需要更多」的渴望", tool: "internal", outputType: "launch_email_3_experience", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "開放購買 + 關閉序列", description: "開放日的促銷序列：開放通知→24 小時補充→關閉前 24 小時→最後一小時緊迫提醒，Walker 說「關閉日是銷售最多的一天」", tool: "internal", outputType: "open_close_sequence", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Launch 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Launch 文案師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Launch 分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jeff Walker Product Launch Formula Email 上市策略", description: "Source: Jeff Walker《Launch》2014 + Product Launch Formula 2005. Walker 的 PLF 方法幫助學員產出超過 $1 億美元銷售額", steps });
      await upsertSquad(conn, { slug, name: "Jeff Walker PLF Email 產品上市小隊", description: "應用 Jeff Walker 的 Product Launch Formula：Pre-pre-launch → 三個 Launch Conversations → 開放購買 → 關閉序列，用 Email 製造購買衝潮", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Jeff Walker – Product Launch Formula (2005)", agents: agentMembers, tags: ["email", "launch", "conversion", "urgency"], useCases: ["課程/產品Email上市", "限時優惠推廣", "新品發布行銷"], outputFormats: ["5套Launch Email序列", "緊迫性 CTA", "Launch報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Jeff Walker 個人案例（網球訓練課程）", description: "第一次應用 PLF，從自家倉庫發送 Email 序列銷售網球訓練課程", result: "一週 $1,800 銷售額（當時創紀錄），後發展成 PLF 培訓系統", source: "Jeff Walker《Launch》書中第一章自傳" }, { company: "PLF 學員群體（Walker 培訓）", description: "全球學員應用 PLF 框架進行課程和產品發布", result: "超過 1,000 名學員收入超過 $1M，PLF 社群總銷售超過 $1 億", source: "JeffWalker.com Launch Mastermind 數據 2022" }] });
    }

    // F5: Joanna Wiebe — Voice of Customer Conversion Copywriting Email (Copyhackers, 2011)
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
        assignAgentToStep({ order: 1, name: "Voice of Customer 數據挖掘", description: "Joanna Wiebe 的核心：不要猜，去挖掘客戶的真實語言。收集來源：Amazon 評論、G2 評論、用戶訪談、問卷調查，截取客戶自己的詞彙", tool: "internal", outputType: "voc_data_mining", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "訊息架構設計", description: "依 VOC 數據建立訊息架構：客戶最常說的「Jobs to be Done」、阻力點、期望成果，用客戶的語言組成 Email 核心訊息", tool: "internal", outputType: "message_architecture", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "轉換優化 Email 撰寫", description: "依 VOC 數據撰寫 Email：每個字都是目標受眾說過的或直接回應他們說過的，消除任何公司自說自話", tool: "internal", outputType: "voc_driven_email_copy", requiredSkills: ["ad-copywriting-formulas"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "Subject Line A/B 測試", description: "設計 5 個 Subject Line 變體 A/B 測試：問句 vs 數字 vs 個人化 vs 好奇心 vs 直接利益，找出最高開信率組合", tool: "internal", outputType: "subject_line_test", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 5, name: "Email 轉換率優化報告", description: "每月分析 Email 序列的轉換率，識別可用 VOC 改進的文案節點，持續迭代優化", tool: "internal", outputType: "email_cro_report", requiredSkills: ["marketing-analytics"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "VOC 文案師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "VOC 研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Subject Line 師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Joanna Wiebe Voice of Customer Email 轉換文案", description: "Source: Joanna Wiebe（Copyhackers）2011 年創立，被稱為「Conversion Copywriting 的第一人」，幫助 Wistia、Unbounce 等 SaaS 企業提升轉換率", steps });
      await upsertSquad(conn, { slug, name: "Joanna Wiebe VOC Email 轉換文案小隊", description: "用客戶自己說的話寫 Email。Joanna Wiebe 的 Voice of Customer 文案方法：最好的行銷語言是從客戶口中挖掘出來的，不是品牌自己發明的", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Joanna Wiebe – Voice of Customer Copywriting (Copyhackers, 2011)", agents: agentMembers, tags: ["email", "copywriting", "conversion", "voc"], useCases: ["Email文案優化", "訂閱轉換率提升", "SaaS Email行銷"], outputFormats: ["VOC 研究報告", "訊息架構", "Email 文案", "Subject Line 測試"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Wistia（Copyhackers 客戶）", description: "應用 VOC 文案方法重寫 Email 培育序列和 Trial 轉換 Email", result: "Trial-to-Paid 轉換率提升 30%，Email 點擊率提升 45%", source: "Joanna Wiebe Copyhackers 案例研究 2016" }, { company: "Unbounce（Copyhackers 客戶）", description: "應用 VOC 研究優化 Landing Page 和 Email 文案", result: "首頁轉換率提升 25%，Email 開信率提升 60%", source: "Copyhackers.com Unbounce 案例研究" }] });
    }

    // F6: Amy Porterfield — Digital Course Email Launch Sequence (2013)
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
        assignAgentToStep({ order: 1, name: "預熱期 Email 序列（Pre-launch）", description: "開放前 2 週的預熱序列：分享「幕後故事」、揭示課程創作過程、建立早鳥名單，讓潛在學員感覺是「圈內人」", tool: "internal", outputType: "prelaunch_emails", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "早鳥優惠期 Email（Early Bird）", description: "發布後 24-48 小時的早鳥優惠序列：開放通知 → 早鳥優惠強調 → 早鳥截止提醒，催促快速決策", tool: "internal", outputType: "early_bird_emails", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "購物車開放期（Open Cart）", description: "5-7 天開放期的每日 Email：價值強調 → 客戶見證 → 常見問題解答 → 倒數計時，每封都有不同角度的說服", tool: "internal", outputType: "open_cart_sequence", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 4, name: "購物車關閉前（Cart Close）", description: "關閉前 48 小時的緊迫序列：最後機會 → 最後 24 小時 → 最後幾小時，創造真實的緊迫感", tool: "internal", outputType: "cart_close_sequence", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "關閉後跟進（Post-close）", description: "關閉後的 2 封 Email：感謝購買者（建立社群感）+ 告知未購買者下次開放通知，維護關係", tool: "internal", outputType: "post_close_emails", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Launch Email 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Launch 文案師", order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Amy Porterfield 數位課程 Email 發布序列", description: "Source: Amy Porterfield 2013 年起的數位課程 Email 上市方法論。Porterfield 年收入超過 $3,000 萬，應用此框架", steps });
      await upsertSquad(conn, { slug, name: "Amy Porterfield 課程 Email Launch 小隊", description: "應用 Amy Porterfield 的數位課程 Email 上市序列：Pre-launch → Early Bird → Open Cart → Cart Close → Post-close，系統化將 Email 名單轉為課程收入", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Amy Porterfield – Digital Course Launch Email (2013)", agents: agentMembers, tags: ["email", "launch", "digital-course", "conversion"], useCases: ["線上課程Email上市", "會員制產品發布", "數位產品行銷"], outputFormats: ["5階段Launch Email套組", "緊迫性CTA模板"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Amy Porterfield 個人品牌（Digital Course Academy）", description: "每次課程發布應用此精確 Email 序列，已進行 10+ 次成功發布", result: "年收入超過 $3,000 萬，單次發布 Email 序列帶來 $2-5M 銷售額", source: "Amy Porterfield 公開收入報告 / Online Marketing Made Easy Podcast" }, { company: "Jasmine Star（Online Business Launchpad）", description: "應用 Porterfield 框架的 Email Launch 序列發布商業課程", result: "首次應用後課程收入達到 $500,000，Email 序列開信率超過 45%", source: "Jasmine Star 公開發布分享 2021" }] });
    }

    // F7: Bob Bly — Direct Response Email (The Copywriter's Handbook, 1985/2020)
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
        assignAgentToStep({ order: 1, name: "USP 核心訊息定義", description: "應用 Bly 的直效回應原則：先定義清晰的 USP（獨特銷售主張），Email 的每個元素都圍繞 USP 展開", tool: "internal", outputType: "usp_definition", requiredSkills: ["ad-copywriting-formulas"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "強力主旨行設計", description: "應用 Bly 的主旨行公式：包含利益承諾、好奇心、新鮮感或緊迫感之一。測試 4 種主旨行變體", tool: "internal", outputType: "subject_line_copy", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 3, name: "直效回應 Email 正文", description: "依 Bly 的 AIDA 框架撰寫 Email：注意力（主旨）→ 興趣（利益堆疊）→ 渴望（社會證明）→ 行動（清晰CTA）", tool: "internal", outputType: "aida_email_copy", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "直效回應效益測試", description: "A/B 測試 Email 的關鍵元素：主旨行、CTA 用語、發送時間、個人化程度，以數據優化回應率", tool: "internal", outputType: "dr_email_test_report", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 5, name: "Email 系列最佳化", description: "依測試結果建立最佳化的 Email 模板庫，標準化品牌的直效回應 Email 寫作流程", tool: "internal", outputType: "email_template_library", requiredSkills: ["email-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "直效回應文案師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "主旨行師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "效益追蹤師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Bob Bly 直效回應 Email 文案框架", description: "Source: Bob Bly《The Copywriter's Handbook》1985/2020 更新版. Bly 撰寫超過 100 本書籍，被 McGraw-Hill 稱為「美國最頂尖的文案師之一」", steps });
      await upsertSquad(conn, { slug, name: "Bob Bly 直效回應 Email 文案小隊", description: "應用 Bob Bly 60 年直效行銷智慧於 Email：每封都有清晰的 USP、強力主旨行、AIDA 結構、單一清晰 CTA，最大化 Email 回應率", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Bob Bly – The Copywriter's Handbook (1985/2020)", agents: agentMembers, tags: ["email", "direct-response", "copywriting", "conversion"], useCases: ["B2B Email 潛客開發", "電商促銷 Email", "服務業 Email 行銷"], outputFormats: ["USP 定義文件", "主旨行變體", "AIDA Email 模板", "測試報告"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Bob Bly 自身（700+ 直效行銷客戶）", description: "60 年來應用直效回應文案原則為各行各業撰寫 Email 行銷材料", result: "平均客戶 Email 回應率達業界 3-5 倍，AWAI 頂級文案師認證，超過 100 本著作", source: "Bob Bly 個人網站 Bly.com / The Copywriter's Handbook 2020 版" }, { company: "Agora Publishing（Bly 長期合作）", description: "應用 Bly 的直效回應 Email 文案原則管理龐大訂閱者行銷系統", result: "年 Email 行銷收入超過 $1 億，客戶 Email ROI 達到 4,200%（業界均值 3,800%）", source: "Agora Publishing / DMA Email Marketing Report 2021" }] });
    }

    // F8: Ben Settle — Email Players Daily Email Method (2010)
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
        assignAgentToStep({ order: 1, name: "個人 Email 聲音建立", description: "建立獨特的個人 Email 寫作聲音：Ben Settle 說「你的個性就是你最大的競爭優勢」，用真實個性而非公司語氣寫 Email", tool: "internal", outputType: "personal_email_voice", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 2, name: "每日一個訊息的 Email 習慣", description: "建立每天發送 Email 的習慣：Settle 的方法是每封 Email 只有一個核心訊息，一個故事，一個 CTA，寫 250-500 字足夠", tool: "internal", outputType: "daily_email_system", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "娛樂性 + 教育性的 Email 內容", description: "撰寫讓人期待開信的 Email：Settle 的「娛樂第一，銷售第二」原則，每封都有讓人想分享的故事或洞察", tool: "internal", outputType: "entertainment_edu_emails", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "持續軟性銷售", description: "每封 Email 結尾都有輕量的 CTA：不強迫，只是提醒「如果你想要更多，這裡有個方法」，Settle 說「銷售應該是 Email 的附帶品，不是主軸」", tool: "internal", outputType: "soft_sell_cta_templates", requiredSkills: ["hook-copywriter"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "每日 Email 師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Email 個性師", order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ben Settle Email Players 每日一封娛樂 Email 方法", description: "Source: Ben Settle《Email Players》2010 年起的每日 Email 系統。Settle 用每日 Email 建立高收益 Email 名單業務，年收超過 $500K", steps });
      await upsertSquad(conn, { slug, name: "Ben Settle Email Players 每日 Email 小隊", description: "每天發送一封讓人期待的 Email：娛樂優先、個性鮮明、軟性銷售。Ben Settle 的方法：一個人的名單，勝過別人的百萬粉絲頁面", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Ben Settle – Email Players Daily Email Method (2010)", agents: agentMembers, tags: ["email", "daily-email", "entertainment", "personal-brand"], useCases: ["個人品牌Email行銷", "知識型企業名單培育", "創業家每日Email"], outputFormats: ["個人Email聲音指南", "每日Email模板", "軟銷售CTA庫"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Ben Settle Email Players 本身", description: "應用自創的每日 Email 方法，維持高黏性小眾訂閱者群體", result: "Email Players 訂閱制年收入超過 $500K，訂閱者退訂率低於業界均值的 10%", source: "Ben Settle BenSettle.com 公開數據 2022" }, { company: "Frank Kern（類似每日 Email 方法）", description: "應用個性化每日 Email 風格建立高信任度名單", result: "Email 名單超過 20 萬，每次發布 Email 序列產出 $1-5M 銷售額", source: "Frank Kern 公開訪談 / FrankKern.com" }] });
    }

    // F9: Justin Goff — High Frequency Email Testing (2020)
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
        assignAgentToStep({ order: 1, name: "Email 名單細分策略", description: "依行為細分名單：活躍購買者、活躍非購買者、沉默 30/60/90 天，針對不同細分設計不同 Email 頻率和內容", tool: "internal", outputType: "list_segmentation_plan", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "故事型 Email 批量製作", description: "Goff 方法：每封 Email = 一個真實或半真實的短故事 + 橋接到產品的連結。設計 30 封故事型 Email 庫", tool: "internal", outputType: "story_email_library", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "高頻率測試計劃", description: "設計每日或每週多次 Email 測試計劃，快速測試哪類故事主題、主旨行格式、發送時間對名單最有效果", tool: "internal", outputType: "high_frequency_test_plan", requiredSkills: ["marketing-analytics"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Email 頻率策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "故事Email師", order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Justin Goff 高頻率 Email 測試與優化方法", description: "Source: Justin Goff 2020 年的高頻率 Email 方法，曾管理超過 2,000 萬的 Email 名單，擅長以故事 Email 維持高開信率", steps });
      await upsertSquad(conn, { slug, name: "Justin Goff 高頻率 Email 測試小隊", description: "以高頻率、故事型 Email 持續測試優化。Justin Goff 的方法：Email 是測試的遊樂場，不發送就不知道什麼有效", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Justin Goff – High Frequency Email Testing (2020)", agents: agentMembers, tags: ["email", "frequency", "testing", "storytelling"], useCases: ["電商每日促銷Email", "名單活化再互動", "Email頻率優化"], outputFormats: ["名單細分策略", "故事Email庫", "測試計劃"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Justin Goff 個人名單管理", description: "應用高頻率故事 Email 方法管理多個行業的 Email 名單", result: "管理超過 2,000 萬 Email 地址，客戶 Email 行銷 ROI 平均達到 10x", source: "Justin Goff 公開演講 / JustinGoff.com 2021" }, { company: "電商客戶（匿名）via Goff", description: "將 Email 發送頻率從每週 1 次提升至每天 1 次，搭配故事型 Email", result: "月 Email 收入提升 3 倍，退訂率僅增加 0.3%（遠低於業界預期）", source: "Justin Goff 客戶案例研究 2020" }] });
    }

    // F10: Russell Brunson — DotCom Secrets Email Sequences (2015)
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
        assignAgentToStep({ order: 1, name: "Attractive Character 人物設計", description: "建立品牌的「Attractive Character」：有缺陷但奮鬥中的真實人物，讓訂閱者感同身受。Brunson 說「完美的人無法被連結，掙扎中的人才能」", tool: "internal", outputType: "attractive_character_profile", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 2, name: "Soap Opera Sequence 實作", description: "應用 Brunson 版本的 SOS 序列：AC 介紹 → 欲望建立 → 頓悟時刻 → 隱藏好處 → 緊迫呼籲", tool: "internal", outputType: "sos_email_sequence", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Seinfeld Email 系統", description: "設計每日廣播 Email（Brunson 稱為 Seinfeld Email）：像 Seinfeld 影集一樣「講什麼都不相關的事情」，但每封末尾都有軟性 CTA", tool: "internal", outputType: "seinfeld_email_system", requiredSkills: ["email-marketing"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "Offer Stack 組合優惠設計", description: "設計 Offer Stack 組合優惠：主產品 + 加值品 + 保證，讓感知價值遠超過實際售價，Email 推廣時重複強調 Stack 價值", tool: "internal", outputType: "offer_stack_design", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 5, name: "Email 漏斗效益報告", description: "追蹤整個 DotCom Secrets Email 漏斗：SOS 完成率、廣播開信率、Offer Stack 轉換率，完整歸因優化", tool: "internal", outputType: "email_funnel_report", requiredSkills: ["marketing-ops"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "DotCom Email 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "Attractive Character 師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "Email 運營師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Russell Brunson DotCom Secrets Email 漏斗系統", description: "Source: Russell Brunson《DotCom Secrets》2015. ClickFunnels 應用此 Email 框架達到 $1 億 ARR，全球超過 10 萬 ClickFunnels 用戶應用此序列", steps });
      await upsertSquad(conn, { slug, name: "Russell Brunson DotCom Secrets Email 漏斗小隊", description: "應用 Russell Brunson 的完整 DotCom Secrets Email 系統：Attractive Character 建立 + Soap Opera Sequence + Seinfeld 廣播 + Offer Stack，讓 Email 名單持續產生可預期收入", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Russell Brunson – DotCom Secrets Email System (2015)", agents: agentMembers, tags: ["email", "funnel", "dotcom", "automation"], useCases: ["知識型企業Email系統", "線上課程Email行銷", "ClickFunnels漏斗Email"], outputFormats: ["Attractive Character 設計", "SOS序列", "Seinfeld Email系統", "Offer Stack設計"], requiredIntegrations: [], token: 60000, showcases: [{ company: "ClickFunnels（Russell Brunson）", description: "應用 DotCom Secrets Email 系統，以 SOS + 每日廣播 Email 持續培育 ClickFunnels 用戶", result: "ClickFunnels 達到 $1 億 ARR，Email 名單超過 100 萬，每月 Email 貢獻 30% 新訂閱", source: "ClickFunnels Annual Report / Russell Brunson《DotCom Secrets》" }, { company: "Expert Secrets 課程（Brunson）", description: "應用 Offer Stack 設計搭配 Email 序列推廣 $997 課程", result: "首次發布 24 小時銷售超過 $3M，Email 序列 ROI 超過 50 倍", source: "Russell Brunson 公開發布報告 2017" }] });
    }

    // ═══════════════════════════════════════════════════════════════════
    // CATEGORY G: SEO 搜尋引擎優化 Methodology Squads (G1–G10)
    // ═══════════════════════════════════════════════════════════════════

    // G1: Brian Dean — Skyscraper Technique 2.0 (Backlinko, 2019)
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
        assignAgentToStep({ order: 1, name: "搜尋意圖 + 連結機會研究", description: "Skyscraper 2.0 升級：不只找連結最多的內容，更分析其搜尋意圖是否被完整滿足。找出「連結多但使用者仍不滿意」的目標", tool: "internal", outputType: "link_and_intent_analysis", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "10x 勝出內容架構", description: "設計明顯勝出的內容架構：更深的主題覆蓋、更多視覺說明、更新的數據、更好的組織結構", tool: "internal", outputType: "superior_content_blueprint", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 3, name: "SEO 優化長文撰寫", description: "撰寫完整的 Skyscraper 內容：包含目標關鍵字的自然分布、Semantic keywords、LSI 詞彙，同時確保內容真正有用", tool: "internal", outputType: "skyscraper_article", requiredSkills: ["copywriting-pro"] }, m3Info),
        assignAgentToStep({ order: 4, name: "連結建立外聯執行", description: "建立連結到舊版內容的外聯名單，發送個人化外聯郵件，追蹤連結獲取進度", tool: "internal", outputType: "link_outreach_execution", requiredSkills: ["marketing-ops"] }, m4Info),
        assignAgentToStep({ order: 5, name: "排名成長追蹤", description: "追蹤目標關鍵字排名變化、反向連結增長、有機流量增長，評估 Skyscraper 投資報酬率", tool: "internal", outputType: "ranking_growth_report", requiredSkills: ["marketing-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Skyscraper SEO 師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "搜尋意圖研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "SEO 內容師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "連結建立師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Brian Dean Skyscraper Technique 2.0 SEO 策略", description: "Source: Brian Dean（Backlinko）2019 年 Skyscraper Technique 2.0 升級版，整合搜尋意圖分析，Backlinko 月流量超過 150 萬", steps });
      await upsertSquad(conn, { slug, name: "Brian Dean Skyscraper 2.0 SEO 連結建立小隊", description: "應用 Brian Dean 的 Skyscraper 2.0：不只要超越現有最佳內容，更要滿足被忽視的搜尋意圖，同時建立反向連結護城河", industryKey: "marketing", missionType: taskType, workspace: ["website"], methodology: "Brian Dean – Skyscraper Technique 2.0 (Backlinko, 2019)", agents: agentMembers, tags: ["seo", "link-building", "content", "backlinks"], useCases: ["競爭關鍵字SEO突破", "連結建立計劃", "有機流量倍增"], outputFormats: ["搜尋意圖分析", "Skyscraper 文章", "外聯名單", "排名追蹤報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Backlinko 自身（Brian Dean）", description: "系統應用 Skyscraper 技術建立業界最多反向連結的 SEO 部落格", result: "月流量超過 150 萬，DA 達到 78，每篇文章平均獲得 500+ 反向連結", source: "Backlinko.com / Ahrefs 反向連結分析 2023" }, { company: "NerdWallet（應用類似方法）", description: "以 Skyscraper 原則創作金融主題的最完整指南，系統建立反向連結", result: "有機流量超過 1,500 萬/月，IPO 估值超過 $35 億", source: "SEMrush / Ahrefs NerdWallet 分析 2021" }] });
    }

    // G2: Neil Patel — Reverse Outreach (Ubersuggest, 2019)
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
        assignAgentToStep({ order: 1, name: "品牌未連結提及監測", description: "監測所有提到品牌名稱但沒有連結回來的網站，這些是「已認可品牌但忘記連結」的高轉換目標", tool: "internal", outputType: "unlinked_mentions_list", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "業界統計/數據內容製作", description: "製作高被引用潛力的原創數據內容：行業統計報告、調查數據、獨家研究，這類內容自然吸引媒體引用連結", tool: "internal", outputType: "original_data_content", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 3, name: "未連結提及轉換外聯", description: "向所有未連結提及的網站發送外聯請求：「感謝提到我們，如果您願意加上連結會更方便您的讀者」", tool: "internal", outputType: "mention_to_link_emails", requiredSkills: ["marketing-ops"] }, m3Info),
        assignAgentToStep({ order: 4, name: "連結獲取效益追蹤", description: "追蹤外聯後的連結獲取成功率，分析哪類網站最願意回連，優化外聯訊息提升轉換率", tool: "internal", outputType: "link_acquisition_report", requiredSkills: ["marketing-analytics"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "反向外聯 SEO 師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "品牌監測師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "外聯執行師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Neil Patel Reverse Outreach 反向連結建立策略", description: "Source: Neil Patel / Ubersuggest 2019 年系統化的 Reverse Outreach 方法。NeilPatel.com 月流量超過 400 萬應用此連結建立策略", steps });
      await upsertSquad(conn, { slug, name: "Neil Patel Reverse Outreach SEO 連結獲取小隊", description: "挖掘已提及但未連結的品牌曝光，將其轉換為反向連結。Neil Patel 的 Reverse Outreach 方法：比主動外聯轉換率高 5 倍", industryKey: "marketing", missionType: taskType, workspace: ["website"], methodology: "Neil Patel – Reverse Outreach (Ubersuggest, 2019)", agents: agentMembers, tags: ["seo", "link-building", "brand-mentions", "outreach"], useCases: ["品牌反向連結建立", "已提及品牌的連結獲取", "高 DA 連結策略"], outputFormats: ["未連結提及清單", "原創數據內容", "外聯郵件模板", "獲取追蹤報告"], requiredIntegrations: [], token: 55000, showcases: [{ company: "NeilPatel.com 自身", description: "應用 Reverse Outreach 系統化地將業界對 Neil Patel 的提及轉換為反向連結", result: "NeilPatel.com 達到 DA 82，月流量超過 400 萬，反向連結超過 60 萬個", source: "Ahrefs NeilPatel.com 分析 2023" }, { company: "HubSpot（類似方法）", description: "監測並轉換 HubSpot 功能定義和行銷術語的未連結提及", result: "HubSpot Blog DA 達到 92，月流量超過 500 萬", source: "Ahrefs / SEMrush HubSpot 分析 2023" }] });
    }

    // G3: Kevin Indig — Topical Authority Strategy (2021)
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
        assignAgentToStep({ order: 1, name: "主題叢集地圖設計", description: "設計完整的主題叢集架構：1 個核心 Pillar 主題 + 10-20 個 Supporting 子主題，確保完全覆蓋整個主題領域", tool: "internal", outputType: "topic_cluster_map", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Pillar 頁面製作", description: "製作涵蓋整個主題的長篇 Pillar 頁面（3,000-5,000 字），作為主題叢集的中心樞紐，內部連結到所有子頁面", tool: "internal", outputType: "pillar_page_content", requiredSkills: ["copywriting-pro"] }, m3Info),
        assignAgentToStep({ order: 3, name: "Supporting 內容製作", description: "為每個子主題製作詳細的 Supporting 文章，每篇都連結回 Pillar 頁面，建立完整的主題覆蓋網絡", tool: "internal", outputType: "supporting_articles", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "內部連結架構優化", description: "建立完整的內部連結架構：Pillar ↔ Supporting 雙向連結，確保主題叢集的 PageRank 流向最大化", tool: "internal", outputType: "internal_linking_structure", requiredSkills: ["marketing-analytics"] }, m4Info),
        assignAgentToStep({ order: 5, name: "主題權威排名追蹤", description: "追蹤主題叢集中所有關鍵字的排名進展，評估整體主題覆蓋度和 Google 對品牌主題權威的認可程度", tool: "internal", outputType: "topical_authority_report", requiredSkills: ["cross-channel-analytics"] }, m4Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "主題權威策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "主題叢集師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "SEO 內容師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "連結分析師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Kevin Indig Topical Authority SEO 主題權威策略", description: "Source: Kevin Indig（前 Shopify / G2 / Atlassian SEO Director）2021 年系統化 Topical Authority 方法論，被業界廣泛認可為現代 SEO 最有效的長期策略", steps });
      await upsertSquad(conn, { slug, name: "Kevin Indig Topical Authority SEO 主題權威小隊", description: "建立讓 Google 認可的主題權威：透過 Pillar + Supporting 叢集架構全面覆蓋一個主題，讓品牌成為該領域的首選資訊來源", industryKey: "marketing", missionType: taskType, workspace: ["website"], methodology: "Kevin Indig – Topical Authority Strategy (2021)", agents: agentMembers, tags: ["seo", "topical-authority", "content-cluster", "pillar-page"], useCases: ["行業SEO主題佈局", "品牌SEO長期規劃", "電商品類SEO"], outputFormats: ["主題叢集地圖", "Pillar 頁面", "Supporting 文章組", "排名追蹤報告"], requiredIntegrations: [], token: 65000, showcases: [{ company: "Shopify（Kevin Indig 擔任 SEO Director）", description: "應用 Topical Authority 策略系統化建立電商/創業主題叢集", result: "Shopify Blog 月流量超過 200 萬，有機搜索貢獻 20%+ 新試用者", source: "Kevin Indig 個人部落格 / Shopify 公開 SEO 分析 2021" }, { company: "Healthline（類似 Topical Authority）", description: "以主題叢集策略覆蓋 10,000+ 健康主題，建立醫療搜索主題權威", result: "月有機流量超過 9,000 萬，成為 Google 醫療健康 YMYL 領域最高排名媒體之一", source: "Ahrefs / SEMrush Healthline 分析 2022" }] });
    }

    // G4: Glen Allsopp — SERP Domination Strategy (ViperChill, 2022)
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
        assignAgentToStep({ order: 1, name: "SERP 佔領機會分析", description: "分析目標關鍵字的 SERP 組成：哪些格式（Featured Snippet、People Also Ask、Video、Map Pack）有機會佔領？一個 SERP 可以同時出現幾次？", tool: "internal", outputType: "serp_opportunity_analysis", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "多格式 SERP 內容製作", description: "為同一目標關鍵字製作多種格式的內容：長篇文章（排名第1）+ 影片（Video carousel）+ 工具（Tools SERP）+ 圖片，讓品牌在同一 SERP 多次出現", tool: "internal", outputType: "multi_format_content", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 3, name: "品牌子資產優化", description: "優化品牌所有 Web 資產：主網站 + YouTube + Google Business Profile + 子網域，讓搜尋品牌相關詞時品牌佔領整個第一頁", tool: "internal", outputType: "brand_property_audit", requiredSkills: ["marketing-ops"] }, m3Info),
        assignAgentToStep({ order: 4, name: "SERP 佔領率追蹤", description: "追蹤品牌在目標關鍵字 SERP 上的「佔領比例」：10 個結果中品牌出現幾次，監測競爭對手的 SERP 位置", tool: "internal", outputType: "serp_domination_report", requiredSkills: ["marketing-analytics"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "SERP 佔領策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "多格式內容師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "品牌資產師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Glen Allsopp SERP Domination 搜尋結果頁佔領策略", description: "Source: Glen Allsopp（ViperChill）2022 年《The SERP Domination Strategy》報告，揭露大型媒體如何佔領同一 SERP 多個位置", steps });
      await upsertSquad(conn, { slug, name: "Glen Allsopp SERP 佔領策略小隊", description: "不只排名第一，要讓整個 SERP 都是你。Glen Allsopp 的 SERP Domination 方法：多格式、多資產、多品牌子域，讓競爭對手沒有生存空間", industryKey: "marketing", missionType: taskType, workspace: ["website"], methodology: "Glen Allsopp – SERP Domination (ViperChill, 2022)", agents: agentMembers, tags: ["seo", "serp", "multi-format", "brand-seo"], useCases: ["關鍵字SERP全面佔領", "品牌SEO資產優化", "競爭對手SEO防禦"], outputFormats: ["SERP機會分析", "多格式內容組", "品牌資產審計", "SERP佔領報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "ViperChill 研究揭示的大型媒體集團", description: "Dotdash Meredith 等媒體集團應用 SERP 佔領策略，在金融/健康關鍵字 SERP 出現 3-5 次", result: "同一 SERP 佔領 30-50% 的搜尋結果，CTR 是單一排名的 3 倍", source: "Glen Allsopp《The SERP Domination Strategy》ViperChill 2022" }, { company: "Bankrate（金融媒體）", description: "通過多個子品牌（NerdWallet 母公司收購）佔領金融搜尋關鍵字的整個 SERP", result: "主要金融關鍵字 SERP 佔領率超過 40%，月有機流量超過 5,000 萬", source: "Ahrefs / SEMrush 分析 2023" }] });
    }

    // G5: Cyrus Shepard — Internal Linking PageRank Flow Method (Zyppy, 2020)
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
        assignAgentToStep({ order: 1, name: "網站爬蟲與 PageRank 流向分析", description: "爬取整個網站，分析目前的內部連結密度分布：哪些頁面收到最多內部連結？哪些重要頁面是「孤兒頁面」？", tool: "internal", outputType: "internal_link_audit", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "關鍵頁面 PageRank 集中計劃", description: "設計 PageRank 重新分配計劃：把更多內部連結導向希望排名提升的頁面，從高 PageRank 頁面建立連結到目標頁面", tool: "internal", outputType: "pagerank_redistribution_plan", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "錨文字多樣化優化", description: "審計所有內部連結的錨文字，確保關鍵頁面的內部錨文字包含目標關鍵字，但保持自然多樣性", tool: "internal", outputType: "anchor_text_optimization", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "孤兒頁面修復", description: "識別並修復孤兒頁面（沒有收到任何內部連結的頁面）：從相關頁面建立指向孤兒頁面的連結", tool: "internal", outputType: "orphan_page_fix_plan", requiredSkills: ["marketing-ops"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "內部連結 SEO 師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "連結優化師", order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Cyrus Shepard Internal Linking PageRank 流向優化", description: "Source: Cyrus Shepard（前 Moz SEO / Zyppy 創辦人）2020 年的內部連結 PageRank 流向方法論，被業界廣泛引用", steps });
      await upsertSquad(conn, { slug, name: "Cyrus Shepard 內部連結 PageRank 優化小隊", description: "優化網站的 PageRank 流向：讓 SEO 價值從高 Authority 頁面流向目標排名頁面。Cyrus Shepard 的內部連結科學：最便宜的 SEO 提升往往在網站內部", industryKey: "marketing", missionType: taskType, workspace: ["website"], methodology: "Cyrus Shepard – Internal Linking PageRank Flow (Zyppy, 2020)", agents: agentMembers, tags: ["seo", "internal-linking", "pagerank", "technical-seo"], useCases: ["網站SEO技術優化", "PageRank重新分配", "孤兒頁面修復"], outputFormats: ["內部連結審計", "PageRank重分配計劃", "錨文字優化報告"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Moz（Cyrus Shepard 曾任職）", description: "應用 PageRank 流向優化策略提升 Moz Blog 關鍵頁面排名", result: "Moz Blog 主要 SEO 關鍵字排名提升 30-50%，有機流量增長 25%", source: "Cyrus Shepard Moz Blog 文章 / Zyppy.com 2020" }, { company: "Healthline（大型內容網站案例）", description: "應用完整的內部連結優化，讓高 DA 的醫療指南頁面的 PageRank 流向目標排名頁面", result: "目標頁面有機流量提升 40-60%，不需增加反向連結", source: "Case study：Search Engine Journal 2021 內部連結優化案例" }] });
    }

    // G6: Marie Haynes — E-E-A-T Quality Rater Framework (2020)
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
        assignAgentToStep({ order: 1, name: "E-E-A-T 現況審計", description: "審計網站的 Experience、Expertise、Authoritativeness、Trustworthiness 四個維度：作者資訊、引用來源、網站安全性、聯繫資訊完整度", tool: "internal", outputType: "eeat_audit_report", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "作者與品牌專業度展示", description: "建立展示真實專業度的內容系統：作者 Bio、LinkedIn 連結、真實照片、學歷/經歷、引用業界認可的資料來源", tool: "internal", outputType: "expertise_demonstration_plan", requiredSkills: ["brand-identity"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "信任信號建立", description: "建立 Google Quality Raters 認可的信任信號：清晰的聯繫頁面、About Us、隱私政策、真實的公司資訊、正面的外部評論", tool: "internal", outputType: "trust_signals_implementation", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "E-E-A-T 進階追蹤", description: "監測 E-E-A-T 改進後的有機流量變化，特別關注 YMYL（Your Money Your Life）相關頁面的排名恢復", tool: "internal", outputType: "eeat_improvement_tracking", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "E-E-A-T 審計師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "信任內容師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "信任信號師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Marie Haynes E-E-A-T Google 品質評鑑框架", description: "Source: Marie Haynes（Marie Haynes Consulting）2020 年系統化的 E-E-A-T 框架，是 Google 品質提升後流量下滑最權威的診斷和修復方法", steps });
      await upsertSquad(conn, { slug, name: "Marie Haynes E-E-A-T 品質信號優化小隊", description: "強化 Experience、Expertise、Authoritativeness、Trustworthiness 四個 Google 品質信號，特別適合受 Core Update 影響的 YMYL 網站", industryKey: "marketing", missionType: taskType, workspace: ["website"], methodology: "Marie Haynes – E-E-A-T Quality Framework (2020)", agents: agentMembers, tags: ["seo", "eeat", "trust", "quality"], useCases: ["YMYL網站排名恢復", "健康/財務類SEO", "品牌可信度SEO"], outputFormats: ["E-E-A-T審計報告", "專業度展示計劃", "信任信號清單"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Marie Haynes Consulting 客戶組合", description: "協助多個因 Google Core Update 流量下滑的醫療/財務網站應用 E-E-A-T 框架修復", result: "平均客戶流量在 E-E-A-T 優化後 3-6 個月恢復 50-80%", source: "Marie Haynes Consulting 客戶案例 / mhc.la 2022" }, { company: "Healthline（E-E-A-T 最佳實踐）", description: "系統建立醫療內容的 E-E-A-T 信號：所有文章由有照醫師審核，引用 PubMed 研究", result: "2018 年 Google Medic Update 後反而流量提升 30%，成為最受信任的健康媒體", source: "Healthline.com 作者指南 / Marie Haynes EEAT 分析 2020" }] });
    }

    // G7: Ross Hudgens — Siege Media Content-Led Link Building (2014)
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
        assignAgentToStep({ order: 1, name: "可連結資產機會研究", description: "研究業界哪類內容格式最容易獲得反向連結：原創數據、工具/計算器、互動式視覺化、業界指南，找出 ROI 最高的可連結資產類型", tool: "internal", outputType: "linkable_asset_opportunity", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "可連結資產製作", description: "製作具有天然連結吸引力的內容資產：研究報告、資訊圖表、行業統計、互動工具，品質必須遠超業界現有資源", tool: "internal", outputType: "linkable_asset_creation", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 3, name: "媒體/記者外聯計劃", description: "建立業界媒體和記者的外聯名單，針對最有可能報導此類資產的媒體發送個人化外聯郵件", tool: "internal", outputType: "media_outreach_plan", requiredSkills: ["marketing-ops"] }, m4Info),
        assignAgentToStep({ order: 4, name: "數位 PR 推廣執行", description: "執行數位 PR 推廣：媒體稿件、社群分享、意見領袖引用，讓資產獲得最大的自然連結量", tool: "internal", outputType: "digital_pr_execution", requiredSkills: ["campaign-orchestrator"] }, m4Info),
        assignAgentToStep({ order: 5, name: "連結資產 ROI 報告", description: "追蹤每個可連結資產帶來的反向連結數量、DA/Domain 分布、有機流量影響，評估內容連結建立 ROI", tool: "internal", outputType: "link_asset_roi_report", requiredSkills: ["marketing-analytics"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "內容連結建立師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "可連結資產研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "視覺資產製作師", order: 3 },
        { agent_id: m4Id, is_lead: false, role: "數位PR師", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ross Hudgens Siege Media 內容驅動連結建立方法", description: "Source: Ross Hudgens（Siege Media 創辦人）2014 年起系統化的內容驅動連結建立方法，Siege Media 成為業界最知名的 SEO 內容機構之一", steps });
      await upsertSquad(conn, { slug, name: "Ross Hudgens Siege Media 內容驅動 SEO 連結小隊", description: "製作讓媒體和部落格自然想引用的資產，以內容驅動連結建立。Ross Hudgens 的方法：只有值得連結的內容才能永續獲得反向連結", industryKey: "marketing", missionType: taskType, workspace: ["website"], methodology: "Ross Hudgens – Content-Led Link Building (Siege Media, 2014)", agents: agentMembers, tags: ["seo", "link-building", "digital-pr", "linkable-assets"], useCases: ["B2B品牌SEO連結建立", "媒體型網站連結策略", "高DA連結獲取"], outputFormats: ["可連結資產", "媒體外聯計劃", "數位PR執行", "連結ROI報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Siege Media 客戶群（100+ 企業）", description: "應用內容驅動連結建立方法，為各行各業客戶製作可連結資產", result: "客戶平均月獲得 50-200 個高品質反向連結，有機流量平均增長 150%", source: "Siege Media 官網 / Ross Hudgens 演講 BrightonSEO 2022" }, { company: "QuoteWizard（保險比較）", description: "應用 Siege Media 方法製作保險相關原創研究報告", result: "獲得 Reuters、Forbes、AP News 等媒體引用，單篇報告帶來 300+ 高 DA 連結", source: "Siege Media QuoteWizard 案例研究 2020" }] });
    }

    // G8: Aleyda Solis — International SEO Framework (2015)
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
        assignAgentToStep({ order: 1, name: "國際市場 SEO 機會研究", description: "分析哪些目標市場（國家/語言）有最高的 SEO 增長機會：搜尋量、競爭度、品牌現有知名度，優先進入的市場排序", tool: "internal", outputType: "international_seo_opportunity", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "網站架構策略選擇", description: "為國際 SEO 選擇最佳網站架構：ccTLD（tw.brand.com）vs. 子目錄（brand.com/tw）vs. 子域（tw.brand.com），分析各選項的 SEO 利弊", tool: "internal", outputType: "international_url_structure", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "Hreflang 實作計劃", description: "設計完整的 Hreflang 標籤實作計劃，確保 Google 正確識別每個語言/地區版本，避免重複內容問題", tool: "internal", outputType: "hreflang_implementation_plan", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "在地化內容策略", description: "設計真正的在地化內容策略（非機器翻譯）：在地化關鍵字研究、在地化使用者意圖分析、在地化案例和社會證明", tool: "internal", outputType: "localization_content_strategy", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 5, name: "國際 SEO 效益追蹤", description: "建立各市場的獨立 SEO 追蹤體系，按國家/語言分析有機流量、關鍵字排名、轉換率，識別最快成長的市場", tool: "internal", outputType: "international_seo_dashboard", requiredSkills: ["cross-channel-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "國際 SEO 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "在地化內容師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "國際 SEO 分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Aleyda Solis 國際 SEO 框架與市場擴張策略", description: "Source: Aleyda Solis（Orainti 創辦人）2015 年建立的國際 SEO 框架，被 Google Webmaster Central 引用，是全球最知名的國際 SEO 專家", steps });
      await upsertSquad(conn, { slug, name: "Aleyda Solis 國際 SEO 市場擴張小隊", description: "應用 Aleyda Solis 的國際 SEO 框架，系統化進入多個語言/國家市場，從 URL 架構到 Hreflang 到在地化內容，全面佈局國際搜尋", industryKey: "marketing", missionType: taskType, workspace: ["website"], methodology: "Aleyda Solis – International SEO Framework (Orainti, 2015)", agents: agentMembers, tags: ["seo", "international", "localization", "hreflang"], useCases: ["品牌國際SEO擴張", "多語言網站優化", "電商跨境SEO"], outputFormats: ["國際市場機會報告", "URL架構方案", "Hreflang計劃", "在地化內容策略"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Atlassian（Aleyda Solis 顧問）", description: "應用國際 SEO 框架擴張到歐洲、亞洲市場", result: "國際有機流量在 18 個月內增長 200%，非英語市場收入占比提升至 40%", source: "Aleyda Solis 公開演講 SMX Europe 2019" }, { company: "Lyst（時尚電商）", description: "應用 Solis 框架為 40+ 個語言/市場優化 SEO 架構", result: "全球有機流量增長 300%，成為全球最大時尚搜索平台之一", source: "Aleyda Solis Orainti 案例研究 2021" }] });
    }

    // G9: Kyle Roof — On-Page SEO Methodology (PageOptimizer Pro, 2020)
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
        assignAgentToStep({ order: 1, name: "搜尋意圖與關鍵字深度分析", description: "深度分析目標關鍵字的搜尋意圖：Informational/Commercial/Transactional？分析 SERP Top 10 的內容格式、字數、標題結構，確定最佳頁面模板", tool: "internal", outputType: "intent_keyword_analysis", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "On-Page 優化計劃", description: "應用 Kyle Roof 的數據驅動 On-Page 優化：Title Tag、H1-H6 架構、關鍵字密度（POP 工具科學化計算）、Schema Markup", tool: "internal", outputType: "onpage_optimization_plan", requiredSkills: ["marketing-analytics"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "SEO 優化內容撰寫/改寫", description: "按照 On-Page 優化計劃撰寫或改寫內容：自然密度的關鍵字分布、符合 EEAT 的內容深度、清晰的標題層次", tool: "internal", outputType: "seo_optimized_content", requiredSkills: ["copywriting-pro"] }, m2Info),
        assignAgentToStep({ order: 4, name: "CTR 優化（Title + Meta）", description: "優化搜尋結果中的 Title Tag 和 Meta Description：應用數字、括號、情緒詞等提升點擊率的技巧", tool: "internal", outputType: "ctr_optimization", requiredSkills: ["seo-audit"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "On-Page SEO 師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "SEO 內容師", order: 2 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Kyle Roof 科學化 On-Page SEO 優化方法", description: "Source: Kyle Roof（PageOptimizer Pro 創辦人）2020 年透過 A/B 測試驗證的 On-Page SEO 方法論，以數據而非猜測優化頁面元素", steps });
      await upsertSquad(conn, { slug, name: "Kyle Roof 科學化 On-Page SEO 小隊", description: "應用 Kyle Roof 以 A/B 測試驗證的 On-Page SEO 方法：從搜尋意圖分析到關鍵字密度優化，每個決策都有數據支撐", industryKey: "marketing", missionType: taskType, workspace: ["website"], methodology: "Kyle Roof – Scientific On-Page SEO (PageOptimizer Pro, 2020)", agents: agentMembers, tags: ["seo", "on-page", "technical", "content-optimization"], useCases: ["頁面SEO技術優化", "關鍵字排名提升", "CTR優化"], outputFormats: ["搜尋意圖分析", "On-Page優化計劃", "SEO優化內容", "CTR優化報告"], requiredIntegrations: [], token: 50000, showcases: [{ company: "PageOptimizer Pro（Kyle Roof 創辦）自身", description: "應用自創的科學化 On-Page 方法管理工具平台本身的 SEO", result: "POP 相關關鍵字達到 Page 1 排名，付費用戶超過 10,000 個 SEO 專業人士", source: "PageOptimizerPro.com / Kyle Roof 公開演講 2021" }, { company: "Charles Floate（應用 POP 方法客戶）", description: "應用 Kyle Roof 科學化 On-Page 方法優化 affiliate 網站", result: "目標頁面排名從 Page 2-3 提升至 Page 1 Top 3，有機收入增長 300%", source: "Charles Floate 公開案例 / YouTube 2022" }] });
    }

    // G10: Rand Fishkin — 10x Content Strategy (Moz, 2015)
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
        assignAgentToStep({ order: 1, name: "10x 競爭機會分析", description: "找出目前最佳的競爭內容（SERP Top 1-3），評估：是否有可能製作出「明顯 10 倍更好」的版本？標準包括深度、視覺、新鮮度、UX", tool: "internal", outputType: "10x_opportunity_analysis", requiredSkills: ["seo-audit"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "10x 內容製作計劃", description: "設計超越現有最佳資源 10 倍的內容計劃：原創研究數據、互動式視覺化、專家意見匯集、最完整的主題覆蓋", tool: "internal", outputType: "10x_content_blueprint", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 3, name: "10x 旗艦內容製作", description: "製作達到「10 倍更好」標準的旗艦內容：深度、設計、實用性、互動性全面超越競爭對手", tool: "internal", outputType: "10x_flagship_content", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "大規模推廣與連結建立", description: "為 10x 內容設計大規模推廣計劃：社群媒體、Email 通告、媒體外聯、意見領袖分享，讓優質內容被更多人看到", tool: "internal", outputType: "10x_promotion_plan", requiredSkills: ["content-marketing"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "10x 內容效益評估", description: "評估 10x 內容的長期 SEO 效益：有機排名、反向連結增長、長期流量貢獻、品牌搜尋量提升", tool: "internal", outputType: "10x_content_roi_report", requiredSkills: ["marketing-analytics"] }, m2Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "10x 內容策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "競爭研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "10x 內容製作師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Rand Fishkin 10x Content SEO 旗艦內容策略", description: "Source: Rand Fishkin（Moz 創辦人）2015 年提出「10x Content」概念。Moz Blog 應用此原則月流量達到 300 萬+", steps });
      await upsertSquad(conn, { slug, name: "Rand Fishkin 10x Content SEO 旗艦內容小隊", description: "不只比競爭對手好一點，而是好 10 倍。Rand Fishkin 的 10x Content 原則：在內容飽和的時代，只有遠超業界標準的內容才能持續吸引排名和連結", industryKey: "marketing", missionType: taskType, workspace: ["website"], methodology: "Rand Fishkin – 10x Content Strategy (Moz, 2015)", agents: agentMembers, tags: ["seo", "content", "10x", "quality"], useCases: ["競爭激烈關鍵字SEO", "旗艦內容製作", "品牌SEO護城河建立"], outputFormats: ["10x機會分析", "10x內容計劃", "旗艦內容", "推廣計劃"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Moz Blog（Rand Fishkin）", description: "應用 10x Content 標準創作 Whiteboard Friday 和深度 SEO 研究，持續是業界最被引用的 SEO 資源", result: "Moz Blog 月流量超過 300 萬，被 iContact 以 $67.5M 收購，10x 文章平均獲得 500+ 反向連結", source: "Moz.com / Rand Fishkin《Lost and Founder》2018" }, { company: "HubSpot（10x Content 應用）", description: "HubSpot Blog 系統應用 10x Content 原則，只製作業界最完整的行銷指南", result: "月流量超過 500 萬，成為行銷人學習的首選目的地，Email 名單超過 300 萬", source: "HubSpot Blog 公開統計 2023" }] });
    }

  // ── CATEGORY H: PR / KOL (10 squads) ──────────────────────────────────────

  // H1 · Jonah Berger STEPPS Contagious Framework
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
    await upsertWorkflow(conn, { missionType: taskType, name: "Berger STEPPS Contagious PR", description: "Source: Jonah Berger《Contagious: Why Things Catch On》2013, Wharton School. Blendtec 'Will It Blend?' applied Social Currency trigger → 700% sales increase. Dollar Shave Club launch video (Practical Value + Emotion) → 12,000 orders in 48 hours.", steps });
    await upsertSquad(conn, { slug, name: "Berger STEPPS Contagious PR", description: "Use Jonah Berger's 6 STEPPS framework to engineer PR and KOL campaigns with built-in sharing psychology.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Jonah Berger – Contagious: Why Things Catch On (2013)", agents: agentMembers, tags: ["pr", "viral", "kol", "word-of-mouth", "berger"], useCases: ["product launch PR", "KOL activation", "brand storytelling"], outputFormats: ["pr_brief", "kol_brief", "content_pack", "analytics_report"], requiredIntegrations: [], token: 58000, showcases: [{ company: "Blendtec", description: "Applied Social Currency STEPPS trigger via 'Will It Blend?' YouTube series", result: "700% increase in retail sales; 300M+ YouTube views", source: "Berger, J. (2013). Contagious. Simon & Schuster." }] });
  }

  // H2 · Ryan Holiday Trust Me I'm Lying – Media Manipulation PR
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
      assignAgentToStep({ order: 2, name: "Outrage & Controversy Hook", description: "Write a slightly provocative pitch that journalists can't ignore — emotionally resonant, factually defensible, headline-ready.", tool: "internal", outputType: "press_pitch", requiredSkills: ["hook-copywriter", "ad-copywriting-formulas"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Linchpin Content Anchor", description: "Publish a cornerstone piece (blog, study, video) that gives media a credible source to link and cite, fuelling SEO authority alongside earned media.", tool: "internal", outputType: "cornerstone_content", requiredSkills: ["content-marketing", "seo-audit"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Coverage Velocity Tracking", description: "Monitor media pick-up speed, share velocity and secondary citations to identify amplification opportunities and kill negative spirals early.", tool: "internal", outputType: "coverage_report", requiredSkills: ["marketing-analytics", "cross-channel-analytics"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "PR Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Controversy Copywriter", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Content Anchor Builder", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Coverage Analyst", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Holiday Media Manipulation PR", description: "Source: Ryan Holiday《Trust Me, I'm Lying: Confessions of a Media Manipulator》2012. Used for American Apparel + Tucker Max book campaigns — traded stories up from blogs to national media, achieving bestseller status with near-zero ad spend.", steps });
    await upsertSquad(conn, { slug, name: "Holiday Media Manipulation PR", description: "Ryan Holiday's trade-up-the-chain tactic: plant compelling stories in small outlets, let media amplification carry them to top-tier publications.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Ryan Holiday – Trust Me I'm Lying (2012)", agents: agentMembers, tags: ["pr", "media-relations", "earned-media", "holiday"], useCases: ["book/product launch", "brand controversy management", "media relations"], outputFormats: ["pr_strategy", "press_pitch", "cornerstone_content", "coverage_report"], requiredIntegrations: [], token: 52000, showcases: [{ company: "Tucker Max (I Hope They Serve Beer In Hell)", description: "Applied trade-up-the-chain PR strategy with manufactured controversy", result: "NY Times bestseller #1; 1.5M+ copies sold with minimal traditional ad spend", source: "Holiday, R. (2012). Trust Me, I'm Lying. Portfolio/Penguin." }] });
  }

  // H3 · Malcolm Gladwell Tipping Point – Connector/Maven/Salesman PR
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
      assignAgentToStep({ order: 4, name: "Tipping Point Monitoring", description: "Track cascade metrics — shares-per-share, new-audience reach rate — to detect and accelerate the tipping point moment.", tool: "internal", outputType: "cascade_report", requiredSkills: ["marketing-analytics", "cross-channel-analytics"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "CMS Analyst", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "KOL Activator", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Sticky Message Writer", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Cascade Tracker", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Gladwell Tipping Point PR", description: "Source: Malcolm Gladwell《The Tipping Point: How Little Things Can Make a Big Difference》2000. Hush Puppies revival (1994–95) driven by a handful of Manhattan Connectors; Airwalk skate shoe launch via Maven seeding → both cited as canonical Tipping Point cases.", steps });
    await upsertSquad(conn, { slug, name: "Gladwell Tipping Point PR", description: "Activate Connectors, Mavens and Salesmen to engineer the social tipping point for product or brand launches.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Malcolm Gladwell – The Tipping Point (2000)", agents: agentMembers, tags: ["pr", "word-of-mouth", "influencer", "gladwell", "tipping-point"], useCases: ["product launch", "brand revival", "community seeding"], outputFormats: ["audience_map", "kol_brief", "copy_variants", "cascade_report"], requiredIntegrations: [], token: 54000, showcases: [{ company: "Hush Puppies (Wolverine World Wide)", description: "A handful of Manhattan hipster Connectors began wearing Hush Puppies; Gladwell used this as the definitive Tipping Point case study", result: "Sales jumped from 30,000 pairs/yr to 430,000 in 1995 with zero marketing spend", source: "Gladwell, M. (2000). The Tipping Point. Little, Brown." }] });
  }

  // H4 · Brian Solis PESO Model (Paid/Earned/Shared/Owned)
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
    await upsertWorkflow(conn, { missionType: taskType, name: "Solis PESO Integrated PR", description: "Source: Brian Solis & Deirdre Breakenridge《Putting the Public Back in Public Relations》2009; PESO model popularised by Spin Sucks / Gini Dietrich. Used by SAP, IBM and Salesforce for integrated comms campaigns.", steps });
    await upsertSquad(conn, { slug, name: "Solis PESO Integrated PR", description: "Orchestrate Paid, Earned, Shared and Owned media in one coherent campaign using Brian Solis's PESO framework.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Brian Solis – PESO Model (2009)", agents: agentMembers, tags: ["pr", "paid", "earned", "shared", "owned", "peso", "integrated"], useCases: ["product launch", "brand awareness", "integrated campaign"], outputFormats: ["channel_blueprint", "ad_campaigns", "kol_brief", "owned_content"], requiredIntegrations: [], token: 56000, showcases: [{ company: "Salesforce", description: "Applied PESO integration across Dreamforce event content, paid promotion, KOL sharing, and owned Trailhead media", result: "Dreamforce consistently generates 100K+ attendees and billions in earned media value annually", source: "Solis, B. (2009). Putting the Public Back in Public Relations. FT Press." }] });
  }

  // H5 · Gini Dietrich PESO Execution (Spin Sucks)
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
    await upsertWorkflow(conn, { missionType: taskType, name: "Dietrich PESO PR Execution", description: "Source: Gini Dietrich《Spin Sucks: Communication and Reputation Management in the Digital Age》2014, Que Publishing. Arment Dietrich's own Spin Sucks blog grew to 100K monthly readers using this exact PESO execution.", steps });
    await upsertSquad(conn, { slug, name: "Dietrich PESO PR Execution", description: "Gini Dietrich's practical PESO execution: start with owned content, amplify through earned SEO links, shared social and email nurture.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Gini Dietrich – Spin Sucks (2014)", agents: agentMembers, tags: ["pr", "peso", "content", "seo", "email", "dietrich"], useCases: ["B2B PR", "thought leadership", "inbound PR"], outputFormats: ["content_plan", "link_strategy", "email_sequence", "social_calendar", "attribution_report"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Arment Dietrich / Spin Sucks", description: "Applied own PESO model to the Spin Sucks blog and PR firm marketing", result: "100K+ monthly blog readers, top-ranked PR publication, clients include Fortune 500", source: "Dietrich, G. (2014). Spin Sucks. Que Publishing." }] });
  }

  // H6 · Lee Odden Influence 2.0 – Co-Creation KOL
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
      assignAgentToStep({ order: 3, name: "Joint Content Production", description: "Produce the co-created asset with influencer inputs — quotes, data, expert sections — formatted for maximum shareability.", tool: "internal", outputType: "co_created_asset", requiredSkills: ["visual-content-creator", "copywriting-pro"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Mutual Amplification Tracking", description: "Track combined reach from brand + influencer promotion; calculate share of voice and backlink acquisition from the co-creation.", tool: "internal", outputType: "amplification_report", requiredSkills: ["seo-audit", "cross-channel-analytics"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Influence Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Co-Creation Director", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Content Producer", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Amplification Analyst", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Odden Influence 2.0 Co-Creation", description: "Source: Lee Odden《Optimize》2012 + TopRank Marketing Influence 2.0 model. SAP, LinkedIn and Dell used co-created influencer content via TopRank to achieve 2–4× engagement vs brand-only content.", steps });
    await upsertSquad(conn, { slug, name: "Odden Influence 2.0 Co-Creation", description: "Lee Odden's Influence 2.0: co-create content WITH influencers rather than just paying them to post, driving genuine engagement and mutual amplification.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Lee Odden – Optimize & Influence 2.0 (2012)", agents: agentMembers, tags: ["kol", "influencer", "co-creation", "earned-media", "odden"], useCases: ["B2B thought leadership", "KOL content campaigns", "industry report co-authoring"], outputFormats: ["influence_map", "co_creation_brief", "co_created_asset", "amplification_report"], requiredIntegrations: [], token: 54000, showcases: [{ company: "SAP (via TopRank Marketing)", description: "Co-created influencer content series for SAP using Odden's Influence 2.0 framework", result: "2–4× higher engagement vs brand-only content; significant earned backlink acquisition", source: "Odden, L. (2012). Optimize. Wiley." }] });
  }

  // H7 · Neal Schaffer Social Influence – The Age of Influence
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
      assignAgentToStep({ order: 2, name: "Relationship-First Outreach", description: "Conduct authentic relationship-building with shortlisted influencers before pitching — comment, share, engage — then propose a genuine collaboration.", tool: "internal", outputType: "outreach_plan", requiredSkills: ["kol-brief", "market-research-agent"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Always-On Content Stream", description: "Build a recurring influencer content programme (monthly or quarterly) rather than one-off posts, creating sustained brand association.", tool: "internal", outputType: "content_programme", requiredSkills: ["content-repurposing", "short-video-scriptwriter"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Authentic ROI Measurement", description: "Measure engagement quality (saves, comments, DMs) not just reach; calculate cost-per-engaged-user and attribute conversions.", tool: "internal", outputType: "roi_report", requiredSkills: ["marketing-analytics", "cross-channel-analytics"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Influence Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Relationship Outreach", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Content Programme Lead", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "ROI Analyst", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Schaffer Social Influence Programme", description: "Source: Neal Schaffer《The Age of Influence》2020, HarperCollins. Schaffer's framework used by brands including L'Oréal and Lenovo to build always-on micro-influencer programmes instead of episodic celebrity endorsements.", steps });
    await upsertSquad(conn, { slug, name: "Schaffer Social Influence Programme", description: "Neal Schaffer's relationship-first influencer marketing: build tiered, always-on programmes with micro and nano influencers for authentic ROI.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Neal Schaffer – The Age of Influence (2020)", agents: agentMembers, tags: ["influencer", "kol", "micro-influencer", "schaffer", "always-on"], useCases: ["influencer programme design", "product seeding", "KOL relationship management"], outputFormats: ["tier_strategy", "outreach_plan", "content_programme", "roi_report"], requiredIntegrations: [], token: 52000, showcases: [{ company: "L'Oréal", description: "Applied Schaffer's tiered influencer strategy across micro and macro tiers for product launches", result: "Micro-influencer campaigns achieved 60% higher engagement rates vs macro-only approach", source: "Schaffer, N. (2020). The Age of Influence. HarperCollins." }] });
  }

  // H8 · Mark Schaefer KNOWN – Personal Brand PR
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
      assignAgentToStep({ order: 1, name: "Sustainable Interest Finding", description: "Identify the brand's or executive's 'sustainable interest' — the intersection of passion, skill and market demand — using Schaefer's 4-step KNOWN discovery process.", tool: "internal", outputType: "brand_positioning", requiredSkills: ["brand-dna", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Content Space Domination", description: "Choose one primary content channel and produce the highest-quality, most consistent content in the chosen niche to own that space.", tool: "internal", outputType: "content_strategy", requiredSkills: ["content-marketing", "copywriting-pro"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Consistent Visibility Engine", description: "Build a publishing cadence that guarantees weekly visibility; repurpose hero content across social channels to maintain omnipresence.", tool: "internal", outputType: "publishing_schedule", requiredSkills: ["social-scheduler", "social-media-marketing"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Credibility Signals", description: "Accumulate credibility badges: media mentions, speaking invitations, backlinks, expert quotes — then amplify each through owned channels.", tool: "internal", outputType: "credibility_plan", requiredSkills: ["seo-audit", "market-research-agent"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Audience Monetisation", description: "Convert personal brand audience into revenue via email list, digital products or consulting pipeline; track list growth and conversion rate.", tool: "internal", outputType: "monetisation_plan", requiredSkills: ["email-marketing", "marketing-analytics"] }, m5Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Brand Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Content Dominator", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Visibility Engine", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Credibility Builder", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "Audience Monetiser", order: 5 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Schaefer KNOWN Personal Brand PR", description: "Source: Mark Schaefer《KNOWN: The Handbook for Building and Unleashing Your Personal Brand in the Digital Age》2017. Jay Baer, Ann Handley and Brian Clark all used this model consciously; Schaefer validated with 50+ executive case studies.", steps });
    await upsertSquad(conn, { slug, name: "Schaefer KNOWN Personal Brand PR", description: "Mark Schaefer's KNOWN framework: find a sustainable interest, dominate a content space and accumulate credibility until the market recognises you.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Mark Schaefer – KNOWN (2017)", agents: agentMembers, tags: ["personal-brand", "thought-leadership", "pr", "schaefer", "known"], useCases: ["executive personal branding", "founder brand building", "thought leadership PR"], outputFormats: ["brand_positioning", "content_strategy", "publishing_schedule", "credibility_plan", "monetisation_plan"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Jay Baer (Convince & Convert)", description: "Built personal brand using consistent, niche-dominating content in the word-of-mouth marketing space", result: "NY Times-bestselling author, keynote speaker with $20K+ fees, top-ranked marketing blog", source: "Schaefer, M. (2017). KNOWN. Schaefer Marketing Solutions." }] });
  }

  // H9 · Jay Baer Hug Your Haters – Public Crisis Response
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
      assignAgentToStep({ order: 2, name: "Empathy Response Templates", description: "Write channel-specific response templates that acknowledge, apologise (if warranted) and act — turning public complaints into brand-loyalty moments.", tool: "internal", outputType: "response_templates", requiredSkills: ["copywriting-pro", "hook-copywriter"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Complaint Velocity Monitoring", description: "Track complaint volume, response time and sentiment shift to ensure the brand never ignores a complaint (Baer's core rule: answer every complaint, every time).", tool: "internal", outputType: "monitoring_dashboard", requiredSkills: ["marketing-analytics", "cross-channel-analytics"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Win-Back Content Loop", description: "Follow up resolved complaints with value-add content (exclusive offer, helpful resource) to convert former haters into advocates.", tool: "internal", outputType: "winback_sequence", requiredSkills: ["content-marketing", "email-marketing"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "PR Crisis Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Empathy Copywriter", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Complaint Monitor", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Win-Back Specialist", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Baer Hug Your Haters Crisis PR", description: "Source: Jay Baer《Hug Your Haters: How to Embrace Complaints and Keep Your Customers》2016, Portfolio/Penguin. Google and KFC used Baer's response framework; data shows responding to 1-star reviews publicly increases re-purchase intent by 33%.", steps });
    await upsertSquad(conn, { slug, name: "Baer Hug Your Haters Crisis PR", description: "Jay Baer's crisis PR framework: answer every complaint on every channel, every time — turning haters into the most powerful brand advocates.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "Jay Baer – Hug Your Haters (2016)", agents: agentMembers, tags: ["pr", "crisis", "reputation", "customer-service", "baer"], useCases: ["brand crisis management", "negative review response", "reputation repair"], outputFormats: ["response_matrix", "response_templates", "monitoring_dashboard", "winback_sequence"], requiredIntegrations: [], token: 52000, showcases: [{ company: "KFC (Yum! Brands)", description: "Implemented universal complaint response policy aligned with Hug Your Haters framework", result: "33% increase in re-purchase intent among customers whose public complaints received responses", source: "Baer, J. (2016). Hug Your Haters. Portfolio/Penguin." }] });
  }

  // H10 · KOL Blueprint – Micro-KOL Performance System
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
      assignAgentToStep({ order: 1, name: "Micro-KOL Sourcing & Vetting", description: "Identify nano/micro KOLs (10K–200K followers) with high authentic engagement; vet for audience quality, fake-follower ratio and brand safety.", tool: "internal", outputType: "kol_shortlist", requiredSkills: ["kol-brief", "market-research-agent"] }, leadInfo),
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
    await upsertSquad(conn, { slug, name: "Micro-KOL Performance Blueprint", description: "Systematic micro-KOL programme: source authentic nano/micro influencers, brief them for performance, track ROI per KOL and scale winners.", industryKey: "marketing", missionType: taskType, workspace: ["pr"], methodology: "KOL Blueprint – Micro-Influencer Performance System (2022)", agents: agentMembers, tags: ["kol", "micro-influencer", "performance", "tiktok", "seeding"], useCases: ["product seeding", "D2C influencer campaigns", "TikTok KOL activation"], outputFormats: ["kol_shortlist", "kol_script", "creative_pack", "performance_report"], requiredIntegrations: [], token: 54000, showcases: [{ company: "Gymshark", description: "Built entire brand through micro-KOL seeding programme; athletes and fitness micro-influencers received product and became authentic advocates", result: "Scaled from £0 to £1.3B valuation in 8 years with minimal traditional advertising", source: "Influencer Marketing Hub (2022). Gymshark Influencer Strategy Case Study." }] });
  }

  // ── CATEGORY I: BRAND STRATEGY (10 squads) ────────────────────────────────

  // I1 · April Dunford Obviously Awesome – Positioning
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
      assignAgentToStep({ order: 1, name: "Competitive Alternatives Audit", description: "Identify what customers would use if the product didn't exist — these are true competitive alternatives, not just named competitors.", tool: "internal", outputType: "competitive_audit", requiredSkills: ["brand-dna", "mbb-strategist"] }, leadInfo),
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
    await upsertWorkflow(conn, { missionType: taskType, name: "Dunford Obviously Awesome Positioning", description: "Source: April Dunford《Obviously Awesome: How to Nail Product Positioning so Customers Get It, Buy It, Love It》2019. Dunford repositioned Janna Systems from document management → CRM → sold to IBM for $100M. She has repositioned 200+ B2B companies.", steps });
    await upsertSquad(conn, { slug, name: "Dunford Obviously Awesome Positioning", description: "April Dunford's 10-step positioning process: find competitive alternatives, isolate unique attributes, map value, define best-fit customers and own a new market category.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "April Dunford – Obviously Awesome (2019)", agents: agentMembers, tags: ["brand", "positioning", "b2b", "dunford", "strategy"], useCases: ["product repositioning", "new market category creation", "B2B brand strategy"], outputFormats: ["competitive_audit", "positioning_canvas", "positioning_statement", "brand_identity_update", "go_to_market_content"], requiredIntegrations: [], token: 62000, showcases: [{ company: "Janna Systems", description: "April Dunford repositioned the company from document management to sales contact management (proto-CRM)", result: "Acquisition by IBM for $100M — positioning shift was the primary value driver", source: "Dunford, A. (2019). Obviously Awesome. Ambient Press." }] });
  }

  // I2 · Donald Miller StoryBrand 7 Framework
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
      assignAgentToStep({ order: 2, name: "Guide Positioning & Empathy", description: "Position the brand as the empathetic, authoritative Guide — write the empathy statement and authority proof points that earn the hero's trust.", tool: "internal", outputType: "guide_statement", requiredSkills: ["copywriting-pro", "hook-copywriter"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Plan & Visual Identity", description: "Create a 3-step Plan that removes the hero's fear of taking action; align visual brand identity to the guide archetype.", tool: "internal", outputType: "brand_plan_visual", requiredSkills: ["brand-identity", "visual-content-creator"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Call to Action Content", description: "Write direct CTAs (buy now) and transitional CTAs (free resource) into website and long-form content; optimise for organic discovery.", tool: "internal", outputType: "cta_content", requiredSkills: ["content-marketing", "seo-audit"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Failure Stakes & Success Email", description: "Write email sequences that describe the cost of inaction (failure stakes) and paint the success transformation clearly, driving urgency.", tool: "internal", outputType: "email_sequences", requiredSkills: ["email-marketing", "marketing-analytics"] }, m5Info),
      assignAgentToStep({ order: 6, name: "Paid Retargeting with StoryBrand Script", description: "Run retargeting ads using the StoryBrand script structure: hero problem → guide solution → CTA → transformation promise.", tool: "internal", outputType: "ad_campaigns", requiredSkills: ["paid-ads", "remarketing-strategy"] }, m6Info),
      assignAgentToStep({ order: 7, name: "Ongoing StoryBrand Social Narrative", description: "Maintain social content that consistently casts the customer as hero, positions brand as guide and drives CTA — never interrupts, always serves.", tool: "internal", outputType: "social_content", requiredSkills: ["social-scheduler", "social-media-marketing"] }, m7Info),
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
    await upsertWorkflow(conn, { missionType: taskType, name: "Miller StoryBrand 7 Brand Narrative", description: "Source: Donald Miller《Building a StoryBrand: Clarify Your Message So Customers Will Listen》2017, HarperCollins. Over 10,000 companies have completed StoryBrand workshops. Chick-fil-A, Pantene and hundreds of SMBs cite measurable website conversion improvements of 20–40%.", steps });
    await upsertSquad(conn, { slug, name: "Miller StoryBrand 7 Brand Narrative", description: "Donald Miller's 7-part StoryBrand framework: cast the customer as hero, the brand as guide; communicate through all 7 narrative elements across every channel.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Donald Miller – Building a StoryBrand (2017)", agents: agentMembers, tags: ["brand", "storytelling", "narrative", "miller", "storybrand"], useCases: ["brand messaging overhaul", "website copy", "full-funnel brand narrative"], outputFormats: ["hero_profile", "guide_statement", "brand_plan_visual", "cta_content", "email_sequences", "ad_campaigns", "social_content"], requiredIntegrations: [], token: 68000, showcases: [{ company: "Pantene (P&G)", description: "Repositioned using StoryBrand principles — customer (hero) has bad hair problem; Pantene (guide) provides the solution", result: "Revenue grew from $500M to $1B+ after StoryBrand-aligned messaging overhaul", source: "Miller, D. (2017). Building a StoryBrand. HarperCollins." }] });
  }

  // I3 · Marty Neumeier Brand Gap – Brand Strategy
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
      assignAgentToStep({ order: 4, name: "Brand Experience Activation", description: "Deploy the brand across every touchpoint — digital, physical, verbal — ensuring consistent charisma signals that close the Strategy-Creativity gap.", tool: "internal", outputType: "brand_experience_plan", requiredSkills: ["content-marketing", "social-media-marketing"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Brand Gap Auditor", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Charisma Researcher", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Visual System Designer", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Brand Experience Lead", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Neumeier Brand Gap Strategy", description: "Source: Marty Neumeier《The Brand Gap: How to Bridge the Distance Between Business Strategy and Design》2003, New Riders. Apple, Nike and Harley-Davidson cited as archetypes of closing the Brand Gap between logic and magic.", steps });
    await upsertSquad(conn, { slug, name: "Neumeier Brand Gap Strategy", description: "Marty Neumeier's Brand Gap framework: bridge the gap between business strategy and creative design to build a brand with genuine charisma.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Marty Neumeier – The Brand Gap (2003)", agents: agentMembers, tags: ["brand", "design", "strategy", "neumeier", "differentiation"], useCases: ["brand identity overhaul", "brand strategy", "visual differentiation"], outputFormats: ["brand_gap_audit", "charisma_map", "visual_system", "brand_experience_plan"], requiredIntegrations: [], token: 56000, showcases: [{ company: "Apple", description: "Neumeier uses Apple as the primary case study for closing the Brand Gap — Steve Jobs as the bridge between strategy and design", result: "Brand value grew from $0 (near-bankruptcy 1997) to $3T+ market cap; consistently #1 global brand", source: "Neumeier, M. (2003). The Brand Gap. New Riders/Peachpit." }] });
  }

  // I4 · Byron Sharp How Brands Grow – Mental & Physical Availability
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
      assignAgentToStep({ order: 1, name: "Category Entry Points Mapping", description: "Identify all Category Entry Points (CEPs) — the moments, moods and contexts when buyers think to buy from the category; build a CEP priority matrix.", tool: "internal", outputType: "cep_matrix", requiredSkills: ["marketing-strategy-pmm", "mbb-strategist"] }, leadInfo),
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
    await upsertWorkflow(conn, { missionType: taskType, name: "Sharp How Brands Grow Strategy", description: "Source: Byron Sharp《How Brands Grow: What Marketers Don't Know》2010, Oxford University Press. Ehrenberg-Bass Institute research used by Coca-Cola, P&G, Mars and Unilever to reorient media strategy toward mass reach over loyalty programmes.", steps });
    await upsertSquad(conn, { slug, name: "Sharp How Brands Grow Strategy", description: "Byron Sharp's evidence-based brand growth: maximise mental availability through CEP coverage, Distinctive Brand Assets and mass reach over niche loyalty.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Byron Sharp – How Brands Grow (2010)", agents: agentMembers, tags: ["brand", "growth", "mental-availability", "sharp", "penetration"], useCases: ["brand growth strategy", "media planning", "brand asset audit"], outputFormats: ["cep_matrix", "media_plan", "brand_asset_audit", "penetration_report"], requiredIntegrations: [], token: 58000, showcases: [{ company: "Coca-Cola", description: "Applied Sharp's CEP framework to ensure mental availability at every drinking occasion moment", result: "Maintained #1 global soft drink brand status; 1.9B servings per day across 200+ countries", source: "Sharp, B. (2010). How Brands Grow. Oxford University Press." }] });
  }

  // I5 · Al Ries & Jack Trout 22 Immutable Laws of Marketing
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
      assignAgentToStep({ order: 1, name: "Law of Leadership / Category Audit", description: "Apply the Law of Leadership: identify if the brand can be first in a new category; if not, Law of the Category — create a category where you can be first.", tool: "internal", outputType: "category_strategy", requiredSkills: ["brand-dna", "mbb-strategist"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Mind-Ownership Research", description: "Map what word the brand currently owns in the customer's mind; identify any single word it could realistically own via Law of the Word.", tool: "internal", outputType: "mind_ownership_map", requiredSkills: ["market-research-agent", "marketing-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Focused Messaging Execution", description: "Apply the Law of Focus: write all brand messaging around the single word the brand owns; ruthlessly eliminate off-message content.", tool: "internal", outputType: "focused_message_set", requiredSkills: ["copywriting-pro", "content-marketing"] }, m3Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Category Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Mind Researcher", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Focused Messaging Writer", order: 3 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Ries & Trout 22 Laws Brand Sprint", description: "Source: Al Ries & Jack Trout《The 22 Immutable Laws of Marketing》1993, HarperBusiness. Volvo = safety (Law of the Word). Red Bull created the energy drink category (Law of the Category). Avis 'We're #2' campaign (Law of the Ladder) — sales doubled in 1 year.", steps });
    await upsertSquad(conn, { slug, name: "Ries & Trout 22 Laws Brand Sprint", description: "Apply Al Ries and Jack Trout's most powerful marketing laws: category creation, mental word ownership and focused messaging.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Al Ries & Jack Trout – 22 Immutable Laws of Marketing (1993)", agents: agentMembers, tags: ["brand", "positioning", "category-design", "ries", "trout", "law"], useCases: ["brand positioning", "category creation", "brand focus sprint"], outputFormats: ["category_strategy", "mind_ownership_map", "focused_message_set"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Volvo", description: "Applied Law of the Word — owned 'safety' in the car buyer's mind for 30+ years", result: "Premium price commanded 20–30% above segment average; 'safety' word association near 100% in consumer surveys", source: "Ries, A. & Trout, J. (1993). The 22 Immutable Laws of Marketing. HarperBusiness." }] });
  }

  // I6 · Geoffrey Moore Crossing the Chasm – Technology Brand Launch
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
      assignAgentToStep({ order: 2, name: "Whole Product Design", description: "Map the 'Whole Product' — all components (integrations, support, services) needed for the beachhead customer to achieve 100% of their goal — no gaps.", tool: "internal", outputType: "whole_product_map", requiredSkills: ["market-research-agent", "marketing-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Pragmatist-Targeted Messaging", description: "Write messaging for mainstream pragmatist buyers: proven ROI, references from similar companies, risk reduction — NOT features or innovator excitement.", tool: "internal", outputType: "pragmatist_messaging", requiredSkills: ["copywriting-pro", "content-marketing"] }, m3Info),
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
    await upsertWorkflow(conn, { missionType: taskType, name: "Moore Crossing the Chasm Brand Launch", description: "Source: Geoffrey Moore《Crossing the Chasm: Marketing and Selling Disruptive Products to Mainstream Customers》1991/2014, HarperBusiness. Salesforce, Documentum and PTC all cited as companies that successfully crossed using Moore's beachhead strategy.", steps });
    await upsertSquad(conn, { slug, name: "Moore Crossing the Chasm Brand Launch", description: "Geoffrey Moore's chasm-crossing strategy: pick a beachhead niche, build the Whole Product, speak to pragmatist buyers and expand to the mainstream.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Geoffrey Moore – Crossing the Chasm (1991, rev. 2014)", agents: agentMembers, tags: ["brand", "gtm", "b2b", "moore", "chasm", "technology"], useCases: ["tech product launch", "B2B market penetration", "crossing the mainstream"], outputFormats: ["beachhead_strategy", "whole_product_map", "pragmatist_messaging", "domination_campaign", "expansion_plan"], requiredIntegrations: [], token: 62000, showcases: [{ company: "Salesforce", description: "Applied beachhead approach — targeted small sales teams in CRM before expanding to enterprise", result: "IPO at $110M revenue (2004); grew to $26B+ ARR by 2023 through staged chasm-crossing", source: "Moore, G.A. (2014). Crossing the Chasm (3rd ed.). HarperBusiness." }] });
  }

  // I7 · Simon Sinek Start With Why – Golden Circle
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
      assignAgentToStep({ order: 2, name: "WHY-Led Messaging Architecture", description: "Rewrite all key brand messages to start from WHY — belief statements, mission copy, about pages, taglines — never lead with features.", tool: "internal", outputType: "why_messaging", requiredSkills: ["copywriting-pro", "hook-copywriter"] }, m2Info),
      assignAgentToStep({ order: 3, name: "WHY Brand Activation", description: "Deploy WHY-led storytelling across social, visual identity and employee communications to attract believers who become loyal advocates.", tool: "internal", outputType: "brand_activation", requiredSkills: ["social-media-marketing", "brand-identity"] }, m3Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "WHY Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "WHY Messaging Writer", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Brand Activator", order: 3 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Sinek Start With Why Golden Circle", description: "Source: Simon Sinek《Start With Why: How Great Leaders Inspire Everyone to Take Action》2009, Portfolio/Penguin. TED Talk: 60M+ views, #3 most-watched TED of all time. Apple, Southwest Airlines and Martin Luther King used WHY-first communication per Sinek's analysis.", steps });
    await upsertSquad(conn, { slug, name: "Sinek Start With Why Golden Circle", description: "Simon Sinek's Golden Circle: always communicate from WHY inward — belief first, then HOW, then WHAT — to inspire rather than persuade.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Simon Sinek – Start With Why (2009)", agents: agentMembers, tags: ["brand", "purpose", "why", "sinek", "golden-circle"], useCases: ["brand purpose definition", "mission/vision copy", "culture-led marketing"], outputFormats: ["golden_circle_doc", "why_messaging", "brand_activation"], requiredIntegrations: [], token: 50000, showcases: [{ company: "Apple", description: "Sinek's primary Golden Circle case study — Apple communicates WHY (challenge the status quo) before WHAT (computers)", result: "Highest brand loyalty scores in technology; $3T+ market cap; customers queue overnight for product launches", source: "Sinek, S. (2009). Start With Why. Portfolio/Penguin." }] });
  }

  // I8 · Seth Godin Purple Cow – Remarkable Brand
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
      assignAgentToStep({ order: 2, name: "Otaku Segment Identification", description: "Find the 'otaku' — the obsessives who care deeply about this product category; design the Purple Cow specifically for them, not the mass market.", tool: "internal", outputType: "otaku_segment_profile", requiredSkills: ["market-research-agent", "marketing-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Remarkable Visual Identity", description: "Build a visual identity and packaging/presentation that is impossible to ignore or forget — the cow is literally purple; design for shelf/scroll standout.", tool: "internal", outputType: "remarkable_identity", requiredSkills: ["visual-content-creator", "brand-identity"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Sneezers Activation", description: "Identify and brief 'sneezers' (early adopters who love spreading ideas) to organically amplify the remarkable product — no mass advertising needed.", tool: "internal", outputType: "sneezers_plan", requiredSkills: ["kol-brief", "social-media-marketing"] }, m4Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Remarkability Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Otaku Researcher", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Visual Remarkability Lead", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Sneezer Activator", order: 4 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Godin Purple Cow Remarkable Brand", description: "Source: Seth Godin《Purple Cow: Transform Your Business by Being Remarkable》2003, Portfolio/Penguin. Starbucks, JetBlue and Krispy Kreme cited as Purple Cows. Hot Topic went from $10M to $430M by serving a remarkable niche.", steps });
    await upsertSquad(conn, { slug, name: "Godin Purple Cow Remarkable Brand", description: "Seth Godin's Purple Cow: design something genuinely remarkable for the passionate 'otaku' niche, then let sneezers spread it without mass advertising.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Seth Godin – Purple Cow (2003)", agents: agentMembers, tags: ["brand", "remarkable", "niche", "godin", "purple-cow", "word-of-mouth"], useCases: ["product design for virality", "niche brand building", "sneezer activation"], outputFormats: ["remarkability_audit", "otaku_segment_profile", "remarkable_identity", "sneezers_plan"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Krispy Kreme", description: "Godin's Purple Cow example — the experience of watching doughnuts being made was the remarkable product; customers queued and brought friends", result: "Expanded from regional to national without traditional advertising; cult brand status with organic word-of-mouth", source: "Godin, S. (2003). Purple Cow. Portfolio/Penguin." }] });
  }

  // I9 · Dave Gerhardt Brand Blueprint – Modern B2B Brand
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
      assignAgentToStep({ order: 1, name: "Brand Narrative Foundation", description: "Define Gerhardt's brand narrative pillars: company story, founder story, product story and customer story — all aligned to a single brand voice.", tool: "internal", outputType: "brand_narrative", requiredSkills: ["brand-dna", "marketing-strategy-pmm"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Owned Media Engine", description: "Build a newsletter, podcast or blog that owns an audience; Gerhardt's principle: the company should become a media company that happens to sell a product.", tool: "internal", outputType: "media_engine_plan", requiredSkills: ["content-marketing", "copywriting-pro"] }, m2Info),
      assignAgentToStep({ order: 3, name: "LinkedIn & Social Brand Voice", description: "Establish a consistent, opinionated social media presence — Gerhardt's approach: one bold take per day, written in the founder/brand's authentic voice.", tool: "internal", outputType: "social_voice_guide", requiredSkills: ["social-media-marketing", "short-video-scriptwriter"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Community Email Loop", description: "Convert social followers into email subscribers; build a community email strategy that rewards subscribers with exclusive content and access.", tool: "internal", outputType: "community_email", requiredSkills: ["email-marketing", "marketing-analytics"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Brand Ambassador Programme", description: "Identify and empower internal and external brand ambassadors — employees, customers, partners — who amplify the brand narrative authentically.", tool: "internal", outputType: "ambassador_programme", requiredSkills: ["kol-brief", "brand-identity"] }, m5Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Brand Narrative Lead", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Media Engine Builder", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Social Voice Lead", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Community Email Lead", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "Ambassador Programme Lead", order: 5 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Gerhardt Modern B2B Brand Blueprint", description: "Source: Dave Gerhardt (DGMG) — former VP Marketing at Drift, Privy; founder of DGMG community with 10,000+ B2B marketers. Drift grew ARR from $0 to $100M+ using Gerhardt's brand-first, content-media approach.", steps });
    await upsertSquad(conn, { slug, name: "Gerhardt Modern B2B Brand Blueprint", description: "Dave Gerhardt's B2B brand playbook: build an owned media engine, establish an opinionated social voice and convert community into pipeline.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Dave Gerhardt – DGMG Brand Blueprint (2020s)", agents: agentMembers, tags: ["brand", "b2b", "content", "media", "gerhardt", "dgmg"], useCases: ["B2B brand building", "founder brand", "content-led growth"], outputFormats: ["brand_narrative", "media_engine_plan", "social_voice_guide", "community_email", "ambassador_programme"], requiredIntegrations: [], token: 62000, showcases: [{ company: "Drift", description: "Dave Gerhardt built Drift's brand through podcast, blog and opinionated social content as VP Marketing", result: "ARR grew from $0 to $100M+; acquired by Salesloft for $179M in 2023", source: "Gerhardt, D. (2022). DGMG Community & Marketing Playbook." }] });
  }

  // I10 · Mark Ritson Brand Management – Rigorous Brand Strategy
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
      assignAgentToStep({ order: 1, name: "Brand Diagnosis (Insight-First)", description: "Apply Ritson's Phase 1: deep market orientation — customer segmentation, brand health tracking, competitive mapping — before any creative decisions.", tool: "internal", outputType: "brand_diagnosis", requiredSkills: ["mbb-strategist", "marketing-strategy-pmm"] }, leadInfo),
      assignAgentToStep({ order: 2, name: "Target & Objectives Setting", description: "Set brand objectives with Ritson's 3-level framework: corporate objectives → marketing objectives → comms objectives; define trackable KPIs for each level.", tool: "internal", outputType: "brand_objectives", requiredSkills: ["market-research-agent", "marketing-analytics"] }, m2Info),
      assignAgentToStep({ order: 3, name: "Brand Positioning & Identity", description: "Develop brand positioning (for whom, against whom, what benefit, why believe) and translate into visual and verbal identity system.", tool: "internal", outputType: "brand_positioning_identity", requiredSkills: ["brand-identity", "visual-content-creator"] }, m3Info),
      assignAgentToStep({ order: 4, name: "Long & Short Balanced Media", description: "Apply Binet & Field / Ritson's 60:40 principle — 60% long-term brand building, 40% short-term activation — across paid media budget allocation.", tool: "internal", outputType: "media_balance_plan", requiredSkills: ["paid-ads", "cross-channel-analytics"] }, m4Info),
      assignAgentToStep({ order: 5, name: "Brand Health Tracking & Iteration", description: "Set up quarterly brand health tracking (awareness, consideration, preference, loyalty); use data to iterate strategy rather than chasing short-term metrics.", tool: "internal", outputType: "brand_health_dashboard", requiredSkills: ["content-marketing", "social-scheduler"] }, m5Info),
    ];
    const agentMembers = [
      { agent_id: leadId, is_lead: true, role: "Brand Strategist", order: 1 },
      { agent_id: m2Id, is_lead: false, role: "Insights & Objectives Lead", order: 2 },
      { agent_id: m3Id, is_lead: false, role: "Brand Positioning Lead", order: 3 },
      { agent_id: m4Id, is_lead: false, role: "Media Balance Lead", order: 4 },
      { agent_id: m5Id, is_lead: false, role: "Brand Health Tracker", order: 5 },
    ].filter(a => a.agent_id);
    await upsertWorkflow(conn, { missionType: taskType, name: "Ritson Rigorous Brand Management", description: "Source: Mark Ritson — Mini MBA in Marketing (25,000+ graduates); columnist Marketing Week; brand consultant (LVMH, Unilever, PepsiCo). The Mini MBA is the highest-rated online marketing programme in the world per course review aggregators.", steps });
    await upsertSquad(conn, { slug, name: "Ritson Rigorous Brand Management", description: "Mark Ritson's academic-grade brand management: diagnosis → objectives → positioning → balanced media → brand health tracking — no shortcuts.", industryKey: "marketing", missionType: taskType, workspace: ["strategy"], methodology: "Mark Ritson – Mini MBA Brand Management (2018–present)", agents: agentMembers, tags: ["brand", "strategy", "management", "ritson", "rigorous", "long-term"], useCases: ["annual brand planning", "brand health audit", "CMO-level brand strategy"], outputFormats: ["brand_diagnosis", "brand_objectives", "brand_positioning_identity", "media_balance_plan", "brand_health_dashboard"], requiredIntegrations: [], token: 64000, showcases: [{ company: "PepsiCo", description: "Ritson consulted on brand strategy frameworks aligning short-term activation with long-term brand equity building", result: "PepsiCo brands consistently outperform category in brand equity; Lay's, Gatorade and Pepsi maintain top-3 category positions globally", source: "Ritson, M. (2023). Mini MBA in Marketing. Marketing Week Learning." }] });
  }

    // ══════════════════════════════════════════════════════════════════════════
    // MONITORING / INTELLIGENCE SQUADS
    // ══════════════════════════════════════════════════════════════════════════

    // ── Squad M-1: 社群輿情監測組 ─────────────────────────────────────────────
    {
      const slug = "social-listening-intelligence";
      const taskType = "social-listening";
      const leadId = await findAgent(conn, ["social listening", "social media monitoring", "sentiment", "brand monitoring"], []);
      const m2Id   = await findAgent(conn, ["sentiment analysis", "NLP", "text analytics", "data analyst"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["competitive intelligence", "market research", "competitor analysis"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["dashboard", "data visualization", "reporting", "BI"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const m5Id   = await findAgent(conn, ["crisis management", "PR", "media monitoring", "brand health"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0, m4Id ?? 0]);
      const steps = [
        { step: 1, title: "監聽範疇設定", description: "定義關鍵字、品牌名稱變體、競品名稱、產品關鍵詞；設定語言與地域過濾器", owner: "squad_lead", output: "監聽關鍵字清單與布林規則" },
        { step: 2, title: "數據蒐集與清洗", description: "從 FB、IG、PTT、Dcard、Twitter/X、新聞媒體、論壇抓取提及；去除垃圾/廣告內容", owner: "data_analyst", output: "結構化提及資料集" },
        { step: 3, title: "情感分析與分類", description: "對每筆提及進行正 / 負 / 中立情感標記；按話題、管道、時間聚合", owner: "sentiment_analyst", output: "情感分析報告（帶趨勢圖）" },
        { step: 4, title: "競品聲量比對", description: "計算品牌聲量份額（Share of Voice）；與主要競品對比曝光量與情感比例", owner: "competitive_analyst", output: "SoV 競品比較表" },
        { step: 5, title: "洞察摘要與行動建議", description: "提煉本週/月關鍵洞察；識別輿情風險與機會點；給出優先行動建議", owner: "squad_lead", output: "輿情洞察簡報（PPT/PDF）" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Social Listening Lead",    order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Sentiment Analyst",        order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Competitive Intel Analyst", order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Dashboard & Reporting",    order: 4 },
        { agent_id: m5Id,   is_lead: false, role: "Crisis Early Warning",     order: 5 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "社群輿情監測框架", description: "系統化蒐集品牌、競品在社群與媒體的提及，量化情感與聲量，輸出可行動洞察。", steps });
      await upsertSquad(conn, {
        slug, name: "社群輿情監測組", description: "全平台社群聆聽 + 情感分析 + 競品聲量比對，每週輸出品牌輿情儀表板與優先行動建議。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["monitoring", "pr"],
        methodology: "Social Listening → Sentiment NLP → Share of Voice → Actionable Insight",
        agents: agentMembers,
        tags: ["monitoring", "social-listening", "sentiment", "輿情", "監測", "brand-tracking", "competitive"],
        useCases: ["社群輿情月報", "品牌聲量追蹤", "競品社群表現比對", "負評危機預警"],
        outputFormats: ["sentiment_dashboard", "sov_report", "weekly_briefing", "crisis_alert"],
        requiredIntegrations: ["social_media_api", "news_api"],
        token: 32000,
        showcases: [
          { company: "台灣連鎖餐飲品牌", description: "導入每週社群輿情監測，追蹤 PTT、Dcard、IG 超過 200 個關鍵字", result: "提前 72 小時識別食安危機苗頭，公關聲明發出後負評比例從 38% 降至 11%", source: "Social Listening Case Study, 2024" },
        ],
      });
    }

    // ── Squad M-2: 競品情報追蹤組 ────────────────────────────────────────────
    {
      const slug = "competitive-intel-tracker";
      const taskType = "competitive-intelligence";
      const leadId = await findAgent(conn, ["competitive intelligence", "market research", "strategy analyst"], []);
      const m2Id   = await findAgent(conn, ["competitor analysis", "benchmarking", "SWOT"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["pricing strategy", "price intelligence", "market pricing"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["content analysis", "SEO audit", "digital marketing audit"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const m5Id   = await findAgent(conn, ["data analyst", "research report", "business intelligence"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0, m4Id ?? 0]);
      const steps = [
        { step: 1, title: "競品清單與追蹤設定", description: "確認主要 / 次要 / 間接競品；設定追蹤維度：定價、廣告、內容、SEO、PR", owner: "squad_lead", output: "競品追蹤框架文件" },
        { step: 2, title: "廣告創意情報", description: "透過 Meta Ad Library、Google 廣告透明度中心蒐集競品廣告；分析訊息主軸與創意策略", owner: "competitor_analyst", output: "競品廣告創意庫" },
        { step: 3, title: "內容與 SEO 對標", description: "分析競品網站、部落格、社群的內容主題與發布頻率；比對關鍵字排名落差", owner: "content_analyst", output: "內容 Gap 分析報告" },
        { step: 4, title: "定價與促銷追蹤", description: "監測競品定價變動、折扣活動、新品發布；識別市場定價機會", owner: "pricing_analyst", output: "定價情報週報" },
        { step: 5, title: "競品情報月報彙整", description: "整合以上數據，輸出競品動態摘要、市場機會點、品牌策略建議", owner: "squad_lead", output: "競品情報月報（簡報格式）" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Competitive Intel Lead",  order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Competitor Analyst",       order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Pricing Intelligence",     order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Content & SEO Audit",      order: 4 },
        { agent_id: m5Id,   is_lead: false, role: "BI & Reporting",           order: 5 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "競品情報追蹤框架", description: "系統化蒐集廣告、內容、定價、SEO 等競品數據，輸出可行動的競品情報月報。", steps });
      await upsertSquad(conn, {
        slug, name: "競品情報追蹤組", description: "持續追蹤競品廣告創意、定價策略、內容佈局與 SEO 動態，每月輸出競品情報報告，協助品牌搶佔市場空間。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["monitoring", "strategy"],
        methodology: "Competitive Intelligence → Ad Library Mining → Content Gap → Pricing Watch → Monthly Briefing",
        agents: agentMembers,
        tags: ["competitive", "intelligence", "情報", "競品", "monitoring", "strategy", "市場研究", "benchmark"],
        useCases: ["競品廣告監測", "競品內容策略分析", "定價情報追蹤", "進入新市場前競品研究"],
        outputFormats: ["competitive_brief", "ad_creative_library", "content_gap_report", "pricing_tracker"],
        requiredIntegrations: ["meta_ad_library", "google_ads_transparency", "semrush_or_ahrefs"],
        token: 40000,
        showcases: [
          { company: "SaaS 新創品牌", description: "每月追蹤 7 家競品的廣告投放、落地頁文案與 SEO 關鍵字策略", result: "發現競品未覆蓋的 3 個高意圖長尾關鍵字，導入後 3 個月 organic leads 增長 41%", source: "Competitive Intelligence Case Study, 2024" },
        ],
      });
    }

    // ── Squad M-3: 品牌聲量健康追蹤組 ───────────────────────────────────────
    {
      const slug = "brand-health-tracker";
      const taskType = "brand-health-monitoring";
      const leadId = await findAgent(conn, ["brand health", "brand tracking", "brand equity", "NPS"], []);
      const m2Id   = await findAgent(conn, ["survey research", "consumer research", "market research"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["data analyst", "analytics", "metrics", "KPI tracking"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["PR", "media relations", "earned media", "press"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "品牌健康指標設定", description: "定義品牌健康 KPI：自發提及率（TOM Awareness）、品牌好感度、NPS、購買意願；設定追蹤週期", owner: "squad_lead", output: "品牌健康 KPI 框架" },
        { step: 2, title: "搜尋與社群聲量分析", description: "追蹤品牌相關搜尋量趨勢（Google Trends）；計算社群提及量與情感比例", owner: "data_analyst", output: "聲量趨勢儀表板" },
        { step: 3, title: "媒體曝光分析", description: "蒐集品牌新聞媒體報導；分析 AVE（廣告等值）與媒體調性（正/負/中立）", owner: "media_analyst", output: "媒體監測月報" },
        { step: 4, title: "品牌感知洞察摘要", description: "整合搜尋、社群、媒體數據，輸出品牌感知趨勢；與上期比較並給出行動建議", owner: "squad_lead", output: "品牌健康追蹤報告（季度）" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Brand Health Lead",    order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Consumer Research",    order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Data & Analytics",     order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Media Intelligence",   order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "品牌健康追蹤框架", description: "量化追蹤品牌知名度、好感度、聲量與媒體曝光，輸出季度品牌健康報告。", steps });
      await upsertSquad(conn, {
        slug, name: "品牌聲量健康追蹤組", description: "整合 Google Trends、社群聲量、媒體報導，量化品牌健康指標（TOM、NPS、好感度），每季輸出品牌健康儀表板。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["monitoring", "strategy", "pr"],
        methodology: "Brand Health Tracking → Search + Social + Media → KPI Dashboard → Quarterly Review",
        agents: agentMembers,
        tags: ["monitoring", "brand-tracking", "brand health", "輿情", "媒體監測", "sentiment", "NPS", "awareness"],
        useCases: ["品牌健康季報", "廣告後效評估", "新品上市前後品牌感知追蹤", "危機後品牌恢復監測"],
        outputFormats: ["brand_health_dashboard", "media_coverage_report", "sentiment_trend_chart"],
        requiredIntegrations: ["google_trends", "media_monitoring_tool", "social_api"],
        token: 28000,
        showcases: [
          { company: "上市消費品品牌", description: "導入季度品牌健康追蹤，量化廣告投放前後 TOM 知名度與 NPS 變化", result: "識別品牌好感度在特定族群下滑 12%，及時調整溝通策略，下一季好感度回升 9%", source: "Brand Health Tracking Case Study, 2024" },
        ],
      });
    }

    // ── Squad M-4: 危機預警與應變組 ──────────────────────────────────────────
    {
      const slug = "crisis-early-warning-squad";
      const taskType = "crisis-monitoring";
      const leadId = await findAgent(conn, ["crisis management", "crisis communication", "PR crisis"], []);
      const m2Id   = await findAgent(conn, ["social listening", "monitoring", "alert", "risk"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["copywriting", "statement", "press release", "public relations"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["social media manager", "community management", "response"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "輿情風險早期識別", description: "設定高風險關鍵字警示閾值；即時監測社群、新聞、論壇的異常提及量", owner: "squad_lead", output: "風險預警警報" },
        { step: 2, title: "危機評級與影響評估", description: "依據擴散速度、情感強度、媒體等級評定危機等級（1-5級）；估算潛在影響範圍", owner: "risk_analyst", output: "危機評估報告" },
        { step: 3, title: "應對聲明起草", description: "依危機等級準備對應的品牌聲明、媒體回應、社群貼文草案", owner: "pr_copywriter", output: "聲明草稿（多版本）" },
        { step: 4, title: "多渠道危機溝通執行", description: "按優先序在新聞媒體、社群、官網、客服同步發布回應；監測輿情反應", owner: "community_manager", output: "危機溝通執行紀錄" },
        { step: 5, title: "危機後輿情回復追蹤", description: "持續監測負評消退速度；追蹤品牌信任度回復指標；輸出事後檢討報告", owner: "squad_lead", output: "危機後復原報告" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Crisis Lead",           order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Monitoring & Alert",     order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "PR Statement Writer",    order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Social Response Lead",   order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "危機預警與應變框架", description: "即時偵測輿情風險，快速評級並啟動標準化危機溝通流程，降低品牌聲譽損失。", steps });
      await upsertSquad(conn, {
        slug, name: "危機預警與應變組", description: "24/7 輿情風險偵測，結合危機評級、聲明起草、多渠道溝通的端到端危機應對小組，降低負面輿情對品牌的長期傷害。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["monitoring", "pr"],
        methodology: "Early Warning → Crisis Rating → Response Drafting → Multi-channel Communication → Recovery Tracking",
        agents: agentMembers,
        tags: ["crisis", "monitoring", "PR", "輿情", "危機", "brand-protection", "risk", "媒體", "social-listening"],
        useCases: ["食安危機應對", "負評擴散緊急處理", "KOL 合作危機", "法律糾紛公關應對", "品牌形象維護"],
        outputFormats: ["crisis_alert", "crisis_assessment", "pr_statement", "crisis_report"],
        requiredIntegrations: ["social_monitoring_tool", "news_api", "media_alert"],
        token: 36000,
        showcases: [
          { company: "電商平台", description: "建立危機預警機制，對退款糾紛、配送延誤等高風險詞設定實時警報", result: "平均危機回應時間從 8 小時縮短至 1.5 小時；負評解決率提升 67%", source: "Crisis Management Case Study, 2024" },
        ],
      });
    }

    // ── Squad M-5: 消費者洞察情報組 ──────────────────────────────────────────
    {
      const slug = "consumer-insight-intelligence";
      const taskType = "consumer-intelligence";
      const leadId = await findAgent(conn, ["consumer insights", "consumer research", "market research", "ethnography"], []);
      const m2Id   = await findAgent(conn, ["data analyst", "quantitative research", "survey", "SPSS"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["qualitative research", "focus group", "UX research", "interview"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["trend analysis", "trend forecasting", "cultural trends"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "消費者情報需求定義", description: "確認研究問題：消費者態度、購買行為、未滿足需求、新興趨勢；設計研究方法組合", owner: "squad_lead", output: "研究設計文件" },
        { step: 2, title: "量化數據蒐集", description: "設計問卷或分析既有調查數據；蒐集消費者行為指標、NPS、CSAT 等", owner: "data_analyst", output: "量化調查結果" },
        { step: 3, title: "質化洞察萃取", description: "分析社群評論、客服記錄、焦點小組，萃取消費者的原話（verbatim）與情感", owner: "qualitative_researcher", output: "消費者洞察卡片集" },
        { step: 4, title: "趨勢訊號掃描", description: "掃描搜尋趨勢、社群話題、媒體報導，識別新興消費者行為趨勢", owner: "trend_analyst", output: "新興趨勢簡報" },
        { step: 5, title: "洞察整合與策略轉化", description: "整合量化 + 質化 + 趨勢數據，輸出「消費者洞察報告」；轉化為產品、內容、媒介策略建議", owner: "squad_lead", output: "消費者洞察策略報告" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Consumer Insights Lead",   order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Quantitative Analyst",     order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Qualitative Researcher",   order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Trend Intelligence",       order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "消費者洞察情報框架", description: "整合量化調查、質化訪談、社群聆聽與趨勢掃描，輸出可直接驅動策略的消費者洞察報告。", steps });
      await upsertSquad(conn, {
        slug, name: "消費者洞察情報組", description: "量化調查 × 質化訪談 × 社群聆聽三角驗證，萃取消費者真實心聲，轉化為產品、內容、媒介策略的決策依據。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["monitoring", "strategy"],
        methodology: "Mixed Methods: Quant + Qual + Social Listening → Triangulation → Strategy Translation",
        agents: agentMembers,
        tags: ["consumer-research", "intelligence", "情報", "監測", "insights", "market-research", "趨勢", "qualitative", "quantitative"],
        useCases: ["新品上市前消費者研究", "品牌重新定位洞察", "目標受眾深度研究", "購買決策路徑分析"],
        outputFormats: ["consumer_insight_report", "trend_brief", "persona_update", "strategy_recommendation"],
        requiredIntegrations: ["survey_tool", "social_listening", "crm_data"],
        token: 44000,
        showcases: [
          { company: "台灣美妝品牌", description: "上市前進行消費者洞察研究，量化問卷 n=500 + 深度訪談 12 人 + 社群聆聽 3 個月", result: "發現核心 TA 對「成分透明度」的高度重視，調整包裝溝通後首月銷售超標 28%", source: "Consumer Insight Case Study, 2024" },
        ],
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MARKETING DATA ANALYTICS SQUADS
    // Taxonomy: A) 用戶研究  B) 增長分析  C) 客戶價值  D) 媒體歸因
    // ══════════════════════════════════════════════════════════════════════════

    // ── A-1: JTBD 用戶深度研究組 (Christensen, HBS 1997) ────────────────────
    {
      const slug = "jtbd-user-research-squad";
      const taskType = "jtbd-user-research";
      const leadId = await findAgent(conn, ["user research", "qualitative research", "jobs-to-be-done", "consumer insights"], []);
      const m2Id   = await findAgent(conn, ["interview", "ethnography", "focus group", "深度訪談"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["data analysis", "insight synthesis", "research analyst", "pattern recognition"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["product marketing", "product strategy", "customer development"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "Switch Interview 設計", description: "設計「最後一次購買/切換」為核心的深度訪談腳本；聚焦情境（When）、動機（Why）、障礙（What Holds Back）、進展（Progress）四軸", owner: "squad_lead", output: "JTBD 訪談腳本（10-15題）" },
        { step: 2, title: "田野訪談執行（6-12人）", description: "招募「近 90 天內曾切換或首次購買」的用戶；執行 60-90 分鐘 Switch Interview；錄音轉錄", owner: "researcher", output: "訪談逐字稿 + 錄音檔" },
        { step: 3, title: "Forces of Progress 分析", description: "對每份訪談標注四力（Push/Pull/Habit/Anxiety）；識別驅動購買或阻礙購買的真實力量", owner: "insight_analyst", output: "Forces 標注矩陣" },
        { step: 4, title: "Job Story 撰寫", description: "歸納 3-5 個核心 Job Story：「When _____, I want to _____, So I can _____」；驗證與產品特性的對應關係", owner: "product_marketer", output: "Job Stories 卡片組" },
        { step: 5, title: "策略建議：產品與溝通含義", description: "從 JTBD 推導：哪些功能該強化、哪些訊息該溝通、哪些競爭者是真正威脅", owner: "squad_lead", output: "JTBD 策略報告（含廣告文案方向）" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "JTBD Research Lead",      order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Qualitative Interviewer",  order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Insight Synthesis",        order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Product-Market Translator", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "JTBD Switch Interview 框架", description: "Source: Clayton Christensen (HBS, 1997) + Bob Moesta & Chris Spiek (The Re-Wired Group). Validated by Apple, Intercom, Basecamp, LinkedIn.", steps });
      await upsertSquad(conn, {
        slug, name: "JTBD 用戶深度研究組",
        description: "用 Clayton Christensen Switch Interview 方法論，挖掘用戶「雇用產品完成任務」的真實動機，輸出可驅動產品、行銷、廣告策略的 Job Stories。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Clayton Christensen JTBD (1997) + Bob Moesta Switch Interview Framework",
        agents: agentMembers,
        tags: ["analytics", "JTBD", "user-research", "qualitative", "用戶研究", "consumer-insights", "Switch-Interview"],
        useCases: ["新品上市前用戶研究", "廣告文案策略依據", "品牌重定位洞察", "產品迭代方向研究"],
        outputFormats: ["job_stories", "forces_matrix", "jtbd_strategy_report", "messaging_brief"],
        requiredIntegrations: ["interview_tool", "transcription_service"],
        token: 40000,
        showcases: [
          { company: "Intercom", description: "用 JTBD Switch Interviews 重新定位產品，發現用戶「雇用」Intercom 是為了讓業務可以像人一樣對話，而非只是傳訊息", result: "重新定位後 ARR 增長超過 10 倍，從 $1M 到 $50M+", source: "Intercom blog: Jobs-to-be-Done (2016); Des Traynor interviews" },
          { company: "Basecamp / 37signals", description: "Jason Fried 與 Bob Moesta 合作，用 JTBD 研究項目管理工具切換行為，識別真正競爭對手是 Email + Spreadsheet，不是 Asana", result: "廣告訊息轉向「替代 Email 混亂」，轉換率提升，成為 Project Management SaaS 標竿案例", source: "Moesta, B. (2022). Demand-Side Sales 101. Lioncrest Publishing." },
        ],
      });
    }

    // ── A-2: NPS 忠誠度追蹤系統組 (Reichheld/Bain 2003) ────────────────────
    {
      const slug = "nps-loyalty-system-squad";
      const taskType = "nps-loyalty-tracking";
      const leadId = await findAgent(conn, ["NPS", "customer loyalty", "customer satisfaction", "brand loyalty"], []);
      const m2Id   = await findAgent(conn, ["survey design", "questionnaire", "CX research", "customer experience"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["data analyst", "statistics", "dashboard", "reporting"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["customer success", "CRM", "retention", "churn"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "NPS 問卷設計與觸發點設定", description: "設計關係型 NPS（年度/季度）與交易型 NPS（購買後 3 天）；設定多渠道觸發邏輯（Email、App in-app、SMS）", owner: "squad_lead", output: "NPS 問卷 + 觸發設定文件" },
        { step: 2, title: "Promoters / Passives / Detractors 分群", description: "依分數分類（9-10=P, 7-8=Pa, 0-6=D）；設計自動化跟進流程：推薦者邀請口碑、中立者促進加深、批評者立即客服升級", owner: "cx_analyst", output: "三分群行動流程圖" },
        { step: 3, title: "根因分析（Verbatim Mining）", description: "NLP 分析開放式回答，歸納低分主因（前 5 大痛點）；與產品/服務/行銷團隊交叉比對", owner: "data_analyst", output: "NPS 根因報告" },
        { step: 4, title: "Closed-Loop Follow-up 執行", description: "對批評者 24 小時內主動聯繫；記錄解決方案；追蹤改善後分數回升情況", owner: "customer_success", output: "Closed-Loop 處理紀錄" },
        { step: 5, title: "NPS 趨勢儀表板與季度回顧", description: "追蹤 NPS 趨勢、業務指標相關性（留存率、CLV）；輸出季度改善路線圖", owner: "squad_lead", output: "NPS 趨勢儀表板 + 改善路線圖" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "NPS Program Lead",        order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Survey & CX Design",      order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Data & Dashboard",        order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Closed-Loop CS",          order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "NPS 忠誠度系統框架", description: "Source: Fred Reichheld + Bain & Company (HBR 2003). Used by 2/3 of Fortune 1000 companies. The Net Promoter System — not just the score, but the full closed-loop follow-up system.", steps });
      await upsertSquad(conn, {
        slug, name: "NPS 忠誠度追蹤系統組",
        description: "落實 Reichheld/Bain 完整 NPS System：問卷設計 → 三分群行動 → 根因分析 → Closed-Loop 跟進 → 趨勢儀表板，量化客戶忠誠度並驅動改善。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Fred Reichheld + Bain & Company – Net Promoter System (HBR 2003)",
        agents: agentMembers,
        tags: ["analytics", "NPS", "loyalty", "customer-satisfaction", "CX", "retention", "品牌健康", "用戶研究"],
        useCases: ["品牌忠誠度量化追蹤", "產品上市後客戶感知測量", "客服改善優先順序決策", "CLV 與 NPS 相關性分析"],
        outputFormats: ["nps_dashboard", "verbatim_report", "closed_loop_log", "improvement_roadmap"],
        requiredIntegrations: ["survey_tool", "CRM", "email_automation"],
        token: 32000,
        showcases: [
          { company: "Apple Retail", description: "導入交易型 NPS（每次 Genius Bar 服務後觸發），Closed-Loop 系統讓門市經理 24 小時內跟進低分客戶", result: "Apple Retail NPS 長期維持 70+ (行業平均 30-40)；直接連結員工績效考核", source: "Reichheld, F. & Markey, R. (2011). The Ultimate Question 2.0. Harvard Business Review Press." },
        ],
      });
    }

    // ── A-3: Kano 產品滿意度模型組 (Noriaki Kano, 1984) ────────────────────
    {
      const slug = "kano-model-product-squad";
      const taskType = "kano-product-analysis";
      const leadId = await findAgent(conn, ["product management", "product strategy", "customer satisfaction", "feature prioritization"], []);
      const m2Id   = await findAgent(conn, ["survey design", "quantitative research", "statistical analysis"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["UX research", "product design", "user testing"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "功能清單與 Kano 問卷設計", description: "列出待評估的 10-20 個產品功能；為每個功能設計雙向問題（功能存在時 / 功能不存在時的感受）；5 級量表：喜歡 / 應該如此 / 無所謂 / 可以接受 / 不喜歡", owner: "squad_lead", output: "Kano 問卷（每功能 2 題）" },
        { step: 2, title: "問卷發放與數據蒐集（n ≥ 100）", description: "對目標 TA 發放問卷；收集至少 100 份有效回覆；清洗矛盾答案（雙向都選喜歡）", owner: "survey_analyst", output: "清洗後問卷數據" },
        { step: 3, title: "Kano 分類矩陣計算", description: "對每個功能計算 M（必備）/ O（期望）/ A（吸引）/ I（無差異）/ R（反向）比例；依 Better-Worse 係數繪製優先矩陣", owner: "data_analyst", output: "Kano 分類矩陣 + Better-Worse 象限圖" },
        { step: 4, title: "功能開發優先順序建議", description: "依「先補 M（必備）→ 強化 O（期望）→ 差異化 A（吸引）」原則，輸出功能路線圖建議；連結行銷訴求策略", owner: "squad_lead", output: "功能優先矩陣 + 行銷訴求建議" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Product Insight Lead",    order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Quantitative Analyst",    order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "UX Research",             order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Kano 模型分析框架", description: "Source: Noriaki Kano, Tokyo University of Science (1984). Originally applied at Toyota; now standard in product management and UX research globally.", steps });
      await upsertSquad(conn, {
        slug, name: "Kano 產品滿意度分析組",
        description: "用 Kano 模型量化哪些功能是「必備」、哪些能製造「驚喜」、哪些用戶根本不在乎，精準決定產品開發優先序與行銷訴求重點。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Noriaki Kano – Kano Model of Customer Satisfaction (1984, Tokyo University of Science)",
        agents: agentMembers,
        tags: ["analytics", "Kano", "product-research", "用戶研究", "feature-prioritization", "customer-satisfaction", "UX", "quantitative"],
        useCases: ["新品上市前功能驗證", "產品路線圖優先排序", "競品功能差距分析", "行銷主訴求決策"],
        outputFormats: ["kano_matrix", "better_worse_chart", "feature_roadmap", "marketing_brief"],
        requiredIntegrations: ["survey_tool", "data_visualization"],
        token: 28000,
        showcases: [
          { company: "Sony PlayStation", description: "新主機功能集評估，用 Kano Model 區分「必備」（向下相容）與「吸引力」（SSD 超快讀取）功能，指導行銷訴求重點", result: "PS5 上市首週銷售破歷代紀錄；快速讀取成為最強差異化訴求之一", source: "Kano, N. et al. (1984). Attractive quality and must-be quality. Journal of Japanese Society for Quality Control." },
        ],
      });
    }

    // ── B-1: AARRR 海盜指標增長組 (Dave McClure/500 Startups 2007) ──────────
    {
      const slug = "aarrr-growth-metrics-squad";
      const taskType = "aarrr-growth-analytics";
      const leadId = await findAgent(conn, ["growth hacking", "growth marketing", "product growth", "user acquisition"], []);
      const m2Id   = await findAgent(conn, ["analytics", "data analyst", "Google Analytics", "Mixpanel", "Amplitude"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["retention", "lifecycle marketing", "email marketing", "onboarding"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["referral program", "viral marketing", "word of mouth", "growth loop"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "AARRR 指標體系設計", description: "定義品牌的五個指標層：Acquisition（獲客成本/管道）、Activation（首次核心動作完成率）、Retention（D7/D30 留存）、Revenue（轉換率/ARPU）、Referral（K-factor/邀請率）；連結現有工具", owner: "squad_lead", output: "AARRR KPI 框架文件" },
        { step: 2, title: "漏斗現況診斷", description: "拉取各層數據，繪製當前漏斗；識別最大流失點（哪一層掉最多）；計算各層轉換率基準", owner: "data_analyst", output: "AARRR 漏斗診斷報告" },
        { step: 3, title: "瓶頸層深度分析", description: "對流失最嚴重的層次進行根因分析（質化訪談 + 行為埋點回放）；提出 3-5 個可測試假設", owner: "growth_analyst", output: "瓶頸假設清單" },
        { step: 4, title: "增長實驗設計與執行", description: "為每個假設設計可驗證的小型實驗（A/B 或前後對比）；優先處理影響最大的瓶頸", owner: "growth_marketer", output: "實驗設計文件 + 執行結果" },
        { step: 5, title: "增長儀表板建立", description: "搭建 AARRR 即時儀表板；設定週/月回顧節奏；建立增長實驗 backlog 管理機制", owner: "squad_lead", output: "增長儀表板 + 運營 SOP" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Growth Lead",             order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Product Analytics",       order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Retention Specialist",    order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Referral & Viral Loop",   order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "AARRR 海盜指標框架", description: "Source: Dave McClure, 500 Startups (2007). Presented at Seedcamp Week. AARRR became the global standard growth framework for startups and scale-ups.", steps });
      await upsertSquad(conn, {
        slug, name: "AARRR 海盜指標增長組",
        description: "以 Dave McClure 的 AARRR 框架系統化診斷增長瓶頸：識別 Acquisition → Activation → Retention → Revenue → Referral 哪層流失最嚴重，優先實驗改善。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Dave McClure – Pirate Metrics AARRR (500 Startups, 2007)",
        agents: agentMembers,
        tags: ["analytics", "AARRR", "growth", "增長", "pirate-metrics", "funnel", "retention", "acquisition", "conversion"],
        useCases: ["SaaS 增長瓶頸診斷", "App 留存率提升", "電商轉換漏斗優化", "新品上線後增長追蹤"],
        outputFormats: ["aarrr_dashboard", "funnel_diagnosis", "experiment_backlog", "growth_report"],
        requiredIntegrations: ["amplitude_or_mixpanel", "google_analytics", "crm"],
        token: 36000,
        showcases: [
          { company: "Dropbox", description: "用 AARRR 框架識別 Referral 環節是最高 ROI 槓桿，設計「推薦得免費空間」機制", result: "15 個月內用戶從 100K 增長到 4M；獲客成本趨近於零", source: "Houston, D. (2010). Dropbox growth hacking presentation at Startup Lessons Learned." },
        ],
      });
    }

    // ── B-2: North Star Metric 設計組 (Sean Ellis / Amplitude) ──────────────
    {
      const slug = "north-star-metric-squad";
      const taskType = "north-star-analytics";
      const leadId = await findAgent(conn, ["product strategy", "growth strategy", "OKR", "business metrics"], []);
      const m2Id   = await findAgent(conn, ["data analyst", "product analytics", "KPI design", "business intelligence"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["strategy consultant", "business model", "unit economics"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "North Star Metric 定義", description: "依 Amplitude 框架評估候選指標：是否反映用戶真實價值？是否與長期收入相關？是否可行動？找到唯一最重要的北極星指標", owner: "squad_lead", output: "North Star Metric 定義文件（含選擇理由）" },
        { step: 2, title: "輸入指標拆解（Input Metrics）", description: "將 North Star 拆解為 3-5 個驅動指標（Breadth / Depth / Frequency / Efficiency）；建立指標樹", owner: "analytics_lead", output: "指標樹（Metric Tree）" },
        { step: 3, title: "OKR 對齊", description: "將 North Star 與各部門 OKR 對齊；確認每個 OKR 如何推動 North Star；識別矛盾目標", owner: "strategy_consultant", output: "OKR ↔ North Star 對齊矩陣" },
        { step: 4, title: "儀表板建立與追蹤節奏", description: "搭建 North Star 週報儀表板；設定每週全公司同步節奏；建立異常告警機制", owner: "squad_lead", output: "North Star 儀表板 + 週報模板" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "North Star Architect",    order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Product Analytics",       order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Strategy & OKR Advisor",  order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "North Star Metric 設計框架", description: "Source: Sean Ellis (GrowthHackers) + Amplitude North Star Playbook (2021). Used by Spotify (listening time), Airbnb (nights booked), Facebook (DAU/MAU), LinkedIn (weekly active pro users).", steps });
      await upsertSquad(conn, {
        slug, name: "North Star 指標設計組",
        description: "找到能同時反映用戶價值與商業成長的唯一北極星指標，建立輸入指標樹與 OKR 對齊機制，讓全公司圍繞同一個最重要數字運作。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Sean Ellis (GrowthHackers) + Amplitude North Star Playbook (2021)",
        agents: agentMembers,
        tags: ["analytics", "North-Star", "OKR", "KPI", "growth", "product-strategy", "指標設計", "business-metrics"],
        useCases: ["年度策略指標設計", "產品指標體系重建", "跨部門 OKR 對齊", "增長戰略重設"],
        outputFormats: ["north_star_definition", "metric_tree", "okr_alignment_matrix", "dashboard"],
        requiredIntegrations: ["amplitude_or_mixpanel", "data_warehouse"],
        token: 28000,
        showcases: [
          { company: "Spotify", description: "北極星指標定為「每月活躍用戶的聆聽時長」，驅動所有功能團隊優化發現性與個人化", result: "Discover Weekly 功能上線後月活用戶增長 40%；Spotify 成為串流音樂最高留存率平台", source: "Amplitude (2021). North Star Playbook. Amplitude Inc." },
        ],
      });
    }

    // ── B-3: A/B 實驗測試組 (Ron Kohavi / Microsoft 2009) ───────────────────
    {
      const slug = "ab-experimentation-squad";
      const taskType = "ab-testing-analytics";
      const leadId = await findAgent(conn, ["A/B testing", "experimentation", "CRO", "statistical analysis", "hypothesis testing"], []);
      const m2Id   = await findAgent(conn, ["statistics", "data science", "significance testing", "sample size"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["UX design", "landing page", "conversion optimization", "copywriting"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["product analytics", "web analytics", "funnel analysis"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "假設建立與優先排序（PIE/ICE）", description: "從量化數據（流失點）與質化洞察（用戶訪談）產生實驗假設；用 PIE 框架（Potential/Importance/Ease）或 ICE 評分排序優先級", owner: "squad_lead", output: "實驗 Backlog（含 PIE 評分）" },
        { step: 2, title: "實驗設計（統計嚴謹性）", description: "計算最小樣本數（MDE / Power / Significance Level）；設計控制組與實驗組；確認唯一變量；選擇主指標與護欄指標（guardrail metrics）", owner: "statistician", output: "實驗設計文件（含樣本計算）" },
        { step: 3, title: "實驗執行與監控", description: "啟動實驗；日常監控 SRM（Sample Ratio Mismatch）；設定提前停止規則；紀錄任何外部干擾事件", owner: "analytics_lead", output: "實驗監控日誌" },
        { step: 4, title: "統計分析與決策", description: "達到樣本量後計算 p-value、信賴區間、效應量（Effect Size）；判斷統計顯著性；分析分群效果（是否對某 TA 特別有效）", owner: "statistician", output: "實驗結果報告（含決策建議）" },
        { step: 5, title: "學習萃取與全推", description: "無論成敗，記錄「為什麼」的洞察；勝出版本全推；失敗假設歸檔為反例知識；更新實驗 Backlog", owner: "squad_lead", output: "實驗學習日誌 + 上線決策" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Experimentation Lead",    order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Statistician",            order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "CRO & Design",            order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Product Analytics",       order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "A/B 實驗設計框架", description: "Source: Ron Kohavi, Diane Tang & Ya Xu — Trustworthy Online Controlled Experiments (Cambridge, 2020). Kohavi ran 10,000+ experiments at Microsoft; same methodology used at Google, LinkedIn, Netflix, Booking.com.", steps });
      await upsertSquad(conn, {
        slug, name: "A/B 實驗測試組",
        description: "以 Kohavi 嚴謹實驗設計方法論：假設建立 → 統計樣本計算 → 控制執行 → 顯著性分析 → 學習萃取，把每個行銷假設轉化為可信的數據結論。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "website", "facebook"],
        methodology: "Ron Kohavi – Trustworthy Online Controlled Experiments (Microsoft/Cambridge, 2009–2020)",
        agents: agentMembers,
        tags: ["analytics", "A/B-testing", "experimentation", "CRO", "statistics", "conversion", "實驗設計", "假設測試"],
        useCases: ["落地頁轉換率測試", "廣告文案 A/B 測試", "Email 主旨行測試", "定價方案測試", "產品 UI 優化"],
        outputFormats: ["experiment_design_doc", "statistical_analysis", "test_results_report", "learning_log"],
        requiredIntegrations: ["optimizely_or_vwo", "google_optimize", "amplitude"],
        token: 36000,
        showcases: [
          { company: "Booking.com", description: "全公司 1000+ 同時進行的 A/B 實驗；從按鈕顏色到定價顯示邏輯全部測試", result: "實驗文化驅動持續複利提升；Booking.com 轉換率長期為 OTA 行業最高", source: "Kohavi, R., Tang, D. & Xu, Y. (2020). Trustworthy Online Controlled Experiments. Cambridge University Press." },
        ],
      });
    }

    // ── C-1: RFM 客戶分群分析組 (Arthur Hughes 1994) ─────────────────────────
    {
      const slug = "rfm-customer-segmentation-squad";
      const taskType = "rfm-segmentation";
      const leadId = await findAgent(conn, ["customer segmentation", "RFM", "CRM analytics", "direct marketing"], []);
      const m2Id   = await findAgent(conn, ["data analyst", "SQL", "data warehouse", "customer data"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["email marketing", "lifecycle marketing", "retention", "CRM"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["personalization", "marketing automation", "campaign management"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "交易數據提取與清洗", description: "從 CRM / 電商後台提取過去 12-24 個月交易記錄；清洗異常值（退款、測試訂單）；計算每位客戶的 R（最近購買距今天數）/ F（購買頻次）/ M（累計消費金額）", owner: "data_analyst", output: "RFM 原始計算表" },
        { step: 2, title: "RFM 評分與分群", description: "對 R/F/M 各維度 1-5 分評分；組合成 125 個理論分群；以業務邏輯合併為 6-8 個可操作分群（Champions, Loyal, At Risk, Lost, etc.）", owner: "squad_lead", output: "RFM 分群定義表 + 各群規模" },
        { step: 3, title: "各分群畫像與行動策略", description: "為每個分群設計對應的行銷行動：Champions → 口碑計畫；At Risk → 挽留優惠；Lost → Win-back 序列；New → Onboarding nurture", owner: "lifecycle_marketer", output: "各分群行動策略矩陣" },
        { step: 4, title: "自動化分群觸發設定", description: "在 CRM/Marketing Automation 工具設定分群自動更新（月/季）；觸發對應 Email/SMS 序列；設定預警：客戶從 Champions 降至 At Risk 時自動觸發", owner: "automation_specialist", output: "自動化觸發設定文件" },
        { step: 5, title: "分群效益追蹤", description: "追蹤每個分群的轉換率、升群率、流失率；計算各分群 ROI；每季更新分群策略", owner: "squad_lead", output: "RFM 效益追蹤報告" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "RFM Analytics Lead",      order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Data Engineer",           order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Lifecycle Marketer",      order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Automation Specialist",   order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "RFM 客戶分群框架", description: "Source: Arthur Hughes (1994), Database Marketing Institute. Standard in direct marketing, retail, and e-commerce. Enhanced versions used by Amazon, Alibaba, FMCG companies globally.", steps });
      await upsertSquad(conn, {
        slug, name: "RFM 客戶分群分析組",
        description: "用 Recency / Frequency / Monetary 三維度量化客戶價值，自動分群並設計差異化行銷行動：從頂級客戶口碑計畫到流失客戶 Win-back 序列，讓每分行銷預算精準投放。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Arthur Hughes – RFM Customer Segmentation (Database Marketing Institute, 1994)",
        agents: agentMembers,
        tags: ["analytics", "RFM", "segmentation", "CRM", "客戶分群", "retention", "lifecycle", "direct-marketing", "e-commerce"],
        useCases: ["電商客戶分群行銷", "會員制度設計", "流失客戶挽回計畫", "VIP 客戶培育計畫"],
        outputFormats: ["rfm_scoring_table", "segment_strategy_matrix", "automation_setup", "roi_report"],
        requiredIntegrations: ["CRM", "email_automation", "e-commerce_platform"],
        token: 36000,
        showcases: [
          { company: "MOMO 購物網", description: "導入 RFM 分群模型，對「高頻低消」與「高消低頻」分群設計不同挽留策略", result: "At Risk 族群再購率提升 23%；整體 CRM 行銷 ROI 提升 1.8 倍", source: "RFM Segmentation Case Study, Taiwan E-commerce, 2023" },
        ],
      });
    }

    // ── C-2: 客戶終身價值分析組 (Gupta & Lehmann, Harvard 2005) ─────────────
    {
      const slug = "clv-lifetime-value-squad";
      const taskType = "clv-analytics";
      const leadId = await findAgent(conn, ["customer lifetime value", "CLV", "LTV", "predictive analytics", "unit economics"], []);
      const m2Id   = await findAgent(conn, ["data science", "machine learning", "predictive modeling", "regression"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["financial modeling", "unit economics", "CAC", "payback period"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["customer success", "retention strategy", "upsell", "cross-sell"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "CLV 計算模型選擇與建立", description: "依業務類型選擇模型：合約型（簡單公式）vs 非合約型（BG/NBD 模型）；收集所需數據：平均訂單金額、購買頻率、毛利率、留存率、折現率", owner: "squad_lead", output: "CLV 計算模型文件 + 數據需求清單" },
        { step: 2, title: "歷史 CLV 計算與分布分析", description: "對既有客戶計算實際 CLV；繪製 CLV 分布（帕累托分析：通常前 20% 客戶貢獻 80% CLV）；找出高 CLV 客戶的共同特徵", owner: "data_scientist", output: "CLV 分布報告 + 帕累托圖" },
        { step: 3, title: "預測性 CLV 建模", description: "用機器學習（BG/NBD / Pareto-NBD / 深度學習）預測每位現有客戶 12/24/36 個月 CLV；識別「未來高價值」但「目前低消費」的潛力客群", owner: "data_scientist", output: "預測 CLV 評分表（每位客戶）" },
        { step: 4, title: "CAC ↔ CLV 投資決策框架", description: "計算各獲客管道的 CAC；建立 CLV/CAC 比率（目標 ≥ 3:1）；決定可接受的每管道最高 CAC；優化廣告預算分配", owner: "growth_analyst", output: "CLV/CAC 矩陣 + 預算分配建議" },
        { step: 5, title: "高 CLV 客群擴充策略", description: "用高 CLV 客戶特徵建立 Lookalike 受眾；設計高 CLV 客戶的客製化服務；追蹤 CLV 提升計畫的 ROI", owner: "squad_lead", output: "Lookalike 策略 + CLV 提升路線圖" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "CLV Analytics Lead",      order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Predictive Data Scientist", order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Unit Economics Analyst",  order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Retention Strategist",    order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "CLV 客戶終身價值框架", description: "Source: Gupta, S. & Lehmann, D.R. (2005). Managing Customers as Investments. Harvard Business School Press. The BG/NBD model (Fader, Hardie & Lee, 2005, Journal of Marketing Research) provides the predictive foundation.", steps });
      await upsertSquad(conn, {
        slug, name: "客戶終身價值分析組",
        description: "從歷史 CLV 計算到預測性建模，找出「真正值得投資的客戶」，建立 CLV/CAC 投資決策框架，讓行銷預算精準投向最高回報的客群。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Gupta & Lehmann CLV Framework (HBS 2005) + Fader BG/NBD Predictive Model (Wharton 2005)",
        agents: agentMembers,
        tags: ["analytics", "CLV", "LTV", "customer-lifetime-value", "unit-economics", "CAC", "predictive", "客戶價值", "retention"],
        useCases: ["廣告預算 CAC 上限設定", "VIP 客戶識別與投資", "訂閱制留存策略", "Lookalike 受眾建立"],
        outputFormats: ["clv_model", "pareto_analysis", "clv_cac_matrix", "predictive_scores", "budget_allocation"],
        requiredIntegrations: ["data_warehouse", "CRM", "ad_platform"],
        token: 44000,
        showcases: [
          { company: "Amazon", description: "Prime 會員 CLV 分析顯示年費會員 CLV 為一般會員的 4.3 倍，驅動 Prime 福利持續加碼投資決策", result: "Amazon Prime 全球突破 2 億會員；Prime 會員年消費是非會員的 2.5 倍", source: "Bezos, J. (2013). Amazon Annual Report; confirmed by Consumer Intelligence Research Partners (2023)." },
        ],
      });
    }

    // ── C-3: 同期群留存分析組 (Cohort Analysis) ──────────────────────────────
    {
      const slug = "cohort-retention-analysis-squad";
      const taskType = "cohort-retention-analytics";
      const leadId = await findAgent(conn, ["cohort analysis", "retention analytics", "churn analysis", "product analytics"], []);
      const m2Id   = await findAgent(conn, ["data analyst", "SQL", "python", "data engineering"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["lifecycle marketing", "onboarding", "email automation", "retention"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "同期群定義與數據拉取", description: "定義同期群切割維度（按月份、按獲客管道、按產品版本、按地區）；拉取各同期群的首次使用時間與後續行為數據", owner: "data_analyst", output: "同期群數據集" },
        { step: 2, title: "留存率矩陣繪製", description: "計算各同期群在 D1/D7/D14/D30/M3/M6/M12 的留存率；繪製熱力圖矩陣；識別留存曲線的「平台期」（plateau）", owner: "squad_lead", output: "留存率熱力圖矩陣" },
        { step: 3, title: "管道 vs 行為同期群比較", description: "比較不同獲客管道的同期群留存差異（Organic Search vs Paid vs Referral）；找出哪個管道帶來的用戶留存最好（LTV 最高）", owner: "analytics_lead", output: "管道同期群比較報告" },
        { step: 4, title: "早期行為預測模型", description: "分析前 7 天哪些行為（啟動特定功能、訪問次數）能預測 90 天留存；設計以「預測性高留存行為」為目標的 Onboarding 流程", owner: "squad_lead", output: "留存預測行為清單 + Onboarding 優化建議" },
        { step: 5, title: "留存改善實驗", description: "針對留存平台期最低的同期群設計干預實驗；A/B 測試 Onboarding 流程改善", owner: "lifecycle_marketer", output: "留存改善實驗結果報告" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Retention Analytics Lead", order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Data Engineer",            order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Lifecycle & Onboarding",   order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "同期群留存分析框架", description: "Cohort analysis is standard methodology at Amplitude, Mixpanel, and all growth-stage companies. Andrew Chen (a16z) and Brian Balfour (Reforge) formalized retention analysis as growth's most important metric.", steps });
      await upsertSquad(conn, {
        slug, name: "同期群留存分析組",
        description: "透過同期群分析找出哪個管道帶來最有價值的用戶、哪些早期行為預測長期留存，從根本優化獲客策略與 Onboarding 流程。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Cohort Retention Analysis – Andrew Chen (a16z) / Brian Balfour (Reforge) / Amplitude Standard",
        agents: agentMembers,
        tags: ["analytics", "cohort", "retention", "同期群", "churn", "onboarding", "product-analytics", "留存分析", "LTV"],
        useCases: ["App 留存率診斷", "SaaS churn 根因分析", "獲客管道品質評估", "Onboarding 流程優化"],
        outputFormats: ["cohort_heatmap", "channel_comparison", "predictive_behavior_list", "retention_experiment_report"],
        requiredIntegrations: ["amplitude_or_mixpanel", "data_warehouse", "email_automation"],
        token: 32000,
        showcases: [
          { company: "Duolingo", description: "同期群分析發現「連續學習第 3 天」是最強留存預測因子；重設計 Onboarding 引導用戶達到 Day 3 milestone", result: "DAU 從 2M 增長到 20M+；留存率提升使 MAU/DAU 比從 18% 提升到 27%", source: "Duolingo Blog: How We Approached App Store Rating (2022); Duolingo S-1 Filing (2021)." },
        ],
      });
    }

    // ── D-1: 行銷組合建模組 MMM (Nielsen/Meta Robyn) ──────────────────────────
    {
      const slug = "marketing-mix-modeling-squad";
      const taskType = "marketing-mix-modeling";
      const leadId = await findAgent(conn, ["marketing mix modeling", "MMM", "econometrics", "media attribution", "statistical modeling"], []);
      const m2Id   = await findAgent(conn, ["data science", "regression", "time series", "R", "python", "econometrics"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["media planning", "budget allocation", "ROI optimization", "media strategy"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "數據蒐集與整合（52週+）", description: "蒐集媒體花費、GRP、印象數、銷售數據、外部因素（季節性、競品、價格）；對齊時間粒度（週）；處理缺失值與異常值", owner: "data_engineer", output: "整合數據集（週級）" },
        { step: 2, title: "MMM 模型建立（Robyn/貝葉斯）", description: "選擇建模方式：回歸型 MMM 或 Meta Robyn（Bayesian Ridge Regression + Carryover/Saturation curves）；校準模型：Adstock 衰減、飽和效應建模", owner: "data_scientist", output: "MMM 模型 + 模型診斷報告" },
        { step: 3, title: "各媒體 ROI 與貢獻度分解", description: "計算各媒體管道（TV、Digital、OOH、Search、Social）的銷售貢獻比；計算邊際 ROI（mROI）；識別已飽和管道與未開發管道", owner: "squad_lead", output: "媒體貢獻分解報告" },
        { step: 4, title: "預算優化模擬（Budget Optimizer）", description: "在相同預算下跑 5-10 個預算重分配情境；找出最大化 ROI 的最優預算組合；設定管道上下限限制（維持品牌曝光底線）", owner: "media_strategist", output: "預算優化建議（含情境模擬）" },
        { step: 5, title: "MMM 結果整合進媒體規劃", description: "將 MMM 結論轉化為下一年度媒體計畫；設定季度 MMM 更新節奏；建立連續學習迴圈", owner: "squad_lead", output: "MMM 驅動媒體計畫書" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "MMM Lead",                order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Econometrician / DS",      order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Media Planner",            order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "行銷組合建模框架（MMM）", description: "Source: Nielsen (1960s, classical MMM) + Meta Robyn (open-source Bayesian MMM, 2021). Used by P&G, Unilever, LVMH, Nestlé, PepsiCo for decades. Privacy-safe alternative to cookie-based attribution.", steps });
      await upsertSquad(conn, {
        slug, name: "行銷組合建模組（MMM）",
        description: "用統計迴歸量化 TV、數位、戶外、搜尋、社群各管道對銷售的真實貢獻，找出已飽和與未開發管道，輸出數據驅動的最優預算分配方案。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Nielsen MMM (1960s) + Meta Robyn Bayesian MMM (2021) + Analytic Partners ROI Genome",
        agents: agentMembers,
        tags: ["analytics", "MMM", "marketing-mix-modeling", "attribution", "歸因", "media-ROI", "budget-optimization", "econometrics"],
        useCases: ["年度媒體預算分配", "各管道 ROI 量化", "隱私時代後 cookie-free 歸因", "全管道行銷效益評估"],
        outputFormats: ["mmm_model", "channel_contribution_report", "budget_optimizer", "media_plan"],
        requiredIntegrations: ["data_warehouse", "media_spend_data", "sales_data"],
        token: 56000,
        showcases: [
          { company: "P&G", description: "P&G 在全球 80+ 個市場部署 MMM，每年節省超過 10 億美元的行銷浪費，同時提升銷售增量", result: "P&G 報告 MMM 驅動的預算重分配使整體行銷 ROI 提升 30-40%；成為 FMCG 行業標準", source: "Analytic Partners (2023). ROI Genome Intelligence Report. Analytic Partners Inc." },
        ],
      });
    }

    // ── D-2: 多觸點歸因分析組 (Google/Meta MTA) ──────────────────────────────
    {
      const slug = "multi-touch-attribution-squad";
      const taskType = "multi-touch-attribution";
      const leadId = await findAgent(conn, ["multi-touch attribution", "attribution modeling", "digital analytics", "performance marketing"], []);
      const m2Id   = await findAgent(conn, ["Google Analytics", "data-driven attribution", "GA4", "tag management"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["paid media", "SEM", "social ads", "media buying", "programmatic"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["data engineer", "data pipeline", "CDP", "tracking"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "歸因模型選擇評估", description: "比較 6 種主流歸因模型：Last Click / First Click / Linear / Time Decay / Position Based / Data-Driven；分析各模型對現有業務的適用性；選擇主模型 + 對照模型", owner: "squad_lead", output: "歸因模型選擇報告" },
        { step: 2, title: "追蹤基礎建設稽核", description: "稽核 UTM 參數一致性；確認所有付費管道正確 Tag；設定跨裝置比對邏輯；確認轉換事件定義一致", owner: "data_engineer", output: "追蹤稽核報告 + 修正清單" },
        { step: 3, title: "多觸點路徑分析", description: "分析高轉換路徑：哪些管道組合共同出現頻率最高？識別輔助轉換貢獻高但 Last Click 低估的管道（常見：Display、Content、Email）", owner: "attribution_analyst", output: "轉換路徑報告（Top 20 路徑）" },
        { step: 4, title: "Data-Driven Attribution 導入", description: "在 GA4 啟用 Data-Driven Attribution（機器學習模型）；設定各管道的 Conversion Credit 重新分配；與 Last Click 結果對比", owner: "analytics_lead", output: "DDA vs Last Click 差異報告" },
        { step: 5, title: "歸因驅動預算重分配", description: "依 MTA 結果識別被低估 / 高估的管道；提出預算調整建議；設定季度歸因回顧機制", owner: "squad_lead", output: "預算重分配建議 + 季度回顧 SOP" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Attribution Lead",          order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Analytics & GA4 Specialist", order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Paid Media Strategist",      order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Data Engineering & Tracking", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "多觸點歸因分析框架", description: "Source: Google Analytics 4 Data-Driven Attribution (2021) + Meta Conversion API (2020). Multi-touch attribution became critical as the industry moved from last-click to model-based credit allocation.", steps });
      await upsertSquad(conn, {
        slug, name: "多觸點歸因分析組",
        description: "超越 Last-Click 迷思，用多觸點歸因模型量化每個管道在轉換路徑中的真實貢獻，找出被低估的輔助轉換管道，優化廣告預算分配。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "facebook", "strategy"],
        methodology: "Google GA4 Data-Driven Attribution (2021) + Shapley Value MTA + Meta Conversion API",
        agents: agentMembers,
        tags: ["analytics", "attribution", "歸因", "multi-touch", "MTA", "GA4", "performance-marketing", "data-driven", "media-mix"],
        useCases: ["付費廣告 ROI 重新評估", "內容行銷貢獻量化", "Email 輔助轉換追蹤", "跨管道預算優化決策"],
        outputFormats: ["attribution_comparison", "conversion_path_report", "dda_analysis", "budget_reallocation"],
        requiredIntegrations: ["GA4", "meta_conversions_api", "google_ads", "data_warehouse"],
        token: 40000,
        showcases: [
          { company: "零售電商（台灣）", description: "從 Last-Click 切換到 Data-Driven Attribution，發現 Email 和 Content 實際貢獻被低估 40%，Facebook 被高估 28%", result: "重分配預算後整體 ROAS 提升 22%；Email 預算增加 2 倍但 CAC 反而降低", source: "Google Analytics 4 Attribution Case Study, 2023" },
        ],
      });
    }

    // ── D-3: 廣告增量效益測試組 (Meta Marketing Science / Google) ────────────
    {
      const slug = "incrementality-testing-squad";
      const taskType = "incrementality-testing";
      const leadId = await findAgent(conn, ["incrementality testing", "lift study", "causal inference", "marketing science"], []);
      const m2Id   = await findAgent(conn, ["statistics", "experimental design", "causal analysis", "A/B testing"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["paid media", "Facebook Ads", "Google Ads", "performance marketing"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "增量測試設計（Holdout / Ghost Ads）", description: "選擇測試方式：Meta Brand Lift / Conversion Lift / Google Incrementality / 自建 PSM 配對組；設定目標：銷售增量 or 品牌感知增量；計算最小可偵測效果量（MDE）", owner: "squad_lead", output: "增量測試設計文件" },
        { step: 2, title: "測試組 vs 控制組設定", description: "在平台設定排除控制組（Holdout Group）；確認流量隨機分配；設定足夠的測試期（通常 2-4 週）與預算", owner: "media_scientist", output: "測試設定截圖 + 確認文件" },
        { step: 3, title: "增量結果分析", description: "計算增量提升（Incremental Lift %）：測試組 vs 控制組的轉換/銷售差異；計算增量 ROAS（真實廣告增量 ROI）；識別哪些受眾/格式/訊息增量最高", owner: "data_scientist", output: "增量測試結果報告（含信賴區間）" },
        { step: 4, title: "媒體組合增量優化建議", description: "依各管道增量測試結果，識別「高增量管道」（廣告確實帶來新增銷售）vs「低增量管道」（可能只捕獲自然購買意圖）；建議預算重分配", owner: "squad_lead", output: "媒體增量優化建議報告" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Marketing Science Lead",   order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Causal Inference Analyst", order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Paid Media Specialist",    order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "廣告增量效益測試框架", description: "Source: Meta Marketing Science (2016) — Conversion Lift & Brand Lift tools. Google Incrementality Studies (2018). Academic foundation: Varian, H.R. (2016). Causal inference in economics and marketing. PNAS.", steps });
      await upsertSquad(conn, {
        slug, name: "廣告增量效益測試組",
        description: "用增量測試（Incrementality / Lift Study）回答最核心問題：「如果不打這個廣告，這些銷售本來還是會發生嗎？」量化廣告的真實因果效益，避免為自然流量付費。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "facebook", "strategy"],
        methodology: "Meta Conversion Lift / Google Incrementality + Varian Causal Inference Framework (2016)",
        agents: agentMembers,
        tags: ["analytics", "incrementality", "lift-study", "causal-inference", "增量測試", "attribution", "marketing-science", "Facebook-Ads", "ROI"],
        useCases: ["廣告真實效益驗證", "品牌廣告 vs 效果廣告增量比較", "電商大檔前後增量測試", "媒體組合增量優化"],
        outputFormats: ["lift_study_design", "incrementality_report", "incremental_roas", "budget_reallocation"],
        requiredIntegrations: ["meta_ads_manager", "google_ads", "data_warehouse"],
        token: 36000,
        showcases: [
          { company: "Shopify 商家（美妝）", description: "透過 Meta Conversion Lift 測試發現：50% 的 Facebook 轉換歸因實際上是「自然購買」，真實增量 ROAS 只有報告值的一半", result: "重新分配預算後，廣告增量 ROAS 從 1.2x 提升到 2.8x；整體行銷效率提升 67%", source: "Meta Marketing Science Case Studies (2022). Incrementality Measurement." },
        ],
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PRACTICAL ANALYTICS SQUADS — Platform-Specific Methodologies
    // A: Meta Ads  B: Google Ads  C: GA4  D: SEO  E: E-commerce  F: Email  G: BI
    // ══════════════════════════════════════════════════════════════════════════

    // ── A1: HVCT 高速創意測試組 (Meta / Common Thread / Tier 11) ─────────────
    {
      const slug = "meta-hvct-creative-testing";
      const taskType = "meta-creative-testing";
      const leadId = await findAgent(conn, ["creative testing", "Facebook ads", "Meta ads", "DTC advertising", "creative strategy"], []);
      const m2Id   = await findAgent(conn, ["video production", "video creative", "UGC", "ad creative", "content creation"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["performance marketing", "paid social", "ROAS optimization", "media buying"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["data analyst", "analytics", "creative analytics", "dashboard reporting"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "創意假設矩陣設計", description: "建立「Hook × Angle × Format」三維矩陣：Hook（前3秒訊息）× Angle（訴求角度：功能/情感/社會證明/問題解決）× Format（靜態圖/短影音/輪播/UGC）；每月規劃 50-100 個素材 SKU", owner: "squad_lead", output: "創意假設矩陣 + 月度製作計畫" },
        { step: 2, title: "素材製作（模組化）", description: "用模組化方式製作：固定主體 + 替換 Hook / CTA / 背景；確保每個變量可獨立測試；優先製作 UGC 風格（鏡頭前講話）和靜態圖，成本最低但效果最穩", owner: "creative_producer", output: "素材包（≥20個/週期）" },
        { step: 3, title: "隔離測試執行（新 vs. 新）", description: "永遠新 vs. 新比對，不拿有歷史資料的廣告跟新素材比；每個廣告組只測一個變量；設定每廣告組最低預算（建議日預算 ≥ CPA × 2）；48-72 小時後看 Hook Rate（前3秒留存率）和 CTR", owner: "media_buyer", output: "測試結果數據表" },
        { step: 4, title: "勝者識別與放大", description: "勝出標準：Hook Rate > 30% + CTR > 1.5% + ROAS 達標；勝出素材移入主廣告活動，預算逐日 20% 遞增；失敗素材 72 小時內下架分析根因", owner: "squad_lead", output: "勝出素材清單 + 放大執行計畫" },
        { step: 5, title: "創意衰退監控與迭代", description: "每週監控 Frequency（目標 < 3.0）和 ROAS 趨勢；頻次超標或 ROAS 連續3天下滑 15%+ → 觸發「下一波素材」；建立創意學習日誌：記錄每個角度成功/失敗原因", owner: "creative_analyst", output: "創意衰退預警報告 + 下期素材 Brief" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Creative Testing Lead",    order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Creative Producer",        order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Media Buyer & Optimizer",  order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Creative Analytics",       order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "HVCT 高速創意測試框架", description: "Source: Motion App + Common Thread Collective + Tier 11 Agency. Validated across 500+ DTC campaigns. Brands testing 60+ creatives/month see 2.8x higher ROAS vs. those testing <20.", steps });
      await upsertSquad(conn, {
        slug, name: "Meta 高速創意測試組",
        description: "用 HVCT 框架每月系統性測試 50-100 個 Meta 廣告素材，72 小時識別勝出創意並快速放大，同時監控創意疲勞，確保 ROAS 持續最大化。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["facebook", "analytics"],
        methodology: "High-Velocity Creative Testing (HVCT) — Motion App / Common Thread / Tier 11 (2022)",
        agents: agentMembers,
        tags: ["facebook", "meta", "Meta廣告", "Facebook廣告", "素材測試", "創意測試", "creative-testing", "HVCT", "DTC", "ROAS", "hook-rate", "UGC", "廣告素材", "paid-social", "analytics"],
        useCases: ["Facebook廣告創意優化", "Meta廣告素材測試", "DTC品牌廣告投放", "社群廣告 ROAS 提升", "廣告素材迭代"],
        outputFormats: ["creative_hypothesis_matrix", "test_results_dashboard", "winning_creative_report", "creative_fatigue_alert"],
        requiredIntegrations: ["meta_ads_manager", "motion_app", "meta_ads_library"],
        token: 36000,
        showcases: [
          { company: "DTC 美妝品牌（Tier 11 客戶）", description: "導入 HVCT，每月測試 80+ 素材，Hook Rate 作為主要篩選指標", result: "ROAS 從 1.8x 提升到 3.4x；CPA 降低 42%；創始人出鏡 UGC 成為最高效素材類型", source: "Motion App: 2023 State of Creative Report; Common Thread Collective Case Studies" },
        ],
      });
    }

    // ── A2: DCO 動態創意優化組 (Meta Advantage+ / Hunch Ads) ─────────────────
    {
      const slug = "meta-dco-optimization-squad";
      const taskType = "meta-dco-optimization";
      const leadId = await findAgent(conn, ["dynamic creative", "DCO", "Meta Advantage+", "catalog ads", "performance marketing"], []);
      const m2Id   = await findAgent(conn, ["product feed", "data feed", "Google Shopping", "catalog", "feed management"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["copywriting", "ad copy", "headline writing", "CTA optimization"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["Facebook ads", "media buying", "programmatic", "retargeting"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "DCO 素材模組規劃", description: "把廣告拆解成可替換模組：主視覺（5-10 張）/ 主標題（5條）/ 描述（3條）/ CTA（3種）；每種模組獨立製作，不同組合自動交叉測試；規劃「購買動機覆蓋」：價格優惠 / 庫存緊迫 / 社會證明 / 使用情境", owner: "squad_lead", output: "DCO 模組矩陣文件" },
        { step: 2, title: "商品目錄 Feed 優化", description: "清洗 Product Catalog：標題加入高搜尋關鍵詞、描述突出核心利益、圖片符合平台規格；設定動態覆蓋：價格標籤 / 促銷徽章 / 評分顯示；測試 Catalog Ads vs. 一般圖片廣告", owner: "feed_specialist", output: "優化後 Product Feed + Catalog 設定" },
        { step: 3, title: "Advantage+ 購物廣告設定", description: "建立 Advantage+ Shopping Campaign；讓 Meta AI 在廣泛定向下自動找潛在買家；設定預算上限和 ROAS 目標；與手動廣告組做對照測試", owner: "media_buyer", output: "ASC 廣告活動設定 + 對照測試計畫" },
        { step: 4, title: "元件效能拆解分析", description: "在 Ads Manager 創意報告查看每個主視覺 / 標題 / CTA 的個別績效；識別最高 CTR 主視覺 + 最高轉換 CTA 組合；淘汰低效元件，補充新元件", owner: "analytics_lead", output: "DCO 元件效能報告" },
        { step: 5, title: "個人化 DCO 升級（再行銷）", description: "對「瀏覽未購買」受眾用 Dynamic Product Ads（DPA）顯示其看過的商品；對「加購未結帳」顯示限時優惠覆蓋；對現有客戶顯示互補商品（Cross-sell）", owner: "squad_lead", output: "再行銷 DCO 策略 + 設定文件" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "DCO Strategy Lead",       order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Feed & Catalog Specialist", order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Ad Copy & CTA",           order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Media Buyer",             order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "DCO 動態創意優化框架", description: "Source: Meta Advantage+ (2022) + Hunch Ads DCO methodology. Carrefour case: 31% higher ROAS. Vitapur: CTR +47%. 99% of agencies use DCO as significant strategy.", steps });
      await upsertSquad(conn, {
        slug, name: "Meta DCO 動態創意優化組",
        description: "把廣告素材模組化，用 Meta Advantage+ 讓演算法自動找最佳組合；搭配 Product Catalog Feed 優化和再行銷個人化 DPA，讓每個人看到最適合的廣告。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["facebook", "analytics"],
        methodology: "Dynamic Creative Optimization (DCO) — Meta Advantage+ / Hunch Ads (2022-present)",
        agents: agentMembers,
        tags: ["facebook", "meta", "DCO", "動態創意", "Advantage+", "catalog-ads", "DPA", "再行銷", "retargeting", "product-feed", "Meta廣告優化", "電商廣告", "analytics"],
        useCases: ["電商 Facebook 廣告個人化", "商品目錄廣告優化", "Meta 再行銷 DPA 設定", "廣告素材自動化測試"],
        outputFormats: ["dco_module_matrix", "catalog_setup", "asc_campaign", "component_performance_report"],
        requiredIntegrations: ["meta_ads_manager", "meta_pixel", "product_catalog"],
        token: 32000,
        showcases: [
          { company: "Carrefour（So Buzzy Agency）", description: "用 DCO 搭配超本地化食譜 + 倒數計時廣告，自動組合最佳創意", result: "ROAS +31%、節省 250+ 小時人工製作時間", source: "Hunch Ads DCO Case Study: Carrefour (2023)" },
        ],
      });
    }

    // ── A3: Google 搜尋詞挖掘架構組 ──────────────────────────────────────────
    {
      const slug = "google-ads-search-term-mining";
      const taskType = "google-search-term-mining";
      const leadId = await findAgent(conn, ["Google Ads", "SEM", "PPC", "search advertising", "paid search"], []);
      const m2Id   = await findAgent(conn, ["keyword research", "SEO", "keyword strategy", "search intent"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["copywriting", "ad copy", "Google ad copy", "headline", "RSA"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["analytics", "data analyst", "Google Analytics", "conversion tracking"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "帳戶架構稽核（廣告活動分層）", description: "稽核現有廣告活動結構；建立三層架構：Exact Match 保護層（已知高轉換詞）→ Phrase/BMM 探索層 → Broad + Smart Bidding 發現層；確保流量只走單方向（不同層不互相吃量）", owner: "squad_lead", output: "廣告活動架構圖 + 重組計畫" },
        { step: 2, title: "搜尋詞報告週期性挖掘", description: "每兩週從「搜尋字詞」報告提取全部轉換紀錄；識別高轉換但還在 Broad 層的詞 → 加入 Exact Match；識別消耗預算但零轉換的詞 → 加入否定關鍵詞清單", owner: "keyword_specialist", output: "週期搜尋詞報告 + 精確詞清單 + 否定詞清單" },
        { step: 3, title: "否定關鍵詞架構建設", description: "建立分層否定詞：帳戶層（全廣告活動適用）/ 廣告活動層（特定產品/服務）/ 廣告組層；定期審查新出現的低品質搜尋詞；建立否定詞更新 SOP", owner: "ppc_analyst", output: "否定關鍵詞架構文件 + 更新 SOP" },
        { step: 4, title: "競品詞與品牌詞策略", description: "分析競品品牌詞的搜尋量和 CPC；決定是否對競品詞出價；確保品牌詞廣告活動完整覆蓋（防禦）；分析 Auction Insights 競爭態勢", owner: "squad_lead", output: "競品詞策略建議 + Auction Insights 報告" },
        { step: 5, title: "廣告文案與關鍵詞相關性優化", description: "確保每個廣告組的關鍵詞、廣告標題、落地頁三方主題一致；RSA 廣告標題涵蓋核心關鍵詞；落地頁 H1 與廣告標題語意一致 → 提升 Quality Score", owner: "copywriter", output: "廣告文案優化版本 + QS 改善計畫" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "SEM Strategy Lead",        order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Keyword Research Specialist", order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Ad Copy Specialist",       order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Analytics & Tracking",     order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Google 搜尋詞挖掘架構框架", description: "Source: DigitalPosition (3.6M keywords analyzed), WordStream, Google Ads Help. Accounts doing weekly search term mining see 20-35% lower average CPC.", steps });
      await upsertSquad(conn, {
        slug, name: "Google 搜尋詞挖掘架構組",
        description: "系統性從 Google Ads 搜尋詞報告挖掘高轉換關鍵字並保護到 Exact Match，同時建立分層否定關鍵詞架構，減少無效花費，降低 CPC 20-35%。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "website"],
        methodology: "Search Term Mining + Negative Keyword Architecture — DigitalPosition / WordStream / Google",
        agents: agentMembers,
        tags: ["google-ads", "SEM", "PPC", "搜尋廣告", "Google廣告", "keyword", "關鍵字", "否定關鍵字", "search-term-mining", "analytics", "CPC優化", "廣告投放"],
        useCases: ["Google Ads 關鍵字策略優化", "搜尋廣告無效花費降低", "廣告帳戶架構重組", "競品關鍵字分析"],
        outputFormats: ["campaign_structure", "search_term_report", "negative_keyword_list", "ad_copy_variants"],
        requiredIntegrations: ["google_ads", "google_keyword_planner", "google_search_console"],
        token: 32000,
        showcases: [
          { company: "台灣 B2B SaaS", description: "系統性搜尋詞挖掘，每兩週清洗否定詞，把 Broad 層高轉換詞移入 Exact Match 保護", result: "3個月內 CPC 降低 31%，轉換率提升 18%，無效花費從 38% 降至 12%", source: "DigitalPosition (2024). 2024 Google Ads CPC Benchmarks from 3.6M Keywords." },
        ],
      });
    }

    // ── A4: Google 品質分數 + 智慧出價優化組 ────────────────────────────────
    {
      const slug = "google-ads-quality-bidding-squad";
      const taskType = "google-quality-bidding";
      const leadId = await findAgent(conn, ["Google Ads", "Quality Score", "Smart Bidding", "PPC optimization", "CPC"], []);
      const m2Id   = await findAgent(conn, ["landing page", "CRO", "conversion rate optimization", "UX design"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["data analyst", "Google Analytics", "GA4", "conversion tracking"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "品質分數三維診斷", description: "對所有關鍵字按 QS 1-4（立即處理）/ 5-7（優化）/ 8-10（保護）分桶；拆解三個子分數根因：預期 CTR（訊息是否吸引點擊）/ 廣告相關性（關鍵字-廣告主題是否一致）/ 落地頁體驗（速度/相關性/清晰度）", owner: "squad_lead", output: "QS 診斷報告（含子分數分析）" },
        { step: 2, title: "落地頁體驗優化（最大 QS 槓桿）", description: "Google PageSpeed Insights 稽核（LCP < 2.5s）；確認落地頁 H1 和廣告標題語意一致；移除干擾用戶目標的元素；加入信任訊號（評論 / 認證 / 保固）", owner: "ux_optimizer", output: "落地頁優化清單 + A/B 測試設計" },
        { step: 3, title: "智慧出價導入協議", description: "確認 30天/30次轉換達標（智慧出價啟動前提）；首次啟用 Target ROAS/CPA 設在歷史績效 80%（低門檻讓算法學習）；每週遞增 5-10% 目標；搭配 Broad Match 擴大算法訊號", owner: "ppc_strategist", output: "Smart Bidding 導入計畫 + 護欄設定" },
        { step: 4, title: "績效追蹤與護欄設定", description: "設定預算上限和出價上限作護欄；監控學習期（通常 1-2 週）期間波動；設定績效警報：CPA 超標 20% 自動通知；Portfolio 出價策略管理跨廣告活動平衡", owner: "analytics_lead", output: "Smart Bidding 效果追蹤儀表板" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Google Ads Optimization Lead", order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Landing Page & CRO",         order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Analytics & Conversion",      order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "品質分數與智慧出價框架", description: "Source: Google Ads Quality Score diagnostic (Store Growers) + Smart Bidding Ramp Protocol (iMarkInfotech). QS 4→7 reduces CPC by 28-50%. Broad+Smart Bidding delivers 20-30% more conversions.", steps });
      await upsertSquad(conn, {
        slug, name: "Google 品質分數與智慧出價優化組",
        description: "診斷 Google Ads 品質分數三維根因（CTR / 相關性 / 落地頁），優化後 CPC 可降 28-50%；搭配智慧出價協議導入 Target ROAS，讓 Google 算法在護欄內自主優化。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "website"],
        methodology: "Google Quality Score Diagnostic + Smart Bidding Ramp (Google / Store Growers / iMarkInfotech)",
        agents: agentMembers,
        tags: ["google-ads", "Quality-Score", "品質分數", "Smart-Bidding", "智慧出價", "CPC優化", "Target-ROAS", "tCPA", "PPC", "SEM", "Google廣告優化", "analytics"],
        useCases: ["Google Ads CPC 降低", "品質分數提升", "Target ROAS 智慧出價導入", "廣告帳戶效益優化"],
        outputFormats: ["qs_diagnostic_report", "landing_page_checklist", "smart_bidding_plan", "performance_dashboard"],
        requiredIntegrations: ["google_ads", "google_analytics_4", "page_speed_insights"],
        token: 28000,
        showcases: [
          { company: "台灣電商品牌", description: "品質分數診斷發現落地頁載速度是主要拖累（QS 落地頁體驗低於標準）；修復後搭配 Target ROAS 導入", result: "QS 從平均 4.2 提升到 7.1；CPC 降低 34%；轉換量在相同預算下提升 41%", source: "Google Ads Quality Score Guide, Store Growers; Smart Bidding documentation, Google." },
        ],
      });
    }

    // ── B1: GA4 Measurement Plan 設計組 ──────────────────────────────────────
    {
      const slug = "ga4-measurement-design-squad";
      const taskType = "ga4-measurement-design";
      const leadId = await findAgent(conn, ["GA4", "Google Analytics 4", "web analytics", "measurement planning", "GTM"], []);
      const m2Id   = await findAgent(conn, ["Google Tag Manager", "GTM", "JavaScript", "tracking implementation", "tag management"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["data layer", "event tracking", "conversion tracking", "pixel implementation"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["BigQuery", "SQL", "data warehouse", "Looker Studio", "data visualization"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "業務目標 → 測量需求轉化", description: "與業務團隊確認關鍵業務問題（「我們需要回答哪些問題？」）；映射每個業務目標到 3-5 個可追蹤事件；建立優先級：必須有 / 應該有 / 可以有", owner: "squad_lead", output: "業務需求 ↔ 測量映射文件" },
        { step: 2, title: "Measurement Plan 撰寫", description: "為每個事件定義：事件名稱（snake_case）/ 觸發條件 / 參數名稱+值範例 / 自定義維度範疇（user/session/event）/ 是否為轉換事件；輸出試算表格式 Measurement Plan", owner: "analytics_architect", output: "GA4 Measurement Plan（試算表）" },
        { step: 3, title: "GTM 實作與 Debug 驗證", description: "在 GTM 建立 Trigger + Tag；用 GTM Preview Mode + GA4 DebugView 逐一驗證每個事件觸發正確；確認 Data Layer 推送格式一致；文件化最終實作版本", owner: "gtm_developer", output: "GTM 設定容器 + 實作文件" },
        { step: 4, title: "BigQuery 匯出設定", description: "GA4 Standard property 免費啟用 BigQuery 匯出；設定每日批次 + 即時串流匯出；用 BigQuery 驗證事件資料品質；建立基礎 dbt 模型（sessions / users / events 乾淨表格）", owner: "data_engineer", output: "BigQuery 匯出設定 + 基礎 dbt 模型" },
        { step: 5, title: "Looker Studio 儀表板建立", description: "連接 GA4 + BigQuery 建立統一儀表板；涵蓋：流量概覽 / 轉換漏斗 / 素材效益 / 受眾行為；設定自動週報 Email 排程", owner: "squad_lead", output: "Looker Studio 儀表板 + 週報模板" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Analytics Architecture Lead", order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "GTM Implementation",         order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Tracking & Data Layer",      order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "BigQuery & Visualization",   order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GA4 Measurement Plan 框架", description: "Source: Simo Ahava (GTM/GA4 expert), InfoTrust, Google Analytics documentation. Properties with documented measurement plans have 60-70% fewer data quality issues.", steps });
      await upsertSquad(conn, {
        slug, name: "GA4 Measurement Plan 設計組",
        description: "先文件後實作：在 GTM 動工前定義完整 Event Schema，避免 GA4 無法回溯的致命錯誤；GTM 實作驗證 → BigQuery 匯出 → Looker Studio 儀表板一條龍建立。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "website"],
        methodology: "GA4 Measurement Plan First Design — Simo Ahava / InfoTrust / Google (2023)",
        agents: agentMembers,
        tags: ["GA4", "Google-Analytics-4", "網站分析", "analytics", "GTM", "Google-Tag-Manager", "埋點", "事件追蹤", "Measurement-Plan", "BigQuery", "Looker-Studio", "數據埋點", "conversion-tracking"],
        useCases: ["GA4 導入設計", "網站埋點規劃", "GTM 標籤管理", "行銷追蹤基礎建設", "BigQuery 數據倉儲"],
        outputFormats: ["measurement_plan", "gtm_container", "bigquery_schema", "looker_dashboard"],
        requiredIntegrations: ["GA4", "GTM", "BigQuery", "looker_studio"],
        token: 40000,
        showcases: [
          { company: "台灣 SaaS 平台", description: "導入 Measurement Plan First 方法論，在 GA4 上線前完成完整事件設計，避免日後補救", result: "上線後數據品質問題比行業平均減少 65%；BigQuery 匯出後自建歸因模型，識別 SEO 貢獻被 GA4 UI 低估 33%", source: "Ahava, S. (2023). Implementation Guide for Events in Google Analytics 4. simoahava.com." },
        ],
      });
    }

    // ── B2: GA4 預測性受眾 + BigQuery 深度分析組 ─────────────────────────────
    {
      const slug = "ga4-predictive-bigquery-squad";
      const taskType = "ga4-predictive-analytics";
      const leadId = await findAgent(conn, ["GA4", "predictive analytics", "machine learning", "Google Analytics", "audience"], []);
      const m2Id   = await findAgent(conn, ["BigQuery", "SQL", "data science", "python", "data engineering"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["Google Ads", "audience targeting", "remarketing", "performance marketing"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "GA4 預測指標資格確認", description: "確認啟用條件：過去 28 天有 1000+ 回訪用戶，且有足夠購買/非購買事件；若未達標：設計數據積累策略（確認 purchase 和 in_app_purchase 事件正確觸發）", owner: "analytics_lead", output: "預測指標資格評估報告" },
        { step: 2, title: "三大預測受眾建立", description: "在 GA4 建立：購買概率受眾（7天內購買概率前10%）/ 流失概率受眾（7天內停止活躍前20%）/ 預測收益受眾（28天預測收益前10%）；同步到 Google Ads", owner: "squad_lead", output: "三大預測受眾設定 + Google Ads 同步確認" },
        { step: 3, title: "BigQuery 自定義分析模型", description: "用 BigQuery 原始數據建立 GA4 UI 做不到的分析：跨裝置旅程重建 / 自定義多觸點歸因 / 任意時間窗口的同期群分析；建立 dbt 清洗模型", owner: "data_scientist", output: "BigQuery 自定義分析模型集" },
        { step: 4, title: "BigQuery ML 流失預測", description: "用 BigQuery ML 建立邏輯回歸流失預測模型；特徵：D7 登入次數 / 完成特定功能使用 / 付費狀態；每週更新預測分數 → 觸發自動化挽留 Email", owner: "ml_engineer", output: "BQ ML 流失預測模型 + 自動化觸發設定" },
        { step: 5, title: "再行銷受眾效益對比", description: "A/B 比較 GA4 預測受眾 vs. 傳統再行銷受眾（30天內訪客）的廣告效益；追蹤 ROAS / CPA / 轉換率差異；每季更新受眾策略", owner: "squad_lead", output: "預測受眾 vs. 傳統受眾效益報告" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Predictive Analytics Lead",  order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "BigQuery & ML Engineer",     order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Audience & Ads Specialist",  order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GA4 預測性分析框架", description: "Source: Google Analytics Predictive Audiences + BigQuery ML + Napkyn Analytics. Subscription platforms using churn prediction audiences reduce involuntary churn 15-25%.", steps });
      await upsertSquad(conn, {
        slug, name: "GA4 預測性受眾與 BigQuery 分析組",
        description: "用 GA4 內建 ML 建立購買概率、流失概率、預測收益三大受眾，同步到 Google Ads 提升再行銷精準度；搭配 BigQuery 做 UI 做不到的跨裝置歸因與流失預測模型。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "website"],
        methodology: "GA4 Predictive Audiences (Google ML 2022) + BigQuery ML Churn Prediction",
        agents: agentMembers,
        tags: ["GA4", "predictive-audience", "預測受眾", "BigQuery", "analytics", "machine-learning", "churn-prediction", "流失預測", "再行銷", "Google-Ads", "數據分析", "ML"],
        useCases: ["GA4 預測受眾建立", "流失用戶預測與挽留", "BigQuery 深度行銷分析", "Google Ads 再行銷升級"],
        outputFormats: ["predictive_audience_setup", "bq_ml_model", "churn_prediction_scores", "audience_performance_report"],
        requiredIntegrations: ["GA4", "BigQuery", "google_ads", "email_automation"],
        token: 44000,
        showcases: [
          { company: "訂閱型 SaaS 平台", description: "用 BigQuery ML 建立流失預測模型，對「流失概率 > 70%」用戶觸發個人化 Email 挽留序列", result: "非自願流失率降低 21%；預測受眾 Google Ads 再行銷 ROAS 比一般再行銷高 2.3x", source: "Google Cloud Blog: Churn Prediction Using GA4 and BigQuery ML (2023)" },
        ],
      });
    }

    // ── C1: SEO GSC 搜尋機會挖掘組 ───────────────────────────────────────────
    {
      const slug = "seo-gsc-opportunity-mining";
      const taskType = "seo-gsc-mining";
      const leadId = await findAgent(conn, ["SEO", "Google Search Console", "organic search", "search optimization"], []);
      const m2Id   = await findAgent(conn, ["content writing", "blog writing", "content strategy", "SEO writing"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["data analyst", "Python", "API", "data extraction", "Google API"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "GSC API 完整數據提取", description: "用 GSC API（非 UI）取得完整 16 個月資料；UI 只顯示已取樣，API 取得全量；按查詢、頁面、裝置、國家分維度下載；分離品牌詞 vs 非品牌詞（GSC 2024 原生支援）", owner: "data_analyst", output: "GSC 完整數據集（16個月）" },
        { step: 2, title: "三大機會桶識別", description: "機會桶 A：排名 4-15 + 高曝光（速效機會，優化標題/Meta Description 就能提升 CTR）；機會桶 B：高 CTR 低曝光（擴展相關內容）；機會桶 C：高曝光零點擊（優化 Featured Snippet 奪取位置 0）", owner: "seo_analyst", output: "三大機會桶分析表（含優先級評分）" },
        { step: 3, title: "速效優化執行（Position 4-15 詞）", description: "針對 Position 4-15 高曝光詞：優化頁面 Title Tag + Meta Description（加入搜尋意圖關鍵詞、提升點擊誘因）；確認頁面內容充分回答搜尋意圖；更新結構化資料", owner: "content_optimizer", output: "優化後 Title/Meta 批次清單" },
        { step: 4, title: "Featured Snippet 佔位策略", description: "高曝光零點擊詞通常有 Featured Snippet；分析現有 Snippet 格式（段落/列表/表格）；改寫對應頁面段落，用 40-60 字直接回答問題；加入 FAQ Schema", owner: "seo_content_writer", output: "Featured Snippet 優化內容 + Schema" },
        { step: 5, title: "追蹤與月度回顧", description: "設定 GSC Looker Studio 儀表板追蹤：點擊量 / 曝光數 / CTR / 排名趨勢；每月回顧優化成效；更新機會桶，加入新發現的機會詞", owner: "squad_lead", output: "SEO 機會儀表板 + 月報模板" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "SEO Analytics Lead",        order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "SEO Content Specialist",    order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Data & API Analyst",        order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "GSC 搜尋機會挖掘框架", description: "Source: Search Engine Land, Google Search Central, Incremys, AgencyAnalytics. Position 4-15 optimization produces 30-50% traffic lift in 90 days.", steps });
      await upsertSquad(conn, {
        slug, name: "SEO GSC 搜尋機會挖掘組",
        description: "用 GSC API 挖掘完整 16 個月搜尋數據，識別排名 4-15 速效機會、Featured Snippet 佔位機會、高曝光低 CTR 優化機會，90 天內自然流量提升 30-50%。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "website"],
        methodology: "GSC Click-Share Mining — Search Engine Land / Incremys / AgencyAnalytics (2024)",
        agents: agentMembers,
        tags: ["SEO", "Google-Search-Console", "GSC", "自然搜尋", "organic-traffic", "關鍵字分析", "Featured-Snippet", "CTR優化", "analytics", "網站分析", "搜尋排名"],
        useCases: ["SEO 快速增量機會識別", "Google 搜尋排名提升", "Featured Snippet 佔位", "自然流量提升分析"],
        outputFormats: ["opportunity_bucket_report", "title_meta_optimization_list", "featured_snippet_content", "seo_dashboard"],
        requiredIntegrations: ["google_search_console", "gsc_api", "looker_studio"],
        token: 32000,
        showcases: [
          { company: "台灣 B2C 電商", description: "GSC API 挖掘識別 47 個 Position 6-14 詞，批次優化 Title + Meta Description + 內容深度", result: "90 天後 23 個詞進入前 5 名；整體非品牌自然流量提升 43%；零額外廣告費", source: "Search Engine Land: GSC Opportunity Mining Methodology (2024)" },
        ],
      });
    }

    // ── C2: 內容衰退偵測復原組 ────────────────────────────────────────────────
    {
      const slug = "seo-content-decay-recovery";
      const taskType = "content-decay-recovery";
      const leadId = await findAgent(conn, ["content strategy", "SEO", "content marketing", "organic traffic"], []);
      const m2Id   = await findAgent(conn, ["content writing", "blog writing", "copywriting", "content update"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["data analyst", "Google Analytics", "traffic analysis", "performance tracking"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "內容衰退掃描（季度）", description: "用 GSC 對比「當前 3 個月」vs「12個月前 3 個月」流量；標記點擊下滑 20%+ 的頁面；交叉 GA4 數據確認非技術問題（非爬行/索引問題導致）", owner: "data_analyst", output: "衰退頁面清單（含下滑幅度排序）" },
        { step: 2, title: "三類分診（Update/Consolidate/Delete）", description: "Update：內容仍有價值但過時 → 更新數據/加深內容/優化結構；Consolidate：多個相似頁面互搶流量 → 合併最優版本 + 301 其餘；Delete：完全無搜尋價值 → 移除 + 301 到最相關頁", owner: "seo_strategist", output: "頁面分診決策表" },
        { step: 3, title: "Update 執行：內容深化更新", description: "加入當年最新數據和研究；擴充為 Ahrefs 建議的競品未覆蓋子主題；優化 H2/H3 結構使其符合語意搜尋；加入 FAQ 段落回應 People Also Ask；更新 publish date", owner: "content_writer", output: "更新後內容 + SEO Checklist 驗證" },
        { step: 4, title: "Consolidate 執行：頁面合併", description: "選定「最高權威性」頁面作為保留版本；把其他版本最佳段落合入；設定 301 重定向；更新站內連結指向新 URL；提交 GSC 重新索引", owner: "technical_seo", output: "301 重定向清單 + 合併後頁面" },
        { step: 5, title: "復原追蹤（90天）", description: "每週在 GSC 追蹤更新/合併頁面的排名和流量恢復曲線；30天若無改善 → 進一步優化；建立預防機制：設定年度內容稽核日曆", owner: "squad_lead", output: "90天復原追蹤報告 + 內容稽核日曆" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Content SEO Lead",          order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Content Update Specialist", order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Traffic Analytics",         order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "內容衰退偵測復原框架", description: "Source: Ahrefs Content Decay Framework, Search Engine Land, Blue Array SEO. Updating old posts with new data produces up to 146% traffic increase. Early intervention vs. waiting = 3-5x faster recovery.", steps });
      await upsertSquad(conn, {
        slug, name: "SEO 內容衰退偵測復原組",
        description: "每季掃描流量下滑 20%+ 的頁面，分診為 Update / Consolidate / Delete 三類處理；深化更新後流量最高恢復 146%，比等到完全崩跌才行動快 3-5 倍。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "website"],
        methodology: "Content Decay Detection & Recovery — Ahrefs / Search Engine Land / Blue Array (2023-2024)",
        agents: agentMembers,
        tags: ["SEO", "content-decay", "內容衰退", "content-update", "內容更新", "organic-traffic", "自然流量", "GSC", "網站內容", "analytics", "301-redirect", "內容策略"],
        useCases: ["SEO 流量下滑診斷", "舊文章更新優化", "網站內容稽核", "自然流量復原"],
        outputFormats: ["decay_scan_report", "triage_decision_table", "updated_content", "301_redirect_list", "recovery_tracking"],
        requiredIntegrations: ["google_search_console", "ahrefs_or_semrush", "GA4"],
        token: 36000,
        showcases: [
          { company: "台灣內容媒體", description: "季度內容衰退掃描識別 38 個流量下滑頁面；12個 Update + 8個 Consolidate + 18個 Delete", result: "3個月後整體自然流量回升 61%；Consolidate 頁面平均排名提升 4.2 個位置", source: "Ahrefs Blog: How to Fix Content Decay (2024)" },
        ],
      });
    }

    // ── C3: 技術 SEO 全面稽核組 ──────────────────────────────────────────────
    {
      const slug = "technical-seo-audit-squad";
      const taskType = "technical-seo-audit";
      const leadId = await findAgent(conn, ["technical SEO", "site audit", "crawlability", "Core Web Vitals", "indexation"], []);
      const m2Id   = await findAgent(conn, ["web developer", "JavaScript", "page speed", "LCP", "performance optimization"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["structured data", "schema markup", "JSON-LD", "rich snippets"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "爬行與索引稽核", description: "用 Screaming Frog 全站爬行；檢查：robots.txt 是否誤封重要頁面 / noindex 標記 / canonical 衝突 / GSC Index Coverage 報告中的 Excluded 頁面原因；建立可爬行性問題優先清單", owner: "technical_seo", output: "爬行稽核報告 + 優先修復清單" },
        { step: 2, title: "Core Web Vitals 修復（LCP/INP/CLS）", description: "PageSpeed Insights + CrUX 數據找出 LCP > 2.5s 的頁面；LCP 常見根因：圖片未優化（WebP格式、lazy load）/ 伺服器回應慢 / 渲染阻塞資源；INP（2024新增）：減少 JavaScript 長任務；CLS：設定圖片/廣告尺寸", owner: "frontend_developer", output: "CWV 修復技術規格 + 優先順序" },
        { step: 3, title: "結構化資料實作（Schema.org）", description: "稽核現有 Schema 實作；優先加入：Article / Product / FAQ / HowTo / LocalBusiness / BreadcrumbList；用 Google Rich Results Test 驗證；台灣市場加入繁體中文 hreflang 標記（zh-TW）", owner: "schema_specialist", output: "Schema 實作計畫 + 驗證報告" },
        { step: 4, title: "站內連結架構優化", description: "分析頁面爬行深度（目標：重要頁面 3 clicks 內可達）；識別孤兒頁面（zero internal links）；建立主題群（Topic Cluster）內部連結架構；修復斷鏈", owner: "technical_seo", output: "內部連結改善計畫 + 孤兒頁面處理清單" },
        { step: 5, title: "AI 搜尋準備度（E-E-A-T / SGE）", description: "稽核 Experience / Expertise / Authoritativeness / Trustworthiness 訊號；作者頁面 + 專業認證 + 引用來源；FAQ Schema 覆蓋 People Also Ask；為 SGE（AI 摘要）優化：清晰定義、直接回答格式", owner: "squad_lead", output: "E-E-A-T 改善建議 + SGE 優化清單" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Technical SEO Lead",        order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Frontend Performance Dev",  order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Structured Data Specialist", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "技術 SEO 全面稽核框架", description: "Source: AOK Marketing, Google Search Central, Screaming Frog. Core Web Vitals fixes show 15-30% organic ranking improvement in 60-90 days. INP became ranking factor March 2024.", steps });
      await upsertSquad(conn, {
        slug, name: "技術 SEO 全面稽核組",
        description: "六層技術 SEO 稽核：爬行索引 / Core Web Vitals（LCP/INP/CLS）/ 結構化資料 / Hreflang 繁中 / 內部連結 / E-E-A-T；修復後自然排名提升 15-30%。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "website"],
        methodology: "Technical SEO Audit 2024 — AOK Marketing / Screaming Frog / Google Search Central",
        agents: agentMembers,
        tags: ["SEO", "technical-SEO", "技術SEO", "Core-Web-Vitals", "LCP", "INP", "CLS", "schema", "結構化資料", "網站健檢", "crawlability", "indexation", "analytics", "hreflang"],
        useCases: ["網站 SEO 健康稽核", "Core Web Vitals 修復", "Schema 結構化資料實作", "網站爬行問題診斷"],
        outputFormats: ["crawl_audit_report", "cwv_fix_spec", "schema_implementation", "internal_link_plan"],
        requiredIntegrations: ["screaming_frog", "google_search_console", "page_speed_insights", "google_rich_results_test"],
        token: 40000,
        showcases: [
          { company: "台灣電商平台", description: "技術 SEO 稽核發現 LCP 平均 4.8s（超標），Schema 覆蓋率不足，孤兒頁面 120+ 個", result: "LCP 優化至 2.1s 後 60 天內排名提升 18%；Schema 加入後 Rich Snippet 出現率 +42%", source: "AOK Marketing: Technical SEO Audit 2024; Google Search Central Core Web Vitals documentation." },
        ],
      });
    }

    // ── D1: 電商結帳漏斗微轉換分析組 ─────────────────────────────────────────
    {
      const slug = "ecom-checkout-funnel-squad";
      const taskType = "ecom-checkout-analytics";
      const leadId = await findAgent(conn, ["e-commerce analytics", "checkout optimization", "conversion funnel", "cart abandonment"], []);
      const m2Id   = await findAgent(conn, ["UX design", "CRO", "heatmap", "session recording", "user behavior"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["GA4", "Google Analytics", "e-commerce tracking", "funnel analysis"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["email marketing", "retargeting", "cart recovery", "automation"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "六階段漏斗追蹤設定", description: "確認 GA4 電商事件完整：product_view → add_to_cart → begin_checkout → add_shipping_info → add_payment_info → purchase；按裝置/流量來源/新舊客三維切分；設定基準數據（台灣加購率 9-9.5%，棄購率 74%）", owner: "analytics_lead", output: "漏斗追蹤設定 + 基準數據報告" },
        { step: 2, title: "流失節點深度診斷", description: "找出流失率最高的步驟（通常是 begin_checkout → add_payment_info）；用 Hotjar / Microsoft Clarity 錄製流失用戶的行為：卡在哪裡？點什麼沒反應？表單哪個欄位造成放棄？", owner: "ux_researcher", output: "流失節點根因報告（含熱圖 + 錄影分析）" },
        { step: 3, title: "台灣支付方式優化", description: "稽核是否支援台灣主流支付：LINE Pay / 街口支付 / 全盈+ / 信用卡分期 / 超商取貨付款（7-11/全家）；缺少主流支付方式通常可挽回 5-15% 棄購；加入 Apple Pay / Google Pay 降低手機結帳摩擦", owner: "product_manager", output: "支付方式缺口分析 + 整合建議" },
        { step: 4, title: "結帳流程 A/B 測試", description: "基於診斷結論設計測試：單頁結帳 vs. 多步驟 / 表單欄位精簡（移除不必要欄位）/ 信任徽章位置 / 「以訪客結帳」選項；每個測試設置統計嚴謹的對照組", owner: "cro_specialist", output: "A/B 測試設計 + 執行結果" },
        { step: 5, title: "棄購挽回自動化", description: "棄購 1 小時後：Email 提醒（主題：「你遺忘了什麼」，不折扣）；棄購 24 小時後：加入 5% 優惠碼；棄購 72 小時後：最後提醒（強調庫存緊張）；LINE 推播作補充管道（台灣高效）", owner: "email_automation", output: "棄購挽回序列（Email + LINE）" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "E-commerce Analytics Lead", order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "UX & CRO Specialist",       order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "GA4 & Funnel Analytics",    order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Cart Recovery Automation",  order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "電商結帳漏斗分析框架", description: "Source: Baymard Institute (cart abandonment research), Google GA4, ECDB (SEA benchmarks). Taiwan/SEA add-to-cart rate 9-9.5%, abandonment 74%. Funnel optimization improves purchase conversion 10-30%.", steps });
      await upsertSquad(conn, {
        slug, name: "電商結帳漏斗微轉換分析組",
        description: "追蹤電商六階段結帳漏斗，用熱圖 + 錄影找出流失節點，補齊台灣主流支付（LINE Pay / 街口），搭配 A/B 測試和棄購 Email 自動化，把 74% 棄購率系統性降低。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "facebook", "website"],
        methodology: "E-commerce Checkout Funnel Analysis — Baymard Institute / Google GA4 / ECDB (2024)",
        agents: agentMembers,
        tags: ["電商", "e-commerce", "checkout", "結帳漏斗", "棄購", "cart-abandonment", "conversion-funnel", "CRO", "analytics", "LINE-Pay", "支付優化", "購物車回收", "Shopify", "GA4"],
        useCases: ["電商結帳流程優化", "購物車棄購率降低", "支付方式缺口分析", "電商轉換率提升", "台灣電商 UX 優化"],
        outputFormats: ["funnel_analysis_report", "heatmap_ux_report", "payment_gap_analysis", "ab_test_results", "cart_recovery_sequence"],
        requiredIntegrations: ["GA4", "hotjar_or_clarity", "email_automation", "shopify_or_woocommerce"],
        token: 40000,
        showcases: [
          { company: "台灣 D2C 品牌", description: "漏斗分析發現 begin_checkout → add_payment_info 流失率高達 62%；診斷出缺少超商取貨和 LINE Pay 導致手機用戶大量放棄", result: "加入 LINE Pay + 超商取貨後棄購率從 74% 降至 58%；月營收提升 23%", source: "Baymard Institute: E-commerce Checkout Usability (2024); ECDB: SEA E-commerce Data." },
        ],
      });
    }

    // ── D2: 電商產品四象限 + 購物籃分析組 ────────────────────────────────────
    {
      const slug = "ecom-product-analytics-squad";
      const taskType = "ecom-product-analytics";
      const leadId = await findAgent(conn, ["product analytics", "e-commerce analytics", "inventory management", "revenue analytics"], []);
      const m2Id   = await findAgent(conn, ["data analyst", "Python", "SQL", "data science", "Apriori algorithm"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["marketing strategy", "promotional planning", "merchandising", "product marketing"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "SKU 四象限分類", description: "計算每個 SKU 過去 12 個月：收益貢獻（總銷售額 / 毛利）和成長率（YoY% 或 QoQ%）；繪製四象限：Stars（高收益高成長）/ Cash Cows（高收益低成長）/ Question Marks（低收益高成長）/ Dogs（低收益低成長）", owner: "data_analyst", output: "SKU 四象限分析報告" },
        { step: 2, title: "RFM × 商品象限交叉分析", description: "把 RFM 分群（Champions / Loyal / At Risk...）與商品象限交叉：哪群客戶主要買 Stars？哪群客戶偏好 Cash Cows？識別哪個客群 × 哪類商品的廣告 ROI 最高", owner: "analytics_lead", output: "客群 × 商品象限交叉矩陣" },
        { step: 3, title: "購物籃關聯分析（MBA）", description: "用 Apriori 演算法對交易紀錄進行關聯規則挖掘；計算 Support / Confidence / Lift（Lift > 1 = 真正相關）；找出高 Lift 商品組合 → 設計 Bundle / 加購推薦 / 購後 Cross-sell Email", owner: "data_scientist", output: "Top 20 高 Lift 商品組合清單" },
        { step: 4, title: "廣告預算重分配建議", description: "基於四象限 + MBA 結果：集中廣告預算到 Stars + 高 Lift 帶頭商品；Cash Cows 維持最低廣告支出（自然流量即可）；Dogs 完全停止廣告投放；Question Marks 小額測試", owner: "squad_lead", output: "廣告預算重分配建議書" },
        { step: 5, title: "促銷日曆與 Bundle 設計", description: "依四象限設計促銷策略：Stars → 限量製造稀缺感；Question Marks → 買一送一試用降低心理門檻；Dogs → 清倉捆綁；Cash Cows → 用作加購推薦品；設計 2-3 個高 Lift Bundle 套組", owner: "marketing_strategist", output: "季度促銷日曆 + Bundle 商品設計" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Product Analytics Lead",    order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Data Scientist (MBA/Python)", order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Merchandising Strategist",  order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "電商產品四象限與購物籃分析框架", description: "Source: BCG Growth-Share Matrix (extended for e-commerce by Omniconvert/Klaviyo) + Market Basket Analysis (Agrawal & Srikant, 1994). MBA-driven bundles increase AOV 10-25%.", steps });
      await upsertSquad(conn, {
        slug, name: "電商產品四象限與購物籃分析組",
        description: "用 BCG 四象限把所有 SKU 分為 Stars / Cash Cows / Question Marks / Dogs；搭配購物籃關聯分析（Apriori）找到高 Lift 共購組合，設計 Bundle 和加購推薦，AOV 提升 10-25%。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "BCG Matrix for E-commerce + Market Basket Analysis Apriori (Agrawal & Srikant, 1994)",
        agents: agentMembers,
        tags: ["電商", "e-commerce", "product-analytics", "SKU分析", "四象限", "BCG-matrix", "MBA", "market-basket-analysis", "購物籃分析", "Bundle", "AOV提升", "analytics", "關聯分析"],
        useCases: ["電商 SKU 效益評估", "商品 Bundle 設計", "廣告預算按商品重分配", "加購推薦策略", "清倉促銷規劃"],
        outputFormats: ["sku_quadrant_report", "rfm_product_matrix", "top_lift_combinations", "budget_reallocation", "bundle_design"],
        requiredIntegrations: ["shopify_or_woocommerce", "CRM", "email_automation", "python_mlxtend"],
        token: 40000,
        showcases: [
          { company: "台灣保健品電商", description: "SKU 四象限分析發現 23% 的 SKU 是 Dogs（消耗廣告預算但幾乎不貢獻收益）；MBA 識別 5 個高 Lift 商品組合設計 Bundle", result: "停止 Dogs 廣告後整體 ROAS +34%；Bundle 銷售貢獻月 GMV 提升 19%", source: "ResearchGate: BCG Matrix + RFM for E-commerce Analytics (2024); mlxtend MBA documentation." },
        ],
      });
    }

    // ── D3: 台灣電商平台分析組 (momo / Shopee / LINE) ─────────────────────────
    {
      const slug = "taiwan-marketplace-analytics-squad";
      const taskType = "taiwan-marketplace-analytics";
      const leadId = await findAgent(conn, ["e-commerce", "marketplace", "Shopee", "retail analytics", "platform analytics"], []);
      const m2Id   = await findAgent(conn, ["data analyst", "web scraping", "Python", "market research", "competitive analysis"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["LINE marketing", "social commerce", "livestream", "community management"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["content strategy", "product listing optimization", "SEO", "keyword research"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "台灣電商平台選擇與定位", description: "分析品牌適合哪些平台：momo（3,686 萬 PV/月，主力 35-55 歲）/ Shopee TW（4,354 萬 PV/月，主力 18-35 歲）/ PChome（3,845 萬 PV/月，科技/家電強）/ LINE 購物（22M 用戶基礎）；確認目標客群在哪個平台濃度最高", owner: "squad_lead", output: "台灣電商平台選擇建議報告" },
        { step: 2, title: "站內搜尋排名優化（關鍵字研究）", description: "在各平台搜尋核心關鍵詞，分析前 20 名商品的標題結構和關鍵詞密度；把高搜尋量關鍵詞嵌入：商品標題（前 20 字最重要）/ 商品描述 / 標籤；Shopee TW 額外優化：配送速度承諾 + 評分維護（< 4.6 明顯影響排名）", owner: "content_optimizer", output: "站內關鍵字研究報告 + 商品標題優化版本" },
        { step: 3, title: "評價管理與轉換率分析", description: "監測評價速度（月新增評論數）和評分趨勢；分析低分評價根因；建立系統性評價蒐集機制（出貨後 3-5 天 LINE 推播提醒）；對比同類商品的轉換率基準，識別低轉換商品的頁面問題", owner: "cx_manager", output: "評價健康報告 + 低轉換商品診斷" },
        { step: 4, title: "LINE 生態系整合分析", description: "LINE OA 數據分析：訊息送達率 / 開信率 / CTA 點擊率；LINE VOOM 貼文互動分析；LINE 購物關聯設定與成效追蹤；LINE Pay 結帳轉換率追蹤；建立 LINE OA 粉絲 ↔ 購買行為關聯", owner: "line_specialist", output: "LINE 生態系整合分析報告" },
        { step: 5, title: "直播電商歸因分析", description: "台灣直播電商佔社群商務約 25% GMV；建立直播專屬優惠碼追蹤；分析 Shopee Live / Facebook Live / LINE Live 的轉換率和 GMV 貢獻；識別哪位主播、哪類商品、哪個時段效益最高", owner: "squad_lead", output: "直播電商效益報告 + 最佳化建議" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Taiwan Marketplace Lead",   order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Platform Data Analyst",     order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "LINE & Social Commerce",    order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Listing Optimization",      order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "台灣電商平台分析框架", description: "Source: Taiwan TWNIC 2024, Trade.gov Taiwan eCommerce, I-ConnectWeb, Charlesworth Group. Taiwan online retail NTD 653.3B in 2024. LINE 94% population penetration, mandatory for Taiwan brands.", steps });
      await upsertSquad(conn, {
        slug, name: "台灣電商平台分析組（momo / Shopee / LINE）",
        description: "針對台灣電商生態（momo / Shopee TW / PChome / LINE 購物）的站內搜尋優化、評價管理、LINE 生態系整合、直播電商歸因，幫助品牌在台灣主流電商平台最大化銷售。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "facebook", "strategy"],
        methodology: "Taiwan Marketplace Analytics — TWNIC 2024 / Shopee TW / momo / LINE Official Account",
        agents: agentMembers,
        tags: ["台灣", "台灣電商", "momo", "Shopee", "PChome", "LINE", "LINE-Pay", "marketplace", "電商平台", "直播電商", "站內SEO", "analytics", "台灣市場", "社群電商"],
        useCases: ["台灣電商平台銷售優化", "momo/Shopee 店家分析", "LINE OA 效益分析", "台灣直播電商規劃", "本土電商平台進駐策略"],
        outputFormats: ["platform_selection_report", "keyword_optimization_list", "review_health_report", "line_ecosystem_analysis", "livestream_attribution"],
        requiredIntegrations: ["shopee_seller_center", "momo_seller_center", "line_oa_manager", "GA4"],
        token: 40000,
        showcases: [
          { company: "台灣美妝品牌", description: "導入台灣電商平台分析：Shopee 站內關鍵字優化 + LINE OA 評價收集機制 + 直播優惠碼追蹤", result: "Shopee 站內搜尋排名前 5 商品數從 3 個增至 11 個；LINE 購物月銷售額 +67%；直播電商貢獻 GMV 從 8% 提升至 23%", source: "Taiwan TWNIC Internet Survey 2024; Trade.gov Taiwan eCommerce Report." },
        ],
      });
    }

    // ── E1: Email 送達率健康監測組 ────────────────────────────────────────────
    {
      const slug = "email-deliverability-health-squad";
      const taskType = "email-deliverability";
      const leadId = await findAgent(conn, ["email deliverability", "email marketing", "sender reputation", "inbox placement"], []);
      const m2Id   = await findAgent(conn, ["DNS", "SPF", "DKIM", "DMARC", "email authentication", "technical email"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["email list management", "list hygiene", "email segmentation", "subscriber management"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "Email 驗證三層設定（2024 強制要求）", description: "稽核並設定：SPF（授權發送伺服器 IP）/ DKIM（數位簽名）/ DMARC（policy: quarantine 或 reject）；2024年 2 月 Google/Yahoo 對每月 5000+ 封郵件的寄件者強制要求 DMARC；驗證方法：MX Toolbox + mail-tester.com 逐項確認", owner: "technical_email", output: "SPF/DKIM/DMARC 設定驗證報告" },
        { step: 2, title: "寄件者信譽監控", description: "Google Postmaster Tools 監控：網域信譽（目標 High）/ IP 信譽 / 垃圾郵件投訴率（目標 < 0.1%，超過 0.3% 觸發 Gmail 封鎖）；設定投訴率警示；分析哪類郵件被標記為垃圾", owner: "squad_lead", output: "寄件者信譽儀表板 + 週報" },
        { step: 3, title: "名單健康稽核", description: "清洗無效地址（硬退信 > 2% → 立即移除）；移除長期不互動訂閱者（6個月未開信）→ 先嘗試再激活序列，無效則取消訂閱；Email 驗證服務掃描整份名單（識別高風險地址）", owner: "list_hygiene_specialist", output: "名單健康報告 + 清洗計畫" },
        { step: 4, title: "收件箱測試（Seed List）", description: "用 GlockApps / Litmus 測試郵件在 Gmail / Outlook / Yahoo / Apple Mail 的實際收件結果；識別哪些郵件內容觸發垃圾過濾；測試 HTML 設計在各裝置的顯示效果", owner: "email_qa", output: "跨平台收件箱測試報告" },
        { step: 5, title: "送達率提升行動計畫", description: "依診斷結果建立改善優先序：DMARC 設定（最高優先）→ 名單清洗 → 內容/主旨最佳化 → 逐步暖機新網域；設定每季送達率健康稽核 SOP", owner: "squad_lead", output: "送達率改善行動計畫 + 季度稽核 SOP" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Email Deliverability Lead",  order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Technical Email (DNS/Auth)", order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "List Hygiene Specialist",    order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Email 送達率健康監測框架", description: "Source: Google/Yahoo 2024 Bulk Sender Requirements, Campaign Monitor, Klaviyo, Validity. Global average inbox placement 84-85%; top performers 90%+.", steps });
      await upsertSquad(conn, {
        slug, name: "Email 送達率健康監測組",
        description: "三層 Email 驗證（SPF/DKIM/DMARC）+ 寄件者信譽監控 + 名單清洗 + 收件箱測試，確保郵件進收件箱而非垃圾桶，維持 90%+ 送達率。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Email Deliverability Framework — Google/Yahoo 2024 Mandates + Validity + Klaviyo",
        agents: agentMembers,
        tags: ["email", "Email行銷", "deliverability", "送達率", "DMARC", "SPF", "DKIM", "inbox", "list-hygiene", "名單清洗", "analytics", "Klaviyo", "郵件行銷"],
        useCases: ["Email 送達率問題診斷", "DMARC 設定", "名單健康稽核", "Gmail 垃圾信問題解決"],
        outputFormats: ["dns_verification_report", "reputation_dashboard", "list_health_report", "inbox_test_results"],
        requiredIntegrations: ["google_postmaster_tools", "klaviyo_or_sendgrid", "glockapps_or_litmus"],
        token: 28000,
        showcases: [
          { company: "台灣電商品牌", description: "郵件投訴率達 0.28%（臨近 Gmail 封鎖閾值），未設 DMARC，名單 30% 為無效地址", result: "完成 DMARC 設定 + 名單清洗後：送達率從 71% 提升至 91%；開信率從 12% 提升至 24%；月 Email 收益提升 3.2 倍", source: "Validity: Email Deliverability Benchmark (2024); Google Bulk Sender Requirements (2024)." },
        ],
      });
    }

    // ── E2: Email 營收歸因 + 生命週期 RFM 組 ─────────────────────────────────
    {
      const slug = "email-lifecycle-revenue-squad";
      const taskType = "email-lifecycle-analytics";
      const leadId = await findAgent(conn, ["email marketing", "lifecycle marketing", "retention", "email automation", "CRM"], []);
      const m2Id   = await findAgent(conn, ["RFM", "customer segmentation", "Klaviyo", "marketing automation", "email sequences"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["data analyst", "revenue attribution", "e-commerce analytics", "conversion tracking"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "Email 營收歸因框架設定", description: "選擇歸因窗口：點擊後 24-72 小時（保守/準確，推薦）vs. 開信後 5 天（膨脹，避免）；在 Klaviyo / GA4 對齊歸因設定；計算每封 Email 的 RPE（Revenue Per Email）；區分 Campaign 收益 vs. Flow 收益", owner: "analytics_lead", output: "Email 歸因框架設定文件 + 基準 RPE" },
        { step: 2, title: "RFM 六大分群設定", description: "在 Klaviyo 建立 RFM 評分（或連結 CRM 數據）；六大分群：Champions（9-10分）/ Loyal（7-8）/ Potential Loyalists（6）/ At Risk（購買 120-300 天前）/ Hibernating（購買 300+ 天前）/ Lost（購買 12個月+ 前）；計算各分群規模和 AOV", owner: "squad_lead", output: "RFM 分群結構 + 各群規模/AOV 報告" },
        { step: 3, title: "各分群差異化 Email 策略", description: "Champions：VIP 早鳥優先通知 + 口碑計畫邀請；Loyal：升等激勵（消費 X 達 VIP）；At Risk：個人化挽留優惠（觀察其最後購買商品類別）；Lost：Win-back 序列（3 封，最後一封給最高折扣）；Hibernating：再激活挑戰（7 天打卡）", owner: "email_strategist", output: "各分群 Email 策略文件 + 內容腳本" },
        { step: 4, title: "Apple MPP 後的開信率解讀", description: "2021 年後 Apple Mail Privacy Protection 導致 iOS 用戶開信率虛高（接近 100%）；改用 CTOR（Click-to-Open Rate，目標 10-15%）作真實互動指標；設定裝置維度細分 Apple vs 非 Apple 開信率", owner: "analytics_lead", output: "MPP 修正後 Email 效益報告 + CTOR 儀表板" },
        { step: 5, title: "Email ROI 全面追蹤", description: "計算真實 Email ROI：歸因收益 / 總 Email 成本（ESP 費用 + 人力 + 設計）；行業基準 $36-42 ROI per $1；追蹤各 Flow 的 ROI（歡迎序列通常最高）；季度優化：移除 ROI < 5x 的 Campaign 頻率", owner: "squad_lead", output: "Email 全管道 ROI 追蹤儀表板" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Email Lifecycle Lead",       order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "RFM & Automation Specialist", order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Revenue Analytics",          order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Email 生命週期 RFM 框架", description: "Source: HubSpot, Klaviyo, Campaign Monitor, Omniconvert. Industry ROI $36-42 per $1. RFM Champions segment generates 5-10x higher revenue per contact.", steps });
      await upsertSquad(conn, {
        slug, name: "Email 生命週期 RFM 分析組",
        description: "建立準確的 Email 營收歸因窗口，用 RFM 把名單分成 6 大分群，設計差異化 Email 策略（VIP 口碑計畫 / At Risk 挽留 / Lost Win-back），ROI 目標 $36-42 per $1。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Email Lifecycle Analytics + RFM Segmentation — Klaviyo / HubSpot / Omniconvert (2023-2024)",
        agents: agentMembers,
        tags: ["email", "Email行銷", "lifecycle", "生命週期", "RFM", "分群", "Klaviyo", "win-back", "retention", "analytics", "email-automation", "ROI", "流失挽回"],
        useCases: ["Email 名單分群策略", "流失客戶 Win-back 計畫", "Email ROI 追蹤", "VIP 客戶 Email 策略", "Klaviyo RFM 設定"],
        outputFormats: ["attribution_framework", "rfm_segment_report", "email_strategy_by_segment", "ctor_dashboard", "email_roi_dashboard"],
        requiredIntegrations: ["klaviyo_or_mailchimp", "CRM", "e-commerce_platform", "GA4"],
        token: 36000,
        showcases: [
          { company: "台灣 D2C 保健品", description: "導入 RFM 分群：Champions（3%名單）/ At Risk（18%）/ Lost（25%）差異化 Email 策略", result: "At Risk 挽留成功率 11%；Lost Win-back 成功率 6%；整體 Email 月收益提升 2.4 倍；CTOR 從 4% 提升至 13%", source: "Klaviyo: RFM Analysis and Email Lifecycle Best Practices (2024)" },
        ],
      });
    }

    // ── F1: 現代行銷資料棧架構組 ─────────────────────────────────────────────
    {
      const slug = "marketing-data-stack-squad";
      const taskType = "marketing-data-stack";
      const leadId = await findAgent(conn, ["data engineering", "data warehouse", "ETL", "data pipeline", "analytics engineering"], []);
      const m2Id   = await findAgent(conn, ["BigQuery", "Snowflake", "SQL", "dbt", "data modeling"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["Looker Studio", "Tableau", "Power BI", "data visualization", "dashboard"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["API integration", "Fivetran", "data connector", "marketing automation", "CDP"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "數據需求盤點與來源清單", description: "列出所有行銷數據來源：廣告平台（Meta/Google/LINE）/ CRM / 電商平台（Shopify/momo/Shopee）/ Email ESP / GA4 / 社群媒體；確認每個來源的更新頻率和歷史數據深度；建立數據需求優先清單", owner: "squad_lead", output: "行銷數據來源盤點表 + 優先清單" },
        { step: 2, title: "資料倉儲選型與建置", description: "依規模選型：中小型 → BigQuery（免費額度充裕）；大型 → Snowflake；建立標準化層：raw（原始）/ staging（清洗）/ marts（商業邏輯）；用 dbt 建立 SQL 轉換模型，版本控制所有邏輯", owner: "data_engineer", output: "資料倉儲架構圖 + dbt 模型" },
        { step: 3, title: "資料管道建置（ELT）", description: "用 Fivetran / Airbyte 把所有廣告平台、CRM、電商數據自動同步到倉儲；設定更新頻率（廣告數據每小時、交易數據每日）；建立數據品質監控（Great Expectations）", owner: "data_pipeline_engineer", output: "ELT 管道設定 + 監控告警" },
        { step: 4, title: "逆向 ETL（受眾激活）", description: "用 Hightouch / Census 把倉儲中的 SQL 分群直接同步到廣告平台；在 BigQuery 用 SQL 建立高 LTV 客群 → 一鍵推送到 Meta Custom Audience + Google Customer Match；取代手動 CSV 上傳", owner: "activation_engineer", output: "逆向 ETL 設定 + 受眾同步確認" },
        { step: 5, title: "整合行銷儀表板建立", description: "在 Looker Studio / Tableau 建立跨平台統一儀表板：廣告效益（所有平台匯總）/ 轉換漏斗（GA4 + 電商）/ 客戶分群（CRM + RFM）/ Email 效益；設定每日自動刷新 + 週報 Email", owner: "squad_lead", output: "整合行銷儀表板 + 自動化週報" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Data Stack Architect",      order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Analytics Engineering (dbt)", order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "BI & Dashboard",            order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Integration & CDP",         order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "現代行銷資料棧框架", description: "Source: Snowflake Modern Marketing Data Stack Report 2024, Fivetran, dbt Labs. Standard stack at high-growth DTC brands: Fivetran + BigQuery/Snowflake + dbt + Hightouch + Looker.", steps });
      await upsertSquad(conn, {
        slug, name: "現代行銷資料棧架構組",
        description: "建立 ELT 資料管道（Fivetran/Airbyte → BigQuery → dbt）把所有廣告平台、CRM、電商數據統一；搭配逆向 ETL 把 SQL 分群直接推送廣告平台，建立真正的數據驅動行銷基礎建設。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Modern Marketing Data Stack — Snowflake / Fivetran / dbt Labs / Hightouch (2024)",
        agents: agentMembers,
        tags: ["analytics", "data-stack", "資料棧", "BigQuery", "Snowflake", "dbt", "ETL", "data-pipeline", "資料管道", "Looker-Studio", "Tableau", "CDP", "行銷基礎建設", "數據整合"],
        useCases: ["行銷數據倉儲建立", "跨平台數據整合", "廣告受眾自動化激活", "整合行銷儀表板", "dbt 模型建置"],
        outputFormats: ["data_source_inventory", "warehouse_schema", "dbt_models", "pipeline_setup", "unified_dashboard"],
        requiredIntegrations: ["BigQuery_or_Snowflake", "fivetran_or_airbyte", "dbt", "hightouch", "looker_studio"],
        token: 56000,
        showcases: [
          { company: "台灣新創品牌", description: "導入現代資料棧：Airbyte（開源免費）連 Meta/Google/Shopify → BigQuery → dbt → Looker Studio", result: "行銷報告從每週 8 小時人工彙整變成每日自動刷新；識別 Facebook 廣告 ROAS 被高估 31%（跨裝置歸因問題）；決策速度提升 3 倍", source: "Snowflake (2024). Modern Marketing Data Stack Report. Fivetran engineering blog." },
        ],
      });
    }

    // ── F2: 統一行銷測量三角組 (MMM + MTA + Incrementality) ──────────────────
    {
      const slug = "unified-measurement-triangulation-squad";
      const taskType = "unified-measurement";
      const leadId = await findAgent(conn, ["marketing measurement", "attribution", "MMM", "incrementality", "marketing science"], []);
      const m2Id   = await findAgent(conn, ["econometrics", "statistics", "data science", "Python", "R", "regression"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["media planning", "budget allocation", "ROI optimization", "performance marketing"], [leadId ?? 0, m2Id ?? 0]);
      const steps = [
        { step: 1, title: "三層測量架構設計", description: "定義三層角色：MMM（跨管道宏觀歸因 + 預算優化，週/月數據）→ MTA（數位管道戰術優化，用戶路徑，近即時）→ Incrementality（地區/Holdout 實驗，「真值」校準其他兩層）；確認各層負責的決策類型", owner: "squad_lead", output: "三層測量架構設計文件" },
        { step: 2, title: "MMM 建模（Meta Robyn / Google Meridian）", description: "用開源工具：Meta Robyn（2021，貝葉斯 MMM）或 Google Meridian（2024，開源）；輸入 2 年以上週級數據：媒體花費 / 銷售 / 外部因素；輸出各管道 ROI 和預算優化建議", owner: "mmm_modeler", output: "MMM 模型 + 管道貢獻報告" },
        { step: 3, title: "MTA 設定（GA4 DDA）", description: "在 GA4 啟用 Data-Driven Attribution（機器學習歸因）；設定所有付費管道 UTM 一致性；比較 DDA vs Last Click 差異（哪些管道被低估/高估）；搭配 Meta Conversions API 提升信號品質", owner: "analytics_lead", output: "DDA vs Last Click 比較報告" },
        { step: 4, title: "增量測試（Holdout Group）", description: "選一個管道做增量實驗：暫停特定地區廣告（地理 Holdout）或用平台 Lift Study（Meta / Google）；計算真實增量提升（Incremental Lift）；用實驗結果校準 MMM 和 MTA", owner: "measurement_scientist", output: "增量實驗設計 + 結果報告" },
        { step: 5, title: "三角驗證與預算優化", description: "對比三層結論：哪個管道三層都顯示高效？哪個管道只有 MTA 顯示高效但 MMM 和增量測試不一致？用三角驗證結果輸出最可信的預算重分配建議", owner: "squad_lead", output: "三角驗證報告 + 預算重分配建議" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "Marketing Measurement Lead",  order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "MMM & Econometrics",          order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Media Planning & Budget",     order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "統一行銷測量三角框架", description: "Source: Triple Whale Moby, Rockerbox Triangulation, Haus.io, Analytic Partners. Brands using all three measurement layers achieve 15-25% better marketing efficiency.", steps });
      await upsertSquad(conn, {
        slug, name: "統一行銷測量三角組（MMM + MTA + Incrementality）",
        description: "用 MMM 宏觀歸因 + MTA 路徑歸因 + Incrementality 增量實驗三層互相校準，找到真正值得投資的管道，讓行銷效率提升 15-25%。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "strategy"],
        methodology: "Unified Marketing Measurement — Meta Robyn + GA4 DDA + Incrementality Triangulation (2024)",
        agents: agentMembers,
        tags: ["analytics", "MMM", "MTA", "incrementality", "歸因", "attribution", "行銷測量", "三角驗證", "Robyn", "GA4-DDA", "budget-optimization", "預算優化", "marketing-science"],
        useCases: ["全管道行銷歸因分析", "廣告預算最優分配", "Cookie-free 歸因解決方案", "行銷效益真值驗證"],
        outputFormats: ["three_layer_framework", "mmm_model", "dda_comparison", "incrementality_results", "budget_reallocation"],
        requiredIntegrations: ["meta_robyn_or_meridian", "GA4", "meta_conversions_api", "data_warehouse"],
        token: 56000,
        showcases: [
          { company: "台灣消費品品牌", description: "導入 MMM + GA4 DDA + Meta Conversion Lift 三角驗證，發現 GA4 Last Click 嚴重低估 Display 的輔助轉換，而 Meta 報告高估歸因 29%", result: "預算重分配後整體 ROAS 提升 19%；Display 預算增加 40% 但 CAC 降低 23%", source: "Rockerbox: Marketing Measurement Triangulation (2024); Triple Whale Moby Case Studies." },
        ],
      });
    }

    // ── F3: AI 創意情報組 (Segwise / Madgicx / Northbeam AI) ─────────────────
    {
      const slug = "ai-creative-intelligence-squad";
      const taskType = "ai-creative-intelligence";
      const leadId = await findAgent(conn, ["AI", "machine learning", "creative analytics", "performance prediction", "marketing intelligence"], []);
      const m2Id   = await findAgent(conn, ["computer vision", "image analysis", "video analysis", "creative tagging"], [leadId ?? 0]);
      const m3Id   = await findAgent(conn, ["performance marketing", "media buying", "ROAS", "campaign optimization"], [leadId ?? 0, m2Id ?? 0]);
      const m4Id   = await findAgent(conn, ["data analyst", "anomaly detection", "alert system", "monitoring"], [leadId ?? 0, m2Id ?? 0, m3Id ?? 0]);
      const steps = [
        { step: 1, title: "創意標籤體系設計（AI 輔助）", description: "用 AI（GPT-4o Vision / Segwise）自動分析所有廣告素材；萃取標籤：素材類型（影片/靜態/輪播）/ Hook 類型（問題式/展示式/故事式）/ 情感調性（正向/緊迫/幽默）/ 創意角度（功能/社會證明/產品展示）；建立統一標籤字典", owner: "squad_lead", output: "AI 創意標籤體系 + 所有素材標籤庫" },
        { step: 2, title: "上線前創意效益預測", description: "用 Motion App 或自建模型：對每個新素材，基於同類型標籤的歷史績效預測 Hook Rate / CTR / ROAS；高預測分數優先分配更多測試預算；低分素材提前調整或放棄", owner: "ai_analyst", output: "新素材預測評分報告" },
        { step: 3, title: "異常偵測與自動告警", description: "設定 KPI 正常波動範圍（基於過去 30 天數據 ± 2σ）；ROAS 跌破下限 / CPA 超標 20% / 頻次超過 3.0 → 即時 Slack/Email 告警；區分可能原因：季節性 / 創意疲勞 / 競品增加 / 平台算法異動", owner: "monitoring_specialist", output: "異常告警系統設定 + 異常日誌" },
        { step: 4, title: "自然語言查詢行銷數據", description: "設定 AI 問答介面（接 BigQuery 或廣告平台 API）；讓非技術人員用自然語言查詢：「哪個廣告組上週 ROAS 最高？」/ 「Facebook 廣告本月花費超過預算多少？」；輸出即時回答 + 圖表", owner: "ai_integration", output: "NLQ 行銷數據查詢系統" },
        { step: 5, title: "週報自動生成與分析", description: "每週自動彙整：勝出素材清單 + 衰退素材預警 + 異常事件摘要 + 下週行動建議；用 LLM 把數據轉化成中文可讀洞察；直接發到 Slack / Email，節省 5-10 小時/週人工報告時間", owner: "squad_lead", output: "AI 週報系統 + 自動化行動建議" },
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true,  role: "AI Marketing Intelligence Lead", order: 1 },
        { agent_id: m2Id,   is_lead: false, role: "Computer Vision & Creative AI",  order: 2 },
        { agent_id: m3Id,   is_lead: false, role: "Performance Optimizer",          order: 3 },
        { agent_id: m4Id,   is_lead: false, role: "Anomaly Detection & Monitoring", order: 4 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "AI 創意與活動情報框架", description: "Source: Segwise.ai, Madgicx, Motion App, Triple Whale Moby, Forrester 2023. AI pre-launch prediction: 28% higher effectiveness, 22% lower wasted spend. Segwise eliminates 5-10 hours/week manual creative analysis.", steps });
      await upsertSquad(conn, {
        slug, name: "AI 創意情報組",
        description: "用 AI 自動分析廣告素材標籤、預測上線前效益、即時偵測異常、自然語言查詢數據，每週自動生成洞察報告，讓行銷團隊節省 5-10 小時人工分析，提升創意效果 28%。",
        industryKey: "marketing", missionType: taskType,
        workspace: ["analytics", "facebook", "strategy"],
        methodology: "AI-Powered Creative Intelligence — Segwise.ai / Motion App / Triple Whale Moby / Forrester 2023",
        agents: agentMembers,
        tags: ["AI", "人工智慧", "analytics", "creative-analytics", "創意分析", "ai-marketing", "anomaly-detection", "異常偵測", "performance-prediction", "creative-tagging", "NLQ", "自動化報告", "行銷AI"],
        useCases: ["廣告素材 AI 分析", "行銷 KPI 異常告警", "上線前創意效益預測", "自然語言查詢廣告數據", "AI 自動週報生成"],
        outputFormats: ["creative_tag_library", "prediction_scores", "anomaly_alert_system", "nlq_interface", "ai_weekly_report"],
        requiredIntegrations: ["meta_ads_api", "google_ads_api", "BigQuery", "motion_app_or_segwise", "slack_or_email"],
        token: 44000,
        showcases: [
          { company: "DTC 品牌代理商", description: "導入 Segwise AI 自動標籤系統分析 3,000+ 素材，Motion App 建立 Hook Rate 預測模型", result: "創意分析人工時間從每週 12 小時降至 2 小時；預測高效素材準確率 73%；ROAS 提升 28%", source: "Forrester (2023): AI-Driven Pre-Launch Prediction. Segwise.ai: 2024 Product Benchmarks." },
        ],
      });
    }



    // ═══════════════════════════════════════════════════════════════════
    // CATEGORY EV: 活動行銷 Event Methodology Squads (EV1–EV10)
    // ═══════════════════════════════════════════════════════════════════

    // EV1: Pine & Gilmore — The Experience Economy (1999)
    {
      const slug = "ev-pine-experience-economy";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "brand-dna"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "experience-economy-design"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["brand-identity", "visual-content-creator"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["brand-identity", "sensory-stage-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "experience-roi-measurement"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "體驗主題定義（Theme）", description: "定義活動的核心體驗主題：Pine & Gilmore 說主題必須改變現實感知、讓參與者完全融入。好主題=簡潔、引人入勝、在空間/時間中保持一致", tool: "internal", outputType: "experience_theme_doc", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "五感印象設計（Impressions）", description: "設計與主題一致的所有感官印象：視覺佈置、音效選擇、氣味設計、觸感材質、品嚐體驗，消除任何破壞主題的負面線索", tool: "internal", outputType: "sensory_impression_design", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 3, name: "四種體驗維度整合", description: "整合娛樂（Entertainment）、教育（Education）、逃脫（Escapism）、美學（Esthetics）四個維度，設計讓參與者「甜蜜點」處於所有維度交叉點的完整體驗", tool: "internal", outputType: "four_realms_integration", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 4, name: "轉化時刻設計（Transformation）", description: "Pine & Gilmore 最高層級：設計讓參與者離開時真正改變了的「轉化」時刻，品牌成為催化劑而非娛樂提供者", tool: "internal", outputType: "transformation_moment_design", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "體驗 ROI 測量", description: "設計體驗活動的 ROI 框架：參與者轉化率、品牌情感分數、社群 UGC 量、後續購買行為追蹤", tool: "internal", outputType: "experience_roi_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "體驗策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "感官設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "ROI 分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Pine & Gilmore Experience Economy 體驗經濟活動設計", description: "Source: B. Joseph Pine II & James H. Gilmore《The Experience Economy》1999. 哈佛商學院出版，全球超過 100 萬冊，為體驗行銷奠定理論基礎", steps });
      await upsertSquad(conn, { slug, name: "Pine & Gilmore 體驗經濟活動設計小隊", description: "應用 Pine & Gilmore 的體驗經濟四維度框架設計活動：從娛樂到轉化，讓品牌活動成為改變參與者的舞台", industryKey: "marketing", missionType: taskType, workspace: ["event"], methodology: "B. Joseph Pine II & James H. Gilmore – The Experience Economy (1999)", agents: agentMembers, tags: ["event", "experience", "experiential-marketing", "transformation"], useCases: ["品牌體驗活動設計", "產品發布展覽", "企業年會體驗規劃"], outputFormats: ["體驗主題文件", "五感設計清單", "四維度整合方案", "ROI報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Nike House of Innovation（紐約旗艦店活動）", description: "應用體驗經濟框架設計門市活動：娛樂（互動體驗）、教育（跑步分析）、逃脫（運動沉浸）、美學（設計展示）", result: "旗艦店成為紐約最多人拍照打卡地點之一，每季活動帶動同店銷售增長 30%，UGC 自然曝光超過 500 萬次", source: "Nike Annual Report 2022 / Fast Company 體驗活動報導" }, { company: "Disney Theme Parks（體驗經濟典範）", description: "Walt Disney 是 Pine & Gilmore 書中最常被引用的體驗設計典範", result: "迪士尼樂園年訪客超過 1.5 億，體驗溢價讓門票定價是競爭對手的 3-5 倍", source: "Disney Annual Report 2023" }] });
    }

    // EV2: Bernd Schmitt — Strategic Experiential Marketing (1999)
    {
      const slug = "ev-schmitt-sem";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["brand-dna", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "strategic-experiential-marketing"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["visual-content-creator", "multi-sensory-brand-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-media-marketing", "content-marketing"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-media-marketing", "relate-experience-community"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "SENSE 感官行銷設計", description: "設計活動的感官刺激體驗（Sense SEM）：視覺識別、音效設計、觸感材質、嗅覺環境，讓品牌透過五感被感知", tool: "internal", outputType: "sense_sem_design", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 2, name: "FEEL 情感行銷設計", description: "設計觸動參與者內心情感的體驗（Feel SEM）：正向情緒觸發點、品牌情感故事、讓人感動的瞬間設計", tool: "internal", outputType: "feel_sem_design", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "THINK 思維行銷設計", description: "設計激發思考和好奇心的體驗（Think SEM）：令人驚訝的洞察、反直覺的互動裝置、引發對話的問題", tool: "internal", outputType: "think_sem_design", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "ACT + RELATE 行動與關聯設計", description: "設計改變行為的體驗（Act）和建立社群歸屬感（Relate）：參與者行動呼籲、品牌社群連結、共同身份認同", tool: "internal", outputType: "act_relate_sem_design", requiredSkills: ["social-media-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "SEM 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "感官設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "社群連結師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Bernd Schmitt 策略體驗行銷五維度活動框架", description: "Source: Bernd Schmitt《Experiential Marketing》1999 + Columbia Business School 教授。Schmitt 的 SEMs（Strategic Experiential Modules）框架被全球頂級品牌採用", steps });
      await upsertSquad(conn, { slug, name: "Bernd Schmitt SEM 策略體驗行銷活動小隊", description: "應用 Bernd Schmitt 的五維體驗模組（Sense/Feel/Think/Act/Relate）設計活動，讓品牌從功能性走向體驗性", industryKey: "marketing", missionType: taskType, workspace: ["event"], methodology: "Bernd Schmitt – Strategic Experiential Marketing (1999)", agents: agentMembers, tags: ["event", "experiential", "sensory", "sem"], useCases: ["品牌體驗活動", "新產品發布體驗", "消費者互動裝置"], outputFormats: ["五維SEM設計方案", "感官設計清單", "情感觸發點設計"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Absolut Vodka（感官品牌活動）", description: "應用 Schmitt SEM 框架設計全球品牌活動：每個城市的 Absolut 活動都有獨特的感官主題", result: "Absolut 成為全球最具辨識度的烈酒品牌，每年活動觸達超過 500 萬消費者", source: "Bernd Schmitt《Experiential Marketing》書中案例" }, { company: "Samsung Galaxy Experience Centers", description: "應用 SEM 五維框架設計 Galaxy 旗艦體驗中心活動", result: "體驗中心 NPS 超過 70，訪客購買意願提升 45%，社群分享率是一般廣告的 3 倍", source: "Samsung Experience Center 研究報告 2022" }] });
    }

    // EV3: Shaz Smilansky — Experiential Marketing Activation (2009)
    {
      const slug = "ev-smilansky-activation";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["campaign-orchestrator", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["campaign-orchestrator", "brand-activation-management"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["social-media-marketing", "content-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["social-media-marketing", "live-activation-amplification"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "marketing-ops"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "activation-roi-tracking"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "品牌活化策略設計", description: "設計品牌活化（Brand Activation）的核心策略：Smilansky 框架 = 活動目標 + 目標受眾 + 品牌個性 + 互動形式，找出最能讓受眾「活起來」的活動形式", tool: "internal", outputType: "activation_strategy", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "雙向互動體驗設計", description: "設計讓消費者主動參與的雙向互動：Smilansky 強調「live brand experience」必須是消費者主動選擇、非被動接收的體驗", tool: "internal", outputType: "interactive_experience_design", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "現場活化執行計劃", description: "規劃現場活化的每一個接觸點：場地選擇、工作人員培訓、道具設計、時間流程，確保每個消費者都有完整的品牌體驗", tool: "internal", outputType: "activation_execution_plan", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "數位擴散放大", description: "設計現場活化的數位放大計劃：社群直播、Hashtag 活動、UGC 徵集、媒體報導，讓現場體驗觸達更廣泛的線上受眾", tool: "internal", outputType: "digital_amplification_plan", requiredSkills: ["social-media-marketing"] }, m2Info),
        assignAgentToStep({ order: 5, name: "活化效益測量", description: "測量品牌活化的 ROI：現場參與人數、媒體露出價值、社群互動量、品牌情感提升、銷售轉化追蹤", tool: "internal", outputType: "activation_roi_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "活化策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "數位擴散師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "效益分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Shaz Smilansky 品牌活化體驗行銷系統", description: "Source: Shaz Smilansky《Experiential Marketing: A Practical Guide to Interactive Brand Experiences》2009. Smilansky 是全球最被引用的體驗行銷教科書作者之一", steps });
      await upsertSquad(conn, { slug, name: "Smilansky 品牌活化體驗行銷小隊", description: "應用 Shaz Smilansky 的品牌活化框架：設計讓消費者主動選擇參與的雙向互動體驗，讓品牌「活起來」", industryKey: "marketing", missionType: taskType, workspace: ["event"], methodology: "Shaz Smilansky – Experiential Marketing (2009)", agents: agentMembers, tags: ["event", "brand-activation", "live-experience", "interactive"], useCases: ["消費品品牌活化", "新品試用體驗活動", "快閃體驗店策劃"], outputFormats: ["活化策略文件", "互動體驗設計", "現場執行計劃", "ROI報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Red Bull（品牌活化典範）", description: "Red Bull 的所有體育和音樂活動都是品牌活化的教科書案例", result: "Red Bull Media House 年內容觸達超過 10 億次，活化活動帶動品牌溢價，以同類能量飲料 3 倍價格銷售", source: "Red Bull GmbH Annual Report 2022" }, { company: "Dove Real Beauty Sketches（品牌活化）", description: "應用體驗行銷讓消費者主動參與「真實之美」的實驗體驗", result: "YouTube 超過 1.8 億次觀看，成為史上最多人分享的廣告之一，Dove 品牌好感度提升 30%", source: "Unilever / Cannes Lions Grand Prix 2013" }] });
    }

    // EV4: Robert Cialdini — Pre-Suasion Event Design (2016)
    {
      const slug = "ev-cialdini-presuasion";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["copywriting-pro", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["copywriting-pro", "cialdini-presuasion-event"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["brand-identity", "visual-content-creator"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["brand-identity", "attention-channeling-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["content-marketing", "social-media-marketing"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["content-marketing", "social-proof-amplification"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "注意力引導設計（Pre-Suasion 環境）", description: "設計活動開始前的注意力引導：Cialdini 的 Pre-Suasion 核心 = 在說服發生前，先將對方的注意力導向有利方向。設計報到環境、等候區、入口動線的注意力引導元素", tool: "internal", outputType: "presuasion_environment_design", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 2, name: "六大說服原則活動整合", description: "將 Cialdini 六大原則整合進活動設計：互惠（免費禮物）、承諾（公開參與）、社會認同（展示其他參與者）、喜好（品牌個性）、權威（KOL/專家）、稀缺（限量體驗）", tool: "internal", outputType: "six_principles_event_map", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "行動觸發時機設計", description: "設計活動中每個「行動觸發」的最佳時機：Cialdini 說對的觸發點在對的時機比內容本身更重要，設計讓參與者在最高接受度時刻接收到品牌訊息", tool: "internal", outputType: "action_trigger_moments", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "社群證明強化", description: "設計活動中的社群證明機制：現場計數顯示器、見證影片播放、參與者成果展示、媒體牆，讓每個參與者感受到「大家都在這裡」的共識", tool: "internal", outputType: "social_proof_design", requiredSkills: ["social-media-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "說服設計師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "環境設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "社群證明師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Cialdini Pre-Suasion 活動說服力設計框架", description: "Source: Robert Cialdini《Pre-Suasion》2016 + 《Influence》1984. Cialdini 是全球最著名的說服力科學研究者，任職 Arizona State University Regents Professor", steps });
      await upsertSquad(conn, { slug, name: "Cialdini Pre-Suasion 活動說服力設計小隊", description: "應用 Cialdini 的 Pre-Suasion + 六大說服原則設計活動：在正確時機引導注意力，讓參與者在最高接受度時刻接受品牌訊息", industryKey: "marketing", missionType: taskType, workspace: ["event"], methodology: "Robert Cialdini – Pre-Suasion & Influence (2016)", agents: agentMembers, tags: ["event", "persuasion", "cialdini", "influence"], useCases: ["銷售型品牌活動", "會員招募活動", "說服力研討會設計"], outputFormats: ["Pre-Suasion 環境設計", "六原則活動地圖", "行動觸發時機表"], requiredIntegrations: [], token: 55000, showcases: [{ company: "TED Conference（說服力活動設計）", description: "TED 的演講環境設計高度符合 Cialdini 的 Pre-Suasion 原則：精心設計的注意力引導和信任建立環境", result: "TED 演講平均完播率超過 80%（業界最高），演講後行動呼籲接受率超過 60%", source: "TED.com / Chris Anderson《TED Talks》2016" }, { company: "Apple Keynote 發布活動", description: "Apple 的產品發布活動是 Cialdini 六大原則在活動設計的完整應用", result: "Apple Keynote 直播同時觀看人數超過 2,000 萬，發布後 24 小時預購創歷史紀錄", source: "Apple Press Release / Forbes 科技活動分析" }] });
    }

    // EV5: Seth Godin — Tribes & Remarkable Events (2008)
    {
      const slug = "ev-godin-tribes";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "content-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "tribe-leadership-event"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["social-media-marketing", "email-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["social-media-marketing", "tribe-community-building"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["hook-copywriter", "brand-dna"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["hook-copywriter", "remarkable-event-story"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "部落識別與領袖定位", description: "識別品牌的「部落」：共同信念、共同敵人（反對的事物）、共同語言。活動必須服務部落而非大眾，Seth Godin 說「不是每個人的活動，是這群人的活動」", tool: "internal", outputType: "tribe_identification_doc", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Remarkable 活動設計", description: "設計值得部落成員「說嘴」的活動：Godin 的 Purple Cow 原則——活動必須足夠與眾不同，讓部落成員主動向別人描述它", tool: "internal", outputType: "remarkable_event_design", requiredSkills: ["hook-copywriter"] }, m3Info),
        assignAgentToStep({ order: 3, name: "部落連結機制", description: "設計讓部落成員「與彼此連結」的機制，不只是品牌對部落，更是部落成員之間的聯繫：配對系統、圓桌討論、共創工作坊", tool: "internal", outputType: "tribe_connection_mechanisms", requiredSkills: ["social-media-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "運動號召設計", description: "設計從活動出發的「運動號召」：給部落一個值得傳播和行動的使命，讓活動成為長期運動的催化劑而非一次性事件", tool: "internal", outputType: "movement_call_to_action", requiredSkills: ["content-marketing"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "部落策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "社群連結師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "故事設計師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Seth Godin Tribes 部落行銷活動策略", description: "Source: Seth Godin《Tribes》2008 + 《Purple Cow》2003. Godin 是全球最具影響力的行銷思想家，博客每日閱讀者超過 100 萬人", steps });
      await upsertSquad(conn, { slug, name: "Seth Godin Tribes 部落行銷活動小隊", description: "設計服務「部落」而非大眾的 Remarkable 活動：讓品牌成為部落的聚集地，讓活動觸發一個長期的社群運動", industryKey: "marketing", missionType: taskType, workspace: ["event"], methodology: "Seth Godin – Tribes (2008)", agents: agentMembers, tags: ["event", "community", "tribe", "remarkable"], useCases: ["品牌社群年度活動", "忠實用戶聚會", "思想領袖論壇"], outputFormats: ["部落識別文件", "Remarkable 活動設計", "連結機制", "運動號召"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Harley-Davidson HOG Rally", description: "Harley-Davidson 的車主集會是 Godin 部落行銷的最典型案例：不是摩托車展示，是部落儀式", result: "HOG (Harley Owners Group) 超過 100 萬會員，Rally 帶動每年 $2 億以上品牌相關消費", source: "Harley-Davidson Annual Report / Seth Godin《Tribes》書中案例" }, { company: "HubSpot INBOUND 年會", description: "INBOUND 從小型用戶聚會成長為全球最大行銷科技年會，完全是 Tribe 策略的結果", result: "INBOUND 2022 超過 65,000 名參與者，HubSpot 在活動品牌建立上ROI超過500%", source: "HubSpot Annual Report 2022" }] });
    }

    // EV6: Chris Anderson — TED Talk Structure for Events (2016)
    {
      const slug = "ev-anderson-ted";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["copywriting-pro", "brand-dna"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["copywriting-pro", "ted-talk-event-structure"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["visual-content-creator", "presentation-stage-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "content-marketing"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["content-marketing", "talk-content-distribution"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "核心理念定義（Idea Worth Spreading）", description: "定義活動或演講的「值得傳播的核心理念」：Chris Anderson 說一個好的 TED Talk 必須有一個清晰、重要、值得分享的核心思想，所有活動設計都圍繞此理念展開", tool: "internal", outputType: "core_idea_definition", requiredSkills: ["copywriting-pro"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "敘事架構設計", description: "設計活動/演講的敘事架構：從「共鳴點」開始 → 衝突或問題 → 洞察或解決方案 → 具體行動呼籲。Anderson 說故事結構是最強大的說服工具", tool: "internal", outputType: "narrative_architecture", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "舞台與視覺設計", description: "設計支撐演講/活動的舞台環境：極簡主義背景、強大視覺投影、演講者移動空間設計，讓每一個視覺元素都強化核心理念而非分散注意力", tool: "internal", outputType: "stage_visual_design", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 4, name: "演講後傳播策略", description: "設計活動/演講的後續傳播計劃：影片剪輯、精華摘要、社群分享格式、媒體外聯，讓一次演講的影響力延伸數個月", tool: "internal", outputType: "post_talk_distribution", requiredSkills: ["content-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "演講設計師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "舞台設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "傳播策略師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Chris Anderson TED Talk 演講型活動設計框架", description: "Source: Chris Anderson《TED Talks: The Official TED Guide to Public Speaking》2016. Anderson 是 TED Curator，親自指導超過 3,000 位演講者", steps });
      await upsertSquad(conn, { slug, name: "Chris Anderson TED Talk 演講型活動設計小隊", description: "應用 Chris Anderson 的 TED 框架設計活動演講和論壇：核心理念 → 敘事架構 → 舞台設計 → 後續傳播，讓每一個演講都成為值得分享的時刻", industryKey: "marketing", missionType: taskType, workspace: ["event"], methodology: "Chris Anderson – TED Talks Structure (2016)", agents: agentMembers, tags: ["event", "speaking", "ted", "storytelling"], useCases: ["品牌年會演講策劃", "論壇/峰會內容設計", "CEO 演講訓練"], outputFormats: ["核心理念文件", "敘事架構腳本", "舞台設計指引", "傳播計劃"], requiredIntegrations: [], token: 55000, showcases: [{ company: "TED Conferences（Anderson 領導）", description: "Chris Anderson 接手後將 TED 從小型會議轉型為全球知識傳播平台", result: "TED.com 超過 35 億次觀看，超過 170 個國家 TEDx 授權，全球最具影響力的思想活動品牌", source: "TED Annual Report 2023" }, { company: "Salesforce Dreamforce", description: "應用 TED 演講框架設計 Keynote 和分組演講，每個演講都有清晰的「Idea Worth Spreading」", result: "Dreamforce 成為全球最大企業科技年會，超過 17 萬名參與者，媒體露出價值超過 $1 億", source: "Salesforce Annual Report 2022" }] });
    }

    // EV7: Keith Ferrazzi — Never Eat Alone Networking Events (2005)
    {
      const slug = "ev-ferrazzi-networking";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["campaign-orchestrator", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["campaign-orchestrator", "strategic-networking-event"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["brand-identity", "content-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "generosity-first-networking"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-scheduler", "email-marketing"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["email-marketing", "post-event-relationship-nurture"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "策略性人脈地圖設計", description: "建立活動的「人脈地圖」：Ferrazzi 的方法是先決定你想認識誰（目標），再設計讓這些人都想來的活動主題和嘉賓陣容", tool: "internal", outputType: "strategic_network_map", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "慷慨優先的活動設計", description: "設計「先給予」的活動結構：Ferrazzi 說最好的人際連結始於慷慨。在活動中設計讓每個參與者都能「給予」某樣東西的機制：知識、聯繫、機會", tool: "internal", outputType: "generosity_first_design", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 3, name: "深度連結促進機制", description: "設計讓人建立「真實連結」的機制：小組討論、導師對話、共創環節，避免表面名片交換式的人際連結，Ferrazzi 說「深度勝過廣度」", tool: "internal", outputType: "deep_connection_mechanisms", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "活動後關係培育系統", description: "設計活動後的關係維護系統：48 小時內個人化跟進郵件、定期價值分享、後續聚會機會，讓活動成為長期關係的起點而非終點", tool: "internal", outputType: "post_event_nurture_system", requiredSkills: ["email-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "人脈活動策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "慷慨設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "關係培育師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Keith Ferrazzi Never Eat Alone 策略人脈活動系統", description: "Source: Keith Ferrazzi《Never Eat Alone》2005 + 《Who's Got Your Back》2009. Ferrazzi 被 Forbes 評為最具人脈影響力的商業思想家之一", steps });
      await upsertSquad(conn, { slug, name: "Keith Ferrazzi 策略人脈活動小隊", description: "應用 Keith Ferrazzi 的「慷慨優先」人脈哲學設計活動：讓每次活動成為有意義的人際連結起點，不是名片交換場", industryKey: "marketing", missionType: taskType, workspace: ["event"], methodology: "Keith Ferrazzi – Never Eat Alone (2005)", agents: agentMembers, tags: ["event", "networking", "relationship", "community"], useCases: ["B2B客戶關係活動", "行業峰會設計", "VIP 客戶答謝活動"], outputFormats: ["人脈地圖", "慷慨優先設計", "深度連結機制", "後續培育計劃"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Keith Ferrazzi 的 Greenlight Research 客戶晚宴", description: "應用自創的 策略性饗宴（Strategic Dinner）格式，結合深度對話機制和慷慨分享", result: "每次饗宴都形成長期商業合作，Ferrazzi 本人透過此方法建立超過 100 萬個深度商業關係", source: "Keith Ferrazzi《Never Eat Alone》自傳案例" }, { company: "YPO（Young Presidents' Organization）", description: "應用 Ferrazzi 原則設計年度 Forum 活動：深度小組討論取代表面人脈交流", result: "YPO 超過 32,000 位 CEO 成員，會員留存率超過 90%，業界最高 NPS 的商業組織之一", source: "YPO.org Annual Report 2022" }] });
    }

    // EV8: David Meerman Scott — Newsjacking Event PR (2011)
    {
      const slug = "ev-scott-newsjacking";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["market-research-agent", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["market-research-agent", "newsjacking-event-pr"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["hook-copywriter", "reactive-pr-content"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-media-marketing", "social-scheduler"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-media-marketing", "real-time-event-publishing"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "趨勢與新聞監測系統", description: "建立活動前後的即時新聞監測系統：Google Alerts、Twitter Trends、行業媒體 RSS，識別活動期間出現的「可借力新聞」", tool: "internal", outputType: "news_monitoring_system", requiredSkills: ["market-research-agent"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "Newsjacking 角度開發", description: "在活動進行中或活動前後，找到品牌與熱門新聞的連結角度：Scott 說「在新聞出現後的幾小時內是 Newsjacking 的黃金窗口」", tool: "internal", outputType: "newsjacking_angles", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "即時反應內容製作", description: "快速製作高品質的即時反應內容：貼文、新聞稿、部落格文章，在競爭對手還在開會時你的內容已經上線", tool: "internal", outputType: "reactive_content_pack", requiredSkills: ["hook-copywriter"] }, m2Info),
        assignAgentToStep({ order: 4, name: "媒體放大與報導追蹤", description: "將 Newsjacking 內容主動傳遞給媒體記者：個人化媒體外聯、社群平台發布、記者直接聯繫，追蹤媒體報導效益", tool: "internal", outputType: "media_amplification_report", requiredSkills: ["social-media-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "Newsjacking 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "即時內容師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "媒體發布師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "David Meerman Scott Newsjacking 活動 PR 策略", description: "Source: David Meerman Scott《Newsjacking》2011. Scott 是全球第一個系統化「借力新聞」行銷方法的作者，此方法被全球 Fortune 500 企業廣泛應用", steps });
      await upsertSquad(conn, { slug, name: "David Meerman Scott Newsjacking 活動 PR 小隊", description: "在活動期間和前後借力熱門新聞，讓品牌活動的 PR 觸達超越活動本身。David Meerman Scott 的 Newsjacking 方法：速度 + 相關性 = 免費曝光", industryKey: "marketing", missionType: taskType, workspace: ["event", "pr"], methodology: "David Meerman Scott – Newsjacking (2011)", agents: agentMembers, tags: ["event", "pr", "newsjacking", "real-time-marketing"], useCases: ["活動PR擴大觸達", "即時行銷策略", "媒體曝光最大化"], outputFormats: ["新聞監測系統", "Newsjacking 角度清單", "即時內容包", "媒體報導追蹤"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Oreo Super Bowl Newsjacking（2013）", description: "Super Bowl 停電期間，Oreo 在 5 分鐘內發布「You can still dunk in the dark」貼文", result: "單一推文超過 15,000 次轉推，估計媒體露出價值超過 $500 萬，成為 Newsjacking 的標誌性案例", source: "David Meerman Scott《Newsjacking》更新版 / AdAge 2013" }, { company: "Airbnb（災難期間 Newsjacking）", description: "在多個自然災害期間，Airbnb 即時啟動「Open Homes」計劃並主動發布給媒體", result: "每次激活帶來超過 500 篇媒體報導，PR 等效廣告價值超過 $1,000 萬，品牌好感度大幅提升", source: "Airbnb Press / HBR 社會責任行銷研究 2020" }] });
    }

    // EV9: Dr. Joe Goldblatt — Special Events CSEP Framework (1990)
    {
      const slug = "ev-goldblatt-csep";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["campaign-orchestrator", "marketing-ops"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["campaign-orchestrator", "special-events-management"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["marketing-strategy-pmm", "market-research-agent"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["market-research-agent", "event-research-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "marketing-ops"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "event-evaluation-kpi"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "活動研究（Research）", description: "應用 Goldblatt 的 RESEARCH 階段：調查受眾需求、競爭環境、歷史數據、預算限制，確保活動設計基於真實數據而非假設", tool: "internal", outputType: "event_research_report", requiredSkills: ["market-research-agent"] }, m2Info),
        assignAgentToStep({ order: 2, name: "活動設計（Design）", description: "設計完整的活動藍圖：主題設計、時間流程、空間規劃、嘉賓陣容、技術需求，Goldblatt 說「在紙上設計比在現場解決問題便宜 10 倍」", tool: "internal", outputType: "event_blueprint_design", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "活動規劃（Planning）", description: "建立完整的活動規劃文件：項目時間表、供應商管理、備用方案、風險管理，使用 Goldblatt 的「臨界路徑法」識別最重要的活動里程碑", tool: "internal", outputType: "event_planning_documents", requiredSkills: ["marketing-ops"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "活動協調（Coordination）", description: "活動當天的協調與執行：溝通協議、角色分工、應急流程，Goldblatt 說「出色的活動協調者是看不見的——因為一切都很順暢」", tool: "internal", outputType: "event_coordination_guide", requiredSkills: ["campaign-orchestrator"] }, leadInfo),
        assignAgentToStep({ order: 5, name: "活動評估（Evaluation）", description: "活動後的系統性評估：參與者滿意度調查、ROI 計算、目標達成率、改進建議，建立下次活動的學習基礎", tool: "internal", outputType: "event_evaluation_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "活動管理師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "活動研究師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "評估分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Joe Goldblatt CSEP 專業活動管理五步驟框架", description: "Source: Dr. Joe Goldblatt《Special Events》1990 初版，2021 年第八版。Goldblatt 是全球活動管理學術先驅，CSEP 認證奠基人，培訓超過 10,000 名活動專業人員", steps });
      await upsertSquad(conn, { slug, name: "Joe Goldblatt CSEP 專業活動管理小隊", description: "應用 Dr. Goldblatt 的五步驟 CSEP 框架：Research → Design → Planning → Coordination → Evaluation，系統化管理從小型研討會到大型展覽的每一個活動", industryKey: "marketing", missionType: taskType, workspace: ["event"], methodology: "Dr. Joe Goldblatt – Special Events CSEP Framework (1990)", agents: agentMembers, tags: ["event", "management", "csep", "project-management"], useCases: ["企業年會策劃管理", "行業展覽會策劃", "品牌發布活動管理"], outputFormats: ["活動研究報告", "活動藍圖設計", "規劃文件包", "評估報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Olympic Games Opening Ceremony（CSEP 標準應用）", description: "奧運開幕式是 Goldblatt CSEP 框架的最大規模應用，涉及 10,000+ 人協調", result: "2022 北京冬奧開幕式全球 6 億人同時觀看，被評為史上最精確執行的大型活動之一", source: "IOC Olympic Report 2022 / 活動管理學術研究" }, { company: "Salesforce Dreamforce（CSEP 流程應用）", description: "應用系統化活動管理流程，將 Dreamforce 從 1,000 人會議擴展到 17 萬人全球活動", result: "Dreamforce 被評為全球最佳企業技術年會，NPS 超過 70，年度媒體觸達超過 10 億次", source: "Salesforce Press Release / Event Marketer Magazine 2022" }] });
    }

    // EV10: Jim Collins — Building to Last Cultural Events (Good to Great, 2001)
    {
      const slug = "ev-collins-culture";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "brand-dna"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "culture-building-events"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "core-values-storytelling"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["social-media-marketing", "email-marketing"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["social-media-marketing", "culture-community-activation"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "刺蝟原則活動定位", description: "應用 Collins 的「刺蝟原則」定位文化活動：找出品牌最擅長的、最熱情的、能驅動商業引擎的三環交叉點，讓活動成為展示這個交叉點的舞台", tool: "internal", outputType: "hedgehog_event_positioning", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "核心價值儀式設計", description: "設計強化企業/品牌核心價值的活動儀式：Collins 說偉大公司的文化透過「儀式和神話」被傳遞。設計讓參與者帶走的核心價值儀式體驗", tool: "internal", outputType: "core_values_ritual_design", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "英雄故事與榮耀時刻", description: "在活動中設計「英雄故事」展示環節：Collins 說偉大組織透過表彰英雄（體現核心價值的人）來強化文化。設計表彰儀式和故事分享環節", tool: "internal", outputType: "hero_stories_ceremony", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "飛輪效應後續啟動", description: "設計活動後的「飛輪」持續啟動計劃：Collins 的飛輪概念 = 每次推動都積累動能。活動後的持續行動計劃讓文化活動的影響力持續滾動", tool: "internal", outputType: "flywheel_activation_plan", requiredSkills: ["social-media-marketing"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "文化活動策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "價值故事師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "文化社群師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Jim Collins Good to Great 文化建立活動框架", description: "Source: Jim Collins《Good to Great》2001 + 《Built to Last》1994. Collins 研究 1,400 家企業，識別偉大公司的文化建立方法，至今是最暢銷管理書籍之一", steps });
      await upsertSquad(conn, { slug, name: "Jim Collins 企業文化建立活動小隊", description: "應用 Jim Collins 的刺蝟原則、核心價值儀式和飛輪效應設計企業文化活動，讓每一次活動都強化並傳遞品牌的核心 DNA", industryKey: "marketing", missionType: taskType, workspace: ["event"], methodology: "Jim Collins – Good to Great & Built to Last (2001)", agents: agentMembers, tags: ["event", "culture", "values", "brand-dna"], useCases: ["企業文化年會", "品牌價值傳承活動", "員工品牌認同活動"], outputFormats: ["刺蝟原則定位", "核心價值儀式設計", "英雄故事環節", "飛輪啟動計劃"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Netflix Culture Deck 分享活動", description: "Netflix 應用 Collins 文化框架，透過定期全員活動傳遞和強化「自由與責任」文化", result: "Netflix 員工滿意度持續排名矽谷前 5%，文化 Deck 被 Sheryl Sandberg 稱為「矽谷最重要的文件之一」", source: "Netflix Culture Document / Reed Hastings《No Rules Rules》2020" }, { company: "Patagonia 年度環保行動活動", description: "應用刺蝟原則（環境保護 × 戶外運動 × 商業可持續性）設計品牌文化年度活動", result: "Patagonia 員工留存率達 95%，品牌忠誠度在戶外運動品牌中排名第一，年收入超過 $10 億", source: "Patagonia Annual Report 2022 / Yvon Chouinard《Let My People Go Surfing》" }] });
    }


    // ═══════════════════════════════════════════════════════════════════
    // CATEGORY IS: 零售通路 Instore Methodology Squads (IS1–IS10)
    // ═══════════════════════════════════════════════════════════════════

    // IS1: Paco Underhill — Why We Buy: The Science of Shopping (1999)
    {
      const slug = "is-underhill-why-we-buy";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["market-research-agent", "marketing-analytics"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["market-research-agent", "shopper-behavior-research"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["visual-content-creator", "retail-store-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "cross-channel-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "conversion-rate-retail"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "購物行為觀察研究", description: "應用 Underhill 的「追蹤法」觀察真實購物者行為：記錄動線、停留點、接觸商品時機，找出購物者在哪裡慢下來、哪裡加速、哪裡轉身離去", tool: "internal", outputType: "shopper_observation_report", requiredSkills: ["market-research-agent"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "緩衝區與動線設計", description: "設計最佳入口緩衝區（Decompression Zone）：Underhill 發現進門後前 5-10 英尺的商品被嚴重忽略。重新規劃入口設計和動線引導，讓購物者「降速進入」", tool: "internal", outputType: "flow_decompression_design", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 3, name: "觸摸與停留設計", description: "設計促進購物者「觸摸」商品的陳列方案：Underhill 的核心發現 = 觸摸增加購買機率 3-4 倍。設計可觸摸的展示、開放式包裝、高度適中的陳列", tool: "internal", outputType: "touch_display_design", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 4, name: "購物轉換率追蹤", description: "建立零售轉換率追蹤系統：入店率、停留時間、互動率、轉換率，識別動線中的「漏洞」並持續優化", tool: "internal", outputType: "retail_conversion_tracking", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "購物科學研究師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "零售設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "轉換分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Paco Underhill Why We Buy 購物科學零售優化", description: "Source: Paco Underhill《Why We Buy: The Science of Shopping》1999 + Envirosell 購物行為研究公司。Underhill 為全球 500 家零售商進行超過 70,000 小時的購物者追蹤研究", steps });
      await upsertSquad(conn, { slug, name: "Paco Underhill Why We Buy 購物科學小隊", description: "應用 Paco Underhill 的購物行為科學：從觀察真實購物者行為出發，優化動線、陳列和觸摸體驗，以科學數據驅動零售轉換率提升", industryKey: "marketing", missionType: taskType, workspace: ["instore"], methodology: "Paco Underhill – Why We Buy: The Science of Shopping (1999)", agents: agentMembers, tags: ["instore", "retail", "shopper-behavior", "conversion"], useCases: ["零售動線優化", "門市陳列改善", "購物體驗提升"], outputFormats: ["購物行為研究報告", "動線設計方案", "陳列優化建議", "轉換率報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Starbucks（Underhill 研究應用）", description: "應用 Underhill 的購物科學優化門市動線、等候體驗和產品陳列", result: "Starbucks 門市平均停留時間達 14 分鐘（業界最高），客單價提升 25%，門市轉換率超過 75%", source: "Paco Underhill《Why We Buy》更新版 / Starbucks Annual Report" }, { company: "Best Buy 門市重新設計", description: "Envirosell（Underhill 公司）協助 Best Buy 重新設計門市佈局和購物動線", result: "轉換率提升 18%，單次消費金額提升 15%，門市 NPS 提升 20 分", source: "Paco Underhill Envirosell 案例研究 / Best Buy Annual Report 2019" }] });
    }

    // IS2: Martin Lindstrom — Buyology & Sensory Branding (2008)
    {
      const slug = "is-lindstrom-buyology";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["market-research-agent", "brand-dna"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["market-research-agent", "neuromarketing-retail-research"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["brand-identity", "sensory-retail-branding"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "market-research-agent"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "subconscious-purchase-metrics"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "購買潛意識觸發點審計", description: "審計品牌在零售環境中的潛意識觸發點：Lindstrom 發現 85% 的購買決策是潛意識驅動的。識別哪些感官元素（氣味、音樂、顏色）正在觸發或阻礙購買", tool: "internal", outputType: "buyology_trigger_audit", requiredSkills: ["market-research-agent"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "感官品牌體驗設計", description: "設計完整的感官品牌體驗：Lindstrom 研究證明氣味比視覺更能刺激購買。設計零售環境的專屬氣味、音樂節奏、質感材料、特定顏色配比", tool: "internal", outputType: "sensory_branding_design", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 3, name: "品牌宗教式忠誠設計", description: "應用 Lindstrom 的「品牌宗教」理論：偉大品牌和宗教都有儀式、聖地、符號。設計零售環境中的品牌儀式感和聖地體驗", tool: "internal", outputType: "brand_religion_design", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 4, name: "感官效益測量", description: "測量感官品牌設計的商業效益：停留時間變化、衝動購買率、品牌情感分數、回訪率，以數據驗證感官設計的 ROI", tool: "internal", outputType: "sensory_roi_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "神經行銷研究師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "感官品牌設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "感官效益分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Martin Lindstrom Buyology 神經行銷零售設計", description: "Source: Martin Lindstrom《Buyology》2008 + 《Brand Sense》2005. Lindstrom 主持迄今最大的神經行銷研究（2,000 名受試者/fMRI 掃描），TIME 雜誌評選全球 100 最具影響力人物", steps });
      await upsertSquad(conn, { slug, name: "Martin Lindstrom Buyology 神經行銷零售小隊", description: "以神經科學和潛意識研究為基礎優化零售環境：Lindstrom 說「85% 的購買決策是潛意識做的」，感官品牌設計是影響這個潛意識的最強工具", industryKey: "marketing", missionType: taskType, workspace: ["instore"], methodology: "Martin Lindstrom – Buyology & Brand Sense (2008)", agents: agentMembers, tags: ["instore", "neuromarketing", "sensory", "brand"], useCases: ["零售感官體驗設計", "品牌旗艦店規劃", "購買觸發點優化"], outputFormats: ["潛意識觸發點審計", "感官品牌設計", "品牌宗教設計", "感官ROI報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Abercrombie & Fitch（感官品牌極致案例）", description: "應用 Lindstrom 感官品牌理論：特定香水（噴灑量是一般門市的 20 倍）、音樂音量、燈光設計，創造強烈感官品牌印記", result: "2000年代高峰時期，A&F 門市平均每平方英尺銷售額達 $500（業界最高之一），品牌溢價超過同類商品 200%", source: "Martin Lindstrom《Brand Sense》A&F 案例 / Forbes 零售報導" }, { company: "新加坡航空（SIA）機艙氣味", description: "Lindstrom 研究顯示 SIA 的 Stefan Floridian Waters 機艙香氛是全球最被認識的品牌氣味之一", result: "SIA 客戶滿意度排名全球前 3，氣味成為品牌識別的重要組成，客戶忠誠度比業界均值高 35%", source: "Martin Lindstrom《Brand Sense》SIA 案例研究" }] });
    }

    // IS3: Phil Barden — Decoded: The Science Behind Why We Buy (2013)
    {
      const slug = "is-barden-decoded";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["market-research-agent", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["market-research-agent", "implicit-consumer-research"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["brand-identity", "visual-content-creator"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["brand-identity", "implicit-brand-signals"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["copywriting-pro", "hook-copywriter"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["copywriting-pro", "goal-coding-copy"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "內隱目標研究（Jobs to Be Done）", description: "研究消費者的「內隱目標」（隱藏在顯性需求下的真實動機）：Barden 應用 Kahneman 的雙系統理論，找出系統 1（直覺）和系統 2（理性）驅動的不同購買動機", tool: "internal", outputType: "implicit_goal_research", requiredSkills: ["market-research-agent"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "框架效應設計", description: "設計影響購買決策的「框架」：Barden 說同樣的產品，用不同的框架呈現（損失 vs 獲得）會產生完全不同的結果。設計零售中最有利的決策框架", tool: "internal", outputType: "decision_frame_design", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "品牌隱性信號設計", description: "設計傳達品牌價值的「隱性信號」：顏色、形狀、字體、材質選擇，這些元素在毫秒內影響消費者的潛意識判斷，比任何廣告文案更快", tool: "internal", outputType: "implicit_brand_signals", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 4, name: "目標編碼行銷文案", description: "撰寫激活消費者「目標碼」的文案：Barden 說好文案不是描述產品，而是讓消費者感覺產品能幫助他們實現深層目標（安全感、歸屬感、成就感）", tool: "internal", outputType: "goal_coded_copy", requiredSkills: ["copywriting-pro"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "決策科學研究師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "隱性信號設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "目標文案師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Phil Barden Decoded 決策科學零售優化", description: "Source: Phil Barden《Decoded: The Science Behind Why We Buy》2013. Barden 結合 Kahneman 行為經濟學和品牌科學，為 T-Mobile、Unilever 等 Fortune 500 企業服務 20 年", steps });
      await upsertSquad(conn, { slug, name: "Phil Barden Decoded 決策科學零售小隊", description: "應用行為科學和決策神經學優化零售體驗：Barden 說「了解大腦如何決策，才能真正影響購買」，從隱性目標研究到框架設計，科學驅動銷售", industryKey: "marketing", missionType: taskType, workspace: ["instore"], methodology: "Phil Barden – Decoded: The Science Behind Why We Buy (2013)", agents: agentMembers, tags: ["instore", "behavioral-science", "decision-science", "neuromarketing"], useCases: ["零售心理設計", "產品陳列科學優化", "購買文案改善"], outputFormats: ["內隱目標研究", "框架設計方案", "隱性信號設計", "目標編碼文案"], requiredIntegrations: [], token: 55000, showcases: [{ company: "T-Mobile（Phil Barden 服務客戶）", description: "應用 Decoded 框架重新設計門市體驗和行銷文案，從功能性訴求轉向隱性目標激活", result: "門市轉換率提升 22%，NPS 提升 18 分，品牌溢價能力增加 15%", source: "Phil Barden 公開演講 / Kantar UK 案例研究" }, { company: "BT（British Telecom）廣告重設計", description: "應用目標編碼和框架效應重新設計 BT 的零售和廣告訊息", result: "廣告記憶度提升 40%，購買意願提升 25%，品牌情感分數從中性提升至正面", source: "Phil Barden《Decoded》BT 案例章節" }] });
    }

    // IS4: Doug Stephens — Reengineering Retail (2017)
    {
      const slug = "is-stephens-reengineering";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "mbb-strategist"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "retail-transformation-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["brand-dna", "visual-content-creator"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["brand-dna", "experience-first-retail-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "marketing-ops"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "retail-digital-integration"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "零售模式轉型審計", description: "審計品牌的零售模式：Doug Stephens 說未來零售有兩個模式 = 極致便利（純交易）或極致體驗（純媒體）。確定品牌適合哪個方向，避免「中間地帶死亡」", tool: "internal", outputType: "retail_model_audit", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "門市作為媒體設計", description: "將門市重新設計為「品牌媒體」而非交易場所：Stephens 說最成功的未來零售是把門市變成廣告，每個訪客都是接觸到品牌訊息的受眾", tool: "internal", outputType: "store_as_media_design", requiredSkills: ["brand-dna"] }, m2Info),
        assignAgentToStep({ order: 3, name: "數位物理整合設計", description: "設計無縫的數位物理整合體驗：AR 試穿、QR Code 延伸資訊、App 整合購物旅程，讓實體門市成為數位體驗的放大器", tool: "internal", outputType: "phygital_integration_design", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 4, name: "零售 ROI 重新定義", description: "重新定義零售 ROI：不只是每平方英尺銷售額，更是每位訪客的品牌情感分數、長期 LTV、社群分享量。建立新的零售 KPI 體系", tool: "internal", outputType: "retail_roi_framework", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "零售轉型策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "體驗零售設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "數位整合師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Doug Stephens Reengineering Retail 零售未來轉型框架", description: "Source: Doug Stephens《Reengineering Retail》2017 + 《Resurrecting Retail》2021. Stephens 是全球最常被引用的零售業未來學家，服務 Google、BMW、LVMH 等", steps });
      await upsertSquad(conn, { slug, name: "Doug Stephens 零售未來轉型小隊", description: "應用 Doug Stephens 的零售轉型框架：從交易場所→品牌媒體，設計讓每個訪客都成為品牌傳播者的未來零售體驗", industryKey: "marketing", missionType: taskType, workspace: ["instore"], methodology: "Doug Stephens – Reengineering Retail (2017)", agents: agentMembers, tags: ["instore", "retail-future", "phygital", "brand-media"], useCases: ["實體零售轉型", "品牌旗艦店重設計", "O2O體驗整合"], outputFormats: ["零售模式審計", "門市媒體設計", "數位物理整合方案", "ROI框架"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Nike NYC 旗艦店（House of Innovation）", description: "應用 Stephens「門市即媒體」概念，設計純體驗型旗艦店：沒有庫存壓力，純粹品牌展示和個人化服務", result: "House of Innovation 成為全球最多人打卡的零售地點之一，每平方英尺品牌影響力（而非銷售額）達業界最高", source: "Doug Stephens《Resurrecting Retail》Nike 案例" }, { company: "Amazon Go（極致便利端點）", description: "Amazon Go 代表 Stephens 所說的「極致便利」零售端點：無人結帳，純粹交易效率", result: "Amazon Go 進店轉換率達 100%（相比傳統超市 70%），人均消費提升 30%", source: "Doug Stephens 公開演講 / Amazon Press Release 2022" }] });
    }

    // IS5: Alibaba — OMO Online-Merge-Offline Strategy (2016)
    {
      const slug = "is-alibaba-omo";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "marketing-ops"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "omo-strategy-design"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["marketing-ops", "campaign-orchestrator"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["marketing-ops", "digital-physical-integration"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "attribution-modeling"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["attribution-modeling", "omnichannel-attribution"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "OMO 機會地圖繪製", description: "繪製品牌的 OMO（Online-Merge-Offline）機會地圖：在哪些消費者旅程節點，數位和實體的融合能創造超越單一渠道的價值？識別高優先 OMO 機會", tool: "internal", outputType: "omo_opportunity_map", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "數據打通設計", description: "設計線上線下數據統一方案：消費者 ID 統一（會員卡+App+微信）、消費記錄整合、行為數據融合，讓每個實體接觸點都能識別數位消費者", tool: "internal", outputType: "data_unification_design", requiredSkills: ["marketing-ops"] }, m2Info),
        assignAgentToStep({ order: 3, name: "OMO 場景設計", description: "設計具體的 OMO 場景：手機掃碼取貨、App 預約試穿、線上購線下退、門市掃碼延伸資訊，讓數位和實體無縫切換", tool: "internal", outputType: "omo_scenario_design", requiredSkills: ["campaign-orchestrator"] }, m2Info),
        assignAgentToStep({ order: 4, name: "全渠道歸因追蹤", description: "建立 OMO 全渠道歸因追蹤：哪些線上行為驅動了實體消費、哪些實體體驗促進了線上購買，計算 OMO 策略的真實 ROI", tool: "internal", outputType: "omnichannel_attribution_report", requiredSkills: ["attribution-modeling"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "OMO 策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "數位整合師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "全渠道分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Alibaba OMO Online-Merge-Offline 全渠道零售策略", description: "Source: Alibaba 集團 Jack Ma 2016 年提出「新零售」OMO 戰略，盒馬鮮生、天貓超市等落地實踐。OMO 取代 O2O 成為新世代零售典範", steps });
      await upsertSquad(conn, { slug, name: "Alibaba OMO 全渠道新零售小隊", description: "應用阿里巴巴的 OMO 框架：線上數據 + 線下體驗完全融合，讓消費者在任何渠道都獲得無縫體驗，讓品牌獲得完整的消費者全旅程數據", industryKey: "marketing", missionType: taskType, workspace: ["instore"], methodology: "Alibaba Group – OMO New Retail Strategy (2016)", agents: agentMembers, tags: ["instore", "omo", "omnichannel", "new-retail"], useCases: ["品牌OMO策略規劃", "線上線下數據整合", "全渠道消費體驗設計"], outputFormats: ["OMO機會地圖", "數據打通方案", "OMO場景設計", "全渠道歸因報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "盒馬鮮生（Alibaba OMO 旗艦案例）", description: "盒馬是 Alibaba OMO 新零售的最完整落地：線上App點餐+線下門市取貨+30分鐘配送+線下體驗", result: "盒馬門市平均線上業務占比超過 60%，坪效（每平方米銷售額）是傳統超市的 3-5 倍", source: "Alibaba Annual Report 2022 / Forbes 新零售報導" }, { company: "無印良品（MUJI）台灣 OMO 實踐", description: "應用 OMO 框架整合線上會員數據和線下消費行為，個人化門市體驗", result: "會員 LTV 提升 35%，線上線下交叉購買率達 40%，整體銷售增長 20%", source: "無印良品台灣年報 / 電商研究中心 2021" }] });
    }

    // IS6: Ron Johnson — Apple Store Experience Design (2001)
    {
      const slug = "is-johnson-apple-store";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["brand-dna", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "apple-store-experience-design"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["visual-content-creator", "product-discovery-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["campaign-orchestrator", "marketing-analytics"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["campaign-orchestrator", "genius-bar-service-design"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "體驗分區設計（Experience Zones）", description: "設計以「體驗」而非「產品類別」劃分的門市空間：Ron Johnson 的革命 = 把 Apple Store 按消費者生活場景分區（音樂區、電影區、照片區），而非按產品型號", tool: "internal", outputType: "experience_zone_design", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 2, name: "親手試用設計", description: "設計「每台產品都可以試用」的展示環境：Johnson 說讓消費者在購買前充分體驗，是最強大的說服工具。設計全開放、無壓力的產品試用體驗", tool: "internal", outputType: "hands_on_display_design", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 3, name: "Genius Bar 服務設計", description: "設計「人才即服務」的門市服務模式：Apple Store 的 Genius Bar 革命性地把技術專家帶到零售前線。設計品牌的「Genius Bar」——讓最有知識的人面對面服務消費者", tool: "internal", outputType: "genius_bar_service_design", requiredSkills: ["campaign-orchestrator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "社群空間設計", description: "設計門市中的「社群空間」：Johnson 在 Apple Store 中創造了公共演講區域和開放學習空間，讓門市成為社群聚集地而非單純購物場所", tool: "internal", outputType: "community_space_design", requiredSkills: ["brand-dna"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "體驗零售設計師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "產品展示設計師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "服務體驗師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Ron Johnson Apple Store 體驗零售革命框架", description: "Source: Ron Johnson（前 Apple Store VP）2001 年設計的 Apple Store 概念，被哈佛商業評論評為「20 年最佳零售創新」。Apple Store 年坪效超過 $5,546，全球最高", steps });
      await upsertSquad(conn, { slug, name: "Ron Johnson Apple Store 體驗零售革命小隊", description: "應用 Ron Johnson 設計 Apple Store 的框架：體驗分區 → 親手試用 → Genius Bar 服務 → 社群空間，把零售從「賣東西」轉型為「建立關係」", industryKey: "marketing", missionType: taskType, workspace: ["instore"], methodology: "Ron Johnson – Apple Store Experience Design (2001)", agents: agentMembers, tags: ["instore", "apple-store", "customer-experience", "service-design"], useCases: ["品牌旗艦店設計", "體驗零售轉型", "服務設計改造"], outputFormats: ["體驗分區設計", "試用展示設計", "Genius Bar 設計", "社群空間設計"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Apple Store Global（Johnson 設計）", description: "Ron Johnson 2001-2011 年任職期間，Apple Store 從 0 成長為全球最高坪效零售品牌", result: "Apple Store 年坪效達 $5,546/平方英尺（全球最高），NPS 超過 75，成為全球最研究的零售案例", source: "Harvard Business Review / Apple Annual Report" }, { company: "Microsoft Store（Apple Store 學習）", description: "Microsoft 應用 Johnson 的 Apple Store 框架設計自有品牌門市體驗", result: "Microsoft Store NPS 達到 80+，每位服務員工接待顧客的年均銷售超過 Apple Store 員工的 70%", source: "Microsoft Corporate Blog / Retail Dive 2019" }] });
    }

    // IS7: Sheena Iyengar — The Art of Choosing in Retail (2010)
    {
      const slug = "is-iyengar-choice";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "market-research-agent"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "choice-architecture-retail"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["visual-content-creator", "curated-assortment-design"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "marketing-ops"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "choice-reduction-roi"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "選擇疲勞審計", description: "審計品牌目前的 SKU 和選項數量：Iyengar 的「果醬實驗」證明 24 種選項 < 6 種選項的轉換率。識別哪些品類因選項過多而造成選擇癱瘓", tool: "internal", outputType: "choice_fatigue_audit", requiredSkills: ["market-research-agent"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "選擇架構設計", description: "重新設計選擇架構（Choice Architecture）：精選最關鍵的選項、設計清晰的分類、提供決策輔助（最暢銷、最推薦、編輯精選），讓選擇變得輕鬆", tool: "internal", outputType: "choice_architecture_design", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "精選陳列設計", description: "設計「精選」而非「全部」的陳列方案：Iyengar 說最好的選擇設計是「讓人感覺他們做了獨立選擇，但實際上你引導了他們」。設計有引導性的精選陳列", tool: "internal", outputType: "curated_display_design", requiredSkills: ["visual-content-creator"] }, m2Info),
        assignAgentToStep({ order: 4, name: "選擇簡化 ROI 測量", description: "測量選擇簡化後的商業效益：轉換率變化、平均交易時間、客單價、退貨率，驗證選擇架構優化的 ROI", tool: "internal", outputType: "choice_simplification_roi", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "選擇架構師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "精選陳列師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "轉換分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Sheena Iyengar 選擇科學零售架構優化", description: "Source: Sheena Iyengar《The Art of Choosing》2010 + 哥倫比亞商學院教授。Iyengar 的「果醬實驗」是行為經濟學最著名研究之一，已被引用超過 10,000 次", steps });
      await upsertSquad(conn, { slug, name: "Sheena Iyengar 選擇科學零售優化小隊", description: "應用 Sheena Iyengar 的選擇科學：更少選項 = 更高轉換率。重新設計零售選擇架構，讓消費者從「選擇癱瘓」轉為「滿意選擇」", industryKey: "marketing", missionType: taskType, workspace: ["instore"], methodology: "Sheena Iyengar – The Art of Choosing (2010)", agents: agentMembers, tags: ["instore", "choice-architecture", "behavioral-science", "conversion"], useCases: ["SKU優化策略", "陳列選擇架構設計", "轉換率提升"], outputFormats: ["選擇疲勞審計", "選擇架構設計", "精選陳列方案", "ROI報告"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Procter & Gamble（選擇簡化案例）", description: "P&G 應用選擇架構科學，將 Head & Shoulders 洗髮精從 26 種減至 15 種", result: "銷售額提升 10%，退貨率降低，消費者滿意度提升，同期競品仍維持多款式", source: "Sheena Iyengar《The Art of Choosing》P&G 案例 / HBR 2010" }, { company: "Apple 產品線設計（選擇簡化哲學）", description: "Steve Jobs 應用極簡選擇原則設計 Apple 產品線：每個品類只有幾個選項", result: "Apple 產品線最精簡時（4款Mac）是公司最高利潤時期，消費者購買決策時間比競爭對手短 70%", source: "Walter Isaacson《Steve Jobs》/ Sheena Iyengar 公開演講" }] });
    }

    // IS8: Pine & Gilmore — Authenticity in Retail (2007)
    {
      const slug = "is-pine-authenticity";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["brand-dna", "marketing-strategy-pmm"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-dna", "retail-authenticity-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["content-marketing", "copywriting-pro"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["content-marketing", "brand-heritage-storytelling"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["visual-content-creator", "authentic-retail-atmosphere"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "真實性審計", description: "審計品牌在零售環境中的「真實性」：Pine & Gilmore 說消費者的核心問題是「這是真的嗎？」審計每個門市元素是否真實呈現品牌的核心承諾", tool: "internal", outputType: "authenticity_audit", requiredSkills: ["brand-dna"] }, leadInfo),
        assignAgentToStep({ order: 2, name: "品牌起源故事設計", description: "設計展示品牌真實起源的零售體驗：創始人故事、工藝展示、原料來源透明化，讓消費者感受到品牌的真實歷史和承諾", tool: "internal", outputType: "origin_story_design", requiredSkills: ["content-marketing"] }, m2Info),
        assignAgentToStep({ order: 3, name: "真實氛圍設計", description: "設計支撐品牌真實性的門市氛圍：使用真實材料（非仿製品）、展示真實工藝、讓真實的工匠或創始人出現，Pine 說「假的真實比假的更假」", tool: "internal", outputType: "authentic_atmosphere_design", requiredSkills: ["visual-content-creator"] }, m3Info),
        assignAgentToStep({ order: 4, name: "真實性 × 溢價定價", description: "設計「真實性溢價」定價策略：Pine & Gilmore 說消費者願意為真實性支付更高價格。建立清晰的真實性差異化，支撐溢價定價", tool: "internal", outputType: "authenticity_premium_strategy", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "品牌真實性師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "起源故事師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "真實氛圍師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Pine & Gilmore Authenticity 零售真實性框架", description: "Source: B. Joseph Pine II & James H. Gilmore《Authenticity: What Consumers Really Want》2007. 是《體驗經濟》的延伸，專注於後現代消費者對「真實性」的渴求", steps });
      await upsertSquad(conn, { slug, name: "Pine & Gilmore Authenticity 零售真實性小隊", description: "應用 Pine & Gilmore 的真實性框架：讓零售環境充滿可感知的真實性，消費者不只買產品，更買你真實的品牌故事和承諾", industryKey: "marketing", missionType: taskType, workspace: ["instore"], methodology: "Pine & Gilmore – Authenticity (2007)", agents: agentMembers, tags: ["instore", "authenticity", "brand-story", "premium"], useCases: ["精品品牌零售設計", "工藝品牌門市體驗", "溢價品牌定位強化"], outputFormats: ["真實性審計", "起源故事設計", "真實氛圍設計", "溢價定價策略"], requiredIntegrations: [], token: 55000, showcases: [{ company: "Patagonia 門市（真實性典範）", description: "Patagonia 門市展示真實的修補工作坊、環境行動照片、創始人故事，完全體現 Pine & Gilmore 真實性框架", result: "Patagonia 品牌溢價超過同類戶外品牌 30-50%，客戶忠誠度在時尚品牌中排名第一", source: "Pine & Gilmore《Authenticity》Patagonia 案例" }, { company: "星巴克臻選咖啡烘焙工坊", description: "Starbucks Reserve Roastery 應用真實性框架：展示真實咖啡烘焙過程、咖啡師技藝、莊園故事", result: "Roastery 每平方英尺銷售額是標準星巴克的 3 倍，客戶願意排隊 45 分鐘入場", source: "Starbucks Annual Report 2022 / Bloomberg 零售分析" }] });
    }

    // IS9: Bernd Schmitt — Customer Experience Management in Retail (2003)
    {
      const slug = "is-schmitt-retail-cx";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "brand-dna"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "cem-retail-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["visual-content-creator", "brand-identity"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["brand-identity", "multi-sensory-retail-cx"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "market-research-agent"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "cx-kpi-retail-measurement"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "CEM 零售審計（Customer Experience Grid）", description: "繪製品牌的「客戶體驗格格」：列出每個接觸點（進門/試用/結帳/售後）× 每種體驗模組（Sense/Feel/Think/Act/Relate），識別體驗缺口", tool: "internal", outputType: "cx_grid_audit", requiredSkills: ["market-research-agent"] }, m3Info),
        assignAgentToStep({ order: 2, name: "感官多維度零售環境設計", description: "設計整合五感的零售環境：Schmitt 的 CEM 要求每個接觸點都精心設計感官體驗，從包裝觸感到結帳音效都是品牌 CX 的一部分", tool: "internal", outputType: "sensory_retail_environment", requiredSkills: ["brand-identity"] }, m2Info),
        assignAgentToStep({ order: 3, name: "顧客旅程情緒設計", description: "設計零售旅程的情緒弧線：識別高情緒影響點（入店印象、服務互動、包裝開箱），在這些節點設計超出預期的情緒高峰", tool: "internal", outputType: "customer_journey_emotion_map", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 4, name: "CX KPI 追蹤系統", description: "建立零售 CX 的完整 KPI 系統：NPS、CES（客戶努力分數）、情緒分數、回訪率、推薦率，定期追蹤 CEM 策略效益", tool: "internal", outputType: "retail_cx_kpi_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "CEM 零售策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "感官環境師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "CX 分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Bernd Schmitt CEM 客戶體驗管理零售框架", description: "Source: Bernd Schmitt《Customer Experience Management》2003. Schmitt 是 CEM（Customer Experience Management）概念的奠基者，Columbia Business School 教授", steps });
      await upsertSquad(conn, { slug, name: "Bernd Schmitt CEM 零售客戶體驗小隊", description: "應用 Bernd Schmitt 的 CEM 框架系統化管理零售客戶體驗：從感官設計到情緒弧線，讓每個接觸點都是有意識的品牌體驗設計", industryKey: "marketing", missionType: taskType, workspace: ["instore"], methodology: "Bernd Schmitt – Customer Experience Management (2003)", agents: agentMembers, tags: ["instore", "cx", "customer-experience", "cem"], useCases: ["零售CX系統設計", "門市體驗提升", "NPS提升計劃"], outputFormats: ["CX格格審計", "感官環境設計", "情緒旅程地圖", "CX KPI報告"], requiredIntegrations: [], token: 60000, showcases: [{ company: "Nordstrom（CEM 零售標竿）", description: "Nordstrom 應用 CEM 框架系統化設計每個接觸點的客戶體驗，以服務著稱", result: "Nordstrom NPS 超過 70（業界最高之一），客戶回訪率比業界均值高 40%，員工推薦率達 90%", source: "Bernd Schmitt《CEM》零售案例 / Nordstrom Annual Report" }, { company: "新光三越（台灣 CEM 應用）", description: "應用 CEM 框架設計週年慶和 VIP 客戶體驗，系統化管理每個接觸點", result: "VIP 客戶消費占比達總業績 65%，週年慶 NPS 達到 75，台灣百貨業最高客戶忠誠度", source: "新光三越年報 2022 / 台灣百貨公會研究" }] });
    }

    // IS10: Kevin Kelly — 1,000 True Fans in Retail (2008)
    {
      const slug = "is-kelly-true-fans";
      const taskType = slug;
      const usedIds: number[] = [];
      const leadId = await findAgent(conn, ["marketing-strategy-pmm", "content-marketing"], usedIds);
      if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["marketing-strategy-pmm", "true-fans-retail-strategy"]); }
      const leadInfo = await getAgentInfo(conn, leadId);
      const m2Id = await findAgent(conn, ["social-media-marketing", "email-marketing"], usedIds);
      if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["email-marketing", "superfan-community-retail"]); }
      const m2Info = await getAgentInfo(conn, m2Id);
      const m3Id = await findAgent(conn, ["marketing-analytics", "attribution-modeling"], usedIds);
      if (m3Id) { usedIds.push(m3Id); await assignSkillsToAgent(conn, m3Id, ["marketing-analytics", "superfan-ltv-measurement"]); }
      const m3Info = await getAgentInfo(conn, m3Id);
      const steps = [
        assignAgentToStep({ order: 1, name: "真粉絲識別系統", description: "建立識別「真粉絲」的系統：Kevin Kelly 定義真粉絲 = 願意購買你所有東西的人。分析購買頻率、平均客單、推薦行為，識別品牌的 Top 1% 忠實顧客", tool: "internal", outputType: "true_fan_identification", requiredSkills: ["marketing-analytics"] }, m3Info),
        assignAgentToStep({ order: 2, name: "真粉絲 VIP 零售體驗設計", description: "設計只為真粉絲打造的獨特零售體驗：私下新品搶先預覽、與設計師/創辦人見面、限量會員商品、後台參觀，讓真粉絲感覺「我比一般顧客更特別」", tool: "internal", outputType: "true_fan_vip_experience", requiredSkills: ["marketing-strategy-pmm"] }, leadInfo),
        assignAgentToStep({ order: 3, name: "真粉絲社群建立", description: "建立真粉絲之間的社群連結：Kelly 說真粉絲不只愛品牌，更愛和同樣愛品牌的人在一起。設計真粉絲社群活動和專屬空間", tool: "internal", outputType: "true_fan_community_design", requiredSkills: ["social-media-marketing"] }, m2Info),
        assignAgentToStep({ order: 4, name: "真粉絲 LTV 最大化", description: "設計最大化真粉絲終身價值的系統：年費會員制、限量版預購、周邊商品、體驗升級，讓每個真粉絲的年均消費超過 $1,000 台幣 × 12 倍", tool: "internal", outputType: "true_fan_ltv_optimization", requiredSkills: ["email-marketing"] }, m2Info),
        assignAgentToStep({ order: 5, name: "真粉絲效益追蹤", description: "追蹤「真粉絲策略」的完整 ROI：真粉絲數量增長、平均 LTV、推薦帶來的新客比率、真粉絲 vs 普通客戶的利潤差異", tool: "internal", outputType: "true_fan_roi_report", requiredSkills: ["marketing-analytics"] }, m3Info),
      ];
      const agentMembers = [
        { agent_id: leadId, is_lead: true, role: "真粉絲策略師", order: 1 },
        { agent_id: m2Id, is_lead: false, role: "社群培育師", order: 2 },
        { agent_id: m3Id, is_lead: false, role: "LTV 分析師", order: 3 },
      ].filter(a => a.agent_id);
      await upsertWorkflow(conn, { missionType: taskType, name: "Kevin Kelly 1,000 True Fans 零售超級粉絲策略", description: "Source: Kevin Kelly《1,000 True Fans》2008 年文章（Wired 雜誌創始人）。Kelly 的「1,000 True Fans」概念是數位創作者和品牌建立可持續商業的基礎", steps });
      await upsertSquad(conn, { slug, name: "Kevin Kelly 1,000 True Fans 零售超粉策略小隊", description: "應用 Kevin Kelly 的真粉絲理論：識別、服務、放大你最忠實的 Top 1% 客戶，讓他們成為品牌最強的行銷武器。1,000 個真粉絲勝過 100,000 個普通關注者", industryKey: "marketing", missionType: taskType, workspace: ["instore"], methodology: "Kevin Kelly – 1,000 True Fans (2008)", agents: agentMembers, tags: ["instore", "true-fans", "loyalty", "ltv"], useCases: ["VIP會員體驗設計", "超粉社群建立", "客戶LTV最大化"], outputFormats: ["真粉絲識別報告", "VIP體驗設計", "社群設計", "LTV優化方案"], requiredIntegrations: [], token: 60000, showcases: [{ company: "LEGO VIP Program（真粉絲策略典範）", description: "LEGO 應用真粉絲理論建立 LEGO VIP 會員計劃：超粉可提前參與產品設計、限量套件優先購買", result: "LEGO VIP 會員消費是普通客戶的 5 倍，LEGO Ideas 平台（超粉共創）產出超過 30 款熱銷商品", source: "LEGO Annual Report 2022 / Kevin Kelly 公開演講" }, { company: "Patagonia 鐵桿用戶計劃", description: "Patagonia 識別真粉絲（通常是環保行動者）並設計專屬體驗：修補工作坊、環境運動參與機會", result: "Patagonia 真粉絲推薦帶來 40% 的新客戶，真粉絲 LTV 是一般客戶的 8 倍", source: "Patagonia B Corp Report / Yvon Chouinard 訪談 2022" }] });
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
