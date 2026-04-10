/**
 * Shared Drizzle schema for sowork_db.agents + agent_knowledge_base
 * Single source of truth — import from here, not from agentMatcher or agentRouter.
 */

import {
  mysqlTable,
  int,
  varchar,
  text,
  decimal,
  boolean,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

export const soworkAgents = mysqlTable("agents", {
  id:           int("id").primaryKey(),
  slug:         varchar("slug", { length: 64 }).notNull(),
  name:         varchar("name", { length: 64 }).notNull(),
  title:        varchar("title", { length: 128 }).notNull(),
  layer:        mysqlEnum("layer", ["strategy", "execution", "training"]).notNull(),
  specialty:    text("specialty"),
  bio:          text("bio"),
  rating:       decimal("rating", { precision: 3, scale: 2 }),
  hireCount:    int("hireCount").default(0),
  pricePerTask: decimal("pricePerTask", { precision: 10, scale: 2 }),
  priceMonthly: decimal("priceMonthly", { precision: 10, scale: 2 }),
  isAvailable:  boolean("isAvailable").default(true),
  workspace:    varchar("workspace", { length: 32 }),  // facebook | linkedin | youtube | pr | event | instore
});

export const agentKnowledgeBase = mysqlTable("agent_knowledge_base", {
  id:       int("id").primaryKey(),
  agentId:  int("agentId").notNull(),
  type:     varchar("type", { length: 50 }),
  content:  text("content"),
  isActive: boolean("isActive").default(true),
});
