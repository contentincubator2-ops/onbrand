---
name: slogan-skills
description: "10 proven tagline/slogan generation methodology squads for SoWork Marketing Claw. Each squad follows a strict 7-step methodology workflow to generate taglines — from brand analysis through candidate generation, testing, and final delivery. Covers: imperative, descriptive-value, superlative, promise, problem-solution, emotional-storytelling, mission-declaration, provocative-interrogative, storybrand-oneliner, and sensory-wordplay methods. Use when a brand needs AI-powered tagline creation following established marketing methodology frameworks."
metadata:
  author: SoWork
  version: '1.0'
  platform: app.sowork.ai
  squad_count: '10'
---

# Slogan Skills — 標語方法論 AI Squad 開發藍圖

> 10 個經實證能提升業績的標語生成方法論，各自設計成嚴格步驟流程的 Squad + Workflow Template。

## Overview

This skill module defines 10 marketing squads, each dedicated to a specific tagline generation methodology. Every squad enforces a strict 7-step workflow that an AI agent team must follow sequentially — no shortcuts allowed.

## Squad Registry

| # | Slug | 方法論 | 參考案例 | Token 估算 |
|---|------|--------|----------|-----------|
| 1 | `sowork-slogan-imperative` | 祈使句法 | Nike "Just Do It" | 80,000 |
| 2 | `sowork-slogan-descriptive-value` | 描述價值法 | Dollar Shave Club | 85,000 |
| 3 | `sowork-slogan-superlative` | 最高級宣稱法 | BMW "Ultimate Driving Machine" | 90,000 |
| 4 | `sowork-slogan-promise` | 對你的承諾法 | L'Oréal "Because You're Worth It" | 80,000 |
| 5 | `sowork-slogan-problem-solution` | 問題解決法 | Headspace | 85,000 |
| 6 | `sowork-slogan-emotional-story` | 情緒敘事法 | Mastercard "Priceless" | 95,000 |
| 7 | `sowork-slogan-mission` | 使命宣言法 | TOMS "One for One" | 80,000 |
| 8 | `sowork-slogan-provocative` | 挑釁提問法 | "Got Milk?" | 85,000 |
| 9 | `sowork-slogan-storybrand` | 英雄旅程法 | StoryBrand One-Liner | 90,000 |
| 10 | `sowork-slogan-sensory-wordplay` | 感官雙關法 | Skittles "Taste the Rainbow" | 90,000 |

## Architecture

Each squad consists of:
- **Squad Lead** — 品牌標語策略師：負責 Intake、QA、最終交付
- **Brand Analyst** — 品牌分析師：品牌核心價值、DNA、定位分析
- **Consumer Researcher** — 消費者研究員：受眾洞察、動機分析、情緒地圖
- **Copywriter** — 文案創意師：標語候選生成、句型設計、文字工藝
- **Testing Specialist** — 測試評分師：節奏測試、情緒評分、文化檢查

## Workflow Pattern (All 10 Squads)

```
Step 1: Squad Lead Intake — 方法論 Brief + 品牌輸入確認
Step 2: Brand/Audience Deep Analysis — 方法論特定的深度分析
Step 3: Framework Construction — 方法論框架建構
Step 4: Tagline Candidate Generation — 最少 20 個候選標語
Step 5: Quantitative Testing — 量化評分（節奏/情緒/差異化）
Step 6: Validation & Calibration — 跨文化/延展性/合法性驗證
Step 7: Squad Lead QA + Final Delivery — Top 5 + 最終推薦 + 部署指南
```

## Database Schema

Squads are stored in `agent_squads` table. Workflow templates in `squad_workflow_templates`.

See `scripts/seed-slogan-squads.ts` for the complete seed data.

## Usage

```bash
# Seed squads into local database
npx tsx scripts/seed-slogan-squads.ts

# Or via npm script
npm run db:seed-slogans
```

## Integration with SoWork Marketing Claw

These squads integrate with:
- `squadRecommender.ts` — auto-recommended when user mentions tagline/slogan/標語
- `squadLeaderWorker.ts` — executes the 7-step workflow via queue
- `brand-engine` skill — provides brand positioning data as input

## OpenClaw Skill Specs

Each methodology also has a standalone SKILL.md in `/skills/sowork-{method}-tagline/` for ClawHub publishing.
