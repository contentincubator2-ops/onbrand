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
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import LandingPage from "../platform/pages/LandingPage";
import RequireAuthV2 from "./RequireAuthV2";
import ShellLayout from "./shell/ShellLayout";
import MissionRedirect from "./MissionRedirect";
import ConnectionsRedirect from "../platform/pages/ConnectionsRedirect";
import NotFoundPage from "../platform/pages/NotFoundPage";

// ── Lazy (route-split chunks) ────────────────────────────────────────────
// Auth pages — heaviest among public surfaces (Google OAuth SVG, form
// state, password rules), moved out of main bundle.
const LoginPage = React.lazy(() => import("../../pages/auth/LoginPage"));
const RegisterPage = React.lazy(() => import("../../pages/auth/RegisterPage"));
const VerifyEmailPage = React.lazy(() => import("../../pages/auth/VerifyEmailPage"));
const ForgotPasswordPage = React.lazy(() => import("../../pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = React.lazy(() => import("../../pages/auth/ResetPasswordPage"));
const OnboardingWizard = React.lazy(() => import("../../pages/OnboardingWizard"));

// 2026-09-16 (Dallas show): Sales Hub concept demo — own shell, English-first.
const ForSalesPage = React.lazy(() => import("../platform/pages/ForSalesPage"));
const HubShell = React.lazy(() => import("../hub/HubShell"));
const HubOverviewPage = React.lazy(() => import("../hub/pages/HubOverviewPage"));
const HubRepsPage = React.lazy(() => import("../hub/pages/HubRepsPage"));
const HubRepViewPage = React.lazy(() => import("../hub/pages/HubRepViewPage"));
const HubStrategyBrandPage = React.lazy(() => import("../hub/pages/strategy/StrategyBrandPage"));
const HubStrategyProductsPage = React.lazy(() => import("../hub/pages/strategy/StrategyProductsPage"));
const HubStrategyWordingPage = React.lazy(() => import("../hub/pages/strategy/StrategyWordingPage"));
const HubStrategyRegulationsPage = React.lazy(() => import("../hub/pages/strategy/StrategyRegulationsPage"));
const HubStrategyFactsPage = React.lazy(() => import("../hub/pages/strategy/StrategyFactsPage"));
const HubTasksPage = React.lazy(() => import("../hub/pages/content/HubTasksPage"));
const HubRunPage = React.lazy(() => import("../hub/pages/content/HubRunPage"));
const HubContentSkillsPage = React.lazy(() => import("../hub/pages/content/ContentSkillsPage"));
const HubContentCheckerPage = React.lazy(() => import("../hub/pages/content/ContentCheckerPage"));
const HubContentPoliciesPage = React.lazy(() => import("../hub/pages/content/ContentPoliciesPage"));
const HubPerformancePage = React.lazy(() => import("../hub/pages/HubPerformancePage"));
const HubPerformanceLeaderboardPage = React.lazy(() => import("../hub/pages/performance/PerformanceLeaderboardPage"));
const HubPerformancePostsPage = React.lazy(() => import("../hub/pages/performance/PerformancePostsPage"));
const HubScanPage = React.lazy(() => import("../hub/pages/ScanPage"));
const BoothStylePage = React.lazy(() => import("../hub/pages/BoothStylePage"));
const HubLiffWritePage = React.lazy(() => import("../hub/pages/LiffWritePage"));
const HubLiffSharePage = React.lazy(() => import("../hub/pages/LiffSharePage"));
const isHubHost = typeof window !== "undefined" && window.location.hostname.startsWith("experthub.");

// 2026-09-16 (CJ「login 之後找不到 experthub」): on the demo host, login lands on
// /theater like the rest of OnBrand. Anything outside the demo's own routes
// goes to /hub instead, so the booth never shows the OnBrand app.
const HUB_HOST_PATHS = ["/hub", "/scan/", "/liff/", "/booth/", "/auth/", "/login", "/plan-expired", "/for-sales"];
function HubHostGuard() {
  const { pathname } = useLocation();
  if (!isHubHost || HUB_HOST_PATHS.some((p) => pathname === p || pathname.startsWith(p))) return null;
  return <Navigate to="/hub" replace />;
}

// Protected app surface — never loaded by anonymous visitors
const HomePage = React.lazy(() => import("../platform/pages/HomePage"));
const TheaterPage = React.lazy(() => import("../content/pages/TheaterPage"));
const PlatformTaskPage = React.lazy(() => import("../content/pages/PlatformTaskPage"));
const DataWorkspacePage = React.lazy(() => import("../performance/pages/DataWorkspacePage"));
const RunPage = React.lazy(() => import("../content/pages/RunPage"));
const ProjectsPage = React.lazy(() => import("../content/pages/ProjectsPage"));
const BrandsPage = React.lazy(() => import("../strategy/pages/BrandsPage"));
const BrandsManagePage = React.lazy(() => import("../strategy/pages/BrandsManagePage"));
const BrandSettingsPage = React.lazy(() => import("../strategy/pages/BrandSettingsPage"));
const SquadLabPage = React.lazy(() => import("../platform/pages/admin/SquadLabPage"));
const CalendarPage = React.lazy(() => import("../content/pages/CalendarPage"));
const AccountPage = React.lazy(() => import("../platform/pages/AccountPage"));
const WorkspaceSettingsPage = React.lazy(() => import("../platform/pages/WorkspaceSettingsPage"));
const ReviewQueuePage = React.lazy(() => import("../platform/pages/ReviewQueuePage"));
const ChangelogPage = React.lazy(() => import("../platform/pages/ChangelogPage"));

// Admin (heaviest — adminProcedure-gated, almost never needed by general traffic)
const AdminErrorsPage = React.lazy(() => import("../platform/pages/AdminErrorsPage"));
const AdminDashboardPage = React.lazy(() => import("../platform/pages/AdminDashboardPage"));
const AdminPostFormatsPage = React.lazy(() => import("../platform/pages/AdminPostFormatsPage"));
const AdminUserDetailPage = React.lazy(() => import("../platform/pages/AdminUserDetailPage"));
const AdminSupportPage = React.lazy(() => import("../platform/pages/AdminSupportPage"));
// 2026-06-21 (CJ「TTFV dashboard」)
const AdminActivationPage = React.lazy(() => import("../platform/pages/AdminActivationPage"));

// Public-but-not-first-paint (legal / pricing / plan-expired)
const PricingPage = React.lazy(() => import("../platform/pages/PricingPage"));
const TermsPage = React.lazy(() => import("../platform/pages/legal/TermsPage"));
const PrivacyPage = React.lazy(() => import("../platform/pages/legal/PrivacyPage"));
const RefundPage = React.lazy(() => import("../platform/pages/legal/RefundPage"));
const PlanExpiredPage = React.lazy(() => import("../platform/pages/PlanExpiredPage"));

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

/**
 * 這個分頁載入的是不是已經被換掉的版本。
 *
 * 2026-09-23：CJ 在法規頁看到「s.filter is not a function」。不是偶發，是**版本
 * 錯位**：他的分頁在部署前就開著，舊的 StrategyRegulationsPage chunk 已經在記憶體
 * 裡，而伺服器上的 API 已經換成新的回傳形狀（陣列 → `{items, coverage}`）。
 * 舊程式碼 `const all = q.data ?? []` 拿到的是物件，`all.filter` 自然不存在。
 *
 * 上面那個 isChunkLoadError 蓋不到這一種：chunk 沒有載入失敗，它老早就載好了。
 * 壞掉的是**資料**，而且錯誤看起來跟一般的程式 bug 一模一樣。
 *
 * 所以要一個能分辨兩者的訊號，而不是猜。最準的訊號就是：**伺服器現在發的
 * index.html 裡，還有沒有這個分頁當初載入的那支進入點檔案。**沒有 → 版本換過了
 * → 重新整理一定能修好。有 → 那是真的 bug，不該把它洗掉。
 *
 * 不需要任何建置期的版本號插值：Vite 的進入點檔名本身就帶內容雜湊。
 */
function currentEntryFile(): string | null {
  try {
    const s = document.querySelector('script[type="module"][src]') as HTMLScriptElement | null;
    return s?.src.split("/").pop() ?? null;
  } catch {
    return null;
  }
}

async function buildHasChanged(): Promise<boolean> {
  const mine = currentEntryFile();
  if (!mine) return false;
  try {
    const html = await fetch("/index.html", { cache: "no-store" }).then((r) => (r.ok ? r.text() : ""));
    // 抓不到就當作沒換 —— 網路不通不該觸發重新整理迴圈。
    return html.length > 0 && !html.includes(mine);
  } catch {
    return false;
  }
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
    // 版本錯位的自動復原：這個分頁載入的進入點已經不在伺服器發的 index.html 裡，
    // 代表部署過了，重新整理一定能修好。查得到就重整一次，查不到就照常往下走
    // （回報 + 顯示錯誤畫面），因為那時候它就是一個真的 bug。
    void buildHasChanged().then((stale) => { if (stale) autoReloadOnce(); });
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

/**
 * 「新版本已上線」的小提示。
 *
 * 2026-09-23：錯誤邊界現在會在版本錯位時自動重新整理，但那是**事後**——使用者
 * 還是會先看到一瞬間的紅色錯誤畫面。展場上那一瞬間就夠難看了。
 *
 * 所以在它壞掉之前先問一次。刻意不自動重整：使用者可能正在打字或填表單，
 * 替他重整會弄丟東西。給一個按鈕，他自己決定什麼時候。
 */
function NewBuildNotice() {
  const { pathname } = useLocation();
  const [stale, setStale] = React.useState(false);
  const lastCheck = React.useRef(0);

  React.useEffect(() => {
    if (stale) return;
    // 每次換頁查一次，但最多 60 秒一次 —— 這是一個 HTML 檔，不是免費，但也不貴。
    if (Date.now() - lastCheck.current < 60_000) return;
    lastCheck.current = Date.now();
    let alive = true;
    void buildHasChanged().then((changed) => { if (alive && changed) setStale(true); });
    return () => { alive = false; };
  }, [pathname, stale]);

  if (!stale) return null;
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      style={{
        position: "fixed", right: 16, bottom: 16, zIndex: 9999,
        display: "inline-flex", alignItems: "center", gap: 8,
        background: "#171717", color: "white", border: "none",
        borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 500,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)", cursor: "pointer",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: "#4ADE80" }} aria-hidden />
      新版本已上線 · 點這裡重新整理
    </button>
  );
}

export default function AppV2() {
  return (
    <AppErrorBoundary>
    <LanguageProvider>
      <React.Suspense fallback={<RouteFallback />}>
      <NewBuildNotice />
      <HubHostGuard />
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
        <Route path="/" element={isHubHost ? <Navigate to="/hub" replace /> : <LandingPage />} />

        {/* Sales Hub — public: tracked-link landing + LIFF pages opened inside LINE */}
        <Route path="/scan/:code" element={<HubScanPage />} />
        {/* 展場訪客貼自己文章的地方。網址裡的 token 就是身分，不需要登入。 */}
        <Route path="/booth/style/:token" element={<BoothStylePage />} />
        <Route path="/liff/write" element={<HubLiffWritePage />} />
        <Route path="/liff/share" element={<HubLiffSharePage />} />
        {/* Sales Hub — HQ / marketing admin */}
        <Route element={<RequireAuthV2><HubShell /></RequireAuthV2>}>
          {/* 總管理 HQ */}
          <Route path="/hub" element={<HubOverviewPage />} />
          <Route path="/hub/reps" element={<HubRepsPage />} />
          <Route path="/hub/rep-view" element={<HubRepViewPage />} />
          {/* 策略 Strategy tray */}
          <Route path="/hub/strategy" element={<Navigate to="/hub/strategy/brand" replace />} />
          <Route path="/hub/strategy/brand" element={<HubStrategyBrandPage />} />
          <Route path="/hub/strategy/products" element={<HubStrategyProductsPage />} />
          <Route path="/hub/strategy/wording" element={<HubStrategyWordingPage />} />
          {/* 2026-09-23：正面用詞與禁用詞併成一個 tray。舊網址導過去，不留死連結
              —— 這兩個位址被分享過，包括 CJ 自己貼過的那一個。 */}
          <Route path="/hub/strategy/preferred" element={<Navigate to="/hub/strategy/wording" replace />} />
          <Route path="/hub/strategy/banned" element={<Navigate to="/hub/strategy/wording" replace />} />
          <Route path="/hub/strategy/regulations" element={<HubStrategyRegulationsPage />} />
          <Route path="/hub/strategy/facts" element={<HubStrategyFactsPage />} />
          {/* 內容 Content tray */}
          <Route path="/hub/content" element={<Navigate to="/hub/tasks/facebook" replace />} />
          <Route path="/hub/tasks/:channel" element={<HubTasksPage />} />
          <Route path="/hub/run/:postId" element={<HubRunPage />} />
          <Route path="/hub/content/skills" element={<HubContentSkillsPage />} />
          <Route path="/hub/content/checker" element={<HubContentCheckerPage />} />
          <Route path="/hub/content/policies" element={<HubContentPoliciesPage />} />
          {/* 成效 Results tray */}
          <Route path="/hub/performance" element={<HubPerformancePage />} />
          <Route path="/hub/performance/leaderboard" element={<HubPerformanceLeaderboardPage />} />
          <Route path="/hub/performance/posts" element={<HubPerformancePostsPage />} />
        </Route>

        {/* 2026-05-10: Public legal + pricing pages (no auth required so
            unregistered prospects can read T&C / Privacy / Refund + see pricing) */}
        <Route path="/pricing" element={<PricingPage />} />
        {/* 2026-09-18 (CJ「面對行銷人的 onbrand，以及面對銷售的 onbrand」): 業務版分眾頁 */}
        <Route path="/for-sales" element={<ForSalesPage />} />
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
              <OnboardingWizard onComplete={() => (window.location.href = "/home")} />
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
          <Route path="/home"      element={<HomePage />} />
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
          {/* 2026-05-10 account settings */}
          <Route path="/settings/account" element={<AccountPage />} />
          <Route path="/settings/workspace" element={<WorkspaceSettingsPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          {/* 2026-05-13 — Layer 3 (admin support inbox) + Layer 5 (public changelog) */}
          <Route path="/admin/support" element={<AdminSupportPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </React.Suspense>
    </LanguageProvider>
    </AppErrorBoundary>
  );
}
