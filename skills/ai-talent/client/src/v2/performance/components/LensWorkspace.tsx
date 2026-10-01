/**
 * LensWorkspace — 成效層每個 tray 最上面的「視角」工作區。
 *
 * 2026-09-29（CJ「所有成效層的 mission tray 都有最上面的從範本開始、照你原本的報告、
 * 貼 AI 對話串三個選項……有沒有圖示，一看就懂，不要這麼多文字」）。
 *
 * 版面由上而下：
 *   1. 三個入口（圖示＋兩三個字，說明收進 title tooltip）＋ 右側兩個資料動作（同步粉專／匯入後台檔）
 *   2. 這個 tray 已建的視角（chips）
 *   3. 選中的視角：矩陣（列 × 欄，格子是判讀指標）→ 點格子看漏斗與底下的貼文／廣告
 *
 * 數字全部來自 performance.report（perf_facts 分組加總），這裡沒有任何示意資料；
 * 沒資料時顯示空狀態，示意儀表板由 DataWorkspacePage 在下面另外處理。
 * 顏色只做功能：最好的格子綠、最差的紅，其餘中性。
 */
import { IllustratedEmpty } from "../../platform/components/EmptyIllustration";
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTableCellsLarge, faFileArrowUp, faComments, faArrowsRotate, faFileImport, faXmark,
  faWandMagicSparkles, faPen, faPlus, faArrowUpRightFromSquare, faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../lib/trpc";

type DimValue = { code: string; label: string };
type Dim = { key: string; label: string; values: DimValue[]; origin?: string };
type Stage = { metric: string; label?: string };
type LensConfig = { rowDim: string; colDim?: string | null; stages: Stage[]; judge: string; sources?: string[] };
type Lens = { id: number; name: string; origin: string; config: LensConfig; note: string | null };
type Cell = { totals: Record<string, number>; judge: number | null; count: number };
type Proposal = {
  name: string; rationale: string; unmapped: string[];
  rowDim: Dim & { isNew: boolean }; colDim: (Dim & { isNew: boolean }) | null; config: LensConfig;
};

const UNTAGGED = "__untagged";
const api = () => (trpc as any).performance;

const RANGES = [
  { id: 30, label: "近 30 天" }, { id: 90, label: "近 90 天" }, { id: 180, label: "近 180 天" }, { id: 365, label: "近一年" },
];

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function rangeOf(days: number) {
  const to = new Date();
  const from = new Date(Date.now() - days * 86400_000);
  return { from: ymd(from), to: ymd(to) };
}

function fmtJudge(judge: string, v: number | null) {
  if (v == null) return "—";
  if (judge === "roas") return v.toFixed(2);
  if (judge === "cpa") return "$" + Math.round(v).toLocaleString();
  if (judge === "cvr" || judge === "engagementRate") return (v * 100).toFixed(1) + "%";
  return Math.round(v).toLocaleString();
}
function fmtNum(k: string, v: number) {
  if (k === "spend" || k === "revenue") return "$" + Math.round(v).toLocaleString();
  return Math.round(v).toLocaleString();
}

async function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

/* ───────────────────────── 小元件 ───────────────────────── */

function EntryButton({ icon, label, tip, onClick }: { icon: any; label: string; tip: string; onClick: () => void }) {
  return (
    <button
      type="button" title={tip} aria-label={tip} onClick={onClick}
      className="flex h-[76px] w-[92px] flex-col items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white text-neutral-900 transition hover:border-neutral-900"
    >
      <FontAwesomeIcon icon={icon} className="text-[20px]" />
      <span className="text-[13px] font-medium">{label}</span>
    </button>
  );
}

function SmallAction({ icon, label, onClick, busy }: { icon: any; label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] text-neutral-700 hover:border-neutral-400 disabled:opacity-60">
      <FontAwesomeIcon icon={icon} className={busy ? "animate-spin" : ""} /> {label}
    </button>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-neutral-900">{title}</h3>
          <button onClick={onClose} aria-label="關閉" className="text-neutral-500 hover:text-neutral-900"><FontAwesomeIcon icon={faXmark} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] focus:border-neutral-900 focus:outline-none";
const primaryBtn = "rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50";
const ghostBtn = "rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] text-neutral-700 hover:border-neutral-900";

/* ───────────────────────── 主元件 ───────────────────────── */

export default function LensWorkspace({ brandId, tray }: { brandId: number | null; tray: string }) {
  const utils = (trpc as any).useUtils();
  const [days, setDays] = React.useState(90);
  const range = React.useMemo(() => rangeOf(days), [days]);
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [modal, setModal] = React.useState<null | "template" | "report" | "chat" | "import" | "edit">(null);
  const [proposal, setProposal] = React.useState<{ p: Proposal; origin: "chat" | "report" } | null>(null);
  const [cell, setCell] = React.useState<{ row: DimValue; col: DimValue | null } | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const ws = api().workspace.useQuery({ brandId: brandId ?? 0, tray }, { enabled: !!brandId, refetchOnWindowFocus: false });
  const data = ws.data as any;
  const lenses: Lens[] = data?.lenses ?? [];
  const dims: Dim[] = data?.dims ?? [];
  const active = lenses.find((l) => l.id === activeId) ?? lenses[0] ?? null;

  React.useEffect(() => { setActiveId(null); setCell(null); }, [tray, brandId]);

  const report = api().report.useQuery(
    { brandId: brandId ?? 0, lensId: active?.id ?? 0, ...range },
    { enabled: !!brandId && !!active, refetchOnWindowFocus: false },
  );

  const refresh = () => { utils.performance.workspace.invalidate(); utils.performance.report.invalidate(); utils.performance.connections?.invalidate?.(); };
  const sync = api().syncFacebook.useMutation({
    onSuccess: (r: any) => { setNotice(`已回填 ${r.posts} 篇貼文${r.metricsUsed?.length ? "" : "（這個粉專的觸及／點擊指標 Meta 沒有回，先只有互動數）"}`); refresh(); },
    onError: (e: any) => setNotice(e.message),
  });
  const tplMut = api().useTemplate.useMutation({
    onSuccess: (r: any) => { setActiveId(r.id); setModal(null); refresh(); },
    onError: (e: any) => setNotice(e.message),
  });
  const removeLens = api().removeLens.useMutation({ onSuccess: () => { setActiveId(null); refresh(); } });
  const autoTag = api().autoTag.useMutation({
    onSuccess: (r: any) => { setNotice(`AI 看了 ${r.looked} 筆，歸類了 ${r.tagged} 筆`); refresh(); },
    onError: (e: any) => setNotice(e.message),
  });

  if (!brandId) {
    return <div className="mb-5 rounded-xl border border-neutral-200 bg-white p-4 text-[13px] text-neutral-500">先在右上角選一個品牌。</div>;
  }

  const traySources: string[] = data?.traySources ?? [];
  const showFbSync = traySources.length === 0 || traySources.includes("fb_page");
  const showImport = !(traySources.length === 1 && traySources[0] === "fb_page");

  return (
    <section className="mb-5 rounded-xl border border-neutral-200 bg-white p-4">
      {/* 1. 三個入口 + 資料動作 */}
      <div className="flex flex-wrap items-end gap-3">
        <EntryButton icon={faTableCellsLarge} label="範本" tip="從範本開始：族群 × USP、粉絲團報告、產品 × 通路……" onClick={() => setModal("template")} />
        <EntryButton icon={faFileArrowUp} label="我的報告" tip="照你原本的報告：上傳 pptx / xlsx / csv，AI 讀出你用的維度與指標" onClick={() => setModal("report")} />
        <EntryButton icon={faComments} label="貼對話" tip="貼 AI 對話串：把跟 ChatGPT / Claude 討論過的分析框架貼進來" onClick={() => setModal("chat")} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {showFbSync && data?.fbPage && data?.fbSyncEnabled !== false && (
            <SmallAction icon={faArrowsRotate} label="同步粉專" busy={sync.isPending} onClick={() => sync.mutate({ brandId, days: 180 })} />
          )}
          {showImport && <SmallAction icon={faFileImport} label="匯入後台檔" onClick={() => setModal("import")} />}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px]">
            {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {notice && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-[13px] text-neutral-700">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="關閉"><FontAwesomeIcon icon={faXmark} /></button>
        </div>
      )}

      {/* 2. 視角 chips */}
      {lenses.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {lenses.map((l) => (
            <button key={l.id} onClick={() => { setActiveId(l.id); setCell(null); }}
              className={`rounded-full border px-3 py-1 text-[13px] ${active?.id === l.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-700 hover:border-neutral-900"}`}>
              {l.name}
            </button>
          ))}
          {active && (
            <>
              <button onClick={() => setModal("edit")} title="編輯這個視角" aria-label="編輯這個視角" className="px-1 text-neutral-500 hover:text-neutral-900"><FontAwesomeIcon icon={faPen} /></button>
              <button onClick={() => { if (confirm(`刪除視角「${active.name}」？數據不會被刪。`)) removeLens.mutate({ brandId, id: active.id }); }}
                title="刪除這個視角" aria-label="刪除這個視角" className="px-1 text-neutral-500 hover:text-neutral-900"><FontAwesomeIcon icon={faTrash} /></button>
            </>
          )}
        </div>
      )}

      {/* 3. 報表 */}
      {!lenses.length && !ws.isLoading && (
        // 三個入口就在正上方，不另外放按鈕
        <IllustratedEmpty kind="lens" title="還沒決定要從哪個角度看" />
      )}
      {active && (
        <LensReport
          lens={active} dims={dims} data={data} report={report.data as any} loading={report.isLoading}
          onCell={(row, col) => setCell({ row, col })}
          onAutoTag={() => autoTag.mutate({ brandId, lensId: active.id, ...range })} autoTagging={autoTag.isPending}
        />
      )}

      {cell && active && (
        <CellDrawer brandId={brandId} lens={active} dims={dims} range={range} row={cell.row} col={cell.col}
          metricLabels={data?.metricLabels ?? {}} report={report.data as any} onClose={() => setCell(null)} onChanged={refresh} />
      )}

      {modal === "template" && (
        <Modal title="從範本開始" onClose={() => setModal(null)}>
          <div className="grid gap-2">
            {(data?.templates ?? []).map((t: any) => (
              <button key={t.key} disabled={tplMut.isPending}
                onClick={() => tplMut.mutate({ brandId, tray, templateKey: t.key })}
                className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2.5 text-left hover:border-neutral-900 disabled:opacity-60">
                <span className="text-[14px] font-medium text-neutral-900">{t.name}</span>
                {t.recommended && <span className="text-[12px] text-neutral-500">適合這裡</span>}
              </button>
            ))}
          </div>
          {tplMut.isPending && <p className="mt-3 text-[13px] text-neutral-500">從品牌定位整理族群與 USP…</p>}
        </Modal>
      )}

      {(modal === "report" || modal === "chat") && (
        <ProposeModal brandId={brandId} kind={modal} onClose={() => setModal(null)}
          onProposal={(p) => { setProposal({ p, origin: modal }); setModal(null); }} />
      )}

      {proposal && (
        <ProposalCard brandId={brandId} tray={tray} proposal={proposal.p} origin={proposal.origin}
          metricLabels={data?.metricLabels ?? {}} judgeLabels={data?.judgeLabels ?? {}}
          onClose={() => setProposal(null)} onDone={(id) => { setProposal(null); setActiveId(id); refresh(); }} />
      )}

      {modal === "import" && (
        <ImportModal brandId={brandId} traySources={traySources} sourceLabels={data?.sourceLabels ?? {}}
          metricLabels={data?.metricLabels ?? {}} dims={dims} imports={data?.imports ?? []}
          onClose={() => setModal(null)} onDone={(msg) => { setNotice(msg); setModal(null); refresh(); }} />
      )}

      {modal === "edit" && active && (
        <LensEditor brandId={brandId} tray={tray} lens={active} dims={dims} builtinDims={data?.builtinDims ?? []}
          metricLabels={data?.metricLabels ?? {}} judgeLabels={data?.judgeLabels ?? {}}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />
      )}
    </section>
  );
}

/* ───────────────────────── 報表矩陣 ───────────────────────── */

function LensReport({ lens, dims, data, report, loading, onCell, onAutoTag, autoTagging }: {
  lens: Lens; dims: Dim[]; data: any; report: any; loading: boolean;
  onCell: (row: DimValue, col: DimValue | null) => void; onAutoTag: () => void; autoTagging: boolean;
}) {
  const judgeLabel = data?.judgeLabels?.[lens.config.judge] ?? data?.metricLabels?.[lens.config.judge] ?? lens.config.judge;
  const dimLabel = (k?: string | null) => (k ? (dims.find((d) => d.key === k)?.label ?? data?.builtinDims?.find((d: any) => d.key === k)?.label ?? k) : "");
  if (loading) return <p className="mt-4 text-[13px] text-neutral-500">計算中…</p>;
  const r = report?.result;
  if (!r || r.factCount === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-4 text-[13px] text-neutral-600">
        這段期間還沒有數據。{lens.config.sources?.includes("fb_page") ? "按「同步粉專」回填貼文成效。" : "按「匯入後台檔」上傳廣告或訂單匯出檔，或到總覽同步粉專。"}
      </div>
    );
  }
  const cols: DimValue[] = r.cols.length ? r.cols : [{ code: "*", label: judgeLabel }];
  const lower = lens.config.judge === "cpa";
  const vals = Object.entries(r.cells as Record<string, Cell>)
    .filter(([k, c]) => !k.includes(UNTAGGED) && c.judge != null && c.count >= 2)
    .map(([, c]) => c.judge as number);
  const best = vals.length > 1 ? (lower ? Math.min(...vals) : Math.max(...vals)) : null;
  const worst = vals.length > 2 ? (lower ? Math.max(...vals) : Math.min(...vals)) : null;
  const cov = r.coverage.total ? r.coverage.tagged / r.coverage.total : 1;
  const needsTagging = cov < 0.999 && !["month", "source", "format"].includes(lens.config.rowDim);

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-neutral-600">
        <span><b className="text-neutral-900">{dimLabel(lens.config.rowDim)}</b>{lens.config.colDim ? <> × <b className="text-neutral-900">{dimLabel(lens.config.colDim)}</b></> : null}・{judgeLabel}</span>
        <span>{r.factCount.toLocaleString()} 筆數據</span>
        <span>總計 {judgeLabel} {fmtJudge(lens.config.judge, r.total.judge)}</span>
        {needsTagging && (
          <span className="inline-flex items-center gap-2">
            標籤覆蓋率 {(cov * 100).toFixed(0)}%
            <button onClick={onAutoTag} disabled={autoTagging} className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-0.5 text-[12px] hover:border-neutral-900 disabled:opacity-60">
              <FontAwesomeIcon icon={faWandMagicSparkles} className={autoTagging ? "animate-pulse" : ""} /> AI 補標
            </button>
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        {/* 值的名稱常常是一整句（「5到10分鐘加熱即可上桌」）：欄寬至少 96px、表頭最多兩行，
            完整名稱放 title，免得窄欄把字擠成直排。 */}
        <table className="w-full border-separate border-spacing-1 text-[13px]" style={{ minWidth: 140 + cols.length * 100 }}>
          <thead>
            <tr>
              <th className="w-[140px]" />
              {cols.map((c) => (
                <th key={c.code} title={c.label} className="min-w-[96px] px-1.5 py-1 align-bottom font-normal text-neutral-500">
                  <span className="line-clamp-2 break-words text-center leading-snug">{c.label}</span>
                </th>
              ))}
              {r.cols.length > 0 && <th className="px-2 py-1 text-center font-normal text-neutral-500">合計</th>}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row: DimValue) => (
              <tr key={row.code}>
                <td title={row.label} className={`max-w-[160px] pr-2 leading-snug ${row.code === UNTAGGED ? "text-neutral-400" : "text-neutral-700"}`}>
                  <span className="line-clamp-2">{row.label}</span>
                </td>
                {cols.map((col) => {
                  const c: Cell | undefined = r.cells[`${row.code}|${col.code}`];
                  const isBest = c && best != null && c.judge === best && c.count >= 2 && row.code !== UNTAGGED && col.code !== UNTAGGED;
                  const isWorst = c && worst != null && c.judge === worst && c.count >= 2 && row.code !== UNTAGGED && col.code !== UNTAGGED;
                  return (
                    <td key={col.code} className="p-0">
                      <button disabled={!c} onClick={() => onCell(row, r.cols.length ? col : null)}
                        className={`w-full rounded-md px-2 py-2 text-center tabular-nums ${isBest ? "bg-emerald-50 font-semibold text-emerald-800" : isWorst ? "bg-red-50 text-red-700" : c ? "bg-neutral-50 text-neutral-900 hover:bg-neutral-100" : "text-neutral-300"}`}>
                        {c ? fmtJudge(lens.config.judge, c.judge) : "·"}
                        {c && <span className="ml-1 text-[11px] font-normal text-neutral-400">{c.count}</span>}
                      </button>
                    </td>
                  );
                })}
                {r.cols.length > 0 && (
                  <td className="px-2 text-center tabular-nums text-neutral-600">{fmtJudge(lens.config.judge, r.rowTotals[row.code]?.judge ?? null)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[12px] text-neutral-400">格子裡小字是筆數；少於 2 筆的不參與比較。點格子看漏斗與底下的內容。</p>
    </div>
  );
}

/* ───────────────────────── 格子明細 ───────────────────────── */

function CellDrawer({ brandId, lens, dims, range, row, col, metricLabels, report, onClose, onChanged }: {
  brandId: number; lens: Lens; dims: Dim[]; range: { from: string; to: string }; row: DimValue; col: DimValue | null;
  metricLabels: Record<string, string>; report: any; onClose: () => void; onChanged: () => void;
}) {
  const q = api().cellFacts.useQuery({ brandId, lensId: lens.id, ...range, row: row.code, col: col?.code ?? null }, { refetchOnWindowFocus: false });
  const setTag = api().setFactTag.useMutation({ onSuccess: () => { q.refetch(); onChanged(); } });
  const cell: Cell | undefined = report?.result?.cells?.[`${row.code}|${col?.code ?? "*"}`];
  const t = cell?.totals ?? {};
  const stages = lens.config.stages;
  const top = Math.max(1, ...stages.map((s) => t[s.metric] ?? 0));
  const editable = dims.filter((d) => [lens.config.rowDim, lens.config.colDim].includes(d.key));

  return (
    <Modal title={`${row.label}${col ? ` × ${col.label}` : ""}`} onClose={onClose} wide>
      {stages.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {stages.map((s, i) => {
            const v = t[s.metric] ?? 0;
            const prev = i > 0 ? t[stages[i - 1]!.metric] ?? 0 : 0;
            return (
              <div key={s.metric} className="flex items-center gap-3 text-[13px]">
                <span className="w-20 shrink-0 text-neutral-600">{s.label || metricLabels[s.metric] || s.metric}</span>
                <div className="h-5 flex-1 rounded bg-neutral-100">
                  <div className="h-5 rounded bg-neutral-800" style={{ width: `${Math.max(1, (v / top) * 100)}%` }} />
                </div>
                <span className="w-24 text-right tabular-nums text-neutral-900">{fmtNum(s.metric, v)}</span>
                <span className="w-14 text-right tabular-nums text-neutral-500">{i > 0 && prev > 0 ? ((v / prev) * 100).toFixed(1) + "%" : ""}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="text-[13px] text-neutral-500">{q.data ? `${q.data.total} 筆，照判讀指標排序` : "載入中…"}</div>
      <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto">
        {(q.data?.facts ?? []).map((f: any) => (
          <div key={f.id} className="rounded-lg border border-neutral-200 p-2.5 text-[13px]">
            <div className="flex items-start gap-2">
              <span className="flex-1 text-neutral-900">{f.entityLabel}</span>
              <span className="shrink-0 text-neutral-400">{f.date}</span>
              {f.permalink && <a href={f.permalink} target="_blank" rel="noreferrer" className="shrink-0 text-neutral-500 hover:text-neutral-900" aria-label="開啟原文"><FontAwesomeIcon icon={faArrowUpRightFromSquare} /></a>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-neutral-500">
              {Object.entries(f.metrics as Record<string, number>).filter(([k]) => metricLabels[k]).map(([k, v]) => (
                <span key={k}>{metricLabels[k]} {fmtNum(k, v)}</span>
              ))}
            </div>
            {editable.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {editable.map((d) => (
                  <select key={d.key} value={f.tags?.[d.key] ?? ""} className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-[12px]"
                    onChange={(e) => setTag.mutate({ brandId, factId: f.id, dimKey: d.key, value: e.target.value || null })}>
                    <option value="">{d.label}：未標</option>
                    {d.values.map((v) => <option key={v.code} value={v.code}>{d.label}：{v.label}</option>)}
                  </select>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ───────────────────────── 我的報告 / 貼對話 ───────────────────────── */

function ProposeModal({ brandId, kind, onClose, onProposal }: { brandId: number; kind: "report" | "chat"; onClose: () => void; onProposal: (p: Proposal) => void }) {
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const m = api().proposeLens.useMutation({ onSuccess: (p: Proposal) => onProposal(p), onError: (e: any) => setErr(e.message) });
  const submit = async () => {
    setErr(null);
    if (kind === "chat") {
      if (text.trim().length < 20) { setErr("貼上的內容太短"); return; }
      m.mutate({ brandId, kind, text });
    } else {
      if (!file && text.trim().length < 20) { setErr("選一個檔案，或貼上報告內容"); return; }
      if (file && /\.(csv|txt)$/i.test(file.name)) m.mutate({ brandId, kind, text: await file.text() });
      else if (file) m.mutate({ brandId, kind, fileName: file.name, contentBase64: await fileToBase64(file) });
      else m.mutate({ brandId, kind, text });
    }
  };
  return (
    <Modal title={kind === "chat" ? "貼 AI 對話串" : "照你原本的報告"} onClose={onClose}>
      {kind === "report" && (
        <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-neutral-300 p-4 text-[13px] text-neutral-600 hover:border-neutral-900">
          <FontAwesomeIcon icon={faFileArrowUp} className="text-[20px]" />
          <span className="flex-1">{file ? file.name : "選擇 .pptx / .xlsx / .csv"}</span>
          <input type="file" accept=".pptx,.xlsx,.csv,.txt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      )}
      <textarea value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} rows={kind === "chat" ? 12 : 4}
        placeholder={kind === "chat" ? "把整段對話貼在這裡" : "或直接貼上報告裡的表格與文字"} className={inputCls} />
      {err && <p className="mt-2 text-[13px] text-red-600">{err}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className={ghostBtn}>取消</button>
        <button onClick={submit} disabled={m.isPending} className={primaryBtn}>{m.isPending ? "AI 讀取中…" : "讀出視角"}</button>
      </div>
    </Modal>
  );
}

function ProposalCard({ brandId, tray, proposal, origin, metricLabels, judgeLabels, onClose, onDone }: {
  brandId: number; tray: string; proposal: Proposal; origin: "chat" | "report";
  metricLabels: Record<string, string>; judgeLabels: Record<string, string>; onClose: () => void; onDone: (id: number) => void;
}) {
  const [name, setName] = React.useState(proposal.name);
  const [rowVals, setRowVals] = React.useState(proposal.rowDim.values);
  const [colVals, setColVals] = React.useState(proposal.colDim?.values ?? []);
  const [err, setErr] = React.useState<string | null>(null);
  const m = api().acceptProposal.useMutation({ onSuccess: (r: any) => onDone(r.id), onError: (e: any) => setErr(e.message) });
  const dimBlock = (d: Proposal["rowDim"], vals: DimValue[], setVals: (v: DimValue[]) => void, role: string) => (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="text-[12px] text-neutral-500">{role}{d.isNew ? "・新維度" : ""}</div>
      <div className="text-[14px] font-medium text-neutral-900">{d.label}</div>
      {vals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {vals.map((v) => (
            <span key={v.code} className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[12px] text-neutral-800">
              {v.label}
              <button onClick={() => setVals(vals.filter((x) => x.code !== v.code))} aria-label={`移除 ${v.label}`}><FontAwesomeIcon icon={faXmark} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <Modal title="提議的視角" onClose={onClose} wide>
      <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mb-2 text-[14px] font-medium`} />
      {proposal.rationale && <p className="mb-3 text-[13px] text-neutral-600">{proposal.rationale}</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {dimBlock(proposal.rowDim, rowVals, setRowVals, "列")}
        {proposal.colDim ? dimBlock(proposal.colDim, colVals, setColVals, "欄") : <div className="rounded-lg border border-dashed border-neutral-200 p-3 text-[13px] text-neutral-400">沒有欄維度</div>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-neutral-700">
        {proposal.config.stages.map((s, i) => (
          <React.Fragment key={s.metric}>
            {i > 0 && <span className="text-neutral-400">›</span>}
            <span className="rounded-md bg-neutral-100 px-2 py-0.5">{s.label || metricLabels[s.metric] || s.metric}</span>
          </React.Fragment>
        ))}
        <span className="ml-2 text-neutral-500">判讀：{judgeLabels[proposal.config.judge] ?? metricLabels[proposal.config.judge] ?? proposal.config.judge}</span>
      </div>
      {proposal.unmapped.length > 0 && (
        <p className="mt-2 text-[12px] text-neutral-500">原文提到、但目前資料來源沒有的指標：{proposal.unmapped.join("、")}</p>
      )}
      {err && <p className="mt-2 text-[13px] text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={ghostBtn}>不用了</button>
        <button disabled={m.isPending} className={primaryBtn} onClick={() => m.mutate({
          brandId, tray, origin, name: name.trim() || proposal.name, config: proposal.config,
          note: proposal.rationale || undefined,
          dims: [
            { key: proposal.rowDim.key, label: proposal.rowDim.label, values: rowVals },
            ...(proposal.colDim ? [{ key: proposal.colDim.key, label: proposal.colDim.label, values: colVals }] : []),
          ],
        })}>{m.isPending ? "建立中…" : "確認，建立視角"}</button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── 匯入後台檔 ───────────────────────── */

const IMPORT_SOURCE_OPTIONS = ["meta_ads", "google_ads", "ga4", "shopline", "91app", "shopify", "csv"];

export function ImportModal({ brandId, traySources, sourceLabels, metricLabels, dims, imports, onClose, onDone }: {
  brandId: number; traySources: string[]; sourceLabels: Record<string, string>; metricLabels: Record<string, string>;
  dims: Dim[]; imports: any[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [b64, setB64] = React.useState("");
  const [preview, setPreview] = React.useState<any>(null);
  const [source, setSource] = React.useState<string>(traySources.find((s) => s !== "fb_page") ?? "");
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [fallbackDate, setFallbackDate] = React.useState(ymd(new Date()));
  const [err, setErr] = React.useState<string | null>(null);
  const prev = api().importPreview.useMutation({
    onSuccess: (r: any) => { setPreview(r); setSource(r.source); setMapping(r.mapping); },
    onError: (e: any) => setErr(e.message),
  });
  const commit = api().importCommit.useMutation({
    onSuccess: (r: any) => onDone(`匯入 ${r.facts} 筆${r.skipped ? `（略過 ${r.skipped} 列：沒有日期、總計列或沒有數字）` : ""}`),
    onError: (e: any) => setErr(e.message),
  });
  const removeImport = api().removeImport.useMutation({ onSuccess: () => onDone("已撤回那次匯入") });

  const pick = async (f: File | null) => {
    setErr(null); setPreview(null); setFile(f);
    if (!f) return;
    const data = await fileToBase64(f);
    setB64(data);
    prev.mutate({ brandId, fileName: f.name, contentBase64: data, ...(source ? { source } : {}) });
  };

  const fieldOptions = [
    { v: "", l: "略過" }, { v: "date", l: "日期" }, { v: "entity", l: "名稱（活動／廣告／UTM）" },
    ...Object.entries(metricLabels).map(([v, l]) => ({ v, l })),
    ...dims.map((d) => ({ v: `tag:${d.key}`, l: `標籤：${d.label}` })),
  ];
  const hasDate = Object.values(mapping).includes("date");
  const rowKey = preview?.rowCountKey as string | undefined;

  return (
    <Modal title="匯入後台檔" onClose={onClose} wide>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-neutral-300 p-4 text-[13px] text-neutral-600 hover:border-neutral-900">
        <FontAwesomeIcon icon={faFileImport} className="text-[20px]" />
        <span className="flex-1">{file ? file.name : "Meta 廣告／Google 廣告／GA4／SHOPLINE／91APP／Shopify 匯出的 .csv 或 .xlsx"}</span>
        <input type="file" accept=".csv,.xlsx,.tsv,.txt" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </label>
      {prev.isPending && <p className="mt-3 text-[13px] text-neutral-500">讀取中…</p>}
      {preview && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-neutral-600">這是</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1">
              {IMPORT_SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{sourceLabels[s] ?? s}</option>)}
            </select>
            <span className="text-neutral-500">的匯出檔，共 {preview.rowCount} 列</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-neutral-200">
            <table className="w-full text-[13px]">
              <thead className="bg-neutral-50 text-neutral-500"><tr><th className="px-2 py-1.5 text-left font-normal">原欄位</th><th className="px-2 py-1.5 text-left font-normal">範例</th><th className="px-2 py-1.5 text-left font-normal">對應到</th></tr></thead>
              <tbody>
                {preview.headers.map((h: string, i: number) => (
                  <tr key={h + i} className="border-t border-neutral-100">
                    <td className="px-2 py-1 text-neutral-900">{h}</td>
                    <td className="max-w-[200px] truncate px-2 py-1 text-neutral-500">{preview.sample?.[0]?.[i] ?? ""}</td>
                    <td className="px-2 py-1">
                      <select value={mapping[h] ?? ""} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })} className="w-full rounded-md border border-neutral-200 px-1.5 py-0.5">
                        {fieldOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rowKey && (
            <label className="mt-2 flex items-center gap-2 text-[13px] text-neutral-700">
              <input type="checkbox" checked={mapping[rowKey] === "orders"} onChange={(e) => setMapping({ ...mapping, [rowKey]: e.target.checked ? "orders" : "" })} />
              每一列算一張訂單
            </label>
          )}
          {!hasDate && (
            <label className="mt-2 flex items-center gap-2 text-[13px] text-neutral-700">
              沒有日期欄，整份算在
              <input type="date" value={fallbackDate} onChange={(e) => setFallbackDate(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-0.5" />
            </label>
          )}
        </div>
      )}
      {err && <p className="mt-2 text-[13px] text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={ghostBtn}>取消</button>
        <button disabled={!preview || commit.isPending} className={primaryBtn}
          onClick={() => file && commit.mutate({ brandId, fileName: file.name, contentBase64: b64, source, mapping, fallbackDate })}>
          {commit.isPending ? "匯入中…" : "匯入"}
        </button>
      </div>
      {imports.length > 0 && (
        <div className="mt-5 border-t border-neutral-100 pt-3">
          <div className="mb-1 text-[12px] text-neutral-500">最近的匯入</div>
          {imports.slice(0, 6).map((im: any) => (
            <div key={im.id} className="flex items-center gap-2 py-1 text-[13px] text-neutral-700">
              <span className="flex-1 truncate">{im.fileName}</span>
              <span className="text-neutral-400">{sourceLabels[im.source] ?? im.source}・{im.rowCount} 筆</span>
              <button onClick={() => { if (confirm("撤回這次匯入？它帶進來的數據會一起刪除。")) removeImport.mutate({ brandId, id: im.id }); }}
                className="text-neutral-400 hover:text-neutral-900" aria-label="撤回"><FontAwesomeIcon icon={faTrash} /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ───────────────────────── 視角編輯 ───────────────────────── */

function LensEditor({ brandId, tray, lens, dims, builtinDims, metricLabels, judgeLabels, onClose, onSaved }: {
  brandId: number; tray: string; lens: Lens; dims: Dim[]; builtinDims: { key: string; label: string }[];
  metricLabels: Record<string, string>; judgeLabels: Record<string, string>; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = React.useState(lens.name);
  const [cfg, setCfg] = React.useState<LensConfig>(lens.config);
  const [newVal, setNewVal] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string | null>(null);
  const save = api().saveLens.useMutation({ onSuccess: onSaved, onError: (e: any) => setErr(e.message) });
  const saveDim = api().saveDimension.useMutation({ onError: (e: any) => setErr(e.message) });
  const [localDims, setLocalDims] = React.useState<Dim[]>(dims);
  const allDims = [...localDims.map((d) => ({ key: d.key, label: d.label })), ...builtinDims];
  const editableDims = localDims.filter((d) => d.key === cfg.rowDim || d.key === cfg.colDim);

  const addValue = (d: Dim) => {
    const label = (newVal[d.key] ?? "").trim();
    if (!label) return;
    const taken = new Set(d.values.map((v) => v.code));
    let code = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
    if (!code) code = `v${d.values.length + 1}`;
    let c = code; let i = 2;
    while (taken.has(c)) c = `${code}-${i++}`;
    const next = { ...d, values: [...d.values, { code: c, label: label.slice(0, 24) }] };
    setLocalDims(localDims.map((x) => (x.key === d.key ? next : x)));
    setNewVal({ ...newVal, [d.key]: "" });
    saveDim.mutate({ brandId, key: d.key, label: d.label, values: next.values });
  };
  const removeValue = (d: Dim, code: string) => {
    const next = { ...d, values: d.values.filter((v) => v.code !== code) };
    setLocalDims(localDims.map((x) => (x.key === d.key ? next : x)));
    saveDim.mutate({ brandId, key: d.key, label: d.label, values: next.values });
  };
  const toggleStage = (metric: string) => {
    const has = cfg.stages.some((s) => s.metric === metric);
    const order = Object.keys(metricLabels);
    const stages = has ? cfg.stages.filter((s) => s.metric !== metric)
      : [...cfg.stages, { metric }].sort((a, b) => order.indexOf(a.metric) - order.indexOf(b.metric));
    setCfg({ ...cfg, stages });
  };

  return (
    <Modal title="編輯視角" onClose={onClose} wide>
      <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mb-3 text-[14px] font-medium`} />
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-[13px] text-neutral-600">列
          <select value={cfg.rowDim} onChange={(e) => setCfg({ ...cfg, rowDim: e.target.value })} className={inputCls}>
            {allDims.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label className="text-[13px] text-neutral-600">欄
          <select value={cfg.colDim ?? ""} onChange={(e) => setCfg({ ...cfg, colDim: e.target.value || null })} className={inputCls}>
            <option value="">不交叉</option>
            {allDims.filter((d) => d.key !== cfg.rowDim).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label className="text-[13px] text-neutral-600">判讀指標
          <select value={cfg.judge} onChange={(e) => setCfg({ ...cfg, judge: e.target.value })} className={inputCls}>
            {Object.entries(judgeLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            {Object.entries(metricLabels).map(([k, l]) => <option key={k} value={k}>{l}（加總）</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 text-[13px] text-neutral-600">漏斗階段</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {Object.entries(metricLabels).map(([k, l]) => {
          const on = cfg.stages.some((s) => s.metric === k);
          return (
            <button key={k} onClick={() => toggleStage(k)}
              className={`rounded-md border px-2 py-0.5 text-[12px] ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-700"}`}>{l}</button>
          );
        })}
      </div>
      {editableDims.map((d) => (
        <div key={d.key} className="mt-4">
          <div className="text-[13px] text-neutral-600">{d.label} 的值</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {d.values.map((v) => (
              <span key={v.code} className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[12px] text-neutral-800">
                {v.label}<span className="text-neutral-400">{v.code}</span>
                <button onClick={() => removeValue(d, v.code)} aria-label={`移除 ${v.label}`}><FontAwesomeIcon icon={faXmark} /></button>
              </span>
            ))}
            <input value={newVal[d.key] ?? ""} onChange={(e) => setNewVal({ ...newVal, [d.key]: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") addValue(d); }} placeholder="新增一個值" className="w-32 rounded-md border border-neutral-200 px-2 py-0.5 text-[12px]" />
            <button onClick={() => addValue(d)} aria-label="新增" className="text-neutral-500 hover:text-neutral-900"><FontAwesomeIcon icon={faPlus} /></button>
          </div>
        </div>
      ))}
      <p className="mt-3 text-[12px] text-neutral-400">值旁邊的英文是代碼，會寫進 UTM（utm_content=維度.代碼），後台訂單就能歸回這個格子。</p>
      {err && <p className="mt-2 text-[13px] text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={ghostBtn}>取消</button>
        <button disabled={save.isPending} className={primaryBtn}
          onClick={() => save.mutate({ brandId, tray, id: lens.id, name: name.trim() || lens.name, config: cfg })}>儲存</button>
      </div>
    </Modal>
  );
}
