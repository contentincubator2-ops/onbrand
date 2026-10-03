/**
 * 路由層的錯誤邊界。
 */
import React from "react";
import { recoverFromStaleChunk, isChunkLoadError, StaleChunkScreen } from "../staleChunk";

export class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; resetKey: number }
> {
  state = { error: null as Error | null, resetKey: 0 };
  static getDerivedStateFromError(error: Error) { return { error, resetKey: 0 }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Stale-chunk auto-recovery: hard-reload once on deployment-induced 404.
    // 重載已排定時也直接 return——那個錯誤只是重載前的殘影，不是 bug。
    if (recoverFromStaleChunk(error)) return;
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary] route render error:", error, info);
    try {
      const firstLine = String(error?.message ?? "").split("\n")[0] ?? "route render error";
      // 2026-05-16: /trpc (not /api/trpc) + batch wire format — see
      // main.tsx note. Was 404ing → no route errors ever logged.
      fetch("/trpc/ops.logError?batch=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          "0": {
            level: "error",
            source: "frontend.route",
            route: window.location.pathname + window.location.search,
            message: firstLine.slice(0, 500),
            stack: typeof error?.stack === "string" ? error.stack.slice(0, 4000) : undefined,
            fingerprint: `route:${firstLine}`.slice(0, 64), // zod max 64 + VARCHAR(64)
            meta: {
              componentStack: info?.componentStack?.slice(0, 1000),
            },
          },
        }),
      }).catch(() => {});
    } catch {}
  }
  render() {
    if (this.state.error && isChunkLoadError(this.state.error)) {
      return <StaleChunkScreen />;
    }
    if (this.state.error) {
      return (
        <div style={{ padding: "32px 24px", maxWidth: 720, margin: "0 auto" }}>
          <div style={{ padding: 20, border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 12 }}>
            <p style={{ fontSize: 12, color: "#dc2626", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>頁面載入失敗</p>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 6, color: "#0f172a" }}>
              這個頁面目前無法顯示
            </h2>
            <p style={{ marginTop: 6, color: "#475569", fontSize: 13, lineHeight: 1.6 }}>
              側邊欄還能用 — 試著切到別的功能，或按下方「重試」再渲染一次。
              <br />
              {this.state.error.message}
            </p>
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={{ padding: "6px 12px", background: "#18181b", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                onClick={() => this.setState({ error: null, resetKey: this.state.resetKey + 1 })}
              >
                重試
              </button>
              <button
                style={{ padding: "6px 12px", background: "white", border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                onClick={() => window.location.assign("/planner")}
              >
                回到首頁
              </button>
              <a
                href={`mailto:sowork@sowork.ai?subject=${encodeURIComponent("onBrand Studio 頁面錯誤 " + window.location.pathname)}&body=${encodeURIComponent("錯誤訊息：\n" + (this.state.error?.message ?? "") + "\n\n頁面：" + window.location.href)}`}
                style={{ fontSize: 12, color: "#3f3f46", textDecoration: "underline", marginLeft: "auto", alignSelf: "center" }}
              >
                聯絡客服
              </a>
            </div>
          </div>
        </div>
      );
    }
    // resetKey re-mounts children on retry so any stuck state clears.
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}
