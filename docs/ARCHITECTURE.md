# SoWork Enterprise — 架構文件 v1.0

> 基於 OpenClaw 平台的企業級行銷 AI 系統
> 作者：PM Agent｜日期：2026-04-02

---

## Part 1：定位驗證 — 為什麼這個產品比其他 AI 更有獨特賣點

### 1.1 市場現況與競爭者比較

| 競品 | 能做什麼 | 根本缺陷 |
|------|---------|---------|
| ChatGPT / Claude | 對話、生成文字 | 沒有品牌記憶、沒有任務追蹤、沒有 Agent 分工 |
| Jasper / Copy.ai | 文案生成 | 沒有策略層、沒有執行層分離、沒有 A2A 協作 |
| HubSpot AI | CRM + 行銷自動化 | 不懂品牌定位、沒有 AI 員工概念、不可自訂 |
| Notion AI | 內容生成 | 沒有行銷執行能力、沒有多 Agent 協作 |
| Manus | 任務執行 Agent | 無品牌知識庫、無學習累積、無行銷垂直深度 |

### 1.2 SoWork Enterprise 的三個核心護城河

**護城河 1：越用越懂你的品牌知識庫**
- RAG 向量搜尋（Azure AI Search）+ 品牌文件上傳
- `learning.ts`：每次任務完成自動儲存學習記錄
  - 月租型用戶：品牌私有學習（`isPrivate=true`）
  - 任務型用戶：公共知識貢獻，平台整體提升
- 效果：第 1 次使用 70 分 → 第 30 次使用 95 分，競品永遠停在 70 分

**護城河 2：三層 AI 人才架構（業界唯一）**
```
CMO 層（品牌策略）
  ↓ 拆解任務、分配預算
策略 PM 層（管道策略）
  ↓ 制定執行計畫
執行 Specialist 層（內容產出）
  ↓ 輸出可發布成果
品牌知識庫（RAG）
```
- 每層各司其職，輸出結構化，不是一個黑盒 AI

**護城河 3：A2A 自動工作流（Agent-to-Agent 自主運營）**
- `triggerWorkflows.ts`：任務完成後自動觸發下游任務
- 例：「品牌定位完成」→ 自動觸發「Facebook 貼文撰寫」→ 自動觸發「廣告 A/B 測試方案」
- 用戶感受：我設定了一個任務，AI 自動完成後面 5 個相關工作

### 1.3 完整用戶感受旅程（定位 → 執行）

```
用戶說：「我要進攻台灣市場」

Step 1 — CMO Agent 分析
  輸出：品牌定位建議、TA 分析、競品地圖

    ↓ A2A 自動觸發

Step 2 — SEO 策略 PM
  輸出：關鍵字清單、內容架構

Step 3 — Meta 廣告策略 PM
  輸出：受眾設定建議、預算分配

    ↓ A2A 自動觸發

Step 4 — 文案 Specialist
  輸出：5 組 Facebook 廣告文案（含 A/B 版本）

Step 5 — 新聞稿 Specialist
  輸出：媒體發稿稿件

用戶全程只說了一句話，AI 跑完整個行銷啟動流程。
這就是 Agent-to-Agent 自主運營。
```

---

## Part 2：技術架構藍圖

### 2.1 整體系統架構

```
┌─────────────────────────────────────────────────────┐
│                  OpenClaw Gateway                    │
│  (Slack / LINE / Telegram / WhatsApp / WebChat...)  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              SoWork Enterprise Skills               │
│                                                     │
│  ┌─────────────────┐  ┌─────────────────────────┐   │
│  │ skill-ai-talent │  │  skill-brand-engine     │   │
│  │ (ai-claw-team)  │  │  (sowork-ai-v2)         │   │
│  │                 │  │                         │   │
│  │ • CMO Agent     │  │ • 品牌定位分析           │   │
│  │ • Strategy PM   │  │ • Campaign 規劃          │   │
│  │ • Exec Agent    │  │ • 廣告素材生成           │   │
│  │ • A2A Workflow  │  │ • 市場切換（13市場）     │   │
│  └────────┬────────┘  └───────────┬─────────────┘   │
│           │                       │                 │
│  ┌────────▼───────────────────────▼─────────────┐   │
│  │            Core Orchestration Layer           │   │
│  │         (from ai-mobile-team/chiefOfStaff)    │   │
│  │  • 意圖辨識 → Agent 推薦 → 任務派發 → 追蹤    │   │
│  └────────────────────┬──────────────────────────┘   │
│                       │                             │
│  ┌────────────────────▼──────────────────────────┐   │
│  │              Data & Knowledge Layer            │   │
│  │  RAG (Azure AI Search) │ Brand DB │ Learning   │   │
│  └────────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ skill-market-    │  │  skill-enterprise-       │   │
│  │ intel            │  │  tenant                  │   │
│  │ (news-sowork)    │  │  (sowork_claw_slack)      │   │
│  │ • 全球新聞抓取   │  │  • Multi-tenant 隔離      │   │
│  │ • AI 市場分析    │  │  • 計費/方案管理          │   │
│  └──────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2.2 Repo 來源對應表

| Skill 模組 | 主要來源 Repo | 移植方式 |
|-----------|-------------|---------|
| `skill-ai-talent` | `sowork-dev/ai-claw-team-v1` | 以此為骨幹，重構為 OpenClaw Skill 規範 |
| `skill-brand-engine` | `sowork-dev/sowork-ai-v2` | 抽取 brand/campaign 邏輯層，不搬 UI |
| `core-orchestration` | `sowork-dev/ai-mobile-team` | `chiefOfStaff.ts` + `taskRouting.ts` |
| `skill-market-intel` | `biombacj-cell/news-sowork` | 取 `newsIngestion.ts` + `aiAnalysis.ts` + `scheduler.ts` |
| `skill-enterprise-tenant` | `contentincubator2-ops/sowork_claw_slack` | Onboarding + 三層知識庫 |
| `ci-qa` | `contentincubator2-ops/sowork-qa-suite` | 直接套進 CI/CD pipeline |
| `shared/globalization` | `sowork-ai-v2` | 13 市場 × 16 語言，直接複用 |

---

## Part 3：A2A 工作流詳細設計

### 3.1 已有的 A2A 基礎（來自 ai-claw-team-v1）

```typescript
// 任務完成後自動觸發鏈
executeTask(taskId)
  → saveLearning()          // 學習記錄
  → triggerWorkflowsForTask() // 觸發下游工作流
    → 建立下游 tasks[]       // 每個步驟 = 一個新任務
    → 指派給對應 Agent
    → 設定 delayMinutes（錯開執行時間）
```

### 3.2 擴充設計：跨市場 A2A 工作流

```
用戶設定：「進攻德國、東南亞、台灣三個市場」

OpenClaw Orchestration Layer 自動：

[並行執行]
├── 🇩🇪 德國市場 Agent 組
│   CMO(德國) → SEO_PM(de-DE) → Copywriter(de-DE)
│
├── 🇸🇬 東南亞市場 Agent 組  
│   CMO(SEA) → Meta_PM(en-SG) → Copywriter(en-SG)
│
└── 🇹🇼 台灣市場 Agent 組
    CMO(TW) → Meta_PM(zh-TW) → Copywriter(zh-TW)

[匯報層]
Global CMO Agent 聚合三市場結果 → 生成跨市場比較報告
```

### 3.3 A2A 自主運營觸發條件

| 觸發條件 | 自動觸發的下游任務 |
|---------|----------------|
| 品牌定位完成 | → SEO 關鍵字研究 + Meta 受眾建議 |
| 競品分析完成 | → 差異化文案 × 3 + 廣告素材方向 |
| 市場情報更新 | → 品牌回應建議 + 社群文案 |
| Campaign 方案完成 | → 各渠道執行素材（FB/IG/LINE/EDM） |
| A/B 測試方案完成 | → 排程發布任務（指定時間自動執行） |

---

## Part 4：企業多租戶架構

### 4.1 Tenant 隔離設計

```
Workspace Level（企業）
├── brand_id[]              ← 多品牌支援
├── product_id[]            ← 多產品線
├── market_id[]             ← 多市場（13 個）
├── agent_assignments[]     ← 專屬 AI 人才配置
├── knowledge_base[]        ← 企業私有知識庫
└── usage_ledger[]          ← 計費記錄

Department Level（部門）
├── team_members[]
├── dept_knowledge[]
└── shared_workflows[]

Personal Level（個人）
└── private_learnings[]
```

### 4.2 計費方案設計（來自 ai-claw-team-v1）

| 方案 | 適合客戶 | 月費 | A2A 工作流 | 知識庫 |
|------|---------|------|-----------|-------|
| 任務型 | 中小企業 | 依任務計費 | ❌ | 公共 |
| 月租 Growth | 成長品牌 | NT$9,800 | ✅ 5 條 | 品牌私有 |
| 月租 Pro | 中大型企業 | NT$29,800 | ✅ 20 條 | 品牌私有 + 多市場 |
| Enterprise | 跨國企業（華為等級） | 客製報價 | ✅ 無限 | 全域隔離 + Global CMO |

---

## Part 5：資料流與 DB Schema 設計

### 5.1 核心資料表（繼承自 ai-claw-team-v1，擴充）

```sql
-- 已有（直接繼承）
agents              -- AI 人才檔案（三層架構）
brands              -- 品牌資料
tasks               -- 任務記錄
task_executions     -- 任務執行結果
taskWorkflows       -- A2A 工作流定義
agentLearnings      -- AI 學習記錄（越用越懂你）
subscriptions       -- 訂閱方案

-- 新增（企業版擴充）
tenants             -- 企業租戶
tenant_markets      -- 租戶 × 市場配置（支援多市場切換）
market_workflows    -- 跨市場並行工作流
global_reports      -- 跨市場聚合報告
```

### 5.2 市場切換資料模型

```typescript
interface TenantMarket {
  tenantId: number;
  marketId: string;         // 'Taiwan' | 'Germany' | 'Singapore'...
  contentLanguage: string;  // 'zh-TW' | 'de-DE' | 'en-SG'...
  defaultAgentSet: AgentId[];  // 該市場專屬的 AI 人才配置
  brandKnowledgeId: string;    // 市場專屬的品牌知識庫
  complianceFlags: string[];   // ['GDPR'] | ['FTC'] | []
}
```

---

## Part 6：新 Repo 建立計畫

### 6.1 Repo 命名建議

```
github.com/sowork-dev/openclaw-enterprise
```

### 6.2 初始目錄結構

```
openclaw-enterprise/
├── README.md
├── ARCHITECTURE.md          ← 本文件
│
├── skills/
│   ├── ai-talent/           ← 核心引擎（from ai-claw-team-v1）
│   │   ├── SKILL.md
│   │   ├── server/
│   │   │   ├── executeTask.ts
│   │   │   ├── triggerWorkflows.ts
│   │   │   ├── learning.ts
│   │   │   ├── rag.ts
│   │   │   └── routers/
│   │   └── shared/
│   │
│   ├── brand-engine/        ← 品牌引擎（from sowork-ai-v2 抽邏輯）
│   │   ├── SKILL.md
│   │   └── server/
│   │       ├── brandPositioningAnalysis.ts
│   │       ├── campaignPositioningAnalysisEngine.ts
│   │       └── brandStrategyReportGenerator.ts
│   │
│   ├── market-intel/        ← 市場情報（from news-sowork）
│   │   ├── SKILL.md
│   │   └── server/
│   │       ├── newsIngestion.ts
│   │       ├── aiAnalysis.ts
│   │       └── scheduler.ts
│   │
│   └── enterprise-tenant/   ← 多租戶（from sowork_claw_slack）
│       ├── SKILL.md
│       └── server/
│           └── onboardingService.ts
│
├── shared/
│   ├── globalization.ts     ← 13 市場 × 16 語言（直接複用）
│   └── types.ts
│
├── mobile/                  ← Mobile UI（from ai-mobile-team）
│   └── src/mobile/
│
└── .github/
    └── workflows/
        └── ci.yml           ← from sowork-qa-suite
```

### 6.3 Phase 1 執行順序（建議 4 週）

| 週次 | 任務 | 負責 |
|------|------|------|
| Week 1 | 建 repo + 搬 `ai-talent` skill 核心（executeTask / workflow / learning） | 工程 |
| Week 1 | DB migration（繼承 ai-claw-team-v1 schema + 新增 tenant_markets） | 工程 |
| Week 2 | 接 OpenClaw Gateway（Slack / LINE channel 觸發任務） | 工程 |
| Week 2 | 搬 `globalization.ts`，實作多市場切換 API | 工程 |
| Week 3 | 搬 `brand-engine` skill，接品牌定位 → A2A 觸發廣告文案流程 | 工程 |
| Week 3 | 搬 Mobile UI，實作任務追蹤頁面 | 工程 |
| Week 4 | 接 `market-intel`（NewsFlow），實作市場動態 → 品牌回應 A2A | 工程 |
| Week 4 | QA + CI/CD（sowork-qa-suite） | QA |

---

## Part 7：獨特賣點一句話總結

> **SoWork Enterprise = 一個懂你品牌、在全球多個市場同時運作、任務完成後自動觸發下一個任務、越用越聰明的 AI 行銷團隊 — 運行在 OpenClaw 上，用你已經在用的頻道操控。**

競品做的是「AI 工具」。
我們做的是「AI 員工組成的行銷部門，自主運營」。

---

*文件版本：v1.0 | 2026-04-02 | PM Agent*
