# 回滾與還原手冊

適用：正式站 onbrand.sowork.ai（主機 vm-onbrand，程式在 `/opt/onbrand/app`，pm2 行程 `onbrand`，埠 3101）。

更新：2026-10-05。演練紀錄寫在文件最後。

## 先判斷是哪一種狀況

| 症狀 | 多半是 | 走哪一節 |
|---|---|---|
| 剛部署完，頁面壞掉或功能出錯 | 新版程式有問題 | A. 程式回滾 |
| 網站打不開、`/health` 沒回應 | 行程掛了或起不來 | B. 行程救援 |
| 資料被改壞、被誤刪 | 資料問題 | C. 資料還原 |
| 付款異常（扣了款沒開通、取消後還在扣） | 金流 | D. 金流異常 |
| 產出全部失敗、很慢 | AI 供應商 | E. AI 供應商 |

不確定時先做 B 的診斷步驟，它不會改動任何東西。

## A. 程式回滾

正式站的部署方式是「推到 `main` 就自動部署」（`ci.yml`）。所以回滾的做法是把出問題的合併還原，再推一次。

1. 找到出問題的合併 commit：

   ```bash
   git log --oneline --merges -5 origin/main
   ```

2. 開一個還原分支並還原那次合併（`-m 1` 表示保留合併前的 main）：

   ```bash
   git checkout -b hotfix/revert-<簡述> origin/main
   git revert -m 1 <合併 commit>
   git push -u origin hotfix/revert-<簡述>
   ```

3. 開 PR 到 `main` 並合併。`ci.yml` 會自動部署，約 10–25 分鐘。
4. 部署完成後檢查 `https://onbrand.sowork.ai/health` 回傳 `ok`，並手動走一次登入與產出一篇內容。

注意事項：

- **不要**在主機上手動 `git reset` 到舊版。下次有人推 `main` 就會被蓋掉，而且沒有紀錄。
- 資料庫變更（`scripts/migrate.ts`）只會新增欄位與資料表，不會刪除，所以舊版程式可以搭配新版資料庫執行，回滾程式時不需要動資料庫。
- 部署有排隊鎖（`deploy-vm`），同時只會跑一個。前一個還在跑時，新的會等它結束。
- 部署腳本的健康檢查失敗**不會**讓部署顯示失敗，所以綠燈不代表站是好的，一定要自己看 `/health`。

## B. 行程救援

1. 先診斷（不改任何東西）：執行工作流程 `Admin — Rollback onbrand pm2 to fork mode` 的前兩步輸出，或在主機上：

   ```bash
   pm2 list
   ```

   ```bash
   tail -50 ~/.pm2/logs/onbrand-error.log
   ```

2. 行程不在或一直重啟：執行工作流程 `Admin — Rollback onbrand pm2 to fork mode`（`admin-pm2-rollback-fork.yml`）。它會清掉舊行程、依 repo 內的 `ecosystem.config.cjs` 重新啟動。
3. 啟動後馬上又掛：看錯誤 log 第一個錯誤。常見原因：
   - `.env` 缺變數 → 執行 `Ops — Restore .env from pm2 dump`（`ops-restore-env-from-pm2.yml`）。
   - 新版程式啟動就報錯 → 走 A 節回滾。
   - `node_modules` 損壞（`ENOTEMPTY`、找不到模組）→ 重新執行一次部署即可自癒。
4. 磁碟滿：`df -h`。備份放在 `/opt/onbrand/backups`，保留 14 天。

## C. 資料還原

備份：每天 02:00（台北時間）由 `op-db-backup.yml` 產生，放在主機 `/opt/onbrand/backups/mos_db-YYYYMMDD-HHMM.sql.gz`，保留 14 天。

**還原會蓋掉備份之後的所有資料**，包含新註冊的用戶、付款紀錄與產出。除非整個資料庫毀損，否則優先做「部分還原」。

### 部分還原（建議）

把備份還原到暫時資料庫，只把需要的資料撈回正式資料庫。

1. 還原到暫時資料庫：

   ```bash
   mysql -h localhost -u mos_user -e "CREATE DATABASE mos_db_recover CHARACTER SET utf8mb4"
   ```

   ```bash
   gunzip -c /opt/onbrand/backups/mos_db-<時間>.sql.gz | mysql -h localhost -u mos_user mos_db_recover
   ```

2. 比對並把需要的資料列寫回 `mos_db`（依狀況寫 SQL，先 `SELECT` 確認再 `INSERT`／`UPDATE`）。
3. 完成後刪除暫時資料庫：

   ```bash
   mysql -h localhost -u mos_user -e "DROP DATABASE mos_db_recover"
   ```

### 整庫還原（最後手段）

1. 先手動觸發一次 `Ops — DB backup`，把目前狀態也留一份。
2. 停止服務：`pm2 stop onbrand`。
3. 還原：

   ```bash
   gunzip -c /opt/onbrand/backups/mos_db-<時間>.sql.gz | mysql -h localhost -u mos_user mos_db
   ```

4. 啟動服務：`pm2 start onbrand`，檢查 `/health`。
5. 對帳：備份時間點之後的 Stripe 付款要到 Stripe 後台逐筆比對，手動補開通。

### 演練

工作流程 `Ops — DB restore drill`（`op-db-restore-drill.yml`）會把最新備份還原到暫時資料庫、比對筆數、再刪掉。它不寫入正式資料庫。上線前跑一次，之後每月一次。

### 已知缺口

- 備份與資料庫在同一台主機。主機整台損毀時，備份會一起消失。`op-db-backup.yml` 已內建異地上傳，但需要在主機安裝 `rclone` 並在 `.env` 設定 `BACKUP_RCLONE_REMOTE` 才會啟用。
- 用戶上傳的圖片與素材不在資料庫備份內。

## D. 金流異常

| 狀況 | 處理 |
|---|---|
| 用戶付了款但方案沒開通 | 執行 `op-stripe-failed-events.yml` 看 `failed_stripe_events`；到 Stripe 後台重送該事件 |
| 取消後仍被扣款 | Stripe 後台確認該訂閱的 `cancel_at_period_end`；必要時手動取消並退款 |
| 需要退款 | 在 Stripe 後台退款。系統只會記錄退款、不會自動收回使用權，要不要停用由人決定 |
| 懷疑正式站用到測試金鑰 | 在主機確認 `.env` 的 `STRIPE_SECRET_KEY` 開頭是 `sk_live`（重寫金鑰用 `op-stripe-keys.yml`）；正式站應設 `STRIPE_REQUIRE_LIVE=true`，設了之後測試金鑰會被拒絕 |
| 金流整個要暫停 | 在 `.env` 設 `LIVE_BILLING_ENABLED=false` 後重啟。付款入口與 webhook 都會停用 |

## E. AI 供應商

- `/health` 只確認「至少有一把金鑰存在」，不代表金鑰可用或有額度。
- 產出大量失敗時先看後台 `/admin/errors`，再跑 `op-probe-callllm-cascade.yml` 與 `op-probe-anthropic.yml` 確認各供應商狀態。
- 額度用盡要到該供應商後台加值，系統不會自動處理。

## 聯絡與權責

| 事項 | 負責 |
|---|---|
| 決定是否回滾 | CJ |
| 執行回滾、主機與金流設定 | Shawn |
| 對用戶公告與客服回覆 | Celine |

## 演練紀錄

| 日期 | 演練項目 | 結果 | 執行人 |
|---|---|---|---|
| | 資料還原演練（`op-db-restore-drill.yml`） | 尚未執行 | |
| | 程式回滾演練（在 dev 站還原一次合併） | 尚未執行 | |
