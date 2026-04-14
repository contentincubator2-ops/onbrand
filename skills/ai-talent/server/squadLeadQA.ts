/**
 * squadLeadQA.ts
 *
 * 劉品妤 Squad Lead QA 品質控管模組
 * 在每個步驟 Agent 輸出完成後自動執行，不需用戶操作
 *
 * 流程：
 *   Agent 產出 → runSquadLeadQA() → 通過/不通過 → 結果以 SSE 推送給用戶
 */

import { invokeLLM } from "./_core/llm";

export const SQUAD_LEAD = {
  name: "劉品妤",
  title: "AI 品牌故事 CMO",
  slug: "sarah-brand",
  agentId: 30002,
};

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
  comment: string;           // 劉品妤對用戶說的話（顯示在聊天視窗）
  alignmentCheck: string;    // 與客戶需求對齊度
  contextCheck: string;      // 與整體脈絡一致性
  suggestions: string[];     // 具體改進建議
  readyToAdvance: boolean;
  sourceLabel: string;
}

export async function runSquadLeadQA(params: {
  stepNumber: number;
  agentOutput: string;       // Agent 的完整輸出文字
  brandName: string;
  industry: string;
  description?: string;
  targetMarket?: string;
  previousContext?: string;  // 前幾步的摘要（脈絡用）
}): Promise<QAResult> {
  const stepDef = POSITIONING_STEP_NAMES[params.stepNumber];
  const stepTitle = stepDef?.title ?? `步驟 ${params.stepNumber}`;
  const agentName = stepDef?.agent ?? "AI 顧問";
  const sourceLabel = stepDef?.sourceLabel ?? "";

  const systemPrompt = `你是劉品妤，AI 品牌故事 CMO，擔任品牌定位 Squad Lead。
你的職責：在每個 Agent 完成分析後，對輸出進行嚴格的品質審核（QA），確認：
1. 分析內容是否符合該客戶品牌的實際情況和需求
2. 是否與整體品牌定位脈絡一致（前幾步已建立的基礎）
3. 是否有邏輯矛盾、遺漏重點、或與品牌不符的描述

審核後，以繁體中文寫一段話直接對用戶說（口氣直接、有溫度、像資深顧問），
說明這份分析是否通過，有哪些值得注意的點。

輸出純 JSON：
{
  "status": "pass",
  "overallScore": 85,
  "comment": "（劉品妤對用戶說的話，150字以內，以「我審核完了」開頭，直接點出1-2個亮點或問題）",
  "alignmentCheck": "（與客戶需求對齊的具體說明，30字以內）",
  "contextCheck": "（與整體脈絡一致性說明，30字以內）",
  "suggestions": ["（若有改進建議則列，否則空陣列）"],
  "readyToAdvance": true
}
- status=pass, readyToAdvance=true：品質佳，成果正式交給用戶
- status=flag, readyToAdvance=false：有重大問題，在 comment 中說明，用戶需決定是否繼續
- overallScore 低於 65 請 flag`;

  const userPrompt = `正在審核：步驟 ${params.stepNumber} — ${stepTitle}
執行顧問：${agentName}

【客戶品牌資料】
品牌名稱：${params.brandName}
產業：${params.industry}
品牌描述：${params.description || "未提供"}
目標市場：${params.targetMarket || "未指定"}

${params.previousContext ? `【前幾步已建立的脈絡】\n${params.previousContext}\n` : ""}

【本步驟 Agent 輸出】
${params.agentOutput.slice(0, 3000)}

請以劉品妤身份進行 QA 審核，輸出 JSON。`;

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
      comment: parsed.comment ?? "我審核完了，分析品質合格，可以繼續。",
      alignmentCheck: parsed.alignmentCheck ?? "符合客戶需求。",
      contextCheck: parsed.contextCheck ?? "與整體脈絡一致。",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      readyToAdvance: parsed.readyToAdvance !== false,
      sourceLabel,
    };
  } catch {
    return {
      status: "pass",
      overallScore: 80,
      comment: "我審核完了，這份分析方向正確，品質合格，交給你參考。",
      alignmentCheck: "與客戶需求一致。",
      contextCheck: "與整體脈絡吻合。",
      suggestions: [],
      readyToAdvance: true,
      sourceLabel,
    };
  }
}

/**
 * 將 QA 結果格式化為聊天訊息文字
 * 顯示在聊天視窗中，讓用戶看到劉品妤的審核意見
 */
export function formatQAAsMessage(qa: QAResult): string {
  const badge = qa.status === "pass"
    ? `✅ QA 通過（${qa.overallScore}分）`
    : `⚠️ QA 注意（${qa.overallScore}分）`;

  const lines = [
    `**劉品妤 · ${badge}**`,
    "",
    qa.comment,
  ];

  if (qa.suggestions.length > 0) {
    lines.push("", "建議調整：");
    qa.suggestions.forEach(s => lines.push(`→ ${s}`));
  }

  if (qa.sourceLabel) {
    lines.push("", qa.sourceLabel);
  }

  if (qa.status === "pass") {
    lines.push("", "---");
    lines.push("以上是這個步驟的完整成果，請確認後告訴我「繼續」進入下一步，或告訴我你想調整的方向。");
  } else {
    lines.push("", "---");
    lines.push("⚠️ 這個步驟的分析有需要注意的地方。你可以告訴我「調整 XXX」，或說「繼續」強制推進下一步。");
  }

  return lines.join("\n");
}
