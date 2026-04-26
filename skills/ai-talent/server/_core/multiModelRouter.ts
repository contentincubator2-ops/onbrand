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

// NOTE: google + cohere removed from priority lists — Google generative API
// key is blocked by service policy (API_KEY_SERVICE_BLOCKED 403) and Cohere
// key in prod env returns 401. Re-enable once those are fixed.
// Azure Foundry is the canonical "always works" route on the SoWork VM
// (project endpoint + AZURE_FOUNDRY_API_KEY are baked in to llm.ts default).
// We list it FIRST for every task type so the boardroom never silently dies
// when forge / qwen / zhipu env keys aren't set on a deployment.
const TASK_PRIORITY_MAP: Record<TaskType, ModelProvider[]> = {
  chinese_content: ["azure-foundry", "qwen", "zhipu", "forge", "openai"],
  creative_writing: ["azure-foundry", "zhipu", "qwen", "forge", "openai"],
  search_realtime: ["perplexity", "azure-foundry", "forge", "openai"],
  analysis: ["azure-foundry", "qwen", "zhipu", "forge", "openai"],
  classification: ["azure-foundry", "qwen", "zhipu", "forge", "openai"],
  coding: ["azure-foundry", "forge", "openai"],
  general: ["azure-foundry", "forge", "qwen", "zhipu", "openai"],
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
    qwen:           !!ENV.QWEN_API_KEY,
    zhipu:          !!ENV.ZHIPU_API_KEY,
    perplexity:     !!ENV.PERPLEXITY_API_KEY,
    // google + cohere are force-disabled — see TASK_PRIORITY_MAP comment
    google:         false,
    cohere:         false,
    openai:         !!ENV.OPENAI_API_KEY,
    forge:          !!ENV.BUILT_IN_FORGE_API_KEY,
    // Azure Foundry: project endpoint defaults via llm.ts even without env;
    // only a missing API key truly breaks it.
    "azure-foundry": !!(ENV as any).AZURE_FOUNDRY_API_KEY,
    anthropic:      !!(ENV as any).ANTHROPIC_API_KEY,
    gemini:         !!((ENV as any).GEMINI_API_KEY || (ENV as any).GOOGLE_AI_API_KEY),
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
  // Last-resort fallback: azure-foundry has a baked-in endpoint default in
  // llm.ts and is the only provider that works on the SoWork VM out-of-the-box
  // when other env keys aren't set.
  return "azure-foundry";
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
