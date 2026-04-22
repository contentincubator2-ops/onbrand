# Step Playbook: Hormozi Offer Presentation（Step 4 + Boardroom 交付）

## 方法論
Hormozi 的 offer presentation 三原則：
- **Name it**：Grand Slam Offer 要有名字（不是「方案 A」，是「$100M 挑戰方案」）
- **Stack it**：把所有價值疊在客戶眼前，**總價值 > 售價 10 倍**
- **Scarcity/Urgency**：合理的稀缺與急迫性（名額限制、截止日、漲價警告）

## 你的任務
把前 3 步所有設計**包成一份可以直接上 sales page 的 Grand Slam Offer**，並輸出董事會級 PDF。

## Part 1: Grand Slam Offer 定稿

### 1. Offer 命名
- 3 個候選名字 + 推薦 1 個 + 理由
- 名字必須有**數字 + 承諾 + 期限**

### 2. Value Stack 表
```
| 項目 | 價值 | 包含 | 價格標示 |
|---|---|---|---|
| 主產品 | $X | ... | $X |
| Bonus 1 | $Y | ... | 免費 |
| Bonus 2 | $Z | ... | 免費 |
| Guarantee 保險 | $W | ... | 免費 |
| ──── 總價值 ──── | $X+Y+Z+W | | |
| 實際售價 | | | $N（只要 N/10 of 總價值） |
```

### 3. Scarcity / Urgency
- 用合理的限制（名額、時段、庫存），**不得製造假稀缺**
- 給 2 個版本：「正當稀缺」vs「可以接受的軟稀缺」

## Part 2: Boardroom 交付

呼叫 `citation_bundler` → `boardroom_pdf`：

- `title`：`{品牌} — Grand Slam Offer 設計書`
- `executiveSummary`：Hormozi 四象限診斷 → 本 offer 對應的 Value Equation 提升 → 預期 ROI
- `sections[]`（5 段）：
  1. Dream Outcome 定位
  2. Value Equation 四象限策略
  3. Guarantee Stack 設計
  4. Grand Slam Offer 定稿（含 Value Stack 表）
  5. 測試與上線路徑（先 soft launch 給誰、測試指標、全面上線時間）
- `recommendations[]`：5 條祈使句，第一條是「先跑 A/B 測試的兩個變體分別是什麼」

## 執行順序
1. 先在回覆中完整寫出 Grand Slam Offer
2. 呼叫 `citation_bundler`
3. 呼叫 `boardroom_pdf`
4. 貼 URL + 一句話最大發現

## 禁忌
- 售價不得是「總價值的 9 折」——Hormozi 要 **1/10 or less**
- Bonus 不能是空洞的「免費諮詢」——每個 bonus 都要有獨立價值敘述
