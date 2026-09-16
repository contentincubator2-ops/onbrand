/**
 * /liff/share?p=<postId> — one big button: send the post to LINE friends or
 * groups via shareTargetPicker. With ?rep=<id> it's the booth preview.
 */
import React, { useRef, useState } from "react";
import { Check, Copy, Info, Send } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { VerdictBadge, type Verdict } from "../ui";
import { OWN_ERROR_UI, canShareTargetPicker, useLiffBoot } from "../components/liff-useLiff";
import { BootNotice, ErrorLine, LiffShell, Notice, btnPrimary, btnSecondary, useCopy } from "../components/liff-ui";

const DICT = {
  zh: {
    title: "分享給 LINE 好友",
    preview: "貼文預覽",
    share: "分享給 LINE 好友",
    sent: "已送出！好友點追蹤連結，都會算進你的成效。",
    closing: "即將關閉視窗…",
    unavailable: "這個環境無法開啟 LINE 好友清單，請先複製內文再貼到聊天室。",
    simNote: "分享給好友只能在 LINE App 裡使用：業務挑選好友或群組，貼文會以他本人的訊息送出。這裡是預覽模式。",
    copy: "複製內文",
    copied: "已複製",
    selected: "無法自動複製，請長按上方內文複製",
    noPost: "找不到要分享的貼文，請從 LINE 選單重新開啟。",
  },
  en: {
    title: "Share to LINE friends",
    preview: "Post preview",
    share: "Share to LINE friends",
    sent: "Sent! Clicks from your friends on the tracked link count toward your results.",
    closing: "Closing…",
    unavailable: "Can't open your LINE friend list here — copy the text and paste it into a chat instead.",
    simNote: "Sharing to friends works inside the LINE app: the rep picks friends or groups and the post goes out as their own message. This is preview mode.",
    copy: "Copy text",
    copied: "Copied",
    selected: "Couldn't copy automatically — long-press the text above",
    noPost: "No post to share — reopen this from the LINE menu.",
  },
};

export default function LiffSharePage() {
  const boot = useLiffBoot();
  const ready = boot.status === "ready";
  const identity = ready ? boot.identity : {};
  const liff = ready ? boot.liff : null;
  const simulate = ready && boot.mode === "simulate";
  const postId = Number(ready ? boot.params.get("p") : 0) || 0;

  const session = trpc.hub.rep.session.useQuery(identity, { enabled: ready, retry: false, refetchOnWindowFocus: false, ...OWN_ERROR_UI });
  const post = trpc.hub.rep.post.useQuery(
    { ...identity, postId },
    { enabled: ready && postId > 0, retry: false, refetchOnWindowFocus: false, ...OWN_ERROR_UI },
  );
  const markShared = trpc.hub.rep.markShared.useMutation({ onError: () => undefined });
  const [sent, setSent] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state: copyState, copy } = useCopy();
  const hiddenField = useRef<HTMLTextAreaElement>(null);

  const t = DICT[session.data?.rep.market === "TW" ? "zh" : "en"];
  const shell = (children: React.ReactNode) => (
    <LiffShell title={t.title} subtitle={session.data?.rep.name} simulate={simulate}>
      {children}
    </LiffShell>
  );

  if (boot.status !== "ready") return shell(<BootNotice boot={boot} />);
  if (session.isLoading || (postId > 0 && post.isLoading)) return shell(<Notice icon="pulse" zh="載入中…" en="Loading…" />);
  if (session.error) return shell(<Notice icon="info" zh="無法開啟頁面" en="Couldn't open this page" detail={session.error.message} tone="bad" />);
  if (!postId || post.error || !post.data) return shell(<Notice icon="info" en={t.noPost} detail={post.error?.message} tone="bad" />);

  const caption = post.data.caption as string;
  const shareAvailable = !simulate && canShareTargetPicker(liff);

  const onShare = async () => {
    setError(null);
    setSharing(true);
    try {
      const res = await liff.shareTargetPicker([{ type: "text", text: caption.slice(0, 5000) }]);
      if (res) {
        setSent(true);
        markShared.mutate({ ...identity, postId });
        if (liff.isInClient?.()) window.setTimeout(() => liff.closeWindow(), 1800);
      }
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSharing(false);
    }
  };

  return shell(
    <div className="space-y-4">
      <section>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">{t.preview}</h2>
          {post.data.verdict ? <VerdictBadge verdict={post.data.verdict as Verdict} /> : null}
        </div>
        <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-stone-200 bg-white p-3 text-[15px] leading-relaxed text-stone-900">
          {caption}
        </div>
        {/* Fallback copy target for in-app browsers without the async clipboard API. */}
        <textarea ref={hiddenField} value={caption} readOnly aria-hidden tabIndex={-1} className="sr-only" />
      </section>

      {sent ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[14px] text-emerald-900" role="status">
          <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <div>{t.sent}</div>
            {liff?.isInClient?.() ? <div className="mt-1 text-[12px] text-emerald-800">{t.closing}</div> : null}
          </div>
        </div>
      ) : (
        <button type="button" onClick={onShare} disabled={!shareAvailable || sharing} className={btnPrimary + " py-4 text-[16px]"}>
          <Send className="h-5 w-5" aria-hidden />
          {t.share}
        </button>
      )}

      {!shareAvailable && !sent ? (
        <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-[13px] text-stone-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" aria-hidden />
          <span>{simulate ? t.simNote : t.unavailable}</span>
        </div>
      ) : null}

      <button type="button" onClick={() => void copy(caption, hiddenField.current)} className={btnSecondary + " w-full"}>
        {copyState === "copied" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {copyState === "copied" ? t.copied : t.copy}
      </button>
      {copyState === "selected" ? <div className="text-center text-[12px] text-stone-600">{t.selected}</div> : null}

      <ErrorLine message={error} />
    </div>,
  );
}
