import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  longtext,
  timestamp,
  varchar,
  decimal,
  json,
} from "drizzle-orm/mysql-core";

//  Users 
// NOTE: This table already exists in sowork_db with extended columns.
// We map only the columns used by AI Marketer; extra columns are ignored by Drizzle.


//  AI Agents
export const agents = mysqlTable("agents", {
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
  knowledgeSources: json("knowledgeSources").$type<string[]>(),
  skills: json("skills").$type<string[]>(),
  caseStudies: json("caseStudies").$type<{ title: string; description: string; result: string }[]>(),
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
  creatorUserId: int("creatorUserId"),   // null = platform-owned agent
  reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "rejected"]).default("approved"),
  reviewNote: text("reviewNote"),        // admin rejection reason
  hireCount: int("hireCount").default(0),       // total times hired by others
  taskEarnCount: int("taskEarnCount").default(0), // total tasks completed earning credits
  totalEarned: int("totalEarned").default(0),    // total credits earned by creator
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;

//  Brands
export const brands = mysqlTable("brands", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  websiteUrl: text("websiteUrl"),
  facebookUrl: text("facebookUrl"),
  logoUrl: text("logoUrl"),
  // Scraped / analyzed data
  tagline: text("tagline"),
  targetAudience: text("targetAudience"),
  brandVoice: text("brandVoice"),
  mainProducts: json("mainProducts").$type<string[]>(),
  keywords: json("keywords").$type<string[]>(),
  // SoWork positioning analysis result (JSON blob)
  soworkAnalysis: json("soworkAnalysis").$type<Record<string, unknown>>(),
  // Launch & contact info (for AI employees to auto-fill press releases, time-sensitive content)
  launchDate: varchar("launchDate", { length: 20 }),  // e.g. "2026-03-13"
  contactName: varchar("contactName", { length: 64 }),
  contactEmail: varchar("contactEmail", { length: 128 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  // Source tracking
  dataSource: mysqlEnum("dataSource", ["manual", "website", "facebook", "sowork"]).default("manual"),
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Brand = typeof brands.$inferSelect;
export type InsertBrand = typeof brands.$inferInsert;

//  Tasks
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  agentId: int("agentId").notNull(),
  brandId: int("brandId"),  // Which brand this task belongs to (null = no brand)
  parentTaskId: int("parentTaskId"),  // For Agent2Agent: upstream task that produced the input
  forwardNote: text("forwardNote"),  // Boss's instruction when forwarding task to another agent
  conversationId: int("conversationId"),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  taskType: varchar("taskType", { length: 64 }),
  status: mysqlEnum("status", ["pending", "in_progress", "review", "completed", "cancelled"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal"),
  dueDate: timestamp("dueDate"),
  isRecurring: boolean("isRecurring").default(false),
  recurringSchedule: varchar("recurringSchedule", { length: 64 }),  // 'daily' | 'weekly' | 'biweekly' | 'monthly'
  clientName: varchar("clientName", { length: 256 }),  // Client name for agency workflows
  referenceUrls: text("referenceUrls"),  // JSON array of reference URLs/notes
  completedAt: timestamp("completedAt"),
  result: text("result"),
  attachmentUrl: text("attachmentUrl"),
  // JSON: { triggered: boolean, workflowName: string, createdTaskCount: number, createdTaskIds: number[] }
  triggeredWorkflows: json("triggeredWorkflows"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

//  Task Executions (任務執行紀錄) 
// Each time a task is started, a new execution record is created.
// This allows tracking history, retries, and viewing past outputs.
export const taskExecutions = mysqlTable("task_executions", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TaskExecution = typeof taskExecutions.$inferSelect;
export type InsertTaskExecution = typeof taskExecutions.$inferInsert;

// -- Task Workflows (Automatic Triggers) --------------------------------------
// 自動工作流：任務完成後自動觸發下游任務
// 例如：「競品分析」完成 → 自動觸發「Facebook 貼文撰寫」
export const taskWorkflows = mysqlTable("task_workflows", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TaskWorkflow = typeof taskWorkflows.$inferSelect;
export type InsertTaskWorkflow = typeof taskWorkflows.$inferInsert;

//  Agent Learnings (AI 員工個人學習記錄) 
// 每次任務完成後自動記錄，用戶反饋後更新評分
// isPrivate=true: 月租/團隊型，學習記錄屬品牌私有，只注入同品牌任務
// isPrivate=false: 任務型，學習記錄為公共資產，可注入所有用戶的任務
export const agentLearnings = mysqlTable("agent_learnings", {
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
  userRating: int("userRating"),  // 1-5 星
  userFeedback: text("userFeedback"),  // 文字反饋
  feedbackAt: timestamp("feedbackAt"),
  // 品牌上下文快照（任務執行時的品牌資訊）
  brandContext: json("brandContext"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AgentLearning = typeof agentLearnings.$inferSelect;
export type InsertAgentLearning = typeof agentLearnings.$inferInsert;

//  Subscriptions (Hired Agents)
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  agentId: int("agentId").notNull(),
  brandId: int("brandId"),  // Which brand this AI is hired for (null = all brands)
  plan: mysqlEnum("plan", ["per_task", "monthly", "team"]).notNull(),
  status: mysqlEnum("status", ["active", "paused", "cancelled", "expired"]).default("active").notNull(),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 128 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 128 }),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

//  User Credits Wallet (用戶點數錢包) 
// Tracks each user's monthly credits balance and usage
export const userCredits = mysqlTable("user_credits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  // Monthly plan credits (reset each billing cycle)
  planCredits: int("planCredits").default(0).notNull(),       // credits included in current plan
  usedCredits: int("usedCredits").default(0).notNull(),       // credits consumed this cycle
  // Extra purchased credits (do NOT reset monthly)
  extraCredits: int("extraCredits").default(0).notNull(),
  // Current plan tier
  planTier: mysqlEnum("planTier", ["community", "integration", "enterprise", "trial"]).default("trial").notNull(),
  // Billing cycle
  cycleStart: timestamp("cycleStart"),
  cycleEnd: timestamp("cycleEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserCredits = typeof userCredits.$inferSelect;
export type InsertUserCredits = typeof userCredits.$inferInsert;

//  Credits Usage Log (點數消耗記錄) 
// Every credit deduction is logged here for transparency and audit
export const creditsUsageLog = mysqlTable("credits_usage_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  agentId: int("agentId"),              // which AI agent was involved
  // What triggered this deduction
  actionType: mysqlEnum("actionType", [
    "adopt_proposal",        // 採用 AI 員工主動提案
    "adopt_report",          // 採用競品/品牌健康報告
    "adopt_schedule",        // 採用排程建議
    "adopt_draft",           // 採用自動草稿
    "adopt_collaboration",   // 採用跨員工協作成果
    "manual_task",           // 用戶主動指派任務（月租包含，記錄但不扣費）
    "chat_message",          // 對話（月租包含，記錄但不扣費）
    "extra_purchase",        // 加購點數（正數，增加）
    "plan_renewal",          // 方案續訂（正數，重置）
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
  proposalId: int("proposalId"),       // links to agent_proposals table
  description: text("description"),    // human-readable summary
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CreditsUsageLog = typeof creditsUsageLog.$inferSelect;
export type InsertCreditsUsageLog = typeof creditsUsageLog.$inferInsert;

//  Enterprise Credits Pool (企業版共用點數池) 
// Workspace owners can maintain a shared credits pool for their team.
// Members draw from this pool when they consume credits.
// The pool is separate from the owner's personal credits wallet.
export const enterpriseCreditsPool = mysqlTable("enterprise_credits_pool", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull().unique(),   // workspace owner's userId
  totalCredits: int("totalCredits").default(0).notNull(),   // total credits added
  usedCredits: int("usedCredits").default(0).notNull(),     // total credits consumed by members
  // Per-member allocation cap (0 = unlimited from pool)
  memberMonthlyLimit: int("memberMonthlyLimit").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EnterpriseCreditsPool = typeof enterpriseCreditsPool.$inferSelect;
export type InsertEnterpriseCreditsPool = typeof enterpriseCreditsPool.$inferInsert;

//  Enterprise Workspace Members (企業版共用工作區成員) 
// Represents real users who have been invited to share a workspace.
// The workspace owner is identified by ownerId.
// Members can access owner's brands, AI agents, and brand knowledge base.
export const enterpriseMembers = mysqlTable("enterprise_members", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull(),            // workspace owner's userId
  memberId: int("memberId"),                    // invited user's userId (null until accepted)
  email: varchar("email", { length: 320 }).notNull(), // invited email
  name: varchar("name", { length: 128 }),       // display name (filled after accept)
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  status: mysqlEnum("status", ["pending", "active", "removed"]).default("pending").notNull(),
  inviteToken: varchar("inviteToken", { length: 128 }).unique(),
  inviteExpiresAt: int("inviteExpiresAt"),      // Unix timestamp (seconds)
  joinedAt: timestamp("joinedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EnterpriseMember = typeof enterpriseMembers.$inferSelect;
export type InsertEnterpriseMember = typeof enterpriseMembers.$inferInsert;

// ─── NEW: Token Usage Logs (原始 Token 帳本) ──────────────────────────────────
// Records every LLM API call with provider, tokens used, and cost.
// Used for billing, auditing, and per-user cost analysis.
export const tokenUsageLogs = mysqlTable("token_usage_logs", {
  id: varchar("id", { length: 36 }).primaryKey(), // UUID
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TokenUsageLog = typeof tokenUsageLogs.$inferSelect;
export type InsertTokenUsageLog = typeof tokenUsageLogs.$inferInsert;

// ─── NEW: User API Keys (用戶識別碼) ─────────────────────────────────────────
// Users can generate API keys to authenticate calls from external tools.
// Key format: 'sw-xxxxxxxxxxxxxxxx' (prefix 'sw-' for SoWork).
export const userApiKeys = mysqlTable("user_api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  apiKey: varchar("apiKey", { length: 64 }).notNull().unique(), // 'sw-xxxxxxxxxxxxxxxx'
  label: varchar("label", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  lastUsed: timestamp("lastUsed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UserApiKey = typeof userApiKeys.$inferSelect;
export type InsertUserApiKey = typeof userApiKeys.$inferInsert;

// ─── NEW: Tenant Markets (多市場設定) ─────────────────────────────────────────
// Defines per-tenant market configurations for multi-region deployments.
// Supports language, compliance flags (e.g. GDPR), and default market selection.
export const tenantMarkets = mysqlTable("tenant_markets", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  marketId: varchar("marketId", { length: 30 }).notNull(), // 'Taiwan','Germany','Singapore'...
  contentLanguage: varchar("contentLanguage", { length: 10 }).notNull(), // 'zh-TW','de-DE'...
  isDefault: boolean("isDefault").default(false).notNull(),
  complianceFlags: json("complianceFlags").$type<string[]>(), // ['GDPR']
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TenantMarket = typeof tenantMarkets.$inferSelect;
export type InsertTenantMarket = typeof tenantMarkets.$inferInsert;

// ─── Enterprise Credits Allocation (成員月度配額) ───────────────────────────
export const enterpriseCreditsAllocation = mysqlTable("enterprise_credits_allocation", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  memberId: int("memberId").notNull(),
  allocatedCredits: int("allocatedCredits").default(0).notNull(),
  usedCredits: int("usedCredits").default(0).notNull(),
  monthlyLimit: int("monthlyLimit").default(0).notNull(), // 0 = use pool default
  cycleStart: timestamp("cycleStart"),
  cycleEnd: timestamp("cycleEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EnterpriseCreditsAllocation = typeof enterpriseCreditsAllocation.$inferSelect;
export type InsertEnterpriseCreditsAllocation = typeof enterpriseCreditsAllocation.$inferInsert;

// ─── Enterprise Credits Transactions (企業池流水帳) ───────────────────────────
export const enterpriseCreditsTx = mysqlTable("enterprise_credits_tx", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  memberId: int("memberId"),
  type: mysqlEnum("type", ["topup", "deduct", "adjust"]).notNull(),
  amount: int("amount").notNull(), // positive=add, negative=deduct
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EnterpriseCreditsTx = typeof enterpriseCreditsTx.$inferSelect;
export type InsertEnterpriseCreditsTx = typeof enterpriseCreditsTx.$inferInsert;

// ─── Notifications (站內通知) ──────────────────────────────────────────────────
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  taskId: int("taskId"),
  agentId: int("agentId"),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Notification Preferences (通知偏好設定) ──────────────────────────────────
export const notificationPreferences = mysqlTable("notification_preferences", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferences.$inferInsert;

// ─── Agent Memories (Sprint 3: user-defined training per agent) ────────────
export const agentMemories = mysqlTable("agent_memories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  agentSlug: varchar("agentSlug", { length: 64 }).notNull(),
  brandId: int("brandId"),
  memoryType: mysqlEnum("memoryType", ["preference", "forbidden", "audience", "style", "other"]).default("other"),
  content: text("content").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AgentMemory = typeof agentMemories.$inferSelect;
export type InsertAgentMemory = typeof agentMemories.$inferInsert;

// ─── Brand Integrations (Sprint 3: platform connections per brand) ──────────
export const brandIntegrations = mysqlTable("brand_integrations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  brandId: int("brandId"),
  integrationType: varchar("integrationType", { length: 50 }).notNull(), // 'facebook_pages' | 'google_ads' | 'instagram'
  status: mysqlEnum("status", ["connected", "disconnected", "error"]).default("disconnected"),
  accessToken: text("accessToken"),                    // SEC-3: encrypt/decrypt via server/_core/encryption.ts (encrypt() before write, decrypt() after read)
  selectedResourceId: varchar("selectedResourceId", { length: 255 }),
  authorizedResources: json("authorizedResources"),
  connectedAt: timestamp("connectedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BrandIntegration = typeof brandIntegrations.$inferSelect;
export type InsertBrandIntegration = typeof brandIntegrations.$inferInsert;
