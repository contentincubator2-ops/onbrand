/**
 * adminStatsRouter — internal monitoring dashboard data.
 *
 * 2026-05-16 (CJ「幫我規劃一個後台，可以監測使用者的情況數量等等」).
 *
 * Three read-only rollups, all adminProcedure-gated (role='admin' OR
 * @sowork.tw|ai OR userId 199 — see _core/trpc.ts adminProcedure):
 *   overview   — growth funnel: signups / verified / active / retention
 *                + entity counts (brands / missions / outputs)
 *   usageCost  — LLM spend rollup, today-vs-cap, top spenders, task volume
 *   health     — stuck positioning jobs, support ticket volume,
 *                unverified accounts, recent error count
 *   recentUsers — last N signups with status (for the table)
 *
 * Pure SELECTs — no writes. Raw SQL via localPool (matches the
 * billingRouter / positioningJobsRouter analytics convention).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../core/trpc";
import { addPoints } from "../core/billing/pointsService";
import { computeProofMetrics } from "../core/proofMetrics";
import { pushSystemSupportMessage } from "./supportRouter";

const n = (v: any) => Number(v ?? 0);

// Bounty for a confirmed real bug. Trial = 300 pts, so 200 ≈ a few
// extra tasks — meaningful thank-you without being farmable (only
// granted on admin/triage CONFIRM, once per report).
const BUG_BOUNTY_POINTS = 200;

const csvCell = (v: any) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const adminStatsRouter = router({
  /**
   * 2026-06-07 (CJ「Part 1 投資人會看的指標」): three new queries built
   * directly for fundraising metric review. Activation funnel + cohort
   * retention + time-to-first-value.
   *
   *   activationFunnel — Sign up → Build brand → Run first task → Run 3rd → D7 active
   *                       For the cohort of users who signed up in the last N days.
   *   cohortRetention  — Weekly cohort table: each row = signup week,
   *                       columns = % still active on week 1/2/4/8
   *   timeToFirstValue — Median/p75 minutes from signup to first mission_output
   */

  /**
   * Activation funnel for users who signed up in the last `days` days.
   * Returns absolute counts at each stage + conversion percentages.
   */
  activationFunnel: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(180).default(30) }).optional())
    .query(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const days = input?.days ?? 30;

      const [[row]]: any = await localPool.execute(`
        SELECT
          /* Stage 1: signed up */
          COUNT(DISTINCT u.id) AS signed_up,

          /* Stage 2: verified email (isActive = 1) */
          COUNT(DISTINCT CASE WHEN u.isActive = 1 THEN u.id END) AS verified,

          /* Stage 3: created at least one brand */
          COUNT(DISTINCT CASE WHEN b.userId IS NOT NULL THEN u.id END) AS built_brand,

          /* Stage 4: completed at least one mission_output (= ran a real task) */
          COUNT(DISTINCT CASE WHEN mo_first.userId IS NOT NULL THEN u.id END) AS first_task,

          /* Stage 5: ran 3+ tasks (the "activated" milestone) */
          COUNT(DISTINCT CASE WHEN mo_count.task_count >= 3 THEN u.id END) AS activated,

          /* Stage 6: still active in the last 7 days (D7 retention) */
          COUNT(DISTINCT CASE WHEN mo_recent.userId IS NOT NULL THEN u.id END) AS d7_retained
        FROM users u
        LEFT JOIN (SELECT DISTINCT userId FROM brands) b
               ON b.userId = u.id
        LEFT JOIN (SELECT DISTINCT m.userId FROM missions m
                     JOIN mission_outputs mo ON mo.missionId = m.id) mo_first
               ON mo_first.userId = u.id
        LEFT JOIN (SELECT m.userId, COUNT(*) AS task_count
                     FROM missions m
                     JOIN mission_outputs mo ON mo.missionId = m.id
                     GROUP BY m.userId) mo_count
               ON mo_count.userId = u.id
        LEFT JOIN (SELECT DISTINCT m.userId
                     FROM missions m
                     JOIN mission_outputs mo ON mo.missionId = m.id
                     WHERE mo.createdAt >= NOW() - INTERVAL 7 DAY) mo_recent
               ON mo_recent.userId = u.id
        WHERE u.createdAt >= NOW() - INTERVAL ${days} DAY
      `);

      const pct = (numer: number, denom: number): number =>
        denom > 0 ? Math.round((numer / denom) * 100) : 0;

      const signedUp = n(row.signed_up);
      const verified = n(row.verified);
      const builtBrand = n(row.built_brand);
      const firstTask = n(row.first_task);
      const activated = n(row.activated);
      const d7Retained = n(row.d7_retained);

      return {
        windowDays: days,
        stages: [
          { key: "signed_up",   label: "註冊",         count: signedUp,    pctOfTotal: 100, pctOfPrev: 100 },
          { key: "verified",    label: "驗證 Email",   count: verified,    pctOfTotal: pct(verified, signedUp),    pctOfPrev: pct(verified, signedUp) },
          { key: "built_brand", label: "建立品牌",     count: builtBrand,  pctOfTotal: pct(builtBrand, signedUp),  pctOfPrev: pct(builtBrand, verified) },
          { key: "first_task",  label: "跑首個任務",   count: firstTask,   pctOfTotal: pct(firstTask, signedUp),   pctOfPrev: pct(firstTask, builtBrand) },
          { key: "activated",   label: "Activated (3+ 任務)", count: activated, pctOfTotal: pct(activated, signedUp), pctOfPrev: pct(activated, firstTask) },
          { key: "d7_retained", label: "D7 仍活躍",   count: d7Retained,  pctOfTotal: pct(d7Retained, signedUp),  pctOfPrev: pct(d7Retained, activated) },
        ],
        activationRate: pct(activated, signedUp),
      };
    }),

  /**
   * Weekly cohort retention table.
   * Rows = signup week. Columns = % of cohort still producing outputs in week N.
   */
  cohortRetention: adminProcedure
    .input(z.object({ weeks: z.number().int().min(2).max(16).default(8) }).optional())
    .query(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const weeks = input?.weeks ?? 8;

      // Get cohorts (last N weeks of signups, grouped by week)
      const [cohortRows]: any = await localPool.execute(`
        SELECT
          DATE(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY)) AS cohort_week,
          COUNT(*) AS cohort_size
        FROM users
        WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL ${weeks} WEEK)
        GROUP BY cohort_week
        ORDER BY cohort_week DESC
      `);
      const cohorts = (cohortRows as any[]).map((r) => ({
        week: String(r.cohort_week).slice(0, 10),
        size: n(r.cohort_size),
      }));

      if (cohorts.length === 0) return { cohorts: [], grid: [] };

      // For each cohort, count who was active in each following week
      const grid: Array<{ cohortWeek: string; size: number; retention: number[] }> = [];
      for (const c of cohorts) {
        const retention: number[] = [];
        for (let weekOffset = 0; weekOffset < weeks; weekOffset++) {
          // Skip if this week hasn't happened yet for this cohort
          const cohortDate = new Date(c.week + "T00:00:00Z");
          const checkDate = new Date(cohortDate.getTime() + weekOffset * 7 * 86_400_000);
          if (checkDate > new Date()) {
            retention.push(-1); // -1 marker = not yet measurable
            continue;
          }
          const [[r]]: any = await localPool.execute(`
            SELECT COUNT(DISTINCT m.userId) AS active
            FROM users u
            JOIN missions m ON m.userId = u.id
            JOIN mission_outputs mo ON mo.missionId = m.id
            WHERE DATE(DATE_SUB(u.createdAt, INTERVAL WEEKDAY(u.createdAt) DAY)) = ?
              AND mo.createdAt >= DATE_ADD(?, INTERVAL ${weekOffset} WEEK)
              AND mo.createdAt <  DATE_ADD(?, INTERVAL ${weekOffset + 1} WEEK)
          `, [c.week, c.week, c.week]);
          retention.push(c.size > 0 ? Math.round((n(r.active) / c.size) * 100) : 0);
        }
        grid.push({ cohortWeek: c.week, size: c.size, retention });
      }
      return { cohorts, grid };
    }),

  /**
   * Time-to-First-Value: median + p75 + p95 minutes between
   * signup and the user's first mission_output.
   */
  timeToFirstValue: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(180).default(30) }).optional())
    .query(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const days = input?.days ?? 30;

      // Get all (signup_time, first_output_time) pairs for users who reached first_task
      const [rows]: any = await localPool.execute(`
        SELECT
          u.id,
          u.createdAt AS signup_at,
          MIN(mo.createdAt) AS first_output_at,
          TIMESTAMPDIFF(MINUTE, u.createdAt, MIN(mo.createdAt)) AS minutes_to_value
        FROM users u
        JOIN missions m ON m.userId = u.id
        JOIN mission_outputs mo ON mo.missionId = m.id
        WHERE u.createdAt >= NOW() - INTERVAL ${days} DAY
        GROUP BY u.id, u.createdAt
        HAVING minutes_to_value IS NOT NULL AND minutes_to_value >= 0
        ORDER BY minutes_to_value ASC
      `);
      const minutes = (rows as any[]).map((r) => Number(r.minutes_to_value));
      const usersWhoActivated = minutes.length;

      // Get total signups for context
      const [[total]]: any = await localPool.execute(`
        SELECT COUNT(*) AS total FROM users WHERE createdAt >= NOW() - INTERVAL ${days} DAY
      `);
      const totalSignups = n(total.total);

      const pct = (sortedArr: number[], p: number): number => {
        if (!sortedArr.length) return 0;
        const idx = Math.min(sortedArr.length - 1, Math.floor((sortedArr.length - 1) * p));
        return sortedArr[idx] ?? 0;
      };

      return {
        windowDays: days,
        usersWhoActivated,
        totalSignups,
        activationRate: totalSignups > 0 ? Math.round((usersWhoActivated / totalSignups) * 100) : 0,
        p50Minutes: pct(minutes, 0.5),
        p75Minutes: pct(minutes, 0.75),
        p95Minutes: pct(minutes, 0.95),
        meanMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : 0,
        // Bucket counts for histogram display
        buckets: {
          under5min:   minutes.filter((m) => m < 5).length,
          under15min:  minutes.filter((m) => m >= 5 && m < 15).length,
          under60min:  minutes.filter((m) => m >= 15 && m < 60).length,
          under24h:    minutes.filter((m) => m >= 60 && m < 24 * 60).length,
          over24h:     minutes.filter((m) => m >= 24 * 60).length,
        },
      };
    }),

  /** Growth funnel + entity counts. */
  overview: adminProcedure.query(async () => {
    const { default: localPool } = await import("../../localDb");

    const [[u]]: any = await localPool.execute(`
      SELECT
        COUNT(*)                                                      AS totalUsers,
        SUM(isActive = 1)                                             AS activeUsers,
        SUM(isActive = 0)                                             AS unverifiedUsers,
        SUM(earlyBird = 1)                                            AS earlyBirdUsers,
        SUM(role = 'admin')                                           AS adminUsers,
        SUM(createdAt >= NOW() - INTERVAL 1 DAY)                       AS signups24h,
        SUM(createdAt >= NOW() - INTERVAL 7 DAY)                       AS signups7d,
        SUM(createdAt >= NOW() - INTERVAL 30 DAY)                      AS signups30d,
        SUM(authMethod IN ('google','oauth'))                         AS oauthUsers
      FROM users
    `);

    // Retention proxy: users who produced an output in the last N days
    // (no lastLogin column exists — output activity is the real signal).
    const [[act]]: any = await localPool.execute(`
      SELECT
        COUNT(DISTINCT CASE WHEN mo.createdAt >= NOW() - INTERVAL 1 DAY  THEN m.userId END) AS dau,
        COUNT(DISTINCT CASE WHEN mo.createdAt >= NOW() - INTERVAL 7 DAY  THEN m.userId END) AS wau,
        COUNT(DISTINCT CASE WHEN mo.createdAt >= NOW() - INTERVAL 30 DAY THEN m.userId END) AS mau
      FROM mission_outputs mo
      JOIN missions m ON m.id = mo.missionId
    `);

    const [[ent]]: any = await localPool.execute(`
      SELECT
        (SELECT COUNT(*) FROM brands)                                  AS brands,
        (SELECT COUNT(*) FROM brands WHERE positioningStatus='completed') AS brandsPositioned,
        (SELECT COUNT(*) FROM missions)                                AS missions,
        (SELECT COUNT(*) FROM mission_outputs)                         AS outputs,
        (SELECT COUNT(*) FROM mission_outputs WHERE createdAt >= NOW() - INTERVAL 7 DAY) AS outputs7d
    `);

    const totalUsers = n(u.totalUsers);
    const activeUsers = n(u.activeUsers);
    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        unverified: n(u.unverifiedUsers),
        earlyBird: n(u.earlyBirdUsers),
        admin: n(u.adminUsers),
        oauth: n(u.oauthUsers),
        verifyRate: totalUsers ? Math.round((activeUsers / totalUsers) * 100) : 0,
      },
      signups: {
        last24h: n(u.signups24h),
        last7d:  n(u.signups7d),
        last30d: n(u.signups30d),
      },
      activity: {
        dau: n(act.dau),
        wau: n(act.wau),
        mau: n(act.mau),
        // 7d-active out of all users — crude retention/engagement
        engagement7d: totalUsers ? Math.round((n(act.wau) / totalUsers) * 100) : 0,
      },
      entities: {
        brands:          n(ent.brands),
        brandsPositioned: n(ent.brandsPositioned),
        missions:        n(ent.missions),
        outputs:         n(ent.outputs),
        outputs7d:       n(ent.outputs7d),
      },
    };
  }),

  /** LLM usage + cost rollup. */
  /** Citable numbers (each with its N) for award entries and sales decks. */
  proofMetrics: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }).optional())
    .query(({ input }) => computeProofMetrics(input?.days ?? 30)),

  usageCost: adminProcedure.query(async () => {
    const { default: localPool } = await import("../../localDb");

    const [[tot]]: any = await localPool.execute(`
      SELECT
        COALESCE(SUM(costUsd), 0)                                      AS totalUsd,
        COALESCE(SUM(CASE WHEN ts >= NOW() - INTERVAL 1 DAY  THEN costUsd END), 0) AS usd24h,
        COALESCE(SUM(CASE WHEN ts >= NOW() - INTERVAL 7 DAY  THEN costUsd END), 0) AS usd7d,
        COALESCE(SUM(CASE WHEN ts >= NOW() - INTERVAL 30 DAY THEN costUsd END), 0) AS usd30d,
        COUNT(*)                                                       AS calls,
        COALESCE(SUM(inputTokens), 0)                                  AS inTok,
        COALESCE(SUM(outputTokens), 0)                                 AS outTok
      FROM usage_log
    `);

    // Top 10 spenders in the last 30 days
    const [topRows]: any = await localPool.execute(`
      SELECT ul.userId, u.email,
             COALESCE(SUM(ul.costUsd), 0) AS usd30d,
             COUNT(*)                     AS calls
        FROM usage_log ul
        LEFT JOIN users u ON u.id = ul.userId
       WHERE ul.ts >= NOW() - INTERVAL 30 DAY
       GROUP BY ul.userId, u.email
       ORDER BY usd30d DESC
       LIMIT 10
    `);

    // Cost by model (last 7d) — where the money goes
    const [modelRows]: any = await localPool.execute(`
      SELECT model,
             COALESCE(SUM(costUsd), 0) AS usd7d,
             COUNT(*)                  AS calls
        FROM usage_log
       WHERE ts >= NOW() - INTERVAL 7 DAY
       GROUP BY model
       ORDER BY usd7d DESC
       LIMIT 12
    `);

    return {
      totals: {
        allTimeUsd: Number(n(tot.totalUsd).toFixed(2)),
        usd24h:     Number(n(tot.usd24h).toFixed(2)),
        usd7d:      Number(n(tot.usd7d).toFixed(2)),
        usd30d:     Number(n(tot.usd30d).toFixed(2)),
        calls:      n(tot.calls),
        inputTokens:  n(tot.inTok),
        outputTokens: n(tot.outTok),
      },
      topSpenders: (topRows as any[]).map((r) => ({
        userId: n(r.userId),
        email: r.email ?? "(unknown)",
        usd30d: Number(n(r.usd30d).toFixed(2)),
        calls: n(r.calls),
      })),
      byModel: (modelRows as any[]).map((r) => ({
        model: r.model ?? "(none)",
        usd7d: Number(n(r.usd7d).toFixed(2)),
        calls: n(r.calls),
      })),
    };
  }),

  /** Operational health: stuck jobs, support load, billing. */
  health: adminProcedure.query(async () => {
    const { default: localPool } = await import("../../localDb");

    const [[pj]]: any = await localPool.execute(`
      SELECT
        SUM(status='running')                                          AS running,
        SUM(status='running' AND startedAt < NOW() - INTERVAL 10 MINUTE) AS stuck,
        SUM(status='failed' AND finishedAt >= NOW() - INTERVAL 1 DAY)   AS failed24h,
        SUM(status='done'   AND finishedAt >= NOW() - INTERVAL 1 DAY)   AS done24h
      FROM positioning_jobs
    `);

    const [[st]]: any = await localPool.execute(`
      SELECT
        SUM(status='open')                                            AS open,
        SUM(status='in_progress')                                     AS inProgress,
        SUM(status='resolved' AND updatedAt >= NOW() - INTERVAL 7 DAY) AS resolved7d,
        SUM(createdAt >= NOW() - INTERVAL 7 DAY)                       AS new7d
      FROM support_tickets
    `);

    let errors24h = 0;
    try {
      const [[er]]: any = await localPool.execute(
        // level filter: error_log also carries info-level analytics rows
        `SELECT COUNT(*) AS c FROM error_log
          WHERE createdAt >= NOW() - INTERVAL 1 DAY AND level IN ('error','warn')`,
      );
      errors24h = n(er.c);
    } catch { /* error_log may lag on older deploys */ }

    // Paid revenue (invoices.amountTwd, status='paid')
    let revenue: any = { paidCount30d: 0, twd30d: 0, twdAllTime: 0 };
    try {
      const [[rv]]: any = await localPool.execute(`
        SELECT
          SUM(status='paid' AND createdAt >= NOW() - INTERVAL 30 DAY)                 AS paidCount30d,
          COALESCE(SUM(CASE WHEN status='paid' AND createdAt >= NOW() - INTERVAL 30 DAY THEN amountTwd END), 0) AS twd30d,
          COALESCE(SUM(CASE WHEN status='paid' THEN amountTwd END), 0)                AS twdAllTime
        FROM invoices
      `);
      revenue = {
        paidCount30d: n(rv.paidCount30d),
        twd30d: n(rv.twd30d),
        twdAllTime: n(rv.twdAllTime),
      };
    } catch { /* invoices table optional */ }

    return {
      positioning: {
        running:   n(pj.running),
        stuck:     n(pj.stuck),
        failed24h: n(pj.failed24h),
        done24h:   n(pj.done24h),
      },
      support: {
        open:       n(st.open),
        inProgress: n(st.inProgress),
        resolved7d: n(st.resolved7d),
        new7d:      n(st.new7d),
      },
      errors24h,
      revenue,
    };
  }),

  /** Most recent signups for the table view. */
  recentUsers: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      // 2026-05-16: mysql2 execute() (prepared stmt) rejects `LIMIT ?`
      // → "Incorrect arguments to mysqld_stmt_execute". zod already
      // bounds this 1..200, so inlining the clamped int is safe.
      const limit = Math.max(1, Math.min(200, Math.floor(input?.limit ?? 50)));
      const [rows]: any = await localPool.execute(
        `SELECT u.id, u.email, u.name, u.isActive, u.role, u.earlyBird,
                u.authMethod, u.createdAt, u.activatedAt,
                (SELECT COUNT(*) FROM brands b WHERE b.userId = u.id)        AS brands,
                (SELECT COUNT(*) FROM missions m WHERE m.userId = u.id)      AS missions,
                (SELECT COALESCE(SUM(ul.costUsd),0) FROM usage_log ul WHERE ul.userId = u.id) AS usdSpent
           FROM users u
          ORDER BY u.id DESC
          LIMIT ${limit}`,
      );
      return (rows as any[]).map((r) => ({
        id: n(r.id),
        email: r.email ?? "(none)",
        name: r.name ?? "",
        isActive: n(r.isActive) === 1,
        role: r.role ?? "user",
        earlyBird: n(r.earlyBird) === 1,
        authMethod: r.authMethod ?? "password",
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        activatedAt: r.activatedAt
          ? (r.activatedAt instanceof Date ? r.activatedAt.toISOString() : String(r.activatedAt))
          : null,
        brands: n(r.brands),
        missions: n(r.missions),
        usdSpent: Number(n(r.usdSpent).toFixed(2)),
      }));
    }),

  /** Single-user drill-down — everything about one user on one screen. */
  userDetail: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const uid = input.userId;
      const [[u]]: any = await localPool.execute(
        `SELECT id, email, name, role, isActive, earlyBird, lockedPriceTwdMonthly,
                authMethod, pointsBalance, credits, registrationIp, lastLoginIp,
                createdAt, activatedAt
           FROM users WHERE id = ? LIMIT 1`, [uid]);
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "user not found" });

      const [brands]: any = await localPool.execute(
        `SELECT id, name, positioningStatus, onboardingStep, createdAt
           FROM brands WHERE userId = ? ORDER BY id DESC LIMIT 50`, [uid]);
      const [[mc]]: any = await localPool.execute(
        `SELECT COUNT(*) AS missions,
                (SELECT COUNT(*) FROM mission_outputs mo JOIN missions m ON m.id=mo.missionId WHERE m.userId=?) AS outputs
           FROM missions WHERE userId = ?`, [uid, uid]);
      const [[usage]]: any = await localPool.execute(
        `SELECT COALESCE(SUM(costUsd),0) AS usdAll,
                COALESCE(SUM(CASE WHEN ts>=NOW()-INTERVAL 7 DAY THEN costUsd END),0) AS usd7d,
                COUNT(*) AS calls
           FROM usage_log WHERE userId = ?`, [uid]);
      const [pts]: any = await localPool.execute(
        `SELECT kind, delta, balanceAfter, reason, createdAt
           FROM point_transactions WHERE userId = ? ORDER BY id DESC LIMIT 20`, [uid]);
      const [tickets]: any = await localPool.execute(
        `SELECT id, status, tag, subject, createdAt
           FROM support_tickets WHERE userId = ? ORDER BY id DESC LIMIT 20`, [uid]);
      const [bugs]: any = await localPool.execute(
        `SELECT id, title, status, triageVerdict, bountyPoints, createdAt
           FROM bug_reports WHERE userId = ? ORDER BY id DESC LIMIT 20`, [uid]);
      let errors: any[] = [];
      try {
        const [er]: any = await localPool.execute(
          `SELECT id, source, message, createdAt FROM error_log
            WHERE userId = ? AND level IN ('error','warn')
            ORDER BY id DESC LIMIT 20`, [uid]);
        errors = er;
      } catch { /* error_log optional */ }

      const iso = (d: any) => d ? (d instanceof Date ? d.toISOString() : String(d)) : null;
      return {
        user: {
          id: n(u.id), email: u.email ?? "", name: u.name ?? "",
          role: u.role ?? "user", isActive: n(u.isActive) === 1,
          earlyBird: n(u.earlyBird) === 1, lockedPriceTwd: u.lockedPriceTwdMonthly ?? null,
          authMethod: u.authMethod ?? "password", pointsBalance: n(u.pointsBalance),
          credits: n(u.credits), registrationIp: u.registrationIp ?? null,
          lastLoginIp: u.lastLoginIp ?? null,
          createdAt: iso(u.createdAt), activatedAt: iso(u.activatedAt),
        },
        stats: {
          missions: n(mc.missions), outputs: n(mc.outputs),
          usdAll: Number(n(usage.usdAll).toFixed(2)),
          usd7d: Number(n(usage.usd7d).toFixed(2)), llmCalls: n(usage.calls),
        },
        brands: (brands as any[]).map((b) => ({
          id: n(b.id), name: b.name ?? "", positioningStatus: b.positioningStatus ?? null,
          onboardingStep: n(b.onboardingStep), createdAt: iso(b.createdAt),
        })),
        pointHistory: (pts as any[]).map((p) => ({
          kind: p.kind, delta: n(p.delta), balanceAfter: n(p.balanceAfter),
          reason: p.reason ?? "", createdAt: iso(p.createdAt),
        })),
        tickets: (tickets as any[]).map((t) => ({
          id: n(t.id), status: t.status, tag: t.tag ?? null,
          subject: t.subject ?? "", createdAt: iso(t.createdAt),
        })),
        bugs: (bugs as any[]).map((b) => ({
          id: n(b.id), title: b.title, status: b.status,
          triageVerdict: b.triageVerdict ?? null, bountyPoints: n(b.bountyPoints),
          createdAt: iso(b.createdAt),
        })),
        recentErrors: (errors as any[]).map((e) => ({
          id: n(e.id), source: e.source, message: String(e.message ?? "").slice(0, 200),
          createdAt: iso(e.createdAt),
        })),
      };
    }),

  /**
   * Per-feature usage + completion rate — answers "which features do
   * users love / hate" without any new instrumentation.
   *
   * Signal source: every task run lands a mission_outputs row whose
   * progress is one of:
   *   done          → finished cleanly  (satisfied)
   *   caption_ready  → caption done but image/continuation never finished
   *                    → stuck/abandoned (implicit dissatisfaction)
   *   failed         → hard error
   * missions.description carries "[task:<taskId>] <tier> 任務"; title is
   * the human task label; workspace is the platform. We group by the
   * extracted taskId so each feature gets one row: how often it's used,
   * and how often it actually completes.
   */
  featureBreakdown: adminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).default(30),
      limit: z.number().int().min(1).max(200).default(60),
    }).optional())
    .query(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const days = Math.max(1, Math.min(90, Math.floor(input?.days ?? 30)));
      const limit = Math.max(1, Math.min(200, Math.floor(input?.limit ?? 60)));

      // Extract taskId from "[task:<id>] ..." in description; fall back
      // to title when the tag is absent (older / non-orchestra rows).
      const taskIdExpr = `
        CASE
          WHEN m.description LIKE '[task:%]%'
          THEN SUBSTRING_INDEX(SUBSTRING_INDEX(m.description, '[task:', -1), ']', 1)
          ELSE COALESCE(NULLIF(m.title, ''), '(未命名)')
        END`;

      const [rows]: any = await localPool.execute(
        `SELECT
            ${taskIdExpr}                                        AS taskId,
            COALESCE(NULLIF(m.title, ''), '(未命名)')             AS label,
            COALESCE(NULLIF(m.workspace, ''), '(none)')          AS workspace,
            COUNT(*)                                             AS uses,
            SUM(mo.progress = 'done')                            AS done,
            SUM(mo.progress = 'caption_ready')                   AS stuck,
            SUM(mo.progress = 'failed')                          AS failed,
            COUNT(DISTINCT m.userId)                             AS users,
            MAX(mo.createdAt)                                    AS lastUsed
           FROM mission_outputs mo
           JOIN missions m ON m.id = mo.missionId
          WHERE mo.createdAt >= NOW() - INTERVAL ${days} DAY
          GROUP BY taskId, label, workspace
          ORDER BY uses DESC
          LIMIT ${limit}`,
      );

      const iso = (d: any) => d ? (d instanceof Date ? d.toISOString() : String(d)) : null;
      return {
        days,
        features: (rows as any[]).map((r) => {
          const uses = n(r.uses);
          const done = n(r.done);
          return {
            taskId: String(r.taskId ?? "").slice(0, 64),
            label: String(r.label ?? "").slice(0, 80),
            workspace: r.workspace ?? "(none)",
            uses,
            done,
            stuck: n(r.stuck),
            failed: n(r.failed),
            users: n(r.users),
            // completion rate = clean finishes / total attempts.
            // low rate + high uses = a feature people want but that
            // frustrates them (highest-priority fix target).
            completionRate: uses ? Math.round((done / uses) * 100) : 0,
            lastUsed: iso(r.lastUsed),
          };
        }),
      };
    }),

  /**
   * Friction map — which pages/sources throw the most client + server
   * errors. error_log pipeline is verified working (2026-05-16), so
   * this is now a reliable "where do users hit walls" view.
   */
  frictionMap: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(30).default(7) }).optional())
    .query(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const days = Math.max(1, Math.min(30, Math.floor(input?.days ?? 7)));
      let rows: any[] = [];
      try {
        // 2026-07-14 (CJ「請解決摩擦地圖 · 錯誤集中點」): error_log doubles
        // as the lightweight analytics sink (mia.nudge.* / activation.* rows
        // are level='info'). Without the level filter the friction map showed
        // 113 analytics events as "errors" while actual errors were zero.
        const [r]: any = await localPool.execute(
          `SELECT COALESCE(NULLIF(route, ''), '(no route)') AS route,
                  COALESCE(NULLIF(source, ''), '(no source)') AS source,
                  COUNT(*)                  AS errors,
                  COUNT(DISTINCT userId)    AS users,
                  MAX(message)              AS sampleMessage,
                  MAX(createdAt)            AS lastSeen
             FROM error_log
            WHERE createdAt >= NOW() - INTERVAL ${days} DAY
              AND level IN ('error', 'warn')
            GROUP BY route, source
            ORDER BY errors DESC
            LIMIT 40`,
        );
        rows = r as any[];
      } catch { /* error_log may lag on older deploys */ }
      const iso = (d: any) => d ? (d instanceof Date ? d.toISOString() : String(d)) : null;
      return {
        days,
        rows: rows.map((r) => ({
          route: String(r.route ?? "").slice(0, 120),
          source: String(r.source ?? "").slice(0, 64),
          errors: n(r.errors),
          users: n(r.users),
          sampleMessage: String(r.sampleMessage ?? "").slice(0, 200),
          lastSeen: iso(r.lastSeen),
        })),
      };
    }),

  /** CSV export of all users + key metrics. Returns a raw CSV string. */
  exportUsersCsv: adminProcedure.query(async () => {
    const { default: localPool } = await import("../../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT u.id, u.email, u.name, u.role, u.isActive, u.earlyBird,
              u.authMethod, u.pointsBalance, u.createdAt, u.activatedAt,
              (SELECT COUNT(*) FROM brands b WHERE b.userId=u.id)   AS brands,
              (SELECT COUNT(*) FROM missions m WHERE m.userId=u.id) AS missions,
              (SELECT COALESCE(SUM(ul.costUsd),0) FROM usage_log ul WHERE ul.userId=u.id) AS usdSpent
         FROM users u ORDER BY u.id DESC`);
    const head = ["id","email","name","role","isActive","earlyBird","authMethod",
      "pointsBalance","brands","missions","usdSpent","createdAt","activatedAt"];
    const lines = [head.join(",")];
    for (const r of rows as any[]) {
      lines.push([
        r.id, r.email, r.name, r.role, n(r.isActive), n(r.earlyBird), r.authMethod,
        n(r.pointsBalance), n(r.brands), n(r.missions), n(r.usdSpent).toFixed(4),
        r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        r.activatedAt ? (r.activatedAt instanceof Date ? r.activatedAt.toISOString() : r.activatedAt) : "",
      ].map(csvCell).join(","));
    }
    return { csv: lines.join("\n"), rows: (rows as any[]).length };
  }),

  /* ───────────────── Bug-report pipeline ───────────────── */

  /** List bug reports for the admin triage queue. */
  listBugReports: adminProcedure
    .input(z.object({
      status: z.enum(["all","reported","triaged","confirmed_bug","not_a_bug",
        "dispatched","fix_proposed","resolved"]).default("all"),
      limit: z.number().int().min(1).max(200).default(80),
    }).optional())
    .query(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const status = input?.status ?? "all";
      const where = status === "all" ? "" : "WHERE status = ?";
      const params: any[] = status === "all" ? [] : [status];
      // mysql2 execute() rejects `LIMIT ?` — inline the clamped int.
      const limit = Math.max(1, Math.min(200, Math.floor(input?.limit ?? 80)));
      const [rows]: any = await localPool.execute(
        `SELECT id, userId, userEmail, title, body, pageUrl, status,
                triageVerdict, triageReason, bountyPoints, dispatchRef,
                adminNotes, createdAt, resolvedAt
           FROM bug_reports ${where}
          ORDER BY id DESC LIMIT ${limit}`, params);
      const iso = (d: any) => d ? (d instanceof Date ? d.toISOString() : String(d)) : null;
      return (rows as any[]).map((b) => ({
        id: n(b.id), userId: n(b.userId), userEmail: b.userEmail ?? "",
        title: b.title, body: String(b.body ?? "").slice(0, 1200),
        pageUrl: b.pageUrl ?? null, status: b.status,
        triageVerdict: b.triageVerdict ?? null,
        triageReason: b.triageReason ?? null,
        bountyPoints: n(b.bountyPoints), dispatchRef: b.dispatchRef ?? null,
        adminNotes: b.adminNotes ?? null,
        createdAt: iso(b.createdAt), resolvedAt: iso(b.resolvedAt),
      }));
    }),

  /**
   * LLM triage — advisory only. Reads the report + that user's recent
   * error_log and asks a cheap model: real bug vs misoperation vs needs
   * human. Writes triageVerdict/Reason, status → 'triaged'. Does NOT
   * grant points or dispatch — a human still confirms.
   */
  triageBug: adminProcedure
    .input(z.object({ bugId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const [[b]]: any = await localPool.execute(
        `SELECT id, userId, title, body, pageUrl FROM bug_reports WHERE id=? LIMIT 1`,
        [input.bugId]);
      if (!b) throw new TRPCError({ code: "NOT_FOUND" });

      let errCtx = "(no recent errors logged for this user)";
      try {
        const [er]: any = await localPool.execute(
          `SELECT source, message, createdAt FROM error_log
            WHERE userId=? AND createdAt>=NOW()-INTERVAL 3 DAY
              AND level IN ('error','warn')
            ORDER BY id DESC LIMIT 8`, [b.userId]);
        if ((er as any[]).length) {
          errCtx = (er as any[]).map((e: any) =>
            `- [${e.source}] ${String(e.message).slice(0, 160)}`).join("\n");
        }
      } catch { /* optional */ }

      const { invokeLLM } = await import("../core/llm/llm");
      const prompt =
        `你是 onBrand Studio 的 bug 分流員。判定使用者回報是「真的系統 bug」、` +
        `「使用者操作問題（不是 bug）」還是「需要人工再看」。\n\n` +
        `回報標題：${b.title}\n回報內容：${String(b.body).slice(0, 1500)}\n` +
        `頁面：${b.pageUrl ?? "(未提供)"}\n\n` +
        `該用戶近 3 天系統錯誤紀錄：\n${errCtx}\n\n` +
        `只回 JSON：{"verdict":"likely_bug|likely_misuse|needs_human","reason":"一句話中文理由"}`;

      let verdict = "needs_human", reason = "(triage 無法判定)", model = "unknown";
      try {
        const r: any = await invokeLLM({
          // 2026-05-16: dropped model:"claude-haiku-4-5" — Azure naming,
          // invalid on direct Anthropic API → 404. Use proven default.
          provider: "anthropic",
          messages: [{ role: "user", content: prompt }],
          maxTokens: 200,
        });
        model = r?.model ?? "claude-haiku-4-5";
        const txt = String(r?.content ?? r?.text ?? "");
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) {
          const j = JSON.parse(m[0]);
          if (["likely_bug","likely_misuse","needs_human"].includes(j.verdict)) verdict = j.verdict;
          if (typeof j.reason === "string") reason = j.reason.slice(0, 400);
        }
      } catch (e) {
        reason = "triage LLM 失敗，請人工判定";
      }

      await localPool.execute(
        `UPDATE bug_reports SET status='triaged', triageVerdict=?, triageReason=?,
                triageModel=? WHERE id=?`,
        [verdict, reason, model, input.bugId]);
      return { ok: true as const, verdict, reason, model };
    }),

  /**
   * Admin confirms verdict. confirm=true → status 'confirmed_bug' AND
   * grant the bounty (idempotent — only if bountyPoints still 0) and
   * tell the user in chat. confirm=false → 'not_a_bug' + polite note.
   */
  confirmBug: adminProcedure
    .input(z.object({ bugId: z.number().int().positive(), isBug: z.boolean() }))
    .mutation(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const [[b]]: any = await localPool.execute(
        `SELECT id, userId, title, status, bountyPoints FROM bug_reports WHERE id=? LIMIT 1`,
        [input.bugId]);
      if (!b) throw new TRPCError({ code: "NOT_FOUND" });

      if (!input.isBug) {
        await localPool.execute(
          `UPDATE bug_reports SET status='not_a_bug' WHERE id=?`, [input.bugId]);
        await pushSystemSupportMessage(n(b.userId),
          `關於你回報的 #${b.id}「${b.title.slice(0,40)}」：我們確認這比較像操作上的` +
          `情況而非系統 bug。可以在客服這裡問，我會教你怎麼做 🙌`);
        return { ok: true as const, granted: 0, status: "not_a_bug" };
      }

      let granted = 0;
      if (n(b.bountyPoints) === 0) {
        try {
          await addPoints(n(b.userId), BUG_BOUNTY_POINTS, "grant",
            `bug bounty #${b.id}`);
          granted = BUG_BOUNTY_POINTS;
        } catch (e) { console.error("[bug] bounty grant failed:", e); }
      }
      await localPool.execute(
        `UPDATE bug_reports SET status='confirmed_bug', bountyPoints=? WHERE id=?`,
        [granted || n(b.bountyPoints), input.bugId]);
      await pushSystemSupportMessage(n(b.userId),
        `你回報的 #${b.id}「${b.title.slice(0,40)}」已確認是系統問題，` +
        `已加贈 ${granted || n(b.bountyPoints)} 點感謝你 🎁。我們進入修復流程，修好會在這通知你。`);
      return { ok: true as const, granted: granted || n(b.bountyPoints), status: "confirmed_bug" };
    }),

  /**
   * Mark a confirmed bug as dispatched to the auto-fix workflow.
   *
   * SAFETY BOUNDARY (deliberate): the server does NOT autonomously edit
   * or deploy production code from a user-supplied bug report — that
   * would be a prompt-injection → RCE path (the report body is
   * untrusted). This only flips status to 'dispatched' and records the
   * intended ref. The actual Claude-Code fix runs in the
   * op-bugfix-agent.yml GitHub workflow on a NEW BRANCH and opens a PR
   * that CJ reviews + merges. AI proposes, human approves, the existing
   * deploy flow ships.
   */
  dispatchBugFix: adminProcedure
    .input(z.object({ bugId: z.number().int().positive(), ref: z.string().max(256).optional() }))
    .mutation(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const [[b]]: any = await localPool.execute(
        `SELECT status FROM bug_reports WHERE id=? LIMIT 1`, [input.bugId]);
      if (!b) throw new TRPCError({ code: "NOT_FOUND" });
      if (b.status !== "confirmed_bug" && b.status !== "triaged") {
        throw new TRPCError({ code: "BAD_REQUEST",
          message: `can only dispatch a confirmed bug (current: ${b.status})` });
      }
      await localPool.execute(
        `UPDATE bug_reports SET status='dispatched', dispatchRef=? WHERE id=?`,
        [input.ref ?? null, input.bugId]);
      return {
        ok: true as const,
        // The admin runs this to kick the human-gated fix workflow.
        howTo: `gh workflow run "Ops — Bugfix agent (Claude Code → PR)" ` +
               `--ref main -f bug_id=${input.bugId}`,
      };
    }),

  /**
   * Final step — fix shipped. Ensures the bounty was granted (in case
   * it was dispatched without an explicit confirm) and notifies the
   * user in chat. status → 'resolved'.
   */
  resolveBug: adminProcedure
    .input(z.object({ bugId: z.number().int().positive(), note: z.string().max(500).optional() }))
    .mutation(async ({ input }) => {
      const { default: localPool } = await import("../../localDb");
      const [[b]]: any = await localPool.execute(
        `SELECT id, userId, title, bountyPoints FROM bug_reports WHERE id=? LIMIT 1`,
        [input.bugId]);
      if (!b) throw new TRPCError({ code: "NOT_FOUND" });

      let granted = n(b.bountyPoints);
      if (granted === 0) {
        try {
          await addPoints(n(b.userId), BUG_BOUNTY_POINTS, "grant", `bug bounty #${b.id}`);
          granted = BUG_BOUNTY_POINTS;
        } catch (e) { console.error("[bug] resolve bounty grant failed:", e); }
      }
      await localPool.execute(
        `UPDATE bug_reports SET status='resolved', bountyPoints=?, resolvedAt=NOW(3),
                adminNotes=COALESCE(?, adminNotes) WHERE id=?`,
        [granted, input.note ?? null, input.bugId]);
      await pushSystemSupportMessage(n(b.userId),
        `好消息 🎉 你回報的 #${b.id}「${b.title.slice(0,40)}」已修復並上線。` +
        (granted ? `已加贈 ${granted} 點作為感謝。` : "") +
        (input.note ? `\n備註：${input.note.slice(0,200)}` : "") +
        `\n再遇到問題隨時跟我說！`);
      return { ok: true as const, granted, status: "resolved" };
    }),
});
