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
// 2026-05-14 (CJ): retired MissionsHome / MethodologyCatalog / MethodologyDetail /
// PickerWorkspace / BoardroomPage / PlaybooksPage / CommunityPage. Sidebar
// has no entries for these and there are no remaining navigation paths.
import MissionRedirect from "./MissionRedirect";
import ProjectsPage from "../pages/ProjectsPage";
import BrandsPage from "../pages/BrandsPage";
import QuickTask30sPage from "../pages/QuickTask30sPage";
import RunPage from "../pages/RunPage";
import StrategyConsultantPage from "../pages/StrategyConsultantPage";
import TheaterPage from "../pages/TheaterPage";
import SquadMockupsGalleryPage from "../pages/SquadMockupsGalleryPage";
import SquadLabPage from "../pages/admin/SquadLabPage";
// 2026-05-10 (CJ「明天串金流，今天都做」)
import PricingPage from "../pages/PricingPage";
import AccountPage from "../pages/AccountPage";
import AdminSupportPage from "../pages/AdminSupportPage";
import ChangelogPage from "../pages/ChangelogPage";
import WorkspaceSettingsPage from "../pages/WorkspaceSettingsPage";
import TermsPage from "../pages/legal/TermsPage";
import PrivacyPage from "../pages/legal/PrivacyPage";
import RefundPage from "../pages/legal/RefundPage";
import AchievementsPage from "../pages/AchievementsPage";
import BrandsManagePage from "../pages/BrandsManagePage";
import ConnectionsRedirect from "../pages/ConnectionsRedirect";
import BrandSettingsPage from "../pages/BrandSettingsPage";
// 2026-05-11 (CJ「補 Sentry-style error tracking」): admin dashboard for
// auto-captured tRPC / frontend errors. Gated server-side by adminProcedure.
import AdminErrorsPage from "../pages/AdminErrorsPage";
import AdminDashboardPage from "../pages/AdminDashboardPage";
import AdminUserDetailPage from "../pages/AdminUserDetailPage";
import LandingPage from "../pages/LandingPage";
// 2026-05-11 (CJ「P0-1 內容日曆」): vs Buffer
import CalendarPage from "../pages/CalendarPage";
// 2026-05-18 (CJ): media-to-copy feature pages
import PhotoCopyPage from "../pages/media/PhotoCopyPage";
import VideoCopyPage from "../pages/media/VideoCopyPage";
import DocRewritePage from "../pages/media/DocRewritePage";
// 2026-05-26 (CJ「左欄改成平台優先」): platform-first task pages
import PlatformTaskPage from "../pages/PlatformTaskPage";

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
      const fingerprint = `react:${firstLine}`.slice(0, 64); // zod max 64 + VARCHAR(64)
      // Use the trpc proxy directly via fetch (avoids importing the React
      // hook outside a component). The endpoint is publicProcedure so it
      // works pre-login too.
      // 2026-05-16: /trpc (not /api/trpc) + batch wire format — see
      // main.tsx note. Was 404ing → no render errors ever logged.
      // tRPC v11 no-transformer wire format: {"0": <input>} (no json env)
      const body = {
        "0": {
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
      fetch("/trpc/ops.logError?batch=1", {
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
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                style={{ padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
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
              <button
                style={{ padding: "6px 12px", background: "white", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}
                onClick={() => {
                  try { localStorage.clear(); } catch {}
                  try {
                    document.cookie.split(";").forEach((c) => {
                      const eqPos = c.indexOf("=");
                      const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
                      document.cookie = `${name}=;expires=Thu,01 Jan 1970 00:00:00 GMT;path=/`;
                    });
                  } catch {}
                  window.location.replace("/auth/login");
                }}
              >
                清除登入狀態並重新登入
              </button>
              {/* 2026-05-12 pre-launch zombie audit: surface support email
                  even on error-recovery screen — users stuck here have no
                  shell/footer to reach customer service. */}
              <a
                href={`mailto:sowork@sowork.ai?subject=${encodeURIComponent("OnBrand 應用程式錯誤")}&body=${encodeURIComponent("錯誤訊息：\n" + (this.state.error?.message ?? "") + "\n\n頁面：" + window.location.href)}`}
                style={{ marginLeft: "auto", fontSize: 12, color: "#3b82f6", textDecoration: "underline" }}
              >
                聯絡客服 sowork@sowork.ai
              </a>
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

        {/* 2026-05-16 (CJ「主打品牌定位鎖定」): public marketing landing
            at /. Cold traffic used to hit /auth/login directly (funnel
            leak). LandingPage self-redirects authed users to /30s. */}
        <Route path="/" element={<LandingPage />} />

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
          {/* 2026-05-16: public LandingPage now owns "/" and self-redirects
              authed users to /30s, so the old protected "/"→/30s Navigate
              was removed (two routes for "/" is ambiguous in v6). */}
          {/* 2026-05-26 (CJ「左欄改成平台優先」): platform-first routes.
              /tasks/:platform renders PlatformTaskPage with tier tabs inside.
              Old tier routes kept as redirects for backward-compat. */}
          <Route path="/tasks" element={<Navigate to="/tasks/fb" replace />} />
          <Route path="/tasks/:platform" element={<PlatformTaskPage />} />
          {/* Keep old tier routes alive — redirect to FB platform page */}
          <Route path="/30s" element={<Navigate to="/tasks/fb" replace />} />
          <Route path="/60s" element={<Navigate to="/tasks/fb" replace />} />
          <Route path="/99s" element={<Navigate to="/tasks/fb" replace />} />
          <Route path="/100s" element={<Navigate to="/tasks/fb" replace />} />
          <Route path="/90s"  element={<Navigate to="/tasks/fb" replace />} />
          <Route path="/quicktask" element={<Navigate to="/tasks/fb" replace />} />
          <Route path="/fb" element={<Navigate to="/tasks/fb" replace />} />
          {/* 2026-05-09 (CJ): Phase 2 route-based output workspace.
              Replaces modal-based viewing for 60s/100s tasks. URL is
              shareable, browser back works, can multi-tab compare. */}
          <Route path="/run/:outputId" element={<RunPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          {/* 2026-05-11 (CJ): /brands is now the manager dashboard.
              Old single-brand editor moved to /brands/edit?b=:id */}
          <Route path="/brands" element={<BrandsManagePage />} />
          <Route path="/brands/edit" element={<BrandsPage />} />
          {/* 2026-05-12 (CJ「加一個獨立的功能區叫做『連結』」): direct
              entry to brand settings → connector tab. */}
          <Route path="/connections" element={<ConnectionsRedirect />} />
          {/* 2026-05-12 (CJ「不想要變成 modal，想跟品牌頁面一樣」): full-page
              brand settings (replaces the modal sheet for direct navigation). */}
          <Route path="/brands/settings" element={<BrandSettingsPage />} />
          <Route path="/consultant" element={<StrategyConsultantPage />} />
          <Route path="/theater"   element={<TheaterPage />} />
          <Route path="/m/:missionId" element={<MissionRedirect />} />
          <Route path="/b/:brandId/:workspace/m/:missionId" element={<MissionRedirect />} />
          <Route path="/squad-mockups" element={<SquadMockupsGalleryPage />} />
          <Route path="/admin/squads" element={<SquadLabPage />} />
          {/* 2026-05-11 — error tracking dashboard. adminProcedure-gated on
              server; non-admins see a friendly FORBIDDEN screen. */}
          <Route path="/admin/errors" element={<AdminErrorsPage />} />
          {/* 2026-05-16 (CJ「後台監控使用者」) — growth/usage/health dashboard */}
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/user/:id" element={<AdminUserDetailPage />} />
          {/* 2026-05-11 — content calendar (P0-1) */}
          <Route path="/calendar" element={<CalendarPage />} />
          {/* 2026-05-10 account settings + achievements */}
          <Route path="/settings/account" element={<AccountPage />} />
          <Route path="/settings/workspace" element={<WorkspaceSettingsPage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          {/* 2026-05-13 — Layer 3 (admin support inbox) + Layer 5 (public changelog) */}
          <Route path="/admin/support" element={<AdminSupportPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          {/* 2026-05-18 (CJ): media-to-copy routes */}
          <Route path="/media/photo/:channel" element={<PhotoCopyPage />} />
          <Route path="/media/video/:channel" element={<VideoCopyPage />} />
          <Route path="/media/doc" element={<DocRewritePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LanguageProvider>
    </AppErrorBoundary>
  );
}
