# 成效回填改走 Zernio：Facebook／Instagram／Threads／LinkedIn 貼文成效 — 設計規格

**日期**：2026-10-08
**分支**：`feat/zernio-analytics-sync`（從 `dev` 切出，接在 `fix/zernio-profile-create-race` 之後）
**前情**：`2026-10-07-zernio-publish-connections-design.md`、`2026-10-07-zernio-connection-lifecycle-design.md`

---

## 0. 一頁摘要

成效層目前唯一的真實資料來源 `performance/core/fbPageSync.ts` 用 **Pipedream 代管的 Facebook token** 直接打 Graph API，只支援 Facebook 粉專。Shawn 已決定不再使用 Pipedream，且要求 Facebook、Instagram、Threads、LinkedIn 四個平台**都要能抓到已發布貼文的成效**。

本 PR 新增 `zernioAnalyticsSync.ts`，用 Zernio 的 `GET /v1/analytics` 一次涵蓋四個平台，寫進既有的 `perf_facts`（同一個 `upsertFacts`），成效頁的視角、報表、標籤規則**不用改**。fbPageSync 保留但在 Facebook 走 zernio 時停用，待移除 Pipedream 的 PR 一起刪。

連接時的 scope 已在 `fix/zernio-profile-create-race` 改成 `posting,analytics`（Threads 需要 `threads_manage_insights`，其他平台各自的 insights 權限），所以新連的帳號直接能讀；**在那之前連的帳號要重新授權一次**。

---

## 1. Zernio Analytics API 事實（docs.zernio.com/analytics/get-analytics，2026-10-08）

- `GET /v1/analytics`，query：`accountId`、`profileId`（預設 all）、`platform`（預設 all）、`source`：`late`（Zernio 發的）｜`external`（平台上既有、同步進來的）｜`all`（預設）、`fromDate`／`toDate`（`YYYY-MM-DD`，含；`fromDate` 預設 90 天前，最大區間 366 天）、`page`（預設 1）、`limit`（預設 50，1～100）、`sortBy`、`order`。
- 每筆回：`postId`、`latePostId`、`status`、`content`、`publishedAt`、`platform`、`platformPostUrl`、`isExternal`、`syncStatus`、`mediaType`、`mediaItems`、`analytics { impressions, reach, likes, comments, shares, saves, clicks, views, engagementRate, lastUpdated }`、`platformAnalytics[] { platform, status, platformPostId, accountId, accountUsername, analytics, syncStatus, platformPostUrl, errorMessage }`。
- 單篇查詢可能回 **202**（同步中）或 **424**（全部平台失敗）；列表查詢照常回 200。
- 平台差異：Threads 沒有 impressions，`views` 就是觸及；`shares` ＝ 轉發＋引用。LinkedIn **個人帳號**只有透過 Zernio 發的貼文有數據，企業頁面不受限。
- 既有貼文的同步：有 `POST /v1/analytics/sync-external-posts` 端點，文件沒寫清楚連接後會不會自動同步。**PoC 第一件要驗的**：連接後打 `source=external` 看有沒有資料；沒有就對該 accountId 呼叫 sync-external-posts 一次。
- 計費：定價頁寫明 analytics 包含在每個帳號內，不另收費（X 除外，不在範圍）。

---

## 2. 資料寫入：沿用 `perf_facts` 與 `upsertFacts`

每篇貼文一筆 `FactInput`（`performance/core/perfStore.ts`）：

| 欄位 | 值 |
|---|---|
| `source` | 依平台：`fb_page`（**沿用既有值**，成效頁既有視角與 `sourceSummary` 才接得上）、`ig_account`、`threads_account`、`linkedin_page` |
| `entityType` | `"post"` |
| `entityId` | `platformPostId`（平台原生 id；Facebook 沿用 `<pageId>_<postId>` 格式以對得上既有資料） |
| `entityLabel` | `content` 去空白截 60 字，空則「(無文字貼文)」 |
| `text` | `content` |
| `date` | `publishedAt` 轉台北日期（沿用 `taipeiDate`） |
| `permalink` | `platformPostUrl` |
| `tags` | `{ ...own, format }`：`own` 用 `scheduled_posts.externalPostId` 對回 `mission_outputs.metadata.perfTags`（邏輯從 fbPageSync 抽成共用函式 `ownTagsFor(brandId)`）；`format` 由 `mediaType` 對應：image→`image`、video／reel→`video`、carousel→`carousel`、其餘→`text` |
| `metrics` | `reactions = likes`、`comments`、`shares`、`engagement = likes + comments + shares`、`reach`、`impressions`（Threads 用 `views`）、`views`、`saves`、`clicks`。只寫有數字的鍵 |

同一 (source, entityId, date) 再進來就覆蓋，數字會長大，跟 fbPageSync 相同語意。

---

## 3. 後端檔案（相對 `skills/ai-talent/server/`）

| 檔案 | 內容 |
|---|---|
| `platform/core/connectors/zernio.ts` | 新增 `listAnalytics({ accountId, fromDate, toDate, source?, page, limit })` 回 `{ posts, pagination }`；新增 `syncExternalPosts({ accountId })`。欄位型別照第 1 節。 |
| `performance/core/zernioAnalyticsSync.ts` | **新**。<br>• `ZERNIO_ANALYTICS_PLATFORMS = ["facebook","instagram","threads","linkedin"] as const`，`SOURCE_BY_PLATFORM` 對應第 2 節。<br>• `syncBrandZernioAnalytics(brandId, days = 120, deps?)`：讀 `brand_publish_connections`（provider zernio、status connected、platform 在清單內），每個帳號翻頁拉 `listAnalytics(source=all)`，轉成 FactInput → `upsertFacts`。某平台失敗記 `logError(level: "warn")` 繼續下一個。回 `{ platforms: Array<{ platform, posts, tagged, error? }> }`。<br>• 第一次同步某帳號（該 source 在 `perf_facts` 無資料）且 `source=all` 回空 → 呼叫 `syncExternalPosts` 一次，再拉一次；仍空就回 0 筆不報錯。<br>• `tickZernioAnalyticsSync()`：仿 `tickFbPageSync`，一拍一個品牌：有建過視角（`perf_lenses`）、有至少一個 zernio connected 連線、四個 source 的 `perf_facts.updatedAt` 最大值為空或超過 20 小時。<br>• `zernioAnalyticsEnabled()` ＝ `SOCIAL_PUBLISH_ENABLED` 開 且 `ZERNIO_API_KEY` 存在。 |
| `performance/core/fbPageSync.ts` | `fbSyncEnabled()` 多一條：`getPublishProvider("facebook") === "zernio"` 時回 false（Facebook 已改走 Zernio，不再打 Pipedream）。其他不動。 |
| `performance/routers/performanceRouter.ts` | • `syncFacebook` 改名保留相容：新增 `syncSocial({ brandId, days? })` 呼叫 `syncBrandZernioAnalytics`；`syncFacebook` 內部若 Facebook 走 zernio 就轉呼叫 `syncSocial`，否則維持舊行為。<br>• `connections` 的 `meta_page` 判斷：`fbConnected` 加上「`brand_publish_connections` 有 zernio connected 且 platform 在四個之內」；`label` 列出已連平台的帳號名（如「SoWork 粉專、@sowork_tw」）；facts 數加總四個 source。文案改成「社群貼文成效（Facebook／Instagram／Threads／LinkedIn）」。 |
| `index.ts` | `BACKGROUND_WORKERS_ENABLED` 區塊註冊 `tickZernioAnalyticsSync` 每 30 分鐘一次，寫法仿 fbPageSync；`zernioAnalyticsEnabled()` 為 false 時印 disabled。 |

---

## 4. 前端（`client/src/v2/performance/components/ConnectionsPanel.tsx`）

- `meta_page` 卡標題改「社群貼文成效」，副標列平台；文案 `howZh/howEn` 由 server 回，前端不寫死。
- 「同步粉專」按鈕改呼叫 `performance.syncSocial`，文字改「同步成效」。
- 其餘不動。

---

## 5. 測試

| 檔案 | 要驗 |
|---|---|
| `connectors/zernio.test.ts` | `listAnalytics` 的 query（accountId、fromDate、toDate、source、page、limit）與翻頁；`syncExternalPosts` 的路徑與 body。 |
| `performance/core/zernioAnalyticsSync.test.ts` | 四平台各一筆的轉換（Threads `impressions` 取 `views`；`engagement` 加總；`format` 對應）；`own` tags 對回；某平台 API 失敗不影響其他平台；首次同步空資料時呼叫 `syncExternalPosts` 一次；`tick` 選品牌邏輯（mock pool）。 |
| `performance/core/fbPageSync.test.ts`（若有） | Facebook 走 zernio 時 `fbSyncEnabled()` 為 false。 |
| `performanceRouter` 相關測試（若有） | `connections` 在只有 zernio 連線時 `meta_page` 為 connected。 |

驗證：`cd skills/ai-talent && COVERS_DIR=<暫存> npx vitest run server/performance server/platform/core/connectors && npx tsc --noEmit && npx tsc --noEmit -p client`。

---

## 6. 明確不做

- 不刪 fbPageSync、不移除 Pipedream（下一個 PR）。
- 不做帳號層級的粉絲數／follower stats。
- 不做 YouTube、TikTok、X。
- 不改成效頁的視角、報表、標籤規則。
- 不 push、不開 PR；commit 中文訊息 `feat(performance): …`，結尾 `Co-Authored-By: Codex <noreply@openai.com>`。

---

## 7. PoC 要驗的三件事（dev）

1. 用 `posting,analytics` scope 重新連接測試粉專後，`GET /v1/analytics?accountId=…&source=external` 有沒有既有貼文；沒有就測 `sync-external-posts`。
2. 從 onBrand 發一篇後，`source=late` 能查到且 `platformPostId` 等於 `scheduled_posts.externalPostId`。
3. Threads 與 LinkedIn 各連一個帳號，確認四個平台的數字都進 `perf_facts`，成效頁看得到。
