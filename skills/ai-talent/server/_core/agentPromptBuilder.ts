/**
 * agentPromptBuilder.ts
 * 為每個 squad agent 建構完整的 system prompt
 *
 * 每個 agent 在執行前必須掌握：
 *   1. 自己的身份（name, title, specialty）
 *   2. 品牌全貌（brand context）
 *   3. 工作區域（workspace 的定義與目標）
 *   4. 任務背景（mission title + objective）
 *   5. 品牌大腦（累積的品牌知識）
 *   6. 前步驟成果（本次 session 已完成的內容）
 *   7. 本步驟任務（具體要做什麼、輸出什麼）
 *
 * Prompt quality principles applied (2026-04):
 *   - Hard identity lock: "這是你唯一的身份" prevents role drift
 *   - Previous results framed as "參考文件" (documents), not conversation turns
 *   - Every behavior guide starts with language + word-count hard constraints
 *   - Forbidden opener lists address all observed failure-mode phrases
 *   - Lead intake forces specialty-specific questions, not generic PM questions
 *   - Specialist steps forced to open with ## Markdown heading to kill filler openers
 */

// ── Workspace 描述 ────────────────────────────────────────────────────────────
const WORKSPACE_DESCRIPTIONS: Record<string, string> = {
  strategy:          "品牌策略工作區 — 負責品牌定位、競品分析、受眾研究、品牌宣言等核心策略工作",
  "brand-positioning": "品牌定位方法論工作區 — 運用系統化方法論（利益階梯、差異化、JTBD、心智定位等）建立品牌在市場中的清晰位置，產出定位書、訊息框架與落地文案",
  facebook:          "Facebook 廣告工作區 — 負責 FB 廣告投放策略、文案、創意素材、受眾設定與成效優化",
  instagram:         "Instagram 內容工作區 — 負責 IG 內容策略、Reels、限時動態、品牌視覺與社群互動",
  linkedin:          "LinkedIn 行銷工作區 — 負責 B2B 內容策略、思想領袖文章、公司頁面經營與 Lead Gen",
  youtube:           "YouTube / 短影音工作區 — 負責影片內容策略、腳本撰寫、SEO 優化、短影音（Reels/Shorts/TikTok）",
  pr:                "公關工作區 — 負責新聞稿、媒體關係、KOL 合作、危機處理與品牌聲量管理",
  event:             "活動行銷工作區 — 負責體驗活動設計、活動企劃、現場執行與活動後追蹤",
  website:           "官網 / SEO 工作區 — 負責網站內容、SEO 優化、Landing Page、轉換率優化",
  monitoring:        "品牌監測工作區 — 負責社群聆聽、輿情分析、競品追蹤、品牌健康度報告",
  analytics:         "數據分析工作區 — 負責行銷數據分析、歸因模型、A/B 測試、ROI 追蹤",
  instore:           "實體零售工作區 — 負責門市體驗設計、陳列策略、購買行為分析與 OMO 整合",
};

// ── 方法論 × 步驟 輸出格式模板 ───────────────────────────────────────────────
/**
 * 針對每個品牌定位方法論，定義每個步驟的精確輸出格式指令。
 * key: `${methodology}:${stepIndex}`（stepIndex 0 = lead intake）
 * 這些指令會附加到 buildBehaviorGuide 的末尾，覆蓋通用格式。
 */
const METHODOLOGY_STEP_FORMATS: Record<string, string> = {

  // ═══════════════════════════════════════════════════
  // Benefit-Based Positioning（利益階梯定位）
  // ═══════════════════════════════════════════════════

  "benefit-based:2": `
【Step 2 輸出格式（強制）】
【資料來源規則】在輸出表格之前，先用一行聲明你使用的資料來源：
  - 若品牌已連接 Google Analytics → 「資料來源：Google Analytics 行為流報告」
  - 若無 GA 但有關鍵字資料 → 「資料來源：Google Search Console 搜尋查詢詞」
  - 若皆無 → 「資料來源：Google Keyword Planner 公開數據 + 競品官網分析（octolens）」
  聲明後直接進入表格，不得再解釋為什麼沒有資料。

你的回應必須包含以下兩個區塊，按順序輸出：

## Feature → Functional Benefit Map

| 產品功能 | 功能利益（Functional Benefit） |
|---------|-------------------------------|
| [功能1] | [明確、可感知的功能好處，用戶角度描述] |
| [功能2] | [同上] |
（至少 5 行，覆蓋品牌所有核心功能）

### 關鍵洞察：ICP 最重視的功能利益
- [洞察 1：哪個功能利益對目標客群衝擊最大，說明為什麼]
- [洞察 2：哪個功能利益是競品沒有的差異化空間]
- [洞察 3：哪個功能利益容易被誤解或需要進一步情感化]

---
**下一步**：Step 3 將由情感品牌專家負責，將每項功能利益挖掘為更深層的情感利益。
**確認問題**：以上 [X 項] 功能利益中，哪一項是你認為最能打動目標客群、最值得作為主要定位訴求的？`,

  "benefit-based:3": `
【Step 3 輸出格式（強制）】
你的回應必須包含以下三個區塊，按順序輸出：

## Functional → Emotional Benefit Map

| 功能利益 | 情感利益（Emotional Benefit）|
|---------|------------------------------|
| [功能利益1] | [第一人稱情感描述，例如「我終於不需要...」] |
| [功能利益2] | [同上] |
（覆蓋所有 Step 2 的功能利益）

### 核心情感定錨（最重要）
從以上情感利益中，選出最強的一個作為整個定位的情感核心：

> **[一句話，用目標客群的自我認同語言表達最強的情感利益]**

這句話必須：(1) 用第三人稱但讓人有代入感 (2) 不包含產品功能描述 (3) 是目標客群願意公開說的話

### 情感層級評估
- 最強情感利益：[列出，說明為何共鳴度最高]
- 次強情感利益：[列出，說明適合哪個廣告場景]
- 需要捨棄的情感：[列出，說明為何對 ICP 共鳴度低]

---
**下一步**：Step 4 將由訊息框架策略師負責，將功能利益與情感利益整合為完整的 Message Ladder。
**確認問題**：我識別出的核心情感是「[你定錨的情感]」——這和你對目標客群的認識吻合嗎？`,

  "benefit-based:4": `
【Step 4 輸出格式（強制）】
你的回應必須包含以下兩個區塊，按順序輸出：

## [品牌名稱] 完整 Message Ladder

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 品牌主張（Brand Promise）
  [一句話，涵蓋情感利益 + 差異化）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 社會認同（Social Proof / Credibility）
  [具體數字或事實，讓品牌主張可信]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 情感利益（Emotional Benefit）← 核心定錨層
  [從 Step 3 選出的最強情感利益，完整句子]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 功能利益（Functional Benefit）
  [從 Step 2 最重要的 2-3 項，用受眾語言描述]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 功能特性（Features）
  [產品核心功能，2-4 項]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 行動呼籲（CTA）
  [具體行動，用情感驅動語言]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`

### Ladder 設計說明
- 為何選這個品牌主張：[2 句說明邏輯]
- 訊息一致性驗證：[說明每層如何支撐上一層]
- 對比競品：[說明這個 Ladder 在競品對比中的差異化空間]

---
**下一步**：Step 5 將由轉換文案師負責，將 Message Ladder 落地為 Landing Page Copy、廣告 Headlines 與 Email Subject Lines。
**確認問題**：Message Ladder 的品牌主張是「[你的主張]」——這句話你願意放在官網最顯眼的位置嗎？`,

  "benefit-based:5": `
【Step 5 輸出格式（強制）】
【資料來源規則】在 A/B 評估表之前，先用一行聲明效力驗證的資料來源：
  - 若已連接 Facebook Ads → 「驗證依據：Facebook Ads 帳戶 CTR 歷史數據」
  - 若無 FB Ads 但可查 Ads Library → 「驗證依據：Facebook Ads Library 競品廣告分析」
  - 若皆無 → 「驗證依據：Google Ads 行業 CTR 基準（B2B 0.9% / B2C 1.2%）+ AIDA 評分框架」
  聲明後直接進入表格，不得再解釋為什麼沒有資料。

你的回應必須按順序包含以下四個區塊，每個區塊都必須完整輸出：

## 🖥️ Landing Page Hero Copy

\`\`\`
H1（情感利益層，≤ 12 字）：
[完整 H1 文字]

副標（功能利益層，1-2 句）：
[完整副標文字]

Social Proof（可信度，1 句含具體數字）：
[完整文字]

Pain Point Block（3 個競品痛點 → 3 個你的優勢）：
以前你可能試過：
  × [競品痛點 1]
  × [競品痛點 2]
  × [競品痛點 3]

[品牌名稱] 不一樣：
  ✓ [對應優勢 1]
  ✓ [對應優勢 2]
  ✓ [對應優勢 3]

主 CTA：[動詞開頭，≤ 10 字] →
次 CTA：[動詞開頭，≤ 10 字] →
\`\`\`

## 📣 廣告 4 版 Headlines

\`\`\`
版本 A｜情感主打（品牌認知 / 冷受眾）
Headline：[≤ 14 字，情感利益層]
Primary Text：[3-4 句，痛點 → 解方 → 品牌差異化]
CTA：[≤ 6 字]

版本 B｜功能主打（Retargeting / 已有認知受眾）
Headline：[≤ 14 字，功能利益層]
Primary Text：[3-4 句，功能特性 → 功能利益 → 具體結果]
CTA：[≤ 6 字]

版本 C｜競品痛點（對競品不滿意的用戶）
Headline：[≤ 14 字，直接打競品用戶痛點]
Primary Text：[3-4 句，競品問題 → 你的不同 → 具體優勢]
CTA：[≤ 6 字]

版本 D｜ICP 精準（直接對話目標客群角色）
Headline：[≤ 14 字，用 ICP 的職稱或情境開頭]
Primary Text：[3-4 句，ICP 情境 → 痛點 → 解法 → 情感結尾]
CTA：[≤ 6 字]
\`\`\`

## 📧 Email Subject Lines（4 條）

\`\`\`
1. [好奇心 / 利益驅動型]
2. [競品對比型]
3. [ICP 直呼職稱型]
4. [痛點共鳴型]
\`\`\`

## 📊 A/B 效力評估

| 版本 | 情感強度 | 差異化 | 建議用途 |
|------|---------|-------|---------|
| A | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Hero / 品牌認知 |
| B | ⭐⭐⭐ | ⭐⭐⭐ | Retargeting |
| C | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 競品用戶拉新 |
| D | ⭐⭐⭐⭐ | ⭐⭐⭐ | 精準 ICP 投放 |

主推組合建議：[說明為何選這個組合]

---
**下一步**：Step 6 Squad Lead 將整合所有步驟輸出，完成品牌利益階梯定位書最終交付。
**確認問題**：4 版 Headlines 中，哪一版最接近你期望品牌呈現的氣質？`,

  // ── 最終步驟：Squad Lead 交付四份文件 ──────────────────────────────────────
  "benefit-based:final": `
【最終交付格式（強制）— 輸出四份完整文件】
你是 Squad Lead，負責整合所有步驟成果，輸出以下四份完整文件。
字數上限：1800 字（四份合計）。每份文件必須完整，不得截斷。
禁止：不得重述「前面各步驟已說明」，直接輸出文件內容。

---

# 📄 文件一：Landing Page Copy

\`\`\`
H1：[從 Step 5 選出最強版本或微調後的最終版]

副標：[最終版副標]

Social Proof：[最終版]

Pain Point Block：
以前你可能試過：
  × [痛點 1]
  × [痛點 2]
  × [痛點 3]

[品牌名稱] 不一樣：
  ✓ [優勢 1]
  ✓ [優勢 2]
  ✓ [優勢 3]

主 CTA：[最終版] →
次 CTA：[最終版] →
\`\`\`

---

# 📣 文件二：廣告 4 版 Headlines（最終版）

\`\`\`
版本 A｜情感主打
Headline：[最終版]
Primary Text：[最終版 3-4 句]
CTA：[最終版]

版本 B｜功能主打
Headline：[最終版]
Primary Text：[最終版 3-4 句]
CTA：[最終版]

版本 C｜競品痛點
Headline：[最終版]
Primary Text：[最終版 3-4 句]
CTA：[最終版]

版本 D｜ICP 精準
Headline：[最終版]
Primary Text：[最終版 3-4 句]
CTA：[最終版]
\`\`\`

---

# 📘 文件三：品牌利益階梯定位書

\`\`\`
══════════════════════════════════════════════════════
[品牌名稱]｜品牌利益階梯定位書
Benefit-Based Positioning Playbook  v1.0
══════════════════════════════════════════════════════

【一、核心定位句】
[一句話品牌主張]

定位邏輯：[2 句說明為何從情感利益出發而非功能]

──────────────────────────────────────────────────────
【二、利益階梯全覽】

  ▲ 品牌主張：[完整句]
  ▲ 社會認同：[完整句]
  ▲ 情感利益（核心）：[完整句]
  ▲ 功能利益：[2-3 項]
  ▲ 功能特性：[2-4 項]
  ▲ 行動呼籲：[完整句]

──────────────────────────────────────────────────────
【三、目標客群（ICP）】

主要：[職稱 / 公司規模 / 痛點 / 情感需求]
次要：[第二客群]

──────────────────────────────────────────────────────
【四、競品差異化定位】

[競品1] → [他們給什麼]
[競品2] → [他們給什麼]
[品牌名稱] → [你真正給的是什麼]

差異化核心：[1-2 句，說明你佔據的唯一心智位置]

──────────────────────────────────────────────────────
【五、各通路訊息一致性原則】

官網 Hero     → [情感利益層]
廣告（冷受眾）→ [痛點層]
廣告（暖受眾）→ [功能層]
Email 主旨   → [ICP 直擊]
LinkedIn     → [思想領袖層]

──────────────────────────────────────────────────────
【六、禁止使用的訊息方向】

× [禁止訊息 1 + 原因]
× [禁止訊息 2 + 原因]
× [禁止訊息 3 + 原因]

──────────────────────────────────────────────────────
【七、一句話定位測試】

當有人問「[品牌名稱] 是什麼？」
標準回答：「[20-40 字，涵蓋 ICP + 核心功能 + 情感差異化]」

══════════════════════════════════════════════════════
交付：利益階梯定位小組
\`\`\`

---

# 📊 文件四：Google Slides 簡報架構（9 頁）

\`\`\`
Slide 1｜封面
  標題：[品牌名稱] 品牌利益階梯定位
  副標：Benefit-Based Positioning Playbook
  日期：[執行日期]

Slide 2｜目標客群（ICP）& 核心痛點
  主要 ICP：[職稱 / 情境 / 痛點]
  次要 ICP：[職稱 / 情境 / 痛點]

Slide 3｜Benefit Ladder 視覺金字塔
  ▲ 品牌主張
  ▲ 情感利益（★ 核心層）
  ▲ 功能利益
  ▲ 功能特性
  ▲ CTA

Slide 4｜Message Ladder 完整版
  [從文件三 Section 二完整複製]

Slide 5｜Landing Page Hero Copy
  H1 / 副標 / Social Proof / Pain Point Block / CTA

Slide 6｜廣告 4 版 Headlines
  版本 A B C D 各一格，標註建議用途

Slide 7｜各通路訊息一致性原則
  [從文件三 Section 五複製]

Slide 8｜禁止使用的訊息方向
  [從文件三 Section 六複製]

Slide 9｜定位測試 & 下一步行動
  一句話定位測試：[完整句]
  立即：[行動 1]
  30 天：[行動 2]
  長期：[行動 3]
\`\`\`

---

**【交付方式說明】**
\`\`\`
若已連接 Google Drive → 自動建立 Slides 檔案，分享連結如下：[連結]
若已連接 Gmail → 已傳送 PDF 至 [信箱]
若皆未連接 → 以上四份文件已完整輸出於對話中，請手動複製使用
\`\`\``,

  // ═══════════════════════════════════════════════════
  // Differentiation Positioning（差異化定位）最終交付
  // ═══════════════════════════════════════════════════
  "differentiation:final": `
【最終交付格式（差異化定位書）】
輸出：差異化定位書（Differentiation Positioning Playbook）
結構：
  # [品牌名稱] 差異化定位書
  ## 核心差異化主張（April Dunford 格式）
  ## 獨特屬性清單（通過篩選的，及淘汰原因）
  ## 市場類別宣言
  ## 競品 Battlecard 摘要（2-3 個主要競品）
  ## 定位一致性手冊（各通路應用）
  ## 下一步行動（3 項，立即 / 30 天 / 長期）`,

  // ═══════════════════════════════════════════════════
  // JTBD Positioning 最終交付
  // ═══════════════════════════════════════════════════
  "jtbd:final": `
【最終交付格式（JTBD 定位書）】
輸出：JTBD Positioning Playbook
結構：
  # [品牌名稱] JTBD 定位書
  ## 核心 Job 定義（情境 + 觸發 + 成功標準）
  ## Job Map（開始→準備→執行→結束）
  ## 真正的競爭替代品（非傳統競品分類）
  ## JTBD 定位聲明（完整格式）
  ## 任務驅動訊息框架（官網 / 廣告 / 銷售話術）
  ## 下一步行動`,

  // ═══════════════════════════════════════════════════
  // Brand Archetype Positioning（品牌原型定位）
  // 核心設計：每個 step 必須展示完整研究軌跡
  // 格式：研究軌跡 → 信號萃取 → 分析結論 → 確認問題
  // ═══════════════════════════════════════════════════

  "brand-archetype:1": `
【Step 1 輸出格式（強制）— 現有品牌人格診斷】
字數：600-900 字。必須依序輸出以下三個區塊。

## [品牌名稱] 現有品牌人格診斷

### 🔍 研究軌跡

逐一列出你實際查閱的每個來源，格式如下（至少 4 個來源）：

| 來源 | 查閱內容 | 觀察到的品牌信號 |
|------|---------|----------------|
| 官網首頁（[品牌網址]） | Hero copy、H1 標題、CTA 用詞 | [具體引用 1-2 句原文或描述觀察到的語言模式] |
| 官網關於我們 | 使命宣言、創辦人故事、價值觀用詞 | [具體語言信號，例如：用「征服/主導/領先」→ Ruler 信號] |
| LinkedIn 品牌頁面 | 貼文語調、互動率高的內容類型、簡介措辭 | [觀察到的溝通模式] |
| 廣告素材（FB Ads Library 或已知廣告） | 廣告標題、訴求框架（功能/情感/恐懼） | [廣告語言信號] |
| 競品 A 官網（[競品名稱]） | 對比品牌語言觀察 | [差異化信號] |

### 📊 語調光譜打分（4 軸強制輸出）

基於以上研究，對品牌現有溝通進行定量評估：

| 光譜軸 | 1分 | 10分 | 品牌得分 | 判斷依據（引用具體素材） |
|--------|-----|------|---------|----------------------|
| 正式 ↔ 隨性 | 極度正式 | 極度隨性 | [1-10] | [引用具體文案或溝通形式] |
| 嚴肅 ↔ 輕鬆 | 全程嚴肅 | 純粹輕鬆 | [1-10] | [引用具體例子] |
| 尊重 ↔ 挑釁 | 高度尊重 | 主動挑釁 | [1-10] | [引用具體例子] |
| 複雜 ↔ 簡單 | 極度複雜 | 極度簡化 | [1-10] | [引用具體例子] |

### 🧬 隱性原型診斷

**目前主原型：[原型名稱]**
- 判斷依據：[列出 2-3 個從研究軌跡中萃取的具體信號，格式：「在 [來源] 中發現 [具體文字/行為]，這是 [原型] 的典型信號，因為...」]
- 佔位強度：[強/中/弱]，理由：[說明]

**次要原型信號：[原型名稱]（如有）**
- 判斷依據：[同上格式，具體來源 → 具體信號 → 原型判斷]

**期望原型 vs 現實原型落差矩陣**
| 維度 | 現狀（研究發現） | 期望（品牌願景） | 落差等級 |
|------|---------------|----------------|---------|
| 核心訴求 | [現狀] | [期望] | [🔴高/⚠️中/✅低] |
| 語調光譜 | [現狀] | [期望] | [等級] |
| 情感共鳴 | [現狀] | [期望] | [等級] |
| 差異化強度 | [現狀] | [期望] | [等級] |

---
**下一步**：Step 2 將由原型選擇專家負責，基於以上診斷在 Jung 12 原型地圖中標記競品佔位，並選定主輔原型組合。
**確認問題**：研究發現品牌目前呈現 [X 原型] 的信號，但你認為這符合你的品牌期望嗎？有沒有哪個通路的溝通你覺得「這不是我們的風格」？`,

  "brand-archetype:2": `
【Step 2 輸出格式（強制）— 原型選擇與組合】
字數：600-900 字。必須依序輸出以下三個區塊。

## [品牌名稱] 原型選擇理由書

### 🔍 研究軌跡 — 競品原型佔位地圖

逐一查閱每個競品的品牌溝通，記錄原型信號：

| 競品 | 查閱來源 | 關鍵語言信號（具體引用） | 判定原型 | 佔位強度 |
|------|---------|----------------------|---------|---------|
| [競品1] | 官網 Hero / LinkedIn / 廣告 | [具體引用：例如「We help enterprises dominate their market」] | [原型] | 強/中/弱 |
| [競品2] | [來源] | [具體引用] | [原型] | [強度] |
| [競品3] | [來源] | [具體引用] | [原型] | [強度] |
| [競品4] | [來源] | [具體引用] | [原型] | [強度] |

**原型空白分析**：
- 已強佔：[列出已被競品佔據的原型]
- 中度佔據：[有競品但未完全主導]
- 未被佔據 / 藍海：[列出空白原型，這是選型依據]

### 🎯 主原型選擇：[原型名稱]

**選擇邏輯鏈**（必須追溯到研究軌跡中的具體發現）：
1. **競品空間**：[競品A] 和 [競品B] 已佔據 [X原型] 和 [Y原型]，[目標原型] 在市場中尚無強力品牌（依據：上表研究）
2. **品牌能力匹配**：Step 1 研究發現品牌在 [具體面向] 已具備 [目標原型] 的潛在信號（例如：官網用詞「策略洞察」暗示 Sage 潛力）
3. **受眾心理對位**：目標受眾（[受眾描述]）的核心焦慮是 [X]，[目標原型] 的承諾正好對應此焦慮，因為 [原型心理學解釋]
4. **語言轉換成本**：從現狀 [現狀原型] 遷移到 [目標原型]，需要調整 [具體調整點]，不需要 [不需調整的點]

**Aspirational vs Current 雙軌對比**：
- **Current（現狀）**：品牌今天實際傳遞的原型感受 = [描述]
- **Aspirational（目標）**：品牌希望 12 個月後讓受眾感知的原型 = [描述]
- **遷移路徑**：[說明如何從 Current 走到 Aspirational，最重要的 2 個動作]

### 🔀 輔助原型：[原型名稱]（主從層次設計）

**為何選此輔助原型**：[從研究中找到的支撐依據]
**主從關係**：[主原型] 負責 [品牌核心身份]；[輔助原型] 負責 [產品/功能層的情感語言]
**邊界設定**：以下情況輔助原型不得取代主原型主導：[列出 2 個具體邊界]
**原型組合定位錨句**：
> [一句話，體現主原型定位 + 輔原型賦能，讓人一眼看出層次關係]

---
**下一步**：Step 3 將由品牌聲音專家負責，基於 [主原型]+[輔原型] 組合，建立用詞庫、句子結構偏好與各通路語調規範。
**確認問題**：[主原型] 和 [輔原型] 的層次組合中，你認為哪一個原型更貼近你對品牌靈魂的直覺感受？`,

  "brand-archetype:3": `
【Step 3 輸出格式（強制）— 品牌聲音指南】
字數：700-1000 字。必須依序輸出以下四個區塊。

## [品牌名稱] 品牌聲音指南（[主原型] × [輔原型]）

### 🔍 研究軌跡 — 同原型標竿品牌聲音分析

查閱與所選原型相同的標竿品牌，萃取聲音模式：

| 標竿品牌 | 查閱來源 | 具體引用（原文） | 萃取的聲音法則 |
|---------|---------|---------------|-------------|
| [同原型品牌1] | 官網 Hero Copy | "[具體引文，≤30字]" | [從此例學到的聲音規律] |
| [同原型品牌2] | LinkedIn 貼文 | "[具體引文]" | [聲音規律] |
| [同原型品牌3] | 廣告文案 | "[具體引文]" | [聲音規律] |

**萃取的共同聲音模式**：[從以上研究中歸納的 2-3 個規律，解釋為什麼這些模式能傳遞該原型感受]

### 📖 品牌聲音規範

**宜用詞庫（[主原型] 核心層）**
[列出 8-12 個詞彙，每個後面附上「為什麼這個詞傳遞 [原型] 感」的 1 句解釋]

**宜用詞庫（[輔原型] 輔助層）**
[列出 5-8 個詞彙，同上格式]

**禁用詞彙（附禁止原因）**
| 禁用詞 | 禁止原因（會傳遞什麼錯誤原型信號） | 替換建議 |
|--------|--------------------------------|---------|
| [詞1] | [原因] | [替換詞] |
| [詞2] | [原因] | [替換詞] |
（至少 6 個）

**This-But-Not-That（原型身份邊界）**
- [品牌名稱] 是 [形容詞]，但不是 [容易混淆的形容詞]（區別：[解釋]）
- [品牌名稱] 是 [形容詞]，但不是 [形容詞]（區別：[解釋]）
- [品牌名稱] 是 [形容詞]，但不是 [形容詞]（區別：[解釋]）

### 📱 各通路語調調節（Platform Playbooks）

| 通路 | 原型比例 | 語調微調原則 | 禁止事項 | 範例句（直接可用） |
|------|---------|------------|---------|----------------|
| 官網 | [主原型]80% / [輔原型]20% | [具體原則] | [禁止什麼] | "[範例文句]" |
| LinkedIn | [比例] | [原則] | [禁止] | "[範例]" |
| 廣告 | [比例] | [原則] | [禁止] | "[範例]" |
| Email | [比例] | [原則] | [禁止] | "[範例]" |
| 客服/聊天 | [比例] | [原則] | [禁止] | "[範例]" |

### ✍️ 句子結構偏好

**偏好結構**（附解釋為什麼此結構傳遞 [原型] 感）：
1. [結構名稱]：[描述] → 範例："[具體例句]"
2. [結構名稱]：[描述] → 範例："[具體例句]"
3. [結構名稱]：[描述] → 範例："[具體例句]"

**禁用結構**（附解釋）：
- 禁用 [結構]，原因：[解釋原型衝突]
- 禁用 [結構]，原因：[解釋]

---
**下一步**：Step 4 將由視覺識別專家負責，基於 [主原型]+[輔原型] 組合，制定配色系統、字型個性與攝影風格。
**確認問題**：以上「This-But-Not-That」的三組對比中，哪一組最準確抓住你對品牌個性的認知？`,

  "brand-archetype:4": `
【Step 4 輸出格式（強制）— 視覺與體驗方向】
字數：700-1000 字。必須依序輸出以下四個區塊。

## [品牌名稱] 視覺識別系統（[主原型] × [輔原型]）

### 🔍 研究軌跡 — 競品視覺與標竿品牌分析

| 品牌 | 查閱來源（URL/平台） | 視覺觀察（配色/字型/構圖） | 原型視覺信號 | 對我們的啟示 |
|------|------------------|--------------------------|------------|------------|
| [競品1] | 官網截圖 / Dribbble | [具體描述：主色、字型感、留白比例、圖像類型] | [傳遞什麼原型感受] | [我們應學習或刻意不同的點] |
| [競品2] | [來源] | [描述] | [信號] | [啟示] |
| [標竿品牌1]（同原型） | [來源] | [具體描述] | [信號] | [啟示] |
| [標竿品牌2]（同原型） | [來源] | [描述] | [信號] | [啟示] |

**視覺空白機會**：[基於以上研究，哪些視覺語言在市場中被過度使用，哪些是差異化空間]

### 🎨 配色系統

**主色（[主原型] 核心）**
- HEX：[#代碼]  RGB：[值]
- 選色依據：[從研究軌跡中找到的支撐，例如「[標竿品牌] 使用類似色調並獲得 [感受]，同時此色在 [原型] 心理學中代表 [含義]」]
- 應用場景：[具體列出]

**輔色（[輔原型] 能量）**
- HEX：[#代碼]
- 選色依據：[同上格式]
- 應用場景：[具體，不超過 30% 版面]

**中性色 / 底色**
- HEX：[#代碼]
- 應用原則：[具體]

**禁用色（附原因）**
- [色系]：禁止使用，因為會傳遞 [錯誤原型] 信號（參考：[研究中發現的反例品牌]）

### 🔤 字型個性

| 用途 | 字型名稱 | 選用理由（連結到原型心理） | 研究參考來源 |
|------|---------|------------------------|------------|
| 中文主標題 | [字型] | [為何此字型傳遞 [原型] 感] | [參考哪個品牌或設計系統] |
| 中文內文 | [字型] | [理由] | [來源] |
| 英文主標題 | [字型] | [理由] | [來源] |
| 介面/數字 | [字型] | [理由] | [來源] |

**禁用字型**：[字型名] — 原因：[傳遞錯誤原型信號的具體解釋]

### 📸 攝影風格 & 版面原則

**攝影主題與構圖**（基於研究發現同原型品牌的視覺語言）：
- 推薦場景：[具體描述，說明為何這些場景傳遞 [原型] 感]
- 光線風格：[具體，附研究來源：「[標竿品牌] 使用 [X光線風格]，傳遞...」]
- 構圖原則：[具體，附量化指導，如「留白 40% 以上」]
- 禁用攝影類型：[具體列出，並說明為何這些圖像傳遞錯誤的原型信號]

**Moodboard 方向（3 個具體參考意象）**：
1. [意象名稱]：[具體描述，說明為何選這個參考、它傳遞什麼 [原型] 感]
2. [意象名稱]：[同上]
3. [意象名稱]：[同上]

**版面偏好**：
- 網格系統：[具體，如「12欄，單頁資訊群組不超過3個」]
- 資訊密度：[具體原則]
- 動態原則：[入場動效規範]

---
**下一步**：Step 5 將由全通路稽核專家負責，以以上視覺規範為基準，逐一掃描所有現有觸點的一致性缺口。
**確認問題**：3 個 Moodboard 參考意象中，哪一個最接近你直覺中品牌應該呈現的視覺氣質？`,

  "brand-archetype:5": `
【Step 5 輸出格式（強制）— 全通路原型一致性稽核】
字數：700-1000 字。必須依序輸出以下三個區塊。

## [品牌名稱] 全通路原型一致性稽核報告

### 🔍 研究軌跡 — 逐通路素材掃描

逐一掃描每個品牌觸點，記錄觀察：

| 通路 | 查閱來源（URL/截圖） | 視覺一致性觀察 | 聲音一致性觀察 | 原型對齊觀察 |
|------|------------------|--------------|--------------|------------|
| 官網首頁 | [URL] | [具體觀察：配色/字型/圖像是否符合 Step 4 視覺規範] | [文案語調是否符合 Step 3 品牌聲音指南] | [是否傳遞 Step 2 選定的主原型感受] |
| 官網關於我們 | [URL] | [觀察] | [觀察] | [觀察] |
| LinkedIn 品牌頁 | [URL] | [觀察] | [觀察] | [觀察] |
| Facebook 品牌頁 | [URL] | [觀察] | [觀察] | [觀察] |
| Instagram | [URL] | [觀察] | [觀察] | [觀察] |
| Email 行銷（已知樣本） | [來源] | [觀察] | [觀察] | [觀察] |
| 廣告素材（FB Ads Library） | [URL] | [觀察] | [觀察] | [觀察] |

### 📊 一致性評分卡（Consistency Scorecard）

| 通路 | 視覺一致性 (1-10) | 聲音一致性 (1-10) | 原型對齊度 (1-10) | 綜合得分 |
|------|-----------------|-----------------|-----------------|---------|
| 官網 | [分] | [分] | [分] | [平均] |
| LinkedIn | [分] | [分] | [分] | [平均] |
| Facebook | [分] | [分] | [分] | [平均] |
| Instagram | [分] | [分] | [分] | [平均] |
| Email | [分] | [分] | [分] | [平均] |
| 廣告素材 | [分] | [分] | [分] | [平均] |

**整體品牌一致性率**：[計算平均，以百分比呈現，如 72%]

### ⚠️ 違例清單（Priority Matrix）

按嚴重程度排列，格式如下：

**🔴 P0 — 立即修正（嚴重偏離原型，傷害品牌信任）**
| 通路 | 具體違例（引用實際素材） | 違反哪個規範（連結到 Step 3/4） | 修正建議 |
|------|----------------------|------------------------------|---------|
| [通路] | [具體描述，例如：官網 Hero 使用圓體字，傳遞 Caregiver 感而非 Sage 感] | 違反 Step 4 字型規範（Sage 應使用 Playfair Display） | [具體替換建議] |

**🟡 P1 — 30 天內修正（部分偏離，稀釋品牌個性）**
| 通路 | 具體違例 | 違反規範 | 修正建議 |
|------|---------|---------|---------|
| [通路] | [描述] | [規範來源] | [建議] |

**🟢 P2 — 下一個版本優化（輕微不一致，機會改善）**
| 通路 | 具體違例 | 修正建議 |
|------|---------|---------|
| [通路] | [描述] | [建議] |

---
**下一步**：以上稽核完成後，Squad Lead Mary Allen 將整合所有步驟成果，輸出品牌原型定位最終建議與落地行動計畫。
**確認問題**：P0 違例清單中，哪一個問題你認為是最緊迫的，需要在下週內啟動修正？`,

  "brand-archetype:final": `
【最終交付格式（品牌原型定位書）】
輸出：品牌原型定位完整手冊
結構：
  # [品牌名稱] 品牌原型定位書
  ## 核心定位結論（主原型 + 輔原型 + 定位錨句）
  ## 五步驟洞察整合（每步關鍵發現 1-2 句，互相呼應說明）
  ## 品牌聲音規範摘要（宜用/禁用詞彙 Top 5 + This-But-Not-That）
  ## 視覺識別摘要（主配色 + 字型 + Moodboard 關鍵詞）
  ## 一致性稽核優先行動（P0 + P1 清單）
  ## 落地行動計畫（立即 / 30天 / 季度）`,
};

// ── Agent 角色到品牌大腦類別的映射 ───────────────────────────────────────────
const ROLE_TO_BRAIN_CATEGORY: Record<string, string> = {
  "市場研究師": "audience",
  "競品分析師": "competitors",
  "品牌策略師": "positioning",
  "文案師":     "voice",
  "定位策略師": "positioning",
  "品類設計師": "positioning",
  "內容策略師": "voice",
  "SEO 策略師": "audience",
  "數據分析師": "analytics",
  "活動策略師": "positioning",
};

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface AgentIdentity {
  name: string;
  title: string;
  specialty?: string | null;
  aiModel?: string | null;
}

export interface BrandContext {
  name?: string;
  industry?: string;
  description?: string;
  targetAudience?: string;
  brandVoice?: string;
  tagline?: string;
  positioningSummary?: string;
  website?: string;
}

export interface WorkflowStepDef {
  step?: number;
  order?: number;
  title?: string;
  name?: string;
  description?: string;
  outputType?: string;
  output?: string;
  requiredSkills?: string[];
}

export interface SquadPromptInput {
  agent: AgentIdentity;
  brand: BrandContext;
  workspace: string;
  missionTitle: string;
  squadName: string;
  squadMethodology: string;
  agentRole: string;              // 在這個 squad 裡的角色
  workflowStep: WorkflowStepDef;  // 本步驟定義
  stepIndex: number;              // 0 = lead intake, 1+ = workflow steps
  totalSteps: number;
  previousResults: Record<number, string>; // 前步驟成果摘要
  brandBrain: Record<string, string[]>;    // 品牌大腦
  isLead: boolean;
  recentMessages?: { role: string; content: string }[];
}

// ── 主函數 ────────────────────────────────────────────────────────────────────
export function buildSquadAgentPrompt(input: SquadPromptInput): string {
  const {
    agent, brand, workspace, missionTitle, squadName, squadMethodology,
    agentRole, workflowStep, stepIndex, totalSteps,
    previousResults, brandBrain, isLead,
  } = input;

  const wsDesc = WORKSPACE_DESCRIPTIONS[workspace] ?? `${workspace} 工作區`;

  // 1. 身份宣告（必須在 prompt 最頂部，含身份鎖定語）
  const identity = buildIdentityBlock(agent, squadName, agentRole, squadMethodology);

  // 2. 工作區域
  const workspaceSection = `【工作區域】\n${wsDesc}`;

  // 3. 任務背景
  const missionSection = `【任務背景】\n任務名稱：${missionTitle}\n工作區：${workspace}`;

  // 4. 品牌全貌
  const brandSection = buildBrandSection(brand);

  // 5. 品牌大腦
  const brainSection = buildBrainSection(brandBrain);

  // 6. 前步驟成果（以「參考文件」格式呈現，防止 group chat 解讀）
  const prevSection = buildPreviousResultsSection(previousResults, totalSteps);

  // 7. 本步驟任務
  const stepSection = buildStepSection(workflowStep, stepIndex, totalSteps, isLead);

  // 8. 行為指引（語言 + 字數上限 + 禁止語 + 步驟規則 + 方法論格式）
  const behaviorGuide = buildBehaviorGuide(
    isLead, stepIndex, totalSteps,
    squadMethodology,
    workflowStep.outputType ?? workflowStep.output,
  );

  const sections = [
    identity,
    workspaceSection,
    missionSection,
    brandSection,
    brainSection,
    prevSection,
    stepSection,
    behaviorGuide,
  ].filter(s => s.trim());

  return sections.join("\n\n");
}

// ── Section builders ─────────────────────────────────────────────────────────

/**
 * 身份宣告區塊
 * 關鍵設計：
 * - "這是你唯一的身份" 鎖定 persona，防止 role drift
 * - specialty 標記為必須體現在每句輸出中的核心約束，而非事實描述
 * - 明確禁止旁白者 / 群組總結者模式
 */
function buildIdentityBlock(
  agent: AgentIdentity,
  squadName: string,
  agentRole: string,
  squadMethodology: string,
): string {
  const lines = [
    `你是 ${agent.name}，${agent.title}。這是你唯一的身份——在整個回應過程中不得切換、模糊或放棄此身份。`,
    agent.specialty
      ? `核心專長（你的每一句分析都必須從這個專業角度出發，不得說成通用行銷建議）：${agent.specialty}`
      : null,
    `你在「${squadName}」小組的角色：${agentRole}。`,
    squadMethodology ? `小組方法論：${squadMethodology}` : null,
    `嚴格禁止：不得以旁白者、協調者或「群組總結者」身份發言；不得在輸出中致謝、引用、或回應其他 Agent 的名字或輸出內容。`,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildBrandSection(brand: BrandContext): string {
  if (!brand.name && !brand.description) return "";
  const lines = [
    "【品牌全貌】",
    brand.name           ? `品牌名稱：${brand.name}` : null,
    brand.industry       ? `產業：${brand.industry}` : null,
    brand.description    ? `品牌描述：${brand.description}` : null,
    brand.targetAudience ? `目標受眾：${brand.targetAudience}` : null,
    brand.tagline        ? `品牌標語：${brand.tagline}` : null,
    brand.brandVoice     ? `品牌聲音：${brand.brandVoice}` : null,
    brand.positioningSummary ? `現有定位摘要：${brand.positioningSummary}` : null,
    brand.website        ? `官網：${brand.website}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildBrainSection(brandBrain: Record<string, string[]>): string {
  const categories = Object.keys(brandBrain);
  if (categories.length === 0) return "";

  const CATEGORY_LABELS: Record<string, string> = {
    positioning: "定位",
    audience:    "目標受眾",
    voice:       "品牌聲音",
    competitors: "競品",
    custom:      "其他",
  };

  const lines = ["【品牌大腦（累積知識）】"];
  for (const cat of categories) {
    const label = CATEGORY_LABELS[cat] ?? cat;
    const entries = (brandBrain[cat] ?? []).slice(0, 3);
    lines.push(`${label}：`);
    for (const e of entries) {
      lines.push(`  · ${e.slice(0, 200)}`);
    }
  }
  return lines.join("\n");
}

/**
 * 前步驟成果區塊
 * 關鍵設計：
 * - 重命名為「參考文件」而非「前步驟成果」，防止模型將其解讀為群組對話
 * - 每個條目用 --- 分隔線包裹，強化「文件」而非「訊息」的視覺語義
 * - Header 明確指示：這些是閱讀材料，不是對話對象
 * - 禁止以「根據以上」「根據 Group Chat Context」開頭的迴響行為
 */
function buildPreviousResultsSection(
  previousResults: Record<number, string>,
  totalSteps: number
): string {
  const steps = Object.keys(previousResults)
    .map(Number)
    .sort((a, b) => a - b);

  if (steps.length === 0) return "";

  const lines = [
    "【參考文件：已完成步驟的書面記錄】",
    "（以下是本 session 中其他 Agent 已產出的文件。這些是你的閱讀材料，不是對話對象。" +
    "不得致謝、引用 Agent 名稱、或以「根據以上」「根據 Group Chat Context」「根據 Squad Lead」開頭。）",
  ];

  for (const step of steps) {
    const summary = previousResults[step];
    if (summary) {
      const label = step === 0
        ? "文件 0：Squad Lead 需求確認"
        : `文件 ${step}：Step ${step} 分析輸出`;
      lines.push(`--- ${label} ---`);
      lines.push(summary.slice(0, 500));
    }
  }

  lines.push("--- 參考文件結束 ---");
  lines.push("（以上文件僅供參考。你的任務是在此基礎上產出你這一步的【新內容】，不得重述已有結論。）");
  return lines.join("\n");
}

function buildStepSection(
  step: WorkflowStepDef,
  stepIndex: number,
  totalSteps: number,
  isLead: boolean
): string {
  const stepTitle  = step.title ?? step.name ?? (isLead ? "任務確認" : `Step ${stepIndex}`);
  const stepDesc   = step.description ?? "";
  const outputType = step.outputType ?? step.output ?? "";
  const skills     = step.requiredSkills?.join("、") ?? "";

  const lines = [
    isLead
      ? "【你的任務：Squad Lead 開場確認】"
      : `【你的任務：Step ${stepIndex} / ${totalSteps} — ${stepTitle}】`,
    stepDesc   ? `任務說明：${stepDesc}` : null,
    outputType ? `預期輸出格式：${outputType}` : null,
    skills     ? `本步驟必要技能：${skills}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * 行為指引區塊
 * 關鍵設計：
 * - 語言約束永遠是第一條（硬性規定）
 * - 字數上限緊接語言約束
 * - 禁止開頭語列表針對所有已觀察到的 failure mode 短語
 * - Lead 開場：強制問具體問題，不得問泛問題，結尾固定語
 * - 執行步驟：強制第一字符為 ## 標題，從根源殺死 filler openers
 * - 最終步驟：有完整輸出結構骨架
 */
function buildBehaviorGuide(
  isLead: boolean,
  stepIndex: number,
  totalSteps: number,
  squadMethodology?: string,
  outputType?: string,
): string {
  // ── Squad Lead 開場 Intake ─────────────────────────────────────────────────
  if (isLead && stepIndex === 0) {
    return [
      "【執行指引 — Squad Lead Intake（一問一答模式）】",
      "語言：繁體中文（硬性規定）。字數上限：180 字（含標點）。",
      "",
      "【格式硬性規定】",
      "禁止使用 Emoji（任何表情符號）。",
      "禁止使用 Markdown 格式（不得使用 **粗體**、# 標題、- 列表符號、| 表格、--- 分隔線）。",
      "禁止在輸出中包含 [RELAY:...] 格式的標記。",
      "只能輸出純文字段落，每段之間空一行。",
      "",
      "【核心原則 — 不重複已知，一次只問一個問題】",
      "資料來源：(A) 本 Prompt 中的【品牌全貌】區塊  (B) 品牌大腦  (C) 對話歷史。",
      "上方【品牌全貌】區塊中已有的資訊視為「已知」。絕對禁止問以下問題（已知）：",
      "  × 你的品牌是什麼？（已知：見品牌名稱）",
      "  × 你的產品/服務是什麼？（已知：見品牌描述）",
      "  × 你的目標客群是誰？（已知：見目標受眾）",
      "  × 你的產業是什麼？（已知：見產業）",
      "若【品牌全貌】品牌名稱有值 → 在第一句直接說出品牌名稱，表示你已讀取。",
      "每輪最多問 1 個問題。問完立即停止，等待回應。",
      "",
      "【根據對話輪次執行不同動作】",
      "▶ 第一輪（對話歷史無 assistant 訊息）：",
      "  1. 用一句話覆述【已知品牌資訊】（說品牌名稱 + 產業 + 1 個核心描述）",
      "  2. 自我介紹：你的 specialty + 這個小組的方法論，1 句話",
      "  3. 任務預告：本次執行共幾步，各由哪位專家負責，1 句話",
      "  4. 若品牌全貌資訊已齊全：直接說「資訊已齊備，我們現在開始。」",
      "     若有一個真正未知的關鍵問題（非上面禁問清單）：問這 1 個問題，結尾加「回答後立即開始。」",
      "",
      "▶ 第二輪（對話歷史已有 1 輪 assistant 訊息）：",
      "  1. 一句話確認收到用戶答案",
      "  2. 若資訊已齊全：說「好，我們開始，交給第一位專家 [名字] 執行。」",
      "  3. 若還有 1 個真正未知問題：問這 1 個問題，結尾「回答後立即開始。」",
      "",
      "▶ 第三輪及以後：直接說「好，開始執行。」並給出 1 句執行方向摘要。不再追問。",
    ].join("\n");
  }

  // ── 最終步驟：Squad Lead 交付 ─────────────────────────────────────────────
  const isLastStep = stepIndex >= totalSteps;
  if (isLastStep) {
    // 方法論特定格式：優先使用
    const methodologyFinalKey = squadMethodology ? `${squadMethodology}:final` : null;
    const methodologyFinalFormat = methodologyFinalKey
      ? METHODOLOGY_STEP_FORMATS[methodologyFinalKey]
      : null;

    if (methodologyFinalFormat) {
      return [
        "【執行指引 — 最終交付步驟（Squad Lead）】",
        "語言：繁體中文（硬性規定）。",
        "禁止開頭語：不得以「好的」「根據以上所有分析」「綜合各步驟」「作為最終總結者」「根據 Group Chat Context」開頭。",
        "直接輸出以下格式的三份交付文件，零前言、零後記：",
        methodologyFinalFormat.trim(),
      ].join("\n");
    }

    // 通用最終步驟格式（無方法論特定格式時）
    return [
      "【執行指引 — 最終輸出步驟】",
      "語言：繁體中文（硬性規定）。",
      "字數上限：900 字。不得有冗長前言、致謝語或「補充說明」附錄。",
      "禁止開頭語：不得以「好的」「根據以上所有分析」「綜合各步驟」「作為最終總結者」「根據 Group Chat Context」開頭。",
      "輸出結構（固定骨架，按順序輸出）：",
      "  # [報告標題：品牌名稱 + 任務名稱]",
      "  ## 執行摘要（50 字以內，核心定位一句話）",
      "  ## [每個前步驟一個區塊，用你自己的語言陳述核心結論，不得逐字複製前步驟文件，每區塊加入至少 1 個新洞察]",
      "  ## 下一步行動",
      "  1. [立即可執行，具體動作，含負責人或部門]",
      "  2. [30 天內，具體動作]",
      "  3. [長期（3 個月以上），具體動作]",
      "  （下一步行動區塊結束後停止，不得有其他補充）",
    ].join("\n");
  }

  // ── 中間執行步驟 ──────────────────────────────────────────────────────────
  // 方法論特定格式：優先使用，覆蓋通用格式
  const methodologyStepKey = squadMethodology ? `${squadMethodology}:${stepIndex}` : null;
  const methodologyStepFormat = methodologyStepKey
    ? METHODOLOGY_STEP_FORMATS[methodologyStepKey]
    : null;

  const baseGuide = [
    "【執行指引 — 執行步驟】",
    "語言：繁體中文（硬性規定）。",
    `字數上限：${methodologyStepFormat ? "800" : "600"} 字。超過即截止。不得加「補充說明」「注意事項」或「附錄」區塊。`,
    "禁止開頭語：不得以「好的」「根據 Group Chat Context」「根據以上分析」「根據 Squad Lead」「首先，讓我」「作為 [任何角色名稱]」「我來幫您」開頭。",
    "輸出規則：",
    "  1. 你的回應第一個字符必須是 Markdown 二級標題（## 開頭）。直接輸出分析，零過渡詞。",
    "  2. 使用 Markdown 結構：## 主標題，### 子標題，- 要點。每個 ### 區塊不超過 5 個要點。",
    "  3. 你的分析必須引入參考文件中【未曾出現過】的新觀點、新資料或新框架；若只是重述，視為無效輸出。",
    "  4. 不得在輸出正文中提及步驟編號（例如「如第 2 步所述」），直接陳述內容。",
    "【數據來源規則】每引用一個數據或統計數字，必須在其後標注來源：",
    "[來源: GA行為數據] | [來源: FB Ads報告] | [來源: 公開市場報告] | [來源: 行業估算值]",
    "若無真實API數據連接，使用：[來源: 行業估算值 — 建議串接GA/FB Ads取得真實數據]",
  ];

  if (methodologyStepFormat) {
    // 方法論格式完整替換結尾格式（包含 ---下一步 / 確認問題）
    baseGuide.push(methodologyStepFormat.trim());
  } else {
    // 通用結尾
    baseGuide.push(
      `  5. 結尾固定格式（兩行，不得省略）：`,
      `     ---`,
      `     **下一步**：Step ${stepIndex + 1} 將由 [下一步執行者角色] 負責 [一句話說明任務]。`,
      `     **確認問題**：[針對你剛才輸出內容的 1 個具體確認問題，不得是開放泛問]`,
    );
  }

  return baseGuide.join("\n");
}

// ── Squad Lead 最終整合 prompt ────────────────────────────────────────────────
/**
 * Squad Lead 在所有 Specialist 完成後執行的整合步驟。
 * 接收全部 step results，產出統一建議並開放用戶討論。
 */
export function buildLeadSynthesisPrompt(params: {
  agent:            AgentIdentity;
  brand:            BrandContext;
  squadName:        string;
  squadMethodology: string;
  workflowSteps:    Array<{ name?: string; title?: string; description?: string }>;
  stepResults:      Record<number, string>; // { 1: "...", 2: "...", ... }
  totalSteps:       number;
  brandBrain:       Record<string, string[]>;
}): string {
  const { agent, brand, squadName, squadMethodology, workflowSteps, stepResults, totalSteps, brandBrain } = params;

  // 1. 身份
  const identity = [
    `你是「${squadName}」的 Squad Lead，${agent.name}，${agent.title ?? ""}。`,
    `這是你唯一的身份，不得切換。`,
    agent.specialty ? `你的核心專業：${agent.specialty}。` : "",
  ].filter(Boolean).join("\n");

  // 2. 品牌
  const brandSection = [
    "【品牌】",
    brand.name        ? `品牌：${brand.name}` : "",
    brand.industry    ? `產業：${brand.industry}` : "",
    brand.description ? `描述：${brand.description.slice(0, 300)}` : "",
    brand.targetAudience ? `目標受眾：${brand.targetAudience}` : "",
  ].filter(Boolean).join("\n");

  // 3. 所有步驟成果（作為參考文件）
  const resultsSection = (() => {
    const parts: string[] = ["【各成員完成的分析成果（參考文件）】"];
    for (let i = 1; i <= totalSteps; i++) {
      const stepDef  = workflowSteps[i - 1];
      const stepName = stepDef?.title ?? stepDef?.name ?? `Step ${i}`;
      const result   = stepResults[i];
      if (result) {
        parts.push(`\n▌ Step ${i}：${stepName}`);
        parts.push(result.slice(0, 1200)); // 最多 1200 字 / 步驟
        parts.push(""); // 間隔
      }
    }
    return parts.join("\n");
  })();

  // 4. 品牌大腦補充
  const brainSection = (() => {
    const entries = Object.entries(brandBrain).flatMap(([, vals]) => vals).slice(0, 3);
    if (entries.length === 0) return "";
    return ["【品牌大腦補充知識】", ...entries.map(e => `- ${e.slice(0, 200)}`)].join("\n");
  })();

  // 5. 任務指示
  const task = [
    "【你的任務 — 最終整合與定案建議】",
    "",
    "所有成員已完成各自步驟。現在由你作為 Squad Lead 整合全部成果，輸出品牌定位的最終建議。",
    "",
    "輸出結構（必須依序）：",
    "1. **核心定位建議**：一句話說明品牌在市場中的唯一位置（Primary Archetype + 目標市場 + 差異化）",
    "2. **整合洞察**：2-3 個從各步驟分析中提煉出的關鍵洞察，說明它們如何互相支撐",
    "3. **落地行動**：按優先順序給出 3 個最重要的下一步行動（具體、可執行）",
    "4. **開放討論**：以一段話邀請用戶確認方向，或指出哪個環節還需要調整",
    "",
    "格式規定：",
    "- 繁體中文（硬性規定）",
    "- 可以使用 ## 標題和 **粗體**（這是最終報告，允許結構化）",
    "- 禁止使用 Emoji",
    "- 禁止自我介紹（不要說「作為 Squad Lead」「我是...」）",
    "- 第一個字必須是 ## 開頭的標題",
    `- 字數：400-700 字`,
    "- 結尾必須是開放式邀請：「請告訴我你對以上建議的看法，或指出哪個方向需要調整。」",
    "",
    "禁止開頭語（直接輸出內容，不寒暄）：",
    "「好的」「感謝各位」「讓我來整合」「根據以上」「綜合以上」「在整合所有分析之後」",
  ].join("\n");

  return [identity, "", brandSection, "", resultsSection, brainSection, "", task]
    .filter(s => s.trim())
    .join("\n\n");
}

// ── @mention 第二意見 prompt ──────────────────────────────────────────────────
export function buildSecondOpinionPrompt(
  mentionedAgent: AgentIdentity,
  primaryResponse: string,
  brand: BrandContext,
  userQuestion: string
): string {
  return [
    `你是 ${mentionedAgent.name}，${mentionedAgent.title}。這是你唯一的身份，不得切換。`,
    mentionedAgent.specialty
      ? `你的專業核心：${mentionedAgent.specialty}。你的每一句話都必須從這個專業角度出發，不得說成通用行銷建議。`
      : null,
    "",
    "【品牌背景】",
    brand.name ? `品牌：${brand.name}（${brand.industry ?? ""}）` : null,
    brand.description ? brand.description.slice(0, 300) : null,
    "",
    "【用戶問題】",
    userQuestion,
    "",
    "【前一位 Agent 的回答（參考文件，不是對話對象）】",
    primaryResponse.slice(0, 1500),
    "",
    "【你的任務】",
    "以你獨特的專業角度，對上述回答提供第二意見。",
    "回答必須包含：",
    "- 你認為有哪些地方值得補充或調整（從你的專業領域出發，不是泛評）",
    "- 你的專業領域中有什麼被前一位 Agent 遺漏的視角",
    "- 你的具體建議或不同看法",
    "",
    "語言：繁體中文（硬性規定）。",
    "字數上限：150 字。",
    "禁止開頭語：不得以「前一位 Agent 說得很好」「我同意以上分析」「作為補充」「好的」開頭。",
    "格式：第一個字符必須是 Markdown 二級標題（## 開頭），然後 2-4 個 - 要點，最後 1 句具體建議。",
  ].filter(Boolean).join("\n");
}
