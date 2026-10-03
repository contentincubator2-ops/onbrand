# OnBrand 程式碼架構

2026-09-08 依價目表重排。目錄就是價目表：三層賣點＋一層基礎設施，server 與 client 用同一套名字。

```
skills/ai-talent/
├── server/
│   ├── index.ts · db.ts · localDb.ts · bootstrap-env.ts   進入點與 DB 膠水（pm2／deploy 指著它們，不搬）
│   ├── routers/index.ts                                  appRouter 組裝點（tRPC 名稱＝前後端契約，不搬）
│   ├── platform/     基礎設施
│   │   ├── auth/         登入、信箱驗證、密碼、users 表
│   │   ├── core/         trpc、env、llm（router／circuit breaker／semaphore）、計費
│   │   │                 （plans／planGate／points／credits／tokenLedger／llmWithBilling）、
│   │   │                 加密、connectors（pipedream／bundle.social／cloud drive）、tierCompat
│   │   ├── routers/      billing、stripe、credits、tenant（workspace 5 席）、review（審核工作流）、
│   │   │                 notifications、support（Mia）、ops、adminStats、manus（MCP）、
│   │   │                 platformConnect、bundleConnect、cloudDrive
│   │   └── routes/       cloudOAuth、slackOAuth、publicAgents（express）
│   ├── strategy/     策略層 —— 品牌／產品／活動定位、品牌大腦、自建任務卡
│   │   ├── core/         brandContext／brandMarket／marketProfiles、positioningSteps／Docs／
│   │   │                 JobRunner／Lock、productDiscovery／Meta、brandTaskCards、brandPacks/
│   │   │                 aiBrief（簡報切段對欄位）、strategyMonitor（監測清單／策略提醒／掃描 worker）
│   │   ├── positioning/  tenStepPositioning
│   │   ├── routers/      brand、brandBrain、brandKnowledge（含 aiBrief）、brandColors、positioningJobs／Docs、
│   │   │                 pipeline、scope（product／event）、entity、workbench、brandTaskCard、personaAgent、
│   │   │                 strategyMonitor（專業方案）
│   │   └── routes/       positioningDoc（上傳定位文件）
│   ├── content/      內容層 —— 249 張任務卡、產出、排程與發布
│   │   ├── core/         quickTask*（各通路卡目錄）、*Craft（出處）、taskCardDates（上架日，git 產）、
│   │   │                 evergreenRationale（長青卡背後邏輯）、taskCatalogIndex／Registry／
│   │   │                 Source／Tray／Intake、quickTaskOrchestra、imageGen／mediaGen、
│   │   │                 squadRequirements、recordTaskRun、socialListeningScout
│   │   │                 （爆款注入）、scouts/perplexityScout
│   │   └── routers/      quickTask、squad、mission、output、image、media、promptTemplate、agent、
│   │                     planner（本週企劃）、inspiration（靈感）、imageCard、calendar、festival、publish、postFormat
│   └── performance/  成效層（示意版；真資料在電商營運報告導入時接）
│       ├── routers/      performance（資料來源串接狀態）
│       └── routes/       reportTemplate（粉絲團月報版型回填）
└── client/src/
    ├── main.tsx · lib/（trpc、i18n）· pages/auth · locales · components/ui
    ├── v2/app/           AppV2 路由 + shell/ShellLayout（不搬）
    ├── v2/platform/      pages：Account、Workspace、ReviewQueue、Pricing、Landing、legal、Admin*
    │                     components：Support（Mia）、review、plan（ChannelPicker／TaskPicker）、Trial
    ├── v2/strategy/      pages：Brands、BrandsManage、BrandSettings；components：positioning/*、
    │                     taskCard、onboarding；lib：positioningSchema／Pipeline／Prompts
    ├── v2/content/       pages：PlatformTask、Run、Projects、Planner、Inspiration、ImageCard、CampaignTray；
    │                     components：PlatformMockup、SquadMockups、quickTask、imageCard；lib：任務／mockup 工具
    └── v2/performance/   pages：DataWorkspace；components：PerformanceDashboard、ConnectionsPanel、
                          FanpageMonthlyReport、perfMockData
```

## 規則

- **一層一個目錄，跨層只從 `platform` 往上拿。** strategy／content／performance 可以 import platform；
  content 可以 import strategy 的 core（品牌 context 餵給任務）；反過來不行。
- **tRPC 名稱不隨目錄變。** `server/routers/index.ts` 是唯一的組裝點，client 只認 procedure 名。
- **client 不得 value-import server**（CI `scripts/check-client-server-boundary.sh` 擋；只允許 `import type`）。
- **新功能先對價目表。** 價目表上沒有的東西不進 repo（2026-09-07／08 兩輪清除的原因）。

## 搬家工具

`reorg.py`（session scratchpad）：先用舊路徑解析每個相對 import 指到哪個實體檔，再以新路徑重算相對字串並
保留原寫法（`.js` 後綴／目錄 import／無副檔名），全部改完才 `git mv`；`check` 模式重新解析整棵樹，斷鏈必須為 0。
