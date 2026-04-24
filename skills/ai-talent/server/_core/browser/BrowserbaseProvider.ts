/**
 * BrowserbaseProvider — Phase 2A Ext Batch 2-2a.
 *
 * Connects to a Browserbase session (https://www.browserbase.com/) over CDP.
 * Browserbase manages residential IP rotation, stealth fingerprints, captcha
 * solving, so we don't have to operate a Chromium farm on the VM.
 *
 * Session lifecycle:
 *   1. POST /v1/sessions (projectId) → { id, connectUrl (wss://), liveViewUrl }
 *   2. chromium.connectOverCDP(connectUrl)
 *   3. call user callback with page
 *   4. close browser (which ends the Browserbase session)
 *   5. on error, also attempt DELETE /v1/sessions/{id} to force cleanup
 *
 * Env:
 *   BROWSERBASE_API_KEY       required
 *   BROWSERBASE_PROJECT_ID    required
 */

import { chromium } from "playwright-core";
import type {
  BrowserProvider,
  BrowserRunContext,
  ProviderName,
  RunOpts,
} from "./types";
import { BrowserProviderError } from "./types";

const BB_API = "https://api.browserbase.com/v1";

interface BrowserbaseSession {
  id: string;
  connectUrl: string;     // wss:// CDP endpoint
  seleniumRemoteUrl?: string;
  // v1 includes additional fields; we only use the ones above.
}

interface BrowserbaseDebugInfo {
  debuggerUrl?: string;
  debuggerFullscreenUrl?: string;
  wsUrl?: string;
  pages?: Array<{ id: string; url: string; title: string }>;
}

async function bbFetch<T>(
  path: string,
  init: RequestInit,
  apiKey: string
): Promise<T> {
  const res = await fetch(`${BB_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": apiKey,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new BrowserProviderError(
      `Browserbase ${init.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 200)}`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BrowserProviderError(
      `Browserbase ${path} returned non-JSON: ${text.slice(0, 200)}`
    );
  }
}

export class BrowserbaseProvider implements BrowserProvider {
  readonly providerName: ProviderName = "browserbase";

  constructor(
    private readonly apiKey: string,
    private readonly projectId: string
  ) {}

  async run<T>(
    fn: (ctx: BrowserRunContext) => Promise<T>,
    opts: RunOpts = {}
  ): Promise<T> {
    const timeoutMs = Math.max(10_000, opts.timeoutMs ?? 120_000);

    // 1. Create session
    const session = await bbFetch<BrowserbaseSession>(
      "/sessions",
      {
        method: "POST",
        body: JSON.stringify({
          projectId: this.projectId,
          // Browserbase defaults handle UA / fingerprinting. We only override
          // when caller explicitly requests it.
          browserSettings: opts.userAgent
            ? { fingerprint: { userAgent: opts.userAgent } }
            : undefined,
          // Session will auto-end after keepAliveMs of inactivity; we also
          // explicitly close below to avoid leaked sessions costing credits.
          keepAlive: false,
        }),
      },
      this.apiKey
    );

    // Fetch debug info (live-view link) — non-fatal if it fails
    let debugUrl: string | undefined;
    try {
      const dbg = await bbFetch<BrowserbaseDebugInfo>(
        `/sessions/${session.id}/debug`,
        { method: "GET" },
        this.apiKey
      );
      debugUrl = dbg.debuggerFullscreenUrl ?? dbg.debuggerUrl;
    } catch {
      // ignore
    }

    // 2. Connect via CDP — playwright-core does this without needing a
    //    locally-installed Chromium.
    const browser = await chromium.connectOverCDP(session.connectUrl, {
      timeout: 20_000,
    });

    // Browserbase hands us a pre-warmed default context+page via CDP.
    const context =
      browser.contexts()[0] ?? (await browser.newContext(opts.viewport ? { viewport: opts.viewport } : undefined));
    if (opts.cookies?.length) {
      await context.addCookies(opts.cookies as any);
    }
    const page = context.pages()[0] ?? (await context.newPage());
    if (opts.viewport) {
      await page.setViewportSize(opts.viewport);
    }

    // 3. Race callback against timeout
    const ctx: BrowserRunContext = {
      providerName: "browserbase",
      sessionId: session.id,
      debugUrl,
      browser,
      context,
      page,
    };

    const resultP = fn(ctx);
    const timeoutP = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new BrowserProviderError(`Session timed out after ${timeoutMs}ms`)
          ),
        timeoutMs
      )
    );

    try {
      return await Promise.race([resultP, timeoutP]);
    } finally {
      // 4. Close browser → Browserbase ends session
      try {
        await browser.close();
      } catch {
        /* browser may already be closed */
      }
      // 5. Defensive: explicit DELETE in case browser.close() didn't propagate
      //    (e.g. on timeout before connection established)
      try {
        await bbFetch(
          `/sessions/${session.id}`,
          {
            method: "POST",
            body: JSON.stringify({ status: "REQUEST_RELEASE" }),
          },
          this.apiKey
        );
      } catch {
        /* best effort — Browserbase will GC anyway */
      }
    }
  }
}
