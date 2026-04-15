/**
 * App.tsx — v7 routing with /m/:missionId support
 */
import React, { useEffect, useState } from "react";
import Login from "./pages/Login";
import OnboardingWizard from "./pages/OnboardingWizard";
import AppShell from "./components/AppShell";
import ChatCore from "./components/ChatCore";
import { Navigate, Routes, Route, useParams, useNavigate } from "react-router-dom";
import { trpc } from "./lib/trpc";
import type { SquadOption } from "./data/taskSquads";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("authToken");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ── MissionPage: dedicated route for /m/:missionId ──────────────────────────
function MissionPage() {
  const { missionId } = useParams<{ missionId: string }>();
  const navigate = useNavigate();
  const numericMissionId = missionId ? Number(missionId) : null;

  const [activeSquad, setActiveSquad] = useState<SquadOption | null>(null);
  const [taskSquads, setTaskSquads] = useState<SquadOption[]>([]);

  useEffect(() => {
    setActiveSquad(null);
    setTaskSquads([]);
  }, [numericMissionId]);

  const handleMissionSelect = (id: number) => {
    navigate(`/m/${id}`);
  };

  return (
    <AppShell
      activeMissionId={numericMissionId}
      onMissionSelect={handleMissionSelect}
      onNewTask={(_wsKey) => {
        console.log("new task", _wsKey);
      }}
      activeSquad={activeSquad}
      taskSquads={taskSquads}
    >
      <ChatCore
        key={`mission-${numericMissionId}`}
        activeMissionId={numericMissionId}
        onMissionCreated={(id) => navigate(`/m/${id}`)}
        onSquadSelect={(taskLabel, squad, allSquads) => {
          setActiveSquad(squad);
          setTaskSquads(allSquads);
        }}
      />
    </AppShell>
  );
}

// ── IndexPage: redirect based on brands / latest mission ────────────────────
function IndexPage() {
  const navigate = useNavigate();
  const brandsQuery = trpc.brand.listByMember.useQuery(undefined, { refetchOnWindowFocus: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!brandsQuery.isSuccess) return;
    const brandList = (brandsQuery.data as any[]) ?? [];
    if (brandList.length === 0) {
      navigate("/onboarding", { replace: true });
      return;
    }
    // Legacy: support ?missionId=xxx in URL
    const searchParams = new URLSearchParams(window.location.search);
    const missionIdParam = searchParams.get("missionId");
    if (missionIdParam && Number(missionIdParam) > 0) {
      navigate(`/m/${missionIdParam}`, { replace: true });
      return;
    }
    setReady(true);
  }, [brandsQuery.isSuccess, brandsQuery.data, navigate]);

  if (!ready) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F9F9F8", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      }}>
        <div style={{ fontSize: 13, color: "#9B9990" }}>載入中…</div>
      </div>
    );
  }

  const handleMissionSelect = (id: number) => navigate(`/m/${id}`);
  return (
    <AppShell
      activeMissionId={null}
      onMissionSelect={handleMissionSelect}
      onNewTask={(_wsKey) => {}}
    >
      <ChatCore
        activeMissionId={null}
        onMissionCreated={(id) => navigate(`/m/${id}`)}
      />
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<RequireAuth><OnboardingWizard onComplete={() => window.location.href = "/"} /></RequireAuth>} />
      <Route
        path="/m/:missionId"
        element={
          <RequireAuth>
            <MissionPage />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <IndexPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
