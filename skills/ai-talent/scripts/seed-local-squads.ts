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
