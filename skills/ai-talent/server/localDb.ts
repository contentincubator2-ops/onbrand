import mysql from 'mysql2/promise';

/**
 * 本地 MySQL 連線池（行銷 agents 資料庫）
 * 此 DB 存放從 Azure MySQL 同步過來的行銷相關 agents（17,000+ 筆）
 * 連線資訊完全由環境變數提供；請參考 .env.example 與
 * docs/runbooks/secret-rotation.md。
 *
 * 注意：此模組在測試 / CI 匯入時不得拋錯。若環境變數缺失，會在第一次實際
 * 建立連線時由 mysql2 抛出錯誤 — 不在模組載入時中斷 import graph。
 */
const localPool = mysql.createPool({
  host:     process.env.LOCAL_DB_HOST || 'localhost',
  port:     parseInt(process.env.LOCAL_DB_PORT || '3306'),
  user:     process.env.LOCAL_DB_USER || '',
  password: process.env.LOCAL_DB_PASSWORD || '',
  database: process.env.LOCAL_DB_NAME || 'mos_db',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
});

export default localPool;
