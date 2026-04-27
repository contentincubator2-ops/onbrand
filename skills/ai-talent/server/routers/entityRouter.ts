/**
 * entityRouter — unified shape for homepage cards.
 *
 * The homepage no longer queries `squad.listByBrand` directly. Instead it
 * calls `entity.listForHome` which merges:
 *   - kind: "squad"  — methodology squads (active = 1)
 *   - kind: "agent"  — featured AI agents
 *   - kind: "skill"  — standalone skills (placeholder; not yet seeded)
 *
 * Each entity returns a shape that maps 1:1 onto HeroUI Card props
 * (badge.color is a HeroUI semantic, not a hex string), so the client can
 * render with stock <Card> + <Chip color={badge.color}> + <Avatar color>
 * without inline styles or custom token tables.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import localPool from "../localDb";
import { getSoworkDb } from "../db";
import { soworkAgents } from "../_schemas/soworkAgents";
import { eq } from "drizzle-orm";

// ── HeroUI semantic palette (single source of truth, mirrors client tokens.ts) ──
type HeroUIColor =
  | "primary" | "secondary" | "success" | "warning" | "danger" | "default";

const LAYER_TO_HERO: Record<string, { label: string; color: HeroUIColor }> = {
  L1: { label: "品牌策略", color: "primary"   },
  L2: { label: "產品策略", color: "danger"    },
  L3: { label: "受眾策略", color: "warning"   },
  L4: { label: "通路策略", color: "secondary" },
  L5: { label: "活動策略", color: "success"   },
  L6: { label: "驗證校準", color: "default"   },
};

function resolveLayerKey(raw?: string | null): keyof typeof LAYER_TO_HERO {
  if (!raw) return "L1";
  const m = String(raw).toUpperCase().match(/L([1-6])/);
  return (m ? (`L${m[1]}` as keyof typeof LAYER_TO_HERO) : "L1");
}

function safeJsonParse<T>(v: any, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  try { return JSON.parse(String(v)) as T; } catch { return fallback; }
}

function pickName(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    return raw["zh-TW"] ?? raw["zh"] ?? raw.en ?? Object.values(raw)[0] ?? "";
  }
  return String(raw);
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  return (trimmed.charAt(0) || "?").toUpperCase();
}

// ── Unified entity shape (matches HeroUI Card slots) ───────────────────────
export interface HomeEntity {
  id: number;
  kind: "squad" | "agent" | "skill";
  slug: string;

  name: string;
  description: string | null;
  initial: string;

  badge: { label: string; color: HeroUIColor };

  meta: {
    methodology: string | null;   // "Pearson · 2003" or null
    summary:     string | null;   // localized description / fallback
  };

  actions: {
    primary:   { label: string };
    secondary: { label: string };
  };

  strategyLayer: keyof typeof LAYER_TO_HERO;
  stepCount:   number;
  memberCount: number;

  /** workspace tag(s), used for secondary filtering / icon mapping. */
  workspace: string[];
}

const KIND_LABELS = {
  squad: { primary: "啟動小組",  secondary: "預覽工作流" },
  agent: { primary: "啟用 Agent", secondary: "查看資料"   },
  skill: { primary: "套用技能",   secondary: "查看說明"   },
} as const;

// ── Squad → HomeEntity ─────────────────────────────────────────────────────
async function fetchSquadEntities(): Promise<HomeEntity[]> {
  const [rows] = await localPool.execute(
    `SELECT id, slug, name, description, agents, steps,
            strategy_layer, methodology, workspace
       FROM squads
      WHERE is_active = 1
      ORDER BY COALESCE(tier, 99) ASC, id ASC
      LIMIT 1000`
  ) as any[];

  return (rows as any[]).map((r) => {
    const layer = resolveLayerKey(r.strategy_layer);
    const layerTone = LAYER_TO_HERO[layer]!;

    const members = safeJsonParse<any[]>(r.agents, []);
    const steps   = safeJsonParse<any[]>(r.steps, []);

    const methodologyRaw = (() => {
      if (!r.methodology) return null;
      if (typeof r.methodology === "object") return r.methodology;
      try { return JSON.parse(r.methodology); } catch { return { summary: r.methodology }; }
    })();
    const methodology: string | null = methodologyRaw?.author
      ? `${methodologyRaw.author}${methodologyRaw.year ? ` · ${methodologyRaw.year}` : ""}`
      : (methodologyRaw?.summary ?? null);

    const name = pickName(r.name);

    return {
      id: Number(r.id),
      kind: "squad" as const,
      slug: String(r.slug),
      name,
      description: r.description ?? null,
      initial: getInitial(name),
      badge: { label: `${layer}・${layerTone.label}`, color: layerTone.color },
      meta: {
        methodology,
        summary: r.description ?? null,
      },
      actions: {
        primary:   { label: KIND_LABELS.squad.primary },
        secondary: { label: KIND_LABELS.squad.secondary },
      },
      strategyLayer: layer,
      stepCount:   Array.isArray(steps)   ? steps.length   : 0,
      memberCount: Array.isArray(members) ? members.length : 0,
      workspace: safeJsonParse<string[]>(r.workspace, []),
    };
  });
}

// ── Agent → HomeEntity ─────────────────────────────────────────────────────
async function fetchAgentEntities(limit = 200): Promise<HomeEntity[]> {
  const db = await getSoworkDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: soworkAgents.id,
      slug: soworkAgents.slug,
      name: soworkAgents.name,
      title: soworkAgents.title,
      bio: soworkAgents.bio,
      specialty: soworkAgents.specialty,
      layer: soworkAgents.layer,
      workspace: soworkAgents.workspace,
    })
    .from(soworkAgents)
    .where(eq(soworkAgents.isAvailable, true))
    .limit(limit);

  // Agents use a 3-tier layer (strategy / execution / training) — map to L1/L4/L6
  // for visual consistency with squads. This is a temporary mapping until
  // agents adopt the L1–L6 system natively.
  const AGENT_LAYER_MAP: Record<string, keyof typeof LAYER_TO_HERO> = {
    strategy:  "L1",
    execution: "L4",
    training:  "L6",
  };

  return rows.map((r) => {
    const layer = AGENT_LAYER_MAP[String(r.layer ?? "").toLowerCase()] ?? "L1";
    const tone = LAYER_TO_HERO[layer]!;
    const name = String(r.name ?? "");
    return {
      id: Number(r.id),
      kind: "agent" as const,
      slug: String(r.slug ?? `agent-${r.id}`),
      name,
      description: r.bio ?? r.specialty ?? null,
      initial: getInitial(name),
      badge: { label: `${layer}・${tone.label}`, color: tone.color },
      meta: {
        methodology: r.title ?? null,
        summary: r.specialty ?? r.bio ?? null,
      },
      actions: {
        primary:   { label: KIND_LABELS.agent.primary },
        secondary: { label: KIND_LABELS.agent.secondary },
      },
      strategyLayer: layer,
      stepCount: 0,
      memberCount: 1,
      workspace: r.workspace ? [String(r.workspace)] : [],
    };
  });
}

// ── Skill → HomeEntity (placeholder; no data source yet) ───────────────────
async function fetchSkillEntities(): Promise<HomeEntity[]> {
  return []; // Standalone skills not yet stored. Reserved for future ingest.
}

// ── Router ─────────────────────────────────────────────────────────────────
export const entityRouter = router({
  /**
   * listForHome — returns unified entities for the homepage.
   *
   * @param brandId  reserved for future per-brand scoping (currently global)
   * @param kinds    which entity types to include; defaults to all three
   */
  listForHome: protectedProcedure
    .input(
      z.object({
        brandId: z.number().nullable().optional(),
        kinds: z.array(z.enum(["squad", "agent", "skill"])).optional(),
      })
    )
    .query(async ({ input }) => {
      const wanted = new Set(input.kinds ?? ["squad", "agent", "skill"]);
      const tasks: Promise<HomeEntity[]>[] = [];
      if (wanted.has("squad")) tasks.push(fetchSquadEntities());
      if (wanted.has("agent")) tasks.push(fetchAgentEntities());
      if (wanted.has("skill")) tasks.push(fetchSkillEntities());

      const results = await Promise.all(tasks);
      const merged = results.flat();

      // Sort: layer L1→L6, then name asc
      const layerOrder: Array<keyof typeof LAYER_TO_HERO> = ["L1", "L2", "L3", "L4", "L5", "L6"];
      merged.sort((a, b) => {
        const la = layerOrder.indexOf(a.strategyLayer);
        const lb = layerOrder.indexOf(b.strategyLayer);
        if (la !== lb) return la - lb;
        return a.name.localeCompare(b.name);
      });

      return merged;
    }),

  /** Counts per kind — for the "類型" dropdown. */
  countsByKind: protectedProcedure
    .input(z.object({ brandId: z.number().nullable().optional() }).optional())
    .query(async () => {
      const [squads, agents, skills] = await Promise.all([
        fetchSquadEntities(),
        fetchAgentEntities(),
        fetchSkillEntities(),
      ]);
      return {
        squad: squads.length,
        agent: agents.length,
        skill: skills.length,
        total: squads.length + agents.length + skills.length,
      };
    }),
});
