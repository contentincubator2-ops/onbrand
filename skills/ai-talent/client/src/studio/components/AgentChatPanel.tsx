import React, { useState, useRef, useEffect } from "react";
import type { MosAccent } from "../primitives/tokens";
import { ACCENTS } from "../primitives/tokens";
import { trpc } from "../../lib/trpc";

export interface AgentChatPanelProps {
  decisionId: number | null;
  agentName: string;
  agentRole?: string;
  accent: MosAccent;
}

export default function AgentChatPanel({
  decisionId,
  agentName,
  agentRole,
  accent,
}: AgentChatPanelProps) {
  const tone = ACCENTS[accent];
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messagesQuery = trpc.decision.chatListMessages.useQuery(
    { decisionId: decisionId ?? 0 },
    {
      enabled: !!decisionId,
      refetchInterval: decisionId ? 5000 : false,
    }
  );
  const post = trpc.decision.chatPost.useMutation({
    onSuccess: () => {
      setDraft("");
      messagesQuery.refetch();
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messagesQuery.data]);

  const send = () => {
    if (!decisionId || !draft.trim()) return;
    post.mutate({
      decisionId,
      role: "user",
      content: draft.trim(),
    });
  };

  return (
    <aside className="w-[340px] shrink-0 border-l border-mos-hair bg-white flex flex-col">
      <div className="px-5 py-4 border-b border-mos-hair">
        <div className="mos-eyebrow mb-1">Agent</div>
        <div className="mos-display text-[1.05rem] text-mos-ink">{agentName}</div>
        {agentRole && (
          <div className="text-meta text-mos-muted mt-0.5">{agentRole}</div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {!decisionId && (
          <div className="text-meta text-mos-muted">
            Chat opens once this step produces a draft.
          </div>
        )}
        {(messagesQuery.data ?? []).map((m: any) => (
          <div key={m.id} className="space-y-1">
            <div className="mos-eyebrow" style={{ color: m.role === "user" ? "#0A0A0A" : tone.text }}>
              {m.role === "user" ? "You" : m.role === "agent" ? agentName : m.role}
            </div>
            <div className="text-[0.88rem] leading-snug text-mos-body whitespace-pre-wrap">
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-mos-hair p-4 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={decisionId ? "Type a message…" : "No active thread"}
          disabled={!decisionId}
          rows={3}
          className="w-full border border-mos-hair px-3 py-2 text-[0.88rem] text-mos-ink focus:outline-none focus:border-mos-ink resize-none"
        />
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              if (!decisionId) return;
              const name = prompt("Mention whom? (username)");
              if (name) setDraft((d) => `${d}${d && !d.endsWith(" ") ? " " : ""}@${name} `);
            }}
            className="text-meta uppercase tracking-[0.16em] text-mos-muted hover:text-mos-ink"
          >
            Mention
          </button>
          <button
            onClick={send}
            disabled={!decisionId || !draft.trim() || post.isPending}
            className="px-4 py-2 text-[0.78rem] uppercase tracking-[0.18em] text-white disabled:opacity-40"
            style={{ background: tone.bg }}
          >
            {post.isPending ? "Sending…" : "Send →"}
          </button>
        </div>
      </div>
    </aside>
  );
}
