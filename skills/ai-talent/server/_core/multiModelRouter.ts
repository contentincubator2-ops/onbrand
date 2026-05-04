/**
 * Multi-Model AI Router
 * Automatically selects the best AI model based on task type and available API keys.
 *
 * BUG-2 fix: No longer duplicates provider config or calls fetch directly.
 * All LLM calls now go through invokeLLM() from llm.ts, which owns the
 * single source-of-truth PROVIDER_CONFIG routing table.
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

// Provider status (probed 2026-05-04, second probe after key restoration):
//   WORKING (200):  qwen, zhipu, azure-foundry/gpt-4o, azure-foundry/Kimi-K2.5,
//                   gemini-native (direct API), tavily-search
//   NOT OpenAI-compat: anthropic (404 — uses /messages not /chat/completions)
//   KEY INVALID: openai (401 expired), perplexity (401 all 5 quota exhausted), cohere (401)
//   DISABLED: gemini-openai-compat (400 format mismatch — use native API path instead)
//
// invokeLLM() uses OpenAI-compatible /chat/completions format.
// Only providers that speak OpenAI-compat can be listed here.
// Gemini native API is used directly in perplexityScout (not via invokeLLM).
const TASK_PRIORITY_MAP: Record<TaskType, ModelProvider[]> = {
  chinese_content: ["qwen", "zhipu", "azure-foundry"],
  creative_writing: ["zhipu", "qwen", "azure-foundry"],
  search_realtime:  ["qwen", "zhipu", "azure-foundry"],
  analysis:         ["qwen", "zhipu", "azure-foundry"],
  classification:   ["qwen", "zhipu", "azure-foundry"],
  coding:           ["qwen", "zhipu", "azure-foundry"],
  general:          ["qwen", "zhipu", "azure-foundry"],
};

const DEFAULT_MODELS: Record<ModelProvider, string> = {
  qwen: "qwen-plus",
  zhipu: "glm-4-flash",
  perplexity: "sonar-pro",
  google: "gemini-2.0-flash",
  cohere: "command-r-plus",
  openai: "gpt-4o-mini",
  forge: "gemini-2.5-flash",
  "azure-foundry": "gpt-4o",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-2.5-flash",
};

/**
 * Determine which providers are available based on configured API keys.
 * BUG-1 fix: references SCREAMING_SNAKE_CASE keys from the zod-validated ENV.
 */
function getAvailabilityMap(): Record<ModelProvider, boolean> {
  return {
    // Confirmed WORKING (probed 2026-05-04)
    qwen:            !!ENV.QWEN_API_KEY,
    zhipu:           !!ENV.ZHIPU_API_KEY,
    // azure-foundry: key restored 2026-05-04 (AZURE_FOUNDRY_API_KEY written directly to VM .env)
    "azure-foundry": !!(ENV as any).AZURE_FOUNDRY_API_KEY,
    // Force-disabled: confirmed broken via probe 2026-05-04
    // anthropic: 404 — uses /messages not /chat/completions (not OpenAI-compat)
    anthropic:       false,
    openai:          false,   // 401 — key expired
    perplexity:      false,   // 401 — all 5 keys quota exhausted
    google:          false,   // gemini-openai-compat 400; native API works but not via invokeLLM
    cohere:          false,   // 401 — key invalid
    forge:           false,   // no key on VM
    gemini:          false,   // 400/404 — openai-compat endpoint mismatch; native API works in perplexityScout
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
  // Last-resort fallback: qwen and zhipu are confirmed-working on VM (probed 2026-05-04).
  // Use qwen if key exists, otherwise zhipu, otherwise fail loudly.
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
 *
 * BUG-2 fix: delegates all HTTP/auth logic to invokeLLM() — no duplicate
 * fetch calls or provider config here.
 */
export async function callModel(
  messages: MultiModelMessage[],
  taskType?: TaskType,
  preferredProvider?: ModelProvider
): Promise<{ content: string; provider: ModelProvider; model: string }> {
  const availability = getAvailabilityMap();

  // Resolve provider + model
  let provider: ModelProvider;
  let model: string;

  if (preferredProvider) {
    // Soft mode: honor preferred provider when its key is set, otherwise
    // gracefully degrade to the task-type priority list (which now leads with
    // azure-foundry — the SoWork VM's verified-working route). Hard throws
    // here have been confirmed by the user to break the boardroom UX.
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

  // Delegate to the single authoritative LLM invoker
  const result = await invokeLLM({
    provider,
    model,
    messages,
  });

  const content = result.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("[multiModelRouter] Unexpected response structure from LLM");
  }

  return { content, provider, model };
}
