import { createTRPCReact } from "@trpc/react-query";
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
const authAwareFetch: typeof fetch = async (input, init) => {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    // Network error (browser refused / DNS / abort). Wrap as JSON tRPC
    // shape so the client side gets a clean error string instead of the
    // confusing 'Failed to fetch'.
    const msg = err instanceof Error ? err.message : "Network error";
    return new Response(JSON.stringify([{ error: { message: `網路連線失敗：${msg}`, code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 0 } } }]), {
      status: 200, // tRPC parses the body
      headers: { "Content-Type": "application/json" },
    });
  }
  if (res.status === 401 && typeof window !== "undefined") {
    const w = window as any;
    if (!w.__authRedirecting && window.location.pathname !== "/login") {
      w.__authRedirecting = true;
      try { localStorage.removeItem("authToken"); } catch {}
      window.location.replace("/login");
    }
  }
  // 2026-05-09 (CJ direction「根除 HTML/JSON 錯誤」): when nginx upstream
  // times out (60s) or pm2 is restarting, the proxy returns an HTML error
  // page instead of JSON. tRPC then crashes parsing it ('Unexpected token
  // <'). Detect by Content-Type — if not JSON, swap in a synthetic tRPC
  // error envelope so the user sees '伺服器忙碌請重試' toast instead of
  // a console explosion.
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("json") && res.status >= 400) {
    const text = await res.text().catch(() => "");
    const isHtml = /<\s*html|<\s*body/i.test(text);
    const userMsg = isHtml
      ? `伺服器忙碌（${res.status}），請稍後重試。如果反覆出現，可能是任務太重（>60s）或服務正在重啟。`
      : `伺服器錯誤 ${res.status}：${text.slice(0, 120)}`;
    return new Response(JSON.stringify([{ error: { message: userMsg, code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: res.status } } }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return res;
};

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/trpc",
      fetch: authAwareFetch,
      headers() {
        // SEC-1: Use Bearer token from JWT login flow
        const token = localStorage.getItem("authToken");
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
