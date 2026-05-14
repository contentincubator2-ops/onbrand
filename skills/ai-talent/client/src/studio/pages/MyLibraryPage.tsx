/**
 * MyLibraryPage (画面 5) — personal methodology templates list.
 */

import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import StudioLayout from "../StudioLayout";
import { trpc } from "../../lib/trpc";
import type { MosAccent } from "../primitives/tokens";
import { ACCENTS, clipForIndex } from "../primitives/tokens";

type Filter = "all" | "my-remix" | "sowork" | "scheduled";

export default function MyLibraryPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const q_list = trpc.template.list.useQuery(
    { brandId: Number(brandId), scheduled: filter === "scheduled" || undefined },
    { enabled: !!brandId, refetchOnWindowFocus: false }
  );

  const templates = ((q_list.data as any[]) ?? []).filter((t: any) => {
    if (q && !`${t.name} ${t.description ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    if (filter === "my-remix" && !t.stepsOverride && !t.promptsOverride) return false;
    if (filter === "sowork" && (t.stepsOverride || t.promptsOverride)) return false;
    return true;
  });

  return (
    <StudioLayout
      title="My Methodology Library"
      actions={
        <>
          <button
            onClick={() => navigate(`/studio/${brandId}/triage`)}
            className="px-4 py-2 text-meta uppercase tracking-[0.16em] border border-divider text-foreground hover:border-foreground"
          >
            From Diagnosis
          </button>
          <button className="px-4 py-2 text-meta uppercase tracking-[0.16em] bg-foreground text-white">
            + New Template
          </button>
        </>
      }
    >
      <div className="flex items-center justify-between border-b border-divider pb-4 mb-6">
        <div className="flex gap-px bg-divider border border-divider">
          {(["all", "my-remix", "sowork", "scheduled"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                "px-4 py-2 text-meta uppercase tracking-[0.16em]",
                filter === f ? "bg-foreground text-white" : "bg-white text-foreground",
              ].join(" ")}
            >
              {f.replace("-", " ")}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="border border-divider px-3 py-2 text-[0.88rem] w-[280px] focus:outline-none focus:border-foreground"
        />
      </div>

      <div className="space-y-3">
        {q_list.isLoading && (
          <div className="text-meta text-default-500 py-16 text-center">Loading…</div>
        )}
        {!q_list.isLoading && templates.length === 0 && (
          <div className="border border-dashed border-divider p-12 text-center text-meta text-default-500">
            No templates yet. Save one after approving a methodology run.
          </div>
        )}
        {templates.map((t: any) => (
          <TemplateRow key={t.id} t={t} />
        ))}
      </div>
    </StudioLayout>
  );
}

function TemplateRow({ t }: { t: any }) {
  const accent: MosAccent = (t.accent as MosAccent) ?? "teal";
  const tone = ACCENTS[accent];
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString() : "—";

  return (
    <div className="flex items-stretch border border-divider bg-white">
      <div className={`w-[88px] shrink-0 ${tone.bgClass} ${clipForIndex(0)}`} />
      <div className="flex-1 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="mos-display text-[1.1rem] text-foreground">{t.name}</div>
            <div className="text-meta text-default-500 mt-1">
              {t.description ?? (t.stepsOverride ? "Remixed" : "SoWork original")}
            </div>
          </div>
          <div className="text-meta uppercase tracking-[0.16em] text-default-500">
            {t.lastRunAt ? `last run · ${fmtDate(t.lastRunAt)}` : `updated · ${fmtDate(t.updatedAt)}`}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-6 text-meta text-foreground">
          {typeof t.runCount === "number" && (
            <span>Runs · {t.runCount}</span>
          )}
          {t.avgAuditScore != null && (
            <span>Avg audit · {Math.round(Number(t.avgAuditScore))}</span>
          )}
          {t.scheduleCron && <span>Schedule · {t.scheduleCron}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 pr-5">
        <button className="px-4 py-2 text-meta uppercase tracking-[0.16em] border border-divider text-foreground hover:border-foreground">
          Open
        </button>
        <button className="px-4 py-2 text-meta uppercase tracking-[0.16em] border border-divider text-foreground hover:border-foreground">
          Duplicate
        </button>
      </div>
    </div>
  );
}
