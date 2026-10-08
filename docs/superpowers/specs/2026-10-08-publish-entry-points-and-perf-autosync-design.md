# 平台授權入口＋成效頁開頁自動同步 — 設計規格

**日期**：2026-10-08
**分支**：`feat/publish-entry-points`（從 `dev` 切出）
**前情**：`2026-10-07-zernio-publish-connections-design.md`、`2026-10-08-zernio-analytics-sync-design.md`

---

## 0. 一頁摘要

兩個在 dev 實測時發現的缺口，都很小：

1. **平台授權頁沒有任何 UI 入口**。2026-05-30 移除側欄「連結」與齒輪後，`/brands/edit?b=<id>&cat=publish` 只能靠網址進去；發布失敗訊息與成效卡都只寫「到品牌設定連接」卻沒有連結。
2. **成效只在背景排程或手動按鈕時更新**。dev 關掉 `BACKGROUND_WORKERS_ENABLED`，成效永遠不會自己動；prod 客戶剛連好帳號最久要等 20 小時。

本 PR：補三個入口；成效頁載入時若資料過期就在背景觸發一次同步。**不改發布與成效的既有邏輯。**

---

## 1. 平台授權入口（前端）

共用：新增 `client/src/v2/platform/lib/publishSettingsUrl.ts`，匯出 `publishSettingsUrl(brandId: number | null | undefined): string` → 有 brandId 回 `/brands/edit?b=<id>&cat=publish`，沒有回 `/brands/edit?cat=publish`。三處都用它，不要各寫各的字串。

### 1.1 品牌頁分類列與策略層左側 rail

- `v2/strategy/pages/BrandsPage.tsx` 的 `allTiles`（約第 1722 行，註解「平台授權 removed」那段）加回一個 tile：`{ v: "publish", label: 平台授權 / Platform auth, desc: 連接社群帳號 / Connect social accounts, Icon: ShareIcon（BrandSettingsSheet.tsx 用的同一個圖示）, scopes: ["brand"] }`，放在「基本資料」之後。更新那段註解說明為什麼加回來（Zernio 連線要有入口）。
- 策略層左側 rail（`v2/app/shell/IconBar.tsx` 用 `catKey` 的那份項目清單，自己找到定義處）同樣加一個「平台授權」項目，`catKey: "publish"`，放在「基本資料」之後。strategy-preview 帳號只看得到 rail、看不到 tiles，所以兩邊都要加。
- 麵包屑 `strategyCrumbs.ts` 已有 `publish` → 不用動。

### 1.2 成效頁「社群貼文成效」卡

`v2/performance/components/ConnectionsPanel.tsx`：`c.id === "meta_page"` 且**未連結**（`!on`）且有 brandId 時，在說明文字下方加一個連結按鈕「前往連接社群帳號」（en: `Connect social accounts`），用 `useNavigate()` 導到 `publishSettingsUrl(brandId)`。樣式沿用同檔「同步成效」按鈕。已連結時不顯示。

### 1.3 發布失敗時的連結

- Server：`platform/core/connectors/publish/publishAdapter.ts` 新增匯出常數 `NOT_CONNECTED_MESSAGE = "此品牌尚未連接此平台，請先到品牌設定完成連接。"`，`zernioAdapter.publish` 改用它（字串內容不變）。
- Client：`v2/content/pages/PlannerPage.tsx` 的 `publishNow`（以及同頁「重試」若也會回這個錯）onError：訊息包含「尚未連接此平台」時，`showToastGlobal(msg, "error", { label: 去連接 / Connect, onClick: () => navigate(publishSettingsUrl(brandId)) })`。`ToastAction` 型別已存在於 `v2/platform/components/Toast.tsx`。其他錯誤維持原行為。
- 排程卡片彈窗：`isFailedScheduled` 的紅色錯誤區塊，若 `lastError` 包含「尚未連接此平台」，在區塊內加同樣的「去連接」連結。

---

## 2. 成效頁開頁自動同步（後端為主）

### 2.1 新函式 `performance/core/zernioAnalyticsSync.ts`

```ts
export const AUTO_SYNC_STALE_HOURS = 6;
/** 開頁時呼叫：資料過期就在背景同步一次，不等結果。回傳是否有啟動。 */
export async function ensureFreshZernioAnalytics(brandId: number, deps?: ZernioAnalyticsDeps): Promise<{ started: boolean; reason: "disabled" | "no_connection" | "fresh" | "in_flight" | "started" }>;
```

- `zernioAnalyticsEnabled()` 為 false → `disabled`。
- 該品牌沒有 zernio connected 且平台在四個之內的連線 → `no_connection`。
- 四個 source 的 `perf_facts.updatedAt` 最大值在 `AUTO_SYNC_STALE_HOURS` 小時內 → `fresh`。
- 同一品牌已有同步在跑（module 層級 `Set<number>`）→ `in_flight`。
- 否則：把 brandId 加進 Set，`void syncBrandZernioAnalytics(brandId, 120, deps).catch(記 logError warn).finally(移出 Set)`，立刻回 `started`。**不 await**。
- 另外記一個 module 層級 `Map<brandId, lastAttemptMs>`：同品牌 10 分鐘內只嘗試一次（避免帳號真的沒有貼文時每次開頁都打 Zernio）；在窗口內回 `fresh`。
- 手動 `syncSocial` 不受這些限制，但要共用 in-flight Set（手動同步進行中時 `ensureFresh` 回 `in_flight`）。

### 2.2 路由 `performance/routers/performanceRouter.ts`

`connections` query 回傳前呼叫 `ensureFreshZernioAnalytics(input.brandId)`（包 try/catch，失敗不影響回應），並在 `meta_page` 那筆多回一個欄位 `syncing: boolean`（`started` 或 `in_flight` 時為 true）。`SourceConnection` 型別加可選 `syncing?: boolean`。

### 2.3 前端 `ConnectionsPanel.tsx`

- `meta_page` 卡在 `c.syncing` 為 true 時顯示一行小字「成效更新中…」（en: `Updating performance…`），並把 `connections` query 的 `refetchInterval` 設成 8000ms 直到 `syncing` 變 false；變 false 的那一次 invalidate `performance.workspace`、`performance.report`、`performance.campaignReport`（跟手動同步成功後一樣）。
- 手動「同步成效」按鈕保留。

---

## 3. 測試

| 檔案 | 要驗 |
|---|---|
| `publishSettingsUrl.test.ts` | 有／沒有 brandId 的網址。 |
| `ConnectionsPanel.test.tsx`（已存在） | 未連結時顯示「前往連接社群帳號」並導到正確網址；`syncing: true` 時顯示更新中。 |
| `zernioAnalyticsSync.test.ts` | `ensureFresh` 五種 reason；`started` 時不 await 同步；同品牌並發只啟動一次；10 分鐘內第二次回 `fresh`；同步失敗後 Set 會清掉。 |
| `performanceRouter.analytics.test.ts` | `connections` 回 `syncing`；`ensureFresh` 丟錯時 `connections` 仍正常回應。 |
| PlannerPage | 若有既有測試檔（`plannerFailed.test.ts`）可補「尚未連接」判斷的純函式測試；把判斷抽成 `isNotConnectedError(msg: string): boolean` 放 `v2/content/lib/` 以便測試。 |

驗證：`cd skills/ai-talent && COVERS_DIR=<暫存> npx vitest run server/performance server/platform/core/connectors client/src/v2/performance client/src/v2/content client/src/v2/platform && npx tsc --noEmit && npx tsc --noEmit -p client`。

## 4. 明確不做

- 不移除 Pipedream／bundle.social。
- 不改背景排程的 20 小時邏輯。
- 不做「onBrand vs 自行發布」的對比圖。
- 不 push、不開 PR；commit 中文訊息 `feat(publish): …`／`feat(performance): …`，結尾 `Co-Authored-By: Codex <noreply@openai.com>`。
