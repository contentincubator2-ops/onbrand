/**
 * squadTemplateRouter.ts — Squad 模板管理 + DB-driven 推薦 (mission 內執行的團隊)
 *
 * Renamed from squadRouter in Phase A (2026-04-18)
 * Purpose: Manages squad templates (the team composition recommendations) used within missions.
 *
 * Original header:
 * squadRouter.ts — Squad 生命週期管理 + DB-driven 推薦
 *
 * 查詢流程：
 *   getRecommendedSquads() — 從 517 個 squads 中，按 workspace + brand + mission 評分推薦 6 個
 *   getMembersById()       — 解析 squads.members JSON → 查 agents → 回傳真實成員 + workflow steps
 *   getAlternativeLeads()  — 其他 squad 的 lead agents（備選專家）
 *   getSquadBySlug()       — 透過 slug 查單一 squad（用於頁面重載後還原選中狀態）
 *
 * 執行流程：
 *   assemble()     — 用戶確認組隊 → 建立 squads + squad_agents 實例（支援 squadId 或 fallback 硬編碼）
 *   getStatus()    — 前端輪詢
 *   getAgents()    — 取得 squad_agents 實例清單
 *   squadLeadOpen()— Squad Lead 生成開場問題
 */

import { router } from "../../platform/core/trpc";
import { adminProcedures } from "./squadTemplate/adminProcedures";
import { catalogProcedures } from "./squadTemplate/catalogProcedures";
import { stepProcedures } from "./squadTemplate/stepProcedures";

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Live-run helpers (used by squad.runStepLive) ────────────────────────

// ── Workspace → tag keywords mapping ─────────────────────────────────────────

// ── Fallback squad lead definition ───────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────


export const squadTemplateRouter = router({

  ...adminProcedures,




  ...stepProcedures,

  ...catalogProcedures,






















});
