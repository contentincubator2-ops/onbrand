import React, { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleDashed, FileText, LoaderCircle, X } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { Card, ChannelLabel, ErrorNote, Pill, SectionTitle } from "../ui";
import { shortDate, type Skill } from "./content-types";

function StatusPill({ skill }: { skill: Skill }) {
  if (skill.status === "approved") {
    return (
      <Pill tone="good">
        <CircleCheck className="h-3 w-3" aria-hidden />
        Approved v{skill.version}
      </Pill>
    );
  }
  return (
    <Pill tone="warn">
      <CircleDashed className="h-3 w-3" aria-hidden />
      Draft
    </Pill>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5">{children}</span>;
}

const MARKET_NAMES: Record<string, string> = { TW: "Taiwan", US: "United States" };

function SkillModal({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const titleId = `skill-md-title-${skill.id}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-3 sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <h3 id={titleId} className="truncate font-mono text-[13px] font-semibold text-stone-900">
              {skill.slug}/SKILL.md
            </h3>
            <p className="mt-0.5 text-[12px] text-stone-500">Standard SKILL.md — the same format Hermes Agent loads as a company skill</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-stone-50 p-4 font-mono text-[12px] leading-relaxed text-stone-800">
          {skill.skillMd}
        </pre>
      </div>
    </div>
  );
}

function SkillCard({ skill, onView }: { skill: Skill; onView: () => void }) {
  const utils = trpc.useUtils();
  const approve = trpc.hub.admin.approveSkill.useMutation({
    onSuccess: () => utils.hub.admin.content.invalidate(),
  });
  const approvedOn = shortDate(skill.approvedAt);

  return (
    <Card className="flex min-w-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-snug text-stone-900">{skill.nameEn}</h3>
          <div lang="zh-Hant" className="mt-0.5 text-[13px] text-stone-500">{skill.nameZh}</div>
        </div>
        <StatusPill skill={skill} />
      </div>

      <dl className="mt-4 space-y-2 text-[12px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <dt className="w-16 shrink-0 text-stone-500">Channels</dt>
          <dd className="flex flex-wrap gap-1">
            {skill.channels.map((c) => (
              <Chip key={c}>
                <ChannelLabel channel={c} />
              </Chip>
            ))}
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <dt className="w-16 shrink-0 text-stone-500">Markets</dt>
          <dd className="flex flex-wrap gap-1">
            {skill.markets.map((m) => (
              <Chip key={m}>
                <span className="font-medium text-stone-700" title={MARKET_NAMES[m] ?? m}>{m}</span>
              </Chip>
            ))}
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-0.5 border-t border-stone-100 pt-3 text-[12px] text-stone-600">
        {skill.status === "approved" ? (
          <div>
            Approved by <span className="text-stone-800">{skill.approvedBy ?? "marketing"}</span>
            {approvedOn ? <span className="text-stone-500"> · {approvedOn}</span> : null}
          </div>
        ) : (
          <div>Waiting for marketing approval — reps can't use it yet.</div>
        )}
        <div className="text-stone-500">
          {skill.uses > 0 ? `Used in ${skill.uses.toLocaleString("en-US")} post${skill.uses === 1 ? "" : "s"}` : "Not used in any posts yet"}
        </div>
      </div>

      {approve.error ? (
        <div className="mt-3">
          <ErrorNote error={approve.error} />
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <button
          type="button"
          onClick={onView}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-800 hover:bg-stone-50"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          View SKILL.md
        </button>
        {skill.status === "draft" ? (
          <button
            type="button"
            onClick={() => approve.mutate({ skillId: skill.id })}
            disabled={approve.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-stone-800 disabled:opacity-60"
          >
            {approve.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CircleCheck className="h-3.5 w-3.5" aria-hidden />}
            {approve.isPending ? "Approving…" : "Approve"}
          </button>
        ) : null}
      </div>
    </Card>
  );
}

export default function ContentSkills({ skills }: { skills: Skill[] }) {
  const [viewing, setViewing] = useState<Skill | null>(null);
  const approved = skills.filter((s) => s.status === "approved").length;
  const drafts = skills.length - approved;

  return (
    <section>
      <SectionTitle
        title="Writing skills"
        hint={`Company-approved ways to write a post. ${approved} approved${drafts ? `, ${drafts} waiting for review` : ""}. Reps only see approved skills for their market.`}
      />
      {skills.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {skills.map((s) => (
            <SkillCard key={s.id} skill={s} onView={() => setViewing(s)} />
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-[13px] text-stone-500">No writing skills yet.</p>
        </Card>
      )}
      {viewing ? <SkillModal skill={viewing} onClose={() => setViewing(null)} /> : null}
    </section>
  );
}
