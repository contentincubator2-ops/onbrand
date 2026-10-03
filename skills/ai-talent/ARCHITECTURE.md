# OnBrand 程式碼架構

目錄就是價目表：三層賣點加一層基礎設施，server 與 client 用同一套名字。前端側邊欄的「策略／內容／成效」三層，
對應的就是 `strategy`、`content`、`performance` 三個目錄。

## 依賴規則：一條線性順序

```
platform  <  strategy  <  content  <  performance
基礎設施      策略層        內容層        成效層
```

**每一層只能 import 順序在它之前（含自己）的層。** 策略讀基礎設施；內容讀策略（品牌 context 餵給任務）；
成效讀內容與策略（活動達成率要對照企劃與產出）。反過來一律不行。這條順序和產品的流程一致：先有策略，
再有內容，最後量成效。

另有兩個「組合層」，可以 import 所有層，但沒有任何層可以 import 它們：

| 組合層 | 內容 | 為什麼獨立 |
| --- | --- | --- |
| `server/gateway` | MCP 連接器（mcp/）、landing 頁資料、通知（routers/） | 它們要同時讀任務目錄、策略資料與帳號，本質上是「橫跨所有層的對外入口」 |
| client `v2/app` | AppV2 路由、`shell/`（ShellLayout、導覽、通知、帳號彈窗） | 路由與外殼要把各層的頁面組在一起 |

組裝點 `server/index.ts`、`server/routers/index.ts`、`server/bootstrap-env.ts` 同樣可以 import 所有層。

**基礎檔**任何層都可以 import，它們自己不能 import 任何層：server 的 `db.ts`／`localDb.ts`、`drizzle/`，
client 的 `lib/`（trpc、i18n、countries）與 `locales/`。

**測試檔不受限**，可以跨層驗證（例如拿真實任務卡目錄對前端的鏡像）。client 的 `lib/trpc.ts` 可以
`import type` 伺服器的 `appRouter`，這是型別而不是執行時依賴。

`scripts/check-layer-boundaries.mjs` 會在 CI 和 dev 部署前檢查這條規則。違規時不要加例外：把被引用的檔案
搬到順序較前的層（通用工具進 platform），或改由組合層注入。

### 兩個常見的處理方式

- **通用工具放 platform。** 抓網頁、網址防護、生圖模型政策、圖片規格、轉錄、研究偵察這些，策略和內容都要用，
  所以在 `platform/core/web`、`media`、`scouts`，而不是在其中一層裡讓另一層去借。
- **策略頁要放內容層長出來的畫面時，用插槽。** 活動頁是「定位＋企劃合一頁」，工作區要用內容層的貼文預覽，
  所以工作區在 `content/components/campaign`；策略層的 BrandsPage 只留一個位置，由 AppV2 透過
  `strategy/lib/campaignSlots.tsx` 提供實際元件。

## 目錄

```
skills/ai-talent/
├── server/
│   ├── index.ts · db.ts · localDb.ts · bootstrap-env.ts   進入點與 DB 膠水（pm2／deploy 指著它們）
│   ├── routers/index.ts                                  appRouter 組裝點（tRPC 名稱＝前後端契約）
│   ├── platform/     基礎設施
│   │   ├── auth/         登入、信箱驗證、密碼、users 表
│   │   ├── core/
│   │   │   ├── llm/          llm（供應商鏈）、llmRouter、circuit breaker、multiModelRouter、embedding、llmWithBilling
│   │   │   ├── billing/      plans、planGate、points、credits、tokenLedger、imageBilling、fx、addonRequests、catalogFigures
│   │   │   ├── connectors/   pipedream、bundle.social、cloud drive、token 加密；publish/（發布供應商選擇）
│   │   │   ├── media/        mediaGen、imageFetch、stillImageModels（兩模型政策）、platformImageSpecs、transcription
│   │   │   ├── web/          urlGuard、urlContext、youtubeContext
│   │   │   ├── scouts/       perplexityScout 與型別（研究偵察）
│   │   │   ├── ops/          activationFunnel、recordTaskRun、startupCleanup、touchpoints、runtimeSafety
│   │   │   ├── agents/       agentKnowledge（agent 知識執行時載入）、mosCatalog
│   │   │   └── trpc · env · encryption · timeout · tierCompat · perfUtm（根層的小件）
│   │   ├── routers/      billing、stripe、credits、tenant（workspace 5 席）、review（審核工作流）、support（Mia）、
│   │   │                 ops、adminStats、manus、mosAgentsMcp、platformConnect、bundleConnect、cloudDrive、
│   │   │                 navPrefs、touchpoints、addon
│   │   └── routes/       cloudOAuth、slackOAuth、publicAgents（express）
│   ├── strategy/     策略層 —— 品牌／產品／活動定位、品牌大腦
│   │   ├── core/
│   │   │   ├── brand/        brandContext（品牌大腦）、brandMarket／marketProfiles、brandMemory、brandRegulations、
│   │   │   │                 assetPhotos、brandColor*、copywritingMaster
│   │   │   ├── positioning/  positioningSteps／Docs／JobRunner／Lock／Director、aiBrief、decisionBridge、tenStepPositioning
│   │   │   ├── entities/     productMeta／productSiblings、eventCalendar、eventProductScope
│   │   │   ├── monitor/      strategyMonitor、competitorSnapshot、socialListeningScout、interimQuickPulse
│   │   │   └── strategist/   strategistDirectory（策略總監三人選）
│   │   ├── routers/      brand、brandBrain、brandKnowledge、brandColors、brandRegulation、positioningJobs／Docs、
│   │   │                 pipeline、scope、entity、eventCalendar、workbench、personaAgent、strategistChat、strategyMonitor
│   │   └── routes/       positioningDoc（上傳定位文件）
│   ├── content/      內容層 —— 任務卡、產出、排程與發布、活動企劃
│   │   ├── core/
│   │   │   ├── catalog/      任務庫：quickTask*（各通路卡片定義）、*Craft（出處）、craftSource、taskCatalogIndex／
│   │   │   │                 Registry／Source／Tray／Intake、taskCardDates（上架日，git 產）、evergreenRationale、
│   │   │   │                 brandPacks／brandTaskCards（客戶任務包與自建卡）、postFormat*（爆款結構）
│   │   │   ├── engine/       執行：quickTaskOrchestra（orchestra/ 是它拆出的階段呼叫、後處理、生圖步驟）、
│   │   │   │                 各種合約（adCopy／adSlot／shotList／rewrite／wuganVoice）、variantAngles、writerDrafts…
│   │   │   ├── image/        imageGen／imageCards、提示詞守門與翻譯、視覺簡報、taskIllustration
│   │   │   ├── squad/        agentMatcher／Assignments／ContextLoader／SquadSynth、squadLeadQA、squadRequirements
│   │   │   ├── planning/     weeklyPlanner、plannerAdvisors、inspirationStage、projectFilters、vendorFinder
│   │   │   ├── campaign/     活動企劃：campaignPlan／Chat／ChatStore／Team／Roster／Kpi／ChannelBrief…
│   │   │   └── publish/      bundlePublishService
│   │   └── routers/      quickTask（quickTask/ 放拆出的 procedure 群組）、squad（squadTemplate/）、mission、output、
│   │                     image、imageCard、media、promptTemplate、agent、planner、inspiration、calendar、festival、
│   │                     publish、postFormat、vendor、campaign、brandTaskCard
│   ├── performance/  成效層（示意版；真資料在電商營運報告導入時接）
│   │   ├── core/         perfImport／Pivot／Store／AI、campaignPerf（活動達成率）、fbPageSync
│   │   ├── routers/      performance
│   │   └── routes/       reportTemplate（粉絲團月報版型回填）
│   └── gateway/      組合層
│       ├── mcp/          OAuth、onbrandMcpRouter、onbrandTools（MCP 連接器）
│       └── routers/      landing、notification
└── client/src/
    ├── main.tsx · lib/（trpc、i18n）· locales · pages/OnboardingWizard
    ├── v2/app/           AppV2 路由；shell/（ShellLayout 與拆出的 nav、IconBar、BrandHierarchyPill、NotifPanel…）
    ├── v2/platform/      pages：Account、Workspace、ReviewQueue、Pricing、Landing、auth/、legal/、Admin*
    │                     components：Support（Mia）、review、plan（ChannelPicker／TaskPicker）、Toast、ScopeBar、
    │                                 TaskCardShell、RunningAgentCarousel
    │                     lib：shellContext（外殼型別與帳號閘門）、channelMeta、sourceVocabulary、imageCardHandoff…
    ├── v2/strategy/      pages：Brands（brands/ 放拆出的面板）、BrandsManage、BrandSettings
    │                     components：positioning／assets／director／events／brain／regulations／taskCard／onboarding
    │                     lib：positioningSchema／Pipeline、campaign/（活動設定與規則的鏡像）、campaignSlots
    ├── v2/content/       pages：PlatformTask、Run（run/）、Projects、Planner、Inspiration、ImageCard、CampaignTray、SquadLab
    │                     components：PlatformMockup、SquadMockups、quickTask、imageCard、campaign（活動企劃工作區）
    └── v2/performance/   pages：DataWorkspace；components：PerformanceDashboard、ConnectionsPanel、
                          FanpageMonthlyReport、CampaignPerformance、LensWorkspace
```

## 「活動」為什麼在三層都出現

活動是橫跨三層的概念，各層只放自己那一份：

| 層 | 放什麼 |
| --- | --- |
| 策略 | 活動是一種定位範圍：活動卡、年度時間軸、活動設定（`entities/eventCalendar`、`eventProductScope`，前端 `strategy/lib/campaign`） |
| 內容 | 把企劃一篇一篇寫出來：企劃、團隊對話、通路說明單、寫這一篇（`content/core/campaign`、前端 `content/components/campaign`） |
| 成效 | 企劃目標對上真正發出去的貼文（`performance/core/campaignPerf`、前端 `CampaignPerformance`） |

## 其他規則

- **tRPC 名稱不隨目錄變。** `server/routers/index.ts` 是唯一的組裝點，client 只認 procedure 名。
- **client 不得 value-import server**（`scripts/check-client-server-boundary.sh` 擋；只允許 `import type`）。
- **新功能先對價目表。** 價目表上沒有的東西不進 repo。
- **檔案太大先拆頂層宣告。** 一個檔案裡的資料表、輔助函式、獨立元件拆到旁邊的子目錄；router 則把 procedure 依用途
  分成幾個物件再展開回去（例如 `quickTask/`、`squadTemplate/`）。入口檔保留原本的匯出，外面的 import 不用改。

## 新增檔案放哪

1. 它會被兩層以上用到、而且不含產品語意？放 `platform`。
2. 它在回答「這個品牌是誰、怎麼定位」？放 `strategy`。
3. 它在產生或排程內容？放 `content`；任務卡定義放 `core/catalog`，執行與品質放 `core/engine`。
4. 它在量成效？放 `performance`。
5. 它要同時讀好幾層才能成立（對外入口、路由組裝）？放組合層。
6. 不確定時跑 `node scripts/check-layer-boundaries.mjs`，它會告訴你哪個 import 方向不對。
