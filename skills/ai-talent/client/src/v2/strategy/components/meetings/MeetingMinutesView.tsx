/**
 * MeetingMinutesView — 一份會議紀錄。範例與真實紀錄共用同一個元件，範例時
 * readOnly（按鈕停用），所以用戶在範例看到的樣子就是之後真的會拿到的樣子。
 *
 * 版面順序刻意是「結論 → 策略要不要調整 → 各總監說了什麼 → 會後要做的事」：
 * 用戶打開紀錄最想知道的是要不要動策略，逐字發言放最後、預設收合。
 */
import { useState } from "react";
import type { Cite, Decision, DecisionStatus, MeetingAction, MeetingMinutes, MeetingRun, MeetingSource } from "./meetingModel";
import { decisionLabel, isWritableAnchor } from "./meetingModel";

interface Props {
  minutes: MeetingMinutes;
  evidence: MeetingRun["evidence"];
  decisions: Record<string, Decision>;
  transcript?: MeetingRun["transcript"];
  en: boolean;
  readOnly?: boolean;
  busy?: boolean;
  /** 範圍決定哪些格子「採用」會寫進品牌大腦。 */
  scope?: "brand" | "product";
  /** 不採用（rejected）或撤回（null；有寫入的話伺服器會一併復原）。 */
  onDecide?: (anchorId: string, status: Extract<DecisionStatus, "rejected"> | null) => void;
  /** 採用／修改後採用：打開確認視窗（預覽寫入內容與影響）。 */
  onAdopt?: (anchorId: string, label: string, status: "adopted" | "modified", text: string) => void;
  onEditPositioning?: () => void;
  /** 開這個行動對應的任務卡（有 taskId 才會出現按鈕）。 */
  onOpenTask?: (action: MeetingAction) => void;
  /** 跳到出處那一頁。 */
  onOpenSource?: (href: string) => void;
}

/**
 * 出處清單：品牌資料（S，連到 OnBrand 那一頁、附逐字原文）＋市場情報（E）。
 * 2026-09-26（CJ「指出的問題，我希望都可以引用到該頁面的證據」）。
 */
function Sources({ cites, evidenceIdx, sources, evidence, en, onOpenSource }: {
  cites: Cite[]; evidenceIdx: number[]; sources: MeetingSource[]; evidence: MeetingRun["evidence"]; en: boolean;
  onOpenSource?: (href: string) => void;
}) {
  const s = cites.map((c) => ({ c, src: sources.find((x) => x.code === c.code) })).filter((x) => x.src);
  const e = evidenceIdx.map((i) => ({ i, ev: evidence[i] })).filter((x) => x.ev);
  if (!s.length && !e.length) {
    return <span className="text-neutral-500">{en ? "Discussion only — no page or market evidence cited" : "會中討論（沒有引用到頁面資料或市場情報）"}</span>;
  }
  return (
    <div className="space-y-1">
      {s.map(({ c, src }) => (
        <div key={c.code} className="text-[12.5px] leading-relaxed">
          <span className="font-mono text-neutral-400">{c.code}</span>{" "}
          <span className="text-neutral-700">{src!.label}</span>
          {c.quote && <span className="text-neutral-900">　「{c.quote}」</span>}
          {src!.href && onOpenSource && (
            <button type="button" onClick={() => onOpenSource(src!.href)}
              className="ml-1.5 text-[12px] text-neutral-400 underline hover:text-neutral-900">{en ? "open page →" : "到這一頁 →"}</button>
          )}
        </div>
      ))}
      {e.map(({ i, ev }) => (
        <div key={`E${i}`} className="text-[12.5px] leading-relaxed">
          <span className="font-mono text-neutral-400">E{i + 1}</span>{" "}
          {ev!.url ? <a href={ev!.url} target="_blank" rel="noreferrer" className="underline decoration-neutral-300 hover:decoration-neutral-900">{ev!.title}</a> : ev!.title}
          {ev!.date && <span className="ml-1.5 font-mono text-neutral-400">{ev!.date}</span>}
        </div>
      ))}
    </div>
  );
}

const pill = "rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition";

/** 「目前」那格可能是整段語氣規範（含範例句、禁用詞），預設只露前 90 字。 */
function Clamp({ text, en, max = 90 }: { text: string; en: boolean; max?: number }) {
  const [open, setOpen] = useState(false);
  if (text.length <= max) return <>{text}</>;
  return (
    <>
      {open ? text : `${text.slice(0, max)}…`}
      <button type="button" onClick={() => setOpen((v) => !v)} className="ml-1.5 text-[12px] text-neutral-400 underline hover:text-neutral-900">
        {open ? (en ? "less" : "收起") : (en ? "more" : "展開")}
      </button>
    </>
  );
}

export default function MeetingMinutesView({
  minutes, evidence, decisions, transcript, en, readOnly, busy, scope = "brand", onDecide, onAdopt, onEditPositioning, onOpenTask, onOpenSource,
}: Props) {
  const sources = minutes.sources ?? [];
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const adjust = minutes.checks.filter((c) => c.verdict === "adjust");
  const keep = minutes.checks.filter((c) => c.verdict === "keep");

  return (
    <div className="space-y-6">
      {/* 結論 */}
      <section>
        <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-widest text-neutral-400">{en ? "Conclusion" : "會議結論"}</h4>
        <p className="text-[14px] leading-relaxed text-neutral-900">{minutes.summary}</p>
      </section>

      {/* 策略檢查 */}
      <section>
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-neutral-400">
          {en ? "Strategy check" : "策略檢查"}
          <span className="ml-2 font-mono normal-case tracking-normal text-neutral-500">
            {en ? `${adjust.length} to adjust · ${keep.length} keep` : `建議調整 ${adjust.length}・維持 ${keep.length}`}
          </span>
        </h4>
        {adjust.length === 0 && (
          <p className="mb-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-[13px] text-neutral-600">
            {en ? "No changes proposed — the strategy holds." : "這次沒有建議調整，策略維持。"}
          </p>
        )}
        <div className="space-y-2.5">
          {adjust.map((c) => {
            const d = decisions[c.anchorId];
            return (
              <div key={c.anchorId} className="rounded-xl border border-neutral-900 bg-white px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-neutral-900">{c.label}</span>
                  <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white">{en ? "Adjust" : "建議調整"}</span>
                  {c.raisedBy && <span className="text-[12px] text-neutral-500">{en ? `raised by ${c.raisedBy}` : `由 ${c.raisedBy} 提出`}</span>}
                </div>
                <dl className="mt-2.5 grid grid-cols-[64px_1fr] gap-x-3 gap-y-1.5 text-[13px] leading-relaxed">
                  <dt className="text-neutral-400">{en ? "Now" : "目前"}</dt>
                  <dd className="text-neutral-500"><Clamp text={c.current || (en ? "(empty)" : "（未填）")} en={en} /></dd>
                  <dt className="text-neutral-400">{en ? "Proposed" : "建議"}</dt>
                  <dd className="font-medium text-neutral-900">{c.proposal}</dd>
                  <dt className="text-neutral-400">{en ? "Why" : "理由"}</dt>
                  <dd className="text-neutral-700">{c.reason}</dd>
                  <dt className="text-neutral-400">{en ? "Basis" : "依據"}</dt>
                  <dd className="text-neutral-700">
                    <Sources cites={c.cites ?? []} evidenceIdx={c.evidence} sources={sources} evidence={evidence} en={en} onOpenSource={readOnly ? undefined : onOpenSource} />
                  </dd>
                </dl>

                {!d && (
                  <p className="mt-2.5 text-[12px] text-neutral-500">
                    {isWritableAnchor(scope, c.anchorId)
                      ? (en ? "⚑ Adopting writes this into your Brand Brain — every task card after this will use it. You'll see exactly what changes before it's written."
                            : "⚑ 採用會寫入品牌大腦，之後所有任務卡產文都會用新的內容。寫入前會先讓你看改動前後的對照。")
                      : (en ? "This cell is research evidence — adopting only records your decision." : "這一格是研究證據，採用只會記錄決定，不會寫入品牌大腦。")}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                  {d ? (
                    <>
                      <span className="text-[12.5px] font-medium text-neutral-900">✓ {decisionLabel(d.status, en)}</span>
                      {d.versionId ? (
                        <span className="rounded-full border border-neutral-900 px-2 py-0.5 text-[11.5px] text-neutral-900">
                          {en ? `Written to Brand Brain: ${(d.written ?? []).join(", ")}` : `已寫入品牌大腦：${(d.written ?? []).join("、")}`}
                        </span>
                      ) : d.status !== "rejected" ? (
                        <span className="text-[12px] text-neutral-500">{en ? "(decision only — Brand Brain unchanged)" : "（只記錄決定，品牌大腦沒有改）"}</span>
                      ) : null}
                      {d.note && d.status === "modified" && !d.versionId && <span className="text-[12.5px] text-neutral-500">「{d.note}」</span>}
                      {!readOnly && (
                        <button type="button" disabled={busy}
                          onClick={() => {
                            if (d.versionId && !window.confirm(en ? "Undo this decision? Brand Brain will be restored to what it was before." : "撤回這個決定？品牌大腦會復原成寫入前的內容。")) return;
                            onDecide?.(c.anchorId, null);
                          }}
                          className="text-[12px] text-neutral-400 underline hover:text-neutral-900">
                          {d.versionId ? (en ? "Undo & restore" : "撤回並復原") : (en ? "Undo" : "撤回")}
                        </button>
                      )}
                      {!readOnly && d.status !== "rejected" && !d.versionId && onEditPositioning && (
                        <button type="button" onClick={onEditPositioning}
                          className={`${pill} ml-auto border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white`}>
                          {en ? "Edit positioning →" : "到定位頁修改 →"}
                        </button>
                      )}
                    </>
                  ) : noteFor === c.anchorId ? (
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} autoFocus maxLength={600}
                        placeholder={en ? "What do you change?" : "你要改成什麼？"}
                        className="min-w-[200px] flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] outline-none focus:border-neutral-900" />
                      <button type="button" disabled={busy || !noteDraft.trim()}
                        onClick={() => { onAdopt?.(c.anchorId, c.label, "modified", noteDraft.trim()); setNoteFor(null); setNoteDraft(""); }}
                        className={`${pill} border-neutral-900 bg-neutral-900 text-white disabled:opacity-40`}>{en ? "Save" : "儲存"}</button>
                      <button type="button" onClick={() => setNoteFor(null)} className="text-[12px] text-neutral-500 underline">{en ? "Cancel" : "取消"}</button>
                    </div>
                  ) : (
                    <>
                      <span className="mr-1 text-[12px] text-neutral-500">{en ? "Your call:" : "你的決定："}</span>
                      <button type="button" disabled={readOnly || busy} onClick={() => onAdopt?.(c.anchorId, c.label, "adopted", c.proposal)}
                        className={`${pill} border-neutral-900 text-neutral-900 enabled:hover:bg-neutral-900 enabled:hover:text-white disabled:opacity-50`}>{en ? "Adopt" : "採用"}</button>
                      <button type="button" disabled={readOnly || busy} onClick={() => { setNoteFor(c.anchorId); setNoteDraft(c.proposal); }}
                        className={`${pill} border-neutral-300 text-neutral-700 enabled:hover:border-neutral-900 disabled:opacity-50`}>{en ? "Adopt with changes" : "修改後採用"}</button>
                      <button type="button" disabled={readOnly || busy} onClick={() => onDecide?.(c.anchorId, "rejected")}
                        className={`${pill} border-neutral-300 text-neutral-500 enabled:hover:border-neutral-900 disabled:opacity-50`}>{en ? "Don't adopt" : "不採用"}</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {keep.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
              {keep.map((c) => (
                <div key={c.anchorId} className="flex gap-3 border-b border-neutral-100 py-2 text-[13px] last:border-0">
                  <span className="w-[88px] shrink-0 font-medium text-neutral-900">{c.label}</span>
                  <span className="w-[40px] shrink-0 text-neutral-400">{en ? "Keep" : "維持"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-neutral-600">{c.reason}</p>
                    {((c.cites ?? []).length > 0 || c.evidence.length > 0) && (
                      <div className="mt-1"><Sources cites={c.cites ?? []} evidenceIdx={c.evidence} sources={sources} evidence={evidence} en={en} onOpenSource={readOnly ? undefined : onOpenSource} /></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 各總監發言 */}
      {minutes.remarks.length > 0 && (
        <section>
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-neutral-400">{en ? "Who said what" : "各總監怎麼說"}</h4>
          <div className="space-y-1.5">
            {minutes.remarks.map((r, i) => (
              <div key={i} className="text-[13px] leading-relaxed">
                <span className="font-medium text-neutral-900">{r.name}</span>
                {r.title && <span className="ml-1.5 text-neutral-400">{r.title}</span>}
                <span className="text-neutral-700">：{r.gist}</span>
              </div>
            ))}
          </div>
          {transcript && transcript.length > 0 && (
            <div className="mt-2">
              <button type="button" onClick={() => setShowTranscript((v) => !v)} className="text-[12px] text-neutral-500 underline hover:text-neutral-900">
                {showTranscript ? (en ? "Hide full transcript" : "收起完整發言") : (en ? "Show full transcript" : "看完整發言")}
              </button>
              {showTranscript && (
                <div className="mt-2 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                  {transcript.map((t, i) => (
                    <div key={i}>
                      <p className="text-[12.5px] font-semibold text-neutral-900">{t.name}<span className="ml-1.5 font-normal text-neutral-400">{t.title}</span></p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-700">{t.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 會後行動 */}
      {minutes.actions.length > 0 && (
        <section>
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-neutral-400">{en ? "Next steps" : "會後要做的事"}</h4>
          <div className="space-y-1.5">
            {minutes.actions.map((a, i) => (
              <div key={i} className="rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1 text-neutral-900">{a.title}</span>
                  {a.owner && <span className="text-[12px] text-neutral-400">{a.owner}</span>}
                  {a.kind === "content" && (a.taskLabel ? (
                    <button type="button" disabled={readOnly || !a.taskId} onClick={() => onOpenTask?.(a)}
                      title={en ? "Opens this task card with the topic filled in" : "直接打開這張任務卡，題目已帶好，可以改"}
                      className={`${pill} border-neutral-900 text-neutral-900 enabled:hover:bg-neutral-900 enabled:hover:text-white disabled:opacity-60`}>
                      {en ? `Open card: ${a.taskLabel}` : `開任務卡：${a.taskLabel}`}
                    </button>
                  ) : (
                    <span className="text-[12px] text-neutral-400">{en ? "No matching task card" : "沒有對應的任務卡"}</span>
                  ))}
                </div>
                {(a.cites ?? []).length > 0 && (
                  <div className="mt-1"><Sources cites={a.cites ?? []} evidenceIdx={[]} sources={sources} evidence={evidence} en={en} onOpenSource={readOnly ? undefined : onOpenSource} /></div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
