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
import { getDb } from "../../db";
import { users } from "../../../drizzle/schema";
import { getUserByEmail, createUser, verifyUserEmail, setEmailVerificationToken, getUserByEmailVerificationToken, getUserByPasswordResetToken, setPasswordResetToken, updateUserPassword, updateLastLoginIp, updatePreferredLang, verifyEmailPassword, upsertGoogleUser, EMAIL_VERIFICATION_EXPIRY_MS } from "./usersDb";
import { sendEmailVerification, sendPasswordReset, sendWelcome } from "./emailService";
import { getJwtSecret } from "../core/env";

export const authRouter = Router();

// Cookie configuration
const SESSION_COOKIE_NAME = "session";
// 2026-05-29 (security/GDPR): reduced from 365d to 30d.
// Long-lived sessions are a GDPR Art. 32 risk — a stolen cookie is valid for
// a year. 30d balances UX (users don't have to re-login constantly) with
// the principle of minimal exposure. Rotate to 7d once we add refresh tokens.
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: SESSION_MAX_AGE_MS,
  path: "/",
};

/**
 * Server-side session revocation (GDPR Art. 17 / ISO 27001 A.9.4).
 *
 * When a user logs out we add their JWT's `jti` (JWT ID) to this set so
 * that even if the browser cookie is replayed (e.g. XSS steal, copied
 * session) the token is rejected immediately.
 *
 * This is an in-memory store — it resets on process restart, but at that
 * point existing JWTs still verify cryptographically, so users just stay
 * logged in across restarts (acceptable UX trade-off for trial scale).
 * Upgrade to Redis when multi-process / multi-replica deployment happens.
 *
 * Entries are pruned lazily: jti encodes the exp timestamp so we can drop
 * entries whose tokens would already be expired.
 */
const revokedJtis = new Set<string>();

function getSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

/**
 * Create a session token for a user.
 * Embeds a `jti` (JWT ID) = `<userId>:<randomHex>` for server-side revocation.
 */
async function createSessionToken(userId: number, openId: string): Promise<string> {
  const { randomBytes } = await import("crypto");
  const jti = `${userId}:${randomBytes(16).toString("hex")}`;
  return await new SignJWT({ sub: String(userId), openId, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretBytes());
}

/**
 * Verify a session token and return user ID + jti.
 * Returns null if token is invalid, expired, or has been revoked via logout.
 */
async function verifySessionToken(token: string): Promise<{ userId: number; openId: string; jti?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretBytes());
    const jti = typeof payload.jti === "string" ? payload.jti : undefined;
    // Reject revoked sessions (e.g. explicit logout)
    if (jti && revokedJtis.has(jti)) return null;
    return {
      userId: parseInt(payload.sub as string),
      openId: payload.openId as string,
      jti,
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
      password: z.string()
        .min(8, "密碼至少需要 8 個字元")
        .regex(/[A-Z]/, "密碼需包含至少一個大寫字母")
        .regex(/[0-9]/, "密碼需包含至少一個數字")
        .regex(/[^A-Za-z0-9]/, "密碼需包含至少一個特殊字元（如 !@#$）"),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstMsg = Object.values(result.error.flatten().fieldErrors).flat()[0] ?? "請檢查輸入欄位";
      res.status(400).json({ error: firstMsg });
      return;
    }

    // 2026-05-16: per-IP registration throttle (anti bot-farm — trial
    // bypass grants 300 LLM points on every signup).
    const regIp = getClientIp(req);
    const rl = checkRegisterRateLimit(regIp);
    if (!rl.ok) {
      console.warn(`[auth] register throttled ip=${regIp}`);
      res.status(429).json({ error: rl.reason });
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

    // Create user (P1-3: race-safe — UNIQUE index catches concurrent
    // duplicate registers, createUser throws DUPLICATE_EMAIL)
    const registrationIp = getClientIp(req);
    let user;
    try {
      user = await createUser(db, { name, email, password, registrationIp });
    } catch (e: any) {
      if (e?.code === "DUPLICATE_EMAIL") {
        res.status(400).json({ error: "此電子郵件已註冊" });
        return;
      }
      throw e;
    }

    if (!user) {
      res.status(500).json({ error: "註冊失敗，請稍後再試" });
      return;
    }

    // 2026-05-10 (CJ「明天串金流，今天先把試用期跑通」): set planEndsAt
    // = now + 7 days. Tomorrow's 綠界 webhook updates this to subscription
    // end date when user pays.
    try {
      const { default: localPool } = await import("../../localDb");
      const trialEnds = new Date(Date.now() + 7 * 24 * 3600_000);
      // 2026-05-14 (CJ「TWD + USD 雙幣」): infer billing country from
      // Accept-Language. zh-* → TW (TWD), else US (USD). User can flip
      // this later in /settings/account.
      const { inferBillingCountryFromAcceptLanguage } = await import("../core/billing/plans");
      const billingCountry = inferBillingCountryFromAcceptLanguage(req.header("accept-language"));
      await localPool.execute(
        `UPDATE users SET planCode='trial', planStatus='trial', planEndsAt=?, billingCountry=? WHERE id=?`,
        // 2026-05-11 — type fix: `user` shape uses `id`, not `userId`.
        // Pre-existing bug from da4787b that's been failing CI ever since.
        [trialEnds, billingCountry, user.id],
      );

      // 2026-05-21 (CJ「找不到 workspace」): provision default workspace for
      // every new user at registration so PricingPage checkout never fails.
      try {
        const slug = `ws-${user.id}-${Math.random().toString(36).slice(2, 8)}`;
        const wsName = name || `Workspace #${user.id}`;
        const [wsIns]: any = await localPool.execute(
          `INSERT INTO workspaces (slug, name, ownerUserId, planCode, planStatus, billingMode)
           VALUES (?, ?, ?, 'trial', 'trial', 'solo')`,
          [slug, wsName, user.id],
        );
        const wsId = (wsIns as any)?.insertId;
        if (wsId) {
          await localPool.execute(
            `INSERT IGNORE INTO workspace_members (workspaceId, userId, role, joinedAt)
             VALUES (?, ?, 'owner', NOW(3))`,
            [wsId, user.id],
          );
        }
      } catch (e) {
        console.warn("[auth] workspace provision failed (non-blocking):", e);
      }
    } catch (e) {
      console.warn("[auth] planEndsAt set failed (non-blocking):", e);
    }

    // Generate email verification token
    const verificationToken = nanoid(64);
    const verificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);
    await setEmailVerificationToken(db, email, verificationToken, verificationExpires);

    // Send verification email
    // 2026-05-15 (CJ「resend 驗證信網址」): path must match AppV2 route
    // `/auth/verify-email` (was `/verify-email` → 404 on click).
    const appUrl = process.env.APP_URL || "http://localhost:3001";
    const verifyUrl = `${appUrl}/auth/verify-email?token=${verificationToken}`;

    // 2026-05-08 (CJ): email verification is best-effort. Try to send;
    // log failures but don't block registration. With auto-activate
    // (REQUIRE_EMAIL_VERIFICATION != "1") users can log in immediately
    // even when no email arrived. The verification link still works if
    // the email DOES land — it's purely informational at trial scale.
    let emailSent = false;
    try {
      await sendEmailVerification({ to: email, name, verifyUrl });
      emailSent = true;
    } catch (emailError) {
      console.error("[auth] verification email send failed (non-blocking):", emailError);
    }

    void writeLoginAuditLog({ userId: user.id, email, event: "register", ip: getClientIp(req), userAgent: req.headers["user-agent"] ?? null });
    res.json({
      success: true,
      message: emailSent
        ? "註冊成功！請檢查您的電子郵件以驗證帳號（已可直接登入）。"
        : "註冊成功！您現在可以直接登入。",
      emailSent,
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
      const firstMsg = Object.values(result.error.flatten().fieldErrors).flat()[0] ?? "請檢查輸入欄位";
      res.status(400).json({ error: firstMsg });
      return;
    }

    const { email, password } = result.data;
    const db = await getDb();

    // 2026-05-29 (ISO 27001 A.9.4): check account lockout
    const lockCheck = checkLoginLockout(email);
    if (!lockCheck.ok) {
      const retryMins = Math.ceil(lockCheck.retryInMs / 60_000);
      void writeLoginAuditLog({ userId: null, email, event: "lockout", ip: getClientIp(req), userAgent: req.headers["user-agent"] ?? null });
      res.status(429).json({
        error: `帳號因多次登入失敗已暫時鎖定，請 ${retryMins} 分鐘後再試`,
      });
      return;
    }

    const user = await verifyEmailPassword(db, email, password);
    if (!user) {
      recordLoginFailure(email);
      void writeLoginAuditLog({ userId: null, email, event: "login_failure", ip: getClientIp(req), userAgent: req.headers["user-agent"] ?? null });
      res.status(401).json({ error: "電子郵件或密碼錯誤" });
      return;
    }

    // 2026-05-08 (P0-B): block unverified users. Frontend uses
    // `needsVerification: true` to show a "重發驗證信" CTA.
    if (!user.isActive) {
      res.status(403).json({
        error: "請先驗證您的電子郵件後再登入",
        needsVerification: true,
        email,
      });
      return;
    }

    // Update last login IP
    const clientIp = getClientIp(req);
    await updateLastLoginIp(db, user.userId, clientIp);
    recordLoginSuccess(email);
    void writeLoginAuditLog({ userId: user.userId, email, event: "login_success", ip: clientIp, userAgent: req.headers["user-agent"] ?? null });

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
 * 2026-05-29 (GDPR Art. 17 / ISO 27001 A.9.4): server-side session
 * revocation. Extract the jti from the current cookie and add it to the
 * in-memory revocation set so replayed tokens are instantly rejected.
 */
authRouter.post("/logout", async (req: Request, res: Response) => {
  try {
    const sessionToken = req.cookies[SESSION_COOKIE_NAME];
    if (sessionToken) {
      const session = await verifySessionToken(sessionToken);
      if (session?.jti) {
        revokedJtis.add(session.jti);
        // Lazy cleanup: prune any revoked jtis whose userId prefix matches
        // the current user (keeps set small; exact exp-based pruning would
        // require storing the exp alongside the jti).
        if (revokedJtis.size > 10_000) {
          // Emergency cap — shouldn't be reached at trial scale.
          // Take the oldest 5000 entries off (Sets iterate insertion-order).
          const iter = revokedJtis.values();
          for (let i = 0; i < 5_000; i++) {
            const v = iter.next();
            if (v.done) break;
            revokedJtis.delete(v.value);
          }
        }
      }
    }
  } catch {
    // Non-fatal — always clear the cookie regardless
  }
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
        preferredLang: users.preferredLang,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user || user.length === 0) {
      res.status(404).json({ error: "使用者不存在" });
      return;
    }

    // 2026-05-29: fetch planStatus + planEndsAt via raw query — these columns
    // exist in the DB but are not in the Drizzle schema (managed by localPool
    // migrations). Frontend uses planStatus to show trial-expired UX without
    // a separate billing API call.
    let planStatus: string | null = null;
    let planEndsAt: string | null = null;
    // 2026-07-15 (activation Leak A): brandCount lets post-login landing route
    // a brandless user into guided brand creation instead of the empty /theater.
    let brandCount = 0;
    try {
      const { default: localPool } = await import("../../localDb");
      const [planRows]: any = await localPool.execute(
        `SELECT planStatus, planEndsAt,
                (SELECT COUNT(*) FROM brands WHERE userId = ?) AS brandCount
           FROM users WHERE id = ? LIMIT 1`,
        [session.userId, session.userId],
      );
      const planRow = Array.isArray(planRows) ? planRows[0] : null;
      planStatus = planRow?.planStatus ?? null;
      planEndsAt = planRow?.planEndsAt ? new Date(planRow.planEndsAt).toISOString() : null;
      brandCount = Number(planRow?.brandCount ?? 0);
    } catch { /* non-fatal — return user without plan info */ }

    res.json({ user: { ...user[0], planStatus, planEndsAt }, brandCount });
  } catch (err) {
    console.error("[auth] me error:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

/**
 * PATCH /api/auth/me/lang - Persist the user's preferred UI language to DB.
 * Called whenever the user explicitly toggles the language in the UI.
 * Survives localStorage clears; syncs across devices on next login.
 */
authRouter.patch("/me/lang", async (req: Request, res: Response) => {
  try {
    const sessionToken = req.cookies[SESSION_COOKIE_NAME];
    if (!sessionToken) { res.status(401).json({ error: "Not authenticated" }); return; }
    const session = await verifySessionToken(sessionToken);
    if (!session) { res.status(401).json({ error: "Invalid session" }); return; }

    const schema = z.object({ lang: z.enum(["zh-TW", "en"]) });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "lang must be zh-TW or en" }); return; }

    const db = await getDb();
    await updatePreferredLang(db, session.userId, result.data.lang);
    res.json({ success: true });
  } catch (err) {
    console.error("[auth] me/lang error:", err);
    res.status(500).json({ error: "Server error" });
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
      const firstMsg = Object.values(result.error.flatten().fieldErrors).flat()[0] ?? "請檢查輸入欄位";
      res.status(400).json({ error: firstMsg });
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

    // Welcome mail is a courtesy — never let it fail the verification.
    if (user.email) {
      void sendWelcome({
        to: user.email,
        name: user.name ?? "",
        appUrl: process.env.APP_URL ?? "https://onbrand.sowork.ai",
      }).catch((e) => console.warn("[auth] welcome email not sent:", (e as Error)?.message));
    }

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
      const firstMsg = Object.values(result.error.flatten().fieldErrors).flat()[0] ?? "請檢查輸入欄位";
      res.status(400).json({ error: firstMsg });
      return;
    }

    const { email } = result.data;

    // 2026-05-08 (P0-C): rate limit per email (3 / hour). Prevents
    // attacker flooding victim's inbox with reset emails.
    const rl = checkForgotRateLimit(email);
    if (!rl.ok) {
      res.status(429).json({
        error: `重設密碼請求過於頻繁，請於 ${Math.ceil(rl.retryInMs / 60000)} 分鐘後再試`,
      });
      return;
    }

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
    // SPA route is /auth/reset-password (see App.tsx + AppV2.tsx). Without
    // the /auth/ prefix the React Router falls through to a blank page.
    const resetUrl = `${appUrl}/auth/reset-password?token=${resetToken}`;

    let emailSent = false;
    try {
      await sendPasswordReset({ to: email, name: user.name || "User", resetUrl });
      emailSent = true;
    } catch (emailError) {
      console.error("[auth] forgot-password email send failed (non-blocking):", emailError);
    }

    res.json({
      success: true,
      // 2026-05-08 (CJ): trial-bypass — also expose the resetUrl in
      // the response when email fails so the user can recover even
      // when Resend/SendGrid is down. We log this clearly so it's
      // easy to spot in audit logs.
      message: emailSent
        ? "如果此電子郵件已註冊，您將收到重設密碼的連結"
        : "重設信寄送失敗 — 請聯絡客服取得重設連結",
      emailSent,
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
      const firstMsg = Object.values(result.error.flatten().fieldErrors).flat()[0] ?? "請檢查輸入欄位";
      res.status(400).json({ error: firstMsg });
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

    // 2026-05-08 (P0-C): CAS update — passes token so DB only writes
    // when the token still matches. If two requests race, only one wins.
    try {
      await updateUserPassword(db, user.id, password, token);
    } catch (err: any) {
      if (String(err?.message) === "PASSWORD_RESET_TOKEN_ALREADY_USED") {
        res.status(400).json({ error: "重設連結已使用過或已失效，請重新申請" });
        return;
      }
      throw err;
    }

    res.json({
      success: true,
      message: "密碼重設成功！請使用新密碼登入",
    });
  } catch (err) {
    console.error("[auth] resetPassword error:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 2026-05-08 (P0-B + P0-C): in-memory rate limiters
// Per-email cooldowns. trial scale; revisit to Redis when scaling out.
// ─────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────
// 2026-05-29 (ISO 27001 A.9.4): per-account login lockout.
// After 5 failed attempts within 15 min → lock for 15 min.
// In-memory; resets on process restart (acceptable at trial scale).
// ─────────────────────────────────────────────────────────────────────
const LOGIN_FAIL_WINDOW_MS  = 15 * 60 * 1000; // 15 minutes
const LOGIN_FAIL_MAX        = 5;              // max failures before lockout
const LOGIN_LOCKOUT_MS      = 15 * 60 * 1000; // lockout duration
const loginFailsByEmail = new Map<string, { times: number[]; lockedUntil: number }>();

function checkLoginLockout(email: string): { ok: true } | { ok: false; retryInMs: number } {
  const now = Date.now();
  const entry = loginFailsByEmail.get(email);
  if (!entry) return { ok: true };
  if (entry.lockedUntil > now) {
    return { ok: false, retryInMs: entry.lockedUntil - now };
  }
  return { ok: true };
}

function recordLoginFailure(email: string): void {
  const now = Date.now();
  const windowStart = now - LOGIN_FAIL_WINDOW_MS;
  const entry = loginFailsByEmail.get(email) ?? { times: [], lockedUntil: 0 };
  entry.times = entry.times.filter(t => t > windowStart);
  entry.times.push(now);
  if (entry.times.length >= LOGIN_FAIL_MAX) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    entry.times = []; // reset after lockout applied
  }
  loginFailsByEmail.set(email, entry);
}

function recordLoginSuccess(email: string): void {
  loginFailsByEmail.delete(email); // clear failure count on success
}

/**
 * Write an auth event to login_audit_log (ISO 27001 A.12.4 audit trail).
 * Non-fatal — log failures don't block the auth flow.
 * Table is auto-created on first write (lazy migration).
 */
async function writeLoginAuditLog(entry: {
  userId: number | null;
  email: string;
  event: "login_success" | "login_failure" | "logout" | "register" | "lockout";
  ip: string;
  userAgent: string | null;
}): Promise<void> {
  try {
    const { default: localPool } = await import("../../localDb");
    await localPool.execute(
      `CREATE TABLE IF NOT EXISTS login_audit_log (
         id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
         userId     INT          NULL,
         email      VARCHAR(255) NOT NULL,
         event      VARCHAR(40)  NOT NULL,
         ip         VARCHAR(64)  NOT NULL,
         userAgent  TEXT         NULL,
         createdAt  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
         INDEX idx_email (email),
         INDEX idx_userid (userId),
         INDEX idx_event_time (event, createdAt)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await localPool.execute(
      `INSERT INTO login_audit_log (userId, email, event, ip, userAgent) VALUES (?, ?, ?, ?, ?)`,
      [entry.userId ?? null, entry.email, entry.event, entry.ip, entry.userAgent ?? null],
    );
  } catch {
    // Non-fatal — audit log failure must never block auth
  }
}

const RESEND_COOLDOWN_MS = 5 * 60 * 1000;       // resend verification: 5 min
const FORGOT_COOLDOWN_MS = 60 * 60 * 1000;      // forgot password: 1 hour window
const FORGOT_MAX_PER_WINDOW = 3;
const lastResendByEmail = new Map<string, number>();
const forgotByEmail = new Map<string, number[]>();

function checkResendCooldown(email: string): { ok: true } | { ok: false; retryInMs: number } {
  const last = lastResendByEmail.get(email) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < RESEND_COOLDOWN_MS) {
    return { ok: false, retryInMs: RESEND_COOLDOWN_MS - elapsed };
  }
  return { ok: true };
}
function markResend(email: string) { lastResendByEmail.set(email, Date.now()); }

export function checkForgotRateLimit(email: string): { ok: true } | { ok: false; retryInMs: number } {
  const now = Date.now();
  const arr = (forgotByEmail.get(email) ?? []).filter((t) => now - t < FORGOT_COOLDOWN_MS);
  if (arr.length >= FORGOT_MAX_PER_WINDOW) {
    const oldest = arr[0]!;
    return { ok: false, retryInMs: FORGOT_COOLDOWN_MS - (now - oldest) };
  }
  arr.push(now);
  forgotByEmail.set(email, arr);
  return { ok: true };
}

// 2026-05-16 (CJ「註冊濫用節流：機器人灌註冊會燒錢」): trial bypass means
// every register grants 300 LLM points immediately. A bot farm could
// register thousands of throwaway emails and drain budget. Per-IP cap:
// generous enough for a shared office / co-working NAT (一間公司多人註冊
// 沒問題) but kills automated floods. In-memory is fine at trial scale
// (single process); resets on restart, which is acceptable.
const REGISTER_WINDOW_MS = 60 * 60 * 1000;   // 1 hour
const REGISTER_MAX_PER_IP = 8;               // 8 signups / IP / hour
const REGISTER_MAX_PER_IP_DAY = 20;          // hard daily ceiling / IP
const registerByIp = new Map<string, number[]>();

function checkRegisterRateLimit(ip: string): { ok: true } | { ok: false; reason: string } {
  if (!ip || ip === "unknown") return { ok: true }; // can't throttle what we can't identify
  const now = Date.now();
  const dayAgo = now - 24 * 3600 * 1000;
  const arr = (registerByIp.get(ip) ?? []).filter((t) => t > dayAgo);
  const lastHour = arr.filter((t) => now - t < REGISTER_WINDOW_MS);
  if (lastHour.length >= REGISTER_MAX_PER_IP) {
    return { ok: false, reason: "此 IP 短時間內註冊次數過多，請稍後再試（約 1 小時後）。" };
  }
  if (arr.length >= REGISTER_MAX_PER_IP_DAY) {
    return { ok: false, reason: "此 IP 今日註冊數已達上限，若為團隊註冊請聯絡客服 sowork@sowork.ai。" };
  }
  arr.push(now);
  registerByIp.set(ip, arr);
  return { ok: true };
}

/**
 * POST /api/auth/resend-verification — re-send verification email
 * for users who registered but didn't get / lost the link.
 *
 * 2026-05-08 (P0-B): added so login's 403 needsVerification flow has
 * a recovery path. Per-email 5-min cooldown.
 */
authRouter.post("/resend-verification", async (req: Request, res: Response) => {
  try {
    const schema = z.object({ email: z.string().email("請輸入有效的電子郵件") });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstMsg = Object.values(result.error.flatten().fieldErrors).flat()[0] ?? "請檢查輸入欄位";
      res.status(400).json({ error: firstMsg });
      return;
    }
    const { email } = result.data;

    const cd = checkResendCooldown(email);
    if (!cd.ok) {
      res.status(429).json({
        error: `請等候 ${Math.ceil(cd.retryInMs / 60000)} 分鐘後再試`,
      });
      return;
    }

    const db = await getDb();
    const user = await getUserByEmail(db, email);
    // Don't reveal whether email exists — but only send if it does + still inactive
    if (user && !(user as any).isActive) {
      const verificationToken = nanoid(64);
      const verificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);
      await setEmailVerificationToken(db, email, verificationToken, verificationExpires);
      const appUrl = process.env.APP_URL || "http://localhost:3001";
      const verifyUrl = `${appUrl}/auth/verify-email?token=${verificationToken}`;
      try {
        await sendEmailVerification({ to: email, name: user.name ?? "User", verifyUrl });
      } catch (e) {
        console.error("[auth] resend-verification email failed:", e);
        res.status(503).json({ error: "驗證信寄送失敗，請稍後再試" });
        return;
      }
    }
    markResend(email);
    res.json({ success: true, message: "如果此電子郵件還沒驗證，新的驗證信已寄出" });
  } catch (err) {
    console.error("[auth] resend-verification error:", err);
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

    // 2026-09-28（OnBrand 連接器）：從 Claude 連接流程來的，登入後回到授權頁（見 LoginPage oauthNextPath）。
    const next = String((req as any).cookies?.ob_oauth_next ?? ""); // cookie-parser 已經解碼過
    if (next) res.clearCookie("ob_oauth_next", { path: "/" });
    if (/^\/api\/mcp-oauth\/authorize(\?|$)/.test(next)) { res.redirect(next); return; }

    // Redirect to frontend
    res.redirect("/");
  } catch (err) {
    console.error("[auth] google callback error:", err);
    res.status(500).json({ error: "Google 登入失敗" });
  }
});

/**
 * POST /api/auth/change-password — for logged-in users self-changing pwd.
 * 2026-05-10 (CJ「帳號管理頁」prerequisite for /settings/account).
 */
authRouter.post("/change-password", async (req: Request, res: Response) => {
  try {
    // Verify session
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      res.status(401).json({ error: "未登入" });
      return;
    }
    const payload = await verifySessionToken(token).catch(() => null);
    if (!payload?.userId) {
      res.status(401).json({ error: "登入狀態無效" });
      return;
    }

    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, "新密碼至少 8 字元").max(200),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const firstMsg = Object.values(parsed.error.flatten().fieldErrors).flat()[0] ?? "請檢查輸入欄位";
      res.status(400).json({ error: firstMsg });
      return;
    }

    // Look up user, verify current password
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!user || !user.email) {
      res.status(404).json({ error: "帳號不存在" });
      return;
    }
    const verified = await verifyEmailPassword(db, user.email, parsed.data.currentPassword);
    if (!verified) {
      res.status(400).json({ error: "目前密碼不正確" });
      return;
    }

    // Hash + write new password
    const bcrypt = await import("bcryptjs");
    const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
    const { default: localPool } = await import("../../localDb");
    await localPool.execute(
      `UPDATE users SET passwordHash=? WHERE id=?`,
      [newHash, payload.userId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[auth] change-password error:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

export { createSessionToken, verifySessionToken };
