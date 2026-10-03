/**
 * 平台任務頁的錯誤邊界。
 */
import React from "react";

// ── Error boundary ───────────────────────────────────────────────────────────
export class PlatformPageErrorBoundary extends React.Component<
  { children: React.ReactNode; platform: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div style={{ padding: 32 }}>
          <div style={{ padding: 20, border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 12 }}>
            <p style={{ fontSize: 12, color: "#dc2626", textTransform: "uppercase" }}>
              /tasks/{this.props.platform} render error
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>頁面載入失敗</h2>
            <p style={{ marginTop: 8 }}>{e.message}</p>
            <button
              style={{ marginTop: 12, padding: "6px 12px", background: "#18181b", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
              onClick={() => this.setState({ error: null })}
            >
              重試渲染
            </button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}
