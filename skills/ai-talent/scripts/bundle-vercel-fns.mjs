/**
 * Bundle api/*.ts into self-contained files for Vercel Functions.
 *
 * Why: package.json has `"type": "module"`, and Node ESM requires explicit
 * `.js` extensions on every relative import. The server codebase uses
 * extension-less imports (tsx handles this in dev / on the VM), so once
 * @vercel/node compiled each file individually, runtime failed with
 * ERR_MODULE_NOT_FOUND on the first relative import.
 *
 * Approach: esbuild bundles each api/*.ts entry + its full transitive
 * import graph into a single file, then OVERWRITES the source .ts file
 * with that bundled output. Valid JS is valid TS, so @vercel/node's
 * TypeScript compilation of the now-bundled .ts file succeeds, and at
 * runtime there are no relative imports left to resolve.
 *
 * node_modules stay external (packages: 'external') so native deps
 * (mysql2, bcryptjs, pdfkit) keep working and bundle size stays small.
 *
 * Called from vercel.json `buildCommand`. Run order matters: this
 * MUST run before Vercel's function compilation step, which is exactly
 * what happens — `buildCommand` finishes before @vercel/node looks at
 * `api/`.
 */
import { build } from "esbuild";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const tmpDir = "api/_bundle";
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const entries = [
  { in: "api/index.ts",                    tmp: `${tmpDir}/index.js`,               final: "api/index.ts" },
  { in: "api/cron/flush-billing-queue.ts", tmp: `${tmpDir}/flush-billing-queue.js`, final: "api/cron/flush-billing-queue.ts" },
];

await Promise.all(entries.map(e =>
  build({
    entryPoints: [e.in],
    outfile: e.tmp,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    tsconfig: "tsconfig.json",
    sourcemap: "inline",
    logLevel: "info",
    mainFields: ["module", "main"],
    conditions: ["node", "import"],
  })
));

// Atomically replace each source .ts with its bundled output. Still a
// valid TS file (JS is TS), so @vercel/node can compile it without
// hitting any relative imports.
for (const e of entries) {
  mkdirSync(dirname(e.final), { recursive: true });
  const { readFileSync } = await import("node:fs");
  writeFileSync(e.final, readFileSync(e.tmp));
}

rmSync(tmpDir, { recursive: true, force: true });

console.log("[bundle-vercel-fns] overwrote:", entries.map(e => e.final).join(", "));
