# Token 計費架構設計

> 多 API 來源下的統一 Token 追蹤 + 用戶識別碼系統
> 版本：v1.0 | 2026-04-02

---

## 問題定義

平台同時接入多個 AI API：

| Provider | 計費單位 | 成本差異 |
|---------|---------|---------|
| OpenAI GPT-4o | per 1K tokens | 高 |
| Zhipu GLM-4 | per 1K tokens | 中 |
| Qianwen Plus | per 1K tokens | 中 |
| Perplexity Sonar | per 1K tokens | 中（含搜尋費） |
| Google Gemini Flash | per 1K tokens | 低 |
| Cohere Command-R+ | per 1K tokens | 中 |
| Azure AI Search (RAG) | per query | 固定費 |
| Recraft V3 (圖片) | per image | 固定費 |

**核心需求：**
1. 每個用戶有獨立識別碼
2. 每次 API 呼叫記錄：哪個用戶、哪個 Provider、用了多少 Token
3. 各 Provider Token → 統一 Credits 換算
4. 即時餘額查詢，防止超額

---

## 架構設計

### Layer 1：用戶識別碼系統

```
每個用戶在系統中有：
├── userId (DB primary key)
├── userApiKey: "sw-xxxxxxxxxxxxxxxx"  ← 對外識別碼（16位隨機）
└── tenantId（企業方案）
```

`userApiKey` 是用戶呼叫平台 API 時的唯一識別碼，也是 Token 帳本的 key。

### Layer 2：Token 帳本（Token Ledger）

每次 AI API 呼叫，記錄一筆原始 Token Log：

```typescript
interface TokenUsageLog {
  id: string;                    // UUID
  userId: number;
  userApiKey: string;            // 用戶識別碼
  tenantId?: number;             // 企業租戶

  // 任務上下文
  taskId?: number;
  agentId?: number;
  actionType: ActionType;

  // API 呼叫資訊
  provider: ModelProvider;       // 'openai' | 'zhipu' | 'qwen' | 'perplexity' | 'google' | ...
  model: string;                 // 實際使用的模型名稱
  promptTokens: number;          // 輸入 tokens
  completionTokens: number;      // 輸出 tokens
  totalTokens: number;           // 總計

  // 成本換算
  rawCostUSD: number;            // 實際 API 成本（美元）
  markupFactor: number;          // 加成倍率（預設 5x）
  creditsCharged: number;        // 扣除的 Credits

  // 時間
  createdAt: Date;
  latencyMs: number;             // API 延遲
}
```

### Layer 3：跨 Provider Token → Credits 換算表

```typescript
// 各 Provider 每 1K tokens 的美元成本（2026 Q1）
export const PROVIDER_COST_PER_1K_TOKENS: Record<ModelProvider, {
  input: number;   // USD per 1K prompt tokens
  output: number;  // USD per 1K completion tokens
}> = {
  openai: { input: 0.0025, output: 0.010 },   // gpt-4o-mini
  zhipu: { input: 0.0010, output: 0.0010 },    // glm-4-flash
  qwen: { input: 0.0008, output: 0.0020 },     // qwen-plus
  perplexity: { input: 0.0010, output: 0.0010 }, // sonar
  google: { input: 0.000075, output: 0.0003 }, // gemini-flash
  cohere: { input: 0.0003, output: 0.0006 },   // command-r+
  forge: { input: 0.0005, output: 0.0015 },
};

// 換算公式
// Credits = (rawCostUSD × markupFactor × exchangeRate) / CREDITS_UNIT_VALUE
// CREDITS_UNIT_VALUE = NT$0.01 per credit
// markupFactor = 5x（成本 × 5，MEMORY.md 中的 Stripe 設定）
// exchangeRate = 動態（ExchangeRate API）
```

### Layer 4：即時扣點流程

```
用戶發起任務
    ↓
1. 餘額預檢（Pre-flight check）
   estimatedCost = estimateCredits(actionType, agentLayer)
   if (remainingCredits < estimatedCost) → 拒絕，提示充值
    ↓
2. 執行 AI 呼叫（invokeLLM）
   記錄實際 token 用量
    ↓
3. 精確計費（Post-execution billing）
   actualCost = calcFromTokens(provider, promptTokens, completionTokens)
   deductCredits(userId, actualCost)
    ↓
4. 寫入 token_usage_logs
   更新 user_credits.usedCredits
    ↓
5. 企業方案：同步扣除 enterprise_credits_pool
```

---

## DB Schema

```sql
-- 用戶 API Key 識別碼
CREATE TABLE user_api_keys (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  api_key     VARCHAR(64) NOT NULL UNIQUE,  -- 'sw-xxxxxxxxxxxxxxxx'
  label       VARCHAR(100),                 -- 顯示名稱（如「主要金鑰」）
  is_active   BOOLEAN DEFAULT TRUE,
  last_used   DATETIME,
  created_at  DATETIME DEFAULT NOW(),
  INDEX idx_api_key (api_key),
  INDEX idx_user (user_id)
);

-- 原始 Token 使用記錄（帳本）
CREATE TABLE token_usage_logs (
  id                VARCHAR(36) PRIMARY KEY,  -- UUID
  user_id           INT NOT NULL,
  user_api_key      VARCHAR(64) NOT NULL,
  tenant_id         INT,
  task_id           INT,
  agent_id          INT,
  action_type       VARCHAR(50),

  provider          VARCHAR(30) NOT NULL,
  model             VARCHAR(80) NOT NULL,
  prompt_tokens     INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens      INT NOT NULL DEFAULT 0,

  raw_cost_usd      DECIMAL(10, 6) NOT NULL DEFAULT 0,
  markup_factor     DECIMAL(5, 2) NOT NULL DEFAULT 5.0,
  credits_charged   INT NOT NULL DEFAULT 0,

  latency_ms        INT,
  created_at        DATETIME DEFAULT NOW(),

  INDEX idx_user_date (user_id, created_at),
  INDEX idx_tenant_date (tenant_id, created_at),
  INDEX idx_provider (provider, created_at)
);

-- 用戶計費儀表板 view（快速查詢）
CREATE VIEW v_user_token_summary AS
SELECT
  user_id,
  provider,
  DATE(created_at)          AS usage_date,
  SUM(total_tokens)         AS total_tokens,
  SUM(raw_cost_usd)         AS total_cost_usd,
  SUM(credits_charged)      AS total_credits,
  COUNT(*)                  AS api_calls
FROM token_usage_logs
GROUP BY user_id, provider, DATE(created_at);
```

---

## 程式實作：Token-Aware LLM Wrapper

`invokeLLM` 需要包裝成會自動記帳的版本：

```typescript
// server/_core/llmWithBilling.ts

import { invokeLLM, InvokeParams, InvokeResult } from "./llm";
import { insertTokenLog } from "../tokenLedger";
import { deductCredits } from "../deductCredits";
import { calcCostFromTokens } from "../creditsCalculator";

export async function invokeLLMWithBilling(
  params: InvokeParams,
  context: {
    userId: number;
    userApiKey: string;
    tenantId?: number;
    taskId?: number;
    agentId?: number;
    actionType: string;
    provider: ModelProvider;
    model: string;
  }
): Promise<InvokeResult> {
  const start = Date.now();
  const result = await invokeLLM(params);
  const latencyMs = Date.now() - start;

  // 取得實際 token 用量（從 LLM response 中解析）
  const usage = result.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  // 計算實際成本
  const rawCostUSD = calcCostFromTokens(
    context.provider,
    usage.prompt_tokens,
    usage.completion_tokens
  );
  const creditsCharged = usdToCredits(rawCostUSD, MARKUP_FACTOR);

  // 寫入帳本
  await insertTokenLog({
    ...context,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    rawCostUSD,
    markupFactor: MARKUP_FACTOR,
    creditsCharged,
    latencyMs,
  });

  // 扣除 Credits
  await deductCredits({
    userId: context.userId,
    cost: creditsCharged,
    agentId: context.agentId,
    actionType: context.actionType as any,
    description: `${context.provider}/${context.model} — ${usage.total_tokens} tokens`,
  });

  return result;
}
```

---

## 企業 Token Pool 設計

企業方案（Enterprise）的 Token 扣除優先走企業共用 Pool：

```
Enterprise Tenant
├── credits_pool: 150,000 Credits/月
├── member_monthly_limit: 5,000 Credits/人/月（可調整）
└── 扣除順序：
    1. 先扣成員月度配額
    2. 若配額用完 → 扣企業 Pool（超額警告）
    3. Pool 耗盡 → 停止服務 + 通知 Admin
```

---

## 用戶識別碼 API

```
POST /api/keys          ← 生成新的 API Key
GET  /api/keys          ← 列出所有 API Keys
DELETE /api/keys/:id    ← 撤銷 API Key

GET  /api/usage/summary    ← 總覽（各 Provider 用量）
GET  /api/usage/logs       ← 明細（可篩選日期/Provider/Agent）
GET  /api/usage/realtime   ← 即時餘額
```

---

## 注意事項

1. **Token 數量從 LLM Response 解析**：大部分 Provider 的回應都包含 `usage.prompt_tokens` / `usage.completion_tokens`，若沒有則用估算值
2. **匯率動態更新**：每日更新一次 USD → TWD 匯率（ExchangeRate API）
3. **成本異常警報**：單次呼叫超過 1,000 Credits 自動發通知給 Admin
4. **用戶可查詢帳單**：每個用戶可在平台查看逐日/逐 Provider 的 Token 消耗明細

---

*文件版本：v1.0 | 2026-04-02 | PM Agent*
