/**
 * Toast.tsx — lightweight toast notification system
 */
import React, { createContext, useContext, useState, useCallback } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Module-level emitter so non-React code (e.g. trpc onError handlers,
 * fetch interceptors) can surface a toast without a hook.
 *
 * Set by ToastProvider on mount; safe-no-op until provider is mounted.
 */
let _globalShowToast: ToastContextValue["showToast"] = () => {};
// 2026-05-11 (CJ feedback「紅色 toast 沒有真的在做的感覺」): default
// changed from "error" → "success" — most call sites are confirmations
// ("已儲存", "已寄出", "影片任務已啟動"). Error sites still pass "error"
// explicitly where they showed `失敗:` / `error:` in the message.
export function showToastGlobal(message: string, type?: ToastType) {
  // Auto-infer error if message contains error markers, otherwise success
  const inferred: ToastType =
    type ?? (/失敗|錯誤|error|fail|無法|忙不過來|忙碌/i.test(message) ? "error" : "success");
  try { _globalShowToast(message, inferred); } catch {/* no-op */}
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    // 2026-05-10 (CJ direction「toast 不要爆」): dedup identical messages
    // shown within last 3s. Without this, a tRPC batch of 10 calls all
    // failing with the same 502 produces 10 identical toasts stacking on
    // top of each other. Now they collapse to 1.
    setToasts(prev => {
      const now = Date.now();
      const recentDup = prev.find(
        t => t.message === message && t.type === type && (now - parseInt(t.id.split("-")[1] ?? "0", 10)) < 3000
      );
      if (recentDup) return prev; // skip duplicate
      const id = `toast-${now}-${Math.random().toString(36).slice(2,7)}`;
      const next = [...prev, { id, message, type }];
      setTimeout(() => {
        setToasts(p => p.filter(t => t.id !== id));
      }, 4500);
      return next;
    });
  }, []);

  // Wire module-level emitter so non-React code can call showToastGlobal()
  React.useEffect(() => {
    _globalShowToast = showToast;
    return () => { _globalShowToast = () => {}; };
  }, [showToast]);

  const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: { bg: "#F0FDF4", border: "#86EFAC", icon: "✓" },
    error:   { bg: "#FFF1F0", border: "#FCA5A5", icon: "✕" },
    info:    { bg: "#EFF6FF", border: "#93C5FD", icon: "ℹ" },
    warning: { bg: "#FFFBEB", border: "#FCD34D", icon: "⚠" },
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: "fixed", bottom: 24, right: 24,
        display: "flex", flexDirection: "column", gap: 8,
        zIndex: 9999, pointerEvents: "none",
      }}>
        {toasts.map(toast => {
          const c = COLORS[toast.type];
          return (
            <div key={toast.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 16px", borderRadius: 8,
              background: c.bg, border: `1px solid ${c.border}`,
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              fontSize: 13, color: "#1A1A18",
              animation: "toastIn 0.25s ease",
              pointerEvents: "auto",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              maxWidth: 360,
            }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{c.icon}</span>
              {toast.message}
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
