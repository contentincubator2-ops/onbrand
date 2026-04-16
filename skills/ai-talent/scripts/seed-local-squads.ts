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
        `UPDATE squad_workflow_templates SET steps = ?, updatedAt = NOW() WHERE taskType = ?`,
        [JSON.stringify(steps), TASK_TYPE]
      );
    } else {
      await conn.execute(
        `INSERT INTO squad_workflow_templates (taskType, name, description, steps, isActive, createdAt)
         VALUES (?, ?, ?, ?, 1, NOW())`,
        [
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
         SET name = ?, description = ?, taskType = ?, members = ?, tags = ?, use_cases = ?, is_active = 1, updated_at = NOW()
         WHERE slug = 'sowork-brand-positioning'`,
        [
          "SoWork品牌定位",
          "完整 11 步品牌定位分析框架，從深層動機挖掘到品牌個性建立，最終輸出可執行的品牌定位書。適合新品牌建立、老品牌重定位、或需要清晰競爭差異化的企業。",
          TASK_TYPE,
          JSON.stringify(members),
          tags,
          useCases,
        ]
      );
    } else {
      await conn.execute(
        `INSERT INTO agent_squads
           (slug, name, description, industry_key, taskType, members, tags, use_cases, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [
          "sowork-brand-positioning",
          "SoWork品牌定位",
          "完整 11 步品牌定位分析框架，從深層動機挖掘到品牌個性建立，最終輸出可執行的品牌定位書。適合新品牌建立、老品牌重定位、或需要清晰競爭差異化的企業。",
          "general",
          TASK_TYPE,
          JSON.stringify(members),
          tags,
          useCases,
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
          `UPDATE squad_workflow_templates SET name = ?, description = ?, steps = ?, updatedAt = NOW() WHERE taskType = ?`,
          [wf.name, wf.description, JSON.stringify(wf.steps), wf.taskType]
        );
        console.log(`[seed-local] Workflow '${wf.taskType}': updated`);
      } else {
        await conn.execute(
          `INSERT INTO squad_workflow_templates (taskType, name, description, steps, isActive, createdAt)
           VALUES (?, ?, ?, ?, 1, NOW())`,
          [wf.taskType, wf.name, wf.description, JSON.stringify(wf.steps)]
        );
        console.log(`[seed-local] Workflow '${wf.taskType}': inserted`);
      }
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
