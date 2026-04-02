# AI Talent Skill

> Enterprise AI marketing team as a service. Powered by 4,654+ specialized AI agents.

## Description

An AI-powered marketing team that matches the best AI agents to your tasks, executes them with real-time market intelligence, and learns your brand over time.

## Usage

### From Slack/LINE/WhatsApp (via OpenClaw Gateway)

```
@assistant 幫我做一個品牌定位分析，品牌名稱：SoWork AI，目標市場：台灣
```

### Via API

```bash
POST /trpc/workflow.create
POST /trpc/market.setMarket
GET  /trpc/market.listMarkets
GET  /health
```

## Features

- 4,654 AI agents with specialized knowledge bases
- Real-time market intelligence (93K+ data points)
- Multi-market support (13 markets × 16 languages)
- A2A (Agent-to-Agent) automated workflows
- Token-aware billing (7 AI providers)
- Brand learning system (gets smarter over time)

## Environment Variables

See `.env.example` for all required variables.

## Quick Start

```bash
npm install
npm run dev
curl http://localhost:3001/health
```
