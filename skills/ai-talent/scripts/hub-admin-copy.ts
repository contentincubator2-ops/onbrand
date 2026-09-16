/**
 * Sales Hub demo — reuse an existing dev account as the demo's HQ login.
 *
 *   HUB_ADMIN_COPY_EMAIL=sowork@sowork.tw tsx scripts/hub-admin-copy.ts
 *
 * 2026-09-16 (CJ「use the sowork@sowork.tw password in dev」): the demo has its
 * own database, so the account is copied from mos_db on the same MySQL server.
 * The copy is a single INSERT … SELECT / UPDATE … JOIN, so the password hash
 * never enters this process and is never logged. Re-running re-syncs the hash,
 * so a password change on dev carries over on the next deploy.
 */
import "../server/bootstrap-env";

const email = process.env.HUB_ADMIN_COPY_EMAIL?.trim().toLowerCase();
const sourceDb = process.env.HUB_ADMIN_SOURCE_DB || "mos_db";
if (!email) {
  console.log("[hub-admin-copy] HUB_ADMIN_COPY_EMAIL not set — skipped");
  process.exit(0);
}
if (!/^[A-Za-z0-9_]+$/.test(sourceDb)) throw new Error("invalid source database name");

const { default: localPool } = await import("../server/localDb");
const [[target]]: any = await localPool.execute(`SELECT DATABASE() db`);
if (target.db === sourceDb) throw new Error("demo database and source database are the same — refusing");

const [srcRows]: any = await localPool.execute(
  `SELECT id, role, isActive, passwordHash IS NOT NULL AS hasPassword FROM \`${sourceDb}\`.users WHERE email = ? LIMIT 1`,
  [email],
);
if (!srcRows.length) {
  console.log(`[hub-admin-copy] ${email} not found in ${sourceDb} — skipped`);
  await localPool.end();
  process.exit(0);
}

// Columns both tables share (the demo schema was cloned from mos_db, but be safe).
const [cols]: any = await localPool.execute(
  `SELECT t.COLUMN_NAME c FROM information_schema.COLUMNS t
     JOIN information_schema.COLUMNS s ON s.COLUMN_NAME = t.COLUMN_NAME AND s.TABLE_SCHEMA = ? AND s.TABLE_NAME = 'users'
    WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = 'users' AND t.COLUMN_NAME <> 'id'
    ORDER BY t.ORDINAL_POSITION`,
  [sourceDb],
);
const list = cols.map((r: any) => `\`${r.c}\``).join(", ");

const [existing]: any = await localPool.execute(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
if (existing.length) {
  await localPool.execute(
    `UPDATE users d JOIN \`${sourceDb}\`.users s ON s.email = d.email
        SET d.passwordHash = s.passwordHash, d.authMethod = s.authMethod, d.isActive = 1, d.role = 'admin'
      WHERE d.email = ?`,
    [email],
  );
  console.log(`[hub-admin-copy] re-synced ${email} (demo id ${existing[0].id})`);
} else {
  await localPool.execute(`INSERT INTO users (${list}) SELECT ${list} FROM \`${sourceDb}\`.users WHERE email = ?`, [email]);
  await localPool.execute(`UPDATE users SET isActive = 1, role = 'admin' WHERE email = ?`, [email]);
  console.log(`[hub-admin-copy] copied ${email} from ${sourceDb}`);
}
console.log(`[hub-admin-copy] source account: role=${srcRows[0].role}, active=${srcRows[0].isActive}, has password login=${srcRows[0].hasPassword ? "yes" : "no"}`);

await localPool.end();
process.exit(0);
