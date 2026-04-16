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
      // Add missionType to workflow templates (mirror of taskType)
      `ALTER TABLE squad_workflow_templates ADD COLUMN missionType VARCHAR(100) NULL`,
      `UPDATE squad_workflow_templates SET missionType = taskType WHERE missionType IS NULL`,
    ];
    for (const m of migrations) {
      try { await conn.execute(m); } catch (_) { /* already applied */ }
    }
    console.log("[seed-local] Schema migrations: done");

    // ── 1. SoWork品牌定位 workflow template ──────────────────────────────────────
    const TASK_TYPE = "sowork-brand-positioning";

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
      [TASK_TYPE]
    ) as any[];

    if ((existingTpl as any[]).length > 0) {
      console.log(`[seed-local] Workflow template '${TASK_TYPE}' already exists — updating steps.`);
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
          "SoWork 品牌定位 11 步分析框架",
          "從深層動機到品牌個性的完整品牌定位分析流程，最終輸出品牌定位書",
          JSON.stringify(steps),
        ]
      );
      console.log(`[seed-local] Workflow template '${TASK_TYPE}' inserted.`);
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
          TASK_TYPE,
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
          TASK_TYPE,
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
    {
      const slug = "benefit-based-positioning";
      const taskType = "benefit-based-positioning";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["messaging", "brand-voice", "content-strategy", "pmm", "copywriting", "positioning"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["consumer-insights", "customer-research", "ux-research", "insight"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["emotional-branding", "brand-dna", "brand-strategy", "emotional"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "conversion", "cro", "ad-creative", "performance-marketing"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["ad-creative", "paid-social", "facebook-ads", "messaging", "performance"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "messaging_strategist",   order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "consumer_insight_analyst", order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "emotional_brand_specialist", order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "conversion_copywriter",    order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "ad_messaging_validator",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "利益階梯定位流程（Benefit Ladder）",
        description: "從產品功能出發，沿 Feature → Functional Benefit → Emotional Benefit 梯形爬升，最終落地為轉換文案與廣告訊息。工具：osp_marketing_tools Value Map Generator + marketing-strategy-pmm Messaging Hierarchy。",
        steps: [
          { step: 1, title: "Squad Lead Intake：產品功能與受眾盤點", description: "Squad Lead 收集產品功能清單、目標受眾、現有訊息，評估目前定位成熟度，Brief 成員任務範疇", owner: "squad_lead", output: "任務簡報（Brief）", tools: [] },
          { step: 2, title: "功能利益轉化", description: "Consumer Insight Analyst 將每項產品功能轉譯為明確的功能利益（Functional Benefit），使用 osp_marketing_tools Product Value Map Generator：features → position statements", owner: "consumer_insight_analyst", output: "功能利益清單（Feature → Functional Benefit Map）", tools: ["osp_marketing_tools: Product Value Map Generator"] },
          { step: 3, title: "情感利益挖掘", description: "Emotional Brand Specialist 對每項功能利益往上挖掘對應的情感利益，依 marketing-strategy-pmm Messaging Hierarchy（Headline → Benefits → Features → Proof）整合", owner: "emotional_brand_specialist", output: "情感利益映射表（Functional → Emotional Benefit）", tools: ["marketing-strategy-pmm: Messaging Hierarchy"] },
          { step: 4, title: "利益階梯訊息框架建構", description: "Messaging Strategist 整合前兩步，產出完整 Message Ladder：品牌主張 → 功能利益 → 情感利益 → 社會認同 → 行動呼籲", owner: "messaging_strategist", output: "完整 Message Ladder 文件", tools: ["osp_marketing_tools: Tagline Generator", "marketing-strategy-pmm: Messaging Hierarchy"] },
          { step: 5, title: "轉換文案與廣告訊息落地", description: "Conversion Copywriter 將 Message Ladder 轉化為廣告 Headline、Landing Page Copy、Email Subject Lines；Ad Messaging Validator 用 A/B 框架評估效力", owner: "conversion_copywriter", output: "廣告文案包（Ads / LP / Email）", tools: ["marketing-strategy-pmm: Messaging Hierarchy"] },
          { step: 6, title: "Squad Lead QA & 利益階梯定位書交付", description: "Squad Lead 校閱全部輸出，確保階梯一致性與情感共鳴，輸出最終品牌利益定位書", owner: "squad_lead", output: "利益階梯定位書（Benefit-Based Positioning Deck）", tools: [] },
        ],
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
        tags: ["brand", "positioning", "messaging", "copywriting", "emotional-branding", "benefit-ladder", "conversion", "ad-creative", "strategy"],
        useCases: ["新產品上市訊息框架", "廣告文案改版", "Landing Page 轉換優化", "品牌重新定位訊息整合", "品牌故事建立"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "YouTube 影片腳本"],
        requiredIntegrations: [],
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

      const leadId = await findAgent(conn, ["brand-strategy", "positioning", "strategy", "gtm", "cmo", "differentiation"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["competitor-analysis", "competitive-analysis", "competitive-intelligence", "market-research"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["brand-identity", "brand-dna", "brand-strategy", "creative-strategy"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["sales-enablement", "battlecard", "win-loss", "product-marketing", "pmm"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["market-research", "research", "analysis", "insight", "consumer-insights"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "differentiation_strategist",    order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "competitive_intelligence_analyst", order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "brand_identity_specialist",       order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "battlecard_pmm",                  order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "market_gap_analyst",              order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "差異化定位流程（April Dunford Method）",
        description: "系統性找出競品尚未佔據的差異化空間，以 April Dunford Obviously Awesome 方法論為核心：獨特屬性 → 客戶價值 → 市場類別 → 宣告並固守。搭配 Battlecard 與 Win/Loss 分析落地。",
        steps: [
          { step: 1, title: "Squad Lead Intake：競爭現況與品牌優勢盤點", description: "Squad Lead 收集品牌現有定位、已知競品、客戶反饋，評估差異化成熟度，確認 April Dunford 方法論適用範疇", owner: "squad_lead", output: "競爭盤點簡報（Competitive Audit Brief）", tools: [] },
          { step: 2, title: "獨特屬性識別（Isolate Unique Attributes）", description: "Competitive Intelligence Analyst 系統性列出品牌相對競品的所有獨特屬性（功能、技術、流程、團隊），使用 marketing-strategy-pmm April Dunford 框架過濾真正差異化的屬性", owner: "competitive_intelligence_analyst", output: "差異化屬性清單（Unique Attributes List）", tools: ["marketing-strategy-pmm: April Dunford – Isolate Unique Attributes"] },
          { step: 3, title: "客戶價值映射（Map to Customer Value）", description: "Brand Identity Specialist 將每項獨特屬性對映至客戶真實重視的價值（cost savings / risk reduction / strategic value），移除客戶不在乎的假差異化", owner: "brand_identity_specialist", output: "客戶價值映射表（Attribute → Customer Value Map）", tools: ["marketing-strategy-pmm: April Dunford – Map to Customer Value"] },
          { step: 4, title: "市場類別選定（Choose Market Category）", description: "Differentiation Strategist 根據最強差異化屬性選定最有利的市場類別框架（新品類 / 子品類 / 重新框架既有類別），確立品牌在該類別的領導地位", owner: "differentiation_strategist", output: "市場類別宣言（Market Category Statement）", tools: ["marketing-strategy-pmm: April Dunford – Choose Market Category"] },
          { step: 5, title: "Battlecard & Win/Loss 分析", description: "Battlecard PMM 產出競品對比 Battlecard（我方優勢 vs 各競品弱點），使用 marketing-strategy-pmm Win/Loss Analysis Template 驗證差異化主張是否在實際銷售中成立", owner: "battlecard_pmm", output: "競品 Battlecard 套組 + Win/Loss 分析報告", tools: ["marketing-strategy-pmm: Battlecard Template", "marketing-strategy-pmm: Win/Loss Analysis"] },
          { step: 6, title: "Squad Lead QA & 差異化定位書交付", description: "Squad Lead 確認差異化主張在市場、銷售、產品三端的一致性，輸出可落地的差異化定位書", owner: "squad_lead", output: "差異化定位書（Differentiation Positioning Playbook）", tools: [] },
        ],
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
        tags: ["brand", "positioning", "differentiation", "competitive-analysis", "brand-strategy", "battlecard", "april-dunford", "gtm", "market-category"],
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

      const leadId = await findAgent(conn, ["gtm", "b2b", "product-marketing", "pmm", "demand-gen", "saas"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["icp", "customer-research", "b2b", "firmographic", "segmentation", "buyer-persona"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["value-proposition", "positioning", "product-marketing", "b2b", "saas"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "messaging", "content-strategy", "brand-voice", "landing-page"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["sales-enablement", "sales-deck", "collateral", "demand-gen", "cro"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "gtm_value_strategist",   order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "icp_researcher",           order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "value_map_architect",      order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "messaging_copywriter",     order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "sales_collateral_pmm",     order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "價值主張映射流程（Value Proposition Mapping）",
        description: "B2B/SaaS 核心定位工具：將產品功能對映至買家痛點，定義 ICP，生成市場/技術/UX/商業四維度定位聲明，直接轉化為銷售素材與廣告文案。工具：osp_marketing_tools Value Map + marketing-strategy-pmm ICP。",
        steps: [
          { step: 1, title: "Squad Lead Intake：產品功能清單 + 初步 ICP 定義", description: "Squad Lead 收集產品功能列表、已知客戶類型、主要競品，評估 messaging-market fit 現況，確認 Value Mapping 優先聚焦的買家類型", owner: "squad_lead", output: "產品功能清單 + ICP 初稿（Brief）", tools: [] },
          { step: 2, title: "ICP 精確定義（Firmographic → Psychographic）", description: "ICP Researcher 使用 marketing-strategy-pmm ICP Scoring 框架，從 Firmographics → Technographics → Psychographics → Buyer Personas 三層遞進，建立 A/B/C/D ICP 評分模型", owner: "icp_researcher", output: "ICP 定義文件（含 A/B/C/D 評分）", tools: ["marketing-strategy-pmm: ICP Scoring (A/B/C/D)", "marketing-strategy-pmm: Buyer Persona Template"] },
          { step: 3, title: "痛點與功能價值對應（Pain → Feature → Benefit）", description: "Value Map Architect 使用 osp_marketing_tools Product Value Map Generator，為每個 ICP Persona 生成 Pain Points → Features → Benefits → Position Statements 的完整映射", owner: "value_map_architect", output: "價值映射矩陣（每 ICP × 每功能）", tools: ["osp_marketing_tools: Product Value Map Generator"] },
          { step: 4, title: "四維度定位聲明生成（Market / Technical / UX / Business）", description: "Value Map Architect 使用 osp_marketing_tools 生成四個維度的定位聲明：Market Position（市場）、Technical Position（技術）、UX Position（體驗）、Business Position（商業價值），再由 Messaging Copywriter 精煉文字", owner: "value_map_architect", output: "四維度定位聲明文件", tools: ["osp_marketing_tools: Position Statement Generator (4 dimensions)"] },
          { step: 5, title: "銷售素材與廣告文案轉化", description: "Messaging Copywriter 將定位聲明轉化為 Landing Page Copy、Sales Deck、Ad Headlines；Sales Collateral PMM 打包為可直接使用的銷售素材包", owner: "messaging_copywriter", output: "銷售素材包（LP / Sales Deck / Ads）", tools: ["marketing-strategy-pmm: Value Proposition Formula"] },
          { step: 6, title: "Squad Lead QA & 價值主張定位書交付", description: "Squad Lead 確認四維度聲明的一致性與競爭差異化，輸出完整 Value Proposition Playbook", owner: "squad_lead", output: "價值主張定位書（Value Proposition Playbook）", tools: [] },
        ],
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
        tags: ["b2b", "saas", "gtm", "value-proposition", "icp", "positioning", "product-marketing", "pmm", "demand-gen", "messaging", "strategy"],
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

      const leadId = await findAgent(conn, ["segmentation", "audience", "analytics", "consumer-insights", "data", "research"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["data", "analytics", "data-analysis", "survey", "research", "quantitative"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["persona", "consumer-insights", "behavioral", "customer-research", "qualitative"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["icp", "b2b", "product-marketing", "pmm", "buyer-persona", "segmentation"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["personalization", "channel-strategy", "audience-targeting", "paid-social", "media-planning"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "segmentation_strategist",   order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "data_analyst",               order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "persona_developer",          order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "icp_scoring_pmm",            order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "personalization_strategist", order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "分眾定位流程（Segmentation-Based Positioning）",
        description: "針對不同受眾群體建立差異化定位，而非廣播式一刀切。使用 Madison Research Agents 進行問卷分析與合成 Persona 開發，搭配 marketing-strategy-pmm ICP 評分模型（A/B/C/D）優先排序目標客群。McKinsey 資料顯示有效個人化可降低 50% 獲客成本。",
        steps: [
          { step: 1, title: "Squad Lead Intake：受眾現況與分眾目標盤點", description: "Squad Lead 收集現有客戶資料、已知受眾假設、行銷目標，評估分眾定位的必要性與優先分群方向", owner: "squad_lead", output: "分眾定位簡報（Segmentation Brief）", tools: [] },
          { step: 2, title: "受眾資料收集與分析（Survey Analysis）", description: "Data Analyst 使用 Madison Research Agents 進行 survey analysis 與二手資料收集，建立受眾基本資料集（人口統計、行為、購買動機）", owner: "data_analyst", output: "受眾資料集（Audience Dataset）", tools: ["Madison: Research Agents – Survey Analysis", "Madison: Research Agents – Secondary Research"] },
          { step: 3, title: "合成 Persona 開發（Synthetic Persona Development）", description: "Persona Developer 使用 Madison 的 Synthetic Persona Development 與 Preference Modeling 建立 3-5 個資料驅動的 Persona，超越傳統「拍腦袋 Persona」", owner: "persona_developer", output: "合成 Persona 卡片（Data-Driven Personas）", tools: ["Madison: Synthetic Persona Development", "Madison: Preference Modeling"] },
          { step: 4, title: "ICP 評分與優先排序（A/B/C/D Fit Scoring）", description: "ICP Scoring PMM 使用 marketing-strategy-pmm ICP Scoring 框架，對每個 Persona 進行 A/B/C/D Fit 評分（Firmographic / Technographic / Psychographic / Economic Buyer），確定最優先攻佔的客群", owner: "icp_scoring_pmm", output: "ICP 評分表（Priority Segment Matrix）", tools: ["marketing-strategy-pmm: ICP Scoring A/B/C/D", "marketing-strategy-pmm: Buyer Persona Templates"] },
          { step: 5, title: "各分群差異化定位與個人化訊息開發", description: "Personalization Strategist 針對每個 A-grade ICP 開發專屬的定位訊息、觸達渠道策略、個人化廣告素材方向", owner: "personalization_strategist", output: "分眾定位訊息矩陣（Segment × Positioning Message）", tools: ["Madison: Preference Modeling"] },
          { step: 6, title: "Squad Lead QA & 分眾定位矩陣交付", description: "Squad Lead 確認各分群定位的差異化與協同性，輸出完整分眾定位矩陣與執行建議", owner: "squad_lead", output: "分眾定位矩陣（Segmentation Positioning Playbook）", tools: [] },
        ],
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
        tags: ["segmentation", "audience", "persona", "icp", "positioning", "consumer-insights", "personalization", "b2b", "data", "research", "strategy"],
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

      const leadId = await findAgent(conn, ["competitive-analysis", "competitor-analysis", "market-research", "strategy", "positioning"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["competitor-analysis", "competitive-intelligence", "web-research", "monitoring"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["market-research", "research", "trend-analysis", "secondary-research", "intelligence"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["data", "analytics", "data-visualization", "analysis", "reporting"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["brand-strategy", "positioning", "gtm", "channel-strategy", "ad-targeting"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "competitive_perceptual_strategist", order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "competitor_monitor",               order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "market_intelligence_analyst",       order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "data_visualization_specialist",     order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "positioning_strategist",            order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "競爭感知圖流程（Competitive Perceptual Mapping）",
        description: "系統繪製品牌 vs 競品的雙軸感知地圖（價格/品質、創新/傳統等），識別未被佔據的市場白空間。工具：octolens 競品即時監控 + Madison Intelligence Agents MarketMind Research + marketing-strategy-pmm Competitive Positioning Map。",
        steps: [
          { step: 1, title: "Squad Lead Intake：競品範疇定義與地圖維度假設", description: "Squad Lead 確認需要納入的競品範疇（直接/間接競品）、感知地圖的初步維度假設（如：價格 vs 品質、傳統 vs 創新），訂定資料收集計劃", owner: "squad_lead", output: "競品範疇清單 + 初步維度假設（Brief）", tools: [] },
          { step: 2, title: "競品即時數據監控（Real-time Competitor Tracking）", description: "Competitor Monitor 使用 octolens 對目標競品進行即時網頁資料抽取，收集官網定位訊息、廣告文案、定價頁面、PR 發稿等資料", owner: "competitor_monitor", output: "競品原始資料集（Competitor Raw Data）", tools: ["octolens: Competitor Monitoring & Web Data Extraction"] },
          { step: 3, title: "市場情報深度分析（MarketMind Research）", description: "Market Intelligence Analyst 使用 Madison Intelligence Agents 的 MarketMind Research 模組，進行 reputation monitoring、trend analysis 與市場二手資料研究，補充 octolens 原始數據的深度解讀", owner: "market_intelligence_analyst", output: "市場情報分析報告", tools: ["Madison: Intelligence Agents – MarketMind Research", "Madison: Intelligence Agents – Reputation Monitoring", "Madison: Intelligence Agents – Trend Analysis"] },
          { step: 4, title: "感知地圖繪製（Perceptual Map Construction）", description: "Data Visualization Specialist 使用 marketing-strategy-pmm Competitive Positioning Map 框架，根據研究結果選定最具區分度的 2 個維度軸，繪製品牌 vs 競品的二維感知定位圖", owner: "data_visualization_specialist", output: "競爭感知地圖（Perceptual Map）", tools: ["marketing-strategy-pmm: Competitive Positioning Map Construction", "marketing-strategy-pmm: positioning-frameworks.md"] },
          { step: 5, title: "白空間識別與定位機會建議", description: "Positioning Strategist 分析感知地圖，識別競品尚未佔據的白空間，評估品牌進入白空間的可行性，提出 2-3 個差異化定位方向及對應的廣告策略、渠道策略、定價建議", owner: "positioning_strategist", output: "白空間機會分析 + 定位方向建議書", tools: ["marketing-strategy-pmm: Whitespace Analysis"] },
          { step: 6, title: "Squad Lead QA & 感知定位報告交付", description: "Squad Lead 整合感知地圖 + 白空間分析 + 定位建議，輸出完整競爭感知定位報告，直接用於廣告策略、渠道規劃、定價決策", owner: "squad_lead", output: "競爭感知定位報告（Competitive Perceptual Positioning Report）", tools: [] },
        ],
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
        tags: ["competitive-analysis", "competitor-analysis", "positioning", "market-research", "perceptual-map", "whitespace", "brand-strategy", "strategy", "intelligence", "gtm"],
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

      const leadId = await findAgent(conn, ["category-design", "category-creation", "market-creation", "thought-leadership", "brand-strategy", "positioning"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["content-strategy", "thought-leadership", "narrative", "storytelling", "brand-voice"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["market-research", "market-analysis", "industry-research", "competitive-intelligence"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["gtm", "go-to-market", "launch-strategy", "product-marketing", "growth"], used);
      if (m4) used.push(m4);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "category_designer",      order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "thought_leader_writer",   order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "market_analyst",          order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "gtm_strategist",          order: 4 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "品類設計定位流程",
        description: "Category Design 七步法：定義品類問題 → 建立品類 POV → 競品再框架 → 品類藍圖 → 思想領袖內容 → 生態系建立 → 品類傳道",
        steps: [
          {
            order: 1, name: "品類問題診斷",
            description: "用 Madison MarketMind Research Agents 分析現有市場結構，找出尚未被命名的問題空間（problem space）。識別消費者還沒意識到自己有的「痛點」。",
            tool: "madison-market-research",
            outputType: "category_problem_brief",
          },
          {
            order: 2, name: "品類 POV（觀點）建立",
            description: "撰寫品類的核心觀點文件（Category POV）：為什麼現有解法不夠好？你的品類為何是唯一的正確答案？格式：問題陳述 → 舊世界 vs 新世界 → 品類宣言。",
            tool: "osp_marketing_tools",
            outputType: "category_pov_document",
          },
          {
            order: 3, name: "競品重新框架",
            description: "用 octolens 監控競品如何自我定位，用 marketing-strategy-pmm Battlecard 工具記錄競品弱點，然後把競品定位為解決舊問題的「傳統方案」，而你的品牌解決的是全新的問題。",
            tool: "octolens",
            outputType: "competitive_reframe_map",
          },
          {
            order: 4, name: "品類藍圖設計",
            description: "用 osp_marketing_tools Value Map Generator 繪製品類全景：品類名稱、子品類結構、典型客戶旅程、品類關鍵詞。建立你的品牌在品類中的「Category King」座標。",
            tool: "osp_marketing_tools",
            outputType: "category_blueprint",
          },
          {
            order: 5, name: "思想領袖內容策略",
            description: "設計讓你教育市場、成為品類代言人的內容計劃：白皮書主題、演講敘事、播客議程、LinkedIn 系列文章。目標：讓媒體和分析師用你的品類語言報導市場。",
            tool: "internal",
            outputType: "thought_leadership_content_plan",
          },
          {
            order: 6, name: "品類生態系規劃",
            description: "識別潛在的盟友（投資人、合作夥伴、早期採用者社群）共同建立品類生態系。設計品類論壇、認證計劃或社群活動讓品類變成運動。",
            tool: "internal",
            outputType: "ecosystem_strategy",
          },
        ],
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
        tags: ["category-design", "category-creation", "thought-leadership", "brand-strategy", "market-creation", "gtm", "positioning", "strategy", "innovation", "b2b"],
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

      const leadId = await findAgent(conn, ["positioning", "brand-positioning", "brand-strategy", "mind-share", "market-leadership"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["competitive-intelligence", "competitive-analysis", "competitor-research", "market-analysis"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["messaging", "brand-voice", "copywriting", "brand-narrative"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["advertising", "campaign-strategy", "media-planning", "ad-strategy"], used);
      if (m4) used.push(m4);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "mind_positioning_strategist", order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "competitive_intelligence",     order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "messaging_architect",          order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "campaign_strategist",          order: 4 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "心智佔位定位流程",
        description: "Ries & Trout 心智定位六步法：心智地圖掃描 → 梯子分析 → 屬性選擇 → 競品重定位 → 定位聲明 → 媒體心智強化",
        steps: [
          {
            order: 1, name: "心智地圖掃描",
            description: "用 octolens 和 Madison MarketMind 掃描目標市場的「心智梯子」：品類前三名品牌分別佔據哪個屬性？消費者說到品類第一個聯想到誰？識別已被佔領和空缺的心智位置。",
            tool: "octolens",
            outputType: "mind_ladder_map",
          },
          {
            order: 2, name: "梯子位置分析",
            description: "用 marketing-strategy-pmm 競品分析工具繪製「心智梯子」：第一名的品牌佔什麼位置？第二名的策略是跟隨還是反定位？評估你的品牌目前在消費者心智中的位階。",
            tool: "marketing-strategy-pmm",
            outputType: "ladder_position_analysis",
          },
          {
            order: 3, name: "核心屬性選擇",
            description: "選擇一個尚未被競品完全佔領的核心屬性（速度、安全、天然、創新…），確保這個屬性夠獨特、夠重要且你能真正擁有它。用 osp_marketing_tools 驗證屬性的品牌共鳴度。",
            tool: "osp_marketing_tools",
            outputType: "core_attribute_selection",
          },
          {
            order: 4, name: "競品重定位策略",
            description: "設計「重定位競品」策略（如 Avis 的 We Try Harder、7-Up 的 Uncola）：承認你不是第一，但把第一的位置重新定義，讓你的屬性更重要。或找到品類第二名的機會位置。",
            tool: "marketing-strategy-pmm",
            outputType: "repositioning_strategy",
          },
          {
            order: 5, name: "定位聲明與訊息",
            description: "撰寫符合「心智佔位」原則的定位聲明：單一屬性、極度清晰、無歧義。用 osp_marketing_tools Value Map Generator 確保訊息一致性，建立所有通路的統一定位語言。",
            tool: "osp_marketing_tools",
            outputType: "positioning_statement",
          },
          {
            order: 6, name: "心智強化媒體計劃",
            description: "設計讓心智佔位持續強化的媒體策略：哪些媒體管道能最有效地在目標受眾心智中植入你的屬性？設計重複性強化的廣告訊息節奏。",
            tool: "internal",
            outputType: "mind_reinforcement_media_plan",
          },
        ],
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
        tags: ["mind-positioning", "brand-positioning", "competitive-strategy", "ries-trout", "market-leadership", "brand-strategy", "messaging", "positioning", "strategy", "b2b"],
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

      const leadId = await findAgent(conn, ["jobs-to-be-done", "jtbd", "customer-research", "user-research", "product-marketing"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["qualitative-research", "interview-analysis", "customer-insights", "consumer-insights"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["product-positioning", "product-marketing", "pmm", "gtm"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["messaging", "copywriting", "brand-voice", "content-strategy"], used);
      if (m4) used.push(m4);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "jtbd_strategist",         order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "interview_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "product_positioning",      order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "jtbd_messaging_writer",    order: 4 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "任務導向定位流程",
        description: "JTBD 定位五步法：任務挖掘 → 觸發點分析 → 替代方案識別 → 任務聲明 → 圍繞任務的訊息框架",
        steps: [
          {
            order: 1, name: "任務挖掘（Job Mapping）",
            description: "用 Madison Synthetic Persona Agents 和 MarketMind Research 模擬客戶「雇用」產品的情境：他們在完成什麼更大的任務？觸發點是什麼？成功看起來是什麼樣子？建立 Job Map（開始 → 準備 → 執行 → 結束）。",
            tool: "madison-market-research",
            outputType: "job_map",
          },
          {
            order: 2, name: "Switch Interview 分析",
            description: "模擬客戶從舊方案切換到你的產品的「轉換故事」：四個力（推力 Push、拉力 Pull、焦慮 Anxiety、習慣 Habit）分析。識別哪些 Job 已有足夠強的切換驅動力，哪些還需要教育。",
            tool: "madison-market-research",
            outputType: "switch_analysis",
          },
          {
            order: 3, name: "競爭替代品重定義",
            description: "不按傳統行業分類定義競品，而是問「客戶不用你的產品時，他們用什麼完成同一個 Job」？用 marketing-strategy-pmm ICP 工具和 octolens 找出真正的任務替代品（可能是完全不同行業的產品）。",
            tool: "marketing-strategy-pmm",
            outputType: "job_based_competitor_map",
          },
          {
            order: 4, name: "JTBD 定位聲明",
            description: "圍繞 Job 寫定位聲明（不是人口統計，是情境）：「當 [情境] 時，[目標客戶] 雇用 [產品] 來 [完成任務]，因為它是唯一能 [差異點] 的方案」。用 osp_marketing_tools Value Map Generator 驗證 Job 和效益的對應關係。",
            tool: "osp_marketing_tools",
            outputType: "jtbd_positioning_statement",
          },
          {
            order: 5, name: "任務驅動訊息框架",
            description: "用 marketing-strategy-pmm PMM 工具建立所有通路的統一訊息框架：官網英雄區塊、廣告標題、銷售話術，全部圍繞 Job 而非功能特性或受眾人口統計。",
            tool: "marketing-strategy-pmm",
            outputType: "jtbd_messaging_framework",
          },
        ],
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
        tags: ["jtbd", "jobs-to-be-done", "customer-research", "product-positioning", "product-marketing", "positioning", "strategy", "b2b", "saas", "innovation"],
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

      const leadId = await findAgent(conn, ["purpose-driven", "brand-purpose", "csr", "sustainability", "social-impact", "brand-strategy"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-voice", "storytelling", "content-strategy", "brand-narrative", "copywriting"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["campaign-strategy", "social-media", "influencer", "community", "dtc"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["consumer-insights", "customer-research", "audience-analysis", "market-research"], used);
      if (m4) used.push(m4);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "purpose_strategist",      order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_narrator",          order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "campaign_strategist",     order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "audience_analyst",        order: 4 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "目的導向定位流程",
        description: "Purpose-Driven 定位五步法：使命真實性稽核 → 目標受眾價值觀對齊 → Purpose 聲明 → 使命驅動敘事 → 全通路整合",
        steps: [
          {
            order: 1, name: "使命真實性稽核",
            description: "用 Madison MarketMind Research 和 octolens 掃描品牌歷史、現有 CSR 活動、產品特性，找出品牌真實能「擁有」的社會使命。避免 purpose washing——必須有可驗證的行動支撐聲明。",
            tool: "madison-market-research",
            outputType: "purpose_authenticity_audit",
          },
          {
            order: 2, name: "目標受眾價值觀對齊",
            description: "用 Madison Synthetic Persona Agents 建立目標受眾的價值觀地圖：他們關心什麼社會議題？什麼使命會讓他們主動選擇你？用 marketing-strategy-pmm ICP 確認 Purpose 與 Ideal Customer 的交集。",
            tool: "marketing-strategy-pmm",
            outputType: "purpose_audience_alignment_map",
          },
          {
            order: 3, name: "Purpose 聲明建立",
            description: "用 osp_marketing_tools Value Map Generator 建立三層 Purpose 架構：What（你做什麼）→ How（你怎麼做）→ Why（為什麼這件事重要，比賺錢更重要的理由）。確保 Purpose 夠具體、可行動、可衡量。",
            tool: "osp_marketing_tools",
            outputType: "brand_purpose_statement",
          },
          {
            order: 4, name: "使命驅動敘事設計",
            description: "設計讓消費者「加入運動」而非「購買產品」的品牌故事框架。格式：英雄不是品牌而是消費者，品牌是賦能者。建立 Manifesto、Signature Campaign 概念（類 Patagonia / Nike 風格）。",
            tool: "osp_marketing_tools",
            outputType: "purpose_narrative_manifesto",
          },
          {
            order: 5, name: "全通路 Purpose 整合",
            description: "確保 Purpose 貫穿所有觸點：產品包裝、官網 About 頁、社群貼文語調、廣告標題、客服話術。設計可追蹤的使命指標（除了銷售，還有什麼數字能證明 Purpose 在發揮作用）。",
            tool: "marketing-strategy-pmm",
            outputType: "purpose_integration_playbook",
          },
        ],
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
        tags: ["purpose-driven", "brand-purpose", "csr", "sustainability", "social-impact", "brand-strategy", "dtc", "gen-z", "storytelling", "campaign"],
        useCases: ["DTC 品牌差異化", "年輕受眾品牌共鳴", "ESG 品牌策略", "品牌重塑使命宣言", "Manifesto Campaign 概念", "企業社會責任行銷"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "Brand Manifesto", "YouTube 影片腳本", "LINE 分享卡"],
        requiredIntegrations: [],
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

      const leadId = await findAgent(conn, ["brand-archetype", "brand-identity", "brand-personality", "jungian", "brand-strategy"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-voice", "tone-of-voice", "brand-narrative", "copywriting", "content-strategy"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["visual-identity", "creative-direction", "design-strategy", "brand-design"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["consumer-insights", "audience-analysis", "brand-perception", "market-research"], used);
      if (m4) used.push(m4);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "archetype_strategist",   order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_voice_specialist",  order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "creative_director",       order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "brand_perception_analyst",order: 4 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "品牌原型定位流程",
        description: "Brand Archetype 五步法：現有品牌人格診斷 → 原型選擇與組合 → 品牌聲音指南 → 視覺與體驗方向 → 全通路原型一致性",
        steps: [
          {
            order: 1, name: "現有品牌人格診斷",
            description: "用 octolens 爬取品牌既有溝通素材（官網文案、社群貼文、廣告），Madison MarketMind 掃描消費者對品牌的感知描述詞，診斷品牌目前隱性展現的原型是什麼，以及與期望原型的落差。",
            tool: "octolens",
            outputType: "brand_personality_audit",
          },
          {
            order: 2, name: "原型選擇與組合",
            description: "基於品牌使命、目標受眾心理需求、競品原型地圖，從 Jung 12 原型中選擇主原型（Primary）和輔助原型（Secondary）。避免選擇競品已強勢佔據的原型。建立原型選擇理由書。",
            tool: "marketing-strategy-pmm",
            outputType: "archetype_selection_rationale",
          },
          {
            order: 3, name: "品牌聲音指南",
            description: "用 osp_marketing_tools Brand Voice Generator 建立以原型為核心的品牌聲音指南：用詞庫（宜用 / 禁用）、句子結構偏好、情緒基調、各通路語調微調（官網 vs 社群 vs 廣告 vs 客服）。",
            tool: "osp_marketing_tools",
            outputType: "brand_voice_guide",
          },
          {
            order: 4, name: "視覺與體驗方向",
            description: "根據原型特質制定視覺方向：配色系統、字型個性、攝影風格、版面偏好。建立體驗設計原則：產品包裝、官網 UX、門市空間（如適用）應傳遞的感受。提供 Moodboard 方向。",
            tool: "internal",
            outputType: "visual_experience_direction",
          },
          {
            order: 5, name: "全通路原型一致性稽核",
            description: "用 marketing-strategy-pmm 訊息一致性工具，稽核所有現有觸點的原型一致性。建立品牌原型評分標準，讓後續所有溝通都能自我稽核是否符合原型人格。",
            tool: "marketing-strategy-pmm",
            outputType: "archetype_consistency_audit",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "品牌原型定位小組",
        description: "以 Jung 心理學 12 原型統一品牌的聲音、視覺與體驗，從人格層面建立深度的消費者情感連結。整合 octolens 品牌感知稽核、osp_marketing_tools 品牌聲音框架、marketing-strategy-pmm 訊息一致性，輸出原型選擇理由書、品牌聲音指南與全通路一致性手冊。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-positioning"],
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
