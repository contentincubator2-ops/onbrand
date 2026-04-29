/**
 * create-user.ts — admin script to provision a new user account.
 *
 *   USAGE: EMAIL=foo@bar.com PASSWORD=secret NAME="Foo" npx tsx scripts/create-user.ts
 *
 * Creates a user with:
 *   - bcrypt-hashed password (matching server/auth/passwordUtils.ts)
 *   - isActive = 1 (skips email verification — admin-provisioned accounts
 *     can login immediately)
 *   - role = 'user'
 *   - 1000 signup-bonus credits
 *
 * Idempotent: if email already exists, prints existing row and exits 0
 * without touching it (use scripts/reset-user-password.ts to change pwd).
 */
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 16);

async function main() {
  const email = process.env.EMAIL?.trim().toLowerCase();
  const password = process.env.PASSWORD;
  const name = process.env.NAME?.trim() || (email ? email.split("@")[0] : "User");

  if (!email || !password) {
    console.error("ERROR: EMAIL and PASSWORD env vars are required.");
    process.exit(2);
  }
  if (password.length < 8) {
    console.error("ERROR: PASSWORD must be at least 8 characters.");
    process.exit(2);
  }

  const pool = getPool();

  // ── Pre-check: email already exists? ────────────────────────────────────
  const [existing]: any = await pool.query(
    `SELECT id, openId, email, name, isActive, role, createdAt FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  if (existing.length > 0) {
    console.log("⚠  user already exists, skipping creation:");
    console.table(existing[0]);
    await closePool();
    return;
  }

  // ── Hash password (bcrypt rounds=10, matches passwordUtils.ts) ──────────
  const passwordHash = await bcrypt.hash(password, 10);
  const openId = nanoid();

  await pool.execute(
    `INSERT INTO users
       (openId, email, name, passwordHash, authMethod, isActive, role, credits, activatedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'password', 1, 'user', 1000, NOW(), NOW(), NOW())`,
    [openId, email, name, passwordHash],
  );

  const [created]: any = await pool.query(
    `SELECT id, openId, email, name, isActive, role, credits, createdAt
     FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  console.log("✅ user created:");
  console.table(created[0]);
  console.log(`\n→ Login at: https://marketing-os.sowork.ai`);
  console.log(`→ Email:    ${email}`);
  console.log(`→ Password: (set via PASSWORD env var, not echoed)`);

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
