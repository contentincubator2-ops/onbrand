/**
 * CampaignMap — 策略層活動頁右半邊：整檔的策略地圖，點某一段就放大到那一段。
 *
 * 2026-09-30（CJ「按下總覽後，右邊會按照階段時間，所使用的管道，列出總覽，當你要看
 * 加溫期的時候，右邊才會 ZOOM IN 到加溫期的傳播管道和訊息和內容安排」）。
 *
 *   · 總覽：橫的是階段、直的是通路，點是一篇；每段上方是那一段的訊息。
 *     2026-10-01（CJ 問「點點之間很多線連在一起，代表什麼」→ 同意拿掉）：原本有一條把每一篇
 *     依日期串起來的「發文順序」線，通路一多就變成上下亂跳、看不出意思。改成：點在階段裡照日期
 *     排（不是平均分散），加一條「今天」直線；過去的點淡掉，下方摘要顯示「下一篇」。
 *   · 放大：地圖往那一段放大後淡出，疊上那一段的目的、訊息，以及每個通路排了哪幾篇。
 *     還沒定稿時，每一篇的「要講什麼」、日期、做不做都在這裡改。
 *
 * 顏色照設計系統：只有中性色，success 只給「已寫」。
 *
 * 2026-10-02（CJ「右邊的任務點點，滑過去的時候只是一段文字，可以改成縮圖嗎」）：
 * 滑過（或鍵盤移到）一個點就浮出那一篇的縮圖卡——寫好的用成品的圖與開頭幾句，
 * 還沒寫的用那張任務卡的插畫＋要講什麼。點一下放大到那一段。
 *
 * 2026-10-02（CJ「看到這些文章，想要真實產出」→ 定案「點了再寫，一篇一篇看和觸發」）：
 * 放大後每一篇有「寫這篇」（任務視窗直接開寫）／「打開這篇」（CampaignPostModal：
 * 改字、定稿或送審、標記已發布）。左邊的線與標籤是這一篇走到哪一關
 * （lib/campaignPostStatus.ts）；段落標題旁是「幾篇已完成」（核准＋發布）。
 *
 * 2026-10-05（CJ「在某通路欄位底下，自己在該日期按+」）：放大後每個通路欄位底下有
 * 「＋ 新增一篇」——自己選日期、選那個通路的任務卡、寫這一篇要講什麼，不用經過對話。
 * 驗證在伺服器（campaign.draftItem），日期範圍見 campaignStage.addDateRange。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faEllipsis, faPenNib, faPlus } from "@fortawesome/free-solid-svg-icons";
import { CHANNEL_META, channelLabel } from "../../../platform/lib/channelMeta";
import { phaseOf, type CampaignPhaseId, type CampaignPlanItem } from "../../../strategy/lib/campaign/campaignSchema";
import { phaseShort, addDateRange, type StagePhase } from "../../../strategy/lib/campaign/campaignStage";
import { money, metricLine, PAID_CHANNELS, type PhaseKpi } from "../../../strategy/lib/campaign/campaignKpi";
import { TaskIllustration } from "../../../platform/components/TaskIllustration";
import { isPostDone, postStateBorder, postStateChip, postStateLabel, postStateOf } from "../../../strategy/lib/campaign/campaignPostStatus";
import { tierLabel } from "../../../platform/lib/tierVocabulary";

/** 寫好的那一篇的縮圖＋走到哪一關（campaign.itemThumbs）。 */
export interface ItemThumb {
  image: string | null; title: string; excerpt: string;
  outputId?: number; missionId?: number;
  /** 伺服器算的狀態（server/content/core/campaign/campaignPostStatus.ts）。 */
  state?: string;
  reviewNote?: string | null;
  publishedUrl?: string | null;
  /** 送給誰審。 */
  reviewerName?: string | null;
  /** 排進行事曆的那一筆（還沒發布的）。 */
  schedule?: { id: number; at: string } | null;
}

/** 手動加一篇要用的選單（campaign.addOptions）：可以排的日期範圍＋每個通路能選的任務卡。 */
export interface AddOptions {
  window: { from: string; to: string };
  cards: Record<string, Array<{ id: string; labelZh: string; labelEn: string; tier: string }>>;
}
/** 手動加的那一篇（還沒有 id；伺服器驗證後才變成企劃裡的一格）。 */
export interface NewItemInput { phase: CampaignPhaseId; date: string; platform: string; taskId: string; angle: string }

const md = (s: string) => s.slice(5).replace("-", "/");
const DAY = 86_400_000;
const dayNo = (s: string) => Math.round(new Date(`${s}T00:00:00Z`).getTime() / DAY);
const todayYmd = () => new Date().toISOString().slice(0, 10);
const range = (p: StagePhase) => (p.from === p.to ? md(p.from) : `${md(p.from)} – ${md(p.to)}`);

/** 量容器大小——地圖的點與線要用同一套座標。 */
function useSize(ref: React.RefObject<HTMLDivElement | null>): { w: number; h: number } {
  const [s, setS] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setS({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ref]);
  return s;
}

export default function CampaignMap({
  items, phases, lanes, phaseMessages, current, onPick, locked, en, onPatchItem, fill, phaseKpi = {}, thumbs = {}, onOpenItem,
  addOptions, onAddItem,
}: {
  items: CampaignPlanItem[];
  phases: StagePhase[];
  lanes: string[];
  phaseMessages: Partial<Record<CampaignPhaseId, string>>;
  current: CampaignPhaseId | null;
  onPick: (p: CampaignPhaseId | null) => void;
  locked: boolean;
  en: boolean;
  onPatchItem: (id: string, next: Partial<CampaignPlanItem>) => void;
  /** 撐滿父層的高度（活動頁右欄）；通路之間的距離跟著拉開。 */
  fill?: boolean;
  /** 每一段的預算與 KPI（有設定才顯示）。 */
  phaseKpi?: Partial<Record<CampaignPhaseId, PhaseKpi>>;
  /** 寫好的那幾篇的圖與開頭（itemId → 縮圖）。 */
  thumbs?: Record<string, ItemThumb>;
  /** 寫這篇（還沒寫）／打開這篇（寫好了）。沒給就不出現按鈕。 */
  onOpenItem?: (item: CampaignPlanItem) => void;
  /** 手動加一篇：選單與送出。兩個都給才會出現「＋ 新增一篇」。失敗就 throw，表單會顯示原因。 */
  addOptions?: AddOptions | null;
  onAddItem?: (input: NewItemInput) => Promise<void>;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = React.useState<string | null>(null);
  const { w: W, h: boxH } = useSize(boxRef);

  const G = W < 520 ? 44 : 112;                 // 左邊通路名稱那一欄
  const hasKpi = Object.keys(phaseKpi).length > 0;
  const HEAD = hasKpi ? 150 : 112;             // 每段上方的標題區（有 KPI 時多兩行）
  const baseLane = lanes.length <= 3 ? 92 : lanes.length <= 5 ? 72 : 60;
  const laneH = fill && boxH > 0 && lanes.length
    ? Math.max(baseLane, Math.min(150, (boxH - HEAD - 84) / lanes.length))
    : baseLane;
  const H = Math.max(420, HEAD + lanes.length * laneH + 84);
  const n = Math.max(1, phases.length);
  const BW = W > 0 ? (W - G - 16) / n : 0;

  const live = items.filter((i) => i.enabled);
  // 某一天在地圖上的 x：落在哪一段，就照那一段的起訖日期按比例放（兩邊留一點邊）。
  const pad = Math.min(18, BW * 0.12);
  const xOfDate = (pi: number, date: string): number => {
    const p = phases[pi]!;
    const span = Math.max(1, dayNo(p.to) - dayNo(p.from));
    const t = Math.min(1, Math.max(0, (dayNo(date) - dayNo(p.from)) / span));
    return G + pi * BW + pad + (BW - 2 * pad) * (phases[pi]!.from === phases[pi]!.to ? 0.5 : t);
  };
  const placed = new Map<string, number>();
  const pins = live.map((it) => {
    const pi = phases.findIndex((p) => p.id === it.phase);
    const li = lanes.indexOf(it.platform);
    if (pi < 0 || li < 0) return null;
    // 同一條通路同一天有好幾篇：往右錯開一點，不疊在一起。
    const key = `${li}|${it.date}`;
    const k = placed.get(key) ?? 0;
    placed.set(key, k + 1);
    return { it, x: xOfDate(pi, it.date) + k * 12, y: HEAD + li * laneH + laneH / 2 };
  }).filter((p): p is { it: CampaignPlanItem; x: number; y: number } => !!p);
  // 日期標籤：同一條通路上離前一個標籤太近就不重複寫（滑過點看得到日期）。
  const showDate = new Set<string>();
  for (const li of lanes.map((_, j) => j)) {
    let lastX = -Infinity;
    for (const p of pins.filter((q) => q.y === HEAD + li * laneH + laneH / 2).sort((a, b) => a.x - b.x)) {
      if (p.x - lastX >= 34) { showDate.add(p.it.id); lastX = p.x; }
    }
  }

  // 「今天」：落在某一段裡就照日期放；落在兩段之間就放在交界；整檔前後不畫，改在摘要說。
  const today = todayYmd();
  let todayX: number | null = null;
  if (phases.length && today >= phases[0]!.from && today <= phases[phases.length - 1]!.to) {
    const pi = phases.findIndex((p) => today >= p.from && today <= p.to);
    if (pi >= 0) todayX = xOfDate(pi, today);
    else {
      const next = phases.findIndex((p) => p.from > today);
      todayX = G + Math.max(0, next) * BW;
    }
  }
  const upcoming = [...live].filter((i) => i.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const daysToFirst = phases.length && today < phases[0]!.from ? dayNo(phases[0]!.from) - dayNo(today) : null;

  const ci = current ? phases.findIndex((p) => p.id === current) : -1;
  const cx = ci >= 0 ? G + (ci + 0.5) * BW : W / 2;
  const cy = HEAD + (lanes.length * laneH) / 2;

  return (
    <div ref={boxRef} className={`relative w-full overflow-hidden bg-default-100 ${fill ? "h-full" : ""}`} style={fill ? { minHeight: H } : { height: H }}>

      {/* ── 總覽地圖（放大時整層往那一段放大、淡出） ── */}
      <div
        className="absolute inset-0 transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: ci >= 0 ? `translateX(${W / 2 - cx}px) scale(2.2)` : "none",
          opacity: ci >= 0 ? 0.14 : 1,
          pointerEvents: ci >= 0 ? "none" : "auto",
        }}
        aria-hidden={ci >= 0}
      >
        {W > 0 && phases.map((p, i) => (
          <div key={p.id} className={`absolute rounded-2xl ${i % 2 ? "bg-default-200/50" : "bg-default-50/70"}`}
            style={{ left: G + i * BW + 3, top: 8, width: BW - 6, height: HEAD + lanes.length * laneH }} />
        ))}
        {W > 0 && lanes.map((c, j) => (
          <React.Fragment key={c}>
            <div className="absolute rounded-full bg-default-200" style={{ left: G, right: 16, top: HEAD + j * laneH + laneH / 2 - 6, height: 12 }} />
            <div className="absolute flex items-center gap-2 text-tiny text-default-600" style={{ left: 12, top: HEAD + j * laneH + laneH / 2 - 13, width: G - 16 }}>
              <span className="w-[26px] h-[26px] shrink-0 rounded-lg bg-content1 shadow-sm grid place-items-center">
                <FontAwesomeIcon icon={CHANNEL_META[c]?.icon ?? faPenNib} className="text-tiny" />
              </span>
              {G > 60 && <span className="truncate">{channelLabel(c, en)}</span>}
            </div>
          </React.Fragment>
        ))}
        {W > 0 && todayX != null && (
          <>
            <div className="absolute w-0.5 bg-foreground/70 rounded-full" style={{ left: todayX - 1, top: HEAD - 6, height: lanes.length * laneH + 12 }} aria-hidden />
            <span className="absolute -translate-x-1/2 text-[10.5px] font-semibold bg-foreground text-background rounded px-1.5 py-0.5"
              style={{ left: todayX, top: HEAD + lanes.length * laneH + 8 }}>{L("今天", "Today")} {md(today)}</span>
          </>
        )}
        {W > 0 && pins.map(({ it, x, y }) => {
          const past = it.date < today && !it.outputId;
          return (
            <React.Fragment key={it.id}>
              {/* 點本身小，感應區放大到 28px，滑鼠不用瞄準；滑過去看縮圖（PinThumb）。 */}
              <button type="button"
                className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground z-[1]"
                style={{ left: x, top: y }}
                aria-label={`${md(it.date)} ${channelLabel(it.platform, en)}${it.paid ? `・${L("廣告", "Ad")}` : ""}：${it.angle}`}
                onMouseEnter={() => setHover(it.id)} onMouseLeave={() => setHover((h) => (h === it.id ? null : h))}
                onFocus={() => setHover(it.id)} onBlur={() => setHover((h) => (h === it.id ? null : h))}
                onClick={() => { setHover(null); onPick(it.phase); }}>
                <span className={`block w-3.5 h-3.5 border-[3px] transition-transform ${hover === it.id ? "scale-150" : ""} ${it.paid ? "rounded-[3px]" : "rounded-full"} ${it.outputId ? (isPostDone(postStateOf(it.outputId, thumbs[it.id]?.state)) ? "bg-success border-success" : "bg-content1 border-success") : it.paid ? "bg-foreground border-foreground" : "bg-content1 border-foreground"} ${past && hover !== it.id ? "opacity-35" : ""}`} />
              </button>
              {showDate.has(it.id) && (
                <span className={`absolute -translate-x-1/2 text-[10.5px] tabular-nums text-default-600 bg-content1/85 rounded px-1 ${past ? "opacity-50" : ""}`}
                  style={{ left: x, top: y + 10 }}>{md(it.date)}</span>
              )}
            </React.Fragment>
          );
        })}
        {W > 0 && phases.map((p, i) => {
          return (
            <button key={p.id} type="button" onClick={() => onPick(p.id)}
              className="absolute text-left rounded-xl px-2 py-1.5 hover:bg-content1/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground transition flex flex-col gap-0.5"
              style={{ left: G + i * BW + 6, top: 14, width: BW - 12 }}
              aria-label={L(`放大${phaseShort(p.id, false)}`, `Zoom into ${phaseShort(p.id, true)}`)}>
              <span className="text-small font-semibold">{phaseShort(p.id, en)}</span>
              <span className="text-[11px] text-default-500 tabular-nums">{range(p)}</span>
              {phaseMessages[p.id] && BW > 90 && (
                <span className={`text-[11.5px] leading-snug text-default-700 ${hasKpi ? "line-clamp-2" : "line-clamp-3"}`}>{phaseMessages[p.id]}</span>
              )}
              {phaseKpi[p.id] && (
                <span className="text-[11px] leading-snug text-default-600 tabular-nums">
                  <b className="font-semibold text-foreground">{money(phaseKpi[p.id]!.budget, en)}</b>{phaseKpi[p.id]!.budget != null ? "・" : ""}{phaseKpi[p.id]!.share}%
                  {phaseKpi[p.id]!.metrics[0] && BW > 90 && <span className="block truncate">{metricLine(phaseKpi[p.id]!.metrics[0]!, en)}</span>}
                </span>
              )}
            </button>
          );
        })}
        <div className="absolute left-4 bottom-4 bg-content1 rounded-2xl shadow-small px-4 py-2.5 flex items-center gap-6">
          {[
            [String(live.length), L("篇", "posts")],
            [String(new Set(live.map((i) => i.platform)).size), L("個通路", "channels")],
            daysToFirst != null
              ? [String(daysToFirst), L("天後第一篇", "days to first post")]
              : upcoming
                ? [md(upcoming.date), L(`下一篇・${channelLabel(upcoming.platform, false)}`, `next · ${channelLabel(upcoming.platform, true)}`)]
                : ["—", L("都過了", "all done")],
          ].map(([v, k]) => (
            <div key={k}><b className="block text-medium font-black leading-tight tabular-nums">{v}</b><span className="text-[11px] text-default-500">{k}</span></div>
          ))}
        </div>
      </div>

      {/* ── 滑過一個點：那一篇的縮圖 ── */}
      {ci < 0 && hover && (() => {
        const pin = pins.find((p) => p.it.id === hover);
        if (!pin) return null;
        const CW = 240;
        const boxHeight = Math.max(H, boxH);
        const left = Math.max(8, Math.min(W - CW - 8, pin.x - CW / 2));
        const below = pin.y + 20 + 270 < boxHeight;
        return (
          <PinThumb
            item={pin.it} thumb={thumbs[pin.it.id] ?? null} en={en}
            style={below ? { left, top: pin.y + 18 } : { left, bottom: boxHeight - pin.y + 18 }}
          />
        );
      })()}

      {/* ── 放大：這一段的通路、訊息與內容安排 ── */}
      {ci >= 0 && (
        <PhaseDetail
          phase={phases[ci]!} message={phaseMessages[phases[ci]!.id] ?? ""}
          items={items.filter((i) => i.phase === phases[ci]!.id)} lanes={lanes}
          locked={locked} en={en} onBack={() => onPick(null)} onPatchItem={onPatchItem}
          kpi={phaseKpi[phases[ci]!.id] ?? null} thumbs={thumbs} onOpenItem={onOpenItem}
          addCards={addOptions?.cards} onAddItem={onAddItem}
          addRange={addOptions ? addDateRange(phases, phases[ci]!.id, addOptions.window) : null}
        />
      )}
    </div>
  );
}

/** 地圖上一個點的縮圖卡：像一則縮小的貼文——上面是圖，下面是這一篇要講什麼。 */
function PinThumb({ item, thumb, en, style }: { item: CampaignPlanItem; thumb: ItemThumb | null; en: boolean; style: React.CSSProperties }) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const [broken, setBroken] = React.useState(false);
  const img = thumb?.image && !broken ? thumb.image : null;
  return (
    <div role="tooltip" style={style}
      className="absolute z-20 w-[240px] bg-content1 rounded-2xl shadow-large overflow-hidden pointer-events-none animate-[pinIn_.16s_ease-out] motion-reduce:animate-none">
      <style>{"@keyframes pinIn{from{opacity:0;transform:translateY(4px) scale(.98)}to{opacity:1;transform:none}}"}</style>
      <div className="relative h-[136px] bg-default-100 grid place-items-center overflow-hidden">
        {img
          ? <img src={img} alt="" className="w-full h-full object-cover" onError={() => setBroken(true)} />
          : <TaskIllustration card={{ id: item.taskId, label: item.taskLabel }} width={176} />}
        <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-content1/90 px-2 py-0.5 text-[11px] font-medium shadow-small">
          <FontAwesomeIcon icon={CHANNEL_META[item.platform]?.icon ?? faPenNib} className="text-[10px]" />
          {channelLabel(item.platform, en)}
        </span>
        <span className="absolute right-2 top-2 flex gap-1">
          {item.paid && <span className="rounded-full bg-foreground text-background px-2 py-0.5 text-[10.5px]">{L("廣告", "Ad")}</span>}
          {(() => {
            const st = postStateOf(item.outputId, thumb?.state);
            const c = postStateChip(st);
            return (
              <Chip size="sm" color={c.color} variant={c.variant} className={`h-5 text-[10.5px] ${c.variant === "bordered" ? "bg-content1/90" : ""}`}>
                {postStateLabel(st, en)}
              </Chip>
            );
          })()}
        </span>
      </div>
      <div className="px-3 py-2.5 flex flex-col gap-1">
        <p className="text-[11px] text-default-500 tabular-nums truncate">{md(item.date)}・{phaseShort(item.phase, en)}・{item.taskLabel}</p>
        <p className="text-small font-semibold leading-snug line-clamp-3">{item.angle}</p>
        {thumb?.excerpt
          ? <p className="text-tiny text-default-500 leading-snug line-clamp-2">{thumb.excerpt}</p>
          : item.outputId ? null : <p className="text-[11px] text-default-400">{L("點一下看這一段，再按「寫這篇」", "Click to open this phase, then write it")}</p>}
        {item.partner && <p className="text-[11px] text-default-500 truncate">{L("給：", "For: ")}{item.partner}</p>}
      </div>
    </div>
  );
}

/** 通路欄位底下的「＋ 新增一篇」：日期、任務卡、這一篇要講什麼。 */
function AddItemForm({ phase, platform, cards, range, en, onAdd }: {
  phase: StagePhase; platform: string; cards: AddOptions["cards"][string];
  range: { min: string; max: string }; en: boolean;
  onAdd: (input: NewItemInput) => Promise<void>;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const firstDate = phase.from < range.min ? range.min : phase.from > range.max ? range.max : phase.from;
  const firstCard = (cards.find((c) => c.tier === "30s") ?? cards[0])!.id;
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(firstDate);
  const [taskId, setTaskId] = React.useState(firstCard);
  const [angle, setAngle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const name = channelLabel(platform, en);

  if (!open) {
    return (
      <button type="button" onClick={() => { setDate(firstDate); setTaskId(firstCard); setAngle(""); setErr(""); setOpen(true); }}
        className="mt-auto flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-divider py-2 text-tiny text-default-500 hover:text-foreground hover:border-default-400">
        <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
        {L("新增一篇", "Add a post")}
      </button>
    );
  }
  const dateOk = date >= range.min && date <= range.max;
  const ready = dateOk && angle.trim().length >= 4 && !busy;
  const submit = async () => {
    if (!ready) return;
    setBusy(true); setErr("");
    try {
      await onAdd({ phase: phase.id, date, platform, taskId, angle: angle.trim() });
      setOpen(false);
    } catch (e: any) {
      setErr(e?.message || L("加不進去，請再試一次", "Couldn't add it — try again"));
    } finally { setBusy(false); }
  };
  // 單篇／套組：用戶可見文案不寫 30s／60s。
  const groups: Array<[string, typeof cards]> = [
    [tierLabel("30s", en ? "en" : "zh"), cards.filter((c) => c.tier === "30s")],
    [tierLabel("60s", en ? "en" : "zh"), cards.filter((c) => c.tier !== "30s")],
  ];
  return (
    <div className="mt-auto flex flex-col gap-2 rounded-xl border border-divider p-2.5">
      <p className="text-tiny font-semibold">{L(`新增一篇 ${name}`, `New ${name} post`)}</p>
      <Input type="date" size="sm" variant="bordered" radius="md" aria-label={L("日期", "Date")}
        min={range.min} max={range.max} value={date} onValueChange={setDate}
        isInvalid={!dateOk} errorMessage={L(`要在 ${md(range.min)}–${md(range.max)} 之間`, `Pick ${md(range.min)}–${md(range.max)}`)} />
      <select value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label={L("任務卡", "Task card")}
        className="h-8 w-full min-w-0 rounded-lg border-2 border-default-200 bg-transparent px-2 text-small outline-none focus:border-foreground">
        {groups.filter(([, list]) => list.length).map(([label, list]) => (
          <optgroup key={label} label={label}>
            {list.map((c) => <option key={c.id} value={c.id}>{en ? c.labelEn : c.labelZh}</option>)}
          </optgroup>
        ))}
      </select>
      <textarea value={angle} rows={2} autoFocus maxLength={200}
        style={{ fieldSizing: "content" } as React.CSSProperties}
        onChange={(e) => setAngle(e.target.value)}
        placeholder={L("這一篇要講什麼（至少 4 個字）", "What this post says")}
        aria-label={L("這一篇要講什麼", "What this post says")}
        className="text-small leading-relaxed rounded-lg border-2 border-default-200 bg-transparent px-2 py-1.5 resize-none outline-none focus:border-foreground" />
      {err && <p className="text-tiny text-danger">{err}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" radius="full" className="h-7 bg-foreground text-background" isDisabled={!ready} isLoading={busy} onPress={submit}>
          {L("加入企劃", "Add")}
        </Button>
        <Button size="sm" radius="full" variant="light" className="h-7" isDisabled={busy} onPress={() => setOpen(false)}>
          {L("取消", "Cancel")}
        </Button>
      </div>
    </div>
  );
}

function PhaseDetail({ phase, message, items, lanes, locked, en, onBack, onPatchItem, kpi, thumbs, onOpenItem, addCards, addRange, onAddItem }: {
  phase: StagePhase; message: string; items: CampaignPlanItem[]; lanes: string[];
  locked: boolean; en: boolean; onBack: () => void;
  onPatchItem: (id: string, next: Partial<CampaignPlanItem>) => void;
  kpi: PhaseKpi | null;
  thumbs: Record<string, ItemThumb>;
  onOpenItem?: (item: CampaignPlanItem) => void;
  addCards?: AddOptions["cards"];
  /** 這一段可以加的日期；null＝這一段已經過了，不出現「＋」。 */
  addRange?: { min: string; max: string } | null;
  onAddItem?: (input: NewItemInput) => Promise<void>;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const [open, setOpen] = React.useState<string | null>(null);
  const spec = phaseOf(phase.id);
  const stateOf = (i: CampaignPlanItem) => postStateOf(i.outputId, thumbs[i.id]?.state);
  const enabled = items.filter((i) => i.enabled);
  const doneCount = enabled.filter((i) => isPostDone(stateOf(i))).length;
  return (
    <div className="absolute inset-0 p-4 flex flex-col gap-3 overflow-y-auto animate-[fadeIn_.35s_ease_.25s_both] motion-reduce:animate-none">
      <style>{"@keyframes fadeIn{from{opacity:0}to{opacity:1}}"}</style>
      <Button size="sm" radius="md" variant="flat" className="self-start bg-content1 shadow-small"
        startContent={<FontAwesomeIcon icon={faArrowLeft} className="text-tiny" />} onPress={onBack}>
        {L("回總覽", "Overview")}
      </Button>
      <div className="bg-content1 rounded-2xl shadow-small px-4 py-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1">
        <div className="row-span-2">
          <p className="text-2xl font-black leading-tight">{en ? phaseShort(phase.id, true) : `${phaseShort(phase.id, false)}期`}</p>
          <p className="text-tiny text-default-500 tabular-nums">{range(phase)}</p>
          {enabled.length > 0 && (
            <p className="text-tiny text-default-600 tabular-nums mt-0.5">{L(`${doneCount}／${enabled.length} 已完成`, `${doneCount}/${enabled.length} done`)}</p>
          )}
        </div>
        <p className="text-small text-default-600">{spec?.purposeZh}</p>
        {message
          ? <p className="text-medium font-bold"><span className="text-tiny font-normal text-default-500 mr-2">{L("這一段的訊息", "Message")}</span>{message}</p>
          : <p className="text-tiny text-default-400">{L("這份企劃還沒有這一段的訊息，重排一次就會補上。", "No message for this phase yet — re-plan to add one.")}</p>}
        {kpi && (
          <div className="col-start-2 flex items-center gap-2 flex-wrap pt-1">
            <Chip size="sm" variant="flat" className="tabular-nums">{L("預算 ", "Budget ")}{money(kpi.budget, en)}（{kpi.share}%）</Chip>
            {kpi.metrics.map((m) => <Chip key={m.metric} size="sm" variant="bordered" className="tabular-nums">{metricLine(m, en)}</Chip>)}
            {kpi.note && <span className="text-tiny text-default-500">{kpi.note}</span>}
          </div>
        )}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        {lanes.map((c) => {
          const list = items.filter((i) => i.platform === c).sort((a, b) => (a.date < b.date ? -1 : 1));
          const on = list.filter((i) => i.enabled);
          return (
            <div key={c} className="bg-content1 rounded-2xl shadow-small p-3 flex flex-col gap-3 min-w-0">
              <p className="text-small font-semibold flex items-center gap-2">
                <FontAwesomeIcon icon={CHANNEL_META[c]?.icon ?? faPenNib} />
                {channelLabel(c, en)}
                <span className="ml-auto text-tiny font-normal text-default-500">{L(`${on.length} 篇`, `${on.length}`)}</span>
              </p>
              {!list.length && (
                <p className="text-tiny text-default-500 border border-dashed border-divider rounded-xl p-3">
                  {L(`這一段沒有排 ${channelLabel(c, en)}。`, `No ${channelLabel(c, en)} posts in this phase.`)}
                </p>
              )}
              {list.map((i) => (
                <div key={i.id} className={`border-l-[3px] pl-2.5 flex flex-col gap-1 ${postStateBorder(stateOf(i))} ${i.enabled ? "" : "opacity-45"}`}>
                  <div className="flex items-center gap-2 text-tiny">
                    <b className="tabular-nums">{md(i.date)}</b>
                    <Chip size="sm" variant="flat" className="h-5 text-[10.5px] max-w-[70%]" title={i.taskLabel}>{i.taskLabel}</Chip>
                    {i.paid && <Chip size="sm" className="h-5 text-[10.5px] bg-foreground text-background">{L("廣告", "Ad")}</Chip>}
                    {!locked && (
                      <button type="button" className="ml-auto text-default-400 hover:text-foreground px-1"
                        aria-label={L("更多", "More")} onClick={() => setOpen(open === i.id ? null : i.id)}>
                        <FontAwesomeIcon icon={faEllipsis} />
                      </button>
                    )}
                  </div>
                  {locked ? (
                    <p className="text-small leading-relaxed">{i.angle}</p>
                  ) : (
                    <textarea
                      value={i.angle} rows={3}
                      style={{ fieldSizing: "content" } as React.CSSProperties}
                      onChange={(e) => onPatchItem(i.id, { angle: e.target.value })}
                      aria-label={L("這一篇要講什麼", "What this post says")}
                      className="text-small leading-relaxed bg-transparent resize-none outline-none rounded focus:bg-default-100 px-0.5"
                    />
                  )}
                  {i.enabled && onOpenItem ? (
                    // 狀態標籤放在按鈕旁（不擠在日期那一列——卡名長的時候會被推出卡片外）。
                    <div className="flex items-center gap-2">
                      <Button size="sm" radius="full" variant={i.outputId ? "flat" : "solid"}
                        className={`h-7 ${i.outputId ? "" : "bg-foreground text-background"}`}
                        startContent={!i.outputId && <FontAwesomeIcon icon={faPenNib} className="text-[11px]" />}
                        onPress={() => onOpenItem(i)}>
                        {i.outputId ? L("打開這篇", "Open") : L("寫這篇", "Write it")}
                      </Button>
                      {i.outputId && (() => {
                        const c = postStateChip(stateOf(i));
                        return <Chip size="sm" color={c.color} variant={c.variant} className="h-5 text-[10.5px]">{postStateLabel(stateOf(i), en)}</Chip>;
                      })()}
                    </div>
                  ) : i.outputId ? (
                    <button type="button" className="self-start text-tiny text-default-500 hover:text-foreground"
                      onClick={() => navigate(`/run/${i.outputId}`)}>{L("看寫好的這篇 →", "View post →")}</button>
                  ) : null}
                  {open === i.id && !locked && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <Input type="date" size="sm" variant="bordered" radius="md" className="w-[150px]"
                        aria-label={L("日期", "Date")} value={i.date} onValueChange={(v) => v && onPatchItem(i.id, { date: v })} />
                      <Button size="sm" variant="bordered" radius="md" onPress={() => onPatchItem(i.id, { enabled: !i.enabled })}>
                        {i.enabled ? L("這篇不做", "Skip") : L("放回企劃", "Put back")}
                      </Button>
                      {PAID_CHANNELS.includes(i.platform) && (
                        <Button size="sm" variant="bordered" radius="md" onPress={() => onPatchItem(i.id, { paid: !i.paid })}>
                          {i.paid ? L("改為一般貼文", "Make organic") : L("這篇下廣告", "Promote as ad")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!locked && onAddItem && addRange && !!addCards?.[c]?.length && (
                <AddItemForm key={`${phase.id}-${c}`} phase={phase} platform={c} cards={addCards[c]!} range={addRange} en={en} onAdd={onAddItem} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
