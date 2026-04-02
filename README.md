# 🦞 SoWork Marketing Enterprise

> 企業級 AI 行銷平台，基於 [OpenClaw](https://github.com/openclaw/openclaw)

## 什麼是 SoWork Marketing Enterprise？

**SoWork Marketing Enterprise = 一個懂你品牌、在全球多個市場同時運作、任務完成後自動觸發下一個任務、越用越聰明的 AI 行銷團隊。**

競品做的是「AI 工具」。我們做的是「AI 員工組成的行銷部門，自主運營」。

## 核心差異

| 能力 | 一般 AI 工具 | SoWork Enterprise |
|------|------------|-------------------|
| 品牌記憶 | ❌ 每次從零 | ✅ 越用越懂你（RAG + Learning） |
| 多 Agent 協作 | ❌ 單一對話 | ✅ CMO → PM → Specialist 三層分工 |
| A2A 自動工作流 | ❌ 需手動觸發 | ✅ 任務完成自動觸發下游任務 |
| 多市場支援 | ❌ | ✅ 13 市場 × 16 語言同步運作 |
| 企業多租戶 | ❌ | ✅ 品牌/產品/市場完整隔離 |

## 架構

```
OpenClaw Gateway（Slack / LINE / Telegram / WhatsApp...）
         ↓
SoWork Enterprise Skills
├── skill-ai-talent      — AI 人才三層架構 + A2A 工作流
├── skill-brand-engine   — 品牌定位 + Campaign + 廣告素材
├── skill-market-intel   — 全球新聞情報 + 市場分析
└── skill-enterprise-tenant — 多租戶 + 計費 + Onboarding
         ↓
Data Layer（RAG + Brand DB + Learning）
```

## Skill 模組說明

### `skill-ai-talent`
AI 人才即服務（AI Talent as a Service）
- CMO Agent：品牌策略、市場分析
- 策略 PM：管道策略（SEO / Meta / 短影音 / PR）
- 執行 Specialist：文案、廣告素材、新聞稿
- A2A Workflow：任務完成自動觸發下游任務

### `skill-brand-engine`
品牌引擎（從 sowork-ai-v2 提煉）
- 品牌定位分析
- Campaign 規劃
- 廣告素材生成
- 13 市場 × 16 語言支援

### `skill-market-intel`
市場情報（從 news-sowork 提煉）
- 全球 50+ RSS 來源即時抓取
- AI 新聞分群 + 重大事件標記
- 品牌回應建議自動生成

### `skill-enterprise-tenant`
企業多租戶管理
- Slack/LINE/Telegram Onboarding
- 三層知識庫（公司/部門/個人）
- Stripe 計費整合

## 文件

- [架構設計文件](docs/ARCHITECTURE.md)
- [開發指南](docs/CONTRIBUTING.md)（即將推出）
- [API 文件](docs/API.md)（即將推出）

## 技術棧

- **Runtime:** Node.js 22+, TypeScript
- **Framework:** Express + tRPC
- **Frontend:** React 19 + Vite + TailwindCSS + shadcn/ui
- **Database:** MySQL 8.0 + Drizzle ORM
- **AI:** OpenRouter / 智譜 GLM / 通義千問（多模型路由）
- **RAG:** Azure AI Search
- **Platform:** OpenClaw Gateway

## 快速開始

```bash
pnpm install
cp .env.example .env
# 填入 .env 設定值
pnpm dev
```

## 相關 Repo

| Repo | 用途 |
|------|------|
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | 平台地基 |
| [sowork-dev/ai-claw-team-v1](https://github.com/sowork-dev/ai-claw-team-v1) | AI Talent 核心引擎 |
| [sowork-dev/sowork-ai-v2](http://gitlab.sowork.ai/chen/sowork-ai-v2) | 品牌引擎 |
| [sowork-dev/ai-mobile-team](https://github.com/sowork-dev/ai-mobile-team) | Mobile UI + Orchestration |
| [biombacj-cell/news-sowork](https://github.com/biombacj-cell/news-sowork) | 市場情報 |

---

*Built on [OpenClaw](https://openclaw.ai) 🦞*
