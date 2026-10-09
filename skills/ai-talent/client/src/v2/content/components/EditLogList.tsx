/**
 * EditLogList — 作品頁右欄「紀錄」分頁（2026-10-09）。
 *
 * CJ「你還缺乏了每次對話修改紀錄」。AI 對這個版本做過的每一次修改：誰、請它做什麼、
 * 它說改了什麼。
 *
 * CJ「紀錄，可以選擇要哪幾個紀錄嗎？例如…我想要開頭短一點，但不要反差開場了」：
 * 每一筆前面有勾選框，打勾＝這一筆現在算數。把不要的取消勾選，按「只保留勾選的」，
 * 就會回到原稿、只把勾著的那幾筆重新套一次（editLogSelection.ts）。
 * 另外每一筆仍然可以「回到這次修改之前」。兩種動作本身都會留一筆，所以不會改丟。
 *
 * 用戶自己打字的修改不在這裡（自動存檔太頻繁，記了只會洗版）。資料在 server outputCollab.ts。
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import type { RunContentMutationLocator } from "../lib/strategyContentEnvelope";
import { buildRebuildPlan, effectiveIds, isSelectable, sameIds, type EditKind, type RebuildPlan } from "../lib/editLogSelection";

export interface EditLogRow {
  id: number;
  actorName: string | null;
  kind: EditKind;
  ask: string | null;
  explanation: string | null;
  ref: string | null;
  captionBefore: string;
  createdAt: string;
}

export function editKindLabel(kind: EditLogRow["kind"], en: boolean): string {
  switch (kind) {
    case "restyle": return en ? "New structure" : "換個寫法";
    case "voice": return en ? "New voice" : "換口氣";
    case "comment": return en ? "From a comment" : "照留言改";
    case "restore": return en ? "Restored" : "還原";
    case "rebuild": return en ? "Rebuilt" : "重新整理";
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
  outputId, locator, en, top, busy, onRestore, onRebuild,
}: {
  outputId: number;
  locator: RunContentMutationLocator;
  en: boolean;
  /** 列表上方的東西（AI 之後每次改寫都還會照著的意見）。 */
  top?: React.ReactNode;
  busy?: boolean;
  /** 回到這一筆修改之前的文字。不給＝只能看（審核中／已發布）。 */
  onRestore?: (row: EditLogRow) => void;
  /** 回到原稿、只重套勾選的那幾筆。不給＝不顯示勾選框。 */
  onRebuild?: (args: { plan: RebuildPlan; dropped: EditLogRow[]; original: string }) => Promise<void> | void;
}) {
  const q = useEditLog(outputId, locator);
  const rows: EditLogRow[] = q.data?.rows ?? [];
  const original: string | null = q.data?.original ?? null;
  const canPick = !!onRebuild && !!original;

  const effective = useMemo(() => effectiveIds(rows), [rows]);
  const effectiveKey = effective.join(",");
  const [picked, setPicked] = useState<Set<number>>(new Set(effective));
  // 紀錄有變（剛改完一次、剛重新整理完）就照最新的狀態重設勾選。
  useEffect(() => { setPicked(new Set(effective)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [effectiveKey]);
  const changed = canPick && !sameIds(picked, effective);
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-3">
      {top}
      {changed && (
        <div className="space-y-1.5 rounded-lg bg-default-100 p-2.5">
          <p className="text-[12.5px] leading-relaxed text-default-700">
            {picked.size === 0
              ? (en ? "Nothing is ticked — this goes back to the original draft." : "一筆都沒勾：會回到最一開始的原稿。")
              : (en
                ? `Goes back to the original draft and re-applies only the ${picked.size} ticked. Anything you typed by hand after that is not kept.`
                : `會回到原稿，只把勾著的 ${picked.size} 筆重新套一次。你之後自己動手改的字不會留著。`)}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm" className="flex-1 bg-default-900 font-medium text-white"
              isDisabled={busy} isLoading={busy}
              onPress={() => {
                if (!original) return;
                const plan = buildRebuildPlan(rows, picked);
                const keep = new Set(plan.keptIds);
                void onRebuild?.({ plan, dropped: rows.filter((r) => isSelectable(r) && effective.includes(r.id) && !keep.has(r.id)), original });
              }}
            >
              {en ? "Keep only the ticked" : "只保留勾選的"}
            </Button>
            <Button size="sm" variant="flat" isDisabled={busy} onPress={() => setPicked(new Set(effective))}>{en ? "Cancel" : "取消"}</Button>
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] leading-relaxed text-default-500">
          {q.isLoading
            ? (en ? "Loading…" : "載入中…")
            : (en ? "Every change the AI makes to this post is listed here. Untick the ones you no longer want." : "AI 每改一次這篇，這裡就多一筆；不要的可以取消勾選。")}
        </p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r) => {
            const pickable = canPick && isSelectable(r);
            const on = picked.has(r.id);
            const dim = pickable && !on;
            return (
              <li key={r.id} className="flex gap-2 border-b border-default-100 pb-2.5 last:border-b-0">
                {canPick && (
                  <span className="w-4 shrink-0 pt-0.5">
                    {pickable && (
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={busy}
                        onChange={() => toggle(r.id)}
                        aria-label={en ? `Keep: ${r.ask ?? editKindLabel(r.kind, true)}` : `保留：${r.ask ?? editKindLabel(r.kind, false)}`}
                        className="h-3.5 w-3.5 cursor-pointer accent-neutral-900"
                      />
                    )}
                  </span>
                )}
                <div className={`min-w-0 flex-1 ${dim ? "opacity-50" : ""}`}>
                  <p className="flex items-baseline gap-1.5 text-[12px] text-default-500">
                    <span className="font-semibold text-default-800">{editKindLabel(r.kind, en)}</span>
                    {r.actorName && <span>{r.actorName}</span>}
                    <span className="ml-auto tabular-nums">{shortTime(r.createdAt, en)}</span>
                  </p>
                  {r.ask && <p className={`mt-0.5 break-words text-[13px] leading-relaxed text-default-900 ${dim ? "line-through" : ""}`}>{r.ask}</p>}
                  {r.explanation && <p className="mt-0.5 break-words text-[12.5px] leading-relaxed text-default-500">{r.explanation}</p>}
                  {onRestore && !changed && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRestore(r)}
                      className="mt-1 text-[12px] text-default-600 underline-offset-2 hover:text-default-900 hover:underline disabled:opacity-40"
                    >
                      {en ? "Go back to before this change" : "回到這次修改之前"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
