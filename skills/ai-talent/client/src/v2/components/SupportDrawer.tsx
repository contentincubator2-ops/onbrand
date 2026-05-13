/**
 * SupportDrawer — Mia · 客戶成功 chat drawer (Layer 2 + 3).
 *
 * Opens from the bottom-right Notion-style avatar in ShellLayout. The
 * user sees a Slack-DM-style thread with Mia (LLM-backed customer
 * success agent). Mia knows the user's current scope, recent task run
 * and brand voice (server gathers context per message).
 *
 * If Mia can't help → "我要找真人 →" button creates a `support_tickets`
 * row with the full session context attached. CJ sees it in
 * /admin/support and replies; the reply comes back into the same thread.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import { X, Send, UserRound } from "lucide-react";
import type { ScopeState } from "../app/shell/ScopeBar";

interface Props {
  open: boolean;
  onClose: () => void;
  scope: ScopeState;
}

type Message = { id: number; role: string; content: string; createdAt: string };

const MIA_AVATAR =
  "https://api.dicebear.com/7.x/notionists/svg?seed=mia-cs-onbrand&backgroundColor=ede9fe&backgroundType=solid&radius=50";

export default function SupportDrawer({ open, onClose, scope }: Props) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const loc = useLocation();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const startMut    = (trpc as any).support?.startConversation?.useMutation?.();
  const sendMut     = (trpc as any).support?.sendMessage?.useMutation?.();
  const escalateMut = (trpc as any).support?.escalateToHuman?.useMutation?.();

  // Bootstrap conversation on open
  useEffect(() => {
    if (!open || conversationId != null) return;
    (async () => {
      try {
        const r = await startMut?.mutateAsync?.({ brandId: scope.brandId ?? null });
        if (r?.conversationId) {
          setConversationId(r.conversationId);
          setMessages(r.messages ?? []);
        }
      } catch (e) {
        // swallow — drawer still works, user can retry
        console.warn("[SupportDrawer] start failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !conversationId) return;
    setSending(true);
    // optimistic user message
    const optimisticUser: Message = {
      id: Date.now(), role: "user", content: text, createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimisticUser]);
    setInput("");
    try {
      const r = await sendMut?.mutateAsync?.({
        conversationId,
        content: text,
        currentPath: loc.pathname,
        brandId: scope.brandId ?? null,
        productId: scope.productId ?? null,
        eventId: scope.eventId ?? null,
      });
      if (r?.miaMessage) {
        setMessages((m) => {
          // replace optimistic id with server id if available
          const replaced = r.userMessage
            ? m.map((x) => (x === optimisticUser ? r.userMessage : x))
            : m;
          return [...replaced, r.miaMessage];
        });
      }
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1, role: "mia",
          content: `（連線出狀況：${String(e?.message ?? e).slice(0, 80)}。你可以點下方「我要找真人 →」直接給 SoWork 看。）`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleEscalate = async () => {
    if (!conversationId) return;
    const summary = messages.filter((m) => m.role === "user").slice(-1)[0]?.content
                 ?? messages[messages.length - 1]?.content
                 ?? (isEn ? "Customer needs help" : "客戶需要協助");
    try {
      const r = await escalateMut?.mutateAsync?.({
        conversationId,
        summary: summary.slice(0, 400),
        currentPath: loc.pathname,
        brandId: scope.brandId ?? null,
        productId: scope.productId ?? null,
        eventId: scope.eventId ?? null,
        browser: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : undefined,
      });
      if (r?.ticketId) {
        setMessages((m) => [
          ...m,
          {
            id: Date.now() + 2, role: "mia",
            content: isEn
              ? `Opened ticket #${r.ticketId} (${r.tag}). SoWork will reply within 4 hours via the same chat.`
              : `已開單 #${r.ticketId}（${r.tag}）。SoWork 會在 4 小時內在這個對話框回你。`,
            createdAt: new Date().toISOString(),
          },
        ]);
        setShowEscalate(false);
      }
    } catch (e) {
      console.warn("[SupportDrawer] escalate failed:", e);
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", bottom: 90, right: 20, zIndex: 60,
      width: 380, maxHeight: "calc(100vh - 130px)",
      background: "white",
      borderRadius: 16,
      border: "1px solid #e5e7eb",
      boxShadow: "0 20px 50px rgba(0,0,0,0.18), 0 4px 12px rgba(124,58,237,0.18)",
      display: "flex", flexDirection: "column",
      animation: "miaPopIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
      transformOrigin: "bottom right",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px",
        borderBottom: "1px solid #f3f4f6",
        background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(0,180,188,0.06))",
      }}>
        <img src={MIA_AVATAR} alt="Mia" style={{ width: 40, height: 40, borderRadius: "50%" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
            Mia
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: "#6b7280" }}>
              · {isEn ? "Customer Success" : "客戶成功"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#10b981", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
            {isEn ? "Online — typically replies in seconds" : "在線中 — 通常秒回"}
          </div>
        </div>
        <button onClick={onClose} style={{
          width: 28, height: 28, borderRadius: "50%", border: "none", background: "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#9ca3af", cursor: "pointer",
        }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <X size={16} />
        </button>
      </div>

      {/* Message list */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "12px 14px",
        background: "#fafafa",
        display: "flex", flexDirection: "column", gap: 10,
        minHeight: 200, maxHeight: 380,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 12, padding: "40px 16px" }}>
            {isEn ? "Loading…" : "讀取中…"}
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {sending && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <img src={MIA_AVATAR} alt="" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{
              padding: "10px 14px", borderRadius: "16px 16px 16px 4px",
              background: "white", border: "1px solid #e5e7eb",
              fontSize: 13, color: "#9ca3af",
            }}>
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #f3f4f6", padding: 10, background: "white" }}>
        {showEscalate ? (
          <div style={{
            display: "flex", flexDirection: "column", gap: 8,
            padding: "8px 4px",
          }}>
            <p style={{ fontSize: 12, color: "#525252", lineHeight: 1.5 }}>
              {isEn
                ? "Open a ticket? SoWork will see this conversation + your current page, brand and recent task."
                : "要開單給 SoWork 嗎？我會帶上這段對話、你現在的頁面、品牌、最近一筆任務。"}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleEscalate}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8,
                  background: "#171717", color: "white", border: "none",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                <UserRound size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />
                {isEn ? "Yes, open ticket" : "好，開單"}
              </button>
              <button
                onClick={() => setShowEscalate(false)}
                style={{
                  padding: "8px 12px", borderRadius: 8,
                  background: "transparent", color: "#525252", border: "1px solid #e5e7eb",
                  fontSize: 12, cursor: "pointer",
                }}
              >
                {isEn ? "Not yet" : "再聊聊"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={isEn ? "Tell Mia what's up…" : "卡在哪裡？跟 Mia 說…"}
                rows={1}
                style={{
                  flex: 1, resize: "none",
                  padding: "8px 12px", borderRadius: 10,
                  border: "1px solid #e5e7eb", fontSize: 13,
                  fontFamily: "inherit", lineHeight: 1.4,
                  outline: "none",
                  minHeight: 36, maxHeight: 100,
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                style={{
                  width: 36, height: 36, borderRadius: "50%", border: "none",
                  background: !input.trim() || sending ? "#e5e7eb" : "#171717",
                  color: "white", cursor: !input.trim() || sending ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
                aria-label={isEn ? "Send" : "送出"}
              >
                <Send size={14} />
              </button>
            </div>
            <button
              onClick={() => setShowEscalate(true)}
              style={{
                marginTop: 8, fontSize: 11, color: "#6b7280",
                background: "transparent", border: "none", cursor: "pointer",
                padding: "2px 4px",
              }}
            >
              {isEn ? "Need a real human? →" : "我要找真人 →"}
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes miaPopIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isAdmin = message.role === "admin";
  const showAvatar = !isUser;
  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "flex-end",
      flexDirection: isUser ? "row-reverse" : "row",
    }}>
      {showAvatar && (
        isAdmin ? (
          <div style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: "#171717", color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>S</div>
        ) : (
          <img src={MIA_AVATAR} alt="" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
        )
      )}
      <div style={{
        maxWidth: "78%",
        padding: "8px 12px",
        borderRadius: isUser
          ? "16px 16px 4px 16px"
          : "16px 16px 16px 4px",
        background: isUser ? "#171717"
                  : isAdmin ? "#FEF2F2"
                  : "white",
        color: isUser ? "white" : "#1A1A18",
        border: isUser ? "none" : isAdmin ? "1px solid #FCA5A5" : "1px solid #e5e7eb",
        fontSize: 13, lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {isAdmin && (
          <div style={{ fontSize: 10, fontWeight: 700, color: "#B91C1C", marginBottom: 3, letterSpacing: 0.5 }}>
            SOWORK 團隊
          </div>
        )}
        {message.content}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
      <style>{`
        @keyframes miaDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </span>
  );
}
function Dot({ delay }: { delay: number }) {
  return (
    <span style={{
      width: 5, height: 5, borderRadius: "50%", background: "#525252",
      animation: `miaDot 1s ${delay}ms infinite`, display: "inline-block",
    }} />
  );
}
