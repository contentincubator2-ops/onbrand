import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_CAPS,
  loadAgentKnowledge,
  loadAgentKnowledgeMany,
  parseSkillIds,
  renderAgentCard,
  renderAgentKnowledge,
  withAgentKnowledge,
} from "./agentKnowledge";

// 形狀照 mos_db 180837（Sandra Roberts）2026-09-25 的實際 agentCard。
const card = {
  status: "active",
  version: "1.0.0",
  domain: "product-strategy",
  methodology: { name: "產品策略七段式", steps: ["定義決策與目標指標", "聚焦 ICP／JTBD"] },
  diagnosticFlow: { questions: ["要改變的產品或商業結果是什麼？"], requiredInputs: ["商業目標與決策期限"] },
  decisionRules: ["優先做低成本、可逆、能產生證據的測試。"],
  responseContract: { language: "使用者未指定時採繁體中文", sections: ["執行摘要", "7 天驗證實驗"] },
  sevenDayExperiment: ["Day 1：定義目標客群與基準指標。"],
  doDont: { do: ["先交付可用建議"], dont: ["不捏造客戶、競品或市場數字。"] },
  professionalSkill: { key: "product-strategy-agent-card-v1", runtimeSkillId: 2549 },
};

const skill = {
  id: 2549,
  slug: "product-strategy-agent-card-v1",
  name_zh: "產品策略 Agent Card v1",
  description_zh: "短描述",
  content: "SKILL 內文：先診斷再建議。",
  is_active: 1,
};

function fakePool(agents: any[], skills: any[]) {
  const calls: string[] = [];
  return {
    calls,
    execute: async (sql: string, params: any[] = []) => {
      calls.push(sql);
      if (sql.includes("FROM agents")) return [agents.filter((a) => params.includes(a.id))];
      if (sql.includes("FROM skills")) {
        return [skills.filter((s) => params.includes(s.id) || params.includes(s.slug))];
      }
      return [[]];
    },
  };
}

describe("parseSkillIds", () => {
  it("accepts JSON arrays, JSON strings and comma strings", () => {
    expect(parseSkillIds([2549, "12"])).toEqual([2549, 12]);
    expect(parseSkillIds("[2549,2549]")).toEqual([2549]);
    expect(parseSkillIds("3, 4")).toEqual([3, 4]);
    expect(parseSkillIds(null)).toEqual([]);
  });
});

describe("renderAgentCard", () => {
  it("renders every operational section of the card", () => {
    const out = renderAgentCard(JSON.stringify(card));
    for (const s of ["產品策略七段式", "1. 定義決策與目標指標", "要改變的產品或商業結果", "商業目標與決策期限",
      "優先做低成本", "1. 執行摘要", "Day 1", "先交付可用建議", "不捏造客戶"]) {
      expect(out).toContain(s);
    }
  });

  // v1.1（2026-09-25 18:31 起，例：180575）拿掉了 v1.0 的診斷/決策段落，
  // 改放履歷方法論與 runtimeCapabilities。v1.0 解析器會把它渲染成空白。
  it("renders v1.1 cards (profileMethodology + runtimeCapabilities)", () => {
    const v11 = {
      status: "active", version: "1.1.0", domain: "product-strategy",
      identity: { name: "Joshua White" },
      methodology: {
        name: "產品策略七段式",
        profileMethodology: "# Joshua White — AI 產品策略方法論",
        agentSpecificMethod: "以已存履歷的職稱與專長為依據",
        evidenceBoundary: "未經獨立驗證時不視為個人專屬方法論",
      },
      runtimeCapabilities: { category: "product-leadership", deliverableKeys: ["prd"], workflowKeys: ["discovery"], atomicSkillKeys: ["okr"] },
      legacyProfileEvidence: { deliverableKeys: ["press-release"] },
    };
    const out = renderAgentCard(v11);
    for (const s of ["AI 產品策略方法論", "以已存履歷", "未經獨立驗證", "product-leadership", "prd", "discovery", "okr"]) {
      expect(out).toContain(s);
    }
    expect(out).not.toContain("press-release");
    expect(out).not.toContain("Joshua White\n");
  });

  it("carries unknown future top-level fields instead of dropping them", () => {
    const out = renderAgentCard({ status: "active", version: "2.0.0", guardrails: ["不得捏造數字"], tone: "直接" });
    expect(out).toContain("不得捏造數字");
    expect(out).toContain("直接");
  });

  it("skips inactive cards", () => {
    expect(renderAgentCard({ ...card, status: "draft" })).toBe("");
  });
});

describe("renderAgentKnowledge", () => {
  it("returns empty for an agent with none of the new fields — legacy prompts stay unchanged", () => {
    expect(renderAgentKnowledge({ id: 1, name: "x", bio: "y" })).toBe("");
    expect(withAgentKnowledge("base", "")).toBe("base");
  });

  it("includes the full taskSystemPrompt up to 3,376 chars (the longest backfilled prompt)", () => {
    const tsp = "守".repeat(3376);
    const out = renderAgentKnowledge({ taskSystemPrompt: tsp });
    expect(out).toContain(tsp);
    expect(KNOWLEDGE_CAPS.taskSystemPrompt).toBeGreaterThanOrEqual(3376);
  });

  // 正式站 Skill 2549：content 類欄位全空，內文在 manifest JSON（key 不固定）
  it("reads the skill body out of manifest JSON whatever its keys are", () => {
    const row = {
      id: 2549, name_zh: "產品策略 Agent Card v1", description_zh: "短描述", version: "1",
      manifest: JSON.stringify({
        version: "1.1.0",
        workflow: { steps: ["定義決策", "聚焦 ICP"] },
        guardrails: ["不捏造市場數字"],
        outputContract: "先給執行摘要",
      }),
    };
    const out = renderAgentKnowledge({ id: 1 }, [row]);
    for (const s of ["定義決策", "聚焦 ICP", "不捏造市場數字", "先給執行摘要"]) expect(out).toContain(s);
    expect(out).not.toContain("短描述");
    expect(out).not.toContain("1.1.0");
  });

  it("prefers the skill body over its description", () => {
    const out = renderAgentKnowledge({ agentCard: card }, [skill]);
    expect(out).toContain("SKILL 內文");
    expect(out).not.toContain("短描述");
  });
});

describe("loadAgentKnowledgeMany", () => {
  it("reads agent + bound skills fresh from the DB on every call", async () => {
    const agent = {
      id: 180837, taskSystemPrompt: "工作守則 v1", agentCard: JSON.stringify(card),
      attached_skill_ids: "[2549]", primarySkillBundleKey: "product-strategy-agent-card-v1",
    };
    const pool = fakePool([agent], [skill]);
    const first = await loadAgentKnowledge(180837, pool);
    expect(first).toContain("工作守則 v1");
    expect(first).toContain("產品策略七段式");
    expect(first).toContain("SKILL 內文");

    agent.taskSystemPrompt = "工作守則 v2";
    expect(await loadAgentKnowledge(180837, pool)).toContain("工作守則 v2");
    expect(pool.calls.filter((c) => c.includes("FROM agents"))).toHaveLength(2);
  });

  it("only attaches each agent's own skills", async () => {
    const other = { id: 7, name_zh: "別人的 Skill", content: "別人的內文", slug: "other", is_active: 1 };
    const pool = fakePool(
      [{ id: 1, attached_skill_ids: [2549] }, { id: 2, attached_skill_ids: [7] }],
      [skill, other],
    );
    const map = await loadAgentKnowledgeMany([1, 2], pool);
    expect(map.get(1)).toContain("SKILL 內文");
    expect(map.get(1)).not.toContain("別人的內文");
    expect(map.get(2)).toContain("別人的內文");
  });

  it("never throws — a DB failure yields no knowledge, not a failed task", async () => {
    const pool = { execute: async () => { throw new Error("Unknown column 'agentCard'"); } };
    await expect(loadAgentKnowledge(1, pool)).resolves.toBe("");
  });
});

describe("injection telemetry", () => {
  it("records one info row per injected agent with source, card version and skills", async () => {
    const agent = { id: 180837, taskSystemPrompt: "守則", agentCard: { status: "active", version: "1.1.0", guardrails: ["x"] }, attached_skill_ids: [2549], updatedAt: "2026-09-26" };
    const pool = fakePool([agent, { id: 5, name: "no knowledge" }], [skill]);
    const map = await loadAgentKnowledgeMany([180837, 5], { source: "strategist.chat", pool });
    expect(map.has(5)).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    const inserts = pool.calls.filter((c) => c.includes("INSERT INTO error_log"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toContain("'agent.knowledge'");
  });

  it("a failing telemetry write never breaks the load", async () => {
    const agent = { id: 1, taskSystemPrompt: "守則" };
    const pool = {
      execute: async (sql: string) => {
        if (sql.includes("INSERT INTO error_log")) throw new Error("no table");
        return sql.includes("FROM agents") ? [[agent]] : [[]];
      },
    };
    await expect(loadAgentKnowledge(1, { source: "t", pool })).resolves.toContain("守則");
  });
});
