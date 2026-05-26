/**
 * LoginPage.tsx — Email/password + Google OAuth login
 */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useLang } from "../../lib/i18n";

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
  const navigate = useNavigate();

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
      if (!r.ok) setResendMsg(d.error || "重發失敗，請稍後再試");
      else       setResendMsg(d.message || "驗證信已寄出，請檢查信箱");
    } catch {
      setResendMsg("網路錯誤，請稍後再試");
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
        setError(data.error || t("auth_err_wrong_creds"));
        if (res.status === 403 && data.needsVerification) {
          setNeedsVerification(true);
        }
        return;
      }

      // Wait for cookie to be set
      await new Promise(resolve => setTimeout(resolve, 500));
      window.location.href = "/theater";
    } catch (err) {
      setError(t("auth_err_network"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    window.location.href = "/api/auth/google";
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-center px-16 w-1/2" style={{ background: "linear-gradient(160deg, #6C5CE7 0%, #a29bfe 100%)" }}>
        <div className="text-white">
          <div className="text-4xl font-bold mb-3">{lang === "en" ? "OnBrand" : "OnBrand · 對版"}</div>
          <div className="text-xl opacity-80 mb-8">
            {lang === "en"
              ? "Always on-brand. Your AI marketing studio."
              : "永遠 on-brand · 你的 AI 行銷工作室"}
          </div>
          <ul className="space-y-4 text-sm opacity-90">
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              {lang === "en"
                ? "168 tasks, each backed by an award-winning or market-proven case"
                : "168 個任務，每個內建獨立得獎工藝案例"}
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              {lang === "en"
                ? "FB · IG · TikTok · YouTube · Email · PR · Brand Strategy — all channels"
                : "FB、IG、TikTok、YouTube、EDM、PR、品牌策略全管道"}
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              {lang === "en"
                ? "Brand positioning set once — A2A strategy to execution, always on-brand"
                : "品牌定位一鍵鎖定，A2A 策略到執行永遠 on-brand"}
            </li>
          </ul>
          {/* Language toggle on auth pages (pre-login users can't reach S-menu) */}
          <button
            onClick={() => setLang(lang === "en" ? "zh-TW" : "en")}
            className="mt-10 text-xs opacity-70 hover:opacity-100 underline transition"
          >
            {lang === "en" ? "切換為繁體中文" : "Switch to English"}
          </button>
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-8">
        {/* Mobile-only brand strip (hidden on desktop where left panel shows) */}
        <div className="lg:hidden w-full max-w-md mb-6 pt-8">
          <div className="flex items-center justify-between mb-1">
            <span className="text-base font-bold text-gray-900">OnBrand</span>
            <button
              onClick={() => setLang(lang === "en" ? "zh-TW" : "en")}
              className="text-xs text-gray-400 hover:text-gray-600 underline transition"
            >
              {lang === "en" ? "繁體中文" : "English"}
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-3">
            {lang === "en"
              ? "168 award-craft tasks · All channels · Always on-brand"
              : "168 個得獎工藝任務 · 全管道 · 永遠 on-brand"}
          </p>
          <Link
            to="/auth/register"
            className="inline-block text-xs font-semibold px-3 py-1.5 rounded-full text-white"
            style={{ background: "linear-gradient(90deg, #6C5CE7, #a29bfe)" }}
          >
            {lang === "en" ? "Start free trial →" : "開始免費試用 →"}
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("auth_login_title")}</h1>
            <p className="text-gray-400 text-sm">{t("auth_login_subtitle")}</p>
          </div>

          {/* Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
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

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-400">{lang === "en" ? "or" : "或"}</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t("auth_email_label")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth_email_placeholder")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t("auth_password_label")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
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
              <div className="flex flex-col gap-2 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-red-600">
                  <span>⚠</span> {error}
                </div>
                {needsVerification && (
                  <div className="flex flex-col gap-1.5 pl-6">
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resendBusy || !email}
                      className="self-start text-xs font-medium px-3 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {resendBusy
                        ? (lang === "en" ? "Sending…" : "寄送中…")
                        : (lang === "en" ? "Resend verification email" : "重新寄送驗證信")}
                    </button>
                    {resendMsg && (
                      <span className="text-xs text-default-600">{resendMsg}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <Link to="/auth/forgot-password" className="text-indigo-500 hover:text-indigo-700">
                {t("auth_forgot_password")}
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading ? "#d1cbf8" : "linear-gradient(90deg, #6C5CE7, #a29bfe)",
                color: "white",
                boxShadow: loading ? "none" : "0 4px 12px rgba(108,92,231,0.35)",
              }}
            >
              {loading ? t("auth_login_busy") : t("auth_login_btn")}
            </button>

            <p className="text-center text-xs text-gray-400">
              {t("auth_no_account")}
              <Link to="/auth/register" className="text-indigo-500 hover:text-indigo-700 ml-1 underline">
                {t("auth_create_account")}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
