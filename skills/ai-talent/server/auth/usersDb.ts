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

  const rows = await db
    .insert(users)
    .values({
      openId,
      name: data.name,
      email: data.email,
      passwordHash,
      authMethod: "password",
      isActive: 0, // requires email verification
      credits: 1000, // signup bonus
      registrationIp: data.registrationIp,
      role: "user",
    })
    .$dynamic();

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
export async function updateUserPassword(
  db: DB,
  userId: number,
  newPassword: string
) {
  const passwordHash = await hashPassword(newPassword);

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
): Promise<{ userId: number; openId: string; name: string | null; email: string | null } | null> {
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
