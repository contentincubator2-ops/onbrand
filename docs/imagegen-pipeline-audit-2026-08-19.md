# 產圖 prompt 管線獨立稽核

日期：2026-08-19  
範圍：A 自動配圖、B RunPage 手動改配圖、C 真實產品圖 subject mode  
分支：`hotfix/imagegen-audit`  
狀態：已修正下列會造成錯誤輸出、靜默降級或錯誤扣點的問題；未 commit / push / 開 PR。

## 依嚴重度排序的發現

### 1. Critical — 產品圖失效時，product-scoped 自動任務靜默改生虛構產品

- 位置：`server/_core/quickTaskOrchestra.ts` 的 `loadProductImageUrl`（約 1500）、`genOneImage`（約 1555）、Stage 3 / tail / carousel 呼叫（約 2520、2580、2770）。
- 已確認的失敗情境：任務帶 `productId`，但 positioning 沒有圖片、URL 失效、回傳非圖片，或 probe 逾時。舊程式把所有狀況壓成 `subjectImageUrl = null`，`genOneImage` 隨即判定 `subjectMode = false`，改走 Imagen/Flux text-to-image；卡片可能顯示 `ready`，但產品是模型虛構的。
- 嚴重度理由：使用者指定的真實產品被替換，且成功狀態掩蓋了違反產品保真的事實。
- 修正：新增 `productSubjectPolicy.ts`，保留「要求真實產品」與「URL 是否可用」兩個獨立狀態。product-scoped 且無可用圖時，主圖、影片尾格、carousel cards 一律 fail closed，回傳「已停止生圖，避免產生虛構產品」。
- 測試：`server/_core/productSubjectPolicy.test.ts`。

### 2. High — 自動 Imagen 4 完全忽略 aspect ratio；其他 adapter 也把 4:3 / 3:4 送成正方形

- 位置：`server/_core/mediaGen.ts:114-119, 128, 166, 235-266`。
- 已確認的失敗情境：IG Story / Live / Reel 傳入 `9:16`，舊 `genImagen4` request 只有 `{ sampleCount: 1 }`，供應商收到預設比例；手動 media flow 傳 `4:3` 或 `3:4` 給 OpenAI/Azure 時，舊 size mapping 也落到 `1024x1024`。
- 嚴重度理由：成品尺寸與任務格式直接不符；Live/Story 直式素材會得到錯誤版型。
- 修正：Imagen request 實際送出 `aspectRatio`；OpenAI/Azure 共用完整的 1:1、4:3、3:4、16:9、9:16 size mapping。
- 測試：`server/_core/mediaGen.test.ts` 覆蓋 Imagen `9:16`、OpenAI `4:3`、Azure `3:4` request body。

### 3. High — 手動換圖只更新 nested prompt，舊資料的 flat prompt 仍優先顯示

- 位置：`client/src/v2/pages/RunPage.tsx:175-180` 的讀取優先序；`server/routers/outputRouter.ts:268-289`；`server/_core/variantImageUpdate.ts:17-67`。
- 已確認的失敗情境：舊 variant 同時有 `imagePrompt="old"` 與 `image.prompt="old"`。使用新指令生圖後，舊 router 只寫 `image.prompt="new"`，但 RunPage 先讀 `v.imagePrompt`，所以新圖旁仍顯示 `old`。
- 嚴重度理由：這會重新製造「畫面顯示的 prompt 從未送給模型」的核心客訴，而且 reload 後持續存在。
- 修正：新增單一 `applyVariantImageUpdate`，nested `image.*` 與 flat `imageUrl/imageStatus/imageStyle/imagePrompt/imagePromptZh` 同步寫回；也同步實際模型欄位。
- 測試：`server/_core/variantImageUpdate.test.ts` 覆蓋 stale flat 欄位與舊版 flat-only 資料。

### 4. High — 選 GPT fallback 成便宜模型或完全失敗，仍扣滿 100 點

- 位置：`server/routers/imageRouter.ts:78-117`；`server/_core/imageBilling.ts:15-69`。
- 已確認的失敗情境：`modelChoice=gpt-image-2` 先扣 `image_gpt=100`；OpenAI 失敗後 Flux 成功，舊流程仍扣 100（Flux 是 30）；所有 provider 失敗或 `generateImage` 拋錯也不退。
- 嚴重度理由：使用者被收取未得到的 premium 成果，且目前 fallback 是常態而非罕見邊界。
- 產品決定：透過 Orca `ask` 確認採「先扣後對帳」；保留產圖前額度守門，成功後依實際模型退差額，失敗全退。退款 ledger 失敗只記 log，不吞掉已產出的圖。
- 修正：新增 request/actual model tier mapping 與 `reconcileImageCharge`；同步處理 status failed 與 throw。
- 測試：`server/_core/imageBilling.test.ts` 覆蓋 GPT→Flux 退 70、同 tier 不退、失敗全退、退款服務失敗不影響主流程。

### 5. High — 只信 Content-Type，HTML 可偽裝成產品圖或供應商成品被送入/保存

- 位置：`server/_core/imageFetch.ts:27-105, 152-178`；`server/_core/mediaGen.ts:96-112`。
- 已確認的失敗情境：URL 回 `Content-Type: image/jpeg` 但 body 是 `<html>store home</html>`。舊 `fetchImageBuffer` 會接受並把 HTML base64 當 JPEG 餵給 Nano Banana；provider remote URL 失效成 HTML 時，舊 `downloadAndSave` 也會把它存成 `.png` 並回 `ready`。
- 嚴重度理由：subject mode 的 source-of-truth 被污染，或使用者拿到不能顯示的成功圖片 URL。
- 修正：依 PNG/JPEG/GIF/WebP/BMP/TIFF/AVIF magic bytes 驗證；probe 讀取最小 prefix；串流下載超過 20MB 立即中止；provider remote image 同樣走驗證。
- 測試：`server/_core/imageFetch.test.ts`、`server/_core/mediaGen.test.ts`。

### 6. High — 自動 Imagen 忽略 `GEMINI_API_KEY_POOL`；Nano/Imagen 遇 429 不輪替

- 位置：`server/_core/mediaGen.ts:33-45, 188-232, 235-266`；`server/_core/imageGen.ts:122-134, 299-341`。
- 已確認的失敗情境：環境只設 `GEMINI_API_KEY_POOL` 時，舊自動 Imagen adapter 直接報 `GEMINI_API_KEY missing`；第一把 key 回 `429 RESOURCE_EXHAUSTED` 時，Nano Banana 停止而不試第二把有效 key。手動 Imagen 原本只隨機取一把，也不重試。
- 嚴重度理由：有效容量明明存在，卻造成 product subject 無 fallback 失敗，或自動配圖不必要地降級成 Flux。
- 修正：三條 Google 圖片路徑使用去重 key pool，403/429/quota/rate-limit/key 錯誤輪替，非 key 類錯誤仍立即失敗。
- 測試：`server/_core/mediaGen.test.ts`、`server/_core/imageGen.test.ts`。

### 7. Medium — success-shaped 空 provider response 被標成 ready，阻止 fallback

- 位置：`server/_core/imageGen.ts:277-295, 299-341, 452-497`。
- 已確認的失敗情境：OpenAI HTTP 200 回 `data:[{}]`，舊 `runOpenAI` 回 `{url:null,b64:null}`；外層只看 `out` object truthy，寫 DB `ready` 並停止 fallback，RunPage 最後只能顯示「API 沒回網址」。Google 空 prediction 同樣成立。
- 嚴重度理由：供應商異常被誤判成功，可靠 fallback 完全沒執行。
- 修正：provider adapter 沒有 URL/b64 就 throw，讓既有 fallback chain 接手；兩個 direct fetch 補 180s/120s timeout。
- 測試：`server/_core/imageGen.test.ts` 驗證 OpenAI 空結果會落到 Google 並成功。

### 8. Medium — 實際模型與 fallback 曾被丟棄，UI 只能顯示選單值

- 位置：`server/_core/quickTaskOrchestra.ts:112-120, 1658-1709, 2503-2509`；`server/_core/imageGen.ts:167-174, 452-497`；`client/src/v2/pages/RunPage.tsx:1019-1036, 2839-2860`。
- 已確認的失敗情境：選 GPT 後實際 Flux 成功，舊 response 雖有 model，但 RunPage toast 不顯示、output 不保存；自動 pipeline 更直接丟棄 `GenResult.modelId`，stage 還固定寫「Flux Schnell」，即使實際是 Imagen/Nano/GPT。
- 嚴重度理由：使用者無法知道拿到哪個模型的成果，也無法在 reload 後稽核；模型選單看起來像實際執行值。
- 修正：自動與手動都保存 `modelId/requestedModelId/fallbackUsed`；RunPage 顯示目前圖片實際模型與 fallback 來源，toast 同步通知；stage 改成 provider-neutral。
- 測試：`server/_core/imageGen.test.ts`、`server/_core/variantImageUpdate.test.ts`。

### 9. Medium — 允許 4,000 字 prompt，翻譯輸出卻固定 1,000 tokens

- 位置：`server/_core/imagePromptTranslation.ts:15-40`；`server/routers/imageRouter.ts:45`。
- 已確認的失敗情境：合法的 4,000 字 CJK 指令進入翻譯時，舊 `maxTokens:1000` 無法容納等義英文；finish reason `length/max_tokens` 後退回原始中文，與 UI 宣告「送出前翻英文」不符。
- 嚴重度理由：長 prompt 在合法輸入上具有確定性的截斷門檻，且品質降級發生在使用者按下生圖之後。
- 修正：token budget 隨輸入長度成長，普通輸入維持 1,000，下限到 router 上限時提供 6,000。
- 測試：`server/_core/imagePromptTranslation.test.ts`。

### 10. Medium — 舊 truncated JSON 雖不再送模型，卻被再次寫回 `promptZh`

- 位置：`server/_core/bilingualVisualBrief.ts:90-114`；`server/routers/imageRouter.ts:69-77, 145`；`client/src/v2/pages/RunPage.tsx:1019-1025`。
- 已確認的失敗情境：舊欄位是 `{"prompt":"complete English","promptZh":"截斷`。既有 recovery 會抽出 English 給模型，但 client 仍把 textarea 的原始 broken JSON 寫成新 `promptZh`；reload 又優先顯示它。
- 嚴重度理由：#89 的污染內容會永久自我複製，使用者每次重生仍看到 broken JSON。
- 修正：同時產出 model prompt 與 normalized display prompt；完整歷史 JSON 保留中文 counterpart，截斷 JSON 改顯示已救回的 English，不再回寫破損原文。
- 測試：`server/_core/bilingualVisualBrief.test.ts`。

### 11. Medium — URL redirect timeout 每一跳重置，5 秒 probe 最長可卡超過 30 秒

- 位置：`server/_core/imageFetch.ts:107-149`；`server/_core/mediaGen.ts:96-112`；`server/_core/imageGen.ts:277-341`。
- 已確認的失敗情境：5 次慢 redirect，每次在 5 秒前回應。舊碼每跳建立新的 `AbortSignal.timeout(5000)`，單一 probe 可佔用約 30 秒；手動 OpenAI/Google direct fetch 與 provider download 原本完全沒有 timeout。
- 嚴重度理由：產品圖 probe 位於自動生圖關鍵路徑，會把 60s 任務拖過預算；手動換圖可無限 pending。
- 修正：整條 redirect chain 共用單一 deadline；direct provider fetch 與 remote download 均有上限；圖片 body 以串流限制大小。
- 測試：`server/_core/imageFetch.test.ts` 驗證第二跳 timeout budget 變小；`imageGen.test.ts` 驗證 request 帶 AbortSignal。

### 12. Medium — UI 宣稱 Ideogram 可「含文字」，server 卻強制零文字

- 位置：`client/src/v2/lib/runImageModelOptions.ts:7-18`；server policy 在 `server/_core/imageGen.ts:31-40, 237-244, 335-339`。
- 已確認的失敗情境：使用者選「含文字 — Ideogram V3」並要求圖中文字，server 仍追加 `ABSOLUTELY NO TEXT` 及 text negative prompt，因此不可能履行 UI 承諾。
- 嚴重度理由：這是明確的產品承諾與執行政策衝突，會讓使用者拿到刻意相反的結果。
- 修正：不改全站既定的 editable overlay 政策；選單改為「平面設計 — Ideogram V3（依規範不生成圖中文字）」。
- 測試：`client/src/v2/lib/runImageModelOptions.test.ts`。

### 13. Low — 全部 provider 失敗時，`generated_images` 的 provider/model 稽核欄位仍不準

- 位置：`server/_core/imageGen.ts:355-363, 499-515`。
- 已確認的失敗情境：pre-insert 固定寫 `provider=openai, model=pending`；若使用者選 Google/Flux 且所有嘗試都失敗，failure update 只改 status/error，DB row 仍顯示 openai/pending，回傳也用 env `primary` + `unknown`。
- 嚴重度理由：不改變使用者圖片結果，但會誤導內部失敗稽核與供應商統計。
- 未修理由：本任務的修正判準是使用者錯誤結果或靜默失效；此項只影響失敗記錄的內部歸因。應另案定義要記「最後嘗試」、「全部 attempts」或 primary request，不能用單一 provider/model 欄位硬猜。

## 已確認但本次未修的工程問題

### A. `Promise.race` timeout 不會取消已超時的 provider request

- 位置：`server/_core/quickTaskOrchestra.ts:1636-1640`。
- 具體情境：Imagen 在 18 秒 cap 輸掉 race 後，Flux fallback 開始；原 Imagen fetch 仍可跑到 adapter 的 120 秒 timeout，完成後還可能同步落檔，但結果已無 consumer。
- 影響：額外供應商成本、磁碟孤兒檔與併發占用；目前使用者仍會得到 fallback 結果，因此列 Medium performance/cost。
- 未修理由：正確修復要把 `AbortSignal` 從 orchestra 傳穿 `dispatchGenerate` 到所有 provider adapter、PiAPI polling 與下載階段；只 abort Imagen 會讓同一 fallback contract 再次分岔。這超出本次針對錯圖/靜默失效的最小修補，但已有精確位置可另案處理。

### B. OpenAI 實際零成功的根因未追

- Coordinator 提供的唯讀正式資料觀察：brand 2947 的 11 次成功產圖全部為 Nano Banana 或 Flux Schnell，OpenAI 成功為 0。
- 本次已修：fallback 模型透明度與計費退差額，使用者不再付 GPT 價格卻無從知道拿到 Flux。
- 未修理由：Coordinator 明確指示 OpenAI 為何從未成功是另一個題目，本次不要延伸；程式碼稽核也沒有足夠證據把單一根因歸到 key、quota、policy 或 provider response。

## 欄位契約結論

- `image.style`：art director 的展示用方向；自動產圖不直接送模型。
- `image.prompt`：實際模型 scene prompt（翻譯後、guard/context 前）；自動與手動路徑均保存。
- `image.promptZh`：可編輯的人類顯示版本；歷史 JSON 污染會先正規化。
- legacy flat `imageStyle/imagePrompt/imagePromptZh`：手動寫回時與 nested 欄位同步，避免舊資料讀取優先序顯示 stale 值。
- carousel cards：主圖、尾格、card 圖共用相同 product-required policy；每張 card 保存自己的 prompt/model metadata。
- checkpoint partial：此時模型 prompt 尚未由 caption 轉換，故只保存 `style` + `status=pending`；final checkpoint 會寫入實際 prompt。這是時序上的未產生欄位，不是欄位漂移。

## 驗證結果

1. `cd skills/ai-talent && npx tsc --noEmit`：PASS（exit 0）。
2. `cd skills/ai-talent/client && npx tsc --noEmit`：PASS（exit 0）。
3. `cd skills/ai-talent && npx vitest run`：437 tests PASS；44 test files PASS。只有任務已註明的兩個 collection failure：
   - `server/agentMatcher.test.ts` — 缺 `LOCAL_DB_PASSWORD`
   - `server/task/taskPromptBuilder.test.ts` — 缺 `LOCAL_DB_PASSWORD`
4. 新增/直接相關測試：38 tests PASS（billing 4、provider/image gen 8、image fetch 5、translation 5、bilingual parsing 10、variant writeback 2、product policy 3、UI model label 1）。
5. `git diff --check`：PASS。
6. 未執行任何正式資料寫入、ops workflow、commit、push 或 PR；`package-lock.json` 未變更。

## 變更檔案

- Client：`client/src/v2/pages/RunPage.tsx`、`client/src/v2/lib/runImageModelOptions.ts` 與 test。
- Prompt/translation：`server/_core/bilingualVisualBrief.ts`、`imagePromptTranslation.ts` 與 tests。
- Providers/fetch：`server/_core/imageGen.ts`、`mediaGen.ts`、`imageFetch.ts` 與 tests。
- Product/fallback/billing/writeback：`productSubjectPolicy.ts`、`imageBilling.ts`、`variantImageUpdate.ts` 與 tests。
- Pipeline/router wiring：`server/_core/quickTaskOrchestra.ts`、`server/routers/imageRouter.ts`、`server/routers/outputRouter.ts`。
