/**
 * Scout contract — Phase 2A Ext Batch 2-2b.
 *
 * A scout is a single information source (Perplexity, Google News, Opview,
 * Similarweb, …). Each implements `fetch()` returning a normalized list of
 * IntelItems. The orchestrator (`./orchestrator.ts`) runs all available
 * scouts in parallel, de-duplicates, and merges into one feed.
 *
 * Design goals:
 *   - One shape for every source so UI doesn't care where items came from
 *   - Scouts declare their tier / auth requirement so orchestrator can skip
 *     gracefully when creds are missing (instead of throwing)
 *   - Isolated failures — one scout erroring never blocks the others
 */

export type IntelItemType = "competitor_news" | "trending_topic" | "social_trend";

export interface IntelItem {
  key: string;            // stable-ish id: `${scoutId}:${hash-of-title-or-url}`
  type: IntelItemType;
  title: string;
  content?: string;       // ≤ 600 chars summary
  source: string;         // publisher / domain / tool name
  url?: string;
  publishedAt?: string;   // ISO or YYYY-MM-DD
  relevanceScore: number; // 0..1
  scoutId: string;        // which scout produced this
}

export interface ScoutContext {
  brandId: number;
  brandName: string;
  industry?: string;
  keywords: string[];
  competitors: string[];
  industryTags: string[];
  days: number;
  limit: number;
  /** 2026-09-30 策略監測：只要新聞／文章（要有發布日），不要官網、工具頁、社群貼文。 */
  newsOnly?: boolean;
  /** Lazy credential loader — returns decrypted creds or null. */
  loadCred: (tool: string) => Promise<Record<string, string> | null>;
}

export type ScoutTier = "free" | "api_key" | "browser_login";

export interface ScoutResult {
  scoutId: string;
  ok: boolean;
  items: IntelItem[];
  error?: string;
  elapsedMs: number;
  skipped?: "no_creds" | "disabled" | "timeout";
}

export interface Scout {
  /** Short machine id, e.g. "perplexity", "google-news", "opview" */
  id: string;
  /** Human label for UI */
  label: string;
  /** Access tier — orchestrator uses this to decide whether to skip */
  tier: ScoutTier;
  /** If tier !== "free", name of the required tool in brand_tool_credentials */
  requiredTool?: string;
  /** Optional pre-check — return false to skip without even calling fetch. */
  isAvailable?(ctx: ScoutContext): Promise<boolean>;
  /** Do the work. Must never throw — wrap errors in ScoutResult.error. */
  fetch(ctx: ScoutContext): Promise<IntelItem[]>;
}

export class ScoutError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ScoutError";
  }
}
