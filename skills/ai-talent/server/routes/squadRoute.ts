/**
 * squadRoute.ts — Squad 成員資料 API
 * GET /api/missions/:missionId/squad — 回傳該任務的 squad 成員資訊
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import mysql from "mysql2/promise";

export const squadRouter = Router();

// ── Azure MySQL Pool ──────────────────────────────────────────────────────────
let _pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!_pool) {
    _pool = mysql.createPool({
      host: process.env.DB_HOST!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      ssl: { rejectUnauthorized: false },
      connectionLimit: 5,
    });
  }
  return _pool;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function verifyToken(req: Request): Promise<number | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const secret = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(auth.slice(7), secret);
    return payload.sub ? parseInt(String(payload.sub), 10) : null;
  } catch { return null; }
}

// ── Static squad definition for positioning flow ──────────────────────────────
const POSITIONING_SQUAD: Record<number, {
  agentName: string;
  agentTitle: string;
  model: string;
  skills: string[];
  stepLabel: string;
}> = {
  1: {
    agentName: "PM Agent",
    agentTitle: "行銷任務指揮官",
    model: "Claude Sonnet",
    skills: ["任務規劃", "流程管理", "品牌 recap"],
    stepLabel: "Step 1: 任務確認",
  },
  2: {
    agentName: "Sarah Chen",
    agentTitle: "品牌策略師",
    model: "Claude Sonnet",
    skills: ["品牌定位", "競品分析", "市場洞察"],
    stepLabel: "Step 2: 競品分析",
  },
  3: {
    agentName: "Mark Liu",
    agentTitle: "市場研究師",
    model: "Claude Sonnet",
    skills: ["消費者洞察", "Persona 設計", "市場調研"],
    stepLabel: "Step 3: 目標受眾定義",
  },
  4: {
    agentName: "Sarah Chen",
    agentTitle: "品牌策略師",
    model: "Claude Sonnet",
    skills: ["品牌定位宣言", "Tagline 設計", "定位框架"],
    stepLabel: "Step 4: 品牌定位宣言",
  },
  5: {
    agentName: "Jessica Wu",
    agentTitle: "創意文案師",
    model: "Claude Sonnet",
    skills: ["品牌語調", "文案策略", "DO/DON'T 框架"],
    stepLabel: "Step 5: 品牌聲音定義",
  },
  6: {
    agentName: "PM Agent",
    agentTitle: "報告整理師",
    model: "Claude Sonnet",
    skills: ["報告整合", "PPT 生成", "成果交付"],
    stepLabel: "Step 6: 完整報告 + PPT 輸出",
  },
};

// ── GET /api/missions/:missionId/squad ────────────────────────────────────────
squadRouter.get("/:missionId/squad", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const missionId = parseInt(req.params.missionId ?? "0", 10);
  if (!missionId) { res.status(400).json({ error: "Invalid missionId" }); return; }

  try {
    const pool = getPool();

    // 查詢任務資訊
    const [missionRows] = await pool.execute(
      `SELECT m.id, m.workspace, m.title, m.status,
              ps.currentStep, ps.status as posStatus, ps.stepResults
       FROM missions m
       LEFT JOIN positioning_sessions ps ON ps.missionId = m.id
       WHERE m.id = ? LIMIT 1`,
      [missionId]
    ) as any[];

    const mission = (missionRows as any[])?.[0];
    if (!mission) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }

    // 對於品牌定位任務（workspace=strategy），從 positioning_sessions 抽取 squad
    if (mission.workspace === "strategy") {
      const currentStep = mission.currentStep ?? 0;
      const posStatus = mission.posStatus ?? "pending";

      let stepResults: Record<string, string> = {};
      try {
        stepResults = typeof mission.stepResults === "string"
          ? JSON.parse(mission.stepResults || "{}")
          : (mission.stepResults ?? {});
      } catch { stepResults = {}; }

      const squad = [];
      for (let step = 1; step <= 6; step++) {
        const def = POSITIONING_SQUAD[step];
        if (!def) continue;

        let status: "pending" | "running" | "done";
        if (step < currentStep) {
          status = "done";
        } else if (step === currentStep) {
          status = posStatus === "completed" ? "done" : posStatus === "in_progress" ? "running" : "done";
        } else {
          status = "pending";
        }

        // 只有已執行的步驟才加入（或全部顯示，取決於需求）
        squad.push({
          agentName: def.agentName,
          agentTitle: def.agentTitle,
          model: def.model,
          skills: def.skills,
          status,
          completedStep: def.stepLabel,
          hasOutput: !!stepResults[String(step)],
        });
      }

      // 去除重複的 agentName（PM Agent 出現兩次時合併）
      const uniqueAgents = new Map<string, typeof squad[0]>();
      for (const member of squad) {
        const key = `${member.agentName}-${member.completedStep}`;
        uniqueAgents.set(key, member);
      }

      res.json({
        missionId,
        workspace: mission.workspace,
        title: mission.title,
        squad: [...uniqueAgents.values()],
      });
      return;
    }

    // 對於一般任務，從 chat_messages / task_executions 抽取 agent 資訊
    const [msgRows] = await pool.execute(
      `SELECT DISTINCT role, content
       FROM chat_messages
       WHERE missionId = ? AND role = 'assistant'
       ORDER BY createdAt DESC
       LIMIT 20`,
      [missionId]
    ) as any[];

    // 嘗試從 task_executions 取得 agent 資訊
    const [taskRows] = await pool.execute(
      `SELECT te.agentSlug, te.status, te.createdAt,
              a.name as agentName, a.title as agentTitle, a.specialty
       FROM task_executions te
       LEFT JOIN agents a ON a.slug = te.agentSlug
       WHERE te.missionId = ?
       ORDER BY te.createdAt DESC
       LIMIT 20`,
      [missionId]
    ) as any[];

    if ((taskRows as any[]).length > 0) {
      const squad = (taskRows as any[]).map(row => ({
        agentName: row.agentName || row.agentSlug || "Agent",
        agentTitle: row.agentTitle || "執行專員",
        model: "Claude Sonnet",
        skills: row.specialty ? [row.specialty] : [],
        status: row.status === "completed" ? "done" : row.status === "running" ? "running" : "pending",
        completedStep: row.agentSlug,
        hasOutput: row.status === "completed",
      }));

      res.json({ missionId, workspace: mission.workspace, title: mission.title, squad });
      return;
    }

    // Fallback: 回傳空 squad
    res.json({
      missionId,
      workspace: mission.workspace,
      title: mission.title,
      squad: [],
      message: "尚無執行紀錄",
    });
  } catch (err: any) {
    console.error("[squadRoute] GET error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});
