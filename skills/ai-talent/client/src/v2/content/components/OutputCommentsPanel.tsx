/**
 * OutputCommentsPanel — 作品頁右欄「留言」分頁（2026-10-09）。
 *
 * CJ「團隊可以協作在同一個作品上留自己的修改意見」「還有其他人的意見區」。
 * 團隊成員（含只有檢視權限的）對這個版本留意見。每則可以：
 *   - 交給 AI 改：把這則意見原文送給主筆照著改，改完自動標成已處理
 *   - 已處理／重新開啟
 *   - 刪除（只有留言的人自己）
 * 已處理的收在下面一行，點了才展開。資料在 server outputCollab.ts。
 */
import React, { useState } from "react";
import { Button, Textarea } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { showToastGlobal } from "../../platform/components/Toast";
import type { RunContentMutationLocator } from "../lib/strategyContentEnvelope";
import { shortTime } from "./EditLogList";

export interface OutputComment {
  id: number;
  authorId: number;
  authorName: string | null;
  body: string;
  resolved: boolean;
  createdAt: string;
}

export function useOutputComments(outputId: number, locator: RunContentMutationLocator, enabled = true) {
  return (trpc as any).output.comments.useQuery(
    { id: outputId, ...locator },
    { enabled: enabled && outputId > 0, refetchOnWindowFocus: true, staleTime: 15_000 },
  );
}

export default function OutputCommentsPanel({
  outputId, locator, en, busy, onHandToAi,
}: {
  outputId: number;
  locator: RunContentMutationLocator;
  en: boolean;
  busy?: boolean;
  /** 把這則意見交給 AI 照著改；回傳有沒有改成。不給＝這篇現在不能改，只能留言。 */
  onHandToAi?: (c: OutputComment) => Promise<boolean>;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const utils = (trpc as any).useUtils();
  const q = useOutputComments(outputId, locator);
  const refresh = () => utils?.output?.comments?.invalidate?.({ id: outputId });
  const onErr = (e: any) => showToastGlobal(e?.message ?? L("沒有成功，再試一次", "Something went wrong. Try again."));
  const addMut = (trpc as any).output.addComment.useMutation({ onSuccess: refresh, onError: onErr });
  const resolveMut = (trpc as any).output.resolveComment.useMutation({ onSuccess: refresh, onError: onErr });
  const removeMut = (trpc as any).output.removeComment.useMutation({ onSuccess: refresh, onError: onErr });
  const [draft, setDraft] = useState("");
  const [handing, setHanding] = useState<number | null>(null);

  const rows: OutputComment[] = q.data?.rows ?? [];
  const me: number = q.data?.me ?? 0;
  const open = rows.filter((c) => !c.resolved);
  const done = rows.filter((c) => c.resolved);
  const linkBtn = "text-[12px] text-default-600 underline-offset-2 hover:text-default-900 hover:underline disabled:opacity-40";

  const hand = async (c: OutputComment) => {
    if (!onHandToAi) return;
    setHanding(c.id);
    try {
      if (await onHandToAi(c)) await resolveMut.mutateAsync({ commentId: c.id, resolved: true });
    } catch {
      /* onError 已經跳過提示 */
    } finally {
      setHanding(null);
    }
  };

  const row = (c: OutputComment) => (
    <li key={c.id} className="border-b border-default-100 pb-2.5 last:border-b-0">
      <p className="flex items-baseline gap-1.5 text-[12px] text-default-500">
        <span className="font-semibold text-default-800">{c.authorName ?? L("團隊成員", "Teammate")}</span>
        <span className="ml-auto tabular-nums">{shortTime(c.createdAt, en)}</span>
      </p>
      <p className={`mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed ${c.resolved ? "text-default-500" : "text-default-900"}`}>{c.body}</p>
      <div className="mt-1 flex items-center gap-3">
        {!c.resolved && onHandToAi && (
          <button type="button" className={linkBtn} disabled={busy || handing !== null} onClick={() => void hand(c)}>
            {handing === c.id ? L("AI 修改中…", "AI is editing…") : L("交給 AI 改", "Have AI apply this")}
          </button>
        )}
        <button
          type="button" className={linkBtn} disabled={resolveMut.isPending || handing !== null}
          onClick={() => resolveMut.mutate({ commentId: c.id, resolved: !c.resolved })}
        >
          {c.resolved ? L("重新開啟", "Reopen") : L("已處理", "Mark done")}
        </button>
        {c.authorId === me && (
          <button type="button" className={`${linkBtn} ml-auto`} disabled={removeMut.isPending} onClick={() => removeMut.mutate({ commentId: c.id })}>
            {L("刪除", "Delete")}
          </button>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="py-4 text-center text-[13px] leading-relaxed text-default-500">
          {q.isLoading ? L("載入中…", "Loading…") : L("團隊成員對這篇的意見會列在這裡，可以一則一則交給 AI 改。", "Your team's feedback on this post shows up here. Hand any of it to the AI to apply.")}
        </p>
      ) : (
        <>
          {open.length > 0 && <ol className="space-y-2.5">{open.map(row)}</ol>}
          {done.length > 0 && (
            <details className="text-[12px]">
              <summary className="cursor-pointer select-none text-default-500">{L(`已處理 ${done.length} 則`, `${done.length} done`)}</summary>
              <ol className="mt-2 space-y-2.5">{done.map(row)}</ol>
            </details>
          )}
        </>
      )}
      <div className="space-y-2 border-t border-default-100 pt-3">
        <Textarea
          aria-label={L("留下你的意見", "Leave a comment")}
          placeholder={L("留下你的意見，例如：第二段太長", "Leave a comment — e.g. the second paragraph is too long")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          minRows={2}
          maxLength={2000}
        />
        <Button
          fullWidth variant="flat"
          isDisabled={!draft.trim()}
          isLoading={addMut.isPending}
          onPress={async () => {
            await addMut.mutateAsync({ id: outputId, ...locator, body: draft.trim() }).then(() => setDraft("")).catch(() => {});
          }}
        >
          {L("留言", "Comment")}
        </Button>
      </div>
    </div>
  );
}
