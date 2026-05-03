/**
 * entitySearchRouter — unified semantic search across squads, agents, skills.
 *
 * GET /api/entity/search?q=<query>[&kind=all|squad|agent|skill][&limit=20][&threshold=0.22]
 *
 * Pipeline:
 *  1. Vectorise the user query via Azure text-embedding-3-large
 *  2. Load embeddings from:
 *       squad  → squads.embedding        (mos_db)
 *       agent  → agent_embeddings table  (mos_db)
 *       skill  → skills.embedding        (mos_db — populated by compute-skill-embeddings.ts)
 *  3. Cosine similarity for each kind requested (parallel)
 *  4. Merge, score-sort, return top-N with { id, slug, kind, _score, ... } shape
 *
 * Fallback: MySQL LIKE when embedding API unavailable or vectors not generated.
 *
 * Cache: 5-minute in-process cache per entity type (~few MB total for all three).
 */

import { Router } from "express";
import localPool from "../localDb.js";
import { getEmbedding, cosineSimilarity } from "../_core/embedding.js";

export const entitySearchRouter = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

type EntityKind = "squad" | "agent" | "skill";

interface CachedEntity {
  id: number;
  slug: string;
  kind: EntityKind;
  embedding: number[];
}

// ── Per-kind in-process caches ────────────────────────────────────────────────

const caches: Record<EntityKind, { entries: CachedEntity[]; loadedAt: number }> = {
  squad: { entries: [], loadedAt: 0 },
  agent: { entries: [], loadedAt: 0 },
  skill: { entries: [], loadedAt: 0 },
};
const CACHE_TTL = 5 * 60 * 1000;

async function loadCache(kind: EntityKind): Promise<CachedEntity[]> {
  const c = caches[kind];
  if (Date.now() - c.loadedAt < CACHE_TTL && c.entries.length > 0) return c.entries;

  try {
    let rows: any[] = [];
    if (kind === "squad") {
      const [r]: any = await localPool.execute(
        "SELECT id, slug, embedding FROM squads WHERE is_active = 1 AND embedding IS NOT NULL"
      );
      rows = r;
    } else if (kind === "agent") {
      // agent_embeddings stores embedding per agent_id; join agents for slug
      const [r]: any = await localPool.execute(
        `SELECT a.id, a.slug, ae.embedding
           FROM agents a
           JOIN agent_embeddings ae ON ae.agent_id = a.id
          WHERE a.isAvailable = 1`
      );
      rows = r;
    } else {
      // skills.embedding — may not yet exist; handle gracefully
      const [r]: any = await localPool.execute(
        "SELECT id, slug, embedding FROM skills WHERE is_active = 1 AND embedding IS NOT NULL"
      ).catch(() => [[]]);
      rows = r;
    }

    c.entries = rows
      .map((r: any) => {
        try {
          const vec = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
          return Array.isArray(vec) ? { id: Number(r.id), slug: String(r.slug), kind, embedding: vec } : null;
        } catch { return null; }
      })
      .filter(Boolean) as CachedEntity[];
    c.loadedAt = Date.now();
    console.log(`[entitySearch] ${kind} cache: ${c.entries.length} embeddings`);
  } catch (e) {
    console.warn(`[entitySearch] ${kind} cache load failed:`, e);
  }
  return c.entries;
}

// Warm all caches at module load
["squad", "agent", "skill"].forEach((k) => loadCache(k as EntityKind).catch(() => {}));

// ── Fallback: MySQL LIKE per kind ─────────────────────────────────────────────

async function likeSearch(q: string, kind: EntityKind, limit: number): Promise<Array<{ id: number; slug: string; kind: EntityKind }>> {
  const tokens = q.trim().toLowerCase().split(/[\s,、，]+/).filter((t) => t.length >= 2).slice(0, 6);
  if (!tokens.length) return [];

  try {
    let sql = "";
    const params: string[] = [];

    if (kind === "squad") {
      const likes = tokens.map(() => "(name LIKE ? OR name_zh LIKE ? OR slug LIKE ?)");
      params.push(...tokens.flatMap((t) => [`%${t}%`, `%${t}%`, `%${t}%`]));
      sql = `SELECT id, slug FROM squads WHERE is_active=1 AND (${likes.join(" OR ")}) LIMIT ${limit}`;
    } else if (kind === "agent") {
      const likes = tokens.map(() => "(name LIKE ? OR name_zh LIKE ? OR slug LIKE ? OR primarySkill LIKE ?)");
      params.push(...tokens.flatMap((t) => [`%${t}%`, `%${t}%`, `%${t}%`, `%${t}%`]));
      sql = `SELECT id, slug FROM agents WHERE isAvailable=1 AND (${likes.join(" OR ")}) LIMIT ${limit}`;
    } else {
      const likes = tokens.map(() => "(name LIKE ? OR name_zh LIKE ? OR slug LIKE ?)");
      params.push(...tokens.flatMap((t) => [`%${t}%`, `%${t}%`, `%${t}%`]));
      sql = `SELECT id, slug FROM skills WHERE is_active=1 AND (${likes.join(" OR ")}) LIMIT ${limit}`;
    }

    const [rows]: any = await localPool.execute(sql, params);
    return rows.map((r: any) => ({ id: Number(r.id), slug: String(r.slug), kind }));
  } catch { return []; }
}

// ── Fetch full entity rows by IDs ─────────────────────────────────────────────

async function fetchSquads(ids: number[]): Promise<any[]> {
  if (!ids.length) return [];
  const [rows]: any = await localPool.execute(
    `SELECT id, slug, name, name_zh, description, description_zh,
            strategy_layer, mockup_platform, mockup_format,
            task_label_zh, task_label_en, output_kind, is_curated, workspace, tags
       FROM squads WHERE is_active=1 AND id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  const map = new Map(rows.map((r: any) => [Number(r.id), r]));
  return ids.map((id) => map.get(id)).filter(Boolean).map((r) => ({ ...r, kind: "squad" }));
}

async function fetchAgents(ids: number[]): Promise<any[]> {
  if (!ids.length) return [];
  const [rows]: any = await localPool.execute(
    `SELECT id, slug, name, name_zh, title, title_zh, specialty, layer,
            workspace, primarySkill, mockup_platform, mockup_format
       FROM agents WHERE isAvailable=1 AND id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  const map = new Map(rows.map((r: any) => [Number(r.id), r]));
  return ids.map((id) => map.get(id)).filter(Boolean).map((r) => ({ ...r, kind: "agent" }));
}

async function fetchSkills(ids: number[]): Promise<any[]> {
  if (!ids.length) return [];
  const [rows]: any = await localPool.execute(
    `SELECT id, slug, name, name_zh, description, category, strategy_layer,
            task_type, mockup_platform, mockup_format, quality_score
       FROM skills WHERE is_active=1 AND id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  const map = new Map(rows.map((r: any) => [Number(r.id), r]));
  return ids.map((id) => map.get(id)).filter(Boolean).map((r) => ({ ...r, kind: "skill" }));
}

// ── Main search route ─────────────────────────────────────────────────────────

entitySearchRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const kindParam = String(req.query.kind ?? "all");
  const limit = Math.min(Number(req.query.limit ?? 20), 60);
  const threshold = Number(req.query.threshold ?? 0.22);

  const kinds: EntityKind[] =
    kindParam === "all"
      ? ["squad", "agent", "skill"]
      : (kindParam.split(",").filter((k) => ["squad", "agent", "skill"].includes(k)) as EntityKind[]);

  if (q.length < 2) return res.json({ hits: [], mode: "empty", query: q });

  try {
    // 1. Get query vector
    const queryVec = await getEmbedding(q);

    // 2. For each requested kind: cosine sim or LIKE fallback
    const perKindHitsRaw = await Promise.all(
      kinds.map(async (kind) => {
        const perKindLimit = Math.ceil(limit / kinds.length) + 5; // slight over-fetch for re-ranking

        if (!queryVec) {
          // API down → LIKE
          return likeSearch(q, kind, perKindLimit);
        }

        const cache = await loadCache(kind);
        if (!cache.length) {
          // No embeddings → LIKE
          const likes = await likeSearch(q, kind, perKindLimit);
          return likes;
        }

        // Cosine sim
        return cache
          .map(({ id, slug, embedding }) => ({
            id, slug, kind,
            score: cosineSimilarity(queryVec, embedding),
          }))
          .filter((s) => s.score >= threshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, perKindLimit);
      })
    );

    // 3. Merge all hits, sort by score desc, take top limit
    // LIKE fallback hits get score=0 (still shown but after semantic hits)
    interface ScoredRef { id: number; slug: string; kind: EntityKind; score: number }
    const allHits: ScoredRef[] = (perKindHitsRaw.flat() as any[]).map((h) => ({
      id: h.id,
      slug: h.slug,
      kind: h.kind,
      score: (h as any).score ?? 0,
    }));
    allHits.sort((a, b) => b.score - a.score);
    const topHits = allHits.slice(0, limit);

    if (!topHits.length) return res.json({ hits: [], mode: queryVec ? "semantic-empty" : "fallback-empty", query: q });

    // 4. Fetch full rows (parallel per kind)
    const idsByKind: Record<EntityKind, number[]> = { squad: [], agent: [], skill: [] };
    const scoreMap = new Map<string, number>(); // "kind:id" → score
    for (const h of topHits) {
      idsByKind[h.kind].push(h.id);
      scoreMap.set(`${h.kind}:${h.id}`, h.score);
    }

    const [squadRows, agentRows, skillRows] = await Promise.all([
      fetchSquads(idsByKind.squad),
      fetchAgents(idsByKind.agent),
      fetchSkills(idsByKind.skill),
    ]);

    // 5. Annotate with _score and re-sort
    const allRows = [...squadRows, ...agentRows, ...skillRows].map((r) => ({
      ...r,
      _score: scoreMap.get(`${r.kind}:${Number(r.id)}`) ?? 0,
    }));
    allRows.sort((a, b) => b._score - a._score);

    const mode = queryVec
      ? (allHits.some((h) => h.score > 0) ? "semantic" : "fallback-like")
      : "fallback-like";

    return res.json({ hits: allRows, mode, query: q });
  } catch (e: any) {
    console.error("[entitySearch] error:", e?.message);
    return res.status(500).json({ error: "search failed", detail: e?.message });
  }
});
