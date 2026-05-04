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
  | "azure-northcentral"
  | "azure-canada"
  | "anthropic"
  | "gemini";

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

// Probe results 2026-05-04 (post key-restore):
//   WORKING (200): qwen, zhipu, azure-foundry/Kimi-K2.5, gemini-native, tavily
//   PENDING KEY:   azure-position (claude-sonnet-4-6), azure-northcentral (DeepSeek)
//   NOT OAI-COMPAT: anthropic (404 — /messages API, not /chat/completions)
//   BROKEN: openai (401), perplexity (401 quota), cohere (401), gemini-oai-compat (400)
//
// Priority strategy:
//   creative/analysis → claude-sonnet-4-6 (azure-position) when key available
//   coding            → DeepSeek-R1 (azure-northcentral) when key available
//   chinese/general   → qwen (native Chinese LLM) first
//   fallback chain    → qwen → zhipu → azure-foundry (all confirmed working)
const TASK_PRIORITY_MAP: Record<TaskType, ModelProvider[]> = {
  chinese_content: ["qwen",           "zhipu", "azure-foundry", "azure-position"],
  creative_writing: ["azure-position", "qwen",  "zhipu",         "azure-foundry"],
  search_realtime:  ["qwen",           "zhipu", "azure-foundry", "azure-position"],
  analysis:         ["azure-position", "qwen",  "zhipu",         "azure-foundry"],
  classification:   ["qwen",           "zhipu", "azure-foundry", "azure-position"],
  coding:           ["azure-northcentral", "azure-foundry", "qwen", "zhipu"],
  general:          ["qwen",           "zhipu", "azure-foundry", "azure-position"],
};

// Best model to use for each provider when called by this router
const DEFAULT_MODELS: Record<ModelProvider, string> = {
  // Non-Azure (confirmed working)
  qwen:               "qwen-plus",
  zhipu:              "glm-4-flash",
  // Azure endpoints
  "azure-foundry":    "gpt-5.4-mini",          // cheaper than gpt-5.4; Kimi-K2.5 also confirmed
  "azure-position":   "claude-sonnet-4-6",      // best model for creative/analysis
  "azure-northcentral": "DeepSeek-V3.2",        // R1 for reasoning, V3.2 for speed
  "azure-canada":     "gpt-4o-mini-transcribe", // transcription only
  // Disabled / not used via invokeLLM
  perplexity:         "sonar-pro",
  google:             "gemini-2.0-flash",
  cohere:             "command-r-plus",
  openai:             "gpt-4o-mini",
  forge:              "gemini-2.5-flash",
  anthropic:          "claude-sonnet-4-6",
  gemini:             "gemini-2.5-flash",
};

/**
 * Determine which providers are available based on configured API keys.
 */
function getAvailabilityMap(): Record<ModelProvider, boolean> {
  const foundryKey  = !!(ENV as any).AZURE_FOUNDRY_API_KEY;
  const positionKey = !!(ENV as any).AZURE_POSITION_API_KEY || foundryKey; // fallback to shared key
  const northKey    = !!(ENV as any).AZURE_NORTHCENTRAL_API_KEY || foundryKey;
  const canadaKey   = !!(ENV as any).AZURE_CANADA_API_KEY || foundryKey;

  return {
    // Confirmed working (probed 2026-05-04)
    qwen:                !!ENV.QWEN_API_KEY,
    zhipu:               !!ENV.ZHIPU_API_KEY,
    "azure-foundry":     foundryKey,
    // Available when keys present (using shared foundry key as fallback)
    "azure-position":    positionKey,
    "azure-northcentral": northKey,
    "azure-canada":      canadaKey,
    // Force-disabled: confirmed broken or not OpenAI-compat via invokeLLM
    anthropic:           false,   // 404 — uses /messages not /chat/completions
    openai:              false,   // 401 — key expired
    perplexity:          false,   // 401 — all 5 keys quota exhausted
    google:              false,   // gemini-oai-compat 400; native works in perplexityScout
    cohere:              false,   // 401 — key invalid
    forge:               false,   // no key on VM
    gemini:              false,   // 400 — openai-compat mismatch; native works in perplexityScout
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
  preferredProvider?: ModelProvider
): Promise<{ content: string; provider: ModelProvider; model: string }> {
  const availability = getAvailabilityMap();

  let provider: ModelProvider;
  let model: string;

  if (preferredProvider) {
    if (availability[preferredProvider]) {
      provider = preferredProvider;
      model = DEFAULT_MODELS[provider];
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
