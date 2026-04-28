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
import { eq, sql } from "drizzle-orm";

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

// Some legacy rows store CJK text mis-encoded as latin1 (e.g. "ä¼ä¸ESG..." for "企業 ESG..."). Detect and fix.
function fixMojibake(s: string | null | undefined): string {
  if (!s) return "";
  const str = String(s);
  // Cheap heuristic: presence of typical mojibake chars
  if (!/[ÃÂãâå¯æåäçé]/.test(str)) return str;
  try {
    const fixed = Buffer.from(str, "latin1").toString("utf8");
    // Only return fixed version if it actually contains CJK
    return /[一-鿿]/.test(fixed) ? fixed : str;
  } catch {
    return str;
  }
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  return (trimmed.charAt(0) || "?").toUpperCase();
}

// Agent avatars use generated B&W line-art portraits stored in
// agents.avatarUrl (see scripts/generateAgentAvatars.ts). DiceBear cartoon
// avatars were tried but rejected — too cartoony. Real photos rejected
// too — face-collision risk. Line-art portrait is the chosen middle ground.

// ── Unified entity shape (matches HeroUI Card slots) ───────────────────────
export interface HomeEntity {
  id: number;
  kind: "squad" | "agent" | "skill";
  slug: string;

  name: string;
  /** One-line context shown under the name (kind-specific). */
  subtitle: string | null;
  description: string | null;
  initial: string;

  /** Layer chip — server-mapped to HeroUI semantic. */
  badge: { label: string; color: HeroUIColor };

  /** Footer stats — up to 3 (value + label) pairs. Empty array if none. */
  stats: Array<{ value: number | string; label: string }>;

  meta: {
    methodology: string | null;
    summary:     string | null;
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

  /** PR6 / Q2 — explicit task label from LLM classifier (e.g. "Facebook 月度行事曆"). */
  taskLabel?: string | null;
  taskLabelEn?: string | null;
  outputKind?: "strategic" | "content" | null;
  /** Mockup variant override — bypasses heuristic inference when set. */
  mockup?: { platform: string; format: string };

  /**
   * Skill task_type — drives the icon shown on skill cards
   * (text/image/video/audio/data/research/strategy/code/generic).
   * Null for squad/agent kinds.
   */
  taskType?: string | null;

  /** True for squads with is_curated=1 (the 30 親選 IPs that get covers). */
  isCurated?: boolean;

  /**
   * Generated cover/portrait image. Populated for all three kinds:
   *   squad → squads.hero_image_url (Notion-style line illustration)
   *   agent → agents.avatarUrl       (react-nice-avatar / generated portrait)
   *   skill → skills.cover_image_url (skill cover from generateSkillCovers)
   * Client falls back to MethodologyGlyph when null.
   */
  coverImageUrl?: string | null;
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
            strategy_layer, methodology, workspace,
            task_label_zh, task_label_en, mockup_platform, mockup_format, output_kind,
            hero_image_url, is_curated
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
      : (methodologyRaw?.summary ? fixMojibake(methodologyRaw.summary) : null);

    const name = fixMojibake(pickName(r.name));
    const description = fixMojibake(r.description) || null;
    const stepCount   = Array.isArray(steps)   ? steps.length   : 0;
    const memberCount = Array.isArray(members) ? members.length : 0;
    const stats = [
      { value: stepCount,   label: "步驟" },
      { value: memberCount, label: "成員" },
    ].filter((s) => Number(s.value) > 0);

    return {
      id: Number(r.id),
      kind: "squad" as const,
      slug: String(r.slug),
      name,
      subtitle: methodology,                   // e.g. "Pearson · 2003"
      description,
      initial: getInitial(name),
      badge: { label: `${layer}・${layerTone.label}`, color: layerTone.color },
      stats,
      meta: { methodology, summary: description },
      actions: {
        primary:   { label: KIND_LABELS.squad.primary },
        secondary: { label: KIND_LABELS.squad.secondary },
      },
      strategyLayer: layer,
      stepCount,
      memberCount,
      workspace: safeJsonParse<string[]>(r.workspace, []),
      taskLabel: r.task_label_zh ?? null,
      taskLabelEn: r.task_label_en ?? null,
      outputKind: (r.output_kind as "strategic" | "content" | null) ?? null,
      mockup: (r.mockup_platform && r.mockup_format)
        ? { platform: String(r.mockup_platform), format: String(r.mockup_format) }
        : undefined,
      coverImageUrl: r.hero_image_url ?? null,
      isCurated: Number(r.is_curated) === 1,
    };
  });
}

// ── Agent → HomeEntity ─────────────────────────────────────────────────────
async function fetchAgentEntities(limit = 200): Promise<HomeEntity[]> {
  // Raw SQL via Drizzle's sql tag — soworkAgents schema doesn't declare
  // avatarUrl but the column exists and is populated by generateAgentAvatars.
  const db = await getSoworkDb();
  if (!db) return [];
  let rows: any[] = [];
  try {
    const [r] = (await db.execute(sql`
      SELECT id, slug, name, title, bio, specialty, layer, workspace, avatarUrl
        FROM agents
       WHERE isAvailable = 1
       LIMIT ${limit}
    `)) as any;
    rows = Array.isArray(r) ? r : [];
  } catch (e: any) {
    console.warn(`[entity] agents raw SELECT failed: ${e.message}`);
    return [];
  }

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
    const name = fixMojibake(String(r.name ?? ""));
    const description = fixMojibake(r.bio ?? r.specialty ?? "") || null;
    const subtitle = fixMojibake(r.title ?? "") || null;
    return {
      id: Number(r.id),
      kind: "agent" as const,
      slug: String(r.slug ?? `agent-${r.id}`),
      name,
      subtitle,
      description,
      initial: getInitial(name),
      badge: { label: `${layer}・${tone.label}`, color: tone.color },
      stats: [],
      meta: {
        methodology: subtitle,
        summary: description,
      },
      actions: {
        primary:   { label: KIND_LABELS.agent.primary },
        secondary: { label: KIND_LABELS.agent.secondary },
      },
      strategyLayer: layer,
      stepCount: 0,
      memberCount: 1,
      workspace: r.workspace ? [String(r.workspace)] : [],
      // Use generated B&W half-body line-art portrait stored in avatarUrl.
      coverImageUrl: (r as any).avatarUrl ?? null,
    };
  });
}

// ── Skill → HomeEntity (from skills table) ─────────────────────────────────
//
// Two flavors live in the skills table:
//   - category="agent-template"  → returned as kind="agent"  (alongside soworkAgents)
//   - everything else            → returned as kind="skill"
//
// Server-side classifier (classifySkills.ts) populates strategy_layer +
// task_type + recommended_models. We surface those in the unified shape.
async function fetchSkillTableEntities(opts: { onlyAgentTemplates: boolean; limit?: number }): Promise<HomeEntity[]> {
  const filter = opts.onlyAgentTemplates
    ? "category = 'agent-template'"
    : "(category IS NULL OR category != 'agent-template')";
  const limit = opts.limit ? `LIMIT ${opts.limit}` : "LIMIT 1000";

  let rows: any[] = [];
  try {
    const [r]: any = await localPool.execute(
      `SELECT id, slug, name, description, category, strategy_layer,
              origin_model, source, task_type, recommended_models,
              quality_score, cover_image_url
         FROM skills
        WHERE is_active = 1 AND ${filter}
        ORDER BY quality_score DESC, id ASC
        ${limit}`
    );
    rows = r;
  } catch (e: any) {
    console.warn(`[entity] skills fetch failed: ${e.message}`);
    return [];
  }

  return rows.map((r: any) => {
    const layer = resolveLayerKey(r.strategy_layer);
    const tone = LAYER_TO_HERO[layer]!;
    const name = fixMojibake(String(r.name ?? r.slug ?? ""));
    const description = fixMojibake(r.description ?? "") || null;
    const kind = opts.onlyAgentTemplates ? "agent" : "skill";

    const recommended = (() => {
      try {
        return r.recommended_models
          ? (typeof r.recommended_models === "object"
              ? r.recommended_models
              : JSON.parse(String(r.recommended_models)))
          : [];
      } catch { return []; }
    })();

    // Subtitle: for agent-template show source repo + task_type;
    // for skill, show task_type + origin_model.
    const subtitle = opts.onlyAgentTemplates
      ? [r.source, r.task_type].filter(Boolean).join(" · ")
      : [r.task_type, r.origin_model].filter(Boolean).join(" · ");

    return {
      id: Number(r.id),
      kind: kind as "agent" | "skill",
      slug: String(r.slug),
      name,
      subtitle: subtitle || null,
      description,
      initial: getInitial(name),
      badge: { label: `${layer}・${tone.label}`, color: tone.color },
      stats: Array.isArray(recommended) && recommended.length > 0
        ? recommended.slice(0, 3).map((m: string) => ({ value: "✓", label: m }))
        : [],
      meta: {
        methodology: r.source ?? null,
        summary: description,
      },
      actions: {
        primary:   { label: kind === "agent" ? "啟用 Agent" : "套用技能" },
        secondary: { label: "查看說明" },
      },
      strategyLayer: layer,
      stepCount: 0,
      memberCount: kind === "agent" ? 1 : 0,
      workspace: [],
      // Skill cards render a FontAwesome icon (driven by taskType), not an
      // image — see design system rule. cover_image_url retained for legacy
      // but client ignores it for kind=skill. Agent-template kind still uses
      // cover_image_url as a temporary fallback.
      coverImageUrl: kind === "skill" ? null : (r.cover_image_url ?? null),
      taskType: r.task_type ?? null,
    };
  });
}

async function fetchSkillEntities(): Promise<HomeEntity[]> {
  return fetchSkillTableEntities({ onlyAgentTemplates: false });
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
      if (wanted.has("agent")) {
        // Native agents (soworkAgents) + agent-template skills, merged.
        tasks.push(fetchAgentEntities());
        tasks.push(fetchSkillTableEntities({ onlyAgentTemplates: true }));
      }
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

  /**
   * stats — single source of truth for entity counts across the UI.
   *
   * Use this anywhere a dashboard / hero / sidebar needs to show
   * "N squads / M skills / K agents". Re-queried live from MySQL on
   * each call (no caching) so the moment a new ingest finishes, the UI
   * reflects it.
   *
   * Shape is flat enough that <Stat label value /> components can
   * destructure directly.
   */
  stats: protectedProcedure
    .query(async () => {
      const db = await getSoworkDb();

      // ── Squads (raw SQL on localPool MySQL) ────────────────────────
      const [squadTotal]: any   = await localPool.execute("SELECT COUNT(*) AS n FROM squads WHERE is_active = 1");
      const [squadCurated]: any = await localPool.execute("SELECT COUNT(*) AS n FROM squads WHERE is_active = 1 AND is_curated = 1");
      const [squadByLayer]: any = await localPool.execute(
        `SELECT LEFT(strategy_layer, 2) AS layer, COUNT(*) AS n
           FROM squads WHERE is_active = 1
          GROUP BY LEFT(strategy_layer, 2)`
      );
      const layerMap: Record<string, number> = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0 };
      for (const r of squadByLayer as any[]) {
        const k = String(r.layer ?? "").toUpperCase();
        if (k in layerMap) layerMap[k] = Number(r.n);
      }

      // ── Skills (also localPool — skills table is on the same DB) ───
      let skillTotal = 0;
      const skillByOrigin: Record<string, number> = {};
      const skillByLayer: Record<string, number> = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0 };
      try {
        const [t]: any = await localPool.execute("SELECT COUNT(*) AS n FROM skills WHERE is_active = 1");
        skillTotal = Number(t[0]?.n ?? 0);
        const [bo]: any = await localPool.execute(
          "SELECT origin_model, COUNT(*) AS n FROM skills WHERE is_active = 1 GROUP BY origin_model"
        );
        for (const r of bo as any[]) skillByOrigin[String(r.origin_model)] = Number(r.n);
        const [bl]: any = await localPool.execute(
          "SELECT strategy_layer, COUNT(*) AS n FROM skills WHERE is_active = 1 AND strategy_layer IS NOT NULL GROUP BY strategy_layer"
        );
        for (const r of bl as any[]) {
          const k = String(r.strategy_layer ?? "").toUpperCase();
          if (k in skillByLayer) skillByLayer[k] = Number(r.n);
        }
      } catch (e: any) {
        console.warn("[entity.stats] skills table not available:", e.message);
      }

      // ── Agents (Drizzle on soworkAgents) ───────────────────────────
      let agentTotal = 0, agentAvailable = 0;
      const agentByTier: Record<string, number> = { strategy: 0, execution: 0, training: 0 };
      if (db) {
        const allRows = await db
          .select({ layer: soworkAgents.layer, isAvailable: soworkAgents.isAvailable })
          .from(soworkAgents);
        agentTotal = allRows.length;
        for (const r of allRows) {
          if (r.isAvailable) agentAvailable++;
          const t = String(r.layer ?? "").toLowerCase();
          if (t in agentByTier) agentByTier[t] = (agentByTier[t] ?? 0) + 1;
        }
      }

      return {
        squad: {
          total:   Number(squadTotal[0]?.n ?? 0),
          curated: Number(squadCurated[0]?.n ?? 0),
          byLayer: layerMap,
        },
        skill: {
          total:    skillTotal,
          byOrigin: skillByOrigin,
          byLayer:  skillByLayer,
        },
        agent: {
          total:     agentTotal,
          available: agentAvailable,
          byTier:    agentByTier,
        },
        generatedAt: new Date().toISOString(),
      };
    }),
});
