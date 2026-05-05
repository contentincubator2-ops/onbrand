/**
 * Database connection — Drizzle ORM over MySQL2
 *
 * ✅ All data lives in mos_db (localhost VM).
 *    getDb()       → mos_db (primary)
 *    getSoworkDb() → alias of getDb() (sowork_db dependency fully removed)
 *
 * Required env vars (non-secret defaults retained for the public ones):
 *   LOCAL_DB_HOST / LOCAL_DB_USER / LOCAL_DB_NAME — fall back to safe defaults
 *   LOCAL_DB_PASSWORD — REQUIRED, no fallback (SEC-B-02 2026-05-04)
 */

import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { sql } from "drizzle-orm";
import * as schema from "../drizzle/schema";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

let db: DB | null = null;
let pool: Pool | null = null;

export async function getDb(): Promise<DB> {
  if (db) return db;

  // SEC-B-02 (2026-05-04): hardcoded "mos_secure_2026" fallback removed.
  // Anyone reading the public source repo previously had the prod DB
  // password in plain text. Now we fail-fast at first connection if env
  // is misconfigured, instead of silently using the published string.
  const password = process.env.LOCAL_DB_PASSWORD;
  if (!password) {
    throw new Error(
      "LOCAL_DB_PASSWORD env var is required. Run admin-write-required-env.yml " +
      "to populate it from secrets, or set it in skills/ai-talent/.env locally.",
    );
  }

  pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || "mos_user",
    password,
    database: process.env.LOCAL_DB_NAME     || "mos_db",
    connectionLimit:      10,
    waitForConnections:   true,
    queueLimit:           0,
    connectTimeout:       10_000,
    idleTimeout:          60_000,
    enableKeepAlive:      true,
    keepAliveInitialDelay: 10_000,
  });

  // 2026-05-04: drizzle-orm bumped to 0.45.2 (CVE GHSA-gpj5-g38j-94v9 fix).
  // Two copies of drizzle-orm exist in node_modules (one nested under
  // drizzle-kit), so the structural types disagree even though runtime is
  // identical. Cast through DB resolves the spurious "Two different types"
  // error at the assignment site without changing behavior.
  db = drizzle(pool, { schema, mode: "default" }) as unknown as DB;
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
