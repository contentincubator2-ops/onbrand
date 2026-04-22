/**
 * missionSquadRoute.ts — Mission's Squad Resource REST API
 * GET /api/missions/:missionId/squad — 回傳該任務的 squad 成員資訊
 *
 * Always reads from the `squads` table (squadSlug column on missions).
 * Renamed from squadRoute.ts in Phase A (2026-04-18).
 * POSITIONING_SQUAD hardcoded block removed 2026-04-21 (squad consolidation).
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import localPool from "../localDb";
import { synthesizeAgentAsSquad, isAgentSlug, parseAgentSlug, type AgentRow } from "../_core/agentSquadSynth";

export const missionSquadRouter = Router();

// ── Auth (accepts both Bearer token and session cookie) ───────────────────────
async function verifyToken(req: Request): Promise<number | null> {
  const auth = req.headers.authorization;
  let raw: string | null = null;
  if (auth?.startsWith("Bearer ")) {
    raw = auth.slice(7);
  } else if ((req as any).cookies?.session) {
    raw = (req as any).cookies.session;
  }
  if (!raw) return null;
  try {
    const secret = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(raw, secret);
    return payload.sub ? parseInt(String(payload.sub), 10) : null;
  } catch { return null; }
}

// ── GET /api/missions/:missionId/squad ────────────────────────────────────────
missionSquadRouter.get("/:missionId/squad", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const missionId = parseInt(req.params.missionId ?? "0", 10);
  if (!missionId) { res.status(400).json({ error: "Invalid missionId" }); return; }

  try {
    // 查詢任務資訊（包含 squadSlug）
    const [missionRows] = await localPool.execute(
      `SELECT m.id, m.workspace, m.title, m.status, m.squadSlug
       FROM missions m
       WHERE m.id = ? LIMIT 1`,
      [missionId]
    ) as any[];

    const mission = (missionRows as any[])?.[0];
    if (!mission) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }

    // ── Agent-mode: squadSlug starts with "agent:" → synthesize single-person squad
    if (mission.squadSlug && isAgentSlug(mission.squadSlug)) {
      const idOrSlug = parseAgentSlug(mission.squadSlug)!;
      const isNumeric = /^\d+$/.test(idOrSlug);
      const [aRows] = await localPool.execute(
        isNumeric
          ? `SELECT id, slug, name, title, specialty, primarySkill, methodology, skills, taskType, layer, aiModel, avatarUrl, industries FROM agents WHERE id = ? LIMIT 1`
          : `SELECT id, slug, name, title, specialty, primarySkill, methodology, skills, taskType, layer, aiModel, avatarUrl, industries FROM agents WHERE slug = ? LIMIT 1`,
        [idOrSlug],
      ) as any[];
      const agent = (aRows as any[])?.[0];
      if (agent) {
        const synth = synthesizeAgentAsSquad(agent as AgentRow);
        const [sessionRows] = await localPool.execute(
          `SELECT currentStepIndex, status FROM squad_chat_sessions WHERE missionId = ? ORDER BY updatedAt DESC LIMIT 1`,
          [missionId],
        ) as any[];
        const session = (sessionRows as any[])?.[0];
        const currentStepIndex = session?.currentStepIndex ?? 0;
        const sessionStatus = session?.status ?? "pending";

        const membersWithStatus = synth.steps.map((s, idx) => {
          let status: "pending" | "running" | "done";
          if (idx < currentStepIndex) status = "done";
          else if (idx === currentStepIndex) status = sessionStatus === "completed" ? "done" : sessionStatus === "in_progress" ? "running" : "pending";
          else status = "pending";
          return {
            agentName: agent.name,
            agentTitle: agent.title ?? "Specialist",
            model: agent.aiModel ?? "claude-opus-4-6",
            skills: [s.skill],
            status,
            completedStep: s.title,
            hasOutput: idx < currentStepIndex,
          };
        });

        res.json({
          missionId,
          workspace: mission.workspace,
          title: mission.title,
          squadSlug: mission.squadSlug,
          squadName: synth.name,
          squad: membersWithStatus,
        });
        return;
      }
    }

    // 若任務有 squadSlug，從 squads 表讀取成員資訊
    if (mission.squadSlug) {
      const [squadRows] = await localPool.execute(
        `SELECT id, name, slug, description, agents, steps
         FROM squads
         WHERE slug = ? LIMIT 1`,
        [mission.squadSlug]
      ) as any[];

      const squad = (squadRows as any[])?.[0];
      if (squad) {
        let agents: any[] = [];
        let steps: any[] = [];
        try { agents = typeof squad.agents === "string" ? JSON.parse(squad.agents) : (squad.agents ?? []); } catch { agents = []; }
        try { steps = typeof squad.steps === "string" ? JSON.parse(squad.steps) : (squad.steps ?? []); } catch { steps = []; }

        // 從 squad_chat_sessions 取得目前執行進度
        const [sessionRows] = await localPool.execute(
          `SELECT currentStepIndex, status FROM squad_chat_sessions WHERE missionId = ? ORDER BY updatedAt DESC LIMIT 1`,
          [missionId]
        ) as any[];
        const session = (sessionRows as any[])?.[0];
        const currentStepIndex = session?.currentStepIndex ?? 0;
        const sessionStatus = session?.status ?? "pending";

        const membersWithStatus = agents.map((a: any, idx: number) => {
          let status: "pending" | "running" | "done";
          if (idx < currentStepIndex) {
            status = "done";
          } else if (idx === currentStepIndex) {
            status = sessionStatus === "completed" ? "done" : sessionStatus === "in_progress" ? "running" : "pending";
          } else {
            status = "pending";
          }
          const step = steps[idx] as any;
          return {
            agentName: a.name ?? a.agentName ?? "Agent",
            agentTitle: a.title ?? a.agentTitle ?? "",
            model: a.aiModel ?? "claude-opus-4-6",
            skills: a.primarySkill ? [a.primarySkill] : [],
            status,
            completedStep: step?.name ?? `Step ${idx + 1}`,
            hasOutput: idx < currentStepIndex,
          };
        });

        res.json({
          missionId,
          workspace: mission.workspace,
          title: mission.title,
          squadSlug: mission.squadSlug,
          squadName: squad.name,
          squad: membersWithStatus,
        });
        return;
      }
    }

    // Fallback: 回傳空 squad（任務尚未選擇 squad）
    res.json({
      missionId,
      workspace: mission.workspace,
      title: mission.title,
      squad: [],
      message: "尚未選擇 Squad",
    });
  } catch (err: any) {
    console.error("[missionSquadRoute] GET error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});
