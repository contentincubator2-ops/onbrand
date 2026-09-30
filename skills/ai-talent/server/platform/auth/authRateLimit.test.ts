import { describe, expect, it } from "vitest";
import express from "express";
import { rateLimit } from "express-rate-limit";
import type { AddressInfo } from "node:net";
import { isExemptFromAuthLimiter } from "./authRateLimit";

describe("isExemptFromAuthLimiter", () => {
  it("exempts session reads and logout", () => {
    for (const p of ["/me", "/me/", "/me/lang", "/logout"]) {
      expect(isExemptFromAuthLimiter(p)).toBe(true);
    }
  });

  it("keeps credential endpoints limited", () => {
    for (const p of ["/login", "/register", "/forgotPassword", "/resetPassword",
                     "/change-password", "/resend-verification", "/verifyEmail", "/mean"]) {
      expect(isExemptFromAuthLimiter(p)).toBe(false);
    }
  });
});

describe("authLimiter mounted on /api/auth", () => {
  it("never returns 429 for /me but still throttles /login", async () => {
    const app = express();
    app.use("/api/auth", rateLimit({
      windowMs: 60_000, max: 3, validate: false,
      skip: (req) => isExemptFromAuthLimiter(req.path),
    }));
    app.post("/api/auth/me", (_req, res) => { res.status(401).json({}); });
    app.post("/api/auth/login", (_req, res) => { res.json({}); });

    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const me = [];
      for (let i = 0; i < 10; i++) me.push((await fetch(`${base}/api/auth/me`, { method: "POST" })).status);
      expect(me.every((s) => s === 401)).toBe(true);

      const login = [];
      for (let i = 0; i < 5; i++) login.push((await fetch(`${base}/api/auth/login`, { method: "POST" })).status);
      expect(login.slice(0, 3)).toEqual([200, 200, 200]);
      expect(login.slice(3)).toEqual([429, 429]);
    } finally {
      server.close();
    }
  });
});
