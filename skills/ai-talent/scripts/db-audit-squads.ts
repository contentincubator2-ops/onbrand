/**
 * DB Audit — squads & agents inventory
 * Run ON the VM: npx tsx scripts/db-audit-squads.ts
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host:     process.env.DB_HOST     ?? "127.0.0.1",
  port:     Number(process.env.DB_PORT ?? 3306),
  user:     process.env.DB_USER     ?? "mos_user",
  password: process.env.DB_PASSWORD ?? "mos_secure_2026",
  database: process.env.DB_NAME     ?? "mos_db",
});

function h(title: string) {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

async function q<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await conn.execute(sql, params);
  return rows as T[];
}

/* ── 1. Table overview ──────────────────────────────────── */
h("1. TABLE ROW COUNTS");
const tables = await q(`
  SELECT table_name, table_rows
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
  ORDER BY table_rows DESC`);
console.table(tables);

/* ── 2. Squad totals ────────────────────────────────────── */
h("2. SQUAD TOTALS");
const [squadTotal]  = await q("SELECT COUNT(*) as total FROM squads");
const [squadActive] = await q("SELECT COUNT(*) as active FROM squads WHERE is_active = 1");
console.log(`Total squads : ${squadTotal.total}`);
console.log(`Active squads: ${squadActive.active}`);

/* ── 3. Workspace distribution ──────────────────────────── */
h("3. SQUADS BY WORKSPACE (top 30)");
// workspaces is a JSON array column
const workspaceDist = await q(`
  SELECT
    JSON_UNQUOTE(jt.ws) AS workspace,
    COUNT(*)            AS squad_count
  FROM squads
  JOIN JSON_TABLE(
    COALESCE(workspaces, '[]'),
    '$[*]' COLUMNS (ws VARCHAR(100) PATH '$')
  ) AS jt
  GROUP BY workspace
  ORDER BY squad_count DESC
  LIMIT 30`).catch(() =>
  // fallback if JSON_TABLE not available (MySQL < 8.0)
  q(`SELECT workspaces AS workspace, COUNT(*) AS squad_count
     FROM squads GROUP BY workspaces ORDER BY squad_count DESC LIMIT 30`)
);
console.table(workspaceDist);

/* ── 4. outputFormats distribution ─────────────────────── */
h("4. SQUADS BY outputFormats (top 30)");
const fmtDist = await q(`
  SELECT
    JSON_UNQUOTE(jt.fmt) AS output_format,
    COUNT(*)             AS squad_count
  FROM squads
  JOIN JSON_TABLE(
    COALESCE(outputFormats, '[]'),
    '$[*]' COLUMNS (fmt VARCHAR(100) PATH '$')
  ) AS jt
  GROUP BY output_format
  ORDER BY squad_count DESC
  LIMIT 30`).catch(() =>
  q(`SELECT outputFormats, COUNT(*) cnt FROM squads GROUP BY outputFormats ORDER BY cnt DESC LIMIT 30`)
);
console.table(fmtDist);

/* ── 5. Squads with / without steps ────────────────────── */
h("5. STEP COVERAGE");
const [withSteps]    = await q("SELECT COUNT(DISTINCT squad_id) as with_steps FROM squad_steps");
const [withoutSteps] = await q(`
  SELECT COUNT(*) as without_steps FROM squads
  WHERE id NOT IN (SELECT DISTINCT squad_id FROM squad_steps)`);
console.log(`Squads WITH steps   : ${withSteps.with_steps}`);
console.log(`Squads WITHOUT steps: ${withoutSteps.without_steps}`);

/* ── 6. Agent totals ────────────────────────────────────── */
h("6. AGENT TOTALS");
const [agentTotal]     = await q("SELECT COUNT(*) as total FROM agents");
const [agentAvailable] = await q("SELECT COUNT(*) as available FROM agents WHERE is_available = 1").catch(() =>
  q("SELECT COUNT(*) as available FROM agents WHERE status = 'active'")
);
console.log(`Total agents    : ${agentTotal.total}`);
console.log(`Available agents: ${agentAvailable.available}`);

/* ── 7. Agents by specialty ─────────────────────────────── */
h("7. AGENTS BY specialty (top 20)");
const agentSpec = await q(`
  SELECT specialty, COUNT(*) as count
  FROM agents
  GROUP BY specialty
  ORDER BY count DESC
  LIMIT 20`).catch(() =>
  q(`SELECT primarySkill as specialty, COUNT(*) as count FROM agents GROUP BY primarySkill ORDER BY count DESC LIMIT 20`)
);
console.table(agentSpec);

/* ── 8. Platform-specific squad samples ─────────────────── */
const platforms = [
  { label: "EMAIL / EDM",        keywords: ["email", "edm", "newsletter", "電子報"] },
  { label: "GOOGLE ADS",         keywords: ["google", "paid-ads", "pmax", "sem"] },
  { label: "TWITTER / X",        keywords: ["twitter", "x ", "tweet"] },
  { label: "LINE",               keywords: ["line", "broadcast", "richmenu"] },
  { label: "WEBSITE / LANDING",  keywords: ["website", "landing", "seo", "blog"] },
  { label: "PRESS / PR",         keywords: ["press", "pr", "公關", "新聞稿"] },
  { label: "DECK / 簡報",         keywords: ["deck", "slide", "簡報", "presentation"] },
  { label: "INSTAGRAM",          keywords: ["instagram", "ig", "reel", "story"] },
  { label: "FACEBOOK",           keywords: ["facebook", "fb"] },
  { label: "LINKEDIN",           keywords: ["linkedin", "li"] },
  { label: "YOUTUBE",            keywords: ["youtube", "yt"] },
  { label: "TIKTOK",             keywords: ["tiktok", "tt", "short"] },
];

h("8. SQUAD SAMPLES BY PLATFORM KEYWORD");
for (const p of platforms) {
  const likeClause = p.keywords.map(() => "LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR JSON_SEARCH(LOWER(CAST(workspaces AS CHAR)), 'one', ?) IS NOT NULL").join(" OR ");
  const params: string[] = [];
  for (const kw of p.keywords) {
    params.push(`%${kw}%`, `%${kw}%`, kw);
  }
  const rows = await q<{ id: string; name: string; workspaces: string }>(
    `SELECT id, name, workspaces FROM squads WHERE ${likeClause} LIMIT 5`,
    params
  ).catch(() => []);

  console.log(`\n── ${p.label} (${rows.length} samples) ──`);
  rows.forEach(r => console.log(`  [${r.id}] ${r.name}  ws=${r.workspaces}`));
}

/* ── 9. Steps outputKind distribution ───────────────────── */
h("9. STEP outputKind DISTRIBUTION");
const stepKinds = await q(`
  SELECT outputKind, COUNT(*) as count
  FROM squad_steps
  GROUP BY outputKind
  ORDER BY count DESC`).catch(() => []);
console.table(stepKinds);

/* ── 10. Recent squads ───────────────────────────────────── */
h("10. 10 MOST RECENTLY CREATED SQUADS");
const recent = await q(`
  SELECT id, name, workspaces, is_active, created_at
  FROM squads
  ORDER BY created_at DESC
  LIMIT 10`);
console.table(recent);

await conn.end();
console.log("\n✅  Audit complete.");
