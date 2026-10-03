/**
 * 通知面板與已讀時間。
 */
import { useNavigate } from "react-router-dom";
import { useLang } from "../../../lib/i18n";
import React from "react";
import { trpc } from "../../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckDouble, faXmark } from "@fortawesome/free-solid-svg-icons";
import { NotifyIcon } from "../../platform/components/icons";
import { useIsMobile, ICON_W } from "./shellShared";

export const NOTIF_LAST_SEEN_KEY = "sowork.notifications.lastSeenAt";

export function readLastSeen(): string | null {
  try { return localStorage.getItem(NOTIF_LAST_SEEN_KEY); } catch { return null; }
}

export function writeLastSeen(iso: string) {
  try { localStorage.setItem(NOTIF_LAST_SEEN_KEY, iso); } catch {/* no-op */}
}

export function NotifPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isEn = lang === "en";
  const isMobile = useIsMobile();
  // 2026-05-13: localStorage-driven read state. Server is stateless; client
  // sends current lastSeenAt so server can mark items above it as unread.
  const [lastSeen, setLastSeen] = React.useState<string | null>(() => readLastSeen());
  const utils = (trpc as any).useUtils?.() ?? null;
  const feedQ = (trpc as any).notifications?.list?.useQuery(
    { limit: 20, lastSeenIso: lastSeen ?? undefined, lang },
    { refetchOnWindowFocus: false, refetchInterval: 60_000 },
  );
  const markAllMut = (trpc as any).notifications?.markAllRead?.useMutation?.({
    onSuccess: (r: any) => {
      if (r?.lastSeenAtIso) {
        writeLastSeen(r.lastSeenAtIso);
        setLastSeen(r.lastSeenAtIso);
      }
      utils?.notifications?.list?.invalidate?.();
    },
  });
  const items: Array<any> = feedQ?.data?.items ?? [];
  const handleItemClick = (item: any) => {
    if (item.navUrl) navigate(item.navUrl);
    onClose();
  };
  return (
    <div style={{
      /* Floating card — positioned to the right of the icon bar, bottom-anchored near bell */
      position: "fixed",
      left: ICON_W + 8,
      bottom: 60,          /* just above the bell button */
      // Mobile: 380px from x=78 clips ~83px off a 375px screen (action
      // buttons lost). Fit the gap between rail and right edge.
      width: isMobile ? "calc(100vw - 86px)" : 380,
      maxHeight: "calc(100vh - 80px)",
      background: "#fff",
      borderRadius: 16,
      border: "1px solid #e5e7eb",
      boxShadow: "0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
      zIndex: 45,
      display: "flex", flexDirection: "column",
      /* Animate: scale up from bottom-left (near bell), fade in */
      animation: "notifPopIn 0.18s cubic-bezier(0.34,1.56,0.64,1) forwards",
      transformOrigin: "bottom left",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{isEn ? "Notifications" : "通知"}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => markAllMut?.mutate?.({})} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
            borderRadius: 8, border: "none", background: "none", fontSize: 12, color: "#6b7280", cursor: "pointer",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <FontAwesomeIcon icon={faCheckDouble} style={{ fontSize: 12 }} />
            {isEn ? "Mark all read" : "將全部標示為已讀"}
          </button>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: "50%", border: "none", background: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#9ca3af", cursor: "pointer", fontSize: 14,
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0", minHeight: 0 }}>
        {feedQ?.isLoading && (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            {isEn ? "Loading…" : "載入中…"}
          </div>
        )}
        {!feedQ?.isLoading && items.length === 0 && (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}><NotifyIcon size={28} /></div>
            {isEn ? "All quiet — no new notifications" : "很安靜，沒有新通知"}
          </div>
        )}
        {items.map((n) => {
          const isUnread = !!n.unread;
          return (
            <div key={n.id}
              onClick={() => handleItemClick(n)}
              style={{
                display: "flex", gap: 12, padding: "12px 16px",
                background: isUnread ? "rgba(24,24,27,0.04)" : "transparent",
                borderBottom: "1px solid #f9fafb", cursor: "pointer", position: "relative",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = isUnread ? "rgba(24,24,27,0.08)" : "#f9fafb")}
              onMouseLeave={e => (e.currentTarget.style.background = isUnread ? "rgba(24,24,27,0.04)" : "transparent")}
            >
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: n.avatarColor,
                display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: 700,
              }}>{n.avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: "#111827", lineHeight: 1.45, marginBottom: 4, fontWeight: isUnread ? 600 : 400 }}>{n.title}</p>
                {n.excerpt && (
                  <div style={{
                    fontSize: 12, color: "#6b7280", background: "#f9fafb", borderRadius: 6,
                    padding: "4px 8px", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{n.excerpt}</div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ca3af" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: isUnread ? "#ef4444" : "#d1d5db", flexShrink: 0 }} />
                  <span>{n.relativeTime}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
