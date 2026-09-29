/**
 * AdoptConfirmDialog — 採用一項策略調整前的確認視窗。
 *
 * 2026-09-26（CJ「如果採用會影響到品牌大腦的時候，要出現一些提示，讓用戶知道」）：
 * 寫入前一定先讓用戶看到三件事——
 *   1. 這會寫進品牌大腦（最上面、最醒目）
 *   2. 會影響哪裡、哪些東西不會自動跟著變
 *   3. 哪幾個欄位、改動前後各是什麼
 * 定案（鎖定）的品牌要多勾一次「我確認要修改已定案的定位」。
 * 也可以選「只記錄決定、不寫入」——用戶可能想自己到定位頁改措辭。
 */
import { useEffect, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { showToastGlobal } from "../../../../components/ui/Toast";
import type { AdoptPreview } from "./meetingModel";
import { CloseIcon, FlagIcon } from "../../../platform/components/icons";

export interface AdoptRequest { runId: number; anchorId: string; label: string; status: "adopted" | "modified"; text: string }

const btnPrimary = "rounded-full bg-neutral-900 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40";
const btnQuiet = "rounded-full border border-neutral-300 px-3 py-1.5 text-[12.5px] font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-40";

const show = (v: string | string[]) => (Array.isArray(v) ? v.join("、") : v);

export default function AdoptConfirmDialog({ req, en, onClose, onDone }: {
  req: AdoptRequest; en: boolean; onClose: () => void; onDone: () => void;
}) {
  const T = trpc as any;
  const [preview, setPreview] = useState<AdoptPreview | null>(null);
  const [lockedOk, setLockedOk] = useState(false);
  const previewMut = T.strategyMeeting?.previewAdopt?.useMutation?.({
    onSuccess: (r: AdoptPreview) => setPreview(r),
    onError: (e: any) => { showToastGlobal(String(e?.message ?? "error"), "error"); onClose(); },
  });
  const adoptMut = T.strategyMeeting?.adopt?.useMutation?.({
    onSuccess: (r: any) => {
      showToastGlobal(r?.decision?.versionId
        ? (en ? "Written to Brand Brain" : "已寫入品牌大腦，之後的產出會用新內容")
        : (en ? "Decision recorded" : "已記錄決定"), "success");
      onDone();
    },
    onError: (e: any) => showToastGlobal(String(e?.message ?? "error"), "error"),
  });
  useEffect(() => {
    previewMut?.mutate?.({ runId: req.runId, anchorId: req.anchorId, text: req.text });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (write: boolean) => adoptMut?.mutate?.({
    runId: req.runId, anchorId: req.anchorId, status: req.status,
    note: req.status === "modified" ? req.text : undefined,
    write, patch: write ? preview?.patch : undefined, confirmLocked: write && preview?.locked ? lockedOk : undefined,
  });

  const canWrite = !!preview?.writable && preview.diffs.length > 0 && (!preview.locked || lockedOk);
  const busy = adoptMut?.isPending;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-[640px] overflow-y-auto rounded-2xl bg-white px-6 py-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-[16px] font-semibold text-neutral-900">
            {en ? `Adopt the change to “${req.label}”` : `採用「${req.label}」的調整`}
          </h3>
          <button type="button" onClick={onClose} className="text-[13px] text-neutral-400 hover:text-neutral-900"><CloseIcon size={13} /></button>
        </div>

        {!preview ? (
          <p className="py-8 text-center text-[13px] text-neutral-500">
            {en ? "Working out exactly what would change in your Brand Brain…" : "正在整理這項調整會改動品牌大腦的哪些內容…"}
          </p>
        ) : !preview.writable ? (
          <>
            <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[13px] leading-relaxed text-neutral-700">{preview.note}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btnQuiet} onClick={onClose}>{en ? "Cancel" : "取消"}</button>
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => submit(false)}>{en ? "Record decision" : "記錄決定"}</button>
            </div>
          </>
        ) : (
          <>
            {/* 1 醒目提示 */}
            <div className="rounded-xl border-2 border-neutral-900 px-4 py-3">
              <p className="text-[14px] font-semibold text-neutral-900">
                <FlagIcon size={12} /> {preview.brief && !preview.brief.changed
                  ? (en ? "This changes your positioning — but NOT what task cards write" : "這項決定會改動定位，但不會改變任務卡產出的內容")
                  : (en ? "This will change your Brand Brain" : "這項決定會改動品牌大腦")}
              </p>
              <p className="mt-1.5 text-[12.5px] font-medium text-neutral-700">{en ? "Once written, it affects:" : "寫入後會影響："}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] leading-relaxed text-neutral-700">
                {preview.impact.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
              <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">{preview.notUpdated}</p>
            </div>

            {/* 2 前後對照 */}
            <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-widest text-neutral-400">{en ? "What changes" : "改動內容"}</p>
            {preview.diffs.length === 0 ? (
              <p className="rounded-xl border border-neutral-200 px-4 py-3 text-[13px] text-neutral-600">
                {en ? "Nothing to write — the Brand Brain already says this." : "沒有需要寫入的變更——品牌大腦目前的內容已經是這樣。"}
              </p>
            ) : (
              <div className="space-y-2.5">
                {preview.diffs.map((d) => (
                  <div key={d.key} className="rounded-xl border border-neutral-200 px-4 py-3">
                    <p className="text-[12.5px] font-semibold text-neutral-900">{d.label}</p>
                    <div className="mt-1.5 grid grid-cols-[44px_1fr] gap-x-3 gap-y-1 text-[13px] leading-relaxed">
                      <span className="text-neutral-400">{en ? "Before" : "改前"}</span>
                      <span className="text-neutral-500 line-through decoration-neutral-300">{show(d.before) || (en ? "(empty)" : "（空白）")}</span>
                      <span className="text-neutral-400">{en ? "After" : "改後"}</span>
                      <span className="font-medium text-neutral-900">{show(d.after)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 2b 產文簡報的實際變化——算出來的，不是猜的 */}
            {preview.diffs.length > 0 && preview.brief && (
              <>
                <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-widest text-neutral-400">
                  {en ? "What task cards will read" : "任務卡產文讀到的簡報"}
                </p>
                {preview.brief.changed ? (
                  <div className="space-y-1 rounded-xl border border-neutral-200 px-4 py-3 text-[12.5px] leading-relaxed">
                    {preview.brief.removed.map((l, i) => (
                      <p key={`r${i}`} className="text-neutral-400 line-through decoration-neutral-300">− {l}</p>
                    ))}
                    {preview.brief.added.map((l, i) => (
                      <p key={`a${i}`} className="font-medium text-neutral-900">＋ {l}</p>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-neutral-900 bg-neutral-50 px-4 py-3 text-[13px] leading-relaxed text-neutral-800">
                    {en
                      ? "The fields changed here are not part of the brief task cards read. Writing is still possible (the positioning page and the next meeting will show it), but copy from task cards won't change. To make it take effect, adopt with changes and put the point into the summary or the one-line reason to win."
                      : "這次改的欄位不在任務卡產文讀的簡報裡。仍然可以寫入（定位頁與下一場會議看得到），但任務卡產出的文案不會因此改變。要讓它生效，請用「修改後採用」，把重點寫進差異化總結或唯一致勝理由。"}
                  </p>
                )}
              </>
            )}

            {/* 3 定案確認 */}
            {preview.locked && preview.diffs.length > 0 && (
              <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-[13px] text-neutral-800">
                <input type="checkbox" className="mt-0.5" checked={lockedOk} onChange={(e) => setLockedOk(e.target.checked)} />
                <span>
                  {en ? "This brand's positioning is finalized (locked). I confirm I want to change it."
                      : "這個品牌的定位已經定案（鎖定）。我確認要修改已定案的定位。"}
                </span>
              </label>
            )}

            <p className="mt-4 text-[12px] text-neutral-500">
              {en ? "You can undo this later from the minutes — the Brand Brain will be restored to what it is now."
                  : "之後可以在會議紀錄按「撤回並復原」，品牌大腦會回到現在的內容。"}
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className={btnQuiet} onClick={onClose}>{en ? "Cancel" : "取消"}</button>
              <button type="button" className={btnQuiet} disabled={busy} onClick={() => submit(false)}>
                {en ? "Record decision only" : "只記錄決定、不寫入"}
              </button>
              <button type="button" className={btnPrimary} disabled={!canWrite || busy} onClick={() => submit(true)}>
                {en ? "Write to Brand Brain" : "確認寫入品牌大腦"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
