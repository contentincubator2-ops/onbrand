/**
 * Browser provider abstraction for Phase 2A Ext Batch 2-2.
 *
 * Tool-operating agents (similarweb-scout, opview-scout, …) need headless
 * browser sessions to log into third-party SaaS with user-supplied credentials.
 *
 * Two providers implement the same interface:
 *   - BrowserbaseProvider  — production, residential IP pool + stealth baked in
 *   - LocalPlaywrightProvider — dev fallback, uses local Chromium
 *
 * The runtime picks one via BROWSER_PROVIDER env ("browserbase" | "local").
 *
 * Contract:
 *   Callers use `provider.run(async ctx => { ... })` and get automatic cleanup
 *   — the session closes when the callback returns or throws. No manual
 *   teardown required. Concurrent runs get separate sessions.
 */

// Playwright types imported via playwright-core. Re-export the ones callers
// actually touch so scouts don't have to import playwright-core directly.
import type { Browser, BrowserContext, Page } from "playwright-core";

export type ProviderName = "browserbase" | "local";

export interface BrowserRunContext {
  /** Provider used for this session (useful for telemetry / retries). */
  providerName: ProviderName;
  /** Browserbase session id, or a local uuid for LocalPlaywrightProvider. */
  sessionId: string;
  /** Public debugger URL — for Browserbase this is a live-view link. */
  debugUrl?: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export interface RunOpts {
  /** Hard cap on total session time. Provider should abort + cleanup on timeout. */
  timeoutMs?: number;
  /** Tag shown in Browserbase dashboard. Ignored locally. */
  label?: string;
  /** Seed cookies on the context before the callback runs. */
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  /** Custom user-agent (Browserbase provides a realistic one by default). */
  userAgent?: string;
  /** Viewport size (default 1280×800). */
  viewport?: { width: number; height: number };
}

export interface BrowserProvider {
  readonly providerName: ProviderName;
  /**
   * Open a session, invoke the callback with a fully-wired Page, close the
   * session when the callback returns or throws. Returns the callback's value.
   */
  run<T>(
    fn: (ctx: BrowserRunContext) => Promise<T>,
    opts?: RunOpts
  ): Promise<T>;
}

export class BrowserProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "BrowserProviderError";
  }
}
