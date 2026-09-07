# OnBrand AI · 更新日誌

## 2026-09-08
- [NEW] 任務卡「出處與說明」：點開看用途、什麼時候用、我們跟的得獎／標竿參考原文、爆款的傳播數字與量測年月、長青卡的背後邏輯、需要你提供什麼
- [NEW] 每張卡有上架日期（從 git 歷史算，不是手填）；30 天內上架的卡標「新上架」，通路頁顯示「本月新卡 N 張」可只看新卡
- [NEW] 新任務卡上架會出現在通知，點進去直接看新卡
- [NEW] 價目表：策略監測定義在專業方案（品牌、產品與競爭者有變化時提醒調整）

## 2026-05-13
- [NEW] Mia 客戶成功 chat drawer — LLM-backed，知道你當前頁面、品牌、最近任務
- [NEW] 「我要找真人 →」一鍵升級客服 ticket（自帶上下文）
- [NEW] `/admin/support` SoWork 內部收件匣
- [NEW] `/changelog` 公開更新日誌（你正在看的這頁）
- [FIX] 復華投信定位完成但內容沒顯示 — server 鍵名跟 UI 對不上，已加 normalizer
- [FIX] 30s 文案在 mockup 標題被砍頭，誤以為 AI 寫不完整 — 移除 line-clamp
- [FIX] 「+ 新增」與客服按鈕重疊 — 移除右下浮動 FAB
- [FIX] 整站空白（stale bundle hash + tsc build silent fail）— deploy 加 pipefail
- [FIX] 「按了套用活動定位框架出現 Event not found」— 傳錯 entityId
- [FIX] PER_IMAGE_MS 10s → 45s，PiAPI Flux 圖正常生
- [IMPROVE] Anthropic 額度不足時自動降級到 qwen / azure-foundry，不再每步 retry
- [IMPROVE] 編輯文案存檔 toast 變可點按鈕「去專案」，1 tap 跳轉
- [IMPROVE] 通知鈴鐺接上真實事件（定位完成 / 任務產出 / 節慶提醒）

## 2026-05-12
- [NEW] 30s mockup 頁的 per-variant 「用此風格生圖」按鈕（OpenAI / PiAPI 雙路徑）
- [NEW] 通知中心面板（左下鈴鐺）
- [FIX] 卡住的定位 job 自動 10 分鐘 fail，前端不再永遠看到「分析中 13/14」
- [IMPROVE] 全站 i18n 改成 Canva 風格英文（不是直譯）

## 2026-05-11
- [NEW] 品牌總覽頁 scope-aware：選活動進活動定位、選產品進產品定位
- [NEW] 基本資料 / 視覺合併進主工作區的頁籤
- [FIX] Pokemon Go 端午活動誤掛在「數據為王」品牌底下 — orphan 事件 brandId 修補
