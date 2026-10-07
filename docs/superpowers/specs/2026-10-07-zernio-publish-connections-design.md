# Zernio 發布串接 ＋ 通用「品牌 × 供應商 × 平台」連線表 — 設計規格

**日期**：2026-10-07
**分支**：`feat/zernio-publish-connections`（從 `dev` 切出）
**前情**：`docs/facebook-publish-provider-evaluation-2026-07-25.md`（供應商評估）、`2026-07-25-bundle-social-publishing-design.md`（bundle.social 串接，本規格沿用其模式）

---

## 0. 一頁摘要

- 新增第三個發布 provider `zernio`，透過 `PUBLISH_PROVIDER_<PLATFORM>=zernio` 逐平台切換。Pipedream 與 bundle.social 兩條既有路徑**一行都不改**。
- 不再往 `brands` 表加供應商專屬欄位（`fbPageId`、`bundleTeamId` 那種）。改開兩張通用表 `brand_publish_tenants`、`brand_publish_connections`，Zernio 是第一個使用者；未來換任何供應商 DB 零改動。
- 定義 `PublishProviderAdapter` 介面，Zernio 是第一個實作。bundle／Pipedream 包進介面是**下一個 PR**，本 PR 不重構會動的程式碼。
- 支援平台：facebook、instagram、linkedin、threads、x、youtube、tiktok。YouTube／TikTok 目前在 `calendarRouter` 被直接拒絕，切到 zernio 後可真的發影片。
- 不接 webhook、不裝 Zernio SDK（跟其他 connector 一樣用 `fetch`）、不刪舊欄位、不做一品牌多粉專的 UI（資料模型先支援，UI 之後）。

---

## 1. Zernio API 事實（來自 `https://zernio.com/openapi.yaml` v1.226.1，2026-10-07 下載）

| 項目 | 值 |
|---|---|
| Base URL | `https://zernio.com/api` |
| 認證 | `Authorization: Bearer <ZERNIO_API_KEY>` |
| 錯誤格式 | 4xx／5xx 皆為 JSON：`{ error: string, type: "invalid_request_error"\|"authentication_error"\|"permission_error"\|"not_found"\|"rate_limit_error"\|"platform_error"\|"api_error", code?: string, details?: object, docUrl?: string }` |
| Rate limit | 回應帶 `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`；429 帶 `Retry-After` |
| 冪等 | `Idempotency-Key` header（24 小時窗口）；同 key 同 body 重送回 200 與原本結果 |

### 1.1 建立 profile（一品牌一個）

`POST /v1/profiles` body `{ name: string, timezone?: string }` → 201 `{ profile: { _id, name, isDefault, createdAt } }`
- name 在 team 內唯一；重複回 **409**，`code: "profile_name_conflict"`，`details.existingProfileId` 帶既有 id → 直接沿用，不要報錯。
- 帶 `Idempotency-Key: onbrand-brand-<brandId>` 讓重試安全。
- 403 = profile 數量上限；402 = 需付款。

### 1.2 取連線網址

`GET /v1/connect/{platform}?profileId=<id>&redirect_url=<絕對 https URL>&scopes=posting` → 200 `{ authUrl: string }`
- `platform` enum（本 PR 用到的）：`facebook, instagram, linkedin, twitter, tiktok, youtube, threads`。注意 X 的值是 **`twitter`**。
- Facebook／LinkedIn／Instagram（Facebook Login）會在 Zernio 代管的頁面多一步選粉專／組織，不需要我們做 headless。
- 授權完成後 Zernio 把瀏覽器導回 `redirect_url`，並附加 query：`connected=<platform>&profileId=&accountId=&username=&request_id=&stage=`。失敗則附加 `error=<slug>&platform=&error_message=&is_user_fixable=&request_id=&stage=`。我們原本的 query 會保留。
- 同一 profile 可以連多個同平台帳號（例如 3 個粉專）；重連同一帳號會沿用原 accountId。

### 1.3 列出已連帳號

`GET /v1/accounts?profileId=<id>&platform=<platform>&status=connected` → 200 `{ accounts: [{ _id, platform, username, displayName, profileUrl, isActive, profileId: { _id, name } }] }`

### 1.4 解除連線

`DELETE /v1/accounts/{accountId}` → 200 `{ message }`

### 1.5 建立並立即發布

`POST /v1/posts`，headers `Idempotency-Key: onbrand-sp-<scheduledPostId>`，body：

```json
{
  "content": "文案",
  "mediaItems": [{ "type": "image", "url": "https://..." }],
  "platforms": [{ "platform": "instagram", "accountId": "<Zernio account _id>", "platformSpecificData": { } }],
  "publishNow": true
}
```

- `content` 有媒體時可省略，但我們永遠帶。
- `mediaItems[].type`：`image | video | gif | document`，`url` 必須是公開 https（我們的素材 URL 已是）。可省略 type 讓 Zernio 從副檔名推斷，但我們明確帶。
- 回應：**201** `{ post: Post, warnings?: string[] }`；**200** 表示 Idempotency-Key 命中，回原本的 post；**207** `{ post, message, error?, platformResults?: [{ platform, status, error }] }` 表示存了但發布沒全成功。
- `Post.status` enum：`draft | scheduled | publishing | published | partial | failed | cancelled`
- `Post.platforms[]`（`PlatformTarget`）：`{ platform, accountId: SocialAccount|string, status, platformPostId?, platformPostUrl?: string|null, publishedAt?, error? }`
- 24 小時內相同內容＋相同帳號會被 content-hash 去重回 **409**，測試時要注意。

### 1.6 各平台 `platformSpecificData`（本 PR 只帶最少必要）

| 平台 | 本 PR 帶的欄位 | 備註 |
|---|---|---|
| facebook | 無（有影片時不帶 `contentType`，讓 Zernio 當一般影片貼文） | `contentType: "reel"\|"story"` 之後再開 |
| instagram | 無 | 無媒體會被 Instagram 拒絕，所以**本地先擋**：至少 1 張圖或 1 支影片。有影片時 Zernio 自動當 Reel |
| linkedin | 無 | |
| threads | 無 | 文案上限 500，本地先擋 |
| twitter（x） | 無 | 文案上限 280，本地先擋 |
| youtube | `{ title, visibility: "public" }` | title 取文案第一行（去掉 # 開頭的 hashtag 行），最長 100 字；**必須**有影片，本地先擋 |
| tiktok | `{ privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true }` | **必須**有影片，本地先擋。PoC 若 TikTok app 未過審需改 `draft: true`，抽成常數 |

---

## 2. 資料模型

兩張新表，raw SQL 寫在 `docs/migrations/2026-10-07-brand-publish-connections.md`，**同時**在 `skills/ai-talent/drizzle/schema.ts` 加對應的 `mysqlTable` 定義（讓型別與 `db:generate` 一致）。程式碼存取沿用發布層現有慣例：`localPool.execute` 點名欄位，不用 `SELECT *`。

```sql
-- 品牌在某供應商那邊的「租戶」：Zernio profileId、bundle teamId、Pipedream external user id……
CREATE TABLE brand_publish_tenants (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  brandId     INT          NOT NULL,
  provider    VARCHAR(24)  NOT NULL,                 -- 'zernio' | 'bundle' | 'pipedream' | ...
  tenantId    VARCHAR(128) NOT NULL,
  createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_bpt_brand_provider (brandId, provider)
);

-- 該租戶底下、某平台、某個已授權帳號（粉專／IG 商業帳號／頻道……）
CREATE TABLE brand_publish_connections (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  brandId         INT          NOT NULL,
  provider        VARCHAR(24)  NOT NULL,
  platform        VARCHAR(24)  NOT NULL,             -- onBrand 內部值：facebook | instagram | linkedin | threads | x | youtube | tiktok
  accountId       VARCHAR(128) NOT NULL,             -- 供應商端帳號 id（Zernio account _id）
  accountLabel    VARCHAR(255) NULL,                 -- displayName，給 UI
  accountUsername VARCHAR(255) NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'connected',   -- 'connected' | 'disconnected'
  connectedAt     DATETIME(3)  NULL,
  disconnectedAt  DATETIME(3)  NULL,
  meta            JSON         NULL,                 -- 供應商專屬雜項（profileUrl 等），不再開新欄位
  createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_bpc_brand_provider_platform_account (brandId, provider, platform, accountId),
  KEY idx_bpc_lookup (brandId, provider, platform, status)
);
```

- 既有欄位 `brands.fbPageId / fbPageName / fbConnectedAt / bundleTeamId / bundleConnectedAt` **完全不動**。
- 一品牌同平台多帳號：資料模型支援；本 PR 發布時若有多列 `connected`，取 `connectedAt` 最新的一列並 `console.warn`。選擇 UI 是後續。

---

## 3. 後端檔案清單（相對 `skills/ai-talent/server/`）

依賴方向照 `CONTRIBUTING.md`：platform < strategy < content < performance。

### 3.1 platform 層

| 檔案 | 內容 |
|---|---|
| `platform/core/connectors/publish/publishProvider.ts` | `PublishProvider` 加 `"zernio"`，`KNOWN_PROVIDERS` 加 `"zernio"`。**改**。 |
| `platform/core/connectors/publish/publishAdapter.ts` | **新**。介面定義：<br>`interface PublishProviderAdapter { readonly provider: PublishProvider; getConnectUrl(i: { brandId; platform; redirectUrl }): Promise<{ url }>; syncConnections(i: { brandId; platform }): Promise<PublishConnection[]>; disconnect(i: { brandId; platform; accountId }): Promise<void>; publish(i: PublishInput): Promise<PublishResult> }`<br>`PublishInput = { scheduledPostId; brandId; platform; caption; imageUrls; videoUrl; now? }`，`PublishResult = { postId: string\|null; permalink: string\|null }`。`PublishUserError extends Error`（使用者可自行修正的狀態，對應 TRPC `PRECONDITION_FAILED`）。 |
| `platform/core/connectors/publish/connectionStore.ts` | **新**。兩張新表的存取層，全部注入 `Queryable`（同 `publishGate.ts` 的型別）方便測試：`getTenant(pool, brandId, provider)`、`upsertTenant(pool, …)`、`listConnections(pool, brandId, provider, platform, status?)`、`upsertConnections(pool, brandId, provider, platform, accounts[])`（同步：不在清單內的既有列標 `disconnected`，在清單內的 upsert 成 `connected`）、`markDisconnected(pool, …)`。 |
| `platform/core/connectors/zernio.ts` | **新**。薄 client，`createZernioClient({ apiKey, baseUrl?, fetchImpl? })`，仿 `bundleSocial.ts`：`createProfile({ name, idempotencyKey })`（409 profile_name_conflict → 回 `details.existingProfileId`，對呼叫端透明）、`getConnectUrl({ platform, profileId, redirectUrl })`、`listAccounts({ profileId, platform })`、`deleteAccount(accountId)`、`createPost(payload, { idempotencyKey })`（回 `{ httpStatus, body }` 讓上層分辨 201/200/207）。錯誤丟 `ZernioApiError extends Error { status; type?; code?; details? }`，message 格式 `zernio <status>: <error>`。`DEFAULT_TIMEOUT_MS = 15_000`，發文 `30_000`。不得把 API key 寫進任何錯誤訊息或 log。 |
| `platform/core/connectors/publish/zernioPublish.ts` | **新**。純函式，無 I/O：`toZernioPlatform(platform): ZernioPlatform \| undefined`（含 `fb/ig/li/yt/tt` 縮寫與 `x → twitter`）、`CAPTION_LIMIT`、`assertZernioMediaPlan(platform, caption, imageCount, videoCount)`（第 1.6 節的本地檢查，違反丟 `PublishUserError`）、`buildZernioPostPayload({ platform, accountId, caption, imageUrls, videoUrl })`、`youtubeTitleFromCaption(caption)`、`readZernioPublishResult({ httpStatus, body, platform }): PublishResult`（201/200 且該平台 `status === "published"` → 取 `platformPostId`／`platformPostUrl`；207 或 `failed/partial` → 丟 Error，訊息優先用 `platformResults[].error`，其次 `post.platforms[].error`，其次 `body.error`／`body.message`）。 |
| `platform/core/connectors/publish/zernioAdapter.ts` | **新**。`createZernioAdapter({ client, pool, brandNameOf })` 實作 `PublishProviderAdapter`：<br>• `getConnectUrl`：`getTenant` 沒有 → `createProfile`（name `onBrand Studio #<brandId> <brandName>` 截 80 字、idempotencyKey `onbrand-brand-<brandId>`）→ `upsertTenant`；再 `getConnectUrl`。<br>• `syncConnections`：`listAccounts` → `upsertConnections` → 回傳。<br>• `disconnect`：`deleteAccount` → `markDisconnected`。<br>• `publish`：`assertZernioMediaPlan` → `listConnections(connected)` 空 → `PublishUserError("此品牌尚未連接此平台，請先到品牌設定完成連接。")` → 多列取最新 → `createPost(payload, { idempotencyKey: "onbrand-sp-<scheduledPostId>" })` → `readZernioPublishResult`。 |
| `platform/routers/zernioConnectRouter.ts` | **新**。仿 `bundleConnectRouter.ts`，`socialProcedure` 同樣檢查 `SOCIAL_PUBLISH_ENABLED`，缺 `ZERNIO_API_KEY` 回 `PRECONDITION_FAILED`「連接服務尚未啟用，請聯絡 sowork@sowork.ai。」。procedures：<br>• `getProviders`：回 7 個平台各自的 provider（facebook/instagram/linkedin/threads/x/youtube/tiktok）。<br>• `getConnectUrl({ brandId, platform, redirectUrl? })`：`assertBrandAccess` → adapter。redirectUrl 必須是 https 絕對網址；沒給就用既有的 `process.env.APP_URL`（`.env.example` 第 65 行已有）＋ `/brands/edit?b=<brandId>&cat=publish`。<br>• `getConnectionStatus({ brandId, platform })`：adapter.syncConnections → `{ connected, accounts: [{ accountId, name, username }] }`。<br>• `disconnect({ brandId, platform, accountId })`。<br>在 `routers/index.ts` 註冊為 `zernioConnect`。 |

### 3.2 content 層

| 檔案 | 內容 |
|---|---|
| `content/routers/calendarRouter.ts` | 在現有 `if (getPublishProvider(platform) === "bundle") { … }` **之前**加 `if (getPublishProvider(platform) === "zernio") { … }` 分支：缺 `ZERNIO_API_KEY` → `PRECONDITION_FAILED`「發布服務尚未啟用，請聯絡 sowork@sowork.ai。」；建 adapter → `publish({ scheduledPostId: row.id, brandId: row.brandId, platform, caption, imageUrls, videoUrl })`；`PublishUserError` → `PRECONDITION_FAILED`，其他 → `INTERNAL_SERVER_ERROR`。bundle／facebook／linkedin／instagram／youtube／tiktok 既有分支**不改**。 |
| `content/core/publish/publishErrors.ts` | `friendlyPublishError` 的「已是中文就直接放行」判斷加上 `!/zernio \d{3}/.test(text)`（同 bundle 的處理）。RULES 視需要加 Zernio 常見 slug（`platform_error`、`account_limit_exceeded` → 「連接帳號數已達供應商上限」）。 |

### 3.3 環境變數（`.env.example`，根目錄）

```
# Zernio（第三個發布 provider，https://docs.zernio.com）
# 在 https://my.zernio.com 建 team 層級 API key（不要勾限定 profile）。
ZERNIO_API_KEY=
# PUBLISH_PROVIDER_<PLATFORM>=zernio 逐平台切換，例如：
# PUBLISH_PROVIDER_FACEBOOK=zernio
# PUBLISH_PROVIDER_YOUTUBE=zernio
```

---

## 4. 前端（`skills/ai-talent/client/src/v2/strategy/components/positioning/BrandSettingsSheet.tsx` 的 `PublishTab`）

- 新增 `zernioProvidersQ = trpc.zernioConnect.getProviders.useQuery()`，`usesZernio(key)`。
- `PLATFORMS` 清單：`threads` 在 bundle **或** zernio 時顯示；新增 `tiktok` 卡（icon `faTiktok`，文案「上傳影片到 TikTok」），只在 zernio 時顯示；`youtube` 本來就在。X 維持不列（planGate 隱藏）。
- 連接：zernio 平台在 mount 時預抓 `getConnectUrl`（redirectUrl = `window.location.href`），點擊 `window.open(url, "_blank")`；同時啟動輪詢 `getConnectionStatus` 每 2 秒最多 30 秒（同既有 `waitAndDetect` 的節奏）。
- 回來時：`useEffect` 讀 `window.location.search`，若有 `connected=` 或 `error=` 且對應平台是 zernio → 呼叫 `getConnectionStatus` 更新；`error=` 時用既有的 toast／alert 顯示 `error_message`；最後用 `history.replaceState` 把 Zernio 加的 query（`connected, profileId, accountId, username, request_id, stage, error, platform, error_message, is_user_fixable, error_reason`）清掉。
- 已連接狀態：顯示 `accounts[0].name`（多個時顯示「等 N 個」）；提供「解除連接」按鈕 → `disconnect`（有 confirm，跟 Facebook 的一致）。
- 既有 bundle／Pipedream 的 UI 邏輯不動。

---

## 5. 測試（vitest，`cd skills/ai-talent && npx vitest run <path>`）

| 檔案 | 要驗的事 |
|---|---|
| `publish/publishProvider.test.ts` | 既有檔，加 `"zernio"` 被接受、`PUBLISH_PROVIDER_YOUTUBE=zernio` 只影響 youtube。 |
| `connectors/zernio.test.ts` | 注入 `fetchImpl`：Bearer header、路徑與 query、`Idempotency-Key`、409 profile_name_conflict 回 existingProfileId、錯誤 message 不含 API key、createPost 回 `{ httpStatus, body }`。 |
| `publish/zernioPublish.test.ts` | 平台對應（含 `x → twitter`、縮寫）、媒體規則（IG 無媒體擋、YouTube/TikTok 無影片擋、Threads 501 字擋）、payload 形狀、`youtubeTitleFromCaption`、`readZernioPublishResult` 的 201 成功／207 部分失敗／200 冪等命中／`failed` 狀態取錯誤訊息。 |
| `publish/connectionStore.test.ts` | mock `Queryable`：`upsertConnections` 會把不在清單內的列標 disconnected、在清單內的 upsert；`listConnections` 預設只回 connected。 |
| `publish/zernioAdapter.test.ts` | 無 tenant 時先建 profile 再要連線網址；無 connected 帳號時丟 `PublishUserError`；多帳號取最新；Idempotency-Key 格式。 |
| `content/routers/calendarRouter` | 若現有 `publishFlow.integration.test.ts` 有 provider 分流的測試，加一條 zernio 的；沒有就不強求。 |

全部跑完：`cd skills/ai-talent && npx vitest run server/platform/core/connectors server/content/core/publish server/content/routers && npx tsc --noEmit`。client 若有 typecheck 指令也跑。

---

## 6. 明確不做

- 不重構 bundle／Pipedream 成 adapter（下一個 PR）。
- 不刪 `brands` 舊欄位、不寫 backfill。
- 不接 Zernio webhook、不裝 `@zernio/node`。
- 不做 reel／story／carousel 等 `platformSpecificData` 進階選項。
- 不做多帳號選擇 UI。
- 不 push、不開 PR；commit 可以分多個，訊息風格照 repo（中文、`feat(publish): …`）。

---

## 7. 環境隔離：dev 與 prod 各一個 Zernio team

Zernio 沒有 sandbox，每次呼叫都是真的發到真實帳號；profile 名稱在同一 team 內必須唯一，而 dev／prod 資料庫的 brandId 會撞號。所以 **dev 與 prod 各註冊一個 Zernio team、各一把 API key**，分別寫進兩台 VM 的 `.env`。程式碼只讀 `process.env.ZERNIO_API_KEY`，與 `BUNDLE_SOCIAL_API_KEY` 做法相同，不需為此改任何程式。

| 環境 | 分支 | `ZERNIO_API_KEY` | 綁的帳號 | `AUTOPUBLISH_SCHEDULED` |
|---|---|---|---|---|
| dev.onbrand.sowork.ai | dev | dev team 的 key | 測試粉專 1～2 個（落在免費額度） | 關 |
| onbrand.sowork.ai | main | prod team 的 key | 客戶真實帳號 | 維持現狀 |

## 8. 上線前人工步驟（給 Shawn）

1. 在 `https://my.zernio.com` 註冊 dev 用的 team、建 team 層級 API key（不要勾限定 profile）。前 2 個連接帳號免費，不用綁卡；X 要綁卡。prod 的 team 等 dev 跑通再開。
2. dev VM `.env` 加 `ZERNIO_API_KEY=…`，先只設 `PUBLISH_PROVIDER_FACEBOOK=zernio`。
3. 在 dev 資料庫跑 `docs/migrations/2026-10-07-brand-publish-connections.md` 的 SQL。
4. 重啟後到 品牌 → 平台授權 連測試粉專 `1289526984244075`，再到本週企劃按「立即發布」。
5. 確認 `scheduled_posts.externalPostId / externalUrl` 有值。
