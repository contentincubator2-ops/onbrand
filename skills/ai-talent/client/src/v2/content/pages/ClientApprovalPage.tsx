/**
 * /approve/:token — 客戶核准頁。免登入，拿到連結的人就能看。
 *
 * 2026-10-07（CJ「讓他人點擊連結後，提供修改意見或直接修改，而且每篇文章的修改都有紀錄」；
 * 要解的是來回過稿的時間和流程）。
 *
 * 一頁看完一批：最上面是進度（幾篇、核准幾篇、要修改幾篇），下面一篇一張卡。
 * 每張卡三個動作：核准、要修改（要寫原因）、直接修改（立即生效，可還原）。另外可以留言。
 * 每一篇的紀錄收在卡片底下，修改會標出改了哪一段。
 *
 * 這頁不在 app 外框裡：客戶沒有帳號，也不該看到任何 app 的導覽。
 */
import React from "react";
import { useParams } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { showToastGlobal } from "../../platform/components/Toast";
import { friendlyError } from "../../platform/lib/friendlyError";
import { channelLabel } from "../../platform/lib/channelMeta";
import AiImageNotice from "../../platform/components/AiImageNotice";
import { CheckIcon, CommentIcon, EditIcon, SendBackIcon } from "../../platform/components/icons";
import { captionDiff } from "../lib/approvalDiff";

const INK = "#171717", META = "#6B6B6B", LINE = "#EAEAEA", SOFT = "#F6F6F5";
const NAME_KEY = "onbrand.approval.name";

type Decision = "pending" | "approved" | "changes_requested";
type Filter = "all" | Decision;
interface Ev { id: number; kind: string; authorType: string; authorName: string; body: string | null; beforeText: string | null; afterText: string | null; createdAt: string | null }
interface Post {
  id: number; platform: string; scheduledAt: string | null; title: string; available: boolean; label: string; caption: string;
  imageUrls: string[]; videoUrl: string | null; cards: Array<{ headline: string; body: string; imageUrl: string | null }>;
  published: boolean; editable: boolean; decision: Decision; decidedBy: string | null; decidedAt: string | null; events: Ev[];
}

const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } };
const saveName = (v: string) => { try { localStorage.setItem(NAME_KEY, v); } catch { /* 私密視窗：這次有效就好 */ } };

const fmt = (iso: string | null, en: boolean) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(en ? "en-US" : "zh-TW", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
};

function DecisionChip({ decision, en }: { decision: Decision; en: boolean }) {
  const map: Record<Decision, { text: string; cls: string }> = {
    approved: { text: en ? "Approved" : "已核准", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    changes_requested: { text: en ? "Changes requested" : "要修改", cls: "border-rose-200 bg-rose-50 text-rose-700" },
    pending: { text: en ? "Waiting for you" : "待確認", cls: "border-neutral-200 bg-neutral-50 text-neutral-600" },
  };
  const m = map[decision];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium ${m.cls}`}>{m.text}</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#FCFCFB]"><div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">{children}</div></div>;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="rounded-2xl border bg-white px-6 py-10 text-center" style={{ borderColor: LINE }}>
        <h1 className="m-0 text-[20px] font-bold" style={{ color: INK }}>{title}</h1>
        <p className="m-0 mt-2 text-[14px] leading-relaxed" style={{ color: META }}>{body}</p>
      </div>
    </Shell>
  );
}

function EventRow({ ev, en, canRestore, onRestore, busy }: { ev: Ev; en: boolean; canRestore: boolean; onRestore: () => void; busy: boolean }) {
  const who = `${ev.authorName}${ev.authorType === "team" ? (en ? " (team)" : "（團隊）") : ""}`;
  const verb: Record<string, string> = en
    ? { comment: "commented", edit: "edited the text", restore: "restored an earlier version", approved: "approved", changes_requested: "asked for changes", reopened: "reopened" }
    : { comment: "留言", edit: "修改了內文", restore: "還原成先前的版本", approved: "核准", changes_requested: "要修改", reopened: "重新開啟" };
  const isEdit = ev.kind === "edit" || ev.kind === "restore";
  const d = isEdit && ev.beforeText != null && ev.afterText != null ? captionDiff(ev.beforeText, ev.afterText) : null;
  return (
    <li className="py-2.5">
      <p className="m-0 text-[13px]" style={{ color: META }}>
        <span className="font-semibold" style={{ color: INK }}>{who}</span> {verb[ev.kind] ?? ev.kind}
        <span className="ml-2 text-[12px]">{fmt(ev.createdAt, en)}</span>
      </p>
      {ev.body && <p className="m-0 mt-1 whitespace-pre-wrap text-[14px] leading-relaxed" style={{ color: INK }}>{ev.body}</p>}
      {d && (
        <div className="mt-1.5 whitespace-pre-wrap rounded-lg px-3 py-2 text-[13.5px] leading-relaxed" style={{ background: SOFT, color: INK }}>
          <span style={{ color: META }}>{d.leadCut ? "…" : ""}{d.lead}</span>
          {d.segs.map((x, k) => x.t === "del"
            ? <del key={k} className="rounded bg-rose-100 px-0.5 text-rose-800">{x.s}</del>
            : x.t === "ins"
              ? <ins key={k} className="rounded bg-emerald-100 px-0.5 text-emerald-900 no-underline">{x.s}</ins>
              : <span key={k}>{x.s}</span>)}
          <span style={{ color: META }}>{d.tail}{d.tailCut ? "…" : ""}</span>
          {canRestore && (
            <button type="button" disabled={busy} onClick={onRestore}
              className="ml-3 text-[12.5px] font-medium underline underline-offset-2 disabled:opacity-40" style={{ color: META }}>
              {en ? "Restore the text from before this edit" : "還原成這次修改之前"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function PostCard({ post, en, token, name, needName, onChanged }: {
  post: Post; en: boolean; token: string; name: string; needName: () => boolean; onChanged: () => void;
}) {
  const T = trpc as any;
  const [mode, setMode] = React.useState<"idle" | "edit" | "comment" | "changes">("idle");
  const [text, setText] = React.useState("");
  const [showLog, setShowLog] = React.useState(false);
  const fail = (e: any) => { showToastGlobal(friendlyError(e, en ? "That didn't go through. Please try again." : "剛剛沒成功，再試一次。"), "error"); onChanged(); };
  const done = (msg: string) => { setMode("idle"); setText(""); showToastGlobal(msg, "success"); onChanged(); };

  const decide = T.approval.decide.useMutation({ onSuccess: (r: any) => done(r.decision === "approved" ? (en ? "Approved" : "已核准") : r.decision === "pending" ? (en ? "Reopened" : "已重新開啟") : (en ? "Sent back with your note" : "已送出修改意見")), onError: fail });
  const comment = T.approval.comment.useMutation({ onSuccess: () => { setShowLog(true); done(en ? "Comment added" : "已留言"); }, onError: fail });
  const edit = T.approval.editCaption.useMutation({ onSuccess: (r: any) => { setShowLog(true); done(r.changed ? (en ? "Saved. The post now uses your text." : "已儲存，貼文已換成你改的內容。") : (en ? "Nothing changed" : "內容沒有變動")); }, onError: fail });
  const restore = T.approval.restore.useMutation({ onSuccess: () => done(en ? "Restored" : "已還原"), onError: fail });
  const busy = decide.isPending || comment.isPending || edit.isPending || restore.isPending;
  const base = { token, itemId: post.id, name: name || undefined };

  const open = (m: "edit" | "comment" | "changes") => { if (needName()) return; setText(m === "edit" ? post.caption : ""); setMode(m); };
  const submit = () => {
    if (mode === "edit") edit.mutate({ ...base, caption: text, base: post.caption });
    else if (mode === "comment") comment.mutate({ ...base, body: text.trim() });
    else if (mode === "changes") decide.mutate({ ...base, decision: "changes_requested", note: text.trim() });
  };
  const canSubmit = mode === "edit" ? !!text.trim() && text !== post.caption : mode === "changes" ? text.trim().length >= 2 : !!text.trim();

  const btn = "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition hover:border-neutral-900 disabled:opacity-40";
  const edits = post.events.filter((e) => e.kind === "edit" || e.kind === "restore");
  const lastEditId = edits.length ? edits[edits.length - 1].id : 0;

  return (
    <article className="rounded-2xl border bg-white p-5 sm:p-6" style={{ borderColor: LINE }} aria-label={post.title || channelLabel(post.platform, en)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[13.5px]" style={{ color: META }}>
          <span className="font-semibold" style={{ color: INK }}>{post.platform === "other" ? (en ? "Post" : "貼文") : channelLabel(post.platform, en)}</span>
          {post.scheduledAt && <span className="ml-2">{en ? "Goes out" : "預計發布"} {fmt(post.scheduledAt, en)}</span>}
        </p>
        {post.published
          ? <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[12.5px] font-medium text-neutral-600">{en ? "Published" : "已發布"}</span>
          : <DecisionChip decision={post.decision} en={en} />}
      </header>

      {!post.available ? (
        <p className="m-0 mt-4 text-[14px]" style={{ color: META }}>{en ? "This post has been removed." : "這一篇已經被移除。"}</p>
      ) : (
        <>
          {post.imageUrls.length > 0 && (
            <div className="mt-4">
              <div className={`grid gap-2 ${post.imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
                {post.imageUrls.map((u, i) => (
                  <a key={u + i} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border" style={{ borderColor: LINE }}>
                    <img src={u} alt={en ? `Image ${i + 1}` : `第 ${i + 1} 張圖`} loading="lazy" className={`w-full object-cover ${post.imageUrls.length === 1 ? "max-h-[420px]" : "aspect-square"}`} />
                  </a>
                ))}
              </div>
              <div className="flex justify-end pt-1"><AiImageNotice /></div>
            </div>
          )}
          {post.videoUrl && <video src={post.videoUrl} controls className="mt-4 max-h-[420px] w-full rounded-xl border" style={{ borderColor: LINE }} />}

          {mode === "edit" ? (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(18, Math.max(6, text.split("\n").length + 2))} maxLength={8000}
              aria-label={en ? "Post text" : "貼文內文"}
              className="mt-4 w-full rounded-xl border px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-neutral-900" style={{ borderColor: LINE, color: INK }} />
          ) : (
            post.caption && <p className="m-0 mt-4 whitespace-pre-wrap text-[15px] leading-relaxed" style={{ color: INK }}>{post.caption}</p>
          )}

          {post.cards.length > 0 && (
            <ol className="m-0 mt-4 list-none space-y-2 p-0">
              {post.cards.map((c, i) => (
                <li key={i} className="rounded-xl px-3.5 py-2.5 text-[14px] leading-relaxed" style={{ background: SOFT, color: INK }}>
                  <span className="mr-2 text-[12.5px]" style={{ color: META }}>{i + 1}</span>
                  {c.headline && <strong>{c.headline}</strong>}{c.headline && c.body ? "　" : ""}{c.body}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {(mode === "comment" || mode === "changes") && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} autoFocus
          aria-label={mode === "changes" ? (en ? "What should change" : "要修改的地方") : (en ? "Comment" : "留言")}
          placeholder={mode === "changes" ? (en ? "What should change? Be specific so it's right next time." : "哪裡要改？寫具體一點，下一版就會對。") : (en ? "Leave a comment…" : "留言…")}
          className="mt-4 w-full rounded-xl border px-3.5 py-3 text-[14.5px] leading-relaxed outline-none focus:border-neutral-900" style={{ borderColor: LINE, color: INK }} />
      )}

      {post.available && !post.published && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {mode === "idle" ? (
            <>
              {post.decision === "approved" ? (
                <button type="button" disabled={busy} className={btn} style={{ borderColor: LINE, color: INK }}
                  onClick={() => { if (!needName()) decide.mutate({ ...base, decision: "pending" }); }}>{en ? "Undo approval" : "取消核准"}</button>
              ) : (
                <button type="button" disabled={busy} className={`${btn} text-white`} style={{ borderColor: INK, background: INK }}
                  onClick={() => { if (!needName()) decide.mutate({ ...base, decision: "approved" }); }}><CheckIcon size={13} />{en ? "Approve" : "核准"}</button>
              )}
              <button type="button" disabled={busy} className={btn} style={{ borderColor: LINE, color: INK }} onClick={() => open("changes")}><SendBackIcon size={13} />{en ? "Request changes" : "要修改"}</button>
              {post.editable && !!post.caption && (
                <button type="button" disabled={busy} className={btn} style={{ borderColor: LINE, color: INK }} onClick={() => open("edit")}><EditIcon size={13} />{en ? "Edit the text" : "直接修改"}</button>
              )}
              <button type="button" disabled={busy} className={btn} style={{ borderColor: LINE, color: INK }} onClick={() => open("comment")}><CommentIcon size={13} />{en ? "Comment" : "留言"}</button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy || !canSubmit} className={`${btn} text-white`} style={{ borderColor: INK, background: INK }} onClick={submit}>
                {mode === "edit" ? (en ? "Save changes" : "儲存修改") : mode === "changes" ? (en ? "Send" : "送出修改意見") : (en ? "Post comment" : "送出留言")}
              </button>
              <button type="button" disabled={busy} className={btn} style={{ borderColor: LINE, color: INK }} onClick={() => { setMode("idle"); setText(""); }}>{en ? "Cancel" : "取消"}</button>
              {mode === "edit" && <span className="text-[12.5px]" style={{ color: META }}>{en ? "Saving replaces the post text right away. Every edit is kept and can be restored." : "儲存後貼文立刻換成你改的內容；每次修改都會留紀錄，可以還原。"}</span>}
            </>
          )}
        </div>
      )}

      {post.events.length > 0 && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: LINE }}>
          <button type="button" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}
            className="text-[13px] font-medium underline-offset-2 hover:underline" style={{ color: META }}>
            {en ? `History (${post.events.length})` : `紀錄（${post.events.length}）`}
          </button>
          {showLog && (
            <ul className="m-0 mt-1 list-none divide-y p-0" style={{ borderColor: LINE }}>
              {post.events.map((ev) => (
                <EventRow key={ev.id} ev={ev} en={en} busy={busy}
                  canRestore={post.editable && ev.id === lastEditId && ev.afterText != null && ev.afterText === post.caption}
                  onRestore={() => { if (!needName()) restore.mutate({ ...base, eventId: ev.id }); }} />
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

export default function ClientApprovalPage() {
  const { token = "" } = useParams();
  const { lang } = useLang();
  const en = lang === "en";
  const T = trpc as any;
  const [name, setName] = React.useState(readName);
  const [filter, setFilter] = React.useState<Filter>("all");
  const nameRef = React.useRef<HTMLInputElement>(null);

  const q = T.approval.view.useQuery({ token }, { enabled: /^[A-Za-z0-9_-]{24,64}$/.test(token), retry: false, refetchOnWindowFocus: true });
  const data = q.data as any;

  // 這頁是給特定的人看的，不該被搜尋引擎收錄。
  React.useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex,nofollow";
    document.head.appendChild(m);
    return () => { m.remove(); };
  }, []);
  React.useEffect(() => { if (data?.title) document.title = data.brand?.name ? `${data.title}｜${data.brand.name}` : data.title; }, [data?.title, data?.brand?.name]);

  const gone = { title: en ? "This link is no longer available" : "這條連結已經失效", body: en ? "Ask the person who sent it for a new one." : "請向寄給你的人要一條新的。" };
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return <Notice {...gone} />;
  if (q.isLoading) return <Shell><p role="status" className="m-0 text-[14px]" style={{ color: META }}>{en ? "Loading…" : "載入中…"}</p></Shell>;
  if (q.isError || !data) {
    const code = (q.error as any)?.data?.code;
    if (code === "NOT_FOUND") return <Notice {...gone} />;
    return (
      <Shell>
        <div role="alert" className="rounded-2xl border bg-white px-6 py-8 text-center" style={{ borderColor: LINE }}>
          <p className="m-0 text-[15px]" style={{ color: INK }}>
            {code === "UNAUTHORIZED"
              ? (en ? "Your onBrand session has expired. Sign in again, or open this link in a private window." : "你的 onBrand 登入已過期。請重新登入，或用無痕視窗打開這條連結。")
              : (en ? "The page didn't load." : "頁面沒載入。")}
          </p>
          <button type="button" onClick={() => q.refetch()} className="mt-4 rounded-full border px-4 py-2 text-[13.5px] font-semibold" style={{ borderColor: LINE, color: INK }}>{en ? "Retry" : "重試"}</button>
        </div>
      </Shell>
    );
  }
  if (data.state !== "active") {
    return <Notice title={data.state === "expired" ? (en ? "This link has expired" : "這條連結已經過期") : gone.title} body={gone.body} />;
  }

  const isTeam = !!data.isTeam;
  const items: Post[] = data.items ?? [];
  const p = data.progress ?? { total: 0, approved: 0, changes: 0, pending: 0 };
  const shown = filter === "all" ? items : items.filter((i) => i.decision === filter);
  /** 還沒留名字就先擋下來、把游標帶到名字欄。回 true＝被擋。 */
  const needName = () => {
    if (isTeam || name.trim()) return false;
    showToastGlobal(en ? "Add your name first so they know whose feedback this is." : "先留下你的名字，對方才知道是誰的意見。", "error");
    nameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    nameRef.current?.focus();
    return true;
  };
  const tabs: Array<{ id: Filter; label: string; n: number }> = [
    { id: "all", label: en ? "All" : "全部", n: p.total },
    { id: "pending", label: en ? "Waiting for you" : "待確認", n: p.pending },
    { id: "changes_requested", label: en ? "Changes requested" : "要修改", n: p.changes },
    { id: "approved", label: en ? "Approved" : "已核准", n: p.approved },
  ];

  return (
    <Shell>
      <header>
        <div className="flex items-center gap-2.5">
          {data.brand?.logoUrl && <img src={data.brand.logoUrl} alt="" className="h-8 w-8 rounded-full border object-cover" style={{ borderColor: LINE }} />}
          <p className="m-0 text-[14px] font-semibold" style={{ color: META }}>{data.brand?.name}</p>
        </div>
        <h1 className="m-0 mt-3 text-[24px] font-bold leading-snug" style={{ color: INK }}>{data.title}</h1>
        {data.note && <p className="m-0 mt-2 whitespace-pre-wrap text-[15px] leading-relaxed" style={{ color: INK }}>{data.note}</p>}
        <p className="m-0 mt-2 text-[13px]" style={{ color: META }}>
          {data.from ? (en ? `Sent by ${data.from}` : `${data.from} 送來`) : ""}
          {data.from && data.expiresAt ? "・" : ""}
          {data.expiresAt ? (en ? `Open until ${fmt(data.expiresAt, en)}` : `連結有效到 ${fmt(data.expiresAt, en)}`) : ""}
        </p>

        <div className="mt-5 rounded-2xl border bg-white px-5 py-4" style={{ borderColor: LINE }}>
          <p className="m-0 text-[15px]" style={{ color: INK }} aria-live="polite">
            {en
              ? <><strong>{p.total}</strong> posts · <strong>{p.approved}</strong> approved · <strong>{p.changes}</strong> need changes · <strong>{p.pending}</strong> waiting</>
              : <>共 <strong>{p.total}</strong> 篇・已核准 <strong>{p.approved}</strong>・要修改 <strong>{p.changes}</strong>・待確認 <strong>{p.pending}</strong></>}
          </p>
          <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full" style={{ background: SOFT }} aria-hidden="true">
            <div className="bg-emerald-500" style={{ width: `${p.total ? (p.approved / p.total) * 100 : 0}%` }} />
            <div className="bg-rose-400" style={{ width: `${p.total ? (p.changes / p.total) * 100 : 0}%` }} />
          </div>
          {isTeam ? (
            <p className="m-0 mt-3 text-[13px]" style={{ color: META }}>{en ? "You're viewing this as the team. Anything you do here is recorded under your name." : "你是以團隊身分打開這一頁，在這裡做的事會記在你的名字下。"}</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor="approval-name" className="text-[13.5px] font-medium" style={{ color: INK }}>{en ? "Your name" : "你的名字"}</label>
              <input id="approval-name" ref={nameRef} value={name} maxLength={40} autoComplete="name"
                onChange={(e) => { setName(e.target.value); saveName(e.target.value.trim()); }}
                placeholder={en ? "So they know who's replying" : "讓對方知道是誰回覆的"}
                className="min-w-0 flex-1 rounded-full border px-3.5 py-1.5 text-[14px] outline-none focus:border-neutral-900" style={{ borderColor: LINE, color: INK }} />
            </div>
          )}
        </div>

        <div role="tablist" aria-label={en ? "Filter posts" : "篩選貼文"} className="mt-5 flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={filter === t.id} onClick={() => setFilter(t.id)}
              className="rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium transition"
              style={filter === t.id ? { background: INK, borderColor: INK, color: "#fff" } : { background: "#fff", borderColor: LINE, color: INK }}>
              {t.label} {t.n}
            </button>
          ))}
        </div>
      </header>

      <main className="mt-4 space-y-4">
        {shown.length === 0 ? (
          <p className="m-0 rounded-2xl border bg-white px-6 py-8 text-center text-[14px]" style={{ borderColor: LINE, color: META }}>
            {filter === "pending" && p.total > 0 ? (en ? "Nothing left to check. Thank you." : "都看完了，謝謝。") : (en ? "Nothing here." : "這裡沒有貼文。")}
          </p>
        ) : shown.map((post) => (
          <PostCard key={post.id} post={post} en={en} token={token} name={name.trim()} needName={needName} onChanged={() => q.refetch()} />
        ))}
      </main>

      <footer className="mt-10 text-center text-[12.5px]" style={{ color: META }}>onBrand Studio</footer>
    </Shell>
  );
}
