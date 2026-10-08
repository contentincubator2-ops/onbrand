# 移除 Pipedream／bundle.social 發布路徑，只留 Zernio — 設計規格

**日期**：2026-10-08
**分支**：`refactor/remove-legacy-publish-providers`（從 `dev` 切出）
**決策**：Shawn 2026-10-07「我已經沒有要用 pipedream, bundle.social 了」。
**前情**：`2026-10-07-zernio-publish-connections-design.md`、`2026-10-07-zernio-connection-lifecycle-design.md`、`2026-10-08-zernio-analytics-sync-design.md`

---

## 0. 一頁摘要

發布、連接、成效三條線現在在 dev 都只走 Zernio，但 Pipedream／bundle.social 的 router、connector、前端 SDK、成效同步、CSP 白名單、文案都還在，平台授權頁載入時還會去打 Pipedream。本 PR 把它們刪乾淨，並順手修兩個文案。

**唯一原則：刪程式碼，不刪資料。** `brands` 的 `fbPageId / fbPageName / fbConnectedAt / bundleTeamId / bundleConnectedAt` 與 `brand_integrations` 的列**一律保留**（不 DROP、不 UPDATE），`scripts/migrate.ts` 裡建這些欄位的段落也保留。它們只剩一個用途：`zernioConnect.getConnectionStatus` 的 `legacyConnected`（「發布服務已升級，請重新授權一次」提示）。

> ⚠️ prod 目前仍靠 Pipedream／bundle.social 發布。本 PR 只進 dev；dev → main 前必須先完成 prod 的 Zernio 設定（team、key、四平台重新授權）。PR 描述要寫明這一點。

---

## 1. 後端（相對 `skills/ai-talent/server/`）

### 1.1 刪除整檔（含對應的 `.test.ts`）

- `content/routers/publishRouter.ts`
- `platform/routers/platformConnectRouter.ts`
- `platform/routers/bundleConnectRouter.ts`
- `content/core/publish/bundlePublishService.ts`
- `platform/core/connectors/bundleSocial.ts`
- `platform/core/connectors/publish/bundlePublish.ts`
- `platform/core/connectors/pipedreamAccounts.ts`、`pipedreamConnect.ts`、`pipedreamFacebook.ts`、`pipedreamOAuth.ts`
- `performance/core/fbPageSync.ts`（見 1.4）

`routers/index.ts` 移除 `publish`、`platformConnect`、`bundleConnect` 三個註冊。`platform/core/teamAccess.ts` 的 `MANAGE_NAMESPACES` 把 `"bundleConnect", "platformConnect"` 換成 `"zernioConnect"`（先確認 zernioConnect 目前是否已受同等權限保護；若它本來就不在任何 namespace 集合裡，加進去並確認現有測試仍過，行為以「editor 以上可連接」為準——照被移除的兩個 namespace 原本的等級）。

### 1.2 `publishProvider.ts`

```ts
export type PublishProvider = "zernio";
/** 2026-10-08：Pipedream／bundle.social 已移除。保留這個函式是為了之後換供應商時仍有單一切換點；
 *  舊環境變數 PUBLISH_PROVIDER / PUBLISH_PROVIDER_<PLATFORM> 的任何值都忽略。 */
export function getPublishProvider(_platform: string, _env: NodeJS.ProcessEnv = process.env): PublishProvider { return "zernio"; }
```

測試改成：任何 env 值（含 `pipedream`、`bundle`、空）都回 `zernio`。

### 1.3 `content/routers/calendarRouter.ts`

`publishScheduledPostInner` 的發布區段只留 Zernio 分支，變成無條件執行（不再 `if (getPublishProvider(...) === "zernio")`）。刪掉：bundle 分支、facebook／linkedin／instagram 的 Pipedream 直打 Graph 分支、youtube／tiktok 的「不支援」分支、`PIPEDREAM_<PLATFORM>_PUBLISH_WEBHOOK` fallback、`_pdGetOAuthToken` 與其他只被這些分支用到的 helper 與 import；SELECT 裡的 `b.fbPageId AS brand_fb_page_id, b.fbPageName AS brand_fb_page_name` 也拿掉。檔頭與 `publish` procedure 上方講 Pipedream webhook 對應表的長註解改寫成一段現況說明。Zernio 不支援的平台由 adapter 的 `PublishUserError("… 尚未支援透過 Zernio 發布。")` 回 `PRECONDITION_FAILED`——行為已存在，不用新增。

### 1.4 成效

- 刪 `performance/core/fbPageSync.ts`。它匯出的 `taipeiDate` 被 `zernioAnalyticsSync.ts` 用到 → 搬到 `performance/core/perfDates.ts`（或既有合適的工具檔）並改 import；其他匯出（`formatOf`、`invalidMetricFrom` 等）若無人使用就一起刪。
- `performance/routers/performanceRouter.ts`：刪 `syncFacebook` procedure 與 `syncFbPage / resolvePage / FbSyncError / fbSyncEnabled` 的使用；`connections` 的 `meta_page` 判斷只看 Zernio 連線（拿掉 `brand_integrations` 的 `facebook_pages` 查詢與 `resolvePage`）。先 grep client 是否還有人呼叫 `performance.syncFacebook`，有就改成 `syncSocial`。
- `server/index.ts`：拿掉 `tickFbPageSync` 的 worker 註冊。

### 1.5 `content/core/publish/publishErrors.ts`

- 「已是中文就放行」的判斷拿掉 `bundle\.social \d{3}`（保留 `zernio \d{3}`）。
- **新增 402 規則（放在 401/403 規則之前）**：`/\b402\b|payment_required|free_tier_exceeded|analytics_addon_required/i` → 中：「發布服務的方案尚未開通這項功能（需要在 Zernio 綁定付款方式），請聯絡 sowork@sowork.ai。」英：`The publishing service plan does not include this feature yet (a payment method is required on Zernio). Contact sowork@sowork.ai.`
- `performance/core/zernioAnalyticsSync.ts`：`ZernioApiError` 且 `status === 402` 時，平台錯誤訊息改用上面那句中文（現在一律寫「請確認帳號授權後重試」，402 時是誤導）。其他狀態碼維持原訊息。

### 1.6 其他

- `server/index.ts` 的 helmet CSP：`scriptSrc`、`connectSrc`、`frameSrc` 移除所有 `pipedream` 來源，相關長註解精簡成一行歷史說明。
- `platform/core/ops/touchpoints.ts`：目前用 `brands.bundleConnectedAt` 判斷「已連接」。改成查 `brand_publish_connections` 是否有 `provider='zernio' AND status='connected'` 的列；註解同步更新。測試跟著改。
- `zernioConnectRouter.ts`：`getProviders` 保留（前端還在用），回傳值現在恆為 `zernio`；檔內提到 bundle／Pipedream 的註解更新。`legacyConnected` 的 SQL 保留。
- `.env.example`：刪 `PIPEDREAM_*`、`BUNDLE_SOCIAL_API_KEY`、`PUBLISH_PROVIDER*` 的段落；Zernio 段落的註解改成「唯一的發布供應商」。
- 只在註解裡提到 Pipedream 的檔案（`cloudTokens.ts`、`startupCleanup.ts`）：不用動。

---

## 2. 前端（相對 `skills/ai-talent/client/`）

- `package.json` 移除 `@pipedream/sdk`，更新 lockfile（照 repo 現有的套件管理器）。
- `src/v2/strategy/components/positioning/BrandSettingsSheet.tsx` 的 `PublishTab`：只留 Zernio。刪掉所有 `publish.*`、`platformConnect.*`、`bundleConnect.*` 的 query／mutation、Pipedream SDK 預載與 token 快取、`waitAndDetect`、Facebook 粉專挑選器、`disconnectFacebook`、「匯入語氣範例（importFbPostsForDNA）」區塊、`usesBundle`／`usesZernio` 分流（卡片一律走 Zernio 流程）。四張卡不變（Facebook、Instagram、LinkedIn、Threads）。
  **底部說明文字**改成：中「onBrand Studio 不會儲存你的密碼。授權由發布服務 Zernio 代管，每個品牌獨立。要撤銷授權，按該平台的『解除連接』即可。」英：`onBrand Studio never stores your passwords. Authorization is held by our publishing service, Zernio, isolated per brand. To revoke it, use Disconnect on that platform.`
- `src/v2/content/pages/RunPage.tsx`：移除 Pipedream SDK 預載、`publish.getBrandFacebookStatus / getFacebookPages / setBrandFacebookPage` 與整段「在成品頁直接跳 Pipedream 授權＋挑粉專」的流程（約 440～500 行與 3519 行附近的使用處）。原本在這裡提示「先連接 Facebook」的地方，改成一個連到 `publishSettingsUrl(brandId)` 的「去連接」連結（`v2/platform/lib/publishSettingsUrl.ts` 已存在）。成品頁的排程、預覽、下載等其他功能不得受影響。
- `src/v2/content/lib/captionLimits.ts`：註解裡指向 `bundlePublish.ts` 的路徑改指 `zernioPublish.ts`；數值不動。
- `src/v2/platform/pages/legal/PrivacyPage.tsx`、`RefundPage.tsx`：把第三方服務清單裡的 Pipedream 換成 Zernio（中英文都改；Privacy 那段照原本的句型描述「代管社群平台授權與發布」）。

---

## 3. GitHub workflows

刪除（先各自打開確認內容確實只跟 Pipedream／bundle.social 有關）：
`admin-write-bundle-social-env.yml`、`admin-write-pipedream-env.yml`、`admin-write-pipedream-publish-webhooks.yml`、`op-diagnose-pipedream-fb.yml`、`ops-probe-pipedream.yml`。

`op-fix-bundle-drift.yml`、`op-monitor-bundle-drift.yml` **不要刪**（那是前端打包檔的 bundle，不是 bundle.social）。
`admin-write-zernio-env.yml`：平台選項從 `["pipedream","bundle","zernio","keep"]` 簡化掉不再有意義的值很誘人，但**這輪不動**（它在 main 上，另外處理）。
`op-migrate.yml` 等若有檢查 `fbPageId` 欄位存在的段落：不動（欄位還在）。

---

## 4. 測試

- 刪除被移除模組的測試檔。
- `publishFlow.integration.test.ts`、`scheduledPublishWorker.test.ts`、`calendarPublishPermission.test.ts`：把預設走 bundle／Pipedream mock 的案例改成走 Zernio adapter mock；原本驗「bundle 路徑」的案例刪除或改寫成 Zernio 等價案例（核准門檻、ownerId 權限、重試、worker claim、未核准提示這些**行為案例一個都不能少**）。
- `publishErrors.test.ts`：補 402 規則；移除 bundle 專屬案例。
- `performanceRouter.analytics.test.ts`：`connections` 只看 Zernio；`syncFacebook` 相關案例移除。
- `zernioAnalyticsSync.test.ts`：402 時的平台錯誤訊息。
- `touchpoints.test.ts`：改成 Zernio 連線。
- `BrandSettingsSheet.test.tsx`：mock 掉的 legacy procedure 一併清掉；補「底部說明含 Zernio、不含 Pipedream」。
- 最後全套都要過：`cd skills/ai-talent && COVERS_DIR=<暫存> npx vitest run && npx tsc --noEmit && npx tsc --noEmit -p client`。
- 收尾檢查（結果貼進報告）：`grep -rniE 'pipedream|bundle\.social|bundleSocial|bundleConnect|platformConnect' skills/ai-talent/server skills/ai-talent/client/src --include='*.ts' --include='*.tsx'` 只應剩下：`scripts/` 或註解中的歷史說明、`legacyConnected` 的欄位名稱、`migrate.ts`。逐筆列出剩下的並說明為什麼留。

---

## 5. 明確不做

- 不 DROP／UPDATE 任何資料表欄位或列；不改 `scripts/migrate.ts` 與 `drizzle/schema.ts`。
- 不動 `docs/` 底下的歷史文件。
- 不動 main 上的 workflow（`admin-write-zernio-env.yml`）。
- 不把 YouTube／TikTok／X 的卡片加回前端。
- 不 push、不開 PR；commit 可分多個，中文訊息 `refactor(publish): …`／`fix(publish): …`，結尾 `Co-Authored-By: Codex <noreply@openai.com>`。
