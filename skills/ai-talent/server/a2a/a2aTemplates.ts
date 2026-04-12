/**
 * Predefined A2A workflow templates
 */

import type { A2AWorkflowDef } from "./a2aOrchestrator";

export const BRAND_LAUNCH_WORKFLOW: A2AWorkflowDef = {
  workflowId: "brand-launch-v1",
  name: "品牌上市完整工作流",
  description: "品牌定位 → 競品分析 → 內容日曆 → 廣告文案",
  nodes: [
    {
      nodeId: "brand-positioning",
      agentId: 0, // 動態指派
      taskTitle: "品牌定位分析",
      taskDescription: "為品牌進行完整定位分析，包含目標受眾、差異化價值主張",
    },
    {
      nodeId: "competitor-analysis",
      agentId: 0,
      taskTitle: "競品分析",
      taskDescription: "分析主要競品的定位策略與市場佔有率",
      dependsOn: ["brand-positioning"],
      inputFrom: "brand-positioning",
    },
    {
      nodeId: "content-calendar",
      agentId: 0,
      taskTitle: "30天內容日曆",
      taskDescription: "根據品牌定位制定30天多平台內容計畫",
      dependsOn: ["brand-positioning"],
      inputFrom: "brand-positioning",
    },
    {
      nodeId: "ad-copy",
      agentId: 0,
      taskTitle: "廣告文案生成",
      taskDescription: "根據競品分析和品牌定位生成高轉換廣告文案",
      dependsOn: ["competitor-analysis", "content-calendar"],
      inputFrom: "competitor-analysis",
    },
  ],
};

export const MARKET_RESEARCH_WORKFLOW: A2AWorkflowDef = {
  workflowId: "market-research-v1",
  name: "市場調研完整工作流",
  description: "目標市場分析 → 消費者洞察 → 市場報告",
  nodes: [
    {
      nodeId: "market-sizing",
      agentId: 0,
      taskTitle: "市場規模分析",
      taskDescription: "分析目標市場的規模、增長率和市場機會",
    },
    {
      nodeId: "consumer-insight",
      agentId: 0,
      taskTitle: "消費者洞察",
      taskDescription: "深入分析目標消費者的需求、行為和痛點",
      dependsOn: ["market-sizing"],
      inputFrom: "market-sizing",
    },
    {
      nodeId: "market-report",
      agentId: 0,
      taskTitle: "市場調研報告",
      taskDescription: "整合所有分析結果，生成完整的市場調研報告",
      dependsOn: ["consumer-insight"],
      inputFrom: "consumer-insight",
    },
  ],
};
