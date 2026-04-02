import { router } from "../_core/trpc";
import { workflowRouter } from "./workflow";
import { marketRouter } from "./marketRouter";

export const appRouter = router({
  workflow: workflowRouter,
  market: marketRouter,
});

export type AppRouter = typeof appRouter;
