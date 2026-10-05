/**
 * Booth phone simulator — a WhatsApp-looking chat that drives the SAME server
 * handlers the real LINE bot uses today (hub.admin.simulatorMenu / Postback /
 * Say → lineBot.handleMenu / handlePostback / handleText — see
 * sim-Architecture.tsx for what's actually wired channel by channel). The
 * skin is WhatsApp because that's the channel this demo shows to customers;
 * the six menu actions and their answers are channel-agnostic.
 *
 * The parent remounts this with `key={rep.id}` to reset the conversation.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BatteryFull,
  List as ListIcon,
  Phone,
  Signal,
  Smile,
  Video,
  Wifi,
} from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { ChatBubble, type BotAction, type BotMessage, type ChatItem } from "../BotMessages";
import { OptionsSheet, WA, type SheetRow } from "./wa-ui";
import { MENU_ITEMS, type MenuAction, type MenuItem } from "./sim-RichMenu";

export const SIM_BOT_NAME = "ExpertHub AI Team";

type SimItem = ChatItem | { from: "error"; detail: string } | { from: "note"; text: string };

type Pending = { kind: "gen" | "normal"; startedAt: number } | null;
type Sheet = { title: string; rows: SheetRow[]; onSelect: (id: string) => void } | null;

export interface SimRep {
  id: number;
  name: string;
  market: string;
}

export interface PhoneSimulatorHandle {
  tapMenu: (action: MenuAction) => Promise<void>;
  say: (text: string) => Promise<void>;
}

/** "陳怡君 Amy Chen" → "Amy"; "Priya Patel" → "Priya". */
export function firstName(name: string): string {
  return name.match(/[A-Za-z][A-Za-z'-]+/)?.[0] ?? name;
}

function welcomeMessage(rep: SimRep): BotMessage {
  const n = firstName(rep.name);
  return rep.market === "US"
    ? { type: "text", text: `Hi ${n}! Tap Menu below for your AI marketing team. Every post is checked against company policy before you share it.` }
    : { type: "text", text: `嗨 ${n}！點下方 Menu 開啟你的 AI 行銷團隊。發文前，我會先幫你檢查公司社群政策。` };
}

/**
 * LIFF links from the bot → the local preview page, impersonating the rep.
 * The real LINE bot's answers still carry liff.line.me URIs (that's the
 * channel actually wired server-side); this just resolves them to a local
 * preview regardless of which chat skin is showing them.
 *   https://liff.line.me/<liffId>/write?s=3  → /liff/write?s=3&rep=<repId>
 *   https://host/liff/share?p=12             → /liff/share?p=12&rep=<repId>
 */
export function simulatorLiffHref(uri: string, repId: number): string | null {
  const m =
    uri.match(/^https:\/\/liff\.line\.me\/[^/?#]+\/([\w-]+)(?:\?([^#]*))?/i) ??
    uri.match(/\/liff\/([\w-]+)(?:\?([^#]*))?/);
  if (!m) return null;
  const qs = new URLSearchParams(m[2] ?? "");
  qs.set("rep", String(repId));
  return `/liff/${m[1]}?${qs.toString()}`;
}

function TypingIndicator({ pending }: { pending: NonNullable<Pending> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (pending.kind !== "gen") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [pending.kind]);
  const seconds = Math.max(0, Math.round((now - pending.startedAt) / 1000));
  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="rounded-lg rounded-tl-none bg-white px-3 py-2.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
        <div className="flex h-3 items-center gap-1" aria-hidden>
          {[0, 150, 300].map((d) => (
            <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
        {pending.kind === "gen" ? (
          <div className="mt-1.5 text-[11px] leading-snug text-stone-500">
            Writing your post and checking company policy… <span className="tabular-nums">{seconds}s</span>
          </div>
        ) : (
          <span className="sr-only">Bot is typing</span>
        )}
      </div>
    </div>
  );
}

const PhoneSimulator = forwardRef<PhoneSimulatorHandle, { rep: SimRep }>(function PhoneSimulator({ rep }, ref) {
  const utils = trpc.useUtils();
  const [items, setItems] = useState<SimItem[]>(() => [{ from: "bot", message: welcomeMessage(rep) }]);
  const [pending, setPending] = useState<Pending>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [draft, setDraft] = useState("");
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items, pending]);

  const push = useCallback((...next: SimItem[]) => {
    if (mountedRef.current) setItems((prev) => [...prev, ...next]);
  }, []);

  const run = useCallback(
    async (userText: string | null, call: () => Promise<BotMessage[]>, kind: "gen" | "normal" = "normal") => {
      // Ignore taps while a reply is pending, and calls from a flow whose rep was switched away.
      if (busyRef.current || !mountedRef.current) return;
      busyRef.current = true;
      if (userText) push({ from: "user", text: userText });
      setPending({ kind, startedAt: Date.now() });
      try {
        const messages = await call();
        push(...messages.map((message): SimItem => ({ from: "bot", message })));
      } catch (err: any) {
        push({ from: "error", detail: String(err?.message ?? err ?? "Unknown error").slice(0, 300) });
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setPending(null);
      }
    },
    [push],
  );

  const tapMenu = useCallback(
    (item: MenuItem) =>
      run(item.en, () => utils.client.hub.admin.simulatorMenu.mutate({ repId: rep.id, action: item.action }) as Promise<BotMessage[]>),
    [run, utils, rep.id],
  );

  const say = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return Promise.resolve();
      return run(trimmed, () => utils.client.hub.admin.simulatorSay.mutate({ repId: rep.id, text: trimmed.slice(0, 2000) }) as Promise<BotMessage[]>);
    },
    [run, utils, rep.id],
  );

  const onAction = useCallback(
    (a: BotAction) => {
      if (a.kind === "postback") {
        void run(
          a.displayText ?? a.label,
          () => utils.client.hub.admin.simulatorPostback.mutate({ repId: rep.id, data: a.data }) as Promise<BotMessage[]>,
          a.data.startsWith("a=gen") ? "gen" : "normal",
        );
        return;
      }
      const liffHref = simulatorLiffHref(a.uri, rep.id);
      window.open(liffHref ?? a.uri, "_blank", "noopener");
      push({ from: "note", text: `Opened "${a.label}" in a new tab${liffHref ? " (preview mode)" : ""}` });
    },
    [run, utils, rep.id, push],
  );

  const onOpenList = useCallback(
    (title: string, rows: SheetRow[], onSelect: (id: string) => void) => setSheet({ title, rows, onSelect }),
    [],
  );

  const openMenu = useCallback(
    () =>
      setSheet({
        title: "Menu",
        rows: MENU_ITEMS.map((m) => ({ id: m.action, title: m.en, description: m.description })),
        onSelect: (id) => {
          const item = MENU_ITEMS.find((m) => m.action === id);
          if (item) void tapMenu(item);
        },
      }),
    [tapMenu],
  );

  useImperativeHandle(
    ref,
    () => ({
      tapMenu: (action) => {
        const item = MENU_ITEMS.find((m) => m.action === action);
        return item ? tapMenu(item) : Promise.resolve();
      },
      say,
    }),
    [tapMenu, say],
  );

  const send = () => {
    if (!draft.trim() || busyRef.current) return;
    const text = draft;
    setDraft("");
    void say(text);
  };

  const busy = pending !== null;

  return (
    <div className="mx-auto flex h-[760px] max-h-[calc(100svh-140px)] min-h-[600px] w-full max-w-[380px] flex-col overflow-hidden rounded-[36px] border-[9px] border-stone-900 bg-stone-900 shadow-xl">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[27px] bg-white">
        {/* status bar */}
        <div className="flex items-center justify-between px-5 pb-0.5 pt-1.5 text-[11px] font-semibold text-white" style={{ background: WA.header }} aria-hidden>
          <span className="tabular-nums">9:41</span>
          <span className="flex items-center gap-1">
            <Signal className="h-3 w-3" />
            <Wifi className="h-3 w-3" />
            <BatteryFull className="h-3.5 w-3.5" />
          </span>
        </div>

        {/* chat header */}
        <div className="flex items-center gap-2 px-2 py-2 text-white" style={{ background: WA.header }}>
          <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden />
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-stone-900" aria-hidden>
            AI
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-center gap-1 truncate text-[15px] font-semibold">
              {SIM_BOT_NAME} <BadgeCheck className="h-4 w-4 shrink-0 text-[#25d366]" fill="white" aria-label="verified business" />
            </div>
            <div className="truncate text-[11.5px] text-white/80">{busy ? "typing…" : "Business account"}</div>
          </div>
          <Video className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          <Phone className="ml-3 mr-1 h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden />
        </div>

        {/* chat */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-3 py-3"
          style={{ background: WA.wallpaper, backgroundImage: "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
          aria-live="polite"
        >
          <div className="flex justify-center">
            <span className="rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-medium text-stone-600 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">Today</span>
          </div>
          {items.map((item, i) => {
            if (item.from === "note") {
              return (
                <div key={i} className="flex justify-center">
                  <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-center text-[10px] text-stone-800">{item.text}</span>
                </div>
              );
            }
            if (item.from === "error") {
              return (
                <div key={i} className="flex justify-start">
                  <div className="rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                    <div className="text-[13.5px] text-stone-900">Sorry, that failed — try again.</div>
                    <div className="mt-1 break-words text-[11px] text-stone-500">{item.detail}</div>
                  </div>
                </div>
              );
            }
            return <ChatBubble key={i} item={item} onAction={onAction} onOpenList={onOpenList} />;
          })}
          {pending ? <TypingIndicator pending={pending} /> : null}
        </div>

        {/* input bar */}
        <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ background: "#f0f2f5" }}>
          <button
            type="button"
            onClick={openMenu}
            aria-label="Menu"
            className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-[12px] font-medium text-stone-700 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] hover:bg-stone-50"
          >
            <ListIcon className="h-4 w-4" aria-hidden />
            Menu
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
            <Smile className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Message"
              aria-label="Message"
              maxLength={2000}
              className="min-w-0 flex-1 text-[13px] text-stone-900 outline-none placeholder:text-stone-400"
            />
          </div>
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim() || busy}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
            style={{ background: WA.header }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
          </button>
        </div>

        {sheet ? (
          <OptionsSheet
            title={sheet.title}
            rows={sheet.rows}
            onClose={() => setSheet(null)}
            onSelect={(id) => {
              setSheet(null);
              sheet.onSelect(id);
            }}
          />
        ) : null}
      </div>
    </div>
  );
});

export default PhoneSimulator;
