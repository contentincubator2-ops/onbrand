# Zernio 連線生命週期：一品牌一帳號、換帳號、解除、刪品牌／退訂、每日對帳 — 設計規格

**日期**：2026-10-07
**分支**：`feat/zernio-connection-lifecycle`（從 `dev` 切出，接在 PR #418 之後）
**前情**：`2026-10-07-zernio-publish-connections-design.md`（Zernio 串接，已合併 PR #418）

---

## 0. 一頁摘要

Zernio 按「連接帳號日」計費。PR #418 的設計允許一品牌同平台多帳號、發文時取最新，會讓席次悄悄累積（換粉專沒解除舊的、刪品牌／退訂後帳號還連著）。本 PR 把政策定為 **一個品牌、每個平台恰好一個帳號**，並補上四個生命週期掛鉤，讓「Zernio 計費的帳號數 ＝ 我們表裡 connected 的列數」。

Shawn 已決定不再使用 Pipedream 與 bundle.social，但**本 PR 不移除舊程式碼與舊欄位**（另開 PR），只補一個「發布服務已升級」的提示。

---

## 1. 資料模型

### 1.1 `brand_publish_connections` 唯一鍵改為「品牌＋供應商＋平台」

一列 ＝ 該品牌該平台**當前**的帳號。換帳號是覆蓋同一列，不是新增列。

dev 資料庫已用舊的唯一鍵建好這張表（PR #418 部署時建的，目前無資料），所以 `scripts/migrate.ts` 要寫**冪等的 ALTER**，不是改 CREATE TABLE 就好：

```ts
// 1) CREATE TABLE IF NOT EXISTS 區塊改成新的唯一鍵（新環境直接建對）
//    UNIQUE KEY uq_bpc_brand_provider_platform (brandId, provider, platform)
// 2) 既有環境：查 information_schema.STATISTICS，
//    若 INDEX_NAME = 'uq_bpc_brand_provider_platform_account' 存在 →
//      先清重複列（同 brandId+provider+platform 留 id 最大的一列，其餘 DELETE），
//      ALTER TABLE brand_publish_connections DROP INDEX uq_bpc_brand_provider_platform_account,
//      ADD UNIQUE KEY uq_bpc_brand_provider_platform (brandId, provider, platform)
//    若新索引已存在 → skip，印 "already exists, skipped"
```

`drizzle/schema.ts` 與 `docs/migrations/2026-10-07-brand-publish-connections.md` 同步改成新唯一鍵。其餘欄位不變；`status = 'disconnected'` 的列保留當紀錄。

### 1.2 `connectionStore.ts` 介面改為單列語意

```ts
getConnection(pool, brandId, provider, platform): Promise<PublishConnection | null>   // 只回 connected 的那一列
setConnection(pool, brandId, provider, platform, account): Promise<void>              // INSERT … ON DUPLICATE KEY UPDATE 覆蓋 accountId/label/username/meta，status='connected'，
                                                                                      // connectedAt 只在 accountId 改變或原本 disconnected 時更新
markDisconnected(pool, brandId, provider, platform): Promise<void>                    // 不再需要 accountId 參數
listConnectedByBrand(pool, brandId, provider): Promise<PublishConnection[]>           // 給刪品牌／退訂用
listAllConnected(pool, provider): Promise<PublishConnection[]>                        // 給每日對帳用
```

移除 `listConnections`、`upsertConnections`。

---

## 2. Adapter 行為（`zernioAdapter.ts`）

| 方法 | 新行為 |
|---|---|
| `getConnectUrl({ brandId, platform, redirectUrl, mode })` | `mode: "connect" \| "reconnect" \| "replace"`（預設 `connect`）。`reconnect`：讀當前列，帶 `reconnectAccountId=<accountId>` 給 Zernio，確保重新授權不會換成別的帳號；沒有當前列就當 `connect`。`replace` 與 `connect`：不帶 reconnectAccountId。 |
| `syncConnections({ brandId, platform })` → 改名 `syncConnection`，回 `PublishConnection \| null` | 用 `listAccounts({ profileId, platform, status: "connected", sort: "connected", order: "desc" })`。**第一筆（最新連接的）成為當前帳號**：`setConnection`。其餘每一筆呼叫 Zernio `deleteAccount` 後忽略（這就是席次自動清理，每次刪除 `console.warn` 一行）。Zernio 回空 → `markDisconnected`，回 null。 |
| `disconnect({ brandId, platform })` | 不再收 accountId。讀當前列 → `deleteAccount` → `markDisconnected`。沒有當前列丟 `PublishUserError("此品牌尚未連接此平台。")`。 |
| `disconnectAll({ brandId })`（新增） | `listConnectedByBrand` → 逐一 `deleteAccount`（單筆失敗記 log 繼續）→ `markDisconnected`。回 `{ disconnected: number, failed: number }`。 |
| `publish(...)` | `getConnection` 為 null → `PublishUserError("此品牌尚未連接此平台，請先到品牌設定完成連接。")`；不再有多帳號排序與 warn。 |

`PublishProviderAdapter` 介面同步改（`syncConnection`、`disconnect` 簽名、新增 `disconnectAll`）。

Zernio client `listAccounts` 加 `sort`／`order` 可選參數（OpenAPI：`sort: [account, platform, profile, status, connected]`、`order: [asc, desc]`）。`getConnectUrl` 加可選 `reconnectAccountId`。

---

## 3. 路由（`zernioConnectRouter.ts`）

| procedure | 改動 |
|---|---|
| `getConnectUrl` | input 加 `mode: z.enum(["connect","reconnect","replace"]).default("connect")`。 |
| `getConnectionStatus` | 回傳改為：`{ connected: boolean, account: { accountId, name, username } \| null, pendingScheduled: number, legacyConnected: boolean }`。`pendingScheduled` ＝ `SELECT COUNT(*) FROM scheduled_posts WHERE brandId = ? AND platform IN (<該平台的內部值與縮寫，如 'facebook','fb'>) AND status = 'pending'`。`legacyConnected` ＝ 該品牌 `brands.fbPageId IS NOT NULL`（facebook）或 `brands.bundleTeamId IS NOT NULL`（任一平台），且 Zernio 未連。 |
| `disconnect` | input 只收 `{ brandId, platform }`。 |

---

## 4. 生命週期掛鉤

### 4.1 刪品牌（`strategy/routers/brandRouter.ts` 的 `delete`）

在 `db.delete(brands)` **之前**，若 `ZERNIO_API_KEY` 存在：建 adapter → `disconnectAll({ brandId })`。失敗只 `logError({ source: "zernio.lifecycle", level: "warn", … })`，**不阻擋刪除**（品牌刪不掉比席次多一天嚴重）。沒有 key 就跳過。

### 4.2 退訂（`platform/core/billing/stripeLifecycle.ts` 的 `ended` action）

`customer.subscription.deleted` → `applyLifecycleAction` 處理 `kind === "ended"` 的地方，於既有邏輯之後：用 `resolveSubscriptionOwner` 得到的 `userId`／`workspaceId`，找出該 owner 的所有品牌（`brands.userId = ?`，若 brands 有 workspaceId 欄位則優先用 workspaceId），逐一 `disconnectAll`。同樣失敗只記 log 不丟。為了可測，把這段抽成 `platform/core/connectors/publish/zernioLifecycle.ts` 的 `disconnectBrandsForOwner(pool, { userId, workspaceId })`，stripeLifecycle 只呼叫它；單元測試 mock 掉即可，**不要**讓 stripeLifecycle.test.ts 現有測試壞掉。

### 4.3 每日對帳（新檔 `platform/core/connectors/publish/zernioReconcileWorker.ts`）

- `tickZernioReconcile()`：用 `GET /v1/accounts?status=connected&limit=100&page=N` 翻頁拉 Zernio 全部帳號（client 加 `listAllAccounts()`），與 `listAllConnected(pool, "zernio")` 比對。
- 三類異常，各自 `logError({ source: "zernio.reconcile", level: "warn", message, meta })` 一筆，**不自動刪除**：
  1. Zernio 有、我們沒有（profile 對不到任何 `brand_publish_tenants`，或對得到但該平台無 connected 列）→ 「孤兒帳號，正在計費」。
  2. 我們 connected、Zernio 沒有 → 本地標 `disconnected`（這個可以自動修，因為不影響計費）。
  3. 同一個 Zernio `platformUserId`／`username` 出現在兩個 profile → 「同帳號跨品牌，計費兩次」，只警告。
- 回傳 `{ scanned, orphans, staleLocal, crossBrand }`。
- 在 `server/index.ts` 的 `BACKGROUND_WORKERS_ENABLED` 區塊註冊：每 24 小時一次，啟動後 10 分鐘先跑第一次；沒有 `ZERNIO_API_KEY` 就印 disabled 不註冊。寫法仿 `fbPageSync` 那段。

---

## 5. 前端（`BrandSettingsSheet.tsx` 的 `PublishTab`，只動 Zernio 分支）

- `zernioStatus[key]` 型別改成 `{ connected, account, pendingScheduled, legacyConnected }`。
- 卡片狀態：
  - **已連接**：顯示帳號名稱；按鈕「重新授權」（`mode: "reconnect"`）、「換帳號」（`mode: "replace"`，先 confirm「換成其他帳號後，目前的帳號會自動解除並停止計費。」）、「解除連接」。
  - **未連接且 `legacyConnected`**：狀態徽章文字「待重新授權」，卡片內一行「發布服務已升級，請重新授權一次。」，按鈕「重新授權」（實際是 `mode: "connect"`）。
  - **未連接**：維持現狀「尚未連接」＋「連接 ○○」。
- 「解除連接」confirm 文案：`pendingScheduled > 0` 時為「目前有 N 篇排程，解除後到時間會標記失敗。解除後 Zernio 停止計費，已發出的貼文不受影響。仍要解除？」，否則「解除後 Zernio 停止計費，已發出的貼文不受影響。確定解除？」。
- 既有的 focus 重新同步、OAuth 回來的 query 清理保留；回傳型別改了要跟著改。
- 現有 `BrandSettingsSheet.test.tsx` 要更新成新的回傳形狀。

---

## 6. 測試

| 檔案 | 要驗 |
|---|---|
| `connectionStore.test.ts` | `setConnection` 覆蓋同列、`connectedAt` 只在 accountId 改變時更新、`markDisconnected` 不需 accountId。 |
| `zernioAdapter.test.ts` | `syncConnection` 多筆時留第一筆並 `deleteAccount` 其餘；`reconnect` 模式帶 `reconnectAccountId`；`replace` 不帶；`disconnectAll` 單筆失敗繼續並回計數；`publish` 無連線丟 `PublishUserError`。 |
| `zernio.test.ts` | `listAccounts` 的 sort／order query；`getConnectUrl` 的 `reconnectAccountId`；`listAllAccounts` 翻頁。 |
| `zernioReconcileWorker.test.ts` | 三類異常各一條；`staleLocal` 自動標 disconnected；孤兒不呼叫 delete。 |
| `zernioLifecycle.test.ts` | `disconnectBrandsForOwner` 找對品牌、失敗不丟。 |
| `stripeLifecycle.test.ts` | 既有測試全過（mock `zernioLifecycle`）。 |
| `BrandSettingsSheet.test.tsx` | 新回傳形狀；`legacyConnected` 顯示「待重新授權」。 |
| `scripts/migrate.ts` | 無單元測試，但 `npx tsc --noEmit` 要過；ALTER 邏輯用 information_schema 判斷，手動 review。 |

驗證指令：`cd skills/ai-talent && npx vitest run server/platform/core/connectors server/platform/core/billing server/content/core/publish server/content/routers client/src/v2/strategy/components/positioning && npx tsc --noEmit && npx tsc --noEmit -p client`（測試需 `COVERS_DIR` 指到可寫的暫存目錄）。

---

## 7. 明確不做

- 不移除 Pipedream／bundle.social 程式碼、router、`brands` 舊欄位（下一個 PR）。
- 不做多帳號 opt-in。
- 不接 Zernio webhook。
- 對帳只警告不自動刪 Zernio 端帳號。
- 不 push、不開 PR；commit 可分多個，中文訊息，`feat(publish): …`／`ops(publish): …`，結尾 `Co-Authored-By: Codex <noreply@openai.com>`。
