# AI Talent Skill

AI 人才即服務（AI Talent as a Service）— SoWork Marketing Enterprise 核心引擎。

## 功能概覽

| 模組 | 說明 |
|------|------|
| **CMO Agent** | 品牌策略規劃、競品分析、提案產出 |
| **策略 PM** | 管道策略（SEO / Meta / 短影音 / PR） |
| **執行 Specialist** | 文案、廣告素材、新聞稿、社群貼文 |
| **A2A Workflow** | 任務完成自動觸發下游任務（Trigger Chains） |
| **Agent Learnings** | 越用越懂品牌的持續學習知識庫 |
| **Token Ledger** | 每次 LLM 呼叫完整記帳，計算成本與 Credits |
| **Multi-Market** | 多語系市場設定（台灣 / 德國 / 新加坡等） |

---

## 目錄結構

```
skills/ai-talent/
├── SKILL.md                    ← 本文件
├── drizzle/
│   └── schema.ts               ← DB Schema（MySQL / Drizzle ORM）
└── server/
    ├── executeTask.ts           ← 任務執行主流程
    ├── triggerWorkflows.ts      ← A2A 工作流觸發器
    ├── learning.ts              ← Agent 學習記錄寫入
    ├── rag.ts                   ← RAG 知識庫查詢
    ├── creditsCalculator.ts     ← Credits 用量計算
    ├── deductCredits.ts         ← Credits 扣除邏輯
    ├── notificationService.ts   ← 多管道通知（Email/LINE/Telegram）
    ├── tokenLedger.ts           ← Token 用量帳本（新增）
    ├── llmWithBilling.ts        ← Billing-aware LLM wrapper（新增）
    ├── _core/
    │   ├── llm.ts               ← 底層 LLM 呼叫介面
    │   ├── multiModelRouter.ts  ← 多 Provider 路由（OpenAI/ZhipuAI/Qwen…）
    │   └── env.ts               ← 環境變數型別定義
    └── routers/
        └── workflow.ts          ← tRPC / REST workflow 路由
```

---

## 資料庫 Tables（drizzle/schema.ts）

### 從 ai-claw-team-v1 移植的 Tables

| Table | 說明 |
|-------|------|
| `agents` | AI 員工定義（slug, 技能, 定價, 評分） |
| `brands` | 品牌檔案（名稱, URL, 社群, 語氣設定） |
| `tasks` | 任務（標題, 狀態, 優先級, 觸發工作流） |
| `task_executions` | 每次任務執行記錄（prompt, output, 時長） |
| `task_workflows` | A2A 自動觸發工作流定義 |
| `agent_learnings` | Agent 學習記錄（品牌私有 or 公共共享） |
| `subscriptions` | 用戶聘用的 AI 員工（per_task/monthly/team） |
| `user_credits` | 用戶點數餘額（plan credits + extra credits） |
| `credits_usage_log` | 點數消耗明細記錄 |
| `enterprise_credits_pool` | 企業版共用點數池 |
| `enterprise_members` | 企業版工作區成員管理 |

### 新增 Tables（Enterprise 專屬）

| Table | 說明 |
|-------|------|
| `token_usage_logs` | 每次 LLM API 呼叫的原始 Token 帳本 |
| `user_api_keys` | 用戶 API 金鑰管理（格式：`sw-xxxxxxxxxxxxxxxx`） |
| `tenant_markets` | 多市場設定（語言、合規旗標如 GDPR） |

---

## API Endpoints

### 任務執行

```
POST /api/tasks/:id/execute
  → executeTask(taskId, userId, agentSlug)
  → 自動記錄 token log + 扣 credits
```

### 工作流

```
POST /api/workflows           → 建立 A2A 工作流
GET  /api/workflows           → 列出用戶工作流
PATCH /api/workflows/:id      → 更新工作流
DELETE /api/workflows/:id     → 刪除工作流
POST /api/workflows/:id/trigger → 手動觸發
```

### Token 用量查詢

```
GET /api/billing/token-summary?days=30
  → getUserTokenSummary(userId, days)
  → 回傳：provider、model、token 量、USD 成本、Credits 消耗

GET /api/billing/daily-usage?days=30
  → getUserDailyUsage(userId, days)
  → 回傳：每日 token 量、成本、Credits 消耗（for charts）
```

### API 金鑰管理

```
POST   /api/keys            → 建立新 API Key（格式：sw-xxxxxxxx）
GET    /api/keys            → 列出用戶所有 Keys
DELETE /api/keys/:id        → 撤銷 Key
```

---

## 環境變數

| 變數名 | 必填 | 說明 |
|--------|------|------|
| `DATABASE_URL` | ✅ | MySQL 連線字串（`mysql://user:pass@host/db`） |
| `OPENAI_API_KEY` | ✅ | OpenAI API Key |
| `ZHIPU_API_KEY` | ☑️ | 智譜 AI API Key（ZhipuAI/GLM-4） |
| `QWEN_API_KEY` | ☑️ | 阿里雲通義千問 API Key |
| `PERPLEXITY_API_KEY` | ☑️ | Perplexity AI API Key |
| `GOOGLE_AI_API_KEY` | ☑️ | Google Gemini API Key |
| `COHERE_API_KEY` | ☑️ | Cohere API Key |
| `FORGE_API_KEY` | ☑️ | Forge LLM API Key |
| `RESEND_API_KEY` | ☑️ | Email 通知（Resend） |
| `LINE_NOTIFY_TOKEN` | ☑️ | LINE Notify 通知 |
| `TELEGRAM_BOT_TOKEN` | ☑️ | Telegram Bot 通知 |
| `R2_ACCESS_KEY_ID` | ☑️ | Cloudflare R2 Storage |
| `R2_SECRET_ACCESS_KEY` | ☑️ | Cloudflare R2 Storage |
| `R2_BUCKET_NAME` | ☑️ | R2 Bucket 名稱 |

> ☑️ = 依功能選填；若對應功能未啟用可不填

---

## Token Billing 機制

### 費率計算

```typescript
// 定價（每 1K tokens，USD）
openai:     { input: $0.0025, output: $0.010 }
zhipu:      { input: $0.0010, output: $0.0010 }
qwen:       { input: $0.0008, output: $0.0020 }
perplexity: { input: $0.0010, output: $0.0010 }
google:     { input: $0.000075, output: $0.0003 }

// 換算公式
rawCostUsd = (promptTokens/1000 * input) + (completionTokens/1000 * output)
creditsCharged = ceil(rawCostUsd * 5.0 * 100)
// Markup = 5x；1 USD = 100 credits
```

### 使用 invokeLLMWithBilling

```typescript
import { invokeLLMWithBilling } from "./server/llmWithBilling";

const { response, usage, creditsCharged } = await invokeLLMWithBilling({
  messages: [...],
  model: "gpt-4o",
  provider: "openai",
  userId: 123,
  userApiKey: "sw-abc123",
  actionType: "task_execution",
  taskId: 456,
  agentId: 7,
});
// Token log 自動寫入，Credits 自動扣除
```

---

## 來源

移植自 [sowork-dev/ai-claw-team-v1](https://github.com/sowork-dev/ai-claw-team-v1)（private）  
Sprint 1 由 SoWork Engineering Team 執行（2026-04-02）
