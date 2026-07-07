/**
 * squad-builder / db.ts
 *
 * Thin wrapper around mysql2 pool. All squad-builder modules share
 * a single connection pool via `getPool()`.
 */

import { createPool, Pool } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    _pool = createPool({
      host:
        process.env.LOCAL_DB_HOST || process.env.DB_HOST || "localhost",
      port: parseInt(process.env.LOCAL_DB_PORT || "3306"),
      user: process.env.LOCAL_DB_USER || process.env.DB_USER || "mos_user",
      password:
        process.env.LOCAL_DB_PASSWORD ||
        process.env.DB_PASSWORD ||
        "MUST_SET_LOCAL_DB_PASSWORD",
      database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
      charset: "utf8mb4",
      connectionLimit: 5,
    });
  }
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
