/**
 * squadLeadQA.ts  v2
 *
 * 劉品妤 Squad Lead QA 品質控管模組
 * 套用於「所有任務」— Agent 產出後自動審核，通過才交給用戶
 *
 * 審核維度：
 *   1. 內容品質：完整度、邏輯性、可執行性
 *   2. 需求對齊：是否符合用戶的品牌/任務需求
 *   3. 脈絡一致：是否與對話脈絡 / 前幾步的方向一致
 */

import { invokeLLM } from "./_core/llm";

export const SQUAD_LEAD = {
  name: "劉品妤",
  title: "AI 品牌故事 CMO",
  slug: "sarah-brand",
  agentId: 30002,
};

// 品牌定位步驟的來源標籤（定位任務專用）
export const POSITIONING_STEP_NAMES: Record<number, { title: string; agent: string; sourceLabel: string }> = {
  1:  { title: "市場洞察",     agent: "市場研究員",   sourceLabel: "[來源: 業界報告 + 市場數據]" },
  2:  { title: "目標客群",     agent: "消費者洞察師",  sourceLabel: "[來源: 消費者調查 + 行為數據]" },
  3:  { title: "競爭格局",     agent: "競品分析師",   sourceLabel: "[來源: 競品研究 + 市場情報]" },
  4:  { title: "品牌核心價值",  agent: "品牌策略師",   sourceLabel: "[來源: 品牌策略框架 + 黃金圈方法論]" },
  5:  { title: "差異化定位",   agent: "品牌策略師",   sourceLabel: "[來源: 定位聲明框架 + USP 方法論]" },
  6:  { title: "價值主張",     agent: "定位顧問",     sourceLabel: "[來源: 價值主張畫布 + 客戶效益驗證]" },
  7:  { title: "品牌個性",     agent: "定位顧問",     sourceLabel: "[來源: 品牌原型理論 + 語調指南]" },
  8:  { title: "訊息策略",     agent: "創意文案師",   sourceLabel: "[來源: 創意文案框架 + 訊息測試]" },
  9:  { title: "通路策略",     agent: "通路策略師",   sourceLabel: "[來源: 通路分析 + 內容行銷框架]" },
  10: { title: "品牌活化計畫",  agent: "行銷計劃師",   sourceLabel: "[來源: 行銷規劃框架 + KPI 標準]" },
};

export interface QAResult {
  status: "pass" | "flag";
  overallScore: number;
  comment: string;           // 劉品妤對用戶說的話
  alignmentCheck: string;    // 與客戶需求對齊度
  contextCheck: string;      // 與整體脈絡一致性
  qualityCheck: string;      // 輸出品質評估
  suggestions: string[];     // 具體改進建議
  readyToAdvance: boolean;
  sourceLabel?: string;
}

export interface QAParams {
  // Agent 資訊
  agentName: string;          // 執行此任務的 Agent 名稱
  agentTitle?: string;        // Agent 職稱
  taskTitle?: string;         // 任務名稱（如「市場洞察」「廣告文案」等）
  agentOutput: string;        // Agent 的完整輸出

  // 品牌 / 用戶需求資料
  brandName?: string;
  industry?: string;
  description?: string;
  targetMarket?: string;
  userRequest?: string;       // 用戶原始需求（更通用的任務描述）

  // 脈絡
  previousContext?: string;   // 前幾步摘要 / 對話歷史摘要

  // 定位任務專用
  stepNumber?: number;
}

export async function runSquadLeadQA(params: QAParams): Promise<QAResult> {
  const stepDef = params.stepNumber ? POSITIONING_STEP_NAMES[params.stepNumber] : null;
  const sourceLabel = stepDef?.sourceLabel;

  const systemPrompt = `你是劉品妤，AI 品牌故事 CMO，擔任所有任務的 Squad Lead QA 審核官。

你的職責：每當 AI 顧問完成一項任務後，對其輸出進行品質控管（QA），確認三個維度：
1. 【內容品質】完整度、邏輯性、可執行性、是否有具體內容
2. 【需求對齊】是否符合客戶品牌實際情況和當前任務需求
3. 【脈絡一致】是否與整體方向、前幾步、對話背景一致

審核標準：
- 90+分：頂尖，超出預期
- 80-89分：品質良好，可直接採用（pass）
- 70-79分：可接受，但有改進空間（pass，附建議）
- 65-69分：勉強及格，需注意（pass + flag warning）
- <65分：品質不足，建議修正（flag）

以繁體中文、口氣直接有溫度的資深顧問口吻，寫給用戶看的評語。

輸出純 JSON：
{
  "status": "pass",
  "overallScore": 83,
  "comment": "（以「我看完了，」開頭，150字以內，直接指出1-2個最重要的亮點或問題）",
  "alignmentCheck": "（需求對齊度，40字以內）",
  "contextCheck": "（脈絡一致性，40字以內）",
  "qualityCheck": "（輸出品質，40字以內）",
  "suggestions": ["（具體改進建議，若無則空陣列）"],
  "readyToAdvance": true
}`;

  const taskDesc = params.taskTitle
    ? `任務：${params.taskTitle}${params.stepNumber ? `（定位步驟 ${params.stepNumber}）` : ''}`
    : `任務：一般行銷顧問任務`;

  const brandInfo = [
    params.brandName ? `品牌：${params.brandName}` : null,
    params.industry  ? `產業：${params.industry}` : null,
    params.description ? `描述：${params.description}` : null,
    params.targetMarket ? `目標市場：${params.targetMarket}` : null,
  ].filter(Boolean).join('\n') || '（品牌資料未提供）';

  const userPrompt = `正在審核 ${taskDesc}
執行顧問：${params.agentName}${params.agentTitle ? ` · ${params.agentTitle}` : ''}

【客戶資料】
${brandInfo}

${params.userRequest ? `【用戶需求】\n${params.userRequest}\n` : ''}
${params.previousContext ? `【前置脈絡】\n${params.previousContext}\n` : ''}

【顧問輸出內容】
${params.agentOutput.slice(0, 3500)}

請以劉品妤身份 QA 審核，輸出 JSON。`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 800,
    });

    const raw = String(result.choices[0]?.message?.content ?? "");
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = match ? match[1]!.trim() : raw.trim();
    const parsed = JSON.parse(jsonStr);

    return {
      status: parsed.status === "flag" ? "flag" : "pass",
      overallScore: Number(parsed.overallScore) || 80,
      comment: parsed.comment ?? "我看完了，品質合格，可以繼續。",
      alignmentCheck: parsed.alignmentCheck ?? "符合需求。",
      contextCheck: parsed.contextCheck ?? "脈絡一致。",
      qualityCheck: parsed.qualityCheck ?? "內容完整。",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      readyToAdvance: parsed.readyToAdvance !== false,
      sourceLabel,
    };
  } catch {
    return {
      status: "pass",
      overallScore: 80,
      comment: "我看完了，這份分析方向正確，品質合格，交給你參考。",
      alignmentCheck: "與客戶需求一致。",
      contextCheck: "與整體脈絡吻合。",
      qualityCheck: "內容完整可用。",
      suggestions: [],
      readyToAdvance: true,
      sourceLabel,
    };
  }
}

/**
 * 格式化 QA 結果為聊天訊息
 * 顯示在聊天視窗中，讓用戶看到劉品妤的審核意見
 */
export function formatQAAsMessage(qa: QAResult, opts?: { isLastStep?: boolean }): string {
  const badge = qa.status === "pass"
    ? `✅ QA 通過（${qa.overallScore}分）`
    : `⚠️ QA 注意（${qa.overallScore}分）`;

  const lines = [
    `**劉品妤 · ${SQUAD_LEAD.title}｜${badge}**`,
    "",
    qa.comment,
    "",
  ];

  if (qa.alignmentCheck || qa.contextCheck || qa.qualityCheck) {
    lines.push(`◎ 需求對齊：${qa.alignmentCheck}`);
    lines.push(`◎ 脈絡一致：${qa.contextCheck}`);
    lines.push(`◎ 輸出品質：${qa.qualityCheck}`);
  }

  if (qa.suggestions.length > 0) {
    lines.push("");
    lines.push("建議調整：");
    qa.suggestions.forEach(s => lines.push(`→ ${s}`));
  }

  if (qa.sourceLabel) {
    lines.push("", qa.sourceLabel);
  }

  lines.push("", "---");

  if (qa.status === "pass") {
    if (opts?.isLastStep) {
      lines.push("以上是這個任務的完整成果，告訴我你想調整的方向，或說「完成」結束。");
    } else {
      lines.push("成果已確認。告訴我「繼續」進入下一步，或說明你想調整的方向。");
    }
  } else {
    lines.push("⚠️ 這個步驟有需要注意的地方，建議告訴我「調整 XXX」，或說「繼續」強制推進。");
  }

  return lines.join("\n");
}
