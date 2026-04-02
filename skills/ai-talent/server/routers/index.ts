import { router } from "../_core/trpc";
import { workflowRouter } from "./workflow";
import { marketRouter } from "./marketRouter";
import { brandRouter } from "../../../brand-engine/server/routers/brandRouter";

export const appRouter = router({
  workflow: workflowRouter,
  market: marketRouter,
  brand: brandRouter,
});

export type AppRouter = typeof appRouter;
