/**
 * Multi-Model AI Router
 * Automatically selects the best AI model based on task type and available API keys.
 *
 * Azure AI Foundry endpoints (4 resources, 42+ deployments):
 *   azure-foundry    — sowork-foundry-claw-api-router / proj-mkt-agent-law
 *                      gpt-5.4/mini/nano, gpt-4.1/mini/nano, gpt-4o-mini, o3, o4-mini,
 *                      grok-4-1/grok-4-20, Kimi-K2.5, Llama-3.3-70B, FLUX.2, embeddings
 *   azure-position   — sowork-ai-position-resource
 *                      claude-sonnet-4-6, claude-haiku-4-5, gpt-5.4-pro, cohere-command-a,
 *                      FLUX.1-Kontext-pro, gpt-image-1/1.5/2, whisper, TTS
 *   azure-northcentral — cjwan-mnykipqt-northcentralus
 *                      DeepSeek-R1, DeepSeek-V3.2, Mistral-Large-3
 *   azure-canada     — cjwan-mnynpm8k-canadacentral
 *                      gpt-4o-mini-transcribe
 *
 * Non-Azure (confirmed working 2026-05-04):
 *   qwen, zhipu — primary workhorse LLMs
 *   gemini-native — web-grounded search via perplexityScout (not invokeLLM)
 *   tavily — search API via perplexityScout
 */

import { ENV } from "./env";
import { invokeLLM } from "./llm";

export type TaskType =
  | "chinese_content"
  | "creative_writing"
  | "search_realtime"
  | "analysis"
  | "classification"
  | "general"
  | "coding";

export type ModelProvider =
  | "qwen"
  | "zhipu"
  | "perplexity"
  | "google"
  | "cohere"
  | "openai"
  | "forge"
  | "azure-foundry"
  | "azure-position"
  | "azure-claude"
  | "azure-northcentral"
  | "azure-canada"
  | "anthropic"
  | "gemini"
  | "hermes";

export interface MultiModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ─── Task-type detection ──────────────────────────────────────────────────────

export function detectTaskType(content: string): TaskType {
  const lower = content.toLowerCase();

  if (lower.includes("分析") || lower.includes("策略") || lower.includes("報告") ||
      lower.includes("研究") || lower.includes("洞察") || lower.includes("競品") ||
      lower.includes("市場") || lower.includes("趨勢分析")) {
    return "analysis";
  }

  if (lower.includes("最新") || lower.includes("今天") || lower.includes("新聞") ||
      lower.includes("即時") || lower.includes("搜尋") || lower.includes("查詢")) {
    return "search_realtime";
  }

  if (lower.includes("腳本") || lower.includes("文案") || lower.includes("故事") ||
      lower.includes("創意") || lower.includes("廣告") || lower.includes("貼文") ||
      lower.includes("標題")) {
    return "chinese_content";
  }

  if (lower.includes("分類") || lower.includes("摘要") || lower.includes("整理") ||
      lower.includes("標籤") || lower.includes("歸納")) {
    return "classification";
  }

  if (lower.includes("程式") || lower.includes("code") || lower.includes("function") ||
      lower.includes("api") || lower.includes("sql")) {
    return "coding";
  }

  return "general";
}

// ─── Provider selection ───────────────────────────────────────────────────────

// Probe results 2026-05-08 (post endpoint+API-shape fix):
//   WORKING (200): qwen, zhipu, azure-foundry/Kimi-K2.5, azure-position
//                  (claude-sonnet/haiku via /anthropic/v1/messages),
//                  azure-northcentral (DeepSeek-V3.2/R1 via /openai/deployments/.../chat/completions
//                  with api-version=2024-10-21), anthropic-direct (api.anthropic.com),
//                  gemini-native (search only via perplexityScout)
//   BROKEN: azure-foundry/gpt-4o (404), azure-claude-sweden (400),
//           openai (401), perplexity (401), cohere (401), gemini-oai-compat (400)
//
// Priority strategy:
//   creative/analysis → claude-sonnet-4-6 (azure-position) when key available
//   coding            → DeepSeek-R1 (azure-northcentral) when key available
//   chinese/general   → qwen (native Chinese LLM) first
//   fallback chain    → qwen → zhipu → azure-foundry (all confirmed working)
// 2026-05-13 (CJ「我要怎麼確保品牌定位會成功 — 儲值前先把 anthropic 拉到
// fallback」): Anthropic ran out of credits. Every call was hitting it
// first, failing with 400 "credit balance too low", then cascading
// through 2-3 fallback providers — adding 3-5s of wasted latency per
// LLM call and 14× per positioning run = 60-90s wasted. Re-prioritized
// so the actually-working providers come first; anthropic stays in
// the chain as a final fallback so it auto-recovers the moment credits
// are topped up. Set LLM_PRIMARY=anthropic in .env to restore the
// previous behavior (one-line revert) once Plans & Billing is fixed.
const ANTHROPIC_FIRST = process.env.LLM_PRIMARY === "anthropic";

const TASK_PRIORITY_MAP: Record<TaskType, ModelProvider[]> = ANTHROPIC_FIRST ? {
  //                  best choice          ↓ fallbacks ────────────────────────────────────
  chinese_content:  ["anthropic",         "azure-foundry","azure-position","zhipu",  "qwen"],
  creative_writing: ["anthropic",         "azure-position","azure-claude","azure-foundry","qwen"],
  search_realtime:  ["anthropic",         "zhipu",      "azure-foundry",  "azure-position","qwen"],
  analysis:         ["anthropic",         "azure-position","azure-claude","azure-foundry","qwen"],
  classification:   ["anthropic",         "zhipu",      "azure-foundry",  "azure-position","qwen"],
  coding:           ["anthropic",         "azure-northcentral","azure-foundry","zhipu","qwen"],
  general:          ["anthropic",         "zhipu",      "azure-foundry",  "azure-position","qwen"],
} : {
  // Anthropic-OOC mode (default until credits topped up):
  // - chinese / creative: qwen first (native Chinese branding quality)
  // - analysis / coding:  azure-foundry first (gpt-5.4-mini / DeepSeek)
  // - anthropic kept as last entry — works again automatically when balance > 0
  chinese_content:  ["qwen",              "azure-foundry","zhipu",         "google",          "anthropic"],
  creative_writing: ["qwen",              "azure-foundry","zhipu",         "google",          "anthropic"],
  search_realtime:  ["azure-foundry",     "qwen",         "zhipu",         "google",          "anthropic"],
  analysis:         ["azure-foundry",     "qwen",         "azure-northcentral","zhipu",       "anthropic"],
  classification:   ["azure-foundry",     "qwen",         "zhipu",         "google",          "anthropic"],
  coding:           ["azure-northcentral","azure-foundry","qwen",          "zhipu",           "anthropic"],
  general:          ["qwen",              "azure-foundry","zhipu",         "google",          "anthropic"],
};

// Best model to use for each provider when called by this router
const DEFAULT_MODELS: Record<ModelProvider, string> = {
  // Non-Azure (confirmed working)
  qwen:               "qwen-plus",
  zhipu:              "glm-4-flash",
  // Azure endpoints
  "azure-foundry":      "gpt-5.4-mini",          // gpt-5.4/Kimi-K2.5/grok-4 also available
  "azure-position":     "claude-sonnet-4-6",    // also: claude-haiku-4-5, gpt-5.4-pro
  "azure-claude":       "claude-sonnet-4-6",    // Sweden: claude-sonnet/haiku/opus variants
  "azure-northcentral": "DeepSeek-V3.2",        // also: DeepSeek-R1, Mistral-Large-3
  "azure-canada":       "gpt-4o-mini-transcribe",
  // Disabled / not used via invokeLLM
  perplexity:         "sonar-pro",
  google:             "gemini-2.0-flash",
  cohere:             "command-r-plus",
  openai:             "gpt-4o-mini",
  forge:              "gemini-2.5-flash",
  anthropic:          "claude-haiku-4-5-20251001",  // 2026-05-09: only confirmed-deployed model
  gemini:             "gemini-2.5-flash",
  hermes:             "hermes",
};

/**
 * Determine which providers are available based on configured API keys.
 */
function getAvailabilityMap(): Record<ModelProvider, boolean> {
  return {
    // 2026-05-12 (CJ「YT 6-ep 502」): re-enabled qwen/zhipu/openai/gemini.
    // 2026-05-09 had hard-coded these to false because of broken keys at the
    // time, but admin-probe-fallback-chain on 2026-05-12 confirmed all 4 work
    // (qwen: 媽媽的手，曾牽我學步…; openai gpt-4.1-mini ✓; gemini ✓; deepseek ✓).
    // Hard-coding false forced every agent pinned to these providers through
    // Anthropic → 400 → outer cascade. 5x latency per call.
    qwen:                 !!(ENV as any).QWEN_API_KEY,
    zhipu:                !!(ENV as any).ZHIPU_API_KEY,
    "azure-foundry":      !!(ENV as any).AZURE_FOUNDRY_API_KEY,
    // Azure resources (keys written 2026-05-04)
    "azure-position":     !!(ENV as any).AZURE_POSITION_API_KEY,
    "azure-claude":       !!(ENV as any).AZURE_CLAUDE_SWEDEN_API_KEY,
    "azure-northcentral": !!(ENV as any).AZURE_NORTHCENTRAL_API_KEY,
    "azure-canada":       !!(ENV as any).AZURE_CANADA_API_KEY,
    anthropic:            !!(ENV as any).ANTHROPIC_API_KEY,
    openai:               !!(ENV as any).OPENAI_API_KEY,
    perplexity:           false,   // 401 — all 5 keys quota exhausted (still true)
    google:               !!((ENV as any).GEMINI_API_KEY ?? (ENV as any).GOOGLE_AI_API_KEY),
    cohere:               !!(ENV as any).COHERE_API_KEY,
    forge:                false,   // no key on VM
    gemini:               !!((ENV as any).GEMINI_API_KEY ?? (ENV as any).GOOGLE_AI_API_KEY),
    hermes:               !!(ENV as any).HERMES_API_URL,
  };
}

/**
 * Select the highest-priority available provider for the given task type.
 */
function selectProvider(taskType: TaskType): ModelProvider {
  const availability = getAvailabilityMap();
  for (const provider of TASK_PRIORITY_MAP[taskType]) {
    if (availability[provider]) return provider;
  }
  if (ENV.QWEN_API_KEY) return "qwen";
  if (ENV.ZHIPU_API_KEY) return "zhipu";
  return "qwen"; // will throw with clear error if key missing
}

/**
 * @internal Exposed for testing / introspection.
 * Returns the resolved (provider, model) pair for a given task type.
 */
export function selectModel(taskType: TaskType): { provider: ModelProvider; model: string } {
  const provider = selectProvider(taskType);
  return { provider, model: DEFAULT_MODELS[provider] };
}

// ─── Main call function ───────────────────────────────────────────────────────

/**
 * Call the best available AI model for a given set of messages.
 *
 * Provider selection priority is driven by task type. Override with
 * `preferredProvider` when the caller has a specific requirement.
 */
export async function callModel(
  messages: MultiModelMessage[],
  taskType?: TaskType,
  preferredProvider?: ModelProvider,
  /** 2026-05-09: explicit model override. When set, this is the model
   *  string passed to invokeLLM (e.g. "claude-haiku-4-5" not the
   *  provider's DEFAULT_MODELS). Used by orchestra to honor each
   *  agent's specific aiModel value. */
  preferredModel?: string,
): Promise<{ content: string; provider: ModelProvider; model: string }> {
  const availability = getAvailabilityMap();

  let provider: ModelProvider;
  let model: string;

  if (preferredProvider) {
    if (availability[preferredProvider]) {
      provider = preferredProvider;
      model = preferredModel ?? DEFAULT_MODELS[provider];
    } else {
      const type = taskType ?? detectTaskType(messages.map(m => m.content).join(" "));
      provider = selectProvider(type);
      model = DEFAULT_MODELS[provider];
      console.warn(
        `[multiModelRouter] preferred "${preferredProvider}" unavailable (key missing); falling back to "${provider}"`
      );
    }
  } else {
    const type = taskType ?? detectTaskType(messages.map(m => m.content).join(" "));
    provider = selectProvider(type);
    model = DEFAULT_MODELS[provider];
  }

  const result = await invokeLLM({ provider, model, messages });

  const content = result.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("[multiModelRouter] Unexpected response structure from LLM");
  }

  return { content, provider, model };
}
