/**
 * seed-fb-calendar-variants — add 2 new monthly-calendar squad variants
 * (CJ direction 2026-05-02): templates page shows multiple methodology-
 * distinct task cards under the same category.
 *
 * Variants under category `fb-monthly-calendar`:
 *
 *   1. 內容支柱型月行事曆 (Pulizzi)        ← existing squad #726
 *      - balanced N-pillar long-term content engine
 *      - method: Joe Pulizzi Content Inc. + Latane Conant
 *
 *   2. 衝刺型月行事曆 (Sprint Launch)       ← NEW squad
 *      - 30-day product-launch sprint, front-loaded with hook-stacking
 *        then payoff cluster around the launch date
 *      - 3 fixed pillars: Hook (40%) / Social Proof (30%) / CTA (30%)
 *      - method: GaryVee Volume + Cialdini Scarcity
 *
 *   3. 產品推廣型月行事曆 (Product Promotion) ← NEW squad
 *      - rotates through 3-5 SKUs across the month, each gets a
 *        dedicated pillar (1:1 product:pillar mapping)
 *      - includes per-product feature spotlights + comparison slots
 *      - method: Latane Conant Pillar/Cluster (per-product clusters)
 *
 * All three squads:
 *   - reuse FB team (Claire/Stacy/Vincent/Phoebe/Aiden/Mandy/Hailey)
 *   - share the existing 6 mockup variants per step
 *   - each bound to the same `fb-monthly-calendar` task_category
 *
 * Idempotent — UPSERT by squad slug, UPSERT task_catalog by slug.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

// FB team — existing agent IDs from seed-fb-calendar-agents.ts
const A = {
  lead:            180159, // Claire Hsu
  audienceInsight: 239180, // Stacy Lin
  pillarArchitect: 239181, // Vincent Shen
  calendarLead:    239182, // Phoebe Yang
  briefWriter:     239183, // Aiden Hsu
  visualDirector:  239184, // Mandy Cheng
  crisisComms:     239185, // Brian Chou
  perfAnalyst:     239186, // Hailey Huang
};
const NAME: Record<number, string> = {
  180159: "Claire Hsu", 239180: "Stacy Lin", 239181: "Vincent Shen",
  239182: "Phoebe Yang", 239183: "Aiden Hsu", 239184: "Mandy Cheng",
  239185: "Brian Chou", 239186: "Hailey Huang",
};

interface Step {
  order: number; name: string; description: string;
  assignedAgentId: number; assignedAgentName: string;
  reviewerAgentId: number | null;
  outputKind: string; mockupVariant: string; storageTarget: string;
  userInputFields: string[];
  dataRequirements: { minUrls: number; minChars: number; requireBucketA?: string[] };
  aiModel: string;
}

interface SquadSeed {
  slug: string;
  name: string;
  description: string;
  methodology: string;
  steps: Step[];
  workspace: string[];
  tags: string[];
  use_cases: string[];
  output_formats: string[];
  deliverable_format: string;
  missionType: string;
}

// ── Variant 2: Sprint Launch ─────────────────────────────────────────────
const SPRINT: SquadSeed = {
  slug: "fb-monthly-calendar-sprint",
  name: "衝刺型 Facebook 月行事曆（Sprint Launch）",
  description: "為產品上市 / 限時活動設計的 30 天衝刺月曆。3 根固定 pillar：Hook(40%)/Social Proof(30%)/CTA(30%)，前期 hook 密集，倒數階段 payoff 集群。適合：launch month、限時 sale、新品開賣。",
  methodology: "GaryVee Volume Posting + Cialdini Scarcity & Loss Aversion",
  steps: [
    {
      order: 0,
      name: "Intake：Launch Date + 主推 SKU + Sale 視窗",
      description: "蒐集衝刺週期關鍵資料：launch 日期、主推 1-2 個 SKU、sale 截止日、想衝的 KPI（轉換 / 觸及 / 互動三選一）。",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "decision", mockupVariant: "IntakeFormMockup",
      storageTarget: "mission_step_progress.canonical_message[step=0]",
      userInputFields: ["launch_date", "primary_sku", "sale_window", "primary_kpi"],
      dataRequirements: { minUrls: 0, minChars: 0, requireBucketA: ["events.positioning"] },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 1,
      name: "競品 Launch Playbook 研究",
      description: "找 3-5 個同產業近 6 個月的 launch case，分析他們的 hook 密度 / 倒數節奏 / payoff 形式。產出可借鏡的衝刺節奏模板。",
      assignedAgentId: A.audienceInsight, assignedAgentName: NAME[A.audienceInsight],
      reviewerAgentId: A.lead,
      outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup",
      storageTarget: "mission_step_progress.canonical_message[step=1]",
      userInputFields: [],
      dataRequirements: { minUrls: 3, minChars: 3000 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 2,
      name: "Sprint 3 Pillars 定義（Hook / Social Proof / CTA）",
      description: "鎖定 3 根固定 pillar 並訂出比例：Hook 40% / Social Proof 30% / CTA 30%。每根 pillar 給出 5-7 個 sample 主題 + 視覺方向。",
      assignedAgentId: A.pillarArchitect, assignedAgentName: NAME[A.pillarArchitect],
      reviewerAgentId: A.lead,
      outputKind: "structured_table", mockupVariant: "PillarTableMockup",
      storageTarget: "mission_step_progress.canonical_message[step=2]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 3,
      name: "Sprint Calendar 排程（前重後 payoff cluster）",
      description: "30 天排程：前 15 天 hook 為主（每天 1-2 篇），後 10 天 social proof，倒數 5 天 CTA payoff cluster（每天必有 CTA）。標記 launch day 為 peak。",
      assignedAgentId: A.calendarLead, assignedAgentName: NAME[A.calendarLead],
      reviewerAgentId: A.lead,
      outputKind: "structured_table", mockupVariant: "CalendarGridMockup",
      storageTarget: "mission_step_progress.canonical_message[step=3]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "gpt-4.1",
    },
    {
      order: 4,
      name: "Per-post 內容 brief（CTA-first）",
      description: "依 calendar 產出每篇貼文的 brief：hook 句、主體、CTA、視覺方向。CTA pillar 的篇章必須具體寫出『點擊去 X / 限時到 Y』。",
      assignedAgentId: A.briefWriter, assignedAgentName: NAME[A.briefWriter],
      reviewerAgentId: A.lead,
      outputKind: "text_content", mockupVariant: "FBPostBriefMockup",
      storageTarget: "mission_step_progress.canonical_message[step=4]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-sonnet-4-5",
    },
    {
      order: 5,
      name: "Squad Lead QA：轉換漏斗一致性",
      description: "終審：hook→social proof→CTA 是否邏輯遞進？payoff cluster 是否覆蓋 sale 截止日？視覺方向是否前後一致？",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "qa_review", mockupVariant: "QAReportMockup",
      storageTarget: "mission_step_progress.canonical_message[step=5]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "gemini-2.5-flash",
    },
  ],
  workspace: ["facebook"],
  tags: ["facebook", "monthly-calendar", "sprint", "launch", "scarcity", "garyvee"],
  use_cases: ["fb-monthly-calendar-sprint", "product-launch-sprint"],
  output_formats: ["calendar_grid", "post_brief", "pillar_table", "qa_report"],
  deliverable_format: "sprint_calendar_pack",
  missionType: "monthly-calendar-sprint",
};

// ── Variant 3: Product Promotion ─────────────────────────────────────────
const PRODUCT_PROMO: SquadSeed = {
  slug: "fb-monthly-calendar-product-promo",
  name: "產品推廣型 Facebook 月行事曆（Product Promotion）",
  description: "把月曆切成 N 個產品輪播輪。每個 SKU 配 1 根 pillar，月曆內含產品特性聚焦 / 比較競品 / 客戶見證 slot。適合：多 SKU 品牌的常態運營月。",
  methodology: "Latane Conant Pillar/Cluster (per-product clusters)",
  steps: [
    {
      order: 0,
      name: "Intake：3-5 個主推 SKU + 各自 ICP",
      description: "蒐集本月要輪播的 3-5 個產品，每個給：產品名 / 賣點 1-2 句 / 主要 ICP / 競品。系統會檢查 brand_products 表自動帶入。",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "decision", mockupVariant: "IntakeFormMockup",
      storageTarget: "mission_step_progress.canonical_message[step=0]",
      userInputFields: ["product_skus", "skus_meta", "month_focus"],
      dataRequirements: { minUrls: 0, minChars: 0, requireBucketA: ["products.positioning"] },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 1,
      name: "Per-product 受眾細分研究",
      description: "為每個 SKU 跑一輪受眾研究：他們在 PTT / Dcard / 論壇上提到這類產品時的痛點 / 替代品 / 決策觸發點。產出 per-product persona 摘要。",
      assignedAgentId: A.audienceInsight, assignedAgentName: NAME[A.audienceInsight],
      reviewerAgentId: A.lead,
      outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup",
      storageTarget: "mission_step_progress.canonical_message[step=1]",
      userInputFields: [],
      dataRequirements: { minUrls: 3, minChars: 5000 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 2,
      name: "Per-product Pillar 設計（1:1 SKU↔Pillar）",
      description: "每個 SKU 一根 pillar，pillar 比例依商業重要性分配。每根 pillar 內含 3 個 cluster：產品特性 / 競品比較 / 客戶見證。",
      assignedAgentId: A.pillarArchitect, assignedAgentName: NAME[A.pillarArchitect],
      reviewerAgentId: A.lead,
      outputKind: "structured_table", mockupVariant: "PillarTableMockup",
      storageTarget: "mission_step_progress.canonical_message[step=2]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 3,
      name: "Calendar 排程（產品輪播 + 比較 / 見證 slot）",
      description: "把 30 天切成 N 個 SKU 輪：每個 SKU 區段含 2-3 篇特性聚焦 + 1 篇競品比較 + 1 篇客戶見證。SKU 間留 1 天 brand-voice 緩衝貼文。",
      assignedAgentId: A.calendarLead, assignedAgentName: NAME[A.calendarLead],
      reviewerAgentId: A.lead,
      outputKind: "structured_table", mockupVariant: "CalendarGridMockup",
      storageTarget: "mission_step_progress.canonical_message[step=3]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "gpt-4.1",
    },
    {
      order: 4,
      name: "Per-post 內容 brief（產品聚焦）",
      description: "每篇 brief 標註所屬 SKU 與 cluster 類型（特性 / 比較 / 見證）。產品特性篇要求帶具體規格；見證篇要求引用真實受眾語言。",
      assignedAgentId: A.briefWriter, assignedAgentName: NAME[A.briefWriter],
      reviewerAgentId: A.lead,
      outputKind: "text_content", mockupVariant: "FBPostBriefMockup",
      storageTarget: "mission_step_progress.canonical_message[step=4]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-sonnet-4-5",
    },
    {
      order: 5,
      name: "Squad Lead QA：產品覆蓋公平性",
      description: "終審：每個 SKU 是否拿到符合比例的篇數？特性 / 比較 / 見證 cluster 是否齊全？月初 / 月中 / 月末 SKU 分配是否平衡？",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "qa_review", mockupVariant: "QAReportMockup",
      storageTarget: "mission_step_progress.canonical_message[step=5]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "gemini-2.5-flash",
    },
  ],
  workspace: ["facebook"],
  tags: ["facebook", "monthly-calendar", "product-promo", "multi-sku", "pillar-cluster"],
  use_cases: ["fb-monthly-calendar-product-promo", "multi-product-rotation"],
  output_formats: ["calendar_grid", "post_brief", "pillar_table", "qa_report"],
  deliverable_format: "product_promo_calendar_pack",
  missionType: "monthly-calendar-product-promo",
};

const VARIANTS = [SPRINT, PRODUCT_PROMO];

// New task_catalog rows for the variants
interface VariantTask {
  squad_slug: string;
  task_slug: string;
  name_zh: string;
  name_en: string;
  description: string;
  category_slug: string;
  methodology_label: string;
  search_keywords: string;
  estimated_minutes: number;
}

const VARIANT_TASKS: VariantTask[] = [
  {
    squad_slug: "fb-monthly-calendar-sprint",
    task_slug: "fb-monthly-calendar-sprint",
    name_zh: "衝刺型 Facebook 月行事曆",
    name_en: "FB Sprint Launch Calendar",
    description: "30 天產品上市衝刺月曆。3 pillar 固定（Hook 40% / Social Proof 30% / CTA 30%），前期 hook 密集，倒數階段 payoff 集群。",
    category_slug: "fb-monthly-calendar",
    methodology_label: "GaryVee Volume + Cialdini Scarcity（衝刺型）",
    search_keywords: "月行事曆,衝刺,sprint,launch,上市,scarcity,garyvee,計畫",
    estimated_minutes: 22,
  },
  {
    squad_slug: "fb-monthly-calendar-product-promo",
    task_slug: "fb-monthly-calendar-product-promo",
    name_zh: "產品推廣型 Facebook 月行事曆",
    name_en: "FB Product Promotion Calendar",
    description: "多 SKU 輪播月曆。每個產品配 1 根 pillar，含特性聚焦 / 競品比較 / 客戶見證 slot。",
    category_slug: "fb-monthly-calendar",
    methodology_label: "Conant Pillar/Cluster（per-product 群組）",
    search_keywords: "月行事曆,產品推廣,product,promo,SKU,pillar-cluster,輪播",
    estimated_minutes: 28,
  },
];

// Existing 12 task renames — angle-distinctive names
const RENAMES: { slug: string; new_name: string; new_methodology_label?: string }[] = [
  { slug: "fb-monthly-calendar",       new_name: "內容支柱型 Facebook 月行事曆", new_methodology_label: "Joe Pulizzi 內容支柱法（balanced）" },
  { slug: "fb-event-launch-kit",       new_name: "Jab-Hook 型 FB 活動上線套組",  new_methodology_label: "GaryVee Jab Jab Right Hook" },
  { slug: "fb-account-reposition",     new_name: "Tilt 鋒利型 FB 帳號重新定位",  new_methodology_label: "Trout & Ries Positioning + Pulizzi Tilt" },
  { slug: "fb-quarterly-strategy",     new_name: "Pulizzi 季度節奏型 FB 策略",   new_methodology_label: "Pulizzi Quarterly Cadence" },
  { slug: "fb-monthly-analytics",      new_name: "數據驅動型 FB 月度成效報告",   new_methodology_label: "Kaushik Web Analytics 2.0 + Engagement Pyramid" },
  { slug: "fb-countdown-series",       new_name: "Cialdini 緊迫型 FB 倒數系列",  new_methodology_label: "Cialdini Scarcity + Loss Aversion" },
  { slug: "fb-livestream-prep",        new_name: "成對敘事型 FB 直播預告 + 摘要", new_methodology_label: "Pre/Post 成對敘事一致性法" },
  { slug: "fb-carousel",               new_name: "敘事弧型 FB 輪播圖文",         new_methodology_label: "Hook-Build-Turn-Payoff 敘事弧法" },
  { slug: "fb-reels-script",           new_name: "Hook-Hold-Payoff 型 FB Reels", new_methodology_label: "短影音 Hook-Hold-Payoff 法" },
  { slug: "fb-crisis-reply",           new_name: "Lagadec 四段式型 FB 客訴回覆", new_methodology_label: "Lagadec 致歉 + 解釋 + 承諾 + 私訊四段式" },
  { slug: "fb-single-post-text",       new_name: "極簡純文字型 FB 貼文",         new_methodology_label: "Hook + CTA 純文字版" },
  { slug: "fb-single-post-with-image", new_name: "視覺先行型 FB 貼文（配圖）",   new_methodology_label: "Hook + 視覺方向 brief" },
];

async function seedSquad(pool: mysql.Pool, sq: SquadSeed): Promise<number> {
  const agentsJson = (() => {
    const ids = Array.from(new Set(sq.steps.map((s) => s.assignedAgentId)));
    if (!ids.includes(A.lead)) ids.unshift(A.lead);
    return ids.map((id) => ({
      id, name: NAME[id] ?? `Agent ${id}`,
      role: id === A.lead ? "Squad Lead" : "Specialist",
      is_lead: id === A.lead,
    }));
  })();

  const [existing]: any = await pool.execute(
    `SELECT id FROM squads WHERE slug = ? LIMIT 1`,
    [sq.slug],
  );
  const exists = (existing as any[])?.[0];
  if (exists) {
    await pool.execute(
      `UPDATE squads
          SET name = ?, description = ?, methodology = ?,
              agents = ?, steps = ?, lead_agent_id = ?,
              tags = ?, workspace = ?, use_cases = ?, output_formats = ?,
              deliverable_format = ?, missionType = ?,
              is_approved = 1, approved_at = NOW()
        WHERE id = ?`,
      [
        sq.name, sq.description, sq.methodology,
        JSON.stringify(agentsJson), JSON.stringify(sq.steps), A.lead,
        JSON.stringify(sq.tags), JSON.stringify(sq.workspace),
        JSON.stringify(sq.use_cases), JSON.stringify(sq.output_formats),
        sq.deliverable_format, sq.missionType,
        exists.id,
      ],
    );
    console.log(`  ✓ updated squad #${exists.id}  ${sq.slug}`);
    return Number(exists.id);
  }

  const [r]: any = await pool.execute(
    `INSERT INTO squads (
       slug, name, description, methodology,
       agents, steps, lead_agent_id, tags,
       tier, strategy_layer, workspace,
       use_cases, output_formats,
       is_active, is_approved, approved_at,
       source, architecture, orchestrator_layer,
       squad_size, squad_tier,
       has_video_output, video_aspect_ratio, video_duration_sec,
       deliverable_format, deliverable_level,
       missionType
     ) VALUES (
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       'core', 'L4_channel', ?,
       ?, ?,
       1, 1, NOW(),
       'seeded', 'a2a', 'execution',
       'medium', 'medium',
       0, '1:1', 15,
       ?, 3,
       ?
     )`,
    [
      sq.slug, sq.name, sq.description, sq.methodology,
      JSON.stringify(agentsJson), JSON.stringify(sq.steps), A.lead,
      JSON.stringify(sq.tags), JSON.stringify(sq.workspace),
      JSON.stringify(sq.use_cases), JSON.stringify(sq.output_formats),
      sq.deliverable_format, sq.missionType,
    ],
  );
  console.log(`  ✓ inserted squad #${r?.insertId}  ${sq.slug}  (${sq.steps.length} steps, auto-approved)`);
  return Number(r?.insertId ?? 0);
}

async function upsertVariantTask(pool: mysql.Pool, vt: VariantTask, squadId: number): Promise<void> {
  // Resolve category_id
  const [catRows]: any = await pool.execute(
    `SELECT id FROM task_category WHERE slug = ? LIMIT 1`,
    [vt.category_slug],
  );
  const categoryId = (catRows as any[])?.[0]?.id ?? null;
  if (!categoryId) {
    console.warn(`  ⚠ category ${vt.category_slug} not found — skipping ${vt.task_slug}`);
    return;
  }

  const [exist]: any = await pool.execute(
    `SELECT id FROM task_catalog WHERE slug = ? LIMIT 1`,
    [vt.task_slug],
  );
  if ((exist as any[])[0]) {
    await pool.execute(
      `UPDATE task_catalog
          SET name_zh=?, name_en=?, description=?, workspace='facebook', category='planning',
              impl_kind='squad', squad_id=?, status='active', bypassable=1,
              search_keywords=?, estimated_minutes=?,
              category_id=?, methodology_label=?
        WHERE id=?`,
      [vt.name_zh, vt.name_en, vt.description, squadId,
       vt.search_keywords, vt.estimated_minutes,
       categoryId, vt.methodology_label,
       (exist as any[])[0].id],
    );
    console.log(`  ✓ updated task #${(exist as any[])[0].id}  ${vt.task_slug} → squad=${squadId}`);
  } else {
    const [r]: any = await pool.execute(
      `INSERT INTO task_catalog
         (slug, name_zh, name_en, description, workspace, category,
          impl_kind, squad_id, status, bypassable,
          search_keywords, estimated_minutes,
          category_id, methodology_label)
       VALUES (?,?,?,?,'facebook','planning','squad',?,'active',1,?,?,?,?)`,
      [vt.task_slug, vt.name_zh, vt.name_en, vt.description,
       squadId, vt.search_keywords, vt.estimated_minutes,
       categoryId, vt.methodology_label],
    );
    console.log(`  ✓ inserted task #${r?.insertId}  ${vt.task_slug}`);
  }
}

async function applyRenames(pool: mysql.Pool): Promise<void> {
  console.log(`\n[renames] applying angle-distinctive names to ${RENAMES.length} existing tasks…`);
  for (const r of RENAMES) {
    const [exist]: any = await pool.execute(
      `SELECT id, name_zh, methodology_label FROM task_catalog WHERE slug = ? LIMIT 1`,
      [r.slug],
    );
    const row = (exist as any[])?.[0];
    if (!row) {
      console.warn(`  ⚠ ${r.slug}: not found`);
      continue;
    }
    if (row.name_zh === r.new_name && row.methodology_label === r.new_methodology_label) {
      console.log(`  ↪ ${r.slug}: already at target name, skipping`);
      continue;
    }
    await pool.execute(
      `UPDATE task_catalog
          SET name_zh = ?, methodology_label = COALESCE(?, methodology_label)
        WHERE id = ?`,
      [r.new_name, r.new_methodology_label ?? null, row.id],
    );
    console.log(`  ✓ #${row.id} ${r.slug}: "${row.name_zh}" → "${r.new_name}"`);
  }
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  console.log(`[seed-fb-calendar-variants] processing ${VARIANTS.length} new squad variants…\n`);
  const squadIds: Record<string, number> = {};
  for (const sq of VARIANTS) {
    squadIds[sq.slug] = await seedSquad(pool, sq);
  }

  console.log(`\n[seed-fb-calendar-variants] binding variant tasks to catalog…`);
  for (const vt of VARIANT_TASKS) {
    const sid = squadIds[vt.squad_slug];
    if (!sid) {
      console.warn(`  ⚠ no squad id for ${vt.squad_slug} — skip`);
      continue;
    }
    await upsertVariantTask(pool, vt, sid);
  }

  await applyRenames(pool);

  // Audit: list all FB monthly-calendar variants
  console.log(`\n=== Final state: fb-monthly-calendar category methods ===`);
  const [rows]: any = await pool.execute(
    `SELECT t.id, t.slug, t.name_zh, t.methodology_label, t.squad_id, s.slug AS squad_slug
       FROM task_catalog t
       JOIN task_category c ON c.id = t.category_id
  LEFT JOIN squads s ON s.id = t.squad_id
      WHERE c.slug = 'fb-monthly-calendar' AND t.status = 'active'
      ORDER BY t.id`,
  );
  for (const r of (rows as any[])) {
    console.log(`  #${r.id} ${r.slug}`);
    console.log(`     name: ${r.name_zh}`);
    console.log(`     method: ${r.methodology_label ?? "—"}`);
    console.log(`     squad: ${r.squad_slug} (#${r.squad_id})`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
