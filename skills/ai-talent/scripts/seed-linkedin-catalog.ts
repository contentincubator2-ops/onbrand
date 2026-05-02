/**
 * seed-linkedin-catalog — bring LinkedIn online with B2B-focused
 * categories + tasks + one active squad (LinkedIn 月行事曆).
 *
 * Structure mirrors IG catalog:
 *   Planning:  li-monthly-calendar / li-content-strategy / li-quarterly-strategy
 *   Content:   li-feed-post / li-article / li-newsletter / li-document /
 *              li-native-video / li-poll / li-event-post
 *   Campaign:  li-sponsored-content / li-event-promotion
 *   Analytics: li-monthly-analytics
 *   Crisis:    li-crisis-statement
 *
 * 1 active squad: li-monthly-calendar (Pulizzi pattern, LI mockups)
 * 6 active atomics + 6 coming_soon
 *
 * Idempotent — UPSERT all rows.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

// ── Agent IDs (reuse cross-platform agents) ──────────────────────────────────
const A = {
  lead:            180159, // Claire Hsu (Squad Lead)
  audienceInsight: 239180, // Stacy Lin
  pillarArchitect: 239181, // Vincent Shen
  calendarLead:    239182, // Phoebe Yang
  briefWriter:     239183, // Aiden Hsu (content writer)
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

// ── LinkedIn Monthly Calendar Squad Steps ────────────────────────────────────
//
// Intake philosophy (2026-05-02 CJ direction):
//   Lead agent reads brands.positioning FIRST and pre-drafts every field it
//   can infer. User is only asked for the TWO things that cannot be inferred:
//     1. li_account_url  — LinkedIn authorization (must be human-provided)
//     2. target_month    — which month to plan (exact date, must be human-provided)
//   Everything else (biz goal, industry, newsletter preference, pillar count,
//   cadence, KPI focus) is drafted by the agent and presented for confirmation.
//
const LI_CALENDAR_STEPS: Step[] = [
  {
    order: 0,
    name: "Intake：授權帳號 + 目標月份（Lead 預填其餘）",
    description: `Lead agent 先從品牌定位資料 (brands.positioning) 自動推斷並預填：
月度業務目標、主攻受眾行業、是否包含 Newsletter、建議 pillar 數量、每週發文頻率、KPI 重心。
用戶只需提供兩項必填：
  ① LinkedIn 公司頁或個人帳號 URL（授權用）
  ② 目標月份（例如「2026年6月」）
Agent 輸出：一份已預填的 Brief 草稿，附上推斷依據說明，等待用戶在 Checkpoint 確認或修改。`,
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "decision", mockupVariant: "IntakeFormMockup",
    storageTarget: "mission_step_progress.canonical_message[step=0]",
    userInputFields: ["li_account_url", "target_month"],
    dataRequirements: { minUrls: 0, minChars: 0, requireBucketA: ["brands.positioning"] },
    aiModel: "claude-opus-4-6",
  },
  {
    order: 1,
    name: "🛑 Checkpoint：確認 / 修改 agent 預填的方向",
    description: `用戶審閱 agent 在 Step 0 預填的所有欄位，可直接確認或修改：
• 月度業務目標（agent 已依品牌定位推斷）
• 主攻受眾行業（agent 已依品牌定位推斷）
• 是否產 Newsletter（agent 建議 yes/no 並說明理由）
• Pillar 數量 / 每週頻率 / KPI 重心（agent 已給建議值）
UI step 不打 LLM，僅確認或覆寫。確認後，後續 step 使用最終值繼續執行。`,
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "decision", mockupVariant: "IntakeFormMockup",
    storageTarget: "mission_step_progress.canonical_message[step=1]",
    userInputFields: ["monthly_biz_goal", "target_industry", "include_newsletter", "pillar_count", "cadence_per_week", "kpi_focus"],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "n/a",
  },
  {
    order: 2,
    name: "B2B 受眾 × 競品 gap 深度研究",
    description: "從 LinkedIn 競品帳號 / 行業報告分析目標受眾的決策痛點和競品內容空白。",
    assignedAgentId: A.audienceInsight, assignedAgentName: NAME[A.audienceInsight],
    reviewerAgentId: A.lead,
    outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup",
    storageTarget: "mission_step_progress.canonical_message[step=2]",
    userInputFields: [],
    dataRequirements: { minUrls: 3, minChars: 5000 },
    aiModel: "claude-opus-4-6",
  },
  {
    order: 3,
    name: "N Pillars 定義（含比例 + Thought Leadership 角度）",
    description: "依研究結果定 N pillar，每根含比例 / KPI / 5-7 個 sample 主題 / LinkedIn 思想領導角度。",
    assignedAgentId: A.pillarArchitect, assignedAgentName: NAME[A.pillarArchitect],
    reviewerAgentId: A.lead,
    outputKind: "structured_table", mockupVariant: "PillarTableMockup",
    storageTarget: "mission_step_progress.canonical_message[step=3]",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "claude-opus-4-6",
  },
  {
    order: 4,
    name: "月度 Calendar 排程（date × pillar × format）",
    description: "把 pillar 比例展開成月度排程，分配 Feed / Article / Document / Poll / Native Video。標 LinkedIn prime time（早 7-9 點 / 午 11-12 點）。",
    assignedAgentId: A.calendarLead, assignedAgentName: NAME[A.calendarLead],
    reviewerAgentId: A.lead,
    outputKind: "structured_table", mockupVariant: "CalendarGridMockup",
    storageTarget: "mission_step_progress.canonical_message[step=4]",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "gpt-4.1",
  },
  {
    order: 5,
    name: "Per-post 內容 brief（Feed / Poll / Document 混合）",
    description: "依 calendar 產出每篇 brief。Feed → LIFeedMockup；Poll → LIPollMockup；Document → LIDocumentMockup；Article → LIArticleMockup。",
    assignedAgentId: A.briefWriter, assignedAgentName: NAME[A.briefWriter],
    reviewerAgentId: A.lead,
    outputKind: "text_content", mockupVariant: "LIFeedMockup",
    storageTarget: "mission_step_progress.canonical_message[step=5]",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "claude-sonnet-4-5",
  },
  {
    order: 6,
    name: "Squad Lead QA：B2B 語氣 / pillar 比例 / CTA 強度",
    description: "終審 LinkedIn 特有檢查：語氣是否符合 B2B 思想領導？pillar 比例是否平衡？每篇是否有清晰 CTA？",
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "qa_review", mockupVariant: "QAReportMockup",
    storageTarget: "mission_step_progress.canonical_message[step=6]",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "gemini-2.5-flash",
  },
];

// ── Categories ───────────────────────────────────────────────────────────────
interface CategorySpec {
  slug: string; name_zh: string; name_en: string; description: string;
  category_kind: "planning" | "content" | "campaign" | "analytics" | "crisis";
  default_mockup: string; search_keywords: string;
}

const CATEGORIES: CategorySpec[] = [
  // Planning
  { slug: "li-monthly-calendar", name_zh: "LinkedIn 月行事曆", name_en: "LI Monthly Calendar",
    description: "月度 LinkedIn 內容排程，混合 Feed / Article / Document / Poll。",
    category_kind: "planning", default_mockup: "CalendarGridMockup",
    search_keywords: "月行事曆,monthly,calendar,linkedin,排程,li" },
  { slug: "li-content-strategy", name_zh: "LinkedIn 內容支柱策略", name_en: "LI Content Strategy",
    description: "B2B 思想領導內容支柱規劃，含受眾洞察與競品空白分析。",
    category_kind: "planning", default_mockup: "PillarTableMockup",
    search_keywords: "策略,內容支柱,pillar,linkedin,b2b,思想領導" },
  { slug: "li-quarterly-strategy", name_zh: "LinkedIn 季度策略", name_en: "LI Quarterly Strategy",
    description: "三個月 LinkedIn 策略：pillar 配比、Newsletter 節奏、Event 規劃。",
    category_kind: "planning", default_mockup: "CalendarGridMockup",
    search_keywords: "季度,quarterly,linkedin,strategy,b2b" },
  // Content
  { slug: "li-feed-post", name_zh: "LinkedIn Feed 貼文", name_en: "LI Feed Post",
    description: "1 篇 LinkedIn Feed 貼文，B2B 思想領導語氣，含 hashtag 策略。",
    category_kind: "content", default_mockup: "LIFeedMockup",
    search_keywords: "貼文,文案,linkedin,feed,post,b2b" },
  { slug: "li-article", name_zh: "LinkedIn 長文 Article", name_en: "LI Article",
    description: "LinkedIn 原生長文章，含章節結構、副標題、CTA，最適合思想領導建立。",
    category_kind: "content", default_mockup: "LIArticleMockup",
    search_keywords: "長文,article,linkedin,思想領導,seo" },
  { slug: "li-newsletter", name_zh: "LinkedIn Newsletter 期刊", name_en: "LI Newsletter",
    description: "LinkedIn Newsletter 單期企劃，含主題、teaser、訂閱 CTA。",
    category_kind: "content", default_mockup: "LINewsletterMockup",
    search_keywords: "newsletter,期刊,linkedin,訂閱,郵件" },
  { slug: "li-document", name_zh: "LinkedIn Document 輪播", name_en: "LI Document Carousel",
    description: "LinkedIn PDF 輪播文件，含大綱結構與每頁重點，適合行業洞察分享。",
    category_kind: "content", default_mockup: "LIDocumentMockup",
    search_keywords: "document,輪播,pdf,linkedin,簡報,carousel" },
  { slug: "li-native-video", name_zh: "LinkedIn 原生影片腳本", name_en: "LI Native Video",
    description: "LinkedIn 原生影片腳本（Hook + 主體 + CTA），含縮圖方向 brief。",
    category_kind: "content", default_mockup: "LINativeVideoMockup",
    search_keywords: "影片,video,linkedin,腳本,native,原生" },
  { slug: "li-poll", name_zh: "LinkedIn 互動民調", name_en: "LI Poll",
    description: "LinkedIn 投票貼文，2-4 個選項，用於了解受眾觀點並提升互動率。",
    category_kind: "content", default_mockup: "LIPollMockup",
    search_keywords: "民調,poll,linkedin,投票,互動" },
  // Campaign
  { slug: "li-event-promotion", name_zh: "LinkedIn 活動宣傳", name_en: "LI Event Promotion",
    description: "LinkedIn 活動頁 + 宣傳 Feed 系列（預告、提醒、後續摘要）。",
    category_kind: "campaign", default_mockup: "LIEventMockup",
    search_keywords: "活動,event,linkedin,宣傳,promotion,webinar" },
  { slug: "li-sponsored-content", name_zh: "LinkedIn 贊助廣告文案", name_en: "LI Sponsored Content",
    description: "LinkedIn 付費推廣文案（Sponsored Content / Lead Gen Form），含 A/B 版本。",
    category_kind: "campaign", default_mockup: "LIAdMockup",
    search_keywords: "廣告,ad,sponsored,linkedin,文案,投放" },
  // Analytics
  { slug: "li-monthly-analytics", name_zh: "LinkedIn 月度成效報告", name_en: "LI Monthly Analytics",
    description: "LinkedIn 月度數據分析：貼文觸及、互動率、追蹤成長、內容形式 ROI。",
    category_kind: "analytics", default_mockup: "QAReportMockup",
    search_keywords: "分析,analytics,成效,linkedin,報告,數據" },
  // Crisis
  { slug: "li-crisis-statement", name_zh: "LinkedIn 危機聲明", name_en: "LI Crisis Statement",
    description: "LinkedIn 官方危機聲明，B2B 語氣，含安撫利害關係人的行動方案。",
    category_kind: "crisis", default_mockup: "LIFeedMockup",
    search_keywords: "危機,crisis,聲明,linkedin,公關,pr" },
];

// ── Tasks ────────────────────────────────────────────────────────────────────
interface TaskSpec {
  slug: string; name_zh: string; description: string;
  category_slug: string; impl_kind: "squad" | "atomic";
  status: "active" | "coming_soon";
  estimated_minutes: number;
  methodology_label?: string;
  mockup_hint?: string;
}

const TASKS: TaskSpec[] = [
  // Planning — active squad
  { slug: "li-monthly-calendar-pulizzi", name_zh: "內容支柱型 LinkedIn 月行事曆",
    description: "用 Joe Pulizzi 內容支柱方法論規劃 LinkedIn 月度內容。7 步驟，含受眾研究、pillar 定義、月曆排程。",
    category_slug: "li-monthly-calendar", impl_kind: "squad", status: "active",
    estimated_minutes: 45, methodology_label: "Joe Pulizzi Content Inc. 內容支柱法",
    mockup_hint: "CalendarGridMockup" },
  // Content — active atomics
  { slug: "li-feed-post-b2b", name_zh: "B2B 思想領導 LinkedIn 貼文",
    description: "1 篇 LinkedIn Feed 貼文，用 B2B 思想領導語氣分享行業洞察，含 3-5 個 hashtag。",
    category_slug: "li-feed-post", impl_kind: "atomic", status: "active",
    estimated_minutes: 10, mockup_hint: "LIFeedMockup" },
  { slug: "li-poll-engagement", name_zh: "LinkedIn 互動民調",
    description: "一則 LinkedIn Poll 貼文 + 背景說明文字，4 個選項，最適投放時段建議。",
    category_slug: "li-poll", impl_kind: "atomic", status: "active",
    estimated_minutes: 8, mockup_hint: "LIPollMockup" },
  { slug: "li-document-insight", name_zh: "LinkedIn 行業洞察 Document",
    description: "8-12 頁 LinkedIn Document 輪播，含每頁文案與視覺方向 brief。",
    category_slug: "li-document", impl_kind: "atomic", status: "active",
    estimated_minutes: 20, mockup_hint: "LIDocumentMockup" },
  { slug: "li-event-post", name_zh: "LinkedIn 活動宣傳貼文",
    description: "一篇 LinkedIn 活動頁宣傳貼文，含活動亮點、時間地點、RSVP CTA。",
    category_slug: "li-event-promotion", impl_kind: "atomic", status: "active",
    estimated_minutes: 10, mockup_hint: "LIEventMockup" },
  // Content — coming_soon squads
  { slug: "li-article-thought-leadership", name_zh: "LinkedIn 思想領導長文 Article",
    description: "1,500-2,500 字 LinkedIn 長文章，含 SEO 標題、章節結構、行業洞察、CTA。",
    category_slug: "li-article", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 35, methodology_label: "SEO + 思想領導文章框架",
    mockup_hint: "LIArticleMockup" },
  { slug: "li-newsletter-issue", name_zh: "LinkedIn Newsletter 期刊企劃",
    description: "LinkedIn Newsletter 單期完整企劃：主題選定、tease 文、完整內文結構、訂閱 CTA。",
    category_slug: "li-newsletter", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 40, mockup_hint: "LINewsletterMockup" },
  { slug: "li-native-video-script", name_zh: "LinkedIn 原生影片腳本",
    description: "60-90 秒 LinkedIn 原生影片完整腳本，含縮圖 brief、Hook、主體、CTA。",
    category_slug: "li-native-video", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 25, mockup_hint: "LINativeVideoMockup" },
  // Campaign — coming_soon
  { slug: "li-sponsored-ab", name_zh: "LinkedIn 廣告文案 A/B 版",
    description: "LinkedIn Sponsored Content 雙版文案（A/B test），含 Headline、Intro Text、CTA、目標受眾設定建議。",
    category_slug: "li-sponsored-content", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 30, mockup_hint: "LIAdMockup" },
  // Analytics — coming_soon
  { slug: "li-monthly-report", name_zh: "LinkedIn 月度成效分析報告",
    description: "LinkedIn 月度數據分析報告：觸及成長、互動率、最佳貼文、格式 ROI、下月策略建議。",
    category_slug: "li-monthly-analytics", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 30, mockup_hint: "QAReportMockup" },
  // Planning — coming_soon
  { slug: "li-content-strategy-full", name_zh: "LinkedIn 內容支柱策略規劃",
    description: "完整 B2B 內容支柱策略：受眾研究 → pillar 定義 → 格式配比 → KPI 設定。",
    category_slug: "li-content-strategy", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 50, mockup_hint: "PillarTableMockup" },
  // Crisis — coming_soon
  { slug: "li-crisis-statement-draft", name_zh: "LinkedIn 危機聲明稿",
    description: "LinkedIn 官方危機聲明，適合 B2B 利害關係人，含事實說明、處理措施、後續行動。",
    category_slug: "li-crisis-statement", impl_kind: "atomic", status: "coming_soon",
    estimated_minutes: 15, mockup_hint: "LIFeedMockup" },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  // 1. Upsert categories
  console.log("1. Upserting LinkedIn categories…");
  for (const c of CATEGORIES) {
    await pool.execute(
      `INSERT INTO task_category (slug, name_zh, name_en, description, category_kind, default_mockup, search_keywords, workspace, is_open_for_methods)
       VALUES (?,?,?,?,?,?,?,'linkedin',0)
       ON DUPLICATE KEY UPDATE
         name_zh=VALUES(name_zh), name_en=VALUES(name_en), description=VALUES(description),
         category_kind=VALUES(category_kind), default_mockup=VALUES(default_mockup),
         search_keywords=VALUES(search_keywords), workspace='linkedin'`,
      [c.slug, c.name_zh, c.name_en, c.description, c.category_kind, c.default_mockup, c.search_keywords],
    );
    console.log(`  ✓ category: ${c.slug}`);
  }

  // 2. Seed the LinkedIn calendar squad
  console.log("\n2. Seeding LI Calendar squad…");
  const agentsJson = JSON.stringify([
    { id: A.lead, name: NAME[A.lead], role: "Squad Lead", is_lead: true },
    { id: A.audienceInsight, name: NAME[A.audienceInsight], role: "B2B Audience Research" },
    { id: A.pillarArchitect, name: NAME[A.pillarArchitect], role: "Content Pillar Architect" },
    { id: A.calendarLead, name: NAME[A.calendarLead], role: "Calendar Planner" },
    { id: A.briefWriter, name: NAME[A.briefWriter], role: "Content Writer" },
  ]);
  const stepsJson = JSON.stringify(LI_CALENDAR_STEPS);
  const [squadResult]: any = await pool.execute(
    `INSERT INTO squads (slug, name, description, workspace, agents, steps, is_active, is_approved)
     VALUES (?, ?, ?, 'linkedin', ?, ?, 1, 1)
     ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
       workspace=VALUES(workspace), agents=VALUES(agents), steps=VALUES(steps),
       is_active=1, is_approved=1`,
    [
      "li-monthly-calendar-pulizzi",
      "Joe Pulizzi 內容支柱 LinkedIn 月行事曆小組",
      "用 Pulizzi 內容支柱方法論為 LinkedIn 規劃月度內容。涵蓋 Feed / Article / Document / Poll 四種格式的 B2B 思想領導排程。",
      agentsJson, stepsJson,
    ],
  );
  const [squadRow]: any = await pool.execute(
    `SELECT id FROM squads WHERE slug='li-monthly-calendar-pulizzi' LIMIT 1`,
  );
  const calendarSquadId = (squadRow as any[])[0]?.id;
  console.log(`  ✓ squad id=${calendarSquadId}`);

  // 3. Upsert tasks
  console.log("\n3. Upserting LinkedIn tasks…");
  for (const t of TASKS) {
    const [catRow]: any = await pool.execute(
      `SELECT id FROM task_category WHERE slug=? LIMIT 1`, [t.category_slug],
    );
    const catId = (catRow as any[])[0]?.id ?? null;

    const squadId = (t.slug === "li-monthly-calendar-pulizzi" && t.impl_kind === "squad")
      ? calendarSquadId : null;

    await pool.execute(
      `INSERT INTO task_catalog
         (slug, name_zh, description, workspace, category_id, category, impl_kind,
          status, estimated_minutes, methodology_label, squad_id)
       VALUES (?,?,?,'linkedin',?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         name_zh=VALUES(name_zh), description=VALUES(description),
         category_id=VALUES(category_id), category=VALUES(category),
         impl_kind=VALUES(impl_kind), status=VALUES(status),
         estimated_minutes=VALUES(estimated_minutes),
         methodology_label=VALUES(methodology_label),
         squad_id=COALESCE(VALUES(squad_id), squad_id)`,
      [
        t.slug, t.name_zh, t.description,
        catId, t.category_slug, t.impl_kind,
        t.status, t.estimated_minutes,
        t.methodology_label ?? null,
        squadId,
      ],
    );
    const badge = t.status === "active" ? "🟢" : "🟡";
    console.log(`  ${badge} task: ${t.slug} (${t.impl_kind})`);
  }

  console.log("\n✅ LinkedIn catalog seeded:");
  console.log(`  categories: ${CATEGORIES.length}`);
  console.log(`  tasks: ${TASKS.length} (${TASKS.filter(t => t.status === "active").length} active, ${TASKS.filter(t => t.status === "coming_soon").length} coming_soon)`);
  console.log("  squads: 1 active (li-monthly-calendar-pulizzi)");

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
