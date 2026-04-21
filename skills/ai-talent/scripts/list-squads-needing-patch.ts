/**
 * list-squads-needing-patch.ts
 * 列出所有 workspace IS NULL 的 squads，按 slug 前綴分組
 * 輸出讓我們可以逐類別補齊
 */
import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const pool = createPool({
    host: process.env.DB_HOST!, user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!, database: process.env.DB_NAME!,
    ssl: { rejectUnauthorized: false }, charset: "utf8mb4",
  });
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT id, slug, name, methodology, workspace,
              JSON_LENGTH(agents) as agent_count,
              JSON_LENGTH(tags)   as tag_count
       FROM squads
       WHERE is_active = 1 AND workspace IS NULL
       ORDER BY id ASC`
    ) as any[];
    const squads = rows as any[];

    console.log(`\n待補 workspace 的 squads: ${squads.length} 個\n`);
    console.log("slug\t\t\t\t\tname\t\t\t\tagents\ttags");
    console.log("─".repeat(100));
    for (const s of squads) {
      const slug  = (s.slug ?? "").padEnd(40);
      const name  = (s.name ?? "").padEnd(30);
      console.log(`${slug}${name}\t${s.agent_count ?? 0}\t${s.tag_count ?? 0}`);
    }

    // 摘要：按 slug 前綴分組
    const prefixMap: Record<string, number> = {};
    for (const s of squads) {
      const prefix = (s.slug as string).split("-").slice(0, 2).join("-");
      prefixMap[prefix] = (prefixMap[prefix] ?? 0) + 1;
    }
    console.log("\n\nSlug 前綴分佈：");
    Object.entries(prefixMap).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
      console.log(`  ${k.padEnd(30)} ${v} squads`);
    });
  } finally {
    conn.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
