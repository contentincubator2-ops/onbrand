/**
 * Database connection — Drizzle ORM over MySQL2
 * Lazy-initialised singleton so cold starts don't block imports.
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export async function getDb(): Promise<ReturnType<typeof drizzle<typeof schema>>> {
  if (db) return db;

  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST     ?? "ytcreator-ai-server.mysql.database.azure.com",
    user:     process.env.DB_USER     ?? "openclaw",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME     ?? "sowork_db",
    ssl: { rejectUnauthorized: false },
  });

  db = drizzle(connection, { schema, mode: "default" });
  return db;
}
