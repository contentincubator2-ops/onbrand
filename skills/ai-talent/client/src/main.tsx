import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from "@tanstack/react-query";
import { trpc, trpcClient } from "./lib/trpc";
import { ToastProvider, showToastGlobal } from "./components/ui/Toast";
import { HeroUIProvider } from "@heroui/react";
// v2 frontend (Sprint 1, 2026-04-25). Legacy v1 App was removed 2026-05-14
// — see git history if you need the old behavior.
import AppV2 from "./v2/app/AppV2";
import "./index.css";

// 2026-05-08 (P1-2): global mutation / query error toast.
// Caught the silent-fail bug where many components used
// `someMut?.mutateAsync?.()` without onError — failures got swallowed.
// Now every unhandled mutation/query error surfaces a red toast bottom-
// right; per-component onError still wins (default fires only when
// caller doesn't handle).
function shouldSilentSkip(err: any): boolean {
  // Auth redirects are handled by authAwareFetch — don't double-toast
  const code = err?.data?.code ?? err?.code;
  if (code === "UNAUTHORIZED") return true;
  // 2026-05-13 (CJ「按品牌後出現 event not found / product not found 錯誤訊息」):
  // NOT_FOUND from scope-resolution queries (event.get / product.get with
  // stale ids carried over from a previous session) is expected during
  // scope transitions and shouldn't trigger a red toast — the UI gates
  // these queries with `enabled:` but stale localStorage scope can briefly
  // fire them before the new scope settles. Real not-found pages handle
  // their own UX inline.
  if (code === "NOT_FOUND") return true;
  // 2026-05-14 (CJ onboarding screenshot): suppress Zod validation
  // errors for empty-scope cases. When a fresh user has no brand yet,
  // stale URL params (?b=2830 from a previous user) or default-0
  // fallbacks can fire queries with brandId=0, which fail server-side
  // with code="too_small" + path=["brandId"]. These are caller-mistake
  // bugs we want to fix at the source, not user-facing problems — the
  // UI's `enabled:` gate will settle within a tick anyway.
  if (code === "BAD_REQUEST") {
    const msg = String(err?.message ?? err?.shape?.message ?? "");
    if (msg.includes('"too_small"') && msg.includes('"brandId"')) return true;
    if (msg.includes('"path": [ "id" ]') && msg.includes('"too_small"')) return true;
  }
  // 2026-05-15 (CJ「stale tRPC client」): if the bundle is so old it
  // calls a router we've removed server-side (workflow / market / etc.
  // killed 2026-05-14), the server returns "No procedure found". Tell
  // the user once, then force a hard reload to pick up the new bundle.
  const msg = String(err?.message ?? err?.shape?.message ?? "");
  if (/No.*procedure.*found|Router.*not.*found|"code"\s*:\s*"NOT_FOUND".*procedure/.test(msg)) {
    if (typeof window !== "undefined") {
      const w = window as any;
      if (!w.__staleBundleReloading) {
        w.__staleBundleReloading = true;
        try {
          showToastGlobal("應用程式已更新，正在重新載入…", "error");
        } catch {}
        // Wait 1.5s so the user sees the toast, then hard-reload
        setTimeout(() => { window.location.reload(); }, 1500);
      }
    }
    return true;
  }
  return false;
}
function formatErr(err: any): string {
  return String(err?.message ?? err?.shape?.message ?? err ?? "未知錯誤").slice(0, 240);
}
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (err: any, _vars, _ctx, mutation) => {
      if (shouldSilentSkip(err)) return;
      // If caller defined its own onError, skip — they're handling it
      if ((mutation as any)?.options?.onError) return;
      showToastGlobal(`操作失敗：${formatErr(err)}`, "error");
    },
  }),
  queryCache: new QueryCache({
    onError: (err: any, query) => {
      if (shouldSilentSkip(err)) return;
      // Don't toast every background poll failure (positioningJobs.getStatus
      // every 4s, etc.) — only show when user-initiated and no custom onError.
      if ((query as any)?.options?.onError) return;
      // Skip background refetches (only toast initial load)
      if ((query as any)?.state?.dataUpdateCount > 0) return;
      // 2026-05-15 (CJ「背景 polling 失敗」): queries with refetchInterval
      // are background pollers (achievements / notifications / theater
      // status). A transient network blip would toast on every poll —
      // suppress all errors on those, they self-heal next tick.
      if ((query as any)?.options?.refetchInterval) return;
      // 2026-05-15: also skip toast for transient gateway errors on
      // first load. tRPC clients auto-retry; if it eventually fails for
      // real, the user-initiated action will surface its own error UI.
      const msg = String(err?.message ?? "");
      if (/\b50[234]\b|伺服器忙碌|ECONNRESET|fetch failed|Network error/.test(msg)) return;
      showToastGlobal(`載入失敗：${formatErr(err)}`, "error");
    },
  }),
});

// ─── Global Error Boundary ────────────────────────────────────────────────────
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AppErrorBoundary] caught:", error, info);
    reportGlobalError({
      source: "frontend.errorBoundary",
      message: String(error?.message ?? error),
      stack: typeof error?.stack === "string" ? error.stack : undefined,
      meta: { componentStack: info?.componentStack?.slice(0, 1000) },
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: "32px 24px", fontFamily: "monospace", maxWidth: 760, margin: "40px auto",
          background: "#FFF1F0", border: "1px solid #FFA39E", borderRadius: 8,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#CF1322", marginBottom: 12 }}>
            ⚠️ 應用程式載入失敗 (render error)
          </div>
          <pre style={{ fontSize: 12, color: "#5c0011", whiteSpace: "pre-wrap", marginBottom: 16 }}>
            {this.state.error.message}
          </pre>
          <pre style={{ fontSize: 11, color: "#820014", whiteSpace: "pre-wrap", opacity: 0.7 }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              marginTop: 16, padding: "8px 20px", background: "#CF1322", color: "white",
              border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13,
            }}
          >
            重新載入
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// 2026-05-11 (CJ「補 Sentry-style error tracking」): global window.onerror
// + unhandledrejection reporter. Catches anything React's error boundary
// misses — async / event handler errors, promise rejections, etc. Fires
// directly into ops.logError via raw fetch (no React context required).
// De-duped by fingerprint within a single session to avoid spamming on
// fast loops.
const __reportedFingerprints = new Set<string>();
function reportGlobalError(args: {
  source: string;
  message: string;
  stack?: string;
  meta?: Record<string, any>;
}) {
  try {
    const firstLine = args.message.split("\n")[0] ?? args.message;
    // server zod caps fingerprint at 64 + DB column is VARCHAR(64) —
    // slice or the whole logError call fails zod validation.
    const fingerprint = `global:${args.source}:${firstLine}`.slice(0, 64);
    if (__reportedFingerprints.has(fingerprint)) return;
    __reportedFingerprints.add(fingerprint);
    // 2026-05-16 (error_log was 0 rows ever): the tRPC server is mounted
    // at /trpc (httpBatchLink), NOT /api/trpc. These raw-fetch reporters
    // were POSTing to /api/trpc/ops.logError?batch=0 → 404 every time →
    // zero frontend errors ever reached error_log. Fixed path + batch
    // wire format to match the rest of the app's tRPC client.
    // tRPC v11 with NO transformer (no superjson) — httpBatchLink wire
    // format is {"0": <input>}, NOT {"0":{"json":<input>}}. The json
    // envelope only exists with a data transformer.
    const body = {
      "0": {
        level: "error",
        source: args.source,
        route: window.location.pathname,
        message: firstLine.slice(0, 500),
        stack: args.stack?.slice(0, 4000),
        fingerprint,
        meta: {
          ...args.meta,
          href: window.location.href,
          ua: navigator.userAgent.slice(0, 200),
        },
      },
    };
    fetch("/trpc/ops.logError?batch=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    }).catch(() => { /* swallow */ });
  } catch { /* never throw from error reporter */ }
}
window.addEventListener("error", (e) => {
  reportGlobalError({
    source: "frontend.window.error",
    message: String(e?.error?.message ?? e?.message ?? "window error"),
    stack: typeof e?.error?.stack === "string" ? e.error.stack : undefined,
    meta: {
      filename: e?.filename,
      lineno: e?.lineno,
      colno: e?.colno,
    },
  });
});
window.addEventListener("unhandledrejection", (e) => {
  const reason: any = e?.reason;
  reportGlobalError({
    source: "frontend.unhandledrejection",
    message: String(reason?.message ?? reason ?? "unhandled promise rejection"),
    stack: typeof reason?.stack === "string" ? reason.stack : undefined,
    meta: { code: reason?.code, name: reason?.name },
  });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <HeroUIProvider>
        <ToastProvider>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <BrowserRouter>
                <AppV2 />
              </BrowserRouter>
            </QueryClientProvider>
          </trpc.Provider>
        </ToastProvider>
      </HeroUIProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
