/**
 * Sales Hub demo — ensure the HQ admin login exists in the demo database.
 *
 *   HUB_ADMIN_EMAIL=... HUB_ADMIN_PASSWORD=... tsx scripts/hub-admin.ts
 *
 * Idempotent: creates the user, or resets the password / role on re-run.
 * The demo DB is separate from mos_db, so OnBrand accounts don't exist here.
 */
import "../server/bootstrap-env";

const email = process.env.HUB_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.HUB_ADMIN_PASSWORD;
if (!email || !password) {
  console.log("[hub-admin] HUB_ADMIN_EMAIL / HUB_ADMIN_PASSWORD not set — skipped");
  process.exit(0);
}

const { default: localPool } = await import("../server/localDb");
const { hashPassword } = await import("../server/platform/auth/passwordUtils");
const { nanoid } = await import("nanoid");

const hash = await hashPassword(password);
const [rows]: any = await localPool.execute(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
if (rows.length) {
  await localPool.execute(`UPDATE users SET passwordHash = ?, role = 'admin', isActive = 1 WHERE id = ?`, [hash, rows[0].id]);
  console.log(`[hub-admin] updated ${email}`);
} else {
  await localPool.execute(
    `INSERT INTO users (openId, name, email, passwordHash, authMethod, isActive, credits, role)
     VALUES (?, 'HQ Admin', ?, ?, 'password', 1, 100000, 'admin')`,
    [nanoid(16), email, hash],
  );
  console.log(`[hub-admin] created ${email}`);
}

// Keep the admin out of the trial-expiry redirect for the length of the show.
const [cols]: any = await localPool.execute(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
     AND COLUMN_NAME IN ('planCode', 'planStatus')`,
);
const names = new Set(cols.map((c: any) => c.COLUMN_NAME));
if (names.has("planCode")) await localPool.execute(`UPDATE users SET planCode = 'enterprise' WHERE email = ?`, [email]);
if (names.has("planStatus")) await localPool.execute(`UPDATE users SET planStatus = 'active' WHERE email = ?`, [email]);

await localPool.end();
process.exit(0);
