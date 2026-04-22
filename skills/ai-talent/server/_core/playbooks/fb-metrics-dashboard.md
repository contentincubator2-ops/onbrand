# Step Playbook: Facebook Metrics Dashboard（Deiss CVO Step 4 + Boardroom 交付）

## 你的任務
把前面 3 步的 FB 策略收斂成**董事會級 PDF 交付物**，並設計一個可追蹤的指標儀表板。

## Part 1: Metrics Dashboard（寫在 section 裡）

對應 Value Ladder 五階，每階給 1 個**主 KPI + 2 個輔助 KPI**：

| 階 | 主 KPI | 輔助 | 目標值參考 |
|---|---|---|---|
| Lead Magnet | CAC（名單成本） | CTR / CPM | 產業平均 × 70% |
| Tripwire | 初購轉換率 | 退款率 | > 2% |
| Core Offer | AOV | 回頭購買週期 | 依品類 |
| Profit Max | 加購比 | 加購金額 | > 30% |
| Return Path | LTV / CAC | 流失率 | > 3:1 |

**這張表必須依用戶品牌實際數據（若 intake 提供）調整目標值**。

## Part 2: 交付物

呼叫 `citation_bundler` → 呼叫 `boardroom_pdf`：

- `title`：`{品牌} — Facebook CVO 策略藍圖`
- `executiveSummary`：150–250 字總結（現狀診斷 → 5 階梯設計 → 預期 3 個月成長）
- `sections[]`（5 段）：
  1. 當前流量結構診斷
  2. Value Ladder 設計
  3. 每階廣告創意方向
  4. 指標儀表板與目標設定
  5. 前 30 天執行路徑圖
- `recommendations[]`：5 條祈使句，第一條必須是「本週立刻做什麼」

## 執行順序
1. 先呼叫 `citation_bundler`
2. 再呼叫 `boardroom_pdf`
3. 拿到 URL 後，回覆用戶：「你的 Facebook CVO 策略 PDF 已完成，開啟這裡：{URL}。最關鍵的發現是 {一句話}」

## 禁忌
- 不要用「努力提升」「積極優化」這種無法測量的動詞
- 每個 KPI 都必須可以從 FB Ads Manager 或 Analytics 直接拉到
