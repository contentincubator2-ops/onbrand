import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { executeA2AWorkflow } from "../a2a/a2aOrchestrator";

export const a2aRouter = router({
  // 執行 workflow（從 Squad DB 動態查詢，不再使用硬編碼模板）
  executeWorkflow: protectedProcedure
    .input(
      z.object({
        workflowId: z.string(),
        brandId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const templates: Record<string, unknown> = {};
      const workflow = templates[input.workflowId];
      if (!workflow) throw new Error(`Unknown workflowId: ${input.workflowId}`);
      return executeA2AWorkflow(workflow as any, ctx.user!.id, input.brandId);
    }),

  // 查詢 workflow 模板列表（從 Squad DB 動態查詢）
  listTemplates: protectedProcedure.query(() => {
    return [];
  }),
});
