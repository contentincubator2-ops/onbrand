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
      JWT_SECRET: "ci-test-secret-at-least-32-chars-long",
      NODE_ENV: "test",
    },
  },
});
