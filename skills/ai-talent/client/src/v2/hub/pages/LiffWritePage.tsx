/**
 * /liff/write — the rep's full editor, opened inside LINE (or from the booth
 * simulator with ?rep=<id>). ?s=<solutionId> preselects a solution;
 * ?p=<postId> opens an existing post for copy / edit / share.
 */
import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Link2, PenLine, Send, ShieldCheck } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import CompliancePanel, { type ComplianceReport } from "../CompliancePanel";
import { cx } from "../ui";
import { OWN_ERROR_UI, canShareTargetPicker, openExternal, useLiffBoot } from "../components/liff-useLiff";
import { BootNotice, ErrorLine, LiffShell, Notice, btnPrimary, btnSecondary, useCopy, useElapsed } from "../components/liff-ui";

type Channel = "facebook" | "linkedin" | "instagram" | "line";
type Lang = "zh" | "en";

const CHANNELS: Record<"TW" | "US", Channel[]> = {
  TW: ["facebook", "linkedin", "instagram", "line"],
  US: ["linkedin", "instagram"],
};
const CHANNEL_NAMES: Record<Channel, string> = { facebook: "Facebook", linkedin: "LinkedIn", instagram: "Instagram", line: "LINE" };

const LINKEDIN_URL = "https://www.linkedin.com/feed/?shareActive=true";
const FACEBOOK_URL = "https://www.facebook.com/";

const DICT = {
  zh: {
    title: "寫一篇",
    solution: "方案",
    featured: "本週主推",
    others: "其他方案",
    channel: "發布平台",
    skill: "寫法",
    auto: "自動（依平台挑選）",
    angle: "你的切角（選填）",
    anglePh: "例如：上週拜訪的餐廳老闆最頭痛人手不足…",
    checkedBy: "發文前會先檢查：",
    generate: "幫我寫",
    generating: "寫作中，並檢查公司政策…",
    usually: "通常 8–25 秒",
    loadingPost: "載入貼文中…",
    yourPost: "你的貼文",
    editable: "可以直接修改",
    edited: "你改過內容了，發布前建議重新檢查。",
    recheck: "重新檢查我的修改",
    rechecking: "檢查中…",
    policy: "公司政策檢查",
    copy: "複製",
    copied: "已複製",
    selected: "已選取全文，請長按複製",
    shareLine: "分享給 LINE 好友",
    shareLineUnavailable: "在 LINE App 裡才能分享給好友",
    sharedLine: "已分享給 LINE 好友！",
    openLinkedIn: "開啟 LinkedIn",
    openFacebook: "開啟 Facebook",
    copiedThenOpen: "已複製內文，到貼文框貼上即可。",
    posted: "我發好了",
    postUrl: "貼文網址",
    report: "回報",
    reporting: "回報中…",
    reported: "已記錄！追蹤連結的點擊會即時算進你的成效。",
    badUrl: "請貼上完整網址（https://…）",
    tracked: "你的專屬追蹤連結",
    trackedNote: "這個連結的點擊會算進你的成效。",
    another: "再寫一篇",
  },
  en: {
    title: "Write a post",
    solution: "Solution",
    featured: "This week's focus",
    others: "Other solutions",
    channel: "Channel",
    skill: "Writing skill",
    auto: "Auto (best for this channel)",
    angle: "Your angle (optional)",
    anglePh: "e.g. The restaurant owner I met last week can't hire enough staff…",
    checkedBy: "Checked before you post:",
    generate: "Write my post",
    generating: "Writing and checking company policy…",
    usually: "usually 8–25s",
    loadingPost: "Loading your post…",
    yourPost: "Your post",
    editable: "Edit freely",
    edited: "You edited the post — re-check it before posting.",
    recheck: "Re-check my edits",
    rechecking: "Checking…",
    policy: "Company policy check",
    copy: "Copy",
    copied: "Copied",
    selected: "Text selected — long-press to copy",
    shareLine: "Share to LINE friends",
    shareLineUnavailable: "Sharing to friends works inside the LINE app",
    sharedLine: "Shared to your LINE friends!",
    openLinkedIn: "Open LinkedIn",
    openFacebook: "Open Facebook",
    copiedThenOpen: "Post copied — paste it into the composer.",
    posted: "I posted it",
    postUrl: "Post URL",
    report: "Report",
    reporting: "Reporting…",
    reported: "Recorded! Clicks on your tracked link count toward My results in real time.",
    badUrl: "Paste the full URL (https://…)",
    tracked: "Your tracked link",
    trackedNote: "Clicks on this link count toward your results.",
    another: "Write another",
  },
} satisfies Record<Lang, Record<string, string>>;

interface Result {
  postId: number;
  /** Text the current compliance report describes — edits are compared to it. */
  checkedText: string;
  firstDraft: string | null;
  compliance: ComplianceReport;
  trackedLink: string | null;
}

function trackedLinkFrom(caption: string, shortCode: string | null | undefined): string | null {
  if (!shortCode) return null;
  const inCaption = caption.match(new RegExp(`https?://\\S+/r/${shortCode.replace(/[^\w-]/g, "")}\\b`))?.[0];
  return inCaption ?? `${window.location.origin}/r/${shortCode}`;
}

export default function LiffWritePage() {
  const boot = useLiffBoot();
  const ready = boot.status === "ready";
  const identity = ready ? boot.identity : {};
  const params = ready ? boot.params : null;
  const liff = ready ? boot.liff : null;
  const simulate = ready && boot.mode === "simulate";
  const postIdParam = Number(params?.get("p")) || 0;

  const session = trpc.hub.rep.session.useQuery(identity, { enabled: ready, retry: false, refetchOnWindowFocus: false, ...OWN_ERROR_UI });
  const existing = trpc.hub.rep.post.useQuery(
    { ...identity, postId: postIdParam },
    { enabled: ready && postIdParam > 0, retry: false, refetchOnWindowFocus: false, ...OWN_ERROR_UI },
  );
  const generate = trpc.hub.rep.generate.useMutation({ onError: () => undefined });
  const checkDraft = trpc.hub.rep.checkDraft.useMutation({ onError: () => undefined });
  const markShared = trpc.hub.rep.markShared.useMutation({ onError: () => undefined });

  const s = session.data;
  const market: "TW" | "US" = s?.rep.market === "US" ? "US" : "TW";
  const lang: Lang = s ? (market === "TW" ? "zh" : "en") : "en";
  const t = DICT[lang];

  // form
  const [solutionId, setSolutionId] = useState<number | null>(null);
  const [channel, setChannel] = useState<Channel>("linkedin");
  const [skillSlug, setSkillSlug] = useState("");
  const [angle, setAngle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // result
  const [result, setResult] = useState<Result | null>(null);
  const [caption, setCaption] = useState("");
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [reported, setReported] = useState(false);
  const loadedExisting = useRef(false);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const { state: copyState, copy } = useCopy();
  const elapsed = useElapsed(generate.isPending);

  const solutions = s ? [...s.solutions].sort((a, b) => Number(b.featured) - Number(a.featured)) : [];
  const featured = solutions.filter((x) => x.featured);
  const rest = solutions.filter((x) => !x.featured);
  const skills = (s?.skills ?? []).filter((k) => k.channels.includes(channel));
  const solName = (x: { nameZh: string; nameEn: string }) => (market === "US" ? x.nameEn : x.nameZh);

  useEffect(() => {
    if (!s) return;
    if (solutionId == null) {
      const wanted = Number(params?.get("s"));
      setSolutionId(solutions.find((x) => x.id === wanted)?.id ?? solutions[0]?.id ?? null);
    }
    setChannel(s.rep.market === "US" ? "linkedin" : "facebook");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.rep.id]);

  useEffect(() => {
    if (skillSlug && !skills.some((k) => k.slug === skillSlug)) setSkillSlug("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  useEffect(() => {
    const p = existing.data;
    if (!p || loadedExisting.current) return;
    loadedExisting.current = true;
    showResult({
      postId: p.id,
      checkedText: p.caption,
      firstDraft: null,
      compliance: p.compliance as ComplianceReport,
      trackedLink: trackedLinkFrom(p.caption, p.shortCode),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  function showResult(r: Result) {
    setResult(r);
    setCaption(r.checkedText);
    setActionNote(null);
    setActionError(null);
    setReportOpen(false);
    setPostUrl("");
    setReported(false);
  }

  const onGenerate = async () => {
    if (!solutionId) return;
    setFormError(null);
    try {
      const r = await generate.mutateAsync({
        ...identity,
        solutionId,
        channel,
        skillSlug: skillSlug || undefined,
        angle: angle.trim() ? angle.trim().slice(0, 600) : undefined,
      });
      showResult({
        postId: r.postId,
        checkedText: r.caption,
        firstDraft: r.firstDraft,
        compliance: r.compliance as unknown as ComplianceReport,
        trackedLink: r.trackedLink,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setFormError(String(err?.message ?? err));
    }
  };

  const onRecheck = async () => {
    if (!result || !caption.trim()) return;
    setActionError(null);
    try {
      const r = await checkDraft.mutateAsync({ ...identity, text: caption.slice(0, 5000) });
      setResult({
        ...result,
        checkedText: r.fixed,
        firstDraft: r.fixed.trim() !== r.original.trim() ? r.original : null,
        compliance: r.compliance as unknown as ComplianceReport,
      });
      setCaption(r.fixed);
    } catch (err: any) {
      setActionError(String(err?.message ?? err));
    }
  };

  const onShareLine = async () => {
    if (!result || !liff) return;
    setActionError(null);
    try {
      const res = await liff.shareTargetPicker([{ type: "text", text: caption.slice(0, 5000) }]);
      if (res) {
        setActionNote(t.sharedLine);
        markShared.mutate({ ...identity, postId: result.postId });
      }
    } catch (err: any) {
      setActionError(String(err?.message ?? err));
    }
  };

  const onOpen = async (url: string) => {
    // Neither LinkedIn nor Facebook accepts prefilled text, so copy first.
    const outcome = await copy(caption, captionRef.current);
    openExternal(simulate ? null : liff, url);
    if (outcome === "copied") setActionNote(t.copiedThenOpen);
  };

  const onReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result) return;
    const url = postUrl.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) {
      setActionError(t.badUrl);
      return;
    }
    setActionError(null);
    try {
      await markShared.mutateAsync({ ...identity, postId: result.postId, url: url.slice(0, 500) });
      setReported(true);
      setReportOpen(false);
    } catch (err: any) {
      setActionError(String(err?.message ?? err));
    }
  };

  const shell = (children: React.ReactNode) => (
    <LiffShell title={t.title} subtitle={s?.rep.name} simulate={simulate}>
      {children}
    </LiffShell>
  );

  if (boot.status !== "ready") return shell(<BootNotice boot={boot} />);
  if (session.isLoading) return shell(<Notice icon="pulse" zh="載入中…" en="Loading…" />);
  if (session.error || !s) {
    return shell(<Notice icon="info" zh="無法開啟頁面" en="Couldn't open this page" detail={session.error?.message} tone="bad" />);
  }
  if (postIdParam && existing.isLoading && !result) return shell(<Notice icon="pulse" en={t.loadingPost} />);

  const shareAvailable = !simulate && canShareTargetPicker(liff);
  const edited = Boolean(result && caption.trim() !== result.checkedText.trim());

  // ── result view ──────────────────────────────────────────────────────────
  if (result) {
    return shell(
      <div className="space-y-4">
        <section>
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <h2 className="text-[15px] font-semibold">{t.yourPost}</h2>
            <span className="text-[12px] text-stone-500">{t.editable}</span>
          </div>
          <textarea
            ref={captionRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={10}
            className="block w-full resize-y rounded-xl border border-stone-300 bg-white p-3 text-[15px] leading-relaxed text-stone-900 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
          />
          {edited ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="text-[13px] text-amber-900">{t.edited}</span>
              <button type="button" onClick={onRecheck} disabled={checkDraft.isPending} className={btnSecondary + " py-1.5 text-[13px]"}>
                <ShieldCheck className="h-4 w-4" aria-hidden />
                {checkDraft.isPending ? t.rechecking : t.recheck}
              </button>
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void copy(caption, captionRef.current)} className={btnSecondary}>
              {copyState === "copied" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copyState === "copied" ? t.copied : t.copy}
            </button>
            <button type="button" onClick={onShareLine} disabled={!shareAvailable} className={btnSecondary} title={shareAvailable ? undefined : t.shareLineUnavailable}>
              <Send className="h-4 w-4" aria-hidden />
              {t.shareLine}
            </button>
            <button type="button" onClick={() => void onOpen(LINKEDIN_URL)} className={btnSecondary}>
              <ExternalLink className="h-4 w-4" aria-hidden />
              {t.openLinkedIn}
            </button>
            {market === "TW" ? (
              <button type="button" onClick={() => void onOpen(FACEBOOK_URL)} className={btnSecondary}>
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t.openFacebook}
              </button>
            ) : null}
          </div>
          {copyState === "selected" ? <div className="text-[12px] text-stone-600">{t.selected}</div> : null}
          {!shareAvailable ? <div className="text-[12px] text-stone-500">{t.shareLineUnavailable}</div> : null}
          {actionNote ? (
            <div className="flex items-center gap-1.5 text-[13px] text-stone-700" role="status">
              <Check className="h-4 w-4 text-emerald-600" aria-hidden />
              {actionNote}
            </div>
          ) : null}

          {reported ? (
            <div className="flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900" role="status">
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {t.reported}
            </div>
          ) : reportOpen ? (
            <form onSubmit={onReport} className="flex gap-2">
              <input
                type="url"
                inputMode="url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://…"
                aria-label={t.postUrl}
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
              />
              <button type="submit" disabled={markShared.isPending} className={btnSecondary}>
                {markShared.isPending ? t.reporting : t.report}
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setReportOpen(true)} className={cx(btnPrimary)}>
              <Check className="h-4 w-4" aria-hidden />
              {t.posted}
            </button>
          )}
          <ErrorLine message={actionError} />
        </section>

        {result.trackedLink ? (
          <section className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-stone-500">
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              {t.tracked}
            </div>
            <div className="mt-1 break-all font-mono text-[13px] text-stone-900">{result.trackedLink}</div>
            <div className="mt-1 text-[12px] text-stone-600">{t.trackedNote}</div>
          </section>
        ) : null}

        <section className="rounded-xl border border-stone-200 bg-white p-3">
          <h2 className="mb-2 text-[14px] font-semibold">{t.policy}</h2>
          <CompliancePanel report={result.compliance} before={result.firstDraft} after={caption} compact />
        </section>

        <button
          type="button"
          onClick={() => {
            setResult(null);
            window.scrollTo({ top: 0 });
          }}
          className={cx(btnSecondary, "w-full")}
        >
          <PenLine className="h-4 w-4" aria-hidden />
          {t.another}
        </button>
      </div>,
    );
  }

  // ── form view ────────────────────────────────────────────────────────────
  return shell(
    <div className="space-y-4">
      {existing.error ? <ErrorLine message={existing.error.message} /> : null}

      <label className="block">
        <span className="mb-1 block text-[13px] font-medium text-stone-700">{t.solution}</span>
        <select
          value={solutionId ?? ""}
          onChange={(e) => setSolutionId(Number(e.target.value))}
          className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[15px] text-stone-900"
        >
          {featured.length ? (
            <optgroup label={t.featured}>
              {featured.map((x) => (
                <option key={x.id} value={x.id}>
                  {solName(x)}
                </option>
              ))}
            </optgroup>
          ) : null}
          {rest.length ? (
            <optgroup label={t.others}>
              {rest.map((x) => (
                <option key={x.id} value={x.id}>
                  {solName(x)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        {solutionId ? (
          <span className="mt-1 block text-[12px] leading-snug text-stone-500">
            {(() => {
              const sel = solutions.find((x) => x.id === solutionId);
              return sel ? `${sel.vendor} · ${(market === "US" ? sel.summaryEn : sel.summaryZh).slice(0, 90)}…` : null;
            })()}
          </span>
        ) : null}
      </label>

      <fieldset>
        <legend className="mb-1 block text-[13px] font-medium text-stone-700">{t.channel}</legend>
        <div className="flex flex-wrap gap-2">
          {CHANNELS[market].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              aria-pressed={channel === c}
              className={cx(
                "rounded-full border px-3.5 py-2 text-[14px]",
                channel === c ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-800 hover:bg-stone-100",
              )}
            >
              {CHANNEL_NAMES[c]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-[13px] font-medium text-stone-700">{t.skill}</span>
        <select
          value={skillSlug}
          onChange={(e) => setSkillSlug(e.target.value)}
          className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[15px] text-stone-900"
        >
          <option value="">{t.auto}</option>
          {skills.map((k) => (
            <option key={k.slug} value={k.slug}>
              {market === "US" ? k.nameEn : k.nameZh}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[13px] font-medium text-stone-700">{t.angle}</span>
        <textarea
          value={angle}
          onChange={(e) => setAngle(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder={t.anglePh}
          className="block w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[15px] text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
        />
      </label>

      <div className="space-y-2">
        <button type="button" onClick={onGenerate} disabled={!solutionId || generate.isPending} className={btnPrimary}>
          <PenLine className="h-4 w-4" aria-hidden />
          {generate.isPending ? t.generating : t.generate}
        </button>
        {generate.isPending ? (
          <div className="text-center text-[12px] tabular-nums text-stone-500" role="status">
            {elapsed}s · {t.usually}
          </div>
        ) : null}
        <div className="flex items-start gap-1.5 text-[12px] leading-snug text-stone-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {t.checkedBy} {s.pack.name}
          </span>
        </div>
        <ErrorLine message={formError} />
      </div>
    </div>,
  );
}
