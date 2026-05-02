/**
 * seed-tiktok-catalog — bring TikTok online.
 *
 * Note: TikTok overlaps heavily with IG Reels (both 9:16 short-form).
 * Squad steps reuse the same agents and 3-segment script structure.
 * Mockups: TTForYouMockup / TTCarouselMockup / TTLiveMockup.
 *
 * Categories (5):
 *   Content:   tt-video-script / tt-carousel-post
 *   Campaign:  tt-live-event / tt-hashtag-challenge
 *   Analytics: tt-monthly-analytics
 *
 * Tasks (7): 3 active, 4 coming_soon
 *
 * Idempotent — UPSERT all rows.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const A = {
  lead:            180159,
  audienceInsight: 239180,
  briefWriter:     239183,
  visualDirector:  239184,
  perfAnalyst:     239186,
};
const NAME: Record<number, string> = {
  180159: "Claire Hsu", 239180: "Stacy Lin",
  239183: "Aiden Hsu", 239184: "Mandy Cheng", 239186: "Hailey Huang",
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

const TT_VIDEO_STEPS: Step[] = [
  {
    order: 0,
    name: "Intake：帳號定位 + 影片主題 + 目標受眾",
    description: "蒐集 TikTok 帳號 URL / 影片主題 / 目標受眾年齡層 / 是否需要配樂方向 / 期望秒數。",
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "decision", mockupVariant: "IntakeFormMockup",
    storageTarget: "mission_step_progress.canonical_message[step=0]",
    userInputFields: ["tt_account_url", "video_topic", "target_age", "duration_sec", "audio_direction"],
    dataRequirements: { minUrls: 0, minChars: 0, requireBucketA: ["brands.positioning"] },
    aiModel: "claude-opus-4-6",
  },
  {
    order: 1,
    name: "🛑 Checkpoint：確認角度 + Hook 方向",
    description: "用戶確認 Hook 方向，補關鍵欄位。UI step 不打 LLM。",
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "decision", mockupVariant: "IntakeFormMockup",
    storageTarget: "mission_step_progress.canonical_message[step=1]",
    userInputFields: ["confirmed_angle", "hook_style"],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "n/a",
  },
  {
    order: 2,
    name: "競品 TikTok 研究 + 趨勢音樂 / hashtag 分析",
    description: "分析同類 TikTok 帳號的熱門影片、使用的音樂趨勢與 hashtag 策略，找出差異化角度。",
    assignedAgentId: A.audienceInsight, assignedAgentName: NAME[A.audienceInsight],
    reviewerAgentId: A.lead,
    outputKind: "text_strategic", mockupVariant: "ResearchPanelMockup",
    storageTarget: "mission_step_progress.canonical_message[step=2]",
    userInputFields: [],
    dataRequirements: { minUrls: 3, minChars: 2000 },
    aiModel: "claude-opus-4-6",
  },
  {
    order: 3,
    name: "TikTok 腳本：Hook（3s）+ Hold + Payoff + Overlay",
    description: "完整 TikTok 腳本三段式結構：Hook（0-3s 抓住注意力）/ Hold（主體）/ Payoff + CTA（Loop 鉤子）。含字幕 Overlay 文字與配樂方向。",
    assignedAgentId: A.briefWriter, assignedAgentName: NAME[A.briefWriter],
    reviewerAgentId: A.lead,
    outputKind: "text_content", mockupVariant: "TTForYouMockup",
    storageTarget: "mission_step_progress.canonical_message[step=3]",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "claude-sonnet-4-5",
  },
  {
    order: 4,
    name: "Squad Lead QA：Hook 強度 / Loop 完整 / hashtag 策略",
    description: "終審：Hook 在 3 秒內有效嗎？Payoff 是否形成 Loop 讓人重播？hashtag 是否包含 niche + 趨勢 + 品牌標籤？",
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "qa_review", mockupVariant: "QAReportMockup",
    storageTarget: "mission_step_progress.canonical_message[step=4]",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "gemini-2.5-flash",
  },
];

interface CategorySpec {
  slug: string; name_zh: string; name_en: string; description: string;
  category_kind: "planning" | "content" | "campaign" | "analytics" | "crisis";
  default_mockup: string; search_keywords: string;
}

const CATEGORIES: CategorySpec[] = [
  { slug: "tt-video-script", name_zh: "TikTok 短影音腳本", name_en: "TikTok Video Script",
    description: "TikTok FYP 短影音腳本，Hook / Hold / Payoff 三段式結構 + hashtag 策略。",
    category_kind: "content", default_mockup: "TTForYouMockup",
    search_keywords: "tiktok,短影音,腳本,script,foryou,fyp,垂直" },
  { slug: "tt-carousel-post", name_zh: "TikTok 輪播圖文", name_en: "TikTok Carousel",
    description: "TikTok 多圖輪播貼文，適合教學步驟、清單型內容，比影片更易保存分享。",
    category_kind: "content", default_mockup: "TTCarouselMockup",
    search_keywords: "tiktok,輪播,carousel,圖文,教學" },
  { slug: "tt-live-event", name_zh: "TikTok 直播企劃", name_en: "TikTok Live",
    description: "TikTok LIVE 完整企劃：流程表 / 預告短影音腳本 / 直播中互動設計。",
    category_kind: "campaign", default_mockup: "TTLiveMockup",
    search_keywords: "直播,live,tiktok,流程,互動" },
  { slug: "tt-hashtag-challenge", name_zh: "TikTok 挑戰活動", name_en: "TikTok Hashtag Challenge",
    description: "TikTok hashtag challenge 企劃：挑戰名稱、規則說明、KOL 合作 brief、初始影片腳本。",
    category_kind: "campaign", default_mockup: "TTForYouMockup",
    search_keywords: "挑戰,challenge,hashtag,tiktok,kol,活動" },
  { slug: "tt-monthly-analytics", name_zh: "TikTok 月度成效報告", name_en: "TikTok Monthly Analytics",
    description: "TikTok 月度數據分析：播放量、完播率、follower 成長、最佳影片、下月策略。",
    category_kind: "analytics", default_mockup: "QAReportMockup",
    search_keywords: "分析,analytics,成效,tiktok,報告,數據" },
];

interface TaskSpec {
  slug: string; name_zh: string; description: string;
  category_slug: string; impl_kind: "squad" | "atomic";
  status: "active" | "coming_soon";
  estimated_minutes: number;
  methodology_label?: string;
  mockup_hint?: string;
}

const TASKS: TaskSpec[] = [
  { slug: "tt-video-hook-script", name_zh: "高留存 TikTok 短影音腳本",
    description: "5 步驟腳本小組：受眾研究 → Hook 方向 → 完整腳本（Hook 3s / Hold / Payoff）→ hashtag 策略 → QA。",
    category_slug: "tt-video-script", impl_kind: "squad", status: "active",
    estimated_minutes: 25, methodology_label: "TikTok Hook-Hold-Payoff 三段式腳本法",
    mockup_hint: "TTForYouMockup" },
  { slug: "tt-carousel-edu", name_zh: "TikTok 教學輪播圖文",
    description: "教學型 TikTok 輪播（5-10 張），含每張文案、視覺方向 brief、封面 Hook 設計。",
    category_slug: "tt-carousel-post", impl_kind: "atomic", status: "active",
    estimated_minutes: 15, mockup_hint: "TTCarouselMockup" },
  { slug: "tt-video-product", name_zh: "產品展示型 TikTok 短影音腳本",
    description: "產品展示 TikTok 腳本：Hook（問題痛點）→ 展示過程 → 結果 Payoff → CTA，含配樂建議。",
    category_slug: "tt-video-script", impl_kind: "atomic", status: "active",
    estimated_minutes: 12, mockup_hint: "TTForYouMockup" },
  { slug: "tt-live-runofshow", name_zh: "TikTok 直播流程企劃",
    description: "TikTok LIVE 完整企劃：時間流程表、互動設計、預告短影音腳本、直播後剪輯 brief。",
    category_slug: "tt-live-event", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 30, mockup_hint: "TTLiveMockup" },
  { slug: "tt-hashtag-challenge-plan", name_zh: "TikTok Hashtag Challenge 企劃",
    description: "TikTok challenge 完整策略：名稱選定、挑戰規則、初始影片腳本、KOL 邀約 brief。",
    category_slug: "tt-hashtag-challenge", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 35, mockup_hint: "TTForYouMockup" },
  { slug: "tt-monthly-analytics-report", name_zh: "TikTok 月度成效分析報告",
    description: "月度 TikTok 數據分析：播放量趨勢、完播率、follower 成長、最佳影片分析、下月建議。",
    category_slug: "tt-monthly-analytics", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 25, mockup_hint: "QAReportMockup" },
  { slug: "tt-carousel-list", name_zh: "TikTok 清單型輪播圖文",
    description: "清單型 TikTok 輪播（Top 5/7/10），含每張文案、視覺方向、封面設計 brief。",
    category_slug: "tt-carousel-post", impl_kind: "atomic", status: "coming_soon",
    estimated_minutes: 12, mockup_hint: "TTCarouselMockup" },
];

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  console.log("1. Upserting TikTok categories…");
  for (const c of CATEGORIES) {
    await pool.execute(
      `INSERT INTO task_category (slug, name_zh, name_en, description, category_kind, default_mockup, search_keywords, workspace, is_open_for_methods)
       VALUES (?,?,?,?,?,?,?,'tiktok',0)
       ON DUPLICATE KEY UPDATE
         name_zh=VALUES(name_zh), name_en=VALUES(name_en), description=VALUES(description),
         category_kind=VALUES(category_kind), default_mockup=VALUES(default_mockup),
         search_keywords=VALUES(search_keywords), workspace='tiktok'`,
      [c.slug, c.name_zh, c.name_en, c.description, c.category_kind, c.default_mockup, c.search_keywords],
    );
    console.log(`  ✓ ${c.slug}`);
  }

  console.log("\n2. Seeding TT Video Script squad…");
  const agentsJson = JSON.stringify([
    { id: A.lead, name: NAME[A.lead], role: "Squad Lead", is_lead: true },
    { id: A.audienceInsight, name: NAME[A.audienceInsight], role: "Trend Researcher" },
    { id: A.briefWriter, name: NAME[A.briefWriter], role: "Scriptwriter" },
  ]);
  await pool.execute(
    `INSERT INTO squads (slug, name, description, workspace, agents, steps, is_active, is_approved)
     VALUES (?,?,?,'tiktok',?,?,1,1)
     ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
       agents=VALUES(agents), steps=VALUES(steps), is_active=1, is_approved=1`,
    [
      "tt-video-hook-script",
      "TikTok Hook-Hold-Payoff 短影音腳本小組",
      "用 Hook-Hold-Payoff 三段式結構打造 TikTok 高留存腳本，5 步驟含趨勢研究、腳本、hashtag 策略。",
      agentsJson, JSON.stringify(TT_VIDEO_STEPS),
    ],
  );
  const [squadRow]: any = await pool.execute(
    `SELECT id FROM squads WHERE slug='tt-video-hook-script' LIMIT 1`,
  );
  const ttSquadId = (squadRow as any[])[0]?.id;
  console.log(`  ✓ squad id=${ttSquadId}`);

  console.log("\n3. Upserting TikTok tasks…");
  for (const t of TASKS) {
    const [catRow]: any = await pool.execute(
      `SELECT id FROM task_category WHERE slug=? LIMIT 1`, [t.category_slug],
    );
    const catId = (catRow as any[])[0]?.id ?? null;
    const squadId = t.slug === "tt-video-hook-script" ? ttSquadId : null;

    await pool.execute(
      `INSERT INTO task_catalog
         (slug, name_zh, description, workspace, category_id, category, impl_kind,
          status, estimated_minutes, methodology_label, squad_id)
       VALUES (?,?,?,'tiktok',?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         name_zh=VALUES(name_zh), description=VALUES(description),
         category_id=VALUES(category_id), category=VALUES(category),
         impl_kind=VALUES(impl_kind), status=VALUES(status),
         estimated_minutes=VALUES(estimated_minutes),
         methodology_label=VALUES(methodology_label),
         squad_id=COALESCE(VALUES(squad_id), squad_id)`,
      [t.slug, t.name_zh, t.description, catId, t.category_slug, t.impl_kind,
       t.status, t.estimated_minutes, t.methodology_label ?? null, squadId],
    );
    console.log(`  ${t.status === "active" ? "🟢" : "🟡"} ${t.slug}`);
  }

  console.log(`\n✅ TikTok catalog seeded: ${CATEGORIES.length} categories, ${TASKS.length} tasks`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
