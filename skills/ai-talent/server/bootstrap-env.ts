/**
 * bootstrap-env.ts — side-effect module that loads .env BEFORE any other
 * import in server/index.ts.
 *
 * SEC-B-03 root cause (2026-05-05): ESM evaluates all imports' bodies
 * depth-first, BEFORE the importing file's own top-level code. So putting
 * `dotenvConfig({...})` as a top-level statement in index.ts runs AFTER
 * `import { ENV } from "./_core/env"` has already triggered env.ts's zod
 * validation — at which point process.env.JWT_SECRET is still empty (no
 * shell source-d .env present after PM2 daemon-restart) and env.ts exits.
 *
 * The only way to load env BEFORE _core/env.ts evaluates is to do it in
 * a separately-imported side-effect module that index.ts imports FIRST.
 *
 * Don't add unnecessary imports to this file.
 */

import { config as dotenvConfig } from "dotenv";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

// Try CWD-relative, then __dirname-relative, then prod absolute.
const here = dirname(fileURLToPath(import.meta.url));
const candidatePaths = [
  join(process.cwd(), ".env"),                    // when ci.yml --cwd is correct
  join(here, "..", ".env"),                       // server/bootstrap-env.ts → ../.env
  "/opt/onbrand/app/skills/ai-talent/.env",       // prod absolute fallback (infra renamed 2026-05-28)
  "/opt/marketing-os/app/skills/ai-talent/.env",  // legacy fallback (symlink to /opt/onbrand)
];
const envPath = candidatePaths.find((p) => existsSync(p));
if (!envPath) {
  console.error("[bootstrap-env] FATAL: no .env file found at any of:", candidatePaths);
  process.exit(1);
}
const result = dotenvConfig({ path: envPath, override: true });
console.log("[bootstrap-env] loaded .env from:", envPath);
console.log("[bootstrap-env] dotenv result:", { error: result.error, parsed: result.parsed ? "YES" : "NO" });
console.log("[bootstrap-env] JWT_SECRET present:", process.env.JWT_SECRET ? "YES" : "NO");
