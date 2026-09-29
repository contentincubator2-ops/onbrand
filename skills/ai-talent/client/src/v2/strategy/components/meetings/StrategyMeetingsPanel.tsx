/**
 * StrategyMeetingsPanel — 策略層「會議」mission tray。
 *
 * 2026-09-26（CJ「定期開會變成一個新的 mission tray」「會議的主題、與會人員由用戶
 * 去設定，還有每多久開一次會，然後會有定期的會議記錄，回去看策略上有沒有調整的」
 * 「會議頁要先有一個範例，讓用戶可以看得懂要怎麼做」）。
 *
 * 三個畫面：
 *   list    會議清單＋（沒有會議時）三步驟說明與完整範例紀錄
 *   form    建立／編輯：主題（可套範本）、討論對象、與會總監、頻率
 *   minutes 某場會的紀錄時間軸＋選中那一份紀錄
 *
 * 版面沿用 StrategyAlertsPanel 的單色 neutral 系統——顏色只拿來表達狀態。
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { showToastGlobal } from "../../../../components/ui/Toast";
import type { StrategistDirector } from "../../lib/strategistDirectors";
import MeetingMinutesView from "./MeetingMinutesView";
import { channelRoute } from "../../../content/lib/channelMeta";
import AdoptConfirmDialog, { type AdoptRequest } from "./AdoptConfirmDialog";
import {
  EXAMPLE_MEETING, EXAMPLE_RUN, TOPIC_TEMPLATES, fmtDate, frequencyText, pendingCount, runNoteText,
  type DecisionStatus, type MeetingAction, type MeetingAttendee, type MeetingFrequency, type MeetingRow, type MeetingRun,
} from "./meetingModel";
import { CloseIcon } from "../../../platform/components/icons";
import { HelpTip } from "../../../platform/components/HelpTip";

interface ListData {
  locked: boolean;
  meetings: MeetingRow[];
  products: Array<{ id: number; name: string }>;
  pendingTotal: number;
  manualCooldownHours: number;
  maxAttendees: number;
}

interface FormState {
  id?: number;
  topic: string;
  agenda: string;
  scope: "brand" | "product";
  scopeId: number;
  attendees: MeetingAttendee[];
  frequency: MeetingFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  enabled: boolean;
}

type View = { kind: "list" } | { kind: "form"; form: FormState } | { kind: "minutes"; meetingId: number };

const btnPrimary = "rounded-full bg-neutral-900 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40";
const btnGhost = "rounded-full border border-neutral-900 px-3 py-1 text-[12px] font-medium text-neutral-900 transition hover:bg-neutral-900 hover:text-white disabled:opacity-40";
const btnQuiet = "rounded-full border border-neutral-300 px-3 py-1 text-[12px] font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-40";
const label = "mb-1.5 block text-[12px] font-semibold text-neutral-500";
const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-[13.5px] outline-none focus:border-neutral-900";

const errToast = (e: any) => showToastGlobal(String(e?.message ?? "error"), "error");

export default function StrategyMeetingsPanel({ brandId }: { brandId: number }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const T = trpc as any;
  const utils = T.useUtils?.();
  const [view, setView] = useState<View>({ kind: "list" });
  const [showExample, setShowExample] = useState(false);

  const listQ = T.strategyMeeting?.list?.useQuery?.({ brandId }, { staleTime: 10_000 }) ?? { data: null, isLoading: false };
  const data = listQ.data as ListData | null | undefined;
  const anyRunning = !!data?.meetings.some((m) => m.latestRun?.status === "running");
  // 有會正在開的時候每 5 秒刷新一次，開完自動出現結果。
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => listQ.refetch?.(), 5_000);
    return () => clearInterval(t);
  }, [anyRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetchAll = () => { try { utils?.strategyMeeting?.invalidate?.(); } catch { /* noop */ } listQ.refetch?.(); };

  const newForm = (preset?: Partial<FormState>): FormState => ({
    topic: "", agenda: "", scope: "brand", scopeId: brandId, attendees: [],
    frequency: "monthly", dayOfWeek: 1, dayOfMonth: 1, enabled: true, ...preset,
  });

  if (listQ.isLoading || !data) {
    return <p className="px-2 py-6 text-[13px] text-neutral-400">{en ? "Loading…" : "載入中…"}</p>;
  }

  if (view.kind === "form") {
    return (
      <MeetingForm
        brandId={brandId} en={en} initial={view.form} products={data.products} maxAttendees={data.maxAttendees}
        onCancel={() => setView({ kind: "list" })}
        onSaved={() => { refetchAll(); setView({ kind: "list" }); }}
      />
    );
  }
  if (view.kind === "minutes") {
    const m = data.meetings.find((x) => x.id === view.meetingId);
    // 會議在別的分頁被刪掉了：直接退回清單（不在 render 裡 setState）。
    if (m) return (
      <MinutesTimeline
        meeting={m} brandId={brandId} en={en}
        onBack={() => { refetchAll(); setView({ kind: "list" }); }}
        // 2026-09-26（CJ「按下開任務直接到 facebook 頁面就困惑了」）：用 PlatformTaskPage
        // 既有的 ?task= 直接打開對應那張卡、?topic= 把題目帶進去——落地就是卡片視窗，
        // 不是一整頁要自己找卡。
        onOpenTask={(a) => {
          if (!a.taskId) return;
          const sp = new URLSearchParams({ task: a.taskId, topic: a.title, b: String(brandId) });
          navigate(`/tasks/${channelRoute(a.platform ?? "facebook")}?${sp.toString()}`);
        }}
        onOpenSource={(href) => navigate(href)}
        onEditPositioning={() => navigate(m.scope === "product"
          ? `/brands/edit?cat=positioning&b=${brandId}&p=${m.scopeId}`
          : `/brands/edit?cat=positioning&b=${brandId}`)}
      />
    );
  }

  const hasMeetings = data.meetings.length > 0;
  const scopeName = (m: MeetingRow) => m.scope === "brand"
    ? (en ? "Brand" : "品牌")
    : (data.products.find((p) => p.id === m.scopeId)?.name ?? `#${m.scopeId}`);

  return (
    <div className="mx-auto max-w-[880px] space-y-6 px-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold text-neutral-900 flex items-center gap-1.5">
            {en ? "Strategy meetings" : "策略會議"}
            <HelpTip>
              {en
                ? "Set a topic, pick the directors, choose how often. They meet in the background and leave minutes — whether your strategy should change is your call."
                : "你定主題、挑與會的策略總監、決定多久開一次。時間到了他們會在背景開會，留下一份會議紀錄——策略要不要調整，最後由你決定。"}
            </HelpTip>
          </h2>
        </div>
        {!data.locked && (
          <button type="button" className={btnPrimary} onClick={() => setView({ kind: "form", form: newForm() })}>
            {en ? "+ New meeting" : "＋ 新增會議"}
          </button>
        )}
      </header>

      {data.locked && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4 text-[13px] leading-relaxed text-neutral-600">
          {en
            ? "Strategy meetings are part of the Professional plan. Below is an example of what each meeting leaves you."
            : "策略會議屬於專業方案。下面是一場會開完後你會拿到的範例。"}
        </div>
      )}

      {data.pendingTotal > 0 && (
        <div className="rounded-xl border border-neutral-900 bg-white px-5 py-3 text-[13.5px] text-neutral-900">
          {en ? `${data.pendingTotal} strategy change(s) waiting for your decision.` : `有 ${data.pendingTotal} 項策略調整等你決定。`}
        </div>
      )}

      {/* 會議清單 */}
      {hasMeetings && (
        <div className="space-y-3">
          {data.meetings.map((m) => (
            <MeetingCard
              key={m.id} m={m} en={en} scopeName={scopeName(m)} cooldownHours={data.manualCooldownHours}
              onOpen={() => setView({ kind: "minutes", meetingId: m.id })}
              onEdit={() => setView({ kind: "form", form: {
                id: m.id, topic: m.topic, agenda: m.agenda, scope: m.scope, scopeId: m.scopeId, attendees: m.attendees,
                frequency: m.frequency, dayOfWeek: m.dayOfWeek ?? 1, dayOfMonth: m.dayOfMonth ?? 1, enabled: m.enabled,
              } })}
              onChanged={refetchAll}
              brandId={brandId}
            />
          ))}
        </div>
      )}

      {/* 範例：沒有會議時直接攤開；有會議後收成一個連結 */}
      {hasMeetings && !showExample ? (
        <button type="button" onClick={() => setShowExample(true)} className="text-[12.5px] text-neutral-500 underline hover:text-neutral-900">
          {en ? "See an example meeting" : "看範例會議"}
        </button>
      ) : (
        <ExampleBlock
          en={en} locked={data.locked}
          onUse={() => setView({ kind: "form", form: newForm({ topic: EXAMPLE_MEETING.topic, agenda: EXAMPLE_MEETING.agenda, frequency: "monthly", dayOfMonth: 1 }) })}
          onHide={hasMeetings ? () => setShowExample(false) : undefined}
        />
      )}
    </div>
  );
}

// ─── 範例 ────────────────────────────────────────────────────────────────

function ExampleBlock({ en, locked, onUse, onHide }: { en: boolean; locked: boolean; onUse: () => void; onHide?: () => void }) {
  const steps = en
    ? [["Set it up", "Topic, what to discuss (brand or a product), and how often."], ["Pick attendees", "Up to 4 strategy directors. Each speaks from their own angle and responds to the others."], ["Read the minutes", "Each strategy anchor is marked keep or adjust. You adopt, adjust, or reject — nothing changes until you do."]]
    : [["設定會議", "主題、要討論品牌還是某個產品、多久開一次。"], ["挑與會總監", "最多 4 位策略總監。每位從自己的專業發言，也會回應前面的人。"], ["看會議紀錄", "每一格策略都會標「維持」或「建議調整」。你決定採用、修改或不採用——你沒決定之前，策略不會被改。"]];
  return (
    <section className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-neutral-400 px-2 py-0.5 text-[11px] font-medium text-neutral-500">{en ? "Example" : "範例"}</span>
          <h3 className="text-[15px] font-semibold text-neutral-900">{en ? "How a strategy meeting works" : "策略會議怎麼運作"}</h3>
        </div>
        {onHide && <button type="button" onClick={onHide} className="text-[12px] text-neutral-400 underline hover:text-neutral-900">{en ? "Hide" : "收起"}</button>}
      </div>

      <ol className="mb-5 grid gap-3 sm:grid-cols-3">
        {steps.map(([t, d], i) => (
          <li key={i} className="rounded-xl border border-neutral-200 px-4 py-3">
            <p className="font-mono text-[11px] text-neutral-400">0{i + 1}</p>
            <p className="mt-0.5 text-[13.5px] font-semibold text-neutral-900">{t}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">{d}</p>
          </li>
        ))}
      </ol>

      {/* 範例會議設定 */}
      <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[14px] font-semibold text-neutral-900">{EXAMPLE_MEETING.topic}</span>
          <span className="text-[12.5px] text-neutral-500">{en ? "Brand · 1st of every month, 9am" : `品牌・${EXAMPLE_MEETING.frequencyLabel}`}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-neutral-500">{EXAMPLE_MEETING.agenda}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLE_MEETING.attendees.map((a) => (
            <span key={a.name} className="rounded-full border border-neutral-300 bg-white px-2.5 py-0.5 text-[12px] text-neutral-700">{a.name}</span>
          ))}
        </div>
      </div>

      {/* 範例會議紀錄 */}
      <div className="rounded-xl border border-neutral-200 px-4 py-4">
        <p className="mb-3 text-[12px] text-neutral-400">
          {en ? `Example minutes · ${EXAMPLE_RUN.date}` : `範例會議紀錄・${EXAMPLE_RUN.date}`}
        </p>
        <MeetingMinutesView minutes={EXAMPLE_RUN.minutes} evidence={EXAMPLE_RUN.evidence} decisions={{}} en={en} readOnly />
      </div>

      {!locked && (
        <div className="mt-4 flex justify-end">
          <button type="button" className={btnPrimary} onClick={onUse}>{en ? "Set up a meeting like this" : "照這個範例建立會議"}</button>
        </div>
      )}
    </section>
  );
}

// ─── 會議卡 ──────────────────────────────────────────────────────────────

function MeetingCard({ m, en, scopeName, brandId, cooldownHours, onOpen, onEdit, onChanged }: {
  m: MeetingRow; en: boolean; scopeName: string; brandId: number; cooldownHours: number;
  onOpen: () => void; onEdit: () => void; onChanged: () => void;
}) {
  const T = trpc as any;
  const runNow = T.strategyMeeting?.runNow?.useMutation?.({
    onSuccess: () => { showToastGlobal(en ? "Meeting started — about 1–2 minutes" : "會議開始了，大約 1–2 分鐘", "success"); onChanged(); },
    onError: errToast,
  });
  const update = T.strategyMeeting?.update?.useMutation?.({ onSuccess: onChanged, onError: errToast });
  const remove = T.strategyMeeting?.remove?.useMutation?.({
    onSuccess: () => { showToastGlobal(en ? "Meeting removed (past minutes kept)" : "已刪除會議（過去的紀錄保留）", "success"); onChanged(); },
    onError: errToast,
  });
  const running = m.latestRun?.status === "running";

  const toggle = () => update?.mutate?.({
    id: m.id, brandId, scope: m.scope, scopeId: m.scopeId, topic: m.topic, agenda: m.agenda, attendees: m.attendees,
    frequency: m.frequency, dayOfWeek: m.dayOfWeek, dayOfMonth: m.dayOfMonth, enabled: !m.enabled,
  });

  return (
    <div className={`rounded-xl border bg-white px-5 py-4 ${m.enabled ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-neutral-900">{m.topic}</span>
            {m.pending > 0 && (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white">
                {en ? `${m.pending} to decide` : `${m.pending} 項待決定`}
              </span>
            )}
            {!m.enabled && <span className="text-[12px] text-neutral-400">{en ? "Paused" : "已暫停"}</span>}
          </div>
          <p className="mt-1 text-[12.5px] text-neutral-500">
            {scopeName}・{frequencyText(m, en)}
            {m.enabled && m.nextRunAt && <>・{en ? "next" : "下次"} <span className="font-mono">{fmtDate(m.nextRunAt, en, true)}</span></>}
          </p>
          <p className="mt-1 text-[12.5px] text-neutral-600">{m.attendees.map((a) => a.name).join("、")}</p>
          <p className="mt-1.5 text-[12.5px] text-neutral-500">
            {running
              ? (en ? "Meeting in progress…" : "會議進行中…")
              : m.latestRun
                ? <>{en ? "Last:" : "上次："} <span className="font-mono">{fmtDate(m.latestRun.createdAt, en)}</span>　{runNoteText(m.latestRun.note, en)}</>
                : (en ? "Hasn't met yet." : "還沒開過會。")}
          </p>
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {m.runCount > 0 && <button type="button" className={btnGhost} onClick={onOpen}>{en ? "Minutes" : "會議紀錄"}</button>}
          <button type="button" className={btnQuiet} disabled={running || runNow?.isPending}
            title={en ? `Manual runs: once every ${cooldownHours}h` : `手動開會每 ${cooldownHours} 小時一次`}
            onClick={() => runNow?.mutate?.({ id: m.id })}>{en ? "Meet now" : "現在開一次"}</button>
          <button type="button" className={btnQuiet} onClick={onEdit}>{en ? "Edit" : "編輯"}</button>
          <button type="button" className={btnQuiet} disabled={update?.isPending} onClick={toggle}>{m.enabled ? (en ? "Pause" : "暫停") : (en ? "Resume" : "恢復")}</button>
          <button type="button" className="px-1 text-[12px] text-neutral-400 underline hover:text-neutral-900"
            onClick={() => { if (window.confirm(en ? "Delete this meeting? Past minutes are kept." : "刪除這場會議？過去的會議紀錄會保留。")) remove?.mutate?.({ id: m.id }); }}>
            {en ? "Delete" : "刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 建立／編輯 ───────────────────────────────────────────────────────────

function MeetingForm({ brandId, en, initial, products, maxAttendees, onCancel, onSaved }: {
  brandId: number; en: boolean; initial: FormState; products: Array<{ id: number; name: string }>;
  maxAttendees: number; onCancel: () => void; onSaved: () => void;
}) {
  const T = trpc as any;
  const [f, setF] = useState<FormState>(initial);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const dirQ = T.strategistChat?.listDirectors?.useQuery?.({ brandId, scope: f.scope }, { staleTime: 60_000 }) ?? { data: null };
  const searchQ = T.strategistChat?.searchDirectors?.useQuery?.({ search: searchTerm, limit: 12 }, { enabled: searchTerm.length > 0, staleTime: 60_000 }) ?? { data: null };

  const suggested = useMemo(() => {
    const out: StrategistDirector[] = [];
    const seen = new Set<number>();
    for (const d of (dirQ.data?.directors ?? []) as StrategistDirector[]) {
      for (const x of [d, ...(d.alternatives ?? [])]) {
        if (seen.has(x.agentId)) continue;
        seen.add(x.agentId); out.push(x);
      }
    }
    return out;
  }, [dirQ.data]);
  const searched: StrategistDirector[] = (searchQ.data?.directors ?? []) as StrategistDirector[];

  // 新建且還沒挑人：預設帶入這個範圍的三位總監（不含備用人選）。
  useEffect(() => {
    if (f.id || f.attendees.length || !dirQ.data?.directors?.length) return;
    set("attendees", (dirQ.data.directors as StrategistDirector[]).slice(0, maxAttendees).map((d) => ({ agentId: d.agentId, name: d.name, title: d.title })));
  }, [dirQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = new Set(f.attendees.map((a) => a.agentId));
  const toggleAttendee = (d: StrategistDirector) => {
    if (picked.has(d.agentId)) { set("attendees", f.attendees.filter((a) => a.agentId !== d.agentId)); return; }
    if (f.attendees.length >= maxAttendees) { showToastGlobal(en ? `Up to ${maxAttendees} attendees` : `最多 ${maxAttendees} 位與會者`, "error"); return; }
    set("attendees", [...f.attendees, { agentId: d.agentId, name: d.name, title: d.title }]);
  };

  const create = T.strategyMeeting?.create?.useMutation?.({
    onSuccess: (r: any) => { showToastGlobal(en ? `Saved · first meeting ${fmtDate(r?.nextRunAt, en, true)}` : `已建立・第一場會在 ${fmtDate(r?.nextRunAt, en, true)}`, "success"); onSaved(); },
    onError: errToast,
  });
  const update = T.strategyMeeting?.update?.useMutation?.({
    onSuccess: () => { showToastGlobal(en ? "Saved" : "已儲存", "success"); onSaved(); },
    onError: errToast,
  });
  const busy = create?.isPending || update?.isPending;
  const valid = f.topic.trim().length >= 2 && f.attendees.length > 0;

  const submit = () => {
    const payload = {
      brandId, scope: f.scope, scopeId: f.scope === "brand" ? brandId : f.scopeId,
      topic: f.topic.trim(), agenda: f.agenda.trim(), attendees: f.attendees, frequency: f.frequency,
      dayOfWeek: f.frequency === "weekly" || f.frequency === "biweekly" ? f.dayOfWeek : null,
      dayOfMonth: f.frequency === "monthly" || f.frequency === "quarterly" ? f.dayOfMonth : null,
      enabled: f.enabled,
    };
    if (f.id) update?.mutate?.({ id: f.id, ...payload }); else create?.mutate?.(payload);
  };

  const DirChip = ({ d }: { d: StrategistDirector }) => (
    <button type="button" onClick={() => toggleAttendee(d)}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${picked.has(d.agentId) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white hover:border-neutral-900"}`}>
      {d.avatarUrl && <img src={d.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />}
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{d.name}</span>
        <span className={`block truncate text-[11.5px] ${picked.has(d.agentId) ? "text-neutral-300" : "text-neutral-500"}`}>{en ? d.roleLabelEn || d.title : d.roleLabel || d.title}</span>
      </span>
    </button>
  );

  return (
    <div className="mx-auto max-w-[760px] space-y-6 px-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] font-semibold text-neutral-900">{f.id ? (en ? "Edit meeting" : "編輯會議") : (en ? "New meeting" : "新增會議")}</h2>
        <button type="button" onClick={onCancel} className="text-[12.5px] text-neutral-500 underline hover:text-neutral-900">{en ? "Cancel" : "取消"}</button>
      </div>

      {/* 1 主題 */}
      <section>
        <span className={label}>{en ? "1 · Topic" : "1・會議主題"}</span>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {TOPIC_TEMPLATES.map((t) => (
            <button key={t.topic} type="button" className={btnQuiet}
              onClick={() => setF((p) => ({ ...p, topic: en ? t.topicEn : t.topic, agenda: t.agenda, frequency: t.frequency }))}>
              {en ? t.topicEn : t.topic}
            </button>
          ))}
        </div>
        <input className={input} value={f.topic} maxLength={120} onChange={(e) => set("topic", e.target.value)}
          placeholder={en ? "e.g. Monthly brand strategy review" : "例如：月度品牌策略檢討"} />
        <textarea className={`${input} mt-2 min-h-[72px]`} value={f.agenda} maxLength={1000} onChange={(e) => set("agenda", e.target.value)}
          placeholder={en ? "What should they focus on? (optional)" : "這場會要討論什麼？（選填）"} />
      </section>

      {/* 2 討論對象 */}
      <section>
        <span className={label}>{en ? "2 · What to discuss" : "2・討論對象"}</span>
        <select className={input} value={f.scope === "brand" ? "brand" : String(f.scopeId)}
          onChange={(e) => {
            const v = e.target.value;
            // 換範圍時與會者清空——品牌與產品是兩組不同的總監。
            setF((p) => ({ ...p, scope: v === "brand" ? "brand" : "product", scopeId: v === "brand" ? brandId : Number(v), attendees: p.id ? p.attendees : [] }));
          }}>
          <option value="brand">{en ? "The brand" : "品牌"}</option>
          {products.map((p) => <option key={p.id} value={p.id}>{en ? `Product: ${p.name}` : `產品：${p.name}`}</option>)}
        </select>
      </section>

      {/* 3 與會者 */}
      <section>
        <span className={label}>
          {en ? `3 · Attendees (${f.attendees.length}/${maxAttendees})` : `3・與會總監（${f.attendees.length}/${maxAttendees}）`}
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          {suggested.map((d) => <DirChip key={d.agentId} d={d} />)}
        </div>
        {f.attendees.filter((a) => !suggested.some((d) => d.agentId === a.agentId)).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {f.attendees.filter((a) => !suggested.some((d) => d.agentId === a.agentId)).map((a) => (
              <button key={a.agentId} type="button" onClick={() => set("attendees", f.attendees.filter((x) => x.agentId !== a.agentId))}
                className="rounded-full bg-neutral-900 px-3 py-1 text-[12px] text-white">{a.name} <CloseIcon size={10} /></button>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <input className={input} value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setSearchTerm(search.trim()); }}
            placeholder={en ? "Find more directors (e.g. pricing, beauty)" : "找更多人選（例如：定價、美妝）"} />
          <button type="button" className={btnQuiet} onClick={() => setSearchTerm(search.trim())}>{en ? "Search" : "搜尋"}</button>
        </div>
        {searchTerm && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {searched.length === 0
              ? <p className="text-[12.5px] text-neutral-400">{searchQ.isLoading ? (en ? "Searching…" : "搜尋中…") : (en ? "No match." : "沒有符合的人選。")}</p>
              : searched.map((d) => <DirChip key={d.agentId} d={d} />)}
          </div>
        )}
      </section>

      {/* 4 頻率 */}
      <section>
        <span className={label}>{en ? "4 · How often" : "4・多久開一次"}</span>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${input} w-auto`} value={f.frequency} onChange={(e) => set("frequency", e.target.value as MeetingFrequency)}>
            <option value="weekly">{en ? "Weekly" : "每週"}</option>
            <option value="biweekly">{en ? "Every 2 weeks" : "每兩週"}</option>
            <option value="monthly">{en ? "Monthly" : "每月"}</option>
            <option value="quarterly">{en ? "Quarterly" : "每季"}</option>
          </select>
          {(f.frequency === "weekly" || f.frequency === "biweekly") ? (
            <select className={`${input} w-auto`} value={f.dayOfWeek} onChange={(e) => set("dayOfWeek", Number(e.target.value))}>
              {(en ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["週日", "週一", "週二", "週三", "週四", "週五", "週六"]).map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          ) : (
            <select className={`${input} w-auto`} value={f.dayOfMonth} onChange={(e) => set("dayOfMonth", Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{en ? `Day ${d}` : `${d} 號`}</option>)}
            </select>
          )}
          <span className="text-[12.5px] text-neutral-500">{en ? "at 9am (Taipei)" : "早上 9 點（台北時間）"}</span>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
        {!valid && <span className="mr-auto text-[12px] text-neutral-400">{en ? "Needs a topic and at least one attendee." : "需要主題，以及至少一位與會者。"}</span>}
        <button type="button" className={btnQuiet} onClick={onCancel}>{en ? "Cancel" : "取消"}</button>
        <button type="button" className={btnPrimary} disabled={!valid || busy} onClick={submit}>{f.id ? (en ? "Save" : "儲存") : (en ? "Create meeting" : "建立會議")}</button>
      </div>
    </div>
  );
}

// ─── 會議紀錄時間軸 ─────────────────────────────────────────────────────

function MinutesTimeline({ meeting, brandId, en, onBack, onOpenTask, onOpenSource, onEditPositioning }: {
  meeting: MeetingRow; brandId: number; en: boolean;
  onBack: () => void; onOpenTask: (a: MeetingAction) => void; onOpenSource: (href: string) => void; onEditPositioning: () => void;
}) {
  const T = trpc as any;
  const runsQ = T.strategyMeeting?.runs?.useQuery?.({ meetingId: meeting.id }, { staleTime: 5_000 }) ?? { data: null, isLoading: false };
  const runs: MeetingRun[] = runsQ.data?.runs ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const anyRunning = runs.some((r) => r.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => runsQ.refetch?.(), 5_000);
    return () => clearInterval(t);
  }, [anyRunning]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = runs.find((r) => r.id === selected) ?? runs[0] ?? null;

  const decide = T.strategyMeeting?.decide?.useMutation?.({
    onSuccess: (_r: unknown, vars: any) => {
      if (vars?.status === null && vars?.restoring) showToastGlobal(en ? "Undone — Brand Brain restored" : "已撤回，品牌大腦已復原", "success");
      runsQ.refetch?.();
    },
    onError: errToast,
  });
  const onDecide = (anchorId: string, status: Extract<DecisionStatus, "rejected"> | null) => {
    if (!current) return;
    const restoring = status === null && !!current.decisions[anchorId]?.versionId;
    decide?.mutate?.({ runId: current.id, anchorId, status, restoring });
  };
  const [adoptReq, setAdoptReq] = useState<AdoptRequest | null>(null);

  return (
    <div className="mx-auto max-w-[980px] px-2">
      {adoptReq && (
        <AdoptConfirmDialog
          req={adoptReq} en={en} onClose={() => setAdoptReq(null)}
          onDone={() => { setAdoptReq(null); runsQ.refetch?.(); }}
        />
      )}
      <button type="button" onClick={onBack} className="mb-3 text-[12.5px] text-neutral-500 underline hover:text-neutral-900">← {en ? "All meetings" : "所有會議"}</button>
      <h2 className="text-[20px] font-semibold text-neutral-900">{meeting.topic}</h2>
      <p className="mt-1 text-[12.5px] text-neutral-500">
        {frequencyText(meeting, en)}・{meeting.attendees.map((a) => a.name).join("、")}
      </p>

      {runsQ.isLoading ? (
        <p className="py-6 text-[13px] text-neutral-400">{en ? "Loading…" : "載入中…"}</p>
      ) : runs.length === 0 ? (
        <p className="mt-6 rounded-xl border border-neutral-200 px-5 py-4 text-[13px] text-neutral-500">
          {en ? "No minutes yet. The first meeting happens on schedule, or press “Meet now”." : "還沒有會議紀錄。時間到會自動開會，也可以按「現在開一次」。"}
        </p>
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-[200px_1fr]">
          {/* 時間軸 */}
          <ol className="space-y-1">
            {runs.map((r) => {
              const p = pendingCount(r);
              const adopted = r.minutes ? r.minutes.checks.filter((c) => c.verdict === "adjust" && r.decisions[c.anchorId] && r.decisions[c.anchorId]!.status !== "rejected").length : 0;
              const active = current?.id === r.id;
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelected(r.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left transition ${active ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>
                    <span className="block font-mono text-[12.5px]">{fmtDate(r.createdAt, en)}</span>
                    <span className={`block text-[11.5px] ${active ? "text-neutral-300" : "text-neutral-500"}`}>
                      {r.status === "running" ? (en ? "In progress…" : "進行中…")
                        : r.status === "failed" ? (en ? "Failed" : "失敗")
                        : p > 0 ? (en ? `${p} to decide` : `${p} 項待決定`)
                        : adopted > 0 ? (en ? `${adopted} change(s) adopted` : `調整了 ${adopted} 項`)
                        : (en ? "No change" : "策略維持")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* 選中的那一份 */}
          <div className="min-w-0 rounded-xl border border-neutral-200 bg-white px-5 py-5">
            {!current ? null : current.status === "running" ? (
              <p className="text-[13.5px] text-neutral-600">{en ? "The directors are meeting now. This usually takes 1–2 minutes." : "總監們正在開會，通常 1–2 分鐘。"}</p>
            ) : current.status === "failed" ? (
              <div className="space-y-3">
                <p className="text-[13.5px] text-neutral-700">{runNoteText(current.note, en)}</p>
                {current.transcript.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    {current.transcript.map((t, i) => (
                      <div key={i}>
                        <p className="text-[12.5px] font-semibold text-neutral-900">{t.name}<span className="ml-1.5 font-normal text-neutral-400">{t.title}</span></p>
                        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-700">{t.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : current.minutes ? (
              <>
                <p className="mb-4 text-[12px] text-neutral-400">
                  {en ? "Minutes" : "會議紀錄"}・<span className="font-mono">{fmtDate(current.createdAt, en, true)}</span>
                  {current.trigger === "manual" && (en ? " · run manually" : "・手動開會")}
                </p>
                <MeetingMinutesView
                  minutes={current.minutes} evidence={current.evidence} decisions={current.decisions}
                  transcript={current.transcript} en={en} busy={decide?.isPending} scope={meeting.scope}
                  onDecide={onDecide} onEditPositioning={onEditPositioning} onOpenTask={onOpenTask} onOpenSource={onOpenSource}
                  onAdopt={(anchorId, label, status, text) => setAdoptReq({ runId: current.id, anchorId, label, status, text })}
                />
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
