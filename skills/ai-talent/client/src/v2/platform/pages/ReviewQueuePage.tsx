/**
 * /review — 審核佇列。
 *
 * 2026-09-06。`mission_review_queue` 這張表半年前就建好了，但 server 與
 * client 都沒有任何程式碼在用它 —— 整套審核只存在於資料表裡。定價把「審核
 * 工作流」寫成 9,000 方案 5 席的理由，這頁是讓那句話成立的最後一塊。
 *
 * 兩個分頁刻意分開，因為看的人不同：
 *   等我放行  → 主管／owner・admin
 *   我送出的  → 小編，想知道自己的稿卡在哪一關
 *
 * 字級從 13px 起跳。2026-09-06 已把介面地板抬到 12px，這頁是新的，
 * 不貼著地板寫。
 */
import { IllustratedEmpty } from "../components/EmptyIllustration";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { showToastGlobal } from "../../../components/ui/Toast";
import { ChevronLeftIcon, DoneIcon, InboxIcon, SendBackIcon, WaitingIcon, WarningIcon } from "../components/icons";
import { HelpTip } from "../components/HelpTip";

type Tab = "pending" | "mine";

const STATUS_ZH: Record<string, string> = {
  pending: "等待審核",
  in_review: "審核中",
  approved: "已放行",
  revision_requested: "退回修改",
  expired: "已逾期",
};
const STATUS_EN: Record<string, string> = {
  pending: "Pending",
  in_review: "In review",
  approved: "Approved",
  revision_requested: "Revision requested",
  expired: "Expired",
};
const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  in_review: "bg-zinc-50 text-zinc-700 border-zinc-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  revision_requested: "bg-rose-50 text-rose-700 border-rose-200",
  expired: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

function StatusChip({ status, isEn }: { status: string; isEn: boolean }) {
  const label = (isEn ? STATUS_EN : STATUS_ZH)[status] ?? status;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[13px] font-medium ${
      STATUS_TONE[status] ?? STATUS_TONE.expired}`}>
      {label}
    </span>
  );
}

export default function ReviewQueuePage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isEn = lang === "en";
  const [tab, setTab] = useState<Tab>("pending");
  const [revising, setRevising] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const pending = (trpc as any).review.listPending.useQuery({ limit: 50 });
  const mine = (trpc as any).review.listMine.useQuery({ limit: 50 });

  const refresh = () => { pending.refetch?.(); mine.refetch?.(); };

  const approveMut = (trpc as any).review.approve.useMutation({
    onSuccess: () => {
      showToastGlobal(isEn ? "Approved" : "已放行");
      refresh();
    },
    onError: (e: any) => showToastGlobal(e?.message ?? (isEn ? "Failed" : "放行失敗")),
  });
  const reviseMut = (trpc as any).review.requestRevision.useMutation({
    onSuccess: () => {
      showToastGlobal(isEn ? "Sent back for revision" : "已退回修改");
      setRevising(null);
      setNote("");
      refresh();
    },
    onError: (e: any) => showToastGlobal(e?.message ?? (isEn ? "Failed" : "退回失敗")),
  });

  const rows: any[] = (tab === "pending" ? pending.data : mine.data) ?? [];
  const loading = tab === "pending" ? pending.isLoading : mine.isLoading;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-6">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-[14px] text-default-500 hover:text-default-800"
      >
        <ChevronLeftIcon size={16} />
        {isEn ? "Back" : "返回"}
      </button>

      <h1 className="text-2xl font-bold text-default-900 flex items-center gap-2">
        {isEn ? "Review queue" : "審核佇列"}
        <HelpTip>
          {isEn
            ? "Content goes live only after someone other than the author approves it."
            : "產出要由作者以外的人放行才會上線。"}
        </HelpTip>
      </h1>

      <div className="mt-5 flex gap-1 border-b border-default-200">
        {(["pending", "mine"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[14px] font-medium transition ${
              tab === t
                ? "border-b-2 border-default-900 text-default-900"
                : "text-default-500 hover:text-default-700"
            }`}
          >
            {t === "pending"
              ? (isEn ? "Waiting on me" : "等我放行")
              : (isEn ? "Sent by me" : "我送出的")}
            {t === "pending" && (pending.data?.length ?? 0) > 0 && (
              <span className="ml-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[12px] font-semibold text-white">
                {pending.data.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <p className="py-10 text-center text-[14px] text-default-400">
          {isEn ? "Loading…" : "載入中…"}
        </p>
      )}

      {!loading && rows.length === 0 && (
        <IllustratedEmpty
          kind="review"
          title={tab === "pending"
            ? (isEn ? "Nothing on your desk to approve" : "桌上沒有待放行的稿子")
            : (isEn ? "You haven't sent anything for review." : "你還沒有送審過任何產出。")}
        />
      )}

      <div className="mt-4 flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-default-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              {r.isUrgent === 1 && (
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-rose-600">
                  <WarningIcon size={14} />
                  {isEn ? "Urgent" : "急件"}
                </span>
              )}
              <StatusChip status={r.status} isEn={isEn} />
              {r.platform && (
                <span className="text-[13px] text-default-400">{r.platform}</span>
              )}
              <span className="ml-auto inline-flex items-center gap-1 text-[13px] text-default-400">
                <WaitingIcon size={13} />
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </div>

            <p className="mt-2 text-[15px] font-medium text-default-900">
              {r.outputTitle || (isEn ? "(untitled output)" : "（未命名產出）")}
            </p>

            {tab === "pending" && (
              <p className="mt-1 text-[13px] text-default-500">
                {isEn ? "Submitted by " : "送審者："}
                {r.requesterName || r.requesterEmail || `#${r.requestedBy}`}
              </p>
            )}

            {r.revisionNote && (
              <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
                {isEn ? "Revision note: " : "退回理由："}{r.revisionNote}
              </p>
            )}

            {tab === "pending" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => approveMut.mutate({ id: r.id })}
                  disabled={approveMut.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[14px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <DoneIcon size={15} />
                  {isEn ? "Approve" : "放行"}
                </button>
                <button
                  onClick={() => { setRevising(revising === r.id ? null : r.id); setNote(""); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-default-300 px-3 py-1.5 text-[14px] font-medium text-default-700 hover:bg-default-50"
                >
                  <SendBackIcon size={15} />
                  {isEn ? "Send back" : "退回修改"}
                </button>
              </div>
            )}

            {revising === r.id && (
              <div className="mt-3">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={isEn
                    ? "What needs to change? (required)"
                    : "要改什麼？（必填，沒有理由的退件只會來回三次）"}
                  className="w-full rounded-lg border border-default-300 px-3 py-2 text-[14px] focus:border-default-500 focus:outline-none"
                />
                <button
                  onClick={() => reviseMut.mutate({ id: r.id, note })}
                  disabled={note.trim().length < 2 || reviseMut.isPending}
                  className="mt-2 rounded-lg bg-default-900 px-3 py-1.5 text-[14px] font-medium text-white disabled:opacity-40"
                >
                  {isEn ? "Send back with note" : "送出退回"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
