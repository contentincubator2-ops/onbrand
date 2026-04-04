import { router } from "../_core/trpc";
import { workflowRouter } from "./workflow";
import { marketRouter } from "./marketRouter";
import { brandRouter } from "./brandRouter";
import { creditsRouter } from "./creditsRouter";
import { notificationRouter } from "./notificationRouter";
import { taskRouter } from "./taskRouter";
import { a2aRouter } from "./a2aRouter";
import { conversationRouter } from "./conversationRouter";

export const appRouter = router({
  workflow:      workflowRouter,
  market:        marketRouter,
  brand:         brandRouter,
  credits:       creditsRouter,
  notifications: notificationRouter,
  task:          taskRouter,
  a2a:           a2aRouter,
  conversation:  conversationRouter,
});

export type AppRouter = typeof appRouter;
