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
import { platformConnectRouter } from "./platformConnectRouter";
import { feedbackRouter } from "./feedbackRouter";
import { squadLeadRouter } from "./squadLeadRouter";
import { theaterRouter } from "./theaterRouter";
import { positioningJobsRouter } from "./positioningJobsRouter";
import { brandKnowledgeRouter } from "./brandKnowledgeRouter";
import { publishRouter } from "./publishRouter";
import { billingRouter } from "./billingRouter";
import { opsRouter } from "./opsRouter";
import { achievementsRouter } from "./achievementsRouter";
// 2026-05-11 (CJ「Spotify 模式，大家貢獻範本」)
import { communityRouter } from "./communityRouter";
// 2026-05-11 (CJ「Team / Agency 方案 + 多客戶 workspace」): multi-tenant container.
import { tenantRouter } from "./tenantRouter";
// 2026-05-11 (CJ「ECPay 金流」): 綠界 checkout + callback.
import { ecpayRouter } from "./ecpayRouter";

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
  platformConnect: platformConnectRouter,
  feedback:        feedbackRouter,
  squadLead:       squadLeadRouter,
  theater:         theaterRouter,
  positioningJobs: positioningJobsRouter,
  brandKnowledge:  brandKnowledgeRouter,
  publish:         publishRouter,
  billing:         billingRouter,
  ops:             opsRouter,
  achievements:    achievementsRouter,
  community:       communityRouter,
  tenant:          tenantRouter,
  ecpay:           ecpayRouter,
});

export type AppRouter = typeof appRouter;
