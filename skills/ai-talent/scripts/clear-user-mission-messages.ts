/**
 * clear-user-mission-messages.ts
 *
 * One-time admin script: find user by name/email containing "cj"
 * and delete ALL their mission_messages records.
 *
 * Usage (run on server inside /home/azureuser/marketing-os):
 *   npx tsx skills/ai-talent/scripts/clear-user-mission-messages.ts
 *
 * Or with explicit env:
 *   DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
 *   npx tsx skills/ai-talent/scripts/clear-user-mission-messages.ts
 */

import "dotenv/config";
import { createPool } from "mysql2/promise";

const TARGET = process.argv[2] ?? "cj"; // pass name/email fragment as arg

async function main() {
  const pool = createPool({
    host:     process.env.DB_HOST!,
    user:     process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: { rejectUnauthorized: false },
  });

  const conn = await pool.getConnection();

  try {
    // 1. Find matching users
    const [users] = await conn.execute(
      `SELECT id, name, email FROM users WHERE name LIKE ? OR email LIKE ? LIMIT 10`,
      [`%${TARGET}%`, `%${TARGET}%`]
    ) as any;

    if (!users.length) {
      console.log(`❌ No user found matching "${TARGET}"`);
      return;
    }

    console.log(`\n✅ Found ${users.length} user(s) matching "${TARGET}":`);
    for (const u of users) {
      console.log(`   id=${u.id}  name="${u.name}"  email="${u.email}"`);
    }

    // 2. For each matched user, count + delete mission_messages
    for (const u of users) {
      const [countRows] = await conn.execute(
        `SELECT COUNT(*) AS cnt FROM mission_messages WHERE userId = ?`,
        [u.id]
      ) as any;
      const cnt = countRows[0]?.cnt ?? 0;
      console.log(`\n   User ${u.id} (${u.name}) has ${cnt} mission_messages`);

      if (cnt > 0) {
        await conn.execute(
          `DELETE FROM mission_messages WHERE userId = ?`,
          [u.id]
        );
        console.log(`   🗑️  Deleted ${cnt} mission_messages for user ${u.id}`);
      } else {
        console.log(`   ✨ Already clean — nothing to delete`);
      }
    }

    console.log("\n✅ Done.\n");
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
