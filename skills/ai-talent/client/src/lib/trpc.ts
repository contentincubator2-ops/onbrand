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
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    const w = window as any;
    if (!w.__authRedirecting && window.location.pathname !== "/login") {
      w.__authRedirecting = true;
      try { localStorage.removeItem("authToken"); } catch {}
      window.location.replace("/login");
    }
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
