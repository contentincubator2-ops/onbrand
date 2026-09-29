/**
 * Toast.tsx — lightweight toast notification system
 */
import React, { createContext, useContext, useState, useCallback } from "react";
import { DoneIcon, ErrorIcon, InfoIcon, WarningIcon } from "../../v2/platform/components/icons";

type ToastType = "success" | "error" | "info" | "warning";

// 2026-05-13 (CJ「要把 toast 文字也做成可點按鈕」): optional inline action.
// When provided, renders a button on the right that calls onClick and
// dismisses the toast. Used by save-flows to give a 1-tap "Open Projects"
// link directly from the success notification.
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
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
export function showToastGlobal(message: string, type?: ToastType, action?: ToastAction) {
  // Auto-infer error if message contains error markers, otherwise success
  const inferred: ToastType =
    type ?? (/失敗|錯誤|error|fail|無法|忙不過來|忙碌/i.test(message) ? "error" : "success");
  try { _globalShowToast(message, inferred, action); } catch {/* no-op */}
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success", action?: ToastAction) => {
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
      const next = [...prev, { id, message, type, action }];
      // Toasts with an action linger longer (6.5s) so the user has time
      // to read + tap. Plain toasts stay at 4.5s.
      const ttl = action ? 6500 : 4500;
      setTimeout(() => {
        setToasts(p => p.filter(t => t.id !== id));
      }, ttl);
      return next;
    });
  }, []);

  // Wire module-level emitter so non-React code can call showToastGlobal()
  React.useEffect(() => {
    _globalShowToast = showToast;
    return () => { _globalShowToast = () => {}; };
  }, [showToast]);

  const COLORS: Record<ToastType, { bg: string; border: string; icon: React.ReactNode }> = {
    success: { bg: "#F0FDF4", border: "#86EFAC", icon: <DoneIcon size={14} /> },
    error:   { bg: "#FFF1F0", border: "#FCA5A5", icon: <ErrorIcon size={14} /> },
    info:    { bg: "#FAFAFA", border: "#D4D4D8", icon: <InfoIcon size={14} /> },
    warning: { bg: "#FFFBEB", border: "#FCD34D", icon: <WarningIcon size={14} /> },
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
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", borderRadius: 8,
              background: c.bg, border: `1px solid ${c.border}`,
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              fontSize: 13, color: "#1A1A18",
              animation: "toastIn 0.25s ease",
              pointerEvents: "auto",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              maxWidth: toast.action ? 440 : 360,
            }}>
              <span style={{ fontWeight: 700, fontSize: 14, display: "inline-flex" }}>{c.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{toast.message}</span>
              {toast.action && (
                <button
                  onClick={() => {
                    try { toast.action!.onClick(); } catch {/* no-op */}
                    setToasts(p => p.filter(t => t.id !== toast.id));
                  }}
                  style={{
                    flexShrink: 0,
                    padding: "5px 12px",
                    borderRadius: 6,
                    background: "#171717",
                    color: "white",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#404040"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#171717"; }}
                >
                  {toast.action.label}
                </button>
              )}
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
