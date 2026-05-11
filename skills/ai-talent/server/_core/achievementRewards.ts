/**
 * Achievement rewards — per-route + finale (all 18) reward catalog
 * + grant logic.
 *
 * 2026-05-10 (CJ「完成後要給什麼獎勵？」3-tier strategy):
 *
 *   Tier 1 — Per-achievement: dopamine (toast + points; already shipped)
 *   Tier 2 — Per-route (3/3 in a route):  quota bonus / feature flag / trial extend
 *   Tier 3 — All-18 finale:               founding badge + promo codes
 *
 * Tier 2/3 grants persist in:
 *   users.quotaBonus       JSON  — added to plan baseline at runtime
 *   users.featureFlags     JSON  — render conditional UI
 *   user_route_rewards     row   — dedup so we don't double-grant
 *   promo_codes            row   — issued discount codes
 */
import localPool from "../localDb";
import { ACHIEVEMENTS, type AchievementRoute } from "./achievements";

export type Reward =
  | { type: "quota_bonus"; field: "image_gen" | "video_gen" | "brands"; amount: number; label: string }
  | { type: "trial_extend"; days: number; label: string }
  | { type: "feature_flag"; flag: string; label: string }
  | { type: "promo_code"; kind: "first_month_pct" | "annual_pct"; discountPct: number; expiresInDays: number; label: string }
  | { type: "badge"; name: string; label: string };

/** Per-route rewards. Granted when ALL achievements in that route are unlocked. */
export const ROUTE_REWARDS: Record<AchievementRoute, Reward[]> = {
  onboarding: [
    { type: "quota_bonus", field: "brands", amount: 1, label: "額外 1 個品牌位（試用期間）" },
  ],
  explore: [
    { type: "quota_bonus", field: "image_gen", amount: 30, label: "額外 30 張 AI 圖（試用期間）" },
  ],
  visual: [
    { type: "quota_bonus", field: "video_gen", amount: 2, label: "額外 2 支 AI 影片（試用期間）" },
  ],
  planning: [
    { type: "feature_flag", flag: "schedule_reminder_beta", label: "解鎖「自動排程提醒」beta" },
  ],
  integration: [
    { type: "feature_flag", flag: "brand_style_export", label: "解鎖「品牌風格匯出 PDF」" },
  ],
  publish: [
    { type: "trial_extend", days: 3, label: "試用期延長 3 天" },
  ],
  upgrade: [
    { type: "promo_code", kind: "first_month_pct", discountPct: 10, expiresInDays: 30, label: "首月 9 折券（30 天內兌換）" },
  ],
};

/** All-18 finale rewards. Granted when every single achievement is unlocked. */
export const FINALE_REWARDS: Reward[] = [
  { type: "badge", name: "onbrand_founding_user", label: "OnBrand Founding User 永久徽章" },
  { type: "promo_code", kind: "first_month_pct", discountPct: 10, expiresInDays: 30, label: "首月 9 折券（重複領）" },
  { type: "promo_code", kind: "annual_pct", discountPct: 7, expiresInDays: 60, label: "年繳再折 7%（60 天內兌換）" },
  { type: "feature_flag", flag: "early_access", label: "新功能搶先體驗" },
];

/** Generate a 12-char alphanumeric code, uppercase. */
function genCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // skip ambiguous I/O/0/1
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${s}`;
}

/** Apply a single reward. Idempotent at the value level (e.g. multiple
 *  trial extends will add up; flags toggle; promo codes always create new
 *  unique row). Caller is responsible for de-dup at the route level. */
async function applyReward(userId: number, reward: Reward): Promise<{ applied: boolean; meta?: any }> {
  switch (reward.type) {
    case "quota_bonus": {
      // Read existing JSON, merge field, write back.
      const [rows]: any = await localPool.execute(
        `SELECT quotaBonus FROM users WHERE id = ?`,
        [userId],
      );
      const existing = (() => {
        const v = (rows as any[])[0]?.quotaBonus;
        if (!v) return {};
        if (typeof v === "string") { try { return JSON.parse(v); } catch { return {}; } }
        return v;
      })();
      existing[reward.field] = (Number(existing[reward.field] ?? 0)) + reward.amount;
      await localPool.execute(
        `UPDATE users SET quotaBonus = ? WHERE id = ?`,
        [JSON.stringify(existing), userId],
      );
      return { applied: true, meta: { newQuotaBonus: existing } };
    }
    case "trial_extend": {
      // Add days to planEndsAt (only meaningful when on trial)
      await localPool.execute(
        `UPDATE users SET planEndsAt = DATE_ADD(planEndsAt, INTERVAL ? DAY) WHERE id = ? AND planStatus = 'trial'`,
        [reward.days, userId],
      );
      return { applied: true };
    }
    case "feature_flag": {
      const [rows]: any = await localPool.execute(
        `SELECT featureFlags FROM users WHERE id = ?`,
        [userId],
      );
      const existing = (() => {
        const v = (rows as any[])[0]?.featureFlags;
        if (!v) return {};
        if (typeof v === "string") { try { return JSON.parse(v); } catch { return {}; } }
        return v;
      })();
      existing[reward.flag] = true;
      await localPool.execute(
        `UPDATE users SET featureFlags = ? WHERE id = ?`,
        [JSON.stringify(existing), userId],
      );
      return { applied: true };
    }
    case "promo_code": {
      const code = genCode(reward.kind === "annual_pct" ? "DROP-Y" : "DROP-M");
      const expiresAt = new Date(Date.now() + reward.expiresInDays * 24 * 3600_000);
      await localPool.execute(
        `INSERT INTO promo_codes (code, userId, kind, discountPct, source, expiresAt)
         VALUES (?, ?, ?, ?, 'achievement', ?)`,
        [code, userId, reward.kind, reward.discountPct, expiresAt],
      );
      return { applied: true, meta: { code, expiresAt: expiresAt.toISOString() } };
    }
    case "badge": {
      // Badges live in featureFlags too (simpler than separate table)
      return await applyReward(userId, { type: "feature_flag", flag: `badge_${reward.name}`, label: reward.label });
    }
  }
}

/** Determine which routes the user has fully completed but not yet been granted for.
 *  Returns the routes + their rewards so caller can apply + UI can show. */
export async function findPendingRouteGrants(
  userId: number,
  unlockedCodes: Set<string>,
): Promise<Array<{ route: AchievementRoute; rewards: Reward[]; appliedMeta: any[] }>> {
  // Which routes are fully completed?
  const completedRoutes = new Set<AchievementRoute>();
  const routes: AchievementRoute[] = ["onboarding", "explore", "visual", "planning", "integration", "publish", "upgrade"];
  for (const route of routes) {
    const inRoute = ACHIEVEMENTS.filter((a) => a.route === route);
    if (inRoute.every((a) => unlockedCodes.has(a.code))) {
      completedRoutes.add(route);
    }
  }
  if (completedRoutes.size === 0) return [];

  // Which routes already granted?
  const [granted]: any = await localPool.execute(
    `SELECT route FROM user_route_rewards WHERE userId = ?`,
    [userId],
  );
  const grantedSet = new Set((granted as any[]).map((r) => r.route as AchievementRoute));

  const pending: Array<{ route: AchievementRoute; rewards: Reward[]; appliedMeta: any[] }> = [];
  for (const route of completedRoutes) {
    if (grantedSet.has(route)) continue;
    pending.push({ route, rewards: ROUTE_REWARDS[route] ?? [], appliedMeta: [] });
  }
  return pending;
}

/** Grant pending route rewards + finale (if 18/18). Returns what was granted. */
export async function grantRouteRewards(
  userId: number,
  unlockedCodes: Set<string>,
): Promise<{
  newlyGrantedRoutes: Array<{ route: AchievementRoute; rewards: Reward[]; appliedMeta: any[] }>;
  finaleGranted: { rewards: Reward[]; appliedMeta: any[] } | null;
}> {
  const pending = await findPendingRouteGrants(userId, unlockedCodes);

  // Apply each route's rewards
  for (const p of pending) {
    for (const r of p.rewards) {
      try {
        const result = await applyReward(userId, r);
        if (result.applied) p.appliedMeta.push({ reward: r, meta: result.meta ?? null });
      } catch (e) {
        console.warn(`[reward] route ${p.route} apply failed`, e);
      }
    }
    // Mark as granted
    try {
      await localPool.execute(
        `INSERT IGNORE INTO user_route_rewards (userId, route, rewardJson) VALUES (?, ?, ?)`,
        [userId, p.route, JSON.stringify(p.appliedMeta)],
      );
    } catch (e) {
      console.warn(`[reward] route ${p.route} mark-granted failed`, e);
    }
  }

  // Finale check — all 18 unlocked + finale not yet granted
  let finaleGranted: { rewards: Reward[]; appliedMeta: any[] } | null = null;
  if (unlockedCodes.size >= ACHIEVEMENTS.length) {
    // dedup via user_route_rewards with route='__finale__'
    const [rows]: any = await localPool.execute(
      `SELECT 1 FROM user_route_rewards WHERE userId = ? AND route = '__finale__' LIMIT 1`,
      [userId],
    );
    if ((rows as any[]).length === 0) {
      const appliedMeta: any[] = [];
      for (const r of FINALE_REWARDS) {
        try {
          const result = await applyReward(userId, r);
          if (result.applied) appliedMeta.push({ reward: r, meta: result.meta ?? null });
        } catch (e) {
          console.warn("[reward] finale apply failed", e);
        }
      }
      try {
        await localPool.execute(
          `INSERT IGNORE INTO user_route_rewards (userId, route, rewardJson) VALUES (?, '__finale__', ?)`,
          [userId, JSON.stringify(appliedMeta)],
        );
      } catch {}
      finaleGranted = { rewards: FINALE_REWARDS, appliedMeta };
    }
  }

  return { newlyGrantedRoutes: pending, finaleGranted };
}

/** Read user's quota bonus + feature flags for runtime checks (paywall etc). */
export async function getUserBonuses(userId: number): Promise<{
  quotaBonus: Record<string, number>;
  featureFlags: Record<string, boolean>;
}> {
  const [rows]: any = await localPool.execute(
    `SELECT quotaBonus, featureFlags FROM users WHERE id = ?`,
    [userId],
  );
  const r = (rows as any[])[0] ?? {};
  const parse = (v: any) => {
    if (!v) return {};
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return {}; } }
    return v;
  };
  return {
    quotaBonus: parse(r.quotaBonus),
    featureFlags: parse(r.featureFlags),
  };
}
