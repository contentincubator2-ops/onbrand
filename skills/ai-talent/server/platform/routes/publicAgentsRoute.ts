/**
 * Public Agents Route
 *
 * GET /api/public/agents   → JSON (for Manus / external integrations)
 * GET /agents              → HTML showcase page (human-readable)
 *
 * Optional auth: set PUBLIC_API_KEY in .env to require Bearer token.
 * If unset, the endpoints are open (agent profiles are non-sensitive).
 */

import { Router } from "express";
import { getDb } from "../../db";
import { sql } from "drizzle-orm";

export const publicAgentsRoute = Router();

// ── Auth middleware (optional) ───────────────────────────────────────────────
function optionalApiKey(req: any, res: any, next: any) {
  const required = process.env.PUBLIC_API_KEY;
  if (!required) return next();
  const auth = req.headers.authorization ?? "";
  if (auth === `Bearer ${required}`) return next();
  res.status(401).json({ error: "Unauthorized — provide a valid Bearer token" });
}

// ── JSON endpoint ────────────────────────────────────────────────────────────
publicAgentsRoute.get("/api/public/agents", optionalApiKey, async (_req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(sql`
      SELECT
        id, slug, name, englishName, title, layer,
        avatarUrl, coverUrl, bio, specialty, methodology,
        experienceDetail, industries,
        skills, knowledgeSources, caseStudies,
        pricePerTask, priceMonthly,
        rating, reviewCount, taskCount, hireCount,
        isAvailable, isFeatured, sortOrder,
        createdAt
      FROM agents
      WHERE isAvailable = 1 AND reviewStatus = 'approved'
      ORDER BY sortOrder ASC, id ASC
    `) as any;

    const agents = (rows as any[]).map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      englishName: a.englishName ?? null,
      title: a.title,
      layer: a.layer,
      avatarUrl: a.avatarUrl ?? null,
      coverUrl: a.coverUrl ?? null,
      bio: a.bio ?? null,
      specialty: a.specialty ?? null,
      methodology: a.methodology ?? null,
      experienceDetail: a.experienceDetail ?? null,
      industries: a.industries ?? null,
      skills: tryParseJson(a.skills, []),
      knowledgeSources: tryParseJson(a.knowledgeSources, []),
      caseStudies: tryParseJson(a.caseStudies, []),
      pricePerTask: a.pricePerTask != null ? Number(a.pricePerTask) : null,
      priceMonthly: a.priceMonthly != null ? Number(a.priceMonthly) : null,
      rating: a.rating != null ? Number(a.rating) : null,
      reviewCount: a.reviewCount ?? 0,
      taskCount: a.taskCount ?? 0,
      hireCount: a.hireCount ?? 0,
      isAvailable: !!a.isAvailable,
      isFeatured: !!a.isFeatured,
    }));

    res.json({ agents, total: agents.length });
  } catch (err: any) {
    console.error("[publicAgents] error:", err?.message);
    res.status(500).json({ error: "Failed to load agents" });
  }
});

// ── HTML showcase page ────────────────────────────────────────────────────────
publicAgentsRoute.get("/agents", async (_req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(sql`
      SELECT
        id, slug, name, englishName, title, layer,
        avatarUrl, bio, specialty, methodology,
        experienceDetail, industries, skills,
        rating, hireCount, taskCount, isAvailable, isFeatured, sortOrder
      FROM agents
      WHERE isAvailable = 1 AND reviewStatus = 'approved'
      ORDER BY sortOrder ASC, id ASC
    `) as any;

    const agents = (rows as any[]).map((a) => ({
      ...a,
      skills: tryParseJson(a.skills, []) as string[],
    }));

    const layerLabel: Record<string, string> = {
      strategy: "策略層",
      execution: "執行層",
      training: "培訓層",
    };
    const layerColor: Record<string, string> = {
      strategy: "#7C3AED",
      execution: "#0284C7",
      training: "#059669",
    };

    const cards = agents.map((a) => {
      const color = layerColor[a.layer] ?? "#475569";
      const label = layerLabel[a.layer] ?? a.layer;
      const skillChips = (a.skills as string[])
        .slice(0, 5)
        .map((s: string) => `<span class="chip">${esc(s)}</span>`)
        .join("");
      const avatar = a.avatarUrl
        ? `<img src="${esc(a.avatarUrl)}" alt="${esc(a.name)}" class="avatar" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : "";
      const initials = (a.name ?? "?").slice(0, 1);

      return `
<div class="card" data-layer="${esc(a.layer)}">
  <div class="card-top">
    <div class="avatar-wrap">
      ${avatar}
      <div class="avatar-fallback" style="display:${a.avatarUrl ? "none" : "flex"}">${esc(initials)}</div>
    </div>
    <div class="card-meta">
      <span class="layer-badge" style="background:${color}20;color:${color};border-color:${color}40">${label}</span>
      ${a.isFeatured ? '<span class="featured-badge">★ 精選</span>' : ""}
    </div>
  </div>
  <h3 class="name">${esc(a.name)}${a.englishName ? `<span class="en-name">${esc(a.englishName)}</span>` : ""}</h3>
  <p class="title">${esc(a.title ?? "")}</p>
  ${a.bio ? `<p class="bio">${esc(truncate(a.bio, 120))}</p>` : ""}
  ${a.specialty ? `
  <div class="section">
    <span class="section-label">專長</span>
    <p class="section-body">${esc(truncate(a.specialty, 100))}</p>
  </div>` : ""}
  ${a.methodology ? `
  <div class="section">
    <span class="section-label">方法論</span>
    <p class="section-body">${esc(truncate(a.methodology, 100))}</p>
  </div>` : ""}
  ${skillChips ? `<div class="chips">${skillChips}</div>` : ""}
  <div class="stats">
    ${a.rating ? `<span>⭐ ${Number(a.rating).toFixed(1)}</span>` : ""}
    ${a.hireCount ? `<span>🤝 ${a.hireCount} 次合作</span>` : ""}
    ${a.taskCount ? `<span>✅ ${a.taskCount} 任務</span>` : ""}
  </div>
</div>`;
    }).join("\n");

    const layerCounts = agents.reduce((acc, a) => {
      acc[a.layer] = (acc[a.layer] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>OnBrand — AI Agent 團隊</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0A0A0F;
    --surface: #12121A;
    --border: #1E1E2E;
    --text: #E2E2F0;
    --muted: #6E6E8A;
    --accent: #7C3AED;
  }
  body { font-family: "Inter", system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

  /* ── Header ── */
  .header { padding: 48px 40px 32px; max-width: 1200px; margin: 0 auto; }
  .header-top { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
  .logo { font-size: 22px; font-weight: 800; letter-spacing: -0.04em; color: #fff; }
  .logo-sub { font-size: 14px; color: var(--muted); }
  .header h1 { font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; }
  .header h1 em { font-style: normal; background: linear-gradient(135deg, #7C3AED, #60A5FA); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .header p { margin-top: 12px; color: var(--muted); font-size: 16px; line-height: 1.6; max-width: 560px; }

  /* ── Filter bar ── */
  .filters { padding: 0 40px 24px; max-width: 1200px; margin: 0 auto; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .filter-btn { padding: 6px 16px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
  .filter-btn:hover, .filter-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .count-badge { margin-left: 4px; opacity: 0.7; font-size: 11px; }

  /* ── Grid ── */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; padding: 0 40px 60px; max-width: 1200px; margin: 0 auto; }

  /* ── Card ── */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 10px; transition: border-color 0.2s, transform 0.2s; }
  .card:hover { border-color: #7C3AED66; transform: translateY(-2px); }
  .card.hidden { display: none; }
  .card-top { display: flex; align-items: flex-start; justify-content: space-between; }
  .avatar-wrap { position: relative; width: 56px; height: 56px; flex-shrink: 0; }
  .avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border); }
  .avatar-fallback { width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, #7C3AED, #60A5FA); color: #fff; font-size: 22px; font-weight: 700; align-items: center; justify-content: center; }
  .card-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .layer-badge { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; border: 1px solid; letter-spacing: 0.02em; }
  .featured-badge { font-size: 10px; color: #F59E0B; font-weight: 600; }
  .name { font-size: 18px; font-weight: 700; color: #fff; display: flex; align-items: baseline; gap: 8px; }
  .en-name { font-size: 13px; font-weight: 400; color: var(--muted); }
  .title { font-size: 13px; color: #A78BFA; font-weight: 500; }
  .bio { font-size: 13px; color: var(--muted); line-height: 1.65; }
  .section { display: flex; flex-direction: column; gap: 3px; }
  .section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #4B4B6A; }
  .section-body { font-size: 12.5px; color: #9898B8; line-height: 1.6; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
  .chip { font-size: 11px; padding: 2px 8px; border-radius: 5px; background: #1A1A2E; border: 1px solid #2A2A45; color: #8888AA; }
  .stats { display: flex; gap: 12px; font-size: 12px; color: var(--muted); margin-top: auto; padding-top: 8px; border-top: 1px solid var(--border); }

  /* ── Footer ── */
  .footer { text-align: center; padding: 24px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--border); }
  .footer a { color: #7C3AED; text-decoration: none; }

  @media (max-width: 640px) {
    .header, .filters, .grid { padding-left: 20px; padding-right: 20px; }
    .grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <span class="logo">OnBrand</span>
    <span class="logo-sub">AI Agent 團隊</span>
  </div>
  <h1>認識你的<em>專屬 AI 行銷團隊</em></h1>
  <p>每一位 Agent 都有明確的職稱、專長背景與方法論，組成完整的品牌行銷作戰體系。</p>
</div>

<div class="filters">
  <button class="filter-btn active" data-layer="all" onclick="filter('all')">全部 <span class="count-badge">${agents.length}</span></button>
  <button class="filter-btn" data-layer="strategy" onclick="filter('strategy')">策略層 <span class="count-badge">${layerCounts.strategy ?? 0}</span></button>
  <button class="filter-btn" data-layer="execution" onclick="filter('execution')">執行層 <span class="count-badge">${layerCounts.execution ?? 0}</span></button>
  <button class="filter-btn" data-layer="training" onclick="filter('training')">培訓層 <span class="count-badge">${layerCounts.training ?? 0}</span></button>
</div>

<div class="grid" id="grid">
${cards}
</div>

<div class="footer">
  由 <a href="https://onbrand.sowork.ai">OnBrand · SoWork</a> 驅動 · JSON API: <code>/api/public/agents</code>
</div>

<script>
function filter(layer) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.layer === layer));
  document.querySelectorAll('.card').forEach(c => {
    if (layer === 'all' || c.dataset.layer === layer) c.classList.remove('hidden');
    else c.classList.add('hidden');
  });
}
</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.send(html);
  } catch (err: any) {
    console.error("[publicAgents/html] error:", err?.message);
    res.status(500).send("<h1>Error loading agents</h1>");
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function tryParseJson(val: any, fallback: any) {
  if (!val) return fallback;
  if (typeof val !== "string") return val ?? fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s ?? "";
  return s.slice(0, max).trimEnd() + "…";
}
