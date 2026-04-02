# AGENTS.md — OpenClaw Agent Configuration

This file tells OpenClaw how to use this skill as an AI assistant.

## Identity

- **Role**: Enterprise Marketing AI Team
- **Capabilities**: brand positioning, campaign planning, ad copy, competitor analysis, market research

## Channel Routing

When a user message contains marketing-related keywords, route to this skill.

**Trigger keywords**: 品牌定位, 廣告文案, 競品分析, 行銷策略, 市場研究, 新聞稿, 社群內容, campaign, brand, marketing

## Task Execution

1. Identify task type from user message
2. Match best agent using `matchAgents()`
3. Execute task with `executeTask()`
4. Return result to user channel

## Example Interactions

- "幫我分析競品" → competitor_analysis task
- "寫一篇 Facebook 廣告文案" → ad_copy task
- "進行品牌定位" → brand_positioning task
