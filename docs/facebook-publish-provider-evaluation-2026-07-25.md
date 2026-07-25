# Facebook 發布失敗排查 ＋ 社群發布供應商評估

**日期**：2026-07-25
**觸發事件**：brand 2958（開發測試用）在 `/calendar?b=2958` 按「立即發布」失敗
**狀態**：根因已確認；解法待決策

---

## 0. 一頁摘要

**原始問題**
使用者在 `/calendar?b=2958` 按「立即發布」→ 連接 Facebook → 成功看到並授權粉專「測試用粉專」(1289526984244075) → 綁定成功 → 再按「立即發布」卻出現「Facebook 授權只能列出粉專，缺少讀取／發布權限」。同時 Pipedream Connect users 頁面確實查得到已綁定的 Facebook 帳號 —— **綁定看起來成功，發布卻失敗**，要排查到底哪裡有問題。

**排查結論**
不是 OnBrand 綁定壞掉，也不是 Pipedream 沒存到帳號。**Meta 端只讓 `pages_show_list` 生效**：授權紀錄裡有 `pages_read_engagement` / `pages_manage_posts`，但所有 Page 端點一律被 Meta 拒絕（#100 / #10 / #200）。這是「OAuth 應用程式沒有 Advanced Access、且連接者不是該 Meta app 的角色成員」的典型症狀。而 OnBrand 目前走的是 **Pipedream 內建的 managed Facebook Pages OAuth app**，因為 `PIPEDREAM_FACEBOOK_OAUTH_APP_ID` 從未寫入 production `.env`。

**所以「重新連接 Facebook」按幾次都不會好**——每次都連到同一個沒有發布權限的 Meta app。

**為什麼延伸出供應商評估**
根因確認後，唯一的解法是「換一個有 Advanced Access 的 Meta app」。這有兩條路：

- **A. 自建 Meta app** 並送 App Review（1–2 週，品牌顯示為 OnBrand）
- **B. 改用第三方統一發布 API**，直接使用對方已過審的 app（免審核，但授權畫面顯示對方名字）

使用者要求評估 B 是否真的可行、是否撐得住 OnBrand「多租戶、很多使用者綁自己社群帳號發文」的模型，因此有了第 5–8 章的供應商調查。

---

## 1. 症狀

使用者流程：

1. 在 `/calendar?b=2958` 按「立即發布」
2. 按「連接 Facebook」→ Pipedream Connect popup → **成功看到粉專「測試用粉專」(1289526984244075) 並完成授權**
3. 綁定成功，Pipedream Connect users 頁面確實有這個帳號
4. 回到頁面再按「立即發布」→ 失敗：

> ⚠️ Facebook 授權只能列出粉專，缺少讀取／發布權限。請重新連接 Facebook；若仍失敗，請聯絡客服更新 Meta 授權應用程式。

訊息來源：[`calendarRouter.ts:425`](../skills/ai-talent/server/routers/calendarRouter.ts)

---

## 2. 排查方法與證據

### 2.1 做了哪些查詢

依 systematic-debugging 流程，先定位錯誤來源、再逐層蒐證，**確認根因前不動任何修改**：

| # | 查詢動作 | 得到什麼 |
|---|---|---|
| 1 | 全 repo grep 錯誤訊息字串「只能列出粉專」 | 定位到 [`calendarRouter.ts:425`](../skills/ai-talent/server/routers/calendarRouter.ts)（server 端）與 `CalendarPage.tsx:303`（前端另一段文案），確認使用者看到的是 server 丟出的 |
| 2 | 讀發布主流程程式碼 | 釐清資料流：`_pdGetAccountContext` → `probePipedreamFacebookAccounts`（`/me/accounts`）→ 取 Page token → **發布前先驗證 `GET /{pageId}`** → `POST /{pageId}/feed`。錯誤出在「驗證」那一步（:409–427） |
| 3 | 讀 [`pipedreamOAuth.ts`](../skills/ai-talent/server/_core/pipedreamOAuth.ts) / [`pipedreamFacebook.ts`](../skills/ai-talent/server/_core/pipedreamFacebook.ts) / [`publishRouter.ts`](../skills/ai-talent/server/routers/publishRouter.ts) | 發現 Connect URL 會帶 `oauthAppId`，而該值來自環境變數 `PIPEDREAM_FACEBOOK_OAUTH_APP_ID` |
| 4 | 看近期 commits（ee29649b 等 5 筆） | 得知前一輪已加入「自訂 OAuth client 支援」，且已有 ops 診斷 workflow 存在 |
| 5 | 抓 GitHub Actions run **30147642503** 完整 log | **決定性證據**：Pipedream 帳號正常、粉專列得出來、Page token 拿得到，但所有 Page 端點被 Meta 拒絕（見 2.2–2.4） |
| 6 | `gh secret list` ＋ grep 全部 workflow ＋ 查 `admin-write-env-vars` 最後執行時間 | 確認 `PIPEDREAM_FACEBOOK_OAUTH_APP_ID` **從未被寫進 production `.env`**（無對應 secret、無 workflow 寫入、最後一次寫 env 是 2026-06-01） |
| 7 | 比對 CI/Deploy 執行時間 vs Pipedream 帳號建立時間 | ee29649b 部署完成 05:37Z、帳號建立 05:59Z → 該次連接跑的是新版程式，但 `oauthAppId` 仍為 null，證明走的是 managed app |
| 8 | 瀏覽器查 Pipedream Connect / Meta 帳號設定頁 | **未取得額外證據**：該瀏覽器未登入 Pipedream；Facebook 設定頁已改版，找不到 Business Integrations 清單。此路徑放棄，不影響結論 |

### 2.2 連接層——完全正常

```
• app=facebook_pages  id=apn_gyhxpZL  name=Shawn Yu-Hsiang Pan
  healthy: true
  created_at: 2026-07-25T05:59:54+00:00
  authorized_scopes = [email, public_profile, pages_manage_engagement,
                       pages_manage_posts, pages_show_list,
                       pages_read_user_content, pages_read_engagement,
                       business_management]
```

DB 綁定也正確：

```
2958  開發測試用  1289526984244075  測試用粉專  2026-07-25 05:18:13
```

### 2.3 列出粉專——正常

```
• account=apn_gyhxpZL HTTP=200 pages=1 [測試用粉專 (1289526984244075)]
  listed=True  has_page_token=True
  tasks=['MODERATE','MESSAGING','ANALYZE','ADVERTISE','CREATE_CONTENT','MANAGE']
```

`tasks` 含 `MANAGE` / `CREATE_CONTENT` → **使用者在粉專端確實是完整管理員**，不是權限不足。

### 2.4 拿 Page token 打真正的端點——全部失敗

| 呼叫 | 結果 |
|---|---|
| `GET /me`（page token） | `(#100) ... requires 'pages_read_engagement' permission or the 'Page Public Content Access' feature` |
| `GET /1289526984244075` | 同上 |
| `GET /{page}/feed` | `(#10) requires 'pages_read_engagement' ...` |
| `GET /me/businesses` | `(#100) Missing Permission` |
| `POST /{page}/feed`（實際試發） | `(#200) requires both pages_read_engagement and pages_manage_posts` |

**只有 `pages_show_list` 真正生效。**

---

## 3. 根本原因

「授權紀錄有、Graph API 不認」是 Meta 的固定症狀：

> **該 OAuth 應用程式的 Pages 權限只有 Standard Access（未通過 App Review / 沒有 Advanced Access），而連接者不是該 Meta app 的角色成員（Admin / Developer / Tester）。**

這種狀態下 Meta 照樣讓使用者在對話框勾選、Pipedream 照樣記成 granted，但所有 Page 端點一律回 #100 / #10 / #200。錯誤訊息中的 "or the 'Page Public Content Access' feature" 就是在指 App Review 的 feature。

### 3.1 為什麼「重新連接」永遠不會好

OnBrand 目前用的是 **Pipedream 內建（managed）的 Facebook Pages OAuth app**：

- 提交 ee29649b 已加入自訂 OAuth client 支援 → [`pipedreamOAuth.ts`](../skills/ai-talent/server/_core/pipedreamOAuth.ts) 讀取 `PIPEDREAM_FACEBOOK_OAUTH_APP_ID`
- **但這個環境變數從來沒有被寫進 production `.env`**：
  - repo 沒有對應的 GitHub secret（`gh secret list` 查無）
  - 沒有任何 workflow 寫入它（只出現在 `.env.example`）
  - 最後一次執行 `admin-write-env-vars` 是 2026-06-01
- ee29649b 部署完成於 05:37Z，使用者帳號建立於 05:59:54Z → 該次連接時 `oauthAppId = null`，走的仍是 managed app

**結論：每次重新連接都會連到同一個沒有發布權限的 Meta app。使用者按幾次都一樣。**

### 3.2 尚未量測的一項

`GET /me/permissions`（user token 經 Pipedream proxy）可以 100% 區分：

- (a) app 層級沒有 Advanced Access ← 目前推斷
- (b) 使用者在授權對話框取消勾選了粉專權限

推斷 (a) 的依據：Pipedream 回傳的 `authorized_scopes` 包含 `email`，而 `email` 不在該 app 任何 `scope_profile` 內 → 這份清單比較像 Meta 實際授予的結果，而非請求清單。但這是推論，不是量測。

**待辦**：在 `op-diagnose-pipedream-fb.yml` 加一個 `/me/permissions` probe（推分支後 dispatch 即可，push 分支不會觸發部署，只有 push main 會）。

---

## 4. 解法選項

### 選項 A：自建 Meta app

1. 建立 Business 類型 Meta app + Facebook Login for Business
2. 送 App Review 取得 `pages_show_list` / `pages_read_engagement` / `pages_manage_posts` 的 **Advanced Access**（標準組合，通常 1–2 週）
3. 在 Pipedream workspace 建 custom OAuth client → 取得 `oa_...`
4. 用 `admin-write-env-vars` workflow 寫入 `PIPEDREAM_FACEBOOK_OAUTH_APP_ID=oa_...`
5. 請使用者重新連接一次

程式碼端**已經備好**，只差這個值。

**短期驗證捷徑**：把測試 FB 帳號加入自家 Meta app 的角色（Admin / Developer / Tester），即使還沒過審也能正常讀寫粉專 —— 可先在測試粉專跑通全流程。

### 選項 B：改用第三方統一發布 API

用對方**已通過 Meta 審核的 app**，自己完全不用建 Meta app。這是產業標準做法（Buffer / Hootsuite / Later 本質相同）。

---

## 5. 第三方方案評估

> 本章回答的是：**選項 B 在 OnBrand「多租戶、很多使用者綁自己的社群帳號發文」的模型下，是否真的可行。**

### 5.1 不能繞過的結構性取捨

**用第三方的 app，Meta 授權畫面上顯示的是「對方的名字」，不是 OnBrand。** 這是 OAuth 的結構限制。

Post for Me 文件把這點寫得最誠實，直接提供兩種模式：

> **Quickstart Project**：Use Post for Me credentials across every platform. **No developer approval needed.**
> **White Label Project**：Use **your own** developer credentials so **users see your app name** in OAuth.

Ayrshare 的 "white-label" 只白到 linking page（`profile.ayrshare.com`，可換 logo / CSS / favicon），**Meta 的權限對話框白不了**。

決策軸：`要品牌 → 自建 Meta app` vs `要速度、免審核 → 用第三方，使用者看到對方名字`。

### 5.2 候選比較

| 服務 | 免自建 Meta app | 多租戶模型 | 價格 |
|---|---|---|---|
| **[bundle.social](https://bundle.social/multi-tenant-social-media-api)** | ✅ 文件寫明 OAuth 是「使用者授權給 bundle.social」 | Team = 客戶 workspace，資料隔離，**帳號數不限** | Free $0（20 posts/月、3 帳號）／Pro $100（10k posts/月）／Business $400（100k posts/月） |
| **[Ayrshare](https://www.ayrshare.com/pricing/)** | ✅ 宣稱持有 Meta Tech Provider approval；文件中只有 X/Twitter 有 BYO keys，Meta 沒有 | JWT SSO + 白牌 linking page，每租戶一個隔離 profile | Premium $149（1 profile）／Launch $299（10）／Business $599（含 30），加購 $8.99/profile/月，101–500 降至 $3.49 |
| **[Post for Me](https://www.postforme.dev/)** | ✅ Quickstart 模式用他們憑證 | 帳號、成員皆不限 | $10/月（1,000 posts/月） |
| **[Zernio（原 getlate.dev）](https://zernio.com/pricing)** | ✅ 宣稱 no developer apps needed | 按帳號計費 | 前 2 帳號免費／3–10 $6 ea／11–100 $3 ea／101+ $1 ea |

**成本模擬（100 個品牌各綁一個粉專）**：

| 服務 | 月費 |
|---|---|
| Ayrshare | ≈ $1,228（$599 + 70 × $8.99） |
| bundle.social | $400（不限帳號數） |
| Post for Me | $10 |

### 5.3 明確不符合需求（避免走冤枉路）

| 類別 | 服務 | 為什麼不行 |
|---|---|---|
| OAuth 中介 | Nango / Paragon / Composio / **Pipedream** | 只是 OAuth 基礎設施，**最終仍要你自己的 Meta app**。換成 Nango 結果一模一樣 |
| 自架方案 | Postiz / Mixpost | 開源自架 = 自己當 Pipedream，一樣要自建 Meta app |
| 既有 SaaS | Buffer / Hootsuite | 不開放這種嵌入式轉售 |

---

## 6. 平台涵蓋度

### 6.1 專案實際需求（從程式碼查證，非 UI 推測）

| 平台 | 程式碼現況 |
|---|---|
| Facebook Page | ✅ 已實作 → [`calendarRouter.ts:363`](../skills/ai-talent/server/routers/calendarRouter.ts) |
| Instagram Business | ✅ 已實作，需圖片 → [`calendarRouter.ts:505`](../skills/ai-talent/server/routers/calendarRouter.ts) |
| LinkedIn | ✅ 已實作，發**個人動態**（`urn:li:person`）→ [`calendarRouter.ts:456`](../skills/ai-talent/server/routers/calendarRouter.ts) |
| YouTube | ⚠️ 連接層有（[`platformConnectRouter.ts:28`](../skills/ai-talent/server/routers/platformConnectRouter.ts)），發布直接擋掉「需要影片」 |
| TikTok | ⚠️ 同上，發布未實作 |
| Threads | ❌ 只有顏色定義，無實作 |
| Email / PR | 非社群平台，走 webhook fallback |

**眼前真正要的是 FB + IG + LinkedIn**，TikTok / YouTube 屬未來。

### 6.2 四家涵蓋度——全中，不是差異點

| | Ayrshare | bundle.social | Post for Me | Zernio |
|---|---|---|---|---|
| Facebook Page | ✅ | ✅ | ✅ | ✅ |
| Instagram | ✅ | ✅ | ✅ | ✅ |
| LinkedIn | ✅ | ✅ | ✅ | ✅ |
| YouTube | ✅ | ✅ | ✅ | ✅ |
| TikTok | ✅ | ✅ | ✅（含 TikTok Business） | ✅ |
| 其他 | Threads, X, Pinterest, Reddit, Bluesky, Snapchat, Telegram, GBP | Threads, X, Pinterest, Reddit, Bluesky, Mastodon, GBP, Discord, Slack | Threads, X, Pinterest, Bluesky | 13 個平台 |

### 6.3 深度——這五點才是要書面確認的

1. **TikTok 是否已通過 audit**（最大陷阱）
   未過審的 app 只能發**私人（SELF_ONLY）**，且 24 小時內限 5 個使用者。
   [Ayrshare 文件明確支援 `visibility: public`](https://www.ayrshare.com/docs/apis/post/social-networks/tiktok) → 已過審。**另外三家未找到明文，必須問到書面答覆。**
2. **TikTok 平台硬限制**：6 部/分鐘、15 部/日。按創作者計算、跨所有 API client 共用（多租戶不受影響，同一創作者會撞牆）。
3. **LinkedIn 個人 vs 公司頁是兩套權限**。目前發個人動態；若要發公司頁，供應商需具備 LinkedIn Community Management API 權限（審核很難拿）。
4. **YouTube Data API 上傳配額**：預設額度換算下來一天上傳不了幾支，多租戶要看供應商有無申請提升。目前未做影片發布，可延後確認。
5. **Instagram**：一律需 Business / Creator 帳號 + 綁粉專、不能純文字 —— 程式已處理。

---

## 7. 採用度

### 7.1 npm 官方 SDK 下載量（2026-06-25 ~ 07-24，查 npm API）

| 服務 | 套件 | 下載量 |
|---|---|---|
| Zernio | `@zernio/node` 62,195 ＋ `@getlatedev/node` 28,598（同套改名） | ≈ 90,000 |
| bundle.social | `bundlesocial` | 11,439 |
| Ayrshare | `social-media-api` 6,207（舊包 `social-post-api` 530） | ≈ 6,700 |
| Post for Me | `post-for-me` | 2,088 |

**解讀須打折**：npm 下載量會被 CI／鏡像灌水，且 Ayrshare 客戶大量直接打 REST 或用 Python，不經 npm。此數字反映「JS 生態活躍度」，不等於營收或客戶數。

### 7.2 其他信號

- **Ayrshare** —— 市場最老、文件最完整，G2／Capterra／SourceForge 皆有列（G2 僅 7 則評論、3.9 星，樣本小）。**2025-10 被 saas.group 收購** → 有母公司支撐、倒閉風險低，但可能調價或轉型。企業採用穩定度最佳。
- **bundle.social** —— SDK / CLI / MCP server 三件套齊全，文件對多租戶（team = 客戶 workspace）說明最清楚，下載量約 Ayrshare 兩倍。
- **Zernio** —— 下載量最高，但剛從 getlate.dev 改名，兩套件版本號相同（`0.2.419`）表示同套雙掛。半年內換過品牌，對長期基礎設施是減分。
- **Post for Me** —— 一人／小團隊（daymoon.dev），最便宜也最脆弱。適合 PoC，不適合單押。

---

## 8. 多租戶必問三問（簽約前取得書面答覆）

1. **Rate limit 隔離**：他們的 app 目前服務多少個 Page？是否遇過 app-level throttling？（Meta Pages 發文主要按 Page 計，但 IG 與部分端點有 app 層級上限，租戶多了會互相排擠）
2. **單點風險**：他們的 Meta app 若被降級或停權，**OnBrand 全體租戶同時斷線且無法自救**。是否有多 app 分流、SLA、過往事故紀錄？
3. **資料合規**：貼文內容與 token 全部經過第三方 → 需要 DPA；台灣企業客戶可能要求資料落地。

---

## 9. 建議路線：兩段式，不要二選一

**現在（解阻塞）**
接 bundle.social 或 Post for Me 免費／低價方案，用測試粉專 `1289526984244075` 實測「連接 → 發文」跑通。上述所有結論皆來自官方文件，**文件不等於你的實際情境跑得動 —— PoC 是唯一 100% 確認的方法**。

**同時進行（不要停）**
仍然申請自家 Meta app 的 Advanced Access。理由：

1. 授權畫面顯示 OnBrand 才是品牌該有的樣子
2. 長期成本（100 租戶起，第三方年費相當可觀）
3. 不被單一供應商綁死

第三方可作為過渡，也可長期並存（自家 app 為主、第三方為備援）。

**附帶考量**：LinkedIn、Instagram、TikTok 各自都有同一類審核問題（[`calendarRouter.ts:456`](../skills/ai-talent/server/routers/calendarRouter.ts) 的 LinkedIn 路徑遲早會撞到同樣的牆）。這反而讓第三方統一 API 更划算 —— 一次解決全平台審核。

---

## 10. 待辦

| 項目 | 說明 |
|---|---|
| `/me/permissions` probe | 加進 `op-diagnose-pipedream-fb.yml`，100% 確認 granted vs declined |
| 錯誤文案 | [`calendarRouter.ts:425`](../skills/ai-talent/server/routers/calendarRouter.ts) 現在叫使用者「請重新連接 Facebook」是無解迴圈，應改為「此 Meta 應用程式尚未取得發布權限，請聯絡客服」 |
| PoC | bundle.social（主）＋ Ayrshare（對照），各跑一次連接與發文 |
| Provider adapter | 把 Facebook 分支改成可切換的 provider adapter，讓兩家並排實測且不破壞現有 Pipedream 路徑 |
| 供應商書面確認 | TikTok audit 狀態、rate limit 隔離、單點風險、DPA |
| Meta App Review | 自家 app 的 Advanced Access 申請清單 |

---

## 附錄 A：關鍵程式位置

| 檔案 | 用途 |
|---|---|
| [`server/routers/calendarRouter.ts`](../skills/ai-talent/server/routers/calendarRouter.ts) | 發布主流程；FB 於 :363，權限驗證 :409–427，LinkedIn :456，IG :505 |
| [`server/routers/publishRouter.ts`](../skills/ai-talent/server/routers/publishRouter.ts) | Connect URL 產生（:186 讀 oauthAppId）、`getFacebookPages` |
| [`server/routers/platformConnectRouter.ts`](../skills/ai-talent/server/routers/platformConnectRouter.ts) | Pipedream Connect token；平台 → app slug 對照 :28 |
| [`server/_core/pipedreamOAuth.ts`](../skills/ai-talent/server/_core/pipedreamOAuth.ts) | 讀 `PIPEDREAM_FACEBOOK_OAUTH_APP_ID` |
| [`server/_core/pipedreamFacebook.ts`](../skills/ai-talent/server/_core/pipedreamFacebook.ts) | 多帳號 probe、Page token 可用性驗證 |
| [`client/src/v2/pages/CalendarPage.tsx`](../skills/ai-talent/client/src/v2/pages/CalendarPage.tsx) | 前端連接流程；:296 的「已連接但無 oauthAppId」擋門邏輯 |

## 附錄 B：診斷工具用法

```
gh workflow run op-diagnose-pipedream-fb.yml \
  -f user_id=brand-2958 \
  -f page_id=1289526984244075
```

輸出包含：Pipedream 帳號清單與 scopes、`/me/accounts` 探測、Page token 對 identity/page/feed 三種呼叫的結果、businesses 探測、DB 綁定狀態。

---

## 附錄 C：資料來源

- [Ayrshare Pricing](https://www.ayrshare.com/pricing/)、[Business Plan Overview](https://www.ayrshare.com/docs/multiple-users/business-plan-overview)、[使用者連接整合](https://www.ayrshare.com/docs/multiple-users/api-integration-business.md)、[TikTok API 文件](https://www.ayrshare.com/docs/apis/post/social-networks/tiktok)、[Digital Agencies 用例](https://www.ayrshare.com/use-cases/digital-agencies/)、[G2 競品頁](https://www.g2.com/products/ayrshare-api/competitors/alternatives)
- [bundle.social 多租戶 API](https://bundle.social/multi-tenant-social-media-api)、[Facebook API](https://bundle.social/facebook-api)、[功能與平台](https://bundle.social/features)、[Pricing](https://bundle.social/pricing)、[Connect Social Accounts](https://info.bundle.social/api-reference/connect-social-accounts)
- [Post for Me](https://www.postforme.dev/)、[FAQ](https://www.postforme.dev/faq)、[Pricing](https://www.postforme.dev/pricing)
- [Zernio Pricing](https://zernio.com/pricing)
- [TikTok Content Posting API Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines)
- npm downloads API：`social-media-api`、`social-post-api`、`bundlesocial`、`@zernio/node`、`@getlatedev/node`、`post-for-me`
