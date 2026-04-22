/**
 * tools/index.ts — public barrel.
 *
 * Import order is critical: registry.ts MUST be fully initialized before
 * any tool module runs `registerTool`. That's why the registry lives in a
 * separate file with zero further imports.
 */

// 1) Re-export registry API (types, registerTool, getToolsForStep, …)
export * from "./registry";

// 2) Side-effect imports — each module calls registerTool at top level.
//    By the time these run, registry.ts has already initialized its Map.
import "./webFetch";
import "./webSearch";
import "./siteCrawl";
import "./youtubeFetch";
import "./citationBundler";
import "./themeApply";
import "./boardroomPdf";
