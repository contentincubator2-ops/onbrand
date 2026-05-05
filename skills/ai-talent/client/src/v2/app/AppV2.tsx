/**
 * AppV2 — Marketing-OS frontend rebuild (Sprint 1, 2026-04-25).
 *
 * Architecture: rack-card design language end-to-end. The shell is
 * a top brand bar + center stage. Chat is demoted to a drawer (D4).
 *
 * Routes
 *   /                              → MissionsHome (任務牆)
 *   /m/:missionId                  → MissionDetail
 *   /b/:brandId/:workspace/m/:id   → MissionDetail (brand-scoped URL)
 *   /methodology                   → MethodologyCatalog
 *   /methodology/:slug             → MethodologyDetail
 *   /onboarding                    → legacy OnboardingWizard (re-skinned later)
 *   /auth/*                        → legacy auth pages (kept verbatim)
 *
 * Auth gate is unchanged — RequireAuth still wraps protected routes.
 */
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "../../lib/i18n";

// Legacy auth — kept until Sprint 2 visual rework
import LoginPage from "../../pages/auth/LoginPage";
import RegisterPage from "../../pages/auth/RegisterPage";
import VerifyEmailPage from "../../pages/auth/VerifyEmailPage";
import ForgotPasswordPage from "../../pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "../../pages/auth/ResetPasswordPage";
import OnboardingWizard from "../../pages/OnboardingWizard";

// v2
import RequireAuthV2 from "./RequireAuthV2";
import ShellLayout from "./shell/ShellLayout";
import MissionsHome from "../pages/MissionsHome";
// MissionDetail retired 2026-04-27 (C1) — replaced by in-picker WorkflowRunner.
// /m/:missionId now redirects to /picker?mission=:id.
import MissionRedirect from "./MissionRedirect";
import MethodologyCatalog from "../pages/MethodologyCatalog";
import MethodologyDetail from "../pages/MethodologyDetail";
import PickerWorkspace from "../pages/PickerWorkspace";
import ProjectsPage from "../pages/ProjectsPage";
import BrandsPage from "../pages/BrandsPage";
import QuickTasksPage from "../pages/QuickTasksPage";
import QuickTask30sPage from "../pages/QuickTask30sPage";
import BoardroomPage from "../pages/BoardroomPage";
import PlaybooksPage from "../pages/PlaybooksPage";
import SquadMockupsGalleryPage from "../pages/SquadMockupsGalleryPage";
import SquadLabPage from "../pages/admin/SquadLabPage";

/**
 * Top-level error boundary — catches any render-time exception that
 * would otherwise blank the entire SPA. Shows the message + stack
 * inline so a "空白畫面" report immediately becomes actionable.
 */
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[AppV2] render error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", padding: 32, fontFamily: "system-ui, sans-serif" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 12 }}>
            <p style={{ fontSize: 12, color: "#dc2626", textTransform: "uppercase", letterSpacing: 1 }}>RENDER ERROR</p>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>應用程式載入失敗</h2>
            <p style={{ marginTop: 8, color: "#374151" }}>{this.state.error.message}</p>
            <pre style={{ marginTop: 12, padding: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11, maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap" }}>
              {this.state.error.stack}
            </pre>
            <div style={{ marginTop: 12 }}>
              <button
                style={{ padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer", marginRight: 8 }}
                onClick={() => { this.setState({ error: null }); }}
              >
                重試渲染
              </button>
              <button
                style={{ padding: "6px 12px", background: "white", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}
                onClick={() => { window.location.reload(); }}
              >
                重新整理頁面
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

export default function AppV2() {
  return (
    <AppErrorBoundary>
    <LanguageProvider>
      <Routes>
        {/* Auth — unchanged */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<Navigate to="/auth/login" replace />} />

        {/* Onboarding kept */}
        <Route
          path="/onboarding"
          element={
            <RequireAuthV2>
              <OnboardingWizard onComplete={() => (window.location.href = "/")} />
            </RequireAuthV2>
          }
        />

        {/* Picker — full-screen workspace, no shell chrome (Canva-style new tab) */}
        <Route
          path="/picker"
          element={
            <RequireAuthV2>
              <PickerWorkspace />
            </RequireAuthV2>
          }
        />

        {/* v2 protected routes — share ShellLayout */}
        <Route
          element={
            <RequireAuthV2>
              <ShellLayout />
            </RequireAuthV2>
          }
        >
          {/* 2026-05-05 pivot: 快派 (QuickTask) is now the main entry.
              Current MissionsHome moved to /squads; /quicktask kept as
              alias so any existing links still work. */}
          {/* 2026-05-05 pivot v2: tier = top-level route. 30S/60S/90S are
              siblings, each rendering QuickTask30sPage with a different
              tier prop. / redirects to /30s. */}
          <Route path="/" element={<Navigate to="/30s" replace />} />
          <Route path="/30s" element={<QuickTask30sPage tier="30s" />} />
          <Route path="/60s" element={<QuickTask30sPage tier="60s" />} />
          <Route path="/90s" element={<QuickTask30sPage tier="90s" />} />
          <Route path="/squads" element={<MissionsHome />} />
          <Route path="/quicktask" element={<Navigate to="/30s" replace />} />
          <Route path="/fb" element={<Navigate to="/30s" replace />} />
          <Route path="/quicktask-legacy" element={<QuickTasksPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/brands" element={<BrandsPage />} />
          <Route path="/boardroom" element={<BoardroomPage />} />
          <Route path="/playbooks" element={<PlaybooksPage />} />
          <Route path="/m/:missionId" element={<MissionRedirect />} />
          <Route path="/b/:brandId/:workspace/m/:missionId" element={<MissionRedirect />} />
          <Route path="/templates" element={<MethodologyCatalog />} />
          <Route path="/templates/:slug" element={<MethodologyDetail />} />
          <Route path="/squad-mockups" element={<SquadMockupsGalleryPage />} />
          <Route path="/admin/squads" element={<SquadLabPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LanguageProvider>
    </AppErrorBoundary>
  );
}
