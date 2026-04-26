/**
 * Browser runtime factory — Phase 2A Ext Batch 2-2a.
 *
 * Reads BROWSER_PROVIDER env and returns a singleton provider instance.
 *   BROWSER_PROVIDER=browserbase  (default in production)
 *   BROWSER_PROVIDER=local        (dev fallback — requires local Chromium)
 *
 * Also re-exports public types so scouts only need one import:
 *
 *   import { getBrowserProvider } from "@core/browser";
 *   await getBrowserProvider().run(async ({ page }) => {
 *     await page.goto("https://example.com");
 *     return page.title();
 *   });
 */

import type { BrowserProvider, ProviderName } from "./types";
import { BrowserProviderError } from "./types";

export type {
  BrowserProvider,
  BrowserRunContext,
  ProviderName,
  RunOpts,
} from "./types";
export { BrowserProviderError } from "./types";

let _instance: BrowserProvider | null = null;
let _resolvedName: ProviderName | null = null;

function resolveProviderName(): ProviderName {
  const raw = (process.env.BROWSER_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "local") return "local";
  if (raw === "browserbase") return "browserbase";
  // Default: if Browserbase creds are present, use it; otherwise local.
  if (process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID) {
    return "browserbase";
  }
  return "local";
}

export async function getBrowserProvider(): Promise<BrowserProvider> {
  if (_instance) return _instance;

  const name = resolveProviderName();
  if (name === "browserbase") {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    const projectId = process.env.BROWSERBASE_PROJECT_ID;
    if (!apiKey || !projectId) {
      throw new BrowserProviderError(
        "BROWSER_PROVIDER=browserbase but BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID missing."
      );
    }
    const { BrowserbaseProvider } = await import("./BrowserbaseProvider");
    _instance = new BrowserbaseProvider(apiKey, projectId);
  } else {
    const { LocalPlaywrightProvider } = await import("./LocalPlaywrightProvider");
    _instance = new LocalPlaywrightProvider();
  }
  _resolvedName = name;
  return _instance;
}

export function currentProviderName(): ProviderName | null {
  return _resolvedName;
}

/** For tests — reset singleton so env changes take effect. */
export function _resetBrowserProviderForTests(): void {
  _instance = null;
  _resolvedName = null;
}
