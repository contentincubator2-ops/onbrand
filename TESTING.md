# TESTING.md — 測試指南

## 1. 單元測試（Unit Tests）

### 執行

```bash
cd skills/ai-talent
npm install
npm run test          # 跑所有測試
npm run test:watch    # 監聽模式
```

### 現有測試

| 測試檔案 | 說明 |
|---------|------|
| `server/tokenLedger.test.ts` | 計費計算邏輯（6個 test cases）（Sprint 1） |
| `server/agentMatcher.test.ts` | Agent 匹配邏輯 + input validation（Sprint 2） |
| `skills/market-intel/server/marketIntel.test.ts` | 市場情報格式化 + keyword 消毒（Sprint 2） |

### 加新測試

測試檔案放在被測試的 `.ts` 旁邊，命名 `*.test.ts`。使用 [Vitest](https://vitest.dev/)。

---

## 2. 整合測試（手動，需真實 DB）

### 前置條件

```bash
cp skills/ai-talent/.env.example skills/ai-talent/.env
# 填入真實的 DB 連線資訊（DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, SOWORK_DB_HOST…）
```

### 測試 Health Check（含 soworkDb 狀態）

```bash
curl http://localhost:3001/health
# 預期：{"status":"ok","db":"connected","soworkDb":"connected","billingQueueLength":0,...}
```

### 測試 Agent 匹配

```bash
curl -X POST http://localhost:3001/trpc/workflow.list \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{"json": {"brandId": null}}'
```

### 測試市場切換（含 input validation）

```bash
# 正常請求
curl -X POST http://localhost:3001/trpc/market.setMarket \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{"json": {"marketId": "Taiwan", "contentLanguage": "zh-TW", "isDefault": true, "complianceFlags": []}}'

# 非法 marketId（應回 400 validation error）
curl -X POST http://localhost:3001/trpc/market.setMarket \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{"json": {"marketId": "InvalidMarket", "contentLanguage": "zh-TW", "isDefault": true}}'
```

### 測試 Agent 查詢（直接 DB）

```bash
# 確認 sowork_db 連線與 agents 表可讀
mysql -h ytcreator-ai-server.mysql.database.azure.com -u openclaw -p sowork_db -e \
  "SELECT id, name, title, layer, hireCount, rating FROM agents WHERE isAvailable=1 ORDER BY hireCount DESC LIMIT 5;"
```

---

## 3. 安全測試（OWASP Top 10）

### SQL Injection 驗證

```bash
# 嘗試透過 x-user-id header injection（應正常處理，不報錯也不執行惡意 SQL）
curl -X GET "http://localhost:3001/trpc/market.getMyMarkets" \
  -H "x-user-id: 1; DROP TABLE users; --"

# 嘗試透過 marketId injection（應回 400 validation error）
curl -X POST http://localhost:3001/trpc/market.setMarket \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{"json": {"marketId": "Taiwan'\''; DROP TABLE tenant_markets; --", "contentLanguage": "zh-TW", "isDefault": true}}'
```

### Rate Limit 驗證

```bash
# 快速發送 101 個請求到 /api 路徑（第 101 個應該返回 429）
for i in $(seq 1 101); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/health
done | sort | uniq -c
```

---

## 4. 效能測試（Sprint 4 前執行）

```bash
# 使用 k6 執行壓力測試
cd sowork-qa-suite
TARGET_URL=http://localhost:3001 k6 run tests/load/payment-flow.js
```

> **注意（STAB-6）：** `getCreativeCases()` 目前使用 `ORDER BY RAND()`，在 93K 行的
> `creative_cases` 表上會觸發全表掃描。Sprint 4 計劃改為 keyset-based random sampling。
> 壓測前請監控 DB slow query log。

---

## 5. CI 自動測試

每次 push 到 `main` 或 `dev` 都會自動執行：

- **Type check** (`tsc --noEmit`)
- **Unit tests** (`vitest run`)

查看 CI 結果：https://github.com/contentincubator2-ops/sowork-marketing-enterprise/actions

---

## 6. 已知限制

| 問題 | 說明 | 預計修復 |
|------|------|---------|
| STAB-6 | `getCreativeCases()` 使用 `ORDER BY RAND()` | Sprint 4 |
| QUAL-2 | `marketIntel.ts` 使用相對路徑 `../../ai-talent/server/db` | Sprint 3（monorepo workspace） |
