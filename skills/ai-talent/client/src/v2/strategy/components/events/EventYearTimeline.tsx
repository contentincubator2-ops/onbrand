/**
 * EventYearTimeline — 策略層「活動」頁上方的年度時間軸。
 *
 * 2026-10-02（CJ「要不要用行事曆的形式，鼓勵用戶將一整年的活動都先新建進來」→ 定案）：
 *   - 不是月曆格子（週層級的排程歸「本週企劃」），是 12 個月橫向時間軸：活動是橫條，
 *     一眼看到檔期空在哪、哪裡撞在一起。
 *   - 不逼用戶一次建完一整年：上面一列是「節點」——依品牌市場算出的節慶，加上用戶自己
 *     加的節點（CJ「建議節點，也可以讓用戶自己增加」）。點節點 →「開始企劃」才建活動。
 *     節點 ≠ 活動的理由見 server/strategy/core/eventCalendar.ts。
 *   - 節點視窗照任務卡彈跳視窗的設計（CJ「介面設計，參考任務卡按下後，彈跳視窗的設計
 *     方式」）：外觀共用 taskModalStyle；插畫＋一句大字問句；次要動作是圓形圖示鈕。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea, Tooltip } from "@heroui/react";
import { trpc } from "../../../../lib/trpc";
import { showToastGlobal } from "../../../platform/components/Toast";
import { EmptyIllustration } from "../../../platform/components/EmptyIllustration";
import { AddIcon, ChevronLeftIcon, ChevronRightIcon, DeleteIcon, EditIcon, FlagIcon, CommentIcon } from "../../../platform/components/icons";
import { TASK_MODAL_CLASSNAMES, TASK_MODAL_HEADER, TASK_MODAL_INPUT, TASK_MODAL_QUESTION } from "../../../platform/components/taskModalStyle";
import { labelPx, nodeErrorText, overlaps, packLanes, pct, pxToDays, shiftMonth, timelineWindow, toYmd } from "../../lib/eventTimeline";

export interface PlanPrefill { name: string; startAt: string; endAt: string | null }

interface CalendarNode {
  key: string;
  source: "builtin" | "custom";
  id: number | null;
  builtinKey: string | null;
  nameZh: string;
  nameEn: string;
  date: string;
  endDate: string | null;
  recurring: boolean;
  note: string | null;
  priority: number;
}

interface Props {
  brandId: number;
  events: any[];
  lang: "zh-TW" | "en";
  today: string;
  onOpenEvent: (id: number) => void;
  onPlanFromNode: (prefill: PlanPrefill) => void;
}

type NodeDialog =
  | { mode: "view"; node: CalendarNode }
  | { mode: "edit"; node: CalendarNode | null; seedDate?: string };

/** 時間軸最窄的寬度（px）；更窄的螢幕在框內左右捲。 */
const TRACK_MIN_PX = 760;
/** 活動橫條最短畫多寬（px）——一天的活動也要點得到、看得到名字開頭。 */
const BAR_MIN_PX = 72;

export default function EventYearTimeline({ brandId, events, lang, today, onOpenEvent, onPlanFromNode }: Props) {
  const en = lang === "en";
  const [fromMonth, setFromMonth] = useState(today.slice(0, 7));
  const w = useMemo(() => timelineWindow(fromMonth), [fromMonth]);
  const [dialog, setDialog] = useState<NodeDialog | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  // 標籤會不會疊在一起取決於實際寬度，所以量軌道寬度、把標籤寬度換成「佔幾天」再分列。
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(TRACK_MIN_PX);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setTrackPx(Math.max(TRACK_MIN_PX, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const utils = trpc.useUtils() as any;
  const nodesQ = (trpc as any).eventCalendar.nodes.useQuery(
    { brandId, fromMonth, months: 12 },
    { refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const refresh = () => utils.eventCalendar?.nodes?.invalidate?.();
  const onErr = (e: any) => showToastGlobal(nodeErrorText(e, en), "error");
  const hideMut = (trpc as any).eventCalendar.hideBuiltin.useMutation({ onSuccess: refresh, onError: onErr });
  const showMut = (trpc as any).eventCalendar.showBuiltin.useMutation({ onSuccess: refresh, onError: onErr });
  const removeMut = (trpc as any).eventCalendar.removeNode.useMutation({ onSuccess: refresh, onError: onErr });

  const data = nodesQ.data as undefined | {
    builtin: CalendarNode[]; custom: CalendarNode[];
    hiddenBuiltins: Array<{ builtinKey: string; nameZh: string; nameEn: string }>;
    customCount: number; customMax: number;
  };
  const nodeLanes = useMemo(() => packLanes(
    [...(data?.custom ?? []), ...(data?.builtin ?? [])].map((n) => ({ ...n, start: n.date, end: n.endDate })),
    (n) => pxToDays(Math.min(labelPx(en ? n.nameEn : n.nameZh), 160), w, trackPx),
    pxToDays(12, w, trackPx),
  ), [data, en, w, trackPx]);
  const nodeRows = Math.max(1, ...nodeLanes.map((n) => n.lane + 1));

  const dated = useMemo(() => events
    .map((e) => ({ ...e, start: toYmd(e.startAt), end: toYmd(e.endAt) }))
    .filter((e): e is any => !!e.start && overlaps(w, e.start, e.end)), [events, w]);
  const eventLanes = useMemo(() => packLanes(
    dated.map((e) => ({ ...e, start: e.start as string, end: e.end as string | null })),
    pxToDays(BAR_MIN_PX + 4, w, trackPx),
  ), [dated, w, trackPx]);
  const eventRows = Math.max(1, ...eventLanes.map((e) => e.lane + 1));
  const undatedCount = events.filter((e) => !toYmd(e.startAt)).length;
  const todayPct = overlaps(w, today, null) ? pct(w, today) : null;

  const nameOf = (n: CalendarNode) => (en ? n.nameEn : n.nameZh);
  const rangeLabel = `${w.months[0]!.year}/${w.months[0]!.month} – ${w.months[11]!.year}/${w.months[11]!.month}`;

  return (
    <section className="mb-6">
      {/* 工具列 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setFromMonth(shiftMonth(fromMonth, -12))} className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600" aria-label={en ? "Previous year" : "前一年"}>
            <ChevronLeftIcon size={12} />
          </button>
          <span className="text-sm font-semibold text-neutral-900 tabular-nums min-w-[136px] text-center">{rangeLabel}</span>
          <button onClick={() => setFromMonth(shiftMonth(fromMonth, 12))} className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600" aria-label={en ? "Next year" : "後一年"}>
            <ChevronRightIcon size={12} />
          </button>
          {fromMonth !== today.slice(0, 7) && (
            <button onClick={() => setFromMonth(today.slice(0, 7))} className="text-[12px] text-neutral-500 hover:text-neutral-900 px-2">
              {en ? "Today" : "回到今天"}
            </button>
          )}
        </div>
        <div className="flex-1" />
        {(data?.hiddenBuiltins.length ?? 0) > 0 && (
          <button onClick={() => setShowHidden((v) => !v)} className="text-[12px] text-neutral-500 hover:text-neutral-900">
            {en ? `${data!.hiddenBuiltins.length} hidden` : `已隱藏 ${data!.hiddenBuiltins.length} 個節慶`}
          </button>
        )}
        <Button size="sm" radius="full" variant="bordered" className="border-neutral-300"
          startContent={<AddIcon size={11} />}
          onPress={() => setDialog({ mode: "edit", node: null })}
          isDisabled={!!data && data.customCount >= data.customMax}
        >
          {en ? "Add a date" : "新增節點"}
        </Button>
      </div>

      {showHidden && (data?.hiddenBuiltins.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {data!.hiddenBuiltins.map((h) => (
            <button key={h.builtinKey}
              onClick={() => showMut.mutate({ brandId, builtinKey: h.builtinKey })}
              className="text-[12px] px-2.5 py-1 rounded-full border border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900"
              title={en ? "Show again" : "重新顯示"}
            >
              + {en ? h.nameEn : h.nameZh}
            </button>
          ))}
        </div>
      )}

      {/* 時間軸本體——窄螢幕在框內左右捲，不撐破頁面 */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-x-auto">
        <div ref={trackRef} className="relative" style={{ minWidth: TRACK_MIN_PX }}>
          {/* 月份格線＋標頭 */}
          <div className="grid grid-cols-12 border-b border-neutral-100">
            {w.months.map((m, i) => (
              <div key={m.key} className={`px-2 py-2 text-[12px] whitespace-nowrap overflow-hidden ${i > 0 ? "border-l border-neutral-100" : ""} ${m.key === today.slice(0, 7) ? "text-neutral-900 font-semibold" : "text-neutral-500"}`}>
                {(i === 0 || m.month === 1) && <span className="text-neutral-400 mr-1 tabular-nums">{m.year}</span>}
                {en ? new Date(m.year, m.month - 1, 1).toLocaleDateString("en-US", { month: "short" }) : `${m.month}月`}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-0 grid grid-cols-12 pointer-events-none">
            {w.months.map((m, i) => <div key={m.key} className={i > 0 ? "border-l border-neutral-100" : ""} />)}
          </div>
          {todayPct != null && (
            <div className="absolute top-0 bottom-0 w-px bg-neutral-900/70 pointer-events-none z-10" style={{ left: `${todayPct}%` }}>
              <span className={`absolute bottom-1 whitespace-nowrap text-[10px] font-semibold bg-neutral-900 text-white px-1.5 py-px rounded ${todayPct < 3 ? "left-0" : "-translate-x-1/2"}`}>{en ? "Today" : "今天"}</span>
            </div>
          )}

          {/* 節點列 */}
          <div className="relative px-0" style={{ height: nodeRows * 28 + 12 }}>
            {nodesQ.isLoading && <div className="absolute inset-3 rounded bg-neutral-50 animate-pulse" />}
            {/* 有期間的節點：一條細線標出整段（畫在按鈕外，寬度才能用百分比） */}
            {nodeLanes.filter((n) => n.endDate && n.endDate > n.date).map((n) => (
              <span key={`${n.key}:span`} className={`absolute h-0.5 pointer-events-none ${n.source === "custom" ? "bg-neutral-900/40" : "bg-neutral-300"}`}
                style={{ left: `${pct(w, n.date)}%`, width: `${pct(w, n.endDate!) - pct(w, n.date)}%`, top: 6 + n.lane * 28 + 9 }} />
            ))}
            {nodeLanes.map((n) => {
              const left = pct(w, n.date);
              const custom = n.source === "custom";
              return (
                <button
                  key={n.key}
                  onClick={() => setDialog({ mode: "view", node: n })}
                  className="absolute flex items-center gap-1 group z-20 max-w-[160px]"
                  style={{ left: `${left}%`, top: 6 + n.lane * 28 }}
                  title={`${nameOf(n)} · ${n.date}`}
                >
                  <span className={`relative shrink-0 w-2.5 h-2.5 -ml-[5px] rounded-full ring-2 ring-white ${custom ? "bg-neutral-900" : "bg-white border border-neutral-400"}`} />
                  <span className={`relative text-[12px] truncate px-1 rounded bg-white/90 group-hover:underline ${
                    custom ? "text-neutral-900 font-medium" : n.priority >= 5 ? "text-neutral-700" : "text-neutral-500"}`}>
                    {nameOf(n)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 活動列 */}
          <div className="relative border-t border-dashed border-neutral-200" style={{ height: eventRows * 32 + 28 }}>
            {eventLanes.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-[12px] text-neutral-400">
                {en ? "No campaigns in this year yet — pick a date above to start one" : "這一年還沒有活動——點上面的節點開始企劃"}
              </p>
            )}
            {eventLanes.map((e) => {
              const left = pct(w, e.start);
              const right = pct(w, e.end ?? e.start);
              const ended = (e.end ?? e.start) < today;
              return (
                <button
                  key={e.id}
                  onClick={() => onOpenEvent(e.id)}
                  className={`absolute h-6 rounded-md px-2 text-[12px] font-medium text-left truncate z-20 transition hover:ring-2 hover:ring-neutral-900/20 ${
                    ended ? "bg-neutral-200 text-neutral-600" : "bg-neutral-900 text-white"}`}
                  style={{ left: `${left}%`, width: `max(${right - left}%, ${BAR_MIN_PX}px)`, top: 8 + e.lane * 32 }}
                  title={`${e.name} · ${e.start}${e.end && e.end !== e.start ? ` → ${e.end}` : ""}`}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {undatedCount > 0 && (
        <p className="text-[12px] text-neutral-500 mt-2">
          {en ? `${undatedCount} campaign(s) have no dates yet and aren't on the timeline.` : `${undatedCount} 檔活動還沒排日期，所以不在時間軸上。`}
        </p>
      )}

      <NodeModal
        dialog={dialog}
        brandId={brandId}
        en={en}
        onClose={() => setDialog(null)}
        onSaved={() => { refresh(); setDialog(null); }}
        onEdit={(node) => setDialog({ mode: "edit", node })}
        onPlan={(n) => { setDialog(null); onPlanFromNode({ name: nameOf(n), startAt: n.date, endAt: n.endDate }); }}
        onHide={(n) => { setDialog(null); hideMut.mutate({ brandId, builtinKey: n.builtinKey }); }}
        onRemove={(n) => {
          if (!window.confirm(en ? `Delete "${nameOf(n)}"${n.recurring ? " (every year)" : ""}?` : `確定刪除「${nameOf(n)}」${n.recurring ? "（每一年的都會刪掉）" : ""}？`)) return;
          setDialog(null); removeMut.mutate({ id: n.id });
        }}
      />
    </section>
  );
}

function fmtLong(s: string, en: boolean) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(en ? "en-US" : "zh-TW", { year: "numeric", month: "short", day: "numeric", weekday: "short" });
}

/** 圓形圖示鈕——任務卡視窗裡次要動作的樣子。 */
function RoundIcon({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Tooltip content={label}>
      <button type="button" onClick={onPress} aria-label={label}
        className="w-9 h-9 rounded-full bg-white text-neutral-700 ring-1 ring-default-200 hover:ring-default-400 flex items-center justify-center transition">
        {children}
      </button>
    </Tooltip>
  );
}

function NodeModal({ dialog, brandId, en, onClose, onSaved, onEdit, onPlan, onHide, onRemove }: {
  dialog: NodeDialog | null;
  brandId: number;
  en: boolean;
  onClose: () => void;
  onSaved: () => void;
  onEdit: (n: CalendarNode) => void;
  onPlan: (n: CalendarNode) => void;
  onHide: (n: CalendarNode) => void;
  onRemove: (n: CalendarNode) => void;
}) {
  const node = dialog?.node ?? null;
  const name = node ? (en ? node.nameEn : node.nameZh) : "";
  const headerTitle = dialog?.mode === "edit"
    ? (node ? (en ? "Edit date" : "編輯節點") : (en ? "New date" : "新增節點"))
    : name;

  return (
    <Modal isOpen={!!dialog} onClose={onClose} size="lg" scrollBehavior="inside" backdrop="blur" classNames={TASK_MODAL_CLASSNAMES}>
      <ModalContent>
        {dialog && (
          <>
            <ModalHeader className={TASK_MODAL_HEADER}>
              <div className="flex items-center gap-2.5 min-w-0">
                <FlagIcon size={16} className="text-neutral-900 shrink-0" />
                <p className="text-[15px] text-neutral-900 truncate font-semibold">{headerTitle}</p>
              </div>
            </ModalHeader>
            {dialog.mode === "view" && node
              ? <NodeView node={node} en={en} onPlan={onPlan} onEdit={onEdit} onHide={onHide} onRemove={onRemove} />
              : <NodeForm key={node?.key ?? "new"} node={node} brandId={brandId} en={en} onSaved={onSaved} />}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

function NodeView({ node, en, onPlan, onEdit, onHide, onRemove }: {
  node: CalendarNode; en: boolean;
  onPlan: (n: CalendarNode) => void; onEdit: (n: CalendarNode) => void;
  onHide: (n: CalendarNode) => void; onRemove: (n: CalendarNode) => void;
}) {
  const name = en ? node.nameEn : node.nameZh;
  const custom = node.source === "custom";
  return (
    <>
      <ModalBody>
        <div className="flex items-center gap-4 pt-3 pb-1">
          <div className="shrink-0"><EmptyIllustration kind="event" width={104} /></div>
          <div className="min-w-0">
            <h2 className={TASK_MODAL_QUESTION}>{en ? `Run a campaign for ${name}?` : `${name}，要做一檔嗎？`}</h2>
            <p className="text-[13px] text-neutral-500 mt-1">
              {fmtLong(node.date, en)}{node.endDate && node.endDate !== node.date ? ` → ${fmtLong(node.endDate, en)}` : ""}
              {node.recurring && <span className="ml-1.5 text-neutral-400">· {en ? "every year" : "每年"}</span>}
            </p>
          </div>
        </div>
        {node.note && (
          <p className="rounded-xl bg-default-100 px-3 py-2 text-[13px] text-default-700 flex gap-2">
            <CommentIcon size={11} className="mt-[3px] text-default-400 shrink-0" />{node.note}
          </p>
        )}
        <p className="text-[12px] text-neutral-400">
          {en
            ? "A date is only a marker. Starting a plan creates the campaign and opens its promotion plan."
            : "節點只是記號；按「開始企劃」才會建立活動，並進到宣傳企劃。"}
        </p>
      </ModalBody>
      <ModalFooter className="justify-between items-center">
        <div className="flex items-center gap-1.5">
          {custom ? (
            <>
              <RoundIcon label={en ? "Edit" : "編輯"} onPress={() => onEdit(node)}><EditIcon size={13} /></RoundIcon>
              <RoundIcon label={en ? "Delete" : "刪除"} onPress={() => onRemove(node)}><DeleteIcon size={13} /></RoundIcon>
            </>
          ) : (
            <Tooltip content={en ? "Not relevant to this brand — hide it every year" : "跟這個品牌無關——每年都不再顯示"}>
              <button type="button" onClick={() => onHide(node)} className="text-[13px] text-neutral-500 hover:text-neutral-900 px-1">
                {en ? "Hide" : "隱藏"}
              </button>
            </Tooltip>
          )}
        </div>
        <Button radius="full" className="bg-neutral-900 text-white h-11 px-6 font-semibold" onPress={() => onPlan(node)}>
          {en ? "Start a plan" : "開始企劃"}
        </Button>
      </ModalFooter>
    </>
  );
}

function NodeForm({ node, brandId, en, onSaved }: { node: CalendarNode | null; brandId: number; en: boolean; onSaved: () => void }) {
  const [name, setName] = useState(node?.nameZh ?? "");
  const [start, setStart] = useState(node?.date ?? "");
  const [end, setEnd] = useState(node?.endDate ?? "");
  const [recurring, setRecurring] = useState(node?.recurring ?? true);
  const [note, setNote] = useState(node?.note ?? "");
  const [showNote, setShowNote] = useState(!!node?.note);
  const [err, setErr] = useState<string | null>(null);
  const addMut = (trpc as any).eventCalendar.addNode.useMutation();
  const updMut = (trpc as any).eventCalendar.updateNode.useMutation();
  const busy = addMut.isPending || updMut.isPending;

  const save = async () => {
    if (!name.trim()) { setErr(en ? "Give it a name" : "取個名字"); return; }
    if (!start) { setErr(en ? "Pick a date" : "選一天"); return; }
    if (end && end < start) { setErr(en ? "End date is before the start" : "結束日早於開始日"); return; }
    setErr(null);
    const payload = { name: name.trim(), startDate: start, endDate: end || null, recurring, note: note.trim() || null };
    try {
      // 每年重複的節點，編輯時存回原本那筆的日期列（年份跟著這次選的走，展開時只看月日）
      if (node?.id) await updMut.mutateAsync({ id: node.id, ...payload });
      else await addMut.mutateAsync({ brandId, ...payload });
      onSaved();
    } catch (e: any) {
      setErr(nodeErrorText(e, en));
    }
  };

  return (
    <>
      <ModalBody>
        <div className="flex items-center gap-4 pt-3 pb-1">
          <div className="shrink-0"><EmptyIllustration kind="event" width={104} /></div>
          <h2 className={TASK_MODAL_QUESTION}>{en ? "Which date is worth a campaign?" : "哪一天值得做一檔？"}</h2>
        </div>
        <div className="relative">
          <Input
            value={name} onValueChange={(v) => { setName(v); if (err) setErr(null); }}
            placeholder={en ? "e.g. Anniversary sale, Back to school, New collection" : "例：週年慶、開學季、新品上市"}
            maxLength={60} autoFocus
            classNames={{ ...TASK_MODAL_INPUT, inputWrapper: `${TASK_MODAL_INPUT.inputWrapper} pr-14` }}
          />
          <div className="absolute right-2 top-1.5 z-10">
            <Tooltip content={en ? "Add a note (optional)" : "補充備註（選填）"}>
              <button type="button" onClick={() => setShowNote((v) => !v)} aria-pressed={showNote}
                aria-label={en ? "Add a note" : "補充備註"}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition ${showNote ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 ring-1 ring-default-200 hover:ring-default-400"}`}>
                <AddIcon size={13} />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input type="date" value={start} onValueChange={setStart} label={en ? "Date" : "日期"} labelPlacement="outside" placeholder=" "
            classNames={{ inputWrapper: "rounded-2xl h-12" }} />
          <Input type="date" value={end} onValueChange={setEnd} label={en ? "Ends (optional)" : "結束（選填）"} labelPlacement="outside" placeholder=" "
            classNames={{ inputWrapper: "rounded-2xl h-12" }} />
        </div>
        {showNote && (
          <Textarea value={note} onValueChange={setNote} minRows={2} maxLength={300}
            placeholder={en ? "Why this date matters, what you did last year…" : "為什麼這天重要、去年做了什麼……"}
            classNames={{ inputWrapper: "rounded-2xl px-4 pt-3", input: "text-[14px]" }} />
        )}
        <Checkbox isSelected={recurring} onValueChange={setRecurring} size="sm" classNames={{ label: "text-[13px] text-neutral-700" }}>
          {en ? "Every year on this date" : "每年這天都提醒"}
        </Checkbox>
        {err && <p className="text-tiny text-danger-500">{err}</p>}
      </ModalBody>
      <ModalFooter className="justify-end">
        <Button radius="full" className="bg-neutral-900 text-white h-11 px-6 font-semibold" onPress={save} isLoading={busy}>
          {node ? (en ? "Save" : "儲存") : (en ? "Add to timeline" : "放上時間軸")}
        </Button>
      </ModalFooter>
    </>
  );
}
