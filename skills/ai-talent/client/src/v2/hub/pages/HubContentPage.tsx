import React from "react";
import { ShieldCheck } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote, Loading, PageHeader } from "../ui";
import ContentSkills from "../components/content-skills";
import ContentPolicy from "../components/content-policy";
import ContentChecker from "../components/content-checker";

export default function HubContentPage() {
  const content = trpc.hub.admin.content.useQuery(undefined, { staleTime: 30_000 });

  const jumpToChecker = () => document.getElementById("checker")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow="Content & policy"
        title="How reps say it — checked before it's posted"
        subtitle="Marketing curates the writing skills. Policy packs encode the rules per market. Every post passes the same checks."
        right={
          content.data ? (
            <button
              type="button"
              onClick={jumpToChecker}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-800 hover:bg-stone-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Try the compliance checker
            </button>
          ) : null
        }
      />

      {content.isLoading ? (
        <Loading label="Loading skills and policy packs…" />
      ) : content.error ? (
        <ErrorNote error={content.error} />
      ) : content.data ? (
        <div className="space-y-10">
          <ContentSkills skills={content.data.skills} />
          <ContentPolicy packs={content.data.packs} />
          <ContentChecker packs={content.data.packs} />
        </div>
      ) : null}
    </div>
  );
}
