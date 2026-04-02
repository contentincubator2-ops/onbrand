/**
 * Brand Engine — Core brand positioning and strategy generation
 * Extracted from sowork-ai-v2, adapted for OpenClaw skill architecture
 */

import { invokeLLMWithBilling } from "../../ai-talent/server/llmWithBilling";
import { getSoworkDb } from "../../ai-talent/server/db";
import { sql } from "drizzle-orm";

export interface BrandAnalysisInput {
  userId: number;
  userApiKey: string;
  brandName: string;
  websiteUrl?: string;
  industry?: string;
  targetMarket?: string;
  contentLanguage?: string;
  competitors?: string[];
  existingPositioning?: string;
}

export interface BrandPositioningResult {
  positioning: string;           // 一句話定位
  valueProposition: string;      // 核心價值主張
  targetAudience: string;        // 目標受眾描述
  brandVoice: string;            // 品牌語調建議
  differentiators: string[];     // 差異化優勢列表
  messagingPillars: string[];    // 溝通支柱
  competitorAnalysis?: string;   // 競品分析摘要
  executiveSummary: string;      // 策略摘要
}

/**
 * Run full brand positioning analysis
 * Uses AI to generate positioning based on brand inputs
 */
export async function analyzeBrandPositioning(
  input: BrandAnalysisInput
): Promise<BrandPositioningResult> {
  const { userId, userApiKey, brandName, targetMarket, contentLanguage = 'zh-TW', competitors, existingPositioning } = input;

  const competitorSection = competitors?.length
    ? `\n主要競品：${competitors.join('、')}`
    : '';

  const existingSection = existingPositioning
    ? `\n現有定位描述：${existingPositioning}`
    : '';

  const systemPrompt = `你是一位世界級品牌策略顧問，專精品牌定位分析。
你的任務是為品牌提供完整的定位分析報告。
請以 ${contentLanguage === 'zh-TW' ? '繁體中文' : contentLanguage === 'zh-CN' ? '簡體中文' : 'English'} 回應。`;

  const userPrompt = `請為以下品牌進行完整的品牌定位分析：

品牌名稱：${brandName}
目標市場：${targetMarket ?? '台灣'}
行業：${input.industry ?? '未指定'}${competitorSection}${existingSection}

請提供：
1. 一句話品牌定位（15字以內）
2. 核心價值主張（3-5句）
3. 目標受眾畫像（具體描述）
4. 品牌語調建議（3個形容詞+說明）
5. 差異化優勢（3-5個要點）
6. 溝通支柱（3個核心訊息）
${competitors?.length ? '7. 競品定位對比分析' : ''}
8. 策略執行摘要（5-8句）`;

  const result = await invokeLLMWithBilling({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    provider: 'forge',
    model: 'gemini-2.5-flash',
    userId,
    userApiKey,
    actionType: 'strategy',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'brand_positioning',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            positioning: { type: 'string' },
            valueProposition: { type: 'string' },
            targetAudience: { type: 'string' },
            brandVoice: { type: 'string' },
            differentiators: { type: 'array', items: { type: 'string' } },
            messagingPillars: { type: 'array', items: { type: 'string' } },
            competitorAnalysis: { type: 'string' },
            executiveSummary: { type: 'string' },
          },
          required: ['positioning', 'valueProposition', 'targetAudience', 'brandVoice', 'differentiators', 'messagingPillars', 'executiveSummary'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = result.response.choices[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Brand positioning analysis failed');

  return JSON.parse(content) as BrandPositioningResult;
}

/**
 * Generate campaign positioning for a specific campaign
 */
export async function generateCampaignPositioning(opts: {
  userId: number;
  userApiKey: string;
  brandName: string;
  campaignGoal: string;
  targetAudience: string;
  budget?: string;
  duration?: string;
  channels?: string[];
  contentLanguage?: string;
}): Promise<{ concept: string; headlines: string[]; keyMessages: string[]; ctaOptions: string[]; channelStrategy: Record<string, string> }> {
  const { userId, userApiKey, brandName, campaignGoal, targetAudience, channels = ['Facebook', 'Instagram'], contentLanguage = 'zh-TW' } = opts;

  const result = await invokeLLMWithBilling({
    messages: [
      { role: 'system', content: `你是資深整合行銷顧問。以 ${contentLanguage} 輸出 JSON 格式的 Campaign 定位方案。` },
      { role: 'user', content: `品牌：${brandName}\n目標：${campaignGoal}\n受眾：${targetAudience}\n渠道：${channels.join('、')}` },
    ],
    provider: 'forge',
    model: 'gemini-2.5-flash',
    userId,
    userApiKey,
    actionType: 'strategy',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'campaign_positioning',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            concept: { type: 'string' },
            headlines: { type: 'array', items: { type: 'string' } },
            keyMessages: { type: 'array', items: { type: 'string' } },
            ctaOptions: { type: 'array', items: { type: 'string' } },
            channelStrategy: { type: 'object', additionalProperties: { type: 'string' } },
          },
          required: ['concept', 'headlines', 'keyMessages', 'ctaOptions', 'channelStrategy'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = result.response.choices[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Campaign positioning failed');
  return JSON.parse(content);
}
