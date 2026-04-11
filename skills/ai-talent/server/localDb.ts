import mysql from 'mysql2/promise';

/**
 * 本地 MySQL 連線池（行銷 agents 資料庫）
 * 此 DB 存放從 Azure MySQL 同步過來的行銷相關 agents（17,000+ 筆）
 * 來源: ytcreator-ai-server.mysql.database.azure.com/sowork_db
 * 同步時間: 2026-04-12
 */
const localPool = mysql.createPool({
  host: process.env.LOCAL_DB_HOST || 'localhost',
  port: parseInt(process.env.LOCAL_DB_PORT || '3306'),
  user: process.env.LOCAL_DB_USER || 'mos_user',
  password: process.env.LOCAL_DB_PASSWORD || 'mos_secure_2026',
  database: process.env.LOCAL_DB_NAME || 'mos_db',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
});

export default localPool;
