# onBrand Studio

> 經過訓練與認證的 AI 行銷團隊：把品牌定位方法寫進品牌大腦，再由任務庫與多模型 AI 產出、編排並發布一致的跨平台行銷內容。

onBrand Studio（2026-09-30 由 OnBrand AI 正名）是一套從品牌策略一路做到內容執行與成效的行銷平台。SoWork 是營運與方法論來源。

## 程式碼架構

目錄就是價目表：策略、內容、成效三層加一層基礎設施，server 與 client 用同一套名字。

```text
onbrand/
├── skills/ai-talent/        主產品
│   ├── server/              Express + tRPC；platform／strategy／content／performance
│   ├── client/              React 18 + Vite；src/v2 同樣分四層
│   ├── drizzle/             MySQL schema 與 migrations
│   ├── scripts/             維運用：migrate、seed、audit、probe、封面與插圖產生
│   ├── data/                任務與 agent 的靜態資料
│   └── ARCHITECTURE.md      每一層放什麼、跨層依賴規則（以它為準）
├── integrations/            對外散布的 Claude 外掛（MCP 連接器）
├── scripts/                 CI 邊界檢查、自架 runner 設定、MCP 小工具
├── tests/e2e/               Playwright E2E
├── ops/                     由工作流程讀取的觸發檔（dev-logs、onboard-dev、probe 等）
├── shared/                  共用工具
├── docs/                    設計與稽核文件
└── .github/workflows/       CI／部署與 admin-*、ops-*、op-* 維運工作流程
```

進入點：伺服器 `skills/ai-talent/server/index.ts`，tRPC 組裝點 `server/routers/index.ts`，前端 `client/src/main.tsx`。完整分層與規則見 [ARCHITECTURE.md](skills/ai-talent/ARCHITECTURE.md)。

## 本地開發

需求：Node.js 22+、可連線的 MySQL 8（schema 預設 `mos_db`）、至少一組可用的文字 LLM 金鑰。

在 `skills/ai-talent/.env` 建立設定，不要提交真實 secret：

```dotenv
NODE_ENV=development
PORT=3101
JWT_SECRET=<至少 32 字元的隨機字串>

LOCAL_DB_HOST=localhost
LOCAL_DB_USER=<使用者>
LOCAL_DB_PASSWORD=<密碼>
LOCAL_DB_NAME=mos_db

ANTHROPIC_API_KEY=<金鑰>
APP_URL=http://localhost:5173
```

可用的環境變數以 `skills/ai-talent/server/platform/core/env.ts` 為準。

```bash
cd skills/ai-talent && npm install
cd client && npm install
```

```bash
# 終端機 1：後端 http://localhost:3101
cd skills/ai-talent && npm run dev
```

```bash
# 終端機 2：前端 http://localhost:5173，Vite 會代理 API
cd skills/ai-talent/client && npm run dev
```

## 驗證

CI（`ci.yml` 對 main，`deploy-dev.yml` 對 dev）在部署前都跑下面五項，提交前請在本地跑同一組。client 的型別檢查必須在 client 目錄執行，根目錄的 tsc 不會檢查前端。

```bash
cd skills/ai-talent && npm run typecheck
cd skills/ai-talent/client && npx tsc --noEmit
./scripts/check-client-server-boundary.sh
node scripts/check-layer-boundaries.mjs
cd skills/ai-talent && npm test
```

- client 不得 value-import server，只允許 `import type`。
- 層間依賴是一條線性順序：platform < strategy < content < performance，每層只能引用順序在它之前的層（規則與例外處理見 [ARCHITECTURE.md](skills/ai-talent/ARCHITECTURE.md)）。
- 分支名只能是 `dev`、`release/*`、`hotfix/*`。
- 推到 main 由 ci.yml 通過後部署；推到 dev 由 `deploy-dev.yml` 部署。

## 延伸文件

- [程式碼架構](skills/ai-talent/ARCHITECTURE.md)
- [Token 與點數計費](docs/TOKEN-BILLING.md)
- [測試指南](TESTING.md)
- [貢獻指南](CONTRIBUTING.md)
- [維護指南](MAINTENANCE.md)
