/**
 * mosCatalog — read-only queries against the mos_db agent/skill catalog
 * (`agents` / `skills` / `skill_catalog` tables, living in the app's own
 * MySQL via localPool — "mos_db" is not a separate external database).
 *
 * 2026-09-23（CJ「你有接好mos_db的人選了嗎」→「它沒辦法存在我的電腦，
 * 只能存在VM上面」）：Claude Code 這個 session 本來想用本機 stdio MCP
 * bridge（scripts/mos-agents-mcp.js）打 https://onbrand.sowork.ai/api/manus，
 * 但那支橋需要 MOS_MANUS_API_KEY 存在本機環境變數——使用者要求金鑰永遠
 * 只能留在 VM 上，本機不能碰。解法是換個方向：在已經部署、金鑰本來就在
 * 的 OnBrand server 裡開一個新的遠端 MCP 端點（見 mosAgentsMcpRouter.ts），
 * 讓 Claude Code 直接連過去，本機完全不需要持有任何憑證。
 *
 * 這裡的查詢邏輯刻意跟 manusRouter.ts（掛在 /api/manus，給外部「Manus」
 * 產品用、需要 X-Manus-Key）各自獨立、沒有互相 import——manusRouter.ts
 * 是現行、外部依賴的既有端點，不因為這次新增而承擔任何改動風險；兩邊
 * 查詢邏輯目前重複，這是刻意的取捨，不是漏了共用。
 */
import localPool from "../../localDb.js";

export const MAX_LIMIT = 200;

export const DATA_ANALYSIS_PATTERN =
  "data analyst|data scientist|data engineer|business intelligence|analytics|statistical|statistics|forecast|attribution|market research|social listening|consumer insight|data visualization|measurement|research|intelligence|insight|數據|資料分析|市場研究|輿情|洞察";

// `agentCard` is curated, structured execution metadata. Raw system prompts,
// credentials, and internal tool configuration remain excluded from this MCP surface.
const AGENT_PUBLIC_FIELDS = [
  "id", "slug", "name", "englishName", "name_zh",
  "title", "englishTitle", "title_zh",
  "layer", "industry", "industries", "jobLevel", "taskType",
  "avatarUrl", "coverUrl",
  "bio", "bio_en", "bio_zh", "experienceDetail",
  "specialty", "specialty_en", "specialtySummary",
  "primarySkill", "primarySkillBundleKey", "methodology", "agentCard",
  "atomicSkillKeys", "workflowKeys", "deliverableKeys", "attached_skill_ids",
  "skillsProfileVersion", "skillsProfileSource", "skillsProfileConfidence", "skillsProfileUpdatedAt",
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

export function clampLimit(v: unknown, fallback = 50): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_LIMIT);
}

export function clampPage(v: unknown): number {
  const n = Math.floor(Number(v));
  return !Number.isFinite(n) || n < 1 ? 1 : n;
}

export interface PageResult<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function pageResult<T>(data: T[], page: number, limit: number, total: number): PageResult<T> {
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / Math.max(limit, 1)) } };
}

export async function searchAgents(params: {
  search?: string; layer?: string; industry?: string; focus?: string; page?: unknown; limit?: unknown;
}): Promise<PageResult<any>> {
  const page = clampPage(params.page);
  const limit = clampLimit(params.limit);
  const offset = (page - 1) * limit;
  const conditions: string[] = ["reviewStatus = 'approved'", "isAvailable = 1"];
  const sqlParams: Array<string | number> = [];

  if (params.layer) { conditions.push("layer = ?"); sqlParams.push(params.layer); }
  if (params.industry) { conditions.push("industry = ?"); sqlParams.push(params.industry); }
  if (params.search) {
    const q = `%${params.search.trim()}%`;
    conditions.push("(name LIKE ? OR englishName LIKE ? OR name_zh LIKE ? OR title LIKE ? OR englishTitle LIKE ? OR title_zh LIKE ? OR primarySkill LIKE ? OR specialty LIKE ? OR specialty_en LIKE ?)");
    sqlParams.push(q, q, q, q, q, q, q, q, q);
  }
  if (params.focus === "data-analysis") {
    conditions.push("LOWER(CONCAT_WS(' ', englishTitle, title, primarySkill, specialty, specialty_en, bio_en)) REGEXP ?");
    sqlParams.push(DATA_ANALYSIS_PATTERN);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const [countRows] = await (localPool as any).query(`SELECT COUNT(*) AS total FROM agents ${where}`, sqlParams);
  const total = Number((countRows as any[])[0]?.total || 0);
  const [rows] = await (localPool as any).query(
    `SELECT ${AGENT_PUBLIC_FIELDS} FROM agents ${where} ORDER BY hireCount DESC, rating DESC, id ASC LIMIT ? OFFSET ?`,
    [...sqlParams, limit, offset],
  );
  return pageResult(rows as any[], page, limit, total);
}

export async function getAgentById(id: number): Promise<any | null> {
  const [rows] = await (localPool as any).query(
    `SELECT ${AGENT_PUBLIC_FIELDS} FROM agents WHERE id = ? AND reviewStatus = 'approved' AND isAvailable = 1 LIMIT 1`,
    [id],
  );
  return (rows as any[])[0] ?? null;
}

export async function getAgentBySlug(slug: string): Promise<any | null> {
  const [rows] = await (localPool as any).query(
    `SELECT ${AGENT_PUBLIC_FIELDS} FROM agents WHERE slug = ? AND reviewStatus = 'approved' AND isAvailable = 1 LIMIT 1`,
    [slug],
  );
  return (rows as any[])[0] ?? null;
}

export async function searchSkills(params: {
  search?: string; category?: string; focus?: string; page?: unknown; limit?: unknown;
}): Promise<PageResult<any>> {
  const page = clampPage(params.page);
  const limit = clampLimit(params.limit);
  const offset = (page - 1) * limit;
  const conditions: string[] = ["is_active = 1"];
  const sqlParams: Array<string | number> = [];

  if (params.category) { conditions.push("category = ?"); sqlParams.push(params.category); }
  if (params.search) {
    const q = `%${params.search.trim()}%`;
    conditions.push("(name LIKE ? OR name_zh LIKE ? OR slug LIKE ? OR description LIKE ? OR description_zh LIKE ? OR category LIKE ?)");
    sqlParams.push(q, q, q, q, q, q);
  }
  if (params.focus === "data-analysis") {
    conditions.push("LOWER(CONCAT_WS(' ', name, name_zh, slug, category, description, description_zh)) REGEXP ?");
    sqlParams.push(DATA_ANALYSIS_PATTERN);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const [countRows] = await (localPool as any).query(`SELECT COUNT(*) AS total FROM skills ${where}`, sqlParams);
  const total = Number((countRows as any[])[0]?.total || 0);
  const [rows] = await (localPool as any).query(
    `SELECT ${SKILL_PUBLIC_FIELDS} FROM skills ${where} ORDER BY quality_score DESC, id ASC LIMIT ? OFFSET ?`,
    [...sqlParams, limit, offset],
  );
  return pageResult(rows as any[], page, limit, total);
}

export async function getCatalogStats(): Promise<any> {
  const [
    [countsRows],
    [layersRows],
    [topPrimarySkillsRows],
    [skillCategoriesRows],
  ] = await Promise.all([
    (localPool as any).query(
      `SELECT
        (SELECT COUNT(*) FROM agents WHERE isAvailable=1 AND reviewStatus='approved') AS availableApprovedAgents,
        (SELECT COUNT(*) FROM skills WHERE is_active=1) AS activeSkills,
        (SELECT COUNT(*) FROM skill_catalog) AS harvestedSkillCatalog,
        (SELECT COUNT(DISTINCT primarySkill) FROM agents WHERE isAvailable=1 AND reviewStatus='approved' AND primarySkill IS NOT NULL AND primarySkill != '') AS distinctPrimarySkills`,
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
  ]);

  const rawCounts = (countsRows as any[])[0] || {};
  const counts = Object.fromEntries(Object.entries(rawCounts).map(([k, v]) => [k, Number(v)]));
  return {
    generatedAt: new Date().toISOString(),
    source: "Live mos_db; approved and available records only where applicable",
    counts,
    agentsByLayer: layersRows,
    topPrimarySkills: topPrimarySkillsRows,
    skillCategories: skillCategoriesRows,
  };
}
