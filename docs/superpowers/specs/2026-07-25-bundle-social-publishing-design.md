# bundle.social 發布供應商導入 — 設計文件

**日期**：2026-07-25
**背景文件**：[`docs/facebook-publish-provider-evaluation-2026-07-25.md`](../../facebook-publish-provider-evaluation-2026-07-25.md)
**狀態**：設計已核准，待實作

---

## 1. 問題與目標

### 問題

OnBrand 目前透過 Pipedream Connect 的 **managed Facebook Pages OAuth app** 發布。該 Meta app 沒有 `pages_read_engagement` / `pages_manage_posts` 的 Advanced Access，導致：

- `/me/accounts` 可列出粉專（`pages_show_list` 有效）
- 但所有 Page 端點被 Meta 拒絕（#100 / #10 / #200）
- 使用者重新連接幾次都一樣

Instagram 走同一條 Facebook OAuth 取 token，**根因完全相同**。LinkedIn 走 Pipedream 的 LinkedIn managed app，狀況未經驗證但風險同類。

### 目標

導入 **bundle.social**（使用其已通過審核的平台 app），讓 Facebook / Instagram / LinkedIn 三個平台的發布不再依賴自建 Meta app。

### 非目標

- 不移除、不重構現有 Pipedream 發布路徑
- 不處理 YouTube / TikTok 發布（目前程式本來就未實作，需要影片）
- 不做舊授權的資料遷移（換供應商必然要使用者重新授權，無遷移路徑）

---

## 2. 已定案的四個決策

| 決策 | 選擇 | 理由 |
|---|---|---|
| 平台範圍 | Facebook + Instagram + LinkedIn 全改 | 三者都有同類的 app 審核風險；一次到位 |
| 新舊共存 | 環境變數開關，全域預設 + 每平台覆寫 | 預設行為零風險，可只切 FB 不動 LinkedIn，出事一鍵回滾 |
| 程式碼隔離 | Pipedream 程式碼**一行不動**，bundle 邏輯全放新檔案 | 降低改動風險；兩條路徑零耦合 |
| 資料模型 | `brands` 新增欄位，舊欄位保留 | 資料庫只加不改；切回 Pipedream 時舊資料仍在 |

---

## 3. 架構

### 3.1 檔案配置

| 檔案 | 狀態 | 職責 |
|---|---|---|
| `server/_core/publishProvider.ts` | 新增 | 純函式，決定平台走哪個供應商 |
| `server/_core/bundleSocial.ts` | 新增 | bundle.social HTTP client |
| `server/_core/bundlePublish.ts` | 新增 | OnBrand 資料 → bundle.social payload 轉換 |
| `server/_core/bundlePublishService.ts` | 新增 | 發布流程編排（讀 teamId → 上傳 → 發文 → 解析錯誤） |
| `server/routers/bundleConnectRouter.ts` | 新增 | 前端連接用的 tRPC 端點 |
| `server/routers/calendarRouter.ts` | **僅插入早期分派** | 現有 facebook / instagram / linkedin 分支不動 |
| `client/src/v2/pages/CalendarPage.tsx` | 小改 | 連接按鈕依 provider 分流 |
| `client/src/v2/pages/RunPage.tsx` | 小改 | 同上 |
| `client/src/v2/components/positioning/BrandSettingsSheet.tsx` | 小改 | 同上，另含連接狀態判斷 |

### 3.1.1 實作時對本節的三處增補

設計定稿後，實作過程中發現三件原設計沒涵蓋的事，均為往上增補、未取消任何原有承諾：

1. **`bundlePublishService.ts` 獨立成第四個模組**——發布流程需要注入資料庫讀取與 HTTP client 才能離線測試；併入 `bundlePublish.ts` 會與 `bundleSocial.ts` 形成循環 import。
2. **`bundleConnectRouter` 多一個 `getProviders` 端點**——前端必須知道每個平台走哪條路，否則得在瀏覽器複製一份環境變數判斷邏輯。
3. **`BrandSettingsSheet.tsx` 一併改動**——它是第三個連接入口，且其「已連接」綠燈原本讀 `brands.fbPageId`；bundle 路徑下該欄位為空，會永遠顯示未連接，因此改為在 bundle 平台上讀 bundle.social 的實際狀態。

### 3.2 供應商開關

```
getPublishProvider(platform, env)
  → env[`PUBLISH_PROVIDER_${PLATFORM.toUpperCase()}`]
  → env.PUBLISH_PROVIDER
  → "pipedream"（預設）
```

回傳 `"pipedream" | "bundle"`。無法辨識的值一律當作 `"pipedream"`（安全預設）。
實作比照 [`pipedreamOAuth.ts`](../../../skills/ai-talent/server/_core/pipedreamOAuth.ts)：接受 `env` 參數以便測試。

### 3.3 calendarRouter 的改動（唯一碰到的既有檔案）

在取得 `caption` 之後、進入 `if (platform === "facebook")` 之前插入：

```ts
if (getPublishProvider(platform) === "bundle") {
  const r = await publishViaBundleSocial({ brandId: row.brandId, platform, caption, imageUrl });
  postId = r.postId;
  permalink = r.permalink;
} else if (platform === "facebook") {
  // ↓ 以下為現有程式碼，完全不動
```

---

## 4. bundle.social API 介面（查證自官方文件）

- **Base URL**：`https://api.bundle.social`
- **驗證**：header `x-api-key: pk_live_...`

| 用途 | 端點 |
|---|---|
| 建立 team | `POST /api/v1/team/` — body `{ name }`（3–80 字），回 `{ id, ... }` |
| 產生連接 portal | `POST /api/v1/social-account/create-portal-link` — body `{ teamId, socialAccountTypes[], redirectUrl?, expiresIn? }`（5–2880 分鐘，預設 10），回 `{ url }` |
| 查連接狀態 | `GET /api/v1/social-account/by-type?teamId=&type=` — 回 `{ id, type, teamId, username, displayName, channels[] }` |
| 從 URL 上傳媒體 | `POST /api/v1/upload/from-url` — 回 `{ id }` |
| 建立貼文 | `POST /api/v1/post/` — 見 4.1 |

平台列舉值：`FACEBOOK` / `INSTAGRAM` / `LINKEDIN` / `YOUTUBE` / `TIKTOK` / `TWITTER` / `THREADS` / `PINTEREST` / `REDDIT` / `DISCORD` / `SLACK` / `MASTODON` / `BLUESKY` / `GOOGLE_BUSINESS` / `SNAPCHAT`

### 4.1 建立貼文

```json
POST /api/v1/post/
{
  "teamId": "team_...",
  "title": "OnBrand scheduled post",
  "postDate": "2026-07-25T10:00:00.000Z",
  "status": "SCHEDULED",
  "socialAccountTypes": ["FACEBOOK"],
  "data": { "FACEBOOK": { "type": "POST", "text": "貼文內容", "uploadIds": [] } },
  "referenceKey": "onbrand-<scheduledPostId>"
}
```

回應含 `id`、`status`、`errors`、`errorsVerbose`、`externalData`（平台 ID 與 permalink）。

### 4.2 已知不確定點：如何「立即發布」

bundle.social 文件對 `DRAFT` 與 `SCHEDULED` 的語意描述互相矛盾——一處說「`DRAFT` + 過去時間 = 立即發布」，OpenAPI 卻把兩者都列為未發布狀態，且未說明立即發布的建議做法。

**決定**：實作採 `status: "SCHEDULED"` + `postDate = 現在`，抽成具名常數 `IMMEDIATE_POST_STATUS` 並加註解。**PoC 第一件要驗證的就是這個**；若行為不符，改一行即可。

---

## 5. 資料模型

```sql
ALTER TABLE brands
  ADD COLUMN bundleTeamId VARCHAR(64) NULL,
  ADD COLUMN bundleConnectedAt DATETIME NULL;
```

照專案慣例走 raw SQL migration（`fbPageId` 亦不在 drizzle schema 內，同樣以 migration 加入）。舊欄位 `fbPageId` / `fbPageName` / `fbConnectedAt` **完全保留不動**。

---

## 6. 連接流程

```
使用者按「連接 Facebook」
  → bundleConnect.getConnectUrl({ brandId, platform })
      1. 讀 brands.bundleTeamId；不存在 → POST /api/v1/team/
         name = "OnBrand #<brandId> <brandName>" → 寫回 DB
      2. POST /api/v1/social-account/create-portal-link
         { teamId, socialAccountTypes: [<PLATFORM>],
           redirectUrl: <回到來源頁>, expiresIn: 30 }
      3. 回傳 { url }
  → 前端開新分頁
  → bundle.social hosted UI 處理 OAuth 與頻道（粉專）選擇
  → 導回 redirectUrl
  → 前端呼叫 getConnectionStatus 確認 → 更新 UI、寫入 bundleConnectedAt
```

**粉專選擇由 bundle.social 的 portal 負責**。現有自建的粉專 picker（`getFacebookPages` / `setBrandFacebookPage`）在 bundle 路徑下不使用，但保留供 Pipedream 路徑使用。

---

## 7. 發布流程

```
calendarRouter.publish
  → getPublishProvider(platform) === "bundle"
  → publishViaBundleSocial({ brandId, platform, caption, imageUrl })
      1. 讀 brands.bundleTeamId
         不存在 → PRECONDITION_FAILED「此品牌尚未連接 <平台>」
      2. imageUrl 存在 → POST /api/v1/upload/from-url → uploadIds
         Instagram 且無圖 → PRECONDITION_FAILED（沿用現有文案）
      3. POST /api/v1/post/（payload 見 4.1）
      4. 檢查回應：status === "ERROR" 或 errors 非空 → 拋錯
      5. 從 externalData 取出 postId 與 permalink 回傳
```

---

## 8. 錯誤處理

沿用現有 router 慣例：

| 情況 | 處理 |
|---|---|
| 缺 API key | `PRECONDITION_FAILED`「發布服務尚未啟用，請聯絡 sowork@sowork.ai」——**不洩漏 env 變數名稱**（`publishRouter` 既有慣例） |
| 品牌未連接 | `PRECONDITION_FAILED` + 中文提示 |
| HTTP 非 2xx | 取 body 截斷 300 字 → `INTERNAL_SERVER_ERROR` |
| 回應 `status: "ERROR"` | 取 `errorsVerbose[PLATFORM]` 訊息 → `INTERNAL_SERVER_ERROR` |
| 逾時 | `AbortSignal.timeout()`：一般呼叫 15s、發布 30s（比照現有） |

---

## 9. 測試

vitest，測試檔放 `server/_core/*.test.ts`，比照既有慣例。

| 測試檔 | 涵蓋 |
|---|---|
| `publishProvider.test.ts` | 預設值、全域覆寫、每平台覆寫、空字串、無法辨識的值 |
| `bundlePublish.test.ts` | FB 純文字 payload、IG 需圖、IG 缺圖報錯、LinkedIn、平台名稱對照、`referenceKey` 格式 |
| `bundleSocial.test.ts` | 注入 `fetchImpl`（比照 [`pipedreamFacebook.ts`](../../../skills/ai-talent/server/_core/pipedreamFacebook.ts) 慣例）驗證 URL / header / body / 錯誤轉譯 |
| `bundlePublishService.test.ts` | 未連接時拒絕發布、純文字不呼叫上傳 API、有圖先上傳、平台錯誤視為失敗、缺 permalink 仍算成功 |

不撰寫打真實 API 的自動化測試——該部分由 PoC 手動驗證。

---

## 10. 上線順序

| # | 步驟 | 執行者 |
|---|---|---|
| 1 | 註冊 bundle.social、於 dashboard 取得 API key | **使用者**（帳號註冊不可代勞） |
| 2 | 以 `admin-write-env-vars` workflow 寫入 `BUNDLE_SOCIAL_API_KEY` | **使用者**（金鑰不經手） |
| 3 | 執行 migration 新增兩個欄位 | 任一 |
| 4 | 設 `PUBLISH_PROVIDER_FACEBOOK=bundle`，用測試粉專 1289526984244075 實測 | 共同 |
| 5 | 驗證 4.2 的立即發布語意；不符則校正常數 | 共同 |
| 6 | 逐一切換 `PUBLISH_PROVIDER_INSTAGRAM` / `_LINKEDIN` | 共同 |

---

## 11. 待驗證事項（PoC 期間確認）

1. **立即發布語意**——`DRAFT` vs `SCHEDULED`（見 4.2）
2. **LinkedIn 帳號型態**——現行發個人動態（`urn:li:person`）；bundle.social 的 LINKEDIN 是否同樣支援個人動態，或僅支援公司頁
3. **TikTok audit 狀態**——未來若要做 TikTok，需確認 bundle.social 是否已通過 TikTok audit（未過審只能發私人）
4. **免費方案額度**——FREE 每月 20 則貼文、3 個社群帳號，僅夠 PoC；正式上線需 PRO（$100/月）以上
5. **team 數量與計費關係**——每個品牌一個 team，需確認 team 數是否影響計費
