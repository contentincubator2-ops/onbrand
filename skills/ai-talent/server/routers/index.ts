import { router } from "../_core/trpc";
import { brandRouter } from "./brandRouter";
import { creditsRouter } from "./creditsRouter";
import { notificationRouter } from "./notificationRouter";
import { supportRouter } from "./supportRouter";
import { videoRouter } from "./videoRouter";
import { agentRouter } from "./agentRouter";
import { missionRouter } from "./missionRouter";
import { outputRouter } from "./outputRouter";
import { squadTemplateRouter } from "./squadTemplateRouter";
import { brandBrainRouter } from "./brandBrainRouter";
import { calendarRouter } from "./calendarRouter";
import { bundleConnectRouter } from "./bundleConnectRouter";
import { imageRouter } from "./imageRouter";
import { projectSyncRouter } from "./projectSyncRouter";
import { quickTaskRouter } from "./quickTaskRouter";
import { entityRouter } from "./entityRouter";
import { productRouter, eventRouter, scopeRouter } from "./scopeRouter";
import { pipelineRouter } from "./pipelineRouter";
import { marketIntelRouter } from "./marketIntelRouter";
import { postFormatRouter } from "./postFormatRouter";
import { mediaRouter } from "./mediaRouter";
import { taskCatalogRouter } from "./taskCatalogRouter";
import { platformConnectRouter } from "./platformConnectRouter";
import { theaterRouter } from "./theaterRouter";
import { positioningJobsRouter } from "./positioningJobsRouter";
import { workbenchRouter } from "./workbenchRouter";
import { brandKnowledgeRouter } from "./brandKnowledgeRouter";
import { personaAgentRouter } from "./personaAgentRouter";
import { cloudDriveRouter } from "./cloudDriveRouter";
import { publishRouter } from "./publishRouter";
import { billingRouter } from "./billingRouter";
import { opsRouter } from "./opsRouter";
import { adminStatsRouter } from "./adminStatsRouter";
import { achievementsRouter } from "./achievementsRouter";
// 2026-05-11 (CJ「Spotify 模式，大家貢獻範本」)
import { communityRouter } from "./communityRouter";
// 2026-05-11 (CJ「Team / Agency 方案 + 多客戶 workspace」): multi-tenant container.
import { tenantRouter } from "./tenantRouter";
// 2026-05-14 (CJ「我們使用 Stripe」): Stripe Checkout + webhook.
import { stripeRouter } from "./stripeRouter";
// 2026-05-11 (CJ「節慶日曆 + 自動提醒」): proactive festival nudges.
import { festivalRouter } from "./festivalRouter";
// 2026-05-12 (CJ「Phase 1 prompt library」): Nano-Banana 175 image-prompt templates.
import { promptTemplateRouter } from "./promptTemplateRouter";
// 2026-05-12 (CJ「策略顧問 — 5 scenario cards + McKinsey reports + Q&A + 比稿」)
import { strategyConsultantRouter } from "./strategyConsultantRouter";
// 2026-05-18 (CJ「media to copy」): photo/video/doc → brand-aligned platform copy.
import { mediaCopyRouter } from "./mediaCopyRouter";
// 2026-06-21 (CJ「按 riverflow 標準」brand DNA): auto-extracted brand color palette.
import { brandColorsRouter } from "./brandColorsRouter";

// 2026-05-14: removed 28 dead routers — none of them had any v2 callers
// after the v1 frontend deletion. See git history (commit before this)
// for the full list. The retired routers were: workflow, market, task,
// a2a, conversation, campaign, workspace, company, sop, knowledge,
// review, message, resource, report, strategyDeck, brandIntel, toolCred,
// decision, triage, audit, template, board, methodology, boardroom,
// mediaHub, playbook, positioning, feedback, squadLead. Together with
// their two helper files (_core/auditAgent.ts + _core/scouts/credTesters.ts)
// this is ~7,000 LOC of dead server code removed.

export const appRouter = router({
  brand:         brandRouter,
  credits:       creditsRouter,
  notifications: notificationRouter,
  support:       supportRouter,
  video:         videoRouter,
  agent:         agentRouter,
  mission:       missionRouter,
  output:        outputRouter,
  squad:         squadTemplateRouter,
  brandBrain:    brandBrainRouter,
  calendar:      calendarRouter,
  bundleConnect: bundleConnectRouter,
  image:         imageRouter,
  projectSync:   projectSyncRouter,
  quickTask:     quickTaskRouter,
  entity:        entityRouter,
  product:       productRouter,
  event:         eventRouter,
  scope:         scopeRouter,
  pipeline:      pipelineRouter,
  marketIntel:   marketIntelRouter,
  postFormat:    postFormatRouter,
  media:         mediaRouter,
  taskCatalog:   taskCatalogRouter,
  platformConnect: platformConnectRouter,
  theater:         theaterRouter,
  positioningJobs: positioningJobsRouter,
  workbench: workbenchRouter,
  brandKnowledge:  brandKnowledgeRouter,
  personaAgent:    personaAgentRouter,
  cloudDrive:      cloudDriveRouter,
  publish:         publishRouter,
  billing:         billingRouter,
  ops:             opsRouter,
  adminStats:      adminStatsRouter,
  achievements:    achievementsRouter,
  community:       communityRouter,
  tenant:          tenantRouter,
  stripe:          stripeRouter,
  festival:        festivalRouter,
  promptTemplate:      promptTemplateRouter,
  strategyConsultant:  strategyConsultantRouter,
  mediaCopy:           mediaCopyRouter,
  brandColors:         brandColorsRouter,
});

export type AppRouter = typeof appRouter;
