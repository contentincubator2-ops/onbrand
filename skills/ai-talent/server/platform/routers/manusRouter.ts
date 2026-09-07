/**
 * manusRouter — read-only, API-key-protected access to public mos_db evidence.
 *
 * Mounted at /api/manus. All endpoints require X-Manus-Key.
 * Sensitive runtime, credential, system-prompt, and internal tool fields are excluded.
 */

import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import localPool from "../../localDb.js";

export const manusRouter = Router();

const MANUS_MOS_API_KEY = process.env.MANUS_MOS_API_KEY || "";
const DATA_ANALYSIS_PATTERN =
  "data analyst|data scientist|data engineer|business intelligence|analytics|statistical|statistics|forecast|attribution|market research|social listening|consumer insight|data visualization|measurement|research|intelligence|insight|數據|資料分析|市場研究|輿情|洞察";

function secureEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function requireManusKey(req: Request, res: Response, next: NextFunction): void {
  if (!MANUS_MOS_API_KEY) {
    res.status(503).json({ error: "MANUS_MOS_API_KEY not configured on server" });
    return;
  }
  const provided = req.header("X-Manus-Key") || "";
  if (!provided || !secureEqual(provided, MANUS_MOS_API_KEY)) {
    res.status(401).json({ error: "Invalid or missing X-Manus-Key header" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  next();
}

manusRouter.use(requireManusKey);

const AGENT_PUBLIC_FIELDS = [
  "id", "slug", "name", "englishName", "name_zh",
  "title", "englishTitle", "title_zh",
  "layer", "industry", "industries", "jobLevel", "taskType",
  "avatarUrl", "coverUrl",
  "bio", "bio_en", "bio_zh", "experienceDetail",
  "specialty", "specialty_en", "specialtySummary",
  "primarySkill", "methodology",
  "atomicSkillKeys", "workflowKeys", "deliverableKeys",
  "priceMonthly", "pricePerTask",
  "rating", "reviewCount", "taskCount",
  "isAvailable", "isFeatured", "hireCount", "taskEarnCount",
  "workspace", "caseStudies", "skills",
  "createdAt", "updatedAt",
].join(", ");

const SKILL_PUBLIC_FIELDS = [
  "id", "slug", "name", "name_zh", "category", "strategy_layer",
  "source", "source_url", "description", "description_zh",
  "compatible_models", "quality_score", "task_type",
  "mockup_platform", "mockup_format",
  "recommended_models", "alternative_models", "unsuitable_models",
  "created_at", "updated_at",
].join(", ");

function pagination(req: Request): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit || "50"), 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

function acceptOnlyOne(raw: unknown, parameter: string, res: Response): boolean {
  if (raw === undefined || raw === "1") return true;
  res.status(400).json({ error: `${parameter} only accepts the single value 1` });
  return false;
}

function pageResponse(data: unknown[], page: number, limit: number, total: number) {
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

manusRouter.get("/", (_req: Request, res: Response): void => {
  res.json({
    name: "SoWork mos_db read-only API for Manus",
    auth: { header: "X-Manus-Key" },
    endpoints: {
      agents: "GET /api/manus/agents?page=1&limit=50&search=&layer=&industry=&available=1&focus=data-analysis",
      agentById: "GET /api/manus/agents/:id",
      agentBySlug: "GET /api/manus/agents/slug/:slug",
      skills: "GET /api/manus/skills?page=1&limit=50&search=&category=&active=1&focus=data-analysis",
      skillById: "GET /api/manus/skills/:id",
      skillBySlug: "GET /api/manus/skills/slug/:slug",
      stats: "GET /api/manus/stats",
      openapi: "GET /api/manus/openapi.json",
    },
    safety: "Read-only public business fields. Secrets, system prompts, model config, and internal tool instructions are excluded.",
  });
});

manusRouter.get("/openapi.json", (_req: Request, res: Response): void => {
  const base = "https://onbrand.sowork.ai";
  const security = [{ ManusKey: [] }];
  res.json({
    openapi: "3.0.3",
    info: {
      title: "SoWork mos_db Read-only API",
      version: "1.0.0",
      description: "Paginated public agent/skill evidence and live statistics for SoWork website research.",
    },
    servers: [{ url: base }],
    components: {
      securitySchemes: {
        ManusKey: { type: "apiKey", in: "header", name: "X-Manus-Key" },
      },
    },
    security,
    paths: {
      "/api/manus": { get: { summary: "API guide", responses: { "200": { description: "Guide" } } } },
      "/api/manus/agents": {
        get: {
          summary: "List/search approved agents",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "layer", in: "query", schema: { type: "string", enum: ["strategy", "execution", "training"] } },
            { name: "industry", in: "query", schema: { type: "string" } },
            { name: "available", in: "query", description: "Only value 1 is accepted; unavailable agents are never exposed.", schema: { type: "string", enum: ["1"] } },
            { name: "focus", in: "query", schema: { type: "string", enum: ["data-analysis"] } },
          ],
          responses: { "200": { description: "Paginated agents" } },
        },
      },
      "/api/manus/agents/{id}": {
        get: {
          summary: "Get agent by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Agent" }, "404": { description: "Not found" } },
        },
      },
      "/api/manus/agents/slug/{slug}": {
        get: {
          summary: "Get agent by slug",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Agent" }, "404": { description: "Not found" } },
        },
      },
      "/api/manus/skills": {
        get: {
          summary: "List/search active skills",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "active", in: "query", description: "Only value 1 is accepted; inactive skills are never exposed.", schema: { type: "string", enum: ["1"] } },
            { name: "focus", in: "query", schema: { type: "string", enum: ["data-analysis"] } },
          ],
          responses: { "200": { description: "Paginated skills" } },
        },
      },
      "/api/manus/skills/{id}": {
        get: {
          summary: "Get skill by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Skill" }, "404": { description: "Not found" } },
        },
      },
      "/api/manus/skills/slug/{slug}": {
        get: {
          summary: "Get skill by slug",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Skill" }, "404": { description: "Not found" } },
        },
      },
      "/api/manus/stats": {
        get: { summary: "Live Agent, Skill, and data-analysis statistics", responses: { "200": { description: "Statistics" } } },
      },
    },
  });
});

manusRouter.get("/agents", async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, offset } = pagination(req);
    const conditions: string[] = ["reviewStatus = 'approved'", "isAvailable = 1"];
    const params: Array<string | number> = [];

    if (!acceptOnlyOne(req.query.available, "available", res)) return;
    if (req.query.layer) {
      const layer = String(req.query.layer);
      if (!["strategy", "execution", "training"].includes(layer)) {
        res.status(400).json({ error: "Invalid layer" });
        return;
      }
      conditions.push("layer = ?");
      params.push(layer);
    }
    if (req.query.industry) {
      conditions.push("industry = ?");
      params.push(String(req.query.industry));
    }
    if (req.query.search) {
      const q = `%${String(req.query.search).trim()}%`;
      conditions.push("(name LIKE ? OR englishName LIKE ? OR name_zh LIKE ? OR title LIKE ? OR englishTitle LIKE ? OR title_zh LIKE ? OR primarySkill LIKE ? OR specialty LIKE ? OR specialty_en LIKE ?)");
      params.push(q, q, q, q, q, q, q, q, q);
    }
    if (req.query.focus === "data-analysis") {
      conditions.push("LOWER(CONCAT_WS(' ', englishTitle, title, primarySkill, specialty, specialty_en, bio_en)) REGEXP ?");
      params.push(DATA_ANALYSIS_PATTERN);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const [countRows] = await (localPool as any).query(`SELECT COUNT(*) AS total FROM agents ${where}`, params);
    const total = Number((countRows as any[])[0]?.total || 0);
    const [rows] = await (localPool as any).query(
      `SELECT ${AGENT_PUBLIC_FIELDS} FROM agents ${where} ORDER BY hireCount DESC, rating DESC, id ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    res.json(pageResponse(rows as unknown[], page, limit, total));
  } catch (err: any) {
    console.error("[manusRouter] GET /agents error:", err?.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

manusRouter.get("/agents/slug/:slug", async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await (localPool as any).query(
      `SELECT ${AGENT_PUBLIC_FIELDS} FROM agents WHERE slug = ? AND reviewStatus = 'approved' AND isAvailable = 1 LIMIT 1`,
      [req.params.slug],
    );
    const data = rows as any[];
    if (!data.length) { res.status(404).json({ error: "Agent not found" }); return; }
    res.json({ data: data[0] });
  } catch (err: any) {
    console.error("[manusRouter] GET /agents/slug error:", err?.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

manusRouter.get("/agents/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number.parseInt(req.params.id as string, 10);
    if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid agent id" }); return; }
    const [rows] = await (localPool as any).query(
      `SELECT ${AGENT_PUBLIC_FIELDS} FROM agents WHERE id = ? AND reviewStatus = 'approved' AND isAvailable = 1 LIMIT 1`,
      [id],
    );
    const data = rows as any[];
    if (!data.length) { res.status(404).json({ error: "Agent not found" }); return; }
    res.json({ data: data[0] });
  } catch (err: any) {
    console.error("[manusRouter] GET /agents/:id error:", err?.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

manusRouter.get("/skills", async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, offset } = pagination(req);
    const conditions: string[] = ["is_active = 1"];
    const params: Array<string | number> = [];

    if (!acceptOnlyOne(req.query.active, "active", res)) return;
    if (req.query.category) {
      conditions.push("category = ?");
      params.push(String(req.query.category));
    }
    if (req.query.search) {
      const q = `%${String(req.query.search).trim()}%`;
      conditions.push("(name LIKE ? OR name_zh LIKE ? OR slug LIKE ? OR description LIKE ? OR description_zh LIKE ? OR category LIKE ?)");
      params.push(q, q, q, q, q, q);
    }
    if (req.query.focus === "data-analysis") {
      conditions.push("LOWER(CONCAT_WS(' ', name, name_zh, slug, category, description, description_zh)) REGEXP ?");
      params.push(DATA_ANALYSIS_PATTERN);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [countRows] = await (localPool as any).query(`SELECT COUNT(*) AS total FROM skills ${where}`, params);
    const total = Number((countRows as any[])[0]?.total || 0);
    const [rows] = await (localPool as any).query(
      `SELECT ${SKILL_PUBLIC_FIELDS} FROM skills ${where} ORDER BY quality_score DESC, id ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    res.json(pageResponse(rows as unknown[], page, limit, total));
  } catch (err: any) {
    console.error("[manusRouter] GET /skills error:", err?.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

manusRouter.get("/skills/slug/:slug", async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await (localPool as any).query(
      `SELECT ${SKILL_PUBLIC_FIELDS} FROM skills WHERE slug = ? AND is_active = 1 LIMIT 1`,
      [req.params.slug],
    );
    const data = rows as any[];
    if (!data.length) { res.status(404).json({ error: "Skill not found" }); return; }
    res.json({ data: data[0] });
  } catch (err: any) {
    console.error("[manusRouter] GET /skills/slug error:", err?.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

manusRouter.get("/skills/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number.parseInt(req.params.id as string, 10);
    if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid skill id" }); return; }
    const [rows] = await (localPool as any).query(
      `SELECT ${SKILL_PUBLIC_FIELDS} FROM skills WHERE id = ? AND is_active = 1 LIMIT 1`,
      [id],
    );
    const data = rows as any[];
    if (!data.length) { res.status(404).json({ error: "Skill not found" }); return; }
    res.json({ data: data[0] });
  } catch (err: any) {
    console.error("[manusRouter] GET /skills/:id error:", err?.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

manusRouter.get("/stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      [countsRows],
      [layersRows],
      [topPrimarySkillsRows],
      [skillCategoriesRows],
      [topDataRolesRows],
      [topDataPrimarySkillsRows],
      [topDataSkillsRows],
    ] = await Promise.all([
      (localPool as any).query(
        `SELECT
          (SELECT COUNT(*) FROM agents WHERE isAvailable=1 AND reviewStatus='approved') AS availableApprovedAgents,
          (SELECT COUNT(*) FROM skills WHERE is_active=1) AS activeSkills,
          (SELECT COUNT(*) FROM skill_catalog) AS harvestedSkillCatalog,
          (SELECT COUNT(DISTINCT primarySkill) FROM agents WHERE isAvailable=1 AND reviewStatus='approved' AND primarySkill IS NOT NULL AND primarySkill != '') AS distinctPrimarySkills,
          (SELECT COUNT(*) FROM agents WHERE isAvailable=1 AND reviewStatus='approved' AND LOWER(CONCAT_WS(' ', englishTitle, title, primarySkill, specialty, specialty_en, bio_en)) REGEXP ?) AS dataAnalysisAgents,
          (SELECT COUNT(*) FROM skills WHERE is_active=1 AND LOWER(CONCAT_WS(' ', name, name_zh, slug, category, description, description_zh)) REGEXP ?) AS dataAnalysisSkills`,
        [DATA_ANALYSIS_PATTERN, DATA_ANALYSIS_PATTERN],
      ),
      (localPool as any).query(
        "SELECT layer, COUNT(*) AS count FROM agents WHERE isAvailable=1 AND reviewStatus='approved' GROUP BY layer ORDER BY count DESC",
      ),
      (localPool as any).query(
        "SELECT primarySkill, COUNT(*) AS agentCount, SUM(hireCount) AS totalHires FROM agents WHERE isAvailable=1 AND reviewStatus='approved' AND primarySkill IS NOT NULL AND primarySkill != '' GROUP BY primarySkill ORDER BY agentCount DESC, totalHires DESC LIMIT 20",
      ),
      (localPool as any).query(
        "SELECT COALESCE(category, 'uncategorized') AS category, COUNT(*) AS skillCount FROM skills WHERE is_active=1 GROUP BY category ORDER BY skillCount DESC LIMIT 30",
      ),
      (localPool as any).query(
        "SELECT COALESCE(NULLIF(englishTitle,''), NULLIF(title,''), 'Other') AS role, COUNT(*) AS agentCount, SUM(hireCount) AS totalHires FROM agents WHERE isAvailable=1 AND reviewStatus='approved' AND LOWER(CONCAT_WS(' ', englishTitle, title, primarySkill, specialty, specialty_en, bio_en)) REGEXP ? GROUP BY role ORDER BY agentCount DESC, totalHires DESC LIMIT 20",
        [DATA_ANALYSIS_PATTERN],
      ),
      (localPool as any).query(
        "SELECT primarySkill, COUNT(*) AS agentCount, SUM(hireCount) AS totalHires FROM agents WHERE isAvailable=1 AND reviewStatus='approved' AND primarySkill IS NOT NULL AND primarySkill != '' AND LOWER(CONCAT_WS(' ', englishTitle, title, primarySkill, specialty, specialty_en, bio_en)) REGEXP ? GROUP BY primarySkill ORDER BY agentCount DESC, totalHires DESC LIMIT 20",
        [DATA_ANALYSIS_PATTERN],
      ),
      (localPool as any).query(
        `SELECT id, slug, name, name_zh, category, description, description_zh, quality_score
           FROM skills
          WHERE is_active=1
            AND LOWER(CONCAT_WS(' ', name, name_zh, slug, category, description, description_zh)) REGEXP ?
          ORDER BY quality_score DESC, id ASC
          LIMIT 30`,
        [DATA_ANALYSIS_PATTERN],
      ),
    ]);

    const rawCounts = (countsRows as any[])[0] || {};
    const counts = Object.fromEntries(Object.entries(rawCounts).map(([key, value]) => [key, Number(value)]));
    res.json({
      generatedAt: new Date().toISOString(),
      source: "Live mos_db; approved and available records only where applicable",
      counts,
      agentsByLayer: layersRows,
      topPrimarySkills: topPrimarySkillsRows,
      skillCategories: skillCategoriesRows,
      dataAnalysis: {
        agentCount: counts.dataAnalysisAgents,
        skillCount: counts.dataAnalysisSkills,
        topRoles: topDataRolesRows,
        topPrimarySkills: topDataPrimarySkillsRows,
        representativeSkills: topDataSkillsRows,
        filterDefinition: DATA_ANALYSIS_PATTERN,
      },
      usageNote: "Use these live counts as evidence. Do not infer external database/connectors or guaranteed outcomes that are not represented in this response.",
    });
  } catch (err: any) {
    console.error("[manusRouter] GET /stats error:", err?.message);
    res.status(500).json({ error: "Internal server error" });
  }
});
