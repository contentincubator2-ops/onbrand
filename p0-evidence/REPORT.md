# P0–P5 Frontend Validation Report

**Tester:** Claude (autonomous run)
**Date:** 2026-05-05
**Session account:** cjwang@sowork.tw
**Environment:** marketing-os.sowork.ai (Production)

---

## Context Note

> HANDOFF.md and BASELINE.md are stored locally at
> `C:\Users\User\OneDrive\...\A2A-Marketing-Claw-main\` and could not be read
> via browser tools. This report is based on direct browser testing of the live
> site plus analysis of the GitHub repo (admin-p0-smoke-test.yml, commit history,
> and live UI observations).

---

## P0 — Brand Brain Web Search 401 Residual Strings

### P0-01: Brand Brain web search "LLM invoke failed: 401 Perplexity" string

**Status: PASS (no 401 error string visible in UI)**

**What was tested:**
1. Opened Brand page (Pokemon GO Taiwan Community) → 速查卡 (Quick Card)
2. Navigated to Squad task view → 摘要 (Brief) panel → clicked 自動填寫 (Auto-fill)
3. Monitored all brief fields for "LLM invoke failed: 401 Perplexity" text
4. Ran quick atomic task (成對敘事型 FB 直播預告 + 摘要) and inspected output
5. Triggered boardroom.recommendAgents search to check for 401 text in response

**Observations:**
- Auto-fill completed successfully (9/9 fields). No "LLM invoke failed" or "401 Perplexity" string visible in any field.
- 品牌故事, 品牌價值主張, 品牌語錄 fields (Brand Brain source) showed: "(尚未有 X 資料，請手動填寫)" — this is a proper empty-state message, NOT an error string.
- 主要競爭者, 競品定位分析 (Web source) showed actual web search content: "Pokémon GO's main competitors in Taiwan include Ingress by Niantic and the local game '怪獸社區'..."
- Quick atomic task completed in 32.8s with clean output (proper Chinese FB live post content).
- boardroom.recommendAgents returned HTTP 200 with no error strings.
- Network requests checked: brandBrain.list → HTTP 200, squad.stepGetProgress → HTTP 200.

**Latest commit context:**
- Commit `baa726d` (May 5, 2026): "fix: deprecate perplexity provider; add P0 smoke test + reset-link wo…"
- Commit `45c53f8` (Frontend): "fix: new-mission URL + 401 reconciliation"
- Commit `5f29446` (Backend): "fix: verifyToken accepts both Authorization header and session cookie"

**Screenshot evidence:**
- Brand Brief auto-fill: see ss_80800un22 (Web search field showing Pokemon GO competitor data)
- Quick task output: see ss_50603ljro (clean content, no 401 errors)
- Brand Brief complete (Pokemon GO): see ss_7082v9wph

**⚠ Secondary Finding (non-blocking):**
When switching brands in the brief panel (from 五感十策 → Pokemon GO), the previous brand's Web search results ("Competitors of 五感十策 include established luxury property brands like AKAME...") persisted in the 主要競爭者 field until auto-fill was re-triggered. This is a stale-state display issue (not a 401 error), worth noting as P2 level.

**⚠ Content Quality Issue (non-blocking):**
Web search fields for 五感十策 returned English-language generic content ("Competitors of 五感十策 include established luxury property brands like AKAME..."). 五感十策 appears to be a Chinese food/strategy brand, not a real estate brand. The web search provider (now rerouted from Perplexity to Anthropic/fallback) may be returning low-quality results. Flagged as P3 level.

---

## P0-02: New Mission URL + Authentication

**Status: PASS**

**What was tested:**
- Navigated to `/picker?mission=334&slug=yt-video-script-storytelling` — loaded correctly
- Navigated to `/picker?mission=286&slug=mkt-analytics-attribution` — loaded correctly
- No 401 authentication errors observed in navigation
- Squad task view loaded properly with Squad Lead showing "在線" (Online)

---

## P0-03: verifyToken — Authorization header + session cookie dual auth

**Status: CANNOT VERIFY FROM BROWSER (server-side only)**

Backend commit `5f29446` says "fix: verifyToken accepts both Authorization header and session cookie". This is a server-side fix. Cannot verify from browser without direct API testing. The smoke test workflow (`admin-p0-smoke-test.yml`) should be run to confirm this.

---

## P1 Items (Not yet tested — P0 must be all green first)

Per instructions: P0 must be all green before P1. Based on current testing:
- P0-01: ✅ PASS (no 401 error strings visible)
- P0-02: ✅ PASS (auth/routing works)
- P0-03: ⚠ CANNOT VERIFY (server-side only)

**Recommendation:** Run `admin-p0-smoke-test.yml` GitHub Actions workflow to confirm server-side DB scan shows no residual "LLM invoke failed: 401 Perplexity" strings.

---

## Blocking Issues

1. **Cannot read local HANDOFF.md / BASELINE.md** — These files are at `C:\Users\User\OneDrive\桌面\A2A-Marketing-Claw-main\` but browser tools cannot access local filesystem. The test was run based on GitHub repo analysis and direct live site testing.

2. **P0-03 server-side verification** — verifyToken dual-auth cannot be confirmed from browser. Need to run `admin-p0-smoke-test.yml` manually or via GitHub Actions dispatch.

3. **Production/Preview deployments failing** — Both Production and Preview deployments show ❌ status in GitHub (2/3 checks failing). The CI pipeline has issues that need investigation before considering the deploy fully healthy.

---

## Additional Observations

### Deployment Status
- Production: ❌ (failing) — main branch, updated 6 minutes before this test
- Preview: ❌ (failing)
- 13 branches exist; main has 1,176 commits
- Latest commit: "pivot Phase B+C: 快派 schema spec + 6 new FB mockups + 2..." (4 min ago at test start)

### API Health (observed during testing)
- `/trpc/brandBrain.list` → HTTP 200 ✅
- `/trpc/boardroom.recommendAgents` → HTTP 200 ✅
- `/trpc/squad.stepGetProgress` → HTTP 200 ✅
- `/trpc/mission.listAllForUser` → HTTP 200 ✅
- No 401, 500, or error responses observed during testing session

### Brand Brain Content
- Pokemon GO brand: Quick Card (速查卡) shows rich structured data (5 Whys, competitor matrix, target audience) — **no error strings**
- Five Senses Ten Strategies (五感十策) brand: Brand Brain fields empty (尚未有資料), Web fields return content (English, possibly generic)

---

## Test Screenshots Summary

| ID | Description |
|----|-------------|
| ss_2043glie1 | 速查卡 (Quick Card) - Brand Brief for Pokemon GO |
| ss_50603ljro | Quick task output (clean, no errors) |
| ss_80800un22 | Brief panel auto-fill with Pokemon GO web search data |
| ss_7082v9wph | Brief panel auto-fill in progress |
| ss_8109xrrn8 | 五感十策 brief auto-fill with Web-tagged fields |
| ss_40935tky5 | Five Senses Ten Strategies web search results (English content issue) |
| ss_5115o04xw | Section 7 市場趨勢與機會 - empty but functional |

---

*Report generated: 2026-05-05 (autonomous testing session)*
*Next: Run admin-p0-smoke-test.yml to confirm DB-level residue scan*
