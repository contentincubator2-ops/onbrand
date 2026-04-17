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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

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
