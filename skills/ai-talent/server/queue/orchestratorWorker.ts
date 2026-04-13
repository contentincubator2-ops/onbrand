import { Worker, Job } from 'bullmq';
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
          for await (const delta of invokeLLMStream({
            messages: [
              { role: 'system', content: '你是市場研究助手，搜尋並提供具體數字和洞察。' },
              { role: 'user', content: rQuery }
            ],
            provider: 'openrouter',
            model: 'perplexity/sonar-pro',
            maxTokens: 800,
          })) { rResult += delta; }
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
      const response = await invokeLLM({
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4-6',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userRequest + researchContext },
        ],
        max_tokens: 4000,
      });

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
        usage: response.usage ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        } : undefined,
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
