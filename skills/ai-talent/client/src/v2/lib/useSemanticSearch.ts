/**
 * useSemanticSearch — debounced server-side semantic squad search.
 *
 * When query >= 3 chars, calls GET /api/squads/search?q= and returns
 * server-ranked results.  Falls back to the existing client-side
 * searchAndRankSquads() when:
 *   - query is short (< 3 chars)
 *   - server returns an error
 *   - server responds with 0 hits (client-side may still match)
 *
 * Usage:
 *   const { semanticHits, isSearching } = useSemanticSearch(q);
 *   const displaySquads = semanticHits ?? clientSideResults;
 */

import { useState, useEffect, useRef } from "react";

export interface SemanticHit {
  id: number;
  slug: string;
  name: string | { "zh-TW"?: string; en?: string };
  description?: string | null;
  strategy_layer?: string | null;
  mockup_platform?: string | null;
  mockup_format?: string | null;
  task_label_zh?: string | null;
  task_label_en?: string | null;
  output_kind?: string | null;
  is_curated?: number | null;
  workspace?: string | null;
  tags?: string | null;
  _score?: number;
}

export interface SemanticSearchResult {
  hits: SemanticHit[];
  mode: string;
  query: string;
}

const DEBOUNCE_MS = 350;
const MIN_QUERY_LEN = 3;

export function useSemanticSearch(query: string): {
  semanticHits: SemanticHit[] | null;
  isSearching: boolean;
  searchMode: string | null;
} {
  const [semanticHits, setSemanticHits] = useState<SemanticHit[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Clear pending timer + in-flight request
    if (timerRef.current) clearTimeout(timerRef.current);
    controllerRef.current?.abort();

    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LEN) {
      setSemanticHits(null);
      setIsSearching(false);
      setSearchMode(null);
      return;
    }

    setIsSearching(true);

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const url = `/api/squads/search?q=${encodeURIComponent(trimmed)}&limit=40`;
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data: SemanticSearchResult = await resp.json();
        setSemanticHits(data.hits.length > 0 ? data.hits : null);
        setSearchMode(data.mode);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          // Silently fall back to client-side search
          setSemanticHits(null);
          setSearchMode("client-fallback");
        }
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    };
  }, [query]);

  return { semanticHits, isSearching, searchMode };
}
