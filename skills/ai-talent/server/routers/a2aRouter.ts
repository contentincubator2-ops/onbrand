import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { executeA2AWorkflow } from "../a2a/a2aOrchestrator";
import { BRAND_LAUNCH_WORKFLOW, MARKET_RESEARCH_WORKFLOW } from "../a2a/a2aTemplates";

export const a2aRouter = router({
  // 執行預設 workflow
  executeWorkflow: protectedProcedure
    .input(
      z.object({
        workflowId: z.enum(["brand-launch-v1", "market-research-v1"]),
        brandId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const templates: Record<string, typeof BRAND_LAUNCH_WORKFLOW> = {
        "brand-launch-v1": BRAND_LAUNCH_WORKFLOW,
        "market-research-v1": MARKET_RESEARCH_WORKFLOW,
      };
      const workflow = templates[input.workflowId];
      if (!workflow) throw new Error(`Unknown workflowId: ${input.workflowId}`);
      return executeA2AWorkflow(workflow, ctx.user!.id, input.brandId);
    }),

  // 查詢 workflow 模板列表
  listTemplates: protectedProcedure.query(() => {
    return [
      { id: "brand-launch-v1", name: "品牌上市完整工作流", nodeCount: 4 },
      { id: "market-research-v1", name: "市場調研完整工作流", nodeCount: 3 },
    ];
  }),
});
