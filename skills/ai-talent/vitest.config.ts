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
      // 2026-09-18：localDb.ts 在 module load 時就要求 LOCAL_DB_PASSWORD，
      // 所以任何（哪怕是間接）import 到它的測試檔都會在收集階段整個掛掉 ——
      // agentMatcher.test.ts 與 taskPromptBuilder.test.ts 長期紅字就是這個原因，
      // 不是測試本身壞了。mysql2 的 createPool 不會立刻連線，給一組假的就夠了；
      // 真的去查資料庫的測試仍然會失敗，那是應該的。
      LOCAL_DB_HOST: "localhost",
      LOCAL_DB_PORT: "3306",
      LOCAL_DB_USER: "test",
      LOCAL_DB_PASSWORD: "test",
      LOCAL_DB_NAME: "test",
      JWT_SECRET: "ci-test-secret-at-least-32-chars-long",
      NODE_ENV: "test",
    },
  },
});
