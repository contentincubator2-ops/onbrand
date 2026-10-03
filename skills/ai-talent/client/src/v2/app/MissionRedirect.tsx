/**
 * MissionRedirect — 2026-05-10 (CJ direction「專案區任務應該在 /run 頁，
 * 不是 picker」): redirect /m/:missionId → /run/<latest-outputId>.
 *
 * Old behavior (now retired):
 *   /m/:id → /picker?mission=:id  (PickerWorkspace runner)
 *
 * New behavior:
 *   1. Fetch mission's outputs (output.list, sorted DESC by createdAt)
 *   2. Latest output → /run/<outputId> (mockup center + edit panel right)
 *   3. No outputs → /projects fallback
 *
 * Why: PickerWorkspace was the old workflow runner. Modern UX shows
 * users their result mockup directly with an edit panel beside it.
 */
import { tr } from "../../lib/i18n";
import { Navigate, useParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";

export default function MissionRedirect() {
  const { missionId } = useParams<{ missionId: string }>();
  const idNum = Number(missionId);

  const outputsQuery = (trpc as any).output?.list?.useQuery
    ? (trpc as any).output.list.useQuery(
        { missionId: idNum },
        { enabled: !!idNum, refetchOnWindowFocus: false },
      )
    : { data: null, isLoading: false };

  if (!idNum) return <Navigate to="/projects" replace />;

  if (outputsQuery.isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-content2 text-default-500 text-small">
        {tr("Opening your output…", "正在開啟你的產出…")}
      </div>
    );
  }

  const outputs: any[] = outputsQuery.data ?? [];
  if (outputs.length === 0) return <Navigate to="/projects" replace />;
  const latestOutputId = outputs[0]?.id;
  if (!latestOutputId) return <Navigate to="/projects" replace />;
  return <Navigate to={`/run/${latestOutputId}`} replace />;
}
