import { router } from "../platform/core/trpc";
import { brandRouter } from "../strategy/routers/brandRouter";
import { creditsRouter } from "../platform/routers/creditsRouter";
import { notificationRouter } from "../platform/routers/notificationRouter";
import { supportRouter } from "../platform/routers/supportRouter";
import { agentRouter } from "../content/routers/agentRouter";
import { missionRouter } from "../content/routers/missionRouter";
import { outputRouter } from "../content/routers/outputRouter";
import { squadTemplateRouter } from "../content/routers/squadTemplateRouter";
import { brandBrainRouter } from "../strategy/routers/brandBrainRouter";
import { calendarRouter } from "../content/routers/calendarRouter";
import { bundleConnectRouter } from "../platform/routers/bundleConnectRouter";
import { imageRouter } from "../content/routers/imageRouter";
import { imageCardRouter } from "../content/routers/imageCardRouter";
import { quickTaskRouter } from "../content/routers/quickTaskRouter";
import { entityRouter } from "../strategy/routers/entityRouter";
import { productRouter, eventRouter, scopeRouter } from "../strategy/routers/scopeRouter";
import { pipelineRouter } from "../strategy/routers/pipelineRouter";
import { postFormatRouter } from "../content/routers/postFormatRouter";
import { mediaRouter } from "../content/routers/mediaRouter";
import { platformConnectRouter } from "../platform/routers/platformConnectRouter";
import { tabLockRouter } from "../strategy/routers/tabLockRouter";
import { positioningJobsRouter } from "../strategy/routers/positioningJobsRouter";
import { positioningDocsRouter } from "../strategy/routers/positioningDocsRouter";
import { brandTaskCardRouter } from "../strategy/routers/brandTaskCardRouter";
import { workbenchRouter } from "../strategy/routers/workbenchRouter";
import { strategistChatRouter } from "../strategy/routers/strategistChatRouter";
import { assetPhotoRouter } from "../strategy/routers/assetPhotoRouter";
import { campaignRouter } from "../strategy/routers/campaignRouter";
import { vendorRouter } from "../content/routers/vendorRouter";
import { strategyMonitorRouter } from "../strategy/routers/strategyMonitorRouter";
import { brandRegulationRouter } from "../strategy/routers/brandRegulationRouter";
import { eventCalendarRouter } from "../strategy/routers/eventCalendarRouter";
import { touchpointsRouter } from "../platform/routers/touchpointsRouter";
import { navPrefsRouter } from "../platform/routers/navPrefsRouter";
import { plannerRouter } from "../content/routers/plannerRouter";
import { inspirationRouter } from "../content/routers/inspirationRouter";
import { competitorRouter } from "../strategy/routers/competitorRouter";
import { brandKnowledgeRouter } from "../strategy/routers/brandKnowledgeRouter";
import { personaAgentRouter } from "../strategy/routers/personaAgentRouter";
import { cloudDriveRouter } from "../platform/routers/cloudDriveRouter";
import { publishRouter } from "../content/routers/publishRouter";
import { billingRouter } from "../platform/routers/billingRouter";
import { addonRouter } from "../platform/routers/addonRouter";
import { opsRouter } from "../platform/routers/opsRouter";
import { adminStatsRouter } from "../platform/routers/adminStatsRouter";
// 2026-05-11 (CJ「Team / Agency 方案 + 多客戶 workspace」): multi-tenant container.
import { reviewRouter } from "../platform/routers/reviewRouter";
import { performanceRouter } from "../performance/routers/performanceRouter";
import { tenantRouter } from "../platform/routers/tenantRouter";
// 2026-05-14 (CJ「我們使用 Stripe」): Stripe Checkout + webhook.
import { stripeRouter } from "../platform/routers/stripeRouter";
// 2026-05-11 (CJ「節慶日曆 + 自動提醒」): proactive festival nudges.
import { festivalRouter } from "../content/routers/festivalRouter";
// 2026-05-12 (CJ「Phase 1 prompt library」): Nano-Banana 175 image-prompt templates.
import { promptTemplateRouter } from "../content/routers/promptTemplateRouter";
// 2026-06-21 (CJ「按 riverflow 標準」brand DNA): auto-extracted brand color palette.
import { brandColorsRouter } from "../strategy/routers/brandColorsRouter";
import { landingRouter } from "../platform/routers/landingRouter";

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
  agent:         agentRouter,
  mission:       missionRouter,
  output:        outputRouter,
  squad:         squadTemplateRouter,
  brandBrain:    brandBrainRouter,
  assetPhoto:    assetPhotoRouter,
  strategyMonitor: strategyMonitorRouter,
  // 2026-09-30（CJ「策略層加一個 mission tray，是法規」）：用戶自己加的法規，寫文前審查。
  brandRegulation: brandRegulationRouter,
  eventCalendar: eventCalendarRouter,
  touchpoints:   touchpointsRouter,
  navPrefs:      navPrefsRouter,
  planner:       plannerRouter,
  inspiration:   inspirationRouter,
  competitor:    competitorRouter,
  calendar:      calendarRouter,
  bundleConnect: bundleConnectRouter,
  image:         imageRouter,
  // 2026-09-29 各通路「圖片」類別的圖片任務卡。
  imageCard:     imageCardRouter,
  quickTask:     quickTaskRouter,
  entity:        entityRouter,
  product:       productRouter,
  event:         eventRouter,
  // 2026-09-25（CJ 的活動企劃改版）：活動的「設定 + 宣傳企劃」。策略層的企劃頁
  // 與內容層的活動 tray 讀的是同一筆資料，出入口只有這一支。
  campaign:      campaignRouter,
  // 2026-10-01（CJ「用 AI 幫忙查出可以合作的廠商，可以自己接洽聯繫」）：產出旁邊的「找合作對象」。
  vendor:        vendorRouter,
  scope:         scopeRouter,
  pipeline:      pipelineRouter,
  postFormat:    postFormatRouter,
  media:         mediaRouter,
  platformConnect: platformConnectRouter,
  tabLock:         tabLockRouter,
  positioningJobs: positioningJobsRouter,
  positioningDocs: positioningDocsRouter,
  brandTaskCard:   brandTaskCardRouter,
  workbench: workbenchRouter,
  strategistChat: strategistChatRouter,
  brandKnowledge:  brandKnowledgeRouter,
  personaAgent:    personaAgentRouter,
  cloudDrive:      cloudDriveRouter,
  publish:         publishRouter,
  billing:         billingRouter,
  addon:           addonRouter,
  ops:             opsRouter,
  adminStats:      adminStatsRouter,
  review:          reviewRouter,
  performance:     performanceRouter,
  tenant:          tenantRouter,
  stripe:          stripeRouter,
  festival:        festivalRouter,
  promptTemplate:      promptTemplateRouter,
  brandColors:         brandColorsRouter,
  // 2026-09-30 首頁（未登入）的本月爆款卡牆與規格圖卡。
  landing:             landingRouter,
});

export type AppRouter = typeof appRouter;
