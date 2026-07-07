import mysql from 'mysql2/promise';

/**
 * 本地 MySQL 連線池（行銷 agents 資料庫）
 * 此 DB 存放從 Azure MySQL 同步過來的行銷相關 agents（17,000+ 筆）
 * 來源: ytcreator-ai-server.mysql.database.azure.com/sowork_db
 * 同步時間: 2026-04-12
 *
 * SEC-B-02 (2026-05-04): hardcoded "MUST_SET_LOCAL_DB_PASSWORD" fallback removed.
 * LOCAL_DB_PASSWORD must be set via .env (see admin-write-required-env.yml).
 */
const password = process.env.LOCAL_DB_PASSWORD;
if (!password) {
  throw new Error(
    "[localDb] LOCAL_DB_PASSWORD env var is required. " +
    "Run admin-write-required-env.yml to populate it.",
  );
}

const localPool = mysql.createPool({
  host: process.env.LOCAL_DB_HOST || 'localhost',
  port: parseInt(process.env.LOCAL_DB_PORT || '3306'),
  user: process.env.LOCAL_DB_USER || 'mos_user',
  password,
  database: process.env.LOCAL_DB_NAME || 'mos_db',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
});

export default localPool;
