/**
 * BrainPanel — 策略層「大腦」mission tray：檢查品牌大腦記住了什麼、還能記多少。
 *
 * 2026-09-29（CJ「在策略端增加一個 mission tray，是檢查大腦。有一個大大的圖像
 * （是品牌大腦），檢查目前是否超載，還是用戶可以新增更多的記憶，就像是手機記憶體
 * 的感覺，透明化品牌大腦當中有記到的內容，分為不同類別，視覺化給用戶看」）。
 *
 * 資料來自 brandKnowledge.brain —— 跟每篇產文讀的 prompt 是同一份清單
 * （server/strategy/core/brandContext.ts buildBrandBrain），所以這裡寫「記住」的，
 * 就是 AI 真的讀得到的；寫「超載」的，就是 AI 讀不到的。
 *
 * 版面沿用策略層的單色 neutral 系統——顏色只拿來表達狀態（接近滿／超載）。
 */
import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBrain, faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import {
  brainState, categorySummaries, fmtChars, groupsOf, STATUS_TEXT,
  type BrainData, type BrainItem,
} from "./brainModel";

interface Props {
  brandId: number;
  /** 進來時的範圍（網址上的 ?p= / ?e=）；面板裡可以再切。 */
  initialProductId?: number | null;
  initialEventId?: number | null;
}

/** 類別在容量條上的灰階——只用來區分區塊，不帶語意。 */
const SHADES = ["#171717", "#404040", "#525252", "#737373", "#8a8a8a", "#a3a3a3", "#b8b8b8", "#cfcfcf", "#dedede", "#ececec"];

const STATE_COLOR = { ok: "#171717", near: "#b45309", over: "#b91c1c" } as const;

export default function BrainPanel({ brandId, initialProductId, initialEventId }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const [productId, setProductId] = useState<number | null>(initialProductId ?? null);
  const [eventId, setEventId] = useState<number | null>(initialEventId ?? null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const productsQ = (trpc as any).product?.list?.useQuery?.({ brandId }, { enabled: !!brandId, staleTime: 30_000 });
  const eventsQ = (trpc as any).event?.list?.useQuery?.({ brandId }, { enabled: !!brandId, staleTime: 30_000 });
  const brainQ = (trpc as any).brandKnowledge.brain.useQuery(
    { brandId, productId: productId ?? undefined, eventId: eventId ?? undefined },
    { enabled: !!brandId, refetchOnWindowFocus: true },
  );
  const data: BrainData | undefined = brainQ.data;

  const summaries = useMemo(() => (data ? categorySummaries(data) : []), [data]);
  const state = data ? brainState(data) : null;

  if (brainQ.isLoading || !data || !state) {
    return <div className="py-16 text-center text-[13px] text-neutral-400">{en ? "Reading the brand brain…" : "正在讀取品牌大腦…"}</div>;
  }

  const pct = Math.min(100, Math.round((data.usedChars / data.capacity) * 100));
  const color = STATE_COLOR[state.level];
  const catLabel = (key: string) => {
    const c = data.categories.find((x) => x.key === key);
    return c ? (en ? c.en : c.zh) : key;
  };
  const shadeOf = (key: string) => SHADES[Math.max(0, data.categories.findIndex((c) => c.key === key)) % SHADES.length];

  return (
    <div className="mx-auto max-w-[880px]">
      {/* ── 大腦＋容量 ─────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-8 rounded-2xl border border-neutral-200 bg-white px-6 py-8 sm:flex-row sm:items-center">
        <BrainGauge pct={pct} color={color} />
        <div className="flex-1">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-neutral-400">
            {en ? "Brand brain" : "品牌大腦"}
          </div>
          <div className="mt-1 text-[26px] font-semibold text-neutral-900" style={{ color: state.level === "ok" ? undefined : color }}>
            {state.level === "over" ? (en ? "Overloaded" : "超載了")
              : state.level === "near" ? (en ? "Almost full" : "快滿了")
              : (en ? "Room to remember more" : "還可以記更多")}
          </div>
          <div className="mt-2 text-[14px] text-neutral-600">
            {en
              ? <>Remembering <b>{fmtChars(data.usedChars)}</b> of <b>{fmtChars(data.capacity)}</b> characters · about <b>{fmtChars(state.free)}</b> free</>
              : <>已記住 <b>{fmtChars(data.usedChars)}</b> 字／容量 <b>{fmtChars(data.capacity)}</b> 字 · 還能再記約 <b>{fmtChars(state.free)}</b> 字</>}
          </div>
          {state.overflowCount > 0 && (
            <div className="mt-2 text-[13px]" style={{ color: STATE_COLOR.over }}>
              {en
                ? `${state.overflowCount} item(s) didn't fit — the AI can't read them. Trim or remove something below.`
                : `有 ${state.overflowCount} 筆放不進去，AI 讀不到。請精簡或刪掉下面標「超載」的內容。`}
            </div>
          )}
          {state.trimmedCount > 0 && (
            <div className="mt-1 text-[13px] text-neutral-500">
              {en
                ? `${state.trimmedCount} item(s) are longer than their slot — only the beginning is remembered.`
                : `有 ${state.trimmedCount} 筆比格子長，只記住前面一段。`}
            </div>
          )}

          {/* 容量條（像手機儲存空間） */}
          <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-neutral-100">
            {summaries.filter((s) => s.keptChars > 0).map((s) => (
              <div key={s.key} title={`${catLabel(s.key)} ${fmtChars(s.keptChars)}`}
                style={{ width: `${(s.keptChars / data.capacity) * 100}%`, background: shadeOf(s.key) }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {summaries.filter((s) => s.keptChars > 0).map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px] text-neutral-500">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: shadeOf(s.key) }} />
                {catLabel(s.key)} {fmtChars(s.keptChars)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── 範圍 ─────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-3 text-[13px] text-neutral-600">
        <span>{en ? "Check the brain as it reads for:" : "檢查產文時讀到的大腦："}</span>
        <select className="rounded-lg border border-neutral-300 px-2 py-1 text-[13px]" value={productId ?? ""}
          onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{en ? "No product" : "不選產品"}</option>
          {(productsQ?.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="rounded-lg border border-neutral-300 px-2 py-1 text-[13px]" value={eventId ?? ""}
          onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{en ? "No campaign" : "不選活動"}</option>
          {(eventsQ?.data ?? []).map((ev: any) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </div>

      {/* ── 分類清單 ─────────────────────────────────────────── */}
      <div className="mt-5 space-y-3">
        {summaries.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center text-[13px] text-neutral-500">
            {en ? "The brain is empty. Fill in positioning and copy rules — they'll show up here."
              : "大腦還是空的。去填定位與文字規則，填了就會出現在這裡。"}
          </div>
        )}
        {summaries.map((s, idx) => {
          const isOpen = open[s.key] ?? (s.overflow > 0 || s.trimmed > 0 || idx === 0);
          return (
            <div key={s.key} className="rounded-xl border border-neutral-200 bg-white">
              <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => setOpen((o) => ({ ...o, [s.key]: !isOpen }))}>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: shadeOf(s.key) }} />
                <span className="text-[14px] font-semibold text-neutral-900">{catLabel(s.key)}</span>
                <span className="text-[12px] text-neutral-400">
                  {en ? `${s.count} item(s) · ${fmtChars(s.keptChars)} chars` : `${s.count} 筆 · ${fmtChars(s.keptChars)} 字`}
                </span>
                {s.overflow > 0 && <Badge color={STATE_COLOR.over}>{en ? `${s.overflow} overloaded` : `${s.overflow} 筆超載`}</Badge>}
                {s.trimmed > 0 && <Badge color={STATE_COLOR.near}>{en ? `${s.trimmed} partial` : `${s.trimmed} 筆只記一部分`}</Badge>}
                <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} className="ml-auto text-[11px] text-neutral-400" />
              </button>
              {isOpen && (
                <div className="border-t border-neutral-100">
                  {/* 依該頁的段落標題分組（品牌黃金圈、商品事實…），名稱跟策略層頁面一致。 */}
                  {groupsOf(s.items).map((g) => (
                    <div key={g.group || "_"}>
                      {g.group && (
                        <div className="bg-neutral-50 px-4 py-1.5 text-[11.5px] font-semibold text-neutral-500">{g.group}</div>
                      )}
                      <ul>
                        {g.items.map((it, i) => <ItemRow key={i} item={it} en={en} />)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-neutral-400">
        {en
          ? "Every AI writer reads exactly this list before writing. Adopted strategy-meeting decisions are written into positioning and appear here; the knowledge base and strategy workbench are not read."
          : "每一位 AI 寫手動筆前，讀的就是這份清單。策略會議被採用的決定會寫進定位、出現在這裡；知識庫與策略工作台不會被讀取。"}
      </p>
    </div>
  );
}

function ItemRow({ item, en }: { item: BrainItem; en: boolean }) {
  const st = STATUS_TEXT[item.status];
  const tone = item.status === "overflow" ? STATE_COLOR.over : item.status === "trimmed" ? STATE_COLOR.near : undefined;
  return (
    <li className="flex items-start gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-neutral-800">{item.label}</div>
        {item.preview && (
          <div className={`mt-0.5 truncate text-[12px] ${item.status === "overflow" ? "text-neutral-400 line-through" : "text-neutral-500"}`}>
            {item.preview}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[12px] font-medium" style={tone ? { color: tone } : undefined}>{en ? st.en : st.zh}</div>
        <div className="text-[11px] text-neutral-400">
          {item.status === "trimmed"
            ? (en ? `${fmtChars(item.keptChars)} of ${fmtChars(item.storedChars)}` : `記住 ${fmtChars(item.keptChars)}／存 ${fmtChars(item.storedChars)} 字`)
            : item.status === "overflow"
              ? (en ? `${fmtChars(item.storedChars)} not read` : `${fmtChars(item.storedChars)} 字沒被讀到`)
              : (en ? `${fmtChars(item.storedChars)} chars` : `${fmtChars(item.storedChars)} 字`)}
        </div>
      </div>
    </li>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: color, color }}>
      {children}
    </span>
  );
}

/** 大腦圖示，依用量由下往上填滿——手機記憶體那種一眼看出還剩多少的感覺。 */
function BrainGauge({ pct, color }: { pct: number; color: string }) {
  const size = 150;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`${pct}%`}>
      <FontAwesomeIcon icon={faBrain} style={{ width: size, height: size, color: "#e5e5e5", position: "absolute", inset: 0 }} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }}>
        <FontAwesomeIcon icon={faBrain} style={{ width: size, height: size, color }} />
      </div>
      <div className="absolute inset-x-0 -bottom-6 text-center text-[13px] font-semibold" style={{ color }}>{pct}%</div>
    </div>
  );
}
