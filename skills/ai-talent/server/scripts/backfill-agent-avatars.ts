/**
 * backfill-agent-avatars — write DiceBear notionists URLs into DB for every
 * agent that does NOT yet have a proper /static/covers/agent-<slug>.png avatar.
 *
 * Why: many rendering paths (AppShell, SquadEntityCard, direct <img src>) use
 * agents.avatarUrl directly. NULL = blank image. Setting the DiceBear URL in
 * the DB makes every path work without code changes.
 *
 * Logic mirrors AgentAvatar.tsx so colours are consistent with the component.
 *
 * Safe to re-run — only touches agents missing a proper cover.
 *
 * Run on VM:
 *   cd /opt/marketing-os/app/skills/ai-talent
 *   npx tsx server/scripts/backfill-agent-avatars.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

// ── Colour logic (was a mirror of AgentAvatar.tsx bgFromHint; that component was removed 2026-09-07, this is now the only copy) ──────────────────────

const PLATFORM_BG: Record<string, string> = {
  facebook:  "4267B2",
  instagram: "C13584",
  linkedin:  "0077B5",
  youtube:   "CC0000",
  strategy:  "6548C6",
  research:  "0891B2",
  writer:    "059669",
  visual:    "E11D48",
  analytics: "D97706",
  pr:        "7C3AED",
  calendar:  "0369A1",
  ads:       "B45309",
};
const PALETTE = Object.values(PLATFORM_BG);

function hashSeed(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) + input.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return Math.abs(h);
}

function bgFromHint(hint: string): string {
  const h = hint.toLowerCase();
  if (h.includes("facebook") || h.includes("粉絲") || /\bfb\b/.test(h)) return PLATFORM_BG.facebook!;
  if (h.includes("instagram") || /\big\b/.test(h)) return PLATFORM_BG.instagram!;
  if (h.includes("linkedin") || /\bli\b/.test(h)) return PLATFORM_BG.linkedin!;
  if (h.includes("youtube") || /\byt\b/.test(h)) return PLATFORM_BG.youtube!;
  if (h.includes("策略") || h.includes("strateg") || h.includes("brand")) return PLATFORM_BG.strategy!;
  if (h.includes("研究") || h.includes("research") || h.includes("insight")) return PLATFORM_BG.research!;
  if (h.includes("文案") || h.includes("writ") || h.includes("copy") || h.includes("content")) return PLATFORM_BG.writer!;
  if (h.includes("視覺") || h.includes("visual") || h.includes("design") || h.includes("art")) return PLATFORM_BG.visual!;
  if (h.includes("分析") || h.includes("analyt") || h.includes("data") || h.includes("kpi")) return PLATFORM_BG.analytics!;
  if (h.includes("pr") || h.includes("公關") || h.includes("media") || h.includes("relation")) return PLATFORM_BG.pr!;
  if (h.includes("行事曆") || h.includes("calendar") || h.includes("pillar")) return PLATFORM_BG.calendar!;
  if (h.includes("廣告") || h.includes("ads") || /\bad\b/.test(h)) return PLATFORM_BG.ads!;
  return PALETTE[hashSeed(hint) % PALETTE.length]!;
}

function dicebearUrl(slug: string, hint: string): string {
  const bg = bgFromHint(hint);
  return `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(slug)}&backgroundColor=${bg}&backgroundType=solid`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "mos_db",
    waitForConnections: true,
  });

  // ── 1. Audit current state ────────────────────────────────────────────────
  const [audit]: any = await pool.execute(`
    SELECT
      CASE
        WHEN avatarUrl IS NULL                              THEN 'NULL → will set DiceBear'
        WHEN avatarUrl LIKE '/static/covers/agent-%'       THEN 'notion-cover (keep)'
        WHEN avatarUrl LIKE '%dicebear%notionists%'        THEN 'dicebear-notionists (already ok)'
        WHEN avatarUrl LIKE '%dicebear%'                   THEN 'dicebear-other → will update'
        ELSE                                                    'old/other → will set DiceBear'
      END AS avatar_type,
      COUNT(*) AS cnt
    FROM agents
    WHERE isAvailable = 1
    GROUP BY 1
    ORDER BY cnt DESC
  `);

  console.log("\n── Avatar breakdown BEFORE (isAvailable=1) ──");
  for (const row of audit as any[]) {
    console.log(`  ${String(row.avatar_type).padEnd(42)} ${row.cnt}`);
  }

  // ── 2. Load all agents that need a fix ───────────────────────────────────
  const [rows]: any = await pool.execute(`
    SELECT id, slug, name, specialty, primarySkill, layer, avatarUrl
    FROM agents
    WHERE isAvailable = 1
      AND (
        avatarUrl IS NULL
        OR (avatarUrl NOT LIKE '/static/covers/agent-%'
            AND avatarUrl NOT LIKE '%dicebear%notionists%')
      )
    ORDER BY id ASC
  `);

  const agents = rows as Array<{
    id: number; slug: string; name: string;
    specialty: string | null; primarySkill: string | null;
    layer: string | null; avatarUrl: string | null;
  }>;

  console.log(`\n→ ${agents.length} agent(s) need a DiceBear notionists URL\n`);

  if (agents.length === 0) {
    console.log("✓ All agents already have correct avatarUrl. Nothing to do.\n");
    await pool.end(); return;
  }

  // ── 3. Compute all URLs client-side (instant), then batch UPDATE ────────
  // Build batches of CASE WHEN to do hundreds of rows per single SQL query.
  const BATCH = 500;
  let updated = 0;

  for (let i = 0; i < agents.length; i += BATCH) {
    const chunk = agents.slice(i, i + BATCH);
    // Build: UPDATE agents SET avatarUrl = CASE id WHEN ? THEN ? … END WHERE id IN (?)
    const caseWhen = chunk.map(() => "WHEN ? THEN ?").join(" ");
    const ids = chunk.map((a) => a.id);
    const params: (string | number)[] = [];
    for (const a of chunk) {
      const hint = [a.specialty, a.primarySkill, a.name, a.layer].filter(Boolean).join(" ");
      params.push(a.id, dicebearUrl(a.slug || String(a.id), hint));
    }
    const sql = `UPDATE agents SET avatarUrl = CASE id ${caseWhen} END WHERE id IN (${ids.map(() => "?").join(",")})`;
    await pool.execute(sql, [...params, ...ids]);
    updated += chunk.length;
    console.log(`  …${updated}/${agents.length} updated`);
  }

  // ── 4. Final audit ────────────────────────────────────────────────────────
  const [auditAfter]: any = await pool.execute(`
    SELECT
      CASE
        WHEN avatarUrl IS NULL                              THEN 'NULL'
        WHEN avatarUrl LIKE '/static/covers/agent-%'       THEN 'notion-cover'
        WHEN avatarUrl LIKE '%dicebear%notionists%'        THEN 'dicebear-notionists'
        ELSE                                                    'other'
      END AS avatar_type,
      COUNT(*) AS cnt
    FROM agents
    WHERE isAvailable = 1
    GROUP BY 1
    ORDER BY cnt DESC
  `);

  console.log("\n── Avatar breakdown AFTER ──");
  for (const row of auditAfter as any[]) {
    console.log(`  ${String(row.avatar_type).padEnd(30)} ${row.cnt}`);
  }

  console.log(`\n✓ Updated ${updated} agents with DiceBear notionists URL.\n`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
