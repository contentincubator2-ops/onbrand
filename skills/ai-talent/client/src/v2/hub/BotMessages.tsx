/**
 * Renders the bot's internal message model (server/platform/core/hub/lineBot.ts)
 * LINE-style, for the booth phone simulator.
 */
import React from "react";

export type BotAction =
  | { kind: "postback"; label: string; data: string; displayText?: string }
  | { kind: "uri"; label: string; uri: string };

export interface BotCard {
  title: string;
  subtitle?: string;
  body?: string[];
  footnote?: string;
  buttons: BotAction[];
}

export type BotMessage =
  | { type: "text"; text: string; quickReplies?: BotAction[] }
  | { type: "card"; card: BotCard }
  | { type: "carousel"; cards: BotCard[] };

export type ChatItem = { from: "bot"; message: BotMessage } | { from: "user"; text: string };

function CardView({ card, onAction, width = 230 }: { card: BotCard; onAction: (a: BotAction) => void; width?: number }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm" style={{ width }}>
      <div className="space-y-1 p-3">
        <div className="text-[13px] font-semibold leading-snug text-stone-900">{card.title}</div>
        {card.subtitle ? <div className="text-[11px] text-stone-500">{card.subtitle}</div> : null}
        {(card.body ?? []).map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-words text-[12px] leading-snug text-stone-800">{line}</div>
        ))}
        {card.footnote ? <div className="pt-1 text-[10px] text-stone-400">{card.footnote}</div> : null}
      </div>
      {card.buttons.length ? (
        <div className="space-y-1 px-3 pb-3">
          {card.buttons.slice(0, 4).map((b, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onAction(b)}
              className={
                i === 0
                  ? "w-full rounded-lg bg-stone-900 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-stone-700"
                  : "w-full rounded-lg bg-stone-100 px-2 py-1.5 text-[12px] font-medium text-stone-800 hover:bg-stone-200"
              }
            >
              {b.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChatBubble({ item, onAction, botName }: { item: ChatItem; onAction: (a: BotAction) => void; botName: string }) {
  if (item.from === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-[#8de055] px-3 py-2 text-[13px] text-stone-900">{item.text}</div>
      </div>
    );
  }
  const m = item.message;
  return (
    <div className="flex items-start gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white" aria-hidden>AI</div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10px] text-stone-600">{botName}</div>
        {m.type === "text" ? (
          <div className="space-y-2">
            <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] leading-relaxed text-stone-900">{m.text}</div>
            {m.quickReplies?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {m.quickReplies.map((a, i) => (
                  <button key={i} type="button" onClick={() => onAction(a)} className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] text-stone-800 hover:bg-stone-100">
                    {a.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : m.type === "card" ? (
          <CardView card={m.card} onAction={onAction} width={250} />
        ) : (
          <div className="-mr-3 flex gap-2 overflow-x-auto pb-1 pr-3">
            {m.cards.map((c, i) => <CardView key={i} card={c} onAction={onAction} width={210} />)}
          </div>
        )}
      </div>
    </div>
  );
}
