import { Worker, Job } from 'bullmq';
import { connection, MarketingJobData, MarketingJobResult } from './marketingQueue';
import { matchAgents } from '../agentMatcher';
import { invokeLLM } from '../_core/llm';
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
      console.log('[A2A Worker] Model: ' + modelConfig.label);
      await job.updateProgress(40);

      // 4. system prompt
      const skillSection = skillContent ? '## 你的工作指南\n' + skillContent.slice(0, 1500) + '\n\n' : '';
      const systemPrompt = '你是 ' + agentName + '，' + agentTitle + '。\n'
        + '專長：' + agentSpecialty + '\n'
        + '產業：' + (industry || '科技') + '\n'
        + '品牌：' + (brand || '未指定') + '\n\n'
        + skillSection
        + '請根據用戶需求提供專業行銷內容。\n\n'
        + '輸出 JSON 格式（合法 JSON，不加 markdown code block）：\n'
        + '{thinking:策略思考（100字以內）,publishable_content:可直接使用的行銷內容,metadata:{hashtags:[hashtag1],posting_time:建議發布時間,format:貼文格式說明}}';

      // 5. 呼叫 LLM
      await job.updateProgress(60);
      const response = await invokeLLM({
        provider: modelConfig.provider as any,
        model: modelConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userRequest },
        ],
        max_tokens: 1500,
        response_format: { type: 'json_object' },
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
        model: modelConfig.label,
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
