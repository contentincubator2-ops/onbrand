/**
 * ChatDrawer — v2 D4. Demotes the legacy MissionChatCore experience
 * from center-stage to a right-edge slide-in.
 *
 * Loads `trpc.message.list` for the active mission, sends new user
 * messages via `trpc.message.sendAndReply` (which both saves the
 * message and runs the LLM with mission+methodology context).
 *
 * The drawer is opt-in: a small floating "對話" pill at the
 * bottom-right of MissionDetail toggles it. Closing the drawer does
 * not lose history — messages persist on the mission row.
 */
import React, { useEffect, useRef, useState } from "react";
import { trpc } from "../../../lib/trpc";

interface Message {
  id?: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
}

export default function ChatDrawer({
  missionId,
  open,
  onClose,
  squadName,
}: {
  missionId: number;
  open: boolean;
  onClose: () => void;
  squadName?: string | null;
}) {
  const utils = trpc.useUtils?.() ?? (trpc as any).useContext?.();
  const listQuery = trpc.message.list.useQuery(
    { missionId },
    { enabled: open && !!missionId, refetchOnWindowFocus: false }
  );
  const messages: Message[] = ((listQuery.data as any[]) ?? []).map((r) => ({
    id: r.id, role: r.role, content: r.content, createdAt: r.createdAt,
  }));

  const sendMutation = (trpc as any).message.sendAndReply.useMutation();
  const clearMutation = (trpc as any).message.clear.useMutation();

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  const send = async () => {
    if (!draft.trim() || busy) return;
    const content = draft.trim();
    setDraft("");
    setBusy(true);
    // Optimistic user-message insertion
    utils?.message?.list?.setData?.({ missionId }, (prev: any) => [
      ...(prev ?? []),
      { id: -Date.now(), role: "user", content, createdAt: new Date().toISOString() },
    ]);
    try {
      await sendMutation.mutateAsync({ missionId, content });
      await utils?.message?.list?.invalidate?.({ missionId });
    } catch (e) {
      console.error("[ChatDrawer] send failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (!window.confirm("清空這個任務的對話歷史？")) return;
    await clearMutation.mutateAsync({ missionId });
    await utils?.message?.list?.invalidate?.({ missionId });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-foreground/30" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-[480px] bg-white border-l border-divider flex flex-col shadow-lift">
        {/* Header */}
        <div className="px-5 py-4 border-b border-divider flex items-start justify-between bg-background">
          <div>
            <div className="text-tiny tracking-[0.28em] uppercase text-default-400">
              MISSION CHAT
            </div>
            <div className="font-semibold text-medium text-foreground">
              {squadName ? `與 ${squadName} 對話` : "Squad Chat"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearAll}
              className="text-tiny tracking-[0.16em] uppercase text-default-400 hover:text-danger px-2 py-1"
              title="清空"
            >
              清空
            </button>
            <button
              onClick={onClose}
              className="text-tiny tracking-[0.16em] uppercase text-default-500 hover:text-foreground px-2 py-1"
            >
              關閉 ×
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {listQuery.isLoading && (
            <div className="text-small text-default-500">載入對話中…</div>
          )}
          {!listQuery.isLoading && messages.length === 0 && (
            <div className="text-center py-12">
              <div className="text-tiny tracking-[0.28em] uppercase text-default-400">
                EMPTY
              </div>
              <div className="mt-1 text-small text-default-500">
                還沒有對話 — 在下方輸入問題開始
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <Bubble key={msg.id ?? i} role={msg.role}>{msg.content}</Bubble>
          ))}

          {busy && <Bubble role="assistant" pending>思考中…</Bubble>}
        </div>

        {/* Composer */}
        <div className="border-t border-divider p-3 bg-background">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="問 squad lead — Enter 送出，Shift+Enter 換行"
            rows={3}
            className="w-full bg-white border border-divider px-3 py-2 text-small text-foreground focus:outline-none focus:border-foreground resize-none"
            disabled={busy}
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="text-tiny tracking-[0.16em] text-default-400">
              對話內容會綁定到此任務
            </div>
            <button
              onClick={send}
              disabled={!draft.trim() || busy}
              className="px-4 py-1.5 text-tiny tracking-[0.18em] uppercase bg-foreground text-white hover:bg-foreground/90 transition disabled:opacity-50"
            >
              送出 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  role, children, pending,
}: {
  role: "user" | "assistant" | "system";
  children: React.ReactNode;
  pending?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={["flex", isUser ? "justify-end" : "justify-start"].join(" ")}>
      <div
        className={[
          "max-w-[80%] px-4 py-2.5 text-small leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-foreground text-white"
            : "bg-background border border-divider text-foreground",
          pending ? "italic text-default-500" : "",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
