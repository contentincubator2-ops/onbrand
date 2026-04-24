/**
 * App.tsx — v7 routing with /m/:missionId support and authentication
 */
import React, { useEffect, useState } from "react";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import OnboardingWizard from "./pages/OnboardingWizard";
import StrategyDeckPage from "./pages/StrategyDeckPage";
import TriagePage from "./studio/pages/TriagePage";
import TemplateRackPage from "./studio/pages/TemplateRackPage";
import StudioPage from "./studio/pages/StudioPage";
import PublishGatePage from "./studio/pages/PublishGatePage";
import MyLibraryPage from "./studio/pages/MyLibraryPage";
import BoardPage from "./studio/pages/BoardPage";
import CalendarPage from "./studio/pages/CalendarPage";
import AppShell from "./components/AppShell";
import MissionChatCore from "./components/MissionChatCore";
import type { SquadStepProgress } from "./components/MissionChatCore";
import { Navigate, Routes, Route, useParams, useNavigate } from "react-router-dom";
import { trpc } from "./lib/trpc";
import type { DBSquad } from "./types/squad";
import { LanguageProvider } from "./lib/i18n";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "POST",
          credentials: "include",
        });

        if (!res.ok) {
          setIsAuthenticated(false);
          setChecking(false);
          return;
        }

        const data = await res.json();
        setIsAuthenticated(!!data.user);
      } catch (err) {
        setIsAuthenticated(false);
      } finally {
        setChecking(false);
      }
    };

    checkAuth();
  }, []);

  useEffect(() => {
    if (!checking && !isAuthenticated) {
      navigate("/auth/login", { replace: true });
    }
  }, [checking, isAuthenticated, navigate]);

  if (checking) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F9F9F8", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      }}>
        <div style={{ fontSize: 13, color: "#9B9990" }}>載入中…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

// ── MissionPage: /b/:brandId/:workspace/m/:missionId ────────────────────────
function MissionPage() {
  const { missionId, brandId: brandIdParam, workspace } = useParams<{
    missionId: string;
    brandId?: string;
    workspace?: string;
  }>();
  const navigate = useNavigate();
  const numericMissionId = missionId ? Number(missionId) : null;

  const [activeSquad, setActiveSquad] = useState<DBSquad | null>(null);
  const [squadStepProgress, setSquadStepProgress] = useState<SquadStepProgress[]>([]);

  useEffect(() => {
    setActiveSquad(null);
    setSquadStepProgress([]);
  }, [numericMissionId]);

  const handleMissionSelect = (id: number, bId?: number, ws?: string) => {
    if (bId && ws) {
      navigate(`/b/${bId}/${ws}/m/${id}`);
    } else if (bId) {
      navigate(`/b/${bId}/_/m/${id}`);
    } else {
      navigate(`/m/${id}`);
    }
  };

  return (
    <AppShell
      activeMissionId={numericMissionId}
      onMissionSelect={handleMissionSelect}
      onNewTask={(_wsKey) => {
        console.log("new task", _wsKey);
      }}
      activeSquad={activeSquad}
      squadStepProgress={squadStepProgress}
    >
      <MissionChatCore
        key={`mission-${numericMissionId}-brand-${brandIdParam ?? "_"}`}
        activeMissionId={numericMissionId}
        initialBrandId={brandIdParam ? Number(brandIdParam) || null : null}
        onMissionCreated={(id) => {
          // When a new mission is created, stay on the same brand/workspace if available
          if (brandIdParam && workspace) {
            navigate(`/b/${brandIdParam}/${workspace}/m/${id}`);
          } else {
            navigate(`/m/${id}`);
          }
        }}
        onSquadPreview={(squad) => {
          setActiveSquad(squad);
        }}
        onSquadStepProgress={setSquadStepProgress}
      />
    </AppShell>
  );
}

// ── IndexPage: redirect based on brands / latest mission ────────────────────
function IndexPage() {
  const navigate = useNavigate();
  const brandsQuery = trpc.brand.listByMember.useQuery(undefined, { refetchOnWindowFocus: false });
  const [ready, setReady] = useState(false);

  // Squad preview state — shared with AppShell so the right panel updates
  // when user hovers/clicks a squad chip on the homepage (before mission
  // creation). Without this wiring the right panel renders blank.
  const [activeSquad, setActiveSquad] = useState<DBSquad | null>(null);
  const [squadStepProgress, setSquadStepProgress] = useState<SquadStepProgress[]>([]);

  useEffect(() => {
    // If auth fails (expired/invalid JWT), clear token and bounce to login.
    // Without this, the page sits on "載入中…" forever because `isSuccess`
    // never flips when the server returns 401.
    if (brandsQuery.isError) {
      try { localStorage.removeItem("authToken"); } catch {}
      navigate("/login", { replace: true });
      return;
    }
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
  }, [brandsQuery.isSuccess, brandsQuery.isError, brandsQuery.data, navigate]);

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

  const handleMissionSelect = (id: number, bId?: number, ws?: string) => {
    if (bId && ws) {
      navigate(`/b/${bId}/${ws}/m/${id}`);
    } else if (bId) {
      navigate(`/b/${bId}/_/m/${id}`);
    } else {
      navigate(`/m/${id}`);
    }
  };

  return (
    <AppShell
      activeMissionId={null}
      onMissionSelect={handleMissionSelect}
      onNewTask={(_wsKey) => {}}
      activeSquad={activeSquad}
      squadStepProgress={squadStepProgress}
    >
      <MissionChatCore
        activeMissionId={null}
        initialBrandId={(() => {
          try { return Number(localStorage.getItem("sowork.selectedBrandId")) || null; } catch { return null; }
        })()}
        onMissionCreated={(id) => navigate(`/m/${id}`)}
        onSquadPreview={(squad) => setActiveSquad(squad)}
        onSquadStepProgress={setSquadStepProgress}
      />
    </AppShell>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <Routes>
        {/* Auth routes */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

        {/* Legacy redirect */}
        <Route path="/login" element={<Navigate to="/auth/login" replace />} />

        {/* Protected routes */}
        <Route path="/onboarding" element={<RequireAuth><OnboardingWizard onComplete={() => window.location.href = "/"} /></RequireAuth>} />
        {/* Strategy Deck (Phase 1) — card-based UI replacement */}
        <Route path="/b/:brandId/deck" element={<RequireAuth><StrategyDeckPage /></RequireAuth>} />

        {/* Studio (Decision AI methodology workspace) */}
        <Route path="/studio/:brandId/triage" element={<RequireAuth><TriagePage /></RequireAuth>} />
        <Route path="/studio/:brandId/templates" element={<RequireAuth><TemplateRackPage /></RequireAuth>} />
        <Route path="/studio/:brandId/session/:sessionId" element={<RequireAuth><StudioPage /></RequireAuth>} />
        <Route path="/studio/:brandId/publish" element={<RequireAuth><PublishGatePage /></RequireAuth>} />
        <Route path="/studio/:brandId/library" element={<RequireAuth><MyLibraryPage /></RequireAuth>} />
        <Route path="/studio/:brandId/board" element={<RequireAuth><BoardPage /></RequireAuth>} />
        <Route path="/studio/:brandId/calendar" element={<RequireAuth><CalendarPage /></RequireAuth>} />
        <Route path="/studio/:brandId" element={<RequireAuth><Navigate to="templates" replace /></RequireAuth>} />
        {/* Primary URL format: /b/:brandId/:workspace/m/:missionId */}
        <Route
          path="/b/:brandId/:workspace/m/:missionId"
          element={
            <RequireAuth>
              <MissionPage />
            </RequireAuth>
          }
        />
        {/* Legacy / fallback: /m/:missionId */}
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
    </LanguageProvider>
  );
}
