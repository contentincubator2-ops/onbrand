/**
 * LocalPlaywrightProvider — dev fallback for Batch 2-2a browser runtime.
 *
 * Launches a local Chromium via playwright-core. Intended for local
 * development only; production should use BrowserbaseProvider to avoid
 * datacenter-IP risk control on target SaaS.
 *
 * Requires either:
 *   - `playwright` installed (full package, bundles Chromium)
 *   - or system Chrome/Chromium discoverable by playwright-core via channel
 *
 * We try full `playwright` first (best dev UX); fall back to playwright-core
 * launching system Chrome.
 *
 * Env:
 *   LOCAL_BROWSER_HEADLESS  "false" to watch a real window during debugging
 *                           (default "true")
 *   LOCAL_BROWSER_CHANNEL   "chrome" | "chromium" | "msedge" — forwarded to
 *                           playwright-core when full playwright isn't present
 */

import { randomUUID } from "crypto";
import type {
  BrowserProvider,
  BrowserRunContext,
  ProviderName,
  RunOpts,
} from "./types";
import { BrowserProviderError } from "./types";

async function resolveChromium(): Promise<any> {
  // Try full playwright (bundles browsers) first.
  try {
    // @ts-ignore — optional dep
    const pw = await import("playwright");
    return pw.chromium;
  } catch {
    // Fall back to playwright-core + system Chrome channel
    const { chromium } = await import("playwright-core");
    return chromium;
  }
}

export class LocalPlaywrightProvider implements BrowserProvider {
  readonly providerName: ProviderName = "local";

  async run<T>(
    fn: (ctx: BrowserRunContext) => Promise<T>,
    opts: RunOpts = {}
  ): Promise<T> {
    const timeoutMs = Math.max(10_000, opts.timeoutMs ?? 120_000);
    const headless = (process.env.LOCAL_BROWSER_HEADLESS ?? "true") !== "false";
    const channel = process.env.LOCAL_BROWSER_CHANNEL ?? undefined;

    const chromium = await resolveChromium();

    let browser: any;
    try {
      browser = await chromium.launch({
        headless,
        ...(channel ? { channel } : {}),
      });
    } catch (err: any) {
      throw new BrowserProviderError(
        `Local Chromium launch failed. Install 'playwright' in this package, or set LOCAL_BROWSER_CHANNEL=chrome if Chrome is installed. ${err?.message ?? ""}`,
        err
      );
    }

    const context = await browser.newContext({
      viewport: opts.viewport ?? { width: 1280, height: 800 },
      ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
    });
    if (opts.cookies?.length) {
      await context.addCookies(opts.cookies as any);
    }
    const page = await context.newPage();

    const ctx: BrowserRunContext = {
      providerName: "local",
      sessionId: randomUUID(),
      browser,
      context,
      page,
    };

    const resultP = fn(ctx);
    const timeoutP = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new BrowserProviderError(`Session timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    );

    try {
      return await Promise.race([resultP, timeoutP]);
    } finally {
      try { await context.close(); } catch { /* ignored */ }
      try { await browser.close(); } catch { /* ignored */ }
    }
  }
}
