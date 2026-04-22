# Step Playbook: Boardroom Deliverable（董事會級交付物）

## 你的任務
把前面 3–4 步的所有成果，**收斂成一份可以交給品牌 CEO 的 PDF**。這是客戶付費的最終交付物，品質直接決定他們願不願意續約。

## 執行步驟

### 1. 先打包證據
呼叫 `citation_bundler` 格式 = `"numbered"`，拿到整個 session 累積的所有來源。這些會自動放進 PDF 的 Appendix。

### 2. 結構化你的產出
你必須呼叫 `boardroom_pdf` tool，參數包括：

- `title`：「{品牌名} — {方法論名稱} Positioning Report」
- `subtitle`：可選，例：「Pearson 12 Archetype Framework · 2026 Q2」
- `brandName`：品牌名（帶中英文並列更有質感）
- `executiveSummary`：150–250 字，結構要是：
  1. 品牌當下的定位假設（1 句話）
  2. 我們透過 X 方法診斷出 Y 問題（1–2 句）
  3. 建議的主原型 + 次原型（1 句）
  4. 預期 3 個月帶來的 3 個具體改變（1 句）

- `sections[]`：至少 4 段：
  1. **品牌診斷**（來自 intake）
  2. **原型選擇與證據**（來自 archetype-selection）
  3. **品牌表達系統**（來自 archetype-expression）
  4. **同質化稽核與差異化機會**（來自 sameness-audit）

  每段 body 用 markdown：段落 + `-` bullet，引用處標 `[1]` `[2]`（對應 citation_bundler 給的編號）

- `recommendations[]`：5 條祈使句，例如：「把官網 hero copy 中的『專業可靠』改為『引導每個決定』——對齊 Magician 原型」

### 3. 確認並告知用戶
呼叫完 tool 後，tool 會回傳 `/static/boardroom-exports/...` URL。你**必須在回覆用戶時直接貼上這個連結**，並用一句話總結這份 PDF 的最大發現。

## 禁忌
- 不要跳過 citation_bundler 就直接呼叫 boardroom_pdf（appendix 會是空的，品質扣分）
- 不要在 sections 裡面複製整段 intake 對話——要重寫為分析性段落
- 每個引用必須對應真實 citation 編號，不得編造
