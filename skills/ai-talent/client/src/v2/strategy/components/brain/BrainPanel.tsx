/**
 * BrainPanel — 策略層「記憶空間」mission tray：品牌記憶用了多少、還能記多少、滿了怎麼清。
 *
 * 2026-09-29（CJ「在策略端增加一個 mission tray，是檢查大腦……就像是手機記憶體
 * 的感覺，透明化品牌大腦當中有記到的內容，分為不同類別，視覺化給用戶看」）。
 * 2026-09-30（CJ「參考 tesla ui 的設計，比較簡化好看」「重新想這個 mission tray 的
 * 名字，目的在管理記憶；超出記憶容量時這邊會提醒用戶，用戶可以像在操作手機的記憶
 * 一樣，按照引導去清理記憶」）：改名「記憶空間」，版面改成儀表板——
 *   深色主控台：中央環形儀表（像車速錶）＋兩側已記住／還能記＋底下 P R N D 式的範圍切換
 *   清理建議：像手機「儲存空間」的建議清單，每條說清楚能騰出多少字、給一個動作
 *   分類方塊：像車機的功能方塊，點進去才看明細
 *
 * 資料來自 brandKnowledge.brain —— 跟每篇產文讀的 prompt 是同一份清單
 * （server/strategy/core/brandContext.ts buildBrandBrain），所以這裡寫「記住」的，
 * 就是 AI 真的讀得到的；寫「沒被讀到」的，就是 AI 讀不到的。
 *
 * 顏色只拿來表達狀態（快滿＝琥珀、超載＝紅），分類一律灰階。
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { ICON } from "../../../platform/components/icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import {
  brainState, categorySummaries, cleanupTips, editHref, fmtChars, groupsOf, STATUS_TEXT,
  type BrainData, type BrainItem, type CleanupKind,
} from "./brainModel";

interface Props {
  brandId: number;
  /** 進來時的範圍（網址上的 ?p= / ?e=）；面板裡可以再切。 */
  initialProductId?: number | null;
  initialEventId?: number | null;
}

/** 狀態色：深色主控台上用亮一階的，淺色區塊用深一階的。 */
const TONE = {
  ok:   { dark: "#ffffff", light: "#171717" },
  near: { dark: "#fbbf24", light: "#b45309" },
  over: { dark: "#f87171", light: "#b91c1c" },
} as const;

const CAT_ICON: Record<string, IconDefinition> = {
  info: ICON.info, brand: ICON.brand, copy: ICON.font, product: ICON.bundle, event: ICON.campaign, legacy: ICON.folder,
};

/** 環形儀表上各分類的灰階（深色底上的白色透明度）——只區分區塊，不帶語意。 */
const RING_ALPHA = [1, 0.78, 0.6, 0.46, 0.34, 0.24];

export default function BrainPanel({ brandId, initialProductId, initialEventId }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const [productId, setProductId] = useState<number | null>(initialProductId ?? null);
  const [eventId, setEventId] = useState<number | null>(initialEventId ?? null);
  const [openCat, setOpenCat] = useState<string | null>(null);

  const productsQ = (trpc as any).product?.list?.useQuery({ brandId }, { enabled: !!brandId, staleTime: 30_000 });
  const eventsQ = (trpc as any).event?.list?.useQuery({ brandId }, { enabled: !!brandId, staleTime: 30_000 });
  const brainQ = (trpc as any).brandKnowledge.brain.useQuery(
    { brandId, productId: productId ?? undefined, eventId: eventId ?? undefined },
    { enabled: !!brandId, refetchOnWindowFocus: true },
  );
  const utils = (trpc as any).useUtils?.();
  const forgetMut = (trpc as any).brandKnowledge.forgetLegacy.useMutation({
    onSuccess: () => { try { utils?.brandKnowledge?.brain?.invalidate?.(); } catch { /* noop */ } },
  });
  const data: BrainData | undefined = brainQ.data;

  const summaries = useMemo(() => (data ? categorySummaries(data) : []), [data]);
  const tips = useMemo(() => (data ? cleanupTips(data) : []), [data]);
  const state = data ? brainState(data) : null;

  if (brainQ.isLoading || !data || !state) {
    return <div className="py-16 text-center text-[13px] text-neutral-400">{en ? "Reading brand memory…" : "正在讀取品牌記憶…"}</div>;
  }

  const pct = Math.min(100, Math.round((data.usedChars / data.capacity) * 100));
  const tone = TONE[state.level];
  const catLabel = (key: string) => {
    const c = data.categories.find((x) => x.key === key);
    return c ? (en ? c.en : c.zh) : key;
  };
  const scope = { brandId, productId, eventId };
  const go = (item: BrainItem) => { const href = editHref(item, scope); if (href) navigate(href); };
  const forget = (items: BrainItem[]) => {
    const rowIds = items.map((i) => i.legacyRowId).filter((x): x is number => !!x);
    if (rowIds.length) forgetMut.mutate({ brandId, rowIds });
  };
  const headline = state.level === "over" ? (en ? "Memory full" : "記憶滿了")
    : state.level === "near" ? (en ? "Almost full" : "快滿了")
    : (en ? "Plenty of room" : "空間充足");
  const products: any[] = productsQ?.data ?? [];
  const events: any[] = eventsQ?.data ?? [];
  const openSummary = summaries.find((s) => s.key === openCat) ?? null;

  return (
    <div className="mx-auto max-w-[920px]">
      {/* ── 主控台 ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[28px] px-5 pb-6 pt-5 text-white sm:px-8"
        style={{ background: "radial-gradient(120% 90% at 50% 0%, #2a2a2a 0%, #161616 55%, #0e0e0e 100%)" }}>
        <div className="flex items-center justify-between text-[12px] text-white/50">
          <span className="font-medium tracking-wide">{en ? "BRAND MEMORY" : "品牌記憶空間"}</span>
          <span className="inline-flex items-center gap-2">
            <Battery pct={pct} color={tone.dark} />
            <span className="tabular-nums text-white/80">{pct}%</span>
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 items-center gap-y-2 sm:grid-cols-[1fr_auto_1fr]">
          <Stat className="order-2 sm:order-1 sm:text-right" label={en ? "Remembered" : "已記住"} value={fmtChars(data.usedChars)} unit={en ? "chars" : "字"} />
          <div className="order-1 col-span-2 flex justify-center sm:order-2 sm:col-span-1 sm:px-6">
            <Gauge pct={pct} tone={tone.dark} headline={headline} en={en}
              segments={summaries.filter((s) => s.keptChars > 0).map((s, i) => ({
                key: s.key, frac: s.keptChars / data.capacity, alpha: RING_ALPHA[i % RING_ALPHA.length]!,
              }))} />
          </div>
          <Stat className="order-3 text-right sm:text-left" label={en ? "Free" : "還能記"} value={fmtChars(state.free)} unit={en ? "chars" : "字"} />
        </div>

        {state.level !== "ok" && (
          <div className="mt-3 flex justify-center">
            <a href="#memory-cleanup" className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12.5px] font-medium no-underline"
              style={{ background: `${tone.dark}1f`, color: tone.dark }}>
              <FontAwesomeIcon icon={ICON.warning} />
              {state.overflowCount > 0
                ? (en ? `${state.overflowCount} memories aren't being read — clean up` : `${state.overflowCount} 筆記憶沒被讀到，去清理`)
                : (en ? "Free up space before it fills" : "滿之前先清一清")}
            </a>
          </div>
        )}

        {/* 範圍切換——像排檔 P R N D：亮的是現在產文會讀到的範圍。 */}
        <div className="mt-5 flex items-end justify-center gap-7 text-[15px]">
          <Gear label={en ? "Brand" : "品牌"} active />
          <GearSelect label={en ? "Product" : "產品"} value={productId} options={products} onChange={setProductId} none={en ? "None" : "不選"} />
          <GearSelect label={en ? "Campaign" : "活動"} value={eventId} options={events} onChange={setEventId} none={en ? "None" : "不選"} />
        </div>
      </section>

      {/* ── 清理建議 ─────────────────────────────────────────── */}
      {tips.length > 0 && (
        <section id="memory-cleanup" className="mt-8 scroll-mt-6">
          <SectionTitle title={en ? "Cleanup suggestions" : "清理建議"}
            hint={en ? "Follow these and the AI reads your whole brand again." : "照著清，AI 就能讀到完整的品牌。"} />
          <div className="space-y-3">
            {tips.map((t) => (
              <TipCard key={t.kind} kind={t.kind} chars={t.chars} items={t.items} en={en} catLabel={catLabel}
                onEdit={go} canEdit={(it) => !!editHref(it, scope)}
                onForget={forget} forgetting={forgetMut.isPending} />
            ))}
          </div>
        </section>
      )}

      {/* ── 分類方塊 ─────────────────────────────────────────── */}
      <section className="mt-8">
        <SectionTitle title={en ? "What it remembers" : "記住了什麼"} />
        {summaries.length === 0 ? (
          <div className="rounded-2xl bg-neutral-100 px-6 py-10 text-center text-[13px] text-neutral-500">
            {en ? "Nothing yet. Fill in positioning and copy rules — they'll show up here."
              : "還沒有記憶。去填定位與文字規則，填了就會出現在這裡。"}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {summaries.map((s) => {
              const active = openCat === s.key;
              const alert = s.overflow > 0 ? TONE.over.light : s.trimmed > 0 ? TONE.near.light : null;
              return (
                <button key={s.key} type="button" onClick={() => setOpenCat(active ? null : s.key)}
                  className={`relative flex flex-col items-start rounded-2xl px-4 py-4 text-left transition-colors ${active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200"}`}>
                  {alert && <span className="absolute right-3.5 top-3.5 h-2 w-2 rounded-full" style={{ background: alert }} />}
                  <FontAwesomeIcon icon={CAT_ICON[s.key] ?? ICON.folder} className={`text-[20px] ${active ? "text-white" : "text-neutral-700"}`} />
                  <span className="mt-4 text-[14px] font-semibold">{catLabel(s.key)}</span>
                  <span className={`mt-0.5 text-[12px] tabular-nums ${active ? "text-white/60" : "text-neutral-500"}`}>
                    {en ? `${s.count} · ${fmtChars(s.keptChars)} chars` : `${s.count} 筆 · ${fmtChars(s.keptChars)} 字`}
                  </span>
                  <span className={`mt-3 block h-1 w-full overflow-hidden rounded-full ${active ? "bg-white/15" : "bg-neutral-200"}`}>
                    <span className={`block h-full rounded-full ${active ? "bg-white" : "bg-neutral-800"}`}
                      style={{ width: `${Math.max(2, Math.min(100, (s.keptChars / data.capacity) * 100))}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {openSummary && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {groupsOf(openSummary.items).map((g) => (
              <div key={g.group || "_"}>
                {g.group && <div className="bg-neutral-50 px-4 py-1.5 text-[11.5px] font-semibold text-neutral-500">{g.group}</div>}
                <ul>
                  {g.items.map((it, i) => (
                    <ItemRow key={i} item={it} en={en}
                      action={it.legacyRowId
                        ? <ForgetButton en={en} busy={forgetMut.isPending} onConfirm={() => forget([it])} />
                        : editHref(it, scope) ? <EditButton en={en} onClick={() => go(it)} /> : null} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 text-[12px] leading-relaxed text-neutral-400">
        {en
          ? `Every AI writer reads exactly this memory before writing — up to ${fmtChars(data.capacity)} characters. Adopted strategy-meeting decisions are written into positioning and appear here; the knowledge base and strategy workbench are not read.`
          : `每一位 AI 寫手動筆前，讀的就是這份記憶，最多 ${fmtChars(data.capacity)} 字。策略會議被採用的決定會寫進定位、出現在這裡；知識庫與策略工作台不會被讀取。`}
      </p>
    </div>
  );
}

/* ── 主控台零件 ─────────────────────────────────────────────── */

/** 270° 環形儀表：各分類用量依序接成一圈，中央是用量百分比（像車速錶的大數字）。 */
function Gauge({ pct, tone, headline, en, segments }: {
  pct: number; tone: string; headline: string; en: boolean;
  segments: Array<{ key: string; frac: number; alpha: number }>;
}) {
  const size = 236, stroke = 12, r = (size - stroke) / 2 - 4, c = 2 * Math.PI * r, arc = c * 0.75;
  let offset = 0;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${pct}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(135deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}
          strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        {segments.map((s) => {
          const len = Math.max(0, Math.min(1, s.frac) * arc - 2);
          const el = (
            <circle key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
              stroke={tone === TONE.ok.dark ? `rgba(255,255,255,${s.alpha})` : tone} strokeOpacity={tone === TONE.ok.dark ? 1 : s.alpha}
              strokeDasharray={`${len} ${c}`} strokeDashoffset={-offset} />
          );
          offset += Math.min(1, s.frac) * arc;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-start font-semibold leading-none tabular-nums" style={{ letterSpacing: "-0.04em" }}>
          <span className="text-[68px]">{pct}</span>
          <span className="mt-2 text-[22px] text-white/60">%</span>
        </div>
        <div className="mt-1 text-[13px] text-white/50">{en ? "used" : "已使用"}</div>
        <div className="mt-3 text-[14px] font-medium" style={{ color: tone }}>{headline}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, className = "" }: { label: string; value: string; unit: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[12px] text-white/45">{label}</div>
      <div className="mt-0.5 text-[26px] font-semibold tabular-nums leading-tight sm:text-[30px]" style={{ letterSpacing: "-0.02em" }}>
        {value}<span className="ml-1 text-[13px] font-normal text-white/50">{unit}</span>
      </div>
    </div>
  );
}

/** 電池式的小容量條（主控台右上角）。 */
function Battery({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="inline-flex items-center">
      <span className="relative inline-block h-[14px] w-[30px] rounded-[4px] border border-white/40 p-[2px]">
        <span className="block h-full rounded-[2px]" style={{ width: `${Math.max(4, pct)}%`, background: color }} />
      </span>
      <span className="ml-[2px] inline-block h-[6px] w-[2px] rounded-r-sm bg-white/40" />
    </span>
  );
}

function Gear({ label, active }: { label: string; active?: boolean }) {
  return <span className={active ? "text-[17px] font-semibold text-white" : "text-white/35"}>{label}</span>;
}

/** 排檔式的範圍選擇：選了某個產品／活動就亮起來，底下小字是選中的名字。 */
function GearSelect({ label, value, options, onChange, none }: {
  label: string; value: number | null; options: any[]; none: string; onChange: (v: number | null) => void;
}) {
  const picked = options.find((o) => o.id === value);
  return (
    <label className="relative flex cursor-pointer flex-col items-center">
      <span className={picked ? "text-[17px] font-semibold text-white" : "text-white/35 hover:text-white/70"}>
        {label}<FontAwesomeIcon icon={ICON.chevronRight} className="ml-1 rotate-90 text-[9px] opacity-60" />
      </span>
      <span className="mt-0.5 max-w-[120px] truncate text-[11px] text-white/45">{picked ? picked.name : none}</span>
      <select className="absolute inset-0 cursor-pointer opacity-0" value={value ?? ""} aria-label={label}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{none}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

/* ── 清理建議 ───────────────────────────────────────────────── */

const TIP_TEXT: Record<CleanupKind, { zh: (n: number, c: string) => [string, string]; en: (n: number, c: string) => [string, string] }> = {
  overflow: {
    zh: (n, c) => [`${n} 筆記憶沒被讀到`, `空間不夠，AI 寫文時整筆跳過了（共 ${c} 字）。精簡這幾筆，或精簡其他較長的記憶，就能讀回來。`],
    en: (n, c) => [`${n} memories aren't being read`, `Out of space, so the AI skips them entirely (${c} chars). Shorten these or other long memories to bring them back.`],
  },
  legacy: {
    zh: (n, c) => [`舊版留下的記憶 ${n} 筆`, `改版前存的資料，現在沒有頁面能編輯，但 AI 仍然會讀。用不到就忘掉，可騰出 ${c} 字。`],
    en: (n, c) => [`${n} memories from the old version`, `Saved before the redesign — no page edits them any more, but the AI still reads them. Forget them to free ${c} chars.`],
  },
  trimmed: {
    zh: (n, c) => [`${n} 筆太長，只記住前段`, `超過單格上限的 ${c} 字 AI 讀不到。把重點寫在前面，或精簡到上限內。`],
    en: (n, c) => [`${n} memories are too long`, `${c} chars past each slot's limit aren't read. Put the key points first, or trim to fit.`],
  },
  large: {
    zh: (_n, c) => [`最佔空間的記憶`, `這幾筆加起來 ${c} 字，精簡它們最快騰出空間。`],
    en: (_n, c) => [`Largest memories`, `Together ${c} chars — trimming these frees space fastest.`],
  },
};

function TipCard({ kind, chars, items, en, catLabel, onEdit, canEdit, onForget, forgetting }: {
  kind: CleanupKind; chars: number; items: BrainItem[]; en: boolean; catLabel: (k: string) => string;
  onEdit: (it: BrainItem) => void; canEdit: (it: BrainItem) => boolean;
  onForget: (items: BrainItem[]) => void; forgetting: boolean;
}) {
  const [open, setOpen] = useState(kind === "overflow");
  const [title, desc] = (en ? TIP_TEXT[kind].en : TIP_TEXT[kind].zh)(items.length, fmtChars(chars));
  const tone = kind === "overflow" ? TONE.over.light : kind === "trimmed" ? TONE.near.light : "#171717";
  const icon = kind === "legacy" ? ICON.folder : kind === "large" ? ICON.chart : ICON.warning;
  return (
    <div className="overflow-hidden rounded-2xl bg-neutral-100">
      <div className="flex items-start gap-4 px-4 py-4 sm:px-5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white" style={{ color: tone }}>
          <FontAwesomeIcon icon={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-neutral-900">{title}</div>
          <div className="mt-0.5 text-[12.5px] leading-relaxed text-neutral-500">{desc}</div>
          <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-[12.5px] font-medium text-neutral-900 underline-offset-2 hover:underline">
            {open ? (en ? "Hide" : "收起") : (en ? `Review ${items.length}` : `查看 ${items.length} 筆`)}
          </button>
        </div>
        {kind === "legacy" && (
          <ForgetButton en={en} busy={forgetting} all onConfirm={() => onForget(items)} />
        )}
      </div>
      {open && (
        <ul className="border-t border-neutral-200 bg-white">
          {items.map((it, i) => (
            <ItemRow key={i} item={it} en={en} context={catLabel(it.category)}
              action={it.legacyRowId
                ? <ForgetButton en={en} busy={forgetting} onConfirm={() => onForget([it])} />
                : canEdit(it) ? <EditButton en={en} onClick={() => onEdit(it)} /> : null} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EditButton({ en, onClick }: { en: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="shrink-0 rounded-full border border-neutral-300 px-3 py-1 text-[12px] font-medium text-neutral-800 hover:border-neutral-900">
      {en ? "Trim" : "去精簡"}
    </button>
  );
}

/** 忘掉要按兩次——第一次變成「確定忘掉？」，刪了就回不來。 */
function ForgetButton({ en, busy, all, onConfirm }: { en: boolean; busy: boolean; all?: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button type="button" disabled={busy}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
      onBlur={() => setArmed(false)}
      className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors disabled:opacity-50 ${armed ? "bg-[#b91c1c] text-white" : "border border-neutral-300 text-neutral-800 hover:border-neutral-900"}`}>
      {armed ? (en ? "Confirm forget?" : "確定忘掉？") : all ? (en ? "Forget all" : "全部忘掉") : (en ? "Forget" : "忘掉")}
    </button>
  );
}

/* ── 明細 ───────────────────────────────────────────────────── */

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h3 className="text-[16px] font-semibold text-neutral-900">{title}</h3>
      {hint && <span className="text-[12.5px] text-neutral-400">{hint}</span>}
    </div>
  );
}

function ItemRow({ item, en, action, context }: { item: BrainItem; en: boolean; action?: React.ReactNode; context?: string }) {
  const st = STATUS_TEXT[item.status];
  const tone = item.status === "overflow" ? TONE.over.light : item.status === "trimmed" ? TONE.near.light : undefined;
  return (
    <li className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-neutral-800">
          {context && <span className="mr-1.5 text-neutral-400">{context}{item.group ? ` · ${item.group}` : ""} ·</span>}
          {item.label}
        </div>
        {item.preview && (
          <div className={`mt-0.5 truncate text-[12px] ${item.status === "overflow" ? "text-neutral-400 line-through" : "text-neutral-500"}`}>
            {item.preview}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[12px] font-medium" style={tone ? { color: tone } : { color: "#525252" }}>{en ? st.en : st.zh}</div>
        <div className="text-[11px] tabular-nums text-neutral-400">
          {item.status === "trimmed"
            ? (en ? `${fmtChars(item.keptChars)} of ${fmtChars(item.storedChars)}` : `記住 ${fmtChars(item.keptChars)}／存 ${fmtChars(item.storedChars)} 字`)
            : item.status === "overflow"
              ? (en ? `${fmtChars(item.storedChars)} not read` : `${fmtChars(item.storedChars)} 字沒被讀到`)
              : (en ? `${fmtChars(item.storedChars)} chars` : `${fmtChars(item.storedChars)} 字`)}
        </div>
      </div>
      {action}
    </li>
  );
}
