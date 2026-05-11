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
import RunPage from "../pages/RunPage";
import BoardroomPage from "../pages/BoardroomPage";
import PlaybooksPage from "../pages/PlaybooksPage";
import TheaterPage from "../pages/TheaterPage";
import SquadMockupsGalleryPage from "../pages/SquadMockupsGalleryPage";
import SquadLabPage from "../pages/admin/SquadLabPage";
// 2026-05-10 (CJ「明天串金流，今天都做」)
import PricingPage from "../pages/PricingPage";
import AccountPage from "../pages/AccountPage";
import TermsPage from "../pages/legal/TermsPage";
import PrivacyPage from "../pages/legal/PrivacyPage";
import RefundPage from "../pages/legal/RefundPage";
import AchievementsPage from "../pages/AchievementsPage";
import BrandsManagePage from "../pages/BrandsManagePage";
// 2026-05-11 (CJ「補 Sentry-style error tracking」): admin dashboard for
// auto-captured tRPC / frontend errors. Gated server-side by adminProcedure.
import AdminErrorsPage from "../pages/AdminErrorsPage";
// 2026-05-11 (CJ「Spotify 模式」): community template marketplace
import CommunityPage from "../pages/CommunityPage";
// 2026-05-11 (CJ「P0-1 內容日曆」): vs Buffer
import CalendarPage from "../pages/CalendarPage";

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
    // 2026-05-11 — auto-report to the Sentry-lite error_log table so the
    // /admin/errors dashboard surfaces frontend crashes without users
    // needing to tell us. Fingerprint = first line of error so same
    // bug rolls up. Best-effort: if logging fails we still render the
    // recovery screen below.
    try {
      const firstLine = String(error?.message ?? "").split("\n")[0] ?? "render error";
      const fingerprint = `react:${firstLine.slice(0, 80)}`;
      // Use the trpc proxy directly via fetch (avoids importing the React
      // hook outside a component). The endpoint is publicProcedure so it
      // works pre-login too.
      const body = {
        json: {
          level: "error",
          source: "frontend.render",
          route: window.location.pathname,
          message: firstLine.slice(0, 500),
          stack: typeof error?.stack === "string" ? error.stack.slice(0, 4000) : undefined,
          fingerprint,
          meta: {
            componentStack: info?.componentStack?.slice(0, 1000),
            href: window.location.href,
            ua: navigator.userAgent.slice(0, 200),
          },
        },
      };
      fetch("/api/trpc/ops.logError?batch=0", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      }).catch(() => { /* swallow */ });
    } catch { /* never throw from componentDidCatch */ }
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

        {/* 2026-05-10: Public legal + pricing pages (no auth required so
            unregistered prospects can read T&C / Privacy / Refund + see pricing) */}
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refund" element={<RefundPage />} />

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
          {/* 2026-05-10 brand rename: 100s → 99s (久久 雙關 + 設計感).
              Tier prop stays "100s" so backend orchestra config unchanged. */}
          <Route path="/99s" element={<QuickTask30sPage tier="100s" />} />
          {/* 2026-05-09 (CJ): Phase 2 route-based output workspace.
              Replaces modal-based viewing for 60s/100s tasks. URL is
              shareable, browser back works, can multi-tab compare. */}
          <Route path="/run/:outputId" element={<RunPage />} />
          {/* Backwards-compat redirects */}
          <Route path="/100s" element={<Navigate to="/99s" replace />} />
          <Route path="/90s"  element={<Navigate to="/99s" replace />} />
          <Route path="/squads" element={<MissionsHome />} />
          <Route path="/quicktask" element={<Navigate to="/30s" replace />} />
          <Route path="/fb" element={<Navigate to="/30s" replace />} />
          <Route path="/quicktask-legacy" element={<QuickTasksPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          {/* 2026-05-11 (CJ): /brands is now the manager dashboard.
              Old single-brand editor moved to /brands/edit?b=:id */}
          <Route path="/brands" element={<BrandsManagePage />} />
          <Route path="/brands/edit" element={<BrandsPage />} />
          <Route path="/boardroom" element={<BoardroomPage />} />
          <Route path="/playbooks" element={<PlaybooksPage />} />
          <Route path="/theater"   element={<TheaterPage />} />
          <Route path="/m/:missionId" element={<MissionRedirect />} />
          <Route path="/b/:brandId/:workspace/m/:missionId" element={<MissionRedirect />} />
          <Route path="/templates" element={<MethodologyCatalog />} />
          <Route path="/templates/:slug" element={<MethodologyDetail />} />
          <Route path="/squad-mockups" element={<SquadMockupsGalleryPage />} />
          <Route path="/admin/squads" element={<SquadLabPage />} />
          {/* 2026-05-11 — error tracking dashboard. adminProcedure-gated on
              server; non-admins see a friendly FORBIDDEN screen. */}
          <Route path="/admin/errors" element={<AdminErrorsPage />} />
          {/* 2026-05-11 — community template marketplace (Spotify model) */}
          <Route path="/community" element={<CommunityPage />} />
          {/* 2026-05-11 — content calendar (P0-1) */}
          <Route path="/calendar" element={<CalendarPage />} />
          {/* 2026-05-10 account settings + achievements */}
          <Route path="/settings/account" element={<AccountPage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LanguageProvider>
    </AppErrorBoundary>
  );
}
