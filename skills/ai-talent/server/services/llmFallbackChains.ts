/**
 * llmFallbackChains.ts — Per-purpose provider fallback chain declarations (Issue #6)
 *
 * Each chain is an ordered list of { provider, model } entries to try in sequence.
 * The final entry in a chain uses the sentinel provider "degraded-text", which means
 * the gateway has exhausted all real providers and should surface an error to the caller.
 *
 * Chain selection: pass a `purpose` string to the gateway helpers.
 * Supported purposes: "chat" | "plan" | "specialist"
 * Unknown purposes fall back to the "chat" chain.
 */

export type ProviderModel = {
  provider: string;
  model: string;
};

export type FallbackTerminal = {
  provider: "degraded-text";
  model: "none";
};

export type ChainEntry = ProviderModel | FallbackTerminal;

export type LLMPurpose = "chat" | "plan" | "specialist";

/**
 * Fallback chains per purpose.
 *
 * Order matters: the gateway tries entries left-to-right.
 * The last entry MUST be the degraded-text terminal — the gateway will throw
 * `AllProvidersExhaustedError` when it reaches this terminal.
 */
export const FALLBACK_CHAINS: Record<LLMPurpose, ChainEntry[]> = {
  /**
   * Chat purpose: used by missionChatRouter for conversational responses.
   * Primary: openai gpt-4o → Secondary: openrouter claude-sonnet → Tertiary: anthropic haiku
   */
  chat: [
    { provider: "openai",      model: "gpt-4o" },
    { provider: "openrouter",  model: "anthropic/claude-sonnet-4-6" },
    { provider: "anthropic",   model: "claude-haiku-20240307" },
    { provider: "degraded-text", model: "none" },
  ],

  /**
   * Plan purpose: used for mission planning / SOP generation.
   * Needs stronger reasoning; falls back to smaller models under pressure.
   */
  plan: [
    { provider: "openai",      model: "gpt-4o" },
    { provider: "openrouter",  model: "anthropic/claude-sonnet-4-6" },
    { provider: "anthropic",   model: "claude-haiku-20240307" },
    { provider: "degraded-text", model: "none" },
  ],

  /**
   * Specialist purpose: used by squad specialist agents for execution steps.
   * Starts with a capable model; degrades gracefully.
   */
  specialist: [
    { provider: "openrouter",  model: "anthropic/claude-sonnet-4-6" },
    { provider: "openai",      model: "gpt-4o-mini" },
    { provider: "anthropic",   model: "claude-haiku-20240307" },
    { provider: "degraded-text", model: "none" },
  ],
};

/** Resolve a purpose string to its chain, defaulting to "chat". */
export function resolveChain(purpose?: string): ChainEntry[] {
  if (purpose && purpose in FALLBACK_CHAINS) {
    return FALLBACK_CHAINS[purpose as LLMPurpose];
  }
  return FALLBACK_CHAINS.chat;
}
