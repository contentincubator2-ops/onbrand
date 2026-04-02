/**
 * Database connection — Drizzle ORM over MySQL2
 * Uses connection pool for concurrency + graceful shutdown support.
 * Env vars are required; missing vars throw at startup.
 */

import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { sql } from "drizzle-orm";
import * as schema from "../drizzle/schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

let db: DB | null = null;
let pool: Pool | null = null;

export async function getDb(): Promise<DB> {
  if (db) return db;

  // SEC-1: Require all env vars — no hardcoded fallbacks allowed
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!host || !user || !password || !database) {
    throw new Error(
      "[db] Missing required env: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME"
    );
  }

  // SEC-2: Use connection pool instead of single connection
  pool = createPool({
    host,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: true }, // enforce SSL cert verification in production
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: 10_000,
    idleTimeout: 60_000,
  });

  db = drizzle(pool, { schema, mode: "default" });
  return db;
}

// DEBT-2: Health check — returns true if DB is reachable
export async function pingDb(): Promise<boolean> {
  try {
    const database = await getDb();
    await database.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

// DEBT-2: Graceful shutdown — drain pool before process exits
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    db = null;
    pool = null;
  }
}
