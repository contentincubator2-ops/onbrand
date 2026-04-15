// STABLE-1: Drizzle Kit config for migration support
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema:  "./drizzle/schema.ts",
  out:     "./drizzle/migrations",
  dbCredentials: {
    host:     process.env.DB_HOST!,
    user:     process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
  },
});
