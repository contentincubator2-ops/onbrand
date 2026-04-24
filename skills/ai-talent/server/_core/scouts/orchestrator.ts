/**
 * Intel orchestrator — Phase 2A Ext Batch 2-2b.
 *
 * Runs all registered scouts in parallel, isolates failures, de-duplicates
 * items across sources, and returns a merged feed plus per-scout status so
 * the UI can show "來源：3 個（其中 2 個需要你授權）".
 *
 * Add a new scout: create it under ./scouts/*, add to SCOUT_REGISTRY below.
 */

import type { IntelItem, Scout, ScoutContext, ScoutResult } from "./types";
import { perplexityScout } from "./perplexityScout";
import { googleNewsScout } from "./googleNewsScout";
import { googleTrendsScout } from "./googleTrendsScout";

export const SCOUT_REGISTRY: Scout[] = [
  perplexityScout,
  googleNewsScout,
  googleTrendsScout,
  // Batch 2-2c: ahrefs, similarweb, semrush, youtube-data, reddit, opview,
  //             meltwater, gwi
];

export interface OrchestratorOutput {
  items: IntelItem[];
  scouts: ScoutResult[];
  availableScouts: number;
  authedScouts: number;
  unauthedScouts: Array<{ id: string; label: string; tier: string; requiredTool?: string }>;
  fetchedAt: string;
}

export async function runScouts(ctx: ScoutContext, perScoutTimeoutMs = 60_000): Promise<OrchestratorOutput> {
  const results = await Promise.all(
    SCOUT_REGISTRY.map((s) => runOneScout(s, ctx, perScoutTimeoutMs))
  );

  // Merge successful items
  const merged: IntelItem[] = [];
  const seenKeys = new Set<string>();
  const seenTitles = new Set<string>();
  const seenUrls = new Set<string>();
  for (const r of results) {
    if (!r.ok) continue;
    for (const it of r.items) {
      if (seenKeys.has(it.key)) continue;
      const titleKey = normalizeTitle(it.title);
      if (titleKey && seenTitles.has(titleKey)) continue;
      if (it.url && seenUrls.has(it.url)) continue;
      seenKeys.add(it.key);
      if (titleKey) seenTitles.add(titleKey);
      if (it.url) seenUrls.add(it.url);
      merged.push(it);
    }
  }

  // Sort: relevanceScore desc, then publishedAt desc (undefined last)
  merged.sort((a, b) => {
    if (a.relevanceScore !== b.relevanceScore) return b.relevanceScore - a.relevanceScore;
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
  });

  // Cap globally
  const capped = merged.slice(0, ctx.limit);

  const unauthedScouts = results
    .filter((r) => r.skipped === "no_creds" || r.skipped === "disabled")
    .map((r) => {
      const scout = SCOUT_REGISTRY.find((s) => s.id === r.scoutId);
      return {
        id: r.scoutId,
        label: scout?.label ?? r.scoutId,
        tier: scout?.tier ?? "unknown",
        requiredTool: scout?.requiredTool,
      };
    });

  return {
    items: capped,
    scouts: results,
    availableScouts: SCOUT_REGISTRY.length,
    authedScouts: results.filter((r) => r.ok).length,
    unauthedScouts,
    fetchedAt: new Date().toISOString(),
  };
}

async function runOneScout(scout: Scout, ctx: ScoutContext, timeoutMs: number): Promise<ScoutResult> {
  const started = Date.now();

  // Pre-check
  try {
    if (scout.isAvailable && !(await scout.isAvailable(ctx))) {
      return {
        scoutId: scout.id,
        ok: false,
        items: [],
        elapsedMs: Date.now() - started,
        skipped: scout.tier === "free" ? "disabled" : "no_creds",
      };
    }
  } catch (err: any) {
    return {
      scoutId: scout.id,
      ok: false,
      items: [],
      error: `isAvailable check failed: ${err?.message ?? "unknown"}`,
      elapsedMs: Date.now() - started,
    };
  }

  // Skip non-free scouts if no cred accessor (orchestrator didn't wire it).
  if (scout.tier !== "free" && scout.requiredTool) {
    try {
      const cred = await ctx.loadCred(scout.requiredTool);
      if (!cred) {
        return {
          scoutId: scout.id,
          ok: false,
          items: [],
          elapsedMs: Date.now() - started,
          skipped: "no_creds",
        };
      }
    } catch (err: any) {
      return {
        scoutId: scout.id,
        ok: false,
        items: [],
        error: `cred load failed: ${err?.message ?? "unknown"}`,
        elapsedMs: Date.now() - started,
      };
    }
  }

  try {
    const items = await withTimeout(scout.fetch(ctx), timeoutMs);
    return {
      scoutId: scout.id,
      ok: true,
      items,
      elapsedMs: Date.now() - started,
    };
  } catch (err: any) {
    const isTimeout = /timeout/i.test(err?.message ?? "");
    return {
      scoutId: scout.id,
      ok: false,
      items: [],
      error: String(err?.message ?? err).slice(0, 300),
      elapsedMs: Date.now() - started,
      ...(isTimeout ? { skipped: "timeout" as const } : {}),
    };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`scout timeout after ${ms}ms`)), ms)),
  ]);
}

function normalizeTitle(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ").replace(/[「」『』"'，。,.!！?？()（）\-—·]/g, "").slice(0, 80);
}
