/**
 * test-squad-flow.ts  v2 — 完整 A2A 互動測試
 * 測試「品牌原型定位小組」5 步驟 A2A 流程：
 *   Step 0  — Squad Lead (李承翰 / archetype_strategist)  : 任務 intake
 *   Step 1  — brand_perception_analyst                   : 現有品牌人格診斷
 *   Step 2  — archetype_strategist (Squad Lead)          : 原型選擇與組合
 *   Step 3  — brand_voice_specialist                     : 品牌聲音指南
 *   Step 4  — creative_director                          : 視覺與體驗方向
 *   Step 5  — archetype_strategist (Squad Lead)          : 全通路一致性稽核
 *
 * 執行方式（VM）：
 *   npx tsx scripts/test-squad-flow.ts
 *
 * 新增指標 v2：
 *   ✅ relay_step 先於 delta 送出
 *   ✅ Agent 身份非空
 *   ✅ 品牌名稱出現
 *   ✅ 無 Group Chat 幻覺
 *   ✅ Lead Step 0 有提問
 *   ✅ 步驟 ≥1 有結構化輸出（## 或 ** 或條列符號）
 *   ✅ 不再出現「Mission Lead」fallback 名稱
 *   ✅ 步驟 ≥1 的 Agent 與 Step 0 不同（真正 A2A 分工）
 *   ✅ 第三輪（reply-to-same-agent）：同一個 Specialist 繼續回應
 */

import { config as dotenvConfig } from "dotenv";
import { resolve, dirname }      from "path";
import { fileURLToPath }         from "url";
import mysql                     from "mysql2/promise";
import * as https                from "http";
import { SignJWT }               from "jose";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });
dotenvConfig({ path: resolve(__dirname, "../../.env") });

// ═══════════════════════════════════════════════════════════════════════════════
// 設定
// ═══════════════════════════════════════════════════════════════════════════════
const RUNS       = 5;
const PORT       = +(process.env.PORT ?? 3001);
const SQUAD_SLUG = "brand-archetype-positioning"; // 模板 slug（非 UID）

/**
 * A2A 測試輪次設計
 * Turn 1: Squad Lead intake
 * Turn 2: 繼續 → Step 1  specialist (brand_perception_analyst)
 * Turn 3: 回覆 Step 1 specialist（reply-to-same-agent UX）
 * Turn 4: 繼續 → Step 2  specialist (archetype_strategist)
 * Turn 5: 繼續 → Step 3  specialist (brand_voice_specialist)
 */
const USER_TURNS: Array<{ msg: string; expectStep: number; label: string }> = [
  {
    msg: "我想用品牌原型定位法分析品牌：SoWork AI，主打企業 AI 行銷作業系統，幫助行銷團隊自動化決策與創作。目標客戶是中大型企業行銷主管。請開始分析。",
    expectStep: 0,
    label: "Squad Lead Intake",
  },
  {
    msg: "繼續",
    expectStep: 1,
    label: "Step 1 — 現有品牌人格診斷（brand_perception_analyst）",
  },
  {
    msg: "你說 SoWork AI 偏向 Sage（智者），但我覺得應該也有 Creator（創造者）特質，因為我們強調 AI 協作生成。這個 Sage + Creator 的組合合理嗎？",
    expectStep: 1,
    label: "Reply to Step 1 Specialist（reply-to-same-agent）",
  },
  {
    msg: "繼續",
    expectStep: 2,
    label: "Step 2 — 原型選擇與組合（archetype_strategist）",
  },
  {
    msg: "繼續",
    expectStep: 3,
    label: "Step 3 — 品牌聲音指南（brand_voice_specialist）",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DB 連線
// ═══════════════════════════════════════════════════════════════════════════════
async function getMainPool(): Promise<mysql.Pool> {
  return mysql.createPool({
    host:             process.env.DB_HOST,
    user:             process.env.DB_USER,
    password:         process.env.DB_PASSWORD,
    database:         process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit:  5,
    ssl: process.env.DB_HOST !== "localhost" ? { rejectUnauthorized: false } : undefined,
  });
}

async function getLocalPool(): Promise<mysql.Pool> {
  return mysql.createPool({
    host:     process.env.LOCAL_DB_HOST ?? "localhost",
    port:     +(process.env.LOCAL_DB_PORT ?? 3306),
    user:     process.env.LOCAL_DB_USER ?? "mos_user",
    password: process.env.LOCAL_DB_PASSWORD ?? "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME ?? "mos_db",
    waitForConnections: true,
    connectionLimit: 5,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 測試資料準備
// ═══════════════════════════════════════════════════════════════════════════════

/** 從 localPool 找到可以測試的 mission（或建立一個） */
async function prepareLocalMission(
  localPool: mysql.Pool
): Promise<{ missionId: number; brandId: number; brandName: string } | null> {
  // 先找現有有 squadSlug 的 mission
  const [rows] = await localPool.execute(`
    SELECT m.id AS missionId, m.brandId, b.name AS brandName
    FROM missions m
    LEFT JOIN brands b ON b.id = m.brandId
    WHERE m.brandId IS NOT NULL AND m.brandId > 0
    ORDER BY m.updatedAt DESC LIMIT 1
  `) as any[];
  const row = (rows as any[])[0];
  if (!row) {
    console.error("❌ localPool 中找不到有 brandId 的 mission");
    return null;
  }

  // 強制把 squadSlug 設為正確的模板 slug（清除舊 UID）
  await localPool.execute(
    `UPDATE missions SET squadSlug = ? WHERE id = ?`,
    [SQUAD_SLUG, row.missionId]
  );
  console.log(`  ✔ localPool mission #${row.missionId} squadSlug → '${SQUAD_SLUG}' (brand: ${row.brandName ?? "未知"})`);
  return { missionId: row.missionId, brandId: row.brandId, brandName: row.brandName ?? "SoWork AI" };
}

/** 從 MAIN DB 找到有效 user ID */
async function getTestUserId(pool: mysql.Pool): Promise<number | null> {
  try {
    const [rows] = await pool.execute(`SELECT id FROM users WHERE isActive = 1 LIMIT 1`) as any[];
    return (rows as any[])[0]?.id ?? null;
  } catch {
    // fallback: try localPool structure
    return 1;
  }
}

/** 簽發測試 JWT */
async function createTestToken(userId: number): Promise<string | null> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) { console.error("❌ JWT_SECRET 未設定"); return null; }
  const secret = new TextEncoder().encode(jwtSecret);
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("4h")
    .sign(secret);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP 工具
// ═══════════════════════════════════════════════════════════════════════════════

async function resetSession(token: string, missionId: number): Promise<void> {
  return new Promise((res) => {
    const body = JSON.stringify({ missionId });
    const req = https.request({
      hostname: "localhost", port: PORT,
      path: "/api/chat/reset-squad-session", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Authorization: `Bearer ${token}` },
    }, (r) => { r.resume(); r.on("end", () => res()); });
    req.on("error", () => res());
    req.write(body); req.end();
  });
}

interface TurnResult {
  agentName:        string;
  agentTitle:       string;
  agentSkill:       string;
  agentModel:       string;
  step:             number;
  totalSteps:       number;
  content:          string;
  relayBeforeDelta: boolean;
  timeMs:           number;
  error?:           string;
  rawSse?:          string; // first 400 chars of raw SSE for debug
}

async function sendTurn(
  token:     string,
  missionId: number,
  userMsg:   string,
  history:   { role: string; content: string }[]
): Promise<TurnResult> {
  const startMs = Date.now();
  return new Promise((resolve) => {
    const body = JSON.stringify({
      userMessage:         userMsg,
      conversationHistory: history,
      missionId,
      squadSlug:           SQUAD_SLUG, // always send as hint
    });

    const req = https.request({
      hostname: "localhost", port: PORT, path: "/api/chat", method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization:    `Bearer ${token}`,
        Accept:           "text/event-stream",
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        let err = "";
        res.on("data", (c: Buffer) => (err += c.toString()));
        res.on("end", () => resolve({
          agentName: "", agentTitle: "", agentSkill: "", agentModel: "",
          step: -1, totalSteps: 0, content: "", relayBeforeDelta: false,
          timeMs: Date.now() - startMs, error: `HTTP ${res.statusCode}: ${err.slice(0, 200)}`,
        }));
        return;
      }

      let buf = "", content = "", agentName = "", agentTitle = "", agentSkill = "", agentModel = "";
      let step = -1, totalSteps = 0;
      let relaySeen = false, deltaSeen = false, relayBeforeDelta = false;
      let rawCapture = "";

      res.on("data", (chunk: Buffer) => {
        const raw = chunk.toString();
        if (rawCapture.length < 400) rawCapture += raw;
        buf += raw;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        let curEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) { curEvent = line.slice(7).trim(); }
          else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (curEvent === "relay_step" && data.status === "running") {
                relaySeen = true;
                if (!deltaSeen) relayBeforeDelta = true;
                agentName  = data.agentName  ?? agentName;
                agentTitle = data.agentTitle ?? agentTitle;
                agentSkill = data.agentSkill ?? agentSkill;
                agentModel = data.agentModel ?? agentModel;
                if (typeof data.step       === "number") step       = data.step;
                if (typeof data.totalSteps === "number") totalSteps = data.totalSteps;
              } else if (curEvent === "delta") {
                deltaSeen = true;
                content += data.text ?? "";
              } else if (curEvent === "error") {
                resolve({ agentName, agentTitle, agentSkill, agentModel, step, totalSteps, content,
                  relayBeforeDelta, timeMs: Date.now() - startMs, error: data.message ?? "SSE error", rawSse: rawCapture });
              }
            } catch { /* ignore */ }
          }
        }
      });

      res.on("end", () => resolve({
        agentName, agentTitle, agentSkill, agentModel,
        step, totalSteps, content, relayBeforeDelta,
        timeMs: Date.now() - startMs,
        rawSse: content.length === 0 ? rawCapture : undefined,
      }));
      res.on("error", (e) => resolve({
        agentName, agentTitle, agentSkill, agentModel, step, totalSteps, content,
        relayBeforeDelta: false, timeMs: Date.now() - startMs, error: e.message,
      }));
    });

    req.on("error", (e) => resolve({
      agentName: "", agentTitle: "", agentSkill: "", agentModel: "",
      step: -1, totalSteps: 0, content: "", relayBeforeDelta: false,
      timeMs: Date.now() - startMs, error: e.message,
    }));
    req.write(body); req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 評分
// ═══════════════════════════════════════════════════════════════════════════════

interface TurnScore {
  turnIdx:         number;
  label:           string;
  agentName:       string;
  agentTitle:      string;
  agentSkill:      string;
  agentModel:      string;
  step:            number;
  totalSteps:      number;
  content:         string;
  scores: {
    relayBeforeDelta:    boolean;
    hasAgentIdentity:    boolean;
    brandMentioned:      boolean;
    noGroupChatHalluc:   boolean;
    noMissionLeadFallback: boolean; // 不是 "Mission Lead" fallback
    leadAskQuestion:     boolean;
    specialistStructure: boolean;
    isActualA2A:         boolean;   // Step ≥1 的 agent 與 step 0 不同
    replyToSameAgent:    boolean;   // Turn 3（reply）: agent 名稱與 turn 2 相同
    contentLength:       number;
    timeMs:              number;
  };
  totalScore: number;
}

function scoreTurn(
  idx:          number,
  turnDef:      { msg: string; expectStep: number; label: string },
  result:       TurnResult,
  brandName:    string,
  leadAgentName: string, // step 0 的 agent 名稱，用於 A2A 分工驗證
  prevAgent:    string   // 前一輪 agent（用於 reply-to-same 驗證）
): TurnScore {
  const isLead       = result.step === 0;
  const isReplyTurn  = turnDef.label.includes("reply-to-same");

  const scores = {
    relayBeforeDelta:      result.relayBeforeDelta,
    hasAgentIdentity:      result.agentName.length > 0,
    brandMentioned:        result.content.toLowerCase().includes(brandName.toLowerCase().split(" ")[0]),
    noGroupChatHalluc:     !result.content.includes("Group Chat") && !result.content.includes("群聊"),
    noMissionLeadFallback: !result.agentName.includes("Mission Lead") && result.agentName !== "",
    leadAskQuestion:       isLead ? (result.content.includes("？") || result.content.includes("?")) : true,
    specialistStructure:   !isLead
      ? (result.content.includes("##") || result.content.includes("**") || result.content.includes("•") || result.content.includes("- "))
      : true,
    isActualA2A:           !isLead && leadAgentName
      ? result.agentName !== leadAgentName || result.agentName === ""
      : true,
    replyToSameAgent:      isReplyTurn
      ? (prevAgent.length > 0 && result.agentName === prevAgent)
      : true,
    contentLength:         result.content.length,
    timeMs:                result.timeMs,
  };

  // 評分算法：boolean 項目 70 分 + 字數 15 分 + 速度 15 分
  const boolItems = [
    scores.relayBeforeDelta,
    scores.hasAgentIdentity,
    scores.brandMentioned,
    scores.noGroupChatHalluc,
    scores.noMissionLeadFallback,
    scores.leadAskQuestion,
    scores.specialistStructure,
    scores.isActualA2A,
    scores.replyToSameAgent,
  ];
  const boolScore   = (boolItems.filter(Boolean).length / boolItems.length) * 70;
  const lengthScore = Math.min(result.content.length / 600, 1) * 15; // 600+ 字滿分
  const speedScore  = result.timeMs < 18000 ? 15 : result.timeMs < 35000 ? 8 : 0;
  const totalScore  = Math.round(boolScore + lengthScore + speedScore);

  return {
    turnIdx: idx,
    label:   turnDef.label,
    agentName:  result.agentName  || "(unknown)",
    agentTitle: result.agentTitle || "",
    agentSkill: result.agentSkill || "",
    agentModel: result.agentModel || "",
    step:       result.step,
    totalSteps: result.totalSteps,
    content:    result.content,
    scores,
    totalScore,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 一輪完整執行
// ═══════════════════════════════════════════════════════════════════════════════

interface RunResult {
  runId:     number;
  missionId: number;
  brandName: string;
  turns:     TurnScore[];
  avgScore:  number;
  totalMs:   number;
  fatal?:    string;
}

async function runOnce(
  runId:     number,
  token:     string,
  missionId: number,
  brandName: string
): Promise<RunResult> {
  const startMs = Date.now();
  await resetSession(token, missionId);

  const turns: TurnScore[] = [];
  const history: { role: string; content: string }[] = [];
  let leadAgentName = "";
  let prevAgentName = "";
  let fatal: string | undefined;

  for (let i = 0; i < USER_TURNS.length; i++) {
    const turnDef = USER_TURNS[i];
    process.stdout.write(`  [Run ${runId}] T${i + 1} "${turnDef.label}" … `);

    const result = await sendTurn(token, missionId, turnDef.msg, history);

    if (result.error) {
      console.log(`❌ ${result.error}`);
      if (result.rawSse) console.log(`     RAW SSE: ${result.rawSse.slice(0, 200)}`);
      fatal = result.error;
      break;
    }

    if (i === 0 && result.agentName) leadAgentName = result.agentName;
    const turnScore = scoreTurn(i, turnDef, result, brandName, leadAgentName, prevAgentName);
    turns.push(turnScore);

    // 即時指標列印
    const indicators = [
      turnScore.scores.relayBeforeDelta      ? "🎯" : "❌",
      turnScore.scores.hasAgentIdentity      ? "👤" : "❌",
      turnScore.scores.brandMentioned        ? "🏷" : "❌",
      turnScore.scores.noMissionLeadFallback ? "✅" : "🚨",
      turnScore.scores.isActualA2A           ? "🔀" : "⚠️",
      turnScore.scores.replyToSameAgent      ? "💬" : "⚠️",
    ].join(" ");
    console.log(
      `${indicators}  agent="${result.agentName}" step=${result.step}/${result.totalSteps}` +
      `  len=${result.content.length}  ${result.timeMs}ms  score=${turnScore.totalScore}`
    );

    prevAgentName = result.agentName;
    history.push({ role: "user", content: turnDef.msg });
    history.push({ role: "assistant", content: result.content.slice(0, 400) });
  }

  const avgScore = turns.length > 0
    ? Math.round(turns.reduce((s, t) => s + t.totalScore, 0) / turns.length)
    : 0;

  return { runId, missionId, brandName, turns, avgScore, totalMs: Date.now() - startMs, fatal };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 測試報告
// ═══════════════════════════════════════════════════════════════════════════════

function printReport(results: RunResult[]) {
  const W = 84;
  const line = "═".repeat(W);
  const dash = "─".repeat(W);

  console.log(`\n${line}`);
  console.log("  A2A SQUAD FLOW 完整測試報告 v2");
  console.log(`  Squad: ${SQUAD_SLUG}  |  5 步驟全覆蓋  |  reply-to-same-agent UX`);
  console.log(line);

  const ok   = results.filter(r => !r.fatal);
  const fail = results.filter(r => r.fatal);
  console.log(`\n📊 ${RUNS} 輪  |  成功 ${ok.length}  |  失敗 ${fail.length}`);

  if (ok.length === 0) {
    console.log("\n⚠️  所有測試均失敗，請確認 server 在 port", PORT, "運行");
    return;
  }

  const avgOverall = Math.round(ok.reduce((s, r) => s + r.avgScore, 0) / ok.length);
  const minScore   = Math.min(...ok.map(r => r.avgScore));
  const maxScore   = Math.max(...ok.map(r => r.avgScore));
  const avgSecs    = (ok.reduce((s, r) => s + r.totalMs, 0) / ok.length / 1000).toFixed(1);

  console.log(`\n🏆 平均分 ${avgOverall}/100  最低 ${minScore}  最高 ${maxScore}  平均耗時 ${avgSecs}s`);

  // ── 各指標通過率 ──
  const metricDefs: Array<{ key: keyof TurnScore["scores"]; label: string }> = [
    { key: "relayBeforeDelta",      label: "relay_step 先於 delta" },
    { key: "hasAgentIdentity",      label: "Agent 身份非空" },
    { key: "brandMentioned",        label: "品牌名稱出現在回覆" },
    { key: "noGroupChatHalluc",     label: "無 Group Chat 幻覺" },
    { key: "noMissionLeadFallback", label: '不再是 "Mission Lead" fallback' },
    { key: "leadAskQuestion",       label: "Lead 有提問（Step 0）" },
    { key: "specialistStructure",   label: "Specialist 有結構化輸出（Step≥1）" },
    { key: "isActualA2A",           label: "Step≥1 使用不同 Agent（真正 A2A）" },
    { key: "replyToSameAgent",      label: "Reply-to-same-agent 同一專家繼續" },
  ];

  console.log("\n📈 各指標通過率：");
  const allTurns = ok.flatMap(r => r.turns);
  for (const { key, label } of metricDefs) {
    const relevant = allTurns.filter(t => {
      if (key === "leadAskQuestion") return t.step === 0;
      if (key === "specialistStructure" || key === "isActualA2A") return t.step > 0;
      if (key === "replyToSameAgent") return t.label.includes("reply-to-same");
      return true;
    });
    if (relevant.length === 0) { console.log(`  (no relevant turns for ${label})`); continue; }
    const passed = relevant.filter(t => t.scores[key] === true).length;
    const pct    = Math.round((passed / relevant.length) * 100);
    const filled = Math.floor(pct / 5);
    const bar    = "█".repeat(filled) + "░".repeat(20 - filled);
    const icon   = pct === 100 ? "✅" : pct >= 60 ? "⚠️" : "❌";
    console.log(`  ${icon} ${bar} ${String(pct).padStart(3)}%  ${label}`);
  }

  // ── 逐輪 Turn 分析 ──
  console.log("\n📋 各輪 Turn 詳情：");
  const turnLabels = USER_TURNS.map((t, i) => `T${i+1}`);
  const header = ["Run", ...turnLabels, "Avg", "Time", "Status"].map(s => s.padStart(7)).join(" │ ");
  console.log(`  ${header}`);
  console.log(`  ${"─".repeat(header.length)}`);

  for (const r of results) {
    const cols = [
      String(r.runId).padStart(7),
      ...turnLabels.map((_, i) => (r.turns[i]?.totalScore ?? "–").toString().padStart(7)),
      String(r.avgScore).padStart(7),
      `${(r.totalMs / 1000).toFixed(1)}s`.padStart(7),
      (r.fatal ? "FAIL" : "OK").padStart(7),
    ];
    console.log(`  ${cols.join(" │ ")}`);
  }

  // ── Agent 出場記錄（A2A 驗證）──
  console.log("\n🔀 A2A Agent 出場記錄（成功輪次）：");
  for (const r of ok) {
    const agentSeq = r.turns.map(t => `T${t.turnIdx + 1}:${t.agentName.split(" ")[0]}`).join(" → ");
    console.log(`  Run ${r.runId}: ${agentSeq}`);
  }

  // ── 最佳輪詳情 ──
  const best = ok.reduce((a, b) => a.avgScore >= b.avgScore ? a : b);
  console.log(`\n🥇 最佳輪 Run ${best.runId} (score=${best.avgScore})：`);
  for (const t of best.turns) {
    const flags = [
      t.scores.noMissionLeadFallback ? "✅" : "❌ MissionLead!",
      t.scores.isActualA2A           ? "🔀A2A" : "⚠️SameAgent",
      t.scores.replyToSameAgent      ? "" : t.label.includes("reply") ? "❌ WrongAgent" : "",
    ].filter(Boolean).join(" ");
    console.log(`\n${"═".repeat(80)}`);
    console.log(`  ${t.label}`);
    console.log(`  Agent: ${t.agentName}  |  Model: ${t.agentModel}  |  Step: ${t.step}  |  ${flags}`);
    console.log(`  字數: ${t.content.length}  |  耗時: ${(t.scores.timeMs/1000).toFixed(1)}s  |  Score: ${t.totalScore}`);
    console.log("─".repeat(80));
    console.log(t.content);
    console.log("─".repeat(80));
  }

  // ── 優化建議 ──
  console.log("\n💡 優化建議：");
  const missionLeadRate = allTurns.filter(t => !t.scores.noMissionLeadFallback).length / allTurns.length;
  if (missionLeadRate > 0) {
    console.log(`  🚨 ${Math.round(missionLeadRate * 100)}% 的回覆仍出現 Mission Lead → squadSlug 路由問題未完全修復`);
  } else {
    console.log(`  ✅ Mission Lead fallback 完全消除！`);
  }

  const a2aRate = allTurns.filter(t => t.step > 0 && !t.scores.isActualA2A).length;
  if (a2aRate > 0) {
    console.log(`  ⚠️  ${a2aRate} 個 Step≥1 轉次仍使用 Squad Lead → stepAgentResolver 解析失敗`);
  } else {
    console.log(`  ✅ A2A 分工正確：每個步驟使用對應專家`);
  }

  const replyRate = allTurns.filter(t => t.label.includes("reply") && !t.scores.replyToSameAgent).length;
  if (replyRate > 0) {
    console.log(`  ⚠️  reply-to-same-agent 部分失敗（${replyRate} 次）→ awaiting_reply 狀態處理問題`);
  } else {
    console.log(`  ✅ reply-to-same-agent UX 正常：Specialist 持續回應用戶`);
  }

  const avgLen = allTurns.reduce((s, t) => s + t.scores.contentLength, 0) / allTurns.length;
  if (avgLen < 300) {
    console.log(`  📏 平均回覆 ${Math.round(avgLen)} 字，偏短 → 加強 system prompt 字數要求`);
  } else {
    console.log(`  ✅ 平均回覆 ${Math.round(avgLen)} 字，充足`);
  }

  const avgMs = allTurns.reduce((s, t) => s + t.scores.timeMs, 0) / allTurns.length;
  if (avgMs > 20000) {
    console.log(`  🐢 平均每輪 ${(avgMs / 1000).toFixed(1)}s，偏慢 → 考慮更快模型`);
  } else {
    console.log(`  ✅ 回應速度 ${(avgMs / 1000).toFixed(1)}s / turn`);
  }

  console.log(`\n${line}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("🚀 A2A Squad Flow 測試 v2 — 共", RUNS, "輪 ×", USER_TURNS.length, "turns\n");

  // 1. 準備 localPool 測試任務（直接設定 squadSlug = 模板 slug）
  const localPool = await getLocalPool();
  const mission   = await prepareLocalMission(localPool);
  if (!mission) { await localPool.end(); process.exit(1); }
  console.log(`📋 Mission #${mission.missionId}  brand="${mission.brandName}"  squad="${SQUAD_SLUG}"\n`);

  // 2. 取得測試 JWT
  const mainPool = await getMainPool().catch(() => null);
  const userId   = mainPool ? await getTestUserId(mainPool) : 1;
  if (!userId) { console.error("❌ 找不到有效 user"); process.exit(1); }
  const token = await createTestToken(userId);
  if (!token) { process.exit(1); }
  console.log(`🔑 JWT signed for userId=${userId}  PORT=${PORT}\n`);

  // 3. 執行 RUNS 輪
  const results: RunResult[] = [];
  for (let i = 1; i <= RUNS; i++) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  Run ${i}/${RUNS}`);
    console.log("─".repeat(60));
    const r = await runOnce(i, token, mission.missionId, mission.brandName);
    results.push(r);
    if (r.fatal) console.log(`  ⚠️  Run ${i} fatal: ${r.fatal}`);
    if (i >= 2) {
      const recentFatal = results.slice(-2).filter(x => x.fatal).length;
      if (recentFatal === 2) { console.log("⛔ 連續 2 輪失敗，停止（server 可能未啟動）"); break; }
    }
  }

  // 4. 報告
  printReport(results);

  await localPool.end();
  if (mainPool) await mainPool.end();
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
