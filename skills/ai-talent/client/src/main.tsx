import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient } from "./lib/trpc";
import { ToastProvider } from "./components/ui/Toast";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

// ─── Global Error Boundary ────────────────────────────────────────────────────
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AppErrorBoundary] caught:", error, info);
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ToastProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </trpc.Provider>
      </ToastProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
