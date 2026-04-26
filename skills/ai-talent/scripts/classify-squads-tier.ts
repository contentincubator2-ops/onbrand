/**
 * classify-squads-tier.ts
 *
 * Purpose
 *   Read all active squads from squads and auto-classify each one into:
 *     - tier:           core | defer | kill
 *     - strategy_layer: L1_brand | L2_product | L3_audience
 *                     | L4_channel | L5_campaign | L6_validation
 *                     | unassigned
 *
 * Output
 *   - Console table summary
 *   - CSV at scripts/squad-classification-draft.csv for manual review
 *   - Does NOT write to DB by default. Pass --apply to persist.
 *
 * Usage
 *   npm run db:classify-squads           # dry-run, writes CSV only
 *   npm run db:classify-squads -- --apply   # writes CSV + UPDATE DB
 *
 * Classification rules (v1 — tune after human review)
 *   L1 Brand       core : workspace includes 'brand-positioning'
 *                         OR missionType contains 'brand-positioning'
 *                         OR methodology matches brand-level frameworks
 *   L2 Product     core : missionType contains 'product' / 'jtbd'
 *                         OR methodology mentions product positioning
 *   L3 Audience    core : missionType / methodology contains
 *                         'segmentation' / 'persona' / 'perceptual' /
 *                         'audience' / 'icp'
 *   L4 Channel     core : workspace in [facebook, instagram, linkedin,
 *                         youtube, pr] — but ONLY top 3 per channel by
 *                         agent_count; others -> defer
 *   L5 Campaign    core : workspace=event OR missionType contains
 *                         'campaign' / 'launch' / 'activation'
 *   L6 Validation  core : (this layer is EMPTY currently —
 *                         all 4 validation squads will be built in Week 2)
 *   KILL           : workspace=instore  (retail, not agency core)
 *                    OR missionType starts with 'hr-' / 'recruit'
 *                    OR primarySkill heavy in HR categories
 *                    OR is-* squads (in-store retail science)
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();

// ESM-safe __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));

type Tier = "core" | "defer" | "kill";
type Layer =
  | "L1_brand"
  | "L2_product"
  | "L3_audience"
  | "L4_channel"
  | "L5_campaign"
  | "L6_validation"
  | "unassigned";

interface SquadRow {
  id: number;
  slug: string;
  name: string;
  missionType: string | null;
  methodology: string | null;
  workspace: string | null; // JSON string
  tags: string | null;
  agent_count: number | null;
}

interface Classification {
  tier: Tier;
  layer: Layer;
  confidence: number; // 0–1
  reason: string;
}

// Channel squads that should stay core — top picks per channel (by known methodology strength)
// If the auto-detection produces too many channel cores, defer the rest.
const MAX_CORE_PER_CHANNEL = 3;

function parseWorkspace(ws: string | null): string[] {
  if (!ws) return [];
  try {
    const parsed = JSON.parse(ws);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Coerce JSON column / null / unknown into a flat searchable string. */
function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function classify(sq: SquadRow): Classification {
  const ws = parseWorkspace(sq.workspace);
  const mt = (sq.missionType ?? "").toLowerCase();
  const meth = stringify(sq.methodology).toLowerCase();
  const slug = sq.slug.toLowerCase();
  const tags = stringify(sq.tags).toLowerCase();
  const name = (sq.name ?? "").toLowerCase();

  // ── KILL rules (apply first) ─────────────────────────────────────────────
  // Retail / instore — not agency strategy core
  if (ws.includes("instore") || slug.startsWith("is-")) {
    return {
      tier: "kill",
      layer: "unassigned",
      confidence: 0.9,
      reason: "instore/retail — not agency strategy core",
    };
  }
  // HR / recruitment
  if (/^(hr-|recruit)/.test(mt) || /\b(hr|chro|recruit)\b/.test(tags)) {
    return {
      tier: "kill",
      layer: "unassigned",
      confidence: 0.95,
      reason: "HR / recruitment — out of marketing scope",
    };
  }
  // E-commerce listing / product listing optimization (execution, not strategy)
  if (
    /\b(shopee|amazon-listing|product-listing|ec-listing)\b/.test(tags) ||
    /\b(listing-optimization|shopee-seo|amazon-seo)\b/.test(meth)
  ) {
    return {
      tier: "kill",
      layer: "unassigned",
      confidence: 0.85,
      reason: "e-commerce listing optimization — execution, not strategy",
    };
  }

  // ── L1 Brand ─────────────────────────────────────────────────────────────
  // Brand-level positioning: archetype, category design, perceptual mapping for brand,
  // but NOT "personal branding" which is channel strategy (LinkedIn/Instagram etc.)
  const isPersonalBrand =
    tags.includes("personal-brand") ||
    name.includes("個人品牌") ||
    name.includes("personal brand");

  if (
    !isPersonalBrand &&
    (
      ws.includes("brand-positioning") ||
      mt.includes("brand-positioning") ||
      slug.includes("brand-positioning") ||
      mt === "sowork-brand-positioning" ||
      meth.includes("brand-archetype") ||
      meth.includes("category-design") ||
      meth.includes("mind-positioning") ||
      meth.includes("perceptual-mapping")
    )
  ) {
    // L2 promotion guard: some "positioning" squads are actually product-level
    const isProductLevel =
      mt.includes("product-positioning") ||
      mt.includes("value-proposition") ||
      mt.includes("benefit-based") ||
      meth.includes("value-proposition") ||
      meth.includes("benefit-based") ||
      meth === "jtbd-positioning";
    if (isProductLevel) {
      return {
        tier: "core",
        layer: "L2_product",
        confidence: 0.85,
        reason: "positioning squad but product-level (value-prop / benefit / JTBD)",
      };
    }
    return {
      tier: "core",
      layer: "L1_brand",
      confidence: 0.95,
      reason: "brand-level positioning methodology",
    };
  }

  // ── L2 Product ───────────────────────────────────────────────────────────
  if (
    mt.includes("product") ||
    mt.includes("jtbd") ||
    mt.includes("value-proposition") ||
    meth.includes("value-proposition") ||
    meth.includes("jtbd") ||
    meth.includes("benefit-based") ||
    tags.includes("value-proposition") ||
    tags.includes("benefit-ladder")
  ) {
    return {
      tier: "core",
      layer: "L2_product",
      confidence: 0.85,
      reason: "product / JTBD / value-prop methodology",
    };
  }

  // ── L3 Audience ──────────────────────────────────────────────────────────
  // Audience segmentation / personas / perceptual maps
  // ⚠️ Do NOT match "persona" in tags alone (many personal-brand squads have
  // tags like "personal-brand" which contains "persona")
  if (
    mt.includes("segmentation") ||
    mt.includes("perceptual") ||
    meth.includes("segmentation") ||
    meth.includes("perceptual") ||
    (tags.includes("icp") && !isPersonalBrand) ||
    tags.includes("audience-segmentation") ||
    tags.includes("consumer-insights") && mt.includes("segmentation")
  ) {
    return {
      tier: "core",
      layer: "L3_audience",
      confidence: 0.85,
      reason: "audience segmentation / perceptual map / ICP",
    };
  }

  // ── L4 Channel — mark as core first, pruned later by MAX_CORE_PER_CHANNEL
  const channels = ["facebook", "instagram", "linkedin", "youtube", "pr"];
  const channelMatch = ws.find((w) => channels.includes(w));
  if (channelMatch) {
    return {
      tier: "core",
      layer: "L4_channel",
      confidence: 0.7,
      reason: `channel strategy: ${channelMatch}`,
    };
  }

  // Email strategy (email squads have workspace=['strategy'] + slug 'em-*')
  if (slug.startsWith("em-") || mt.startsWith("em-")) {
    return {
      tier: "core",
      layer: "L4_channel",
      confidence: 0.7,
      reason: "email channel strategy",
    };
  }

  // Content marketing strategy (cm-* slug)
  if (slug.startsWith("cm-") || mt.startsWith("cm-")) {
    return {
      tier: "core",
      layer: "L4_channel",
      confidence: 0.65,
      reason: "content marketing channel strategy",
    };
  }

  // Short-video strategy (sv-* slug)
  if (slug.startsWith("sv-") || mt.startsWith("sv-")) {
    return {
      tier: "core",
      layer: "L4_channel",
      confidence: 0.7,
      reason: "short-video channel strategy",
    };
  }

  // ── L5 Campaign ──────────────────────────────────────────────────────────
  if (
    ws.includes("event") ||
    mt.includes("campaign") ||
    mt.includes("launch") ||
    mt.includes("activation") ||
    meth.includes("launch")
  ) {
    return {
      tier: "core",
      layer: "L5_campaign",
      confidence: 0.75,
      reason: "event / campaign / launch methodology",
    };
  }

  // ── L6 Validation ───────────────────────────────────────────────────────
  if (
    /\b(audit|monitor|tracker|consistency|sentiment|brand-health|stress-test|funnel-integrity|measurement|analytics|reporting|dashboard|kpi)\b/.test(slug) ||
    /\b(audit|monitor|tracker|sentiment|brand-health|measurement|analytics)\b/.test(meth) ||
    ws.includes("monitoring") ||
    ws.includes("analytics") ||
    ws.includes("measurement")
  ) {
    return {
      tier: "defer",
      layer: "L6_validation",
      confidence: 0.6,
      reason: "audit / measurement / monitoring",
    };
  }

  // ── L4 Channel — broad fallback for any channel-shaped workspace/slug ───
  // Catches website, seo, tiktok, twitter, podcast, blog, ads, etc.
  const broadChannelWs = [
    "website", "seo", "sem", "ads", "google-ads", "tiktok", "twitter", "x",
    "threads", "podcast", "blog", "email", "content", "video", "shorts",
    "newsletter", "messenger", "line", "wechat", "weibo", "xhs", "rednote",
    "pinterest", "snapchat", "reddit", "discord", "twitch", "social",
  ];
  const broadChannelHit =
    ws.some((w) => broadChannelWs.includes(w)) ||
    /^(seo-|sem-|ads-|web-|tk-|tw-|tt-|pod-|blog-|news-|line-|xhs-|red-|pin-|reddit-)/.test(slug) ||
    /\b(seo|sem|tiktok|twitter|podcast|blog|newsletter|landing-page|web)\b/.test(name);
  if (broadChannelHit) {
    return {
      tier: "defer",
      layer: "L4_channel",
      confidence: 0.6,
      reason: `broad channel match (workspace/slug/name)`,
    };
  }

  // ── L5 Campaign — broad fallback ────────────────────────────────────────
  if (
    /\b(promo|promotion|sale|seasonal|holiday|black-friday|双11|双12|新品|year-end)\b/.test(slug + " " + name) ||
    /\b(promo|promotion|seasonal|holiday)\b/.test(meth)
  ) {
    return {
      tier: "defer",
      layer: "L5_campaign",
      confidence: 0.55,
      reason: "broad campaign / promo signal",
    };
  }

  // ── L1 Brand — broad fallback for anything obviously brand-shaped ───────
  if (
    /\b(brand|品牌|positioning|定位|archetype|原型|story|敘事|narrative)\b/.test(slug + " " + name + " " + meth) ||
    ws.includes("brand")
  ) {
    return {
      tier: "defer",
      layer: "L1_brand",
      confidence: 0.5,
      reason: "broad brand signal",
    };
  }

  // ── L3 Audience — broad fallback ────────────────────────────────────────
  if (
    /\b(persona|audience|customer|consumer|受眾|客戶|tribe|community)\b/.test(slug + " " + name + " " + meth)
  ) {
    return {
      tier: "defer",
      layer: "L3_audience",
      confidence: 0.5,
      reason: "broad audience signal",
    };
  }

  // ── L2 Product — broad fallback ─────────────────────────────────────────
  if (
    /\b(product|產品|sku|offer|pricing|定價|feature)\b/.test(slug + " " + name + " " + meth)
  ) {
    return {
      tier: "defer",
      layer: "L2_product",
      confidence: 0.5,
      reason: "broad product signal",
    };
  }

  // ── Final fallback — bucket into L4 if any workspace at all, else L1 ────
  // Prefer L4 because most unmatched squads are channel/execution.
  if (ws.length > 0) {
    return {
      tier: "defer",
      layer: "L4_channel",
      confidence: 0.3,
      reason: `final fallback — workspace=${JSON.stringify(ws)}`,
    };
  }
  return {
    tier: "defer",
    layer: "L1_brand",
    confidence: 0.2,
    reason: "no workspace signal — defaulted to L1 brand",
  };
}

/**
 * Prune L4 Channel cores: keep only top 3 per channel by agent_count.
 * Others get demoted to tier=defer.
 */
function prunePerChannel(
  classified: Array<SquadRow & Classification>,
): Array<SquadRow & Classification> {
  const byChannel = new Map<string, Array<SquadRow & Classification>>();
  for (const row of classified) {
    if (row.layer === "L4_channel" && row.tier === "core") {
      const ws = parseWorkspace(row.workspace);
      const ch = ws.find((w) =>
        ["facebook", "instagram", "linkedin", "youtube", "pr"].includes(w),
      );
      if (!ch) continue;
      if (!byChannel.has(ch)) byChannel.set(ch, []);
      byChannel.get(ch)!.push(row);
    }
  }

  for (const [ch, rows] of byChannel) {
    rows.sort((a, b) => (b.agent_count ?? 0) - (a.agent_count ?? 0));
    const keep = rows.slice(0, MAX_CORE_PER_CHANNEL);
    const drop = rows.slice(MAX_CORE_PER_CHANNEL);
    for (const r of drop) {
      r.tier = "defer";
      r.reason = `L4_channel[${ch}] over quota (>${MAX_CORE_PER_CHANNEL}) — demoted to defer`;
      r.confidence = 0.6;
    }
    console.log(
      `[prune] channel=${ch}: keep ${keep.length} core, demote ${drop.length} to defer`,
    );
  }
  return classified;
}

function escapeCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const applyFlag = process.argv.includes("--apply");

  const pool = createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "localhost",
    port: parseInt(process.env.LOCAL_DB_PORT || "3306"),
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "mos_user",
    password:
      process.env.LOCAL_DB_PASSWORD ||
      process.env.DB_PASSWORD ||
      "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
    charset: "utf8mb4",
  });

  const conn = await pool.getConnection();
  try {
    const [rows] = (await conn.execute(`
      SELECT id, slug, name, missionType, methodology,
             workspace, tags,
             JSON_LENGTH(agents) AS agent_count
      FROM squads
      WHERE is_active = 1
      ORDER BY id ASC
    `)) as any[];

    const squads = rows as SquadRow[];
    console.log(`\n[classify] loaded ${squads.length} active squads`);

    // Step 1 — initial classification
    const classified = squads.map((sq) => {
      const c = classify(sq);
      return { ...sq, ...c };
    });

    // Step 2 — prune per-channel core quota
    const final = prunePerChannel(classified);

    // Step 3 — summary
    const summary = {
      core: 0,
      defer: 0,
      kill: 0,
      byLayer: {
        L1_brand: 0,
        L2_product: 0,
        L3_audience: 0,
        L4_channel: 0,
        L5_campaign: 0,
        L6_validation: 0,
        unassigned: 0,
      } as Record<Layer, number>,
    };
    for (const r of final) {
      summary[r.tier]++;
      summary.byLayer[r.layer]++;
    }

    console.log("\n===== Classification Summary =====");
    console.log(`  core:  ${summary.core}`);
    console.log(`  defer: ${summary.defer}`);
    console.log(`  kill:  ${summary.kill}`);
    console.log("  ── by layer (all tiers) ──");
    for (const [k, v] of Object.entries(summary.byLayer)) {
      console.log(`  ${k.padEnd(14)} ${v}`);
    }

    // Step 4 — write CSV
    const csvPath = join(__dirname, "squad-classification-draft.csv");
    const header = [
      "squad_id",
      "slug",
      "name",
      "workspace",
      "missionType",
      "methodology",
      "agent_count",
      "suggested_tier",
      "suggested_layer",
      "confidence",
      "reason",
    ].join(",");
    const lines = [header];
    for (const r of final) {
      lines.push(
        [
          r.id,
          r.slug,
          r.name,
          r.workspace,
          r.missionType,
          r.methodology,
          r.agent_count ?? 0,
          r.tier,
          r.layer,
          r.confidence.toFixed(2),
          r.reason,
        ]
          .map(escapeCsv)
          .join(","),
      );
    }
    writeFileSync(csvPath, lines.join("\n"), "utf-8");
    console.log(`\n[classify] CSV written to: ${csvPath}`);
    console.log(`[classify] ${squads.length} rows`);

    // Step 5 — apply to DB if --apply
    if (applyFlag) {
      console.log("\n[classify] --apply flag set. Writing to DB...");
      let updated = 0;
      for (const r of final) {
        await conn.execute(
          `UPDATE squads SET tier = ?, strategy_layer = ? WHERE id = ?`,
          [r.tier, r.layer, r.id],
        );
        updated++;
      }
      console.log(`[classify] DB updated: ${updated} rows`);
    } else {
      console.log(
        "\n[classify] dry-run complete. Review the CSV, then re-run with --apply to persist.",
      );
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[classify] FAILED:", err);
  process.exit(1);
});
