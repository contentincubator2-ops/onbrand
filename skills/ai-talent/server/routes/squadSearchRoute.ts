/**
 * Squad Search Route
 * POST /api/squads/search
 *
 * 搜尋策略：
 * 1. 先用 query embedding 對比 leader agent 的向量（語意相似）
 * 2. 再疊加 name / taskType / tags 關鍵字加權
 * 3. 合併排序後回傳 top-K
 */

import { Router, type Request, type Response } from "express";
import https from "https";
import mysql from "mysql2/promise";

export const squadSearchRouter = Router();

const AZURE_ENDPOINT = "soworkclawagents.openai.azure.com";
const AZURE_KEY = "EMw03pDcy50OuvxhLf6Ad2a5bMDWdkxCwEaXbnqCUT44D9WZp8MqJQQJ99CCACYeBjFXJ3w3AAAAACOGi40x";
const DEPLOYMENT = "text-embedding-3-small";

const localPool = mysql.createPool({
  host: "localhost",
  user: process.env.LOCAL_DB_USER || "mos_user",
  password: process.env.LOCAL_DB_PASSWORD || "mos_secure_2026",
  database: process.env.LOCAL_DB_NAME || "mos_db",
  connectionLimit: 5,
});

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
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (p.data?.[0]?.embedding) resolve(p.data[0].embedding);
          else reject(new Error(JSON.stringify(p)));
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) * (a[i] ?? 0);
    normB += (b[i] ?? 0) * (b[i] ?? 0);
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── POST /api/squads/search ───────────────────────────────────────────────────
squadSearchRouter.post("/", async (req: Request, res: Response) => {
  const { query, limit = 10, squad_type, market, company_size } = req.body;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ error: "query is required" });
  }

  const topK = Math.min(Math.max(parseInt(String(limit)) || 10, 1), 50);

  try {
    // 1. Embed query
    const queryVec = await getQueryEmbedding(query.trim());

    // 2. 取 squads + leader agent 的 embedding
    let whereClauses = ["s.is_active = 1"];
    const params: any[] = [];

    if (squad_type) {
      whereClauses.push("s.squad_type = ?");
      params.push(squad_type);
    }
    if (market) {
      whereClauses.push("s.market = ?");
      params.push(market);
    }
    if (company_size) {
      whereClauses.push("(s.company_size = ? OR s.company_size = 'all')");
      params.push(company_size);
    }

    const whereSQL = whereClauses.join(" AND ");

    // 取 squad + leader embedding（透過 members JSON 找 leader agent_id）
    const [rows] = await localPool.execute<any[]>(
      `SELECT s.id, s.slug, s.name, s.name_en, s.description,
              s.squad_type, s.market, s.company_size, s.squad_tier,
              s.taskType, s.tags, s.members,
              ae.embedding as leader_embedding
       FROM agent_squads s
       LEFT JOIN agent_embeddings ae ON ae.agent_id = (
         SELECT JSON_UNQUOTE(JSON_EXTRACT(m.value, '$.agent_id'))
         FROM JSON_TABLE(s.members, '$[*]' COLUMNS (
           value JSON PATH '$'
         )) AS m
         WHERE JSON_EXTRACT(m.value, '$.is_lead') = true
         LIMIT 1
       )
       WHERE ${whereSQL}
       LIMIT 1000`,
      params
    );

    // 3. Score each squad
    const lowerQuery = query.toLowerCase();
    const scored = (rows as any[]).map((row) => {
      // Vector score via leader embedding
      let vecScore = 0;
      if (row.leader_embedding) {
        try {
          const leaderVec: number[] = typeof row.leader_embedding === "string"
            ? JSON.parse(row.leader_embedding)
            : row.leader_embedding;
          vecScore = cosineSimilarity(queryVec, leaderVec);
        } catch { vecScore = 0; }
      }

      // Keyword score
      let kwScore = 0;
      const name = (row.name || "").toLowerCase();
      const nameEn = (row.name_en || "").toLowerCase();
      const taskType = (row.taskType || "").toLowerCase();
      const tags = (() => {
        try { return JSON.parse(row.tags || "[]").join(" ").toLowerCase(); }
        catch { return ""; }
      })();

      if (name.includes(lowerQuery) || nameEn.includes(lowerQuery)) kwScore += 0.3;
      if (taskType.includes(lowerQuery)) kwScore += 0.2;
      if (tags.includes(lowerQuery)) kwScore += 0.1;

      const finalScore = vecScore * 0.7 + kwScore;

      // Parse members for response
      let members: any[] = [];
      try { members = JSON.parse(row.members || "[]"); } catch { members = []; }
      const memberCount = Array.isArray(members) ? members.length : 0;

      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        name_en: row.name_en,
        description: row.description,
        squad_type: row.squad_type,
        market: row.market,
        company_size: row.company_size,
        squad_tier: row.squad_tier,
        taskType: row.taskType,
        member_count: memberCount,
        score: Math.round(finalScore * 10000) / 10000,
        vec_score: Math.round(vecScore * 10000) / 10000,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, topK);

    return res.json({ query, total_candidates: rows.length, results });

  } catch (err: any) {
    console.error("[squad-search] error:", err.message);
    return res.status(500).json({ error: "Search failed", detail: err.message });
  }
});
