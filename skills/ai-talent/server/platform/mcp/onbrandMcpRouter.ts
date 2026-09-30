/**
 * onbrandMcpRouter — 對外販售的 onBrand Studio 連接器（遠端 MCP，Streamable HTTP），掛在 /api/mcp/onbrand。
 *
 * 2026-09-28（CJ「onbrand 變成 claude 外掛服務」）。跟 mosAgentsMcpRouter（內部用、免驗證的
 * 目錄查詢）是兩回事：這支必須帶 OAuth access token（oauthRoutes.ts 發的），每個工具都以
 * 那個使用者的身分與方案執行。
 *
 * 協定：手刻 JSON-RPC over POST、同步 JSON 回應（沿用 mosAgentsMcpRouter 的作法，不引入 SDK）。
 * 另外實作 resources/list、resources/read 提供 MCP App（ui://onbrand/app）。
 */
import { Router, Request, Response } from "express";
import { TOOLS, ToolInputError, UI_APP_URI, type ToolDef } from "./onbrandTools";
import { TEAM_BOARD_APP_HTML } from "./teamBoardApp";
import { userIdForAccessToken } from "./oauthStore";
import { publicBaseUrl, MCP_RESOURCE_PATH } from "./oauthRoutes";

export const onbrandMcpRouter = Router();

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER_INFO = { name: "onbrand", title: "onBrand Studio", version: "1.0.0" };
const INSTRUCTIONS =
  "onBrand Studio 是使用者的 AI 行銷團隊（品牌大腦＋持續更新的任務卡＋伺服器端的專屬寫手與設計）。" +
  "流程：list_brands → get_brand_context → list_tasks → describe_task（缺必填先問使用者）→ run_task → get_task_result。" +
  "使用者問團隊進度或要審稿時用 team_board。成品照原文交給使用者，不要自行改寫；品牌資訊以 get_brand_context 為準，不要自己假設。" +
  "跟使用者說話時，產出規模用「單篇／套組／企劃」，不要說 30s/60s/99s。";

function rpcResult(id: unknown, result: unknown) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }

export function toolListing(t: ToolDef) {
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { title: t.title, readOnlyHint: !!t.readOnly, openWorldHint: false },
    ...(t.ui ? { _meta: { ui: { resourceUri: UI_APP_URI, visibility: ["model", "app"] } } } : {}),
  };
}

export function uiResourceMeta(baseUrl: string) {
  // 產出的圖放在本站 /static，預覽要能載入；其他外部來源一律不開。
  return { ui: { csp: { resourceDomains: [new URL(baseUrl).origin] }, prefersBorder: true } };
}

function unauthorized(req: Request, res: Response, id: unknown) {
  const base = publicBaseUrl(req);
  res.status(401)
    .set("WWW-Authenticate", `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}"`)
    .json(rpcError(id ?? null, -32001, "需要登入 onBrand Studio（OAuth）"));
}

onbrandMcpRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const msg = req.body;
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    res.status(400).json(rpcError(msg?.id ?? null, -32600, "Invalid JSON-RPC request"));
    return;
  }
  const { method, params, id } = msg;
  const isNotification = id === undefined;

  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const userId = token ? await userIdForAccessToken(token).catch(() => null) : null;
  if (!userId) { unauthorized(req, res, id); return; }

  const baseUrl = publicBaseUrl(req);
  try {
    switch (method) {
      case "initialize": {
        const asked = String(params?.protocolVersion ?? "");
        res.json(rpcResult(id, {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[1],
          capabilities: {
            tools: {},
            resources: {},
            extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } },
          },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        }));
        return;
      }
      case "ping":
        res.json(rpcResult(id, {}));
        return;
      case "tools/list":
        res.json(rpcResult(id, { tools: TOOLS.map(toolListing) }));
        return;
      case "resources/list":
        res.json(rpcResult(id, {
          resources: [{ uri: UI_APP_URI, name: "onbrand_team_board", title: "onBrand Studio 團隊看板", mimeType: "text/html;profile=mcp-app" }],
        }));
        return;
      case "resources/read": {
        if (params?.uri !== UI_APP_URI) { res.json(rpcError(id, -32002, `Resource not found: ${params?.uri}`)); return; }
        res.json(rpcResult(id, {
          contents: [{ uri: UI_APP_URI, mimeType: "text/html;profile=mcp-app", text: TEAM_BOARD_APP_HTML, _meta: uiResourceMeta(baseUrl) }],
        }));
        return;
      }
      case "tools/call": {
        const tool = TOOLS.find((t) => t.name === params?.name);
        if (!tool) {
          res.json(rpcResult(id, { isError: true, content: [{ type: "text", text: `未知的工具：${params?.name}` }] }));
          return;
        }
        const started = Date.now();
        try {
          const out = await tool.run(params?.arguments ?? {}, { userId, baseUrl });
          console.log(`[mcp:onbrand] user=${userId} tool=${tool.name} ok ${Date.now() - started}ms`);
          res.json(rpcResult(id, {
            content: [{ type: "text", text: out.text }],
            ...(out.structured ? { structuredContent: out.structured } : {}),
          }));
        } catch (err: any) {
          const known = err instanceof ToolInputError || err?.name === "TRPCError";
          console.warn(`[mcp:onbrand] user=${userId} tool=${tool.name} failed: ${err?.message}`);
          res.json(rpcResult(id, {
            isError: true,
            content: [{ type: "text", text: known ? String(err.message) : `${tool.title}失敗，請稍後再試。` }],
          }));
        }
        return;
      }
      default:
        if (isNotification) { res.status(202).end(); return; }
        res.json(rpcError(id, -32601, `Method not found: ${method}`));
        return;
    }
  } catch (err: any) {
    console.error("[mcp:onbrand] error:", err?.message);
    if (isNotification) { res.status(202).end(); return; }
    res.json(rpcError(id, -32603, "Internal error"));
  }
});

// 不做伺服器推播（所有工具都是單次請求/回應），GET 串流回 405。
onbrandMcpRouter.get("/", (_req: Request, res: Response): void => {
  res.status(405).set("Allow", "POST").json({ error: "Use POST (no server-initiated stream)." });
});
