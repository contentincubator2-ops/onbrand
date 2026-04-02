/**
 * AI Talent skill — Express entry point
 * Sprint 1: health check + stub for tRPC router (Sprint 2).
 */

import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status:  "ok",
    service: "ai-talent",
    version: "0.1.0",
    ts:      new Date().toISOString(),
  });
});

// TODO Sprint 2: mount tRPC router
// import { appRouter } from "./routers";
// import { createExpressMiddleware } from "@trpc/server/adapters/express";
// app.use("/trpc", createExpressMiddleware({ router: appRouter }));

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`[ai-talent] listening on :${PORT}`);
});

export default app;
