/**
 * useSemanticSearch — debounced server-side semantic entity search.
 *
 * Calls GET /api/entity/search?q=&kind= and returns server-ranked hits.
 * Falls back to null (→ caller uses client-side search) when:
 *   - query < 3 chars
 *   - server returns 0 hits
 *   - server errors
 *
 * Usage:
 *   const { semanticHits, isSearching } = useSemanticSearch(q, "squad");
 *   const { semanticHits, isSearching } = useSemanticSearch(q, "all");
 */

import { useState, useEffect, useRef } from "react";

export type SearchKind = "all" | "squad" | "agent" | "skill";

export interface SemanticHit {
  id: number;
  slug: string;
  kind: "squad" | "agent" | "skill";
  // squad fields
  name?: string | { "zh-TW"?: string; en?: string };
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
  // agent fields
  title?: string | null;
  specialty?: string | null;
  primarySkill?: string | null;
  // skill fields
  task_type?: string | null;
  quality_score?: number | null;
  // score
  _score?: number;
}

export interface SemanticSearchResult {
  hits: SemanticHit[];
  mode: string;
  query: string;
}

const DEBOUNCE_MS = 350;
const MIN_QUERY_LEN = 3;

export function useSemanticSearch(
  query: string,
  kind: SearchKind = "all",
  limitOverride?: number,
): {
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
        const limit = limitOverride ?? 40;
        const url = `/api/entity/search?q=${encodeURIComponent(trimmed)}&kind=${kind}&limit=${limit}`;
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data: SemanticSearchResult = await resp.json();
        setSemanticHits(data.hits.length > 0 ? data.hits : null);
        setSearchMode(data.mode);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
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
  }, [query, kind, limitOverride]);

  return { semanticHits, isSearching, searchMode };
}
