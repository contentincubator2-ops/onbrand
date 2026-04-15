# Brand Engine Skill

> Core brand positioning and campaign strategy generation. Powered by sowork-ai-v2 logic, adapted for OpenClaw skill architecture.

## Description

Brand Engine provides AI-powered brand positioning analysis and campaign strategy generation for marketing teams. It combines insights from brand inputs, competitor data, and market context to produce actionable positioning frameworks.

## Features

- **Brand Positioning Analysis** — Full positioning report including one-liner, value proposition, target audience, brand voice, differentiators, and messaging pillars
- **Campaign Positioning** — Campaign concept, headlines, key messages, CTAs, and channel-specific strategies
- **Multi-language Support** — Supports zh-TW, zh-CN, and English output
- **Competitor Analysis** — Optional competitor positioning comparison
- **13 markets × 16 languages** — Inherited from sowork-ai-v2 globalization layer

## API

### `analyzeBrandPositioning(input: BrandAnalysisInput): Promise<BrandPositioningResult>`

Run a full brand positioning analysis.

**Input:**
```typescript
{
  userId: number;
  userApiKey: string;
  brandName: string;
  websiteUrl?: string;
  industry?: string;
  targetMarket?: string;       // default: '台灣'
  contentLanguage?: string;    // default: 'zh-TW'
  competitors?: string[];      // up to 5 competitors
  existingPositioning?: string;
}
```

**Output:**
```typescript
{
  positioning: string;         // 一句話定位 (≤15 chars)
  valueProposition: string;    // 核心價值主張
  targetAudience: string;      // 目標受眾描述
  brandVoice: string;          // 品牌語調建議
  differentiators: string[];   // 差異化優勢 (3-5 items)
  messagingPillars: string[];  // 溝通支柱 (3 items)
  competitorAnalysis?: string; // 競品分析摘要 (if competitors provided)
  executiveSummary: string;    // 策略執行摘要
}
```

### `generateCampaignPositioning(opts): Promise<CampaignResult>`

Generate a campaign positioning plan.

**Input:**
```typescript
{
  userId: number;
  userApiKey: string;
  brandName: string;
  campaignGoal: string;
  targetAudience: string;
  budget?: string;
  duration?: string;
  channels?: string[];         // default: ['Facebook', 'Instagram']
  contentLanguage?: string;    // default: 'zh-TW'
}
```

**Output:**
```typescript
{
  concept: string;
  headlines: string[];
  keyMessages: string[];
  ctaOptions: string[];
  channelStrategy: Record<string, string>;
}
```

## tRPC Endpoints

```
POST /trpc/brand.analyzeBrand     — Run brand positioning analysis
POST /trpc/brand.generateCampaign — Generate campaign positioning
```

## Usage via OpenClaw Gateway

```
@assistant 幫我做一個品牌定位分析，品牌名稱：SoWork AI，目標市場：台灣
@assistant 為 SoWork 品牌生成一個 Q3 社群行銷 Campaign 方案
```

## Source

Core logic extracted and adapted from:
- `sowork-ai-v2/server/brandPositioningAnalysis.ts`
- `sowork-ai-v2/server/brandStrategyReportGenerator.ts` (v2)
- `sowork-ai-v2/server/campaignPositioningAnalysisEngine.ts`

## Environment Variables

Inherits from `skills/ai-talent/.env.example` — no additional variables required.
