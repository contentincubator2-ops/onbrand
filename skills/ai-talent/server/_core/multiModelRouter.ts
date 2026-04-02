/**
 * Multi-Model AI Router
 * Automatically selects the best AI model based on task type and available API keys.
 */

import { ENV } from "./env";

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

interface ModelConfig {
  provider: ModelProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  available: boolean;
}

function getModelConfigs(): Record<ModelProvider, ModelConfig> {
  return {
    qwen: {
      provider: "qwen",
      baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      apiKey: ENV.qwenApiKey,
      model: "qwen-plus",
      available: !!ENV.qwenApiKey,
    },
    zhipu: {
      provider: "zhipu",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: ENV.zhipuApiKey,
      model: "glm-4-flash",
      available: !!ENV.zhipuApiKey,
    },
    perplexity: {
      provider: "perplexity",
      baseUrl: "https://api.perplexity.ai",
      apiKey: ENV.perplexityApiKey,
      model: "llama-3.1-sonar-large-128k-online",
      available: !!ENV.perplexityApiKey,
    },
    google: {
      provider: "google",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: ENV.googleAiApiKey,
      model: "gemini-2.0-flash",
      available: !!ENV.googleAiApiKey,
    },
    cohere: {
      provider: "cohere",
      baseUrl: "https://api.cohere.com/compatibility/v1",
      apiKey: ENV.cohereApiKey,
      model: "command-r-plus",
      available: !!ENV.cohereApiKey,
    },
    openai: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: ENV.openaiApiKey,
      model: "gpt-4o-mini",
      available: !!ENV.openaiApiKey,
    },
    forge: {
      provider: "forge",
      baseUrl: ENV.forgeApiUrl + "/llm/v1",
      apiKey: ENV.forgeApiKey,
      model: "default",
      available: !!ENV.forgeApiKey,
    },
  };
}

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

export function selectModel(taskType: TaskType): ModelConfig {
  const configs = getModelConfigs();

  const priorityMap: Record<TaskType, ModelProvider[]> = {
    chinese_content: ["qwen", "zhipu", "openai", "forge"],
    creative_writing: ["zhipu", "qwen", "openai", "forge"],
    search_realtime: ["perplexity", "google", "openai", "forge"],
    analysis: ["google", "openai", "cohere", "qwen", "forge"],
    classification: ["cohere", "openai", "google", "forge"],
    coding: ["openai", "google", "forge"],
    general: ["openai", "qwen", "google", "forge"],
  };

  const priorities = priorityMap[taskType];
  for (const provider of priorities) {
    const config = configs[provider];
    if (config.available) {
      return config;
    }
  }

  return configs.forge;
}

export interface MultiModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callModel(
  messages: MultiModelMessage[],
  taskType?: TaskType,
  preferredProvider?: ModelProvider
): Promise<{ content: string; provider: ModelProvider; model: string }> {
  const configs = getModelConfigs();

  let config: ModelConfig;
  if (preferredProvider && configs[preferredProvider].available) {
    config = configs[preferredProvider];
  } else {
    const type = taskType ?? detectTaskType(
      messages.map(m => m.content).join(" ")
    );
    config = selectModel(type);
  }

  const payload = {
    model: config.model,
    messages,
    temperature: 0.7,
    max_tokens: 4096,
  };

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown error");
    if (config.provider !== "forge") {
      console.warn(`[MultiModelRouter] ${config.provider} failed (${response.status}), falling back to forge`);
      const forgeConfig = configs.forge;
      const forgeResponse = await fetch(`${forgeConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${forgeConfig.apiKey}`,
        },
        body: JSON.stringify({ ...payload, model: "default" }),
        signal: AbortSignal.timeout(60000),
      });
      if (!forgeResponse.ok) {
        throw new Error(`All models failed. Last error: ${errText}`);
      }
      const forgeData = await forgeResponse.json() as { choices: Array<{ message: { content: string } }> };
      return {
        content: forgeData.choices[0].message.content,
        provider: "forge",
        model: "default",
      };
    }
    throw new Error(`Model call failed: ${response.status} ${errText}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return {
    content: data.choices[0].message.content,
    provider: config.provider,
    model: config.model,
  };
}
