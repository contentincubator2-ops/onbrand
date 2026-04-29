/**
 * MissionRedirect — C1 retirement of MissionDetail (2026-04-27).
 *
 * The legacy /m/:missionId route now forwards into the unified picker
 * workspace. WorkflowRunner inside PickerWorkspace re-hydrates from
 * mission_step_progress when ?mission=<id> is present, so any old
 * bookmark / link continues to work and lands users on the same
 * agent workflow they were running.
 *
 * We also try to fetch the mission to grab its squadSlug — that lets
 * the picker pre-select the matching squad in the middle column.
 */
import React, { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";

export default function MissionRedirect() {
  const { missionId } = useParams<{ missionId: string }>();
  const idNum = Number(missionId);

  const missionQuery = (trpc as any).mission?.getById?.useQuery
    ? (trpc as any).mission.getById.useQuery(
        { id: idNum },
        { enabled: !!idNum, refetchOnWindowFocus: false },
      )
    : { data: null, isLoading: false };

  if (!idNum) return <Navigate to="/" replace />;
  if (missionQuery.isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-content2 text-default-500 text-small">
        正在帶你到工作區…
      </div>
    );
  }

  const slug = missionQuery.data?.squadSlug ?? "";
  const qs = new URLSearchParams();
  qs.set("mission", String(idNum));
  if (slug) qs.set("slug", slug);
  return <Navigate to={`/picker?${qs.toString()}`} replace />;
}
