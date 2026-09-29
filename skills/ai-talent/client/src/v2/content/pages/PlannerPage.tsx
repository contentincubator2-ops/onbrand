/**
 * PlannerPage — 「本週企劃」：左邊跟內容總監對話，右邊是這一週。取代原本的行事曆。
 *
 * 2026-09-27（CJ「混合式」「左談右曆」「本週企劃取代行事曆，活動企劃與其他任務卡的產出都要
 * 出現，登入後直接落在本週企劃」「介面要乾淨，不要旁邊很多字」）。畫面草稿：
 * https://claude.ai/artifact/JPHnmtu1BBqZbMWJuD5zko（B 左談右曆）。
 *
 * 一週裡的四種東西：
 *   規劃格子（planner.week slots）  草稿＝虛線、已排定＝實線、已寫＝可看成品
 *   活動企劃格子（planner.week campaign）
 *   已排程／已發布（calendar.range，原本行事曆的資料）
 * 每張卡只放三樣：通路圖示、題目、一行小字。細節點開才看得到。
 */
import React from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope, faBullhorn, faGlobe, faArrowUp, faChevronLeft, faChevronRight, faEllipsis,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebook, faInstagram, faLinkedin, faYoutube, faTiktok, faXTwitter, faThreads, faLine,
} from "@fortawesome/free-brands-svg-icons";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { showToastGlobal } from "../../../components/ui/Toast";
import { channelRoute } from "../lib/channelMeta";
import { PlatformTaskModal, type TaskEmbed } from "./PlatformTaskPage";
import { getCalendarPublishPayload } from "../lib/strategyContentEnvelope";

const INK = "#171717", META = "#6B6B6B", LINE = "#EAEAEA", SOFT = "#F6F6F5", ORANGE = "#18181B";

const PLATFORM_ICON: Record<string, any> = {
  facebook: faFacebook, instagram: faInstagram, linkedin: faLinkedin, youtube: faYoutube, tiktok: faTiktok,
  email: faEnvelope, pr: faBullhorn, x: faXTwitter, website: faGlobe, threads: faThreads, line: faLine,
};
const PLATFORM_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok",
  email: "電子報", pr: "新聞稿", x: "X", website: "官網", threads: "Threads", line: "LINE",
};
const STARTERS = ["幫我排這週內容", "給我十個題目", "把進行中的活動拆成這週貼文", "我這週只有 3 小時"];

// ── 日期（台北）──
const ymdTpe = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
function addDays(ymd: string, n: number) { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mondayOf(ymd: string) { const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay(); return addDays(ymd, dow === 0 ? -6 : 1 - dow); }
/** 預設週：今天所在週；週六、週日打開時直接看下週（要排的是下週）。 */
function defaultWeek() {
  const today = ymdTpe(new Date());
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6 ? addDays(mondayOf(today), 7) : mondayOf(today);
}
const md = (ymd: string) => { const [, m, d] = ymd.split("-"); return `${Number(m)}/${Number(d)}`; };

type ForkView = {
  axis: string; weekStart?: string; question: string; chosen: number | null;
  options: Array<{
    advisor: { slug: string; name: string; title: string; avatarUrl: string };
    stance: string; why: string; preview: Array<{ date: string; platform: string; topic: string; format: string }>;
  }>;
};
const avatarSrc = (a: { slug: string; avatarUrl: string }) =>
  a.avatarUrl?.trim() || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(a.slug)}&backgroundColor=E5E5E5&backgroundType=solid`;

type Item =
  | { kind: "slot"; key: string; date: string; platform: string; title: string; meta: string; slot: any }
  | { kind: "campaign"; key: string; date: string; platform: string; title: string; meta: string; camp: any }
  | { kind: "scheduled" | "published"; key: string; date: string; platform: string; title: string; meta: string; cal: any };

export default function PlannerPage() {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const T = trpc as any;
  const utils = T.useUtils?.();
  const ctx = useOutletContext<{ brandId: number | null; brands: any[] } | undefined>();
  const brandId = ctx?.brandId ?? null;

  // 從成品頁「存回本週企劃」回來：?w=那一週、?hl=剛寫好的格子（亮橘框）。讀完就從網址拿掉。
  const [params, setParams] = useSearchParams();
  const [weekStart, setWeekStart] = React.useState(() => {
    const w = params.get("w");
    return w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : defaultWeek();
  });
  /** 正在寫的那一格：任務視窗直接疊在本週企劃上，不換頁。 */
  const [writing, setWriting] = React.useState<Omit<TaskEmbed, "onClose"> | null>(null);
  const [draft, setDraft] = React.useState("");
  const [touched, setTouched] = React.useState<number[]>(() => {
    const hl = Number(params.get("hl") ?? 0);
    return hl > 0 ? [hl] : [];
  });
  // ?ho=剛排程／剛處理的那篇產出 → 那張卡亮起來（排程後格子會變成「已排程」那張）。
  const [hlOutput] = React.useState<number>(() => Number(params.get("ho") ?? 0));
  React.useEffect(() => {
    if (!params.get("w") && !params.get("hl") && !params.get("ho")) return;
    const next = new URLSearchParams(params); next.delete("w"); next.delete("hl"); next.delete("ho");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [open, setOpen] = React.useState<Item | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  const chatEnd = React.useRef<HTMLDivElement>(null);

  const weekQ = T.planner?.week?.useQuery?.({ brandId: brandId ?? 0, weekStart }, { enabled: !!brandId, refetchOnWindowFocus: false }) ?? { data: null };
  const calQ = T.calendar?.range?.useQuery?.(
    { from: `${weekStart}T00:00:00+08:00`, to: `${addDays(weekStart, 7)}T00:00:00+08:00`, brandId: brandId ?? undefined },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  ) ?? { data: null };
  const data = weekQ.data as any;
  const refresh = () => { try { utils?.planner?.week?.invalidate?.(); utils?.calendar?.range?.invalidate?.(); } catch { /* noop */ } };

  const send = T.planner?.send?.useMutation?.({
    onSuccess: (r: any) => { setTouched(r?.touched ?? []); setPending(null); refresh(); },
    onError: (e: any) => { setPending(null); showToastGlobal(String(e?.message ?? "error"), "error"); },
  });
  const commit = T.planner?.commit?.useMutation?.({
    onSuccess: (r: any) => { showToastGlobal(en ? `${r?.count ?? 0} posts scheduled for this week` : `已排定 ${r?.count ?? 0} 篇`, "success"); setTouched([]); refresh(); },
    onError: (e: any) => showToastGlobal(String(e?.message ?? "error"), "error"),
  });
  const removeSlot = T.planner?.removeSlot?.useMutation?.({ onSuccess: () => { setOpen(null); refresh(); } });
  // 分歧方案卡：選一版 → 伺服器套用那一版的格子。
  const pickFork = T.planner?.pickFork?.useMutation?.({
    onSuccess: (r: any) => { if (r?.weekStart) setWeekStart(r.weekStart); setTouched(r?.touched ?? []); refresh(); },
    onError: (e: any) => showToastGlobal(String(e?.message ?? "error"), "error"),
  });
  const cancelSched = T.calendar?.cancel?.useMutation?.({ onSuccess: () => { setOpen(null); refresh(); } });
  // 原本行事曆能做的三件事（取消／改時間／立即發布）都留在這裡，取代才不會少功能。
  const onErr = (e: any) => showToastGlobal(String(e?.message ?? "error"), "error");
  const reschedule = T.calendar?.reschedule?.useMutation?.({ onSuccess: () => { setOpen(null); setMoveAt(""); refresh(); }, onError: onErr });
  const publishNow = T.calendar?.publish?.useMutation?.({
    onSuccess: () => { setOpen(null); refresh(); showToastGlobal(en ? "Published" : "已發布", "success"); }, onError: onErr,
  });
  const [moveAt, setMoveAt] = React.useState("");

  const messages: Array<{ id: number; role: string; content: string; choices: string[]; fork: ForkView | null }> = data?.messages ?? [];
  React.useEffect(() => { chatEnd.current?.scrollIntoView({ block: "end" }); }, [messages.length, pending]);

  const say = (text: string) => {
    const t = text.trim();
    if (!t || !brandId || send?.isPending) return;
    setPending(t); setDraft("");
    send?.mutate?.({ brandId, weekStart, content: t });
  };

  // ── 一週的所有東西 ──
  const items: Item[] = React.useMemo(() => {
    const out: Item[] = [];
    for (const s of data?.slots ?? []) {
      const meta = s.status === "written" ? (en ? "Written" : "已寫好") : s.format || (s.taskLabel ?? "");
      out.push({ kind: "slot", key: `s${s.id}`, date: s.slotDate, platform: s.platform, title: s.topic, meta, slot: s });
    }
    for (const c of data?.campaign ?? []) {
      out.push({ kind: "campaign", key: `c${c.eventId}-${c.itemId}`, date: c.date, platform: c.platform, title: c.angle || c.taskLabel, meta: c.outputId ? (en ? "Campaign · written" : "活動・已寫好") : (en ? `Campaign · ${c.eventName}` : `活動・${c.eventName}`), camp: c });
    }
    const PLAT: Record<string, string> = { fb: "facebook", ig: "instagram", li: "linkedin", yt: "youtube", tt: "tiktok" };
    for (const it of (calQ.data as any[]) ?? []) {
      if (it.kind === "scheduled" && it.status !== "pending") continue;   // 已取消的不顯示；已發布的由 published 那份帶
      const raw = String(it.platform ?? "").toLowerCase();
      const date = ymdTpe(new Date(it.at));
      const time = new Date(it.at).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false });
      out.push({
        kind: it.kind, key: `${it.kind}${it.id}`, date, platform: PLAT[raw] ?? raw,
        title: String(it.preview || it.missionTitle || "").slice(0, 40),
        meta: it.kind === "published" ? (en ? "Published" : "已發布") : (en ? `Scheduled ${time}` : `已排程 ${time}`), cal: it,
      });
    }
    // 同一篇產出已經排程／發布了，就只留排程那張（格子是它的前身）。
    const onCalendar = new Set(out.filter((x) => x.kind === "scheduled" || x.kind === "published").map((x: any) => Number(x.cal?.outputId ?? 0)).filter(Boolean));
    return out.filter((x) =>
      !((x.kind === "slot" && x.slot.outputId && onCalendar.has(Number(x.slot.outputId))) ||
        (x.kind === "campaign" && x.camp.outputId && onCalendar.has(Number(x.camp.outputId)))));
  }, [data, calQ.data, en]);

  const days: Array<{ date: string; label: string }> = data?.days ?? Array.from({ length: 7 }, (_, i) => ({ date: addDays(weekStart, i), label: "" }));
  const thisMonday = mondayOf(ymdTpe(new Date()));
  const weekName = weekStart === thisMonday ? (en ? "This week" : "本週") : weekStart === addDays(thisMonday, 7) ? (en ? "Next week" : "下週") : weekStart === addDays(thisMonday, -7) ? (en ? "Last week" : "上週") : "";
  const hasDrafts = !!data?.hasDrafts;
  const lastLead = [...messages].reverse().find((m) => m.role === "lead");

  /** 還沒寫的格子：點下去直接開任務視窗。 */
  const canWrite = (it: Item) =>
    (it.kind === "slot" && (it.slot.status === "draft" || it.slot.status === "planned")) ||
    (it.kind === "campaign" && !it.camp.outputId);
  const startWriting = (it: Item) => {
    setOpen(null);
    if (it.kind === "slot") {
      setWriting({ route: channelRoute(it.platform), taskId: it.slot.taskId, slotId: it.slot.id, topic: it.slot.topic, weekStart, slotDate: it.date });
    } else if (it.kind === "campaign") {
      setWriting({ route: channelRoute(it.platform), taskId: it.camp.taskId, camp: { eventId: it.camp.eventId, itemId: it.camp.itemId }, topic: it.camp.angle || undefined, weekStart, slotDate: it.date });
    }
  };
  const outputOf = (it: Item): number | null =>
    it.kind === "slot" ? it.slot.outputId : it.kind === "campaign" ? it.camp.outputId : it.cal?.outputId ?? null;

  if (!brandId) {
    return <div className="p-10 text-[14px] text-neutral-500">{en ? "Pick a brand first." : "先選一個品牌。"}</div>;
  }

  const chip = (t: string, onClick: () => void) => (
    <button key={t} type="button" onClick={onClick}
      className="rounded-full border px-3.5 py-1.5 text-[13px] transition hover:border-neutral-900"
      style={{ borderColor: LINE, background: "#FFFFFF", color: "#404040" }}>{t}</button>
  );
  const avatar = (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
      style={{ background: SOFT, border: `1px solid ${LINE}`, color: "#525252" }}>總</span>
  );

  return (
    <div className="flex flex-col bg-white" style={{ height: "calc(100vh - 64px)" }}>
      <header className="flex h-16 shrink-0 items-center px-7" style={{ borderBottom: `1px solid ${LINE}` }}>
        <h1 className="m-0 text-[17px] font-bold" style={{ color: INK }}>{en ? "Weekly plan" : "本週企劃"}</h1>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── 左：對話 ── */}
        <section aria-label={en ? "Chat" : "對話"} className="flex w-[400px] shrink-0 flex-col p-6" style={{ borderRight: `1px solid ${LINE}` }}>
          <div className="flex items-center gap-2.5 pb-4" style={{ borderBottom: `1px solid ${LINE}` }}>
            {avatar}
            <p className="m-0 text-[14px] font-semibold" style={{ color: INK }}>{en ? "Content director" : "內容總監"}</p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-5">
            {messages.length === 0 && !pending ? (
              <div className="mt-auto flex flex-col gap-4">
                <div className="flex items-start gap-2.5">{avatar}<p className="m-0 mt-1.5 text-[14px] leading-relaxed" style={{ color: "#262626" }}>{en ? "What are we pushing? Just say it, or start here." : "要推什麼？直接說，或從這裡開始。"}</p></div>
                <div className="flex flex-col gap-2 pl-[42px]">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => say(s)}
                      className="rounded-xl border px-4 py-3 text-left text-[14px] transition hover:border-neutral-900"
                      style={{ borderColor: LINE, background: "#FFFFFF", color: INK }}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m) => m.role === "user" ? (
                  <div key={m.id} className="max-w-[280px] self-end rounded-2xl rounded-br px-3.5 py-2.5 text-[14px] leading-relaxed" style={{ background: SOFT }}>{m.content}</div>
                ) : (
                  <React.Fragment key={m.id}>
                    <div className="flex items-start gap-2.5">{avatar}<p className="m-0 mt-1.5 max-w-[280px] whitespace-pre-wrap text-[14px] leading-relaxed" style={{ color: "#262626" }}>{m.content}</p></div>
                    {m.fork && <ForkCards messageId={m.id} fork={m.fork} en={en} busy={!!pickFork?.isPending}
                      onPick={(i) => pickFork?.mutate?.({ brandId, weekStart, messageId: m.id, index: i })} />}
                  </React.Fragment>
                ))}
                {pending && (
                  <>
                    <div className="max-w-[280px] self-end rounded-2xl rounded-br px-3.5 py-2.5 text-[14px] leading-relaxed" style={{ background: SOFT }}>{pending}</div>
                    <div className="flex items-center gap-2.5">{avatar}<span className="text-[13px]" style={{ color: META }}>{en ? "Planning…" : "排排看…"}</span></div>
                  </>
                )}
              </>
            )}
            <div ref={chatEnd} />
          </div>

          {!pending && lastLead && lastLead.choices?.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">{lastLead.choices.map((c) => chip(c, () => say(c)))}</div>
          )}
          <form className="flex items-center gap-2 rounded-2xl border py-2 pl-4 pr-2" style={{ borderColor: LINE }}
            onSubmit={(e) => { e.preventDefault(); say(draft); }}>
            <label htmlFor="planner-ask" className="sr-only">{en ? "Talk to the content director" : "跟內容總監說"}</label>
            <input id="planner-ask" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!!pending}
              placeholder={en ? "Just say it…" : "直接說…"} className="flex-1 border-none bg-transparent text-[14px] outline-none" />
            <button type="submit" aria-label={en ? "Send" : "送出"} disabled={!draft.trim() || !!pending}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-white disabled:opacity-30" style={{ background: INK }}>
              <FontAwesomeIcon icon={faArrowUp} />
            </button>
          </form>
        </section>

        {/* ── 右：這一週 ── */}
        <section aria-label={en ? "This week" : "這一週"} className="relative flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-6" style={{ background: "#FCFCFB" }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button type="button" aria-label={en ? "Previous week" : "上一週"} onClick={() => { setWeekStart(addDays(weekStart, -7)); setTouched([]); setOpen(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-full border text-[12px] text-neutral-500 hover:text-neutral-900" style={{ borderColor: LINE }}><FontAwesomeIcon icon={faChevronLeft} /></button>
              <p className="m-0 text-[20px] font-bold" style={{ color: INK }}>
                {weekName ? `${weekName} ` : ""}<span className={weekName ? "text-[15px] font-medium" : ""} style={{ color: weekName ? META : INK }}>{md(weekStart)} – {md(addDays(weekStart, 6))}</span>
              </p>
              <button type="button" aria-label={en ? "Next week" : "下一週"} onClick={() => { setWeekStart(addDays(weekStart, 7)); setTouched([]); setOpen(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-full border text-[12px] text-neutral-500 hover:text-neutral-900" style={{ borderColor: LINE }}><FontAwesomeIcon icon={faChevronRight} /></button>
            </div>
            <button type="button" disabled={!hasDrafts || commit?.isPending} onClick={() => commit?.mutate?.({ brandId, weekStart })}
              className="rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition disabled:cursor-default"
              style={hasDrafts ? { background: INK, color: "#FFFFFF" } : { background: "#EDEDED", color: "#A3A3A3" }}>
              {en ? "Lock in this week" : "排定這週"}
            </button>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {days.map((d) => {
              const dayItems = items.filter((it) => it.date === d.date);
              const [wd, dt] = (d.label || "").split(" ");
              return (
                <div key={d.date} className="flex flex-col gap-2.5">
                  <p className="m-0 flex items-baseline gap-1.5">
                    <span className="text-[13px] font-semibold" style={{ color: INK }}>{wd?.replace("週", "") || ""}</span>
                    <span className="text-[12px]" style={{ color: META }}>{dt || md(d.date)}</span>
                  </p>
                  {dayItems.map((it) => {
                    const isDraft = it.kind === "slot" && it.slot.status === "draft";
                    const isTouched = (it.kind === "slot" && touched.includes(it.slot.id)) || (hlOutput > 0 && outputOf(it) === hlOutput);
                    const border = isTouched ? `1.5px solid ${ORANGE}` : isDraft ? `1.5px dashed #D4D4D4` : `1px solid ${LINE}`;
                    return (
                      <div key={it.key} className="relative">
                      <button type="button" onClick={() => (canWrite(it) ? startWriting(it) : setOpen(it))}
                        className="flex w-full flex-col gap-2.5 rounded-xl bg-white p-3.5 text-left transition hover:border-neutral-400" style={{ border }}>
                        <span className={`flex w-full items-center justify-between ${canWrite(it) ? "pr-6" : ""}`}>
                          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[12px]" style={{ background: SOFT, color: "#404040" }}>
                            <FontAwesomeIcon icon={PLATFORM_ICON[it.platform] ?? faGlobe} />
                          </span>
                          {isTouched && <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#3F3F46" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: ORANGE }} />{en ? "Changed" : "剛改"}</span>}
                        </span>
                        <span className="line-clamp-3 text-[14px] font-semibold leading-snug" style={{ color: INK }}>{it.title}</span>
                        <span className="text-[12px]" style={{ color: META }}>{it.meta}</span>
                      </button>
                      {canWrite(it) && (
                        <button type="button" aria-label={en ? "More" : "更多"} onClick={() => setOpen(it)}
                          className="absolute right-2 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900">
                          <FontAwesomeIcon icon={faEllipsis} />
                        </button>
                      )}
                      </div>
                    );
                  })}
                  <button type="button" aria-label={en ? "Add a post this day" : "這天加一篇"} onClick={() => setDraft(`${d.label || md(d.date)} 加一篇`)}
                    className="rounded-xl text-[18px] transition hover:text-neutral-500"
                    style={{ border: "1.5px dashed #E6E6E6", color: "#C4C4C4", minHeight: dayItems.length ? 44 : 150 }}>+</button>
                </div>
              );
            })}
          </div>

          {/* ── 點開一篇 ── */}
          {open && (
            <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/20 px-4" onClick={() => setOpen(null)}>
              <div role="dialog" aria-label={open.title} className="w-[340px] rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[12px]" style={{ background: SOFT, color: "#404040" }}><FontAwesomeIcon icon={PLATFORM_ICON[open.platform] ?? faGlobe} /></span>
                    <span className="text-[12px]" style={{ color: META }}>{PLATFORM_ZH[open.platform] ?? open.platform}・{md(open.date)}{open.kind === "slot" && open.slot.format ? `・${open.slot.format}` : ""}</span>
                  </span>
                  <button type="button" aria-label={en ? "Close" : "關閉"} onClick={() => setOpen(null)} className="text-[16px] text-neutral-400 hover:text-neutral-900">×</button>
                </div>
                <p className="m-0 mt-3 text-[17px] font-bold leading-snug" style={{ color: INK }}>{open.title}</p>
                {open.kind === "slot" && open.slot.reason && <p className="m-0 mt-2 text-[13.5px] leading-relaxed" style={{ color: "#404040" }}>{open.slot.reason}</p>}
                {open.kind === "campaign" && <p className="m-0 mt-2 text-[13.5px] leading-relaxed" style={{ color: "#404040" }}>{en ? "From campaign" : "來自活動"}「{open.camp.eventName}」</p>}
                <p className="m-0 mt-2 text-[12px]" style={{ color: META }}>
                  {open.kind === "slot" ? `${en ? "Task card" : "任務卡"}・${open.slot.taskLabel ?? open.slot.taskId}`
                    : open.kind === "campaign" ? `${en ? "Task card" : "任務卡"}・${open.camp.taskLabel}` : open.meta}
                </p>
                <div className="mt-4 flex gap-2">
                  {outputOf(open) ? (
                    <button type="button" onClick={() => navigate(`/run/${outputOf(open)}`)} className="flex-1 rounded-full py-2.5 text-[13.5px] font-semibold text-white" style={{ background: INK }}>{en ? "Open" : "看成品"}</button>
                  ) : (open.kind === "slot" || open.kind === "campaign") ? (
                    <button type="button" onClick={() => startWriting(open)} className="flex-1 rounded-full py-2.5 text-[13.5px] font-semibold text-white" style={{ background: INK }}>{en ? "Write it" : "寫這篇"}</button>
                  ) : null}
                  {open.kind === "slot" && open.slot.status !== "written" && (
                    <button type="button" onClick={() => { setOpen(null); say(`${md(open.date)} 那篇「${open.title}」換一篇`); }}
                      className="rounded-full border px-4 py-2.5 text-[13.5px]" style={{ borderColor: LINE }}>{en ? "Swap" : "換一篇"}</button>
                  )}
                  {open.kind === "slot" && open.slot.status !== "written" && (
                    <button type="button" onClick={() => removeSlot?.mutate?.({ brandId, id: open.slot.id })}
                      className="rounded-full border px-3.5 py-2.5 text-[13.5px]" style={{ borderColor: LINE, color: "#525252" }}>{en ? "Delete" : "刪除"}</button>
                  )}
                  {open.kind === "scheduled" && open.cal.status === "pending" && (
                    <button type="button" disabled={publishNow?.isPending} onClick={() => publishNow?.mutate?.(getCalendarPublishPayload(open.cal.id, open.cal.contentKind))}
                      className="rounded-full border px-4 py-2.5 text-[13.5px]" style={{ borderColor: LINE }}>{en ? "Publish now" : "立即發布"}</button>
                  )}
                  {open.kind === "scheduled" && open.cal.status === "pending" && (
                    <button type="button" onClick={() => cancelSched?.mutate?.({ id: open.cal.id })}
                      className="rounded-full border px-4 py-2.5 text-[13.5px]" style={{ borderColor: LINE, color: "#525252" }}>{en ? "Unschedule" : "取消排程"}</button>
                  )}
                </div>
                {open.kind === "scheduled" && open.cal.status === "pending" && (
                  <form className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (moveAt) reschedule?.mutate?.({ id: open.cal.id, scheduledAt: new Date(moveAt).toISOString() }); }}>
                    <label htmlFor="planner-move" className="text-[12px]" style={{ color: META }}>{en ? "Move to" : "改到"}</label>
                    <input id="planner-move" type="datetime-local" value={moveAt} onChange={(e) => setMoveAt(e.target.value)}
                      className="flex-1 rounded-lg border px-2 py-1.5 text-[13px]" style={{ borderColor: LINE }} />
                    <button type="submit" disabled={!moveAt} className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-30" style={{ background: INK }}>{en ? "Save" : "改"}</button>
                  </form>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      {writing && brandId && (
        <PlatformTaskModal key={`${writing.taskId}-${writing.slotId ?? writing.camp?.itemId ?? ""}`}
          {...writing} onClose={() => { setWriting(null); refresh(); }} />
      )}
    </div>
  );
}

/**
 * 分歧時的兩張方案卡。每張只放：顧問（頭像、名字、職稱）、立場、一句理由、這版的題目清單、「用這版」。
 * 選過之後：選中的那張留著、標「已採用」，另一張淡掉——對話紀錄要看得出當時怎麼選的。
 */
function ForkCards({ fork, en, busy, onPick }: {
  messageId: number; fork: ForkView; en: boolean; busy: boolean; onPick: (i: 0 | 1) => void;
}) {
  const chosen = fork.chosen;
  return (
    <div className="flex flex-col gap-2.5 pl-[42px]">
      {fork.options.map((o, i) => {
        const isChosen = chosen === i;
        const dim = chosen != null && !isChosen;
        return (
          <div key={o.advisor.slug} className="rounded-xl bg-white p-3.5 transition"
            style={{ border: isChosen ? `1.5px solid ${INK}` : `1px solid ${LINE}`, opacity: dim ? 0.45 : 1 }}>
            <div className="flex items-center gap-2.5">
              <img src={avatarSrc(o.advisor)} alt="" className="h-8 w-8 shrink-0 rounded-full" style={{ background: SOFT }} />
              <div className="min-w-0">
                <p className="m-0 truncate text-[13px] font-semibold" style={{ color: INK }}>{o.advisor.name}</p>
                <p className="m-0 truncate text-[11.5px]" style={{ color: META }}>{o.advisor.title}</p>
              </div>
            </div>
            <p className="m-0 mt-3 text-[15px] font-bold" style={{ color: INK }}>{o.stance}</p>
            {o.why && <p className="m-0 mt-1 text-[13px] leading-relaxed" style={{ color: "#404040" }}>{o.why}</p>}
            <ul className="m-0 mt-2.5 flex list-none flex-col gap-1.5 p-0">
              {o.preview.map((p, k) => (
                <li key={k} className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="w-9 shrink-0 tabular-nums" style={{ color: META }}>{md(p.date)}</span>
                  <FontAwesomeIcon icon={PLATFORM_ICON[p.platform] ?? faGlobe} className="shrink-0 text-[11px]" style={{ color: META }} />
                  <span className="min-w-0 flex-1 truncate" style={{ color: "#262626" }}>{p.topic}</span>
                </li>
              ))}
            </ul>
            {chosen == null ? (
              <button type="button" disabled={busy} onClick={() => onPick(i as 0 | 1)}
                className="mt-3 w-full rounded-full py-2 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: INK }}>
                {en ? "Use this plan" : "用這版"}
              </button>
            ) : isChosen ? (
              <p className="m-0 mt-3 text-[12px] font-semibold" style={{ color: INK }}>{en ? "Adopted" : "已採用"}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
