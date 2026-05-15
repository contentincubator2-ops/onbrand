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
import { router, adminProcedure } from "../_core/trpc";

const n = (v: any) => Number(v ?? 0);

export const adminStatsRouter = router({
  /** Growth funnel + entity counts. */
  overview: adminProcedure.query(async () => {
    const { default: localPool } = await import("../localDb");

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
  usageCost: adminProcedure.query(async () => {
    const { default: localPool } = await import("../localDb");

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
    const { default: localPool } = await import("../localDb");

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
        `SELECT COUNT(*) AS c FROM error_log WHERE createdAt >= NOW() - INTERVAL 1 DAY`,
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
      const { default: localPool } = await import("../localDb");
      const limit = input?.limit ?? 50;
      const [rows]: any = await localPool.execute(
        `SELECT u.id, u.email, u.name, u.isActive, u.role, u.earlyBird,
                u.authMethod, u.createdAt, u.activatedAt,
                (SELECT COUNT(*) FROM brands b WHERE b.userId = u.id)        AS brands,
                (SELECT COUNT(*) FROM missions m WHERE m.userId = u.id)      AS missions,
                (SELECT COALESCE(SUM(ul.costUsd),0) FROM usage_log ul WHERE ul.userId = u.id) AS usdSpent
           FROM users u
          ORDER BY u.id DESC
          LIMIT ?`,
        [limit],
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
});
