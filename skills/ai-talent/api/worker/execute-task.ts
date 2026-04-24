var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// drizzle/schema.ts
var schema_exports = {};
__export(schema_exports, {
  agentLearnings: () => agentLearnings,
  agentMemories: () => agentMemories,
  agents: () => agents,
  artifactReviews: () => artifactReviews,
  artifacts: () => artifacts,
  brandIntegrations: () => brandIntegrations,
  brands: () => brands,
  chatMessages: () => chatMessages,
  creditsUsageLog: () => creditsUsageLog,
  enterpriseCreditsAllocation: () => enterpriseCreditsAllocation,
  enterpriseCreditsPool: () => enterpriseCreditsPool,
  enterpriseCreditsTx: () => enterpriseCreditsTx,
  enterpriseMembers: () => enterpriseMembers,
  missionKnowledgeChunks: () => missionKnowledgeChunks,
  missionKnowledgeFiles: () => missionKnowledgeFiles,
  missionMessages: () => missionMessages,
  missionOutputs: () => missionOutputs,
  missionResources: () => missionResources,
  missionReviewQueue: () => missionReviewQueue,
  missionSopSteps: () => missionSopSteps,
  missionSops: () => missionSops,
  missionTaskUnits: () => missionTaskUnits,
  missions: () => missions,
  mosCompanies: () => mosCompanies,
  mosCompanyAgents: () => mosCompanyAgents,
  mosDepartments: () => mosDepartments,
  notificationPreferences: () => notificationPreferences,
  notifications: () => notifications,
  sessionEventLogs: () => sessionEventLogs,
  subscriptions: () => subscriptions,
  taskExecutions: () => taskExecutions,
  taskWorkflows: () => taskWorkflows,
  tasks: () => tasks,
  tenantMarkets: () => tenantMarkets,
  tokenUsageLogs: () => tokenUsageLogs,
  userApiKeys: () => userApiKeys,
  userCredits: () => userCredits,
  userWorkspaces: () => userWorkspaces,
  users: () => users,
  videoJobs: () => videoJobs
});
import {
  boolean,
  int,
  tinyint,
  mysqlEnum,
  mysqlTable,
  text,
  longtext,
  timestamp,
  datetime,
  varchar,
  decimal,
  json
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
var users, agents, brands, tasks, taskExecutions, taskWorkflows, agentLearnings, subscriptions, userCredits, creditsUsageLog, enterpriseCreditsPool, enterpriseMembers, tokenUsageLogs, userApiKeys, tenantMarkets, enterpriseCreditsAllocation, enterpriseCreditsTx, notifications, notificationPreferences, chatMessages, agentMemories, brandIntegrations, videoJobs, missions, missionTaskUnits, missionMessages, missionResources, userWorkspaces, mosCompanies, mosDepartments, mosCompanyAgents, missionSops, missionSopSteps, missionOutputs, missionKnowledgeFiles, missionKnowledgeChunks, missionReviewQueue, sessionEventLogs, artifacts, artifactReviews;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    users = mysqlTable("users", {
      id: int("id").autoincrement().primaryKey(),
      openId: varchar("openId", { length: 64 }).notNull().unique(),
      name: text("name"),
      email: varchar("email", { length: 320 }),
      role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
      isActive: int("isActive").default(0).notNull(),
      credits: int("credits").default(1e3).notNull(),
      hasUnlimitedCredits: int("hasUnlimitedCredits").default(0).notNull(),
      // Authentication fields
      passwordHash: varchar("passwordHash", { length: 255 }),
      authMethod: mysqlEnum("authMethod", ["password", "oauth", "google", "slack"]).default("password"),
      // Email verification fields
      emailVerificationToken: varchar("emailVerificationToken", { length: 255 }),
      emailVerificationExpires: timestamp("emailVerificationExpires"),
      // Password reset fields
      passwordResetToken: varchar("passwordResetToken", { length: 255 }),
      passwordResetExpires: timestamp("passwordResetExpires"),
      // Security fields
      registrationIp: varchar("registrationIp", { length: 45 }),
      lastLoginIp: varchar("lastLoginIp", { length: 45 }),
      activatedAt: timestamp("activatedAt"),
      // Enterprise fields (added in MOS migration)
      companyId: int("companyId"),
      departmentId: int("departmentId"),
      orgRole: mysqlEnum("orgRole", ["owner", "admin", "member"]).default("member"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    agents = mysqlTable("agents", {
      id: int("id").autoincrement().primaryKey(),
      slug: varchar("slug", { length: 64 }).notNull().unique(),
      name: varchar("name", { length: 64 }).notNull(),
      englishName: varchar("englishName", { length: 64 }),
      title: varchar("title", { length: 128 }).notNull(),
      layer: mysqlEnum("layer", ["strategy", "execution", "training"]).notNull(),
      avatarUrl: text("avatarUrl"),
      coverUrl: text("coverUrl"),
      bio: text("bio"),
      specialty: text("specialty"),
      knowledgeSources: json("knowledgeSources").$type(),
      skills: json("skills").$type(),
      caseStudies: json("caseStudies").$type(),
      priceMonthly: decimal("priceMonthly", { precision: 10, scale: 2 }),
      pricePerTask: decimal("pricePerTask", { precision: 10, scale: 2 }),
      rating: decimal("rating", { precision: 3, scale: 2 }).default("5.00"),
      reviewCount: int("reviewCount").default(0),
      taskCount: int("taskCount").default(0),
      isAvailable: boolean("isAvailable").default(true),
      isFeatured: boolean("isFeatured").default(false),
      sortOrder: int("sortOrder").default(0),
      industries: text("industries"),
      experienceDetail: text("experienceDetail"),
      methodology: text("methodology"),
      // Creator / UGC fields
      creatorUserId: int("creatorUserId"),
      // null = platform-owned agent
      reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "rejected"]).default("approved"),
      reviewNote: text("reviewNote"),
      // admin rejection reason
      hireCount: int("hireCount").default(0),
      // total times hired by others
      taskEarnCount: int("taskEarnCount").default(0),
      // total tasks completed earning credits
      totalEarned: int("totalEarned").default(0),
      // total credits earned by creator
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    brands = mysqlTable("brands", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId"),
      name: varchar("name", { length: 255 }).notNull(),
      slug: varchar("slug", { length: 64 }).notNull(),
      industry: varchar("industry", { length: 64 }),
      website: text("website"),
      socialLinks: json("socialLinks"),
      description: text("description"),
      logoUrl: text("logoUrl"),
      onboardingStep: int("onboardingStep").default(0),
      positioningStatus: mysqlEnum("positioningStatus", ["pending", "in_progress", "completed"]).default("pending"),
      positioningSummary: text("positioningSummary"),
      positioningReport: json("positioningReport"),
      createdBy: int("createdBy").notNull(),
      createdAt: timestamp("createdAt").defaultNow(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
      // Extended fields (optional, filled by AI analysis)
      tagline: text("tagline"),
      targetAudience: text("targetAudience"),
      brandVoice: text("brandVoice"),
      soworkAnalysis: json("soworkAnalysis").$type(),
      isDefault: boolean("isDefault").default(false),
      // ── AI 推估定位欄位 ──
      valueProposition: text("valueProposition"),
      targetMarket: varchar("targetMarket", { length: 100 }),
      audienceA: varchar("audienceA", { length: 100 }),
      audienceB: varchar("audienceB", { length: 100 }),
      emotionalDiff: varchar("emotionalDiff", { length: 200 }),
      functionalDiff: varchar("functionalDiff", { length: 200 }),
      isEstimate: tinyint("isEstimate").default(0)
    });
    tasks = mysqlTable("tasks", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      agentId: int("agentId").notNull(),
      brandId: int("brandId"),
      // Which brand this task belongs to (null = no brand)
      parentTaskId: int("parentTaskId"),
      // For Agent2Agent: upstream task that produced the input
      forwardNote: text("forwardNote"),
      // Boss's instruction when forwarding task to another agent
      conversationId: int("conversationId"),
      title: varchar("title", { length: 256 }).notNull(),
      description: text("description"),
      taskType: varchar("taskType", { length: 64 }),
      status: mysqlEnum("status", ["pending", "in_progress", "review", "completed", "cancelled"]).default("pending").notNull(),
      priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal"),
      dueDate: timestamp("dueDate"),
      isRecurring: boolean("isRecurring").default(false),
      recurringSchedule: varchar("recurringSchedule", { length: 64 }),
      // 'daily' | 'weekly' | 'biweekly' | 'monthly'
      clientName: varchar("clientName", { length: 256 }),
      // Client name for agency workflows
      referenceUrls: text("referenceUrls"),
      // JSON array of reference URLs/notes
      completedAt: timestamp("completedAt"),
      result: text("result"),
      attachmentUrl: text("attachmentUrl"),
      // JSON: { triggered: boolean, workflowName: string, createdTaskCount: number, createdTaskIds: number[] }
      triggeredWorkflows: json("triggeredWorkflows"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    taskExecutions = mysqlTable("task_executions", {
      id: int("id").autoincrement().primaryKey(),
      taskId: int("taskId").notNull(),
      userId: int("userId").notNull(),
      agentId: int("agentId").notNull(),
      status: mysqlEnum("status", ["running", "completed", "failed", "cancelled"]).default("running").notNull(),
      // The prompt sent to the AI (task title + description + brand context)
      prompt: text("prompt"),
      // The AI-generated output (markdown)
      output: longtext("output"),
      // Error message if failed
      errorMessage: text("errorMessage"),
      // Execution timing
      startedAt: timestamp("startedAt").defaultNow().notNull(),
      completedAt: timestamp("completedAt"),
      durationMs: int("durationMs"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    taskWorkflows = mysqlTable("task_workflows", {
      id: int("id").primaryKey().autoincrement(),
      userId: int("userId").notNull(),
      brandId: int("brandId"),
      name: varchar("name", { length: 255 }).notNull(),
      description: text("description"),
      // 觸發條件：哪個 AI 員工的任務完成後觸發
      triggerAgentSlug: varchar("triggerAgentSlug", { length: 128 }),
      triggerTaskType: varchar("triggerTaskType", { length: 128 }),
      // 下游步驟（JSON 陣列）
      // [{ agentSlug: "wang-short-video", taskTitle: "撰寫短影音腳本", taskDescription: "...", delayMinutes: 0 }]
      steps: json("steps").notNull(),
      isActive: boolean("isActive").default(true).notNull(),
      // 統計
      triggerCount: int("triggerCount").default(0).notNull(),
      lastTriggeredAt: timestamp("lastTriggeredAt"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    agentLearnings = mysqlTable("agent_learnings", {
      id: int("id").autoincrement().primaryKey(),
      agentId: int("agentId").notNull(),
      userId: int("userId").notNull(),
      brandId: int("brandId"),
      taskId: int("taskId"),
      // 訂閱類型決定隱私性
      subscriptionPlan: mysqlEnum("subscriptionPlan", ["per_task", "monthly", "team"]).notNull(),
      // isPrivate=true: 月租/團隊型，只對同品牌可見; isPrivate=false: 任務型，公共共享
      isPrivate: boolean("isPrivate").default(false).notNull(),
      // 任務摘要（用於未來相似任務的上下文注入）
      taskTitle: varchar("taskTitle", { length: 255 }).notNull(),
      taskDescription: text("taskDescription"),
      taskType: varchar("taskType", { length: 64 }),
      // AI 產出摘要（前 500 字，用於學習注入）
      outputSummary: text("outputSummary"),
      // 完整產出（供深度學習分析）
      fullOutput: longtext("fullOutput"),
      // 用戶反饋
      userRating: int("userRating"),
      // 1-5 星
      userFeedback: text("userFeedback"),
      // 文字反饋
      feedbackAt: timestamp("feedbackAt"),
      // 品牌上下文快照（任務執行時的品牌資訊）
      brandContext: json("brandContext"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    subscriptions = mysqlTable("subscriptions", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      agentId: int("agentId").notNull(),
      brandId: int("brandId"),
      // Which brand this AI is hired for (null = all brands)
      plan: mysqlEnum("plan", ["per_task", "monthly", "team"]).notNull(),
      status: mysqlEnum("status", ["active", "paused", "cancelled", "expired"]).default("active").notNull(),
      stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 128 }),
      stripeCustomerId: varchar("stripeCustomerId", { length: 128 }),
      currentPeriodStart: timestamp("currentPeriodStart"),
      currentPeriodEnd: timestamp("currentPeriodEnd"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    userCredits = mysqlTable("user_credits", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull().unique(),
      // Monthly plan credits (reset each billing cycle)
      planCredits: int("planCredits").default(0).notNull(),
      // credits included in current plan
      usedCredits: int("usedCredits").default(0).notNull(),
      // credits consumed this cycle
      // Extra purchased credits (do NOT reset monthly)
      extraCredits: int("extraCredits").default(0).notNull(),
      // Current plan tier
      planTier: mysqlEnum("planTier", ["community", "integration", "enterprise", "trial"]).default("trial").notNull(),
      // Billing cycle
      cycleStart: timestamp("cycleStart"),
      cycleEnd: timestamp("cycleEnd"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    creditsUsageLog = mysqlTable("credits_usage_log", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      agentId: int("agentId"),
      // which AI agent was involved
      // What triggered this deduction
      actionType: mysqlEnum("actionType", [
        "adopt_proposal",
        // 採用 AI 員工主動提案
        "adopt_report",
        // 採用競品/品牌健康報告
        "adopt_schedule",
        // 採用排程建議
        "adopt_draft",
        // 採用自動草稿
        "adopt_collaboration",
        // 採用跨員工協作成果
        "manual_task",
        // 用戶主動指派任務（月租包含，記錄但不扣費）
        "chat_message",
        // 對話（月租包含，記錄但不扣費）
        "extra_purchase",
        // 加購點數（正數，增加）
        "plan_renewal"
        // 方案續訂（正數，重置）
      ]).notNull(),
      // Credit amount: negative = consumed, positive = added
      creditsAmount: int("creditsAmount").notNull(),
      // Calculation breakdown (for transparency)
      baseCredits: int("baseCredits"),
      knowledgeDepthFactor: decimal("knowledgeDepthFactor", { precision: 4, scale: 2 }),
      instructionComplexityFactor: decimal("instructionComplexityFactor", { precision: 4, scale: 2 }),
      outputScaleFactor: decimal("outputScaleFactor", { precision: 4, scale: 2 }),
      ragQueryCredits: int("ragQueryCredits").default(0),
      randomVariation: decimal("randomVariation", { precision: 5, scale: 2 }),
      // Token stats from LLM API
      inputTokens: int("inputTokens"),
      outputTokens: int("outputTokens"),
      // Context
      taskId: int("taskId"),
      conversationId: int("conversationId"),
      proposalId: int("proposalId"),
      // links to agent_proposals table
      description: text("description"),
      // human-readable summary
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    enterpriseCreditsPool = mysqlTable("enterprise_credits_pool", {
      id: int("id").primaryKey().autoincrement(),
      ownerId: int("ownerId").notNull().unique(),
      // workspace owner's userId
      totalCredits: int("totalCredits").default(0).notNull(),
      // total credits added
      usedCredits: int("usedCredits").default(0).notNull(),
      // total credits consumed by members
      // Per-member allocation cap (0 = unlimited from pool)
      memberMonthlyLimit: int("memberMonthlyLimit").default(0).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    enterpriseMembers = mysqlTable("enterprise_members", {
      id: int("id").primaryKey().autoincrement(),
      ownerId: int("ownerId").notNull(),
      // workspace owner's userId
      memberId: int("memberId"),
      // invited user's userId (null until accepted)
      email: varchar("email", { length: 320 }).notNull(),
      // invited email
      name: varchar("name", { length: 128 }),
      // display name (filled after accept)
      role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
      status: mysqlEnum("status", ["pending", "active", "removed"]).default("pending").notNull(),
      inviteToken: varchar("inviteToken", { length: 128 }).unique(),
      inviteExpiresAt: int("inviteExpiresAt"),
      // Unix timestamp (seconds)
      joinedAt: timestamp("joinedAt"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    tokenUsageLogs = mysqlTable("token_usage_logs", {
      id: varchar("id", { length: 36 }).primaryKey(),
      // UUID
      userId: int("userId").notNull(),
      userApiKey: varchar("userApiKey", { length: 64 }).notNull(),
      tenantId: int("tenantId"),
      taskId: int("taskId"),
      agentId: int("agentId"),
      actionType: varchar("actionType", { length: 50 }).notNull(),
      provider: mysqlEnum("provider", ["openai", "zhipu", "qwen", "perplexity", "google", "cohere", "forge"]).notNull(),
      model: varchar("model", { length: 80 }).notNull(),
      promptTokens: int("promptTokens").default(0).notNull(),
      completionTokens: int("completionTokens").default(0).notNull(),
      totalTokens: int("totalTokens").default(0).notNull(),
      rawCostUsd: decimal("rawCostUsd", { precision: 10, scale: 6 }).default("0").notNull(),
      markupFactor: decimal("markupFactor", { precision: 5, scale: 2 }).default("5.0").notNull(),
      creditsCharged: int("creditsCharged").default(0).notNull(),
      latencyMs: int("latencyMs"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    userApiKeys = mysqlTable("user_api_keys", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      apiKey: varchar("apiKey", { length: 64 }).notNull().unique(),
      // 'sw-xxxxxxxxxxxxxxxx'
      label: varchar("label", { length: 100 }),
      isActive: boolean("isActive").default(true).notNull(),
      lastUsed: timestamp("lastUsed"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    tenantMarkets = mysqlTable("tenant_markets", {
      id: int("id").autoincrement().primaryKey(),
      tenantId: int("tenantId").notNull(),
      marketId: varchar("marketId", { length: 30 }).notNull(),
      // 'Taiwan','Germany','Singapore'...
      contentLanguage: varchar("contentLanguage", { length: 10 }).notNull(),
      // 'zh-TW','de-DE'...
      isDefault: boolean("isDefault").default(false).notNull(),
      complianceFlags: json("complianceFlags").$type(),
      // ['GDPR']
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    enterpriseCreditsAllocation = mysqlTable("enterprise_credits_allocation", {
      id: int("id").autoincrement().primaryKey(),
      ownerId: int("ownerId").notNull(),
      memberId: int("memberId").notNull(),
      allocatedCredits: int("allocatedCredits").default(0).notNull(),
      usedCredits: int("usedCredits").default(0).notNull(),
      monthlyLimit: int("monthlyLimit").default(0).notNull(),
      // 0 = use pool default
      cycleStart: timestamp("cycleStart"),
      cycleEnd: timestamp("cycleEnd"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    enterpriseCreditsTx = mysqlTable("enterprise_credits_tx", {
      id: int("id").autoincrement().primaryKey(),
      ownerId: int("ownerId").notNull(),
      memberId: int("memberId"),
      type: mysqlEnum("type", ["topup", "deduct", "adjust"]).notNull(),
      amount: int("amount").notNull(),
      // positive=add, negative=deduct
      note: text("note"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    notifications = mysqlTable("notifications", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      type: varchar("type", { length: 50 }).notNull(),
      title: varchar("title", { length: 255 }).notNull(),
      body: text("body"),
      taskId: int("taskId"),
      agentId: int("agentId"),
      isRead: boolean("isRead").default(false).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    notificationPreferences = mysqlTable("notification_preferences", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull().unique(),
      inAppEnabled: boolean("inAppEnabled").default(true).notNull(),
      emailEnabled: boolean("emailEnabled").default(false).notNull(),
      lineEnabled: boolean("lineEnabled").default(false).notNull(),
      lineToken: varchar("lineToken", { length: 255 }),
      telegramEnabled: boolean("telegramEnabled").default(false).notNull(),
      telegramBotToken: varchar("telegramBotToken", { length: 255 }),
      telegramChatId: varchar("telegramChatId", { length: 100 }),
      whatsappEnabled: boolean("whatsappEnabled").default(false).notNull(),
      whatsappWebhookUrl: varchar("whatsappWebhookUrl", { length: 500 }),
      notifyOnTaskCompleted: boolean("notifyOnTaskCompleted").default(true).notNull(),
      notifyOnTaskFailed: boolean("notifyOnTaskFailed").default(true).notNull(),
      notifyOnTaskStarted: boolean("notifyOnTaskStarted").default(false).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    chatMessages = mysqlTable("chat_messages", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      brandId: int("brandId"),
      missionId: int("missionId"),
      conversationTitle: varchar("conversationTitle", { length: 100 }),
      role: varchar("role", { length: 10 }).notNull(),
      content: text("content").notNull(),
      taskId: int("taskId"),
      companyId: int("companyId"),
      departmentId: int("departmentId"),
      phaseOrder: int("phaseOrder").default(0).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    agentMemories = mysqlTable("agent_memories", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      agentSlug: varchar("agentSlug", { length: 64 }).notNull(),
      brandId: int("brandId"),
      memoryType: mysqlEnum("memoryType", ["preference", "forbidden", "audience", "style", "other"]).default("other"),
      content: text("content").notNull(),
      isActive: boolean("isActive").default(true).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    brandIntegrations = mysqlTable("brand_integrations", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      brandId: int("brandId"),
      integrationType: varchar("integrationType", { length: 50 }).notNull(),
      // 'facebook_pages' | 'google_ads' | 'instagram'
      status: mysqlEnum("status", ["connected", "disconnected", "error"]).default("disconnected"),
      accessToken: text("accessToken"),
      // SEC-3: encrypt/decrypt via server/_core/encryption.ts (encrypt() before write, decrypt() after read)
      selectedResourceId: varchar("selectedResourceId", { length: 255 }),
      authorizedResources: json("authorizedResources"),
      connectedAt: timestamp("connectedAt"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    videoJobs = mysqlTable("video_jobs", {
      id: int("id").primaryKey().autoincrement(),
      userId: int("userId").notNull(),
      brandId: int("brandId"),
      topic: varchar("topic", { length: 500 }).notNull(),
      platform: mysqlEnum("platform", ["youtube", "instagram", "tiktok", "facebook"]).notNull().default("youtube"),
      language: mysqlEnum("language", ["zh-TW", "zh-CN", "en"]).notNull().default("zh-TW"),
      duration: int("duration").notNull().default(60),
      // seconds
      style: varchar("style", { length: 50 }).notNull().default("professional"),
      status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).notNull().default("pending"),
      progress: int("progress").notNull().default(0),
      // 0–100
      script: json("script"),
      // VideoScript object
      videoUrl: text("videoUrl"),
      // Final MP4 URL
      thumbnailUrl: text("thumbnailUrl"),
      // Preview image
      falRequestId: varchar("falRequestId", { length: 255 }),
      // fal.ai request tracking
      errorMessage: text("errorMessage"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    missions = mysqlTable("missions", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      brandId: int("brandId"),
      workspace: varchar("workspace", { length: 50 }).notNull(),
      // 'facebook' | 'linkedin' | 'youtube' | 'pr' | 'event' | 'instore'
      title: varchar("title", { length: 255 }).notNull(),
      objective: text("objective"),
      audience: text("audience"),
      offer: text("offer"),
      successMetrics: text("successMetrics"),
      constraints: text("constraints"),
      methodology: text("methodology"),
      // e.g. "Brand Positioning v2"
      description: text("description"),
      // 任務說明（給語意配對用）
      squadSlug: varchar("squadSlug", { length: 64 }),
      // 綁定的 squad slug
      welcomeMessage: text("welcomeMessage"),
      // 點任務時顯示的歡迎訊息
      tagline: varchar("tagline", { length: 255 }),
      // 品牌定位標語
      subTagline: varchar("subTagline", { length: 255 }),
      // 品牌定位副標語
      savedSquadFlow: text("savedSquadFlow"),
      // User-customized squad steps JSON
      status: mysqlEnum("status", ["inactive", "active", "completed", "archived"]).default("inactive").notNull(),
      isRecurring: boolean("isRecurring").default(false).notNull(),
      recurringSchedule: varchar("recurringSchedule", { length: 64 }),
      // 'daily' | 'weekly' | 'biweekly' | 'monthly'
      companyId: int("companyId"),
      brandId2: int("brandId2"),
      departmentId: int("departmentId"),
      workspaceId: int("workspaceId"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    missionTaskUnits = mysqlTable("mission_task_units", {
      id: int("id").autoincrement().primaryKey(),
      missionId: int("missionId").notNull(),
      agentId: int("agentId"),
      // assigned AI agent (null = unassigned)
      label: varchar("label", { length: 255 }).notNull(),
      status: mysqlEnum("status", ["not_started", "running", "needs_input", "review", "approved"]).default("not_started").notNull(),
      sortOrder: int("sortOrder").default(0),
      taskId: int("taskId"),
      // link to tasks table when execution starts
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    missionMessages = mysqlTable("mission_messages", {
      id: int("id").autoincrement().primaryKey(),
      missionId: int("missionId").notNull(),
      userId: int("userId").notNull(),
      role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
      content: longtext("content").notNull(),
      metadata: text("metadata"),
      createdAt: datetime("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`)
    });
    missionResources = mysqlTable("mission_resources", {
      id: int("id").autoincrement().primaryKey(),
      missionId: int("missionId").notNull().unique(),
      status: varchar("status", { length: 20 }).default("pending"),
      // pending | ready | error
      agents: int("agents").default(0),
      skills: int("skills").default(0),
      providers: int("providers").default(0),
      skillList: text("skillList"),
      // JSON string[]
      providerList: text("providerList"),
      // JSON string[]
      topAgents: text("topAgents"),
      // JSON: [{slug, name, title, score}]
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    userWorkspaces = mysqlTable("user_workspaces", {
      id: int("id").autoincrement().primaryKey(),
      userId: int("userId").notNull(),
      wsKey: varchar("wsKey", { length: 64 }).notNull(),
      label: varchar("label", { length: 64 }).notNull(),
      sortOrder: int("sortOrder").default(0),
      companyId: int("companyId"),
      brandId: int("brandId"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    mosCompanies = mysqlTable("mos_companies", {
      id: int("id").autoincrement().primaryKey(),
      name: varchar("name", { length: 128 }).notNull(),
      industry: varchar("industry", { length: 64 }),
      plan: mysqlEnum("plan", ["trial", "starter", "pro", "enterprise"]).default("trial"),
      agentWorkspacePath: varchar("agentWorkspacePath", { length: 255 }),
      agentSessionKey: varchar("agentSessionKey", { length: 128 }),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    mosDepartments = mysqlTable("mos_departments", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull(),
      brandId: int("brandId").notNull(),
      name: varchar("name", { length: 64 }).notNull(),
      headCount: int("headCount").default(0),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    mosCompanyAgents = mysqlTable("mos_company_agents", {
      id: int("id").autoincrement().primaryKey(),
      companyId: int("companyId").notNull().unique(),
      workspacePath: varchar("workspacePath", { length: 255 }),
      sessionKey: varchar("sessionKey", { length: 128 }),
      soulMdContent: text("soulMdContent"),
      memoryMdContent: text("memoryMdContent"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    missionSops = mysqlTable("mission_sops", {
      id: int("id").autoincrement().primaryKey(),
      missionId: int("missionId").notNull(),
      brandId: int("brandId"),
      title: varchar("title", { length: 255 }).notNull(),
      version: int("version").default(1),
      isGlobal: int("isGlobal").default(0),
      sourceType: mysqlEnum("sourceType", ["auto_learned", "manual", "imported"]).default("manual"),
      importSource: mysqlEnum("importSource", ["text", "pdf", "url"]),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    missionSopSteps = mysqlTable("mission_sop_steps", {
      id: int("id").autoincrement().primaryKey(),
      sopId: int("sopId").notNull(),
      stepOrder: int("stepOrder").notNull(),
      stepType: mysqlEnum("stepType", ["sequential", "parallel", "conditional"]).default("sequential"),
      parallelGroupId: varchar("parallelGroupId", { length: 64 }),
      conditionJson: json("conditionJson"),
      agentSlug: varchar("agentSlug", { length: 64 }),
      label: varchar("label", { length: 255 }).notNull(),
      promptSnapshot: text("promptSnapshot"),
      outputSummary: text("outputSummary"),
      durationEstimate: varchar("durationEstimate", { length: 32 }),
      abResult: mysqlEnum("abResult", ["a_wins", "b_wins", "tie", "pending"]).default("pending"),
      notes: text("notes"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    missionOutputs = mysqlTable("mission_outputs", {
      id: int("id").autoincrement().primaryKey(),
      missionId: int("missionId").notNull(),
      conversationId: int("conversationId"),
      messageId: int("messageId"),
      platform: mysqlEnum("platform", ["facebook", "instagram", "linkedin", "youtube", "google_ads", "email", "ppt", "doc", "script", "other"]).default("other"),
      outputType: mysqlEnum("outputType", ["post", "story", "reel", "ad_copy", "email_html", "slide", "script", "product_desc", "report", "other"]).default("other"),
      title: varchar("title", { length: 255 }),
      content: longtext("content"),
      previewHtml: longtext("previewHtml"),
      metadata: json("metadata"),
      status: mysqlEnum("status", ["draft", "pending_review", "approved", "scheduled", "published", "archived"]).default("draft"),
      version: int("version").default(1),
      parentOutputId: int("parentOutputId"),
      scheduledAt: timestamp("scheduledAt"),
      publishedAt: timestamp("publishedAt"),
      isUrgent: int("isUrgent").default(0),
      deadlineAt: timestamp("deadlineAt"),
      batchGroupId: varchar("batchGroupId", { length: 64 }),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    missionKnowledgeFiles = mysqlTable("mission_knowledge_files", {
      id: int("id").autoincrement().primaryKey(),
      missionId: int("missionId").notNull(),
      brandId: int("brandId"),
      userId: int("userId").notNull(),
      filename: varchar("filename", { length: 255 }).notNull(),
      originalName: varchar("originalName", { length: 255 }),
      fileType: mysqlEnum("fileType", ["pdf", "docx", "xlsx", "csv", "txt", "url", "other"]).default("other"),
      fileUrl: text("fileUrl"),
      fileSize: int("fileSize"),
      chunkCount: int("chunkCount").default(0),
      embeddedAt: timestamp("embeddedAt"),
      embeddingStatus: mysqlEnum("embeddingStatus", ["pending", "processing", "completed", "failed"]).default("pending"),
      usageCount: int("usageCount").default(0),
      autoInject: int("autoInject").default(0),
      isForSopOnly: int("isForSopOnly").default(0),
      isSensitive: int("isSensitive").default(0),
      allowedRoles: json("allowedRoles").$type(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    missionKnowledgeChunks = mysqlTable("mission_knowledge_chunks", {
      id: int("id").autoincrement().primaryKey(),
      fileId: int("fileId").notNull(),
      missionId: int("missionId").notNull(),
      chunkIndex: int("chunkIndex").notNull(),
      content: text("content").notNull(),
      embedding: json("embedding"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    missionReviewQueue = mysqlTable("mission_review_queue", {
      id: int("id").autoincrement().primaryKey(),
      missionId: int("missionId").notNull(),
      outputId: int("outputId").notNull(),
      requestedBy: int("requestedBy").notNull(),
      reviewType: mysqlEnum("reviewType", ["internal", "external", "legal", "client"]).default("internal"),
      status: mysqlEnum("status", ["pending", "in_review", "approved", "revision_requested", "expired"]).default("pending"),
      reviewerIds: json("reviewerIds").$type(),
      externalToken: varchar("externalToken", { length: 128 }),
      externalExpireAt: timestamp("externalExpireAt"),
      isUrgent: int("isUrgent").default(0),
      deadlineAt: timestamp("deadlineAt"),
      fastTrack: int("fastTrack").default(0),
      revisionNote: text("revisionNote"),
      approvedAt: timestamp("approvedAt"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    sessionEventLogs = mysqlTable("session_event_logs", {
      id: int("id").autoincrement().primaryKey(),
      sessionId: varchar("sessionId", { length: 128 }).notNull(),
      userId: int("userId"),
      agentSlug: varchar("agentSlug", { length: 255 }),
      agentName: varchar("agentName", { length: 255 }),
      eventType: mysqlEnum("eventType", ["session_start", "gateway_call", "gateway_fallback", "gateway_error", "output", "session_end"]).notNull(),
      isGatewayOk: int("isGatewayOk").default(1),
      latencyMs: int("latencyMs"),
      contentLength: int("contentLength"),
      qualitySignal: int("qualitySignal"),
      errorMsg: text("errorMsg"),
      metadata: json("metadata"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    artifacts = mysqlTable("artifacts", {
      id: int("id").autoincrement().primaryKey(),
      missionId: int("missionId"),
      sessionId: varchar("sessionId", { length: 128 }),
      type: mysqlEnum("type", ["campaign_brief", "audience_matrix", "messaging_angles", "copy_drafts", "creative_directions", "launch_checklist", "positioning", "other"]).default("other"),
      label: varchar("label", { length: 255 }),
      content: longtext("content"),
      version: int("version").default(1),
      status: mysqlEnum("status", ["draft", "pending_review", "approved", "needs_revision", "exported"]).default("draft"),
      createdByAgentId: int("createdByAgentId"),
      createdByUserId: int("createdByUserId"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    artifactReviews = mysqlTable("artifact_reviews", {
      id: int("id").autoincrement().primaryKey(),
      artifactId: int("artifactId").notNull(),
      status: mysqlEnum("status", ["draft", "pending", "approved", "needs_revision", "exported"]).default("draft"),
      reviewerNote: text("reviewerNote"),
      reviewedBy: int("reviewedBy"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  closeDb: () => closeDb,
  getDb: () => getDb,
  getPool: () => getPool,
  getSoworkDb: () => getSoworkDb,
  pingDb: () => pingDb,
  pingSoworkDb: () => pingSoworkDb
});
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { sql as sql2 } from "drizzle-orm";
async function getDb() {
  if (db) return db;
  pool = createPool({
    host: process.env.LOCAL_DB_HOST || "localhost",
    port: Number(process.env.LOCAL_DB_PORT) || 3306,
    user: process.env.LOCAL_DB_USER || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME || "mos_db",
    // Azure MySQL requires TLS; enable when DB_SSL=true. Empty ssl object
    // makes mysql2 use its bundled CA bundle + server cert validation.
    ssl: process.env.DB_SSL === "true" ? {} : void 0,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: 1e4,
    idleTimeout: 6e4,
    enableKeepAlive: true,
    keepAliveInitialDelay: 1e4
  });
  db = drizzle(pool, { schema: schema_exports, mode: "default" });
  return db;
}
async function pingDb() {
  try {
    const database = await getDb();
    await database.execute(sql2`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
async function getSoworkDb() {
  return getDb();
}
async function pingSoworkDb() {
  return pingDb();
}
function getPool() {
  return pool;
}
async function closeDb() {
  if (pool) await pool.end();
  db = null;
  pool = null;
}
var db, pool;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    db = null;
    pool = null;
  }
});

// api/worker/execute-task.ts
init_db();
import { sql as sql4 } from "drizzle-orm";

// server/queue/marketingQueue.ts
import { sql as sql3 } from "drizzle-orm";
import { randomUUID } from "node:crypto";
var IS_VERCEL = !!process.env.VERCEL;
var DbQueue = class {
  constructor(queueName) {
    this.queueName = queueName;
  }
  queueName;
  async add(name, data, opts) {
    const { getDb: getDb2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const db2 = await getDb2();
    const id = opts?.jobId ?? randomUUID();
    await db2.execute(sql3`
      INSERT INTO queued_jobs (id, queue, name, data, status, progress)
      VALUES (${id}, ${this.queueName}, ${name}, ${JSON.stringify(data)}, 'waiting', 0)
      ON DUPLICATE KEY UPDATE data = VALUES(data), name = VALUES(name)
    `);
    void this.dispatchAsync(id);
    return this.handle(id, "waiting", 0, null, null);
  }
  async dispatchAsync(jobId) {
    if (this.queueName !== "marketing-jobs") return;
    const baseUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    if (!baseUrl) return;
    const fire = fetch(`${baseUrl}/api/worker/execute-task`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`
      },
      body: JSON.stringify({ jobId })
    }).catch(() => {
    });
    try {
      const { waitUntil } = await import("@vercel/functions");
      waitUntil(fire);
    } catch {
    }
  }
  async getJob(id) {
    const { getDb: getDb2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const db2 = await getDb2();
    const [rows] = await db2.execute(sql3`
      SELECT id, status, progress, result, failed_reason
      FROM queued_jobs
      WHERE id = ${id} AND queue = ${this.queueName}
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) return null;
    return this.handle(
      row.id,
      row.status,
      row.progress ?? 0,
      row.result ? JSON.parse(row.result) : null,
      row.failed_reason
    );
  }
  handle(id, state, progress, returnvalue, failedReason) {
    return {
      id,
      progress,
      returnvalue,
      failedReason,
      getState: async () => state
    };
  }
};
var _bullmqConnection = null;
var _bullmqQueues = /* @__PURE__ */ new Map();
async function getBullmqConnection() {
  if (_bullmqConnection) return _bullmqConnection;
  const { default: IORedis } = await import("ioredis");
  _bullmqConnection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null
  });
  return _bullmqConnection;
}
async function getBullmqQueue(name) {
  const existing = _bullmqQueues.get(name);
  if (existing) return existing;
  const { Queue } = await import("bullmq");
  const q = new Queue(name, { connection: await getBullmqConnection() });
  _bullmqQueues.set(name, q);
  return q;
}
var BullmqQueue = class {
  constructor(queueName) {
    this.queueName = queueName;
  }
  queueName;
  async add(name, data, opts) {
    const q = await getBullmqQueue(this.queueName);
    const job = await q.add(name, data, opts);
    return this.wrap(job);
  }
  async getJob(id) {
    const q = await getBullmqQueue(this.queueName);
    const job = await q.getJob(id);
    return job ? this.wrap(job) : null;
  }
  wrap(job) {
    return {
      id: job.id,
      progress: job.progress,
      returnvalue: job.returnvalue ?? null,
      failedReason: job.failedReason,
      getState: async () => await job.getState()
    };
  }
};
function makeQueue(name) {
  return IS_VERCEL ? new DbQueue(name) : new BullmqQueue(name);
}
var marketingQueue = makeQueue("marketing-jobs");
var squadQueue = makeQueue("squad-jobs");
var connection = new Proxy(
  {},
  {
    get(_t, prop) {
      if (IS_VERCEL) {
        throw new Error(
          "[queue] Redis connection is not available on Vercel \u2014 use the DB-backed queue (see marketingQueue.ts)."
        );
      }
      const thunk = async () => {
        const c = await getBullmqConnection();
        const v = c[prop];
        return typeof v === "function" ? v.bind(c) : v;
      };
      return thunk;
    }
  }
);
async function updateJob(id, patch) {
  if (!IS_VERCEL) return;
  const { getDb: getDb2 } = await Promise.resolve().then(() => (init_db(), db_exports));
  const db2 = await getDb2();
  const set = [];
  if (patch.status !== void 0) set.push(sql3`status = ${patch.status}`);
  if (patch.progress !== void 0) set.push(sql3`progress = ${patch.progress}`);
  if (patch.result !== void 0) set.push(sql3`result = ${JSON.stringify(patch.result)}`);
  if (patch.failedReason !== void 0) set.push(sql3`failed_reason = ${patch.failedReason}`);
  if (patch.status === "active") set.push(sql3`started_at = IFNULL(started_at, NOW(3))`);
  if (patch.status === "completed" || patch.status === "failed") {
    set.push(sql3`completed_at = NOW(3)`);
  }
  if (set.length === 0) return;
  const setClause = set.reduce(
    (acc, frag, i) => i === 0 ? frag : sql3`${acc}, ${frag}`,
    sql3``
  );
  await db2.execute(sql3`UPDATE queued_jobs SET ${setClause} WHERE id = ${id}`);
}

// api/worker/execute-task.ts
async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
async function handler(req, res) {
  const send = (status, payload) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
  };
  if (req.method !== "POST") return send(405, { error: "method_not_allowed" });
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return send(401, { error: "unauthorized" });
  }
  let jobId;
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    jobId = body.jobId;
    if (!jobId || typeof jobId !== "string") {
      return send(400, { error: "missing jobId" });
    }
  } catch {
    return send(400, { error: "bad_json" });
  }
  const db2 = await getDb();
  const [claim] = await db2.execute(sql4`
    UPDATE queued_jobs
    SET status = 'active',
        started_at = IFNULL(started_at, NOW(3)),
        attempts = attempts + 1
    WHERE id = ${jobId} AND status = 'waiting'
  `);
  if (claim.affectedRows === 0) {
    return send(200, { ok: true, jobId, skipped: "not_waiting" });
  }
  try {
    const [rows] = await db2.execute(sql4`
      SELECT id, queue, name, data FROM queued_jobs WHERE id = ${jobId} LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new Error("job disappeared after claim");
    const payload = JSON.parse(row.data);
    await updateJob(jobId, { progress: 25 });
    await new Promise((r) => setTimeout(r, 300));
    await updateJob(jobId, { progress: 75 });
    await new Promise((r) => setTimeout(r, 200));
    const result = {
      processed: true,
      jobName: row.name,
      queue: row.queue,
      echo: {
        userRequest: payload.userRequest,
        brand: payload.brand,
        industry: payload.industry
      },
      note: "Stub processor \u2014 orchestrator logic not yet ported to Vercel",
      completedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await updateJob(jobId, { status: "completed", progress: 100, result });
    return send(200, { ok: true, jobId, state: "completed", result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { status: "failed", failedReason: msg });
    console.error(`[worker] job ${jobId} failed:`, err);
    return send(500, { ok: false, jobId, error: msg });
  }
}
export {
  handler as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vZHJpenpsZS9zY2hlbWEudHMiLCAiLi4vLi4vc2VydmVyL2RiLnRzIiwgIi4uL3dvcmtlci9leGVjdXRlLXRhc2sudHMiLCAiLi4vLi4vc2VydmVyL3F1ZXVlL21hcmtldGluZ1F1ZXVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQge1xuICBib29sZWFuLFxuICBpbnQsXG4gIHRpbnlpbnQsXG4gIG15c3FsRW51bSxcbiAgbXlzcWxUYWJsZSxcbiAgdGV4dCxcbiAgbG9uZ3RleHQsXG4gIHRpbWVzdGFtcCxcbiAgZGF0ZXRpbWUsXG4gIHZhcmNoYXIsXG4gIGRlY2ltYWwsXG4gIGpzb24sXG59IGZyb20gXCJkcml6emxlLW9ybS9teXNxbC1jb3JlXCI7XG5pbXBvcnQgeyBzcWwgfSBmcm9tIFwiZHJpenpsZS1vcm1cIjtcblxuLy8gIFVzZXJzIFxuLy8gTk9URTogVGhpcyB0YWJsZSBhbHJlYWR5IGV4aXN0cyBpbiBzb3dvcmtfZGIgd2l0aCBleHRlbmRlZCBjb2x1bW5zLlxuLy8gV2UgbWFwIG9ubHkgdGhlIGNvbHVtbnMgdXNlZCBieSBBSSBNYXJrZXRlcjsgZXh0cmEgY29sdW1ucyBhcmUgaWdub3JlZCBieSBEcml6emxlLlxuXG5cbmV4cG9ydCBjb25zdCB1c2VycyA9IG15c3FsVGFibGUoXCJ1c2Vyc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBvcGVuSWQ6IHZhcmNoYXIoXCJvcGVuSWRcIiwgeyBsZW5ndGg6IDY0IH0pLm5vdE51bGwoKS51bmlxdWUoKSxcbiAgbmFtZTogdGV4dChcIm5hbWVcIiksXG4gIGVtYWlsOiB2YXJjaGFyKFwiZW1haWxcIiwgeyBsZW5ndGg6IDMyMCB9KSxcbiAgcm9sZTogbXlzcWxFbnVtKFwicm9sZVwiLCBbXCJ1c2VyXCIsIFwiYWRtaW5cIl0pLmRlZmF1bHQoXCJ1c2VyXCIpLm5vdE51bGwoKSxcbiAgaXNBY3RpdmU6IGludChcImlzQWN0aXZlXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICBjcmVkaXRzOiBpbnQoXCJjcmVkaXRzXCIpLmRlZmF1bHQoMTAwMCkubm90TnVsbCgpLFxuICBoYXNVbmxpbWl0ZWRDcmVkaXRzOiBpbnQoXCJoYXNVbmxpbWl0ZWRDcmVkaXRzXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICAvLyBBdXRoZW50aWNhdGlvbiBmaWVsZHNcbiAgcGFzc3dvcmRIYXNoOiB2YXJjaGFyKFwicGFzc3dvcmRIYXNoXCIsIHsgbGVuZ3RoOiAyNTUgfSksXG4gIGF1dGhNZXRob2Q6IG15c3FsRW51bShcImF1dGhNZXRob2RcIiwgW1wicGFzc3dvcmRcIiwgXCJvYXV0aFwiLCBcImdvb2dsZVwiLCBcInNsYWNrXCJdKS5kZWZhdWx0KFwicGFzc3dvcmRcIiksXG4gIC8vIEVtYWlsIHZlcmlmaWNhdGlvbiBmaWVsZHNcbiAgZW1haWxWZXJpZmljYXRpb25Ub2tlbjogdmFyY2hhcihcImVtYWlsVmVyaWZpY2F0aW9uVG9rZW5cIiwgeyBsZW5ndGg6IDI1NSB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25FeHBpcmVzOiB0aW1lc3RhbXAoXCJlbWFpbFZlcmlmaWNhdGlvbkV4cGlyZXNcIiksXG4gIC8vIFBhc3N3b3JkIHJlc2V0IGZpZWxkc1xuICBwYXNzd29yZFJlc2V0VG9rZW46IHZhcmNoYXIoXCJwYXNzd29yZFJlc2V0VG9rZW5cIiwgeyBsZW5ndGg6IDI1NSB9KSxcbiAgcGFzc3dvcmRSZXNldEV4cGlyZXM6IHRpbWVzdGFtcChcInBhc3N3b3JkUmVzZXRFeHBpcmVzXCIpLFxuICAvLyBTZWN1cml0eSBmaWVsZHNcbiAgcmVnaXN0cmF0aW9uSXA6IHZhcmNoYXIoXCJyZWdpc3RyYXRpb25JcFwiLCB7IGxlbmd0aDogNDUgfSksXG4gIGxhc3RMb2dpbklwOiB2YXJjaGFyKFwibGFzdExvZ2luSXBcIiwgeyBsZW5ndGg6IDQ1IH0pLFxuICBhY3RpdmF0ZWRBdDogdGltZXN0YW1wKFwiYWN0aXZhdGVkQXRcIiksXG4gIC8vIEVudGVycHJpc2UgZmllbGRzIChhZGRlZCBpbiBNT1MgbWlncmF0aW9uKVxuICBjb21wYW55SWQ6IGludChcImNvbXBhbnlJZFwiKSxcbiAgZGVwYXJ0bWVudElkOiBpbnQoXCJkZXBhcnRtZW50SWRcIiksXG4gIG9yZ1JvbGU6IG15c3FsRW51bShcIm9yZ1JvbGVcIiwgW1wib3duZXJcIiwgXCJhZG1pblwiLCBcIm1lbWJlclwiXSkuZGVmYXVsdChcIm1lbWJlclwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBVc2VyID0gdHlwZW9mIHVzZXJzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydFVzZXIgPSB0eXBlb2YgdXNlcnMuJGluZmVySW5zZXJ0O1xuXG4vLyAgQUkgQWdlbnRzXG5leHBvcnQgY29uc3QgYWdlbnRzID0gbXlzcWxUYWJsZShcImFnZW50c1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBzbHVnOiB2YXJjaGFyKFwic2x1Z1wiLCB7IGxlbmd0aDogNjQgfSkubm90TnVsbCgpLnVuaXF1ZSgpLFxuICBuYW1lOiB2YXJjaGFyKFwibmFtZVwiLCB7IGxlbmd0aDogNjQgfSkubm90TnVsbCgpLFxuICBlbmdsaXNoTmFtZTogdmFyY2hhcihcImVuZ2xpc2hOYW1lXCIsIHsgbGVuZ3RoOiA2NCB9KSxcbiAgdGl0bGU6IHZhcmNoYXIoXCJ0aXRsZVwiLCB7IGxlbmd0aDogMTI4IH0pLm5vdE51bGwoKSxcbiAgbGF5ZXI6IG15c3FsRW51bShcImxheWVyXCIsIFtcInN0cmF0ZWd5XCIsIFwiZXhlY3V0aW9uXCIsIFwidHJhaW5pbmdcIl0pLm5vdE51bGwoKSxcbiAgYXZhdGFyVXJsOiB0ZXh0KFwiYXZhdGFyVXJsXCIpLFxuICBjb3ZlclVybDogdGV4dChcImNvdmVyVXJsXCIpLFxuICBiaW86IHRleHQoXCJiaW9cIiksXG4gIHNwZWNpYWx0eTogdGV4dChcInNwZWNpYWx0eVwiKSxcbiAga25vd2xlZGdlU291cmNlczoganNvbihcImtub3dsZWRnZVNvdXJjZXNcIikuJHR5cGU8c3RyaW5nW10+KCksXG4gIHNraWxsczoganNvbihcInNraWxsc1wiKS4kdHlwZTxzdHJpbmdbXT4oKSxcbiAgY2FzZVN0dWRpZXM6IGpzb24oXCJjYXNlU3R1ZGllc1wiKS4kdHlwZTx7IHRpdGxlOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IHJlc3VsdDogc3RyaW5nIH1bXT4oKSxcbiAgcHJpY2VNb250aGx5OiBkZWNpbWFsKFwicHJpY2VNb250aGx5XCIsIHsgcHJlY2lzaW9uOiAxMCwgc2NhbGU6IDIgfSksXG4gIHByaWNlUGVyVGFzazogZGVjaW1hbChcInByaWNlUGVyVGFza1wiLCB7IHByZWNpc2lvbjogMTAsIHNjYWxlOiAyIH0pLFxuICByYXRpbmc6IGRlY2ltYWwoXCJyYXRpbmdcIiwgeyBwcmVjaXNpb246IDMsIHNjYWxlOiAyIH0pLmRlZmF1bHQoXCI1LjAwXCIpLFxuICByZXZpZXdDb3VudDogaW50KFwicmV2aWV3Q291bnRcIikuZGVmYXVsdCgwKSxcbiAgdGFza0NvdW50OiBpbnQoXCJ0YXNrQ291bnRcIikuZGVmYXVsdCgwKSxcbiAgaXNBdmFpbGFibGU6IGJvb2xlYW4oXCJpc0F2YWlsYWJsZVwiKS5kZWZhdWx0KHRydWUpLFxuICBpc0ZlYXR1cmVkOiBib29sZWFuKFwiaXNGZWF0dXJlZFwiKS5kZWZhdWx0KGZhbHNlKSxcbiAgc29ydE9yZGVyOiBpbnQoXCJzb3J0T3JkZXJcIikuZGVmYXVsdCgwKSxcbiAgaW5kdXN0cmllczogdGV4dChcImluZHVzdHJpZXNcIiksXG4gIGV4cGVyaWVuY2VEZXRhaWw6IHRleHQoXCJleHBlcmllbmNlRGV0YWlsXCIpLFxuICBtZXRob2RvbG9neTogdGV4dChcIm1ldGhvZG9sb2d5XCIpLFxuICAvLyBDcmVhdG9yIC8gVUdDIGZpZWxkc1xuICBjcmVhdG9yVXNlcklkOiBpbnQoXCJjcmVhdG9yVXNlcklkXCIpLCAgIC8vIG51bGwgPSBwbGF0Zm9ybS1vd25lZCBhZ2VudFxuICByZXZpZXdTdGF0dXM6IG15c3FsRW51bShcInJldmlld1N0YXR1c1wiLCBbXCJwZW5kaW5nXCIsIFwiYXBwcm92ZWRcIiwgXCJyZWplY3RlZFwiXSkuZGVmYXVsdChcImFwcHJvdmVkXCIpLFxuICByZXZpZXdOb3RlOiB0ZXh0KFwicmV2aWV3Tm90ZVwiKSwgICAgICAgIC8vIGFkbWluIHJlamVjdGlvbiByZWFzb25cbiAgaGlyZUNvdW50OiBpbnQoXCJoaXJlQ291bnRcIikuZGVmYXVsdCgwKSwgICAgICAgLy8gdG90YWwgdGltZXMgaGlyZWQgYnkgb3RoZXJzXG4gIHRhc2tFYXJuQ291bnQ6IGludChcInRhc2tFYXJuQ291bnRcIikuZGVmYXVsdCgwKSwgLy8gdG90YWwgdGFza3MgY29tcGxldGVkIGVhcm5pbmcgY3JlZGl0c1xuICB0b3RhbEVhcm5lZDogaW50KFwidG90YWxFYXJuZWRcIikuZGVmYXVsdCgwKSwgICAgLy8gdG90YWwgY3JlZGl0cyBlYXJuZWQgYnkgY3JlYXRvclxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcblxuZXhwb3J0IHR5cGUgQWdlbnQgPSB0eXBlb2YgYWdlbnRzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydEFnZW50ID0gdHlwZW9mIGFnZW50cy4kaW5mZXJJbnNlcnQ7XG5cbi8vICBCcmFuZHNcbmV4cG9ydCBjb25zdCBicmFuZHMgPSBteXNxbFRhYmxlKFwiYnJhbmRzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHVzZXJJZDogaW50KFwidXNlcklkXCIpLFxuICBuYW1lOiB2YXJjaGFyKFwibmFtZVwiLCB7IGxlbmd0aDogMjU1IH0pLm5vdE51bGwoKSxcbiAgc2x1ZzogdmFyY2hhcihcInNsdWdcIiwgeyBsZW5ndGg6IDY0IH0pLm5vdE51bGwoKSxcbiAgaW5kdXN0cnk6IHZhcmNoYXIoXCJpbmR1c3RyeVwiLCB7IGxlbmd0aDogNjQgfSksXG4gIHdlYnNpdGU6IHRleHQoXCJ3ZWJzaXRlXCIpLFxuICBzb2NpYWxMaW5rczoganNvbihcInNvY2lhbExpbmtzXCIpLFxuICBkZXNjcmlwdGlvbjogdGV4dChcImRlc2NyaXB0aW9uXCIpLFxuICBsb2dvVXJsOiB0ZXh0KFwibG9nb1VybFwiKSxcbiAgb25ib2FyZGluZ1N0ZXA6IGludChcIm9uYm9hcmRpbmdTdGVwXCIpLmRlZmF1bHQoMCksXG4gIHBvc2l0aW9uaW5nU3RhdHVzOiBteXNxbEVudW0oXCJwb3NpdGlvbmluZ1N0YXR1c1wiLCBbXCJwZW5kaW5nXCIsIFwiaW5fcHJvZ3Jlc3NcIiwgXCJjb21wbGV0ZWRcIl0pLmRlZmF1bHQoXCJwZW5kaW5nXCIpLFxuICBwb3NpdGlvbmluZ1N1bW1hcnk6IHRleHQoXCJwb3NpdGlvbmluZ1N1bW1hcnlcIiksXG4gIHBvc2l0aW9uaW5nUmVwb3J0OiBqc29uKFwicG9zaXRpb25pbmdSZXBvcnRcIiksXG4gIGNyZWF0ZWRCeTogaW50KFwiY3JlYXRlZEJ5XCIpLm5vdE51bGwoKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKSxcbiAgLy8gRXh0ZW5kZWQgZmllbGRzIChvcHRpb25hbCwgZmlsbGVkIGJ5IEFJIGFuYWx5c2lzKVxuICB0YWdsaW5lOiB0ZXh0KFwidGFnbGluZVwiKSxcbiAgdGFyZ2V0QXVkaWVuY2U6IHRleHQoXCJ0YXJnZXRBdWRpZW5jZVwiKSxcbiAgYnJhbmRWb2ljZTogdGV4dChcImJyYW5kVm9pY2VcIiksXG4gIHNvd29ya0FuYWx5c2lzOiBqc29uKFwic293b3JrQW5hbHlzaXNcIikuJHR5cGU8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+KCksXG4gIGlzRGVmYXVsdDogYm9vbGVhbihcImlzRGVmYXVsdFwiKS5kZWZhdWx0KGZhbHNlKSxcbiAgLy8gXHUyNTAwXHUyNTAwIEFJIFx1NjNBOFx1NEYzMFx1NUI5QVx1NEY0RFx1NkIwNFx1NEY0RCBcdTI1MDBcdTI1MDBcbiAgdmFsdWVQcm9wb3NpdGlvbjogdGV4dChcInZhbHVlUHJvcG9zaXRpb25cIiksXG4gIHRhcmdldE1hcmtldDogdmFyY2hhcihcInRhcmdldE1hcmtldFwiLCB7IGxlbmd0aDogMTAwIH0pLFxuICBhdWRpZW5jZUE6IHZhcmNoYXIoXCJhdWRpZW5jZUFcIiwgeyBsZW5ndGg6IDEwMCB9KSxcbiAgYXVkaWVuY2VCOiB2YXJjaGFyKFwiYXVkaWVuY2VCXCIsIHsgbGVuZ3RoOiAxMDAgfSksXG4gIGVtb3Rpb25hbERpZmY6IHZhcmNoYXIoXCJlbW90aW9uYWxEaWZmXCIsIHsgbGVuZ3RoOiAyMDAgfSksXG4gIGZ1bmN0aW9uYWxEaWZmOiB2YXJjaGFyKFwiZnVuY3Rpb25hbERpZmZcIiwgeyBsZW5ndGg6IDIwMCB9KSxcbiAgaXNFc3RpbWF0ZTogdGlueWludChcImlzRXN0aW1hdGVcIikuZGVmYXVsdCgwKSxcbn0pO1xuXG5leHBvcnQgdHlwZSBCcmFuZCA9IHR5cGVvZiBicmFuZHMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0QnJhbmQgPSB0eXBlb2YgYnJhbmRzLiRpbmZlckluc2VydDtcblxuLy8gIFRhc2tzXG5leHBvcnQgY29uc3QgdGFza3MgPSBteXNxbFRhYmxlKFwidGFza3NcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLFxuICBhZ2VudElkOiBpbnQoXCJhZ2VudElkXCIpLm5vdE51bGwoKSxcbiAgYnJhbmRJZDogaW50KFwiYnJhbmRJZFwiKSwgIC8vIFdoaWNoIGJyYW5kIHRoaXMgdGFzayBiZWxvbmdzIHRvIChudWxsID0gbm8gYnJhbmQpXG4gIHBhcmVudFRhc2tJZDogaW50KFwicGFyZW50VGFza0lkXCIpLCAgLy8gRm9yIEFnZW50MkFnZW50OiB1cHN0cmVhbSB0YXNrIHRoYXQgcHJvZHVjZWQgdGhlIGlucHV0XG4gIGZvcndhcmROb3RlOiB0ZXh0KFwiZm9yd2FyZE5vdGVcIiksICAvLyBCb3NzJ3MgaW5zdHJ1Y3Rpb24gd2hlbiBmb3J3YXJkaW5nIHRhc2sgdG8gYW5vdGhlciBhZ2VudFxuICBjb252ZXJzYXRpb25JZDogaW50KFwiY29udmVyc2F0aW9uSWRcIiksXG4gIHRpdGxlOiB2YXJjaGFyKFwidGl0bGVcIiwgeyBsZW5ndGg6IDI1NiB9KS5ub3ROdWxsKCksXG4gIGRlc2NyaXB0aW9uOiB0ZXh0KFwiZGVzY3JpcHRpb25cIiksXG4gIHRhc2tUeXBlOiB2YXJjaGFyKFwidGFza1R5cGVcIiwgeyBsZW5ndGg6IDY0IH0pLFxuICBzdGF0dXM6IG15c3FsRW51bShcInN0YXR1c1wiLCBbXCJwZW5kaW5nXCIsIFwiaW5fcHJvZ3Jlc3NcIiwgXCJyZXZpZXdcIiwgXCJjb21wbGV0ZWRcIiwgXCJjYW5jZWxsZWRcIl0pLmRlZmF1bHQoXCJwZW5kaW5nXCIpLm5vdE51bGwoKSxcbiAgcHJpb3JpdHk6IG15c3FsRW51bShcInByaW9yaXR5XCIsIFtcImxvd1wiLCBcIm5vcm1hbFwiLCBcImhpZ2hcIiwgXCJ1cmdlbnRcIl0pLmRlZmF1bHQoXCJub3JtYWxcIiksXG4gIGR1ZURhdGU6IHRpbWVzdGFtcChcImR1ZURhdGVcIiksXG4gIGlzUmVjdXJyaW5nOiBib29sZWFuKFwiaXNSZWN1cnJpbmdcIikuZGVmYXVsdChmYWxzZSksXG4gIHJlY3VycmluZ1NjaGVkdWxlOiB2YXJjaGFyKFwicmVjdXJyaW5nU2NoZWR1bGVcIiwgeyBsZW5ndGg6IDY0IH0pLCAgLy8gJ2RhaWx5JyB8ICd3ZWVrbHknIHwgJ2Jpd2Vla2x5JyB8ICdtb250aGx5J1xuICBjbGllbnROYW1lOiB2YXJjaGFyKFwiY2xpZW50TmFtZVwiLCB7IGxlbmd0aDogMjU2IH0pLCAgLy8gQ2xpZW50IG5hbWUgZm9yIGFnZW5jeSB3b3JrZmxvd3NcbiAgcmVmZXJlbmNlVXJsczogdGV4dChcInJlZmVyZW5jZVVybHNcIiksICAvLyBKU09OIGFycmF5IG9mIHJlZmVyZW5jZSBVUkxzL25vdGVzXG4gIGNvbXBsZXRlZEF0OiB0aW1lc3RhbXAoXCJjb21wbGV0ZWRBdFwiKSxcbiAgcmVzdWx0OiB0ZXh0KFwicmVzdWx0XCIpLFxuICBhdHRhY2htZW50VXJsOiB0ZXh0KFwiYXR0YWNobWVudFVybFwiKSxcbiAgLy8gSlNPTjogeyB0cmlnZ2VyZWQ6IGJvb2xlYW4sIHdvcmtmbG93TmFtZTogc3RyaW5nLCBjcmVhdGVkVGFza0NvdW50OiBudW1iZXIsIGNyZWF0ZWRUYXNrSWRzOiBudW1iZXJbXSB9XG4gIHRyaWdnZXJlZFdvcmtmbG93czoganNvbihcInRyaWdnZXJlZFdvcmtmbG93c1wiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5cbmV4cG9ydCB0eXBlIFRhc2sgPSB0eXBlb2YgdGFza3MuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0VGFzayA9IHR5cGVvZiB0YXNrcy4kaW5mZXJJbnNlcnQ7XG5cbi8vICBUYXNrIEV4ZWN1dGlvbnMgKFx1NEVGQlx1NTJEOVx1NTdGN1x1ODg0Q1x1N0QwMFx1OTMwNCkgXG4vLyBFYWNoIHRpbWUgYSB0YXNrIGlzIHN0YXJ0ZWQsIGEgbmV3IGV4ZWN1dGlvbiByZWNvcmQgaXMgY3JlYXRlZC5cbi8vIFRoaXMgYWxsb3dzIHRyYWNraW5nIGhpc3RvcnksIHJldHJpZXMsIGFuZCB2aWV3aW5nIHBhc3Qgb3V0cHV0cy5cbmV4cG9ydCBjb25zdCB0YXNrRXhlY3V0aW9ucyA9IG15c3FsVGFibGUoXCJ0YXNrX2V4ZWN1dGlvbnNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgdGFza0lkOiBpbnQoXCJ0YXNrSWRcIikubm90TnVsbCgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGFnZW50SWQ6IGludChcImFnZW50SWRcIikubm90TnVsbCgpLFxuICBzdGF0dXM6IG15c3FsRW51bShcInN0YXR1c1wiLCBbXCJydW5uaW5nXCIsIFwiY29tcGxldGVkXCIsIFwiZmFpbGVkXCIsIFwiY2FuY2VsbGVkXCJdKS5kZWZhdWx0KFwicnVubmluZ1wiKS5ub3ROdWxsKCksXG4gIC8vIFRoZSBwcm9tcHQgc2VudCB0byB0aGUgQUkgKHRhc2sgdGl0bGUgKyBkZXNjcmlwdGlvbiArIGJyYW5kIGNvbnRleHQpXG4gIHByb21wdDogdGV4dChcInByb21wdFwiKSxcbiAgLy8gVGhlIEFJLWdlbmVyYXRlZCBvdXRwdXQgKG1hcmtkb3duKVxuICBvdXRwdXQ6IGxvbmd0ZXh0KFwib3V0cHV0XCIpLFxuICAvLyBFcnJvciBtZXNzYWdlIGlmIGZhaWxlZFxuICBlcnJvck1lc3NhZ2U6IHRleHQoXCJlcnJvck1lc3NhZ2VcIiksXG4gIC8vIEV4ZWN1dGlvbiB0aW1pbmdcbiAgc3RhcnRlZEF0OiB0aW1lc3RhbXAoXCJzdGFydGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgY29tcGxldGVkQXQ6IHRpbWVzdGFtcChcImNvbXBsZXRlZEF0XCIpLFxuICBkdXJhdGlvbk1zOiBpbnQoXCJkdXJhdGlvbk1zXCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBUYXNrRXhlY3V0aW9uID0gdHlwZW9mIHRhc2tFeGVjdXRpb25zLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydFRhc2tFeGVjdXRpb24gPSB0eXBlb2YgdGFza0V4ZWN1dGlvbnMuJGluZmVySW5zZXJ0O1xuXG4vLyAtLSBUYXNrIFdvcmtmbG93cyAoQXV0b21hdGljIFRyaWdnZXJzKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gXHU4MUVBXHU1MkQ1XHU1REU1XHU0RjVDXHU2RDQxXHVGRjFBXHU0RUZCXHU1MkQ5XHU1QjhDXHU2MjEwXHU1RjhDXHU4MUVBXHU1MkQ1XHU4OUY4XHU3NjdDXHU0RTBCXHU2RTM4XHU0RUZCXHU1MkQ5XG4vLyBcdTRGOEJcdTU5ODJcdUZGMUFcdTMwMENcdTdBRjZcdTU0QzFcdTUyMDZcdTY3OTBcdTMwMERcdTVCOENcdTYyMTAgXHUyMTkyIFx1ODFFQVx1NTJENVx1ODlGOFx1NzY3Q1x1MzAwQ0ZhY2Vib29rIFx1OENCQ1x1NjU4N1x1NjRCMFx1NUJFQlx1MzAwRFxuZXhwb3J0IGNvbnN0IHRhc2tXb3JrZmxvd3MgPSBteXNxbFRhYmxlKFwidGFza193b3JrZmxvd3NcIiwge1xuICBpZDogaW50KFwiaWRcIikucHJpbWFyeUtleSgpLmF1dG9pbmNyZW1lbnQoKSxcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLFxuICBicmFuZElkOiBpbnQoXCJicmFuZElkXCIpLFxuICBuYW1lOiB2YXJjaGFyKFwibmFtZVwiLCB7IGxlbmd0aDogMjU1IH0pLm5vdE51bGwoKSxcbiAgZGVzY3JpcHRpb246IHRleHQoXCJkZXNjcmlwdGlvblwiKSxcbiAgLy8gXHU4OUY4XHU3NjdDXHU2ODlEXHU0RUY2XHVGRjFBXHU1NEVBXHU1MDBCIEFJIFx1NTRFMVx1NURFNVx1NzY4NFx1NEVGQlx1NTJEOVx1NUI4Q1x1NjIxMFx1NUY4Q1x1ODlGOFx1NzY3Q1xuICB0cmlnZ2VyQWdlbnRTbHVnOiB2YXJjaGFyKFwidHJpZ2dlckFnZW50U2x1Z1wiLCB7IGxlbmd0aDogMTI4IH0pLFxuICB0cmlnZ2VyVGFza1R5cGU6IHZhcmNoYXIoXCJ0cmlnZ2VyVGFza1R5cGVcIiwgeyBsZW5ndGg6IDEyOCB9KSxcbiAgLy8gXHU0RTBCXHU2RTM4XHU2QjY1XHU5QTVGXHVGRjA4SlNPTiBcdTk2NjNcdTUyMTdcdUZGMDlcbiAgLy8gW3sgYWdlbnRTbHVnOiBcIndhbmctc2hvcnQtdmlkZW9cIiwgdGFza1RpdGxlOiBcIlx1NjRCMFx1NUJFQlx1NzdFRFx1NUY3MVx1OTdGM1x1ODE3M1x1NjcyQ1wiLCB0YXNrRGVzY3JpcHRpb246IFwiLi4uXCIsIGRlbGF5TWludXRlczogMCB9XVxuICBzdGVwczoganNvbihcInN0ZXBzXCIpLm5vdE51bGwoKSxcbiAgaXNBY3RpdmU6IGJvb2xlYW4oXCJpc0FjdGl2ZVwiKS5kZWZhdWx0KHRydWUpLm5vdE51bGwoKSxcbiAgLy8gXHU3RDcxXHU4QTA4XG4gIHRyaWdnZXJDb3VudDogaW50KFwidHJpZ2dlckNvdW50XCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICBsYXN0VHJpZ2dlcmVkQXQ6IHRpbWVzdGFtcChcImxhc3RUcmlnZ2VyZWRBdFwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBUYXNrV29ya2Zsb3cgPSB0eXBlb2YgdGFza1dvcmtmbG93cy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRUYXNrV29ya2Zsb3cgPSB0eXBlb2YgdGFza1dvcmtmbG93cy4kaW5mZXJJbnNlcnQ7XG5cbi8vICBBZ2VudCBMZWFybmluZ3MgKEFJIFx1NTRFMVx1NURFNVx1NTAwQlx1NEVCQVx1NUI3OFx1N0ZEMlx1OEExOFx1OTMwNCkgXG4vLyBcdTZCQ0ZcdTZCMjFcdTRFRkJcdTUyRDlcdTVCOENcdTYyMTBcdTVGOENcdTgxRUFcdTUyRDVcdThBMThcdTkzMDRcdUZGMENcdTc1MjhcdTYyMzZcdTUzQ0RcdTk5NEJcdTVGOENcdTY2RjRcdTY1QjBcdThBNTVcdTUyMDZcbi8vIGlzUHJpdmF0ZT10cnVlOiBcdTY3MDhcdTc5REYvXHU1NzE4XHU5NjhBXHU1NzhCXHVGRjBDXHU1Qjc4XHU3RkQyXHU4QTE4XHU5MzA0XHU1QzZDXHU1NEMxXHU3MjRDXHU3OUMxXHU2NzA5XHVGRjBDXHU1M0VBXHU2Q0U4XHU1MTY1XHU1NDBDXHU1NEMxXHU3MjRDXHU0RUZCXHU1MkQ5XG4vLyBpc1ByaXZhdGU9ZmFsc2U6IFx1NEVGQlx1NTJEOVx1NTc4Qlx1RkYwQ1x1NUI3OFx1N0ZEMlx1OEExOFx1OTMwNFx1NzBCQVx1NTE2Q1x1NTE3MVx1OENDN1x1NzUyMlx1RkYwQ1x1NTNFRlx1NkNFOFx1NTE2NVx1NjI0MFx1NjcwOVx1NzUyOFx1NjIzNlx1NzY4NFx1NEVGQlx1NTJEOVxuZXhwb3J0IGNvbnN0IGFnZW50TGVhcm5pbmdzID0gbXlzcWxUYWJsZShcImFnZW50X2xlYXJuaW5nc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBhZ2VudElkOiBpbnQoXCJhZ2VudElkXCIpLm5vdE51bGwoKSxcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLFxuICBicmFuZElkOiBpbnQoXCJicmFuZElkXCIpLFxuICB0YXNrSWQ6IGludChcInRhc2tJZFwiKSxcbiAgLy8gXHU4QTAyXHU5NUIxXHU5ODVFXHU1NzhCXHU2QzdBXHU1QjlBXHU5NkIxXHU3OUMxXHU2MDI3XG4gIHN1YnNjcmlwdGlvblBsYW46IG15c3FsRW51bShcInN1YnNjcmlwdGlvblBsYW5cIiwgW1wicGVyX3Rhc2tcIiwgXCJtb250aGx5XCIsIFwidGVhbVwiXSkubm90TnVsbCgpLFxuICAvLyBpc1ByaXZhdGU9dHJ1ZTogXHU2NzA4XHU3OURGL1x1NTcxOFx1OTY4QVx1NTc4Qlx1RkYwQ1x1NTNFQVx1NUMwRFx1NTQwQ1x1NTRDMVx1NzI0Q1x1NTNFRlx1ODk4QjsgaXNQcml2YXRlPWZhbHNlOiBcdTRFRkJcdTUyRDlcdTU3OEJcdUZGMENcdTUxNkNcdTUxNzFcdTUxNzFcdTRFQUJcbiAgaXNQcml2YXRlOiBib29sZWFuKFwiaXNQcml2YXRlXCIpLmRlZmF1bHQoZmFsc2UpLm5vdE51bGwoKSxcbiAgLy8gXHU0RUZCXHU1MkQ5XHU2NDU4XHU4OTgxXHVGRjA4XHU3NTI4XHU2NUJDXHU2NzJBXHU0Rjg2XHU3NkY4XHU0RjNDXHU0RUZCXHU1MkQ5XHU3Njg0XHU0RTBBXHU0RTBCXHU2NTg3XHU2Q0U4XHU1MTY1XHVGRjA5XG4gIHRhc2tUaXRsZTogdmFyY2hhcihcInRhc2tUaXRsZVwiLCB7IGxlbmd0aDogMjU1IH0pLm5vdE51bGwoKSxcbiAgdGFza0Rlc2NyaXB0aW9uOiB0ZXh0KFwidGFza0Rlc2NyaXB0aW9uXCIpLFxuICB0YXNrVHlwZTogdmFyY2hhcihcInRhc2tUeXBlXCIsIHsgbGVuZ3RoOiA2NCB9KSxcbiAgLy8gQUkgXHU3NTIyXHU1MUZBXHU2NDU4XHU4OTgxXHVGRjA4XHU1MjREIDUwMCBcdTVCNTdcdUZGMENcdTc1MjhcdTY1QkNcdTVCNzhcdTdGRDJcdTZDRThcdTUxNjVcdUZGMDlcbiAgb3V0cHV0U3VtbWFyeTogdGV4dChcIm91dHB1dFN1bW1hcnlcIiksXG4gIC8vIFx1NUI4Q1x1NjU3NFx1NzUyMlx1NTFGQVx1RkYwOFx1NEY5Qlx1NkRGMVx1NUVBNlx1NUI3OFx1N0ZEMlx1NTIwNlx1Njc5MFx1RkYwOVxuICBmdWxsT3V0cHV0OiBsb25ndGV4dChcImZ1bGxPdXRwdXRcIiksXG4gIC8vIFx1NzUyOFx1NjIzNlx1NTNDRFx1OTk0QlxuICB1c2VyUmF0aW5nOiBpbnQoXCJ1c2VyUmF0aW5nXCIpLCAgLy8gMS01IFx1NjYxRlxuICB1c2VyRmVlZGJhY2s6IHRleHQoXCJ1c2VyRmVlZGJhY2tcIiksICAvLyBcdTY1ODdcdTVCNTdcdTUzQ0RcdTk5NEJcbiAgZmVlZGJhY2tBdDogdGltZXN0YW1wKFwiZmVlZGJhY2tBdFwiKSxcbiAgLy8gXHU1NEMxXHU3MjRDXHU0RTBBXHU0RTBCXHU2NTg3XHU1RkVCXHU3MTY3XHVGRjA4XHU0RUZCXHU1MkQ5XHU1N0Y3XHU4ODRDXHU2NjQyXHU3Njg0XHU1NEMxXHU3MjRDXHU4Q0M3XHU4QTBBXHVGRjA5XG4gIGJyYW5kQ29udGV4dDoganNvbihcImJyYW5kQ29udGV4dFwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBBZ2VudExlYXJuaW5nID0gdHlwZW9mIGFnZW50TGVhcm5pbmdzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydEFnZW50TGVhcm5pbmcgPSB0eXBlb2YgYWdlbnRMZWFybmluZ3MuJGluZmVySW5zZXJ0O1xuXG4vLyAgU3Vic2NyaXB0aW9ucyAoSGlyZWQgQWdlbnRzKVxuZXhwb3J0IGNvbnN0IHN1YnNjcmlwdGlvbnMgPSBteXNxbFRhYmxlKFwic3Vic2NyaXB0aW9uc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGFnZW50SWQ6IGludChcImFnZW50SWRcIikubm90TnVsbCgpLFxuICBicmFuZElkOiBpbnQoXCJicmFuZElkXCIpLCAgLy8gV2hpY2ggYnJhbmQgdGhpcyBBSSBpcyBoaXJlZCBmb3IgKG51bGwgPSBhbGwgYnJhbmRzKVxuICBwbGFuOiBteXNxbEVudW0oXCJwbGFuXCIsIFtcInBlcl90YXNrXCIsIFwibW9udGhseVwiLCBcInRlYW1cIl0pLm5vdE51bGwoKSxcbiAgc3RhdHVzOiBteXNxbEVudW0oXCJzdGF0dXNcIiwgW1wiYWN0aXZlXCIsIFwicGF1c2VkXCIsIFwiY2FuY2VsbGVkXCIsIFwiZXhwaXJlZFwiXSkuZGVmYXVsdChcImFjdGl2ZVwiKS5ub3ROdWxsKCksXG4gIHN0cmlwZVN1YnNjcmlwdGlvbklkOiB2YXJjaGFyKFwic3RyaXBlU3Vic2NyaXB0aW9uSWRcIiwgeyBsZW5ndGg6IDEyOCB9KSxcbiAgc3RyaXBlQ3VzdG9tZXJJZDogdmFyY2hhcihcInN0cmlwZUN1c3RvbWVySWRcIiwgeyBsZW5ndGg6IDEyOCB9KSxcbiAgY3VycmVudFBlcmlvZFN0YXJ0OiB0aW1lc3RhbXAoXCJjdXJyZW50UGVyaW9kU3RhcnRcIiksXG4gIGN1cnJlbnRQZXJpb2RFbmQ6IHRpbWVzdGFtcChcImN1cnJlbnRQZXJpb2RFbmRcIiksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG4gIHVwZGF0ZWRBdDogdGltZXN0YW1wKFwidXBkYXRlZEF0XCIpLmRlZmF1bHROb3coKS5vblVwZGF0ZU5vdygpLm5vdE51bGwoKSxcbn0pO1xuXG5leHBvcnQgdHlwZSBTdWJzY3JpcHRpb24gPSB0eXBlb2Ygc3Vic2NyaXB0aW9ucy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRTdWJzY3JpcHRpb24gPSB0eXBlb2Ygc3Vic2NyaXB0aW9ucy4kaW5mZXJJbnNlcnQ7XG5cbi8vICBVc2VyIENyZWRpdHMgV2FsbGV0IChcdTc1MjhcdTYyMzZcdTlFREVcdTY1NzhcdTkzMjJcdTUzMDUpIFxuLy8gVHJhY2tzIGVhY2ggdXNlcidzIG1vbnRobHkgY3JlZGl0cyBiYWxhbmNlIGFuZCB1c2FnZVxuZXhwb3J0IGNvbnN0IHVzZXJDcmVkaXRzID0gbXlzcWxUYWJsZShcInVzZXJfY3JlZGl0c1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCkudW5pcXVlKCksXG4gIC8vIE1vbnRobHkgcGxhbiBjcmVkaXRzIChyZXNldCBlYWNoIGJpbGxpbmcgY3ljbGUpXG4gIHBsYW5DcmVkaXRzOiBpbnQoXCJwbGFuQ3JlZGl0c1wiKS5kZWZhdWx0KDApLm5vdE51bGwoKSwgICAgICAgLy8gY3JlZGl0cyBpbmNsdWRlZCBpbiBjdXJyZW50IHBsYW5cbiAgdXNlZENyZWRpdHM6IGludChcInVzZWRDcmVkaXRzXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLCAgICAgICAvLyBjcmVkaXRzIGNvbnN1bWVkIHRoaXMgY3ljbGVcbiAgLy8gRXh0cmEgcHVyY2hhc2VkIGNyZWRpdHMgKGRvIE5PVCByZXNldCBtb250aGx5KVxuICBleHRyYUNyZWRpdHM6IGludChcImV4dHJhQ3JlZGl0c1wiKS5kZWZhdWx0KDApLm5vdE51bGwoKSxcbiAgLy8gQ3VycmVudCBwbGFuIHRpZXJcbiAgcGxhblRpZXI6IG15c3FsRW51bShcInBsYW5UaWVyXCIsIFtcImNvbW11bml0eVwiLCBcImludGVncmF0aW9uXCIsIFwiZW50ZXJwcmlzZVwiLCBcInRyaWFsXCJdKS5kZWZhdWx0KFwidHJpYWxcIikubm90TnVsbCgpLFxuICAvLyBCaWxsaW5nIGN5Y2xlXG4gIGN5Y2xlU3RhcnQ6IHRpbWVzdGFtcChcImN5Y2xlU3RhcnRcIiksXG4gIGN5Y2xlRW5kOiB0aW1lc3RhbXAoXCJjeWNsZUVuZFwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5cbmV4cG9ydCB0eXBlIFVzZXJDcmVkaXRzID0gdHlwZW9mIHVzZXJDcmVkaXRzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydFVzZXJDcmVkaXRzID0gdHlwZW9mIHVzZXJDcmVkaXRzLiRpbmZlckluc2VydDtcblxuLy8gIENyZWRpdHMgVXNhZ2UgTG9nIChcdTlFREVcdTY1NzhcdTZEODhcdTgwMTdcdThBMThcdTkzMDQpIFxuLy8gRXZlcnkgY3JlZGl0IGRlZHVjdGlvbiBpcyBsb2dnZWQgaGVyZSBmb3IgdHJhbnNwYXJlbmN5IGFuZCBhdWRpdFxuZXhwb3J0IGNvbnN0IGNyZWRpdHNVc2FnZUxvZyA9IG15c3FsVGFibGUoXCJjcmVkaXRzX3VzYWdlX2xvZ1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGFnZW50SWQ6IGludChcImFnZW50SWRcIiksICAgICAgICAgICAgICAvLyB3aGljaCBBSSBhZ2VudCB3YXMgaW52b2x2ZWRcbiAgLy8gV2hhdCB0cmlnZ2VyZWQgdGhpcyBkZWR1Y3Rpb25cbiAgYWN0aW9uVHlwZTogbXlzcWxFbnVtKFwiYWN0aW9uVHlwZVwiLCBbXG4gICAgXCJhZG9wdF9wcm9wb3NhbFwiLCAgICAgICAgLy8gXHU2M0ExXHU3NTI4IEFJIFx1NTRFMVx1NURFNVx1NEUzQlx1NTJENVx1NjNEMFx1Njg0OFxuICAgIFwiYWRvcHRfcmVwb3J0XCIsICAgICAgICAgIC8vIFx1NjNBMVx1NzUyOFx1N0FGNlx1NTRDMS9cdTU0QzFcdTcyNENcdTUwNjVcdTVFQjdcdTU4MzFcdTU0NEFcbiAgICBcImFkb3B0X3NjaGVkdWxlXCIsICAgICAgICAvLyBcdTYzQTFcdTc1MjhcdTYzOTJcdTdBMEJcdTVFRkFcdThCNzBcbiAgICBcImFkb3B0X2RyYWZ0XCIsICAgICAgICAgICAvLyBcdTYzQTFcdTc1MjhcdTgxRUFcdTUyRDVcdTgzNDlcdTdBM0ZcbiAgICBcImFkb3B0X2NvbGxhYm9yYXRpb25cIiwgICAvLyBcdTYzQTFcdTc1MjhcdThERThcdTU0RTFcdTVERTVcdTUzNTRcdTRGNUNcdTYyMTBcdTY3OUNcbiAgICBcIm1hbnVhbF90YXNrXCIsICAgICAgICAgICAvLyBcdTc1MjhcdTYyMzZcdTRFM0JcdTUyRDVcdTYzMDdcdTZEM0VcdTRFRkJcdTUyRDlcdUZGMDhcdTY3MDhcdTc5REZcdTUzMDVcdTU0MkJcdUZGMENcdThBMThcdTkzMDRcdTRGNDZcdTRFMERcdTYyNjNcdThDQkJcdUZGMDlcbiAgICBcImNoYXRfbWVzc2FnZVwiLCAgICAgICAgICAvLyBcdTVDMERcdThBNzFcdUZGMDhcdTY3MDhcdTc5REZcdTUzMDVcdTU0MkJcdUZGMENcdThBMThcdTkzMDRcdTRGNDZcdTRFMERcdTYyNjNcdThDQkJcdUZGMDlcbiAgICBcImV4dHJhX3B1cmNoYXNlXCIsICAgICAgICAvLyBcdTUyQTBcdThDRkNcdTlFREVcdTY1NzhcdUZGMDhcdTZCNjNcdTY1NzhcdUZGMENcdTU4OUVcdTUyQTBcdUZGMDlcbiAgICBcInBsYW5fcmVuZXdhbFwiLCAgICAgICAgICAvLyBcdTY1QjlcdTY4NDhcdTdFOENcdThBMDJcdUZGMDhcdTZCNjNcdTY1NzhcdUZGMENcdTkxQ0RcdTdGNkVcdUZGMDlcbiAgXSkubm90TnVsbCgpLFxuICAvLyBDcmVkaXQgYW1vdW50OiBuZWdhdGl2ZSA9IGNvbnN1bWVkLCBwb3NpdGl2ZSA9IGFkZGVkXG4gIGNyZWRpdHNBbW91bnQ6IGludChcImNyZWRpdHNBbW91bnRcIikubm90TnVsbCgpLFxuICAvLyBDYWxjdWxhdGlvbiBicmVha2Rvd24gKGZvciB0cmFuc3BhcmVuY3kpXG4gIGJhc2VDcmVkaXRzOiBpbnQoXCJiYXNlQ3JlZGl0c1wiKSxcbiAga25vd2xlZGdlRGVwdGhGYWN0b3I6IGRlY2ltYWwoXCJrbm93bGVkZ2VEZXB0aEZhY3RvclwiLCB7IHByZWNpc2lvbjogNCwgc2NhbGU6IDIgfSksXG4gIGluc3RydWN0aW9uQ29tcGxleGl0eUZhY3RvcjogZGVjaW1hbChcImluc3RydWN0aW9uQ29tcGxleGl0eUZhY3RvclwiLCB7IHByZWNpc2lvbjogNCwgc2NhbGU6IDIgfSksXG4gIG91dHB1dFNjYWxlRmFjdG9yOiBkZWNpbWFsKFwib3V0cHV0U2NhbGVGYWN0b3JcIiwgeyBwcmVjaXNpb246IDQsIHNjYWxlOiAyIH0pLFxuICByYWdRdWVyeUNyZWRpdHM6IGludChcInJhZ1F1ZXJ5Q3JlZGl0c1wiKS5kZWZhdWx0KDApLFxuICByYW5kb21WYXJpYXRpb246IGRlY2ltYWwoXCJyYW5kb21WYXJpYXRpb25cIiwgeyBwcmVjaXNpb246IDUsIHNjYWxlOiAyIH0pLFxuICAvLyBUb2tlbiBzdGF0cyBmcm9tIExMTSBBUElcbiAgaW5wdXRUb2tlbnM6IGludChcImlucHV0VG9rZW5zXCIpLFxuICBvdXRwdXRUb2tlbnM6IGludChcIm91dHB1dFRva2Vuc1wiKSxcbiAgLy8gQ29udGV4dFxuICB0YXNrSWQ6IGludChcInRhc2tJZFwiKSxcbiAgY29udmVyc2F0aW9uSWQ6IGludChcImNvbnZlcnNhdGlvbklkXCIpLFxuICBwcm9wb3NhbElkOiBpbnQoXCJwcm9wb3NhbElkXCIpLCAgICAgICAvLyBsaW5rcyB0byBhZ2VudF9wcm9wb3NhbHMgdGFibGVcbiAgZGVzY3JpcHRpb246IHRleHQoXCJkZXNjcmlwdGlvblwiKSwgICAgLy8gaHVtYW4tcmVhZGFibGUgc3VtbWFyeVxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5cbmV4cG9ydCB0eXBlIENyZWRpdHNVc2FnZUxvZyA9IHR5cGVvZiBjcmVkaXRzVXNhZ2VMb2cuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0Q3JlZGl0c1VzYWdlTG9nID0gdHlwZW9mIGNyZWRpdHNVc2FnZUxvZy4kaW5mZXJJbnNlcnQ7XG5cbi8vICBFbnRlcnByaXNlIENyZWRpdHMgUG9vbCAoXHU0RjAxXHU2OTZEXHU3MjQ4XHU1MTcxXHU3NTI4XHU5RURFXHU2NTc4XHU2QzYwKSBcbi8vIFdvcmtzcGFjZSBvd25lcnMgY2FuIG1haW50YWluIGEgc2hhcmVkIGNyZWRpdHMgcG9vbCBmb3IgdGhlaXIgdGVhbS5cbi8vIE1lbWJlcnMgZHJhdyBmcm9tIHRoaXMgcG9vbCB3aGVuIHRoZXkgY29uc3VtZSBjcmVkaXRzLlxuLy8gVGhlIHBvb2wgaXMgc2VwYXJhdGUgZnJvbSB0aGUgb3duZXIncyBwZXJzb25hbCBjcmVkaXRzIHdhbGxldC5cbmV4cG9ydCBjb25zdCBlbnRlcnByaXNlQ3JlZGl0c1Bvb2wgPSBteXNxbFRhYmxlKFwiZW50ZXJwcmlzZV9jcmVkaXRzX3Bvb2xcIiwge1xuICBpZDogaW50KFwiaWRcIikucHJpbWFyeUtleSgpLmF1dG9pbmNyZW1lbnQoKSxcbiAgb3duZXJJZDogaW50KFwib3duZXJJZFwiKS5ub3ROdWxsKCkudW5pcXVlKCksICAgLy8gd29ya3NwYWNlIG93bmVyJ3MgdXNlcklkXG4gIHRvdGFsQ3JlZGl0czogaW50KFwidG90YWxDcmVkaXRzXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLCAgIC8vIHRvdGFsIGNyZWRpdHMgYWRkZWRcbiAgdXNlZENyZWRpdHM6IGludChcInVzZWRDcmVkaXRzXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLCAgICAgLy8gdG90YWwgY3JlZGl0cyBjb25zdW1lZCBieSBtZW1iZXJzXG4gIC8vIFBlci1tZW1iZXIgYWxsb2NhdGlvbiBjYXAgKDAgPSB1bmxpbWl0ZWQgZnJvbSBwb29sKVxuICBtZW1iZXJNb250aGx5TGltaXQ6IGludChcIm1lbWJlck1vbnRobHlMaW1pdFwiKS5kZWZhdWx0KDApLm5vdE51bGwoKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBFbnRlcnByaXNlQ3JlZGl0c1Bvb2wgPSB0eXBlb2YgZW50ZXJwcmlzZUNyZWRpdHNQb29sLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydEVudGVycHJpc2VDcmVkaXRzUG9vbCA9IHR5cGVvZiBlbnRlcnByaXNlQ3JlZGl0c1Bvb2wuJGluZmVySW5zZXJ0O1xuXG4vLyAgRW50ZXJwcmlzZSBXb3Jrc3BhY2UgTWVtYmVycyAoXHU0RjAxXHU2OTZEXHU3MjQ4XHU1MTcxXHU3NTI4XHU1REU1XHU0RjVDXHU1MzQwXHU2MjEwXHU1NEUxKSBcbi8vIFJlcHJlc2VudHMgcmVhbCB1c2VycyB3aG8gaGF2ZSBiZWVuIGludml0ZWQgdG8gc2hhcmUgYSB3b3Jrc3BhY2UuXG4vLyBUaGUgd29ya3NwYWNlIG93bmVyIGlzIGlkZW50aWZpZWQgYnkgb3duZXJJZC5cbi8vIE1lbWJlcnMgY2FuIGFjY2VzcyBvd25lcidzIGJyYW5kcywgQUkgYWdlbnRzLCBhbmQgYnJhbmQga25vd2xlZGdlIGJhc2UuXG5leHBvcnQgY29uc3QgZW50ZXJwcmlzZU1lbWJlcnMgPSBteXNxbFRhYmxlKFwiZW50ZXJwcmlzZV9tZW1iZXJzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLnByaW1hcnlLZXkoKS5hdXRvaW5jcmVtZW50KCksXG4gIG93bmVySWQ6IGludChcIm93bmVySWRcIikubm90TnVsbCgpLCAgICAgICAgICAgIC8vIHdvcmtzcGFjZSBvd25lcidzIHVzZXJJZFxuICBtZW1iZXJJZDogaW50KFwibWVtYmVySWRcIiksICAgICAgICAgICAgICAgICAgICAvLyBpbnZpdGVkIHVzZXIncyB1c2VySWQgKG51bGwgdW50aWwgYWNjZXB0ZWQpXG4gIGVtYWlsOiB2YXJjaGFyKFwiZW1haWxcIiwgeyBsZW5ndGg6IDMyMCB9KS5ub3ROdWxsKCksIC8vIGludml0ZWQgZW1haWxcbiAgbmFtZTogdmFyY2hhcihcIm5hbWVcIiwgeyBsZW5ndGg6IDEyOCB9KSwgICAgICAgLy8gZGlzcGxheSBuYW1lIChmaWxsZWQgYWZ0ZXIgYWNjZXB0KVxuICByb2xlOiBteXNxbEVudW0oXCJyb2xlXCIsIFtcImFkbWluXCIsIFwibWVtYmVyXCJdKS5kZWZhdWx0KFwibWVtYmVyXCIpLm5vdE51bGwoKSxcbiAgc3RhdHVzOiBteXNxbEVudW0oXCJzdGF0dXNcIiwgW1wicGVuZGluZ1wiLCBcImFjdGl2ZVwiLCBcInJlbW92ZWRcIl0pLmRlZmF1bHQoXCJwZW5kaW5nXCIpLm5vdE51bGwoKSxcbiAgaW52aXRlVG9rZW46IHZhcmNoYXIoXCJpbnZpdGVUb2tlblwiLCB7IGxlbmd0aDogMTI4IH0pLnVuaXF1ZSgpLFxuICBpbnZpdGVFeHBpcmVzQXQ6IGludChcImludml0ZUV4cGlyZXNBdFwiKSwgICAgICAvLyBVbml4IHRpbWVzdGFtcCAoc2Vjb25kcylcbiAgam9pbmVkQXQ6IHRpbWVzdGFtcChcImpvaW5lZEF0XCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIEVudGVycHJpc2VNZW1iZXIgPSB0eXBlb2YgZW50ZXJwcmlzZU1lbWJlcnMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0RW50ZXJwcmlzZU1lbWJlciA9IHR5cGVvZiBlbnRlcnByaXNlTWVtYmVycy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBORVc6IFRva2VuIFVzYWdlIExvZ3MgKFx1NTM5Rlx1NTlDQiBUb2tlbiBcdTVFMzNcdTY3MkMpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUmVjb3JkcyBldmVyeSBMTE0gQVBJIGNhbGwgd2l0aCBwcm92aWRlciwgdG9rZW5zIHVzZWQsIGFuZCBjb3N0LlxuLy8gVXNlZCBmb3IgYmlsbGluZywgYXVkaXRpbmcsIGFuZCBwZXItdXNlciBjb3N0IGFuYWx5c2lzLlxuZXhwb3J0IGNvbnN0IHRva2VuVXNhZ2VMb2dzID0gbXlzcWxUYWJsZShcInRva2VuX3VzYWdlX2xvZ3NcIiwge1xuICBpZDogdmFyY2hhcihcImlkXCIsIHsgbGVuZ3RoOiAzNiB9KS5wcmltYXJ5S2V5KCksIC8vIFVVSURcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLFxuICB1c2VyQXBpS2V5OiB2YXJjaGFyKFwidXNlckFwaUtleVwiLCB7IGxlbmd0aDogNjQgfSkubm90TnVsbCgpLFxuICB0ZW5hbnRJZDogaW50KFwidGVuYW50SWRcIiksXG4gIHRhc2tJZDogaW50KFwidGFza0lkXCIpLFxuICBhZ2VudElkOiBpbnQoXCJhZ2VudElkXCIpLFxuICBhY3Rpb25UeXBlOiB2YXJjaGFyKFwiYWN0aW9uVHlwZVwiLCB7IGxlbmd0aDogNTAgfSkubm90TnVsbCgpLFxuICBwcm92aWRlcjogbXlzcWxFbnVtKFwicHJvdmlkZXJcIiwgW1wib3BlbmFpXCIsIFwiemhpcHVcIiwgXCJxd2VuXCIsIFwicGVycGxleGl0eVwiLCBcImdvb2dsZVwiLCBcImNvaGVyZVwiLCBcImZvcmdlXCJdKS5ub3ROdWxsKCksXG4gIG1vZGVsOiB2YXJjaGFyKFwibW9kZWxcIiwgeyBsZW5ndGg6IDgwIH0pLm5vdE51bGwoKSxcbiAgcHJvbXB0VG9rZW5zOiBpbnQoXCJwcm9tcHRUb2tlbnNcIikuZGVmYXVsdCgwKS5ub3ROdWxsKCksXG4gIGNvbXBsZXRpb25Ub2tlbnM6IGludChcImNvbXBsZXRpb25Ub2tlbnNcIikuZGVmYXVsdCgwKS5ub3ROdWxsKCksXG4gIHRvdGFsVG9rZW5zOiBpbnQoXCJ0b3RhbFRva2Vuc1wiKS5kZWZhdWx0KDApLm5vdE51bGwoKSxcbiAgcmF3Q29zdFVzZDogZGVjaW1hbChcInJhd0Nvc3RVc2RcIiwgeyBwcmVjaXNpb246IDEwLCBzY2FsZTogNiB9KS5kZWZhdWx0KFwiMFwiKS5ub3ROdWxsKCksXG4gIG1hcmt1cEZhY3RvcjogZGVjaW1hbChcIm1hcmt1cEZhY3RvclwiLCB7IHByZWNpc2lvbjogNSwgc2NhbGU6IDIgfSkuZGVmYXVsdChcIjUuMFwiKS5ub3ROdWxsKCksXG4gIGNyZWRpdHNDaGFyZ2VkOiBpbnQoXCJjcmVkaXRzQ2hhcmdlZFwiKS5kZWZhdWx0KDApLm5vdE51bGwoKSxcbiAgbGF0ZW5jeU1zOiBpbnQoXCJsYXRlbmN5TXNcIiksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIFRva2VuVXNhZ2VMb2cgPSB0eXBlb2YgdG9rZW5Vc2FnZUxvZ3MuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0VG9rZW5Vc2FnZUxvZyA9IHR5cGVvZiB0b2tlblVzYWdlTG9ncy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBORVc6IFVzZXIgQVBJIEtleXMgKFx1NzUyOFx1NjIzNlx1OEI1OFx1NTIyNVx1NzhCQykgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBVc2VycyBjYW4gZ2VuZXJhdGUgQVBJIGtleXMgdG8gYXV0aGVudGljYXRlIGNhbGxzIGZyb20gZXh0ZXJuYWwgdG9vbHMuXG4vLyBLZXkgZm9ybWF0OiAnc3cteHh4eHh4eHh4eHh4eHh4eCcgKHByZWZpeCAnc3ctJyBmb3IgU29Xb3JrKS5cbmV4cG9ydCBjb25zdCB1c2VyQXBpS2V5cyA9IG15c3FsVGFibGUoXCJ1c2VyX2FwaV9rZXlzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHVzZXJJZDogaW50KFwidXNlcklkXCIpLm5vdE51bGwoKSxcbiAgYXBpS2V5OiB2YXJjaGFyKFwiYXBpS2V5XCIsIHsgbGVuZ3RoOiA2NCB9KS5ub3ROdWxsKCkudW5pcXVlKCksIC8vICdzdy14eHh4eHh4eHh4eHh4eHh4J1xuICBsYWJlbDogdmFyY2hhcihcImxhYmVsXCIsIHsgbGVuZ3RoOiAxMDAgfSksXG4gIGlzQWN0aXZlOiBib29sZWFuKFwiaXNBY3RpdmVcIikuZGVmYXVsdCh0cnVlKS5ub3ROdWxsKCksXG4gIGxhc3RVc2VkOiB0aW1lc3RhbXAoXCJsYXN0VXNlZFwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgVXNlckFwaUtleSA9IHR5cGVvZiB1c2VyQXBpS2V5cy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRVc2VyQXBpS2V5ID0gdHlwZW9mIHVzZXJBcGlLZXlzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE5FVzogVGVuYW50IE1hcmtldHMgKFx1NTkxQVx1NUUwMlx1NTgzNFx1OEEyRFx1NUI5QSkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBEZWZpbmVzIHBlci10ZW5hbnQgbWFya2V0IGNvbmZpZ3VyYXRpb25zIGZvciBtdWx0aS1yZWdpb24gZGVwbG95bWVudHMuXG4vLyBTdXBwb3J0cyBsYW5ndWFnZSwgY29tcGxpYW5jZSBmbGFncyAoZS5nLiBHRFBSKSwgYW5kIGRlZmF1bHQgbWFya2V0IHNlbGVjdGlvbi5cbmV4cG9ydCBjb25zdCB0ZW5hbnRNYXJrZXRzID0gbXlzcWxUYWJsZShcInRlbmFudF9tYXJrZXRzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHRlbmFudElkOiBpbnQoXCJ0ZW5hbnRJZFwiKS5ub3ROdWxsKCksXG4gIG1hcmtldElkOiB2YXJjaGFyKFwibWFya2V0SWRcIiwgeyBsZW5ndGg6IDMwIH0pLm5vdE51bGwoKSwgLy8gJ1RhaXdhbicsJ0dlcm1hbnknLCdTaW5nYXBvcmUnLi4uXG4gIGNvbnRlbnRMYW5ndWFnZTogdmFyY2hhcihcImNvbnRlbnRMYW5ndWFnZVwiLCB7IGxlbmd0aDogMTAgfSkubm90TnVsbCgpLCAvLyAnemgtVFcnLCdkZS1ERScuLi5cbiAgaXNEZWZhdWx0OiBib29sZWFuKFwiaXNEZWZhdWx0XCIpLmRlZmF1bHQoZmFsc2UpLm5vdE51bGwoKSxcbiAgY29tcGxpYW5jZUZsYWdzOiBqc29uKFwiY29tcGxpYW5jZUZsYWdzXCIpLiR0eXBlPHN0cmluZ1tdPigpLCAvLyBbJ0dEUFInXVxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBUZW5hbnRNYXJrZXQgPSB0eXBlb2YgdGVuYW50TWFya2V0cy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRUZW5hbnRNYXJrZXQgPSB0eXBlb2YgdGVuYW50TWFya2V0cy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBFbnRlcnByaXNlIENyZWRpdHMgQWxsb2NhdGlvbiAoXHU2MjEwXHU1NEUxXHU2NzA4XHU1RUE2XHU5MTREXHU5ODREKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBlbnRlcnByaXNlQ3JlZGl0c0FsbG9jYXRpb24gPSBteXNxbFRhYmxlKFwiZW50ZXJwcmlzZV9jcmVkaXRzX2FsbG9jYXRpb25cIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgb3duZXJJZDogaW50KFwib3duZXJJZFwiKS5ub3ROdWxsKCksXG4gIG1lbWJlcklkOiBpbnQoXCJtZW1iZXJJZFwiKS5ub3ROdWxsKCksXG4gIGFsbG9jYXRlZENyZWRpdHM6IGludChcImFsbG9jYXRlZENyZWRpdHNcIikuZGVmYXVsdCgwKS5ub3ROdWxsKCksXG4gIHVzZWRDcmVkaXRzOiBpbnQoXCJ1c2VkQ3JlZGl0c1wiKS5kZWZhdWx0KDApLm5vdE51bGwoKSxcbiAgbW9udGhseUxpbWl0OiBpbnQoXCJtb250aGx5TGltaXRcIikuZGVmYXVsdCgwKS5ub3ROdWxsKCksIC8vIDAgPSB1c2UgcG9vbCBkZWZhdWx0XG4gIGN5Y2xlU3RhcnQ6IHRpbWVzdGFtcChcImN5Y2xlU3RhcnRcIiksXG4gIGN5Y2xlRW5kOiB0aW1lc3RhbXAoXCJjeWNsZUVuZFwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBFbnRlcnByaXNlQ3JlZGl0c0FsbG9jYXRpb24gPSB0eXBlb2YgZW50ZXJwcmlzZUNyZWRpdHNBbGxvY2F0aW9uLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydEVudGVycHJpc2VDcmVkaXRzQWxsb2NhdGlvbiA9IHR5cGVvZiBlbnRlcnByaXNlQ3JlZGl0c0FsbG9jYXRpb24uJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgRW50ZXJwcmlzZSBDcmVkaXRzIFRyYW5zYWN0aW9ucyAoXHU0RjAxXHU2OTZEXHU2QzYwXHU2RDQxXHU2QzM0XHU1RTMzKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBlbnRlcnByaXNlQ3JlZGl0c1R4ID0gbXlzcWxUYWJsZShcImVudGVycHJpc2VfY3JlZGl0c190eFwiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBvd25lcklkOiBpbnQoXCJvd25lcklkXCIpLm5vdE51bGwoKSxcbiAgbWVtYmVySWQ6IGludChcIm1lbWJlcklkXCIpLFxuICB0eXBlOiBteXNxbEVudW0oXCJ0eXBlXCIsIFtcInRvcHVwXCIsIFwiZGVkdWN0XCIsIFwiYWRqdXN0XCJdKS5ub3ROdWxsKCksXG4gIGFtb3VudDogaW50KFwiYW1vdW50XCIpLm5vdE51bGwoKSwgLy8gcG9zaXRpdmU9YWRkLCBuZWdhdGl2ZT1kZWR1Y3RcbiAgbm90ZTogdGV4dChcIm5vdGVcIiksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIEVudGVycHJpc2VDcmVkaXRzVHggPSB0eXBlb2YgZW50ZXJwcmlzZUNyZWRpdHNUeC4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRFbnRlcnByaXNlQ3JlZGl0c1R4ID0gdHlwZW9mIGVudGVycHJpc2VDcmVkaXRzVHguJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgTm90aWZpY2F0aW9ucyAoXHU3QUQ5XHU1MTY3XHU5MDFBXHU3N0U1KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBub3RpZmljYXRpb25zID0gbXlzcWxUYWJsZShcIm5vdGlmaWNhdGlvbnNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLFxuICB0eXBlOiB2YXJjaGFyKFwidHlwZVwiLCB7IGxlbmd0aDogNTAgfSkubm90TnVsbCgpLFxuICB0aXRsZTogdmFyY2hhcihcInRpdGxlXCIsIHsgbGVuZ3RoOiAyNTUgfSkubm90TnVsbCgpLFxuICBib2R5OiB0ZXh0KFwiYm9keVwiKSxcbiAgdGFza0lkOiBpbnQoXCJ0YXNrSWRcIiksXG4gIGFnZW50SWQ6IGludChcImFnZW50SWRcIiksXG4gIGlzUmVhZDogYm9vbGVhbihcImlzUmVhZFwiKS5kZWZhdWx0KGZhbHNlKS5ub3ROdWxsKCksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIE5vdGlmaWNhdGlvbiA9IHR5cGVvZiBub3RpZmljYXRpb25zLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE5vdGlmaWNhdGlvbiA9IHR5cGVvZiBub3RpZmljYXRpb25zLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE5vdGlmaWNhdGlvbiBQcmVmZXJlbmNlcyAoXHU5MDFBXHU3N0U1XHU1MDRGXHU1OTdEXHU4QTJEXHU1QjlBKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBub3RpZmljYXRpb25QcmVmZXJlbmNlcyA9IG15c3FsVGFibGUoXCJub3RpZmljYXRpb25fcHJlZmVyZW5jZXNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLnVuaXF1ZSgpLFxuICBpbkFwcEVuYWJsZWQ6IGJvb2xlYW4oXCJpbkFwcEVuYWJsZWRcIikuZGVmYXVsdCh0cnVlKS5ub3ROdWxsKCksXG4gIGVtYWlsRW5hYmxlZDogYm9vbGVhbihcImVtYWlsRW5hYmxlZFwiKS5kZWZhdWx0KGZhbHNlKS5ub3ROdWxsKCksXG4gIGxpbmVFbmFibGVkOiBib29sZWFuKFwibGluZUVuYWJsZWRcIikuZGVmYXVsdChmYWxzZSkubm90TnVsbCgpLFxuICBsaW5lVG9rZW46IHZhcmNoYXIoXCJsaW5lVG9rZW5cIiwgeyBsZW5ndGg6IDI1NSB9KSxcbiAgdGVsZWdyYW1FbmFibGVkOiBib29sZWFuKFwidGVsZWdyYW1FbmFibGVkXCIpLmRlZmF1bHQoZmFsc2UpLm5vdE51bGwoKSxcbiAgdGVsZWdyYW1Cb3RUb2tlbjogdmFyY2hhcihcInRlbGVncmFtQm90VG9rZW5cIiwgeyBsZW5ndGg6IDI1NSB9KSxcbiAgdGVsZWdyYW1DaGF0SWQ6IHZhcmNoYXIoXCJ0ZWxlZ3JhbUNoYXRJZFwiLCB7IGxlbmd0aDogMTAwIH0pLFxuICB3aGF0c2FwcEVuYWJsZWQ6IGJvb2xlYW4oXCJ3aGF0c2FwcEVuYWJsZWRcIikuZGVmYXVsdChmYWxzZSkubm90TnVsbCgpLFxuICB3aGF0c2FwcFdlYmhvb2tVcmw6IHZhcmNoYXIoXCJ3aGF0c2FwcFdlYmhvb2tVcmxcIiwgeyBsZW5ndGg6IDUwMCB9KSxcbiAgbm90aWZ5T25UYXNrQ29tcGxldGVkOiBib29sZWFuKFwibm90aWZ5T25UYXNrQ29tcGxldGVkXCIpLmRlZmF1bHQodHJ1ZSkubm90TnVsbCgpLFxuICBub3RpZnlPblRhc2tGYWlsZWQ6IGJvb2xlYW4oXCJub3RpZnlPblRhc2tGYWlsZWRcIikuZGVmYXVsdCh0cnVlKS5ub3ROdWxsKCksXG4gIG5vdGlmeU9uVGFza1N0YXJ0ZWQ6IGJvb2xlYW4oXCJub3RpZnlPblRhc2tTdGFydGVkXCIpLmRlZmF1bHQoZmFsc2UpLm5vdE51bGwoKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBOb3RpZmljYXRpb25QcmVmZXJlbmNlID0gdHlwZW9mIG5vdGlmaWNhdGlvblByZWZlcmVuY2VzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE5vdGlmaWNhdGlvblByZWZlcmVuY2UgPSB0eXBlb2Ygbm90aWZpY2F0aW9uUHJlZmVyZW5jZXMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgQ2hhdCBNZXNzYWdlcyAoXHU1QzBEXHU4QTcxXHU2Qjc3XHU1M0YyXHU2MzAxXHU0RTQ1XHU1MzE2KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBjaGF0TWVzc2FnZXMgPSBteXNxbFRhYmxlKFwiY2hhdF9tZXNzYWdlc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGJyYW5kSWQ6IGludChcImJyYW5kSWRcIiksXG4gIG1pc3Npb25JZDogaW50KFwibWlzc2lvbklkXCIpLFxuICBjb252ZXJzYXRpb25UaXRsZTogdmFyY2hhcihcImNvbnZlcnNhdGlvblRpdGxlXCIsIHsgbGVuZ3RoOiAxMDAgfSksXG4gIHJvbGU6IHZhcmNoYXIoXCJyb2xlXCIsIHsgbGVuZ3RoOiAxMCB9KS5ub3ROdWxsKCksXG4gIGNvbnRlbnQ6IHRleHQoXCJjb250ZW50XCIpLm5vdE51bGwoKSxcbiAgdGFza0lkOiBpbnQoXCJ0YXNrSWRcIiksXG4gIGNvbXBhbnlJZDogaW50KFwiY29tcGFueUlkXCIpLFxuICBkZXBhcnRtZW50SWQ6IGludChcImRlcGFydG1lbnRJZFwiKSxcbiAgcGhhc2VPcmRlcjogaW50KFwicGhhc2VPcmRlclwiKS5kZWZhdWx0KDApLm5vdE51bGwoKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgQ2hhdE1lc3NhZ2UgPSB0eXBlb2YgY2hhdE1lc3NhZ2VzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydENoYXRNZXNzYWdlID0gdHlwZW9mIGNoYXRNZXNzYWdlcy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBBZ2VudCBNZW1vcmllcyAoU3ByaW50IDM6IHVzZXItZGVmaW5lZCB0cmFpbmluZyBwZXIgYWdlbnQpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IGFnZW50TWVtb3JpZXMgPSBteXNxbFRhYmxlKFwiYWdlbnRfbWVtb3JpZXNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLFxuICBhZ2VudFNsdWc6IHZhcmNoYXIoXCJhZ2VudFNsdWdcIiwgeyBsZW5ndGg6IDY0IH0pLm5vdE51bGwoKSxcbiAgYnJhbmRJZDogaW50KFwiYnJhbmRJZFwiKSxcbiAgbWVtb3J5VHlwZTogbXlzcWxFbnVtKFwibWVtb3J5VHlwZVwiLCBbXCJwcmVmZXJlbmNlXCIsIFwiZm9yYmlkZGVuXCIsIFwiYXVkaWVuY2VcIiwgXCJzdHlsZVwiLCBcIm90aGVyXCJdKS5kZWZhdWx0KFwib3RoZXJcIiksXG4gIGNvbnRlbnQ6IHRleHQoXCJjb250ZW50XCIpLm5vdE51bGwoKSxcbiAgaXNBY3RpdmU6IGJvb2xlYW4oXCJpc0FjdGl2ZVwiKS5kZWZhdWx0KHRydWUpLm5vdE51bGwoKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBBZ2VudE1lbW9yeSA9IHR5cGVvZiBhZ2VudE1lbW9yaWVzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydEFnZW50TWVtb3J5ID0gdHlwZW9mIGFnZW50TWVtb3JpZXMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgQnJhbmQgSW50ZWdyYXRpb25zIChTcHJpbnQgMzogcGxhdGZvcm0gY29ubmVjdGlvbnMgcGVyIGJyYW5kKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBicmFuZEludGVncmF0aW9ucyA9IG15c3FsVGFibGUoXCJicmFuZF9pbnRlZ3JhdGlvbnNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLFxuICBicmFuZElkOiBpbnQoXCJicmFuZElkXCIpLFxuICBpbnRlZ3JhdGlvblR5cGU6IHZhcmNoYXIoXCJpbnRlZ3JhdGlvblR5cGVcIiwgeyBsZW5ndGg6IDUwIH0pLm5vdE51bGwoKSwgLy8gJ2ZhY2Vib29rX3BhZ2VzJyB8ICdnb29nbGVfYWRzJyB8ICdpbnN0YWdyYW0nXG4gIHN0YXR1czogbXlzcWxFbnVtKFwic3RhdHVzXCIsIFtcImNvbm5lY3RlZFwiLCBcImRpc2Nvbm5lY3RlZFwiLCBcImVycm9yXCJdKS5kZWZhdWx0KFwiZGlzY29ubmVjdGVkXCIpLFxuICBhY2Nlc3NUb2tlbjogdGV4dChcImFjY2Vzc1Rva2VuXCIpLCAgICAgICAgICAgICAgICAgICAgLy8gU0VDLTM6IGVuY3J5cHQvZGVjcnlwdCB2aWEgc2VydmVyL19jb3JlL2VuY3J5cHRpb24udHMgKGVuY3J5cHQoKSBiZWZvcmUgd3JpdGUsIGRlY3J5cHQoKSBhZnRlciByZWFkKVxuICBzZWxlY3RlZFJlc291cmNlSWQ6IHZhcmNoYXIoXCJzZWxlY3RlZFJlc291cmNlSWRcIiwgeyBsZW5ndGg6IDI1NSB9KSxcbiAgYXV0aG9yaXplZFJlc291cmNlczoganNvbihcImF1dGhvcml6ZWRSZXNvdXJjZXNcIiksXG4gIGNvbm5lY3RlZEF0OiB0aW1lc3RhbXAoXCJjb25uZWN0ZWRBdFwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBCcmFuZEludGVncmF0aW9uID0gdHlwZW9mIGJyYW5kSW50ZWdyYXRpb25zLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydEJyYW5kSW50ZWdyYXRpb24gPSB0eXBlb2YgYnJhbmRJbnRlZ3JhdGlvbnMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgVmlkZW8gSm9icyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGNvbnN0IHZpZGVvSm9icyA9IG15c3FsVGFibGUoXCJ2aWRlb19qb2JzXCIsIHtcbiAgaWQ6ICAgICAgICAgICBpbnQoXCJpZFwiKS5wcmltYXJ5S2V5KCkuYXV0b2luY3JlbWVudCgpLFxuICB1c2VySWQ6ICAgICAgIGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGJyYW5kSWQ6ICAgICAgaW50KFwiYnJhbmRJZFwiKSxcbiAgdG9waWM6ICAgICAgICB2YXJjaGFyKFwidG9waWNcIiwgeyBsZW5ndGg6IDUwMCB9KS5ub3ROdWxsKCksXG4gIHBsYXRmb3JtOiAgICAgbXlzcWxFbnVtKFwicGxhdGZvcm1cIiwgW1wieW91dHViZVwiLCBcImluc3RhZ3JhbVwiLCBcInRpa3Rva1wiLCBcImZhY2Vib29rXCJdKS5ub3ROdWxsKCkuZGVmYXVsdChcInlvdXR1YmVcIiksXG4gIGxhbmd1YWdlOiAgICAgbXlzcWxFbnVtKFwibGFuZ3VhZ2VcIiwgW1wiemgtVFdcIiwgXCJ6aC1DTlwiLCBcImVuXCJdKS5ub3ROdWxsKCkuZGVmYXVsdChcInpoLVRXXCIpLFxuICBkdXJhdGlvbjogICAgIGludChcImR1cmF0aW9uXCIpLm5vdE51bGwoKS5kZWZhdWx0KDYwKSwgICAgICAgICAgIC8vIHNlY29uZHNcbiAgc3R5bGU6ICAgICAgICB2YXJjaGFyKFwic3R5bGVcIiwgeyBsZW5ndGg6IDUwIH0pLm5vdE51bGwoKS5kZWZhdWx0KFwicHJvZmVzc2lvbmFsXCIpLFxuICBzdGF0dXM6ICAgICAgIG15c3FsRW51bShcInN0YXR1c1wiLCBbXCJwZW5kaW5nXCIsIFwicHJvY2Vzc2luZ1wiLCBcImNvbXBsZXRlZFwiLCBcImZhaWxlZFwiXSkubm90TnVsbCgpLmRlZmF1bHQoXCJwZW5kaW5nXCIpLFxuICBwcm9ncmVzczogICAgIGludChcInByb2dyZXNzXCIpLm5vdE51bGwoKS5kZWZhdWx0KDApLCAgICAgICAgICAgIC8vIDBcdTIwMTMxMDBcbiAgc2NyaXB0OiAgICAgICBqc29uKFwic2NyaXB0XCIpLCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBWaWRlb1NjcmlwdCBvYmplY3RcbiAgdmlkZW9Vcmw6ICAgICB0ZXh0KFwidmlkZW9VcmxcIiksICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBGaW5hbCBNUDQgVVJMXG4gIHRodW1ibmFpbFVybDogdGV4dChcInRodW1ibmFpbFVybFwiKSwgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gUHJldmlldyBpbWFnZVxuICBmYWxSZXF1ZXN0SWQ6IHZhcmNoYXIoXCJmYWxSZXF1ZXN0SWRcIiwgeyBsZW5ndGg6IDI1NSB9KSwgICAgICAgIC8vIGZhbC5haSByZXF1ZXN0IHRyYWNraW5nXG4gIGVycm9yTWVzc2FnZTogdGV4dChcImVycm9yTWVzc2FnZVwiKSxcbiAgY3JlYXRlZEF0OiAgICB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiAgICB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5cbmV4cG9ydCB0eXBlIFZpZGVvSm9iID0gdHlwZW9mIHZpZGVvSm9icy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRWaWRlb0pvYiA9IHR5cGVvZiB2aWRlb0pvYnMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgTWlzc2lvbnMgKFNwcmludCAyOiB3b3Jrc3BhY2UgbWlzc2lvbiBjb250ZXh0KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIEVhY2ggbWlzc2lvbiByZXByZXNlbnRzIGEgc3BlY2lmaWMgY2FtcGFpZ24vcHJvamVjdCB3aXRoaW4gYSB3b3Jrc3BhY2UgY2hhbm5lbC5cbi8vIFdvcmtzcGFjZSAoZS5nLiBGYWNlYm9vaywgTGlua2VkSW4pID4gTWlzc2lvbiA+IFRhc2sgVW5pdHNcbmV4cG9ydCBjb25zdCBtaXNzaW9ucyA9IG15c3FsVGFibGUoXCJtaXNzaW9uc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGJyYW5kSWQ6IGludChcImJyYW5kSWRcIiksXG4gIHdvcmtzcGFjZTogdmFyY2hhcihcIndvcmtzcGFjZVwiLCB7IGxlbmd0aDogNTAgfSkubm90TnVsbCgpLCAvLyAnZmFjZWJvb2snIHwgJ2xpbmtlZGluJyB8ICd5b3V0dWJlJyB8ICdwcicgfCAnZXZlbnQnIHwgJ2luc3RvcmUnXG4gIHRpdGxlOiB2YXJjaGFyKFwidGl0bGVcIiwgeyBsZW5ndGg6IDI1NSB9KS5ub3ROdWxsKCksXG4gIG9iamVjdGl2ZTogdGV4dChcIm9iamVjdGl2ZVwiKSxcbiAgYXVkaWVuY2U6IHRleHQoXCJhdWRpZW5jZVwiKSxcbiAgb2ZmZXI6IHRleHQoXCJvZmZlclwiKSxcbiAgc3VjY2Vzc01ldHJpY3M6IHRleHQoXCJzdWNjZXNzTWV0cmljc1wiKSxcbiAgY29uc3RyYWludHM6IHRleHQoXCJjb25zdHJhaW50c1wiKSxcbiAgbWV0aG9kb2xvZ3k6IHRleHQoXCJtZXRob2RvbG9neVwiKSwgLy8gZS5nLiBcIkJyYW5kIFBvc2l0aW9uaW5nIHYyXCJcbiAgZGVzY3JpcHRpb246IHRleHQoXCJkZXNjcmlwdGlvblwiKSwgIC8vIFx1NEVGQlx1NTJEOVx1OEFBQVx1NjYwRVx1RkYwOFx1N0Q2Nlx1OEE5RVx1NjEwRlx1OTE0RFx1NUMwRFx1NzUyOFx1RkYwOVxuICBzcXVhZFNsdWc6IHZhcmNoYXIoXCJzcXVhZFNsdWdcIiwgeyBsZW5ndGg6IDY0IH0pLCAgICAgLy8gXHU3RDgxXHU1QjlBXHU3Njg0IHNxdWFkIHNsdWdcbiAgd2VsY29tZU1lc3NhZ2U6IHRleHQoXCJ3ZWxjb21lTWVzc2FnZVwiKSwgICAgICAgICAgICAgICAvLyBcdTlFREVcdTRFRkJcdTUyRDlcdTY2NDJcdTk4NkZcdTc5M0FcdTc2ODRcdTZCNjFcdThGQ0VcdThBMEFcdTYwNkZcbiAgdGFnbGluZTogdmFyY2hhcihcInRhZ2xpbmVcIiwgeyBsZW5ndGg6IDI1NSB9KSwgICAgICAgICAgLy8gXHU1NEMxXHU3MjRDXHU1QjlBXHU0RjREXHU2QTE5XHU4QTlFXG4gIHN1YlRhZ2xpbmU6IHZhcmNoYXIoXCJzdWJUYWdsaW5lXCIsIHsgbGVuZ3RoOiAyNTUgfSksICAgIC8vIFx1NTRDMVx1NzI0Q1x1NUI5QVx1NEY0RFx1NTI2Rlx1NkExOVx1OEE5RVxuICBzYXZlZFNxdWFkRmxvdzogdGV4dChcInNhdmVkU3F1YWRGbG93XCIpLCAgICAgICAgICAgICAgICAvLyBVc2VyLWN1c3RvbWl6ZWQgc3F1YWQgc3RlcHMgSlNPTlxuICBzdGF0dXM6IG15c3FsRW51bShcInN0YXR1c1wiLCBbXCJpbmFjdGl2ZVwiLCBcImFjdGl2ZVwiLCBcImNvbXBsZXRlZFwiLCBcImFyY2hpdmVkXCJdKS5kZWZhdWx0KFwiaW5hY3RpdmVcIikubm90TnVsbCgpLFxuICBpc1JlY3VycmluZzogYm9vbGVhbihcImlzUmVjdXJyaW5nXCIpLmRlZmF1bHQoZmFsc2UpLm5vdE51bGwoKSxcbiAgcmVjdXJyaW5nU2NoZWR1bGU6IHZhcmNoYXIoXCJyZWN1cnJpbmdTY2hlZHVsZVwiLCB7IGxlbmd0aDogNjQgfSksICAvLyAnZGFpbHknIHwgJ3dlZWtseScgfCAnYml3ZWVrbHknIHwgJ21vbnRobHknXG4gIGNvbXBhbnlJZDogaW50KFwiY29tcGFueUlkXCIpLFxuICBicmFuZElkMjogaW50KFwiYnJhbmRJZDJcIiksXG4gIGRlcGFydG1lbnRJZDogaW50KFwiZGVwYXJ0bWVudElkXCIpLFxuICB3b3Jrc3BhY2VJZDogaW50KFwid29ya3NwYWNlSWRcIiksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG4gIHVwZGF0ZWRBdDogdGltZXN0YW1wKFwidXBkYXRlZEF0XCIpLmRlZmF1bHROb3coKS5vblVwZGF0ZU5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgTWlzc2lvbiA9IHR5cGVvZiBtaXNzaW9ucy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRNaXNzaW9uID0gdHlwZW9mIG1pc3Npb25zLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE1pc3Npb24gVGFzayBVbml0cyAoU3ByaW50IDI6IHRhc2sgYnJlYWtkb3duIHdpdGhpbiBhIG1pc3Npb24pIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IG1pc3Npb25UYXNrVW5pdHMgPSBteXNxbFRhYmxlKFwibWlzc2lvbl90YXNrX3VuaXRzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIG1pc3Npb25JZDogaW50KFwibWlzc2lvbklkXCIpLm5vdE51bGwoKSxcbiAgYWdlbnRJZDogaW50KFwiYWdlbnRJZFwiKSwgLy8gYXNzaWduZWQgQUkgYWdlbnQgKG51bGwgPSB1bmFzc2lnbmVkKVxuICBsYWJlbDogdmFyY2hhcihcImxhYmVsXCIsIHsgbGVuZ3RoOiAyNTUgfSkubm90TnVsbCgpLFxuICBzdGF0dXM6IG15c3FsRW51bShcInN0YXR1c1wiLCBbXCJub3Rfc3RhcnRlZFwiLCBcInJ1bm5pbmdcIiwgXCJuZWVkc19pbnB1dFwiLCBcInJldmlld1wiLCBcImFwcHJvdmVkXCJdKS5kZWZhdWx0KFwibm90X3N0YXJ0ZWRcIikubm90TnVsbCgpLFxuICBzb3J0T3JkZXI6IGludChcInNvcnRPcmRlclwiKS5kZWZhdWx0KDApLFxuICB0YXNrSWQ6IGludChcInRhc2tJZFwiKSwgLy8gbGluayB0byB0YXNrcyB0YWJsZSB3aGVuIGV4ZWN1dGlvbiBzdGFydHNcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBNaXNzaW9uVGFza1VuaXQgPSB0eXBlb2YgbWlzc2lvblRhc2tVbml0cy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRNaXNzaW9uVGFza1VuaXQgPSB0eXBlb2YgbWlzc2lvblRhc2tVbml0cy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBNaXNzaW9uIE1lc3NhZ2VzIChcdTVDMERcdThBNzFcdThBMEFcdTYwNkZcdTYzMDFcdTRFNDVcdTUzMTYpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IG1pc3Npb25NZXNzYWdlcyA9IG15c3FsVGFibGUoXCJtaXNzaW9uX21lc3NhZ2VzXCIsIHtcbiAgaWQ6ICAgICAgICBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBtaXNzaW9uSWQ6IGludChcIm1pc3Npb25JZFwiKS5ub3ROdWxsKCksXG4gIHVzZXJJZDogICAgaW50KFwidXNlcklkXCIpLm5vdE51bGwoKSxcbiAgcm9sZTogICAgICBteXNxbEVudW0oXCJyb2xlXCIsIFtcInVzZXJcIiwgXCJhc3Npc3RhbnRcIiwgXCJzeXN0ZW1cIl0pLm5vdE51bGwoKSxcbiAgY29udGVudDogICBsb25ndGV4dChcImNvbnRlbnRcIikubm90TnVsbCgpLFxuICBtZXRhZGF0YTogIHRleHQoXCJtZXRhZGF0YVwiKSxcbiAgY3JlYXRlZEF0OiBkYXRldGltZShcImNyZWF0ZWRBdFwiKS5ub3ROdWxsKCkuZGVmYXVsdChzcWxgQ1VSUkVOVF9USU1FU1RBTVBgKSxcbn0pO1xuZXhwb3J0IHR5cGUgTWlzc2lvbk1lc3NhZ2UgPSB0eXBlb2YgbWlzc2lvbk1lc3NhZ2VzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE1pc3Npb25NZXNzYWdlID0gdHlwZW9mIG1pc3Npb25NZXNzYWdlcy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBNaXNzaW9uIFJlc291cmNlcyAoXHU4QTlFXHU2MTBGXHU5MTREXHU1QzBEXHU3RDUwXHU2NzlDXHU1RkVCXHU1M0Q2KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIENvbXB1dGVkIGFzeW5jIGFmdGVyIG1pc3Npb24gY3JlYXRpb24gdmlhIHRleHQtZW1iZWRkaW5nLTMtbGFyZ2UgY29zaW5lIHNpbWlsYXJpdHlcbmV4cG9ydCBjb25zdCBtaXNzaW9uUmVzb3VyY2VzID0gbXlzcWxUYWJsZShcIm1pc3Npb25fcmVzb3VyY2VzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIG1pc3Npb25JZDogaW50KFwibWlzc2lvbklkXCIpLm5vdE51bGwoKS51bmlxdWUoKSxcbiAgc3RhdHVzOiB2YXJjaGFyKFwic3RhdHVzXCIsIHsgbGVuZ3RoOiAyMCB9KS5kZWZhdWx0KFwicGVuZGluZ1wiKSwgLy8gcGVuZGluZyB8IHJlYWR5IHwgZXJyb3JcbiAgYWdlbnRzOiBpbnQoXCJhZ2VudHNcIikuZGVmYXVsdCgwKSxcbiAgc2tpbGxzOiBpbnQoXCJza2lsbHNcIikuZGVmYXVsdCgwKSxcbiAgcHJvdmlkZXJzOiBpbnQoXCJwcm92aWRlcnNcIikuZGVmYXVsdCgwKSxcbiAgc2tpbGxMaXN0OiB0ZXh0KFwic2tpbGxMaXN0XCIpLCAgICAgICAvLyBKU09OIHN0cmluZ1tdXG4gIHByb3ZpZGVyTGlzdDogdGV4dChcInByb3ZpZGVyTGlzdFwiKSwgLy8gSlNPTiBzdHJpbmdbXVxuICB0b3BBZ2VudHM6IHRleHQoXCJ0b3BBZ2VudHNcIiksICAgICAgIC8vIEpTT046IFt7c2x1ZywgbmFtZSwgdGl0bGUsIHNjb3JlfV1cbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgTWlzc2lvblJlc291cmNlID0gdHlwZW9mIG1pc3Npb25SZXNvdXJjZXMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0TWlzc2lvblJlc291cmNlID0gdHlwZW9mIG1pc3Npb25SZXNvdXJjZXMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgVXNlciBXb3Jrc3BhY2VzIChcdTc1MjhcdTYyMzZcdTgxRUFcdThBMDJcdTVERTVcdTRGNUNcdTUzNDApIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IHVzZXJXb3Jrc3BhY2VzID0gbXlzcWxUYWJsZShcInVzZXJfd29ya3NwYWNlc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIHdzS2V5OiB2YXJjaGFyKFwid3NLZXlcIiwgeyBsZW5ndGg6IDY0IH0pLm5vdE51bGwoKSxcbiAgbGFiZWw6IHZhcmNoYXIoXCJsYWJlbFwiLCB7IGxlbmd0aDogNjQgfSkubm90TnVsbCgpLFxuICBzb3J0T3JkZXI6IGludChcInNvcnRPcmRlclwiKS5kZWZhdWx0KDApLFxuICBjb21wYW55SWQ6IGludChcImNvbXBhbnlJZFwiKSxcbiAgYnJhbmRJZDogaW50KFwiYnJhbmRJZFwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgVXNlcldvcmtzcGFjZSA9IHR5cGVvZiB1c2VyV29ya3NwYWNlcy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRVc2VyV29ya3NwYWNlID0gdHlwZW9mIHVzZXJXb3Jrc3BhY2VzLiRpbmZlckluc2VydDtcblxuXG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBNT1MgRW50ZXJwcmlzZTogQ29tcGFuaWVzIChcdTRGMDFcdTY5NkRcdTVDNjRcdTdEMUEpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gTm90ZTogXHU0RjdGXHU3NTI4IG1vc19jb21wYW5pZXMgXHU1MjREXHU3REI0XHU5MDdGXHU1MTREXHU4MjA3XHU2NUUyXHU2NzA5IGNvbXBhbmllcyB0YWJsZSBcdTg4NURcdTdBODFcbmV4cG9ydCBjb25zdCBtb3NDb21wYW5pZXMgPSBteXNxbFRhYmxlKFwibW9zX2NvbXBhbmllc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBuYW1lOiB2YXJjaGFyKFwibmFtZVwiLCB7IGxlbmd0aDogMTI4IH0pLm5vdE51bGwoKSxcbiAgaW5kdXN0cnk6IHZhcmNoYXIoXCJpbmR1c3RyeVwiLCB7IGxlbmd0aDogNjQgfSksXG4gIHBsYW46IG15c3FsRW51bShcInBsYW5cIiwgW1widHJpYWxcIiwgXCJzdGFydGVyXCIsIFwicHJvXCIsIFwiZW50ZXJwcmlzZVwiXSkuZGVmYXVsdChcInRyaWFsXCIpLFxuICBhZ2VudFdvcmtzcGFjZVBhdGg6IHZhcmNoYXIoXCJhZ2VudFdvcmtzcGFjZVBhdGhcIiwgeyBsZW5ndGg6IDI1NSB9KSxcbiAgYWdlbnRTZXNzaW9uS2V5OiB2YXJjaGFyKFwiYWdlbnRTZXNzaW9uS2V5XCIsIHsgbGVuZ3RoOiAxMjggfSksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIE1vc0NvbXBhbnkgPSB0eXBlb2YgbW9zQ29tcGFuaWVzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE1vc0NvbXBhbnkgPSB0eXBlb2YgbW9zQ29tcGFuaWVzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE1PUyBFbnRlcnByaXNlOiBEZXBhcnRtZW50cyAoXHU5MEU4XHU5NTgwKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBtb3NEZXBhcnRtZW50cyA9IG15c3FsVGFibGUoXCJtb3NfZGVwYXJ0bWVudHNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgY29tcGFueUlkOiBpbnQoXCJjb21wYW55SWRcIikubm90TnVsbCgpLFxuICBicmFuZElkOiBpbnQoXCJicmFuZElkXCIpLm5vdE51bGwoKSxcbiAgbmFtZTogdmFyY2hhcihcIm5hbWVcIiwgeyBsZW5ndGg6IDY0IH0pLm5vdE51bGwoKSxcbiAgaGVhZENvdW50OiBpbnQoXCJoZWFkQ291bnRcIikuZGVmYXVsdCgwKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgTW9zRGVwYXJ0bWVudCA9IHR5cGVvZiBtb3NEZXBhcnRtZW50cy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRNb3NEZXBhcnRtZW50ID0gdHlwZW9mIG1vc0RlcGFydG1lbnRzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE1PUyBFbnRlcnByaXNlOiBDb21wYW55IEFnZW50cyAoXHU0RjAxXHU2OTZEIEFJIFx1NURFNVx1NEY1Q1x1NTM0MCkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgY29uc3QgbW9zQ29tcGFueUFnZW50cyA9IG15c3FsVGFibGUoXCJtb3NfY29tcGFueV9hZ2VudHNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgY29tcGFueUlkOiBpbnQoXCJjb21wYW55SWRcIikubm90TnVsbCgpLnVuaXF1ZSgpLFxuICB3b3Jrc3BhY2VQYXRoOiB2YXJjaGFyKFwid29ya3NwYWNlUGF0aFwiLCB7IGxlbmd0aDogMjU1IH0pLFxuICBzZXNzaW9uS2V5OiB2YXJjaGFyKFwic2Vzc2lvbktleVwiLCB7IGxlbmd0aDogMTI4IH0pLFxuICBzb3VsTWRDb250ZW50OiB0ZXh0KFwic291bE1kQ29udGVudFwiKSxcbiAgbWVtb3J5TWRDb250ZW50OiB0ZXh0KFwibWVtb3J5TWRDb250ZW50XCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIE1vc0NvbXBhbnlBZ2VudCA9IHR5cGVvZiBtb3NDb21wYW55QWdlbnRzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE1vc0NvbXBhbnlBZ2VudCA9IHR5cGVvZiBtb3NDb21wYW55QWdlbnRzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE1pc3Npb24gU09QcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBtaXNzaW9uU29wcyA9IG15c3FsVGFibGUoXCJtaXNzaW9uX3NvcHNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgbWlzc2lvbklkOiBpbnQoXCJtaXNzaW9uSWRcIikubm90TnVsbCgpLFxuICBicmFuZElkOiBpbnQoXCJicmFuZElkXCIpLFxuICB0aXRsZTogdmFyY2hhcihcInRpdGxlXCIsIHsgbGVuZ3RoOiAyNTUgfSkubm90TnVsbCgpLFxuICB2ZXJzaW9uOiBpbnQoXCJ2ZXJzaW9uXCIpLmRlZmF1bHQoMSksXG4gIGlzR2xvYmFsOiBpbnQoXCJpc0dsb2JhbFwiKS5kZWZhdWx0KDApLFxuICBzb3VyY2VUeXBlOiBteXNxbEVudW0oXCJzb3VyY2VUeXBlXCIsIFtcImF1dG9fbGVhcm5lZFwiLFwibWFudWFsXCIsXCJpbXBvcnRlZFwiXSkuZGVmYXVsdChcIm1hbnVhbFwiKSxcbiAgaW1wb3J0U291cmNlOiBteXNxbEVudW0oXCJpbXBvcnRTb3VyY2VcIiwgW1widGV4dFwiLFwicGRmXCIsXCJ1cmxcIl0pLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIE1pc3Npb25Tb3AgPSB0eXBlb2YgbWlzc2lvblNvcHMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0TWlzc2lvblNvcCA9IHR5cGVvZiBtaXNzaW9uU29wcy4kaW5mZXJJbnNlcnQ7XG5cbmV4cG9ydCBjb25zdCBtaXNzaW9uU29wU3RlcHMgPSBteXNxbFRhYmxlKFwibWlzc2lvbl9zb3Bfc3RlcHNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgc29wSWQ6IGludChcInNvcElkXCIpLm5vdE51bGwoKSxcbiAgc3RlcE9yZGVyOiBpbnQoXCJzdGVwT3JkZXJcIikubm90TnVsbCgpLFxuICBzdGVwVHlwZTogbXlzcWxFbnVtKFwic3RlcFR5cGVcIiwgW1wic2VxdWVudGlhbFwiLFwicGFyYWxsZWxcIixcImNvbmRpdGlvbmFsXCJdKS5kZWZhdWx0KFwic2VxdWVudGlhbFwiKSxcbiAgcGFyYWxsZWxHcm91cElkOiB2YXJjaGFyKFwicGFyYWxsZWxHcm91cElkXCIsIHsgbGVuZ3RoOiA2NCB9KSxcbiAgY29uZGl0aW9uSnNvbjoganNvbihcImNvbmRpdGlvbkpzb25cIiksXG4gIGFnZW50U2x1ZzogdmFyY2hhcihcImFnZW50U2x1Z1wiLCB7IGxlbmd0aDogNjQgfSksXG4gIGxhYmVsOiB2YXJjaGFyKFwibGFiZWxcIiwgeyBsZW5ndGg6IDI1NSB9KS5ub3ROdWxsKCksXG4gIHByb21wdFNuYXBzaG90OiB0ZXh0KFwicHJvbXB0U25hcHNob3RcIiksXG4gIG91dHB1dFN1bW1hcnk6IHRleHQoXCJvdXRwdXRTdW1tYXJ5XCIpLFxuICBkdXJhdGlvbkVzdGltYXRlOiB2YXJjaGFyKFwiZHVyYXRpb25Fc3RpbWF0ZVwiLCB7IGxlbmd0aDogMzIgfSksXG4gIGFiUmVzdWx0OiBteXNxbEVudW0oXCJhYlJlc3VsdFwiLCBbXCJhX3dpbnNcIixcImJfd2luc1wiLFwidGllXCIsXCJwZW5kaW5nXCJdKS5kZWZhdWx0KFwicGVuZGluZ1wiKSxcbiAgbm90ZXM6IHRleHQoXCJub3Rlc1wiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgTWlzc2lvblNvcFN0ZXAgPSB0eXBlb2YgbWlzc2lvblNvcFN0ZXBzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE1pc3Npb25Tb3BTdGVwID0gdHlwZW9mIG1pc3Npb25Tb3BTdGVwcy4kaW5mZXJJbnNlcnQ7XG5cbmV4cG9ydCBjb25zdCBtaXNzaW9uT3V0cHV0cyA9IG15c3FsVGFibGUoXCJtaXNzaW9uX291dHB1dHNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgbWlzc2lvbklkOiBpbnQoXCJtaXNzaW9uSWRcIikubm90TnVsbCgpLFxuICBjb252ZXJzYXRpb25JZDogaW50KFwiY29udmVyc2F0aW9uSWRcIiksXG4gIG1lc3NhZ2VJZDogaW50KFwibWVzc2FnZUlkXCIpLFxuICBwbGF0Zm9ybTogbXlzcWxFbnVtKFwicGxhdGZvcm1cIiwgW1wiZmFjZWJvb2tcIixcImluc3RhZ3JhbVwiLFwibGlua2VkaW5cIixcInlvdXR1YmVcIixcImdvb2dsZV9hZHNcIixcImVtYWlsXCIsXCJwcHRcIixcImRvY1wiLFwic2NyaXB0XCIsXCJvdGhlclwiXSkuZGVmYXVsdChcIm90aGVyXCIpLFxuICBvdXRwdXRUeXBlOiBteXNxbEVudW0oXCJvdXRwdXRUeXBlXCIsIFtcInBvc3RcIixcInN0b3J5XCIsXCJyZWVsXCIsXCJhZF9jb3B5XCIsXCJlbWFpbF9odG1sXCIsXCJzbGlkZVwiLFwic2NyaXB0XCIsXCJwcm9kdWN0X2Rlc2NcIixcInJlcG9ydFwiLFwib3RoZXJcIl0pLmRlZmF1bHQoXCJvdGhlclwiKSxcbiAgdGl0bGU6IHZhcmNoYXIoXCJ0aXRsZVwiLCB7IGxlbmd0aDogMjU1IH0pLFxuICBjb250ZW50OiBsb25ndGV4dChcImNvbnRlbnRcIiksXG4gIHByZXZpZXdIdG1sOiBsb25ndGV4dChcInByZXZpZXdIdG1sXCIpLFxuICBtZXRhZGF0YToganNvbihcIm1ldGFkYXRhXCIpLFxuICBzdGF0dXM6IG15c3FsRW51bShcInN0YXR1c1wiLCBbXCJkcmFmdFwiLFwicGVuZGluZ19yZXZpZXdcIixcImFwcHJvdmVkXCIsXCJzY2hlZHVsZWRcIixcInB1Ymxpc2hlZFwiLFwiYXJjaGl2ZWRcIl0pLmRlZmF1bHQoXCJkcmFmdFwiKSxcbiAgdmVyc2lvbjogaW50KFwidmVyc2lvblwiKS5kZWZhdWx0KDEpLFxuICBwYXJlbnRPdXRwdXRJZDogaW50KFwicGFyZW50T3V0cHV0SWRcIiksXG4gIHNjaGVkdWxlZEF0OiB0aW1lc3RhbXAoXCJzY2hlZHVsZWRBdFwiKSxcbiAgcHVibGlzaGVkQXQ6IHRpbWVzdGFtcChcInB1Ymxpc2hlZEF0XCIpLFxuICBpc1VyZ2VudDogaW50KFwiaXNVcmdlbnRcIikuZGVmYXVsdCgwKSxcbiAgZGVhZGxpbmVBdDogdGltZXN0YW1wKFwiZGVhZGxpbmVBdFwiKSxcbiAgYmF0Y2hHcm91cElkOiB2YXJjaGFyKFwiYmF0Y2hHcm91cElkXCIsIHsgbGVuZ3RoOiA2NCB9KSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBNaXNzaW9uT3V0cHV0ID0gdHlwZW9mIG1pc3Npb25PdXRwdXRzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE1pc3Npb25PdXRwdXQgPSB0eXBlb2YgbWlzc2lvbk91dHB1dHMuJGluZmVySW5zZXJ0O1xuXG5leHBvcnQgY29uc3QgbWlzc2lvbktub3dsZWRnZUZpbGVzID0gbXlzcWxUYWJsZShcIm1pc3Npb25fa25vd2xlZGdlX2ZpbGVzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIG1pc3Npb25JZDogaW50KFwibWlzc2lvbklkXCIpLm5vdE51bGwoKSxcbiAgYnJhbmRJZDogaW50KFwiYnJhbmRJZFwiKSxcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLFxuICBmaWxlbmFtZTogdmFyY2hhcihcImZpbGVuYW1lXCIsIHsgbGVuZ3RoOiAyNTUgfSkubm90TnVsbCgpLFxuICBvcmlnaW5hbE5hbWU6IHZhcmNoYXIoXCJvcmlnaW5hbE5hbWVcIiwgeyBsZW5ndGg6IDI1NSB9KSxcbiAgZmlsZVR5cGU6IG15c3FsRW51bShcImZpbGVUeXBlXCIsIFtcInBkZlwiLFwiZG9jeFwiLFwieGxzeFwiLFwiY3N2XCIsXCJ0eHRcIixcInVybFwiLFwib3RoZXJcIl0pLmRlZmF1bHQoXCJvdGhlclwiKSxcbiAgZmlsZVVybDogdGV4dChcImZpbGVVcmxcIiksXG4gIGZpbGVTaXplOiBpbnQoXCJmaWxlU2l6ZVwiKSxcbiAgY2h1bmtDb3VudDogaW50KFwiY2h1bmtDb3VudFwiKS5kZWZhdWx0KDApLFxuICBlbWJlZGRlZEF0OiB0aW1lc3RhbXAoXCJlbWJlZGRlZEF0XCIpLFxuICBlbWJlZGRpbmdTdGF0dXM6IG15c3FsRW51bShcImVtYmVkZGluZ1N0YXR1c1wiLCBbXCJwZW5kaW5nXCIsXCJwcm9jZXNzaW5nXCIsXCJjb21wbGV0ZWRcIixcImZhaWxlZFwiXSkuZGVmYXVsdChcInBlbmRpbmdcIiksXG4gIHVzYWdlQ291bnQ6IGludChcInVzYWdlQ291bnRcIikuZGVmYXVsdCgwKSxcbiAgYXV0b0luamVjdDogaW50KFwiYXV0b0luamVjdFwiKS5kZWZhdWx0KDApLFxuICBpc0ZvclNvcE9ubHk6IGludChcImlzRm9yU29wT25seVwiKS5kZWZhdWx0KDApLFxuICBpc1NlbnNpdGl2ZTogaW50KFwiaXNTZW5zaXRpdmVcIikuZGVmYXVsdCgwKSxcbiAgYWxsb3dlZFJvbGVzOiBqc29uKFwiYWxsb3dlZFJvbGVzXCIpLiR0eXBlPHN0cmluZ1tdPigpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBNaXNzaW9uS25vd2xlZGdlRmlsZSA9IHR5cGVvZiBtaXNzaW9uS25vd2xlZGdlRmlsZXMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0TWlzc2lvbktub3dsZWRnZUZpbGUgPSB0eXBlb2YgbWlzc2lvbktub3dsZWRnZUZpbGVzLiRpbmZlckluc2VydDtcblxuZXhwb3J0IGNvbnN0IG1pc3Npb25Lbm93bGVkZ2VDaHVua3MgPSBteXNxbFRhYmxlKFwibWlzc2lvbl9rbm93bGVkZ2VfY2h1bmtzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIGZpbGVJZDogaW50KFwiZmlsZUlkXCIpLm5vdE51bGwoKSxcbiAgbWlzc2lvbklkOiBpbnQoXCJtaXNzaW9uSWRcIikubm90TnVsbCgpLFxuICBjaHVua0luZGV4OiBpbnQoXCJjaHVua0luZGV4XCIpLm5vdE51bGwoKSxcbiAgY29udGVudDogdGV4dChcImNvbnRlbnRcIikubm90TnVsbCgpLFxuICBlbWJlZGRpbmc6IGpzb24oXCJlbWJlZGRpbmdcIiksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIE1pc3Npb25Lbm93bGVkZ2VDaHVuayA9IHR5cGVvZiBtaXNzaW9uS25vd2xlZGdlQ2h1bmtzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE1pc3Npb25Lbm93bGVkZ2VDaHVuayA9IHR5cGVvZiBtaXNzaW9uS25vd2xlZGdlQ2h1bmtzLiRpbmZlckluc2VydDtcblxuZXhwb3J0IGNvbnN0IG1pc3Npb25SZXZpZXdRdWV1ZSA9IG15c3FsVGFibGUoXCJtaXNzaW9uX3Jldmlld19xdWV1ZVwiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBtaXNzaW9uSWQ6IGludChcIm1pc3Npb25JZFwiKS5ub3ROdWxsKCksXG4gIG91dHB1dElkOiBpbnQoXCJvdXRwdXRJZFwiKS5ub3ROdWxsKCksXG4gIHJlcXVlc3RlZEJ5OiBpbnQoXCJyZXF1ZXN0ZWRCeVwiKS5ub3ROdWxsKCksXG4gIHJldmlld1R5cGU6IG15c3FsRW51bShcInJldmlld1R5cGVcIiwgW1wiaW50ZXJuYWxcIixcImV4dGVybmFsXCIsXCJsZWdhbFwiLFwiY2xpZW50XCJdKS5kZWZhdWx0KFwiaW50ZXJuYWxcIiksXG4gIHN0YXR1czogbXlzcWxFbnVtKFwic3RhdHVzXCIsIFtcInBlbmRpbmdcIixcImluX3Jldmlld1wiLFwiYXBwcm92ZWRcIixcInJldmlzaW9uX3JlcXVlc3RlZFwiLFwiZXhwaXJlZFwiXSkuZGVmYXVsdChcInBlbmRpbmdcIiksXG4gIHJldmlld2VySWRzOiBqc29uKFwicmV2aWV3ZXJJZHNcIikuJHR5cGU8bnVtYmVyW10+KCksXG4gIGV4dGVybmFsVG9rZW46IHZhcmNoYXIoXCJleHRlcm5hbFRva2VuXCIsIHsgbGVuZ3RoOiAxMjggfSksXG4gIGV4dGVybmFsRXhwaXJlQXQ6IHRpbWVzdGFtcChcImV4dGVybmFsRXhwaXJlQXRcIiksXG4gIGlzVXJnZW50OiBpbnQoXCJpc1VyZ2VudFwiKS5kZWZhdWx0KDApLFxuICBkZWFkbGluZUF0OiB0aW1lc3RhbXAoXCJkZWFkbGluZUF0XCIpLFxuICBmYXN0VHJhY2s6IGludChcImZhc3RUcmFja1wiKS5kZWZhdWx0KDApLFxuICByZXZpc2lvbk5vdGU6IHRleHQoXCJyZXZpc2lvbk5vdGVcIiksXG4gIGFwcHJvdmVkQXQ6IHRpbWVzdGFtcChcImFwcHJvdmVkQXRcIiksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIE1pc3Npb25SZXZpZXdRdWV1ZUl0ZW0gPSB0eXBlb2YgbWlzc2lvblJldmlld1F1ZXVlLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE1pc3Npb25SZXZpZXdRdWV1ZUl0ZW0gPSB0eXBlb2YgbWlzc2lvblJldmlld1F1ZXVlLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwIFNlc3Npb24gRXZlbnQgTG9ncyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBzZXNzaW9uRXZlbnRMb2dzID0gbXlzcWxUYWJsZShcInNlc3Npb25fZXZlbnRfbG9nc1wiLCB7XG4gIGlkOiAgICAgICAgICAgIGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHNlc3Npb25JZDogICAgIHZhcmNoYXIoXCJzZXNzaW9uSWRcIiwgeyBsZW5ndGg6IDEyOCB9KS5ub3ROdWxsKCksXG4gIHVzZXJJZDogICAgICAgIGludChcInVzZXJJZFwiKSxcbiAgYWdlbnRTbHVnOiAgICAgdmFyY2hhcihcImFnZW50U2x1Z1wiLCB7IGxlbmd0aDogMjU1IH0pLFxuICBhZ2VudE5hbWU6ICAgICB2YXJjaGFyKFwiYWdlbnROYW1lXCIsIHsgbGVuZ3RoOiAyNTUgfSksXG4gIGV2ZW50VHlwZTogICAgIG15c3FsRW51bShcImV2ZW50VHlwZVwiLCBbXCJzZXNzaW9uX3N0YXJ0XCIsXCJnYXRld2F5X2NhbGxcIixcImdhdGV3YXlfZmFsbGJhY2tcIixcImdhdGV3YXlfZXJyb3JcIixcIm91dHB1dFwiLFwic2Vzc2lvbl9lbmRcIl0pLm5vdE51bGwoKSxcbiAgaXNHYXRld2F5T2s6ICAgaW50KFwiaXNHYXRld2F5T2tcIikuZGVmYXVsdCgxKSxcbiAgbGF0ZW5jeU1zOiAgICAgaW50KFwibGF0ZW5jeU1zXCIpLFxuICBjb250ZW50TGVuZ3RoOiBpbnQoXCJjb250ZW50TGVuZ3RoXCIpLFxuICBxdWFsaXR5U2lnbmFsOiBpbnQoXCJxdWFsaXR5U2lnbmFsXCIpLFxuICBlcnJvck1zZzogICAgICB0ZXh0KFwiZXJyb3JNc2dcIiksXG4gIG1ldGFkYXRhOiAgICAgIGpzb24oXCJtZXRhZGF0YVwiKSxcbiAgY3JlYXRlZEF0OiAgICAgdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIFNlc3Npb25FdmVudExvZyA9IHR5cGVvZiBzZXNzaW9uRXZlbnRMb2dzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydFNlc3Npb25FdmVudExvZyA9IHR5cGVvZiBzZXNzaW9uRXZlbnRMb2dzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwIEFydGlmYWN0cyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBhcnRpZmFjdHMgPSBteXNxbFRhYmxlKFwiYXJ0aWZhY3RzXCIsIHtcbiAgaWQ6ICAgICAgICAgICAgICAgaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgbWlzc2lvbklkOiAgICAgICAgaW50KFwibWlzc2lvbklkXCIpLFxuICBzZXNzaW9uSWQ6ICAgICAgICB2YXJjaGFyKFwic2Vzc2lvbklkXCIsIHsgbGVuZ3RoOiAxMjggfSksXG4gIHR5cGU6ICAgICAgICAgICAgIG15c3FsRW51bShcInR5cGVcIiwgW1wiY2FtcGFpZ25fYnJpZWZcIixcImF1ZGllbmNlX21hdHJpeFwiLFwibWVzc2FnaW5nX2FuZ2xlc1wiLFwiY29weV9kcmFmdHNcIixcImNyZWF0aXZlX2RpcmVjdGlvbnNcIixcImxhdW5jaF9jaGVja2xpc3RcIixcInBvc2l0aW9uaW5nXCIsXCJvdGhlclwiXSkuZGVmYXVsdChcIm90aGVyXCIpLFxuICBsYWJlbDogICAgICAgICAgICB2YXJjaGFyKFwibGFiZWxcIiwgeyBsZW5ndGg6IDI1NSB9KSxcbiAgY29udGVudDogICAgICAgICAgbG9uZ3RleHQoXCJjb250ZW50XCIpLFxuICB2ZXJzaW9uOiAgICAgICAgICBpbnQoXCJ2ZXJzaW9uXCIpLmRlZmF1bHQoMSksXG4gIHN0YXR1czogICAgICAgICAgIG15c3FsRW51bShcInN0YXR1c1wiLCBbXCJkcmFmdFwiLFwicGVuZGluZ19yZXZpZXdcIixcImFwcHJvdmVkXCIsXCJuZWVkc19yZXZpc2lvblwiLFwiZXhwb3J0ZWRcIl0pLmRlZmF1bHQoXCJkcmFmdFwiKSxcbiAgY3JlYXRlZEJ5QWdlbnRJZDogaW50KFwiY3JlYXRlZEJ5QWdlbnRJZFwiKSxcbiAgY3JlYXRlZEJ5VXNlcklkOiAgaW50KFwiY3JlYXRlZEJ5VXNlcklkXCIpLFxuICBjcmVhdGVkQXQ6ICAgICAgICB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiAgICAgICAgdGltZXN0YW1wKFwidXBkYXRlZEF0XCIpLmRlZmF1bHROb3coKS5vblVwZGF0ZU5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgQXJ0aWZhY3QgPSB0eXBlb2YgYXJ0aWZhY3RzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydEFydGlmYWN0ID0gdHlwZW9mIGFydGlmYWN0cy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMCBBcnRpZmFjdCBSZXZpZXdzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IGFydGlmYWN0UmV2aWV3cyA9IG15c3FsVGFibGUoXCJhcnRpZmFjdF9yZXZpZXdzXCIsIHtcbiAgaWQ6ICAgICAgICAgICBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBhcnRpZmFjdElkOiAgIGludChcImFydGlmYWN0SWRcIikubm90TnVsbCgpLFxuICBzdGF0dXM6ICAgICAgIG15c3FsRW51bShcInN0YXR1c1wiLCBbXCJkcmFmdFwiLFwicGVuZGluZ1wiLFwiYXBwcm92ZWRcIixcIm5lZWRzX3JldmlzaW9uXCIsXCJleHBvcnRlZFwiXSkuZGVmYXVsdChcImRyYWZ0XCIpLFxuICByZXZpZXdlck5vdGU6IHRleHQoXCJyZXZpZXdlck5vdGVcIiksXG4gIHJldmlld2VkQnk6ICAgaW50KFwicmV2aWV3ZWRCeVwiKSxcbiAgY3JlYXRlZEF0OiAgICB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgQXJ0aWZhY3RSZXZpZXcgPSB0eXBlb2YgYXJ0aWZhY3RSZXZpZXdzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydEFydGlmYWN0UmV2aWV3ID0gdHlwZW9mIGFydGlmYWN0UmV2aWV3cy4kaW5mZXJJbnNlcnQ7XG4iLCAiLyoqXG4gKiBEYXRhYmFzZSBjb25uZWN0aW9uIFx1MjAxNCBEcml6emxlIE9STSBvdmVyIE15U1FMMlxuICpcbiAqIFx1MjcwNSBBbGwgZGF0YSBsaXZlcyBpbiBtb3NfZGIgKGxvY2FsaG9zdCBWTSkuXG4gKiAgICBnZXREYigpICAgICAgIFx1MjE5MiBtb3NfZGIgKHByaW1hcnksIHZpYSBMT0NBTF9EQl8qIGVudiBvciBoYXJkY29kZWQgbW9zIGRlZmF1bHRzKVxuICogICAgZ2V0U293b3JrRGIoKSBcdTIxOTIgYWxpYXMgb2YgZ2V0RGIoKSAoc293b3JrX2RiIGRlcGVuZGVuY3kgZnVsbHkgcmVtb3ZlZClcbiAqXG4gKiBMT0NBTF9EQl9IT1NUIC8gTE9DQUxfREJfVVNFUiAvIExPQ0FMX0RCX1BBU1NXT1JEIC8gTE9DQUxfREJfTkFNRVxuICogICBcdTIxOTIgZGVmYXVsdCB0byBsb2NhbGhvc3QgLyBtb3NfdXNlciAvIG1vc19zZWN1cmVfMjAyNiAvIG1vc19kYlxuICovXG5cbmltcG9ydCB7IGRyaXp6bGUgfSBmcm9tIFwiZHJpenpsZS1vcm0vbXlzcWwyXCI7XG5pbXBvcnQgeyBjcmVhdGVQb29sLCB0eXBlIFBvb2wgfSBmcm9tIFwibXlzcWwyL3Byb21pc2VcIjtcbmltcG9ydCB7IHNxbCB9IGZyb20gXCJkcml6emxlLW9ybVwiO1xuaW1wb3J0ICogYXMgc2NoZW1hIGZyb20gXCIuLi9kcml6emxlL3NjaGVtYVwiO1xuXG5leHBvcnQgdHlwZSBEQiA9IFJldHVyblR5cGU8dHlwZW9mIGRyaXp6bGU8dHlwZW9mIHNjaGVtYT4+O1xuXG5sZXQgZGI6IERCIHwgbnVsbCA9IG51bGw7XG5sZXQgcG9vbDogUG9vbCB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0RGIoKTogUHJvbWlzZTxEQj4ge1xuICBpZiAoZGIpIHJldHVybiBkYjtcblxuICBwb29sID0gY3JlYXRlUG9vbCh7XG4gICAgaG9zdDogICAgIHByb2Nlc3MuZW52LkxPQ0FMX0RCX0hPU1QgICAgIHx8IFwibG9jYWxob3N0XCIsXG4gICAgcG9ydDogICAgIE51bWJlcihwcm9jZXNzLmVudi5MT0NBTF9EQl9QT1JUKSB8fCAzMzA2LFxuICAgIHVzZXI6ICAgICBwcm9jZXNzLmVudi5MT0NBTF9EQl9VU0VSICAgICB8fCBcIm1vc191c2VyXCIsXG4gICAgcGFzc3dvcmQ6IHByb2Nlc3MuZW52LkxPQ0FMX0RCX1BBU1NXT1JEIHx8IFwibW9zX3NlY3VyZV8yMDI2XCIsXG4gICAgZGF0YWJhc2U6IHByb2Nlc3MuZW52LkxPQ0FMX0RCX05BTUUgICAgIHx8IFwibW9zX2RiXCIsXG4gICAgLy8gQXp1cmUgTXlTUUwgcmVxdWlyZXMgVExTOyBlbmFibGUgd2hlbiBEQl9TU0w9dHJ1ZS4gRW1wdHkgc3NsIG9iamVjdFxuICAgIC8vIG1ha2VzIG15c3FsMiB1c2UgaXRzIGJ1bmRsZWQgQ0EgYnVuZGxlICsgc2VydmVyIGNlcnQgdmFsaWRhdGlvbi5cbiAgICBzc2w6ICAgICAgcHJvY2Vzcy5lbnYuREJfU1NMID09PSBcInRydWVcIiA/IHt9IDogdW5kZWZpbmVkLFxuICAgIGNvbm5lY3Rpb25MaW1pdDogICAgICAxMCxcbiAgICB3YWl0Rm9yQ29ubmVjdGlvbnM6ICAgdHJ1ZSxcbiAgICBxdWV1ZUxpbWl0OiAgICAgICAgICAgMCxcbiAgICBjb25uZWN0VGltZW91dDogICAgICAgMTBfMDAwLFxuICAgIGlkbGVUaW1lb3V0OiAgICAgICAgICA2MF8wMDAsXG4gICAgZW5hYmxlS2VlcEFsaXZlOiAgICAgIHRydWUsXG4gICAga2VlcEFsaXZlSW5pdGlhbERlbGF5OiAxMF8wMDAsXG4gIH0pO1xuXG4gIGRiID0gZHJpenpsZShwb29sLCB7IHNjaGVtYSwgbW9kZTogXCJkZWZhdWx0XCIgfSk7XG4gIHJldHVybiBkYjtcbn1cblxuLy8gREVCVC0yOiBIZWFsdGggY2hlY2sgXHUyMDE0IHJldHVybnMgdHJ1ZSBpZiBEQiBpcyByZWFjaGFibGVcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwaW5nRGIoKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgZGF0YWJhc2UgPSBhd2FpdCBnZXREYigpO1xuICAgIGF3YWl0IGRhdGFiYXNlLmV4ZWN1dGUoc3FsYFNFTEVDVCAxYCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vLyBnZXRTb3dvcmtEYiBcdTIwMTQgbm93IGFuIGFsaWFzIGZvciBnZXREYigpIChtb3NfZGIpLlxuLy8gc293b3JrX2RiIEF6dXJlIGRlcGVuZGVuY3kgaXMgZnVsbHkgcmVtb3ZlZC5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTb3dvcmtEYigpOiBQcm9taXNlPERCPiB7XG4gIHJldHVybiBnZXREYigpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGluZ1Nvd29ya0RiKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICByZXR1cm4gcGluZ0RiKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQb29sKCk6IFBvb2wgfCBudWxsIHsgcmV0dXJuIHBvb2w7IH1cblxuLy8gREVCVC0yOiBHcmFjZWZ1bCBzaHV0ZG93biBcdTIwMTQgZHJhaW4gcG9vbCBiZWZvcmUgcHJvY2VzcyBleGl0c1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsb3NlRGIoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmIChwb29sKSBhd2FpdCBwb29sLmVuZCgpO1xuICBkYiA9IG51bGw7XG4gIHBvb2wgPSBudWxsO1xufVxuIiwgIi8qKlxuICogV29ya2VyIGVuZHBvaW50IFx1MjAxNCBwcm9jZXNzZXMgYSBzaW5nbGUgcXVldWVkX2pvYnMgcm93LlxuICpcbiAqIENhbGxlZCB0d28gd2F5czpcbiAqICAgMS4gRmFzdC1wYXRoOiBtYXJrZXRpbmdRdWV1ZS5hZGQoKSBmaXJlcyBhIFBPU1QgaGVyZSB2aWEgd2FpdFVudGlsLlxuICogICAyLiBTYWZldHktbmV0OiAvYXBpL2Nyb24vZHJhaW4tcXVldWUgZmlyZXMgUE9TVHMgZm9yIGFueSByb3dzIHN0aWxsXG4gKiAgICAgIGB3YWl0aW5nYCBhZnRlciAzMHMuXG4gKlxuICogQXRvbWljIGNsYWltIHZpYSBgVVBEQVRFIC4uLiBXSEVSRSBzdGF0dXM9J3dhaXRpbmcnYCBwcmV2ZW50cyBib3RoXG4gKiBwYXRocyBmcm9tIHJhY2luZyBhbmQgcHJvY2Vzc2luZyB0aGUgc2FtZSBqb2IgdHdpY2UuXG4gKlxuICogQXV0aDogQmVhcmVyIENST05fU0VDUkVUIGluIHRoZSBBdXRob3JpemF0aW9uIGhlYWRlci5cbiAqXG4gKiBOT1RFOiBUaGUgcHJvY2Vzc29yIGJvZHkgaXMgaW50ZW50aW9uYWxseSBhIFNUVUIgZm9yIHRoZSBmaXJzdCBkZXBsb3kuXG4gKiBUaGUgZnVsbCBvcmNoZXN0cmF0b3JXb3JrZXIudHMgbG9naWMgaGFzIGxvY2FsaG9zdC1vbmx5IGRlcHNcbiAqIChPcGVuQ2xhdyBnYXRld2F5IEAgMTI3LjAuMC4xOjE4NzkwKSB0aGF0IHdvbid0IHJlYWNoIGZyb20gYSBWZXJjZWxcbiAqIGZ1bmN0aW9uIGNvbnRhaW5lci4gTWlncmF0aW5nIHRoZSByZWFsIHByb2Nlc3NvciBpcyBhIGZvbGxvdy11cDtcbiAqIHRoaXMgZW5kcG9pbnQgcHJvdmVzIHRoZSBBK0IgcGlwZWxpbmUgd3JpdGVzIHN0YXRlIGludG8gdGhlIERCXG4gKiBjb3JyZWN0bHkgZW5kLXRvLWVuZC5cbiAqL1xuaW1wb3J0IHR5cGUgeyBJbmNvbWluZ01lc3NhZ2UsIFNlcnZlclJlc3BvbnNlIH0gZnJvbSBcIm5vZGU6aHR0cFwiO1xuaW1wb3J0IHsgc3FsIH0gZnJvbSBcImRyaXp6bGUtb3JtXCI7XG5pbXBvcnQgeyBnZXREYiB9IGZyb20gXCIuLi8uLi9zZXJ2ZXIvZGJcIjtcbmltcG9ydCB7IHVwZGF0ZUpvYiB9IGZyb20gXCIuLi8uLi9zZXJ2ZXIvcXVldWUvbWFya2V0aW5nUXVldWVcIjtcblxuYXN5bmMgZnVuY3Rpb24gcmVhZEJvZHkocmVxOiBJbmNvbWluZ01lc3NhZ2UpOiBQcm9taXNlPHN0cmluZz4ge1xuICBsZXQgYm9keSA9IFwiXCI7XG4gIGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2YgcmVxKSBib2R5ICs9IGNodW5rO1xuICByZXR1cm4gYm9keTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihyZXE6IEluY29taW5nTWVzc2FnZSwgcmVzOiBTZXJ2ZXJSZXNwb25zZSkge1xuICBjb25zdCBzZW5kID0gKHN0YXR1czogbnVtYmVyLCBwYXlsb2FkOiB1bmtub3duKSA9PiB7XG4gICAgcmVzLnN0YXR1c0NvZGUgPSBzdGF0dXM7XG4gICAgcmVzLnNldEhlYWRlcihcImNvbnRlbnQtdHlwZVwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG4gICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeShwYXlsb2FkKSk7XG4gIH07XG5cbiAgaWYgKHJlcS5tZXRob2QgIT09IFwiUE9TVFwiKSByZXR1cm4gc2VuZCg0MDUsIHsgZXJyb3I6IFwibWV0aG9kX25vdF9hbGxvd2VkXCIgfSk7XG5cbiAgY29uc3Qgc2VjcmV0ID0gcHJvY2Vzcy5lbnYuQ1JPTl9TRUNSRVQ7XG4gIGlmIChzZWNyZXQgJiYgcmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbiAhPT0gYEJlYXJlciAke3NlY3JldH1gKSB7XG4gICAgcmV0dXJuIHNlbmQoNDAxLCB7IGVycm9yOiBcInVuYXV0aG9yaXplZFwiIH0pO1xuICB9XG5cbiAgbGV0IGpvYklkOiBzdHJpbmc7XG4gIHRyeSB7XG4gICAgY29uc3QgcmF3ID0gYXdhaXQgcmVhZEJvZHkocmVxKTtcbiAgICBjb25zdCBib2R5ID0gcmF3ID8gSlNPTi5wYXJzZShyYXcpIDoge307XG4gICAgam9iSWQgPSBib2R5LmpvYklkO1xuICAgIGlmICgham9iSWQgfHwgdHlwZW9mIGpvYklkICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICByZXR1cm4gc2VuZCg0MDAsIHsgZXJyb3I6IFwibWlzc2luZyBqb2JJZFwiIH0pO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHNlbmQoNDAwLCB7IGVycm9yOiBcImJhZF9qc29uXCIgfSk7XG4gIH1cblxuICBjb25zdCBkYiA9IGF3YWl0IGdldERiKCk7XG5cbiAgLy8gQXRvbWljIGNsYWltIFx1MjAxNCBvbmx5IHRoZSBmaXJzdCBjYWxsZXIgd2lucy4gYWZmZWN0ZWRSb3dzIHNlbWFudGljc1xuICAvLyBsZXQgdXMgZGV0ZWN0IHRoYXQgYW5vdGhlciBpbnZvY2F0aW9uIGFscmVhZHkgcGlja2VkIHRoaXMgam9iIHVwLlxuICBjb25zdCBbY2xhaW1dID0gKGF3YWl0IGRiLmV4ZWN1dGUoc3FsYFxuICAgIFVQREFURSBxdWV1ZWRfam9ic1xuICAgIFNFVCBzdGF0dXMgPSAnYWN0aXZlJyxcbiAgICAgICAgc3RhcnRlZF9hdCA9IElGTlVMTChzdGFydGVkX2F0LCBOT1coMykpLFxuICAgICAgICBhdHRlbXB0cyA9IGF0dGVtcHRzICsgMVxuICAgIFdIRVJFIGlkID0gJHtqb2JJZH0gQU5EIHN0YXR1cyA9ICd3YWl0aW5nJ1xuICBgKSkgYXMgdW5rbm93biBhcyBbeyBhZmZlY3RlZFJvd3M6IG51bWJlciB9LCB1bmtub3duXTtcblxuICBpZiAoY2xhaW0uYWZmZWN0ZWRSb3dzID09PSAwKSB7XG4gICAgLy8gRWl0aGVyIGRvZXNuJ3QgZXhpc3Qgb3IgYWxyZWFkeSBhY3RpdmUvY29tcGxldGVkL2ZhaWxlZC5cbiAgICByZXR1cm4gc2VuZCgyMDAsIHsgb2s6IHRydWUsIGpvYklkLCBza2lwcGVkOiBcIm5vdF93YWl0aW5nXCIgfSk7XG4gIH1cblxuICB0cnkge1xuICAgIGNvbnN0IFtyb3dzXSA9IChhd2FpdCBkYi5leGVjdXRlKHNxbGBcbiAgICAgIFNFTEVDVCBpZCwgcXVldWUsIG5hbWUsIGRhdGEgRlJPTSBxdWV1ZWRfam9icyBXSEVSRSBpZCA9ICR7am9iSWR9IExJTUlUIDFcbiAgICBgKSkgYXMgdW5rbm93biBhcyBbQXJyYXk8eyBpZDogc3RyaW5nOyBxdWV1ZTogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IGRhdGE6IHN0cmluZyB9PiwgdW5rbm93bl07XG4gICAgY29uc3Qgcm93ID0gcm93c1swXTtcbiAgICBpZiAoIXJvdykgdGhyb3cgbmV3IEVycm9yKFwiam9iIGRpc2FwcGVhcmVkIGFmdGVyIGNsYWltXCIpO1xuXG4gICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2Uocm93LmRhdGEpO1xuXG4gICAgLy8gXHUyNTAwXHUyNTAwIFByb2Nlc3MgKFNUVUIpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICAgIC8vIFJlYWwgaW1wbGVtZW50YXRpb24gYmVsb25ncyBpbiBhIFZlcmNlbC1jb21wYXRpYmxlIHBvcnQgb2ZcbiAgICAvLyBzZXJ2ZXIvcXVldWUvb3JjaGVzdHJhdG9yV29ya2VyLnRzLiBGb3Igbm93IHdlIGp1c3QgbWFyayBwcm9ncmVzc1xuICAgIC8vIGFuZCB3cml0ZSBhIHN5bnRoZXRpYyByZXN1bHQgc28gdGhlIGUyZSBwaXBlbGluZSBpcyBwcm92YWJsZS5cbiAgICBhd2FpdCB1cGRhdGVKb2Ioam9iSWQsIHsgcHJvZ3Jlc3M6IDI1IH0pO1xuICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDMwMCkpO1xuICAgIGF3YWl0IHVwZGF0ZUpvYihqb2JJZCwgeyBwcm9ncmVzczogNzUgfSk7XG4gICAgYXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgMjAwKSk7XG5cbiAgICBjb25zdCByZXN1bHQgPSB7XG4gICAgICBwcm9jZXNzZWQ6IHRydWUsXG4gICAgICBqb2JOYW1lOiByb3cubmFtZSxcbiAgICAgIHF1ZXVlOiByb3cucXVldWUsXG4gICAgICBlY2hvOiB7XG4gICAgICAgIHVzZXJSZXF1ZXN0OiBwYXlsb2FkLnVzZXJSZXF1ZXN0LFxuICAgICAgICBicmFuZDogcGF5bG9hZC5icmFuZCxcbiAgICAgICAgaW5kdXN0cnk6IHBheWxvYWQuaW5kdXN0cnksXG4gICAgICB9LFxuICAgICAgbm90ZTogXCJTdHViIHByb2Nlc3NvciBcdTIwMTQgb3JjaGVzdHJhdG9yIGxvZ2ljIG5vdCB5ZXQgcG9ydGVkIHRvIFZlcmNlbFwiLFxuICAgICAgY29tcGxldGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICB9O1xuXG4gICAgYXdhaXQgdXBkYXRlSm9iKGpvYklkLCB7IHN0YXR1czogXCJjb21wbGV0ZWRcIiwgcHJvZ3Jlc3M6IDEwMCwgcmVzdWx0IH0pO1xuICAgIHJldHVybiBzZW5kKDIwMCwgeyBvazogdHJ1ZSwgam9iSWQsIHN0YXRlOiBcImNvbXBsZXRlZFwiLCByZXN1bHQgfSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNvbnN0IG1zZyA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcbiAgICBhd2FpdCB1cGRhdGVKb2Ioam9iSWQsIHsgc3RhdHVzOiBcImZhaWxlZFwiLCBmYWlsZWRSZWFzb246IG1zZyB9KTtcbiAgICBjb25zb2xlLmVycm9yKGBbd29ya2VyXSBqb2IgJHtqb2JJZH0gZmFpbGVkOmAsIGVycik7XG4gICAgcmV0dXJuIHNlbmQoNTAwLCB7IG9rOiBmYWxzZSwgam9iSWQsIGVycm9yOiBtc2cgfSk7XG4gIH1cbn1cbiIsICIvKipcbiAqIFVuaWZpZWQgam9iIHF1ZXVlIHByb3ZpZGVyLlxuICpcbiAqIFR3byBiYWNrZW5kcyBiZWhpbmQgdGhlIHNhbWUgc21hbGwgaW50ZXJmYWNlOlxuICpcbiAqICAgXHUyMDIyIFZlcmNlbCAoSVNfVkVSQ0VMKSBcdTIxOTIgREItYmFja2VkOiBJTlNFUlQvU0VMRUNUIGFnYWluc3QgYHF1ZXVlZF9qb2JzYFxuICogICAgIHNvIHN0YXR1cyBzdXJ2aXZlcyBhY3Jvc3Mgc3RhdGVsZXNzIGZ1bmN0aW9uIGludm9jYXRpb25zLiBObyBSZWRpcyxcbiAqICAgICBubyBCdWxsTVEgXHUyMDE0IHRob3NlIHBhY2thZ2VzIGFyZW4ndCBldmVuIGltcG9ydGVkLlxuICpcbiAqICAgXHUyMDIyIFZNIC8gbG9jYWwgKGRlZmF1bHQpIFx1MjE5MiBCdWxsTVEgb24gUmVkaXMgKGV4aXN0aW5nIGJlaGF2aW91ciBrZXB0IGZvclxuICogICAgIGBwbTIgc3RhcnQgc2VydmVyL2luZGV4LnRzYCBvbiB0aGUgQXp1cmUgVk0pLlxuICpcbiAqIENhbGxzaXRlcyB0aGF0IHVzZSBgbWFya2V0aW5nUXVldWUuYWRkKC4uLilgIC8gYHNxdWFkUXVldWUuYWRkKC4uLilgIC9cbiAqIGBtYXJrZXRpbmdRdWV1ZS5nZXRKb2IoaWQpYCBkb24ndCBjaGFuZ2UgXHUyMDE0IHRoZSByZXR1cm5lZCBqb2IgaGFuZGxlIGhhc1xuICogdGhlIHNhbWUgc2hhcGUgKGlkIC8gcHJvZ3Jlc3MgLyByZXR1cm52YWx1ZSAvIGZhaWxlZFJlYXNvbiAvIGdldFN0YXRlKCkpLlxuICpcbiAqIFByb2Nlc3NvcnMgdXBkYXRlIHByb2dyZXNzICsgZmluYWwgcmVzdWx0IHZpYSB0aGUgZXhwb3J0ZWRcbiAqIGB1cGRhdGVKb2IoKWAgaGVscGVyLiBPbiBWZXJjZWwgdGhhdCB3cml0ZXMgdG8gYHF1ZXVlZF9qb2JzYDsgb24gdGhlXG4gKiBWTSBCdWxsTVEgaGFuZGxlcyBpdCB0aHJvdWdoIGl0cyBvd24gSm9iIEFQSSBzbyB1cGRhdGVKb2IoKSBpcyBhIG5vLW9wXG4gKiAocHJvY2Vzc29ycyBrZWVwIGNhbGxpbmcgYGpvYi51cGRhdGVQcm9ncmVzcygpYCBldGMuIGFzIGJlZm9yZSkuXG4gKi9cblxuaW1wb3J0IHsgc3FsIH0gZnJvbSBcImRyaXp6bGUtb3JtXCI7XG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSBcIm5vZGU6Y3J5cHRvXCI7XG5cbmNvbnN0IElTX1ZFUkNFTCA9ICEhcHJvY2Vzcy5lbnYuVkVSQ0VMO1xuXG4vLyBcdTI1MDBcdTI1MDAgUHVibGljIHR5cGVzICh1bmNoYW5nZWQgZm9yIGJhY2stY29tcGF0KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBpbnRlcmZhY2UgTWFya2V0aW5nSm9iRGF0YSB7XG4gIGpvYklkOiBzdHJpbmc7XG4gIHVzZXJSZXF1ZXN0OiBzdHJpbmc7XG4gIGJyYW5kPzogc3RyaW5nO1xuICBpbmR1c3RyeT86IHN0cmluZztcbiAgdGFza1R5cGU/OiBzdHJpbmc7XG4gIHVzZXJJZD86IG51bWJlcjtcbiAgc2Vzc2lvbklkPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1hcmtldGluZ0pvYlJlc3VsdCB7XG4gIGFnZW50OiB7IG5hbWU6IHN0cmluZzsgdGl0bGU6IHN0cmluZzsgdGFza1R5cGU6IHN0cmluZyB9O1xuICBtb2RlbDogc3RyaW5nO1xuICB0aGlua2luZzogc3RyaW5nO1xuICBwdWJsaXNoYWJsZV9jb250ZW50OiBzdHJpbmc7XG4gIG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIHVzYWdlPzogeyBwcm9tcHRfdG9rZW5zOiBudW1iZXI7IGNvbXBsZXRpb25fdG9rZW5zOiBudW1iZXI7IHRvdGFsX3Rva2Vucz86IG51bWJlciB9O1xufVxuXG5leHBvcnQgdHlwZSBKb2JTdGF0ZSA9IFwid2FpdGluZ1wiIHwgXCJhY3RpdmVcIiB8IFwiY29tcGxldGVkXCIgfCBcImZhaWxlZFwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEpvYkhhbmRsZTxUUmVzdWx0ID0gdW5rbm93bj4ge1xuICBpZDogc3RyaW5nO1xuICBwcm9ncmVzczogbnVtYmVyO1xuICByZXR1cm52YWx1ZTogVFJlc3VsdCB8IG51bGw7XG4gIGZhaWxlZFJlYXNvbjogc3RyaW5nIHwgbnVsbDtcbiAgZ2V0U3RhdGUoKTogUHJvbWlzZTxKb2JTdGF0ZT47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSm9iUXVldWU8VERhdGEgPSB1bmtub3duLCBUUmVzdWx0ID0gdW5rbm93bj4ge1xuICBhZGQoXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGRhdGE6IFREYXRhLFxuICAgIG9wdHM/OiB7IGpvYklkPzogc3RyaW5nOyBhdHRlbXB0cz86IG51bWJlcjsgYmFja29mZj86IHVua25vd247IGRlbGF5PzogbnVtYmVyIH0sXG4gICk6IFByb21pc2U8Sm9iSGFuZGxlPFRSZXN1bHQ+PjtcbiAgZ2V0Sm9iKGlkOiBzdHJpbmcpOiBQcm9taXNlPEpvYkhhbmRsZTxUUmVzdWx0PiB8IG51bGw+O1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIERCLWJhY2tlZCBhZGFwdGVyICh1c2VkIG9uIFZlcmNlbClcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5jbGFzcyBEYlF1ZXVlPFREYXRhLCBUUmVzdWx0PiBpbXBsZW1lbnRzIEpvYlF1ZXVlPFREYXRhLCBUUmVzdWx0PiB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcXVldWVOYW1lOiBzdHJpbmcpIHt9XG5cbiAgYXN5bmMgYWRkKG5hbWU6IHN0cmluZywgZGF0YTogVERhdGEsIG9wdHM/OiB7IGpvYklkPzogc3RyaW5nIH0pOiBQcm9taXNlPEpvYkhhbmRsZTxUUmVzdWx0Pj4ge1xuICAgIGNvbnN0IHsgZ2V0RGIgfSA9IGF3YWl0IGltcG9ydChcIi4uL2RiXCIpO1xuICAgIGNvbnN0IGRiID0gYXdhaXQgZ2V0RGIoKTtcbiAgICBjb25zdCBpZCA9IG9wdHM/LmpvYklkID8/IHJhbmRvbVVVSUQoKTtcbiAgICAvLyBPTiBEVVBMSUNBVEUgS0VZIHNvIGEgcmV0cmllZCBlbnF1ZXVlIG9mIHRoZSBzYW1lIGpvYklkIGlzIGlkZW1wb3RlbnQuXG4gICAgYXdhaXQgZGIuZXhlY3V0ZShzcWxgXG4gICAgICBJTlNFUlQgSU5UTyBxdWV1ZWRfam9icyAoaWQsIHF1ZXVlLCBuYW1lLCBkYXRhLCBzdGF0dXMsIHByb2dyZXNzKVxuICAgICAgVkFMVUVTICgke2lkfSwgJHt0aGlzLnF1ZXVlTmFtZX0sICR7bmFtZX0sICR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9LCAnd2FpdGluZycsIDApXG4gICAgICBPTiBEVVBMSUNBVEUgS0VZIFVQREFURSBkYXRhID0gVkFMVUVTKGRhdGEpLCBuYW1lID0gVkFMVUVTKG5hbWUpXG4gICAgYCk7XG5cbiAgICAvLyBGYXN0LXBhdGggZGlzcGF0Y2g6IGZpcmUgUE9TVCB0byAvYXBpL3dvcmtlci9leGVjdXRlLXRhc2sgd2l0aG91dFxuICAgIC8vIGF3YWl0aW5nLiBSZWdpc3RlciB3aXRoIFZlcmNlbCdzIHdhaXRVbnRpbCBzbyB0aGUgcnVudGltZSBkb2Vzbid0XG4gICAgLy8gZnJlZXplIHRoZSBmdW5jdGlvbiBiZWZvcmUgZmV0Y2ggZmlyZXMuIElmIHRoaXMgZmV0Y2ggZmFpbHMsIHRoZVxuICAgIC8vIGNyb24gZHJhaW5lciAoL2FwaS9jcm9uL2RyYWluLXF1ZXVlKSBwaWNrcyB0aGUgam9iIHVwIGFmdGVyIDMwcy5cbiAgICB2b2lkIHRoaXMuZGlzcGF0Y2hBc3luYyhpZCk7XG5cbiAgICByZXR1cm4gdGhpcy5oYW5kbGUoaWQsIFwid2FpdGluZ1wiLCAwLCBudWxsLCBudWxsKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGlzcGF0Y2hBc3luYyhqb2JJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gT25seSBtYXJrZXRpbmctam9icyBjdXJyZW50bHkgaGFzIGEgd29ya2VyIGVuZHBvaW50LiBTcXVhZCBqb2JzXG4gICAgLy8gc3RheSBxdWV1ZWQgdW50aWwgdGhlaXIgb3duIHdvcmtlciBpcyBwb3J0ZWQuXG4gICAgaWYgKHRoaXMucXVldWVOYW1lICE9PSBcIm1hcmtldGluZy1qb2JzXCIpIHJldHVybjtcblxuICAgIGNvbnN0IGJhc2VVcmwgPVxuICAgICAgcHJvY2Vzcy5lbnYuQVBQX1VSTCB8fFxuICAgICAgKHByb2Nlc3MuZW52LlZFUkNFTF9VUkwgPyBgaHR0cHM6Ly8ke3Byb2Nlc3MuZW52LlZFUkNFTF9VUkx9YCA6IG51bGwpO1xuICAgIGlmICghYmFzZVVybCkgcmV0dXJuO1xuXG4gICAgY29uc3QgZmlyZSA9IGZldGNoKGAke2Jhc2VVcmx9L2FwaS93b3JrZXIvZXhlY3V0ZS10YXNrYCwge1xuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgIGF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtwcm9jZXNzLmVudi5DUk9OX1NFQ1JFVCA/PyBcIlwifWAsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBqb2JJZCB9KSxcbiAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAvKiBzd2FsbG93IFx1MjAxNCBjcm9uIGRyYWluIHdpbGwgcmV0cnkgKi9cbiAgICB9KTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHdhaXRVbnRpbCB9ID0gYXdhaXQgaW1wb3J0KFwiQHZlcmNlbC9mdW5jdGlvbnNcIik7XG4gICAgICB3YWl0VW50aWwoZmlyZSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBAdmVyY2VsL2Z1bmN0aW9ucyBub3QgYXZhaWxhYmxlIChlLmcuIHJ1bm5pbmcgbG9jYWxseSkuIFRoZSBwbGFpblxuICAgICAgLy8gUHJvbWlzZSBhYm92ZSB3aWxsIHN0aWxsIHNldHRsZSBpbiBkZXYgZW52aXJvbm1lbnRzIHRoYXQga2VlcCB0aGVcbiAgICAgIC8vIGV2ZW50IGxvb3AgYWxpdmUgdW50aWwgaWRsZS5cbiAgICB9XG4gIH1cblxuICBhc3luYyBnZXRKb2IoaWQ6IHN0cmluZyk6IFByb21pc2U8Sm9iSGFuZGxlPFRSZXN1bHQ+IHwgbnVsbD4ge1xuICAgIGNvbnN0IHsgZ2V0RGIgfSA9IGF3YWl0IGltcG9ydChcIi4uL2RiXCIpO1xuICAgIGNvbnN0IGRiID0gYXdhaXQgZ2V0RGIoKTtcbiAgICBjb25zdCBbcm93c10gPSAoYXdhaXQgZGIuZXhlY3V0ZShzcWxgXG4gICAgICBTRUxFQ1QgaWQsIHN0YXR1cywgcHJvZ3Jlc3MsIHJlc3VsdCwgZmFpbGVkX3JlYXNvblxuICAgICAgRlJPTSBxdWV1ZWRfam9ic1xuICAgICAgV0hFUkUgaWQgPSAke2lkfSBBTkQgcXVldWUgPSAke3RoaXMucXVldWVOYW1lfVxuICAgICAgTElNSVQgMVxuICAgIGApKSBhcyB1bmtub3duIGFzIFtBcnJheTx7XG4gICAgICBpZDogc3RyaW5nO1xuICAgICAgc3RhdHVzOiBKb2JTdGF0ZTtcbiAgICAgIHByb2dyZXNzOiBudW1iZXI7XG4gICAgICByZXN1bHQ6IHN0cmluZyB8IG51bGw7XG4gICAgICBmYWlsZWRfcmVhc29uOiBzdHJpbmcgfCBudWxsO1xuICAgIH0+LCB1bmtub3duXTtcbiAgICBjb25zdCByb3cgPSByb3dzWzBdO1xuICAgIGlmICghcm93KSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGUoXG4gICAgICByb3cuaWQsXG4gICAgICByb3cuc3RhdHVzLFxuICAgICAgcm93LnByb2dyZXNzID8/IDAsXG4gICAgICByb3cucmVzdWx0ID8gKEpTT04ucGFyc2Uocm93LnJlc3VsdCkgYXMgVFJlc3VsdCkgOiBudWxsLFxuICAgICAgcm93LmZhaWxlZF9yZWFzb24sXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlKFxuICAgIGlkOiBzdHJpbmcsXG4gICAgc3RhdGU6IEpvYlN0YXRlLFxuICAgIHByb2dyZXNzOiBudW1iZXIsXG4gICAgcmV0dXJudmFsdWU6IFRSZXN1bHQgfCBudWxsLFxuICAgIGZhaWxlZFJlYXNvbjogc3RyaW5nIHwgbnVsbCxcbiAgKTogSm9iSGFuZGxlPFRSZXN1bHQ+IHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQsXG4gICAgICBwcm9ncmVzcyxcbiAgICAgIHJldHVybnZhbHVlLFxuICAgICAgZmFpbGVkUmVhc29uLFxuICAgICAgZ2V0U3RhdGU6IGFzeW5jICgpID0+IHN0YXRlLFxuICAgIH07XG4gIH1cbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBCdWxsTVEgYWRhcHRlciAodXNlZCBvbiBWTSkuIFJlZGlzICsgQnVsbE1RIGFyZSBkeW5hbWljLWltcG9ydGVkIHNvIHRoZXlcbi8vIG5ldmVyIGxvYWQgb24gVmVyY2VsIFx1MjAxNCB0aGlzIGtlZXBzIHRoZSBmdW5jdGlvbiBjb2xkIHN0YXJ0IFJlZGlzLWZyZWUuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxudHlwZSBMYXp5QnVsbFF1ZXVlID0ge1xuICBhZGQobmFtZTogc3RyaW5nLCBkYXRhOiB1bmtub3duLCBvcHRzPzogdW5rbm93bik6IFByb21pc2U8e1xuICAgIGlkOiBzdHJpbmc7XG4gICAgcHJvZ3Jlc3M6IG51bWJlcjtcbiAgICByZXR1cm52YWx1ZTogdW5rbm93bjtcbiAgICBmYWlsZWRSZWFzb246IHN0cmluZyB8IG51bGw7XG4gICAgZ2V0U3RhdGUoKTogUHJvbWlzZTxzdHJpbmc+O1xuICB9PjtcbiAgZ2V0Sm9iKGlkOiBzdHJpbmcpOiBQcm9taXNlPHtcbiAgICBpZDogc3RyaW5nO1xuICAgIHByb2dyZXNzOiBudW1iZXI7XG4gICAgcmV0dXJudmFsdWU6IHVua25vd247XG4gICAgZmFpbGVkUmVhc29uOiBzdHJpbmcgfCBudWxsO1xuICAgIGdldFN0YXRlKCk6IFByb21pc2U8c3RyaW5nPjtcbiAgfSB8IG51bGw+O1xufTtcblxubGV0IF9idWxsbXFDb25uZWN0aW9uOiB1bmtub3duID0gbnVsbDtcbmNvbnN0IF9idWxsbXFRdWV1ZXM6IE1hcDxzdHJpbmcsIExhenlCdWxsUXVldWU+ID0gbmV3IE1hcCgpO1xuXG5hc3luYyBmdW5jdGlvbiBnZXRCdWxsbXFDb25uZWN0aW9uKCk6IFByb21pc2U8dW5rbm93bj4ge1xuICBpZiAoX2J1bGxtcUNvbm5lY3Rpb24pIHJldHVybiBfYnVsbG1xQ29ubmVjdGlvbjtcbiAgY29uc3QgeyBkZWZhdWx0OiBJT1JlZGlzIH0gPSBhd2FpdCBpbXBvcnQoXCJpb3JlZGlzXCIpO1xuICBfYnVsbG1xQ29ubmVjdGlvbiA9IG5ldyBJT1JlZGlzKHByb2Nlc3MuZW52LlJFRElTX1VSTCB8fCBcInJlZGlzOi8vbG9jYWxob3N0OjYzNzlcIiwge1xuICAgIG1heFJldHJpZXNQZXJSZXF1ZXN0OiBudWxsLFxuICB9KTtcbiAgcmV0dXJuIF9idWxsbXFDb25uZWN0aW9uO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRCdWxsbXFRdWV1ZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPExhenlCdWxsUXVldWU+IHtcbiAgY29uc3QgZXhpc3RpbmcgPSBfYnVsbG1xUXVldWVzLmdldChuYW1lKTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIGNvbnN0IHsgUXVldWUgfSA9IGF3YWl0IGltcG9ydChcImJ1bGxtcVwiKTtcbiAgY29uc3QgcSA9IG5ldyBRdWV1ZShuYW1lLCB7IGNvbm5lY3Rpb246IChhd2FpdCBnZXRCdWxsbXFDb25uZWN0aW9uKCkpIGFzIG5ldmVyIH0pIGFzIHVua25vd24gYXMgTGF6eUJ1bGxRdWV1ZTtcbiAgX2J1bGxtcVF1ZXVlcy5zZXQobmFtZSwgcSk7XG4gIHJldHVybiBxO1xufVxuXG5jbGFzcyBCdWxsbXFRdWV1ZTxURGF0YSwgVFJlc3VsdD4gaW1wbGVtZW50cyBKb2JRdWV1ZTxURGF0YSwgVFJlc3VsdD4ge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHF1ZXVlTmFtZTogc3RyaW5nKSB7fVxuXG4gIGFzeW5jIGFkZChuYW1lOiBzdHJpbmcsIGRhdGE6IFREYXRhLCBvcHRzPzogdW5rbm93bik6IFByb21pc2U8Sm9iSGFuZGxlPFRSZXN1bHQ+PiB7XG4gICAgY29uc3QgcSA9IGF3YWl0IGdldEJ1bGxtcVF1ZXVlKHRoaXMucXVldWVOYW1lKTtcbiAgICBjb25zdCBqb2IgPSBhd2FpdCBxLmFkZChuYW1lLCBkYXRhIGFzIG5ldmVyLCBvcHRzKTtcbiAgICByZXR1cm4gdGhpcy53cmFwKGpvYik7XG4gIH1cblxuICBhc3luYyBnZXRKb2IoaWQ6IHN0cmluZyk6IFByb21pc2U8Sm9iSGFuZGxlPFRSZXN1bHQ+IHwgbnVsbD4ge1xuICAgIGNvbnN0IHEgPSBhd2FpdCBnZXRCdWxsbXFRdWV1ZSh0aGlzLnF1ZXVlTmFtZSk7XG4gICAgY29uc3Qgam9iID0gYXdhaXQgcS5nZXRKb2IoaWQpO1xuICAgIHJldHVybiBqb2IgPyB0aGlzLndyYXAoam9iKSA6IG51bGw7XG4gIH1cblxuICBwcml2YXRlIHdyYXAoam9iOiBBd2FpdGVkPFJldHVyblR5cGU8TGF6eUJ1bGxRdWV1ZVtcImFkZFwiXT4+KTogSm9iSGFuZGxlPFRSZXN1bHQ+IHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGpvYi5pZCxcbiAgICAgIHByb2dyZXNzOiBqb2IucHJvZ3Jlc3MsXG4gICAgICByZXR1cm52YWx1ZTogKGpvYi5yZXR1cm52YWx1ZSA/PyBudWxsKSBhcyBUUmVzdWx0IHwgbnVsbCxcbiAgICAgIGZhaWxlZFJlYXNvbjogam9iLmZhaWxlZFJlYXNvbixcbiAgICAgIGdldFN0YXRlOiBhc3luYyAoKSA9PiAoYXdhaXQgam9iLmdldFN0YXRlKCkpIGFzIEpvYlN0YXRlLFxuICAgIH07XG4gIH1cbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBQdWJsaWMgcXVldWUgaW5zdGFuY2VzXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZnVuY3Rpb24gbWFrZVF1ZXVlPFREYXRhLCBUUmVzdWx0PihuYW1lOiBzdHJpbmcpOiBKb2JRdWV1ZTxURGF0YSwgVFJlc3VsdD4ge1xuICByZXR1cm4gSVNfVkVSQ0VMXG4gICAgPyBuZXcgRGJRdWV1ZTxURGF0YSwgVFJlc3VsdD4obmFtZSlcbiAgICA6IG5ldyBCdWxsbXFRdWV1ZTxURGF0YSwgVFJlc3VsdD4obmFtZSk7XG59XG5cbmV4cG9ydCBjb25zdCBtYXJrZXRpbmdRdWV1ZTogSm9iUXVldWU8TWFya2V0aW5nSm9iRGF0YSwgTWFya2V0aW5nSm9iUmVzdWx0PiA9XG4gIG1ha2VRdWV1ZTxNYXJrZXRpbmdKb2JEYXRhLCBNYXJrZXRpbmdKb2JSZXN1bHQ+KFwibWFya2V0aW5nLWpvYnNcIik7XG5cbmV4cG9ydCBjb25zdCBzcXVhZFF1ZXVlOiBKb2JRdWV1ZTx1bmtub3duLCB1bmtub3duPiA9IG1ha2VRdWV1ZShcInNxdWFkLWpvYnNcIik7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gQnVsbE1RIGBjb25uZWN0aW9uYCByZS1leHBvcnQgXHUyMDE0IHVzZWQgYnkgd29ya2VyIGZpbGVzIGluc2lkZSBzdGFydFh4eFdvcmtlcigpXG4vLyBjYWxscywgYWxsIG9mIHdoaWNoIG9ubHkgcnVuIHdoZW4gIUlTX1ZFUkNFTC4gV2Ugc3RpbGwgZXhwb3J0IGEgUHJveHkgc29cbi8vIHdvcmtlcnMgdGhhdCByZWFkIHByb3BlcnRpZXMgYXQgY2FsbCB0aW1lIGdldCBhIGxhemlseS1jb25zdHJ1Y3RlZCBSZWRpc1xuLy8gY2xpZW50LiBBY2Nlc3NpbmcgdGhpcyBvbiBWZXJjZWwgdGhyb3dzLCB3aGljaCBpcyB3aGF0IHdlIHdhbnQgXHUyMDE0IGl0IHdvdWxkXG4vLyBvbmx5IGJlIGhpdCBieSBhIHByb2dyYW1taW5nIGVycm9yIChlLmcuIHJ1bm5pbmcgYSB3b3JrZXIgb24gc2VydmVybGVzcykuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBjb25uZWN0aW9uOiB1bmtub3duID0gbmV3IFByb3h5KFxuICB7fSxcbiAge1xuICAgIGdldChfdCwgcHJvcCkge1xuICAgICAgaWYgKElTX1ZFUkNFTCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgXCJbcXVldWVdIFJlZGlzIGNvbm5lY3Rpb24gaXMgbm90IGF2YWlsYWJsZSBvbiBWZXJjZWwgXHUyMDE0IHVzZSB0aGUgREItYmFja2VkIHF1ZXVlIChzZWUgbWFya2V0aW5nUXVldWUudHMpLlwiLFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gUmV0dXJuIGEgUHJvbWlzZS1ib3VuZCB2YWx1ZSBzbyBjYWxsZXJzIGNhbiBgYXdhaXQgY29ubmVjdGlvbi54eHhgXG4gICAgICAvLyBvciBwYXNzIGl0IGFzIGEgY29uZmlnIHRoYXQgZXZlbnR1YWxseSBkZXJlZmVyZW5jZXMuXG4gICAgICBjb25zdCB0aHVuayA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgYyA9IChhd2FpdCBnZXRCdWxsbXFDb25uZWN0aW9uKCkpIGFzIFJlY29yZDxQcm9wZXJ0eUtleSwgdW5rbm93bj47XG4gICAgICAgIGNvbnN0IHYgPSBjW3Byb3BdO1xuICAgICAgICByZXR1cm4gdHlwZW9mIHYgPT09IFwiZnVuY3Rpb25cIiA/ICh2IGFzICguLi5hOiB1bmtub3duW10pID0+IHVua25vd24pLmJpbmQoYykgOiB2O1xuICAgICAgfTtcbiAgICAgIC8vIFByb3BlcnR5LWFjY2VzcyBvbiBQcm94eSBuZWVkcyBhIHN5bmMgcmV0dXJuOiBoYW5kIGJhY2sgdGhlIHRodW5rXG4gICAgICAvLyBkaXJlY3RseSBmb3IgY2FsbGVycyB0aGF0IGF3YWl0IGl0LCBvdGhlcndpc2UgQnVsbE1RJ3MgV29ya2VyXG4gICAgICAvLyBjb25zdHJ1Y3RvciByZWFkcyBzcGVjaWZpYyBmaWVsZHMgdGhhdCB3ZSBjYW4ndCBzcG9vZi4gU2luY2VcbiAgICAgIC8vIFdvcmtlcnMgYXJlIGdhdGVkIGJlaGluZCAhSVNfVkVSQ0VMIGluIHNlcnZlci9pbmRleC50cyB0aGV5IG5ldmVyXG4gICAgICAvLyBjb25zdHJ1Y3Qgb24gVmVyY2VsLCBzbyB0aGlzIGJyYW5jaCBpcyBvbmx5IHJlYWNoZWQgb24gdGhlIFZNXG4gICAgICAvLyB3aGVyZSB0aGUgdGh1bmsgcmVzb2x2ZXMgY29ycmVjdGx5LlxuICAgICAgcmV0dXJuIHRodW5rO1xuICAgIH0sXG4gIH0sXG4pO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIFN0YXR1cy11cGRhdGUgQVBJIFx1MjAxNCBmb3IgcHJvY2Vzc29ycyBydW5uaW5nIGFzIFZlcmNlbCBGdW5jdGlvbnMgdG8gd3JpdGVcbi8vIHByb2dyZXNzIC8gcmVzdWx0IGJhY2sgdG8gYHF1ZXVlZF9qb2JzYC4gT24gdGhlIFZNIEJ1bGxNUSdzIEpvYiBBUEkgaGFuZGxlc1xuLy8gdGhpcyBuYXRpdmVseSwgc28gdGhpcyBpcyBhIG5vLW9wIHRoZXJlLlxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdXBkYXRlSm9iKFxuICBpZDogc3RyaW5nLFxuICBwYXRjaDoge1xuICAgIHN0YXR1cz86IEpvYlN0YXRlO1xuICAgIHByb2dyZXNzPzogbnVtYmVyO1xuICAgIHJlc3VsdD86IHVua25vd247XG4gICAgZmFpbGVkUmVhc29uPzogc3RyaW5nIHwgbnVsbDtcbiAgfSxcbik6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoIUlTX1ZFUkNFTCkgcmV0dXJuO1xuICBjb25zdCB7IGdldERiIH0gPSBhd2FpdCBpbXBvcnQoXCIuLi9kYlwiKTtcbiAgY29uc3QgZGIgPSBhd2FpdCBnZXREYigpO1xuXG4gIC8vIEJ1aWxkIGluZGl2aWR1YWwgc3FsIGZyYWdtZW50cyB0aGVuIGNvbXBvc2UuIERyaXp6bGUncyBzcWwgdGVtcGxhdGVcbiAgLy8gaGFuZGxlcyBwYXJhbWV0ZXIgYmluZGluZyBmb3IgZWFjaCBwaWVjZS5cbiAgY29uc3Qgc2V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzcWw+W10gPSBbXTtcbiAgaWYgKHBhdGNoLnN0YXR1cyAhPT0gdW5kZWZpbmVkKSBzZXQucHVzaChzcWxgc3RhdHVzID0gJHtwYXRjaC5zdGF0dXN9YCk7XG4gIGlmIChwYXRjaC5wcm9ncmVzcyAhPT0gdW5kZWZpbmVkKSBzZXQucHVzaChzcWxgcHJvZ3Jlc3MgPSAke3BhdGNoLnByb2dyZXNzfWApO1xuICBpZiAocGF0Y2gucmVzdWx0ICE9PSB1bmRlZmluZWQpIHNldC5wdXNoKHNxbGByZXN1bHQgPSAke0pTT04uc3RyaW5naWZ5KHBhdGNoLnJlc3VsdCl9YCk7XG4gIGlmIChwYXRjaC5mYWlsZWRSZWFzb24gIT09IHVuZGVmaW5lZCkgc2V0LnB1c2goc3FsYGZhaWxlZF9yZWFzb24gPSAke3BhdGNoLmZhaWxlZFJlYXNvbn1gKTtcbiAgaWYgKHBhdGNoLnN0YXR1cyA9PT0gXCJhY3RpdmVcIikgc2V0LnB1c2goc3FsYHN0YXJ0ZWRfYXQgPSBJRk5VTEwoc3RhcnRlZF9hdCwgTk9XKDMpKWApO1xuICBpZiAocGF0Y2guc3RhdHVzID09PSBcImNvbXBsZXRlZFwiIHx8IHBhdGNoLnN0YXR1cyA9PT0gXCJmYWlsZWRcIikge1xuICAgIHNldC5wdXNoKHNxbGBjb21wbGV0ZWRfYXQgPSBOT1coMylgKTtcbiAgfVxuICBpZiAoc2V0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIEpvaW4gdGhlIGZyYWdtZW50cyB3aXRoIGNvbW1hcy5cbiAgY29uc3Qgc2V0Q2xhdXNlID0gc2V0LnJlZHVjZShcbiAgICAoYWNjLCBmcmFnLCBpKSA9PiAoaSA9PT0gMCA/IGZyYWcgOiBzcWxgJHthY2N9LCAke2ZyYWd9YCksXG4gICAgc3FsYGAsXG4gICk7XG5cbiAgYXdhaXQgZGIuZXhlY3V0ZShzcWxgVVBEQVRFIHF1ZXVlZF9qb2JzIFNFVCAke3NldENsYXVzZX0gV0hFUkUgaWQgPSAke2lkfWApO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFDRTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDSztBQUNQLFNBQVMsV0FBVztBQWRwQixJQXFCYSxPQWlDQSxRQXdDQSxRQXFDQSxPQWlDQSxnQkF3QkEsZUEwQkEsZ0JBK0JBLGVBb0JBLGFBc0JBLGlCQTJDQSx1QkFpQkEsbUJBb0JBLGdCQXlCQSxhQWVBLGVBYUEsNkJBZ0JBLHFCQWFBLGVBZUEseUJBc0JBLGNBa0JBLGVBZUEsbUJBa0JBLFdBMEJBLFVBZ0NBLGtCQWVBLGlCQWNBLGtCQWdCQSxnQkFpQkEsY0FhQSxnQkFZQSxrQkFjQSxhQWVBLGlCQW1CQSxnQkF5QkEsdUJBdUJBLHdCQVlBLG9CQXFCQSxrQkFtQkEsV0FrQkE7QUFoMUJiO0FBQUE7QUFBQTtBQXFCTyxJQUFNLFFBQVEsV0FBVyxTQUFTO0FBQUEsTUFDdkMsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFFBQVEsUUFBUSxVQUFVLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxRQUFRLEVBQUUsT0FBTztBQUFBLE1BQzNELE1BQU0sS0FBSyxNQUFNO0FBQUEsTUFDakIsT0FBTyxRQUFRLFNBQVMsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQ3ZDLE1BQU0sVUFBVSxRQUFRLENBQUMsUUFBUSxPQUFPLENBQUMsRUFBRSxRQUFRLE1BQU0sRUFBRSxRQUFRO0FBQUEsTUFDbkUsVUFBVSxJQUFJLFVBQVUsRUFBRSxRQUFRLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDN0MsU0FBUyxJQUFJLFNBQVMsRUFBRSxRQUFRLEdBQUksRUFBRSxRQUFRO0FBQUEsTUFDOUMscUJBQXFCLElBQUkscUJBQXFCLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUTtBQUFBO0FBQUEsTUFFbkUsY0FBYyxRQUFRLGdCQUFnQixFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDckQsWUFBWSxVQUFVLGNBQWMsQ0FBQyxZQUFZLFNBQVMsVUFBVSxPQUFPLENBQUMsRUFBRSxRQUFRLFVBQVU7QUFBQTtBQUFBLE1BRWhHLHdCQUF3QixRQUFRLDBCQUEwQixFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDekUsMEJBQTBCLFVBQVUsMEJBQTBCO0FBQUE7QUFBQSxNQUU5RCxvQkFBb0IsUUFBUSxzQkFBc0IsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQ2pFLHNCQUFzQixVQUFVLHNCQUFzQjtBQUFBO0FBQUEsTUFFdEQsZ0JBQWdCLFFBQVEsa0JBQWtCLEVBQUUsUUFBUSxHQUFHLENBQUM7QUFBQSxNQUN4RCxhQUFhLFFBQVEsZUFBZSxFQUFFLFFBQVEsR0FBRyxDQUFDO0FBQUEsTUFDbEQsYUFBYSxVQUFVLGFBQWE7QUFBQTtBQUFBLE1BRXBDLFdBQVcsSUFBSSxXQUFXO0FBQUEsTUFDMUIsY0FBYyxJQUFJLGNBQWM7QUFBQSxNQUNoQyxTQUFTLFVBQVUsV0FBVyxDQUFDLFNBQVMsU0FBUyxRQUFRLENBQUMsRUFBRSxRQUFRLFFBQVE7QUFBQSxNQUM1RSxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDdkQsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFFBQVE7QUFBQSxJQUN2RSxDQUFDO0FBS00sSUFBTSxTQUFTLFdBQVcsVUFBVTtBQUFBLE1BQ3pDLElBQUksSUFBSSxJQUFJLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFBQSxNQUN6QyxNQUFNLFFBQVEsUUFBUSxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsUUFBUSxFQUFFLE9BQU87QUFBQSxNQUN2RCxNQUFNLFFBQVEsUUFBUSxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQzlDLGFBQWEsUUFBUSxlQUFlLEVBQUUsUUFBUSxHQUFHLENBQUM7QUFBQSxNQUNsRCxPQUFPLFFBQVEsU0FBUyxFQUFFLFFBQVEsSUFBSSxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ2pELE9BQU8sVUFBVSxTQUFTLENBQUMsWUFBWSxhQUFhLFVBQVUsQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUN6RSxXQUFXLEtBQUssV0FBVztBQUFBLE1BQzNCLFVBQVUsS0FBSyxVQUFVO0FBQUEsTUFDekIsS0FBSyxLQUFLLEtBQUs7QUFBQSxNQUNmLFdBQVcsS0FBSyxXQUFXO0FBQUEsTUFDM0Isa0JBQWtCLEtBQUssa0JBQWtCLEVBQUUsTUFBZ0I7QUFBQSxNQUMzRCxRQUFRLEtBQUssUUFBUSxFQUFFLE1BQWdCO0FBQUEsTUFDdkMsYUFBYSxLQUFLLGFBQWEsRUFBRSxNQUFnRTtBQUFBLE1BQ2pHLGNBQWMsUUFBUSxnQkFBZ0IsRUFBRSxXQUFXLElBQUksT0FBTyxFQUFFLENBQUM7QUFBQSxNQUNqRSxjQUFjLFFBQVEsZ0JBQWdCLEVBQUUsV0FBVyxJQUFJLE9BQU8sRUFBRSxDQUFDO0FBQUEsTUFDakUsUUFBUSxRQUFRLFVBQVUsRUFBRSxXQUFXLEdBQUcsT0FBTyxFQUFFLENBQUMsRUFBRSxRQUFRLE1BQU07QUFBQSxNQUNwRSxhQUFhLElBQUksYUFBYSxFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQ3pDLFdBQVcsSUFBSSxXQUFXLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDckMsYUFBYSxRQUFRLGFBQWEsRUFBRSxRQUFRLElBQUk7QUFBQSxNQUNoRCxZQUFZLFFBQVEsWUFBWSxFQUFFLFFBQVEsS0FBSztBQUFBLE1BQy9DLFdBQVcsSUFBSSxXQUFXLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDckMsWUFBWSxLQUFLLFlBQVk7QUFBQSxNQUM3QixrQkFBa0IsS0FBSyxrQkFBa0I7QUFBQSxNQUN6QyxhQUFhLEtBQUssYUFBYTtBQUFBO0FBQUEsTUFFL0IsZUFBZSxJQUFJLGVBQWU7QUFBQTtBQUFBLE1BQ2xDLGNBQWMsVUFBVSxnQkFBZ0IsQ0FBQyxXQUFXLFlBQVksVUFBVSxDQUFDLEVBQUUsUUFBUSxVQUFVO0FBQUEsTUFDL0YsWUFBWSxLQUFLLFlBQVk7QUFBQTtBQUFBLE1BQzdCLFdBQVcsSUFBSSxXQUFXLEVBQUUsUUFBUSxDQUFDO0FBQUE7QUFBQSxNQUNyQyxlQUFlLElBQUksZUFBZSxFQUFFLFFBQVEsQ0FBQztBQUFBO0FBQUEsTUFDN0MsYUFBYSxJQUFJLGFBQWEsRUFBRSxRQUFRLENBQUM7QUFBQTtBQUFBLE1BQ3pDLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUN2RCxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFNTSxJQUFNLFNBQVMsV0FBVyxVQUFVO0FBQUEsTUFDekMsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFFBQVEsSUFBSSxRQUFRO0FBQUEsTUFDcEIsTUFBTSxRQUFRLFFBQVEsRUFBRSxRQUFRLElBQUksQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUMvQyxNQUFNLFFBQVEsUUFBUSxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQzlDLFVBQVUsUUFBUSxZQUFZLEVBQUUsUUFBUSxHQUFHLENBQUM7QUFBQSxNQUM1QyxTQUFTLEtBQUssU0FBUztBQUFBLE1BQ3ZCLGFBQWEsS0FBSyxhQUFhO0FBQUEsTUFDL0IsYUFBYSxLQUFLLGFBQWE7QUFBQSxNQUMvQixTQUFTLEtBQUssU0FBUztBQUFBLE1BQ3ZCLGdCQUFnQixJQUFJLGdCQUFnQixFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQy9DLG1CQUFtQixVQUFVLHFCQUFxQixDQUFDLFdBQVcsZUFBZSxXQUFXLENBQUMsRUFBRSxRQUFRLFNBQVM7QUFBQSxNQUM1RyxvQkFBb0IsS0FBSyxvQkFBb0I7QUFBQSxNQUM3QyxtQkFBbUIsS0FBSyxtQkFBbUI7QUFBQSxNQUMzQyxXQUFXLElBQUksV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUNwQyxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVc7QUFBQSxNQUM3QyxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxZQUFZO0FBQUE7QUFBQSxNQUUzRCxTQUFTLEtBQUssU0FBUztBQUFBLE1BQ3ZCLGdCQUFnQixLQUFLLGdCQUFnQjtBQUFBLE1BQ3JDLFlBQVksS0FBSyxZQUFZO0FBQUEsTUFDN0IsZ0JBQWdCLEtBQUssZ0JBQWdCLEVBQUUsTUFBK0I7QUFBQSxNQUN0RSxXQUFXLFFBQVEsV0FBVyxFQUFFLFFBQVEsS0FBSztBQUFBO0FBQUEsTUFFN0Msa0JBQWtCLEtBQUssa0JBQWtCO0FBQUEsTUFDekMsY0FBYyxRQUFRLGdCQUFnQixFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDckQsV0FBVyxRQUFRLGFBQWEsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQy9DLFdBQVcsUUFBUSxhQUFhLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUMvQyxlQUFlLFFBQVEsaUJBQWlCLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUN2RCxnQkFBZ0IsUUFBUSxrQkFBa0IsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQ3pELFlBQVksUUFBUSxZQUFZLEVBQUUsUUFBUSxDQUFDO0FBQUEsSUFDN0MsQ0FBQztBQU1NLElBQU0sUUFBUSxXQUFXLFNBQVM7QUFBQSxNQUN2QyxJQUFJLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDekMsUUFBUSxJQUFJLFFBQVEsRUFBRSxRQUFRO0FBQUEsTUFDOUIsU0FBUyxJQUFJLFNBQVMsRUFBRSxRQUFRO0FBQUEsTUFDaEMsU0FBUyxJQUFJLFNBQVM7QUFBQTtBQUFBLE1BQ3RCLGNBQWMsSUFBSSxjQUFjO0FBQUE7QUFBQSxNQUNoQyxhQUFhLEtBQUssYUFBYTtBQUFBO0FBQUEsTUFDL0IsZ0JBQWdCLElBQUksZ0JBQWdCO0FBQUEsTUFDcEMsT0FBTyxRQUFRLFNBQVMsRUFBRSxRQUFRLElBQUksQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUNqRCxhQUFhLEtBQUssYUFBYTtBQUFBLE1BQy9CLFVBQVUsUUFBUSxZQUFZLEVBQUUsUUFBUSxHQUFHLENBQUM7QUFBQSxNQUM1QyxRQUFRLFVBQVUsVUFBVSxDQUFDLFdBQVcsZUFBZSxVQUFVLGFBQWEsV0FBVyxDQUFDLEVBQUUsUUFBUSxTQUFTLEVBQUUsUUFBUTtBQUFBLE1BQ3ZILFVBQVUsVUFBVSxZQUFZLENBQUMsT0FBTyxVQUFVLFFBQVEsUUFBUSxDQUFDLEVBQUUsUUFBUSxRQUFRO0FBQUEsTUFDckYsU0FBUyxVQUFVLFNBQVM7QUFBQSxNQUM1QixhQUFhLFFBQVEsYUFBYSxFQUFFLFFBQVEsS0FBSztBQUFBLE1BQ2pELG1CQUFtQixRQUFRLHFCQUFxQixFQUFFLFFBQVEsR0FBRyxDQUFDO0FBQUE7QUFBQSxNQUM5RCxZQUFZLFFBQVEsY0FBYyxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUE7QUFBQSxNQUNqRCxlQUFlLEtBQUssZUFBZTtBQUFBO0FBQUEsTUFDbkMsYUFBYSxVQUFVLGFBQWE7QUFBQSxNQUNwQyxRQUFRLEtBQUssUUFBUTtBQUFBLE1BQ3JCLGVBQWUsS0FBSyxlQUFlO0FBQUE7QUFBQSxNQUVuQyxvQkFBb0IsS0FBSyxvQkFBb0I7QUFBQSxNQUM3QyxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDdkQsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFFBQVE7QUFBQSxJQUN2RSxDQUFDO0FBUU0sSUFBTSxpQkFBaUIsV0FBVyxtQkFBbUI7QUFBQSxNQUMxRCxJQUFJLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDekMsUUFBUSxJQUFJLFFBQVEsRUFBRSxRQUFRO0FBQUEsTUFDOUIsUUFBUSxJQUFJLFFBQVEsRUFBRSxRQUFRO0FBQUEsTUFDOUIsU0FBUyxJQUFJLFNBQVMsRUFBRSxRQUFRO0FBQUEsTUFDaEMsUUFBUSxVQUFVLFVBQVUsQ0FBQyxXQUFXLGFBQWEsVUFBVSxXQUFXLENBQUMsRUFBRSxRQUFRLFNBQVMsRUFBRSxRQUFRO0FBQUE7QUFBQSxNQUV4RyxRQUFRLEtBQUssUUFBUTtBQUFBO0FBQUEsTUFFckIsUUFBUSxTQUFTLFFBQVE7QUFBQTtBQUFBLE1BRXpCLGNBQWMsS0FBSyxjQUFjO0FBQUE7QUFBQSxNQUVqQyxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDdkQsYUFBYSxVQUFVLGFBQWE7QUFBQSxNQUNwQyxZQUFZLElBQUksWUFBWTtBQUFBLE1BQzVCLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxJQUN6RCxDQUFDO0FBT00sSUFBTSxnQkFBZ0IsV0FBVyxrQkFBa0I7QUFBQSxNQUN4RCxJQUFJLElBQUksSUFBSSxFQUFFLFdBQVcsRUFBRSxjQUFjO0FBQUEsTUFDekMsUUFBUSxJQUFJLFFBQVEsRUFBRSxRQUFRO0FBQUEsTUFDOUIsU0FBUyxJQUFJLFNBQVM7QUFBQSxNQUN0QixNQUFNLFFBQVEsUUFBUSxFQUFFLFFBQVEsSUFBSSxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQy9DLGFBQWEsS0FBSyxhQUFhO0FBQUE7QUFBQSxNQUUvQixrQkFBa0IsUUFBUSxvQkFBb0IsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQzdELGlCQUFpQixRQUFRLG1CQUFtQixFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUE7QUFBQTtBQUFBLE1BRzNELE9BQU8sS0FBSyxPQUFPLEVBQUUsUUFBUTtBQUFBLE1BQzdCLFVBQVUsUUFBUSxVQUFVLEVBQUUsUUFBUSxJQUFJLEVBQUUsUUFBUTtBQUFBO0FBQUEsTUFFcEQsY0FBYyxJQUFJLGNBQWMsRUFBRSxRQUFRLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDckQsaUJBQWlCLFVBQVUsaUJBQWlCO0FBQUEsTUFDNUMsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUFBLE1BQ3ZELFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxRQUFRO0FBQUEsSUFDdkUsQ0FBQztBQVFNLElBQU0saUJBQWlCLFdBQVcsbUJBQW1CO0FBQUEsTUFDMUQsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFNBQVMsSUFBSSxTQUFTLEVBQUUsUUFBUTtBQUFBLE1BQ2hDLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQzlCLFNBQVMsSUFBSSxTQUFTO0FBQUEsTUFDdEIsUUFBUSxJQUFJLFFBQVE7QUFBQTtBQUFBLE1BRXBCLGtCQUFrQixVQUFVLG9CQUFvQixDQUFDLFlBQVksV0FBVyxNQUFNLENBQUMsRUFBRSxRQUFRO0FBQUE7QUFBQSxNQUV6RixXQUFXLFFBQVEsV0FBVyxFQUFFLFFBQVEsS0FBSyxFQUFFLFFBQVE7QUFBQTtBQUFBLE1BRXZELFdBQVcsUUFBUSxhQUFhLEVBQUUsUUFBUSxJQUFJLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDekQsaUJBQWlCLEtBQUssaUJBQWlCO0FBQUEsTUFDdkMsVUFBVSxRQUFRLFlBQVksRUFBRSxRQUFRLEdBQUcsQ0FBQztBQUFBO0FBQUEsTUFFNUMsZUFBZSxLQUFLLGVBQWU7QUFBQTtBQUFBLE1BRW5DLFlBQVksU0FBUyxZQUFZO0FBQUE7QUFBQSxNQUVqQyxZQUFZLElBQUksWUFBWTtBQUFBO0FBQUEsTUFDNUIsY0FBYyxLQUFLLGNBQWM7QUFBQTtBQUFBLE1BQ2pDLFlBQVksVUFBVSxZQUFZO0FBQUE7QUFBQSxNQUVsQyxjQUFjLEtBQUssY0FBYztBQUFBLE1BQ2pDLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUN2RCxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFLTSxJQUFNLGdCQUFnQixXQUFXLGlCQUFpQjtBQUFBLE1BQ3ZELElBQUksSUFBSSxJQUFJLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFBQSxNQUN6QyxRQUFRLElBQUksUUFBUSxFQUFFLFFBQVE7QUFBQSxNQUM5QixTQUFTLElBQUksU0FBUyxFQUFFLFFBQVE7QUFBQSxNQUNoQyxTQUFTLElBQUksU0FBUztBQUFBO0FBQUEsTUFDdEIsTUFBTSxVQUFVLFFBQVEsQ0FBQyxZQUFZLFdBQVcsTUFBTSxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ2pFLFFBQVEsVUFBVSxVQUFVLENBQUMsVUFBVSxVQUFVLGFBQWEsU0FBUyxDQUFDLEVBQUUsUUFBUSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQ3BHLHNCQUFzQixRQUFRLHdCQUF3QixFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDckUsa0JBQWtCLFFBQVEsb0JBQW9CLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUM3RCxvQkFBb0IsVUFBVSxvQkFBb0I7QUFBQSxNQUNsRCxrQkFBa0IsVUFBVSxrQkFBa0I7QUFBQSxNQUM5QyxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDdkQsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFFBQVE7QUFBQSxJQUN2RSxDQUFDO0FBT00sSUFBTSxjQUFjLFdBQVcsZ0JBQWdCO0FBQUEsTUFDcEQsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU87QUFBQTtBQUFBLE1BRXZDLGFBQWEsSUFBSSxhQUFhLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUTtBQUFBO0FBQUEsTUFDbkQsYUFBYSxJQUFJLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRSxRQUFRO0FBQUE7QUFBQTtBQUFBLE1BRW5ELGNBQWMsSUFBSSxjQUFjLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUTtBQUFBO0FBQUEsTUFFckQsVUFBVSxVQUFVLFlBQVksQ0FBQyxhQUFhLGVBQWUsY0FBYyxPQUFPLENBQUMsRUFBRSxRQUFRLE9BQU8sRUFBRSxRQUFRO0FBQUE7QUFBQSxNQUU5RyxZQUFZLFVBQVUsWUFBWTtBQUFBLE1BQ2xDLFVBQVUsVUFBVSxVQUFVO0FBQUEsTUFDOUIsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUFBLE1BQ3ZELFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxRQUFRO0FBQUEsSUFDdkUsQ0FBQztBQU9NLElBQU0sa0JBQWtCLFdBQVcscUJBQXFCO0FBQUEsTUFDN0QsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQzlCLFNBQVMsSUFBSSxTQUFTO0FBQUE7QUFBQTtBQUFBLE1BRXRCLFlBQVksVUFBVSxjQUFjO0FBQUEsUUFDbEM7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLE1BQ0YsQ0FBQyxFQUFFLFFBQVE7QUFBQTtBQUFBLE1BRVgsZUFBZSxJQUFJLGVBQWUsRUFBRSxRQUFRO0FBQUE7QUFBQSxNQUU1QyxhQUFhLElBQUksYUFBYTtBQUFBLE1BQzlCLHNCQUFzQixRQUFRLHdCQUF3QixFQUFFLFdBQVcsR0FBRyxPQUFPLEVBQUUsQ0FBQztBQUFBLE1BQ2hGLDZCQUE2QixRQUFRLCtCQUErQixFQUFFLFdBQVcsR0FBRyxPQUFPLEVBQUUsQ0FBQztBQUFBLE1BQzlGLG1CQUFtQixRQUFRLHFCQUFxQixFQUFFLFdBQVcsR0FBRyxPQUFPLEVBQUUsQ0FBQztBQUFBLE1BQzFFLGlCQUFpQixJQUFJLGlCQUFpQixFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQ2pELGlCQUFpQixRQUFRLG1CQUFtQixFQUFFLFdBQVcsR0FBRyxPQUFPLEVBQUUsQ0FBQztBQUFBO0FBQUEsTUFFdEUsYUFBYSxJQUFJLGFBQWE7QUFBQSxNQUM5QixjQUFjLElBQUksY0FBYztBQUFBO0FBQUEsTUFFaEMsUUFBUSxJQUFJLFFBQVE7QUFBQSxNQUNwQixnQkFBZ0IsSUFBSSxnQkFBZ0I7QUFBQSxNQUNwQyxZQUFZLElBQUksWUFBWTtBQUFBO0FBQUEsTUFDNUIsYUFBYSxLQUFLLGFBQWE7QUFBQTtBQUFBLE1BQy9CLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxJQUN6RCxDQUFDO0FBU00sSUFBTSx3QkFBd0IsV0FBVywyQkFBMkI7QUFBQSxNQUN6RSxJQUFJLElBQUksSUFBSSxFQUFFLFdBQVcsRUFBRSxjQUFjO0FBQUEsTUFDekMsU0FBUyxJQUFJLFNBQVMsRUFBRSxRQUFRLEVBQUUsT0FBTztBQUFBO0FBQUEsTUFDekMsY0FBYyxJQUFJLGNBQWMsRUFBRSxRQUFRLENBQUMsRUFBRSxRQUFRO0FBQUE7QUFBQSxNQUNyRCxhQUFhLElBQUksYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVE7QUFBQTtBQUFBO0FBQUEsTUFFbkQsb0JBQW9CLElBQUksb0JBQW9CLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ2pFLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUN2RCxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFRTSxJQUFNLG9CQUFvQixXQUFXLHNCQUFzQjtBQUFBLE1BQ2hFLElBQUksSUFBSSxJQUFJLEVBQUUsV0FBVyxFQUFFLGNBQWM7QUFBQSxNQUN6QyxTQUFTLElBQUksU0FBUyxFQUFFLFFBQVE7QUFBQTtBQUFBLE1BQ2hDLFVBQVUsSUFBSSxVQUFVO0FBQUE7QUFBQSxNQUN4QixPQUFPLFFBQVEsU0FBUyxFQUFFLFFBQVEsSUFBSSxDQUFDLEVBQUUsUUFBUTtBQUFBO0FBQUEsTUFDakQsTUFBTSxRQUFRLFFBQVEsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBO0FBQUEsTUFDckMsTUFBTSxVQUFVLFFBQVEsQ0FBQyxTQUFTLFFBQVEsQ0FBQyxFQUFFLFFBQVEsUUFBUSxFQUFFLFFBQVE7QUFBQSxNQUN2RSxRQUFRLFVBQVUsVUFBVSxDQUFDLFdBQVcsVUFBVSxTQUFTLENBQUMsRUFBRSxRQUFRLFNBQVMsRUFBRSxRQUFRO0FBQUEsTUFDekYsYUFBYSxRQUFRLGVBQWUsRUFBRSxRQUFRLElBQUksQ0FBQyxFQUFFLE9BQU87QUFBQSxNQUM1RCxpQkFBaUIsSUFBSSxpQkFBaUI7QUFBQTtBQUFBLE1BQ3RDLFVBQVUsVUFBVSxVQUFVO0FBQUEsTUFDOUIsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUFBLE1BQ3ZELFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxRQUFRO0FBQUEsSUFDdkUsQ0FBQztBQU9NLElBQU0saUJBQWlCLFdBQVcsb0JBQW9CO0FBQUEsTUFDM0QsSUFBSSxRQUFRLE1BQU0sRUFBRSxRQUFRLEdBQUcsQ0FBQyxFQUFFLFdBQVc7QUFBQTtBQUFBLE1BQzdDLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQzlCLFlBQVksUUFBUSxjQUFjLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDMUQsVUFBVSxJQUFJLFVBQVU7QUFBQSxNQUN4QixRQUFRLElBQUksUUFBUTtBQUFBLE1BQ3BCLFNBQVMsSUFBSSxTQUFTO0FBQUEsTUFDdEIsWUFBWSxRQUFRLGNBQWMsRUFBRSxRQUFRLEdBQUcsQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUMxRCxVQUFVLFVBQVUsWUFBWSxDQUFDLFVBQVUsU0FBUyxRQUFRLGNBQWMsVUFBVSxVQUFVLE9BQU8sQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUNoSCxPQUFPLFFBQVEsU0FBUyxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ2hELGNBQWMsSUFBSSxjQUFjLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ3JELGtCQUFrQixJQUFJLGtCQUFrQixFQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUM3RCxhQUFhLElBQUksYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUNuRCxZQUFZLFFBQVEsY0FBYyxFQUFFLFdBQVcsSUFBSSxPQUFPLEVBQUUsQ0FBQyxFQUFFLFFBQVEsR0FBRyxFQUFFLFFBQVE7QUFBQSxNQUNwRixjQUFjLFFBQVEsZ0JBQWdCLEVBQUUsV0FBVyxHQUFHLE9BQU8sRUFBRSxDQUFDLEVBQUUsUUFBUSxLQUFLLEVBQUUsUUFBUTtBQUFBLE1BQ3pGLGdCQUFnQixJQUFJLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUN6RCxXQUFXLElBQUksV0FBVztBQUFBLE1BQzFCLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxJQUN6RCxDQUFDO0FBT00sSUFBTSxjQUFjLFdBQVcsaUJBQWlCO0FBQUEsTUFDckQsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQzlCLFFBQVEsUUFBUSxVQUFVLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxRQUFRLEVBQUUsT0FBTztBQUFBO0FBQUEsTUFDM0QsT0FBTyxRQUFRLFNBQVMsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQ3ZDLFVBQVUsUUFBUSxVQUFVLEVBQUUsUUFBUSxJQUFJLEVBQUUsUUFBUTtBQUFBLE1BQ3BELFVBQVUsVUFBVSxVQUFVO0FBQUEsTUFDOUIsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUFBLElBQ3pELENBQUM7QUFPTSxJQUFNLGdCQUFnQixXQUFXLGtCQUFrQjtBQUFBLE1BQ3hELElBQUksSUFBSSxJQUFJLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFBQSxNQUN6QyxVQUFVLElBQUksVUFBVSxFQUFFLFFBQVE7QUFBQSxNQUNsQyxVQUFVLFFBQVEsWUFBWSxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsUUFBUTtBQUFBO0FBQUEsTUFDdEQsaUJBQWlCLFFBQVEsbUJBQW1CLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxRQUFRO0FBQUE7QUFBQSxNQUNwRSxXQUFXLFFBQVEsV0FBVyxFQUFFLFFBQVEsS0FBSyxFQUFFLFFBQVE7QUFBQSxNQUN2RCxpQkFBaUIsS0FBSyxpQkFBaUIsRUFBRSxNQUFnQjtBQUFBO0FBQUEsTUFDekQsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUFBLElBQ3pELENBQUM7QUFLTSxJQUFNLDhCQUE4QixXQUFXLGlDQUFpQztBQUFBLE1BQ3JGLElBQUksSUFBSSxJQUFJLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFBQSxNQUN6QyxTQUFTLElBQUksU0FBUyxFQUFFLFFBQVE7QUFBQSxNQUNoQyxVQUFVLElBQUksVUFBVSxFQUFFLFFBQVE7QUFBQSxNQUNsQyxrQkFBa0IsSUFBSSxrQkFBa0IsRUFBRSxRQUFRLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDN0QsYUFBYSxJQUFJLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDbkQsY0FBYyxJQUFJLGNBQWMsRUFBRSxRQUFRLENBQUMsRUFBRSxRQUFRO0FBQUE7QUFBQSxNQUNyRCxZQUFZLFVBQVUsWUFBWTtBQUFBLE1BQ2xDLFVBQVUsVUFBVSxVQUFVO0FBQUEsTUFDOUIsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUFBLE1BQ3ZELFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxRQUFRO0FBQUEsSUFDdkUsQ0FBQztBQUtNLElBQU0sc0JBQXNCLFdBQVcseUJBQXlCO0FBQUEsTUFDckUsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFNBQVMsSUFBSSxTQUFTLEVBQUUsUUFBUTtBQUFBLE1BQ2hDLFVBQVUsSUFBSSxVQUFVO0FBQUEsTUFDeEIsTUFBTSxVQUFVLFFBQVEsQ0FBQyxTQUFTLFVBQVUsUUFBUSxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQy9ELFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUTtBQUFBO0FBQUEsTUFDOUIsTUFBTSxLQUFLLE1BQU07QUFBQSxNQUNqQixXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsSUFDekQsQ0FBQztBQUtNLElBQU0sZ0JBQWdCLFdBQVcsaUJBQWlCO0FBQUEsTUFDdkQsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQzlCLE1BQU0sUUFBUSxRQUFRLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDOUMsT0FBTyxRQUFRLFNBQVMsRUFBRSxRQUFRLElBQUksQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUNqRCxNQUFNLEtBQUssTUFBTTtBQUFBLE1BQ2pCLFFBQVEsSUFBSSxRQUFRO0FBQUEsTUFDcEIsU0FBUyxJQUFJLFNBQVM7QUFBQSxNQUN0QixRQUFRLFFBQVEsUUFBUSxFQUFFLFFBQVEsS0FBSyxFQUFFLFFBQVE7QUFBQSxNQUNqRCxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsSUFDekQsQ0FBQztBQUtNLElBQU0sMEJBQTBCLFdBQVcsNEJBQTRCO0FBQUEsTUFDNUUsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU87QUFBQSxNQUN2QyxjQUFjLFFBQVEsY0FBYyxFQUFFLFFBQVEsSUFBSSxFQUFFLFFBQVE7QUFBQSxNQUM1RCxjQUFjLFFBQVEsY0FBYyxFQUFFLFFBQVEsS0FBSyxFQUFFLFFBQVE7QUFBQSxNQUM3RCxhQUFhLFFBQVEsYUFBYSxFQUFFLFFBQVEsS0FBSyxFQUFFLFFBQVE7QUFBQSxNQUMzRCxXQUFXLFFBQVEsYUFBYSxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDL0MsaUJBQWlCLFFBQVEsaUJBQWlCLEVBQUUsUUFBUSxLQUFLLEVBQUUsUUFBUTtBQUFBLE1BQ25FLGtCQUFrQixRQUFRLG9CQUFvQixFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDN0QsZ0JBQWdCLFFBQVEsa0JBQWtCLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUN6RCxpQkFBaUIsUUFBUSxpQkFBaUIsRUFBRSxRQUFRLEtBQUssRUFBRSxRQUFRO0FBQUEsTUFDbkUsb0JBQW9CLFFBQVEsc0JBQXNCLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUNqRSx1QkFBdUIsUUFBUSx1QkFBdUIsRUFBRSxRQUFRLElBQUksRUFBRSxRQUFRO0FBQUEsTUFDOUUsb0JBQW9CLFFBQVEsb0JBQW9CLEVBQUUsUUFBUSxJQUFJLEVBQUUsUUFBUTtBQUFBLE1BQ3hFLHFCQUFxQixRQUFRLHFCQUFxQixFQUFFLFFBQVEsS0FBSyxFQUFFLFFBQVE7QUFBQSxNQUMzRSxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDdkQsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFFBQVE7QUFBQSxJQUN2RSxDQUFDO0FBS00sSUFBTSxlQUFlLFdBQVcsaUJBQWlCO0FBQUEsTUFDdEQsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQzlCLFNBQVMsSUFBSSxTQUFTO0FBQUEsTUFDdEIsV0FBVyxJQUFJLFdBQVc7QUFBQSxNQUMxQixtQkFBbUIsUUFBUSxxQkFBcUIsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQy9ELE1BQU0sUUFBUSxRQUFRLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDOUMsU0FBUyxLQUFLLFNBQVMsRUFBRSxRQUFRO0FBQUEsTUFDakMsUUFBUSxJQUFJLFFBQVE7QUFBQSxNQUNwQixXQUFXLElBQUksV0FBVztBQUFBLE1BQzFCLGNBQWMsSUFBSSxjQUFjO0FBQUEsTUFDaEMsWUFBWSxJQUFJLFlBQVksRUFBRSxRQUFRLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDakQsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUFBLElBQ3pELENBQUM7QUFLTSxJQUFNLGdCQUFnQixXQUFXLGtCQUFrQjtBQUFBLE1BQ3hELElBQUksSUFBSSxJQUFJLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFBQSxNQUN6QyxRQUFRLElBQUksUUFBUSxFQUFFLFFBQVE7QUFBQSxNQUM5QixXQUFXLFFBQVEsYUFBYSxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ3hELFNBQVMsSUFBSSxTQUFTO0FBQUEsTUFDdEIsWUFBWSxVQUFVLGNBQWMsQ0FBQyxjQUFjLGFBQWEsWUFBWSxTQUFTLE9BQU8sQ0FBQyxFQUFFLFFBQVEsT0FBTztBQUFBLE1BQzlHLFNBQVMsS0FBSyxTQUFTLEVBQUUsUUFBUTtBQUFBLE1BQ2pDLFVBQVUsUUFBUSxVQUFVLEVBQUUsUUFBUSxJQUFJLEVBQUUsUUFBUTtBQUFBLE1BQ3BELFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUN2RCxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFLTSxJQUFNLG9CQUFvQixXQUFXLHNCQUFzQjtBQUFBLE1BQ2hFLElBQUksSUFBSSxJQUFJLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFBQSxNQUN6QyxRQUFRLElBQUksUUFBUSxFQUFFLFFBQVE7QUFBQSxNQUM5QixTQUFTLElBQUksU0FBUztBQUFBLE1BQ3RCLGlCQUFpQixRQUFRLG1CQUFtQixFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsUUFBUTtBQUFBO0FBQUEsTUFDcEUsUUFBUSxVQUFVLFVBQVUsQ0FBQyxhQUFhLGdCQUFnQixPQUFPLENBQUMsRUFBRSxRQUFRLGNBQWM7QUFBQSxNQUMxRixhQUFhLEtBQUssYUFBYTtBQUFBO0FBQUEsTUFDL0Isb0JBQW9CLFFBQVEsc0JBQXNCLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUNqRSxxQkFBcUIsS0FBSyxxQkFBcUI7QUFBQSxNQUMvQyxhQUFhLFVBQVUsYUFBYTtBQUFBLE1BQ3BDLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUN2RCxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFNTSxJQUFNLFlBQVksV0FBVyxjQUFjO0FBQUEsTUFDaEQsSUFBYyxJQUFJLElBQUksRUFBRSxXQUFXLEVBQUUsY0FBYztBQUFBLE1BQ25ELFFBQWMsSUFBSSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQ3BDLFNBQWMsSUFBSSxTQUFTO0FBQUEsTUFDM0IsT0FBYyxRQUFRLFNBQVMsRUFBRSxRQUFRLElBQUksQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUN4RCxVQUFjLFVBQVUsWUFBWSxDQUFDLFdBQVcsYUFBYSxVQUFVLFVBQVUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxRQUFRLFNBQVM7QUFBQSxNQUMvRyxVQUFjLFVBQVUsWUFBWSxDQUFDLFNBQVMsU0FBUyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxPQUFPO0FBQUEsTUFDdkYsVUFBYyxJQUFJLFVBQVUsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFO0FBQUE7QUFBQSxNQUNsRCxPQUFjLFFBQVEsU0FBUyxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsY0FBYztBQUFBLE1BQy9FLFFBQWMsVUFBVSxVQUFVLENBQUMsV0FBVyxjQUFjLGFBQWEsUUFBUSxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsU0FBUztBQUFBLE1BQy9HLFVBQWMsSUFBSSxVQUFVLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQztBQUFBO0FBQUEsTUFDakQsUUFBYyxLQUFLLFFBQVE7QUFBQTtBQUFBLE1BQzNCLFVBQWMsS0FBSyxVQUFVO0FBQUE7QUFBQSxNQUM3QixjQUFjLEtBQUssY0FBYztBQUFBO0FBQUEsTUFDakMsY0FBYyxRQUFRLGdCQUFnQixFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUE7QUFBQSxNQUNyRCxjQUFjLEtBQUssY0FBYztBQUFBLE1BQ2pDLFdBQWMsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUMxRCxXQUFjLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsUUFBUTtBQUFBLElBQzFFLENBQUM7QUFRTSxJQUFNLFdBQVcsV0FBVyxZQUFZO0FBQUEsTUFDN0MsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQzlCLFNBQVMsSUFBSSxTQUFTO0FBQUEsTUFDdEIsV0FBVyxRQUFRLGFBQWEsRUFBRSxRQUFRLEdBQUcsQ0FBQyxFQUFFLFFBQVE7QUFBQTtBQUFBLE1BQ3hELE9BQU8sUUFBUSxTQUFTLEVBQUUsUUFBUSxJQUFJLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDakQsV0FBVyxLQUFLLFdBQVc7QUFBQSxNQUMzQixVQUFVLEtBQUssVUFBVTtBQUFBLE1BQ3pCLE9BQU8sS0FBSyxPQUFPO0FBQUEsTUFDbkIsZ0JBQWdCLEtBQUssZ0JBQWdCO0FBQUEsTUFDckMsYUFBYSxLQUFLLGFBQWE7QUFBQSxNQUMvQixhQUFhLEtBQUssYUFBYTtBQUFBO0FBQUEsTUFDL0IsYUFBYSxLQUFLLGFBQWE7QUFBQTtBQUFBLE1BQy9CLFdBQVcsUUFBUSxhQUFhLEVBQUUsUUFBUSxHQUFHLENBQUM7QUFBQTtBQUFBLE1BQzlDLGdCQUFnQixLQUFLLGdCQUFnQjtBQUFBO0FBQUEsTUFDckMsU0FBUyxRQUFRLFdBQVcsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBO0FBQUEsTUFDM0MsWUFBWSxRQUFRLGNBQWMsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBO0FBQUEsTUFDakQsZ0JBQWdCLEtBQUssZ0JBQWdCO0FBQUE7QUFBQSxNQUNyQyxRQUFRLFVBQVUsVUFBVSxDQUFDLFlBQVksVUFBVSxhQUFhLFVBQVUsQ0FBQyxFQUFFLFFBQVEsVUFBVSxFQUFFLFFBQVE7QUFBQSxNQUN6RyxhQUFhLFFBQVEsYUFBYSxFQUFFLFFBQVEsS0FBSyxFQUFFLFFBQVE7QUFBQSxNQUMzRCxtQkFBbUIsUUFBUSxxQkFBcUIsRUFBRSxRQUFRLEdBQUcsQ0FBQztBQUFBO0FBQUEsTUFDOUQsV0FBVyxJQUFJLFdBQVc7QUFBQSxNQUMxQixVQUFVLElBQUksVUFBVTtBQUFBLE1BQ3hCLGNBQWMsSUFBSSxjQUFjO0FBQUEsTUFDaEMsYUFBYSxJQUFJLGFBQWE7QUFBQSxNQUM5QixXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDdkQsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFFBQVE7QUFBQSxJQUN2RSxDQUFDO0FBS00sSUFBTSxtQkFBbUIsV0FBVyxzQkFBc0I7QUFBQSxNQUMvRCxJQUFJLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDekMsV0FBVyxJQUFJLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDcEMsU0FBUyxJQUFJLFNBQVM7QUFBQTtBQUFBLE1BQ3RCLE9BQU8sUUFBUSxTQUFTLEVBQUUsUUFBUSxJQUFJLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDakQsUUFBUSxVQUFVLFVBQVUsQ0FBQyxlQUFlLFdBQVcsZUFBZSxVQUFVLFVBQVUsQ0FBQyxFQUFFLFFBQVEsYUFBYSxFQUFFLFFBQVE7QUFBQSxNQUM1SCxXQUFXLElBQUksV0FBVyxFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQ3JDLFFBQVEsSUFBSSxRQUFRO0FBQUE7QUFBQSxNQUNwQixXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDdkQsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFFBQVE7QUFBQSxJQUN2RSxDQUFDO0FBS00sSUFBTSxrQkFBa0IsV0FBVyxvQkFBb0I7QUFBQSxNQUM1RCxJQUFXLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDaEQsV0FBVyxJQUFJLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDcEMsUUFBVyxJQUFJLFFBQVEsRUFBRSxRQUFRO0FBQUEsTUFDakMsTUFBVyxVQUFVLFFBQVEsQ0FBQyxRQUFRLGFBQWEsUUFBUSxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ3RFLFNBQVcsU0FBUyxTQUFTLEVBQUUsUUFBUTtBQUFBLE1BQ3ZDLFVBQVcsS0FBSyxVQUFVO0FBQUEsTUFDMUIsV0FBVyxTQUFTLFdBQVcsRUFBRSxRQUFRLEVBQUUsUUFBUSxzQkFBc0I7QUFBQSxJQUMzRSxDQUFDO0FBTU0sSUFBTSxtQkFBbUIsV0FBVyxxQkFBcUI7QUFBQSxNQUM5RCxJQUFJLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDekMsV0FBVyxJQUFJLFdBQVcsRUFBRSxRQUFRLEVBQUUsT0FBTztBQUFBLE1BQzdDLFFBQVEsUUFBUSxVQUFVLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxRQUFRLFNBQVM7QUFBQTtBQUFBLE1BQzNELFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDL0IsUUFBUSxJQUFJLFFBQVEsRUFBRSxRQUFRLENBQUM7QUFBQSxNQUMvQixXQUFXLElBQUksV0FBVyxFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQ3JDLFdBQVcsS0FBSyxXQUFXO0FBQUE7QUFBQSxNQUMzQixjQUFjLEtBQUssY0FBYztBQUFBO0FBQUEsTUFDakMsV0FBVyxLQUFLLFdBQVc7QUFBQTtBQUFBLE1BQzNCLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxJQUN6RCxDQUFDO0FBS00sSUFBTSxpQkFBaUIsV0FBVyxtQkFBbUI7QUFBQSxNQUMxRCxJQUFJLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDekMsUUFBUSxJQUFJLFFBQVEsRUFBRSxRQUFRO0FBQUEsTUFDOUIsT0FBTyxRQUFRLFNBQVMsRUFBRSxRQUFRLEdBQUcsQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUNoRCxPQUFPLFFBQVEsU0FBUyxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ2hELFdBQVcsSUFBSSxXQUFXLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDckMsV0FBVyxJQUFJLFdBQVc7QUFBQSxNQUMxQixTQUFTLElBQUksU0FBUztBQUFBLE1BQ3RCLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxJQUN6RCxDQUFDO0FBUU0sSUFBTSxlQUFlLFdBQVcsaUJBQWlCO0FBQUEsTUFDdEQsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLE1BQU0sUUFBUSxRQUFRLEVBQUUsUUFBUSxJQUFJLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDL0MsVUFBVSxRQUFRLFlBQVksRUFBRSxRQUFRLEdBQUcsQ0FBQztBQUFBLE1BQzVDLE1BQU0sVUFBVSxRQUFRLENBQUMsU0FBUyxXQUFXLE9BQU8sWUFBWSxDQUFDLEVBQUUsUUFBUSxPQUFPO0FBQUEsTUFDbEYsb0JBQW9CLFFBQVEsc0JBQXNCLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUNqRSxpQkFBaUIsUUFBUSxtQkFBbUIsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQzNELFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxJQUN6RCxDQUFDO0FBS00sSUFBTSxpQkFBaUIsV0FBVyxtQkFBbUI7QUFBQSxNQUMxRCxJQUFJLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDekMsV0FBVyxJQUFJLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDcEMsU0FBUyxJQUFJLFNBQVMsRUFBRSxRQUFRO0FBQUEsTUFDaEMsTUFBTSxRQUFRLFFBQVEsRUFBRSxRQUFRLEdBQUcsQ0FBQyxFQUFFLFFBQVE7QUFBQSxNQUM5QyxXQUFXLElBQUksV0FBVyxFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQ3JDLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxJQUN6RCxDQUFDO0FBS00sSUFBTSxtQkFBbUIsV0FBVyxzQkFBc0I7QUFBQSxNQUMvRCxJQUFJLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDekMsV0FBVyxJQUFJLFdBQVcsRUFBRSxRQUFRLEVBQUUsT0FBTztBQUFBLE1BQzdDLGVBQWUsUUFBUSxpQkFBaUIsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQ3ZELFlBQVksUUFBUSxjQUFjLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUNqRCxlQUFlLEtBQUssZUFBZTtBQUFBLE1BQ25DLGlCQUFpQixLQUFLLGlCQUFpQjtBQUFBLE1BQ3ZDLFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUN2RCxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFLTSxJQUFNLGNBQWMsV0FBVyxnQkFBZ0I7QUFBQSxNQUNwRCxJQUFJLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDekMsV0FBVyxJQUFJLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDcEMsU0FBUyxJQUFJLFNBQVM7QUFBQSxNQUN0QixPQUFPLFFBQVEsU0FBUyxFQUFFLFFBQVEsSUFBSSxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ2pELFNBQVMsSUFBSSxTQUFTLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDakMsVUFBVSxJQUFJLFVBQVUsRUFBRSxRQUFRLENBQUM7QUFBQSxNQUNuQyxZQUFZLFVBQVUsY0FBYyxDQUFDLGdCQUFlLFVBQVMsVUFBVSxDQUFDLEVBQUUsUUFBUSxRQUFRO0FBQUEsTUFDMUYsY0FBYyxVQUFVLGdCQUFnQixDQUFDLFFBQU8sT0FBTSxLQUFLLENBQUM7QUFBQSxNQUM1RCxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDdkQsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFFBQVE7QUFBQSxJQUN2RSxDQUFDO0FBSU0sSUFBTSxrQkFBa0IsV0FBVyxxQkFBcUI7QUFBQSxNQUM3RCxJQUFJLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDekMsT0FBTyxJQUFJLE9BQU8sRUFBRSxRQUFRO0FBQUEsTUFDNUIsV0FBVyxJQUFJLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDcEMsVUFBVSxVQUFVLFlBQVksQ0FBQyxjQUFhLFlBQVcsYUFBYSxDQUFDLEVBQUUsUUFBUSxZQUFZO0FBQUEsTUFDN0YsaUJBQWlCLFFBQVEsbUJBQW1CLEVBQUUsUUFBUSxHQUFHLENBQUM7QUFBQSxNQUMxRCxlQUFlLEtBQUssZUFBZTtBQUFBLE1BQ25DLFdBQVcsUUFBUSxhQUFhLEVBQUUsUUFBUSxHQUFHLENBQUM7QUFBQSxNQUM5QyxPQUFPLFFBQVEsU0FBUyxFQUFFLFFBQVEsSUFBSSxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ2pELGdCQUFnQixLQUFLLGdCQUFnQjtBQUFBLE1BQ3JDLGVBQWUsS0FBSyxlQUFlO0FBQUEsTUFDbkMsa0JBQWtCLFFBQVEsb0JBQW9CLEVBQUUsUUFBUSxHQUFHLENBQUM7QUFBQSxNQUM1RCxVQUFVLFVBQVUsWUFBWSxDQUFDLFVBQVMsVUFBUyxPQUFNLFNBQVMsQ0FBQyxFQUFFLFFBQVEsU0FBUztBQUFBLE1BQ3RGLE9BQU8sS0FBSyxPQUFPO0FBQUEsTUFDbkIsV0FBVyxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUFBLElBQ3pELENBQUM7QUFJTSxJQUFNLGlCQUFpQixXQUFXLG1CQUFtQjtBQUFBLE1BQzFELElBQUksSUFBSSxJQUFJLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFBQSxNQUN6QyxXQUFXLElBQUksV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUNwQyxnQkFBZ0IsSUFBSSxnQkFBZ0I7QUFBQSxNQUNwQyxXQUFXLElBQUksV0FBVztBQUFBLE1BQzFCLFVBQVUsVUFBVSxZQUFZLENBQUMsWUFBVyxhQUFZLFlBQVcsV0FBVSxjQUFhLFNBQVEsT0FBTSxPQUFNLFVBQVMsT0FBTyxDQUFDLEVBQUUsUUFBUSxPQUFPO0FBQUEsTUFDaEosWUFBWSxVQUFVLGNBQWMsQ0FBQyxRQUFPLFNBQVEsUUFBTyxXQUFVLGNBQWEsU0FBUSxVQUFTLGdCQUFlLFVBQVMsT0FBTyxDQUFDLEVBQUUsUUFBUSxPQUFPO0FBQUEsTUFDcEosT0FBTyxRQUFRLFNBQVMsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQ3ZDLFNBQVMsU0FBUyxTQUFTO0FBQUEsTUFDM0IsYUFBYSxTQUFTLGFBQWE7QUFBQSxNQUNuQyxVQUFVLEtBQUssVUFBVTtBQUFBLE1BQ3pCLFFBQVEsVUFBVSxVQUFVLENBQUMsU0FBUSxrQkFBaUIsWUFBVyxhQUFZLGFBQVksVUFBVSxDQUFDLEVBQUUsUUFBUSxPQUFPO0FBQUEsTUFDckgsU0FBUyxJQUFJLFNBQVMsRUFBRSxRQUFRLENBQUM7QUFBQSxNQUNqQyxnQkFBZ0IsSUFBSSxnQkFBZ0I7QUFBQSxNQUNwQyxhQUFhLFVBQVUsYUFBYTtBQUFBLE1BQ3BDLGFBQWEsVUFBVSxhQUFhO0FBQUEsTUFDcEMsVUFBVSxJQUFJLFVBQVUsRUFBRSxRQUFRLENBQUM7QUFBQSxNQUNuQyxZQUFZLFVBQVUsWUFBWTtBQUFBLE1BQ2xDLGNBQWMsUUFBUSxnQkFBZ0IsRUFBRSxRQUFRLEdBQUcsQ0FBQztBQUFBLE1BQ3BELFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUN2RCxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFJTSxJQUFNLHdCQUF3QixXQUFXLDJCQUEyQjtBQUFBLE1BQ3pFLElBQUksSUFBSSxJQUFJLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFBQSxNQUN6QyxXQUFXLElBQUksV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUNwQyxTQUFTLElBQUksU0FBUztBQUFBLE1BQ3RCLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUTtBQUFBLE1BQzlCLFVBQVUsUUFBUSxZQUFZLEVBQUUsUUFBUSxJQUFJLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDdkQsY0FBYyxRQUFRLGdCQUFnQixFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDckQsVUFBVSxVQUFVLFlBQVksQ0FBQyxPQUFNLFFBQU8sUUFBTyxPQUFNLE9BQU0sT0FBTSxPQUFPLENBQUMsRUFBRSxRQUFRLE9BQU87QUFBQSxNQUNoRyxTQUFTLEtBQUssU0FBUztBQUFBLE1BQ3ZCLFVBQVUsSUFBSSxVQUFVO0FBQUEsTUFDeEIsWUFBWSxJQUFJLFlBQVksRUFBRSxRQUFRLENBQUM7QUFBQSxNQUN2QyxZQUFZLFVBQVUsWUFBWTtBQUFBLE1BQ2xDLGlCQUFpQixVQUFVLG1CQUFtQixDQUFDLFdBQVUsY0FBYSxhQUFZLFFBQVEsQ0FBQyxFQUFFLFFBQVEsU0FBUztBQUFBLE1BQzlHLFlBQVksSUFBSSxZQUFZLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDdkMsWUFBWSxJQUFJLFlBQVksRUFBRSxRQUFRLENBQUM7QUFBQSxNQUN2QyxjQUFjLElBQUksY0FBYyxFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQzNDLGFBQWEsSUFBSSxhQUFhLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDekMsY0FBYyxLQUFLLGNBQWMsRUFBRSxNQUFnQjtBQUFBLE1BQ25ELFdBQVcsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxJQUN6RCxDQUFDO0FBSU0sSUFBTSx5QkFBeUIsV0FBVyw0QkFBNEI7QUFBQSxNQUMzRSxJQUFJLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDekMsUUFBUSxJQUFJLFFBQVEsRUFBRSxRQUFRO0FBQUEsTUFDOUIsV0FBVyxJQUFJLFdBQVcsRUFBRSxRQUFRO0FBQUEsTUFDcEMsWUFBWSxJQUFJLFlBQVksRUFBRSxRQUFRO0FBQUEsTUFDdEMsU0FBUyxLQUFLLFNBQVMsRUFBRSxRQUFRO0FBQUEsTUFDakMsV0FBVyxLQUFLLFdBQVc7QUFBQSxNQUMzQixXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsSUFDekQsQ0FBQztBQUlNLElBQU0scUJBQXFCLFdBQVcsd0JBQXdCO0FBQUEsTUFDbkUsSUFBSSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3pDLFdBQVcsSUFBSSxXQUFXLEVBQUUsUUFBUTtBQUFBLE1BQ3BDLFVBQVUsSUFBSSxVQUFVLEVBQUUsUUFBUTtBQUFBLE1BQ2xDLGFBQWEsSUFBSSxhQUFhLEVBQUUsUUFBUTtBQUFBLE1BQ3hDLFlBQVksVUFBVSxjQUFjLENBQUMsWUFBVyxZQUFXLFNBQVEsUUFBUSxDQUFDLEVBQUUsUUFBUSxVQUFVO0FBQUEsTUFDaEcsUUFBUSxVQUFVLFVBQVUsQ0FBQyxXQUFVLGFBQVksWUFBVyxzQkFBcUIsU0FBUyxDQUFDLEVBQUUsUUFBUSxTQUFTO0FBQUEsTUFDaEgsYUFBYSxLQUFLLGFBQWEsRUFBRSxNQUFnQjtBQUFBLE1BQ2pELGVBQWUsUUFBUSxpQkFBaUIsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQ3ZELGtCQUFrQixVQUFVLGtCQUFrQjtBQUFBLE1BQzlDLFVBQVUsSUFBSSxVQUFVLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDbkMsWUFBWSxVQUFVLFlBQVk7QUFBQSxNQUNsQyxXQUFXLElBQUksV0FBVyxFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQ3JDLGNBQWMsS0FBSyxjQUFjO0FBQUEsTUFDakMsWUFBWSxVQUFVLFlBQVk7QUFBQSxNQUNsQyxXQUFXLFVBQVUsV0FBVyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsSUFDekQsQ0FBQztBQUtNLElBQU0sbUJBQW1CLFdBQVcsc0JBQXNCO0FBQUEsTUFDL0QsSUFBZSxJQUFJLElBQUksRUFBRSxjQUFjLEVBQUUsV0FBVztBQUFBLE1BQ3BELFdBQWUsUUFBUSxhQUFhLEVBQUUsUUFBUSxJQUFJLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDN0QsUUFBZSxJQUFJLFFBQVE7QUFBQSxNQUMzQixXQUFlLFFBQVEsYUFBYSxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDbkQsV0FBZSxRQUFRLGFBQWEsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQ25ELFdBQWUsVUFBVSxhQUFhLENBQUMsaUJBQWdCLGdCQUFlLG9CQUFtQixpQkFBZ0IsVUFBUyxhQUFhLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDMUksYUFBZSxJQUFJLGFBQWEsRUFBRSxRQUFRLENBQUM7QUFBQSxNQUMzQyxXQUFlLElBQUksV0FBVztBQUFBLE1BQzlCLGVBQWUsSUFBSSxlQUFlO0FBQUEsTUFDbEMsZUFBZSxJQUFJLGVBQWU7QUFBQSxNQUNsQyxVQUFlLEtBQUssVUFBVTtBQUFBLE1BQzlCLFVBQWUsS0FBSyxVQUFVO0FBQUEsTUFDOUIsV0FBZSxVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUFBLElBQzdELENBQUM7QUFLTSxJQUFNLFlBQVksV0FBVyxhQUFhO0FBQUEsTUFDL0MsSUFBa0IsSUFBSSxJQUFJLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFBQSxNQUN2RCxXQUFrQixJQUFJLFdBQVc7QUFBQSxNQUNqQyxXQUFrQixRQUFRLGFBQWEsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQ3RELE1BQWtCLFVBQVUsUUFBUSxDQUFDLGtCQUFpQixtQkFBa0Isb0JBQW1CLGVBQWMsdUJBQXNCLG9CQUFtQixlQUFjLE9BQU8sQ0FBQyxFQUFFLFFBQVEsT0FBTztBQUFBLE1BQ3pMLE9BQWtCLFFBQVEsU0FBUyxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDbEQsU0FBa0IsU0FBUyxTQUFTO0FBQUEsTUFDcEMsU0FBa0IsSUFBSSxTQUFTLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDMUMsUUFBa0IsVUFBVSxVQUFVLENBQUMsU0FBUSxrQkFBaUIsWUFBVyxrQkFBaUIsVUFBVSxDQUFDLEVBQUUsUUFBUSxPQUFPO0FBQUEsTUFDeEgsa0JBQWtCLElBQUksa0JBQWtCO0FBQUEsTUFDeEMsaUJBQWtCLElBQUksaUJBQWlCO0FBQUEsTUFDdkMsV0FBa0IsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxNQUM5RCxXQUFrQixVQUFVLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFFBQVE7QUFBQSxJQUM5RSxDQUFDO0FBS00sSUFBTSxrQkFBa0IsV0FBVyxvQkFBb0I7QUFBQSxNQUM1RCxJQUFjLElBQUksSUFBSSxFQUFFLGNBQWMsRUFBRSxXQUFXO0FBQUEsTUFDbkQsWUFBYyxJQUFJLFlBQVksRUFBRSxRQUFRO0FBQUEsTUFDeEMsUUFBYyxVQUFVLFVBQVUsQ0FBQyxTQUFRLFdBQVUsWUFBVyxrQkFBaUIsVUFBVSxDQUFDLEVBQUUsUUFBUSxPQUFPO0FBQUEsTUFDN0csY0FBYyxLQUFLLGNBQWM7QUFBQSxNQUNqQyxZQUFjLElBQUksWUFBWTtBQUFBLE1BQzlCLFdBQWMsVUFBVSxXQUFXLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFBQSxJQUM1RCxDQUFDO0FBQUE7QUFBQTs7O0FDdjFCRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFXQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBNkI7QUFDdEMsU0FBUyxPQUFBQSxZQUFXO0FBUXBCLGVBQXNCLFFBQXFCO0FBQ3pDLE1BQUksR0FBSSxRQUFPO0FBRWYsU0FBTyxXQUFXO0FBQUEsSUFDaEIsTUFBVSxRQUFRLElBQUksaUJBQXFCO0FBQUEsSUFDM0MsTUFBVSxPQUFPLFFBQVEsSUFBSSxhQUFhLEtBQUs7QUFBQSxJQUMvQyxNQUFVLFFBQVEsSUFBSSxpQkFBcUI7QUFBQSxJQUMzQyxVQUFVLFFBQVEsSUFBSSxxQkFBcUI7QUFBQSxJQUMzQyxVQUFVLFFBQVEsSUFBSSxpQkFBcUI7QUFBQTtBQUFBO0FBQUEsSUFHM0MsS0FBVSxRQUFRLElBQUksV0FBVyxTQUFTLENBQUMsSUFBSTtBQUFBLElBQy9DLGlCQUFzQjtBQUFBLElBQ3RCLG9CQUFzQjtBQUFBLElBQ3RCLFlBQXNCO0FBQUEsSUFDdEIsZ0JBQXNCO0FBQUEsSUFDdEIsYUFBc0I7QUFBQSxJQUN0QixpQkFBc0I7QUFBQSxJQUN0Qix1QkFBdUI7QUFBQSxFQUN6QixDQUFDO0FBRUQsT0FBSyxRQUFRLE1BQU0sRUFBRSx3QkFBUSxNQUFNLFVBQVUsQ0FBQztBQUM5QyxTQUFPO0FBQ1Q7QUFHQSxlQUFzQixTQUEyQjtBQUMvQyxNQUFJO0FBQ0YsVUFBTSxXQUFXLE1BQU0sTUFBTTtBQUM3QixVQUFNLFNBQVMsUUFBUUEsY0FBYTtBQUNwQyxXQUFPO0FBQUEsRUFDVCxRQUFRO0FBQ04sV0FBTztBQUFBLEVBQ1Q7QUFDRjtBQUlBLGVBQXNCLGNBQTJCO0FBQy9DLFNBQU8sTUFBTTtBQUNmO0FBRUEsZUFBc0IsZUFBaUM7QUFDckQsU0FBTyxPQUFPO0FBQ2hCO0FBRU8sU0FBUyxVQUF1QjtBQUFFLFNBQU87QUFBTTtBQUd0RCxlQUFzQixVQUF5QjtBQUM3QyxNQUFJLEtBQU0sT0FBTSxLQUFLLElBQUk7QUFDekIsT0FBSztBQUNMLFNBQU87QUFDVDtBQTFFQSxJQWtCSSxJQUNBO0FBbkJKO0FBQUE7QUFBQTtBQWNBO0FBSUEsSUFBSSxLQUFnQjtBQUNwQixJQUFJLE9BQW9CO0FBQUE7QUFBQTs7O0FDR3hCO0FBREEsU0FBUyxPQUFBQyxZQUFXOzs7QUNDcEIsU0FBUyxPQUFBQyxZQUFXO0FBQ3BCLFNBQVMsa0JBQWtCO0FBRTNCLElBQU0sWUFBWSxDQUFDLENBQUMsUUFBUSxJQUFJO0FBNkNoQyxJQUFNLFVBQU4sTUFBa0U7QUFBQSxFQUNoRSxZQUFvQixXQUFtQjtBQUFuQjtBQUFBLEVBQW9CO0FBQUEsRUFBcEI7QUFBQSxFQUVwQixNQUFNLElBQUksTUFBYyxNQUFhLE1BQXdEO0FBQzNGLFVBQU0sRUFBRSxPQUFBQyxPQUFNLElBQUksTUFBTTtBQUN4QixVQUFNQyxNQUFLLE1BQU1ELE9BQU07QUFDdkIsVUFBTSxLQUFLLE1BQU0sU0FBUyxXQUFXO0FBRXJDLFVBQU1DLElBQUcsUUFBUUY7QUFBQTtBQUFBLGdCQUVMLEVBQUUsS0FBSyxLQUFLLFNBQVMsS0FBSyxJQUFJLEtBQUssS0FBSyxVQUFVLElBQUksQ0FBQztBQUFBO0FBQUEsS0FFbEU7QUFNRCxTQUFLLEtBQUssY0FBYyxFQUFFO0FBRTFCLFdBQU8sS0FBSyxPQUFPLElBQUksV0FBVyxHQUFHLE1BQU0sSUFBSTtBQUFBLEVBQ2pEO0FBQUEsRUFFQSxNQUFjLGNBQWMsT0FBOEI7QUFHeEQsUUFBSSxLQUFLLGNBQWMsaUJBQWtCO0FBRXpDLFVBQU0sVUFDSixRQUFRLElBQUksWUFDWCxRQUFRLElBQUksYUFBYSxXQUFXLFFBQVEsSUFBSSxVQUFVLEtBQUs7QUFDbEUsUUFBSSxDQUFDLFFBQVM7QUFFZCxVQUFNLE9BQU8sTUFBTSxHQUFHLE9BQU8sNEJBQTRCO0FBQUEsTUFDdkQsUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLFFBQ1AsZ0JBQWdCO0FBQUEsUUFDaEIsZUFBZSxVQUFVLFFBQVEsSUFBSSxlQUFlLEVBQUU7QUFBQSxNQUN4RDtBQUFBLE1BQ0EsTUFBTSxLQUFLLFVBQVUsRUFBRSxNQUFNLENBQUM7QUFBQSxJQUNoQyxDQUFDLEVBQUUsTUFBTSxNQUFNO0FBQUEsSUFFZixDQUFDO0FBRUQsUUFBSTtBQUNGLFlBQU0sRUFBRSxVQUFVLElBQUksTUFBTSxPQUFPLG1CQUFtQjtBQUN0RCxnQkFBVSxJQUFJO0FBQUEsSUFDaEIsUUFBUTtBQUFBLElBSVI7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLE9BQU8sSUFBZ0Q7QUFDM0QsVUFBTSxFQUFFLE9BQUFDLE9BQU0sSUFBSSxNQUFNO0FBQ3hCLFVBQU1DLE1BQUssTUFBTUQsT0FBTTtBQUN2QixVQUFNLENBQUMsSUFBSSxJQUFLLE1BQU1DLElBQUcsUUFBUUY7QUFBQTtBQUFBO0FBQUEsbUJBR2xCLEVBQUUsZ0JBQWdCLEtBQUssU0FBUztBQUFBO0FBQUEsS0FFOUM7QUFPRCxVQUFNLE1BQU0sS0FBSyxDQUFDO0FBQ2xCLFFBQUksQ0FBQyxJQUFLLFFBQU87QUFDakIsV0FBTyxLQUFLO0FBQUEsTUFDVixJQUFJO0FBQUEsTUFDSixJQUFJO0FBQUEsTUFDSixJQUFJLFlBQVk7QUFBQSxNQUNoQixJQUFJLFNBQVUsS0FBSyxNQUFNLElBQUksTUFBTSxJQUFnQjtBQUFBLE1BQ25ELElBQUk7QUFBQSxJQUNOO0FBQUEsRUFDRjtBQUFBLEVBRVEsT0FDTixJQUNBLE9BQ0EsVUFDQSxhQUNBLGNBQ29CO0FBQ3BCLFdBQU87QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxVQUFVLFlBQVk7QUFBQSxJQUN4QjtBQUFBLEVBQ0Y7QUFDRjtBQXdCQSxJQUFJLG9CQUE2QjtBQUNqQyxJQUFNLGdCQUE0QyxvQkFBSSxJQUFJO0FBRTFELGVBQWUsc0JBQXdDO0FBQ3JELE1BQUksa0JBQW1CLFFBQU87QUFDOUIsUUFBTSxFQUFFLFNBQVMsUUFBUSxJQUFJLE1BQU0sT0FBTyxTQUFTO0FBQ25ELHNCQUFvQixJQUFJLFFBQVEsUUFBUSxJQUFJLGFBQWEsMEJBQTBCO0FBQUEsSUFDakYsc0JBQXNCO0FBQUEsRUFDeEIsQ0FBQztBQUNELFNBQU87QUFDVDtBQUVBLGVBQWUsZUFBZSxNQUFzQztBQUNsRSxRQUFNLFdBQVcsY0FBYyxJQUFJLElBQUk7QUFDdkMsTUFBSSxTQUFVLFFBQU87QUFDckIsUUFBTSxFQUFFLE1BQU0sSUFBSSxNQUFNLE9BQU8sUUFBUTtBQUN2QyxRQUFNLElBQUksSUFBSSxNQUFNLE1BQU0sRUFBRSxZQUFhLE1BQU0sb0JBQW9CLEVBQVksQ0FBQztBQUNoRixnQkFBYyxJQUFJLE1BQU0sQ0FBQztBQUN6QixTQUFPO0FBQ1Q7QUFFQSxJQUFNLGNBQU4sTUFBc0U7QUFBQSxFQUNwRSxZQUFvQixXQUFtQjtBQUFuQjtBQUFBLEVBQW9CO0FBQUEsRUFBcEI7QUFBQSxFQUVwQixNQUFNLElBQUksTUFBYyxNQUFhLE1BQTZDO0FBQ2hGLFVBQU0sSUFBSSxNQUFNLGVBQWUsS0FBSyxTQUFTO0FBQzdDLFVBQU0sTUFBTSxNQUFNLEVBQUUsSUFBSSxNQUFNLE1BQWUsSUFBSTtBQUNqRCxXQUFPLEtBQUssS0FBSyxHQUFHO0FBQUEsRUFDdEI7QUFBQSxFQUVBLE1BQU0sT0FBTyxJQUFnRDtBQUMzRCxVQUFNLElBQUksTUFBTSxlQUFlLEtBQUssU0FBUztBQUM3QyxVQUFNLE1BQU0sTUFBTSxFQUFFLE9BQU8sRUFBRTtBQUM3QixXQUFPLE1BQU0sS0FBSyxLQUFLLEdBQUcsSUFBSTtBQUFBLEVBQ2hDO0FBQUEsRUFFUSxLQUFLLEtBQW9FO0FBQy9FLFdBQU87QUFBQSxNQUNMLElBQUksSUFBSTtBQUFBLE1BQ1IsVUFBVSxJQUFJO0FBQUEsTUFDZCxhQUFjLElBQUksZUFBZTtBQUFBLE1BQ2pDLGNBQWMsSUFBSTtBQUFBLE1BQ2xCLFVBQVUsWUFBYSxNQUFNLElBQUksU0FBUztBQUFBLElBQzVDO0FBQUEsRUFDRjtBQUNGO0FBTUEsU0FBUyxVQUEwQixNQUF3QztBQUN6RSxTQUFPLFlBQ0gsSUFBSSxRQUF3QixJQUFJLElBQ2hDLElBQUksWUFBNEIsSUFBSTtBQUMxQztBQUVPLElBQU0saUJBQ1gsVUFBZ0QsZ0JBQWdCO0FBRTNELElBQU0sYUFBeUMsVUFBVSxZQUFZO0FBU3JFLElBQU0sYUFBc0IsSUFBSTtBQUFBLEVBQ3JDLENBQUM7QUFBQSxFQUNEO0FBQUEsSUFDRSxJQUFJLElBQUksTUFBTTtBQUNaLFVBQUksV0FBVztBQUNiLGNBQU0sSUFBSTtBQUFBLFVBQ1I7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUdBLFlBQU0sUUFBUSxZQUFZO0FBQ3hCLGNBQU0sSUFBSyxNQUFNLG9CQUFvQjtBQUNyQyxjQUFNLElBQUksRUFBRSxJQUFJO0FBQ2hCLGVBQU8sT0FBTyxNQUFNLGFBQWMsRUFBbUMsS0FBSyxDQUFDLElBQUk7QUFBQSxNQUNqRjtBQU9BLGFBQU87QUFBQSxJQUNUO0FBQUEsRUFDRjtBQUNGO0FBT0EsZUFBc0IsVUFDcEIsSUFDQSxPQU1lO0FBQ2YsTUFBSSxDQUFDLFVBQVc7QUFDaEIsUUFBTSxFQUFFLE9BQUFDLE9BQU0sSUFBSSxNQUFNO0FBQ3hCLFFBQU1DLE1BQUssTUFBTUQsT0FBTTtBQUl2QixRQUFNLE1BQWdDLENBQUM7QUFDdkMsTUFBSSxNQUFNLFdBQVcsT0FBVyxLQUFJLEtBQUtELGdCQUFlLE1BQU0sTUFBTSxFQUFFO0FBQ3RFLE1BQUksTUFBTSxhQUFhLE9BQVcsS0FBSSxLQUFLQSxrQkFBaUIsTUFBTSxRQUFRLEVBQUU7QUFDNUUsTUFBSSxNQUFNLFdBQVcsT0FBVyxLQUFJLEtBQUtBLGdCQUFlLEtBQUssVUFBVSxNQUFNLE1BQU0sQ0FBQyxFQUFFO0FBQ3RGLE1BQUksTUFBTSxpQkFBaUIsT0FBVyxLQUFJLEtBQUtBLHVCQUFzQixNQUFNLFlBQVksRUFBRTtBQUN6RixNQUFJLE1BQU0sV0FBVyxTQUFVLEtBQUksS0FBS0EsNkNBQTRDO0FBQ3BGLE1BQUksTUFBTSxXQUFXLGVBQWUsTUFBTSxXQUFXLFVBQVU7QUFDN0QsUUFBSSxLQUFLQSwyQkFBMEI7QUFBQSxFQUNyQztBQUNBLE1BQUksSUFBSSxXQUFXLEVBQUc7QUFHdEIsUUFBTSxZQUFZLElBQUk7QUFBQSxJQUNwQixDQUFDLEtBQUssTUFBTSxNQUFPLE1BQU0sSUFBSSxPQUFPQSxPQUFNLEdBQUcsS0FBSyxJQUFJO0FBQUEsSUFDdERBO0FBQUEsRUFDRjtBQUVBLFFBQU1FLElBQUcsUUFBUUYsOEJBQTZCLFNBQVMsZUFBZSxFQUFFLEVBQUU7QUFDNUU7OztBRDFTQSxlQUFlLFNBQVMsS0FBdUM7QUFDN0QsTUFBSSxPQUFPO0FBQ1gsbUJBQWlCLFNBQVMsSUFBSyxTQUFRO0FBQ3ZDLFNBQU87QUFDVDtBQUVBLGVBQU8sUUFBK0IsS0FBc0IsS0FBcUI7QUFDL0UsUUFBTSxPQUFPLENBQUMsUUFBZ0IsWUFBcUI7QUFDakQsUUFBSSxhQUFhO0FBQ2pCLFFBQUksVUFBVSxnQkFBZ0Isa0JBQWtCO0FBQ2hELFFBQUksSUFBSSxLQUFLLFVBQVUsT0FBTyxDQUFDO0FBQUEsRUFDakM7QUFFQSxNQUFJLElBQUksV0FBVyxPQUFRLFFBQU8sS0FBSyxLQUFLLEVBQUUsT0FBTyxxQkFBcUIsQ0FBQztBQUUzRSxRQUFNLFNBQVMsUUFBUSxJQUFJO0FBQzNCLE1BQUksVUFBVSxJQUFJLFFBQVEsa0JBQWtCLFVBQVUsTUFBTSxJQUFJO0FBQzlELFdBQU8sS0FBSyxLQUFLLEVBQUUsT0FBTyxlQUFlLENBQUM7QUFBQSxFQUM1QztBQUVBLE1BQUk7QUFDSixNQUFJO0FBQ0YsVUFBTSxNQUFNLE1BQU0sU0FBUyxHQUFHO0FBQzlCLFVBQU0sT0FBTyxNQUFNLEtBQUssTUFBTSxHQUFHLElBQUksQ0FBQztBQUN0QyxZQUFRLEtBQUs7QUFDYixRQUFJLENBQUMsU0FBUyxPQUFPLFVBQVUsVUFBVTtBQUN2QyxhQUFPLEtBQUssS0FBSyxFQUFFLE9BQU8sZ0JBQWdCLENBQUM7QUFBQSxJQUM3QztBQUFBLEVBQ0YsUUFBUTtBQUNOLFdBQU8sS0FBSyxLQUFLLEVBQUUsT0FBTyxXQUFXLENBQUM7QUFBQSxFQUN4QztBQUVBLFFBQU1HLE1BQUssTUFBTSxNQUFNO0FBSXZCLFFBQU0sQ0FBQyxLQUFLLElBQUssTUFBTUEsSUFBRyxRQUFRQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBS25CLEtBQUs7QUFBQSxHQUNuQjtBQUVELE1BQUksTUFBTSxpQkFBaUIsR0FBRztBQUU1QixXQUFPLEtBQUssS0FBSyxFQUFFLElBQUksTUFBTSxPQUFPLFNBQVMsY0FBYyxDQUFDO0FBQUEsRUFDOUQ7QUFFQSxNQUFJO0FBQ0YsVUFBTSxDQUFDLElBQUksSUFBSyxNQUFNRCxJQUFHLFFBQVFDO0FBQUEsaUVBQzRCLEtBQUs7QUFBQSxLQUNqRTtBQUNELFVBQU0sTUFBTSxLQUFLLENBQUM7QUFDbEIsUUFBSSxDQUFDLElBQUssT0FBTSxJQUFJLE1BQU0sNkJBQTZCO0FBRXZELFVBQU0sVUFBVSxLQUFLLE1BQU0sSUFBSSxJQUFJO0FBTW5DLFVBQU0sVUFBVSxPQUFPLEVBQUUsVUFBVSxHQUFHLENBQUM7QUFDdkMsVUFBTSxJQUFJLFFBQVEsQ0FBQyxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUM7QUFDM0MsVUFBTSxVQUFVLE9BQU8sRUFBRSxVQUFVLEdBQUcsQ0FBQztBQUN2QyxVQUFNLElBQUksUUFBUSxDQUFDLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQztBQUUzQyxVQUFNLFNBQVM7QUFBQSxNQUNiLFdBQVc7QUFBQSxNQUNYLFNBQVMsSUFBSTtBQUFBLE1BQ2IsT0FBTyxJQUFJO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDSixhQUFhLFFBQVE7QUFBQSxRQUNyQixPQUFPLFFBQVE7QUFBQSxRQUNmLFVBQVUsUUFBUTtBQUFBLE1BQ3BCO0FBQUEsTUFDQSxNQUFNO0FBQUEsTUFDTixjQUFhLG9CQUFJLEtBQUssR0FBRSxZQUFZO0FBQUEsSUFDdEM7QUFFQSxVQUFNLFVBQVUsT0FBTyxFQUFFLFFBQVEsYUFBYSxVQUFVLEtBQUssT0FBTyxDQUFDO0FBQ3JFLFdBQU8sS0FBSyxLQUFLLEVBQUUsSUFBSSxNQUFNLE9BQU8sT0FBTyxhQUFhLE9BQU8sQ0FBQztBQUFBLEVBQ2xFLFNBQVMsS0FBSztBQUNaLFVBQU0sTUFBTSxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRztBQUMzRCxVQUFNLFVBQVUsT0FBTyxFQUFFLFFBQVEsVUFBVSxjQUFjLElBQUksQ0FBQztBQUM5RCxZQUFRLE1BQU0sZ0JBQWdCLEtBQUssWUFBWSxHQUFHO0FBQ2xELFdBQU8sS0FBSyxLQUFLLEVBQUUsSUFBSSxPQUFPLE9BQU8sT0FBTyxJQUFJLENBQUM7QUFBQSxFQUNuRDtBQUNGOyIsCiAgIm5hbWVzIjogWyJzcWwiLCAic3FsIiwgInNxbCIsICJnZXREYiIsICJkYiIsICJkYiIsICJzcWwiXQp9Cg==
