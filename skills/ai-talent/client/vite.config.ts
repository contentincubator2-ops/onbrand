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
    outDir: "../public", // build 到 server/public，讓 Express 直接 serve
  },
});
