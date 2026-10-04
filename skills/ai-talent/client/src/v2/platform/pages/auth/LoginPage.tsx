/**
 * LoginPage.tsx — Email/password + Google OAuth login
 *
 * 2026-06-12 (CJ direction「插畫風格參考 www.sowork.ai」):
 *   Restyled to match SoWork.ai's editorial-illustration visual language —
 *   warm cream background, orange accents, heavy black headlines, thick
 *   black-bordered cards. Mirrors LandingPage / RegisterPage palette.
 *
 * 2026-06-01 fix: if the user is already authenticated, redirect to "/" instead
 * of showing the login form. Mirrors the same guard added to RegisterPage so
 * Google-OAuth users who navigate here directly are sent straight to the app.
 */

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useLang } from "../../../../lib/i18n";
import { WarningIcon } from "../../components/icons";

// ── SoWork.ai design tokens (single source of truth) ────────────────────
const C = {
  cream: "#FAFAFA",
  ink: "#0F0F0E",
  inkSoft: "#3A3633",
  muted: "#6B6660",
  orange: "#18181B",
  orangeDark: "#3F3F46",
  orangeChip: "#F4F4F5",
  border: "#D4D4D8",
  borderSoft: "#E4E4E7",
  white: "#FFFFFF",
};

/**
 * 2026-09-28（onBrand Studio 連接器）：Claude 連接 onBrand Studio 時會先把人帶到 /api/mcp-oauth/authorize，
 * 沒登入就轉來這裡並帶 ?next=。登入後要回到那個授權頁，否則使用者會落在 /planner、連接流程斷掉。
 * 只放行授權頁這一條路徑 —— 通用的 next 等於開放轉址。伺服器端（Google 回呼）有同一條規則。
 */
function oauthNextPath(): string | null {
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  return /^\/api\/mcp-oauth\/authorize(\?|$)/.test(next) ? next : null;
}

export default function LoginPage() {
  const { t, lang, setLang } = useLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // 2026-05-08 (P0-B): when login returns 403 needsVerification, show
  // a "重發驗證信" CTA so user can recover without re-registering.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [authChecking, setAuthChecking] = useState(true);
  const navigate = useNavigate();

  // If already logged in, skip straight to the app.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          const next = oauthNextPath();
          if (next) window.location.href = next;
          else navigate("/planner", { replace: true });
        }
        else setAuthChecking(false);
      })
      .catch(() => { if (!cancelled) setAuthChecking(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResendVerification = async () => {
    if (!email) return;
    setResendBusy(true); setResendMsg("");
    try {
      const r = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!r.ok) setResendMsg(d.error || (lang === "en" ? "Couldn't resend — please try again later" : "重發失敗，請稍後再試"));
      else       setResendMsg(d.message || (lang === "en" ? "Verification email sent — please check your inbox" : "驗證信已寄出，請檢查信箱"));
    } catch {
      setResendMsg(lang === "en" ? "Network error — please try again later" : "網路錯誤，請稍後再試");
    } finally {
      setResendBusy(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError("");
    setNeedsVerification(false);
    setResendMsg("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError((typeof data.error === "string" ? data.error : data.error?.message) || t("auth_err_wrong_creds"));
        if (res.status === 403 && data.needsVerification) {
          setNeedsVerification(true);
        }
        return;
      }

      // Wait for cookie to be set
      await new Promise(resolve => setTimeout(resolve, 500));
      window.location.href = oauthNextPath() ?? "/planner";
    } catch (err) {
      setError(t("auth_err_network"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    // Google 登入會離開本站再回到 /api/auth/google/callback，next 只能靠短效 cookie 帶過去。
    const next = oauthNextPath();
    if (next) document.cookie = `ob_oauth_next=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`;
    window.location.href = "/api/auth/google";
  };

  // Show spinner while auth check is in-flight (avoids flashing the login
  // form to users who are already authenticated).
  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.cream }}>
        <div
          className="w-7 h-7 rounded-full animate-spin"
          style={{ border: `3px solid ${C.borderSoft}`, borderTopColor: C.orange }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: C.cream }}>
      {/* ── Right: login panel (45%) ─────────────────────────────── */}
      <div className="flex flex-col justify-center items-center w-full px-8 py-10" style={{ background: C.cream }}>
        {/* Mobile-only brand strip */}
        <div className="lg:hidden w-full max-w-md mb-6 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <svg width="18" height="22" viewBox="0 0 24 28" fill="none" aria-hidden>
                <path d="M12 2 C 16 8, 22 14, 22 19 A 10 10 0 0 1 2 19 C 2 14, 8 8, 12 2 Z" fill={C.orange} stroke={C.ink} strokeWidth="2.2" strokeLinejoin="round" />
              </svg>
              <span className="text-[15px] font-extrabold" style={{ color: C.ink }}>
                onBrand <span style={{ color: C.orange }}>Studio</span>
              </span>
            </div>
            <button
              onClick={() => setLang(lang === "en" ? "zh-TW" : "en")}
              className="text-xs underline transition hover:opacity-70"
              style={{ color: C.muted }}
            >
              {lang === "en" ? "繁體中文" : "English"}
            </button>
          </div>
        </div>

        <div className="w-full max-w-md">
          {/* Apply CTA — primary entry for new visitors */}
          <Link
            to="/auth/register"
            className="block w-full text-center rounded-xl py-3.5 text-[15px] font-bold mb-2 transition-transform hover:-translate-y-0.5"
            style={{
              background: C.orange,
              color: C.white,
              boxShadow: `0 6px 0 ${C.orangeDark}`,
            }}
          >
            {lang === "en" ? "Start free →" : "免費開始 →"}
          </Link>
          <p className="text-center text-[12px] mb-6" style={{ color: C.muted }}>
            {lang === "en" ? "No credit card. 14-step positioning takes ~10 minutes." : "免信用卡 · 14 步定位流程約 10 分鐘完成"}
          </p>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full" style={{ borderTop: `1px solid ${C.border}` }} />
            </div>
            <div className="relative flex justify-center">
              <span
                className="px-3 text-[12px] uppercase tracking-[0.2em] font-bold"
                style={{ background: C.cream, color: C.muted }}
              >
                {lang === "en" ? "Already a member" : "已有帳號"}
              </span>
            </div>
          </div>

          {/* Login card */}
          <div
            className="rounded-2xl p-8 w-full"
            style={{
              background: C.white,
              border: `2px solid ${C.ink}`,
              boxShadow: `6px 6px 0 ${C.ink}`,
            }}
          >
            <div className="mb-6">
              <h2 className="text-xl font-black" style={{ color: C.ink, letterSpacing: "-0.01em" }}>
                {t("auth_login_title")}
              </h2>
            </div>

            {/* Google Login Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                border: `1.5px solid ${C.ink}`,
                color: C.ink,
                background: C.white,
              }}
            >
              {googleLoading ? (
                <>
                  <div
                    className="w-5 h-5 rounded-full animate-spin"
                    style={{ border: `2px solid ${C.border}`, borderTopColor: C.orange }}
                  />
                  {lang === "en" ? "Connecting…" : "連接中…"}
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {lang === "en" ? "Continue with Google" : "使用 Google 繼續"}
                </>
              )}
            </button>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full" style={{ borderTop: `1px solid ${C.border}` }} />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2" style={{ background: C.white, color: C.muted }}>
                  {lang === "en" ? "or" : "或"}
                </span>
              </div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>
                  {t("auth_email_label")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth_email_placeholder")}
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors"
                  style={{ border: `1.5px solid ${C.border}`, background: C.white, color: C.ink }}
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>
                  {t("auth_password_label")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none transition-colors"
                    style={{ border: `1.5px solid ${C.border}`, background: C.white, color: C.ink }}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: C.muted }}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  className="flex flex-col gap-2 text-sm rounded-lg px-3 py-2"
                  style={{ background: "#F4F4F5", border: `1.5px solid ${C.orange}` }}
                >
                  <div className="flex items-center gap-2" style={{ color: C.orangeDark }}>
                    <WarningIcon size={14} /> {error}
                  </div>
                  {needsVerification && (
                    <div className="flex flex-col gap-1.5 pl-6">
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendBusy || !email}
                        className="self-start text-xs font-bold px-3 py-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition"
                        style={{ background: C.orange, color: C.white }}
                      >
                        {resendBusy
                          ? (lang === "en" ? "Sending…" : "寄送中…")
                          : (lang === "en" ? "Resend verification email" : "重新寄送驗證信")}
                      </button>
                      {resendMsg && (
                        <span className="text-xs" style={{ color: C.inkSoft }}>{resendMsg}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <Link to="/auth/forgot-password" className="hover:opacity-70 underline" style={{ color: C.orange }}>
                  {t("auth_forgot_password")}
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full rounded-lg py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{
                  background: C.orange,
                  color: C.white,
                  boxShadow: loading ? "none" : `0 4px 0 ${C.orangeDark}`,
                }}
              >
                {loading ? t("auth_login_busy") : t("auth_login_btn")}
              </button>
            </form>
          </div>

          {/* Trust footer */}
          <p className="text-center text-[12px] mt-6 leading-relaxed" style={{ color: C.muted }}>
            {lang === "en"
              ? "By continuing you agree to our Terms & Privacy. SoWork × onBrand Studio"
              : "繼續即代表同意《服務條款》與《隱私政策》。SoWork × onBrand Studio"}
          </p>
        </div>
      </div>
    </div>
  );
}
