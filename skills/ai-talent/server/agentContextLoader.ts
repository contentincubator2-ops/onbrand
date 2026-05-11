/**
 * agentContextLoader.ts — 通用 Agent Context 載入器
 *
 * 所有 17,000+ agents 執行前統一呼叫此 loader，
 * 將「任務記憶 + 品牌記憶 + agent 實例記憶」打包成 system prompt prefix。
 *
 * 讀取深度規則：
 *   - 一般 Agent  : 最近 20 筆對話
 *   - Squad Lead  : 最近 100 筆對話（必讀）
 */

import mysql from "mysql2/promise";

// ── DB Pool ──────────────────────────────────────────────────────────────────
let _pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!_pool) {
    // SEC-B-02 (2026-05-05): no hardcoded password fallback. See db.ts.
    const password = process.env.LOCAL_DB_PASSWORD;
    if (!password) {
      throw new Error("[agentContextLoader] LOCAL_DB_PASSWORD env var is required.");
    }
    _pool = mysql.createPool({
      host:     process.env.LOCAL_DB_HOST     || "localhost",
      user:     process.env.LOCAL_DB_USER     || "mos_user",
      password,
      database: process.env.LOCAL_DB_NAME     || "mos_db",
      connectionLimit: 10,
    });
  }
  return _pool;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AgentContextInput {
  missionId: number;
  brandId: number;
  userId: number;
  squadUid?: string;       // 有 squad 時提供
  agentKey?: string;       // squad_agents.agent_key（有 squad 時）
  isSquadLead?: boolean;   // Squad Lead 讀 100 筆
}

export interface AgentContext {
  systemPromptPrefix: string;    // 直接插入 system prompt 最前面
  historyDepth: number;          // 實際讀取筆數
  brandName: string;
  recentMessages: { role: string; content: string; agentName?: string }[];
  brandBrain: Record<string, string[]>;
  instanceContext: Record<string, any>;
  depthLabel: string;            // 顯示給用戶的說明文字
}

// ── Main Loader ───────────────────────────────────────────────────────────────
export async function loadAgentContext(input: AgentContextInput): Promise<AgentContext> {
  const pool = getPool();
  const limit = input.isSquadLead ? 100 : 20;
  const depthLabel = input.isSquadLead
    ? "（已完整讀取近 100 筆對話記錄）"
    : "（已讀取近 20 筆對話記錄，如需更完整的脈絡請告知）";

  // ── 1. 品牌基本資料 ────────────────────────────────────────────────────────
  const [brandRows] = await pool.execute(
    `SELECT name, industry, description, tagline,
            valueProposition, targetMarket, audienceA, audienceB,
            emotionalDiff, functionalDiff
     FROM brands
     WHERE id = ? AND (userId = ? OR createdBy = ?)
     LIMIT 1`,
    [input.brandId, input.userId, input.userId]
  ) as any[];
  const brand = (brandRows as any[])?.[0] ?? {};
  const brandName = brand.name ?? "未命名品牌";

  // ── 2. 品牌大腦資料 ────────────────────────────────────────────────────────
  const [brainRows] = await pool.execute(
    `SELECT category, content FROM brand_brain
     WHERE brandId = ? ORDER BY updatedAt DESC`,
    [input.brandId]
  ) as any[];

  const brandBrain: Record<string, string[]> = {};
  for (const row of (brainRows as any[])) {
    const cat = row.category ?? "general";
    if (!brandBrain[cat]) brandBrain[cat] = [];
    brandBrain[cat].push(row.content);
  }

  // ── 3. 任務對話歷史 ────────────────────────────────────────────────────────
  // 2026-05-10: LIMIT ? as prepared param → MySQL 'Incorrect arguments'. Inline.
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 30));
  const [msgRows] = await pool.execute(
    `SELECT role, content, conversationTitle as agentName, createdAt
     FROM chat_messages
     WHERE missionId = ? AND userId = ?
     ORDER BY createdAt DESC
     LIMIT ${safeLimit}`,
    [input.missionId, input.userId]
  ) as any[];
  const recentMessages = (msgRows as any[]).reverse().map((r: any) => ({
    role: r.role,
    content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
    agentName: r.agentName ?? undefined,
  }));

  // ── 4. Agent 實例專屬記憶（brand_context）─────────────────────────────────
  let instanceContext: Record<string, any> = {};
  if (input.squadUid && input.agentKey) {
    const [instRows] = await pool.execute(
      `SELECT brand_context FROM squad_agents
       WHERE squad_uid = ? AND agent_key = ? AND user_id = ?
       LIMIT 1`,
      [input.squadUid, input.agentKey, input.userId]
    ) as any[];
    const inst = (instRows as any[])?.[0];
    if (inst?.brand_context) {
      try {
        instanceContext = typeof inst.brand_context === "string"
          ? JSON.parse(inst.brand_context)
          : inst.brand_context;
      } catch { instanceContext = {}; }
    }
  }

  // ── 5. 組裝 system prompt prefix ──────────────────────────────────────────
  const sections: string[] = [];

  // 品牌 section
  sections.push(`【品牌資料】
品牌名稱：${brandName}
產業：${brand.industry ?? "未填寫"}
描述：${brand.description ?? "未填寫"}
目標市場：${brand.targetMarket ?? "未填寫"}
受眾A：${brand.audienceA ?? "未填寫"}
受眾B：${brand.audienceB ?? "未填寫"}
Tagline：${brand.tagline ?? "尚無"}
品牌定位：${brand.valueProposition ?? "未定義"}
情感差異化：${brand.emotionalDiff ?? "未定義"}
功能差異化：${brand.functionalDiff ?? "未定義"}`);

  // 品牌大腦 section（有資料才顯示）
  if (Object.keys(brandBrain).length > 0) {
    const brainLines: string[] = ["【品牌大腦（累積知識）】"];
    for (const [cat, items] of Object.entries(brandBrain)) {
      brainLines.push(`${cat}：`);
      items.slice(0, 3).forEach(item => brainLines.push(`  • ${item.slice(0, 120)}`));
    }
    sections.push(brainLines.join("\n"));
  }

  // 對話歷史 section
  if (recentMessages.length > 0) {
    const histLines: string[] = [`【任務對話記錄（最近 ${recentMessages.length} 筆）】`];
    for (const msg of recentMessages.slice(-10)) {
      const speaker = msg.role === "user" ? "用戶"
        : msg.agentName ? msg.agentName : "Assistant";
      histLines.push(`${speaker}：${msg.content.slice(0, 200)}`);
    }
    sections.push(histLines.join("\n"));
  }

  // agent 實例記憶 section（有才顯示）
  if (Object.keys(instanceContext).length > 0) {
    sections.push(`【你的品牌專屬記憶】\n${JSON.stringify(instanceContext, null, 2).slice(0, 500)}`);
  }

  // 深度標記
  sections.push(`\n${depthLabel}`);

  const systemPromptPrefix = sections.join("\n\n─────────────────────────\n\n");

  return {
    systemPromptPrefix,
    historyDepth: recentMessages.length,
    brandName,
    recentMessages,
    brandBrain,
    instanceContext,
    depthLabel,
  };
}

// ── 更新 agent 實例的 brand_context（執行後學習）────────────────────────────
export async function updateAgentInstanceContext(
  squadUid: string,
  agentKey: string,
  userId: number,
  patch: Record<string, any>
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT brand_context FROM squad_agents
     WHERE squad_uid = ? AND agent_key = ? AND user_id = ? LIMIT 1`,
    [squadUid, agentKey, userId]
  ) as any[];
  const existing = (rows as any[])?.[0];
  if (!existing) return;

  let ctx: Record<string, any> = {};
  try {
    ctx = typeof existing.brand_context === "string"
      ? JSON.parse(existing.brand_context || "{}")
      : (existing.brand_context ?? {});
  } catch { ctx = {}; }

  const updated = { ...ctx, ...patch, _updatedAt: new Date().toISOString() };
  await pool.execute(
    `UPDATE squad_agents SET brand_context = ?, updated_at = NOW()
     WHERE squad_uid = ? AND agent_key = ? AND user_id = ?`,
    [JSON.stringify(updated), squadUid, agentKey, userId]
  );
}
