/**
 * Achievement catalog — 18 unlocks across 6 routes covering the 7-day
 * trial journey. Each achievement maps to a real product moment that
 * (a) demonstrates Drop's value and (b) increases conversion likelihood.
 *
 * 2026-05-10 (CJ direction「成就系統，引導用戶使用完整個系統」).
 *
 * Trigger model:
 *   - Each achievement has an `evaluator` predicate that runs against
 *     the user's current state (DB queries against missions / outputs /
 *     brands / invoices).
 *   - `evaluateAll(userId)` runs all evaluators, INSERT IGNORE into
 *     user_achievements, returns newly-unlocked codes.
 *   - Called from a thin hook after key events (task complete, image gen,
 *     register, publish, etc.) — NOT polled, so no overhead.
 *   - Frontend separately calls `achievements.getProgress` to render UI.
 */

export type AchievementRoute = "onboarding" | "explore" | "visual" | "planning" | "integration" | "publish" | "upgrade";

export interface Achievement {
  code: string;
  route: AchievementRoute;
  order: number;             // ordering within route
  /** Display title — short, action-oriented, no emoji noise (Notion B&W). */
  title: string;
  /** One-line "why this matters" + how to unlock. */
  description: string;
  /** Lucide icon name (renders B&W). */
  icon: string;
  /** Optional CTA — page to navigate to when locked. */
  ctaPath?: string;
  /** Lucide-React-style suggestion shown alongside locked entry. */
  ctaText?: string;
  /** XP-like points (used for streak / progress vibes). */
  points: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ───── Day 1 — Onboarding ─────
  {
    code: "first_step",
    route: "onboarding", order: 1, points: 5,
    title: "第一步",
    description: "成功建立 Drop 帳號 — 歡迎入坑！",
    icon: "Sparkles",
  },
  {
    code: "first_brand",
    route: "onboarding", order: 2, points: 10,
    title: "立基",
    description: "建立第一個品牌資產（logo + 定位 + 用詞）",
    icon: "Building2",
    ctaPath: "/brands", ctaText: "去建立品牌",
  },
  {
    code: "first_task",
    route: "onboarding", order: 3, points: 10,
    title: "初試身手",
    description: "跑完第一個 30 秒任務，看到 AI 產出",
    icon: "Zap",
    ctaPath: "/30s", ctaText: "挑一個任務試試",
  },

  // ───── Day 2 — Explore ─────
  {
    code: "three_platforms",
    route: "explore", order: 1, points: 15,
    title: "多元嘗試",
    description: "在 3 個不同平台（FB / IG / YT...）跑過任務",
    icon: "LayoutGrid",
    ctaPath: "/30s", ctaText: "換平台試試",
  },
  {
    code: "use_chat_refine",
    route: "explore", order: 2, points: 10,
    title: "對話改寫",
    description: "用 💬 對話 功能跟 agent 改寫一次內容",
    icon: "MessageCircle",
    ctaText: "在任意 /run 頁試試",
  },
  {
    code: "use_regen",
    route: "explore", order: 3, points: 10,
    title: "不滿意就重生",
    description: "用過 🪄 重新生成，看 agent 換個角度寫",
    icon: "RefreshCw",
    ctaText: "在任意 /run 頁試試",
  },

  // ───── Day 3 — Visual ─────
  {
    code: "first_image",
    route: "visual", order: 1, points: 15,
    title: "視覺人",
    description: "第一張 AI 生成的圖片產出成功",
    icon: "Image",
    ctaText: "在 /run 頁點 改圖",
  },
  {
    code: "first_video",
    route: "visual", order: 2, points: 25,
    title: "影像派",
    description: "第一支 AI 短影片產出成功（Hailuo / Kling）",
    icon: "Video",
    ctaText: "在 /run 頁點 改影片",
  },

  // ───── Day 4 — Planning ─────
  {
    code: "first_theater",
    route: "planning", order: 1, points: 25,
    title: "一週企劃師",
    description: "完成第一個 Theater 7 天內容企劃",
    icon: "Calendar",
    ctaPath: "/theater", ctaText: "進企劃台",
  },

  // ───── Day 5 — Integration ─────
  {
    code: "four_platform_campaign",
    route: "integration", order: 1, points: 20,
    title: "跨平台主",
    description: "在同一個 Theater 企劃中包含 4 個以上平台",
    icon: "Layers",
  },
  {
    code: "use_brand_rule",
    route: "integration", order: 2, points: 15,
    title: "客製規則",
    description: "用過「標記修改 → 套用到本品牌」儲存品牌規則",
    icon: "Flag",
  },
  {
    code: "edit_caption",
    route: "integration", order: 3, points: 10,
    title: "親手調校",
    description: "用 ✏️ 編輯 直接修改過 agent 產出",
    icon: "Pencil",
  },

  // ───── Day 6 — Publish ─────
  {
    code: "first_fb_publish",
    route: "publish", order: 1, points: 30,
    title: "真實發布",
    description: "用「直接發 Facebook」把內容真的貼出去",
    icon: "Send",
    ctaText: "在 /run 頁點 直接發 FB",
  },
  {
    code: "use_schedule",
    route: "publish", order: 2, points: 15,
    title: "排程達人",
    description: "用「排程到日曆」把貼文加進你的工作排程",
    icon: "CalendarPlus",
  },
  {
    code: "use_email_team",
    route: "publish", order: 3, points: 10,
    title: "團隊協作",
    description: "用「寄給團隊」把產出寄給其他人 review",
    icon: "Mail",
  },
  {
    code: "save_to_mission",
    route: "publish", order: 4, points: 5,
    title: "歸檔習慣",
    description: "用「存到 Mission」存了第一個正式版本",
    icon: "FolderCheck",
  },

  // ───── Day 7 — Upgrade ─────
  {
    code: "ten_tasks",
    route: "upgrade", order: 1, points: 20,
    title: "工作流",
    description: "累計完成 10 個任務 — 你已經是 Drop 老手",
    icon: "Award",
  },
  {
    code: "subscribed",
    route: "upgrade", order: 2, points: 50,
    title: "Drop Pro 用戶",
    description: "升級為 Drop Pro，無限 30 秒任務一路跑",
    icon: "Crown",
    ctaPath: "/pricing", ctaText: "查看方案",
  },
];

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;
export const TOTAL_POINTS = ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);

export function findAchievement(code: string): Achievement | null {
  return ACHIEVEMENTS.find((a) => a.code === code) ?? null;
}

export function getRoute(route: AchievementRoute): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.route === route)
    .sort((a, b) => a.order - b.order);
}

export const ROUTE_META: Record<AchievementRoute, { label: string; subtitle: string; dayHint: string }> = {
  onboarding:  { label: "入門",   subtitle: "三步驟跑出第一個產出", dayHint: "Day 1" },
  explore:     { label: "探索",   subtitle: "試試不同平台 + 改寫工具", dayHint: "Day 2" },
  visual:      { label: "視覺",   subtitle: "AI 圖 + AI 影片各試一次", dayHint: "Day 3" },
  planning:    { label: "規劃",   subtitle: "整週的內容一次企劃完", dayHint: "Day 4" },
  integration: { label: "整合",   subtitle: "跨平台 + 品牌規則", dayHint: "Day 5" },
  publish:     { label: "發布",   subtitle: "真的把內容送出去", dayHint: "Day 6" },
  upgrade:     { label: "升級",   subtitle: "成為 Drop Pro", dayHint: "Day 7" },
};

// ─── Evaluators ──────────────────────────────────────────────────────
// Each returns true if the user has met the unlock condition NOW.

import { default as localPool } from "../localDb";

async function userMissionCount(userId: number): Promise<number> {
  const [r]: any = await localPool.execute(
    `SELECT COUNT(*) AS n FROM mission_outputs o
     JOIN missions m ON m.id = o.missionId
     WHERE m.userId = ?`,
    [userId],
  );
  return Number((r as any[])[0]?.n ?? 0);
}

async function distinctPlatformCount(userId: number): Promise<number> {
  const [r]: any = await localPool.execute(
    `SELECT COUNT(DISTINCT o.platform) AS n FROM mission_outputs o
     JOIN missions m ON m.id = o.missionId
     WHERE m.userId = ?`,
    [userId],
  );
  return Number((r as any[])[0]?.n ?? 0);
}

async function brandCount(userId: number): Promise<number> {
  const [r]: any = await localPool.execute(
    `SELECT COUNT(*) AS n FROM brands WHERE userId = ?`,
    [userId],
  );
  return Number((r as any[])[0]?.n ?? 0);
}

async function hasMetadataFlag(userId: number, jsonPath: string): Promise<boolean> {
  // Returns true if any of user's mission_outputs has metadata containing the path
  const [r]: any = await localPool.execute(
    `SELECT COUNT(*) AS n FROM mission_outputs o
     JOIN missions m ON m.id = o.missionId
     WHERE m.userId = ? AND JSON_EXTRACT(o.metadata, ?) IS NOT NULL`,
    [userId, jsonPath],
  );
  return Number((r as any[])[0]?.n ?? 0) > 0;
}

async function planIsActive(userId: number): Promise<boolean> {
  const [r]: any = await localPool.execute(
    `SELECT planStatus FROM users WHERE id = ?`,
    [userId],
  );
  return (r as any[])[0]?.planStatus === "active";
}

/** Run all evaluators against current user state. Uses DB state directly
 *  (no per-feature metadata flags needed) — leverages existing mission_outputs
 *  columns + status enum + brand_caption_rules + invoices.
 *
 *  Returns codes that evaluate true. Caller diff against already-unlocked. */
export async function evaluateUserState(userId: number): Promise<string[]> {
  const unlocked: string[] = ["first_step"]; // everyone who exists has registered
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  const [missionN, platformN, brandN, isPaid] = await Promise.all([
    safe(() => userMissionCount(userId), 0),
    safe(() => distinctPlatformCount(userId), 0),
    safe(() => brandCount(userId), 0),
    safe(() => planIsActive(userId), false),
  ]);

  if (brandN >= 1) unlocked.push("first_brand");
  if (missionN >= 1) unlocked.push("first_task");
  if (platformN >= 3) unlocked.push("three_platforms");
  if (platformN >= 4) unlocked.push("four_platform_campaign");
  if (missionN >= 10) unlocked.push("ten_tasks");
  if (isPaid) unlocked.push("subscribed");

  // ── Per-feature flags (use existing DB state, not metadata) ──
  // first_image — any variant in mission_outputs.content has image url
  if (await safe(async () => {
    const [r]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM mission_outputs o
       JOIN missions m ON m.id = o.missionId
       WHERE m.userId = ? AND o.content LIKE '%"imageUrl"%' AND o.content NOT LIKE '%"imageUrl":null%'`,
      [userId],
    );
    return Number((r as any[])[0]?.n ?? 0) > 0;
  }, false)) unlocked.push("first_image");

  // first_video — video_jobs table for this user with completed status
  if (await safe(async () => {
    const [r]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM video_jobs WHERE userId = ? AND status = 'completed'`,
      [userId],
    );
    return Number((r as any[])[0]?.n ?? 0) > 0;
  }, false)) unlocked.push("first_video");

  // first_theater — Theater puts taskId starting "theater-" or has metadata.tier='theater'
  // Approximate: any mission with workspace='theater' OR 4+ outputs same date
  if (await safe(async () => {
    const [r]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM missions WHERE userId = ? AND workspace = 'theater'`,
      [userId],
    );
    return Number((r as any[])[0]?.n ?? 0) > 0;
  }, false)) unlocked.push("first_theater");

  // use_regen — metadata.lastRegenAt set by quickTask.regenerateVariant
  if (await safe(() => hasMetadataFlag(userId, "$.lastRegenAt"), false))
    unlocked.push("use_regen");

  // use_chat_refine — metadata.refinedViaChat (we'll set this in refineCaption mutation)
  if (await safe(() => hasMetadataFlag(userId, "$.refinedViaChat"), false))
    unlocked.push("use_chat_refine");

  // use_brand_rule — brand_caption_rules entry for any of user's brands
  if (await safe(async () => {
    const [r]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM brand_caption_rules r
       JOIN brands b ON b.id = r.brandId WHERE b.userId = ?`,
      [userId],
    );
    return Number((r as any[])[0]?.n ?? 0) > 0;
  }, false)) unlocked.push("use_brand_rule");

  // edit_caption — version > 1 means it was updated post-creation
  if (await safe(async () => {
    const [r]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM mission_outputs o
       JOIN missions m ON m.id = o.missionId
       WHERE m.userId = ? AND o.version > 1`,
      [userId],
    );
    return Number((r as any[])[0]?.n ?? 0) > 0;
  }, false)) unlocked.push("edit_caption");

  // first_fb_publish — output with status='published'
  if (await safe(async () => {
    const [r]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM mission_outputs o
       JOIN missions m ON m.id = o.missionId
       WHERE m.userId = ? AND o.status = 'published'`,
      [userId],
    );
    return Number((r as any[])[0]?.n ?? 0) > 0;
  }, false)) unlocked.push("first_fb_publish");

  // use_schedule — output with status='scheduled' or scheduledAt IS NOT NULL
  if (await safe(async () => {
    const [r]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM mission_outputs o
       JOIN missions m ON m.id = o.missionId
       WHERE m.userId = ? AND (o.status = 'scheduled' OR o.scheduledAt IS NOT NULL)`,
      [userId],
    );
    return Number((r as any[])[0]?.n ?? 0) > 0;
  }, false)) unlocked.push("use_schedule");

  // use_email_team — metadata.emailedTeam flag (we'll set in emailToTeam)
  if (await safe(() => hasMetadataFlag(userId, "$.emailedTeam"), false))
    unlocked.push("use_email_team");

  // save_to_mission — output with status='approved'
  if (await safe(async () => {
    const [r]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM mission_outputs o
       JOIN missions m ON m.id = o.missionId
       WHERE m.userId = ? AND o.status = 'approved'`,
      [userId],
    );
    return Number((r as any[])[0]?.n ?? 0) > 0;
  }, false)) unlocked.push("save_to_mission");

  return Array.from(new Set(unlocked));
}

/** Persist newly-unlocked achievements. Returns the codes that were
 *  freshly inserted (already-unlocked don't appear in the result). */
export async function recordUnlocks(userId: number, codes: string[]): Promise<string[]> {
  if (codes.length === 0) return [];
  const fresh: string[] = [];
  for (const code of codes) {
    try {
      const [r]: any = await localPool.execute(
        `INSERT IGNORE INTO user_achievements (userId, code, unlockedAt)
         VALUES (?, ?, NOW())`,
        [userId, code],
      );
      // affectedRows = 1 means actually inserted (= newly unlocked)
      if (Number(r?.affectedRows ?? 0) === 1) fresh.push(code);
    } catch (e) {
      console.warn("[achievements] recordUnlocks failed for", code, e);
    }
  }
  return fresh;
}

/** Convenience: evaluate + record + return fresh unlocks. */
export async function evaluateAndRecord(userId: number): Promise<string[]> {
  const should = await evaluateUserState(userId);
  return recordUnlocks(userId, should);
}
