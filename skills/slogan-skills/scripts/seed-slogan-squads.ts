/**
 * seed-slogan-squads.ts
 * Inserts slogan-methodology squads + workflow templates into mos_db (local MySQL on VM).
 * Runs idempotently — safe to re-run.
 *
 * Slogan regex patterns for getRecommendedSquads scoring:
 *   /slogan|tagline|標語|祈使句|imperative|descriptive.value|superlative|promise|problem.solution|emotional.stor|mission.declar|provocative|storybrand|sensory.wordplay/i
 *
 * Usage:  npx ts-node seed-slogan-squads.ts
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
    `SELECT id FROM squads WHERE slug = ? LIMIT 1`, [s.slug]
  ) as any[];
  if ((existing as any[]).length > 0) {
    await conn.execute(
      `UPDATE squads SET name=?, description=?, missionType=?, agents=?, tags=?, use_cases=?,
       workspace=?, methodology=?, output_formats=?, required_integrations=?, token=?, showcases=?,
       is_active=1, updated_at=NOW() WHERE slug=?`,
      [s.name, s.description, s.missionType, JSON.stringify(s.agents), JSON.stringify(s.tags),
       JSON.stringify(s.useCases), JSON.stringify(s.workspace), s.methodology,
       JSON.stringify(s.outputFormats), JSON.stringify(s.requiredIntegrations), s.token,
       JSON.stringify(s.showcases), s.slug]
    );
    console.log(`[seed-slogan] Squad '${s.slug}': updated`);
  } else {
    await conn.execute(
      `INSERT INTO squads (slug,name,description,industry_key,missionType,agents,tags,use_cases,
       workspace,methodology,output_formats,required_integrations,token,showcases,is_active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
      [s.slug, s.name, s.description, s.industryKey, s.missionType,
       JSON.stringify(s.agents), JSON.stringify(s.tags), JSON.stringify(s.useCases),
       JSON.stringify(s.workspace), s.methodology, JSON.stringify(s.outputFormats),
       JSON.stringify(s.requiredIntegrations), s.token, JSON.stringify(s.showcases)]
    );
    const [newRow] = await conn.execute(
      `SELECT id FROM squads WHERE slug = ? LIMIT 1`, [s.slug]
    ) as any[];
    console.log(`[seed-slogan] Squad '${s.slug}' inserted with id=${(newRow as any[])[0]?.id}`);
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
    console.log(`[seed-slogan] Workflow '${w.missionType}': updated`);
  } else {
    await conn.execute(
      `INSERT INTO squad_workflow_templates (taskType,missionType,name,description,steps,isActive,createdAt) VALUES (?,?,?,?,?,1,NOW())`,
      [w.missionType, w.missionType, w.name, w.description, JSON.stringify(w.steps)]
    );
    console.log(`[seed-slogan] Workflow '${w.missionType}': inserted`);
  }
}

async function main() {
  // Slogan squad recommender regex reference (for getRecommendedSquads):
  //   /slogan|tagline|標語|祈使句|imperative|descriptive.value|superlative|promise|
  //    problem.solution|emotional.stor|mission.declar|provocative|storybrand|
  //    sensory.wordplay|brand.slogan|just.do.it|got.milk|priceless/i

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
    console.log("[seed-slogan] Connected to mos_db. Running slogan squad seeds…");

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
    console.log("[seed-slogan] squad_workflow_templates: ready");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS squads (
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
    console.log("[seed-slogan] squads: ready");

    // ── Schema migrations (idempotent, wrapped in try/catch) ─────────────────────
    console.log("[seed-slogan] Running schema migrations…");
    const migrations = [
      `ALTER TABLE squads CHANGE COLUMN members agents LONGTEXT NULL`,
      `ALTER TABLE squads CHANGE COLUMN taskType missionType VARCHAR(100) NULL`,
      `ALTER TABLE squads ADD COLUMN workspace             LONGTEXT NULL`,
      `ALTER TABLE squads ADD COLUMN methodology           VARCHAR(100) NULL`,
      `ALTER TABLE squads ADD COLUMN output_formats        LONGTEXT NULL`,
      `ALTER TABLE squads ADD COLUMN required_integrations LONGTEXT NULL`,
      `ALTER TABLE squads ADD COLUMN token                 INT NOT NULL DEFAULT 0`,
      `ALTER TABLE squads ADD COLUMN showcases             LONGTEXT NULL`,
      `ALTER TABLE squad_workflow_templates ADD COLUMN missionType VARCHAR(100) NULL`,
      `UPDATE squad_workflow_templates SET missionType = taskType WHERE missionType IS NULL`,
    ];
    for (const m of migrations) {
      try { await conn.execute(m); } catch (_) { /* already applied */ }
    }
    console.log("[seed-slogan] Schema migrations: done");

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. 祈使句法標語小組 (sowork-slogan-imperative)
    // ─────────────────────────────────────────────────────────────────────────────
    {
      const slug     = "sowork-slogan-imperative";
      const taskType = "slogan-imperative";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["cmo", "brand-strategy", "tagline"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-dna", "brand", "positioning"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["consumer", "customer-research", "consumer-insights"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "copy", "content"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["analytics", "data-analysis", "testing"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "squad_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "consumer_researcher",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "copywriter",           order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "testing_specialist",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "祈使句法標語生成流程（Imperative Method）",
        description: "嚴格遵循祈使句法七步驟：品牌核心動詞探索 → 受眾行為動機分析 → 祈使句結構設計 → 節奏音韻測試 → 語氣強度校準 → 跨文化適應性檢查 → 最終篩選交付 Top 5 推薦標語。",
        steps: [
          {
            step: 1,
            title: "Squad Lead Intake：祈使句法 Brief",
            description: "Squad Lead 收集品牌資訊、目標受眾、品牌個性與期望語氣，評估祈使句法適用性，確認任務範疇後 brief 成員。",
            owner: "squad_lead",
            output: "方法論 Brief",
            duration_hint: "10 min",
          },
          {
            step: 2,
            title: "品牌核心動詞探索",
            description: "萃取品牌使命/價值中的動詞，建立動詞庫（10+ 個），分類高/中/低能量層級，找出最能代表品牌驅動力的行動詞彙。",
            owner: "brand_analyst",
            output: "品牌動詞庫",
            duration_hint: "15 min",
            prompts: [
              "品牌使命中出現哪些動作詞？",
              "品牌想要驅動什麼行為？",
              "哪些動詞最能代表品牌能量？",
            ],
          },
          {
            step: 3,
            title: "受眾行為動機分析",
            description: "映射目標受眾的渴望行動與情緒觸發因子，找出能激發即時行動的情緒切入點。",
            owner: "consumer_researcher",
            output: "受眾動機報告",
            duration_hint: "15 min",
            prompts: [
              "受眾夢想做什麼？",
              "什麼情緒驅動他們行動？",
              "他們會用什麼動詞描述理想自我？",
            ],
          },
          {
            step: 4,
            title: "祈使句結構設計",
            description: "使用四種句型模板生成 20+ 候選標語：[動詞]、[動詞+受詞]、[副詞+動詞]、[動詞+隱喻]。現在式、主動語態，禁止放入品牌名稱。",
            owner: "copywriter",
            output: "20+ 候選標語清單",
            duration_hint: "20 min",
            prompts: [
              "每種句型至少 5 個候選",
              "禁止放入品牌名稱",
              "現在式、主動語態",
            ],
          },
          {
            step: 5,
            title: "節奏與音韻測試",
            description: "測試每個候選的音節數（理想 2-5）、重音模式、語音記憶性，每個候選評分 1-10，淘汰低於 6 分的候選。",
            owner: "testing_specialist",
            output: "音韻評分表",
            duration_hint: "15 min",
            prompts: [
              "音節數是否在 2-5 之間？",
              "結尾是否落在重音？",
              "有頭韻或韻腳嗎？",
            ],
          },
          {
            step: 6,
            title: "語氣強度校準 + 跨文化檢查",
            description: "校準命令式/鼓勵式/啟發式語氣強度，確認符合品牌個性；同時檢查中日西翻譯適應性，標記文化禁忌風險。",
            owner: "testing_specialist",
            output: "語氣校準 + 文化風險報告",
            duration_hint: "15 min",
            prompts: [
              "語氣是否符合品牌個性？",
              "翻譯成中文/日文/西文後意思是否保留？",
              "是否有任何文化禁忌？",
            ],
          },
          {
            step: 7,
            title: "Squad Lead QA + 最終交付",
            description: "Squad Lead 整合所有評分，Top 5 排序附理由，輸出標語策略報告，含各標語的部署建議與使用情境說明。",
            owner: "squad_lead",
            output: "祈使句法標語策略報告",
            duration_hint: "15 min",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "祈使句法標語小組",
        description: "嚴格遵循祈使句法（Imperative Method）的七步驟標語生成流程。從品牌核心動詞探索、受眾行為動機分析、祈使句結構設計（四種句型模板）、節奏音韻測試、語氣強度校準、跨文化適應性檢查到最終篩選，產出 20+ 候選並交付 Top 5 推薦標語。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-slogan"],
        methodology: "imperative",
        agents: members,
        tags: ["slogan", "tagline", "imperative", "action", "verb", "command", "nike", "just-do-it", "brand-voice", "標語", "祈使句"],
        useCases: [
          "需要動詞開頭、命令式語氣的品牌標語",
          "運動/健身/科技品牌的行動號召標語",
          "品牌重定位需要強力行動標語",
          "新品上市需要一句話喚起行動力",
        ],
        outputFormats: ["PDF 標語策略報告", "Google Slides 標語提案簡報", "品牌標語使用指南"],
        requiredIntegrations: ["google-analytics", "brand-tracking"],
        token: 80000,
        showcases: [
          {
            company: "Nike",
            description: "Wieden+Kennedy 1988 年為 Nike 創造祈使句法標語 'Just Do It'，動詞開頭、命令式語氣，簡潔有力",
            result: "Nike 營收從 $877M 成長至 $9.2B（10年內）",
            source: "https://hbr.org/2019/01/how-nike-turned-a-campaign-into-a-global-cultural-movement",
          },
        ],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. 描述價值法標語小組 (sowork-slogan-descriptive-value)
    // ─────────────────────────────────────────────────────────────────────────────
    {
      const slug     = "sowork-slogan-descriptive-value";
      const taskType = "slogan-descriptive-value";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["cmo", "brand-strategy", "tagline"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-dna", "brand", "positioning"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["consumer", "customer-research", "consumer-insights"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "copy", "content"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["analytics", "data-analysis", "testing"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "squad_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "consumer_researcher",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "copywriter",           order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "testing_specialist",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "描述價值法標語生成流程（Descriptive Value Method）",
        description: "嚴格遵循描述價值法七步驟：核心價值主張萃取 → 價值量化框架 → 描述句型生成 → 清晰度測試 → 差異化驗證 → 雙關文字遊戲加分 → 最終輸出。",
        steps: [
          {
            step: 1,
            title: "Squad Lead Intake：描述價值法 Brief",
            description: "Squad Lead 收集品牌資訊、核心功能利益、目標受眾，確認描述價值法適用性，brief 成員。",
            owner: "squad_lead",
            output: "方法論 Brief",
            duration_hint: "10 min",
          },
          {
            step: 2,
            title: "核心價值主張萃取",
            description: "識別品牌 Top 3 功能利益，按受眾感知重要性排序，找出最能快速傳達品牌價值的核心主張。",
            owner: "brand_analyst",
            output: "核心價值主張清單",
            duration_hint: "15 min",
            prompts: [
              "品牌最強的功能利益是什麼？",
              "顧客為什麼選擇這個品牌而非競品？",
              "用數字量化利益",
            ],
          },
          {
            step: 3,
            title: "價值量化框架",
            description: "量化每個利益：時間/金錢/效率等維度，建立可衡量的價值描述，為後續文案提供具體數字支撐。",
            owner: "consumer_researcher",
            output: "價值量化表",
            duration_hint: "15 min",
            prompts: [
              "省多少時間？省多少錢？",
              "效率提升多少？",
              "有哪些具體數字？",
            ],
          },
          {
            step: 4,
            title: "描述句型生成",
            description: "使用三種句型生成 20+ 候選標語：[價值陳述]、[價值+價值 平行結構]、[數據+結果]。探索雙關機會（如 'Shave Time. Shave Money.'）。",
            owner: "copywriter",
            output: "20+ 候選標語清單",
            duration_hint: "20 min",
            prompts: [
              "每種句型至少 5 個候選",
              "是否有雙關機會（如 Shave Time = 刮鬍+省時）？",
              "受眾 3 秒內能理解嗎？",
            ],
          },
          {
            step: 5,
            title: "清晰度測試",
            description: "模擬 3 個 Persona 的理解測試，評分理解速度 1-10，確保每個候選在 3 秒內能被目標受眾理解。",
            owner: "testing_specialist",
            output: "清晰度評分表",
            duration_hint: "15 min",
            prompts: [
              "三秒鐘內能理解價值嗎？",
              "是否比競品標語更清楚？",
              "是否可能被其他品牌使用？",
            ],
          },
          {
            step: 6,
            title: "差異化驗證 + 雙關加分",
            description: "比對前 5 競品標語，排除重疊或易混淆的候選；為具有雙關文字遊戲的候選加分，標記記憶點。",
            owner: "testing_specialist",
            output: "差異化驗證報告 + 雙關標記表",
            duration_hint: "15 min",
            prompts: [
              "競品是否已使用類似語言？",
              "雙關是否自然且不牽強？",
              "差異化主張是否唯一？",
            ],
          },
          {
            step: 7,
            title: "Squad Lead QA + 最終交付",
            description: "Squad Lead 整合評分，Top 5 排序附理由，輸出描述價值法標語策略報告，含各標語的使用場景建議。",
            owner: "squad_lead",
            output: "描述價值法標語策略報告",
            duration_hint: "15 min",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "描述價值法標語小組",
        description: "嚴格遵循描述價值法（Descriptive Value Method）的七步驟標語生成流程。從核心價值主張萃取、價值量化框架、描述句型生成（三種句型模板）、清晰度測試、差異化驗證、雙關文字遊戲加分到最終輸出。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-slogan"],
        methodology: "descriptive-value",
        agents: members,
        tags: ["slogan", "tagline", "value-proposition", "benefit", "descriptive", "dollar-shave-club", "functional", "標語", "價值"],
        useCases: [
          "強調產品功能優勢的品牌標語",
          "電商/SaaS 產品的價值主張標語",
          "需要讓受眾秒懂價值的品牌標語",
          "B2B 品牌需要理性訴求標語",
        ],
        outputFormats: ["PDF 標語策略報告", "Google Slides 標語提案簡報", "品牌標語使用指南"],
        requiredIntegrations: [],
        token: 85000,
        showcases: [
          {
            company: "Dollar Shave Club",
            description: "描述價值法標語 'Shave Time. Shave Money.'（雙關：刮鬍=省時省錢）",
            result: "病毒影片 48 小時內獲 12,000 訂單，品牌以 $1B 被 Unilever 收購",
            source: "https://www.businessinsider.com/dollar-shave-club-unilever-acquisition-2016-7",
          },
        ],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. 最高級宣稱法標語小組 (sowork-slogan-superlative)
    // ─────────────────────────────────────────────────────────────────────────────
    {
      const slug     = "sowork-slogan-superlative";
      const taskType = "slogan-superlative";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["cmo", "brand-strategy", "tagline"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-dna", "brand", "positioning"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["consumer", "customer-research", "consumer-insights"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "copy", "content"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["analytics", "data-analysis", "testing"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "squad_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "consumer_researcher",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "copywriter",           order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "testing_specialist",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "最高級宣稱法標語生成流程（Superlative Method）",
        description: "嚴格遵循最高級宣稱法七步驟：品類領導力盤點 → 最高級詞庫建構 → 宣稱合法性審查（FTC 標準）→ 權威感語調設計 → 品類框架設定 → 持久性評估 → 最終輸出。",
        steps: [
          {
            step: 1,
            title: "Squad Lead Intake：最高級宣稱法 Brief",
            description: "Squad Lead 收集品牌資訊、領導力主張、已知競品，確認最高級宣稱法適用性，brief 成員。",
            owner: "squad_lead",
            output: "方法論 Brief",
            duration_hint: "10 min",
          },
          {
            step: 2,
            title: "品類領導力盤點",
            description: "品牌在哪個屬性上客觀 #1？蒐集並整理支撐最高級宣稱的證據：獎項、專利、第三方測試結果、市佔率數據。",
            owner: "brand_analyst",
            output: "領導力證據清單",
            duration_hint: "20 min",
            prompts: [
              "品牌在哪方面可以證明是最好的？",
              "有什麼客觀證據支持？",
              "獎項/專利/第三方評測？",
            ],
          },
          {
            step: 3,
            title: "最高級詞庫建構",
            description: "建立 15+ 最高級模板詞庫：'The Ultimate...'、'The #1...'、'The World\\'s Most...'、'The Only...' 等，每種模板搭配品類名詞變體。",
            owner: "copywriter",
            output: "最高級詞庫 + 候選標語",
            duration_hint: "15 min",
            prompts: [
              "哪些最高級表達最有權威感？",
              "避免空洞的最高級（要有實證支撐）",
              "品類名詞的選擇如何影響感知？",
            ],
          },
          {
            step: 4,
            title: "宣稱合法性審查",
            description: "FTC/廣告法規檢查：puffery（主觀意見，合法）vs factual claim（可驗證事實，需免責聲明），評估每個候選的法律風險等級。",
            owner: "testing_specialist",
            output: "FTC 合規審查報告",
            duration_hint: "20 min",
            prompts: [
              "這是可驗證的事實還是主觀意見？",
              "是否需要免責聲明？",
              "競品是否會挑戰此宣稱？",
            ],
          },
          {
            step: 5,
            title: "權威感語調設計",
            description: "測試語調正式度：皇室/專家/自信/大膽四級，確認語調傳達權威而非傲慢，並與品牌個性匹配。",
            owner: "copywriter",
            output: "語調設計報告",
            duration_hint: "15 min",
            prompts: [
              "語調是否傳達權威而非傲慢？",
              "是否與品牌個性匹配？",
              "10年後是否仍成立？",
            ],
          },
          {
            step: 6,
            title: "品類框架設定 + 持久性評估",
            description: "定義競爭框架「Ultimate [品類] [名詞]」，評估品類框架的長期有效性，確認品牌能在此框架下持續 10 年以上。",
            owner: "brand_analyst",
            output: "品類框架文件 + 持久性評估",
            duration_hint: "15 min",
            prompts: [
              "品類框架是否夠精確且獨特？",
              "競品能輕易複製此框架嗎？",
              "品牌能長期維護此宣稱嗎？",
            ],
          },
          {
            step: 7,
            title: "Squad Lead QA + 最終交付",
            description: "Squad Lead 整合評分，Top 5 排序附法律風險等級，輸出含 FTC 合規說明的最高級宣稱法標語策略報告。",
            owner: "squad_lead",
            output: "最高級宣稱法標語策略報告",
            duration_hint: "15 min",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "最高級宣稱法標語小組",
        description: "嚴格遵循最高級宣稱法（Superlative Method）的七步驟標語生成流程。從品類領導力盤點、最高級詞庫建構、宣稱合法性審查（FTC 標準）、權威感語調設計、品類框架設定、持久性評估到最終輸出。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-slogan"],
        methodology: "superlative",
        agents: members,
        tags: ["slogan", "tagline", "superlative", "ultimate", "best", "premium", "bmw", "authority", "標語", "最高級"],
        useCases: [
          "高端/奢侈品牌的權威宣稱標語",
          "市場領導者需要宣告品類領導地位",
          "品牌需要「The #1」類型的定位標語",
          "需要 FTC 合規審查的宣稱標語",
        ],
        outputFormats: ["PDF 標語策略報告", "Google Slides 標語提案簡報", "品牌標語使用指南"],
        requiredIntegrations: [],
        token: 90000,
        showcases: [
          {
            company: "BMW",
            description: "最高級宣稱法標語 'The Ultimate Driving Machine' (1975)，明確宣告駕駛體驗領導地位",
            result: "BMW 成為全球領先的豪華汽車品牌，品牌價值持續 50 年",
            source: "https://www.bmw.com/en/automotive-life/the-ultimate-driving-machine.html",
          },
        ],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. 對你的承諾法標語小組 (sowork-slogan-promise)
    // ─────────────────────────────────────────────────────────────────────────────
    {
      const slug     = "sowork-slogan-promise";
      const taskType = "slogan-promise";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["cmo", "brand-strategy", "tagline"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-dna", "brand", "positioning"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["consumer", "customer-research", "consumer-insights"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "copy", "content"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["analytics", "data-analysis", "testing"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "squad_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "consumer_researcher",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "copywriter",           order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "testing_specialist",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "對你的承諾法標語生成流程（Promise to You Method）",
        description: "嚴格遵循承諾法七步驟：受眾深層需求挖掘 → 品牌承諾定義 → 承諾句型生成（第二人稱 'you' 句式）→ 情感共鳴測試 → 真誠度校準 → 包容性審查 → 最終輸出。",
        steps: [
          {
            step: 1,
            title: "Squad Lead Intake：承諾法 Brief",
            description: "Squad Lead 收集品牌資訊、目標受眾情感需求、品牌承諾範疇，確認承諾法適用性，brief 成員。",
            owner: "squad_lead",
            output: "方法論 Brief",
            duration_hint: "10 min",
          },
          {
            step: 2,
            title: "受眾深層需求挖掘",
            description: "Persona 深潛：挖掘目標受眾的秘密渴望、不安全感、情感需求層次（馬斯洛階層定位），找出品牌能回應的深層情感痛點。",
            owner: "consumer_researcher",
            output: "受眾情感需求報告",
            duration_hint: "20 min",
            prompts: [
              "受眾秘密渴望什麼？",
              "品牌解決什麼不安全感？",
              "情感需求在馬斯洛哪一層？",
            ],
          },
          {
            step: 3,
            title: "品牌承諾定義",
            description: "定義唯一且可信的品牌承諾：必須是情感的（而非功能的）、可信的（品牌有能力兌現）、可持續的（長期承諾）。",
            owner: "brand_analyst",
            output: "品牌承諾聲明",
            duration_hint: "15 min",
            prompts: [
              "品牌能許什麼承諾？",
              "這個承諾是情感的還是功能的？",
              "品牌能否長期兌現？",
            ],
          },
          {
            step: 4,
            title: "承諾句型生成",
            description: "使用至少四種第二人稱句型模板生成 20+ 候選：'Because you...'、'You deserve...'、'We promise...'、'For you who...'",
            owner: "copywriter",
            output: "20+ 候選標語清單",
            duration_hint: "20 min",
            prompts: [
              "必須使用第二人稱 'you/你'",
              "至少 4 種句型模板",
              "情感而非功能",
            ],
          },
          {
            step: 5,
            title: "情感共鳴測試",
            description: "測試每個候選在五個情感維度上的評分（1-10）：empowerment（賦能感）、comfort（安慰感）、aspiration（渴望感）、belonging（歸屬感）、self-worth（自我價值感）。",
            owner: "testing_specialist",
            output: "情感共鳴五維度評分表",
            duration_hint: "15 min",
            prompts: [
              "哪個情感維度評分最高？",
              "是否有多個維度同時高分？",
              "最弱的維度是否影響整體共鳴？",
            ],
          },
          {
            step: 6,
            title: "真誠度校準 + 包容性審查",
            description: "排除空洞或操控性語句（聽起來像廣告而非真心話）；確保跨性別/文化/族群/年齡的包容性，確認所有人都能感受到被尊重。",
            owner: "testing_specialist",
            output: "真誠度報告 + 包容性審查清單",
            duration_hint: "15 min",
            prompts: [
              "聽起來真誠還是虛假？",
              "是否排除了任何群體？",
              "所有人都能感受到被尊重嗎？",
            ],
          },
          {
            step: 7,
            title: "Squad Lead QA + 最終交付",
            description: "Squad Lead 整合評分，Top 5 排序附情感共鳴分析，輸出承諾法標語策略報告，含各標語的品牌承諾落地建議。",
            owner: "squad_lead",
            output: "承諾法標語策略報告",
            duration_hint: "15 min",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "對你的承諾法標語小組",
        description: "嚴格遵循對你的承諾法（Promise to You Method）的七步驟標語生成流程。從受眾深層需求挖掘、品牌承諾定義、承諾句型生成（第二人稱 'you' 句式）、情感共鳴測試、真誠度校準、包容性審查到最終輸出。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-slogan"],
        methodology: "promise",
        agents: members,
        tags: ["slogan", "tagline", "promise", "you", "empowerment", "emotional", "loreal", "self-worth", "標語", "承諾"],
        useCases: [
          "美妝/保養/健康品牌的情感承諾標語",
          "品牌需要與消費者建立情感連結",
          "強調自我價值的品牌定位標語",
          "需要包容性審查的全球品牌標語",
        ],
        outputFormats: ["PDF 標語策略報告", "Google Slides 標語提案簡報", "品牌標語使用指南"],
        requiredIntegrations: [],
        token: 80000,
        showcases: [
          {
            company: "L'Oréal",
            description: "承諾法標語 'Because You\\'re Worth It' (1973)，直接對話消費者自我價值感",
            result: "L'Oréal 成為全球最大化妝品公司，年營收 $38B+",
            source: "https://www.loreal.com/en/articles/group/because-youre-worth-it/",
          },
        ],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. 問題解決法標語小組 (sowork-slogan-problem-solution)
    // ─────────────────────────────────────────────────────────────────────────────
    {
      const slug     = "sowork-slogan-problem-solution";
      const taskType = "slogan-problem-solution";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["cmo", "brand-strategy", "tagline"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-dna", "brand", "positioning"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["consumer", "customer-research", "consumer-insights"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "copy", "content"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["analytics", "data-analysis", "testing"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "squad_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "consumer_researcher",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "copywriter",           order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "testing_specialist",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "問題解決法標語生成流程（Problem→Solution Method）",
        description: "嚴格遵循問題解決法七步驟：痛點地圖繪製 → 解決方案框架 → 問題→解決句型生成 → 緊迫感與希望感平衡 → 簡潔度壓力測試（≤7字）→ 行動觸發力評估 → 最終輸出。",
        steps: [
          {
            step: 1,
            title: "Squad Lead Intake：問題解決法 Brief",
            description: "Squad Lead 收集品牌資訊、目標受眾痛點、解決方案核心，確認問題解決法適用性，brief 成員。",
            owner: "squad_lead",
            output: "方法論 Brief",
            duration_hint: "10 min",
          },
          {
            step: 2,
            title: "痛點地圖繪製",
            description: "整理 Top 5 痛點（按嚴重度+頻率排序），使用受眾真實挫折語言（非行銷語言），建立痛點語言庫。",
            owner: "consumer_researcher",
            output: "痛點地圖 + 受眾語言庫",
            duration_hint: "20 min",
            prompts: [
              "受眾如何描述他們的困擾？",
              "哪個痛點最嚴重最頻繁？",
              "他們用什麼字眼表達挫折？",
            ],
          },
          {
            step: 3,
            title: "解決方案框架",
            description: "每個痛點→品牌解決方案的配對，建立 pain→solution map，確認每個解決方案的核心機制與差異化。",
            owner: "brand_analyst",
            output: "Pain→Solution Map",
            duration_hint: "15 min",
            prompts: [
              "品牌如何解決每個痛點？",
              "解決方案的核心機制是什麼？",
              "為什麼我們的解決方案比競品更好？",
            ],
          },
          {
            step: 4,
            title: "問題→解決句型生成",
            description: "使用四種句型生成 20+ 候選：[Problem? Solution.]、[Tired of X? Y.]、[Don't X, Y instead]、[X made simple]。每個字必須有價值，目標 7 個字以內。",
            owner: "copywriter",
            output: "20+ 候選標語清單",
            duration_hint: "20 min",
            prompts: [
              "每種句型至少 5 個候選",
              "7 個字以內",
              "每個字必須有價值",
            ],
          },
          {
            step: 5,
            title: "緊迫感與希望感平衡 + 簡潔度壓力測試",
            description: "評估每個候選的同理心/希望平衡（不能只有痛苦無出路）；進行 ≤7 字壓縮測試，強制壓縮找出最精煉版本。",
            owner: "testing_specialist",
            output: "平衡評分表 + 壓縮版本",
            duration_hint: "15 min",
            prompts: [
              "痛點有傳達同理心嗎？",
              "解決方案有傳達希望嗎？",
              "能壓縮到 7 個字以內嗎？",
            ],
          },
          {
            step: 6,
            title: "行動觸發力評估",
            description: "測試每個候選是否讓人想立即採取行動，CTA 強度評分 1-10，高於 7 分者列入 Top 候選。",
            owner: "testing_specialist",
            output: "行動觸發力評分表",
            duration_hint: "15 min",
            prompts: [
              "讀完後想立即行動嗎？",
              "CTA 強度夠嗎（目標 ≥7）？",
              "行動障礙是否已被移除？",
            ],
          },
          {
            step: 7,
            title: "Squad Lead QA + 最終交付",
            description: "Squad Lead 整合評分，Top 5 排序附痛點映射分析，輸出問題解決法標語策略報告。",
            owner: "squad_lead",
            output: "問題解決法標語策略報告",
            duration_hint: "15 min",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "問題解決法標語小組",
        description: "嚴格遵循問題解決法（Problem→Solution Method）的七步驟標語生成流程。從痛點地圖繪製（受眾挫折語言）、解決方案框架、問題→解決句型生成、緊迫感與希望感平衡、簡潔度壓力測試（≤7字）、行動觸發力評估到最終輸出。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-slogan"],
        methodology: "problem-solution",
        agents: members,
        tags: ["slogan", "tagline", "problem-solution", "pain-point", "remedy", "headspace", "wellness", "標語", "問題解決"],
        useCases: [
          "健康/醫療/保健品牌的痛點解決標語",
          "SaaS 工具解決特定問題的標語",
          "品牌需要同時傳達同理心與解決方案",
          "新創品牌需要快速溝通價值的標語",
        ],
        outputFormats: ["PDF 標語策略報告", "Google Slides 標語提案簡報", "品牌標語使用指南"],
        requiredIntegrations: [],
        token: 85000,
        showcases: [
          {
            company: "Headspace",
            description: "問題解決法標語 'Treat Your Head Right'（直接對應心理健康痛點）",
            result: "成長至 $100M+ ARR，7000 萬+ 下載量",
            source: "https://www.headspace.com/about-us",
          },
        ],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 6. 情緒敘事法標語小組 (sowork-slogan-emotional-story)
    // ─────────────────────────────────────────────────────────────────────────────
    {
      const slug     = "sowork-slogan-emotional-story";
      const taskType = "slogan-emotional-story";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["cmo", "brand-strategy", "tagline"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-dna", "brand", "positioning"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["consumer", "customer-research", "consumer-insights"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "copy", "content"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["analytics", "data-analysis", "testing"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "squad_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "consumer_researcher",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "copywriter",           order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "testing_specialist",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "情緒敘事法標語生成流程（Emotional Storytelling Method）",
        description: "嚴格遵循情緒敘事法（Mastercard Priceless 模式）七步驟：情緒地圖建構（購買前/中/後三階段）→ 敘事弧線設計（三幕結構）→ 情緒觸發詞庫建構 → 標語句型生成 → 情緒強度校準（7-8分甜蜜區）→ 故事延展性測試 → 最終輸出。",
        steps: [
          {
            step: 1,
            title: "Squad Lead Intake：情緒敘事法 Brief",
            description: "Squad Lead 收集品牌資訊、目標受眾情感旅程、品牌故事素材，確認情緒敘事法適用性，brief 成員。",
            owner: "squad_lead",
            output: "方法論 Brief",
            duration_hint: "10 min",
          },
          {
            step: 2,
            title: "情緒地圖建構",
            description: "繪製購買前/使用中/使用後三階段情緒旅程，識別每個階段的高峰情緒時刻（Peak Emotional Moment），找出最具共鳴的情感切入點。",
            owner: "consumer_researcher",
            output: "三階段情緒地圖",
            duration_hint: "20 min",
            prompts: [
              "購買前的情緒是什麼？",
              "使用中最強烈的情緒時刻是？",
              "使用後留下什麼情感印記？",
            ],
          },
          {
            step: 3,
            title: "敘事弧線設計",
            description: "設計三幕結構：日常現實（可計量的代價）→ 價值升級（過渡時刻）→ 無價時刻（情緒高峰）。同時建立 50-100 字的微型敘事腳本作為標語背景故事。",
            owner: "brand_analyst",
            output: "三幕敘事弧線 + 微型故事腳本",
            duration_hint: "15 min",
            prompts: [
              "從可計量到不可計量的過渡",
              "高潮時刻的情緒功能是什麼？",
              "50-100字的微型敘事腳本",
            ],
          },
          {
            step: 4,
            title: "情緒觸發詞庫 + 標語句型生成",
            description: "建立六大情緒類別詞庫（喜悅/懷舊/驚奇/歸屬/愛/自豪），每類 10+ 個情緒觸發詞；使用詞庫生成 20+ 候選標語。",
            owner: "copywriter",
            output: "情緒詞庫 + 20+ 候選標語清單",
            duration_hint: "25 min",
            prompts: [
              "六大情緒各選最強觸發詞",
              "標語能在 3 秒內引發情緒反應嗎？",
              "是否暗示一個可以延伸的故事？",
            ],
          },
          {
            step: 5,
            title: "情緒強度校準",
            description: "每個候選評分 1-10，目標甜蜜區 7-8 分（低於 5 = 忘記，高於 9 = 感覺被操控）。7-8 分候選進入 Top 候選池。",
            owner: "testing_specialist",
            output: "情緒強度評分表",
            duration_hint: "15 min",
            prompts: [
              "7-8 分才是甜蜜區",
              "低於 5 分直接淘汰",
              "高於 9 分需要調降",
            ],
          },
          {
            step: 6,
            title: "故事延展性測試",
            description: "每個甜蜜區候選生成 3 個活動執行概念（video/print/social），驗證標語能否衍生出長達 25 年的系列活動（Priceless 模式）。",
            owner: "copywriter",
            output: "故事延展性報告（每個候選 3 個活動概念）",
            duration_hint: "20 min",
            prompts: [
              "這個標語能延伸出系列活動嗎？",
              "25 年後還能持續使用嗎？",
              "能跨媒體執行嗎？",
            ],
          },
          {
            step: 7,
            title: "Squad Lead QA + 最終交付",
            description: "Squad Lead 整合評分，Top 5 排序附情緒弧線圖，輸出含活動執行概念的情緒敘事法標語策略報告。",
            owner: "squad_lead",
            output: "情緒敘事法標語策略報告",
            duration_hint: "15 min",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "情緒敘事法標語小組",
        description: "嚴格遵循情緒敘事法（Emotional Storytelling Method / Mastercard Priceless）的七步驟標語生成流程。從情緒地圖建構（購買前/中/後三階段）、敘事弧線設計（三幕結構）、情緒觸發詞庫建構（六大情緒類別）、標語句型生成、情緒強度校準（7-8分甜蜜區）、故事延展性測試到最終輸出。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-slogan"],
        methodology: "emotional-storytelling",
        agents: members,
        tags: ["slogan", "tagline", "emotional", "storytelling", "priceless", "mastercard", "narrative", "campaign", "標語", "情緒"],
        useCases: [
          "金融/保險品牌的情感連結標語",
          "品牌需要長期可延展的行銷活動標語",
          "需要引發深層共鳴的品牌標語",
          "希望標語能衍生整個系列活動的品牌",
        ],
        outputFormats: ["PDF 標語策略報告", "Google Slides 標語提案簡報", "品牌標語使用指南"],
        requiredIntegrations: [],
        token: 95000,
        showcases: [
          {
            company: "Mastercard",
            description: "情緒敘事法標語 'Priceless' (McCann Erickson, 1997)，三幕結構：日常代價→無價時刻",
            result: "運行 25+ 年覆蓋 100+ 國家，品牌感知超越 Visa",
            source: "https://www.mastercard.com/news/perspectives/featured-topics/priceless/",
          },
        ],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 7. 使命宣言法標語小組 (sowork-slogan-mission)
    // ─────────────────────────────────────────────────────────────────────────────
    {
      const slug     = "sowork-slogan-mission";
      const taskType = "slogan-mission";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["cmo", "brand-strategy", "tagline"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-dna", "brand", "positioning"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["consumer", "customer-research", "consumer-insights"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "copy", "content"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["analytics", "data-analysis", "testing"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "squad_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "consumer_researcher",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "copywriter",           order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "testing_specialist",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "使命宣言法標語生成流程（Mission Declaration Method）",
        description: "嚴格遵循使命宣言法七步驟：品牌使命深挖（超越利潤）→ 使命量化框架 → 使命宣言句型生成 → 真實性驗證（防止 purpose-washing）→ 行動號召力測試 → 利害關係人對齊 → 最終輸出。",
        steps: [
          {
            step: 1,
            title: "Squad Lead Intake：使命宣言法 Brief",
            description: "Squad Lead 收集品牌資訊、社會使命、已有 CSR 活動，確認使命宣言法適用性，brief 成員。",
            owner: "squad_lead",
            output: "方法論 Brief",
            duration_hint: "10 min",
          },
          {
            step: 2,
            title: "品牌使命深挖",
            description: "挖掘品牌超越利潤的社會/環境/轉型使命，用五個「為什麼」找出品牌存在的終極意義，確立真正的社會影響力主張。",
            owner: "brand_analyst",
            output: "品牌使命深挖報告",
            duration_hint: "20 min",
            prompts: [
              "品牌存在的終極意義是什麼？",
              "想改變世界的什麼？",
              "利潤之外的承諾？",
            ],
          },
          {
            step: 3,
            title: "使命量化框架",
            description: "將使命可衡量化：每次交易產生多少影響？建立具體的量化單位（'One for One'、'1% for the Planet'、'每 X = Y' 等），讓使命成為可追蹤的承諾。",
            owner: "consumer_researcher",
            output: "使命量化框架",
            duration_hint: "15 min",
            prompts: [
              "影響力的計量單位是什麼？",
              "每次交易產生多少影響？",
              "能用數字表達嗎？",
            ],
          },
          {
            step: 4,
            title: "使命宣言句型生成",
            description: "使用三種句型生成 20+ 候選：[Action] for [Impact]、[Number] + [Promise]、[Every X = Y]。每個候選必須同時傳達行動號召與社會影響。",
            owner: "copywriter",
            output: "20+ 候選標語清單",
            duration_hint: "20 min",
            prompts: [
              "每種句型至少 6 個候選",
              "量化影響力是否清楚？",
              "聽起來像運動還是廣告？",
            ],
          },
          {
            step: 5,
            title: "真實性驗證",
            description: "品牌是否真的在執行這個使命？交叉驗證營運事實（供應鏈/捐款記錄/ESG 報告），標記 purpose-washing 風險，過濾無法被驗證的宣稱。",
            owner: "testing_specialist",
            output: "真實性驗證報告 + Purpose-Washing 風險清單",
            duration_hint: "20 min",
            prompts: [
              "品牌實際行動是否支持此宣稱？",
              "是否有可驗證的影響數據？",
              "有 purpose-washing 風險嗎？",
            ],
          },
          {
            step: 6,
            title: "行動號召力 + 利害關係人對齊",
            description: "評估使命標語的運動潛力（能否讓消費者加入運動而非只購買）；確認客戶/員工/投資人/社區四方利害關係人都能認同此使命宣言。",
            owner: "consumer_researcher",
            output: "運動潛力評分 + 利害關係人對齊報告",
            duration_hint: "15 min",
            prompts: [
              "消費者會加入這個運動嗎？",
              "員工是否對此使命感到驕傲？",
              "投資人認為此使命可持續嗎？",
            ],
          },
          {
            step: 7,
            title: "Squad Lead QA + 最終交付",
            description: "Squad Lead 整合評分，Top 5 排序附 CSR 整合建議，輸出使命宣言法標語策略報告，含使命落地執行路線圖。",
            owner: "squad_lead",
            output: "使命宣言法標語策略報告",
            duration_hint: "15 min",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "使命宣言法標語小組",
        description: "嚴格遵循使命宣言法（Mission Declaration Method）的七步驟標語生成流程。從品牌使命深挖（超越利潤的社會使命）、使命量化框架（可衡量的影響力單位）、使命宣言句型生成、真實性驗證（防止 purpose-washing）、行動號召力測試、利害關係人對齊到最終輸出。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-slogan"],
        methodology: "mission-declaration",
        agents: members,
        tags: ["slogan", "tagline", "mission", "purpose", "social-impact", "toms", "sustainability", "CSR", "標語", "使命"],
        useCases: [
          "社會企業的使命驅動標語",
          "ESG/永續品牌的承諾標語",
          "需要傳達品牌社會影響力的標語",
          "B-Corp 或非營利組織的使命標語",
        ],
        outputFormats: ["PDF 標語策略報告", "Google Slides 標語提案簡報", "品牌標語使用指南"],
        requiredIntegrations: [],
        token: 80000,
        showcases: [
          {
            company: "TOMS",
            description: "使命宣言法標語 'One for One'（每賣一雙捐一雙），量化使命簡潔有力",
            result: "捐出 1 億+ 雙鞋，品牌價值達 $625M",
            source: "https://www.toms.com/us/impact.html",
          },
        ],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 8. 挑釁提問法標語小組 (sowork-slogan-provocative)
    // ─────────────────────────────────────────────────────────────────────────────
    {
      const slug     = "sowork-slogan-provocative";
      const taskType = "slogan-provocative";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["cmo", "brand-strategy", "tagline"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-dna", "brand", "positioning"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["consumer", "customer-research", "consumer-insights"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "copy", "content"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["analytics", "data-analysis", "testing"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "squad_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "consumer_researcher",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "copywriter",           order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "testing_specialist",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "挑釁提問法標語生成流程（Provocative/Interrogative Method）",
        description: "嚴格遵循挑釁提問法七步驟：缺席情境設計（產品不在時的失落感）→ 反直覺假設生成 → 提問句型生成 → 認知失調測試（pause factor）→ 回答暗示設計 → 社群傳播力評估 → 最終輸出。",
        steps: [
          {
            step: 1,
            title: "Squad Lead Intake：挑釁提問法 Brief",
            description: "Squad Lead 收集品牌資訊、目標受眾日常場景、品牌個性，確認挑釁提問法適用性，brief 成員。",
            owner: "squad_lead",
            output: "方法論 Brief",
            duration_hint: "10 min",
          },
          {
            step: 2,
            title: "缺席情境設計",
            description: "設計產品不在時的 deprivation scenario（剝奪情境）：什麼場景下最需要它？失去它會怎樣？讓受眾預先感受失落，建立需求急迫性。",
            owner: "consumer_researcher",
            output: "缺席情境報告",
            duration_hint: "15 min",
            prompts: [
              "沒有這個產品會怎樣？",
              "什麼場景下最需要它？",
              "失去它的痛苦是什麼？",
            ],
          },
          {
            step: 3,
            title: "反直覺假設生成",
            description: "挑戰品類慣例，翻轉行業常識假設，生成 10+ 個反直覺觀點，找出最能讓目標受眾停下來思考的認知衝突。",
            owner: "brand_analyst",
            output: "反直覺假設清單",
            duration_hint: "15 min",
            prompts: [
              "這個品類的常識是什麼？",
              "翻轉它會怎樣？",
              "什麼假設可以被挑戰？",
            ],
          },
          {
            step: 4,
            title: "提問句型生成",
            description: "使用四種提問句型生成 20+ 候選：'Got [Product]?'、'What if...?'、'Who says...?'、'Why...?'。問題本身要讓人停下來，答案要自然指向品牌。",
            owner: "copywriter",
            output: "20+ 候選提問標語清單",
            duration_hint: "20 min",
            prompts: [
              "每種句型至少 5 個候選",
              "問題是否讓人停下來思考？",
              "問題的隱含答案是否指向品牌？",
            ],
          },
          {
            step: 5,
            title: "認知失調測試",
            description: "每個候選評分 pause factor 1-10（讀者是否會停下來思考？），同時評估冒犯風險：太溫和（<5）淘汰，太冒犯（>8）修改後再測。",
            owner: "testing_specialist",
            output: "Pause Factor 評分表",
            duration_hint: "15 min",
            prompts: [
              "讀者會停下來嗎？",
              "認知失調強度夠嗎？",
              "會不會太冒犯？",
            ],
          },
          {
            step: 6,
            title: "回答暗示設計 + 社群傳播力",
            description: "確認問題的隱含答案自然導向品牌（不需要解釋）；評估病毒/迷因潛力（1-10），高於 7 分者列為 Top 候選。",
            owner: "testing_specialist",
            output: "回答暗示分析 + 傳播力評分表",
            duration_hint: "15 min",
            prompts: [
              "答案是否自然導向品牌？",
              "能成為社群迷因嗎？",
              "傳播力 1-10 幾分？",
            ],
          },
          {
            step: 7,
            title: "Squad Lead QA + 最終交付",
            description: "Squad Lead 整合評分，Top 5 排序附媒體激活計畫，輸出挑釁提問法標語策略報告，含社群傳播執行建議。",
            owner: "squad_lead",
            output: "挑釁提問法標語策略報告",
            duration_hint: "15 min",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "挑釁提問法標語小組",
        description: "嚴格遵循挑釁提問法（Provocative/Interrogative Method）的七步驟標語生成流程。從缺席情境設計（產品不在時的失落感）、反直覺假設生成、提問句型生成、認知失調測試（pause factor）、回答暗示設計、社群傳播力評估到最終輸出。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-slogan"],
        methodology: "provocative-interrogative",
        agents: members,
        tags: ["slogan", "tagline", "provocative", "question", "interrogative", "got-milk", "viral", "meme", "標語", "提問"],
        useCases: [
          "需要引發討論的品牌標語",
          "社群行銷導向的病毒式標語",
          "品牌需要挑戰消費者認知的標語",
          "需要高傳播力（可成為迷因）的標語",
        ],
        outputFormats: ["PDF 標語策略報告", "Google Slides 標語提案簡報", "品牌標語使用指南"],
        requiredIntegrations: [],
        token: 85000,
        showcases: [
          {
            company: "California Milk Processor Board",
            description: "挑釁提問法標語 'Got Milk?' (Goodby Silverstein, 1993)，缺席情境引發共鳴",
            result: "逆轉加州牛奶消費 20 年下滑趨勢，成為史上最具辨識度的廣告之一",
            source: "https://www.gotmilk.com",
          },
        ],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 9. 英雄旅程法標語小組 (sowork-slogan-storybrand)
    // ─────────────────────────────────────────────────────────────────────────────
    {
      const slug     = "sowork-slogan-storybrand";
      const taskType = "slogan-storybrand";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["cmo", "brand-strategy", "tagline"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-dna", "brand", "positioning"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["consumer", "customer-research", "consumer-insights"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "copy", "content"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["analytics", "data-analysis", "testing"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "squad_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "consumer_researcher",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "copywriter",           order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "testing_specialist",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "英雄旅程法標語生成流程（StoryBrand One-Liner Method）",
        description: "嚴格遵循英雄旅程法（StoryBrand / Donald Miller）七步驟：英雄定義（客戶=英雄，品牌=嚮導）→ 嚮導定位（同理心+權威）→ 計畫呈現（三步驟）→ 行動號召設計 → One-Liner 公式（問題+解決+結果）→ 失敗與成功對比 → 最終輸出含完整 BrandScript。",
        steps: [
          {
            step: 1,
            title: "Squad Lead Intake：英雄旅程法 Brief",
            description: "Squad Lead 收集品牌資訊、目標客戶困境、品牌解決方案，確認 StoryBrand 方法論適用性，brief 成員。",
            owner: "squad_lead",
            output: "方法論 Brief",
            duration_hint: "10 min",
          },
          {
            step: 2,
            title: "英雄定義",
            description: "客戶=英雄（不是品牌），定義英雄的三層問題：外在問題（可見的挫折）、內在問題（情感挫折感）、哲學問題（什麼是不對的世界觀）。",
            owner: "consumer_researcher",
            output: "英雄三層問題定義書",
            duration_hint: "20 min",
            prompts: [
              "英雄（客戶）想要什麼？",
              "外在問題是什麼？",
              "內在挫折是什麼？哲學上什麼是不對的？",
            ],
          },
          {
            step: 3,
            title: "嚮導定位",
            description: "品牌=嚮導（不是英雄），展現兩種嚮導素質：同理心（我理解你的挫折）+ 權威（我有能力幫助你）。收集品牌的權威證明（成果/客戶數/年數）。",
            owner: "brand_analyst",
            output: "嚮導定位聲明",
            duration_hint: "15 min",
            prompts: [
              "品牌如何展現同理心？",
              "品牌的權威證明是什麼？",
              "客戶為什麼信任品牌？",
            ],
          },
          {
            step: 4,
            title: "計畫呈現 + 行動號召",
            description: "設計三步驟計畫（讓客戶感覺成功可行）+ 直接 CTA（購買/預約/試用）+ 過渡 CTA（下載/訂閱/了解更多）。",
            owner: "copywriter",
            output: "三步驟計畫 + CTA 組合",
            duration_hint: "20 min",
            prompts: [
              "三步驟計畫是什麼？",
              "直接 CTA 是什麼？",
              "過渡 CTA 是什麼？",
            ],
          },
          {
            step: 5,
            title: "One-Liner 公式生成",
            description: "將 BrandScript 精煉為一句話：[問題] + [解決] + [結果]。陌生人聽完後要想知道更多。生成 15+ 個 One-Liner 候選，每個不超過 25 字。",
            owner: "copywriter",
            output: "15+ One-Liner 候選清單",
            duration_hint: "20 min",
            prompts: [
              "問題是什麼→解決方案是什麼→成功結果是什麼？",
              "能在一句話內說完嗎？",
              "陌生人聽完會想知道更多嗎？",
            ],
          },
          {
            step: 6,
            title: "失敗與成功對比",
            description: "每個候選建立清晰的失敗/成功對比：不用品牌=什麼後果（恐懼/失去）？用了=什麼轉變（成功/理想生活）？對比越強，標語越有力。",
            owner: "testing_specialist",
            output: "失敗/成功對比分析表",
            duration_hint: "15 min",
            prompts: [
              "不行動的代價是什麼？",
              "成功後的轉變是什麼？",
              "對比是否夠強烈？",
            ],
          },
          {
            step: 7,
            title: "Squad Lead QA + 最終交付",
            description: "Squad Lead 整合評分，Top 5 One-Liner 排序，輸出含完整 BrandScript 與網站首頁 wireframe 建議的英雄旅程法 One-Liner 策略報告。",
            owner: "squad_lead",
            output: "英雄旅程法 One-Liner 策略報告",
            duration_hint: "15 min",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "英雄旅程法標語小組",
        description: "嚴格遵循英雄旅程法（StoryBrand One-Liner Method / Donald Miller）的七步驟標語生成流程。從英雄定義（客戶=英雄，品牌=嚮導）、嚮導定位（同理心+權威）、計畫呈現（三步驟）、行動號召設計、One-Liner 公式（問題+解決+結果）、失敗與成功對比到最終輸出含完整 BrandScript。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-slogan"],
        methodology: "storybrand-oneliner",
        agents: members,
        tags: ["slogan", "tagline", "storybrand", "hero-journey", "one-liner", "donald-miller", "brandscript", "narrative", "標語", "英雄旅程"],
        useCases: [
          "中小企業需要快速定位的 One-Liner",
          "需要完整 StoryBrand BrandScript 的品牌",
          "品牌網站首頁標語與訊息架構",
          "銷售團隊需要電梯簡報的一句話定位",
        ],
        outputFormats: ["PDF 標語策略報告", "Google Slides 標語提案簡報", "品牌標語使用指南"],
        requiredIntegrations: [],
        token: 90000,
        showcases: [
          {
            company: "StoryBrand",
            description: "英雄旅程法 One-Liner 公式，被 50 萬+ 企業採用，Donald Miller 著作方法論",
            result: "企業報告轉換率提升 2-5 倍，Donald Miller 著作登上 NYT 暢銷榜",
            source: "https://storybrand.com",
          },
        ],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 10. 感官雙關法標語小組 (sowork-slogan-sensory-wordplay)
    // ─────────────────────────────────────────────────────────────────────────────
    {
      const slug     = "sowork-slogan-sensory-wordplay";
      const taskType = "slogan-sensory-wordplay";
      const used: number[] = [];

      const leadId = await findAgent(conn, ["cmo", "brand-strategy", "tagline"], used);
      if (leadId) used.push(leadId);
      const m2 = await findAgent(conn, ["brand-dna", "brand", "positioning"], used);
      if (m2) used.push(m2);
      const m3 = await findAgent(conn, ["consumer", "customer-research", "consumer-insights"], used);
      if (m3) used.push(m3);
      const m4 = await findAgent(conn, ["copywriting", "copy", "content"], used);
      if (m4) used.push(m4);
      const m5 = await findAgent(conn, ["analytics", "data-analysis", "testing"], used);
      if (m5) used.push(m5);

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "squad_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "brand_analyst",        order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "consumer_researcher",  order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "copywriter",           order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "testing_specialist",   order: 5 },
      ].filter(Boolean);

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "感官雙關法標語生成流程（Sensory/Wordplay Method）",
        description: "嚴格遵循感官雙關法七步驟：感官體驗盤點（五感地圖）→ 感官動詞庫建構（每感官 10+ 動詞）→ 通感/聯覺設計（跨感官組合）→ 雙關語/文字遊戲生成 → 口語節奏分析（押韻/頭韻/諧音）→ 視覺化潛力評估 → 最終輸出。",
        steps: [
          {
            step: 1,
            title: "Squad Lead Intake：感官雙關法 Brief",
            description: "Squad Lead 收集品牌資訊、產品感官特性、目標受眾感官偏好，確認感官雙關法適用性，brief 成員。",
            owner: "squad_lead",
            output: "方法論 Brief",
            duration_hint: "10 min",
          },
          {
            step: 2,
            title: "感官體驗盤點",
            description: "繪製五感地圖（視覺/聽覺/嗅覺/味覺/觸覺），識別品牌的主導感官（最強）與最獨特感官時刻，找出可轉化為語言的感官記憶點。",
            owner: "consumer_researcher",
            output: "五感地圖",
            duration_hint: "15 min",
            prompts: [
              "產品的主導感官是什麼？",
              "哪個感官時刻最獨特？",
              "消費者會怎麼描述這個體驗？",
            ],
          },
          {
            step: 3,
            title: "感官動詞庫建構",
            description: "為每個相關感官建立 10+ 個動詞庫：味覺（savor/devour/taste/relish...）、觸覺（embrace/caress/feel...）、視覺（glow/sparkle/illuminate...）、聽覺（resonate/echo/harmonize...）、嗅覺（breathe/inhale/bloom...）。",
            owner: "copywriter",
            output: "感官動詞庫（每感官 10+ 動詞）",
            duration_hint: "15 min",
            prompts: [
              "味覺動詞有哪些？",
              "觸覺動詞有哪些？",
              "視覺動詞有哪些？",
            ],
          },
          {
            step: 4,
            title: "通感/聯覺設計 + 雙關語生成",
            description: "設計跨感官組合（通感/聯覺）：Taste + Sight = 'Taste the Rainbow'；同時生成雙關語/諧音/混合詞，確保每個候選都有至少一個「意義層次」。生成 20+ 候選。",
            owner: "copywriter",
            output: "20+ 候選標語清單（含通感設計說明）",
            duration_hint: "25 min",
            prompts: [
              "哪兩個感官可以交叉？",
              "有哪些雙關機會？",
              "頭韻/韻腳/諧音？",
            ],
          },
          {
            step: 5,
            title: "口語節奏分析",
            description: "分析每個候選的音樂性：節奏模式（抑揚格/揚抑格）、頭韻（Alliteration）、元韻（Assonance）、尾韻（End Rhyme）。音樂性評分 1-10，目標 ≥7 分。",
            owner: "testing_specialist",
            output: "音韻分析評分表",
            duration_hint: "15 min",
            prompts: [
              "音樂性是否 ≥7？",
              "唸出來順口嗎？",
              "有韻律感嗎？",
            ],
          },
          {
            step: 6,
            title: "視覺化潛力評估",
            description: "評估每個候選是否暗示清晰的視覺概念（能直接轉化為廣告畫面），廣告可執行性評分 1-10。高視覺化潛力的標語更易製作強力廣告。",
            owner: "testing_specialist",
            output: "視覺化潛力評分表",
            duration_hint: "15 min",
            prompts: [
              "能直接變成廣告畫面嗎？",
              "視覺概念是什麼？",
              "能跨媒體視覺化嗎？",
            ],
          },
          {
            step: 7,
            title: "Squad Lead QA + 最終交付",
            description: "Squad Lead 整合評分，Top 5 排序附感官地圖與視覺執行概念，輸出感官雙關法標語策略報告。",
            owner: "squad_lead",
            output: "感官雙關法標語策略報告",
            duration_hint: "15 min",
          },
        ],
      });

      await upsertSquad(conn, {
        slug,
        name: "感官雙關法標語小組",
        description: "嚴格遵循感官雙關法（Sensory/Wordplay Method）的七步驟標語生成流程。從感官體驗盤點（五感地圖）、感官動詞庫建構（每感官 10+ 動詞）、通感/聯覺設計（跨感官組合）、雙關語/文字遊戲生成、口語節奏分析（押韻/頭韻/諧音）、視覺化潛力評估到最終輸出。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["brand-slogan"],
        methodology: "sensory-wordplay",
        agents: members,
        tags: ["slogan", "tagline", "sensory", "wordplay", "pun", "synesthesia", "skittles", "taste", "rainbow", "音韻", "標語", "雙關"],
        useCases: [
          "食品/飲料品牌的感官體驗標語",
          "美妝/香氛品牌的五感標語",
          "品牌需要通感（跨感官）創意的標語",
          "需要高音韻/押韻記憶度的品牌標語",
        ],
        outputFormats: ["PDF 標語策略報告", "Google Slides 標語提案簡報", "品牌標語使用指南"],
        requiredIntegrations: [],
        token: 90000,
        showcases: [
          {
            company: "Skittles",
            description: "感官雙關法標語 'Taste the Rainbow'（味覺+視覺的通感聯覺），跨感官組合創造強力記憶點",
            result: "Skittles 成為美國非巧克力糖果 #1 品牌",
            source: "https://www.mars.com/made-by-mars/mars-wrigley/skittles",
          },
        ],
      });
    }

    console.log("[seed-slogan] Done. All slogan squad seeds applied successfully.");

  } catch (err: any) {
    console.error("[seed-slogan] ERROR:", err.message ?? err);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[seed-slogan] FATAL:", err.message ?? err);
  process.exit(1);
});
