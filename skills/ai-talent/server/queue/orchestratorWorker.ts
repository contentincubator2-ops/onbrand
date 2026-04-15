import { Worker, Job } from 'bullmq';
import { logEvent, newSessionId } from "../_core/sessionLogger";

// ── OpenClaw Gateway helper ───────────────────────────────────────────────────
const GATEWAY_HTTP = "http://localhost:18790";
const GATEWAY_TOKEN = "mos-pm-claw-2026";

async function callGateway(
  agentId: string,
  messages: { role: string; content: string }[],
  stream = false,
  ctx?: { sessionId?: string; userId?: number | null }
): Promise<string> {
  const t0 = Date.now();
  const sid = ctx?.sessionId ?? newSessionId();
  try {
    const resp = await fetch(`${GATEWAY_HTTP}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: agentId, messages, stream }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      logEvent({ sessionId: sid, userId: ctx?.userId, agentSlug: agentId, eventType: "gateway_error", isGatewayOk: false, latencyMs: Date.now()-t0, errorMsg: `${resp.status}: ${errText.slice(0,200)}` });
      throw new Error(`Gateway ${resp.status}: ${errText}`);
    }
    const data = await resp.json() as any;
    const content = data?.choices?.[0]?.message?.content ?? "";
    logEvent({ sessionId: sid, userId: ctx?.userId, agentSlug: agentId, eventType: "gateway_call", isGatewayOk: true, latencyMs: Date.now()-t0, contentLength: content.length });
    return content;
  } catch(err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.startsWith("Gateway ")) {
      logEvent({ sessionId: sid, userId: ctx?.userId, agentSlug: agentId, eventType: "gateway_error", isGatewayOk: false, latencyMs: Date.now()-t0, errorMsg: msg });
    }
    throw err;
  }
}

async function* streamGateway(
  agentId: string,
  messages: { role: string; content: string }[]
): AsyncGenerator<string> {
  const resp = await fetch(`${GATEWAY_HTTP}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: agentId, messages, stream: true }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok || !resp.body) throw new Error(`Gateway ${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        const d = JSON.parse(raw);
        const t = d?.choices?.[0]?.delta?.content ?? "";
        if (t) yield t;
      } catch { /* skip */ }
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

import { connection, MarketingJobData, MarketingJobResult } from './marketingQueue';
import { matchAgents } from '../agentMatcher';
import { invokeLLM, invokeLLMStream } from '../_core/llm';
import { getModelForTask, inferTaskType } from '../_core/modelRouter';
import * as fs from 'fs';
import * as path from 'path';

const SKILLS_PATH = process.env.SKILLS_PATH || '/home/azureuser/A2A-Marketing-Claw/skills';

function loadSkillMd(taskType: string): string {
  try {
    const skillDir = path.join(SKILLS_PATH, taskType);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      return fs.readFileSync(skillFile, 'utf-8').slice(0, 2000);
    }
    if (fs.existsSync(SKILLS_PATH)) {
      const dirs = fs.readdirSync(SKILLS_PATH);
      const match = dirs.find((d: string) => d.toLowerCase().includes(taskType.toLowerCase()));
      if (match) {
        const f = path.join(SKILLS_PATH, match, 'SKILL.md');
        if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8').slice(0, 2000);
      }
    }
  } catch (e) {
    console.warn('[loadSkillMd] failed for', taskType, e);
  }
  return '';
}

export function startOrchestratorWorker() {
  const worker = new Worker<MarketingJobData, MarketingJobResult>(
    'marketing-jobs',
    async (job: Job<MarketingJobData>) => {
      console.log('[A2A Worker] Processing job ' + job.id + ': ' + job.data.userRequest.slice(0, 50));

      const { userRequest, brand, industry, taskType, userId } = job.data;

      // 1. agentMatcher
      await job.updateProgress(10);
      let agentResult: { name: string; title: string; specialty: string; taskType?: string } | undefined;
      try {
        const agents = await matchAgents({
          userId: userId ?? 0,
          taskType: taskType || 'general',
          taskDescription: userRequest,  // 傳入任務描述，啟動智能推斷
          industry: industry,            // 傳入產業，不再 fallback to 'tech'
          limit: 1,
        });
        if (agents[0]) {
          agentResult = {
            name: agents[0].name,
            title: agents[0].title,
            specialty: agents[0].specialty,
            taskType: (agents[0] as any).taskType,
          };
        }
      } catch (err) {
        console.warn('[A2A Worker] agentMatcher failed, using fallback:', err);
      }

      const agentName = agentResult?.name ?? 'AI 行銷專家';
      const agentTitle = agentResult?.title ?? 'Marketing Specialist';
      const agentTaskType = agentResult?.taskType ?? taskType ?? 'social_content';
      const agentSpecialty = agentResult?.specialty ?? '行銷策略與內容創作';

      console.log('[A2A Worker] Agent: ' + agentName);
      await job.updateProgress(25);

      // 2. 讀 SKILL.md
      const skillContent = loadSkillMd(agentTaskType);

      // 3. 決定 LLM 模型
      const inferredType = inferTaskType(userRequest);
      const modelConfig = getModelForTask(inferredType);
      console.log('[A2A Worker] Model: claude-sonnet-4-6');
      await job.updateProgress(40);

      // 4. Research step
      let researchContext = '';
      const urlMatchR = userRequest.match(/https?:\/\/[^\s]+/);
      const hasResearchR = /youtube|市場|研究|分析|系統|strategy|策略|自動|競品/.test(userRequest.toLowerCase());
      if (urlMatchR || hasResearchR) {
        console.log('[A2A Worker] Research step starting...');
        await job.updateProgress(35);
        try {
          const rQuery = urlMatchR
            ? '深入研究這家公司：' + urlMatchR[0] + '。任務：' + userRequest.slice(0, 300)
            : '深入研究：' + userRequest.slice(0, 400) + '。提供具體數據和可行方案。';
          let rResult = '';
          for await (const delta of streamGateway('openclaw/pm', [
            { role: 'system', content: '你是市場研究助手，使用 web_search 搜尋並提供具體數字和洞察。' },
            { role: 'user', content: rQuery }
          ])) { rResult += delta; }
          if (rResult.length > 100) {
            researchContext = '\n\n【市場研究結果】\n' + rResult.slice(0, 4000);
            console.log('[A2A Worker] Research done: ' + rResult.length + ' chars');
          }
        } catch(e) { console.warn('[A2A Worker] Research failed:', e); }
      }

      // 4.5 system prompt (upgraded)
      const skillSection = skillContent ? '## 工作指南\n' + skillContent.slice(0, 1500) + '\n\n' : '';
      const systemPrompt = '你是 ' + agentName + '，' + agentTitle + '。\n'
        + '專長：' + agentSpecialty + '\n\n'
        + skillSection
        + '【要求】必須基於研究資料產出有具體數據的深度分析，禁止空洞行銷語言。\n'
        + 'thinking 至少300字，publishable_content 用Markdown結構化。\n\n'
        + '輸出合法JSON：{"thinking":"深度分析300字+","publishable_content":"結構化Markdown方案","metadata":{"hashtags":[],"format":"方案類型"}}';

      // 5. 呼叫 LLM
      // 5. 呼叫 LLM
      await job.updateProgress(60);
      // Walk through OpenClaw Gateway for full skills + tools
      const agentSlug = (agentResult as any)?.slug ? `openclaw/${(agentResult as any).slug}` : 'openclaw/pm';
      const gatewayContent = await callGateway(agentSlug, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userRequest + researchContext },
      ]);
      // Wrap in response-like object for compatibility
      const response = { choices: [{ message: { content: gatewayContent } }], usage: undefined };

      await job.updateProgress(90);

      // 6. 解析結果
      const rawContent = response.choices?.[0]?.message?.content ?? '';
      const contentStr = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

      let parsed: { thinking?: string; publishable_content?: string; metadata?: Record<string, unknown> } = {};
      try {
        parsed = JSON.parse(contentStr);
      } catch {
        parsed = { publishable_content: contentStr, thinking: '' };
      }

      console.log('[A2A Worker] Job ' + job.id + ' completed');
      await job.updateProgress(100);

      return {
        agent: { name: agentName, title: agentTitle, taskType: agentTaskType },
        model: modelConfig.label, // legacy log only
        thinking: parsed.thinking || '',
        publishable_content: parsed.publishable_content || '',
        metadata: parsed.metadata,
        usage: undefined,
      };
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log('[A2A Worker] Job ' + job.id + ' completed');
  });
  worker.on('failed', (job, err) => {
    console.error('[A2A Worker] Job ' + (job ? job.id : '?') + ' failed:', err.message);
  });

  console.log('[A2A Worker] Orchestrator started, listening for marketing-jobs...');
  return worker;
}
