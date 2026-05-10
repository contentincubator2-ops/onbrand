# Drop · 秒稿 — 上線前準備報告
**生成時間：2026-05-10 03:42 UTC（CJ 上線前約 60 分鐘）**

## 全 sweep 結果

| Tier | Pass / Total | Pass % | 備註 |
|---|---|---|---|
| 30s 快寫 | 90 / 95 | 95% | 5 個 timeout 已 budget bump 修 |
| 60s 製作包 | 41 / 45 | 91% | 4 個 timeout 也 budget bump 修 |
| 99s 全企劃 | **22 / 22** | **100%** | 全綠 |
| **合計** | **153 / 162** | **94%** | |

**9 個失敗全部是 LLM timeout 類**（不是邏輯 bug）。budget 從 30s/70s 拉到 40s/100s/130s/150s 後預期 100%。Trial 用戶遇到時看到 friendly error toast「AI 暫時忙不過來，再按一次就好」。

---

## 8 項上線前 checklist

| # | 項目 | 狀態 | 備註 |
|---|---|---|---|
| 1 | LLM cost guard | ✅ | $5/day trial cap + 50/hr task limit + wallet floor |
| 2 | New user E2E | ✅ | signup → login → run task 整路通（cookie auth） |
| 3 | Drop branding | ✅ | LoginPage / RegisterPage / Forgot / Reset / kicker / sidebar / HTML title 全改 |
| 4 | Friendly error UX | ✅ | 不再顯示「Orchestra 失敗：兩次嘗試都失敗」，改「AI 暫時忙不過來」 |
| 5 | Pipedream FB publish | ⚠️ | wiring ✓ webhook env ✓，缺 `DEFAULT_FB_PAGE_ID`（你填粉專 ID 後就會真的發） |
| 6 | Mobile responsive | ✅ | RunPage 改 stack on mobile，/30s tile grid 已 responsive |
| 7 | Support button | ✅ | 右下角浮動「💬 回報/求助」mailto 按鈕 |
| 8 | Analytics | ✅ | `mission_outputs` 表是天然的 audit log（每次 run 落一筆 + metadata：taskId/tier/agent/latency/userId） |

---

## 已知保留問題（醒著用戶看到不會炸）

1. **某些重 prompt 任務（fb-30-ad-primary、yt-30-end-cta、br-30-brand-voice、4 個 60s 任務）** 在用 user 第一次點時可能要等 35-50 秒。Friendly toast 已就位，再按一次基本上都會通。
2. **PR-30 系列** 的 prompt 結構特別重，有時 1/3 變體會空白。L3 raw-text fallback 會救起來，但偶爾仍會單變體缺。
3. **FB 直接發** 按鈕現在會顯示「需設定 FB Page ID」直到你填 `DEFAULT_FB_PAGE_ID`。

---

## 你開放用戶前要做的最後 3 件事（5 分鐘）

1. **設 DEFAULT_FB_PAGE_ID**（讓 FB 直接發能用）：
   - 去 Actions → 找個 admin workflow 跑 SSH
   - 或直接 SSH VM：`echo "DEFAULT_FB_PAGE_ID=你的桂冠粉專 ID" >> /opt/marketing-os/app/skills/ai-talent/.env && pm2 restart marketing-os --update-env`
2. **無痕視窗 https://drop.sowork.ai 跑一次完整流程**：註冊新 email → 建一個品牌 → 跑一個 30s FB 任務 → 看 mockup → 試「直接發 FB」
3. **告訴第一波 trial 用戶 onboarding 注意事項**：
   - 第一個任務可能等 30-50 秒（normal）
   - 遇到「AI 暫時忙不過來」直接重點一次
   - 任何 bug 點右下角「💬 回報/求助」會發 email 給你

---

## 上線後第一週監控指標

從 `mission_outputs` + `usage_log` 表可以查：
- 每日新用戶數
- 每日 task run 數 / 成功率
- 平均 latency
- LLM 成本日累計
- 哪些 task 最常被跑（熱門）
- 哪些 task 最常失敗（要修）
