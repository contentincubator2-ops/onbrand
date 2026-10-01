/**
 * EventCardGrid — 策略層「活動」列表的卡片。
 *
 * 2026-10-02（CJ「活動頁面的卡片尺寸和格式，要參考品牌頁面的」）：版型照 BrandsManagePage 的
 * BrandCard——白底細框、左上 48px 方塊（品牌放 logo，活動放日期）、名稱＋副標、一列數字、
 * 底線分隔的頁尾動作。原本跟產品共用 BrandEntityGrid，活動卡因此帶著產品的欄位語意
 * （標語／USP／受眾硬套成主軸／CTA／時間），現在拆出來。
 *
 * 排序：進行中 → 即將開始 → 未排日期 → 已結束（見 lib/eventTimeline.sortEventsForCards）。
 */
import { useMemo } from "react";
import { IllustratedEmpty } from "../../../platform/components/EmptyIllustration";
import { ChevronRightIcon, DeleteIcon } from "../../../platform/components/icons";
import { eventPhase, sortEventsForCards, toYmd, type EventPhase } from "../../lib/eventTimeline";

interface Props {
  events: any[];
  isLoading: boolean;
  lang: "zh-TW" | "en";
  today: string;
  onAdd: () => void;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function EventCardGrid({ events, isLoading, lang, today, onAdd, onOpen, onDelete }: Props) {
  const en = lang === "en";
  const sorted = useMemo(() => sortEventsForCards(events, today), [events, today]);

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50 animate-pulse h-48" />)}
      </div>
    );
  }
  if (sorted.length === 0) {
    return (
      <IllustratedEmpty
        kind="event"
        title={en ? "Ready to kick off?" : "準備起跑了嗎？"}
        action={{ label: en ? "+ New event" : "+ 新增活動", onPress: onAdd }}
      />
    );
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {sorted.map((ev) => (
        <EventCard key={ev.id} ev={ev} en={en} today={today} onOpen={() => onOpen(ev.id)} onDelete={() => onDelete(ev.id)} />
      ))}
    </div>
  );
}

function fmtDate(s: string, en: boolean) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(en ? "en-US" : "zh-TW", { month: "short", day: "numeric" });
}

const PHASE_LABEL: Record<EventPhase, [string, string]> = {
  live: ["進行中", "Live"],
  upcoming: ["即將開始", "Upcoming"],
  undated: ["未排日期", "No dates"],
  ended: ["已結束", "Ended"],
};

function EventCard({ ev, en, today, onOpen, onDelete }: { ev: any; en: boolean; today: string; onOpen: () => void; onDelete: () => void }) {
  const start = toYmd(ev.startAt);
  const end = toYmd(ev.endAt);
  const { phase, days } = eventPhase(ev.startAt, ev.endAt, today);
  const p = ev.positioning ?? {};
  // 主軸＝宣傳企劃的 SMP（events.positioning.campaignPlan.smp）；還沒排企劃時退回建立時寫的重點。
  const theme: string = [p.campaignPlan?.smp, p.theme, p.note].find((v) => typeof v === "string" && v.trim())?.trim() ?? "";
  const productCount: number = Array.isArray(ev.productIds) ? ev.productIds.length : 0;
  const spanDays = start ? (end ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 : 1) : null;

  const daysStat = phase === "upcoming" ? { n: days ?? 0, label: en ? "Days to go" : "天後開始" }
    : phase === "live" ? { n: days ?? 0, label: en ? "Days left" : "天後結束" }
    : phase === "ended" ? { n: days ?? 0, label: en ? "Days ago" : "天前結束" }
    : { n: null, label: en ? "Days to go" : "天後開始" };
  const dim = phase === "ended";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ev.name}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className={`text-left bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-400 transition group cursor-pointer ${dim ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-3 mb-4">
        {/* 日期方塊：BrandCard 放 logo 的位置 */}
        {start ? (
          <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center leading-none ${dim ? "bg-neutral-200 text-neutral-600" : "bg-neutral-900 text-white"}`}>
            <span className="text-[10px] font-medium opacity-80">{en ? new Date(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "short" }) : `${Number(start.slice(5, 7))}月`}</span>
            <span className="text-base font-bold mt-0.5">{Number(start.slice(8, 10))}</span>
          </div>
        ) : (
          <div className="flex-shrink-0 w-12 h-12 rounded-lg border border-dashed border-neutral-300 text-neutral-400 flex items-center justify-center text-base font-bold">—</div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-neutral-900 truncate">{ev.name}</h3>
          <p className="text-xs text-neutral-500 truncate">
            {start ? `${fmtDate(start, en)}${end && end !== start ? ` → ${fmtDate(end, en)}` : ""}` : (en ? "Dates not set" : "還沒排日期")}
          </p>
          <p className="text-[12px] text-neutral-500 truncate">{en ? PHASE_LABEL[phase][1] : PHASE_LABEL[phase][0]}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(en ? `Delete "${ev.name}"?` : `確定刪除「${ev.name}」？`)) onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 transition text-neutral-400 hover:text-red-600 p-1"
          title={en ? "Delete event" : "刪除活動"}
        >
          <DeleteIcon size={14} />
        </button>
      </div>

      {/* 數字列：BrandCard 的 Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat n={daysStat.n} label={daysStat.label} />
        <Stat n={spanDays} label={en ? "Days long" : "天檔期"} />
        <Stat n={productCount} label={en ? "Products" : "搭配產品"} />
      </div>

      <div className="mb-4 min-h-[36px]">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-400 mb-1">{en ? "Theme" : "主軸"}</p>
        <p className={`text-[12px] leading-snug line-clamp-2 ${theme ? "text-neutral-700" : "text-neutral-400"}`}>
          {theme || (en ? "Not set yet — define it in the promotion plan" : "還沒定——進宣傳企劃跟總監討論")}
        </p>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
        <span className="text-[12px] text-neutral-500">
          {en ? "Updated" : "最近更新"} · {ev.updatedAt ? fmtDate(toYmd(ev.updatedAt) ?? today, en) : "—"}
        </span>
        <span className="text-xs font-semibold text-neutral-900 group-hover:underline flex items-center gap-0.5">
          {en ? "Promotion plan" : "宣傳企劃"} <ChevronRightIcon size={12} />
        </span>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number | null; label: string }) {
  return (
    <div className="text-center">
      <span className="text-base font-bold text-neutral-900">{n == null ? "—" : n}</span>
      <p className="text-[12px] text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}
