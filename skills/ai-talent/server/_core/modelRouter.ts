/**
 * modelRouter.ts — 多層模型路由系統
 * Primary: Azure AI Foundry (OpenAI compatible)
 * Fallback: OpenRouter (when Azure models not deployed)
 *
 * Azure AI Foundry 目前未部署模型（DeploymentNotFound），
 * 所以暫時用 openrouter 作為 fallback。
 * 當 Azure 部署好模型後，把 provider 改回 'azure-foundry' 即可。
 */

import { ENV } from "./env";

export type TaskType =
  | "brand_onboarding"
  | "market_analysis"
  | "content_generation"
  | "data_analysis"
  | "campaign_planning"
  | "general";

export interface ModelConfig {
  provider: string;
  model: string;
  label: string;
  reason: string;
}

// Azure AI Foundry 是否可用（有 API key 才啟用）
const AZURE_AVAILABLE = !!(ENV as any).AZURE_FOUNDRY_API_KEY;

export const TASK_MODEL_MAP: Record<TaskType, ModelConfig> = {
  brand_onboarding: {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    reason: "最佳品牌策略分析、長文輸出、結構化報告",
  },
  market_analysis: {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    reason: "市場數據分析、結構化輸出",
  },
  content_generation: {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    reason: "內容生成、中文輸出",
  },
  data_analysis: {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    reason: "數據分析、計算、A/B test 設計",
  },
  campaign_planning: {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    reason: "廣告活動創意策略",
  },
  general: {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    reason: "輕量任務、成本最低",
  },
};

export const PM_MODEL: ModelConfig = {
  provider: 'openrouter',
  model: 'anthropic/claude-sonnet-4-6',
  label: 'Claude Sonnet 4.6',
  reason: "任務理解、分類、路由",
};

export function getModelForTask(taskType: TaskType): ModelConfig {
  return TASK_MODEL_MAP[taskType] ?? TASK_MODEL_MAP.general;
}

export function inferTaskType(taskDescription: string): TaskType {
  const text = taskDescription.toLowerCase();
  if (/品牌定位|產品定位|活動定位|brand.*positioning|product.*positioning|onboarding|品牌分析|定位書|標語/.test(text)) {
    return "brand_onboarding";
  }
  if (/市場分析|競品|競爭|market.*analys|competitor|industry|產業報告|市場規模/.test(text)) {
    return "market_analysis";
  }
  if (/寫.*文案|社群.*貼文|content.*generat|文章|文案|貼文|Instagram|Facebook|LinkedIn|IG|FB/.test(text)) {
    return "content_generation";
  }
  if (/a\/b.*test|ab.*測試|數據|data.*analys|roi|ctr|轉換率|conversion|dashboard/.test(text)) {
    return "data_analysis";
  }
  if (/廣告|campaign|投放|ads|media.*plan|活動規劃/.test(text)) {
    return "campaign_planning";
  }
  return "general";
}
