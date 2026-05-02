/**
 * seed-task-categories-fb — populate task_category for the FB
 * workspace and bind the 12 FB tasks to their parent categories.
 *
 * CJ direction 2026-05-02: each "deliverable kind" is a category
 * (e.g. 「FB 月行事曆」), and multiple "methodologies" (squad/atomic
 * impls) can sit under the same category. This is the future-proofing
 * layer so we can add another way to do 月行事曆 (e.g. GaryVee method)
 * without breaking the existing Pulizzi method.
 *
 * Most categories start with 1 method. Two categories get 2 methods
 * out of the gate:
 *   - "FB 單篇貼文":  純文字版 + 配圖版
 *
 * Idempotent — UPSERT by slug.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

interface CategorySpec {
  slug: string;
  name_zh: string;
  name_en: string;
  description: string;
  workspace: string;
  category_kind: "planning" | "content" | "campaign" | "analytics" | "crisis";
  default_mockup: string | null;
  search_keywords: string;
  is_open_for_methods: boolean;
  // Bind these task_catalog slugs to this category, in display order
  task_slugs: { slug: string; methodology_label: string }[];
}

const CATEGORIES: CategorySpec[] = [
  // ── A. Planning ────────────────────────────────────────────────────────
  {
    slug: "fb-monthly-calendar",
    name_zh: "Facebook 月行事曆",
    name_en: "FB Monthly Calendar",
    description: "30 天的 FB 內容排程，依方法論產出 N pillars × 比例 + 每日主題 + per-post brief。一個目錄可以有多種做法（Pulizzi 派 / GaryVee 派 / Conant 派）。",
    workspace: "facebook",
    category_kind: "planning",
    default_mockup: "CalendarGridMockup",
    search_keywords: "月行事曆,行事曆,monthly,calendar,排程,FB,Facebook,內容支柱,pillar",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-monthly-calendar", methodology_label: "Joe Pulizzi 內容支柱法" },
    ],
  },
  {
    slug: "fb-account-reposition",
    name_zh: "Facebook 帳號重新定位",
    name_en: "FB Account Reposition",
    description: "現有 FB 帳號 audit + 競品比對 + 新 tilt 主張 + 30 天落地計畫。",
    workspace: "facebook",
    category_kind: "planning",
    default_mockup: "ResearchPanelMockup",
    search_keywords: "帳號,定位,reposition,FB,Facebook,品牌,audit",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-account-reposition", methodology_label: "Trout & Ries Positioning + Pulizzi Tilt" },
    ],
  },
  {
    slug: "fb-quarterly-strategy",
    name_zh: "Facebook 季度策略",
    name_en: "FB Quarterly Strategy",
    description: "三個月 FB 策略：pillar 配比 / 月份分配 / KPI / 季度排程。月行事曆的上一層母模板。",
    workspace: "facebook",
    category_kind: "planning",
    default_mockup: "CalendarGridMockup",
    search_keywords: "季度,quarterly,策略,KPI",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-quarterly-strategy", methodology_label: "Pulizzi Quarterly Cadence" },
    ],
  },

  // ── B. Campaign ────────────────────────────────────────────────────────
  {
    slug: "fb-event-launch-kit",
    name_zh: "Facebook 活動上線套組",
    name_en: "FB Event Launch Kit",
    description: "為一場活動產出 FB 預熱 + 當天 + 後續貼文套組。",
    workspace: "facebook",
    category_kind: "campaign",
    default_mockup: "FBPostBriefMockup",
    search_keywords: "活動,上線,套組,event,launch",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-event-launch-kit", methodology_label: "GaryVee Jab Jab Right Hook" },
    ],
  },
  {
    slug: "fb-countdown-series",
    name_zh: "Facebook 倒數活動系列",
    name_en: "FB Countdown Series",
    description: "活動前 5-7 天每日一篇倒數貼文，主題遞進 + 緊迫感升溫。",
    workspace: "facebook",
    category_kind: "campaign",
    default_mockup: "FBPostBriefMockup",
    search_keywords: "倒數,countdown,系列,scarcity",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-countdown-series", methodology_label: "Cialdini Scarcity + Loss Aversion" },
    ],
  },
  {
    slug: "fb-livestream-prep",
    name_zh: "Facebook 直播預告 + 後續摘要",
    name_en: "FB Livestream Prep",
    description: "直播前預告 + 直播後摘要（2 篇成對）。",
    workspace: "facebook",
    category_kind: "campaign",
    default_mockup: "FBPostBriefMockup",
    search_keywords: "直播,livestream,預告,摘要",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-livestream-prep", methodology_label: "成對敘事一致性法" },
    ],
  },

  // ── C. Content (single-post) ──────────────────────────────────────────
  {
    slug: "fb-single-post",
    name_zh: "Facebook 單篇貼文",
    name_en: "FB Single Post",
    description: "1 篇 FB 貼文。可選純文字、配圖、或加視覺方向 brief — 同一個目錄下的不同方法。",
    workspace: "facebook",
    category_kind: "content",
    default_mockup: "FBPostBriefMockup",
    search_keywords: "貼文,文案,FB,Facebook,post,caption",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-single-post-text",       methodology_label: "純文字版（最簡）" },
      { slug: "fb-single-post-with-image", methodology_label: "配單圖版（含視覺 brief）" },
    ],
  },
  {
    slug: "fb-carousel",
    name_zh: "Facebook 輪播圖文",
    name_en: "FB Carousel",
    description: "5-10 張連續圖卡 + 整體敘事弧。",
    workspace: "facebook",
    category_kind: "content",
    default_mockup: "FBCarouselMockup",  // NEW mockup — built this turn
    search_keywords: "carousel,輪播,圖文",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-carousel", methodology_label: "敘事弧法" },
    ],
  },
  {
    slug: "fb-reels",
    name_zh: "Facebook Reels 短影音腳本",
    name_en: "FB Reels Script",
    description: "30 秒 / 60 秒短影音腳本（hook + 分鏡 + 字幕）。",
    workspace: "facebook",
    category_kind: "content",
    default_mockup: "FBReelsMockup",  // NEW mockup — built this turn
    search_keywords: "reels,短影音,腳本,script",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-reels-script", methodology_label: "Hook-Hold-Payoff 法" },
    ],
  },

  // ── D. Analytics ──────────────────────────────────────────────────────
  {
    slug: "fb-monthly-analytics",
    name_zh: "Facebook 月度成效報告",
    name_en: "FB Monthly Analytics",
    description: "上月 FB 成效彙整：pillar 比例 / 互動率 / 受眾洞察 / 下月優化建議。",
    workspace: "facebook",
    category_kind: "analytics",
    default_mockup: "ResearchPanelMockup",
    search_keywords: "成效,月報,analytics,KPI",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-monthly-analytics", methodology_label: "Kaushik Web Analytics 2.0" },
    ],
  },

  // ── E. Crisis ─────────────────────────────────────────────────────────
  {
    slug: "fb-crisis-reply",
    name_zh: "Facebook 負評/客訴回覆",
    name_en: "FB Crisis Reply",
    description: "針對負評/客訴的公開回覆草稿：致歉 + 解釋 + 承諾 + 私訊邀請。",
    workspace: "facebook",
    category_kind: "crisis",
    default_mockup: "FBPostBriefMockup",  // could use new FBCrisisReplyMockup later
    search_keywords: "負評,客訴,回覆,危機,crisis",
    is_open_for_methods: true,
    task_slugs: [
      { slug: "fb-crisis-reply", methodology_label: "Patrick Lagadec 四段式法" },
    ],
  },
];

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  console.log(`[seed-task-categories-fb] processing ${CATEGORIES.length} categories…\n`);
  let inserted = 0, updated = 0, bound = 0;
  for (const c of CATEGORIES) {
    // Upsert category
    const [exist]: any = await pool.execute(
      `SELECT id FROM task_category WHERE slug = ? LIMIT 1`,
      [c.slug],
    );
    let categoryId: number;
    if ((exist as any[])[0]) {
      categoryId = Number((exist as any[])[0].id);
      await pool.execute(
        `UPDATE task_category
            SET name_zh=?, name_en=?, description=?, workspace=?, category_kind=?,
                default_mockup=?, search_keywords=?, status='active',
                is_open_for_methods=?
          WHERE id=?`,
        [c.name_zh, c.name_en, c.description, c.workspace, c.category_kind,
         c.default_mockup, c.search_keywords, c.is_open_for_methods ? 1 : 0,
         categoryId],
      );
      updated++;
      console.log(`  ✓ updated category #${categoryId}  ${c.slug}`);
    } else {
      const [r]: any = await pool.execute(
        `INSERT INTO task_category
           (slug, name_zh, name_en, description, workspace, category_kind,
            default_mockup, search_keywords, status, is_open_for_methods)
         VALUES (?,?,?,?,?,?,?,?,'active',?)`,
        [c.slug, c.name_zh, c.name_en, c.description, c.workspace, c.category_kind,
         c.default_mockup, c.search_keywords, c.is_open_for_methods ? 1 : 0],
      );
      categoryId = Number(r?.insertId ?? 0);
      inserted++;
      console.log(`  ✓ inserted category #${categoryId}  ${c.slug}`);
    }

    // Bind task_catalog rows
    for (const t of c.task_slugs) {
      const [r]: any = await pool.execute(
        `UPDATE task_catalog SET category_id=?, methodology_label=? WHERE slug=?`,
        [categoryId, t.methodology_label, t.slug],
      );
      const affected = (r as any).affectedRows ?? 0;
      if (affected > 0) {
        bound++;
        console.log(`    ↳ bound task ${t.slug} → "${t.methodology_label}"`);
      } else {
        console.warn(`    ⚠ task ${t.slug} not found in task_catalog`);
      }
    }
  }
  console.log(`\n[seed-task-categories-fb] inserted=${inserted} updated=${updated} bound=${bound}`);

  // Audit: any task_catalog row missing category_id?
  const [orphans]: any = await pool.execute(
    `SELECT slug, name_zh FROM task_catalog
      WHERE workspace = 'facebook' AND status IN ('active','coming_soon') AND category_id IS NULL`,
  );
  if ((orphans as any[]).length > 0) {
    console.warn(`\n⚠ ${(orphans as any[]).length} FB task(s) missing category:`);
    for (const r of (orphans as any[])) console.warn(`  - ${r.slug}: ${r.name_zh}`);
  } else {
    console.log(`\n✓ All FB tasks have category_id assigned`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
