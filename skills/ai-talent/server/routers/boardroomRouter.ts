/**
 * boardroomRouter — 「比稿（邀比稿）」流程
 *
 * 三步：
 *   1) recommendAgents(query)  — 用戶輸入需求，回傳 12–20 位匹配 agent
 *   2) （前端）用戶勾選 3–5 位
 *   3) pitch(agentIds, query)  — 被選中的 agent 各自比稿提案
 *
 * 不再寫死「6 位顧問 / 一層一個 lead」 — 完全依用戶 query 動態挑 agent。
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { callModel, type ModelProvider } from "../_core/multiModelRouter";
import { buildBrandPrefix } from "../_core/brandContext";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ─── aiModel → provider mapping ────────────────────────────────────────────
function mapAiModelToProvider(aiModel: string | null | undefined): ModelProvider {
  const m = (aiModel || "").toLowerCase();
  if (!m) return "azure-foundry";
  if (m.includes("azure") || m.startsWith("gpt-5") || m.startsWith("gpt-4o") ||
      m.startsWith("gpt-4.1") || m.startsWith("o3") || m.startsWith("o4") ||
      m.includes("phi-") || m.includes("llama") || m.includes("deepseek") ||
      m.includes("kimi") || m.includes("mai-") || m.includes("mistral") ||
      m.includes("gemma") || m.startsWith("gpt-")) return "azure-foundry";
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("qwen") || m.includes("dashscope")) return "qwen";
  if (m.includes("glm") || m.includes("zhipu")) return "zhipu";
  if (m.includes("perplex") || m.startsWith("sonar")) return "perplexity";
  if (m.includes("forge") || m.includes("manus")) return "forge";
  return "azure-foundry";
}

// ─── Types ─────────────────────────────────────────────────────────────────
export type CandidateAgent = {
  agentId: number;
  name: string;
  title: string;
  bio: string | null;
  primarySkill: string | null;
  aiModel: string;
  providerBucket: ModelProvider;
  /** Squad they lead (preferred) or are a member of, if any. */
  squadId: number | null;
  squadSlug: string | null;
  squadName: string | null;
  squadMethodology: string | null;
  squadStrategyLayer: string | null;
  /** 0–100 — higher = more relevant to user's query. */
  matchScore: number;
  matchReasons: string[];
};

// ─── Query keyword extraction ──────────────────────────────────────────────
//
// Cheap-and-cheerful keyword extractor: split on punctuation/spaces, drop
// stop-words, return up to 8 tokens. Used to fuzzy-match against agent skills,
// titles, bios, and squad methodology fields.

const STOP_WORDS = new Set([
  "的","了","是","我","要","想","做","幫","在","和","與","或",
  "怎麼","如何","什麼","可以","需要","請","給","幫忙","一下",
  "the","a","an","is","are","to","for","of","and","or","with","my","our","i","want","need","help",
]);

function extractKeywords(query: string): string[] {
  const cleaned = query
    .toLowerCase()
    .replace(/[，。！？、,.!?;:()\[\]{}「」『』""'']/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  // De-dup, cap at 8
  return Array.from(new Set(cleaned)).slice(0, 8);
}

// ─── Recommend agents ──────────────────────────────────────────────────────
async function recommendAgents(
  query: string,
  limit: number
): Promise<CandidateAgent[]> {
  const db = await getDb();
  if (!db) return [];

  const keywords = extractKeywords(query);
  const fallbackQuery = (query || "").trim();

  // Build a dynamic LIKE-OR clause across relevant text columns.
  // Each keyword scores 1 point per column hit; final ORDER BY score DESC.
  if (keywords.length === 0) {
    // No useful keywords — return a curated mix of squad leads as fallback.
    const [rows] = (await db.execute(sql`
      SELECT a.id, a.name, a.title, a.bio,
             COALESCE(a.primarySkill,'') AS primarySkill,
             COALESCE(a.aiModel,'')      AS aiModel,
             s.id   AS squadId,
             s.slug AS squadSlug,
             s.name AS squadName,
             s.methodology    AS squadMethodology,
             s.strategy_layer AS squadStrategyLayer
        FROM agents a
        LEFT JOIN squads s ON s.lead_agent_id = a.id AND s.is_active = 1
       WHERE a.id IS NOT NULL
       ORDER BY (s.id IS NOT NULL) DESC, RAND()
       LIMIT ${limit}
    `)) as any;
    return (rows ?? []).map((r: any) => buildCandidate(r, [], fallbackQuery));
  }

  // Build score expression: COUNT keyword hits across columns
  const likeFragments: string[] = [];
  const params: string[] = [];
  for (const kw of keywords) {
    const like = `%${kw}%`;
    likeFragments.push(`
      (a.name LIKE ?) +
      (a.title LIKE ?) +
      (COALESCE(a.bio,'') LIKE ?) +
      (COALESCE(a.primarySkill,'') LIKE ?) +
      (COALESCE(s.methodology,'') LIKE ?) +
      (COALESCE(s.name,'') LIKE ?)
    `);
    params.push(like, like, like, like, like, like);
  }
  const scoreExpr = likeFragments.join(" + ");

  const sqlText = `
    SELECT a.id, a.name, a.title, a.bio,
           COALESCE(a.primarySkill,'') AS primarySkill,
           COALESCE(a.aiModel,'')      AS aiModel,
           s.id   AS squadId,
           s.slug AS squadSlug,
           s.name AS squadName,
           s.methodology    AS squadMethodology,
           s.strategy_layer AS squadStrategyLayer,
           (${scoreExpr}) AS matchScore
      FROM agents a
      LEFT JOIN (
        SELECT lead_agent_id, MIN(id) AS sid
          FROM squads WHERE is_active=1 AND lead_agent_id IS NOT NULL
         GROUP BY lead_agent_id
      ) ls ON ls.lead_agent_id = a.id
      LEFT JOIN squads s ON s.id = ls.sid
     WHERE a.name IS NOT NULL
    HAVING matchScore > 0
     ORDER BY matchScore DESC, (s.id IS NOT NULL) DESC
     LIMIT ${limit}
  `;

  // Use raw mysql driver via getDb — drizzle .execute(sql\`\`) doesn't bind
  // dynamic-arity ? placeholders cleanly for this many params, so fallback
  // to db.driver-level query.
  const conn = (db as any).$client ?? (db as any).pool ?? null;
  let rows: any[] = [];
  if (conn?.query) {
    const [r] = await conn.query(sqlText, params);
    rows = r as any[];
  } else {
    // Drizzle path: bake the LIKE values into the SQL safely (params are %kw% which we pre-escape)
    const safe = params.map((p) => p.replace(/'/g, "''"));
    let baked = sqlText;
    let idx = 0;
    baked = baked.replace(/\?/g, () => `'${safe[idx++]}'`);
    const [r] = (await db.execute(sql.raw(baked))) as any;
    rows = r ?? [];
  }

  return rows.map((r: any) => buildCandidate(r, keywords, fallbackQuery));
}

function buildCandidate(r: any, keywords: string[], _query: string): CandidateAgent {
  const reasons: string[] = [];
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if ((r.primarySkill || "").toLowerCase().includes(k)) reasons.push(`專長: ${kw}`);
    else if ((r.squadMethodology || "").toLowerCase().includes(k)) reasons.push(`方法論: ${kw}`);
    else if ((r.title || "").toLowerCase().includes(k)) reasons.push(`職稱: ${kw}`);
    else if ((r.bio || "").toLowerCase().includes(k)) reasons.push(`背景: ${kw}`);
    if (reasons.length >= 3) break;
  }
  return {
    agentId: Number(r.id),
    name: String(r.name ?? ""),
    title: String(r.title ?? ""),
    bio: r.bio ? String(r.bio) : null,
    primarySkill: r.primarySkill || null,
    aiModel: String(r.aiModel || ""),
    providerBucket: mapAiModelToProvider(r.aiModel),
    squadId: r.squadId ? Number(r.squadId) : null,
    squadSlug: r.squadSlug ? String(r.squadSlug) : null,
    squadName: r.squadName ? String(r.squadName) : null,
    squadMethodology: r.squadMethodology ? String(r.squadMethodology) : null,
    squadStrategyLayer: r.squadStrategyLayer ? String(r.squadStrategyLayer) : null,
    matchScore: Math.min(100, Math.round(Number(r.matchScore ?? 0) * 10)),
    matchReasons: reasons,
  };
}

// ─── Pitch (selected agents propose) ───────────────────────────────────────
async function buildPitchPrompt(c: CandidateAgent, brandPrefix: string, query: string) {
  const methodologyLine = c.squadMethodology
    ? `你帶領（或所屬）的小組「${c.squadName}」核心方法論：${c.squadMethodology}`
    : c.primarySkill
    ? `你最擅長的領域：${c.primarySkill}`
    : "";

  const system = `你是 ${c.name}，${c.title}。
${c.bio ? `你的背景：${c.bio}` : ""}
${methodologyLine}

你正在參加「邀比稿」 — 客戶會聽完所有受邀者的提案後選一個合作。
語氣：第一次見客戶，帶觀點、不寒暄、有自信但不油。中文回答。

請嚴格依下列 4 段格式輸出（每段用「## 」開頭）：

## 我看見的問題
（一句話最敢講的診斷，不超過 60 字）

## 我會這樣做
（3–5 個編號步驟，用您的方法論視角回答）

## 第一週可交付
（具體 1–3 件可看見的東西）

## 為什麼選我而不是別人
（30 字內，講你獨特的角度，不講「我很努力」這種廢話）`;

  const user = `客戶的需求：
${query}

${brandPrefix ? `品牌資訊：${brandPrefix}` : ""}

請以 ${c.name} 的身份提案。`;

  return { system, user };
}

async function callPitchWithFallback(
  system: string,
  user: string,
  preferred: ModelProvider
) {
  const order: ModelProvider[] = [];
  const seen = new Set<ModelProvider>();
  const push = (p: ModelProvider) => { if (!seen.has(p)) { order.push(p); seen.add(p); } };
  push(preferred);
  push("azure-foundry");
  push("forge");
  push("qwen");
  push("zhipu");
  push("openai");

  let firstErr: any = null;
  for (const p of order) {
    try {
      return await callModel(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        undefined,
        p
      );
    } catch (e) {
      if (!firstErr) firstErr = e;
    }
  }
  throw firstErr ?? new Error("All providers unavailable");
}

// ─── Router ────────────────────────────────────────────────────────────────
export const boardroomRouter = router({
  /**
   * Step 1 — recommend candidate agents based on user's query.
   * No layer constraint, no fixed 6 — agents ranked purely by relevance.
   */
  recommendAgents: protectedProcedure
    .input(
      z.object({
        brandId: z.number().optional(),
        query: z.string().min(2),
        limit: z.number().min(1).max(40).optional(),
      })
    )
    .query(async ({ input }) => {
      const limit = input.limit ?? 12;
      const candidates = await recommendAgents(input.query, limit);
      return {
        query: input.query,
        keywords: extractKeywords(input.query),
        candidates,
      };
    }),

  /**
   * Step 3 — selected agents each pitch a proposal.
   * Each pitch uses the agent's own aiModel (mapped to provider).
   */
  pitch: protectedProcedure
    .input(
      z.object({
        brandId: z.number().optional(),
        query: z.string().min(2),
        agentIds: z.array(z.number()).min(1).max(8),
      })
    )
    .mutation(async ({ input }) => {
      const brandPrefix = input.brandId ? await buildBrandPrefix(input.brandId) : "";

      // Re-fetch each selected agent with their squad context (so we don't
      // trust the client-provided fields).
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const candidates: CandidateAgent[] = [];
      for (const id of input.agentIds) {
        const [rows] = (await db.execute(sql`
          SELECT a.id, a.name, a.title, a.bio,
                 COALESCE(a.primarySkill,'') AS primarySkill,
                 COALESCE(a.aiModel,'')      AS aiModel,
                 s.id   AS squadId,
                 s.slug AS squadSlug,
                 s.name AS squadName,
                 s.methodology    AS squadMethodology,
                 s.strategy_layer AS squadStrategyLayer
            FROM agents a
            LEFT JOIN squads s ON s.lead_agent_id = a.id AND s.is_active = 1
           WHERE a.id = ${id}
           LIMIT 1
        `)) as any;
        const r = (rows ?? [])[0];
        if (r) candidates.push(buildCandidate(r, [], input.query));
      }

      const pitches = await Promise.all(
        candidates.map(async (c) => {
          try {
            const { system, user } = await buildPitchPrompt(c, brandPrefix, input.query);
            const result = await callPitchWithFallback(system, user, c.providerBucket);
            return {
              ...c,
              proposal: result.content,
              provider: result.provider,
              model: result.model,
              error: null as string | null,
            };
          } catch (err: any) {
            return {
              ...c,
              proposal: "",
              provider: c.providerBucket,
              model: "",
              error: String(err?.message ?? err),
            };
          }
        })
      );

      return {
        query: input.query,
        brandInjected: brandPrefix.length > 0,
        pitches,
        timestamp: new Date().toISOString(),
      };
    }),
});
