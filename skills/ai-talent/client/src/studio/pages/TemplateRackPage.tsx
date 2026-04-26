/**
 * TemplateRackPage — 3-card Canva-style methodology rack (画面 2).
 *
 * Comes from TriagePage via location.state. Each recommendation becomes a
 * vertical roll-up banner card (teal / red / blue). Clicking SELECT starts
 * a Studio session on that squad slug.
 */

import React, { useMemo } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import StudioLayout from "../StudioLayout";
import GeometricCard from "../primitives/GeometricCard";
import { accentForIndex } from "../primitives/tokens";
import { trpc } from "../../lib/trpc";

interface Recommendation {
  squadSlug: string;
  decisionType: string;
  label: string;
  rationale: string;
  layer: string;
}

interface LocationState {
  sessionId?: number;
  recommendations?: Recommendation[];
  trigger?: string;
  stage?: string;
}

export default function TemplateRackPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const loc = useLocation();
  const state = (loc.state as LocationState | null) ?? null;
  const recommendations = state?.recommendations ?? [];

  // Fetch the squad objects to know step list + author
  const slugs = useMemo(
    () => recommendations.map((r) => r.squadSlug),
    [recommendations]
  );
  const squadsQuery = trpc.squad.listByBrand?.useQuery
    ? trpc.squad.listByBrand.useQuery(
        { brandId: Number(brandId) },
        { enabled: !!brandId && slugs.length > 0, refetchOnWindowFocus: false }
      )
    : null;

  // Canonical squad shape — see squadTemplateRouter.listByBrand
  const allSquads: any[] = (squadsQuery?.data as any[]) ?? [];
  const enriched = recommendations.map((r) => {
    const sq = allSquads.find((s: any) => s.slug === r.squadSlug);
    const steps = Array.isArray(sq?.steps)
      ? sq.steps.map((st: any) => st?.name ?? "Step")
      : [];
    return {
      ...r,
      squadId: sq?.id,
      author: sq?.methodology?.author ?? "",
      year: sq?.methodology?.year ?? "",
      steps: steps.slice(0, 6),
      tokenBudget: sq?.tokenBudget ?? null,
    };
  });

  if (!recommendations.length) {
    return (
      <StudioLayout title="Templates">
        <div className="py-20 text-center">
          <div className="mos-eyebrow mb-3">No recommendations yet</div>
          <Link
            to={`/studio/${brandId}/triage`}
            className="mos-display text-[1.5rem] text-mos-ink underline underline-offset-4 decoration-1"
          >
            Start diagnosis →
          </Link>
        </div>
      </StudioLayout>
    );
  }

  return (
    <StudioLayout
      back={{ to: `/studio/${brandId}/triage`, label: "Back" }}
      title="Recommended Methodologies"
      actions={
        <div className="text-meta uppercase tracking-[0.16em] text-mos-muted">
          {state?.trigger && `${state.trigger.replace(/-/g, " ")} `}
          {state?.stage && `· ${state.stage}`}
        </div>
      }
    >
      <div className="flex items-start justify-center gap-6 py-6 flex-wrap">
        {enriched.map((r, i) => {
          const accent = accentForIndex(i);
          return (
            <GeometricCard
              key={r.squadSlug}
              accent={accent}
              accentIndex={i}
              eyebrow="SOWORK"
              title={r.label.split(/[·\s/]/)[0] || r.label}
              subtitle={r.label.length > 12 ? r.label : undefined}
              meta={
                r.author
                  ? `${String(r.author).toUpperCase()}${r.year ? " · " + r.year : ""}`
                  : r.decisionType.toUpperCase()
              }
              bullets={
                r.steps.length
                  ? r.steps
                  : [
                      "Define core",
                      "Audit gaps",
                      "Shape benefit ladder",
                      "Messaging",
                      "Stress test",
                    ]
              }
              footerMeta={
                r.steps.length
                  ? `${r.steps.length} steps · ~${r.steps.length * 4} min`
                  : undefined
              }
              tag={`RECOMMENDED ${i + 1}`}
              why={r.rationale}
              action={
                <button
                  onClick={() =>
                    navigate(`/studio/${brandId}/session/${r.squadSlug}`, {
                      state: {
                        squadSlug: r.squadSlug,
                        squadId: r.squadId,
                        accent,
                        decisionType: r.decisionType,
                        label: r.label,
                        triageSessionId: state?.sessionId,
                      },
                    })
                  }
                  className="w-full py-3 border border-mos-ink text-mos-ink text-[0.78rem] uppercase tracking-[0.2em] hover:bg-mos-ink hover:text-white transition"
                >
                  Select
                </button>
              }
            />
          );
        })}
      </div>

      <div className="mt-16 border-t border-mos-hair pt-6 flex items-center justify-between">
        <div className="text-meta uppercase tracking-[0.16em] text-mos-muted">
          Or choose from your saved templates
        </div>
        <Link
          to={`/studio/${brandId}/library`}
          className="text-meta uppercase tracking-[0.16em] text-mos-ink hover:underline underline-offset-4"
        >
          Open my library →
        </Link>
      </div>
    </StudioLayout>
  );
}
