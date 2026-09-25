/**
 * mosAgentsMcpRouter — JSON-RPC 協定層行為測試。
 *
 * 跟 positioningDocs.test.ts 同一個哲學：不檢查原始碼字串，起一個真的
 * express app、打真的 HTTP request，驗證協定行為（initialize 回什麼、
 * tools/list 回哪 4 個工具、tools/call 真的會查到 mock 出來的資料、
 * 未知 method／未知工具的錯誤處理）。localDb 用 vi.mock 頂替，不需要
 * 真的 MySQL（本機沙箱缺 LOCAL_DB_PASSWORD 時這支測試才跑得動）。
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";

const productStrategyCard = {
  version: "1.0.0",
  domain: "product-strategy",
  professionalSkill: { key: "product-strategy-agent-card-v1", runtimeSkillId: 2549 },
};
const agentsFixture = [
  {
    id: 1,
    slug: "brand-strategist",
    name: "測試品牌策略顧問",
    title: "品牌策略總監",
    primarySkill: "mbb-strategist",
    primarySkillBundleKey: "product-strategy-agent-card-v1",
    skillsProfileVersion: "agent-card-v1",
    agentCard: productStrategyCard,
  },
];
const skillsFixture = [
  { id: 10, slug: "brand-positioning", name: "品牌定位", category: "strategy" },
];

vi.mock("../../localDb", () => ({
  default: {
    query: async (sqlText: string, _params: any[]) => {
      // 依查詢語句裡的獨特字串分派——順序從最specific到最generic。
      if (/availableApprovedAgents/.test(sqlText)) {
        return [[{ availableApprovedAgents: 1, activeSkills: 1, harvestedSkillCatalog: 0, distinctPrimarySkills: 1 }]];
      }
      if (/AS count FROM agents/.test(sqlText)) return [[{ layer: "strategy", count: 1 }]];
      if (/AS agentCount, SUM\(hireCount\)/.test(sqlText)) return [[{ primarySkill: "品牌策略", agentCount: 1, totalHires: 0 }]];
      if (/uncategorized/.test(sqlText)) return [[{ category: "strategy", skillCount: 1 }]];
      if (/AS total FROM agents/.test(sqlText)) return [[{ total: agentsFixture.length }]];
      if (/AS total FROM skills/.test(sqlText)) return [[{ total: skillsFixture.length }]];
      if (/FROM agents WHERE id = \?/.test(sqlText)) return [agentsFixture.filter((a) => a.id === Number(_params[0]))];
      if (/FROM agents WHERE slug = \?/.test(sqlText)) return [agentsFixture.filter((a) => a.slug === _params[0])];
      if (/FROM agents /.test(sqlText)) return [agentsFixture];
      if (/FROM skills /.test(sqlText)) return [skillsFixture];
      return [[]];
    },
  },
}));

import { mosAgentsMcpRouter } from "./mosAgentsMcpRouter";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/", mosAgentsMcpRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function rpc(body: any) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: res.status === 202 ? null : await res.json().catch(() => null) };
}

describe("mosAgentsMcpRouter · JSON-RPC 協定", () => {
  it("initialize 回正確的 protocolVersion 與 serverInfo", async () => {
    const { status, json } = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(status).toBe(200);
    expect(json.result.serverInfo.name).toBe("onbrand-mos-agents");
    expect(json.result.capabilities).toEqual({ tools: {} });
  });

  it("notifications/initialized（沒有 id）回 202、不是 JSON-RPC 結果", async () => {
    const res = await fetch(baseUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(res.status).toBe(202);
  });

  it("tools/list 回四個工具，名稱跟 scripts/mos-agents-mcp.js 的 TOOLS 一致", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const names = (json.result.tools as any[]).map((t) => t.name).sort();
    expect(names).toEqual(["get_agent", "get_stats", "list_skills", "search_agents"].sort());
  });

  it("tools/call search_agents 會查 mock 出來的資料", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_agents", arguments: { search: "品牌" } } });
    const payload = JSON.parse(json.result.content[0].text);
    expect(payload.data[0].slug).toBe("brand-strategist");
  });

  it("tools/call get_agent 依數字 id 查，包含安全的 Agent Card 與 Skill 綁定", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_agent", arguments: { id: "1" } } });
    const payload = JSON.parse(json.result.content[0].text);
    expect(payload.data.slug).toBe("brand-strategist");
    expect(payload.data.primarySkillBundleKey).toBe("product-strategy-agent-card-v1");
    expect(payload.data.skillsProfileVersion).toBe("agent-card-v1");
    expect(payload.data.agentCard).toEqual(productStrategyCard);
    expect(payload.data).not.toHaveProperty("taskSystemPrompt");
  });

  it("tools/call get_agent 依 slug 查（非純數字）", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_agent", arguments: { id: "brand-strategist" } } });
    const payload = JSON.parse(json.result.content[0].text);
    expect(payload.data.id).toBe(1);
  });

  it("tools/call get_stats 回統計摘要", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "get_stats", arguments: {} } });
    const payload = JSON.parse(json.result.content[0].text);
    expect(payload.counts.availableApprovedAgents).toBe(1);
  });

  it("tools/call 未知工具回 isError，不是 HTTP 錯誤", async () => {
    const { status, json } = await rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "not_a_real_tool", arguments: {} } });
    expect(status).toBe(200);
    expect(json.result.isError).toBe(true);
  });

  it("未知 method（有 id）回 JSON-RPC -32601", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 8, method: "something/else" });
    expect(json.error.code).toBe(-32601);
  });

  it("不合法的 JSON-RPC request（缺 method）回 400", async () => {
    const res = await fetch(baseUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foo: "bar" }) });
    expect(res.status).toBe(400);
  });

  it("GET 回 405（這個端點不需要 SSE server push）", async () => {
    const res = await fetch(baseUrl, { method: "GET" });
    expect(res.status).toBe(405);
  });
});
