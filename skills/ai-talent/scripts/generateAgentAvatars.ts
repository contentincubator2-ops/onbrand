/**
 * generateAgentAvatars.ts — batch-generate DiceBear "notionists" PNG avatars
 * for every agent, storing multi-size variants on disk and updating
 * agents.avatarUrl in the database.
 *
 * Style: DiceBear notionists (CJ direction 2026-05-02) — illustrated
 * sketch portrait on a solid background colour keyed by the agent's
 * platform / specialty.
 *
 * Sizes stored per agent (matches resolveAvatarUrl() in avatarUrl.ts):
 *   agent-<slug>.64.png   (64 × 64   — avatar chips, baton strip)
 *   agent-<slug>.128.png  (128 × 128 — card thumbnails)
 *   agent-<slug>.256.png  (256 × 256 — agent profile)
 *   agent-<slug>.512.png  (512 × 512 — large hero portrait)
 *   agent-<slug>.png      (512 × 512 — back-compat alias)
 *
 * avatarUrl stored in DB points to the back-compat base PNG; the
 * resolveAvatarUrl() helper picks the right variant at render time.
 *
 * Source: DiceBear free public API — https://api.dicebear.com/
 * No API key required. Rate-limit: ~100 req/min; we throttle to 2/s.
 *
 * Flags:
 *   --limit N        only first N agents
 *   --reuse          skip agents that already have avatarUrl
 *   --dry-run        print URLs only, no writes
 *   --slug=<slug>    only this one agent
 */

import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const args = process.argv.slice(2);
const arg = (n: string): string | undefined => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  if (a) return a.split("=").slice(1).join("=");
  const i = args.indexOf(`--${n}`);
  if (i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--")) return args[i + 1];
  return undefined;
};
const LIMIT  = arg("limit") ? parseInt(arg("limit")!, 10) : 0;
const REUSE  = args.includes("--reuse");
const DRY    = args.includes("--dry-run");
const SLUG   = arg("slug");

const COVERS_DIR        = process.env.COVERS_DIR        ?? "/opt/marketing-os/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";

mkdirSync(COVERS_DIR, { recursive: true });

// ── Background colour by platform / specialty ────────────────────────────
const SPECIALTY_BG: Record<string, string> = {
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
const COLOR_PALETTE = Object.values(SPECIALTY_BG);

function bgColor(agent: { slug: string; title: string | null; specialty: string | null }): string {
  const hint = [agent.slug, agent.title ?? "", agent.specialty ?? ""].join(" ").toLowerCase();
  if (hint.includes("facebook") || / fb[ _]/.test(hint)) return SPECIALTY_BG.facebook!;
  if (hint.includes("instagram") || / ig[ _]/.test(hint)) return SPECIALTY_BG.instagram!;
  if (hint.includes("linkedin")  || / li[ _]/.test(hint)) return SPECIALTY_BG.linkedin!;
  if (hint.includes("youtube")   || / yt[ _]/.test(hint)) return SPECIALTY_BG.youtube!;
  if (hint.includes("strateg") || hint.includes("策略") || hint.includes("brand")) return SPECIALTY_BG.strategy!;
  if (hint.includes("research") || hint.includes("研究") || hint.includes("insight")) return SPECIALTY_BG.research!;
  if (hint.includes("writ") || hint.includes("copy") || hint.includes("文案") || hint.includes("content")) return SPECIALTY_BG.writer!;
  if (hint.includes("visual") || hint.includes("視覺") || hint.includes("design") || hint.includes("art")) return SPECIALTY_BG.visual!;
  if (hint.includes("analyt") || hint.includes("分析") || hint.includes("data") || hint.includes("kpi")) return SPECIALTY_BG.analytics!;
  if (hint.includes("pr") || hint.includes("公關") || hint.includes("media")) return SPECIALTY_BG.pr!;
  if (hint.includes("calendar") || hint.includes("行事曆") || hint.includes("pillar")) return SPECIALTY_BG.calendar!;
  if (hint.includes("ads") || hint.includes("廣告")) return SPECIALTY_BG.ads!;
  const h = createHash("sha256").update(agent.slug).digest();
  return COLOR_PALETTE[h[0]! % COLOR_PALETTE.length]!;
}

// ── DiceBear notionists PNG fetcher ──────────────────────────────────────
const DICEBEAR_BASE = "https://api.dicebear.com/7.x/notionists/png";
const SIZES = [64, 128, 256, 512] as const;

/** Fetch a DiceBear notionists PNG at the given pixel size. */
async function fetchNotionistPng(
  seed: string,
  bg: string,
  size: number,
): Promise<Buffer> {
  const url =
    `${DICEBEAR_BASE}` +
    `?seed=${encodeURIComponent(seed)}` +
    `&backgroundColor=${bg}` +
    `&backgroundType=solid` +
    `&size=${size}`;

  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const resp = await fetch(url);
    if (resp.status === 429) {
      const wait = 5000 * (attempt + 1);
      process.stdout.write(`(rate-limited, retry in ${wait / 1000}s) `);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!resp.ok) throw new Error(`DiceBear ${resp.status} for ${url}`);
    return Buffer.from(await resp.arrayBuffer());
  }
  throw new Error(`DiceBear rate-limited after ${MAX_RETRIES} retries`);
}

/** Throttle: pause between agents so we stay under ~2 req/s per size. */
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const pool = getPool();
  console.log("===== generateAgentAvatars (DiceBear notionists) =====");
  console.log(`covers dir:  ${COVERS_DIR}`);
  console.log(`covers url:  ${COVERS_URL_PREFIX}`);
  console.log(`limit:       ${LIMIT || "none"}`);
  console.log(`reuse:       ${REUSE}`);
  console.log(`dry-run:     ${DRY}\n`);

  let where = "isAvailable = 1";
  if (REUSE) where += " AND (avatarUrl IS NULL OR avatarUrl = '')";
  if (SLUG)  where += ` AND slug = '${SLUG.replace(/'/g, "''")}'`;
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : "";

  const [rows]: any = await pool.execute(
    `SELECT id, slug, name, title, specialty FROM agents
      WHERE ${where}
      ORDER BY id ASC
      ${limitSql}`
  );

  console.log(`Agents to generate: ${rows.length}\n`);
  if (rows.length === 0) { await closePool(); return; }

  let ok = 0, fail = 0;

  for (const r of rows as any[]) {
    const slug    = String(r.slug ?? `a${r.id}`);
    const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
    const bg      = bgColor({ slug, title: r.title, specialty: r.specialty });

    process.stdout.write(`[${r.id}] ${slug} (bg=#${bg}) ... `);

    if (DRY) {
      console.log("[dry-run]");
      for (const sz of SIZES) {
        const url = `${DICEBEAR_BASE}?seed=${encodeURIComponent(slug)}&backgroundColor=${bg}&backgroundType=solid&size=${sz}`;
        console.log(`   ${sz}px → ${url}`);
      }
      ok++;
      continue;
    }

    try {
      // Fetch all sizes
      for (const sz of SIZES) {
        const buf      = await fetchNotionistPng(slug, bg, sz);
        const filePath = join(COVERS_DIR, `agent-${safeSlug}.${sz}.png`);
        writeFileSync(filePath, buf);
        process.stdout.write(`${sz}✓ `);
        await sleep(300); // ~3 req/s per size, 4 sizes = ~0.8 agents/s
      }

      // Back-compat base file = copy of 512px variant
      const base512 = join(COVERS_DIR, `agent-${safeSlug}.512.png`);
      const baseFile = join(COVERS_DIR, `agent-${safeSlug}.png`);
      copyFileSync(base512, baseFile);

      const avatarUrl = `${COVERS_URL_PREFIX}/agent-${safeSlug}.png`;
      await pool.execute("UPDATE agents SET avatarUrl = ? WHERE id = ?", [avatarUrl, r.id]);
      console.log(`→ saved`);
      ok++;
    } catch (e: any) {
      console.log(`FAIL: ${String(e.message ?? e).slice(0, 200)}`);
      fail++;
    }
  }

  console.log(`\n=== Done === ok=${ok} fail=${fail}`);
  const [check]: any = await pool.execute(
    "SELECT COUNT(*) AS n FROM agents WHERE avatarUrl IS NOT NULL AND avatarUrl != ''"
  );
  console.log(`Agents with avatar in DB: ${check[0].n}`);
  await closePool();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
