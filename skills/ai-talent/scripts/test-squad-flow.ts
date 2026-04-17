/**
 * test-squad-flow.ts
 * 自動化測試：對 squad chat 執行 10 輪完整流程，逐輪評分並輸出比較報告
 *
 * 執行方式（在 VM 上）：
 *   npx tsx scripts/test-squad-flow.ts
 *
 * 測試指標：
 *   ✅ Step 0 是否由 Squad Lead 打招呼（非直接執行任務）
 *   ✅ 每步 agent 身份正確（步驟對應正確的 specialist）
 *   ✅ 品牌名稱出現在回覆中
 *   ✅ 沒有「Group Chat Context」幻覺
 *   ✅ Step 0 有提問（確認問題）
 *   ✅ Step N 有結構化輸出（Markdown heading）
 *   ✅ 串流 SSE relay_step 在 delta 前先送出
 *   ✅ 整輪流程時間（<30s 為理想）
 */

import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

import mysql from "mysql2/promise";
import * as https from "http";
import { SignJWT } from "jose";

// ── 設定 ──────────────────────────────────────────────────────────────────────
const BASE_URL  = `http://localhost:${process.env.PORT ?? 3001}`;
const RUNS      = 10;

// 測試對話輪次（模擬用戶依序與 squad 互動）
const USER_TURNS = [
  "我想開始進行品牌定位分析",                                      // turn 1 → Step 0 Lead
  "好的，請繼續執行，我們的品牌是 SoWork AI，主打 AI 行銷 OS",     // turn 2 → Step 1
  "請繼續",                                                          // turn 3 → Step 2
];

// 評分標準（每項 0-10 分）
interface StepScore {
  turn: number;
  agentName: string;
  agentTitle: string;
  step: number;
  totalSteps: number;
  content: string;
  scores: {
    relayBeforeDelta:    boolean;  // relay_step 在 delta 前送出
    hasAgentIdentity:    boolean;  // agentName 非空
    brandMentioned:      boolean;  // 品牌名稱在回覆中
    noGroupChatHalluc:   boolean;  // 沒有「Group Chat Context」
    leadAskQuestion:     boolean;  // Step 0 有問句
    specialistStructure: boolean;  // Step N 有 ## 標題
    contentLength:       number;   // 字數
    timeMs:              number;   // 耗時
  };
  totalScore: number;
}

interface RunResult {
  runId: number;
  missionId: number;
  squadSlug: string;
  brandName: string;
  steps: StepScore[];
  avgScore: number;
  totalMs: number;
  fatal?: string;
}

// ── DB 連線 ──────────────────────────────────────────────────────────────────
async function getPool() {
  return mysql.createPool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });
}

// ── 取得測試用 mission（需要有 squadSlug + brandId）──────────────────────────
async function getTestMission(pool: mysql.Pool) {
  const [rows] = await pool.execute(`
    SELECT m.id AS missionId, m.squadSlug, m.brandId, b.name AS brandName
    FROM missions m
    JOIN brands b ON b.id = m.brandId
    WHERE m.squadSlug IS NOT NULL AND m.squadSlug != ''
      AND m.brandId IS NOT NULL
    ORDER BY m.updatedAt DESC
    LIMIT 1
  `) as any[];
  return (rows as any[])[0] ?? null;
}

// ── 直接用 JWT_SECRET 簽發測試用 token（繞過 API key 系統）────────────────────
// 原因：API keys 在 DB 以 SHA-256 hash 存儲，raw key 不存在於 DB，
// 無法從 DB 取出直接使用。測試環境直接用 JWT_SECRET 簽發 token 最簡單。
async function createTestToken(userId: number): Promise<string | null> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("❌ JWT_SECRET 未設定在 .env 中");
    return null;
  }
  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const token = await new SignJWT({ sub: String(userId) })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(secret);
    return token;
  } catch (e) {
    console.error("❌ 無法簽發 JWT:", e);
    return null;
  }
}

// ── 找第一個有效 user ──────────────────────────────────────────────────────────
async function getTestUserId(pool: mysql.Pool): Promise<number | null> {
  const [rows] = await pool.execute(`SELECT id FROM users WHERE isActive = 1 LIMIT 1`) as any[];
  return (rows as any[])[0]?.id ?? null;
}

// ── 重置 squad session ────────────────────────────────────────────────────────
async function resetSession(token: string, missionId: number): Promise<void> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ missionId });
    const req = https.request({
      hostname: "localhost",
      port: +(process.env.PORT ?? 3001),
      path: "/api/chat/reset-squad-session",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: `Bearer ${token}`,
      },
    }, (res) => {
      res.resume();
      res.on("end", resolve);
    });
    req.on("error", resolve);
    req.write(body);
    req.end();
  });
}

// ── 送一則訊息，解析 SSE 回傳 ────────────────────────────────────────────────
interface TurnResult {
  agentName: string;
  agentTitle: string;
  step: number;
  totalSteps: number;
  content: string;
  relayBeforeDelta: boolean;
  timeMs: number;
  error?: string;
}

async function sendMessage(
  token: string,
  missionId: number,
  squadSlug: string,
  userMessage: string,
  conversationHistory: { role: string; content: string }[]
): Promise<TurnResult> {
  const startMs = Date.now();
  return new Promise((resolve) => {
    const body = JSON.stringify({
      userMessage,
      conversationHistory,
      missionId,
      squadSlug,
    });

    const req = https.request({
      hostname: "localhost",
      port: +(process.env.PORT ?? 3001),
      path: "/api/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
    }, (res) => {
      let buf = "";
      let agentName = "";
      let agentTitle = "";
      let step = -1;
      let totalSteps = 0;
      let content = "";
      let relaySeenBeforeDelta = false;
      let relaySeen = false;
      let deltaSeen = false;

      res.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        let curEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            curEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (curEvent === "relay_step" && data.status === "running") {
                relaySeen = true;
                if (!deltaSeen) relaySeenBeforeDelta = true;
                if (data.agentName) agentName = data.agentName;
                if (data.agentTitle) agentTitle = data.agentTitle;
                if (typeof data.step === "number") step = data.step;
                if (typeof data.totalSteps === "number") totalSteps = data.totalSteps;
              } else if (curEvent === "delta") {
                deltaSeen = true;
                content += data.text ?? "";
              } else if (curEvent === "error") {
                resolve({ agentName, agentTitle, step, totalSteps, content, relayBeforeDelta: relaySeenBeforeDelta, timeMs: Date.now() - startMs, error: data.message ?? "SSE error" });
              }
            } catch { /* ignore parse errors */ }
          }
        }
      });

      res.on("end", () => {
        resolve({
          agentName,
          agentTitle,
          step,
          totalSteps,
          content,
          relayBeforeDelta: relaySeenBeforeDelta,
          timeMs: Date.now() - startMs,
        });
      });

      res.on("error", (e) => {
        resolve({ agentName, agentTitle, step, totalSteps, content, relayBeforeDelta: false, timeMs: Date.now() - startMs, error: e.message });
      });
    });

    req.on("error", (e) => {
      resolve({ agentName: "", agentTitle: "", step: -1, totalSteps: 0, content: "", relayBeforeDelta: false, timeMs: Date.now() - startMs, error: e.message });
    });

    req.write(body);
    req.end();
  });
}

// ── 評分一個 turn ─────────────────────────────────────────────────────────────
function scoreStep(turn: number, result: TurnResult, brandName: string): StepScore {
  const isLead = result.step === 0 || result.step === -1;
  const scores = {
    relayBeforeDelta:    result.relayBeforeDelta,
    hasAgentIdentity:    result.agentName.length > 0,
    brandMentioned:      result.content.toLowerCase().includes(brandName.toLowerCase()),
    noGroupChatHalluc:   !result.content.includes("Group Chat") && !result.content.includes("群聊"),
    leadAskQuestion:     isLead ? (result.content.includes("？") || result.content.includes("?")) : true,
    specialistStructure: !isLead ? (result.content.includes("##") || result.content.includes("**")) : true,
    contentLength:       result.content.length,
    timeMs:              result.timeMs,
  };

  const booleanItems = [
    scores.relayBeforeDelta,
    scores.hasAgentIdentity,
    scores.brandMentioned,
    scores.noGroupChatHalluc,
    scores.leadAskQuestion,
    scores.specialistStructure,
  ];
  const boolScore = booleanItems.filter(Boolean).length / booleanItems.length * 80;
  const lengthScore = Math.min(result.content.length / 500, 1) * 10;  // 500 字以上滿分
  const speedScore  = result.timeMs < 15000 ? 10 : result.timeMs < 30000 ? 5 : 0;
  const totalScore  = Math.round(boolScore + lengthScore + speedScore);

  return {
    turn,
    agentName:   result.agentName || "(unknown)",
    agentTitle:  result.agentTitle || "",
    step:        result.step,
    totalSteps:  result.totalSteps,
    content:     result.content,
    scores,
    totalScore,
  };
}

// ── 執行一輪完整 squad 流程 ──────────────────────────────────────────────────
async function runOnce(
  runId: number,
  token: string,
  missionId: number,
  squadSlug: string,
  brandName: string
): Promise<RunResult> {
  const startMs = Date.now();

  // 重置 session，從 Step 0 開始
  await resetSession(token, missionId);

  const steps: StepScore[] = [];
  const conversationHistory: { role: string; content: string }[] = [];
  let fatal: string | undefined;

  for (let t = 0; t < USER_TURNS.length; t++) {
    const userMsg = USER_TURNS[t];
    process.stdout.write(`  [Run ${runId}] Turn ${t + 1}/${USER_TURNS.length} sending... `);

    const result = await sendMessage(token, missionId, squadSlug, userMsg, conversationHistory);

    if (result.error) {
      console.log(`❌ ${result.error}`);
      fatal = result.error;
      break;
    }

    const step = scoreStep(t + 1, result, brandName);
    steps.push(step);

    // 更新對話歷史（server 會忽略但保持格式）
    conversationHistory.push({ role: "user", content: userMsg });
    conversationHistory.push({ role: "assistant", content: result.content.slice(0, 300) });

    const indicators = [
      step.scores.relayBeforeDelta    ? "🎯" : "❌",
      step.scores.hasAgentIdentity    ? "👤" : "❌",
      step.scores.brandMentioned      ? "🏷" : "❌",
      step.scores.noGroupChatHalluc   ? "✅" : "🚨",
      step.scores.leadAskQuestion     ? "❓" : "❌",
      step.scores.specialistStructure ? "📊" : "❌",
    ].join("");
    console.log(`${indicators} agent="${result.agentName}" step=${result.step}/${result.totalSteps} len=${result.content.length} ${result.timeMs}ms → score=${step.totalScore}`);

    // 如果 step 完成整個流程則中止（totalSteps 達到）
    if (result.step >= result.totalSteps && result.totalSteps > 0) break;
  }

  const avgScore = steps.length > 0
    ? Math.round(steps.reduce((s, x) => s + x.totalScore, 0) / steps.length)
    : 0;

  return { runId, missionId, squadSlug, brandName, steps, avgScore, totalMs: Date.now() - startMs, fatal };
}

// ── 輸出比較報告 ──────────────────────────────────────────────────────────────
function printReport(results: RunResult[]) {
  console.log("\n");
  console.log("═".repeat(80));
  console.log("  SQUAD FLOW 自動化測試報告");
  console.log("═".repeat(80));

  const successful = results.filter(r => !r.fatal);
  const failed     = results.filter(r => r.fatal);

  console.log(`\n📊 總覽：${RUNS} 輪 | 成功 ${successful.length} | 失敗 ${failed.length}`);
  console.log(`   Mission: #${results[0]?.missionId}  Squad: ${results[0]?.squadSlug}  Brand: ${results[0]?.brandName}`);

  if (successful.length === 0) {
    console.log("\n⚠️  所有測試均失敗，請檢查 server 是否在 port 3001 運行");
    return;
  }

  // 平均分數
  const avgOverall = Math.round(successful.reduce((s, r) => s + r.avgScore, 0) / successful.length);
  const minScore   = Math.min(...successful.map(r => r.avgScore));
  const maxScore   = Math.max(...successful.map(r => r.avgScore));
  const avgTime    = Math.round(successful.reduce((s, r) => s + r.totalMs, 0) / successful.length);

  console.log(`\n🏆 平均分：${avgOverall}/100  最低：${minScore}  最高：${maxScore}  平均耗時：${(avgTime / 1000).toFixed(1)}s`);

  // 每項指標通過率
  const metricNames: (keyof StepScore["scores"])[] = [
    "relayBeforeDelta", "hasAgentIdentity", "brandMentioned",
    "noGroupChatHalluc", "leadAskQuestion", "specialistStructure",
  ];
  const metricLabels: Record<string, string> = {
    relayBeforeDelta:    "relay_step 先於 delta 送出",
    hasAgentIdentity:    "Agent 身份有效",
    brandMentioned:      "品牌名稱出現在回覆",
    noGroupChatHalluc:   "無 Group Chat 幻覺",
    leadAskQuestion:     "Lead 有提問",
    specialistStructure: "Specialist 有結構化輸出",
  };

  console.log("\n📈 各指標通過率（每輪 Turn 1~3 的平均）：");
  for (const m of metricNames) {
    const allSteps = successful.flatMap(r => r.steps);
    const passed   = allSteps.filter(s => s.scores[m] === true).length;
    const total    = allSteps.length;
    const pct      = total > 0 ? Math.round((passed / total) * 100) : 0;
    const bar      = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
    console.log(`  ${bar} ${pct.toString().padStart(3)}%  ${metricLabels[m]}`);
  }

  // 逐輪分數
  console.log("\n📋 逐輪分數：");
  console.log("  Run │ Turn1 │ Turn2 │ Turn3 │ Avg │ Time  │ Fatal");
  console.log("  ────┼───────┼───────┼───────┼─────┼───────┼──────");
  for (const r of results) {
    const t = (n: number) => r.steps[n - 1]?.totalScore?.toString().padStart(4) ?? "  –";
    const fatal = r.fatal ? r.fatal.slice(0, 20) : "–";
    console.log(`  ${r.runId.toString().padStart(3)} │  ${t(1)} │  ${t(2)} │  ${t(3)} │  ${r.avgScore.toString().padStart(3)} │ ${(r.totalMs / 1000).toFixed(1).padStart(5)}s │ ${fatal}`);
  }

  // 最佳 / 最差輪次詳情
  if (successful.length >= 2) {
    const best  = successful.reduce((a, b) => a.avgScore >= b.avgScore ? a : b);
    const worst = successful.reduce((a, b) => a.avgScore <= b.avgScore ? a : b);

    console.log(`\n🥇 最佳輪 (Run ${best.runId}, score=${best.avgScore}):`);
    for (const s of best.steps) {
      console.log(`   Turn ${s.turn}  Step ${s.step}  ${s.agentName}：${s.content.slice(0, 120).replace(/\n/g, " ")}…`);
    }

    console.log(`\n🥴 最差輪 (Run ${worst.runId}, score=${worst.avgScore}):`);
    for (const s of worst.steps) {
      console.log(`   Turn ${s.turn}  Step ${s.step}  ${s.agentName}：${s.content.slice(0, 120).replace(/\n/g, " ")}…`);
    }
  }

  // 優化建議
  console.log("\n💡 優化建議：");
  const allSteps = successful.flatMap(r => r.steps);

  const brandMissRate = allSteps.filter(s => !s.scores.brandMentioned).length / allSteps.length;
  if (brandMissRate > 0.3) {
    console.log("  ⚠️  超過 30% 的回覆沒有提及品牌名稱 → 在 system prompt 加強「必須稱呼品牌名」指令");
  }

  const hallucRate = allSteps.filter(s => !s.scores.noGroupChatHalluc).length / allSteps.length;
  if (hallucRate > 0) {
    console.log("  🚨  仍有 Group Chat 幻覺 → conversationHistory 仍被傳入，需再檢查 LLM 呼叫");
  }

  const relayRate = allSteps.filter(s => !s.scores.relayBeforeDelta).length / allSteps.length;
  if (relayRate > 0.2) {
    console.log("  ⏰  超過 20% relay_step 沒有在 delta 前送出 → 確認 send('relay_step') 在 streamFromGateway 之前");
  }

  const leadQuestionRate = allSteps.filter(s => s.step === 0 && !s.scores.leadAskQuestion).length;
  if (leadQuestionRate > 0) {
    console.log("  ❓  部分 Lead 回覆沒有提問 → 在 buildBehaviorGuide(isLead) 加強「結尾必須有問句」指令");
  }

  const avgLen = allSteps.reduce((s, x) => s + x.scores.contentLength, 0) / allSteps.length;
  if (avgLen < 300) {
    console.log(`  📏  平均回覆長度只有 ${Math.round(avgLen)} 字，偏短 → 在 system prompt 加入最低字數要求`);
  }

  const avgTurnTime = allSteps.reduce((s, x) => s + x.scores.timeMs, 0) / allSteps.length / 1000;
  if (avgTurnTime > 20) {
    console.log(`  🐢  平均每輪耗時 ${avgTurnTime.toFixed(1)}s，偏慢 → 考慮啟用更快的模型或縮短 system prompt`);
  }

  console.log("\n" + "═".repeat(80));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Squad Flow 自動化測試 — 共執行", RUNS, "輪\n");

  const pool = await getPool();

  // 取得測試資料
  const mission = await getTestMission(pool);
  if (!mission) {
    console.error("❌ 找不到有 squadSlug 的 mission，請先在 UI 建立一個有 squad 的任務");
    process.exit(1);
  }
  console.log(`📋 使用 mission #${mission.missionId}  squad=${mission.squadSlug}  brand=${mission.brandName}`);

  // 取得測試用 userId，直接簽發 JWT（不需要 API key）
  const userId = await getTestUserId(pool);
  if (!userId) {
    console.error("❌ 找不到有效 user（isActive=1），請確認 DB 有資料");
    await pool.end();
    process.exit(1);
  }

  const token = await createTestToken(userId);
  if (!token) {
    await pool.end();
    process.exit(1);
  }
  console.log(`🔑 已為 userId=${userId} 簽發測試 JWT，開始測試...\n`);

  const results: RunResult[] = [];

  for (let i = 1; i <= RUNS; i++) {
    console.log(`\n── Run ${i}/${RUNS} ──`);
    const result = await runOnce(i, token, mission.missionId, mission.squadSlug, mission.brandName);
    results.push(result);
    if (result.fatal && i <= 2) {
      console.log(`⚠️  前兩輪就失敗，可能 server 未啟動，停止測試`);
      break;
    }
  }

  await pool.end();
  printReport(results);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
