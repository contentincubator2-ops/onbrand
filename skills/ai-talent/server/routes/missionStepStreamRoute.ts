/**
 * missionStepStreamRoute — SSE streaming version of squad.stepExecute
 *
 * POST /api/missions/step-stream
 *
 * Body:
 *   { missionId, squadSlug, stepOrder, userInput?, scopeBrandId?, scopeProductId?, scopeEventId? }
 *
 * SSE events:
 *   step_start  { stepOrder, stepName, agentName, agentTitle, agentSkill, totalSteps }
 *   delta       { text }           — streaming token
 *   step_done   { stepOrder, output, status }  — full output saved to DB
 *   error       { message }
 *
 * Replaces the non-streaming callLLM inside stepExecute for mode="run".
 * Confirm / skip still go through the existing tRPC stepExecute mutation.
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env.js";
import localPool from "../localDb.js";
import { loadAgentKnowledge } from "../_core/agentKnowledge.js";
import { invokeLLMStream } from "../_core/llm.js";
import { getDb } from "../db.js";
import { sql } from "drizzle-orm";

export const missionStepStreamRouter = Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
async function verifyToken(req: Request): Promise<number | null> {
  const auth = req.headers.authorization;
  let raw: string | null = null;
  if (auth?.startsWith("Bearer ")) raw = auth.slice(7);
  else if ((req as any).cookies?.session) raw = (req as any).cookies.session;
  if (!raw) return null;
  try {
    const secret = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(raw, secret);
    return payload.sub ? parseInt(String(payload.sub), 10) : null;
  } catch { return null; }
}

function safeJson<T>(val: unknown, fallback: T): T {
  if (!val) return fallback;
  try {
    const p = typeof val === "string" ? JSON.parse(val) : val;
    return (Array.isArray(p) === Array.isArray(fallback) ? p : fallback) as T;
  } catch { return fallback; }
}

// ── Main streaming endpoint ───────────────────────────────────────────────────
missionStepStreamRouter.post("/step-stream", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    missionId, squadSlug, stepOrder,
    userInput = "",
    scopeBrandId, scopeProductId, scopeEventId,
  } = req.body as {
    missionId: number;
    squadSlug: string;
    stepOrder: number;
    userInput?: string;
    scopeBrandId?: number | null;
    scopeProductId?: number | null;
    scopeEventId?: number | null;
  };

  if (!missionId || !squadSlug || !stepOrder) {
    res.status(400).json({ error: "missionId, squadSlug, stepOrder required" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    } catch { /* disconnected */ }
  };

  const keepalive = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); }
  }, 15_000);

  try {
    const db = await getDb();

    // ── Load squad + step ──────────────────────────────────────────────────
    const [sqRows] = await localPool.execute(
      `SELECT id, name, agents, steps, methodology FROM squads WHERE slug = ? AND is_active = 1 LIMIT 1`,
      [squadSlug],
    ) as any[];
    const squad = (sqRows as any[])?.[0];
    if (!squad) { send("error", { message: `Squad not found: ${squadSlug}` }); res.end(); return; }

    const stepsRaw = safeJson<any[]>(squad.steps, []);
    const totalSteps = stepsRaw.length;
    const step = stepsRaw.find((s: any) => Number(s.order ?? s.step) === stepOrder) ?? stepsRaw[stepOrder - 1];
    if (!step) { send("error", { message: `Step ${stepOrder} not found` }); res.end(); return; }

    // ── Resolve agent ──────────────────────────────────────────────────────
    const assignedId = step.assignedAgentId ? Number(step.assignedAgentId) : null;
    let agentRow: any = null;
    if (assignedId) {
      const [aRows] = await localPool.execute(
        `SELECT id, name, title, primarySkill FROM agents WHERE id = ? LIMIT 1`,
        [assignedId],
      ) as any[];
      agentRow = (aRows as any[])?.[0] ?? null;
    }
    const agentName  = agentRow?.name ?? step.assignedAgentName ?? "AI 專員";
    const agentTitle = agentRow?.title ?? "";
    const agentSkill = agentRow?.primarySkill ?? step.requiredSkill ?? "";
    const agentKnowledge = await loadAgentKnowledge(assignedId);
    const stepName   = step.name ?? step.title ?? `Step ${stepOrder}`;
    const stepDesc   = step.description ?? "";
    const outputType = step.outputType ?? step.output ?? "";

    send("step_start", { stepOrder, stepName, agentName, agentTitle, agentSkill, totalSteps });

    // ── Load previous step outputs ─────────────────────────────────────────
    if (!db) throw new Error("DB not available");
    const [prevRows] = await db.execute(sql`
      SELECT step_order, agent_output FROM mission_step_progress
       WHERE mission_id = ${missionId}
         AND step_order < ${stepOrder}
         AND status IN ('drafted', 'confirmed')
       ORDER BY step_order ASC
    `) as any[];
    const prevOutputs = (prevRows as any[]).map((r: any) =>
      `【Step ${r.step_order} 結果】\n${(r.agent_output ?? "").slice(0, 1500)}`
    ).join("\n\n");

    // ── Mission context ────────────────────────────────────────────────────
    const [mRows] = await db.execute(sql`
      SELECT title, description, brandId FROM missions WHERE id = ${missionId} LIMIT 1
    `) as any[];
    const mission = (mRows as any[])?.[0];
    const missionContext = mission
      ? `任務：${mission.title}${mission.description ? ` · ${mission.description}` : ""}`
      : "";

    // ── Scope context (brand → product → event cascade) ───────────────────
    const effectiveBrandId = scopeBrandId ?? mission?.brandId ?? null;
    const contextParts: string[] = [];

    if (effectiveBrandId) {
      const [bRows] = await db.execute(sql`
        SELECT name, industry, description, positioningSummary, positioning
          FROM brands WHERE id = ${effectiveBrandId} LIMIT 1
      `) as any[];
      const brand = (bRows as any[])?.[0];
      if (brand) {
        const sub: string[] = [`【品牌】${brand.name}${brand.industry ? `（${brand.industry}）` : ""}`];
        if (brand.positioningSummary) sub.push(`品牌定位：${String(brand.positioningSummary).slice(0, 600)}`);
        else if (brand.description) sub.push(`品牌描述：${String(brand.description).slice(0, 400)}`);
        contextParts.push(sub.join("\n"));
      }
    }
    if (scopeProductId) {
      const [pRows] = await localPool.execute(
        `SELECT name, positioning FROM products WHERE id = ? LIMIT 1`, [scopeProductId],
      ) as any[];
      const product = (pRows as any[])?.[0];
      if (product) {
        const pos = typeof product.positioning === "string" ? product.positioning : (product.positioning ? JSON.stringify(product.positioning) : "");
        contextParts.push(`【產品】${product.name}${pos ? `\n產品定位：${pos.slice(0, 800)}` : ""}`);
      }
    }
    if (scopeEventId) {
      const [eRows] = await localPool.execute(
        `SELECT name, startAt, endAt, positioning FROM events WHERE id = ? LIMIT 1`, [scopeEventId],
      ) as any[];
      const ev = (eRows as any[])?.[0];
      if (ev) {
        const period = ev.startAt ? `${String(ev.startAt).split("T")[0]} ~ ${String(ev.endAt ?? "").split("T")[0]}` : "（無日期）";
        const pos = typeof ev.positioning === "string" ? ev.positioning : (ev.positioning ? JSON.stringify(ev.positioning) : "");
        contextParts.push(`【活動】${ev.name}（期間 ${period}）\n${pos ? `活動定位：${pos.slice(0, 1500)}` : "活動定位：（未填）"}`);
        contextParts.push(`【重要】此 mission 的執行 scope 是上面這個「活動」。所有舉例、產品、受眾、主題、行動呼籲都必須緊扣這個活動本身，禁止用品牌的通用範例取代活動的特定內容。`);
      }
    }
    const brandContext = contextParts.join("\n\n");

    // ── Step kind detection ────────────────────────────────────────────────
    const ot = (outputType || "").toLowerCase();
    const explicitKind = String((step as any).outputKind ?? "").toLowerCase();
    const isVisual = explicitKind === "image" || explicitKind === "video"
      || /\b(image|visual|banner|thumbnail|cover|poster|video|reel|short)\b/i.test(`${ot} ${stepName}`)
      || /(圖像|視覺|主視覺|封面|海報|影片|短片|短影音)/.test(`${ot} ${stepName}`);
    const isContent = !isVisual && (
      /caption|post|copy|hook|hashtag|article|script|title|headline|description|email|edm|貼文|文案|腳本|標題/i.test(ot)
      || /caption|post|copy|hook|hashtag|article|貼文|文案|腳本|標題/i.test(stepName)
    );
    const isStrategic = !isVisual && !isContent &&
      /swot|persona|research|analysis|brand|strategy|plan|report|insight|positioning|研究|分析|策略|框架|計畫|報告|競品|定位/i.test(`${ot} ${stepName}`);

    const outputGuide = isVisual
      ? `這是「視覺素材類」交付物 — 你的工作是寫出【視覺 brief】，不是真的生成圖像 / 影片。
- 用繁體中文描述這個畫面 / 影片要呈現什麼：主體、構圖、色彩、情緒、風格參考
- 如果是影片，再加上分鏡（每個鏡頭的時長 / 鏡頭運動 / 主體動作）
- 不要寫「我會這樣做」，直接寫「這個畫面是…」、「鏡頭一：…」
- 寫 3-6 句即可。`
      : isContent
      ? `這是「內容類」交付物 — 你交出的東西要可以直接複製貼上到平台發出去。
✗ 禁止 markdown 標題符號（# ## ###）
✗ 禁止內部標籤（Jab 1: / Step N:）
✗ 禁止前言 / 解釋
✓ 第一行就是 hook + emoji
✓ 中段：賣點 + 受眾為什麼在乎
✓ 結尾：CTA + 3-5 個 hashtag`
      : isStrategic
      ? `這是「策略 / 文件類」交付物 — 寫出完整的成品文件，用 markdown 結構（## / - 條列），每個段落寫具體內容。`
      : `直接寫出成品內容，不要寫「我會...」這種方法論說明。`;

    const systemPrompt = `你是 ${agentName}${agentTitle ? `（${agentTitle}）` : ""}，專長：${agentSkill}。
${agentKnowledge ? `\n${agentKnowledge}\n` : ""}你正在執行「${stepName}」步驟。

【最高優先規則】直接交付完成品本身。
${outputGuide}

用繁體中文。產出類型：${outputType || "適中"}。
${brandContext ? `\n【強制】這一步是為以下品牌服務：\n${brandContext}\n如果你產出的內容換到別的品牌也成立，就是失敗。` : ""}`;

    const userPrompt = `${missionContext}
${brandContext ? `\n${brandContext}\n` : ""}
方法論參考：${typeof squad.methodology === "string" ? squad.methodology : (squad.methodology?.author ?? "")}
此步驟說明：${stepDesc || stepName}
預期產出類型：${outputType || "（未指定）"}
${prevOutputs ? `\n上游步驟成果（直接接續使用，不要重述）：\n${prevOutputs}` : ""}
${userInput ? `\n使用者補充：\n${userInput}` : ""}

請直接交付【成品內容】。`;

    // ── Stream LLM tokens ──────────────────────────────────────────────────
    let fullOutput = "";
    try {
      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userPrompt },
      ];
      for await (const chunk of invokeLLMStream({ messages, maxTokens: 3000 })) {
        fullOutput += chunk;
        send("delta", { text: chunk });
      }
    } catch (streamErr: any) {
      console.error("[missionStepStream] LLM stream error:", streamErr?.message);
      send("error", { message: streamErr?.message ?? "LLM stream failed" });
      clearInterval(keepalive);
      res.end();
      return;
    }

    // Strip content artifacts
    if (isContent) {
      fullOutput = fullOutput
        .replace(/^\s*(?:#\s*)?(?:Jab|Step|貼文|Post)\s*\d+\s*[:：][^\n]*\n+/gi, "")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^(?:以下(?:是|為)|這(?:是|篇是)|我(?:會|將)|這篇貼文(?:的目的)?是)[^\n]*\n+/m, "")
        .trim();
    }

    // ── Save to mission_step_progress ─────────────────────────────────────
    try {
      // Push old draft to history
      const [existRows] = await db.execute(sql`
        SELECT agent_output, user_input, history FROM mission_step_progress
         WHERE mission_id = ${missionId} AND step_order = ${stepOrder} LIMIT 1
      `) as any[];
      const exist = (existRows as any[])?.[0];
      let nextHistory: any[] = [];
      if (exist?.agent_output) {
        const prevHist = safeJson<any[]>(exist.history, []);
        nextHistory = [...prevHist, { output: exist.agent_output, userInput: exist.user_input, ts: new Date().toISOString() }].slice(-10);
      }

      await db.execute(sql`
        INSERT INTO mission_step_progress
          (mission_id, step_order, status, user_input, agent_output, agent_id, agent_name, history)
        VALUES
          (${missionId}, ${stepOrder}, 'drafted',
           ${userInput || null}, ${fullOutput},
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
    } catch (dbErr: any) {
      console.error("[missionStepStream] DB save error:", dbErr?.message);
    }

    send("step_done", { stepOrder, output: fullOutput, status: "drafted" });

  } catch (err: any) {
    console.error("[missionStepStream] Error:", err?.message);
    send("error", { message: err?.message ?? "Unknown error" });
  } finally {
    clearInterval(keepalive);
    res.end();
  }
});
