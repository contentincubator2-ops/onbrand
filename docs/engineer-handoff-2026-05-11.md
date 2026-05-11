# Drop · 秒稿 — Engineer Handoff

**狀態：** Pre-launch beta，核心功能已穩定（產文 / 圖 / 影片 / FB 發布 / 帳號 / 試用 / 成就），等明天串金流即可開始收費。

**最後更新：** 2026-05-11
**最後 commit：** `f29d06e` — feat(scope): product / event narrows entire system

---

## 1. 產品定位

**Drop Pro** — AI 驅動的行銷內容生成 + 多平台企劃工具，TWD 990/月。

| 路線 | 功能 |
|---|---|
| /30s, /60s, /99s | 單篇任務（FB/IG/YT/TT/LI/Email/PR/Brand/Research，共 90+ 任務） |
| /theater | 7 天跨平台內容企劃台 |
| /run/:outputId | 結果 mockup 預覽 + 編輯 / 重生 / 改圖 / 改影片 / 發布 |
| /brands, /brands/edit | 品牌管理 + 編輯 |
| /achievements | 18 個成就 / 7 天試用引導 |
| /pricing, /settings/account | 訂閱 / 帳號 |

---

## 2. Tech Stack

### Frontend
- **React 18** + **TypeScript** + **Vite 5**
- **TailwindCSS** + **HeroUI** + **lucide-react** + **FontAwesome**
- **tRPC v11** client + **react-query** for data fetching
- **React Router v6**

### Backend
- **Node 22** + **TypeScript** (tsx runtime, no compile step)
- **Express 4** + **tRPC v11** server
- **Drizzle ORM** + **mysql2/promise** (raw pool for hot paths)
- **MySQL 8** (utf8mb4_unicode_ci)
- **JWT** (jose) for sessions, **bcryptjs** for passwords

### Infra
- **Azure VM** (Ubuntu) at `${secrets.VM_HOST}` — user `azureus`
- **PM2** process manager
- **Nginx** reverse proxy, port 3101 → 443
- **CloudFlare** DNS for `drop.sowork.ai`
- **GitHub Actions** for CI/CD

### External APIs
| Provider | Key in env | Used for |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` (+ 2 backups) | All LLM calls (`claude-haiku-4-5-20251001`) |
| OpenAI | `OPENAI_API_KEY` | Image gen (`gpt-image-1`) |
| PiAPI | `PIAPI_KEY` | Image gen (flux-schnell) + Video gen (kling-v2-master) |
| Resend | `RESEND_API_KEY` | Transactional email |
| Pipedream | `PIPEDREAM_FB_PUBLISH_WEBHOOK` | FB 直接發布 OAuth |
| Azure Foundry | `AZURE_FOUNDRY_API_KEY` | Backup LLM |

⚠ **Disabled keys** (in `.env` but `multiModelRouter` marks unavailable):
- `QWEN_API_KEY` — 401 invalid
- `ZHIPU_API_KEY` — not verified
- `HAILUO_API_KEY` — 2049 invalid (PiAPI Kling replaced)

---

## 3. GitHub Repo

**URL:** `https://github.com/contentincubator2-ops/Marketing-OS`
**Branch:** `main` (only branch used)
**Folder:** `skills/ai-talent/` (the actual product lives here; rest is dormant legacy)

### Folder Structure (skills/ai-talent/)
```
client/src/
  v2/
    app/          — App shell + routing (AppV2.tsx + ShellLayout)
    pages/        — All page components
      legal/      — ToS / Privacy / Refund
    components/   — Shared UI (PlatformMockup, TrialCountdownBar...)
    config/       — theaterCast, plans display refs
  lib/            — trpc client, helpers
  pages/auth/     — Login / Register / ForgotPassword (legacy v1 path, still used)

server/
  index.ts        — Express entry, port 3101
  _core/          — Business logic (brandContext, plans, achievements, quickTask*)
  routers/        — tRPC routers (one file per domain)
  auth/           — authRouter.ts + usersDb + emailService
  video/          — generateVideoAsync pipeline
  localDb.ts      — mysql2 pool (raw queries)
  db.ts           — Drizzle init

drizzle/
  schema.ts       — Drizzle schema (some tables raw SQL, see migrate.ts)

scripts/
  migrate.ts      — Idempotent schema migration (ALTER + CREATE IF NOT EXISTS)
  test-orchestra-all.ts — End-to-end task verification script

.github/workflows/
  admin-force-deploy.yml  — Main deploy (rsync source → VM + build + pm2 restart)
  admin-run-migration.yml — Run scripts/migrate.ts on prod
  admin-hard-restart-pm2.yml — pm2 delete + resurrect (clears module cache)
  admin-verify-all-frontend-buttons.yml — HTTP simulate every backend endpoint
  admin-test-orchestra-pilot.yml — Pilot test 1 task per channel
  (many other admin-* scripts for various debug / config tasks)

docs/
  audit-2026-05-10.md     — Full audit (95/95 tasks pass, 18/18 buttons)
  sowork-ai-landing-block.html  — Drop-in HTML for www.sowork.ai
  engineer-handoff-2026-05-11.md  — this file
```

### Branch Strategy
- **main only** — push directly. No PR workflow yet.
- Every commit message includes Co-Authored-By Claude footer (skip if you prefer).
- Convention: `<type>(<scope>): <subject>` — e.g. `feat(brands)`, `fix(orchestra)`.

---

## 4. VM Infrastructure

### Access
- **Host:** `${secrets.VM_HOST}` (Azure VM, see GitHub secrets `VM_HOST` / `VM_USER` / `VM_SSH_PRIVATE_KEY`)
- **User:** `azureus`
- **Key auth only** — no password

```bash
ssh azureus@<VM_HOST>
```

### Paths
```
/opt/marketing-os/app/
  ├── skills/ai-talent/           # Source code (rsync'd from GH on deploy)
  │   ├── .env                    # Production env (managed manually on VM)
  │   ├── client/                 # Frontend source
  │   ├── client/dist/            # ⚠ NOT used; vite outDir = ../public
  │   ├── public/                 # Vite build output, served by Express
  │   ├── public.bak/             # Last successful build backup
  │   ├── server/                 # Backend source (tsx runtime)
  │   ├── scripts/migrate.ts      # Run via `npx tsx scripts/migrate.ts`
  │   └── node_modules/           # npm install --no-audit --no-fund
  └── ...                         # Legacy folders (dormant)
```

### PM2 Processes
| name | port | purpose |
|---|---|---|
| `marketing-os` | 3101 | Main Drop server (Express + tRPC + static `public/`) |
| `ai-marketer` | — | Legacy worker (dormant, ignore) |
| `ai-proxy` | — | Legacy proxy (dormant, ignore) |
| `roster` | — | Legacy worker (dormant, ignore) |

⚠ **PM2 gotcha:** `pm2 restart` does NOT clear Node module cache. To force reload of new code after deploy, use:
```bash
pm2 delete marketing-os && pm2 resurrect
# OR the admin-hard-restart-pm2.yml workflow
```

This is why some deploys looked like they didn't work — see `audit-2026-05-10.md` §6 for full history.

### Nginx
- Listens 80 / 443 (Let's Encrypt cert, auto-renew)
- Proxies all `/` to `localhost:3101`
- Upstream timeout: **150s** (bumped from 60s; needed because video gen status calls + slow LLM responses)
- Cloudflare in front; check both nginx and CF when debugging 502

### MySQL
- **DB:** `mos_db`
- **User:** `mos_user`
- **Password:** in `.env` as `DB_PASSWORD` (also `MYSQL_PWD` for CLI on VM)
- **localhost only** (no remote MySQL access)
- Schema: see `drizzle/schema.ts` + raw `CREATE TABLE` in `scripts/migrate.ts`

### Important env vars (`.env` on VM)
```
# Auth
JWT_SECRET=<64-char base64>
APP_URL=https://drop.sowork.ai
REQUIRE_EMAIL_VERIFICATION=0     # auto-activate users on register

# DB
DB_HOST=localhost
DB_USER=mos_user
DB_PASSWORD=mos_secure_2026
DB_NAME=mos_db

# LLM
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_API_KEY_BACKUP_1=...
ANTHROPIC_API_KEY_BACKUP_2=...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
OPENAI_API_KEY=sk-...
PIAPI_KEY=...
AZURE_FOUNDRY_API_KEY=...
AZURE_FOUNDRY_PROJECT_ENDPOINT=...

# Email + Publish
RESEND_API_KEY=re_...
EMAIL_FROM=onboarding@resend.dev    # TODO: switch to noreply@sowork.ai once DNS verified
PIPEDREAM_FB_PUBLISH_WEBHOOK=https://eoe4c67tsvzzley.m.pipedream.net
PIPEDREAM_WEBHOOK_SECRET=<random>
DEFAULT_FB_PAGE_ID=<CJ's FB page>   # TODO: not yet set
```

---

## 5. Deployment Workflow

### Standard deploy (after pushing to main)
```bash
gh workflow run admin-force-deploy.yml
# Wait ~1 min, watch:
gh run watch $(gh run list --workflow=admin-force-deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

What it does:
1. Checkout latest `main` on GitHub runner
2. **rsync** source to VM `/opt/marketing-os/app/skills/ai-talent/` (excluding `node_modules`, `public`, `.env`)
3. SSH to VM, cd into source
4. Backup current `public/` to `public.bak/`
5. `cd client && npm install --no-audit --no-fund --silent`
6. `npm run build` (tsc + vite; vite outputs to `../public/`)
7. `pm2 restart marketing-os --update-env`

⚠ **If a deploy "succeeds" but new code doesn't take effect**, the issue is PM2 module cache. Run `admin-hard-restart-pm2.yml` after.

### DB schema changes
```bash
# 1. Edit scripts/migrate.ts to add idempotent ALTER / CREATE IF NOT EXISTS
# 2. Push to main
# 3. Run migration on prod:
gh workflow run admin-run-migration.yml
```

### Verify a deploy
```bash
gh workflow run admin-verify-all-frontend-buttons.yml
# Tests every tRPC endpoint via HTTP simulate using CJ's session cookie.
# Output: 18 endpoints × OK / FAIL.
```

---

## 6. Current State Summary

### ✅ Working end-to-end

| Feature | Status | Notes |
|---|---|---|
| Auth (register / login / forgot-pwd) | ✓ | Auto-login after register (no email verification wall) |
| 30s tier (90+ tasks across 9 channels) | ✓ 95/95 pilot pass | LLM_BUDGET=20s, HARD_BUDGET=50s; anthropic primary |
| 60s tier | ✓ verified end-to-end | budget 60s LLM × 5 variants + QA |
| 99s tier (22 tasks) | ✓ 22/22 pilot pass | hard cap 110s |
| Theater (7-day campaign planner) | ✓ working | day-grid layout, B&W Notion style |
| Image gen | ✓ working | OpenAI gpt-image-1 returns b64 → wrapped as data URL |
| Video gen | ✓ working | PiAPI Kling v2-master, ~6.5 min per 30s clip, graceful degrade if no Creatomate |
| FB publish | ✓ wired | Pipedream webhook, awaits `DEFAULT_FB_PAGE_ID` env to fully activate |
| Brand management (/brands list + edit) | ✓ shipped | new manager dashboard with stats per brand |
| Achievement system (18 + rewards) | ✓ shipped | 6 routes + finale, evaluator hooked into recordTaskRun |
| Pricing / ToS / Privacy / Refund pages | ✓ shipped | public, accessible without login |
| Trial countdown bar | ✓ shipped | shows days left + achievement progress + 升級 CTA |
| Account settings | ✓ shipped | change pwd, list invoices, data export, account delete |
| Product / Event scope narrows LLM | ✓ shipped (L1 + L2 today) | selecting product/event auto-injects positioning into prompts |
| Global brand switch | ✓ fixed | Theater + Projects react to top-bar brand change |

### ⏳ Pending (next work)

| Priority | Item | Effort | Blocker |
|---|---|---|---|
| **P0** | **金流串接 (綠界 ECPay)** | 1-2 days | CJ has MerchantID + HashKey + HashIV; need to wire `/api/ecpay/redirect` + webhook |
| **P0** | **電子發票串接** | 0.5 day | Built into 綠界 dashboard config; auto-fires on successful payment |
| **P0** | **DEFAULT_FB_PAGE_ID env** | 5 min | CJ provides page ID, run `admin-set-pipedream-env.yml` |
| **P0** | **DNS verify sowork.ai for email** | 1 day (DNS prop) | CJ verifies in Resend dashboard, switch `EMAIL_FROM` env |
| **P1** | **Stripe alternative** for international users | 1 day | If targeting non-TW market |
| **P1** | **L3 — per-product / per-event positioning editor pages** | 1-2 days | Right now products / events have `positioning` JSON in DB but no UI to edit it |
| **P1** | **Achievement: route reward grant UI feedback** | 0.5 day | Backend grants work, frontend toast works, but route-completion modal could be more celebratory |
| **P1** | **Sentry replacement** for production error tracking | 0.5 day | Current `error_log` table is server-only; need a Sentry SDK or similar |
| **P2** | **API key rotation** for committed-then-rotated keys | 0.5 day | See `audit-2026-05-10.md` for which keys are confirmed rotated |
| **P2** | **PR-30 task systemPrompt tuning** | 0.5 day | PR / 新聞稿 tasks occasionally hit timeout (1/3 variants fail under load) |
| **P2** | **Squad auto-run scope param** | 0.5 day | `runSquadAuto` doesn't yet pass productId/eventId |
| **P2** | **Theater generateCell scope-aware prompts** | 0.5 day | Currently scope event only auto-adds to importantDates; deeper integration needs prompt edits |
| **P3** | **Mobile responsive audit** | 1-2 days | App works on mobile but no tablet/phone-specific layouts |
| **P3** | **i18n** (English UI) | 2-3 days | All Chinese strings hardcoded; export to dictionary |

---

## 7. Key Architecture Decisions (Read Before Changing)

### Why mostly raw `mysql2/promise` instead of Drizzle?

`db.execute(sql\`...\`)` returns inconsistent row shape across Drizzle versions (sometimes `[rows, fields]`, sometimes just `rows`, sometimes weird wrappers). After getById silently returning `null` for hours, all hot-path queries migrated to `localPool.execute()` directly. See `server/_core/recordTaskRun.ts` and `server/routers/outputRouter.ts` for pattern.

### Why metadata-based scope tracking instead of new columns?

Missions can have many outputs, each potentially with different scope (rerun in a different context). Storing scope in `mission_outputs.metadata` JSON avoids both:
1. Column proliferation (missions don't need productId/eventId)
2. Update cascade issues
Frontend reads latest output's metadata.scope via SQL window function.

### Why fire-and-forget achievement evaluator?

If evaluator throws or hangs, we don't want to break recordTaskRun. Achievements update next time client polls (90s interval). Trade-off: brief lag (max 90s) between unlocking + toast. Acceptable.

### Why graceful-degrade video pipeline?

ElevenLabs + Creatomate keys not provisioned; if missing, ships first Kling clip as final video instead of failing. User still gets value; we lose multi-scene + voiceover but the demo works.

### Why hard-restart pm2 instead of `pm2 restart`?

`pm2 restart` keeps the Node module cache. New `.ts` files on disk get loaded by tsx, but already-cached imports stay. Hard-restart (`pm2 delete + resurrect`) clears cache. Every deploy that changes server-side code should be followed by hard-restart in case the change touched module-cached files.

### Why we still have `marketing-os.sowork.ai` references in DB / code?

Phase 2 rename. Some legacy references remain in:
- nginx config (both domains route to same backend)
- Old workflow YAMLs that reference old hostname
- Database column names (e.g. `marketing-os` literal strings in some migration scripts)

These are harmless. Don't refactor unless you have a specific reason.

---

## 8. Verification & Testing

### Smoke test pipeline (after any deploy)
```bash
# 1. Force deploy
gh workflow run admin-force-deploy.yml

# 2. Hard-restart pm2 (clears module cache)
gh workflow run admin-hard-restart-pm2.yml

# 3. Verify every endpoint via HTTP simulate
gh workflow run admin-verify-all-frontend-buttons.yml

# 4. (If touched LLM logic) Run task pilot
gh workflow run admin-test-orchestra-pilot.yml -f mode=pilot
```

### Manual smoke checklist
1. Register new account → should auto-login (no email wall)
2. Build a brand → /brands manager shows it with 0 counts
3. Run a 30s FB task → navigates to /run/<id>, shows FB feed mockup
4. Click 🖼 改圖 → image gen produces real image
5. Click 🎬 改影片 → spawn job, wait 5-7 min, video plays inline
6. Click 直接發 FB → with DEFAULT_FB_PAGE_ID env set, post appears on FB
7. Top bar brand selector → all pages react (Theater, Projects, /30s)
8. /achievements page → can see locked/unlocked + rewards

---

## 9. Credentials You'll Need (Request from CJ)

| Item | Required for |
|---|---|
| GitHub repo access | All dev work |
| GitHub Actions secrets visibility | Debug deploy workflows |
| VM SSH key | Direct VM access (rarely needed) |
| Resend account | Email DNS verification + template editing |
| 綠界 ECPay merchant credentials | Payment integration |
| Pipedream account | FB publish webhook + token management |
| CloudFlare DNS | Domain config |
| Azure portal | VM scaling, monitoring |

---

## 10. First Week Suggested Order

1. **Day 1** — Read this doc, clone repo, get `npm run dev` working locally with a `.env` copy. Run frontend against prod backend (or set up local MySQL).
2. **Day 2** — Read `docs/audit-2026-05-10.md` for full system history + known issues.
3. **Day 3** — Implement 綠界 payment (P0). See pricing config in `server/_core/plans.ts` and billing router stubs in `server/routers/billingRouter.ts` (`manualSubscribe` is the test endpoint to replace).
4. **Day 4** — Wire 電子發票 (auto-fires from 綠界 dashboard; mostly config) + DEFAULT_FB_PAGE_ID.
5. **Day 5** — Smoke test entire purchase flow with own credit card.

---

## 11. Active Subagent Conventions (if continuing AI-assisted dev)

Most prior commits include footer like:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

This is informational only — drop it if you prefer cleaner history.

Memory file at `~/.claude/projects/.../MEMORY.md` (user's local machine) records design conventions: B&W Notion aesthetic, drop.sowork.ai domain, squad design methodology, etc. Not in repo.

---

## 12. Contact

- **Product owner:** CJ (SoWork founder) — `contentincubator2@gmail.com`
- **Support email:** `drop@sowork.ai` (forwards to CJ for now)
- **Parent company:** 摘星社群行銷顧問股份有限公司

---

## Appendix A — Common Debug Recipes

### "白屏 / HTML returned instead of JSON"
Usually nginx 502 from upstream timeout. Check:
1. `pm2 status` — is `marketing-os` online?
2. `pm2 logs marketing-os --lines 100` — any uncaught errors?
3. Network tab — is request taking >150s (nginx timeout)?
4. trpc client at `client/src/lib/trpc.ts` should catch HTML responses and toast — make sure toast dedup is working.

### "Mockup shows generic:feed instead of FB"
`output.getById` is returning `null` for mission.taskId. Check:
1. DB query: `SELECT metadata FROM mission_outputs WHERE id=<id>` — does `$.taskId` exist?
2. If yes, server-side parsing bug (we fixed this once via SQL JSON_UNQUOTE; don't regress).

### "Task fails with caption 兩次嘗試都失敗"
1. Check `multiModelRouter.ts` availability — likely an LLM provider returned malformed response.
2. Check `quickTaskOrchestra.ts` LLM_BUDGET_MS (currently 20s) — bump if a specific task category times out.

### "Video job stuck at 15%"
The `generateScene` step is calling PiAPI Kling. Check:
1. PIAPI_KEY env is set + valid
2. PiAPI dashboard for stuck jobs
3. Kling pro tier takes 90-180s per 5s clip; for a 30s video that's ~10 min. Patience.

### "I can't find where X is configured"
Likely in `server/_core/`. Conventions:
- `plans.ts` — pricing + quotas
- `achievements.ts` + `achievementRewards.ts` — gamification
- `brandContext.ts` — LLM prompt prefix builder
- `multiModelRouter.ts` — LLM provider selection
- `quickTaskOrchestra.ts` — main task runner
- `quickTask<Channel>.ts` — per-channel task catalogs (FB, IG, YT, ...)

---

**EOF** — Good luck. Codebase is opinionated but well-commented; almost every weird-looking decision has a `2026-05-XX (CJ: ...)` comment explaining why.
