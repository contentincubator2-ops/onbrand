/**
 * Booth phone simulator — a LINE-looking chat that drives the SAME server
 * handlers as the real LINE webhook (hub.admin.simulatorMenu / Postback / Say
 * → lineBot.handleMenu / handlePostback / handleText).
 *
 * The parent remounts this with `key={rep.id}` to reset the conversation.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  BatteryFull,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  LayoutGrid,
  Menu as MenuIcon,
  Search,
  SendHorizontal,
  ShieldCheck,
  Signal,
  Wifi,
} from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { ChatBubble, type BotAction, type BotMessage, type ChatItem } from "../BotMessages";
import { cx } from "../ui";
import RichMenu, { MENU_ITEMS, type MenuAction, type MenuItem } from "./sim-RichMenu";

export const SIM_BOT_NAME = "ExpertHub AI Team";

/** A softened version of LINE's blue-grey chat wallpaper (stone-900 text ≈ 8.9:1). */
const CHAT_BG = "#A3BBDD";

type SimItem = ChatItem | { from: "error"; detail: string } | { from: "note"; text: string };

type Pending = { kind: "gen" | "normal"; startedAt: number } | null;

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
    ? { type: "text", text: `Hi ${n}! The menu below is your AI marketing team. Every post is checked against company policy before you share it.` }
    : { type: "text", text: `嗨 ${n}！下方選單就是你的 AI 行銷團隊。發文前，我會先幫你檢查公司社群政策。` };
}

/**
 * LIFF links from the bot → the local preview page, impersonating the rep.
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

function BotAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white" aria-hidden>
      AI
    </div>
  );
}

function TypingIndicator({ pending, market }: { pending: NonNullable<Pending>; market: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (pending.kind !== "gen") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [pending.kind]);
  const seconds = Math.max(0, Math.round((now - pending.startedAt) / 1000));
  return (
    <div className="flex items-start gap-2" role="status" aria-live="polite">
      <BotAvatar />
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-3 py-2">
        <div className="flex h-3 items-center gap-1" aria-hidden>
          {[0, 150, 300].map((d) => (
            <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
        {pending.kind === "gen" ? (
          <div className="mt-1.5 text-[12px] leading-snug text-stone-700">
            {market === "TW" ? <div>寫作中，並檢查公司政策…</div> : null}
            <div className={market === "TW" ? "text-[11px] text-stone-500" : undefined}>Writing your post and checking company policy…</div>
            <div className="mt-0.5 text-[11px] tabular-nums text-stone-400">{seconds}s · usually 8–25s</div>
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
  const [menuOpen, setMenuOpen] = useState(true);
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
  }, [items, pending, menuOpen]);

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
      run(`${item.zh} ${item.en}`, () => utils.client.hub.admin.simulatorMenu.mutate({ repId: rep.id, action: item.action }) as Promise<BotMessage[]>),
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
      push({ from: "note", text: `Opened “${a.label}” in a new tab${liffHref ? " (LIFF page, preview mode)" : ""}` });
    },
    [run, utils, rep.id, push],
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
  const lastIndex = items.length - 1;

  return (
    <div className="mx-auto flex h-[760px] max-h-[calc(100svh-140px)] min-h-[600px] w-full max-w-[380px] flex-col overflow-hidden rounded-[36px] border-[9px] border-stone-900 bg-stone-900 shadow-xl">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[27px] bg-white">
        {/* status bar */}
        <div className="flex items-center justify-between bg-[#f4f5f7] px-5 pb-0.5 pt-1.5 text-[11px] font-semibold text-stone-900" aria-hidden>
          <span className="tabular-nums">9:41</span>
          <span className="flex items-center gap-1">
            <Signal className="h-3 w-3" />
            <Wifi className="h-3 w-3" />
            <BatteryFull className="h-3.5 w-3.5" />
          </span>
        </div>

        {/* chat header */}
        <div className="flex items-center gap-2 border-b border-stone-200 bg-[#f4f5f7] px-2 py-2">
          <ChevronLeft className="h-5 w-5 shrink-0 text-stone-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold leading-tight text-stone-900">{SIM_BOT_NAME}</div>
            <div className="flex items-center gap-1 text-[10px] leading-tight text-stone-500">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              Official account
            </div>
          </div>
          <Search className="h-4 w-4 shrink-0 text-stone-600" aria-hidden />
          <MenuIcon className="ml-2 mr-1 h-4 w-4 shrink-0 text-stone-600" aria-hidden />
        </div>

        {/* chat */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-3 py-3 [&_.text-stone-600]:text-stone-800"
          style={{ background: CHAT_BG }}
          aria-live="polite"
        >
          <div className="flex justify-center">
            <span className="rounded-full bg-white/50 px-2.5 py-0.5 text-[10px] font-medium text-stone-800">Today</span>
          </div>
          {items.map((item, i) => {
            if (item.from === "note") {
              return (
                <div key={i} className="flex justify-center">
                  <span className="rounded-full bg-white/50 px-2.5 py-0.5 text-center text-[10px] text-stone-800">{item.text}</span>
                </div>
              );
            }
            if (item.from === "error") {
              return (
                <div key={i} className="flex items-start gap-2">
                  <BotAvatar />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 text-[10px] text-stone-800">{SIM_BOT_NAME}</div>
                    <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white px-3 py-2">
                      <div className="text-[13px] text-stone-900">Sorry, that failed — try again.</div>
                      <div className="mt-1 break-words text-[11px] text-stone-500">{item.detail}</div>
                    </div>
                  </div>
                </div>
              );
            }
            // Like LINE, quick replies only stay tappable on the latest message.
            const shown: ChatItem =
              item.from === "bot" && item.message.type === "text" && item.message.quickReplies && i !== lastIndex
                ? { from: "bot", message: { type: "text", text: item.message.text } }
                : item;
            return <ChatBubble key={i} item={shown} onAction={onAction} botName={SIM_BOT_NAME} />;
          })}
          {pending ? <TypingIndicator pending={pending} market={rep.market} /> : null}
        </div>

        {/* input bar */}
        <div className="flex items-center gap-1.5 border-t border-stone-200 bg-white px-2 py-1.5">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Hide menu" : "Show menu"}
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1.5 text-[12px] font-medium text-stone-700 hover:bg-stone-100"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Menu
            {menuOpen ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden />}
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={rep.market === "US" ? "Ask your AI team…" : "輸入訊息…"}
            aria-label="Message"
            maxLength={2000}
            className="min-w-0 flex-1 rounded-full bg-stone-100 px-3 py-1.5 text-[13px] text-stone-900 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-stone-300"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim() || busy}
            aria-label="Send"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-800 hover:bg-stone-100 disabled:text-stone-300 disabled:hover:bg-transparent"
          >
            <SendHorizontal className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {menuOpen ? <RichMenu onTap={(item) => void tapMenu(item)} disabled={busy} /> : null}
      </div>
    </div>
  );
});

export default PhoneSimulator;
