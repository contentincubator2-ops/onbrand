import { Worker, Job, Queue } from 'bullmq';
// ── OpenClaw Gateway helper ───────────────────────────────────────────────────
const GATEWAY_HTTP = "http://localhost:18790";
const GATEWAY_TOKEN = "mos-pm-claw-2026";

async function callGateway(
  agentId: string,
  messages: { role: string; content: string }[],
  stream = false
): Promise<string> {
  const resp = await fetch(`${GATEWAY_HTTP}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: agentId, messages, stream }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`Gateway ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as any;
  return data?.choices?.[0]?.message?.content ?? "";
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

import { connection } from './marketingQueue';
import { invokeLLM } from '../_core/llm';
import localPool from '../localDb';
import * as fs from 'fs';
import * as path from 'path';

const SKILLS_PATH = process.env.SKILLS_PATH || '/home/azureuser/A2A-Marketing-Claw/skills';

export interface SquadJobData {
  jobId: string;
  squadId: number;
  userRequest: string;
  brand?: string;
  industry?: string;
  userId?: number;
}

export interface SquadMemberOutput {
  agentName: string;
  agentTitle: string;
  taskType: string;
  subTask: string;
  content: string;
}

export interface SquadJobResult {
  squadName: string;
  leader: string;
  leaderTitle: string;
  memberOutputs: SquadMemberOutput[];
  integratedOutput: string;
  model: string;
  executionTimeMs: number;
}

export const squadQueue = new Queue('squad-jobs', { connection });

function loadSkillMd(taskType: string): string {
  try {
    const skillFile = path.join(SKILLS_PATH, taskType, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      return fs.readFileSync(skillFile, 'utf-8').slice(0, 800);
    }
  } catch {}
  return '';
}

function extractContent(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const raw = result.choices?.[0]?.message?.content;
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  // Array of content parts
  const textPart = (raw as any[]).find((p: any) => p.type === 'text');
  return textPart?.text || '';
}

export function startSquadLeaderWorker() {
  const worker = new Worker<SquadJobData, SquadJobResult>(
    'squad-jobs',
    async (job: Job<SquadJobData>) => {
      const startTime = Date.now();
      const { squadId, userRequest, brand, industry } = job.data;
      console.log(`[Squad Worker] Processing squad ${squadId}: ${userRequest.slice(0, 60)}`);

      await job.updateProgress(5);

      // 1. Get squad info
      const [squadRows] = await localPool.query(
        'SELECT id, name, squad_size, description FROM agent_squads WHERE id = ? AND is_active = 1',
        [squadId]
      ) as any[];
      const squad = (squadRows as any[])[0];
      if (!squad) throw new Error(`Squad ${squadId} not found or inactive`);

      // 2. Get leader
      const [leaderRows] = await localPool.query(
        `SELECT a.id, a.name, a.title, a.specialty, a.taskType
         FROM agents a
         JOIN squad_members sm ON a.id = sm.agent_id
         WHERE sm.squad_id = ? AND sm.is_lead = 1
         LIMIT 1`,
        [squadId]
      ) as any[];
      const leader = (leaderRows as any[])[0] || { name: 'Squad Leader', title: '專案負責人', specialty: '行銷策略', taskType: 'brand' };

      // 3. Get members
      const [memberRows] = await localPool.query(
        `SELECT a.id, a.name, a.title, a.specialty, a.taskType
         FROM agents a
         JOIN squad_members sm ON a.id = sm.agent_id
         WHERE sm.squad_id = ? AND sm.is_lead = 0
         ORDER BY sm.order_index
         LIMIT 4`,
        [squadId]
      ) as any[];
      const members = memberRows as any[];

      await job.updateProgress(15);
      console.log(`[Squad Worker] Squad: ${squad.name}, Leader: ${leader.name}, Members: ${members.length}`);

      // 4. Leader creates task breakdown
      const leaderSystemPrompt = `你是「${squad.name}」的 Squad Leader：${leader.name}（${leader.title}）。
專長：${leader.specialty || '行銷策略規劃'}
Squad 描述：${squad.description || squad.name}

你的 Squad 成員：
${members.map((m: any, i: number) => `${i + 1}. ${m.name}（${m.title}）- 專長：${m.specialty || m.taskType}`).join('\n')}

品牌：${brand || '未指定'}，產業：${industry || '未指定'}

請分析任務，為每個成員分配子任務，輸出 JSON：
{"taskBreakdown":[{"memberName":"成員名稱","subTask":"具體子任務","priority":1}],"integrationPlan":"整合策略"}`;

      // Leader via Gateway (has tools + memory)
      const leaderSlug = leader.slug ? `openclaw/${leader.slug}` : 'openclaw/pm';
      const leaderRawContent = await callGateway(leaderSlug, [
        { role: 'system', content: leaderSystemPrompt },
        { role: 'user', content: `用戶任務：${userRequest}\n\n請分配任務給 Squad 成員。輸出合法JSON。` }
      ]);

      let taskPlan: { taskBreakdown: Array<{ memberName: string; subTask: string; priority: number }>; integrationPlan: string } = {
        taskBreakdown: [],
        integrationPlan: '整合所有成員的專業產出，形成完整的行銷策略方案'
      };

      try {
        const parsed = JSON.parse(leaderRawContent || '{}');
        if (parsed.taskBreakdown) taskPlan = parsed;
      } catch {
        console.warn('[Squad Worker] Leader JSON parse failed, using fallback plan');
      }

      await job.updateProgress(35);

      // 5. Members execute in parallel (max 3)
      const activeMembers = members.slice(0, 3);
      const execPromises = activeMembers.map(async (member: any, i: number) => {
        const breakdown = taskPlan.taskBreakdown.find((b) => b.memberName === member.name)
          || taskPlan.taskBreakdown[i]
          || { subTask: userRequest, priority: i + 1 };

        const skillContent = loadSkillMd(member.taskType || 'content-text');

        // Member via Gateway (own workspace SOUL.md drives persona)
        const memberSlug = member.slug ? `openclaw/${member.slug}` : 'openclaw/pm';
        const memberRawContent = await callGateway(memberSlug, [
          { role: 'system', content: `你是 ${member.name}（${member.title}）。品牌：${brand || '未指定'}，產業：${industry || '未指定'}。直接輸出可用的行銷內容成果。` },
          { role: 'user', content: breakdown.subTask || userRequest }
        ]);

        return {
          agentName: member.name,
          agentTitle: member.title,
          taskType: member.taskType || '',
          subTask: breakdown.subTask || userRequest,
          content: memberRawContent || `（${member.name} 產出待整合）`,
        };
      });

      const memberOutputs = await Promise.all(execPromises);
      await job.updateProgress(80);

      // 6. Leader integrates outputs
      const integrationSystem = `你是「${squad.name}」的 Squad Leader：${leader.name}（${leader.title}）。
原始任務：${userRequest}
品牌：${brand || '未指定'}，產業：${industry || '未指定'}

Squad 成員的工作產出：
${memberOutputs.map((o, i) => `【成員${i + 1}：${o.agentName}（${o.agentTitle}）】\n子任務：${o.subTask}\n產出：\n${o.content}`).join('\n\n---\n\n')}

整合策略：${taskPlan.integrationPlan}

請整合所有成員的產出，形成完整、連貫、可直接交付的行銷方案。`;

      const integratedLeaderSlug = leader.slug ? `openclaw/${leader.slug}` : 'openclaw/pm';
      const integratedRaw = await callGateway(integratedLeaderSlug, [
        { role: 'system', content: integrationSystem },
        { role: 'user', content: '請整合所有成員的產出，形成完整的行銷方案。' }
      ]);

      await job.updateProgress(100);

      return {
        squadName: squad.name,
        leader: leader.name,
        leaderTitle: leader.title,
        memberOutputs,
        integratedOutput: integratedRaw || '',
        model: 'Claude Sonnet 4.6 (Leader + Integration) + DeepSeek (Members)',
        executionTimeMs: Date.now() - startTime,
      };
    },
    { connection, concurrency: 3 }
  );

  worker.on('completed', (job) => {
    console.log(`[Squad Worker] ✅ Squad job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Squad Worker] ❌ Squad job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Squad Worker] Worker error:', err.message);
  });

  console.log('[Squad Worker] Squad Leader Worker started (concurrency: 3)');
  return worker;
}
