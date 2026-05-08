/**
 * usersDb.ts — User authentication database operations
 * Handles user CRUD, email verification, password reset, and authentication queries.
 */

import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { users } from "../../drizzle/schema";
import type { DB } from "../db";
import { hashPassword, verifyPassword } from "./passwordUtils";

// Email verification expiry: 24 hours
export const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Password reset expiry: 1 hour
export const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

/**
 * Delete user by id — used by registration cleanup when verification
 * email send fails (so the user can re-register without "已註冊" block).
 */
export async function deleteUserById(db: DB, id: number): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}

/**
 * Get user by email
 */
export async function getUserByEmail(db: DB, email: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] || null;
}

/**
 * Get user by ID
 */
export async function getUserById(db: DB, userId: number) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] || null;
}

/**
 * Get user by email verification token
 */
export async function getUserByEmailVerificationToken(db: DB, token: string) {
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.emailVerificationToken, token),
        eq(users.isActive, 0) // not yet activated
      )
    )
    .limit(1);
  return rows[0] || null;
}

/**
 * Get user by password reset token
 */
export async function getUserByPasswordResetToken(db: DB, token: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.passwordResetToken, token))
    .limit(1);
  return rows[0] || null;
}

/**
 * Create a new user (email/password registration)
 */
export async function createUser(db: DB, data: {
  name: string;
  email: string;
  password: string;
  registrationIp?: string;
}) {
  const openId = nanoid(16); // generate unique openId
  const passwordHash = await hashPassword(data.password);

  // 2026-05-08 (P1-3): race-safe insert. With the UNIQUE index added on
  // users.email (migrate.ts), concurrent register requests with the
  // same address now fail with ER_DUP_ENTRY at the DB layer. Catch it
  // and surface a clean DUPLICATE_EMAIL signal to the caller.
  //
  // 2026-05-08 (CJ): trial bypass — auto-activate. Email verification is
  // best-effort; if Resend / SendGrid is down or unconfigured users still
  // need to be able to register and use the platform. We can flip back
  // to isActive=0 once email infra is reliable. Set
  // `REQUIRE_EMAIL_VERIFICATION=1` env to opt back in.
  const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === "1";
  try {
    await db
      .insert(users)
      .values({
        openId,
        name: data.name,
        email: data.email,
        passwordHash,
        authMethod: "password",
        isActive: requireVerification ? 0 : 1,
        credits: 1000, // signup bonus
        registrationIp: data.registrationIp,
        role: "user",
      })
      .$dynamic();
  } catch (err: any) {
    const code = err?.code ?? err?.errno;
    const msg = String(err?.message ?? "");
    if (code === "ER_DUP_ENTRY" || code === 1062 || /Duplicate entry/i.test(msg)) {
      const dup = new Error("DUPLICATE_EMAIL");
      (dup as any).code = "DUPLICATE_EMAIL";
      throw dup;
    }
    throw err;
  }

  // Get the inserted user
  const newUser = await getUserByEmail(db, data.email);
  return newUser;
}

/**
 * Verify user email and activate account
 */
export async function verifyUserEmail(db: DB, userOpenId: string) {
  await db
    .update(users)
    .set({
      isActive: 1,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      activatedAt: new Date(),
    })
    .where(eq(users.openId, userOpenId));
}

/**
 * Set email verification token for a user
 */
export async function setEmailVerificationToken(
  db: DB,
  userEmail: string,
  token: string,
  expires: Date
) {
  await db
    .update(users)
    .set({
      emailVerificationToken: token,
      emailVerificationExpires: expires,
    })
    .where(eq(users.email, userEmail));
}

/**
 * Set password reset token for a user
 */
export async function setPasswordResetToken(
  db: DB,
  userId: number,
  token: string,
  expires: Date
) {
  await db
    .update(users)
    .set({
      passwordResetToken: token,
      passwordResetExpires: expires,
    })
    .where(eq(users.id, userId));
}

/**
 * Update user password
 */
/**
 * Update password via reset-token compare-and-swap.
 *
 * 2026-05-08 (P0-C): The previous version did `WHERE id = ?` only —
 * if two requests arrived with the same token (browser back-button,
 * refresh, race), both could succeed and overwrite each other. Now
 * the WHERE clause matches the EXACT token; affectedRows must be 1
 * or we throw. Caller treats the error as "token already used".
 *
 * If `currentToken` is null, falls back to the legacy id-only update
 * (used by Google OAuth flows that don't have a reset token).
 */
export async function updateUserPassword(
  db: DB,
  userId: number,
  newPassword: string,
  currentToken?: string,
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);

  if (currentToken) {
    const result: any = await db
      .update(users)
      .set({ passwordHash, passwordResetToken: null, passwordResetExpires: null })
      .where(and(eq(users.id, userId), eq(users.passwordResetToken, currentToken)));
    // Drizzle MySQL returns [{affectedRows, ...}] — handle both shapes
    const affected =
      (result?.[0]?.affectedRows ?? result?.affectedRows ?? 0) as number;
    if (affected !== 1) {
      throw new Error("PASSWORD_RESET_TOKEN_ALREADY_USED");
    }
    return;
  }

  // Legacy path: no token CAS (Google flow)
  await db
    .update(users)
    .set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
    })
    .where(eq(users.id, userId));
}

/**
 * Update last login IP
 */
export async function updateLastLoginIp(
  db: DB,
  userId: number,
  ip: string
) {
  await db
    .update(users)
    .set({ lastLoginIp: ip })
    .where(eq(users.id, userId));
}

/**
 * Verify email and password for login
 */
export async function verifyEmailPassword(
  db: DB,
  email: string,
  password: string
): Promise<{ userId: number; openId: string; name: string | null; email: string | null; isActive: number } | null> {
  const user = await getUserByEmail(db, email);
  if (!user || !user.passwordHash) {
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return {
    userId: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    // 2026-05-08 (P0-B): expose isActive so login handler can require
    // email verification before issuing a session.
    isActive: (user as any).isActive ?? 0,
  };
}

/**
 * Create or update Google OAuth user
 */
export async function upsertGoogleUser(db: DB, data: {
  googleId: string;
  email: string;
  name: string;
}): Promise<{ userId: number; openId: string; name: string | null; email: string | null }> {
  // Check if user exists by email
  let user = await getUserByEmail(db, data.email);

  if (user) {
    // Update existing user with Google auth
    await db
      .update(users)
      .set({
        authMethod: "google",
        isActive: 1, // Google users are pre-verified
      })
      .where(eq(users.id, user.id));

    return {
      userId: user.id,
      openId: user.openId,
      name: user.name,
      email: user.email,
    };
  }

  // Create new user
  const openId = nanoid(16);
  const rows = await db
    .insert(users)
    .values({
      openId,
      name: data.name,
      email: data.email,
      authMethod: "google",
      isActive: 1, // Google users are pre-verified
      activatedAt: new Date(),
      credits: 1000,
      role: "user",
    });

  const newUser = await getUserByEmail(db, data.email);
  if (!newUser) {
    throw new Error("Failed to create user");
  }

  return {
    userId: newUser.id,
    openId: newUser.openId,
    name: newUser.name,
    email: newUser.email,
  };
}
