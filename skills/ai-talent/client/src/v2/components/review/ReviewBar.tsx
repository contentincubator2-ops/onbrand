/**
 * ReviewBar — 產出頁上的送審／狀態列。
 *
 * 2026-09-06。沒有這條，`/review` 佇列永遠是空的：後端能收送審、前台有
 * 佇列頁，但沒有任何入口把稿子送進去。
 *
 * 顯示邏輯刻意跟著狀態走，而不是永遠顯示「送審」：
 *   還沒送     → 送審按鈕
 *   審核中     → 唯讀狀態（重複送會被後端擋，但更該做的是別讓他點）
 *   退回修改   → 顯示理由 + 可再送一次
 *   已放行     → 綠色狀態，不再顯示按鈕
 *
 * 字級 13–14px。全站有 368 處 text-[10px]/[11px]，新元件不再往下加。
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { showToastGlobal } from "../../../components/ui/Toast";
import { CheckCircle2, Clock, RotateCcw, Send } from "lucide-react";

export default function ReviewBar({
  outputId, missionId,
}: { outputId: number; missionId: number | null | undefined }) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const q = (trpc as any).review?.statusFor?.useQuery
    ? (trpc as any).review.statusFor.useQuery({ outputId }, { enabled: Number.isFinite(outputId) })
    : { data: undefined, refetch: () => {} };

  const submitMut = (trpc as any).review?.submit?.useMutation?.({
    onSuccess: () => {
      showToastGlobal(isEn ? "Sent for review" : "已送審");
      setOpen(false);
      setNote("");
      q.refetch?.();
    },
    onError: (e: any) => showToastGlobal(e?.message ?? (isEn ? "Failed" : "送審失敗")),
  });

  // 沒有 missionId 就沒辦法送審（審核是綁在 mission 上的）。
  // 這種產出不顯示這條，而不是顯示一個按了會錯的按鈕。
  if (!missionId) return null;

  const st = q.data as
    | { status: string; revisionNote: string | null; mine: boolean }
    | null
    | undefined;

  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div className="mb-3 mx-1 flex flex-wrap items-center gap-2 rounded-lg border border-default-200 bg-default-50 px-3 py-2">
      {children}
    </div>
  );

  if (st?.status === "approved") {
    return (
      <Wrap>
        <CheckCircle2 size={15} className="text-emerald-600" />
        <span className="text-[14px] font-medium text-emerald-700">
          {isEn ? "Approved" : "已放行"}
        </span>
        <span className="text-[13px] text-default-500">
          {isEn ? "This version has been signed off." : "這個版本已通過審核。"}
        </span>
      </Wrap>
    );
  }

  if (st?.status === "pending" || st?.status === "in_review") {
    return (
      <Wrap>
        <Clock size={15} className="text-amber-600" />
        <span className="text-[14px] font-medium text-amber-700">
          {isEn ? "In review" : "審核中"}
        </span>
        <span className="text-[13px] text-default-500">
          {isEn ? "Waiting for someone else to approve." : "等待其他人放行。"}
        </span>
        <button
          onClick={() => navigate("/review")}
          className="ml-auto text-[13px] font-medium text-default-600 underline-offset-2 hover:underline"
        >
          {isEn ? "Open queue" : "打開審核佇列"}
        </button>
      </Wrap>
    );
  }

  const wasSentBack = st?.status === "revision_requested";

  return (
    <div className="mb-3 mx-1 rounded-lg border border-default-200 bg-default-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {wasSentBack ? (
          <>
            <RotateCcw size={15} className="text-rose-600" />
            <span className="text-[14px] font-medium text-rose-700">
              {isEn ? "Sent back for revision" : "已退回修改"}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-default-500">
            {isEn
              ? "Content goes live only after someone other than the author approves it."
              : "產出要由作者以外的人放行才會上線。"}
          </span>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-default-900 px-3 py-1.5 text-[14px] font-medium text-white hover:bg-default-800"
        >
          <Send size={14} />
          {wasSentBack
            ? (isEn ? "Resubmit" : "改好了，再送一次")
            : (isEn ? "Send for review" : "送審")}
        </button>
      </div>

      {wasSentBack && st?.revisionNote && (
        <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
          {isEn ? "Revision note: " : "退回理由："}{st.revisionNote}
        </p>
      )}

      {open && (
        <div className="mt-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={isEn
              ? "Anything the reviewer should know? (optional)"
              : "有什麼要讓審核的人知道的？（選填）"}
            className="w-full rounded-lg border border-default-300 px-3 py-2 text-[14px] focus:border-default-500 focus:outline-none"
          />
          <button
            onClick={() => submitMut?.mutate?.({ missionId, outputId, note: note || undefined })}
            disabled={submitMut?.isPending}
            className="mt-2 rounded-lg bg-default-900 px-3 py-1.5 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {isEn ? "Confirm and send" : "確認送審"}
          </button>
        </div>
      )}
    </div>
  );
}
