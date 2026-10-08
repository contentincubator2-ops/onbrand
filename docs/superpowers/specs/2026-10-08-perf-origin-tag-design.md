# 成效事實多打 `origin` 系統標籤：區分 onBrand 發布 vs 原本自行發布 — 設計規格

**日期**：2026-10-08
**分支**：`feat/perf-origin-tag`（從 `dev` 切出）
**前情**：`performance/core/zernioAnalyticsSync.ts`、`performance/core/fbPageSync.ts`、`performance/core/perfPivot.ts`（`BUILTIN_DIMS`／`SOURCE_LABELS`／`FORMAT_LABELS`／`resolveTag`／`labelFor`）

---

## 0. 一頁摘要

成效回填把客戶帳號上**所有**貼文都拉進 `perf_facts`，但沒有任何標籤區分「onBrand 發出去的」與「客戶原本自己發的」，報表上兩種貼文混在同一個來源底下，無法對比。本 PR 在回填時多打一個系統標籤 `origin`（`onbrand`｜`external`），並把它加進報表的內建維度，順便補 Zernio 新來源的中文名稱。不改資料表結構（`tags` 本來就是開放的 JSON）。

---

## 1. 標籤定義

| 值 | 條件（任一成立即 `onbrand`，否則 `external`） |
|---|---|
| `onbrand` | (a) 該平台原生貼文 id 對得到 `scheduled_posts.externalPostId`（即 `ownTagsFor` 回傳的 key 有命中，不論 perfTags 是否為空）；(b) Zernio 回應 `isExternal === false`，或 `latePostId` 有值 |
| `external` | 以上皆非 |

- 寫法：`tags: { ...own, format, origin }`。**使用者在產出頁打的 perfTags 若剛好也有 `origin` 鍵，以系統判定為準**（系統標籤覆蓋）。
- `ownTagsFor` 目前只回「有 perfTags 的貼文」的 map；要改成同時回「所有有 externalPostId 的貼文 id 集合」，才能判斷 (a)。介面：`ownTagsFor(brandId, pool)` 回 `{ tags: Record<string, Record<string,string>>; ownIds: Set<string> }`，呼叫端跟著改（zernioAnalyticsSync；fbPageSync 自己有一份對回邏輯，見第 3 節）。
- Facebook 的 id 比對同時試完整 `<pageId>_<postId>` 與底線後尾段（現有邏輯）。

## 2. 報表（`perfPivot.ts`、`performanceRouter.ts`）

- `BUILTIN_DIMS` 加 `origin: { label: "發布來源", labelEn: "Published by" }`。
- 新增 `ORIGIN_LABELS = { onbrand: "onBrand 發布", external: "原本自行發布" }`（en：`Published via onBrand` / `Published elsewhere`）；`labelFor` 對 `dimKey === "origin"` 用它，缺值回 `未歸類`。
- `resolveTag` 對 `origin` 的行為跟 `format` 相同：`fact.tags?.origin || UNTAGGED`（舊資料沒有這個標籤就是未歸類，不要猜）。
- `SOURCE_LABELS` 補：`ig_account: "Instagram 貼文"`、`threads_account: "Threads 貼文"`、`linkedin_page: "LinkedIn 貼文"`；`fb_page` 文案維持「粉專貼文」。若有 `SOURCE_LABELS_EN` 之類的英文表也一併補。
- `performanceRouter.workspace` 回傳的 `builtinDims` 由 `BUILTIN_DIMS` 產生，自然多出 `origin`，前端不用改。

## 3. 回填端

| 檔案 | 改法 |
|---|---|
| `performance/core/ownTags.ts` | 回傳形狀改為 `{ tags, ownIds }`，`ownIds` 收所有 `externalPostId`（不管 metadata 有沒有 perfTags）。 |
| `performance/core/zernioAnalyticsSync.ts` | `analyticsFact` 多收 `ownIds: Set<string>`；判定 `origin` 照第 1 節；`tags` 加 `origin`。回傳結果每平台多 `onbrand: number` 計數（方便同步按鈕顯示「其中 N 篇是 onBrand 發的」，前端這次不改）。 |
| `performance/core/fbPageSync.ts` | 同樣多打 `origin`：對得到 `externalPostId` 的為 `onbrand`，其餘 `external`。它已停用（Facebook 走 zernio），但留著的程式要一致。**只改打標那幾行**，不動 Pipedream 邏輯。 |

## 4. 測試

| 檔案 | 要驗 |
|---|---|
| `ownTags.test.ts`（新或既有） | 有 externalPostId 但沒 perfTags 的貼文也在 `ownIds`。 |
| `zernioAnalyticsSync.test.ts` | 三種情況：對得到 externalPostId → `onbrand`；`isExternal:false` 無對應 → `onbrand`；外部貼文 → `external`；使用者 perfTags 帶 `origin` 被系統值覆蓋。 |
| `perfPivot.test.ts`（若有） | `resolveTag` 對 `origin`；`labelFor` 中英文；`SOURCE_LABELS` 新三個。 |
| `fbPageSync.test.ts` | facts 帶 `origin`。 |

驗證：`cd skills/ai-talent && COVERS_DIR=<暫存> npx vitest run server/performance && npx tsc --noEmit && npx tsc --noEmit -p client`。

## 5. 明確不做

- 不回填舊資料（下一次同步覆蓋時自然補上）。
- 不改資料表。
- 不改前端（維度清單由 server 回）。
- 不 push、不開 PR；commit 中文訊息 `feat(performance): …`，結尾 `Co-Authored-By: Codex <noreply@openai.com>`。
