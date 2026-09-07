#!/usr/bin/env node
/**
 * mos-agents — SoWork mos_db Agent / Skill 目錄的唯讀 MCP bridge。
 *
 * 這支橋只做一件事：把 https://onbrand.sowork.ai/api/manus 的四個 GET 端點
 * 包成 MCP 工具，讓 Claude Code 可以查 agent 與 skill，不必碰資料庫。
 *
 * ── 刻意做不到的事（安全邊界，不要「順手」加回來）─────────────────────
 *   · 只發 GET。沒有任何路徑會產生 POST / PUT / PATCH / DELETE。
 *   · 不連 MySQL、不讀 .env、不讀 SSH key / Keychain / shell history。
 *     憑證只有一個來源：環境變數 MOS_MANUS_API_KEY。
 *   · 不印 key。stdout 是 MCP 協定通道，只會有協定訊息；診斷走 stderr，
 *     而且所有往外送的字串都過 redact()，避免 key 混在錯誤訊息裡漏出去。
 *   · 網域寫死在 BASE_URL，不吃參數，避免被當成任意 URL 的抓取器。
 *
 * ── 為什麼是 CJS + 動態 import ─────────────────────────────────────────
 * repo 根目錄的 package.json 沒有 "type": "module"，所以 .js 是 CommonJS；
 * 而 @modelcontextprotocol/sdk 是純 ESM。用動態 import() 把兩邊接起來，
 * 檔名就能維持註冊指令裡的 scripts/mos-agents-mcp.js。
 */
"use strict";

const BASE_URL = "https://onbrand.sowork.ai/api/manus";
const MAX_LIMIT = 50;
const REQUEST_TIMEOUT_MS = 20000;

/** 缺 key 時所有工具回的同一句話。呼叫端看到這句就知道要找管理員。 */
const MISSING_KEY_MSG =
  "需設定 MOS_MANUS_API_KEY —— 這個 MCP 找不到 API key。" +
  "請由管理員在環境變數提供，本工具不會去任何檔案或憑證庫尋找它。";

/**
 * 把 key 從任何要往外送的字串裡抹掉。
 *
 * 正常路徑不會把 key 放進訊息，這是最後一道防線：第三方錯誤物件、
 * 被 echo 回來的 header、堆疊訊息都可能夾帶它。寧可多做一次。
 */
function redact(text) {
  const key = process.env.MOS_MANUS_API_KEY;
  const s = String(text ?? "");
  if (!key || key.length < 8) return s;
  return s.split(key).join("***REDACTED***");
}

/** 1..50 的整數；給不出數字就回 undefined，讓後端用自己的預設。 */
function clampLimit(v) {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(n, 1), MAX_LIMIT);
}

function clampPage(v) {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(n, 1);
}

/**
 * 唯一的對外請求函式。
 *
 * path 由呼叫端組好且一定要以 / 開頭；查詢字串走 URLSearchParams，
 * 路徑片段走 encodeURIComponent —— slug 可能含特殊字元，不能直接串。
 */
function buildUrl(path, params) {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url;
}

async function apiGet(path, params) {
  const key = process.env.MOS_MANUS_API_KEY;
  if (!key) return { ok: false, kind: "no-key", message: MISSING_KEY_MSG };

  const url = buildUrl(path, params);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: "GET", // 這支橋唯一用得到的方法
      headers: { "X-Manus-Key": key, Accept: "application/json" },
      signal: ac.signal,
      redirect: "error", // 不跟轉址，避免把 key 送到別的網域
    });
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    return {
      ok: false,
      kind: "network",
      message: aborted
        ? `請求逾時（${REQUEST_TIMEOUT_MS / 1000}s）：${path}`
        : `連線失敗：${redact(err && err.message)}`,
    };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      kind: "auth",
      message:
        `${MISSING_KEY_MSG}（伺服器回 ${res.status}` +
        `${res.status === 403 ? "，key 存在但沒有權限" : "，key 缺少或無效"}）`,
    };
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      kind: "http",
      message: `HTTP ${res.status} ${res.statusText} @ ${path}：${redact(raw).slice(0, 800)}`,
    };
  }

  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: true, data: { raw: redact(raw).slice(0, 4000) } };
  }
}

/** MCP 的工具回傳格式。錯誤一律用 isError，讓呼叫端看得到原因而不是空白。 */
function toResult(r) {
  if (!r.ok) {
    return { isError: true, content: [{ type: "text", text: redact(r.message) }] };
  }
  return {
    content: [{ type: "text", text: redact(JSON.stringify(r.data, null, 2)) }],
  };
}

const PAGING = {
  page: { type: "integer", minimum: 1, description: "頁碼，從 1 開始。" },
  limit: {
    type: "integer",
    minimum: 1,
    maximum: MAX_LIMIT,
    description: `每頁筆數，上限 ${MAX_LIMIT}（超過會被夾到 ${MAX_LIMIT}）。`,
  },
};

const TOOLS = [
  {
    name: "search_agents",
    description:
      "搜尋 SoWork mos_db 的 agent 目錄（唯讀）。用來確認某個 agent 是否存在、" +
      "取得它的 id 與 slug。所有參數皆可省略，省略即不加該篩選條件。",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "關鍵字，比對名稱／描述。" },
        layer: { type: "string", description: "分層篩選。" },
        industry: { type: "string", description: "產業篩選。" },
        focus: { type: "string", description: "專長領域篩選。" },
        ...PAGING,
      },
      additionalProperties: false,
    },
    run: (a) =>
      apiGet("/agents", {
        search: a.search,
        layer: a.layer,
        industry: a.industry,
        focus: a.focus,
        page: clampPage(a.page),
        limit: clampLimit(a.limit),
      }),
  },
  {
    name: "get_agent",
    description:
      "取單一 agent 的完整資料（唯讀）。傳入純數字視為 id（GET /agents/:id），" +
      "其餘視為 slug（GET /agents/slug/:slug）。可用 by 明確指定。",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "agent 的 id 或 slug。" },
        by: {
          type: "string",
          enum: ["auto", "id", "slug"],
          description: "查詢方式，預設 auto（純數字走 id，其餘走 slug）。",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    run: (a) => {
      const key = String(a.id ?? "").trim();
      if (!key) {
        return Promise.resolve({ ok: false, kind: "input", message: "id 不可為空。" });
      }
      const by = a.by && a.by !== "auto" ? a.by : /^\d+$/.test(key) ? "id" : "slug";
      const path =
        by === "id"
          ? `/agents/${encodeURIComponent(key)}`
          : `/agents/slug/${encodeURIComponent(key)}`;
      return apiGet(path);
    },
  },
  {
    name: "list_skills",
    description:
      "列出 / 搜尋 mos_db 的 skill 目錄（唯讀）。用來確認任務卡要掛的 skill_slug 存在。",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "關鍵字。" },
        category: { type: "string", description: "分類篩選。" },
        focus: { type: "string", description: "專長領域篩選。" },
        ...PAGING,
      },
      additionalProperties: false,
    },
    run: (a) =>
      apiGet("/skills", {
        search: a.search,
        category: a.category,
        focus: a.focus,
        page: clampPage(a.page),
        limit: clampLimit(a.limit),
      }),
  },
  {
    name: "get_stats",
    description: "取 mos_db 目錄的統計摘要（唯讀）。沒有參數。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => apiGet("/stats"),
  },
];

async function main() {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import(
    "@modelcontextprotocol/sdk/types.js"
  );

  const server = new Server(
    { name: "mos-agents", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `未知的工具：${req.params.name}` }],
      };
    }
    try {
      return toResult(await tool.run(req.params.arguments || {}));
    } catch (err) {
      return {
        isError: true,
        content: [
          { type: "text", text: `${tool.name} 執行失敗：${redact(err && err.message)}` },
        ],
      };
    }
  });

  await server.connect(new StdioServerTransport());
  // stdout 屬於 MCP 協定，任何診斷都只能走 stderr。
  if (!process.env.MOS_MANUS_API_KEY) {
    console.error("[mos-agents] 已啟動，但 MOS_MANUS_API_KEY 未設定；工具會回報缺 key。");
  } else {
    console.error("[mos-agents] 已啟動（唯讀，僅 GET）。");
  }
}

/**
 * 被 require 時只匯出純函式供檢驗，不啟動伺服器。
 *
 * 匯出的都是無副作用的字串／數字處理，不會擴大攻擊面；但「limit 真的被夾到
 * 50」「slug 真的被逃脫」這種安全性質，能跑起來驗證才算數，不然只是註解。
 */
if (require.main === module) {
  main().catch((err) => {
    console.error("[mos-agents] 啟動失敗：", redact(err && err.stack));
    process.exit(1);
  });
} else {
  module.exports = { buildUrl, clampLimit, clampPage, redact, BASE_URL, MAX_LIMIT, TOOLS };
}
