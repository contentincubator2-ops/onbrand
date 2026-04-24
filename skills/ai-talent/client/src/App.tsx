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

// ── StudioEntry: compact top-right pill shown on mission pages ──────────────
function StudioEntryPill({ brandId }: { brandId: number | null }) {
  const navigate = useNavigate();
  if (!brandId) return null;
  return (
    <button
      onClick={() => navigate(`/studio/${brandId}/triage`)}
      title="Open Decision AI Studio"
      style={{
        position: "absolute", top: 14, right: 18, zIndex: 50,
        padding: "7px 14px", borderRadius: 999,
        background: "#0A0A0A", color: "#FFFFFF",
        fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
        border: "none", cursor: "pointer", fontWeight: 500,
        boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
      }}
    >
      Open Studio →
    </button>
  );
}

// ── StudioEntry: prominent homepage card ────────────────────────────────────
function StudioEntryCard({ brandId }: { brandId: number | null }) {
  const navigate = useNavigate();
  if (!brandId) return null;
  return (
    <div
      style={{
        position: "absolute", top: 16, right: 20, zIndex: 50,
        maxWidth: 340, background: "#FFFFFF",
        border: "1px solid #E4E3E1", borderLeft: "3px solid #C8322E",
        padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6,
        boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#9B9990" }}>
        New · Decision AI
      </div>
      <div style={{ fontSize: 15, color: "#1A1A18", fontWeight: 600, lineHeight: 1.3 }}>
        Start a new methodology
      </div>
      <div style={{ fontSize: 12, color: "#6A6A62", lineHeight: 1.45 }}>
        Diagnose → pick a framework → 6 agent-led steps → publish gate.
      </div>
      <button
        onClick={() => navigate(`/studio/${brandId}/triage`)}
        style={{
          alignSelf: "flex-start", marginTop: 4,
          padding: "6px 14px", background: "#0A0A0A", color: "#FFFFFF",
          fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase",
          border: "none", cursor: "pointer",
        }}
      >
        Open Studio →
      </button>
    </div>
  );
}

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
      <div style={{ position: "relative", height: "100%" }}>
        <StudioEntryPill brandId={brandIdParam ? Number(brandIdParam) || null : null} />
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
      </div>
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
      <div style={{ position: "relative", height: "100%" }}>
        <StudioEntryCard
          brandId={(() => {
            try { return Number(localStorage.getItem("sowork.selectedBrandId")) || null; } catch { return null; }
          })()}
        />
        <MissionChatCore
          activeMissionId={null}
          initialBrandId={(() => {
            try { return Number(localStorage.getItem("sowork.selectedBrandId")) || null; } catch { return null; }
          })()}
          onMissionCreated={(id) => navigate(`/m/${id}`)}
          onSquadPreview={(squad) => setActiveSquad(squad)}
          onSquadStepProgress={setSquadStepProgress}
        />
      </div>
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
