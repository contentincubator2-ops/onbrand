/**
 * Category 2: BRAND POSITIONING — ~30 squads across 3 sub-categories
 * 品牌定位：心智定位、品牌策略、品牌建築
 *
 * Sub-categories:
 * 2.1: Mental Positioning (心智定位) — 10 squads
 * 2.2: Brand Strategy (品牌策略) — 10 squads
 * 2.3: Brand Architecture (品牌建築) — 10 squads
 */

// This file is a template structure for Category 2.
// Full implementations should follow the pattern from category-1-market-research.ts

// Example: 2.1.1 - BrandPosition Wheel Analysis
const categoryTwoTemplate = `
{
  const slug = "brand-positioning-wheel";
  const taskType = slug;
  const usedIds: number[] = [];

  const leadId = await findAgent(conn, ["brand-strategy-pmm", "positioning-specialist"], usedIds);
  if (leadId) { usedIds.push(leadId); await assignSkillsToAgent(conn, leadId, ["brand-positioning-wheel", "perceptual-mapping", "differentiation"]); }
  const leadInfo = await getAgentInfo(conn, leadId);

  const m2Id = await findAgent(conn, ["market-research-agent", "consumer-insights"], usedIds);
  if (m2Id) { usedIds.push(m2Id); await assignSkillsToAgent(conn, m2Id, ["consumer-perception", "brand-recall", "association-mapping"]); }
  const m2Info = await getAgentInfo(conn, m2Id);

  const steps = [
    assignAgentToStep({ order: 1, name: "品牌認知映射", description: "映照品牌現狀認知：優勢屬性、劣勢屬性、競爭優勢", tool: "internal", outputType: "brand_perception_map", requiredSkills: ["perceptual-mapping"], aiModel: "claude-sonnet-4-6" }, m2Info),
    assignAgentToStep({ order: 2, name: "目標定位設計", description: "設計『理想定位』：目標客群心智、核心差異、支撐理由", tool: "internal", outputType: "positioning_statement", requiredSkills: ["brand-positioning-wheel"], aiModel: "anthropic/claude-opus-4" }, leadInfo),
    assignAgentToStep({ order: 3, name: "定位輪盤完善", description: "用 Brand Positioning Wheel：自我認知、顧客認知、競爭定位、品牌本質，四層確保一致", tool: "internal", outputType: "positioning_wheel", requiredSkills: ["differentiation"], aiModel: "claude-sonnet-4-6" }, leadInfo),
  ];

  const agentMembers = [
    { agent_id: leadId, is_lead: true, role: "品牌定位策略師", order: 1 },
    { agent_id: m2Id, is_lead: false, role: "消費者洞察師", order: 2 },
  ].filter(a => a.agent_id);

  await upsertWorkflow(conn, { missionType: taskType, name: "品牌定位輪盤分析", steps });
  await upsertSquad(conn, {
    slug,
    name: "品牌定位輪盤小隊",
    description: "用定位輪盤框架系統分析品牌自我認知、顧客認知、競爭定位、品牌本質四層維度，設計清晰差異化定位",
    industryKey: "marketing",
    missionType: taskType,
    workspace: ["strategy", "brand-positioning"],
    methodology: "Brand Positioning Wheel Framework",
    agents: agentMembers,
    tags: ["brand-positioning", "differentiation", "consumer-insight"],
    useCases: ["品牌定位澄清", "差異化設計", "心智佔領"],
    outputFormats: ["定位輪盤圖譜", "定位宣言", "競爭對標表"],
    requiredIntegrations: [],
    token: 85000,
    showcases: []
  });
}
`;

console.log("Category 2: Brand Positioning template created");
console.log("To complete, implement full squad definitions for:");
console.log("  2.1: Mental Positioning (心智定位) - 10 squads");
console.log("  2.2: Brand Strategy (品牌策略) - 10 squads");
console.log("  2.3: Brand Architecture (品牌建築) - 10 squads");
console.log("\nFollow the pattern from category-1-market-research.ts for full implementations");
