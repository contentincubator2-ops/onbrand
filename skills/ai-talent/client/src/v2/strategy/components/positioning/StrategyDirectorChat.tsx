/**
 * StrategyDirectorChat — 策略總監對話面板。
 *
 * 2026-09-23（CJ「要怎麼設計，可以讓策略總監可以提供用戶，用對話的方式，
 * 問策略總監有關於策略的問題？然後，策略總監也可以引導進行策略監測和
 * 健檢？」）：取代原本靜態的一句話 speech bubble——使用者真的可以問問題，
 * 總監會根據品牌定位回答，覺得適合的時候會建議「要不要看看策略監測／
 * 做一次健檢」，附一顆按鈕；點下去只是打開對應的既有面板（不直接觸發掃描
 * 或健檢——那兩個動作本來就要使用者在那個面板裡自己按，這裡只負責「引導
 * 過去」，維持這個 session 一貫的「提案不自動套用」紀律）。
 *
 * 視覺上刻意跟 SupportDrawer（Mia 客服）區隔開——這裡是嵌在頁面裡的固定
 * 面板，不是浮動抽屜，用 AgentPersonaBar 那套「B&W 描邊 + 4px 陰影」語言，
 * 不是 Mia 的漸層紫色調。
 */
import React from "react";
import { Send } from "lucide-react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";

type StrategistAction = { kind: "open_monitor" | "open_healthcheck"; label: string };
type ChatMessage = { id: number; role: string; content: string; actions?: StrategistAction[] };

export default function StrategyDirectorChat({
  brandId, onOpenMonitor, onOpenHealthCheck,
}: {
  brandId: number;
  /** 使用者點了「看看外部有什麼變化」建議按鈕——打開策略監測面板。 */
  onOpenMonitor: () => void;
  /** 使用者點了「帶我去做健檢」建議按鈕——打開策略健檢面板。 */
  onOpenHealthCheck: () => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const [conversationId, setConversationId] = React.useState<number | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  const convQ = (trpc as any).strategistChat?.getConversation?.useQuery
    ? (trpc as any).strategistChat.getConversation.useQuery({ brandId }, { enabled: !!brandId, refetchOnWindowFocus: false })
    : { data: null, isLoading: false };
  const loadedRef = React.useRef(false);
  React.useEffect(() => {
    if (convQ?.data && !loadedRef.current) {
      loadedRef.current = true;
      setConversationId(convQ.data.conversationId);
      setMessages(convQ.data.messages ?? []);
    }
  }, [convQ?.data]);

  const sendMut = (trpc as any).strategistChat?.sendMessage?.useMutation?.();

  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = () => {
    const text = input.trim();
    if (!text || !conversationId || sending) return;
    setError(null);
    setSending(true);
    setInput("");
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: text }]);
    sendMut?.mutate?.({ conversationId, brandId, content: text }, {
      onSuccess: (r: any) => {
        setSending(false);
        if (r?.strategistMessage) {
          setMessages((prev) => [...prev, {
            id: r.strategistMessage.id, role: "strategist",
            content: r.strategistMessage.content, actions: r.strategistMessage.actions ?? [],
          }]);
        }
      },
      onError: (e: any) => {
        setSending(false);
        setError((typeof e?.message === "string" ? e.message : null) ?? (en ? "Failed to send — try again" : "傳送失敗，再試一次"));
      },
    });
  };

  const runAction = (a: StrategistAction) => {
    if (a.kind === "open_monitor") onOpenMonitor();
    else if (a.kind === "open_healthcheck") onOpenHealthCheck();
  };

  return (
    <div style={{
      border: "2px solid #111", borderRadius: 18, background: "#fff",
      boxShadow: "4px 4px 0 rgba(17,17,17,0.15)",
      display: "flex", flexDirection: "column",
      // 2026-09-23（CJ「我按一段文字後，一送出它的視窗就縮小」）：改成
      // 固定 height（不是 maxHeight）——根因是舊版只靠內容撐開高度，
      // 空狀態的介紹文字比訊息氣泡還高，送出第一則訊息後介紹文字消失、
      // 容器就跟著縮小。固定高度後，不管訊息多寡，外框永遠一樣大，只有
      // 裡面的訊息區自己捲動。
      height: 440,
    }}>
      <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && !convQ?.isLoading && (
          <p style={{ fontSize: 13, color: "#737373", fontStyle: "italic", margin: 0 }}>
            {en
              ? "Ask me anything about this brand's strategy — positioning, audience, competition, differentiation, voice. I can also point you to Strategy Monitoring or a Health Check when it'd help."
              : "問我任何跟這個品牌策略有關的問題——定位、受眾、競爭、差異化、語氣都可以。覺得幫得上忙的時候，我也會建議你看看策略監測或做一次健檢。"}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "82%", padding: "8px 13px", borderRadius: 14,
              background: m.role === "user" ? "#171717" : "#F5F4F2",
              color: m.role === "user" ? "#fff" : "#171717",
              fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
            }}>
              {m.content}
            </div>
            {m.actions && m.actions.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {m.actions.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => runAction(a)}
                    style={{
                      fontSize: 12.5, fontWeight: 600, border: "1.5px solid #171717", borderRadius: 999,
                      padding: "4px 12px", background: "#fff", cursor: "pointer", color: "#171717",
                    }}
                  >
                    {a.label} →
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div style={{ fontSize: 12.5, color: "#a3a3a3" }}>
            {en ? "Strategy Director is typing…" : "策略總監輸入中…"}
          </div>
        )}
      </div>
      {error && (
        <div style={{ padding: "0 16px 6px", fontSize: 12, color: "#B45309" }}>⚠ {error}</div>
      )}
      <div style={{ borderTop: "1px solid #E5E5E5", padding: 10, display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={en ? "Ask the Strategy Director…" : "問策略總監…"}
          disabled={sending || !conversationId}
          style={{ flex: 1, fontSize: 13.5, padding: "8px 12px", borderRadius: 10, border: "1px solid #D4D4D4", outline: "none" }}
        />
        <button
          onClick={send}
          disabled={sending || !input.trim() || !conversationId}
          aria-label={en ? "Send" : "送出"}
          style={{
            width: 36, height: 36, borderRadius: 10, border: "none",
            background: "#171717", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", opacity: (sending || !input.trim() || !conversationId) ? 0.45 : 1,
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
