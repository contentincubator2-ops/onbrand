# MAINTENANCE.md — 長期維運指南

> 給未來的工程師和 SRE 看的。這份文件記錄了所有需要定期維護、監控、或在特定條件下處理的事項。

---

## 🔴 生產前必須完成（Sprint 4）

### 1. 計費系統 — 事務性保護（Race Condition）

**位置：** `skills/ai-talent/server/deductCredits.ts` → `deductCredits()` 函數

**問題：** 目前的扣點邏輯是非原子的 read-modify-write，在高並發時可能雙重扣費。

**修法：**
```typescript
// 用 MySQL 事務 + SELECT ... FOR UPDATE 鎖定行
await db.transaction(async (tx) => {
  const wallet = await tx.select().from(userCredits)
    .where(eq(userCredits.userId, userId))
    .for("update") // 行級鎖，防止並發讀取
    .limit(1);
  // 在同一事務內完成所有更新
});
```

**觸發條件：** 上線前，或每日任務量 > 100 筆時。

---

### 2. JWT 認證完整實作

**位置：** `skills/ai-talent/server/platform/core/trpc.ts`

**目前狀態：** `TRPCContext` 和 `protectedProcedure` 已定義，但 JWT 解析邏輯還未接入。

**Sprint 2 需完成：**
```typescript
// 在 createExpressMiddleware 的 createContext 中解析 JWT：
import { getJwtSecret } from "./platform/core/env";
import jwt from "jsonwebtoken";

export function createContext({ req }: { req: express.Request }): TRPCContext {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return { user: null };
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { id: number; email: string };
    return { user: { id: payload.id, email: payload.email } };
  } catch {
    return { user: null };
  }
}
```

---

### 3. billingRetryQueue 持久化

**位置：** `skills/ai-talent/server/llmWithBilling.ts`

**問題：** `billingRetryQueue` 是 in-memory。Process crash 後，佇列中未 flush 的記錄消失。

**目前 fallback：** `BILLING_FALLBACK_LOG`（`/var/log/sowork/billing-retry.jsonl`）磁碟備份。

**Sprint 4 修法：** 改用 Redis LIST + BullMQ 作持久化 queue。

**緊急 SOP（若發現 billing-retry.jsonl 非空）：**
```bash
# 手動重跑 billing retry log
cat /var/log/sowork/billing-retry.jsonl | while IFS= read -r line; do
  curl -X POST https://your-api/internal/billing/retry \
    -H "Content-Type: application/json" \
    -d "$line"
done
```

---

## 🟡 定期維護任務

### 每週

| 任務 | 指令 | 說明 |
|------|------|------|
| 檢查 billing retry queue | `GET /health` → `billingQueueLength` | 若 > 10 立刻調查 |
| 確認 DB pool 健康 | `GET /health` → `db: "connected"` | degraded 時立刻通知 |
| 清理過期 token_usage_logs | 保留 90 天，舊的刪除 | 控制 DB 大小 |

### 每月

| 任務 | 說明 |
|------|------|
| 更新 AI Provider 定價 | 檢查 `tokenLedger.ts::PROVIDER_COST_PER_1K` 是否仍準確 |
| 輪換 API Keys | `userApiKeys` 中超過 90 天未使用的 key 停用 |
| 稽核 enterpriseCreditsPool | 核對企業客戶 pool 餘額與帳單 |
| 更新 LLM 模型版本 | `llm.ts::PROVIDER_CONFIG` 的 `defaultModel` 是否仍是最優 |

---

## 🔵 監控指標（生產環境需接警報）

| 指標 | 警戒線 | 說明 |
|------|--------|------|
| `billingRetryQueueLength` | > 10 | billing DB 可能有問題 |
| DB connection pool 排隊 | > 5 | 需增加 `connectionLimit` |
| LLM API 延遲 | P95 > 30s | 考慮切換 provider |
| 每用戶 credits 剩餘 | < 100 | 主動提示充值 |
| token_usage_logs 行數 | > 5M | 需分表或歸檔 |

---

## 🔒 安全性定期檢查

### API Key 生命週期
- `userApiKeys.lastUsed` > 90 天 → 自動停用
- 每次 `validateApiKey()` 呼叫都更新 `lastUsed`
- 用戶可在設定頁面查看所有 key 的使用記錄

### JWT Secret 輪換 SOP
1. 生成新 secret：`openssl rand -base64 48`
2. 同時設定舊 + 新 secret（雙 secret 模式，讓舊 token 有時間過期）
3. 等待所有舊 token 過期（預設 TTL）
4. 移除舊 secret

### DB 憑證輪換 SOP
1. 在 Azure MySQL 建立新 user 並設定相同權限
2. 更新 `.env` 的 `DB_USER` / `DB_PASSWORD`
3. 重啟服務（`process.on('SIGTERM')` 會 graceful drain pool）
4. 刪除舊 user

---

## 📐 DB Migration 流程

```bash
# 1. 修改 schema.ts
# 2. 生成 migration
pnpm db:generate --prefix skills/ai-talent

# 3. Review generated SQL in drizzle/migrations/
# 4. 在 staging 跑 migration
pnpm db:migrate --prefix skills/ai-talent

# 5. 確認 staging 正常後，在 production 跑
# 6. 絕對不要跳過 staging 直接上 production
```

---

## 🚀 上線 Checklist

- [ ] `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` 都設定為生產值（非 hardcode）
- [ ] `JWT_SECRET` >= 32 字元，不是預設值
- [ ] 至少一個 LLM API key 有設定（`BUILT_IN_FORGE_API_KEY` 或其他）
- [ ] `TRUST_PROXY=1`（若在 Nginx/Azure 後面）
- [ ] `BILLING_FALLBACK_LOG` 設到持久儲存路徑（非 `/tmp`）
- [ ] `AZURE_SEARCH_ENDPOINT` + `AZURE_SEARCH_API_KEY` 設定（RAG 功能）
- [ ] DB migration 已在 production 跑過
- [ ] `GET /health` 回傳 `"db": "connected"`
- [ ] `billingRetryQueueLength` = 0
- [ ] Rate limit 設定確認（`TRUST_PROXY` 正確時才能識別真實 IP）

---

*文件版本：v1.0 | 2026-04-02 | SoWork PM Agent*
