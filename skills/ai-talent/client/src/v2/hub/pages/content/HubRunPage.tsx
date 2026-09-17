/**
 * Content · run page — OnBrand RunPage look: breadcrumb, platform mockup on the
 * left, sticky aside with the compliance result, tracked link and actions.
 */
import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRotateRight, faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { PlatformMockup } from "../../../content/components/PlatformMockup";
import { trpc } from "../../../../lib/trpc";
import CompliancePanel from "../../CompliancePanel";
import { DemoTag, ErrorNote, LiveDot, Loading, Pill, VerdictBadge, cx, fmt } from "../../ui";
import { useT } from "../../lang";
import { CHANNEL_META, isChannel } from "../../components/tasks-shared";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }
      }}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] font-medium text-neutral-800 hover:bg-neutral-50"
    >
      <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
      {copied ? done : label}
    </button>
  );
}

export default function HubRunPage() {
  const { postId } = useParams();
  const t = useT();
  const id = Number(postId);
  const post = trpc.hub.admin.post.useQuery({ postId: id }, { enabled: Number.isFinite(id), refetchInterval: 10_000 });
  const [view, setView] = useState<"final" | "draft">("final");

  if (post.isLoading) return <Loading />;
  if (post.error || !post.data) {
    return (
      <div className="py-10">
        <ErrorNote error={post.error ?? { message: t("Post not found.", "找不到這篇貼文。") }} />
      </div>
    );
  }
  const p = post.data;
  const meta = isChannel(p.channel) ? CHANNEL_META[p.channel] : CHANNEL_META.facebook;
  const zh = p.market === "TW";
  const showDraft = Boolean(p.firstDraft && p.firstDraft.trim() !== p.caption.trim());
  const caption = view === "draft" && showDraft ? (p.firstDraft as string) : p.caption;
  const solutionName = p.solution ? (zh ? p.solution.nameZh : p.solution.nameEn) : null;
  const linkHost = p.trackedLink ? new URL(p.trackedLink).host : "";
  const wording = (p.compliance?.wording ?? []) as Array<{ from: string; to: string }>;

  return (
    <div className="mx-auto max-w-[1500px] px-0 py-3 md:px-4">
      {/* Breadcrumb */}
      <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-neutral-500">
        <Link to={`/hub/tasks/${p.channel}`} className="hover:text-neutral-800">{t("Content", "內容")}</Link>
        <span>›</span>
        <Link to={`/hub/tasks/${p.channel}`} className="hover:text-neutral-800">{meta.label}</Link>
        <span>›</span>
        <span className="text-neutral-700">{p.skill ? t(p.skill.nameEn, p.skill.nameZh) : t("Post", "貼文")}</span>
        <span>›</span>
        <span className="font-medium text-neutral-900">{t(`Post #${p.id}`, `貼文 #${p.id}`)}</span>
      </nav>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_360px]">
        {/* Mockup */}
        <div className="min-w-0">
          <div className="rounded-2xl bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.05)] ring-1 ring-black/5 md:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: meta.color }}>
                  <FontAwesomeIcon icon={meta.icon} style={{ fontSize: 11 }} />
                </span>
                {t(`${meta.label} preview · ${p.rep.name}'s personal account`, `${meta.label} 預覽 · ${p.rep.name} 的個人帳號`)}
              </div>
              {showDraft ? (
                <div className="inline-flex rounded-md border border-neutral-200 p-0.5 text-[12px]">
                  {(["final", "draft"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={cx("rounded px-2.5 py-1", view === v ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100")}
                    >
                      {v === "final" ? t("Compliant version", "合規版本") : t("Original draft", "原始草稿")}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mx-auto max-w-[560px]">
              <PlatformMockup
                variant={meta.variant}
                title={solutionName ?? ""}
                brief=""
                brandName={p.rep.name}
                liveCaption={caption}
                ogCard={
                  p.trackedLink && p.channel !== "line"
                    ? {
                        url: p.trackedLink,
                        image: null,
                        title: solutionName ? `${solutionName} — ASUS ExpertHub` : "ASUS ExpertHub",
                        description: t("Start with a free online diagnosis.", "從免費線上診斷開始。"),
                        siteName: "ExpertHub",
                        domain: linkHost,
                      }
                    : undefined
                }
              />
            </div>
            {view === "draft" && showDraft ? (
              <p className="mt-3 text-center text-[12px] text-amber-700">
                {t("This is what the first draft said before the checks — it was never shared.", "這是檢查前的第一版草稿，從未被分享出去。")}
              </p>
            ) : null}
          </div>
        </div>

        {/* Aside */}
        <aside className="min-w-0 md:sticky md:top-[76px] md:self-start">
          <div className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <VerdictBadge verdict={p.verdict as any} caught={p.compliance?.issuesCaught} />
              {p.isDemo ? (
                <DemoTag />
              ) : (
                <Pill tone="live">
                  <LiveDot /> LIVE
                </Pill>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <CopyButton text={p.caption} label={t("Copy post", "複製貼文")} done={t("Copied", "已複製")} />
              <Link
                to={`/hub/tasks/${p.channel}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
                style={{ background: "#F97316" }}
              >
                <FontAwesomeIcon icon={faArrowRotateRight} />
                {t("Write another", "再寫一篇")}
              </Link>
            </div>

            {p.compliance ? <CompliancePanel report={p.compliance} compact /> : null}

            {wording.length ? (
              <div className="rounded-lg border border-neutral-200 p-3">
                <div className="text-[12px] font-semibold text-neutral-700">{t("Preferred wording applied", "已套用正面用詞")}</div>
                <ul className="mt-1.5 space-y-1 text-[12px] text-neutral-600">
                  {wording.map((w) => (
                    <li key={`${w.from}-${w.to}`}>
                      <span className="line-through decoration-neutral-400">{w.from}</span> → <span className="font-medium text-neutral-900">{w.to}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {p.trackedLink ? (
              <div className="rounded-lg border border-neutral-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-neutral-700">{t("Tracked link", "追蹤連結")}</span>
                  <span className="text-[12px] tabular-nums text-neutral-500">{t(`${fmt(p.clicks)} clicks`, `${fmt(p.clicks)} 次點擊`)}</span>
                </div>
                <div className="mt-1 break-all font-mono text-[12px] text-neutral-800">{p.trackedLink}</div>
                <div className="mt-2">
                  <CopyButton text={p.trackedLink} label={t("Copy link", "複製連結")} done={t("Copied", "已複製")} />
                </div>
              </div>
            ) : null}

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-neutral-100 pt-3 text-[12px]">
              <dt className="text-neutral-500">{t("Written as", "發文業務")}</dt>
              <dd className="text-neutral-800">{p.rep.name} · {p.rep.market}</dd>
              {solutionName ? (
                <>
                  <dt className="text-neutral-500">{t("Solution", "方案")}</dt>
                  <dd className="text-neutral-800">{solutionName}</dd>
                </>
              ) : null}
              {p.skill ? (
                <>
                  <dt className="text-neutral-500">{t("Skill", "寫作技能")}</dt>
                  <dd className="text-neutral-800">{t(p.skill.nameEn, p.skill.nameZh)}</dd>
                </>
              ) : null}
              {p.model ? (
                <>
                  <dt className="text-neutral-500">{t("Writer", "撰寫模型")}</dt>
                  <dd className="text-neutral-800">
                    {p.model}
                    {p.latencyMs ? ` · ${(p.latencyMs / 1000).toFixed(1)}s` : ""}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
