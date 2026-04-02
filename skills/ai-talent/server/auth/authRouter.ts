/**
 * authRouter — JWT authentication endpoints
 * SEC-1: Implements API-key → JWT token exchange using `jose`.
 *
 * POST /api/auth/login  — exchange an API key for a JWT (7d expiry)
 * POST /api/auth/verify — verify a Bearer token
 */

import { Router, type Request, type Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import { validateApiKey } from "../userApiKeys";

export const authRouter = Router();

function getSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

// POST /api/auth/login — use API Key to get a JWT token
authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey || typeof apiKey !== "string") {
      res.status(400).json({ error: "apiKey is required" });
      return;
    }

    const userId = await validateApiKey(apiKey);
    if (!userId) {
      res.status(401).json({ error: "Invalid or inactive API key" });
      return;
    }

    const token = await new SignJWT({ sub: String(userId) })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(getSecretBytes());

    res.json({ token, userId, expiresIn: "7d" });
  } catch (err) {
    console.error("[auth] login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/verify — verify a Bearer token
authRouter.post("/verify", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ valid: false });
    return;
  }
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), getSecretBytes());
    res.json({ valid: true, userId: payload.sub });
  } catch {
    res.status(401).json({ valid: false });
  }
});
