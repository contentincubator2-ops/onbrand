/**
 * Database connection — Drizzle ORM over MySQL2
 *
 * ✅ All data lives in mos_db (localhost VM).
 *    getDb()       → mos_db (primary, via LOCAL_DB_* env or hardcoded mos defaults)
 *    getSoworkDb() → alias of getDb() (sowork_db dependency fully removed)
 *
 * LOCAL_DB_HOST / LOCAL_DB_USER / LOCAL_DB_PASSWORD / LOCAL_DB_NAME
 *   → default to localhost / mos_user / mos_secure_2026 / mos_db
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

  pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     || "mos_db",
    connectionLimit:      10,
    waitForConnections:   true,
    queueLimit:           0,
    connectTimeout:       10_000,
    idleTimeout:          60_000,
    enableKeepAlive:      true,
    keepAliveInitialDelay: 10_000,
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

// getSoworkDb — now an alias for getDb() (mos_db).
// sowork_db Azure dependency is fully removed.
export async function getSoworkDb(): Promise<DB> {
  return getDb();
}

export async function pingSoworkDb(): Promise<boolean> {
  return pingDb();
}

export function getPool(): Pool | null { return pool; }

// DEBT-2: Graceful shutdown — drain pool before process exits
export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
  db = null;
  pool = null;
}
