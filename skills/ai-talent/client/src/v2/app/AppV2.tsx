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
import BoardroomPage from "../pages/BoardroomPage";
import PlaybooksPage from "../pages/PlaybooksPage";

export default function AppV2() {
  return (
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
          <Route path="/" element={<MissionsHome />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/brands" element={<BrandsPage />} />
          <Route path="/ai" element={<QuickTasksPage />} />
          <Route path="/boardroom" element={<BoardroomPage />} />
          <Route path="/playbooks" element={<PlaybooksPage />} />
          <Route path="/m/:missionId" element={<MissionRedirect />} />
          <Route path="/b/:brandId/:workspace/m/:missionId" element={<MissionRedirect />} />
          <Route path="/templates" element={<MethodologyCatalog />} />
          <Route path="/templates/:slug" element={<MethodologyDetail />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LanguageProvider>
  );
}
