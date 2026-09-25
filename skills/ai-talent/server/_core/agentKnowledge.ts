/**
 * agentKnowledge — 把 agent 在 mos_db 裡「最新的」工作手冊一次讀出來，
 * 組成一段可以直接接在 system prompt 後面的文字。
 *
 * 2026-09-25（CJ「確保 onbrand.sowork.ai 在使用 ai agent 的時候，會讀取到
 * 這些 agent 最新的描述和 skill」）：後台替 153 位產品策略 agent 補了
 * taskSystemPrompt、版本化 agentCard、以及綁定的專業 Skill
 * （agents.attached_skill_ids / primarySkillBundleKey → skills）。
 * 但全站十幾個組 prompt 的地方各自 SELECT，只有 quickTaskOrchestra 讀
 * taskSystemPrompt（上限 2000 字、排在最後、額度不夠就整段丟掉），
 * agentCard 與綁定 Skill 沒有任何一條執行路徑讀得到。
 *
 * 這裡是唯一的入口：
 *   · 每次呼叫都直接查 DB，不做快取 —— 後台一改，下一個任務就吃到。
 *   · SELECT * 而不是列欄位：agentCard / attached_skill_ids 這些新欄位
 *     在某個環境還沒 migrate 時不能讓整個 persona 載入失敗
 *     （quickTaskOrchestra 的 loadAgent 失敗會回空 persona，等於沒人設）。
 *   · 失敗一律回空字串 —— 加料失敗不可以擋住任務本身。
 *   · agent 沒有這些資料時回空字串，既有 agent 的 prompt 完全不變。
 */

/** 各段上限（字元）。taskSystemPrompt 目前最長 3,376 字，要能整段放進來。 */
export const KNOWLEDGE_CAPS = {
  taskSystemPrompt: 3600,
  agentCard: 2200,
  skillEach: 2800,
  skillsTotal: 4200,
  total: 9000,
} as const;

function clip(s: string, cap: number): string {
  const t = s.trim();
  return t.length <= cap ? t : t.slice(0, cap - 1).trimEnd() + "…";
}

function parseJson<T = any>(raw: unknown): T | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return raw as T;
  try { return JSON.parse(String(raw)) as T; } catch { return null; }
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
}

/** attached_skill_ids 可能是 JSON 陣列、JSON 字串或逗號字串。 */
export function parseSkillIds(raw: unknown): number[] {
  const parsed = parseJson<unknown>(raw);
  const arr = Array.isArray(parsed)
    ? parsed
    : typeof raw === "string" ? raw.split(",") : [];
  const ids = arr.map((x) => Math.floor(Number(x))).filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(ids));
}

/** 把結構化的 agentCard 攤成 prompt 看得懂的條列；非 active 的卡不注入。 */
export function renderAgentCard(raw: unknown): string {
  const card = parseJson<any>(raw);
  if (!card || typeof card !== "object") return "";
  if (card.status && String(card.status) !== "active") return "";

  const lines: string[] = [];
  const section = (title: string, items: string[], numbered = false) => {
    if (!items.length) return;
    lines.push(`【${title}】`);
    items.forEach((it, i) => lines.push(numbered ? `${i + 1}. ${it}` : `- ${it}`));
  };

  const m = card.methodology ?? {};
  section(`方法論：${m.name ?? "工作流程"}`, strList(m.steps), true);
  section("診斷時先問", strList(card.diagnosticFlow?.questions));
  section("需要的輸入", strList(card.diagnosticFlow?.requiredInputs));
  section("決策規則", strList(card.decisionRules));
  section("回答架構（依序輸出這些段落）", strList(card.responseContract?.sections), true);
  if (card.responseContract?.language) lines.push(`語言：${String(card.responseContract.language)}`);
  section("7 天驗證實驗", strList(card.sevenDayExperiment));
  section("要做", strList(card.doDont?.do));
  section("不要做", strList(card.doDont?.dont));

  return lines.join("\n");
}

/** skills 表的內文欄位沒有統一名稱，依序取第一個有內容的。 */
const SKILL_BODY_COLUMNS = [
  "content", "skill_md", "skillMd", "body", "instructions", "prompt",
  "system_prompt", "systemPrompt", "markdown", "content_zh",
];

export function renderSkill(row: any): string {
  if (!row) return "";
  let body = "";
  for (const col of SKILL_BODY_COLUMNS) {
    const v = row[col];
    if (typeof v === "string" && v.trim()) { body = v; break; }
  }
  if (!body) {
    const manifest = parseJson<any>(row.manifest);
    const fromManifest = manifest?.instructions ?? manifest?.content ?? manifest?.prompt;
    if (typeof fromManifest === "string") body = fromManifest;
  }
  if (!body) body = String(row.description_zh || row.description || "");
  if (!body.trim()) return "";
  const name = row.name_zh || row.name || row.slug || `skill ${row.id}`;
  return `## ${name}\n${clip(body, KNOWLEDGE_CAPS.skillEach)}`;
}

/** 純函式：agent 列 + 已載入的 skill 列 → 要接在 system prompt 後面的文字。 */
export function renderAgentKnowledge(agent: any, skillRows: any[] = []): string {
  if (!agent) return "";
  const parts: string[] = [];

  const tsp = typeof agent.taskSystemPrompt === "string" ? agent.taskSystemPrompt.trim() : "";
  if (tsp) parts.push(`# 工作守則（必讀，違反等於失敗）\n${clip(tsp, KNOWLEDGE_CAPS.taskSystemPrompt)}`);

  const card = renderAgentCard(agent.agentCard);
  if (card) parts.push(`# 專業執行卡\n${clip(card, KNOWLEDGE_CAPS.agentCard)}`);

  const skills: string[] = [];
  let used = 0;
  for (const row of skillRows) {
    const s = renderSkill(row);
    if (!s || used + s.length > KNOWLEDGE_CAPS.skillsTotal) continue;
    skills.push(s);
    used += s.length;
  }
  if (skills.length) parts.push(`# 你綁定的專業 Skill（照這些做法執行）\n${skills.join("\n\n")}`);

  return parts.length ? clip(parts.join("\n\n"), KNOWLEDGE_CAPS.total) : "";
}

type Pool = { execute: (sql: string, params?: any[]) => Promise<any> };

async function getPool(): Promise<Pool> {
  const { default: localPool } = await import("../localDb");
  return localPool as unknown as Pool;
}

/** 一次載入多位 agent 的知識區塊。拿不到的 id 不會出現在 Map 裡。 */
export async function loadAgentKnowledgeMany(ids: Array<number | null | undefined>, pool?: Pool): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const uniq = Array.from(new Set(ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)));
  if (!uniq.length) return out;
  try {
    const db = pool ?? await getPool();
    const [agentRows]: any = await db.execute(
      `SELECT * FROM agents WHERE id IN (${uniq.map(() => "?").join(",")})`,
      uniq,
    );
    const agents = (agentRows as any[]) ?? [];

    const skillIds = new Set<number>();
    const skillSlugs = new Set<string>();
    for (const a of agents) {
      parseSkillIds(a.attached_skill_ids).forEach((id) => skillIds.add(id));
      if (a.primarySkillBundleKey) skillSlugs.add(String(a.primarySkillBundleKey));
    }

    let skillRows: any[] = [];
    if (skillIds.size || skillSlugs.size) {
      const ors: string[] = [];
      const params: any[] = [];
      if (skillIds.size) { ors.push(`id IN (${[...skillIds].map(() => "?").join(",")})`); params.push(...skillIds); }
      if (skillSlugs.size) { ors.push(`slug IN (${[...skillSlugs].map(() => "?").join(",")})`); params.push(...skillSlugs); }
      try {
        const [rows]: any = await db.execute(
          `SELECT * FROM skills WHERE is_active = 1 AND (${ors.join(" OR ")})`,
          params,
        );
        skillRows = (rows as any[]) ?? [];
      } catch (e) {
        console.warn("[agentKnowledge] skills lookup failed:", (e as Error)?.message);
      }
    }

    for (const a of agents) {
      const ids = new Set(parseSkillIds(a.attached_skill_ids));
      const slug = a.primarySkillBundleKey ? String(a.primarySkillBundleKey) : null;
      const mine = skillRows.filter((s) => ids.has(Number(s.id)) || (slug && s.slug === slug));
      const text = renderAgentKnowledge(a, mine);
      if (text) out.set(Number(a.id), text);
    }
  } catch (e) {
    console.warn("[agentKnowledge] load failed:", (e as Error)?.message);
  }
  return out;
}

export async function loadAgentKnowledge(id: number | null | undefined, pool?: Pool): Promise<string> {
  if (!id) return "";
  return (await loadAgentKnowledgeMany([id], pool)).get(Number(id)) ?? "";
}

/** 接在既有 system prompt 後面；沒有知識就原封不動。 */
export function withAgentKnowledge(systemPrompt: string, knowledge: string): string {
  return knowledge ? `${systemPrompt}\n\n${knowledge}` : systemPrompt;
}
