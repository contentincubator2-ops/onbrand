/**
 * Brand Engine — Core brand positioning and strategy generation
 * Extracted from sowork-ai-v2, adapted for OpenClaw skill architecture
 */

import { invokeLLMWithBilling } from "../llmWithBilling";

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

// ── Content Calendar ──────────────────────────────────────────────────────────

export interface ContentCalendarInput {
  userId: number;
  userApiKey: string;
  brandName: string;
  targetMarket?: string;
  contentLanguage?: string;
  weeks?: number;       // 預設 4 週
  platforms?: string[]; // ['Facebook', 'Instagram', 'LinkedIn']
}

export interface ContentCalendarOutput {
  brandName: string;
  weeks: Array<{
    weekNumber: number;
    theme: string;
    posts: Array<{
      day: string;
      platform: string;
      contentType: string;
      headline: string;
      caption: string;
      hashtags: string[];
    }>;
  }>;
  contentStrategy: string;
}

export async function generateBrandContentCalendar(
  opts: ContentCalendarInput
): Promise<ContentCalendarOutput> {
  const {
    userId,
    userApiKey,
    brandName,
    targetMarket = '台灣',
    contentLanguage = 'zh-TW',
    weeks = 4,
    platforms = ['Facebook', 'Instagram'],
  } = opts;

  const langLabel =
    contentLanguage === 'zh-TW' ? '繁體中文' :
    contentLanguage === 'zh-CN' ? '簡體中文' : 'English';

  const result = await invokeLLMWithBilling({
    messages: [
      {
        role: 'system',
        content: `你是資深社群媒體策略師，專精多平台內容日曆規劃。請以 ${langLabel} 回應。`,
      },
      {
        role: 'user',
        content: `請為品牌「${brandName}」制定 ${weeks} 週的社群媒體內容日曆。
目標市場：${targetMarket}
平台：${platforms.join('、')}

每週需包含：
- 週主題（一句話）
- 每平台 2-3 篇貼文，含：發布日（星期幾）、平台、內容類型（教育/娛樂/促銷/互動）、標題、文案（50-100字）、Hashtag（3-6個）

請輸出 JSON。`,
      },
    ],
    provider: 'forge',
    model: 'gemini-2.5-flash',
    userId,
    userApiKey,
    actionType: 'strategy',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'content_calendar',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            brandName: { type: 'string' },
            contentStrategy: { type: 'string' },
            weeks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  weekNumber: { type: 'number' },
                  theme: { type: 'string' },
                  posts: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        day: { type: 'string' },
                        platform: { type: 'string' },
                        contentType: { type: 'string' },
                        headline: { type: 'string' },
                        caption: { type: 'string' },
                        hashtags: { type: 'array', items: { type: 'string' } },
                      },
                      required: ['day', 'platform', 'contentType', 'headline', 'caption', 'hashtags'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['weekNumber', 'theme', 'posts'],
                additionalProperties: false,
              },
            },
          },
          required: ['brandName', 'weeks', 'contentStrategy'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = result.response.choices[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Content calendar generation failed');
  return JSON.parse(content) as ContentCalendarOutput;
}

// ── Competitor Analysis ───────────────────────────────────────────────────────

export interface CompetitorAnalysisInput {
  userId: number;
  userApiKey: string;
  brandName: string;
  industry?: string;
  competitors?: string[];
  contentLanguage?: string;
}

export interface CompetitorAnalysisOutput {
  brandName: string;
  marketPosition: string;
  competitors: Array<{
    name: string;
    strengths: string[];
    weaknesses: string[];
    positioning: string;
    threat_level: 'high' | 'medium' | 'low';
  }>;
  opportunities: string[];
  recommendations: string[];
}

export async function analyzeBrandCompetitors(
  opts: CompetitorAnalysisInput
): Promise<CompetitorAnalysisOutput> {
  const {
    userId,
    userApiKey,
    brandName,
    industry = '未指定',
    competitors = [],
    contentLanguage = 'zh-TW',
  } = opts;

  const langLabel =
    contentLanguage === 'zh-TW' ? '繁體中文' :
    contentLanguage === 'zh-CN' ? '簡體中文' : 'English';

  const competitorSection = competitors.length
    ? `已知競品：${competitors.join('、')}\n`
    : '';

  const result = await invokeLLMWithBilling({
    messages: [
      {
        role: 'system',
        content: `你是世界級競品分析師，專精市場競爭策略。請以 ${langLabel} 回應。`,
      },
      {
        role: 'user',
        content: `請為品牌「${brandName}」進行完整競品分析。
產業：${industry}
${competitorSection}
分析內容：
1. 品牌在市場的當前定位（2-3句）
2. 3-5個主要競品，各自優勢（3點）、弱點（3點）、定位描述、威脅等級（high/medium/low）
3. 市場機會（3-5個）
4. 具體策略建議（3-5條）

請輸出 JSON。`,
      },
    ],
    provider: 'forge',
    model: 'gemini-2.5-flash',
    userId,
    userApiKey,
    actionType: 'strategy',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'competitor_analysis',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            brandName: { type: 'string' },
            marketPosition: { type: 'string' },
            competitors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  strengths: { type: 'array', items: { type: 'string' } },
                  weaknesses: { type: 'array', items: { type: 'string' } },
                  positioning: { type: 'string' },
                  threat_level: { type: 'string', enum: ['high', 'medium', 'low'] },
                },
                required: ['name', 'strengths', 'weaknesses', 'positioning', 'threat_level'],
                additionalProperties: false,
              },
            },
            opportunities: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
          required: ['brandName', 'marketPosition', 'competitors', 'opportunities', 'recommendations'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = result.response.choices[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Competitor analysis failed');
  return JSON.parse(content) as CompetitorAnalysisOutput;
}

// ── Campaign Positioning ──────────────────────────────────────────────────────

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
