CREATE TABLE `agent_learnings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`userId` int NOT NULL,
	`brandId` int,
	`taskId` int,
	`subscriptionPlan` enum('per_task','monthly','team') NOT NULL,
	`isPrivate` boolean NOT NULL DEFAULT false,
	`taskTitle` varchar(255) NOT NULL,
	`taskDescription` text,
	`taskType` varchar(64),
	`outputSummary` text,
	`fullOutput` longtext,
	`userRating` int,
	`userFeedback` text,
	`feedbackAt` timestamp,
	`brandContext` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_learnings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_memories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentSlug` varchar(64) NOT NULL,
	`brandId` int,
	`memoryType` enum('preference','forbidden','audience','style','other') DEFAULT 'other',
	`content` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(64) NOT NULL,
	`englishName` varchar(64),
	`title` varchar(128) NOT NULL,
	`layer` enum('strategy','execution','training') NOT NULL,
	`avatarUrl` text,
	`coverUrl` text,
	`bio` text,
	`specialty` text,
	`knowledgeSources` json,
	`skills` json,
	`caseStudies` json,
	`priceMonthly` decimal(10,2),
	`pricePerTask` decimal(10,2),
	`rating` decimal(3,2) DEFAULT '5.00',
	`reviewCount` int DEFAULT 0,
	`taskCount` int DEFAULT 0,
	`isAvailable` boolean DEFAULT true,
	`isFeatured` boolean DEFAULT false,
	`sortOrder` int DEFAULT 0,
	`industries` text,
	`experienceDetail` text,
	`methodology` text,
	`creatorUserId` int,
	`reviewStatus` enum('pending','approved','rejected') DEFAULT 'approved',
	`reviewNote` text,
	`hireCount` int DEFAULT 0,
	`taskEarnCount` int DEFAULT 0,
	`totalEarned` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agents_id` PRIMARY KEY(`id`),
	CONSTRAINT `agents_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `artifact_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artifactId` int NOT NULL,
	`status` enum('draft','pending','approved','needs_revision','exported') DEFAULT 'draft',
	`reviewerNote` text,
	`reviewedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `artifact_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int,
	`sessionId` varchar(128),
	`type` enum('campaign_brief','audience_matrix','messaging_angles','copy_drafts','creative_directions','launch_checklist','positioning','other') DEFAULT 'other',
	`label` varchar(255),
	`content` longtext,
	`version` int DEFAULT 1,
	`status` enum('draft','pending_review','approved','needs_revision','exported') DEFAULT 'draft',
	`createdByAgentId` int,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `brand_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`brandId` int,
	`integrationType` varchar(50) NOT NULL,
	`status` enum('connected','disconnected','error') DEFAULT 'disconnected',
	`accessToken` text,
	`selectedResourceId` varchar(255),
	`authorizedResources` json,
	`connectedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `brand_integrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`name` varchar(255) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`industry` varchar(64),
	`website` text,
	`socialLinks` json,
	`description` text,
	`logoUrl` text,
	`onboardingStep` int DEFAULT 0,
	`positioningStatus` enum('pending','in_progress','completed') DEFAULT 'pending',
	`positioningSummary` text,
	`positioningReport` json,
	`createdBy` int NOT NULL,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`tagline` text,
	`targetAudience` text,
	`brandVoice` text,
	`soworkAnalysis` json,
	`isDefault` boolean DEFAULT false,
	CONSTRAINT `brands_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`brandId` int,
	`missionId` int,
	`conversationTitle` varchar(100),
	`role` varchar(10) NOT NULL,
	`content` text NOT NULL,
	`taskId` int,
	`companyId` int,
	`departmentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `credits_usage_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentId` int,
	`actionType` enum('adopt_proposal','adopt_report','adopt_schedule','adopt_draft','adopt_collaboration','manual_task','chat_message','extra_purchase','plan_renewal') NOT NULL,
	`creditsAmount` int NOT NULL,
	`baseCredits` int,
	`knowledgeDepthFactor` decimal(4,2),
	`instructionComplexityFactor` decimal(4,2),
	`outputScaleFactor` decimal(4,2),
	`ragQueryCredits` int DEFAULT 0,
	`randomVariation` decimal(5,2),
	`inputTokens` int,
	`outputTokens` int,
	`taskId` int,
	`conversationId` int,
	`proposalId` int,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credits_usage_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `enterprise_credits_allocation` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`memberId` int NOT NULL,
	`allocatedCredits` int NOT NULL DEFAULT 0,
	`usedCredits` int NOT NULL DEFAULT 0,
	`monthlyLimit` int NOT NULL DEFAULT 0,
	`cycleStart` timestamp,
	`cycleEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enterprise_credits_allocation_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `enterprise_credits_pool` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`totalCredits` int NOT NULL DEFAULT 0,
	`usedCredits` int NOT NULL DEFAULT 0,
	`memberMonthlyLimit` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enterprise_credits_pool_id` PRIMARY KEY(`id`),
	CONSTRAINT `enterprise_credits_pool_ownerId_unique` UNIQUE(`ownerId`)
);
--> statement-breakpoint
CREATE TABLE `enterprise_credits_tx` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`memberId` int,
	`type` enum('topup','deduct','adjust') NOT NULL,
	`amount` int NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `enterprise_credits_tx_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `enterprise_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`memberId` int,
	`email` varchar(320) NOT NULL,
	`name` varchar(128),
	`role` enum('admin','member') NOT NULL DEFAULT 'member',
	`status` enum('pending','active','removed') NOT NULL DEFAULT 'pending',
	`inviteToken` varchar(128),
	`inviteExpiresAt` int,
	`joinedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enterprise_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `enterprise_members_inviteToken_unique` UNIQUE(`inviteToken`)
);
--> statement-breakpoint
CREATE TABLE `mission_knowledge_chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`missionId` int NOT NULL,
	`chunkIndex` int NOT NULL,
	`content` text NOT NULL,
	`embedding` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mission_knowledge_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mission_knowledge_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`brandId` int,
	`userId` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`originalName` varchar(255),
	`fileType` enum('pdf','docx','xlsx','csv','txt','url','other') DEFAULT 'other',
	`fileUrl` text,
	`fileSize` int,
	`chunkCount` int DEFAULT 0,
	`embeddedAt` timestamp,
	`embeddingStatus` enum('pending','processing','completed','failed') DEFAULT 'pending',
	`usageCount` int DEFAULT 0,
	`autoInject` int DEFAULT 0,
	`isForSopOnly` int DEFAULT 0,
	`isSensitive` int DEFAULT 0,
	`allowedRoles` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mission_knowledge_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mission_outputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`conversationId` int,
	`messageId` int,
	`platform` enum('facebook','instagram','linkedin','youtube','google_ads','email','ppt','doc','script','other') DEFAULT 'other',
	`outputType` enum('post','story','reel','ad_copy','email_html','slide','script','product_desc','report','other') DEFAULT 'other',
	`title` varchar(255),
	`content` longtext,
	`previewHtml` longtext,
	`metadata` json,
	`status` enum('draft','pending_review','approved','scheduled','published','archived') DEFAULT 'draft',
	`version` int DEFAULT 1,
	`parentOutputId` int,
	`scheduledAt` timestamp,
	`publishedAt` timestamp,
	`isUrgent` int DEFAULT 0,
	`deadlineAt` timestamp,
	`batchGroupId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mission_outputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mission_resources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`status` varchar(20) DEFAULT 'pending',
	`agents` int DEFAULT 0,
	`skills` int DEFAULT 0,
	`providers` int DEFAULT 0,
	`skillList` text,
	`providerList` text,
	`topAgents` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mission_resources_id` PRIMARY KEY(`id`),
	CONSTRAINT `mission_resources_missionId_unique` UNIQUE(`missionId`)
);
--> statement-breakpoint
CREATE TABLE `mission_review_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`outputId` int NOT NULL,
	`requestedBy` int NOT NULL,
	`reviewType` enum('internal','external','legal','client') DEFAULT 'internal',
	`status` enum('pending','in_review','approved','revision_requested','expired') DEFAULT 'pending',
	`reviewerIds` json,
	`externalToken` varchar(128),
	`externalExpireAt` timestamp,
	`isUrgent` int DEFAULT 0,
	`deadlineAt` timestamp,
	`fastTrack` int DEFAULT 0,
	`revisionNote` text,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mission_review_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mission_sop_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sopId` int NOT NULL,
	`stepOrder` int NOT NULL,
	`stepType` enum('sequential','parallel','conditional') DEFAULT 'sequential',
	`parallelGroupId` varchar(64),
	`conditionJson` json,
	`agentSlug` varchar(64),
	`label` varchar(255) NOT NULL,
	`promptSnapshot` text,
	`outputSummary` text,
	`durationEstimate` varchar(32),
	`abResult` enum('a_wins','b_wins','tie','pending') DEFAULT 'pending',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mission_sop_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mission_sops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`brandId` int,
	`title` varchar(255) NOT NULL,
	`version` int DEFAULT 1,
	`isGlobal` int DEFAULT 0,
	`sourceType` enum('auto_learned','manual','imported') DEFAULT 'manual',
	`importSource` enum('text','pdf','url'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mission_sops_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mission_task_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`agentId` int,
	`label` varchar(255) NOT NULL,
	`status` enum('not_started','running','needs_input','review','approved') NOT NULL DEFAULT 'not_started',
	`sortOrder` int DEFAULT 0,
	`taskId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mission_task_units_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `missions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`brandId` int,
	`workspace` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`objective` text,
	`audience` text,
	`offer` text,
	`successMetrics` text,
	`constraints` text,
	`methodology` text,
	`description` text,
	`squadSlug` varchar(64),
	`welcomeMessage` text,
	`status` enum('inactive','active','completed','archived') NOT NULL DEFAULT 'inactive',
	`isRecurring` boolean NOT NULL DEFAULT false,
	`recurringSchedule` varchar(64),
	`companyId` int,
	`brandId2` int,
	`departmentId` int,
	`workspaceId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `missions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mos_companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`industry` varchar(64),
	`plan` enum('trial','starter','pro','enterprise') DEFAULT 'trial',
	`agentWorkspacePath` varchar(255),
	`agentSessionKey` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mos_companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mos_company_agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`workspacePath` varchar(255),
	`sessionKey` varchar(128),
	`soulMdContent` text,
	`memoryMdContent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mos_company_agents_id` PRIMARY KEY(`id`),
	CONSTRAINT `mos_company_agents_companyId_unique` UNIQUE(`companyId`)
);
--> statement-breakpoint
CREATE TABLE `mos_departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`brandId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`headCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mos_departments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`inAppEnabled` boolean NOT NULL DEFAULT true,
	`emailEnabled` boolean NOT NULL DEFAULT false,
	`lineEnabled` boolean NOT NULL DEFAULT false,
	`lineToken` varchar(255),
	`telegramEnabled` boolean NOT NULL DEFAULT false,
	`telegramBotToken` varchar(255),
	`telegramChatId` varchar(100),
	`whatsappEnabled` boolean NOT NULL DEFAULT false,
	`whatsappWebhookUrl` varchar(500),
	`notifyOnTaskCompleted` boolean NOT NULL DEFAULT true,
	`notifyOnTaskFailed` boolean NOT NULL DEFAULT true,
	`notifyOnTaskStarted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_preferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text,
	`taskId` int,
	`agentId` int,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session_event_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(128) NOT NULL,
	`userId` int,
	`agentSlug` varchar(255),
	`agentName` varchar(255),
	`eventType` enum('session_start','gateway_call','gateway_fallback','gateway_error','output','session_end') NOT NULL,
	`isGatewayOk` int DEFAULT 1,
	`latencyMs` int,
	`contentLength` int,
	`qualitySignal` int,
	`errorMsg` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `session_event_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentId` int NOT NULL,
	`brandId` int,
	`plan` enum('per_task','monthly','team') NOT NULL,
	`status` enum('active','paused','cancelled','expired') NOT NULL DEFAULT 'active',
	`stripeSubscriptionId` varchar(128),
	`stripeCustomerId` varchar(128),
	`currentPeriodStart` timestamp,
	`currentPeriodEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`userId` int NOT NULL,
	`agentId` int NOT NULL,
	`status` enum('running','completed','failed','cancelled') NOT NULL DEFAULT 'running',
	`prompt` text,
	`output` longtext,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`durationMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_workflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`brandId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`triggerAgentSlug` varchar(128),
	`triggerTaskType` varchar(128),
	`steps` json NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`triggerCount` int NOT NULL DEFAULT 0,
	`lastTriggeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_workflows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentId` int NOT NULL,
	`brandId` int,
	`parentTaskId` int,
	`forwardNote` text,
	`conversationId` int,
	`title` varchar(256) NOT NULL,
	`description` text,
	`taskType` varchar(64),
	`status` enum('pending','in_progress','review','completed','cancelled') NOT NULL DEFAULT 'pending',
	`priority` enum('low','normal','high','urgent') DEFAULT 'normal',
	`dueDate` timestamp,
	`isRecurring` boolean DEFAULT false,
	`recurringSchedule` varchar(64),
	`clientName` varchar(256),
	`referenceUrls` text,
	`completedAt` timestamp,
	`result` text,
	`attachmentUrl` text,
	`triggeredWorkflows` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_markets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`marketId` varchar(30) NOT NULL,
	`contentLanguage` varchar(10) NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`complianceFlags` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_markets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `token_usage_logs` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`userApiKey` varchar(64) NOT NULL,
	`tenantId` int,
	`taskId` int,
	`agentId` int,
	`actionType` varchar(50) NOT NULL,
	`provider` enum('openai','zhipu','qwen','perplexity','google','cohere','forge') NOT NULL,
	`model` varchar(80) NOT NULL,
	`promptTokens` int NOT NULL DEFAULT 0,
	`completionTokens` int NOT NULL DEFAULT 0,
	`totalTokens` int NOT NULL DEFAULT 0,
	`rawCostUsd` decimal(10,6) NOT NULL DEFAULT '0',
	`markupFactor` decimal(5,2) NOT NULL DEFAULT '5.0',
	`creditsCharged` int NOT NULL DEFAULT 0,
	`latencyMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `token_usage_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`apiKey` varchar(64) NOT NULL,
	`label` varchar(100),
	`isActive` boolean NOT NULL DEFAULT true,
	`lastUsed` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_api_keys_apiKey_unique` UNIQUE(`apiKey`)
);
--> statement-breakpoint
CREATE TABLE `user_credits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`planCredits` int NOT NULL DEFAULT 0,
	`usedCredits` int NOT NULL DEFAULT 0,
	`extraCredits` int NOT NULL DEFAULT 0,
	`planTier` enum('community','integration','enterprise','trial') NOT NULL DEFAULT 'trial',
	`cycleStart` timestamp,
	`cycleEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_credits_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_credits_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `user_workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`wsKey` varchar(64) NOT NULL,
	`label` varchar(64) NOT NULL,
	`sortOrder` int DEFAULT 0,
	`companyId` int,
	`brandId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_workspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`isActive` int NOT NULL DEFAULT 0,
	`credits` int NOT NULL DEFAULT 1000,
	`hasUnlimitedCredits` int NOT NULL DEFAULT 0,
	`companyId` int,
	`departmentId` int,
	`orgRole` enum('owner','admin','member') DEFAULT 'member',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `video_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`brandId` int,
	`topic` varchar(500) NOT NULL,
	`platform` enum('youtube','instagram','tiktok','facebook') NOT NULL DEFAULT 'youtube',
	`language` enum('zh-TW','zh-CN','en') NOT NULL DEFAULT 'zh-TW',
	`duration` int NOT NULL DEFAULT 60,
	`style` varchar(50) NOT NULL DEFAULT 'professional',
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`progress` int NOT NULL DEFAULT 0,
	`script` json,
	`videoUrl` text,
	`thumbnailUrl` text,
	`falRequestId` varchar(255),
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_jobs_id` PRIMARY KEY(`id`)
);
