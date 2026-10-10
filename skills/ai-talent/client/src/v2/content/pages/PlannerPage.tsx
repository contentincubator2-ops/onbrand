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
  faEnvelope, faBullhorn, faGlobe, faArrowUp, faChevronLeft, faChevronRight, faEllipsis, faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebook, faInstagram, faLinkedin, faYoutube, faTiktok, faXTwitter, faThreads, faLine,
} from "@fortawesome/free-brands-svg-icons";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { agentLabel, agentTitle, agentTooltip } from "../../platform/lib/agentName";
import { showToastGlobal } from "../../platform/components/Toast";
import { friendlyError } from "../../platform/lib/friendlyError";
import { publishSettingsUrl } from "../../platform/lib/publishSettingsUrl";
import { channelRoute } from "../../platform/lib/channelMeta";
import { PlatformTaskModal, type TaskEmbed } from "./PlatformTaskPage";
import { getCalendarPublishPayload } from "../lib/strategyContentEnvelope";
import { failedNote, isFailedScheduled, isNotConnectedError } from "../lib/plannerFailed";
import { addDays, defaultWeek, mondayOf, ymdTpe } from "../lib/plannerWeek";
import ApprovalLinkModal, { type ApprovalCandidate } from "../components/approval/ApprovalLinkModal";

const INK = "#171717", META = "#6B6B6B", LINE = "#EAEAEA", SOFT = "#F6F6F5", ORANGE = "#18181B";

const PLATFORM_ICON: Record<string, any> = {
  facebook: faFacebook, instagram: faInstagram, linkedin: faLinkedin, youtube: faYoutube, tiktok: faTiktok,
  email: faEnvelope, pr: faBullhorn, x: faXTwitter, website: faGlobe, threads: faThreads, line: faLine,
};
const PLATFORM_EN: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok",
  email: "Newsletter", pr: "Press release", x: "X", website: "Website", threads: "Threads", line: "LINE",
};
const PLATFORM_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok",
  email: "電子報", pr: "新聞稿", x: "X", website: "AI 搜尋", threads: "Threads", line: "LINE",
};
const STARTERS = ["幫我排這週內容", "給我十個題目", "把進行中的活動拆成這週貼文", "我這週只有 3 小時"];

// ── 日期（台北）：與側欄儀表共用 ──
const md = (ymd: string) => { const [, m, d] = ymd.split("-"); return `${Number(m)}/${Number(d)}`; };

type ForkView = {
  axis: string; weekStart?: string; question: string; chosen: number | null;
  options: Array<{
    advisor: { slug: string; name: string; title: string; nameEn?: string; titleEn?: string; avatarUrl: string };
    stance: string; why: string; preview: Array<{ date: string; platform: string; topic: string; format: string }>;
  }>;
};
const avatarSrc = (a: { slug: string; avatarUrl: string }) =>
  a.avatarUrl?.trim() || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(a.slug)}&backgroundColor=E5E5E5&backgroundType=solid`;

type Item =
  | { kind: "slot"; key: string; date: string; platform: string; title: string; meta: string; slot: any }
  | { kind: "campaign"; key: string; date: string; platform: string; title: string; meta: string; camp: any }
  | { kind: "scheduled" | "published"; key: string; date: string; platform: string; title: string; meta: string; cal: any }
  /** 2026-10-02：別人送給我審、排在這一週的稿（review.listPending）。點了去審核佇列。 */
  | { kind: "review"; key: string; date: string; platform: string; title: string; meta: string; review: any };

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

  const weekQ = T.planner?.week?.useQuery({ brandId: brandId ?? 0, weekStart }, { enabled: !!brandId, refetchOnWindowFocus: false }) ?? { data: null };
  const calQ = T.calendar?.range?.useQuery(
    { from: `${weekStart}T00:00:00+08:00`, to: `${addDays(weekStart, 7)}T00:00:00+08:00`, brandId: brandId ?? undefined },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  ) ?? { data: null };
  // 2026-10-02（CJ「在要審核的那個人的本周企畫上，出現待審的標籤」）：送給我審的稿，照它排的那天放上來。
  // 不分品牌——審核人不一定能開送審人的品牌，但他要知道哪天有稿等他。
  const reviewQ = T.review.listPending.useQuery({ limit: 100 }, { refetchOnWindowFocus: false, staleTime: 30_000 });
  // 2026-10-07 客戶核准連結：這個品牌發出去的連結，卡片上要標「客戶已核准／要修改」。
  const approvalQ = T.approval.list.useQuery({ brandId: brandId ?? 0 }, { enabled: !!brandId, refetchOnWindowFocus: true, staleTime: 30_000 });
  const [approvalOpen, setApprovalOpen] = React.useState(false);
  /** 排程編號 → 客戶的決定。同一篇在多條有效連結上時，取最新那一條（list 由新到舊）。 */
  const clientDecision = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const l of (approvalQ.data as any[]) ?? []) {
      if (l.state !== "active") continue;
      for (const it of l.items ?? []) if (it.scheduledPostId && !m.has(it.scheduledPostId)) m.set(it.scheduledPostId, it.decision);
    }
    return m;
  }, [approvalQ.data]);
  /** 這一週可以交給客戶看的：排好、還沒發出去的。 */
  const approvalCandidates: ApprovalCandidate[] = React.useMemo(() => {
    const PLAT: Record<string, string> = { fb: "facebook", ig: "instagram", li: "linkedin", yt: "youtube", tt: "tiktok" };
    return ((calQ.data as any[]) ?? [])
      .filter((it) => it.kind === "scheduled" && it.status === "pending" && it.outputId)
      .map((it) => {
        const raw = String(it.platform ?? "").toLowerCase();
        return {
          scheduledPostId: Number(it.id), outputId: Number(it.outputId), variantIndex: Number(it.variantIndex ?? 0),
          contentKind: it.contentKind ?? null, contentIndex: it.contentIndex ?? null,
          platform: PLAT[raw] ?? raw, at: String(it.at), preview: String(it.preview || it.missionTitle || "").slice(0, 80),
        };
      });
  }, [calQ.data]);
  const data = weekQ.data as any;
  const refresh = () => { try { utils?.planner?.week?.invalidate?.(); utils?.planner?.railStatus?.invalidate?.(); utils?.calendar?.range?.invalidate?.(); } catch { /* noop */ } };

  const send = T.planner?.send?.useMutation?.({
    onSuccess: (r: any) => { setTouched(r?.touched ?? []); setPending(null); refresh(); },
    onError: (e: any) => { setPending(null); showToastGlobal(friendlyError(e, en ? "Something went wrong. Please try again." : "剛剛沒成功，再試一次。"), "error"); },
  });
  const commit = T.planner?.commit?.useMutation?.({
    onSuccess: (r: any) => { showToastGlobal(en ? `${r?.count ?? 0} posts scheduled for this week` : `已排定 ${r?.count ?? 0} 篇`, "success"); setTouched([]); refresh(); },
    onError: (e: any) => showToastGlobal(friendlyError(e, en ? "Something went wrong. Please try again." : "剛剛沒成功，再試一次。"), "error"),
  });
  const removeSlot = T.planner?.removeSlot?.useMutation?.({ onSuccess: () => { setOpen(null); refresh(); }, onError: (e: any) => showToastGlobal(friendlyError(e, en ? "Something went wrong. Please try again." : "剛剛沒成功，再試一次。"), "error") });
  // 2026-10-04：用戶自己指定這一格用哪張任務卡（不必經總監）。
  const setSlotCard = T.planner?.setSlotCard?.useMutation?.({
    onSuccess: (r: any) => {
      setOpen((cur) => (cur && cur.kind === "slot" ? { ...cur, slot: { ...cur.slot, taskId: r.taskId, taskLabel: r.taskLabel } } : cur));
      refresh();
    },
    onError: (e: any) => showToastGlobal(friendlyError(e, en ? "Something went wrong. Please try again." : "剛剛沒成功，再試一次。"), "error"),
  });
  // 分歧方案卡：選一版 → 伺服器套用那一版的格子。
  const pickFork = T.planner?.pickFork?.useMutation?.({
    onSuccess: (r: any) => { if (r?.weekStart) setWeekStart(r.weekStart); setTouched(r?.touched ?? []); refresh(); },
    onError: (e: any) => showToastGlobal(friendlyError(e, en ? "Something went wrong. Please try again." : "剛剛沒成功，再試一次。"), "error"),
  });
  const cancelSched = T.calendar?.cancel?.useMutation?.({ onSuccess: () => { setOpen(null); refresh(); }, onError: (e: any) => showToastGlobal(friendlyError(e, en ? "Something went wrong. Please try again." : "剛剛沒成功，再試一次。"), "error") });
  // 原本行事曆能做的三件事（取消／改時間／立即發布）都留在這裡，取代才不會少功能。
  const onErr = (e: any) => showToastGlobal(friendlyError(e, en ? "Something went wrong. Please try again." : "剛剛沒成功，再試一次。"), "error");
  const onPublishError = (e: any) => {
    const msg = friendlyError(e, en ? "Something went wrong. Please try again." : "剛剛沒成功，再試一次。");
    showToastGlobal(msg, "error", isNotConnectedError(msg)
      ? { label: en ? "Connect" : "去連接", onClick: () => navigate(publishSettingsUrl(brandId)) }
      : undefined);
  };
  const reschedule = T.calendar?.reschedule?.useMutation?.({ onSuccess: () => { setOpen(null); setMoveAt(""); refresh(); }, onError: onErr });
  const retryFailed = T.calendar?.retry?.useMutation?.({
    onSuccess: () => { setOpen(null); refresh(); showToastGlobal(en ? "Back in the queue. It still needs approval before it publishes." : "已放回排程。發布前仍需核准。", "success"); },
    onError: onPublishError,
  });
  const publishNow = T.calendar?.publish?.useMutation?.({
    onSuccess: () => { setOpen(null); refresh(); showToastGlobal(en ? "Published" : "已發布", "success"); }, onError: onPublishError,
  });
  const [moveAt, setMoveAt] = React.useState("");
  // 2026-10-11 CJ：貼文可以拖到另一天；卡片上直接刪除。
  const moveSlot = T.planner?.moveSlot?.useMutation?.({ onSuccess: () => refresh(), onError: onErr });
  const moveCamp = T.planner?.moveCampaignItem?.useMutation?.({ onSuccess: () => refresh(), onError: onErr });
  const dropFromPlanner = T.campaign?.setInPlanner?.useMutation?.({ onSuccess: () => { setOpen(null); refresh(); }, onError: onErr });
  const [dragKey, setDragKey] = React.useState<string | null>(null);
  const [overDate, setOverDate] = React.useState<string | null>(null);

  const messages: Array<{ id: number; role: string; content: string; choices: string[]; fork: ForkView | null }> = data?.messages ?? [];
  React.useEffect(() => { chatEnd.current?.scrollIntoView({ block: "end" }); }, [messages.length, pending]);
  // Escape closes the post popup (keyboard users shouldn't need the × button).
  // Focus moves into the dialog on open, Tab is trapped inside, and focus returns to the opener on close.
  const dialogRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onTab = (ev: KeyboardEvent) => {
      if (ev.key !== "Tab" || !dialogRef.current) return;
      const f = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]"));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onTab);
    return () => { window.removeEventListener("keydown", onTab); opener?.focus?.(); };
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
      out.push({ kind: "campaign", key: `c${c.eventId}-${c.itemId}`, date: c.date, platform: c.platform, title: c.angle || c.taskLabel, meta: `${c.paid ? (en ? "Ad · " : "廣告・") : ""}${c.outputId ? (en ? "Campaign · written" : "活動・已寫好") : (en ? `Campaign · ${c.eventName}` : `活動・${c.eventName}`)}`, camp: c });
    }
    const PLAT: Record<string, string> = { fb: "facebook", ig: "instagram", li: "linkedin", yt: "youtube", tt: "tiktok" };
    for (const it of (calQ.data as any[]) ?? []) {
      if (it.kind === "scheduled" && it.status !== "pending" && !isFailedScheduled(it)) continue;   // 已取消的不顯示；已發布的由 published 那份帶
      const raw = String(it.platform ?? "").toLowerCase();
      const date = ymdTpe(new Date(it.at));
      const time = new Date(it.at).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false });
      const approvalHint = it.awaitingApproval ? (en ? " · awaiting approval" : " · 尚未核准") : "";
      out.push({
        kind: it.kind, key: `${it.kind}${it.id}`, date, platform: PLAT[raw] ?? raw,
        title: String(it.preview || it.missionTitle || "").slice(0, 40),
        meta: it.kind === "published" ? (en ? "Published" : "已發布") : isFailedScheduled(it) ? (en ? `Failed ${time}` : `失敗 ${time}`) : (en ? `Scheduled ${time}${approvalHint}` : `已排程 ${time}${approvalHint}`), cal: it,
      });
    }
    const weekEnd = addDays(weekStart, 7);
    for (const r of (reviewQ.data as any[]) ?? []) {
      if (!r.scheduledAt) continue;
      const date = ymdTpe(new Date(r.scheduledAt));
      if (date < weekStart || date >= weekEnd) continue;
      const time = new Date(r.scheduledAt).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false });
      const who = String(r.requesterName || r.requesterEmail || "");
      const other = r.brandId && Number(r.brandId) !== brandId ? `・${r.brandName ?? ""}` : "";
      const head = String(r.contentHead ?? "").replace(/\\n/g, " ");
      const cap = (head.match(/"caption"\s*:\s*"([^"]{1,60})/)?.[1] ?? "").replace(/\\n/g, " ");
      out.push({
        kind: "review", key: `r${r.id}`, date, platform: String(r.scheduledPlatform || r.platform || "").toLowerCase(),
        title: (cap || String(r.outputTitle ?? "")).slice(0, 40),
        meta: en ? `${time} · from ${who}${other}` : `${time}・${who} 送來${other}`, review: r,
      });
    }
    // 同一篇產出已經排程／發布了，就只留排程那張（格子是它的前身）。
    const onCalendar = new Set(out.filter((x) => x.kind === "scheduled" || x.kind === "published").map((x: any) => Number(x.cal?.outputId ?? 0)).filter(Boolean));
    return out.filter((x) =>
      !((x.kind === "slot" && x.slot.outputId && onCalendar.has(Number(x.slot.outputId))) ||
        (x.kind === "campaign" && x.camp.outputId && onCalendar.has(Number(x.camp.outputId)))));
  }, [data, calQ.data, reviewQ.data, en, weekStart, brandId]);

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
    it.kind === "slot" ? it.slot.outputId : it.kind === "campaign" ? it.camp.outputId : it.kind === "review" ? null : it.cal?.outputId ?? null;
  /**
   * 卡片上的審核標籤（2026-10-02 CJ）：自己送出去的是「送審中」，別人送給我的是「待審」。
   * 行事曆上的排程都是我自己的，所以那邊只會是送審中／退回修改／已放行。
   */
  const reviewTag = (it: Item): { text: string; tone: "warn" | "bad" | "ok" } | null => {
    if (it.kind === "review") return { text: en ? "To review" : "待審", tone: "warn" };
    if (it.kind !== "scheduled") return null;
    if (isFailedScheduled(it.cal)) return { text: en ? "Failed" : "發布失敗", tone: "bad" };
    const rs = String(it.cal?.reviewStatus ?? "");
    if (rs === "pending" || rs === "in_review") return { text: en ? "In review" : "送審中", tone: "warn" };
    if (rs === "revision_requested") return { text: en ? "Sent back" : "退回修改", tone: "bad" };
    if (rs === "approved") return { text: en ? "Approved" : "已放行", tone: "ok" };
    // 沒有團隊內部審核的狀態要標，才標客戶那一頭的（一張卡只放一個標籤）。
    const cd = clientDecision.get(Number(it.cal?.id ?? 0));
    if (cd === "approved") return { text: en ? "Client approved" : "客戶已核准", tone: "ok" };
    if (cd === "changes_requested") return { text: en ? "Client wants changes" : "客戶要修改", tone: "bad" };
    if (cd === "pending") return { text: en ? "With client" : "客戶確認中", tone: "warn" };
    return null;
  };

  /** 能拖的：還沒發布的規劃格子、活動企劃那一篇、排好還沒發的排程。 */
  const movable = (it: Item) =>
    it.kind === "slot" || it.kind === "campaign" ||
    (it.kind === "scheduled" && (it.cal.status === "pending" || isFailedScheduled(it.cal)));
  const deletable = (it: Item) => it.kind === "slot" || it.kind === "campaign" || (it.kind === "scheduled" && it.cal.status === "pending");
  const moveTo = (it: Item, date: string) => {
    if (!brandId || it.date === date) return;
    if (it.kind === "slot") moveSlot?.mutate?.({ brandId, id: it.slot.id, date });
    else if (it.kind === "campaign") moveCamp?.mutate?.({ brandId, eventId: it.camp.eventId, itemId: it.camp.itemId, date });
    else if (it.kind === "scheduled") {
      // 只換日子、時間照原本（台北時間）。
      const hhmm = new Date(it.cal.at).toLocaleTimeString("en-GB", { timeZone: "Asia/Taipei", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
      reschedule?.mutate?.({ id: it.cal.id, scheduledAt: new Date(`${date}T${hhmm}:00+08:00`).toISOString() });
    }
  };
  const deleteItem = (it: Item) => {
    if (!brandId) return;
    const written = (it.kind === "slot" && it.slot.status === "written") || (it.kind === "campaign" && !!it.camp.outputId) || it.kind === "scheduled";
    if (written || it.kind === "campaign") {
      const msg = it.kind === "scheduled" ? (en ? "Unschedule this post? The written post stays in your projects." : "取消這篇的排程？寫好的成品會留在專案裡。")
        : it.kind === "campaign" ? (en ? "Remove this post from the weekly plan? The campaign plan itself stays." : "把這篇從本週企劃拿掉？活動企劃本身會保留。")
        : (en ? "Delete this post from the plan? The written post stays in your projects." : "從本週企劃刪除這篇？寫好的成品會留在專案裡。");
      if (!window.confirm(msg)) return;
    }
    if (it.kind === "slot") removeSlot?.mutate?.({ brandId, id: it.slot.id });
    else if (it.kind === "campaign") dropFromPlanner?.mutate?.({ eventId: it.camp.eventId, itemId: it.camp.itemId, inPlanner: false });
    else if (it.kind === "scheduled") cancelSched?.mutate?.({ id: it.cal.id });
  };
  const events: Array<{ eventId: number; name: string; startAt: string; endAt: string; total: number; written: number }> = data?.events ?? [];
  const eventsOn = (date: string) => events.filter((e) => e.startAt <= date && date <= e.endAt);
  const isMade = (it: Item) =>
    (it.kind === "slot" && it.slot.status === "written") || (it.kind === "campaign" && !!it.camp.outputId) || it.kind === "scheduled" || it.kind === "published";

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
      style={{ background: SOFT, border: `1px solid ${LINE}`, color: "#525252" }}>{en ? "D" : "總"}</span>
  );

  return (
    <div className="flex flex-col bg-white lg:h-[calc(100vh-64px)]">
      <header className="flex h-16 shrink-0 items-center px-4 lg:px-7" style={{ borderBottom: `1px solid ${LINE}` }}>
        <h1 className="m-0 text-[17px] font-bold" style={{ color: INK }}>{en ? "Weekly plan" : "本週企劃"}</h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── 左：對話 ── */}
        <section aria-label={en ? "Chat" : "對話"} className="flex max-h-[60vh] w-full shrink-0 flex-col border-b border-neutral-200 p-4 lg:max-h-none lg:w-[400px] lg:border-b-0 lg:border-r lg:p-6">
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
                  <div key={m.id} className="max-w-[min(280px,85%)] self-end rounded-2xl rounded-br px-3.5 py-2.5 text-[14px] leading-relaxed" style={{ background: SOFT }}>{m.content}</div>
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
        <section aria-label={en ? "This week" : "這一週"} className="relative flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 lg:px-7" style={{ background: "#FCFCFB" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" aria-label={en ? "Previous week" : "上一週"} onClick={() => { setWeekStart(addDays(weekStart, -7)); setTouched([]); setOpen(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-full border text-[12px] text-neutral-500 hover:text-neutral-900" style={{ borderColor: LINE }}><FontAwesomeIcon icon={faChevronLeft} /></button>
              <p className="m-0 text-[20px] font-bold" style={{ color: INK }}>
                {weekName ? `${weekName} ` : ""}<span className={weekName ? "text-[15px] font-medium" : ""} style={{ color: weekName ? META : INK }}>{md(weekStart)} – {md(addDays(weekStart, 6))}</span>
              </p>
              <button type="button" aria-label={en ? "Next week" : "下一週"} onClick={() => { setWeekStart(addDays(weekStart, 7)); setTouched([]); setOpen(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-full border text-[12px] text-neutral-500 hover:text-neutral-900" style={{ borderColor: LINE }}><FontAwesomeIcon icon={faChevronRight} /></button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setApprovalOpen(true)}
                className="rounded-full border bg-white px-4 py-2.5 text-[13.5px] font-semibold transition hover:border-neutral-900" style={{ borderColor: LINE, color: INK }}>
                {en ? "Client approval" : "請客戶核准"}
              </button>
              <button type="button" disabled={!hasDrafts || commit?.isPending} onClick={() => commit?.mutate?.({ brandId, weekStart })}
                className="rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition disabled:cursor-default"
                style={hasDrafts ? { background: INK, color: "#FFFFFF" } : { background: "#EDEDED", color: "#A3A3A3" }}>
                {en ? "Lock in this week" : "排定這週"}
              </button>
            </div>
          </div>

          {(weekQ as any).isError && (
            <p role="alert" className="m-0 flex items-center gap-3 rounded-xl border px-4 py-3 text-[13.5px]" style={{ borderColor: LINE, color: INK, background: "#fff" }}>
              {en ? "This week's plan didn't load." : "這週的企劃沒載入。"}
              <button type="button" onClick={() => (weekQ as any).refetch?.()} className="rounded-full border px-3 py-1 text-[12.5px] font-semibold" style={{ borderColor: LINE }}>{en ? "Retry" : "重試"}</button>
            </p>
          )}
          {(weekQ as any).isLoading && !!brandId && (
            <p role="status" aria-live="polite" className="m-0 text-[13px]" style={{ color: META }}>{en ? "Loading this week…" : "載入這週…"}</p>
          )}
          {!(weekQ as any).isLoading && !(weekQ as any).isError && !!brandId && items.length === 0 && (
            <p className="m-0 rounded-xl border border-dashed px-4 py-3 text-[13.5px]" style={{ borderColor: "#D4D4D4", color: META }}>
              {en ? "Nothing planned for this week yet. Tell the assistant on the left what you want to post, or press + on a day." : "這週還沒有安排。對左邊的助理說你想發什麼，或在某一天按 +。"}
            </p>
          )}

          {events.length > 0 && (
            <ul aria-label={en ? "Campaign periods this week" : "這週的活動檔期"} className="m-0 flex list-none flex-col gap-1.5 p-0">
              {events.map((e) => {
                // 檔期內、這週已經做好的貼文（活動企劃的、其他任務卡寫的、已排程／已發布的）。
                const made = items.filter((it) => isMade(it) && it.date >= e.startAt && it.date <= e.endAt && (it.kind !== "campaign" || it.camp.eventId === e.eventId)).length;
                return (
                  <li key={e.eventId} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl border bg-white px-3.5 py-2 text-[13px]" style={{ borderColor: LINE }}>
                    <span className="font-semibold" style={{ color: INK }}>{en ? "Campaign" : "活動"}・{e.name}</span>
                    <span className="tabular-nums" style={{ color: META }}>{md(e.startAt)} – {md(e.endAt)}</span>
                    <span style={{ color: META }}>
                      {en ? `${made} made this week` : `本週已做 ${made} 篇`}
                      {e.total > 0 ? (en ? ` · plan ${e.written}/${e.total} written` : `・企劃 ${e.written}/${e.total} 篇已寫`) : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {days.map((d) => {
              const dayItems = items.filter((it) => it.date === d.date);
              const [wd, dt] = (d.label || "").split(" ");
              return (
                <div key={d.date} className="flex flex-col gap-2.5 rounded-xl"
                  style={overDate === d.date && dragKey ? { outline: `1.5px dashed ${INK}`, outlineOffset: 4 } : undefined}
                  onDragOver={(e) => { if (!dragKey) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overDate !== d.date) setOverDate(d.date); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverDate((cur) => (cur === d.date ? null : cur)); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const it = items.find((x) => x.key === dragKey);
                    setDragKey(null); setOverDate(null);
                    if (it && movable(it)) moveTo(it, d.date);
                  }}>
                  <p className="m-0 flex items-baseline gap-1.5">
                    <span className="text-[13px] font-semibold" style={{ color: INK }}>{wd?.replace("週", "") || ""}</span>
                    <span className="text-[12px]" style={{ color: META }}>{dt || md(d.date)}</span>
                    {eventsOn(d.date).length > 0 && (
                      <span className="min-w-0 truncate rounded-full px-1.5 py-px text-[10.5px]" style={{ background: SOFT, color: "#525252" }}
                        title={eventsOn(d.date).map((e) => e.name).join("、")}>
                        {eventsOn(d.date)[0]!.name}{eventsOn(d.date).length > 1 ? ` +${eventsOn(d.date).length - 1}` : ""}
                      </span>
                    )}
                  </p>
                  {dayItems.map((it) => {
                    const isDraft = it.kind === "slot" && it.slot.status === "draft";
                    const isTouched = (it.kind === "slot" && touched.includes(it.slot.id)) || (hlOutput > 0 && outputOf(it) === hlOutput);
                    const border = isTouched ? `1.5px solid ${ORANGE}` : isDraft ? `1.5px dashed #D4D4D4` : `1px solid ${LINE}`;
                    return (
                      <div key={it.key} className="group relative" style={{ opacity: dragKey === it.key ? 0.4 : 1 }}
                        draggable={movable(it)}
                        onDragStart={(e) => { if (!movable(it)) return; setDragKey(it.key); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", it.key); } catch { /* noop */ } }}
                        onDragEnd={() => { setDragKey(null); setOverDate(null); }}>
                      <button type="button" onClick={() => (it.kind === "review" ? navigate("/review") : canWrite(it) ? startWriting(it) : setOpen(it))}
                        className="flex w-full flex-col gap-2.5 rounded-xl bg-white p-3.5 text-left transition hover:border-neutral-400" style={{ border }}>
                        <span className={`flex w-full items-center justify-between ${canWrite(it) && deletable(it) ? "pr-14" : canWrite(it) || deletable(it) ? "pr-6" : ""}`}>
                          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[12px]" style={{ background: SOFT, color: "#404040" }}>
                            <FontAwesomeIcon icon={PLATFORM_ICON[it.platform] ?? faGlobe} />
                          </span>
                          {isTouched && <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#3F3F46" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: ORANGE }} />{en ? "Changed" : "剛改"}</span>}
                        </span>
                        <span className="line-clamp-3 text-[14px] font-semibold leading-snug" style={{ color: INK }}>{it.title}</span>
                        <span className="flex items-center gap-1.5 flex-wrap text-[12px]" style={{ color: META }}>
                          {(() => {
                            const tag = reviewTag(it);
                            if (!tag) return null;
                            const c = tag.tone === "warn" ? { bg: "#FEF3C7", fg: "#92400E" } : tag.tone === "bad" ? { bg: "#FEE2E2", fg: "#991B1B" } : { bg: "#DCFCE7", fg: "#166534" };
                            return <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: c.bg, color: c.fg }}>{tag.text}</span>;
                          })()}
                          {it.meta}
                          {it.kind !== "campaign" && isMade(it) && eventsOn(it.date)[0] && (
                            <span className="truncate">・{en ? "Campaign " : "活動 "}{eventsOn(it.date)[0]!.name}</span>
                          )}
                        </span>
                      </button>
                      {canWrite(it) && (
                        <button type="button" aria-label={en ? "More" : "更多"} onClick={() => setOpen(it)}
                          className={`absolute ${deletable(it) ? "right-9" : "right-2"} top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-[13px] text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900`}>
                          <FontAwesomeIcon icon={faEllipsis} />
                        </button>
                      )}
                      {deletable(it) && (
                        <button type="button" aria-label={en ? "Delete" : "刪除"} title={en ? "Delete" : "刪除"} onClick={() => deleteItem(it)}
                          className="absolute right-2 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-[12px] text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900">
                          <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                      )}
                      </div>
                    );
                  })}
                  <button type="button" aria-label={en ? `Add a post on ${md(d.date)}` : `${md(d.date)} 加一篇`} onClick={() => setDraft(`${d.label || md(d.date)} ${en ? "add a post" : "加一篇"}`)}
                    className="rounded-xl text-[18px] transition hover:text-neutral-500"
                    style={{ border: "1.5px dashed #E6E6E6", color: "#737373", minHeight: dayItems.length ? 44 : 150 }}>+</button>
                </div>
              );
            })}
          </div>

          {/* ── 點開一篇 ── */}
          {open && (
            <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/20 px-4" onClick={() => setOpen(null)}>
              <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={open.title} className="max-h-[90vh] w-[min(340px,92vw)] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl outline-none" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[12px]" style={{ background: SOFT, color: "#404040" }}><FontAwesomeIcon icon={PLATFORM_ICON[open.platform] ?? faGlobe} /></span>
                    <span className="text-[12px]" style={{ color: META }}>{en ? (PLATFORM_EN[open.platform] ?? open.platform) : (PLATFORM_ZH[open.platform] ?? open.platform)}・{md(open.date)}{open.kind === "slot" && open.slot.format ? `・${open.slot.format}` : ""}</span>
                  </span>
                  <button type="button" aria-label={en ? "Close" : "關閉"} onClick={() => setOpen(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">×</button>
                </div>
                <p className="m-0 mt-3 text-[17px] font-bold leading-snug" style={{ color: INK }}>{open.title}</p>
                {open.kind === "slot" && open.slot.reason && <p className="m-0 mt-2 text-[13.5px] leading-relaxed" style={{ color: "#404040" }}>{open.slot.reason}</p>}
                {open.kind === "campaign" && <p className="m-0 mt-2 text-[13.5px] leading-relaxed" style={{ color: "#404040" }}>{en ? "From campaign" : "來自活動"}「{open.camp.eventName}」</p>}
                {open.kind === "slot" && open.slot.status !== "written" && (() => {
                  const opts = ((data?.cards ?? []) as Array<{ id: string; platform: string; labelZh: string }>).filter((c) => c.platform === open.platform);
                  if (!opts.length) return null;
                  const cur = open.slot.taskId as string;
                  return (
                    <label className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: META }}>
                      <span className="shrink-0">{en ? "Task card" : "任務卡"}</span>
                      <select value={cur} disabled={setSlotCard?.isPending} aria-label={en ? "Task card for this post" : "這一篇用的任務卡"}
                        onChange={(e) => setSlotCard?.mutate?.({ slotId: open.slot.id, taskId: e.target.value })}
                        className="min-w-0 flex-1 rounded-lg border bg-white px-2 py-1.5 text-[12.5px]" style={{ borderColor: LINE, color: INK }}>
                        {!opts.some((c) => c.id === cur) && <option value={cur}>{open.slot.taskLabel ?? cur}</option>}
                        {opts.map((c) => <option key={c.id} value={c.id}>{c.labelZh}</option>)}
                      </select>
                    </label>
                  );
                })()}
                <p className="m-0 mt-2 text-[12px]" style={{ color: META }}>
                  {open.kind === "slot" ? (open.slot.status !== "written" ? "" : `${en ? "Task card" : "任務卡"}・${open.slot.taskLabel ?? open.slot.taskId}`)
                    : open.kind === "campaign" ? `${en ? "Task card" : "任務卡"}・${open.camp.taskLabel}` : open.meta}
                </p>
                {open.kind === "scheduled" && open.cal.awaitingApproval && (
                  <p className="m-0 mt-2 text-[12px] leading-relaxed" style={{ color: META }}>{open.cal.lastError}</p>
                )}
                {isFailedScheduled(open.kind === "scheduled" ? open.cal : null) && (
                  <p role="alert" className="m-0 mt-2 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                    {failedNote(open.kind === "scheduled" ? open.cal : null, en)}
                    {open.kind === "scheduled" && isNotConnectedError(String(open.cal.lastError ?? "")) && (
                      <button type="button" onClick={() => navigate(publishSettingsUrl(brandId))} className="ml-2 underline font-medium">
                        {en ? "Connect" : "去連接"}
                      </button>
                    )}
                  </p>
                )}
                {movable(open) && (
                  <label className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: META }}>
                    <span className="shrink-0">{en ? "Move to" : "移到"}</span>
                    <select value={open.date} disabled={!!(moveSlot?.isPending || moveCamp?.isPending || reschedule?.isPending)} aria-label={en ? "Move to another day" : "移到另一天"}
                      onChange={(e) => { const it = open; setOpen(null); moveTo(it, e.target.value); }}
                      className="min-w-0 flex-1 rounded-lg border bg-white px-2 py-1.5 text-[12.5px]" style={{ borderColor: LINE, color: INK }}>
                      {days.map((d) => <option key={d.date} value={d.date}>{d.label || md(d.date)}</option>)}
                    </select>
                  </label>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {outputOf(open) ? (
                    <button type="button" onClick={() => navigate(`/run/${outputOf(open)}`)} className="flex-1 rounded-full py-2.5 text-[13.5px] font-semibold text-white" style={{ background: INK }}>{isFailedScheduled(open.kind === "scheduled" ? open.cal : null) ? (en ? "Open & reschedule" : "開啟並重新排程") : (en ? "Open" : "看成品")}</button>
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
                  {open.kind === "scheduled" && isFailedScheduled(open.cal) && (
                    <button type="button" disabled={retryFailed?.isPending} onClick={() => retryFailed?.mutate?.({ id: open.cal.id })}
                      className="rounded-full border px-4 py-2.5 text-[13.5px]" style={{ borderColor: LINE }}>{en ? "Retry" : "重試"}</button>
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
                {open.kind === "scheduled" && (open.cal.status === "pending" || isFailedScheduled(open.cal)) && (
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
      {approvalOpen && brandId && (
        <ApprovalLinkModal brandId={brandId} en={en} candidates={approvalCandidates}
          brandName={String(ctx?.brands?.find((b: any) => Number(b.id) === brandId)?.name ?? "")}
          rangeLabel={`${md(weekStart)}–${md(addDays(weekStart, 6))}`}
          onClose={() => { setApprovalOpen(false); try { utils?.approval?.list?.invalidate?.(); } catch { /* noop */ } }} />
      )}
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
  const lang = en ? "en" : "zh";
  return (
    <div className="flex flex-col gap-2.5 pl-[42px]">
      {fork.options.map((o, i) => {
        const isChosen = chosen === i;
        const dim = chosen != null && !isChosen;
        return (
          <div key={o.advisor.slug} className="rounded-xl bg-white p-3.5 transition"
            style={{ border: isChosen ? `1.5px solid ${INK}` : `1px solid ${LINE}`, opacity: dim ? 0.45 : 1 }}>
            <div className="flex items-center gap-2.5">
              <img src={avatarSrc(o.advisor)} alt={agentLabel(o.advisor, lang)} className="h-8 w-8 shrink-0 rounded-full" style={{ background: SOFT }} />
              <div className="min-w-0">
                <p className="m-0 truncate text-[13px] font-semibold" style={{ color: INK }} title={agentTooltip(o.advisor, lang)}>{agentLabel(o.advisor, lang)}</p>
                <p className="m-0 truncate text-[11.5px]" style={{ color: META }}>{agentTitle(o.advisor, lang)}</p>
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
