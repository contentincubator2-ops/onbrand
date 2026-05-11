import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from "@tanstack/react-query";
import { trpc, trpcClient } from "./lib/trpc";
import { ToastProvider, showToastGlobal } from "./components/ui/Toast";
import { HeroUIProvider } from "@heroui/react";
// v2 frontend rebuild — Sprint 1 (2026-04-25). The legacy App is kept on
// disk for one cycle then removed. Flip USE_V2 to false to fall back.
import App from "./App";
import AppV2 from "./v2/app/AppV2";
const USE_V2 = true;
const RootApp = USE_V2 ? AppV2 : App;
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
    const fingerprint = `global:${args.source}:${firstLine.slice(0, 80)}`;
    if (__reportedFingerprints.has(fingerprint)) return;
    __reportedFingerprints.add(fingerprint);
    const body = {
      json: {
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
    fetch("/api/trpc/ops.logError?batch=0", {
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
                <RootApp />
              </BrowserRouter>
            </QueryClientProvider>
          </trpc.Provider>
        </ToastProvider>
      </HeroUIProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
