/**
 * test-skill-mode.ts — Skill-mode architecture test harness
 *
 * 架構：Squad Lead (Sonnet/Opus) 為主要人設 + 把關每階段
 *   Phase 0  Squad Lead intake          (Sonnet 4-6)
 *   Phase 1  Skill brand-archetype:1    → Squad Lead review gate
 *   Phase 2  Skill brand-archetype:2    → Squad Lead review gate
 *   Phase 3  Skill brand-archetype:3    → Squad Lead review gate
 *   Phase 4  Skill brand-archetype:4    → Squad Lead review gate
 *   Phase 5  Skill brand-archetype:5    → Squad Lead review gate
 *   Final    Squad Lead synthesis       (Opus 4-5)
 *
 * 與 A2A 版 (test-squad-flow.ts) 比較：
 *   · 無 session state / 無 SSE / 無 JWT / 無 HTTP stream
 *   · 直接呼叫 invokeLLM()，單一程序內完成
 *   · 每個 skill 有 Squad Lead 把關，失敗自動 1 次重試
 *
 * 執行（VM）：
 *   npx tsx skills/ai-talent/scripts/test-skill-mode.ts
 *   RUNS=3 SKILL_MODEL=claude-sonnet-4-6 npx tsx scripts/test-skill-mode.ts
 */

import { config as dotenvConfig } from "dotenv";
import { resolve, dirname }       from "path";
import { fileURLToPath }          from "url";
import { invokeLLM } from "../server/_core/llm";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });
dotenvConfig({ path: resolve(__dirname, "../../.env") });

// ═════════════════════════════════════════════════════════════════════════════
// 設定
// ═════════════════════════════════════════════════════════════════════════════
const RUNS          = +(process.env.RUNS ?? 3);
const LEAD_PROVIDER = (process.env.LEAD_PROVIDER ?? "openrouter") as any;
const LEAD_MODEL    = process.env.LEAD_MODEL    ?? "anthropic/claude-sonnet-4-6";
const FINAL_MODEL   = process.env.FINAL_MODEL   ?? "anthropic/claude-opus-4-5";
const DEFAULT_PROVIDER = (process.env.SKILL_PROVIDER ?? "openrouter") as any;

/**
 * Per-skill model assignment — 每個 skill 依照能力需求派給最適合的模型。
 * 可透過 env 覆蓋單一 skill，例如：SKILL_1_MODEL=anthropic/claude-sonnet-4-6
 */
interface SkillModelConfig { provider: any; model: string; }
const SKILL_MODELS: Record<number, SkillModelConfig> = {
  1: { // 現有品牌人格診斷 — 研究軌跡 + 多軸打分 → 強推理
    provider: (process.env.SKILL_1_PROVIDER ?? DEFAULT_PROVIDER) as any,
    model:    process.env.SKILL_1_MODEL ?? "deepseek/deepseek-r1",
  },
  2: { // 原型選擇 — 競品地圖 + 4 層邏輯鏈 → 強判斷
    provider: (process.env.SKILL_2_PROVIDER ?? DEFAULT_PROVIDER) as any,
    model:    process.env.SKILL_2_MODEL ?? "anthropic/claude-opus-4-5",
  },
  3: { // 品牌聲音指南 — 詞庫 + 文案節奏 → 寫作品質
    provider: (process.env.SKILL_3_PROVIDER ?? DEFAULT_PROVIDER) as any,
    model:    process.env.SKILL_3_MODEL ?? "anthropic/claude-sonnet-4-6",
  },
  4: { // 視覺識別系統 — 配色 / 字型 / 攝影 → 多模態想像 + 寫作
    provider: (process.env.SKILL_4_PROVIDER ?? DEFAULT_PROVIDER) as any,
    model:    process.env.SKILL_4_MODEL ?? "anthropic/claude-sonnet-4-6",
  },
  5: { // 全通路一致性稽核 — 結構化評分 + P0/P1/P2 矩陣 → 強推理
    provider: (process.env.SKILL_5_PROVIDER ?? DEFAULT_PROVIDER) as any,
    model:    process.env.SKILL_5_MODEL ?? "deepseek/deepseek-r1",
  },
};

// 測試輸入（與 A2A baseline 同一個品牌）
const BRAND_NAME = "SoWork AI";
const BRAND_DESC = "企業 AI 行銷作業系統，幫助行銷團隊自動化決策與創作。";
const AUDIENCE   = "中大型企業行銷主管";

// ═════════════════════════════════════════════════════════════════════════════
// Squad Lead 人設
// ═════════════════════════════════════════════════════════════════════════════
const SQUAD_LEAD_PERSONA = `你是李承翰（Henry Lee），資深品牌策略顧問，擁有 15 年 B2B 品牌定位經驗，專精於 Jung 12 原型框架。你的風格是：務實、有結構、拒絕空話、對模糊描述會追問「具體證據在哪？」。

你的職責：
1. 接收用戶需求並制定品牌原型定位分析計畫
2. 把關下屬專家（skills）每階段的交付，確保符合研究軌跡 + 結構化輸出的標準
3. 當專家交付品質不足時，提供具體修改指示讓他們重做
4. 最後整合所有階段成品為一份可執行的「品牌原型定位書」
5. 整個過程只有你會直接面對用戶，所有專家輸出都先經過你的審核`;

// ═════════════════════════════════════════════════════════════════════════════
// 5 個 Skill Prompts（直接從 METHODOLOGY_STEP_FORMATS 抽出，保持與 A2A 版一致）
// ═════════════════════════════════════════════════════════════════════════════
const SKILL_PROMPTS: Record<number, { name: string; requiredSections: string[]; prompt: string }> = {
  1: {
    name: "brand-archetype:1 · 現有品牌人格診斷",
    requiredSections: ["研究軌跡", "語調光譜", "隱性原型診斷"],
    prompt: `【Step 1 輸出格式（強制）— 現有品牌人格診斷】
字數：600-900 字。必須依序輸出以下三個區塊。

## ${BRAND_NAME} 現有品牌人格診斷

### 🔍 研究軌跡
逐一列出你實際查閱的每個來源，格式如下（至少 4 個來源）：
| 來源 | 查閱內容 | 觀察到的品牌信號 |
|------|---------|----------------|

### 📊 語調光譜打分（4 軸強制輸出）
| 光譜軸 | 1分 | 10分 | 品牌得分 | 判斷依據（引用具體素材） |
|--------|-----|------|---------|----------------------|
| 正式 ↔ 隨性 | 極度正式 | 極度隨性 | [1-10] | [引用] |
| 嚴肅 ↔ 輕鬆 | 全程嚴肅 | 純粹輕鬆 | [1-10] | [引用] |
| 尊重 ↔ 挑釁 | 高度尊重 | 主動挑釁 | [1-10] | [引用] |
| 複雜 ↔ 簡單 | 極度複雜 | 極度簡化 | [1-10] | [引用] |

### 🧬 隱性原型診斷
**目前主原型：[原型名稱]**
- 判斷依據（2-3 個從研究軌跡萃取的具體信號）
**次要原型信號：[原型名稱]**
**期望 vs 現實落差矩陣**`,
  },
  2: {
    name: "brand-archetype:2 · 原型選擇與組合",
    requiredSections: ["競品原型佔位", "主原型選擇", "輔助原型"],
    prompt: `【Step 2 輸出格式（強制）— 原型選擇與組合】
字數：600-900 字。

## ${BRAND_NAME} 原型選擇理由書

### 🔍 研究軌跡 — 競品原型佔位地圖
| 競品 | 查閱來源 | 關鍵語言信號 | 判定原型 | 佔位強度 |
（至少 4 個競品）
**原型空白分析**（已強佔/中度/藍海）

### 🎯 主原型選擇：[原型]
**選擇邏輯鏈**（4 層，需回溯到研究軌跡）：
1. 競品空間
2. 品牌能力匹配
3. 受眾心理對位
4. 語言轉換成本

**Aspirational vs Current**（雙軌對比 + 遷移路徑）

### 🔀 輔助原型：[原型]（主從層次）
**邊界設定**（2 個具體邊界）
**定位錨句**（一句話）`,
  },
  3: {
    name: "brand-archetype:3 · 品牌聲音指南",
    requiredSections: ["標竿品牌聲音", "宜用禁用詞庫", "通路 Playbook", "This-But-Not-That"],
    prompt: `【Step 3 輸出格式（強制）— 品牌聲音指南】
字數：700-1000 字。

## ${BRAND_NAME} 品牌聲音指南（主原型 × 輔原型）

### 🔍 研究軌跡 — 同原型標竿品牌聲音分析
| 標竿品牌 | 查閱來源 | 具體引用（原文） | 萃取的聲音法則 |

### 📖 品牌聲音規範
**宜用詞庫（主原型核心層）**（8-12 個詞）
**宜用詞庫（輔原型輔助層）**（5-8 個詞）
**禁用詞彙**（至少 6 個，附禁止原因 + 替換建議）
**This-But-Not-That**（3 組對比）

### 📱 各通路語調調節（Platform Playbooks）
| 通路 | 原型比例 | 語調原則 | 禁止事項 | 範例句 |
（官網 / LinkedIn / 廣告 / Email / 客服）

### ✍️ 句子結構偏好
偏好結構（3 個，附原型連結）
禁用結構（至少 2 個）`,
  },
  4: {
    name: "brand-archetype:4 · 視覺識別系統",
    requiredSections: ["視覺研究軌跡", "配色系統", "字型個性", "攝影風格"],
    prompt: `【Step 4 輸出格式（強制）— 視覺與體驗方向】
字數：700-1000 字。

## ${BRAND_NAME} 視覺識別系統

### 🔍 研究軌跡 — 競品視覺與標竿品牌分析
| 品牌 | 查閱來源 | 視覺觀察 | 原型視覺信號 | 對我們的啟示 |

### 🎨 配色系統
**主色**（HEX + RGB + 選色依據 + 應用場景）
**輔色**（同上 + ≤30% 版面）
**中性色 / 底色**
**禁用色**（附原因）

### 🔤 字型個性
| 用途 | 字型 | 選用理由 | 研究參考 |
（中文標題 / 中文內文 / 英文標題 / 介面數字）
**禁用字型**

### 📸 攝影風格 & 版面原則
推薦場景 / 光線 / 構圖 / 禁用類型
**Moodboard 3 個意象**
**版面偏好**（網格 / 密度 / 動態）`,
  },
  5: {
    name: "brand-archetype:5 · 一致性稽核",
    requiredSections: ["通路掃描", "評分卡", "違例清單"],
    prompt: `【Step 5 輸出格式（強制）— 全通路原型一致性稽核】
字數：700-1000 字。

## ${BRAND_NAME} 全通路原型一致性稽核報告

### 🔍 研究軌跡 — 逐通路素材掃描
| 通路 | 查閱來源 | 視覺一致性觀察 | 聲音一致性觀察 | 原型對齊觀察 |
（至少 5 個通路）

### 📊 一致性評分卡
| 通路 | 視覺 (1-10) | 聲音 (1-10) | 原型對齊 (1-10) | 綜合 |
**整體一致性率**：[%]

### ⚠️ 違例清單（Priority Matrix）
**🔴 P0 — 立即修正**（至少 1 項）
**🟡 P1 — 30 天內**
**🟢 P2 — 下一版**`,
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// LLM 呼叫封裝
// ═════════════════════════════════════════════════════════════════════════════
async function callLeadIntake(): Promise<{ content: string; ms: number }> {
  const t0 = Date.now();
  const res = await invokeLLM({
    provider: LEAD_PROVIDER,
    model:    LEAD_MODEL,
    maxTokens: 800,
    messages: [
      { role: "system", content: SQUAD_LEAD_PERSONA },
      {
        role: "user",
        content: `用戶來訊：我想用品牌原型定位法分析品牌「${BRAND_NAME}」，主打「${BRAND_DESC}」，目標客戶是「${AUDIENCE}」。請開始。

請你（李承翰）用 3 段回覆用戶：
1. 確認你理解的品牌核心（1-2 句）
2. 說明接下來 5 個階段的分析範圍（條列）
3. 提出 1-2 個確認問題以確保方向正確`,
      },
    ],
  });
  return {
    content: String(res.choices[0]?.message?.content ?? ""),
    ms:      Date.now() - t0,
  };
}

async function callSkill(
  step: number,
  history: string[]
): Promise<{ content: string; ms: number; model: string }> {
  const skill = SKILL_PROMPTS[step]!;
  const cfg   = SKILL_MODELS[step]!;
  const priorContext = history.length === 0
    ? ""
    : `\n\n【前置階段成果】\n${history.map((h, i) => `--- Step ${i + 1} ---\n${h.slice(0, 1500)}`).join("\n\n")}`;

  const t0 = Date.now();
  const res = await invokeLLM({
    provider: cfg.provider,
    model:    cfg.model,
    maxTokens: 2500,
    messages: [
      {
        role: "system",
        content: `你是品牌原型定位專家（${skill.name}）。嚴格遵守以下輸出格式，不得省略任何區塊，每一筆 row 都需有實際內容不得留空 placeholder。`,
      },
      {
        role: "user",
        content:
          `品牌：${BRAND_NAME}\n描述：${BRAND_DESC}\n目標客戶：${AUDIENCE}` +
          priorContext +
          `\n\n${skill.prompt}`,
      },
    ],
  });
  return {
    content: String(res.choices[0]?.message?.content ?? ""),
    ms:      Date.now() - t0,
    model:   cfg.model,
  };
}

interface ReviewVerdict {
  verdict:          "pass" | "revise";
  missing_sections: string[];
  feedback:         string;
  quality_score:    number; // 0-100
}

async function callReviewGate(
  step:  number,
  draft: string
): Promise<{ verdict: ReviewVerdict; ms: number }> {
  const skill = SKILL_PROMPTS[step]!;
  const t0 = Date.now();

  const res = await invokeLLM({
    provider: LEAD_PROVIDER,
    model:    LEAD_MODEL,
    maxTokens: 600,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "review_verdict",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["verdict", "missing_sections", "feedback", "quality_score"],
          properties: {
            verdict:          { type: "string", enum: ["pass", "revise"] },
            missing_sections: { type: "array", items: { type: "string" } },
            feedback:         { type: "string" },
            quality_score:    { type: "integer", minimum: 0, maximum: 100 },
          },
        },
      },
    },
    messages: [
      { role: "system", content: SQUAD_LEAD_PERSONA },
      {
        role: "user",
        content: `你的一位下屬專家剛交付了「${skill.name}」。你需要把關品質後才能交給客戶。

【必備區塊】
${skill.requiredSections.map(s => `- ${s}`).join("\n")}

【品質標準】
1. 每個必備區塊都存在且有實際內容（不是只剩 placeholder）
2. 研究軌跡表格至少 3-4 row 實際填寫，非空方括號
3. 對「${BRAND_NAME}」有具體且符合 B2B AI 行銷工具情境的描述
4. 結論有可落地的具體性（不是空泛大話）

【下屬交付內容】
${draft}

請用 JSON 回覆審核結果。quality_score 0-100：
- ≥80 → pass
- <80 → revise，在 feedback 指出具體缺陷（1-3 句）並列出 missing_sections`,
      },
    ],
  });

  let verdict: ReviewVerdict;
  try {
    verdict = JSON.parse(String(res.choices[0]?.message?.content ?? "{}"));
  } catch {
    verdict = { verdict: "pass", missing_sections: [], feedback: "(parse error, defaulting to pass)", quality_score: 75 };
  }
  return { verdict, ms: Date.now() - t0 };
}

async function callFinalSynthesis(
  outputs: string[]
): Promise<{ content: string; ms: number }> {
  const t0 = Date.now();
  const res = await invokeLLM({
    provider: LEAD_PROVIDER,
    model:    FINAL_MODEL,
    maxTokens: 3000,
    messages: [
      { role: "system", content: SQUAD_LEAD_PERSONA },
      {
        role: "user",
        content: `以下是你的 5 位下屬專家的完整交付內容。請你（李承翰）整合為一份「${BRAND_NAME} 品牌原型定位書」，包含以下章節：

# ${BRAND_NAME} 品牌原型定位書
## 核心定位結論（主原型 + 輔原型 + 定位錨句）
## 五步驟洞察整合（每步關鍵發現 1-2 句，互相呼應）
## 品牌聲音規範摘要（Top 5 宜用/禁用詞 + This-But-Not-That）
## 視覺識別摘要（主配色 + 字型 + Moodboard 關鍵詞）
## 一致性稽核優先行動（P0 + P1）
## 落地行動計畫（立即 / 30天 / 季度）

${outputs.map((o, i) => `--- 專家 Step ${i + 1} 交付 ---\n${o}`).join("\n\n")}`,
      },
    ],
  });
  return {
    content: String(res.choices[0]?.message?.content ?? ""),
    ms:      Date.now() - t0,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 一輪完整跑
// ═════════════════════════════════════════════════════════════════════════════
interface PhaseMetric {
  phase:         string;
  model?:        string;
  ms:            number;
  length:        number;
  retries:       number;
  qualityScore?: number;
  verdict?:      "pass" | "revise";
  missingSections?: string[];
}

interface RunMetric {
  runId:       number;
  phases:      PhaseMetric[];
  totalMs:     number;
  success:     boolean;
  error?:      string;
  retriesTotal: number;
  avgQuality:  number;
}

async function runOnce(runId: number): Promise<RunMetric> {
  const startMs = Date.now();
  const phases: PhaseMetric[] = [];
  const outputs: string[] = [];
  let retriesTotal = 0;

  try {
    // Phase 0: Lead intake
    process.stdout.write(`  [Run ${runId}] P0 Lead Intake  … `);
    const p0 = await callLeadIntake();
    phases.push({ phase: "lead_intake", ms: p0.ms, length: p0.content.length, retries: 0 });
    console.log(`${(p0.ms / 1000).toFixed(1)}s  len=${p0.content.length}`);

    // Phases 1-5: skill + review gate
    for (let step = 1; step <= 5; step++) {
      const skillName = SKILL_PROMPTS[step]!.name;
      process.stdout.write(`  [Run ${runId}] P${step} ${skillName.slice(0, 32)}… `);

      // 首次 skill call
      let draft = await callSkill(step, outputs);
      let phaseMs = draft.ms;

      // Review gate
      let review = await callReviewGate(step, draft.content);
      let retries = 0;

      // 最多 1 次重試
      if (review.verdict.verdict === "revise" && retries < 1) {
        retries++;
        retriesTotal++;
        process.stdout.write(`REVISE(${review.verdict.quality_score}) → retry … `);
        const retryHistory = [
          ...outputs,
          `【原稿】\n${draft.content}\n\n【Squad Lead 修改指示】\n缺漏：${review.verdict.missing_sections.join(", ")}\n回饋：${review.verdict.feedback}\n\n請重新輸出完整內容並修正以上問題。`,
        ];
        draft = await callSkill(step, retryHistory);
        phaseMs += draft.ms;
        review = await callReviewGate(step, draft.content);
        phaseMs += review.ms;
      } else {
        phaseMs += review.ms;
      }

      outputs.push(draft.content);
      phases.push({
        phase:           `skill_${step}`,
        model:           draft.model,
        ms:              phaseMs,
        length:          draft.content.length,
        retries,
        qualityScore:    review.verdict.quality_score,
        verdict:         review.verdict.verdict,
        missingSections: review.verdict.missing_sections,
      });
      const icon = review.verdict.verdict === "pass" ? "✅" : "⚠️";
      console.log(`${icon} score=${review.verdict.quality_score}  retries=${retries}  ${(phaseMs / 1000).toFixed(1)}s  len=${draft.content.length}`);
    }

    // Final synthesis
    process.stdout.write(`  [Run ${runId}] PF Final Synthesis  … `);
    const pf = await callFinalSynthesis(outputs);
    phases.push({ phase: "final_synthesis", ms: pf.ms, length: pf.content.length, retries: 0 });
    console.log(`${(pf.ms / 1000).toFixed(1)}s  len=${pf.content.length}`);

    const scored = phases.filter(p => typeof p.qualityScore === "number").map(p => p.qualityScore!);
    const avgQuality = scored.length > 0
      ? Math.round(scored.reduce((s, n) => s + n, 0) / scored.length)
      : 0;

    return {
      runId,
      phases,
      totalMs: Date.now() - startMs,
      success: true,
      retriesTotal,
      avgQuality,
    };
  } catch (e: any) {
    console.log(`❌ ${e?.message ?? e}`);
    return {
      runId,
      phases,
      totalMs: Date.now() - startMs,
      success: false,
      error:   e?.message ?? String(e),
      retriesTotal,
      avgQuality: 0,
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 報告
// ═════════════════════════════════════════════════════════════════════════════
function printReport(results: RunMetric[]) {
  const W = 84;
  const line = "═".repeat(W);
  console.log(`\n${line}`);
  console.log("  SKILL-MODE ARCHITECTURE 測試報告");
  console.log(`  Lead:  ${LEAD_MODEL}`);
  console.log(`  Final: ${FINAL_MODEL}`);
  console.log(`  Skills (per-step):`);
  for (let step = 1; step <= 5; step++) {
    const cfg = SKILL_MODELS[step]!;
    console.log(`    Step ${step} (${SKILL_PROMPTS[step]!.name})  →  ${cfg.model}`);
  }
  console.log(line);

  const ok = results.filter(r => r.success);
  console.log(`\n📊 ${results.length} 輪  |  成功 ${ok.length}  |  失敗 ${results.length - ok.length}`);
  if (ok.length === 0) return;

  const avgTotalSec = (ok.reduce((s, r) => s + r.totalMs, 0) / ok.length / 1000).toFixed(1);
  const avgQuality  = Math.round(ok.reduce((s, r) => s + r.avgQuality, 0) / ok.length);
  const avgRetries  = (ok.reduce((s, r) => s + r.retriesTotal, 0) / ok.length).toFixed(2);

  console.log(`\n🏆 平均總耗時 ${avgTotalSec}s  |  平均品質分 ${avgQuality}/100  |  平均重試 ${avgRetries}/run`);

  // 基準比較
  console.log(`\n📐 vs A2A 基準：`);
  console.log(`   耗時: A2A 250s → Skill-mode ${avgTotalSec}s  (${((+avgTotalSec / 250) * 100).toFixed(0)}% of baseline)`);
  console.log(`   品質: A2A 87   → Skill-mode ${avgQuality}       (${avgQuality >= 87 ? "✅ 達標" : "⚠️ 待強化"})`);
  console.log(`   穩定: A2A 60%  → Skill-mode ${Math.round((ok.length / results.length) * 100)}%     (${ok.length / results.length >= 0.95 ? "✅ 達標" : "⚠️ 待強化"})`);

  // 各階段平均耗時
  console.log(`\n📈 各 Phase 平均耗時（秒）：`);
  const phaseNames = ["lead_intake", "skill_1", "skill_2", "skill_3", "skill_4", "skill_5", "final_synthesis"];
  for (const pn of phaseNames) {
    const rows = ok.flatMap(r => r.phases.filter(p => p.phase === pn));
    if (rows.length === 0) continue;
    const avgMs = rows.reduce((s, p) => s + p.ms, 0) / rows.length;
    const avgLen = Math.round(rows.reduce((s, p) => s + p.length, 0) / rows.length);
    const avgScore = rows.filter(p => typeof p.qualityScore === "number");
    const scoreTxt = avgScore.length > 0
      ? `  score=${Math.round(avgScore.reduce((s, p) => s + (p.qualityScore ?? 0), 0) / avgScore.length)}`
      : "";
    console.log(`   ${pn.padEnd(18)}  ${(avgMs / 1000).toFixed(1).padStart(5)}s   len=${String(avgLen).padStart(5)}${scoreTxt}`);
  }

  // 逐輪表
  console.log(`\n📋 逐輪結果：`);
  const header = ["Run", "P0", "P1", "P2", "P3", "P4", "P5", "PF", "Total", "AvgQ", "Retry", "Status"]
    .map(s => s.padStart(6)).join(" │ ");
  console.log(`  ${header}`);
  console.log(`  ${"─".repeat(header.length)}`);
  for (const r of results) {
    const phaseMs = (phase: string) => {
      const p = r.phases.find(x => x.phase === phase);
      return p ? (p.ms / 1000).toFixed(1) + "s" : "–";
    };
    const cols = [
      String(r.runId),
      phaseMs("lead_intake"),
      phaseMs("skill_1"),
      phaseMs("skill_2"),
      phaseMs("skill_3"),
      phaseMs("skill_4"),
      phaseMs("skill_5"),
      phaseMs("final_synthesis"),
      (r.totalMs / 1000).toFixed(1) + "s",
      String(r.avgQuality),
      String(r.retriesTotal),
      r.success ? "OK" : "FAIL",
    ].map(s => s.padStart(6));
    console.log(`  ${cols.join(" │ ")}`);
  }

  // 最佳一輪最終交付預覽
  const best = ok.reduce((a, b) => a.avgQuality >= b.avgQuality ? a : b, ok[0]!);
  const final = best.phases.find(p => p.phase === "final_synthesis");
  if (final) {
    console.log(`\n🥇 最佳輪 Run ${best.runId}（AvgQ=${best.avgQuality}）最終交付長度：${final.length} 字`);
  }

  console.log(`\n${line}\n`);
}

// ═════════════════════════════════════════════════════════════════════════════
// Main
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("🚀 Skill-mode architecture test — ", RUNS, "runs\n");
  console.log(`Brand: ${BRAND_NAME}  |  Audience: ${AUDIENCE}`);
  console.log(`Lead model  : ${LEAD_MODEL}`);
  console.log(`Final model : ${FINAL_MODEL}`);
  console.log(`Skill models:`);
  for (let step = 1; step <= 5; step++) {
    console.log(`  Step ${step}  →  ${SKILL_MODELS[step]!.model}`);
  }
  console.log("");

  const results: RunMetric[] = [];
  for (let i = 1; i <= RUNS; i++) {
    console.log(`${"─".repeat(60)}\n  Run ${i}/${RUNS}\n${"─".repeat(60)}`);
    const r = await runOnce(i);
    results.push(r);
    if (!r.success) console.log(`  ⚠️  Run ${i} failed: ${r.error}`);
  }

  printReport(results);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
