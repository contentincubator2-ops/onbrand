import { defineConfig } from "vitest/config";
import path from "path";

const clientReact = path.resolve(__dirname, "client/node_modules/react");
const clientReactDom = path.resolve(__dirname, "client/node_modules/react-dom");
const clientReactJsx = path.resolve(__dirname, "client/node_modules/react/jsx-runtime");

export default defineConfig({
  resolve: {
    alias: {
      "react": clientReact,
      "react-dom": clientReactDom,
      "react/jsx-runtime": clientReactJsx,
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    // Exclude frontend component tests — React 19/18 conflict in CI
    exclude: [
      "**/node_modules/**",
      "client/src/components/chat/AgentNavigation.test.tsx",
      "client/src/components/chat/TaskProgressTracker.test.tsx",
    ],
    environmentMatchGlobs: [
      ["client/src/**/*.test.{ts,tsx}", "jsdom"],
      ["server/**/*.test.ts", "node"],
    ],
    globals: true,
    env: {
      DB_HOST: "localhost",
      DB_USER: "test",
      DB_PASSWORD: "test",
      DB_NAME: "test",
      // 2026-09-25：server/localDb.ts 在 import 期就會檢查 LOCAL_DB_PASSWORD，
      // 沒有就 throw——於是 13 個 import 到它的測試檔一直是「載入失敗」，
      // 在本機與 CI 都跑不起來，被當成「既有環境問題」擱著很久。這幾支測試
      // 全都 mock 掉 localDb 或根本不連線，缺的只是這幾個環境變數。補上之後
      // 實測 98 個檔案／1389 個測試全過。
      LOCAL_DB_HOST: "localhost",
      LOCAL_DB_USER: "test",
      LOCAL_DB_PASSWORD: "test",
      LOCAL_DB_NAME: "test",
      JWT_SECRET: "ci-test-secret-at-least-32-chars-long",
      NODE_ENV: "test",
    },
  },
});
