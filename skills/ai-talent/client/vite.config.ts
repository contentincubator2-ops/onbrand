import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/trpc": "http://localhost:3101",
      "/api": "http://localhost:3101",
      "/health": "http://localhost:3101",
    },
  },
  build: {
    outDir: "../public",  // build 到 server/public，讓 Express 直接 serve
    emptyOutDir: true,    // 每次 build 清除舊 assets，防止舊 JS hash 殘留造成快取問題

    // 2026-06-12 (SEO perf fix): split heavy vendor bundles into separate
    // chunks. Lets browsers cache stable framework code across deploys and
    // reduces the single-bundle download time on first paint. Combined with
    // route-based React.lazy() in AppV2, anonymous /landing visitors no
    // longer download the entire protected-app dependency graph.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          // React core — almost every route uses it, but stable across deploys
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "vendor-react";
          }
          // Router — small but shared
          if (id.includes("/react-router") || id.includes("/@remix-run/")) {
            return "vendor-router";
          }
          // HeroUI — large; only used by protected routes, so move out of main
          if (id.includes("/@heroui/")) {
            return "vendor-heroui";
          }
          // tRPC + TanStack Query — used post-auth, keep separate
          if (id.includes("/@trpc/") || id.includes("/@tanstack/")) {
            return "vendor-trpc";
          }
          // Icons (lucide-react / react-icons / heroicons etc.)
          if (id.includes("/lucide-react/") || id.includes("/@heroicons/") || id.includes("/react-icons/")) {
            return "vendor-icons";
          }
          // Charting (recharts / d3 / chart.js) — only on dashboards
          if (id.includes("/recharts/") || id.includes("/d3-") || id.includes("/chart.js/") || id.includes("/victory-")) {
            return "vendor-charts";
          }
          // Date utilities
          if (id.includes("/date-fns/") || id.includes("/dayjs/") || id.includes("/luxon/")) {
            return "vendor-dates";
          }
          // Everything else in node_modules → generic vendor chunk
          return "vendor";
        },
      },
    },
    // Slightly raise the chunk-size warning threshold — we've intentionally
    // split into vendor chunks, the main bundle should now be well below this.
    chunkSizeWarningLimit: 800,
  },
});
