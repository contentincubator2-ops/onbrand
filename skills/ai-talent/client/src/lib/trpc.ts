import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/trpc",
      headers() {
        // SEC-1: Use Bearer token from JWT login flow
        const token = localStorage.getItem("authToken");
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
