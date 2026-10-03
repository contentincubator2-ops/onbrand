/**
 * BrainPanel — 策略層「記憶」mission tray：各區用了多少記憶、存了什麼。
 *
 * 2026-09-29 CJ：「檢查大腦……就像是手機記憶體的感覺」。
 * 2026-09-30 CJ 定調：
 *   · 名稱「記憶」、主視覺是大腦（自己畫的線條大腦，見 BrainGlyph——不能沿用別人的 logo）
 *   · 「用 tesla 圖示優先的設計方式」→ 各區是大圖示方塊，文字最少
 *   · 「只要看目前各個用量是多少，他再進去決定要不要修改」→ 首頁＝總用量＋七區方塊；
 *     點進去看「存了什麼」，點欄位回策略層原頁修改
 *   · 「不要呈現沒讀到、舊版留下的問題，屬於系統面的問題」→ 沒有狀態標記、沒有清理建議
 *
 * 資料：brandKnowledge.memory（server/strategy/core/brand/brandMemory.ts），用量的算法見 memoryModel.ts。
 * 顏色只表達狀態（快滿＝琥珀、滿了＝紅），其餘一律灰階。
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { ICON } from "../../../platform/components/icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import BrainGlyph from "./BrainGlyph";
import {
  buildMemoryView, editHrefFromMemory, fmtChars, memKey, parseMem, SECTION_TEXT,
  type BrandMemoryData, type MemScreen as Screen, type MemEntity, type MemRow, type MemSection, type MemoryView, type SectionKey,
} from "./memoryModel";

interface Props {
  brandId: number;
  /** 網址上的 ?p= / ?e=：有帶就直接打開那個產品／活動。 */
  initialProductId?: number | null;
  initialEventId?: number | null;
}

const TONE = { ok: "#171717", near: "#b45309", over: "#b91c1c" } as const;

const SECTION_ICON: Record<SectionKey, IconDefinition> = {
  brand: ICON.brand, product: ICON.bundle, event: ICON.campaign, copy: ICON.font, visual: ICON.palette, regulation: ICON.regulation, info: ICON.info,
};


export default function BrainPanel({ brandId, initialProductId, initialEventId }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const screen: Screen = parseMem(searchParams.get("mem"))
    ?? (initialProductId ? { section: "product", entity: `p${initialProductId}` }
      : initialEventId ? { section: "event", entity: `e${initialEventId}` } : null);
  const setScreen = (s: Screen) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    const m = memKey(s);
    if (m) next.set("mem", m); else next.delete("mem");
    next.delete("p"); next.delete("e");
    return next;
  }, { replace: true });

  const memQ = (trpc as any).brandKnowledge.memory.useQuery({ brandId }, { enabled: !!brandId, refetchOnWindowFocus: true });
  const data: BrandMemoryData | null | undefined = memQ.data;
  const view = useMemo(() => (data ? buildMemoryView(data, brandId, en) : null), [data, brandId, en]);

  if (memQ.isLoading) return <Center>{en ? "Reading brand memory…" : "正在讀取品牌記憶…"}</Center>;
  if (!view) return <Center>{en ? "No memory for this brand yet." : "這個品牌還沒有記憶。"}</Center>;

  const T = (k: SectionKey) => (en ? SECTION_TEXT[k].en : SECTION_TEXT[k].zh);
  const open = (s: Screen) => { setScreen(s); try { window.scrollTo({ top: 0 }); } catch { /* noop */ } };
  const cur = screen ? view.sections.find((s) => s.key === screen.section) ?? null : null;
  const entity = cur && screen?.entity ? cur.entities.find((e) => e.id === screen.entity) ?? null : null;

  return (
    <div className="mx-auto max-w-[760px]">
      {!cur && <Home view={view} en={en} T={T} onOpen={(k) => open({ section: k })} />}

      {cur && !entity && (
        <>
          <BackBar label={en ? "Memory" : "記憶"} onBack={() => open(null)} />
          <Head icon={SECTION_ICON[cur.key]} title={T(cur.key)} used={cur.usedChars} capacity={view.capacity} en={en}
            note={cur.multi ? (en ? "largest one — each write reads one" : "取最大的一個，每次寫作只讀一個") : undefined} />
          {cur.multi ? (
            cur.entities.length === 0
              ? <Empty en={en} />
              : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {cur.entities.map((e) => (
                    <Tile key={e.id} icon={SECTION_ICON[cur.key]} title={e.name} used={e.usedChars} capacity={view.capacity} en={en}
                      onClick={() => open({ section: cur.key, entity: e.id })} />
                  ))}
                </div>
              )
          ) : <Stored entity={cur.entities[0]!} en={en} onEdit={(r) => navigate(editHrefFromMemory(r, screen))} />}
        </>
      )}

      {cur && entity && (
        <>
          <BackBar label={T(cur.key)} onBack={() => open({ section: cur.key })} />
          <Head icon={SECTION_ICON[cur.key]} title={entity.name} used={entity.usedChars} capacity={view.capacity} en={en} />
          <Stored entity={entity} en={en} onEdit={(r) => navigate(editHrefFromMemory(r, screen))} />
        </>
      )}
    </div>
  );
}

/* ── 首頁：總用量＋七區方塊 ─────────────────────────────────── */

function Home({ view, en, T, onOpen }: { view: MemoryView; en: boolean; T: (k: SectionKey) => string; onOpen: (k: SectionKey) => void }) {
  const pct = Math.round((view.usedChars / view.capacity) * 100);
  const tone = TONE[view.level];
  const state = view.level === "over" ? (en ? "Full" : "滿了") : view.level === "near" ? (en ? "Almost full" : "快滿了") : (en ? "Plenty of room" : "空間充足");
  return (
    <>
      <section className="flex flex-col items-center gap-6 rounded-3xl bg-neutral-50 px-6 py-8 sm:flex-row sm:gap-10 sm:px-10">
        <BrainGlyph pct={pct} level={view.level} size={150} ariaLabel={`${pct}%`} />
        <div className="w-full flex-1 text-center sm:text-left">
          <div className="flex items-baseline justify-center gap-1 font-semibold tabular-nums text-neutral-900 sm:justify-start" style={{ letterSpacing: "-0.03em" }}>
            <span className="text-[56px] leading-none">{pct}</span>
            <span className="text-[22px] text-neutral-400">%</span>
            <span className="ml-3 text-[14px] font-semibold tracking-normal" style={{ color: tone }}>{state}</span>
          </div>
          <div className="mt-2 text-[13px] tabular-nums text-neutral-500">
            {en ? `${fmtChars(view.usedChars)} of ${fmtChars(view.capacity)} characters` : `已用 ${fmtChars(view.usedChars)}／${fmtChars(view.capacity)} 字`}
          </div>
          <Bar used={view.usedChars} capacity={view.capacity} tone={tone} className="mt-4 h-2" />
        </div>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {view.sections.map((s) => (
          <Tile key={s.key} icon={SECTION_ICON[s.key]} title={T(s.key)} capacity={view.capacity} en={en}
            used={s.usedChars} sub={subOf(s, en)} onClick={() => onOpen(s.key)} />
        ))}
      </div>
    </>
  );
}

function subOf(s: MemSection, en: boolean): string | undefined {
  if (s.multi) return en ? `${s.entities.length} items` : `${s.entities.length} 個`;
  if (s.usedChars === 0 && s.fields > 0) return en ? `${s.fields} items` : `${s.fields} 項`;
  return undefined;
}

/** 車機那種功能方塊：圖示在上、名稱、用量，底下一條細線。 */
function Tile({ icon, title, used, capacity, sub, en, onClick }: {
  icon: IconDefinition; title: string; used: number; capacity: number; sub?: string; en: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="flex aspect-[5/4] flex-col items-center justify-center rounded-2xl bg-neutral-100 px-3 text-center transition-colors hover:bg-neutral-200">
      <FontAwesomeIcon icon={icon} className="text-[26px] text-neutral-900" />
      <span className="mt-3 max-w-full truncate text-[14px] font-semibold text-neutral-900">{title}</span>
      <span className="mt-0.5 text-[12px] tabular-nums text-neutral-500">
        {used > 0 ? `${fmtChars(used)} ${en ? "chars" : "字"}` : (sub ?? (en ? "Empty" : "空的"))}
        {used > 0 && sub ? ` · ${sub}` : ""}
      </span>
      <Bar used={used} capacity={capacity} tone={TONE.ok} className="mt-3 h-1 w-3/5" />
    </button>
  );
}

function Bar({ used, capacity, tone, className = "" }: { used: number; capacity: number; tone: string; className?: string }) {
  const w = used > 0 ? Math.max(2, Math.min(100, (used / capacity) * 100)) : 0;
  return (
    <span className={`block overflow-hidden rounded-full bg-neutral-200 ${className}`}>
      <span className="block h-full rounded-full" style={{ width: `${w}%`, background: tone }} />
    </span>
  );
}

/* ── 存了什麼 ───────────────────────────────────────────────── */

function Stored({ entity, en, onEdit }: { entity: MemEntity; en: boolean; onEdit: (row: MemRow) => void }) {
  if (!entity.groups.length) return <Empty en={en} />;
  return (
    <div className="space-y-5">
      {entity.groups.map((g) => (
        <div key={g.title}>
          <div className="mb-2 px-1 text-[12px] font-semibold text-neutral-400">{g.title}</div>
          <ul className="overflow-hidden rounded-2xl bg-neutral-50">
            {g.rows.map((r) => <FieldRow key={r.id} row={r} en={en} onClick={() => onEdit(r)} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FieldRow({ row, en, onClick }: { row: MemRow; en: boolean; onClick: () => void }) {
  const size = row.display ?? `${fmtChars(row.chars)} ${en ? "chars" : "字"}`;
  return (
    <li className="border-b border-white last:border-b-0">
      <button type="button" onClick={onClick} title={en ? "Edit on its page" : "到原本的頁面修改"}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-100">
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium text-neutral-900">{row.label}</span>
          {row.preview && <span className="mt-0.5 block truncate text-[12px] text-neutral-500">{row.preview}</span>}
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-neutral-500">{size}</span>
        <FontAwesomeIcon icon={ICON.chevronRight} className="shrink-0 text-[10px] text-neutral-300" />
      </button>
    </li>
  );
}

/* ── 小零件 ─────────────────────────────────────────────────── */

function Head({ icon, title, used, capacity, en, note }: {
  icon: IconDefinition; title: string; used: number; capacity: number; en: boolean; note?: string;
}) {
  const pct = Math.round((used / capacity) * 100);
  return (
    <div className="mb-6 flex items-center gap-5 rounded-3xl bg-neutral-50 px-6 py-5">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-900 text-[22px] text-white">
        <FontAwesomeIcon icon={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[22px] font-semibold text-neutral-900">{title}</h2>
        <div className="mt-0.5 text-[12.5px] tabular-nums text-neutral-500">
          {en ? `${fmtChars(used)} chars · ${pct}% of memory` : `${fmtChars(used)} 字 · 佔記憶 ${pct}%`}
          {note ? ` · ${note}` : ""}
        </div>
        <Bar used={used} capacity={capacity} tone={TONE.ok} className="mt-3 h-1.5" />
      </div>
    </div>
  );
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-neutral-600 hover:text-neutral-900">
      <FontAwesomeIcon icon={ICON.chevronLeft} className="text-[12px]" /> {label}
    </button>
  );
}

function Empty({ en }: { en: boolean }) {
  return <div className="rounded-2xl bg-neutral-50 px-6 py-10 text-center text-[13px] text-neutral-500">{en ? "Nothing stored here yet." : "這裡還沒有存任何東西。"}</div>;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="py-16 text-center text-[13px] text-neutral-400">{children}</div>;
}
