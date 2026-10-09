/**
 * EditLogList — 作品頁右欄「紀錄」分頁（2026-10-09）。
 *
 * CJ「你還缺乏了每次對話修改紀錄」。AI 對這個版本做過的每一次修改：誰、請它做什麼、
 * 它說改了什麼。每一筆都能「回到這次修改之前」—— 還原本身也會留一筆，所以不會改丟。
 * 用戶自己打字的修改不在這裡（自動存檔太頻繁，記了只會洗版）。資料在 server outputCollab.ts。
 */
import React from "react";
import { trpc } from "../../../lib/trpc";
import type { RunContentMutationLocator } from "../lib/strategyContentEnvelope";

export interface EditLogRow {
  id: number;
  actorName: string | null;
  kind: "chat" | "restyle" | "voice" | "comment" | "restore";
  ask: string | null;
  explanation: string | null;
  captionBefore: string;
  createdAt: string;
}

export function editKindLabel(kind: EditLogRow["kind"], en: boolean): string {
  switch (kind) {
    case "restyle": return en ? "New structure" : "換個寫法";
    case "voice": return en ? "New voice" : "換口氣";
    case "comment": return en ? "From a comment" : "照留言改";
    case "restore": return en ? "Restored" : "還原";
    default: return en ? "Asked AI" : "請他改";
  }
}

export function shortTime(iso: string, en: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(en ? "en-US" : "zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function useEditLog(outputId: number, locator: RunContentMutationLocator, enabled = true) {
  return (trpc as any).output.editLog.useQuery(
    { id: outputId, ...locator },
    { enabled: enabled && outputId > 0, refetchOnWindowFocus: false, staleTime: 30_000 },
  );
}

export default function EditLogList({
  outputId, locator, en, top, busy, onRestore,
}: {
  outputId: number;
  locator: RunContentMutationLocator;
  en: boolean;
  /** 列表上方的東西（AI 之後每次改寫都還會照著的意見）。 */
  top?: React.ReactNode;
  busy?: boolean;
  /** 回到這一筆修改之前的文字。不給＝只能看（審核中／已發布）。 */
  onRestore?: (row: EditLogRow) => void;
}) {
  const q = useEditLog(outputId, locator);
  const rows: EditLogRow[] = q.data?.rows ?? [];

  return (
    <div className="space-y-3">
      {top}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] leading-relaxed text-default-500">
          {q.isLoading
            ? (en ? "Loading…" : "載入中…")
            : (en ? "Every change the AI makes to this post is listed here, and you can go back to any of them." : "AI 每改一次這篇，這裡就多一筆；每一筆都可以回到修改之前。")}
        </p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.id} className="border-b border-default-100 pb-2.5 last:border-b-0">
              <p className="flex items-baseline gap-1.5 text-[12px] text-default-500">
                <span className="font-semibold text-default-800">{editKindLabel(r.kind, en)}</span>
                {r.actorName && <span>{r.actorName}</span>}
                <span className="ml-auto tabular-nums">{shortTime(r.createdAt, en)}</span>
              </p>
              {r.ask && <p className="mt-0.5 break-words text-[13px] leading-relaxed text-default-900">{r.ask}</p>}
              {r.explanation && <p className="mt-0.5 break-words text-[12.5px] leading-relaxed text-default-500">{r.explanation}</p>}
              {onRestore && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRestore(r)}
                  className="mt-1 text-[12px] text-default-600 underline-offset-2 hover:text-default-900 hover:underline disabled:opacity-40"
                >
                  {en ? "Go back to before this change" : "回到這次修改之前"}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
