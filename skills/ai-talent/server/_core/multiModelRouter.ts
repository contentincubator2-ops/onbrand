/**
 * Multi-Model AI Router
 * Automatically selects the best AI model based on task type and available API keys.
 *
 * BUG-2 fix: No longer duplicates provider config or calls fetch directly.
 * All LLM calls now go through invokeLLM() from llm.ts, which owns the
 * single source-of-truth PROVIDER_CONFIG routing table.
 */

import { ENV } from "./env";
import { gatewayInvokeLLM } from "../services/llmGateway";

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
  | "forge";

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

const TASK_PRIORITY_MAP: Record<TaskType, ModelProvider[]> = {
  chinese_content: ["qwen", "zhipu", "openai", "forge"],
  creative_writing: ["zhipu", "qwen", "openai", "forge"],
  search_realtime: ["perplexity", "google", "openai", "forge"],
  analysis: ["google", "openai", "cohere", "qwen", "forge"],
  classification: ["cohere", "openai", "google", "forge"],
  coding: ["openai", "google", "forge"],
  general: ["openai", "qwen", "google", "forge"],
};

const DEFAULT_MODELS: Record<ModelProvider, string> = {
  qwen: "qwen-plus",
  zhipu: "glm-4-flash",
  perplexity: "llama-3.1-sonar-large-128k-online",
  google: "gemini-2.0-flash",
  cohere: "command-r-plus",
  openai: "gpt-4o-mini",
  forge: "gemini-2.5-flash",
};

/**
 * Determine which providers are available based on configured API keys.
 * BUG-1 fix: references SCREAMING_SNAKE_CASE keys from the zod-validated ENV.
 */
function getAvailabilityMap(): Record<ModelProvider, boolean> {
  return {
    qwen:       !!ENV.QWEN_API_KEY,
    zhipu:      !!ENV.ZHIPU_API_KEY,
    perplexity: !!ENV.PERPLEXITY_API_KEY,
    google:     !!ENV.GOOGLE_AI_API_KEY,
    cohere:     !!ENV.COHERE_API_KEY,
    openai:     !!ENV.OPENAI_API_KEY,
    forge:      !!ENV.BUILT_IN_FORGE_API_KEY,
  };
}

/**
 * Select the highest-priority available provider for the given task type.
 * Falls back to "forge" if no other provider is configured.
 */
function selectProvider(taskType: TaskType): ModelProvider {
  const availability = getAvailabilityMap();
  for (const provider of TASK_PRIORITY_MAP[taskType]) {
    if (availability[provider]) return provider;
  }
  return "forge";
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
 *
 * BUG-2 fix: delegates all HTTP/auth logic to invokeLLM() — no duplicate
 * fetch calls or provider config here.
 */
export async function callModel(
  messages: MultiModelMessage[],
  taskType?: TaskType,
  preferredProvider?: ModelProvider,
  userId = 0
): Promise<{ content: string; provider: ModelProvider; model: string }> {
  const availability = getAvailabilityMap();

  // Resolve provider + model
  let provider: ModelProvider;
  let model: string;

  if (preferredProvider && availability[preferredProvider]) {
    provider = preferredProvider;
    model = DEFAULT_MODELS[provider];
  } else {
    const type = taskType ?? detectTaskType(messages.map(m => m.content).join(" "));
    provider = selectProvider(type);
    model = DEFAULT_MODELS[provider];
  }

  // Delegate to the gateway — enforces semaphore + daily budget.
  const result = await gatewayInvokeLLM(
    { provider, model, messages },
    { userId }
  );

  const content = result.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("[multiModelRouter] Unexpected response structure from LLM");
  }

  return { content, provider, model };
}
