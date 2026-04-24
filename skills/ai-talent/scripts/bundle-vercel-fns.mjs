/**
 * Bundle api/*.ts into self-contained .js files for Vercel Functions.
 *
 * Why: package.json has `"type": "module"`, and Node ESM requires explicit
 * `.js` extensions on every relative import. The server codebase uses
 * extension-less imports (tsx handles this in dev / on the VM), so once
 * @vercel/node compiles each file individually, runtime fails with
 * ERR_MODULE_NOT_FOUND on the first relative import.
 *
 * Solution: run esbuild at build time to bundle each api/*.ts entry +
 * all its relative imports into a single .js file. node_modules stay
 * external (installed via npm at install-time) so we don't ship huge
 * bundles and keep native deps (mysql2, bcryptjs) working.
 *
 * Called from vercel.json `buildCommand`. api/**\/*.ts is listed in
 * .vercelignore so Vercel picks up the .js output only.
 */
import { build } from "esbuild";
import { rmSync } from "node:fs";

const entries = [
  { in: "api/index.ts",                     out: "api/index.js" },
  { in: "api/cron/flush-billing-queue.ts",  out: "api/cron/flush-billing-queue.js" },
];

// Clean stale output so a failed build doesn't silently ship old code.
for (const e of entries) {
  try { rmSync(e.out); } catch { /* ok */ }
}

await Promise.all(entries.map(e =>
  build({
    entryPoints: [e.in],
    outfile: e.out,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",       // keep npm deps as runtime imports
    tsconfig: "tsconfig.json",  // pick up paths + other TS settings
    sourcemap: "inline",        // smaller than separate .map; helps Vercel traces
    logLevel: "info",
    // Some libs (e.g. drizzle-orm's drivers) ship conditional exports
    // that need these flags to resolve correctly on Node ESM.
    mainFields: ["module", "main"],
    conditions: ["node", "import"],
  })
));

console.log("[bundle-vercel-fns] done:", entries.map(e => e.out).join(", "));
