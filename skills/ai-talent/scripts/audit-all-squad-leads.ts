/**
 * audit-all-squad-leads.ts
 *
 * Dumps every active squad with its methodology + the Lead agent's
 * name/primarySkill/title/specialty. Flags mismatches where the Lead's
 * primarySkill doesn't align with the squad's methodology domain.
 *
 * Output format (CSV-friendly, but human-readable):
 *   [MATCH|MAYBE|MISMATCH] | squad_id | squad_slug | methodology | lead_name | lead_primarySkill | lead_title
 *
 * Grouped by workspace/layer, with a summary of mismatch counts per layer.
 *
 * Usage: npx tsx scripts/audit-all-squad-leads.ts
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

interface SquadRow {
  id: number;
  slug: string;
  name: string;
  methodology: string | null;
  workspace: string | null;
  strategy_layer: string | null;
  agents: string | null;
  is_active: number;
}

interface AgentRow {
  id: number;
  name: string;
  primarySkill: string | null;
  title: string | null;
  specialty: string | null;
}

function parseAgents(val: string | null): any[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Classify whether a Lead's primarySkill aligns with the squad's methodology.
 * Heuristic: if either contains the other's key token, or they share a
 * methodology family keyword (brand, content, seo, ads, pr, etc.), call it a match.
 */
function classifyAlignment(
  squadSlug: string,
  methodology: string | null,
  leadPrimarySkill: string | null,
  leadTitle: string | null,
): "MATCH" | "MAYBE" | "MISMATCH" {
  const m = (methodology ?? "").toLowerCase();
  const ps = (leadPrimarySkill ?? "").toLowerCase();
  const ti = (leadTitle ?? "").toLowerCase();
  const slug = squadSlug.toLowerCase();

  if (!ps && !ti) return "MISMATCH";

  // Direct substring match — strong signal
  if (m && (ps.includes(m) || m.includes(ps))) return "MATCH";

  // Methodology-family keyword alignment (both must share the same domain)
  const families: Record<string, string[]> = {
    brand:       ["brand", "positioning", "archetype", "storybrand", "cultural", "equity", "identity"],
    seo:         ["seo", "search-engine", "keyword", "sem"],
    content:     ["content", "copywriting", "storytelling", "narrative", "editorial"],
    social:      ["social", "facebook", "instagram", "linkedin", "youtube", "tiktok"],
    ads:         ["ads", "paid-media", "performance", "media-buying"],
    pr:          ["pr", "public-relations", "publicity", "press"],
    event:       ["event", "activation", "experience"],
    research:    ["research", "analyst", "insight", "analytics", "intelligence"],
    ecommerce:   ["ecommerce", "e-commerce", "retail", "commerce"],
    strategy:    ["strategy", "strategist", "planner", "consultant"],
    product:     ["product", "jtbd", "value-proposition", "pmf"],
    audience:    ["audience", "persona", "segmentation", "psychographic"],
  };

  const leadFamilies = new Set<string>();
  const squadFamilies = new Set<string>();

  for (const [fam, kws] of Object.entries(families)) {
    for (const kw of kws) {
      if (ps.includes(kw) || ti.includes(kw)) leadFamilies.add(fam);
      if (m.includes(kw) || slug.includes(kw)) squadFamilies.add(fam);
    }
  }

  // Intersection?
  for (const f of leadFamilies) {
    if (squadFamilies.has(f)) return "MAYBE";
  }

  return "MISMATCH";
}

async function main() {
  const pool = createPool({
    host:     process.env.DB_HOST ?? "localhost",
    user:     process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "marketing_os",
    waitForConnections: true,
  });

  // Pull all active squads
  const [squadRows] = await pool.query(
    `SELECT id, slug, name, methodology, workspace, strategy_layer, agents, is_active
       FROM squads
      WHERE is_active = 1
      ORDER BY strategy_layer, id`,
  );
  const squads = squadRows as SquadRow[];

  // Collect unique Lead agent IDs across all squads (first agent in each squad.agents array)
  const leadIds = new Set<number>();
  const squadLeadMap = new Map<number, number>(); // squad.id -> leadAgentId
  for (const sq of squads) {
    const agents = parseAgents(sq.agents);
    if (agents.length === 0) continue;
    const lead = agents[0];
    const leadId = typeof lead === "number" ? lead : lead?.id;
    if (typeof leadId === "number") {
      leadIds.add(leadId);
      squadLeadMap.set(sq.id, leadId);
    }
  }

  // Fetch lead agent details in one query
  let agentMap = new Map<number, AgentRow>();
  if (leadIds.size > 0) {
    const ids = Array.from(leadIds).join(",");
    const [agentRows] = await pool.query(
      `SELECT id, name, primarySkill, title, specialty
         FROM agents
        WHERE id IN (${ids})`,
    );
    for (const a of agentRows as AgentRow[]) {
      agentMap.set(a.id, a);
    }
  }

  // Audit + group
  type Row = {
    alignment: "MATCH" | "MAYBE" | "MISMATCH";
    squadId: number;
    slug: string;
    name: string;
    methodology: string;
    layer: string;
    workspace: string;
    leadId: number | null;
    leadName: string;
    leadPrimarySkill: string;
    leadTitle: string;
  };

  const rows: Row[] = [];
  for (const sq of squads) {
    const leadId = squadLeadMap.get(sq.id) ?? null;
    const lead = leadId != null ? agentMap.get(leadId) : null;
    const alignment = classifyAlignment(
      sq.slug,
      sq.methodology,
      lead?.primarySkill ?? null,
      lead?.title ?? null,
    );
    rows.push({
      alignment,
      squadId: sq.id,
      slug: sq.slug,
      name: sq.name,
      methodology: sq.methodology ?? "",
      layer: sq.strategy_layer ?? "",
      workspace: sq.workspace ?? "",
      leadId,
      leadName: lead?.name ?? "(no lead resolved)",
      leadPrimarySkill: lead?.primarySkill ?? "",
      leadTitle: lead?.title ?? "",
    });
  }

  // Summary
  const totalByLayer = new Map<string, { total: number; match: number; maybe: number; mismatch: number }>();
  for (const r of rows) {
    const key = r.layer || "(unclassified)";
    const bucket = totalByLayer.get(key) ?? { total: 0, match: 0, maybe: 0, mismatch: 0 };
    bucket.total++;
    if (r.alignment === "MATCH") bucket.match++;
    else if (r.alignment === "MAYBE") bucket.maybe++;
    else bucket.mismatch++;
    totalByLayer.set(key, bucket);
  }

  console.log("\n============================================================");
  console.log("  SQUAD LEAD–METHODOLOGY ALIGNMENT AUDIT");
  console.log(`  Total active squads: ${rows.length}`);
  console.log("============================================================\n");

  // Per-layer summary
  console.log("── Per-layer summary ──────────────────────────────────────");
  console.log("Layer".padEnd(20) + "Total".padStart(8) + "Match".padStart(8) + "Maybe".padStart(8) + "Mismatch".padStart(10));
  for (const [layer, b] of Array.from(totalByLayer.entries()).sort()) {
    console.log(
      layer.padEnd(20) +
      String(b.total).padStart(8) +
      String(b.match).padStart(8) +
      String(b.maybe).padStart(8) +
      String(b.mismatch).padStart(10),
    );
  }

  // Lead reuse analysis
  const leadReuseCount = new Map<number, number>();
  for (const r of rows) {
    if (r.leadId != null) {
      leadReuseCount.set(r.leadId, (leadReuseCount.get(r.leadId) ?? 0) + 1);
    }
  }
  const overusedLeads = Array.from(leadReuseCount.entries())
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1]);

  console.log("\n── Overused Leads (≥3 squads) ─────────────────────────────");
  for (const [leadId, count] of overusedLeads) {
    const lead = agentMap.get(leadId);
    console.log(
      `  id=${leadId}  ${lead?.name ?? "?"}  [${lead?.primarySkill ?? "?"}] — leads ${count} squads`,
    );
  }

  // Detailed mismatches
  console.log("\n── MISMATCH details (Lead ≠ Methodology domain) ───────────");
  const mismatchRows = rows.filter(r => r.alignment === "MISMATCH");
  console.log(`Total mismatches: ${mismatchRows.length}\n`);
  for (const r of mismatchRows) {
    console.log(
      `[${r.layer}] squad #${r.squadId} ${r.slug}`,
    );
    console.log(
      `  methodology: ${r.methodology}  |  lead: ${r.leadName} [${r.leadPrimarySkill}] / ${r.leadTitle}`,
    );
  }

  // MAYBE details (weaker signal)
  console.log("\n── MAYBE details (family-level match only) ────────────────");
  const maybeRows = rows.filter(r => r.alignment === "MAYBE");
  console.log(`Total maybes: ${maybeRows.length}\n`);
  for (const r of maybeRows.slice(0, 40)) {
    console.log(
      `[${r.layer}] squad #${r.squadId} ${r.slug}  |  methodology: ${r.methodology}  |  lead: ${r.leadName} [${r.leadPrimarySkill}]`,
    );
  }
  if (maybeRows.length > 40) console.log(`  ... (+${maybeRows.length - 40} more)`);

  await pool.end();
}

main().catch((err) => {
  console.error("audit-all-squad-leads failed:", err);
  process.exit(1);
});
