/**
 * AdminSupportPage — internal-only inbox for support tickets opened from
 * the Mia chat drawer. Layer 3 of the 4-layer support architecture.
 *
 * Route: /admin/support  (gated server-side via isAdminUser allowlist —
 * userId 199 OR @sowork.{tw,ai} email)
 *
 * Left rail: ticket list filtered by status.
 * Right pane: ticket details + conversation history + reply + tag/resolve.
 */
import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";

type TicketRow = {
  id: number;
  userId: number;
  userEmail: string | null;
  status: "open" | "in_progress" | "resolved";
  tag: string | null;
  priority: "low" | "normal" | "high";
  subject: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  conversationId: number;
};

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  open:          { bg: "#FEE2E2", fg: "#991B1B", label: "未處理" },
  in_progress:   { bg: "#DBEAFE", fg: "#1E3A8A", label: "處理中" },
  resolved:      { bg: "#D1FAE5", fg: "#065F46", label: "已解決" },
};
const TAG_COLORS: Record<string, string> = {
  bug:        "#EF4444",
  feature:    "#7C3AED",
  "how-to":   "#3B82F6",
  billing:    "#F59E0B",
};

export default function AdminSupportPage() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "resolved">("open");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listQ = (trpc as any).support?.adminListTickets?.useQuery?.(
    { status: statusFilter },
    { refetchInterval: 15_000 },
  );
  const utils = (trpc as any).useUtils?.() ?? null;

  const tickets: TicketRow[] = listQ?.data ?? [];
  useEffect(() => {
    if (selectedId == null && tickets.length > 0) setSelectedId(tickets[0]!.id);
  }, [tickets, selectedId]);

  const counts = useMemo(() => {
    const c = { all: 0, open: 0, in_progress: 0, resolved: 0 };
    for (const t of tickets) {
      c.all++;
      if (t.status in c) (c as any)[t.status]++;
    }
    return c;
  }, [tickets]);

  // Admin gate: query throws FORBIDDEN if not allowed
  const forbidden = listQ?.error?.data?.code === "FORBIDDEN";
  if (forbidden) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
        {isEn ? "Admin only." : "僅限 SoWork 內部使用。"}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)", background: "#fafafa" }}>
      {/* Left rail */}
      <div style={{
        width: 360, borderRight: "1px solid #e5e7eb",
        background: "white",
        display: "flex", flexDirection: "column",
        flexShrink: 0,
      }}>
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 10 }}>
            {isEn ? "Support inbox" : "客服收件匣"}
          </h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["open", "in_progress", "resolved", "all"] as const).map((s) => {
              const active = statusFilter === s;
              const label = s === "all" ? (isEn ? "All" : "全部")
                          : STATUS_COLORS[s]!.label;
              return (
                <button key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    padding: "3px 10px", borderRadius: 999,
                    fontSize: 11, fontWeight: 600,
                    border: active ? "1px solid #171717" : "1px solid #e5e7eb",
                    background: active ? "#171717" : "white",
                    color: active ? "white" : "#525252",
                    cursor: "pointer",
                  }}
                >
                  {label} {(counts as any)[s] != null && `(${(counts as any)[s]})`}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {listQ?.isLoading && (
            <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
              {isEn ? "Loading…" : "讀取中…"}
            </div>
          )}
          {!listQ?.isLoading && tickets.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
              🎉 {isEn ? "Inbox zero." : "全部結清。"}
            </div>
          )}
          {tickets.map((t) => {
            const sc = STATUS_COLORS[t.status]!;
            const selected = t.id === selectedId;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  width: "100%", display: "flex", flexDirection: "column",
                  gap: 4, padding: "12px 16px",
                  border: "none",
                  borderLeft: selected ? "3px solid #171717" : "3px solid transparent",
                  borderBottom: "1px solid #f9fafb",
                  background: selected ? "#fafafa" : "white",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    padding: "1px 7px", borderRadius: 4,
                    fontSize: 10, fontWeight: 700,
                    background: sc.bg, color: sc.fg,
                  }}>{sc.label}</span>
                  {t.tag && (
                    <span style={{
                      padding: "1px 7px", borderRadius: 4,
                      fontSize: 10, fontWeight: 600,
                      background: (TAG_COLORS[t.tag] ?? "#9ca3af") + "22",
                      color: TAG_COLORS[t.tag] ?? "#525252",
                    }}>{t.tag}</span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#9ca3af" }}>
                    #{t.id}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#171717", fontWeight: 500, lineHeight: 1.35 }}>
                  {t.subject ?? "(no subject)"}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  {t.userEmail ?? `user ${t.userId}`} · {new Date(t.updatedAt).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right pane */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {selectedId == null ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
            {isEn ? "Select a ticket on the left." : "從左側選一張單看細節。"}
          </div>
        ) : (
          <TicketDetail
            ticketId={selectedId}
            onUpdated={() => {
              utils?.support?.adminListTickets?.invalidate?.();
              utils?.support?.adminGetTicket?.invalidate?.();
            }}
          />
        )}
      </div>
    </div>
  );
}

function TicketDetail({ ticketId, onUpdated }: { ticketId: number; onUpdated: () => void }) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const ticketQ = (trpc as any).support?.adminGetTicket?.useQuery?.(
    { ticketId },
    { refetchInterval: 15_000 },
  );
  const replyMut  = (trpc as any).support?.adminReply?.useMutation?.({
    onSuccess: () => { ticketQ?.refetch?.(); onUpdated(); },
  });
  const updateMut = (trpc as any).support?.adminUpdateTicket?.useMutation?.({
    onSuccess: () => { ticketQ?.refetch?.(); onUpdated(); },
  });

  const [reply, setReply] = useState("");

  const data = ticketQ?.data;
  if (ticketQ?.isLoading) {
    return <div style={{ flex: 1, padding: 24, color: "#9ca3af", fontSize: 12 }}>{isEn ? "Loading…" : "讀取中…"}</div>;
  }
  if (!data?.ticket) {
    return <div style={{ flex: 1, padding: 24, color: "#9ca3af" }}>{isEn ? "Not found." : "找不到這張單。"}</div>;
  }
  const ticket = data.ticket;
  const messages = data.messages ?? [];

  const send = async () => {
    if (!reply.trim()) return;
    await replyMut?.mutateAsync?.({ ticketId, content: reply.trim() });
    setReply("");
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Detail header */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #e5e7eb", background: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>#{ticket.id}</span>
          <select
            value={ticket.status}
            onChange={(e) => updateMut?.mutate?.({ ticketId, status: e.target.value as any })}
            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #e5e7eb" }}
          >
            <option value="open">未處理</option>
            <option value="in_progress">處理中</option>
            <option value="resolved">已解決</option>
          </select>
          <select
            value={ticket.tag ?? ""}
            onChange={(e) => updateMut?.mutate?.({ ticketId, tag: e.target.value as any })}
            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #e5e7eb" }}
          >
            <option value="">(no tag)</option>
            <option value="bug">bug</option>
            <option value="feature">feature</option>
            <option value="how-to">how-to</option>
            <option value="billing">billing</option>
          </select>
          <select
            value={ticket.priority}
            onChange={(e) => updateMut?.mutate?.({ ticketId, priority: e.target.value as any })}
            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #e5e7eb" }}
          >
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
          </select>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
          {ticket.subject}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          {ticket.userEmail ?? `user ${ticket.userId}`} · 開單於 {new Date(ticket.createdAt).toLocaleString("zh-TW", { hour12: false })}
        </div>
      </div>

      {/* Context summary */}
      {ticket.autoContext && (
        <div style={{ padding: "10px 24px", background: "#FFFBEB", borderBottom: "1px solid #FCD34D", fontSize: 11, color: "#78350F", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📍 系統自動帶入</div>
          {ticket.autoContext.sessionCtx ?? JSON.stringify(ticket.autoContext, null, 2)}
        </div>
      )}

      {/* Conversation */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", background: "#fafafa", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((m: any) => {
          const isUser = m.role === "user";
          const isAdmin = m.role === "admin";
          const bg = isUser ? "#171717" : isAdmin ? "#FEF2F2" : "white";
          const color = isUser ? "white" : "#1A1A18";
          const align = isAdmin ? "flex-end" : "flex-start";
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: align }}>
              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 3 }}>
                {isUser ? "👤 用戶" : isAdmin ? "🟥 SoWork" : "🤖 Mia"} · {new Date(m.createdAt).toLocaleString("zh-TW", { hour12: false, hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{
                maxWidth: "80%",
                padding: "8px 12px",
                borderRadius: 12,
                background: bg, color,
                border: isAdmin ? "1px solid #FCA5A5" : isUser ? "none" : "1px solid #e5e7eb",
                fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {m.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply box */}
      <div style={{ borderTop: "1px solid #e5e7eb", padding: 14, background: "white" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault(); send();
              }
            }}
            placeholder={isEn ? "Reply as SoWork… (⌘+Enter to send)" : "以 SoWork 身份回覆… (⌘+Enter 送出)"}
            rows={3}
            style={{
              flex: 1, resize: "vertical",
              padding: "10px 12px", borderRadius: 10,
              border: "1px solid #e5e7eb", fontSize: 13,
              fontFamily: "inherit", lineHeight: 1.5,
              outline: "none",
            }}
          />
          <button
            onClick={send}
            disabled={!reply.trim() || replyMut?.isPending}
            style={{
              padding: "10px 16px", borderRadius: 10,
              border: "none", background: !reply.trim() ? "#e5e7eb" : "#171717",
              color: "white", fontSize: 13, fontWeight: 600,
              cursor: !reply.trim() ? "default" : "pointer",
              alignSelf: "stretch",
            }}
          >
            {replyMut?.isPending ? "..." : (isEn ? "Send" : "送出")}
          </button>
        </div>
      </div>
    </div>
  );
}
