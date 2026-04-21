import { router } from "../_core/trpc";
import { workflowRouter } from "./workflow";
import { marketRouter } from "./marketRouter";
import { brandRouter } from "./brandRouter";
import { creditsRouter } from "./creditsRouter";
import { notificationRouter } from "./notificationRouter";
import { taskRouter } from "./taskRouter";
import { a2aRouter } from "./a2aRouter";
import { conversationRouter } from "./conversationRouter";
import { videoRouter } from "./videoRouter";
import { agentRouter } from "./agentRouter";
import { campaignRouter } from "./campaignRouter";
import { missionRouter } from "./missionRouter";
import { workspaceRouter } from "./workspaceRouter";
import { companyRouter } from "./companyRouter";
import { sopRouter } from "./sopRouter";
import { outputRouter } from "./outputRouter";
import { knowledgeRouter } from "./knowledgeRouter";
import { resourceRouter } from "./resourceRouter";
import { reviewRouter } from "./reviewRouter";
import { messageRouter } from "./messageRouter";
import { squadTemplateRouter } from "./squadTemplateRouter";
import { reportRouter } from "./reportRouter";

export const appRouter = router({
  workflow:      workflowRouter,
  market:        marketRouter,
  brand:         brandRouter,
  credits:       creditsRouter,
  notifications: notificationRouter,
  task:          taskRouter,
  a2a:           a2aRouter,
  conversation:  conversationRouter,
  video:         videoRouter,
  agent:         agentRouter,
  mission:       missionRouter,
  campaign:      campaignRouter,
  workspace:     workspaceRouter,
  company:       companyRouter,
  sop:           sopRouter,
  output:        outputRouter,
  knowledge:     knowledgeRouter,
  review:        reviewRouter,
  message:       messageRouter,
  resource:      resourceRouter,
  squad:         squadTemplateRouter,  // TRPC key kept as "squad" for backward compatibility (frontend uses trpc.squad.*)
  report:        reportRouter,
});

export type AppRouter = typeof appRouter;
