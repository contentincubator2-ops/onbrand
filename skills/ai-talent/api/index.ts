/**
 * Vercel Function entry — wraps the Express app as a single catch-all
 * handler. All `/trpc/*`, `/api/*`, `/slack/*`, `/health` routes are
 * rewritten here via vercel.json; Express sees the original URL via
 * `req.url` so route dispatch keeps working unchanged.
 *
 * Static assets (client build → ../public) are served by Vercel's CDN
 * directly and never hit this function.
 *
 * Side effects that don't fit serverless (BullMQ workers, setInterval,
 * process signal handlers, startup migrations) are gated behind
 * `!process.env.VERCEL` in server/index.ts.
 */
import app from "../server/index";

export default app;
