/**
 * useIntakeChat — SSE-backed conversational intake hook.
 *
 * Manages the pre-launch chat state between the user and the squad Lead
 * Agent. Calls POST /api/intake/chat with SSE and dispatches:
 *   - Agent reply tokens → messages[last].content (streaming)
 *   - auth_required events → injects an OAuth card message
 *   - preview_delta events → onPreviewChunk(text) for center panel
 *   - ready event → marks intake as complete (shows launch button)
 */

import { useState, useCallback, useRef } from "react";

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
  /** Special card types injected inline by the system */
  cardType?: "auth" | "preview";
  authPlatform?: string;
  streaming?: boolean;
}

export interface UseIntakeChatOptions {
  squadId: number;
  squadCtx: string;   // serialized squad context from GET /api/intake/squad-ctx/:id
  brandCtx: string;   // serialized brand context
  onPreviewChunk?: (text: string) => void;
  onReady?: () => void;
}

export interface UseIntakeChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  isReady: boolean;
  send: (userText: string) => Promise<void>;
  reset: () => void;
}

export function useIntakeChat({
  squadId,
  squadCtx,
  brandCtx,
  onPreviewChunk,
  onReady,
}: UseIntakeChatOptions): UseIntakeChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const send = useCallback(async (userText: string) => {
    if (isStreaming || !userText.trim()) return;

    // Append user message
    const userMsg: ChatMessage = { role: "user", content: userText.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    // Placeholder for streaming assistant reply
    const assistantPlaceholder: ChatMessage = {
      role: "assistant",
      content: "",
      streaming: true,
    };
    setMessages((prev) => [...prev, assistantPlaceholder]);

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      // Build messages history (exclude card-type messages)
      const history = [...messages, userMsg]
        .filter((m) => !m.cardType)
        .map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetch("/api/intake/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squadId, messages: history, brandCtx, squadCtx }),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const updateLast = (updater: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => {
          const next = [...prev];
          const i = next.length - 1;
          if (i >= 0) next[i] = updater(next[i]!);
          return next;
        });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const raw = trimmed.slice(5).trim();
          if (!raw) continue;

          let evt: any;
          try { evt = JSON.parse(raw); } catch { continue; }

          switch (evt.type) {
            case "delta":
              updateLast((m) => ({ ...m, content: m.content + (evt.text ?? "") }));
              break;

            case "auth_required":
              // Insert OAuth card after the current assistant message
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: "",
                  cardType: "auth",
                  authPlatform: evt.platform,
                },
              ]);
              break;

            case "preview_delta":
              onPreviewChunk?.(evt.text ?? "");
              break;

            case "ready":
              setIsReady(true);
              onReady?.();
              break;

            case "done":
              updateLast((m) => ({ ...m, streaming: false }));
              break;

            case "error":
              updateLast((m) => ({
                ...m,
                content: m.content || `（錯誤：${evt.message}）`,
                streaming: false,
              }));
              break;
          }
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setMessages((prev) => {
        const next = [...prev];
        const i = next.length - 1;
        if (i >= 0)
          next[i] = {
            ...next[i]!,
            content: next[i]!.content || "（連線中斷，請稍後再試）",
            streaming: false,
          };
        return next;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, messages, squadId, squadCtx, brandCtx, onPreviewChunk, onReady]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
    setIsReady(false);
  }, []);

  return { messages, isStreaming, isReady, send, reset };
}
