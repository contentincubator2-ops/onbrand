/**
 * 對話紀錄的 WhatsApp 重播（CJ 2026-10-04「按下去後，會模擬出 whatsapp 的
 * 對話介面」）。
 *
 * 畫的是伺服器用 toWhatsAppMessages 轉好的 Cloud API payload，不是自己
 * 另外詮釋一次 BotMessage：回覆鈕最多三顆、超過變清單、單一網址變 cta_url，
 * 全部跟真的送到 WhatsApp 的一樣。打開時逐則播放（業務那句先出現，bot 先
 * 「輸入中…」再出來），可以跳過直接看全部。
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BadgeCheck, CheckCheck, ChevronLeft, ChevronRight, ExternalLink, List, Phone, Reply, SkipForward, Video, X,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../server/routers";
import { cx } from "../ui";
import { useHubLang, useT } from "../lang";

type Out = inferRouterOutputs<AppRouter>["hub"]["admin"]["repConversations"];
export type Session = Out["sessions"][number];
type Line = Session["lines"][number];
type WaPayload = Record<string, any>;

const WA = {
  header: "#008069",
  wallpaper: "#efeae2",
  outgoing: "#d9fdd3",
  link: "#027eb5",
  tick: "#53bdeb",
};

/** 網址變成可點的藍字，其餘照原樣（保留換行）。 */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all" style={{ color: WA.link }}>
            {p}
          </a>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}

function Time({ at, ticks }: { at: string; ticks?: boolean }) {
  const { lang } = useHubLang();
  const s = new Date(at).toLocaleTimeString(lang === "zh" ? "zh-TW" : "en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <span className="ml-2 inline-flex translate-y-1 items-center gap-0.5 whitespace-nowrap align-bottom text-[10px] text-stone-500">
      {s}
      {ticks ? <CheckCheck className="h-3.5 w-3.5" style={{ color: WA.tick }} aria-label="read" /> : null}
    </span>
  );
}

function Bubble({ side, children, tail }: { side: "in" | "out"; children: React.ReactNode; tail: boolean }) {
  return (
    <div className={cx("flex", side === "out" ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "relative max-w-[82%] rounded-lg px-2.5 py-1.5 text-[13.5px] leading-[1.35] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
          tail && (side === "out" ? "rounded-tr-none" : "rounded-tl-none"),
        )}
        style={{ background: side === "out" ? WA.outgoing : "#fff" }}
      >
        {tail ? (
          <span
            aria-hidden
            className={cx("absolute top-0 h-0 w-0 border-t-[8px]", side === "out" ? "-right-2 border-r-[8px] border-r-transparent" : "-left-2 border-l-[8px] border-l-transparent")}
            style={{ borderTopColor: side === "out" ? WA.outgoing : "#fff" }}
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** 一則 WhatsApp payload（bot 送出的那一邊）。 */
function BotPayload({ p, at, tail, onOpenList }: { p: WaPayload; at: string; tail: boolean; onOpenList: (p: WaPayload) => void }) {
  if (p.type === "text") {
    return (
      <Bubble side="in" tail={tail}>
        <span className="whitespace-pre-wrap break-words"><Linkified text={String(p.text?.body ?? "")} /></span>
        <Time at={at} />
      </Bubble>
    );
  }
  const it = p.interactive ?? {};
  const body = (
    <>
      {it.header?.text ? <div className="mb-0.5 font-semibold">{it.header.text}</div> : null}
      <span className="whitespace-pre-wrap break-words"><Linkified text={String(it.body?.text ?? "")} /></span>
      {it.footer?.text ? <div className="mt-1 text-[11.5px] text-stone-500">{it.footer.text}</div> : null}
    </>
  );
  if (it.type === "button") {
    const buttons: Array<{ reply: { title: string } }> = it.action?.buttons ?? [];
    return (
      <div className="space-y-[3px]">
        <Bubble side="in" tail={tail}>
          {body}
          <Time at={at} />
        </Bubble>
        {buttons.map((b, i) => (
          <div key={i} className="flex justify-start">
            <div
              className="flex w-[82%] items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-[13.5px] font-medium shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
              style={{ color: WA.link }}
            >
              <Reply className="h-4 w-4" aria-hidden /> {b.reply.title}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (it.type === "list" || it.type === "cta_url") {
    const isList = it.type === "list";
    return (
      <Bubble side="in" tail={tail}>
        {body}
        <Time at={at} />
        <div className="-mx-2.5 mt-1.5 border-t border-stone-200">
          {isList ? (
            <button
              type="button"
              onClick={() => onOpenList(p)}
              className="flex w-full items-center justify-center gap-1.5 pt-2 pb-0.5 text-[13.5px] font-medium hover:opacity-80"
              style={{ color: WA.link }}
            >
              <List className="h-4 w-4" aria-hidden /> {it.action?.button}
            </button>
          ) : (
            <a
              href={it.action?.parameters?.url}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-1.5 pt-2 pb-0.5 text-[13.5px] font-medium hover:opacity-80"
              style={{ color: WA.link }}
            >
              <ExternalLink className="h-4 w-4" aria-hidden /> {it.action?.parameters?.display_text}
            </a>
          )}
        </div>
      </Bubble>
    );
  }
  return null;
}

/** WhatsApp 的清單是點了才從下面滑出來的一張表。 */
function ListSheet({ p, onClose }: { p: WaPayload; onClose: () => void }) {
  const rows: Array<{ id: string; title: string; description?: string }> = p.interactive?.action?.sections?.[0]?.rows ?? [];
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/30" onClick={onClose}>
      <div className="max-h-[70%] overflow-y-auto rounded-t-2xl bg-white pb-3" onClick={(e) => e.stopPropagation()}>
        <div className="relative border-b border-stone-100 px-4 py-3 text-center text-[14px] font-semibold text-[#111b21]">
          <button type="button" onClick={onClose} className="absolute left-3 top-2.5 rounded p-1 text-stone-500 hover:bg-stone-100" aria-label="Close">
            <X className="h-4 w-4" aria-hidden />
          </button>
          {p.interactive?.action?.button}
        </div>
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-stone-100 px-4 py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] text-[#111b21]">{r.title}</div>
                {r.description ? <div className="text-[12px] text-stone-500">{r.description}</div> : null}
              </div>
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-stone-300" aria-hidden />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DayChip({ at }: { at: string }) {
  const { lang } = useHubLang();
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const label = same(d, today)
    ? lang === "zh" ? "今天" : "TODAY"
    : same(d, yesterday)
      ? lang === "zh" ? "昨天" : "YESTERDAY"
      : d.toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US", { month: "short", day: "numeric", weekday: "short" });
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-medium text-stone-600 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">{label}</span>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex justify-start">
      <div className="flex gap-1 rounded-lg rounded-tl-none bg-white px-3 py-2.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}

const CHANNEL_NOTE: Record<string, [string, string]> = {
  whatsapp: ["Recorded on WhatsApp", "WhatsApp 上的實際對話"],
  line: ["Recorded on LINE · shown as WhatsApp would render it", "LINE 上的對話・以 WhatsApp 的樣子重現"],
  simulator: ["Recorded in the HQ simulator · shown as WhatsApp would render it", "總部模擬器的對話・以 WhatsApp 的樣子重現"],
};

export default function WhatsAppReplay({ sessions, index, onIndex, orgName, onClose }: {
  sessions: Session[];
  index: number;
  onIndex: (i: number) => void;
  orgName: string;
  onClose: () => void;
}) {
  const t = useT();
  const session = sessions[index]!;
  const lines = session.lines;

  // 播放進度：shown = 已經出現幾則；typing = bot 正在「輸入中」。
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [sheet, setSheet] = useState<WaPayload | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShown(0);
    setTyping(false);
    setSheet(null);
  }, [session.id]);

  useEffect(() => {
    if (shown >= lines.length) {
      setTyping(false);
      return;
    }
    const next = lines[shown]!;
    if (next.direction === "out") {
      setTyping(true);
      const id = window.setTimeout(() => {
        setTyping(false);
        setShown((n) => n + 1);
      }, 1100);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 350 : 750);
    return () => window.clearTimeout(id);
  }, [shown, lines]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [shown, typing]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = lines.slice(0, shown);
  const note = CHANNEL_NOTE[session.channel] ?? CHANNEL_NOTE.whatsapp!;
  // 「ExpertHub」→ EH：先取大寫字母，沒有才取每個字的字首。
  const initials = useMemo(
    () => (orgName.match(/[A-Z]/g)?.join("") || orgName.split(/\s+/).map((w) => w[0]).join("")).slice(0, 2).toUpperCase() || "AI",
    [orgName],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-full flex-col items-center gap-3" role="dialog" aria-modal="true" aria-label={t("Conversation replay", "對話重播")}>
        {/* phone */}
        <div className="relative flex h-[min(760px,calc(100vh-7rem))] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[2rem] border-[6px] border-stone-900 bg-black shadow-2xl">
          <div className="flex items-center gap-2 px-2 py-2 text-white" style={{ background: WA.header }}>
            <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-white/10" aria-label={t("Close", "關閉")}>
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-bold text-stone-900">{initials}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-1 truncate text-[15px] font-semibold">
                {orgName} AI Team <BadgeCheck className="h-4 w-4 shrink-0 text-[#25d366]" fill="white" aria-label="verified business" />
              </div>
              <div className="truncate text-[11.5px] text-white/80">{typing ? t("typing…", "輸入中…") : t("Business account", "商業帳號")}</div>
            </div>
            <Video className="h-5 w-5 opacity-90" aria-hidden />
            <Phone className="ml-3 mr-1 h-[18px] w-[18px] opacity-90" aria-hidden />
          </div>

          <div
            ref={scrollRef}
            className="relative flex-1 space-y-1 overflow-y-auto px-3 py-2"
            style={{
              background: WA.wallpaper,
              backgroundImage: "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)",
              backgroundSize: "14px 14px",
            }}
          >
            <div className="mx-auto my-2 max-w-[88%] rounded-md bg-[#ffeecd] px-2.5 py-1.5 text-center text-[11px] leading-snug text-stone-700">
              🔒 {t(note[0], note[1])}
              {session.isDemo ? t(" · demo conversation", "・示範對話") : ""}
            </div>
            <DayChip at={session.startedAt} />
            {visible.map((l: Line, i) => {
              const prev = visible[i - 1];
              const tail = !prev || prev.direction !== l.direction;
              if (l.direction === "in") {
                return (
                  <div key={l.id} className={tail ? "pt-1.5" : undefined}>
                    <Bubble side="out" tail={tail}>
                      {l.tapped ? (
                        <span className="mr-1 inline-flex -translate-y-px items-center text-stone-500" title={t("Tapped a button", "點了按鈕")}>
                          <Reply className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      ) : null}
                      <span className="whitespace-pre-wrap break-words">{l.text}</span>
                      <Time at={l.at} ticks />
                    </Bubble>
                  </div>
                );
              }
              return (
                <div key={l.id} className={cx("space-y-1", tail && "pt-1.5")}>
                  {(l.whatsapp ?? []).map((p, j) => (
                    <BotPayload key={j} p={p} at={l.at} tail={tail && j === 0} onOpenList={setSheet} />
                  ))}
                </div>
              );
            })}
            {typing ? <div className="pt-1.5"><Typing /></div> : null}
          </div>

          <div className="flex items-center gap-2 px-2 py-2" style={{ background: "#f0f2f5" }}>
            <div className="flex-1 rounded-full bg-white px-4 py-2 text-[13px] text-stone-400">{t("Message", "訊息")}</div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: WA.header }} aria-hidden>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" /></svg>
            </span>
          </div>

          {sheet ? <ListSheet p={sheet} onClose={() => setSheet(null)} /> : null}
        </div>

        {/* controls */}
        <div className="flex items-center gap-2 rounded-full bg-white/95 px-2 py-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => onIndex(index + 1)}
            disabled={index >= sessions.length - 1}
            className="rounded-full p-1.5 text-stone-700 hover:bg-stone-100 disabled:opacity-30"
            aria-label={t("Older conversation", "較早的對話")}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="px-1 text-[12px] tabular-nums text-stone-600">
            {sessions.length - index} / {sessions.length}
          </span>
          <button
            type="button"
            onClick={() => onIndex(index - 1)}
            disabled={index <= 0}
            className="rounded-full p-1.5 text-stone-700 hover:bg-stone-100 disabled:opacity-30"
            aria-label={t("Newer conversation", "較新的對話")}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <span className="h-4 w-px bg-stone-200" aria-hidden />
          {shown < lines.length ? (
            <button
              type="button"
              onClick={() => setShown(lines.length)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-stone-700 hover:bg-stone-100"
            >
              <SkipForward className="h-3.5 w-3.5" aria-hidden /> {t("Show all", "全部顯示")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShown(0)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-stone-700 hover:bg-stone-100"
            >
              ↻ {t("Replay", "重播")}
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label={t("Close", "關閉")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
