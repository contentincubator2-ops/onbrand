/**
 * Agent Vector Search Route
 * POST /api/agents/search
 *
 * Body: { query: string, limit?: number, layer?: string, industry?: string }
 * Returns: top-k agents ranked by cosine similarity to query embedding
 */

import { Router, type Request, type Response } from "express";
import https from "https";
import mysql from "mysql2/promise";

export const agentSearchRouter = Router();

const AZURE_ENDPOINT = "soworkclawagents.openai.azure.com";
const AZURE_KEY = "EMw03pDcy50OuvxhLf6Ad2a5bMDWdkxCwEaXbnqCUT44D9WZp8MqJQQJ99CCACYeBjFXJ3w3AAAAACOGi40x";
const DEPLOYMENT = "text-embedding-3-small";

// ── Local DB pool ─────────────────────────────────────────────────────────────
const localPool = mysql.createPool({
  host: "localhost",
  user: process.env.LOCAL_DB_USER || "mos_user",
  password: process.env.LOCAL_DB_PASSWORD || "mos_secure_2026",
  database: process.env.LOCAL_DB_NAME || "mos_db",
  connectionLimit: 5,
});

// ── Embedding helper ──────────────────────────────────────────────────────────
async function getQueryEmbedding(text: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ input: text });
    const options = {
      hostname: AZURE_ENDPOINT,
      path: `/openai/deployments/${DEPLOYMENT}/embeddings?api-version=2024-02-01`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_KEY,
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.data?.[0]?.embedding) resolve(parsed.data[0].embedding);
          else reject(new Error(JSON.stringify(parsed)));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) * (a[i] ?? 0);
    normB += (b[i] ?? 0) * (b[i] ?? 0);
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── POST /api/agents/search ───────────────────────────────────────────────────
agentSearchRouter.post("/", async (req: Request, res: Response) => {
  const { query, limit = 10, layer, industry, market } = req.body;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ error: "query is required" });
  }

  const topK = Math.min(Math.max(parseInt(String(limit)) || 10, 1), 50);

  try {
    // 1. Embed the query
    const queryVec = await getQueryEmbedding(query.trim());

    // 2. Fetch candidates from DB (with optional filters)
    let whereClauses = ["a.isAvailable = 1", "ae.embedding IS NOT NULL"];
    const params: any[] = [];

    if (layer && ["strategy", "execution", "training"].includes(layer)) {
      whereClauses.push("a.layer = ?");
      params.push(layer);
    }
    if (industry) {
      whereClauses.push("(a.industry LIKE ? OR a.specialty LIKE ?)");
      params.push(`%${industry}%`, `%${industry}%`);
    }
    if (market) {
      whereClauses.push("(a.market = ? OR a.market IS NULL)");
      params.push(market);
    }

    const whereSQL = whereClauses.join(" AND ");
    const [rows] = await localPool.execute<any[]>(
      `SELECT a.id, a.slug, a.name, a.title, a.layer, a.specialty, a.bio,
              a.rating, a.taskCount, a.pricePerTask, a.priceMonthly,
              a.avatarUrl, a.industry, a.jobLevel,
              ae.embedding
       FROM agents a
       JOIN agent_embeddings ae ON a.id = ae.agent_id
       WHERE ${whereSQL}
       LIMIT 2000`,
      params
    );

    // 3. Score by cosine similarity
    const scored = (rows as any[]).map((row) => {
      let embedding: number[];
      try {
        embedding = typeof row.embedding === "string"
          ? JSON.parse(row.embedding)
          : row.embedding;
      } catch {
        embedding = [];
      }
      const score = embedding.length > 0 ? cosineSimilarity(queryVec, embedding) : 0;
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        title: row.title,
        layer: row.layer,
        specialty: row.specialty,
        bio: row.bio,
        rating: row.rating,
        taskCount: row.taskCount,
        pricePerTask: row.pricePerTask,
        priceMonthly: row.priceMonthly,
        avatarUrl: row.avatarUrl,
        industry: row.industry,
        jobLevel: row.jobLevel,
        score: Math.round(score * 10000) / 10000,
      };
    });

    // 4. Sort and return top-K
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, topK);

    return res.json({
      query,
      total_candidates: rows.length,
      results,
    });
  } catch (err: any) {
    console.error("[agent-search] error:", err.message);
    return res.status(500).json({ error: "Search failed", detail: err.message });
  }
});

// ── GET /api/agents/search (quick test) ──────────────────────────────────────
agentSearchRouter.get("/test", async (_req: Request, res: Response) => {
  try {
    const vec = await getQueryEmbedding("SEO 策略師");
    return res.json({ ok: true, dims: vec.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});
