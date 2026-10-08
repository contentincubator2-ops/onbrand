/**
 * RefineNotesList — 「請 AI 改」輸入框下面的歷史修改意見（2026-10-08）。
 *
 * CJ「第一次請他減少故事感，再請他增加 CTA，故事感又很強……是否可呈現出歷史修改意見的紀錄」。
 *
 * 列出這個版本先前提過、AI 之後每次改寫都還會照著的意見；不要了就按 × 拿掉
 * （只影響之後的改寫，已經改好的文案不會變）。資料在伺服器（server refineNotes.ts），
 * 活動視窗與成品頁讀的是同一份。沒有意見時什麼都不畫。
 */
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../lib/trpc";
import { showToastGlobal } from "../../platform/components/Toast";
import type { RunContentMutationLocator } from "../lib/strategyContentEnvelope";

interface Note { id: number; feedback: string; explanation: string | null; createdAt: string }

export default function RefineNotesList({
  outputId, locator, en, canRemove = true,
}: {
  outputId: number;
  locator: RunContentMutationLocator;
  en: boolean;
  /** 審核中／已發布的稿不能再改，意見只看不動。 */
  canRemove?: boolean;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const utils = (trpc as any).useUtils();
  const q = (trpc as any).quickTask.refineNotes.useQuery(
    { outputId, ...locator },
    { enabled: outputId > 0, refetchOnWindowFocus: false, staleTime: 30_000 },
  );
  const removeMut = (trpc as any).quickTask.removeRefineNote.useMutation({
    onSuccess: () => utils?.quickTask?.refineNotes?.invalidate?.({ outputId }),
    onError: (e: any) => showToastGlobal(e?.message ?? L("沒有拿掉，再試一次", "Couldn't remove — try again")),
  });
  const notes: Note[] = q.data?.notes ?? [];
  if (!notes.length) return null;

  return (
    <div className="rounded-xl bg-default-50 px-3 py-2">
      <p className="text-tiny font-semibold text-default-700">
        {L(`先前的修改意見（${notes.length}）`, `Earlier feedback (${notes.length})`)}
        <span className="ml-1.5 font-normal text-default-500">
          {L("AI 每次改寫都會照著；不要了就拿掉。", "The AI keeps to these on every rewrite — remove any you no longer want.")}
        </span>
      </p>
      <ol className="mt-1.5 max-h-36 space-y-1 overflow-y-auto">
        {notes.map((n, i) => (
          <li key={n.id} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-default-800">
            <span className="w-4 shrink-0 text-right text-default-400">{i + 1}.</span>
            <span className="min-w-0 flex-1 break-words" title={n.explanation ?? undefined}>{n.feedback}</span>
            {canRemove && (
              <button
                type="button"
                aria-label={L("拿掉這條意見", "Remove this feedback")}
                className="shrink-0 px-1 text-default-400 hover:text-foreground disabled:opacity-40"
                disabled={removeMut.isPending}
                onClick={() => removeMut.mutate({ noteId: n.id })}
              >
                <FontAwesomeIcon icon={faXmark} className="text-[11px]" />
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
