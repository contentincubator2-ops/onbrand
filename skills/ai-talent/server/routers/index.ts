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
import { brandBrainRouter } from "./brandBrainRouter";
import { strategyDeckRouter } from "./strategyDeckRouter";
import { brandIntelRouter } from "./brandIntelRouter";
import { toolCredRouter } from "./toolCredRouter";
import { decisionRouter } from "./decisionRouter";
import { triageRouter } from "./triageRouter";
import { auditRouter } from "./auditRouter";
import { templateRouter } from "./templateRouter";
import { boardRouter } from "./boardRouter";
import { calendarRouter } from "./calendarRouter";
import { imageRouter } from "./imageRouter";
import { methodologyRouter } from "./methodologyRouter";
import { projectSyncRouter } from "./projectSyncRouter";
import { quickTaskRouter } from "./quickTaskRouter";
import { boardroomRouter } from "./boardroomRouter";
import { mediaHubRouter } from "./mediaHubRouter";
import { playbookRouter } from "./playbookRouter";
import { entityRouter } from "./entityRouter";
import { productRouter, eventRouter, scopeRouter } from "./scopeRouter";
import { pipelineRouter } from "./pipelineRouter";
import { mediaRouter } from "./mediaRouter";
import { taskCatalogRouter } from "./taskCatalogRouter";
import { positioningRouter } from "./positioningRouter";

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
  brandBrain:    brandBrainRouter,
  strategyDeck:  strategyDeckRouter,
  brandIntel:    brandIntelRouter,
  toolCred:      toolCredRouter,
  decision:      decisionRouter,
  triage:        triageRouter,
  audit:         auditRouter,
  template:      templateRouter,
  board:         boardRouter,
  calendar:      calendarRouter,
  image:         imageRouter,
  methodology:   methodologyRouter,
  projectSync:   projectSyncRouter,
  quickTask:     quickTaskRouter,
  boardroom:     boardroomRouter,
  mediaHub:      mediaHubRouter,
  playbook:      playbookRouter,
  entity:        entityRouter,
  product:       productRouter,
  event:         eventRouter,
  scope:         scopeRouter,
  pipeline:      pipelineRouter,
  media:         mediaRouter,
  taskCatalog:   taskCatalogRouter,
  positioning:   positioningRouter,
});

export type AppRouter = typeof appRouter;
