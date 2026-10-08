# 排程到時未核准：卡片要說明，worker 不可被未核准的列卡住 — 設計規格

**日期**：2026-10-08
**分支**：`feat/schedule-approval-hint`（從 `dev` 切出）
**前情**：`content/core/scheduledPublishWorker.ts`（2026-10-04）、`content/routers/calendarRouter.ts`、`client/src/v2/content/pages/PlannerPage.tsx`

---

## 0. 一頁摘要

dev 實測：排程 12:23 的貼文到時間沒發，卡片一直顯示「已排程 12:23」，沒有任何說明。原因之一是 worker 遇到**未核准**的到期列會 `continue` 直接跳過，什麼都不寫，使用者看不出是「還沒到」「發失敗」還是「沒核准」。

另外 worker 一拍只撈 `LIMIT 5` 且依時間排序：只要有 5 筆未核准的過期列排在前面，後面已核准的永遠輪不到（飢餓）。

本 PR：(1) worker 對到期但未核准的列寫一行提示到 `lastError`，狀態維持 pending，核准後下一拍自動發並清掉；(2) 撈取與發布的數量分開，未核准的列不佔發布名額；(3) 本週企劃卡片與彈窗顯示這個提示。**不改核准規則、不改發布邏輯。**

---

## 1. Worker（`server/content/core/scheduledPublishWorker.ts`）

- 常數：`BATCH = 5` 改名 `PUBLISH_BATCH = 5`（一拍最多發 5 篇），新增 `SCAN_LIMIT = 50`（一拍最多檢視 50 筆到期列）。SQL 的 `LIMIT` 用 `SCAN_LIMIT`。
- 迴圈：`published >= PUBLISH_BATCH` 就 break。未核准的列不計入 `published`。
- 新增常數 `APPROVAL_HINT = "尚未核准，到時間不會自動發布；核准後會在一分鐘內自動發出。"`（匯出，給測試與前端共用判斷用）。
- 到期但 `outputApprovalState !== "approved"` 的列：

```sql
UPDATE scheduled_posts SET lastError = ?
 WHERE id = ? AND status = 'pending' AND (lastError IS NULL OR lastError <> ?)
```

  參數 `[APPROVAL_HINT, id, APPROVAL_HINT]`。**不動 `attempts`、不動 `status`**。接著 `continue`。
- 已核准的列照舊 claim → publish。發布成功的既有 UPDATE 已把 `lastError = NULL`，提示自然消失。
- 回傳值從 `number` 改成 `{ published: number; awaitingApproval: number }`，`index.ts` 的呼叫端只有 `.catch`，不受影響；若有地方用到數字回傳，一併改。

## 2. 重新排程／重試（`calendarRouter.ts`）

- `rescheduleScheduledPost` 目前只在 `status = 'failed'` 時清 `lastError`。改成：`lastError = IF(status = 'failed' OR lastError = ?, NULL, lastError)`，參數帶 `APPROVAL_HINT`，讓改時間後提示重算。其餘不動。

## 3. 前端（`client/src/v2/content/pages/PlannerPage.tsx`）

- `calendar.range` 已回 `lastError` 與 `status`。定義 `isAwaitingApproval(cal) = cal.status === "pending" && cal.lastError === APPROVAL_HINT`（前端自己放一份相同字串常數，或由 server 在 `calendar.range` 多回 `awaitingApproval: boolean`，**擇後者**，字串只存在 server）。
- 卡片 `meta`：`awaitingApproval` 時顯示「已排程 12:23 · 尚未核准」（en：`Scheduled 12:23 · awaiting approval`）；既有「送審中」徽章規則不動（兩者可同時成立：送審中＝有人在審；尚未核准＝到時間了還沒核准）。
- 彈窗：「已排程 12:23」下方多一行小字 `lastError` 的提示文字（只在 `awaitingApproval` 時顯示）。「立即發布」按鈕維持可按，按了會得到既有的核准錯誤訊息。
- `isFailedScheduled` 的判斷若是看 `lastError` 存在就當失敗，要改成看 `status === "failed"`，避免提示被當成失敗。

## 4. 測試

| 檔案 | 要驗 |
|---|---|
| `scheduledPublishWorker.test.ts` | 到期未核准 → 寫入 `APPROVAL_HINT`、不 claim、attempts 不變、status 仍 pending；同一列第二拍不重複 UPDATE（`lastError <> ?` 條件）；6 筆未核准＋1 筆已核准同時到期 → 已核准那筆仍被發出（SCAN_LIMIT 生效）；核准後下一拍發出且 `lastError` 變 NULL。 |
| `publishFlow.integration.test.ts` | 既有測試全過；回傳型別改動要跟著改。 |
| `calendarRouter` 相關 | `rescheduleScheduledPost` 對 pending＋提示的列改時間會清掉提示。 |
| 前端 | 若 PlannerPage 有測試，補 `awaitingApproval` 的 meta 文案。 |

驗證：`cd skills/ai-talent && COVERS_DIR=<暫存> npx vitest run server/content && npx tsc --noEmit && npx tsc --noEmit -p client`。

## 5. 明確不做

- 不改核准門檻、不讓 worker 發未核准的稿。
- 不改 6 小時 grace window。
- 不 push、不開 PR；commit 中文訊息 `fix(publish): …`，結尾 `Co-Authored-By: Codex <noreply@openai.com>`。
