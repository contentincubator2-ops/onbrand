// STABLE-1: Drizzle Kit config for migration support
// All data lives in mos_db (localhost). LOCAL_DB_* env vars take priority.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema:  "./drizzle/schema.ts",
  out:     "./drizzle/migrations",
  dbCredentials: {
    host:     process.env.LOCAL_DB_HOST     || process.env.DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || process.env.DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     || process.env.DB_NAME     || "mos_db",
  },
});
