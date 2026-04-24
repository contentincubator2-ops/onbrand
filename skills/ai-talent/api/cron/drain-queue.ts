var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// api/cron/drain-queue.ts
import { sql as sql3 } from "drizzle-orm";

// server/db.ts
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { sql as sql2 } from "drizzle-orm";

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
var users = mysqlTable("users", {
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
var agents = mysqlTable("agents", {
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
var brands = mysqlTable("brands", {
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
var tasks = mysqlTable("tasks", {
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
var taskExecutions = mysqlTable("task_executions", {
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
var taskWorkflows = mysqlTable("task_workflows", {
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
var agentLearnings = mysqlTable("agent_learnings", {
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
var subscriptions = mysqlTable("subscriptions", {
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
var userCredits = mysqlTable("user_credits", {
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
var creditsUsageLog = mysqlTable("credits_usage_log", {
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
var enterpriseCreditsPool = mysqlTable("enterprise_credits_pool", {
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
var enterpriseMembers = mysqlTable("enterprise_members", {
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
var tokenUsageLogs = mysqlTable("token_usage_logs", {
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
var userApiKeys = mysqlTable("user_api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  apiKey: varchar("apiKey", { length: 64 }).notNull().unique(),
  // 'sw-xxxxxxxxxxxxxxxx'
  label: varchar("label", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  lastUsed: timestamp("lastUsed"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var tenantMarkets = mysqlTable("tenant_markets", {
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
var enterpriseCreditsAllocation = mysqlTable("enterprise_credits_allocation", {
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
var enterpriseCreditsTx = mysqlTable("enterprise_credits_tx", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  memberId: int("memberId"),
  type: mysqlEnum("type", ["topup", "deduct", "adjust"]).notNull(),
  amount: int("amount").notNull(),
  // positive=add, negative=deduct
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var notifications = mysqlTable("notifications", {
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
var notificationPreferences = mysqlTable("notification_preferences", {
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
var chatMessages = mysqlTable("chat_messages", {
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
var agentMemories = mysqlTable("agent_memories", {
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
var brandIntegrations = mysqlTable("brand_integrations", {
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
var videoJobs = mysqlTable("video_jobs", {
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
var missions = mysqlTable("missions", {
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
var missionTaskUnits = mysqlTable("mission_task_units", {
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
var missionMessages = mysqlTable("mission_messages", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: longtext("content").notNull(),
  metadata: text("metadata"),
  createdAt: datetime("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});
var missionResources = mysqlTable("mission_resources", {
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
var userWorkspaces = mysqlTable("user_workspaces", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  wsKey: varchar("wsKey", { length: 64 }).notNull(),
  label: varchar("label", { length: 64 }).notNull(),
  sortOrder: int("sortOrder").default(0),
  companyId: int("companyId"),
  brandId: int("brandId"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var mosCompanies = mysqlTable("mos_companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  industry: varchar("industry", { length: 64 }),
  plan: mysqlEnum("plan", ["trial", "starter", "pro", "enterprise"]).default("trial"),
  agentWorkspacePath: varchar("agentWorkspacePath", { length: 255 }),
  agentSessionKey: varchar("agentSessionKey", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var mosDepartments = mysqlTable("mos_departments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  brandId: int("brandId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  headCount: int("headCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var mosCompanyAgents = mysqlTable("mos_company_agents", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().unique(),
  workspacePath: varchar("workspacePath", { length: 255 }),
  sessionKey: varchar("sessionKey", { length: 128 }),
  soulMdContent: text("soulMdContent"),
  memoryMdContent: text("memoryMdContent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var missionSops = mysqlTable("mission_sops", {
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
var missionSopSteps = mysqlTable("mission_sop_steps", {
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
var missionOutputs = mysqlTable("mission_outputs", {
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
var missionKnowledgeFiles = mysqlTable("mission_knowledge_files", {
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
var missionKnowledgeChunks = mysqlTable("mission_knowledge_chunks", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  missionId: int("missionId").notNull(),
  chunkIndex: int("chunkIndex").notNull(),
  content: text("content").notNull(),
  embedding: json("embedding"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var missionReviewQueue = mysqlTable("mission_review_queue", {
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
var sessionEventLogs = mysqlTable("session_event_logs", {
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
var artifacts = mysqlTable("artifacts", {
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
var artifactReviews = mysqlTable("artifact_reviews", {
  id: int("id").autoincrement().primaryKey(),
  artifactId: int("artifactId").notNull(),
  status: mysqlEnum("status", ["draft", "pending", "approved", "needs_revision", "exported"]).default("draft"),
  reviewerNote: text("reviewerNote"),
  reviewedBy: int("reviewedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/db.ts
var db = null;
var pool = null;
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

// api/cron/drain-queue.ts
async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const baseUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!baseUrl) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "missing APP_URL / VERCEL_URL" }));
    return;
  }
  const db2 = await getDb();
  const [rows] = await db2.execute(sql3`
    SELECT id
    FROM queued_jobs
    WHERE status = 'waiting' AND created_at < NOW(3) - INTERVAL 30 SECOND
    ORDER BY created_at ASC
    LIMIT 10
  `);
  const dispatched = await Promise.allSettled(
    rows.map(
      (r) => fetch(`${baseUrl}/api/worker/execute-task`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret ?? ""}`
        },
        body: JSON.stringify({ jobId: r.id })
      })
    )
  );
  const ok = dispatched.filter((r) => r.status === "fulfilled").length;
  const failed = dispatched.length - ok;
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      scanned: rows.length,
      dispatched: ok,
      failed,
      ts: (/* @__PURE__ */ new Date()).toISOString()
    })
  );
}
export {
  handler as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vY3Jvbi9kcmFpbi1xdWV1ZS50cyIsICIuLi8uLi9zZXJ2ZXIvZGIudHMiLCAiLi4vLi4vZHJpenpsZS9zY2hlbWEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxuICogQ3JvbiBkcmFpbmVyIFx1MjAxNCBzYWZldHkgbmV0IGZvciBhbnkgcXVldWVkX2pvYnMgcm93IHN0aWxsIGB3YWl0aW5nYFxuICogYWZ0ZXIgMzBzLiBUaGUgZW5xdWV1ZSBwYXRoIChtYXJrZXRpbmdRdWV1ZS5hZGQpIGFscmVhZHkgZmlyZXMgYVxuICogZGlyZWN0IFBPU1QgdG8gL2FwaS93b3JrZXIvZXhlY3V0ZS10YXNrLCBidXQgdGhhdCBmZXRjaCBjYW4gYmUgbG9zdFxuICogdG8gY29sZC1zdGFydCB0aW1lb3V0cyBvciBuZXR3b3JrIGJsaXBzLiBUaGlzIHN3ZWVwIGNhdGNoZXMgdGhvc2UuXG4gKlxuICogSW52b2tlZCBldmVyeSBtaW51dGUgcGVyIHZlcmNlbC5qc29uIGBjcm9uc2AuIERpc3BhdGNoZXMgdXAgdG8gMTBcbiAqIGpvYnMgcGVyIHRpY2sgXHUyMDE0IGludGVudGlvbmFsbHkgc21hbGwgc28gd2UgZG9uJ3QgZmFuIG91dCB0b28gbWFueVxuICogY29uY3VycmVudCBmdW5jdGlvbiBpbnZvY2F0aW9ucy5cbiAqL1xuaW1wb3J0IHR5cGUgeyBJbmNvbWluZ01lc3NhZ2UsIFNlcnZlclJlc3BvbnNlIH0gZnJvbSBcIm5vZGU6aHR0cFwiO1xuaW1wb3J0IHsgc3FsIH0gZnJvbSBcImRyaXp6bGUtb3JtXCI7XG5pbXBvcnQgeyBnZXREYiB9IGZyb20gXCIuLi8uLi9zZXJ2ZXIvZGJcIjtcblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihyZXE6IEluY29taW5nTWVzc2FnZSwgcmVzOiBTZXJ2ZXJSZXNwb25zZSkge1xuICBjb25zdCBzZWNyZXQgPSBwcm9jZXNzLmVudi5DUk9OX1NFQ1JFVDtcbiAgaWYgKHNlY3JldCAmJiByZXEuaGVhZGVycy5hdXRob3JpemF0aW9uICE9PSBgQmVhcmVyICR7c2VjcmV0fWApIHtcbiAgICByZXMuc3RhdHVzQ29kZSA9IDQwMTtcbiAgICByZXMuc2V0SGVhZGVyKFwiY29udGVudC10eXBlXCIsIFwiYXBwbGljYXRpb24vanNvblwiKTtcbiAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IFwidW5hdXRob3JpemVkXCIgfSkpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGJhc2VVcmwgPVxuICAgIHByb2Nlc3MuZW52LkFQUF9VUkwgfHxcbiAgICAocHJvY2Vzcy5lbnYuVkVSQ0VMX1VSTCA/IGBodHRwczovLyR7cHJvY2Vzcy5lbnYuVkVSQ0VMX1VSTH1gIDogbnVsbCk7XG5cbiAgaWYgKCFiYXNlVXJsKSB7XG4gICAgcmVzLnN0YXR1c0NvZGUgPSA1MDA7XG4gICAgcmVzLnNldEhlYWRlcihcImNvbnRlbnQtdHlwZVwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG4gICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBcIm1pc3NpbmcgQVBQX1VSTCAvIFZFUkNFTF9VUkxcIiB9KSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgZGIgPSBhd2FpdCBnZXREYigpO1xuXG4gIC8vIE9ubHkgZ3JhYiBqb2JzIG9sZGVyIHRoYW4gMzBzIFx1MjAxNCBmYXN0LXBhdGggZGlzcGF0Y2ggZ2V0cyBmaXJzdCBzaG90LlxuICBjb25zdCBbcm93c10gPSAoYXdhaXQgZGIuZXhlY3V0ZShzcWxgXG4gICAgU0VMRUNUIGlkXG4gICAgRlJPTSBxdWV1ZWRfam9ic1xuICAgIFdIRVJFIHN0YXR1cyA9ICd3YWl0aW5nJyBBTkQgY3JlYXRlZF9hdCA8IE5PVygzKSAtIElOVEVSVkFMIDMwIFNFQ09ORFxuICAgIE9SREVSIEJZIGNyZWF0ZWRfYXQgQVNDXG4gICAgTElNSVQgMTBcbiAgYCkpIGFzIHVua25vd24gYXMgW0FycmF5PHsgaWQ6IHN0cmluZyB9PiwgdW5rbm93bl07XG5cbiAgY29uc3QgZGlzcGF0Y2hlZCA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChcbiAgICByb3dzLm1hcCgocikgPT5cbiAgICAgIGZldGNoKGAke2Jhc2VVcmx9L2FwaS93b3JrZXIvZXhlY3V0ZS10YXNrYCwge1xuICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgICAgYXV0aG9yaXphdGlvbjogYEJlYXJlciAke3NlY3JldCA/PyBcIlwifWAsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgam9iSWQ6IHIuaWQgfSksXG4gICAgICB9KSxcbiAgICApLFxuICApO1xuXG4gIGNvbnN0IG9rID0gZGlzcGF0Y2hlZC5maWx0ZXIoKHIpID0+IHIuc3RhdHVzID09PSBcImZ1bGZpbGxlZFwiKS5sZW5ndGg7XG4gIGNvbnN0IGZhaWxlZCA9IGRpc3BhdGNoZWQubGVuZ3RoIC0gb2s7XG5cbiAgcmVzLnN0YXR1c0NvZGUgPSAyMDA7XG4gIHJlcy5zZXRIZWFkZXIoXCJjb250ZW50LXR5cGVcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuICByZXMuZW5kKFxuICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIG9rOiB0cnVlLFxuICAgICAgc2Nhbm5lZDogcm93cy5sZW5ndGgsXG4gICAgICBkaXNwYXRjaGVkOiBvayxcbiAgICAgIGZhaWxlZCxcbiAgICAgIHRzOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgfSksXG4gICk7XG59XG4iLCAiLyoqXG4gKiBEYXRhYmFzZSBjb25uZWN0aW9uIFx1MjAxNCBEcml6emxlIE9STSBvdmVyIE15U1FMMlxuICpcbiAqIFx1MjcwNSBBbGwgZGF0YSBsaXZlcyBpbiBtb3NfZGIgKGxvY2FsaG9zdCBWTSkuXG4gKiAgICBnZXREYigpICAgICAgIFx1MjE5MiBtb3NfZGIgKHByaW1hcnksIHZpYSBMT0NBTF9EQl8qIGVudiBvciBoYXJkY29kZWQgbW9zIGRlZmF1bHRzKVxuICogICAgZ2V0U293b3JrRGIoKSBcdTIxOTIgYWxpYXMgb2YgZ2V0RGIoKSAoc293b3JrX2RiIGRlcGVuZGVuY3kgZnVsbHkgcmVtb3ZlZClcbiAqXG4gKiBMT0NBTF9EQl9IT1NUIC8gTE9DQUxfREJfVVNFUiAvIExPQ0FMX0RCX1BBU1NXT1JEIC8gTE9DQUxfREJfTkFNRVxuICogICBcdTIxOTIgZGVmYXVsdCB0byBsb2NhbGhvc3QgLyBtb3NfdXNlciAvIG1vc19zZWN1cmVfMjAyNiAvIG1vc19kYlxuICovXG5cbmltcG9ydCB7IGRyaXp6bGUgfSBmcm9tIFwiZHJpenpsZS1vcm0vbXlzcWwyXCI7XG5pbXBvcnQgeyBjcmVhdGVQb29sLCB0eXBlIFBvb2wgfSBmcm9tIFwibXlzcWwyL3Byb21pc2VcIjtcbmltcG9ydCB7IHNxbCB9IGZyb20gXCJkcml6emxlLW9ybVwiO1xuaW1wb3J0ICogYXMgc2NoZW1hIGZyb20gXCIuLi9kcml6emxlL3NjaGVtYVwiO1xuXG5leHBvcnQgdHlwZSBEQiA9IFJldHVyblR5cGU8dHlwZW9mIGRyaXp6bGU8dHlwZW9mIHNjaGVtYT4+O1xuXG5sZXQgZGI6IERCIHwgbnVsbCA9IG51bGw7XG5sZXQgcG9vbDogUG9vbCB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0RGIoKTogUHJvbWlzZTxEQj4ge1xuICBpZiAoZGIpIHJldHVybiBkYjtcblxuICBwb29sID0gY3JlYXRlUG9vbCh7XG4gICAgaG9zdDogICAgIHByb2Nlc3MuZW52LkxPQ0FMX0RCX0hPU1QgICAgIHx8IFwibG9jYWxob3N0XCIsXG4gICAgcG9ydDogICAgIE51bWJlcihwcm9jZXNzLmVudi5MT0NBTF9EQl9QT1JUKSB8fCAzMzA2LFxuICAgIHVzZXI6ICAgICBwcm9jZXNzLmVudi5MT0NBTF9EQl9VU0VSICAgICB8fCBcIm1vc191c2VyXCIsXG4gICAgcGFzc3dvcmQ6IHByb2Nlc3MuZW52LkxPQ0FMX0RCX1BBU1NXT1JEIHx8IFwibW9zX3NlY3VyZV8yMDI2XCIsXG4gICAgZGF0YWJhc2U6IHByb2Nlc3MuZW52LkxPQ0FMX0RCX05BTUUgICAgIHx8IFwibW9zX2RiXCIsXG4gICAgLy8gQXp1cmUgTXlTUUwgcmVxdWlyZXMgVExTOyBlbmFibGUgd2hlbiBEQl9TU0w9dHJ1ZS4gRW1wdHkgc3NsIG9iamVjdFxuICAgIC8vIG1ha2VzIG15c3FsMiB1c2UgaXRzIGJ1bmRsZWQgQ0EgYnVuZGxlICsgc2VydmVyIGNlcnQgdmFsaWRhdGlvbi5cbiAgICBzc2w6ICAgICAgcHJvY2Vzcy5lbnYuREJfU1NMID09PSBcInRydWVcIiA/IHt9IDogdW5kZWZpbmVkLFxuICAgIGNvbm5lY3Rpb25MaW1pdDogICAgICAxMCxcbiAgICB3YWl0Rm9yQ29ubmVjdGlvbnM6ICAgdHJ1ZSxcbiAgICBxdWV1ZUxpbWl0OiAgICAgICAgICAgMCxcbiAgICBjb25uZWN0VGltZW91dDogICAgICAgMTBfMDAwLFxuICAgIGlkbGVUaW1lb3V0OiAgICAgICAgICA2MF8wMDAsXG4gICAgZW5hYmxlS2VlcEFsaXZlOiAgICAgIHRydWUsXG4gICAga2VlcEFsaXZlSW5pdGlhbERlbGF5OiAxMF8wMDAsXG4gIH0pO1xuXG4gIGRiID0gZHJpenpsZShwb29sLCB7IHNjaGVtYSwgbW9kZTogXCJkZWZhdWx0XCIgfSk7XG4gIHJldHVybiBkYjtcbn1cblxuLy8gREVCVC0yOiBIZWFsdGggY2hlY2sgXHUyMDE0IHJldHVybnMgdHJ1ZSBpZiBEQiBpcyByZWFjaGFibGVcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwaW5nRGIoKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgZGF0YWJhc2UgPSBhd2FpdCBnZXREYigpO1xuICAgIGF3YWl0IGRhdGFiYXNlLmV4ZWN1dGUoc3FsYFNFTEVDVCAxYCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vLyBnZXRTb3dvcmtEYiBcdTIwMTQgbm93IGFuIGFsaWFzIGZvciBnZXREYigpIChtb3NfZGIpLlxuLy8gc293b3JrX2RiIEF6dXJlIGRlcGVuZGVuY3kgaXMgZnVsbHkgcmVtb3ZlZC5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTb3dvcmtEYigpOiBQcm9taXNlPERCPiB7XG4gIHJldHVybiBnZXREYigpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGluZ1Nvd29ya0RiKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICByZXR1cm4gcGluZ0RiKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQb29sKCk6IFBvb2wgfCBudWxsIHsgcmV0dXJuIHBvb2w7IH1cblxuLy8gREVCVC0yOiBHcmFjZWZ1bCBzaHV0ZG93biBcdTIwMTQgZHJhaW4gcG9vbCBiZWZvcmUgcHJvY2VzcyBleGl0c1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsb3NlRGIoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmIChwb29sKSBhd2FpdCBwb29sLmVuZCgpO1xuICBkYiA9IG51bGw7XG4gIHBvb2wgPSBudWxsO1xufVxuIiwgImltcG9ydCB7XG4gIGJvb2xlYW4sXG4gIGludCxcbiAgdGlueWludCxcbiAgbXlzcWxFbnVtLFxuICBteXNxbFRhYmxlLFxuICB0ZXh0LFxuICBsb25ndGV4dCxcbiAgdGltZXN0YW1wLFxuICBkYXRldGltZSxcbiAgdmFyY2hhcixcbiAgZGVjaW1hbCxcbiAganNvbixcbn0gZnJvbSBcImRyaXp6bGUtb3JtL215c3FsLWNvcmVcIjtcbmltcG9ydCB7IHNxbCB9IGZyb20gXCJkcml6emxlLW9ybVwiO1xuXG4vLyAgVXNlcnMgXG4vLyBOT1RFOiBUaGlzIHRhYmxlIGFscmVhZHkgZXhpc3RzIGluIHNvd29ya19kYiB3aXRoIGV4dGVuZGVkIGNvbHVtbnMuXG4vLyBXZSBtYXAgb25seSB0aGUgY29sdW1ucyB1c2VkIGJ5IEFJIE1hcmtldGVyOyBleHRyYSBjb2x1bW5zIGFyZSBpZ25vcmVkIGJ5IERyaXp6bGUuXG5cblxuZXhwb3J0IGNvbnN0IHVzZXJzID0gbXlzcWxUYWJsZShcInVzZXJzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIG9wZW5JZDogdmFyY2hhcihcIm9wZW5JZFwiLCB7IGxlbmd0aDogNjQgfSkubm90TnVsbCgpLnVuaXF1ZSgpLFxuICBuYW1lOiB0ZXh0KFwibmFtZVwiKSxcbiAgZW1haWw6IHZhcmNoYXIoXCJlbWFpbFwiLCB7IGxlbmd0aDogMzIwIH0pLFxuICByb2xlOiBteXNxbEVudW0oXCJyb2xlXCIsIFtcInVzZXJcIiwgXCJhZG1pblwiXSkuZGVmYXVsdChcInVzZXJcIikubm90TnVsbCgpLFxuICBpc0FjdGl2ZTogaW50KFwiaXNBY3RpdmVcIikuZGVmYXVsdCgwKS5ub3ROdWxsKCksXG4gIGNyZWRpdHM6IGludChcImNyZWRpdHNcIikuZGVmYXVsdCgxMDAwKS5ub3ROdWxsKCksXG4gIGhhc1VubGltaXRlZENyZWRpdHM6IGludChcImhhc1VubGltaXRlZENyZWRpdHNcIikuZGVmYXVsdCgwKS5ub3ROdWxsKCksXG4gIC8vIEF1dGhlbnRpY2F0aW9uIGZpZWxkc1xuICBwYXNzd29yZEhhc2g6IHZhcmNoYXIoXCJwYXNzd29yZEhhc2hcIiwgeyBsZW5ndGg6IDI1NSB9KSxcbiAgYXV0aE1ldGhvZDogbXlzcWxFbnVtKFwiYXV0aE1ldGhvZFwiLCBbXCJwYXNzd29yZFwiLCBcIm9hdXRoXCIsIFwiZ29vZ2xlXCIsIFwic2xhY2tcIl0pLmRlZmF1bHQoXCJwYXNzd29yZFwiKSxcbiAgLy8gRW1haWwgdmVyaWZpY2F0aW9uIGZpZWxkc1xuICBlbWFpbFZlcmlmaWNhdGlvblRva2VuOiB2YXJjaGFyKFwiZW1haWxWZXJpZmljYXRpb25Ub2tlblwiLCB7IGxlbmd0aDogMjU1IH0pLFxuICBlbWFpbFZlcmlmaWNhdGlvbkV4cGlyZXM6IHRpbWVzdGFtcChcImVtYWlsVmVyaWZpY2F0aW9uRXhwaXJlc1wiKSxcbiAgLy8gUGFzc3dvcmQgcmVzZXQgZmllbGRzXG4gIHBhc3N3b3JkUmVzZXRUb2tlbjogdmFyY2hhcihcInBhc3N3b3JkUmVzZXRUb2tlblwiLCB7IGxlbmd0aDogMjU1IH0pLFxuICBwYXNzd29yZFJlc2V0RXhwaXJlczogdGltZXN0YW1wKFwicGFzc3dvcmRSZXNldEV4cGlyZXNcIiksXG4gIC8vIFNlY3VyaXR5IGZpZWxkc1xuICByZWdpc3RyYXRpb25JcDogdmFyY2hhcihcInJlZ2lzdHJhdGlvbklwXCIsIHsgbGVuZ3RoOiA0NSB9KSxcbiAgbGFzdExvZ2luSXA6IHZhcmNoYXIoXCJsYXN0TG9naW5JcFwiLCB7IGxlbmd0aDogNDUgfSksXG4gIGFjdGl2YXRlZEF0OiB0aW1lc3RhbXAoXCJhY3RpdmF0ZWRBdFwiKSxcbiAgLy8gRW50ZXJwcmlzZSBmaWVsZHMgKGFkZGVkIGluIE1PUyBtaWdyYXRpb24pXG4gIGNvbXBhbnlJZDogaW50KFwiY29tcGFueUlkXCIpLFxuICBkZXBhcnRtZW50SWQ6IGludChcImRlcGFydG1lbnRJZFwiKSxcbiAgb3JnUm9sZTogbXlzcWxFbnVtKFwib3JnUm9sZVwiLCBbXCJvd25lclwiLCBcImFkbWluXCIsIFwibWVtYmVyXCJdKS5kZWZhdWx0KFwibWVtYmVyXCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIFVzZXIgPSB0eXBlb2YgdXNlcnMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0VXNlciA9IHR5cGVvZiB1c2Vycy4kaW5mZXJJbnNlcnQ7XG5cbi8vICBBSSBBZ2VudHNcbmV4cG9ydCBjb25zdCBhZ2VudHMgPSBteXNxbFRhYmxlKFwiYWdlbnRzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHNsdWc6IHZhcmNoYXIoXCJzbHVnXCIsIHsgbGVuZ3RoOiA2NCB9KS5ub3ROdWxsKCkudW5pcXVlKCksXG4gIG5hbWU6IHZhcmNoYXIoXCJuYW1lXCIsIHsgbGVuZ3RoOiA2NCB9KS5ub3ROdWxsKCksXG4gIGVuZ2xpc2hOYW1lOiB2YXJjaGFyKFwiZW5nbGlzaE5hbWVcIiwgeyBsZW5ndGg6IDY0IH0pLFxuICB0aXRsZTogdmFyY2hhcihcInRpdGxlXCIsIHsgbGVuZ3RoOiAxMjggfSkubm90TnVsbCgpLFxuICBsYXllcjogbXlzcWxFbnVtKFwibGF5ZXJcIiwgW1wic3RyYXRlZ3lcIiwgXCJleGVjdXRpb25cIiwgXCJ0cmFpbmluZ1wiXSkubm90TnVsbCgpLFxuICBhdmF0YXJVcmw6IHRleHQoXCJhdmF0YXJVcmxcIiksXG4gIGNvdmVyVXJsOiB0ZXh0KFwiY292ZXJVcmxcIiksXG4gIGJpbzogdGV4dChcImJpb1wiKSxcbiAgc3BlY2lhbHR5OiB0ZXh0KFwic3BlY2lhbHR5XCIpLFxuICBrbm93bGVkZ2VTb3VyY2VzOiBqc29uKFwia25vd2xlZGdlU291cmNlc1wiKS4kdHlwZTxzdHJpbmdbXT4oKSxcbiAgc2tpbGxzOiBqc29uKFwic2tpbGxzXCIpLiR0eXBlPHN0cmluZ1tdPigpLFxuICBjYXNlU3R1ZGllczoganNvbihcImNhc2VTdHVkaWVzXCIpLiR0eXBlPHsgdGl0bGU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZzsgcmVzdWx0OiBzdHJpbmcgfVtdPigpLFxuICBwcmljZU1vbnRobHk6IGRlY2ltYWwoXCJwcmljZU1vbnRobHlcIiwgeyBwcmVjaXNpb246IDEwLCBzY2FsZTogMiB9KSxcbiAgcHJpY2VQZXJUYXNrOiBkZWNpbWFsKFwicHJpY2VQZXJUYXNrXCIsIHsgcHJlY2lzaW9uOiAxMCwgc2NhbGU6IDIgfSksXG4gIHJhdGluZzogZGVjaW1hbChcInJhdGluZ1wiLCB7IHByZWNpc2lvbjogMywgc2NhbGU6IDIgfSkuZGVmYXVsdChcIjUuMDBcIiksXG4gIHJldmlld0NvdW50OiBpbnQoXCJyZXZpZXdDb3VudFwiKS5kZWZhdWx0KDApLFxuICB0YXNrQ291bnQ6IGludChcInRhc2tDb3VudFwiKS5kZWZhdWx0KDApLFxuICBpc0F2YWlsYWJsZTogYm9vbGVhbihcImlzQXZhaWxhYmxlXCIpLmRlZmF1bHQodHJ1ZSksXG4gIGlzRmVhdHVyZWQ6IGJvb2xlYW4oXCJpc0ZlYXR1cmVkXCIpLmRlZmF1bHQoZmFsc2UpLFxuICBzb3J0T3JkZXI6IGludChcInNvcnRPcmRlclwiKS5kZWZhdWx0KDApLFxuICBpbmR1c3RyaWVzOiB0ZXh0KFwiaW5kdXN0cmllc1wiKSxcbiAgZXhwZXJpZW5jZURldGFpbDogdGV4dChcImV4cGVyaWVuY2VEZXRhaWxcIiksXG4gIG1ldGhvZG9sb2d5OiB0ZXh0KFwibWV0aG9kb2xvZ3lcIiksXG4gIC8vIENyZWF0b3IgLyBVR0MgZmllbGRzXG4gIGNyZWF0b3JVc2VySWQ6IGludChcImNyZWF0b3JVc2VySWRcIiksICAgLy8gbnVsbCA9IHBsYXRmb3JtLW93bmVkIGFnZW50XG4gIHJldmlld1N0YXR1czogbXlzcWxFbnVtKFwicmV2aWV3U3RhdHVzXCIsIFtcInBlbmRpbmdcIiwgXCJhcHByb3ZlZFwiLCBcInJlamVjdGVkXCJdKS5kZWZhdWx0KFwiYXBwcm92ZWRcIiksXG4gIHJldmlld05vdGU6IHRleHQoXCJyZXZpZXdOb3RlXCIpLCAgICAgICAgLy8gYWRtaW4gcmVqZWN0aW9uIHJlYXNvblxuICBoaXJlQ291bnQ6IGludChcImhpcmVDb3VudFwiKS5kZWZhdWx0KDApLCAgICAgICAvLyB0b3RhbCB0aW1lcyBoaXJlZCBieSBvdGhlcnNcbiAgdGFza0Vhcm5Db3VudDogaW50KFwidGFza0Vhcm5Db3VudFwiKS5kZWZhdWx0KDApLCAvLyB0b3RhbCB0YXNrcyBjb21wbGV0ZWQgZWFybmluZyBjcmVkaXRzXG4gIHRvdGFsRWFybmVkOiBpbnQoXCJ0b3RhbEVhcm5lZFwiKS5kZWZhdWx0KDApLCAgICAvLyB0b3RhbCBjcmVkaXRzIGVhcm5lZCBieSBjcmVhdG9yXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG4gIHVwZGF0ZWRBdDogdGltZXN0YW1wKFwidXBkYXRlZEF0XCIpLmRlZmF1bHROb3coKS5vblVwZGF0ZU5vdygpLm5vdE51bGwoKSxcbn0pO1xuXG5leHBvcnQgdHlwZSBBZ2VudCA9IHR5cGVvZiBhZ2VudHMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0QWdlbnQgPSB0eXBlb2YgYWdlbnRzLiRpbmZlckluc2VydDtcblxuLy8gIEJyYW5kc1xuZXhwb3J0IGNvbnN0IGJyYW5kcyA9IG15c3FsVGFibGUoXCJicmFuZHNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIiksXG4gIG5hbWU6IHZhcmNoYXIoXCJuYW1lXCIsIHsgbGVuZ3RoOiAyNTUgfSkubm90TnVsbCgpLFxuICBzbHVnOiB2YXJjaGFyKFwic2x1Z1wiLCB7IGxlbmd0aDogNjQgfSkubm90TnVsbCgpLFxuICBpbmR1c3RyeTogdmFyY2hhcihcImluZHVzdHJ5XCIsIHsgbGVuZ3RoOiA2NCB9KSxcbiAgd2Vic2l0ZTogdGV4dChcIndlYnNpdGVcIiksXG4gIHNvY2lhbExpbmtzOiBqc29uKFwic29jaWFsTGlua3NcIiksXG4gIGRlc2NyaXB0aW9uOiB0ZXh0KFwiZGVzY3JpcHRpb25cIiksXG4gIGxvZ29Vcmw6IHRleHQoXCJsb2dvVXJsXCIpLFxuICBvbmJvYXJkaW5nU3RlcDogaW50KFwib25ib2FyZGluZ1N0ZXBcIikuZGVmYXVsdCgwKSxcbiAgcG9zaXRpb25pbmdTdGF0dXM6IG15c3FsRW51bShcInBvc2l0aW9uaW5nU3RhdHVzXCIsIFtcInBlbmRpbmdcIiwgXCJpbl9wcm9ncmVzc1wiLCBcImNvbXBsZXRlZFwiXSkuZGVmYXVsdChcInBlbmRpbmdcIiksXG4gIHBvc2l0aW9uaW5nU3VtbWFyeTogdGV4dChcInBvc2l0aW9uaW5nU3VtbWFyeVwiKSxcbiAgcG9zaXRpb25pbmdSZXBvcnQ6IGpzb24oXCJwb3NpdGlvbmluZ1JlcG9ydFwiKSxcbiAgY3JlYXRlZEJ5OiBpbnQoXCJjcmVhdGVkQnlcIikubm90TnVsbCgpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCksXG4gIHVwZGF0ZWRBdDogdGltZXN0YW1wKFwidXBkYXRlZEF0XCIpLmRlZmF1bHROb3coKS5vblVwZGF0ZU5vdygpLFxuICAvLyBFeHRlbmRlZCBmaWVsZHMgKG9wdGlvbmFsLCBmaWxsZWQgYnkgQUkgYW5hbHlzaXMpXG4gIHRhZ2xpbmU6IHRleHQoXCJ0YWdsaW5lXCIpLFxuICB0YXJnZXRBdWRpZW5jZTogdGV4dChcInRhcmdldEF1ZGllbmNlXCIpLFxuICBicmFuZFZvaWNlOiB0ZXh0KFwiYnJhbmRWb2ljZVwiKSxcbiAgc293b3JrQW5hbHlzaXM6IGpzb24oXCJzb3dvcmtBbmFseXNpc1wiKS4kdHlwZTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4oKSxcbiAgaXNEZWZhdWx0OiBib29sZWFuKFwiaXNEZWZhdWx0XCIpLmRlZmF1bHQoZmFsc2UpLFxuICAvLyBcdTI1MDBcdTI1MDAgQUkgXHU2M0E4XHU0RjMwXHU1QjlBXHU0RjREXHU2QjA0XHU0RjREIFx1MjUwMFx1MjUwMFxuICB2YWx1ZVByb3Bvc2l0aW9uOiB0ZXh0KFwidmFsdWVQcm9wb3NpdGlvblwiKSxcbiAgdGFyZ2V0TWFya2V0OiB2YXJjaGFyKFwidGFyZ2V0TWFya2V0XCIsIHsgbGVuZ3RoOiAxMDAgfSksXG4gIGF1ZGllbmNlQTogdmFyY2hhcihcImF1ZGllbmNlQVwiLCB7IGxlbmd0aDogMTAwIH0pLFxuICBhdWRpZW5jZUI6IHZhcmNoYXIoXCJhdWRpZW5jZUJcIiwgeyBsZW5ndGg6IDEwMCB9KSxcbiAgZW1vdGlvbmFsRGlmZjogdmFyY2hhcihcImVtb3Rpb25hbERpZmZcIiwgeyBsZW5ndGg6IDIwMCB9KSxcbiAgZnVuY3Rpb25hbERpZmY6IHZhcmNoYXIoXCJmdW5jdGlvbmFsRGlmZlwiLCB7IGxlbmd0aDogMjAwIH0pLFxuICBpc0VzdGltYXRlOiB0aW55aW50KFwiaXNFc3RpbWF0ZVwiKS5kZWZhdWx0KDApLFxufSk7XG5cbmV4cG9ydCB0eXBlIEJyYW5kID0gdHlwZW9mIGJyYW5kcy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRCcmFuZCA9IHR5cGVvZiBicmFuZHMuJGluZmVySW5zZXJ0O1xuXG4vLyAgVGFza3NcbmV4cG9ydCBjb25zdCB0YXNrcyA9IG15c3FsVGFibGUoXCJ0YXNrc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGFnZW50SWQ6IGludChcImFnZW50SWRcIikubm90TnVsbCgpLFxuICBicmFuZElkOiBpbnQoXCJicmFuZElkXCIpLCAgLy8gV2hpY2ggYnJhbmQgdGhpcyB0YXNrIGJlbG9uZ3MgdG8gKG51bGwgPSBubyBicmFuZClcbiAgcGFyZW50VGFza0lkOiBpbnQoXCJwYXJlbnRUYXNrSWRcIiksICAvLyBGb3IgQWdlbnQyQWdlbnQ6IHVwc3RyZWFtIHRhc2sgdGhhdCBwcm9kdWNlZCB0aGUgaW5wdXRcbiAgZm9yd2FyZE5vdGU6IHRleHQoXCJmb3J3YXJkTm90ZVwiKSwgIC8vIEJvc3MncyBpbnN0cnVjdGlvbiB3aGVuIGZvcndhcmRpbmcgdGFzayB0byBhbm90aGVyIGFnZW50XG4gIGNvbnZlcnNhdGlvbklkOiBpbnQoXCJjb252ZXJzYXRpb25JZFwiKSxcbiAgdGl0bGU6IHZhcmNoYXIoXCJ0aXRsZVwiLCB7IGxlbmd0aDogMjU2IH0pLm5vdE51bGwoKSxcbiAgZGVzY3JpcHRpb246IHRleHQoXCJkZXNjcmlwdGlvblwiKSxcbiAgdGFza1R5cGU6IHZhcmNoYXIoXCJ0YXNrVHlwZVwiLCB7IGxlbmd0aDogNjQgfSksXG4gIHN0YXR1czogbXlzcWxFbnVtKFwic3RhdHVzXCIsIFtcInBlbmRpbmdcIiwgXCJpbl9wcm9ncmVzc1wiLCBcInJldmlld1wiLCBcImNvbXBsZXRlZFwiLCBcImNhbmNlbGxlZFwiXSkuZGVmYXVsdChcInBlbmRpbmdcIikubm90TnVsbCgpLFxuICBwcmlvcml0eTogbXlzcWxFbnVtKFwicHJpb3JpdHlcIiwgW1wibG93XCIsIFwibm9ybWFsXCIsIFwiaGlnaFwiLCBcInVyZ2VudFwiXSkuZGVmYXVsdChcIm5vcm1hbFwiKSxcbiAgZHVlRGF0ZTogdGltZXN0YW1wKFwiZHVlRGF0ZVwiKSxcbiAgaXNSZWN1cnJpbmc6IGJvb2xlYW4oXCJpc1JlY3VycmluZ1wiKS5kZWZhdWx0KGZhbHNlKSxcbiAgcmVjdXJyaW5nU2NoZWR1bGU6IHZhcmNoYXIoXCJyZWN1cnJpbmdTY2hlZHVsZVwiLCB7IGxlbmd0aDogNjQgfSksICAvLyAnZGFpbHknIHwgJ3dlZWtseScgfCAnYml3ZWVrbHknIHwgJ21vbnRobHknXG4gIGNsaWVudE5hbWU6IHZhcmNoYXIoXCJjbGllbnROYW1lXCIsIHsgbGVuZ3RoOiAyNTYgfSksICAvLyBDbGllbnQgbmFtZSBmb3IgYWdlbmN5IHdvcmtmbG93c1xuICByZWZlcmVuY2VVcmxzOiB0ZXh0KFwicmVmZXJlbmNlVXJsc1wiKSwgIC8vIEpTT04gYXJyYXkgb2YgcmVmZXJlbmNlIFVSTHMvbm90ZXNcbiAgY29tcGxldGVkQXQ6IHRpbWVzdGFtcChcImNvbXBsZXRlZEF0XCIpLFxuICByZXN1bHQ6IHRleHQoXCJyZXN1bHRcIiksXG4gIGF0dGFjaG1lbnRVcmw6IHRleHQoXCJhdHRhY2htZW50VXJsXCIpLFxuICAvLyBKU09OOiB7IHRyaWdnZXJlZDogYm9vbGVhbiwgd29ya2Zsb3dOYW1lOiBzdHJpbmcsIGNyZWF0ZWRUYXNrQ291bnQ6IG51bWJlciwgY3JlYXRlZFRhc2tJZHM6IG51bWJlcltdIH1cbiAgdHJpZ2dlcmVkV29ya2Zsb3dzOiBqc29uKFwidHJpZ2dlcmVkV29ya2Zsb3dzXCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcblxuZXhwb3J0IHR5cGUgVGFzayA9IHR5cGVvZiB0YXNrcy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRUYXNrID0gdHlwZW9mIHRhc2tzLiRpbmZlckluc2VydDtcblxuLy8gIFRhc2sgRXhlY3V0aW9ucyAoXHU0RUZCXHU1MkQ5XHU1N0Y3XHU4ODRDXHU3RDAwXHU5MzA0KSBcbi8vIEVhY2ggdGltZSBhIHRhc2sgaXMgc3RhcnRlZCwgYSBuZXcgZXhlY3V0aW9uIHJlY29yZCBpcyBjcmVhdGVkLlxuLy8gVGhpcyBhbGxvd3MgdHJhY2tpbmcgaGlzdG9yeSwgcmV0cmllcywgYW5kIHZpZXdpbmcgcGFzdCBvdXRwdXRzLlxuZXhwb3J0IGNvbnN0IHRhc2tFeGVjdXRpb25zID0gbXlzcWxUYWJsZShcInRhc2tfZXhlY3V0aW9uc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB0YXNrSWQ6IGludChcInRhc2tJZFwiKS5ub3ROdWxsKCksXG4gIHVzZXJJZDogaW50KFwidXNlcklkXCIpLm5vdE51bGwoKSxcbiAgYWdlbnRJZDogaW50KFwiYWdlbnRJZFwiKS5ub3ROdWxsKCksXG4gIHN0YXR1czogbXlzcWxFbnVtKFwic3RhdHVzXCIsIFtcInJ1bm5pbmdcIiwgXCJjb21wbGV0ZWRcIiwgXCJmYWlsZWRcIiwgXCJjYW5jZWxsZWRcIl0pLmRlZmF1bHQoXCJydW5uaW5nXCIpLm5vdE51bGwoKSxcbiAgLy8gVGhlIHByb21wdCBzZW50IHRvIHRoZSBBSSAodGFzayB0aXRsZSArIGRlc2NyaXB0aW9uICsgYnJhbmQgY29udGV4dClcbiAgcHJvbXB0OiB0ZXh0KFwicHJvbXB0XCIpLFxuICAvLyBUaGUgQUktZ2VuZXJhdGVkIG91dHB1dCAobWFya2Rvd24pXG4gIG91dHB1dDogbG9uZ3RleHQoXCJvdXRwdXRcIiksXG4gIC8vIEVycm9yIG1lc3NhZ2UgaWYgZmFpbGVkXG4gIGVycm9yTWVzc2FnZTogdGV4dChcImVycm9yTWVzc2FnZVwiKSxcbiAgLy8gRXhlY3V0aW9uIHRpbWluZ1xuICBzdGFydGVkQXQ6IHRpbWVzdGFtcChcInN0YXJ0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICBjb21wbGV0ZWRBdDogdGltZXN0YW1wKFwiY29tcGxldGVkQXRcIiksXG4gIGR1cmF0aW9uTXM6IGludChcImR1cmF0aW9uTXNcIiksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIFRhc2tFeGVjdXRpb24gPSB0eXBlb2YgdGFza0V4ZWN1dGlvbnMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0VGFza0V4ZWN1dGlvbiA9IHR5cGVvZiB0YXNrRXhlY3V0aW9ucy4kaW5mZXJJbnNlcnQ7XG5cbi8vIC0tIFRhc2sgV29ya2Zsb3dzIChBdXRvbWF0aWMgVHJpZ2dlcnMpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBcdTgxRUFcdTUyRDVcdTVERTVcdTRGNUNcdTZENDFcdUZGMUFcdTRFRkJcdTUyRDlcdTVCOENcdTYyMTBcdTVGOENcdTgxRUFcdTUyRDVcdTg5RjhcdTc2N0NcdTRFMEJcdTZFMzhcdTRFRkJcdTUyRDlcbi8vIFx1NEY4Qlx1NTk4Mlx1RkYxQVx1MzAwQ1x1N0FGNlx1NTRDMVx1NTIwNlx1Njc5MFx1MzAwRFx1NUI4Q1x1NjIxMCBcdTIxOTIgXHU4MUVBXHU1MkQ1XHU4OUY4XHU3NjdDXHUzMDBDRmFjZWJvb2sgXHU4Q0JDXHU2NTg3XHU2NEIwXHU1QkVCXHUzMDBEXG5leHBvcnQgY29uc3QgdGFza1dvcmtmbG93cyA9IG15c3FsVGFibGUoXCJ0YXNrX3dvcmtmbG93c1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5wcmltYXJ5S2V5KCkuYXV0b2luY3JlbWVudCgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGJyYW5kSWQ6IGludChcImJyYW5kSWRcIiksXG4gIG5hbWU6IHZhcmNoYXIoXCJuYW1lXCIsIHsgbGVuZ3RoOiAyNTUgfSkubm90TnVsbCgpLFxuICBkZXNjcmlwdGlvbjogdGV4dChcImRlc2NyaXB0aW9uXCIpLFxuICAvLyBcdTg5RjhcdTc2N0NcdTY4OURcdTRFRjZcdUZGMUFcdTU0RUFcdTUwMEIgQUkgXHU1NEUxXHU1REU1XHU3Njg0XHU0RUZCXHU1MkQ5XHU1QjhDXHU2MjEwXHU1RjhDXHU4OUY4XHU3NjdDXG4gIHRyaWdnZXJBZ2VudFNsdWc6IHZhcmNoYXIoXCJ0cmlnZ2VyQWdlbnRTbHVnXCIsIHsgbGVuZ3RoOiAxMjggfSksXG4gIHRyaWdnZXJUYXNrVHlwZTogdmFyY2hhcihcInRyaWdnZXJUYXNrVHlwZVwiLCB7IGxlbmd0aDogMTI4IH0pLFxuICAvLyBcdTRFMEJcdTZFMzhcdTZCNjVcdTlBNUZcdUZGMDhKU09OIFx1OTY2M1x1NTIxN1x1RkYwOVxuICAvLyBbeyBhZ2VudFNsdWc6IFwid2FuZy1zaG9ydC12aWRlb1wiLCB0YXNrVGl0bGU6IFwiXHU2NEIwXHU1QkVCXHU3N0VEXHU1RjcxXHU5N0YzXHU4MTczXHU2NzJDXCIsIHRhc2tEZXNjcmlwdGlvbjogXCIuLi5cIiwgZGVsYXlNaW51dGVzOiAwIH1dXG4gIHN0ZXBzOiBqc29uKFwic3RlcHNcIikubm90TnVsbCgpLFxuICBpc0FjdGl2ZTogYm9vbGVhbihcImlzQWN0aXZlXCIpLmRlZmF1bHQodHJ1ZSkubm90TnVsbCgpLFxuICAvLyBcdTdENzFcdThBMDhcbiAgdHJpZ2dlckNvdW50OiBpbnQoXCJ0cmlnZ2VyQ291bnRcIikuZGVmYXVsdCgwKS5ub3ROdWxsKCksXG4gIGxhc3RUcmlnZ2VyZWRBdDogdGltZXN0YW1wKFwibGFzdFRyaWdnZXJlZEF0XCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIFRhc2tXb3JrZmxvdyA9IHR5cGVvZiB0YXNrV29ya2Zsb3dzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydFRhc2tXb3JrZmxvdyA9IHR5cGVvZiB0YXNrV29ya2Zsb3dzLiRpbmZlckluc2VydDtcblxuLy8gIEFnZW50IExlYXJuaW5ncyAoQUkgXHU1NEUxXHU1REU1XHU1MDBCXHU0RUJBXHU1Qjc4XHU3RkQyXHU4QTE4XHU5MzA0KSBcbi8vIFx1NkJDRlx1NkIyMVx1NEVGQlx1NTJEOVx1NUI4Q1x1NjIxMFx1NUY4Q1x1ODFFQVx1NTJENVx1OEExOFx1OTMwNFx1RkYwQ1x1NzUyOFx1NjIzNlx1NTNDRFx1OTk0Qlx1NUY4Q1x1NjZGNFx1NjVCMFx1OEE1NVx1NTIwNlxuLy8gaXNQcml2YXRlPXRydWU6IFx1NjcwOFx1NzlERi9cdTU3MThcdTk2OEFcdTU3OEJcdUZGMENcdTVCNzhcdTdGRDJcdThBMThcdTkzMDRcdTVDNkNcdTU0QzFcdTcyNENcdTc5QzFcdTY3MDlcdUZGMENcdTUzRUFcdTZDRThcdTUxNjVcdTU0MENcdTU0QzFcdTcyNENcdTRFRkJcdTUyRDlcbi8vIGlzUHJpdmF0ZT1mYWxzZTogXHU0RUZCXHU1MkQ5XHU1NzhCXHVGRjBDXHU1Qjc4XHU3RkQyXHU4QTE4XHU5MzA0XHU3MEJBXHU1MTZDXHU1MTcxXHU4Q0M3XHU3NTIyXHVGRjBDXHU1M0VGXHU2Q0U4XHU1MTY1XHU2MjQwXHU2NzA5XHU3NTI4XHU2MjM2XHU3Njg0XHU0RUZCXHU1MkQ5XG5leHBvcnQgY29uc3QgYWdlbnRMZWFybmluZ3MgPSBteXNxbFRhYmxlKFwiYWdlbnRfbGVhcm5pbmdzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIGFnZW50SWQ6IGludChcImFnZW50SWRcIikubm90TnVsbCgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGJyYW5kSWQ6IGludChcImJyYW5kSWRcIiksXG4gIHRhc2tJZDogaW50KFwidGFza0lkXCIpLFxuICAvLyBcdThBMDJcdTk1QjFcdTk4NUVcdTU3OEJcdTZDN0FcdTVCOUFcdTk2QjFcdTc5QzFcdTYwMjdcbiAgc3Vic2NyaXB0aW9uUGxhbjogbXlzcWxFbnVtKFwic3Vic2NyaXB0aW9uUGxhblwiLCBbXCJwZXJfdGFza1wiLCBcIm1vbnRobHlcIiwgXCJ0ZWFtXCJdKS5ub3ROdWxsKCksXG4gIC8vIGlzUHJpdmF0ZT10cnVlOiBcdTY3MDhcdTc5REYvXHU1NzE4XHU5NjhBXHU1NzhCXHVGRjBDXHU1M0VBXHU1QzBEXHU1NDBDXHU1NEMxXHU3MjRDXHU1M0VGXHU4OThCOyBpc1ByaXZhdGU9ZmFsc2U6IFx1NEVGQlx1NTJEOVx1NTc4Qlx1RkYwQ1x1NTE2Q1x1NTE3MVx1NTE3MVx1NEVBQlxuICBpc1ByaXZhdGU6IGJvb2xlYW4oXCJpc1ByaXZhdGVcIikuZGVmYXVsdChmYWxzZSkubm90TnVsbCgpLFxuICAvLyBcdTRFRkJcdTUyRDlcdTY0NThcdTg5ODFcdUZGMDhcdTc1MjhcdTY1QkNcdTY3MkFcdTRGODZcdTc2RjhcdTRGM0NcdTRFRkJcdTUyRDlcdTc2ODRcdTRFMEFcdTRFMEJcdTY1ODdcdTZDRThcdTUxNjVcdUZGMDlcbiAgdGFza1RpdGxlOiB2YXJjaGFyKFwidGFza1RpdGxlXCIsIHsgbGVuZ3RoOiAyNTUgfSkubm90TnVsbCgpLFxuICB0YXNrRGVzY3JpcHRpb246IHRleHQoXCJ0YXNrRGVzY3JpcHRpb25cIiksXG4gIHRhc2tUeXBlOiB2YXJjaGFyKFwidGFza1R5cGVcIiwgeyBsZW5ndGg6IDY0IH0pLFxuICAvLyBBSSBcdTc1MjJcdTUxRkFcdTY0NThcdTg5ODFcdUZGMDhcdTUyNEQgNTAwIFx1NUI1N1x1RkYwQ1x1NzUyOFx1NjVCQ1x1NUI3OFx1N0ZEMlx1NkNFOFx1NTE2NVx1RkYwOVxuICBvdXRwdXRTdW1tYXJ5OiB0ZXh0KFwib3V0cHV0U3VtbWFyeVwiKSxcbiAgLy8gXHU1QjhDXHU2NTc0XHU3NTIyXHU1MUZBXHVGRjA4XHU0RjlCXHU2REYxXHU1RUE2XHU1Qjc4XHU3RkQyXHU1MjA2XHU2NzkwXHVGRjA5XG4gIGZ1bGxPdXRwdXQ6IGxvbmd0ZXh0KFwiZnVsbE91dHB1dFwiKSxcbiAgLy8gXHU3NTI4XHU2MjM2XHU1M0NEXHU5OTRCXG4gIHVzZXJSYXRpbmc6IGludChcInVzZXJSYXRpbmdcIiksICAvLyAxLTUgXHU2NjFGXG4gIHVzZXJGZWVkYmFjazogdGV4dChcInVzZXJGZWVkYmFja1wiKSwgIC8vIFx1NjU4N1x1NUI1N1x1NTNDRFx1OTk0QlxuICBmZWVkYmFja0F0OiB0aW1lc3RhbXAoXCJmZWVkYmFja0F0XCIpLFxuICAvLyBcdTU0QzFcdTcyNENcdTRFMEFcdTRFMEJcdTY1ODdcdTVGRUJcdTcxNjdcdUZGMDhcdTRFRkJcdTUyRDlcdTU3RjdcdTg4NENcdTY2NDJcdTc2ODRcdTU0QzFcdTcyNENcdThDQzdcdThBMEFcdUZGMDlcbiAgYnJhbmRDb250ZXh0OiBqc29uKFwiYnJhbmRDb250ZXh0XCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIEFnZW50TGVhcm5pbmcgPSB0eXBlb2YgYWdlbnRMZWFybmluZ3MuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0QWdlbnRMZWFybmluZyA9IHR5cGVvZiBhZ2VudExlYXJuaW5ncy4kaW5mZXJJbnNlcnQ7XG5cbi8vICBTdWJzY3JpcHRpb25zIChIaXJlZCBBZ2VudHMpXG5leHBvcnQgY29uc3Qgc3Vic2NyaXB0aW9ucyA9IG15c3FsVGFibGUoXCJzdWJzY3JpcHRpb25zXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHVzZXJJZDogaW50KFwidXNlcklkXCIpLm5vdE51bGwoKSxcbiAgYWdlbnRJZDogaW50KFwiYWdlbnRJZFwiKS5ub3ROdWxsKCksXG4gIGJyYW5kSWQ6IGludChcImJyYW5kSWRcIiksICAvLyBXaGljaCBicmFuZCB0aGlzIEFJIGlzIGhpcmVkIGZvciAobnVsbCA9IGFsbCBicmFuZHMpXG4gIHBsYW46IG15c3FsRW51bShcInBsYW5cIiwgW1wicGVyX3Rhc2tcIiwgXCJtb250aGx5XCIsIFwidGVhbVwiXSkubm90TnVsbCgpLFxuICBzdGF0dXM6IG15c3FsRW51bShcInN0YXR1c1wiLCBbXCJhY3RpdmVcIiwgXCJwYXVzZWRcIiwgXCJjYW5jZWxsZWRcIiwgXCJleHBpcmVkXCJdKS5kZWZhdWx0KFwiYWN0aXZlXCIpLm5vdE51bGwoKSxcbiAgc3RyaXBlU3Vic2NyaXB0aW9uSWQ6IHZhcmNoYXIoXCJzdHJpcGVTdWJzY3JpcHRpb25JZFwiLCB7IGxlbmd0aDogMTI4IH0pLFxuICBzdHJpcGVDdXN0b21lcklkOiB2YXJjaGFyKFwic3RyaXBlQ3VzdG9tZXJJZFwiLCB7IGxlbmd0aDogMTI4IH0pLFxuICBjdXJyZW50UGVyaW9kU3RhcnQ6IHRpbWVzdGFtcChcImN1cnJlbnRQZXJpb2RTdGFydFwiKSxcbiAgY3VycmVudFBlcmlvZEVuZDogdGltZXN0YW1wKFwiY3VycmVudFBlcmlvZEVuZFwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5cbmV4cG9ydCB0eXBlIFN1YnNjcmlwdGlvbiA9IHR5cGVvZiBzdWJzY3JpcHRpb25zLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydFN1YnNjcmlwdGlvbiA9IHR5cGVvZiBzdWJzY3JpcHRpb25zLiRpbmZlckluc2VydDtcblxuLy8gIFVzZXIgQ3JlZGl0cyBXYWxsZXQgKFx1NzUyOFx1NjIzNlx1OUVERVx1NjU3OFx1OTMyMlx1NTMwNSkgXG4vLyBUcmFja3MgZWFjaCB1c2VyJ3MgbW9udGhseSBjcmVkaXRzIGJhbGFuY2UgYW5kIHVzYWdlXG5leHBvcnQgY29uc3QgdXNlckNyZWRpdHMgPSBteXNxbFRhYmxlKFwidXNlcl9jcmVkaXRzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHVzZXJJZDogaW50KFwidXNlcklkXCIpLm5vdE51bGwoKS51bmlxdWUoKSxcbiAgLy8gTW9udGhseSBwbGFuIGNyZWRpdHMgKHJlc2V0IGVhY2ggYmlsbGluZyBjeWNsZSlcbiAgcGxhbkNyZWRpdHM6IGludChcInBsYW5DcmVkaXRzXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLCAgICAgICAvLyBjcmVkaXRzIGluY2x1ZGVkIGluIGN1cnJlbnQgcGxhblxuICB1c2VkQ3JlZGl0czogaW50KFwidXNlZENyZWRpdHNcIikuZGVmYXVsdCgwKS5ub3ROdWxsKCksICAgICAgIC8vIGNyZWRpdHMgY29uc3VtZWQgdGhpcyBjeWNsZVxuICAvLyBFeHRyYSBwdXJjaGFzZWQgY3JlZGl0cyAoZG8gTk9UIHJlc2V0IG1vbnRobHkpXG4gIGV4dHJhQ3JlZGl0czogaW50KFwiZXh0cmFDcmVkaXRzXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICAvLyBDdXJyZW50IHBsYW4gdGllclxuICBwbGFuVGllcjogbXlzcWxFbnVtKFwicGxhblRpZXJcIiwgW1wiY29tbXVuaXR5XCIsIFwiaW50ZWdyYXRpb25cIiwgXCJlbnRlcnByaXNlXCIsIFwidHJpYWxcIl0pLmRlZmF1bHQoXCJ0cmlhbFwiKS5ub3ROdWxsKCksXG4gIC8vIEJpbGxpbmcgY3ljbGVcbiAgY3ljbGVTdGFydDogdGltZXN0YW1wKFwiY3ljbGVTdGFydFwiKSxcbiAgY3ljbGVFbmQ6IHRpbWVzdGFtcChcImN5Y2xlRW5kXCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcblxuZXhwb3J0IHR5cGUgVXNlckNyZWRpdHMgPSB0eXBlb2YgdXNlckNyZWRpdHMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0VXNlckNyZWRpdHMgPSB0eXBlb2YgdXNlckNyZWRpdHMuJGluZmVySW5zZXJ0O1xuXG4vLyAgQ3JlZGl0cyBVc2FnZSBMb2cgKFx1OUVERVx1NjU3OFx1NkQ4OFx1ODAxN1x1OEExOFx1OTMwNCkgXG4vLyBFdmVyeSBjcmVkaXQgZGVkdWN0aW9uIGlzIGxvZ2dlZCBoZXJlIGZvciB0cmFuc3BhcmVuY3kgYW5kIGF1ZGl0XG5leHBvcnQgY29uc3QgY3JlZGl0c1VzYWdlTG9nID0gbXlzcWxUYWJsZShcImNyZWRpdHNfdXNhZ2VfbG9nXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHVzZXJJZDogaW50KFwidXNlcklkXCIpLm5vdE51bGwoKSxcbiAgYWdlbnRJZDogaW50KFwiYWdlbnRJZFwiKSwgICAgICAgICAgICAgIC8vIHdoaWNoIEFJIGFnZW50IHdhcyBpbnZvbHZlZFxuICAvLyBXaGF0IHRyaWdnZXJlZCB0aGlzIGRlZHVjdGlvblxuICBhY3Rpb25UeXBlOiBteXNxbEVudW0oXCJhY3Rpb25UeXBlXCIsIFtcbiAgICBcImFkb3B0X3Byb3Bvc2FsXCIsICAgICAgICAvLyBcdTYzQTFcdTc1MjggQUkgXHU1NEUxXHU1REU1XHU0RTNCXHU1MkQ1XHU2M0QwXHU2ODQ4XG4gICAgXCJhZG9wdF9yZXBvcnRcIiwgICAgICAgICAgLy8gXHU2M0ExXHU3NTI4XHU3QUY2XHU1NEMxL1x1NTRDMVx1NzI0Q1x1NTA2NVx1NUVCN1x1NTgzMVx1NTQ0QVxuICAgIFwiYWRvcHRfc2NoZWR1bGVcIiwgICAgICAgIC8vIFx1NjNBMVx1NzUyOFx1NjM5Mlx1N0EwQlx1NUVGQVx1OEI3MFxuICAgIFwiYWRvcHRfZHJhZnRcIiwgICAgICAgICAgIC8vIFx1NjNBMVx1NzUyOFx1ODFFQVx1NTJENVx1ODM0OVx1N0EzRlxuICAgIFwiYWRvcHRfY29sbGFib3JhdGlvblwiLCAgIC8vIFx1NjNBMVx1NzUyOFx1OERFOFx1NTRFMVx1NURFNVx1NTM1NFx1NEY1Q1x1NjIxMFx1Njc5Q1xuICAgIFwibWFudWFsX3Rhc2tcIiwgICAgICAgICAgIC8vIFx1NzUyOFx1NjIzNlx1NEUzQlx1NTJENVx1NjMwN1x1NkQzRVx1NEVGQlx1NTJEOVx1RkYwOFx1NjcwOFx1NzlERlx1NTMwNVx1NTQyQlx1RkYwQ1x1OEExOFx1OTMwNFx1NEY0Nlx1NEUwRFx1NjI2M1x1OENCQlx1RkYwOVxuICAgIFwiY2hhdF9tZXNzYWdlXCIsICAgICAgICAgIC8vIFx1NUMwRFx1OEE3MVx1RkYwOFx1NjcwOFx1NzlERlx1NTMwNVx1NTQyQlx1RkYwQ1x1OEExOFx1OTMwNFx1NEY0Nlx1NEUwRFx1NjI2M1x1OENCQlx1RkYwOVxuICAgIFwiZXh0cmFfcHVyY2hhc2VcIiwgICAgICAgIC8vIFx1NTJBMFx1OENGQ1x1OUVERVx1NjU3OFx1RkYwOFx1NkI2M1x1NjU3OFx1RkYwQ1x1NTg5RVx1NTJBMFx1RkYwOVxuICAgIFwicGxhbl9yZW5ld2FsXCIsICAgICAgICAgIC8vIFx1NjVCOVx1Njg0OFx1N0U4Q1x1OEEwMlx1RkYwOFx1NkI2M1x1NjU3OFx1RkYwQ1x1OTFDRFx1N0Y2RVx1RkYwOVxuICBdKS5ub3ROdWxsKCksXG4gIC8vIENyZWRpdCBhbW91bnQ6IG5lZ2F0aXZlID0gY29uc3VtZWQsIHBvc2l0aXZlID0gYWRkZWRcbiAgY3JlZGl0c0Ftb3VudDogaW50KFwiY3JlZGl0c0Ftb3VudFwiKS5ub3ROdWxsKCksXG4gIC8vIENhbGN1bGF0aW9uIGJyZWFrZG93biAoZm9yIHRyYW5zcGFyZW5jeSlcbiAgYmFzZUNyZWRpdHM6IGludChcImJhc2VDcmVkaXRzXCIpLFxuICBrbm93bGVkZ2VEZXB0aEZhY3RvcjogZGVjaW1hbChcImtub3dsZWRnZURlcHRoRmFjdG9yXCIsIHsgcHJlY2lzaW9uOiA0LCBzY2FsZTogMiB9KSxcbiAgaW5zdHJ1Y3Rpb25Db21wbGV4aXR5RmFjdG9yOiBkZWNpbWFsKFwiaW5zdHJ1Y3Rpb25Db21wbGV4aXR5RmFjdG9yXCIsIHsgcHJlY2lzaW9uOiA0LCBzY2FsZTogMiB9KSxcbiAgb3V0cHV0U2NhbGVGYWN0b3I6IGRlY2ltYWwoXCJvdXRwdXRTY2FsZUZhY3RvclwiLCB7IHByZWNpc2lvbjogNCwgc2NhbGU6IDIgfSksXG4gIHJhZ1F1ZXJ5Q3JlZGl0czogaW50KFwicmFnUXVlcnlDcmVkaXRzXCIpLmRlZmF1bHQoMCksXG4gIHJhbmRvbVZhcmlhdGlvbjogZGVjaW1hbChcInJhbmRvbVZhcmlhdGlvblwiLCB7IHByZWNpc2lvbjogNSwgc2NhbGU6IDIgfSksXG4gIC8vIFRva2VuIHN0YXRzIGZyb20gTExNIEFQSVxuICBpbnB1dFRva2VuczogaW50KFwiaW5wdXRUb2tlbnNcIiksXG4gIG91dHB1dFRva2VuczogaW50KFwib3V0cHV0VG9rZW5zXCIpLFxuICAvLyBDb250ZXh0XG4gIHRhc2tJZDogaW50KFwidGFza0lkXCIpLFxuICBjb252ZXJzYXRpb25JZDogaW50KFwiY29udmVyc2F0aW9uSWRcIiksXG4gIHByb3Bvc2FsSWQ6IGludChcInByb3Bvc2FsSWRcIiksICAgICAgIC8vIGxpbmtzIHRvIGFnZW50X3Byb3Bvc2FscyB0YWJsZVxuICBkZXNjcmlwdGlvbjogdGV4dChcImRlc2NyaXB0aW9uXCIpLCAgICAvLyBodW1hbi1yZWFkYWJsZSBzdW1tYXJ5XG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcblxuZXhwb3J0IHR5cGUgQ3JlZGl0c1VzYWdlTG9nID0gdHlwZW9mIGNyZWRpdHNVc2FnZUxvZy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRDcmVkaXRzVXNhZ2VMb2cgPSB0eXBlb2YgY3JlZGl0c1VzYWdlTG9nLiRpbmZlckluc2VydDtcblxuLy8gIEVudGVycHJpc2UgQ3JlZGl0cyBQb29sIChcdTRGMDFcdTY5NkRcdTcyNDhcdTUxNzFcdTc1MjhcdTlFREVcdTY1NzhcdTZDNjApIFxuLy8gV29ya3NwYWNlIG93bmVycyBjYW4gbWFpbnRhaW4gYSBzaGFyZWQgY3JlZGl0cyBwb29sIGZvciB0aGVpciB0ZWFtLlxuLy8gTWVtYmVycyBkcmF3IGZyb20gdGhpcyBwb29sIHdoZW4gdGhleSBjb25zdW1lIGNyZWRpdHMuXG4vLyBUaGUgcG9vbCBpcyBzZXBhcmF0ZSBmcm9tIHRoZSBvd25lcidzIHBlcnNvbmFsIGNyZWRpdHMgd2FsbGV0LlxuZXhwb3J0IGNvbnN0IGVudGVycHJpc2VDcmVkaXRzUG9vbCA9IG15c3FsVGFibGUoXCJlbnRlcnByaXNlX2NyZWRpdHNfcG9vbFwiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5wcmltYXJ5S2V5KCkuYXV0b2luY3JlbWVudCgpLFxuICBvd25lcklkOiBpbnQoXCJvd25lcklkXCIpLm5vdE51bGwoKS51bmlxdWUoKSwgICAvLyB3b3Jrc3BhY2Ugb3duZXIncyB1c2VySWRcbiAgdG90YWxDcmVkaXRzOiBpbnQoXCJ0b3RhbENyZWRpdHNcIikuZGVmYXVsdCgwKS5ub3ROdWxsKCksICAgLy8gdG90YWwgY3JlZGl0cyBhZGRlZFxuICB1c2VkQ3JlZGl0czogaW50KFwidXNlZENyZWRpdHNcIikuZGVmYXVsdCgwKS5ub3ROdWxsKCksICAgICAvLyB0b3RhbCBjcmVkaXRzIGNvbnN1bWVkIGJ5IG1lbWJlcnNcbiAgLy8gUGVyLW1lbWJlciBhbGxvY2F0aW9uIGNhcCAoMCA9IHVubGltaXRlZCBmcm9tIHBvb2wpXG4gIG1lbWJlck1vbnRobHlMaW1pdDogaW50KFwibWVtYmVyTW9udGhseUxpbWl0XCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIEVudGVycHJpc2VDcmVkaXRzUG9vbCA9IHR5cGVvZiBlbnRlcnByaXNlQ3JlZGl0c1Bvb2wuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0RW50ZXJwcmlzZUNyZWRpdHNQb29sID0gdHlwZW9mIGVudGVycHJpc2VDcmVkaXRzUG9vbC4kaW5mZXJJbnNlcnQ7XG5cbi8vICBFbnRlcnByaXNlIFdvcmtzcGFjZSBNZW1iZXJzIChcdTRGMDFcdTY5NkRcdTcyNDhcdTUxNzFcdTc1MjhcdTVERTVcdTRGNUNcdTUzNDBcdTYyMTBcdTU0RTEpIFxuLy8gUmVwcmVzZW50cyByZWFsIHVzZXJzIHdobyBoYXZlIGJlZW4gaW52aXRlZCB0byBzaGFyZSBhIHdvcmtzcGFjZS5cbi8vIFRoZSB3b3Jrc3BhY2Ugb3duZXIgaXMgaWRlbnRpZmllZCBieSBvd25lcklkLlxuLy8gTWVtYmVycyBjYW4gYWNjZXNzIG93bmVyJ3MgYnJhbmRzLCBBSSBhZ2VudHMsIGFuZCBicmFuZCBrbm93bGVkZ2UgYmFzZS5cbmV4cG9ydCBjb25zdCBlbnRlcnByaXNlTWVtYmVycyA9IG15c3FsVGFibGUoXCJlbnRlcnByaXNlX21lbWJlcnNcIiwge1xuICBpZDogaW50KFwiaWRcIikucHJpbWFyeUtleSgpLmF1dG9pbmNyZW1lbnQoKSxcbiAgb3duZXJJZDogaW50KFwib3duZXJJZFwiKS5ub3ROdWxsKCksICAgICAgICAgICAgLy8gd29ya3NwYWNlIG93bmVyJ3MgdXNlcklkXG4gIG1lbWJlcklkOiBpbnQoXCJtZW1iZXJJZFwiKSwgICAgICAgICAgICAgICAgICAgIC8vIGludml0ZWQgdXNlcidzIHVzZXJJZCAobnVsbCB1bnRpbCBhY2NlcHRlZClcbiAgZW1haWw6IHZhcmNoYXIoXCJlbWFpbFwiLCB7IGxlbmd0aDogMzIwIH0pLm5vdE51bGwoKSwgLy8gaW52aXRlZCBlbWFpbFxuICBuYW1lOiB2YXJjaGFyKFwibmFtZVwiLCB7IGxlbmd0aDogMTI4IH0pLCAgICAgICAvLyBkaXNwbGF5IG5hbWUgKGZpbGxlZCBhZnRlciBhY2NlcHQpXG4gIHJvbGU6IG15c3FsRW51bShcInJvbGVcIiwgW1wiYWRtaW5cIiwgXCJtZW1iZXJcIl0pLmRlZmF1bHQoXCJtZW1iZXJcIikubm90TnVsbCgpLFxuICBzdGF0dXM6IG15c3FsRW51bShcInN0YXR1c1wiLCBbXCJwZW5kaW5nXCIsIFwiYWN0aXZlXCIsIFwicmVtb3ZlZFwiXSkuZGVmYXVsdChcInBlbmRpbmdcIikubm90TnVsbCgpLFxuICBpbnZpdGVUb2tlbjogdmFyY2hhcihcImludml0ZVRva2VuXCIsIHsgbGVuZ3RoOiAxMjggfSkudW5pcXVlKCksXG4gIGludml0ZUV4cGlyZXNBdDogaW50KFwiaW52aXRlRXhwaXJlc0F0XCIpLCAgICAgIC8vIFVuaXggdGltZXN0YW1wIChzZWNvbmRzKVxuICBqb2luZWRBdDogdGltZXN0YW1wKFwiam9pbmVkQXRcIiksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG4gIHVwZGF0ZWRBdDogdGltZXN0YW1wKFwidXBkYXRlZEF0XCIpLmRlZmF1bHROb3coKS5vblVwZGF0ZU5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgRW50ZXJwcmlzZU1lbWJlciA9IHR5cGVvZiBlbnRlcnByaXNlTWVtYmVycy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRFbnRlcnByaXNlTWVtYmVyID0gdHlwZW9mIGVudGVycHJpc2VNZW1iZXJzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE5FVzogVG9rZW4gVXNhZ2UgTG9ncyAoXHU1MzlGXHU1OUNCIFRva2VuIFx1NUUzM1x1NjcyQykgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBSZWNvcmRzIGV2ZXJ5IExMTSBBUEkgY2FsbCB3aXRoIHByb3ZpZGVyLCB0b2tlbnMgdXNlZCwgYW5kIGNvc3QuXG4vLyBVc2VkIGZvciBiaWxsaW5nLCBhdWRpdGluZywgYW5kIHBlci11c2VyIGNvc3QgYW5hbHlzaXMuXG5leHBvcnQgY29uc3QgdG9rZW5Vc2FnZUxvZ3MgPSBteXNxbFRhYmxlKFwidG9rZW5fdXNhZ2VfbG9nc1wiLCB7XG4gIGlkOiB2YXJjaGFyKFwiaWRcIiwgeyBsZW5ndGg6IDM2IH0pLnByaW1hcnlLZXkoKSwgLy8gVVVJRFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIHVzZXJBcGlLZXk6IHZhcmNoYXIoXCJ1c2VyQXBpS2V5XCIsIHsgbGVuZ3RoOiA2NCB9KS5ub3ROdWxsKCksXG4gIHRlbmFudElkOiBpbnQoXCJ0ZW5hbnRJZFwiKSxcbiAgdGFza0lkOiBpbnQoXCJ0YXNrSWRcIiksXG4gIGFnZW50SWQ6IGludChcImFnZW50SWRcIiksXG4gIGFjdGlvblR5cGU6IHZhcmNoYXIoXCJhY3Rpb25UeXBlXCIsIHsgbGVuZ3RoOiA1MCB9KS5ub3ROdWxsKCksXG4gIHByb3ZpZGVyOiBteXNxbEVudW0oXCJwcm92aWRlclwiLCBbXCJvcGVuYWlcIiwgXCJ6aGlwdVwiLCBcInF3ZW5cIiwgXCJwZXJwbGV4aXR5XCIsIFwiZ29vZ2xlXCIsIFwiY29oZXJlXCIsIFwiZm9yZ2VcIl0pLm5vdE51bGwoKSxcbiAgbW9kZWw6IHZhcmNoYXIoXCJtb2RlbFwiLCB7IGxlbmd0aDogODAgfSkubm90TnVsbCgpLFxuICBwcm9tcHRUb2tlbnM6IGludChcInByb21wdFRva2Vuc1wiKS5kZWZhdWx0KDApLm5vdE51bGwoKSxcbiAgY29tcGxldGlvblRva2VuczogaW50KFwiY29tcGxldGlvblRva2Vuc1wiKS5kZWZhdWx0KDApLm5vdE51bGwoKSxcbiAgdG90YWxUb2tlbnM6IGludChcInRvdGFsVG9rZW5zXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICByYXdDb3N0VXNkOiBkZWNpbWFsKFwicmF3Q29zdFVzZFwiLCB7IHByZWNpc2lvbjogMTAsIHNjYWxlOiA2IH0pLmRlZmF1bHQoXCIwXCIpLm5vdE51bGwoKSxcbiAgbWFya3VwRmFjdG9yOiBkZWNpbWFsKFwibWFya3VwRmFjdG9yXCIsIHsgcHJlY2lzaW9uOiA1LCBzY2FsZTogMiB9KS5kZWZhdWx0KFwiNS4wXCIpLm5vdE51bGwoKSxcbiAgY3JlZGl0c0NoYXJnZWQ6IGludChcImNyZWRpdHNDaGFyZ2VkXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICBsYXRlbmN5TXM6IGludChcImxhdGVuY3lNc1wiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgVG9rZW5Vc2FnZUxvZyA9IHR5cGVvZiB0b2tlblVzYWdlTG9ncy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRUb2tlblVzYWdlTG9nID0gdHlwZW9mIHRva2VuVXNhZ2VMb2dzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE5FVzogVXNlciBBUEkgS2V5cyAoXHU3NTI4XHU2MjM2XHU4QjU4XHU1MjI1XHU3OEJDKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIFVzZXJzIGNhbiBnZW5lcmF0ZSBBUEkga2V5cyB0byBhdXRoZW50aWNhdGUgY2FsbHMgZnJvbSBleHRlcm5hbCB0b29scy5cbi8vIEtleSBmb3JtYXQ6ICdzdy14eHh4eHh4eHh4eHh4eHh4JyAocHJlZml4ICdzdy0nIGZvciBTb1dvcmspLlxuZXhwb3J0IGNvbnN0IHVzZXJBcGlLZXlzID0gbXlzcWxUYWJsZShcInVzZXJfYXBpX2tleXNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgdXNlcklkOiBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLFxuICBhcGlLZXk6IHZhcmNoYXIoXCJhcGlLZXlcIiwgeyBsZW5ndGg6IDY0IH0pLm5vdE51bGwoKS51bmlxdWUoKSwgLy8gJ3N3LXh4eHh4eHh4eHh4eHh4eHgnXG4gIGxhYmVsOiB2YXJjaGFyKFwibGFiZWxcIiwgeyBsZW5ndGg6IDEwMCB9KSxcbiAgaXNBY3RpdmU6IGJvb2xlYW4oXCJpc0FjdGl2ZVwiKS5kZWZhdWx0KHRydWUpLm5vdE51bGwoKSxcbiAgbGFzdFVzZWQ6IHRpbWVzdGFtcChcImxhc3RVc2VkXCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBVc2VyQXBpS2V5ID0gdHlwZW9mIHVzZXJBcGlLZXlzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydFVzZXJBcGlLZXkgPSB0eXBlb2YgdXNlckFwaUtleXMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgTkVXOiBUZW5hbnQgTWFya2V0cyAoXHU1OTFBXHU1RTAyXHU1ODM0XHU4QTJEXHU1QjlBKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIERlZmluZXMgcGVyLXRlbmFudCBtYXJrZXQgY29uZmlndXJhdGlvbnMgZm9yIG11bHRpLXJlZ2lvbiBkZXBsb3ltZW50cy5cbi8vIFN1cHBvcnRzIGxhbmd1YWdlLCBjb21wbGlhbmNlIGZsYWdzIChlLmcuIEdEUFIpLCBhbmQgZGVmYXVsdCBtYXJrZXQgc2VsZWN0aW9uLlxuZXhwb3J0IGNvbnN0IHRlbmFudE1hcmtldHMgPSBteXNxbFRhYmxlKFwidGVuYW50X21hcmtldHNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgdGVuYW50SWQ6IGludChcInRlbmFudElkXCIpLm5vdE51bGwoKSxcbiAgbWFya2V0SWQ6IHZhcmNoYXIoXCJtYXJrZXRJZFwiLCB7IGxlbmd0aDogMzAgfSkubm90TnVsbCgpLCAvLyAnVGFpd2FuJywnR2VybWFueScsJ1NpbmdhcG9yZScuLi5cbiAgY29udGVudExhbmd1YWdlOiB2YXJjaGFyKFwiY29udGVudExhbmd1YWdlXCIsIHsgbGVuZ3RoOiAxMCB9KS5ub3ROdWxsKCksIC8vICd6aC1UVycsJ2RlLURFJy4uLlxuICBpc0RlZmF1bHQ6IGJvb2xlYW4oXCJpc0RlZmF1bHRcIikuZGVmYXVsdChmYWxzZSkubm90TnVsbCgpLFxuICBjb21wbGlhbmNlRmxhZ3M6IGpzb24oXCJjb21wbGlhbmNlRmxhZ3NcIikuJHR5cGU8c3RyaW5nW10+KCksIC8vIFsnR0RQUiddXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIFRlbmFudE1hcmtldCA9IHR5cGVvZiB0ZW5hbnRNYXJrZXRzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydFRlbmFudE1hcmtldCA9IHR5cGVvZiB0ZW5hbnRNYXJrZXRzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEVudGVycHJpc2UgQ3JlZGl0cyBBbGxvY2F0aW9uIChcdTYyMTBcdTU0RTFcdTY3MDhcdTVFQTZcdTkxNERcdTk4NEQpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IGVudGVycHJpc2VDcmVkaXRzQWxsb2NhdGlvbiA9IG15c3FsVGFibGUoXCJlbnRlcnByaXNlX2NyZWRpdHNfYWxsb2NhdGlvblwiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBvd25lcklkOiBpbnQoXCJvd25lcklkXCIpLm5vdE51bGwoKSxcbiAgbWVtYmVySWQ6IGludChcIm1lbWJlcklkXCIpLm5vdE51bGwoKSxcbiAgYWxsb2NhdGVkQ3JlZGl0czogaW50KFwiYWxsb2NhdGVkQ3JlZGl0c1wiKS5kZWZhdWx0KDApLm5vdE51bGwoKSxcbiAgdXNlZENyZWRpdHM6IGludChcInVzZWRDcmVkaXRzXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICBtb250aGx5TGltaXQ6IGludChcIm1vbnRobHlMaW1pdFwiKS5kZWZhdWx0KDApLm5vdE51bGwoKSwgLy8gMCA9IHVzZSBwb29sIGRlZmF1bHRcbiAgY3ljbGVTdGFydDogdGltZXN0YW1wKFwiY3ljbGVTdGFydFwiKSxcbiAgY3ljbGVFbmQ6IHRpbWVzdGFtcChcImN5Y2xlRW5kXCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIEVudGVycHJpc2VDcmVkaXRzQWxsb2NhdGlvbiA9IHR5cGVvZiBlbnRlcnByaXNlQ3JlZGl0c0FsbG9jYXRpb24uJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0RW50ZXJwcmlzZUNyZWRpdHNBbGxvY2F0aW9uID0gdHlwZW9mIGVudGVycHJpc2VDcmVkaXRzQWxsb2NhdGlvbi4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBFbnRlcnByaXNlIENyZWRpdHMgVHJhbnNhY3Rpb25zIChcdTRGMDFcdTY5NkRcdTZDNjBcdTZENDFcdTZDMzRcdTVFMzMpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IGVudGVycHJpc2VDcmVkaXRzVHggPSBteXNxbFRhYmxlKFwiZW50ZXJwcmlzZV9jcmVkaXRzX3R4XCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIG93bmVySWQ6IGludChcIm93bmVySWRcIikubm90TnVsbCgpLFxuICBtZW1iZXJJZDogaW50KFwibWVtYmVySWRcIiksXG4gIHR5cGU6IG15c3FsRW51bShcInR5cGVcIiwgW1widG9wdXBcIiwgXCJkZWR1Y3RcIiwgXCJhZGp1c3RcIl0pLm5vdE51bGwoKSxcbiAgYW1vdW50OiBpbnQoXCJhbW91bnRcIikubm90TnVsbCgpLCAvLyBwb3NpdGl2ZT1hZGQsIG5lZ2F0aXZlPWRlZHVjdFxuICBub3RlOiB0ZXh0KFwibm90ZVwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgRW50ZXJwcmlzZUNyZWRpdHNUeCA9IHR5cGVvZiBlbnRlcnByaXNlQ3JlZGl0c1R4LiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydEVudGVycHJpc2VDcmVkaXRzVHggPSB0eXBlb2YgZW50ZXJwcmlzZUNyZWRpdHNUeC4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBOb3RpZmljYXRpb25zIChcdTdBRDlcdTUxNjdcdTkwMUFcdTc3RTUpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IG5vdGlmaWNhdGlvbnMgPSBteXNxbFRhYmxlKFwibm90aWZpY2F0aW9uc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIHR5cGU6IHZhcmNoYXIoXCJ0eXBlXCIsIHsgbGVuZ3RoOiA1MCB9KS5ub3ROdWxsKCksXG4gIHRpdGxlOiB2YXJjaGFyKFwidGl0bGVcIiwgeyBsZW5ndGg6IDI1NSB9KS5ub3ROdWxsKCksXG4gIGJvZHk6IHRleHQoXCJib2R5XCIpLFxuICB0YXNrSWQ6IGludChcInRhc2tJZFwiKSxcbiAgYWdlbnRJZDogaW50KFwiYWdlbnRJZFwiKSxcbiAgaXNSZWFkOiBib29sZWFuKFwiaXNSZWFkXCIpLmRlZmF1bHQoZmFsc2UpLm5vdE51bGwoKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgTm90aWZpY2F0aW9uID0gdHlwZW9mIG5vdGlmaWNhdGlvbnMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0Tm90aWZpY2F0aW9uID0gdHlwZW9mIG5vdGlmaWNhdGlvbnMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgTm90aWZpY2F0aW9uIFByZWZlcmVuY2VzIChcdTkwMUFcdTc3RTVcdTUwNEZcdTU5N0RcdThBMkRcdTVCOUEpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IG5vdGlmaWNhdGlvblByZWZlcmVuY2VzID0gbXlzcWxUYWJsZShcIm5vdGlmaWNhdGlvbl9wcmVmZXJlbmNlc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCkudW5pcXVlKCksXG4gIGluQXBwRW5hYmxlZDogYm9vbGVhbihcImluQXBwRW5hYmxlZFwiKS5kZWZhdWx0KHRydWUpLm5vdE51bGwoKSxcbiAgZW1haWxFbmFibGVkOiBib29sZWFuKFwiZW1haWxFbmFibGVkXCIpLmRlZmF1bHQoZmFsc2UpLm5vdE51bGwoKSxcbiAgbGluZUVuYWJsZWQ6IGJvb2xlYW4oXCJsaW5lRW5hYmxlZFwiKS5kZWZhdWx0KGZhbHNlKS5ub3ROdWxsKCksXG4gIGxpbmVUb2tlbjogdmFyY2hhcihcImxpbmVUb2tlblwiLCB7IGxlbmd0aDogMjU1IH0pLFxuICB0ZWxlZ3JhbUVuYWJsZWQ6IGJvb2xlYW4oXCJ0ZWxlZ3JhbUVuYWJsZWRcIikuZGVmYXVsdChmYWxzZSkubm90TnVsbCgpLFxuICB0ZWxlZ3JhbUJvdFRva2VuOiB2YXJjaGFyKFwidGVsZWdyYW1Cb3RUb2tlblwiLCB7IGxlbmd0aDogMjU1IH0pLFxuICB0ZWxlZ3JhbUNoYXRJZDogdmFyY2hhcihcInRlbGVncmFtQ2hhdElkXCIsIHsgbGVuZ3RoOiAxMDAgfSksXG4gIHdoYXRzYXBwRW5hYmxlZDogYm9vbGVhbihcIndoYXRzYXBwRW5hYmxlZFwiKS5kZWZhdWx0KGZhbHNlKS5ub3ROdWxsKCksXG4gIHdoYXRzYXBwV2ViaG9va1VybDogdmFyY2hhcihcIndoYXRzYXBwV2ViaG9va1VybFwiLCB7IGxlbmd0aDogNTAwIH0pLFxuICBub3RpZnlPblRhc2tDb21wbGV0ZWQ6IGJvb2xlYW4oXCJub3RpZnlPblRhc2tDb21wbGV0ZWRcIikuZGVmYXVsdCh0cnVlKS5ub3ROdWxsKCksXG4gIG5vdGlmeU9uVGFza0ZhaWxlZDogYm9vbGVhbihcIm5vdGlmeU9uVGFza0ZhaWxlZFwiKS5kZWZhdWx0KHRydWUpLm5vdE51bGwoKSxcbiAgbm90aWZ5T25UYXNrU3RhcnRlZDogYm9vbGVhbihcIm5vdGlmeU9uVGFza1N0YXJ0ZWRcIikuZGVmYXVsdChmYWxzZSkubm90TnVsbCgpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIE5vdGlmaWNhdGlvblByZWZlcmVuY2UgPSB0eXBlb2Ygbm90aWZpY2F0aW9uUHJlZmVyZW5jZXMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0Tm90aWZpY2F0aW9uUHJlZmVyZW5jZSA9IHR5cGVvZiBub3RpZmljYXRpb25QcmVmZXJlbmNlcy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBDaGF0IE1lc3NhZ2VzIChcdTVDMERcdThBNzFcdTZCNzdcdTUzRjJcdTYzMDFcdTRFNDVcdTUzMTYpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IGNoYXRNZXNzYWdlcyA9IG15c3FsVGFibGUoXCJjaGF0X21lc3NhZ2VzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHVzZXJJZDogaW50KFwidXNlcklkXCIpLm5vdE51bGwoKSxcbiAgYnJhbmRJZDogaW50KFwiYnJhbmRJZFwiKSxcbiAgbWlzc2lvbklkOiBpbnQoXCJtaXNzaW9uSWRcIiksXG4gIGNvbnZlcnNhdGlvblRpdGxlOiB2YXJjaGFyKFwiY29udmVyc2F0aW9uVGl0bGVcIiwgeyBsZW5ndGg6IDEwMCB9KSxcbiAgcm9sZTogdmFyY2hhcihcInJvbGVcIiwgeyBsZW5ndGg6IDEwIH0pLm5vdE51bGwoKSxcbiAgY29udGVudDogdGV4dChcImNvbnRlbnRcIikubm90TnVsbCgpLFxuICB0YXNrSWQ6IGludChcInRhc2tJZFwiKSxcbiAgY29tcGFueUlkOiBpbnQoXCJjb21wYW55SWRcIiksXG4gIGRlcGFydG1lbnRJZDogaW50KFwiZGVwYXJ0bWVudElkXCIpLFxuICBwaGFzZU9yZGVyOiBpbnQoXCJwaGFzZU9yZGVyXCIpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBDaGF0TWVzc2FnZSA9IHR5cGVvZiBjaGF0TWVzc2FnZXMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0Q2hhdE1lc3NhZ2UgPSB0eXBlb2YgY2hhdE1lc3NhZ2VzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEFnZW50IE1lbW9yaWVzIChTcHJpbnQgMzogdXNlci1kZWZpbmVkIHRyYWluaW5nIHBlciBhZ2VudCkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgY29uc3QgYWdlbnRNZW1vcmllcyA9IG15c3FsVGFibGUoXCJhZ2VudF9tZW1vcmllc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGFnZW50U2x1ZzogdmFyY2hhcihcImFnZW50U2x1Z1wiLCB7IGxlbmd0aDogNjQgfSkubm90TnVsbCgpLFxuICBicmFuZElkOiBpbnQoXCJicmFuZElkXCIpLFxuICBtZW1vcnlUeXBlOiBteXNxbEVudW0oXCJtZW1vcnlUeXBlXCIsIFtcInByZWZlcmVuY2VcIiwgXCJmb3JiaWRkZW5cIiwgXCJhdWRpZW5jZVwiLCBcInN0eWxlXCIsIFwib3RoZXJcIl0pLmRlZmF1bHQoXCJvdGhlclwiKSxcbiAgY29udGVudDogdGV4dChcImNvbnRlbnRcIikubm90TnVsbCgpLFxuICBpc0FjdGl2ZTogYm9vbGVhbihcImlzQWN0aXZlXCIpLmRlZmF1bHQodHJ1ZSkubm90TnVsbCgpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIEFnZW50TWVtb3J5ID0gdHlwZW9mIGFnZW50TWVtb3JpZXMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0QWdlbnRNZW1vcnkgPSB0eXBlb2YgYWdlbnRNZW1vcmllcy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBCcmFuZCBJbnRlZ3JhdGlvbnMgKFNwcmludCAzOiBwbGF0Zm9ybSBjb25uZWN0aW9ucyBwZXIgYnJhbmQpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IGJyYW5kSW50ZWdyYXRpb25zID0gbXlzcWxUYWJsZShcImJyYW5kX2ludGVncmF0aW9uc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGJyYW5kSWQ6IGludChcImJyYW5kSWRcIiksXG4gIGludGVncmF0aW9uVHlwZTogdmFyY2hhcihcImludGVncmF0aW9uVHlwZVwiLCB7IGxlbmd0aDogNTAgfSkubm90TnVsbCgpLCAvLyAnZmFjZWJvb2tfcGFnZXMnIHwgJ2dvb2dsZV9hZHMnIHwgJ2luc3RhZ3JhbSdcbiAgc3RhdHVzOiBteXNxbEVudW0oXCJzdGF0dXNcIiwgW1wiY29ubmVjdGVkXCIsIFwiZGlzY29ubmVjdGVkXCIsIFwiZXJyb3JcIl0pLmRlZmF1bHQoXCJkaXNjb25uZWN0ZWRcIiksXG4gIGFjY2Vzc1Rva2VuOiB0ZXh0KFwiYWNjZXNzVG9rZW5cIiksICAgICAgICAgICAgICAgICAgICAvLyBTRUMtMzogZW5jcnlwdC9kZWNyeXB0IHZpYSBzZXJ2ZXIvX2NvcmUvZW5jcnlwdGlvbi50cyAoZW5jcnlwdCgpIGJlZm9yZSB3cml0ZSwgZGVjcnlwdCgpIGFmdGVyIHJlYWQpXG4gIHNlbGVjdGVkUmVzb3VyY2VJZDogdmFyY2hhcihcInNlbGVjdGVkUmVzb3VyY2VJZFwiLCB7IGxlbmd0aDogMjU1IH0pLFxuICBhdXRob3JpemVkUmVzb3VyY2VzOiBqc29uKFwiYXV0aG9yaXplZFJlc291cmNlc1wiKSxcbiAgY29ubmVjdGVkQXQ6IHRpbWVzdGFtcChcImNvbm5lY3RlZEF0XCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIEJyYW5kSW50ZWdyYXRpb24gPSB0eXBlb2YgYnJhbmRJbnRlZ3JhdGlvbnMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0QnJhbmRJbnRlZ3JhdGlvbiA9IHR5cGVvZiBicmFuZEludGVncmF0aW9ucy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBWaWRlbyBKb2JzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgY29uc3QgdmlkZW9Kb2JzID0gbXlzcWxUYWJsZShcInZpZGVvX2pvYnNcIiwge1xuICBpZDogICAgICAgICAgIGludChcImlkXCIpLnByaW1hcnlLZXkoKS5hdXRvaW5jcmVtZW50KCksXG4gIHVzZXJJZDogICAgICAgaW50KFwidXNlcklkXCIpLm5vdE51bGwoKSxcbiAgYnJhbmRJZDogICAgICBpbnQoXCJicmFuZElkXCIpLFxuICB0b3BpYzogICAgICAgIHZhcmNoYXIoXCJ0b3BpY1wiLCB7IGxlbmd0aDogNTAwIH0pLm5vdE51bGwoKSxcbiAgcGxhdGZvcm06ICAgICBteXNxbEVudW0oXCJwbGF0Zm9ybVwiLCBbXCJ5b3V0dWJlXCIsIFwiaW5zdGFncmFtXCIsIFwidGlrdG9rXCIsIFwiZmFjZWJvb2tcIl0pLm5vdE51bGwoKS5kZWZhdWx0KFwieW91dHViZVwiKSxcbiAgbGFuZ3VhZ2U6ICAgICBteXNxbEVudW0oXCJsYW5ndWFnZVwiLCBbXCJ6aC1UV1wiLCBcInpoLUNOXCIsIFwiZW5cIl0pLm5vdE51bGwoKS5kZWZhdWx0KFwiemgtVFdcIiksXG4gIGR1cmF0aW9uOiAgICAgaW50KFwiZHVyYXRpb25cIikubm90TnVsbCgpLmRlZmF1bHQoNjApLCAgICAgICAgICAgLy8gc2Vjb25kc1xuICBzdHlsZTogICAgICAgIHZhcmNoYXIoXCJzdHlsZVwiLCB7IGxlbmd0aDogNTAgfSkubm90TnVsbCgpLmRlZmF1bHQoXCJwcm9mZXNzaW9uYWxcIiksXG4gIHN0YXR1czogICAgICAgbXlzcWxFbnVtKFwic3RhdHVzXCIsIFtcInBlbmRpbmdcIiwgXCJwcm9jZXNzaW5nXCIsIFwiY29tcGxldGVkXCIsIFwiZmFpbGVkXCJdKS5ub3ROdWxsKCkuZGVmYXVsdChcInBlbmRpbmdcIiksXG4gIHByb2dyZXNzOiAgICAgaW50KFwicHJvZ3Jlc3NcIikubm90TnVsbCgpLmRlZmF1bHQoMCksICAgICAgICAgICAgLy8gMFx1MjAxMzEwMFxuICBzY3JpcHQ6ICAgICAgIGpzb24oXCJzY3JpcHRcIiksICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFZpZGVvU2NyaXB0IG9iamVjdFxuICB2aWRlb1VybDogICAgIHRleHQoXCJ2aWRlb1VybFwiKSwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZpbmFsIE1QNCBVUkxcbiAgdGh1bWJuYWlsVXJsOiB0ZXh0KFwidGh1bWJuYWlsVXJsXCIpLCAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBQcmV2aWV3IGltYWdlXG4gIGZhbFJlcXVlc3RJZDogdmFyY2hhcihcImZhbFJlcXVlc3RJZFwiLCB7IGxlbmd0aDogMjU1IH0pLCAgICAgICAgLy8gZmFsLmFpIHJlcXVlc3QgdHJhY2tpbmdcbiAgZXJyb3JNZXNzYWdlOiB0ZXh0KFwiZXJyb3JNZXNzYWdlXCIpLFxuICBjcmVhdGVkQXQ6ICAgIHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6ICAgIHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcblxuZXhwb3J0IHR5cGUgVmlkZW9Kb2IgPSB0eXBlb2YgdmlkZW9Kb2JzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydFZpZGVvSm9iID0gdHlwZW9mIHZpZGVvSm9icy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBNaXNzaW9ucyAoU3ByaW50IDI6IHdvcmtzcGFjZSBtaXNzaW9uIGNvbnRleHQpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gRWFjaCBtaXNzaW9uIHJlcHJlc2VudHMgYSBzcGVjaWZpYyBjYW1wYWlnbi9wcm9qZWN0IHdpdGhpbiBhIHdvcmtzcGFjZSBjaGFubmVsLlxuLy8gV29ya3NwYWNlIChlLmcuIEZhY2Vib29rLCBMaW5rZWRJbikgPiBNaXNzaW9uID4gVGFzayBVbml0c1xuZXhwb3J0IGNvbnN0IG1pc3Npb25zID0gbXlzcWxUYWJsZShcIm1pc3Npb25zXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHVzZXJJZDogaW50KFwidXNlcklkXCIpLm5vdE51bGwoKSxcbiAgYnJhbmRJZDogaW50KFwiYnJhbmRJZFwiKSxcbiAgd29ya3NwYWNlOiB2YXJjaGFyKFwid29ya3NwYWNlXCIsIHsgbGVuZ3RoOiA1MCB9KS5ub3ROdWxsKCksIC8vICdmYWNlYm9vaycgfCAnbGlua2VkaW4nIHwgJ3lvdXR1YmUnIHwgJ3ByJyB8ICdldmVudCcgfCAnaW5zdG9yZSdcbiAgdGl0bGU6IHZhcmNoYXIoXCJ0aXRsZVwiLCB7IGxlbmd0aDogMjU1IH0pLm5vdE51bGwoKSxcbiAgb2JqZWN0aXZlOiB0ZXh0KFwib2JqZWN0aXZlXCIpLFxuICBhdWRpZW5jZTogdGV4dChcImF1ZGllbmNlXCIpLFxuICBvZmZlcjogdGV4dChcIm9mZmVyXCIpLFxuICBzdWNjZXNzTWV0cmljczogdGV4dChcInN1Y2Nlc3NNZXRyaWNzXCIpLFxuICBjb25zdHJhaW50czogdGV4dChcImNvbnN0cmFpbnRzXCIpLFxuICBtZXRob2RvbG9neTogdGV4dChcIm1ldGhvZG9sb2d5XCIpLCAvLyBlLmcuIFwiQnJhbmQgUG9zaXRpb25pbmcgdjJcIlxuICBkZXNjcmlwdGlvbjogdGV4dChcImRlc2NyaXB0aW9uXCIpLCAgLy8gXHU0RUZCXHU1MkQ5XHU4QUFBXHU2NjBFXHVGRjA4XHU3RDY2XHU4QTlFXHU2MTBGXHU5MTREXHU1QzBEXHU3NTI4XHVGRjA5XG4gIHNxdWFkU2x1ZzogdmFyY2hhcihcInNxdWFkU2x1Z1wiLCB7IGxlbmd0aDogNjQgfSksICAgICAvLyBcdTdEODFcdTVCOUFcdTc2ODQgc3F1YWQgc2x1Z1xuICB3ZWxjb21lTWVzc2FnZTogdGV4dChcIndlbGNvbWVNZXNzYWdlXCIpLCAgICAgICAgICAgICAgIC8vIFx1OUVERVx1NEVGQlx1NTJEOVx1NjY0Mlx1OTg2Rlx1NzkzQVx1NzY4NFx1NkI2MVx1OEZDRVx1OEEwQVx1NjA2RlxuICB0YWdsaW5lOiB2YXJjaGFyKFwidGFnbGluZVwiLCB7IGxlbmd0aDogMjU1IH0pLCAgICAgICAgICAvLyBcdTU0QzFcdTcyNENcdTVCOUFcdTRGNERcdTZBMTlcdThBOUVcbiAgc3ViVGFnbGluZTogdmFyY2hhcihcInN1YlRhZ2xpbmVcIiwgeyBsZW5ndGg6IDI1NSB9KSwgICAgLy8gXHU1NEMxXHU3MjRDXHU1QjlBXHU0RjREXHU1MjZGXHU2QTE5XHU4QTlFXG4gIHNhdmVkU3F1YWRGbG93OiB0ZXh0KFwic2F2ZWRTcXVhZEZsb3dcIiksICAgICAgICAgICAgICAgIC8vIFVzZXItY3VzdG9taXplZCBzcXVhZCBzdGVwcyBKU09OXG4gIHN0YXR1czogbXlzcWxFbnVtKFwic3RhdHVzXCIsIFtcImluYWN0aXZlXCIsIFwiYWN0aXZlXCIsIFwiY29tcGxldGVkXCIsIFwiYXJjaGl2ZWRcIl0pLmRlZmF1bHQoXCJpbmFjdGl2ZVwiKS5ub3ROdWxsKCksXG4gIGlzUmVjdXJyaW5nOiBib29sZWFuKFwiaXNSZWN1cnJpbmdcIikuZGVmYXVsdChmYWxzZSkubm90TnVsbCgpLFxuICByZWN1cnJpbmdTY2hlZHVsZTogdmFyY2hhcihcInJlY3VycmluZ1NjaGVkdWxlXCIsIHsgbGVuZ3RoOiA2NCB9KSwgIC8vICdkYWlseScgfCAnd2Vla2x5JyB8ICdiaXdlZWtseScgfCAnbW9udGhseSdcbiAgY29tcGFueUlkOiBpbnQoXCJjb21wYW55SWRcIiksXG4gIGJyYW5kSWQyOiBpbnQoXCJicmFuZElkMlwiKSxcbiAgZGVwYXJ0bWVudElkOiBpbnQoXCJkZXBhcnRtZW50SWRcIiksXG4gIHdvcmtzcGFjZUlkOiBpbnQoXCJ3b3Jrc3BhY2VJZFwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbiAgdXBkYXRlZEF0OiB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBNaXNzaW9uID0gdHlwZW9mIG1pc3Npb25zLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE1pc3Npb24gPSB0eXBlb2YgbWlzc2lvbnMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgTWlzc2lvbiBUYXNrIFVuaXRzIChTcHJpbnQgMjogdGFzayBicmVha2Rvd24gd2l0aGluIGEgbWlzc2lvbikgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgY29uc3QgbWlzc2lvblRhc2tVbml0cyA9IG15c3FsVGFibGUoXCJtaXNzaW9uX3Rhc2tfdW5pdHNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgbWlzc2lvbklkOiBpbnQoXCJtaXNzaW9uSWRcIikubm90TnVsbCgpLFxuICBhZ2VudElkOiBpbnQoXCJhZ2VudElkXCIpLCAvLyBhc3NpZ25lZCBBSSBhZ2VudCAobnVsbCA9IHVuYXNzaWduZWQpXG4gIGxhYmVsOiB2YXJjaGFyKFwibGFiZWxcIiwgeyBsZW5ndGg6IDI1NSB9KS5ub3ROdWxsKCksXG4gIHN0YXR1czogbXlzcWxFbnVtKFwic3RhdHVzXCIsIFtcIm5vdF9zdGFydGVkXCIsIFwicnVubmluZ1wiLCBcIm5lZWRzX2lucHV0XCIsIFwicmV2aWV3XCIsIFwiYXBwcm92ZWRcIl0pLmRlZmF1bHQoXCJub3Rfc3RhcnRlZFwiKS5ub3ROdWxsKCksXG4gIHNvcnRPcmRlcjogaW50KFwic29ydE9yZGVyXCIpLmRlZmF1bHQoMCksXG4gIHRhc2tJZDogaW50KFwidGFza0lkXCIpLCAvLyBsaW5rIHRvIHRhc2tzIHRhYmxlIHdoZW4gZXhlY3V0aW9uIHN0YXJ0c1xuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIE1pc3Npb25UYXNrVW5pdCA9IHR5cGVvZiBtaXNzaW9uVGFza1VuaXRzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE1pc3Npb25UYXNrVW5pdCA9IHR5cGVvZiBtaXNzaW9uVGFza1VuaXRzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE1pc3Npb24gTWVzc2FnZXMgKFx1NUMwRFx1OEE3MVx1OEEwQVx1NjA2Rlx1NjMwMVx1NEU0NVx1NTMxNikgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgY29uc3QgbWlzc2lvbk1lc3NhZ2VzID0gbXlzcWxUYWJsZShcIm1pc3Npb25fbWVzc2FnZXNcIiwge1xuICBpZDogICAgICAgIGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIG1pc3Npb25JZDogaW50KFwibWlzc2lvbklkXCIpLm5vdE51bGwoKSxcbiAgdXNlcklkOiAgICBpbnQoXCJ1c2VySWRcIikubm90TnVsbCgpLFxuICByb2xlOiAgICAgIG15c3FsRW51bShcInJvbGVcIiwgW1widXNlclwiLCBcImFzc2lzdGFudFwiLCBcInN5c3RlbVwiXSkubm90TnVsbCgpLFxuICBjb250ZW50OiAgIGxvbmd0ZXh0KFwiY29udGVudFwiKS5ub3ROdWxsKCksXG4gIG1ldGFkYXRhOiAgdGV4dChcIm1ldGFkYXRhXCIpLFxuICBjcmVhdGVkQXQ6IGRhdGV0aW1lKFwiY3JlYXRlZEF0XCIpLm5vdE51bGwoKS5kZWZhdWx0KHNxbGBDVVJSRU5UX1RJTUVTVEFNUGApLFxufSk7XG5leHBvcnQgdHlwZSBNaXNzaW9uTWVzc2FnZSA9IHR5cGVvZiBtaXNzaW9uTWVzc2FnZXMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0TWlzc2lvbk1lc3NhZ2UgPSB0eXBlb2YgbWlzc2lvbk1lc3NhZ2VzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE1pc3Npb24gUmVzb3VyY2VzIChcdThBOUVcdTYxMEZcdTkxNERcdTVDMERcdTdENTBcdTY3OUNcdTVGRUJcdTUzRDYpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gQ29tcHV0ZWQgYXN5bmMgYWZ0ZXIgbWlzc2lvbiBjcmVhdGlvbiB2aWEgdGV4dC1lbWJlZGRpbmctMy1sYXJnZSBjb3NpbmUgc2ltaWxhcml0eVxuZXhwb3J0IGNvbnN0IG1pc3Npb25SZXNvdXJjZXMgPSBteXNxbFRhYmxlKFwibWlzc2lvbl9yZXNvdXJjZXNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgbWlzc2lvbklkOiBpbnQoXCJtaXNzaW9uSWRcIikubm90TnVsbCgpLnVuaXF1ZSgpLFxuICBzdGF0dXM6IHZhcmNoYXIoXCJzdGF0dXNcIiwgeyBsZW5ndGg6IDIwIH0pLmRlZmF1bHQoXCJwZW5kaW5nXCIpLCAvLyBwZW5kaW5nIHwgcmVhZHkgfCBlcnJvclxuICBhZ2VudHM6IGludChcImFnZW50c1wiKS5kZWZhdWx0KDApLFxuICBza2lsbHM6IGludChcInNraWxsc1wiKS5kZWZhdWx0KDApLFxuICBwcm92aWRlcnM6IGludChcInByb3ZpZGVyc1wiKS5kZWZhdWx0KDApLFxuICBza2lsbExpc3Q6IHRleHQoXCJza2lsbExpc3RcIiksICAgICAgIC8vIEpTT04gc3RyaW5nW11cbiAgcHJvdmlkZXJMaXN0OiB0ZXh0KFwicHJvdmlkZXJMaXN0XCIpLCAvLyBKU09OIHN0cmluZ1tdXG4gIHRvcEFnZW50czogdGV4dChcInRvcEFnZW50c1wiKSwgICAgICAgLy8gSlNPTjogW3tzbHVnLCBuYW1lLCB0aXRsZSwgc2NvcmV9XVxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBNaXNzaW9uUmVzb3VyY2UgPSB0eXBlb2YgbWlzc2lvblJlc291cmNlcy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRNaXNzaW9uUmVzb3VyY2UgPSB0eXBlb2YgbWlzc2lvblJlc291cmNlcy4kaW5mZXJJbnNlcnQ7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBVc2VyIFdvcmtzcGFjZXMgKFx1NzUyOFx1NjIzNlx1ODFFQVx1OEEwMlx1NURFNVx1NEY1Q1x1NTM0MCkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgY29uc3QgdXNlcldvcmtzcGFjZXMgPSBteXNxbFRhYmxlKFwidXNlcl93b3Jrc3BhY2VzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIHVzZXJJZDogaW50KFwidXNlcklkXCIpLm5vdE51bGwoKSxcbiAgd3NLZXk6IHZhcmNoYXIoXCJ3c0tleVwiLCB7IGxlbmd0aDogNjQgfSkubm90TnVsbCgpLFxuICBsYWJlbDogdmFyY2hhcihcImxhYmVsXCIsIHsgbGVuZ3RoOiA2NCB9KS5ub3ROdWxsKCksXG4gIHNvcnRPcmRlcjogaW50KFwic29ydE9yZGVyXCIpLmRlZmF1bHQoMCksXG4gIGNvbXBhbnlJZDogaW50KFwiY29tcGFueUlkXCIpLFxuICBicmFuZElkOiBpbnQoXCJicmFuZElkXCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBVc2VyV29ya3NwYWNlID0gdHlwZW9mIHVzZXJXb3Jrc3BhY2VzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydFVzZXJXb3Jrc3BhY2UgPSB0eXBlb2YgdXNlcldvcmtzcGFjZXMuJGluZmVySW5zZXJ0O1xuXG5cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE1PUyBFbnRlcnByaXNlOiBDb21wYW5pZXMgKFx1NEYwMVx1Njk2RFx1NUM2NFx1N0QxQSkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBOb3RlOiBcdTRGN0ZcdTc1MjggbW9zX2NvbXBhbmllcyBcdTUyNERcdTdEQjRcdTkwN0ZcdTUxNERcdTgyMDdcdTY1RTJcdTY3MDkgY29tcGFuaWVzIHRhYmxlIFx1ODg1RFx1N0E4MVxuZXhwb3J0IGNvbnN0IG1vc0NvbXBhbmllcyA9IG15c3FsVGFibGUoXCJtb3NfY29tcGFuaWVzXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIG5hbWU6IHZhcmNoYXIoXCJuYW1lXCIsIHsgbGVuZ3RoOiAxMjggfSkubm90TnVsbCgpLFxuICBpbmR1c3RyeTogdmFyY2hhcihcImluZHVzdHJ5XCIsIHsgbGVuZ3RoOiA2NCB9KSxcbiAgcGxhbjogbXlzcWxFbnVtKFwicGxhblwiLCBbXCJ0cmlhbFwiLCBcInN0YXJ0ZXJcIiwgXCJwcm9cIiwgXCJlbnRlcnByaXNlXCJdKS5kZWZhdWx0KFwidHJpYWxcIiksXG4gIGFnZW50V29ya3NwYWNlUGF0aDogdmFyY2hhcihcImFnZW50V29ya3NwYWNlUGF0aFwiLCB7IGxlbmd0aDogMjU1IH0pLFxuICBhZ2VudFNlc3Npb25LZXk6IHZhcmNoYXIoXCJhZ2VudFNlc3Npb25LZXlcIiwgeyBsZW5ndGg6IDEyOCB9KSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgTW9zQ29tcGFueSA9IHR5cGVvZiBtb3NDb21wYW5pZXMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0TW9zQ29tcGFueSA9IHR5cGVvZiBtb3NDb21wYW5pZXMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgTU9TIEVudGVycHJpc2U6IERlcGFydG1lbnRzIChcdTkwRThcdTk1ODApIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IG1vc0RlcGFydG1lbnRzID0gbXlzcWxUYWJsZShcIm1vc19kZXBhcnRtZW50c1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBjb21wYW55SWQ6IGludChcImNvbXBhbnlJZFwiKS5ub3ROdWxsKCksXG4gIGJyYW5kSWQ6IGludChcImJyYW5kSWRcIikubm90TnVsbCgpLFxuICBuYW1lOiB2YXJjaGFyKFwibmFtZVwiLCB7IGxlbmd0aDogNjQgfSkubm90TnVsbCgpLFxuICBoZWFkQ291bnQ6IGludChcImhlYWRDb3VudFwiKS5kZWZhdWx0KDApLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBNb3NEZXBhcnRtZW50ID0gdHlwZW9mIG1vc0RlcGFydG1lbnRzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEluc2VydE1vc0RlcGFydG1lbnQgPSB0eXBlb2YgbW9zRGVwYXJ0bWVudHMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgTU9TIEVudGVycHJpc2U6IENvbXBhbnkgQWdlbnRzIChcdTRGMDFcdTY5NkQgQUkgXHU1REU1XHU0RjVDXHU1MzQwKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjb25zdCBtb3NDb21wYW55QWdlbnRzID0gbXlzcWxUYWJsZShcIm1vc19jb21wYW55X2FnZW50c1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBjb21wYW55SWQ6IGludChcImNvbXBhbnlJZFwiKS5ub3ROdWxsKCkudW5pcXVlKCksXG4gIHdvcmtzcGFjZVBhdGg6IHZhcmNoYXIoXCJ3b3Jrc3BhY2VQYXRoXCIsIHsgbGVuZ3RoOiAyNTUgfSksXG4gIHNlc3Npb25LZXk6IHZhcmNoYXIoXCJzZXNzaW9uS2V5XCIsIHsgbGVuZ3RoOiAxMjggfSksXG4gIHNvdWxNZENvbnRlbnQ6IHRleHQoXCJzb3VsTWRDb250ZW50XCIpLFxuICBtZW1vcnlNZENvbnRlbnQ6IHRleHQoXCJtZW1vcnlNZENvbnRlbnRcIiksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG4gIHVwZGF0ZWRBdDogdGltZXN0YW1wKFwidXBkYXRlZEF0XCIpLmRlZmF1bHROb3coKS5vblVwZGF0ZU5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgTW9zQ29tcGFueUFnZW50ID0gdHlwZW9mIG1vc0NvbXBhbnlBZ2VudHMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0TW9zQ29tcGFueUFnZW50ID0gdHlwZW9mIG1vc0NvbXBhbnlBZ2VudHMuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgTWlzc2lvbiBTT1BzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IG1pc3Npb25Tb3BzID0gbXlzcWxUYWJsZShcIm1pc3Npb25fc29wc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBtaXNzaW9uSWQ6IGludChcIm1pc3Npb25JZFwiKS5ub3ROdWxsKCksXG4gIGJyYW5kSWQ6IGludChcImJyYW5kSWRcIiksXG4gIHRpdGxlOiB2YXJjaGFyKFwidGl0bGVcIiwgeyBsZW5ndGg6IDI1NSB9KS5ub3ROdWxsKCksXG4gIHZlcnNpb246IGludChcInZlcnNpb25cIikuZGVmYXVsdCgxKSxcbiAgaXNHbG9iYWw6IGludChcImlzR2xvYmFsXCIpLmRlZmF1bHQoMCksXG4gIHNvdXJjZVR5cGU6IG15c3FsRW51bShcInNvdXJjZVR5cGVcIiwgW1wiYXV0b19sZWFybmVkXCIsXCJtYW51YWxcIixcImltcG9ydGVkXCJdKS5kZWZhdWx0KFwibWFudWFsXCIpLFxuICBpbXBvcnRTb3VyY2U6IG15c3FsRW51bShcImltcG9ydFNvdXJjZVwiLCBbXCJ0ZXh0XCIsXCJwZGZcIixcInVybFwiXSksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG4gIHVwZGF0ZWRBdDogdGltZXN0YW1wKFwidXBkYXRlZEF0XCIpLmRlZmF1bHROb3coKS5vblVwZGF0ZU5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgTWlzc2lvblNvcCA9IHR5cGVvZiBtaXNzaW9uU29wcy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRNaXNzaW9uU29wID0gdHlwZW9mIG1pc3Npb25Tb3BzLiRpbmZlckluc2VydDtcblxuZXhwb3J0IGNvbnN0IG1pc3Npb25Tb3BTdGVwcyA9IG15c3FsVGFibGUoXCJtaXNzaW9uX3NvcF9zdGVwc1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBzb3BJZDogaW50KFwic29wSWRcIikubm90TnVsbCgpLFxuICBzdGVwT3JkZXI6IGludChcInN0ZXBPcmRlclwiKS5ub3ROdWxsKCksXG4gIHN0ZXBUeXBlOiBteXNxbEVudW0oXCJzdGVwVHlwZVwiLCBbXCJzZXF1ZW50aWFsXCIsXCJwYXJhbGxlbFwiLFwiY29uZGl0aW9uYWxcIl0pLmRlZmF1bHQoXCJzZXF1ZW50aWFsXCIpLFxuICBwYXJhbGxlbEdyb3VwSWQ6IHZhcmNoYXIoXCJwYXJhbGxlbEdyb3VwSWRcIiwgeyBsZW5ndGg6IDY0IH0pLFxuICBjb25kaXRpb25Kc29uOiBqc29uKFwiY29uZGl0aW9uSnNvblwiKSxcbiAgYWdlbnRTbHVnOiB2YXJjaGFyKFwiYWdlbnRTbHVnXCIsIHsgbGVuZ3RoOiA2NCB9KSxcbiAgbGFiZWw6IHZhcmNoYXIoXCJsYWJlbFwiLCB7IGxlbmd0aDogMjU1IH0pLm5vdE51bGwoKSxcbiAgcHJvbXB0U25hcHNob3Q6IHRleHQoXCJwcm9tcHRTbmFwc2hvdFwiKSxcbiAgb3V0cHV0U3VtbWFyeTogdGV4dChcIm91dHB1dFN1bW1hcnlcIiksXG4gIGR1cmF0aW9uRXN0aW1hdGU6IHZhcmNoYXIoXCJkdXJhdGlvbkVzdGltYXRlXCIsIHsgbGVuZ3RoOiAzMiB9KSxcbiAgYWJSZXN1bHQ6IG15c3FsRW51bShcImFiUmVzdWx0XCIsIFtcImFfd2luc1wiLFwiYl93aW5zXCIsXCJ0aWVcIixcInBlbmRpbmdcIl0pLmRlZmF1bHQoXCJwZW5kaW5nXCIpLFxuICBub3RlczogdGV4dChcIm5vdGVzXCIpLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBNaXNzaW9uU29wU3RlcCA9IHR5cGVvZiBtaXNzaW9uU29wU3RlcHMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0TWlzc2lvblNvcFN0ZXAgPSB0eXBlb2YgbWlzc2lvblNvcFN0ZXBzLiRpbmZlckluc2VydDtcblxuZXhwb3J0IGNvbnN0IG1pc3Npb25PdXRwdXRzID0gbXlzcWxUYWJsZShcIm1pc3Npb25fb3V0cHV0c1wiLCB7XG4gIGlkOiBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBtaXNzaW9uSWQ6IGludChcIm1pc3Npb25JZFwiKS5ub3ROdWxsKCksXG4gIGNvbnZlcnNhdGlvbklkOiBpbnQoXCJjb252ZXJzYXRpb25JZFwiKSxcbiAgbWVzc2FnZUlkOiBpbnQoXCJtZXNzYWdlSWRcIiksXG4gIHBsYXRmb3JtOiBteXNxbEVudW0oXCJwbGF0Zm9ybVwiLCBbXCJmYWNlYm9va1wiLFwiaW5zdGFncmFtXCIsXCJsaW5rZWRpblwiLFwieW91dHViZVwiLFwiZ29vZ2xlX2Fkc1wiLFwiZW1haWxcIixcInBwdFwiLFwiZG9jXCIsXCJzY3JpcHRcIixcIm90aGVyXCJdKS5kZWZhdWx0KFwib3RoZXJcIiksXG4gIG91dHB1dFR5cGU6IG15c3FsRW51bShcIm91dHB1dFR5cGVcIiwgW1wicG9zdFwiLFwic3RvcnlcIixcInJlZWxcIixcImFkX2NvcHlcIixcImVtYWlsX2h0bWxcIixcInNsaWRlXCIsXCJzY3JpcHRcIixcInByb2R1Y3RfZGVzY1wiLFwicmVwb3J0XCIsXCJvdGhlclwiXSkuZGVmYXVsdChcIm90aGVyXCIpLFxuICB0aXRsZTogdmFyY2hhcihcInRpdGxlXCIsIHsgbGVuZ3RoOiAyNTUgfSksXG4gIGNvbnRlbnQ6IGxvbmd0ZXh0KFwiY29udGVudFwiKSxcbiAgcHJldmlld0h0bWw6IGxvbmd0ZXh0KFwicHJldmlld0h0bWxcIiksXG4gIG1ldGFkYXRhOiBqc29uKFwibWV0YWRhdGFcIiksXG4gIHN0YXR1czogbXlzcWxFbnVtKFwic3RhdHVzXCIsIFtcImRyYWZ0XCIsXCJwZW5kaW5nX3Jldmlld1wiLFwiYXBwcm92ZWRcIixcInNjaGVkdWxlZFwiLFwicHVibGlzaGVkXCIsXCJhcmNoaXZlZFwiXSkuZGVmYXVsdChcImRyYWZ0XCIpLFxuICB2ZXJzaW9uOiBpbnQoXCJ2ZXJzaW9uXCIpLmRlZmF1bHQoMSksXG4gIHBhcmVudE91dHB1dElkOiBpbnQoXCJwYXJlbnRPdXRwdXRJZFwiKSxcbiAgc2NoZWR1bGVkQXQ6IHRpbWVzdGFtcChcInNjaGVkdWxlZEF0XCIpLFxuICBwdWJsaXNoZWRBdDogdGltZXN0YW1wKFwicHVibGlzaGVkQXRcIiksXG4gIGlzVXJnZW50OiBpbnQoXCJpc1VyZ2VudFwiKS5kZWZhdWx0KDApLFxuICBkZWFkbGluZUF0OiB0aW1lc3RhbXAoXCJkZWFkbGluZUF0XCIpLFxuICBiYXRjaEdyb3VwSWQ6IHZhcmNoYXIoXCJiYXRjaEdyb3VwSWRcIiwgeyBsZW5ndGg6IDY0IH0pLFxuICBjcmVhdGVkQXQ6IHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6IHRpbWVzdGFtcChcInVwZGF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkub25VcGRhdGVOb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIE1pc3Npb25PdXRwdXQgPSB0eXBlb2YgbWlzc2lvbk91dHB1dHMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0TWlzc2lvbk91dHB1dCA9IHR5cGVvZiBtaXNzaW9uT3V0cHV0cy4kaW5mZXJJbnNlcnQ7XG5cbmV4cG9ydCBjb25zdCBtaXNzaW9uS25vd2xlZGdlRmlsZXMgPSBteXNxbFRhYmxlKFwibWlzc2lvbl9rbm93bGVkZ2VfZmlsZXNcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgbWlzc2lvbklkOiBpbnQoXCJtaXNzaW9uSWRcIikubm90TnVsbCgpLFxuICBicmFuZElkOiBpbnQoXCJicmFuZElkXCIpLFxuICB1c2VySWQ6IGludChcInVzZXJJZFwiKS5ub3ROdWxsKCksXG4gIGZpbGVuYW1lOiB2YXJjaGFyKFwiZmlsZW5hbWVcIiwgeyBsZW5ndGg6IDI1NSB9KS5ub3ROdWxsKCksXG4gIG9yaWdpbmFsTmFtZTogdmFyY2hhcihcIm9yaWdpbmFsTmFtZVwiLCB7IGxlbmd0aDogMjU1IH0pLFxuICBmaWxlVHlwZTogbXlzcWxFbnVtKFwiZmlsZVR5cGVcIiwgW1wicGRmXCIsXCJkb2N4XCIsXCJ4bHN4XCIsXCJjc3ZcIixcInR4dFwiLFwidXJsXCIsXCJvdGhlclwiXSkuZGVmYXVsdChcIm90aGVyXCIpLFxuICBmaWxlVXJsOiB0ZXh0KFwiZmlsZVVybFwiKSxcbiAgZmlsZVNpemU6IGludChcImZpbGVTaXplXCIpLFxuICBjaHVua0NvdW50OiBpbnQoXCJjaHVua0NvdW50XCIpLmRlZmF1bHQoMCksXG4gIGVtYmVkZGVkQXQ6IHRpbWVzdGFtcChcImVtYmVkZGVkQXRcIiksXG4gIGVtYmVkZGluZ1N0YXR1czogbXlzcWxFbnVtKFwiZW1iZWRkaW5nU3RhdHVzXCIsIFtcInBlbmRpbmdcIixcInByb2Nlc3NpbmdcIixcImNvbXBsZXRlZFwiLFwiZmFpbGVkXCJdKS5kZWZhdWx0KFwicGVuZGluZ1wiKSxcbiAgdXNhZ2VDb3VudDogaW50KFwidXNhZ2VDb3VudFwiKS5kZWZhdWx0KDApLFxuICBhdXRvSW5qZWN0OiBpbnQoXCJhdXRvSW5qZWN0XCIpLmRlZmF1bHQoMCksXG4gIGlzRm9yU29wT25seTogaW50KFwiaXNGb3JTb3BPbmx5XCIpLmRlZmF1bHQoMCksXG4gIGlzU2Vuc2l0aXZlOiBpbnQoXCJpc1NlbnNpdGl2ZVwiKS5kZWZhdWx0KDApLFxuICBhbGxvd2VkUm9sZXM6IGpzb24oXCJhbGxvd2VkUm9sZXNcIikuJHR5cGU8c3RyaW5nW10+KCksXG4gIGNyZWF0ZWRBdDogdGltZXN0YW1wKFwiY3JlYXRlZEF0XCIpLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG59KTtcbmV4cG9ydCB0eXBlIE1pc3Npb25Lbm93bGVkZ2VGaWxlID0gdHlwZW9mIG1pc3Npb25Lbm93bGVkZ2VGaWxlcy4kaW5mZXJTZWxlY3Q7XG5leHBvcnQgdHlwZSBJbnNlcnRNaXNzaW9uS25vd2xlZGdlRmlsZSA9IHR5cGVvZiBtaXNzaW9uS25vd2xlZGdlRmlsZXMuJGluZmVySW5zZXJ0O1xuXG5leHBvcnQgY29uc3QgbWlzc2lvbktub3dsZWRnZUNodW5rcyA9IG15c3FsVGFibGUoXCJtaXNzaW9uX2tub3dsZWRnZV9jaHVua3NcIiwge1xuICBpZDogaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgZmlsZUlkOiBpbnQoXCJmaWxlSWRcIikubm90TnVsbCgpLFxuICBtaXNzaW9uSWQ6IGludChcIm1pc3Npb25JZFwiKS5ub3ROdWxsKCksXG4gIGNodW5rSW5kZXg6IGludChcImNodW5rSW5kZXhcIikubm90TnVsbCgpLFxuICBjb250ZW50OiB0ZXh0KFwiY29udGVudFwiKS5ub3ROdWxsKCksXG4gIGVtYmVkZGluZzoganNvbihcImVtYmVkZGluZ1wiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgTWlzc2lvbktub3dsZWRnZUNodW5rID0gdHlwZW9mIG1pc3Npb25Lbm93bGVkZ2VDaHVua3MuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0TWlzc2lvbktub3dsZWRnZUNodW5rID0gdHlwZW9mIG1pc3Npb25Lbm93bGVkZ2VDaHVua3MuJGluZmVySW5zZXJ0O1xuXG5leHBvcnQgY29uc3QgbWlzc2lvblJldmlld1F1ZXVlID0gbXlzcWxUYWJsZShcIm1pc3Npb25fcmV2aWV3X3F1ZXVlXCIsIHtcbiAgaWQ6IGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIG1pc3Npb25JZDogaW50KFwibWlzc2lvbklkXCIpLm5vdE51bGwoKSxcbiAgb3V0cHV0SWQ6IGludChcIm91dHB1dElkXCIpLm5vdE51bGwoKSxcbiAgcmVxdWVzdGVkQnk6IGludChcInJlcXVlc3RlZEJ5XCIpLm5vdE51bGwoKSxcbiAgcmV2aWV3VHlwZTogbXlzcWxFbnVtKFwicmV2aWV3VHlwZVwiLCBbXCJpbnRlcm5hbFwiLFwiZXh0ZXJuYWxcIixcImxlZ2FsXCIsXCJjbGllbnRcIl0pLmRlZmF1bHQoXCJpbnRlcm5hbFwiKSxcbiAgc3RhdHVzOiBteXNxbEVudW0oXCJzdGF0dXNcIiwgW1wicGVuZGluZ1wiLFwiaW5fcmV2aWV3XCIsXCJhcHByb3ZlZFwiLFwicmV2aXNpb25fcmVxdWVzdGVkXCIsXCJleHBpcmVkXCJdKS5kZWZhdWx0KFwicGVuZGluZ1wiKSxcbiAgcmV2aWV3ZXJJZHM6IGpzb24oXCJyZXZpZXdlcklkc1wiKS4kdHlwZTxudW1iZXJbXT4oKSxcbiAgZXh0ZXJuYWxUb2tlbjogdmFyY2hhcihcImV4dGVybmFsVG9rZW5cIiwgeyBsZW5ndGg6IDEyOCB9KSxcbiAgZXh0ZXJuYWxFeHBpcmVBdDogdGltZXN0YW1wKFwiZXh0ZXJuYWxFeHBpcmVBdFwiKSxcbiAgaXNVcmdlbnQ6IGludChcImlzVXJnZW50XCIpLmRlZmF1bHQoMCksXG4gIGRlYWRsaW5lQXQ6IHRpbWVzdGFtcChcImRlYWRsaW5lQXRcIiksXG4gIGZhc3RUcmFjazogaW50KFwiZmFzdFRyYWNrXCIpLmRlZmF1bHQoMCksXG4gIHJldmlzaW9uTm90ZTogdGV4dChcInJldmlzaW9uTm90ZVwiKSxcbiAgYXBwcm92ZWRBdDogdGltZXN0YW1wKFwiYXBwcm92ZWRBdFwiKSxcbiAgY3JlYXRlZEF0OiB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgTWlzc2lvblJldmlld1F1ZXVlSXRlbSA9IHR5cGVvZiBtaXNzaW9uUmV2aWV3UXVldWUuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0TWlzc2lvblJldmlld1F1ZXVlSXRlbSA9IHR5cGVvZiBtaXNzaW9uUmV2aWV3UXVldWUuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDAgU2Vzc2lvbiBFdmVudCBMb2dzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IHNlc3Npb25FdmVudExvZ3MgPSBteXNxbFRhYmxlKFwic2Vzc2lvbl9ldmVudF9sb2dzXCIsIHtcbiAgaWQ6ICAgICAgICAgICAgaW50KFwiaWRcIikuYXV0b2luY3JlbWVudCgpLnByaW1hcnlLZXkoKSxcbiAgc2Vzc2lvbklkOiAgICAgdmFyY2hhcihcInNlc3Npb25JZFwiLCB7IGxlbmd0aDogMTI4IH0pLm5vdE51bGwoKSxcbiAgdXNlcklkOiAgICAgICAgaW50KFwidXNlcklkXCIpLFxuICBhZ2VudFNsdWc6ICAgICB2YXJjaGFyKFwiYWdlbnRTbHVnXCIsIHsgbGVuZ3RoOiAyNTUgfSksXG4gIGFnZW50TmFtZTogICAgIHZhcmNoYXIoXCJhZ2VudE5hbWVcIiwgeyBsZW5ndGg6IDI1NSB9KSxcbiAgZXZlbnRUeXBlOiAgICAgbXlzcWxFbnVtKFwiZXZlbnRUeXBlXCIsIFtcInNlc3Npb25fc3RhcnRcIixcImdhdGV3YXlfY2FsbFwiLFwiZ2F0ZXdheV9mYWxsYmFja1wiLFwiZ2F0ZXdheV9lcnJvclwiLFwib3V0cHV0XCIsXCJzZXNzaW9uX2VuZFwiXSkubm90TnVsbCgpLFxuICBpc0dhdGV3YXlPazogICBpbnQoXCJpc0dhdGV3YXlPa1wiKS5kZWZhdWx0KDEpLFxuICBsYXRlbmN5TXM6ICAgICBpbnQoXCJsYXRlbmN5TXNcIiksXG4gIGNvbnRlbnRMZW5ndGg6IGludChcImNvbnRlbnRMZW5ndGhcIiksXG4gIHF1YWxpdHlTaWduYWw6IGludChcInF1YWxpdHlTaWduYWxcIiksXG4gIGVycm9yTXNnOiAgICAgIHRleHQoXCJlcnJvck1zZ1wiKSxcbiAgbWV0YWRhdGE6ICAgICAganNvbihcIm1ldGFkYXRhXCIpLFxuICBjcmVhdGVkQXQ6ICAgICB0aW1lc3RhbXAoXCJjcmVhdGVkQXRcIikuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuZXhwb3J0IHR5cGUgU2Vzc2lvbkV2ZW50TG9nID0gdHlwZW9mIHNlc3Npb25FdmVudExvZ3MuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0U2Vzc2lvbkV2ZW50TG9nID0gdHlwZW9mIHNlc3Npb25FdmVudExvZ3MuJGluZmVySW5zZXJ0O1xuXG4vLyBcdTI1MDBcdTI1MDAgQXJ0aWZhY3RzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IGFydGlmYWN0cyA9IG15c3FsVGFibGUoXCJhcnRpZmFjdHNcIiwge1xuICBpZDogICAgICAgICAgICAgICBpbnQoXCJpZFwiKS5hdXRvaW5jcmVtZW50KCkucHJpbWFyeUtleSgpLFxuICBtaXNzaW9uSWQ6ICAgICAgICBpbnQoXCJtaXNzaW9uSWRcIiksXG4gIHNlc3Npb25JZDogICAgICAgIHZhcmNoYXIoXCJzZXNzaW9uSWRcIiwgeyBsZW5ndGg6IDEyOCB9KSxcbiAgdHlwZTogICAgICAgICAgICAgbXlzcWxFbnVtKFwidHlwZVwiLCBbXCJjYW1wYWlnbl9icmllZlwiLFwiYXVkaWVuY2VfbWF0cml4XCIsXCJtZXNzYWdpbmdfYW5nbGVzXCIsXCJjb3B5X2RyYWZ0c1wiLFwiY3JlYXRpdmVfZGlyZWN0aW9uc1wiLFwibGF1bmNoX2NoZWNrbGlzdFwiLFwicG9zaXRpb25pbmdcIixcIm90aGVyXCJdKS5kZWZhdWx0KFwib3RoZXJcIiksXG4gIGxhYmVsOiAgICAgICAgICAgIHZhcmNoYXIoXCJsYWJlbFwiLCB7IGxlbmd0aDogMjU1IH0pLFxuICBjb250ZW50OiAgICAgICAgICBsb25ndGV4dChcImNvbnRlbnRcIiksXG4gIHZlcnNpb246ICAgICAgICAgIGludChcInZlcnNpb25cIikuZGVmYXVsdCgxKSxcbiAgc3RhdHVzOiAgICAgICAgICAgbXlzcWxFbnVtKFwic3RhdHVzXCIsIFtcImRyYWZ0XCIsXCJwZW5kaW5nX3Jldmlld1wiLFwiYXBwcm92ZWRcIixcIm5lZWRzX3JldmlzaW9uXCIsXCJleHBvcnRlZFwiXSkuZGVmYXVsdChcImRyYWZ0XCIpLFxuICBjcmVhdGVkQnlBZ2VudElkOiBpbnQoXCJjcmVhdGVkQnlBZ2VudElkXCIpLFxuICBjcmVhdGVkQnlVc2VySWQ6ICBpbnQoXCJjcmVhdGVkQnlVc2VySWRcIiksXG4gIGNyZWF0ZWRBdDogICAgICAgIHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICB1cGRhdGVkQXQ6ICAgICAgICB0aW1lc3RhbXAoXCJ1cGRhdGVkQXRcIikuZGVmYXVsdE5vdygpLm9uVXBkYXRlTm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBBcnRpZmFjdCA9IHR5cGVvZiBhcnRpZmFjdHMuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0QXJ0aWZhY3QgPSB0eXBlb2YgYXJ0aWZhY3RzLiRpbmZlckluc2VydDtcblxuLy8gXHUyNTAwXHUyNTAwIEFydGlmYWN0IFJldmlld3MgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgY29uc3QgYXJ0aWZhY3RSZXZpZXdzID0gbXlzcWxUYWJsZShcImFydGlmYWN0X3Jldmlld3NcIiwge1xuICBpZDogICAgICAgICAgIGludChcImlkXCIpLmF1dG9pbmNyZW1lbnQoKS5wcmltYXJ5S2V5KCksXG4gIGFydGlmYWN0SWQ6ICAgaW50KFwiYXJ0aWZhY3RJZFwiKS5ub3ROdWxsKCksXG4gIHN0YXR1czogICAgICAgbXlzcWxFbnVtKFwic3RhdHVzXCIsIFtcImRyYWZ0XCIsXCJwZW5kaW5nXCIsXCJhcHByb3ZlZFwiLFwibmVlZHNfcmV2aXNpb25cIixcImV4cG9ydGVkXCJdKS5kZWZhdWx0KFwiZHJhZnRcIiksXG4gIHJldmlld2VyTm90ZTogdGV4dChcInJldmlld2VyTm90ZVwiKSxcbiAgcmV2aWV3ZWRCeTogICBpbnQoXCJyZXZpZXdlZEJ5XCIpLFxuICBjcmVhdGVkQXQ6ICAgIHRpbWVzdGFtcChcImNyZWF0ZWRBdFwiKS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5leHBvcnQgdHlwZSBBcnRpZmFjdFJldmlldyA9IHR5cGVvZiBhcnRpZmFjdFJldmlld3MuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW5zZXJ0QXJ0aWZhY3RSZXZpZXcg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
