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


export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isActive: int("isActive").default(0).notNull(),
  credits: int("credits").default(1000).notNull(),
  hasUnlimitedCredits: int("hasUnlimitedCredits").default(0).notNull(),
  // Enterprise fields (added in MOS migration)
  companyId: int("companyId"),
  departmentId: int("departmentId"),
  orgRole: mysqlEnum("orgRole", ["owner", "admin", "member"]).default("member"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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
export const brands = mysqlTable("enterprise_brands", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
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

// ─── Chat Messages (對話歷史持久化) ───────────────────────────────────────────
export const chatMessages = mysqlTable("chat_messages", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

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

// ─── Video Jobs ──────────────────────────────────────────────────────────────

export const videoJobs = mysqlTable("video_jobs", {
  id:           int("id").primaryKey().autoincrement(),
  userId:       int("userId").notNull(),
  brandId:      int("brandId"),
  topic:        varchar("topic", { length: 500 }).notNull(),
  platform:     mysqlEnum("platform", ["youtube", "instagram", "tiktok", "facebook"]).notNull().default("youtube"),
  language:     mysqlEnum("language", ["zh-TW", "zh-CN", "en"]).notNull().default("zh-TW"),
  duration:     int("duration").notNull().default(60),           // seconds
  style:        varchar("style", { length: 50 }).notNull().default("professional"),
  status:       mysqlEnum("status", ["pending", "processing", "completed", "failed"]).notNull().default("pending"),
  progress:     int("progress").notNull().default(0),            // 0–100
  script:       json("script"),                                  // VideoScript object
  videoUrl:     text("videoUrl"),                                // Final MP4 URL
  thumbnailUrl: text("thumbnailUrl"),                            // Preview image
  falRequestId: varchar("falRequestId", { length: 255 }),        // fal.ai request tracking
  errorMessage: text("errorMessage"),
  createdAt:    timestamp("createdAt").defaultNow().notNull(),
  updatedAt:    timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VideoJob = typeof videoJobs.$inferSelect;
export type InsertVideoJob = typeof videoJobs.$inferInsert;

// ─── Missions (Sprint 2: workspace mission context) ──────────────────────────
// Each mission represents a specific campaign/project within a workspace channel.
// Workspace (e.g. Facebook, LinkedIn) > Mission > Task Units
export const missions = mysqlTable("missions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  brandId: int("brandId"),
  workspace: varchar("workspace", { length: 50 }).notNull(), // 'facebook' | 'linkedin' | 'youtube' | 'pr' | 'event' | 'instore'
  title: varchar("title", { length: 255 }).notNull(),
  objective: text("objective"),
  audience: text("audience"),
  offer: text("offer"),
  successMetrics: text("successMetrics"),
  constraints: text("constraints"),
  methodology: text("methodology"), // e.g. "Brand Positioning v2"
  squadSlug: varchar("squadSlug", { length: 64 }),     // 綁定的 squad slug
  welcomeMessage: text("welcomeMessage"),               // 點任務時顯示的歡迎訊息
  status: mysqlEnum("status", ["active", "completed", "archived"]).default("active").notNull(),
  isRecurring: boolean("isRecurring").default(false).notNull(),
  recurringSchedule: varchar("recurringSchedule", { length: 64 }),  // 'daily' | 'weekly' | 'biweekly' | 'monthly'
  companyId: int("companyId"),
  brandId2: int("brandId2"),
  departmentId: int("departmentId"),
  workspaceId: int("workspaceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Mission = typeof missions.$inferSelect;
export type InsertMission = typeof missions.$inferInsert;

// ─── Mission Task Units (Sprint 2: task breakdown within a mission) ──────────
export const missionTaskUnits = mysqlTable("mission_task_units", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  agentId: int("agentId"), // assigned AI agent (null = unassigned)
  label: varchar("label", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["not_started", "running", "needs_input", "review", "approved"]).default("not_started").notNull(),
  sortOrder: int("sortOrder").default(0),
  taskId: int("taskId"), // link to tasks table when execution starts
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MissionTaskUnit = typeof missionTaskUnits.$inferSelect;
export type InsertMissionTaskUnit = typeof missionTaskUnits.$inferInsert;

// ─── User Workspaces (用戶自訂工作區) ─────────────────────────────────────────
export const userWorkspaces = mysqlTable("user_workspaces", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  wsKey: varchar("wsKey", { length: 64 }).notNull(),
  label: varchar("label", { length: 64 }).notNull(),
  sortOrder: int("sortOrder").default(0),
  companyId: int("companyId"),
  brandId: int("brandId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UserWorkspace = typeof userWorkspaces.$inferSelect;
export type InsertUserWorkspace = typeof userWorkspaces.$inferInsert;



// ─── MOS Enterprise: Companies (企業層級) ─────────────────────────────────────
// Note: 使用 mos_companies 前綴避免與既有 companies table 衝突
export const mosCompanies = mysqlTable("mos_companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  industry: varchar("industry", { length: 64 }),
  plan: mysqlEnum("plan", ["trial", "starter", "pro", "enterprise"]).default("trial"),
  agentWorkspacePath: varchar("agentWorkspacePath", { length: 255 }),
  agentSessionKey: varchar("agentSessionKey", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MosCompany = typeof mosCompanies.$inferSelect;
export type InsertMosCompany = typeof mosCompanies.$inferInsert;

// ─── MOS Enterprise: Departments (部門) ──────────────────────────────────────
export const mosDepartments = mysqlTable("mos_departments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  brandId: int("brandId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  headCount: int("headCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MosDepartment = typeof mosDepartments.$inferSelect;
export type InsertMosDepartment = typeof mosDepartments.$inferInsert;

// ─── MOS Enterprise: Company Agents (企業 AI 工作區) ─────────────────────────
export const mosCompanyAgents = mysqlTable("mos_company_agents", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().unique(),
  workspacePath: varchar("workspacePath", { length: 255 }),
  sessionKey: varchar("sessionKey", { length: 128 }),
  soulMdContent: text("soulMdContent"),
  memoryMdContent: text("memoryMdContent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MosCompanyAgent = typeof mosCompanyAgents.$inferSelect;
export type InsertMosCompanyAgent = typeof mosCompanyAgents.$inferInsert;

// ─── Mission SOPs ────────────────────────────────────────────────────────────
export const missionSops = mysqlTable("mission_sops", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  brandId: int("brandId"),
  title: varchar("title", { length: 255 }).notNull(),
  version: int("version").default(1),
  isGlobal: int("isGlobal").default(0),
  sourceType: mysqlEnum("sourceType", ["auto_learned","manual","imported"]).default("manual"),
  importSource: mysqlEnum("importSource", ["text","pdf","url"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MissionSop = typeof missionSops.$inferSelect;
export type InsertMissionSop = typeof missionSops.$inferInsert;

export const missionSopSteps = mysqlTable("mission_sop_steps", {
  id: int("id").autoincrement().primaryKey(),
  sopId: int("sopId").notNull(),
  stepOrder: int("stepOrder").notNull(),
  stepType: mysqlEnum("stepType", ["sequential","parallel","conditional"]).default("sequential"),
  parallelGroupId: varchar("parallelGroupId", { length: 64 }),
  conditionJson: json("conditionJson"),
  agentSlug: varchar("agentSlug", { length: 64 }),
  label: varchar("label", { length: 255 }).notNull(),
  promptSnapshot: text("promptSnapshot"),
  outputSummary: text("outputSummary"),
  durationEstimate: varchar("durationEstimate", { length: 32 }),
  abResult: mysqlEnum("abResult", ["a_wins","b_wins","tie","pending"]).default("pending"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MissionSopStep = typeof missionSopSteps.$inferSelect;
export type InsertMissionSopStep = typeof missionSopSteps.$inferInsert;

export const missionOutputs = mysqlTable("mission_outputs", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  conversationId: int("conversationId"),
  messageId: int("messageId"),
  platform: mysqlEnum("platform", ["facebook","instagram","linkedin","youtube","google_ads","email","ppt","doc","script","other"]).default("other"),
  outputType: mysqlEnum("outputType", ["post","story","reel","ad_copy","email_html","slide","script","product_desc","report","other"]).default("other"),
  title: varchar("title", { length: 255 }),
  content: longtext("content"),
  previewHtml: longtext("previewHtml"),
  metadata: json("metadata"),
  status: mysqlEnum("status", ["draft","pending_review","approved","scheduled","published","archived"]).default("draft"),
  version: int("version").default(1),
  parentOutputId: int("parentOutputId"),
  scheduledAt: timestamp("scheduledAt"),
  publishedAt: timestamp("publishedAt"),
  isUrgent: int("isUrgent").default(0),
  deadlineAt: timestamp("deadlineAt"),
  batchGroupId: varchar("batchGroupId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MissionOutput = typeof missionOutputs.$inferSelect;
export type InsertMissionOutput = typeof missionOutputs.$inferInsert;

export const missionKnowledgeFiles = mysqlTable("mission_knowledge_files", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  brandId: int("brandId"),
  userId: int("userId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalName: varchar("originalName", { length: 255 }),
  fileType: mysqlEnum("fileType", ["pdf","docx","xlsx","csv","txt","url","other"]).default("other"),
  fileUrl: text("fileUrl"),
  fileSize: int("fileSize"),
  chunkCount: int("chunkCount").default(0),
  embeddedAt: timestamp("embeddedAt"),
  embeddingStatus: mysqlEnum("embeddingStatus", ["pending","processing","completed","failed"]).default("pending"),
  usageCount: int("usageCount").default(0),
  autoInject: int("autoInject").default(0),
  isForSopOnly: int("isForSopOnly").default(0),
  isSensitive: int("isSensitive").default(0),
  allowedRoles: json("allowedRoles").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MissionKnowledgeFile = typeof missionKnowledgeFiles.$inferSelect;
export type InsertMissionKnowledgeFile = typeof missionKnowledgeFiles.$inferInsert;

export const missionKnowledgeChunks = mysqlTable("mission_knowledge_chunks", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  missionId: int("missionId").notNull(),
  chunkIndex: int("chunkIndex").notNull(),
  content: text("content").notNull(),
  embedding: json("embedding"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MissionKnowledgeChunk = typeof missionKnowledgeChunks.$inferSelect;
export type InsertMissionKnowledgeChunk = typeof missionKnowledgeChunks.$inferInsert;

export const missionReviewQueue = mysqlTable("mission_review_queue", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  outputId: int("outputId").notNull(),
  requestedBy: int("requestedBy").notNull(),
  reviewType: mysqlEnum("reviewType", ["internal","external","legal","client"]).default("internal"),
  status: mysqlEnum("status", ["pending","in_review","approved","revision_requested","expired"]).default("pending"),
  reviewerIds: json("reviewerIds").$type<number[]>(),
  externalToken: varchar("externalToken", { length: 128 }),
  externalExpireAt: timestamp("externalExpireAt"),
  isUrgent: int("isUrgent").default(0),
  deadlineAt: timestamp("deadlineAt"),
  fastTrack: int("fastTrack").default(0),
  revisionNote: text("revisionNote"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MissionReviewQueueItem = typeof missionReviewQueue.$inferSelect;
export type InsertMissionReviewQueueItem = typeof missionReviewQueue.$inferInsert;
