/**
 * mosAgentsMcpRouter — remote MCP endpoint for the mos_db agent/skill
 * catalog, mounted at /api/mcp/mos-agents.
 *
 * 2026-09-23（CJ「你有接好mos_db的人選了嗎」→「它沒辦法存在我的電腦，
 * 只能存在VM上面」）：本機的 stdio MCP bridge（scripts/mos-agents-mcp.js）
 * 需要 MOS_MANUS_API_KEY 存在 Claude Code 這台機器的環境變數，使用者要求
 * 金鑰不能碰本機、只能留在 VM。解法：在已經部署、MANUS_MOS_API_KEY 本來
 * 就在的 OnBrand server 裡直接開一個遠端 MCP 端點——Claude Code 的
 * .claude.json 只要指向這個 URL，完全不需要放任何憑證值，金鑰真的只留
 * 在 VM 上，一步都沒有離開過。
 *
 * ── 為什麼不用 /api/manus 既有的 X-Manus-Key 保護 ──────────────────────
 * 如果沿用同一把金鑰當這個新端點的驗證，Claude Code 連線時還是得把這把
 * 金鑰放進本機的 .claude.json（從 env 區塊搬到 headers 區塊而已）——完全
 * 沒有解決「本機不能碰金鑰」這個要求。CJ 確認（2026-09-23）：這個端點
 * 不需要另外驗證——manusRouter.ts 自己的文件已經把這批欄位（名字/bio/
 * skills/統計）定義成「公開業務欄位」（排除憑證、system prompt、內部工具
 * 設定），這裡查的是同一批欄位；路徑也刻意不寫進任何公開文件／
 * openapi.json，只有知道確切路徑的人（這個 session 的 MCP 設定）會打到。
 *
 * ── 跟 manusRouter.ts 的關係 ─────────────────────────────────────────
 * 查詢邏輯在 mosCatalog.ts，刻意跟 manusRouter.ts 各自獨立、沒有互相
 * import——manusRouter.ts 是現行給外部「Manus」產品用、需要金鑰的既有
 * 端點，不因為這次新增而承擔任何改動風險。
 *
 * ── 協定 ────────────────────────────────────────────────────────────
 * 手刻最小可用的 MCP Streamable HTTP（JSON-RPC 2.0 over POST，同步
 * JSON 回應，不做 SSE server push——這 4 個工具都是單次請求/回應，不需要
 * 伺服器主動推訊息）。只實作真正會用到的方法：initialize／
 * notifications/initialized／tools/list／tools/call。
 */
import { Router, Request, Response } from "express";
import {
  searchAgents, getAgentById, getAgentBySlug, searchSkills, getCatalogStats,
} from "../core/agents/mosCatalog";

export const mosAgentsMcpRouter = Router();

const PAGING_PROPS = {
  page: { type: "integer", minimum: 1, description: "頁碼，從 1 開始。" },
  limit: { type: "integer", minimum: 1, maximum: 200, description: "每頁筆數，上限 200。" },
};

/** 跟 scripts/mos-agents-mcp.js 的 TOOLS 逐一對應（名稱/schema 一致）。 */
const TOOLS: Array<{ name: string; description: string; inputSchema: Record<string, unknown>; run: (a: any) => Promise<unknown> }> = [
  {
    name: "search_agents",
    description: "搜尋 SoWork mos_db 的 agent 目錄（唯讀）。用來確認某個 agent 是否存在、取得它的 id 與 slug。所有參數皆可省略，省略即不加該篩選條件。",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "關鍵字，比對名稱／描述。" },
        layer: { type: "string", description: "分層篩選。" },
        industry: { type: "string", description: "產業篩選。" },
        focus: { type: "string", description: "專長領域篩選。" },
        ...PAGING_PROPS,
      },
      additionalProperties: false,
    },
    run: (a) => searchAgents({ search: a.search, layer: a.layer, industry: a.industry, focus: a.focus, page: a.page, limit: a.limit }),
  },
  {
    name: "get_agent",
    description: "取單一 agent 的完整資料（唯讀）。傳入純數字視為 id，其餘視為 slug。可用 by 明確指定。",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "agent 的 id 或 slug。" },
        by: { type: "string", enum: ["auto", "id", "slug"], description: "查詢方式，預設 auto（純數字走 id，其餘走 slug）。" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    run: async (a) => {
      const key = String(a.id ?? "").trim();
      if (!key) throw new Error("id 不可為空。");
      const by = a.by && a.by !== "auto" ? a.by : /^\d+$/.test(key) ? "id" : "slug";
      const agent = by === "id" ? await getAgentById(Number(key)) : await getAgentBySlug(key);
      if (!agent) throw new Error(`Agent not found: ${key}`);
      return { data: agent };
    },
  },
  {
    name: "list_skills",
    description: "列出／搜尋 mos_db 的 skill 目錄（唯讀）。用來確認任務卡要掛的 skill_slug 存在。",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "關鍵字。" },
        category: { type: "string", description: "分類篩選。" },
        focus: { type: "string", description: "專長領域篩選。" },
        ...PAGING_PROPS,
      },
      additionalProperties: false,
    },
    run: (a) => searchSkills({ search: a.search, category: a.category, focus: a.focus, page: a.page, limit: a.limit }),
  },
  {
    name: "get_stats",
    description: "取 mos_db 目錄的統計摘要（唯讀）。沒有參數。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => getCatalogStats(),
  },
];

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "onbrand-mos-agents", version: "1.0.0" };

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

mosAgentsMcpRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const msg = req.body;
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    res.status(400).json(rpcError(msg?.id ?? null, -32600, "Invalid JSON-RPC request"));
    return;
  }

  const isNotification = msg.id === undefined;
  const { method, params, id } = msg;

  try {
    switch (method) {
      case "initialize": {
        res.json(rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        }));
        return;
      }
      case "notifications/initialized":
      case "notifications/cancelled": {
        // 通知，沒有 id，不用回 JSON-RPC 結果。
        res.status(202).end();
        return;
      }
      case "ping": {
        res.json(rpcResult(id, {}));
        return;
      }
      case "tools/list": {
        res.json(rpcResult(id, {
          tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        }));
        return;
      }
      case "tools/call": {
        const toolName = params?.name;
        const tool = TOOLS.find((t) => t.name === toolName);
        if (!tool) {
          res.json(rpcResult(id, { isError: true, content: [{ type: "text", text: `未知的工具：${toolName}` }] }));
          return;
        }
        try {
          const data = await tool.run(params?.arguments || {});
          res.json(rpcResult(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }));
        } catch (err: any) {
          res.json(rpcResult(id, { isError: true, content: [{ type: "text", text: `${tool.name} 執行失敗：${err?.message ?? String(err)}` }] }));
        }
        return;
      }
      default: {
        if (isNotification) { res.status(202).end(); return; }
        res.json(rpcError(id, -32601, `Method not found: ${method}`));
        return;
      }
    }
  } catch (err: any) {
    console.error("[mosAgentsMcpRouter] error:", err?.message);
    if (isNotification) { res.status(202).end(); return; }
    res.json(rpcError(id, -32603, "Internal error"));
  }
});

// GET/SSE stream not implemented — none of these tools need server-initiated
// push, so a client opening a GET stream gets a clean 405 instead of hanging.
mosAgentsMcpRouter.get("/", (_req: Request, res: Response): void => {
  res.status(405).json({ error: "This MCP endpoint only supports POST (no server-initiated stream needed)." });
});
