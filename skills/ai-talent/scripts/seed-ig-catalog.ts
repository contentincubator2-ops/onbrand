/**
 * seed-ig-catalog — bring Instagram online with categories + tasks
 * mirroring the FB catalog structure.
 *
 * 12 categories (parallel to FB):
 *   Planning:  ig-monthly-calendar / ig-account-reposition / ig-quarterly-strategy
 *   Campaign:  ig-event-launch-kit / ig-countdown-series / ig-livestream-prep
 *   Content:   ig-single-post / ig-stories / ig-carousel / ig-reels
 *   Analytics: ig-monthly-analytics
 *   Crisis:    ig-comment-reply
 *
 * Tasks (this turn):
 *   - 1 squad-impl active: ig-monthly-calendar (clone of fb pulizzi
 *     squad with IG-specific mockup variants per step)
 *   - 7 atomic-impl active: bound to existing FB-team agents
 *     (Aiden Hsu for content, Mandy for visual brief)
 *   - 4 squad-impl coming_soon: launch-kit / countdown / livestream /
 *     reposition / quarterly / analytics
 *
 * Idempotent — UPSERT all rows.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const A = {
  lead:            180159, // Claire Hsu
  audienceInsight: 239180, // Stacy Lin
  pillarArchitect: 239181, // Vincent Shen
  calendarLead:    239182, // Phoebe Yang
  briefWriter:     239183, // Aiden Hsu (cross-platform writer)
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

// ── IG Monthly Calendar squad (mirror FB Pulizzi but with IG mockups) ──
const IG_CALENDAR_STEPS: Step[] = [
  {
    order: 0,
    name: "Intake：IG 帳號 + 主推活動 + Story 節奏",
    description: "蒐集 IG 帳號連結 / 主推活動 / 想用 Story 還是 Reels 為主 / 該月主題色彩。",
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "decision", mockupVariant: "IntakeFormMockup",
    storageTarget: "mission_step_progress.canonical_message[step=0]",
    userInputFields: ["ig_handle", "primary_event", "story_vs_reels_focus", "month_palette"],
    dataRequirements: { minUrls: 0, minChars: 0, requireBucketA: ["context.brand", "context.product?", "context.event?"] },
    aiModel: "claude-opus-4-6",
  },
  {
    order: 1,
    name: "🛑 Checkpoint：確認 tilt + 填 pillar/cadence/KPI",
    description: "用戶確認方向，補關鍵欄位。UI step 不打 LLM。",
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "decision", mockupVariant: "IntakeFormMockup",
    storageTarget: "mission_step_progress.canonical_message[step=1]",
    userInputFields: ["pillar_count", "cadence", "kpi_focus"],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "n/a",
  },
  {
    order: 2,
    name: "Pillar 受眾 × 競品 gap 深度研究",
    description: "從 IG hashtag / 帳號分析找出受眾真實在意的議題與競品空白。",
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
    name: "N Pillars 定義（含比例 + sample 主題 + 視覺方向）",
    description: "依研究結果定 N pillar，每根含比例 / KPI / 5-7 個 sample 主題 / 視覺一致性方向（IG 重視覺）。",
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
    description: "把 pillar 比例展開成 30 天排程，分配到 Post / Carousel / Reels / Story。標 IG-prime time（晚 8-10 點 / 中午 12-1 點）。",
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
    name: "Per-post 內容 brief（Post / Carousel / Story / Reels 混合）",
    description: "依 calendar 產出每篇 brief。Post → IGPostBriefMockup；Carousel → IGPostBriefMockup（mode=carousel）；Story → IGStoryMockup；Reels → IGReelsMockup。",
    assignedAgentId: A.briefWriter, assignedAgentName: NAME[A.briefWriter],
    reviewerAgentId: A.lead,
    outputKind: "text_content", mockupVariant: "IGPostBriefMockup",
    storageTarget: "mission_step_progress.canonical_message[step=5]",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "claude-sonnet-4-5",
  },
  {
    order: 6,
    name: "Squad Lead QA：pillar 比例 / 視覺一致性 / Story-Reel 混合",
    description: "終審 IG 特有檢查：視覺風格是否一致？Story 和 Reels 比例是否平衡？hashtag 策略是否合理？",
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "qa_review", mockupVariant: "QAReportMockup",
    storageTarget: "mission_step_progress.canonical_message[step=6]",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "gemini-2.5-flash",
  },
];

const IG_CALENDAR_SQUAD = {
  slug: "ig-monthly-calendar-pulizzi",
  name: "Joe Pulizzi 內容支柱 Instagram 月行事曆小組",
  description: "用 Pulizzi 內容支柱方法論為 IG 規劃 30 天內容。涵蓋 Post / Carousel / Story / Reels 四種格式的 pillar 比例與排程。",
  methodology: "Joe Pulizzi Content Inc. + Latane Conant Pillar/Cluster",
  steps: IG_CALENDAR_STEPS,
  workspace: ["instagram"],
  tags: ["instagram", "monthly-calendar", "pulizzi", "pillar"],
  use_cases: ["ig-monthly-calendar", "ig-content-planning"],
  output_formats: ["calendar_grid", "post_brief", "pillar_table", "qa_report"],
  deliverable_format: "ig_monthly_calendar_pack",
  missionType: "ig-monthly-calendar",
};

// ── Categories ──────────────────────────────────────────────────────────
interface CategorySpec {
  slug: string; name_zh: string; name_en: string; description: string;
  category_kind: "planning" | "content" | "campaign" | "analytics" | "crisis";
  default_mockup: string;
  search_keywords: string;
}

const CATEGORIES: CategorySpec[] = [
  // Planning
  { slug: "ig-monthly-calendar", name_zh: "Instagram 月行事曆",
    name_en: "IG Monthly Calendar",
    description: "30 天 IG 內容排程，混合 Post / Carousel / Story / Reels。",
    category_kind: "planning", default_mockup: "CalendarGridMockup",
    search_keywords: "月行事曆,monthly,calendar,ig,instagram,排程" },
  { slug: "ig-account-reposition", name_zh: "Instagram 帳號重新定位",
    name_en: "IG Account Reposition",
    description: "現有 IG 帳號 audit + 視覺風格重塑 + 新 tilt 主張。",
    category_kind: "planning", default_mockup: "ResearchPanelMockup",
    search_keywords: "帳號,定位,reposition,ig,instagram,品牌" },
  { slug: "ig-quarterly-strategy", name_zh: "Instagram 季度策略",
    name_en: "IG Quarterly Strategy",
    description: "三個月 IG 策略：pillar 配比、Story / Reels 節奏、Highlight 結構。",
    category_kind: "planning", default_mockup: "CalendarGridMockup",
    search_keywords: "季度,quarterly,ig,instagram,strategy" },
  // Campaign
  { slug: "ig-event-launch-kit", name_zh: "Instagram 活動上線套組",
    name_en: "IG Event Launch Kit",
    description: "為一場活動產出 IG 預熱 + 當天 + 後續貼文 + Story takeover。",
    category_kind: "campaign", default_mockup: "IGPostBriefMockup",
    search_keywords: "活動,上線,event,launch,ig,instagram" },
  { slug: "ig-countdown-series", name_zh: "Instagram 倒數活動系列",
    name_en: "IG Countdown Series",
    description: "活動前 5-7 天每日 1 篇 IG 倒數，含 Story 倒數 sticker。",
    category_kind: "campaign", default_mockup: "IGPostBriefMockup",
    search_keywords: "倒數,countdown,系列,ig,instagram" },
  { slug: "ig-livestream-prep", name_zh: "Instagram Live 預告 + 後續摘要",
    name_en: "IG Live Prep",
    description: "IG Live 前預告 (Post + Story) + Live 後摘要 (Reel + Highlight)。",
    category_kind: "campaign", default_mockup: "IGPostBriefMockup",
    search_keywords: "直播,live,預告,摘要,ig,instagram" },
  // Content
  { slug: "ig-single-post", name_zh: "Instagram 單篇貼文",
    name_en: "IG Single Post",
    description: "1 篇 IG 貼文。可選純文字、配圖、或加視覺方向 brief。",
    category_kind: "content", default_mockup: "IGPostBriefMockup",
    search_keywords: "貼文,文案,ig,instagram,post" },
  { slug: "ig-stories", name_zh: "Instagram Stories 系列",
    name_en: "IG Stories Series",
    description: "3-7 張連續 Story（24h takeover / behind-the-scenes / AMA）。含 sticker 配置（poll / question / link / countdown）。",
    category_kind: "content", default_mockup: "IGStoryMockup",
    search_keywords: "stories,story,ig,instagram,sticker,24h" },
  { slug: "ig-carousel", name_zh: "Instagram 輪播圖文",
    name_en: "IG Carousel",
    description: "5-10 張連續 IG 輪播圖文，每張獨立卡片 + 整體敘事弧。",
    category_kind: "content", default_mockup: "IGPostBriefMockup",
    search_keywords: "carousel,輪播,圖文,ig,instagram,swipe" },
  { slug: "ig-reels", name_zh: "Instagram Reels 短影音",
    name_en: "IG Reels",
    description: "15/30/60/90 秒短影音腳本，含 hook / hold / build / payoff / CTA 分鏡 + 音訊配置。",
    category_kind: "content", default_mockup: "IGReelsMockup",
    search_keywords: "reels,短影音,ig,instagram,腳本,script" },
  // Analytics
  { slug: "ig-monthly-analytics", name_zh: "Instagram 月度成效報告",
    name_en: "IG Monthly Analytics",
    description: "上月 IG 成效彙整：reach / engagement / Story 完看率 / Reels 平均播放秒數 / 下月優化建議。",
    category_kind: "analytics", default_mockup: "ResearchPanelMockup",
    search_keywords: "成效,月報,analytics,ig,instagram,reach,engagement" },
  // Crisis
  { slug: "ig-comment-reply", name_zh: "Instagram 留言/DM 回覆",
    name_en: "IG Comment Reply",
    description: "針對 IG 留言 / DM 客訴 / 負評的公開回覆草稿（含致歉 + 解釋 + 私訊邀請）。",
    category_kind: "crisis", default_mockup: "IGPostBriefMockup",
    search_keywords: "留言,客訴,負評,回覆,ig,instagram,DM" },
];

// ── Tasks ────────────────────────────────────────────────────────────────
interface TaskSpec {
  slug: string; name_zh: string; name_en: string; description: string;
  category_slug: string;
  impl_kind: "atomic" | "squad";
  squad_slug?: string;
  agent_id?: number;
  status: "active" | "coming_soon";
  bypassable: boolean;
  search_keywords: string;
  estimated_minutes: number;
  methodology_label: string;
}

const TASKS: TaskSpec[] = [
  // Active squad
  {
    slug: "ig-monthly-calendar-pulizzi", name_zh: "內容支柱型 IG 月行事曆",
    name_en: "IG Monthly Calendar (Pulizzi)",
    description: "Pulizzi 內容支柱方法論版的 IG 月曆。Post + Carousel + Story + Reels 混合排程。",
    category_slug: "ig-monthly-calendar",
    impl_kind: "squad", squad_slug: "ig-monthly-calendar-pulizzi",
    status: "active", bypassable: true,
    search_keywords: "ig,instagram,月行事曆,pulizzi,內容支柱",
    estimated_minutes: 25,
    methodology_label: "Joe Pulizzi 內容支柱法",
  },
  // Active atomic — 7 of them
  {
    slug: "ig-single-post-image", name_zh: "視覺先行型 IG 單篇貼文",
    name_en: "IG Single Post (Image)",
    description: "1 篇 IG 貼文 + 視覺方向 brief。1:1 square 或 4:5 portrait。",
    category_slug: "ig-single-post",
    impl_kind: "atomic", agent_id: A.briefWriter,
    status: "active", bypassable: true,
    search_keywords: "ig,單篇貼文,配圖,視覺,square",
    estimated_minutes: 5,
    methodology_label: "Hook + 視覺方向 brief（IG 版）",
  },
  {
    slug: "ig-single-post-text", name_zh: "極簡純文字型 IG 單篇貼文",
    name_en: "IG Single Post (Text Only)",
    description: "1 篇 IG 純文字貼文（白底文字 / 漸層底色）。適合宣告、語錄。",
    category_slug: "ig-single-post",
    impl_kind: "atomic", agent_id: A.briefWriter,
    status: "active", bypassable: true,
    search_keywords: "ig,純文字,純文字版,語錄,宣告",
    estimated_minutes: 3,
    methodology_label: "Hook + CTA 純文字版（IG 版）",
  },
  {
    slug: "ig-stories-series", name_zh: "互動 sticker 型 IG Stories 系列",
    name_en: "IG Stories Series",
    description: "3-7 張連續 Story 含 poll / question / countdown / link sticker，敘事弧串連。",
    category_slug: "ig-stories",
    impl_kind: "atomic", agent_id: A.briefWriter,
    status: "active", bypassable: true,
    search_keywords: "ig,stories,sticker,poll,question,24h",
    estimated_minutes: 8,
    methodology_label: "互動 sticker 串聯敘事法",
  },
  {
    slug: "ig-carousel", name_zh: "敘事弧型 IG 輪播",
    name_en: "IG Carousel",
    description: "5-10 張 IG 輪播 + Hook-Build-Turn-Payoff-CTA 敘事弧。",
    category_slug: "ig-carousel",
    impl_kind: "atomic", agent_id: A.briefWriter,
    status: "active", bypassable: true,
    search_keywords: "ig,carousel,輪播,敘事弧,swipe",
    estimated_minutes: 10,
    methodology_label: "Hook-Build-Turn-Payoff 敘事弧法（IG 版）",
  },
  {
    slug: "ig-reels-script", name_zh: "Hook-Hold-Payoff 型 IG Reels",
    name_en: "IG Reels Script",
    description: "15/30/60/90s Reels 腳本 + 音訊配置（原創/熱門/授權）+ remix 設定。",
    category_slug: "ig-reels",
    impl_kind: "atomic", agent_id: A.briefWriter,
    status: "active", bypassable: true,
    search_keywords: "ig,reels,短影音,hook,hold,payoff,腳本",
    estimated_minutes: 8,
    methodology_label: "Hook-Hold-Payoff 短影音法（IG 版 + 音訊策略）",
  },
  {
    slug: "ig-livestream-prep", name_zh: "成對敘事型 IG Live 預告 + 摘要",
    name_en: "IG Live Prep",
    description: "Live 前預告 (Post + Story) + Live 後摘要 (Reel + Highlight cover)。",
    category_slug: "ig-livestream-prep",
    impl_kind: "atomic", agent_id: A.briefWriter,
    status: "active", bypassable: true,
    search_keywords: "ig,live,直播,預告,摘要,highlight",
    estimated_minutes: 8,
    methodology_label: "Live 前後成對敘事一致性法",
  },
  {
    slug: "ig-comment-reply", name_zh: "Lagadec 四段式型 IG 留言/DM 回覆",
    name_en: "IG Comment Reply",
    description: "致歉 + 解釋 + 承諾 + 私訊邀請四段式（IG 版，含 DM 模板）。需用戶貼上原始留言。",
    category_slug: "ig-comment-reply",
    impl_kind: "atomic", agent_id: A.crisisComms,
    status: "active", bypassable: false,
    search_keywords: "ig,留言,客訴,負評,DM,回覆,危機",
    estimated_minutes: 4,
    methodology_label: "Lagadec 致歉 + 解釋 + 承諾 + 私訊四段式（IG 版）",
  },
  // coming_soon
  { slug: "ig-event-launch-kit", name_zh: "Jab-Hook 型 IG 活動上線套組",
    name_en: "IG Event Launch Kit", description: "IG 版 Jab-Hook 活動上線：預熱 Post + Story takeover + 當天 Reel + 後續 carousel。",
    category_slug: "ig-event-launch-kit", impl_kind: "squad", status: "coming_soon", bypassable: true,
    search_keywords: "ig,活動,上線,event,launch,jab-hook", estimated_minutes: 18,
    methodology_label: "GaryVee Jab-Hook（IG 版）" },
  { slug: "ig-countdown-series", name_zh: "Cialdini 緊迫型 IG 倒數系列",
    name_en: "IG Countdown Series", description: "IG 版倒數系列，含 Story countdown sticker + 每日 1 篇 Post 遞進。",
    category_slug: "ig-countdown-series", impl_kind: "squad", status: "coming_soon", bypassable: true,
    search_keywords: "ig,倒數,countdown,scarcity", estimated_minutes: 12,
    methodology_label: "Cialdini Scarcity（IG 版 + countdown sticker）" },
  { slug: "ig-account-reposition", name_zh: "Tilt 鋒利型 IG 帳號重新定位",
    name_en: "IG Account Reposition", description: "IG 帳號 audit（grid 視覺一致性 + 內容比例）+ 競品比對 + 新 tilt 主張。",
    category_slug: "ig-account-reposition", impl_kind: "squad", status: "coming_soon", bypassable: false,
    search_keywords: "ig,帳號,定位,reposition,grid", estimated_minutes: 35,
    methodology_label: "Trout Positioning + Pulizzi Tilt（IG 版 + grid audit）" },
  { slug: "ig-quarterly-strategy", name_zh: "Pulizzi 季度節奏型 IG 策略",
    name_en: "IG Quarterly Strategy", description: "三個月 IG 策略：pillar 配比 + Story/Reels 比重 + Highlight 結構。",
    category_slug: "ig-quarterly-strategy", impl_kind: "squad", status: "coming_soon", bypassable: true,
    search_keywords: "ig,季度,quarterly,strategy", estimated_minutes: 38,
    methodology_label: "Pulizzi Quarterly Cadence（IG 版）" },
  { slug: "ig-monthly-analytics", name_zh: "數據驅動型 IG 月度成效報告",
    name_en: "IG Monthly Analytics", description: "上月 reach / engagement / Story 完看率 / Reels 平均播放秒數 + 下月優化。",
    category_slug: "ig-monthly-analytics", impl_kind: "squad", status: "coming_soon", bypassable: false,
    search_keywords: "ig,成效,月報,analytics,reach,engagement", estimated_minutes: 14,
    methodology_label: "Kaushik Web Analytics 2.0（IG 版指標組合）" },
];

async function seedSquad(pool: mysql.Pool): Promise<number> {
  const sq = IG_CALENDAR_SQUAD;
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
      `UPDATE squads SET name=?, description=?, methodology=?, agents=?, steps=?,
                          lead_agent_id=?, tags=?, workspace=?, use_cases=?,
                          output_formats=?, deliverable_format=?, missionType=?,
                          is_approved=1, approved_at=NOW()
        WHERE id=?`,
      [sq.name, sq.description, sq.methodology,
       JSON.stringify(agentsJson), JSON.stringify(sq.steps), A.lead,
       JSON.stringify(sq.tags), JSON.stringify(sq.workspace),
       JSON.stringify(sq.use_cases), JSON.stringify(sq.output_formats),
       sq.deliverable_format, sq.missionType,
       exists.id],
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
       deliverable_format, deliverable_level, missionType
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?,
       'core', 'L4_channel', ?, ?, ?,
       1, 1, NOW(),
       'seeded', 'a2a', 'execution',
       'medium', 'medium',
       0, '1:1', 15,
       ?, 3, ?
     )`,
    [sq.slug, sq.name, sq.description, sq.methodology,
     JSON.stringify(agentsJson), JSON.stringify(sq.steps), A.lead,
     JSON.stringify(sq.tags), JSON.stringify(sq.workspace),
     JSON.stringify(sq.use_cases), JSON.stringify(sq.output_formats),
     sq.deliverable_format, sq.missionType],
  );
  console.log(`  ✓ inserted squad #${r?.insertId}  ${sq.slug}  (${sq.steps.length} steps)`);
  return Number(r?.insertId ?? 0);
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  console.log(`[seed-ig-catalog] inserting IG monthly-calendar squad…\n`);
  const igCalendarSquadId = await seedSquad(pool);

  console.log(`\n[seed-ig-catalog] inserting ${CATEGORIES.length} categories…`);
  const catIds: Record<string, number> = {};
  for (const c of CATEGORIES) {
    const [exist]: any = await pool.execute(
      `SELECT id FROM task_category WHERE slug=? LIMIT 1`, [c.slug],
    );
    if ((exist as any[])[0]) {
      catIds[c.slug] = Number((exist as any[])[0].id);
      await pool.execute(
        `UPDATE task_category SET name_zh=?, name_en=?, description=?, workspace='instagram',
                                    category_kind=?, default_mockup=?, search_keywords=?,
                                    status='active', is_open_for_methods=1
          WHERE id=?`,
        [c.name_zh, c.name_en, c.description, c.category_kind, c.default_mockup, c.search_keywords, catIds[c.slug]],
      );
      console.log(`  ✓ updated category #${catIds[c.slug]}  ${c.slug}`);
    } else {
      const [r]: any = await pool.execute(
        `INSERT INTO task_category
           (slug, name_zh, name_en, description, workspace, category_kind,
            default_mockup, search_keywords, status, is_open_for_methods)
         VALUES (?,?,?,?,'instagram',?,?,?,'active',1)`,
        [c.slug, c.name_zh, c.name_en, c.description, c.category_kind, c.default_mockup, c.search_keywords],
      );
      catIds[c.slug] = Number(r?.insertId ?? 0);
      console.log(`  ✓ inserted category #${catIds[c.slug]}  ${c.slug}`);
    }
  }

  console.log(`\n[seed-ig-catalog] inserting ${TASKS.length} tasks…`);
  for (const t of TASKS) {
    const categoryId = catIds[t.category_slug];
    if (!categoryId) { console.warn(`  ⚠ category ${t.category_slug} not found — skipping ${t.slug}`); continue; }
    let squadId: number | null = null;
    let agentId: number | null = null;
    if (t.impl_kind === "squad") {
      if (t.squad_slug) {
        const [r]: any = await pool.execute(`SELECT id FROM squads WHERE slug=? LIMIT 1`, [t.squad_slug]);
        squadId = (r as any[])?.[0]?.id ?? null;
      }
      if (!squadId && t.status === "active") {
        console.warn(`  ⚠ ${t.slug}: squad ${t.squad_slug} not found — downgrading to coming_soon`);
        t.status = "coming_soon";
      }
    } else {
      agentId = t.agent_id ?? null;
    }
    const [exist]: any = await pool.execute(`SELECT id FROM task_catalog WHERE slug=? LIMIT 1`, [t.slug]);
    const cat = CATEGORIES.find((c) => c.slug === t.category_slug)!;
    if ((exist as any[])[0]) {
      await pool.execute(
        `UPDATE task_catalog
            SET name_zh=?, name_en=?, description=?, workspace='instagram',
                category=?, impl_kind=?, squad_id=?, agent_id=?,
                status=?, bypassable=?, search_keywords=?, estimated_minutes=?,
                category_id=?, methodology_label=?
          WHERE id=?`,
        [t.name_zh, t.name_en, t.description, cat.category_kind, t.impl_kind,
         squadId, agentId, t.status, t.bypassable ? 1 : 0,
         t.search_keywords, t.estimated_minutes,
         categoryId, t.methodology_label,
         (exist as any[])[0].id],
      );
      console.log(`  ✓ updated task #${(exist as any[])[0].id}  ${t.slug}  (${t.status})`);
    } else {
      const [r]: any = await pool.execute(
        `INSERT INTO task_catalog
           (slug, name_zh, name_en, description, workspace, category,
            impl_kind, squad_id, agent_id, status, bypassable,
            search_keywords, estimated_minutes,
            category_id, methodology_label)
         VALUES (?,?,?,?,'instagram',?,?,?,?,?,?,?,?,?,?)`,
        [t.slug, t.name_zh, t.name_en, t.description, cat.category_kind,
         t.impl_kind, squadId, agentId, t.status, t.bypassable ? 1 : 0,
         t.search_keywords, t.estimated_minutes,
         categoryId, t.methodology_label],
      );
      console.log(`  ✓ inserted task #${r?.insertId}  ${t.slug}  (${t.status})`);
    }
  }

  // Final state
  const [stateRows]: any = await pool.execute(
    `SELECT status, COUNT(*) AS c FROM task_catalog WHERE workspace='instagram' GROUP BY status`,
  );
  console.log(`\n=== IG catalog state ===`);
  for (const r of (stateRows as any[])) console.log(`  ${r.status}: ${r.c}`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
