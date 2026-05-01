/**
 * seed-task-catalog-fb — populate task_catalog with the first batch of
 * Facebook tasks per CJ direction 2026-05-01.
 *
 * Active first-batch (5):
 *   1. FB 月行事曆           → squad #726 (Joe Pulizzi 內容支柱 squad)
 *   2. 單篇 FB 貼文 — 純文字  → atomic, agent resolved by skill match
 *   3. 單篇 FB 貼文 — 配單圖  → atomic, agent resolved by skill match
 *   4. 活動上線套組          → squad fb-garyvee-jab-hook (#557, validated 2026-04-30)
 *   5. FB 月度成效報告       → squad TBD (left coming_soon until built)
 *
 * Coming-soon batch:
 *   - FB carousel 圖文
 *   - FB Reels 短影音腳本
 *   - FB 帳號重新定位
 *   - FB 季度策略
 *   - FB 倒數活動系列
 *   - FB 直播預告 + 後續摘要
 *   - FB 負評 / 客訴回覆草稿
 *
 * The seed is idempotent (UPSERT BY slug) — safe to re-run.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

interface Task {
  slug: string;
  name_zh: string;
  name_en?: string;
  description: string;
  workspace: string;
  category: string;
  impl_kind: "atomic" | "squad";
  squad_slug?: string;       // resolved → squad_id at runtime
  agent_slug?: string;       // resolved → agent_id at runtime
  status: "active" | "coming_soon" | "archived";
  bypassable: boolean;
  search_keywords: string;
  estimated_minutes: number;
}

const TASKS: Task[] = [
  // ── ACTIVE BATCH ─────────────────────────────────────────────────────
  {
    slug: "fb-monthly-calendar",
    name_zh: "Facebook 月行事曆",
    name_en: "Facebook Monthly Calendar",
    description: "30 天的 Facebook 內容排程，依 Joe Pulizzi 內容支柱方法論產出 N pillars × 比例 + 每日主題 + per-post brief。",
    workspace: "facebook",
    category: "planning",
    impl_kind: "squad",
    squad_slug: "fb-monthly-calendar-pulizzi",  // squad #726
    status: "active",
    bypassable: true,
    search_keywords: "月行事曆,行事曆,monthly,calendar,排程,FB,Facebook,內容支柱,pillar",
    estimated_minutes: 25,
  },
  {
    slug: "fb-single-post-text",
    name_zh: "單篇 Facebook 貼文 — 純文字",
    name_en: "Single FB Post — Text Only",
    description: "1 篇 Facebook 貼文文案，含 hook + 主體 + CTA + hashtag，直接複製貼上即發布。",
    workspace: "facebook",
    category: "content",
    impl_kind: "atomic",
    // agent_slug resolved at seed time — pick best fb-content-writer
    agent_slug: "fb-brief-writer",  // Aiden Hsu — FB content brief writer (id 239183)
    status: "active",
    bypassable: true,
    search_keywords: "貼文,文案,FB,Facebook,純文字,post,text,caption",
    estimated_minutes: 3,
  },
  {
    slug: "fb-single-post-with-image",
    name_zh: "單篇 Facebook 貼文 — 配單圖",
    name_en: "Single FB Post — With Image Brief",
    description: "1 篇 Facebook 貼文文案 + 視覺方向 brief（給設計師 / AI 繪圖工具用）。",
    workspace: "facebook",
    category: "content",
    impl_kind: "atomic",
    agent_slug: "fb-brief-writer",  // Aiden Hsu — FB content brief writer (id 239183)  // upgrade later to a 2-agent team
    status: "active",
    bypassable: true,
    search_keywords: "貼文,文案,FB,Facebook,配圖,單圖,image,visual,brief",
    estimated_minutes: 5,
  },
  {
    slug: "fb-event-launch-kit",
    name_zh: "Facebook 活動上線套組",
    name_en: "FB Event Launch Kit",
    description: "一場活動的 Facebook 預熱（3 篇）+ 當天（1 篇）+ 後續（2 篇）共 6 篇貼文。已驗證可吃活動定位 + 11-segment positioning。",
    workspace: "facebook",
    category: "campaign",
    impl_kind: "squad",
    squad_slug: "fb-garyvee-jab-hook",  // squad #557, tested 2026-04-30
    status: "active",
    bypassable: true,
    search_keywords: "活動,上線,套組,event,launch,jab,hook,FB,Facebook,預熱",
    estimated_minutes: 15,
  },
  {
    slug: "fb-monthly-analytics",
    name_zh: "Facebook 月度成效報告",
    name_en: "FB Monthly Analytics Report",
    description: "上月 FB 貼文成效彙整：pillar 比例 / 互動率 / 受眾洞察 / 下月優化建議。3 step 流程，需要 FB 授權或手動貼數據。",
    workspace: "facebook",
    category: "analytics",
    impl_kind: "squad",
    squad_slug: "fb-monthly-analytics",
    status: "active",
    bypassable: false,  // physically needs data
    search_keywords: "成效,月報,analytics,FB,Facebook,monthly,report,洞察,數據,KPI",
    estimated_minutes: 12,
  },

  // ── COMING SOON BATCH ────────────────────────────────────────────────
  {
    slug: "fb-carousel",
    name_zh: "Facebook 輪播圖文（Carousel）",
    description: "5-10 張連續圖文，每張獨立卡片 + 整體敘事弧。每張都有自己的標題 + 內文 + 視覺方向。",
    workspace: "facebook",
    category: "content",
    impl_kind: "atomic",
    agent_slug: "fb-brief-writer",  // Aiden Hsu — FB content brief writer (id 239183)
    status: "active",
    bypassable: true,
    search_keywords: "carousel,輪播,圖文,FB,Facebook,圖卡,sequential",
    estimated_minutes: 8,
  },
  {
    slug: "fb-reels-script",
    name_zh: "Facebook Reels 短影音腳本",
    description: "30 秒 / 60 秒短影音腳本：hook（前 3 秒）+ 主體（場景/分鏡/字幕）+ CTA。可直接交給拍攝。",
    workspace: "facebook",
    category: "content",
    impl_kind: "atomic",
    agent_slug: "fb-brief-writer",  // Aiden Hsu — FB content brief writer (id 239183)
    status: "active",
    bypassable: true,
    search_keywords: "reels,短影音,FB,Facebook,腳本,script,影片,分鏡",
    estimated_minutes: 6,
  },
  {
    slug: "fb-account-reposition",
    name_zh: "Facebook 帳號重新定位",
    description: "現有帳號 audit + 競品比對 + 新 tilt 主張 + 30 天落地計畫。4 step 研究 + QA 把關。",
    workspace: "facebook",
    category: "planning",
    impl_kind: "squad",
    squad_slug: "fb-account-reposition",
    status: "active",
    bypassable: false,
    search_keywords: "帳號,定位,reposition,FB,Facebook,品牌,audit,競品",
    estimated_minutes: 30,
  },
  {
    slug: "fb-quarterly-strategy",
    name_zh: "Facebook 季度策略",
    description: "三個月 FB 策略：pillar 配比 / 月份分配 / KPI 設定 / 季度 calendar 排程。月行事曆的上一層母模板。",
    workspace: "facebook",
    category: "planning",
    impl_kind: "squad",
    squad_slug: "fb-quarterly-strategy",
    status: "active",
    bypassable: true,
    search_keywords: "季度,quarterly,策略,FB,Facebook,KPI,strategy,90day",
    estimated_minutes: 35,
  },
  {
    slug: "fb-countdown-series",
    name_zh: "Facebook 倒數活動系列",
    description: "為一場活動產出 5-7 篇連續倒數貼文，主題遞進 + 緊迫感升溫，最後一篇接活動當天。",
    workspace: "facebook",
    category: "campaign",
    impl_kind: "squad",
    squad_slug: "fb-countdown-series",
    status: "active",
    bypassable: true,
    search_keywords: "倒數,countdown,系列,FB,Facebook,活動,scarcity",
    estimated_minutes: 10,
  },
  {
    slug: "fb-livestream-prep",
    name_zh: "Facebook 直播預告 + 後續摘要",
    description: "成對 2 篇：直播前預告（時間/主題/誘因）+ 直播後重點摘要（精華/QA/CTA）。同一個 agent 一次寫完，敘事一致。",
    workspace: "facebook",
    category: "campaign",
    impl_kind: "atomic",
    agent_slug: "fb-brief-writer",  // Aiden Hsu — FB content brief writer (id 239183)
    status: "active",
    bypassable: true,
    search_keywords: "直播,livestream,預告,摘要,FB,Facebook,成對",
    estimated_minutes: 7,
  },
  {
    slug: "fb-crisis-reply",
    name_zh: "Facebook 負評 / 客訴回覆草稿",
    description: "針對負評 / 客訴的公開回覆草稿：致歉（同理）+ 解釋（事實）+ 後續行動（具體承諾）+ 私訊邀請。需要使用者貼上原始客訴內容。",
    workspace: "facebook",
    category: "crisis",
    impl_kind: "atomic",
    agent_slug: "fb-brief-writer",  // Aiden Hsu — FB content brief writer (id 239183)  // TODO: dedicate crisis-comms agent later
    status: "active",
    bypassable: false,  // needs the actual complaint text
    search_keywords: "負評,客訴,回覆,危機,crisis,reply,FB,Facebook,致歉",
    estimated_minutes: 4,
  },
];

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  console.log(`[seed-task-catalog-fb] processing ${TASKS.length} tasks…`);

  let inserted = 0, updated = 0, skipped = 0;
  for (const t of TASKS) {
    // Resolve squad_id / agent_id from slug
    let squadId: number | null = null;
    let agentId: number | null = null;
    if (t.squad_slug) {
      const [r]: any = await pool.execute(`SELECT id FROM squads WHERE slug = ? LIMIT 1`, [t.squad_slug]);
      squadId = (r as any[])?.[0]?.id ?? null;
      if (!squadId && t.status === "active") {
        console.warn(`  ✗ ${t.slug}: squad slug "${t.squad_slug}" not found — downgrading to coming_soon`);
        t.status = "coming_soon";
      }
    }
    if (t.agent_slug) {
      const [r]: any = await pool.execute(`SELECT id FROM agents WHERE slug = ? LIMIT 1`, [t.agent_slug]);
      agentId = (r as any[])?.[0]?.id ?? null;
      if (!agentId && t.status === "active") {
        // Fall back to any FB content writer
        const [fb]: any = await pool.execute(
          `SELECT id, slug, name FROM agents
            WHERE primarySkill LIKE '%FB%' OR primarySkill LIKE '%Facebook%' OR primarySkill LIKE '%文案%'
            ORDER BY id ASC LIMIT 1`,
        );
        agentId = (fb as any[])?.[0]?.id ?? null;
        if (agentId) {
          console.log(`  ↪ ${t.slug}: agent_slug "${t.agent_slug}" not found — using fallback agent #${agentId} (${(fb as any[])[0].name})`);
        } else {
          console.warn(`  ✗ ${t.slug}: no agent found — downgrading to coming_soon`);
          t.status = "coming_soon";
        }
      }
    }

    // Existence check
    const [existRows]: any = await pool.execute(
      `SELECT id FROM task_catalog WHERE slug = ? LIMIT 1`,
      [t.slug],
    );
    const exists = (existRows as any[])?.[0]?.id ?? null;

    if (exists) {
      await pool.execute(
        `UPDATE task_catalog
            SET name_zh=?, name_en=?, description=?, workspace=?, category=?,
                impl_kind=?, squad_id=?, agent_id=?, status=?, bypassable=?,
                search_keywords=?, estimated_minutes=?
          WHERE id=?`,
        [
          t.name_zh, t.name_en ?? null, t.description, t.workspace, t.category,
          t.impl_kind, squadId, agentId, t.status, t.bypassable ? 1 : 0,
          t.search_keywords, t.estimated_minutes,
          exists,
        ],
      );
      updated++;
      console.log(`  ✓ updated #${exists}  ${t.slug}  (${t.status}${t.impl_kind === "squad" ? `, squad=${squadId}` : `, agent=${agentId}`})`);
    } else {
      const [r]: any = await pool.execute(
        `INSERT INTO task_catalog
           (slug, name_zh, name_en, description, workspace, category,
            impl_kind, squad_id, agent_id, status, bypassable,
            search_keywords, estimated_minutes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          t.slug, t.name_zh, t.name_en ?? null, t.description, t.workspace, t.category,
          t.impl_kind, squadId, agentId, t.status, t.bypassable ? 1 : 0,
          t.search_keywords, t.estimated_minutes,
        ],
      );
      inserted++;
      console.log(`  ✓ inserted #${r?.insertId}  ${t.slug}  (${t.status})`);
    }
  }

  // Auto-approve squads bound to active catalog tasks. CJ direction:
  // if a task is publicly surfaced as "active", its underlying squad
  // must be is_approved=1 (otherwise stepExecute / runStepLive will
  // fail or render the "🟡 reviewing" badge).
  const [activeSquadRows]: any = await pool.execute(
    `SELECT DISTINCT squad_id FROM task_catalog
      WHERE status = 'active' AND impl_kind = 'squad' AND squad_id IS NOT NULL`,
  );
  const activeSquadIds = (activeSquadRows as any[]).map((r) => Number(r.squad_id)).filter(Boolean);
  if (activeSquadIds.length > 0) {
    const placeholders = activeSquadIds.map(() => "?").join(",");
    const [r]: any = await pool.execute(
      `UPDATE squads SET is_approved = 1, approved_at = NOW()
        WHERE id IN (${placeholders}) AND is_approved = 0`,
      activeSquadIds,
    );
    console.log(`\n[seed-task-catalog-fb] auto-approved ${(r as any)?.affectedRows ?? 0} squad(s) bound to active tasks: [${activeSquadIds.join(", ")}]`);
  }

  console.log(`\n[seed-task-catalog-fb] done. inserted=${inserted} updated=${updated} skipped=${skipped}`);
  console.log(`\n=== Final state ===`);
  const [stateRows]: any = await pool.execute(
    `SELECT status, COUNT(*) AS c FROM task_catalog WHERE workspace = 'facebook' GROUP BY status`,
  );
  for (const r of (stateRows as any[])) {
    console.log(`  ${r.status}: ${r.c}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
