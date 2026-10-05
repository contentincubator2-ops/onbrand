import { createTRPCReact } from "@trpc/react-query";
import { tr } from "./i18n";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

/**
 * Global 401 handler — when the server rejects a request with 401
 * (expired/invalid JWT), clear the stale token and bounce the user to
 * /login. Without this, components that only check `isSuccess` get
 * stuck on loading screens forever.
 *
 * Guard with a window-level flag so we only redirect once even if many
 * queries fail in parallel.
 */
/**
 * Count the number of calls in a tRPC batched request URL.
 *
 * httpBatchLink combines N calls into one HTTP request like:
 *   POST /trpc/proc1,proc2,proc3?batch=1
 *   GET  /trpc/proc1,proc2,proc3?batch=1&input={"0":...,"1":...,"2":...}
 *
 * When the request fails (502, network drop, HTML response), we must
 * return an array of N envelopes, NOT just 1 — otherwise tRPC client
 * sees N-1 calls with no result and throws "Missing result" toasts
 * for each of them.
 */
function countBatchSize(input: RequestInfo | URL): number {
  try {
    const url = typeof input === "string" ? input : (input instanceof URL ? input.href : (input as Request).url);
    const path = url.split("?")[0];
    const procPart = path.split("/trpc/")[1] ?? "";
    const procs = procPart.split(",").filter(Boolean);
    return Math.max(1, procs.length);
  } catch { return 1; }
}

function buildBatchErrorEnvelope(message: string, httpStatus: number, n: number) {
  const single = { error: { message, code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus } } };
  return Array.from({ length: n }, () => single);
}

const authAwareFetch: typeof fetch = async (input, init) => {
  const batchN = countBatchSize(input as any);
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return new Response(JSON.stringify(buildBatchErrorEnvelope(tr(`Network connection failed: ${msg}`, `網路連線失敗：${msg}`), 0, batchN)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (res.status === 401 && typeof window !== "undefined") {
    // 2026-07-18 (CJ「未登入逛定價頁幾秒就被踢回登入」): public marketing /
    // legal pages fire background tRPC queries (notifications, plan info…)
    // that 401 for anonymous visitors — that must NOT hard-bounce them to
    // /login. Only redirect when the visitor is on a PROTECTED route.
    const PUBLIC_PATHS = ["/", "/pricing", "/terms", "/privacy", "/refund", "/plan-expired", "/login"];
    const path = window.location.pathname;
    const isPublic = PUBLIC_PATHS.includes(path) || path.startsWith("/auth/");
    const w = window as any;
    if (!isPublic && !w.__authRedirecting) {
      w.__authRedirecting = true;
      try { localStorage.removeItem("authToken"); } catch {}
      window.location.replace("/login");
    }
  }
  // 2026-05-09 (CJ direction「根除 HTML/JSON 錯誤」): when nginx upstream
  // times out (60s) or pm2 is restarting, the proxy returns an HTML error
  // page instead of JSON. tRPC then crashes parsing it ('Unexpected token
  // <'). Detect by Content-Type — if not JSON, swap in a synthetic tRPC
  // error envelope.
  // 2026-05-10 fix: batch-aware envelope (was single, caused "Missing
  // result" cascades when N batched calls all failed at once).
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("json") && res.status >= 400) {
    const text = await res.text().catch(() => "");
    const isHtml = /<\s*html|<\s*body/i.test(text);
    const userMsg = isHtml
      ? tr(`Server busy (${res.status}). Please retry shortly. If it keeps happening, the task may be too heavy or the service may be restarting.`, `伺服器忙碌（${res.status}），請稍後重試。如果反覆出現，可能是任務太重（超過 60 秒）或服務正在重啟。`)
      : tr(`Server error ${res.status}: ${text.slice(0, 120)}`, `伺服器錯誤 ${res.status}：${text.slice(0, 120)}`);
    return new Response(JSON.stringify(buildBatchErrorEnvelope(userMsg, res.status, batchN)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return res;
};

function activeBrandId(): number | null {
  try {
    const fromUrl = Number(new URLSearchParams(window.location.search).get("b"));
    if (Number.isInteger(fromUrl) && fromUrl > 0) return fromUrl;
    const stored = Number(localStorage.getItem("sowork.scope.brandId"));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/trpc",
      fetch: authAwareFetch,
      headers() {
        // SEC-1: Use Bearer token from JWT login flow
        const token = localStorage.getItem("authToken");
        const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
        // Which brand the user has open (same order of truth as useScopeState:
        // ?b= then localStorage). The server uses it to tell "a team member
        // working on the owner's brand" from "working on my own" for calls
        // that carry no brand id. It is a hint only — access is re-checked.
        const brand = activeBrandId();
        if (brand) headers["x-onbrand-brand"] = String(brand);
        return headers;
      },
    }),
  ],
});
