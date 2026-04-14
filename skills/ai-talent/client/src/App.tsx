/**
 * App.tsx — v7 routing
 * Index route: AppShell + ChatCore
 * Preserved: Login, OnboardingWizard
 */
import React from "react";
import Login from "./pages/Login";
import OnboardingWizard from "./pages/OnboardingWizard";
import AppShell from "./components/AppShell";
import ChatCore from "./components/ChatCore";
import { Navigate, Routes, Route } from "react-router-dom";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("authToken");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppShellWithMission() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialMissionId = searchParams.get('missionId') ? Number(searchParams.get('missionId')) : null;
  const [activeMissionId, setActiveMissionId] = React.useState<number | null>(initialMissionId);

  return (
    <AppShell
      activeMissionId={activeMissionId}
      onMissionSelect={(id) => setActiveMissionId(id)}
    >
      <ChatCore activeMissionId={activeMissionId} />
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<RequireAuth><OnboardingWizard onComplete={() => window.location.href = "/"} /></RequireAuth>} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShellWithMission />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
