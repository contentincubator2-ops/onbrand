/**
 * citationStore — in-memory per-session citation accumulator.
 *
 * Every grounding tool (web_fetch, web_search, site_crawl, youtube_fetch)
 * pushes a Citation record here. `citation_bundler` and `boardroom_pdf`
 * read the list at synthesis time to generate footnotes + appendix.
 *
 * Scoped by sessionId so parallel missions don't bleed. Cleanup on session
 * end is handled by squadSessionManager — or by the 2h TTL sweeper below.
 */

export interface Citation {
  kind: "web_fetch" | "web_search" | "site_crawl" | "youtube_fetch" | "review_aggregator";
  url: string;
  title?: string;
  fetchedAt: string; // ISO timestamp
  excerpt?: string;
  meta?: Record<string, any>;
}

const store = new Map<string, Citation[]>();
const touchedAt = new Map<string, number>();

const TTL_MS = 2 * 60 * 60 * 1000; // 2h

export function addCitation(sessionId: string, citation: Citation): void {
  if (!sessionId) return;
  const arr = store.get(sessionId) ?? [];
  // Dedup by URL within the same session
  if (!arr.some(c => c.url === citation.url && c.kind === citation.kind)) {
    arr.push(citation);
    store.set(sessionId, arr);
  }
  touchedAt.set(sessionId, Date.now());
}

export function getCitations(sessionId: string): Citation[] {
  return store.get(sessionId) ?? [];
}

export function clearCitations(sessionId: string): void {
  store.delete(sessionId);
  touchedAt.delete(sessionId);
}

// TTL sweeper — runs every 15m, drops sessions untouched for >2h
setInterval(() => {
  const now = Date.now();
  for (const [sid, last] of touchedAt.entries()) {
    if (now - last > TTL_MS) {
      store.delete(sid);
      touchedAt.delete(sid);
    }
  }
}, 15 * 60 * 1000).unref?.();
