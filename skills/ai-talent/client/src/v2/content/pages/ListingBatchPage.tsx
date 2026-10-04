/**
 * ListingBatchPage — 商品頁批次產出的審核頁：每個商品一列，逐筆看、改、核准，最後匯出。
 *
 * 2026-10-05（CJ「蝦皮和 momo 等電商平台…整批修改」→ 第一版＝批次產出＋匯出檔）。
 *
 * 設計重點：
 *   - 匯出預設只含「已核准」。整批改線上商品風險高，沒看過的不會自己流出去。
 *   - 「全部核准」只放行沒缺欄位、沒超標的；有問題的要逐筆看過、確認後才核准。
 *   - 每一欄都能就地改（走既有的 output.updateVariantCaption），改完重新拆欄位、重算字數。
 *   - 進行中每 3 秒輪詢；點數不足會暫停，補了按「繼續」。顏色只傳達狀態。
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import type { ShellOutletCtx } from "../../platform/lib/shellContext";
import { showToastGlobal } from "../../platform/components/Toast";
import { toastWithUpgrade } from "../../platform/lib/upgradeToast";
import {
  listingCsv, downloadTextFile, plainValue, composeListingCaption, bulletItems,
  type ListingRow,
} from "../lib/listingParse";

type Approval = "pending" | "approved" | "rejected";
interface Summary { caption: string; fields: ListingRow[]; missing: number; over: number; todo: string[]; clean: boolean }
interface Item {
  id: string; label: string; productId: number | null;
  state: "queued" | "running" | "done" | "failed" | "cancelled";
  error: string | null; approval: Approval; outputId: number | null; summary: Summary | null;
}

const FILTERS = ["all", "review", "approved", "rejected", "problem", "failed"] as const;
type Filter = (typeof FILTERS)[number];

export default function ListingBatchPage() {
  const { batchId = "" } = useParams<{ batchId: string }>();
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = ctx?.brandId ?? null;
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const q = (trpc as any).listingBatch.get.useQuery(
    { brandId: brandId ?? 0, batchId },
    {
      enabled: !!brandId && !!batchId,
      refetchOnWindowFocus: false,
      // 還有東西在跑或排隊就輪詢；全部結束就停，不白燒請求。
      refetchInterval: (d: any) => (d && (d.counts?.running > 0 || (d.counts?.queued > 0 && d.batch?.status === "running")) ? 3000 : false),
    },
  );
  const data = q.data as {
    batch: { id: string; name: string; cardId: string; cardName: string; channelId: string; status: "running" | "paused" | "done" | "cancelled"; pausedReason: string | null };
    counts: { total: number; queued: number; running: number; done: number; failed: number; cancelled: number; approved: number; rejected: number; pendingReview: number };
    perRun: number; items: Item[];
  } | undefined;

  const onErr = (e: any) => toastWithUpgrade(e?.message ?? (en ? "Something went wrong" : "操作失敗"), en);
  const refetch = () => { void q.refetch(); };
  const approveMut = (trpc as any).listingBatch.setApproval.useMutation({ onSuccess: refetch, onError: onErr });
  const retryMut = (trpc as any).listingBatch.retry.useMutation({ onSuccess: refetch, onError: onErr });
  const resumeMut = (trpc as any).listingBatch.resume.useMutation({ onSuccess: refetch, onError: onErr });
  const cancelMut = (trpc as any).listingBatch.cancel.useMutation({ onSuccess: refetch, onError: onErr });
  const removeMut = (trpc as any).listingBatch.remove.useMutation({
    onSuccess: () => navigate(`/tasks/${data?.batch.channelId ?? "fb"}`),
    onError: onErr,
  });
  const saveMut = (trpc as any).output.updateVariantCaption.useMutation({ onSuccess: refetch, onError: onErr });

  const items = data?.items ?? [];
  const shown = useMemo(() => items.filter((i) => {
    switch (filter) {
      case "review": return i.state === "done" && i.approval === "pending";
      case "approved": return i.approval === "approved" && i.state === "done";
      case "rejected": return i.approval === "rejected" && i.state === "done";
      case "problem": return i.state === "done" && !!i.summary && !i.summary.clean;
      case "failed": return i.state === "failed";
      default: return true;
    }
  }), [items, filter]);

  if (!brandId) return <p className="p-10 text-[14px] text-neutral-500">{en ? "Pick a brand first." : "請先選擇品牌。"}</p>;
  if (q.isError) return <p className="p-10 text-[14px] text-neutral-500">{en ? "Batch not found." : "找不到這個批次。"}</p>;
  if (!data) return <p className="p-10 text-[14px] text-neutral-400">{en ? "Loading…" : "載入中…"}</p>;

  const { batch, counts } = data;
  const finished = counts.done + counts.failed + counts.cancelled;
  const pct = counts.total ? Math.round((finished / counts.total) * 100) : 0;
  const statusLabel: Record<typeof batch.status, string> = en
    ? { running: "Writing…", paused: "Paused", done: "Finished", cancelled: "Cancelled" }
    : { running: "寫作中…", paused: "已暫停", done: "已完成", cancelled: "已取消" };

  const exportRows = (only: "approved" | "all") =>
    items
      .filter((i) => i.state === "done" && i.summary && (only === "all" || i.approval === "approved"))
      .map((i) => ({ name: i.label, fields: i.summary!.fields }));
  const exportCsv = (only: "approved" | "all") => {
    const rows = exportRows(only);
    if (rows.length === 0) { showToastGlobal(en ? "Nothing to export yet" : "還沒有可以匯出的"); return; }
    downloadTextFile(`${batch.name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40)}${only === "approved" ? "" : "_all"}.csv`, listingCsv(rows));
  };

  const approveClean = async () => {
    const ids = items.filter((i) => i.state === "done" && i.approval === "pending").map((i) => i.id);
    if (ids.length === 0) return;
    const r = await approveMut.mutateAsync({ brandId, batchId, itemIds: ids, approval: "approved" });
    const skipped = (r?.skipped ?? []).length;
    showToastGlobal(skipped > 0
      ? (en ? `Approved ${ids.length - skipped}. ${skipped} have problems — review them one by one.` : `已核准 ${ids.length - skipped} 筆；${skipped} 筆有缺欄位或超標，請逐筆看過。`)
      : (en ? `Approved ${ids.length}.` : `已核准 ${ids.length} 筆。`));
  };

  const btn = "inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[12.5px] font-medium text-neutral-700 hover:border-neutral-400 disabled:opacity-50";
  const filterLabel: Record<Filter, string> = en
    ? { all: "All", review: "To review", approved: "Approved", rejected: "Rejected", problem: "Has problems", failed: "Failed" }
    : { all: "全部", review: "待審", approved: "已核准", rejected: "已退回", problem: "有問題", failed: "失敗" };
  const filterCount: Record<Filter, number> = {
    all: items.length,
    review: items.filter((i) => i.state === "done" && i.approval === "pending").length,
    approved: counts.approved, rejected: counts.rejected,
    problem: items.filter((i) => i.state === "done" && !!i.summary && !i.summary.clean).length,
    failed: counts.failed,
  };

  return (
    <div className="mx-auto max-w-[1000px] px-6 pb-24 pt-10">
      <button className="text-[13px] text-neutral-500 hover:text-neutral-900" onClick={() => navigate(`/tasks/${batch.channelId}`)}>
        ← {en ? "Back to the tray" : "回到這個 tray"}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-bold text-neutral-900">{batch.name}</h1>
        <span className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-[12px] text-neutral-600">{statusLabel[batch.status]}</span>
      </div>
      <p className="mt-1 text-[13px] text-neutral-500">
        {en ? `Card: ${batch.cardName}` : `任務卡：${batch.cardName}`} · {en ? `${data.perRun} points each` : `每個商品 ${data.perRun} 點`}
      </p>

      {/* 進度 */}
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full bg-neutral-900 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[12.5px] tabular-nums text-neutral-500">
        {en
          ? `${counts.done} written · ${counts.failed} failed · ${counts.queued + counts.running} waiting · ${counts.approved} approved of ${counts.total}`
          : `已寫 ${counts.done}／失敗 ${counts.failed}／還在排 ${counts.queued + counts.running}／已核准 ${counts.approved}，共 ${counts.total} 個商品`}
      </p>

      {batch.status === "paused" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2.5 text-[13px] text-warning-800">
          <span className="flex-1">
            {batch.pausedReason || (en ? "The background job stopped (the server restarted). Nothing was lost — continue where it left off." : "背景工作停了（伺服器重啟）。已寫好的都還在，可以從還沒寫的接著跑。")}
          </span>
          <button className={btn} disabled={resumeMut.isPending} onClick={() => resumeMut.mutate({ brandId, batchId })}>{en ? "Continue" : "繼續"}</button>
        </div>
      )}

      {/* 工具列 */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-medium tabular-nums ${filter === f ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"}`}>
            {filterLabel[f]} {filterCount[f]}
          </button>
        ))}
        <span className="flex-1" />
        <button className={btn} disabled={filterCount.review === 0 || approveMut.isPending} onClick={approveClean}>
          {en ? "Approve all without problems" : "核准所有沒問題的"}
        </button>
        <button className={btn} onClick={() => exportCsv("approved")}>{en ? `Download CSV (approved ${counts.approved})` : `下載 CSV（已核准 ${counts.approved}）`}</button>
        <button className={btn} onClick={() => exportCsv("all")}>{en ? "CSV (all written)" : "CSV（全部已寫）"}</button>
        {batch.status === "running" && <button className={btn} onClick={() => cancelMut.mutate({ brandId, batchId })}>{en ? "Cancel the rest" : "取消還沒寫的"}</button>}
        {batch.status !== "running" && (
          <button className={btn} onClick={() => { if (window.confirm(en ? "Delete this batch record? The written pieces stay in Projects." : "刪除這個批次紀錄？已寫好的成品仍在專案裡。")) removeMut.mutate({ brandId, batchId }); }}>
            {en ? "Delete batch" : "刪除批次"}
          </button>
        )}
      </div>

      {/* 逐筆 */}
      <ul className="mt-4 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
        {shown.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-neutral-400">{en ? "Nothing here." : "這個分類目前沒有商品。"}</li>}
        {shown.map((it) => (
          <ItemRow key={it.id} it={it} en={en} btn={btn}
            expanded={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)}
            onApprove={(approval, force) => approveMut.mutateAsync({ brandId, batchId, itemIds: [it.id], approval, force }).then((r: any) => {
              if ((r?.skipped ?? []).length > 0) {
                if (window.confirm(en ? "This one has missing or over-limit fields. Approve it anyway?" : "這一筆有缺欄位或超過字數上限。確定仍要核准？")) {
                  void approveMut.mutateAsync({ brandId, batchId, itemIds: [it.id], approval, force: true });
                }
              }
            })}
            onRetry={() => { if (window.confirm(en ? `Rewrite "${it.label}"? This uses ${data.perRun} points again.` : `重寫「${it.label}」？會再扣 ${data.perRun} 點。`)) retryMut.mutate({ brandId, batchId, itemIds: [it.id] }); }}
            onOpenRun={() => it.outputId && navigate(`/run/${it.outputId}`)}
            saving={saveMut.isPending}
            onSaveFields={(rows) => it.outputId && saveMut.mutate({ id: it.outputId, variantIndex: 0, caption: composeListingCaption(rows) })}
          />
        ))}
      </ul>
    </div>
  );
}

function ItemRow({ it, en, btn, expanded, onToggle, onApprove, onRetry, onOpenRun, onSaveFields, saving }: {
  it: Item; en: boolean; btn: string; expanded: boolean; onToggle: () => void;
  onApprove: (a: Approval, force?: boolean) => Promise<unknown> | void;
  onRetry: () => void; onOpenRun: () => void;
  onSaveFields: (rows: ListingRow[]) => void; saving: boolean;
}) {
  const s = it.summary;
  const title = s?.fields.find((f) => f.key === "title")?.value ?? s?.fields[0]?.value ?? null;
  const stateText = it.state === "queued" ? (en ? "Waiting" : "排隊中")
    : it.state === "running" ? (en ? "Writing…" : "寫作中…")
    : it.state === "failed" ? (en ? "Failed" : "失敗")
    : it.state === "cancelled" ? (en ? "Cancelled" : "已取消") : "";
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={onToggle} disabled={it.state !== "done"}>
          <span className="block truncate text-[14px] font-semibold text-neutral-900">{it.label}</span>
          {it.state === "done" && title
            ? <span className="mt-0.5 block truncate text-[12.5px] text-neutral-500">{title}</span>
            : <span className="mt-0.5 block text-[12.5px] text-neutral-400">{stateText}{it.error ? `：${it.error}` : ""}</span>}
        </button>

        {it.state === "done" && s && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
            {s.missing > 0 && <Flag tone="warn">{en ? `${s.missing} missing` : `缺 ${s.missing} 欄`}</Flag>}
            {s.over > 0 && <Flag tone="bad">{en ? `${s.over} over limit` : `${s.over} 欄超標`}</Flag>}
            {s.todo.length > 0 && <Flag tone="warn">{en ? `${s.todo.length} facts to supply` : `待補 ${s.todo.length} 項`}</Flag>}
            {s.clean && s.todo.length === 0 && <Flag tone="ok">{en ? "No problems" : "沒問題"}</Flag>}
          </div>
        )}

        {it.state === "done" && (
          <div className="flex items-center gap-1.5">
            {it.approval === "approved"
              ? <button className={btn} onClick={() => onApprove("pending")}>{en ? "✓ Approved · undo" : "✓ 已核准・取消"}</button>
              : <button className={btn} onClick={() => onApprove("approved")}>{en ? "Approve" : "核准"}</button>}
            {it.approval === "rejected"
              ? <button className={btn} onClick={() => onApprove("pending")}>{en ? "Rejected · undo" : "已退回・取消"}</button>
              : <button className={btn} onClick={() => onApprove("rejected")}>{en ? "Reject" : "退回"}</button>}
            <button className={btn} onClick={onRetry}>{en ? "Rewrite" : "重寫"}</button>
            <button className={btn} onClick={onOpenRun}>{en ? "Open" : "成品頁"}</button>
          </div>
        )}
        {(it.state === "failed" || it.state === "cancelled") && (
          <button className={btn} onClick={onRetry}>{en ? "Retry" : "重試"}</button>
        )}
      </div>

      {expanded && s && <FieldsEditor key={s.caption} rows={s.fields} en={en} saving={saving} onSave={onSaveFields} btn={btn} />}
    </li>
  );
}

function Flag({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const cls = tone === "bad" ? "border-danger-300 bg-danger-50 text-danger-700"
    : tone === "warn" ? "border-warning-300 bg-warning-50 text-warning-800"
    : "border-neutral-200 text-neutral-500";
  return <span className={`rounded-full border px-2 py-0.5 ${cls}`}>{children}</span>;
}

/** 就地改欄位：改的是文字（條列一行一條，不用打符號），存的時候重組成標準格式。 */
function FieldsEditor({ rows, en, saving, onSave, btn }: {
  rows: ListingRow[]; en: boolean; saving: boolean; onSave: (rows: ListingRow[]) => void; btn: string;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.key, plainValue(r)])));
  const dirty = rows.some((r) => (draft[r.key] ?? "") !== plainValue(r));
  const lenOf = (r: ListingRow) => [...(draft[r.key] ?? "").replace(/\n/g, "").trim()].length;
  const save = () => onSave(rows.map((r) => ({
    ...r,
    value: r.kind === "bullets"
      ? bulletItems(draft[r.key] ?? "").map((s) => `・${s}`).join("\n")
      : (draft[r.key] ?? "").trim(),
  })));
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-neutral-50 p-3">
      {rows.map((r) => {
        const n = lenOf(r);
        const over = !!r.maxChars && n > r.maxChars;
        return (
          <div key={r.key}>
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-semibold text-neutral-700">{r.label}</p>
              <span className={`text-[11.5px] tabular-nums ${over ? "font-semibold text-danger" : "text-neutral-400"}`}>
                {r.maxChars ? `${n}／${r.maxChars}` : n}{en ? " chars" : " 字"}
              </span>
            </div>
            <textarea
              value={draft[r.key] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
              rows={r.kind === "text" ? 1 : r.kind === "bullets" ? 4 : 5}
              placeholder={r.value == null ? (en ? "Not written — fill it in" : "沒寫出來——可以自己補") : ""}
              className={`mt-1 w-full resize-y rounded-md border bg-white px-2.5 py-1.5 text-[13.5px] leading-relaxed outline-none focus:border-neutral-900 ${over ? "border-danger-300" : "border-neutral-200"}`}
            />
          </div>
        );
      })}
      <div className="flex justify-end">
        <button className={btn} disabled={!dirty || saving} onClick={save}>{saving ? (en ? "Saving…" : "儲存中…") : (en ? "Save changes" : "儲存修改")}</button>
      </div>
    </div>
  );
}
