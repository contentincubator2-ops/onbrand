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

// ─────────────────────────────────────────────────────────────────────────
// 2026-06-12 (SEO audit perf fix): route-based code splitting.
// Mobile PageSpeed was 55 because every anonymous visitor downloaded the
// whole protected app (TheaterPage, all /admin/*, /tasks/*, /media/*).
// Strategy:
//   - EAGER: critical first-paint surfaces (LandingPage, LoginPage,
//     RegisterPage), the auth shell (RequireAuthV2 / ShellLayout), and
//     small redirect utilities. These ship in the initial bundle.
//   - LAZY: everything else — protected app pages, legal/pricing pages,
//     auth utility pages (verify / forgot / reset). Each becomes its own
//     chunk, fetched only when the user navigates there.
// ─────────────────────────────────────────────────────────────────────────

// ── Eager (first-paint critical) ─────────────────────────────────────────
// Only LandingPage is eager (it's `/` — the SEO entry point and most-
// likely first paint). Everything else, including LoginPage and
// RegisterPage, is split out so anonymous landing visitors don't pay
// for them. The brief Suspense flash on /auth/login is acceptable —
// LoginPage itself shows an authChecking spinner anyway.
import LandingPage from "../pages/LandingPage";
import RequireAuthV2 from "./RequireAuthV2";
import RequireSoworkPreview from "./RequireSoworkPreview";
import ShellLayout from "./shell/ShellLayout";
import MissionRedirect from "./MissionRedirect";
import ConnectionsRedirect from "../pages/ConnectionsRedirect";
import NotFoundPage from "../pages/NotFoundPage";

// ── Lazy (route-split chunks) ────────────────────────────────────────────
// Auth pages — heaviest among public surfaces (Google OAuth SVG, form
// state, password rules), moved out of main bundle.
const LoginPage = React.lazy(() => import("../../pages/auth/LoginPage"));
const RegisterPage = React.lazy(() => import("../../pages/auth/RegisterPage"));
const VerifyEmailPage = React.lazy(() => import("../../pages/auth/VerifyEmailPage"));
const ForgotPasswordPage = React.lazy(() => import("../../pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = React.lazy(() => import("../../pages/auth/ResetPasswordPage"));
const OnboardingWizard = React.lazy(() => import("../../pages/OnboardingWizard"));

// Protected app surface — never loaded by anonymous visitors
const TheaterPage = React.lazy(() => import("../pages/TheaterPage"));
const PlatformTaskPage = React.lazy(() => import("../pages/PlatformTaskPage"));
const DataWorkspacePage = React.lazy(() => import("../pages/DataWorkspacePage"));
const RunPage = React.lazy(() => import("../pages/RunPage"));
const ProjectsPage = React.lazy(() => import("../pages/ProjectsPage"));
const BrandsPage = React.lazy(() => import("../pages/BrandsPage"));
const BrandsManagePage = React.lazy(() => import("../pages/BrandsManagePage"));
const BrandSettingsPage = React.lazy(() => import("../pages/BrandSettingsPage"));
const SquadLabPage = React.lazy(() => import("../pages/admin/SquadLabPage"));
const CalendarPage = React.lazy(() => import("../pages/CalendarPage"));
const AccountPage = React.lazy(() => import("../pages/AccountPage"));
const WorkspaceSettingsPage = React.lazy(() => import("../pages/WorkspaceSettingsPage"));
const ReviewQueuePage = React.lazy(() => import("../pages/ReviewQueuePage"));
const AchievementsPage = React.lazy(() => import("../pages/AchievementsPage"));
const ChangelogPage = React.lazy(() => import("../pages/ChangelogPage"));
const PhotoCopyPage = React.lazy(() => import("../pages/media/PhotoCopyPage"));
const VideoCopyPage = React.lazy(() => import("../pages/media/VideoCopyPage"));
const DocRewritePage = React.lazy(() => import("../pages/media/DocRewritePage"));

// Admin (heaviest — adminProcedure-gated, almost never needed by general traffic)
const AdminErrorsPage = React.lazy(() => import("../pages/AdminErrorsPage"));
const AdminDashboardPage = React.lazy(() => import("../pages/AdminDashboardPage"));
const AdminPostFormatsPage = React.lazy(() => import("../pages/AdminPostFormatsPage"));
const AdminUserDetailPage = React.lazy(() => import("../pages/AdminUserDetailPage"));
const AdminSupportPage = React.lazy(() => import("../pages/AdminSupportPage"));
// 2026-06-21 (CJ「TTFV dashboard」)
const AdminActivationPage = React.lazy(() => import("../pages/AdminActivationPage"));

// Public-but-not-first-paint (legal / pricing / plan-expired)
const PricingPage = React.lazy(() => import("../pages/PricingPage"));
const TermsPage = React.lazy(() => import("../pages/legal/TermsPage"));
const PrivacyPage = React.lazy(() => import("../pages/legal/PrivacyPage"));
const RefundPage = React.lazy(() => import("../pages/legal/RefundPage"));
const PlanExpiredPage = React.lazy(() => import("../pages/PlanExpiredPage"));

// ── Suspense fallback — cream-themed minimal loader matching SoWork.ai ──
function RouteFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F7F2EB",
      }}
      aria-label="Loading"
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "3px solid #EFE7D6",
          borderTopColor: "#E85D2E",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Top-level error boundary — catches any render-time exception that
 * would otherwise blank the entire SPA. Shows the message + stack
 * inline so a "空白畫面" report immediately becomes actionable.
 */
// Same stale-chunk helpers as ShellLayout — duplicated here so AppErrorBoundary
// (the outermost boundary, outside the shell) also auto-recovers without
// importing from ShellLayout and creating a circular dependency.
function isChunkLoadError(err: Error): boolean {
  const text = (err.message ?? "") + " " + (err.stack ?? "");
  return /Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk|Loading CSS chunk|error loading dynamically imported module/i.test(text);
}
function autoReloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem("_chunk_reload_at") ?? 0);
    if (Date.now() - last > 15_000) {
      sessionStorage.setItem("_chunk_reload_at", String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch { /* sessionStorage blocked */ }
  return false;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Stale-chunk auto-recovery: hard-reload once on deployment-induced 404.
    if (isChunkLoadError(error) && autoReloadOnce()) return;
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
            {/* 2026-05-29 (security): hide raw stack trace in production — leaks file
                paths and internal class names. Dev mode still shows it for debugging. */}
            {import.meta.env.DEV && (
              <pre style={{ marginTop: 12, padding: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap" }}>
                {this.state.error.stack}
              </pre>
            )}
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
      <React.Suspense fallback={<RouteFallback />}>
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
            leak). LandingPage self-redirects authed users to /theater. */}
        <Route path="/" element={<LandingPage />} />

        {/* 2026-05-10: Public legal + pricing pages (no auth required so
            unregistered prospects can read T&C / Privacy / Refund + see pricing) */}
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refund" element={<RefundPage />} />

        {/* Plan expired — accessible without full auth gate so expired users
            can see the upgrade page instead of being stuck in a redirect loop */}
        <Route path="/plan-expired" element={<PlanExpiredPage />} />

        {/* Onboarding kept */}
        <Route
          path="/onboarding"
          element={
            <RequireAuthV2>
              <OnboardingWizard onComplete={() => (window.location.href = "/theater")} />
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
          {/* 2026-05-26 (CJ「左欄改成平台優先」): platform-first routes.
              /tasks/:platform renders PlatformTaskPage with tier tabs inside. */}
          <Route path="/tasks" element={<Navigate to="/tasks/fb" replace />} />
          <Route path="/tasks/:platform" element={<PlatformTaskPage />} />
          <Route path="/performance" element={<DataWorkspacePage />} />
          <Route path="/performance/:sourceId" element={<DataWorkspacePage />} />
          {/* 2026-09-07 市場數據層只給 sowork.tw 預覽群。導覽早就藏了，
              但路由沒守門 —— 直接打網址就進得去，藏一半等於沒藏。 */}
          <Route path="/market-intel" element={<RequireSoworkPreview><DataWorkspacePage /></RequireSoworkPreview>} />
          <Route path="/market-intel/:sourceId" element={<RequireSoworkPreview><DataWorkspacePage /></RequireSoworkPreview>} />
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
          <Route path="/theater"   element={<TheaterPage />} />
          <Route path="/m/:missionId" element={<MissionRedirect />} />
          <Route path="/b/:brandId/:workspace/m/:missionId" element={<MissionRedirect />} />
          <Route path="/admin/squads" element={<SquadLabPage />} />
          {/* 2026-05-11 — error tracking dashboard. adminProcedure-gated on
              server; non-admins see a friendly FORBIDDEN screen. */}
          <Route path="/admin/errors" element={<AdminErrorsPage />} />
          {/* 2026-05-16 (CJ「後台監控使用者」) — growth/usage/health dashboard */}
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/user/:id" element={<AdminUserDetailPage />} />
          {/* 2026-06-21 (CJ「TTFV dashboard」) — register→first-week funnel */}
          <Route path="/admin/activation" element={<AdminActivationPage />} />
          {/* 2026-08-23 (CJ「安排定期任務掃描當地熱門的 facebook 貼文，補充為 task」)
              — 每月掃描產出的貼文形式候選佇列，核准後才照 SOP 開卡 */}
          <Route path="/admin/post-formats" element={<AdminPostFormatsPage />} />
          {/* 2026-05-11 — content calendar (P0-1) */}
          <Route path="/calendar" element={<CalendarPage />} />
          {/* 2026-05-10 account settings + achievements */}
          <Route path="/settings/account" element={<AccountPage />} />
          <Route path="/settings/workspace" element={<WorkspaceSettingsPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          {/* 2026-05-13 — Layer 3 (admin support inbox) + Layer 5 (public changelog) */}
          <Route path="/admin/support" element={<AdminSupportPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          {/* 2026-05-18 (CJ): media-to-copy routes */}
          <Route path="/media/photo/:channel" element={<PhotoCopyPage />} />
          <Route path="/media/video/:channel" element={<VideoCopyPage />} />
          <Route path="/media/doc" element={<DocRewritePage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </React.Suspense>
    </LanguageProvider>
    </AppErrorBoundary>
  );
}
