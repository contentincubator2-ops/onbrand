/**
 * BrainPanel — 策略層「記憶」mission tray。
 *
 * 2026-09-29 CJ：「檢查大腦……就像是手機記憶體的感覺，透明化品牌大腦當中有記到的內容」。
 * 2026-09-30 CJ 三輪調整：
 *   · 「名稱就叫做『記憶』，主視覺要用大腦」
 *   · 「策略層有品牌、產品、活動、文字還有視覺，還有其他真實存入的資料……要精細」
 *   · 「喜歡線條的 brain logo……線條簡單會比較像 tesla；請參考手機的介面設計，這是用戶
 *      習慣管理記憶的方式，我們沿用他」
 * 所以版面就是手機的「儲存空間」：
 *   首頁   線條大腦（線畫到哪＝用到哪）＋用量條＋建議＋各區清單（右側圓環＝佔 AI 記憶多少）
 *   區     產品／活動先列每一個（圓環＝寫它時整份記憶用了多少），其他區直接列段落
 *   段落   策略層同名的段落卡片，逐欄標「寫文時讀／只讀前段／沒讀到／寫完後檢查／生圖時讀／只存著」
 * 一層一層點進去，左上角「‹」回上一層——跟手機一樣。
 *
 * 資料：brandKnowledge.memory（server/strategy/core/brandMemory.ts），「讀了沒」跟每篇
 * 產文讀的 prompt 是同一份（buildBrandBrain）。顏色只表達狀態（快滿＝琥珀、沒讀到＝紅）。
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { ICON } from "../../../platform/components/icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import BrainLine from "./BrainLine";
import {
  buildMemoryView, cleanupTips, fmtChars, SECTION_TEXT, TAG_TEXT,
  type BrandMemoryData, type CleanupKind, type MemEntity, type MemRow, type MemSection, type ReadTag, type SectionKey,
} from "./memoryModel";

interface Props {
  brandId: number;
  /** 舊介面保留（網址上的 ?p= / ?e=）：有帶就直接打開那個產品／活動。 */
  initialProductId?: number | null;
  initialEventId?: number | null;
}

const TONE = { ok: "#171717", near: "#b45309", over: "#b91c1c" } as const;

const SECTION_ICON: Record<SectionKey, IconDefinition> = {
  brand: ICON.brand, product: ICON.bundle, event: ICON.campaign, copy: ICON.font,
  visual: ICON.palette, info: ICON.info, meetings: ICON.meeting, other: ICON.folder,
};

/** 容量條與清單圓點的灰階——只區分區塊，不帶語意。 */
const SHADES: Record<SectionKey, string> = {
  info: "#a3a3a3", brand: "#171717", copy: "#525252", product: "#737373", event: "#8a8a8a",
  other: "#c4c4c4", visual: "#d4d4d4", meetings: "#d4d4d4",
};

type Screen = { section: SectionKey; entity?: string } | null;

export default function BrainPanel({ brandId, initialProductId, initialEventId }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>(() =>
    initialProductId ? { section: "product", entity: `p${initialProductId}` }
      : initialEventId ? { section: "event", entity: `e${initialEventId}` } : null);

  const memQ = (trpc as any).brandKnowledge.memory.useQuery({ brandId }, { enabled: !!brandId, refetchOnWindowFocus: true });
  const utils = (trpc as any).useUtils?.();
  const forgetMut = (trpc as any).brandKnowledge.forgetLegacy.useMutation({
    onSuccess: () => { try { utils?.brandKnowledge?.memory?.invalidate?.(); } catch { /* noop */ } },
  });
  const data: BrandMemoryData | null | undefined = memQ.data;
  const view = useMemo(() => (data ? buildMemoryView(data, brandId, en) : null), [data, brandId, en]);
  const tips = useMemo(() => (view ? cleanupTips(view) : []), [view]);

  if (memQ.isLoading) return <Center>{en ? "Reading brand memory…" : "正在讀取品牌記憶…"}</Center>;
  if (!view) return <Center>{en ? "No memory for this brand yet." : "這個品牌還沒有記憶。"}</Center>;

  const go = (href: string | null) => { if (href) navigate(href); };
  const forget = (rows: MemRow[]) => {
    const rowIds = rows.map((r) => r.legacyRowId).filter((x): x is number => !!x);
    if (rowIds.length) forgetMut.mutate({ brandId, rowIds });
  };
  const open = (s: Screen) => { setScreen(s); try { window.scrollTo({ top: 0 }); } catch { /* noop */ } };
  const sectionOf = (k: SectionKey) => view.sections.find((s) => s.key === k) ?? null;
  const T = (k: SectionKey) => (en ? SECTION_TEXT[k].en : SECTION_TEXT[k].zh);

  const cur = screen ? sectionOf(screen.section) : null;
  const curEntity = cur && screen?.entity ? cur.entities.find((e) => e.id === screen.entity) ?? null : null;

  return (
    <div className="mx-auto max-w-[720px]">
      {!cur && (
        <Home view={view} tips={tips} en={en} T={T} onOpen={(k) => open({ section: k })}
          onEdit={go} onForget={forget} forgetting={forgetMut.isPending} />
      )}

      {cur && !curEntity && (
        <>
          <BackBar label={en ? "Memory" : "記憶"} onBack={() => open(null)} />
          <ScreenHead icon={SECTION_ICON[cur.key]} title={T(cur.key)}
            sub={cur.multi
              ? (en ? `${cur.entities.length} items · ${fmtChars(cur.storedChars)} chars stored` : `${cur.entities.length} 個 · 存了 ${fmtChars(cur.storedChars)} 字`)
              : summaryLine(cur.entities[0]!, en)} />
          {cur.multi ? (
            <div className="space-y-3">
              {cur.entities.map((e) => (
                <EntityCard key={e.id} entity={e} capacity={view.capacity} en={en}
                  onClick={() => open({ section: cur.key, entity: e.id })} />
              ))}
            </div>
          ) : (
            <Groups entity={cur.entities[0]!} en={en} onEdit={go} onForget={forget} forgetting={forgetMut.isPending} />
          )}
        </>
      )}

      {cur && curEntity && (
        <>
          <BackBar label={T(cur.key)} onBack={() => open({ section: cur.key })} />
          <ScreenHead icon={SECTION_ICON[cur.key]} title={curEntity.name} sub={summaryLine(curEntity, en)}
            ring={curEntity.writeChars != null ? { value: curEntity.writeChars, capacity: view.capacity } : undefined} />
          {curEntity.writeChars != null && (
            <p className="-mt-2 mb-5 text-[12.5px] text-neutral-500">
              {en
                ? `Writing about this uses ${fmtChars(curEntity.writeChars)} of ${fmtChars(view.capacity)} characters (brand memory included).`
                : `寫這個${cur.key === "product" ? "產品" : "活動"}的文時，整份記憶用了 ${fmtChars(curEntity.writeChars)}／${fmtChars(view.capacity)} 字（含品牌的部分）。`}
            </p>
          )}
          <Groups entity={curEntity} en={en} onEdit={go} onForget={forget} forgetting={forgetMut.isPending} />
        </>
      )}

      <p className="mt-8 text-[12px] leading-relaxed text-neutral-400">
        {en
          ? `Every AI writer reads this memory before writing — up to ${fmtChars(view.capacity)} characters per write. Items marked "Stored only" are kept but never read.`
          : `每一位 AI 寫手動筆前都會讀這份記憶，一次最多 ${fmtChars(view.capacity)} 字。標「只存著」的內容有存下來，但 AI 不會讀。`}
      </p>
    </div>
  );
}

/* ── 首頁 ───────────────────────────────────────────────────── */

function Home({ view, tips, en, T, onOpen, onEdit, onForget, forgetting }: {
  view: NonNullable<ReturnType<typeof buildMemoryView>>; tips: ReturnType<typeof cleanupTips>; en: boolean;
  T: (k: SectionKey) => string; onOpen: (k: SectionKey) => void;
  onEdit: (href: string | null) => void; onForget: (rows: MemRow[]) => void; forgetting: boolean;
}) {
  const pct = Math.min(100, Math.round((view.maxWrite.chars / view.capacity) * 100));
  const tone = TONE[view.level];
  const headline = view.level === "over" ? (en ? "Memory full" : "記憶滿了")
    : view.level === "near" ? (en ? "Almost full" : "快滿了") : (en ? "Plenty of room" : "空間充足");
  return (
    <>
      <section className="rounded-3xl border border-neutral-200 bg-white px-6 pb-6 pt-8 text-center">
        <div className="flex justify-center">
          <BrainLine pct={pct} level={view.level} size={190} ariaLabel={`${pct}%`} />
        </div>
        <div className="mt-3 flex items-baseline justify-center font-semibold tabular-nums text-neutral-900" style={{ letterSpacing: "-0.03em" }}>
          <span className="text-[48px] leading-none">{pct}</span><span className="ml-0.5 text-[20px] text-neutral-400">%</span>
        </div>
        <div className="mt-1 text-[14px] font-semibold" style={{ color: tone }}>{headline}</div>
        <div className="mt-1 text-[12.5px] text-neutral-500">
          {view.maxWrite.name
            ? (en ? `Fullest write: about “${view.maxWrite.name}”` : `最滿的一次寫作：寫「${view.maxWrite.name}」時`)
            : (en ? "Per write, brand memory" : "每次寫作讀的品牌記憶")}
          {" · "}
          <span className="tabular-nums">{fmtChars(view.maxWrite.chars)}／{fmtChars(view.capacity)} {en ? "chars" : "字"}</span>
        </div>

        {/* 用量條——手機儲存空間那條彩色橫條，這裡用灰階分區。 */}
        <div className="mt-6 flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
          {view.composition.map((c) => (
            <div key={c.key} style={{ width: `${(c.chars / view.capacity) * 100}%`, background: view.level === "ok" ? SHADES[c.key] : tone }} />
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {view.composition.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-neutral-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: SHADES[c.key] }} />
              {T(c.key)} <span className="tabular-nums">{fmtChars(c.chars)}</span>
            </span>
          ))}
        </div>
      </section>

      {tips.length > 0 && (
        <section className="mt-6">
          <Label>{en ? "Recommendations" : "建議"}</Label>
          <div className="space-y-3">
            {tips.map((t) => (
              <TipCard key={t.kind} kind={t.kind} chars={t.chars} rows={t.rows} en={en}
                onEdit={onEdit} onForget={onForget} forgetting={forgetting} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <Label>{en ? "What's stored" : "存了什麼"}</Label>
        <div className="space-y-3">
          {view.sections.map((s) => (
            <SectionCard key={s.key} s={s} capacity={view.capacity} en={en} title={T(s.key)} onClick={() => onOpen(s.key)} />
          ))}
        </div>
      </section>
    </>
  );
}

/** 像手機課程列表那種卡片：左邊名稱與小字，右邊圓環。 */
function SectionCard({ s, capacity, en, title, onClick }: { s: MemSection; capacity: number; en: boolean; title: string; onClick: () => void }) {
  const alert = s.skipped > 0 ? TONE.over : s.partial > 0 ? TONE.near : null;
  const notRead = s.readChars === 0;
  const sub = s.multi
    ? (en ? `${s.entities.length} items · ${fmtChars(s.storedChars)} chars stored` : `${s.entities.length} 個 · 存了 ${fmtChars(s.storedChars)} 字`)
    : s.storedChars === 0 ? (en ? `${s.fields} items` : `${s.fields} 項`)
    : (en ? `${s.fields} fields · ${fmtChars(s.storedChars)} chars stored` : `${s.fields} 項 · 存了 ${fmtChars(s.storedChars)} 字`);
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-neutral-400">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-[16px] text-neutral-800">
        <FontAwesomeIcon icon={SECTION_ICON[s.key]} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900">
          {title}
          {alert && <span className="h-1.5 w-1.5 rounded-full" style={{ background: alert }} />}
        </span>
        <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-400">{sub}</span>
        {(s.skipped > 0 || s.partial > 0) && (
          <span className="mt-1 block text-[12px]" style={{ color: alert ?? undefined }}>
            {[s.skipped ? (en ? `${s.skipped} not read` : `${s.skipped} 項沒讀到`) : "", s.partial ? (en ? `${s.partial} partly read` : `${s.partial} 項只讀前段`) : ""].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      {notRead
        ? <span className="shrink-0 text-right text-[11.5px] leading-tight text-neutral-400">{s.key === "visual" ? (en ? "For images" : "生圖用") : (en ? "Not read" : "不佔記憶")}</span>
        : <Ring value={s.readChars} capacity={capacity} tone={alert ?? TONE.ok} />}
      <FontAwesomeIcon icon={ICON.chevronRight} className="shrink-0 text-[11px] text-neutral-300" />
    </button>
  );
}

function EntityCard({ entity, capacity, en, onClick }: { entity: MemEntity; capacity: number; en: boolean; onClick: () => void }) {
  const rows = entity.groups.flatMap((g) => g.rows);
  const skipped = rows.filter((r) => r.tag === "skipped").length;
  const partial = rows.filter((r) => r.tag === "partial").length;
  const alert = skipped ? TONE.over : partial ? TONE.near : null;
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-neutral-400">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-neutral-900">{entity.name}</span>
        <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-400">{summaryLine(entity, en)}</span>
        {alert && (
          <span className="mt-1 block text-[12px]" style={{ color: alert }}>
            {skipped ? (en ? `${skipped} not read` : `${skipped} 項沒讀到`) : (en ? `${partial} partly read` : `${partial} 項只讀前段`)}
          </span>
        )}
      </span>
      <Ring value={entity.writeChars ?? 0} capacity={capacity} tone={alert ?? TONE.ok} />
      <FontAwesomeIcon icon={ICON.chevronRight} className="shrink-0 text-[11px] text-neutral-300" />
    </button>
  );
}

/* ── 段落與欄位 ─────────────────────────────────────────────── */

function Groups({ entity, en, onEdit, onForget, forgetting }: {
  entity: MemEntity; en: boolean; onEdit: (href: string | null) => void; onForget: (rows: MemRow[]) => void; forgetting: boolean;
}) {
  if (!entity.groups.length) {
    return <div className="rounded-2xl border border-dashed border-neutral-300 px-6 py-10 text-center text-[13px] text-neutral-500">{en ? "Nothing stored here yet." : "這裡還沒有存任何東西。"}</div>;
  }
  return (
    <div className="space-y-5">
      {entity.groups.map((g) => (
        <div key={g.title}>
          <Label>{g.title}</Label>
          <ul className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {g.rows.map((r) => (
              <FieldRow key={r.id} row={r} en={en}
                action={r.legacyRowId
                  ? <ForgetButton en={en} busy={forgetting} onConfirm={() => onForget([r])} />
                  : null}
                onClick={r.href ? () => onEdit(r.href) : undefined} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const TAG_STYLE: Record<ReadTag, { color: string; bg: string }> = {
  read:    { color: "#171717", bg: "#f5f5f5" },
  partial: { color: TONE.near, bg: "#fef3c7" },
  skipped: { color: TONE.over, bg: "#fee2e2" },
  check:   { color: "#404040", bg: "#f5f5f5" },
  image:   { color: "#404040", bg: "#f5f5f5" },
  stored:  { color: "#a3a3a3", bg: "transparent" },
};

function FieldRow({ row, en, action, onClick, context }: {
  row: MemRow; en: boolean; action?: React.ReactNode; onClick?: () => void; context?: boolean;
}) {
  const st = TAG_STYLE[row.tag];
  const size = row.display ?? (row.tag === "partial"
    ? (en ? `${fmtChars(row.keptChars)} of ${fmtChars(row.chars)}` : `讀 ${fmtChars(row.keptChars)}／存 ${fmtChars(row.chars)} 字`)
    : `${fmtChars(row.chars)} ${en ? "chars" : "字"}`);
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-neutral-900">
          {context && <span className="mr-1.5 font-normal text-neutral-400">{row.context} ·</span>}
          {row.label}
        </span>
        {row.preview && (
          <span className={`mt-0.5 block truncate text-[12px] ${row.tag === "skipped" ? "text-neutral-400 line-through" : "text-neutral-500"}`}>{row.preview}</span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: st.color, background: st.bg, border: row.tag === "stored" ? "1px solid #e5e5e5" : "none" }}>
          {en ? TAG_TEXT[row.tag].en : TAG_TEXT[row.tag].zh}
        </span>
        <span className="mt-0.5 block text-[11px] tabular-nums text-neutral-400">{size}</span>
      </span>
    </>
  );
  return (
    <li className="border-b border-neutral-100 last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3">
        {onClick ? (
          <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left" title={en ? "Edit on its page" : "到原本的頁面修改"}>
            {body}
            <FontAwesomeIcon icon={ICON.chevronRight} className="shrink-0 text-[10px] text-neutral-300" />
          </button>
        ) : <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>}
        {action}
      </div>
    </li>
  );
}

/* ── 建議 ───────────────────────────────────────────────────── */

const TIP_TEXT: Record<CleanupKind, { zh: (n: number, c: string) => [string, string]; en: (n: number, c: string) => [string, string] }> = {
  skipped: {
    zh: (n, c) => [`${n} 項記憶沒讀到`, `空間不夠，AI 寫文時整項跳過（共 ${c} 字）。精簡這幾項或其他較長的記憶，就能讀回來。`],
    en: (n, c) => [`${n} memories aren't read`, `Out of space, so the AI skips them (${c} chars). Shorten these or other long memories to bring them back.`],
  },
  legacy: {
    zh: (n, c) => [`舊版留下的記憶 ${n} 筆`, `改版前存的資料，沒有頁面能編輯，但 AI 仍然會讀。用不到就忘掉，可騰出 ${c} 字。`],
    en: (n, c) => [`${n} memories from the old version`, `No page edits them any more, but the AI still reads them. Forget them to free ${c} chars.`],
  },
  partial: {
    zh: (n, c) => [`${n} 項太長，只讀前段`, `超過單格上限的 ${c} 字 AI 讀不到。把重點寫在前面，或精簡到上限內。`],
    en: (n, c) => [`${n} memories are too long`, `${c} chars past each field's limit aren't read. Put key points first, or trim.`],
  },
  large: {
    zh: (_n, c) => [`最佔空間的記憶`, `這幾項加起來 ${c} 字，精簡它們最快騰出空間。`],
    en: (_n, c) => [`Largest memories`, `Together ${c} chars — trimming these frees space fastest.`],
  },
};

function TipCard({ kind, chars, rows, en, onEdit, onForget, forgetting }: {
  kind: CleanupKind; chars: number; rows: MemRow[]; en: boolean;
  onEdit: (href: string | null) => void; onForget: (rows: MemRow[]) => void; forgetting: boolean;
}) {
  const [open, setOpen] = useState(kind === "skipped");
  const [title, desc] = (en ? TIP_TEXT[kind].en : TIP_TEXT[kind].zh)(rows.length, fmtChars(chars));
  const tone = kind === "skipped" ? TONE.over : kind === "partial" ? TONE.near : TONE.ok;
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-start gap-3.5 px-4 py-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100" style={{ color: tone }}>
          <FontAwesomeIcon icon={kind === "legacy" ? ICON.folder : kind === "large" ? ICON.chart : ICON.warning} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-neutral-900">{title}</div>
          <div className="mt-0.5 text-[12.5px] leading-relaxed text-neutral-500">{desc}</div>
          <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 text-[12.5px] font-medium text-neutral-900 hover:underline">
            {open ? (en ? "Hide" : "收起") : (en ? `Review ${rows.length}` : `查看 ${rows.length} 項`)}
          </button>
        </div>
        {kind === "legacy" && <ForgetButton en={en} busy={forgetting} all onConfirm={() => onForget(rows)} />}
      </div>
      {open && (
        <ul className="border-t border-neutral-100">
          {rows.map((r) => (
            <FieldRow key={r.id} row={r} en={en} context
              action={r.legacyRowId ? <ForgetButton en={en} busy={forgetting} onConfirm={() => onForget([r])} /> : null}
              onClick={r.href ? () => onEdit(r.href) : undefined} />
          ))}
        </ul>
      )}
    </div>
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

/* ── 小零件 ─────────────────────────────────────────────────── */

/** 手機課程卡右邊那種圓環：中間是百分比。 */
function Ring({ value, capacity, tone, size = 46 }: { value: number; capacity: number; tone: string; size?: number }) {
  const pct = Math.min(100, Math.round((value / capacity) * 100));
  const r = (size - 6) / 2, c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-label={`${pct}%`}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ececec" strokeWidth={3.5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={3.5} strokeLinecap="round"
          strokeDasharray={`${(Math.max(pct, value > 0 ? 2 : 0) / 100) * c} ${c}`} />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums text-neutral-700">{pct}%</span>
    </span>
  );
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-neutral-600 hover:text-neutral-900">
      <FontAwesomeIcon icon={ICON.chevronLeft} className="text-[12px]" /> {label}
    </button>
  );
}

function ScreenHead({ icon, title, sub, ring }: { icon: IconDefinition; title: string; sub: string; ring?: { value: number; capacity: number } }) {
  return (
    <div className="mb-5 flex items-center gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-900 text-[18px] text-white">
        <FontAwesomeIcon icon={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[22px] font-semibold text-neutral-900">{title}</h2>
        <div className="mt-0.5 text-[12.5px] text-neutral-500">{sub}</div>
      </div>
      {ring && <Ring value={ring.value} capacity={ring.capacity} tone={TONE.ok} size={56} />}
    </div>
  );
}

function summaryLine(e: MemEntity, en: boolean): string {
  return en
    ? `${e.fields} fields · ${fmtChars(e.storedChars)} stored · ${fmtChars(e.readChars)} read`
    : `${e.fields} 項 · 存 ${fmtChars(e.storedChars)} 字 · AI 讀 ${fmtChars(e.readChars)} 字`;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">{children}</div>;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="py-16 text-center text-[13px] text-neutral-400">{children}</div>;
}
