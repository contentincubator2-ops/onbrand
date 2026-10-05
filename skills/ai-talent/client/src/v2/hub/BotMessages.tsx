/**
 * Renders the bot's internal message model (server/platform/core/hub/lineBot.ts)
 * WhatsApp-style, for the booth phone simulator. Follows the same shape rules
 * the real WhatsApp conversion (server/platform/core/hub/whatsappBot.ts) uses:
 * ≤3 reply buttons render inline, more than that — or a carousel — becomes a
 * list the rep opens from a bottom sheet.
 */
import React from "react";
import { Bubble, ListAffordance, ReplyRow, type SheetRow } from "./components/wa-ui";

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

const MAX_INLINE_BUTTONS = 3;

function actionRows(actions: BotAction[]): SheetRow[] {
  return actions.map((a, i) => ({ id: String(i), title: a.label }));
}

function cardBody(card: BotCard) {
  return (
    <>
      {card.title ? <div className="mb-0.5 font-semibold">{card.title}</div> : null}
      {card.subtitle ? <div className="text-[12px] text-stone-500">{card.subtitle}</div> : null}
      {(card.body ?? []).map((line, i) => (
        <div key={i} className="whitespace-pre-wrap break-words text-[13.5px]">{line}</div>
      ))}
      {card.footnote ? <div className="mt-1 text-[11px] text-stone-400">{card.footnote}</div> : null}
    </>
  );
}

/** One card, inline (≤3 buttons) or with a "View options" sheet (4+). */
function CardBubble({ card, onAction, onOpenList, tail }: { card: BotCard; onAction: (a: BotAction) => void; onOpenList: (title: string, rows: SheetRow[], onSelect: (id: string) => void) => void; tail: boolean }) {
  const inline = card.buttons.length > 0 && card.buttons.length <= MAX_INLINE_BUTTONS;
  const overflow = card.buttons.length > MAX_INLINE_BUTTONS;
  return (
    <div className="space-y-[3px]">
      <Bubble side="in" tail={tail}>
        {cardBody(card)}
        {overflow ? (
          <ListAffordance
            label="View options"
            onOpen={() => onOpenList(card.title, actionRows(card.buttons), (id) => onAction(card.buttons[Number(id)]!))}
          />
        ) : null}
      </Bubble>
      {inline ? card.buttons.map((b, i) => <ReplyRow key={i} label={b.label} onClick={() => onAction(b)} />) : null}
    </div>
  );
}

export function ChatBubble({
  item,
  onAction,
  onOpenList,
}: {
  item: ChatItem;
  onAction: (a: BotAction) => void;
  onOpenList: (title: string, rows: SheetRow[], onSelect: (id: string) => void) => void;
  /** Kept for callers still passing it — the WhatsApp skin doesn't show a per-bubble name (the header already carries it). */
  botName?: string;
}) {
  if (item.from === "user") {
    return <Bubble side="out" tail>{<span className="whitespace-pre-wrap break-words">{item.text}</span>}</Bubble>;
  }
  const m = item.message;
  if (m.type === "text") {
    const quick = m.quickReplies ?? [];
    const inline = quick.length > 0 && quick.length <= MAX_INLINE_BUTTONS;
    const overflow = quick.length > MAX_INLINE_BUTTONS;
    return (
      <div className="space-y-[3px]">
        <Bubble side="in" tail>
          <span className="whitespace-pre-wrap break-words">{m.text}</span>
          {overflow ? (
            <ListAffordance label="Choose" onOpen={() => onOpenList("Choose", actionRows(quick), (id) => onAction(quick[Number(id)]!))} />
          ) : null}
        </Bubble>
        {inline ? quick.map((a, i) => <ReplyRow key={i} label={a.label} onClick={() => onAction(a)} />) : null}
      </div>
    );
  }
  if (m.type === "card") {
    return <CardBubble card={m.card} onAction={onAction} onOpenList={onOpenList} tail />;
  }
  // carousel — WhatsApp has no multi-card format, so it always becomes a list.
  const rows: SheetRow[] = m.cards.map((c, i) => ({ id: String(i), title: c.title, description: c.subtitle ?? c.body?.[0] }));
  return (
    <Bubble side="in" tail>
      <div className="font-semibold">{m.cards[0]?.title}</div>
      <div className="text-[12px] text-stone-500">and {m.cards.length - 1} more option{m.cards.length - 1 === 1 ? "" : "s"}</div>
      <ListAffordance
        label="View all"
        onOpen={() =>
          onOpenList("Options", rows, (id) => {
            const card = m.cards[Number(id)];
            const first = card?.buttons[0];
            if (first) onAction(first);
          })
        }
      />
    </Bubble>
  );
}
