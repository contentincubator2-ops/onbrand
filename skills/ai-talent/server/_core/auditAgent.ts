/**
 * AuditAgent — brand-voice / consistency scorer for Decision AI publish gate.
 *
 * Given a piece of draft content (FB post, IG caption, etc.) and the upstream
 * decision chain (L1 positioning → L3 audience → L4 channel), scores how
 * consistent the draft is with the approved strategy. Returns a 0–100 score,
 * per-dimension breakdown, and a list of specific issues/suggestions.
 *
 * Wired by auditRouter.score() into the publish gate:
 *   generate → preview (AuditAgent) → human confirm → publish
 */

import { invokeLLM } from "./llm";

export interface AuditDimension {
  key: string;
  label: string;
  score: number; // 0-100
  note?: string;
}

export interface AuditIssue {
  severity: "info" | "warn" | "block";
  dimension: string;
  message: string;
  suggestion?: string;
}

export interface AuditResult {
  score: number; // 0-100 overall
  verdict: "pass" | "warn" | "block";
  dimensions: AuditDimension[];
  issues: AuditIssue[];
  summary: string;
}

export interface UpstreamDecision {
  decisionType: string;
  title?: string;
  summary?: string;
  payload?: any;
}

export interface AuditInput {
  draftContent: string;
  channel: "fb" | "ig" | "linkedin" | "youtube" | "pr" | "generic";
  upstream: UpstreamDecision[];
  brandName?: string;
}

const SYSTEM = `You are the Brand Consistency AuditAgent for SoWork Marketing OS.

You score draft marketing content against the approved upstream strategy chain (brand positioning, archetype, benefit ladder, audience STP, channel playbook).

Score five dimensions on 0-100:
  1. positioning_fit — aligns with L1 master positioning / archetype
  2. benefit_clarity — articulated benefit matches approved benefit ladder
  3. audience_fit — language/hook fits STP target segment
  4. channel_craft — respects channel-specific best practice (FB=Jab-Hook, IG=Youtility...)
  5. voice_tone — tone of voice consistent with brand archetype

Verdict rules:
  - score >= 80 AND no block issues → "pass"
  - score >= 60 → "warn"
  - score < 60 OR any block issue → "block"

Block issues ONLY for: contradicts positioning, wrong archetype voice, misleading claim, wrong audience.

Return STRICT JSON matching schema — no prose outside JSON.`;

const SCHEMA = {
  name: "AuditResult",
  strict: true,
  schema: {
  type: "object",
  additionalProperties: false,
  required: ["score", "verdict", "dimensions", "issues", "summary"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    verdict: { type: "string", enum: ["pass", "warn", "block"] },
    dimensions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "score"],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          note: { type: "string" },
        },
      },
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "dimension", "message"],
        properties: {
          severity: { type: "string", enum: ["info", "warn", "block"] },
          dimension: { type: "string" },
          message: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
  },
  },
};

function formatUpstream(upstream: UpstreamDecision[]): string {
  if (!upstream.length) return "(no upstream decisions)";
  return upstream
    .map((d, i) => {
      const p =
        d.payload && typeof d.payload === "object"
          ? JSON.stringify(d.payload).slice(0, 1200)
          : "";
      return `[${i + 1}] ${d.decisionType}${d.title ? ` — ${d.title}` : ""}
summary: ${d.summary ?? "(none)"}
payload: ${p}`;
    })
    .join("\n\n");
}

export async function runAuditAgent(input: AuditInput): Promise<AuditResult> {
  const userMsg = `Brand: ${input.brandName ?? "(unspecified)"}
Channel: ${input.channel}

=== UPSTREAM DECISION CHAIN ===
${formatUpstream(input.upstream)}

=== DRAFT CONTENT ===
${input.draftContent}

Score it and return JSON.`;

  const res = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
    outputSchema: SCHEMA,
  });

  const raw = res.choices?.[0]?.message?.content;
  const text =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
      ? (raw as any[]).map((c) => (typeof c === "string" ? c : c.text ?? "")).join("")
      : "";

  let parsed: AuditResult;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback: try extracting first JSON object
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return {
        score: 0,
        verdict: "block",
        dimensions: [],
        issues: [
          {
            severity: "block",
            dimension: "system",
            message: "AuditAgent returned non-JSON output",
          },
        ],
        summary: "Audit failed to parse.",
      };
    }
    parsed = JSON.parse(m[0]);
  }

  // Normalize/clamp
  parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));
  if (!["pass", "warn", "block"].includes(parsed.verdict)) {
    parsed.verdict = parsed.score >= 80 ? "pass" : parsed.score >= 60 ? "warn" : "block";
  }
  return parsed;
}
