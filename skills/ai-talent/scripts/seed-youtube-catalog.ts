/**
 * seed-youtube-catalog — bring YouTube online.
 *
 * Categories (8):
 *   Planning:  yt-monthly-calendar / yt-channel-strategy
 *   Content:   yt-video-script / yt-shorts-script / yt-community-post
 *   Campaign:  yt-premiere / yt-live-event
 *   Analytics: yt-monthly-analytics
 *
 * Tasks (10): 4 active, 6 coming_soon
 * 1 active squad: yt-video-script (full video production pipeline)
 *
 * Idempotent — UPSERT all rows.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const A = {
  lead:            180159,
  audienceInsight: 239180,
  pillarArchitect: 239181,
  calendarLead:    239182,
  briefWriter:     239183,
  visualDirector:  239184,
  crisisComms:     239185,
  perfAnalyst:     239186,
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

// ── YouTube Video Script Squad Steps ─────────────────────────────────────────
const YT_VIDEO_STEPS: Step[] = [
  {
    order: 0,
    name: "Intake：頻道定位 + 影片主題 + 目標受眾",
    description: "蒐集 YouTube 頻道 URL / 影片主題方向 / 目標受眾 / 期望影片長度 / SEO 關鍵字。",
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "decision", mockupVariant: "IntakeFormMockup",
    storageTarget: "mission_step_progress.canonical_message[step=0]",
    userInputFields: ["channel_url", "video_topic", "target_audience", "duration_min", "seo_keywords"],
    dataRequirements: { minUrls: 0, minChars: 0, requireBucketA: ["brands.positioning"] },
    aiModel: "claude-opus-4-6",
  },
  {
    order: 1,
    name: "🛑 Checkpoint：確認題目 + 角度 + SEO 關鍵字",
    description: "用戶確認影片方向，補關鍵欄位。UI step 不打 LLM。",
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "decision", mockupVariant: "IntakeFormMockup",
    storageTarget: "mission_step_progress.canonical_message[step=1]",
    userInputFields: ["confirmed_title", "video_angle", "primary_keyword"],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "n/a",
  },
  {
    order: 2,
    name: "受眾 + 競品頻道研究",
    description: "分析類似主題 YouTube 頻道的熱門影片，找出受眾期望的信息缺口與差異化角度。",
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
    name: "影片腳本：Hook + 章節 + CTA",
    description: "完整影片腳本，含：開場 Hook（30s）、主體章節（有 timecode）、結尾 CTA。每章節含口白 + B-Roll 提示。",
    assignedAgentId: A.briefWriter, assignedAgentName: NAME[A.briefWriter],
    reviewerAgentId: A.lead,
    outputKind: "text_content", mockupVariant: "YTVideoMockup",
    storageTarget: "mission_step_progress.canonical_message[step=3]",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "claude-sonnet-4-5",
  },
  {
    order: 4,
    name: "縮圖概念 + 說明欄文案 + Tags",
    description: "縮圖視覺方向（文字 + 表情 + 構圖）/ SEO 說明欄（前 125 字最重要）/ 標籤清單。",
    assignedAgentId: A.visualDirector, assignedAgentName: NAME[A.visualDirector],
    reviewerAgentId: A.lead,
    outputKind: "text_content", mockupVariant: "YTVideoMockup",
    storageTarget: "mission_step_progress.canonical_message[step=4]",
    userInputFields: [],
    dataRequirements: { minUrls: 0, minChars: 0 },
    aiModel: "claude-sonnet-4-5",
  },
  {
    order: 5,
    name: "Squad Lead QA：Hook 強度 / SEO 完整 / CTA 清晰",
    description: "終審：Hook 夠吸引人嗎？說明欄 SEO 是否完整？CTA 是否明確？章節設計是否讓觀眾看完？",
    assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
    reviewerAgentId: null,
    outputKind: "qa_review", mockupVariant: "QAReportMockup",
    storageTarget: "mission_step_progress.canonical_message[step=5]",
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
  { slug: "yt-monthly-calendar", name_zh: "YouTube 月行事曆", name_en: "YT Monthly Calendar",
    description: "月度 YouTube 內容排程，含長片 / Shorts / Community Post 配比。",
    category_kind: "planning", default_mockup: "CalendarGridMockup",
    search_keywords: "月行事曆,monthly,calendar,youtube,排程,yt" },
  { slug: "yt-channel-strategy", name_zh: "YouTube 頻道策略", name_en: "YT Channel Strategy",
    description: "YouTube 頻道定位策略：niche 選定、受眾分析、競品差異化、pillar 影片規劃。",
    category_kind: "planning", default_mockup: "PillarTableMockup",
    search_keywords: "策略,strategy,youtube,頻道,channel,定位" },
  { slug: "yt-video-script", name_zh: "YouTube 影片腳本", name_en: "YT Video Script",
    description: "完整 YouTube 影片腳本：Hook / 章節 / CTA + 縮圖 brief + 說明欄 SEO。",
    category_kind: "content", default_mockup: "YTVideoMockup",
    search_keywords: "影片,腳本,script,youtube,yt,video" },
  { slug: "yt-shorts-script", name_zh: "YouTube Shorts 腳本", name_en: "YT Shorts Script",
    description: "60 秒內 YouTube Shorts 腳本，Hook / Hold / Payoff 三段式結構。",
    category_kind: "content", default_mockup: "YTShortsMockup",
    search_keywords: "shorts,短影音,youtube,腳本,script,垂直" },
  { slug: "yt-community-post", name_zh: "YouTube 社群貼文", name_en: "YT Community Post",
    description: "YouTube Community 貼文（文字 / 投票 / 圖片），用於維繫訂閱者互動。",
    category_kind: "content", default_mockup: "YTCommunityMockup",
    search_keywords: "社群,community,youtube,貼文,互動,poll" },
  { slug: "yt-premiere", name_zh: "YouTube 首播企劃", name_en: "YT Premiere",
    description: "YouTube 首播活動企劃：縮圖 brief、teaser 文案、首播前社群預熱系列。",
    category_kind: "campaign", default_mockup: "YTPremiereMockup",
    search_keywords: "首播,premiere,youtube,event,活動" },
  { slug: "yt-live-event", name_zh: "YouTube 直播企劃", name_en: "YT Live Event",
    description: "YouTube Live 完整企劃：流程表 / 預告 Post / 直播後 Shorts 剪輯 brief。",
    category_kind: "campaign", default_mockup: "YTLiveMockup",
    search_keywords: "直播,live,youtube,event,流程" },
  { slug: "yt-monthly-analytics", name_zh: "YouTube 月度成效報告", name_en: "YT Monthly Analytics",
    description: "YouTube 月度數據分析：觀看時間、CTR、訂閱成長、最佳影片、格式 ROI。",
    category_kind: "analytics", default_mockup: "QAReportMockup",
    search_keywords: "分析,analytics,成效,youtube,報告,數據" },
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
  { slug: "yt-video-script-storytelling", name_zh: "說故事型 YouTube 影片腳本",
    description: "用 StoryBrand 敘事框架打造 YouTube 影片腳本，含 Hook、章節、CTA、縮圖 brief。",
    category_slug: "yt-video-script", impl_kind: "squad", status: "active",
    estimated_minutes: 40, methodology_label: "Donald Miller StoryBrand 敘事框架",
    mockup_hint: "YTVideoMockup" },
  { slug: "yt-shorts-hook-3s", name_zh: "高留存 YouTube Shorts 腳本",
    description: "60 秒 Shorts 三段式腳本（Hook 3s / Hold 45s / Payoff），含字幕 Overlay 建議。",
    category_slug: "yt-shorts-script", impl_kind: "atomic", status: "active",
    estimated_minutes: 12, mockup_hint: "YTShortsMockup" },
  { slug: "yt-community-poll", name_zh: "YouTube 社群互動民調",
    description: "一則 YouTube Community 投票 + 背景說明，用於了解訂閱者喜好 / 下期題目投票。",
    category_slug: "yt-community-post", impl_kind: "atomic", status: "active",
    estimated_minutes: 8, mockup_hint: "YTCommunityMockup" },
  { slug: "yt-monthly-calendar-plan", name_zh: "YouTube 月行事曆排程",
    description: "月度 YouTube 內容排程，長片 / Shorts / Community 配比，含發布時段建議。",
    category_slug: "yt-monthly-calendar", impl_kind: "squad", status: "active",
    estimated_minutes: 30, methodology_label: "YouTube 算法導向內容排程法",
    mockup_hint: "CalendarGridMockup" },
  { slug: "yt-premiere-campaign", name_zh: "YouTube 首播活動企劃",
    description: "YouTube 首播完整套組：縮圖 brief、預告 Shorts 腳本、首播前 3 日社群文。",
    category_slug: "yt-premiere", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 35, mockup_hint: "YTPremiereMockup" },
  { slug: "yt-live-runofshow", name_zh: "YouTube 直播流程企劃",
    description: "YouTube Live 完整企劃：流程表（時間軸）、預告貼文、直播後 Shorts 剪輯 brief。",
    category_slug: "yt-live-event", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 30, mockup_hint: "YTLiveMockup" },
  { slug: "yt-channel-strategy-full", name_zh: "YouTube 頻道定位策略",
    description: "完整頻道策略：受眾研究、競品分析、pillar 影片類型規劃、頻道優化建議。",
    category_slug: "yt-channel-strategy", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 50, mockup_hint: "PillarTableMockup" },
  { slug: "yt-monthly-analytics-report", name_zh: "YouTube 月度成效分析報告",
    description: "月度 YouTube 數據報告：觀看時間、CTR、訂閱、最佳影片、下月策略建議。",
    category_slug: "yt-monthly-analytics", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 25, mockup_hint: "QAReportMockup" },
  { slug: "yt-video-script-tutorial", name_zh: "教學型 YouTube 影片腳本",
    description: "用 step-by-step 教學框架打造 YouTube 影片腳本，含 Hook、章節（含 B-Roll 提示）、CTA。",
    category_slug: "yt-video-script", impl_kind: "squad", status: "coming_soon",
    estimated_minutes: 40, methodology_label: "教學影片 Step-by-Step 框架",
    mockup_hint: "YTVideoMockup" },
  { slug: "yt-community-update", name_zh: "YouTube 頻道動態更新貼文",
    description: "一則 YouTube Community 文字更新貼文，用於發布幕後消息、感謝訂閱者或預告新影片。",
    category_slug: "yt-community-post", impl_kind: "atomic", status: "coming_soon",
    estimated_minutes: 8, mockup_hint: "YTCommunityMockup" },
];

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  console.log("1. Upserting YouTube categories…");
  for (const c of CATEGORIES) {
    await pool.execute(
      `INSERT INTO task_category (slug, name_zh, name_en, description, category_kind, default_mockup, search_keywords, workspace, is_open_for_methods)
       VALUES (?,?,?,?,?,?,?,'youtube',0)
       ON DUPLICATE KEY UPDATE
         name_zh=VALUES(name_zh), name_en=VALUES(name_en), description=VALUES(description),
         category_kind=VALUES(category_kind), default_mockup=VALUES(default_mockup),
         search_keywords=VALUES(search_keywords), workspace='youtube'`,
      [c.slug, c.name_zh, c.name_en, c.description, c.category_kind, c.default_mockup, c.search_keywords],
    );
    console.log(`  ✓ ${c.slug}`);
  }

  console.log("\n2. Seeding YT Video Script squad…");
  const agentsJson = JSON.stringify([
    { id: A.lead, name: NAME[A.lead], role: "Squad Lead", is_lead: true },
    { id: A.audienceInsight, name: NAME[A.audienceInsight], role: "Audience Researcher" },
    { id: A.briefWriter, name: NAME[A.briefWriter], role: "Scriptwriter" },
    { id: A.visualDirector, name: NAME[A.visualDirector], role: "Visual Director" },
  ]);
  await pool.execute(
    `INSERT INTO squads (slug, name, description, workspace, agents, steps, is_active, is_approved)
     VALUES (?,?,?,'youtube',?,?,1,1)
     ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
       agents=VALUES(agents), steps=VALUES(steps), is_active=1, is_approved=1`,
    [
      "yt-video-script-storytelling",
      "StoryBrand 說故事型 YouTube 影片腳本小組",
      "用 Donald Miller StoryBrand 框架打造 YouTube 影片腳本，6 步驟含受眾研究、腳本、縮圖 brief、SEO 說明欄。",
      agentsJson, JSON.stringify(YT_VIDEO_STEPS),
    ],
  );
  const [squadRow]: any = await pool.execute(
    `SELECT id FROM squads WHERE slug='yt-video-script-storytelling' LIMIT 1`,
  );
  const videoSquadId = (squadRow as any[])[0]?.id;
  console.log(`  ✓ squad id=${videoSquadId}`);

  console.log("\n3. Upserting YouTube tasks…");
  for (const t of TASKS) {
    const [catRow]: any = await pool.execute(
      `SELECT id FROM task_category WHERE slug=? LIMIT 1`, [t.category_slug],
    );
    const catId = (catRow as any[])[0]?.id ?? null;
    const squadId = t.slug === "yt-video-script-storytelling" ? videoSquadId : null;

    await pool.execute(
      `INSERT INTO task_catalog
         (slug, name_zh, description, workspace, category_id, category, impl_kind,
          status, estimated_minutes, methodology_label, squad_id)
       VALUES (?,?,?,'youtube',?,?,?,?,?,?,?)
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

  console.log(`\n✅ YouTube catalog seeded: ${CATEGORIES.length} categories, ${TASKS.length} tasks`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
