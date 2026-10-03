/**
 * 小隊流程的步驟：執行、進度、復原、編輯與提問。
 */
import { protectedProcedure, adminProcedure } from "../../../platform/core/trpc";
import { z } from "zod";
import localPool from "../../../localDb";
import { TRPCError } from "@trpc/server";
import { assertTaskAllowed } from "../../../platform/core/billing/planGate";
import { squadGateInfo, safeJsonParse, mockConclusionForStep, maxTokensForOutputKind, tryParseJson, mapToMockupData, FALLBACK_SQUAD_LEAD } from "./helpers";
import { buildBrandPrefix, enforceBrandRulesOnText } from "../../../strategy/core/brand/brandContext";
import { loadAgentKnowledge } from "../../../platform/core/agents/agentKnowledge";
import { callLLM } from "../../../platform/core/llm/llmRouter";
import { getDb } from "../../../db";
import { sql } from "drizzle-orm";
import { loadAgentContext } from "../../core/squad/agentContextLoader";
import { normalizeTaskId, legacyTaskId } from "../../../platform/core/tierCompat";

export const stepProcedures = {
  /**
   * runStepLive — actually execute one squad step against the LLM.
   *
   * No DB writes (no mission_step_progress row). For admin lab "Test Run"
   * mode where CJ wants to see real LLM output per step before approving.
   *
   * Caller passes:
   *   - squadId + stepIndex → fetches step config (prompt, model, outputKind)
   *   - brandId (optional) → for brand-context substitution
   *   - userInput (optional) → step 1 checkpoint values feed downstream
   *   - upstreamOutputs (optional) → outputs from prior steps in the run
   *
   * Returns:
   *   - rawText (LLM raw response)
   *   - parsed (best-effort JSON parse; null if LLM didn't comply)
   *   - mockupData (per outputKind, shape ready for mockup component)
   */
  runStepLive: adminProcedure
    .input(z.object({
      squadId: z.number(),
      stepIndex: z.number().int().min(0).max(20),
      // Scope binding — accepts brand / product / event (CJ correction
      // 2026-04-30: not just brand). Backward-compat: brandId still
      // accepted standalone if scopeKind is omitted.
      scopeKind: z.enum(["brand", "product", "event"]).optional(),
      scopeId: z.number().optional(),
      brandId: z.number().nullable().optional(),
      userInput: z.record(z.string(), z.any()).optional(),
      upstreamOutputs: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Load squad + step
      const [sqRows] = await localPool.execute(
        `SELECT id, slug, name, methodology, steps, agents, lead_agent_id
           FROM squads WHERE id = ? LIMIT 1`,
        [input.squadId],
      ) as any[];
      const squad = (sqRows as any[])?.[0];
      if (!squad) throw new TRPCError({ code: "NOT_FOUND", message: `squad ${input.squadId} not found` });
      // 2026-09-07 執行層方案閘門（squad 引擎與 orchestra 是分開的，要各接一次）
      await assertTaskAllowed({
        userId: ctx.user!.id,
        brandId: input.brandId ?? (input.scopeKind === "brand" ? input.scopeId ?? null : null),
        info: await squadGateInfo(String(squad.slug ?? "")),
      });
      const steps = safeJsonParse<any[]>(squad.steps, []);
      const step = steps[input.stepIndex];
      if (!step) throw new TRPCError({ code: "NOT_FOUND", message: `step ${input.stepIndex} not found` });

      // UI-only steps don't call LLM
      if (step.aiModel === "n/a" || step.outputKind === "decision" && step.userInputFields?.length > 0) {
        return {
          ok: true,
          step: { name: step.name, outputKind: step.outputKind, mockupVariant: step.mockupVariant },
          rawText: "",
          parsed: null,
          mockupData: null,
          note: "此 step 是 UI checkpoint，不打 LLM。請在前端填寫 userInput 後 run 下一步。",
        };
      }

      // 2. Resolve scope context (brand / product / event)
      // Pri: explicit scopeKind+scopeId. Fallback: legacy brandId.
      const scopeKind = input.scopeKind ?? (input.brandId ? "brand" : undefined);
      const scopeId   = input.scopeId   ?? input.brandId   ?? undefined;
      let scopeLabel = "未綁定 scope";
      let scopeContext = "";
      if (scopeKind && scopeId) {
        if (scopeKind === "brand") {
          const [r] = await localPool.execute(
            `SELECT id, name, industry, description, positioning FROM brands WHERE id = ? LIMIT 1`,
            [scopeId],
          ) as any[];
          const row = (r as any[])?.[0];
          if (row) {
            scopeLabel = `品牌：${row.name}${row.industry ? `（${row.industry}）` : ""}`;
            // 2026-09-29：讀同一份品牌大腦（以前是把定位 JSON 整包截 3000 字）。
            scopeContext = await buildBrandPrefix(Number(row.id), null, null, "full").catch(() => "");
          }
        } else if (scopeKind === "product") {
          const [r] = await localPool.execute(
            `SELECT p.id, p.name, p.brandId, p.positioning, b.name AS brandName, b.industry, b.description AS brandDescription, b.positioning AS brandPositioning
               FROM products p
          LEFT JOIN brands b ON b.id = p.brandId
              WHERE p.id = ? LIMIT 1`,
            [scopeId],
          ) as any[];
          const row = (r as any[])?.[0];
          if (row) {
            scopeLabel = `產品：${row.name}（隸屬品牌「${row.brandName ?? "—"}」）`;
            scopeContext = row.brandId ? await buildBrandPrefix(Number(row.brandId), Number(row.id), null, "full").catch(() => "") : "";
          }
        } else if (scopeKind === "event") {
          const [r] = await localPool.execute(
            `SELECT e.id, e.name, e.brandId, e.startAt, e.endAt, e.positioning,
                    b.name AS brandName, b.industry, b.description AS brandDescription, b.positioning AS brandPositioning
               FROM events e
          LEFT JOIN brands b ON b.id = e.brandId
              WHERE e.id = ? LIMIT 1`,
            [scopeId],
          ) as any[];
          const row = (r as any[])?.[0];
          if (row) {
            const period = row.startAt ? `${String(row.startAt).split("T")[0]} ~ ${String(row.endAt ?? "").split("T")[0]}` : "（無日期）";
            scopeLabel = `活動：${row.name}（隸屬品牌「${row.brandName ?? "—"}」，期間 ${period}）`;
            scopeContext = row.brandId ? await buildBrandPrefix(Number(row.brandId), null, Number(row.id), "full").catch(() => "") : "";
          }
        }
      }

      // 3. Build prompts
      const userInputs = input.userInput ?? {};
      const upstream = input.upstreamOutputs ?? {};

      // Pattern adopted from pipelineRouter (proven on 14-step brand pipeline):
      // strict {thinking, conclusion, sources} envelope with a concrete
      // schema example for `conclusion`. The example tells LLM exactly
      // which keys to fill — converges faster + more parseable than free-form.
      const schemaExample = JSON.stringify(mockConclusionForStep(step.outputKind, step.mockupVariant), null, 2);

      const agentKnowledge = await loadAgentKnowledge(step.assignedAgentId ? Number(step.assignedAgentId) : null, { source: "squad.runStepLive" });
      const systemPrompt = `你是 ${step.assignedAgentName ?? "Squad Agent"}（zh-TW）。Squad「${squad.name}」步驟「${step.name}」負責人。
${agentKnowledge ? `\n${agentKnowledge}\n` : ""}

【方法論】${squad.methodology ?? "N/A"}
【步驟說明】${step.description ?? ""}

【輸出格式 — 嚴格 JSON，不要任何前綴/後綴/markdown code fence】
你的回應**必須**是合法 JSON 字串，三個 top-level keys：
- "thinking" (string, 200-600 字推理過程，繁中)
- "conclusion" (object, 結構必須符合下方範例的 keys)
- "sources" (array of {url,title,charCount,excerpt}，無研究時可空陣列)

conclusion 範例（outputKind = "${step.outputKind}", mockup = "${step.mockupVariant ?? ""}"; 依此 keys 填入真實內容）：
${schemaExample}

注意：直接 raw JSON，不要 \`\`\`json 圍籬，不要 prose 前綴。conclusion 不能是空 object。

⚠️【數據真實性規則】任何具體數字（百分比、互動率、發布數量、粉絲數、曝光數等），必須來自用戶提供的資料或上游步驟輸出。若無法取得真實數據，請以「（需提供真實 API 數據）」標示佔位符，不可虛構或假設任何具體數值。違反此規則比輸出空白更嚴重。`;

      const userPrompt = [
        `【執行 Scope】${scopeLabel}`,
        scopeContext || null,
        Object.keys(userInputs).length > 0
          ? `【用戶在 step 1 填的 brief】\n${JSON.stringify(userInputs, null, 2)}`
          : null,
        Object.keys(upstream).length > 0
          ? `【上游 step 已產出】\n${JSON.stringify(upstream, null, 2).slice(0, 3000)}`
          : null,
        "請執行此步驟，輸出 thinking + conclusion + sources JSON。",
      ].filter(Boolean).join("\n\n");

      // 4. Call LLM with cross-provider fallback (Anthropic → Azure Foundry
      //    → Azure OpenAI → OpenRouter). Single-provider failure (e.g.
      //    Azure DeploymentNotFound 404) doesn't kill the run.
      const t0 = Date.now();
      let rawText = "";
      let attempts = 1;
      const maxTokens = maxTokensForOutputKind(step.outputKind);
      try {
        // timeoutMs per provider — nginx default ~60s, must beat it.
        // 35s × 3 anthropic keys = 105s worst case but first usually succeeds.
        // Aborting fast lets us fall through providers before nginx 502s.
        // eslint-disable-next-line no-console
        console.log(`[runStepLive] squad=${input.squadId} step=${input.stepIndex} kind=${step.outputKind} maxTokens=${maxTokens} promptChars=${systemPrompt.length + userPrompt.length}`);
        const result = await callLLM({ system: systemPrompt, user: userPrompt, maxTokens, timeoutMs: 35_000 });
        rawText = result.text;
        attempts = result.attempts?.length ?? 1;
        // eslint-disable-next-line no-console
        console.log(`[runStepLive] OK squad=${input.squadId} step=${input.stepIndex} attempts=${attempts} chars=${rawText.length}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Common failure modes: nginx 502 HTML, provider 5xx, all providers down
        const friendly = msg.includes("Unexpected token") || msg.includes("<html>")
          ? "LLM provider 回傳 HTML（可能 5xx 或 timeout）。請降低 maxTokens 或重試。"
          : msg;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `LLM call failed (all providers): ${friendly}`,
        });
      }
      const durationMs = Date.now() - t0;

      // 5. Best-effort JSON parse — expect {thinking, conclusion, sources}
      //    envelope per pipelineRouter pattern.
      const parsedRaw = tryParseJson(rawText);
      const thinking: string = parsedRaw?.thinking ?? "";
      const conclusion: any  = parsedRaw?.conclusion ?? (
        // Fallback: if LLM returned conclusion fields at top level (no envelope)
        parsedRaw && Object.keys(parsedRaw).some((k) => k !== "thinking" && k !== "sources" && k !== "conclusion")
          ? Object.fromEntries(Object.entries(parsedRaw).filter(([k]) => k !== "thinking" && k !== "sources"))
          : null
      );
      const sources: any[] = Array.isArray(parsedRaw?.sources) ? parsedRaw.sources : [];

      // 6. Map conclusion → mockup-shaped data per outputKind
      const mockupData = mapToMockupData(conclusion, step.outputKind, step.mockupVariant, rawText, thinking, sources);

      return {
        ok: true,
        step: { name: step.name, outputKind: step.outputKind, mockupVariant: step.mockupVariant, aiModel: step.aiModel },
        rawText,
        parsed: parsedRaw,
        thinking,
        conclusion,
        sources,
        mockupData,
        durationMs,
        attempts,
      };
    }),

  // ── squadLeadOpen ─────────────────────────────────────────────────────────────
  squadLeadOpen: protectedProcedure
    .input(z.object({
      squadUid:  z.string(),
      missionId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sqRows] = await db.execute(
        sql`SELECT ss.brand_id, ss.title, ss.squad_lead,
                   sa.source_agent_id, sa.agent_name, sa.agent_title
            FROM squad_sessions ss
            LEFT JOIN squad_agents sa
              ON sa.squad_uid = ss.squad_uid AND sa.user_id = ss.user_id
             AND (sa.agent_role = 'squad_lead' OR sa.agent_name = ss.squad_lead)
            WHERE ss.squad_uid = ${input.squadUid} AND ss.user_id = ${ctx.user.id}
            ORDER BY sa.source_agent_id IS NULL ASC, sa.id ASC LIMIT 1`
      ) as any[];
      const sq = (sqRows as any[])?.[0];
      if (!sq) throw new TRPCError({ code: "NOT_FOUND" });

      const sourceAgentId = Number(sq.source_agent_id) || undefined;
      const leadName  = sq.agent_name ?? sq.squad_lead ?? FALLBACK_SQUAD_LEAD.agentName;
      const leadTitle = sq.agent_title ?? FALLBACK_SQUAD_LEAD.agentTitle;
      const leadKnowledge = sourceAgentId ? await loadAgentKnowledge(sourceAgentId, { source: "squad.leadOpen" }).catch(() => "") : "";

      const agentCtx = await loadAgentContext({
        missionId: input.missionId,
        brandId:   sq.brand_id,
        userId:    ctx.user.id,
        squadUid:  input.squadUid,
        agentKey:  undefined,
        isSquadLead: true,
      });

      const systemPrompt = `你是 ${leadName}，${leadTitle}。
你帶領了「${sq.title ?? "行銷小組"}」完成召集，即將展開工作。
${leadKnowledge ? `【此組長的工作守則與專業能力】
${leadKnowledge}
` : ""}${agentCtx.systemPromptPrefix}`;

      const userPrompt = `根據以上品牌資料和對話記錄，作為 Squad Lead，請：
1. 用一句話確認你對這個品牌目前狀況的初步理解
2. 提出 2-3 個最關鍵的問題，幫助團隊在開始之前釐清課題
3. 簡短說明你推薦的工作方式為什麼適合這個品牌現況

語氣：專業但有溫度，像真正帶過品牌的行銷人。用繁體中文回應。
長度：控制在 250 字內。${agentCtx.depthLabel}`;

      // Cross-provider fallback (Anthropic → Azure → OpenRouter) — Azure
      // alone returns DeploymentNotFound 404 when its deployment name is
      // stale, killing the squad. callLLM survives single-provider failures.
      const llmResult = await callLLM({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 1500,
        timeoutMs: 35_000,
      });
      const reply = llmResult.text;

      await db.execute(sql`
        INSERT INTO chat_messages (userId, missionId, role, content, conversationTitle, createdAt)
        VALUES (${ctx.user.id}, ${input.missionId}, 'assistant', ${reply}, ${leadName}, NOW())
      `);

      await db.execute(sql`
        UPDATE squad_sessions SET status = 'running', updated_at = NOW()
        WHERE squad_uid = ${input.squadUid} AND user_id = ${ctx.user.id}
      `);

      return {
        message:    reply,
        agentId:    sourceAgentId ?? null,
        agentName:  leadName,
        agentTitle: leadTitle,
        historyDepth: agentCtx.historyDepth,
        depthLabel:   agentCtx.depthLabel,
      };
    }),

  // ── getSessionStep ────────────────────────────────────────────────────────────
  // Returns the current step index for a mission's squad session.
  // Used by the right-panel sidebar to highlight the active agent / step
  // and to surface per-step conclusions on done steps.
  getSessionStep: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      phaseOrder: z.number().optional(), // Scheme B: defaults to 0 (intake / overall)
    }))
    .query(async ({ input }) => {
      try {
        const phaseOrder = input.phaseOrder ?? 0;
        const [rows] = await localPool.execute(
          `SELECT currentStep, squadSlug, status, stepResults
           FROM squad_chat_sessions
           WHERE missionId = ? AND phaseOrder = ? LIMIT 1`,
          [input.missionId, phaseOrder]
        ) as any[];
        const row = (rows as any[])?.[0];
        if (!row) {
          return {
            currentStep: 0,
            status: "intake" as const,
            found: false,
            stepResults: {} as Record<string, string>,
          };
        }
        // Parse stepResults JSON; stored as { [stepOrder: string]: "raw LLM output ≤2000 chars" }
        let stepResults: Record<string, string> = {};
        try {
          const raw = row.stepResults;
          if (raw) {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (parsed && typeof parsed === "object") stepResults = parsed;
          }
        } catch { /* leave empty */ }
        return {
          currentStep: Number(row.currentStep ?? 0),
          status: (row.status ?? "intake") as string,
          found: true,
          stepResults,
        };
      } catch {
        return {
          currentStep: 0,
          status: "intake" as const,
          found: false,
          stepResults: {} as Record<string, string>,
        };
      }
    }),

  // ── stepExecute ──────────────────────────────────────────────────────────────
  // Run ONE workflow step against the assigned agent, persist the draft to
  // mission_step_progress, return the output text. Powers the in-place
  // WorkflowRunner in PickerWorkspace (post-launch right pane).
  //
  // Behavior (B3 hybrid):
  //   - mode="ask": agent asks the user a clarifying question for this step
  //                  (used on step 1 to gather requirements). Returns a
  //                  question string; no draft persisted.
  //   - mode="run": agent generates the draft for this step using prev step
  //                  outputs + user's most recent input. Persists `output`
  //                  with status="drafted".
  //   - mode="confirm": user accepted the draft → status="confirmed".
  //
  // Storage: one row per (missionId, stepOrder) in mission_step_progress.
  stepExecute: protectedProcedure
    .input(z.object({
      missionId:  z.number(),
      squadSlug:  z.string(),
      stepOrder:  z.number(),
      mode:       z.enum(["ask", "run", "confirm", "skip", "unskip"]),
      userInput:  z.string().max(4000).optional().default(""),
      // CJ correction 2026-04-30: agents must read product + event positioning,
      // not just brand. Picker passes the active ScopeBar state through here
      // so prompts include the right Pokemon GO Dragon Community Day context
      // instead of generic Snorlax examples.
      scopeBrandId:   z.number().nullable().optional(),
      scopeProductId: z.number().nullable().optional(),
      scopeEventId:   z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      // Auto-create progress table on first use
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS mission_step_progress (
          id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
          mission_id   INT           NOT NULL,
          step_order   INT           NOT NULL,
          status       VARCHAR(20)   NOT NULL DEFAULT 'pending',
          user_input   TEXT,
          agent_output MEDIUMTEXT,
          agent_id     INT,
          agent_name   VARCHAR(120),
          history      JSON          NULL,
          updated_at   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                     ON UPDATE CURRENT_TIMESTAMP(3),
          UNIQUE KEY uniq_step (mission_id, step_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // Idempotent: add `history` column to existing tables (Sprint 1, E.undo).
      await db.execute(sql`
        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'mission_step_progress'
           AND COLUMN_NAME = 'history'
      `).then(async (res: any) => {
        const rows = Array.isArray(res) ? res[0] : res?.rows ?? res;
        const c = Number((rows as any[])?.[0]?.c ?? 0);
        if (c === 0) {
          await db.execute(sql`ALTER TABLE mission_step_progress ADD COLUMN history JSON NULL`);
        }
      }).catch(() => { /* already added or alter not allowed; ignore */ });

      // Auto-create overrides table — stores planner step decisions
      // (quantity per step, custom instructions, themes)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS mission_step_overrides (
          mission_id            INT           NOT NULL,
          step_order            INT           NOT NULL,
          override_name         VARCHAR(200)  NULL,
          override_instructions MEDIUMTEXT    NULL,
          quantity              INT           NOT NULL DEFAULT 1,
          themes                JSON          NULL,
          updated_at            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                             ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (mission_id, step_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `).catch(() => { /* table exists */ });

      // Load squad row + steps + agents (localPool — same shape as listByBrand)
      // 100s→99s rename compat: match both new ("fb-99-…") and legacy
      // ("fb-100-…") slug forms so historic DB rows still resolve.
      const stSlugNew = normalizeTaskId(input.squadSlug);
      const stSlugLegacy = legacyTaskId(stSlugNew);
      const stSlugs = stSlugLegacy ? [stSlugNew, stSlugLegacy] : [stSlugNew];
      const [sqRows] = await localPool.execute(
        `SELECT id, slug, name, agents, steps, methodology
           FROM squads WHERE slug IN (${stSlugs.map(() => "?").join(",")}) AND is_active = 1 LIMIT 1`,
        stSlugs,
      ) as any[];
      const squad = (sqRows as any[])?.[0];
      if (!squad) throw new TRPCError({ code: "NOT_FOUND", message: `squad slug ${input.squadSlug} not found` });

      const stepsRaw = safeJsonParse<any[]>(squad.steps, []);
      const step = stepsRaw.find((s: any) => Number(s.order ?? s.step) === input.stepOrder)
                ?? stepsRaw[input.stepOrder - 1];
      if (!step) throw new TRPCError({ code: "NOT_FOUND", message: `step ${input.stepOrder} not found` });

      // Resolve assigned agent
      const assignedId = step.assignedAgentId ? Number(step.assignedAgentId) : null;
      let agentRow: any = null;
      if (assignedId) {
        const [aRows] = await localPool.execute(
          `SELECT id, name, title, primarySkill, aiModel, specialty FROM agents WHERE id = ? LIMIT 1`,
          [assignedId],
        ) as any[];
        agentRow = (aRows as any[])?.[0] ?? null;
      }
      const agentName = agentRow?.name ?? step.assignedAgentName ?? "AI 專員";
      const agentTitle = agentRow?.title ?? "";
      const agentSkill = agentRow?.primarySkill ?? step.requiredSkill ?? "";
      const agentKnowledge = await loadAgentKnowledge(assignedId, { source: "squad.stepExecute" });

      // ── confirm: just flip status, no LLM ────────────────────────────────────
      if (input.mode === "confirm") {
        await db.execute(sql`
          UPDATE mission_step_progress
             SET status = 'confirmed'
           WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder}
        `);
        return { ok: true, status: "confirmed" as const };
      }

      // ── skip: mark step as skipped (no LLM, no chaining) ─────────────────────
      if (input.mode === "skip") {
        await db.execute(sql`
          INSERT INTO mission_step_progress
            (mission_id, step_order, status, agent_name, agent_output)
          VALUES (${input.missionId}, ${input.stepOrder}, 'skipped', '使用者跳過', '')
          ON DUPLICATE KEY UPDATE status = 'skipped'
        `);
        return { ok: true, status: "skipped" as const };
      }
      if (input.mode === "unskip") {
        await db.execute(sql`
          UPDATE mission_step_progress
             SET status = 'pending'
           WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder}
             AND status = 'skipped'
        `);
        return { ok: true, status: "pending" as const };
      }

      // ── Load previous step outputs for chaining context ──────────────────────
      const [prevRows] = await db.execute(sql`
        SELECT step_order, agent_output
          FROM mission_step_progress
         WHERE mission_id = ${input.missionId}
           AND step_order < ${input.stepOrder}
           AND status IN ('drafted', 'confirmed')
         ORDER BY step_order ASC
      `) as any[];
      const prevOutputs = (prevRows as any[]).map((r: any) =>
        `【Step ${r.step_order} 結果】\n${(r.agent_output ?? "").slice(0, 1500)}`
      ).join("\n\n");

      // Load planner override for this specific step (if a plan step ran earlier)
      let stepOverride: { override_name: string | null; override_instructions: string | null; quantity: number; themes: any } | null = null;
      try {
        const [overrideRows] = await db.execute(sql`
          SELECT override_name, override_instructions, quantity, themes
            FROM mission_step_overrides
           WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder}
           LIMIT 1
        `) as any[];
        const ov = (overrideRows as any[])[0];
        if (ov) {
          stepOverride = {
            override_name: ov.override_name ?? null,
            override_instructions: ov.override_instructions ?? null,
            quantity: Number(ov.quantity ?? 1),
            themes: safeJsonParse(ov.themes, null),
          };
        }
      } catch { /* overrides table may not exist yet on first run */ }

      // Mission context
      const [mRows] = await db.execute(sql`
        SELECT title, description, objective, audience, brandId FROM missions
         WHERE id = ${input.missionId} AND userId = ${ctx.user.id} LIMIT 1
      `) as any[];
      const mission = (mRows as any[])?.[0];
      const missionContext = mission
        ? `任務：${mission.title}${mission.description ? ` · ${mission.description}` : ""}`
        : "";

      // Scope context — brand + product + event positioning, all injected.
      // CJ feedback 2026-04-30: agent only had brand context, so when user
      // bound 「2026年五月單首龍經典社群日」 the post text still talked about
      // generic 野生卡比獸 instead of Dragon Community Day. Now we resolve
      // and inject all three layers when present, with explicit cascade
      // (event > product > brand) so the LLM knows which is the focus.
      const scopeBrandId   = input.scopeBrandId   ?? mission?.brandId ?? null;
      const scopeProductId = input.scopeProductId ?? null;
      const scopeEventId   = input.scopeEventId   ?? null;
      const contextParts: string[] = [];
      // 2026-09-29（CJ「onbrand 使用的 agent，生文前都要讀取策略層的內容」）：這裡
      // 原本讀舊的 positioningSummary、沒有就讀 description、再沒有才把定位 JSON
      // 整包截 800 字（產品 800、活動 1500）——99s squad 任務幾乎讀不到品牌大腦。
      // 改讀同一份品牌大腦（跟「檢查大腦」畫面同一份），產品／活動範圍一起帶。
      if (scopeBrandId) {
        const brandPrefix = await buildBrandPrefix(scopeBrandId, scopeProductId, scopeEventId, "full").catch(() => "");
        if (brandPrefix) contextParts.push(`【品牌大腦】${brandPrefix}`);
      }
      if (scopeEventId) {
        // Strong scope-anchor: tell the LLM the event is the FOCUS, brand is supporting.
        contextParts.push(
          `【重要】此 mission 的執行 scope 是上面這個「活動」。所有舉例、產品、受眾、主題、行動呼籲都必須緊扣這個活動本身（時間、主題、目標族群），禁止用品牌的通用範例（例如野生寶可夢一般介紹）取代活動的特定內容。如果你產出的內容換到品牌的其他活動也說得通，就是失敗。`,
        );
      }
      // 2026-09-07 執行層方案閘門。放在下面那個 try 之前 —— 那個 try 是 scout
      // 資料注入，錯誤會被吞掉，閘門丟出的 FORBIDDEN 若在裡面會被當成注入失敗。
      await assertTaskAllowed({
        userId: ctx.user!.id,
        brandId: input.scopeBrandId ?? null,
        info: await squadGateInfo(input.squadSlug),
      });

      // ── 100s tier: inject real-time scout data (festivals / trending / news) ─
      // For squad slugs in our 100s pool, fetch real market data via Tavily/
      // Gemini and inject as context. Cached 5 min per (slug, brandId) to
      // avoid hitting the API on every step. Per CJ direction: 100s squads
      // must have actual market data, not just LLM internal knowledge.
      try {
        const { ALL_99S_SQUADS } = await import("../../core/catalog/quickTask100Squads");
        const matched = ALL_99S_SQUADS.find((s) => s.squad_slug === normalizeTaskId(input.squadSlug));
        if (matched) {
          const { fetchViralPatterns, formatViralPatternsForPrompt } = await import("../../../strategy/core/monitor/socialListeningScout");
          // Decide kind from squad slug pattern
          const kind: "festivals" | "trending" | "news" | "viral" =
            matched.squad_slug.includes("monthly-calendar") || matched.squad_slug.includes("countdown") ? "festivals"
            : matched.squad_slug.includes("crisis") || matched.squad_slug.includes("kern-mass-control") ? "trending"
            : matched.squad_slug.includes("quarterly") || matched.squad_slug.includes("analytics") || matched.squad_slug.includes("reposition") ? "news"
            : "viral";
          // Use mission-level cache key
          const cacheKey = `__scout_${input.squadSlug}_${scopeBrandId ?? 0}`;
          const cached = (globalThis as any)[cacheKey];
          let viral = cached?.data;
          const cacheAge = cached ? Date.now() - cached.ts : Infinity;
          if (!viral || cacheAge > 5 * 60_000) {
            const topic = `${typeof matched.label === "string" ? matched.label : matched.label.zh} ${mission?.title ?? ""}`.slice(0, 120);
            viral = await fetchViralPatterns({
              channel: matched.platform,
              topic,
              brandId: scopeBrandId ?? undefined,
              kind,
            });
            (globalThis as any)[cacheKey] = { data: viral, ts: Date.now() };
          }
          if (viral && viral.patterns.length > 0) {
            contextParts.push(formatViralPatternsForPrompt(viral, kind));
          }
        }
      } catch (e) {
        // Scout failure non-fatal — squad still runs with brand context only
        console.log(`[100s scout] non-fatal: ${(e as Error)?.message}`);
      }

      const brandContext = contextParts.join("\n\n");

      const stepName = step.name ?? step.title ?? `Step ${input.stepOrder}`;
      const stepDesc = step.description ?? "";
      const outputType = step.outputType ?? step.output ?? "";

      // ── ask: agent asks 1–3 clarifying questions for this step ───────────────
      if (input.mode === "ask") {
        const systemPrompt = `你是 ${agentName}${agentTitle ? `（${agentTitle}）` : ""}，專長：${agentSkill}。
${agentKnowledge ? `\n${agentKnowledge}\n` : ""}你即將執行「${stepName}」這個步驟。先用使用者聽得懂的話，提出 1–3 個最關鍵的問題，幫你完成這一步。
語氣專業但溫暖，像真正帶過品牌的行銷顧問。用繁體中文。控制在 200 字內。`;
        const userPrompt = `${missionContext}
${brandContext}
方法論：${typeof squad.methodology === "string" ? squad.methodology : (squad.methodology?.author ?? "")}
此步驟說明：${stepDesc || "(無)"}
預期產出：${outputType || "(未指定)"}
${prevOutputs ? `\n前面步驟的成果：\n${prevOutputs}` : ""}
請只輸出問題本身，不要前言、不要編號以外的客套話。`;

        // Cross-provider fallback (Anthropic → Azure → OpenRouter) so a stale
        // Azure deployment can't single-handedly kill the squad.
        const llm = await callLLM({
          system: systemPrompt,
          user: userPrompt,
          maxTokens: 800,
          timeoutMs: 35_000,
        });
        const reply = llm.text;

        await db.execute(sql`
          INSERT INTO mission_step_progress
            (mission_id, step_order, status, agent_id, agent_name, agent_output)
          VALUES
            (${input.missionId}, ${input.stepOrder}, 'asking',
             ${assignedId ?? null}, ${agentName}, ${reply})
          ON DUPLICATE KEY UPDATE
            status = 'asking', agent_output = VALUES(agent_output),
            agent_id = VALUES(agent_id), agent_name = VALUES(agent_name)
        `);

        return {
          ok: true,
          status: "asking" as const,
          agentName, agentTitle, agentSkill,
          stepName, stepDesc, outputType,
          message: reply,
        };
      }

      // ── run: produce the draft for this step ─────────────────────────────────
      // Detect output kind from outputType keywords so we can give targeted guidance.
      // Explicit `outputKind` on the step or its assigned agent wins over keyword regex.
      const explicitKind = String((step as any).outputKind ?? (step as any).assignedAgent?.outputKind ?? "").toLowerCase();
      const ot = (outputType || "").toLowerCase();
      // Visual steps: detect first so we don't mis-label as content.
      const isVisual = explicitKind === "image" || explicitKind === "video"
        || /\b(image|visual|kv|banner|thumbnail|cover|carousel|poster|logo|illustration|video|reel|short|tvc|footage|clip|i2v|t2v|motion|spokesperson)\b/i.test(`${ot} ${stepName}`)
        || /(圖像|視覺|主視覺|封面|縮圖|海報|插畫|圖卡|圖文|圖示|影片|短片|短影音|動畫|動態)/.test(`${ot} ${stepName}`);
      const isContent = !isVisual && (
        /caption|post|copy|hook|hashtag|tag\b|tags|article|newsletter|tweet|script|story|title|headline|description|email|edm|長文|貼文|文案|hashtag|腳本|標題|簡介|文/i.test(ot)
        || /caption|post|copy|hook|hashtag|article|新聞稿|長文|貼文|文案|腳本|標題/i.test(stepName)
      );
      const isStrategic = !isVisual && !isContent &&
        /swot|persona|icp|research|analysis|brand|context|interview|competitor|strategy|plan|brief|outline|framework|insight|positioning|methodology|doc|report|matrix|mapping|journey|研究|分析|策略|框架|計畫|報告|訪談|競品|定位|脈絡|洞察|矩陣|藍圖/i.test(`${ot} ${stepName}`);

      // Plan step: agent reads all context and outputs an execution plan JSON.
      // Detected via explicit outputKind="plan" OR step name keywords.
      const isPlanStep = explicitKind === "plan"
        || /^plan$/i.test(outputType)
        || /執行計畫|execution.?plan|動態計畫|planner/i.test(`${ot} ${stepName}`);

      // ── Visual step short-circuit: agent produces the visual BRIEF only.
      // The actual image/video is generated client-side via the 3-step
      // MediaGenFlow (設計方向 → AI prompt → 模型選擇) — server must NOT
      // call image APIs here, that violates CJ's rule "由用戶在 Step 3 挑模型".
      // Detect a "media completion" payload coming back via userInput when
      // MediaGenFlow finishes — that arrives as `__media_url__: ...` and we
      // store as-is so subsequent steps can reference it.
      if (isVisual && /^__media_url__:/m.test(input.userInput || "")) {
        // Persist the media completion as the confirmed output for this step.
        await db.execute(sql`
          INSERT INTO mission_step_progress
            (mission_id, step_order, status, user_input, agent_output, agent_id, agent_name)
          VALUES
            (${input.missionId}, ${input.stepOrder}, 'drafted',
             ${input.userInput}, ${input.userInput},
             ${assignedId ?? null}, ${agentName})
          ON DUPLICATE KEY UPDATE
            status = 'drafted',
            user_input = VALUES(user_input),
            agent_output = VALUES(agent_output)
        `);
        return {
          ok: true, status: "drafted" as const,
          agentName, agentTitle, agentSkill, stepName, stepDesc, outputType,
          output: input.userInput,
        };
      }

      const outputGuide = isVisual
        ? `這是「視覺素材類」交付物 — 你的工作是寫出【視覺 brief】，不是真的生成圖像 / 影片。
- 用繁體中文描述這個畫面 / 影片要呈現什麼：主體、構圖、色彩、情緒、風格參考
- 如果是影片，再加上分鏡（每個鏡頭的時長 / 鏡頭運動 / 主體動作）
- 不要寫「我會這樣做」，直接寫「這個畫面是…」、「鏡頭一：…」
- 寫 3-6 句即可。後面用戶會看著這個 brief，在 3-step 流程裡進一步選方向、寫 AI prompt、挑模型生成
- 禁止輸出 Markdown code block 或 prompt template；就是純自然語言 brief`
        : isContent
        ? `這是「內容類」交付物 — 你交出的東西要可以直接複製貼上到平台發出去。

【嚴格禁止 — 違反任一條都算失敗】
✗ 禁止 markdown 標題符號（# ## ### 等）— 用戶會直接複製到 Facebook 貼文，井字號是雜訊
✗ 禁止內部標籤 / 步驟名稱（例如「Jab 1: 教育型貼文文案」、「Step 3 文案」、「貼文 1：...」）— 那是內部使用，不該出現在貼文內
✗ 禁止前言 / 解釋 / 開場白（「以下是...」、「我會這樣寫：」、「這篇貼文的目的是...」）— 直接交付貼文本體
✗ 禁止 markdown 條列符號（- *）混在文案中 — 用 emoji 或編號，不要 markdown 語法
✗ 禁止 hashtag 出現在貼文上半段 — 結尾才放，純 #tag 列表

【正確輸出 — 直接是 Facebook / IG / TikTok 用戶看到的那行字】
✓ 第一行就是 hook（吸睛句）+ emoji
✓ 中段：產品/活動賣點 + 受眾為什麼在乎
✓ 結尾：CTA + 連結佔位符 + 3-5 個 hashtag
✓ 換行用真實換行符（\\n），不是 <br> 也不是 markdown
✓ 如果產出是「圖文」、「視覺」、「縮圖」等視覺素材，請寫具體的圖片描述（讓 AI 繪圖工具可以根據此描述產圖）`
        : isStrategic
        ? `這是「策略 / 文件類」交付物 — 寫出完整的成品文件，不是「我會這樣做」的說明。
- 用 markdown 結構（## 大標 / - 條列）
- 每個段落要寫具體內容，不是描述「我會做什麼」
- 例如要做 SWOT 就直接寫 4 格的具體內容；要做 Persona 就直接寫角色檔案`
        : isPlanStep
        ? `這是「執行計畫」步驟 — 你需要讀取上游所有輸出（品牌研究、策略文件、用戶摘要），制定出後續步驟的具體執行計畫。

輸出格式：嚴格輸出 JSON，格式如下：
{
  "plan": [
    {
      "step_order": <整數，對應此 squad 的後續步驟順序>,
      "name": "<此步驟的具體名稱，例如『Dragon Day 教育型貼文 - 活動攻略篇』>",
      "quantity": <整數，要產出幾個版本，通常 1-3>,
      "theme": "<主題摘要，一句話>",
      "instructions": "<給執行 agent 的詳細指示，包含：主題、TA、CTA、必須提及的活動細節、禁忌事項>"
    }
  ],
  "summary": "<用一段話說明你的計畫邏輯，給用戶看的>"
}

規則：
- 只計劃你認為真正需要的步驟（可以比 squad 預設少）
- quantity 最多 3，如果策略說「3 篇貼文」就對那個步驟設 quantity=3
- instructions 要夠詳細，讓 agent 不需要回頭看策略就能執行
- 如果策略已確認了具體的發文主題、日期、TA，一定要寫進 instructions`
        : `直接寫出成品內容，不要寫「我會...」這種方法論說明。`;

      const systemPrompt = `你是 ${agentName}${agentTitle ? `（${agentTitle}）` : ""}，專長：${agentSkill}。
${agentKnowledge ? `\n${agentKnowledge}\n` : ""}你正在執行「${stepName}」步驟。

【最高優先規則】直接交付完成品本身。
✗ 錯誤輸出（寫方法論）：「先抓住眼球的 hook，再帶出產品價值，最後 CTA」
✓ 正確輸出（寫成品）：「夏天還在悶熱中？這雙鞋讓你帶著風走 ☀️ / Air Mesh 透氣科技 + 反光防滑底 / 限時 9 折，只到週日！👉 連結見 bio」

✗ 錯誤輸出（寫方法論）：「定位的 5 個維度是：產品、TA、競爭、價值、人格」
✓ 正確輸出（寫成品）：「## 品牌定位\\nNIKE 是運動員突破自我的盟友。\\n## 目標 TA\\n18-34 歲都會運動者...」

${outputGuide}

用繁體中文。產出類型：${outputType || "適中"}。
${brandContext ? `\n【強制】這一步是為以下品牌服務，所有舉例、語氣、產品、受眾都必須緊扣這個品牌，禁止通用範本：\n${brandContext}\n如果你產出的內容換到別的品牌也成立，就是失敗。` : `\n【警告】此任務沒有綁定品牌，請提示使用者先到右上角選擇品牌再執行。`}`;

      const targetQuantity = stepOverride?.quantity ?? 1;
      const quantityGuide = targetQuantity > 1
        ? `\n【重要】請產出 ${targetQuantity} 個獨立版本的完整內容。每個版本之間用「---VERSION---」這個分隔符隔開（單獨一行）。版本之間不要有編號前言，直接是第一個版本的內容，分隔符，第二個版本的內容。`
        : "";

      const userPrompt = `${missionContext}
${brandContext ? `\n${brandContext}\n` : ""}
方法論參考：${typeof squad.methodology === "string" ? squad.methodology : (squad.methodology?.author ?? "")}
此步驟說明：${stepOverride?.override_name ?? stepDesc ?? stepName}
預期產出類型：${outputType || "(未指定)"}
${stepOverride?.override_instructions ? `\n【執行計畫指示】（優先遵從）：\n${stepOverride.override_instructions}` : ""}
${prevOutputs ? `\n上游步驟成果（直接接續使用，不要重述）：\n${prevOutputs}` : ""}
${input.userInput ? `\n使用者補充：\n${input.userInput}` : ""}
${quantityGuide}

請直接交付【成品內容】 — 不是「我會這樣做」的說明。所有舉例必須來自上面這個 scope（活動 > 產品 > 品牌 cascade）的真實內容；如果有【活動】，舉例必須緊扣此活動的時間 / 主題 / TA / 商品 / CTA，不要拿品牌的其他活動或泛用例子代替。
若產出類型是貼文文案：禁止 markdown 標題符號（#）、禁止內部標籤（Jab 1: / Step 1:）、禁止前言。直接從第一句開始寫貼文本體。`;

      // Cross-provider fallback — Azure-only invokeLLM throws DeploymentNotFound
      // when the deployment name drifts. callLLM falls back to Anthropic /
      // OpenRouter / Foundry so a single bad provider can't block the squad.
      const llm = await callLLM({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 3000,
        timeoutMs: 35_000,
      });
      // 2026-09-29：squad 步驟產出也過禁用詞／替換對照（以前只有 orchestra 有）。
      const rawOutput = scopeBrandId
        ? await enforceBrandRulesOnText(scopeBrandId, llm.text).catch(() => llm.text)
        : llm.text;

      // Defensive cleanup for content-type outputs — strip markdown headers
      // and internal section labels even when the LLM ignores the prompt.
      // Strategic / brief outputs keep their markdown structure intact.
      const stripContentArtifacts = (s: string): string => {
        return s
          // Drop "Jab 1: ...", "Step 3: ...", "貼文 1：..." style internal labels
          // appearing as their own line at the start.
          .replace(/^\s*(?:#\s*)?(?:Jab|Step|貼文|Post)\s*\d+\s*[:：][^\n]*\n+/gi, "")
          // Strip leading markdown headers that snuck into a content post
          // (#, ##, ### at the start of a line).
          .replace(/^#{1,6}\s+/gm, "")
          // Strip "以下是..." / "這是..." / "我會..." prefaces on the first line.
          .replace(/^(?:以下(?:是|為)|這(?:是|篇是)|我(?:會|將)|這篇貼文(?:的目的)?是)[^\n]*\n+/m, "")
          .trim();
      };
      let output = isContent ? stripContentArtifacts(rawOutput) : rawOutput;
      // 2026-09-30（CJ「後製路徑也要合規檢查」）：會被發出去的貼文類步驟過法規合規檢查；
      // 策略／brief 類步驟是內部文件，不檢查。品牌沒有法規就不跑。
      let regulationCompliance: import("../../core/engine/regulationCompliance").RegulationComplianceRecord | null = null;
      if (isContent && scopeBrandId && output.trim()) {
        const { enforceRegulationsOnText } = await import("../../core/engine/regulationCompliance");
        const reg = await enforceRegulationsOnText(scopeBrandId, output);
        regulationCompliance = reg.record;
        if (reg.record?.status === "fixed") {
          output = await enforceBrandRulesOnText(scopeBrandId, reg.text).catch(() => reg.text);
        }
      }

      // ── Plan step: parse JSON output → write mission_step_overrides ──────────
      if (isPlanStep) {
        try {
          const cleaned = output.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          const planJson = JSON.parse(cleaned);
          const planItems: any[] = Array.isArray(planJson.plan) ? planJson.plan : (Array.isArray(planJson) ? planJson : []);
          for (const item of planItems) {
            const so = Number(item.step_order);
            if (!so || isNaN(so)) continue;
            await db.execute(sql`
              INSERT INTO mission_step_overrides
                (mission_id, step_order, override_name, override_instructions, quantity, themes)
              VALUES
                (${input.missionId}, ${so},
                 ${item.name ?? null},
                 ${item.instructions ?? null},
                 ${Math.min(Math.max(Number(item.quantity ?? 1), 1), 5)},
                 ${item.theme ? JSON.stringify({ theme: item.theme }) : null})
              ON DUPLICATE KEY UPDATE
                override_name = VALUES(override_name),
                override_instructions = VALUES(override_instructions),
                quantity = VALUES(quantity),
                themes = VALUES(themes)
            `).catch((e: any) => console.warn("[planStep] override upsert failed:", e?.message));
          }
          // Keep the plan output readable for the user (use summary + pretty JSON)
          if (planJson.summary) {
            output = `## 執行計畫摘要\n${planJson.summary}\n\n## 詳細計畫\n\`\`\`json\n${JSON.stringify(planJson, null, 2)}\n\`\`\``;
          }
        } catch (e) {
          console.warn("[planStep] failed to parse plan JSON:", (e as Error).message);
        }
      }

      // ── Multi-version: if quantity > 1, split by separator → JSON ───────────
      const targetQty = stepOverride?.quantity ?? 1;
      if (!isPlanStep && targetQty > 1) {
        const parts = output.split(/^---VERSION---$/m).map((p: string) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          output = JSON.stringify({ __versions__: true, items: parts });
        }
        // If LLM didn't use separators but we expected multiple, keep raw output as single version
      }

      // Push the previous draft (if any) into history so the user can undo.
      // history is a JSON array of { output, userInput, ts }.
      const [existRows] = await db.execute(sql`
        SELECT agent_output, user_input, history FROM mission_step_progress
         WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder} LIMIT 1
      `) as any[];
      const exist = (existRows as any[])?.[0];
      let nextHistory: any[] = [];
      if (exist?.agent_output) {
        const prevHist = safeJsonParse<any[]>(exist.history, []);
        nextHistory = [
          ...prevHist,
          { output: exist.agent_output, userInput: exist.user_input, ts: new Date().toISOString() },
        ].slice(-10); // cap at last 10 versions
      }

      await db.execute(sql`
        INSERT INTO mission_step_progress
          (mission_id, step_order, status, user_input, agent_output, agent_id, agent_name, history)
        VALUES
          (${input.missionId}, ${input.stepOrder}, 'drafted',
           ${input.userInput || null}, ${output},
           ${assignedId ?? null}, ${agentName},
           ${JSON.stringify(nextHistory)})
        ON DUPLICATE KEY UPDATE
          status = 'drafted',
          user_input = VALUES(user_input),
          agent_output = VALUES(agent_output),
          agent_id = VALUES(agent_id),
          agent_name = VALUES(agent_name),
          history = VALUES(history)
      `);

      return {
        ok: true,
        status: "drafted" as const,
        agentName, agentTitle, agentSkill,
        stepName, stepDesc, outputType,
        output,
        regulationCompliance,
      };
    }),

  // ── stepGetProgress ──────────────────────────────────────────────────────────
  // Read all step rows for a mission. Powers the WorkflowRunner timeline so
  // it can re-hydrate state on page reload (e.g. user shares /picker?mission=).
  stepGetProgress: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const [rows] = await db.execute(sql`
          SELECT step_order, status, user_input, agent_output, agent_name, history, updated_at
            FROM mission_step_progress
           WHERE mission_id = ${input.missionId}
           ORDER BY step_order ASC
        `) as any[];
        return (rows as any[]).map((r: any) => {
          const hist = safeJsonParse<any[]>(r.history, []);
          return {
            stepOrder:   Number(r.step_order),
            status:      String(r.status) as "asking" | "drafted" | "confirmed" | "pending",
            userInput:   r.user_input ?? "",
            agentOutput: r.agent_output ?? "",
            agentName:   r.agent_name ?? "",
            historyCount: Array.isArray(hist) ? hist.length : 0,
            updatedAt:   r.updated_at,
          };
        });
      } catch {
        return []; // table may not exist yet
      }
    }),

  // ── stepUndo ─────────────────────────────────────────────────────────────────
  // Pop the last history entry back into agent_output. Powers the "↶ 上一版"
  // button. No-op (return ok:false) if history is empty.
  stepUndo: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      stepOrder: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const [rows] = await db.execute(sql`
        SELECT agent_output, user_input, history FROM mission_step_progress
         WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder} LIMIT 1
      `) as any[];
      const row = (rows as any[])?.[0];
      if (!row) return { ok: false, reason: "no-row" as const };

      const hist = safeJsonParse<any[]>(row.history, []);
      if (!Array.isArray(hist) || hist.length === 0) {
        return { ok: false, reason: "no-history" as const };
      }
      const last = hist[hist.length - 1];
      const remaining = hist.slice(0, -1);

      await db.execute(sql`
        UPDATE mission_step_progress
           SET agent_output = ${last.output ?? ""},
               user_input   = ${last.userInput ?? null},
               history      = ${JSON.stringify(remaining)},
               status       = 'drafted'
         WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder}
      `);
      return { ok: true, output: String(last.output ?? "") };
    }),

  // ── stepEditOutput ───────────────────────────────────────────────────────────
  // Manual user edit of agent_output. Pushes the previous version into history
  // (so undo still works). CJ direction 2026-04-30: 用戶要能逐字修改 agent
  // 寫的貼文文案，不能只是看著沒辦法改。
  stepEditOutput: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      stepOrder: z.number(),
      output:    z.string().max(20_000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      // Push current output into history before overwriting (so 上一版 keeps working)
      const [rows] = await db.execute(sql`
        SELECT agent_output, user_input, history FROM mission_step_progress
         WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder} LIMIT 1
      `) as any[];
      const row = (rows as any[])?.[0];
      if (!row) {
        // No row yet → create it as a manual draft
        await db.execute(sql`
          INSERT INTO mission_step_progress
            (mission_id, step_order, status, agent_output, agent_name, history)
          VALUES
            (${input.missionId}, ${input.stepOrder}, 'drafted',
             ${input.output}, '使用者手動編輯', '[]')
          ON DUPLICATE KEY UPDATE
            status = 'drafted',
            agent_output = VALUES(agent_output),
            history = VALUES(history)
        `);
        return { ok: true, output: input.output };
      }
      const prevHist = safeJsonParse<any[]>(row.history, []);
      const nextHistory = row.agent_output
        ? [...prevHist, { output: row.agent_output, userInput: row.user_input, ts: new Date().toISOString(), source: "pre-edit" }].slice(-10)
        : prevHist;

      await db.execute(sql`
        UPDATE mission_step_progress
           SET agent_output = ${input.output},
               history      = ${JSON.stringify(nextHistory)},
               status       = 'drafted'
         WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder}
      `);
      return { ok: true, output: input.output };
    }),

  // ── askMary ──────────────────────────────────────────────────────────────────
  // Floating "問 Mary Allen" helper. Mary is the brand-strategy spokesperson
  // — given the mission's full step progress + brand context, she answers a
  // freeform user question about the run (e.g. "this step seems weak, why?",
  // "summarize what we have so far", "should we pivot the angle?").
  // Stateless: each call rebuilds context from DB. No history persisted yet
  // (drawer keeps it in client memory until refresh).
  askMary: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      question:  z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      // Mission + brand
      const [mRows] = await db.execute(sql`
        SELECT id, title, description, brandId, methodology FROM missions
         WHERE id = ${input.missionId} AND userId = ${ctx.user.id} LIMIT 1
      `) as any[];
      const mission = (mRows as any[])?.[0];
      if (!mission) throw new TRPCError({ code: "NOT_FOUND", message: "mission not found" });

      let brandLine = "";
      if (mission.brandId) {
        const [bRows] = await db.execute(sql`
          SELECT name, industry, positioningSummary FROM brands WHERE id = ${mission.brandId} LIMIT 1
        `) as any[];
        const b = (bRows as any[])?.[0];
        if (b) brandLine = `品牌：${b.name}${b.industry ? `（${b.industry}）` : ""}`;
        // 2026-09-29：以前只給舊的 positioningSummary 300 字；改帶同一份品牌大腦。
        const brain = await buildBrandPrefix(Number(mission.brandId), null, null, "full").catch(() => "");
        if (brain) brandLine += `\n【品牌大腦】${brain}`;
      }

      // Step progress
      const [pRows] = await db.execute(sql`
        SELECT step_order, status, agent_name, agent_output FROM mission_step_progress
         WHERE mission_id = ${input.missionId}
         ORDER BY step_order ASC
      `) as any[];
      const progress = (pRows as any[]) ?? [];
      const progressLines = progress.map((r: any) => {
        const o = String(r.agent_output ?? "").slice(0, 600);
        return `[Step ${r.step_order} · ${r.status} · ${r.agent_name ?? ""}]\n${o}`;
      }).join("\n\n");

      const systemPrompt = `你是 Mary Allen，SoWork 的品牌策略召集人。語氣專業、誠實、不繞圈。
你正在陪一個團隊跑一個 marketing mission。使用者會問你關於這個任務的事 ——
你要根據目前的進度與品牌資訊作答，不要憑空編造。
回答用繁體中文，控制在 250 字內。如果答案需要看更多資料，明確說「我需要先看 Step X」。`;
      const userPrompt = `${brandLine}
任務：${mission.title}${mission.description ? ` · ${mission.description}` : ""}
方法論：${mission.methodology ?? "(未指定)"}

目前進度：
${progressLines || "(還沒有任何步驟產出)"}

使用者的問題：
${input.question}`;

      // Cross-provider fallback so squad-lead Q&A survives single-provider outages.
      const llm = await callLLM({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 1500,
        timeoutMs: 35_000,
      });
      const answer = llm.text;
      return { ok: true, answer };
    }),
};
