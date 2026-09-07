/**
 * agentMessage.ts — Canonical inter-agent message envelope.
 *
 * Per CJ direction 2026-04-30: agents in a squad use different AI models
 * (Claude / GPT-5 / Gemini / DeepSeek-via-Atlas …). We need ONE canonical
 * format so squad designers, downstream agents, and UI components don't
 * have to know which model produced each step's output. Models swap
 * freely; the contract is this AgentMessage shape.
 *
 * 3-layer architecture (this file = L1):
 *   L1 (here)        — AgentMessage canonical envelope
 *   L2 (next phase)  — Per-model adapters (encode/decode model native ↔ L1)
 *   L3 (already)     — DB as bus: mission_step_progress.canonical_message
 *
 * Inspired by Google A2A protocol envelope shape, with SoWork-specific
 * additions (outputKind drives mockup routing, lineage drives squad
 * dependency graph).
 */

import { z } from "zod";

// ── outputKind taxonomy ──────────────────────────────────────────────────
// Drives:
//   - which mockup variant the UI renders (DocMockup / PlatformMockup / MediaGenFlow)
//   - default AI model selection (text→Claude, image_brief→Claude+MediaGen, ...)
//   - validation of the conclusion shape (per outputKind zod schema)
// Closed enum — adding a value is an intentional upgrade.
export const OutputKind = z.enum([
  "text_strategic",   // 策略文件 / 報告 (DocMockup)
  "text_content",     // 貼文 / 文案 / hashtag (PlatformMockup)
  "structured_table", // 排程表 / 對手分析表 / 表格類 (DocMockup with table)
  "image_brief",      // 視覺 brief — feeds MediaGenFlow Step 1
  "video_brief",      // 影片 brief — feeds MediaGenFlow Step 1
  "decision",         // 選擇 / 評分 / matchScore (e.g. award matching)
  "qa_review",        // 審核回饋 (lead agent QA pattern)
]);
export type OutputKindT = z.infer<typeof OutputKind>;

// ── status ────────────────────────────────────────────────────────────────
export const MessageStatus = z.enum([
  "drafted",          // agent finished, awaiting review / next step
  "needs_input",      // agent asked the user a clarifying question
  "confirmed",        // user / lead agent approved
  "failed",           // LLM error or empty conclusion
  "superseded",       // a newer version replaced this row
]);
export type MessageStatusT = z.infer<typeof MessageStatus>;

// ── source (research evidence per pipeline budget) ───────────────────────
export const Source = z.object({
  url:        z.string().url(),
  title:      z.string().default(""),
  charCount:  z.number().int().nonnegative().default(0),
  excerpt:    z.string().max(2000).default(""),
  fetchedAt:  z.string().datetime().optional(),
});
export type SourceT = z.infer<typeof Source>;

// ── adapter info (which L2 transformer ran) ──────────────────────────────
export const AdapterInfo = z.object({
  modelId:      z.string(),                          // e.g. "claude-opus-4-6"
  adapterUsed:  z.enum(["claude", "gpt5", "gemini", "deepseek-atlas", "openrouter", "mock"]),
  tokensUsed:   z.number().int().nonnegative().optional(),
  durationMs:   z.number().nonnegative().optional(),
  attempts:     z.number().int().positive().default(1), // cross-provider fallback count
});
export type AdapterInfoT = z.infer<typeof AdapterInfo>;

// ── AgentMessage envelope — THE contract ─────────────────────────────────
//
// Every step's output (mission_step_progress.canonical_message) is one of
// these. Downstream agents read this — they NEVER see the raw model
// response. Cross-model swaps = swap L2 adapter, this contract unchanged.
export const AgentMessage = z.object({
  // Schema version — bump when envelope shape changes incompatibly.
  v: z.literal(1).default(1),

  // ── A2A envelope (Google A2A protocol style) ──────────────────────────
  from:   z.string().min(1).max(120),        // agent slug / "user" / "intake"
  to:     z.string().min(1).max(120),        // next agent slug / "user" / "all"
  intent: z.string().min(1).max(500),        // 1-line: what is this output for

  // ── Step contract ─────────────────────────────────────────────────────
  outputKind: OutputKind,
  conclusion: z.record(z.string(), z.unknown()).default({}),  // step-specific schema; validate via step.schemaHint
  thinking:   z.string().default(""),         // human-readable reasoning trace (drives ThinkingOverlay)
  sources:    z.array(Source).default([]),

  // ── State / routing ───────────────────────────────────────────────────
  status: MessageStatus,
  errors: z.array(z.string()).default([]),

  // ── Lineage ───────────────────────────────────────────────────────────
  // Step ids / message ids this depends on. Squad runner uses this to
  // resolve order + invalidate downstream when an upstream step is rerun.
  upstream: z.array(z.string()).default([]),

  // ── Adapter / model metadata ──────────────────────────────────────────
  adapter: AdapterInfo.optional(),

  // ── Timestamp (ISO 8601) ──────────────────────────────────────────────
  timestamp: z.string().datetime(),
});
export type AgentMessageT = z.infer<typeof AgentMessage>;

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a canonical message with sane defaults. Squad runner / pipeline
 * router calls this when persisting an agent's output.
 */
export function createAgentMessage(input: Partial<AgentMessageT> & {
  from: string;
  to: string;
  intent: string;
  outputKind: OutputKindT;
  status: MessageStatusT;
}): AgentMessageT {
  return AgentMessage.parse({
    v: 1,
    timestamp: new Date().toISOString(),
    conclusion: {},
    thinking: "",
    sources: [],
    errors: [],
    upstream: [],
    ...input,
  });
}

/**
 * Strict parse — throws on invalid shape. Use when reading from DB to
 * guarantee L2 / L3 always work with valid envelopes.
 */
export function parseAgentMessage(raw: unknown): AgentMessageT {
  return AgentMessage.parse(raw);
}

/**
 * Soft parse — returns either the parsed message or null + error list.
 * Use at boundaries (LLM output, cross-service ingress) where invalid
 * input is expected and shouldn't crash the runner.
 */
export function safeParseAgentMessage(raw: unknown):
  { ok: true; message: AgentMessageT } | { ok: false; errors: string[] } {
  const r = AgentMessage.safeParse(raw);
  if (r.success) return { ok: true, message: r.data };
  return {
    ok: false,
    errors: r.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}

/**
 * Convert a legacy mission_step_progress row to AgentMessage envelope.
 *
 * Existing rows have separate columns (status / agent_name / agent_id /
 * agent_output / user_input / history). This synthesizes the envelope
 * read-time so older missions render in the new format without a
 * destructive migration. Writes still go through createAgentMessage().
 */
export function legacyRowToAgentMessage(row: {
  step_order:    number;
  status:        string;
  agent_id?:     number | null;
  agent_name?:   string | null;
  agent_output?: string | null;
  user_input?:   string | null;
  updated_at?:   Date | string | null;
}): AgentMessageT {
  const statusMap: Record<string, MessageStatusT> = {
    pending:   "drafted",        // best-effort; "pending" doesn't have a canonical equiv
    asking:    "needs_input",
    drafted:   "drafted",
    confirmed: "confirmed",
    skipped:   "superseded",
    failed:    "failed",
  };
  const mappedStatus = statusMap[row.status] ?? "drafted";
  // outputKind can't be reliably inferred from legacy rows — default to
  // text_content (covers ~90% of pre-canonical step outputs). Downstream
  // consumers that need exact kind should route through new writes.
  const text = String(row.agent_output ?? "");
  return createAgentMessage({
    from:       row.agent_name ?? "unknown-agent",
    to:         "user",
    intent:     `Step ${row.step_order} legacy output`,
    outputKind: "text_content",
    status:     mappedStatus,
    conclusion: { text },
    thinking:   "",  // legacy rows didn't separate thinking
    sources:    [],
    upstream:   row.step_order > 1 ? [`step-${row.step_order - 1}`] : [],
    timestamp:  row.updated_at
      ? new Date(row.updated_at as any).toISOString()
      : new Date().toISOString(),
  });
}

// ── L2 ADAPTER INTERFACE (export only — implementation in next phase) ────
//
// Each AI model backend (Claude / GPT-5 / Gemini / DeepSeek-via-Atlas)
// implements this interface. The L1 envelope above is what flows in/out;
// the adapter's job is to translate to/from the model's native preferences
// (XML thinking tags, JSON mode, system prompt conventions).
export interface ModelAdapter {
  /** Stable id ("claude" / "gpt5" / "gemini" / "deepseek-atlas"). */
  readonly id: AdapterInfoT["adapterUsed"];

  /** Default model id this adapter targets (overridable per call). */
  readonly defaultModelId: string;

  /**
   * Encode a canonical request (system + upstream messages + expected
   * conclusion schema) into the model's native API request shape.
   * Returns whatever the underlying SDK / fetch expects.
   */
  encode(req: EncodeRequest): unknown;

  /**
   * Decode the model's raw response string into a canonical AgentMessage.
   * Should populate conclusion + thinking + sources from whatever
   * extraction strategy fits the model (XML tags, JSON mode, etc.).
   */
  decode(rawResponse: string, ctx: DecodeContext): AgentMessageT;
}

export interface EncodeRequest {
  /** System prompt — agent persona + step instructions. */
  system: string;
  /** Upstream messages (canonical) the agent should consider as context. */
  upstream: AgentMessageT[];
  /** Expected output kind — adapter uses this to add structured-output hints. */
  outputKind: OutputKindT;
  /**
   * Schema example (mockConclusion-style) so the model knows the JSON
   * shape to produce. Exact zod validation happens after decode.
   */
  schemaExample: Record<string, unknown>;
  /** Hard cap. */
  maxTokens?: number;
}

export interface DecodeContext {
  /** Used to populate AgentMessage envelope fields not in the raw response. */
  from: string;
  to: string;
  intent: string;
  outputKind: OutputKindT;
  modelId: string;
  upstream?: string[];
  durationMs?: number;
  tokensUsed?: number;
  attempts?: number;
}
