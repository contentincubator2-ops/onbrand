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
 * 2026-09-23 第三輪（CJ「問問題的引導」，三種都要）：使用者打開面板最大的
 * 障礙是「不知道能問什麼」，所以提問引導有三層，而且刻意都用「直接送出」
 * 而不是「填進輸入框」——少一步操作：
 *   1. 這位總監的招牌問題膠囊，常駐在輸入框上方（不只空狀態才有）。三位
 *      總監的招牌問題不同（server 依角色給），換人時問題跟著換，讓「換了
 *      一位真的不一樣的人」這件事看得見。
 *   2. 每則回答下面的追問建議（server 端 <<ask>> 標記解析而來），是從那段
 *      回答長出來的下一題，不是通用問句。
 *   3. 空狀態仍然保留一句說明，但不再是唯一的引導。
 *
 * 視覺上刻意跟 SupportDrawer（Mia 客服）區隔開——這裡是嵌在頁面裡的固定
 * 面板，不是浮動抽屜，用 AgentPersonaBar 那套「B&W 描邊 + 4px 陰影」語言，
 * 不是 Mia 的漸層紫色調。
 */
import React from "react";
import { Send } from "lucide-react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { type StrategistDirector, signatureQuestionsOf } from "../../lib/strategistDirectors";

type StrategistAction = { kind: "open_monitor" | "open_healthcheck"; label: string };
type ChatMessage = { id: number; role: string; content: string; actions?: StrategistAction[]; followUps?: string[] };

export default function StrategyDirectorChat({
  brandId, agentId, productId, director, height, onOpenMonitor, onOpenHealthCheck,
}: {
  brandId: number;
  /** 哪一位總監——每位一串獨立對話，所以這個值變了就要整串重載。 */
  agentId: number | null;
  /** 使用者現在正在看的產品（URL 的 ?p=）；後端會把那個產品的完整定位加進 prompt。 */
  productId: number | null;
  director: StrategistDirector | null;
  /** 跟 roster / profile 檢視等高，避免切換檢視時面板高度跳動。 */
  height: number;
  /** 使用者點了「看看外部有什麼變化」建議按鈕——打開策略監測面板。 */
  onOpenMonitor: () => void;
  /** 使用者點了「帶我去做健檢」建議按鈕——打開策略健檢面板。 */
  onOpenHealthCheck: () => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const [conversationId, setConversationId] = React.useState<number | null>(null);
  // 2026-09-26（CJ「增加一個按鈕，是開新對話，其他對話，就會留成歷史對話」）：
  // viewingId = 正在看哪一串歷史（null = 目前這串）。歷史是唯讀的：看得到，
  // 但要繼續講就得開新的——否則「歷史」會被續寫，就不再是歷史了。
  const [viewingId, setViewingId] = React.useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [readOnly, setReadOnly] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  const convQ = (trpc as any).strategistChat?.getConversation?.useQuery
    ? (trpc as any).strategistChat.getConversation.useQuery(
        { brandId, ...(agentId ? { agentId } : {}), ...(viewingId ? { conversationId: viewingId } : {}) },
        { enabled: !!brandId && !!agentId, refetchOnWindowFocus: false },
      )
    : { data: null, isLoading: false };

  // 換人＝換一串對話。上一位的訊息不能留在畫面上（會看起來像新的人繼承了
  // 舊對話），所以 agentId 一變就清空、並讓 loadedRef 重新允許載入一次。
  const loadedForAgentRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (loadedForAgentRef.current !== null && loadedForAgentRef.current !== agentId) {
      setMessages([]);
      setConversationId(null);
      setError(null);
    }
  }, [agentId]);
  React.useEffect(() => {
    const data = convQ?.data;
    if (!data || !agentId) return;
    if (loadedForAgentRef.current === agentId && conversationId === data.conversationId) return;
    loadedForAgentRef.current = agentId;
    setConversationId(data.conversationId);
    setMessages(data.messages ?? []);
    setReadOnly(!!data.readOnly);
  }, [convQ?.data, agentId, conversationId]);

  // 換人時把歷史檢視收掉——不然會拿著上一位的某一串繼續看。
  React.useEffect(() => { setViewingId(null); setHistoryOpen(false); }, [agentId]);

  const historyQ = (trpc as any).strategistChat?.history?.useQuery
    ? (trpc as any).strategistChat.history.useQuery(
        { brandId, agentId: agentId ?? 0 },
        { enabled: !!brandId && !!agentId && historyOpen, refetchOnWindowFocus: false },
      )
    : { data: [] };
  const startNewMut = (trpc as any).strategistChat?.startNew?.useMutation?.();
  const utils = (trpc as any).useUtils?.() ?? null;

  const startNew = () => {
    if (!agentId || startNewMut?.isPending) return;
    startNewMut?.mutate?.({ brandId, agentId }, {
      onSuccess: () => {
        // 讓 getConversation 重跑：它會建新的一串並重新產生開場白。
        setViewingId(null); setHistoryOpen(false); setReadOnly(false);
        setMessages([]); setConversationId(null);
        loadedForAgentRef.current = null;
        utils?.strategistChat?.getConversation?.invalidate?.();
        utils?.strategistChat?.history?.invalidate?.();
      },
    });
  };

  const sendMut = (trpc as any).strategistChat?.sendMessage?.useMutation?.();

  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  /** text 省略時送輸入框內容；膠囊是直接把問題送出去，不先填進輸入框。 */
  const send = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || !conversationId || sending || readOnly) return;
    setError(null);
    setSending(true);
    if (text === undefined) setInput("");
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content }]);
    sendMut?.mutate?.({ conversationId, brandId, content, ...(productId ? { productId } : {}) }, {
      onSuccess: (r: any) => {
        setSending(false);
        if (r?.strategistMessage) {
          setMessages((prev) => [...prev, {
            id: r.strategistMessage.id, role: "strategist",
            content: r.strategistMessage.content,
            actions: r.strategistMessage.actions ?? [],
            followUps: r.strategistMessage.followUps ?? [],
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

  // 追問建議只掛在「最後一則」總監訊息上——舊訊息底下留著一排過期的追問，
  // 會讓對話看起來到處都是按鈕，也容易點到早就問過的東西。
  const lastStrategistIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.role !== "user") return i;
    return -1;
  })();
  const signature = signatureQuestionsOf(director, en);
  const chipStyle: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 600, border: "1px solid #D4D4D4", borderRadius: 999,
    padding: "4px 11px", background: "#fff", color: "#404040", cursor: "pointer",
    whiteSpace: "nowrap", flexShrink: 0,
  };

  return (
    <div style={{
      border: "2px solid #111", borderRadius: 18, background: "#fff",
      boxShadow: "4px 4px 0 rgba(17,17,17,0.15)",
      display: "flex", flexDirection: "column",
      // 2026-09-23（CJ「我按一段文字後，一送出它的視窗就縮小」）：固定
      // height（不是 maxHeight）——根因是舊版只靠內容撐開高度，空狀態的
      // 介紹文字比訊息氣泡還高，送出第一則訊息後介紹文字消失、容器就跟著
      // 縮小。固定高度後不管訊息多寡外框永遠一樣大，只有訊息區自己捲動；
      // 這個高度由 Drawer 統一傳，跟 roster/profile 兩個檢視共用同一個值。
      height,
    }}>
      {/* 2026-09-26：對話的兩顆動作。放在最上面而不是輸入框旁邊——它們是
          「這串對話」層級的事，跟「這一句要說什麼」不同層。 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
        borderBottom: "1px solid #E5E5E5", flexWrap: "wrap",
      }}>
        <button
          onClick={startNew}
          disabled={!agentId || startNewMut?.isPending}
          title={en ? "Start a new conversation — this one is kept in history" : "開一串新的對話，這一串會留成歷史"}
          style={{ ...chipStyle, opacity: startNewMut?.isPending ? 0.5 : 1 }}
        >
          {startNewMut?.isPending ? (en ? "Starting…" : "開新中…") : (en ? "New chat" : "開新對話")}
        </button>
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          style={{ ...chipStyle, background: historyOpen ? "#171717" : "#fff", color: historyOpen ? "#fff" : "#404040" }}
        >
          {en ? "History" : "歷史對話"}
        </button>
        {viewingId && (
          <button onClick={() => { setViewingId(null); loadedForAgentRef.current = null; }} style={chipStyle}>
            {en ? "Back to current" : "回到目前這串"}
          </button>
        )}
        {readOnly && (
          <span style={{ fontSize: 11, color: "#B45309" }}>
            {en ? "Read-only — start a new chat to continue" : "唯讀 —— 要繼續講請開新對話"}
          </span>
        )}
      </div>

      {historyOpen && (
        <div style={{ maxHeight: 160, overflowY: "auto", borderBottom: "1px solid #E5E5E5", padding: "6px 8px" }}>
          {(historyQ?.data ?? []).length === 0 ? (
            <p style={{ fontSize: 12, color: "#737373", margin: "6px 4px" }}>
              {en ? "No past conversations yet." : "還沒有歷史對話。"}
            </p>
          ) : (
            (historyQ.data as any[]).map((h) => (
              <button
                key={h.id}
                onClick={() => { setViewingId(h.id); setHistoryOpen(false); loadedForAgentRef.current = null; }}
                style={{
                  display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
                  padding: "6px 6px", cursor: "pointer", borderRadius: 6,
                }}
              >
                <span style={{ fontSize: 12.5, color: "#171717" }}>
                  {/* 預覽用使用者自己講的第一句；只有開場白的那種照實說「還沒聊過」，
                      不要編一個標題。 */}
                  {h.preview ?? (en ? "(no messages yet)" : "（還沒聊過）")}
                </span>
                <span style={{ fontSize: 10.5, color: "#a3a3a3", marginLeft: 6 }}>
                  {String(h.lastAt ?? "").slice(0, 10)}
                  {h.isOpen ? (en ? " · current" : " · 目前這串") : ""}
                  {` · ${h.messageCount}`}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && !convQ?.isLoading && (
          <p style={{ fontSize: 13, color: "#737373", fontStyle: "italic", margin: 0 }}>
            {en
              ? `Ask ${director?.name ?? "the Strategy Director"} anything about this brand's strategy — or tap one of the questions below.`
              : `問${director?.name ?? "策略總監"}任何跟這個品牌策略有關的問題——或者直接點下面的問題。`}
          </p>
        )}
        {messages.map((m, idx) => (
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
            {idx === lastStrategistIdx && !sending && (m.followUps?.length ?? 0) > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 7 }}>
                <span style={{ fontSize: 10.5, color: "#a3a3a3", fontWeight: 700 }}>
                  {en ? "Follow up" : "可以再追問"}
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {m.followUps!.map((q, i) => (
                    <button key={i} onClick={() => send(q)} disabled={sending}
                      style={{ ...chipStyle, whiteSpace: "normal", textAlign: "left" }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div style={{ fontSize: 12.5, color: "#a3a3a3" }}>
            {en ? `${director?.name ?? "Strategy Director"} is typing…` : `${director?.name ?? "策略總監"}輸入中…`}
          </div>
        )}
      </div>
      {error && (
        <div style={{ padding: "0 16px 6px", fontSize: 12, color: "#B45309" }}>⚠ {error}</div>
      )}
      {signature.length > 0 && (
        // 常駐的招牌問題膠囊列（CJ:「輸入框上方常駐一排問題膠囊」）：橫向
        // 捲動，不佔垂直空間，任何時候都點得到，不是只有空狀態才出現。
        <div style={{
          display: "flex", gap: 6, padding: "7px 10px 0", overflowX: "auto",
          borderTop: "1px solid #F5F4F2",
        }}>
          {signature.map((q, i) => (
            <button key={i} onClick={() => send(q)} disabled={sending || !conversationId || readOnly}
              title={q} style={{ ...chipStyle, opacity: (sending || !conversationId || readOnly) ? 0.5 : 1, maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis" }}>
              {q}
            </button>
          ))}
        </div>
      )}
      <div style={{ padding: 10, display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={en ? "Ask the Strategy Director…" : "問策略總監…"}
          disabled={sending || !conversationId || readOnly}
          style={{ flex: 1, fontSize: 13.5, padding: "8px 12px", borderRadius: 10, border: "1px solid #D4D4D4", outline: "none", minWidth: 0 }}
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim() || !conversationId || readOnly}
          aria-label={en ? "Send" : "送出"}
          style={{
            width: 36, height: 36, borderRadius: 10, border: "none", flexShrink: 0,
            background: "#171717", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", opacity: (sending || !input.trim() || !conversationId || readOnly) ? 0.45 : 1,
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
