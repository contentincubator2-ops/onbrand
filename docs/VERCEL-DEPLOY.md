# Vercel Deployment Guide

> 參考：[vercel.com/docs/deployments](https://vercel.com/docs/deployments) ·
> [vercel.com/docs/functions](https://vercel.com/docs/functions)

This doc explains how the Marketing-OS codebase is configured to deploy on Vercel,
what works out-of-the-box, and what must run on separate infrastructure.

---

## 1. Project layout on Vercel

The actual application lives in `skills/ai-talent/`, not repo root. When creating
the Vercel project:

- **Root Directory** (Project Settings → General): `skills/ai-talent`
- **Framework Preset**: Other (我們用自訂 `vercel.json`)
- **Node.js Version**: 22.x
- **Build & Dev Settings**: leave blank — `vercel.json` controls them

Files added for Vercel (all inside `skills/ai-talent/`):

```
skills/ai-talent/
├── vercel.json                        # Build + functions + rewrites + cron
├── api/
│   ├── index.ts                       # Catch-all Express handler (function)
│   └── cron/
│       └── flush-billing-queue.ts     # Replaces setInterval billing flush
├── .vercelignore                      # Keep bundle small
└── server/
    └── index.ts                       # Gated: app.listen + workers only when !VERCEL
```

---

## 2. How requests flow

```
Browser ──────► Vercel Edge Network
                     │
                     ├── /assets/*, /index.html, favicon ──► Static CDN
                     │                                        (from public/)
                     │
                     ├── /trpc/*, /api/*, /slack/*, /health ─► api/index.ts
                     │                                          (Express function)
                     │
                     └── everything else (SPA routes) ───────► /index.html
                                                                (CDN + SPA router)
```

The Vite client builds to `skills/ai-talent/public/` (unchanged from current
setup). Vercel serves this directory as static assets by default; the Express
app never handles static file requests in production on Vercel.

`vercel.json` rewrites route four prefixes to the single catch-all function:

| Source | Destination |
|---|---|
| `/trpc/:path*` | `/api/index` |
| `/api/:path*` | `/api/index` |
| `/slack/:path*` | `/api/index` |
| `/health` | `/api/index` |

Express keeps seeing the original URL via `req.url`, so route dispatch works
unchanged.

---

## 3. Function configuration

```json
{
  "functions": {
    "api/index.ts": {
      "runtime": "nodejs22.x",
      "maxDuration": 300,
      "memory": 1024
    }
  }
}
```

- **maxDuration 300s**: default ceiling on all plans under Fluid Compute (up
  to 800s on Pro/Enterprise). Most tRPC calls finish in <10s; raise to 800 if
  long LLM streams time out.
- **memory 1024 MB**: bump to 3008 if you hit OOM in LLM streaming.
- **nodejs22.x**: matches the current CI (`node-version: '22'`).
- **Runtime**: we deliberately stay on the Node.js runtime (not Edge) because
  the app needs `mysql2`, `ioredis`, `bcryptjs`, `pdfkit`, `helmet`, etc. —
  none of which work on V8 Isolates.

### Fluid Compute

Fluid Compute is on by default for all plans and gives us:
- 使用 `waitUntil` / `after()` 做 post-response 背景工作（analytics、log flushing）
- 同一實例處理多併發，冷啟動成本攤提
- CPU-active pricing（idle await 只收 memory 費率）

No code change needed — it's automatic. Just keep handlers async and return
responses early when possible.

---

## 4. Environment variables

Copy every key from `.env.example` into Vercel's Project Settings → Environment
Variables. Required for function to boot:

| Key | Purpose |
|---|---|
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Primary MySQL (Azure) |
| `SOWORK_DB_HOST` (+ user/pass) | Secondary read-only DB |
| `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, ... | LLM providers |
| `AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_API_KEY` | RAG |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` | Slack integration |
| `JWT_SECRET` (≥32 chars) | Auth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth |
| `RESEND_API_KEY` | Transactional email |
| `CRON_SECRET` | Verify Vercel Cron invocations |
| `CORS_ORIGIN` | Comma-separated allow-list for browser origins |
| `APP_URL` | Set to your Vercel production URL |

`TRUST_PROXY=1` and `NODE_ENV=production` are set in `vercel.json`.

`BILLING_FALLBACK_LOG` should stay **unset** on Vercel — the file system is
read-only except `/tmp`, and `/tmp` doesn't survive across invocations. The
billing module's in-memory queue + cron flush is the correct pattern here.

Local development still uses `skills/ai-talent/.env`. After creating the
Vercel project, run:

```bash
vercel link
vercel env pull .env.local
```

---

## 5. Deploy commands

### Preview deploy from local
```bash
cd skills/ai-talent
vercel
```

### Production deploy
```bash
cd skills/ai-talent
vercel --prod
```

### CI (prebuilt) — see `.github/workflows/vercel-deploy.yml`
```bash
vercel pull --yes --environment=production --token=$VERCEL_TOKEN
vercel build --prod --token=$VERCEL_TOKEN
vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
```

Required GitHub secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
(last two from `skills/ai-talent/.vercel/project.json` after `vercel link`).

### Rollback
```bash
vercel rollback                 # to previous prod deploy
vercel rollback <deployment-url> # to specific deploy
```

### Promote
```bash
vercel promote <preview-url>    # same artifact, no rebuild
```

---

## 6. 已知限制（必讀）

Vercel 的 serverless 模型跟目前 VM + PM2 架構有幾個硬性差異。以下元件**不能**
直接跑在 Vercel Function 裡，需要另外處理：

### 6.1 BullMQ queue workers（最大阻擋點）

`server/queue/orchestratorWorker.ts` 與 `squadLeaderWorker.ts` 會監聽 Redis
queue 長駐執行任務 —— serverless function 啟動即死，撐不到下一個 job。

**處理方案（擇一）：**

| 方案 | 做法 | 適合情境 |
|---|---|---|
| A. 保留 VM 跑 worker | 現有 Azure VM 只留 `pm2 start squadLeaderWorker`，UI/API 搬 Vercel | 最快、改動最少 |
| B. Railway/Fly/GCE 小 worker | 起一個 $5/mo 的 always-on 容器專跑 worker | 想完全棄 VM |
| C. 改用 QStash / Inngest / Trigger.dev | 訊息觸發 → Vercel Function 執行一個 job → return | 想 100% serverless |
| D. Vercel Workflow DevKit | 用 `@vercel/workflow` 改寫 A2A pipeline（durable steps） | 長任務 & retry 語意 |

**目前 `vercel.json` 預設方案 A**：UI 與 API 上 Vercel，worker 繼續跑在 VM。
只要 worker 跟 Vercel function 連同一個 Redis + MySQL 就能運作。

### 6.2 setInterval / 背景 timer

`server/index.ts` 原本有兩個背景工作：

- ✅ **已遷移**：billing retry flush → `api/cron/flush-billing-queue.ts`（每 5 分鐘）
- ⚠️ **待處理**：`backfillMissionResources()` — 啟動時一次性 backfill，改成
  獨立 script（`tsx scripts/backfill-mission-resources.ts`）或另一條 cron。

### 6.3 WebSocket (`ws` package)

Vercel Functions 不支援 persistent WebSocket。如果 `a2aStreamRoute` / mission
chat 有用到 ws，需改成：
- SSE（Server-Sent Events，Vercel 原生支援 streaming）
- Ably / Pusher / Vercel Realtime 等第三方
- 或保留在 VM 層

### 6.4 檔案系統寫入

- `storage/boardroom-exports/*.pdf` 匯出 → 需改成 Vercel Blob 或 S3
- `BILLING_FALLBACK_LOG=/var/log/...` → 留空，用記憶體 queue + cron
- 任何 `fs.writeFile` 到非 `/tmp` 的路徑都會 500

### 6.5 啟動時 DB migration

`runStartupMigrations()` 現在只會在非 Vercel 環境跑（因為整段被 `!IS_VERCEL`
包住）。Production migration 應該改成：
- 手動：`pnpm db:migrate` 從本機或 CI 打 Azure MySQL
- 自動：在 GitHub Actions deploy job 跑完 `vercel deploy` 之後執行

---

## 7. 為何選 Function 而不是完整 Edge 或重寫 Next.js？

| 選項 | 工作量 | Cold start | 相容性 | 結論 |
|---|---|---|---|---|
| **單一 catch-all Function**（目前） | 低 — 一個 wrapper + gate 幾行 | 中（Node.js cold ~1-2s） | 100%（整個 Express 原封不動） | ✅ 採用 |
| Edge Function | 高 — 得換 DB driver、移除 bcryptjs/helmet/pdfkit | 低（<100ms） | 差 | ❌ |
| 拆成多個 function（每個 router 一支） | 很高 — 路由、context、trpc 要重組 | 低（小 bundle） | 中 | 先不做 |
| 改寫成 Next.js App Router | 極高 | 低 | 中 | 視未來需求 |

採用 catch-all 最大的代價是冷啟動時 bundle 大（整個 Express 依賴都要載入）。
如果發現延遲不可接受，下一步是**拆成多個 function**：`api/trpc/[...trpc].ts`、
`api/auth/[...path].ts`、`api/slack/[...path].ts` 等各自獨立。

---

## 8. Checklist（第一次部署）

- [ ] 在 Vercel 建 project，Root Directory 設 `skills/ai-talent`
- [ ] 把 `.env.example` 每一個 key 在 Vercel dashboard 設好
- [ ] 特別確認 `JWT_SECRET` ≥ 32 字元，`CRON_SECRET` 隨機產生
- [ ] 設好 `CORS_ORIGIN` = `https://<your-vercel-domain>`
- [ ] `vercel link` 取得 `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`
- [ ] 把三個 secret 加到 GitHub repo secrets（若要用 Actions 自動部署）
- [ ] 決定 worker 架構（§6.1 方案 A-D）
- [ ] 第一次 `vercel --prod` 後驗證 `/health` 回 200
- [ ] 檢查 Runtime Logs（Deployments → Functions tab）看有沒有 import error
- [ ] 跑一次手動 `pnpm db:migrate`（§6.5）
- [ ] 確認 VM 的 worker 還有跑（`pm2 list`）— 否則 A2A pipeline 不會動
