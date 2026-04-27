/**
 * Skill ingest — shared types.
 *
 * RawSkill: whatever the source returns (different per source).
 * NormalizedSkill: what we INSERT into the skills table.
 */

export interface NormalizedSkill {
  slug: string;                   // unique, kebab-case, max 190 chars
  name: string;
  category: string | null;        // "writing" | "research" | "marketing" | …
  strategyLayer: "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | null;
  source: string;                 // "anthropic-claude-skills" | "gpt-store" | …
  sourceUrl: string;              // canonical URL where skill came from
  description: string | null;
  manifest: Record<string, any> | null;  // raw skill spec (SKILL.md fields, etc.)
  originModel: "claude" | "openai" | "gemini" | "deepseek" | "qwen" | "cohere" | "cross";
  testedModels: string[] | null;  // community-verified runners
  qualityScore: number | null;    // 0–10
  securityCheck: SecurityCheckResult;
}

export interface SecurityCheckResult {
  passed: boolean;
  scannedAt: string;              // ISO 8601
  flags: string[];                // list of detected issues
  riskScore: number;              // 0–100, higher = riskier
}

export interface SourceFetcher {
  /** Internal id, used as `skills.source` value. */
  id: string;
  /** Human label for logs. */
  label: string;
  /** Default origin_model for skills from this source. */
  originModel: NormalizedSkill["originModel"];
  /** Pull raw skills from the source. */
  fetch(opts: { limit?: number }): Promise<NormalizedSkill[]>;
}
