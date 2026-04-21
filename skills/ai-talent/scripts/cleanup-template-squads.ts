/**
 * cleanup-template-squads.ts
 * 停用所有「模板型」squads（workspace IS NULL 的 477 個）
 *
 * 這些 squads 是舊版「產業 × 功能」矩陣格式，如：
 *   sq-brand-awareness-tech, squad-content-text-startup, squad-smb-facebook-ads...
 *
 * 保留策略：所有已有 workspace 欄位的方法論型 squads 不受影響。
 * 操作：軟刪除（is_active = 0），保留資料可復原。
 *
 * Usage: npm run db:cleanup-templates
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const pool = createPool({
    host: process.env.DB_HOST!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: { rejectUnauthorized: false },
    charset: "utf8mb4",
  });

  const conn = await pool.getConnection();
  try {
    // Preview: list squads that will be deactivated
    const [rows] = await conn.execute(
      `SELECT id, slug, name FROM squads
       WHERE is_active = 1 AND workspace IS NULL
       ORDER BY id ASC
       LIMIT 500`
    ) as any[];
    const squads = rows as any[];

    console.log(`\n將停用 ${squads.length} 個模板型 squads（workspace IS NULL）：\n`);
    for (const s of squads) {
      console.log(`  [${s.id}] ${s.slug}`);
    }

    // Count total
    const [countRows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM squads WHERE is_active = 1 AND workspace IS NULL`
    ) as any[];
    const total = (countRows as any[])[0]?.cnt ?? 0;
    console.log(`\n合計：${total} 個\n`);

    // Soft-delete
    const [result] = await conn.execute(
      `UPDATE squads
       SET is_active = 0, updated_at = NOW()
       WHERE is_active = 1 AND workspace IS NULL`
    ) as any[];
    console.log(`✅ 已停用 ${(result as any).affectedRows} 個模板型 squads (is_active → 0)`);

    // Summary of remaining
    const [remaining] = await conn.execute(
      `SELECT workspace, COUNT(*) as cnt
       FROM squads
       WHERE is_active = 1
       GROUP BY workspace
       ORDER BY cnt DESC`
    ) as any[];
    console.log(`\n剩餘 active squads（按 workspace）：`);
    for (const r of remaining as any[]) {
      const ws = Buffer.isBuffer(r.workspace)
        ? r.workspace.toString("utf8")
        : (r.workspace ?? "NULL");
      console.log(`  ${ws.padEnd(30)} ${r.cnt} squads`);
    }

    const [totalActive] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM squads WHERE is_active = 1`
    ) as any[];
    console.log(`\n✅ 剩餘 active squads 總計：${(totalActive as any[])[0]?.cnt}`);

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[cleanup-templates] ERROR:", err.message ?? err);
  process.exit(1);
});
