/**
 * CampaignMap — 策略層活動頁右半邊：整檔的策略地圖，點某一段就放大到那一段。
 *
 * 2026-09-30（CJ「按下總覽後，右邊會按照階段時間，所使用的管道，列出總覽，當你要看
 * 加溫期的時候，右邊才會 ZOOM IN 到加溫期的傳播管道和訊息和內容安排」）。
 *
 *   · 總覽：橫的是階段、直的是通路，點是一篇，線是發文順序；每段上方是那一段的訊息。
 *   · 放大：地圖往那一段放大後淡出，疊上那一段的目的、訊息，以及每個通路排了哪幾篇。
 *     還沒定稿時，每一篇的「要講什麼」、日期、做不做都在這裡改。
 *
 * 底圖（backdrop）是獨立的一層：用戶選的模板的故事圖（汽車業是起點到終點的地圖、
 * 餐飲是從原料做成菜、文具是零件組成一支馬克筆，見 lib/campaignBackdrops.ts）。
 * 選「傳播圈」或圖還沒產出來時，是中性的底。
 *
 * 顏色照設計系統：只有中性色，success 只給「已寫」。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCheck, faEllipsis, faPenNib } from "@fortawesome/free-solid-svg-icons";
import { CHANNEL_META, channelLabel } from "../../../content/lib/channelMeta";
import { phaseOf, type CampaignPhaseId, type CampaignPlanItem } from "../../lib/campaignSchema";
import { phaseShort, type StagePhase } from "../../lib/campaignStage";

const md = (s: string) => s.slice(5).replace("-", "/");
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
  items, phases, lanes, phaseMessages, current, onPick, locked, en, onPatchItem, backdrop, fill,
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
  backdrop?: React.ReactNode;
  /** 撐滿父層的高度（活動頁右欄）；通路之間的距離跟著拉開。 */
  fill?: boolean;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const { w: W, h: boxH } = useSize(boxRef);

  const G = W < 520 ? 44 : 112;                 // 左邊通路名稱那一欄
  const HEAD = 112;                            // 每段上方的標題區
  const baseLane = lanes.length <= 3 ? 92 : lanes.length <= 5 ? 72 : 60;
  const laneH = fill && boxH > 0 && lanes.length
    ? Math.max(baseLane, Math.min(150, (boxH - HEAD - 84) / lanes.length))
    : baseLane;
  const H = Math.max(420, HEAD + lanes.length * laneH + 84);
  const n = Math.max(1, phases.length);
  const BW = W > 0 ? (W - G - 16) / n : 0;

  const live = items.filter((i) => i.enabled);
  const pins = live.map((it) => {
    const pi = phases.findIndex((p) => p.id === it.phase);
    const li = lanes.indexOf(it.platform);
    const cell = live.filter((x) => x.phase === it.phase && x.platform === it.platform);
    const k = cell.findIndex((x) => x.id === it.id);
    return {
      it,
      x: G + pi * BW + (BW * (k + 1)) / (cell.length + 1),
      y: HEAD + li * laneH + laneH / 2,
      ok: pi >= 0 && li >= 0,
    };
  }).filter((p) => p.ok);
  const route = [...pins].sort((a, b) => (a.it.date < b.it.date ? -1 : a.it.date > b.it.date ? 1 : a.x - b.x));

  const ci = current ? phases.findIndex((p) => p.id === current) : -1;
  const cx = ci >= 0 ? G + (ci + 0.5) * BW : W / 2;
  const cy = HEAD + (lanes.length * laneH) / 2;
  const first = route[0]?.it.date;

  return (
    <div ref={boxRef} className={`relative w-full overflow-hidden bg-default-100 ${fill ? "h-full" : ""}`} style={fill ? { minHeight: H } : { height: H }}>
      {backdrop && <div className="absolute inset-0 pointer-events-none">{backdrop}</div>}

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
          <div key={p.id} className={`absolute rounded-2xl ${backdrop ? (i % 2 ? "bg-content1/25" : "bg-content1/45") : (i % 2 ? "bg-default-200/50" : "bg-default-50/70")}`}
            style={{ left: G + i * BW + 3, top: 8, width: BW - 6, height: HEAD + lanes.length * laneH }} />
        ))}
        {W > 0 && lanes.map((c, j) => (
          <React.Fragment key={c}>
            <div className={`absolute rounded-full ${backdrop ? "bg-default-300/60" : "bg-default-200"}`} style={{ left: G, right: 16, top: HEAD + j * laneH + laneH / 2 - 6, height: 12 }} />
            <div className={`absolute flex items-center gap-2 text-tiny text-default-600 ${backdrop ? "bg-content1/85 rounded-lg pr-2" : ""}`} style={{ left: 12, top: HEAD + j * laneH + laneH / 2 - 13, width: G - 16 }}>
              <span className="w-[26px] h-[26px] shrink-0 rounded-lg bg-content1 shadow-sm grid place-items-center">
                <FontAwesomeIcon icon={CHANNEL_META[c]?.icon ?? faPenNib} className="text-tiny" />
              </span>
              {G > 60 && <span className="truncate">{channelLabel(c, en)}</span>}
            </div>
          </React.Fragment>
        ))}
        {W > 0 && route.length > 1 && (
          <svg className="absolute inset-0 text-foreground" width={W} height={H} aria-hidden>
            <polyline points={route.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              fill="none" stroke="currentColor" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
          </svg>
        )}
        {W > 0 && pins.map(({ it, x, y }) => (
          <React.Fragment key={it.id}>
            <span className={`absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-[3px] ${it.outputId ? "bg-success border-success" : "bg-content1 border-foreground"}`}
              style={{ left: x, top: y }} title={it.angle} />
            <span className="absolute -translate-x-1/2 text-[10.5px] tabular-nums text-default-600 bg-content1/85 rounded px-1"
              style={{ left: x, top: y + 10 }}>{md(it.date)}</span>
          </React.Fragment>
        ))}
        {W > 0 && phases.map((p, i) => {
          return (
            <button key={p.id} type="button" onClick={() => onPick(p.id)}
              className="absolute text-left rounded-xl px-2 py-1.5 hover:bg-content1/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground transition flex flex-col gap-0.5"
              style={{ left: G + i * BW + 6, top: 14, width: BW - 12 }}
              aria-label={L(`放大${phaseShort(p.id, false)}`, `Zoom into ${phaseShort(p.id, true)}`)}>
              <span className="text-small font-semibold">{phaseShort(p.id, en)}</span>
              <span className="text-[11px] text-default-500 tabular-nums">{range(p)}</span>
              {phaseMessages[p.id] && BW > 90 && (
                <span className="text-[11.5px] leading-snug text-default-700 line-clamp-3">{phaseMessages[p.id]}</span>
              )}
            </button>
          );
        })}
        <div className="absolute left-4 bottom-4 bg-content1 rounded-2xl shadow-small px-4 py-2.5 flex items-center gap-6">
          {[
            [String(live.length), L("篇", "posts")],
            [String(new Set(live.map((i) => i.platform)).size), L("個通路", "channels")],
            [first ? md(first) : "—", L("第一篇", "first post")],
          ].map(([v, k]) => (
            <div key={k}><b className="block text-medium font-black leading-tight tabular-nums">{v}</b><span className="text-[11px] text-default-500">{k}</span></div>
          ))}
        </div>
      </div>

      {/* ── 放大：這一段的通路、訊息與內容安排 ── */}
      {ci >= 0 && (
        <PhaseDetail
          phase={phases[ci]!} message={phaseMessages[phases[ci]!.id] ?? ""}
          items={items.filter((i) => i.phase === phases[ci]!.id)} lanes={lanes}
          locked={locked} en={en} onBack={() => onPick(null)} onPatchItem={onPatchItem}
        />
      )}
    </div>
  );
}

function PhaseDetail({ phase, message, items, lanes, locked, en, onBack, onPatchItem }: {
  phase: StagePhase; message: string; items: CampaignPlanItem[]; lanes: string[];
  locked: boolean; en: boolean; onBack: () => void;
  onPatchItem: (id: string, next: Partial<CampaignPlanItem>) => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const [open, setOpen] = React.useState<string | null>(null);
  const spec = phaseOf(phase.id);
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
        </div>
        <p className="text-small text-default-600">{spec?.purposeZh}</p>
        {message
          ? <p className="text-medium font-bold"><span className="text-tiny font-normal text-default-500 mr-2">{L("這一段的訊息", "Message")}</span>{message}</p>
          : <p className="text-tiny text-default-400">{L("這份企劃還沒有這一段的訊息，重排一次就會補上。", "No message for this phase yet — re-plan to add one.")}</p>}
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
                <div key={i.id} className={`border-l-[3px] pl-2.5 flex flex-col gap-1 ${i.outputId ? "border-success" : "border-foreground"} ${i.enabled ? "" : "opacity-45"}`}>
                  <div className="flex items-center gap-2 text-tiny">
                    <b className="tabular-nums">{md(i.date)}</b>
                    <Chip size="sm" variant="flat" className="h-5 text-[10.5px] max-w-[70%]" title={i.taskLabel}>{i.taskLabel}</Chip>
                    {i.outputId && <FontAwesomeIcon icon={faCheck} className="text-success" />}
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
                  {i.outputId && (
                    <button type="button" className="self-start text-tiny text-default-500 hover:text-foreground"
                      onClick={() => navigate(`/run/${i.outputId}`)}>{L("看寫好的這篇 →", "View post →")}</button>
                  )}
                  {open === i.id && !locked && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <Input type="date" size="sm" variant="bordered" radius="md" className="w-[150px]"
                        aria-label={L("日期", "Date")} value={i.date} onValueChange={(v) => v && onPatchItem(i.id, { date: v })} />
                      <Button size="sm" variant="bordered" radius="md" onPress={() => onPatchItem(i.id, { enabled: !i.enabled })}>
                        {i.enabled ? L("這篇不做", "Skip") : L("放回企劃", "Put back")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
