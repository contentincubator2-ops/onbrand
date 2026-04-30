/**
 * seed-fb-monthly-calendar-squad.ts
 *
 * Pilot 1 of the Squad Design Methodology (project_squad_design_methodology.md).
 * Seeds the "Joe Pulizzi 內容支柱 Facebook 月行事曆小組" squad with:
 *   - 6-agent crew: Claire (lead, existing 180159) + 5 specialists (239180-184)
 *   - 7 steps each declaring all 7 governance attributes
 *   - is_approved=0 (CJ reviews before front-stage)
 *
 * Run on VM:
 *   npx tsx scripts/seed-fb-monthly-calendar-squad.ts
 *
 * Idempotent: skips if slug already exists; report-only when re-run.
 */
import localPool from "../server/localDb";

const SQUAD_SLUG = "fb-monthly-calendar-pulizzi";
const SQUAD_NAME = "Joe Pulizzi 內容支柱 Facebook 月行事曆小組";
const NEXT_RECOMMENDED_SQUAD = "fb-post-writer-from-brief";

// Agent IDs from previous seed (verified post-INSERT 2026-04-30)
const AGENT = {
  squadLead:        180159, // Claire Hsu — Social Media Brand Strategist (existing)
  audienceInsight:  239180, // Stacy Lin — Audience Insight Lead
  pillarArchitect:  239181, // Vincent Shen — Content Pillar Architect (Pulizzi 派)
  calendarLead:     239182, // Phoebe Yang — Editorial Calendar Lead
  briefWriter:      239183, // Aiden Hsu — FB Content Brief Writer
  visualDirector:   239184, // Mandy Cheng — FB Visual Direction Lead
};

// Agent name (denormalized for steps JSON display)
const NAME: Record<number, string> = {
  180159: "Claire Hsu",
  239180: "Stacy Lin",
  239181: "Vincent Shen",
  239182: "Phoebe Yang",
  239183: "Aiden Hsu",
  239184: "Mandy Cheng",
};

const STEPS = [
  // ── Step 0: Intake Loader ───────────────────────────────────────────────
  {
    order: 0,
    name: "Intake：收集 + 自動推導 + 顯示缺口",
    description: "讀取 brand.positioning + events (target month) + event_products + brand assets。系統自動推 tilt 候選，識別用戶必填欄位。如果 OAuth 已授權則順便掃描 FB 已發貼文。",
    assignedAgentId: AGENT.squadLead,
    assignedAgentName: NAME[AGENT.squadLead],
    reviewerAgentId: null,
    outputKind: "decision",
    storageTarget: "mission_step_progress.canonical_message[step=0]",
    mockupVariant: "IntakeFormMockup",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0, requireBucketA: ["brands.positioning"] },
    aiModel: "claude-opus-4-6",
  },
  // ── Step 1: User Checkpoint (UI gate, no LLM) ───────────────────────────
  {
    order: 1,
    name: "🛑 User Checkpoint：確認 tilt + 填 pillar/cadence/KPI",
    description: "強制 UI gate。用戶看 step 0 的推導結果，確認 tilt、選 pillar 數量、cadence、KPI focus。可加日期鎖定 + 選 event 強調方向 + 選擇是否授權 FB 掃描。",
    assignedAgentId: AGENT.squadLead,
    assignedAgentName: NAME[AGENT.squadLead],
    reviewerAgentId: null,
    outputKind: "decision",
    storageTarget: "missions.taskUnits.brief",
    mockupVariant: "IntakeFormMockup",
    // CJ correction 2026-04-30: date is a date RANGE, not just month;
    // total_posts replaces posting_cadence (was redundant);
    // pillar definitions must include visualDirection (added in step 3).
    userInputFields: [
      { key: "target_date_start", label: "規劃起始日（年月日）",   type: "date", required: true },
      { key: "target_date_end",   label: "規劃結束日（年月日）",   type: "date", required: true },
      { key: "tilt_override",     label: "Tilt 確認/編輯",          type: "textarea", required: true },
      { key: "pillar_count",      label: "Pillar 數量",              type: "select", required: true,
        options: ["3", "4", "5"] },
      { key: "total_posts",       label: "總篇數（這段期間總共幾篇）", type: "number", required: true },
      { key: "kpi_focus",         label: "KPI focus",                type: "select", required: true,
        options: ["reach", "saves", "shares", "convert"] },
      { key: "event_focus",       label: "活動強調方向（每活動）",   type: "checkboxGroup", required: false,
        options: ["SMP", "messaging", "creative", "all"] },
      { key: "date_locks",        label: "特定日期主題鎖定（選填）",  type: "datelist", required: false },
      { key: "fb_oauth_token",    label: "FB OAuth 授權（選填）",   type: "text", required: false },
    ],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "n/a", // UI step
  },
  // ── Step 2: Audience × Pillar gap deep research ─────────────────────────
  {
    order: 2,
    name: "Pillar 受眾 × 競品 gap 深度研究",
    description: "Web 深度研究：受眾痛點驗證 (PTT/Reddit/Dcard)、競品 FB pillar map、平台演算法 prime time。輸出 research dossier 給 step 3 用。",
    assignedAgentId: AGENT.audienceInsight,
    assignedAgentName: NAME[AGENT.audienceInsight],
    reviewerAgentId: AGENT.squadLead,
    outputKind: "text_strategic",
    storageTarget: "brands.positioning._cms.pillarResearch",
    mockupVariant: "ResearchPanelMockup",
    userInputFields: [],
    dataRequirements: { minUrls: 8, minChars: 12000 },
    aiModel: "claude-opus-4-6",
  },
  // ── Step 3: N Pillars definition ────────────────────────────────────────
  {
    order: 3,
    name: "N Pillars 定義（含比例 + sample 主題 + 視覺方向）",
    description: "把 step 2 research distill 成 N 根 pillar，每根含：name / hypothesis / ratio% / target KPI / 5 個 sample 主題 / 視覺方向（image_brief 一致參考）。N 由用戶在 step 1 選定（3/4/5）。視覺方向欄位給 step 5 brief writer + visual director 一致基準。",
    assignedAgentId: AGENT.pillarArchitect,
    assignedAgentName: NAME[AGENT.pillarArchitect],
    reviewerAgentId: AGENT.squadLead,
    outputKind: "structured_table",
    storageTarget: "brands.positioning._cms.pillars",
    mockupVariant: "PillarTableMockup",
    userInputFields: [
      // Inline edit after AI generates: 用戶可改 name / ratio / sample 主題
      { key: "pillars",  label: "Pillar 編輯（AI 產出後）", type: "text", required: false },
    ],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "claude-opus-4-6",
  },
  // ── Step 4: Monthly calendar layout ─────────────────────────────────────
  {
    order: 4,
    name: "月度 Calendar 排程（date × pillar × format）",
    description: "把 pillars + ratios + event peaks + TW 節慶 + FB prime time 整合成可執行的月度排程（5 週 × 7 天月曆）。用戶可 drag-drop 換日期 / 鎖定。",
    assignedAgentId: AGENT.calendarLead,
    assignedAgentName: NAME[AGENT.calendarLead],
    reviewerAgentId: AGENT.squadLead,
    outputKind: "structured_table",
    storageTarget: "missions.taskUnits",
    mockupVariant: "CalendarGridMockup",
    userInputFields: [
      { key: "calendar_overrides", label: "排程調整（drag-drop 後）", type: "text", required: false },
    ],
    dataRequirements: { minUrls: 0, minChars: 0, requireBucketA: ["events"] },
    aiModel: "gpt-4.1",
  },
  // ── Step 5: Per-post briefs (text + image) ──────────────────────────────
  {
    order: 5,
    name: "Per-post 內容 brief（含視覺方向）",
    description: "對 calendar 每個 slot 產出可直接拍/設計的 brief：hook / 引言 / CTA / image direction。批量 16-20 篇，引用 brand voice 與 (如有) event.positioning slice。",
    assignedAgentId: AGENT.briefWriter,
    assignedAgentName: NAME[AGENT.briefWriter],
    reviewerAgentId: AGENT.visualDirector, // 視覺方向總監副審 image_brief
    outputKind: "text_content",
    storageTarget: "mission_step_progress.canonical_message[]",
    mockupVariant: "FBPostBriefMockup",
    userInputFields: [
      { key: "brief_overrides", label: "Per-post 編輯（hook / image direction）", type: "text", required: false },
    ],
    dataRequirements: { minUrls: 5, minChars: 4000 },
    aiModel: "claude-sonnet-4-5",
  },
  // ── Step 6: Squad Lead QA ───────────────────────────────────────────────
  {
    order: 6,
    name: "Squad Lead QA：pillar 比例 / event 整合 / 連續性",
    description: "Squad lead 換 model（gemini）抓 step 5 的 self-bias。檢核清單：pillar 比例對嗎、event peak 整合度、語氣一致性、format mix。每項 accept / 退回。",
    assignedAgentId: AGENT.squadLead,
    assignedAgentName: NAME[AGENT.squadLead],
    reviewerAgentId: null,
    outputKind: "qa_review",
    storageTarget: "mission_step_progress.canonical_message[step=6]",
    mockupVariant: "QAReportMockup",
    userInputFields: [
      { key: "qa_decisions", label: "Per-item accept / 退回", type: "text", required: true },
    ],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "gemini-2.5-flash",
  },
];

const SQUAD_AGENTS_JSON = [
  AGENT.squadLead, AGENT.audienceInsight, AGENT.pillarArchitect,
  AGENT.calendarLead, AGENT.briefWriter, AGENT.visualDirector,
].map((id, i) => ({
  id,
  name: NAME[id],
  role: i === 0 ? "Squad Lead" : "Specialist",
  is_lead: i === 0,
}));

const SQUAD_TAGS = [
  "facebook", "content-calendar", "content-pillar",
  "content-marketing", "monthly-planning", "pulizzi-school",
];

const PREFERRED_MODEL_TAGS = ["fast", "social-reel"]; // for any image briefs in step 5

(async () => {
  // Idempotent check
  const [existing]: any = await localPool.execute(
    `SELECT id, is_approved FROM squads WHERE slug = ? LIMIT 1`,
    [SQUAD_SLUG],
  );
  if ((existing as any[]).length > 0) {
    const row = (existing as any[])[0];
    console.log(`⚠ squad ${SQUAD_SLUG} already exists at id=${row.id} (is_approved=${row.is_approved})`);
    console.log("   skipping insert. To re-seed, delete the existing row first.");
    process.exit(0);
  }

  const nextRecommended = JSON.stringify({
    next_squad_slugs: [NEXT_RECOMMENDED_SQUAD],
    handoff_note: "把 mission_step_progress.canonical_message[step=5] 每篇 brief 餵進 fb-post-writer-from-brief 產出最終可發布貼文",
  });

  const [result]: any = await localPool.execute(
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
       missionType,
       showcases
     ) VALUES (
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       'core', 'L4_channel', ?,
       ?, ?,
       1, 0,
       'seeded', 'a2a', 'execution',
       'medium', 'medium',
       0, '1:1', 15,
       'monthly_calendar_brief_pack', 3,
       'monthly-calendar',
       ?
     )`,
    [
      SQUAD_SLUG,
      SQUAD_NAME,
      "用 Joe Pulizzi 內容支柱方法論 + Latane Conant 操作化框架，把品牌定位翻譯成可長期經營的 3-5 根 content pillar，再展開成可執行的 FB 月行事曆與 16-20 篇可直接製作的內容 brief。",
      "Joe Pulizzi - Content Inc. (2nd ed. 2021) + Latane Conant Pillar/Cluster",
      JSON.stringify(SQUAD_AGENTS_JSON),
      JSON.stringify(STEPS),
      AGENT.squadLead,
      JSON.stringify(SQUAD_TAGS),
      JSON.stringify(["facebook"]),
      JSON.stringify(["fb-monthly-calendar", "content-pillar-design"]),
      JSON.stringify(["calendar_grid", "post_brief", "pillar_table"]),
      nextRecommended,
    ],
  );

  const newId = Number(result.insertId);
  console.log(`✓ Inserted squad id=${newId} slug=${SQUAD_SLUG}`);
  console.log(`  is_approved=0 (drafted) — CJ must review before front-stage`);
  console.log(`  agents: ${SQUAD_AGENTS_JSON.map((a) => a.id).join(", ")}`);
  console.log(`  steps: ${STEPS.length}`);
  console.log(`  next recommended: ${NEXT_RECOMMENDED_SQUAD}`);
  process.exit(0);
})();
