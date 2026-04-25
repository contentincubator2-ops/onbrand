/**
 * Cron drainer — safety net for any queued_jobs row still `waiting`
 * after 30s. The enqueue path (marketingQueue.add) already fires a
 * direct POST to /api/worker/execute-task, but that fetch can be lost
 * to cold-start timeouts or network blips. This sweep catches those.
 *
 * Invoked every minute per vercel.json `crons`. Dispatches up to 10
 * jobs per tick — intentionally small so we don't fan out too many
 * concurrent function invocations.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "drizzle-orm";
import { getDb } from "../../server/db";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const baseUrl =
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!baseUrl) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "missing APP_URL / VERCEL_URL" }));
    return;
  }

  const db = await getDb();

  // Only grab jobs older than 30s — fast-path dispatch gets first shot.
  const [rows] = (await db.execute(sql`
    SELECT id
    FROM queued_jobs
    WHERE status = 'waiting' AND created_at < NOW(3) - INTERVAL 30 SECOND
    ORDER BY created_at ASC
    LIMIT 10
  `)) as unknown as [Array<{ id: string }>, unknown];

  const dispatched = await Promise.allSettled(
    rows.map((r) =>
      fetch(`${baseUrl}/api/worker/execute-task`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret ?? ""}`,
        },
        body: JSON.stringify({ jobId: r.id }),
      }),
    ),
  );

  const ok = dispatched.filter((r) => r.status === "fulfilled").length;
  const failed = dispatched.length - ok;

  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      scanned: rows.length,
      dispatched: ok,
      failed,
      ts: new Date().toISOString(),
    }),
  );
}
