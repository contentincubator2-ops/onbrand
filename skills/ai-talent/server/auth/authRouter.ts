/**
 * authRouter — Authentication endpoints (email/password + Google OAuth)
 *
 * POST /api/auth/register      - Email/password registration
 * POST /api/auth/login         - Email/password login
 * POST /api/auth/logout        - Logout (clear session cookie)
 * POST /api/auth/me            - Get current user
 * POST /api/auth/verifyEmail   - Verify email and activate account
 * POST /api/auth/forgotPassword - Request password reset
 * POST /api/auth/resetPassword - Reset password with token
 * GET  /api/auth/google        - Start Google OAuth flow
 * GET  /api/auth/google/callback - Google OAuth callback
 */

import { Router, type Request, type Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import {
  getUserByEmail,
  createUser,
  verifyUserEmail,
  setEmailVerificationToken,
  getUserByEmailVerificationToken,
  getUserByPasswordResetToken,
  setPasswordResetToken,
  updateUserPassword,
  updateLastLoginIp,
  verifyEmailPassword,
  upsertGoogleUser,
  EMAIL_VERIFICATION_EXPIRY_MS,
} from "./usersDb";
import { sendEmailVerification, sendPasswordReset } from "./emailService";
import { getJwtSecret } from "../_core/env";

export const authRouter = Router();

// Cookie configuration
const SESSION_COOKIE_NAME = "session";
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
  path: "/",
};

function getSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

/**
 * Create a session token for a user
 */
async function createSessionToken(userId: number, openId: string): Promise<string> {
  return await new SignJWT({ sub: String(userId), openId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(getSecretBytes());
}

/**
 * Verify a session token and return user ID
 */
async function verifySessionToken(token: string): Promise<{ userId: number; openId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretBytes());
    return {
      userId: parseInt(payload.sub as string),
      openId: payload.openId as string,
    };
  } catch {
    return null;
  }
}

/**
 * Get client IP address
 */
function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
}

/**
 * POST /api/auth/register - Register a new user
 */
authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1, "姓名為必填"),
      email: z.string().email("請輸入有效的電子郵件"),
      password: z.string().min(8, "密碼至少需要 8 個字元"),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }

    const { name, email, password } = result.data;
    const db = await getDb();

    // Check if user already exists
    const existingUser = await getUserByEmail(db, email);
    if (existingUser) {
      res.status(400).json({ error: "此電子郵件已註冊" });
      return;
    }

    // Create user
    const registrationIp = getClientIp(req);
    const user = await createUser(db, { name, email, password, registrationIp });

    if (!user) {
      res.status(500).json({ error: "註冊失敗，請稍後再試" });
      return;
    }

    // Generate email verification token
    const verificationToken = nanoid(64);
    const verificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);
    await setEmailVerificationToken(db, email, verificationToken, verificationExpires);

    // Send verification email
    const appUrl = process.env.APP_URL || "http://localhost:3001";
    const verifyUrl = `${appUrl}/verify-email?token=${verificationToken}`;

    try {
      await sendEmailVerification({
        to: email,
        name,
        verifyUrl,
      });
    } catch (emailError) {
      console.error("[auth] Failed to send verification email:", emailError);
      // Don't fail registration if email fails
    }

    res.json({
      success: true,
      message: "註冊成功！請檢查您的電子郵件以驗證帳號。",
    });
  } catch (err) {
    console.error("[auth] register error:", err);
    res.status(500).json({ error: "伺服器錯誤，請稍後再試" });
  }
});

/**
 * POST /api/auth/login - Email/password login
 */
authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email("請輸入有效的電子郵件"),
      password: z.string().min(1, "請輸入密碼"),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }

    const { email, password } = result.data;
    const db = await getDb();

    const user = await verifyEmailPassword(db, email, password);
    if (!user) {
      res.status(401).json({ error: "電子郵件或密碼錯誤" });
      return;
    }

    // Update last login IP
    const clientIp = getClientIp(req);
    await updateLastLoginIp(db, user.userId, clientIp);

    // Create session token
    const sessionToken = await createSessionToken(user.userId, user.openId);

    // Set cookie
    res.cookie(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);

    res.json({
      success: true,
      user: {
        id: user.userId,
        openId: user.openId,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("[auth] login error:", err);
    res.status(500).json({ error: "伺服器錯誤，請稍後再試" });
  }
});

/**
 * POST /api/auth/logout - Logout
 */
authRouter.post("/logout", async (_req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

/**
 * POST /api/auth/me - Get current user
 */
authRouter.post("/me", async (req: Request, res: Response) => {
  try {
    const sessionToken = req.cookies[SESSION_COOKIE_NAME];
    if (!sessionToken) {
      res.status(401).json({ error: "未登入" });
      return;
    }

    const session = await verifySessionToken(sessionToken);
    if (!session) {
      res.status(401).json({ error: "無效的登入狀態" });
      return;
    }

    const db = await getDb();
    const user = await db
      .select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        credits: users.credits,
        hasUnlimitedCredits: users.hasUnlimitedCredits,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user || user.length === 0) {
      res.status(404).json({ error: "使用者不存在" });
      return;
    }

    res.json({ user: user[0] });
  } catch (err) {
    console.error("[auth] me error:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

/**
 * POST /api/auth/verifyEmail - Verify email and activate account
 */
authRouter.post("/verifyEmail", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      token: z.string().min(1, "無效的驗證連結"),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }

    const { token } = result.data;
    const db = await getDb();

    const user = await getUserByEmailVerificationToken(db, token);
    if (!user) {
      res.status(400).json({ error: "無效或過期的驗證連結" });
      return;
    }

    // Check if token expired
    if (user.emailVerificationExpires && new Date(user.emailVerificationExpires) < new Date()) {
      res.status(400).json({ error: "驗證連結已過期，請重新註冊" });
      return;
    }

    // Activate user
    await verifyUserEmail(db, user.openId);

    // Auto-login after verification
    const sessionToken = await createSessionToken(user.id, user.openId);
    res.cookie(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);

    res.json({
      success: true,
      message: "電子郵件驗證成功！",
      user: {
        id: user.id,
        openId: user.openId,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("[auth] verifyEmail error:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

/**
 * POST /api/auth/forgotPassword - Request password reset
 */
authRouter.post("/forgotPassword", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email("請輸入有效的電子郵件"),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }

    const { email } = result.data;
    const db = await getDb();

    const user = await getUserByEmail(db, email);
    if (!user) {
      // Don't reveal if email exists or not
      res.json({
        success: true,
        message: "如果此電子郵件已註冊，您將收到重設密碼的連結",
      });
      return;
    }

    // Generate password reset token
    const resetToken = nanoid(64);
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await setPasswordResetToken(db, user.id, resetToken, resetExpires);

    // Send reset email
    const appUrl = process.env.APP_URL || "http://localhost:3001";
    const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

    try {
      await sendPasswordReset({
        to: email,
        name: user.name || "User",
        resetUrl,
      });
    } catch (emailError) {
      console.error("[auth] Failed to send reset email:", emailError);
    }

    res.json({
      success: true,
      message: "如果此電子郵件已註冊，您將收到重設密碼的連結",
    });
  } catch (err) {
    console.error("[auth] forgotPassword error:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

/**
 * POST /api/auth/resetPassword - Reset password with token
 */
authRouter.post("/resetPassword", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      token: z.string().min(1, "無效的重設連結"),
      password: z.string().min(8, "密碼至少需要 8 個字元"),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }

    const { token, password } = result.data;
    const db = await getDb();

    const user = await getUserByPasswordResetToken(db, token);
    if (!user) {
      res.status(400).json({ error: "無效或過期的重設連結" });
      return;
    }

    // Check if token expired
    if (user.passwordResetExpires && new Date(user.passwordResetExpires) < new Date()) {
      res.status(400).json({ error: "重設連結已過期，請重新申請" });
      return;
    }

    // Update password
    await updateUserPassword(db, user.id, password);

    res.json({
      success: true,
      message: "密碼重設成功！請使用新密碼登入",
    });
  } catch (err) {
    console.error("[auth] resetPassword error:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

/**
 * GET /api/auth/google - Start Google OAuth flow
 */
authRouter.get("/google", async (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.APP_URL}/api/auth/google/callback`;
  const state = nanoid(32);

  if (!clientId) {
    res.status(500).json({ error: "Google OAuth 未配置" });
    return;
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);

  // Store state in cookie for CSRF protection
  res.cookie("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  res.redirect(authUrl.toString());
});

/**
 * GET /api/auth/google/callback - Google OAuth callback
 */
authRouter.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    // Verify state for CSRF protection
    const savedState = req.cookies.google_oauth_state;
    res.clearCookie("google_oauth_state");

    if (!state || state !== savedState) {
      res.status(400).json({ error: "無效的 OAuth 狀態" });
      return;
    }

    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "缺少授權碼" });
      return;
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.APP_URL}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange token");
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userResponse = await fetch(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokens.access_token}`
    );

    if (!userResponse.ok) {
      throw new Error("Failed to get user info");
    }

    const googleUser = await userResponse.json();

    // Create or update user in database
    const db = await getDb();
    const user = await upsertGoogleUser(db, {
      googleId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
    });

    // Create session
    const sessionToken = await createSessionToken(user.userId, user.openId);
    res.cookie(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);

    // Redirect to frontend
    res.redirect("/");
  } catch (err) {
    console.error("[auth] google callback error:", err);
    res.status(500).json({ error: "Google 登入失敗" });
  }
});

export { createSessionToken, verifySessionToken };
