/**
 * ApprovalLinkModal — 本週企劃上的「請客戶核准」。
 *
 * 2026-10-07（CJ「排完一篇文章後，或是選定某個範圍的文章後，可以讓他人點擊連結」）。
 * 上半：勾選這一週排好的貼文 → 建一條連結 → 複製給客戶。
 * 下半：這個品牌發出去的連結與進度（幾篇核准、幾篇要修改），可以再複製、打開、收回。
 *
 * 客戶那一頁是 /approve/:token（ClientApprovalPage）。
 */
import React from "react";
import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { trpc } from "../../../../lib/trpc";
import { showToastGlobal } from "../../../platform/components/Toast";
import { friendlyError } from "../../../platform/lib/friendlyError";
import { channelLabel } from "../../../platform/lib/channelMeta";
import { TASK_MODAL_CLASSNAMES, TASK_MODAL_HEADER } from "../../../platform/components/taskModalStyle";
import { CopyIcon, ExternalIcon, LinkIcon } from "../../../platform/components/icons";

const INK = "#171717", META = "#6B6B6B", LINE = "#EAEAEA", SOFT = "#F6F6F5";

export interface ApprovalCandidate {
  scheduledPostId: number;
  outputId: number;
  variantIndex: number;
  contentKind?: "planning" | "public" | null;
  contentIndex?: number | null;
  platform: string;
  at: string;
  preview: string;
}

export const approvalUrl = (token: string) => `${window.location.origin}/approve/${token}`;

async function copy(text: string, en: boolean) {
  try {
    await navigator.clipboard.writeText(text);
    showToastGlobal(en ? "Link copied" : "已複製連結", "success");
  } catch {
    showToastGlobal(en ? "Couldn't copy. Select the link and copy it manually." : "複製沒成功，請手動選取連結複製。", "error");
  }
}

const when = (iso: string | null | undefined, en: boolean) =>
  iso ? new Date(iso).toLocaleString(en ? "en-US" : "zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";

export default function ApprovalLinkModal({ brandId, brandName, rangeLabel, candidates, en, onClose }: {
  brandId: number; brandName: string; rangeLabel: string; candidates: ApprovalCandidate[]; en: boolean; onClose: () => void;
}) {
  const T = trpc as any;
  const utils = T.useUtils();
  const [picked, setPicked] = React.useState<Set<number>>(() => new Set(candidates.map((c) => c.scheduledPostId)));
  const [title, setTitle] = React.useState(() => (en ? `${brandName} posts ${rangeLabel}` : `${brandName} ${rangeLabel} 貼文`).trim());
  const [note, setNote] = React.useState("");
  const [days, setDays] = React.useState<7 | 14 | 30>(14);
  const [made, setMade] = React.useState<{ token: string; count: number } | null>(null);

  const listQ = T.approval.list.useQuery({ brandId }, { refetchOnWindowFocus: true });
  const refresh = () => { try { utils.approval.list.invalidate(); } catch { /* noop */ } };
  const onErr = (e: any) => showToastGlobal(friendlyError(e, en ? "That didn't go through. Please try again." : "剛剛沒成功，再試一次。"), "error");
  const create = T.approval.create.useMutation({
    onSuccess: (r: any) => { setMade({ token: r.token, count: r.count }); refresh(); copy(approvalUrl(r.token), en); },
    onError: onErr,
  });
  const revoke = T.approval.revoke.useMutation({ onSuccess: () => { showToastGlobal(en ? "Link withdrawn" : "已收回連結", "success"); refresh(); }, onError: onErr });

  const toggle = (id: number) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = () => create.mutate({
    brandId, title: title.trim(), note: note.trim() || undefined, expiresInDays: days,
    items: candidates.filter((c) => picked.has(c.scheduledPostId)).map((c) => ({
      outputId: c.outputId, variantIndex: c.variantIndex, scheduledPostId: c.scheduledPostId,
      ...(c.contentKind && c.contentIndex != null ? { contentKind: c.contentKind, contentIndex: c.contentIndex } : {}),
    })),
  });

  const links: any[] = listQ.data ?? [];
  const field = "w-full rounded-xl border px-3.5 py-2.5 text-[14px] outline-none focus:border-neutral-900";
  const small = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition hover:border-neutral-900 disabled:opacity-40";

  return (
    <Modal isOpen onClose={onClose} size="2xl" scrollBehavior="inside" backdrop="blur" classNames={TASK_MODAL_CLASSNAMES}>
      <ModalContent>
        <ModalHeader className={TASK_MODAL_HEADER}>
          <span className="flex items-center gap-2 text-[17px] font-bold" style={{ color: INK }}><LinkIcon size={15} />{en ? "Send to client for approval" : "請客戶核准"}</span>
          <span className="mt-1 text-[13px] font-normal" style={{ color: META }}>
            {en ? "One link, no sign-in. They can approve, ask for changes, or edit the text. Every change is recorded." : "一條連結、不用登入。對方可以核准、提出修改，或直接改內文；每一次修改都有紀錄。"}
          </span>
        </ModalHeader>
        <ModalBody>
          {made ? (
            <section aria-live="polite" className="rounded-2xl border px-4 py-4" style={{ borderColor: LINE }}>
              <p className="m-0 text-[14.5px] font-semibold" style={{ color: INK }}>{en ? `Link ready (${made.count} posts). Copied to your clipboard.` : `連結建好了（${made.count} 篇），已複製。`}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <input readOnly value={approvalUrl(made.token)} onFocus={(e) => e.currentTarget.select()} aria-label={en ? "Approval link" : "核准連結"} className={field} style={{ borderColor: LINE, color: INK, background: SOFT }} />
                <button type="button" className={small} style={{ borderColor: LINE, color: INK }} onClick={() => copy(approvalUrl(made.token), en)}><CopyIcon size={12} />{en ? "Copy" : "複製"}</button>
              </div>
              <button type="button" className="mt-3 text-[13px] underline underline-offset-2" style={{ color: META }} onClick={() => setMade(null)}>{en ? "Create another link" : "再建一條"}</button>
            </section>
          ) : candidates.length === 0 ? (
            <p className="m-0 rounded-2xl border px-4 py-5 text-[14px]" style={{ borderColor: LINE, color: META }}>
              {en ? "No scheduled posts in this week yet. Schedule a post first, then send it for approval." : "這一週還沒有排好的貼文。先把貼文排上去，再請客戶核准。"}
            </p>
          ) : (
            <section className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <p className="m-0 text-[13.5px] font-semibold" style={{ color: INK }}>{en ? `Posts to include (${picked.size}/${candidates.length})` : `要給客戶看的貼文（${picked.size}／${candidates.length}）`}</p>
                  <button type="button" className="text-[13px] underline underline-offset-2" style={{ color: META }}
                    onClick={() => setPicked(picked.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.scheduledPostId)))}>
                    {picked.size === candidates.length ? (en ? "Clear all" : "全部取消") : (en ? "Select all" : "全選")}
                  </button>
                </div>
                <ul className="m-0 mt-2 max-h-[240px] list-none space-y-1.5 overflow-y-auto p-0">
                  {candidates.map((c) => (
                    <li key={c.scheduledPostId}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: LINE, background: picked.has(c.scheduledPostId) ? "#fff" : SOFT }}>
                        <input type="checkbox" className="mt-1" checked={picked.has(c.scheduledPostId)} onChange={() => toggle(c.scheduledPostId)} />
                        <span className="min-w-0">
                          <span className="block text-[12.5px]" style={{ color: META }}>{channelLabel(c.platform, en)}・{when(c.at, en)}</span>
                          <span className="block truncate text-[14px]" style={{ color: INK }}>{c.preview || (en ? "(no text)" : "（沒有文字）")}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label htmlFor="apl-title" className="text-[13.5px] font-semibold" style={{ color: INK }}>{en ? "Title the client sees" : "客戶看到的標題"}</label>
                <input id="apl-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={`${field} mt-1.5`} style={{ borderColor: LINE, color: INK }} />
              </div>
              <div>
                <label htmlFor="apl-note" className="text-[13.5px] font-semibold" style={{ color: INK }}>{en ? "A line for the client (optional)" : "給客戶的一句話（可不填）"}</label>
                <textarea id="apl-note" value={note} maxLength={600} rows={2} onChange={(e) => setNote(e.target.value)}
                  placeholder={en ? "e.g. Please reply by Thursday noon." : "例如：麻煩週四中午前回覆。"} className={`${field} mt-1.5`} style={{ borderColor: LINE, color: INK }} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[13.5px]" style={{ color: INK }}>
                  {en ? "Link stays open for" : "連結有效"}
                  <select value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 14 | 30)} className="rounded-full border px-3 py-1.5 text-[13.5px]" style={{ borderColor: LINE }}>
                    {[7, 14, 30].map((d) => <option key={d} value={d}>{en ? `${d} days` : `${d} 天`}</option>)}
                  </select>
                </label>
                <button type="button" disabled={create.isPending || picked.size === 0 || !title.trim()} onClick={submit}
                  className="rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white transition disabled:opacity-40" style={{ background: INK }}>
                  {create.isPending ? (en ? "Creating…" : "建立中…") : (en ? "Create link" : "建立連結")}
                </button>
              </div>
            </section>
          )}

          <section className="mt-5 border-t pt-4" style={{ borderColor: LINE }}>
            <p className="m-0 text-[13.5px] font-semibold" style={{ color: INK }}>{en ? "Links you've sent" : "發出去的連結"}</p>
            {listQ.isLoading ? (
              <p role="status" className="m-0 mt-2 text-[13px]" style={{ color: META }}>{en ? "Loading…" : "載入中…"}</p>
            ) : listQ.isError ? (
              <p role="alert" className="m-0 mt-2 text-[13px]" style={{ color: INK }}>
                {en ? "The list didn't load." : "清單沒載入。"} <button type="button" className="underline" onClick={() => listQ.refetch()}>{en ? "Retry" : "重試"}</button>
              </p>
            ) : links.length === 0 ? (
              <p className="m-0 mt-2 text-[13px]" style={{ color: META }}>{en ? "None yet." : "還沒有。"}</p>
            ) : (
              <ul className="m-0 mt-2 list-none space-y-2 p-0">
                {links.map((l) => {
                  const p = l.progress;
                  const dead = l.state !== "active";
                  return (
                    <li key={l.id} className="rounded-xl border px-3.5 py-3" style={{ borderColor: LINE, opacity: dead ? 0.6 : 1 }}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="m-0 truncate text-[14px] font-semibold" style={{ color: INK }}>{l.title}</p>
                          <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: META }}>
                            {en ? `${p.total} posts · ${p.approved} approved · ${p.changes} need changes · ${p.pending} waiting` : `${p.total} 篇・已核准 ${p.approved}・要修改 ${p.changes}・待確認 ${p.pending}`}
                          </p>
                          <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: META }}>
                            {l.state === "revoked" ? (en ? "Withdrawn" : "已收回")
                              : l.state === "expired" ? (en ? "Expired" : "已過期")
                              : l.lastClientActivityAt ? (en ? `Client last replied ${when(l.lastClientActivityAt, en)}` : `客戶最後回覆 ${when(l.lastClientActivityAt, en)}`)
                              : l.lastViewedAt ? (en ? `Opened ${when(l.lastViewedAt, en)}, no reply yet` : `${when(l.lastViewedAt, en)} 開過，還沒回覆`)
                              : (en ? "Not opened yet" : "客戶還沒打開")}
                          </p>
                        </div>
                        {!dead && (
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            <button type="button" className={small} style={{ borderColor: LINE, color: INK }} onClick={() => copy(approvalUrl(l.token), en)}><CopyIcon size={12} />{en ? "Copy" : "複製"}</button>
                            <a href={approvalUrl(l.token)} target="_blank" rel="noreferrer" className={small} style={{ borderColor: LINE, color: INK }}><ExternalIcon size={12} />{en ? "Open" : "打開"}</a>
                            <button type="button" disabled={revoke.isPending} className={small} style={{ borderColor: LINE, color: INK }}
                              onClick={() => { if (window.confirm(en ? "Withdraw this link? The client won't be able to open it any more." : "要收回這條連結嗎？客戶會立刻打不開。")) revoke.mutate({ id: l.id }); }}>
                              {en ? "Withdraw" : "收回"}
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
