/**
 * seed-fb-additional-squads — build 4 missing FB squads with full
 * governance (per project_squad_design_methodology.md):
 *   - countdown-series (2 step)
 *   - account-reposition (4 step + QA)
 *   - quarterly-strategy (4 step + QA)
 *   - monthly-analytics (3 step)
 *
 * Each step declares all 7 governance attributes:
 *   outputKind / mockupVariant / aiModel / storageTarget /
 *   reviewerAgentId / dataRequirements / userInputFields
 *
 * Reuses the 6-agent crew seeded for fb-monthly-calendar (Claire Hsu
 * lead + 5 specialists). Skill-matched per step's needs.
 *
 * Idempotent — UPDATE if slug exists, INSERT otherwise.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

// Reuse existing FB-team agents (seeded by seed-fb-calendar-agents.ts)
const A = {
  lead: 180159,            // Claire Hsu — Social Media Brand Strategist
  audienceInsight: 239180, // Stacy Lin
  pillarArchitect: 239181, // Vincent Shen
  calendarLead: 239182,    // Phoebe Yang
  briefWriter: 239183,     // Aiden Hsu
  visualDirector: 239184,  // Mandy Cheng
};
const NAME: Record<number, string> = {
  180159: "Claire Hsu", 239180: "Stacy Lin", 239181: "Vincent Shen",
  239182: "Phoebe Yang", 239183: "Aiden Hsu", 239184: "Mandy Cheng",
};

interface Step {
  order: number;
  name: string;
  description: string;
  assignedAgentId: number;
  assignedAgentName: string;
  reviewerAgentId: number | null;
  outputKind: "decision" | "text_strategic" | "structured_table" | "text_content" | "qa_review";
  mockupVariant: string;
  storageTarget: string;
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

// ── Squad 1: 倒數活動系列 (2 step — minimal for atomic-ish flow) ──────────
const COUNTDOWN: SquadSeed = {
  slug: "fb-countdown-series",
  name: "FB 倒數活動系列小組",
  description: "為一場活動產出 5-7 篇連續倒數貼文，主題遞進 + 緊迫感升溫，最後一篇接活動當天。",
  methodology: "Cialdini Scarcity + Loss Aversion (Influence, 2021 ed.)",
  steps: [
    {
      order: 0,
      name: "Intake：確認活動日 + 倒數天數 + TA",
      description: "從 events 帶入活動日期與定位；用戶補：倒數天數（5/6/7）、想強調 TA、主題遞進方向。",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "decision", mockupVariant: "IntakeFormMockup",
      storageTarget: "mission_step_progress.canonical_message[step=0]",
      userInputFields: ["countdown_days", "ta_focus", "theme_arc"],
      dataRequirements: { minUrls: 0, minChars: 0, requireBucketA: ["events.positioning"] },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 1,
      name: "撰寫 5-7 篇倒數貼文（連續性檢查）",
      description: "依 step 0 的天數 + 遞進方向，產出每天 1 篇 FB 貼文文案。同一個 agent 寫完整序列以確保語氣 / hook 不重複、緊迫感升溫。",
      assignedAgentId: A.briefWriter, assignedAgentName: NAME[A.briefWriter],
      reviewerAgentId: A.lead,
      outputKind: "text_content", mockupVariant: "FBPostBriefMockup",
      storageTarget: "mission_step_progress.canonical_message[step=1]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-sonnet-4-5",
    },
  ],
  workspace: ["facebook"],
  tags: ["facebook", "countdown", "campaign-prep", "scarcity"],
  use_cases: ["fb-countdown-series", "campaign-launch-prep"],
  output_formats: ["post_brief"],
  deliverable_format: "countdown_post_series",
  missionType: "campaign-countdown",
};

// ── Squad 2: 帳號重新定位 (4 step + QA) ──────────────────────────────────
const REPOSITION: SquadSeed = {
  slug: "fb-account-reposition",
  name: "FB 帳號重新定位小組",
  description: "現有 FB 帳號 audit + 競品比對 + 新 tilt 主張 + 30 天落地計畫。",
  methodology: "Trout & Ries Positioning (1981) + Pulizzi Tilt (Content Inc.)",
  steps: [
    {
      order: 0,
      name: "Intake：FB 帳號連結 + 競品 + 重新定位目標",
      description: "用戶提供：本帳號 FB URL（或 Pipedream 授權掃描）、3-5 個競品 FB URL、重新定位的痛點與目標。",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "decision", mockupVariant: "IntakeFormMockup",
      storageTarget: "mission_step_progress.canonical_message[step=0]",
      userInputFields: ["account_url", "competitor_urls", "reposition_pain", "reposition_goal"],
      dataRequirements: { minUrls: 1, minChars: 0, requireBucketA: ["context.brand", "context.product?", "context.event?"] },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 1,
      name: "本帳號 audit：過去 30 天貼文分析 + 受眾洞察",
      description: "分析現有 FB 帳號的貼文表現、受眾組成、聲音特色、表現最好/最差的內容類型。",
      assignedAgentId: A.audienceInsight, assignedAgentName: NAME[A.audienceInsight],
      reviewerAgentId: A.lead,
      outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup",
      storageTarget: "mission_step_progress.canonical_message[step=1]",
      userInputFields: [],
      dataRequirements: { minUrls: 1, minChars: 3000 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 2,
      name: "競品 FB 內容 audit",
      description: "對 3-5 個競品做 FB 內容策略比對：他們在賣什麼角度？哪個 pillar 最重？哪些是空白市場？",
      assignedAgentId: A.audienceInsight, assignedAgentName: NAME[A.audienceInsight],
      reviewerAgentId: A.lead,
      outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup",
      storageTarget: "mission_step_progress.canonical_message[step=2]",
      userInputFields: [],
      dataRequirements: { minUrls: 3, minChars: 3000 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 3,
      name: "新 tilt 主張 + 30 天落地計畫",
      description: "根據前兩步研究產出新 tilt（一句話定位）+ 證據鍊 + 30 天的具體落地動作（每週幾篇、什麼 pillar）。",
      assignedAgentId: A.pillarArchitect, assignedAgentName: NAME[A.pillarArchitect],
      reviewerAgentId: A.lead,
      outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup",
      storageTarget: "mission_step_progress.canonical_message[step=3]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 4,
      name: "Squad Lead QA：研究深度 / tilt 鋒利度 / 落地可執行性",
      description: "終審：研究是否引用真實證據？tilt 是否夠鋒利不流於泛用？落地計畫是否可立即動工？",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "qa_review", mockupVariant: "QAReportMockup",
      storageTarget: "mission_step_progress.canonical_message[step=4]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "gemini-2.5-flash",
    },
  ],
  workspace: ["facebook"],
  tags: ["facebook", "positioning", "audit", "competitive-analysis", "reposition"],
  use_cases: ["fb-account-reposition", "competitive-audit"],
  output_formats: ["research_panel", "qa_report"],
  deliverable_format: "reposition_dossier",
  missionType: "account-reposition",
};

// ── Squad 3: 季度策略 (4 step + QA) ──────────────────────────────────────
const QUARTERLY: SquadSeed = {
  slug: "fb-quarterly-strategy",
  name: "FB 季度策略小組",
  description: "三個月 FB 策略：pillar 配比 / 主題月份分配 / KPI 設定 / 季度 calendar 排程。月行事曆的上一層。",
  methodology: "Pulizzi Quarterly Cadence + Latane Conant Pillar Operationalization",
  steps: [
    {
      order: 0,
      name: "Intake：季度目標 + 預算 + 主推活動",
      description: "用戶填：本季商業目標、有多少預算、本季要主推哪些活動（從 events 帶候選）。",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "decision", mockupVariant: "IntakeFormMockup",
      storageTarget: "mission_step_progress.canonical_message[step=0]",
      userInputFields: ["business_goal", "budget", "priority_events"],
      dataRequirements: { minUrls: 0, minChars: 0, requireBucketA: ["context.brand", "context.product?", "context.event?"] },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 1,
      name: "Pillar 配比 + 主題月份分配",
      description: "決定本季 3-5 個 pillar 的相對比例，以及每個 pillar 集中在哪個月份（避免散亂）。",
      assignedAgentId: A.pillarArchitect, assignedAgentName: NAME[A.pillarArchitect],
      reviewerAgentId: A.lead,
      outputKind: "structured_table", mockupVariant: "PillarTableMockup",
      storageTarget: "mission_step_progress.canonical_message[step=1]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 2,
      name: "KPI 設定 + 預算建議",
      description: "依 pillar 配比 + 商業目標，設定本季 KPI（互動 / 觸及 / 轉換）+ 預算分配建議。",
      assignedAgentId: A.audienceInsight, assignedAgentName: NAME[A.audienceInsight],
      reviewerAgentId: A.lead,
      outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup",
      storageTarget: "mission_step_progress.canonical_message[step=2]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 3,
      name: "季度 Calendar 排程（90 天 × pillar × event）",
      description: "把 pillar 比例 + 主推活動展開成 90 天的高層次 calendar：每週主題 + 每月活動峰值。月行事曆的母模板。",
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
      name: "Squad Lead QA",
      description: "終審：pillar 比例是否與 KPI 一致？月份分配是否避免空檔？預算是否與目標匹配？",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "qa_review", mockupVariant: "QAReportMockup",
      storageTarget: "mission_step_progress.canonical_message[step=4]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "gemini-2.5-flash",
    },
  ],
  workspace: ["facebook"],
  tags: ["facebook", "quarterly", "strategy", "kpi", "pillar"],
  use_cases: ["fb-quarterly-strategy", "quarterly-planning"],
  output_formats: ["pillar_table", "calendar_grid", "qa_report"],
  deliverable_format: "quarterly_strategy_pack",
  missionType: "quarterly-strategy",
};

// ── Squad 4: 月度成效報告 (3 step) ───────────────────────────────────────
const ANALYTICS: SquadSeed = {
  slug: "fb-monthly-analytics",
  name: "FB 月度成效報告小組",
  description: "上月 FB 貼文成效彙整：pillar 比例 / 互動率 / 受眾洞察 / 下月優化建議。需要 FB 授權或手動貼數據。",
  methodology: "Pulizzi Performance-then-Pivot Loop",
  steps: [
    {
      order: 0,
      name: "Intake：上月行事曆 + 數據來源（FB 授權 OR 手動）",
      description: "從 mission_step_progress 帶入上月 calendar；用戶選擇：連 Pipedream 拉真實數據 / 手動貼 CSV / 跳過用估計值。",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "decision", mockupVariant: "IntakeFormMockup",
      storageTarget: "mission_step_progress.canonical_message[step=0]",
      userInputFields: ["data_source", "data_csv", "previous_calendar_id"],
      dataRequirements: { minUrls: 0, minChars: 100 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 1,
      name: "Pillar 比例 + 互動率分析",
      description: "對照上月 calendar 的 pillar 配比，分析實際發布是否符合計畫；按 pillar 算互動率，找出表現最好 / 最差的內容類型。",
      assignedAgentId: A.audienceInsight, assignedAgentName: NAME[A.audienceInsight],
      reviewerAgentId: A.lead,
      outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup",
      storageTarget: "mission_step_progress.canonical_message[step=1]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 100 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 2,
      name: "受眾洞察 + 下月優化建議",
      description: "從上月互動數據反推受眾偏好（時段 / 議題 / 格式），給出下月 calendar 的具體調整建議（哪個 pillar 加碼、哪個收斂）。",
      assignedAgentId: A.pillarArchitect, assignedAgentName: NAME[A.pillarArchitect],
      reviewerAgentId: A.lead,
      outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup",
      storageTarget: "mission_step_progress.canonical_message[step=2]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-opus-4-6",
    },
  ],
  workspace: ["facebook"],
  tags: ["facebook", "analytics", "monthly-report", "performance", "pillar"],
  use_cases: ["fb-monthly-analytics", "performance-review"],
  output_formats: ["research_panel"],
  deliverable_format: "monthly_analytics_report",
  missionType: "monthly-analytics",
};

const ALL_SQUADS = [COUNTDOWN, REPOSITION, QUARTERLY, ANALYTICS];

// ── seed runner ─────────────────────────────────────────────────────────
async function seedSquad(pool: mysql.Pool, sq: SquadSeed): Promise<void> {
  const agentsJson = (() => {
    const ids = Array.from(new Set(sq.steps.map((s) => s.assignedAgentId)));
    if (!ids.includes(A.lead)) ids.unshift(A.lead);
    return ids.map((id, i) => ({
      id, name: NAME[id] ?? `Agent ${id}`,
      role: id === A.lead ? "Squad Lead" : "Specialist",
      is_lead: id === A.lead,
    }));
  })();

  const [existing]: any = await pool.execute(
    `SELECT id, is_approved FROM squads WHERE slug = ? LIMIT 1`,
    [sq.slug],
  );
  const exists = (existing as any[])?.[0];
  if (exists) {
    // Update steps + agents (idempotent re-seed)
    await pool.execute(
      `UPDATE squads
          SET name = ?, description = ?, methodology = ?,
              agents = ?, steps = ?, lead_agent_id = ?,
              tags = ?, workspace = ?, use_cases = ?, output_formats = ?,
              deliverable_format = ?, missionType = ?
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
    console.log(`  ✓ updated squad #${exists.id}  ${sq.slug}  (${sq.steps.length} steps, is_approved=${exists.is_approved})`);
    return;
  }

  const [r]: any = await pool.execute(
    `INSERT INTO squads (
       slug, name, description, methodology,
       agents, steps, lead_agent_id, tags,
       tier, strategy_layer, workspace,
       use_cases, output_formats,
       is_active, is_approved,
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
       1, 0,
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
  console.log(`  ✓ inserted squad #${r?.insertId}  ${sq.slug}  (${sq.steps.length} steps)`);
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  console.log(`[seed-fb-additional-squads] processing ${ALL_SQUADS.length} squads…\n`);
  for (const sq of ALL_SQUADS) {
    await seedSquad(pool, sq);
  }
  console.log("\n[seed-fb-additional-squads] done.");

  // Verify each step has a mockupVariant (CJ requirement: 每一步驟的 mockup)
  console.log("\n=== Mockup coverage audit ===");
  const [auditRows]: any = await pool.execute(
    `SELECT slug, JSON_LENGTH(steps) AS n_steps FROM squads
      WHERE slug IN (?, ?, ?, ?)`,
    ALL_SQUADS.map((s) => s.slug),
  );
  for (const r of (auditRows as any[])) {
    const sq = ALL_SQUADS.find((s) => s.slug === r.slug);
    if (!sq) continue;
    const missingMockup = sq.steps.filter((s) => !s.mockupVariant);
    const ok = missingMockup.length === 0;
    console.log(`  ${ok ? "✓" : "✗"} ${r.slug}: ${r.n_steps} steps, ${missingMockup.length} missing mockup`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
