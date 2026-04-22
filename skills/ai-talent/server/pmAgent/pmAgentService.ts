/**
 * PM Agent Service
 * 每個用戶的專屬行銷 PM，負責：
 * 1. 記住用戶偏好和對話歷史
 * 2. 理解用戶意圖
 * 3. 選擇最適合的 agent 或 squad
 * 4. 整合產出後回傳
 */

import { gatewayInvokeLLM } from '../services/llmGateway';
import localPool from '../localDb';
import { marketingQueue } from '../queue/marketingQueue';

const PM_SYSTEM_PROMPT = `你是用戶的專屬行銷 PM（Project Manager）。
你的職責：
1. 理解用戶的行銷需求（不論他怎麼表達）
2. 記住他的品牌、偏好、過去討論的內容
3. 當用戶說的不夠清楚時，主動問清楚
4. 根據需求，決定要用哪種專業 agent 或 squad
5. 整合專業 agent 的產出，用自然語言回報給用戶

你不是直接產出行銷內容，而是理解需求、調度資源、回報結果的 PM。

回應格式（JSON）：
{
  "intent": "用戶意圖（task_request/clarification_needed/general_chat/brand_setup）",
  "response": "直接給用戶看的回應（自然語言，繁體中文）",
  "needsClarification": true,
  "clarificationQuestion": "如果需要問清楚，問什麼",
  "taskToDelegate": {
    "shouldDelegate": true,
    "userRequest": "整理後的任務描述",
    "taskType": "任務類型",
    "brand": "品牌名稱",
    "industry": "產業"
  }
}`;

export async function getConversationHistory(userId: number, sessionId: string, limit = 10) {
  try {
    const [rows] = await localPool.query(
      `SELECT role, content, agentName, modelUsed FROM pm_agent_conversations 
       WHERE userId = ? AND sessionId = ? 
       ORDER BY createdAt DESC LIMIT ?`,
      [userId, sessionId, limit]
    ) as any[];
    return (rows as any[]).reverse(); // 時間順序
  } catch {
    return [];
  }
}

export async function saveMessage(params: {
  userId: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentName?: string;
  modelUsed?: string;
  taskType?: string;
}) {
  try {
    await localPool.query(
      `INSERT INTO pm_agent_conversations (userId, sessionId, role, content, agentName, modelUsed, taskType, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [params.userId, params.sessionId, params.role, params.content,
       params.agentName || null, params.modelUsed || null, params.taskType || null]
    );
  } catch (e) {
    console.error('[pmAgent] saveMessage error:', e);
  }
}

export async function processPMAgentMessage(params: {
  userId: number;
  sessionId: string;
  userMessage: string;
  brandName?: string;
  industry?: string;
}) {
  const { userId, sessionId, userMessage, brandName, industry } = params;

  // 1. 取得對話歷史
  const history = await getConversationHistory(userId, sessionId);

  // 2. 存入用戶訊息
  await saveMessage({ userId, sessionId, role: 'user', content: userMessage });

  // 3. 建立帶歷史的 messages
  const messages = [
    {
      role: 'system' as const,
      content: PM_SYSTEM_PROMPT + (brandName ? `\n\n當前品牌：${brandName}（${industry || '未指定產業'}）` : '')
    },
    ...history.map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: userMessage },
  ];

  // 4. 呼叫 PM Agent LLM — routed through gateway for semaphore + budget enforcement.
  const response = await gatewayInvokeLLM(
    {
      model: 'anthropic/claude-sonnet-4-5',
      provider: 'openrouter',
      messages,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    },
    { userId }
  );

  // 從 choices[0].message.content 取得文字
  const rawContent: string = typeof response.choices?.[0]?.message?.content === 'string'
    ? response.choices[0].message.content
    : JSON.stringify(response.choices?.[0]?.message?.content ?? '');

  let pmDecision: any = {};
  try {
    pmDecision = JSON.parse(rawContent || '{}');
  } catch {
    pmDecision = {
      intent: 'general_chat',
      response: rawContent || '我理解了，讓我處理這件事。',
      taskToDelegate: { shouldDelegate: false }
    };
  }

  // 5. 存入 PM agent 的回應
  await saveMessage({
    userId, sessionId, role: 'assistant',
    content: pmDecision.response || '',
    agentName: 'PM Agent',
    modelUsed: 'claude-sonnet-4-5',
    taskType: pmDecision.intent
  });

  // 6. 如果需要委派任務，加入 BullMQ queue
  let delegatedJob: any = null;
  if (pmDecision.taskToDelegate?.shouldDelegate) {
    const job = await marketingQueue.add('execute-task', {
      jobId: `pm-${Date.now()}`,
      userRequest: pmDecision.taskToDelegate.userRequest || userMessage,
      brand: pmDecision.taskToDelegate.brand || brandName,
      industry: pmDecision.taskToDelegate.industry || industry,
      taskType: pmDecision.taskToDelegate.taskType,
      userId,
      sessionId,
    });
    delegatedJob = { jobId: job.id };
  }

  return {
    pmResponse: pmDecision.response,
    intent: pmDecision.intent,
    needsClarification: pmDecision.needsClarification,
    clarificationQuestion: pmDecision.clarificationQuestion,
    delegatedJob,
  };
}
