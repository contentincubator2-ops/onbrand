/**
 * Sales Hub — performance read models for HQ.
 *
 * Every number carries a data grade so the dashboard never blends a verified
 * API figure with an estimate:
 *   verified       platform API (LinkedIn member post analytics, Instagram insights)
 *   tracked        our own short-link redirect
 *   self_reported  the rep pasted a post URL / screenshot numbers (Facebook)
 *   estimated      network size × typical rate (no API exists)
 */

import { q, ymd } from "../../../platform/core/hub/hubStore";

const DAYS = 21;

export async function getOverview(orgId: number) {
  const [reps] = await q(
    `SELECT COUNT(*) total,
            SUM(consent_at IS NOT NULL) consented,
            SUM(line_user_id IS NOT NULL) line_bound,
            SUM(linkedin_status = 'connected') linkedin,
            SUM(instagram_status = 'connected') instagram
       FROM hub_reps WHERE org_id = ?`,
    [orgId],
  );
  const [active] = await q(
    `SELECT COUNT(DISTINCT rep_id) n FROM hub_posts WHERE org_id = ? AND created_at >= NOW(3) - INTERVAL 7 DAY`,
    [orgId],
  );
  const [posts] = await q(
    `SELECT COUNT(*) total,
            SUM(status IN ('shared','reported')) shared,
            SUM(verdict = 'clean') clean,
            SUM(verdict = 'auto_fixed') auto_fixed,
            SUM(verdict = 'needs_review') needs_review,
            SUM(is_demo = 0) live
       FROM hub_posts WHERE org_id = ? AND created_at >= NOW(3) - INTERVAL ${DAYS} DAY`,
    [orgId],
  );
  const complianceRows = await q<{ compliance: any }>(
    `SELECT compliance FROM hub_posts WHERE org_id = ? AND created_at >= NOW(3) - INTERVAL ${DAYS} DAY ORDER BY id DESC LIMIT 500`,
    [orgId],
  );
  const caughtByRule: Record<string, number> = {};
  let issuesCaught = 0;
  for (const row of complianceRows) {
    const c = typeof row.compliance === "string" ? JSON.parse(row.compliance) : row.compliance;
    issuesCaught += Number(c?.issuesCaught ?? 0);
    for (const check of c?.checks ?? []) {
      if (check.status !== "pass") caughtByRule[check.rule] = (caughtByRule[check.rule] ?? 0) + 1;
    }
  }
  const [clicks] = await q(
    `SELECT COUNT(*) total, SUM(is_demo = 0) live
       FROM hub_clicks WHERE org_id = ? AND created_at >= NOW(3) - INTERVAL ${DAYS} DAY`,
    [orgId],
  );
  const grades = await q(
    `SELECT grade, SUM(impressions) impressions, SUM(engagements) engagements, SUM(leads) leads
       FROM hub_metrics WHERE org_id = ? AND captured_on >= CURDATE() - INTERVAL ${DAYS} DAY
      GROUP BY grade`,
    [orgId],
  );

  const series = await dailySeries(orgId);
  return {
    windowDays: DAYS,
    reps: {
      total: Number(reps?.total ?? 0),
      consented: Number(reps?.consented ?? 0),
      lineBound: Number(reps?.line_bound ?? 0),
      linkedinConnected: Number(reps?.linkedin ?? 0),
      instagramConnected: Number(reps?.instagram ?? 0),
      activeThisWeek: Number(active?.n ?? 0),
    },
    posts: {
      total: Number(posts?.total ?? 0),
      shared: Number(posts?.shared ?? 0),
      live: Number(posts?.live ?? 0),
    },
    compliance: {
      clean: Number(posts?.clean ?? 0),
      autoFixed: Number(posts?.auto_fixed ?? 0),
      needsReview: Number(posts?.needs_review ?? 0),
      issuesCaught,
      caughtByRule,
    },
    growth: {
      clicks: Number(clicks?.total ?? 0),
      liveClicks: Number(clicks?.live ?? 0),
      byGrade: Object.fromEntries(
        grades.map((g) => [g.grade, { impressions: Number(g.impressions), engagements: Number(g.engagements), leads: Number(g.leads) }]),
      ) as Record<string, { impressions: number; engagements: number; leads: number }>,
    },
    series,
  };
}

async function dailySeries(orgId: number) {
  const posts = await q(
    `SELECT DATE(created_at) d, COUNT(*) n FROM hub_posts
      WHERE org_id = ? AND created_at >= CURDATE() - INTERVAL ${DAYS - 1} DAY GROUP BY DATE(created_at)`,
    [orgId],
  );
  const clicks = await q(
    `SELECT DATE(created_at) d, COUNT(*) n FROM hub_clicks
      WHERE org_id = ? AND created_at >= CURDATE() - INTERVAL ${DAYS - 1} DAY GROUP BY DATE(created_at)`,
    [orgId],
  );
  const impressions = await q(
    `SELECT captured_on d, SUM(impressions) n FROM hub_metrics
      WHERE org_id = ? AND captured_on >= CURDATE() - INTERVAL ${DAYS - 1} DAY GROUP BY captured_on`,
    [orgId],
  );
  const key = (d: any) => ymd(d);
  const toMap = (rows: any[]) => new Map(rows.map((r) => [key(r.d), Number(r.n)]));
  const pm = toMap(posts), cm = toMap(clicks), im = toMap(impressions);
  const out: Array<{ date: string; posts: number; clicks: number; impressions: number }> = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = ymd(new Date(Date.now() - i * 86_400_000));
    out.push({ date, posts: pm.get(date) ?? 0, clicks: cm.get(date) ?? 0, impressions: im.get(date) ?? 0 });
  }
  return out;
}

export async function getLeaderboard(orgId: number) {
  const rows = await q(
    `SELECT r.id, r.name, r.title, r.team, r.market, r.avatar_seed, r.is_demo, r.consent_at,
            r.linkedin_status, r.instagram_status, r.facebook_status, r.line_user_id IS NOT NULL line_bound,
            (SELECT COUNT(*) FROM hub_posts p WHERE p.rep_id = r.id AND p.created_at >= NOW(3) - INTERVAL ${DAYS} DAY) posts,
            (SELECT COUNT(*) FROM hub_posts p WHERE p.rep_id = r.id AND p.verdict IN ('clean','auto_fixed') AND p.created_at >= NOW(3) - INTERVAL ${DAYS} DAY) compliant_posts,
            (SELECT COUNT(*) FROM hub_clicks c WHERE c.rep_id = r.id AND c.created_at >= NOW(3) - INTERVAL ${DAYS} DAY) clicks,
            (SELECT COUNT(*) FROM hub_clicks c WHERE c.rep_id = r.id AND c.is_demo = 0 AND c.created_at >= NOW(3) - INTERVAL ${DAYS} DAY) live_clicks,
            (SELECT COALESCE(SUM(m.impressions),0) FROM hub_metrics m WHERE m.rep_id = r.id AND m.grade = 'verified' AND m.captured_on >= CURDATE() - INTERVAL ${DAYS} DAY) verified_impressions,
            (SELECT COALESCE(SUM(m.impressions),0) FROM hub_metrics m WHERE m.rep_id = r.id AND m.grade IN ('estimated','self_reported') AND m.captured_on >= CURDATE() - INTERVAL ${DAYS} DAY) other_impressions,
            (SELECT COALESCE(SUM(m.engagements),0) FROM hub_metrics m WHERE m.rep_id = r.id AND m.captured_on >= CURDATE() - INTERVAL ${DAYS} DAY) engagements,
            (SELECT COALESCE(SUM(m.leads),0) FROM hub_metrics m WHERE m.rep_id = r.id AND m.captured_on >= CURDATE() - INTERVAL ${DAYS} DAY) leads,
            (SELECT MAX(p.created_at) FROM hub_posts p WHERE p.rep_id = r.id) last_post_at
       FROM hub_reps r WHERE r.org_id = ?
      ORDER BY clicks DESC, posts DESC`,
    [orgId],
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, title: r.title, team: r.team, market: r.market, avatarSeed: r.avatar_seed,
    isDemo: Boolean(r.is_demo), consented: Boolean(r.consent_at), lineBound: Boolean(r.line_bound),
    linkedin: r.linkedin_status, instagram: r.instagram_status, facebook: r.facebook_status,
    posts: Number(r.posts), compliantPosts: Number(r.compliant_posts), clicks: Number(r.clicks),
    liveClicks: Number(r.live_clicks), verifiedImpressions: Number(r.verified_impressions),
    otherImpressions: Number(r.other_impressions), engagements: Number(r.engagements), leads: Number(r.leads),
    lastPostAt: r.last_post_at,
  }));
}

export async function getChannelBreakdown(orgId: number) {
  const rows = await q(
    `SELECT channel, grade, COUNT(DISTINCT post_id) posts, SUM(impressions) impressions, SUM(engagements) engagements, SUM(leads) leads
       FROM hub_metrics WHERE org_id = ? AND captured_on >= CURDATE() - INTERVAL ${DAYS} DAY
      GROUP BY channel, grade ORDER BY channel, grade`,
    [orgId],
  );
  const clicks = await q(
    `SELECT l.channel, COUNT(*) clicks FROM hub_clicks c JOIN hub_links l ON l.code = c.code
      WHERE c.org_id = ? AND c.created_at >= NOW(3) - INTERVAL ${DAYS} DAY GROUP BY l.channel`,
    [orgId],
  );
  return {
    metrics: rows.map((r) => ({
      channel: r.channel, grade: r.grade, posts: Number(r.posts), impressions: Number(r.impressions),
      engagements: Number(r.engagements), leads: Number(r.leads),
    })),
    clicks: clicks.map((c) => ({ channel: c.channel ?? "unknown", clicks: Number(c.clicks) })),
  };
}

export async function getRecentPosts(orgId: number, limit = 30) {
  const rows = await q(
    `SELECT p.id, p.channel, p.market, p.caption, p.first_draft, p.verdict, p.compliance, p.status, p.source,
            p.short_code, p.is_demo, p.created_at, p.latency_ms, r.name rep_name, r.avatar_seed,
            s.name_en solution_en, s.name_zh solution_zh, k.name_en skill_en,
            (SELECT COUNT(*) FROM hub_clicks c WHERE c.code = p.short_code) clicks
       FROM hub_posts p
       JOIN hub_reps r ON r.id = p.rep_id
       LEFT JOIN hub_solutions s ON s.id = p.solution_id
       LEFT JOIN hub_skills k ON k.id = p.skill_id
      WHERE p.org_id = ?
      ORDER BY p.created_at DESC LIMIT ${Math.max(1, Math.min(100, limit))}`,
    [orgId],
  );
  return rows.map((r) => ({
    id: r.id, channel: r.channel, market: r.market, caption: r.caption, firstDraft: r.first_draft,
    verdict: r.verdict, compliance: typeof r.compliance === "string" ? JSON.parse(r.compliance) : r.compliance,
    status: r.status, source: r.source, shortCode: r.short_code, isDemo: Boolean(r.is_demo),
    createdAt: r.created_at, latencyMs: r.latency_ms, repName: r.rep_name, avatarSeed: r.avatar_seed,
    solutionEn: r.solution_en, solutionZh: r.solution_zh, skillEn: r.skill_en, clicks: Number(r.clicks),
  }));
}

export async function getLiveFeed(orgId: number, sinceId = 0) {
  const events = await q(
    `SELECT e.id, e.kind, e.detail, e.is_demo, e.created_at, r.name rep_name, r.avatar_seed
       FROM hub_events e LEFT JOIN hub_reps r ON r.id = e.rep_id
      WHERE e.org_id = ? AND e.id > ?
      ORDER BY e.id DESC LIMIT 40`,
    [orgId, sinceId],
  );
  return events.map((e) => ({
    id: Number(e.id), kind: e.kind, detail: e.detail, isDemo: Boolean(e.is_demo),
    createdAt: e.created_at, repName: e.rep_name, avatarSeed: e.avatar_seed,
  }));
}

export async function getRepStats(repId: number) {
  const [s] = await q(
    `SELECT
       (SELECT COUNT(*) FROM hub_posts WHERE rep_id = ? AND created_at >= NOW(3) - INTERVAL ${DAYS} DAY) posts,
       (SELECT COUNT(*) FROM hub_clicks WHERE rep_id = ? AND created_at >= NOW(3) - INTERVAL ${DAYS} DAY) clicks,
       (SELECT COALESCE(SUM(impressions),0) FROM hub_metrics WHERE rep_id = ? AND grade = 'verified' AND captured_on >= CURDATE() - INTERVAL ${DAYS} DAY) verified_impressions,
       (SELECT COALESCE(SUM(engagements),0) FROM hub_metrics WHERE rep_id = ? AND captured_on >= CURDATE() - INTERVAL ${DAYS} DAY) engagements,
       (SELECT COALESCE(SUM(leads),0) FROM hub_metrics WHERE rep_id = ? AND captured_on >= CURDATE() - INTERVAL ${DAYS} DAY) leads`,
    [repId, repId, repId, repId, repId],
  );
  const [org] = await q(`SELECT org_id FROM hub_reps WHERE id = ?`, [repId]);
  const board = org ? await getLeaderboard(org.org_id) : [];
  const rank = board.findIndex((r) => r.id === repId) + 1;
  return {
    windowDays: DAYS,
    posts: Number(s?.posts ?? 0),
    clicks: Number(s?.clicks ?? 0),
    verifiedImpressions: Number(s?.verified_impressions ?? 0),
    engagements: Number(s?.engagements ?? 0),
    leads: Number(s?.leads ?? 0),
    rank,
    teamSize: board.length,
  };
}
